#pragma once
#include "extension_file_drop.h"
#include <functional>
#include <memory>
#include <string>
#include <utility>
#include <vector>
#include <map>
#include <variant>
#include <optional>

namespace moon::extension {
struct RuntimeEvent {
 std::string type, commandId, event, payload, key;
 std::string locale, extensionId, apiVersion;
 struct File {std::string name;FileDropRouter::Bytes bytes;};
 std::vector<File> files;
 using DetailValue=std::variant<std::nullptr_t,std::string,double,bool>;
 std::string name;std::optional<std::string> projectId;
 std::map<std::string,DetailValue> detail;std::int64_t timestamp=0;
 std::string kind,windowId;std::optional<std::string> format;bool homeOpen=false;
};
// All calls belong to the host event thread, like the legacy JS Map. A live
// traversal observes callback registrations/removals rather than a snapshot.
class RuntimeRegistry {
 using Dispatch=std::function<void(const RuntimeEvent&)>;
 struct Entry {std::string id;Dispatch dispatch;};
 struct State {std::vector<std::shared_ptr<Entry>> entries;unsigned traversals=0;
  void compact(){if(!traversals)entries.erase(std::remove(entries.begin(),entries.end(),nullptr),entries.end());}
 };
 std::shared_ptr<State> state_=std::make_shared<State>();
public:
 RuntimeRegistry()=default;
 RuntimeRegistry(const RuntimeRegistry&)=delete;
 RuntimeRegistry& operator=(const RuntimeRegistry&)=delete;
 using Stop=std::function<void()>;
 Stop registerRuntime(std::string id,Dispatch dispatch){
  auto entry=std::make_shared<Entry>(Entry{std::move(id),std::move(dispatch)});
  auto it=std::find_if(state_->entries.begin(),state_->entries.end(),[&](const auto& e){return e&&e->id==entry->id;});
  if(it==state_->entries.end())state_->entries.push_back(entry);else *it=entry;
  return [state=std::weak_ptr<State>(state_),entry=std::weak_ptr<Entry>(entry)]{
   const auto s=state.lock();const auto e=entry.lock();if(!s||!e)return;
   for(auto& live:s->entries)if(live==e){live.reset();break;}s->compact();
  };
 }
 bool dispatch(const std::string& id,const RuntimeEvent& event)const{
  for(const auto& e:state_->entries)if(e&&e->id==id){auto retained=e;retained->dispatch(event);return true;}return false;
 }
 bool command(const std::string& id,const std::string& commandId,const std::string& event)const{
  RuntimeEvent value;value.type="command";value.commandId=commandId;value.event=event;return dispatch(id,value);
 }
 void broadcast(const RuntimeEvent& event)const{
  const auto s=state_;struct Traversal{State& state;explicit Traversal(State& s):state(s){++state.traversals;}~Traversal(){--state.traversals;state.compact();}} guard(*s);
  for(std::size_t i=0;i<s->entries.size();++i){const auto retained=s->entries[i];if(retained)retained->dispatch(event);}
 }
 bool filesDropped(const std::string& id,const std::string& name,const FileDropRouter::Bytes& bytes)const{
  RuntimeEvent value;value.type="files-dropped";value.files.push_back({name,bytes});return dispatch(id,value);
 }
};
struct MethodPermission {const char* method;const char* permission;};
inline constexpr MethodPermission methodPermissions[]={
 {"runtime.getCapabilities","runtime"},{"runtime.getLocale","runtime"},{"runtime.setFileDropTypes","io"},
 {"commands.execute","commands"},{"menus.setItems","menus"},{"ui.notify","ui"},{"ui.openSettings","ui"},
 {"windows.open","windows"},{"windows.close","windows"},{"windows.setVisible","windows"},{"windows.postMessage","windows"},
 {"workspace.listProjects","workspace.read"},{"workspace.getActiveProject","workspace.read"},{"workspace.activateProject","workspace.write"},
 {"document.getSummary","document.read"},{"document.getLayers","document.read"},{"document.getFrames","document.read"},
 {"document.undo","document.write"},{"document.redo","document.write"},{"tools.getActive","tools"},{"tools.setActive","tools"},
 {"colors.get","document.read"},{"colors.setPrimary","document.write"},{"colors.setSecondary","document.write"},
 {"storage.get","storage"},{"storage.set","storage"},{"storage.remove","storage"},{"storage.list","storage"},
 {"resources.read","resources"},{"clipboard.readText","clipboard"},{"clipboard.writeText","clipboard"},
 {"notifications.show","notifications"},{"network.fetch","network"},{"diagnostics.log","diagnostics"}
};
inline bool runtimeAllows(const std::vector<std::string>& permissions,const std::string& method){
 for(const auto& p:methodPermissions)if(method==p.method)return std::find(permissions.begin(),permissions.end(),p.permission)!=permissions.end();return false;
}
struct RuntimeCommand {std::string id,handler,runtimeEvent;bool opensSettings=false;};
struct RuntimeExtension {std::string id;bool enabled=true,hasSettings=false;};
struct CommandHandlers {std::function<void(const std::string&)> runLua,openSettings;};
inline bool executeCommand(const RuntimeRegistry& registry,const RuntimeExtension& extension,const RuntimeCommand& command,const CommandHandlers& handlers){
 if(!extension.enabled)return false;
 if(command.handler=="lua"){handlers.runLua("extension:"+extension.id+":"+command.id);return true;}
 if(!command.runtimeEvent.empty())return registry.command(extension.id,command.id,command.runtimeEvent);
 if(command.opensSettings&&extension.hasSettings){handlers.openSettings(extension.id);return true;}return false;
}
}
