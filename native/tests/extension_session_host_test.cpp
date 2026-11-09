#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <roapi.h>
#include "extension_session_host.h"
#include <iostream>
using namespace moon::extension;using namespace winrt::Windows::Data::Json;
void check(bool b,const char* m){if(!b)throw std::runtime_error(m);}
int main(int argc,char** argv){RoInitialize(RO_INIT_MULTITHREADED);try{
 Storage storage(std::filesystem::path(argv[1])/("session-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64())+".json"));FileDropRouter drops;RuntimeRegistry registry;std::vector<RuntimeEvent> first,second,other;SessionHost::Token old,newer;
 auto raw=[](const std::string& method,const std::string& params="{}"){return JsonValue::Parse(winrt::to_hstring("{\"type\":\"moonsprite-extension-request\",\"requestId\":\"r\",\"method\":\""+method+"\",\"params\":"+params+"}"));};
 {SessionHost host(storage,drops,registry);old=host.open({"ext",true,false},{"runtime","commands","storage","io","workspace.read"},"en-US",[&](const auto& e){first.push_back(e);});auto another=host.open({"other",true,false},{"runtime","storage"},"en-US",[&](const auto& e){other.push_back(e);});
 registry.command("ext","queued","go");check(first.empty(),"Preload command delivered");RuntimeEvent project;project.type="project";project.payload="snapshot";host.loaded(old,project);check(first.size()==4&&first[0].type=="locale-changed"&&first[1].type=="activate"&&first[2].type=="project"&&first[3].commandId=="queued","Integrated load order");
 check(host.request(old,raw("storage.set","{\"key\":\"value\"}"),"{\"count\":1}")->GetNamedBoolean(L"ok"),"Session storage set");check(host.request(another,raw("storage.get","{\"key\":\"value\"}"))->GetNamedValue(L"result").ValueType()==JsonValueType::Null,"Session namespace isolation");
 check(host.request(old,raw("runtime.setFileDropTypes","{\"extensions\":[\".custom\"]}"))->GetNamedBoolean(L"ok"),"Session file types");int errors=0;auto remaining=host.routeFiles({"C:/pet.custom","art.png"},[](const auto&){return FileDropRouter::Bytes{1,2};},[&](const auto&){++errors;});check(remaining==std::vector<std::string>{"art.png"}&&!errors&&first.back().files[0].bytes==FileDropRouter::Bytes{1,2},"Integrated file route");
 auto pending=drops.begin("pet.custom");newer=host.open({"ext",true,false},{"runtime","commands","storage","io"},"ja-JP",[&](const auto& e){second.push_back(e);});check(first.back().type=="deactivate"&&!drops.accepts("pet.custom")&&!host.request(old,raw("storage.list")),"Replacement did not deactivate old session");host.close(old);host.loaded(old,project);check(registry.command("ext","new","go"),"Stale close erased replacement");host.loaded(newer,project);check(second.size()==3&&second[0].locale=="ja-JP"&&second[1].type=="activate"&&second[2].commandId=="new","Replacement load sequence");check(host.request(newer,raw("storage.get","{\"key\":\"value\"}"))->GetNamedValue(L"result").GetObject().GetNamedNumber(L"count")==1,"Session replacement lost persistent storage");
 host.request(newer,raw("runtime.setFileDropTypes","{\"extensions\":[\".custom\"]}"));bool rejected=false;try{drops.complete(pending,{3},[&](const auto& id,const auto& name,const auto& bytes){return registry.filesDropped(id,name,bytes);});}catch(...){rejected=true;}check(rejected,"Old pending read delivered to replacement");
 host.localeChanged("zh-CN");host.localeChanged("zh-CN");check(second.back().locale=="zh-CN"&&host.request(newer,raw("runtime.getLocale"))->GetNamedObject(L"result").GetNamedString(L"locale")==L"zh-CN","Session locale/request out of sync");
 remaining=host.routeFiles({"pet.custom","art.png"},[&](const auto&){host.close(newer);return FileDropRouter::Bytes{3};},[&](const auto&){++errors;});check(errors==1&&remaining==std::vector<std::string>{"art.png"}&&second.back().type=="deactivate"&&!registry.command("ext","late","go"),"Read completed after session close");
 std::vector<RuntimeEvent> failed;auto failing=host.open({"failed",true,false},{"commands"},"en-US",[&](const auto& e){failed.push_back(e);});registry.command("failed","queued","go");host.loadFailed(failing);registry.command("failed","late","go");host.close(failing);check(failed.empty()&&!registry.command("failed","late","go"),"Failed load retained events or registration");
 host.loaded(another,project);
 }
 check(other.back().type=="deactivate"&&!registry.dispatch("other",{})&&!drops.accepts("pet.custom"),"Host destruction left registry or drops");check(Storage(std::filesystem::path(argv[1])/("missing-session.json")).list(u"ext").empty(),"Missing storage");
 std::cout<<"Complete session registration/load/request/storage/file/replace/teardown sequence passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}catch(const winrt::hresult_error& e){std::cerr<<winrt::to_string(e.message())<<'\n';return 1;}}
