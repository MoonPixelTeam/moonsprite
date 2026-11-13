#include "editor.h"
#include "project_manifest.h"
#include "project_file.h"
#include "brush_library_delete_dialog.h"
#include "ui/property.h"
#include <thread>
#include <future>
#include <deque>
namespace moon::editor {
namespace {
struct BrushImportResult {
 int success=0,failed=0;std::string error;
 std::uint64_t documentIdentity=0;std::filesystem::path directory;
 std::optional<StoredPatternBrush> last;std::optional<PatternBrush> loaded;
};
// Legacy brush-library-service imports paths sequentially, accumulating failures.
// Captured paths and CPU pixels belong to the worker, never Editor/UI objects.
BrushImportResult importBrushFiles(const std::filesystem::path& directory,const std::vector<std::filesystem::path>& paths,const std::string& folder){
 BrushImportResult result;
 try{PatternBrushLibrary library(directory);for(const auto& path:paths){try{
  auto imported=importPatternBrush(path);auto value=library.save(utf8Text(imported.name),encodePatternBrushPng(imported.brush));
  if(!folder.empty())value=library.move(value.id,folder);
  result.last=std::move(value);result.loaded=std::move(imported.brush);++result.success;
 }catch(const std::exception& error){if(result.error.empty())result.error=error.what();++result.failed;}}}
 catch(const std::exception& error){result.error=error.what();result.failed=int(paths.size());}
 return result;
}
struct BrushImportWork final:ui::Property {
 struct Request {std::filesystem::path directory;std::vector<std::filesystem::path> paths;std::string folder;std::uint64_t documentIdentity=0;};
 std::uint64_t activeDocument=0;std::filesystem::path activeDirectory;
 std::future<BrushImportResult> future;ui::Timer timer;bool pending=false;
 std::deque<Request> queued;
 BrushImportWork(ui::Widget* owner):ui::Property("moonsprite.brush-import"),timer(16,owner){}
 void start(Request request){
  if(pending){queued.push_back(std::move(request));return;}
  activeDocument=request.documentIdentity;activeDirectory=request.directory;
  std::promise<BrushImportResult> promise;future=promise.get_future();pending=true;
  std::thread([request=std::move(request),promise=std::move(promise)]()mutable{
   try{promise.set_value(importBrushFiles(request.directory,request.paths,request.folder));}
   catch(...){promise.set_exception(std::current_exception());}
  }).detach();timer.start();
 }
 ~BrushImportWork(){
  // Property teardown happens after Editor members are gone. Drain storage
  // without starting timers/workers or invoking any UI publication callbacks.
  timer.stop();
  if(pending&&future.valid())try{future.get();}catch(...){}
  for(const auto& request:queued)try{(void)importBrushFiles(request.directory,request.paths,request.folder);}catch(...){}
 }
 std::optional<BrushImportResult> poll(){
  if(!pending||future.wait_for(std::chrono::seconds(0))!=std::future_status::ready)return {};
  BrushImportResult result;try{result=future.get();}catch(const std::exception& error){result.error=error.what();result.failed=1;}
  catch(...){result.error="Unknown brush import failure";result.failed=1;}
  result.documentIdentity=activeDocument;result.directory=activeDirectory;
  pending=false;
  if(!queued.empty()){auto request=std::move(queued.front());queued.pop_front();start(std::move(request));}else timer.stop();
  return result;
 }

};
struct BrushScanResult {PatternBrushListing listing;std::string folder,key,error;std::vector<BrushLibraryPanel::Resource> local;int failed=0;};
// Worker owns paths and decoded CPU pixels only; no Editor/UI/COM objects cross
// threads. A promise future does not join the reader when the owner closes.
struct BrushScanWork final:ui::Property {
 std::future<BrushScanResult> future;std::string key;bool pending=false,menuRequested=false;ui::Timer timer;
 std::optional<BrushScanResult> loaded;std::unordered_map<std::string,std::size_t> localIndex;std::unordered_map<std::string,std::vector<std::string>> folderOrder;std::uint64_t loadedDocument=0,publishedProjectRevision=0;std::filesystem::path loadedDirectory;
 BrushScanWork(ui::Widget* owner):ui::Property("moonsprite.brush-scan"),timer(16,owner){}
 void start(std::filesystem::path directory,std::string folder,std::string requestKey){
  key=requestKey;pending=true;std::promise<BrushScanResult> promise;future=promise.get_future();
  std::thread([directory=std::move(directory),folder=std::move(folder),requestKey=std::move(requestKey),promise=std::move(promise)]()mutable{
   BrushScanResult result;result.folder=folder;result.key=requestKey;
   try{result.listing=PatternBrushLibrary(directory).list();if(!result.folder.empty()&&std::none_of(result.listing.folders.begin(),result.listing.folders.end(),[&](const auto& value){return value.id==result.folder;}))result.folder.clear();
    for(const auto& item:result.listing.brushes){try{auto loaded=importPatternBrush(std::filesystem::u8path(item.filePath));loaded.brush.selectionColorMapping=item.sourceX.has_value()&&item.sourceY.has_value();loaded.brush.sourceX=item.sourceX.value_or(0);loaded.brush.sourceY=item.sourceY.value_or(0);result.local.push_back({item.id,unicodeText(item.name),std::move(loaded.brush)});}catch(...){++result.failed;}}
   }catch(const std::exception& error){result.error=error.what();}catch(...){result.error="Unknown brush library scan failure";}
   promise.set_value(std::move(result));
  }).detach();timer.start();
 }
};
}
namespace {
std::shared_ptr<BrushScanWork> requestBrushMenuScan(ui::Widget* owner){
 auto scan=std::dynamic_pointer_cast<BrushScanWork>(owner->getProperty("moonsprite.brush-scan"));
 if(scan)scan->menuRequested=true;return scan;
}
}
std::filesystem::path Editor::brushLibraryPreferencePath()const{return palettePreferencePath().parent_path()/"brush-library-panel-v1.txt";}
void Editor::createBrushLibraryPanel(){
 brushLibraryPanel_=new BrushLibraryPanel(font_,skin_,toolIcons_);addChild(brushLibraryPanel_);brushLibraryPanel_->setVisible(false);
 if(!smoke_)try{const auto path=brushLibraryPreferencePath();if(std::filesystem::exists(path)){std::ifstream in(path);std::string version;int visible,size;if(!(in>>version>>visible>>size)||version!="brush-library-panel-v1"||(visible!=0&&visible!=1)||(size!=30&&size!=40&&size!=52))throw std::runtime_error("Invalid brush library panel preferences");brushLibraryPanelOpen_=visible!=0;brushLibraryPanel_->setSize(size);}}catch(const std::exception& e){brushLibraryPreferencesReadable_=false;status_=U"图案笔刷栏目偏好读取失败："+unicodeText(e.what());}
 brushLibraryPanel_->select=[this](const std::string& id,bool ctrl,bool shift){selectBrushLibraryItem(id,ctrl,shift);};
 brushLibraryPanel_->navigate=[this](const std::string& id){fillFolder_=id;currentTools().fillLibrarySelection.anchor.clear();refresh();};

 brushLibraryPanel_->reorder=[this](const std::vector<std::string>& expected,const std::vector<std::string>& next){if(pending_!=Pending::None||currentDocument().active())return;try{PatternBrushLibrary library(fillBrushLibraryDirectory());std::vector<std::string> current;for(const auto& item:library.list().brushes)current.push_back(item.id);if(current!=expected)throw std::runtime_error("Brush library changed during drag; refresh and try again");library.reorder(next);status_=U"图案顺序已保存";}catch(const std::exception& e){status_=U"图案排序失败："+unicodeText(e.what());}brushLibraryNeedsReload_=true;refresh();};
 brushLibraryPanel_->moveToFolder=[this](const std::vector<std::string>& ids,const std::string& folder){if(pending_!=Pending::None||currentDocument().active())return;try{PatternBrushLibrary library(fillBrushLibraryDirectory());library.moveGroup(ids,folder);status_=U"图案已移动到文件夹";}catch(const std::exception& e){status_=U"图案移动失败："+unicodeText(e.what());}brushLibraryNeedsReload_=true;refresh();};
 brushLibraryPanel_->context=[this]{showColumnContextMenu(Column(12));};brushLibraryPanel_->remove=[this]{if(pending_==Pending::None&&!currentDocument().active()&&!currentTools().fillLibrarySelection.ids.empty())confirmFillLibraryDelete();};
 const char* icons[]{"plus","delete","moreLines"};for(int i=0;i<3;++i){auto b=new PixelButton(font_,skin_,U"",[this,i]{if(i==0)showBrushLibraryAdd();else if(i==1)confirmFillLibraryDelete();else showBrushLibraryActions();});b->iconSkin=&toolIcons_;b->icon=icons[i];addChild(b);b->setVisible(false);brushLibraryActions_[i]=b;}
 menuCommands_.bind("toggleBrushLibraryPanel",{[this]{const bool next=!brushLibraryPanelOpen_;try{if(!smoke_){if(!brushLibraryPreferencesReadable_)throw std::runtime_error("Brush library preferences are unreadable");const auto text=std::string("brush-library-panel-v1 ")+(next?"1":"0")+" "+std::to_string(brushLibraryPanel_->swatchSize())+"\n";writeExportBytesAtomic(brushLibraryPreferencePath(),{text.begin(),text.end()});}brushLibraryPanelOpen_=next;initializeDocking();docking_.custom=true;if(next){docking_.select(12);brushLibraryNeedsReload_=true;}else requestFocus();refresh();saveWorkspaceSizes();}catch(const std::exception& e){status_=U"图案笔刷栏目保存失败："+unicodeText(e.what());refresh();}},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None;},[this]{return brushLibraryPanelOpen_;}});
 // Legacy BrushLibraryPanel shortcut handler reuses its existing actions.
 auto available=[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!currentDocument().active()&&brushLibraryPanel_->isVisible();};
 menuCommands_.bind("importBrushImage",{[this]{importFillImage();},available,{}});
 menuCommands_.bind("createBrushFolder",{[this]{editFillFolder(false);},available,{}});
 menuCommands_.bind("openBrushFolder",{[this]{try{PatternBrushLibrary library(fillBrushLibraryDirectory());const auto directory=fillBrushLibraryDirectory();const auto result=reinterpret_cast<INT_PTR>(ShellExecuteW(nullptr,L"open",directory.c_str(),nullptr,nullptr,SW_SHOWNORMAL));if(result<=32)throw std::runtime_error("Cannot open brush library folder");}catch(const std::exception& e){status_=U"无法打开笔刷文件夹："+unicodeText(e.what());refresh();}},available,{}});
 menuCommands_.bind("refreshBrushLibrary",{[this]{syncBrushLibraryPanel(true);refresh();},available,{}});
 menuCommands_.bind("brushLibraryParentFolder",{[this]{const auto slash=fillFolder_.find_last_of('/');brushLibraryPanel_->navigate(slash==std::string::npos?std::string{}:fillFolder_.substr(0,slash));},[this,available]{return available()&&!fillFolder_.empty();},{}});
 const int sizes[]{30,40,52};const char* ids[]{"brushSwatchSmall","brushSwatchMedium","brushSwatchLarge"};for(int i=0;i<3;++i)menuCommands_.bind(ids[i],{[this,value=sizes[i]]{try{if(!smoke_){if(!brushLibraryPreferencesReadable_)throw std::runtime_error("Brush library preferences are unreadable");const auto text=std::string("brush-library-panel-v1 ")+(brushLibraryPanelOpen_?"1":"0")+" "+std::to_string(value)+"\n";writeExportBytesAtomic(brushLibraryPreferencePath(),{text.begin(),text.end()});}brushLibraryPanel_->setSize(value);refresh();}catch(const std::exception& e){status_=U"图案尺寸偏好保存失败："+unicodeText(e.what());}},available,[this,value=sizes[i]]{return brushLibraryPanel_->swatchSize()==value;}});
 menuCommands_.bind("deleteBrushSelection",{[this]{confirmFillLibraryDelete();},[this,available]{return available()&&!currentTools().fillLibrarySelection.ids.empty();},{}});
 if(brushLibraryPanelOpen_){initializeDocking();docking_.custom=true;}
}
void Editor::syncBrushLibraryPanel(bool reload){
 if(!brushLibraryPanel_)return;
 std::string key=std::to_string(currentDocument().identity())+":"+fillBrushLibraryDirectory().u8string();
 if(key!=brushLibraryResourceKey_){brushLibraryResourceKey_=key;brushLibraryNeedsReload_=true;}
 auto scan=std::dynamic_pointer_cast<BrushScanWork>(getProperty("moonsprite.brush-scan"));
 if(!scan){scan=std::make_shared<BrushScanWork>(this);scan->timer.Tick.connect([this]{syncBrushLibraryPanel();});setProperty(scan);}
 const bool visible=(brushLibraryPanelOpen_||scan->menuRequested)&&documentOpen_&&!homeOpen_;
 if(reload)brushLibraryNeedsReload_=true;
 // Project resources already live in memory; publishing them must not read
 // the local library again (legacy useBrushLibrary keeps these dependencies separate).
 auto publish=[&]{
  auto& result=*scan->loaded;const auto& index=scan->localIndex;
  if(!fillFolder_.empty()&&std::none_of(result.listing.folders.begin(),result.listing.folders.end(),[&](const auto& folder){return folder.id==fillFolder_;}))fillFolder_.clear();
  std::vector<BrushLibraryPanel::Resource> visibleLocal,project;
  const auto order=scan->folderOrder.find(fillFolder_);if(order!=scan->folderOrder.end())for(const auto& id:order->second)visibleLocal.push_back(result.local[index.at(id)]);
  for(const auto& item:currentDocument().projectBrushes())project.push_back({"project:"+item.metadata.id,unicodeText(item.metadata.name),item.brush});
  // Legacy controller refresh removes unavailable members from the live set,
  // retaining the existing pixels/order of surviving choices and active item.
  auto selection=currentTools().fillLibrarySelection;std::vector<PatternBrush> retained;std::u32string activeName;std::optional<PatternBrush> active;
  for(std::size_t i=0;i<currentTools().fillLibrarySelection.ids.size();++i){const auto& id=currentTools().fillLibrarySelection.ids[i];bool valid=false;
   if(id.rfind("project:",0)==0)valid=std::any_of(project.begin(),project.end(),[&](const auto& value){return value.id==id;});else valid=index.count(id)!=0;
   if(!valid)selection.removed(id);
  }
  const bool pruned=selection.ids!=currentTools().fillLibrarySelection.ids;
  if(pruned){
   for(const auto& id:selection.ids){const auto previous=std::find(currentTools().fillLibrarySelection.ids.begin(),currentTools().fillLibrarySelection.ids.end(),id);const auto position=std::size_t(previous-currentTools().fillLibrarySelection.ids.begin());const PatternBrush* brush=nullptr;std::u32string label;
    if(id.rfind("project:",0)==0){const auto item=std::find_if(project.begin(),project.end(),[&](const auto& value){return value.id==id;});brush=&item->brush;label=item->name;}else{const auto& item=result.local[index.at(id)];brush=&item.brush;label=item.name;}
    if(position<currentTools().fillPattern.brushes.size())brush=&currentTools().fillPattern.brushes[position];
    if(id==selection.active){active=*brush;activeName=std::move(label);}retained.push_back(*brush);
   }
  }

  brushLibraryPanel_->setResources(result.listing,fillFolder_,visibleLocal,project);
  result.folder=fillFolder_;scan->publishedProjectRevision=currentDocument().projectBrushRevision();
  if(pruned){currentTools().fillLibrarySelection=std::move(selection);currentTools().fillPattern.brushes=std::move(retained);currentTools().pencilImageBrushId=currentTools().fillLibrarySelection.active;currentTools().pencilImageBrush=std::move(active);currentTools().fillImageName=std::move(activeName);saveBrushPreferences();}
 };
 // Keep at most one scan running. Changes coalesce into the next generation.
 if(scan->pending&&scan->future.wait_for(std::chrono::seconds(0))==std::future_status::ready){
  auto result=scan->future.get();scan->pending=false;scan->timer.stop();
  if(visible&&result.key==key&&!brushLibraryNeedsReload_){
   if(result.error.empty()){
    if(!fillFolder_.empty()&&std::none_of(result.listing.folders.begin(),result.listing.folders.end(),[&](const auto& folder){return folder.id==fillFolder_;}))fillFolder_.clear();
    result.folder=fillFolder_;
    std::unordered_map<std::string,std::size_t> index;for(std::size_t i=0;i<result.local.size();++i)index.emplace(result.local[i].id,i);
    std::unordered_map<std::string,std::vector<std::string>> folders;
    for(const auto& item:result.listing.brushes){const auto found=index.find(item.id);if(found==index.end())continue;folders[item.folderId].push_back(item.id);}
    if(result.failed)status_=U"图案缩略图读取失败："+unicodeText(std::to_string(result.failed));
    scan->loaded=std::move(result);scan->localIndex=std::move(index);scan->folderOrder=std::move(folders);scan->loadedDocument=currentDocument().identity();scan->loadedDirectory=fillBrushLibraryDirectory();scan->menuRequested=false;
    publish();
   }
   else{scan->menuRequested=false;status_=U"图案笔刷库读取失败："+unicodeText(result.error);}
  }else brushLibraryNeedsReload_=true;
 }
 if(brushLibraryNeedsReload_&&visible&&!scan->pending){scan->start(fillBrushLibraryDirectory(),fillFolder_,key);brushLibraryNeedsReload_=false;}
 // Publish project changes even while a local refresh is in flight. The
 // eventual scan also merges the latest project collection, never its snapshot.
 if(visible&&scan->loaded&&scan->loadedDocument==currentDocument().identity()&&scan->loadedDirectory==fillBrushLibraryDirectory()&&
    (scan->publishedProjectRevision!=currentDocument().projectBrushRevision()||(!scan->pending&&!brushLibraryNeedsReload_&&scan->loaded->folder!=fillFolder_)))publish();
 // Existing deterministic UI fixtures explicitly wait; production only polls.
 if(smoke_&&scan->pending){scan->future.wait();syncBrushLibraryPanel();return;}
 brushLibraryPanel_->syncSelection(currentTools().fillLibrarySelection.ids,pending_==Pending::None&&!currentDocument().active());brushLibraryActions_[0]->setEnabled(pending_==Pending::None&&!currentDocument().active());brushLibraryActions_[1]->setEnabled(pending_==Pending::None&&!currentDocument().active()&&!currentTools().fillLibrarySelection.ids.empty());brushLibraryActions_[2]->setEnabled(pending_==Pending::None&&!currentDocument().active());
}
void Editor::layoutBrushLibraryPanel(){if(!brushLibraryPanel_)return;const bool show=columnShown(12)&&documentOpen_&&!homeOpen_;brushLibraryPanel_->setVisible(show);for(auto b:brushLibraryActions_)b->setVisible(show);if(!show){brushLibraryPanel_->cancelPending();return;}const auto chrome=columnChrome(12);brushLibraryPanel_->setBounds(toDisplay(chrome.content));for(int i=0;i<3;++i)brushLibraryActions_[i]->setBounds(toDisplay({chrome.actions.x+i*(15+UiSpacing::related),chrome.actions.y,15,15}));}
void Editor::applyFillLibrarySelection(){
    const auto scan=std::dynamic_pointer_cast<BrushScanWork>(getProperty("moonsprite.brush-scan"));
    const bool cached=scan&&scan->loaded&&scan->loadedDocument==currentDocument().identity()&&scan->loadedDirectory==fillBrushLibraryDirectory();
    // Session/fixture restoration before first load retains the explicit loader.
    std::optional<PatternBrushListing> listing;if(!cached)listing=PatternBrushLibrary(fillBrushLibraryDirectory()).list();std::vector<PatternBrush> brushes;std::optional<PatternBrush> active;std::u32string name;
    for(const auto& id:currentTools().fillLibrarySelection.ids){
      PatternBrush brush;std::u32string label;
      if(id.rfind("project:",0)==0){const auto resource=std::find_if(currentDocument().projectBrushes().begin(),currentDocument().projectBrushes().end(),[&](const auto& value){return value.metadata.id==id.substr(8);});if(resource==currentDocument().projectBrushes().end())throw std::runtime_error("Project brush no longer exists");brush=resource->brush;label=unicodeText(resource->metadata.name);}
      else if(cached){const auto found=scan->localIndex.find(id);if(found==scan->localIndex.end())throw std::runtime_error("Local brush is not loaded: "+id);const auto& item=scan->loaded->local[found->second];brush=item.brush;label=item.name;}
      else{const auto item=std::find_if(listing->brushes.begin(),listing->brushes.end(),[&](const auto& value){return value.id==id;});if(item==listing->brushes.end())throw std::runtime_error("Local brush no longer exists");brush=importPatternBrush(std::filesystem::u8path(item->filePath)).brush;brush.selectionColorMapping=item->sourceX.has_value()&&item->sourceY.has_value();brush.sourceX=item->sourceX.value_or(0);brush.sourceY=item->sourceY.value_or(0);label=unicodeText(item->name);}
      if(id==currentTools().fillLibrarySelection.active){active=brush;name=label;}brushes.push_back(std::move(brush));
    }
    if(!currentTools().fillLibrarySelection.active.empty()&&!active)throw std::runtime_error("Active brush is not selected");
    // Commit only after every resource loaded; a failure preserves live pixels.
    if(active&&!currentTools().temporaryBrushReturnProfile)currentTools().temporaryBrushReturnProfile=currentTools().brushProfiles[0];
    currentTools().temporaryBrushActive=false;currentTools().fillPattern.brushes=std::move(brushes);currentTools().fillImageName=std::move(name);currentTools().pencilImageBrushId=currentTools().fillLibrarySelection.active;currentTools().pencilImageBrush=std::move(active);
}

void Editor::selectBrushLibraryItem(const std::string& id,bool ctrl,bool shift){
 if(pending_!=Pending::None||currentDocument().active())return;
 try{
  const auto scan=std::dynamic_pointer_cast<BrushScanWork>(getProperty("moonsprite.brush-scan"));
  if(!scan||!scan->loaded||scan->loadedDocument!=currentDocument().identity()||scan->loadedDirectory!=fillBrushLibraryDirectory()||scan->loaded->folder!=fillFolder_)throw std::runtime_error("Brush library is loading; try again when ready");
  // Legacy's controller retains decoded resources across refreshes and folders.
  // Clicks must never rescan the filesystem or decode the chosen image again.
  const auto& loaded=*scan->loaded;std::vector<std::string> ordered;
  const auto folder=scan->folderOrder.find(fillFolder_);if(folder!=scan->folderOrder.end())ordered=folder->second;
  if(fillFolder_.empty())for(const auto& item:currentDocument().projectBrushes())ordered.push_back("project:"+item.metadata.id);
  if(std::find(ordered.begin(),ordered.end(),id)==ordered.end())throw std::runtime_error("Brush is not loaded in current folder");
  auto selection=currentTools().fillLibrarySelection;selection.select(ordered,id,ctrl,shift);
  std::vector<PatternBrush> brushes;std::optional<PatternBrush> active;std::u32string name;
  for(const auto& selected:selection.ids){
   const PatternBrush* brush=nullptr;std::u32string label;
   if(selected.rfind("project:",0)==0){const auto item=std::find_if(currentDocument().projectBrushes().begin(),currentDocument().projectBrushes().end(),[&](const auto& value){return value.metadata.id==selected.substr(8);});if(item!=currentDocument().projectBrushes().end()){brush=&item->brush;label=unicodeText(item->metadata.name);}}
   else{const auto item=scan->localIndex.find(selected);if(item!=scan->localIndex.end()){const auto& resource=loaded.local[item->second];brush=&resource.brush;label=resource.name;}}
   if(!brush)throw std::runtime_error("Selected brush is no longer loaded");
   if(selected==selection.active){active=*brush;name=std::move(label);}brushes.push_back(*brush);
  }
  if(!selection.active.empty()&&!active)throw std::runtime_error("Active brush is not selected");
  if(active&&!currentTools().temporaryBrushReturnProfile)currentTools().temporaryBrushReturnProfile=currentTools().brushProfiles[0];
  currentTools().temporaryBrushActive=false;currentTools().fillLibrarySelection=std::move(selection);currentTools().fillPattern.brushes=std::move(brushes);currentTools().fillImageName=std::move(name);currentTools().pencilImageBrushId=currentTools().fillLibrarySelection.active;currentTools().pencilImageBrush=std::move(active);
  saveBrushPreferences();status_=currentTools().fillLibrarySelection.ids.empty()?U"已停用图像笔刷":U"已选择图案："+currentTools().fillImageName;
 }catch(const std::exception& e){status_=U"图案选择失败："+unicodeText(e.what());}refresh();
}
void Editor::showPencilImageBrushes(){if(currentDocument().active())return;PixelMenu menu(skin_);auto clear=new PixelMenuItem(font_,skin_,U"普通笔刷");clear->Click.connect([this]{currentTools().temporaryBrushActive=false;currentTools().pencilImageBrushId.clear();currentTools().pencilImageBrush.reset();saveBrushPreferences();refresh();});menu.addChild(clear);syncBrushLibraryPanel();auto scan=requestBrushMenuScan(this);syncBrushLibraryPanel();
 const bool ready=scan&&scan->loaded&&scan->loadedDocument==currentDocument().identity()&&scan->loadedDirectory==fillBrushLibraryDirectory();
 if(ready){if(!scan->pending)scan->menuRequested=false;for(const auto& item:scan->loaded->local){auto row=new PixelMenuItem(font_,skin_,item.name);row->checked=[this,id=item.id]{return currentTools().pencilImageBrushId==id;};row->Click.connect([this,id=item.id,brush=item.brush,identity=currentDocument().identity(),directory=fillBrushLibraryDirectory()]{if(identity!=currentDocument().identity()||directory!=fillBrushLibraryDirectory())return;if(!currentTools().temporaryBrushReturnProfile)currentTools().temporaryBrushReturnProfile=currentTools().brushProfiles[0];currentTools().temporaryBrushActive=false;currentTools().pencilImageBrushId=id;currentTools().pencilImageBrush=brush;saveBrushPreferences();refresh();});menu.addChild(row);}}
 else{auto loading=new PixelMenuItem(font_,skin_,U"笔刷库加载中…");loading->setEnabled(false);menu.addChild(loading);}
 for(const auto& item:currentDocument().projectBrushes()){auto row=new PixelMenuItem(font_,skin_,U"工程："+unicodeText(item.metadata.name));row->checked=[this,id=item.metadata.id]{return currentTools().pencilImageBrushId=="project:"+id;};row->Click.connect([this,id=item.metadata.id,identity=currentDocument().identity()]{if(identity!=currentDocument().identity())return;currentTools().pencilImageBrushId="project:"+id;resolvePencilImageBrush();saveBrushPreferences();refresh();});menu.addChild(row);}
 menu.addChild(new PixelMenuSeparator(skin_));auto angleLabel=new PixelMenuItem(font_,skin_,U"角度（度）");angleLabel->setEnabled(false);menu.addChild(angleLabel);auto angle=new PixelEntry(font_,skin_);angle->numeric=true;angle->setText(std::to_string(int(currentTools().pencilImageBrushAngle)));menu.addChild(angle);angle->Change.connect([this,angle]{try{std::size_t used=0;double value=std::stod(angle->text(),&used);if(used==angle->text().size() && std::isfinite(value)){currentTools().pencilImageBrushAngle=std::clamp(value,-180.0,180.0);saveBrushPreferences();}}catch(...){} });auto at=imageBrushButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();}

void Editor::importBrushLibraryImages(const std::vector<std::filesystem::path>& paths,const std::string& targetFolder){
 auto work=std::dynamic_pointer_cast<BrushImportWork>(getProperty("moonsprite.brush-import"));
 if(!work){work=std::make_shared<BrushImportWork>(this);work->timer.Tick.connect([this]{importBrushLibraryImages({},{});});setProperty(work);}
 if(!paths.empty()){work->start({fillBrushLibraryDirectory(),paths,targetFolder,currentDocument().identity()});status_=U"正在导入图案…";}
 // Publish only between gestures, never replace the brush of an active stroke.
 if(!smoke_&&(currentDocument().active()||pending_!=Pending::None))return;
 if(smoke_&&work->pending)work->future.wait();
 auto completed=work->poll();if(!completed)return;
 auto result=std::move(*completed);
 auto& last=result.last;auto& loaded=result.loaded;
 try{
  if(last&&loaded&&result.documentIdentity==currentDocument().identity()&&result.directory==fillBrushLibraryDirectory()){
   // Legacy refresh resolves the new resource before activating it. Seed the
   // decoded controller before activation so project-only publication cannot
   // prune this new ID while the next directory scan is still pending.
   auto scan=std::dynamic_pointer_cast<BrushScanWork>(getProperty("moonsprite.brush-scan"));
   if(scan&&scan->loaded&&scan->loadedDocument==currentDocument().identity()&&scan->loadedDirectory==fillBrushLibraryDirectory()){
    const auto found=scan->localIndex.find(last->id);
    BrushLibraryPanel::Resource resource{last->id,unicodeText(last->name),*loaded};
    if(found==scan->localIndex.end()){scan->localIndex.emplace(last->id,scan->loaded->local.size());scan->loaded->local.push_back(std::move(resource));scan->loaded->listing.brushes.push_back(*last);scan->folderOrder[last->folderId].push_back(last->id);}
    else scan->loaded->local[found->second]=std::move(resource);
   }
   PatternBrushSelection selection;selection.ids={last->id};selection.active=selection.anchor=last->id;
   std::vector<PatternBrush> patterns{*loaded};auto active=*loaded;auto name=unicodeText(std::filesystem::u8path(last->filePath).stem().u8string());
   if(!currentTools().temporaryBrushReturnProfile)currentTools().temporaryBrushReturnProfile=currentTools().brushProfiles[0];
   currentTools().temporaryBrushActive=false;currentTools().fillLibrarySelection=std::move(selection);currentTools().fillPattern.brushes=std::move(patterns);currentTools().pencilImageBrushId=last->id;currentTools().pencilImageBrush=std::move(active);currentTools().fillImageName=std::move(name);saveBrushPreferences();
  }
  status_=U"已导入图案："+unicodeText(std::to_string(result.success));if(result.failed)status_+=U" · 失败 "+unicodeText(std::to_string(result.failed))+U"："+unicodeText(result.error);
 }catch(const std::exception& e){status_=U"图案导入失败："+unicodeText(e.what());}
 brushLibraryNeedsReload_=true;refresh();
 if(smoke_&&work->pending)importBrushLibraryImages({},{});
}

void Editor::selectFillLibraryBrush(const std::string& id,bool ctrl,bool shift){selectBrushLibraryItem(id,ctrl,shift);}

void Editor::showFillLibraryMenu(){

    PixelMenu menu(skin_);auto capture=new PixelMenuItem(font_,skin_,U"从选区创建笔刷");capture->Click.connect([this]{createFillBrushFromSelection();});menu.addChild(capture);auto folders=new PixelMenuItem(font_,skin_,U"文件夹…");folders->Click.connect([this]{showFillFolderMenu();});menu.addChild(folders);auto load=new PixelMenuItem(font_,skin_,U"导入图像…");load->Click.connect([this]{importFillImage();});menu.addChild(load);

    syncBrushLibraryPanel();auto scan=requestBrushMenuScan(this);syncBrushLibraryPanel();
    const bool ready=scan&&scan->loaded&&scan->loadedDocument==currentDocument().identity()&&scan->loadedDirectory==fillBrushLibraryDirectory()&&scan->loaded->folder==fillFolder_;
    if(ready){if(!scan->pending)scan->menuRequested=false;const auto order=scan->folderOrder.find(fillFolder_);if(order!=scan->folderOrder.end())for(const auto& id:order->second){const auto& item=scan->loaded->local[scan->localIndex.at(id)];auto row=new PixelMenuItem(font_,skin_,item.name);row->checked=[this,id]{return std::find(currentTools().fillLibrarySelection.ids.begin(),currentTools().fillLibrarySelection.ids.end(),id)!=currentTools().fillLibrarySelection.ids.end();};row->Click.connect([this,id]{selectFillLibraryBrush(id,(GetKeyState(VK_CONTROL)&0x8000)!=0,(GetKeyState(VK_SHIFT)&0x8000)!=0);});menu.addChild(row);}}
    else{auto loading=new PixelMenuItem(font_,skin_,U"笔刷库加载中…");loading->setEnabled(false);menu.addChild(loading);}

    if(fillFolder_.empty())for(const auto& resource:currentDocument().projectBrushes()){auto row=new PixelMenuItem(font_,skin_,U"工程 · "+unicodeText(resource.metadata.name));row->checked=[this,id="project:"+resource.metadata.id]{return std::find(currentTools().fillLibrarySelection.ids.begin(),currentTools().fillLibrarySelection.ids.end(),id)!=currentTools().fillLibrarySelection.ids.end();};row->Click.connect([this,id="project:"+resource.metadata.id]{selectFillLibraryBrush(id,(GetKeyState(VK_CONTROL)&0x8000)!=0,(GetKeyState(VK_SHIFT)&0x8000)!=0);});menu.addChild(row);}

    if(!currentTools().fillLibrarySelection.ids.empty()){auto remove=new PixelMenuItem(font_,skin_,U"删除选中图案…");remove->Click.connect([this]{confirmFillLibraryDelete();});menu.addChild(remove);}if(!currentTools().fillPattern.brushes.empty()){auto clear=new PixelMenuItem(font_,skin_,U"停用图像图案");clear->Click.connect([this]{currentTools().temporaryBrushActive=false;currentTools().fillLibrarySelection={};currentTools().fillPattern.brushes.clear();currentTools().fillImageName.clear();currentTools().pencilImageBrushId.clear();currentTools().pencilImageBrush.reset();saveBrushPreferences();refresh();});menu.addChild(clear);}

    auto mode=new PixelMenuItem(font_,skin_,U"布局：默认 / 规则 / 随机");mode->Click.connect([this]{currentTools().fillPattern.mode=currentTools().fillPattern.mode==PatternMode::Default?PatternMode::Regular:currentTools().fillPattern.mode==PatternMode::Regular?PatternMode::Random:PatternMode::Default;saveBrushPreferences();refresh();});menu.addChild(mode);

    auto sample=new PixelMenuItem(font_,skin_,U"采样：绘制 / 源坐标 / 目标坐标");sample->Click.connect([this]{currentTools().fillPattern.paintMode=PatternPaintMode((int(currentTools().fillPattern.paintMode)+1)%3);saveBrushPreferences();refresh();});menu.addChild(sample);

    auto settings=new PixelMenuItem(font_,skin_,U"图案参数…");settings->setEnabled(currentTools().fillPattern.mode!=PatternMode::Default);settings->Click.connect([this]{showFillPatternSettings();});menu.addChild(settings);

    auto at=fillImageButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();

  }

void Editor::showFillFolderMenu(){PixelMenu menu(skin_);syncBrushLibraryPanel();auto scan=requestBrushMenuScan(this);syncBrushLibraryPanel();try{if(!scan||!scan->loaded||scan->loadedDocument!=currentDocument().identity()||scan->loadedDirectory!=fillBrushLibraryDirectory())throw std::runtime_error("Brush library is loading");if(!scan->pending)scan->menuRequested=false;const auto& listing=scan->loaded->listing;auto root=new PixelMenuItem(font_,skin_,U"根文件夹");root->Click.connect([this]{fillFolder_.clear();refresh();});menu.addChild(root);for(const auto& folder:listing.folders){auto row=new PixelMenuItem(font_,skin_,unicodeText(folder.id));row->checked=[this,id=folder.id]{return fillFolder_==id;};row->Click.connect([this,id=folder.id]{fillFolder_=id;refresh();});menu.addChild(row);}auto create=new PixelMenuItem(font_,skin_,U"新建子文件夹…");create->Click.connect([this]{editFillFolder(false);});menu.addChild(create);if(!fillFolder_.empty()){auto rename=new PixelMenuItem(font_,skin_,U"重命名当前文件夹…");rename->Click.connect([this]{editFillFolder(true);});menu.addChild(rename);auto remove=new PixelMenuItem(font_,skin_,U"删除当前文件夹…");remove->Click.connect([this]{confirmFillFolderDelete();});menu.addChild(remove);}if(!currentTools().fillLibrarySelection.ids.empty()){auto move=new PixelMenuItem(font_,skin_,U"移动选中图案到根文件夹");move->Click.connect([this]{moveFillBrushes({});});menu.addChild(move);for(const auto& folder:listing.folders){auto row=new PixelMenuItem(font_,skin_,U"移动选中图案到 "+unicodeText(folder.id));row->Click.connect([this,id=folder.id]{moveFillBrushes(id);});menu.addChild(row);}}}catch(const std::exception& e){status_=U"文件夹读取失败："+unicodeText(e.what());}auto at=brushLibraryPanel_&&brushLibraryPanel_->isVisible()?brushLibraryActions_[2]->bounds():fillImageButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();}

void Editor::showBrushLibraryActions(){PixelMenu menu(skin_);auto add=[&](std::u32string label,std::function<void()> action){auto row=new PixelMenuItem(font_,skin_,std::move(label));row->Click.connect(std::move(action));menu.addChild(row);return row;};add(U"文件夹…",[this]{showFillFolderMenu();});add(U"删除选中图案…",[this]{confirmFillLibraryDelete();})->setEnabled(!currentTools().fillLibrarySelection.ids.empty());add(U"刷新",[this]{syncBrushLibraryPanel(true);refresh();});menu.addChild(new PixelMenuSeparator(skin_));const int sizes[]{30,40,52};const char* ids[]{"brushSwatchSmall","brushSwatchMedium","brushSwatchLarge"};const char32_t* labels[]{U"小",U"中",U"大"};for(int i=0;i<3;++i){auto row=add(labels[i],[this,id=std::string(ids[i])]{menuCommands_.invoke(id);});row->checked=[this,value=sizes[i]]{return brushLibraryPanel_->swatchSize()==value;};}auto at=brushLibraryActions_[2]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();}
void Editor::smokeBrushLibraryPanel(){
 auto require=[](bool ok,const char* why){if(!ok)throw std::runtime_error(why);};smoke_=true;documentOpen_=true;homeOpen_=false;pending_=Pending::None;currentPlayback().playing=false;replaceDocumentForSmoke(Document(4,4));currentDocument().markSaved();
 const auto stamp=createPatternBrushFromRgba(2,1,{255,0,0,255,0,0,255,128});const auto dir=assets_.parent_path()/"brush-library-panel-owned"/std::to_string(std::chrono::high_resolution_clock::now().time_since_epoch().count());brushLibraryTestDirectory_=dir;PatternBrushLibrary library(dir);const auto first=library.save("first",encodePatternBrushPng(stamp)),second=library.save("second",encodePatternBrushPng(stamp));const auto folder=library.createFolder("Actors");library.move(second.id,folder.id);
 auto history=currentDocument().historySize(),revision=currentDocument().revision();const auto pixels=currentDocument().pixels();if(brushLibraryPanelOpen_)menuCommands_.invoke("toggleBrushLibraryPanel");require(menuCommands_.invoke("toggleBrushLibraryPanel")&&brushLibraryPanelOpen_&&columnShown(12),"Brush library menu opening");refresh();require(brushLibraryPanel_->isVisible()&&brushLibraryPanel_->resourceBounds().w>0,"Brush library shared panel layout");
 // Exercise production polling, not the deterministic fixture wait branch.
 {smoke_=false;syncBrushLibraryPanel(true);auto scan=std::dynamic_pointer_cast<BrushScanWork>(getProperty("moonsprite.brush-scan"));require(scan&&scan->pending,"Background scan did not launch");const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(5);while(scan->pending&&std::chrono::steady_clock::now()<deadline){syncBrushLibraryPanel();Sleep(1);}require(!scan->pending,"Background scan failed to publish");
  {std::promise<BrushScanResult> held;scan->future=held.get_future();scan->pending=true;const auto beforePoll=std::chrono::steady_clock::now();for(int i=0;i<100;++i)syncBrushLibraryPanel();require(scan->pending&&std::chrono::steady_clock::now()-beforePoll<std::chrono::seconds(2),"UI polls waited for unfinished brush scan");syncBrushLibraryPanel(true);require(brushLibraryNeedsReload_,"Refresh did not queue next generation");BrushScanResult old;old.key="other-project";held.set_value(std::move(old));syncBrushLibraryPanel();require(scan->pending&&!brushLibraryNeedsReload_,"Stale generation did not launch queued refresh");scan->future.wait();syncBrushLibraryPanel();require(!scan->pending,"Queued refresh did not complete");}
  std::promise<BrushScanResult> delayed;scan->future=delayed.get_future();scan->pending=true;const auto oldKey=brushLibraryResourceKey_;brushLibraryPanelOpen_=false;BrushScanResult stale;stale.key=oldKey;delayed.set_value(std::move(stale));syncBrushLibraryPanel();require(!scan->pending&&brushLibraryNeedsReload_,"Hidden panel accepted stale scan");brushLibraryPanelOpen_=true;smoke_=true;syncBrushLibraryPanel();}
 // Menu requests load the controller even while its dock column is hidden.
 {auto scan=std::dynamic_pointer_cast<BrushScanWork>(getProperty("moonsprite.brush-scan"));const bool open=brushLibraryPanelOpen_;brushLibraryPanelOpen_=false;requestBrushMenuScan(this);syncBrushLibraryPanel(true);require(scan->loaded&&scan->loadedDocument==currentDocument().identity()&&!scan->pending&&!scan->menuRequested,"Hidden menu request did not finish background scan");brushLibraryPanelOpen_=open;
  HANDLE locked=CreateFileW(std::filesystem::u8path(first.filePath).c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);require(locked!=INVALID_HANDLE_VALUE,"Fill menu cached resource lock");currentTools().fillLibrarySelection={};selectFillLibraryBrush(first.id,false,false);const bool reused=currentTools().pencilImageBrushId==first.id&&currentTools().pencilImageBrush&&currentTools().pencilImageBrush->colors==stamp.colors;CloseHandle(locked);require(reused,"Fill menu selection decoded cached file again");currentTools().fillLibrarySelection={};currentTools().fillPattern.brushes.clear();currentTools().pencilImageBrushId.clear();currentTools().pencilImageBrush.reset();
 }
 // A hidden-column menu must keep ownership of a pending refresh even
 // while it serves the prior cached generation. Navigation uses latest folder.
 {auto scan=std::dynamic_pointer_cast<BrushScanWork>(getProperty("moonsprite.brush-scan"));const bool open=brushLibraryPanelOpen_;brushLibraryPanelOpen_=false;smoke_=false;requestBrushMenuScan(this);syncBrushLibraryPanel(true);require(scan->pending&&scan->menuRequested,"Menu refresh lost request ownership");
  fillFolder_=folder.id;const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(5);while(scan->pending&&std::chrono::steady_clock::now()<deadline){syncBrushLibraryPanel();Sleep(1);}require(!scan->pending&&scan->loaded->folder==folder.id&&!scan->menuRequested,"Pending hidden menu refresh lost latest folder");fillFolder_.clear();brushLibraryPanelOpen_=open;smoke_=true;syncBrushLibraryPanel();
 }
 // Cached choices survive unavailable files until an explicit refresh publishes.
 {const auto cached=library.save("cached-choice",encodePatternBrushPng(stamp));syncBrushLibraryPanel(true);
  HANDLE locked=CreateFileW(std::filesystem::u8path(cached.filePath).c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);require(locked!=INVALID_HANDLE_VALUE,"Cached selection exclusive file lock");
  selectBrushLibraryItem(first.id,false,false);selectBrushLibraryItem(cached.id,true,false);const bool reused=currentTools().fillLibrarySelection.ids==std::vector<std::string>({first.id,cached.id})&&currentTools().pencilImageBrush&&currentTools().pencilImageBrush->colors==stamp.colors;CloseHandle(locked);require(reused,"Cached multi-selection reread locked image");
  currentTools().fillLibrarySelection={};selectBrushLibraryItem(first.id,false,false);selectBrushLibraryItem(cached.id,false,true);require(currentTools().fillLibrarySelection.ids==std::vector<std::string>({first.id,cached.id}),"Cached shift range ordering");
  writeExportBytesAtomic(std::filesystem::u8path(cached.filePath),{1,2,3});syncBrushLibraryPanel(true);currentTools().fillLibrarySelection={};selectBrushLibraryItem(first.id,false,false);const auto before=currentTools().fillLibrarySelection.ids;selectBrushLibraryItem(cached.id,true,false);require(currentTools().fillLibrarySelection.ids==before&&currentTools().pencilImageBrushId==first.id,"Refreshed corrupt image remained selectable");
  ProjectBrushResource project;project.metadata={"cached-project","Cached project","brushes/cached.gray","brushes/cached.rgba",2,1};project.brush=stamp;currentDocument().setImportedProjectBrushes({project});syncBrushLibraryPanel();selectBrushLibraryItem("project:cached-project",true,false);require(currentTools().fillLibrarySelection.ids==std::vector<std::string>({first.id,"project:cached-project"})&&currentTools().pencilImageBrushId=="project:cached-project","Cached project selection order");
  auto scan=std::dynamic_pointer_cast<BrushScanWork>(getProperty("moonsprite.brush-scan"));const auto resourceKey=brushLibraryResourceKey_;const auto localPixels=scan->loaded->local.data();
  HANDLE projectLock=CreateFileW(std::filesystem::u8path(first.filePath).c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);require(projectLock!=INVALID_HANDLE_VALUE,"Project-only update local PNG lock");
  try{
   project.brush.colors[0]=0xff314159;const auto resourceRevision=currentDocument().projectBrushRevision();currentDocument().setImportedProjectBrushes({project});require(currentDocument().projectBrushRevision()!=resourceRevision,"Project resource replacement did not invalidate revision");syncBrushLibraryPanel();
   require(brushLibraryResourceKey_==resourceKey&&!scan->pending&&scan->loaded->local.data()==localPixels&&scan->publishedProjectRevision==currentDocument().projectBrushRevision(),"Project-only replacement rescanned local library");
   currentTools().fillLibrarySelection={};selectBrushLibraryItem("project:cached-project",false,false);require(currentTools().pencilImageBrush&&currentTools().pencilImageBrush->colors[0]==0xff314159,"Refreshed project selection used stale pixels");
   selectBrushLibraryItem(first.id,true,false);selectBrushLibraryItem("project:cached-project",false,true);
   currentDocument().setImportedProjectBrushes({});syncBrushLibraryPanel();require(currentTools().fillLibrarySelection.ids==std::vector<std::string>({first.id})&&currentTools().pencilImageBrushId==first.id&&currentTools().pencilImageBrush&&currentTools().pencilImageBrush->colors==stamp.colors&&!scan->pending&&scan->loaded->local.data()==localPixels,"Project deletion failed to prune with cached local survivor");
   // Hold a local result while project resources change twice. Neither update
   // queues disk work, and the completed result must merge the latest project.
   std::promise<BrushScanResult> held;auto result=*scan->loaded;scan->future=held.get_future();scan->pending=true;smoke_=false;
   project.brush.colors[0]=0xff271828;currentDocument().setImportedProjectBrushes({project});syncBrushLibraryPanel();require(scan->pending&&!brushLibraryNeedsReload_&&scan->publishedProjectRevision==currentDocument().projectBrushRevision(),"Pending scan blocked project publication");
   project.brush.colors[0]=0xff161803;currentDocument().setImportedProjectBrushes({project});held.set_value(std::move(result));syncBrushLibraryPanel();smoke_=true;require(!scan->pending&&!brushLibraryNeedsReload_&&scan->publishedProjectRevision==currentDocument().projectBrushRevision(),"Local completion queued stale project scan");
   currentTools().fillLibrarySelection={};selectBrushLibraryItem("project:cached-project",false,false);require(currentTools().pencilImageBrush&&currentTools().pencilImageBrush->colors[0]==0xff161803,"Local scan published stale project pixels");
  }catch(...){CloseHandle(projectLock);smoke_=true;throw;}CloseHandle(projectLock);
  currentDocument().setImportedProjectBrushes({});syncBrushLibraryPanel();require(currentTools().fillLibrarySelection.ids.empty()&&!currentTools().pencilImageBrush&&currentTools().fillPattern.brushes.empty(),"Last project removal retained live brush");currentDocument().markSaved();library.remove(cached.id);currentTools().fillLibrarySelection={};currentTools().pencilImageBrushId.clear();currentTools().pencilImageBrush.reset();currentTools().fillPattern.brushes.clear();syncBrushLibraryPanel(true);
 }
 // Resource mutations must not synchronously decode surviving choices.
 {
  fillFolder_.clear();syncBrushLibraryPanel(true);currentTools().fillLibrarySelection={};selectBrushLibraryItem(first.id,false,false);
  const auto survivor=*currentTools().pencilImageBrush;const auto mutationFolder=library.createFolder("Mutation cache");const auto removable=library.save("mutation-remove",encodePatternBrushPng(stamp));syncBrushLibraryPanel(true);selectBrushLibraryItem(removable.id,true,false);
  const bool open=brushLibraryPanelOpen_;brushLibraryPanelOpen_=false;
  HANDLE locked=CreateFileW(std::filesystem::u8path(first.filePath).c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);require(locked!=INVALID_HANDLE_VALUE,"Mutation survivor PNG lock");
  try{
   deleteFillLibrarySelection({removable.id});require(currentTools().fillLibrarySelection.ids==std::vector<std::string>({first.id})&&currentTools().pencilImageBrushId==first.id&&currentTools().pencilImageBrush&&currentTools().pencilImageBrush->colors==survivor.colors&&status_.find(U"已删除笔刷")!=std::u32string::npos,"Delete reread or cleared locked survivor");
   editFillFolder(false);paletteInput_->setText("Mutation created");resolve(true);require(pending_==Pending::None&&fillFolder_=="Mutation created"&&currentTools().pencilImageBrush&&currentTools().pencilImageBrush->colors==survivor.colors,"Folder create falsely failed on selected PNG");
   editFillFolder(true);paletteInput_->setText("Mutation renamed");resolve(true);require(pending_==Pending::None&&fillFolder_=="Mutation renamed"&&std::filesystem::is_directory(dir/"Mutation renamed")&&currentTools().pencilImageBrushId==first.id,"Folder rename falsely failed on selected PNG");
  }catch(...){CloseHandle(locked);brushLibraryPanelOpen_=open;throw;}CloseHandle(locked);
  // Deny readers while allowing rename: moving must preserve selected pixels.
  locked=CreateFileW(std::filesystem::u8path(first.filePath).c_str(),0,FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);require(locked!=INVALID_HANDLE_VALUE,"Move selected PNG reader lock");
  try{moveFillBrushes(mutationFolder.id);require(currentTools().pencilImageBrush&&currentTools().pencilImageBrush->colors==survivor.colors&&status_==U"已移动选中图案"&&std::filesystem::exists(dir/"Mutation cache"/std::filesystem::u8path(first.id)),"Move reread selected PNG or reported false failure");}catch(...){CloseHandle(locked);brushLibraryPanelOpen_=open;throw;}CloseHandle(locked);
  moveFillBrushes({});fillFolder_.clear();brushLibraryPanelOpen_=open;refresh();syncBrushLibraryPanel(true);require(currentTools().pencilImageBrushId==first.id&&currentTools().pencilImageBrush&&currentTools().pencilImageBrush->colors==survivor.colors,"Mutation refresh lost surviving brush");currentTools().fillLibrarySelection={};currentTools().pencilImageBrushId.clear();currentTools().pencilImageBrush.reset();currentTools().fillPattern.brushes.clear();
 }
 history=currentDocument().historySize();revision=currentDocument().revision();
 brushLibraryPanel_->smokeDrag();brushLibraryNeedsReload_=true;syncBrushLibraryPanel(true);
 selectBrushLibraryItem(first.id,false,false);require(currentTools().pencilImageBrushId==first.id&&currentTools().pencilImageBrush&&currentTools().fillPattern.brushes.size()==1,"Library selection shares pencil/fill");require(!brushLibraryNeedsReload_,"Selection unexpectedly reloaded brush thumbnails");const auto selectedBeforeFailedMove=currentTools().fillLibrarySelection.ids;brushLibraryPanel_->moveToFolder({first.id},"missing-folder");require(currentTools().fillLibrarySelection.ids==selectedBeforeFailedMove&&currentTools().pencilImageBrushId==first.id&&std::filesystem::exists(std::filesystem::u8path(first.filePath)),"Failed cross-folder drag retains source and selection");selectBrushLibraryItem(first.id,false,false);require(currentTools().pencilImageBrushId.empty()&&!currentTools().pencilImageBrush&&currentTools().fillPattern.brushes.empty(),"Library repeat click deselects");
 brushLibraryPanel_->navigate(folder.id);selectBrushLibraryItem(second.id,false,false);require(currentTools().pencilImageBrushId==second.id,"Nested library navigation");const auto before=currentTools().fillLibrarySelection.ids;selectBrushLibraryItem("missing.png",false,false);require(currentTools().fillLibrarySelection.ids==before&&currentTools().pencilImageBrushId==second.id,"Missing selection retains brush");
 // Full refresh lifecycle: discard unavailable members, retain order and
 // surviving in-memory pixels, then clear the last lost active choice.
 {const auto a=library.save("refresh-a",encodePatternBrushPng(stamp)),b=library.save("refresh-b",encodePatternBrushPng(stamp));library.move(a.id,folder.id);library.move(b.id,folder.id);syncBrushLibraryPanel(true);selectBrushLibraryItem(a.id,false,false);selectBrushLibraryItem(b.id,true,false);library.remove(b.id);syncBrushLibraryPanel(true);require(currentTools().fillLibrarySelection.ids==std::vector<std::string>({a.id})&&currentTools().pencilImageBrushId==a.id&&currentTools().pencilImageBrush&&currentTools().fillPattern.brushes.size()==1,"Refresh did not prune lost active resource");
  library.remove(a.id);syncBrushLibraryPanel(true);require(currentTools().fillLibrarySelection.ids.empty()&&currentTools().pencilImageBrushId.empty()&&!currentTools().pencilImageBrush&&currentTools().fillPattern.brushes.empty()&&currentTools().fillImageName.empty(),"Refresh did not clear final missing brush");selectBrushLibraryItem(second.id,false,false);require(currentTools().pencilImageBrushId==second.id,"Refresh lifecycle did not restore next valid selection");}
 // Navigation is purely in-memory, including cross-folder selected patterns.
 {auto scan=std::dynamic_pointer_cast<BrushScanWork>(getProperty("moonsprite.brush-scan"));const auto* generation=&*scan->loaded;HANDLE locked=CreateFileW(std::filesystem::u8path(first.filePath).c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);require(locked!=INVALID_HANDLE_VALUE,"Navigation cache file lock");
  brushLibraryPanel_->navigate({});selectBrushLibraryItem(first.id,true,false);const bool selected=currentTools().fillLibrarySelection.ids==std::vector<std::string>({second.id,first.id})&&currentTools().pencilImageBrushId==first.id;brushLibraryPanel_->navigate(folder.id);const bool reused=!scan->pending&&!brushLibraryNeedsReload_&&generation==&*scan->loaded&&scan->loaded->folder==folder.id;CloseHandle(locked);require(selected&&reused,"Folder navigation reloaded resources or lost cross-folder selection");
  brushLibraryPanel_->navigate("missing-folder");require(fillFolder_.empty()&&!scan->pending,"Cached missing folder did not fall back to root");brushLibraryPanel_->navigate(folder.id);selectBrushLibraryItem(second.id,false,false);
 }
 // Stored choices replace a temporary brush without losing the original
 // return profile; failures preserve the temporary selection and its lifetime.
 {const auto root=workspacePresetTestDirectory_;workspacePresetTestDirectory_=dir/"temporary-transition";const auto profile=currentTools().temporaryBrushReturnProfile;currentTools().temporaryBrushReturnProfile=currentTools().brushProfiles[0];currentTools().temporaryBrushReturnProfile->size=11;currentTools().temporaryBrushActive=true;
  const auto previous=currentTools().pencilImageBrushId;selectBrushLibraryItem("missing-transition.png",false,false);require(currentTools().temporaryBrushActive&&currentTools().pencilImageBrushId==previous,"Failed stored choice consumed temporary lifetime");
  currentTools().fillLibrarySelection={};selectBrushLibraryItem(second.id,false,false);require(!currentTools().temporaryBrushActive&&currentTools().temporaryBrushReturnProfile&&currentTools().temporaryBrushReturnProfile->size==11,"Stored choice retained temporary flag or lost return profile");loadSessionToolPreferences(false);require(currentTools().pencilImageBrushId==second.id&&currentTools().pencilImageBrush,"Stored choice after temporary brush was not persisted");currentTools().temporaryBrushReturnProfile=profile;workspacePresetTestDirectory_=root;
 }
 // Real preference queue and library resource resolution, no user settings.
 {const auto oldRoot=workspacePresetTestDirectory_;workspacePresetTestDirectory_=dir/"preferences";currentTools().pencilImageBrushAngle=37.5;saveBrushPreferences();currentTools().pencilImageBrushId.clear();currentTools().pencilImageBrush.reset();currentTools().pencilImageBrushAngle=0;loadSessionToolPreferences(false);require(currentTools().pencilImageBrushId==second.id&&currentTools().pencilImageBrush&&currentTools().pencilImageBrushAngle==37.5,"Persistent image resource/angle reopen");
  currentTools().temporaryBrushActive=true;saveBrushPreferences();currentTools().temporaryBrushActive=false;loadSessionToolPreferences(false);require(currentTools().pencilImageBrushId.empty()&&!currentTools().pencilImageBrush,"Temporary selection brush was persisted");
  currentTools().pencilImageBrushId="missing-resource.png";saveBrushPreferences();loadSessionToolPreferences(false);require(currentTools().pencilImageBrushId.empty()&&!currentTools().pencilImageBrush,"Missing persisted brush did not fall back");
  currentTools().pencilImageBrushId=second.id;resolvePencilImageBrush();saveBrushPreferences();loadSessionToolPreferences(false);workspacePresetTestDirectory_=oldRoot;}
 // Esc exits a stored pattern without leaving bucket mode or editing artwork.
 {const auto root=workspacePresetTestDirectory_;workspacePresetTestDirectory_=dir/"escape-preferences";useFillTool();currentTools().pencilImageBrushId=second.id;resolvePencilImageBrush();currentTools().brushProfiles[0].imagePaintMode=PatternPaintMode::Source;requestFocus();ui::KeyMessage esc(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&esc);require(currentTools().fillTool&&!currentTools().pencilImageBrush&&currentTools().pencilImageBrushId.empty()&&currentTools().fillPattern.brushes.empty()&&currentTools().brushProfiles[0].imagePaintMode==PatternPaintMode::Source,"Pattern Esc lost bucket or sampling mode");loadSessionToolPreferences(false);require(currentTools().pencilImageBrushId.empty(),"Esc-cleared pattern was restored from preferences");workspacePresetTestDirectory_=root;currentTools().pencilImageBrushId=second.id;resolvePencilImageBrush();currentTools().fillLibrarySelection.ids={second.id};currentTools().fillLibrarySelection.active=second.id;applyFillLibrarySelection();}
 // A corrupt newly selected resource must not replace any live selection data.
 {const auto ids=currentTools().fillLibrarySelection.ids;const auto active=currentTools().pencilImageBrushId;const auto image=currentTools().pencilImageBrush;const auto patterns=currentTools().fillPattern.brushes;const auto name=currentTools().fillImageName;auto broken=library.save("corrupt-choice",encodePatternBrushPng(stamp));writeExportBytesAtomic(std::filesystem::u8path(broken.filePath),{1,2,3});fillFolder_.clear();selectBrushLibraryItem(broken.id,true,false);require(currentTools().fillLibrarySelection.ids==ids&&currentTools().pencilImageBrushId==active&&currentTools().pencilImageBrush&&currentTools().pencilImageBrush->colors==image->colors&&currentTools().fillPattern.brushes.size()==patterns.size()&&currentTools().fillImageName==name,"Failed choice changed live resource set");fillFolder_=folder.id;}
 // Worker executes the complete sequential import with its own COM scope.
 {const auto input=dir/"worker-input.png";writeExportBytesAtomic(input,encodePatternBrushPng(stamp));
  BrushImportWork work(this);work.start({dir,{input,dir/"worker-missing.png"},folder.id});work.future.wait();auto completed=work.poll();require(completed.has_value(),"Worker result not ready");auto result=std::move(*completed);
  require(result.success==1&&result.failed==1&&result.last&&result.loaded&&result.loaded->colors==stamp.colors&&result.last->folderId==folder.id,"Worker import lost partial success or resource pixels");
  require(importPatternBrush(std::filesystem::u8path(result.last->filePath)).brush.colors==stamp.colors,"Worker import PNG could not reopen");
  // An unfinished first batch must neither block polling nor lose later batches.
  std::promise<BrushImportResult> held;work.future=held.get_future();work.pending=true;
  work.start({dir,{dir/"queued-missing.png"},folder.id});work.start({dir,{input},folder.id});
  const auto before=std::chrono::steady_clock::now();for(int i=0;i<100;++i)require(!work.poll(),"Unfinished import returned a result");require(std::chrono::steady_clock::now()-before<std::chrono::seconds(2)&&work.queued.size()==2,"Import poll blocked or replaced queued requests");
  BrushImportResult firstResult;firstResult.error="held first";held.set_value(std::move(firstResult));auto firstCompleted=work.poll();require(firstCompleted&&firstCompleted->error=="held first"&&work.pending&&work.queued.size()==1,"Import queue lost first completion");
  work.future.wait();auto failed=work.poll();require(failed&&failed->failed==1&&!failed->last&&work.pending&&work.queued.empty(),"Failed batch blocked following import");
  work.future.wait();auto successful=work.poll();require(successful&&successful->success==1&&successful->loaded&&successful->loaded->colors==stamp.colors&&!work.pending,"Queued batch failed to finish after error");

 }
 // Destroy the owner with an active batch and queued batches, including a
 // failure. All accepted storage requests finish without a UI continuation.
 {const auto root=dir/"close-imports";const auto input=dir/"worker-input.png";const auto beforeId=currentTools().pencilImageBrushId;const auto beforePixels=currentTools().pencilImageBrush;const auto beforeStatus=status_;
  {BrushImportWork closing(this);std::promise<BrushImportResult> held;closing.future=held.get_future();closing.pending=true;
   closing.start({root,{input},{}});closing.start({root,{dir/"missing-close.png"},{}});closing.start({root,{input},{}});held.set_value({});}
  const auto saved=PatternBrushLibrary(root).list();require(saved.brushes.size()==2,"Closing import owner lost queued storage requests after failure");
  for(const auto& item:saved.brushes)require(importPatternBrush(std::filesystem::u8path(item.filePath)).brush.colors==stamp.colors,"Closing import wrote unreadable resource");
  require(currentTools().pencilImageBrushId==beforeId&&bool(currentTools().pencilImageBrush)==bool(beforePixels)&&status_==beforeStatus,"Closing storage drain called Editor publication");
 }
 // User-approved isolation preserves the destination session after a switch.
 {auto previousDocument=std::move(currentDocument());const auto oldId=currentTools().pencilImageBrushId;const auto oldBrush=currentTools().pencilImageBrush;const auto oldSelection=currentTools().fillLibrarySelection;const auto oldPatterns=currentTools().fillPattern.brushes;
  auto work=std::make_shared<BrushImportWork>(this);setProperty(work);std::promise<BrushImportResult> held;work->future=held.get_future();work->pending=true;work->activeDocument=previousDocument.identity();work->activeDirectory=dir;smoke_=false;
  const auto before=std::chrono::steady_clock::now();for(int i=0;i<100;++i)importBrushLibraryImages({},{});require(work->pending&&std::chrono::steady_clock::now()-before<std::chrono::seconds(2),"Production import waited for worker");
  replaceDocumentForSmoke(Document(3,3));auto result=importBrushFiles(dir,{dir/"worker-input.png"},{});require(result.last&&result.loaded,"Completion fixture failed");const auto savedPath=result.last->filePath;held.set_value(std::move(result));currentDocument().beginStroke({0,0},0xff123456);importBrushLibraryImages({},{});require(work->pending&&currentTools().pencilImageBrushId==oldId,"Import replaced active gesture brush");currentDocument().cancelStroke();importBrushLibraryImages({},{});require(!work->pending&&currentTools().pencilImageBrushId==oldId&&bool(currentTools().pencilImageBrush)==bool(oldBrush)&&(!oldBrush||currentTools().pencilImageBrush->colors==oldBrush->colors)&&currentTools().fillLibrarySelection.ids==oldSelection.ids&&currentTools().fillPattern.brushes.size()==oldPatterns.size(),"Foreign import changed destination session brush");require(importPatternBrush(std::filesystem::u8path(savedPath)).brush.colors==stamp.colors,"Isolated import did not persist resource");
  // Keep a loaded current controller but hold its replacement scan. A project
  // revision must not treat the just-imported local resource as unavailable.
  smoke_=true;syncBrushLibraryPanel(true);smoke_=false;
  auto scan=std::dynamic_pointer_cast<BrushScanWork>(getProperty("moonsprite.brush-scan"));require(scan&&scan->loaded,"Import lifecycle controller unavailable");
  std::promise<BrushScanResult> heldScan;scan->future=heldScan.get_future();scan->pending=true;
  auto nextResult=importBrushFiles(dir,{dir/"worker-input.png"},{});const auto nextId=nextResult.last->id;
  std::promise<BrushImportResult> nextImport;work->future=nextImport.get_future();work->pending=true;work->activeDocument=currentDocument().identity();work->activeDirectory=dir;nextImport.set_value(std::move(nextResult));importBrushLibraryImages({},{});
  require(currentTools().pencilImageBrushId==nextId&&scan->localIndex.count(nextId),"Import did not register activated resource in controller");
  ProjectBrushResource project;project.metadata={"import-lifecycle","Import lifecycle","brushes/import.gray","brushes/import.rgba",2,1};project.brush=stamp;currentDocument().setImportedProjectBrushes({project});syncBrushLibraryPanel();require(currentTools().pencilImageBrushId==nextId&&currentTools().pencilImageBrush&&currentTools().fillLibrarySelection.ids==std::vector<std::string>({nextId}),"Project refresh pruned just-imported local brush");
  BrushScanResult stale;stale.key="old-import-scan";heldScan.set_value(std::move(stale));syncBrushLibraryPanel();require(scan->pending&&currentTools().pencilImageBrushId==nextId,"Stale scan cleared imported selection");scan->future.wait();syncBrushLibraryPanel();require(!scan->pending&&currentTools().pencilImageBrushId==nextId,"Final scan lost imported resource");
  smoke_=true;replaceDocumentForSmoke(std::move(previousDocument));currentTools().pencilImageBrushId=oldId;currentTools().pencilImageBrush=oldBrush;currentTools().fillLibrarySelection=oldSelection;currentTools().fillPattern.brushes=oldPatterns;brushLibraryNeedsReload_=true;syncBrushLibraryPanel(true);
 }
 // Both resource-producing entrypoints must use the same durable selection.
 {const auto root=workspacePresetTestDirectory_;workspacePresetTestDirectory_=dir/"creation-preferences";
  const auto input=dir/"import-input.png";writeExportBytesAtomic(input,encodePatternBrushPng(stamp));currentTools().temporaryBrushActive=true;importBrushLibraryImages({input},{});require(!currentTools().temporaryBrushActive,"Stored import retained temporary brush flag");const auto imported=currentTools().pencilImageBrushId;require(!imported.empty()&&currentTools().pencilImageBrush,"Import failed to activate brush");currentTools().pencilImageBrushId.clear();currentTools().pencilImageBrush.reset();loadSessionToolPreferences(false);require(currentTools().pencilImageBrushId==imported&&currentTools().pencilImageBrush&&currentTools().pencilImageBrush->colors==stamp.colors,"Imported brush selection not durable");
  const auto partialInput=dir/"partial-input.png";const auto partialStamp=createPatternBrushFromRgba(1,1,{13,29,47,123});writeExportBytesAtomic(partialInput,encodePatternBrushPng(partialStamp));importBrushLibraryImages({input,partialInput,dir/"missing-last.png"},folder.id);require(currentTools().pencilImageBrush&&currentTools().pencilImageBrush->colors==partialStamp.colors&&currentTools().fillPattern.brushes.size()==1&&currentTools().fillPattern.brushes[0].coverage==partialStamp.coverage&&currentTools().fillLibrarySelection.active==currentTools().pencilImageBrushId,"Partial import did not activate last successful CPU resource");const auto partialId=currentTools().pencilImageBrushId;auto listing=library.list();const auto saved=std::find_if(listing.brushes.begin(),listing.brushes.end(),[&](const auto& item){return item.id==partialId;});require(saved!=listing.brushes.end()&&saved->folderId==folder.id&&currentTools().fillImageName==unicodeText(std::filesystem::u8path(saved->filePath).stem().u8string()),"Imported resource folder/name differs from stored representation");
  const auto oldPixels=currentTools().pencilImageBrush->colors;const auto oldSelection=currentTools().fillLibrarySelection.ids;importBrushLibraryImages({partialInput},"absent-folder");require(currentTools().pencilImageBrushId==partialId&&currentTools().pencilImageBrush->colors==oldPixels&&currentTools().fillLibrarySelection.ids==oldSelection,"Failed resource move replaced current brush");
  const auto beforeFailed=currentTools().pencilImageBrushId;importBrushLibraryImages({dir/"absent-input.png"},{});loadSessionToolPreferences(false);require(currentTools().pencilImageBrushId==beforeFailed,"Failed import overwrote durable brush");
  currentDocument().previewSelection(SelectionMask{0,0,1,1,{}});const auto beforeEmpty=currentTools().pencilImageBrushId;createFillBrushFromSelection();require(currentTools().pencilImageBrushId==beforeEmpty&&currentDocument().selection(),"Empty capture changed durable brush");currentDocument().previewSelection({});
  auto artwork=std::move(currentDocument());replaceDocumentForSmoke(Document(2,1));currentDocument().beginStroke({0,0},0xff123456);currentDocument().commitStroke();currentDocument().previewSelection(SelectionMask{0,0,1,1,{}});const auto captureHistory=currentDocument().historySize();currentTools().temporaryBrushActive=true;createFillBrushFromSelection();require(!currentTools().temporaryBrushActive,"Stored capture retained temporary flag");const auto captured=currentTools().pencilImageBrushId;require(!captured.empty()&&captured!=imported&&!currentDocument().selection()&&currentDocument().historySize()==captureHistory,"Successful capture changed history or failed activation");currentTools().pencilImageBrushId.clear();currentTools().pencilImageBrush.reset();loadSessionToolPreferences(false);require(currentTools().pencilImageBrushId==captured&&currentTools().pencilImageBrush&&currentTools().pencilImageBrush->colors==std::vector<Pixel>({0xff123456}),"Captured resource selection not durable");replaceDocumentForSmoke(std::move(artwork));
  workspacePresetTestDirectory_=root;currentTools().fillLibrarySelection.ids={second.id};currentTools().fillLibrarySelection.active=second.id;applyFillLibrarySelection();}
 // Exercise the actual configurable shortcut route against this test-owned
 // library; native file/explorer windows are intentionally not opened here.
 {const auto bindings=shortcutBindings_;const auto selected=currentTools().fillLibrarySelection;const auto brushId=currentTools().pencilImageBrushId;const auto brush=currentTools().pencilImageBrush;
  const char* commands[]{"importBrushImage","createBrushFolder","openBrushFolder","refreshBrushLibrary","brushLibraryParentFolder","brushSwatchSmall","brushSwatchMedium","brushSwatchLarge","deleteBrushSelection"};
  for(const auto* id:commands)require(menuCommands_.connected(id)&&shortcutSupported(id),"Brush command is configurable and connected");
  auto send=[&](const char* id,int repeat=0){shortcuts::assign(shortcutBindings_,id,"F10");requestFocus();ui::KeyMessage key(ui::kKeyDownMessage,ui::kKeyF10,ui::kKeyNoneModifier,0,repeat);require(routeShortcutMessage(&key)==1,"Actual brush shortcut routed");};
  for(const auto& size:std::vector<std::pair<const char*,int>>{{"brushSwatchLarge",52},{"brushSwatchSmall",30},{"brushSwatchMedium",40}}){send(size.first);require(brushLibraryPanel_->swatchSize()==size.second&&menuCommands_.checked(size.first),"Shortcut updates shared brush swatch size");}send("brushSwatchLarge",1);require(brushLibraryPanel_->swatchSize()==40,"Repeated brush shortcut suppressed");
  send("createBrushFolder");require(pending_==Pending::BrushFolderName,"Create folder shortcut opens existing name form");resolve(false);require(fillFolder_==folder.id,"Folder creation cancel preserves location");send("createBrushFolder");paletteInput_->setText("Shortcuts");resolve(true);require(fillFolder_==folder.id+"/Shortcuts"&&std::filesystem::is_directory(dir/std::filesystem::u8path(fillFolder_)),"Folder shortcut creates nested folder");send("brushLibraryParentFolder");require(fillFolder_==folder.id,"Parent shortcut navigates one level");send("brushLibraryParentFolder");require(fillFolder_.empty(),"Parent shortcut reaches root");send("brushLibraryParentFolder");require(fillFolder_.empty(),"Parent shortcut is inert at root");brushLibraryPanel_->navigate(folder.id);
  brushLibraryNeedsReload_=true;send("refreshBrushLibrary");require(!brushLibraryNeedsReload_&&currentTools().pencilImageBrushId==brushId,"Refresh shortcut reloads while retaining active brush");
  const auto removable=library.save("shortcut-delete",encodePatternBrushPng(stamp));const auto moved=library.move(removable.id,folder.id);brushLibraryNeedsReload_=true;syncBrushLibraryPanel(true);selectBrushLibraryItem(removable.id,false,false);
  for(int choice:{0,2}){bool opened=false;ui::Timer close(50,this);close.Tick.connect([&]{close.stop();auto focus=ui::Manager::getDefault()->getFocus();auto popup=focus?dynamic_cast<BrushLibraryDeleteDialog*>(focus->window()):nullptr;if(popup){opened=true;popup->smoke(choice);}});close.start();send("deleteBrushSelection");close.stop();require(opened,"Delete shortcut opens existing confirmation dialog");require(std::filesystem::exists(std::filesystem::u8path(moved.filePath))==(choice==0),"Delete shortcut respects cancel then confirms removal");}
  currentTools().fillLibrarySelection=selected;currentTools().pencilImageBrushId=brushId;currentTools().pencilImageBrush=brush;applyFillLibrarySelection();brushLibraryNeedsReload_=true;syncBrushLibraryPanel(true);
  brushLibraryPanel_->setVisible(false);for(const auto* id:commands){require(!menuCommands_.enabled(id),"Hidden brush panel disables its command");send(id);}require(pending_==Pending::None&&brushLibraryPanel_->swatchSize()==40&&fillFolder_==folder.id,"Hidden brush shortcuts do not open windows or change resources");shortcutBindings_=bindings;refresh();
  require(currentDocument().historySize()==history&&currentDocument().revision()==revision&&currentDocument().pixels()==pixels&&!currentDocument().dirty(),"Brush shortcut browsing/local edits preserve document and history");
 }
 brushLibraryPanel_->setSize(40);std::stringstream encoded;docking_.write(encoded);panels::Model restored;require(restored.read(encoded)&&restored.groupOf(12)>=0,"New panel docking persistence");docking_.place(12,panels::Dock::Left);refresh();require(!columnFloating(12)&&brushLibraryPanel_->isVisible(),"Brush library uses shared dock");docking_.place(12,panels::Dock::Floating,-1,true,false,{360,96,220,280});refresh();require(columnFloating(12),"Brush library uses shared floating chrome");
 smokeBrushLibraryDrop();
 menuCommands_.invoke("toggleBrushLibraryPanel");require(!brushLibraryPanelOpen_&&currentTools().pencilImageBrushId==second.id,"Hiding library preserves selection");require(currentDocument().historySize()==history&&currentDocument().revision()==revision&&currentDocument().pixels()==pixels&&!currentDocument().dirty(),"Resource browsing does not edit document");
 smokeBrushLibraryDelete();
 // Real mouse-down/up must use the selected resource snapshot without IO.
 // This also covers temporary brushes, which have no corresponding PNG ID.
 {
  replaceDocumentForSmoke(Document(12,12));if(!brushLibraryPanelOpen_)menuCommands_.invoke("toggleBrushLibraryPanel");paletteFocused_=false;runShortcutCommand("tool.pencil");requestFocus();fitCanvas();currentView().zoom=8;
  currentDocument().symmetryAxes={};currentTools().temporaryBrushReturnProfile.reset();currentTools().temporaryBrushActive=false;currentTools().brushProfiles[0]={1,100,BrushShape::Square};currentTools().brushProfiles[0].imagePaintMode=PatternPaintMode::Paint;currentTools().brushDynamics={};currentTools().pencilImageBrushAngle=0;ink_=0xffffffff;
  const bool grid=runtimePreferences_.flag("tools.gridAlignmentEnabled");runtimePreferences_.set("tools.gridAlignmentEnabled","false");refresh();
  auto pointer=[&](ui::MessageType type,int x,int y){ui::MouseMessage event(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,canvasDocumentToDisplay({x+.25,y+.25}));event.setDisplay(display());onProcessMessage(&event);if(type==ui::kMouseDownMessage&&currentDocument().strokeActive())enableFlags(ui::HAS_CAPTURE);if(type==ui::kMouseUpMessage)disableFlags(ui::HAS_CAPTURE);};
  auto stroke=[&](int x,int y,Pixel expected){const auto before=currentDocument().canvasPixels();const auto h=currentDocument().historyPosition();pointer(ui::kMouseDownMessage,x,y);if(!currentDocument().strokeActive()||!currentTools().pencilImageBrush)throw std::runtime_error("Selected image mouse-down x="+std::to_string(x)+" y="+std::to_string(y)+" image="+std::to_string(bool(currentTools().pencilImageBrush))+" active="+std::to_string(currentDocument().active())+" selection="+std::to_string(currentTools().selectionTool)+" shape="+std::to_string(currentTools().shapeTool)+" fill="+std::to_string(currentTools().fillTool)+" move="+std::to_string(currentTools().moveTool)+" status="+utf8Text(status_));pointer(ui::kMouseUpMessage,x,y);if(currentDocument().active()||currentDocument().historyPosition()!=h+1||currentDocument().canvasPixels()[y*12+x]!=expected)throw std::runtime_error("Image stroke x="+std::to_string(x)+" y="+std::to_string(y)+" actual="+std::to_string(currentDocument().canvasPixels()[y*12+x])+" expected="+std::to_string(expected)+" h="+std::to_string(currentDocument().historyPosition())+" before="+std::to_string(h)+" active="+std::to_string(currentDocument().active()));const auto painted=currentDocument().canvasPixels();currentDocument().undo();require(currentDocument().canvasPixels()==before,"Selected image stroke Undo");currentDocument().redo();require(currentDocument().canvasPixels()==painted,"Selected image stroke Redo");};
  const auto pixel=createPatternBrushFromRgba(1,1,{21,43,65,255});const auto value=library.save("stroke-snapshot",encodePatternBrushPng(pixel));syncBrushLibraryPanel(true);selectBrushLibraryItem(value.id,false,false);require(currentTools().pencilImageBrush&&currentTools().pencilImageBrushId==value.id,"Stroke fixture local selection not loaded");
  HANDLE lock=CreateFileW(std::filesystem::u8path(value.filePath).c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);require(lock!=INVALID_HANDLE_VALUE,"Stroke snapshot PNG lock");
  try{stroke(3,3,0xff412b15);stroke(5,3,0xff412b15);}catch(...){CloseHandle(lock);throw;}CloseHandle(lock);
  ProjectBrushResource project;project.metadata={"stroke-project","Stroke project","brushes/stroke.gray","brushes/stroke.rgba",1,1};project.brush=pixel;currentDocument().setImportedProjectBrushes({project});syncBrushLibraryPanel();selectBrushLibraryItem("project:stroke-project",false,false);
  project.brush.colors[0]=0xffabcdef;currentDocument().setImportedProjectBrushes({project});syncBrushLibraryPanel();stroke(3,5,0xff412b15); // surviving choice keeps its selected pixels, as legacy does
  currentTools().fillLibrarySelection={};selectBrushLibraryItem("project:stroke-project",false,false);stroke(5,5,0xffabcdef);currentDocument().setImportedProjectBrushes({});syncBrushLibraryPanel();require(!currentTools().pencilImageBrush&&currentTools().fillLibrarySelection.ids.empty(),"Deleted project snapshot remained selected");
  beginTemporaryBrushCapture();finishTemporaryBrushCapture(SelectionMask{3,3,1,1,{}});require(currentTools().temporaryBrushActive&&currentTools().pencilImageBrush,"Temporary stroke capture failed");stroke(7,7,0xff412b15);require(currentTools().temporaryBrushActive&&currentTools().pencilImageBrushId=="temporary-capture","Temporary snapshot became a disk resource");
  pointer(ui::kMouseDownMessage,8,8);ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);require(!currentDocument().active()&&currentDocument().canvasPixels()[8*12+8]==0,"Temporary image stroke Escape did not restore pixels");disableFlags(ui::HAS_CAPTURE);exitTemporaryBrushCapture();runtimePreferences_.set("tools.gridAlignmentEnabled",grid?"true":"false");
 }
 brushLibraryTestDirectory_.reset();fillFolder_.clear();currentTools().fillLibrarySelection={};currentTools().fillPattern.brushes.clear();currentTools().pencilImageBrushId.clear();currentTools().pencilImageBrush.reset();brushLibraryNeedsReload_=true;replaceDocumentForSmoke(Document());refresh();
}

bool Editor::handleBrushLibraryDrop(os::DragEvent& event,bool drop){
 if(!brushLibraryPanel_)return false;const auto point=event.position();const auto frame=toDisplay(columnFrame(12));const auto floating=topFloatingColumnAt(point);
 const bool inside=brushLibraryPanelOpen_&&columnShown(12)&&documentOpen_&&!homeOpen_&&frame.contains(point)&&(floating<0||docking_.groupOf(floating)==docking_.groupOf(12));
 if(!inside){brushLibraryPanel_->setExternalDrop(false);return false;}auto data=event.dataProvider();if(!data||!data->contains(os::DragDataItemType::Paths)){brushLibraryPanel_->setExternalDrop(false);return false;}
 if(pending_!=Pending::None||currentDocument().active()||!event.sourceSupports(os::DropOperation::Copy)){brushLibraryPanel_->setExternalDrop(false);event.dropResult(os::DropOperation::None);return true;}
 brushLibraryPanel_->setExternalDrop(!drop);event.dropResult(os::DropOperation::Copy);if(!drop)return true;brushLibraryPanel_->cancelPending();event.acceptDrop(true);
 // Paths have already passed legacy document-drop normalization and the
 // shared one-second filter before the resource destination is chosen.
 try{std::vector<std::filesystem::path> paths;for(const auto& value:data->getPaths())paths.push_back(std::filesystem::u8path(value));importBrushLibraryImages(paths,{});}catch(const std::exception& e){status_=U"图案拖入失败："+unicodeText(e.what());refresh();}
 return true;
}
void Editor::smokeBrushLibraryDrop(){
 auto require=[](bool ok,const char* why){if(!ok)throw std::runtime_error(why);};const auto previous=currentTools().fillLibrarySelection;const auto previousId=currentTools().pencilImageBrushId;const auto previousBrush=currentTools().pencilImageBrush;
 const auto dir=fillBrushLibraryDirectory();PatternBrushLibrary library(dir);const auto before=library.list().brushes.size();const auto stamp=createPatternBrushFromRgba(2,1,{255,0,0,255,0,0,255,128});const auto token=std::to_string(std::chrono::high_resolution_clock::now().time_since_epoch().count());const auto good=dir.parent_path()/("drop-input-"+token+".png"),bad=dir.parent_path()/("drop-bad-"+token+".png");writeExportBytesAtomic(good,encodePatternBrushPng(stamp));writeExportBytesAtomic(bad,{1,2,3});
 class Paths final:public os::DragDataProvider{base::paths paths_;public:explicit Paths(base::paths paths):paths_(std::move(paths)){}base::paths getPaths()override{return paths_;}os::SurfaceRef getImage()override{return {};}std::string getUrl()override{return {};}bool contains(os::DragDataItemType type)override{return type==os::DragDataItemType::Paths;}};
 auto event=[&](gfx::Point point,base::paths paths){return os::DragEvent(display()->nativeWindow(),os::DropOperation::Copy,point,std::make_unique<Paths>(std::move(paths)));};const auto point=brushLibraryPanel_->resourceBounds().center();auto native=display()->nativeWindow();require(native->hasDragTarget(),"Brush native OLE target");
 const auto identity=currentDocument().identity();const auto history=currentDocument().historySize();const auto revision=currentDocument().revision();const auto pixels=currentDocument().pixels();auto hover=event(point,{good.u8string()});native->notifyDragEnter(hover);require(brushLibraryPanel_->externalDrop(),"Brush external hover");native->notifyDragLeave(hover);require(!brushLibraryPanel_->externalDrop()&&library.list().brushes.size()==before,"Brush leave cancels hover only");auto outside=event({-1,-1},{good.u8string()});require(!handleBrushLibraryDrop(outside),"Brush drop outside unclaimed");
 auto partial=event(point,{good.u8string(),good.u8string(),bad.u8string()});native->notifyDragEnter(partial);native->notifyDrop(partial);const auto afterPartial=library.list().brushes.size();if(!partial.acceptDrop()||brushLibraryPanel_->externalDrop()||afterPartial!=before+1)throw std::runtime_error("Brush partial/drop dedupe: accepted="+std::to_string(partial.acceptDrop())+" hover="+std::to_string(brushLibraryPanel_->externalDrop())+" before="+std::to_string(before)+" after="+std::to_string(afterPartial)+" status="+utf8Text(status_));const auto selected=currentTools().fillLibrarySelection.active;require(!selected.empty()&&currentTools().pencilImageBrushId==selected&&currentTools().pencilImageBrush,"Brush drop selects successful resource");auto listing=library.list();auto value=std::find_if(listing.brushes.begin(),listing.brushes.end(),[&](const auto& b){return b.id==selected;});require(value!=listing.brushes.end()&&value->folderId.empty(),"Brush drop stores at legacy root");require(importPatternBrush(std::filesystem::u8path(value->filePath)).brush.colors==stamp.colors,"Brush dropped durable pixels");
 auto duplicate=event(point,{good.u8string()});native->notifyDragEnter(duplicate);native->notifyDrop(duplicate);require(library.list().brushes.size()==before+1,"Brush duplicate native delivery suppressed");auto unsupported=event(point,{(dir.parent_path()/"unsupported.moonsprite").u8string()});native->notifyDragEnter(unsupported);native->notifyDrop(unsupported);require(unsupported.acceptDrop()&&currentTools().fillLibrarySelection.active==selected&&library.list().brushes.size()==before+1,"Brush unsupported document claimed without opening");
 auto uri=event(point,{std::string("  ")+char(34)+"file:///"+good.generic_u8string()+char(34)+"  "});native->notifyDragEnter(uri);native->notifyDrop(uri);require(uri.acceptDrop()&&currentTools().fillLibrarySelection.active==selected&&library.list().brushes.size()==before+1,"Brush file URI duplicate is normalized before resource routing");
 const auto uriPath=dir.parent_path()/("uri drop-"+token+".png");const auto uriStamp=createPatternBrushFromRgba(1,1,{23,45,67,255});writeExportBytesAtomic(uriPath,encodePatternBrushPng(uriStamp));std::string uriName="file:///"+uriPath.generic_u8string();for(std::size_t pos=0;(pos=uriName.find(' ',pos))!=std::string::npos;pos+=3)uriName.replace(pos,1,"%20");auto freshUri=event(point,{"  "+std::string(1,char(34))+uriName+char(34)+"  "});native->notifyDragEnter(freshUri);native->notifyDrop(freshUri);require(freshUri.acceptDrop()&&library.list().brushes.size()==before+2&&currentTools().fillLibrarySelection.active!=selected&&currentTools().pencilImageBrush&&currentTools().pencilImageBrush->colors==uriStamp.colors,"Fresh file URI imports a reusable brush through normalized native route");
 require(currentDocument().identity()==identity&&currentDocument().historySize()==history&&currentDocument().revision()==revision&&currentDocument().pixels()==pixels,"Brush external import does not edit document");currentTools().fillLibrarySelection=previous;currentTools().pencilImageBrushId=previousId;currentTools().pencilImageBrush=previousBrush;applyFillLibrarySelection();brushLibraryNeedsReload_=true;syncBrushLibraryPanel(true);
}

void Editor::showBrushLibraryAdd(){
 if(pending_!=Pending::None||currentDocument().active())return;PixelMenu menu(skin_);auto add=[&](std::u32string label,const char* icon,std::function<void()> action){auto row=new PixelMenuItem(font_,skin_,std::move(label));row->iconSkin=&toolIcons_;row->icon=icon;row->Click.connect(std::move(action));menu.addChild(row);return row;};add(U"从选区创建笔刷","selectionOutline",[this]{createFillBrushFromSelection();});add(U"导入图像…","image",[this]{importFillImage();});add(U"新建文件夹…","newFolder",[this]{editFillFolder(false);});const auto at=brushLibraryActions_[0]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();
}
void Editor::smokeBrushLibraryDelete(){
 auto require=[](bool ok,const char* why){if(!ok)throw std::runtime_error(why);};fillFolder_.clear();PatternBrushLibrary library(fillBrushLibraryDirectory());const auto stamp=createPatternBrushFromRgba(2,1,{255,0,0,255,0,0,255,128});const auto first=library.save("delete-first",encodePatternBrushPng(stamp)),blocked=library.save("delete-blocked",encodePatternBrushPng(stamp));ProjectBrushResource resource;resource.metadata={"delete-project","Project brush","brushes/delete-project.gray","brushes/delete-project.rgba",2,1};resource.brush=stamp;currentDocument().setImportedProjectBrushes({resource});currentDocument().markSaved();const auto history=currentDocument().historySize();const auto revision=currentDocument().revision();const auto pixels=currentDocument().pixels();requestBrushMenuScan(this);syncBrushLibraryPanel(true);currentTools().fillLibrarySelection.ids={"project:delete-project",blocked.id,first.id};currentTools().fillLibrarySelection.active=currentTools().fillLibrarySelection.anchor="project:delete-project";applyFillLibrarySelection();require(brushLibraryActions_[0]->isEnabled()&&brushLibraryActions_[1]->isEnabled(),"Brush add and delete toolbar availability");
 for(int choice:{1,2,4}){confirmFillLibraryDelete(choice);require(std::filesystem::exists(std::filesystem::u8path(first.filePath))&&std::filesystem::exists(std::filesystem::u8path(blocked.filePath))&&currentDocument().projectBrushes().size()==1&&currentDocument().revision()==revision&&currentTools().fillLibrarySelection.ids.size()==3,("Brush delete cancel state choice="+std::to_string(choice)+" selected="+std::to_string(currentTools().fillLibrarySelection.ids.size())+" projects="+std::to_string(currentDocument().projectBrushes().size())+" revision="+std::to_string(currentDocument().revision())+" before="+std::to_string(revision)).c_str());}
 HANDLE locked=CreateFileW(std::filesystem::u8path(blocked.filePath).c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);require(locked!=INVALID_HANDLE_VALUE,"Brush deletion failure fixture lock");try{confirmFillLibraryDelete(3);}catch(...){CloseHandle(locked);throw;}CloseHandle(locked);require(!std::filesystem::exists(std::filesystem::u8path(first.filePath))&&std::filesystem::exists(std::filesystem::u8path(blocked.filePath))&&currentDocument().projectBrushes().size()==1&&currentTools().fillLibrarySelection.ids==std::vector<std::string>({"project:delete-project",blocked.id})&&status_.find(U"删除图案失败")!=std::u32string::npos,"Brush partial delete stops in display order and retains failed/later resources");
 confirmFillLibraryDelete(3);require(!std::filesystem::exists(std::filesystem::u8path(blocked.filePath))&&currentDocument().projectBrushes().empty()&&currentTools().fillLibrarySelection.ids.empty()&&currentTools().pencilImageBrushId.empty()&&!currentTools().pencilImageBrush&&currentTools().fillPattern.brushes.empty(),"Brush mixed local/project deletion clears active brush");const auto reopened=PatternBrushLibrary(fillBrushLibraryDirectory()).list();require(std::none_of(reopened.brushes.begin(),reopened.brushes.end(),[&](const auto& item){return item.id==first.id||item.id==blocked.id;}),"Brush delete local persistence");require(project::readProjectManifest(project::encodeEditableProject(currentDocument()).bytes).customBrushes.empty(),"Brush delete project persistence");require(currentDocument().pixels()==pixels&&currentDocument().historySize()==history&&currentDocument().dirty(),"Brush resource deletion leaves canvas/history unchanged and marks project dirty");refresh();
}

}
