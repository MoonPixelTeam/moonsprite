#include "document.h"
#include <iostream>
using namespace moon;
#include "fixtures/tile_repeat_legacy.h"
namespace moon {struct RasterHistoryFixture {static void removeActive(Document& d){auto state=d.timeline_.state();const auto id=d.cel().id;state.cels.erase(std::remove_if(state.cels.begin(),state.cels.end(),[&](const auto& c){return c.id==id;}),state.cels.end());d.timeline_=timeline::Timeline(std::move(state));}};}
#define CHECK(x) do{if(!(x))throw std::runtime_error(std::string(#x)+" line "+std::to_string(__LINE__));}while(false)
static void begin(Document& d,Point p,Pixel color,BrushOptions b,repeat::Mode mode,const PatternBrush* image=nullptr){d.beginStroke(p,color,b,image,0,nullptr,true,false,false,mode);}
static void freeSourceRepeat(){
 // The oracle includes re-rasterization of every wrapped segment, including
 // diagonal ties and reverse paths, rather than just wrapping a long line.
 for(const auto& c:repeatLineCases){
  auto d=std::make_unique<Document>(c.w,c.h);CHECK(d->createFreeTileLayer(U"Legacy split line"));const auto before=d->canvasPixels();const auto history=d->historyPosition();
  BrushOptions brush;brush.opacity=50;const Point from{int(c.from.x),int(c.from.y)},to{int(c.to.x),int(c.to.y)};
  CHECK(d->paintFreeTileSourceLine(from,to,0xff123456,brush,nullptr,0,{},0,0,c.balanced,repeat::Mode(c.mode)));CHECK(!d->active()&&d->historyPosition()==history+1);
  auto expected=before;for(const auto& p:c.paint)if(p.x>=0&&p.y>=0&&p.x<c.w&&p.y<c.h)expected[std::size_t(p.y)*c.w+int(p.x)]=0x80123456;
  CHECK(d->canvasPixels()==expected);const auto after=d->timeline().state().tilesets.front().pixels;d->undo();CHECK(d->canvasPixels()==before);d->redo();CHECK(d->canvasPixels()==expected&&d->timeline().state().tilesets.front().pixels==after);
 }
 for(auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both})for(bool dynamic:{false,true})for(bool perfect:{false,true}){
  auto local=std::make_unique<Document>(8,6),copy=std::make_unique<Document>(8,6);
  SelectionClipboard tile;tile.width=3;tile.height=2;tile.pixels.assign(6,0xff112233);
  for(auto* d:{local.get(),copy.get()}){CHECK(d->createFreeTileLayer(U"Repeat source"));CHECK(d->pasteFreeTilePixels(tile,{2,2}));d->setFreeTilePaintMode(false);}
  const auto before=copy->canvasPixels();const auto sourceBefore=copy->timeline().state().tilesets.front().pixels;const auto instances=copy->cel().freeTiles->instances;const auto history=copy->historyPosition();
  BrushOptions b;b.size=1;b.perfectPixels=perfect;
  auto paint=[&](Document& d,bool repeated){const int dx=repeated&&repeat::includesX(mode)?8:0,dy=repeated&&repeat::includesY(mode)?-6:0;auto point=[&](Point p){return Point{p.x+dx,p.y+dy};};
   d.beginStroke(point({2,2}),0xffabcdef,b,nullptr,0,nullptr,!dynamic,false,false,repeated?mode:repeat::Mode::Off);CHECK(d.strokeActive());
   if(dynamic){d.configureStrokeDynamics(b,nullptr,0xffabcdef,0xffabcdef,0);d.updateDynamicStroke(point({2,2}),{2,2,1,100},true);d.updateDynamicStroke(point({3,3}),{3,3,1,100});}else d.updateStroke(point({3,3}));
  };
  paint(*local,false);paint(*copy,true);CHECK(copy->canvasPixels()==local->canvasPixels());CHECK(copy->canvasPixels()!=before);CHECK(copy->commitStroke());CHECK(local->commitStroke());CHECK(copy->historyPosition()==history+1);CHECK(copy->cel().freeTiles->instances==instances);
  const auto after=copy->canvasPixels();const auto sourceAfter=copy->timeline().state().tilesets.front().pixels;CHECK(sourceAfter==local->timeline().state().tilesets.front().pixels);
  copy->undo();CHECK(copy->canvasPixels()==before);CHECK(copy->timeline().state().tilesets.front().pixels==sourceBefore);copy->redo();CHECK(copy->canvasPixels()==after);CHECK(copy->timeline().state().tilesets.front().pixels==sourceAfter);
  copy->undo();paint(*copy,true);copy->cancelStroke();CHECK(copy->canvasPixels()==before);CHECK(copy->historyPosition()==history);CHECK(copy->timeline().state().tilesets.front().pixels==sourceBefore);
 }
 // Legacy source painting joins wrapped samples through the interior, whereas
 // raster painting follows the continuous repeated path across the seam.
 auto d=std::make_unique<Document>(8,6);CHECK(d->createFreeTileLayer(U"Seam source"));SelectionClipboard tile;tile.width=8;tile.height=1;tile.pixels.assign(8,0xff112233);CHECK(d->pasteFreeTilePixels(tile,{0,2}));d->setFreeTilePaintMode(false);
 begin(*d,{7,2},0xffabcdef,{},repeat::Mode::X);d->updateStroke({8,2});CHECK(d->commitStroke());for(int x=0;x<8;++x)CHECK(d->canvasPixels()[2*8+x]==0xffabcdef);
}
int main(){try{freeSourceRepeat();
 for(auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both}){Document d(8,6);BrushOptions b;b.size=3;b.shape=BrushShape::Square;d.beginStroke({0,0},0xffabcdef,{},nullptr,0,nullptr,false,false,false,mode);d.sprayStroke({{0,0}},b,0);CHECK(d.commitStroke());const auto painted=d.canvasPixels();CHECK(painted[0]);CHECK(bool(painted[7])==repeat::includesX(mode));CHECK(bool(painted[5*8])==repeat::includesY(mode));d.undo();CHECK(!d.canvasPixels()[0]);d.redo();CHECK(d.canvasPixels()==painted);}

 for(auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both})for(bool perfect:{false,true}){
  Document d(8,6);BrushOptions b;b.perfectPixels=perfect;b.opacity=50;
  const bool x=repeat::includesX(mode);begin(d,x?Point{7,2}:Point{2,5},0xff123456,b,mode);d.updateStroke(x?Point{9,2}:Point{2,7});CHECK(d.commitStroke());CHECK(d.historySize()==1);
  const auto pixels=d.pixels();CHECK((pixels[x?23:42]>>24)==128);CHECK((pixels[x?16:2]>>24)==128);CHECK((pixels[x?17:10]>>24)==128);CHECK(pixels[x?20:26]==0);d.undo();CHECK(std::all_of(d.pixels().begin(),d.pixels().end(),[](auto p){return !p;}));d.redo();CHECK(d.pixels()==pixels);
 }
 for(bool dynamic:{false,true}){Document d(8,6);BrushOptions b;b.size=3;b.shape=BrushShape::Square;begin(d,{0,0},0xffaabbcc,b,repeat::Mode::Both);if(dynamic){d.cancelStroke();d.beginStroke({0,0},0xffaabbcc,b,nullptr,0,nullptr,false,false,false,repeat::Mode::Both);d.configureStrokeDynamics(b,nullptr,0xff000000,0xffffffff,0);d.updateDynamicStroke({0,0},{0,0,3,100},true);d.updateDynamicStroke({-1,-1},{-1,-1,3,100});}CHECK(d.commitStroke());CHECK(d.pixels()[47]);CHECK(d.pixels()[0]);CHECK(!d.pixels()[3*8+3]);}
 {Document d(8,4);d.previewSelection(SelectionMask{0,1,1,1,{}});begin(d,{7,1},0xff123456,{},repeat::Mode::X);d.updateStroke({9,1});CHECK(d.commitStroke());CHECK(d.pixels()[8]);CHECK(!d.pixels()[15]&&!d.pixels()[9]);}
 {Document d(8,4);begin(d,{15,1},0xff123456,{},repeat::Mode::X);d.updateStroke({17,1});d.cancelStroke();CHECK(!d.canUndo());CHECK(std::all_of(d.pixels().begin(),d.pixels().end(),[](auto p){return !p;}));d.beginStroke({0,0},0xffabcdef);d.commitStroke();CHECK(!d.pixels()[7]);}
 {Document d(8,4);PatternBrush image;image.width=3;image.height=1;image.coverage={255,255,255};image.colors={0xff112233,0xff445566,0xff778899};begin(d,{0,1},0xffffffff,{},repeat::Mode::X,&image);CHECK(d.commitStroke());CHECK(d.pixels()[15]==0xff112233&&d.pixels()[8]==0xff445566&&d.pixels()[9]==0xff778899);d.undo();CHECK(!d.pixels()[15]);}
 {Document d(8,4);d.fillSelectionOrCanvas(0xff112233);const auto owner=d.layer().id,frame=d.frame().id;CHECK(d.createAttachedMask(owner,frame));const auto raster=d.pixels();begin(d,{7,1},0xff000000,{},repeat::Mode::X);d.updateStroke({8,1});CHECK(d.commitStroke());CHECK(d.pixels()==raster);d.undo();d.redo();}
 {Document d(8,4);BrushOptions b;b.size=3;b.shape=BrushShape::Square;auto preview=d.brushPreview({0,1},{0,1},0xff112233,b,nullptr,0,nullptr,false,repeat::Mode::X);begin(d,{0,1},0xff112233,b,repeat::Mode::X);d.commitStroke();for(std::size_t i=0;i<d.pixels().size();++i)CHECK(d.pixels()[i]==(preview.count(i)?preview.at(i):0));}

 for(auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both})for(bool copy:{false,true})for(bool deferred:{false,true}){
  Document d(deferred?300:8,deferred?300:4);const int w=d.width(),height=d.height();d.setDeferredFloatingDisplaySupported(deferred);d.setFloatingRepeat(mode);const bool x=repeat::includesX(mode);const Point start=x?Point{w-1,1}:Point{2,height-1},to=x?Point{w,1}:Point{2,height};
  d.beginStroke(start,0x80123456);d.commitStroke();const auto before=d.canvasPixels();d.previewSelection(SelectionMask{start.x,start.y,1,1,{}});const auto h=d.historyPosition();CHECK(d.beginSelectionContentMove(copy));CHECK(d.floatingDeferred()==deferred);d.moveFloatingPaste(to.x,to.y);
  if(d.floatingDeferred()){const auto overlay=d.floatingOverlayRegion({0,0,w,height});CHECK(overlay[x?w:2]==0x80123456);}
  CHECK(d.commitFloatingPaste());const auto after=d.canvasPixels();CHECK(after[x?w:2]==0x80123456);CHECK(after[x?w+4:2*w+2]==0);CHECK(after[std::size_t(start.y)*w+start.x]==(copy?0x80123456:0));CHECK(selectionContains(d.selection(),x?0:2,x?1:0));CHECK(d.historyPosition()==h+1);d.undo();CHECK(d.canvasPixels()==before);d.redo();CHECK(d.canvasPixels()==after);
  CHECK(d.beginSelectionContentMove(false));d.moveFloatingPaste(-9,-5);d.cancelFloatingPaste();CHECK(d.canvasPixels()==after);
 }
 {Document d(8,4);d.setFloatingRepeat(repeat::Mode::X);SelectionClipboard source;source.width=3;source.height=1;source.pixels={0xff112233,0xff445566,0xff778899};source.mask={1,1,1};CHECK(d.beginFloatingPaste(source,7,1));CHECK(d.commitFloatingPaste());CHECK(d.pixels()[15]==source.pixels[0]&&d.pixels()[8]==source.pixels[1]&&d.pixels()[9]==source.pixels[2]);d.undo();CHECK(!d.pixels()[8]);d.redo();CHECK(d.pixels()[9]==source.pixels[2]);}

 {Document d(8,4);d.fillSelectionOrCanvas(0xffffffff);const auto owner=d.layer().id,frame=d.frame().id;CHECK(d.createAttachedMask(owner,frame));d.beginStroke({7,1},0xff888888);CHECK(d.commitStroke());d.setFloatingRepeat(repeat::Mode::X);d.previewSelection(SelectionMask{7,1,1,1,{}});CHECK(d.beginSelectionContentMove(false));d.moveFloatingPaste(8,1);const auto before=d.pixels();CHECK(d.commitFloatingPaste());CHECK(d.pixels()==before);CHECK(selectionContains(d.selection(),0,1));d.undo();CHECK(selectionContains(d.selection(),7,1));d.redo();CHECK(selectionContains(d.selection(),0,1));}
 {Document d(8,4);d.beginStroke({7,1},0xff123456);d.commitStroke();const auto first=d.layer().id;d.addLayer();d.beginStroke({7,1},0xffabcdef);d.commitStroke();const auto second=d.layer().id;d.selectTimelineLayer(first);d.selectTimelineLayer(second,1);d.setFloatingRepeat(repeat::Mode::X);d.previewSelection(SelectionMask{7,1,1,1,{}});CHECK(d.beginSelectionContentMove(false));d.moveFloatingPaste(8,1);CHECK(d.commitFloatingPaste());CHECK(d.pixels()[8]==0xffabcdef&&!d.pixels()[15]);d.selectLayer(first);CHECK(d.pixels()[8]==0xff123456&&!d.pixels()[15]);d.undo();d.selectLayer(first);CHECK(d.pixels()[15]==0xff123456);}

 {Document d(8,4);d.setFloatingRepeat(repeat::Mode::X);d.beginStroke({7,1},0x80112233);d.commitStroke();d.beginStroke({0,1},0x80445566);d.commitStroke();const auto before=d.canvasPixels();d.previewSelection(SelectionMask{7,1,2,1,{}});CHECK(d.beginSelectionContentMove(false));d.moveFloatingPaste(8,1);CHECK(d.commitFloatingPaste());CHECK(d.canvasPixels()[8]==brushComposite(before[8],before[15],100));CHECK(!d.canvasPixels()[15]);d.undo();CHECK(d.canvasPixels()==before);}

 {Document d(8,4);RasterHistoryFixture::removeActive(d);d.setFloatingRepeat(repeat::Mode::X);SelectionClipboard source;source.width=3;source.height=1;source.pixels={0xff112233,0xff445566,0xff778899};source.mask={1,1,1};CHECK(d.beginFloatingPaste(source,7,1));CHECK(d.floatingDeferred());CHECK(d.floatingOverlayRegion({0,0,8,4})[8]==source.pixels[1]);CHECK(d.commitFloatingPaste());const auto after=d.canvasPixels();CHECK(after[8]==source.pixels[1]&&after[15]==source.pixels[0]);d.undo();const auto undone=d.canvasPixels();CHECK(std::all_of(undone.begin(),undone.end(),[](auto p){return !p;}));d.redo();CHECK(d.canvasPixels()==after);}

 for(auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both})for(bool erase:{false,true}){
  Document d(10,8);d.beginStroke({0,0},0xff123456);d.commitStroke();CHECK(d.convertLayerToTilemap(2,2,U"Repeat Paint"));d.setTilemapMode(tiles::Mode::Paint);const auto before=d.timeline().resolveSurface(d.cel().id).source->tilemap->cells;const auto sheet=d.timeline().state().tilesets.front().pixels;const auto history=d.historyPosition();const bool x=repeat::includesX(mode);const Point a=x?Point{9,3}:Point{3,7},b=x?Point{11,3}:Point{3,9};
  d.beginStroke(a,0xff123456,{},nullptr,0,nullptr,true,false,erase,mode);d.updateStroke(b);d.commitStroke();const auto after=d.timeline().resolveSurface(d.cel().id).source->tilemap->cells;
  const int first=x?9:16,last=x?5:1,middle=x?7:11;
  if(!erase){CHECK(after[first]&&after[last]);CHECK(after[middle]==before[middle]);CHECK(d.historyPosition()==history+1);d.undo();CHECK(d.timeline().resolveSurface(d.cel().id).source->tilemap->cells==before);d.redo();CHECK(d.timeline().resolveSurface(d.cel().id).source->tilemap->cells==after);}
  CHECK(d.timeline().state().tilesets.front().pixels==sheet);
  d.beginStroke(a,0xff123456,{},nullptr,0,nullptr,true,false,!erase,mode);d.updateStroke(b);d.cancelStroke();CHECK(d.timeline().resolveSurface(d.cel().id).source->tilemap->cells==after);
 }

 for(const auto& c:repeatCellLineCases){Document d(c.columns*2,c.rows*2);d.fillSelectionOrCanvas(0xff123456);CHECK(d.convertLayerToTilemap(2,2,U"Legacy path"));d.setTilemapMode(tiles::Mode::Paint);const auto before=d.cel().tilemap->cells;const auto history=d.historyPosition();auto point=[&](int index){return Point{index%c.columns*2,index/c.columns*2};};d.beginStroke(point(c.from),0,{},nullptr,0,nullptr,true,false,true,repeat::Mode(c.mode));d.updateStroke(point(c.to));CHECK(d.commitStroke());auto expected=before;for(int index:c.expected)expected[index].reset();CHECK(d.cel().tilemap->cells==expected);CHECK(d.historyPosition()==history+1);d.undo();CHECK(d.cel().tilemap->cells==before);d.redo();CHECK(d.cel().tilemap->cells==expected);}
 std::cout<<"Repeated solid/perfect/dynamic coverage, selection, cancel and undo passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
