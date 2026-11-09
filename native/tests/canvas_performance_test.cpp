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
namespace moon {struct RasterHistoryFixture {
 static void shadow(Document& d,int dx,int dy){auto state=d.timeline_.state();timeline::ColorOverlayStyle style;style.shadow.enabled=true;style.shadow.offsetX=dx;style.shadow.offsetY=dy;style.shadow.blur=1;state.layers.front().layerStyles=style;d.timeline_=timeline::Timeline(std::move(state));}
 static void nestedShadow(Document& d){auto state=d.timeline_.state();timeline::ColorOverlayStyle style;style.shadow.enabled=true;style.shadow.offsetX=3;style.shadow.offsetY=2;style.shadow.blur=1;timeline::Group outer;outer.id="outer-shadow";outer.name=U"Outer";outer.layerStyles=style;timeline::Group inner;inner.id="inner-shadow";inner.name=U"Inner";inner.parentGroupId=outer.id;inner.layerStyles=style;state.layers.front().groupId=inner.id;state.groups={outer,inner};d.timeline_=timeline::Timeline(std::move(state));}
 static void clipboardStack(Document& d,int mode){auto state=d.timeline_.state();auto& l=state.layers.front();l.opacity=.57;if(mode==1)l.blendMode="multiply";for(auto& c:state.cels)if(c.layerId==l.id)c.opacity=l.opacity;d.timeline_=timeline::Timeline(std::move(state));if(mode==2)d.selectLayer(d.timeline_.state().layers.back().id);}
 static void effects(Document& d,int mode){auto state=d.timeline_.state();auto& l=state.layers.front();l.opacity=.63;
  if(mode>=1){timeline::Group group;group.id="preview-group";group.name=U"Preview";group.opacity=.71;state.groups.push_back(group);l.groupId=group.id;}
  if(mode>=2){timeline::MaskSlot m;m.ownerId=l.id;m.frameId=state.frames.front().id;m.mask.id="preview-mask";m.mask.surface.width=m.mask.surface.height=8;m.mask.surface.pixels.resize(64,0xff808080);state.masks.push_back(std::move(m));}
  if(mode>=3){timeline::ColorOverlayStyle style;style.overlayEnabled=true;style.color=0x8066bb22;l.layerStyles=style;}
  if(mode>=4){timeline::ColorOverlayStyle style;style.gradientEnabled=true;style.gradientFrom=0xff0000ff;style.gradientTo=0xffff0000;state.groups.front().layerStyles=style;}
  if(mode>=5){auto& style=*state.groups.front().layerStyles;style.stroke.enabled=true;style.stroke.size=1;style.stroke.color=0xff00ff00;style.shadow.enabled=true;style.shadow.offsetX=1;style.shadow.offsetY=1;}
  d.timeline_=timeline::Timeline(std::move(state));}
 static void emptyActiveSlot(Document& d){auto state=d.timeline_.state();const auto layer=d.layer().id,frame=d.frame().id;state.cels.erase(std::remove_if(state.cels.begin(),state.cels.end(),[&](const auto& c){return c.layerId==layer&&c.frameId==frame;}),state.cels.end());d.timeline_=timeline::Timeline(std::move(state));}
};}
static void absentStrokeRenderOracle(){
 for(int layers:{1,2})for(bool onion:{false,true}){
  auto doc=fixture(8,layers,onion?2:1);RasterHistoryFixture::emptyActiveSlot(doc);CanvasRenderer renderer;OnionSkinSettings settings;settings.enabled=onion;renderer.setOnionSkin(settings,false);
  auto displayed=[&](){renderer.sync(doc);auto output=os::instance()->makeRgbaSurface(8,8);ui::Graphics graphics(output);renderer.draw(graphics,{0,0,8,8},1,gfx::rgba(0,0,0),gfx::rgba(0,0,0));return output->getPixel(2,3);};
  const auto before=displayed();doc.beginStroke({2,3},0xff123456);renderer.noteChange(doc);require(displayed()==gfx::rgba(0x56,0x34,0x12),"Absent-slot stroke invisible on canvas");require(!doc.timeline().findCel(doc.layer().id,doc.frame().id),"Rendering created a Cel");doc.cancelStroke();renderer.noteChange(doc);require(displayed()==before,"Absent-slot cancel retained preview");
  doc.beginStroke({2,3},0xff123456);renderer.noteChange(doc);displayed();require(doc.commitStroke(),"Absent render commit failed");require(displayed()==gfx::rgba(0x56,0x34,0x12),"Committed absent stroke changed display");doc.undo();renderer.noteChange(doc);require(displayed()==before,"Absent render undo mismatch");doc.redo();renderer.noteChange(doc);require(displayed()==gfx::rgba(0x56,0x34,0x12),"Absent render redo mismatch");
 }
}
static void absentEffectRenderOracle(){
 for(int mode=0;mode<6;++mode)for(bool onion:{false,true}){
  auto doc=fixture(8,2,onion?2:1);RasterHistoryFixture::effects(doc,mode);RasterHistoryFixture::emptyActiveSlot(doc);CanvasRenderer renderer;OnionSkinSettings settings;settings.enabled=onion;renderer.setOnionSkin(settings,false);
  auto displayed=[&](CanvasRenderer& cache){cache.sync(doc);auto output=os::instance()->makeRgbaSurface(8,8);ui::Graphics graphics(output);cache.draw(graphics,{0,0,8,8},1,gfx::rgba(0,0,0),gfx::rgba(0,0,0));std::vector<Pixel> pixels;for(int y=0;y<8;++y)for(int x=0;x<8;++x)pixels.push_back(output->getPixel(x,y));return pixels;};
  const auto before=displayed(renderer);doc.beginStroke({2,3},0xff123456);doc.updateStroke({5,4});renderer.noteChange(doc);const auto preview=displayed(renderer);require(preview!=before,"Effects hid absent stroke");require(doc.commitStroke(),"Effects stroke commit failed");CanvasRenderer fresh;fresh.setOnionSkin(settings,false);require(displayed(fresh)==preview,"Absent effects preview differs from committed composition");doc.undo();renderer.noteChange(doc);require(displayed(renderer)==before,"Effects undo differs from empty composition");
 }
}
static void absentPasteRenderOracle(){
 for(int mode=0;mode<6;++mode)for(bool onion:{false,true}){
  auto doc=fixture(8,2,onion?2:1);RasterHistoryFixture::effects(doc,mode);RasterHistoryFixture::emptyActiveSlot(doc);CanvasRenderer cache;OnionSkinSettings settings;settings.enabled=onion;cache.setOnionSkin(settings,false);
  auto displayed=[&](CanvasRenderer& renderer){renderer.sync(doc);auto output=os::instance()->makeRgbaSurface(8,8);ui::Graphics graphics(output);renderer.draw(graphics,{0,0,8,8},1,gfx::rgba(0,0,0),gfx::rgba(0,0,0));std::vector<gfx::Color> pixels;for(int y=0;y<8;++y)for(int x=0;x<8;++x)pixels.push_back(output->getPixel(x,y));return pixels;};
  const auto before=displayed(cache);SelectionClipboard clip;clip.width=3;clip.height=2;clip.pixels={0xff123456,0x80123456,0,0xffabcdef,0,0xff667788};clip.mask={1,1,1,1,0,1};require(doc.beginFloatingPaste(clip,2,3),"Absent paste admission");const auto preview=displayed(cache);require(preview!=before&&!doc.activeSurfaceIfPresent(),"Absent paste overlay invisible or creates Cel");doc.cancelFloatingPaste();require(displayed(cache)==before,"Absent paste cancel leaves overlay");require(doc.beginFloatingPaste(clip,2,3),"Absent paste restart");auto transform=*doc.floatingTransform();transform.angle=30;doc.transformFloatingPaste(transform);const auto rotated=displayed(cache);require(doc.commitFloatingPaste(),"Absent paste commit");CanvasRenderer fresh;fresh.setOnionSkin(settings,false);require(displayed(fresh)==rotated&&displayed(cache)==rotated,"Absent paste preview/commit composition differs");doc.undo();cache.noteChange(doc);require(displayed(cache)==before,"Absent paste undo differs");doc.redo();cache.noteChange(doc);require(displayed(cache)==rotated,"Absent paste redo differs");
 }
}
static void absentGradientRenderOracle(){
 for(int mode=0;mode<6;++mode)for(bool onion:{false,true}){
  auto doc=fixture(8,2,onion?2:1);RasterHistoryFixture::effects(doc,mode);RasterHistoryFixture::emptyActiveSlot(doc);doc.previewSelection(SelectionMask{1,1,6,5,{}});CanvasRenderer cache;OnionSkinSettings settings;settings.enabled=onion;cache.setOnionSkin(settings,false);
  auto pixels=[&](CanvasRenderer& renderer){renderer.sync(doc);auto output=os::instance()->makeRgbaSurface(8,8);ui::Graphics g(output);renderer.draw(g,{0,0,8,8},1,gfx::rgba(43,73,111),gfx::rgba(43,73,111));std::vector<gfx::Color> result;for(int y=0;y<8;++y)for(int x=0;x<8;++x)result.push_back(output->getPixel(x,y));return result;};
  const auto before=pixels(cache);GradientSpec spec;spec.start={1,1};spec.end={6,5};spec.first=0xff123456;spec.last=0x80776655;require(doc.beginGradient({2,2})&&doc.updateGradient(spec,{}),"Empty gradient preview failed");const auto preview=pixels(cache);require(preview!=before&&!doc.timeline().findCel(doc.layer().id,doc.frame().id),"Gradient preview missing or created Cel");doc.cancelGradient();require(pixels(cache)==before,"Gradient cancel retained effect");require(doc.beginGradient({2,2})&&doc.updateGradient(spec,{}),"Second empty gradient failed");require(pixels(cache)==preview,"Repeated gradient changed preview");require(doc.commitGradient(),"Empty gradient commit failed");CanvasRenderer fresh;fresh.setOnionSkin(settings,false);require(pixels(fresh)==preview&&pixels(cache)==preview,"Empty gradient preview differs from committed render");doc.undo();cache.noteChange(doc);require(pixels(cache)==before,"Empty gradient undo residual");doc.redo();cache.noteChange(doc);require(pixels(cache)==preview,"Empty gradient redo mismatch");
 }
}
static void spatialDirtyOracle(){
 for(int dx:{-3,3})for(int dy:{-2,2})for(bool nested:{false,true}){
  Document doc(32,32);if(nested)RasterHistoryFixture::nestedShadow(doc);else RasterHistoryFixture::shadow(doc,dx,dy);CanvasRenderer cache;cache.sync(doc);const auto initial=cache.uploadedPixels();doc.beginStroke({16,16},0xff123456);cache.noteChange(doc);cache.sync(doc);
  require(cache.uploadedPixels()-initial==(nested?std::uint64_t(9*7):std::uint64_t((std::abs(dx)+2)*(std::abs(dy)+2))),"Shadow dirty rectangle did not match legacy affected union");
  auto pixels=[&](CanvasRenderer& renderer){renderer.sync(doc);auto output=os::instance()->makeRgbaSurface(32,32);ui::Graphics g(output);renderer.draw(g,{0,0,32,32},1,gfx::rgba(0,0,0),gfx::rgba(0,0,0));std::vector<gfx::Color> out;for(int y=0;y<32;++y)for(int x=0;x<32;++x)out.push_back(output->getPixel(x,y));return out;};
  CanvasRenderer fresh;require(pixels(cache)==pixels(fresh),"Local shadow upload differs from full renderer");doc.cancelStroke();cache.noteChange(doc);CanvasRenderer cancelled;require(pixels(cache)==pixels(cancelled),"Local shadow cancel left residual pixels");
 }
}
static void floatingEffectDirtyOracle(){
 for(bool nested:{false,true}){
  Document doc(320,320);if(nested)RasterHistoryFixture::nestedShadow(doc);else RasterHistoryFixture::shadow(doc,3,2);CanvasRenderer cache;cache.sync(doc);
  auto pixels=[&](CanvasRenderer& renderer){renderer.sync(doc);auto output=os::instance()->makeRgbaSurface(320,320);ui::Graphics g(output);renderer.draw(g,{0,0,320,320},1,gfx::rgba(0,0,0),gfx::rgba(0,0,0));std::vector<gfx::Color> out;for(int y=0;y<320;++y)for(int x=0;x<320;++x)out.push_back(output->getPixel(x,y));return out;};
  auto check=[&](){CanvasRenderer fresh;require(pixels(cache)==pixels(fresh),"Floating effect dirty update differs from full renderer");};
  SelectionClipboard clip{257,257,0,0,std::vector<Pixel>(257*257),std::vector<unsigned char>(257*257,1)};clip.pixels[0]=0xff123456;clip.pixels.back()=0xff123456;require(doc.beginFloatingPaste(clip,5,6),"Floating effect paste failed");require(doc.floatingDeferred()==nested,"Styled target must use fallback; group-only styles preserve deferred path");check();doc.moveFloatingPaste(15,16);check();doc.moveFloatingPaste(7,8);check();doc.cancelFloatingPaste();check();require(doc.beginFloatingPaste(clip,5,6),"Floating effect second paste failed");check();doc.commitFloatingPaste();check();doc.undo();cache.noteChange(doc);check();doc.redo();cache.noteChange(doc);check();
 }
}
static void clipboardPreviewAdmissionOracle(){
 for(bool supported:{false,true})for(bool configured:{false,true})for(bool enabled:{false,true}){
  Document doc(320,320);if(configured){RasterHistoryFixture::shadow(doc,3,2);if(!enabled){doc.beginLayerStyle();auto style=*doc.layer().layerStyles;style.enabled=false;doc.commitLayerStyle(style);}}
  doc.setDeferredFloatingDisplaySupported(supported);SelectionClipboard clip{257,257,0,0,std::vector<Pixel>(257*257,0xff123456),std::vector<unsigned char>(257*257,1)};
  const auto history=doc.historySize();require(doc.beginFloatingPaste(clip,0,0),"Admission clipboard failed");require(doc.floatingDeferred()==(supported&&!(configured&&enabled)),"Clipboard preview admission mismatch");doc.cancelFloatingPaste();require(!doc.floating()&&doc.historySize()==history,"Admission cancel changed history");
 }
}
static void clipboardStackParityOracle(){
 for(int mode=0;mode<3;++mode){
  auto optimized=fixture(320,2,1);RasterHistoryFixture::clipboardStack(optimized,mode);auto fallback=optimized;fallback.setDeferredFloatingDisplaySupported(false);CanvasRenderer fast,slow;
  SelectionClipboard clip{257,257,0,0,std::vector<Pixel>(257*257),std::vector<unsigned char>(257*257,1)};clip.pixels[0]=0xff123456;clip.pixels[256]=0x8056789a;clip.pixels.back()=0xff99aabb;
  auto pixels=[](Document& doc,CanvasRenderer& renderer){renderer.sync(doc);auto out=os::instance()->makeRgbaSurface(320,320);ui::Graphics g(out);renderer.draw(g,{0,0,320,320},1,gfx::rgba(43,73,111),gfx::rgba(43,73,111));std::vector<gfx::Color> result;for(int y=0;y<320;++y)for(int x=0;x<320;++x)result.push_back(out->getPixel(x,y));return result;};
  auto check=[&](){require(pixels(optimized,fast)==pixels(fallback,slow),"Clipboard stack deferred/fallback pixels differ");};check();
  for(auto* d:{&optimized,&fallback})require(d->beginFloatingPaste(clip,5,6),"Stack clipboard failed");require(optimized.floatingDeferred()&&!fallback.floatingDeferred(),"Stack parity must exercise distinct paths");check();for(auto* d:{&optimized,&fallback})d->moveFloatingPaste(15,16);check();for(auto* d:{&optimized,&fallback})d->cancelFloatingPaste();check();
  for(auto* d:{&optimized,&fallback}){require(d->beginFloatingPaste(clip,5,6),"Stack second clipboard failed");d->commitFloatingPaste();}check();for(auto* d:{&optimized,&fallback})d->undo();check();for(auto* d:{&optimized,&fallback})d->redo();check();
 }
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
static void hybridFloatingRenderOracle(){
 for(bool copy:{false,true}){
  auto seed=std::make_unique<Document>(260,260);seed->beginStroke({0,0},0x80123456);seed->commitStroke();require(seed->convertLayerToTilemap(4,4,U"Hybrid render"),"Hybrid render conversion");auto state=seed->timeline().state();const auto layer=seed->layer().id,frame=seed->frame().id;auto& cel=state.cels.front();auto& grid=*cel.tilemap;grid.cells[std::size_t(50)*grid.columns+50]=grid.cells[0];grid.cells[std::size_t(50)*grid.columns+50]->flipHorizontal=true;cel.surface->pixels=tiles::render(grid,state.tilesets);
  auto owned=std::make_unique<Document>(Document::fromImported(260,260,state,seed->palette(),"hybrid-render",U"Hybrid render",std::make_shared<const std::vector<std::uint8_t>>()));auto& doc=*owned;doc.selectLayer(layer);doc.selectFrame(frame);doc.setTilemapMode(tiles::Mode::Hybrid);CanvasRenderer cache;
  auto pixels=[&](CanvasRenderer& renderer){renderer.sync(doc);auto output=os::instance()->makeRgbaSurface(260,260);output->clear();ui::Graphics g(output);renderer.draw(g,{0,0,260,260},1,gfx::rgba(43,73,111),gfx::rgba(43,73,111));std::vector<gfx::Color> result;result.reserve(260*260);for(int y=0;y<260;++y)for(int x=0;x<260;++x)result.push_back(output->getPixel(x,y));return result;};
  auto verify=[&]{CanvasRenderer fresh;require(pixels(cache)==pixels(fresh),"Hybrid cached floating draw differs from fresh full render");};const auto baseline=pixels(cache);doc.previewSelection(SelectionMask{0,0,4,4,{}});require(doc.beginSelectionContentMove(copy)&&doc.floatingDeferred(),"Hybrid render deferred capture");verify();
  auto local=[&](int x){const auto uploads=cache.uploadedPixels();doc.moveFloatingPaste(x,0);verify();require(cache.uploadedPixels()-uploads<260*260,"Hybrid aligned move uploaded entire canvas");};local(8);doc.moveFloatingPaste(1,0);verify();local(8);local(12);
  // Skip a revision: renderer must fall back rather than lose the remote restore.
  doc.moveFloatingPaste(1,0);doc.moveFloatingPaste(8,0);verify();doc.cancelFloatingPaste();verify();require(pixels(cache)==baseline,"Hybrid render cancel residue");
  require(doc.beginSelectionContentMove(copy),"Hybrid render recapture");doc.moveFloatingPaste(8,0);verify();const auto preview=pixels(cache);require(doc.commitFloatingPaste(),"Hybrid render commit");verify();require(pixels(cache)==preview,"Hybrid render preview differs from commit");doc.undo();cache.noteChange(doc);verify();require(pixels(cache)==baseline,"Hybrid render Undo residue");doc.redo();cache.noteChange(doc);verify();require(pixels(cache)==preview,"Hybrid render Redo residue");
  doc.undo();cache.noteChange(doc);verify();
  for(auto repeatMode:{repeat::Mode::Off,repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both})for(int variant=0;variant<4;++variant){if(repeatMode!=repeat::Mode::Off&&variant!=0)continue;doc.setFloatingRepeat(repeatMode);doc.previewSelection(SelectionMask{0,0,2,2,{1,1,0,1}});require(doc.beginSelectionContentMove(copy)&&doc.floatingDeferred(),"Hybrid affine render capture");auto transform=*doc.floatingTransform();transform.x=repeat::includesX(repeatMode)?261:1;transform.y=repeat::includesY(repeatMode)?261:1;if(variant==1){transform.width=3;transform.height=4;transform.flipHorizontal=true;}if(variant==2){transform.angle=30;transform.shearX=.2;}if(variant==3)transform.quad=std::array<TransformPoint,4>{{{1,0},{4,1},{3,3},{0,2}}};doc.transformFloatingPaste(transform,variant==2);verify();const auto rendered=pixels(cache);const auto rawPreview=doc.floatingOverlayRegion({0,0,260,260});const bool expectedChange=rawPreview!=doc.canvasPixels();auto shifted=transform;shifted.x+=4;if(shifted.quad)for(auto& point:*shifted.quad)point.x+=4;doc.transformFloatingPaste(shifted,variant==2);verify();doc.transformFloatingPaste(transform,variant==2);verify();require(pixels(cache)==rendered,"Hybrid affine restored cached preview differs");require(doc.commitFloatingPaste()==expectedChange,"Hybrid affine renderer commit result");verify();require(pixels(cache)==rendered,"Hybrid affine renderer preview commit differs");doc.undo();cache.noteChange(doc);verify();require(pixels(cache)==baseline,"Hybrid affine renderer Undo residue");doc.redo();cache.noteChange(doc);verify();require(pixels(cache)==rendered,"Hybrid affine renderer Redo residue");doc.undo();cache.noteChange(doc);verify();}

 }
}
int main(int argc,char* argv[]){try{
  auto system=os::System::make();system->setAppMode(os::AppMode::GUI);
  if(argc>1&&std::string(argv[1])=="--tilemap-preview"){tilemapPreviewOracle();hybridFloatingRenderOracle();return 0;}
  checkerboardOracle();if(argc>1 && std::string(argv[1])=="--checkerboard")return 0;
  absentPasteRenderOracle();absentStrokeRenderOracle();absentEffectRenderOracle();absentGradientRenderOracle();spatialDirtyOracle();floatingEffectDirtyOracle();clipboardPreviewAdmissionOracle();clipboardStackParityOracle();strokeRecorderOracle();pixelOracle();largeTimeline();
  for(int size:{32,256,512,1024})benchmark(size,1,1);
  benchmark(256,1,100);benchmark(512,4,2);
  std::cout<<"RGBA oracle and accumulated dirty upload passed. CPU offscreen sync; excludes input/display latency.\n";
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
