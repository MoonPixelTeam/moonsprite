#include "editor_implementation.h"
#include "editor.h"
#include "pending_gradient_dialog.h"
#include "project_import.h"
#include "image_decode.h"
#include <fstream>
namespace moon::editor {
void Editor::smokePendingGradientIo(){
 smoke_=true;playing_=false;paletteFocused_=false;
 const auto root=assets_.parent_path()/"pending-gradient-io-owned"/(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(root);
 recoveryDirectory_=root/"recovery";exportMemoryPathOverride_=root/"memory.txt";exportPresetPathOverride_=root/"presets.txt";recentExportPathsPathOverride_=root/"recent.txt";recentExportDirectoryPathOverride_=root/"directory.txt";
 runtimePreferences_.set("files.projectBackupEnabled","false");runtimePreferences_.set("files.exportSoundEnabled","false");
 auto check=[](bool v,const char* why){if(!v)throw std::runtime_error(why);};
 auto oldChooser=chooseSaveFile_;auto oldClose=closeRequested;int closes=0;closeRequested=[&]{++closes;};
 auto seed=[&](const char* name){
  check(!saveWorker_.valid()&&backgroundSaves_.empty(),"Previous gradient fixture still saving");
  cancelGradientGesture();projects_.clear();activeProject_=0;document=Document(5,3);documentPath_=root/name;documentOpen_=true;homeOpen_=false;pending_=Pending::None;closingWorkspace_=false;
  queuedSaves_.clear();gradientTool_=true;gradientConfirm_=true;gradientRight_=gradientFreeform_=false;gradientDragging_=false;gradientOptions_={};gradientSpec_={};
  ink_=0xff0000ff;document.setPaletteRole(ink_,false,true);document.setPaletteRole(0xffff0000,true,true);document.markSaved();ensureProjects();refresh();
 };
 auto preview=[&]{check(document.beginGradient({0,0},gradientOptions_),"Cannot seed gradient");gradientSpec_.start={0,0};gradientSpec_.end={4,0};gradientIdentity_=document.identity();gradientContent_=document.contentRevision();gradientLayer_=document.layer().id;gradientFrame_=document.frame().id;gradientPending_=gradientRequest_=true;gradientTick();check(document.gradientActive()&&document.gradientContextValid(),"Invalid gradient context");};
 int prompts=0;bool screenshot=false;std::exception_ptr callbackError;
 auto choice=[&](int value,std::function<void()> before={}){gradientIoDialogForSmoke_=[&,value,before](ui::Window& window){auto& popup=dynamic_cast<PendingGradientDialog&>(window);++prompts;try{if(before)before();if(!screenshot){manager()->invalidate();manager()->flushRedraw();writeSmokeFrame(display()->nativeSurface().get(),root/"pending-gradient.bmp");screenshot=true;}}catch(...){callbackError=std::current_exception();}popup.smokeChoose(value);};};
 auto verifyCallback=[&]{if(callbackError)std::rethrow_exception(callbackError);};
 auto finish=[&]{const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(20);while(pending_==Pending::Saving){check(std::chrono::steady_clock::now()<deadline,"Gradient save timeout");saveTick();if(saveWorker_.valid())saveWorker_.wait_for(std::chrono::milliseconds(1));}check(pending_==Pending::None,"Gradient save failed");};
 auto reopened=[&](const std::filesystem::path& path){std::ifstream file(path,std::ios::binary);check(bool(file),"Missing gradient project");auto bytes=std::make_shared<const project::Bytes>((std::istreambuf_iterator<char>(file)),std::istreambuf_iterator<char>());return project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(bytes)));};
 auto key=[&](const std::string& id){auto bindings=shortcutBindings_;shortcuts::assign(shortcutBindings_,id,"F9");requestFocus();ui::KeyMessage message(ui::kKeyDownMessage,ui::kKeyF9,ui::kKeyNoneModifier,0,0);const auto result=routeShortcutMessage(&message);shortcutBindings_=bindings;check(result==1,"IO shortcut not routed");};
 try{
  for(bool saveAs:{false,true})for(int value:{0,1,2}){
   seed((std::string(saveAs?"save-as-":"save-")+std::to_string(value)+".moonsprite").c_str());preview();const auto expected=*document.gradientPreviewPixels(),baseline=document.pixels();const auto history=document.historySize();const auto path=documentPath_;
   int chooser=0;chooseSaveFile_=[&](OPENFILENAMEW* dialog){++chooser;wcsncpy_s(dialog->lpstrFile,dialog->nMaxFile,path.c_str(),_TRUNCATE);dialog->nFilterIndex=1;return true;};choice(value);const int before=prompts;
   menuItems_.at(saveAs?"saveAs":"save")->Click();verifyCallback();finish();check(prompts==before+1,"Save menu bypassed pending gradient");
   if(value==0){std::ofstream(root/"cancel-state.txt")<<"active="<<document.gradientActive()<<" dirty="<<document.dirty()<<" history="<<document.historySize()<<" expectedHistory="<<history<<" pixelsEqual="<<(document.pixels()==baseline)<<" exists="<<std::filesystem::exists(path)<<" chooser="<<chooser<<" prompts="<<prompts<<" pending="<<int(pending_)<<" status="<<winrt::to_string(std::wstring(status_.begin(),status_.end()))<<"\n";check(document.gradientActive()&&!document.dirty()&&document.historySize()==history&&document.pixels()==baseline&&!std::filesystem::exists(path)&&chooser==0,"Continue editing changed preview/file/history");}
   else if(value==1){check(!document.active()&&!document.dirty()&&document.historySize()==history&&document.pixels()==baseline,"Discard changed clean pixels/history");if(saveAs)check(reopened(path).pixels()==baseline,"Discard SaveAs wrote preview");}
   else{check(!document.active()&&!document.dirty()&&document.historySize()==history+1&&reopened(path).pixels()==expected,"Apply did not save preview");document.undo();check(document.pixels()==baseline,"Applied gradient undo");document.redo();check(document.pixels()==expected,"Applied gradient redo");}
  }
  for(const auto& id:{"save","exportDocument","closeDocument"}){seed("shortcut.moonsprite");preview();choice(0);int before=prompts;key(id);verifyCallback();check(prompts==before+1&&document.gradientActive()&&pending_==Pending::None&&documentOpen_,"Shortcut silently discarded gradient");}
  for(auto scancode:{ui::kKeyS,ui::kKeyE,ui::kKeyW}){seed("default-shortcut.moonsprite");preview();choice(0);const auto bindings=shortcutBindings_;shortcutBindings_=shortcuts::defaults();requestFocus();const int before=prompts;ui::KeyMessage message(ui::kKeyDownMessage,scancode,ui::kKeyCtrlModifier,0,0);onProcessMessage(&message);shortcutBindings_=bindings;check(prompts==before+1&&document.gradientActive()&&pending_==Pending::None,"Default Ctrl IO path lost pending gradient");}
  seed("menu-focus.moonsprite");preview();auto fileMenu=static_cast<ui::MenuItem*>(menuBar_->getMenu()->children()[1]);fileMenu->openSubmenu();manager()->dispatchMessages();check(fileMenu->hasSubmenuOpened()&&document.gradientActive(),"Opening actual menu discarded gradient");menuBar_->cancelMenuLoop();manager()->dispatchMessages();requestFocus();choice(0);const int menuPrompt=prompts;menuItems_.at("save")->Click();check(prompts==menuPrompt+1&&document.gradientActive(),"Menu focus return discarded gradient");
  // Every export family must resolve before changing export state or opening its next dialog.
  const std::vector<std::function<void()>> exports={ [this]{openDocumentExport();},[this]{openStaticExport();},[this]{openGifExport();},[this]{openFramePngExport(false);},[this]{openSpriteSheet();},[this]{openAsepriteExport(false);},[this]{openAsepriteExport(true);},[this]{openIcoExport();},[this]{openBmpExport();},[this]{openSvgExport();} };
  for(const auto& run:exports){seed("export-cancel.moonsprite");preview();choice(0);int before=prompts;const auto caption=discard_->caption;run();verifyCallback();check(prompts==before+1&&document.gradientActive()&&pending_==Pending::None&&discard_->caption==caption,"Export cancel changed dialog/preview");}
  for(std::size_t i=0;i<exports.size();++i)for(int value:{1,2}){
   seed("export-routes.moonsprite");preview();const auto baseline=document.pixels(),expected=*document.gradientPreviewPixels();choice(value);int nextDialogs=0;
   ui::Timer closer(40,this);closer.Tick.connect([&]{auto focus=manager()->getFocus();auto popup=focus?focus->window():nullptr;if(popup&&popup!=window()&&!dynamic_cast<PendingGradientDialog*>(popup)){++nextDialogs;popup->closeWindow(nullptr);}});if(i==5||i==6)closer.start();exports[i]();closer.stop();verifyCallback();
   check(!document.active()&&document.pixels()==(value==2?expected:baseline),"Export family ignored gradient choice");
   if(i==5||i==6)check(nextDialogs==1,"ASE/PSD did not open after gradient decision");else{check(pending_!=Pending::None,"Export family did not continue");resolve(false);}
  }
  for(bool animated:{false,true})for(int value:{1,2}){seed("export-continue.moonsprite");preview();const auto baseline=document.pixels(),expected=*document.gradientPreviewPixels();choice(value);if(animated)openGifExport();else openStaticExport();check(pending_==(animated?Pending::GifExport:Pending::StaticExport)&&!document.active()&&document.pixels()==(value==2?expected:baseline),"Export did not continue with chosen pixels");if(!animated){const auto path=root/(value==2?"applied.png":"discarded.png");writeCurrentStaticExport(path);check(openRasterImage(path).pixels()==document.pixels(),"PNG pixels differ from chosen gradient");}resolve(false);}
  for(auto action:{Pending::CloseDocument,Pending::Close})for(int value:{0,1,2}){seed("close.moonsprite");preview();choice(value);const int before=closes;ask(action);verifyCallback();if(value==0)check(documentOpen_&&document.gradientActive()&&pending_==Pending::None&&!closingWorkspace_,"Close cancel lost preview/workspace");else if(value==1)check(!documentOpen_&&closes==before+(action==Pending::Close?1:0),"Clean close did not discard/continue");else{check(documentOpen_&&pending_==action&&document.dirty()&&document.historySize()==1&&!document.active(),"Close apply bypassed dirty confirmation");resolve(false);check(documentOpen_&&!closingWorkspace_,"Dirty close cancel failed");}}
  seed("close-save.moonsprite");preview();const auto closePixels=*document.gradientPreviewPixels();const auto closePath=documentPath_;choice(2);ask(Pending::CloseDocument);check(pending_==Pending::CloseDocument,"Applied close has no save prompt");saveBeforeClose_->Click();finish();check(!documentOpen_&&reopened(closePath).pixels()==closePixels,"Save before close lost applied gradient");
  seed("dirty-close.moonsprite");document.beginStroke({4,2},0xff123456);document.commitStroke();preview();choice(1);ask(Pending::CloseDocument);check(pending_==Pending::CloseDocument&&document.dirty()&&document.historySize()==1,"Discard bypassed preexisting dirty confirmation");resolve(false);
  seed("replaced.moonsprite");preview();choice(2,[&]{document.cancelGradient();preview();});check(!resolveGradientForIo()&&document.gradientActive()&&!document.dirty(),"Stale choice authorized replacement preview");verifyCallback();
  seed("selection.moonsprite");preview();choice(2,[&]{document.previewSelection(SelectionMask{0,0,1,1,{}});});check(!resolveGradientForIo()&&!document.gradientActive()&&!document.dirty(),"Changed selection authorized stale apply");verifyCallback();
  seed("content.moonsprite");preview();choice(2,[&]{document.setLayerLocked(true);});check(!resolveGradientForIo()&&!document.gradientActive(),"Locked target authorized stale apply");verifyCallback();
  seed("playback.moonsprite");preview();choice(2,[&]{playing_=true;});check(!resolveGradientForIo()&&!document.gradientActive(),"Playback authorized stale gradient");playing_=false;verifyCallback();
  seed("reentrant.moonsprite");preview();choice(0,[&]{check(!saveProject(false),"Nested save proceeded");requestClose();check(!closingWorkspace_,"Nested close proceeded");});check(!resolveGradientForIo()&&document.gradientActive()&&!std::filesystem::exists(documentPath_),"Reentrant IO changed preview/file");verifyCallback();
  // A dismissed save must not hide the next gradient decision behind a queue
  // whose safe publication itself waits for that live preview to end.
  for(int operation:{0,1,2}){
   seed("background.moonsprite");asyncSaveForSmoke_=true;savePath(documentPath_,false);while(saveSnapshot_)saveTick();check(saveWorker_.valid(),"Background fixture did not dispatch");dismissSaveProgress();check(pending_==Pending::None&&backgroundSaves_.size()==1,"Background fixture did not dismiss");preview();choice(0);const int before=prompts;
   if(operation==0)saveProject(false);else if(operation==1)ask(Pending::CloseDocument);else requestClose();verifyCallback();check(prompts==before+1&&document.gradientActive()&&queuedSaves_.empty()&&deferredSaveCloses_.empty()&&!closeAfterBackgroundSaves_&&!closingWorkspace_,"Background IO queued before pending-gradient cancel");
   cancelGradientGesture();const auto limit=std::chrono::steady_clock::now()+std::chrono::seconds(20);while(!backgroundSaves_.empty()){check(std::chrono::steady_clock::now()<limit,"Background gradient fixture timeout");saveTick();std::this_thread::sleep_for(std::chrono::milliseconds(1));}asyncSaveForSmoke_=false;
  }
  seed("no-op.moonsprite");ink_=0;document.setPaletteRole(0,false,true);document.setPaletteRole(0,true,true);preview();choice(2);check(resolveGradientForIo()&&!document.active()&&!document.dirty()&&document.historySize()==0,"No-op apply failed or created history");
  seed("title-close.moonsprite");preview();choice(-1);check(!resolveGradientForIo()&&document.gradientActive(),"Title close discarded gradient");
  gradientIoDialogForSmoke_=[&](ui::Window& window){ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);dynamic_cast<PendingGradientDialog&>(window).onProcessMessage(&escape);};check(!resolveGradientForIo()&&document.gradientActive(),"Escape discarded pending gradient");
  std::ofstream(root/"passed.txt")<<"Actual editor pending-gradient IO checks passed; prompts="<<prompts<<'\n';
 }catch(...){gradientIoDialogForSmoke_={};chooseSaveFile_=oldChooser;closeRequested=oldClose;throw;}
 gradientIoDialogForSmoke_={};chooseSaveFile_=oldChooser;closeRequested=oldClose;cancelGradientGesture();
}
}
