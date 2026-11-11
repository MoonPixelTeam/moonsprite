#include "extension_form_image.h"
#include <winrt/Windows.Foundation.h>
#include <iostream>
using namespace moon::extension;using namespace winrt::Windows::Data::Json;
void check(bool value,const char* why){if(!value)throw std::runtime_error(why);}
int main(){winrt::init_apartment();try{{
 check(formImageMemoryUsed()==0,"initial image memory");
 auto full=reserveFormImageMemory(formImageMemoryLimit);
 auto token=std::make_shared<std::atomic<bool>>(false);
 auto waiting=std::async(std::launch::async,[token]{return reserveFormImageMemory(4,token);});
 check(waiting.wait_for(std::chrono::milliseconds(30))==std::future_status::timeout,"global budget defers background admission");
 token->store(true);check(waiting.wait_for(std::chrono::seconds(2))==std::future_status::ready,"waiting admission cancels");
 bool cancelled=false;try{waiting.get();}catch(...){cancelled=true;}check(cancelled,"cancel rejects reservation");
 auto next=std::async(std::launch::async,[]{return reserveFormImageMemory(8);});
 check(next.wait_for(std::chrono::milliseconds(30))==std::future_status::timeout,"second host waits for budget");
 full->shrink(formImageMemoryLimit-8);check(next.wait_for(std::chrono::seconds(2))==std::future_status::ready,"released upload memory wakes host");
 auto retained=next.get();check(formImageMemoryUsed()==formImageMemoryLimit,"combined exact accounting");
 full.reset();check(formImageMemoryUsed()==8,"cache eviction releases memory");retained.reset();check(formImageMemoryUsed()==0,"all hosts released");
 bool oversized=false;try{reserveFormImageMemory(formImageMemoryLimit+1);}catch(...){oversized=true;}check(oversized,"oversize fails without waiting");
 }{
 const std::wstring png=L"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP4z8DwHwgbABB5A359Y87XAAAAAElFTkSuQmCC";
 auto full=reserveFormImageMemory(formImageMemoryLimit);
 std::vector<FormImageTask> tasks;for(int i=0;i<64;++i)tasks.push_back(startFormImage(png));
 for(auto& task:tasks)task.cancel();
 for(auto& task:tasks){check(task.result.wait_for(std::chrono::seconds(5))==std::future_status::ready,"queued cancelled image completes");bool rejected=false;try{task.result.get();}catch(...){rejected=true;}check(rejected,"queued cancellation prevents publication");}
 check(formImageMemoryUsed()==formImageMemoryLimit,"cancelled tasks finish while budget remains occupied");full.reset();check(formImageMemoryUsed()==0,"cancelled queue releases all image leases");
 auto next=startFormImage(png);check(next.result.wait_for(std::chrono::seconds(5))==std::future_status::ready,"queue remains usable after cancellation burst");check(next.result.get().pixels.size()==2,"queue recovery PNG result");
 }const auto image=decodeFormImage(L"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP4z8DwHwgbABB5A359Y87XAAAAAElFTkSuQmCC");check(image.memory&&formImageMemoryUsed()>0,"decoded pixels retain memory lease");check(image.width==2&&image.height==1&&image.pixels.size()==2&&image.pixels[0]==0xff0000ff&&image.pixels[1]==0x8000ff00,"PNG exact RGBA/alpha");{auto task=startFormImage(L"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP4z8DwHwgbABB5A359Y87XAAAAAElFTkSuQmCC");check(task.result.wait_for(std::chrono::seconds(10))==std::future_status::ready,"async decoder completes");auto decoded=task.result.get();check(decoded.pixels==image.pixels,"async exact RGBA");auto bad=startFormImage(L"invalid");check(bad.result.wait_for(std::chrono::seconds(10))==std::future_status::ready,"async failure completes");bool failed=false;try{bad.result.get();}catch(...){failed=true;}check(failed,"async errors propagated");auto cancelled=startFormImage(L"invalid");cancelled.cancel();check(cancelled.cancelled->load(),"cancellation token");}JsonObject node;check(formImageExtent(node,L"width")==48,"default48");node.Insert(L"width",JsonValue::CreateNumberValue(1));check(formImageExtent(node,L"width")==16,"min16");node.Insert(L"width",JsonValue::CreateNumberValue(513));check(formImageExtent(node,L"width")==512,"max512");node.Insert(L"width",JsonValue::CreateNumberValue(32.5));check(formImageExtent(node,L"width")==32.5,"fractional extent");node.Insert(L"width",JsonValue::CreateStringValue(L"100"));check(formImageExtent(node,L"width")==48,"string defaults");for(const auto* source:{L"https://example.com/a.png",L"data:image/jpeg;base64,AA==",L"data:image/png;base64,@@@",L"data:image/png;base64,AAAA"}){bool failed=false;try{decodeFormImage(source);}catch(...){failed=true;}check(failed,"invalid image rejected");}std::cout<<"Form PNG exact RGBA/alpha, source validation and display dimensions passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}catch(const winrt::hresult_error& e){std::cerr<<winrt::to_string(e.message())<<'\n';return 1;}}
