#pragma once
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include "animation_transform.h"
#include <filesystem>
#include <fstream>
#include <sstream>
#include <set>
#include <codecvt>
#include <locale>
#include <roapi.h>
#include <windows.h>
#ifdef GetObject
#undef GetObject
#endif
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Data.Json.h>
#pragma comment(lib,"windowsapp.lib")
#ifdef small
#undef small
#endif
namespace moon {
struct TweenPathPreset{std::string id;std::u32string name;std::vector<TweenPathPoint> path;};
// Same version1 JSON as legacy localStorage; the existing native preset directory
// and atomic replacement pattern replace browser storage, never project contents.
class TweenPathPresetStore {
 std::filesystem::path path_;using Json=winrt::Windows::Data::Json::JsonObject;using Array=winrt::Windows::Data::Json::JsonArray;using Value=winrt::Windows::Data::Json::JsonValue;
 struct Apartment{HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);Apartment(){if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize path library");}~Apartment(){if(SUCCEEDED(status)){winrt::clear_factory_cache();RoUninitialize();}}};
 static std::string utf8(const std::u32string& s){return std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.to_bytes(s);}
 static std::u32string unicode(const std::string& s){return std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.from_bytes(s);}
 static bool whitespace(char32_t c){return c==9||c==10||c==11||c==12||c==13||c==32||c==0xa0||c==0x1680||(c>=0x2000&&c<=0x200a)||c==0x2028||c==0x2029||c==0x202f||c==0x205f||c==0x3000||c==0xfeff;}
 static std::u32string trim(std::u32string name){while(!name.empty()&&whitespace(name.front()))name.erase(name.begin());while(!name.empty()&&whitespace(name.back()))name.pop_back();return name;}
 static std::wstring folded(const std::u32string& name){const auto h=winrt::to_hstring(utf8(name));const int n=LCMapStringEx(LOCALE_NAME_INVARIANT,LCMAP_LOWERCASE,h.c_str(),int(h.size()),nullptr,0,nullptr,nullptr,0);if(!n)throw std::runtime_error("Cannot compare path names");std::wstring out(n,L' ');if(!LCMapStringEx(LOCALE_NAME_INVARIANT,LCMAP_LOWERCASE,h.c_str(),int(h.size()),out.data(),n,nullptr,nullptr,0))throw std::runtime_error("Cannot compare path names");return out;}
 static bool validPath(const std::vector<TweenPathPoint>& points){if(std::any_of(points.begin(),points.end(),[](auto p){return std::floor(p.x)!=p.x||std::floor(p.y)!=p.y;}))return false;try{TransformTweenOptions o;o.path=points;validateTransformTweenOptions(o);return true;}catch(...){return false;}}
 static void atomicWrite(const std::filesystem::path& path,const std::string& text){if(GetFileAttributesW(path.parent_path().c_str())==INVALID_FILE_ATTRIBUTES)std::filesystem::create_directories(path.parent_path());auto pending=path;pending+=L".pending-"+std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64());try{std::ofstream out(pending,std::ios::binary|std::ios::trunc);out.exceptions(std::ios::failbit|std::ios::badbit);out<<text;out.close();if(!MoveFileExW(pending.c_str(),path.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("Cannot save path library");}catch(...){std::error_code ec;std::filesystem::remove(pending,ec);throw;}}
 void store(const std::vector<TweenPathPreset>& presets)const{Json root;root.SetNamedValue(L"version",Value::CreateNumberValue(1));Array paths;for(const auto& p:presets){Json entry;entry.SetNamedValue(L"id",Value::CreateStringValue(winrt::to_hstring(p.id)));entry.SetNamedValue(L"name",Value::CreateStringValue(winrt::to_hstring(utf8(p.name))));Array points;for(auto point:p.path){Json item;item.SetNamedValue(L"x",Value::CreateNumberValue(point.x));item.SetNamedValue(L"y",Value::CreateNumberValue(point.y));points.Append(item);}entry.SetNamedValue(L"path",points);paths.Append(entry);}root.SetNamedValue(L"paths",paths);atomicWrite(path_,winrt::to_string(root.Stringify()));}
public:
 explicit TweenPathPresetStore(std::filesystem::path directory):path_(directory/"animation-tween-paths.v1.json"){}
 static bool validName(const std::u32string& name){const auto n=trim(name);return !n.empty()&&winrt::to_hstring(utf8(n)).size()<=80;}
 const std::filesystem::path& path()const{return path_;}
 std::vector<TweenPathPreset> load()const try{Apartment apartment;std::ifstream input(path_,std::ios::binary);if(!input){if(!std::filesystem::exists(path_))return {};throw std::runtime_error("Cannot read path library");}input.seekg(0,std::ios::end);if(input.tellg()>16*1024*1024)throw std::runtime_error("Invalid path library");input.seekg(0);std::ostringstream buffer;buffer<<input.rdbuf();if(input.bad())throw std::runtime_error("Cannot read path library");const auto root=Json::Parse(winrt::to_hstring(buffer.str()));if(root.GetNamedNumber(L"version")!=1)throw std::runtime_error("Invalid path library version");const auto paths=root.GetNamedArray(L"paths");if(paths.Size()>64)throw std::runtime_error("Path library is full");std::set<std::string> ids;std::set<std::wstring> names;std::vector<TweenPathPreset> result;
  for(auto value:paths){const auto entry=value.GetObject();TweenPathPreset p;p.id=winrt::to_string(entry.GetNamedString(L"id"));const auto name=entry.GetNamedString(L"name");p.name=unicode(winrt::to_string(name));if(p.id.empty()||entry.GetNamedString(L"id").size()>100||p.name.empty()||name.size()>80||trim(p.name)!=p.name||!ids.insert(p.id).second||!names.insert(folded(p.name)).second)throw std::runtime_error("Invalid path preset");const auto points=entry.GetNamedArray(L"path");if(points.Size()<2||points.Size()>2048)throw std::runtime_error("Invalid path preset");for(auto v:points){const auto point=v.GetObject();p.path.push_back({point.GetNamedNumber(L"x"),point.GetNamedNumber(L"y")});}if(!validPath(p.path))throw std::runtime_error("Invalid path preset");result.push_back(std::move(p));}return result;
 }catch(...){throw std::runtime_error("Cannot read path library; existing data preserved");}
 std::vector<TweenPathPreset> save(std::u32string name,const std::vector<TweenPathPoint>& points)const{Apartment apartment;name=trim(std::move(name));if(name.empty()||winrt::to_hstring(utf8(name)).size()>80)throw std::runtime_error("Path name must contain 1..80 characters");if(!validPath(points))throw std::runtime_error("Invalid tween path");auto presets=load();const auto key=folded(name);if(std::any_of(presets.begin(),presets.end(),[&](const auto& p){return folded(p.name)==key;}))throw std::runtime_error("Path name already exists");if(presets.size()>=64)throw std::runtime_error("Path library is full");GUID guid;if(FAILED(CoCreateGuid(&guid)))throw std::runtime_error("Cannot create path identifier");wchar_t text[40]{};StringFromGUID2(guid,text,40);presets.push_back({"tween-path-"+winrt::to_string(text),std::move(name),points});try{store(presets);}catch(...){throw std::runtime_error("Cannot save path library; existing data preserved");}return presets;}
};
}
