#include "editor.h"
#include "tool_property_popup.h"
namespace moon::editor {
#if defined(_MSC_VER)
__declspec(noinline)
#else
__attribute__((noinline))
#endif
void Editor::smokeToolParameterRanges(){
 auto require=[](bool ok,const char* text){if(!ok)throw std::runtime_error(text);};
 const auto priorDirectory=workspacePresetTestDirectory_;const auto priorLiquifyPath=liquifyPreferenceOverride_;
 const auto priorAir=currentTools().airbrushSettings;const auto priorLiquify=currentTools().liquifyOptions;
 const auto directory=assets_.parent_path()/"tool-range-test-owned"/(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(directory);
 struct Restore{std::function<void()> fn;~Restore(){fn();}}restore{[&]{closeParameterRange();workspacePresetTestDirectory_=priorDirectory;liquifyPreferenceOverride_=priorLiquifyPath;currentTools().airbrushSettings=priorAir;currentTools().liquifyOptions=priorLiquify;}};
 workspacePresetTestDirectory_=directory;liquifyPreferenceOverride_=directory/"liquify-options.txt";
 smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;currentPlayback().playing=false;paletteFocused_=false;spaceHeld_=false;brushFeedback_.brushPreviewShift_=false;
 if(advancedMode_!=0)changeAdvancedMode(0);replaceDocumentForSmoke(Document(8,4));requestFocus();ui::Manager::getDefault()->dispatchMessages();
 const auto pixels=currentDocument().canvasPixels();const auto history=currentDocument().historyPosition();
 auto focus=[&](PixelEntry* entry){
  toolRowScroll_=0;layoutToolOptions();auto viewport=scrollViewports_.find(entry);require(viewport!=scrollViewports_.end(),"Tool parameter is enrolled in actual row");
  const auto box=entry->bounds(),area=viewport->second;if(box.x2()>area.x2())toolRowScroll_+=box.x2()-area.x2();else if(box.x<area.x)toolRowScroll_+=box.x-area.x;
  layoutToolOptions();require(entry->isVisible()&&entry->isEnabled(),"Tool numeric field is visible and enabled");
  entry->requestFocus();ui::Manager::getDefault()->dispatchMessages();
  require(entry->hasFocus()&&parameterRangeOwner_==entry&&parameterRangeFilters_&&propertyRangePopup_&&propertyRangePopup_->isVisible(),"Tool parameter range preserves real field focus");
 };
 auto escape=[&]{
  auto message=new ui::KeyMessage(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);message->setDisplay(display());message->setRecipient(ui::Manager::getDefault()->getFocus());ui::Manager::getDefault()->enqueueMessage(message);ui::Manager::getDefault()->dispatchMessages();
  require(!parameterRangeFilters_&&!parameterRangeOwner_&&!propertyRangePopup_->isVisible(),"Tool Escape closes nonmodal range");
 };
 useSmoothTool();useAirbrushTool();require(currentTools().airbrushTool&&!currentTools().smoothTool&&!currentTools().liquifyTool,"Smooth to Airbrush clears old tool state");
 currentTools().airbrushSettings.shape=BrushShape::Square;currentTools().airbrushSettings.scatterRadius=12;currentTools().airbrushSettings.density=8;layoutToolOptions();
 focus(airbrushFields_[0]);require(propertyRangeSlider_->minimum==1&&propertyRangeSlider_->maximum==64,"Airbrush scatter native range");
 focus(airbrushFields_[3]);airbrushFields_[3]->setText("03");airbrushFields_[3]->Change();require(airbrushFields_[3]->hasFocus()&&airbrushFields_[3]->text()=="03"&&currentTools().airbrushSettings.density==3&&propertyRangeSlider_->value==3,"Airbrush typed input preserves draft text and synchronizes range");
 propertyRangeSlider_->requestFocus();ui::Manager::getDefault()->dispatchMessages();require(propertyRangePopup_->isVisible(),"Airbrush slider internal focus");escape();require(currentTools().airbrushSettings.density==3,"Airbrush Escape keeps immediately saved value");
 focus(airbrushFields_[2]);currentTools().airbrushSettings.shape=BrushShape::Round;layoutToolOptions();require(!airbrushFields_[2]->isVisible()&&!parameterRangeFilters_&&!propertyRangePopup_->isVisible(),"Airbrush round shape hides angle and range");
 runShortcutCommand("tool.liquify");currentTools().liquifyOptions.mode=liquify::Mode::Push;currentTools().liquifyOptions.smoothing=true;layoutToolOptions();
 focus(liquifyRadiusInput_);require(propertyRangeSlider_->minimum==1&&propertyRangeSlider_->maximum==64,"Liquify radius native range");
 focus(liquifyStrengthInput_);liquifyStrengthInput_->setText("37");liquifyStrengthInput_->Change();require(liquifyStrengthInput_->hasFocus()&&currentTools().liquifyOptions.strength==37&&propertyRangeSlider_->value==37&&propertyRangeSlider_->percentage,"Liquify typed strength keeps focus and synchronizes range");escape();require(currentTools().liquifyOptions.strength==37,"Liquify Escape preserves immediate edits");
 focus(liquifySmoothingInput_);require(propertyRangeSlider_->minimum==0&&propertyRangeSlider_->maximum==100,"Liquify smoothing range includes zero");propertyRangeSlider_->changed(0);require(currentTools().liquifyOptions.smoothingStrength==0,"Liquify native slider uses actual number entry");currentTools().liquifyOptions.mode=liquify::Mode::Inflate;layoutToolOptions();require(!liquifySmoothingInput_->isVisible()&&!parameterRangeFilters_&&!propertyRangePopup_->isVisible(),"Liquify non-push mode hides smoothing range");
 focus(liquifyStrengthInput_);useAirbrushTool();ui::Manager::getDefault()->dispatchMessages();require(currentTools().airbrushTool&&!currentTools().liquifyTool&&!currentTools().smoothTool&&!liquifyResetPosition_&&!parameterRangeFilters_&&!propertyRangePopup_->isVisible(),"Liquify to Airbrush cleans input tool and range ownership");
 focus(airbrushFields_[4]);runShortcutCommand("tool.pencil");require(!currentTools().airbrushTool&&!parameterRangeFilters_&&!propertyRangePopup_->isVisible(),"Airbrush exit closes range");
 AirbrushSettings savedAir;int shape;std::ifstream air(directory/"airbrush-options.txt");require(bool(air>>savedAir.particleRadius>>shape>>savedAir.angle>>savedAir.scatterRadius>>savedAir.density>>savedAir.intervalMs)&&savedAir.density==3,"Airbrush existing preference format persisted");
 std::ifstream liquify(liquifyPreferenceOverride_);std::string tag;int mode,radius,strength,smoothing,smoothingStrength;require(bool(liquify>>tag>>mode>>radius>>strength>>smoothing>>smoothingStrength)&&tag=="liquify-v1"&&strength==37&&smoothingStrength==0,"Liquify existing preference format persisted");
 require(currentDocument().canvasPixels()==pixels&&currentDocument().historyPosition()==history&&!currentDocument().dirty(),"Tool parameter edits leave image and history unchanged");refresh();
}
}
