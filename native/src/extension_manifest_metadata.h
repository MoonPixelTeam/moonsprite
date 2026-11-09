#pragma once
#include "extension_manifest_settings.h"
namespace moon::extension {
struct ManifestContribution {
 std::string id,position="end",menu;
 std::optional<std::string> name,description;
 bool defaultVisible=false;std::vector<std::string> commands;
};
struct ManifestMetadata {
 std::string name,version,description,author;
 std::optional<std::string> entry;
 std::map<std::string,std::map<std::string,std::string>> translations;
 std::vector<ManifestContribution> panels,menuItems,topMenus;
};
inline ManifestMetadata inspectMetadata(const winrt::Windows::Data::Json::JsonObject& manifest,const std::vector<ManifestCommand>& commands){
 using namespace winrt::Windows::Data::Json;using namespace manifest_detail;
 auto fail=[](){throw std::invalid_argument("扩展清单元数据或菜单栏目声明无效。");};
 const std::set<std::wstring> fields={L"schemaVersion",L"id",L"name",L"translations",L"version",L"description",L"author",L"apiVersion",L"entry",L"settingsEntry",L"settingsUi",L"runtime",L"commands",L"panels",L"menuItems",L"topMenus"};
 for(auto item:manifest)if(!fields.count(std::wstring(item.Key())))fail();
 const double schema=manifest.GetNamedNumber(L"schemaVersion");if(schema!=1&&schema!=2)fail();if(!validId(winrt::to_string(manifest.GetNamedString(L"id"))))fail();
 auto readText=[&](const JsonObject& o,const wchar_t* key,std::size_t max,bool required){auto value=(!required&&!o.HasKey(key))?std::string{}:winrt::to_string(o.GetNamedString(key));if(!text(value,max,required))fail();return value;};
 ManifestMetadata result;result.name=readText(manifest,L"name",160,true);result.version=readText(manifest,L"version",80,true);result.description=readText(manifest,L"description",4096,false);result.author=readText(manifest,L"author",160,false);
 auto api=optionalString(manifest,L"apiVersion");if(api&&!text(*api,80,true))fail();
 result.entry=optionalString(manifest,L"entry");if(result.entry){auto ext=ResourceCatalog::packagePath(*result.entry).extension().wstring();for(auto& c:ext)if(c>=L'A'&&c<=L'Z')c=wchar_t(c-L'A'+L'a');if(ext!=L".lua")fail();}
 if(manifest.HasKey(L"translations")){auto locales=manifest.GetNamedObject(L"translations");if(locales.Size()>64)fail();for(auto locale:locales){auto id=winrt::to_string(locale.Key());if(!text(id,32,true))fail();auto catalog=locale.Value().GetObject();if(catalog.Size()>512)fail();auto& dest=result.translations[id];for(auto item:catalog){auto key=winrt::to_string(item.Key()),value=winrt::to_string(item.Value().GetString());if(!text(key,4096,true)||!text(value,4096,true))fail();dest.emplace(std::move(key),std::move(value));}}}
 auto builtin=[](const std::string& value){return value=="file"||value=="edit"||value=="select"||value=="canvas"||value=="layer"||value=="window"||value=="help";};
 auto position=[&](const std::string& value,bool top){if(value=="start"||value=="end")return true;auto colon=value.find(':');return top&&colon!=std::string::npos&&(value.substr(0,colon)=="before"||value.substr(0,colon)=="after")&&builtin(value.substr(colon+1));};
 auto parse=[&](const wchar_t* key,int kind,std::size_t limit){std::vector<ManifestContribution> out;if(!manifest.HasKey(key))return out;auto list=manifest.GetNamedArray(key);if(list.Size()>limit)fail();std::set<std::string> ids;
  for(auto value:list){auto o=value.GetObject();ManifestContribution c;c.id=winrt::to_string(o.GetNamedString(L"id"));if(!validId(c.id)||!ids.insert(lower(c.id)).second)fail();
   if(kind==1){c.name=optionalString(o,L"name");c.description=optionalString(o,L"description");if((c.name&&!text(*c.name,160,true))||(c.description&&!text(*c.description,4096,false)))fail();c.menu=winrt::to_string(o.GetNamedString(L"menu"));if(!builtin(c.menu))fail();}
   else {c.name=readText(o,L"name",160,true);c.description=readText(o,L"description",4096,false);}
   if(kind==0){if(o.HasKey(L"defaultVisible"))c.defaultVisible=o.GetNamedBoolean(L"defaultVisible");}
   else {if(o.HasKey(L"position"))c.position=winrt::to_string(o.GetNamedString(L"position"));if(!position(c.position,kind==2))fail();}
   std::set<std::string> seen;if(o.HasKey(L"commands"))for(auto command:o.GetNamedArray(L"commands")){auto id=winrt::to_string(command.GetString());if(!validId(id)||!seen.insert(lower(id)).second||std::none_of(commands.begin(),commands.end(),[&](const auto& known){return known.runtime.id==id;}))fail();c.commands.push_back(std::move(id));}
   if(c.commands.size()>32||(kind!=0&&c.commands.empty()))fail();out.push_back(std::move(c));
  }return out;
 };
 result.panels=parse(L"panels",0,16);result.menuItems=parse(L"menuItems",1,32);result.topMenus=parse(L"topMenus",2,16);return result;
}
}
