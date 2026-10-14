#include "document.h"
#include "canvas_view.h"
#include <cstdlib>
#include <iostream>
#include <limits>
#include <stdexcept>
#define CHECK(x) do { if (!(x)) throw std::runtime_error(#x); } while (false)
using namespace moon;
constexpr Pixel ink = 0xff3379ff;
void dot(Document& d, int x, int y, Pixel p = ink) { d.beginStroke({x,y},p); d.commitStroke(); }
int main() {
  try {
    {
      Document d(2,2);const auto firstLayer=d.layer().id;const auto firstFrame=d.frame().id;
      CHECK(!d.layer().autoLinkAnimationCels);d.beginStroke({0,0},0xff123456);d.commitStroke();
      const auto source=d.cel().id;d.addLayer();const auto active=d.layer().id;
      d.setLayerAutoLinkAnimationCels(firstLayer,true);CHECK(d.layer().id==active);
      CHECK(d.timeline().state().layers[1].autoLinkAnimationCels);d.undo();CHECK(!d.timeline().state().layers[1].autoLinkAnimationCels);d.redo();
      d.addFrame();const auto second=d.frame().id;
      CHECK(d.timeline().findCel(firstLayer,second)->linkedCelId==source);CHECK(!d.cel().linkedCelId);
      d.selectLayer(firstLayer);d.beginStroke({1,1},0xffabcdef);d.commitStroke();d.selectFrame(firstFrame);CHECK(d.pixels()[3]==0xffabcdef);
      d.selectFrame(second);d.addFrame(true);CHECK(d.cel().linkedCelId==source);
      d.undo();CHECK(d.frame().id==second);d.redo();CHECK(d.cel().linkedCelId==source);
      d.setLayerAutoLinkAnimationCels(firstLayer,false);CHECK(d.cel().linkedCelId==source);d.addFrame(true);CHECK(!d.cel().linkedCelId);
      Document empty(1,1);empty.setLayerAutoLinkAnimationCels(empty.layer().id,true);empty.addFrame();CHECK(!empty.cel().linkedCelId);
    }
    {
      const auto builtin=Document::withBuiltinPalette();
      CHECK(builtin.palette().entries.size()==32 && builtin.palette().slots.size()==32);
      CHECK(builtin.palette().slots.front()==1 && builtin.palette().slots.back()==32 && builtin.palette().nextId==33);
      CHECK(builtin.paletteEntry(1)->color==0xffffffff && builtin.paletteEntry(2)->color==0xffeae0d9);
      CHECK(!builtin.dirty() && !builtin.canUndo() && builtin.palette().selected.empty());
    }
    {
      Document original(3,2);dot(original,1,1);const auto identity=original.identity();
      timeline::State imported{{original.layer()},{original.frame()},{original.cel()}};
      imported.layers[0].id="saved-layer";imported.cels[0].layerId="saved-layer";imported.cels[0].id="saved-cel";
      auto bytes=std::make_shared<const std::vector<std::uint8_t>>(std::vector<std::uint8_t>{1,2,3});
      auto candidate=Document::fromImported(3,2,imported,original.palette(),"saved-project",U"中文工程",bytes);
      CHECK(candidate.identity()!=identity && candidate.projectId()=="saved-project" && candidate.name()==U"中文工程");
      CHECK(candidate.pixels()==original.pixels() && !candidate.dirty() && !candidate.canUndo() && candidate.sourceArchive()==bytes);
      CHECK(candidate.cel().id=="saved-cel" && candidate.layer().id=="saved-layer");
      dot(candidate,0,0);candidate.undo();CHECK(candidate.dirty() && candidate.pixels()==original.pixels());
      imported.cels[0].surface->offsetX=1;bool refused=false;
      try {Document::fromImported(3,2,imported,original.palette(),"saved-project",U"test",bytes);} catch(const std::invalid_argument&){refused=true;}
      CHECK(refused && original.identity()==identity && original.dirty() && original.canUndo());
    }
    {Document d(2,2);const auto rev=d.revision(),cr=d.contentRevision();d.beginLayerOpacity();for(int i=0;i<80;++i)d.previewLayerOpacity(i/100.0);CHECK(!d.dirty()&&d.historySize()==0&&d.revision()==rev&&d.contentRevision()>cr&&d.active());d.cancelLayerOpacity();CHECK(d.layer().opacity==1&&!d.dirty()&&!d.active());d.beginLayerOpacity();d.previewLayerOpacity(.2);d.previewLayerOpacity(.4);d.commitLayerOpacity();CHECK(d.historySize()==1&&d.dirty()&&d.layer().opacity==.4);d.undo();CHECK(d.layer().opacity==1);d.redo();CHECK(d.layer().opacity==.4);}
    {Document d(2,2);dot(d,0,0);const auto pixels=d.pixels();const auto h=d.historySize();d.setLayerOpacity(.5);CHECK(d.layer().opacity==.5 && d.pixels()==pixels && d.historySize()==h+1);d.undo();CHECK(d.layer().opacity==1);d.redo();CHECK(d.layer().opacity==.5);d.setLayerVisible(false);CHECK(!d.layer().visible);d.undo();CHECK(d.layer().visible);d.setLayerOpacity(2);CHECK(d.layer().opacity==1);const auto size=d.historySize();d.setLayerOpacity(1);CHECK(d.historySize()==size);}
    // legacy createDocument: first frame 100ms, stable layer/cel association,
    // initial cel and the drawing adapter expose the same pixel allocation.
    {
      Document doc(7,5),other(7,5);
      const auto layer=doc.layer().id,cel=doc.cel().id;
      CHECK(layer!=other.layer().id && cel!=other.cel().id);
      CHECK(doc.frame().id=="frame-1" && doc.frame().duration==100);
      CHECK(doc.cel().layerId==layer && doc.cel().frameId==doc.frame().id);
      CHECK(doc.cel().surface->width==7 && doc.cel().surface->height==5);
      CHECK(doc.cel().surface->offsetX==0 && doc.cel().surface->offsetY==0);
      CHECK(doc.layer().visible && !doc.layer().locked && doc.layer().opacity==1);
      CHECK(&doc.pixels()==&doc.cel().surface->pixels && !doc.dirty());
      dot(doc,2,3);const auto revision=doc.contentRevision();
      CHECK(doc.cel().surface->pixels[23]==ink && doc.dirty());
      doc.undo();CHECK(doc.cel().surface->pixels[23]==0 && doc.dirty());
      doc.redo();CHECK(doc.cel().surface->pixels[23]==ink && doc.contentRevision()>revision);
      doc.markSaved();doc.beginStroke({1,1},ink);doc.cancelStroke();
      CHECK(!doc.dirty() && doc.cel().surface->pixels[8]==0);
      CHECK(doc.layer().id==layer && doc.cel().id==cel && doc.cel().layerId==layer);
    }

    // Direct legacy integer ellipse golden mask and original-pixel coverage.
    {
      Document brush(12,12);BrushOptions options{5,100,BrushShape::Round};
      brush.beginStroke({6,6},ink,options);brush.commitStroke();
      const char* mask[]={"01110","11111","11111","11111","01110"};
      for(int y=0;y<5;++y) for(int x=0;x<5;++x) CHECK((brush.pixels()[(y+4)*12+x+4]==ink)==(mask[y][x]=='1'));
      brush.undo();options={4,100,BrushShape::Square};brush.beginStroke({0,0},ink,options);brush.commitStroke();
      for(int y=0;y<12;++y) for(int x=0;x<12;++x) CHECK((brush.pixels()[y*12+x]==ink)==(x<2 && y<2));
      brush.undo();options={4,100,BrushShape::Line};brush.beginStroke({6,6},ink,options);brush.commitStroke();
      for(int y=0;y<12;++y) for(int x=0;x<12;++x) CHECK((brush.pixels()[y*12+x]==ink)==(y==6 && x>=4 && x<8));
      brush.undo();options={1,50,BrushShape::Round};brush.beginStroke({3,3},0xff0000ff,options);brush.updateStroke({7,3});brush.updateStroke({3,3});brush.commitStroke();
      CHECK(brush.pixels()[3*12+4]==0x800000ff);CHECK(brush.historySize()==1);
      brush.beginStroke({3,3},0xff0000ff,options);brush.updateStroke({7,3});brush.cancelStroke();CHECK(brush.pixels()[3*12+4]==0x800000ff);
      brush.beginStroke({4,3},0,options);brush.commitStroke();CHECK(brush.pixels()[3*12+4]==0x400000ff);brush.undo();CHECK(brush.pixels()[3*12+4]==0x800000ff);
      const auto before=brush.pixels();options.opacity=0;brush.beginStroke({0,0},ink,options);CHECK(!brush.commitStroke());CHECK(brush.pixels()==before && brush.canRedo());
      CHECK(brushComposite(0xffff0000,0xff0000ff,50)==0xff7f0080);
      CHECK(brushComposite(0xff0000ff,0,100)==0);
      for(int size=1;size<=64;++size) for(auto shape:{BrushShape::Round,BrushShape::Square,BrushShape::Line}) {
        auto spans=brushSpans({size,100,shape});CHECK(!spans.empty());for(const auto& span:spans) CHECK(span.y>=0 && span.y<size && span.left>=0 && span.right<size);
      }
    }
    // Legacy workspace-palette-history.test.ts / PalettePanel.selection.test.ts:
    // stable duplicate IDs, allocator rollback, shared history and role isolation.
    {
      Document p;const auto pixels=p.pixels();const auto revision=p.contentRevision();
      CHECK(p.palette().order()==std::vector<int>({1,2}));
      CHECK(p.paletteEntry(1)->color==0xff211b18);CHECK(p.paletteEntry(2)->color==0xffff7929);
      p.selectPalette(1);p.selectPalette(2,true);CHECK(p.palette().selected==std::vector<int>({1,2}));
      p.selectPalette(2,true);CHECK(p.palette().primaryId==1);
      const auto primary=p.palette().primary;p.selectSecondaryPalette(2);CHECK(p.palette().primary==primary);
      CHECK(!p.dirty() && p.historySize()==0);
      const int duplicate=p.addPaletteColor(primary);CHECK(duplicate==3 && p.palette().nextId==4);
      CHECK(p.historySize()==1 && p.palette().primary==primary);
      p.undo();CHECK(p.palette().nextId==3 && !p.paletteEntry(3));p.redo();CHECK(p.paletteEntry(3)->color==primary);
      p.deletePaletteColors({1,3});CHECK(p.palette().order()==std::vector<int>({2}));
      CHECK(p.paletteEntry(1) && p.paletteEntry(3));CHECK(p.palette().slots[0]==0 && p.palette().slots[2]==0);
      p.undo();CHECK(p.palette().order()==std::vector<int>({1,2,3}));
      p.selectPalette(1);p.updatePaletteColor(1,ink);CHECK(p.palette().primary==ink);
      p.undo();CHECK(p.paletteEntry(1)->color==primary && p.palette().primary==primary);
      p.redo();CHECK(p.paletteEntry(1)->color==ink);
      p.renamePaletteColor(1,U"  名称  ");CHECK(p.paletteEntry(1)->name==U"名称");p.undo();CHECK(p.paletteEntry(1)->name==U"墨黑");p.redo();
      const auto count=p.historySize();p.renamePaletteColor(1,U"名称");p.updatePaletteColor(1,ink);CHECK(p.historySize()==count);
      CHECK(p.pixels()==pixels && p.contentRevision()==revision);
      dot(p,0,0);p.undo();CHECK(p.pixels()==pixels);p.undo();CHECK(p.paletteEntry(1)->name==U"墨黑");
      p.redo();p.redo();CHECK(p.pixels()[0]==ink);
      p.setPaletteRole(0xff123456,false,true);CHECK(p.paletteEntry(1)->color==ink);
      p.selectPalette(1);p.setPaletteRole(0xff654321,false,false);CHECK(p.paletteEntry(1)->color==0xff654321);
      p.undo();CHECK(p.paletteEntry(1)->color==ink);
      p.clearPaletteSelection();const auto original=p.palette().primary;
      const int transparent=p.addPaletteColor(0,false);CHECK(p.palette().selected.empty() && p.palette().primary==original);
      p.undo();p.redo();CHECK(p.palette().selected.empty() && p.palette().primary==original);
      CHECK(p.addPaletteColor(0,false)!=transparent);
      while(p.palette().order().size()<8) p.addPaletteColor(ink,false);
      const auto order=p.palette().order();p.selectPalette(order[1]);p.selectPaletteRange(order[6],4);
      CHECK(p.palette().selected==std::vector<int>({order[1],order[2],order[5],order[6]}));
    }
    {
      // legacy palette-duplicates.test.ts: holes must retain their grid positions.
      Document p;while(p.palette().order().size()<6) p.addPaletteColor(ink,false);
      p.deletePaletteColors({5});const auto slots=p.palette().slots;
      p.selectPalette(1);p.selectPaletteRange(6,3);
      CHECK(p.palette().selected==std::vector<int>({1,2,3,4,6}));
      p.selectPalette(1);p.selectPaletteSlotRange(4,3);
      CHECK(p.palette().selected==std::vector<int>({1,2,4}));
      CHECK(p.palette().primaryId==4 && p.palette().slots==slots);
      const int added=p.addPaletteColor(ink,false,7);
      CHECK(p.palette().slots[4]==0 && p.palette().slots[7]==added);
      p.undo();CHECK(p.palette().slots==slots && !p.paletteEntry(added));
      p.redo();CHECK(p.palette().slots[4]==0 && p.palette().slots[7]==added);
    }
    Document d; const auto empty = d.pixels();
    dot(d,3,4); CHECK(d.pixels()[4*32+3] == ink); CHECK(d.historySize()==1);
    d.undo(); CHECK(d.pixels()==empty); CHECK(d.dirty());
    d.redo(); CHECK(d.dirty()); d.markSaved(); CHECK(!d.dirty());
    d.beginStroke({1,2},ink); d.updateStroke({10,2}); d.commitStroke();
    for(int x=1;x<=10;++x) CHECK(d.pixels()[2*32+x]==ink);
    d.undo(); CHECK(d.dirty()); CHECK(d.canRedo());
    d.beginStroke({0,0},ink); d.updateStroke({31,31}); d.cancelStroke();
    CHECK(d.dirty()); CHECK(d.canRedo());
    dot(d,3,4); CHECK(d.canRedo()); // no-op must preserve redo
    dot(d,0,0,0); CHECK(d.canRedo());
    d.redo(); d.markSaved(); d.undo(); dot(d,6,6);
    CHECK(d.dirty()); CHECK(!d.canRedo()); // history navigation and subsequent edits remain dirty
    const auto before = d.pixels(); dot(d,3,4,0); CHECK(d.pixels()[4*32+3]==0);
    d.undo(); CHECK(d.pixels()==before);
    Document corner;
    corner.beginStroke({2,2},ink); corner.updateStroke({2,8}); corner.updateStroke({8,8}); corner.commitStroke();
    CHECK(corner.pixels()[6*32+2]==ink); CHECK(corner.pixels()[8*32+6]==ink); CHECK(corner.pixels()[5*32+5]==0);
    corner.undo(); CHECK(corner.pixels()==empty);
    Document edge;
    edge.beginStroke({-5,4},ink); edge.updateStroke({36,4}); edge.commitStroke();
    for(int y=0;y<32;++y) for(int x=0;x<32;++x) CHECK(edge.pixels()[y*32+x]==(y==4?ink:0));
    edge.undo(); edge.beginStroke({-3,-3},ink); edge.updateStroke({-1,35}); CHECK(!edge.commitStroke());
    CHECK(edge.pixels()==empty); CHECK(edge.canRedo());
    edge.beginStroke({std::numeric_limits<int>::min(),10},ink);
    edge.updateStroke({std::numeric_limits<int>::max(),10}); edge.commitStroke();
    CHECK(edge.pixels()[10*32]==ink); CHECK(edge.pixels()[10*32+31]==ink);
    Document diagonal;
    diagonal.beginStroke({0,0},ink); diagonal.updateStroke({32,3}); diagonal.commitStroke();
    CHECK(diagonal.pixels()[2*32+26]==ink); CHECK(diagonal.pixels()[3*32+26]==0);
    Document forward,reverse;
    forward.beginStroke({0,0},ink);forward.updateStroke({4,2});forward.commitStroke();
    reverse.beginStroke({4,2},ink);reverse.updateStroke({0,0});reverse.commitStroke();
    CHECK(forward.pixels()[1]==ink); CHECK(reverse.pixels()[33]==ink);
    CHECK(forward.pixels()!=reverse.pixels());
    const auto singlePass=forward.pixels();
    forward.beginStroke({0,0},ink);forward.updateStroke({4,2});CHECK(!forward.commitStroke());
    CHECK(forward.pixels()==singlePass);
    edge.beginStroke({0,0},ink); edge.undo(); CHECK(!edge.active());
    CHECK(floorDivide(-1,8)==-1); CHECK(floorDivide(7,8)==0); CHECK(floorDivide(8,8)==1);
    CHECK(nextCanvasScale(8,1)==10); CHECK(nextCanvasScale(8,-1)==6);
    CHECK(nextCanvasScale(1,-1)==0.666667); CHECK(nextCanvasScale(64,1)==64);
    CHECK(clampCanvasAxis(-999,10,300,100)==-40);
    CHECK(clampCanvasAxis(999,10,300,100)==260);
    CHECK(clampCanvasAxis(-999,10,300,600)==-440);
    CHECK(clampCanvasAxis(999,10,300,600)==160);
    CHECK(clampCanvasAxis(75,10,300,100)==75);
    CanvasPan pan;pan.begin({100,90},{25,-30});
    const auto dragged=pan.move({137,65});CHECK(dragged.x==62 && dragged.y==-55);
    CHECK(pan.origin.x==25 && pan.origin.y==-30); // cancellation origin stays intact
    pan.end();CHECK(!pan.active);
    for(double scale:canvasZoomLevels) for(int direction:{-1,1}) {
      const double next=nextCanvasScale(scale,direction);
      for(Point anchor:{Point{13,21},Point{-30,-20},Point{320,241}}) {
        const Point origin{-17,5};
        const auto moved=zoomedCanvasOrigin(origin,anchor,scale,next);
        CHECK(std::abs((anchor.x-moved.x)-double(anchor.x-origin.x)*next/scale)<=0.5);
        CHECK(std::abs((anchor.y-moved.y)-double(anchor.y-origin.y)*next/scale)<=0.5);
        if(next>=1) {
          const auto pixel=canvasPixel({moved.x+int(3*next),moved.y+int(4*next)},moved,next);
          CHECK(pixel.x==3 && pixel.y==4);
        }
        CHECK(canvasPixel({moved.x-1,moved.y-1},moved,next).x<0);
      }
    }
    // Direct legacy selection.ts forEachRasterLinePoint oracle, deliberately
    // different from the optimized bounded native implementation.
    for(int ax=-2;ax<10;++ax) for(int ay=-2;ay<10;++ay)
      for(int bx=-2;bx<10;++bx) for(int by=-2;by<10;++by) {
        Document actual(8,8);actual.beginStroke({ax,ay},ink);actual.updateStroke({bx,by});actual.commitStroke();
        std::vector<Pixel> expected(64);
        int x=ax,y=ay,dx=std::abs(bx-ax),dy=std::abs(by-ay),sx=ax<bx?1:-1,sy=ay<by?1:-1,error=dx-dy;
        while(true) {
          if(x>=0 && y>=0 && x<8 && y<8) expected[y*8+x]=ink;
          if(x==bx && y==by) break;
          const int doubled=error*2;
          if(doubled>-dy) {error-=dy;x+=sx;}
          if(doubled<dx) {error+=dx;y+=sy;}
        }
        CHECK(actual.pixels()==expected);
      }
    Document revisions(1024,1024);
    auto epoch=revisions.contentRevision();
    revisions.beginStroke({5,7},ink);
    CHECK(revisions.contentRevision()==epoch+1);
    CHECK(revisions.lastContentChange().w==1 && revisions.lastContentChange().h==1);
    revisions.updateStroke({5,7});CHECK(revisions.contentRevision()==epoch+1);
    revisions.cancelStroke();CHECK(revisions.contentRevision()==epoch+2 && !revisions.dirty());
    Document bounded(8,8,1,2);
    dot(bounded,1,1);dot(bounded,2,2);CHECK(bounded.historySize()==1);
    bounded.undo();CHECK(bounded.pixels()[9]==ink && bounded.pixels()[18]==0);
    bounded.redo();CHECK(bounded.pixels()[18]==ink);
    Document countBounded(8,8,100000,2);
    dot(countBounded,1,1);dot(countBounded,2,2);dot(countBounded,3,3);CHECK(countBounded.historySize()==2);
    CHECK(nextCanvasScale(0.0625,-1)==0.0625);
    bool rejected=false; try { Document invalid(0,32); } catch(const std::invalid_argument&) { rejected=true; } CHECK(rejected);
    std::cout << "PASS: transactions, cancel, no-op, corners, clipping, redo branches, saved identities, coordinates\n";
    return 0;
  } catch(const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
}
