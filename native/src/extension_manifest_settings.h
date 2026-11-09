#pragma once
#include "extension_manifest_commands.h"
#include <cmath>
namespace moon::extension {
// Typed defaults match ExtensionSettings*Manifest serde fields. This is data
// validation only; HTML settings metadata does not authorize a WebView host.
struct SettingsOption {std::string value,label,description;};
struct SettingsControl {
 std::string id,kind,label,description,variant="secondary";
 winrt::Windows::Data::Json::IJsonValue defaultValue=winrt::Windows::Data::Json::JsonValue::CreateNullValue();
 std::optional<std::string> suffix,placeholder,commandId;
 std::optional<double> min,max,step;
 std::optional<std::uint32_t> maxLength;
 std::optional<bool> fullWidth;
 std::optional<std::map<std::string,bool>> visibleWhen;
 std::vector<SettingsOption> options;bool closeOnRun=false;
};
struct ManifestSettings {std::optional<std::string> entry;std::optional<std::string> storageKey;std::vector<SettingsControl> controls;};
inline ManifestSettings inspectSettings(const winrt::Windows::Data::Json::JsonObject& manifest,const std::vector<ManifestCommand>& commands){
 using namespace winrt::Windows::Data::Json;using namespace manifest_detail;
 auto fail=[](){throw std::invalid_argument("扩展设置定义无效。");};
 auto present=[](const JsonObject& o,const wchar_t* k){return o.HasKey(k)&&o.GetNamedValue(k).ValueType()!=JsonValueType::Null;};
 auto number=[&](const JsonObject& o,const wchar_t* k)->std::optional<double>{if(!present(o,k))return {};auto n=o.GetNamedNumber(k);if(!std::isfinite(n))fail();return n;};
 auto description=[](const JsonObject& o){return o.HasKey(L"description")?winrt::to_string(o.GetNamedString(L"description")):std::string{};};
 ManifestSettings result;result.entry=optionalString(manifest,L"settingsEntry");
 if(result.entry){auto ext=ResourceCatalog::packagePath(*result.entry).extension().wstring();for(auto& c:ext)if(c>=L'A'&&c<=L'Z')c=wchar_t(c-L'A'+L'a');if(ext!=L".html"&&ext!=L".htm")fail();}
 if(!present(manifest,L"settingsUi"))return result;
 if(result.entry||manifest.GetNamedNumber(L"schemaVersion")!=2)fail();
 auto ui=manifest.GetNamedObject(L"settingsUi");result.storageKey=winrt::to_string(ui.GetNamedString(L"storageKey"));if(!validId(*result.storageKey))fail();
 JsonArray controls;if(ui.HasKey(L"controls"))controls=ui.GetNamedArray(L"controls");if(!controls.Size()||controls.Size()>64)fail();std::set<std::string> ids;
 for(auto value:controls){auto o=value.GetObject();SettingsControl c;c.id=winrt::to_string(o.GetNamedString(L"id"));c.kind=winrt::to_string(o.GetNamedString(L"type"));c.label=winrt::to_string(o.GetNamedString(L"label"));c.description=description(o);
  if(!validId(c.id)||!ids.insert(lower(c.id)).second||!text(c.label,160,true)||!text(c.description,4096,false))fail();
  c.suffix=optionalString(o,L"suffix");c.placeholder=optionalString(o,L"placeholder");c.commandId=optionalString(o,L"commandId");for(auto v:{c.suffix,c.placeholder})if(v&&!text(*v,160,false))fail();
  c.min=number(o,L"min");c.max=number(o,L"max");c.step=number(o,L"step");if(present(o,L"maxLength")){double n=o.GetNamedNumber(L"maxLength");if(!std::isfinite(n)||n<0||n>UINT32_MAX||std::floor(n)!=n)fail();c.maxLength=std::uint32_t(n);}
  if(present(o,L"fullWidth"))c.fullWidth=o.GetNamedBoolean(L"fullWidth");if(c.fullWidth&&c.kind!="button")fail();
  if(o.HasKey(L"variant"))c.variant=winrt::to_string(o.GetNamedString(L"variant"));if(o.HasKey(L"closeOnRun"))c.closeOnRun=o.GetNamedBoolean(L"closeOnRun");
  if(o.HasKey(L"defaultValue"))c.defaultValue=o.GetNamedValue(L"defaultValue");
  if(present(o,L"visibleWhen")){c.visibleWhen.emplace();for(auto condition:o.GetNamedObject(L"visibleWhen"))c.visibleWhen->emplace(winrt::to_string(condition.Key()),condition.Value().GetBoolean());if(c.visibleWhen->size()>64)fail();}
  if(o.HasKey(L"options"))for(auto v:o.GetNamedArray(L"options")){auto option=v.GetObject();c.options.push_back({winrt::to_string(option.GetNamedString(L"value")),winrt::to_string(option.GetNamedString(L"label")),description(option)});}
  if(c.kind=="checkbox"){c.defaultValue.GetBoolean();}
  else if(c.kind=="number"){double n=c.defaultValue.GetNumber();if(!std::isfinite(n)||(c.step&&*c.step<=0)||(c.min&&c.max&&*c.min>*c.max)||(c.min&&n<*c.min)||(c.max&&n>*c.max))fail();}
  else if(c.kind=="text"){auto value=c.defaultValue.GetString();std::size_t count=0;for(auto ch:value)if(ch<0xdc00||ch>0xdfff)++count;auto limit=c.maxLength.value_or(1024);if(!limit||limit>4096||count>limit)fail();}
  else if(c.kind=="select"){auto selected=winrt::to_string(c.defaultValue.GetString());if(c.options.empty()||c.options.size()>64)fail();std::set<std::string> values;bool found=false;for(auto& option:c.options){if(!text(option.value,160,true)||!text(option.label,160,true)||!text(option.description,4096,false)||!values.insert(lower(option.value)).second)fail();found|=option.value==selected;}if(!found)fail();}
  else if(c.kind=="button"){if(!c.commandId||!validId(*c.commandId)||(c.variant!="primary"&&c.variant!="secondary"&&c.variant!="danger"))fail();if(std::none_of(commands.begin(),commands.end(),[&](const auto& command){return command.runtime.id==*c.commandId&&command.runtime.handler=="runtime";}))fail();}
  else fail();result.controls.push_back(std::move(c));
 }
 for(auto& c:result.controls)if(c.visibleWhen)for(auto& condition:*c.visibleWhen)if(condition.first==c.id||std::none_of(result.controls.begin(),result.controls.end(),[&](const auto& other){return other.id==condition.first&&other.kind=="checkbox";}))fail();
 return result;
}
}
