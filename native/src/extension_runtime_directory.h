#pragma once
#include "extension_resources.h"
#include <limits>
#include "extension_runtime.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
namespace moon::extension {
// A lossless inspected candidate, NOT an installed/validated executable package.
// Other manifest domains remain preserved until their validators are migrated.
struct RuntimeCandidate {
 winrt::Windows::Data::Json::JsonObject manifest;
 RuntimeExtension extension;
 std::string entry;
 std::vector<std::string> permissions;
 std::shared_ptr<ResourceCatalog> resources;
 bool enabled=true;
};
class RuntimeDirectory {
 static std::string read(const std::filesystem::path& path,std::size_t limit){
  const auto status=std::filesystem::symlink_status(path);if(!std::filesystem::is_regular_file(status)||std::filesystem::is_symlink(status))throw std::runtime_error("扩展清单或状态文件必须是普通文件。");
  std::ifstream input(path,std::ios::binary);if(!input)throw std::runtime_error("Cannot read extension metadata");std::string bytes;char chunk[65536];while(input){input.read(chunk,sizeof(chunk));const auto count=std::size_t(input.gcount());if(count>limit-bytes.size())throw std::length_error("Extension metadata exceeds size limit");bytes.append(chunk,count);}if(input.bad())throw std::runtime_error("Cannot finish extension metadata read");return bytes;
 }
 static bool validId(const std::string& id){return !id.empty()&&id.size()<=80&&id.front()!='.'&&id.back()!='.'&&id.find("..")==std::string::npos&&std::all_of(id.begin(),id.end(),[](unsigned char c){return (c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='.'||c=='-'||c=='_';});}
public:
 static RuntimeCandidate inspect(const std::filesystem::path& directory,const std::string& id){
  using namespace winrt::Windows::Data::Json;
  if(!validId(id))throw std::invalid_argument("无效的扩展 ID。");
  const auto root=directory/std::filesystem::path(winrt::to_hstring(id).c_str());const auto status=std::filesystem::symlink_status(root);if(!std::filesystem::is_directory(status)||std::filesystem::is_symlink(status))throw std::runtime_error("扩展目录必须是普通目录。");
  RuntimeCandidate candidate;candidate.manifest=JsonObject::Parse(winrt::to_hstring(read(root/"manifest.json",256u*1024u)));const auto& manifest=candidate.manifest;
  if(manifest.GetNamedString(L"id")!=winrt::to_hstring(id))throw std::invalid_argument("扩展清单与扩展 ID 不一致。");
  if(manifest.GetNamedNumber(L"schemaVersion")!=2||manifest.GetNamedString(L"apiVersion")!=L"1.0.0")throw std::invalid_argument("Extension Runtime 需要 schemaVersion 2 / apiVersion 1.0.0。");
  const auto runtime=manifest.GetNamedObject(L"runtime");candidate.entry=winrt::to_string(runtime.GetNamedString(L"entry"));
  ResourceCatalog::packagePath(candidate.entry);
  auto extension=std::filesystem::path(winrt::to_hstring(candidate.entry).c_str()).extension().wstring();for(auto& c:extension)if(c>=L'A'&&c<=L'Z')c=wchar_t(c-L'A'+L'a');if(extension!=L".html"&&extension!=L".htm")throw std::invalid_argument("扩展运行时页面必须是 HTML 文件。");
  const std::vector<std::string> known={"runtime","commands","menus","ui","windows","workspace.read","workspace.write","document.read","document.write","events","storage","resources","tools","io","clipboard","notifications","network","diagnostics"};
  std::set<std::string> seen;if(runtime.HasKey(L"permissions"))for(const auto& value:runtime.GetNamedArray(L"permissions")){const auto permission=winrt::to_string(value.GetString());if(std::find(known.begin(),known.end(),permission)==known.end()||!seen.insert(permission).second)throw std::invalid_argument("扩展权限无效或重复。");candidate.permissions.push_back(permission);}if(!seen.count("runtime"))throw std::invalid_argument("Extension Runtime 必须声明 runtime 权限。");
  std::map<std::string,std::string> resources;if(runtime.HasKey(L"resources"))for(const auto& item:runtime.GetNamedObject(L"resources"))resources.emplace(winrt::to_string(item.Key()),winrt::to_string(item.Value().GetString()));candidate.resources=std::make_shared<ResourceCatalog>(root,candidate.entry,std::move(resources));
  const auto statePath=directory/".state.json";std::error_code error;const auto stateStatus=std::filesystem::symlink_status(statePath,error);if(error&&error!=std::errc::no_such_file_or_directory)throw std::system_error(error);if(std::filesystem::exists(stateStatus)){
   // Rust read_state has no metadata-size cap. Preserve that contract here.
   const auto state=JsonObject::Parse(winrt::to_hstring(read(statePath,std::numeric_limits<std::size_t>::max())));if(state.HasKey(L"enabled")){const auto enabled=state.GetNamedObject(L"enabled");for(const auto& item:enabled){const bool value=item.Value().GetBoolean();if(item.Key()==winrt::to_hstring(id))candidate.enabled=value;}}
  }
  candidate.extension={id,candidate.enabled,manifest.HasKey(L"settingsEntry")||manifest.HasKey(L"settingsUi")};return candidate;
 }
};
}
