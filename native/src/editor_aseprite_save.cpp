#include "editor.h"
#include "aseprite_io.h"
#include "psd_export.h"
#include "save_format_dialog.h"
#include "image_save.h"
#include "image_decode.h"
#include "gif_import.h"
#include "native_document_open.h"
#include "aseprite_save_policy.h"
#include "layer_compositor.h"
#include "project_backup.h"
#include <fstream>
namespace moon::editor {
namespace {

}
int Editor::confirmAsepriteSave(bool projectPreferred,const std::vector<std::string>& issues,bool psd){SaveFormatDecisionDialog popup(font_,skin_,toolIcons_,projectPreferred,issues,psd?U"PSD":U"ASE");popup.setDisplay(display(),false);auto size=popup.initialSize();auto center=bounds().center();popup.setBounds({center.x-size.w/2,center.y-size.h/2,size.w,size.h});ui::Timer check(40,&popup);if(smoke_&&asepriteSaveDecisionForSmoke_){check.Tick.connect([&]{check.stop();popup.smokeChoose(asepriteSaveDecisionForSmoke_(projectPreferred,issues));});check.start();}popup.openWindowInForeground();requestFocus();refresh();return popup.result();}

void Editor::smokeAsepriteSaveLifecycle(){
 smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;queuedSaves_.clear();
 auto check=[](bool v,const char* why){if(!v)throw std::runtime_error(why);};
 auto root=assets_.parent_path()/"aseprite-save-ui-owned"/(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(root);recoveryDirectory_=root/"recovery";
 runtimePreferences_.set("files.saveOriginalFormat","true");runtimePreferences_.set("files.saveFormat.Select","0");runtimePreferences_.set("files.projectBackupEnabled","true");runtimePreferences_.set("files.projectBackupDirectory.Text",(root/"backups").u8string());
 auto read=[](const std::filesystem::path& path){std::ifstream file(path,std::ios::binary);return std::vector<std::uint8_t>((std::istreambuf_iterator<char>(file)),{});};
 auto finish=[&]{auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(15);do{check(std::chrono::steady_clock::now()<deadline,"ASE save lifecycle timeout");saveTick();if(saveJob_.worker.valid())saveJob_.worker.wait_for(std::chrono::milliseconds(1));}while(pending_==Pending::Saving||(!queuedSaves_.empty()&&pending_==Pending::None));};
 if(std::wstring(GetCommandLineW()).find(L"--save-decision-only")!=std::wstring::npos){
  const auto savedChooser=chooseSaveFile_;const auto savedDecision=asepriteSaveDecisionForSmoke_;
  struct Restore{std::function<void()> done;~Restore(){done();}} restore{[&]{chooseSaveFile_=savedChooser;asepriteSaveDecisionForSmoke_=savedDecision;}};
  std::ofstream trace(root/"save-decision-stages.txt");
  auto drain=[&]{const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(15);do{check(std::chrono::steady_clock::now()<until,"Save decision completion timeout");saveTick();if(saveJob_.worker.valid())saveJob_.worker.wait_for(std::chrono::milliseconds(1));}while(pending_==Pending::Saving||!backgroundSaves_.empty());};
  int completed=0;
  for(auto format:{SaveImageFormat::Png,SaveImageFormat::Ase,SaveImageFormat::Psd})for(int scenario=0;scenario<8;++scenario){
   trace<<"begin format="<<int(format)<<" scenario="<<scenario<<std::endl;
   const auto prefix="decision-"+std::to_string(int(format))+"-"+std::to_string(scenario);
   const auto source=root/(prefix+"-source"+std::filesystem::path(saveImageExtension(format)).string());
   const auto destination=root/(prefix+"-copy"+std::filesystem::path(saveImageExtension(format)).string());
   const auto moved=root/(prefix+"-moved"+std::filesystem::path(saveImageExtension(format)).string());
   Document seed(3,1);seed.beginStroke({0,0},0xff123456);seed.commitStroke();writeExportBytesAtomic(source,encodeSaveImage(seed,format));
   seed.setSourceFilePath(source);seed.markSaved();seed.createSlices({{0,0,1,1}});seed.addLayer();addProject(std::move(seed));
   const auto ownerId=currentDocument().identity();const auto originalBytes=read(source);const auto initialPixels=currentDocument().canvasPixels();const auto initialHistory=currentDocument().historySize();
   const auto initialCount=projects_.size();std::weak_ptr<Document> lifetime=activeDocument_;int prompts=0,choosers=0;std::uint64_t switchedId=0;
   chooseSaveFile_=[&](OPENFILENAMEW* chooser){++choosers;wcsncpy_s(chooser->lpstrFile,chooser->nMaxFile,destination.c_str(),_TRUNCATE);chooser->nFilterIndex=format==SaveImageFormat::Png?4:format==SaveImageFormat::Psd?3:2;return true;};
   asepriteSaveDecisionForSmoke_=[&](bool preferred,const auto& issues){
    ++prompts;check(!preferred&&!issues.empty(),"Decision fixture must open actual compatibility dialog");
    if(scenario==0)currentPath()=moved;
    else if(scenario==1)currentDocument().setSourceFilePath(moved);
    else if(scenario==2)replaceDocumentForSmoke(Document(3,1));
    else if(scenario==3){currentDocument().addFrame();currentDocument().setSelectedFramesDisabled(true);}
    else if(scenario==4)return 0;
    else if(scenario==5){closeDocumentTab();check(!lifetime.expired(),"Save request released its document inside nested close");}
    else if(scenario==6){addProject(Document(3,1));switchedId=currentDocument().identity();}
    else if(scenario==7){currentDocument().beginStroke({2,0},0xffabcdef);currentDocument().commitStroke();}
    return 2;
   };
   saveProject(true);
   check(prompts==1,"Compatibility dialog count changed");
   if(scenario<=3||scenario==5){
    check(pending_==Pending::OpenError&&!saveJob_.worker.valid()&&!saveJob_.snapshot&&backgroundSaves_.empty()&&!std::filesystem::exists(destination)&&read(source)==originalBytes,"Stale save decision reached persistence");
    check(choosers==0,"Stale compatibility decision reached file chooser");
    if(scenario==0)check(currentPath()==moved&&currentDocument().dirty(),"Rejected saved-path change lost current context");
    if(scenario==1)check(currentDocument().sourceFilePath()==moved&&currentDocument().dirty(),"Rejected source-path change lost current context");
    if(scenario==2)check(currentDocument().identity()!=ownerId,"Replacement document restored stale owner");
    if(scenario==5)check(!saveProjectIndex(ownerId)&&projects_.size()+1==initialCount&&lifetime.expired(),"Closed owner was resurrected or retained after request");
    resolve(false);
   }else if(scenario==4){
    check(pending_==Pending::None&&choosers==0&&!std::filesystem::exists(destination)&&read(source)==originalBytes&&currentDocument().identity()==ownerId&&currentDocument().historySize()==initialHistory&&currentDocument().canvasPixels()==initialPixels&&currentDocument().dirty(),"Cancelled confirmation changed source/owner/history");
   }else{
    drain();check(pending_==Pending::None&&choosers==1&&std::filesystem::is_regular_file(destination)&&read(source)==originalBytes,"Approved decision did not persist only the chosen copy");
    const auto owner=saveProjectIndex(ownerId);check(bool(owner)&&projectPath(*owner)==destination&&!projectDocument(*owner).dirty(),"Approved save lost original owner acknowledgement");
    if(scenario==6)check(currentDocument().identity()==switchedId&&currentDocument().historySize()==0&&!currentDocument().dirty()&&currentPath().empty(),"Tab change redirected save into new current document");
    if(scenario==7)check(projectDocument(*owner).pixels()[2]==0xffabcdef&&projectDocument(*owner).historySize()==initialHistory+1,"Covered edit was lost or rejected");
   }
   trace<<"pass format="<<int(format)<<" scenario="<<scenario<<std::endl;++completed;
  }
  // The system chooser can dispatch close/path changes even without a loss dialog.
  for(int scenario=0;scenario<3;++scenario){
   trace<<"chooser-begin "<<scenario<<std::endl;addProject(Document(3,1));const auto ownerId=currentDocument().identity();const auto destination=root/("chooser-"+std::to_string(scenario)+".moonsprite");
   chooseSaveFile_=[&](OPENFILENAMEW* chooser){if(scenario==0)currentPath()=root/"chooser-moved.moonsprite";else if(scenario==1)replaceDocumentForSmoke(Document(3,1));else closeDocumentTab();wcsncpy_s(chooser->lpstrFile,chooser->nMaxFile,destination.c_str(),_TRUNCATE);chooser->nFilterIndex=1;return true;};
   saveProject(true);check(pending_==Pending::OpenError&&!std::filesystem::exists(destination)&&!saveJob_.snapshot&&!saveJob_.worker.valid(),"Stale native chooser reached capture/persistence");
   if(scenario==2)check(!saveProjectIndex(ownerId),"Chooser closed owner was resurrected");resolve(false);trace<<"chooser-pass "<<scenario<<std::endl;++completed;
  }
  check(completed==27,"Save decision case coverage incomplete");trace<<"completed="<<completed<<std::endl;return;
 }
 auto equalCurrent=[&](const Document& opened){auto index=currentDocument().timeline().frameIndex(currentDocument().frame().id);return compositeNormalRegion(currentDocument().timeline(),currentDocument().frame().id,{0,0,3,1})==compositeNormalRegion(opened.timeline(),opened.timeline().state().frames.at(index).id,{0,0,3,1});};
 replaceDocumentForSmoke(Document(3,1));currentDocument().beginStroke({0,0},0xff123456);currentDocument().commitStroke();currentDocument().setFrameDuration(43);currentDocument().addFrame();currentDocument().beginStroke({1,0},0x80563412);currentDocument().commitStroke();currentDocument().setFrameDuration(217);currentDocument().markSaved();currentPath().clear();ensureProjects();refresh();
 const auto source=root/"source.ase",copy=root/"copy.aseprite",project=root/"preserved.moonsprite";writeExportBytesAtomic(source,encodeAseprite(currentDocument()));openPath(source);check(pending_==Pending::None&&currentDocument().sourceFilePath()==source&&currentPath().empty(),"ASE source session admission");
 auto originalChooser=chooseSaveFile_;int chooserCalls=0;chooseSaveFile_=[&](OPENFILENAMEW*){++chooserCalls;throw std::runtime_error("Unexpected system save chooser");return false;};
 auto originalDecision=asepriteSaveDecisionForSmoke_;int decisions=0;asepriteSaveDecisionForSmoke_=[&](bool,const auto&){++decisions;return 2;};
 try{
  const auto original=read(source);currentDocument().beginStroke({2,0},0xffabcdef);currentDocument().commitStroke();saveProject(false);check(pending_==Pending::Saving,"ASE original save must use async worker");saveProject(false);saveProject(false);finish();check(pending_==Pending::None&&!currentDocument().dirty()&&currentPath().empty()&&currentDocument().sourceFilePath()==source,"ASE original savepoint/source-only identity");check(chooserCalls==0&&decisions==0&&queuedSaves_.empty()&&read(source)!=original,"ASE original save wrongly prompted/queued");auto reopened=openAseprite(source);check(reopened.timeline().state().frames.size()==2&&reopened.timeline().state().frames[1].duration==217,"ASE original save lost frames");check(!std::filesystem::exists(root/"backups"),"ASE must not create MoonSprite project backups");
  const auto history=currentDocument().historySize();currentDocument().beginStroke({0,0},0xff654321);currentDocument().commitStroke();saveProject(false);saveProject(true);chooseSaveFile_=[&](OPENFILENAMEW* chooser){++chooserCalls;auto value=copy.wstring();check(value.size()+1<=chooser->nMaxFile,"ASE smoke path capacity");std::copy(value.begin(),value.end(),chooser->lpstrFile);chooser->lpstrFile[value.size()]=0;chooser->nFilterIndex=2;return true;};finish();check(pending_==Pending::None&&currentPath()==copy&&!currentDocument().dirty()&&currentDocument().historySize()==history+1,"ASE queued Save As identity/history");check(std::filesystem::is_regular_file(copy)&&chooserCalls==1,"ASE queued Save As not persisted separately");
  currentDocument().beginStroke({0,0},0xff000011);currentDocument().commitStroke();saveProject(false);while(saveJob_.snapshot)saveTick();currentDocument().beginStroke({2,0},0xff112233);currentDocument().commitStroke();saveProject(false);finish();check(pending_==Pending::None&&!currentDocument().dirty(),"ASE queued newer generation savepoint");reopened=openAseprite(copy);check(equalCurrent(reopened),"ASE newer generation output");
  currentDocument().createAttachedMask(currentDocument().layer().id,currentDocument().frame().id);const auto beforeLoss=read(copy);asepriteSaveDecisionForSmoke_=[&](bool preferred,const auto& issues){++decisions;check(!preferred&&std::find(issues.begin(),issues.end(),"effects")!=issues.end(),"ASE mask loss confirmation missing");return 0;};saveProject(false);check(pending_==Pending::None&&currentDocument().dirty()&&read(copy)==beforeLoss,"ASE compatibility cancel changed savepoint/file");
  asepriteSaveDecisionForSmoke_=[&](bool preferred,const auto& issues){++decisions;check(!preferred&&!issues.empty(),"ASE continue-format prompt");return 2;};saveProject(false);finish();check(!currentDocument().dirty()&&!currentDocument().timeline().state().masks.empty(),"ASE loss approval changed live structure");reopened=openAseprite(copy);check(reopened.timeline().state().masks.empty()&&equalCurrent(reopened),"ASE mask save composite appearance");
  currentDocument().beginStroke({1,0},0xff334455);currentDocument().commitStroke();auto heldIdentity=currentDocument().identity();asepriteSaveDecisionForSmoke_=[&](bool,const auto&){++decisions;return 1;};chooseSaveFile_=[&](OPENFILENAMEW* chooser){++chooserCalls;auto value=project.wstring();check(value.size()+1<=chooser->nMaxFile,"Native smoke path capacity");std::copy(value.begin(),value.end(),chooser->lpstrFile);chooser->lpstrFile[value.size()]=0;chooser->nFilterIndex=1;return true;};saveProject(false);finish();check(currentDocument().identity()==heldIdentity&&currentPath()==project&&!currentDocument().dirty()&&currentDocument().sourceArchive(),"ASE preserve-project choice did not commit native project");auto projectBytes=read(project);check(projectBytes.size()>4&&projectBytes[0]=='P'&&projectBytes[1]=='K',"Native choice has wrong signature");
  currentPath()=copy;currentDocument().markSaved();runtimePreferences_.set("files.saveOriginalFormat","false");asepriteSaveDecisionForSmoke_=[&](bool preferred,const auto&){check(preferred,"Disabled original format must prompt project");return 0;};auto noChange=read(copy);saveProject(false);check(pending_==Pending::None&&currentPath()==copy&&read(copy)==noChange,"Disabled-original cancel changed target");
  runtimePreferences_.set("files.saveOriginalFormat","true");replaceDocumentForSmoke(Document(2,1));currentPath().clear();const auto failure=root/"blocked.ase";std::filesystem::create_directory(failure);currentDocument().setSourceFilePath(failure);currentDocument().beginStroke({0,0},0xffabcdef);currentDocument().commitStroke();auto name=currentDocument().name();saveProject(false);saveProject(false);finish();check(pending_==Pending::OpenError&&currentDocument().dirty()&&currentPath().empty()&&currentDocument().name()==name&&!queuedSaves_.empty(),"ASE failed commit changed savepoint or discarded retry");resolve(false);currentDocument().setSourceFilePath(root/"retry.ase");finish();check(pending_==Pending::None&&!currentDocument().dirty()&&std::filesystem::is_regular_file(root/"retry.ase"),"ASE queued retry blocked by prior failure");
  // legacy document-save-format.test.ts: imported raster files save back to
  // their own formats; GIF alone keeps the complete animation.
  runtimePreferences_.set("files.saveOriginalFormat","true");
  auto opaque=[](){return Document::fromImage(3,1,std::vector<Pixel>(3,0xff2040c0),U"Image save");};
  for(auto extension:{L".png",L".jpg",L".jpeg",L".webp",L".bmp",L".gif"}){
   const auto path=root/(std::wstring(L"source-image")+extension);auto source=opaque();
   if(saveImageFormat(path)==SaveImageFormat::Gif){source.setFrameDuration(40);source.addFrame();source.setFrameDuration(210);source.beginStroke({0,0},0xff00ff00);source.commitStroke();}
   writeExportBytesAtomic(path,encodeSaveImage(source,saveImageFormat(path)));openPath(path);
   check(pending_==Pending::None&&currentPath().empty()&&currentDocument().sourceFilePath()==path,"Raster source admission");
   int prompts=0;chooseSaveFile_=[&](OPENFILENAMEW*){throw std::runtime_error("Raster CtrlS unexpectedly requested Save As");return false;};asepriteSaveDecisionForSmoke_=[&](bool,const auto&){++prompts;return 2;};
   const auto frames=currentDocument().timeline().state().frames.size(),history=currentDocument().historySize();
   currentDocument().beginStroke({2,0},0xff00ffff);currentDocument().commitStroke();saveProject(false);saveProject(false);finish();
   check(pending_==Pending::None&&!currentDocument().dirty()&&currentPath().empty()&&currentDocument().sourceFilePath()==path&&currentDocument().historySize()==history+1&&prompts==0,"Raster source CtrlS/queue/savepoint");
   auto reopened=saveImageFormat(path)==SaveImageFormat::Gif?openGifAnimation(path):openRasterImage(path);check(reopened.width()==3&&reopened.height()==1,"Raster source re-open");
   const auto format=saveImageFormat(path);if(format==SaveImageFormat::Png||format==SaveImageFormat::Bmp)check(reopened.pixels()==currentDocument().pixels(),"Raster source exact pixel save");
   if(format==SaveImageFormat::Gif)check(gif_import::metadata(read(path)).frames.size()==frames,"Source GIF lost animation on CtrlS");
  }
  // All Save As filters, including vector/icon encoders; default preferences use
  // their legacy index and are independent from export preferences.
  for(unsigned filter=4;filter<=10;++filter){
   replaceDocumentForSmoke(opaque());currentPath().clear();currentDocument().markSaved();
   static constexpr SaveImageFormat formats[]={SaveImageFormat::Png,SaveImageFormat::Jpeg,SaveImageFormat::Webp,SaveImageFormat::Svg,SaveImageFormat::Ico,SaveImageFormat::Bmp,SaveImageFormat::Gif};
   const auto path=root/(L"save-as-"+std::to_wstring(filter)+saveImageExtension(formats[filter-4]));
   chooseSaveFile_=[&](OPENFILENAMEW* chooser){const auto name=path.wstring();wcsncpy_s(chooser->lpstrFile,chooser->nMaxFile,name.c_str(),_TRUNCATE);chooser->nFilterIndex=filter;return true;};
   const auto identity=currentDocument().identity(),history=currentDocument().historySize();saveProject(true);finish();
   check(pending_==Pending::None&&currentPath()==path&&!currentDocument().dirty()&&currentDocument().identity()==identity&&currentDocument().historySize()==history&&!read(path).empty(),"Raster Save As filter/savepoint");
  }
  for(int preference=1;preference<=5;++preference){
   replaceDocumentForSmoke(opaque());currentPath().clear();runtimePreferences_.set("files.saveFormat.Select",std::to_string(preference));
   const auto format=preferredSaveImageFormat(preference);const auto path=root/(L"default-"+std::to_wstring(preference)+saveImageExtension(format));
   chooseSaveFile_=[&](OPENFILENAMEW* chooser){check(chooser->nFilterIndex==unsigned(preference+3),"Default save preference selected wrong format");wcsncpy_s(chooser->lpstrFile,chooser->nMaxFile,path.c_str(),_TRUNCATE);return true;};
   saveProject(false);finish();check(pending_==Pending::None&&currentPath()==path&&!currentDocument().dirty()&&!read(path).empty(),"Default raster format save");
  }
  runtimePreferences_.set("files.saveFormat.Select","0");
  const auto layeredPath=root/"layered.png";replaceDocumentForSmoke(opaque());writeExportBytesAtomic(layeredPath,encodeSaveImage(currentDocument(),SaveImageFormat::Png));currentDocument().setSourceFilePath(layeredPath);currentPath().clear();currentDocument().addLayer();
  const auto originalRaster=read(layeredPath);asepriteSaveDecisionForSmoke_=[&](bool preferred,const auto& issues){check(!preferred&&std::find(issues.begin(),issues.end(),"layers")!=issues.end(),"Layered PNG warning missing");return 0;};
  saveProject(false);check(pending_==Pending::None&&currentDocument().dirty()&&read(layeredPath)==originalRaster,"Layered PNG cancel overwrote source");
  asepriteSaveDecisionForSmoke_=[&](bool,const auto&){currentDocument().addFrame();return 2;};saveProject(false);
  check(pending_==Pending::OpenError&&read(layeredPath)==originalRaster&&currentDocument().dirty(),"Raster compatibility approval accepted new frame loss");resolve(false);
  asepriteSaveDecisionForSmoke_=[](bool,const auto&){return 2;};saveProject(false);finish();check(pending_==Pending::None&&!currentDocument().dirty()&&currentDocument().timeline().state().frames.size()==2&&currentDocument().timeline().state().layers.size()==2,"Approved PNG loss changed live document");
  currentDocument().beginStroke({1,0},0xffaa1122);currentDocument().commitStroke();const auto preservedRaster=root/"preserved-image.moonsprite";
  asepriteSaveDecisionForSmoke_=[](bool,const auto&){return 1;};chooseSaveFile_=[&](OPENFILENAMEW* chooser){wcsncpy_s(chooser->lpstrFile,chooser->nMaxFile,preservedRaster.c_str(),_TRUNCATE);chooser->nFilterIndex=1;return true;};
  saveProject(false);finish();check(pending_==Pending::None&&currentPath()==preservedRaster&&!currentDocument().dirty()&&currentDocument().sourceArchive()&&currentDocument().timeline().state().frames.size()==2&&currentDocument().timeline().state().layers.size()==2,"Raster complete-project choice");
  replaceDocumentForSmoke(opaque());currentPath().clear();currentDocument().setSourceFilePath(layeredPath);currentDocument().markSaved();runtimePreferences_.set("files.saveOriginalFormat","false");
  asepriteSaveDecisionForSmoke_=[](bool preferred,const auto&){if(!preferred)throw std::runtime_error("Disabled original raster save did not ask for project");return 0;};const auto beforeDisabled=read(layeredPath);saveProject(false);check(pending_==Pending::None&&currentPath().empty()&&read(layeredPath)==beforeDisabled,"Disabled original raster preference cancel");
  runtimePreferences_.set("files.saveOriginalFormat","true");replaceDocumentForSmoke(opaque());currentPath().clear();const auto blockedImage=root/"blocked.png";std::filesystem::create_directory(blockedImage);currentDocument().setSourceFilePath(blockedImage);currentDocument().beginStroke({0,0},0xff123456);currentDocument().commitStroke();saveProject(false);saveProject(false);finish();
  check(pending_==Pending::OpenError&&currentDocument().dirty()&&currentPath().empty()&&!queuedSaves_.empty(),"Raster failed commit falsely saved or discarded queue");resolve(false);currentDocument().setSourceFilePath(root/"retry.png");finish();check(pending_==Pending::None&&!currentDocument().dirty()&&std::filesystem::is_regular_file(root/"retry.png"),"Raster queued retry did not recover");
  // legacy document-files.test.ts: chat-cache GIF data can carry any of the
  // six static-image suffixes. Actual openPath must keep frames; subsequent
  // saving follows the selected path's format and confirms still-frame loss.
  auto chat=opaque();chat.setFrameDuration(120);chat.addFrame();chat.fillSelectionOrCanvas(0xffff0000);chat.setFrameDuration(240);const auto chatBytes=encodeAnimationGif(chat).bytes;
  for(auto suffix:{L".png",L".jpg",L".jpeg",L".webp",L".bmp",L".gif"}){
   const auto path=root/(std::wstring(L"chat-cache")+suffix);writeExportBytesAtomic(path,chatBytes);check(dispatchNativeDocumentPaths(*this,display()->nativeWindow(),{path.u8string()}),"Chat GIF document drop not accepted");
   check(pending_==Pending::None&&currentPath().empty()&&currentDocument().sourceFilePath()==path&&!currentDocument().dirty()&&currentDocument().timeline().state().frames.size()==2&&currentDocument().timeline().state().frames[0].duration==120&&currentDocument().timeline().state().frames[1].duration==240,"Chat GIF suffix lost frames on actual open");
   const auto count=projects_.size(),identity=currentDocument().identity();openPath(path);check(projects_.size()==count&&currentDocument().identity()==identity,"Chat GIF duplicate open created another tab");
   currentDocument().beginStroke({0,0},0xff00ff00);currentDocument().commitStroke();const auto before=read(path);const bool gif=saveImageFormat(path)==SaveImageFormat::Gif;int lossPrompts=0;
   chooseSaveFile_=[](OPENFILENAMEW*){throw std::runtime_error("Chat GIF source unexpectedly opened Save As");return false;};
   asepriteSaveDecisionForSmoke_=[&](bool preferred,const auto& issues){++lossPrompts;check(!preferred&&std::find(issues.begin(),issues.end(),"frames")!=issues.end(),"Chat GIF still-format loss missing");return 0;};
   if(!gif){saveProject(false);check(lossPrompts==1&&pending_==Pending::None&&currentDocument().dirty()&&read(path)==before,"Chat GIF cancel did not protect original animation bytes");}
   asepriteSaveDecisionForSmoke_=[&](bool,const auto& issues){++lossPrompts;check(!gif&&std::find(issues.begin(),issues.end(),"frames")!=issues.end(),"Chat GIF format confirmation mismatch");return 2;};saveProject(false);finish();
   check(pending_==Pending::None&&!currentDocument().dirty()&&currentDocument().timeline().state().frames.size()==2&&currentDocument().sourceFilePath()==path&&currentPath().empty(),"Chat GIF saving mutated live animation/source identity");
   auto saved=gif?openGifAnimation(path):openRasterImage(path);check(saved.timeline().state().frames.size()==(gif?2:1),"Chat GIF save must obey actual output path format");
  }
  for(auto suffix:{L".ase",L".psd",L".cache"}){
   const auto path=root/(std::wstring(L"signature-priority")+suffix);writeExportBytesAtomic(path,chatBytes);openPath(path);check(pending_==Pending::None&&currentPath().empty()&&currentDocument().sourceFilePath()==path&&currentDocument().timeline().state().frames.size()==2,"GIF signature did not win structured/unknown suffix routing");
  }
  const auto badCache=root/"bad-chat.webp";writeExportBytesAtomic(badCache,{'G','I','F','8','9','a',1});const auto originalIdentity=currentDocument().identity(),originalHistory=currentDocument().historySize();const auto originalPixels=currentDocument().pixels();const auto originalCount=projects_.size();openPath(badCache);
  check(pending_==Pending::OpenError&&currentDocument().identity()==originalIdentity&&currentDocument().historySize()==originalHistory&&currentDocument().pixels()==originalPixels&&projects_.size()==originalCount,"Corrupt chat GIF changed existing project");resolve(false);
  chooseSaveFile_=std::move(originalChooser);asepriteSaveDecisionForSmoke_=std::move(originalDecision);
  std::ofstream(root/"result.txt")<<"Actual ASE and raster source Save/SaveAs/default formats/queue/newer-generation/loss choices/preference cancel/failure retry passed. File chooser injected; compatibility dialog opened and selected via shared choice callback. ASE creates no project backups. Native preservation uses existing project save. No visual acceptance claimed.\n";refresh();
 }catch(...){chooseSaveFile_=std::move(originalChooser);asepriteSaveDecisionForSmoke_=std::move(originalDecision);throw;}
}
}
