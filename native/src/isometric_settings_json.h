#pragma once
#include "isometric_settings.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
namespace moon::iso {
inline Settings decodeSettings(const std::string& text){
 using namespace winrt::Windows::Data::Json;Settings s;
 try{
  const auto raw=JsonValue::Parse(winrt::to_hstring(text));if(raw.ValueType()!=JsonValueType::Object)return s;const auto o=raw.GetObject();
  auto value=[](const JsonObject& obj,const wchar_t* key)->IJsonValue{return obj.HasKey(key)?obj.GetNamedValue(key):nullptr;};
  auto number=[&](const wchar_t* key,double fallback){auto v=value(o,key);return v&&v.ValueType()==JsonValueType::Number&&std::isfinite(v.GetNumber())?v.GetNumber():fallback;};
  auto equal=[&](const wchar_t* key,bool expected){auto v=value(o,key);return v&&v.ValueType()==JsonValueType::Boolean&&v.GetBoolean()==expected;};
  auto style=value(o,L"guideLineStyle");s.pixel=style&&style.ValueType()==JsonValueType::String&&style.GetString()==L"pixel";
  auto color=[&](IJsonValue v)->std::optional<std::uint32_t>{
   if(!v||v.ValueType()!=JsonValueType::Object)return {};const auto c=v.GetObject();std::uint32_t out=0;const wchar_t* keys[]{L"r",L"g",L"b",L"a"};
   for(int i=0;i<4;++i){auto channel=value(c,keys[i]);if(!channel||channel.ValueType()!=JsonValueType::Number)return {};const auto n=channel.GetNumber();if(!std::isfinite(n)||n<0||n>255)return {};out|=std::uint32_t(detail::round(n))<<(8*i);}
   if((out&0xffffff)==0xff7929)out=(s.color()&0xffffff)|(out&0xff000000);return out;
  };
  const auto legacyColor=color(value(o,L"guideColor"));auto stored=value(o,L"guideColors");auto colors=stored&&stored.ValueType()==JsonValueType::Object?stored.GetObject():JsonObject{};
  s.solidColor=color(value(colors,L"solid")).value_or(!s.pixel&&legacyColor?*legacyColor:s.solidColor);
  s.pixelColor=color(value(colors,L"pixel")).value_or(s.pixel&&legacyColor?*legacyColor:s.pixelColor);
  s.stairStep=number(L"stairStep",2);s.originX=number(L"guideOriginX",0);s.originY=number(L"guideOriginY",0);s.unitSize=number(L"guideUnitSize",16);s.thickness=number(L"guideThickness",1);
  s.forceLineAlignment=!equal(L"forceLineAlignment",false);s.snapToGrid=equal(L"snapToGrid",true);return normalize(s);
 }catch(const winrt::hresult_error&){return {};}
}
inline std::string encodeSettings(Settings s){
 using namespace winrt::Windows::Data::Json;s=normalize(s);JsonObject o;
 auto number=[&](const wchar_t* key,double n){o.Insert(key,JsonValue::CreateNumberValue(n));};
 auto color=[](std::uint32_t p){JsonObject c;const wchar_t* keys[]{L"r",L"g",L"b",L"a"};for(int i=0;i<4;++i)c.Insert(keys[i],JsonValue::CreateNumberValue((p>>(8*i))&255));return c;};
 number(L"stairStep",s.stairStep);number(L"guideOriginX",s.originX);number(L"guideOriginY",s.originY);number(L"guideUnitSize",s.unitSize);number(L"guideThickness",s.thickness);
 o.Insert(L"guideLineStyle",JsonValue::CreateStringValue(s.pixel?L"pixel":L"solid"));o.Insert(L"forceLineAlignment",JsonValue::CreateBooleanValue(s.forceLineAlignment));o.Insert(L"snapToGrid",JsonValue::CreateBooleanValue(s.snapToGrid));
 JsonObject colors;colors.Insert(L"solid",color(s.solidColor));colors.Insert(L"pixel",color(s.pixelColor));o.Insert(L"guideColors",colors);return winrt::to_string(o.Stringify());
}
}
