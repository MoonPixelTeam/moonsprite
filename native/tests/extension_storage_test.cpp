#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <roapi.h>
#include "extension_storage.h"
#include <fstream>
#include <iostream>
#include <chrono>
using namespace moon::extension;
void check(bool b,const char* text){if(!b)throw std::runtime_error(text);}
template<class F>void rejects(F f){bool failed=false;try{f();}catch(...){failed=true;}check(failed,"Expected rejection");}
int main(int argc,char** argv){RoInitialize(RO_INIT_MULTITHREADED);try{
 auto root=std::filesystem::path(argc>1?argv[1]:"extension-storage-test-owned");std::filesystem::create_directories(root);const auto path=root/("storage-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64())+".json");
 Storage s(path);s.setEncoded(u"one",u"value","{\"count\":1}");s.setEncoded(u"two",u"value","{\"count\":2}");check(s.get(u"one",u"value").GetObject().GetNamedNumber(L"count")==1&&s.get(u"two",u"value").GetObject().GetNamedNumber(L"count")==2,"Namespaces");
 if(argc>2&&std::string(argv[2])=="--oracle"){
  std::cout<<"namespaces|"<<int(s.get(u"one",u"value").GetObject().GetNamedNumber(L"count"))<<'|'<<int(s.get(u"two",u"value").GetObject().GetNamedNumber(L"count"))<<'\n';
  const std::string max='"'+std::string(256*1024-2,'x')+'"';for(auto key:{u"a",u"b",u"c",u"d"})s.setEncoded(u"quota",key,max);
  bool over=false;try{s.setEncoded(u"quota",u"e","0");}catch(...){over=true;}s.setEncoded(u"quota",u"a",max);s.remove(u"quota",u"d");s.setEncoded(u"quota",u"e","0");
  std::cout<<"quota|"<<over<<'|'<<s.list(u"quota").size()<<'|'<<s.get(u"quota",u"e").GetNumber()<<'\n';
  int invalid=0;for(auto key:{std::u16string{},std::u16string(161,u'a'),std::u16string(u"a\nb"),std::u16string(54,u'汉')})try{s.setEncoded(u"key",key,"0");}catch(...){++invalid;}
  std::cout<<"invalid|"<<invalid<<'\n';s.setEncoded(u"unicode",u"😀","0");s.setEncoded(u"unicode",u"\ue000","0");std::cout<<"sort|"<<(s.list(u"unicode").front()==u"😀")<<'\n';return 0;
 }
 check(Storage(path).get(u"one",u"value").GetObject().GetNamedNumber(L"count")==1,"Disk reopen");check(s.get(u"one",u"missing").ValueType()==winrt::Windows::Data::Json::JsonValueType::Null,"Missing null");
 for(auto key:{std::u16string{},std::u16string(161,u'a'),std::u16string(u"a\nb"),std::u16string(54,u'汉')}){rejects([&]{s.setEncoded(u"one",key,"1");});rejects([&]{s.get(u"one",key);});rejects([&]{s.remove(u"one",key);});}
 s.setEncoded(u"one",std::u16string(160,u'a'),"true");s.setEncoded(u"one",std::u16string(53,u'汉'),"false");s.setEncoded(u"one",u"😀","null");s.setEncoded(u"one",u"\ue000","0");const auto keys=s.list(u"one");check(keys==Storage(path).list(u"one")&&std::is_sorted(keys.begin(),keys.end())&&std::find(keys.begin(),keys.end(),u"😀")<std::find(keys.begin(),keys.end(),u"\ue000"),"UTF16 list sorting");
 rejects([&]{s.setEncoded(u"one",u"invalid","undefined");});check(s.list(u"one")==keys,"Invalid JSON changed storage");
 const std::string maximum='"'+std::string(256*1024-2,'x')+'"';for(auto key:{u"a",u"b",u"c",u"d"})s.setEncoded(u"budget",key,maximum);rejects([&]{s.setEncoded(u"budget",u"e","0");});rejects([&]{s.setEncoded(u"budget",u"a",'"'+std::string(256*1024-1,'x')+'"');});s.setEncoded(u"budget",u"a",maximum);s.setEncoded(u"other",u"a",maximum);s.remove(u"budget",u"d");s.setEncoded(u"budget",u"e","0");check(Storage(path).list(u"budget")==std::vector<std::u16string>{u"a",u"b",u"c",u"e"},"Quota/overwrite/remove");
 HANDLE locked=CreateFileW(path.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,0,nullptr);check(locked!=INVALID_HANDLE_VALUE,"Lock fixture");rejects([&]{s.setEncoded(u"one",u"value","5");});rejects([&]{s.remove(u"one",u"value");});CloseHandle(locked);check(s.get(u"one",u"value").GetObject().GetNamedNumber(L"count")==1&&Storage(path).get(u"one",u"value").GetObject().GetNamedNumber(L"count")==1,"Failed write lost old state");
 // Failed publication must clean only its staging files and allow the same
 // in-memory instance to save again after the conflicting handle is released.
 auto stagingCount=[&]{std::size_t count=0;const auto prefix=path.filename().wstring()+L".storage-";for(const auto& item:std::filesystem::directory_iterator(root))if(item.path().filename().wstring().find(prefix)==0)++count;return count;};
 const auto staged=stagingCount();
 for(bool remove:{false,true}){HANDLE conflict=CreateFileW(path.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,0,nullptr);check(conflict!=INVALID_HANDLE_VALUE,"Recovery lock fixture");rejects([&]{if(remove)s.remove(u"one",u"value");else s.setEncoded(u"one",u"value","5");});s.remove(u"one",u"absent");CloseHandle(conflict);check(stagingCount()==staged,"failed publication leaked staging file");check(s.get(u"one",u"value").GetObject().GetNamedNumber(L"count")==1&&Storage(path).get(u"one",u"value").GetObject().GetNamedNumber(L"count")==1,"failure changed memory or disk");s.setEncoded(u"recovery",u"value",remove?"2":"1");check(Storage(path).get(u"recovery",u"value").GetNumber()==(remove?2:1),"same instance did not recover publication");}
 // A cooperating snapshot reader keeps old bytes while atomic publication
 // changes the path. A reader without delete sharing must still reject writes.
 HANDLE snapshot=CreateFileW(path.c_str(),GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,0,nullptr);check(snapshot!=INVALID_HANDLE_VALUE,"Snapshot reader fixture");
 LARGE_INTEGER beforeSize{};check(GetFileSizeEx(snapshot,&beforeSize)!=0,"Old snapshot size");s.setEncoded(u"snapshot",u"new","123");LARGE_INTEGER afterSize{};check(GetFileSizeEx(snapshot,&afterSize)!=0&&beforeSize.QuadPart==afterSize.QuadPart,"Atomic replacement rewrote open snapshot");CloseHandle(snapshot);check(Storage(path).get(u"snapshot",u"new").GetNumber()==123,"New snapshot not published");
 // Bounded independent save/load operations, no sleeps or retries on failure.
 for(int i=0;i<32;++i){try{s.setEncoded(u"sequence",u"value",std::to_string(i));}catch(const std::system_error& error){std::cerr<<"Publication failed at sequence "<<i<<", code="<<error.code().value()<<", target attributes="<<GetFileAttributesW(path.c_str())<<", stage count="<<stagingCount()<<"\n";const auto disk=Storage(path).get(u"sequence",u"value"),memory=s.get(u"sequence",u"value");check(disk.Stringify()==memory.Stringify(),"Publication failure diverged disk/memory");throw;}check(Storage(path).get(u"sequence",u"value").GetNumber()==i,"Continuous save/reopen sequence");}
 // Identical local values still publish: another instance may have changed disk.
 {Storage other(path);other.setEncoded(u"snapshot",u"new","456");s.setEncoded(u"snapshot",u"new","123");check(Storage(path).get(u"snapshot",u"new").GetNumber()==123,"identical local set did not restore requested disk value");}
 const auto corrupt=root/("corrupt-"+std::to_string(GetCurrentProcessId())+".json");{std::ofstream out(corrupt);out<<"[[\"moonsprite.extension-runtime.v1.one.bad\",\"broken\"]]";}Storage broken(corrupt);check(broken.get(u"one",u"bad").ValueType()==winrt::Windows::Data::Json::JsonValueType::Null,"Corrupt value fallback");broken.setEncoded(u"one",u"good","7");check(Storage(corrupt).get(u"one",u"good").GetNumber()==7,"Preserve invalid value during unrelated write");
 {const auto many=root/("many-"+std::to_string(GetCurrentProcessId())+".json");auto write=[&](bool duplicate){std::ofstream out(many,std::ios::binary);out<<"[";for(int i=0;i<8192;++i){if(i)out<<",";out<<"[\"moonsprite.extension-runtime.v1.bulk."<<(duplicate&&i==8191?0:i)<<"\",\""<<i<<"\"]";}out<<"]";};write(false);const auto began=std::chrono::steady_clock::now();Storage loaded(many);const auto elapsed=std::chrono::steady_clock::now()-began;check(loaded.list(u"bulk").size()==8192&&loaded.get(u"bulk",u"0").GetNumber()==0&&loaded.get(u"bulk",u"8191").GetNumber()==8191,"many keys preserved");std::cout<<"Storage load 8192 keys: "<<std::chrono::duration_cast<std::chrono::microseconds>(elapsed).count()<<" us\n";write(true);rejects([&]{Storage duplicate(many);});}
 std::cout<<"Extension storage disk, namespaces, quotas, UTF16 keys, failure preservation passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}catch(const winrt::hresult_error& e){std::cerr<<winrt::to_string(e.message())<<'\n';return 1;}}
