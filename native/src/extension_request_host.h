#pragma once
#include "extension_runtime.h"
#include "extension_menu_state.h"
#include "extension_storage.h"
#include "javascript_text.h"
#include "extension_diagnostics.h"
#include "extension_windows.h"
#include "extension_editor_events.h"
#include <optional>
#include <unordered_set>
#include <cmath>
#include <winrt/Windows.Foundation.Collections.h>
namespace moon::extension {
// Native transport supplies authenticated session ownership and, for set,
// the script engine's exact JSON.stringify(value) result. Never infer identity
// or a storage namespace from untrusted request params.
struct ProjectSummary {
 winrt::hstring id,name,colorMode;int width=0,height=0;std::size_t layerCount=0,frameCount=1;bool dirty=false;std::uint64_t contentRevision=0;
};
struct LayerSummary {winrt::hstring id,name,blendMode;bool visible=true;double opacity=1;};
struct FrameSummary {winrt::hstring id;int duration=100;};
struct RuntimeColor {int r=0,g=0,b=0,a=255;};
struct RuntimeColors {RuntimeColor primary,secondary;};
inline constexpr const char* runtimeToolIds[]={"pencil","airbrush","eraser","fill","eyedropper","selection","shape","line","text","move","hand","zoom","rotate","liquify","smooth"};
inline RuntimeColor colorParam(const winrt::Windows::Data::Json::IJsonValue& value){
 using namespace winrt::Windows::Data::Json;if(!value||value.ValueType()!=JsonValueType::Object)throw std::invalid_argument("颜色参数无效。");auto object=value.GetObject();auto channel=[&](const wchar_t* key){if(!object.HasKey(key)||object.GetNamedValue(key).ValueType()!=JsonValueType::Number)throw std::invalid_argument("颜色参数无效。");auto number=object.GetNamedNumber(key);if(!std::isfinite(number))throw std::invalid_argument("颜色参数无效。");return int(std::clamp(std::floor(number+.5),0.,255.));};return {channel(L"r"),channel(L"g"),channel(L"b"),channel(L"a")};
}
inline winrt::Windows::Data::Json::JsonObject colorSnapshot(const RuntimeColor& color){using namespace winrt::Windows::Data::Json;JsonObject result;result.Insert(L"r",JsonValue::CreateNumberValue(color.r));result.Insert(L"g",JsonValue::CreateNumberValue(color.g));result.Insert(L"b",JsonValue::CreateNumberValue(color.b));result.Insert(L"a",JsonValue::CreateNumberValue(color.a));return result;}
struct WorkspaceServices {
 std::function<std::vector<ProjectSummary>()> projects;
 std::function<std::optional<ProjectSummary>()> active;
 std::function<void(const winrt::hstring&)> activate;
 std::function<std::vector<LayerSummary>()> layers;
 std::function<std::vector<FrameSummary>()> frames;
 std::function<void()> undo,redo;
 std::function<std::optional<winrt::hstring>()> tool;
 std::function<void(const winrt::hstring&)> setTool;
 std::function<std::optional<RuntimeColors>()> colors;
 std::function<void(RuntimeColor)> setPrimary,setSecondary;
};
inline winrt::Windows::Data::Json::JsonObject projectSnapshot(const ProjectSummary& value){
 using namespace winrt::Windows::Data::Json;JsonObject result;
 result.Insert(L"id",JsonValue::CreateStringValue(value.id));result.Insert(L"name",JsonValue::CreateStringValue(value.name));result.Insert(L"colorMode",JsonValue::CreateStringValue(value.colorMode));
 result.Insert(L"width",JsonValue::CreateNumberValue(value.width));result.Insert(L"height",JsonValue::CreateNumberValue(value.height));result.Insert(L"layerCount",JsonValue::CreateNumberValue(double(value.layerCount)));result.Insert(L"frameCount",JsonValue::CreateNumberValue(double(value.frameCount)));result.Insert(L"dirty",JsonValue::CreateBooleanValue(value.dirty));result.Insert(L"contentRevision",JsonValue::CreateNumberValue(double(value.contentRevision)));return result;
}
struct HostServices {
 std::function<void(const winrt::hstring&)> notify;
 std::function<winrt::hstring()> readClipboard;
 std::function<void(const winrt::hstring&)> writeClipboard;
};
class RequestHost {
 HostServices services_;WorkspaceServices workspace_;DiagnosticServices diagnostics_;

 std::shared_ptr<WindowRouter> windows_;
 MenuState menus_;
 RuntimeExtension extension_;std::vector<std::string> permissions_;Storage& storage_;FileDropRouter& drops_;RuntimeRegistry& registry_;CommandHandlers handlers_;std::vector<RuntimeCommand> commands_;bool active_=true;std::function<FileDropRouter::Bytes(const std::string&)> readResource_;
 static std::u16string units(const winrt::hstring& s){return {reinterpret_cast<const char16_t*>(s.data()),s.size()};}
public:
 RequestHost(RuntimeExtension extension,std::vector<std::string> permissions,Storage& storage,FileDropRouter& drops,RuntimeRegistry& registry,CommandHandlers handlers={},std::vector<RuntimeCommand> commands={}):extension_(std::move(extension)),permissions_(std::move(permissions)),storage_(storage),drops_(drops),registry_(registry),handlers_(std::move(handlers)),commands_(std::move(commands)){}
 void setDeclaredMenus(std::vector<std::string> ids){menus_.setDeclared(std::move(ids));}
 MenuState::Stop subscribePresentation(std::function<void()> callback){return menus_.subscribe(std::move(callback));}
 const MenuState& menus()const{return menus_;}
 // Authenticated window-message bridge, separate from runtime method permissions.
 bool reportCommandState(const winrt::Windows::Data::Json::JsonObject& params,bool ownsSession){
  using namespace winrt::Windows::Data::Json;
  if(!ownsSession||!active_||!extension_.enabled)return false;
  if(!params.HasKey(L"commandId")||params.GetNamedValue(L"commandId").ValueType()!=JsonValueType::String)throw std::invalid_argument("命令 ID 无效。");
  auto value=params.GetNamedString(L"commandId");if(value.empty()||value.size()>80)throw std::invalid_argument("命令 ID 无效。");auto id=winrt::to_string(value);
  if(std::none_of(commands_.begin(),commands_.end(),[&](const auto& c){return c.id==id;}))return false;
  JsonObject state;if(params.HasKey(L"state")&&params.GetNamedValue(L"state").ValueType()==JsonValueType::Object)state=params.GetNamedObject(L"state");
  CommandState next;auto field=[&](const wchar_t* key,std::optional<bool>& target){if(!state.HasKey(key))return;if(state.GetNamedValue(key).ValueType()!=JsonValueType::Boolean)throw std::invalid_argument("命令显示状态无效。");target=state.GetNamedBoolean(key);};
  field(L"checked",next.checked);field(L"visible",next.visible);menus_.setCommand(id,next);return true;
 }
 void setWorkspaceServices(WorkspaceServices services){workspace_=std::move(services);}
 void setWindowRouter(std::shared_ptr<WindowRouter> router){if(windows_==router)return;if(windows_)windows_->deactivate();windows_=std::move(router); }
 void setDiagnosticServices(DiagnosticServices services){diagnostics_=std::move(services);}
 void setServices(HostServices services){services_=std::move(services);}
 void setResourceReader(std::function<FileDropRouter::Bytes(const std::string&)> reader){readResource_=std::move(reader);}
 void deactivate(){if(!active_)return;active_=false;drops_.clear(extension_.id);menus_.clear();if(windows_)windows_->deactivate();}
 std::optional<winrt::Windows::Data::Json::JsonObject> handle(const winrt::Windows::Data::Json::IJsonValue& raw,bool ownsSession,const std::string& locale,std::optional<std::string> encodedValue={},std::function<void(std::wstring,std::wstring)> deferNetwork={}){
  using namespace winrt::Windows::Data::Json;
  if(!ownsSession||!active_||!extension_.enabled||!raw||raw.ValueType()!=JsonValueType::Object)return {};
  const auto request=raw.GetObject();auto field=[&](const wchar_t* key){return request.HasKey(key)?request.GetNamedValue(key):JsonValue::CreateNullValue();};
  auto type=field(L"type"),id=field(L"requestId"),methodValue=field(L"method");
  if(type.ValueType()!=JsonValueType::String||type.GetString()!=L"moonsprite-extension-request"||id.ValueType()!=JsonValueType::String||id.GetString().size()>80||methodValue.ValueType()!=JsonValueType::String)return {};
  JsonObject response;response.Insert(L"type",JsonValue::CreateStringValue(L"moonsprite-extension-response"));response.Insert(L"requestId",id);
  try{
   const auto method=winrt::to_string(methodValue.GetString());if(!runtimeAllows(permissions_,method))throw std::runtime_error("扩展未获准调用 "+method+"。");
   auto value=field(L"params");JsonObject params=value.ValueType()==JsonValueType::Object?value.GetObject():JsonObject{};
   auto key=[&](){if(!params.HasKey(L"key")||params.GetNamedValue(L"key").ValueType()!=JsonValueType::String)throw std::invalid_argument("扩展存储键无效。");return units(params.GetNamedString(L"key"));};
   const auto owner=units(winrt::to_hstring(extension_.id));IJsonValue result=JsonValue::CreateNullValue();
   if(method=="runtime.getLocale"){JsonObject object;object.Insert(L"locale",JsonValue::CreateStringValue(winrt::to_hstring(locale)));result=object;}
   else if(method=="runtime.getCapabilities"){
    JsonObject capabilities;capabilities.Insert(L"apiVersion",JsonValue::CreateStringValue(L"1.0.0"));JsonArray permissions,events,presentations,methods;std::unordered_set<std::string> seen;
    // Legacy reduce iterates permissions first, preserving their order, then
    // Object.entries(method permissions). Duplicate permissions retain values
    // but cannot insert duplicate method keys.
    for(const auto& permission:permissions_){permissions.Append(JsonValue::CreateStringValue(winrt::to_hstring(permission)));for(const auto& entry:methodPermissions)if(permission==entry.permission&&seen.insert(entry.method).second)methods.Append(JsonValue::CreateStringValue(winrt::to_hstring(entry.method)));}
    if(std::find(permissions_.begin(),permissions_.end(),"events")!=permissions_.end())for(const auto* name:editorEventNames)events.Append(JsonValue::CreateStringValue(winrt::to_hstring(name)));
    if(std::find(permissions_.begin(),permissions_.end(),"windows")!=permissions_.end())for(const auto* name:{L"native",L"dialog",L"overlay"})presentations.Append(JsonValue::CreateStringValue(name));
    capabilities.Insert(L"permissions",permissions);capabilities.Insert(L"editorEvents",events);capabilities.Insert(L"windowPresentations",presentations);capabilities.Insert(L"methods",methods);result=capabilities;
   }
   else if(method=="runtime.setFileDropTypes"){
    if(!params.HasKey(L"extensions")||params.GetNamedValue(L"extensions").ValueType()!=JsonValueType::Array)throw std::invalid_argument("Invalid extension file-drop suffixes");
    std::vector<std::string> types;for(const auto& item:params.GetNamedArray(L"extensions")){if(item.ValueType()!=JsonValueType::String)throw std::invalid_argument("Invalid extension file-drop suffixes");types.push_back(winrt::to_string(item.GetString()));}drops_.setTypes(extension_.id,std::move(types));
   }
   else if(method=="menus.setItems"){if(std::find(permissions_.begin(),permissions_.end(),"commands")==permissions_.end())throw std::runtime_error("菜单操作需要 commands 权限。");menus_.set(params);}
   else if(method=="resources.read"){if(!params.HasKey(L"resourceId")||params.GetNamedValue(L"resourceId").ValueType()!=JsonValueType::String||!readResource_)throw std::invalid_argument("扩展运行时资源不存在。");JsonArray bytes;for(auto byte:readResource_(winrt::to_string(params.GetNamedString(L"resourceId"))))bytes.Append(JsonValue::CreateNumberValue(byte));result=bytes;}
   else if(method=="ui.notify"||method=="notifications.show"){
    if(!params.HasKey(L"message")||params.GetNamedValue(L"message").ValueType()!=JsonValueType::String)throw std::invalid_argument("参数 message 必须是字符串。");
    if(!services_.notify)throw std::runtime_error("Native extension notifications are not connected");const auto message=params.GetNamedString(L"message");services_.notify(winrt::hstring(message.data(),std::min<std::uint32_t>(message.size(),500)));
   }
   else if(method=="ui.openSettings"){if(!extension_.hasSettings)throw std::invalid_argument("扩展未提供设置页面。");if(!handlers_.openSettings)throw std::runtime_error("Native extension settings are not connected");handlers_.openSettings(extension_.id);}
   else if(method=="clipboard.readText"){if(!services_.readClipboard)throw std::runtime_error("Native clipboard is not connected");result=JsonValue::CreateStringValue(services_.readClipboard());}
   else if(method=="clipboard.writeText"){
    if(!params.HasKey(L"text")||params.GetNamedValue(L"text").ValueType()!=JsonValueType::String)throw std::invalid_argument("参数 text 必须是字符串。");if(!services_.writeClipboard)throw std::runtime_error("Native clipboard is not connected");services_.writeClipboard(params.GetNamedString(L"text"));
   }
   else if(method=="workspace.listProjects"){
    if(!workspace_.projects)throw std::runtime_error("Native workspace is not connected");JsonArray projects;for(const auto& project:workspace_.projects())projects.Append(projectSnapshot(project));result=projects;
   }
   else if(method=="workspace.getActiveProject"||method=="document.getSummary"){
    if(!workspace_.active)throw std::runtime_error("Native workspace is not connected");auto active=workspace_.active();if(active)result=projectSnapshot(*active);
   }
   else if(method=="workspace.activateProject"){
    if(!params.HasKey(L"projectId")||params.GetNamedValue(L"projectId").ValueType()!=JsonValueType::String)throw std::invalid_argument("参数 projectId 必须是字符串。");
    if(!workspace_.projects||!workspace_.activate)throw std::runtime_error("Native workspace activation is not connected");const auto id=params.GetNamedString(L"projectId");const auto projects=workspace_.projects();if(std::none_of(projects.begin(),projects.end(),[&](const auto& p){return p.id==id;}))throw std::invalid_argument("工程不存在。");workspace_.activate(id);
   }
   else if(method=="document.getLayers"||method=="document.getFrames"||method=="document.undo"||method=="document.redo"){
    if(!workspace_.active)throw std::runtime_error("Native workspace is not connected");if(!workspace_.active())throw std::invalid_argument("当前没有打开的工程。");
    if(method=="document.getLayers"){if(!workspace_.layers)throw std::runtime_error("Native layer query is not connected");JsonArray layers;for(const auto& layer:workspace_.layers()){JsonObject item;item.Insert(L"id",JsonValue::CreateStringValue(layer.id));item.Insert(L"name",JsonValue::CreateStringValue(layer.name));item.Insert(L"visible",JsonValue::CreateBooleanValue(layer.visible));item.Insert(L"opacity",JsonValue::CreateNumberValue(layer.opacity));item.Insert(L"blendMode",JsonValue::CreateStringValue(layer.blendMode));layers.Append(item);}result=layers;}
    else if(method=="document.getFrames"){if(!workspace_.frames)throw std::runtime_error("Native frame query is not connected");JsonArray frames;std::size_t index=0;for(const auto& frame:workspace_.frames()){JsonObject item;item.Insert(L"id",JsonValue::CreateStringValue(frame.id));item.Insert(L"index",JsonValue::CreateNumberValue(double(index++)));item.Insert(L"duration",JsonValue::CreateNumberValue(frame.duration));frames.Append(item);}result=frames;}
    else {const auto action=method=="document.undo"?workspace_.undo:workspace_.redo;if(!action)throw std::runtime_error("Native document history is not connected");action();}
   }
   else if(method=="tools.getActive"){if(!workspace_.tool)throw std::runtime_error("Native tool query is not connected");auto tool=workspace_.tool();if(tool)result=JsonValue::CreateStringValue(*tool);}
   else if(method=="tools.setActive"){
    if(!params.HasKey(L"tool")||params.GetNamedValue(L"tool").ValueType()!=JsonValueType::String)throw std::invalid_argument("参数 tool 必须是字符串。");const auto tool=params.GetNamedString(L"tool");const auto id=winrt::to_string(tool);if(std::none_of(std::begin(runtimeToolIds),std::end(runtimeToolIds),[&](const auto* candidate){return id==candidate;}))throw std::invalid_argument("工具 ID 无效。");if(!workspace_.setTool)throw std::runtime_error("Native tool selection is not connected");workspace_.setTool(tool);
   }
   else if(method=="colors.get"){if(!workspace_.colors)throw std::runtime_error("Native color query is not connected");auto colors=workspace_.colors();if(colors){JsonObject object;object.Insert(L"primary",colorSnapshot(colors->primary));object.Insert(L"secondary",colorSnapshot(colors->secondary));result=object;}}
   else if(method=="colors.setPrimary"||method=="colors.setSecondary"){
    const auto color=colorParam(params.HasKey(L"color")?params.GetNamedValue(L"color"):JsonValue::CreateNullValue());const auto action=method=="colors.setPrimary"?workspace_.setPrimary:workspace_.setSecondary;if(!action)throw std::runtime_error("Native color selection is not connected");action(color);
   }
   else if(method.rfind("windows.",0)==0){if(!windows_)throw std::runtime_error("Native extension windows are not connected");windows_->request(method,params);}
   else if(method=="diagnostics.log"){
    if(!diagnostics_.record||!diagnostics_.status||!diagnostics_.console)throw std::runtime_error("Native extension diagnostics are not connected");
    const auto message=params.HasKey(L"message")?params.GetNamedValue(L"message"):IJsonValue{nullptr};
    const auto level=params.HasKey(L"level")?params.GetNamedValue(L"level"):IJsonValue{nullptr};
    const bool error=level&&level.ValueType()==JsonValueType::String&&level.GetString()==L"error";
    const winrt::hstring text(diagnosticString(message));diagnostics_.record(error?"error":"operation-stage",text);if(error)diagnostics_.status(text);
    const auto levelText=diagnosticString(level);const std::string consoleLevel=levelText==L"debug"||levelText==L"info"||levelText==L"warn"||levelText==L"error"?winrt::to_string(levelText):"info";
    if(!message||message.ValueType()!=JsonValueType::String)throw std::invalid_argument("参数 message 必须是字符串。");
    const auto original=message.GetString();diagnostics_.console(consoleLevel,winrt::to_hstring("[Extension "+extension_.id+"] ")+winrt::hstring(original.data(),std::min<std::uint32_t>(original.size(),2000)));
   }
   else if(method=="network.fetch"){
    if(!deferNetwork)throw std::runtime_error("Native asynchronous network transport is not connected");
    deferNetwork(std::wstring(id.GetString()),std::wstring(params.Stringify()));return {};
   }
   else if(method=="storage.get")result=storage_.get(owner,key());
   else if(method=="storage.set"){const auto resolved=key();if(!encodedValue)throw std::invalid_argument("扩展存储值超过大小限制。");storage_.setEncoded(owner,resolved,*encodedValue);}
   else if(method=="storage.remove")storage_.remove(owner,key());
   else if(method=="storage.list"){JsonArray keys;for(const auto& name:storage_.list(owner))keys.Append(JsonValue::CreateStringValue(winrt::hstring(reinterpret_cast<const wchar_t*>(name.data()),std::uint32_t(name.size()))));result=keys;}
   else if(method=="commands.execute"){
    const auto commandId=params.HasKey(L"commandId")&&params.GetNamedValue(L"commandId").ValueType()==JsonValueType::String?winrt::to_string(params.GetNamedString(L"commandId")):std::string{};
    const auto found=std::find_if(commands_.begin(),commands_.end(),[&](const auto& c){return c.id==commandId;});if(found==commands_.end())throw std::invalid_argument("扩展命令不存在。");result=JsonValue::CreateBooleanValue(executeCommand(registry_,extension_,*found,handlers_));
   }
   else throw std::runtime_error("Native extension method is not connected: "+method);
   response.Insert(L"ok",JsonValue::CreateBooleanValue(true));response.Insert(L"result",result);
  }catch(const winrt::hresult_error& e){response.Insert(L"ok",JsonValue::CreateBooleanValue(false));response.Insert(L"error",JsonValue::CreateStringValue(e.message()));}
  catch(const std::exception& e){response.Insert(L"ok",JsonValue::CreateBooleanValue(false));response.Insert(L"error",JsonValue::CreateStringValue(winrt::to_hstring(e.what())));}
  return response;
 }
};
}
