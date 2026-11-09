#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <roapi.h>
#include "extension_request_host.h"
#include <iostream>
using namespace moon::extension;using namespace winrt::Windows::Data::Json;
void check(bool b,const char* m){if(!b)throw std::runtime_error(m);}
int main(int argc,char** argv){RoInitialize(RO_INIT_MULTITHREADED);try{
 const auto path=std::filesystem::path(argv[1])/("requests-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64())+".json");Storage storage(path);FileDropRouter drops;RuntimeRegistry registry;int events=0;auto stop=registry.registerRuntime("one",[&](const auto&){++events;});
 RequestHost one({"one",true,false},{"storage","runtime","io","commands"},storage,drops,registry,{},{{"go","runtime","go",false}}),two({"two",true,false},{"storage"},storage,drops,registry);
 auto call=[&](RequestHost& host,const std::string& method,const std::string& params="{}",std::optional<std::string> encoded={}){auto raw=JsonValue::Parse(winrt::to_hstring("{\"type\":\"moonsprite-extension-request\",\"requestId\":\"r\",\"method\":\""+method+"\",\"params\":"+params+"}"));auto result=host.handle(raw,true,"ja-JP",encoded);check(bool(result),"Missing response");return *result;};
 check(call(one,"storage.set","{\"key\":\"value\",\"extensionId\":\"two\"}","{\"count\":1}").GetNamedBoolean(L"ok"),"Set request");
 check(call(one,"storage.get","{\"key\":\"value\"}").GetNamedValue(L"result").GetObject().GetNamedNumber(L"count")==1,"Get request");check(call(two,"storage.get","{\"key\":\"value\"}").GetNamedValue(L"result").ValueType()==JsonValueType::Null,"Namespace spoof");
 check(Storage(path).get(u"one",u"value").GetObject().GetNamedNumber(L"count")==1,"Disk bridge");check(call(one,"storage.list").GetNamedArray(L"result").Size()==1,"List request");
 check(!call(one,"storage.set","{\"key\":4}","0").GetNamedBoolean(L"ok")&&!call(one,"storage.set","{\"key\":\"x\"}").GetNamedBoolean(L"ok"),"Invalid key or undefined value");
 check(!call(two,"runtime.getLocale").GetNamedBoolean(L"ok")&&call(one,"runtime.getLocale").GetNamedObject(L"result").GetNamedString(L"locale")==L"ja-JP","Locale permission");
 check(call(one,"runtime.setFileDropTypes","{\"extensions\":[\".custom\"]}").GetNamedBoolean(L"ok")&&drops.accepts("pet.custom"),"Drop registration request");check(!call(one,"runtime.setFileDropTypes","{\"extensions\":[4]}").GetNamedBoolean(L"ok")&&drops.accepts("pet.custom"),"Bad drop registration atomic");
 check(call(one,"commands.execute","{\"commandId\":\"go\"}").GetNamedBoolean(L"result")&&events==1,"Command request");check(!call(one,"commands.execute","{\"commandId\":\"missing\"}").GetNamedBoolean(L"ok"),"Missing command");stop();check(!call(one,"commands.execute","{\"commandId\":\"go\"}").GetNamedBoolean(L"result"),"Stopped runtime result");
 check(!call(one,"unknown.method").GetNamedBoolean(L"ok")&&!call(one,"runtime.getCapabilities").GetNamedBoolean(L"ok"),"Unsupported false success");
 check(call(one,"storage.remove","{\"key\":\"value\"}").GetNamedBoolean(L"ok")&&Storage(path).list(u"one").empty(),"Remove request");
 auto raw=JsonValue::Parse(L"{\"type\":\"moonsprite-extension-request\",\"requestId\":\"x\",\"method\":\"storage.list\"}");check(!one.handle(raw,false,"en-US")&&!one.handle(JsonValue::Parse(L"{}"),true,"en-US"),"Untrusted/malformed request responded");one.deactivate();check(!drops.accepts("pet.custom")&&!one.handle(raw,true,"en-US"),"Deactivate requests");
 RequestHost validation({"three",true,false},{"storage"},storage,drops,registry);auto request=raw.GetObject();request.Insert(L"requestId",JsonValue::CreateStringValue(winrt::to_hstring(std::string(80,'x'))));check(bool(validation.handle(request,true,"en-US")),"80-unit request id rejected");request.Insert(L"requestId",JsonValue::CreateStringValue(winrt::to_hstring(std::string(81,'x'))));check(!validation.handle(request,true,"en-US"),"81-unit request id accepted");request.Insert(L"requestId",JsonValue::CreateNumberValue(1));check(!validation.handle(request,true,"en-US"),"Numeric request id accepted");
 RequestHost disabled({"disabled",false,false},{"storage"},storage,drops,registry);check(!disabled.handle(raw,true,"en-US"),"Disabled host accepted request");
 std::cout<<"Authenticated request dispatch, storage persistence, permissions and responses passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}catch(const winrt::hresult_error& e){std::cerr<<winrt::to_string(e.message())<<'\n';return 1;}}
