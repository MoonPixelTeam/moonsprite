#include "editor_implementation.h"
#include "editor.h"
namespace moon::editor {
#if defined(_MSC_VER)
__declspec(noinline)
#else
__attribute__((noinline))
#endif
void Editor::smokeBrushDynamicsDraft(){
 const auto stagePath=std::filesystem::path("native/build/dynamics-draft-stage.txt");std::ofstream(stagePath,std::ios::trunc).close();auto stage=[&](const char* t){std::ofstream(stagePath,std::ios::app)<<t<<std::endl;};auto require=[&](bool ok,const char* why){stage(why);if(!ok)throw std::runtime_error(why);};stage("begin");
 const auto saved=brushDynamics_;const auto pref=dynamicsPreferenceOverride_;const auto directory=assets_.parent_path()/"dynamics-draft-test-owned"/(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(directory);
 struct Restore{std::function<void()> f;~Restore(){f();}} restore{[&]{
   // Move focus back to the editor before destroying the modeless popup.  A
   // focused child retains a queued focus message in the UI manager; tearing
   // down the popup first leaves that message pointing at freed storage.
   if(dynamicsPopup_){requestFocus();ui::Manager::getDefault()->dispatchMessages();dynamicsPopup_->closeWindow(nullptr);dynamicsPopup_.reset();}
   brushDynamics_=saved;dynamicsPreferenceOverride_=pref;
 }};
 smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;playing_=false;paletteFocused_=false;document=Document(8,4);dynamicsPreferenceOverride_=directory/"dynamics-v6.txt";brushDynamics_={};dynamics::selectSensor(brushDynamics_,0,dynamics::Sensor::Pressure);stage("before show");showDynamicsOptions(false);stage("after show");require(dynamicsPopup_&&dynamicsPopup_->isVisible(),"Dynamics modeless popup opens");
 auto* field=dynamicsFields_[0];stage("before focus");field->requestFocus();stage("after focus");ui::Manager::getDefault()->dispatchMessages();require(field->hasFocus()&&dynamicsPopup_->isVisible(),"Dynamics field retains actual focus");
 field->selectAllText();stage("before type");for(unsigned char ch:std::string("35")){ui::KeyMessage key(ui::kKeyDownMessage,ui::kKeyNil,ui::kKeyNoneModifier,ch,0);field->onProcessMessage(&key);}stage("after type");require(field->text()=="35"&&brushDynamics_.effects[0].outputMin==0,"Dynamics typed value remains draft");
 ui::KeyMessage enter(ui::kKeyDownMessage,ui::kKeyEnter,ui::kKeyNoneModifier,0,0);field->onProcessMessage(&enter);require(brushDynamics_.effects[0].outputMin==35,"Dynamics Enter commits draft");field->setText("20+5");auto expression=new ui::KeyMessage(ui::kKeyDownMessage,ui::kKeyEnter,ui::kKeyNoneModifier,0,0);expression->setDisplay(display());expression->setRecipient(field);ui::Manager::getDefault()->enqueueMessage(expression);ui::Manager::getDefault()->dispatchMessages();require(brushDynamics_.effects[0].outputMin==25,"Dynamics expression Enter commits draft");
 field->setText("77");stage("before focus");field->requestFocus();stage("after focus");ui::Manager::getDefault()->dispatchMessages();require(brushDynamics_.effects[0].outputMin==25,"Dynamics programmatic draft remains uncommitted");stage("before blur");dynamicsMatrix_[0][0]->requestFocus();ui::Manager::getDefault()->dispatchMessages();stage("after blur");require(brushDynamics_.effects[0].outputMin==77,"Dynamics blur commits draft");
 field->setText("999");stage("before esc");auto esc=new ui::KeyMessage(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);esc->setDisplay(display());esc->setRecipient(field);ui::Manager::getDefault()->enqueueMessage(esc);ui::Manager::getDefault()->dispatchMessages();require(dynamicsPopup_&&dynamicsPopup_->isVisible()&&brushDynamics_.effects[0].outputMin==77,"Dynamics Escape keeps popup and saved value");
 requestFocus();ui::Manager::getDefault()->dispatchMessages();dynamicsPopup_->closeWindow(nullptr);dynamicsPopup_.reset();require(brushDynamics_.effects[0].outputMin==77,"Dynamics close preserves committed value");
}
}
