#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include "lua_script_result.h"
#include <cmath>
#include <charconv>
#include <unordered_set>
namespace moon::script {
namespace {
using namespace winrt::Windows::Data::Json;
[[noreturn]]void invalid(){throw std::invalid_argument("Invalid Lua script result");}
double integer(double v){if(!std::isfinite(v)||std::floor(v)!=v||std::abs(v)>9007199254740991.)invalid();return v;}
Pixel packed(double v){v=std::fmod(integer(v),4294967296.);if(v<0)v+=4294967296.;return Pixel(v);}
int coordinate(double v){v=integer(v);if(v<INT_MIN||v>INT_MAX)throw std::length_error("Lua result coordinate exceeds native integer range");return int(v);}
bool blank(const winrt::hstring& s){return std::all_of(s.begin(),s.end(),[](wchar_t c){return c==0x9||c==0xa||c==0xb||c==0xc||c==0xd||c==0x20||c==0xa0||c==0x1680||(c>=0x2000&&c<=0x200a)||c==0x2028||c==0x2029||c==0x202f||c==0x205f||c==0x3000||c==0xfeff;});}
SurfaceSnapshot surface(const JsonObject& obj,const winrt::hstring& format){
 const auto w=integer(obj.GetNamedNumber(L"width")),h=integer(obj.GetNamedNumber(L"height"));
 if(obj.GetNamedString(L"format")!=format||w<1||h<1||w*h>InvocationCapture::maxImagePixels)invalid();
 const auto pixels=obj.GetNamedArray(L"pixels");if(double(pixels.Size())!=w*h)invalid();
 auto values=std::make_shared<std::vector<Pixel>>();values->reserve(pixels.Size());
 SurfaceSnapshot result{int(w),int(h),coordinate(obj.GetNamedNumber(L"offsetX")),coordinate(obj.GetNamedNumber(L"offsetY")),values};
 for(const auto& value:pixels)values->push_back(packed(value.GetNumber()));return result;
}
bool equal(const SurfaceSnapshot& a,const SurfaceSnapshot& b){return a.width==b.width&&a.height==b.height&&a.x==b.x&&a.y==b.y&&*a.pixels==*b.pixels;}
void layers(const JsonArray& list,const winrt::hstring& format){
 std::unordered_set<std::wstring> ids;
 for(const auto& item:list){const auto l=item.GetObject();auto id=l.GetNamedString(L"id");if(blank(id)||!ids.emplace(id.c_str(),id.size()).second||blank(l.GetNamedString(L"name")))invalid();
  const auto opacity=integer(l.GetNamedNumber(L"opacity")),frame=l.GetNamedNumber(L"frameNumber");if(opacity<0||opacity>255||!std::isfinite(frame)||std::floor(frame)!=frame||frame<1)invalid();
  if(l.HasKey(L"stackIndex")&&integer(l.GetNamedNumber(L"stackIndex"))<1)invalid();
  (void)surface(l.GetNamedObject(L"surface"),format);
 }
}
const std::unordered_set<std::wstring> paths={
 L"document.create",L"document.open",L"document.save",L"layers.create",L"layers.duplicate",L"layers.remove",L"layers.update",
 L"animation.setFrame",L"animation.setFrameDuration",L"animation.setCelSurface",L"animation.createLoop",L"animation.updateLoop",L"animation.removeLoop",L"animation.play",
 L"palette.create",L"palette.update",L"palette.remove",L"palette.extract",L"tiles.createSet",L"tiles.createLayer",L"tiles.place",L"tiles.edit",
 L"freeTiles.createSource",L"freeTiles.createLayer",L"freeTiles.place",L"freeTiles.edit",L"brushes.importImage",L"brushes.createFromSelection",L"brushes.remove",
 L"selection.set",L"selection.clear",L"selection.invert",L"selection.transform",L"slices.create",L"slices.update",L"slices.remove",
 L"styles.apply",L"styles.copy",L"styles.paste",L"styles.clear",L"styles.setEnabled",L"workspace.setPanel",L"workspace.showPanel",L"workspace.hidePanel",L"io.export",L"io.save",L"io.open",L"ui.notify"};
// Same native ECMAScript number-length adaptation as local_history_diff.cpp
// scalarLength, from legacy local-history JSON/string primitive accounting.
std::size_t numberUnits(double n){
 if(!std::isfinite(n))return 4;if(n==0)return 1;
 char buffer[64];const auto encoded=std::to_chars(buffer,buffer+64,std::abs(n),std::chars_format::general);if(encoded.ec!=std::errc())invalid();
 std::string raw(buffer,encoded.ptr);const auto e=raw.find('e');const int exponent=e==std::string::npos?0:std::stoi(raw.substr(e+1));const auto mantissa=raw.substr(0,e);const auto dot=mantissa.find('.');std::string digits=mantissa;if(dot!=std::string::npos)digits.erase(dot,1);
 int decimal=int(dot==std::string::npos?mantissa.size():dot)+exponent;while(digits.size()>1&&digits.front()=='0'){digits.erase(digits.begin());--decimal;}while(digits.size()>1&&digits.back()=='0')digits.pop_back();
 const std::size_t sign=n<0?1:0;if(std::abs(n)>=1e-6&&std::abs(n)<1e21){if(decimal<=0)return sign+2+std::size_t(-decimal)+digits.size();if(decimal>=int(digits.size()))return sign+std::size_t(decimal);return sign+digits.size()+1;}
 return sign+digits.size()+(digits.size()>1?1:0)+2+std::to_string(std::abs(decimal-1)).size();
}
// JSON.stringify counts UTF16 units, not UTF8 bytes. Encode JSON strings with
// ECMAScript escapes (WinRT Stringify may escape additional characters).
std::size_t jsonUnits(const IJsonValue& value){
 switch(value.ValueType()){
 case JsonValueType::Null:return 4;
 case JsonValueType::Boolean:return value.GetBoolean()?4:5;
 case JsonValueType::Number:return numberUnits(value.GetNumber());
 case JsonValueType::String:{std::size_t n=2;const auto s=value.GetString();for(std::size_t i=0;i<s.size();++i){const auto c=s[i];if(c=='"'||c=='\\'||c=='\b'||c=='\f'||c=='\n'||c=='\r'||c=='\t')n+=2;else if(c<0x20)n+=6;else if(c>=0xd800&&c<=0xdbff&&i+1<s.size()&&s[i+1]>=0xdc00&&s[i+1]<=0xdfff){n+=2;++i;}else if(c>=0xd800&&c<=0xdfff)n+=6;else ++n;}return n;}
 case JsonValueType::Array:{std::size_t n=2;bool comma=false;for(const auto& item:value.GetArray()){n+=comma?1:0;comma=true;n+=jsonUnits(item);}return n;}
 case JsonValueType::Object:{std::size_t n=2;bool comma=false;for(const auto& pair:value.GetObject()){n+=comma?1:0;comma=true;n+=jsonUnits(JsonValue::CreateStringValue(pair.Key()))+1+jsonUnits(pair.Value());}return n;}
 default:invalid();
 }
}
}
SurfaceSnapshot validateResult(const Target& target,const std::string& json){
 if(!target.expected.pixels||target.expected.width<1||target.expected.height<1||std::uint64_t(target.expected.width)*target.expected.height!=target.expected.pixels->size()||target.expected.pixels->size()>InvocationCapture::maxImagePixels)invalid();
 const auto result=JsonObject::Parse(winrt::to_hstring(json));auto expected=target.expected;std::shared_ptr<std::vector<Pixel>> working;
 for(const auto& item:result.GetNamedArray(L"batches")){const auto batch=item.GetObject();std::size_t bytes=0;
  if(batch.HasKey(L"operations"))for(const auto& entry:batch.GetNamedArray(L"operations")){const auto op=entry.GetObject();const auto path=op.GetNamedString(L"path");if(!paths.count(std::wstring(path)))invalid();bytes+=jsonUnits(op.GetNamedValue(L"arguments"));if(bytes>16*1024*1024)invalid();}
  const auto changes=batch.GetNamedArray(L"changes");
  if(batch.HasKey(L"surfaceChange")&&batch.GetNamedValue(L"surfaceChange").ValueType()!=JsonValueType::Null){
   if(changes.Size())invalid();const auto change=batch.GetNamedObject(L"surfaceChange");const auto before=surface(change.GetNamedObject(L"before"),L"rgba");if(!equal(before,expected))invalid();expected=surface(change.GetNamedObject(L"after"),L"rgba");working.reset();continue;
  }
  std::unordered_set<std::size_t> indices;
  for(const auto& entry:changes){const auto change=entry.GetObject();const auto index=integer(change.GetNamedNumber(L"index"));if(index<0||index>=expected.pixels->size()||!indices.insert(std::size_t(index)).second)invalid();const auto before=packed(change.GetNamedNumber(L"before")),after=packed(change.GetNamedNumber(L"after"));if((*expected.pixels)[std::size_t(index)]!=before)invalid();
   if(!working){working=std::make_shared<std::vector<Pixel>>(*expected.pixels);expected.pixels=working;}(*working)[std::size_t(index)]=after;
  }
 }
 layers(result.GetNamedArray(L"createdLayers"),L"rgba");
 for(const auto& item:result.GetNamedArray(L"createdDocuments")){const auto doc=item.GetObject();const auto w=integer(doc.GetNamedNumber(L"width")),h=integer(doc.GetNamedNumber(L"height"));const auto mode=doc.GetNamedString(L"colorMode");const auto list=doc.GetNamedArray(L"layers");if(blank(doc.GetNamedString(L"name"))||w<1||h<1||w*h>InvocationCapture::maxImagePixels||(mode!=L"rgba"&&mode!=L"indexed"&&mode!=L"grayscale")||!list.Size())invalid();layers(list,mode==L"indexed"?L"indexed":L"rgba");}
 return expected;
}
}
