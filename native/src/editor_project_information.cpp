#include "editor_implementation.h"
#include "editor.h"
#include "project_information_dialog.h"
namespace moon::editor {
void Editor::showProjectInformation(bool verify){
 if(pending_!=Pending::None||!documentOpen_||homeOpen_)return;
 ProjectInformationDialog popup(font_,skin_,toolIcons_,document);popup.setDisplay(display(),false);
 const auto file=palettePreferencePath().parent_path()/"project-info-layout-v1.txt";gfx::Rect geometry;bool readable=true;
 if(!smoke_)try{if(std::filesystem::exists(file)){std::ifstream in(file);std::string tag;int x,y,w,h;if(!(in>>tag>>x>>y>>w>>h)||tag!="project-info-layout-v1"||w<1||h<1||w>32768||h>32768)throw std::runtime_error("Invalid project information window geometry");geometry={x,y,w,h};}}catch(const std::exception& e){readable=false;status_=U"项目信息窗口布局读取失败："+unicodeText(e.what());}
 const auto area=bounds();const auto minimum=popup.minimumDialogSize(geometry.w);const int availableW=std::max(minimum.w,area.w-12*uiScale),availableH=std::max(minimum.h,area.h-12*uiScale);
 if(geometry.isEmpty()){geometry.w=std::min(378*uiScale,availableW);geometry.h=std::min(426*uiScale,availableH);geometry.x=area.center().x-geometry.w/2;geometry.y=area.center().y-geometry.h/2;}
 geometry.w=std::clamp(geometry.w,minimum.w,availableW);geometry.h=std::clamp(geometry.h,minimum.h,availableH);geometry.x=std::clamp(geometry.x,area.x,std::max(area.x,area.x2()-geometry.w));geometry.y=std::clamp(geometry.y,area.y,std::max(area.y,area.y2()-geometry.h));popup.setBounds(geometry);
 ui::Timer timer(120,&popup);std::exception_ptr failure;int stage=0;
 if(verify){timer.Tick.connect([&]{try{if(stage++==0){if(popup.detailCount()!=9)throw std::runtime_error("Project information legacy detail catalog");writeSmokeFrame(popup.display()->nativeSurface().get(),assets_.parent_path()/"project-information-dialog-smoke.bmp");auto r=popup.bounds();r.w=popup.minimumDialogSize(r.w).w;r.h=popup.minimumDialogSize(r.w).h;popup.setBounds(r);popup.smokeScroll();if(popup.scroll()<=0)throw std::runtime_error("Project information narrow window scroll");return;}timer.stop();writeSmokeFrame(popup.display()->nativeSurface().get(),assets_.parent_path()/"project-information-dialog-narrow-smoke.bmp");popup.smokeDone();}catch(...){failure=std::current_exception();timer.stop();popup.closeWindow(nullptr);}});timer.start();}
 popup.focusContent();popup.openWindowInForeground();timer.stop();
 if(!smoke_&&readable)try{const auto r=popup.bounds();const auto text=std::string("project-info-layout-v1 ")+std::to_string(r.x)+" "+std::to_string(r.y)+" "+std::to_string(r.w)+" "+std::to_string(r.h)+"\n";writeExportBytesAtomic(file,{text.begin(),text.end()});}catch(const std::exception& e){status_=U"项目信息窗口布局保存失败："+unicodeText(e.what());}
 requestFocus();refresh();if(failure)std::rethrow_exception(failure);
}
void Editor::smokeProjectInformation(){smoke_=true;pending_=Pending::None;documentOpen_=false;homeOpen_=true;refresh();if(!menuCommands_.connected("openProjectInfo")||menuCommands_.enabled("openProjectInfo"))throw std::runtime_error("Project information disabled without document");documentOpen_=true;homeOpen_=false;refresh();if(!menuCommands_.enabled("openProjectInfo"))throw std::runtime_error("Project information actual menu enabled");const auto history=document.historyPosition(),revision=document.revision();const auto info=document.projectInformation();projectInformationVerify_=true;menuCommands_.invoke("openProjectInfo");projectInformationVerify_=false;if(document.historyPosition()!=history||document.revision()!=revision||document.projectInformation().operationCount!=info.operationCount||document.projectInformation().updatedAt!=info.updatedAt)throw std::runtime_error("Viewing project information changed project");}
}
