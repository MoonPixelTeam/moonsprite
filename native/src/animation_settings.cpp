#include "animation_settings.h"
#include "image_export.h"
#include <windows.h>
#include <roapi.h>
#ifdef GetObject
#undef GetObject
#endif
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <cmath>
#include <fstream>
#include <sstream>
namespace moon::animationprefs {namespace {
using namespace winrt::Windows::Data::Json;
struct Apartment {HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);Apartment(){if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize animation JSON parser");}~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}};
bool is(const JsonObject& o,const wchar_t* key,JsonValueType type){return o.HasKey(key)&&o.GetNamedValue(key).ValueType()==type;}
bool flag(const JsonObject& o,const wchar_t* key,bool fallback){return is(o,key,JsonValueType::Boolean)?o.GetNamedBoolean(key):fallback;}
int number(const JsonObject& o,const wchar_t* key,int fallback,int max){if(!is(o,key,JsonValueType::Number))return fallback;const auto n=o.GetNamedNumber(key);return std::isfinite(n)?int(std::floor(std::clamp(n,0.,double(max))+.5)):fallback;}
timeline::Pixel color(const JsonObject& o,const wchar_t* key,timeline::Pixel fallback){if(!is(o,key,JsonValueType::Object))return fallback;auto c=o.GetNamedObject(key);timeline::Pixel out=0;int shift=0;for(auto field:{L"r",L"g",L"b",L"a"}){if(!is(c,field,JsonValueType::Number))return fallback;out|=timeline::Pixel(number(c,field,0,255))<<shift;shift+=8;}return out;}
std::string rgba(timeline::Pixel c){return "{\"r\":"+std::to_string(c&255)+",\"g\":"+std::to_string((c>>8)&255)+",\"b\":"+std::to_string((c>>16)&255)+",\"a\":"+std::to_string(c>>24)+"}";}
}
Settings parse(const std::string& text){Apartment apartment;JsonObject root;if(!JsonObject::TryParse(winrt::to_hstring(text),root))throw std::runtime_error("Invalid animation settings JSON; original retained");Settings out;out.skipDisabledFrames=flag(root,L"skipDisabledFrames",true);auto& v=out.onion;if(!is(root,L"onionSkin",JsonValueType::Object))return out;auto o=root.GetNamedObject(L"onionSkin");v.enabled=flag(o,L"enabled",false);v.allLayers=is(o,L"scope",JsonValueType::String)&&o.GetNamedString(L"scope")==L"all-layers";v.showDuringPlayback=flag(o,L"showDuringPlayback",true);v.previousFrames=number(o,L"previousFrames",1,8);v.nextFrames=number(o,L"nextFrames",1,8);v.previousOpacity=number(o,L"previousOpacity",35,100);v.nextOpacity=number(o,L"nextOpacity",35,100);v.previousColor=color(o,L"previousColor",v.previousColor);v.nextColor=color(o,L"nextColor",v.nextColor);return out;}
std::string serialize(const Settings& s){const auto& v=s.onion;return "{\"skipDisabledFrames\":"+std::string(s.skipDisabledFrames?"true":"false")+",\"onionSkin\":{\"enabled\":"+(v.enabled?"true":"false")+",\"scope\":\""+(v.allLayers?"all-layers":"current-layer")+"\",\"showDuringPlayback\":"+(v.showDuringPlayback?"true":"false")+",\"previousFrames\":"+std::to_string(int(std::floor(std::clamp(v.previousFrames,0.,8.)+.5)))+",\"nextFrames\":"+std::to_string(int(std::floor(std::clamp(v.nextFrames,0.,8.)+.5)))+",\"previousOpacity\":"+std::to_string(int(std::floor(std::clamp(v.previousOpacity,0.,100.)+.5)))+",\"nextOpacity\":"+std::to_string(int(std::floor(std::clamp(v.nextOpacity,0.,100.)+.5)))+",\"previousColor\":"+rgba(v.previousColor)+",\"nextColor\":"+rgba(v.nextColor)+"}}";}
Settings load(const std::filesystem::path& path,const std::filesystem::path& old){if(std::filesystem::exists(path)){std::ifstream in(path,std::ios::binary);if(!in)throw std::runtime_error("Cannot read animation settings; writes disabled");std::ostringstream text;text<<in.rdbuf();if(in.bad())throw std::runtime_error("Cannot read animation settings");return parse(text.str());}Settings s;if(!old.empty()&&std::filesystem::exists(old)){std::ifstream in(old);auto& v=s.onion;if(!(in>>v.enabled>>v.allLayers>>v.showDuringPlayback>>v.previousFrames>>v.nextFrames>>v.previousOpacity>>v.nextOpacity>>v.previousColor>>v.nextColor))throw std::runtime_error("Cannot read original onion preferences; writes disabled");v.previousFrames=std::clamp(v.previousFrames,0.,8.);v.nextFrames=std::clamp(v.nextFrames,0.,8.);v.previousOpacity=std::clamp(v.previousOpacity,0.,100.);v.nextOpacity=std::clamp(v.nextOpacity,0.,100.);}return s;}
void save(const std::filesystem::path& path,const Settings& s){std::filesystem::create_directories(path.parent_path());auto bytes=serialize(s);writeExportBytesAtomic(path,{bytes.begin(),bytes.end()});}
}
