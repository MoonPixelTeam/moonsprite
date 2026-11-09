#include "extension_runtime.h"
#include <iostream>
using namespace moon::extension;
void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
int main(int argc,char** argv){try{
 if(argc>1){for(const auto& p:methodPermissions)std::cout<<p.method<<'|'<<p.permission<<'\n';return 0;}
 RuntimeRegistry registry;std::vector<std::string> received;
 auto previous=registry.registerRuntime("one",[&](const auto&){received.push_back("previous");});
 auto current=registry.registerRuntime("one",[&](const auto& e){received.push_back("one:"+e.type);});
 auto other=registry.registerRuntime("two",[&](const auto& e){received.push_back("two:"+e.type);});
 previous();check(!registry.dispatch("constructor",{})&&!registry.dispatch("__proto__",{})&&!registry.dispatch("missing",{}),"Missing dispatch");
 check(registry.dispatch("one",{"window-message"}),"Replacement not registered");registry.broadcast({"clock"});
 check(received==std::vector<std::string>{"one:window-message","one:clock","two:clock"},"Replacement cleanup or broadcast order");current();current();other();check(!registry.dispatch("one",{}),"Stop not idempotent");
 RuntimeRegistry live;RuntimeRegistry::Stop stopSecond,stopThird;std::vector<std::string> order;bool first=true;
 auto stopFirst=live.registerRuntime("first",[&](const auto&){order.push_back("first");if(first){first=false;stopSecond();stopThird=live.registerRuntime("third",[&](const auto&){order.push_back("third");});}});
 stopSecond=live.registerRuntime("second",[&](const auto&){order.push_back("second");});live.broadcast({"clock"});check(order==std::vector<std::string>{"first","third"},"Live Map deletion/addition semantics");
 auto throwing=live.registerRuntime("first",[](const auto&){throw std::runtime_error("callback");});bool propagated=false;try{live.broadcast({});}catch(const std::runtime_error&){propagated=true;}check(propagated,"Callback exception swallowed");throwing();order.clear();live.broadcast({});check(order==std::vector<std::string>{"third"},"Exception left registry traversal invalid");
 RuntimeRegistry commands;RuntimeEvent captured;auto stop=commands.registerRuntime("ext",[&](const auto& e){captured=e;});RuntimeExtension ext{"ext",true,true};RuntimeCommand command{"run","runtime","event",true};std::vector<std::string> lua,settings;CommandHandlers handlers{[&](const auto& id){lua.push_back(id);},[&](const auto& id){settings.push_back(id);}};
 check(executeCommand(commands,ext,command,handlers)&&captured.type=="command"&&captured.commandId=="run"&&captured.event=="event"&&settings.empty(),"Runtime command priority");stop();check(!executeCommand(commands,ext,command,handlers)&&settings.empty(),"Missing runtime falls through settings");command.handler="lua";check(executeCommand(commands,ext,command,handlers)&&lua==std::vector<std::string>{"extension:ext:run"},"Lua command routing");ext.enabled=false;check(!executeCommand(commands,ext,command,handlers)&&lua.size()==1,"Disabled command");ext.enabled=true;command.handler="runtime";command.runtimeEvent.clear();check(executeCommand(commands,ext,command,handlers)&&settings==std::vector<std::string>{"ext"},"Settings routing");ext.hasSettings=false;check(!executeCommand(commands,ext,command,handlers),"Missing settings");
 for(const auto& p:methodPermissions){check(runtimeAllows({p.permission},p.method)&&!runtimeAllows({},p.method),"Method permission");}check(!runtimeAllows({"runtime","storage"},"unknown.method"),"Unknown method allowed");
 FileDropRouter router;router.setTypes("ext",{".custom"});auto runtime=commands.registerRuntime("ext",[&](const auto& e){captured=e;});int errors=0;auto dispatch=[&](const auto& id,const auto& name,const auto& bytes){return commands.filesDropped(id,name,bytes);};
 check(router.route({"C:/pet.custom","art.png"},[](const auto&){return FileDropRouter::Bytes{1,2};},dispatch,[&](const auto&){++errors;})==std::vector<std::string>{"art.png"}&&errors==0&&captured.type=="files-dropped"&&captured.files.size()==1&&captured.files[0].name=="pet.custom"&&captured.files[0].bytes==FileDropRouter::Bytes{1,2},"Runtime file-drop integration");
 router.route({"pet.custom"},[&](const auto&){runtime();return FileDropRouter::Bytes{3};},dispatch,[&](const auto&){++errors;});check(errors==1&&captured.files[0].bytes==FileDropRouter::Bytes{1,2},"Stopped runtime delivered pending file");
 RuntimeRegistry::Stop afterDestruction;{RuntimeRegistry temporary;afterDestruction=temporary.registerRuntime("x",[](const auto&){});}afterDestruction();
 std::cout<<"Runtime registration, live broadcast, commands, permissions and file-drop passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
