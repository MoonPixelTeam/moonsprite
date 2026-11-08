#pragma once
#include "layer_panel_state_json.h"
#include "javascript_text.h"
#include <windows.h>
#include <icu.h>
#include <stdexcept>
#ifdef GetObject
#undef GetObject
#endif
namespace moon::paneljson {
inline std::string trimmedPath(const std::string& path){const auto text=winrt::to_hstring(path);std::size_t begin=0,end=text.size();while(begin<end&&javascriptWhitespace(text[begin]))++begin;while(end>begin&&javascriptWhitespace(text[end-1]))--end;return winrt::to_string(std::wstring_view(text.data()+begin,end-begin));}
inline std::string pathKey(std::string path){
 std::wstring wide(winrt::to_hstring(trimmedPath(path)));std::replace(wide.begin(),wide.end(),L'\\',L'/');
 if(wide.empty())return {};
 // Resolve the supported system ICU entry explicitly: the app also statically
 // links Skia ICU, whose unrenamed u_strToLower symbol must not be mixed in.
 using Lower=decltype(&u_strToLower);static const Lower lowerFunction=[](){const auto module=LoadLibraryExW(L"icu.dll",nullptr,LOAD_LIBRARY_SEARCH_SYSTEM32);if(!module)throw std::runtime_error("Cannot load system ICU for layer-panel paths");const auto function=reinterpret_cast<Lower>(GetProcAddress(module,"u_strToLower"));if(!function)throw std::runtime_error("Cannot resolve system ICU casing");return function;}();
 UErrorCode error=U_ZERO_ERROR;const auto count=lowerFunction(nullptr,0,reinterpret_cast<const UChar*>(wide.data()),int(wide.size()),"en-US",&error);if(error!=U_BUFFER_OVERFLOW_ERROR&&U_FAILURE(error))throw std::runtime_error("Cannot normalize layer-panel path");std::wstring lower(count,L'\0');error=U_ZERO_ERROR;lowerFunction(reinterpret_cast<UChar*>(lower.data()),count,reinterpret_cast<const UChar*>(wide.data()),int(wide.size()),"en-US",&error);if(U_FAILURE(error))throw std::runtime_error("Cannot normalize layer-panel path");return winrt::to_string(lower);
}
inline IJsonValue storedState(const JsonObject& store,const std::string& path){
 const auto key=pathKey(path);if(key.empty()||!store.HasKey(L"entries"))return nullptr;const auto entries=store.GetNamedValue(L"entries");if(entries.ValueType()!=JsonValueType::Array)return nullptr;
 for(const auto& item:entries.GetArray())if(item.ValueType()==JsonValueType::Object){const auto entry=item.GetObject();if(!entry.HasKey(L"filePath"))continue;const auto p=entry.GetNamedValue(L"filePath");if(p.ValueType()==JsonValueType::String&&pathKey(winrt::to_string(p.GetString()))==key)return entry.HasKey(L"state")?entry.GetNamedValue(L"state"):JsonValue::CreateNullValue();}return nullptr;
}
inline void remember(JsonObject& store,const std::string& path,const LayerPanelState& state,double now){
 const auto key=pathKey(path);if(key.empty())return;JsonArray entries;JsonObject entry;entry.Insert(L"filePath",JsonValue::CreateStringValue(winrt::to_hstring(trimmedPath(path))));entry.Insert(L"updatedAt",JsonValue::CreateNumberValue(now));entry.Insert(L"state",encode(state));entries.Append(entry);
 if(store.HasKey(L"entries")){const auto previous=store.GetNamedValue(L"entries");if(previous.ValueType()==JsonValueType::Array)for(const auto& item:previous.GetArray()){if(entries.Size()==100)break;if(item.ValueType()!=JsonValueType::Object)continue;const auto o=item.GetObject();if(!o.HasKey(L"filePath"))continue;const auto p=o.GetNamedValue(L"filePath");if(p.ValueType()==JsonValueType::String&&pathKey(winrt::to_string(p.GetString()))!=key)entries.Append(item);}}
 store.Insert(L"entries",entries);
}
}
