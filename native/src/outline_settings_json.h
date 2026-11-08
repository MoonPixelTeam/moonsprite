#pragma once
#include "outline_samples.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
namespace moon {
inline std::optional<OutlineSettings> decodeOutlineSettings(winrt::Windows::Data::Json::IJsonValue raw,timeline::Pixel fallback=0xff000000){
 using namespace winrt::Windows::Data::Json;
 if(!raw||(raw.ValueType()!=JsonValueType::Object&&raw.ValueType()!=JsonValueType::Array))return {};
 const auto o=raw.ValueType()==JsonValueType::Object?raw.GetObject():JsonObject{};
 auto value=[](const JsonObject& obj,const wchar_t* key)->IJsonValue{return obj.HasKey(key)?obj.GetNamedValue(key):nullptr;};
 auto rounded=[&](const JsonObject& obj,const wchar_t* key,double def,double lo,double hi){auto v=value(obj,key);return v&&v.ValueType()==JsonValueType::Number&&std::isfinite(v.GetNumber())?std::clamp(std::floor(v.GetNumber()+.5),lo,hi):def;};
 auto color=[&](const wchar_t* key,timeline::Pixel def){auto v=value(o,key);auto c=v&&v.ValueType()==JsonValueType::Object?v.GetObject():JsonObject{};timeline::Pixel result=0;const wchar_t* keys[]={L"r",L"g",L"b",L"a"};for(int i=0;i<4;++i)result|=timeline::Pixel(rounded(c,keys[i],(def>>(8*i))&255,0,255))<<(8*i);return result;};
 auto text=[&](const wchar_t* key){auto v=value(o,key);return v&&v.ValueType()==JsonValueType::String?winrt::to_string(v.GetString()):std::string{};};
 auto flag=[&](const JsonObject& obj,const wchar_t* key,bool def){auto v=value(obj,key);return v&&v.ValueType()==JsonValueType::Boolean?v.GetBoolean():def;};
 OutlineSettings result;result.color=color(L"color",fallback);result.sampling.background=color(L"backgroundColor",0);result.sampling.thickness=rounded(o,L"thickness",1,1,64);
 const auto pos=text(L"position"),kernel=text(L"kernel");result.sampling.position=pos=="inside"?0:pos=="both"?2:1;result.sampling.kernel=kernel=="square"?1:kernel=="horizontal"?2:kernel=="vertical"?3:0;
 auto rawDirections=value(o,L"directions");auto directions=rawDirections&&rawDirections.ValueType()==JsonValueType::Object?rawDirections.GetObject():JsonObject{};
 const wchar_t* names[]={L"nw",L"n",L"ne",L"w",L"e",L"sw",L"s",L"se"};result.sampling.directions=0;for(int i=0;i<8;++i)if(flag(directions,names[i],(90u&(1u<<i))!=0))result.sampling.directions|=1u<<i;
 result.smartHue=flag(o,L"smartHue",false);result.darkness=rounded(o,L"smartHueDarkness",45,0,100);result.followOpacity=flag(o,L"followOpacity",false);result.previewEnabled=flag(o,L"previewEnabled",true);return result;
}
inline winrt::Windows::Data::Json::JsonObject encodeOutlineSettings(const OutlineSettings& settings){
 using namespace winrt::Windows::Data::Json;JsonObject o;
 auto color=[](timeline::Pixel p){JsonObject c;const wchar_t* keys[]={L"r",L"g",L"b",L"a"};for(int i=0;i<4;++i)c.Insert(keys[i],JsonValue::CreateNumberValue((p>>(8*i))&255));return c;};
 o.Insert(L"color",color(settings.color));o.Insert(L"backgroundColor",color(settings.sampling.background));
 o.Insert(L"thickness",JsonValue::CreateNumberValue(std::clamp(std::floor(settings.sampling.thickness+.5),1.,64.)));
 const wchar_t* positions[]={L"inside",L"outside",L"both"};const wchar_t* kernels[]={L"round",L"square",L"horizontal",L"vertical"};
 o.Insert(L"position",JsonValue::CreateStringValue(positions[std::clamp(settings.sampling.position,0,2)]));o.Insert(L"kernel",JsonValue::CreateStringValue(kernels[std::clamp(settings.sampling.kernel,0,3)]));
 JsonObject directions;const wchar_t* names[]={L"nw",L"n",L"ne",L"w",L"e",L"sw",L"s",L"se"};for(int i=0;i<8;++i)directions.Insert(names[i],JsonValue::CreateBooleanValue((settings.sampling.directions&(1u<<i))!=0));o.Insert(L"directions",directions);
 o.Insert(L"smartHue",JsonValue::CreateBooleanValue(settings.smartHue));o.Insert(L"smartHueDarkness",JsonValue::CreateNumberValue(settings.darkness));o.Insert(L"followOpacity",JsonValue::CreateBooleanValue(settings.followOpacity));o.Insert(L"previewEnabled",JsonValue::CreateBooleanValue(settings.previewEnabled));return o;
}
}
