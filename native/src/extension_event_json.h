#pragma once
#include "extension_runtime.h"
#include <type_traits>
#include <cmath>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
namespace moon::extension {
// Transport adapter only: raw payload is trusted serialized JSON, never code.
// Empty payload represents the null value; malformed JSON fails explicitly.
inline winrt::Windows::Data::Json::JsonObject eventJson(const RuntimeEvent& event){
 using namespace winrt::Windows::Data::Json;JsonObject result;
 auto text=[&](const wchar_t* key,const std::string& value){result.Insert(key,JsonValue::CreateStringValue(winrt::to_hstring(value)));};
 auto payload=[&]()->IJsonValue{return event.payload.empty()?JsonValue::CreateNullValue():JsonValue::Parse(winrt::to_hstring(event.payload));};
 auto project=[&]{if(!event.projectId)throw std::invalid_argument("Runtime event requires projectId");text(L"projectId",*event.projectId);};
 text(L"type",event.type);
 if(event.type=="activate"){text(L"apiVersion",event.apiVersion);text(L"extensionId",event.extensionId);}
 else if(event.type=="deactivate"){}
 else if(event.type=="locale-changed")text(L"locale",event.locale);
 else if(event.type=="command"){text(L"commandId",event.commandId);text(L"event",event.event);}
 else if(event.type=="project"){result.Insert(L"project",payload());result.Insert(L"homeOpen",JsonValue::CreateBooleanValue(event.homeOpen));}
 else if(event.type=="settings-changed"){text(L"key",event.key);result.Insert(L"value",payload());}
 else if(event.type=="window-message"){text(L"windowId",event.windowId);result.Insert(L"message",payload());}
 else if(event.type=="interaction"){if(event.kind!="pointer"&&event.kind!="keyboard")throw std::invalid_argument("Unknown interaction kind");text(L"kind",event.kind);}
 else if(event.type=="clock")result.Insert(L"timestamp",JsonValue::CreateNumberValue(double(event.timestamp)));
 else if(event.type=="document-saved")project();
 else if(event.type=="export-complete"){project();if(event.format)text(L"format",*event.format);}
 else if(event.type=="files-dropped"){JsonArray files;for(const auto& file:event.files){JsonObject item;item.Insert(L"name",JsonValue::CreateStringValue(winrt::to_hstring(file.name)));JsonArray bytes;for(auto byte:file.bytes)bytes.Append(JsonValue::CreateNumberValue(byte));item.Insert(L"bytes",bytes);files.Append(item);}result.Insert(L"files",files);}
 else if(event.type=="editor-event"){
  text(L"name",event.name);result.Insert(L"timestamp",JsonValue::CreateNumberValue(double(event.timestamp)));if(event.projectId)text(L"projectId",*event.projectId);JsonObject detail;
  for(const auto& item:event.detail){IJsonValue value=std::visit([](const auto& raw)->IJsonValue{using T=std::decay_t<decltype(raw)>;if constexpr(std::is_same_v<T,std::nullptr_t>)return JsonValue::CreateNullValue();else if constexpr(std::is_same_v<T,std::string>)return JsonValue::CreateStringValue(winrt::to_hstring(raw));else if constexpr(std::is_same_v<T,bool>)return JsonValue::CreateBooleanValue(raw);else return std::isfinite(raw)?JsonValue::CreateNumberValue(raw):JsonValue::CreateNullValue();},item.second);detail.Insert(winrt::to_hstring(item.first),value);}result.Insert(L"detail",detail);
 }else throw std::invalid_argument("Unknown runtime event type: "+event.type);
 return result;
}
inline winrt::Windows::Data::Json::JsonObject eventEnvelope(const RuntimeEvent& event){using namespace winrt::Windows::Data::Json;JsonObject result;result.Insert(L"type",JsonValue::CreateStringValue(L"moonsprite-extension-event"));result.Insert(L"event",eventJson(event));return result;}
}
