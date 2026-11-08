#pragma once
#include "layer_panel_state.h"
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Data.Json.h>
namespace moon::paneljson {
using namespace winrt::Windows::Data::Json;
inline LayerPanelState decode(const IJsonValue& raw,const std::string& active){
 LayerPanelState state;state.activeLayerId=active;if(!raw||raw.ValueType()!=JsonValueType::Object)return state;const auto o=raw.GetObject();
 auto string=[&](const wchar_t* key)->std::optional<std::string>{if(o.HasKey(key)){const auto v=o.GetNamedValue(key);if(v.ValueType()==JsonValueType::String)return winrt::to_string(v.GetString());}return {};};
 if(auto id=string(L"activeLayerId"))state.activeLayerId=*id;state.selectedGroupId=string(L"selectedGroupId");state.layerSelectionAnchorId=string(L"layerSelectionAnchorId");
 auto array=[&](const wchar_t* key,auto& ids){if(!o.HasKey(key))return;const auto v=o.GetNamedValue(key);if(v.ValueType()==JsonValueType::Array)for(const auto& item:v.GetArray())if(item.ValueType()==JsonValueType::String)ids.push_back(winrt::to_string(item.GetString()));};
 array(L"selectedLayerIds",state.selectedLayerIds);array(L"selectedGroupIds",state.selectedGroupIds);array(L"collapsedGroupIds",state.collapsedGroupIds);return state;
}
inline JsonObject encode(const LayerPanelState& state){
 JsonObject o;o.Insert(L"activeLayerId",JsonValue::CreateStringValue(winrt::to_hstring(state.activeLayerId)));
 auto optional=[&](const wchar_t* key,const auto& id){o.Insert(key,id?JsonValue::CreateStringValue(winrt::to_hstring(*id)):JsonValue::CreateNullValue());};
 optional(L"selectedGroupId",state.selectedGroupId);optional(L"layerSelectionAnchorId",state.layerSelectionAnchorId);
 auto array=[&](const wchar_t* key,const auto& ids){JsonArray a;for(const auto& id:ids)a.Append(JsonValue::CreateStringValue(winrt::to_hstring(id)));o.Insert(key,a);};
 array(L"selectedLayerIds",state.selectedLayerIds);array(L"selectedGroupIds",state.selectedGroupIds);array(L"collapsedGroupIds",state.collapsedGroupIds);return o;
}
}
