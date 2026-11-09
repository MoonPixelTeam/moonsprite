#include "lua_script_runtime.h"
#include "lua_script_result.h"
#include <iostream>
using namespace moon;
using namespace moon::script;
using namespace winrt::Windows::Data::Json;
namespace moon {struct RasterHistoryFixture {
 static void removeFrameCels(Document& d,const std::string& frame){auto state=d.timeline_.state();state.cels.erase(std::remove_if(state.cels.begin(),state.cels.end(),[&](const auto& c){return c.frameId==frame;}),state.cels.end());d.timeline_=timeline::Timeline(std::move(state));}
};}
void check(bool ok,const char* message){if(!ok)throw std::runtime_error(message);}
template<class Work>void reject(Work work){bool failed=false;try{work();}catch(...){failed=true;}check(failed,"Expected rejection");}
auto deadline(){return std::chrono::steady_clock::now()+std::chrono::seconds(30);}
Invocation capture(const Document& d,std::string mse="null"){
 InvocationCapture c(d,std::move(mse));while(!c.advance(d,deadline())){}return c.take();
}
Document fixture(int size,int frames,bool linked){
 timeline::State state;timeline::Layer layer;layer.id="layer";layer.name=U"图层🌙";state.layers.push_back(layer);
 for(int i=0;i<frames;++i){const auto id="frame-"+std::to_string(i);state.frames.push_back({id,100,false});timeline::Cel cel;cel.id="cel-"+std::to_string(i);cel.layerId=layer.id;cel.frameId=id;
  if(linked&&i)cel.linkedCelId="cel-0";else{timeline::Surface s;s.width=s.height=size;s.offsetX=-2;s.offsetY=3;s.storageOriginX=-4;s.storageOriginY=5;s.pixels.resize(std::size_t(size)*size);s.pixels[0]=0x00123456;s.pixels.back()=0xffabcdef;cel.surface=std::move(s);}state.cels.push_back(std::move(cel));
 }
 return Document::fromImported(size,size,std::move(state),PaletteState{},"project",U"工程🌙",std::make_shared<const std::vector<std::uint8_t>>());
}
int main(int argc,char** argv){try{winrt::init_apartment();check(argc==2,"Fixture path required");
 // Capture real RGBA bytes, including alpha-zero RGB and nonzero storage origin.
 auto d=std::make_unique<Document>(fixture(3,2,true));d->previewSelection(SelectionMask{-1,2,2,2,{1,0,1,1}});d->setSourceFilePath(L"C:/源/画.moonsprite");
 const auto rev=d->revision(),history=d->historySize();InvocationCapture planned(*d,R"({"document":{"name":"real-snapshot"}})",std::filesystem::path(L"D:/保存/画.moonsprite"));
 check(planned.copiedPixels()==0,"Planning read pixels");reject([&]{planned.take();});check(!planned.advance(*d,std::chrono::steady_clock::now()-std::chrono::seconds(1)),"Expired deadline copied pixels");check(planned.copiedPixels()==0,"Deadline not respected");
 check(!planned.advance(*d,deadline(),4)&&planned.copiedPixels()==4,"Tick budget ignored");while(!planned.advance(*d,deadline(),4)){}auto invocation=planned.take();reject([&]{planned.take();});reject([&]{planned.advance(*d,deadline());});
 check(planned.copiedPixels()==18&&d->revision()==rev&&d->historySize()==history,"Capture modified document or dropped linked payload");check(invocation.target.matches(*d),"Fresh target rejected");
 auto json=JsonObject::Parse(winrt::to_hstring(invocation.contextJson()));check(json.GetNamedString(L"documentName")==L"工程🌙"&&json.GetNamedString(L"layerName")==L"图层🌙","Unicode names lost");
 check(json.GetNamedString(L"documentFilePath")==L"D:/保存/画.moonsprite"&&json.GetNamedNumber(L"layerOffsetX")==-2&&json.GetNamedNumber(L"layerOffsetY")==3,"Path/geometry mismatch");
 check(json.GetNamedArray(L"pixels").GetNumberAt(0)==0x00123456&&json.GetNamedArray(L"pixels").GetNumberAt(8)==0xffabcdef,"Packed RGBA changed");
 check(json.GetNamedArray(L"activeLayerCels").Size()==2&&json.GetNamedArray(L"activeLayerCels").GetObjectAt(1).GetNamedNumber(L"frameNumber")==2,"Linked frame context lost");
 check(json.GetNamedObject(L"selection").GetNamedArray(L"mask").Size()==4&&json.GetNamedObject(L"mseSnapshot").GetNamedObject(L"document").GetNamedString(L"name")==L"real-snapshot","Selection/MSE input replaced");
 check(json.GetNamedNumber(L"foreground")==d->palette().primary&&json.GetNamedNumber(L"background")==d->palette().secondary,"Color roles changed");
 auto other=std::make_unique<Document>(fixture(3,2,true));check(!invocation.target.matches(*other,false),"Same project IDs bypassed document identity");
 d->selectFrame("frame-1");check(!invocation.target.matches(*d,false),"Changed active frame accepted");d->selectFrame("frame-0");check(invocation.target.matches(*d,false),"Restored target slot rejected");
 d->setLayerLocked(true);check(!invocation.target.matches(*d,false),"Locked target accepted");d->setLayerLocked(false);check(!invocation.target.matches(*d)&&invocation.target.matches(*d,false),"Dialog rebase revision behavior changed");
 // Metadata/storage guards catch mutation even without a Document revision bump.
 auto changed=std::make_unique<Document>(fixture(3,1,false));InvocationCapture pending(*changed,"null");check(!pending.advance(*changed,deadline(),1),"Expected partial capture");const_cast<timeline::Surface&>(changed->activeSurface()).pixels[0]=42;reject([&]{pending.advance(*changed,deadline());});
 auto baseline=capture(*changed);const_cast<timeline::Surface&>(changed->activeSurface()).pixels[1]=43;check(!baseline.target.matches(*changed),"Original pixel comparison omitted");
 // Reject oversized per-frame payload before copying, linked and independent.
 for(bool linked:{false,true})for(const auto [size,frames]:{std::pair{1024,13},std::pair{2048,4}}){auto large=std::make_unique<Document>(fixture(size,frames,linked));const auto before=large->revision();reject([&]{InvocationCapture fail(*large,"null");});check(before==large->revision(),"Budget rejection modified document");}
 {auto boundary=std::make_unique<Document>(fixture(1024,12,true));InvocationCapture allowed(*boundary,"null");check(allowed.copiedPixels()==0,"Allowed boundary copied during planning");check(!allowed.advance(*boundary,deadline())&&allowed.copiedPixels()==RasterSnapshot::tickPixels,"Default bounded tick changed");}
 // An empty frame stays absent and transparent; captures must not create Cels.
 auto empty=std::make_unique<Document>(4,3);empty->addFrame();const auto frame=empty->frame().id;RasterHistoryFixture::removeFrameCels(*empty,frame);
 empty->setImportedLayerGeometry({{empty->layer().id,{2,3,-1,2}}});const auto count=empty->timeline().state().cels.size();auto blank=capture(*empty);
 check(blank.target.expected.pixels->size()==6&&blank.target.matches(*empty)&&!empty->activeSurfaceIfPresent()&&empty->timeline().state().cels.size()==count,"Capture materialized absent Cel");
 // Completed captures survive the source document and run on the real worker.
 auto root=std::filesystem::path(argv[1])/("capture-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(root/"scripts");
 {std::ofstream file(root/"scripts"/"capture.lua");file<<"assert(app.activeImage.width==3); app.transaction('captured',function() app.activeImage:drawPixel(0,0,app.pixelColor.rgba(1,2,3,255)) end)";}
 const auto target=invocation.target;d.reset();Runtime runtime(root);const auto resultText=runtime.startInvocation("capture.lua",std::move(invocation)).get();auto result=JsonObject::Parse(winrt::to_hstring(resultText));auto batch=result.GetNamedArray(L"batches").GetObjectAt(0);check(batch.GetNamedString(L"label")==L"captured"&&batch.GetNamedArray(L"changes").GetObjectAt(0).GetNamedNumber(L"before")==0x00123456,"Captured document did not reach Lua engine");
 const auto validated=validateResult(target,resultText);check((*validated.pixels)[0]==0xff030201&&(*target.expected.pixels)[0]==0x00123456,"Result validator mutated source baseline");
 auto validate=[&](const char* batches,const char* layers="[]",const char* docs="[]"){return validateResult(target,std::string("{\"batches\":")+batches+",\"createdLayers\":"+layers+",\"createdDocuments\":"+docs+"}");};
 auto sequential=validate(R"([{"changes":[{"index":0,"before":1193046,"after":-1}]},{"changes":[{"index":0,"before":4294967295,"after":7}]}])");check((*sequential.pixels)[0]==7,"Sequential baseline/unsigned conversion broken");
 for(const auto* batches:{R"([{"changes":[{"index":0,"before":1,"after":2}]}])",R"([{"changes":[{"index":0,"before":1193046,"after":2},{"index":0,"before":2,"after":3}]}])",R"([{"changes":[{"index":0.5,"before":0,"after":2}]}])",R"([{"changes":[{"index":9,"before":0,"after":2}]}])",R"([{"changes":[],"operations":[{"path":"io.delete","arguments":{}}]}])",R"([{"changes":[{"index":0,"before":1193046,"after":2}]},{"changes":[{"index":1,"before":999,"after":3}]}])"})reject([&]{validate(batches);});
 check((*target.expected.pixels)[0]==0x00123456,"Late validation failure changed target");
 check(validate(R"([{"changes":[],"operations":[{"path":"ui.notify","arguments":{"text":"🌙/\n"}}]}])").pixels==target.expected.pixels,"Operation-only result copied raster unnecessarily");
 const char* created=R"([{"id":"new","name":"New","opacity":255,"frameNumber":1,"stackIndex":1,"surface":{"format":"rgba","width":1,"height":1,"offsetX":-2,"offsetY":3,"pixels":[-1]}}])";validate("[]",created);reject([&]{validate("[]",R"([{"id":"","name":"New","opacity":255,"frameNumber":1}])");});
 reject([&]{validate("[]","[]",R"([{"name":"Bad","width":1,"height":1,"colorMode":"rgba","layers":[]}])");});
 auto swap=JsonObject::Parse(LR"({"changes":[],"surfaceChange":{"before":{},"after":{"format":"rgba","width":1,"height":1,"offsetX":-7,"offsetY":8,"pixels":[42]}}})");auto before=JsonObject::Parse(LR"({"format":"rgba","width":3,"height":3,"offsetX":-2,"offsetY":3,"pixels":[1193046,0,0,0,0,0,0,0,4289449455]})");swap.GetNamedObject(L"surfaceChange").Insert(L"before",before);JsonArray swaps;swaps.Append(swap);auto replaced=validate(winrt::to_string(swaps.Stringify()).c_str());check(replaced.width==1&&replaced.x==-7&&(*replaced.pixels)[0]==42,"Surface replacement validation failed");
 swap.GetNamedArray(L"changes").Append(JsonObject{});reject([&]{validate(winrt::to_string(swaps.Stringify()).c_str());});
 // ECMAScript UTF16 budget includes quotes and excludes UTF8 byte expansion.
 {const auto limit=16*1024*1024;std::string prefix=R"([{"changes":[],"operations":[{"path":"ui.notify","arguments":")";std::string suffix=R"("}]}])";
  std::string text(limit-2,'a');check(validate((prefix+text+suffix).c_str()).pixels==target.expected.pixels,"Exact operation budget rejected");text+='a';reject([&]{validate((prefix+text+suffix).c_str());});}
 // All created layers must be checked even after valid raster transactions.
 auto duplicate=std::string(created);duplicate.pop_back();duplicate+=',';duplicate+=std::string(created).substr(1);reject([&]{validate("[]",duplicate.c_str());});
 auto locked=std::make_unique<Document>(3,3);locked->setLayerLocked(true);reject([&]{InvocationCapture fail(*locked,"null");});
 auto active=std::make_unique<Document>(3,3);active->beginStroke({0,0},0xff123456);reject([&]{InvocationCapture fail(*active,"null");});active->cancelStroke();
 auto bad=capture(*other,"{");reject([&]{runtime.startInvocation("capture.lua",std::move(bad)).get();});check(!runtime.startInvocation("capture.lua",capture(*other)).get().empty(),"Capture JSON error killed worker");
 std::cout<<"Lua document capture, budgets, target guards and worker execution passed\n";return 0;
 }catch(const winrt::hresult_error& e){std::cerr<<winrt::to_string(e.message());return 1;}catch(const std::exception& e){std::cerr<<e.what();return 1;}}
