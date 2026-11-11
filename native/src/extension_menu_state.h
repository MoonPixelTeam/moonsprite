#pragma once
#include "extension_runtime.h"
#include "javascript_text.h"
#include <optional>
#include <set>
#include <map>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
namespace moon::extension {
struct DynamicMenuItem {std::string id,event;std::wstring name;bool checked=false,dividerBefore=false;bool operator==(const DynamicMenuItem& other)const{return id==other.id&&event==other.event&&name==other.name&&checked==other.checked&&dividerBefore==other.dividerBefore;}};
struct CommandState {std::optional<bool> checked,visible;bool operator==(const CommandState& other)const{return checked==other.checked&&visible==other.visible;}};
class MenuState {
 // Event-thread live traversal mirrors the legacy Set: removed listeners are
 // skipped and new listeners are visited in the same notification.
 struct Observer {std::function<void()> callback;};
 struct Observers {std::vector<std::shared_ptr<Observer>> entries;unsigned traversals=0;
  void compact(){if(!traversals)entries.erase(std::remove(entries.begin(),entries.end(),nullptr),entries.end());}
 };
 std::shared_ptr<Observers> observers_=std::make_shared<Observers>();
 void notify(){++revision_;const auto state=observers_;struct Guard{Observers& state;explicit Guard(Observers& s):state(s){++state.traversals;}~Guard(){--state.traversals;state.compact();}} guard(*state);for(std::size_t i=0;i<state->entries.size();++i){auto entry=state->entries[i];if(entry)entry->callback();}}
 std::map<std::string,CommandState> commands_;
 std::vector<std::string> declared_;std::map<std::string,std::vector<DynamicMenuItem>> items_;std::map<std::string,std::wstring> names_;std::uint64_t revision_=0;
public:
 using Stop=std::function<void()>;
 // Returned snapshots carry values only; observing a snapshot never observes its host.
 MenuState(const MenuState& other):commands_(other.commands_),declared_(other.declared_),items_(other.items_),names_(other.names_),revision_(other.revision_){}
 MenuState& operator=(const MenuState&)=delete;
 Stop subscribe(std::function<void()> callback){auto entry=std::make_shared<Observer>(Observer{std::move(callback)});observers_->entries.push_back(entry);return [weak=std::weak_ptr<Observers>(observers_),target=std::weak_ptr<Observer>(entry)]{auto state=weak.lock();auto observer=target.lock();if(!state||!observer)return;for(auto& live:state->entries)if(live==observer){live.reset();break;}state->compact();};}
 explicit MenuState(std::vector<std::string> declared={}):declared_(std::move(declared)){}
 void setDeclared(std::vector<std::string> ids){declared_=std::move(ids);if(items_.empty()&&names_.empty())return;items_.clear();names_.clear();notify();}
 std::uint64_t revision()const{return revision_;}
 std::vector<DynamicMenuItem> items(const std::string& menu)const{auto it=items_.find(menu);return it==items_.end()?std::vector<DynamicMenuItem>{}:it->second;}
 std::optional<DynamicMenuItem> item(const std::string& menu,const std::string& id)const{auto found=items_.find(menu);if(found!=items_.end())for(const auto& item:found->second)if(item.id==id)return item;return {};}
 std::optional<std::wstring> name(const std::string& menu)const{auto it=names_.find(menu);return it==names_.end()?std::optional<std::wstring>{}:it->second;}
 CommandState command(const std::string& id)const{auto it=commands_.find(id);return it==commands_.end()?CommandState{}:it->second;}
 bool checked(const std::string& id)const{return command(id).checked.value_or(false);}
 bool visible(const std::string& id)const{return command(id).visible.value_or(true);}
 void setCommand(const std::string& id,CommandState next){const auto previous=command(id);if(!next.checked)next.checked=previous.checked;if(!next.visible)next.visible=previous.visible;if(next==previous)return;commands_[id]=next;notify();}
 void clear(){if(items_.empty()&&names_.empty()&&commands_.empty())return;items_.clear();names_.clear();commands_.clear();notify();}
 void set(const winrt::Windows::Data::Json::JsonObject& params){
  using namespace winrt::Windows::Data::Json;
  auto menu=winrt::to_string(params.GetNamedString(L"menuId"));if(std::find(declared_.begin(),declared_.end(),menu)==declared_.end())throw std::invalid_argument("扩展菜单不存在。");
  auto label=[](const winrt::hstring& s){std::wstring value(s);if(value.size()>80||javascriptTrim(std::u32string(value.begin(),value.end())).empty())throw std::invalid_argument("菜单名称无效。");return value;};
  auto id=[](const winrt::hstring& s){auto value=winrt::to_string(s);if(value.empty()||value.size()>80||!std::all_of(value.begin(),value.end(),[](unsigned char c){return (c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='.'||c=='_'||c=='-';}))throw std::invalid_argument("菜单选项 ID 无效。");return value;};
  std::optional<std::wstring> title;if(params.HasKey(L"name"))title=label(params.GetNamedString(L"name"));auto entries=params.GetNamedArray(L"items");if(entries.Size()>64)throw std::invalid_argument("菜单最多包含 64 个选项。");std::vector<DynamicMenuItem> next;std::set<std::string> seen;
  for(auto value:entries){auto o=value.GetObject();DynamicMenuItem item;item.id=id(o.GetNamedString(L"id"));item.event=id(o.GetNamedString(L"event"));item.name=label(o.GetNamedString(L"name"));item.checked=o.GetNamedBoolean(L"checked");if(o.HasKey(L"dividerBefore"))item.dividerBefore=o.GetNamedBoolean(L"dividerBefore");if(!seen.insert(item.id).second)throw std::invalid_argument("菜单选项重复。");next.push_back(std::move(item));}
  bool changed=title&&name(menu)!=title;if(title)names_[menu]=*title;if(!changed&&items(menu)==next)return;items_[menu]=std::move(next);notify();
 }
};
}
