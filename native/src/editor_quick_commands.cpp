#include "editor.h"
#include "image_resize_task.h"
#include "editor_implementation.h"
#include "quick_command_metadata.h"
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
 for(auto& m:quick::metadata)for(auto suffix:{"","-disabled"}){const auto name=std::string(m.icon)+suffix;if(!toolIcons_.assets.patches.count(name))toolIcons_.assets.patches[name]=importSkinPng(assets_/"utility-icons"/(name+".png"),32);}
 for(unsigned i=0;i<4;++i){auto b=new QuickCommandBar(font_,skin_,toolIcons_);addChild(b);quickBars_[i]=b;
  b->changed=[this,i](const quick::Bar& bar){quickBarsConfig_[i]=bar;saveQuickCommands();syncQuickCommands();};
  b->enabled=[this](const std::string& id){return quickCommandEnabled(id);};b->checked=[this](const std::string& id){auto m=metadata(id);if(id=="selectionOutline")return bool(document.selection())&&showSelectionOutline_;return m&&menuCommands_.checked(m->command);};
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
 if(id=="quickAntiAlias")return !document.active()&&!document.hasFreeTileContent();
 if(id=="deleteSelection")return bool(document.selection());
 if(id=="swapForegroundBackground")return true;
 if(id=="detectImageScale")return true;
 const auto* m=metadata(id);if(!m||!menuCommands_.connected(m->command)||!menuCommands_.enabled(m->command))return false;
 if(auto it=menuItems_.find(m->command);it!=menuItems_.end()&&it->second->available&&!it->second->available())return false;
 return true;
}
void Editor::runQuickCommand(const std::string& id,bool right){
 if(pending_!=Pending::None)return;
 if(right){if(id=="fillForeground"){if(quickCommandEnabled(id)){document.fillSelectionOrCanvas(document.palette().secondary);refresh();}}else if(id=="customGrid")showCustomGridSettings();else if(id=="pixelGrid"||id=="relativeLuminance"){preferenceSection_=2;showPreferences();}return;}
 paletteFocused_=false;if(!quickCommandEnabled(id))return;
 if(id=="detectImageScale"){try{quickResize_=resizeDetecting_=true;imageResizeTask_=std::make_shared<ImageResizeTask>(document,document.width(),document.height(),ImageInterpolation::Nearest,imageResizeExecutor_,true);imageResizeTimer_.start();status_=U"正在识别像素倍率…";}catch(const std::exception& e){quickResize_=resizeDetecting_=false;status_=unicodeText(e.what());}}
 else if(id=="quickAntiAlias")openAntiAlias();
 else if(id=="swapForegroundBackground"){auto p=document.palette();document.setPaletteRole(p.secondary,false,paletteLocked_);document.setPaletteRole(p.primary,true,paletteLocked_);}
 else if(id=="deleteSelection")document.deleteSelectedPixels();
 else if(auto m=metadata(id))menuCommands_.invoke(m->command);
 refresh();
}
void Editor::syncQuickPreferenceValues(){
 for(unsigned i=0;i<4;++i){const auto key="quickCommands.bar"+std::to_string(i)+".";auto& b=quickBarsDraft_[i];runtimePreferenceDraft_.values[key+"name"]=utf8(b.name);runtimePreferenceDraft_.values[key+"edge"]=std::to_string(int(b.edge));for(auto& c:b.commands)runtimePreferenceDraft_.values[key+"command."+c.id]=c.enabled?"true":"false";}
}
void Editor::quickPreferenceChanged(const std::string& key,const std::string& value){
 if(key.rfind("quickCommands.bar",0)!=0||key.size()<20)return;const int i=key[17]-'0';if(i<0||i>=4)return;auto& b=quickBarsDraft_[i];auto part=key.substr(19);
 if(part=="name"){b.name=utf16(value);if(b.name.size()>32)b.name.resize(32);}else if(part=="edge")b.edge=quick::Edge(std::stoi(value));else if(part.rfind("command.",0)==0){const auto id=part.substr(8);auto found=std::find_if(b.commands.begin(),b.commands.end(),[&](auto& c){return c.id==id;});if(found==b.commands.end())return;const bool enabled=value=="true";if(!enabled&&found->enabled&&std::count_if(b.commands.begin(),b.commands.end(),[](auto& c){return c.enabled;})==1)return;auto item=*found;item.enabled=enabled;std::vector<quick::Command> next;for(auto c:b.commands)if(c.id!=id&&c.enabled)next.push_back(c);next.push_back(item);for(auto c:b.commands)if(c.id!=id&&!c.enabled)next.push_back(c);b.commands=std::move(next);}
}
bool Editor::quickPreferenceHidden(const std::string& key)const{return key.rfind("quickCommands.bar",0)==0&&key.size()>19&&key.substr(19).rfind("command.",0)==0&&quickPreferenceCollapsed_[key[17]-'0'];}
void Editor::quickPreferenceAction(const std::string& key){const int i=key[17]-'0';if(i<0||i>=4)return;quickPreferenceCollapsed_[i]=!quickPreferenceCollapsed_[i];layoutModal();invalidate();}
void Editor::smokeQuickCommands(){
 smoke_=true;homeOpen_=false;documentOpen_=true;runtimePreferences_.values["quickCommands.quickCommandBarEnabled"]="true";const auto saved=quickBarsConfig_;const auto revision=document.revision();quickBarsConfig_=quick::defaultBars();refresh();if(!quickBars_[0]->isVisible())throw std::runtime_error("Quick bar invisible");quickBars_[0]->smoke();if(!quickBarsConfig_[0].expanded||document.revision()!=revision)throw std::runtime_error("Quick bar toggle/history");
 for(auto edge:{quick::Edge::Top,quick::Edge::Right,quick::Edge::Bottom,quick::Edge::Left}){quickBarsConfig_[0].edge=edge;syncQuickCommands();if(!canvasViewport().contains(quickBars_[0]->bounds()))throw std::runtime_error("Quick bar outside viewport");}
 quickBarsDraft_=quickBarsConfig_;syncQuickPreferenceValues();quickPreferenceChanged("quickCommands.bar0.name","Custom");quickPreferenceChanged("quickCommands.bar0.edge","2");if(quickBarsDraft_[0].name!=u"Custom"||quickBarsDraft_[0].edge!=quick::Edge::Bottom)throw std::runtime_error("Quick preference wiring");

 document=Document(4,4);document.fillSelectionOrCanvas(0xff123456);document.selectAllPixels();refresh();const auto selected=document.selection();const auto history=document.historySize();runQuickCommand("canvasMirrorHorizontal",false);if(!viewRotation_.mirrorX||document.historySize()!=history||!document.selection())throw std::runtime_error("Quick mirror affected pixels/history/selection");runQuickCommand("canvasMirrorHorizontal",false);
 std::vector<Pixel> pixels(24*16);for(int y=0;y<16;++y)for(int x=0;x<24;++x)pixels[y*24+x]=((x/4+y/4)%2)?0xff112233:0xff445566;document=Document::fromImage(24,16,pixels,U"快捷倍率");refresh();runQuickCommand("detectImageScale",false);waitImageResizeForSmoke();if(document.width()!=6||document.height()!=4||document.historySize()!=1||pending_!=Pending::None)throw std::runtime_error("Quick detection direct resize");document.undo();if(document.pixels()!=pixels)throw std::runtime_error("Quick detection undo");

 std::function<void()> held;imageResizeExecutor_=[&](std::function<void()> work){held=std::move(work);};runQuickCommand("detectImageScale",false);for(int i=0;i<1000&&!held;++i)tickImageResize();if(!held)throw std::runtime_error("Quick detection worker not queued");const auto beforeCancel=document.historySize();ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);held();if(imageResizeTask_||quickResize_||document.historySize()!=beforeCancel)throw std::runtime_error("Quick detection cancel history");imageResizeExecutor_={};
 quickBarsConfig_[0].edge=quick::Edge::Top;refresh();manager()->invalidate();manager()->flushRedraw();manager()->dispatchMessages();manager()->flipAllDisplays();writeSmokeFrame(display()->nativeSurface().get(),assets_.parent_path()/"quick-command-bar.bmp");quickBarsConfig_=saved;refresh();
}
}
