#include "editor_preferences.h"
#include <iostream>
#include <stdexcept>
using namespace moon::preferences;
void check(bool value){if(!value)throw std::runtime_error("Editor preference regression");}
int main(){try{
 check(moon::normalizeLayerDisplayColors(std::vector<std::array<double,3>>{{1.5,2,3},{2,2,3},{-1,2,3},{255,255,255}})==std::vector<moon::timeline::Pixel>({0xff030202u,0xffffffffu}));check(moon::decodeLayerDisplayColors("bad!")==moon::defaultLayerDisplayColors());check(moon::normalizeLayerDisplayColors(std::vector<moon::timeline::Pixel>{0x00112233u,0xff112233u})==std::vector<moon::timeline::Pixel>{0xff112233u});moon::timeline::State colors;colors.layers={{"A",U"A"}};colors.layers[0].displayColor=0xff112233u;check(moon::nextAvailableLayerDisplayColor(colors,{0xff112233u,0xff445566u})==0xff445566u);colors.layers[0].displayColor=0x40112233u;check(moon::nextAvailableLayerDisplayColor(colors,{0xff112233u,0xff445566u})==0xff112233u);
 RuntimeSettings prefs;check(prefs.index("files.exportProtection.Select")==0);prefs.set("files.exportProtection.Select","2");check(prefs.flag("files.exportSoundEnabled"));prefs.set("files.exportSoundEnabled","false");
 check(RuntimeSettings::normalizeExportScales({250.4,100,250,0,6401,6400,1.5})==std::vector<int>({250,100,6400,2}));check(RuntimeSettings::normalizeExportScales({})==std::vector<int>({100,200,400,1000,2000}));check(RuntimeSettings::decodeExportScales("bad")==prefs.exportScales);prefs.exportScales={150,250};check(prefs.defaultExportScale()==150);prefs.exportScales={250,100,150};check(prefs.defaultExportScale()==100);
 check(prefs.flag("editing.canvasViewScrollbarsEnabled"));check(prefs.flag("editing.wheelZoomEnabled"));
 check(prefs.index("editing.wheelZoomMode.Select")==1);check(prefs.index("editing.viewDragSensitivity.Select")==2);
 prefs.set("editing.wheelZoomEnabled","false");prefs.set("editing.viewDragSensitivity.Select","4");
 prefs.layerDisplayColors={0xff112233u,0xff445566u};
 prefs.set("files.exportFormat.Select","6");prefs.set("cursor.selectionPreviewColor.Color","#123456");prefs.set("files.saveDirectory.Text",R"(D:\作品 目录\save)");
 std::istringstream input(prefs.encode());auto loaded=RuntimeSettings::decode(input);
 check(loaded.values==prefs.values&&loaded.exportScales==prefs.exportScales&&loaded.layerDisplayColors==prefs.layerDisplayColors);check(loaded.index("files.exportProtection.Select")==2);check(!loaded.flag("files.exportSoundEnabled"));check(loaded.index("files.exportFormat.Select")==6);check(!loaded.flag("editing.wheelZoomEnabled"));
 for(auto text:{"-1","5","1.5","NaN","2x"}){bool rejected=false;try{loaded.set("editing.viewDragSensitivity.Select",text);}catch(const std::exception&){rejected=true;}check(rejected);}
 loaded.set("cursor.brushEdgeThickness.Number","100");check(loaded.index("cursor.brushEdgeThickness.Number")==8);
 for(auto text:{"bad","#12345","#GG0000"}){bool rejected=false;try{loaded.set("cursor.selectionPreviewColor.Color",text);}catch(const std::exception&){rejected=true;}check(rejected);}
 loaded.set("undo.historyLimit.Number","999999");check(loaded.index("undo.historyLimit.Number")==10000);check(!loaded.flag("undo.historyLimitEnabled"));
 std::istringstream future("MoonSprite editor-preferences 1\n\"future.option\" \"preserve this\"\n");auto futureSettings=RuntimeSettings::decode(future);check(futureSettings.values.at("future.option")=="preserve this");check(futureSettings.encode().find("preserve this")!=std::string::npos);
 bool rejected=false;try{std::istringstream broken("invalid\n");RuntimeSettings::decode(broken);}catch(const std::exception&){rejected=true;}check(rejected);
 rejected=false;try{loaded.set("tablet.inputTest","fake");}catch(const std::exception&){rejected=true;}check(rejected);
 std::cout<<"Editor preference defaults, bounds, persistence and unsupported-state checks passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
