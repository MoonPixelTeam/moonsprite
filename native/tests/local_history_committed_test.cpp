#include "local_history_hydration.h"
#include "local_history_committed.h"
#include "document.h"
#include "project_encode.h"
#include <filesystem>
#include <fstream>
#include <iostream>
#include <chrono>
#define CHECK(v) do{if(!(v))throw std::runtime_error("Committed capture check failed: " #v);}while(0)
namespace moon {
struct RasterHistoryFixture {
 static void run(Document& d){Document::Edit e{{},d.state_,d.nextState_};e.contentHistory.targetCelId=d.cel().id;e.contentHistory.runs.push_back({3,9,0,0x80443322});d.applyEdit(e,true);d.pushEdit(std::move(e),U"连续段😀");}
 static void dense(Document& d){Document::Edit e{{},d.state_,d.nextState_};e.contentHistory.targetCelId=d.cel().id;e.contentHistory.dense=Document::DensePixels{1,1,2,2,{0,0,0,0},{0xff010203,0x00010203,0x80445566,0xffffffff}};d.applyEdit(e,true);d.pushEdit(std::move(e),U"区域");}
 static void installSparse(Document& d){auto state=d.timeline_.state();auto& s=*state.cels.front().surface;s.width=3;s.height=2;s.offsetX=-1;s.offsetY=1;s.storageOriginX=-7;s.storageOriginY=9;s.pixels={0,0,0,0,0,0};d.timeline_=timeline::Timeline(std::move(state));}
 static void sparse(Document& d){Document::Edit e{{},d.state_,d.nextState_};e.contentHistory.targetCelId=d.cel().id;e.contentHistory.pixelAddress=Document::PixelAddressSpace{3,2,-7,9};e.pixels.push_back({4,0,0x12345678});d.applyEdit(e,true);d.pushEdit(std::move(e),U"稀疏原点");}
 static void inactive(Document& d){Document::Edit e{{},d.state_,d.nextState_};e.contentHistory.targetCelId=d.timeline_.state().cels.front().id;e.contentHistory.pixelAddress=Document::PixelAddressSpace{8,5,0,0};e.pixels.push_back({10,0,0xffabcdef});d.applyPixelEdit(e,true);d.pushEdit(std::move(e),U"后台帧");}
 static void overlap(Document& d,bool mapped=false){Document::Edit e{{},d.state_,d.nextState_};e.contentHistory.targetCelId=d.cel().id;e.contentHistory.runs={{5,3,0,0xff111111},{6,1,0xff111111,0xff222222}};if(mapped){e.contentHistory.pixelAddress=Document::PixelAddressSpace{7,4,-1,0};e.contentHistory.runs[0].index=8;e.contentHistory.runs[1].index=9;}d.applyEdit(e,true);d.pushEdit(std::move(e),U"重叠连续段");}
};
}
using namespace moon;
void write(const std::filesystem::path& path,const local_history::Data& data){std::ofstream out(path,std::ios::binary);out.write(reinterpret_cast<const char*>(data->data()),data->size());CHECK(bool(out));}
std::vector<Pixel> allPixels(const Document& d){std::vector<Pixel> result;for(const auto& cel:d.timeline().state().cels){const auto& pixels=d.timeline().resolveSurface(cel.id).surface->pixels;result.insert(result.end(),pixels.begin(),pixels.end());}return result;}
template<class F> void sample(const std::filesystem::path& root,const char* name,Document& d,F edit){
 const auto directory=root/name;std::filesystem::create_directories(directory);const auto before=project::encodeEditableProject(d).bytes;const auto beforePixels=allPixels(d);local_history::CommittedCapture ticket(d);const auto oldShape=local_history::documentShape(d);
 edit();if(local_history::documentShape(d)!=oldShape)throw std::runtime_error(std::string("Committed shape changed: ")+name+"\nbefore: "+oldShape+"\nafter: "+local_history::documentShape(d));const auto revision=d.historyRevision(),pixelRevision=d.contentRevision(),bytes=d.historyBytes();const auto* storage=d.timeline().resolveSurface(d.cel().id).surface->pixels.identity();
 auto delta=ticket.capture(d);CHECK(delta);
 const auto settled=local_history::CommittedCapture::latest(d,revision);CHECK(settled&&settled->json==delta->json&&settled->buffers.size()==delta->buffers.size());for(std::size_t i=0;i<delta->buffers.size();++i)CHECK(*settled->buffers[i].bytes==*delta->buffers[i].bytes);
 CHECK(!local_history::CommittedCapture::latest(d,revision-1));CHECK(d.historyRevision()==revision&&d.contentRevision()==pixelRevision&&d.historyBytes()==bytes&&d.timeline().resolveSurface(d.cel().id).surface->pixels.identity()==storage);
 const auto encoded=local_history::encodeDelta(*delta);CHECK(!encoded->empty());const auto after=project::encodeEditableProject(d).bytes;write(directory/"before.moonsprite",before);write(directory/"after.moonsprite",after);write(directory/"delta.zip",encoded);
 // Only committed patch bytes are retained; unrelated cels are never cloned.
 std::size_t retained=0;for(const auto& buffer:delta->buffers)retained+=buffer.bytes->size();CHECK(retained<4096);
 bool failed=false;auto limits=project::Limits{};limits.expandedBytes=1;try{ticket.capture(d,limits);}catch(const project::Error&){failed=true;}CHECK(failed);
 const auto afterPixels=allPixels(d);d.undo();if(allPixels(d)!=beforePixels)throw std::runtime_error(std::string("Native undo mismatch: ")+name);CHECK(!ticket.capture(d));d.redo();if(allPixels(d)!=afterPixels)throw std::runtime_error(std::string("Native redo mismatch: ")+name);CHECK(!ticket.capture(d));
 // Reopen the persisted delta into the existing native stack. Installation
 // must not paint, change view/dirty state, count an operation or capture video.
 const auto viewedFrame=d.frame().id,viewedLayer=d.layer().id;const auto beforeInstallRevision=d.contentRevision();const auto dirty=d.dirty();const auto operations=d.projectInformation().operationCount;
 unsigned restoredEvents=0;d.setHistoryChangeListener([&](const Document&,const HistoryStackChange&){++restoredEvents;});
 local_history::RestoreTicket restore(d);auto decoded=local_history::decodeDelta(encoded);
 CHECK(local_history::PixelHistory::install(d,restore,{decoded},1)==local_history::RestoreDecision::Ready);CHECK(restoredEvents==0);
 CHECK(d.historySize()==1&&d.historyPosition()==1&&d.dirty()==dirty&&d.contentRevision()==beforeInstallRevision&&d.projectInformation().operationCount==operations);
 for(int cycle=0;cycle<3;++cycle){d.undo();CHECK(allPixels(d)==beforePixels);CHECK(d.frame().id==viewedFrame&&d.layer().id==viewedLayer);d.redo();CHECK(allPixels(d)==afterPixels);CHECK(d.frame().id==viewedFrame&&d.layer().id==viewedLayer);}
 CHECK(restoredEvents==6);d.setHistoryChangeListener({});
 CHECK(local_history::PixelHistory::install(d,restore,{decoded},1)==local_history::RestoreDecision::LiveDocumentChanged);
 // Unsupported properties and a late invalid patch reject before replacing
 // any live history, including when previous patches were valid.
 local_history::RestoreTicket valid(d);auto invalid=decoded;invalid.json=R"({"label":"bad","patches":[{"path":["dirty"],"before":false,"after":true}],"origins":{"before":[],"after":[]}})";
 bool rejected=false;try{local_history::PixelHistory::install(d,valid,{decoded,invalid},1);}catch(...){rejected=true;}CHECK(rejected&&d.historySize()==1&&d.historyPosition()==1&&allPixels(d)==afterPixels);
 auto tiny=project::Limits{};tiny.expandedBytes=1;rejected=false;try{local_history::PixelHistory::install(d,valid,{decoded},1,{},tiny);}catch(const project::Error& e){rejected=e.kind==project::ErrorKind::Limit;}CHECK(rejected&&d.historySize()==1);
}
int wmain(int argc,wchar_t** argv){try{
 CHECK(argc==2);const std::filesystem::path fixtureRoot=argv[1];const auto runName=std::string("run-")+std::to_string(std::chrono::steady_clock::now().time_since_epoch().count());const auto root=fixtureRoot/runName;
 Document point(8,5);point.addFrame();point.addLayer();sample(root,"point",point,[&]{point.beginStroke({2,1},0x80332211);CHECK(point.commitStroke());});
 Document run(5,4);sample(root,"run",run,[&]{RasterHistoryFixture::run(run);});
 Document dense(5,4);sample(root,"dense",dense,[&]{RasterHistoryFixture::dense(dense);});
 Document sparse(8,8);RasterHistoryFixture::installSparse(sparse);sample(root,"sparse",sparse,[&]{RasterHistoryFixture::sparse(sparse);});
 // Legacy does not link an empty source. Seed it so this fixture exercises
 // actual shared pixels without expanding a blank 1x1 Cel during capture.
 Document linked(8,5);linked.beginStroke({0,0},0xffabcdef);CHECK(linked.commitStroke());const auto linkedSource=linked.cel().id;linked.addLinkedFrame(true);CHECK(linked.cel().linkedCelId==linkedSource);sample(root,"linked",linked,[&]{linked.beginStroke({3,2},0xff112233);CHECK(linked.commitStroke());});
 Document inactive(8,5);inactive.addFrame();const auto viewed=inactive.frame().id;sample(root,"inactive",inactive,[&]{RasterHistoryFixture::inactive(inactive);CHECK(inactive.frame().id==viewed);});
 Document overlap(5,4);sample(root,"overlap",overlap,[&]{RasterHistoryFixture::overlap(overlap);});
 Document mapped(5,4);sample(root,"overlap-mapped",mapped,[&]{RasterHistoryFixture::overlap(mapped,true);});
 Document structural(4,4);local_history::CommittedCapture add(structural);const auto shape=local_history::documentShape(structural);structural.addLayer();CHECK(shape!=local_history::documentShape(structural));CHECK(!add.capture(structural));
 local_history::CommittedCapture pending(structural);structural.beginStroke({1,1},0xff123456);CHECK(!pending.capture(structural));structural.cancelStroke();CHECK(!pending.capture(structural));
 local_history::CommittedCapture two(structural);structural.beginStroke({1,1},0xff123456);structural.commitStroke();structural.beginStroke({2,2},0xff123456);structural.commitStroke();CHECK(!two.capture(structural));
 local_history::CommittedCapture selection(structural);structural.commitSelection({},SelectionMask{0,0,1,1,{}});CHECK(!selection.capture(structural));
 Document other(4,4);CHECK(!two.capture(other));
 Document geometry(8,8);local_history::CommittedCapture expanded(geometry);RasterHistoryFixture::installSparse(geometry);RasterHistoryFixture::sparse(geometry);CHECK(!expanded.capture(geometry));
 Document preview(4,4);preview.beginStroke({1,1},0xff123456);local_history::CommittedCapture duringPreview(preview);preview.commitStroke();CHECK(!duringPreview.capture(preview));
 {std::ofstream latest(fixtureRoot/"latest.txt",std::ios::binary);latest<<runName;CHECK(bool(latest));}
 std::cout<<"Committed point/run/region/sparse/linked/inactive captures and structural/race guards passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
