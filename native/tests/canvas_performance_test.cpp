#include "canvas_renderer.h"
#include "layer_compositor.h"
#include "os/skia/skia_surface.h"
#include "ui/paint.h"
#include "os/sampling.h"
#include <algorithm>
#include <chrono>
#include <iostream>
#include <stdexcept>

using namespace moon;
using Clock=std::chrono::steady_clock;
static void require(bool value,const char* message){if(!value)throw std::runtime_error(message);}
static Document fixture(int size,int layers,int frames){
  timeline::State state;
  for(int l=0;l<layers;++l)state.layers.push_back({"L"+std::to_string(l),U"Layer"});
  for(int f=0;f<frames;++f)state.frames.push_back({"F"+std::to_string(f),100});
  for(const auto& l:state.layers)for(const auto& f:state.frames){
    timeline::Cel c;c.id=l.id+f.id;c.layerId=l.id;c.frameId=f.id;
    timeline::Surface s;s.width=s.height=size;s.pixels.resize(std::size_t(size)*size);
    for(std::size_t i=0;i<s.pixels.size();++i)s.pixels[i]=(Pixel(i%256)<<24)|Pixel((i*7919)&0xffffff);
    c.surface=std::move(s);state.cels.push_back(std::move(c));
  }
  return Document::fromImported(size,size,std::move(state),{},"benchmark",U"Benchmark",std::make_shared<const std::vector<std::uint8_t>>());
}
static void strokeRecorderOracle(){
  for(auto shape:{BrushShape::Round,BrushShape::Square,BrushShape::Line})for(bool erase:{false,true})for(bool symmetry:{false,true}){
    auto doc=Document::fromImage(128,128,std::vector<Pixel>(128*128,0x80664422),U"recorder oracle");
    doc.symmetryAxes.horizontal=symmetry;doc.symmetryAxes.vertical=symmetry;
    doc.commitSelection({},SelectionMask{5,3,112,119,{}});
    const BrushOptions brush{64,50,shape};const Pixel ink=erase?0:0x8054aacc;const auto before=doc.pixels();
    std::vector<Point> points{{2,2},{120,101},{9,113},{113,4},{4,113},{113,4},{127,127}};
    auto expected=before;std::unordered_map<std::size_t,Pixel> touched;
    for(std::size_t i=0;i<points.size();++i){const auto segment=doc.brushPreview(i?points[i-1]:points[i],points[i],ink,brush);for(const auto& item:segment)touched.emplace(item);}
    for(const auto& item:touched)expected[item.first]=item.second;
    auto run=[&]{doc.beginStroke(points.front(),ink,brush);for(auto point:points){doc.updateStroke(point);const auto revision=doc.contentRevision();doc.updateStroke(point);require(doc.contentRevision()==revision,"Duplicate pointer sample changed content");}};
    run();require(doc.pixels()==expected,"Compact stroke differs from scalar preview oracle");
    const auto baseline=doc.strokeBaseline();const auto compact=doc.strokeBaselinePoints();std::unordered_map<std::size_t,Pixel> restored(compact.begin(),compact.end());require(restored==baseline,"Compact Shift baseline differs");
    doc.cancelStroke();require(doc.pixels()==before,"Compact stroke cancel mismatch");run();require(doc.commitStroke(),"Compact stroke failed commit");doc.undo();require(doc.pixels()==before,"Compact stroke undo mismatch");doc.redo();require(doc.pixels()==expected,"Compact stroke redo mismatch");
    auto copy=doc;copy.beginStroke({50,50},0xff123456,brush);copy.cancelStroke();require(copy.pixels()==doc.pixels(),"Copy reused another document lookup");
  }
}
static void pixelOracle(){
  auto doc=fixture(256,1,1);CanvasRenderer renderer;renderer.sync(doc);
  auto reference=os::instance()->makeRgbaSurface(256,256);
  const auto& pixels=doc.displayPixels();
  for(int y=0;y<256;++y)for(int x=0;x<256;++x){auto p=pixels[y*256+x];ui::Paint paint(gfx::rgba(p&255,(p>>8)&255,(p>>16)&255,p>>24));paint.blendMode(os::BlendMode::Src);reference->drawRect(gfx::Rect(x,y,1,1),paint);}
  for(auto background:{gfx::rgba(0,0,0),gfx::rgba(255,255,255),gfx::rgba(43,73,111)}){
    auto expected=os::instance()->makeRgbaSurface(256,256),actual=os::instance()->makeRgbaSurface(256,256);
    ui::Graphics a(actual),e(expected);e.fillRect(background,{0,0,256,256});ui::Paint over;over.blendMode(os::BlendMode::SrcOver);e.drawSurface(reference.get(),{0,0,256,256},{0,0,256,256},os::Sampling(),&over);
    renderer.draw(a,{0,0,256,256},1,background,background);
    auto& eb=static_cast<os::SkiaSurface*>(expected.get())->bitmap();auto& ab=static_cast<os::SkiaSurface*>(actual.get())->bitmap();
    for(int y=0;y<256;++y)for(int x=0;x<256;++x)require(*ab.getAddr32(x,y)==*eb.getAddr32(x,y),"Bulk upload changed displayed RGBA pixels");
  }
  const auto initial=renderer.uploadedPixels();doc.beginStroke({1,2},0xff123456);renderer.noteChange(doc);doc.updateStroke({2,2});renderer.noteChange(doc);renderer.sync(doc);
  require(renderer.uploadedPixels()-initial==2,"Multiple input revisions lost their dirty rectangle");
  doc.cancelStroke();renderer.noteChange(doc);renderer.sync(doc);const auto count=renderer.uploads();renderer.sync(doc);require(renderer.uploads()==count,"Unchanged document was uploaded again");
}
static void checkerboardOracle(){
  Document doc(48,32);CanvasRenderer renderer;renderer.sync(doc);CheckerboardSettings defaults;
  require(defaults.size==16 && defaults.light==gfx::rgba(192,192,192) && defaults.dark==gfx::rgba(128,128,128),"Legacy checker defaults");
  // legacy canvas-render-background.ts scalar fallback is the oracle: light
  // first, dark at odd row+column, solid light below two display pixels.
  for(int size:{1,16,256})for(double zoom:{.0625,.125,.5,1.,1.25,2.})for(auto origin:{gfx::Point(3,5),gfx::Point(-17,-9)}){
    auto surface=os::instance()->makeRgbaSurface(150,110);surface->clear();
    const gfx::Rect target(origin.x,origin.y,int(doc.width()*zoom),int(doc.height()*zoom));
    {ui::Graphics g(surface);g.saveClip();g.clipRect({7,8,130,90});renderer.draw(g,target,zoom,defaults.light,defaults.dark,size);g.restoreClip();}
    const auto cell=size*zoom;
    for(int y=8;y<98;++y)for(int x=7;x<137;++x){
      auto expected=gfx::rgba(0,0,0,0);
      if(target.contains(gfx::Point(x,y))){const int column=int(std::floor((x+.5-origin.x)/cell)),row=int(std::floor((y+.5-origin.y)/cell));expected=cell<2 || (column+row)%2==0?defaults.light:defaults.dark;}
      require(surface->getPixel(x,y)==expected,"Checker zoom/pan/clip disagrees with legacy scalar fallback");
    }
  }
  require(renderer.uploads()==1,"Checker changes re-uploaded document pixels");
}
static void benchmark(int size,int layers,int frames){
  auto doc=fixture(size,layers,frames);CanvasRenderer renderer;std::vector<double> samples;
  for(int n=0;n<7;++n){
    CanvasRenderer fresh;auto start=Clock::now();fresh.sync(doc);auto ms=std::chrono::duration<double,std::milli>(Clock::now()-start).count();if(n)samples.push_back(ms);
  }
  std::sort(samples.begin(),samples.end());double total=0;for(auto n:samples)total+=n;
  std::cout<<"sync size="<<size<<" layers="<<layers<<" frames="<<frames<<" mean_ms="<<total/samples.size()<<" p95_ms="<<samples.back()<<'\n';
}
static void largeTimeline(){
  timeline::State state;constexpr int size=128,layers=256,frames=1000;
  for(int r=0;r<layers;++r)state.layers.push_back({"L"+std::to_string(r),U"Layer"});
  for(int c=0;c<frames;++c)state.frames.push_back({"F"+std::to_string(c),100});
  for(int r=0;r<layers;++r)for(int c=0;c<frames;++c){timeline::Cel cel;cel.layerId=state.layers[r].id;cel.frameId=state.frames[c].id;cel.id=cel.layerId+":"+cel.frameId;
    if(c)cel.linkedCelId=cel.layerId+":F0";
    else{timeline::Surface surface;surface.width=surface.height=size;surface.pixels.resize(size*size);if(r==layers-1)surface.pixels[1]=0x80123456;cel.surface=std::move(surface);}state.cels.push_back(std::move(cel));}
  timeline::Timeline uncached(state);
  auto doc=Document::fromImported(size,size,std::move(state),{},"large",U"Large",std::make_shared<const std::vector<std::uint8_t>>());
  doc.selectLayer("L255");doc.selectFrame("F999");require(doc.activeLayerIndex()==255 && doc.activeFrameIndex()==999,"Indexed active identity at distant slot");
  CanvasRenderer renderer;renderer.sync(doc);const auto scans=doc.timeline().contentScans();
  auto expected=compositeNormalRegion(uncached,"F999",{0,0,size,size});
  require(compositeNormalRegion(doc.timeline(),"F999",{0,0,size,size})==expected,"Empty skipping changed composite pixels");
  auto measure=[&](const timeline::Timeline& t){const auto start=Clock::now();for(int i=0;i<5;++i)compositeNormalRegion(t,"F999",{0,0,size,size});return std::chrono::duration<double,std::milli>(Clock::now()-start).count()/5;};
  std::cout<<"large layers=256 frames=1000 slots=256000 full_composite_uncached_ms="<<measure(uncached)<<" cached_ms="<<measure(doc.timeline())<<'\n';
  // A borrowed stroke must never acquire a reusable empty summary.
  doc.selectLayer("L0");doc.beginStroke({2,3},0xffabcdef);renderer.noteChange(doc);renderer.sync(doc);
  require(!doc.timeline().isKnownEmpty("L0:F999"),"Live storage retained empty summary");
  doc.updateStroke({3,3});renderer.noteChange(doc);renderer.sync(doc);doc.commitStroke();
  require(doc.pixels()[3*size+3]==0xffabcdef,"Distant-frame stroke lost pixels");
  require(doc.timeline().resolveSurface("L0:F0").surface->pixels[3*size+2]==0xffabcdef,"Linked owner stroke mismatch");
  require(doc.timeline().contentScans()==scans,"Live drawing rescanned unrelated empty owners");
  doc.undo();renderer.sync(doc);require(doc.pixels()[3*size+2]==0,"Large timeline undo failed");doc.redo();renderer.sync(doc);require(doc.pixels()[3*size+2]==0xffabcdef,"Large timeline redo failed");
  doc.selectLayer("L1");doc.beginStroke({0,0},0);renderer.sync(doc);doc.updateStroke({1,0});renderer.sync(doc);doc.cancelStroke();
  auto copy=doc;require(copy.activeFrameIndex()==999 && copy.activeLayerIndex()==1,"Copied index retained pointers");
}
static void tilemapPreviewOracle(){
 constexpr int size=64;Document source(size,size);source.beginStroke({2,2},0xff112233);source.commitStroke();source.convertLayerToTilemap(2,2,U"local preview");const auto tileId=source.cel().tilemap->cells[33]->tileId;auto state=source.timeline().state();const auto setId=source.layer().tilemapTilesetId,layerId=source.layer().id,frameId=source.frame().id;
 auto& grid=*state.cels.front().tilemap;grid.cells[std::size_t(50/2)*grid.columns+50/2]=tiles::Cell{setId,tileId,true,false,1};state.cels.front().surface->pixels=tiles::render(grid,state.tilesets);state.frames.push_back({"other-frame",100});auto second=state.cels.front();second.id="other-cel";second.frameId="other-frame";state.cels.push_back(second);
 auto doc=Document::fromImported(size,size,state,{},"tile-preview-oracle",U"Tile preview",std::make_shared<const std::vector<std::uint8_t>>());doc.selectLayer(layerId);doc.selectFrame(frameId);doc.setTilemapMode(tiles::Mode::Hybrid);const auto authority=doc.timeline().state().tilesets.front().pixels,baseline=doc.canvasPixels();const auto history=doc.historySize(),revision=doc.contentRevision();
 CanvasRenderer cache,other;cache.sync(doc);other.syncFrame(doc,"other-frame");
 auto oracle=[&](CanvasRenderer& renderer,const std::string& frame){auto expected=compositeNormalRegion(doc.displayTimeline(),frame,{0,0,size,size},{},nullptr,0,0,0,false);auto rendered=os::instance()->makeRgbaSurface(size,size),reference=os::instance()->makeRgbaSurface(size,size);rendered->clear();reference->clear();{ui::Graphics g(rendered);renderer.draw(g,{0,0,size,size},1,gfx::rgba(0,0,0),gfx::rgba(0,0,0));}auto content=os::instance()->makeRgbaSurface(size,size);uploadRgbaRegion(*content,expected.data(),size,size,size);{ui::Graphics g(reference);g.fillRect(gfx::rgba(0,0,0),{0,0,size,size});ui::Paint p;p.blendMode(os::BlendMode::SrcOver);g.drawSurface(content.get(),gfx::Rect(0,0,size,size),gfx::Rect(0,0,size,size),os::Sampling(),&p);}for(int y=0;y<size;++y)for(int x=0;x<size;++x)require(rendered->getPixel(x,y)==reference->getPixel(x,y),"Tile preview actual canvas pixel differs from full composite");};
 auto sync=[&]{const auto before=cache.uploadedPixels(),beforeOther=other.uploadedPixels();cache.sync(doc);other.syncFrame(doc,"other-frame");require(cache.uploadedPixels()-before<=32&&other.uploadedPixels()-beforeOther<=32,"Tile preview forced full canvas/frame upload");oracle(cache,frameId);oracle(other,"other-frame");require(doc.historySize()==history&&doc.contentRevision()==revision&&doc.timeline().state().tilesets.front().pixels==authority,"Preview polluted authority/history");};
 ShapeSpec shape;shape.kind=ShapeKind::Rectangle;shape.bounds={2,2,1,1};require(doc.beginShapePreview()&&doc.updateShapePreview(shape,0xff998877),"Local shape begin");sync();shape.bounds={8,8,2,2};doc.updateShapePreview(shape,0xffabcdef);sync();shape.bounds={9,9,1,1};doc.updateShapePreview(shape,0xffaabbcc);sync();doc.cancelShapePreview();sync();require(doc.canvasPixels()==baseline,"Local shape cancellation changed authority");
 doc.previewSelection(SelectionMask{2,2,1,1,{}});WandOptions options;GradientSpec gradient;gradient.start={2,2};gradient.end={3,3};gradient.first=gradient.last=0xff776655;require(doc.beginGradient({2,2},options)&&doc.updateGradient(gradient,options),"Local gradient begin");sync();gradient.first=gradient.last=0xff554433;doc.updateGradient(gradient,options);sync();doc.cancelGradient();sync();
 doc.previewSelection({});cache.sync(doc);other.syncFrame(doc,"other-frame");
 require(doc.beginShapePreview(),"Skipped shape begin");shape.bounds={2,2,1,1};doc.updateShapePreview(shape,0xff556677);sync();shape.bounds={8,8,1,1};doc.updateShapePreview(shape,0xff778899);shape.bounds={10,10,1,1};doc.updateShapePreview(shape,0xff99aabb);sync();doc.cancelShapePreview();sync();
 std::cout<<"Tile preview local upload and actual canvas/frame pixel oracle passed\n";
}
int main(int argc,char* argv[]){try{
  auto system=os::System::make();system->setAppMode(os::AppMode::GUI);
  if(argc>1&&std::string(argv[1])=="--tilemap-preview"){tilemapPreviewOracle();return 0;}
  checkerboardOracle();if(argc>1 && std::string(argv[1])=="--checkerboard")return 0;
  strokeRecorderOracle();pixelOracle();largeTimeline();
  for(int size:{32,256,512,1024})benchmark(size,1,1);
  benchmark(256,1,100);benchmark(512,4,2);
  std::cout<<"RGBA oracle and accumulated dirty upload passed. CPU offscreen sync; excludes input/display latency.\n";
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
