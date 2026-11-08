#include "editor_implementation.h"
#include "editor.h"
#include "project_import.h"
#include "project_encode.h"
#include "recovery_store.h"
#include <fstream>
namespace moon::editor {
void Editor::smokeNativeSaveLifecycle(){
 smoke_=true;asyncSaveForSmoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;queuedSaves_.clear();
 auto check=[](bool value,const char* why){if(!value)throw std::runtime_error(why);};
 const auto root=assets_.parent_path()/"native-save-ui-owned"/(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));
 std::filesystem::create_directories(root);recoveryDirectory_=root/"recovery";runtimePreferences_.set("files.projectBackupEnabled","false");
 auto read=[](const std::filesystem::path& path){std::ifstream file(path,std::ios::binary);if(!file)throw std::runtime_error("Cannot read native save fixture");return std::make_shared<const project::Bytes>((std::istreambuf_iterator<char>(file)),std::istreambuf_iterator<char>());};
 auto open=[&](const std::filesystem::path& path){return project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(read(path))));};
 auto finish=[&]{const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(20);do{check(std::chrono::steady_clock::now()<until,"Native save lifecycle timeout");saveTick();if(saveWorker_.valid())saveWorker_.wait_for(std::chrono::milliseconds(1));}while(pending_==Pending::Saving||(pending_==Pending::None&&(!queuedSaves_.empty()||queuedSaveResume_!=Pending::None||queuedSaveClose_)));};
 // Only defer UI acknowledgement. The wrapped worker still performs the real
 // snapshot/encoder/atomic write; destruction always releases the gate on error.
 struct Gate {std::promise<void> promise;~Gate(){promise.set_value();}};
 auto hold=[&]{while(saveSnapshot_)saveTick();check(saveWorker_.valid(),"Native save did not dispatch worker");auto gate=std::make_unique<Gate>();auto wait=gate->promise.get_future().share();saveWorker_=std::async(std::launch::async,[prior=std::move(saveWorker_),wait]()mutable{auto result=prior.get();wait.wait();return result;});return gate;};
 auto dot=[&](int x,Pixel color){document.beginStroke({x,0},color);document.commitStroke();};
 auto seed=[&](const char* name){check(!recovery_.worker.valid()&&!saveWorker_.valid(),"Previous fixture worker still owned");RecoverySession empty;recovery_=std::move(empty);projects_.clear();activeProject_=0;document=Document::withBuiltinPalette(4,2,U"Native save");dot(0,0xff123456);document.setImportedSymmetryCenter({1.25,-2.75});documentPath_=root/name;documentOpen_=true;homeOpen_=false;pending_=Pending::None;queuedSaves_.clear();queuedSaveResume_=Pending::None;queuedSaveClose_=false;ensureProjects();refresh();};
 auto recovery=[&]{recovery_.ownedId="native-save-owned";recovery_.originId=recovery_.ownedId;recovery_.ownedIdentity=document.identity();project::writeRecoveryFiles(recoveryDirectory_,{recovery_.ownedId,"Native save","1"},*project::encodeRecoveryProject(document).bytes);};
 auto drainRecovery=[&]{if(recovery_.worker.valid())recovery_.worker.wait();auto preferences=recoveryPreferences_;preferences.enabled=false;const auto result=recovery_.tick(document,preferences,recoveryDirectory_,false);check(result.error.empty(),"Native save recovery cleanup failed");};
 auto originalChooser=chooseSaveFile_;
 try{
  seed("older.moonsprite");recovery();const auto path=documentPath_;const auto firstPixels=document.pixels();saveProject(false);auto gate=hold();dot(1,0xffabcdef);const auto currentPixels=document.pixels();const auto history=document.historySize(),revision=document.revision();gate.reset();finish();
  check(pending_==Pending::None&&document.dirty()&&documentPath_==path&&document.sourceArchive()&&*document.sourceArchive()==*read(path),"Older native write was reported failed or lost disk baseline");
  check(document.pixels()==currentPixels&&document.historySize()==history&&document.revision()==revision&&open(path).pixels()==firstPixels,"Older native acknowledgement replaced live edits/history");
  check(std::filesystem::exists(recoveryDirectory_/"native-save-owned.moonsprite")&&!recovery_.worker.valid()&&recovery_.originId=="native-save-owned","Older save removed recovery protection");
  auto old=open(path);check(old.symmetryCenter().x==1.25&&old.symmetryCenter().y==-2.75,"Worker snapshot quantized imported symmetry coordinates");
  saveProject(false);saveProject(false);saveProject(false);finish();drainRecovery();
  check(pending_==Pending::None&&!document.dirty()&&queuedSaves_.empty()&&open(path).pixels()==currentPixels&&recovery_.originId.empty()&&!std::filesystem::exists(recoveryDirectory_/"native-save-owned.moonsprite"),"Exact queued save failed to coalesce or clear its recovery");

  struct Mutation {const char* name;std::function<void()> apply;std::function<bool(const Document&)> persisted;};
  const std::vector<Mutation> metadata={
   {"symmetry",[&]{document.setSymmetryCenter({3,.5});},[](const Document& d){return d.symmetryCenter().x==3&&d.symmetryCenter().y==.5;}},
   {"pixel-grid",[&]{document.setPixelGrid(true);},[](const Document& d){return d.showPixelGrid();}},
   {"custom-grid",[&]{document.setCustomGrid(true,{1,-2,3,4});},[](const Document& d){return d.showCustomGrid()&&d.customGrid()==GridSettings{1,-2,3,4};}},
   {"animation-loop",[&]{document.setAnimationLoop(false);},[](const Document& d){return !d.animationLoop();}},
   {"palette-name",[&]{document.renamePaletteColor(document.palette().entries.front().id,U"Saved metadata");},[](const Document& d){return d.palette().entries.front().name==U"Saved metadata";}},
   {"recording-settings",[&]{auto& s=document.mutableTimelapseSettings();s.fps=23;s.speed=3;s.mode=timelapse::Mode::Full;document.markTimelapseModified();},[](const Document& d){const auto& s=d.timelapseSettings();return s.fps==23&&s.speed==3&&s.mode==timelapse::Mode::Full;}},
   {"reference-resource",[&]{document.addReferenceImage({"save-reference",1,1,std::make_shared<const std::vector<Pixel>>(1,0x00123456)});},[](const Document& d){return d.referenceImages().size()==1&&d.referenceImages()[0].pixels->at(0)==0x00123456;}},
   {"slice-metadata",[&]{document.createSlices({{1,0,2,1}});},[](const Document& d){return d.slices().size()==1&&d.slices()[0].rect==SliceRect{1,0,2,1};}}
  };
  for(const auto& mutation:metadata){
   seed((std::string(mutation.name)+".moonsprite").c_str());saveProject(false);gate=hold();const auto before=document.revision();mutation.apply();check(document.revision()!=before&&document.dirty(),mutation.name);const auto info=document.projectInformation();const auto currentHistory=document.historySize();saveProject(false);gate.reset();finish();auto result=open(documentPath_);
   check(pending_==Pending::None&&!document.dirty()&&queuedSaves_.empty()&&mutation.persisted(result),mutation.name);
   check(document.historySize()==currentHistory&&result.projectInformation().operationCount==info.operationCount&&result.projectInformation().strokeCount==info.strokeCount&&result.projectInformation().drawingTimeMs==info.drawingTimeMs,"Queued native save changed history/statistics");
  }
  seed("preview.moonsprite");saveProject(false);gate=hold();const auto previewRevision=document.revision();document.setSymmetryCenter({2,1},false);check(document.revision()==previewRevision,"Symmetry preview unexpectedly committed metadata");gate.reset();finish();
  check(pending_==Pending::None&&document.dirty()&&open(documentPath_).symmetryCenter().x==1.25,"Unrevisioned symmetry preview falsely accepted savepoint");saveProject(false);finish();check(!document.dirty()&&open(documentPath_).symmetryCenter().x==2,"Symmetry preview retry was not persisted");

  seed("save-as-source.moonsprite");const auto source=documentPath_,copy=root/"save-as-copy.moonsprite";saveProject(false);gate=hold();dot(2,0xff998877);saveProject(true);int choices=0;
  chooseSaveFile_=[&](OPENFILENAMEW* chooser){++choices;wcsncpy_s(chooser->lpstrFile,chooser->nMaxFile,copy.c_str(),_TRUNCATE);chooser->nFilterIndex=1;return true;};gate.reset();finish();
  check(pending_==Pending::None&&choices==1&&documentPath_==copy&&!document.dirty()&&open(source).pixels()[2]==0&&open(copy).pixels()==document.pixels(),"Queued native Save As was coalesced or captured the older generation");

  seed("failed.moonsprite");const auto failedPath=documentPath_;std::filesystem::create_directory(failedPath);recovery();const auto archive=document.sourceArchive();const auto projectId=document.projectId();saveProject(false);saveProject(false);finish();
  check(pending_==Pending::OpenError&&document.dirty()&&document.sourceArchive()==archive&&document.projectId()==projectId&&!queuedSaves_.empty()&&std::filesystem::is_directory(failedPath)&&std::filesystem::exists(recoveryDirectory_/"native-save-owned.moonsprite"),"Failed native commit changed baseline/recovery or discarded retry");
  resolve(false);documentPath_=root/"retry.moonsprite";finish();drainRecovery();check(pending_==Pending::None&&!document.dirty()&&open(documentPath_).pixels()==document.pixels(),"Native queued retry remained blocked by failed write");

  seed("close.moonsprite");const auto closing=documentPath_;pending_=Pending::CloseDocument;savePath(closing,true);gate=hold();dot(3,0xffaabbcc);const auto closePixels=document.pixels();gate.reset();finish();
  check(pending_==Pending::None&&!documentOpen_&&projects_.empty()&&open(closing).pixels()==closePixels,"Close resumed before the newer native generation was saved");
  chooseSaveFile_=std::move(originalChooser);asyncSaveForSmoke_=false;
  std::ofstream(root/"result.txt")<<"Native async old/exact generations, disk baseline, eight metadata families/statistics, fractional symmetry, preview race, queue/SaveAs/failure retry/recovery cleanup and close continuation passed. Real workers and atomic files; acknowledgement gated; no visual or live-edit-during-save UI acceptance claimed.\n";
 }catch(...){chooseSaveFile_=std::move(originalChooser);asyncSaveForSmoke_=false;throw;}
}
}
