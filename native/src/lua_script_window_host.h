#pragma once
#include "lua_script_client.h"
#include "lua_script_dialog_window.h"
#include "lua_script_report_dialog.h"
#include "modal_geometry_preferences.h"
#include <deque>
#include <map>
#include <set>
namespace moon {
// useAppScriptRuntime's rendered dialogs, adapted to non-modal native windows.
// Call pump from the UI loop, never from a control callback. Client/Display and
// the supplied skin/font assets must outlive this host.
class ScriptWindowHost final {
 struct Window {std::unique_ptr<ScriptDialogWindow> dialog;std::unique_ptr<ModalGeometryPreferences> geometry;gfx::Rect observed,area;bool applying=false;};
 struct Request {std::string session,action;bool escape=false;};
 script::Client& client_;const PixelFont& font_;const Skin &skin_,&icons_;
 ui::Display* display_;std::filesystem::path colorStorage_,geometryStorage_;
 std::function<std::string(const Document&)> snapshot_;
 std::function<void(Document&&)> adopt_;
 std::map<std::string,Window> windows_;std::deque<Request> requests_;
 std::unique_ptr<ScriptReportDialog> report_;
 std::string session_;std::uint64_t revision_=0,reportRevision_=0;
 bool reportClosed_=false,closing_=false,pumping_=false;
 void clearWindows(){for(auto& [id,w]:windows_){if(w.geometry){if(display_)w.geometry->remember(w.dialog->bounds(),display_->bounds());w.geometry->flush();}w.dialog->closeFromHost();}windows_.clear();}
 void clearReport(){if(report_){closing_=true;report_->closeWindow(nullptr);report_.reset();closing_=false;}reportClosed_=false;}
 gfx::Rect initialBounds(int width,int height,int index=0)const{const auto r=display_->bounds();const int w=std::min(width*uiScale,r.w),h=std::min(height*uiScale,r.h);return {r.x+std::clamp((r.w-w)/2+index*12*uiScale,0,std::max(0,r.w-w)),r.y+std::clamp((r.h-h)/2+index*12*uiScale,0,std::max(0,r.h-h)),w,h};}
 void place(ui::Window& window,int width,int height,int index=0){window.setDisplay(display_,false);window.setBounds(initialBounds(width,height,index));}
 void setDialogBounds(Window& window,gfx::Rect bounds){window.applying=true;window.dialog->setBounds(bounds);window.observed=window.dialog->bounds();window.applying=false;}
 void fitHeight(Window& window){if(!window.geometry||window.geometry->explicitHeight())return;auto box=window.dialog->bounds();const auto area=display_->bounds();box.h=std::min({window.dialog->preferredHeight()*uiScale,720*uiScale,std::max(1,area.h-24*uiScale)});box.y=std::clamp(box.y,area.y,std::max(area.y,area.y2()-box.h));if(box!=window.dialog->bounds())setDialogBounds(window,box);}
 void pumpGeometry(Window& window){if(!window.geometry||!display_)return;auto bounds=window.dialog->bounds();if(bounds.size()!=window.observed.size()&&!window.applying)window.geometry->resized();window.observed=bounds;const auto area=display_->bounds();if(area!=window.area){auto remapped=panels::resizeFloatingPosition({bounds.x,bounds.y,bounds.w,bounds.h},{window.area.x,window.area.y,window.area.w,window.area.h},{area.x,area.y,area.w,area.h});window.area=area;setDialogBounds(window,{remapped.x,remapped.y,std::min(remapped.w,std::max(1,area.w-24*uiScale)),std::min(remapped.h,std::max(1,area.h-24*uiScale))});fitHeight(window);}
  if(!ui::Manager::getDefault()->getCapture()){bounds=window.dialog->bounds();bounds.w=std::min(bounds.w,std::min(680*uiScale,std::max(1,area.w-24*uiScale)));bounds.h=std::min(bounds.h,std::min(720*uiScale,std::max(1,area.h-24*uiScale)));bounds.x=std::clamp(bounds.x,area.x,std::max(area.x,area.x2()-bounds.w));bounds.y=std::clamp(bounds.y,area.y,std::max(area.y,area.y2()-bounds.h));if(bounds!=window.dialog->bounds())setDialogBounds(window,bounds);window.geometry->remember(window.dialog->bounds(),area);}window.geometry->pump();}
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
     dialog->escape=[this]{queueEscape();};place(*dialog,420,dialog->preferredHeight(),index);auto geometry=std::make_unique<ModalGeometryPreferences>(geometryStorage_,"lua-script-"+session_+"-"+id);const auto area=display_->bounds();const auto restored=geometry->restore(dialog->bounds(),area,dialog->minimumDialogSize(dialog->bounds().w),{680*uiScale,720*uiScale});dialog->setBounds(restored);Window window;window.dialog=std::move(dialog);window.geometry=std::move(geometry);window.observed=window.dialog->bounds();window.area=area;auto* raw=window.dialog.get();windows_.emplace(id,std::move(window));raw->openWindow();
    }else {auto& window=it->second;pumpGeometry(window);window.dialog->replace(json);fitHeight(window);}++index;
   }
   for(auto it=windows_.begin();it!=windows_.end();)if(!present.count(it->first)){if(it->second.geometry){if(display_)it->second.geometry->remember(it->second.dialog->bounds(),display_->bounds());it->second.geometry->flush();}it->second.dialog->closeFromHost();it=windows_.erase(it);}else ++it;
   revision_=client_.dialogRevision();
  }
  const bool busy=client_.running()||!requests_.empty();for(auto& [id,w]:windows_){w.dialog->setBusy(busy);pumpGeometry(w);}
  if(reportRevision_!=client_.reportRevision()){clearReport();reportRevision_=client_.reportRevision();}
  if(!client_.report()&&client_.error().empty()){clearReport();return;}
  if(!report_){report_=std::make_unique<ScriptReportDialog>(font_,skin_,icons_,client_.report(),client_.error());report_->Close.connect([this](ui::CloseEvent&){if(!closing_)reportClosed_=true;});place(*report_,500,260);report_->openWindow();}
 }
public:
 ScriptWindowHost(script::Client& client,const PixelFont& font,const Skin& skin,const Skin& icons,ui::Display* display,std::filesystem::path storage,std::function<std::string(const Document&)> snapshot,std::function<void(Document&&)> adopt={})
 :client_(client),font_(font),skin_(skin),icons_(icons),display_(display),colorStorage_(storage),geometryStorage_(storage.parent_path()/"lua-script-geometry.json"),snapshot_(std::move(snapshot)),adopt_(std::move(adopt)){if(!display_||!snapshot_)throw std::invalid_argument("Script host needs display and real snapshot provider");}
 ~ScriptWindowHost(){clearReport();clearWindows();}
 ScriptWindowHost(const ScriptWindowHost&)=delete;ScriptWindowHost& operator=(const ScriptWindowHost&)=delete;
 void setStyleClipboardHost(script::StyleClipboardHost host){client_.setStyleClipboardHost(std::move(host));}
 void setWorkspaceHost(script::WorkspaceHost host){client_.setWorkspaceHost(std::move(host));}
 void setExportHost(script::ExportHost host){client_.setExportHost(std::move(host));}
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
 void setGeometryStorageForCheck(std::filesystem::path path){if(!windows_.empty())throw std::runtime_error("Configure geometry before running script");geometryStorage_=std::move(path);}
 gfx::Rect windowBoundsForCheck(const std::string& id)const{auto* value=window(id);if(!value)throw std::runtime_error("Script dialog missing");return value->bounds();}
 void resizeWindowForCheck(const std::string& id,gfx::Rect bounds){auto found=windows_.find(id);if(found==windows_.end())throw std::runtime_error("Script dialog missing");found->second.geometry->resized();setDialogBounds(found->second,bounds);}
 bool automaticHeightForCheck(const std::string& id)const{auto found=windows_.find(id);return found!=windows_.end()&&found->second.geometry&&!found->second.geometry->explicitHeight();}
 void flushGeometryForCheck(){for(auto& [id,window]:windows_)if(window.geometry){if(display_)window.geometry->remember(window.dialog->bounds(),display_->bounds());window.geometry->flush();}}
 void verifyGeometryForCheck(const std::string& id,const std::string& json){
  using namespace winrt::Windows::Data::Json;auto& window=windows_.at(id);auto require=[](bool value,const char* message){if(!value)throw std::runtime_error(message);};
  const auto original=window.dialog->bounds();require(automaticHeightForCheck(id),"New Lua window lost automatic height");auto model=JsonObject::Parse(winrt::to_hstring(json));auto controls=model.GetNamedArray(L"controls");const auto source=controls.GetObjectAt(0).Stringify();for(int i=0;i<12;++i){auto control=JsonObject::Parse(source);control.Insert(L"id",JsonValue::CreateStringValue(winrt::to_hstring("geometry-"+std::to_string(i))));control.Insert(L"dataKey",JsonValue::CreateNullValue());controls.Append(control);}
  window.dialog->replace(winrt::to_string(model.Stringify()));fitHeight(window);require(window.dialog->bounds().h>original.h&&automaticHeightForCheck(id),"Returned Lua content did not grow automatic height");window.dialog->replace(json);fitHeight(window);require(window.dialog->bounds().h==original.h,"Returned Lua content did not shrink automatic height");
  const auto area=display_->bounds();auto manual=original;manual.w=400*uiScale;manual.h=240*uiScale;manual.x=area.x+20*uiScale;manual.y=area.y+24*uiScale;window.dialog->setBounds(manual);pumpGeometry(window);manual=window.dialog->bounds();require(!automaticHeightForCheck(id),"Manual Lua resize did not retain explicit height");window.dialog->replace(winrt::to_string(model.Stringify()));fitHeight(window);require(window.dialog->bounds()==manual,"Returned Lua content overwrote manual geometry");window.dialog->replace(json);flushGeometryForCheck();
  const auto key="lua-script-"+session_+"-"+id;ModalGeometryPreferences reopened(geometryStorage_,key);require(reopened.restore(original,area,window.dialog->minimumDialogSize(original.w),{680*uiScale,720*uiScale})==manual&&reopened.explicitHeight(),"Lua geometry not restored on immediate reopen");
  {ModalGeometryPreferences other(geometryStorage_,key+"-other");other.remember(original,area);other.flush();window.geometry->remember(manual,area);window.geometry->flush();}
  // FIFO barrier is confined to this check, never used by production pumps.
  extension::startFormFileWrite(geometryStorage_.parent_path()/"geometry-check-barrier",{}).get();std::ifstream input(geometryStorage_,std::ios::binary);std::string bytes((std::istreambuf_iterator<char>(input)),{});auto saved=JsonObject::Parse(winrt::to_hstring(bytes));require(saved.HasKey(winrt::to_hstring("moonsprite.modal."+key))&&saved.HasKey(winrt::to_hstring("moonsprite.modal."+key+"-other")),"Simultaneous Lua geometry keys overwrote each other");
 }
};
}
