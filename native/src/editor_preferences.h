#pragma once
#include "preferences_catalog.h"
#include "layer_color_presets.h"
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <map>
#include <sstream>
#include <stdexcept>

namespace moon::preferences {
// Actual consumers are in Editor. Entries without consumers stay unavailable.
// Legacy: file-preferences.ts parsers/defaults and PreferencesDialog.persist.
inline bool runtimeSetting(const std::string& key) {
  static const std::vector<std::string> keys{
    "general.timelapseRecordingEnabled", "general.diagnostics.mode", "general.preferences.usageStatisticsEnabled", "appearance.pixelGridColor", "appearance.gridColor", "editing.brushSizeWheelReversed", "editing.canvasViewScrollbarsEnabled",
    "editing.wheelZoomEnabled", "editing.wheelZoomMode.Select",
    "editing.rotationIndicatorPosition.Select", "editing.viewDragSensitivity.Select", "tools.gradientApplicationMode.Select",
    "tools.moveLayerContentPreviewEnabled", "tools.moveLayerClickFlashEnabled", "tools.moveLayerClickFlashDuration.Select", "tablet.assistPanel", "tablet.tablet.pressureEnabled", "tools.gridAlignmentEnabled", "tools.smartAlignmentEnabled", "tools.alignmentGuidesVisible", "tools.alignmentThreshold.Number", "tools.shiftLinePreviewEnabled", "tools.balancedShiftLineEnabled", "tools.lineDirectionStep.Number", "tools.lassoPreviewClosed",
    "tools.eyedropperSwitchToPencil", "cursor.selectionSizeVisible",
    "cursor.selectionPreviewColorMode.Select", "cursor.selectionPreviewColor.Color",
    "cursor.brushPreviewMode.Select", "cursor.drawingBrushPreviewEnabled",
    "cursor.brushEdgeThickness.Number", "colorLayers.recentColorsVisible",
    "files.projectBackupEnabled", "files.projectBackupVersions.Number", "files.projectBackupRetentionDays.Number", "files.projectBackupDirectory.Text",
    "files.saveLocationMode.Select", "files.saveDirectory.Text", "files.saveOriginalFormat", "files.saveFormat.Select",
    "files.exportLocationMode.Select", "files.exportDirectory.Text", "files.exportFormat.Select", "files.exportSoundEnabled", "files.exportProtection.Select",
    "undo.historyLimitEnabled", "undo.historyLimit.Number"
  };
  return std::find(keys.begin(),keys.end(),key)!=keys.end();
}
struct RuntimeSettings {
  std::map<std::string,std::string> values;
  std::vector<timeline::Pixel> layerDisplayColors=defaultLayerDisplayColors();
  std::vector<int> exportScales{100,200,400,1000,2000};
  static std::vector<int> normalizeExportScales(const std::vector<double>& input){std::vector<int> result;for(double value:input)if(std::isfinite(value)&&value>=1&&value<=6400){const int n=int(std::floor(value+.5));if(std::find(result.begin(),result.end(),n)==result.end())result.push_back(n);}return result.empty()?std::vector<int>{100,200,400,1000,2000}:result;}
  static std::vector<int> decodeExportScales(const std::string& text){std::istringstream input(text);std::vector<double> values;double value;while(input>>value)values.push_back(value);return input.eof()?normalizeExportScales(values):normalizeExportScales({});}
  int defaultExportScale()const{return std::find(exportScales.begin(),exportScales.end(),100)!=exportScales.end()?100:exportScales.empty()?100:exportScales.front();}
  static const Item& item(const std::string& key) {
    for(const auto& value:catalog())if(key==value.id)return value;
    throw std::invalid_argument("Unknown preference: "+key);
  }
  std::string get(const std::string& key) const {
    auto found=values.find(key);if(found!=values.end())return found->second;
    static const auto defaults=[] {std::map<std::string,std::string> result;for(const auto& entry:catalog())result[entry.id]=entry.kind==Kind::Select?std::to_string(entry.selected):entry.kind==Kind::Text?std::string():std::string(entry.value);return result;}();
    return defaults.at(key);
  }
  bool flag(const std::string& key) const {return get(key)=="true";}
  int index(const std::string& key) const {return std::stoi(get(key));}
  void set(const std::string& key,std::string value) {
    const auto& entry=item(key);
    if(!runtimeSetting(key))throw std::invalid_argument("Unwired preference: "+key);
    if(entry.kind==Kind::Toggle && value!="true" && value!="false")throw std::invalid_argument("Invalid preference toggle");
    if(entry.kind==Kind::Select || entry.kind==Kind::Number){
      std::size_t used=0;double number=std::stod(value,&used);
      if(used!=value.size() || !std::isfinite(number))throw std::invalid_argument("Invalid preference number");
      if(entry.kind==Kind::Select){if(number!=std::floor(number) || number<0 || number>=entry.options.size())throw std::invalid_argument("Invalid preference choice");}
      else number=std::clamp(std::floor(number+.5),1.,key=="undo.historyLimit.Number"?10000.:key=="tools.alignmentThreshold.Number"?32.:key=="tools.lineDirectionStep.Number"?16.:key=="files.projectBackupVersions.Number"?10.:key=="files.projectBackupRetentionDays.Number"?365.:8.);
      value=std::to_string(int(number));
    }
    if(entry.kind==Kind::Color){
      if((value.size()!=7 && !((key=="appearance.pixelGridColor"||key=="appearance.gridColor")&&value.size()==9)) || value[0]!='#' || value.find_first_not_of("0123456789abcdefABCDEF",1)!=std::string::npos)throw std::invalid_argument("颜色需要 #RRGGBB 格式");
    }
    if(value.size()>32768 || value.find_first_of("\r\n")!=std::string::npos)throw std::invalid_argument("Invalid preference text");
    values[key]=std::move(value);
  }
  std::string encode() const {
    std::ostringstream out;out<<"MoonSprite editor-preferences 1\n";
    for(const auto& [key,value]:values)out<<std::quoted(key)<<' '<<std::quoted(value)<<'\n';
    std::ostringstream scales;for(int value:exportScales)scales<<value<<' ';out<<std::quoted("presets.exportScales")<<' '<<std::quoted(scales.str())<<'\n';
    out<<std::quoted("presets.layerDisplayColors")<<' '<<std::quoted(encodeLayerDisplayColors(layerDisplayColors))<<'\n';
    return out.str();
  }
  static RuntimeSettings decode(std::istream& input) {
    RuntimeSettings next;std::string line;
    if(!std::getline(input,line) || line!="MoonSprite editor-preferences 1")throw std::runtime_error("Invalid editor preferences header");
    while(std::getline(input,line)){
      if(line.empty())continue;std::istringstream row(line);std::string key,value;
      if(!(row>>std::quoted(key)>>std::quoted(value)) || !(row>>std::ws).eof())throw std::runtime_error("Invalid editor preference record");
      if(key=="presets.layerDisplayColors"){next.layerDisplayColors=decodeLayerDisplayColors(value);continue;}
      if(key=="presets.exportScales"){next.exportScales=decodeExportScales(value);continue;}
      if(runtimeSetting(key))next.set(key,value);else next.values[key]=value; // Preserve future records without activating them.
    }
    if(input.bad())throw std::runtime_error("Cannot read editor preferences");return next;
  }
};
}
