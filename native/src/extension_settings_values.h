#pragma once
#include "extension_manifest_settings.h"
#include "extension_storage.h"
#include "javascript_text.h"
#include <cfloat>
namespace moon::extension {
// HostExtensionSettings data/interaction model; native widgets bind separately.
class SettingsValues {
 using Object=winrt::Windows::Data::Json::JsonObject;
 using Value=winrt::Windows::Data::Json::IJsonValue;
 using Type=winrt::Windows::Data::Json::JsonValueType;
 Storage& storage_;RuntimeRegistry& registry_;std::string extension_;ManifestSettings settings_;std::vector<ManifestCommand> commands_;Object values_;
 static std::u16string units(const std::string& s){auto w=winrt::to_hstring(s);return {reinterpret_cast<const char16_t*>(w.c_str()),w.size()};}
 Value stored()const{return storage_.get(units(extension_),units(*settings_.storageKey));}
 static Object spread(const Value& value){Object out;if(value.ValueType()==Type::Object)for(auto item:value.GetObject())out.Insert(item.Key(),item.Value());else if(value.ValueType()==Type::Array){auto a=value.GetArray();for(unsigned i=0;i<a.Size();++i)out.Insert(winrt::to_hstring(std::to_string(i)),a.GetAt(i));}else if(value.ValueType()==Type::String){auto s=value.GetString();for(unsigned i=0;i<s.size();++i)out.Insert(winrt::to_hstring(std::to_string(i)),winrt::Windows::Data::Json::JsonValue::CreateStringValue(winrt::hstring(s.c_str()+i,1)));}return out;}
 static void merge(Object& dest,const Object& source){for(auto item:source)dest.Insert(item.Key(),item.Value());}
 static Value normalize(const SettingsControl& c,const Value& value){
  using namespace winrt::Windows::Data::Json;
  if(c.kind=="checkbox")return value.ValueType()==Type::Boolean?value:c.defaultValue;
  if(c.kind=="number"){if(value.ValueType()!=Type::Number||!std::isfinite(value.GetNumber()))return c.defaultValue;return JsonValue::CreateNumberValue(std::max(c.min.value_or(-DBL_MAX),std::min(c.max.value_or(DBL_MAX),value.GetNumber())));}
  if(c.kind=="text"){if(value.ValueType()!=Type::String)return c.defaultValue;auto s=value.GetString();return JsonValue::CreateStringValue(winrt::hstring(s.c_str(),std::min<std::uint32_t>(s.size(),c.maxLength.value_or(1024))));}
  if(value.ValueType()==Type::String&&std::any_of(c.options.begin(),c.options.end(),[&](const auto& option){return winrt::to_hstring(option.value)==value.GetString();}))return value;return c.defaultValue;
 }
 void commit(const Object& next){auto merged=spread(stored());merge(merged,next);storage_.setEncoded(units(extension_),units(*settings_.storageKey),javascriptJsonUtf8(merged.Stringify().c_str()));values_=next;RuntimeEvent event;event.type="settings-changed";event.key=*settings_.storageKey;event.payload=javascriptJsonUtf8(next.Stringify().c_str());registry_.dispatch(extension_,event);}
public:
 SettingsValues(Storage& storage,RuntimeRegistry& registry,std::string extension,ManifestSettings settings,std::vector<ManifestCommand> commands):storage_(storage),registry_(registry),extension_(std::move(extension)),settings_(std::move(settings)),commands_(std::move(commands)){
  if(!settings_.storageKey)throw std::invalid_argument("Extension has no host settings");auto raw=stored();Object source;if(raw.ValueType()==Type::Object)source=raw.GetObject();for(auto& c:settings_.controls)if(c.kind!="button"){auto key=winrt::to_hstring(c.id);values_.Insert(key,normalize(c,source.HasKey(key)?source.GetNamedValue(key):winrt::Windows::Data::Json::JsonValue::CreateNullValue()));}
 }
 Object values()const{return Object::Parse(values_.Stringify());}
 bool visible(const std::string& id)const{auto c=std::find_if(settings_.controls.begin(),settings_.controls.end(),[&](const auto& c){return c.id==id;});if(c==settings_.controls.end())throw std::invalid_argument("Unknown settings control");if(c->visibleWhen)for(auto& condition:*c->visibleWhen){auto key=winrt::to_hstring(condition.first);if(!values_.HasKey(key)||values_.GetNamedValue(key).ValueType()!=Type::Boolean||values_.GetNamedBoolean(key)!=condition.second)return false;}return true;}
 void update(const std::string& id,const Value& value){auto c=std::find_if(settings_.controls.begin(),settings_.controls.end(),[&](const auto& c){return c.id==id&&c.kind!="button";});if(c==settings_.controls.end())throw std::invalid_argument("Unknown settings value");auto next=spread(stored());merge(next,values_);next.Insert(winrt::to_hstring(id),value);commit(next);}
 void reset(){Object next;for(auto& c:settings_.controls)if(c.kind!="button")next.Insert(winrt::to_hstring(c.id),c.defaultValue);commit(next);}
 bool run(const std::string& id){auto c=std::find_if(settings_.controls.begin(),settings_.controls.end(),[&](const auto& c){return c.id==id&&c.kind=="button";});if(c==settings_.controls.end())throw std::invalid_argument("Unknown settings button");auto command=std::find_if(commands_.begin(),commands_.end(),[&](const auto& command){return c->commandId&&command.runtime.id==*c->commandId&&!command.runtime.runtimeEvent.empty();});if(command==commands_.end()||!registry_.command(extension_,command->runtime.id,command->runtime.runtimeEvent))throw std::runtime_error("扩展运行时尚未启动，无法执行该操作。");return c->closeOnRun;}
};
}
