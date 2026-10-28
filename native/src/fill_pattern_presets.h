#pragma once
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include "pattern_fill.h"
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
struct FillPatternPreset {std::string id;std::u32string name;PatternMode mode=PatternMode::Random;PatternSettings settings;};
class FillPatternPresetStore {
 using Json=winrt::Windows::Data::Json::JsonObject;using Array=winrt::Windows::Data::Json::JsonArray;using Value=winrt::Windows::Data::Json::JsonValue;
 std::filesystem::path path_;
public:
 struct Apartment{HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);Apartment(){if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize fill preset library");}~Apartment(){if(SUCCEEDED(status)){winrt::clear_factory_cache();RoUninitialize();}}};
 static std::string utf8(const std::u32string& s){return std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.to_bytes(s);}
 static std::u32string unicode(const std::string& s){return std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.from_bytes(s);}
 static bool whitespace(char32_t c){return c==9||c==10||c==11||c==12||c==13||c==32||c==0xa0||c==0x1680||(c>=0x2000&&c<=0x200a)||c==0x2028||c==0x2029||c==0x202f||c==0x205f||c==0x3000||c==0xfeff;}
 static std::u32string trim(std::u32string name){while(!name.empty()&&whitespace(name.front()))name.erase(name.begin());while(!name.empty()&&whitespace(name.back()))name.pop_back();return name;}
 static std::wstring folded(const std::u32string& name){const auto h=winrt::to_hstring(utf8(name));const int n=LCMapStringEx(LOCALE_NAME_INVARIANT,LCMAP_LOWERCASE,h.c_str(),int(h.size()),nullptr,0,nullptr,nullptr,0);if(!n)throw std::runtime_error("Cannot compare preset names");std::wstring out(n,L' ');if(!LCMapStringEx(LOCALE_NAME_INVARIANT,LCMAP_LOWERCASE,h.c_str(),int(h.size()),out.data(),n,nullptr,nullptr,0))throw std::runtime_error("Cannot compare preset names");return out;}
 static void atomicWrite(const std::filesystem::path& path,const std::string& text){if(GetFileAttributesW(path.parent_path().c_str())==INVALID_FILE_ATTRIBUTES)std::filesystem::create_directories(path.parent_path());auto pending=path;pending+=L".pending-"+std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64());try{std::ofstream out(pending,std::ios::binary|std::ios::trunc);out.exceptions(std::ios::failbit|std::ios::badbit);out<<text;out.close();if(!MoveFileExW(pending.c_str(),path.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("Cannot save fill preset library");}catch(...){std::error_code ec;std::filesystem::remove(pending,ec);throw;}}
 explicit FillPatternPresetStore(std::filesystem::path directory):path_(directory/"fill-pattern-presets.v1.json"){}
 const std::filesystem::path& path()const{return path_;}
 static PatternSettings normalized(PatternSettings s){s.randomDensity=std::clamp(s.randomDensity,0,1000);s.randomCount=std::clamp(s.randomCount,0,100000);s.randomSpacing=std::clamp(s.randomSpacing,0,4096);s.regularCount=std::clamp(s.regularCount,0,100000);s.regularSpacingX=std::clamp(s.regularSpacingX,-4096,4096);s.regularSpacingY=std::clamp(s.regularSpacingY,-4096,4096);s.regularRowOffset=std::clamp(s.regularRowOffset,0,100);return s;}
 static Json encode(PatternMode mode,PatternSettings s){s=normalized(s);Json o;auto n=[&](const wchar_t* k,int v){o.SetNamedValue(k,Value::CreateNumberValue(v));};if(mode==PatternMode::Random){n(L"randomDensity",s.randomDensity);n(L"randomCount",s.randomCount);n(L"randomSpacing",s.randomSpacing);o.SetNamedValue(L"randomOverlap",Value::CreateBooleanValue(s.randomOverlap));}else{n(L"regularCount",s.regularCount);n(L"regularSpacingX",s.regularSpacingX);n(L"regularSpacingY",s.regularSpacingY);n(L"regularRowOffset",s.regularRowOffset);o.SetNamedValue(L"regularOverlap",Value::CreateBooleanValue(s.regularOverlap));}return o;}
 static PatternSettings decode(PatternMode mode,Json o){PatternSettings s;auto number=[&](const wchar_t* k,int lo,int hi){const auto v=o.GetNamedValue(k);if(v.ValueType()!=winrt::Windows::Data::Json::JsonValueType::Number)throw std::runtime_error("Invalid preset");const double n=v.GetNumber();if(!std::isfinite(n)||std::floor(n)!=n||n<lo||n>hi)throw std::runtime_error("Invalid preset");return int(n);};if(mode==PatternMode::Random){s.randomDensity=number(L"randomDensity",0,1000);s.randomCount=number(L"randomCount",0,100000);s.randomSpacing=number(L"randomSpacing",0,4096);s.randomOverlap=o.GetNamedBoolean(L"randomOverlap");}else{s.regularCount=number(L"regularCount",0,100000);s.regularSpacingX=number(L"regularSpacingX",-4096,4096);s.regularSpacingY=number(L"regularSpacingY",-4096,4096);s.regularRowOffset=number(L"regularRowOffset",0,100);s.regularOverlap=o.GetNamedBoolean(L"regularOverlap");}return s;}
 static std::vector<FillPatternPreset> builtins(){std::vector<FillPatternPreset> p={{"natural",U"自然散布",PatternMode::Random,{}},{"sparse",U"稀疏散布",PatternMode::Random,{}},{"dense",U"密集叠加",PatternMode::Random,{}},{"tiles",U"紧密平铺",PatternMode::Regular,{}},{"wide-spaced",U"宽间隔排列",PatternMode::Regular,{}},{"spaced",U"间隔排列",PatternMode::Regular,{}}};p[1].settings.randomDensity=25;p[1].settings.randomOverlap=false;p[2].settings.randomDensity=250;p[4].settings.regularSpacingX=p[4].settings.regularSpacingY=8;p[5].settings.regularSpacingX=p[5].settings.regularSpacingY=4;return p;}
 std::vector<FillPatternPreset> load()const try{Apartment apartment;std::ifstream input(path_,std::ios::binary);if(!input){if(!std::filesystem::exists(path_))return {};throw std::runtime_error("Read failed");}input.seekg(0,std::ios::end);if(input.tellg()>1024*1024)throw std::runtime_error("Invalid library");input.seekg(0);std::ostringstream buffer;buffer<<input.rdbuf();if(input.bad())throw std::runtime_error("Read failed");const auto root=Json::Parse(winrt::to_hstring(buffer.str()));if(root.GetNamedNumber(L"version")!=1)throw std::runtime_error("Invalid library");const auto entries=root.GetNamedArray(L"presets");if(entries.Size()>64)throw std::runtime_error("Invalid library");std::set<std::string> ids;std::set<std::pair<int,std::wstring>> names;std::vector<FillPatternPreset> out;for(auto v:entries){const auto o=v.GetObject();FillPatternPreset p;auto id=o.GetNamedString(L"id"),name=o.GetNamedString(L"name"),mode=o.GetNamedString(L"mode");if(mode!=L"random"&&mode!=L"regular")throw std::runtime_error("Invalid preset");p.id=winrt::to_string(id);p.name=unicode(winrt::to_string(name));p.mode=mode==L"random"?PatternMode::Random:PatternMode::Regular;if(id.empty()||id.size()>100||name.empty()||name.size()>80||trim(p.name)!=p.name||!ids.insert(p.id).second||!names.insert({int(p.mode),folded(p.name)}).second)throw std::runtime_error("Invalid preset");p.settings=decode(p.mode,o.GetNamedObject(L"settings"));out.push_back(std::move(p));}return out;}catch(...){throw std::runtime_error("无法读取填充预设，请检查本地存储；原有预设未被覆盖。");}
 void store(const std::vector<FillPatternPreset>& presets)const try{Apartment apartment;Json root;root.SetNamedValue(L"version",Value::CreateNumberValue(1));Array entries;for(const auto& p:presets){Json o;o.SetNamedValue(L"id",Value::CreateStringValue(winrt::to_hstring(p.id)));o.SetNamedValue(L"name",Value::CreateStringValue(winrt::to_hstring(utf8(p.name))));o.SetNamedValue(L"mode",Value::CreateStringValue(p.mode==PatternMode::Random?L"random":L"regular"));o.SetNamedValue(L"settings",encode(p.mode,p.settings));entries.Append(o);}root.SetNamedValue(L"presets",entries);atomicWrite(path_,winrt::to_string(root.Stringify()));}catch(...){throw std::runtime_error("填充预设保存失败，请检查本地存储空间或权限。");}
 std::vector<FillPatternPreset> save(PatternMode mode,std::u32string name,PatternSettings settings,const std::string& id={})const{Apartment apartment;name=trim(std::move(name));if(name.empty()||winrt::to_hstring(utf8(name)).size()>80)throw std::runtime_error("请输入 1–80 个字符的预设名称。");auto presets=load();auto target=std::find_if(presets.begin(),presets.end(),[&](const auto& p){return p.id==id&&p.mode==mode;});if(!id.empty()&&target==presets.end())throw std::runtime_error("无法读取填充预设，请检查本地存储；原有预设未被覆盖。");const auto key=folded(name);if(std::any_of(presets.begin(),presets.end(),[&](const auto& p){return p.mode==mode&&p.id!=id&&folded(p.name)==key;}))throw std::runtime_error("当前模式已有同名预设，请换一个名称或选中原预设后更新。");if(id.empty()&&presets.size()>=64)throw std::runtime_error("最多可保存 64 个自定义填充预设。");std::string identifier=id;if(identifier.empty()){GUID guid;if(FAILED(CoCreateGuid(&guid)))throw std::runtime_error("Cannot create preset identifier");wchar_t text[40]{};StringFromGUID2(guid,text,40);identifier="fill-preset-"+winrt::to_string(text);}FillPatternPreset p{identifier,std::move(name),mode,normalized(settings)};if(target==presets.end())presets.push_back(std::move(p));else *target=std::move(p);store(presets);return presets;}
 std::vector<FillPatternPreset> remove(const std::string& id)const{auto presets=load();presets.erase(std::remove_if(presets.begin(),presets.end(),[&](const auto& p){return p.id==id;}),presets.end());store(presets);return presets;}
};
}
