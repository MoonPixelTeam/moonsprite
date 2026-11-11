#include "editor_implementation.h"
#include "editor.h"
#include "brush_library_delete_dialog.h"
#include "ui/property.h"
#include <thread>
#include <future>
namespace moon::editor {
namespace {
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
 brushLibraryPanel_->navigate=[this](const std::string& id){fillFolder_=id;fillLibrarySelection_.anchor.clear();refresh();};

 brushLibraryPanel_->reorder=[this](const std::vector<std::string>& expected,const std::vector<std::string>& next){if(pending_!=Pending::None||document.active())return;try{PatternBrushLibrary library(fillBrushLibraryDirectory());std::vector<std::string> current;for(const auto& item:library.list().brushes)current.push_back(item.id);if(current!=expected)throw std::runtime_error("Brush library changed during drag; refresh and try again");library.reorder(next);status_=U"图案顺序已保存";}catch(const std::exception& e){status_=U"图案排序失败："+unicodeText(e.what());}brushLibraryNeedsReload_=true;refresh();};
 brushLibraryPanel_->moveToFolder=[this](const std::vector<std::string>& ids,const std::string& folder){if(pending_!=Pending::None||document.active())return;try{PatternBrushLibrary library(fillBrushLibraryDirectory());library.moveGroup(ids,folder);status_=U"图案已移动到文件夹";}catch(const std::exception& e){status_=U"图案移动失败："+unicodeText(e.what());}brushLibraryNeedsReload_=true;refresh();};
 brushLibraryPanel_->context=[this]{showColumnContextMenu(Column(12));};brushLibraryPanel_->remove=[this]{if(pending_==Pending::None&&!document.active()&&!fillLibrarySelection_.ids.empty())confirmFillLibraryDelete();};
 const char* icons[]{"plus","delete","moreLines"};for(int i=0;i<3;++i){auto b=new PixelButton(font_,skin_,U"",[this,i]{if(i==0)showBrushLibraryAdd();else if(i==1)confirmFillLibraryDelete();else showBrushLibraryActions();});b->iconSkin=&toolIcons_;b->icon=icons[i];addChild(b);b->setVisible(false);brushLibraryActions_[i]=b;}
 menuCommands_.bind("toggleBrushLibraryPanel",{[this]{const bool next=!brushLibraryPanelOpen_;try{if(!smoke_){if(!brushLibraryPreferencesReadable_)throw std::runtime_error("Brush library preferences are unreadable");const auto text=std::string("brush-library-panel-v1 ")+(next?"1":"0")+" "+std::to_string(brushLibraryPanel_->swatchSize())+"\n";writeExportBytesAtomic(brushLibraryPreferencePath(),{text.begin(),text.end()});}brushLibraryPanelOpen_=next;initializeDocking();docking_.custom=true;if(next){docking_.select(12);brushLibraryNeedsReload_=true;}else requestFocus();refresh();saveWorkspaceSizes();}catch(const std::exception& e){status_=U"图案笔刷栏目保存失败："+unicodeText(e.what());refresh();}},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None;},[this]{return brushLibraryPanelOpen_;}});
 // Legacy BrushLibraryPanel shortcut handler reuses its existing actions.
 auto available=[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!document.active()&&brushLibraryPanel_->isVisible();};
 menuCommands_.bind("importBrushImage",{[this]{importFillImage();},available,{}});
 menuCommands_.bind("createBrushFolder",{[this]{editFillFolder(false);},available,{}});
 menuCommands_.bind("openBrushFolder",{[this]{try{PatternBrushLibrary library(fillBrushLibraryDirectory());const auto directory=fillBrushLibraryDirectory();const auto result=reinterpret_cast<INT_PTR>(ShellExecuteW(nullptr,L"open",directory.c_str(),nullptr,nullptr,SW_SHOWNORMAL));if(result<=32)throw std::runtime_error("Cannot open brush library folder");}catch(const std::exception& e){status_=U"无法打开笔刷文件夹："+unicodeText(e.what());refresh();}},available,{}});
 menuCommands_.bind("refreshBrushLibrary",{[this]{syncBrushLibraryPanel(true);refresh();},available,{}});
 menuCommands_.bind("brushLibraryParentFolder",{[this]{const auto slash=fillFolder_.find_last_of('/');brushLibraryPanel_->navigate(slash==std::string::npos?std::string{}:fillFolder_.substr(0,slash));},[this,available]{return available()&&!fillFolder_.empty();},{}});
 const int sizes[]{30,40,52};const char* ids[]{"brushSwatchSmall","brushSwatchMedium","brushSwatchLarge"};for(int i=0;i<3;++i)menuCommands_.bind(ids[i],{[this,value=sizes[i]]{try{if(!smoke_){if(!brushLibraryPreferencesReadable_)throw std::runtime_error("Brush library preferences are unreadable");const auto text=std::string("brush-library-panel-v1 ")+(brushLibraryPanelOpen_?"1":"0")+" "+std::to_string(value)+"\n";writeExportBytesAtomic(brushLibraryPreferencePath(),{text.begin(),text.end()});}brushLibraryPanel_->setSize(value);refresh();}catch(const std::exception& e){status_=U"图案尺寸偏好保存失败："+unicodeText(e.what());}},available,[this,value=sizes[i]]{return brushLibraryPanel_->swatchSize()==value;}});
 menuCommands_.bind("deleteBrushSelection",{[this]{confirmFillLibraryDelete();},[this,available]{return available()&&!fillLibrarySelection_.ids.empty();},{}});
 if(brushLibraryPanelOpen_){initializeDocking();docking_.custom=true;}
}
void Editor::syncBrushLibraryPanel(bool reload){
 if(!brushLibraryPanel_)return;
 std::string key=std::to_string(document.identity())+":"+fillBrushLibraryDirectory().u8string();
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
  for(const auto& item:document.projectBrushes())project.push_back({"project:"+item.metadata.id,unicodeText(item.metadata.name),item.brush});
  // Legacy controller refresh removes unavailable members from the live set,
  // retaining the existing pixels/order of surviving choices and active item.
  auto selection=fillLibrarySelection_;std::vector<PatternBrush> retained;std::u32string activeName;std::optional<PatternBrush> active;
  for(std::size_t i=0;i<fillLibrarySelection_.ids.size();++i){const auto& id=fillLibrarySelection_.ids[i];bool valid=false;
   if(id.rfind("project:",0)==0)valid=std::any_of(project.begin(),project.end(),[&](const auto& value){return value.id==id;});else valid=index.count(id)!=0;
   if(!valid)selection.removed(id);
  }
  const bool pruned=selection.ids!=fillLibrarySelection_.ids;
  if(pruned){
   for(const auto& id:selection.ids){const auto previous=std::find(fillLibrarySelection_.ids.begin(),fillLibrarySelection_.ids.end(),id);const auto position=std::size_t(previous-fillLibrarySelection_.ids.begin());const PatternBrush* brush=nullptr;std::u32string label;
    if(id.rfind("project:",0)==0){const auto item=std::find_if(project.begin(),project.end(),[&](const auto& value){return value.id==id;});brush=&item->brush;label=item->name;}else{const auto& item=result.local[index.at(id)];brush=&item.brush;label=item.name;}
    if(position<fillPattern_.brushes.size())brush=&fillPattern_.brushes[position];
    if(id==selection.active){active=*brush;activeName=std::move(label);}retained.push_back(*brush);
   }
  }

  brushLibraryPanel_->setResources(result.listing,fillFolder_,visibleLocal,project);
  result.folder=fillFolder_;scan->publishedProjectRevision=document.projectBrushRevision();
  if(pruned){fillLibrarySelection_=std::move(selection);fillPattern_.brushes=std::move(retained);pencilImageBrushId_=fillLibrarySelection_.active;pencilImageBrush_=std::move(active);fillImageName_=std::move(activeName);saveBrushPreferences();}
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
    scan->loaded=std::move(result);scan->localIndex=std::move(index);scan->folderOrder=std::move(folders);scan->loadedDocument=document.identity();scan->loadedDirectory=fillBrushLibraryDirectory();scan->menuRequested=false;
    publish();
   }
   else{scan->menuRequested=false;status_=U"图案笔刷库读取失败："+unicodeText(result.error);}
  }else brushLibraryNeedsReload_=true;
 }
 if(brushLibraryNeedsReload_&&visible&&!scan->pending){scan->start(fillBrushLibraryDirectory(),fillFolder_,key);brushLibraryNeedsReload_=false;}
 // Publish project changes even while a local refresh is in flight. The
 // eventual scan also merges the latest project collection, never its snapshot.
 if(visible&&scan->loaded&&scan->loadedDocument==document.identity()&&scan->loadedDirectory==fillBrushLibraryDirectory()&&
    (scan->publishedProjectRevision!=document.projectBrushRevision()||(!scan->pending&&!brushLibraryNeedsReload_&&scan->loaded->folder!=fillFolder_)))publish();
 // Existing deterministic UI fixtures explicitly wait; production only polls.
 if(smoke_&&scan->pending){scan->future.wait();syncBrushLibraryPanel();return;}
 brushLibraryPanel_->syncSelection(fillLibrarySelection_.ids,pending_==Pending::None&&!document.active());brushLibraryActions_[0]->setEnabled(pending_==Pending::None&&!document.active());brushLibraryActions_[1]->setEnabled(pending_==Pending::None&&!document.active()&&!fillLibrarySelection_.ids.empty());brushLibraryActions_[2]->setEnabled(pending_==Pending::None&&!document.active());
}
void Editor::layoutBrushLibraryPanel(){if(!brushLibraryPanel_)return;const bool show=columnShown(12)&&documentOpen_&&!homeOpen_;brushLibraryPanel_->setVisible(show);for(auto b:brushLibraryActions_)b->setVisible(show);if(!show){brushLibraryPanel_->cancelPending();return;}const auto chrome=columnChrome(12);brushLibraryPanel_->setBounds(toDisplay(chrome.content));for(int i=0;i<3;++i)brushLibraryActions_[i]->setBounds(toDisplay({chrome.actions.x+i*(15+UiSpacing::related),chrome.actions.y,15,15}));}
void Editor::applyFillLibrarySelection(){
    const auto scan=std::dynamic_pointer_cast<BrushScanWork>(getProperty("moonsprite.brush-scan"));
    const bool cached=scan&&scan->loaded&&scan->loadedDocument==document.identity()&&scan->loadedDirectory==fillBrushLibraryDirectory();
    // Session/fixture restoration before first load retains the explicit loader.
    std::optional<PatternBrushListing> listing;if(!cached)listing=PatternBrushLibrary(fillBrushLibraryDirectory()).list();std::vector<PatternBrush> brushes;std::optional<PatternBrush> active;std::u32string name;
    for(const auto& id:fillLibrarySelection_.ids){
      PatternBrush brush;std::u32string label;
      if(id.rfind("project:",0)==0){const auto resource=std::find_if(document.projectBrushes().begin(),document.projectBrushes().end(),[&](const auto& value){return value.metadata.id==id.substr(8);});if(resource==document.projectBrushes().end())throw std::runtime_error("Project brush no longer exists");brush=resource->brush;label=unicodeText(resource->metadata.name);}
      else if(cached){const auto found=scan->localIndex.find(id);if(found==scan->localIndex.end())throw std::runtime_error("Local brush is not loaded: "+id);const auto& item=scan->loaded->local[found->second];brush=item.brush;label=item.name;}
      else{const auto item=std::find_if(listing->brushes.begin(),listing->brushes.end(),[&](const auto& value){return value.id==id;});if(item==listing->brushes.end())throw std::runtime_error("Local brush no longer exists");brush=importPatternBrush(std::filesystem::u8path(item->filePath)).brush;brush.selectionColorMapping=item->sourceX.has_value()&&item->sourceY.has_value();brush.sourceX=item->sourceX.value_or(0);brush.sourceY=item->sourceY.value_or(0);label=unicodeText(item->name);}
      if(id==fillLibrarySelection_.active){active=brush;name=label;}brushes.push_back(std::move(brush));
    }
    if(!fillLibrarySelection_.active.empty()&&!active)throw std::runtime_error("Active brush is not selected");
    // Commit only after every resource loaded; a failure preserves live pixels.
    if(active&&!temporaryBrushReturnProfile_)temporaryBrushReturnProfile_=brushFeedback_.brushProfiles_[0];
    temporaryBrushActive_=false;fillPattern_.brushes=std::move(brushes);fillImageName_=std::move(name);pencilImageBrushId_=fillLibrarySelection_.active;pencilImageBrush_=std::move(active);
}

void Editor::selectBrushLibraryItem(const std::string& id,bool ctrl,bool shift){
 if(pending_!=Pending::None||document.active())return;
 try{
  const auto scan=std::dynamic_pointer_cast<BrushScanWork>(getProperty("moonsprite.brush-scan"));
  if(!scan||!scan->loaded||scan->loadedDocument!=document.identity()||scan->loadedDirectory!=fillBrushLibraryDirectory()||scan->loaded->folder!=fillFolder_)throw std::runtime_error("Brush library is loading; try again when ready");
  // Legacy's controller retains decoded resources across refreshes and folders.
  // Clicks must never rescan the filesystem or decode the chosen image again.
  const auto& loaded=*scan->loaded;std::vector<std::string> ordered;
  const auto folder=scan->folderOrder.find(fillFolder_);if(folder!=scan->folderOrder.end())ordered=folder->second;
  if(fillFolder_.empty())for(const auto& item:document.projectBrushes())ordered.push_back("project:"+item.metadata.id);
  if(std::find(ordered.begin(),ordered.end(),id)==ordered.end())throw std::runtime_error("Brush is not loaded in current folder");
  auto selection=fillLibrarySelection_;selection.select(ordered,id,ctrl,shift);
  std::vector<PatternBrush> brushes;std::optional<PatternBrush> active;std::u32string name;
  for(const auto& selected:selection.ids){
   const PatternBrush* brush=nullptr;std::u32string label;
   if(selected.rfind("project:",0)==0){const auto item=std::find_if(document.projectBrushes().begin(),document.projectBrushes().end(),[&](const auto& value){return value.metadata.id==selected.substr(8);});if(item!=document.projectBrushes().end()){brush=&item->brush;label=unicodeText(item->metadata.name);}}
   else{const auto item=scan->localIndex.find(selected);if(item!=scan->localIndex.end()){const auto& resource=loaded.local[item->second];brush=&resource.brush;label=resource.name;}}
   if(!brush)throw std::runtime_error("Selected brush is no longer loaded");
   if(selected==selection.active){active=*brush;name=std::move(label);}brushes.push_back(*brush);
  }
  if(!selection.active.empty()&&!active)throw std::runtime_error("Active brush is not selected");
  if(active&&!temporaryBrushReturnProfile_)temporaryBrushReturnProfile_=brushFeedback_.brushProfiles_[0];
  temporaryBrushActive_=false;fillLibrarySelection_=std::move(selection);fillPattern_.brushes=std::move(brushes);fillImageName_=std::move(name);pencilImageBrushId_=fillLibrarySelection_.active;pencilImageBrush_=std::move(active);
  saveBrushPreferences();status_=fillLibrarySelection_.ids.empty()?U"已停用图像笔刷":U"已选择图案："+fillImageName_;
 }catch(const std::exception& e){status_=U"图案选择失败："+unicodeText(e.what());}refresh();
}
void Editor::showPencilImageBrushes(){if(document.active())return;PixelMenu menu(skin_);auto clear=new PixelMenuItem(font_,skin_,U"普通笔刷");clear->Click.connect([this]{temporaryBrushActive_=false;pencilImageBrushId_.clear();pencilImageBrush_.reset();saveBrushPreferences();refresh();});menu.addChild(clear);syncBrushLibraryPanel();auto scan=requestBrushMenuScan(this);syncBrushLibraryPanel();
 const bool ready=scan&&scan->loaded&&scan->loadedDocument==document.identity()&&scan->loadedDirectory==fillBrushLibraryDirectory();
 if(ready){if(!scan->pending)scan->menuRequested=false;for(const auto& item:scan->loaded->local){auto row=new PixelMenuItem(font_,skin_,item.name);row->checked=[this,id=item.id]{return pencilImageBrushId_==id;};row->Click.connect([this,id=item.id,brush=item.brush,identity=document.identity(),directory=fillBrushLibraryDirectory()]{if(identity!=document.identity()||directory!=fillBrushLibraryDirectory())return;if(!temporaryBrushReturnProfile_)temporaryBrushReturnProfile_=brushFeedback_.brushProfiles_[0];temporaryBrushActive_=false;pencilImageBrushId_=id;pencilImageBrush_=brush;saveBrushPreferences();refresh();});menu.addChild(row);}}
 else{auto loading=new PixelMenuItem(font_,skin_,U"笔刷库加载中…");loading->setEnabled(false);menu.addChild(loading);}
 for(const auto& item:document.projectBrushes()){auto row=new PixelMenuItem(font_,skin_,U"工程："+unicodeText(item.metadata.name));row->checked=[this,id=item.metadata.id]{return pencilImageBrushId_=="project:"+id;};row->Click.connect([this,id=item.metadata.id,identity=document.identity()]{if(identity!=document.identity())return;pencilImageBrushId_="project:"+id;resolvePencilImageBrush();saveBrushPreferences();refresh();});menu.addChild(row);}
 menu.addChild(new PixelMenuSeparator(skin_));auto angleLabel=new PixelMenuItem(font_,skin_,U"角度（度）");angleLabel->setEnabled(false);menu.addChild(angleLabel);auto angle=new PixelEntry(font_,skin_);angle->numeric=true;angle->setText(std::to_string(int(pencilImageBrushAngle_)));menu.addChild(angle);angle->Change.connect([this,angle]{try{std::size_t used=0;double value=std::stod(angle->text(),&used);if(used==angle->text().size() && std::isfinite(value)){pencilImageBrushAngle_=std::clamp(value,-180.0,180.0);saveBrushPreferences();}}catch(...){} });auto at=imageBrushButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();}

void Editor::selectFillLibraryBrush(const std::string& id,bool ctrl,bool shift){selectBrushLibraryItem(id,ctrl,shift);}

void Editor::showFillLibraryMenu(){

    PixelMenu menu(skin_);auto capture=new PixelMenuItem(font_,skin_,U"从选区创建笔刷");capture->Click.connect([this]{createFillBrushFromSelection();});menu.addChild(capture);auto folders=new PixelMenuItem(font_,skin_,U"文件夹…");folders->Click.connect([this]{showFillFolderMenu();});menu.addChild(folders);auto load=new PixelMenuItem(font_,skin_,U"导入图像…");load->Click.connect([this]{importFillImage();});menu.addChild(load);

    syncBrushLibraryPanel();auto scan=requestBrushMenuScan(this);syncBrushLibraryPanel();
    const bool ready=scan&&scan->loaded&&scan->loadedDocument==document.identity()&&scan->loadedDirectory==fillBrushLibraryDirectory()&&scan->loaded->folder==fillFolder_;
    if(ready){if(!scan->pending)scan->menuRequested=false;const auto order=scan->folderOrder.find(fillFolder_);if(order!=scan->folderOrder.end())for(const auto& id:order->second){const auto& item=scan->loaded->local[scan->localIndex.at(id)];auto row=new PixelMenuItem(font_,skin_,item.name);row->checked=[this,id]{return std::find(fillLibrarySelection_.ids.begin(),fillLibrarySelection_.ids.end(),id)!=fillLibrarySelection_.ids.end();};row->Click.connect([this,id]{selectFillLibraryBrush(id,(GetKeyState(VK_CONTROL)&0x8000)!=0,(GetKeyState(VK_SHIFT)&0x8000)!=0);});menu.addChild(row);}}
    else{auto loading=new PixelMenuItem(font_,skin_,U"笔刷库加载中…");loading->setEnabled(false);menu.addChild(loading);}

    if(fillFolder_.empty())for(const auto& resource:document.projectBrushes()){auto row=new PixelMenuItem(font_,skin_,U"工程 · "+unicodeText(resource.metadata.name));row->checked=[this,id="project:"+resource.metadata.id]{return std::find(fillLibrarySelection_.ids.begin(),fillLibrarySelection_.ids.end(),id)!=fillLibrarySelection_.ids.end();};row->Click.connect([this,id="project:"+resource.metadata.id]{selectFillLibraryBrush(id,(GetKeyState(VK_CONTROL)&0x8000)!=0,(GetKeyState(VK_SHIFT)&0x8000)!=0);});menu.addChild(row);}

    if(!fillLibrarySelection_.ids.empty()){auto remove=new PixelMenuItem(font_,skin_,U"删除选中图案…");remove->Click.connect([this]{confirmFillLibraryDelete();});menu.addChild(remove);}if(!fillPattern_.brushes.empty()){auto clear=new PixelMenuItem(font_,skin_,U"停用图像图案");clear->Click.connect([this]{temporaryBrushActive_=false;fillLibrarySelection_={};fillPattern_.brushes.clear();fillImageName_.clear();pencilImageBrushId_.clear();pencilImageBrush_.reset();saveBrushPreferences();refresh();});menu.addChild(clear);}

    auto mode=new PixelMenuItem(font_,skin_,U"布局：默认 / 规则 / 随机");mode->Click.connect([this]{fillPattern_.mode=fillPattern_.mode==PatternMode::Default?PatternMode::Regular:fillPattern_.mode==PatternMode::Regular?PatternMode::Random:PatternMode::Default;saveBrushPreferences();refresh();});menu.addChild(mode);

    auto sample=new PixelMenuItem(font_,skin_,U"采样：绘制 / 源坐标 / 目标坐标");sample->Click.connect([this]{fillPattern_.paintMode=PatternPaintMode((int(fillPattern_.paintMode)+1)%3);saveBrushPreferences();refresh();});menu.addChild(sample);

    auto settings=new PixelMenuItem(font_,skin_,U"图案参数…");settings->setEnabled(fillPattern_.mode!=PatternMode::Default);settings->Click.connect([this]{showFillPatternSettings();});menu.addChild(settings);

    auto at=fillImageButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();

  }

void Editor::showFillFolderMenu(){PixelMenu menu(skin_);syncBrushLibraryPanel();auto scan=requestBrushMenuScan(this);syncBrushLibraryPanel();try{if(!scan||!scan->loaded||scan->loadedDocument!=document.identity()||scan->loadedDirectory!=fillBrushLibraryDirectory())throw std::runtime_error("Brush library is loading");if(!scan->pending)scan->menuRequested=false;const auto& listing=scan->loaded->listing;auto root=new PixelMenuItem(font_,skin_,U"根文件夹");root->Click.connect([this]{fillFolder_.clear();refresh();});menu.addChild(root);for(const auto& folder:listing.folders){auto row=new PixelMenuItem(font_,skin_,unicodeText(folder.id));row->checked=[this,id=folder.id]{return fillFolder_==id;};row->Click.connect([this,id=folder.id]{fillFolder_=id;refresh();});menu.addChild(row);}auto create=new PixelMenuItem(font_,skin_,U"新建子文件夹…");create->Click.connect([this]{editFillFolder(false);});menu.addChild(create);if(!fillFolder_.empty()){auto rename=new PixelMenuItem(font_,skin_,U"重命名当前文件夹…");rename->Click.connect([this]{editFillFolder(true);});menu.addChild(rename);auto remove=new PixelMenuItem(font_,skin_,U"删除当前文件夹…");remove->Click.connect([this]{confirmFillFolderDelete();});menu.addChild(remove);}if(!fillLibrarySelection_.ids.empty()){auto move=new PixelMenuItem(font_,skin_,U"移动选中图案到根文件夹");move->Click.connect([this]{moveFillBrushes({});});menu.addChild(move);for(const auto& folder:listing.folders){auto row=new PixelMenuItem(font_,skin_,U"移动选中图案到 "+unicodeText(folder.id));row->Click.connect([this,id=folder.id]{moveFillBrushes(id);});menu.addChild(row);}}}catch(const std::exception& e){status_=U"文件夹读取失败："+unicodeText(e.what());}auto at=brushLibraryPanel_&&brushLibraryPanel_->isVisible()?brushLibraryActions_[2]->bounds():fillImageButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();}

void Editor::showBrushLibraryActions(){PixelMenu menu(skin_);auto add=[&](std::u32string label,std::function<void()> action){auto row=new PixelMenuItem(font_,skin_,std::move(label));row->Click.connect(std::move(action));menu.addChild(row);return row;};add(U"文件夹…",[this]{showFillFolderMenu();});add(U"删除选中图案…",[this]{confirmFillLibraryDelete();})->setEnabled(!fillLibrarySelection_.ids.empty());add(U"刷新",[this]{syncBrushLibraryPanel(true);refresh();});menu.addChild(new PixelMenuSeparator(skin_));const int sizes[]{30,40,52};const char* ids[]{"brushSwatchSmall","brushSwatchMedium","brushSwatchLarge"};const char32_t* labels[]{U"小",U"中",U"大"};for(int i=0;i<3;++i){auto row=add(labels[i],[this,id=std::string(ids[i])]{menuCommands_.invoke(id);});row->checked=[this,value=sizes[i]]{return brushLibraryPanel_->swatchSize()==value;};}auto at=brushLibraryActions_[2]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();}
void Editor::smokeBrushLibraryPanel(){
 auto require=[](bool ok,const char* why){if(!ok)throw std::runtime_error(why);};smoke_=true;documentOpen_=true;homeOpen_=false;pending_=Pending::None;playing_=false;document=Document(4,4);document.markSaved();
 const auto stamp=createPatternBrushFromRgba(2,1,{255,0,0,255,0,0,255,128});const auto dir=assets_.parent_path()/"brush-library-panel-owned"/std::to_string(std::chrono::high_resolution_clock::now().time_since_epoch().count());brushLibraryTestDirectory_=dir;PatternBrushLibrary library(dir);const auto first=library.save("first",encodePatternBrushPng(stamp)),second=library.save("second",encodePatternBrushPng(stamp));const auto folder=library.createFolder("Actors");library.move(second.id,folder.id);
 auto history=document.historySize(),revision=document.revision();const auto pixels=document.pixels();if(brushLibraryPanelOpen_)menuCommands_.invoke("toggleBrushLibraryPanel");require(menuCommands_.invoke("toggleBrushLibraryPanel")&&brushLibraryPanelOpen_&&columnShown(12),"Brush library menu opening");refresh();require(brushLibraryPanel_->isVisible()&&brushLibraryPanel_->resourceBounds().w>0,"Brush library shared panel layout");
 // Exercise production polling, not the deterministic fixture wait branch.
 {smoke_=false;syncBrushLibraryPanel(true);auto scan=std::dynamic_pointer_cast<BrushScanWork>(getProperty("moonsprite.brush-scan"));require(scan&&scan->pending,"Background scan did not launch");const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(5);while(scan->pending&&std::chrono::steady_clock::now()<deadline){syncBrushLibraryPanel();Sleep(1);}require(!scan->pending,"Background scan failed to publish");
  {std::promise<BrushScanResult> held;scan->future=held.get_future();scan->pending=true;const auto beforePoll=std::chrono::steady_clock::now();for(int i=0;i<100;++i)syncBrushLibraryPanel();require(scan->pending&&std::chrono::steady_clock::now()-beforePoll<std::chrono::seconds(2),"UI polls waited for unfinished brush scan");syncBrushLibraryPanel(true);require(brushLibraryNeedsReload_,"Refresh did not queue next generation");BrushScanResult old;old.key="other-project";held.set_value(std::move(old));syncBrushLibraryPanel();require(scan->pending&&!brushLibraryNeedsReload_,"Stale generation did not launch queued refresh");scan->future.wait();syncBrushLibraryPanel();require(!scan->pending,"Queued refresh did not complete");}
  std::promise<BrushScanResult> delayed;scan->future=delayed.get_future();scan->pending=true;const auto oldKey=brushLibraryResourceKey_;brushLibraryPanelOpen_=false;BrushScanResult stale;stale.key=oldKey;delayed.set_value(std::move(stale));syncBrushLibraryPanel();require(!scan->pending&&brushLibraryNeedsReload_,"Hidden panel accepted stale scan");brushLibraryPanelOpen_=true;smoke_=true;syncBrushLibraryPanel();}
 // Menu requests load the controller even while its dock column is hidden.
 {auto scan=std::dynamic_pointer_cast<BrushScanWork>(getProperty("moonsprite.brush-scan"));const bool open=brushLibraryPanelOpen_;brushLibraryPanelOpen_=false;requestBrushMenuScan(this);syncBrushLibraryPanel(true);require(scan->loaded&&scan->loadedDocument==document.identity()&&!scan->pending&&!scan->menuRequested,"Hidden menu request did not finish background scan");brushLibraryPanelOpen_=open;
  HANDLE locked=CreateFileW(std::filesystem::u8path(first.filePath).c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);require(locked!=INVALID_HANDLE_VALUE,"Fill menu cached resource lock");fillLibrarySelection_={};selectFillLibraryBrush(first.id,false,false);const bool reused=pencilImageBrushId_==first.id&&pencilImageBrush_&&pencilImageBrush_->colors==stamp.colors;CloseHandle(locked);require(reused,"Fill menu selection decoded cached file again");fillLibrarySelection_={};fillPattern_.brushes.clear();pencilImageBrushId_.clear();pencilImageBrush_.reset();
 }
 // A hidden-column menu must keep ownership of a pending refresh even
 // while it serves the prior cached generation. Navigation uses latest folder.
 {auto scan=std::dynamic_pointer_cast<BrushScanWork>(getProperty("moonsprite.brush-scan"));const bool open=brushLibraryPanelOpen_;brushLibraryPanelOpen_=false;smoke_=false;requestBrushMenuScan(this);syncBrushLibraryPanel(true);require(scan->pending&&scan->menuRequested,"Menu refresh lost request ownership");
  fillFolder_=folder.id;const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(5);while(scan->pending&&std::chrono::steady_clock::now()<deadline){syncBrushLibraryPanel();Sleep(1);}require(!scan->pending&&scan->loaded->folder==folder.id&&!scan->menuRequested,"Pending hidden menu refresh lost latest folder");fillFolder_.clear();brushLibraryPanelOpen_=open;smoke_=true;syncBrushLibraryPanel();
 }
 // Cached choices survive unavailable files until an explicit refresh publishes.
 {const auto cached=library.save("cached-choice",encodePatternBrushPng(stamp));syncBrushLibraryPanel(true);
  HANDLE locked=CreateFileW(std::filesystem::u8path(cached.filePath).c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);require(locked!=INVALID_HANDLE_VALUE,"Cached selection exclusive file lock");
  selectBrushLibraryItem(first.id,false,false);selectBrushLibraryItem(cached.id,true,false);const bool reused=fillLibrarySelection_.ids==std::vector<std::string>({first.id,cached.id})&&pencilImageBrush_&&pencilImageBrush_->colors==stamp.colors;CloseHandle(locked);require(reused,"Cached multi-selection reread locked image");
  fillLibrarySelection_={};selectBrushLibraryItem(first.id,false,false);selectBrushLibraryItem(cached.id,false,true);require(fillLibrarySelection_.ids==std::vector<std::string>({first.id,cached.id}),"Cached shift range ordering");
  writeExportBytesAtomic(std::filesystem::u8path(cached.filePath),{1,2,3});syncBrushLibraryPanel(true);fillLibrarySelection_={};selectBrushLibraryItem(first.id,false,false);const auto before=fillLibrarySelection_.ids;selectBrushLibraryItem(cached.id,true,false);require(fillLibrarySelection_.ids==before&&pencilImageBrushId_==first.id,"Refreshed corrupt image remained selectable");
  ProjectBrushResource project;project.metadata={"cached-project","Cached project","brushes/cached.gray","brushes/cached.rgba",2,1};project.brush=stamp;document.setImportedProjectBrushes({project});syncBrushLibraryPanel();selectBrushLibraryItem("project:cached-project",true,false);require(fillLibrarySelection_.ids==std::vector<std::string>({first.id,"project:cached-project"})&&pencilImageBrushId_=="project:cached-project","Cached project selection order");
  auto scan=std::dynamic_pointer_cast<BrushScanWork>(getProperty("moonsprite.brush-scan"));const auto resourceKey=brushLibraryResourceKey_;const auto localPixels=scan->loaded->local.data();
  HANDLE projectLock=CreateFileW(std::filesystem::u8path(first.filePath).c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);require(projectLock!=INVALID_HANDLE_VALUE,"Project-only update local PNG lock");
  try{
   project.brush.colors[0]=0xff314159;const auto resourceRevision=document.projectBrushRevision();document.setImportedProjectBrushes({project});require(document.projectBrushRevision()!=resourceRevision,"Project resource replacement did not invalidate revision");syncBrushLibraryPanel();
   require(brushLibraryResourceKey_==resourceKey&&!scan->pending&&scan->loaded->local.data()==localPixels&&scan->publishedProjectRevision==document.projectBrushRevision(),"Project-only replacement rescanned local library");
   fillLibrarySelection_={};selectBrushLibraryItem("project:cached-project",false,false);require(pencilImageBrush_&&pencilImageBrush_->colors[0]==0xff314159,"Refreshed project selection used stale pixels");
   selectBrushLibraryItem(first.id,true,false);selectBrushLibraryItem("project:cached-project",false,true);
   document.setImportedProjectBrushes({});syncBrushLibraryPanel();require(fillLibrarySelection_.ids==std::vector<std::string>({first.id})&&pencilImageBrushId_==first.id&&pencilImageBrush_&&pencilImageBrush_->colors==stamp.colors&&!scan->pending&&scan->loaded->local.data()==localPixels,"Project deletion failed to prune with cached local survivor");
   // Hold a local result while project resources change twice. Neither update
   // queues disk work, and the completed result must merge the latest project.
   std::promise<BrushScanResult> held;auto result=*scan->loaded;scan->future=held.get_future();scan->pending=true;smoke_=false;
   project.brush.colors[0]=0xff271828;document.setImportedProjectBrushes({project});syncBrushLibraryPanel();require(scan->pending&&!brushLibraryNeedsReload_&&scan->publishedProjectRevision==document.projectBrushRevision(),"Pending scan blocked project publication");
   project.brush.colors[0]=0xff161803;document.setImportedProjectBrushes({project});held.set_value(std::move(result));syncBrushLibraryPanel();smoke_=true;require(!scan->pending&&!brushLibraryNeedsReload_&&scan->publishedProjectRevision==document.projectBrushRevision(),"Local completion queued stale project scan");
   fillLibrarySelection_={};selectBrushLibraryItem("project:cached-project",false,false);require(pencilImageBrush_&&pencilImageBrush_->colors[0]==0xff161803,"Local scan published stale project pixels");
  }catch(...){CloseHandle(projectLock);smoke_=true;throw;}CloseHandle(projectLock);
  document.setImportedProjectBrushes({});syncBrushLibraryPanel();require(fillLibrarySelection_.ids.empty()&&!pencilImageBrush_&&fillPattern_.brushes.empty(),"Last project removal retained live brush");document.markSaved();library.remove(cached.id);fillLibrarySelection_={};pencilImageBrushId_.clear();pencilImageBrush_.reset();fillPattern_.brushes.clear();syncBrushLibraryPanel(true);
 }
 // Resource mutations must not synchronously decode surviving choices.
 {
  fillFolder_.clear();syncBrushLibraryPanel(true);fillLibrarySelection_={};selectBrushLibraryItem(first.id,false,false);
  const auto survivor=*pencilImageBrush_;const auto mutationFolder=library.createFolder("Mutation cache");const auto removable=library.save("mutation-remove",encodePatternBrushPng(stamp));syncBrushLibraryPanel(true);selectBrushLibraryItem(removable.id,true,false);
  const bool open=brushLibraryPanelOpen_;brushLibraryPanelOpen_=false;
  HANDLE locked=CreateFileW(std::filesystem::u8path(first.filePath).c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);require(locked!=INVALID_HANDLE_VALUE,"Mutation survivor PNG lock");
  try{
   deleteFillLibrarySelection({removable.id});require(fillLibrarySelection_.ids==std::vector<std::string>({first.id})&&pencilImageBrushId_==first.id&&pencilImageBrush_&&pencilImageBrush_->colors==survivor.colors&&status_.find(U"已删除笔刷")!=std::u32string::npos,"Delete reread or cleared locked survivor");
   editFillFolder(false);paletteInput_->setText("Mutation created");resolve(true);require(pending_==Pending::None&&fillFolder_=="Mutation created"&&pencilImageBrush_&&pencilImageBrush_->colors==survivor.colors,"Folder create falsely failed on selected PNG");
   editFillFolder(true);paletteInput_->setText("Mutation renamed");resolve(true);require(pending_==Pending::None&&fillFolder_=="Mutation renamed"&&std::filesystem::is_directory(dir/"Mutation renamed")&&pencilImageBrushId_==first.id,"Folder rename falsely failed on selected PNG");
  }catch(...){CloseHandle(locked);brushLibraryPanelOpen_=open;throw;}CloseHandle(locked);
  // Deny readers while allowing rename: moving must preserve selected pixels.
  locked=CreateFileW(std::filesystem::u8path(first.filePath).c_str(),0,FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);require(locked!=INVALID_HANDLE_VALUE,"Move selected PNG reader lock");
  try{moveFillBrushes(mutationFolder.id);require(pencilImageBrush_&&pencilImageBrush_->colors==survivor.colors&&status_==U"已移动选中图案"&&std::filesystem::exists(dir/"Mutation cache"/std::filesystem::u8path(first.id)),"Move reread selected PNG or reported false failure");}catch(...){CloseHandle(locked);brushLibraryPanelOpen_=open;throw;}CloseHandle(locked);
  moveFillBrushes({});fillFolder_.clear();brushLibraryPanelOpen_=open;refresh();syncBrushLibraryPanel(true);require(pencilImageBrushId_==first.id&&pencilImageBrush_&&pencilImageBrush_->colors==survivor.colors,"Mutation refresh lost surviving brush");fillLibrarySelection_={};pencilImageBrushId_.clear();pencilImageBrush_.reset();fillPattern_.brushes.clear();
 }
 history=document.historySize();revision=document.revision();
 brushLibraryPanel_->smokeDrag();brushLibraryNeedsReload_=true;syncBrushLibraryPanel(true);
 selectBrushLibraryItem(first.id,false,false);require(pencilImageBrushId_==first.id&&pencilImageBrush_&&fillPattern_.brushes.size()==1,"Library selection shares pencil/fill");require(!brushLibraryNeedsReload_,"Selection unexpectedly reloaded brush thumbnails");const auto selectedBeforeFailedMove=fillLibrarySelection_.ids;brushLibraryPanel_->moveToFolder({first.id},"missing-folder");require(fillLibrarySelection_.ids==selectedBeforeFailedMove&&pencilImageBrushId_==first.id&&std::filesystem::exists(std::filesystem::u8path(first.filePath)),"Failed cross-folder drag retains source and selection");selectBrushLibraryItem(first.id,false,false);require(pencilImageBrushId_.empty()&&!pencilImageBrush_&&fillPattern_.brushes.empty(),"Library repeat click deselects");
 brushLibraryPanel_->navigate(folder.id);selectBrushLibraryItem(second.id,false,false);require(pencilImageBrushId_==second.id,"Nested library navigation");const auto before=fillLibrarySelection_.ids;selectBrushLibraryItem("missing.png",false,false);require(fillLibrarySelection_.ids==before&&pencilImageBrushId_==second.id,"Missing selection retains brush");
 // Full refresh lifecycle: discard unavailable members, retain order and
 // surviving in-memory pixels, then clear the last lost active choice.
 {const auto a=library.save("refresh-a",encodePatternBrushPng(stamp)),b=library.save("refresh-b",encodePatternBrushPng(stamp));library.move(a.id,folder.id);library.move(b.id,folder.id);syncBrushLibraryPanel(true);selectBrushLibraryItem(a.id,false,false);selectBrushLibraryItem(b.id,true,false);library.remove(b.id);syncBrushLibraryPanel(true);require(fillLibrarySelection_.ids==std::vector<std::string>({a.id})&&pencilImageBrushId_==a.id&&pencilImageBrush_&&fillPattern_.brushes.size()==1,"Refresh did not prune lost active resource");
  library.remove(a.id);syncBrushLibraryPanel(true);require(fillLibrarySelection_.ids.empty()&&pencilImageBrushId_.empty()&&!pencilImageBrush_&&fillPattern_.brushes.empty()&&fillImageName_.empty(),"Refresh did not clear final missing brush");selectBrushLibraryItem(second.id,false,false);require(pencilImageBrushId_==second.id,"Refresh lifecycle did not restore next valid selection");}
 // Navigation is purely in-memory, including cross-folder selected patterns.
 {auto scan=std::dynamic_pointer_cast<BrushScanWork>(getProperty("moonsprite.brush-scan"));const auto* generation=&*scan->loaded;HANDLE locked=CreateFileW(std::filesystem::u8path(first.filePath).c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);require(locked!=INVALID_HANDLE_VALUE,"Navigation cache file lock");
  brushLibraryPanel_->navigate({});selectBrushLibraryItem(first.id,true,false);const bool selected=fillLibrarySelection_.ids==std::vector<std::string>({second.id,first.id})&&pencilImageBrushId_==first.id;brushLibraryPanel_->navigate(folder.id);const bool reused=!scan->pending&&!brushLibraryNeedsReload_&&generation==&*scan->loaded&&scan->loaded->folder==folder.id;CloseHandle(locked);require(selected&&reused,"Folder navigation reloaded resources or lost cross-folder selection");
  brushLibraryPanel_->navigate("missing-folder");require(fillFolder_.empty()&&!scan->pending,"Cached missing folder did not fall back to root");brushLibraryPanel_->navigate(folder.id);selectBrushLibraryItem(second.id,false,false);
 }
 // Stored choices replace a temporary brush without losing the original
 // return profile; failures preserve the temporary selection and its lifetime.
 {const auto root=workspacePresetTestDirectory_;workspacePresetTestDirectory_=dir/"temporary-transition";const auto profile=temporaryBrushReturnProfile_;temporaryBrushReturnProfile_=brushFeedback_.brushProfiles_[0];temporaryBrushReturnProfile_->size=11;temporaryBrushActive_=true;
  const auto previous=pencilImageBrushId_;selectBrushLibraryItem("missing-transition.png",false,false);require(temporaryBrushActive_&&pencilImageBrushId_==previous,"Failed stored choice consumed temporary lifetime");
  fillLibrarySelection_={};selectBrushLibraryItem(second.id,false,false);require(!temporaryBrushActive_&&temporaryBrushReturnProfile_&&temporaryBrushReturnProfile_->size==11,"Stored choice retained temporary flag or lost return profile");loadSessionToolPreferences(false);require(pencilImageBrushId_==second.id&&pencilImageBrush_,"Stored choice after temporary brush was not persisted");temporaryBrushReturnProfile_=profile;workspacePresetTestDirectory_=root;
 }
 // Real preference queue and library resource resolution, no user settings.
 {const auto oldRoot=workspacePresetTestDirectory_;workspacePresetTestDirectory_=dir/"preferences";pencilImageBrushAngle_=37.5;saveBrushPreferences();pencilImageBrushId_.clear();pencilImageBrush_.reset();pencilImageBrushAngle_=0;loadSessionToolPreferences(false);require(pencilImageBrushId_==second.id&&pencilImageBrush_&&pencilImageBrushAngle_==37.5,"Persistent image resource/angle reopen");
  temporaryBrushActive_=true;saveBrushPreferences();temporaryBrushActive_=false;loadSessionToolPreferences(false);require(pencilImageBrushId_.empty()&&!pencilImageBrush_,"Temporary selection brush was persisted");
  pencilImageBrushId_="missing-resource.png";saveBrushPreferences();loadSessionToolPreferences(false);require(pencilImageBrushId_.empty()&&!pencilImageBrush_,"Missing persisted brush did not fall back");
  pencilImageBrushId_=second.id;resolvePencilImageBrush();saveBrushPreferences();loadSessionToolPreferences(false);workspacePresetTestDirectory_=oldRoot;}
 // Esc exits a stored pattern without leaving bucket mode or editing artwork.
 {const auto root=workspacePresetTestDirectory_;workspacePresetTestDirectory_=dir/"escape-preferences";useFillTool();pencilImageBrushId_=second.id;resolvePencilImageBrush();brushFeedback_.brushProfiles_[0].imagePaintMode=PatternPaintMode::Source;requestFocus();ui::KeyMessage esc(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&esc);require(fillTool_&&!pencilImageBrush_&&pencilImageBrushId_.empty()&&fillPattern_.brushes.empty()&&brushFeedback_.brushProfiles_[0].imagePaintMode==PatternPaintMode::Source,"Pattern Esc lost bucket or sampling mode");loadSessionToolPreferences(false);require(pencilImageBrushId_.empty(),"Esc-cleared pattern was restored from preferences");workspacePresetTestDirectory_=root;pencilImageBrushId_=second.id;resolvePencilImageBrush();fillLibrarySelection_.ids={second.id};fillLibrarySelection_.active=second.id;applyFillLibrarySelection();}
 // A corrupt newly selected resource must not replace any live selection data.
 {const auto ids=fillLibrarySelection_.ids;const auto active=pencilImageBrushId_;const auto image=pencilImageBrush_;const auto patterns=fillPattern_.brushes;const auto name=fillImageName_;auto broken=library.save("corrupt-choice",encodePatternBrushPng(stamp));writeExportBytesAtomic(std::filesystem::u8path(broken.filePath),{1,2,3});fillFolder_.clear();selectBrushLibraryItem(broken.id,true,false);require(fillLibrarySelection_.ids==ids&&pencilImageBrushId_==active&&pencilImageBrush_&&pencilImageBrush_->colors==image->colors&&fillPattern_.brushes.size()==patterns.size()&&fillImageName_==name,"Failed choice changed live resource set");fillFolder_=folder.id;}
 // Both resource-producing entrypoints must use the same durable selection.
 {const auto root=workspacePresetTestDirectory_;workspacePresetTestDirectory_=dir/"creation-preferences";
  const auto input=dir/"import-input.png";writeExportBytesAtomic(input,encodePatternBrushPng(stamp));temporaryBrushActive_=true;importBrushLibraryImages({input},{});require(!temporaryBrushActive_,"Stored import retained temporary brush flag");const auto imported=pencilImageBrushId_;require(!imported.empty()&&pencilImageBrush_,"Import failed to activate brush");pencilImageBrushId_.clear();pencilImageBrush_.reset();loadSessionToolPreferences(false);require(pencilImageBrushId_==imported&&pencilImageBrush_&&pencilImageBrush_->colors==stamp.colors,"Imported brush selection not durable");
  const auto partialInput=dir/"partial-input.png";const auto partialStamp=createPatternBrushFromRgba(1,1,{13,29,47,123});writeExportBytesAtomic(partialInput,encodePatternBrushPng(partialStamp));importBrushLibraryImages({input,partialInput,dir/"missing-last.png"},folder.id);require(pencilImageBrush_&&pencilImageBrush_->colors==partialStamp.colors&&fillPattern_.brushes.size()==1&&fillPattern_.brushes[0].coverage==partialStamp.coverage&&fillLibrarySelection_.active==pencilImageBrushId_,"Partial import did not activate last successful CPU resource");const auto partialId=pencilImageBrushId_;auto listing=library.list();const auto saved=std::find_if(listing.brushes.begin(),listing.brushes.end(),[&](const auto& item){return item.id==partialId;});require(saved!=listing.brushes.end()&&saved->folderId==folder.id&&fillImageName_==unicodeText(std::filesystem::u8path(saved->filePath).stem().u8string()),"Imported resource folder/name differs from stored representation");
  const auto oldPixels=pencilImageBrush_->colors;const auto oldSelection=fillLibrarySelection_.ids;importBrushLibraryImages({partialInput},"absent-folder");require(pencilImageBrushId_==partialId&&pencilImageBrush_->colors==oldPixels&&fillLibrarySelection_.ids==oldSelection,"Failed resource move replaced current brush");
  const auto beforeFailed=pencilImageBrushId_;importBrushLibraryImages({dir/"absent-input.png"},{});loadSessionToolPreferences(false);require(pencilImageBrushId_==beforeFailed,"Failed import overwrote durable brush");
  document.previewSelection(SelectionMask{0,0,1,1,{}});const auto beforeEmpty=pencilImageBrushId_;createFillBrushFromSelection();require(pencilImageBrushId_==beforeEmpty&&document.selection(),"Empty capture changed durable brush");document.previewSelection({});
  auto artwork=std::move(document);document=Document(2,1);document.beginStroke({0,0},0xff123456);document.commitStroke();document.previewSelection(SelectionMask{0,0,1,1,{}});const auto captureHistory=document.historySize();temporaryBrushActive_=true;createFillBrushFromSelection();require(!temporaryBrushActive_,"Stored capture retained temporary flag");const auto captured=pencilImageBrushId_;require(!captured.empty()&&captured!=imported&&!document.selection()&&document.historySize()==captureHistory,"Successful capture changed history or failed activation");pencilImageBrushId_.clear();pencilImageBrush_.reset();loadSessionToolPreferences(false);require(pencilImageBrushId_==captured&&pencilImageBrush_&&pencilImageBrush_->colors==std::vector<Pixel>({0xff123456}),"Captured resource selection not durable");document=std::move(artwork);
  workspacePresetTestDirectory_=root;fillLibrarySelection_.ids={second.id};fillLibrarySelection_.active=second.id;applyFillLibrarySelection();}
 // Exercise the actual configurable shortcut route against this test-owned
 // library; native file/explorer windows are intentionally not opened here.
 {const auto bindings=shortcutBindings_;const auto selected=fillLibrarySelection_;const auto brushId=pencilImageBrushId_;const auto brush=pencilImageBrush_;
  const char* commands[]{"importBrushImage","createBrushFolder","openBrushFolder","refreshBrushLibrary","brushLibraryParentFolder","brushSwatchSmall","brushSwatchMedium","brushSwatchLarge","deleteBrushSelection"};
  for(const auto* id:commands)require(menuCommands_.connected(id)&&shortcutSupported(id),"Brush command is configurable and connected");
  auto send=[&](const char* id,int repeat=0){shortcuts::assign(shortcutBindings_,id,"F10");requestFocus();ui::KeyMessage key(ui::kKeyDownMessage,ui::kKeyF10,ui::kKeyNoneModifier,0,repeat);require(routeShortcutMessage(&key)==1,"Actual brush shortcut routed");};
  for(const auto& size:std::vector<std::pair<const char*,int>>{{"brushSwatchLarge",52},{"brushSwatchSmall",30},{"brushSwatchMedium",40}}){send(size.first);require(brushLibraryPanel_->swatchSize()==size.second&&menuCommands_.checked(size.first),"Shortcut updates shared brush swatch size");}send("brushSwatchLarge",1);require(brushLibraryPanel_->swatchSize()==40,"Repeated brush shortcut suppressed");
  send("createBrushFolder");require(pending_==Pending::BrushFolderName,"Create folder shortcut opens existing name form");resolve(false);require(fillFolder_==folder.id,"Folder creation cancel preserves location");send("createBrushFolder");paletteInput_->setText("Shortcuts");resolve(true);require(fillFolder_==folder.id+"/Shortcuts"&&std::filesystem::is_directory(dir/std::filesystem::u8path(fillFolder_)),"Folder shortcut creates nested folder");send("brushLibraryParentFolder");require(fillFolder_==folder.id,"Parent shortcut navigates one level");send("brushLibraryParentFolder");require(fillFolder_.empty(),"Parent shortcut reaches root");send("brushLibraryParentFolder");require(fillFolder_.empty(),"Parent shortcut is inert at root");brushLibraryPanel_->navigate(folder.id);
  brushLibraryNeedsReload_=true;send("refreshBrushLibrary");require(!brushLibraryNeedsReload_&&pencilImageBrushId_==brushId,"Refresh shortcut reloads while retaining active brush");
  const auto removable=library.save("shortcut-delete",encodePatternBrushPng(stamp));const auto moved=library.move(removable.id,folder.id);brushLibraryNeedsReload_=true;syncBrushLibraryPanel(true);selectBrushLibraryItem(removable.id,false,false);
  for(int choice:{0,2}){bool opened=false;ui::Timer close(50,this);close.Tick.connect([&]{close.stop();auto focus=ui::Manager::getDefault()->getFocus();auto popup=focus?dynamic_cast<BrushLibraryDeleteDialog*>(focus->window()):nullptr;if(popup){opened=true;popup->smoke(choice);}});close.start();send("deleteBrushSelection");close.stop();require(opened,"Delete shortcut opens existing confirmation dialog");require(std::filesystem::exists(std::filesystem::u8path(moved.filePath))==(choice==0),"Delete shortcut respects cancel then confirms removal");}
  fillLibrarySelection_=selected;pencilImageBrushId_=brushId;pencilImageBrush_=brush;applyFillLibrarySelection();brushLibraryNeedsReload_=true;syncBrushLibraryPanel(true);
  brushLibraryPanel_->setVisible(false);for(const auto* id:commands){require(!menuCommands_.enabled(id),"Hidden brush panel disables its command");send(id);}require(pending_==Pending::None&&brushLibraryPanel_->swatchSize()==40&&fillFolder_==folder.id,"Hidden brush shortcuts do not open windows or change resources");shortcutBindings_=bindings;refresh();
  require(document.historySize()==history&&document.revision()==revision&&document.pixels()==pixels&&!document.dirty(),"Brush shortcut browsing/local edits preserve document and history");
 }
 brushLibraryPanel_->setSize(40);std::stringstream encoded;docking_.write(encoded);panels::Model restored;require(restored.read(encoded)&&restored.groupOf(12)>=0,"New panel docking persistence");docking_.place(12,panels::Dock::Left);refresh();require(!columnFloating(12)&&brushLibraryPanel_->isVisible(),"Brush library uses shared dock");docking_.place(12,panels::Dock::Floating,-1,true,false,{360,96,220,280});refresh();require(columnFloating(12),"Brush library uses shared floating chrome");
 smokeBrushLibraryDrop();
 menuCommands_.invoke("toggleBrushLibraryPanel");require(!brushLibraryPanelOpen_&&pencilImageBrushId_==second.id,"Hiding library preserves selection");require(document.historySize()==history&&document.revision()==revision&&document.pixels()==pixels&&!document.dirty(),"Resource browsing does not edit document");
 smokeBrushLibraryDelete();
 // Real mouse-down/up must use the selected resource snapshot without IO.
 // This also covers temporary brushes, which have no corresponding PNG ID.
 {
  document=Document(12,12);if(!brushLibraryPanelOpen_)menuCommands_.invoke("toggleBrushLibraryPanel");paletteFocused_=false;runShortcutCommand("tool.pencil");requestFocus();fitCanvas();zoom_=8;
  document.symmetryAxes={};temporaryBrushReturnProfile_.reset();temporaryBrushActive_=false;brushFeedback_.brushProfiles_[0]={1,100,BrushShape::Square};brushFeedback_.brushProfiles_[0].imagePaintMode=PatternPaintMode::Paint;brushDynamics_={};pencilImageBrushAngle_=0;ink_=0xffffffff;
  const bool grid=runtimePreferences_.flag("tools.gridAlignmentEnabled");runtimePreferences_.set("tools.gridAlignmentEnabled","false");refresh();
  auto pointer=[&](ui::MessageType type,int x,int y){ui::MouseMessage event(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,canvasDocumentToDisplay({x+.25,y+.25}));event.setDisplay(display());onProcessMessage(&event);if(type==ui::kMouseDownMessage&&document.strokeActive())enableFlags(ui::HAS_CAPTURE);if(type==ui::kMouseUpMessage)disableFlags(ui::HAS_CAPTURE);};
  auto stroke=[&](int x,int y,Pixel expected){const auto before=document.canvasPixels();const auto h=document.historyPosition();pointer(ui::kMouseDownMessage,x,y);if(!document.strokeActive()||!pencilImageBrush_)throw std::runtime_error("Selected image mouse-down x="+std::to_string(x)+" y="+std::to_string(y)+" image="+std::to_string(bool(pencilImageBrush_))+" active="+std::to_string(document.active())+" selection="+std::to_string(selectionTool_)+" shape="+std::to_string(shapeTool_)+" fill="+std::to_string(fillTool_)+" move="+std::to_string(moveTool_)+" status="+utf8Text(status_));pointer(ui::kMouseUpMessage,x,y);if(document.active()||document.historyPosition()!=h+1||document.canvasPixels()[y*12+x]!=expected)throw std::runtime_error("Image stroke x="+std::to_string(x)+" y="+std::to_string(y)+" actual="+std::to_string(document.canvasPixels()[y*12+x])+" expected="+std::to_string(expected)+" h="+std::to_string(document.historyPosition())+" before="+std::to_string(h)+" active="+std::to_string(document.active()));const auto painted=document.canvasPixels();document.undo();require(document.canvasPixels()==before,"Selected image stroke Undo");document.redo();require(document.canvasPixels()==painted,"Selected image stroke Redo");};
  const auto pixel=createPatternBrushFromRgba(1,1,{21,43,65,255});const auto stored=library.save("stroke-snapshot",encodePatternBrushPng(pixel));syncBrushLibraryPanel(true);selectBrushLibraryItem(stored.id,false,false);require(pencilImageBrush_&&pencilImageBrushId_==stored.id,"Stroke fixture local selection not loaded");
  HANDLE lock=CreateFileW(std::filesystem::u8path(stored.filePath).c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);require(lock!=INVALID_HANDLE_VALUE,"Stroke snapshot PNG lock");
  try{stroke(3,3,0xff412b15);stroke(5,3,0xff412b15);}catch(...){CloseHandle(lock);throw;}CloseHandle(lock);
  ProjectBrushResource project;project.metadata={"stroke-project","Stroke project","brushes/stroke.gray","brushes/stroke.rgba",1,1};project.brush=pixel;document.setImportedProjectBrushes({project});syncBrushLibraryPanel();selectBrushLibraryItem("project:stroke-project",false,false);
  project.brush.colors[0]=0xffabcdef;document.setImportedProjectBrushes({project});syncBrushLibraryPanel();stroke(3,5,0xff412b15); // surviving choice keeps its selected pixels, as legacy does
  fillLibrarySelection_={};selectBrushLibraryItem("project:stroke-project",false,false);stroke(5,5,0xffabcdef);document.setImportedProjectBrushes({});syncBrushLibraryPanel();require(!pencilImageBrush_&&fillLibrarySelection_.ids.empty(),"Deleted project snapshot remained selected");
  beginTemporaryBrushCapture();finishTemporaryBrushCapture(SelectionMask{3,3,1,1,{}});require(temporaryBrushActive_&&pencilImageBrush_,"Temporary stroke capture failed");stroke(7,7,0xff412b15);require(temporaryBrushActive_&&pencilImageBrushId_=="temporary-capture","Temporary snapshot became a disk resource");
  pointer(ui::kMouseDownMessage,8,8);ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);require(!document.active()&&document.canvasPixels()[8*12+8]==0,"Temporary image stroke Escape did not restore pixels");disableFlags(ui::HAS_CAPTURE);exitTemporaryBrushCapture();runtimePreferences_.set("tools.gridAlignmentEnabled",grid?"true":"false");
 }
 brushLibraryTestDirectory_.reset();fillFolder_.clear();fillLibrarySelection_={};fillPattern_.brushes.clear();pencilImageBrushId_.clear();pencilImageBrush_.reset();brushLibraryNeedsReload_=true;document=Document();refresh();
}

bool Editor::handleBrushLibraryDrop(os::DragEvent& event,bool drop){
 if(!brushLibraryPanel_)return false;const auto point=event.position();const auto frame=toDisplay(columnFrame(12));const auto floating=topFloatingColumnAt(point);
 const bool inside=brushLibraryPanelOpen_&&columnShown(12)&&documentOpen_&&!homeOpen_&&frame.contains(point)&&(floating<0||docking_.groupOf(floating)==docking_.groupOf(12));
 if(!inside){brushLibraryPanel_->setExternalDrop(false);return false;}auto data=event.dataProvider();if(!data||!data->contains(os::DragDataItemType::Paths)){brushLibraryPanel_->setExternalDrop(false);return false;}
 if(pending_!=Pending::None||document.active()||!event.sourceSupports(os::DropOperation::Copy)){brushLibraryPanel_->setExternalDrop(false);event.dropResult(os::DropOperation::None);return true;}
 brushLibraryPanel_->setExternalDrop(!drop);event.dropResult(os::DropOperation::Copy);if(!drop)return true;brushLibraryPanel_->cancelPending();event.acceptDrop(true);
 // Paths have already passed legacy document-drop normalization and the
 // shared one-second filter before the resource destination is chosen.
 try{std::vector<std::filesystem::path> paths;for(const auto& value:data->getPaths())paths.push_back(std::filesystem::u8path(value));importBrushLibraryImages(paths,{});}catch(const std::exception& e){status_=U"图案拖入失败："+unicodeText(e.what());refresh();}
 return true;
}
void Editor::smokeBrushLibraryDrop(){
 auto require=[](bool ok,const char* why){if(!ok)throw std::runtime_error(why);};const auto previous=fillLibrarySelection_;const auto previousId=pencilImageBrushId_;const auto previousBrush=pencilImageBrush_;
 const auto dir=fillBrushLibraryDirectory();PatternBrushLibrary library(dir);const auto before=library.list().brushes.size();const auto stamp=createPatternBrushFromRgba(2,1,{255,0,0,255,0,0,255,128});const auto token=std::to_string(std::chrono::high_resolution_clock::now().time_since_epoch().count());const auto good=dir.parent_path()/("drop-input-"+token+".png"),bad=dir.parent_path()/("drop-bad-"+token+".png");writeExportBytesAtomic(good,encodePatternBrushPng(stamp));writeExportBytesAtomic(bad,{1,2,3});
 class Paths final:public os::DragDataProvider{base::paths paths_;public:explicit Paths(base::paths paths):paths_(std::move(paths)){}base::paths getPaths()override{return paths_;}os::SurfaceRef getImage()override{return {};}std::string getUrl()override{return {};}bool contains(os::DragDataItemType type)override{return type==os::DragDataItemType::Paths;}};
 auto event=[&](gfx::Point point,base::paths paths){return os::DragEvent(display()->nativeWindow(),os::DropOperation::Copy,point,std::make_unique<Paths>(std::move(paths)));};const auto point=brushLibraryPanel_->resourceBounds().center();auto native=display()->nativeWindow();require(native->hasDragTarget(),"Brush native OLE target");
 const auto identity=document.identity();const auto history=document.historySize();const auto revision=document.revision();const auto pixels=document.pixels();auto hover=event(point,{good.u8string()});native->notifyDragEnter(hover);require(brushLibraryPanel_->externalDrop(),"Brush external hover");native->notifyDragLeave(hover);require(!brushLibraryPanel_->externalDrop()&&library.list().brushes.size()==before,"Brush leave cancels hover only");auto outside=event({-1,-1},{good.u8string()});require(!handleBrushLibraryDrop(outside),"Brush drop outside unclaimed");
 auto partial=event(point,{good.u8string(),good.u8string(),bad.u8string()});native->notifyDragEnter(partial);native->notifyDrop(partial);const auto afterPartial=library.list().brushes.size();if(!partial.acceptDrop()||brushLibraryPanel_->externalDrop()||afterPartial!=before+1)throw std::runtime_error("Brush partial/drop dedupe: accepted="+std::to_string(partial.acceptDrop())+" hover="+std::to_string(brushLibraryPanel_->externalDrop())+" before="+std::to_string(before)+" after="+std::to_string(afterPartial)+" status="+utf8Text(status_));const auto selected=fillLibrarySelection_.active;require(!selected.empty()&&pencilImageBrushId_==selected&&pencilImageBrush_,"Brush drop selects successful resource");auto listing=library.list();auto stored=std::find_if(listing.brushes.begin(),listing.brushes.end(),[&](const auto& b){return b.id==selected;});require(stored!=listing.brushes.end()&&stored->folderId.empty(),"Brush drop stores at legacy root");require(importPatternBrush(std::filesystem::u8path(stored->filePath)).brush.colors==stamp.colors,"Brush dropped durable pixels");
 auto duplicate=event(point,{good.u8string()});native->notifyDragEnter(duplicate);native->notifyDrop(duplicate);require(library.list().brushes.size()==before+1,"Brush duplicate native delivery suppressed");auto unsupported=event(point,{(dir.parent_path()/"unsupported.moonsprite").u8string()});native->notifyDragEnter(unsupported);native->notifyDrop(unsupported);require(unsupported.acceptDrop()&&fillLibrarySelection_.active==selected&&library.list().brushes.size()==before+1,"Brush unsupported document claimed without opening");
 auto uri=event(point,{std::string("  ")+char(34)+"file:///"+good.generic_u8string()+char(34)+"  "});native->notifyDragEnter(uri);native->notifyDrop(uri);require(uri.acceptDrop()&&fillLibrarySelection_.active==selected&&library.list().brushes.size()==before+1,"Brush file URI duplicate is normalized before resource routing");
 const auto uriPath=dir.parent_path()/("uri drop-"+token+".png");const auto uriStamp=createPatternBrushFromRgba(1,1,{23,45,67,255});writeExportBytesAtomic(uriPath,encodePatternBrushPng(uriStamp));std::string uriName="file:///"+uriPath.generic_u8string();for(std::size_t pos=0;(pos=uriName.find(' ',pos))!=std::string::npos;pos+=3)uriName.replace(pos,1,"%20");auto freshUri=event(point,{"  "+std::string(1,char(34))+uriName+char(34)+"  "});native->notifyDragEnter(freshUri);native->notifyDrop(freshUri);require(freshUri.acceptDrop()&&library.list().brushes.size()==before+2&&fillLibrarySelection_.active!=selected&&pencilImageBrush_&&pencilImageBrush_->colors==uriStamp.colors,"Fresh file URI imports a reusable brush through normalized native route");
 require(document.identity()==identity&&document.historySize()==history&&document.revision()==revision&&document.pixels()==pixels,"Brush external import does not edit document");fillLibrarySelection_=previous;pencilImageBrushId_=previousId;pencilImageBrush_=previousBrush;applyFillLibrarySelection();brushLibraryNeedsReload_=true;syncBrushLibraryPanel(true);
}

void Editor::showBrushLibraryAdd(){
 if(pending_!=Pending::None||document.active())return;PixelMenu menu(skin_);auto add=[&](std::u32string label,const char* icon,std::function<void()> action){auto row=new PixelMenuItem(font_,skin_,std::move(label));row->iconSkin=&toolIcons_;row->icon=icon;row->Click.connect(std::move(action));menu.addChild(row);return row;};add(U"从选区创建笔刷","selectionOutline",[this]{createFillBrushFromSelection();});add(U"导入图像…","image",[this]{importFillImage();});add(U"新建文件夹…","newFolder",[this]{editFillFolder(false);});const auto at=brushLibraryActions_[0]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();
}
void Editor::smokeBrushLibraryDelete(){
 auto require=[](bool ok,const char* why){if(!ok)throw std::runtime_error(why);};fillFolder_.clear();PatternBrushLibrary library(fillBrushLibraryDirectory());const auto stamp=createPatternBrushFromRgba(2,1,{255,0,0,255,0,0,255,128});const auto first=library.save("delete-first",encodePatternBrushPng(stamp)),blocked=library.save("delete-blocked",encodePatternBrushPng(stamp));ProjectBrushResource resource;resource.metadata={"delete-project","Project brush","brushes/delete-project.gray","brushes/delete-project.rgba",2,1};resource.brush=stamp;document.setImportedProjectBrushes({resource});document.markSaved();const auto history=document.historySize();const auto revision=document.revision();const auto pixels=document.pixels();requestBrushMenuScan(this);syncBrushLibraryPanel(true);fillLibrarySelection_.ids={"project:delete-project",blocked.id,first.id};fillLibrarySelection_.active=fillLibrarySelection_.anchor="project:delete-project";applyFillLibrarySelection();require(brushLibraryActions_[0]->isEnabled()&&brushLibraryActions_[1]->isEnabled(),"Brush add and delete toolbar availability");
 for(int choice:{1,2,4}){confirmFillLibraryDelete(choice);require(std::filesystem::exists(std::filesystem::u8path(first.filePath))&&std::filesystem::exists(std::filesystem::u8path(blocked.filePath))&&document.projectBrushes().size()==1&&document.revision()==revision&&fillLibrarySelection_.ids.size()==3,("Brush delete cancel state choice="+std::to_string(choice)+" selected="+std::to_string(fillLibrarySelection_.ids.size())+" projects="+std::to_string(document.projectBrushes().size())+" revision="+std::to_string(document.revision())+" before="+std::to_string(revision)).c_str());}
 HANDLE locked=CreateFileW(std::filesystem::u8path(blocked.filePath).c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);require(locked!=INVALID_HANDLE_VALUE,"Brush deletion failure fixture lock");try{confirmFillLibraryDelete(3);}catch(...){CloseHandle(locked);throw;}CloseHandle(locked);require(!std::filesystem::exists(std::filesystem::u8path(first.filePath))&&std::filesystem::exists(std::filesystem::u8path(blocked.filePath))&&document.projectBrushes().size()==1&&fillLibrarySelection_.ids==std::vector<std::string>({"project:delete-project",blocked.id})&&status_.find(U"删除图案失败")!=std::u32string::npos,"Brush partial delete stops in display order and retains failed/later resources");
 confirmFillLibraryDelete(3);require(!std::filesystem::exists(std::filesystem::u8path(blocked.filePath))&&document.projectBrushes().empty()&&fillLibrarySelection_.ids.empty()&&pencilImageBrushId_.empty()&&!pencilImageBrush_&&fillPattern_.brushes.empty(),"Brush mixed local/project deletion clears active brush");const auto reopened=PatternBrushLibrary(fillBrushLibraryDirectory()).list();require(std::none_of(reopened.brushes.begin(),reopened.brushes.end(),[&](const auto& item){return item.id==first.id||item.id==blocked.id;}),"Brush delete local persistence");require(project::readProjectManifest(project::encodeEditableProject(document).bytes).customBrushes.empty(),"Brush delete project persistence");require(document.pixels()==pixels&&document.historySize()==history&&document.dirty(),"Brush resource deletion leaves canvas/history unchanged and marks project dirty");refresh();
}

}
