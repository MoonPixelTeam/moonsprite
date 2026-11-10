#pragma once
#include "lua_script_client.h"
#include "lua_script_dialog_window.h"
#include "lua_script_report_dialog.h"
#include <deque>
#include <map>
#include <set>
namespace moon {
// useAppScriptRuntime's rendered dialogs, adapted to non-modal native windows.
// Call pump from the UI loop, never from a control callback. Client/Display and
// the supplied skin/font assets must outlive this host.
class ScriptWindowHost final {
 struct Window {std::unique_ptr<ScriptDialogWindow> dialog;};
 struct Request {std::string session,action;bool escape=false;};
 script::Client& client_;const PixelFont& font_;const Skin &skin_,&icons_;
 ui::Display* display_;std::filesystem::path colorStorage_;
 std::function<std::string(const Document&)> snapshot_;
 std::function<void(Document&&)> adopt_;
 std::map<std::string,Window> windows_;std::deque<Request> requests_;
 std::unique_ptr<ScriptReportDialog> report_;
 std::string session_;std::uint64_t revision_=0,reportRevision_=0;
 bool reportClosed_=false,closing_=false,pumping_=false;
 void clearWindows(){for(auto& [id,w]:windows_)w.dialog->closeFromHost();windows_.clear();}
 void clearReport(){if(report_){closing_=true;report_->closeWindow(nullptr);report_.reset();closing_=false;}reportClosed_=false;}
 void place(ui::Window& window,int width,int height,int index=0){const auto r=display_->bounds();const int w=std::min(width*uiScale,r.w),h=std::min(height*uiScale,r.h);window.setDisplay(display_,false);window.setBounds({r.x+std::clamp((r.w-w)/2+index*12*uiScale,0,std::max(0,r.w-w)),r.y+std::clamp((r.h-h)/2+index*12*uiScale,0,std::max(0,r.h-h)),w,h});}
 void reconcile(){
  const auto& current=client_.session();const auto session=current?current->sessionId:std::string{};
  if(session!=session_){clearWindows();requests_.clear();session_=session;revision_=0;}
  if(current&&revision_!=client_.dialogRevision()){
   using namespace winrt::Windows::Data::Json;
   std::set<std::string> present;int index=0;
   for(const auto& value:JsonArray::Parse(winrt::to_hstring(current->dialogsJson))){
    const auto model=value.GetObject();const auto id=winrt::to_string(model.GetNamedString(L"id"));present.insert(id);const auto json=winrt::to_string(model.Stringify());
    auto it=windows_.find(id);if(it==windows_.end()){
     auto dialog=std::make_unique<ScriptDialogWindow>(font_,skin_,icons_,json,colorStorage_,[this](std::string action){if(requests_.empty()){requests_.push_back({session_,std::move(action),false});for(auto& [id,w]:windows_)w.dialog->setBusy(true);}});
     dialog->escape=[this]{queueEscape();};place(*dialog,420,dialog->preferredHeight(),index);auto* raw=dialog.get();windows_.emplace(id,Window{std::move(dialog)});raw->openWindow();
    }else it->second.dialog->replace(json);++index;
   }
   for(auto it=windows_.begin();it!=windows_.end();)if(!present.count(it->first)){it->second.dialog->closeFromHost();it=windows_.erase(it);}else ++it;
   revision_=client_.dialogRevision();
  }
  const bool busy=client_.running()||!requests_.empty();for(auto& [id,w]:windows_)w.dialog->setBusy(busy);
  if(reportRevision_!=client_.reportRevision()){clearReport();reportRevision_=client_.reportRevision();}
  if(!client_.report()&&client_.error().empty()){clearReport();return;}
  if(!report_){report_=std::make_unique<ScriptReportDialog>(font_,skin_,icons_,client_.report(),client_.error());report_->Close.connect([this](ui::CloseEvent&){if(!closing_)reportClosed_=true;});place(*report_,500,260);report_->openWindow();}
 }
public:
 ScriptWindowHost(script::Client& client,const PixelFont& font,const Skin& skin,const Skin& icons,ui::Display* display,std::filesystem::path storage,std::function<std::string(const Document&)> snapshot,std::function<void(Document&&)> adopt={})
 :client_(client),font_(font),skin_(skin),icons_(icons),display_(display),colorStorage_(std::move(storage)),snapshot_(std::move(snapshot)),adopt_(std::move(adopt)){if(!display_||!snapshot_)throw std::invalid_argument("Script host needs display and real snapshot provider");}
 ~ScriptWindowHost(){clearReport();clearWindows();}
 ScriptWindowHost(const ScriptWindowHost&)=delete;ScriptWindowHost& operator=(const ScriptWindowHost&)=delete;
 void setStyleClipboardHost(script::StyleClipboardHost host){client_.setStyleClipboardHost(std::move(host));}
 void setSaveHost(script::SaveHost host){client_.setSaveHost(std::move(host));}
 void setBrushHost(script::BrushHost host){client_.setBrushHost(std::move(host));}
 void setNotificationHost(script::NotificationHost host){client_.setNotificationHost(std::move(host));}
 void setPanelHost(script::PanelHost host){client_.setPanelHost(std::move(host));}
 void setPlaybackHost(script::PlaybackHost host){client_.setPlaybackHost(std::move(host));}
 bool run(const Document* active,std::string id){if(client_.busy())return false;try{return client_.run(active,std::move(id),active?snapshot_(*active):std::string{},adopt_);}catch(const std::exception& e){client_.failRequest(e.what());return true;}}
 void queueEscape(){if(requests_.empty())requests_.push_back({session_,{},true});}
 void pump(Document* active,std::chrono::steady_clock::time_point deadline,std::size_t pixels=RasterSnapshot::tickPixels){
  if(pumping_)return;pumping_=true;struct Guard{bool& value;~Guard(){value=false;}} guard{pumping_};
  if(reportClosed_){client_.dismissReport();clearReport();}
  client_.observe(active);
  if(!requests_.empty()){
   auto request=std::move(requests_.front());requests_.pop_front();
   if(!client_.running()&&client_.session()&&request.session==client_.session()->sessionId){
    try{if(request.escape&&(client_.report()||!client_.error().empty()))client_.dismissReport();else {const auto mse=active?snapshot_(*active):std::string{};if(request.escape)client_.closeTopDialog(active,mse,adopt_);else client_.dispatch(active,std::move(request.action),mse,adopt_);}}
    catch(const std::exception& e){client_.failRequest(e.what());}
   }else if(request.escape&&(client_.report()||!client_.error().empty()))client_.dismissReport();
  }
  client_.tick(active,deadline,pixels);reconcile();
 }
 std::size_t windowCount()const{return windows_.size();}
 ScriptDialogWindow* window(const std::string& id)const{auto it=windows_.find(id);return it==windows_.end()?nullptr:it->second.dialog.get();}
 bool hasReport()const{return bool(report_);}
};
}
