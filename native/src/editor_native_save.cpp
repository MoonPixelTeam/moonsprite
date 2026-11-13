#include "editor.h"
#include "ui_frame_capture.h"
#include "project_import.h"
#include "project_encode.h"
#include "recovery_store.h"
#include "layer_panel_state_json.h"
#include "document_save_policy.h"
#include "image_decode.h"
#include "image_export.h"
#include "image_save.h"
#include <fstream>
namespace moon::editor {
void Editor::smokeNativeSaveLifecycle(){
 smoke_=true;asyncSaveForSmoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;queuedSaves_.clear();
 auto check=[](bool value,const char* why){if(!value)throw std::runtime_error(why);};
 const auto root=assets_.parent_path()/"native-save-ui-owned"/(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));
 std::filesystem::create_directories(root);recoveryDirectory_=root/"recovery";runtimePreferences_.set("files.projectBackupEnabled","false");
 auto read=[](const std::filesystem::path& path){std::ifstream file(path,std::ios::binary);if(!file)throw std::runtime_error("Cannot read native save fixture");return std::make_shared<const project::Bytes>((std::istreambuf_iterator<char>(file)),std::istreambuf_iterator<char>());};
 auto open=[&](const std::filesystem::path& path){return project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(read(path))));};
 auto finish=[&]{const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(20);do{check(std::chrono::steady_clock::now()<until,"Native save lifecycle timeout");saveTick();if(saveJob_.worker.valid())saveJob_.worker.wait_for(std::chrono::milliseconds(1));else std::this_thread::sleep_for(std::chrono::milliseconds(1));}while(pending_==Pending::Saving||(pending_==Pending::None&&(!backgroundSaves_.empty()||!deferredSaveCloses_.empty()||closeAfterBackgroundSaves_||!queuedSaves_.empty()||queuedSaveResume_!=Pending::None||queuedSaveClose_)));};
 // Only defer UI acknowledgement. The wrapped worker still performs the real
 // snapshot/encoder/atomic write; destruction always releases the gate on error.
 struct Gate {std::promise<void> promise;~Gate(){promise.set_value();}};
 auto hold=[&]{while(saveJob_.snapshot)saveTick();check(saveJob_.worker.valid(),"Native save did not dispatch worker");auto gate=std::make_unique<Gate>();auto wait=gate->promise.get_future().share();saveJob_.worker=std::async(std::launch::async,[prior=std::move(saveJob_.worker),wait]()mutable{auto result=prior.get();wait.wait();return result;});return gate;};
 auto dot=[&](int x,Pixel color){currentDocument().beginStroke({x,0},color);currentDocument().commitStroke();};
 auto seed=[&](const char* name){check(!currentRecovery().worker.valid()&&!saveJob_.worker.valid()&&backgroundSaves_.empty()&&deferredSaveCloses_.empty(),"Previous fixture worker still owned");RecoverySession empty;currentRecovery()=std::move(empty);projects_.clear();activeProject_=0;replaceDocumentForSmoke(Document::withBuiltinPalette(4,2,U"Native save"));dot(0,0xff123456);currentDocument().setImportedSymmetryCenter({1.25,-2.75});currentPath()=root/name;documentOpen_=true;homeOpen_=false;pending_=Pending::None;queuedSaves_.clear();queuedSaveResume_=Pending::None;queuedSaveClose_=false;ensureProjects();refresh();};
 auto recovery=[&]{currentRecovery().ownedId="native-save-owned";currentRecovery().originId=currentRecovery().ownedId;currentRecovery().ownedIdentity=currentDocument().identity();project::writeRecoveryFiles(recoveryDirectory_,{currentRecovery().ownedId,"Native save","1"},*project::encodeRecoveryProject(currentDocument()).bytes);};
 auto drainRecovery=[&]{if(currentRecovery().worker.valid())currentRecovery().worker.wait();auto preferences=recoveryPreferences_;preferences.enabled=false;const auto result=currentRecovery().tick(currentDocument(),preferences,recoveryDirectory_,false);check(result.error.empty(),"Native save recovery cleanup failed");};
 auto originalChooser=chooseSaveFile_;
 auto originalDecision=asepriteSaveDecisionForSmoke_;
 try{
  const bool encoderFailures=std::wstring(GetCommandLineW()).find(L"--save-encoder-failure-only")!=std::wstring::npos;
  if(encoderFailures||std::wstring(GetCommandLineW()).find(L"--save-format-failure-only")!=std::wstring::npos){
   // Keep the matrix frame separate from the large existing native-save suite.
   std::function<void()> scenario=[&]{
   std::ofstream trace(root/(encoderFailures?"encoder-failure-stages.txt":"format-failure-stages.txt"));int completed=0;
   for(auto format:{SaveImageFormat::Native,SaveImageFormat::Png,SaveImageFormat::Jpeg,SaveImageFormat::Webp,SaveImageFormat::Svg,SaveImageFormat::Ico,SaveImageFormat::Bmp,SaveImageFormat::Gif,SaveImageFormat::Psd,SaveImageFormat::Ase,SaveImageFormat::Aseprite})for(int mode=0;mode<(format==SaveImageFormat::Native?3:4);++mode){
    if(encoderFailures&&format==SaveImageFormat::Native)continue;
    const bool sourceOnly=mode==3;const auto extension=format==SaveImageFormat::Native?L".moonsprite":saveImageExtension(format);
    const auto name="format-"+std::to_string(int(format))+"-"+std::to_string(mode);
    trace<<"begin "<<name<<std::endl;seed((name+".moonsprite").c_str());
    const auto target=root/std::filesystem::path(std::filesystem::u8path(name).wstring()+extension);
    savePath(target,true);finish();check(pending_==Pending::None&&!currentDocument().dirty(),"Format baseline save failed");
    if(sourceOnly){currentPath()=root/(name+"-project.moonsprite");currentDocument().setSourceFilePath(target);}
    dot(2,0xfff0e0d0);
    if(encoderFailures)check(currentDocument().resizeCanvas(1025,17),"Cannot prepare actual encoder dimension/budget rejection");
    recovery();
    const auto owner=activeSession_;const auto identity=currentDocument().identity();const auto oldPath=currentPath(),oldSource=currentDocument().sourceFilePath();const auto archive=currentDocument().sourceArchive();const auto projectId=currentDocument().projectId();
    const auto pixels=currentDocument().canvasPixels();const auto history=currentDocument().historySize(),revision=currentDocument().revision();const auto original=*read(target);const auto recoveryFile=recoveryDirectory_/"native-save-owned.moonsprite";const auto originalRecovery=*read(recoveryFile);
    HANDLE handle=INVALID_HANDLE_VALUE;
    if(!encoderFailures){handle=CreateFileW(target.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);check(handle!=INVALID_HANDLE_VALUE,"Cannot lock format target");}
    struct FileLock {HANDLE handle;~FileLock(){if(handle!=INVALID_HANDLE_VALUE)CloseHandle(handle);}} locked{handle};
    if(mode==2)pending_=Pending::CloseDocument;
    if(encoderFailures)requestedSaveScale_=6400;
    savePath(target,true,sourceOnly);auto gate=hold();std::shared_ptr<ProjectSession> survivor;std::vector<Pixel> survivorPixels;std::filesystem::path survivorPath;
    if(mode==1){closePaletteModal();addProject(Document::withBuiltinPalette(4,2,U"Failure survivor"));currentPath()=root/(name+"-survivor.moonsprite");dot(1,0xff112233);survivor=activeSession_;survivorPixels=currentDocument().canvasPixels();survivorPath=currentPath();}
    gate.reset();finish();
    check(pending_==Pending::OpenError&&documentOpen_&&saveProjectIndex(identity).has_value()&&owner->value->dirty(),"Failed format save closed/cleaned owner or hid failure");
    if(encoderFailures)check(openError_.find(U"budget")!=std::u32string::npos||openError_.find(U"超限")!=std::u32string::npos,"Failure did not come from actual encoder admission");
    check(owner->path==oldPath&&owner->value->sourceFilePath()==oldSource&&owner->value->sourceArchive()==archive&&owner->value->projectId()==projectId&&owner->value->canvasPixels()==pixels&&owner->value->historySize()==history&&owner->value->revision()==revision,"Failed format save changed baseline, path, artwork or history");
    check(*read(target)==original&&*read(recoveryFile)==originalRecovery&&owner->recovery.ownedId=="native-save-owned"&&owner->recovery.originId=="native-save-owned"&&deferredSaveCloses_.empty(),"Failed format save changed target/recovery or retained close continuation");
    if(survivor)check(activeSession_==survivor&&currentDocument().canvasPixels()==survivorPixels&&currentPath()==survivorPath,"Inactive format failure changed active B");
    if(locked.handle!=INVALID_HANDLE_VALUE)CloseHandle(locked.handle);locked.handle=INVALID_HANDLE_VALUE;resolve(false);
    if(encoderFailures)requestedSaveScale_=100;
    savePath(target,true,sourceOnly,identity);finish();
    check(pending_==Pending::None&&!owner->value->dirty()&&owner->value->canvasPixels()==pixels&&owner->value->historySize()==history&&*read(target)!=original,"Format explicit retry failed or changed artwork/history");
    check(owner->path==(sourceOnly?oldPath:target),"Format retry source-only/path acknowledgement changed");
    if(survivor){check(activeSession_==survivor&&currentDocument().canvasPixels()==survivorPixels&&currentPath()==survivorPath,"Inactive format retry activated/modified B");activateProject(0);}
    drainRecovery();check(owner->recovery.ownedId.empty()&&owner->recovery.originId.empty()&&!std::filesystem::exists(recoveryFile),"Exact format retry did not acknowledge recovery cleanup");
    trace<<"completed="<<++completed<<" "<<name<<std::endl;
   }
   check(completed==(encoderFailures?40:43),"Format failure matrix incomplete");
   std::ofstream(root/(encoderFailures?"encoder-failure-result.txt":"format-failure-result.txt"))<<(encoderFailures?"40 actual encoder dimension/budget rejections across10 image formats; corrected-scale explicit retry. No encoding or persistence mock.\n":"43 real async commit failures/retries across11 formats; no encoder or persistence mock.\n");
   };scenario();chooseSaveFile_=std::move(originalChooser);asepriteSaveDecisionForSmoke_=std::move(originalDecision);asyncSaveForSmoke_=false;return;
  }
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
   auto loadBackup=[&]{seed("backup-sentinel.moonsprite");currentDocument().markSaved();openPath(backup);check(pending_==Pending::None&&currentPath().empty()&&currentDocument().sourceFilePath().empty()&&!currentDocument().dirty()&&!currentDocument().canUndo()&&currentDocument().name()==U"Recovered.MOONSPRITE","Backup open path/name/clean history");check(currentDocument().pixels()==original.pixels()&&currentDocument().timeline().state().frames.size()==2&&currentDocument().timeline().state().frames.back().duration==217&&currentDocument().referenceImages().size()==1&&currentDocument().referenceImages()[0].pixels->at(0)==0x00123456,"Backup open lost pixels, frames or reference resource");unchanged();};
   loadBackup();const auto openedId=currentDocument().identity();const auto tabs=projects_.size();openPath(backup);check(currentDocument().identity()==openedId&&projects_.size()==tabs,"Backup project ID did not deduplicate open");
   const auto history=currentDocument().historySize();cancel();check(!saveProject(false)&&choices==1&&confirmations==0&&currentPath().empty()&&currentDocument().sourceFilePath().empty()&&!currentDocument().dirty()&&currentDocument().historySize()==history,"Clean backup Save skipped chooser or mutated identity/history");unchanged();
   // The actual Save menu and shortcut enter the same guarded target policy.
   requestFocus();ui::KeyMessage saveKey(ui::kKeyDownMessage,ui::kKeyS,ui::kKeyCtrlModifier,0,0);check(routeShortcutMessage(&saveKey)==1&&choices==2,"Backup Ctrl+S bypassed target chooser");
   dot(1,0xffabcdef);const auto edited=currentDocument().pixels();const auto destination=root/"backup-saved.moonsprite";choose(destination);menuItems_.at("save")->Click();finish();
   check(pending_==Pending::None&&!currentDocument().dirty()&&currentPath()==destination&&open(destination).pixels()==edited&&open(destination).referenceImages().size()==1&&open(destination).symmetryCenter().y==-2.75,"Backup native save/reopen lost document data");unchanged();
   const int afterSave=choices;dot(2,0xff998877);const auto latest=currentDocument().pixels();cancel();saveProject(false);finish();check(choices==afterSave&&!currentDocument().dirty()&&open(destination).pixels()==latest,"Saved backup copy still requested target chooser");unchanged();
   // Save As preserves the first saved copy and does not return to the backup.
   const auto copy=root/"backup-copy.moonsprite";choose(copy);saveProject(true);finish();check(currentPath()==copy&&open(copy).pixels()==latest&&open(destination).pixels()==latest,"Backup Save As identity or original copy");unchanged();
   loadBackup();dot(2,0xff556677);const auto identity=currentDocument().identity();const auto failedPixels=currentDocument().pixels();const auto failed=root/"blocked.moonsprite";std::filesystem::create_directory(failed);choose(failed);saveProject(false);finish();check(pending_==Pending::OpenError&&currentDocument().identity()==identity&&currentDocument().dirty()&&currentPath().empty()&&currentDocument().sourceFilePath().empty()&&currentDocument().pixels()==failedPixels&&std::filesystem::is_directory(failed),"Failed backup save changed identity/savepoint");unchanged();resolve(false);
   choose(root/"backup-retry.moonsprite");saveProject(false);finish();check(pending_==Pending::None&&!currentDocument().dirty()&&open(currentPath()).pixels()==failedPixels,"Backup failed save retry");unchanged();
   loadBackup();dot(3,0xff778899);const auto closeIdentity=currentDocument().identity();const auto closePixels=currentDocument().pixels();ask(Pending::CloseDocument);check(pending_==Pending::CloseDocument,"Dirty backup close omitted confirmation");cancel();saveBeforeClose_->Click();check(pending_==Pending::CloseDocument&&currentDocument().identity()==closeIdentity&&currentDocument().dirty()&&saveProjectIndex(closeIdentity).has_value(),"Canceled save-before-close discarded backup document");unchanged();
   const auto closing=root/"backup-close.moonsprite";choose(closing);saveBeforeClose_->Click();finish();check(pending_==Pending::None&&!saveProjectIndex(closeIdentity)&&open(closing).pixels()==closePixels,"Save-before-close did not await actual backup write");unchanged();
   // With no valid direct target, original-format preference uses the configured
   // default; disabling it requests native directly without a redundant prompt.
   for(bool originalFormat:{true,false})for(int preferred:{0,1,8}){
    loadBackup();runtimePreferences_.set("files.saveOriginalFormat",originalFormat?"true":"false");runtimePreferences_.set("files.saveFormat.Select",std::to_string(preferred));
    const auto expected=originalFormat?preferredSaveImageFormat(preferred):SaveImageFormat::Native;const auto before=confirmations;
    chooseSaveFile_=[&](OPENFILENAMEW* chooser){++choices;check(chooser->nFilterIndex==(expected==SaveImageFormat::Png?4u:expected==SaveImageFormat::Aseprite?2u:1u),"Backup default format chooser mismatch");check(std::filesystem::path(chooser->lpstrFile).extension()==saveImageExtension(expected),"Backup initial name has wrong format suffix");return false;};
    check(!saveProject(false)&&currentPath().empty()&&currentDocument().sourceFilePath().empty()&&!currentDocument().dirty(),"Canceled backup preferred-format save changed state");check(originalFormat||confirmations==before,"No-target save showed redundant project confirmation");unchanged();
   }
   runtimePreferences_.set("files.saveOriginalFormat","true");runtimePreferences_.set("files.saveFormat.Select","0");
   // Save As to another encoder still changes the saved identity, never backup.
   loadBackup();const auto png=root/"backup-export.png";choose(png,4);saveProject(true);finish();check(pending_==Pending::None&&!currentDocument().dirty()&&currentPath()==png&&openRasterImage(png).pixels()==original.pixels(),"Backup PNG Save As path/pixels");unchanged();
   for(const auto* invalid:{L"synthetic.unknown",L"synthetic.moonsprite.bak"}){loadBackup();currentPath()=root/invalid;currentDocument().setSourceFilePath(destination);cancel();const int before=choices;check(!saveProject(false)&&choices==before+1,"Invalid saved target fell back to source");check(open(destination).pixels()==latest,"Invalid saved target overwrote original source");unchanged();}
   // GIF signature has priority over the project-backup extension. Opening it
   // still clears both paths and uses the filename without only the final .bak.
   seed("gif-sentinel.moonsprite");currentDocument().markSaved();const auto gifBackup=root/"Animation.moonsprite.bak";const auto gifBytes=encodeSaveImage(original,SaveImageFormat::Gif);writeExportBytesAtomic(gifBackup,gifBytes);openPath(gifBackup);
   check(pending_==Pending::None&&currentPath().empty()&&currentDocument().sourceFilePath().empty()&&currentDocument().name()==U"Animation.moonsprite"&&!currentDocument().dirty()&&!currentDocument().canUndo()&&currentDocument().timeline().state().frames.size()==2&&currentDocument().timeline().state().frames.back().duration==220,"GIF-signature backup identity/timing");
   const auto gifPixels=currentDocument().pixels();choose(root/"gif-backup-saved.moonsprite");saveProject(false);finish();check(pending_==Pending::None&&!currentDocument().dirty()&&open(currentPath()).pixels()==gifPixels&&open(currentPath()).timeline().state().frames.size()==2&&*read(gifBackup)==gifBytes,"GIF backup native save/reopen mutated source");unchanged();
   chooseSaveFile_=std::move(originalChooser);asepriteSaveDecisionForSmoke_=std::move(originalDecision);asyncSaveForSmoke_=false;
   std::ofstream(root/"backup-result.txt")<<"Backup archive/GIF signature identity, clean history, duplicate open, clean cancel/CtrlS/menu, native/PNG SaveAs/reopen, ordinary save after copy, failure/retry, close cancel/save completion, default format matrix and invalid saved priority passed. Original backup bytes unchanged. Real editor/loader/encoder/atomic writer; chooser callback injected.\n";
   };backupCheck();return;
  }
  seed("older.moonsprite");recovery();const auto path=currentPath();const auto firstPixels=currentDocument().pixels();saveProject(false);auto gate=hold();dot(1,0xffabcdef);const auto currentPixels=currentDocument().pixels();const auto history=currentDocument().historySize(),revision=currentDocument().revision();gate.reset();finish();
  check(pending_==Pending::None&&currentDocument().dirty()&&currentPath()==path&&currentDocument().sourceArchive()&&*currentDocument().sourceArchive()==*read(path),"Older native write was reported failed or lost disk baseline");
  check(currentDocument().pixels()==currentPixels&&currentDocument().historySize()==history&&currentDocument().revision()==revision&&open(path).pixels()==firstPixels,"Older native acknowledgement replaced live edits/history");
  check(std::filesystem::exists(recoveryDirectory_/"native-save-owned.moonsprite")&&!currentRecovery().worker.valid()&&currentRecovery().originId=="native-save-owned","Older save removed recovery protection");
  auto old=open(path);check(old.symmetryCenter().x==1.25&&old.symmetryCenter().y==-2.75,"Worker snapshot quantized imported symmetry coordinates");
  saveProject(false);saveProject(false);saveProject(false);finish();drainRecovery();
  check(pending_==Pending::None&&!currentDocument().dirty()&&queuedSaves_.empty()&&open(path).pixels()==currentPixels&&currentRecovery().originId.empty()&&!std::filesystem::exists(recoveryDirectory_/"native-save-owned.moonsprite"),"Exact queued save failed to coalesce or clear its recovery");

  // Explicit options are an independent save even when the first write is an
  // exact generation. The second real PNG encoder must see its own scale.
  seed("explicit-options.png");saveProject(false);gate=hold();
  saveProject(false,currentDocument().identity(),std::string(R"({"scalePercent":200})"));
  gate.reset();finish();const auto scaled=openRasterImage(currentPath());
  check(pending_==Pending::None&&!currentDocument().dirty()&&queuedSaves_.empty()&&scaled.width()==8&&scaled.height()==4,"Explicit option save was coalesced with ordinary exact save");

  struct Mutation {const char* name;std::function<void()> apply;std::function<bool(const Document&)> persisted;};
  const std::vector<Mutation> metadata={
   {"symmetry",[&]{currentDocument().setSymmetryCenter({3,.5});},[](const Document& d){return d.symmetryCenter().x==3&&d.symmetryCenter().y==.5;}},
   {"pixel-grid",[&]{currentDocument().setPixelGrid(true);},[](const Document& d){return d.showPixelGrid();}},
   {"custom-grid",[&]{currentDocument().setCustomGrid(true,{1,-2,3,4});},[](const Document& d){return d.showCustomGrid()&&d.customGrid()==GridSettings{1,-2,3,4};}},
   {"animation-loop",[&]{currentDocument().setAnimationLoop(false);},[](const Document& d){return !d.animationLoop();}},
   {"palette-name",[&]{currentDocument().renamePaletteColor(currentDocument().palette().entries.front().id,U"Saved metadata");},[](const Document& d){return d.palette().entries.front().name==U"Saved metadata";}},
   {"recording-settings",[&]{auto& s=currentDocument().mutableTimelapseSettings();s.fps=23;s.speed=3;s.mode=timelapse::Mode::Full;currentDocument().markTimelapseModified();},[](const Document& d){const auto& s=d.timelapseSettings();return s.fps==23&&s.speed==3&&s.mode==timelapse::Mode::Full;}},
   {"reference-resource",[&]{currentDocument().addReferenceImage({"save-reference",1,1,std::make_shared<const std::vector<Pixel>>(1,0x00123456)});},[](const Document& d){return d.referenceImages().size()==1&&d.referenceImages()[0].pixels->at(0)==0x00123456;}},
   {"slice-metadata",[&]{currentDocument().createSlices({{1,0,2,1}});},[](const Document& d){return d.slices().size()==1&&d.slices()[0].rect==SliceRect{1,0,2,1};}}
  };
  for(const auto& mutation:metadata){
   seed((std::string(mutation.name)+".moonsprite").c_str());saveProject(false);gate=hold();const auto before=currentDocument().revision();mutation.apply();check(currentDocument().revision()!=before&&currentDocument().dirty(),mutation.name);const auto info=currentDocument().projectInformation();const auto currentHistory=currentDocument().historySize();saveProject(false);gate.reset();finish();auto result=open(currentPath());
   check(pending_==Pending::None&&!currentDocument().dirty()&&queuedSaves_.empty()&&mutation.persisted(result),mutation.name);
   check(currentDocument().historySize()==currentHistory&&result.projectInformation().operationCount==info.operationCount&&result.projectInformation().strokeCount==info.strokeCount&&result.projectInformation().drawingTimeMs==info.drawingTimeMs,"Queued native save changed history/statistics");
  }
  seed("preview.moonsprite");saveProject(false);gate=hold();const auto previewRevision=currentDocument().revision();currentDocument().setSymmetryCenter({2,1},false);check(currentDocument().revision()==previewRevision,"Symmetry preview unexpectedly committed metadata");gate.reset();finish();
  check(pending_==Pending::None&&currentDocument().dirty()&&open(currentPath()).symmetryCenter().x==1.25,"Unrevisioned symmetry preview falsely accepted savepoint");saveProject(false);finish();check(!currentDocument().dirty()&&open(currentPath()).symmetryCenter().x==2,"Symmetry preview retry was not persisted");

  seed("panel-state.moonsprite");currentDocument().addLayer();check(currentDocument().createLayerGroup(),"Panel fixture group missing");const auto group=currentDocument().timeline().state().groups.front().id;auto panel=currentDocument().layerPanelState();panel.selectedLayerIds.clear();for(const auto& layer:currentDocument().timeline().state().layers)panel.selectedLayerIds.push_back(layer.id);panel.selectedGroupIds={group};panel.selectedGroupId=group;panel.layerSelectionAnchorId=group;panel.collapsedGroupIds={group};currentDocument().applyLayerPanelState(panel);panel=currentDocument().layerPanelState();
  saveProject(false);gate=hold();const auto navigationRevision=currentDocument().revision(),navigationHistory=currentDocument().historySize();currentDocument().toggleGroupCollapsed(group);const auto newerPanel=currentDocument().layerPanelState();check(currentDocument().revision()==navigationRevision&&currentDocument().historySize()==navigationHistory,"Panel navigation created an edit");saveProject(false);gate.reset();finish();check(!currentDocument().dirty()&&open(currentPath()).layerPanelState()==newerPanel,"Queued native save lost unrevisioned panel metadata");
  struct PanelRoot {std::wstring previous;bool existed=false;PanelRoot(const std::filesystem::path& path){if(const auto p=_wgetenv(L"MOONSPRITE_PANEL_STATE_TEST_ROOT")){previous=p;existed=true;}_wputenv_s(L"MOONSPRITE_PANEL_STATE_TEST_ROOT",path.c_str());}~PanelRoot(){_wputenv_s(L"MOONSPRITE_PANEL_STATE_TEST_ROOT",existed?previous.c_str():L"");}};
  {PanelRoot isolated(root/"panel-preferences");removeProperty("moonsprite.panel-memory");saveLayerPanelState(true);const auto value=root/"panel-preferences"/"layer-panel-state-v1.json";check(std::filesystem::exists(value),"Local panel writer did not persist");const auto stamp=std::filesystem::last_write_time(value);saveLayerPanelState(true);check(std::filesystem::last_write_time(value)==stamp,"Unchanged panel state rewrote local preferences");
   currentDocument().applyLayerPanelState(panel);removeProperty("moonsprite.panel-memory");loadLayerPanelState();check(currentDocument().layerPanelState()==newerPanel,"Disk local state did not override archive panel state");
   // Keep the rapid sequence free of diagnostic disk I/O; the earlier per-step
   // trace changed scheduling and could conceal the observed intermittent race.
   currentDocument().applyLayerPanelState(panel);refresh();currentDocument().applyLayerPanelState(newerPanel);refresh();currentDocument().applyLayerPanelState(panel);refresh();saveLayerPanelState(true);const auto writeStatus=status_;removeProperty("moonsprite.panel-memory");currentDocument().applyLayerPanelState(newerPanel);loadLayerPanelState();
   {std::ofstream trace(root/"panel-local-trace.txt");trace<<"expected="<<winrt::to_string(paneljson::encode(panel).Stringify())<<" actual="<<winrt::to_string(paneljson::encode(currentDocument().layerPanelState()).Stringify())<<" writeStatus="<<winrt::to_string(std::wstring(writeStatus.begin(),writeStatus.end()))<<" loadStatus="<<winrt::to_string(std::wstring(status_.begin(),status_.end()))<<'\n';std::ifstream disk(value,std::ios::binary);trace<<std::string(std::istreambuf_iterator<char>(disk),{});}
   check(currentDocument().layerPanelState()==panel,"A/B/A latest queue lost final panel state");
   const auto priorPath=currentPath();currentPath()=root/"panel-save-as.moonsprite";currentDocument().applyLayerPanelState(newerPanel);saveLayerPanelState(true);currentPath()=priorPath;loadLayerPanelState();check(currentDocument().layerPanelState()==panel,"Save As local panel state overwrote old path");removeProperty("moonsprite.panel-memory");
   {std::ofstream broken(value,std::ios::binary|std::ios::trunc);broken<<"{";}loadLayerPanelState();check(status_.find(U"本地面板状态读取失败")!=std::u32string::npos,"Corrupt local panel file failed silently");status_=U"panel-error-observed";currentDocument().applyLayerPanelState(newerPanel);saveLayerPanelState(true);check(status_==U"panel-error-observed","Corrupt local panel file was repeatedly retried");{std::ifstream kept(value,std::ios::binary);check(std::string(std::istreambuf_iterator<char>(kept),{})=="{","Corrupt local panel file was overwritten");}removeProperty("moonsprite.panel-memory");}

  seed("save-as-source.moonsprite");const auto source=currentPath(),copy=root/"save-as-copy.moonsprite";saveProject(false);gate=hold();dot(2,0xff998877);saveProject(true);int choices=0;
  chooseSaveFile_=[&](OPENFILENAMEW* chooser){++choices;wcsncpy_s(chooser->lpstrFile,chooser->nMaxFile,copy.c_str(),_TRUNCATE);chooser->nFilterIndex=1;return true;};gate.reset();finish();
  check(pending_==Pending::None&&choices==1&&currentPath()==copy&&!currentDocument().dirty()&&open(source).pixels()[2]==0&&open(copy).pixels()==currentDocument().pixels(),"Queued native Save As was coalesced or captured the older generation");

  seed("failed.moonsprite");const auto failedPath=currentPath();std::filesystem::create_directory(failedPath);recovery();const auto archive=currentDocument().sourceArchive();const auto projectId=currentDocument().projectId();saveProject(false);saveProject(false);finish();
  check(pending_==Pending::OpenError&&currentDocument().dirty()&&currentDocument().sourceArchive()==archive&&currentDocument().projectId()==projectId&&!queuedSaves_.empty()&&std::filesystem::is_directory(failedPath)&&std::filesystem::exists(recoveryDirectory_/"native-save-owned.moonsprite"),"Failed native commit changed baseline/recovery or discarded retry");
  resolve(false);currentPath()=root/"retry.moonsprite";finish();drainRecovery();check(pending_==Pending::None&&!currentDocument().dirty()&&open(currentPath()).pixels()==currentDocument().pixels(),"Native queued retry remained blocked by failed write");

  // Dismiss through the actual title-close callback, then edit and switch tabs.
  seed("dismiss-A.moonsprite");recovery();const auto pathA=currentPath();const auto identityA=currentDocument().identity();const auto firstA=currentDocument().pixels();saveProject(false);gate=hold();
  check(dialogClose_->isVisible()&&dialogClose_->isEnabled(),"Save progress has no enabled close button");
  manager()->invalidate();manager()->flushRedraw();manager()->dispatchMessages();writeSmokeFrame(display()->nativeSurface().get(),root/"save-progress.bmp");
  dialogClose_->Click();
  check(pending_==Pending::None&&backgroundSaveBusy(identityA)&&!saveJob_.worker.valid()&&menuBar_->isEnabled()&&!dialogClose_->isVisible(),"Dismissing progress failed to restore editing");
  dot(1,0xff010203);const auto editedA=currentDocument().pixels();const auto historyA=currentDocument().historySize();
  addProject(Document::withBuiltinPalette(4,2,U"Background B"));currentPath()=root/"dismiss-B.moonsprite";dot(2,0xffa0b0c0);const auto identityB=currentDocument().identity(),revisionB=currentDocument().revision();const auto pathB=currentPath();const auto pixelsB=currentDocument().pixels();
  saveProject(false);auto gateB=hold();closePaletteModal();check(backgroundSaves_.size()==2,"Different documents did not save concurrently");
  gateB.reset();const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(20);while(backgroundSaveBusy(identityB)){check(std::chrono::steady_clock::now()<until,"Second background save timeout");saveTick();std::this_thread::sleep_for(std::chrono::milliseconds(1));}
  check(backgroundSaveBusy(identityA)&&!currentDocument().dirty()&&currentDocument().identity()==identityB&&currentPath()==pathB&&open(pathB).pixels()==pixelsB,"Reverse completion changed the wrong document");
  gate.reset();finish();check(currentDocument().identity()==identityB&&currentDocument().revision()==revisionB&&currentDocument().pixels()==pixelsB&&currentPath()==pathB&&!currentDocument().dirty(),"Inactive save acknowledgement changed active document");
  check(projectDocument(0).dirty()&&projectDocument(0).pixels()==editedA&&projectDocument(0).historySize()==historyA&&open(pathA).pixels()==firstA&&std::filesystem::exists(recoveryDirectory_/"native-save-owned.moonsprite"),"Older inactive save lost edits/history/recovery");
  // Queue both forms on A; its Save As chooser must run only after A finishes,
  // without activating it or capturing B's pixels/path.
  activateProject(0);saveProject(false);gate=hold();closePaletteModal();dot(3,0xff445566);const auto latestA=currentDocument().pixels();saveProject(false);saveProject(true);activateProject(1);
  const auto copyA=root/"dismiss-A-copy.moonsprite";choices=0;chooseSaveFile_=[&](OPENFILENAMEW* chooser){++choices;check(!backgroundSaveBusy(identityA),"Queued Save As chooser ran before prior save finished");wcsncpy_s(chooser->lpstrFile,chooser->nMaxFile,copyA.c_str(),_TRUNCATE);chooser->nFilterIndex=1;return true;};
  gate.reset();finish();check(choices==1&&currentDocument().identity()==identityB&&currentPath()==pathB&&currentDocument().pixels()==pixelsB&&projects_[0]->path==copyA&&!projectDocument(0).dirty()&&open(copyA).pixels()==latestA&&open(pathA).pixels()==latestA,"Inactive queued ordinary/Save As lost owner identity");
  activateProject(0);drainRecovery();activateProject(1);
  // A close waits for its own worker, then removes the clean inactive tab while
  // retaining B's active identity and path.
  activateProject(0);dot(0,0xff556677);
  check(currentDocument().addReferenceImage({"closing-reference",1,1,std::make_shared<const std::vector<Pixel>>(1,0xff123456)}),"Deferred close reference fixture");
  const auto closeReference=referenceSession().openWindow(currentDocument().referenceImages(),"closing-reference");openReferenceWindow(closeReference);
  check(std::any_of(referenceWindows_.begin(),referenceWindows_.end(),[&](const auto& view){return view.identity==identityA;}),"Deferred close reference window not opened");
  saveProject(false);gate=hold();closePaletteModal();ask(Pending::CloseDocument);check(projects_.size()==2&&!deferredSaveCloses_.empty(),"Tab close bypassed background save");activateProject(1);gate.reset();finish();
  check(projects_.size()==1&&currentDocument().identity()==identityB&&currentPath()==pathB&&!referenceSessions_.count(identityA)&&std::none_of(referenceWindows_.begin(),referenceWindows_.end(),[&](const auto& view){return view.identity==identityA;}),"Deferred inactive tab close retained document views or changed active owner");

  // One tab's close must not wait for another document's gated write.
  seed("independent-close-A.moonsprite");const auto independentA=currentDocument().identity();saveProject(false);gate=hold();closePaletteModal();addProject(Document::withBuiltinPalette(4,2,U"Independent close B"));currentPath()=root/"independent-close-B.moonsprite";dot(1,0xff888888);saveProject(false);gateB=hold();closePaletteModal();ask(Pending::CloseDocument);gateB.reset();
  const auto closeUntil=std::chrono::steady_clock::now()+std::chrono::seconds(20);while(projects_.size()==2){check(std::chrono::steady_clock::now()<closeUntil,"Tab close waited on unrelated background save");saveTick();std::this_thread::sleep_for(std::chrono::milliseconds(1));}check(backgroundSaveBusy(independentA)&&currentDocument().identity()==independentA,"Independent tab close lost the surviving save owner");gate.reset();finish();

  // A later edit requires the normal dirty confirmation, not silent discard.
  seed("dirty-deferred-close.moonsprite");saveProject(false);gate=hold();closePaletteModal();dot(2,0xffababab);const auto unsavedPixels=currentDocument().pixels();ask(Pending::CloseDocument);gate.reset();finish();check(pending_==Pending::CloseDocument&&documentOpen_&&currentDocument().dirty()&&currentDocument().pixels()==unsavedPixels,"Deferred close discarded edits after the saved snapshot");resolve(false);

  // Save As reserves its target before the session path is acknowledged.
  seed("reserved-source.moonsprite");const auto reservedOwner=currentDocument().identity();const auto reserved=root/"reserved-target.moonsprite";savePath(reserved,true);gate=hold();closePaletteModal();addProject(Document::withBuiltinPalette(4,2,U"Reserved target contender"));currentPath()=reserved;dot(1,0xff767676);saveProject(false);check(pending_==Pending::OpenError&&backgroundSaves_.size()==1&&currentDocument().dirty(),"Concurrent Save As target was not reserved");resolve(false);openPath(reserved);check(currentDocument().identity()==reservedOwner&&projects_.size()==2,"Opening pending Save As target created a duplicate owner");gate.reset();finish();

  // Failure remains attached to A, keeps recovery and permits its queued retry.
  seed("background-failed.moonsprite");recovery();const auto backgroundFailure=currentPath();std::filesystem::create_directory(backgroundFailure);const auto failedIdentity=currentDocument().identity();saveProject(false);gate=hold();closePaletteModal();saveProject(false);ask(Pending::CloseDocument);
  addProject(Document::withBuiltinPalette(4,2,U"Failure survivor"));currentPath()=root/"failure-survivor.moonsprite";dot(1,0xff999999);const auto survivor=currentDocument().identity();const auto survivorPixels=currentDocument().pixels();gate.reset();finish();
  check(pending_==Pending::OpenError&&currentDocument().identity()==survivor&&currentDocument().pixels()==survivorPixels&&projectDocument(0).dirty()&&projects_[0]->recovery.originId=="native-save-owned"&&deferredSaveCloses_.empty()&&!queuedSaves_.empty()&&openError_.find(unicodeText(backgroundFailure.u8string()))!=std::u32string::npos,"Background failure changed current document or lost owning recovery/retry");
  projects_[0]->path=root/"background-retry.moonsprite";resolve(false);finish();check(currentDocument().identity()==survivor&&!projectDocument(0).dirty()&&open(projects_[0]->path).pixels()==projectDocument(0).pixels(),"Failed background save blocked inactive retry");activateProject(0);drainRecovery();activateProject(1);

  // A recovery tick can consume a failed cleanup before saveTick sees the
  // continuation. Preserve that acknowledgement and keep the saved tab open.
  seed("cleanup-close.moonsprite");recovery();const auto cleanupIdentity=currentDocument().identity();
  const auto cleanupPath=currentPath();const auto recoveryFile=recoveryDirectory_/"native-save-owned.moonsprite";
  HANDLE cleanupLock=CreateFileW(recoveryFile.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);
  check(cleanupLock!=INVALID_HANDLE_VALUE,"Cannot hold recovery cleanup fixture");
  struct CleanupLock {HANDLE handle;~CleanupLock(){if(handle!=INVALID_HANDLE_VALUE)CloseHandle(handle);}} lockedCleanup{cleanupLock};
  pending_=Pending::CloseDocument;savePath(cleanupPath,true);gate=hold();gate.reset();
  while(pending_==Pending::Saving){saveTick();if(saveJob_.worker.valid())saveJob_.worker.wait_for(std::chrono::milliseconds(1));}
  check(!currentDocument().dirty()&&currentRecovery().worker.valid()&&!deferredSaveCloses_.empty(),"Exact cleanup close fixture did not await recovery");
  currentRecovery().worker.wait();activeRecoveryTick(true);
  check(currentRecovery().cleanupError&&currentRecovery().cleanupError->first==cleanupIdentity&&!currentRecovery().worker.valid(),"Recovery tick lost cleanup failure acknowledgement");
  saveTick();check(pending_==Pending::OpenError&&documentOpen_&&currentDocument().identity()==cleanupIdentity&&!currentDocument().dirty()&&deferredSaveCloses_.empty()&&currentRecovery().ownedId=="native-save-owned"&&std::filesystem::exists(recoveryFile)&&open(cleanupPath).pixels()==currentDocument().pixels(),"Consumed cleanup failure silently resumed document close");
  CloseHandle(lockedCleanup.handle);lockedCleanup.handle=INVALID_HANDLE_VALUE;resolve(false);
  savePath(cleanupPath,true);finish();drainRecovery();
  check(!currentRecovery().cleanupError&&currentRecovery().ownedId.empty()&&!std::filesystem::exists(recoveryFile),"Recovery cleanup retry failed after releasing fixture lock");

  // Closing during partial capture records a request; edits stay blocked until
  // the snapshot detaches, and the real worker still writes the complete image.
  seed("capture-dismiss.moonsprite");replaceDocumentForSmoke(Document::withBuiltinPalette(1024,1024,U"Capture dismiss"));currentPath()=root/"capture-dismiss.moonsprite";dot(0,0xff112233);saveProject(false);
  {ui::MouseMessage right(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonRight,ui::kKeyNoneModifier,dialogClose_->bounds().center());onProcessMessage(&right);check(!saveDismissRequested_,"Right click dismissed save progress");ui::MouseMessage left(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,dialogClose_->bounds().center());onProcessMessage(&left);}
  check(saveDismissRequested_,"Capture close did not record dismiss intent");while(pending_==Pending::Saving){saveTick();check(!saveJob_.snapshot||!menuBar_->isEnabled(),"Editing enabled before capture detached");}finish();check(!currentDocument().dirty()&&open(currentPath()).pixels()==currentDocument().pixels(),"Dismissed capture did not finish its save");

  seed("close.moonsprite");const auto closing=currentPath();pending_=Pending::CloseDocument;savePath(closing,true);gate=hold();dot(3,0xffaabbcc);const auto closePixels=currentDocument().pixels();gate.reset();finish();
  check(pending_==Pending::None&&!documentOpen_&&projects_.empty()&&open(closing).pixels()==closePixels,"Close resumed before the newer native generation was saved");
  // Application close also waits for a dismissed worker before closing tabs.
  seed("background-app-close.moonsprite");saveProject(false);gate=hold();closePaletteModal();auto priorClose=closeRequested;bool exited=false;closeRequested=[&]{exited=true;};requestClose();check(!exited&&documentOpen_,"Application close bypassed background worker");gate.reset();finish();check(exited&&!documentOpen_&&projects_.empty(),"Application close did not resume after background save");closeRequested=std::move(priorClose);
  chooseSaveFile_=std::move(originalChooser);asyncSaveForSmoke_=false;
  std::ofstream(root/"result.txt")<<"Native async old/exact generations, disk baseline, eight metadata families/statistics, fractional symmetry, preview race, queue/SaveAs/failure retry/recovery cleanup, complete layer-panel metadata/local override/latest queue, dismiss/edit/switch, reverse concurrent completion, inactive queue/SaveAs/failure/retry, capture dismiss, deferred tab/application close passed. Real editor state, workers and atomic files; acknowledgement gated; visual acceptance separate.\n";
 }catch(...){chooseSaveFile_=std::move(originalChooser);asepriteSaveDecisionForSmoke_=std::move(originalDecision);asyncSaveForSmoke_=false;throw;}
}
}
