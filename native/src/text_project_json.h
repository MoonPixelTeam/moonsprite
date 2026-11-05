#pragma once
#include <climits>
#include <limits>
#include <codecvt>
#include <locale>
#include "text_cel_data.h"
#include "legacy_json_number.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
namespace moon::project {
namespace textjson {
using namespace winrt::Windows::Data::Json;
inline std::vector<winrt::hstring> orderedObjectKeys(const winrt::Windows::Data::Json::JsonObject& object){
 // WinRT's map iterator order differs from the parsed JSON's property order.
 // Stringify retains that parsed order. Read only top-level key boundaries
 // from this already validated JSON; WinRT still decodes keys and all values.
 using namespace winrt::Windows::Data::Json;const auto encoded=object.Stringify();std::vector<winrt::hstring> keys;std::size_t i=1;
 const auto whitespace=[&]{while(i<encoded.size()&&(encoded[i]==L' '||encoded[i]==L'\t'||encoded[i]==L'\r'||encoded[i]==L'\n'))++i;};
 while(i<encoded.size()){
  whitespace();if(encoded[i]==L'}')break;if(encoded[i]!=L'"')throw std::invalid_argument("Invalid text rectangle JSON key");const auto start=i++;
  while(i<encoded.size()){if(encoded[i]==L'\\'){i+=2;continue;}if(encoded[i++]==L'"')break;}
  keys.push_back(JsonValue::Parse(winrt::hstring(encoded.data()+start,std::uint32_t(i-start))).GetString());whitespace();if(i>=encoded.size()||encoded[i++]!=L':')throw std::invalid_argument("Invalid text rectangle JSON field");
  std::size_t depth=0;bool quoted=false;
  for(;i<encoded.size();++i){const auto c=encoded[i];if(quoted){if(c==L'\\')++i;else if(c==L'"')quoted=false;continue;}if(c==L'"'){quoted=true;continue;}if(c==L'{'||c==L'['){++depth;continue;}if(c==L'}'||c==L']'){if(!depth)break;--depth;continue;}if(c==L','&&!depth)break;}
  if(i>=encoded.size()||encoded[i]==L'}')break;++i;
 }
 // JavaScript enumerates canonical array indices before insertion-order keys.
 const auto index=[](const winrt::hstring& key){std::uint64_t n=0;if(key.empty()||(key.size()>1&&key[0]==L'0'))return UINT64_MAX;for(const auto c:key){if(c<L'0'||c>L'9'||n>=4294967295ULL)return UINT64_MAX;n=n*10+(c-L'0');}return n<4294967295ULL?n:UINT64_MAX;};
 std::stable_sort(keys.begin(),keys.end(),[&](const auto& a,const auto& b){return index(a)<index(b);});return keys;
}
inline bool has(const JsonObject& o,const wchar_t* k){return o.HasKey(k)&&o.GetNamedValue(k).ValueType()!=JsonValueType::Null;}
inline double num(const JsonObject& o,const wchar_t* k,double fallback){if(!has(o,k))return fallback;const auto v=o.GetNamedValue(k);return v.ValueType()==JsonValueType::Number&&std::isfinite(v.GetNumber())?v.GetNumber():fallback;}
inline bool finite(const JsonObject& o,const wchar_t* k){return o.HasKey(k)&&o.GetNamedValue(k).ValueType()==JsonValueType::Number&&std::isfinite(o.GetNamedNumber(k));}
inline double coerced(const JsonObject& o,const wchar_t* k,double fallback){const auto n=o.HasKey(k)?legacyjson::number(o.GetNamedValue(k)):legacyjson::nan();return std::isfinite(n)?n:fallback;}
inline JsonObject object(const JsonObject& o,const wchar_t* k){return has(o,k)&&o.GetNamedValue(k).ValueType()==JsonValueType::Object?o.GetNamedObject(k):JsonObject{};}
inline bool truthy(const JsonObject& o,const wchar_t* k){if(!has(o,k))return false;const auto v=o.GetNamedValue(k);if(v.ValueType()==JsonValueType::Boolean)return v.GetBoolean();if(v.ValueType()==JsonValueType::Number)return v.GetNumber()!=0;if(v.ValueType()==JsonValueType::String)return !v.GetString().empty();return true;}
// Native fontFamily uses WTF8 because JS slice(0,128) can leave a lone
// surrogate. WinRT's ordinary UTF8 conversions replace that code unit.
inline std::string fontBytes(const winrt::hstring& value){return std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.to_bytes(textUtf32(std::u16string(reinterpret_cast<const char16_t*>(value.data()),value.size())));}
inline winrt::hstring fontUnits(const std::string& value){const auto units=textUtf16(std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.from_bytes(value));return winrt::hstring(reinterpret_cast<const wchar_t*>(units.data()),std::uint32_t(units.size()));}
inline std::string str(const JsonObject& o,const wchar_t* k,const std::string& fallback={}){return has(o,k)&&o.GetNamedValue(k).ValueType()==JsonValueType::String?winrt::to_string(o.GetNamedString(k)):fallback;}
inline int integer(double n,int lo,int hi){return int(std::clamp(std::floor(n+.5),double(lo),double(hi)));}
inline std::uint32_t color(const JsonObject& o,std::uint32_t fallback=0xff000000){const wchar_t* keys[]{L"r",L"g",L"b",L"a"};std::uint32_t result=0;for(int i=0;i<4;++i)result|=std::uint32_t(integer(coerced(o,keys[i],(fallback>>(8*i))&255),0,255))<<(8*i);return result;}
inline JsonObject color(std::uint32_t value){JsonObject o;const wchar_t* keys[]{L"r",L"g",L"b",L"a"};for(int i=0;i<4;++i)o.Insert(keys[i],JsonValue::CreateNumberValue((value>>(8*i))&255));return o;}
inline TextRect rect(const JsonObject& o){const auto invalid=std::numeric_limits<double>::quiet_NaN();TextRect r{num(o,L"x",invalid),num(o,L"y",invalid),num(o,L"width",invalid),num(o,L"height",invalid)};for(const auto& field:o)if(field.Key()!=L"x"&&field.Key()!=L"y"&&field.Key()!=L"width"&&field.Key()!=L"height"){const auto json=o.Stringify();r.projectProperties.assign(reinterpret_cast<const char16_t*>(json.data()),json.size());break;}return r;}
inline JsonObject rect(const TextRect& r){JsonObject o=r.projectProperties.empty()?JsonObject{}:JsonObject::Parse(winrt::hstring(reinterpret_cast<const wchar_t*>(r.projectProperties.data()),std::uint32_t(r.projectProperties.size())));o.Insert(L"x",JsonValue::CreateNumberValue(r.x));o.Insert(L"y",JsonValue::CreateNumberValue(r.y));o.Insert(L"width",JsonValue::CreateNumberValue(r.width));o.Insert(L"height",JsonValue::CreateNumberValue(r.height));return o;}
}
inline TextCelData decodeTextCel(const winrt::Windows::Data::Json::JsonObject& o){
 using namespace textjson;TextCelData d;
 if(has(o,L"text")&&o.GetNamedValue(L"text").ValueType()==JsonValueType::String){const auto t=o.GetNamedString(L"text");d.text.assign(reinterpret_cast<const char16_t*>(t.data()),t.size());}
 if(has(o,L"fontFamily")&&o.GetNamedValue(L"fontFamily").ValueType()==JsonValueType::String)d.fontFamily=fontBytes(o.GetNamedString(L"fontFamily"));
 d.fontSize=integer(coerced(o,L"fontSize",10),1,512);d.lineSpacing=integer(coerced(o,L"lineSpacing",0),-256,512);d.letterSpacing=integer(coerced(o,L"letterSpacing",0),-64,256);
 d.actualSpacing=str(o,L"spacingMode")=="actual";d.smooth=str(o,L"antialias")=="smooth";const auto mode=str(o,L"layoutMode");d.boxed=mode=="box"||(mode!="free"&&finite(o,L"boxWidth")&&finite(o,L"boxHeight"));d.boxWidth=integer(num(o,L"boxWidth",128),1,16384);d.boxHeight=integer(num(o,L"boxHeight",64),1,16384);
 const auto align=str(o,L"textAlign");d.align=align=="right"?TextCelData::Align::Right:align=="center"?TextCelData::Align::Center:TextCelData::Align::Left;d.color=color(object(o,L"color"));
 if(finite(o,L"originX"))d.originX=int(std::clamp(std::trunc(num(o,L"originX",0)),double(INT_MIN),double(INT_MAX)));if(finite(o,L"originY"))d.originY=int(std::clamp(std::trunc(num(o,L"originY",0)),double(INT_MIN),double(INT_MAX)));
 if(has(o,L"styleRuns")&&o.GetNamedValue(L"styleRuns").ValueType()==JsonValueType::Array)for(const auto& value:o.GetNamedArray(L"styleRuns")){
  if(value.ValueType()!=JsonValueType::Object)continue;const auto r=value.GetObject();TextStyleRun run;run.start=int(std::clamp(std::trunc(coerced(r,L"start",0)),0.,double(INT_MAX)));run.end=int(std::clamp(std::trunc(coerced(r,L"end",run.start)),double(run.start),double(INT_MAX)));
  if(finite(r,L"fontSize"))run.fontSize=integer(num(r,L"fontSize",10),1,512);if(finite(r,L"lineSpacing"))run.lineSpacing=integer(num(r,L"lineSpacing",0),-256,512);if(finite(r,L"letterSpacing"))run.letterSpacing=integer(num(r,L"letterSpacing",0),-64,256);if(truthy(r,L"color"))run.color=color(object(r,L"color"));d.styleRuns.push_back(run);
 }
 if(has(o,L"transforms")&&o.GetNamedValue(L"transforms").ValueType()==JsonValueType::Array)for(const auto& value:o.GetNamedArray(L"transforms")){
  if(value.ValueType()!=JsonValueType::Object)continue;const auto t=value.GetObject();TextTransform transform{rect(object(t,L"source")),rect(object(t,L"target")),coerced(t,L"angle",0),{}};
  const auto shear=object(t,L"shear");const auto axis=str(shear,L"axis"),edge=str(shear,L"edge");if((axis=="x"||axis=="y")&&edge.size()==1&&std::string("nesw").find(edge[0])!=std::string::npos&&finite(shear,L"amount"))transform.shear=TextShear{axis[0],edge[0],num(shear,L"amount",0)};d.transforms.push_back(transform);
 }
 return normalizeTextCelData(std::move(d));
}
inline winrt::Windows::Data::Json::JsonObject encodeTextCel(const TextCelData& raw){using namespace textjson;const auto d=normalizeTextCelData(raw);JsonObject o;auto n=[&](const wchar_t* k,double v){o.Insert(k,JsonValue::CreateNumberValue(v));};auto s=[&](const wchar_t* k,const std::string& v){o.Insert(k,JsonValue::CreateStringValue(fontUnits(v)));};o.Insert(L"text",JsonValue::CreateStringValue(winrt::hstring(reinterpret_cast<const wchar_t*>(d.text.data()),std::uint32_t(d.text.size()))));s(L"fontFamily",d.fontFamily);n(L"fontSize",d.fontSize);n(L"lineSpacing",d.lineSpacing);n(L"letterSpacing",d.letterSpacing);s(L"spacingMode",d.actualSpacing?"actual":"font");s(L"antialias",d.smooth?"smooth":"pixel");s(L"layoutMode",d.boxed?"box":"free");s(L"textAlign",d.align==TextCelData::Align::Right?"right":d.align==TextCelData::Align::Center?"center":"left");o.Insert(L"color",color(d.color));if(d.originX)n(L"originX",*d.originX);if(d.originY)n(L"originY",*d.originY);if(d.boxed){n(L"boxWidth",d.boxWidth);n(L"boxHeight",d.boxHeight);}JsonArray runs;for(auto r:d.styleRuns){JsonObject v;v.Insert(L"start",JsonValue::CreateNumberValue(r.start));v.Insert(L"end",JsonValue::CreateNumberValue(r.end));if(r.fontSize)v.Insert(L"fontSize",JsonValue::CreateNumberValue(*r.fontSize));if(r.lineSpacing)v.Insert(L"lineSpacing",JsonValue::CreateNumberValue(*r.lineSpacing));if(r.letterSpacing)v.Insert(L"letterSpacing",JsonValue::CreateNumberValue(*r.letterSpacing));if(r.color)v.Insert(L"color",color(*r.color));runs.Append(v);}if(runs.Size())o.Insert(L"styleRuns",runs);JsonArray transforms;for(auto t:d.transforms){JsonObject v;v.Insert(L"source",rect(t.source));v.Insert(L"target",rect(t.target));v.Insert(L"angle",JsonValue::CreateNumberValue(t.angle));if(t.shear){JsonObject sh;sh.Insert(L"axis",JsonValue::CreateStringValue(winrt::to_hstring(std::string(1,t.shear->axis))));sh.Insert(L"edge",JsonValue::CreateStringValue(winrt::to_hstring(std::string(1,t.shear->edge))));sh.Insert(L"amount",JsonValue::CreateNumberValue(t.shear->amount));v.Insert(L"shear",sh);}transforms.Append(v);}if(transforms.Size())o.Insert(L"transforms",transforms);return o;}
}
