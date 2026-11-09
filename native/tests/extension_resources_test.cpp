#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <roapi.h>
#include "extension_resources.h"
#include "extension_session_host.h"
#include <iostream>
using namespace moon::extension;using namespace winrt::Windows::Data::Json;
void check(bool b,const char* m){if(!b)throw std::runtime_error(m);}template<class F>void rejects(F f){bool rejected=false;try{f();}catch(...){rejected=true;}check(rejected,"Expected rejection");}
int main(int argc,char** argv){RoInitialize(RO_INIT_MULTITHREADED);try{
 const auto root=std::filesystem::path(argv[1])/("resource-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(root/L"素材");{std::ofstream f(root/L"素材"/L"data.bin",std::ios::binary);const char bytes[]={0,1,char(255)};f.write(bytes,3);}
 for(const auto& path:std::vector<std::string>{"../a","/a","~a","a\\b","a//b","a/","CON.png","a/NUL","a:stream","a.","a ","./a","a/../b",std::string(241,'a'),"a\xc2\x85"})rejects([&]{ResourceCatalog c(root,"runtime.html",{{"id",path}});});
 rejects([&]{ResourceCatalog c(root,"runtime.html",{{"id","manifest.json"}});});rejects([&]{ResourceCatalog c(root,"runtime.html",{{"id","runtime.html"}});});rejects([&]{ResourceCatalog c(root,"runtime.html",{{"id","x"},{"ID","y"}});});rejects([&]{ResourceCatalog c(root,"runtime.html",{{"..","x"}});});
 std::map<std::string,std::string> many;for(int i=0;i<65;++i)many["id"+std::to_string(i)]="x";rejects([&]{ResourceCatalog c(root,"runtime.html",many);});
 auto catalog=std::make_shared<ResourceCatalog>(root,"runtime.html",std::map<std::string,std::string>{{"image","素材/data.bin"},{"missing","missing.bin"},{"limit","limit.bin"}});check(catalog->read("image")==FileDropRouter::Bytes{0,1,255},"Raw resource bytes");rejects([&]{catalog->read("IMAGE");});rejects([&]{catalog->read("../image");});rejects([&]{catalog->read("missing");});
 {std::ofstream f(root/"limit.bin",std::ios::binary);f.seekp(ResourceCatalog::maxBytes-1);f.put(0);}check(catalog->read("limit").size()==ResourceCatalog::maxBytes,"16MiB inclusive");{std::ofstream f(root/"limit.bin",std::ios::app|std::ios::binary);f.put(0);}rejects([&]{catalog->read("limit");});
 Storage storage(root/"storage.json");FileDropRouter drops;RuntimeRegistry registry;SessionHost host(storage,drops,registry);auto token=host.open({"ext",true,false},{"resources"},"en-US",[](const auto&){});host.setResourceReader(token,[catalog](const auto& id){return catalog->read(id);});
 auto request=[](const std::string& id){return JsonValue::Parse(winrt::to_hstring("{\"type\":\"moonsprite-extension-request\",\"requestId\":\"r\",\"method\":\"resources.read\",\"params\":{\"resourceId\":\""+id+"\"}}"));};auto reply=host.request(token,request("image"));check(reply&&reply->GetNamedBoolean(L"ok")&&reply->GetNamedArray(L"result").GetNumberAt(2)==255,"Resource request bytes");check(!host.request(token,request("missing"))->GetNamedBoolean(L"ok"),"Missing resource false success");auto denied=host.open({"denied",true,false},{},"en-US",[](const auto&){});host.setResourceReader(denied,[&](const auto&)->FileDropRouter::Bytes{throw std::runtime_error("Reader must not run");});check(!host.request(denied,request("image"))->GetNamedBoolean(L"ok"),"Resource permission");host.close(token);check(!host.request(token,request("image")),"Closed resource reader");std::cout<<"Resource catalog validation, bounded disk read and session request passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}catch(const winrt::hresult_error& e){std::cerr<<winrt::to_string(e.message())<<'\n';return 1;}}
