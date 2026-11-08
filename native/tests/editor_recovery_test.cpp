#include "recovery_commit.h"
#include "project_file.h"
#include "raster_geometry.h"
#include <algorithm>
#include "editor_recovery.h"
#include "recovery_store.h"
#include "project_manifest.h"
#include "project_import.h"
#include "project_encode.h"
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <thread>
#include <windows.h>
namespace moon {struct RasterHistoryFixture {
 static void local(Document& d){auto state=d.timeline_.state();auto& s=*state.cels.front().surface;s.width=2;s.height=1;s.offsetX=-1;s.offsetY=2;s.storageOriginX=9;s.storageOriginY=-7;s.pixels={0x00030201,0xff123456};d.timeline_=timeline::Timeline(std::move(state));}
};}
using namespace moon;
#define CHECK(x) do{if(!(x))throw std::runtime_error(#x);}while(false)

namespace moon::project {
std::string crashCommitStage;
void commitCheckpoint(const char* stage){if(crashCommitStage==stage)ExitProcess(73);}
}
namespace {
std::wstring storeLockName(const std::filesystem::path& directory){
 HANDLE dir=CreateFileW(directory.c_str(),FILE_READ_ATTRIBUTES,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS,nullptr);CHECK(dir!=INVALID_HANDLE_VALUE);
 BY_HANDLE_FILE_INFORMATION info{};const auto ok=GetFileInformationByHandle(dir,&info);CloseHandle(dir);CHECK(ok);
 return L"Local\\MoonSprite.Recovery.v1-"+std::to_wstring(info.dwVolumeSerialNumber)+L"-"+std::to_wstring(info.nFileIndexHigh)+L"-"+std::to_wstring(info.nFileIndexLow);
}
struct Child {
 HANDLE process=nullptr;
 Child(const std::wstring& exe,const std::wstring& arguments){
  auto command=L"\""+exe+L"\" "+arguments;STARTUPINFOW startup{};startup.cb=sizeof(startup);PROCESS_INFORMATION info{};
  CHECK(CreateProcessW(exe.c_str(),command.data(),nullptr,nullptr,FALSE,CREATE_NO_WINDOW,nullptr,nullptr,&startup,&info));process=info.hProcess;CloseHandle(info.hThread);
 }
 Child(const Child&)=delete;Child& operator=(const Child&)=delete;
 Child(Child&& other)noexcept:process(other.process){other.process=nullptr;}
 ~Child(){if(process){if(WaitForSingleObject(process,0)==WAIT_TIMEOUT){TerminateProcess(process,91);WaitForSingleObject(process,5000);}CloseHandle(process);}}
 void completed(DWORD expected=0){CHECK(WaitForSingleObject(process,15000)==WAIT_OBJECT_0);DWORD status=0;CHECK(GetExitCodeProcess(process,&status)&&status==expected);}
};
int storeChild(int argc,wchar_t** argv){
 if(argc==4&&std::wstring(argv[1])==L"--abandon-store"){
  HANDLE mutex=CreateMutexW(nullptr,FALSE,argv[2]);CHECK(mutex&&WaitForSingleObject(mutex,5000)==WAIT_OBJECT_0);
  HANDLE ready=OpenEventW(EVENT_MODIFY_STATE,FALSE,argv[3]);CHECK(ready&&SetEvent(ready));ExitProcess(0); // Intentionally abandon this test-owned lock.
 }
 if(argc==4&&std::wstring(argv[1])==L"--crash-commit"){
  const std::filesystem::path directory=argv[2];const std::wstring stage=argv[3];project::crashCommitStage=std::string(stage.begin(),stage.end());
  std::ifstream in(directory/"next.bin",std::ios::binary);project::Bytes bytes(std::istreambuf_iterator<char>(in),{});CHECK(!bytes.empty());project::writeRecoveryFiles(directory,{"crash","new name","1900000000000"},bytes);throw std::runtime_error("Crash checkpoint not reached");
 }
 if(argc!=5||std::wstring(argv[1])!=L"--store-child")return -1;
 const std::filesystem::path directory=argv[2];const std::wstring action=argv[4];
 HANDLE ready=OpenEventW(EVENT_MODIFY_STATE,FALSE,argv[3]);CHECK(ready&&SetEvent(ready));CloseHandle(ready);
 if(action==L"write")project::writeRecoveryFiles(directory,{"shared","child","1"},{1,2,3});
 else if(action==L"remove")project::removeOwnedRecovery(directory,"shared");
 else if(action==L"list"){const auto rows=project::listRecoveryRecords(directory);CHECK(rows.size()==1&&rows.front().name=="parent");}
 else {
  const auto worker=std::stoi(action);for(int i=0;i<8;++i){const auto name="worker-"+std::to_string(worker)+"-"+std::to_string(i);project::Bytes data(256*1024);for(std::size_t j=0;j<data.size();++j)data[j]=name[j%name.size()];project::writeRecoveryFiles(directory,{"shared",name,std::to_string(i)},data);}
 }
 return 0;
}
void storeProcesses(const std::filesystem::path& root,const std::wstring& exe){
 const auto directory=std::filesystem::absolute(root/"cross-process");std::filesystem::create_directories(directory);
 const auto mutexName=storeLockName(directory);HANDLE mutex=CreateMutexW(nullptr,FALSE,mutexName.c_str());CHECK(mutex);
 struct Close {HANDLE value;~Close(){CloseHandle(value);}} closeMutex{mutex};
 const auto eventName=L"Local\\MoonSprite.Recovery.Test-"+std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64());
 HANDLE ready=CreateEventW(nullptr,TRUE,FALSE,eventName.c_str());CHECK(ready);Close closeEvent{ready};
 auto arguments=[&](const wchar_t* action){return L"--store-child \""+(directory/L".").wstring()+L"\" \""+eventName+L"\" "+action;};
 // Hold the exact production directory lock; each independent API must wait.
 for(const auto action:{L"write",L"remove",L"list"}){
  project::writeRecoveryFiles(directory,{"shared","parent","0"},{4,5,6});CHECK(WaitForSingleObject(mutex,5000)==WAIT_OBJECT_0);ResetEvent(ready);
  Child child(exe,arguments(action));CHECK(WaitForSingleObject(ready,5000)==WAIT_OBJECT_0);
  const auto blocked=WaitForSingleObject(child.process,120);ReleaseMutex(mutex);CHECK(blocked==WAIT_TIMEOUT);child.completed();
 }
 // Separate directories are independent, even while the original lock is held.
 CHECK(WaitForSingleObject(mutex,5000)==WAIT_OBJECT_0);auto independent=std::async(std::launch::async,[&]{project::writeRecoveryFiles(root/"independent-root",{"other","other","1"},{7});});const auto independentStatus=independent.wait_for(std::chrono::seconds(2));ReleaseMutex(mutex);independent.get();CHECK(independentStatus==std::future_status::ready);
 // Exiting process abandons ownership. Keep our handle alive so the next real
 // production operation observes WAIT_ABANDONED instead of a newly created lock.
 ResetEvent(ready);{Child child(exe,L"--abandon-store \""+mutexName+L"\" \""+eventName+L"\"");CHECK(WaitForSingleObject(ready,5000)==WAIT_OBJECT_0);child.completed();}
 project::writeRecoveryFiles(directory,{"shared","after-abandon","1"},{8,9});
 std::vector<Child> children;for(int i=0;i<4;++i)children.emplace_back(exe,arguments(std::to_wstring(i).c_str()));for(auto& child:children)child.completed();
 const auto rows=project::listRecoveryRecords(directory);CHECK(rows.size()==1);std::ifstream input(directory/"shared.moonsprite",std::ios::binary);project::Bytes data(std::istreambuf_iterator<char>(input),{});CHECK(data.size()==256*1024);for(std::size_t i=0;i<data.size();++i)CHECK(data[i]==rows.front().name[i%rows.front().name.size()]);
 // Old PID-only crash leftovers never block retry and must remain untouched.
 const auto leftover=directory/(L"retry.moonsprite."+std::to_wstring(GetCurrentProcessId())+L".tmp");{std::ofstream file(leftover,std::ios::binary);file<<"user evidence";}
 project::writeRecoveryFiles(directory,{"retry","retry","2"},{3,2,1});std::ifstream old(leftover,std::ios::binary);CHECK(std::string(std::istreambuf_iterator<char>(old),{})=="user evidence");
 // Actual sharing violation must keep the old committed pair and release the
 // process lock. Retrying after releasing the file uses a new private temp.
 HANDLE locked=CreateFileW((directory/"retry.moonsprite").c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);CHECK(locked!=INVALID_HANDLE_VALUE);
 bool rejected=false;try{project::writeRecoveryFiles(directory,{"retry","replacement","3"},{9,8,7});}catch(const std::exception&){rejected=true;}CloseHandle(locked);CHECK(rejected);
 const auto failed=project::listRecoveryRecords(directory);CHECK(std::any_of(failed.begin(),failed.end(),[](const auto& row){return row.id=="retry"&&row.name=="retry";}));
 {std::ifstream file(directory/"retry.moonsprite",std::ios::binary);CHECK(project::Bytes(std::istreambuf_iterator<char>(file),{})==project::Bytes({3,2,1}));}
 project::writeRecoveryFiles(directory,{"retry","replacement","3"},{9,8,7});const auto retried=project::listRecoveryRecords(directory);CHECK(std::any_of(retried.begin(),retried.end(),[](const auto& row){return row.id=="retry"&&row.name=="replacement";}));
 for(const auto& file:std::filesystem::directory_iterator(directory))if(file.path().extension()==L".tmp")CHECK(file.path()==leftover);
 std::cout<<"Cross-process write/delete/list serialization, independent roots, abandoned lock,32 paired commits and stale-temp retry passed\n";
 }
void storeCrashes(const std::filesystem::path& root,const std::wstring& exe){
 auto read=[](const std::filesystem::path& path){std::ifstream file(path,std::ios::binary);return project::Bytes(std::istreambuf_iterator<char>(file),{});};
 auto write=[](const std::filesystem::path& path,const project::Bytes& bytes){std::ofstream file(path,std::ios::binary);file.write(reinterpret_cast<const char*>(bytes.data()),std::streamsize(bytes.size()));CHECK(bool(file));};
 Document before(3,2),after(3,2);before.beginStroke({0,0},0xff0000ff);before.commitStroke();after.beginStroke({2,1},0xff00ff00);after.commitStroke();const auto oldBytes=project::encodeRecoveryProject(before).bytes,newBytes=project::encodeRecoveryProject(after).bytes;
 for(const auto stage:{L"descriptor",L"payload",L"metadata"})for(const bool existing:{false,true}){
  const auto directory=std::filesystem::absolute(root/(std::wstring(stage)+(existing?L"-existing":L"-new")));std::filesystem::create_directories(directory);
  if(existing)project::writeRecoveryFiles(directory,{"crash","old name","1700000000000"},*oldBytes);write(directory/"next.bin",*newBytes);
  {Child child(exe,L"--crash-commit \""+directory.wstring()+L"\" "+stage);child.completed(73);}
  const auto descriptor=read(directory/"crash.recovery-pending");CHECK(!descriptor.empty());const auto rows=project::listRecoveryRecords(directory);CHECK(read(directory/"crash.recovery-pending")==descriptor);
  if(std::wstring(stage)==L"descriptor"){
   CHECK(rows.size()==(existing?1:0));if(existing)CHECK(rows.front().name=="old name"&&read(directory/"crash.moonsprite")==*oldBytes);CHECK(!project::readPendingRecoveryRecord(directory/"crash.moonsprite","crash"));
  }else{
   CHECK(rows.size()==1&&rows.front().name=="new name"&&rows.front().updatedAt=="1900000000000");CHECK(read(directory/"crash.moonsprite")==*newBytes);
   const auto imported=project::prepareEditableImport(project::readProjectManifest(std::make_shared<const project::Bytes>(read(directory/"crash.moonsprite"))));CHECK(imported.timeline.cels[0].surface->pixels[5]==0xff00ff00);
   CHECK(project::readPendingRecoveryRecord(directory/"crash.moonsprite","crash")->name=="new name");
   auto invalid=descriptor;invalid[16]^=1;write(directory/"crash.recovery-pending",invalid);CHECK(!project::readPendingRecoveryRecord(directory/"crash.moonsprite","crash"));CHECK(read(directory/"crash.recovery-pending")==invalid);write(directory/"crash.recovery-pending",descriptor);
  }
  if(existing&&std::wstring(stage)==L"payload"){
   // A second crash before the next payload must not erase the first crash's
   // only matching new description. Replay reconciles it before replacing it.
   write(directory/"next.bin",*oldBytes);{Child child(exe,L"--crash-commit \""+directory.wstring()+L"\" descriptor");child.completed(73);}
   const auto again=project::listRecoveryRecords(directory);CHECK(again.size()==1&&again.front().name=="new name"&&read(directory/"crash.moonsprite")==*newBytes);CHECK(!project::readPendingRecoveryRecord(directory/"crash.moonsprite","crash"));
   const auto metadata=read(directory/"crash.json");CHECK(project::decodeRecoveryRecord(std::string(metadata.begin(),metadata.end())).name=="new name");
  }
  project::writeRecoveryFiles(directory,{"crash","retry","2000000000000"},*newBytes);CHECK(!std::filesystem::exists(directory/"crash.recovery-pending"));CHECK(project::listRecoveryRecords(directory).front().name=="retry");project::removeOwnedRecovery(directory,"crash");CHECK(project::listRecoveryRecords(directory).empty());
 }
 std::cout<<"Six real process exits at descriptor/payload/metadata commits, byte-preserving discovery, mismatch rejection, reopen/retry/discard passed\n";
}
}

int wmain(int argc,wchar_t** argv){try{
 const auto childResult=storeChild(argc,argv);if(childResult>=0)return childResult;
 if(argc!=2)throw std::runtime_error("Owned fixture directory required");
 const std::filesystem::path root=std::filesystem::path(argv[1])/("run-"+std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));std::filesystem::create_directories(root);
 storeProcesses(root,std::filesystem::absolute(argv[0]).wstring());
 storeCrashes(root,std::filesystem::absolute(argv[0]).wstring());
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
 {const auto payload=project::encodeRecoveryProject(first);std::vector<std::future<void>> writers;for(int i=0;i<8;++i)writers.push_back(std::async(std::launch::async,[&,i]{project::writeRecoveryFiles(root,{"shared-origin","shared",std::to_string(i)},*payload.bytes);}));for(auto& writer:writers)writer.get();CHECK(std::filesystem::exists(root/"shared-origin.moonsprite")&&std::filesystem::exists(root/"shared-origin.json"));project::removeOwnedRecovery(root,"shared-origin");}
 auto read=[&](const char* name){std::ifstream in(root/name,std::ios::binary);auto bytes=std::make_shared<project::Bytes>(std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>());return project::prepareEditableImport(project::readProjectManifest(bytes));};
 const auto savedFirst=read("first.moonsprite"),savedSecond=read("second.moonsprite");
 CHECK(savedFirst.width==3&&savedFirst.height==2&&savedFirst.timeline.cels[0].surface->pixels[4]==0xff123456);
 CHECK(savedSecond.width==2&&savedSecond.height==3&&savedSecond.timeline.cels[0].surface->pixels[4]==0xff654321);
 editor::RecoverySession restored;restored.originId="source-recovery";restored.ownedId="source-recovery";restored.ownedIdentity=first.identity();settle(restored,first);CHECK(project::listRecoveryRecords(root).size()==3&&std::filesystem::exists(root/"source-recovery.moonsprite"));restored.suppressed=true;project::removeOwnedRecovery(root,"source-recovery");first.beginStroke({0,0},0xffabcdef);first.commitStroke();settle(restored,first);CHECK(!std::filesystem::exists(root/"source-recovery.moonsprite")&&!restored.worker.valid());
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
 // GAP-015: payload commit survives missing, corrupt or mismatched sidecars.
 const auto orphans=root/"orphan-discovery";std::filesystem::create_directories(orphans);
 const auto archive=project::encodeRecoveryProject(first);
 auto write=[&](const std::filesystem::path& file,const project::Bytes& data){std::ofstream out(file,std::ios::binary);out.write(reinterpret_cast<const char*>(data.data()),std::streamsize(data.size()));CHECK(bool(out));};
 auto readBytes=[&](const std::filesystem::path& file){std::ifstream in(file,std::ios::binary);return project::Bytes(std::istreambuf_iterator<char>(in),{});};
 for(const auto id:{"missing","corrupt","mismatch","valid","truncated"})write(orphans/(std::string(id)+".moonsprite"),std::string(id)=="truncated"?project::Bytes{1,2,3}:*archive.bytes);
 const auto metadata=project::encodeRecoveryRecord({"valid","original name","1700000000000"});
 write(orphans/"valid.json",project::Bytes(metadata.begin(),metadata.end()));
 write(orphans/"corrupt.json",{1,2,3});write(orphans/"mismatch.json",project::Bytes(metadata.begin(),metadata.end()));
 write(orphans/"unsafe name.moonsprite",*archive.bytes);write(orphans/"ignored.moonsprite.tmp",*archive.bytes);std::filesystem::create_directory(orphans/"directory.json");
 const auto absent=project::encodeRecoveryRecord({"absent","missing payload","1800000000000"});write(orphans/"absent.json",project::Bytes(absent.begin(),absent.end()));
 const auto rows=project::listRecoveryRecords(orphans);CHECK(rows.size()==6);
 for(const auto id:{"missing","corrupt","mismatch","valid","truncated","absent"}){
  const auto row=std::find_if(rows.begin(),rows.end(),[&](const auto& r){return r.id==id;});CHECK(row!=rows.end());
  if(std::string(id)=="valid"){CHECK(row->name=="original name"&&row->updatedAt=="1700000000000");}
  else if(std::string(id)!="absent"){CHECK(row->name==id&&std::stoull(row->updatedAt)>1700000000000ULL);}
 }
 CHECK(!std::filesystem::exists(orphans/"missing.json")&&readBytes(orphans/"corrupt.json")==project::Bytes({1,2,3})&&readBytes(orphans/"mismatch.json")==project::Bytes(metadata.begin(),metadata.end()));
 CHECK(readBytes(orphans/"missing.moonsprite")==*archive.bytes);
 // Normal decoder can reopen the discovered payload, with no synthetic archive.
 CHECK(project::prepareEditableImport(project::readProjectManifest(std::make_shared<const project::Bytes>(readBytes(orphans/"missing.moonsprite")))).width==first.width());
 // Force a real second-stage commit failure after the payload is flushed.
 std::filesystem::create_directory(orphans/"interrupted.json");
 bool commitFailed=false;try{project::writeRecoveryFiles(orphans,{"interrupted","draft","1900000000000"},*archive.bytes);}catch(const std::exception&){commitFailed=true;}
 CHECK(commitFailed&&readBytes(orphans/"interrupted.moonsprite")==*archive.bytes);
 auto interrupted=project::listRecoveryRecords(orphans);CHECK(interrupted.size()==7&&std::any_of(interrupted.begin(),interrupted.end(),[](const auto& r){return r.id=="interrupted";}));
 std::filesystem::remove(orphans/"interrupted.json");project::removeOwnedRecovery(orphans,"interrupted");
 project::removeOwnedRecovery(orphans,"missing");CHECK(!std::filesystem::exists(orphans/"missing.moonsprite")&&project::listRecoveryRecords(orphans).size()==5);
 project::writeRecoveryFiles(orphans,{"corrupt","repaired by autosave","1900000000000"},*archive.bytes);const auto repaired=project::listRecoveryRecords(orphans);CHECK(repaired.size()==5&&std::any_of(repaired.begin(),repaired.end(),[](const auto& r){return r.id=="corrupt"&&r.name=="repaired by autosave";}));
 // Snapshot identity mismatch cancels before a ticket can write a new document.
 editor::RecoverySession stale;stale.identity=first.identity();stale.ownedId="stale";stale.snapshot.emplace(first,"stale");stale.queue.request({"stale","",first.revision(),first.contentRevision(),true,true});stale.ticket=stale.queue.next();settings.enabled=false;
 stale.tick(second,settings,root,false);CHECK(!stale.ticket&&!stale.snapshot&&!stale.worker.valid());
 std::cout<<"Independent document recovery, persisted pixels and stale snapshot cancellation passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
