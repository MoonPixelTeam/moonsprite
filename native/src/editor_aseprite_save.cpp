#include "editor_implementation.h"
#include "editor.h"
#include "aseprite_io.h"
#include "psd_export.h"
#include "save_format_dialog.h"
#include "image_save.h"
#include "image_decode.h"
#include "gif_import.h"
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
 auto finish=[&]{auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(15);do{check(std::chrono::steady_clock::now()<deadline,"ASE save lifecycle timeout");saveTick();if(saveWorker_.valid())saveWorker_.wait_for(std::chrono::milliseconds(1));}while(pending_==Pending::Saving||(!queuedSaves_.empty()&&pending_==Pending::None));};
 auto equalCurrent=[&](const Document& opened){auto index=document.timeline().frameIndex(document.frame().id);return compositeNormalRegion(document.timeline(),document.frame().id,{0,0,3,1})==compositeNormalRegion(opened.timeline(),opened.timeline().state().frames.at(index).id,{0,0,3,1});};
 document=Document(3,1);document.beginStroke({0,0},0xff123456);document.commitStroke();document.setFrameDuration(43);document.addFrame();document.beginStroke({1,0},0x80563412);document.commitStroke();document.setFrameDuration(217);document.markSaved();documentPath_.clear();ensureProjects();refresh();
 const auto source=root/"source.ase",copy=root/"copy.aseprite",project=root/"preserved.moonsprite";writeExportBytesAtomic(source,encodeAseprite(document));openPath(source);check(pending_==Pending::None&&document.sourceFilePath()==source&&documentPath_.empty(),"ASE source session admission");
 auto originalChooser=chooseSaveFile_;int chooserCalls=0;chooseSaveFile_=[&](OPENFILENAMEW*){++chooserCalls;throw std::runtime_error("Unexpected system save chooser");return false;};
 auto originalDecision=asepriteSaveDecisionForSmoke_;int decisions=0;asepriteSaveDecisionForSmoke_=[&](bool,const auto&){++decisions;return 2;};
 try{
  const auto original=read(source);document.beginStroke({2,0},0xffabcdef);document.commitStroke();saveProject(false);check(pending_==Pending::Saving,"ASE original save must use async worker");saveProject(false);saveProject(false);finish();check(pending_==Pending::None&&!document.dirty()&&documentPath_.empty()&&document.sourceFilePath()==source,"ASE original savepoint/source-only identity");check(chooserCalls==0&&decisions==0&&queuedSaves_.empty()&&read(source)!=original,"ASE original save wrongly prompted/queued");auto reopened=openAseprite(source);check(reopened.timeline().state().frames.size()==2&&reopened.timeline().state().frames[1].duration==217,"ASE original save lost frames");check(!std::filesystem::exists(root/"backups"),"ASE must not create MoonSprite project backups");
  const auto history=document.historySize();document.beginStroke({0,0},0xff654321);document.commitStroke();saveProject(false);saveProject(true);chooseSaveFile_=[&](OPENFILENAMEW* chooser){++chooserCalls;auto value=copy.wstring();check(value.size()+1<=chooser->nMaxFile,"ASE smoke path capacity");std::copy(value.begin(),value.end(),chooser->lpstrFile);chooser->lpstrFile[value.size()]=0;chooser->nFilterIndex=2;return true;};finish();check(pending_==Pending::None&&documentPath_==copy&&!document.dirty()&&document.historySize()==history+1,"ASE queued Save As identity/history");check(std::filesystem::is_regular_file(copy)&&chooserCalls==1,"ASE queued Save As not persisted separately");
  document.beginStroke({0,0},0xff000011);document.commitStroke();saveProject(false);while(saveSnapshot_)saveTick();document.beginStroke({2,0},0xff112233);document.commitStroke();saveProject(false);finish();check(pending_==Pending::None&&!document.dirty(),"ASE queued newer generation savepoint");reopened=openAseprite(copy);check(equalCurrent(reopened),"ASE newer generation output");
  document.createAttachedMask(document.layer().id,document.frame().id);const auto beforeLoss=read(copy);asepriteSaveDecisionForSmoke_=[&](bool preferred,const auto& issues){++decisions;check(!preferred&&std::find(issues.begin(),issues.end(),"effects")!=issues.end(),"ASE mask loss confirmation missing");return 0;};saveProject(false);check(pending_==Pending::None&&document.dirty()&&read(copy)==beforeLoss,"ASE compatibility cancel changed savepoint/file");
  asepriteSaveDecisionForSmoke_=[&](bool preferred,const auto& issues){++decisions;check(!preferred&&!issues.empty(),"ASE continue-format prompt");return 2;};saveProject(false);finish();check(!document.dirty()&&!document.timeline().state().masks.empty(),"ASE loss approval changed live structure");reopened=openAseprite(copy);check(reopened.timeline().state().masks.empty()&&equalCurrent(reopened),"ASE mask save composite appearance");
  document.beginStroke({1,0},0xff334455);document.commitStroke();auto heldIdentity=document.identity();asepriteSaveDecisionForSmoke_=[&](bool,const auto&){++decisions;return 1;};chooseSaveFile_=[&](OPENFILENAMEW* chooser){++chooserCalls;auto value=project.wstring();check(value.size()+1<=chooser->nMaxFile,"Native smoke path capacity");std::copy(value.begin(),value.end(),chooser->lpstrFile);chooser->lpstrFile[value.size()]=0;chooser->nFilterIndex=1;return true;};saveProject(false);finish();check(document.identity()==heldIdentity&&documentPath_==project&&!document.dirty()&&document.sourceArchive(),"ASE preserve-project choice did not commit native project");auto projectBytes=read(project);check(projectBytes.size()>4&&projectBytes[0]=='P'&&projectBytes[1]=='K',"Native choice has wrong signature");
  documentPath_=copy;document.markSaved();runtimePreferences_.set("files.saveOriginalFormat","false");asepriteSaveDecisionForSmoke_=[&](bool preferred,const auto&){check(preferred,"Disabled original format must prompt project");return 0;};auto noChange=read(copy);saveProject(false);check(pending_==Pending::None&&documentPath_==copy&&read(copy)==noChange,"Disabled-original cancel changed target");
  runtimePreferences_.set("files.saveOriginalFormat","true");document=Document(2,1);documentPath_.clear();const auto failure=root/"blocked.ase";std::filesystem::create_directory(failure);document.setSourceFilePath(failure);document.beginStroke({0,0},0xffabcdef);document.commitStroke();auto name=document.name();saveProject(false);saveProject(false);finish();check(pending_==Pending::OpenError&&document.dirty()&&documentPath_.empty()&&document.name()==name&&!queuedSaves_.empty(),"ASE failed commit changed savepoint or discarded retry");resolve(false);document.setSourceFilePath(root/"retry.ase");finish();check(pending_==Pending::None&&!document.dirty()&&std::filesystem::is_regular_file(root/"retry.ase"),"ASE queued retry blocked by prior failure");
  // legacy document-save-format.test.ts: imported raster files save back to
  // their own formats; GIF alone keeps the complete animation.
  runtimePreferences_.set("files.saveOriginalFormat","true");
  auto opaque=[](){return Document::fromImage(3,1,std::vector<Pixel>(3,0xff2040c0),U"Image save");};
  for(auto extension:{L".png",L".jpg",L".jpeg",L".webp",L".bmp",L".gif"}){
   const auto path=root/(std::wstring(L"source-image")+extension);auto source=opaque();
   if(saveImageFormat(path)==SaveImageFormat::Gif){source.setFrameDuration(40);source.addFrame();source.setFrameDuration(210);source.beginStroke({0,0},0xff00ff00);source.commitStroke();}
   writeExportBytesAtomic(path,encodeSaveImage(source,saveImageFormat(path)));openPath(path);
   check(pending_==Pending::None&&documentPath_.empty()&&document.sourceFilePath()==path,"Raster source admission");
   int prompts=0;chooseSaveFile_=[&](OPENFILENAMEW*){throw std::runtime_error("Raster CtrlS unexpectedly requested Save As");return false;};asepriteSaveDecisionForSmoke_=[&](bool,const auto&){++prompts;return 2;};
   const auto frames=document.timeline().state().frames.size(),history=document.historySize();
   document.beginStroke({2,0},0xff00ffff);document.commitStroke();saveProject(false);saveProject(false);finish();
   check(pending_==Pending::None&&!document.dirty()&&documentPath_.empty()&&document.sourceFilePath()==path&&document.historySize()==history+1&&prompts==0,"Raster source CtrlS/queue/savepoint");
   auto reopened=saveImageFormat(path)==SaveImageFormat::Gif?openGifAnimation(path):openRasterImage(path);check(reopened.width()==3&&reopened.height()==1,"Raster source re-open");
   const auto format=saveImageFormat(path);if(format==SaveImageFormat::Png||format==SaveImageFormat::Bmp)check(reopened.pixels()==document.pixels(),"Raster source exact pixel save");
   if(format==SaveImageFormat::Gif)check(gif_import::metadata(read(path)).frames.size()==frames,"Source GIF lost animation on CtrlS");
  }
  // All Save As filters, including vector/icon encoders; default preferences use
  // their legacy index and are independent from export preferences.
  for(unsigned filter=4;filter<=10;++filter){
   document=opaque();documentPath_.clear();document.markSaved();
   static constexpr SaveImageFormat formats[]={SaveImageFormat::Png,SaveImageFormat::Jpeg,SaveImageFormat::Webp,SaveImageFormat::Svg,SaveImageFormat::Ico,SaveImageFormat::Bmp,SaveImageFormat::Gif};
   const auto path=root/(L"save-as-"+std::to_wstring(filter)+saveImageExtension(formats[filter-4]));
   chooseSaveFile_=[&](OPENFILENAMEW* chooser){const auto name=path.wstring();wcsncpy_s(chooser->lpstrFile,chooser->nMaxFile,name.c_str(),_TRUNCATE);chooser->nFilterIndex=filter;return true;};
   const auto identity=document.identity(),history=document.historySize();saveProject(true);finish();
   check(pending_==Pending::None&&documentPath_==path&&!document.dirty()&&document.identity()==identity&&document.historySize()==history&&!read(path).empty(),"Raster Save As filter/savepoint");
  }
  for(int preference=1;preference<=5;++preference){
   document=opaque();documentPath_.clear();runtimePreferences_.set("files.saveFormat.Select",std::to_string(preference));
   const auto format=preferredSaveImageFormat(preference);const auto path=root/(L"default-"+std::to_wstring(preference)+saveImageExtension(format));
   chooseSaveFile_=[&](OPENFILENAMEW* chooser){check(chooser->nFilterIndex==unsigned(preference+3),"Default save preference selected wrong format");wcsncpy_s(chooser->lpstrFile,chooser->nMaxFile,path.c_str(),_TRUNCATE);return true;};
   saveProject(false);finish();check(pending_==Pending::None&&documentPath_==path&&!document.dirty()&&!read(path).empty(),"Default raster format save");
  }
  runtimePreferences_.set("files.saveFormat.Select","0");
  const auto layeredPath=root/"layered.png";document=opaque();writeExportBytesAtomic(layeredPath,encodeSaveImage(document,SaveImageFormat::Png));document.setSourceFilePath(layeredPath);documentPath_.clear();document.addLayer();
  const auto originalRaster=read(layeredPath);asepriteSaveDecisionForSmoke_=[&](bool preferred,const auto& issues){check(!preferred&&std::find(issues.begin(),issues.end(),"layers")!=issues.end(),"Layered PNG warning missing");return 0;};
  saveProject(false);check(pending_==Pending::None&&document.dirty()&&read(layeredPath)==originalRaster,"Layered PNG cancel overwrote source");
  asepriteSaveDecisionForSmoke_=[&](bool,const auto&){document.addFrame();return 2;};saveProject(false);
  check(pending_==Pending::OpenError&&read(layeredPath)==originalRaster&&document.dirty(),"Raster compatibility approval accepted new frame loss");resolve(false);
  asepriteSaveDecisionForSmoke_=[](bool,const auto&){return 2;};saveProject(false);finish();check(pending_==Pending::None&&!document.dirty()&&document.timeline().state().frames.size()==2&&document.timeline().state().layers.size()==2,"Approved PNG loss changed live document");
  document.beginStroke({1,0},0xffaa1122);document.commitStroke();const auto preservedRaster=root/"preserved-image.moonsprite";
  asepriteSaveDecisionForSmoke_=[](bool,const auto&){return 1;};chooseSaveFile_=[&](OPENFILENAMEW* chooser){wcsncpy_s(chooser->lpstrFile,chooser->nMaxFile,preservedRaster.c_str(),_TRUNCATE);chooser->nFilterIndex=1;return true;};
  saveProject(false);finish();check(pending_==Pending::None&&documentPath_==preservedRaster&&!document.dirty()&&document.sourceArchive()&&document.timeline().state().frames.size()==2&&document.timeline().state().layers.size()==2,"Raster complete-project choice");
  document=opaque();documentPath_.clear();document.setSourceFilePath(layeredPath);document.markSaved();runtimePreferences_.set("files.saveOriginalFormat","false");
  asepriteSaveDecisionForSmoke_=[](bool preferred,const auto&){if(!preferred)throw std::runtime_error("Disabled original raster save did not ask for project");return 0;};const auto beforeDisabled=read(layeredPath);saveProject(false);check(pending_==Pending::None&&documentPath_.empty()&&read(layeredPath)==beforeDisabled,"Disabled original raster preference cancel");
  runtimePreferences_.set("files.saveOriginalFormat","true");document=opaque();documentPath_.clear();const auto blockedImage=root/"blocked.png";std::filesystem::create_directory(blockedImage);document.setSourceFilePath(blockedImage);document.beginStroke({0,0},0xff123456);document.commitStroke();saveProject(false);saveProject(false);finish();
  check(pending_==Pending::OpenError&&document.dirty()&&documentPath_.empty()&&!queuedSaves_.empty(),"Raster failed commit falsely saved or discarded queue");resolve(false);document.setSourceFilePath(root/"retry.png");finish();check(pending_==Pending::None&&!document.dirty()&&std::filesystem::is_regular_file(root/"retry.png"),"Raster queued retry did not recover");
  chooseSaveFile_=std::move(originalChooser);asepriteSaveDecisionForSmoke_=std::move(originalDecision);
  std::ofstream(root/"result.txt")<<"Actual ASE and raster source Save/SaveAs/default formats/queue/newer-generation/loss choices/preference cancel/failure retry passed. File chooser injected; compatibility dialog opened and selected via shared choice callback. ASE creates no project backups. Native preservation uses existing project save. No visual acceptance claimed.\n";refresh();
 }catch(...){chooseSaveFile_=std::move(originalChooser);asepriteSaveDecisionForSmoke_=std::move(originalDecision);throw;}
}
}
