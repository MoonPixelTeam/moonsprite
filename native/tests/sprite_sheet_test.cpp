#include "sprite_sheet.h"
#include <iostream>
using namespace moon;
void check(bool x){if(!x)throw std::runtime_error("sprite sheet regression");}
int main(){try{
 Document d(1,1);d.beginStroke({0,0},0xff0000ff);d.commitStroke();auto first=d.frame().id;d.addFrame();d.beginStroke({0,0},0xff00ff00);d.commitStroke();d.addFrame();d.beginStroke({0,0},0xffff0000);d.commitStroke();d.markSaved();SpriteSheetOptions o;o.constraint=SheetConstraint::FixedColumns;o.fixedColumns=2;auto sheet=encodeSpriteSheet(d,o);check(sheet.width==2&&sheet.height==2&&sheet.pixels==std::vector<Pixel>({0xff0000ff,0xff00ff00,0xffff0000,0}));
 o.layout=SheetLayout::Columns;o.constraint=SheetConstraint::FixedRows;o.fixedRows=2;sheet=encodeSpriteSheet(d,o);check(sheet.pixels==std::vector<Pixel>({0xff0000ff,0xffff0000,0xff00ff00,0}));
 o.layout=SheetLayout::Rows;o.constraint=SheetConstraint::FixedWidth;o.fixedWidth=5;sheet=encodeSpriteSheet(d,o);check(sheet.width==5&&sheet.height==1&&sheet.pixels[3]==0);
 d.addLinkedFrame();o.constraint=SheetConstraint::None;o.mergeDuplicates=true;sheet=encodeSpriteSheet(d,o);check(sheet.width==3);d.addFrame();o.ignoreEmpty=true;check(encodeSpriteSheet(d,o).width==3);
 d.selectFrame(first);o.frameScope="selected";check(encodeSpriteSheet(d,o).width==1);d.selectFrame(first);o.frameScope="all";auto active=d.frame().id;auto h=d.historySize(),revision=d.revision();encodeSpriteSheet(d,o);check(d.frame().id==active&&d.historySize()==h&&d.revision()==revision);
 SpriteSheetOptions m;m.layout=SheetLayout::Rows;m.constraint=SheetConstraint::FixedWidth;m.fixedWidth=5;auto metrics=spriteSheetMetrics(3,2,1,m);check(metrics.columns==2&&metrics.rows==2&&metrics.width==5&&metrics.height==2);m.layout=SheetLayout::Columns;m.constraint=SheetConstraint::FixedHeight;m.fixedHeight=1;metrics=spriteSheetMetrics(3,2,2,m);check(metrics.columns==3&&metrics.rows==1&&metrics.width==6&&metrics.height==2);
 // Split layers retain timeline order, independent duplicate/empty filtering,
 // and transparent padding when component sheets have different widths.
 Document split(1,1);split.beginStroke({0,0},0xff0000ff);split.commitStroke();auto bottom=split.layer().id;auto f1=split.frame().id;
 split.addFrame();auto f2=split.frame().id;split.beginStroke({0,0},0xff00ff00);split.commitStroke();
 split.addLayer();split.selectFrame(f1);split.beginStroke({0,0},0xffff0000);split.commitStroke();split.selectFrame(f2);split.beginStroke({0,0},0xffff0000);split.commitStroke();split.markSaved();
 const auto sourcePixels=split.pixels();const auto history=split.historySize();
 SpriteSheetOptions sp;sp.layerScope="all";sp.splitLayers=true;sp.mergeDuplicates=true;auto result=buildSpriteSheetImage(split,sp);
 check(result.width==2&&result.height==2);check(result.pixels==std::vector<Pixel>({0xffff0000,0,0xff0000ff,0xff00ff00}));
 timeline::LoopSection loop;loop.name=U"reverse";loop.startFrameId=f1;loop.endFrameId=f2;loop.direction="reverse";split.createLoopSection(loop);sp.splitLoopSections=true;result=buildSpriteSheetImage(split,sp);check(result.pixels==std::vector<Pixel>({0xffff0000,0,0xff00ff00,0xff0000ff}));
 sp.layerScope="selected";sp.selectedLayerIds={bottom};sp.mergeDuplicates=false;result=encodeSpriteSheet(split,sp);check(!result.png.empty()&&result.width==2&&result.height==1);
 check(split.pixels()==sourcePixels&&split.historySize()==history+1);
 Document empty(1,1);empty.addLayer();SpriteSheetOptions ep;ep.splitLayers=true;ep.ignoreEmpty=true;bool noItems=false;try{buildSpriteSheetImage(empty,ep);}catch(const std::runtime_error&){noItems=true;}check(noItems);
 std::cout<<"sprite sheet checks passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 1;}}
