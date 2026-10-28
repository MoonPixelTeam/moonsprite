#pragma once
#include "free_tile_data.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>

// Legacy types-tiles.ts / document-file-service resource metadata. Preserve
// unmodelled fields inside sources/instances while encoding canonical values.
namespace moon::project::freejson {
using namespace winrt::Windows::Data::Json;
inline bool has(JsonObject o,const wchar_t* k){return o.HasKey(k)&&o.GetNamedValue(k).ValueType()!=JsonValueType::Null;}
inline std::string text(JsonObject o,const wchar_t* k,const std::string& fallback={}){if(!has(o,k))return fallback;if(o.GetNamedValue(k).ValueType()!=JsonValueType::String)throw std::invalid_argument("Invalid free tile string");return winrt::to_string(o.GetNamedString(k));}
inline void text(JsonObject o,const wchar_t* k,const std::string& s,bool){o.Insert(k,JsonValue::CreateStringValue(winrt::to_hstring(s)));}
inline bool flag(JsonObject o,const wchar_t* k,bool fallback){if(!has(o,k))return fallback;if(o.GetNamedValue(k).ValueType()!=JsonValueType::Boolean)throw std::invalid_argument("Invalid free tile flag");return o.GetNamedBoolean(k);}
inline double number(JsonObject o,const wchar_t* k,double fallback,double lo,double hi){if(!has(o,k))return fallback;if(o.GetNamedValue(k).ValueType()!=JsonValueType::Number)throw std::invalid_argument("Invalid free tile number");const auto n=o.GetNamedNumber(k);if(!std::isfinite(n)||n<lo||n>hi)throw std::invalid_argument("Invalid free tile number range");return n;}
inline int integer(JsonObject o,const wchar_t* k,int fallback,int lo=-free_tiles::MaxCoordinate,int hi=free_tiles::MaxCoordinate){const auto n=number(o,k,fallback,lo,hi);if(std::floor(n)!=n)throw std::invalid_argument("Invalid free tile integer");return int(n);}
inline void number(JsonObject o,const wchar_t* k,double n){o.Insert(k,JsonValue::CreateNumberValue(n));}
inline void flag(JsonObject o,const wchar_t* k,bool v,bool){o.Insert(k,JsonValue::CreateBooleanValue(v));}
inline JsonObject preserved(const std::string& s){return s.empty()?JsonObject{}:JsonObject::Parse(winrt::to_hstring(s));}
inline free_tiles::LayerData decodeLayer(JsonObject o,const std::string& id){
 free_tiles::LayerData layer;layer.setId=text(o,L"freeTileSetId",id);layer.legacyTilesetId=text(o,L"freeTileTilesetId");
 if(has(o,L"freeTileSources"))for(const auto& item:o.GetNamedArray(L"freeTileSources")){
  auto v=item.GetObject();free_tiles::Source s;s.id=text(v,L"id");s.name=text(v,L"name");s.tilesetId=text(v,L"tilesetId");s.description=text(v,L"description");s.visible=flag(v,L"visible",true);s.locked=flag(v,L"locked",false);s.opacity=number(v,L"opacity",1,0,1);s.blendMode=text(v,L"blendMode","normal");s.offsetX=integer(v,L"offsetX",0);s.offsetY=integer(v,L"offsetY",0);s.preservedJson=winrt::to_string(v.Stringify());
  if(has(v,L"displayColor")){auto c=v.GetNamedObject(L"displayColor");std::uint32_t p=0;const wchar_t* keys[]={L"r",L"g",L"b",L"a"};for(int i=0;i<4;++i)p|=std::uint32_t(integer(c,keys[i],i==3?255:0,0,255))<<(i*8);s.displayColor=p;}
  free_tiles::validateSource(s);layer.sources.push_back(std::move(s));
 }
 return layer;
}
inline free_tiles::CelData decodeCel(JsonObject o){
 free_tiles::CelData cel;cel.preservedJson=winrt::to_string(o.Stringify());auto array=o.GetNamedArray(L"instances");if(array.Size()>free_tiles::MaxInstances)throw std::length_error("Too many free tile instances");
 for(const auto& item:array){auto v=item.GetObject();free_tiles::Instance i;i.id=text(v,L"id");i.sourceId=text(v,L"sourceId");i.tileId=text(v,L"tileId");if(!has(v,L"x")||!has(v,L"y"))throw std::invalid_argument("Missing free tile position");i.x=integer(v,L"x",0);i.y=integer(v,L"y",0);i.rotation=integer(v,L"rotation",0,0,3);i.visible=flag(v,L"visible",true);i.locked=flag(v,L"locked",false);i.flipHorizontal=flag(v,L"flipHorizontal",false);i.flipVertical=flag(v,L"flipVertical",false);if(has(v,L"opacity"))i.opacity=number(v,L"opacity",1,0,1);if(has(v,L"blendMode"))i.blendMode=text(v,L"blendMode");i.preservedJson=winrt::to_string(v.Stringify());cel.instances.push_back(std::move(i));}
 return cel;
}
inline void encodeLayer(JsonObject o,const free_tiles::LayerData& layer){
 text(o,L"freeTileSetId",layer.setId,true);if(layer.legacyTilesetId.empty())o.Remove(L"freeTileTilesetId");else text(o,L"freeTileTilesetId",layer.legacyTilesetId,true);JsonArray sources;
 for(const auto& s:layer.sources){auto v=preserved(s.preservedJson);text(v,L"id",s.id,true);text(v,L"name",s.name,true);text(v,L"tilesetId",s.tilesetId,true);if(s.description.empty())v.Remove(L"description");else text(v,L"description",s.description,true);flag(v,L"visible",s.visible,true);flag(v,L"locked",s.locked,true);number(v,L"opacity",s.opacity);text(v,L"blendMode",s.blendMode,true);number(v,L"offsetX",s.offsetX);number(v,L"offsetY",s.offsetY);if(s.displayColor){JsonObject c;const wchar_t* keys[]={L"r",L"g",L"b",L"a"};for(int i=0;i<4;++i)number(c,keys[i],(*s.displayColor>>(8*i))&255);v.Insert(L"displayColor",c);}else v.Remove(L"displayColor");sources.Append(v);}o.Insert(L"freeTileSources",sources);
}
inline JsonObject encodeCel(const free_tiles::CelData& cel){
 auto o=preserved(cel.preservedJson);JsonArray instances;
 for(const auto& i:cel.instances){auto v=preserved(i.preservedJson);text(v,L"id",i.id,true);if(i.sourceId.empty())v.Remove(L"sourceId");else text(v,L"sourceId",i.sourceId,true);if(i.tileId.empty())v.Remove(L"tileId");else text(v,L"tileId",i.tileId,true);number(v,L"x",i.x);number(v,L"y",i.y);number(v,L"rotation",i.rotation);flag(v,L"visible",i.visible,true);flag(v,L"locked",i.locked,true);flag(v,L"flipHorizontal",i.flipHorizontal,true);flag(v,L"flipVertical",i.flipVertical,true);if(i.opacity)number(v,L"opacity",*i.opacity);else v.Remove(L"opacity");if(i.blendMode)text(v,L"blendMode",*i.blendMode,true);else v.Remove(L"blendMode");instances.Append(v);}o.Insert(L"instances",instances);return o;
}
}
