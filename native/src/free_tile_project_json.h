#pragma once
#include "free_tile_data.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>

// Legacy manifest/source and free-tile cel normalizers construct known-field
// objects on import; unknown archive fields must not survive normalization.
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
// normalizeManifestFreeTileSources uses actual JSON types, not Number coercion.
inline std::string sourceText(JsonObject o,const wchar_t* key){return o.HasKey(key)&&o.GetNamedValue(key).ValueType()==JsonValueType::String?winrt::to_string(o.GetNamedString(key)):std::string{};}
inline bool sourceFlag(JsonObject o,const wchar_t* key,bool fallback){if(!o.HasKey(key)||o.GetNamedValue(key).ValueType()!=JsonValueType::Boolean)return fallback;return o.GetNamedBoolean(key);}
inline double sourceOpacity(JsonObject o){if(!o.HasKey(L"opacity")||o.GetNamedValue(L"opacity").ValueType()!=JsonValueType::Number)return 1;const auto n=o.GetNamedNumber(L"opacity");return std::isfinite(n)?std::clamp(n,0.,1.):1.;}
inline int sourceOffset(JsonObject o,const wchar_t* key){if(!o.HasKey(key)||o.GetNamedValue(key).ValueType()!=JsonValueType::Number)return 0;const auto n=o.GetNamedNumber(key);if(!std::isfinite(n)||std::floor(n)!=n||std::abs(n)>9007199254740991.)return 0;if(std::abs(n)>free_tiles::MaxCoordinate)throw std::invalid_argument("Free tile source offset exceeds native range");return int(n);}
inline std::optional<std::uint32_t> sourceDisplayColor(JsonObject o){
 if(!o.HasKey(L"displayColor")||o.GetNamedValue(L"displayColor").ValueType()!=JsonValueType::Object)return {};const auto color=o.GetNamedObject(L"displayColor");std::uint32_t result=0;int shift=0;
 for(const auto* key:{L"r",L"g",L"b",L"a"}){if(!color.HasKey(key)||color.GetNamedValue(key).ValueType()!=JsonValueType::Number)return {};const auto n=color.GetNamedNumber(key);if(!std::isfinite(n))return {};result|=std::uint32_t(std::floor(std::clamp(n,0.,255.)+.5))<<shift;shift+=8;}return result;
}
inline free_tiles::LayerData decodeLayer(JsonObject o,const std::string& id,bool modernSources=false){
 // schema21 decodeProject requires explicit modern collection metadata. The
 // standalone/native compatibility reader retains its separate default mode.
 // localization.ts defaults to zh-CN; native language switching is not wired yet.
 if(modernSources&&(!o.HasKey(L"freeTileSetId")||o.GetNamedValue(L"freeTileSetId").ValueType()!=JsonValueType::String||o.GetNamedString(L"freeTileSetId").empty()||!o.HasKey(L"freeTileSources")||o.GetNamedValue(L"freeTileSources").ValueType()!=JsonValueType::Array||!o.GetNamedArray(L"freeTileSources").Size()))throw std::invalid_argument("Missing modern free tile collection metadata");
 free_tiles::LayerData layer;layer.setId=text(o,L"freeTileSetId",id);layer.legacyTilesetId=text(o,L"freeTileTilesetId");
 if(has(o,L"freeTileSources"))for(const auto& item:o.GetNamedArray(L"freeTileSources")){
  auto v=item.GetObject();free_tiles::Source s;s.id=text(v,L"id");s.name=sourceText(v,L"name");if(s.name.empty())s.name=winrt::to_string(L"\u56fe\u5c42");s.tilesetId=text(v,L"tilesetId");s.description=sourceText(v,L"description");s.visible=sourceFlag(v,L"visible",true);s.locked=sourceFlag(v,L"locked",false);s.opacity=sourceOpacity(v);s.blendMode=sourceText(v,L"blendMode");if(!parseLayerBlendMode(s.blendMode))s.blendMode="normal";s.offsetX=sourceOffset(v,L"offsetX");s.offsetY=sourceOffset(v,L"offsetY");
  s.displayColor=sourceDisplayColor(v);
  free_tiles::validateSource(s);layer.sources.push_back(std::move(s));
 }
 return layer;
}
inline free_tiles::CelData decodeCel(JsonObject o,bool modernSources=false){
 free_tiles::CelData cel;auto array=o.GetNamedArray(L"instances");if(array.Size()>free_tiles::MaxInstances)throw std::length_error("Too many free tile instances");
 for(const auto& item:array){auto v=item.GetObject();
  // decodeManifestFreeTiles rejects ANY string tileId for source collections,
  // even an empty string. Nonstring compatibility values are ignored.
  if(modernSources&&(!v.HasKey(L"sourceId")||v.GetNamedValue(L"sourceId").ValueType()!=JsonValueType::String||v.GetNamedString(L"sourceId").empty()||(v.HasKey(L"tileId")&&v.GetNamedValue(L"tileId").ValueType()==JsonValueType::String)))throw std::invalid_argument("Invalid modern free tile source reference");
  // strict normalizeFreeTileCelData distinguishes absent properties from null.
  for(const auto* key:{L"visible",L"locked",L"flipHorizontal",L"flipVertical"})if(v.HasKey(key)&&v.GetNamedValue(key).ValueType()!=JsonValueType::Boolean)throw std::invalid_argument("Invalid free tile instance flag");
  for(const auto* key:{L"rotation",L"opacity"})if(v.HasKey(key)&&v.GetNamedValue(key).ValueType()!=JsonValueType::Number)throw std::invalid_argument("Invalid free tile instance number");
  if(v.HasKey(L"blendMode")&&(v.GetNamedValue(L"blendMode").ValueType()!=JsonValueType::String||!parseLayerBlendMode(winrt::to_string(v.GetNamedString(L"blendMode")))))throw std::invalid_argument("Invalid free tile instance blend");
  free_tiles::Instance i;i.id=text(v,L"id");i.sourceId=text(v,L"sourceId");i.tileId=modernSources?std::string{}:text(v,L"tileId");if(!has(v,L"x")||!has(v,L"y"))throw std::invalid_argument("Missing free tile position");i.x=integer(v,L"x",0);i.y=integer(v,L"y",0);i.rotation=integer(v,L"rotation",0,0,3);i.visible=flag(v,L"visible",true);i.locked=flag(v,L"locked",false);i.flipHorizontal=flag(v,L"flipHorizontal",false);i.flipVertical=flag(v,L"flipVertical",false);if(has(v,L"opacity"))i.opacity=number(v,L"opacity",1,0,1);if(has(v,L"blendMode"))i.blendMode=text(v,L"blendMode");cel.instances.push_back(std::move(i));}
 return cel;
}
inline void encodeLayer(JsonObject o,const free_tiles::LayerData& layer){
 text(o,L"freeTileSetId",layer.setId,true);if(layer.legacyTilesetId.empty())o.Remove(L"freeTileTilesetId");else text(o,L"freeTileTilesetId",layer.legacyTilesetId,true);JsonArray sources;
 for(const auto& s:layer.sources){auto v=preserved(s.preservedJson);text(v,L"id",s.id,true);text(v,L"name",s.name,true);text(v,L"tilesetId",s.tilesetId,true);if(s.description.empty())v.Remove(L"description");else text(v,L"description",s.description,true);flag(v,L"visible",s.visible,true);flag(v,L"locked",s.locked,true);number(v,L"opacity",s.opacity);text(v,L"blendMode",s.blendMode,true);number(v,L"offsetX",s.offsetX);number(v,L"offsetY",s.offsetY);if(s.displayColor){JsonObject c;const wchar_t* keys[]={L"r",L"g",L"b",L"a"};for(int i=0;i<4;++i)number(c,keys[i],(*s.displayColor>>(8*i))&255);v.Insert(L"displayColor",c);}else v.Remove(L"displayColor");sources.Append(v);}o.Insert(L"freeTileSources",sources);
}
inline JsonObject encodeCel(const free_tiles::CelData& cel){
 JsonObject o;JsonArray instances;
 for(const auto& i:cel.instances){auto v=preserved(i.preservedJson);text(v,L"id",i.id,true);if(i.sourceId.empty())v.Remove(L"sourceId");else text(v,L"sourceId",i.sourceId,true);if(i.tileId.empty())v.Remove(L"tileId");else text(v,L"tileId",i.tileId,true);number(v,L"x",i.x);number(v,L"y",i.y);if(i.rotation)number(v,L"rotation",i.rotation);else v.Remove(L"rotation");flag(v,L"visible",i.visible,true);flag(v,L"locked",i.locked,true);if(i.flipHorizontal)flag(v,L"flipHorizontal",true,true);else v.Remove(L"flipHorizontal");if(i.flipVertical)flag(v,L"flipVertical",true,true);else v.Remove(L"flipVertical");if(i.opacity)number(v,L"opacity",*i.opacity);else v.Remove(L"opacity");if(i.blendMode)text(v,L"blendMode",*i.blendMode,true);else v.Remove(L"blendMode");instances.Append(v);}o.Insert(L"instances",instances);return o;
}
}
