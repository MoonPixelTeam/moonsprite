#pragma once
#include "extension_runtime_directory.h"
#include "atomic_file.h"
#include <windows.h>
#include <fstream>
#include <tuple>
namespace moon::script {
struct Entry {
 std::string id,name;std::filesystem::path path;
 std::optional<std::string> extensionId,extensionName,commandId,description;
};
struct Source {std::filesystem::path path;std::string name,text;};
class Directory {
 static std::string utf8(const std::filesystem::path& path){return winrt::to_string(path.wstring());}
 static bool lua(const std::filesystem::path& path){auto suffix=path.extension().wstring();for(auto& c:suffix)if(c>=L'A'&&c<=L'Z')c=wchar_t(c-L'A'+L'a');return suffix==L".lua";}
 static std::string lower(const std::string& value){const auto text=winrt::to_hstring(value);const auto n=LCMapStringEx(LOCALE_NAME_INVARIANT,LCMAP_LOWERCASE,text.data(),int(text.size()),nullptr,0,nullptr,nullptr,0);if(!n&&text.size())throw std::runtime_error("Cannot sort script names");std::wstring result(n,L'\0');if(n)LCMapStringEx(LOCALE_NAME_INVARIANT,LCMAP_LOWERCASE,text.data(),int(text.size()),result.data(),n,nullptr,nullptr,0);return winrt::to_string(result);}
 static void sort(std::vector<Entry>& entries){std::stable_sort(entries.begin(),entries.end(),[](const auto& a,const auto& b){return std::make_tuple(lower(a.name),a.extensionName,a.id)<std::make_tuple(lower(b.name),b.extensionName,b.id);});}
public:
 static constexpr std::size_t maxBytes=1024u*1024u;
 static Entry extensionEntry(const extension::LuaEntry& entry){Entry result;result.id="extension:"+entry.extensionId+(entry.commandId?":"+*entry.commandId:"");result.name=entry.commandName.value_or(entry.extensionName);result.path=entry.path;result.extensionId=entry.extensionId;result.extensionName=entry.extensionName;result.commandId=entry.commandId;result.description=entry.commandDescription;return result;}
 static std::vector<Entry> listLocal(const std::filesystem::path& directory){
  std::vector<Entry> result;for(const auto& entry:std::filesystem::directory_iterator(directory)){std::error_code error;const auto status=entry.symlink_status(error);if(error||!std::filesystem::is_regular_file(status)||std::filesystem::is_symlink(status)||!lua(entry.path()))continue;Entry item;item.id=utf8(entry.path().filename());item.name=utf8(entry.path().stem());if(item.name.empty())item.name=item.id;item.path=entry.path();result.push_back(std::move(item));}sort(result);return result;
 }
 static std::vector<Entry> list(const std::filesystem::path& scripts,const std::filesystem::path& extensions){auto result=listLocal(scripts);for(const auto& entry:extension::RuntimeDirectory::listLua(extensions))result.push_back(extensionEntry(entry));sort(result);return result;}
 static std::filesystem::path resolveLocal(const std::filesystem::path& directory,const std::string& id){
  auto requested=std::filesystem::path(winrt::to_hstring(id).c_str());if(id.empty()||id.find_first_of("/\\")!=std::string::npos||id.find(':')!=std::string::npos||id.find('\0')!=std::string::npos||requested.is_absolute()||requested.filename()!=requested||!lua(requested))throw std::invalid_argument("无效的 Lua 脚本标识。");auto path=directory/requested;const auto status=std::filesystem::symlink_status(path);if(!std::filesystem::is_regular_file(status)||std::filesystem::is_symlink(status))throw std::invalid_argument("只允许运行脚本文件夹内的普通 Lua 文件。");return path;
 }
 static Source loadFile(const std::filesystem::path& path){
  const auto status=std::filesystem::symlink_status(path);if(!std::filesystem::is_regular_file(status)||std::filesystem::is_symlink(status))throw std::invalid_argument("只允许运行普通 Lua 文件。");std::ifstream input(path,std::ios::binary);if(!input)throw std::runtime_error("无法读取 Lua 脚本。");std::string bytes;char chunk[65536];while(input){input.read(chunk,sizeof(chunk));auto n=std::size_t(input.gcount());if(n>maxBytes-bytes.size())throw std::length_error("Lua scripts cannot exceed 1048576 bytes.");bytes.append(chunk,n);}if(input.bad())throw std::runtime_error("Cannot complete Lua script read");if(!bytes.empty()&&!MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,bytes.data(),int(bytes.size()),nullptr,0))throw std::invalid_argument("Lua scripts must use UTF-8.");return {path,utf8(path.filename()),std::move(bytes)};
 }
 static Source load(const std::filesystem::path& scripts,const std::filesystem::path& extensions,const std::string& id){
  if(id.rfind("extension:",0)!=0)return loadFile(resolveLocal(scripts,id));const auto reference=id.substr(10);const auto colon=reference.find(':');const auto owner=reference.substr(0,colon);std::optional<std::string> command;if(colon!=std::string::npos)command=reference.substr(colon+1);if(owner.empty()||(command&&command->empty()))throw std::invalid_argument("无效的扩展脚本标识。");return loadFile(extension::RuntimeDirectory::resolveLua(extensions,owner,command).path);
 }
 static void remove(const std::filesystem::path& directory,const std::string& id){if(id.rfind("extension:",0)==0)throw std::invalid_argument("扩展提供的脚本必须随扩展一起管理。");if(!std::filesystem::remove(resolveLocal(directory,id)))throw std::runtime_error("Cannot delete Lua script");}
 // Source bytes come from the unchanged bundled legacy moon-phase.lua asset.
 static void seed(const std::filesystem::path& directory,const std::vector<std::uint8_t>& example){auto marker=directory/".moonsprite-script-examples.v1";if(std::filesystem::is_regular_file(marker))return;auto script=directory/"moon-phase.lua";if(!std::filesystem::exists(script))writeBinaryFileAtomic(script,example);writeBinaryFileAtomic(marker,{'1'});}
};
}
