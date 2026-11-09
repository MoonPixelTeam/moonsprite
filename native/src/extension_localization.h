#pragma once
#include "extension_runtime_directory.h"
namespace moon::extension {
// extension-localization.ts selects the exact locale only. Missing translations
// retain source text; there is no language-prefix or English fallback.
inline winrt::Windows::Data::Json::JsonObject localizeExtension(const winrt::Windows::Data::Json::JsonObject& source,const std::string& locale){
 using namespace winrt::Windows::Data::Json;
 if(!source.HasKey(L"translations"))return source;auto translations=source.GetNamedObject(L"translations");auto language=winrt::to_hstring(locale);if(!translations.HasKey(language))return source;auto catalog=translations.GetNamedObject(language);
 std::function<IJsonValue(const IJsonValue&)> visit=[&](const IJsonValue& value)->IJsonValue{
  if(value.ValueType()==JsonValueType::Array){JsonArray result;for(auto item:value.GetArray())result.Append(visit(item));return result;}
  if(value.ValueType()!=JsonValueType::Object)return value;
  JsonObject result;for(auto item:value.GetObject()){const auto key=item.Key();auto entry=item.Value();if(key==L"translations")result.Insert(key,entry);else if((key==L"name"||key==L"description"||key==L"label"||key==L"suffix"||key==L"placeholder")&&entry.ValueType()==JsonValueType::String){auto text=entry.GetString();result.Insert(key,catalog.HasKey(text)?catalog.GetNamedValue(text):entry);}else result.Insert(key,visit(entry));}return result;
 };return visit(source).GetObject();
}
// Presentation copy: never revalidate translated strings as package source
// metadata (a translation may legitimately exceed the source field's limit).
inline RuntimeCandidate localizedCandidate(const RuntimeCandidate& source,const std::string& locale){
 auto found=source.metadata.translations.find(locale);if(found==source.metadata.translations.end())return source;auto result=source;
 auto translate=[&](std::string& value){auto text=found->second.find(value);if(text!=found->second.end())value=text->second;};auto optional=[&](std::optional<std::string>& value){if(value)translate(*value);};
 translate(result.metadata.name);translate(result.metadata.description);for(auto& command:result.commands){translate(command.name);translate(command.description);}
 for(auto* list:{&result.metadata.panels,&result.metadata.menuItems,&result.metadata.topMenus})for(auto& item:*list){optional(item.name);optional(item.description);}
 for(auto& control:result.settings.controls){translate(control.label);translate(control.description);optional(control.suffix);optional(control.placeholder);for(auto& option:control.options){translate(option.label);translate(option.description);}}
 result.manifest=localizeExtension(source.manifest,locale);return result;
}
}
