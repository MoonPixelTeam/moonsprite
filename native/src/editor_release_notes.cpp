#include "editor_implementation.h"
#include "editor.h"
#include "release_notes_dialog.h"
namespace moon::editor {
void Editor::showLatestRelease(std::size_t index,bool verify){
 if(pending_!=Pending::None||index>=releases::all().size())return;
 releaseNotesLastOpened_=index;
 ReleaseNotesDialog popup(font_,skin_,toolIcons_,releases::all()[index]);popup.setDisplay(display(),false);
 const auto file=palettePreferencePath().parent_path()/"latest-release-layout-v1.txt";gfx::Rect geometry;bool readable=true;
 if(!smoke_)try{if(std::filesystem::exists(file)){std::ifstream in(file);std::string tag;int x,y,w,h;if(!(in>>tag>>x>>y>>w>>h)||tag!="latest-release-layout-v1"||w<1||h<1||w>32768||h>32768)throw std::runtime_error("Invalid release notes window geometry");geometry={x,y,w,h};}}catch(const std::exception& e){readable=false;status_=U"更新日志窗口布局读取失败："+unicodeText(e.what());}
 const auto area=bounds();const auto minimum=popup.minimumDialogSize(geometry.w);const int availableW=std::max(minimum.w,area.w-12*uiScale),availableH=std::max(minimum.h,area.h-12*uiScale);
 if(geometry.isEmpty()){geometry.w=std::min(634*uiScale,availableW);geometry.h=std::min(508*uiScale,availableH);geometry.x=area.center().x-geometry.w/2;geometry.y=area.center().y-geometry.h/2;}
 geometry.w=std::clamp(geometry.w,minimum.w,std::min(820*uiScale,availableW));geometry.h=std::clamp(geometry.h,minimum.h,std::min(800*uiScale,availableH));geometry.x=std::clamp(geometry.x,area.x,std::max(area.x,area.x2()-geometry.w));geometry.y=std::clamp(geometry.y,area.y,std::max(area.y,area.y2()-geometry.h));popup.setBounds(geometry);
 ui::Timer timer(120,&popup);std::exception_ptr failure;int stage=0;
 if(verify){timer.Tick.connect([&]{try{if(stage++==0){int count=0;for(const auto& section:releases::all()[index].sections)count+=int(section.items.size());if(popup.version()!=releases::all()[index].version||popup.itemCount()!=count)throw std::runtime_error("Release notes actual selected version and complete content");writeSmokeFrame(popup.display()->nativeSurface().get(),assets_.parent_path()/(index==0?"release-notes-smoke.bmp":"release-notes-historical-smoke.bmp"));auto r=popup.bounds();r.w=minimum.w;r.h=minimum.h;popup.setBounds(r);popup.smokeScroll();if(popup.scroll()<=0)throw std::runtime_error("Release notes narrow body keyboard scrolling");return;}timer.stop();if(index==0)writeSmokeFrame(popup.display()->nativeSurface().get(),assets_.parent_path()/"release-notes-narrow-smoke.bmp");popup.smokeDone();}catch(...){failure=std::current_exception();timer.stop();popup.closeWindow(nullptr);}});timer.start();}
 popup.focusContent();popup.openWindowInForeground();timer.stop();
 if(!smoke_&&readable)try{const auto r=popup.bounds();const auto text=std::string("latest-release-layout-v1 ")+std::to_string(r.x)+" "+std::to_string(r.y)+" "+std::to_string(r.w)+" "+std::to_string(r.h)+"\n";writeExportBytesAtomic(file,{text.begin(),text.end()});}catch(const std::exception& e){status_=U"更新日志窗口布局保存失败："+unicodeText(e.what());}
 requestFocus();refresh();if(failure)std::rethrow_exception(failure);
}
void Editor::showReleaseNoticeOnce(){
 if(smoke_||releaseNoticeHandled_||pending_!=Pending::None)return;releaseNoticeHandled_=true;
 // The version is the embedded LEGACY announcement identity, not the native build version.
 try{const auto file=palettePreferencePath().parent_path()/releases::seenKey;
 auto read=[&](){std::ifstream in(file,std::ios::binary);if(!in)return std::string{};std::string text;std::getline(in,text);return text;};
 auto write=[&](const std::string& value){writeExportBytesAtomic(file,{value.begin(),value.end()});};
 if(releases::shouldShow(releases::all().front().version,read,write))showLatestRelease();
 }catch(const std::exception& e){status_=U"更新日志提示不可用："+unicodeText(e.what());}
}
void Editor::smokeReleaseNotes(){smoke_=true;pending_=Pending::None;documentOpen_=false;homeOpen_=true;refresh();if(!menuCommands_.connected("openLatestRelease")||!menuCommands_.enabled("openLatestRelease"))throw std::runtime_error("Release notes real help menu available without document");const auto before=document.historyPosition(),revision=document.revision();std::string seen;int writes=0;auto read=[&]{return seen;};auto write=[&](const std::string& value){seen=value;++writes;};if(!releases::shouldShow(releases::all()[0].version,read,write)||releases::shouldShow(releases::all()[0].version,read,write)||writes!=1)throw std::runtime_error("Release announcement once-per-version policy");releaseNotesVerify_=true;menuCommands_.invoke("openLatestRelease");releaseNotesVerify_=false;showLatestRelease(1,true);if(before!=document.historyPosition()||revision!=document.revision())throw std::runtime_error("Release notes must not change project");}
void Editor::smokeHomeAnnouncements(int phase){
 if(phase==0){smoke_=true;pending_=Pending::None;homeOpen_=true;documentOpen_=false;refresh();if(!homeAnnouncements_)throw std::runtime_error("Missing home announcements");homeAnnouncements_->scrollEnd();invalidate();return;}
 smoke_=true;pending_=Pending::None;homeOpen_=true;documentOpen_=false;refresh();
 auto check=[](bool value,const char* why){if(!value)throw std::runtime_error(why);};check(homeAnnouncements_&&homeAnnouncements_->count()==3,"Actual home announcement widgets");const auto expected=releases::homeAnnouncements();const auto before=document.historyPosition(),revision=document.revision();const auto rightScroll=homeScrollPixels_;const auto original=homeAnnouncements_->bounds();
 for(std::size_t i=0;i<expected.size();++i){check(homeAnnouncements_->releaseIndex(i)==expected[i]&&homeAnnouncements_->version(i)==releases::all()[expected[i]].version,"Home announcement version/title association");}
 homeAnnouncements_->setRelayoutEnabled(false);
 homeAnnouncements_->setBounds({original.x,original.y,120*uiScale,68*uiScale});homeAnnouncements_->configure(4*18+6);check(!homeAnnouncements_->summariesVisible(),"Legacy short news container hides summary");check(homeAnnouncements_->maximum()>0,"Short news viewport overflows");
 for(std::size_t i=0;i<expected.size();++i){homeAnnouncements_->ensureVisible(i);check(homeAnnouncements_->reachable(i),"Each of three announcements reachable when short");}

 homeAnnouncements_->setBounds({original.x,original.y,200*uiScale,360*uiScale});homeAnnouncements_->configure(0);check(homeAnnouncements_->summariesVisible(),"Legacy tall news container shows up to three summary lines");
 homeAnnouncements_->setBounds(original);homeAnnouncements_->configure(4*(homeBounds().h<340?18:26)+6);homeAnnouncements_->setRelayoutEnabled(true);releaseNotesVerify_=true;
 for(std::size_t i=0;i<expected.size();++i){homeAnnouncements_->smokeClick(i);check(releaseNotesLastOpened_==expected[i],"Actual home card opens its own historical release");}
 releaseNotesVerify_=false;check(homeScrollPixels_==rightScroll,"Left news scroll must not scroll recent files");check(document.historyPosition()==before&&document.revision()==revision,"Home announcement browsing preserves project");refresh();homeAnnouncements_->setRelayoutEnabled(false);homeAnnouncements_->setBounds({original.x,original.y,120*uiScale,68*uiScale});homeAnnouncements_->configure(4*18+6);homeAnnouncements_->ensureVisible(2);invalidate();
}

}