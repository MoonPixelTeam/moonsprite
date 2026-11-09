#pragma once
#include "extension_runtime_directory.h"
#include "project_reader.h"
#include <atomic>
namespace moon::extension {
struct PackageEntry {std::string name;bool directory;std::uint64_t size;};
struct PackageInspection {RuntimeCandidate candidate;std::vector<PackageEntry> entries;std::shared_ptr<project::Archive> archive;};
inline PackageInspection inspectPackage(const std::filesystem::path& path){
 auto extension=path.extension().wstring();for(auto& c:extension)if(c>=L'A'&&c<=L'Z')c=wchar_t(c-L'A'+L'a');if(extension!=L".msext")throw std::invalid_argument("只能预览 .msext 扩展包。");auto status=std::filesystem::symlink_status(path);if(!std::filesystem::is_regular_file(status)||std::filesystem::is_symlink(status))throw std::invalid_argument("扩展包必须是普通文件。");
 auto bytes=std::make_shared<project::Bytes>();std::ifstream input(path,std::ios::binary);if(!input)throw std::runtime_error("无法打开扩展包。");char chunk[65536];while(input){input.read(chunk,sizeof(chunk));auto count=std::size_t(input.gcount());if(count>50u*1024u*1024u-bytes->size())throw std::length_error("扩展包不能超过 50 MiB。");bytes->insert(bytes->end(),chunk,chunk+count);}if(input.bad())throw std::runtime_error("无法读取扩展包。");
 project::Limits limits;limits.archiveBytes=50u*1024u*1024u;limits.expandedBytes=256u*1024u*1024u;limits.maxEntries=256;project::Archive archive(bytes,limits);if(archive.entries().empty())throw std::invalid_argument("扩展包为空。");PackageInspection result;result.archive=std::make_shared<project::Archive>(archive);std::set<std::string> seen;
 for(const auto& item:archive.entries()){auto name=item.first;bool directory=name.back()=='/';if(directory)name.pop_back();ResourceCatalog::packagePath(name);if(!seen.insert(manifest_detail::lower(name)).second)throw std::invalid_argument("扩展包包含重复路径。");if((item.second.madeBy>>8)==3&&((item.second.externalAttributes>>16)&0170000)==0120000)throw std::invalid_argument("扩展包不允许符号链接。");if(name=="manifest.json"&&directory)throw std::invalid_argument("manifest.json 必须是文件。");result.entries.push_back({name,directory,directory?0:item.second.size});}
 auto manifestBytes=archive.read("manifest.json",256u*1024u);auto manifest=winrt::Windows::Data::Json::JsonObject::Parse(winrt::to_hstring(std::string(manifestBytes.begin(),manifestBytes.end())));auto id=winrt::to_string(manifest.GetNamedString(L"id"));result.candidate=RuntimeDirectory::parseManifest(manifest,{},id);
 auto require=[&](const std::string& name,std::uint64_t limit=UINT64_MAX){auto found=std::find_if(result.entries.begin(),result.entries.end(),[&](const auto& e){return !e.directory&&e.name==name;});if(found==result.entries.end()||found->size>limit)throw std::invalid_argument("扩展包声明的入口或资源缺失／超限。");};
 if(result.candidate.metadata.entry)require(*result.candidate.metadata.entry);if(result.candidate.settings.entry)require(*result.candidate.settings.entry);if(!result.candidate.entry.empty())require(result.candidate.entry);for(auto& command:result.candidate.commands)if(command.luaEntry)require(*command.luaEntry);
 if(manifest.HasKey(L"runtime")&&manifest.GetNamedValue(L"runtime").ValueType()!=winrt::Windows::Data::Json::JsonValueType::Null){auto runtime=manifest.GetNamedObject(L"runtime");if(runtime.HasKey(L"resources"))for(auto item:runtime.GetNamedObject(L"resources"))require(winrt::to_string(item.Value().GetString()),16u*1024u*1024u);}return result;
}
inline RuntimeCandidate installInspectedPackage(const PackageInspection& inspection,const std::filesystem::path& directory){
 const auto id=inspection.candidate.extension.id;
 const auto directoryStatus=std::filesystem::symlink_status(directory);if(!std::filesystem::is_directory(directoryStatus)||std::filesystem::is_symlink(directoryStatus))throw std::invalid_argument("扩展安装目录必须是普通目录。");
 static std::atomic<unsigned> serial{0};auto suffix=std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64())+L"-"+std::to_wstring(++serial);auto staging=directory/(L".staging-"+suffix),backup=directory/(L".backup-"+suffix),target=directory/ResourceCatalog::packagePath(id);
 // Only paths immediately beneath this supplied installation root are eligible
 // for transaction cleanup. No arbitrary package path reaches recursive delete.
 const auto absoluteRoot=std::filesystem::absolute(directory).lexically_normal();auto cleanup=[&](const std::filesystem::path& path){if(std::filesystem::absolute(path).lexically_normal().parent_path()!=absoluteRoot)throw std::logic_error("Invalid extension transaction cleanup path");std::error_code ignored;std::filesystem::remove_all(path,ignored);};
 if(!std::filesystem::create_directory(staging))throw std::runtime_error("无法创建扩展临时目录。");bool backed=false,published=false;
 try{
  // Inspection owns one immutable archive snapshot. Reuse it for extraction,
  // preventing a changed source file from mixing two package versions.
  for(const auto& entry:inspection.entries){auto path=staging/ResourceCatalog::packagePath(entry.name);if(entry.directory){std::filesystem::create_directories(path);continue;}std::filesystem::create_directories(path.parent_path());auto bytes=inspection.archive->read(entry.name,std::size_t(entry.size));HANDLE output=CreateFileW(path.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);if(output==INVALID_HANDLE_VALUE)throw std::system_error(int(GetLastError()),std::system_category(),"Cannot create extension file");struct Close{HANDLE handle;~Close(){CloseHandle(handle);}}close{output};std::size_t at=0;while(at<bytes.size()){DWORD count=0;auto requested=DWORD(std::min<std::size_t>(bytes.size()-at,65536));if(!WriteFile(output,bytes.data()+at,requested,&count,nullptr)||!count)throw std::system_error(int(GetLastError()),std::system_category(),"Cannot write extension file");at+=count;}if(!FlushFileBuffers(output))throw std::system_error(int(GetLastError()),std::system_category(),"Cannot flush extension file");}
  std::ifstream manifestFile(staging/"manifest.json",std::ios::binary);if(!manifestFile)throw std::runtime_error("无法重读安装清单。");std::string manifestBytes(std::istreambuf_iterator<char>(manifestFile),{});manifestFile.close();RuntimeDirectory::parseManifest(winrt::Windows::Data::Json::JsonObject::Parse(winrt::to_hstring(manifestBytes)),staging,id);
  // Validate state before moving the existing installation.
  auto statePath=directory/".state.json";ExtensionState state;std::error_code stateError;auto stateStatus=std::filesystem::symlink_status(statePath,stateError);if(stateError&&stateError!=std::errc::no_such_file_or_directory)throw std::system_error(stateError);if(std::filesystem::exists(stateStatus)){if(!std::filesystem::is_regular_file(stateStatus)||std::filesystem::is_symlink(stateStatus))throw std::runtime_error("扩展状态必须是普通文件。");std::ifstream input(statePath,std::ios::binary);if(!input)throw std::runtime_error("无法读取扩展状态。");state=ExtensionState::parse(std::string(std::istreambuf_iterator<char>(input),{}));if(input.bad())throw std::runtime_error("无法完成扩展状态读取。");}
  const bool enabled=state.enabled.count(id)?state.enabled.at(id):true;std::error_code targetError;auto status=std::filesystem::symlink_status(target,targetError);if(targetError&&targetError!=std::errc::no_such_file_or_directory)throw std::system_error(targetError);if(std::filesystem::exists(status)){if(!std::filesystem::is_directory(status)||std::filesystem::is_symlink(status))throw std::runtime_error("原有扩展必须是普通目录。");std::filesystem::rename(target,backup);backed=true;}
  std::filesystem::rename(staging,target);published=true;
  auto result=RuntimeDirectory::setEnabled(directory,id,enabled);published=false;if(backed)cleanup(backup);return result;
 }catch(...){if(published)cleanup(target);if(backed){std::error_code ignored;std::filesystem::rename(backup,target,ignored);}cleanup(staging);throw;}
}
inline RuntimeCandidate installPackage(const std::filesystem::path& package,const std::filesystem::path& directory){return installInspectedPackage(inspectPackage(package),directory);}
inline void ensureBuiltinPackage(const std::filesystem::path& directory,const std::string& id,const std::filesystem::path& package){
 auto state=RuntimeDirectory::state(directory);if(!manifest_detail::validId(id))throw std::invalid_argument("无效的内置扩展 ID。");auto target=directory/ResourceCatalog::packagePath(id);std::error_code error;auto status=std::filesystem::symlink_status(target,error);if(error&&error!=std::errc::no_such_file_or_directory)throw std::system_error(error);const bool installed=std::filesystem::exists(status);if(installed&&(!std::filesystem::is_directory(status)||std::filesystem::is_symlink(status)))throw std::invalid_argument("内置扩展必须是普通目录。");
 // Seed markers survive uninstall: an absent seeded extension stays absent.
 if(state.seededBuiltin.count(id)&&!installed)return;
 auto inspection=inspectPackage(package);if(inspection.candidate.extension.id!=id)throw std::invalid_argument("内置扩展包 ID 与预期不一致。");std::map<std::string,std::pair<std::uint32_t,std::uint64_t>> revision;for(auto& entry:inspection.entries)if(!entry.directory){auto& zip=inspection.archive->entries().at(entry.name);revision.emplace(entry.name,std::make_pair(zip.crc,std::uint64_t(zip.size)));}
 if(installed){RuntimeDirectory::inspect(directory,id,false);auto previous=state.builtinRevisions.find(id);if(previous!=state.builtinRevisions.end()&&previous->second==revision)return;}
 // A path-backed bundle is a native adapter for Rust's embedded byte slice.
 // Reuse the exact inspected snapshot for revision and installation.
 installInspectedPackage(inspection,directory);state=RuntimeDirectory::state(directory);state.seededBuiltin.insert(id);state.builtinRevisions[id]=std::move(revision);RuntimeDirectory::saveState(directory,state);
}
}
