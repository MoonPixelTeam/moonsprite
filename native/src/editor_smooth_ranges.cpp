
#include "editor_implementation.h"
#include "editor.h"
namespace moon::editor {
void Editor::closeParameterRange(){
 if(parameterRangeFilters_){parameterRangeFilters_=false;auto manager=ui::Manager::getDefault();for(auto type:{ui::kFocusEnterMessage,ui::kFocusLeaveMessage,ui::kKeyDownMessage,ui::kMouseDownMessage})manager->removeMessageFilter(type,this);}
 if(parameterRangeOwner_){parameterRangeOwner_=nullptr;if(propertyRangePopup_)propertyRangePopup_->closeWindow(nullptr);}
}
void Editor::openParameterRange(PixelEntry* entry,int low,int high){
 if((!smoothTool_&&!liquifyTool_&&!airbrushTool_&&!fillTool_&&!selectionPropertiesActive_)||document.active()&&!(selectionPropertiesActive_&&document.floating())||!entry->isEnabled()||entry->hasFlags(ui::HIDDEN)||pending_!=Pending::None)return;
 if(parameterRangeOwner_==entry&&propertyRangePopup_&&propertyRangePopup_->isVisible()){if(propertyRangeSlider_){propertyRangeSlider_->minimum=low;propertyRangeSlider_->maximum=high;propertyRangeSlider_->percentage=entry->suffix==U"%";}syncParameterRange();return;}
 closeParameterRange();showPropertyRange(entry,low,high);if(!propertyRangePopup_||!propertyRangePopup_->isVisible())return;
 parameterRangeOwner_=entry;auto manager=ui::Manager::getDefault();parameterRangeFilters_=true;for(auto type:{ui::kFocusEnterMessage,ui::kFocusLeaveMessage,ui::kKeyDownMessage,ui::kMouseDownMessage})manager->addMessageFilter(type,this);
}
void Editor::syncParameterRange(){
 if(!parameterRangeOwner_)return;
 if((!smoothTool_&&!liquifyTool_&&!airbrushTool_&&!fillTool_&&!(selectionTool_&&selectionPropertiesActive_))||(document.active()&&!(selectionPropertiesActive_&&document.floating()))||!parameterRangeOwner_->isEnabled()||parameterRangeOwner_->hasFlags(ui::HIDDEN)||!propertyRangePopup_||!propertyRangePopup_->isVisible()){closeParameterRange();return;}
 if(propertyRangeSlider_)try{std::size_t used=0;const auto value=parameterRangeOwner_->deferredNumeric&&parameterRangeOwner_->numericValue?parameterRangeOwner_->numericValue():std::stod(parameterRangeOwner_->text(),&used);if((parameterRangeOwner_->deferredNumeric||used==parameterRangeOwner_->text().size())&&std::isfinite(value)){propertyRangeSlider_->value=int(std::floor(std::clamp(value,double(propertyRangeSlider_->minimum),double(propertyRangeSlider_->maximum))+.5));propertyRangeSlider_->invalidate();}}catch(const std::exception&){}
}
bool Editor::processParameterRangeMessage(ui::Message* message){
 if(!parameterRangeOwner_)return false;
 if(message->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(message)->scancode()==ui::kKeyEsc){closeParameterRange();return true;}
 if(message->type()==ui::kFocusEnterMessage||message->type()==ui::kFocusLeaveMessage){const auto next=static_cast<ui::FocusMessage*>(message)->newFocus();const bool staleNull=!next&&parameterRangeOwner_&&parameterRangeOwner_->hasFocus();const bool ownerStillFocused=parameterRangeOwner_&&ui::Manager::getDefault()->getFocus()==parameterRangeOwner_;if(next!=parameterRangeOwner_&&!(next&&propertyRangePopup_&&next->window()==propertyRangePopup_.get())&&!staleNull&&!ownerStillFocused)closeParameterRange();}
 if(message->type()==ui::kMouseDownMessage){const auto mouse=static_cast<ui::MouseMessage*>(message);if(message->display()!=display()||(!parameterRangeOwner_->bounds().contains(mouse->position())&&(!propertyRangePopup_||!propertyRangePopup_->bounds().contains(mouse->position()))))closeParameterRange();}
 return false;
}
#if defined(_MSC_VER)
__declspec(noinline)
#else
__attribute__((noinline))
#endif
void Editor::smokeSmoothParameterRanges(){
 auto require=[](bool ok,const char* text){if(!ok)throw std::runtime_error(text);};
 const auto priorDirectory=workspacePresetTestDirectory_;const auto priorBrush=smoothBrush_;const int priorAngle=smoothAngle_,priorStrength=smoothStrength_;const auto directory=assets_.parent_path()/"smooth-range-test-owned"/(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(directory);workspacePresetTestDirectory_=directory;
 struct Restore{std::function<void()> fn;~Restore(){fn();}}restore{[&]{closeParameterRange();workspacePresetTestDirectory_=priorDirectory;smoothBrush_=priorBrush;smoothAngle_=priorAngle;smoothStrength_=priorStrength;}};
 smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;playing_=false;paletteFocused_=false;if(advancedMode_!=0)changeAdvancedMode(0);document=Document(8,4);useSmoothTool();smoothBrush_.size=7;smoothBrush_.shape=BrushShape::Square;smoothAngle_=0;smoothStrength_=50;requestFocus();ui::Manager::getDefault()->dispatchMessages();
 const auto pixels=document.canvasPixels();const auto history=document.historyPosition();
 auto size=static_cast<PixelEntry*>(smoothControls_[1].first);
 auto focus=[&](PixelEntry* entry){toolRowScroll_=0;layoutToolOptions();auto viewport=scrollViewports_.find(entry);require(viewport!=scrollViewports_.end(),"Smooth numeric field enrolled in actual tool row");const auto box=entry->bounds(),area=viewport->second;if(box.x2()>area.x2())toolRowScroll_+=box.x2()-area.x2();else if(box.x<area.x)toolRowScroll_+=box.x-area.x;layoutToolOptions();require(entry->isVisible()&&entry->isEnabled(),"Smooth numeric field scrolls into actual viewport");entry->requestFocus();ui::Manager::getDefault()->dispatchMessages();if(!(entry->hasFocus()&&parameterRangeOwner_==entry&&parameterRangeFilters_&&propertyRangePopup_&&propertyRangePopup_->isVisible()))throw std::runtime_error("Smooth numeric focus state field="+std::string(entry==size?"size":entry==smoothAngleInput_?"angle":"strength")+" focus="+std::to_string(entry->hasFocus())+" owner="+std::to_string(parameterRangeOwner_==entry)+" filters="+std::to_string(parameterRangeFilters_)+" popup="+std::to_string(propertyRangePopup_&&propertyRangePopup_->isVisible()));};
 focus(size);require(propertyRangeSlider_->minimum==1&&propertyRangeSlider_->maximum==64,"Smooth size range bounds");propertyRangeSlider_->value=11;propertyRangeSlider_->changed(11);require(smoothBrush_.size==11&&size->text()=="11","Smooth size slider commits through actual entry");
 focus(smoothStrengthInput_);require(propertyRangeSlider_->minimum==0&&propertyRangeSlider_->maximum==100&&propertyRangeSlider_->percentage,"Smooth strength range bounds and percentage");smoothStrengthInput_->setText("37");smoothStrengthInput_->Change();require(smoothStrength_==37&&propertyRangeSlider_->value==37,"Smooth typed strength synchronizes existing slider");
 focus(smoothAngleInput_);require(propertyRangeSlider_->minimum==-180&&propertyRangeSlider_->maximum==180,"Smooth angle range bounds");smoothAngleInput_->setText("-37");smoothAngleInput_->Change();require(smoothAngle_==-37&&propertyRangeSlider_->value==-37,"Smooth typed angle synchronizes range");
 // Exercise manager filtering with focus on a released slider, whose generic
 // interactionCancel intentionally only handles an active drag.
 propertyRangeSlider_->requestFocus();ui::Manager::getDefault()->dispatchMessages();require(propertyRangePopup_->isVisible(),"Smooth slider internal focus retains flyout");
 auto escape=new ui::KeyMessage(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);escape->setDisplay(display());escape->setRecipient(propertyRangeSlider_);ui::Manager::getDefault()->enqueueMessage(escape);ui::Manager::getDefault()->dispatchMessages();require(!propertyRangePopup_->isVisible()&&!parameterRangeFilters_&&smoothAngle_==-37,"Smooth Escape closes released slider without reverting saved angle");
 focus(smoothStrengthInput_);auto outside=static_cast<PixelButton*>(smoothControls_[0].first);outside->requestFocus();ui::Manager::getDefault()->dispatchMessages();require(!propertyRangePopup_->isVisible()&&!parameterRangeFilters_&&smoothStrength_==37,"Smooth focus outside closes without reverting saved strength");
 focus(smoothAngleInput_);smoothBrush_.shape=BrushShape::Round;layoutToolOptions();require(!smoothAngleInput_->isVisible()&&!propertyRangePopup_->isVisible()&&!parameterRangeFilters_,"Smooth hidden angle cleans range ownership");
 focus(smoothStrengthInput_);runShortcutCommand("tool.pencil");require(!smoothTool_&&!propertyRangePopup_->isVisible()&&!parameterRangeFilters_,"Smooth tool switch cleans range lifecycle");
 std::ifstream saved(directory/"smooth-brush-v1.txt");std::string tag;int strength,angle,brushSize,shape;require(bool(saved>>tag>>strength>>angle>>brushSize>>shape)&&tag=="smooth-v1"&&strength==37&&angle==-37&&brushSize==11,"Smooth parameter edits preserve exact existing persistence format");
 require(document.canvasPixels()==pixels&&document.historyPosition()==history&&!document.dirty(),"Smooth parameter interactions leave image and history unchanged");refresh();
}
}
