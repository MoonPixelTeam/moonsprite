#include "editor_implementation.h"
#include "editor.h"
#include "project_import.h"
#include "project_encode.h"
#include "recovery_store.h"
#include "layer_panel_state_json.h"
#include "document_save_policy.h"
#include "image_decode.h"
#include "image_export.h"
#include <fstream>
namespace moon::editor {
void Editor::smokeNativeSaveLifecycle(){
 smoke_=true;asyncSaveForSmoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;queuedSaves_.clear();
 auto check=[](bool value,const char* why){if(!value)throw std::runtime_error(why);};
 const auto root=assets_.parent_path()/"native-save-ui-owned"/(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));
 std::filesystem::create_directories(root);recoveryDirectory_=root/"recovery";runtimePreferences_.set("files.projectBackupEnabled","false");
 auto read=[](const std::filesystem::path& path){std::ifstream file(path,std::ios::binary);if(!file)throw std::runtime_error("Cannot read native save fixture");return std::make_shared<const project::Bytes>((std::istreambuf_iterator<char>(file)),std::istreambuf_iterator<char>());};
 auto open=[&](const std::filesystem::path& path){return project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(read(path))));};
 auto finish=[&]{const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(20);do{check(std::chrono::steady_clock::now()<until,"Native save lifecycle timeout");saveTick();if(saveWorker_.valid())saveWorker_.wait_for(std::chrono::milliseconds(1));else std::this_thread::sleep_for(std::chrono::milliseconds(1));}while(pending_==Pending::Saving||(pending_==Pending::None&&(!backgroundSaves_.empty()||!deferredSaveCloses_.empty()||closeAfterBackgroundSaves_||!queuedSaves_.empty()||queuedSaveResume_!=Pending::None||queuedSaveClose_)));};
 // Only defer UI acknowledgement. The wrapped worker still performs the real
 // snapshot/encoder/atomic write; destruction always releases the gate on error.
 struct Gate {std::promise<void> promise;~Gate(){promise.set_value();}};
 auto hold=[&]{while(saveSnapshot_)saveTick();check(saveWorker_.valid(),"Native save did not dispatch worker");auto gate=std::make_unique<Gate>();auto wait=gate->promise.get_future().share();saveWorker_=std::async(std::launch::async,[prior=std::move(saveWorker_),wait]()mutable{auto result=prior.get();wait.wait();return result;});return gate;};
 auto dot=[&](int x,Pixel color){document.beginStroke({x,0},color);document.commitStroke();};
 auto seed=[&](const char* name){check(!recovery_.worker.valid()&&!saveWorker_.valid()&&backgroundSaves_.empty()&&deferredSaveCloses_.empty(),"Previous fixture worker still owned");RecoverySession empty;recovery_=std::move(empty);projects_.clear();activeProject_=0;document=Document::withBuiltinPalette(4,2,U"Native save");dot(0,0xff123456);document.setImportedSymmetryCenter({1.25,-2.75});documentPath_=root/name;documentOpen_=true;homeOpen_=false;pending_=Pending::None;queuedSaves_.clear();queuedSaveResume_=Pending::None;queuedSaveClose_=false;ensureProjects();refresh();};
 auto recovery=[&]{recovery_.ownedId="native-save-owned";recovery_.originId=recovery_.ownedId;recovery_.ownedIdentity=document.identity();project::writeRecoveryFiles(recoveryDirectory_,{recovery_.ownedId,"Native save","1"},*project::encodeRecoveryProject(document).bytes);};
 auto drainRecovery=[&]{if(recovery_.worker.valid())recovery_.worker.wait();auto preferences=recoveryPreferences_;preferences.enabled=false;const auto result=recovery_.tick(document,preferences,recoveryDirectory_,false);check(result.error.empty(),"Native save recovery cleanup failed");};
 auto originalChooser=chooseSaveFile_;
 auto originalDecision=asepriteSaveDecisionForSmoke_;
 try{
  if(std::wstring(GetCommandLineW()).find(L"--backup-save-check")!=std::wstring::npos){
   // Keep this independent fixture frame off the already large general suite.
   std::function<void()> backupCheck=[&]{
   runtimePreferences_.set("files.saveOriginalFormat","true");runtimePreferences_.set("files.saveFormat.Select","0");
   int choices=0,confirmations=0;asepriteSaveDecisionForSmoke_=[&](bool,const auto&){++confirmations;return 2;};
   auto choose=[&](const std::filesystem::path& path,unsigned filter=1){chooseSaveFile_=[&,path,filter](OPENFILENAMEW* chooser){++choices;wcsncpy_s(chooser->lpstrFile,chooser->nMaxFile,path.c_str(),_TRUNCATE);chooser->nFilterIndex=filter;return true;};};
   auto cancel=[&]{chooseSaveFile_=[&](OPENFILENAMEW*){++choices;return false;};};
   Document original=Document::withBuiltinPalette(4,2,U"Archive internal name");original.beginStroke({0,0},0xff123456);original.commitStroke();original.setFrameDuration(43);original.addFrame(true);original.setFrameDuration(217);original.setImportedSymmetryCenter({1.25,-2.75});original.addReferenceImage({"backup-reference",1,1,std::make_shared<const std::vector<Pixel>>(1,0x00123456)});
   const auto encoded=project::encodeEditableProject(original);const auto backup=root/"Recovered.MOONSPRITE.BAK";writeExportBytesAtomic(backup,*encoded.bytes);const auto originalBytes=*read(backup);
   auto unchanged=[&]{check(*read(backup)==originalBytes,"Ordinary save changed original backup bytes");};
   auto loadBackup=[&]{seed("backup-sentinel.moonsprite");document.markSaved();openPath(backup);check(pending_==Pending::None&&documentPath_.empty()&&document.sourceFilePath().empty()&&!document.dirty()&&!document.canUndo()&&document.name()==U"Recovered.MOONSPRITE","Backup open path/name/clean history");check(document.pixels()==original.pixels()&&document.timeline().state().frames.size()==2&&document.timeline().state().frames.back().duration==217&&document.referenceImages().size()==1&&document.referenceImages()[0].pixels->at(0)==0x00123456,"Backup open lost pixels, frames or reference resource");unchanged();};
   loadBackup();const auto openedId=document.identity();const auto tabs=projects_.size();openPath(backup);check(document.identity()==openedId&&projects_.size()==tabs,"Backup project ID did not deduplicate open");
   const auto history=document.historySize();cancel();check(!saveProject(false)&&choices==1&&confirmations==0&&documentPath_.empty()&&document.sourceFilePath().empty()&&!document.dirty()&&document.historySize()==history,"Clean backup Save skipped chooser or mutated identity/history");unchanged();
   // The actual Save menu and shortcut enter the same guarded target policy.
   requestFocus();ui::KeyMessage saveKey(ui::kKeyDownMessage,ui::kKeyS,ui::kKeyCtrlModifier,0,0);check(routeShortcutMessage(&saveKey)==1&&choices==2,"Backup Ctrl+S bypassed target chooser");
   dot(1,0xffabcdef);const auto edited=document.pixels();const auto destination=root/"backup-saved.moonsprite";choose(destination);menuItems_.at("save")->Click();finish();
   check(pending_==Pending::None&&!document.dirty()&&documentPath_==destination&&open(destination).pixels()==edited&&open(destination).referenceImages().size()==1&&open(destination).symmetryCenter().y==-2.75,"Backup native save/reopen lost document data");unchanged();
   const int afterSave=choices;dot(2,0xff998877);const auto latest=document.pixels();cancel();saveProject(false);finish();check(choices==afterSave&&!document.dirty()&&open(destination).pixels()==latest,"Saved backup copy still requested target chooser");unchanged();
   // Save As preserves the first saved copy and does not return to the backup.
   const auto copy=root/"backup-copy.moonsprite";choose(copy);saveProject(true);finish();check(documentPath_==copy&&open(copy).pixels()==latest&&open(destination).pixels()==latest,"Backup Save As identity or original copy");unchanged();
   loadBackup();dot(2,0xff556677);const auto identity=document.identity();const auto failedPixels=document.pixels();const auto failed=root/"blocked.moonsprite";std::filesystem::create_directory(failed);choose(failed);saveProject(false);finish();check(pending_==Pending::OpenError&&document.identity()==identity&&document.dirty()&&documentPath_.empty()&&document.sourceFilePath().empty()&&document.pixels()==failedPixels&&std::filesystem::is_directory(failed),"Failed backup save changed identity/savepoint");unchanged();resolve(false);
   choose(root/"backup-retry.moonsprite");saveProject(false);finish();check(pending_==Pending::None&&!document.dirty()&&open(documentPath_).pixels()==failedPixels,"Backup failed save retry");unchanged();
   loadBackup();dot(3,0xff778899);const auto closeIdentity=document.identity();const auto closePixels=document.pixels();ask(Pending::CloseDocument);check(pending_==Pending::CloseDocument,"Dirty backup close omitted confirmation");cancel();saveBeforeClose_->Click();check(pending_==Pending::CloseDocument&&document.identity()==closeIdentity&&document.dirty()&&saveProjectIndex(closeIdentity).has_value(),"Canceled save-before-close discarded backup document");unchanged();
   const auto closing=root/"backup-close.moonsprite";choose(closing);saveBeforeClose_->Click();finish();check(pending_==Pending::None&&!saveProjectIndex(closeIdentity)&&open(closing).pixels()==closePixels,"Save-before-close did not await actual backup write");unchanged();
   // With no valid direct target, original-format preference uses the configured
   // default; disabling it requests native directly without a redundant prompt.
   for(bool originalFormat:{true,false})for(int preferred:{0,1,8}){
    loadBackup();runtimePreferences_.set("files.saveOriginalFormat",originalFormat?"true":"false");runtimePreferences_.set("files.saveFormat.Select",std::to_string(preferred));
    const auto expected=originalFormat?preferredSaveImageFormat(preferred):SaveImageFormat::Native;const auto before=confirmations;
    chooseSaveFile_=[&](OPENFILENAMEW* chooser){++choices;check(chooser->nFilterIndex==(expected==SaveImageFormat::Png?4u:expected==SaveImageFormat::Aseprite?2u:1u),"Backup default format chooser mismatch");check(std::filesystem::path(chooser->lpstrFile).extension()==saveImageExtension(expected),"Backup initial name has wrong format suffix");return false;};
    check(!saveProject(false)&&documentPath_.empty()&&document.sourceFilePath().empty()&&!document.dirty(),"Canceled backup preferred-format save changed state");check(originalFormat||confirmations==before,"No-target save showed redundant project confirmation");unchanged();
   }
   runtimePreferences_.set("files.saveOriginalFormat","true");runtimePreferences_.set("files.saveFormat.Select","0");
   // Save As to another encoder still changes the saved identity, never backup.
   loadBackup();const auto png=root/"backup-export.png";choose(png,4);saveProject(true);finish();check(pending_==Pending::None&&!document.dirty()&&documentPath_==png&&openRasterImage(png).pixels()==original.pixels(),"Backup PNG Save As path/pixels");unchanged();
   for(const auto* invalid:{L"synthetic.unknown",L"synthetic.moonsprite.bak"}){loadBackup();documentPath_=root/invalid;document.setSourceFilePath(destination);cancel();const int before=choices;check(!saveProject(false)&&choices==before+1,"Invalid saved target fell back to source");check(open(destination).pixels()==latest,"Invalid saved target overwrote original source");unchanged();}
   // GIF signature has priority over the project-backup extension. Opening it
   // still clears both paths and uses the filename without only the final .bak.
   seed("gif-sentinel.moonsprite");document.markSaved();const auto gifBackup=root/"Animation.moonsprite.bak";const auto gifBytes=encodeSaveImage(original,SaveImageFormat::Gif);writeExportBytesAtomic(gifBackup,gifBytes);openPath(gifBackup);
   check(pending_==Pending::None&&documentPath_.empty()&&document.sourceFilePath().empty()&&document.name()==U"Animation.moonsprite"&&!document.dirty()&&!document.canUndo()&&document.timeline().state().frames.size()==2&&document.timeline().state().frames.back().duration==220,"GIF-signature backup identity/timing");
   const auto gifPixels=document.pixels();choose(root/"gif-backup-saved.moonsprite");saveProject(false);finish();check(pending_==Pending::None&&!document.dirty()&&open(documentPath_).pixels()==gifPixels&&open(documentPath_).timeline().state().frames.size()==2&&*read(gifBackup)==gifBytes,"GIF backup native save/reopen mutated source");unchanged();
   chooseSaveFile_=std::move(originalChooser);asepriteSaveDecisionForSmoke_=std::move(originalDecision);asyncSaveForSmoke_=false;
   std::ofstream(root/"backup-result.txt")<<"Backup archive/GIF signature identity, clean history, duplicate open, clean cancel/CtrlS/menu, native/PNG SaveAs/reopen, ordinary save after copy, failure/retry, close cancel/save completion, default format matrix and invalid saved priority passed. Original backup bytes unchanged. Real editor/loader/encoder/atomic writer; chooser callback injected.\n";
   };backupCheck();return;
  }
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

  seed("panel-state.moonsprite");document.addLayer();check(document.createLayerGroup(),"Panel fixture group missing");const auto group=document.timeline().state().groups.front().id;auto panel=document.layerPanelState();panel.selectedLayerIds.clear();for(const auto& layer:document.timeline().state().layers)panel.selectedLayerIds.push_back(layer.id);panel.selectedGroupIds={group};panel.selectedGroupId=group;panel.layerSelectionAnchorId=group;panel.collapsedGroupIds={group};document.applyLayerPanelState(panel);panel=document.layerPanelState();
  saveProject(false);gate=hold();const auto navigationRevision=document.revision(),navigationHistory=document.historySize();document.toggleGroupCollapsed(group);const auto newerPanel=document.layerPanelState();check(document.revision()==navigationRevision&&document.historySize()==navigationHistory,"Panel navigation created an edit");saveProject(false);gate.reset();finish();check(!document.dirty()&&open(documentPath_).layerPanelState()==newerPanel,"Queued native save lost unrevisioned panel metadata");
  struct PanelRoot {std::wstring previous;bool existed=false;PanelRoot(const std::filesystem::path& path){if(const auto p=_wgetenv(L"MOONSPRITE_PANEL_STATE_TEST_ROOT")){previous=p;existed=true;}_wputenv_s(L"MOONSPRITE_PANEL_STATE_TEST_ROOT",path.c_str());}~PanelRoot(){_wputenv_s(L"MOONSPRITE_PANEL_STATE_TEST_ROOT",existed?previous.c_str():L"");}};
  {PanelRoot isolated(root/"panel-preferences");removeProperty("moonsprite.panel-memory");saveLayerPanelState(true);const auto stored=root/"panel-preferences"/"layer-panel-state-v1.json";check(std::filesystem::exists(stored),"Local panel writer did not persist");const auto stamp=std::filesystem::last_write_time(stored);saveLayerPanelState(true);check(std::filesystem::last_write_time(stored)==stamp,"Unchanged panel state rewrote local preferences");
   document.applyLayerPanelState(panel);removeProperty("moonsprite.panel-memory");loadLayerPanelState();check(document.layerPanelState()==newerPanel,"Disk local state did not override archive panel state");
   // Keep the rapid sequence free of diagnostic disk I/O; the earlier per-step
   // trace changed scheduling and could conceal the observed intermittent race.
   document.applyLayerPanelState(panel);refresh();document.applyLayerPanelState(newerPanel);refresh();document.applyLayerPanelState(panel);refresh();saveLayerPanelState(true);const auto writeStatus=status_;removeProperty("moonsprite.panel-memory");document.applyLayerPanelState(newerPanel);loadLayerPanelState();
   {std::ofstream trace(root/"panel-local-trace.txt");trace<<"expected="<<winrt::to_string(paneljson::encode(panel).Stringify())<<" actual="<<winrt::to_string(paneljson::encode(document.layerPanelState()).Stringify())<<" writeStatus="<<winrt::to_string(std::wstring(writeStatus.begin(),writeStatus.end()))<<" loadStatus="<<winrt::to_string(std::wstring(status_.begin(),status_.end()))<<'\n';std::ifstream disk(stored,std::ios::binary);trace<<std::string(std::istreambuf_iterator<char>(disk),{});}
   check(document.layerPanelState()==panel,"A/B/A latest queue lost final panel state");
   const auto priorPath=documentPath_;documentPath_=root/"panel-save-as.moonsprite";document.applyLayerPanelState(newerPanel);saveLayerPanelState(true);documentPath_=priorPath;loadLayerPanelState();check(document.layerPanelState()==panel,"Save As local panel state overwrote old path");removeProperty("moonsprite.panel-memory");
   {std::ofstream broken(stored,std::ios::binary|std::ios::trunc);broken<<"{";}loadLayerPanelState();check(status_.find(U"本地面板状态读取失败")!=std::u32string::npos,"Corrupt local panel file failed silently");status_=U"panel-error-observed";document.applyLayerPanelState(newerPanel);saveLayerPanelState(true);check(status_==U"panel-error-observed","Corrupt local panel file was repeatedly retried");{std::ifstream kept(stored,std::ios::binary);check(std::string(std::istreambuf_iterator<char>(kept),{})=="{","Corrupt local panel file was overwritten");}removeProperty("moonsprite.panel-memory");}

  seed("save-as-source.moonsprite");const auto source=documentPath_,copy=root/"save-as-copy.moonsprite";saveProject(false);gate=hold();dot(2,0xff998877);saveProject(true);int choices=0;
  chooseSaveFile_=[&](OPENFILENAMEW* chooser){++choices;wcsncpy_s(chooser->lpstrFile,chooser->nMaxFile,copy.c_str(),_TRUNCATE);chooser->nFilterIndex=1;return true;};gate.reset();finish();
  check(pending_==Pending::None&&choices==1&&documentPath_==copy&&!document.dirty()&&open(source).pixels()[2]==0&&open(copy).pixels()==document.pixels(),"Queued native Save As was coalesced or captured the older generation");

  seed("failed.moonsprite");const auto failedPath=documentPath_;std::filesystem::create_directory(failedPath);recovery();const auto archive=document.sourceArchive();const auto projectId=document.projectId();saveProject(false);saveProject(false);finish();
  check(pending_==Pending::OpenError&&document.dirty()&&document.sourceArchive()==archive&&document.projectId()==projectId&&!queuedSaves_.empty()&&std::filesystem::is_directory(failedPath)&&std::filesystem::exists(recoveryDirectory_/"native-save-owned.moonsprite"),"Failed native commit changed baseline/recovery or discarded retry");
  resolve(false);documentPath_=root/"retry.moonsprite";finish();drainRecovery();check(pending_==Pending::None&&!document.dirty()&&open(documentPath_).pixels()==document.pixels(),"Native queued retry remained blocked by failed write");

  // Dismiss through the actual title-close callback, then edit and switch tabs.
  seed("dismiss-A.moonsprite");recovery();const auto pathA=documentPath_;const auto identityA=document.identity();const auto firstA=document.pixels();saveProject(false);gate=hold();
  check(dialogClose_->isVisible()&&dialogClose_->isEnabled(),"Save progress has no enabled close button");
  manager()->invalidate();manager()->flushRedraw();manager()->dispatchMessages();writeSmokeFrame(display()->nativeSurface().get(),root/"save-progress.bmp");
  dialogClose_->Click();
  check(pending_==Pending::None&&backgroundSaveBusy(identityA)&&!saveWorker_.valid()&&menuBar_->isEnabled()&&!dialogClose_->isVisible(),"Dismissing progress failed to restore editing");
  dot(1,0xff010203);const auto editedA=document.pixels();const auto historyA=document.historySize();
  addProject(Document::withBuiltinPalette(4,2,U"Background B"));documentPath_=root/"dismiss-B.moonsprite";dot(2,0xffa0b0c0);const auto identityB=document.identity(),revisionB=document.revision();const auto pathB=documentPath_;const auto pixelsB=document.pixels();
  saveProject(false);auto gateB=hold();closePaletteModal();check(backgroundSaves_.size()==2,"Different documents did not save concurrently");
  gateB.reset();const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(20);while(backgroundSaveBusy(identityB)){check(std::chrono::steady_clock::now()<until,"Second background save timeout");saveTick();std::this_thread::sleep_for(std::chrono::milliseconds(1));}
  check(backgroundSaveBusy(identityA)&&!document.dirty()&&document.identity()==identityB&&documentPath_==pathB&&open(pathB).pixels()==pixelsB,"Reverse completion changed the wrong document");
  gate.reset();finish();check(document.identity()==identityB&&document.revision()==revisionB&&document.pixels()==pixelsB&&documentPath_==pathB&&!document.dirty(),"Inactive save acknowledgement changed active document");
  check(projectDocument(0).dirty()&&projectDocument(0).pixels()==editedA&&projectDocument(0).historySize()==historyA&&open(pathA).pixels()==firstA&&std::filesystem::exists(recoveryDirectory_/"native-save-owned.moonsprite"),"Older inactive save lost edits/history/recovery");
  // Queue both forms on A; its Save As chooser must run only after A finishes,
  // without activating it or capturing B's pixels/path.
  activateProject(0);saveProject(false);gate=hold();closePaletteModal();dot(3,0xff445566);const auto latestA=document.pixels();saveProject(false);saveProject(true);activateProject(1);
  const auto copyA=root/"dismiss-A-copy.moonsprite";choices=0;chooseSaveFile_=[&](OPENFILENAMEW* chooser){++choices;check(!backgroundSaveBusy(identityA),"Queued Save As chooser ran before prior save finished");wcsncpy_s(chooser->lpstrFile,chooser->nMaxFile,copyA.c_str(),_TRUNCATE);chooser->nFilterIndex=1;return true;};
  gate.reset();finish();check(choices==1&&document.identity()==identityB&&documentPath_==pathB&&document.pixels()==pixelsB&&projects_[0]->path==copyA&&!projectDocument(0).dirty()&&open(copyA).pixels()==latestA&&open(pathA).pixels()==latestA,"Inactive queued ordinary/Save As lost owner identity");
  activateProject(0);drainRecovery();activateProject(1);
  // A close waits for its own worker, then removes the clean inactive tab while
  // retaining B's active identity and path.
  activateProject(0);dot(0,0xff556677);saveProject(false);gate=hold();closePaletteModal();ask(Pending::CloseDocument);check(projects_.size()==2&&!deferredSaveCloses_.empty(),"Tab close bypassed background save");activateProject(1);gate.reset();finish();
  check(projects_.size()==1&&document.identity()==identityB&&documentPath_==pathB,"Deferred inactive tab close switched or removed the active document");

  // One tab's close must not wait for another document's gated write.
  seed("independent-close-A.moonsprite");const auto independentA=document.identity();saveProject(false);gate=hold();closePaletteModal();addProject(Document::withBuiltinPalette(4,2,U"Independent close B"));documentPath_=root/"independent-close-B.moonsprite";dot(1,0xff888888);saveProject(false);gateB=hold();closePaletteModal();ask(Pending::CloseDocument);gateB.reset();
  const auto closeUntil=std::chrono::steady_clock::now()+std::chrono::seconds(20);while(projects_.size()==2){check(std::chrono::steady_clock::now()<closeUntil,"Tab close waited on unrelated background save");saveTick();std::this_thread::sleep_for(std::chrono::milliseconds(1));}check(backgroundSaveBusy(independentA)&&document.identity()==independentA,"Independent tab close lost the surviving save owner");gate.reset();finish();

  // A later edit requires the normal dirty confirmation, not silent discard.
  seed("dirty-deferred-close.moonsprite");saveProject(false);gate=hold();closePaletteModal();dot(2,0xffababab);const auto unsavedPixels=document.pixels();ask(Pending::CloseDocument);gate.reset();finish();check(pending_==Pending::CloseDocument&&documentOpen_&&document.dirty()&&document.pixels()==unsavedPixels,"Deferred close discarded edits after the saved snapshot");resolve(false);

  // Save As reserves its target before the session path is acknowledged.
  seed("reserved-source.moonsprite");const auto reservedOwner=document.identity();const auto reserved=root/"reserved-target.moonsprite";savePath(reserved,true);gate=hold();closePaletteModal();addProject(Document::withBuiltinPalette(4,2,U"Reserved target contender"));documentPath_=reserved;dot(1,0xff767676);saveProject(false);check(pending_==Pending::OpenError&&backgroundSaves_.size()==1&&document.dirty(),"Concurrent Save As target was not reserved");resolve(false);openPath(reserved);check(document.identity()==reservedOwner&&projects_.size()==2,"Opening pending Save As target created a duplicate owner");gate.reset();finish();

  // Failure remains attached to A, keeps recovery and permits its queued retry.
  seed("background-failed.moonsprite");recovery();const auto backgroundFailure=documentPath_;std::filesystem::create_directory(backgroundFailure);const auto failedIdentity=document.identity();saveProject(false);gate=hold();closePaletteModal();saveProject(false);ask(Pending::CloseDocument);
  addProject(Document::withBuiltinPalette(4,2,U"Failure survivor"));documentPath_=root/"failure-survivor.moonsprite";dot(1,0xff999999);const auto survivor=document.identity();const auto survivorPixels=document.pixels();gate.reset();finish();
  check(pending_==Pending::OpenError&&document.identity()==survivor&&document.pixels()==survivorPixels&&projectDocument(0).dirty()&&projects_[0]->recovery.originId=="native-save-owned"&&deferredSaveCloses_.empty()&&!queuedSaves_.empty()&&openError_.find(unicodeText(backgroundFailure.u8string()))!=std::u32string::npos,"Background failure changed current document or lost owning recovery/retry");
  projects_[0]->path=root/"background-retry.moonsprite";resolve(false);finish();check(document.identity()==survivor&&!projectDocument(0).dirty()&&open(projects_[0]->path).pixels()==projectDocument(0).pixels(),"Failed background save blocked inactive retry");activateProject(0);drainRecovery();activateProject(1);

  // Closing during partial capture records a request; edits stay blocked until
  // the snapshot detaches, and the real worker still writes the complete image.
  seed("capture-dismiss.moonsprite");document=Document::withBuiltinPalette(1024,1024,U"Capture dismiss");documentPath_=root/"capture-dismiss.moonsprite";dot(0,0xff112233);saveProject(false);
  {ui::MouseMessage right(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonRight,ui::kKeyNoneModifier,dialogClose_->bounds().center());onProcessMessage(&right);check(!saveDismissRequested_,"Right click dismissed save progress");ui::MouseMessage left(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,dialogClose_->bounds().center());onProcessMessage(&left);}
  check(saveDismissRequested_,"Capture close did not record dismiss intent");while(pending_==Pending::Saving){saveTick();check(!saveSnapshot_||!menuBar_->isEnabled(),"Editing enabled before capture detached");}finish();check(!document.dirty()&&open(documentPath_).pixels()==document.pixels(),"Dismissed capture did not finish its save");

  seed("close.moonsprite");const auto closing=documentPath_;pending_=Pending::CloseDocument;savePath(closing,true);gate=hold();dot(3,0xffaabbcc);const auto closePixels=document.pixels();gate.reset();finish();
  check(pending_==Pending::None&&!documentOpen_&&projects_.empty()&&open(closing).pixels()==closePixels,"Close resumed before the newer native generation was saved");
  // Application close also waits for a dismissed worker before closing tabs.
  seed("background-app-close.moonsprite");saveProject(false);gate=hold();closePaletteModal();auto priorClose=closeRequested;bool exited=false;closeRequested=[&]{exited=true;};requestClose();check(!exited&&documentOpen_,"Application close bypassed background worker");gate.reset();finish();check(exited&&!documentOpen_&&projects_.empty(),"Application close did not resume after background save");closeRequested=std::move(priorClose);
  chooseSaveFile_=std::move(originalChooser);asyncSaveForSmoke_=false;
  std::ofstream(root/"result.txt")<<"Native async old/exact generations, disk baseline, eight metadata families/statistics, fractional symmetry, preview race, queue/SaveAs/failure retry/recovery cleanup, complete layer-panel metadata/local override/latest queue, dismiss/edit/switch, reverse concurrent completion, inactive queue/SaveAs/failure/retry, capture dismiss, deferred tab/application close passed. Real editor state, workers and atomic files; acknowledgement gated; visual acceptance separate.\n";
 }catch(...){chooseSaveFile_=std::move(originalChooser);asepriteSaveDecisionForSmoke_=std::move(originalDecision);asyncSaveForSmoke_=false;throw;}
}
}
