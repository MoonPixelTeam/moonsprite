#pragma once
#include "extension_resources.h"
#include <optional>
#include "extension_runtime.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
namespace moon::extension {
namespace manifest_detail {
using namespace winrt::Windows::Data::Json;
inline auto optionalString=[](const JsonObject& object,const wchar_t* key)->std::optional<std::string>{if(!object.HasKey(key)||object.GetNamedValue(key).ValueType()==JsonValueType::Null)return {};return winrt::to_string(object.GetNamedString(key));};
inline auto lower=[](std::string text){for(auto& c:text)if(c>='A'&&c<='Z')c=char(c-'A'+'a');return text;};
inline auto validId=[](const std::string& id){return !id.empty()&&id.size()<=80&&id.front()!='.'&&id.back()!='.'&&id.find("..")==std::string::npos&&std::all_of(id.begin(),id.end(),[](unsigned char c){return (c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='.'||c=='-'||c=='_';});};
inline auto text=[](const std::string& value,std::size_t max,bool required){const auto wide=winrt::to_hstring(value);if(value.size()>max||std::any_of(wide.begin(),wide.end(),[](wchar_t c){return c<32||(c>=127&&c<=159);}))return false;if(!required)return true;for(auto c:wide)if(c!=32&&c!=0xa0&&c!=0x1680&&!(c>=0x2000&&c<=0x200a)&&c!=0x2028&&c!=0x2029&&c!=0x202f&&c!=0x205f&&c!=0x3000)return true;return false;};
}
struct ManifestCommand {RuntimeCommand runtime;std::string name,description;std::optional<std::string> luaEntry;};
inline std::vector<ManifestCommand> inspectCommands(const winrt::Windows::Data::Json::JsonObject& manifest,const std::vector<std::string>& permissions){
 using namespace winrt::Windows::Data::Json;
 using namespace manifest_detail;
 const bool settings=bool(optionalString(manifest,L"settingsEntry"))||(manifest.HasKey(L"settingsUi")&&manifest.GetNamedValue(L"settingsUi").ValueType()!=JsonValueType::Null);
 std::vector<ManifestCommand> result;std::set<std::string> ids;if(!manifest.HasKey(L"commands"))return result;
 const auto commands=manifest.GetNamedArray(L"commands");if(commands.Size()>64)throw std::invalid_argument("扩展命令数量不能超过 64 个。");
 for(const auto& value:commands){const auto command=value.GetObject();ManifestCommand c;c.runtime.id=winrt::to_string(command.GetNamedString(L"id"));c.name=winrt::to_string(command.GetNamedString(L"name"));c.description=command.HasKey(L"description")?winrt::to_string(command.GetNamedString(L"description")):std::string{};c.luaEntry=optionalString(command,L"entry");const auto event=optionalString(command,L"runtimeEvent");c.runtime.opensSettings=command.HasKey(L"opensSettings")?command.GetNamedBoolean(L"opensSettings"):false;
  if(!validId(c.runtime.id)||!ids.insert(lower(c.runtime.id)).second||!text(c.name,160,true)||!text(c.description,4096,false))throw std::invalid_argument("扩展命令 ID、名称或描述无效。");
  if(int(bool(c.luaEntry))+int(bool(event))+int(c.runtime.opensSettings)!=1)throw std::invalid_argument("扩展命令必须且只能声明一种处理方式。");
  if(c.luaEntry){auto extension=ResourceCatalog::packagePath(*c.luaEntry).extension().wstring();for(auto& ch:extension)if(ch>=L'A'&&ch<=L'Z')ch=wchar_t(ch-L'A'+L'a');if(extension!=L".lua")throw std::invalid_argument("扩展命令入口必须是 Lua 文件。");c.runtime.handler="lua";}
  else if(event){if(!manifest.HasKey(L"runtime")||manifest.GetNamedValue(L"runtime").ValueType()==JsonValueType::Null||std::find(permissions.begin(),permissions.end(),"commands")==permissions.end()||!validId(*event))throw std::invalid_argument("扩展命令 runtimeEvent 无效或缺少 commands 权限。");c.runtime.handler="runtime";c.runtime.runtimeEvent=*event;}
  else {if(!settings)throw std::invalid_argument("扩展命令需要 settingsEntry 或 settingsUi。");c.runtime.handler="settings";}
  result.push_back(std::move(c));
 }return result;
}
}
