#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include "extension_session_host.h"
#include <fstream>
#include <regex>
#include <random>
#include <iostream>
using namespace moon::extension;using namespace winrt::Windows::Data::Json;
void check(bool b,const char* why){if(!b)throw std::runtime_error(why);}
std::string read(const std::filesystem::path& path){std::ifstream file(path);check(bool(file),"legacy evidence missing");return {(std::istreambuf_iterator<char>(file)),{}};}
std::vector<std::string> strings(const JsonArray& array){std::vector<std::string> out;for(const auto& value:array)out.push_back(winrt::to_string(value.GetString()));return out;}
int main(int argc,char** argv){winrt::init_apartment();try{
 check(argc==3,"isolated output and legacy evidence roots required");const auto legacy=std::filesystem::path(argv[2]);const auto source=read(legacy/"src/renderer/src/core/extension-runtime.ts");const auto start=source.find("EXTENSION_RUNTIME_METHOD_PERMISSIONS"),end=source.find("\n}",start);check(start!=std::string::npos&&end!=std::string::npos,"legacy permission table boundary");const auto table=source.substr(start,end-start);std::regex pair("'([^']+)': '([^']+)'");std::vector<std::pair<std::string,std::string>> oracle;std::vector<std::string> permissions;
 for(auto it=std::sregex_iterator(table.begin(),table.end(),pair);it!=std::sregex_iterator();++it){oracle.emplace_back((*it)[1],(*it)[2]);if(std::find(permissions.begin(),permissions.end(),(*it)[2])==permissions.end())permissions.push_back((*it)[2]);}check(oracle.size()==34,"legacy methods count");permissions.push_back("events");
 const auto eventSource=read(legacy/"src/renderer/src/core/extension-editor-events.ts");const auto eventStart=eventSource.find("= ["),eventEnd=eventSource.find("] as const",eventStart);const auto eventTable=eventSource.substr(eventStart,eventEnd-eventStart);std::regex quoted("'([^']+)'");std::vector<std::string> events;for(auto it=std::sregex_iterator(eventTable.begin(),eventTable.end(),quoted);it!=std::sregex_iterator();++it)events.push_back((*it)[1]);check(events.size()==23,"legacy event count");
 Storage storage(std::filesystem::path(argv[1])/("capabilities-"+std::to_string(GetCurrentProcessId())+".json"));FileDropRouter drops;RuntimeRegistry registry;SessionHost host(storage,drops,registry);
 auto request=JsonValue::Parse(LR"({"type":"moonsprite-extension-request","requestId":"caps","method":"runtime.getCapabilities","params":{"permissions":["spoof"],"apiVersion":"spoof"}})");
 auto verify=[&](std::vector<std::string> allowed){auto token=host.open({"capabilities",true,false},allowed,"en-US",[](const auto&){});auto response=host.request(token,request);check(bool(response),"capability response missing");if(std::find(allowed.begin(),allowed.end(),"runtime")==allowed.end()){check(!response->GetNamedBoolean(L"ok"),"query permission gate");return;}
 check(response->GetNamedBoolean(L"ok")&&response->GetNamedString(L"requestId")==L"caps","capability envelope");auto result=response->GetNamedObject(L"result");check(result.Size()==5&&result.GetNamedString(L"apiVersion")==L"1.0.0"&&strings(result.GetNamedArray(L"permissions"))==allowed,"version/permission identity");
 std::vector<std::string> expected;for(const auto& permission:allowed)for(const auto& entry:oracle)if(entry.second==permission&&std::find(expected.begin(),expected.end(),entry.first)==expected.end())expected.push_back(entry.first);check(strings(result.GetNamedArray(L"methods"))==expected,"actual legacy reduce method ordering");
 check(strings(result.GetNamedArray(L"editorEvents"))==(std::find(allowed.begin(),allowed.end(),"events")!=allowed.end()?events:std::vector<std::string>{}),"actual legacy event list");check(strings(result.GetNamedArray(L"windowPresentations"))==(std::find(allowed.begin(),allowed.end(),"windows")!=allowed.end()?std::vector<std::string>{"native","dialog","overlay"}:std::vector<std::string>{}),"window presentation list");
 
 };
 verify({});for(const auto& permission:permissions){verify({permission});verify({"runtime",permission});}verify({"windows","events","storage","runtime","windows","runtime"});std::mt19937 random(42);for(int i=0;i<128;++i){std::shuffle(permissions.begin(),permissions.end(),random);auto subset=permissions;subset.resize(i%permissions.size()+1);verify(subset);}verify(permissions);
 auto old=host.open({"capabilities",true,false},{"runtime","network"},"en-US",[](const auto&){});auto current=host.open({"capabilities",true,false},{"runtime"},"ja-JP",[](const auto&){});check(!host.request(old,request),"stale query accepted");auto final=host.request(current,request)->GetNamedObject(L"result");check(strings(final.GetNamedArray(L"methods"))==std::vector<std::string>{"runtime.getCapabilities","runtime.getLocale"},"reload leaked previous permissions");host.close(current);check(!host.request(current,request),"closed query accepted");check(drops.accepts("test.custom")==false&&storage.list(u"capabilities").empty(),"query mutated drop/storage");
 std::cout<<"Capabilities match actual legacy method/event evidence across permission permutations and session lifecycle\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}catch(const winrt::hresult_error& e){std::cerr<<winrt::to_string(e.message())<<'\n';return 1;}}
