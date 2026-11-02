#pragma once
#include "native_widgets.h"
#include "canvas_renderer.h"
#include "timelapse_images.h"
#include "ui/resize_event.h"
#include "ui/message.h"
#include "ui/timer.h"
#include <future>
#include <list>
namespace moon {
class TimelapsePreview final:public ui::Widget {
 const Skin& skin_;os::SurfaceRef surface_;int w_=0,h_=0;
public:
 CheckerboardSettings checkerboard;
 explicit TimelapsePreview(const Skin& s):ui::Widget(ui::kGenericWidget),skin_(s){setTransparent(false);}
 void show(const timelapse::Image& image){w_=image.width;h_=image.height;surface_=os::instance()->makeRgbaSurface(w_,h_);if(!surface_)throw std::runtime_error("Cannot allocate recording preview");uploadRgbaRegion(*surface_,image.pixels.data(),w_,h_,w_);invalidate();}
 void clear(){surface_.reset();w_=h_=0;invalidate();}
 void onPaint(ui::PaintEvent& ev)override{auto& g=*ev.graphics();const auto r=clientBounds();g.fillRect(skin_["background"],r);if(!surface_)return;const double scale=std::min(double(r.w)/w_,double(r.h)/h_);const int width=std::max(1,int(w_*scale)),height=std::max(1,int(h_*scale));gfx::Rect to{r.x+(r.w-width)/2,r.y+(r.h-height)/2,width,height};g.saveClip();g.clipRect(to);const int cell=8*uiScale;for(int y=to.y;y<to.y2();y+=cell)for(int x=to.x;x<to.x2();x+=cell)g.fillRect(((x-to.x)/cell+(y-to.y)/cell)%2?checkerboard.dark:checkerboard.light,{x,y,cell,cell});ui::Paint over;over.blendMode(os::BlendMode::SrcOver);g.drawSurface(surface_.get(),{0,0,w_,h_},to,os::Sampling(os::Sampling::Filter::Nearest),&over);g.restoreClip();}
};
struct TimelapsePreviewCheck;
class TimelapseClearDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;PixelButton *cancel_,*clear_,*close_;
 std::vector<std::u32string> lines(int width)const{const std::u32string text=U"清空当前工程的全部缩时记录？此操作不能撤销，不影响画作，也不会删除本地录像库中的数据或释放其磁盘空间。";std::vector<std::u32string> out;std::u32string line;for(auto c:text){if(!line.empty()&&font_.measure(line+c)>std::max(1,width-2*DialogLayout::inset)){out.push_back(line);line.clear();}line+=c;}if(!line.empty())out.push_back(line);return out;}
public:
 bool confirmed=false;
 TimelapseClearDialog(const PixelFont& f,const Skin& s,const Skin& icons):PixelDialog(s,"",ui::PopupWindow::ClickBehavior::DoNothingOnClick),font_(f),skin_(s){setAutoRemap(false);setWantFocus(true);setEnterBehavior(ui::PopupWindow::EnterBehavior::DoNothingOnEnter);cancel_=new PixelButton(f,s,U"取消",[this]{closeWindow(nullptr);});clear_=new PixelButton(f,s,U"确认清空",[this]{confirmed=true;closeWindow(nullptr);});close_=new PixelButton(f,s,U"",[this]{closeWindow(nullptr);});close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";for(auto w:{cancel_,clear_,close_})addChild(w);}
 gfx::Size minimumDialogSize(int width)const override{const int w=std::max(360,width/uiScale);return {360*uiScale,DialogLayout::fit(DialogLayout::bodyTop+int(lines(w).size())*(UiSpacing::labelHeight+DialogLayout::gap)-DialogLayout::gap)*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();layoutHeaderButton(close_);clear_->setBounds({r.x2()-78*uiScale,r.y+DialogLayout::footer(r.h/uiScale)*uiScale,72*uiScale,textControlHeight*uiScale});cancel_->setBounds({clear_->bounds().x-58*uiScale,clear_->bounds().y,56*uiScale,textControlHeight*uiScale});}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"清空当前工程记录");int y=DialogLayout::bodyTop;for(const auto& line:lines(r.w)){font_.draw(g,line,DialogLayout::inset,y,skin_["text"]);y+=UiSpacing::labelHeight+DialogLayout::gap;}}
 bool onProcessMessage(ui::Message* msg)override{if(processDialogGeometry(msg))return true;if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){closeWindow(nullptr);return true;}return PixelPopupWindow::onProcessMessage(msg);}
};
class TimelapseDialog final:public PixelDialog {
 friend struct TimelapsePreviewCheck;
 const PixelFont& font_;const Skin& skin_;const Skin& icons_;timelapse::Settings& settings_;timelapse::Reader read_;std::function<void()> changed_,clear_,export_;PixelSwitch *enabled_,*undo_;PixelDropdown* mode_;PixelButton *close_,*done_,*clearButton_,*exportButton_,*play_;PixelSlider* seek_;TimelapsePreview* preview_;ui::Timer timer_{16,this};std::future<timelapse::Image> loading_;std::string requested_,shown_;std::size_t frame_=0,start_=0;bool playing_=false;std::chrono::steady_clock::time_point started_;std::u32string error_;
 struct Cached {std::string id;timelapse::Image image;};std::list<Cached> cache_;std::uint64_t loadGeneration_=0,requestedGeneration_=0;std::size_t observedCount_=0;std::string selectedId_;
 void stopPlayback(){playing_=false;play_->icon="playback-play";play_->invalidate();}
 void clearAccepted(){++loadGeneration_;cache_.clear();if(clear_)clear_();preview_->clear();shown_.clear();error_.clear();sync();}
 void requestClear(){stopPlayback();select(0);TimelapseClearDialog popup(font_,skin_,icons_);popup.setDisplay(display(),false);const auto size=popup.minimumDialogSize(0);const auto r=bounds();popup.setBounds({r.center().x-size.w/2,r.center().y-size.h/2,size.w,size.h});popup.openWindowInForeground();if(popup.confirmed)clearAccepted();requestFocus();}
 void select(std::size_t n){const auto next=settings_.snapshots.empty()?0:std::min(n,settings_.snapshots.size()-1);const auto id=settings_.snapshots.empty()?std::string{}:settings_.snapshots[next].id;if(next!=frame_||id!=selectedId_){++loadGeneration_;error_.clear();}frame_=next;selectedId_=id;seek_->value=int(frame_);seek_->invalidate();invalidate();}
 void toggle(){if(settings_.snapshots.size()<2)return;playing_=!playing_;if(playing_){if(frame_+1>=settings_.snapshots.size())select(0);start_=frame_;started_=std::chrono::steady_clock::now();}play_->icon=playing_?"playback-pause":"playback-play";play_->invalidate();}
 void tick(){
  if(observedCount_!=settings_.snapshots.size())sync();
  const auto selected=settings_.snapshots.empty()?std::string{}:settings_.snapshots[std::min(frame_,settings_.snapshots.size()-1)].id;
  if(selected!=selectedId_){selectedId_=selected;++loadGeneration_;error_.clear();}
  if(loading_.valid()&&loading_.wait_for(std::chrono::milliseconds(0))==std::future_status::ready){
   try{
    auto image=loading_.get();
    if(requestedGeneration_==loadGeneration_){
     cache_.remove_if([&](const auto& c){return c.id==requested_;});cache_.push_front({requested_,std::move(image)});while(cache_.size()>8)cache_.pop_back();
     if(frame_<settings_.snapshots.size()&&requested_==settings_.snapshots[frame_].id){preview_->show(cache_.front().image);shown_=requested_;error_.clear();}
    }
   }catch(const std::exception& e){if(requestedGeneration_==loadGeneration_){stopPlayback();shown_=requested_;error_=unicodeText(e.what());preview_->clear();}}
   invalidate();
  }
  if(settings_.snapshots.empty()){stopPlayback();shown_.clear();error_.clear();preview_->clear();return;}
  if(playing_){const double elapsed=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-started_).count();const auto next=start_+std::size_t(elapsed/timelapse::previewHoldMs(settings_));select(std::min(next,settings_.snapshots.size()-1));if(next>=settings_.snapshots.size())stopPlayback();}
  const auto next=std::min(frame_,settings_.snapshots.size()-1);if(next!=frame_)select(next);
  const auto& f=settings_.snapshots[frame_];
  if(shown_==f.id)return;
  auto cached=std::find_if(cache_.begin(),cache_.end(),[&](const auto& c){return c.id==f.id;});
  if(cached!=cache_.end()){preview_->show(cached->image);shown_=f.id;error_.clear();cache_.splice(cache_.begin(),cache_,cached);return;}
  if(!loading_.valid()){requested_=f.id;requestedGeneration_=loadGeneration_;auto frame=f;auto reader=read_;loading_=std::async(std::launch::async,[frame=std::move(frame),reader]{auto image=timelapse::decodeRecordingPng(reader(frame));if(image.width!=frame.width||image.height!=frame.height)throw std::runtime_error("Recording dimensions mismatch");return image;});}
 }
public:
 TimelapseDialog(const PixelFont& f,const Skin& s,const Skin& icons,timelapse::Settings& settings,timelapse::Reader reader,std::function<void()> changed,std::function<void()> clear,std::function<void()> exportAction):PixelDialog(s,"",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow),font_(f),skin_(s),icons_(icons),settings_(settings),read_(std::move(reader)),changed_(std::move(changed)),clear_(std::move(clear)),export_(std::move(exportAction)){
  setAutoRemap(false);setWantFocus(true);setEnterBehavior(ui::PopupWindow::EnterBehavior::DoNothingOnEnter);auto button=[&](std::u32string label,std::function<void()> cb){auto b=new PixelButton(f,s,std::move(label),std::move(cb));addChild(b);return b;};
  preview_=new TimelapsePreview(s);addChild(preview_);play_=button(U"",[this]{toggle();});play_->iconSkin=&icons;play_->icon="playback-play";play_->skinStyle="icon_button";seek_=new PixelSlider(f,s);seek_->minimum=0;seek_->maximum=std::max(0,int(settings.snapshots.size())-1);seek_->changed=[this](int n){stopPlayback();select(std::size_t(n));};addChild(seek_);
  enabled_=new PixelSwitch(f,s,U"记录绘画过程",settings.enabled,[this](bool v){settings_.enabled=v;if(changed_)changed_();});addChild(enabled_);undo_=new PixelSwitch(f,s,U"记录撤销步骤",settings.recordUndoSteps,[this](bool v){settings_.recordUndoSteps=v;if(changed_)changed_();});addChild(undo_);mode_=new PixelDropdown(f,s);mode_->setOptions({U"完整记录",U"智能采样"});mode_->setSelectedIndex(settings.mode==timelapse::Mode::Full?0:1);mode_->changed=[this](int i){settings_.mode=i?timelapse::Mode::Smart:timelapse::Mode::Full;if(changed_)changed_();};addChild(mode_);
  clearButton_=button(U"清空当前工程记录",[this]{requestClear();});clearButton_->iconSkin=&icons;clearButton_->icon="clearRecords";clearButton_->iconWithCaption=true;
  exportButton_=button(U"导出",[this]{stopPlayback();if(export_)export_();});done_=button(U"关闭",[this]{closeWindow(nullptr);});close_=button(U"",[this]{closeWindow(nullptr);});close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";timer_.Tick.connect([this]{tick();});timer_.start();sync();
 }
 ~TimelapseDialog(){timer_.stop();if(loading_.valid())loading_.wait();}
 void sync(){observedCount_=settings_.snapshots.size();enabled_->setChecked(settings_.enabled);undo_->setChecked(settings_.recordUndoSteps);mode_->setSelectedIndex(settings_.mode==timelapse::Mode::Full?0:1);play_->setEnabled(settings_.snapshots.size()>1);clearButton_->setEnabled(!settings_.snapshots.empty());exportButton_->setEnabled(!settings_.snapshots.empty());seek_->maximum=std::max(0,int(settings_.snapshots.size())-1);seek_->setEnabled(!settings_.snapshots.empty());invalidate();}
 void setPreviewCheckerboard(const CheckerboardSettings& value){preview_->checkerboard=value;preview_->invalidate();}
 void setError(std::u32string value){error_=std::move(value);invalidate();}
 gfx::Size minimumDialogSize(int)const override{return {420*uiScale,420*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();const int w=r.w/uiScale,h=r.h/uiScale;auto place=[&](ui::Widget* c,gfx::Rect box){c->setBounds(uiPhysical(box).offset(r.origin()));};layoutHeaderButton(close_);const int previewHeight=std::max(80,h-279);place(preview_,{6,DialogLayout::bodyTop,w-12,previewHeight});const int y=DialogLayout::bodyTop+previewHeight+2;place(play_,{6,y,15,15});place(seek_,{23,y,w-29,15});place(enabled_,{6,y+21,w-12,20});place(mode_,{92,y+69,w-98,20});place(undo_,{6,y+95,w-12,20});const int footer=DialogLayout::footer(h);place(clearButton_,{6,footer,std::max(86,font_.measure(clearButton_->caption)+30),20});place(done_,{w-120,footer,55,20});place(exportButton_,{w-63,footer,57,20});}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"缩时视频");const int y=DialogLayout::bodyTop+std::max(80,r.h-279)+2;font_.draw(g,U"录像保存在本机录像库，占用磁盘空间。",6,y+47,skin_["muted"]);font_.draw(g,U"记录模式",6,y+74,skin_["text"]);font_.draw(g,U"已捕获帧："+unicodeText(std::to_string(settings_.snapshots.size())),6,y+121,skin_["text"]);font_.draw(g,error_,6,DialogLayout::footer(r.h)-16,skin_["text"]);}
 bool onProcessMessage(ui::Message* msg)override{if(processDialogGeometry(msg))return true;if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){closeWindow(nullptr);return true;}return PixelPopupWindow::onProcessMessage(msg);}
};
}
