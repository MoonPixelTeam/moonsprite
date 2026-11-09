#include "extension_contract_session.h"
#include "extension_file_drop.h"
#include <iostream>
namespace {
void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
void oracle(){
 using namespace moon::extension;
 for(const std::string failure:{"none","replace","remove","recreate","read","oversize","unavailable"}){
  FileDropRouter router;router.setTypes("first",{".CUSTOM"});router.setTypes("second",{".custom"});
  std::string delivered;int errors=0;
  const auto remaining=router.route({"C:/pet.CUSTOM","C:/art.png"},[&](const auto&)->FileDropRouter::Bytes{
   if(failure=="replace")router.setTypes("first",{".custom"});
   if(failure=="remove")router.clear("first");
   if(failure=="recreate"){router.clear("first");router.setTypes("first",{".custom"});}
   if(failure=="read")throw std::runtime_error("read failed");
   if(failure=="oversize")return FileDropRouter::Bytes(FileDropRouter::maxBytes+1);
   return {1,2};
  },[&](const auto& id,const auto& name,const auto& bytes){if(failure=="unavailable")return false;check(bytes==FileDropRouter::Bytes{1,2},"Oracle bytes");delivered=id+":"+name+":1,2";return true;},[&](const auto&){++errors;});
  check(remaining==std::vector<std::string>{"C:/art.png"},"Oracle remaining");
  std::cout<<failure<<'|'<<remaining.front()<<'|'<<delivered<<'|'<<errors<<'\n';
 }
}
void routing(){
 using namespace moon::extension;FileDropRouter router;
 for(auto invalid:std::vector<std::vector<std::string>>{{"*"},{"png"},{"."},{".a-b"},{".a/b"},{".a\\b"},{".abcdefghijklmnopq"},{".汉"},std::vector<std::string>(17,".ok")}){
  bool rejected=false;try{router.setTypes("test",invalid);}catch(const std::invalid_argument&){rejected=true;}check(rejected,"Invalid suffix accepted");
 }
 router.setTypes("test",{".CUSTOM",".custom",".abcdefghijklmnop"});
 check(router.accepts("C:/pet.CUSTOM")&&!router.accepts("C:/folder.custom/noext")&&!router.accepts(".custom/")&&!router.accepts("a.custom."),"Suffix path boundary");
 std::vector<std::string> reads,owners,names,errors;std::vector<FileDropRouter::Bytes> payloads;
 const auto read=[&](const std::string& path){reads.push_back(path);return FileDropRouter::Bytes{1,2};};
 const auto dispatch=[&](const std::string& owner,const std::string& name,const FileDropRouter::Bytes& bytes){owners.push_back(owner);names.push_back(name);payloads.push_back(bytes);return true;};
 const auto report=[&](const std::string& error){errors.push_back(error);};
 auto remaining=router.route({"C:/pet.CUSTOM","C:/art.png","C:\\中文\\另一个.custom"},read,dispatch,report);
 check(remaining==std::vector<std::string>{"C:/art.png"}&&reads.size()==2&&names==std::vector<std::string>{"pet.CUSTOM","另一个.custom"}&&payloads[0]==FileDropRouter::Bytes{1,2}&&errors.empty(),"Legacy mixed drops/name/bytes");
 router.setTypes("second",{".custom"});
 auto pending=router.begin("a.custom");router.setTypes("test",{".custom"});
 bool stale=false;try{router.complete(pending,{1},dispatch);}catch(const std::runtime_error&){stale=true;}check(stale,"Same suffix replacement delivered old read");
 owners.clear();router.route({"a.custom"},read,dispatch,report);check(owners==std::vector<std::string>{"test"},"Replacement changed first owner order");
 router.clear("test");router.setTypes("test",{".custom"});owners.clear();router.route({"a.custom"},read,dispatch,report);check(owners==std::vector<std::string>{"second"},"Re-registration retained old order");
 auto removed=router.begin("a.custom");router.clear("second");router.setTypes("second",{".custom"});
 stale=false;try{router.complete(removed,{1},dispatch);}catch(const std::runtime_error&){stale=true;}check(stale,"Remove and recreate delivered old read");
 router.clear("second");
 for(int failure=0;failure<4;++failure){errors.clear();owners.clear();reads.clear();
  const auto failingRead=[&](const std::string& path)->FileDropRouter::Bytes{reads.push_back(path);if(failure==0)throw std::runtime_error("read failed");if(failure==1)return FileDropRouter::Bytes(FileDropRouter::maxBytes+1);if(failure==2)router.clear("test");return {3};};
  remaining=router.route({"a.custom","art.png"},failingRead,[&](const auto& a,const auto& b,const auto& c){if(failure==3)return false;return dispatch(a,b,c);},report);
  check(remaining==std::vector<std::string>{"art.png"}&&errors.size()==1&&owners.empty()&&reads.size()==1,"Failed matched drop reopened as document or delivered");router.setTypes("test",{".custom"});
 }
 errors.clear();owners.clear();router.route({"a.custom"},[](const auto&){return FileDropRouter::Bytes(FileDropRouter::maxBytes);},dispatch,report);check(errors.empty()&&owners.size()==1,"12 MiB inclusive boundary");
 pending=router.begin("a.custom");bool invalid=false;try{router.setTypes("test",{"*invalid"});}catch(const std::invalid_argument&){invalid=true;}
 owners.clear();router.complete(pending,{7},dispatch);check(invalid&&owners.size()==1,"Rejected registration changed pending handler");
 router.setTypes("test",{});check(!router.accepts("a.custom"),"Empty types did not clear matches");
}
}
int main(int argc,char** argv){try{if(argc>1&&std::string(argv[1])=="--oracle"){oracle();return 0;}using namespace moon::extension;auto e=localeEvents("en-US",{"en-US","zh-CN","zh-CN",""});check(e.size()==2&&e[1]=="zh-CN","Locale deduplication");routing();std::cout<<"locale/file-drop passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
