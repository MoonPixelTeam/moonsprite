#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include "extension_session_host.h"
#include "runtime_diagnostics.h"
#include <iostream>
#include <fstream>
using namespace moon::extension;using namespace winrt::Windows::Data::Json;
void check(bool value,const char* why){if(!value)throw std::runtime_error(why);}
int main(int argc,char** argv){winrt::init_apartment();try{
 const auto root=std::filesystem::path(argv[1])/("diagnostics-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));auto recorder=std::make_shared<moon::diagnostics::Recorder>(root/"logs",root/"fallback.jsonl",2);Storage storage(root/"storage.json");FileDropRouter drops;RuntimeRegistry registry;SessionHost host(storage,drops,registry);auto token=host.open({"diagnostic",true,false},{"diagnostics"},"en-US",[](const auto&){});auto denied=host.open({"denied",true,false},{},"en-US",[](const auto&){});
 std::vector<std::string> order;std::wstring status,console;std::string kind,level;
 auto persistent=recorderDiagnosticServices(recorder,"diagnostic",[](const auto&){},[](const auto&,const auto&){});DiagnosticServices services;services.record=[&](const auto& k,const auto& message){order.push_back("record");kind=k;persistent.record(k,message);};services.status=[&](const auto& message){order.push_back("status");status=message;};services.console=[&](const auto& l,const auto& message){order.push_back("console");level=l;console=message;};host.setDiagnosticServices(token,services);
 auto raw=[](const std::wstring& params){JsonObject request;request.Insert(L"type",JsonValue::CreateStringValue(L"moonsprite-extension-request"));request.Insert(L"requestId",JsonValue::CreateStringValue(L"diag"));request.Insert(L"method",JsonValue::CreateStringValue(L"diagnostics.log"));request.Insert(L"params",JsonObject::Parse(params));return request;};
 auto call=[&](const std::wstring& params){order.clear();return *host.request(token,raw(params));};
 check(call(LR"({"level":"error","message":"中文 failure"})").GetNamedBoolean(L"ok")&&order==std::vector<std::string>({"record","status","console"})&&kind=="error"&&status==L"中文 failure"&&console==L"[Extension diagnostic] 中文 failure"&&level=="error","error ordering and prefix");
 check(!call(LR"({"level":"error","message":12})").GetNamedBoolean(L"ok")&&order==std::vector<std::string>({"record","status"})&&status==L"12","malformed message side effects before validation");
 check(!call(LR"({"level":"error"})").GetNamedBoolean(L"ok")&&status==L"undefined","undefined coercion");
 check(!call(LR"({"level":"error","message":[null,[1,true],{},"x"]})").GetNamedBoolean(L"ok")&&status==L",1,true,[object Object],x","nested array String coercion");
 check(call(LR"({"level":["error"],"message":"array level"})").GetNamedBoolean(L"ok")&&kind=="operation-stage"&&level=="error"&&order==std::vector<std::string>({"record","console"}),"strict level vs coerced console level");
 for(const auto& l:{L"debug",L"info",L"warn",L"error",L"unknown"}){check(call(L"{\"level\":\""+std::wstring(l)+L"\",\"message\":\"test\"}").GetNamedBoolean(L"ok"),"valid log level");check(level==(std::wstring(l)==L"unknown"?"info":winrt::to_string(l)),"console level normalization");}
 JsonObject params;params.Insert(L"level",JsonValue::CreateStringValue(L"error"));const std::wstring longMessage=std::wstring(1999,L'a')+wchar_t(0xd83c)+wchar_t(0xdf13)+L"tail";params.Insert(L"message",JsonValue::CreateStringValue(longMessage));check(call(std::wstring(params.Stringify())).GetNamedBoolean(L"ok")&&status==longMessage&&console.size()==std::wstring(L"[Extension diagnostic] ").size()+2000&&console.back()==wchar_t(0xd83c),"UTF16 slicing only console");
 check(!call(LR"({"message":{"toString":1}})").GetNamedBoolean(L"ok")&&order.empty(),"coercion failure before recording");
 for(const auto& pair:std::vector<std::pair<std::wstring,std::wstring>>{{L"1e-7",L"1e-7"},{L"1e-6",L"0.000001"},{L"1e20",L"100000000000000000000"},{L"1e21",L"1e+21"},{L"-0",L"0"}})check(diagnosticString(JsonValue::Parse(pair.first))==pair.second,"JS number String");
 order.clear();check(!host.request(denied,raw(LR"({"message":"denied"})"))->GetNamedBoolean(L"ok")&&order.empty(),"permission before diagnostics");host.setDiagnosticServices(token,{});check(!call(LR"({"message":"missing"})").GetNamedBoolean(L"ok")&&order.empty(),"unconnected diagnostics not false success");host.setDiagnosticServices(token,services);host.close(token);check(!host.request(token,raw(LR"({"message":"late"})")),"closed session log");
 check(recorder->flush(),"diagnostic disk flush");bool found=false;for(const auto& entry:std::filesystem::directory_iterator(root/"logs")){std::ifstream file(entry.path());std::string text((std::istreambuf_iterator<char>(file)),{});if(text.find("extension.runtime")!=std::string::npos&&text.find("diagnostic")!=std::string::npos&&text.find("undefined")!=std::string::npos)found=true;}check(found,"actual persistent recorder");std::cout<<"Extension diagnostics ordering/coercion/UTF16/permissions/lifecycle and persistent recorder passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}catch(const winrt::hresult_error& e){std::cerr<<winrt::to_string(e.message())<<'\n';return 1;}}
