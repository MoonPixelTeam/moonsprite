#include "sprite_sheet.h"
#include <iostream>
#include <stdexcept>
using namespace moon;
void check(bool ok,const char* error){if(!ok)throw std::runtime_error(error);}
int main(){try{
 auto source=Document::withBuiltinPalette(2,1,U"源&项目");source.beginStroke({0,0},0x80332211);source.commitStroke();
 const auto pixels=source.pixels();const auto revision=source.revision(),history=source.historySize();
 auto sheet=createSpriteSheetDocument(source,{});
 // Real legacy createSpriteSheetDocument + document-model oracle: sheetdoc-legacy-oracle.json.
 check(sheet.name()==U"源&项目 - 精灵表"&&sheet.layer().name==U"精灵表","legacy names");
 check(sheet.width()==2&&sheet.height()==1&&sheet.pixels()==std::vector<Pixel>{0x80332211,0},"legacy raster");
 check(sheet.palette().entries.size()==2&&sheet.palette().entries[0].color==0xff211b18&&sheet.palette().entries[1].color==0xffff7929,"legacy default palette, not source palette");
 check(sheet.palette().slots==std::vector<int>({1,2,0,0,0,0,0,0})&&sheet.palette().nextId==3,"legacy palette metadata");
 check(sheet.timeline().state().layers.size()==1&&sheet.timeline().state().frames.size()==1&&sheet.frame().id=="frame-1"&&sheet.frame().duration==100&&sheet.timeline().state().cels.size()==1,"legacy single cel/frame");
 check(sheet.dirty()&&!sheet.canUndo()&&!sheet.canRedo()&&sheet.historySize()==0&&!sheet.sourceArchive()&&sheet.sourceFilePath().empty()&&sheet.projectId().empty()&&sheet.identity()!=source.identity(),"new dirty session without imported identity/history");
 check(source.pixels()==pixels&&source.historySize()==history&&source.revision()==revision&&source.dirty(),"source unchanged");
 source.addLayer();SpriteSheetOptions split;split.splitLayers=true;auto expected=buildSpriteSheetImage(source,split);auto stacked=createSpriteSheetDocument(source,split);check(stacked.pixels()==expected.pixels&&stacked.width()==expected.width&&stacked.height()==expected.height,"existing split result used directly");
 auto large=Document(1024,1);large.addFrame();check(buildSpriteSheetImage(large,{}).width==2048,"large file raster remains supported");bool rejected=false;try{createSpriteSheetDocument(large,{});}catch(const std::invalid_argument& e){rejected=std::string(e.what()).find("1024")!=std::string::npos;}check(rejected,"oversize editable document rejected");
 bool badLength=false;try{Document::fromSpriteSheetRaster(2,1,{0},U"bad");}catch(const std::invalid_argument&){badLength=true;}check(badLength,"incomplete raster rejected");
 std::cout<<"Sheet new document legacy metadata/raster/source/oversize checks passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 1;}}
