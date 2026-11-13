#include "document.h"
#include "isometric.h"
#include "project_encode.h"
#include "project_import.h"
#include <iostream>
#include <stdexcept>
using namespace moon;
namespace {
void check(bool value,const char* text){if(!value)throw std::runtime_error(text);}
std::unique_ptr<Document> reopen(const Document& d){
 const auto encoded=project::encodeEditableProject(d);auto data=project::prepareEditableImport(project::readProjectManifest(encoded.bytes));
 auto out=std::make_unique<Document>(Document::fromImported(data.width,data.height,std::move(data.timeline),d.palette(),data.id,data.name,encoded.bytes));out->selectLayer(data.activeLayerId);out->selectFrame(data.activeFrameId);return out;
}
std::vector<Pixel> expectedLine(int w,int h,Point from,Point to,Pixel color){
 std::vector<Pixel> pixels(std::size_t(w)*h);for(auto p:selectionLine({from.x,from.y},{to.x,to.y},true))if(p.x>=0&&p.y>=0&&p.x<w&&p.y<h)pixels[std::size_t(p.y)*w+p.x]=color;return pixels;
}
void rasterCases(){
 for(int dx:{-1,1})for(int dy:{-1,1}){
  Document d(40,32);const iso::Point start{20,16};const auto line=iso::isoGridLineSegment(start,{start.x+dx*12,start.y+dy*6},2);
  Point from{int(line.from.x),int(line.from.y)},to{int(line.to.x),int(line.to.y)};BrushOptions b;b.opacity=50;
  d.beginStroke(from,0xff112233,b,nullptr,0,nullptr,false);check(d.pixels()==std::vector<Pixel>(1280),"grid down paints no vertex");
  d.paintAlignedStrokePath({{from.x,from.y,1,50},{to.x,to.y,1,50}},false);const auto preview=d.pixels();
  const auto expected=expectedLine(40,32,from,to,inkBrushComposite(0,0xff112233,50,InkMode::Simple));check(preview==expected,"four direction balanced paint matches legacy geometry");
  d.paintAlignedStrokePath({{from.x,from.y,1,50},{to.x,to.y,1,50}},false);check(d.pixels()==preview,"hovered edge retains gesture alpha coverage");
  check(d.commitStroke()&&d.historySize()==1,"one grid gesture history");d.undo();check(d.pixels()==std::vector<Pixel>(1280),"grid undo");d.redo();check(d.pixels()==preview&&reopen(d)->pixels()==preview,"grid redo and saved raster");
 }
 Document d(32,24);d.beginStroke({4,4},0xffabcdef,{},nullptr,0,nullptr,false);d.paintAlignedStrokePath({{4,4},{16,10}},true);d.paintAlignedStrokePath({{4,4},{4,16}},true);
 check(d.pixels()==expectedLine(32,24,{4,4},{4,16},0xffabcdef),"direction reconsideration removes abandoned pixels");d.cancelStroke();check(d.pixels()==std::vector<Pixel>(768)&&d.historySize()==0,"replayed cancellation");
 d.beginStroke({4,4},0xffabcdef,{},nullptr,0,nullptr,false);d.paintAlignedStrokePath({{4,4},{8,6}},false);d.paintAlignedStrokePath({{22,16},{26,18}},false);check(d.pixels()[11*32+15]==0,"independent grid edges do not connect");d.cancelStroke();
 d.beginStroke({4,4},0xffabcdef,{},nullptr,0,nullptr,false);check(!d.commitStroke()&&d.historySize()==0,"click without grid edge is no edit");
 d.previewSelection(SelectionMask{0,0,8,24,{}});d.beginStroke({4,4},0xffabcdef,{},nullptr,0,nullptr,false);d.paintAlignedStrokePath({{4,4},{16,10}},true);for(int y=0;y<24;++y)for(int x=8;x<32;++x)check(d.pixels()[y*32+x]==0,"aligned stroke selection clipping");d.cancelStroke();
}
void dynamicsAndImages(){
 Document d(64,32),reference(64,32);BrushOptions b;b.size=9;
 d.beginStroke({3,10},0xffffffff,b,nullptr,0,nullptr,false);d.configureStrokeDynamics(b,nullptr,0xff000000,0xffffffff,0);
 d.paintAlignedStrokePath({{3,10,1,20,0,0.},{39,10,9,100,0,1.}},true);
 reference.beginStroke({3,10},0xffffffff,b,nullptr,0,nullptr,false);reference.configureStrokeDynamics(b,nullptr,0xff000000,0xffffffff,0);reference.updateDynamicStroke({3,10},{3,10,1,20,0,0.},true);reference.updateDynamicStroke({39,10},{39,10,9,100,0,1.});
 check(d.pixels()==reference.pixels(),"aligned dynamic size opacity gradient interpolation");const auto once=d.pixels();d.paintAlignedStrokePath({{3,10,1,20,0,0.},{39,10,9,100,0,1.}},true);check(d.pixels()==once,"dynamic replay does not accumulate opacity");d.cancelStroke();reference.cancelStroke();
 PatternBrush image;image.width=48;image.height=1;image.coverage.assign(48,0);image.coverage[0]=image.coverage[47]=255;
 b.size=1;d.beginStroke({24,10},0xff123456,b,&image,0,nullptr,false);d.paintAlignedStrokePath({{24,10},{36,10}},true);
 reference.beginStroke({24,10},0xff123456,b,&image,0,nullptr,false);for(int x:{24,27,30,33,36})reference.updateStroke({x,10});
 auto expected=std::vector<Pixel>(64*32);for(int x:{24,27,30,33,36})for(int ox:{-24,23})expected[10*64+x+ox]=0xff123456;
 check(d.pixels()==expected,"intrinsic image dimensions control legacy stamp spacing");d.cancelStroke();reference.cancelStroke();
 d.beginStroke({60,10},0xff123456,{},nullptr,0,nullptr,false,false,false,repeat::Mode::X);d.paintAlignedStrokePath({{60,10},{68,14}},true);auto wrapped=std::vector<Pixel>(2048);for(auto p:selectionLine({60,10},{68,14},true))wrapped[p.y*64+p.x%64]=0xff123456;check(d.pixels()==wrapped,"repeat rasterizes unwrapped edge before stamps wrap");d.cancelStroke();
}
void authorities(){
 Document linked(32,24);linked.beginStroke({0,0},0xff112233);linked.commitStroke();const auto linkedBefore=linked.pixels();const auto first=linked.frame().id;linked.addLinkedFrame();linked.clearHistory();linked.beginStroke({3,3},0xff123456,{},nullptr,0,nullptr,false);linked.paintAlignedStrokePath({{3,3},{19,11}},true);check(linked.commitStroke(),"linked aligned commit");const auto after=linked.pixels();linked.selectFrame(first);check(linked.pixels()==after,"linked owner canonical pixels");linked.undo();check(linked.pixels()==linkedBefore,"linked canonical undo");linked.redo();check(linked.pixels()==after&&reopen(linked)->pixels()==after,"linked redo reopen");
 Document mask(32,24);mask.fillSelectionOrCanvas(0xff123456);check(mask.createAttachedMask(mask.layer().id,mask.frame().id),"mask fixture");mask.clearHistory();const auto beforeMask=mask.timeline().state().masks;mask.beginStroke({3,3},0xff000000,{},nullptr,0,nullptr,false);mask.paintAlignedStrokePath({{3,3},{19,11}},true);check(mask.commitStroke()&&mask.historySize()==1,"mask aligned transaction");const auto painted=mask.timeline().state().masks.front().mask.surface.pixels;mask.undo();check(mask.timeline().state().masks.front().mask.surface.pixels==beforeMask.front().mask.surface.pixels,"mask aligned undo");mask.redo();check(mask.timeline().state().masks.front().mask.surface.pixels==painted,"mask aligned redo");
 for(auto mode:{tiles::Mode::Create,tiles::Mode::Edit,tiles::Mode::Hybrid}){
  Document d(32,24);d.beginStroke({1,1},0xff112233);d.commitStroke();d.convertLayerToTilemap(8,8,U"ISO");d.setTilemapMode(mode);d.clearHistory();const auto before=d.canvasPixels(),sheet=d.timeline().state().tilesets.front().pixels;
  d.beginStroke({1,1},0xffaabbcc,{},nullptr,0,nullptr,false);d.paintAlignedStrokePath({{1,1},{7,4}},true);d.paintAlignedStrokePath({{1,1},{1,6}},true);check(d.commitStroke()&&d.historySize()==1,"tile aligned transaction");const auto changed=d.canvasPixels();check(changed!=before&&changed==reopen(d)->canvasPixels(),"tile aligned saved resource authority");d.undo();check(d.canvasPixels()==before&&d.timeline().state().tilesets.front().pixels==sheet,"tile aligned undo resource");d.redo();check(d.canvasPixels()==changed,"tile aligned redo resource");
 }
}
void freeSource(){
 Document seed(32,24);const auto base=project::encodeEditableProject(seed);auto state=seed.timeline().state();auto set=tiles::blankTileset("source-set",U"ISO source",2,2,"tile",1);tiles::writeTile(set,"tile",{0xff0000ff,0,0,0});state.tilesets.push_back(set);
 free_tiles::Source source;source.id="source";source.tilesetId=set.id;free_tiles::LayerData data;data.setId="collection";data.sources={source};state.layers.front().kind="free-tile";state.layers.front().freeTiles=data;
 free_tiles::Instance instance;instance.id="instance";instance.sourceId=source.id;instance.x=4;instance.y=4;free_tiles::CelData instances;instances.instances={instance};state.cels.front().freeTiles=instances;state.cels.front().surface->pixels=free_tiles::render(data,instances,state.tilesets,32,24);
 auto d=std::make_unique<Document>(Document::fromImported(32,24,std::move(state),seed.palette(),base.projectId,U"ISO",base.bytes));d->setFreeTilePaintMode(false);d->setFreeTileInstanceView(false);const auto before=d->canvasPixels(),sheet=d->timeline().state().tilesets.front().pixels;
 d->beginStroke({4,4},0xffabcdef,{},nullptr,0,nullptr,false);check(d->strokeActive(),"free source aligned admission");d->paintAlignedStrokePath({{4,4},{100,52}},true);d->paintAlignedStrokePath({{4,4},{4,16}},true);check(d->commitStroke()&&d->historySize()==1,"grown source replay one history");const auto after=d->canvasPixels();check(after[4*32+4]==0xffabcdef&&after[16*32+4]==0xffabcdef&&after[12*32+20]==0,"free source replaces old preview after growth");check(reopen(*d)->canvasPixels()==after,"free source saved resources");d->undo();check(d->canvasPixels()==before&&d->timeline().state().tilesets.front().pixels==sheet,"free source undo dimensions resource");d->redo();check(d->canvasPixels()==after,"free source redo");
 d->beginStroke({4,4},0xff123456,{},nullptr,0,nullptr,false);d->paintAlignedStrokePath({{4,4},{8,6}},false);d->cancelStroke();check(d->canvasPixels()==after&&d->historySize()==1,"free source cancellation");
}
}
int main(){try{rasterCases();dynamicsAndImages();authorities();freeSource();std::cout<<"ISO stroke transactions, resources and project roundtrips passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
