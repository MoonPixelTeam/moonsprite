#include "new_document_clipboard.h"
#include "fixtures/new_document_clipboard_legacy.h"
#include <array>
#include <iostream>
#include <stdexcept>
#include <chrono>
#include <memory>
using namespace moon;
using namespace moon::new_document;
void check(bool value,const char* why){if(!value)throw std::runtime_error(why);}
int main(){try{
 std::array<std::int32_t,3> header{40,320,-180};check(dibSize(header.data(),12)==std::optional<Size>{{320,180}},"Actual legacy DIB header case");
 for(const auto pair:{Size{0,1},Size{1,0},Size{4096,4097},Size{INT32_MIN,1},Size{1,INT32_MIN}}){header={40,std::int32_t(pair.width),std::int32_t(pair.height)};check(!dibSize(header.data(),12),"DIB invalid/overflow/budget");}
 header={40,-4096,-4096};check(dibSize(header.data(),12)==std::optional<Size>{{4096,4096}},"DIB negative axes/16Mi boundary");header={40,16777216,1};check(dibSize(header.data(),12)==std::optional<Size>{{16777216,1}},"DIB size probe must preserve metadata beyond editable side");header[0]=12;check(!dibSize(header.data(),12)&&!dibSize(header.data(),11)&&!dibSize(nullptr,12),"DIB header admission");
 check(layerSize({{4,6,30,30,{}},{40,-2,20,10,{}}})==std::optional<Size>{{56,38}},"Actual legacy multi-layer bounds");check(!layerSize({}),"Empty layers");check(layerSize({{-100,-50,30,20,{}}})==std::optional<Size>{{30,20}},"Negative layer position");check(layerSize({{INT32_MIN,0,1,1,{}},{INT32_MAX,0,1,1,{}}})==std::optional<Size>{{4294967296ll,1}},"Distant layer union preserves full metadata width");
 SelectionClipboard red;red.width=2;red.height=1;red.pixels={0xff0000ff,0};red.mask={1,0};auto blue=red;blue.pixels[0]=0xffff0000;
 const auto image=std::make_shared<SelectionClipboard>(red);int reads=0;ImageReader reader=[&]{++reads;return std::optional<SelectionClipboard>(*image);};
 check(latestSize({},Size{600,600},&red,[]{return std::optional<Size>{{800,500}};},reader)==std::optional<Size>{{800,500}}&&reads==0,"No layers uses metadata only");
 const std::optional<Size> layers{{56,38}},base{{600,600}};
 check(latestSize(layers,{},&red,[]{return std::optional<Size>{};},reader)==layers&&reads==0,"Missing metadata falls back to layer bounds");
 check(latestSize(layers,base,&red,[]{return std::optional<Size>{{800,500}};},reader)==std::optional<Size>{{800,500}}&&reads==0,"Changed dimensions must not decode image");
 check(latestSize(layers,base,&red,[]{return std::optional<Size>{{600,600}};},reader)==layers&&reads==1,"Unchanged image uses layers");
 *image=blue;check(latestSize(layers,base,&red,[]{return std::optional<Size>{{600,600}};},reader)==base&&reads==2,"Same-size different image replaces layers");
 check(latestSize(layers,base,nullptr,[]{return std::optional<Size>{{600,600}};},[]{return std::optional<SelectionClipboard>{};})==layers,"Both image reads empty uses layers");
 check(latestSize(layers,base,&red,[]{return std::optional<Size>{{600,600}};},[]{return std::optional<SelectionClipboard>{};})==base,"Only current empty uses system");
 check(latestSize(layers,base,nullptr,[]{return std::optional<Size>{{600,600}};},reader)==base,"Only baseline empty uses system");
 check(latestSize(layers,base,&red,[]{throw std::runtime_error("busy");return std::optional<Size>{};},reader)==layers,"Metadata failure uses layers");
 check(latestSize(layers,base,&red,[]{return std::optional<Size>{{600,600}};},{})==layers,"No image reader uses layers");
 auto all=red;all.mask={1,1};auto implicit=all;implicit.mask.clear();check(equalImages(all,implicit),"Implicit/full mask equality");implicit.originX=0;check(!equalImages(all,implicit),"Origin participates in equality");implicit=all;implicit.mask[1]=0;check(!equalImages(all,implicit),"Mask content participates in equality");
 auto promise=std::make_shared<std::promise<void>>();auto done=std::make_shared<std::promise<void>>();auto gate=promise->get_future().share();auto finished=done->get_future();const auto start=std::chrono::steady_clock::now();{auto future=probe([gate,done]{gate.wait();done->set_value();return std::optional<Size>{{2,3}};});check(future.wait_for(std::chrono::milliseconds(0))!=std::future_status::ready,"Probe must run asynchronously");}check(std::chrono::steady_clock::now()-start<std::chrono::milliseconds(200),"Dialog close waited for clipboard reader");promise->set_value();check(finished.wait_for(std::chrono::seconds(5))==std::future_status::ready,"Detached work completed safely after close");auto failed=probe([]()->std::optional<Size>{throw std::runtime_error("unavailable");});check(!failed.get(),"Optional async access failure");
 for(const auto& fixture:newClipboardOracle){
  std::optional<Size> bounds;if(fixture.layers==1)bounds=layerSize({{0,0,30,30,{}}});if(fixture.layers==2)bounds=layerSize({{4,6,30,30,{}},{40,-2,20,10,{}}});
  const auto metadata=[](int kind)->std::optional<Size>{return kind==0?std::optional<Size>{}:kind==1?std::optional<Size>{{2,1}}:std::optional<Size>{{800,500}};};
  const auto pixels=[](int kind)->std::optional<SelectionClipboard>{if(kind==0||kind==3)return {};SelectionClipboard value;value.width=2;value.height=1;value.pixels={kind==1?0xff0000ffu:0xff00ff00u,0};value.mask={1,0};return value;};
  const auto baseSize=fixture.baselineMetadata==2?metadata(1):std::optional<Size>{};const auto baseline=fixture.baselineMetadata&&fixture.baselineImage==1?pixels(1):std::optional<SelectionClipboard>{};int reads=0;
  const auto result=latestSize(bounds,baseSize,baseline?&*baseline:nullptr,[&]{if(fixture.systemMetadata==3)throw std::runtime_error("busy");return metadata(fixture.systemMetadata);},fixture.readImage?ImageReader([&]{++reads;if(fixture.currentImage==3)throw std::runtime_error("busy");return pixels(fixture.currentImage);}):ImageReader{});
  check(result==(fixture.width?std::optional<Size>{{fixture.width,fixture.height}}:std::optional<Size>{})&&reads==fixture.reads,"Actual legacy latest-size dimensions/source/read-count oracle");
 }
 {auto started=std::make_shared<std::promise<void>>(),release=std::make_shared<std::promise<void>>();auto signal=started->get_future();auto gate=release->get_future().share();auto active=probe([started,gate]{started->set_value();gate.wait();return std::optional<Size>{{1,1}};});check(signal.wait_for(std::chrono::seconds(5))==std::future_status::ready,"Coalescing worker starts");int obsoleteReads=0;auto obsolete=probe([&]{++obsoleteReads;return std::optional<Size>{{2,2}};});auto newest=probe([]{return std::optional<Size>{{3,3}};});release->set_value();auto a=active.get();auto n=newest.get();check(a==std::optional<Size>{{1,1}}&&n==std::optional<Size>{{3,3}}&&obsoleteReads==0,"Worker runs current plus latest pending only");bool replaced=false;try{obsolete.get();}catch(const std::future_error&){replaced=true;}check(replaced,"Replaced pending future did not finish");}
 std::cout<<"DIB metadata, legacy layer bounds and latest-size policy, async close/coalescing/failure and 864 actual legacy cases passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
