#include "editor.h"
#include "image_resize_task.h"
#include "ui_frame_capture.h"
#include "quick_command_metadata.h"
#include "quick_command_tooltip.h"
#include "quick_command_composite.h"
#include "quick_command_drag_handle.h"
#include <winrt/base.h>
namespace moon::editor {
namespace {
const quick::Metadata* metadata(const std::string& id){for(auto& m:quick::metadata)if(id==m.id)return &m;return nullptr;}
std::string utf8(const std::u16string& value){return winrt::to_string(winrt::hstring(reinterpret_cast<const wchar_t*>(value.data()),std::uint32_t(value.size())));}
std::u16string utf16(const std::string& value){auto s=winrt::to_hstring(value);return {reinterpret_cast<const char16_t*>(s.data()),s.size()};}
}
void Editor::initializeQuickCommands(){
 auto it=runtimePreferences_.values.find("quickCommands.bars.json");if(it!=runtimePreferences_.values.end())quickBarsConfig_=quick::parseBars(it->second);
 quickBarsDraft_=quickBarsConfig_;
 for(unsigned i=0;i<4;++i)quickPreferenceCollapsed_[i]=quickBarsDraft_[i].edge==quick::Edge::None;
 for(auto& m:quick::metadata)for(auto suffix:{"","-disabled"}){const auto name=std::string(m.icon)+suffix;if(!toolIcons_.assets.patches.count(name))toolIcons_.assets.patches[name]=importSkinPng(assets_/"utility-icons"/(name+".png"),32);}
 for(unsigned i=0;i<4;++i){auto b=new QuickCommandBar(font_,skin_,toolIcons_);addChild(b);quickBars_[i]=b;
  b->setProperty(std::make_shared<quick::Composite>([this](ui::Widget& widget,ui::PaintEvent& event,const quick::Composite::Paint& paint){compositeControl(widget,event,paint);}));
  b->setProperty(std::make_shared<quick::ShortcutTooltip>([this](const std::string& id){return quick::primaryShortcut(shortcutBindings_,id);}));
  b->changed=[this,i](const quick::Bar& bar){quickBarsConfig_[i]=bar;saveQuickCommands();syncQuickCommands();};
  b->enabled=[this](const std::string& id){return quickCommandEnabled(id);};b->checked=[this](const std::string& id){auto m=metadata(id);if(id=="selectionOutline")return bool(currentDocument().selection())&&currentView().showSelectionOutline;return m&&menuCommands_.checked(m->command);};
  b->execute=[this](const std::string& id,bool right){runQuickCommand(id,right);};b->settings=[this]{preferenceSection_=1;showPreferences();};
 }
}
void Editor::saveQuickCommands(){try{if(!runtimePreferencesReadable_)throw std::runtime_error("原首选项读取失败，未覆盖");auto next=runtimePreferences_;next.values["quickCommands.bars.json"]=quick::encodeBars(quickBarsConfig_);if(!smoke_){auto text=next.encode();auto path=palettePreferencePath().parent_path()/"editor-preferences.txt";std::filesystem::create_directories(path.parent_path());writeExportBytesAtomic(path,{text.begin(),text.end()});}runtimePreferences_=std::move(next);}catch(const std::exception& e){status_=U"快捷指令栏保存失败："+unicodeText(e.what());}}
void Editor::syncQuickCommands(){
 for(unsigned i=0;i<4;++i)if(auto b=quickBars_[i]){const bool show=documentOpen_&&!homeOpen_&&runtimePreferences_.flag("quickCommands.quickCommandBarEnabled")&&quickBarsConfig_[i].edge!=quick::Edge::None;
  b->setVisible(show);if(show)b->sync(quickBarsConfig_[i],canvasViewport(),runtimePreferences_.flag("quickCommands.quickCommandBarTranslucent"),pending_==Pending::None&&!historyGestureBusy());
  if(show&&gradientPending_){for(auto control:gradientControls_)if(control.first->isVisible()&&control.first->bounds().intersects(b->bounds())){b->setVisible(false);break;}}}
}
bool Editor::quickCommandEnabled(const std::string& id)const{
 if(!documentOpen_||homeOpen_||pending_!=Pending::None||historyGestureBusy()||imageResizeTask_)return false;
 if(id=="quickAntiAlias")return !currentDocument().active()&&!currentDocument().hasFreeTileContent();
 if(id=="deleteSelection")return bool(currentDocument().selection());
 if(id=="swapForegroundBackground")return true;
 if(id=="detectImageScale")return true;
 const auto* m=metadata(id);if(!m||!menuCommands_.connected(m->command)||!menuCommands_.enabled(m->command))return false;
 if(auto it=menuItems_.find(m->command);it!=menuItems_.end()&&it->second->available&&!it->second->available())return false;
 return true;
}
void Editor::runQuickCommand(const std::string& id,bool right){
 if(pending_!=Pending::None)return;
 if(right){if(id=="fillForeground"){if(quickCommandEnabled(id)){currentDocument().fillSelectionOrCanvas(currentDocument().palette().secondary);refresh();}}else if(id=="customGrid")showCustomGridSettings();else if(id=="pixelGrid"||id=="relativeLuminance"){preferenceSection_=2;showPreferences();}return;}
 paletteFocused_=false;if(!quickCommandEnabled(id))return;
 if(id=="detectImageScale"){try{quickResize_=resizeDetecting_=true;imageResizeTask_=std::make_shared<ImageResizeTask>(currentDocument(),currentDocument().width(),currentDocument().height(),ImageInterpolation::Nearest,imageResizeExecutor_,true);imageResizeTimer_.start();status_=U"正在识别像素倍率…";}catch(const std::exception& e){quickResize_=resizeDetecting_=false;status_=unicodeText(e.what());}}
 else if(id=="tileRepeatX"||id=="tileRepeatY"||id=="tileRepeatBoth"){const auto mode=id=="tileRepeatX"?repeat::Mode::X:id=="tileRepeatY"?repeat::Mode::Y:repeat::Mode::Both;setTileRepeat(tileRepeatIdentity_==currentDocument().identity()&&currentView().tileRepeat==mode?repeat::Mode::Off:mode);}
 else if(id=="quickAntiAlias")openAntiAlias();
 else if(id=="swapForegroundBackground"){swapSharedColors();}
 else if(id=="deleteSelection")currentDocument().deleteSelectedPixels();
 else if(auto m=metadata(id))menuCommands_.invoke(m->command);
 refresh();
}
void Editor::syncQuickPreferenceValues(){
 for(unsigned i=0;i<4;++i){const auto key="quickCommands.bar"+std::to_string(i)+".";auto& b=quickBarsDraft_[i];runtimePreferenceDraft_.values[key+"name"]=utf8(b.name);runtimePreferenceDraft_.values[key+"edge"]=std::to_string(int(b.edge));for(auto& c:b.commands)runtimePreferenceDraft_.values[key+"command."+c.id]=c.enabled?"true":"false";}
}
void Editor::quickPreferenceChanged(const std::string& key,const std::string& value){
 if(key.rfind("quickCommands.bar",0)!=0||key.size()<20)return;const int i=key[17]-'0';if(i<0||i>=4)return;auto& b=quickBarsDraft_[i];auto part=key.substr(19);
 if(part=="name"){b.name=utf16(value);if(b.name.size()>32)b.name.resize(32);}else if(part=="edge"){b.edge=quick::Edge(std::stoi(value));quickPreferenceCollapsed_[i]=b.edge==quick::Edge::None;}else if(part.rfind("command.",0)==0){const auto id=part.substr(8);auto found=std::find_if(b.commands.begin(),b.commands.end(),[&](auto& c){return c.id==id;});if(found==b.commands.end())return;const bool enabled=value=="true";if(!enabled&&found->enabled&&std::count_if(b.commands.begin(),b.commands.end(),[](auto& c){return c.enabled;})==1)return;auto item=*found;item.enabled=enabled;std::vector<quick::Command> next;for(auto c:b.commands)if(c.id!=id&&c.enabled)next.push_back(c);next.push_back(item);for(auto c:b.commands)if(c.id!=id&&!c.enabled)next.push_back(c);b.commands=std::move(next);}
}
bool Editor::quickPreferenceHidden(const std::string& key)const{return key.rfind("quickCommands.bar",0)==0&&key.size()>19&&key.substr(19).rfind("command.",0)==0&&quickPreferenceCollapsed_[key[17]-'0'];}
void Editor::quickPreferenceAction(const std::string& key){const int i=key[17]-'0';if(i<0||i>=4)return;quickPreferenceCollapsed_[i]=!quickPreferenceCollapsed_[i];syncPreferenceCatalog();layoutModal();invalidate();}
void Editor::smokeQuickCommands(){
 smoke_=true;homeOpen_=false;documentOpen_=true;runtimePreferences_.values["quickCommands.quickCommandBarEnabled"]="true";const auto saved=quickBarsConfig_;const auto revision=currentDocument().revision();quickBarsConfig_=quick::defaultBars();refresh();if(!quickBars_[0]->isVisible())throw std::runtime_error("Quick bar invisible");quickBars_[0]->smoke();if(!quickBarsConfig_[0].expanded||currentDocument().revision()!=revision)throw std::runtime_error("Quick bar toggle/history");
 const auto savedBindings=shortcutBindings_;
 auto tooltip=[&](const std::string& icon){ui::TooltipManager* tips=nullptr;PixelButton* button=nullptr;for(auto child:quickBars_[0]->children()){if(auto t=dynamic_cast<ui::TooltipManager*>(child))tips=t;if(auto b=dynamic_cast<PixelButton*>(child);b&&b->icon==icon)button=b;}if(!tips||!button)throw std::runtime_error("Quick tooltip widget missing");return tips->getTooltipFor(button);};
 shortcutBindings_["flipHorizontal"]={"Ctrl+MouseBack","F8"};syncQuickCommands();if(tooltip("selectionFlipHorizontal").find("Ctrl+鼠标侧键 1")==std::string::npos||tooltip("selectionFlipHorizontal").find("F8")!=std::string::npos)throw std::runtime_error("Quick tooltip primary/localized binding");
 shortcutBindings_["flipHorizontal"]={};syncQuickCommands();if(tooltip("selectionFlipHorizontal").find("鼠标侧键")!=std::string::npos)throw std::runtime_error("Quick tooltip retained removed binding");
 shortcutBindings_.erase("flipHorizontal");syncQuickCommands();const auto primary=quick::primaryShortcut(shortcutBindings_,"flipHorizontal");if(!primary.empty()&&tooltip("selectionFlipHorizontal").find(primary)==std::string::npos)throw std::runtime_error("Quick tooltip default binding");
 shortcutBindings_=savedBindings;syncQuickCommands();
 for(auto edge:{quick::Edge::Top,quick::Edge::Right,quick::Edge::Bottom,quick::Edge::Left}){quickBarsConfig_[0].edge=edge;syncQuickCommands();if(!canvasViewport().contains(quickBars_[0]->bounds()))throw std::runtime_error("Quick bar outside viewport");}
 quickBarsDraft_=quickBarsConfig_;syncQuickPreferenceValues();quickPreferenceChanged("quickCommands.bar0.name","Custom");quickPreferenceChanged("quickCommands.bar0.edge","2");if(quickBarsDraft_[0].name!=u"Custom"||quickBarsDraft_[0].edge!=quick::Edge::Bottom)throw std::runtime_error("Quick preference wiring");

 replaceDocumentForSmoke(Document(4,4));currentDocument().fillSelectionOrCanvas(0xff123456);currentDocument().selectAllPixels();refresh();const auto selected=currentDocument().selection();const auto history=currentDocument().historySize();runQuickCommand("canvasMirrorHorizontal",false);if(!currentView().rotation.mirrorX||currentDocument().historySize()!=history||!currentDocument().selection())throw std::runtime_error("Quick mirror affected pixels/history/selection");runQuickCommand("canvasMirrorHorizontal",false);
 std::vector<Pixel> pixels(24*16);for(int y=0;y<16;++y)for(int x=0;x<24;++x)pixels[y*24+x]=((x/4+y/4)%2)?0xff112233:0xff445566;replaceDocumentForSmoke(Document::fromImage(24,16,pixels,U"快捷倍率"));refresh();runQuickCommand("detectImageScale",false);waitImageResizeForSmoke();if(currentDocument().width()!=6||currentDocument().height()!=4||currentDocument().historySize()!=1||pending_!=Pending::None)throw std::runtime_error("Quick detection direct resize");currentDocument().undo();if(currentDocument().pixels()!=pixels)throw std::runtime_error("Quick detection undo");

 std::function<void()> held;imageResizeExecutor_=[&](std::function<void()> work){held=std::move(work);};runQuickCommand("detectImageScale",false);for(int i=0;i<1000&&!held;++i)tickImageResize();if(!held)throw std::runtime_error("Quick detection worker not queued");const auto beforeCancel=currentDocument().historySize();ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);held();if(imageResizeTask_||quickResize_||currentDocument().historySize()!=beforeCancel)throw std::runtime_error("Quick detection cancel history");imageResizeExecutor_={};
 quickBarsConfig_[0].edge=quick::Edge::Top;refresh();manager()->invalidate();manager()->flushRedraw();manager()->dispatchMessages();manager()->flipAllDisplays();writeSmokeFrame(display()->nativeSurface().get(),assets_.parent_path()/"quick-command-bar.bmp");quickBarsConfig_=saved;refresh();
 // Explicit paste commands must ignore palette/frame routing and share one
 // structural undo transaction for image-as-layer.
 replaceDocumentForSmoke(Document(8,8));documentOpen_=true;homeOpen_=false;const auto pasteOwner=currentDocument().layer().id;
 SelectionClipboard pasteImage;pasteImage.width=2;pasteImage.height=1;pasteImage.originX=1;pasteImage.originY=2;pasteImage.pixels={0xff123456,0xffabcdef};
 auto clipboardReader=pixelClipboard_.exchangeSystemImageReaderForSmoke([pasteImage]{return std::optional<SelectionClipboard>{pasteImage};});
 const auto pastePreference=runtimePreferences_.get("editing.pasteTarget.Select");runtimePreferences_.values["editing.pasteTarget.Select"]="0";
 layerClipboardSnapshot_.reset();freeTileInstanceClipboard_.reset();paletteFocused_=true;currentView().frameSelection=true;refresh();
 if(!menuCommands_.connected("pasteAsNewLayer")||!shortcutSupported("pasteAsNewLayer"))throw std::runtime_error("Special paste command/shortcut missing");
 const auto pasteHistory=currentDocument().historySize();if(!menuItems_.at("pasteAsNewLayer")->available())throw std::runtime_error("Paste new layer menu disabled");menuItems_.at("pasteAsNewLayer")->Click();const auto pasteLayer=currentDocument().layer().id;
 if(pasteLayer==pasteOwner||currentDocument().timeline().state().layers.size()!=2||currentDocument().historySize()!=pasteHistory+1||!currentTools().selectionTool||!currentDocument().selection()||currentDocument().selection()->x!=1||currentDocument().selection()->y!=2)throw std::runtime_error("Paste new layer UI/context/history");
 currentDocument().undo();if(currentDocument().layer().id!=pasteOwner||currentDocument().timeline().state().layers.size()!=1)throw std::runtime_error("Paste new layer undo");currentDocument().redo();
 paletteFocused_=true;currentView().frameSelection=true;refresh();if(!menuItems_.at("pasteToCurrentCell")->available())throw std::runtime_error("Paste current cell menu disabled");menuItems_.at("pasteToCurrentCell")->Click();if(!currentDocument().floating()||currentDocument().layer().id!=pasteLayer||currentDocument().timeline().state().layers.size()!=2)throw std::runtime_error("Paste current cell routing");currentDocument().cancelFloatingPaste();
 paletteFocused_=false;currentView().frameSelection=false;currentDocument().selectTimelineLayer(pasteLayer);layerClipboardSnapshot_=currentDocument().copyLayerClipboard();pixelClipboard_.captureStructuredCopyBaseline();
 const auto structuredCount=currentDocument().timeline().state().layers.size();menuCommands_.invoke("pasteAsNewLayer");if(currentDocument().timeline().state().layers.size()!=structuredCount+1||currentDocument().layer().name.find(U"副本")==std::u32string::npos)throw std::runtime_error("Paste new layer internal precedence");
 auto newer=pasteImage;newer.pixels[0]=0xff998877;pixelClipboard_.exchangeSystemImageReaderForSmoke([newer]{return std::optional<SelectionClipboard>{newer};});menuCommands_.invoke("pasteAsNewLayer");if(currentDocument().layer().name!=U"粘贴图层")throw std::runtime_error("Paste new layer external precedence");layerClipboardSnapshot_.reset();
 runtimePreferences_.values["editing.pasteTarget.Select"]="1";const auto preferenceLayers=currentDocument().timeline().state().layers.size();pasteEditorClipboard();if(currentDocument().timeline().state().layers.size()!=preferenceLayers+1||currentDocument().layer().name!=U"粘贴图层")throw std::runtime_error("Paste target preference route");runtimePreferences_.values["editing.pasteTarget.Select"]="2";const auto beforeProjectPaste=projects_.size();newDocumentClipboardReaderForSmoke_=[newer]{return std::optional<SelectionClipboard>{newer};};pasteEditorClipboard();newDocumentClipboardReaderForSmoke_={};if(projects_.size()!=beforeProjectPaste+1||currentDocument().width()!=2||currentDocument().height()!=1||currentDocument().canUndo())throw std::runtime_error("Paste target new project route");runtimePreferences_.values["editing.pasteTarget.Select"]=pastePreference;
 pixelClipboard_.exchangeSystemImageReaderForSmoke(std::move(clipboardReader));paletteFocused_=false;currentView().frameSelection=false;refresh();
 preferenceSection_=1;showPreferences();quickBarsDraft_=quick::defaultBars();quickPreferenceCollapsed_.fill(true);quickPreferenceCollapsed_[0]=false;syncQuickPreferenceValues();syncPreferenceCatalog();layoutModal();
 auto row=[&](const std::string& id)->ui::Widget*{const auto key="quickCommands.bar0.command."+id;for(unsigned i=0;i<preferences::catalog().size();++i)if(key==preferences::catalog()[i].id)return preferenceRows_[i];return nullptr;};
 const auto first=quickBarsDraft_[0].commands[0].id,second=quickBarsDraft_[0].commands[1].id;auto a=row(first),b=row(second);if(!a||!b||a->bounds().y>=b->bounds().y)throw std::runtime_error("Quick preference display order");
 QuickCommandDragHandle* handle=nullptr;for(auto child:children())if(auto h=dynamic_cast<QuickCommandDragHandle*>(child);h&&h->isVisible()&&h->bounds().center().y>=a->bounds().y&&h->bounds().center().y<a->bounds().y2())handle=h;
 if(!handle||!modalControl(handle))throw std::runtime_error("Quick preference handle/modal route");
 auto from=handle->bounds().center();auto target=b->bounds().center();target.y+=uiScale;
 ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,from),move(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,target),up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,target);
 handle->onProcessMessage(&down);handle->onProcessMessage(&move);handle->onProcessMessage(&up);
 if(quickBarsDraft_[0].commands[0].id!=second||row(second)->bounds().y>=row(first)->bounds().y||handle->hasCapture())throw std::runtime_error("Quick preference actual drag order/release");
 const int scrollBefore=preferenceContentPixels_;handle->move({preferenceViewport_.center().x,preferenceViewport_.y2()-1},true);if(preferenceContentPixels_<=scrollBefore)throw std::runtime_error("Quick preference edge autoscroll");
 preferenceContentPixels_=0;layoutModal();manager()->invalidate();manager()->flushRedraw();manager()->dispatchMessages();manager()->flipAllDisplays();writeSmokeFrame(display()->nativeSurface().get(),assets_.parent_path()/"quick-command-preferences.bmp");
 resolve(false);if(quickBarsConfig_[0].commands[0].id!=saved[0].commands[0].id)throw std::runtime_error("Cancelled preferences persisted order");refresh();
}
}
