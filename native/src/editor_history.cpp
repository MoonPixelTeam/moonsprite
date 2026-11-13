#include "editor.h"
#include "pixel_text_area.h"
#include "dialog_background.h"
#include "ui_frame_capture.h"
#include "history_display_dialog.h"
#include <iomanip>
#include <sstream>
namespace moon::editor {
void Editor::createHistoryPanel(){
 auto list=new DialogBackground<HistoryList>(font_,skin_);configureDialogBackground(list);historyList_=list;addChild(list);historyList_->setVisible(false);historyList_->selected=[this](std::size_t target){requestHistoryPosition(target);};historyList_->scrolled=[this](int value){if(historyShownDocument_)historyScrollByDocument_[historyShownDocument_]=value;};
 historySettings_=new PixelButton(font_,skin_,U"",[this]{showHistoryDisplaySettings();});historySettings_->iconSkin=&toolIcons_;historySettings_->icon="properties";historySettings_->columnHeaderAction=true;addChild(historySettings_);historySettings_->setVisible(false);
 historyJumpTimer_.Tick.connect([this]{applyDeferredHistoryPosition();});
 if(!smoke_)try{const auto file=palettePreferencePath().parent_path()/"history-display-v1.txt";if(std::filesystem::exists(file)){if(std::filesystem::file_size(file)>1024*1024)throw std::runtime_error("History settings too large");std::ifstream input(file);std::string version;if(!(input>>version)||version!="moonsprite-history-display-v1")throw std::runtime_error("Invalid history display settings");std::string value;while(input>>std::quoted(value)){if(hiddenHistoryTypes_.size()>=10000)throw std::runtime_error("Too many hidden history types");hiddenHistoryTypes_.push_back(unicodeText(value));}if(!input.eof())throw std::runtime_error("Invalid history display setting entry");}const auto visibleFile=palettePreferencePath().parent_path()/"history-panel-v1.txt";if(std::filesystem::exists(visibleFile)){std::ifstream in(visibleFile);std::string tag;int value=-1;if(!(in>>tag>>value)||tag!="history-panel-v1"||(value!=0&&value!=1))throw std::runtime_error("Invalid history panel visibility");historyPanelOpen_=value!=0;}}catch(const std::exception& e){historyDisplayReadable_=false;status_=U"历史偏好读取失败："+unicodeText(e.what());}
 if(historyPanelOpen_){initializeDocking();docking_.custom=true;}
 menuCommands_.bind("panelHistory",{[this]{toggleHistoryPanel();},[this]{return pending_==Pending::None;},[this]{return historyPanelOpen_;}});
}
void Editor::toggleHistoryPanel(){initializeDocking();docking_.custom=true;historyPanelOpen_=!historyPanelOpen_;if(historyPanelOpen_)docking_.select(8);else requestFocus();refresh();saveWorkspaceSizes();if(!smoke_&&historyDisplayReadable_)try{const std::string text=std::string("history-panel-v1 ")+(historyPanelOpen_?"1\n":"0\n");writeExportBytesAtomic(palettePreferencePath().parent_path()/"history-panel-v1.txt",std::vector<std::uint8_t>(text.begin(),text.end()));}catch(const std::exception& e){status_=U"历史面板偏好保存失败："+unicodeText(e.what());}}
bool Editor::historyGestureBusy()const{return currentDocument().active(false)||currentDocument().strokeActive()||hasCapture()||selectionDragging_||floatingDragging_||shapeDragging_||gradientDragging_||fillDragging_||navigation_.zoomDragging_;}
workspace::HistoryContext Editor::historyCommandContext(workspace::HistoryAction action)const{
 const bool local=action!=workspace::HistoryAction::Jump&&(gradientPending_||polygonPending_||(shapeDragging_&&(currentTools().shapeKind==ShapeKind::Polygon||currentTools().shapeKind==ShapeKind::Freeform)));
 return {documentOpen_?currentDocument().identity():0,pending_!=Pending::None,historyGestureBusy()&&!local};
}
bool Editor::historyActionAvailable(workspace::HistoryAction action)const{
 if(!documentOpen_||pending_!=Pending::None)return false;
 if(gradientPending_||polygonPending_||historyGestureBusy()||(action==workspace::HistoryAction::Undo&&currentDocument().floating()))return true;
 return action==workspace::HistoryAction::Jump||(action==workspace::HistoryAction::Undo?currentDocument().canUndo():currentDocument().canRedo());
}
workspace::HistoryCommandResult Editor::requestHistoryAction(workspace::HistoryAction action,std::size_t position,std::function<bool()> permitted){
 auto result=historyCommands_.submit({documentOpen_?currentDocument().identity():0,action,position,std::move(permitted)},historyCommandContext(action),[this](const auto& request){applyHistoryAction(request);});
 if(historyCommands_.pending())historyJumpTimer_.start();else historyJumpTimer_.stop();
 if(result.error)std::rethrow_exception(result.error);
 return result;
}
void Editor::applyHistoryAction(const workspace::HistoryRequest& request){
 if(!documentOpen_||request.document!=currentDocument().identity())return;
 const auto action=request.action==workspace::HistoryAction::Jump?(request.position<currentDocument().historyPosition()?workspace::HistoryAction::Undo:workspace::HistoryAction::Redo):request.action;
 // Legacy workspace undo/redo consume pending gradient and polygon history
 // before ordinary document history. Keyboard text fields keep local routing.
 if(gradientPending_){if(action==workspace::HistoryAction::Undo)cancelGradientGesture();else{status_=U"请先应用或取消渐变";refresh();}return;}
 if(shapeDragging_&&(currentTools().shapeKind==ShapeKind::Polygon||currentTools().shapeKind==ShapeKind::Freeform)){polygonShapeStep(action==workspace::HistoryAction::Redo);return;}
 if(polygonPending_){polygonStep(action==workspace::HistoryAction::Redo);return;}
 if(request.action==workspace::HistoryAction::Jump&&request.position==currentDocument().historyPosition())return;
 if(action==workspace::HistoryAction::Undo&&!currentDocument().canUndo()&&!currentDocument().floating())return;
 if(action==workspace::HistoryAction::Redo&&!currentDocument().canRedo())return;
 cancelStroke();
 currentPlayback().loop={};
 if(request.action==workspace::HistoryAction::Jump)currentDocument().setHistoryPosition(request.position);
 else if(action==workspace::HistoryAction::Undo)currentDocument().undo();else currentDocument().redo();
 refresh();
}
void Editor::requestHistoryPosition(std::size_t target){requestHistoryAction(workspace::HistoryAction::Jump,target);}
void Editor::applyDeferredHistoryPosition(){
 const auto next=historyCommands_.next();
 if(!next){historyJumpTimer_.stop();return;}
 const auto result=historyCommands_.poll(historyCommandContext(next->action),[this](const auto& request){applyHistoryAction(request);});
 if(!historyCommands_.pending())historyJumpTimer_.stop();
 if(result.error)std::rethrow_exception(result.error);
}
void Editor::syncHistoryPanel(){
 if(!historyList_)return;const auto identity=documentOpen_?currentDocument().identity():0;const bool changedDocument=identity!=historyShownDocument_;const auto revision=currentDocument().historyRevision();if(!changedDocument&&revision==historyShownRevision_&&historyShownDisplayRevision_==historyDisplayRevision_)return;
 if(changedDocument&&historyShownDocument_)historyScrollByDocument_[historyShownDocument_]=historyList_->scroll();const bool restore=changedDocument&&historyScrollByDocument_.count(identity);const auto timeline=currentDocument().historyTimeline();std::vector<HistoryListRow> rows;if(documentOpen_)for(const auto& entry:historyVisibleEntries(timeline,hiddenHistoryTypes_))rows.push_back({entry.position,entry.label,entry.position==timeline.position,entry.position>timeline.position,false});historyShownDocument_=identity;historyShownRevision_=revision;historyShownDisplayRevision_=historyDisplayRevision_;historyList_->setRows(std::move(rows),!restore);if(restore)historyList_->setScroll(historyScrollByDocument_[identity]);if(dockingTabs_[8]){dockingTabs_[8]->caption=U"历史记录（"+unicodeText(std::to_string(timeline.position)+"/"+std::to_string(timeline.entries.size()))+U"）";dockingTabs_[8]->invalidate();}
}
void Editor::layoutHistoryPanel(){if(!historyList_)return;const bool show=columnShown(8)&&documentOpen_&&!homeOpen_;historyList_->setVisible(show);historySettings_->setVisible(show);if(!show)return;const auto chrome=columnChrome(8);historyList_->setBounds(toDisplay(chrome.content));if(!columnFloating(8))historySettings_->setBounds(toDisplay({chrome.actions.x,chrome.actions.y,15,15}));}
std::u32string Editor::saveHistoryDisplaySettings(){++historyDisplayRevision_;syncHistoryPanel();layoutPanelTabs();if(smoke_)return {};if(!historyDisplayReadable_)return U"原历史偏好读取失败，未覆盖文件";try{std::filesystem::create_directories(palettePreferencePath().parent_path());std::ostringstream out;out<<"moonsprite-history-display-v1\n";for(const auto& id:hiddenHistoryTypes_)out<<std::quoted(utf8Text(id))<<'\n';const auto text=out.str();writeExportBytesAtomic(palettePreferencePath().parent_path()/"history-display-v1.txt",std::vector<std::uint8_t>(text.begin(),text.end()));return {};}catch(const std::exception& e){return U"保存失败："+unicodeText(e.what());}}
void Editor::showHistoryDisplaySettings(bool verify){
 if(pending_!=Pending::None)return;std::vector<std::u32string> labels;for(const auto& row:currentDocument().historyTimeline().entries)labels.push_back(row.label);HistoryDisplayDialog popup(font_,skin_,toolIcons_,historyDisplayOptions(labels,hiddenHistoryTypes_),hiddenHistoryTypes_,[this]{return saveHistoryDisplaySettings();});popup.setDisplay(display(),false);const auto r=uiLogical(bounds());popup.setBounds(toDisplay({r.x+std::max(0,(r.w-320)/2),r.y+std::max(0,(r.h-350)/2),320,350}));ui::Timer timer(120,&popup);std::exception_ptr failure;
 if(verify){timer.Tick.connect([&]{timer.stop();try{const auto before=hiddenHistoryTypes_;popup.smokeFilter("连续填充");if(popup.listView().rows().empty())throw std::runtime_error("History settings search");popup.smokeHideAll();if(hiddenHistoryTypes_.empty())throw std::runtime_error("History hide all");popup.smokeShowAll();if(!hiddenHistoryTypes_.empty())throw std::runtime_error("History show all");hiddenHistoryTypes_=before;saveHistoryDisplaySettings();popup.smokeFilter("");writeSmokeFrame(popup.display()->nativeSurface().get(),assets_.parent_path()/"history-settings-smoke.bmp");}catch(...){failure=std::current_exception();}popup.closeWindow(nullptr);});timer.start();}popup.openWindowInForeground();timer.stop();if(failure)std::rethrow_exception(failure);refresh();
}
std::u32string Editor::historyAdjustmentLabel()const{switch(adjustmentSpec_.kind){case ColorAdjustmentKind::Invert:return U"反相";case ColorAdjustmentKind::HueSaturation:return adjustmentSpec_.colorize?U"着色":U"色相/饱和度";case ColorAdjustmentKind::ColorBalance:return U"色彩平衡";case ColorAdjustmentKind::Curves:return U"曲线";case ColorAdjustmentKind::GradientMap:return U"渐变映射";default:return U"亮度/对比度";}}
void Editor::smokeHistoryPanel(){
 auto check=[](bool value,const char* why){if(!value)throw std::runtime_error(why);};smoke_=true;documentOpen_=true;homeOpen_=false;pending_=Pending::None;
 // Same edited-cel fixture as legacy workspace-history-playback.test.ts.
 replaceDocumentForSmoke(Document(2,2));const auto originalLayer=currentDocument().layer().id;currentDocument().addLayer();const auto editedLayer=currentDocument().layer().id;const auto editedFrame=currentDocument().frame().id;currentDocument().addFrame();const auto laterFrame=currentDocument().frame().id;currentDocument().selectFrame(editedFrame);currentDocument().beginStroke({0,0},0xff0000ff);currentDocument().commitStroke();const auto drawPosition=currentDocument().historyPosition();currentDocument().selectFrame(laterFrame);currentDocument().selectLayer(originalLayer);currentPlayback().playing=true;
 requestHistoryAction(workspace::HistoryAction::Undo);
 check(!currentPlayback().playing&&currentDocument().historyPosition()+1==drawPosition&&currentDocument().layer().id==editedLayer&&currentDocument().frame().id==editedFrame&&!currentDocument().pixels()[0],"History undo during playback did not return to edited cel");
 requestHistoryAction(workspace::HistoryAction::Redo);check(currentDocument().pixels()[0]==0xff0000ff,"History redo lost edited cel pixels");
 const auto pixels=currentDocument().pixels();const auto position=currentDocument().historyPosition();
 // Undo cancels a floating clipboard before ordinary history.
 SelectionClipboard clipboard;clipboard.width=clipboard.height=1;clipboard.pixels={0xff654321};check(currentDocument().beginFloatingPaste(clipboard,1,1),"History floating fixture");
 requestHistoryAction(workspace::HistoryAction::Undo);check(!currentDocument().floating()&&currentDocument().historyPosition()==position&&currentDocument().pixels()==pixels,"History floating undo changed prior content/history");
 // Pending gradients consume local history without losing a committed edit.
 check(currentDocument().beginGradient({0,0}),"History gradient fixture");gradientPending_=true;
 requestHistoryAction(workspace::HistoryAction::Redo);check(gradientPending_&&currentDocument().gradientActive()&&currentDocument().historyPosition()==position,"History redo discarded pending gradient");
 requestHistoryAction(workspace::HistoryAction::Undo);check(!gradientPending_&&!currentDocument().gradientActive()&&currentDocument().pixels()==pixels&&currentDocument().historyPosition()==position,"History undo failed to cancel gradient locally");
 // Polygon lasso and both shape families retain their own point history.
 polygonPending_=true;selectionPath_={{0,0},{1,0},{1,1}};selectionPathRedo_.clear();requestHistoryAction(workspace::HistoryAction::Undo);check(selectionPath_.size()==2&&selectionPathRedo_.size()==1,"History polygon lasso undo");requestHistoryAction(workspace::HistoryAction::Redo);check(selectionPath_.size()==3&&selectionPathRedo_.empty()&&currentDocument().historyPosition()==position,"History polygon lasso redo entered document history");polygonPending_=false;selectionPath_.clear();selectionPreview_.reset();
 for(const auto kind:{ShapeKind::Polygon,ShapeKind::Freeform}){
  check(currentDocument().beginShapePreview(Point{0,0}),"History shape fixture");currentTools().shapeKind=kind;shapeSpec_.polygonPath={{0,0},{1,0},{1,1}};polygonShapeRedo_.clear();shapePointer_={1,1};shapeIdentity_=currentDocument().identity();shapeColor_=0xff123456;shapeDragging_=true;
  requestHistoryAction(workspace::HistoryAction::Undo);check(shapeSpec_.polygonPath.size()==2&&polygonShapeRedo_.size()==1,"History shape local undo");requestHistoryAction(workspace::HistoryAction::Redo);check(shapeSpec_.polygonPath.size()==3&&polygonShapeRedo_.empty()&&currentDocument().historyPosition()==position,"History shape redo entered document history");currentDocument().cancelShapePreview();cancelStroke();
 }
 shapeSpec_={};currentTools().shapeKind=ShapeKind::Rectangle;
 // Entry and text-area routing return control to the widget's local history.
 const auto bindings=shortcutBindings_;shortcutBindings_.clear();shortcuts::assign(shortcutBindings_,"undo","F8");
 {auto entry=std::make_unique<PixelEntry>(font_,skin_);addChild(entry.get());entry->setBounds(toDisplay({20,100,100,textControlHeight}));entry->requestFocus();ui::KeyMessage key(ui::kKeyDownMessage,ui::kKeyF8,ui::kKeyNoneModifier,0,0);check(routeShortcutMessage(&key)==2&&currentDocument().historyPosition()==position,"Text entry undo escaped into document history");}
 {auto area=std::make_unique<PixelTextArea>(font_,skin_);addChild(area.get());area->setBounds(toDisplay({20,100,100,40}));area->requestFocus();ui::KeyMessage key(ui::kKeyDownMessage,ui::kKeyF8,ui::kKeyNoneModifier,0,0);check(routeShortcutMessage(&key)==2&&currentDocument().historyPosition()==position,"Text area undo escaped into document history");}
 requestFocus();homeOpen_=true;runShortcutCommand("undo");check(currentDocument().historyPosition()==position,"Home keyboard adapter executed document undo");homeOpen_=false;
 // An explicitly cleared binding suppresses its old default. Reassign the
 // ordinary chords before verifying the real keyboard/application path.
 shortcutBindings_["undo"].clear();shortcutBindings_["redo"].clear();paletteFocused_=false;currentPlayback().playing=true;
 ui::KeyMessage fallbackUndo(ui::kKeyDownMessage,ui::kKeyZ,ui::kKeyCtrlModifier,0,0),fallbackRedo(ui::kKeyDownMessage,ui::kKeyY,ui::kKeyCtrlModifier,0,0);
 onProcessMessage(&fallbackUndo);check(currentPlayback().playing&&currentDocument().historyPosition()==position,"Cleared undo binding executed its old default");
 shortcuts::assign(shortcutBindings_,"undo","Ctrl+Z");shortcuts::assign(shortcutBindings_,"redo","Ctrl+Y");
 onProcessMessage(&fallbackUndo);check(!currentPlayback().playing&&currentDocument().historyPosition()+1==position,"Keyboard fallback bypassed common undo");
 onProcessMessage(&fallbackRedo);check(currentDocument().historyPosition()==position,"Keyboard fallback bypassed common redo");
 shortcutBindings_=bindings;
 replaceDocumentForSmoke(Document(4,4));currentPlayback().playing=true;requestHistoryAction(workspace::HistoryAction::Undo);requestHistoryAction(workspace::HistoryAction::Redo);check(currentPlayback().playing&&currentDocument().historyPosition()==0,"Unavailable history changed playback");currentPlayback().playing=false;hiddenHistoryTypes_.clear();historyPanelOpen_=true;initializeDocking();docking_.custom=true;docking_.select(8);currentDocument().addLayer();currentDocument().addFrame();currentDocument().addLayer();refresh();check(menuCommands_.connected("panelHistory"),"History actual menu binding");check(historyList_->isVisible()&&historyList_->rows().size()==4,"History start plus actual native transactions");check(historyList_->rows().front().position==0,"History visible start row");historyList_->choosePosition(1);check(currentDocument().historyPosition()==1&&currentDocument().canRedo(),"History row jumps through undo");refresh();check(historyList_->rows().back().future,"History future row muted");historyList_->choosePosition(3);check(currentDocument().historyPosition()==3,"History row jumps through redo");const auto count=currentDocument().historyTimeline().entries.size();hiddenHistoryTypes_.push_back(historyDisplayType(U"新建图层"));saveHistoryDisplaySettings();check(currentDocument().historyTimeline().entries.size()==count&&historyList_->rows().size()==2,"History filtering retains true positions");historyList_->choosePosition(2);check(currentDocument().historyPosition()==2,"Hidden history entries preserve jump position");hiddenHistoryTypes_.clear();saveHistoryDisplaySettings();showHistoryDisplaySettings(true);menuCommands_.invoke("panelHistory");check(!historyPanelOpen_,"History menu hide");menuCommands_.invoke("panelHistory");check(historyPanelOpen_,"History menu restore");refresh();
 const auto work=refreshWorkCounts_;const auto durable=panelStateRequests_;const auto full=panelFullRefreshes_;
 for(int i=0;i<20;++i)refresh(RefreshScope::Canvas);
 check(refreshWorkCounts_==work&&panelStateRequests_==durable&&panelFullRefreshes_==full,"Canvas refresh performed unrelated panel/IO work");
 refresh(RefreshScope::Commands);check(refreshWorkCounts_[0]==work[0]&&refreshWorkCounts_[1]==work[1]&&refreshWorkCounts_[5]==work[5]&&panelStateRequests_==durable,"Command validation launched unrelated panel/IO work");
 antsTimer_.stop();
 auto frame=[&]{
  manager()->flushRedraw();manager()->dispatchMessages();manager()->dispatchMessages();display()->dirtyRect(display()->bounds());display()->flipDisplay();
  auto surface=display()->nativeSurface();std::vector<gfx::Color> pixels;pixels.reserve(std::size_t(surface->width())*surface->height());os::SurfaceLock lock(surface.get());
  for(int y=0;y<surface->height();++y)for(int x=0;x<surface->width();++x)pixels.push_back(surface->getPixel(x,y));return pixels;
 };
 manager()->invalidate();const auto baseline=frame();
 check(std::any_of(baseline.begin(),baseline.end(),[&](auto pixel){return pixel!=baseline.front();}),"Refresh captured an unpainted framebuffer");
 currentView().canvas.offset(2,0);refresh(RefreshScope::Canvas);const auto partial=frame();
 check(partial!=baseline,"Canvas-only damage did not present the moved canvas");
 refresh();manager()->invalidate();const auto complete=frame();
 check(partial==complete,"Partial/full refresh rendered different pixels");
 writeSmokeFrame(display()->nativeSurface().get(),assets_.parent_path()/"history-panel-smoke.bmp");
}
}
