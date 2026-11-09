#pragma once
#include "extension_resources.h"
#include "atomic_file.h"
#include "extension_state.h"
#include "extension_manifest_metadata.h"
#include <limits>
#include <tuple>
#include "extension_runtime.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
namespace moon::extension {
// A lossless inspected candidate, NOT an installed/validated executable package.
// Manifest domains are validated; package contents and engine loading are separate.
struct RuntimeCandidate {
 winrt::Windows::Data::Json::JsonObject manifest;
 RuntimeExtension extension;
 std::string entry;
 std::vector<std::string> permissions;
 std::vector<ManifestCommand> commands;
 ManifestSettings settings;
 ManifestMetadata metadata;
 std::shared_ptr<ResourceCatalog> resources;
 bool enabled=true;
};
struct LuaEntry {
 std::string extensionId,extensionName,entryName;
 std::optional<std::string> commandId,commandName,commandDescription;
 std::filesystem::path path;
};
class RuntimeDirectory {
 static std::string read(const std::filesystem::path& path,std::size_t limit){
  const auto status=std::filesystem::symlink_status(path);if(!std::filesystem::is_regular_file(status)||std::filesystem::is_symlink(status))throw std::runtime_error("扩展清单或状态文件必须是普通文件。");
  std::ifstream input(path,std::ios::binary);if(!input)throw std::runtime_error("Cannot read extension metadata");std::string bytes;char chunk[65536];while(input){input.read(chunk,sizeof(chunk));const auto count=std::size_t(input.gcount());if(count>limit-bytes.size())throw std::length_error("Extension metadata exceeds size limit");bytes.append(chunk,count);}if(input.bad())throw std::runtime_error("Cannot finish extension metadata read");return bytes;
 }
 static ExtensionState readFullState(const std::filesystem::path& directory){auto path=directory/".state.json";std::error_code error;auto status=std::filesystem::symlink_status(path,error);if(error&&error!=std::errc::no_such_file_or_directory)throw std::system_error(error);return std::filesystem::exists(status)?ExtensionState::parse(read(path,std::numeric_limits<std::size_t>::max())):ExtensionState{};}
 static std::map<std::string,bool> readState(const std::filesystem::path& directory){return readFullState(directory).enabled;}
 static std::string sortName(const std::string& name){auto wide=winrt::to_hstring(name);int n=LCMapStringEx(LOCALE_NAME_INVARIANT,LCMAP_LOWERCASE,wide.c_str(),int(wide.size()),nullptr,0,nullptr,nullptr,0);if(!n)throw std::runtime_error("Cannot lowercase extension name");std::wstring lowered(n,L' ');if(!LCMapStringEx(LOCALE_NAME_INVARIANT,LCMAP_LOWERCASE,wide.c_str(),int(wide.size()),lowered.data(),n,nullptr,nullptr,0))throw std::runtime_error("Cannot lowercase extension name");return winrt::to_string(lowered);}
 static bool validId(const std::string& id){return !id.empty()&&id.size()<=80&&id.front()!='.'&&id.back()!='.'&&id.find("..")==std::string::npos&&std::all_of(id.begin(),id.end(),[](unsigned char c){return (c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='.'||c=='-'||c=='_';});}
public:
 static RuntimeCandidate setEnabled(const std::filesystem::path& directory,const std::string& id,bool enabled){
  using namespace winrt::Windows::Data::Json;
  auto candidate=inspect(directory,id,false);auto state=readFullState(directory);state.enabled[id]=enabled;const auto bytes=state.encode();
  // Same flushed atomic writer used by native project/export persistence.
  // Publish the returned state only after disk publication succeeds.
  writeBinaryFileAtomic(directory/".state.json",std::vector<std::uint8_t>(bytes.begin(),bytes.end()));candidate.enabled=enabled;candidate.extension.enabled=enabled;return candidate;
 }
 static std::vector<RuntimeCandidate> list(const std::filesystem::path& directory){
  // State errors and enumeration errors fail the operation; individual damaged
  // manifests are skipped, matching list_installed_extensions.
  const auto state=readState(directory);std::vector<RuntimeCandidate> result;
  for(const auto& item:std::filesystem::directory_iterator(directory)){const auto status=item.symlink_status();if(!std::filesystem::is_directory(status)||std::filesystem::is_symlink(status))continue;const auto id=winrt::to_string(item.path().filename().wstring());if(!validId(id))continue;
   try{auto c=inspect(directory,id,false);c.enabled=state.count(id)?state.at(id):true;c.extension.enabled=c.enabled;result.push_back(std::move(c));}catch(const std::exception&){}catch(const winrt::hresult_error&){}
  }
  std::sort(result.begin(),result.end(),[](const auto& a,const auto& b){return std::make_pair(sortName(a.metadata.name),a.extension.id)<std::make_pair(sortName(b.metadata.name),b.extension.id);});return result;
 }
 static std::vector<LuaEntry> listLua(const std::filesystem::path& directory){
  std::vector<LuaEntry> result;for(const auto& extension:list(directory)){if(!extension.enabled)continue;
   auto append=[&](std::optional<std::string> command){try{result.push_back(resolveLua(directory,extension.extension.id,std::move(command)));}catch(const std::exception&){}catch(const winrt::hresult_error&){} };
   if(extension.metadata.entry)append({});for(const auto& command:extension.commands)if(command.luaEntry)append(command.runtime.id);
  }
  std::sort(result.begin(),result.end(),[](const auto& a,const auto& b){return std::make_tuple(sortName(a.extensionName),a.commandName,a.extensionId,a.commandId)<std::make_tuple(sortName(b.extensionName),b.commandName,b.extensionId,b.commandId);});return result;
 }
 static LuaEntry resolveLua(const std::filesystem::path& directory,const std::string& id,std::optional<std::string> commandId={}){
  auto candidate=inspect(directory,id,false);if(!candidate.enabled)throw std::runtime_error("扩展已停用。");
  LuaEntry result;result.extensionId=id;result.extensionName=candidate.metadata.name;result.commandId=commandId;std::optional<std::string> entry;
  if(commandId){if(!validId(*commandId))throw std::invalid_argument("无效的扩展命令 ID。");auto command=std::find_if(candidate.commands.begin(),candidate.commands.end(),[&](const auto& c){return c.runtime.id==*commandId;});if(command==candidate.commands.end())throw std::invalid_argument("扩展命令不存在。");entry=command->luaEntry;result.commandName=command->name;if(!command->description.empty())result.commandDescription=command->description;}
  else entry=candidate.metadata.entry;
  if(!entry)throw std::invalid_argument("扩展没有对应的 Lua 入口。");
  const auto root=directory/std::filesystem::path(winrt::to_hstring(id).c_str());result.path=root/ResourceCatalog::packagePath(*entry);auto status=std::filesystem::symlink_status(result.path);if(!std::filesystem::is_regular_file(status)||std::filesystem::is_symlink(status))throw std::runtime_error("扩展入口必须是普通 Lua 文件。");
  const auto canonicalRoot=std::filesystem::canonical(root),canonicalEntry=std::filesystem::canonical(result.path);auto parent=canonicalRoot.begin(),child=canonicalEntry.begin();for(;parent!=canonicalRoot.end();++parent,++child)if(child==canonicalEntry.end()||*parent!=*child)throw std::runtime_error("扩展入口不能位于扩展目录之外。");
  result.entryName=winrt::to_string(result.path.filename().wstring());return result;
 }
 // Read HTML as legacy package metadata only; no browser/runtime is created.
 // Inspect anew for each operation so disabled state and modified manifests are
 // checked at the same boundary as the old host commands.
 static std::string readRuntimeEntry(const std::filesystem::path& directory,const std::string& id){
  auto candidate=inspect(directory,id);if(!candidate.enabled)throw std::runtime_error("扩展已停用。");
  return readText(directory/std::filesystem::path(winrt::to_hstring(id).c_str())/ResourceCatalog::packagePath(candidate.entry),1024u*1024u);
 }
 static std::string readSettingsEntry(const std::filesystem::path& directory,const std::string& id){
  auto candidate=inspect(directory,id);if(!candidate.enabled)throw std::runtime_error("扩展已停用。");if(!candidate.settings.entry)throw std::runtime_error("该扩展未提供设置页面。");
  return readText(directory/std::filesystem::path(winrt::to_hstring(id).c_str())/ResourceCatalog::packagePath(*candidate.settings.entry),512u*1024u);
 }
 static FileDropRouter::Bytes readResource(const std::filesystem::path& directory,const std::string& id,const std::string& resource){
  auto candidate=inspect(directory,id);if(!candidate.enabled)throw std::runtime_error("扩展已停用。");if(std::find(candidate.permissions.begin(),candidate.permissions.end(),"resources")==candidate.permissions.end())throw std::runtime_error("扩展未获准使用 resources。");return candidate.resources->read(resource);
 }
private:
 static std::string readText(const std::filesystem::path& path,std::size_t limit){
  // Legacy fs::read follows links here (unlike manifest.json). Retain that
  // contract; bounded streaming avoids allocating the entire oversized file.
  std::ifstream input(path,std::ios::binary);if(!input)throw std::runtime_error("无法读取扩展入口。");std::string bytes;char chunk[65536];while(input){input.read(chunk,sizeof(chunk));auto count=std::size_t(input.gcount());if(count>limit-bytes.size())throw std::length_error("扩展入口超过大小限制。");bytes.append(chunk,count);}if(input.bad())throw std::runtime_error("无法完成扩展入口读取。");
  // Rust String::from_utf8 rejects overlong sequences, surrogate codepoints,
  // stray continuations and values beyond U+10FFFF. Keep the original bytes.
  for(std::size_t i=0;i<bytes.size();){auto first=static_cast<unsigned char>(bytes[i++]);if(first<0x80)continue;unsigned remaining=0;std::uint32_t code=0,minimum=0;if(first>=0xc2&&first<=0xdf){remaining=1;code=first&31;minimum=0x80;}else if(first>=0xe0&&first<=0xef){remaining=2;code=first&15;minimum=0x800;}else if(first>=0xf0&&first<=0xf4){remaining=3;code=first&7;minimum=0x10000;}else throw std::invalid_argument("扩展入口必须是 UTF-8 编码。");if(remaining>bytes.size()-i)throw std::invalid_argument("扩展入口必须是 UTF-8 编码。");while(remaining--){auto next=static_cast<unsigned char>(bytes[i++]);if((next&0xc0)!=0x80)throw std::invalid_argument("扩展入口必须是 UTF-8 编码。");code=(code<<6)|(next&63);}if(code<minimum||code>0x10ffff||(code>=0xd800&&code<=0xdfff))throw std::invalid_argument("扩展入口必须是 UTF-8 编码。");}return bytes;
 }
public:
 static RuntimeCandidate inspect(const std::filesystem::path& directory,const std::string& id,bool requireRuntime=true){
  using namespace winrt::Windows::Data::Json;
  if(!validId(id))throw std::invalid_argument("无效的扩展 ID。");
  const auto root=directory/std::filesystem::path(winrt::to_hstring(id).c_str());const auto status=std::filesystem::symlink_status(root);if(!std::filesystem::is_directory(status)||std::filesystem::is_symlink(status))throw std::runtime_error("扩展目录必须是普通目录。");
  RuntimeCandidate candidate;candidate.manifest=JsonObject::Parse(winrt::to_hstring(read(root/"manifest.json",256u*1024u)));const auto& manifest=candidate.manifest;
  if(manifest.GetNamedString(L"id")!=winrt::to_hstring(id))throw std::invalid_argument("扩展清单与扩展 ID 不一致。");
  const bool hasRuntime=manifest.HasKey(L"runtime")&&manifest.GetNamedValue(L"runtime").ValueType()!=JsonValueType::Null;
  if(requireRuntime&&!hasRuntime)throw std::invalid_argument("该扩展未提供运行时页面。");
  if(hasRuntime){
  if(manifest.GetNamedNumber(L"schemaVersion")!=2||manifest.GetNamedString(L"apiVersion")!=L"1.0.0")throw std::invalid_argument("Extension Runtime 需要 schemaVersion 2 / apiVersion 1.0.0。");
  const auto runtime=manifest.GetNamedObject(L"runtime");candidate.entry=winrt::to_string(runtime.GetNamedString(L"entry"));
  ResourceCatalog::packagePath(candidate.entry);
  auto extension=std::filesystem::path(winrt::to_hstring(candidate.entry).c_str()).extension().wstring();for(auto& c:extension)if(c>=L'A'&&c<=L'Z')c=wchar_t(c-L'A'+L'a');if(extension!=L".html"&&extension!=L".htm")throw std::invalid_argument("扩展运行时页面必须是 HTML 文件。");
  const std::vector<std::string> known={"runtime","commands","menus","ui","windows","workspace.read","workspace.write","document.read","document.write","events","storage","resources","tools","io","clipboard","notifications","network","diagnostics"};
  std::set<std::string> seen;if(runtime.HasKey(L"permissions"))for(const auto& value:runtime.GetNamedArray(L"permissions")){const auto permission=winrt::to_string(value.GetString());if(std::find(known.begin(),known.end(),permission)==known.end()||!seen.insert(permission).second)throw std::invalid_argument("扩展权限无效或重复。");candidate.permissions.push_back(permission);}if(!seen.count("runtime"))throw std::invalid_argument("Extension Runtime 必须声明 runtime 权限。");
  std::map<std::string,std::string> resources;if(runtime.HasKey(L"resources"))for(const auto& item:runtime.GetNamedObject(L"resources"))resources.emplace(winrt::to_string(item.Key()),winrt::to_string(item.Value().GetString()));candidate.resources=std::make_shared<ResourceCatalog>(root,candidate.entry,std::move(resources));
  }
  const auto state=readState(directory);if(auto found=state.find(id);found!=state.end())candidate.enabled=found->second;
  candidate.commands=inspectCommands(manifest,candidate.permissions);
  candidate.settings=inspectSettings(manifest,candidate.commands);
  candidate.metadata=inspectMetadata(manifest,candidate.commands);
  candidate.extension={id,candidate.enabled,(manifest.HasKey(L"settingsEntry")&&manifest.GetNamedValue(L"settingsEntry").ValueType()!=JsonValueType::Null)||(manifest.HasKey(L"settingsUi")&&manifest.GetNamedValue(L"settingsUi").ValueType()!=JsonValueType::Null)};return candidate;
 }
};
}
