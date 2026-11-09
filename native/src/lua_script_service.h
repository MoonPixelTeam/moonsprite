#pragma once
#include "lua_script_directory.h"
#include "lua_builtin_example.h"
#include <shellapi.h>
namespace moon::script {
inline std::filesystem::path executableDirectory(){std::wstring path(32768,0);const auto count=GetModuleFileNameW(nullptr,path.data(),DWORD(path.size()));if(!count||count==path.size())throw std::runtime_error("无法确定 MoonSprite 程序目录。");path.resize(count);return std::filesystem::path(path).parent_path();}
inline void openScriptFolder(const std::filesystem::path& directory){SHELLEXECUTEINFOW action{};action.cbSize=sizeof(action);action.fMask=SEE_MASK_FLAG_NO_UI;action.lpVerb=L"open";action.lpFile=directory.c_str();action.nShow=SW_SHOWNORMAL;if(!ShellExecuteExW(&action))throw std::system_error(int(GetLastError()),std::system_category(),"无法打开脚本文件夹");}
class Service {
 std::filesystem::path root_,extensions_;std::function<void(const std::filesystem::path&)> opener_;
 std::filesystem::path scripts()const{auto directory=root_/"scripts";std::filesystem::create_directories(directory);Directory::seed(directory,builtinExample());return directory;}
public:
 explicit Service(std::filesystem::path root=executableDirectory(),std::function<void(const std::filesystem::path&)> opener=openScriptFolder):root_(std::move(root)),extensions_(root_/"extensions"),opener_(std::move(opener)){}
 winrt::Windows::Data::Json::JsonObject list()const{
  using namespace winrt::Windows::Data::Json;auto directory=scripts();std::filesystem::create_directories(extensions_);JsonArray scripts;for(const auto& entry:Directory::list(directory,extensions_)){JsonObject object;auto text=[&](const wchar_t* key,const std::string& value){object.Insert(key,JsonValue::CreateStringValue(winrt::to_hstring(value)));};text(L"id",entry.id);text(L"name",entry.name);object.Insert(L"filePath",JsonValue::CreateStringValue(entry.path.wstring()));if(entry.extensionId)text(L"extensionId",*entry.extensionId);if(entry.extensionName)text(L"extensionName",*entry.extensionName);if(entry.commandId)text(L"extensionCommandId",*entry.commandId);if(entry.description)text(L"extensionDescription",*entry.description);scripts.Append(object);}JsonObject result;result.Insert(L"directoryPath",JsonValue::CreateStringValue(directory.wstring()));result.Insert(L"scripts",scripts);return result;
 }
 Source load(const std::string& id)const{if(id.rfind("extension:",0)==0)return Directory::load(root_/"scripts",extensions_,id);return Directory::load(scripts(),extensions_,id);}
 void remove(const std::string& id)const{if(id.rfind("extension:",0)==0)throw std::invalid_argument("扩展提供的脚本必须随扩展一起管理。");Directory::remove(scripts(),id);}
 void openFolder()const{auto directory=scripts();if(!opener_)throw std::runtime_error("Script folder opener is not connected");opener_(directory);}
};
}
