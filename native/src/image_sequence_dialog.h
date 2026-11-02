#pragma once
#include "image_sequence_import.h"
#include "image_decode.h"
#include "native_widgets.h"
#include "ui/message.h"
#include "ui/manager.h"
#include "ui/message_loop.h"
#include "ui/resize_event.h"
#include "ui/timer.h"
#include <future>
namespace moon {
class ImageSequenceRows final:public ui::Widget{
 PixelScrollBar* bar_;std::vector<PixelSwitch*> rows_;int scroll_=0;
 void layout(){const auto r=bounds();const int step=(textControlHeight+UiSpacing::related)*uiScale,total=int(rows_.size())*step;scroll_=std::clamp(scroll_,0,std::max(0,total-r.h));bar_->setVisible(total>r.h);if(bar_->isVisible()){bar_->setBounds({r.x2()-7*uiScale,r.y,7*uiScale,r.h});bar_->configure(total,r.h,scroll_);}for(std::size_t i=0;i<rows_.size();++i){const int y=r.y+int(i)*step-scroll_;const bool shown=y>=r.y&&y+textControlHeight*uiScale<=r.y2();rows_[i]->setVisible(shown);if(shown)rows_[i]->setBounds({r.x,y,r.w-(bar_->isVisible()?9*uiScale:0),textControlHeight*uiScale});}}
public:
 ImageSequenceRows(const PixelFont& font,const Skin& skin,const std::vector<std::string>& paths):ui::Widget(ui::kGenericWidget){setTransparent(true);bar_=new PixelScrollBar(skin,true);addChild(bar_);bar_->changed=[this](int value){scroll_=value;layout();invalidate();};for(const auto& path:paths){auto row=new PixelSwitch(font,skin,unicodeText(std::filesystem::u8path(path).filename().u8string()),true,[](bool){});rows_.push_back(row);addChild(row);}}
 std::vector<std::size_t> selected()const{std::vector<std::size_t> result;for(std::size_t i=0;i<rows_.size();++i)if(rows_[i]->checked())result.push_back(i);return result;}
 void select(const std::vector<std::size_t>& indices){for(std::size_t i=0;i<rows_.size();++i)rows_[i]->setChecked(std::find(indices.begin(),indices.end(),i)!=indices.end());}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());layout();}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kMouseWheelMessage){scroll_+=static_cast<ui::MouseMessage*>(msg)->wheelDelta().y*(textControlHeight+UiSpacing::related)*uiScale*3;layout();invalidate();return true;}return ui::Widget::onProcessMessage(msg);}
};
// Legacy imageSequence AppDialog, using the shared native skin and controls.
class ImageSequenceDialog final:public PixelDialog{
 const PixelFont& font_;const Skin& skin_;std::size_t count_;image_sequence::Settings& settings_;image_sequence::Choice choice_=image_sequence::Choice::Cancel;
 ImageSequenceRows* rows_;PixelEntry* duration_;PixelSwitch *repeat_,*remember_;PixelButton *cancel_,*separate_,*animation_,*close_;
 void finish(image_sequence::Choice choice){choice_=choice;if(choice!=image_sequence::Choice::Cancel){try{settings_.duration=image_sequence::duration(std::stod(duration_->text()));}catch(const std::exception&){settings_.duration=100;}settings_.selected=rows_->selected();settings_.repeat=repeat_->checked();settings_.remember=remember_->checked();}closeWindow(nullptr);}
public:
 ImageSequenceDialog(const PixelFont& font,const Skin& skin,const Skin& icons,const std::vector<std::string>& paths,image_sequence::Settings& settings):PixelDialog(skin,""),font_(font),skin_(skin),count_(paths.size()),settings_(settings){
  setAutoRemap(false);setWantFocus(true);rows_=new ImageSequenceRows(font,skin,paths);addChild(rows_);
  duration_=new PixelEntry(font,skin);duration_->setText(std::to_string(image_sequence::duration(settings.duration)));duration_->numeric=true;duration_->numericMinimum=1;duration_->numericMaximum=60000;duration_->suffix=U"ms";duration_->numericValue=[this]{try{return double(image_sequence::duration(std::stod(duration_->text())));}catch(...){return 100.;}};duration_->cancel=[this]{finish(image_sequence::Choice::Cancel);};duration_->accept=[this]{finish(image_sequence::Choice::Animation);};addChild(duration_);
  repeat_=new PixelSwitch(font,skin,U"对其他文件执行相同操作",false,[](bool){});remember_=new PixelSwitch(font,skin,U"不再显示此提醒",false,[](bool){});addChild(repeat_);addChild(remember_);
  cancel_=new PixelButton(font,skin,U"取消",[this]{finish(image_sequence::Choice::Cancel);});separate_=new PixelButton(font,skin,U"分别打开",[this]{finish(image_sequence::Choice::Separate);});animation_=new PixelButton(font,skin,U"作为动画导入",[this]{finish(image_sequence::Choice::Animation);});close_=new PixelButton(font,skin,U"",[this]{finish(image_sequence::Choice::Cancel);});close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";for(auto b:{cancel_,separate_,animation_,close_})addChild(b);
 }
 image_sequence::Choice choice()const{return choice_;}
 gfx::Size minimumDialogSize(int)const override{const int rowsTop=DialogLayout::bodyTop+2*(UiSpacing::labelHeight+UiSpacing::related);const int rowsHeight=int(std::min<std::size_t>(count_,6))*DialogLayout::rowStep-UiSpacing::related;const int bodyBottom=rowsTop+rowsHeight+UiSpacing::group+UiSpacing::labelHeight+UiSpacing::related+3*textControlHeight+2*UiSpacing::related;return {std::max(300,font_.measure(U"要将以下 "+unicodeText(std::to_string(count_))+U" 个文件作为动画加载吗？")+2*DialogLayout::inset)*uiScale,DialogLayout::fit(bodyBottom)*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();const int footer=DialogLayout::footer(r.h/uiScale),rowsTop=DialogLayout::bodyTop+2*(UiSpacing::labelHeight+UiSpacing::related);const int durationLabel=footer-UiSpacing::group-3*(textControlHeight+UiSpacing::related)-UiSpacing::labelHeight;rows_->setBounds({r.x+6*uiScale,r.y+rowsTop*uiScale,r.w-12*uiScale,(durationLabel-UiSpacing::group-rowsTop)*uiScale});duration_->setBounds({r.x+6*uiScale,r.y+(durationLabel+12)*uiScale,88*uiScale,textControlHeight*uiScale});repeat_->setBounds({r.x+6*uiScale,duration_->bounds().y2()+2*uiScale,r.w-12*uiScale,textControlHeight*uiScale});remember_->setBounds({r.x+6*uiScale,repeat_->bounds().y2()+2*uiScale,r.w-12*uiScale,textControlHeight*uiScale});animation_->setBounds({r.x2()-132*uiScale,r.y+footer*uiScale,126*uiScale,textControlHeight*uiScale});separate_->setBounds({animation_->bounds().x-88*uiScale,animation_->bounds().y,86*uiScale,textControlHeight*uiScale});cancel_->setBounds({separate_->bounds().x-56*uiScale,animation_->bounds().y,54*uiScale,textControlHeight*uiScale});layoutHeaderButton(close_);}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"检测到图片序列");font_.draw(g,U"要将以下 "+unicodeText(std::to_string(count_))+U" 个文件作为动画加载吗？",r.x+6,r.y+DialogLayout::bodyTop,skin_["text"]);font_.draw(g,U"文件列表",r.x+6,r.y+DialogLayout::bodyTop+12,skin_["text"]);font_.draw(g,U"持续时间",r.x+6,(duration_->bounds().y-bounds().y)/uiScale-12+r.y,skin_["text"]);}
 bool onProcessMessage(ui::Message* msg)override{if(processDialogGeometry(msg))return true;if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){finish(image_sequence::Choice::Cancel);return true;}return PixelPopupWindow::onProcessMessage(msg);}
 void smoke(image_sequence::Choice choice,std::vector<std::size_t> selected,double duration=100,bool repeat=false,bool remember=false){rows_->select(selected);duration_->setText(std::to_string(duration));repeat_->setChecked(repeat);remember_->setChecked(remember);finish(choice);}
};
// Legacy awaits decode/composite; a native worker keeps the modal event loop
// responsive while preserving the same all-or-nothing document publication.
class DocumentLoadingDialog final:public PixelDialog {
 // The close guard outlives the visible progress popup. A hidden progress
 // window must not let OS shutdown destroy its caller while a read is pending.
 class CloseGuard final:public ui::Widget {
  bool requested_=false;std::function<void()> deferred_;CloseGuard* previous_;
  inline static CloseGuard* current_=nullptr;
 public:
  CloseGuard():ui::Widget(ui::kGenericWidget),previous_(current_){current_=this;ui::Manager::getDefault()->addMessageFilter(ui::kCloseDisplayMessage,this);}
  static bool defer(std::function<void()> action){if(!current_)return false;current_->deferred_=std::move(action);return true;}
  bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kCloseDisplayMessage&&msg->display()==ui::Manager::getDefault()->display()){requested_=true;return true;}return ui::Widget::onProcessMessage(msg);}
  ~CloseGuard(){auto* manager=ui::Manager::getDefault();manager->removeMessageFilter(ui::kCloseDisplayMessage,this);current_=previous_;if(previous_){previous_->requested_=previous_->requested_||requested_;if(deferred_)previous_->deferred_=std::move(deferred_);return;}if(deferred_){auto* callback=new ui::CallbackMessage(std::move(deferred_));callback->setRecipient(manager);manager->enqueueMessage(callback);}else if(requested_){auto* msg=new ui::Message(ui::kCloseDisplayMessage);msg->setDisplay(manager->display());msg->setRecipient(manager);msg->setPropagateToChildren(true);manager->enqueueMessage(msg);}}
 } closeGuard_;
 const PixelFont& font_;const Skin& skin_;std::u32string title_;std::future<Document> task_;ui::Timer timer_{20,this};PixelButton* close_;
public:
 DocumentLoadingDialog(const PixelFont& font,const Skin& skin,std::function<Document()> task,std::u32string title=U"图片序列",const Skin* icons=nullptr):DocumentLoadingDialog(font,skin,std::async(std::launch::async,std::move(task)),std::move(title),icons){}
 DocumentLoadingDialog(const PixelFont& font,const Skin& skin,std::future<Document> task,std::u32string title=U"图片序列",const Skin* icons=nullptr):PixelDialog(skin,""),font_(font),skin_(skin),title_(std::move(title)),task_(std::move(task)){
  setAutoRemap(false);
  close_=new PixelButton(font,skin,U"",[this]{dismiss();});close_->iconSkin=icons?icons:&skin;close_->icon="close";close_->skinStyle="icon_button";addChild(close_);
  timer_.Tick.connect([this]{if(task_.wait_for(std::chrono::seconds(0))==std::future_status::ready){if(isVisible())closeWindow(nullptr);}});timer_.start();
 }
 // setDisplay registers even a never-opened popup. LAF only detaches it in
 // _closeWindow when it was actually parented; fast-path suppression must
 // release that registration explicitly before the stack object disappears.
 ~DocumentLoadingDialog(){if(!parent())setDisplay(nullptr,false);}
 gfx::Size minimumDialogSize(int)const override{return {220*uiScale,(DialogLayout::bodyTop+UiSpacing::labelHeight+DialogLayout::inset)*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());layoutHeaderButton(close_);}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,title_);font_.draw(g,U"正在导入…",r.x+DialogLayout::inset,r.y+DialogLayout::bodyTop,skin_["text"]);}
 // Legacy openProgress.dismiss only hides the overlay; decoding still completes.
 static bool deferClose(std::function<void()> action){return CloseGuard::defer(std::move(action));}
 void dismiss(){closeWindow(nullptr);}
 bool onProcessMessage(ui::Message* msg)override{
  if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc)return true;
  return PixelDialog::onProcessMessage(msg);
 }
 Document run(const std::function<bool()>& canPublish={}){
  // Legacy schedules visible progress on requestAnimationFrame. Use one native
  // UI frame (16ms timer) and suppress it if the task has already completed.
  bool nextFrame=false;ui::Timer appearance(16,this);
  appearance.Tick.connect([&]{nextFrame=true;appearance.stop();});appearance.start();
  ui::MessageLoop loop(ui::Manager::getDefault());
  while(task_.wait_for(std::chrono::seconds(0))!=std::future_status::ready&&(!nextFrame||(canPublish&&!canPublish())))loop.pumpMessages();
  appearance.stop();
  if(task_.wait_for(std::chrono::seconds(0))!=std::future_status::ready)openWindowInForeground();
  return result(canPublish);
 }
 Document result(const std::function<bool()>& canPublish={}){
  // Continue the same LAF event pump after the foreground overlay is dismissed.
  // The stack-owned task and its caller stay alive; editing is now accessible.
  ui::MessageLoop loop(ui::Manager::getDefault());
  while(task_.wait_for(std::chrono::seconds(0))!=std::future_status::ready||(canPublish&&!canPublish()))loop.pumpMessages();
  timer_.stop();return task_.get();
 }
};
inline bool openImageSequenceDocuments(const PixelFont& font,const Skin& skin,const Skin& icons,ui::Display* display,const gfx::Rect& bounds,const std::filesystem::path& preference,const std::vector<std::string>& paths,image_sequence::Host host,const std::function<void(ImageSequenceDialog&)>& automate={},const std::function<bool()>& canPublish={}){
 host.read=[](const std::string& path){return openRasterImage(std::filesystem::u8path(path));};
 host.ask=[&](const auto& batch,auto& settings){ImageSequenceDialog dialog(font,skin,icons,batch,settings);dialog.setDisplay(display,false);const auto size=dialog.minimumDialogSize(bounds.w);dialog.setBounds({bounds.center().x-size.w/2,bounds.center().y-size.h/2,size.w,size.h});std::unique_ptr<ui::Timer> timer;if(automate){timer=std::make_unique<ui::Timer>(80,&dialog);timer->Tick.connect([&]{timer->stop();automate(dialog);});timer->start();}dialog.openWindowInForeground();return dialog.choice();};
 host.work=[&](std::function<Document()> task){DocumentLoadingDialog dialog(font,skin,std::move(task),U"图片序列",&icons);dialog.setDisplay(display,false);const auto size=dialog.minimumDialogSize(bounds.w);dialog.setBounds({bounds.center().x-size.w/2,bounds.center().y-size.h/2,size.w,size.h});return dialog.run(canPublish);};
 return image_sequence::open(paths,preference,host);
}
}
