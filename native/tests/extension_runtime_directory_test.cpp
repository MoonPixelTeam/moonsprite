#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <roapi.h>
#include "extension_runtime_directory.h"
#include <iostream>
using namespace moon::extension;using namespace winrt::Windows::Data::Json;
void check(bool b,const char* m){if(!b)throw std::runtime_error(m);}template<class F>void rejects(F f){bool rejected=false;try{f();}catch(...){rejected=true;}check(rejected,"Expected rejection");}
int main(int argc,char** argv){RoInitialize(RO_INIT_MULTITHREADED);try{
 auto dir=std::filesystem::path(argv[1])/("directory-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(dir/"com.example");auto write=[&](const std::filesystem::path& path,const std::string& value){std::ofstream out(path,std::ios::binary);out<<value;check(bool(out),"Fixture write");};
 auto manifest=JsonObject::Parse(L"{\"schemaVersion\":2,\"apiVersion\":\"1.0.0\",\"id\":\"com.example\",\"name\":\"Example\",\"version\":\"1\",\"unknownMetadata\":{\"preserve\":true},\"runtime\":{\"entry\":\"runtime.HTML\",\"permissions\":[\"runtime\",\"resources\"],\"resources\":{\"data\":\"data.bin\"}}}");auto save=[&](const JsonObject& m){write(dir/"com.example"/"manifest.json",winrt::to_string(m.Stringify()));};save(manifest);write(dir/"com.example"/"data.bin","abc");
 auto candidate=RuntimeDirectory::inspect(dir,"com.example");check(candidate.enabled&&candidate.extension.id=="com.example"&&candidate.entry=="runtime.HTML"&&candidate.permissions==std::vector<std::string>{"runtime","resources"}&&candidate.resources->read("data")==FileDropRouter::Bytes{'a','b','c'}&&candidate.manifest.GetNamedObject(L"unknownMetadata").GetNamedBoolean(L"preserve"),"Directory candidate lossless/runtime");
 write(dir/".state.json","{\"enabled\":{\"com.example\":false}}");check(!RuntimeDirectory::inspect(dir,"com.example").enabled,"Disabled state");write(dir/".state.json","{}");check(RuntimeDirectory::inspect(dir,"com.example").enabled,"Default enabled");write(dir/".state.json","{\"enabled\":{\"other\":4}}");rejects([&]{RuntimeDirectory::inspect(dir,"com.example");});write(dir/".state.json","{}");
 for(const auto& invalid:std::vector<std::string>{"../com.example",".hidden","a..b","a/b",std::string(81,'a')})rejects([&]{RuntimeDirectory::inspect(dir,invalid);});
 for(int scenario=0;scenario<7;++scenario){auto m=JsonObject::Parse(manifest.Stringify());auto runtime=m.GetNamedObject(L"runtime");if(scenario==0)m.Insert(L"id",JsonValue::CreateStringValue(L"other"));if(scenario==1)m.Insert(L"schemaVersion",JsonValue::CreateNumberValue(1));if(scenario==2)m.Insert(L"apiVersion",JsonValue::CreateStringValue(L"2.0.0"));if(scenario==3)runtime.Insert(L"entry",JsonValue::CreateStringValue(L"../runtime.html"));if(scenario==4)runtime.Insert(L"entry",JsonValue::CreateStringValue(L"runtime.lua"));if(scenario==5)runtime.Insert(L"permissions",JsonArray::Parse(L"[\"runtime\",\"runtime\"]"));if(scenario==6)runtime.Insert(L"permissions",JsonArray::Parse(L"[\"unknown\"]"));save(m);rejects([&]{RuntimeDirectory::inspect(dir,"com.example");});}save(manifest);
 write(dir/"com.example"/"manifest.json",std::string(256*1024+1,' '));rejects([&]{RuntimeDirectory::inspect(dir,"com.example");});save(manifest);
 std::cout<<"Installed directory candidate, state, lossless manifest and runtime validation passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}catch(const winrt::hresult_error& e){std::cerr<<winrt::to_string(e.message())<<'\n';return 1;}}
