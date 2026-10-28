#include "editor_implementation.h"
#include "editor.h"
#include "shortcut_input.h"
namespace moon::editor {
void Editor::configureReferencePanel(ReferenceImagePanel& panel){
 panel.pasteShortcut=[this](const ui::KeyMessage& key){return shortcuts::matches(shortcutBindings_,"paste",shortcuts::keyboardText(key));};
 panel.readClipboard=[this]()->std::optional<SelectionClipboard>{if(!documentOpen_||homeOpen_)return {};return pixelClipboard_.readReferenceImage();};
 panel.error=[this](std::u32string value){status_=std::move(value);refresh();};
 panel.changed=[this]{syncReferencePanels();refresh();};
 panel.sampled=[this](Pixel color,bool secondary){document.setPaletteRole(color,secondary,paletteLocked_);refresh();};
 panel.windowOpened=[this](const std::string& id){openReferenceWindow(id);};
 panel.samplingCursor=[this](bool sample){if(referenceSamplingCursor_!=sample){referenceSamplingCursor_=sample;if(refreshCursor_)refreshCursor_();}};
 panel.context=[this,&panel]{if(&panel==referencePanel_)showColumnContextMenu(Column(9));};
}
void Editor::initializeReferencePanel(){
 referencePanel_=new ReferenceImagePanel(font_,skin_,toolIcons_,document,[this]()->ReferenceSession&{return referenceSession();});addChild(referencePanel_);configureReferencePanel(*referencePanel_);referencePanel_->setVisible(false);
 if(!smoke_)try{const auto file=palettePreferencePath().parent_path()/"reference-panel-v1.txt";if(std::filesystem::exists(file)){std::ifstream input(file);std::string version;int visible=-1;if(!(input>>version>>visible)||version!="reference-panel-v1"||(visible!=0&&visible!=1))throw std::runtime_error("Invalid reference panel preferences");referencePanelOpen_=visible!=0;}}catch(const std::exception& e){referenceGeometryReadable_=false;status_=U"参考图面板偏好读取失败："+unicodeText(e.what());}
 menuCommands_.bind("panelReference",{[this]{initializeDocking();referencePanelOpen_=!referencePanelOpen_;if(referencePanelOpen_){docking_.custom=true;docking_.select(9);}else requestFocus();refresh();saveWorkspaceSizes();if(!smoke_&&referenceGeometryReadable_)try{std::ofstream out(palettePreferencePath().parent_path()/"reference-panel-v1.txt");out.exceptions(std::ios::badbit|std::ios::failbit);out<<"reference-panel-v1 "<<referencePanelOpen_<<'\n';}catch(const std::exception& e){status_=U"参考图面板偏好保存失败："+unicodeText(e.what());}},[this]{return pending_==Pending::None;},[this]{return referencePanelOpen_;}});
}
void Editor::syncReferencePanels(){
 if(!referencePanel_)return;referenceSession().synchronize(document.referenceImages());
 const double sensitivity[]{.5,.75,1,1.5,2};auto update=[&](ReferenceImagePanel& panel){panel.eyedropper=eyedropperTool_||eyedropperHeld_;panel.dragSensitivity=sensitivity[std::clamp(runtimePreferences_.index("editing.viewDragSensitivity.Select"),0,4)];if(previewPanel_)panel.checkerboard=previewPanel_->checkerboard;panel.sync();};update(*referencePanel_);
 for(auto& item:referenceWindows_){const bool show=item.identity==document.identity()&&!item.window->closed()&&referenceSession().window(item.window->id());item.window->setVisible(show);if(show)update(item.window->panel());}
 const auto windows=referenceSession().windows;for(const auto& window:windows)if(std::none_of(referenceWindows_.begin(),referenceWindows_.end(),[&](const auto& item){return item.identity==document.identity()&&!item.window->closed()&&item.window->id()==window.id;}))openReferenceWindow(window.id);
}
void Editor::layoutReferencePanel(){
 if(!referencePanel_)return;const bool show=columnShown(9)&&!homeOpen_;referencePanel_->setVisible(show);if(!show)return;
 auto chrome=PanelChromeLayout(columnFrame(9),columnFrameTop(9)==0,0);if(columnFloating(9)){const auto frame=columnFrame(9);chrome.content={frame.x+UiSpacing::related,FloatingColumnChrome::bodyTop(frame),frame.w-2*UiSpacing::related,std::max(0,frame.y2()-UiSpacing::related-FloatingColumnChrome::bodyTop(frame))};}
 referencePanel_->setBounds(toDisplay(chrome.content));
}
void Editor::openReferenceWindow(const std::string& id){
 const auto owner=document.identity();if(!referenceSessions_[owner].window(id))return;for(auto& item:referenceWindows_)if(item.identity==owner&&!item.window->closed()&&item.window->id()==id)return;
 auto popup=std::make_unique<ReferenceImageWindow>(font_,skin_,toolIcons_,document,[this,owner]()->ReferenceSession&{return referenceSessions_[owner];},id);configureReferencePanel(popup->panel());popup->changed=[this]{refresh();};popup->setDisplay(display(),false);const auto r=uiLogical(bounds());const int offset=24*(1+int(referenceSessions_[owner].windows.size()-1)%8);popup->setBounds(toDisplay({std::max(12,r.w-576)+offset,80+offset,280,280}));auto pointer=popup.get();referenceWindows_.push_back({owner,std::move(popup)});pointer->openWindow();
}
void Editor::smokeReferenceImages(){
 auto check=[](bool value,const char* why){if(!value)throw std::runtime_error(why);};smoke_=true;documentOpen_=true;homeOpen_=false;document=Document(4,4);document.markSaved();refresh();check(menuCommands_.connected("panelReference"),"Reference actual menu binding");if(!referencePanelOpen_)menuCommands_.invoke("panelReference");refresh();
 const auto history=document.historySize();const auto pixels=document.pixels();referencePanel_->readClipboard=[]{SelectionClipboard source;source.width=2;source.height=1;source.pixels={0x800000ff,0xff00ff00};return std::optional<SelectionClipboard>{source};};referencePanel_->pasteReference();check(document.referenceImages().size()==1&&document.dirty()&&document.historySize()==history&&document.pixels()==pixels,"Reference opened panel paste metadata");referencePanel_->zoom(true);referencePanel_->setRelativeLuminance(true);const auto id=referenceSession().openWindow(document.referenceImages(),referenceSession().activeId);openReferenceWindow(id);refresh();
 auto& popup=*referenceWindows_.back().window;popup.panel().readClipboard=[]{return std::optional<SelectionClipboard>{};};const auto count=document.referenceImages().size();popup.panel().pasteReference();check(document.referenceImages().size()==count,"Reference empty paste preserves image");ui::Timer capture(120,&popup);capture.Tick.connect([&]{capture.stop();writeSmokeFrame(popup.display()->nativeSurface().get(),assets_.parent_path()/"reference-panel-smoke.bmp");popup.closeWindow(nullptr);});capture.start();popup.openWindowInForeground();capture.stop();referenceSession().closeWindow(id);
 document.markSaved();const auto revision=document.revision();referencePanel_->zoom(false);check(!document.dirty()&&document.revision()==revision&&document.historySize()==history,"Reference navigation no document mutation");referencePanel_->readClipboard={};configureReferencePanel(*referencePanel_);referencePanelOpen_=false;referenceSession().windows.clear();document=Document();refresh();
}
}
