#include "project_file.h"
#include "raster_geometry.h"
#include <algorithm>
#include "editor_recovery.h"
#include "recovery_store.h"
#include "project_manifest.h"
#include "project_import.h"
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <thread>
namespace moon {struct RasterHistoryFixture {
 static void local(Document& d){auto state=d.timeline_.state();auto& s=*state.cels.front().surface;s.width=2;s.height=1;s.offsetX=-1;s.offsetY=2;s.storageOriginX=9;s.storageOriginY=-7;s.pixels={0x00030201,0xff123456};d.timeline_=timeline::Timeline(std::move(state));}
};}
using namespace moon;
#define CHECK(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
int wmain(int argc,wchar_t** argv){try{
 if(argc!=2)throw std::runtime_error("Owned fixture directory required");
 const std::filesystem::path root(argv[1]);std::filesystem::create_directories(root);
 Document first(3,2),second(2,3);first.beginStroke({1,1},0xff123456);first.commitStroke();second.beginStroke({0,2},0xff654321);second.commitStroke();
 const auto identity=first.identity(),revision=first.revision(),history=first.historySize();const auto pixels=first.pixels();
 editor::RecoverySession a,b;recovery::Preferences settings;
 a.ownedId="first";a.ownedIdentity=first.identity();b.ownedId="second";b.ownedIdentity=second.identity();
 auto settle=[&](editor::RecoverySession& session,Document& d){
  const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(10);
  do{const auto result=session.tick(d,settings,root,true);CHECK(result.error.empty());if(session.worker.valid())session.worker.wait();
   if(!session.worker.valid()&&!session.snapshot&&!session.ticket)return;
  }while(std::chrono::steady_clock::now()<deadline);
  throw std::runtime_error("Recovery did not settle");
 };
 settle(a,first);settle(b,second);
 CHECK(first.identity()==identity&&first.revision()==revision&&first.historySize()==history&&first.pixels()==pixels);
 auto records=project::listRecoveryRecords(root);CHECK(records.size()==2);
 auto read=[&](const char* name){std::ifstream in(root/name,std::ios::binary);auto bytes=std::make_shared<project::Bytes>(std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>());return project::prepareEditableImport(project::readProjectManifest(bytes));};
 const auto savedFirst=read("first.moonsprite"),savedSecond=read("second.moonsprite");
 CHECK(savedFirst.width==3&&savedFirst.height==2&&savedFirst.timeline.cels[0].surface->pixels[4]==0xff123456);
 CHECK(savedSecond.width==2&&savedSecond.height==3&&savedSecond.timeline.cels[0].surface->pixels[4]==0xff654321);
 // Production recovery round trip retains local owners and links before editing.
 Document sparse(3,3);sparse.beginStroke({0,0},0xffabcdef);sparse.commitStroke();const auto sparseOwner=sparse.cel().id;sparse.addLinkedFrame(true);const auto sparseAlias=sparse.cel().id,sparseFrame=sparse.frame().id,sparseLayer=sparse.layer().id;RasterHistoryFixture::local(sparse);
 const auto sparseRevision=sparse.revision(),sparseContent=sparse.contentRevision(),sparseHistory=sparse.historySize();const auto sparsePixels=sparse.pixels();
 editor::RecoverySession local;local.ownedId="local-owner";local.ownedIdentity=sparse.identity();settle(local,sparse);
 CHECK(sparse.revision()==sparseRevision&&sparse.contentRevision()==sparseContent&&sparse.historySize()==sparseHistory&&sparse.pixels()==sparsePixels&&sparse.dirty());
 auto reopen=[&](const char* filename){
  std::ifstream in(root/filename,std::ios::binary);CHECK(bool(in));auto bytes=std::make_shared<project::Bytes>(std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>());auto imported=project::prepareEditableImport(project::readProjectManifest(bytes));PaletteState palette;palette.entries.clear();palette.slots=imported.palette.slots;palette.nextId=imported.palette.nextId;palette.columns=imported.palette.columns;for(auto& entry:imported.palette.entries)palette.entries.push_back({entry.id,std::move(entry.name),entry.color});
  auto d=Document::fromImported(imported.width,imported.height,std::move(imported.timeline),std::move(palette),std::move(imported.id),std::move(imported.name),imported.sourceArchive);d.setImportedProjectBrushes(std::move(imported.customBrushes));d.selectLayer(imported.activeLayerId);d.selectFrame(imported.activeFrameId);d.setImportedLoop(imported.loop);d.setPixelGrid(imported.showPixelGrid,false);d.setCustomGrid(imported.showCustomGrid,imported.customGrid,false);if(imported.symmetryCenter)d.setSymmetryCenter({imported.symmetryCenter->first,imported.symmetryCenter->second},false);return d;
 };
 auto recovered=reopen("local-owner.moonsprite");
 auto checkOwner=[&](const Document& d,Pixel ink,int geometry){
  const auto owner=d.timeline().resolveSurface(sparseOwner),alias=d.timeline().resolveSurface(sparseAlias);CHECK(owner.issue==timeline::LinkIssue::None&&alias.issue==timeline::LinkIssue::None&&owner.source&&alias.source&&owner.surface&&alias.surface);CHECK(owner.source->id==sparseOwner&&alias.source->id==sparseOwner&&owner.surface==alias.surface);CHECK(d.timeline().findCelById(sparseAlias)->linkedCelId==std::optional<std::string>{sparseOwner});const auto& s=*owner.surface;
  CHECK(s.offsetX==-1&&s.storageOriginX.value_or(0)==0);std::vector<Pixel> expected;
  if(geometry==0){CHECK(s.width==2&&s.height==1&&s.offsetY==2&&s.storageOriginY.value_or(0)==0);expected={0x00030201,ink};}
  else{CHECK(s.width==4&&s.height==3&&s.offsetY==0&&s.storageOriginY.value_or(0)==(geometry==1?-2:0));expected.assign(12,0);expected[8]=0x00030201;expected[9]=ink;}
  CHECK(s.pixels==expected&&raster::readWorld(s,-1,2)==0x00030201&&raster::readWorld(s,0,2)==ink);CHECK(d.layer().id==sparseLayer&&d.frame().id==sparseFrame&&d.width()==3&&d.height()==3);
 };
 checkOwner(recovered,0xff123456,0);CHECK(!recovered.dirty()&&recovered.historySize()==0&&!recovered.projectId().empty()&&recovered.sourceArchive());const auto recoveredName=recovered.name()+U"（恢复）";const auto recoveredRevision=recovered.revision(),recoveredContent=recovered.contentRevision();recovered.markRecovered(recoveredName);CHECK(recovered.dirty()&&recovered.name()==recoveredName&&recovered.historySize()==0&&recovered.revision()==recoveredRevision&&recovered.contentRevision()==recoveredContent);
 recovered.beginStroke({0,2},0xff654321);CHECK(recovered.commitStroke());CHECK(recovered.historySize()==1&&recovered.dirty());checkOwner(recovered,0xff654321,1);recovered.undo();checkOwner(recovered,0xff123456,1);CHECK(recovered.dirty());recovered.redo();checkOwner(recovered,0xff654321,1);
 const auto recoveredHistory=recovered.historySize();project::saveDocumentAtomic(recovered,root/"local-owner-resaved.moonsprite");CHECK(!recovered.dirty()&&recovered.historySize()==recoveredHistory);auto savedRecovery=reopen("local-owner-resaved.moonsprite");checkOwner(savedRecovery,0xff654321,2);CHECK(!savedRecovery.dirty()&&savedRecovery.historySize()==0&&savedRecovery.name()==recoveredName&&savedRecovery.projectId()==recovered.projectId());
 const auto preserved=project::listRecoveryRecords(root);CHECK(std::any_of(preserved.begin(),preserved.end(),[](const auto& r){return r.id=="local-owner";}));CHECK(std::filesystem::exists(root/"local-owner.moonsprite"));
 // Snapshot identity mismatch cancels before a ticket can write a new document.
 editor::RecoverySession stale;stale.identity=first.identity();stale.ownedId="stale";stale.snapshot.emplace(first,"stale");stale.queue.request({"stale","",first.revision(),first.contentRevision(),true,true});stale.ticket=stale.queue.next();settings.enabled=false;
 stale.tick(second,settings,root,false);CHECK(!stale.ticket&&!stale.snapshot&&!stale.worker.valid());
 std::cout<<"Independent document recovery, persisted pixels and stale snapshot cancellation passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
