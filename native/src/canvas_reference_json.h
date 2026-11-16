#pragma once
#include "canvas_references.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
namespace moon::project::referencejson {
using namespace winrt::Windows::Data::Json;
inline ReferencePlacement placement(const JsonObject& o){
 ReferencePlacement p;p.x=o.GetNamedNumber(L"x");p.y=o.GetNamedNumber(L"y");p.width=o.GetNamedNumber(L"width");p.height=o.GetNamedNumber(L"height");p.angle=o.GetNamedNumber(L"angle");p.flipX=o.GetNamedBoolean(L"flipX");p.flipY=o.GetNamedBoolean(L"flipY");if(o.HasKey(L"opacity"))p.opacity=o.GetNamedNumber(L"opacity");if(!validReferencePlacement(p))throw std::invalid_argument("Invalid canvas reference placement");return p;
}
inline void placement(JsonObject& o,const ReferencePlacement& p){
 o.Insert(L"x",JsonValue::CreateNumberValue(p.x));o.Insert(L"y",JsonValue::CreateNumberValue(p.y));o.Insert(L"width",JsonValue::CreateNumberValue(p.width));o.Insert(L"height",JsonValue::CreateNumberValue(p.height));o.Insert(L"angle",JsonValue::CreateNumberValue(p.angle));o.Insert(L"flipX",JsonValue::CreateBooleanValue(p.flipX));o.Insert(L"flipY",JsonValue::CreateBooleanValue(p.flipY));if(p.opacity)o.Insert(L"opacity",JsonValue::CreateNumberValue(*p.opacity));
}
inline JsonObject metadata(const CanvasReference& r){
 validateCanvasReference(r);JsonObject o;placement(o,r);o.Insert(L"id",JsonValue::CreateStringValue(winrt::to_hstring(r.id)));o.Insert(L"name",JsonValue::CreateStringValue(winrt::to_hstring(r.name)));o.Insert(L"locked",JsonValue::CreateBooleanValue(r.locked));if(r.floating)o.Insert(L"floating",JsonValue::CreateBooleanValue(*r.floating));if(r.initial){JsonObject initial;placement(initial,*r.initial);o.Insert(L"initial",initial);}return o;
}
template<class Read> CanvasReferences decode(const IJsonValue& values,Read read){
 CanvasReferences result;if(!values)return result;
 if(values.ValueType()!=JsonValueType::Array)throw std::invalid_argument("Invalid canvas references array");
 for(const auto& item:values.GetArray()){
  const auto o=item.GetObject();CanvasReference r;static_cast<ReferencePlacement&>(r)=placement(o);r.id=winrt::to_string(o.GetNamedString(L"id"));r.name=winrt::to_string(o.GetNamedString(L"name"));r.locked=o.GetNamedBoolean(L"locked");if(o.HasKey(L"floating"))r.floating=o.GetNamedBoolean(L"floating");if(o.HasKey(L"initial"))r.initial=placement(o.GetNamedObject(L"initial"));
  const auto file=winrt::to_string(o.GetNamedString(L"dataFile"));if(file!="references/canvas/"+r.id+".dataurl")throw std::invalid_argument("Invalid canvas reference resource path");r.src=std::make_shared<const std::string>(read(file));result.push_back(std::move(r));
 }validateCanvasReferences(result);return result;
}
}
