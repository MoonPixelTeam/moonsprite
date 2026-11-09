#pragma once
#include "extension_runtime.h"
#include "extension_menu_state.h"
#include "extension_storage.h"
#include "javascript_text.h"
#include <optional>
#include <winrt/Windows.Foundation.Collections.h>
namespace moon::extension {
// Native transport supplies authenticated session ownership and, for set,
// the script engine's exact JSON.stringify(value) result. Never infer identity
// or a storage namespace from untrusted request params.
struct HostServices {
 std::function<void(const winrt::hstring&)> notify;
 std::function<winrt::hstring()> readClipboard;
 std::function<void(const winrt::hstring&)> writeClipboard;
};
class RequestHost {
 HostServices services_;

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
 void setServices(HostServices services){services_=std::move(services);}
 void setResourceReader(std::function<FileDropRouter::Bytes(const std::string&)> reader){readResource_=std::move(reader);}
 void deactivate(){active_=false;menus_.clear();drops_.clear(extension_.id);}
 std::optional<winrt::Windows::Data::Json::JsonObject> handle(const winrt::Windows::Data::Json::IJsonValue& raw,bool ownsSession,const std::string& locale,std::optional<std::string> encodedValue={}){
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
