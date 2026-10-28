#include "editor_implementation.h"
#include "editor.h"
namespace moon::editor {
void Editor::showHelp(bool tips,bool verify){
 if(pending_!=Pending::None)return;
 auto binding=[this](const std::string& id){std::string out;for(const auto& part:shortcuts::forId(shortcutBindings_,id)){if(!out.empty())out+=" / ";out+=part;}return unicodeText(out);};
 auto label=[](const std::string& id){if(const auto* definition=shortcuts::find(id))return definition->label;return unicodeText(id);};
 HelpDialog popup(font_,skin_,toolIcons_,tips,binding,label,menuCommands_.connected("diagnostics")&&menuCommands_.enabled("diagnostics"));popup.setDisplay(display(),false);
 const auto file=palettePreferencePath().parent_path()/(tips?"usage-tips-layout-v1.txt":"usage-help-layout-v1.txt");gfx::Rect geometry;bool readable=true;
 if(!smoke_)try{if(std::filesystem::exists(file)){std::ifstream in(file);std::string tag;int x,y,w,h;if(!(in>>tag>>x>>y>>w>>h)||tag!="usage-layout-v1"||w<1||h<1||w>32768||h>32768)throw std::runtime_error("Invalid help window geometry");geometry={x,y,w,h};}}catch(const std::exception& e){readable=false;status_=U"帮助窗口布局读取失败："+unicodeText(e.what());}
 const auto area=bounds();const auto minimum=popup.minimumDialogSize(geometry.w);const int availableW=std::max(minimum.w,area.w-12*uiScale),availableH=std::max(minimum.h,area.h-12*uiScale);
 if(geometry.isEmpty()){geometry.w=std::min(810*uiScale,availableW);geometry.h=std::min(590*uiScale,availableH);geometry.x=area.center().x-geometry.w/2;geometry.y=area.center().y-geometry.h/2;}
 geometry.w=std::clamp(geometry.w,minimum.w,std::min(1100*uiScale,availableW));geometry.h=std::clamp(geometry.h,minimum.h,std::min(900*uiScale,availableH));geometry.x=std::clamp(geometry.x,area.x,std::max(area.x,area.x2()-geometry.w));geometry.y=std::clamp(geometry.y,area.y,std::max(area.y,area.y2()-geometry.h));popup.setBounds(geometry);
 ui::Timer timer(120,&popup);std::exception_ptr failure;int stage=0;
 if(verify){timer.Tick.connect([&]{try{if(stage++==0){auto check=[](bool b,const char* why){if(!b)throw std::runtime_error(why);};const auto& articles=tips?help::tipsArticles():help::helpArticles();check(popup.results().size()==articles.size(),"Help complete legacy article catalog");check(popup.selectedId()==(tips?"modifier-brushSizeAdjust":"first-art"),"Help legacy default topic");check(popup.diagnosticsEnabled(),"Help real diagnostic entry enabled");popup.smokeQuery("__no_such_help_article_7219__");check(popup.results().empty(),"Help no-results state");popup.smokeQuery("");check(popup.results().size()==articles.size(),"Help clear search restores all topics");popup.smokeQuery(tips?"笔刷 尺寸":"保存 工程");check(!popup.results().empty(),"Help all-word body search");popup.smokeQuery("");popup.smokeSelect(int(articles.size())-1);check(popup.selectedId()==articles.back().id,"Help actual topic navigation");return;}timer.stop();writeSmokeFrame(popup.display()->nativeSurface().get(),assets_.parent_path()/(tips?"tips-dialog-smoke.bmp":"help-dialog-smoke.bmp"));popup.closeWindow(nullptr);}catch(...){failure=std::current_exception();timer.stop();popup.closeWindow(nullptr);}});timer.start();}
 popup.focusSearch();popup.openWindowInForeground();timer.stop();
 if(!smoke_&&readable)try{const auto r=popup.bounds();const auto text=std::string("usage-layout-v1 ")+std::to_string(r.x)+" "+std::to_string(r.y)+" "+std::to_string(r.w)+" "+std::to_string(r.h)+"\n";writeExportBytesAtomic(file,{text.begin(),text.end()});}catch(const std::exception& e){status_=U"帮助窗口布局保存失败："+unicodeText(e.what());}
 requestFocus();refresh();if(failure)std::rethrow_exception(failure);
 if(popup.requestedAction()==1)showShortcutSettings();else if(popup.requestedAction()==2)menuCommands_.invoke("diagnostics");
}
void Editor::smokeHelp(){smoke_=true;pending_=Pending::None;documentOpen_=false;homeOpen_=true;refresh();if(!menuCommands_.connected("userGuide")||!menuCommands_.connected("tips"))throw std::runtime_error("Help actual menu bindings");const auto before=document.historyPosition();helpVerify_=true;menuCommands_.invoke("userGuide");menuCommands_.invoke("tips");helpVerify_=false;if(document.historyPosition()!=before)throw std::runtime_error("Help viewing must preserve document history");}
}
