#pragma once
#include "animation_transform.h"
#include "tween_easing_dialog.h"
#include "tween_path_editor.h"
#include "native_widgets.h"
#include "ui/popup_window.h"
#include "ui/resize_event.h"
#include "ui/message.h"
#include "ui/paint.h"
#include "ui/timer.h"
#include "ui/manager.h"
#include "os/os.h"
#include "os/surface.h"
#include "os/sampling.h"
#include <chrono>
#include <sstream>
namespace moon {
class CrossfadePreview final:public ui::Widget {
 const Skin& skin_;os::SurfaceRef image_;std::optional<TweenPath> path_;TweenPathPoint anchor_;int regionX_=0,regionY_=0;
public:
 gfx::Color checkerLight=0,checkerDark=0;int checkerSize=8;
private:
public:
 explicit CrossfadePreview(const Skin& skin):ui::Widget(ui::kGenericWidget),skin_(skin){setTransparent(true);checkerLight=skin["checkerA"];checkerDark=skin["checkerB"];}
 void setImage(int width,int height,const std::vector<timeline::Pixel>& pixels){
  auto image=os::instance()->makeRgbaSurface(width,height);if(!image||pixels.size()!=std::size_t(width)*height)throw std::runtime_error("Cannot create tween preview");
  {os::SurfaceLock lock(image.get());for(int y=0;y<height;++y)for(int x=0;x<width;++x){auto p=pixels[std::size_t(y)*width+x];image->putPixel(gfx::rgba(p&255,(p>>8)&255,(p>>16)&255,p>>24),x,y);}}
  image_=std::move(image);invalidate();
 }
 void setPath(std::optional<TweenPath> path,TweenPathPoint anchor,int x,int y){path_=std::move(path);anchor_=anchor;regionX_=x;regionY_=y;invalidate();}
 void clear(){image_.reset();invalidate();}
 void onPaint(ui::PaintEvent& ev)override{
  auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());g.fillRect(skin_["background"],r);skin_.draw(g,"panel_content",r);if(!image_)return;
  const double zoom=std::min(double(std::max(1,r.w-4))/image_->width(),double(std::max(1,r.h-4))/image_->height());
  const int w=std::max(1,int(std::floor(image_->width()*zoom))),h=std::max(1,int(std::floor(image_->height()*zoom)));gfx::Rect to(r.x+(r.w-w)/2,r.y+(r.h-h)/2,w,h);
  g.saveClip();g.clipRect(r);const int cell=std::max(1,int(std::floor(checkerSize*zoom)));for(int y=to.y;y<to.y2();y+=cell)for(int x=to.x;x<to.x2();x+=cell)g.fillRect(((x-to.x)/cell+(y-to.y)/cell)%2?checkerDark:checkerLight,gfx::Rect(x,y,std::min(cell,to.x2()-x),std::min(cell,to.y2()-y)));
  if(path_)drawTweenPathPixels(g,*path_,anchor_,to.x-regionX_*zoom,to.y-regionY_*zoom,zoom,r);
  ui::Paint over;over.blendMode(os::BlendMode::SrcOver);g.drawSurface(image_.get(),{0,0,image_->width(),image_->height()},to,os::Sampling(),&over);g.restoreClip();
 }
};
struct AnimationTweenDialogOptions : TransformTweenOptions {bool between=true;};
struct AnimationTweenDialogPreview {int width=1,height=1;std::vector<timeline::Pixel> pixels;int regionX=0,regionY=0;TweenPathPoint pathAnchor;};
class AnimationCrossfadeDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;const Skin& icons_;bool curveEditorOpen_=false;AnimationTweenDialogOptions options_;int step_=9;bool playing_=false,updating_=false;
 std::vector<std::pair<std::string,std::u32string>> loops_;
 PixelDropdown *kind_,*loop_,*scope_,*easing_,*mode_;PixelEntry* values_[11];CrossfadePreview* preview_;PixelSlider* progress_;PixelCheckbox* crop_;PixelButton *curveEdit_,*play_,*generate_,*cancel_,*close_;
 ui::Timer timer_;std::chrono::steady_clock::time_point started_;int startStep_=0;std::u32string error_;
 std::function<AnimationTweenDialogPreview(const AnimationTweenDialogOptions&,int)> previewFn_;std::function<bool(const AnimationTweenDialogOptions&)> generateFn_;

 PixelCheckbox* endpoint_=nullptr;bool endpointEnabled_=false,endpointFilters_=false,endpointDragging_=false;
 std::optional<TransformPoint> endpointStart_;double endpointStartX_=0,endpointStartY_=0;std::optional<TweenRegion> endpointBounds_;std::u32string endpointError_;
 std::function<std::optional<TweenRegion>(const AnimationTweenDialogOptions&,bool)> endpointPublish_;
 std::function<std::optional<TransformPoint>(gfx::Point,bool)> endpointPoint_;
 void publishEndpoint(){endpointBounds_.reset();endpointError_.clear();if(!endpointPublish_)return;try{endpointBounds_=endpointPublish_(options_,endpointEnabled_&&!options_.between&&!pathEditorOpen_);}catch(const std::exception& e){endpointPublish_(options_,false);endpointError_=unicodeText(e.what());}}
 void endpointFilters(bool enabled){if(endpointFilters_==enabled)return;endpointFilters_=enabled;auto manager=ui::Manager::getDefault();for(auto type:{ui::kMouseUpMessage,ui::kFocusLeaveMessage})if(enabled)manager->addMessageFilter(type,this);else manager->removeMessageFilter(type,this);}
 void finishEndpointDrag(bool cancel){if(!endpointDragging_)return;endpointDragging_=false;if(hasCapture())releaseMouse();const bool restore=cancel&&endpointStart_.has_value();endpointStart_.reset();if(restore){options_.offsetX=endpointStartX_;options_.offsetY=endpointStartY_;syncNumber(2);syncNumber(3);changed();}}
 void moveEndpoint(gfx::Point at){if(!endpointStart_||!endpointPoint_)return;auto p=endpointPoint_(at,false);if(!p)return;options_.offsetX=std::clamp(std::floor(endpointStartX_+p->x-endpointStart_->x+.5),-16384.,16384.);options_.offsetY=std::clamp(std::floor(endpointStartY_+p->y-endpointStart_->y+.5),-16384.,16384.);syncNumber(2);syncNumber(3);changed();}
 bool processEndpoint(ui::Message* msg){
  if(curveEditorOpen_||pathEditorOpen_)return false;if(endpointDragging_&&!hasCapture())finishEndpointDrag(true);
  if(msg->type()==ui::kFocusLeaveMessage){auto f=static_cast<ui::FocusMessage*>(msg);if(!f->newFocus()||f->newFocus()->window()!=this)finishEndpointDrag(true);return false;}
  if(msg->type()==ui::kCloseMessage||msg->type()==ui::kCloseDisplayMessage){finishEndpointDrag(true);if(endpointPublish_)endpointPublish_(options_,false);endpointBounds_.reset();return false;}
  if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc)finishEndpointDrag(true);
  auto m=dynamic_cast<ui::MouseMessage*>(msg);if(!m)return false;if(m->display()&&m->display()!=display()){if(endpointDragging_)finishEndpointDrag(true);return false;}
  if(endpointDragging_){if(msg->type()==ui::kMouseMoveMessage){moveEndpoint(m->position());return true;}if(msg->type()==ui::kMouseUpMessage){moveEndpoint(m->position());finishEndpointDrag(false);return true;}}
  if(!endpointEnabled_||options_.between||options_.path||!endpointBounds_||!endpointPoint_||bounds().contains(m->position()))return false;
  if(msg->type()==ui::kMouseDownMessage&&m->left()){const auto p=endpointPoint_(m->position(),true);if(!p)return false;requestFocus();if(!endpointBounds_)return true;endpointStartX_=options_.offsetX;endpointStartY_=options_.offsetY;const auto r=*endpointBounds_;const bool hit=p->x>=r.x&&p->y>=r.y&&p->x<double(r.x)+r.width&&p->y<double(r.y)+r.height;endpointStart_=hit?p:std::optional<TransformPoint>{};endpointDragging_=true;captureMouse();return true;}return false;
 }

 bool pathEditorOpen_=false;PixelDropdown* pathMode_=nullptr;PixelButton* pathEdit_=nullptr;std::optional<TweenPath> savedPath_;
 int pathDocumentWidth_=1,pathDocumentHeight_=1;
 using PathSourceFn=std::function<std::pair<TweenRegion,std::optional<timeline::Surface>>(const AnimationTweenDialogOptions&)>;
 PathSourceFn pathSource_;std::function<std::vector<TweenPathPreset>()> pathLoad_;std::function<std::vector<TweenPathPreset>(std::u32string,const TweenPath&)> pathSave_;
 void openPath(int verify=-1){if(options_.between||!pathSource_)return;finishEndpointDrag(true);stop();pathEditorOpen_=true;publishEndpoint();try{auto source=pathSource_(options_);TweenPathEditorDialog popup(font_,skin_,icons_,options_.path.value_or(TweenPath{{0,0}}),options_.pathAnchor,source.first,pathDocumentWidth_,pathDocumentHeight_,source.second,pathLoad_,pathSave_);popup.setCheckerboard(preview_->checkerLight,preview_->checkerDark,preview_->checkerSize);popup.setDisplay(display(),false);const auto r=bounds();popup.setBounds({r.x,r.y,550*uiScale,420*uiScale});ui::Timer timer(80,&popup);if(verify>=0){timer.Tick.connect([&]{timer.stop();popup.smoke(verify);});timer.start();}popup.openWindowInForeground();pathEditorOpen_=false;if(popup.result()){options_.path=popup.result()->path;options_.pathAnchor=popup.result()->anchor;savedPath_=options_.path;step_=steps();changed();}else publishEndpoint();requestFocus();}catch(const std::exception& e){pathEditorOpen_=false;error_=unicodeText(e.what());publishEndpoint();invalidate();}}
 int steps()const{return options_.frameCount+(options_.between?1:0);}
 double numeric(int i)const{switch(i){case 0:return options_.frameCount;case 1:return options_.duration;case 2:return options_.offsetX;case 3:return options_.offsetY;case 4:return options_.rotation;case 5:return options_.scale;case 6:return options_.opacity;default:return options_.curve[i-7];}}
 void syncNumber(int i){std::ostringstream out;out.precision(8);out<<numeric(i);values_[i]->setText(out.str());}
 void stop(){playing_=false;timer_.stop();play_->caption=U"播放";play_->invalidate();}
 void changed(){stop();progress_->maximum=steps();step_=std::clamp(step_,0,steps());progress_->value=step_;const bool custom=options_.easing==TweenEasing::Custom;for(int i=7;i<11;++i)values_[i]->setEnabled(custom);for(int i=2;i<7;++i)values_[i]->setVisible(!options_.between);mode_->setVisible(options_.between);loop_->setVisible(!options_.between&&options_.scope==TransformTweenScope::Loop);crop_->setEnabled(true);if(endpoint_)endpoint_->setVisible(!options_.between);if(pathMode_){pathMode_->setVisible(!options_.between);pathEdit_->setVisible(!options_.between&&options_.path.has_value());}values_[2]->setEnabled(!options_.path||options_.between);values_[3]->setEnabled(!options_.path||options_.between);render();}
 void commitNumber(int i){if(updating_)return;auto e=values_[i];try{if(!e->commitExpression())throw std::runtime_error("Invalid number");std::size_t used=0;double v=std::stod(e->text(),&used);if(used!=e->text().size()||!std::isfinite(v))throw std::runtime_error("Invalid number");double lo=0,hi=1;if(i==0){lo=1;hi=120;}else if(i==1){lo=1;hi=60000;}else if(i==2||i==3){lo=-16384;hi=16384;}else if(i==4){lo=-3600;hi=3600;}else if(i==5){lo=1;hi=1000;}else if(i==6){lo=0;hi=100;}v=std::clamp(v,lo,hi);if(i<7)v=std::floor(v+.5);switch(i){case 0:options_.frameCount=int(v);break;case 1:options_.duration=int(v);break;case 2:options_.offsetX=v;break;case 3:options_.offsetY=v;break;case 4:options_.rotation=v;break;case 5:options_.scale=v;break;case 6:options_.opacity=v;break;default:options_.curve[i-7]=v;}syncNumber(i);changed();}catch(...){syncNumber(i);}}
 void render(){try{auto p=previewFn_(options_,step_);preview_->setImage(p.width,p.height,p.pixels);preview_->setPath(!options_.between?options_.path:std::optional<TweenPath>{},p.pathAnchor,p.regionX,p.regionY);error_.clear();generate_->setEnabled(options_.between||!options_.path||tweenPathReady(*options_.path));}catch(const std::exception& e){preview_->clear();error_=unicodeText(e.what());generate_->setEnabled(false);}publishEndpoint();progress_->invalidate();invalidate();}
 void openCurve(int verify=-1){if(pathEditorOpen_)return;finishEndpointDrag(true);stop();curveEditorOpen_=true;TweenEasingDialog popup(font_,skin_,icons_,options_.easing,options_.curve,options_.frameCount);popup.setDisplay(display(),false);const auto r=bounds();popup.setBounds({r.x,r.y,280*uiScale,340*uiScale});ui::Timer timer(80,&popup);if(verify>=0){timer.Tick.connect([&]{timer.stop();popup.smoke(verify);});timer.start();}try{popup.openWindowInForeground();}catch(...){curveEditorOpen_=false;throw;}curveEditorOpen_=false;if(popup.result()){options_.easing=popup.result()->first;options_.curve=popup.result()->second;easing_->setSelectedIndex(int(options_.easing));changed();}requestFocus();}
 void generate(){if(pathEditorOpen_||curveEditorOpen_||(!options_.between&&options_.path&&!tweenPathReady(*options_.path)))return;for(int i=0;i<11;++i)if(values_[i]->hasFocus())commitNumber(i);stop();try{if(generateFn_(options_))closeWindow(nullptr);else{error_=U"无法生成补间帧";invalidate();}}catch(const std::exception& e){error_=unicodeText(e.what());invalidate();}}
public:
 AnimationCrossfadeDialog(const PixelFont& font,const Skin& skin,const Skin& icons,int duration,bool between,bool initialLoopScope,std::vector<std::pair<std::string,std::u32string>> loops,std::string initialLoop,std::function<AnimationTweenDialogPreview(const AnimationTweenDialogOptions&,int)> preview,std::function<bool(const AnimationTweenDialogOptions&)> generate):PixelDialog(skin,"",ui::PopupWindow::ClickBehavior::DoNothingOnClick),font_(font),skin_(skin),icons_(icons),loops_(std::move(loops)),timer_(16,this),previewFn_(std::move(preview)),generateFn_(std::move(generate)){
 options_.duration=duration;options_.between=between;options_.scope=initialLoopScope?TransformTweenScope::Loop:TransformTweenScope::Frame;options_.layerScope=TweenLayerScope::All;options_.loopSectionId=initialLoop;step_=steps();setAutoRemap(false);setWantFocus(true);setEnterBehavior(ui::PopupWindow::EnterBehavior::DoNothingOnEnter);
 auto button=[&](const char32_t* text,std::function<void()> action){auto b=new PixelButton(font,skin,text,std::move(action));addChild(b);return b;};
 kind_=new PixelDropdown(font,skin);addChild(kind_);kind_->setOptions({U"当前帧",U"循环节",U"相邻帧"});kind_->setSelectedIndex(options_.between?2:options_.scope==TransformTweenScope::Loop?1:0);kind_->changed=[this](int i){options_.between=i==2;options_.scope=i==1?TransformTweenScope::Loop:TransformTweenScope::Frame;step_=0;changed();};
 loop_=new PixelDropdown(font,skin);addChild(loop_);std::vector<std::u32string> names;int selectedLoop=0;for(std::size_t i=0;i<loops_.size();++i){names.push_back(loops_[i].second);if(loops_[i].first==initialLoop)selectedLoop=int(i);}if(names.empty())names.push_back(U"无循环节");else options_.loopSectionId=loops_[selectedLoop].first;loop_->setOptions(names);loop_->setSelectedIndex(selectedLoop);loop_->changed=[this](int i){if(i>=0&&i<int(loops_.size()))options_.loopSectionId=loops_[i].first;step_=0;changed();};
 mode_=new PixelDropdown(font,skin);addChild(mode_);mode_->setOptions({U"形变",U"交叉淡化"});mode_->setSelectedIndex(0);mode_->changed=[this](int i){options_.betweenMode=i?TweenBetweenMode::Crossfade:TweenBetweenMode::Morph;step_=0;changed();};
 scope_=new PixelDropdown(font,skin);addChild(scope_);scope_->setOptions({U"当前图层",U"所选图层",U"所有图层"});scope_->setSelectedIndex(2);scope_->changed=[this](int i){options_.layerScope=TweenLayerScope(i);step_=0;changed();};
 easing_=new PixelDropdown(font,skin);addChild(easing_);easing_->setOptions({U"线性",U"缓入",U"缓出",U"缓入缓出",U"自定义曲线"});easing_->setSelectedIndex(0);easing_->changed=[this](int i){options_.easing=TweenEasing(i);changed();};
 for(int i=0;i<11;++i){auto e=new PixelEntry(font,skin);values_[i]=e;e->numeric=true;e->numericStep=i<7?1:.01;addChild(e);syncNumber(i);e->accept=e->blur=[this,i]{commitNumber(i);};e->cancel=[this]{stop();closeWindow(nullptr);};e->wheel=[this,i](int delta){values_[i]->setText(std::to_string(numeric(i)+delta*(i<7?1:.01)));commitNumber(i);};}values_[1]->suffix=U"ms";values_[4]->suffix=U"°";values_[5]->suffix=U"%";values_[6]->suffix=U"%";
 curveEdit_=button(U"编辑曲线",[this]{openCurve();});for(int i=7;i<11;++i)values_[i]->setVisible(false);

 pathMode_=new PixelDropdown(font,skin);addChild(pathMode_);pathMode_->setOptions({U"直线位移",U"绘制路径"});pathMode_->setSelectedIndex(0);pathMode_->changed=[this](int i){stop();step_=0;if(options_.path)savedPath_=options_.path;options_.path=i?std::optional<TweenPath>{savedPath_.value_or(TweenPath{{0,0}})}:std::optional<TweenPath>{};changed();if(i)openPath();};pathEdit_=button(U"编辑路径",[this]{openPath();});
 crop_=new PixelCheckbox(font,skin,U"自动裁切画布",false,[this](bool checked){options_.autoCropCanvas=checked;changed();});addChild(crop_);
 endpoint_=new PixelCheckbox(font,skin,U"预览终点",false,[this](bool checked){finishEndpointDrag(true);endpointEnabled_=checked;publishEndpoint();invalidate();});addChild(endpoint_);
 preview_=new CrossfadePreview(skin);addChild(preview_);progress_=new PixelSlider(font,skin);progress_->minimum=0;progress_->maximum=steps();progress_->value=step_;progress_->percentage=false;progress_->numberSuffix=U"帧";progress_->changed=[this](int value){stop();step_=value;render();};addChild(progress_);
 play_=button(U"播放",[this]{if(playing_){stop();return;}if(step_>=steps())step_=0;progress_->value=step_;progress_->invalidate();startStep_=step_;started_=std::chrono::steady_clock::now();playing_=true;play_->caption=U"暂停";play_->invalidate();render();timer_.start();});
 generate_=button(U"生成",[this]{this->generate();});cancel_=button(U"取消",[this]{stop();closeWindow(nullptr);});close_=button(U"",[this]{stop();closeWindow(nullptr);});close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";
 timer_.Tick.connect([this]{const auto elapsed=std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-started_).count();const int next=std::min(steps(),startStep_+int(elapsed/options_.duration));if(next!=step_){step_=next;progress_->value=step_;render();}if(step_>=steps())stop();});changed();
 }
 void setPathCallbacks(int documentWidth,int documentHeight,PathSourceFn source,std::function<std::vector<TweenPathPreset>()> load,std::function<std::vector<TweenPathPreset>(std::u32string,const TweenPath&)> save){pathDocumentWidth_=documentWidth;pathDocumentHeight_=documentHeight;pathSource_=std::move(source);pathLoad_=std::move(load);pathSave_=std::move(save);}
 void setEndpointCallbacks(decltype(endpointPublish_) publish,decltype(endpointPoint_) point){endpointPublish_=std::move(publish);endpointPoint_=std::move(point);publishEndpoint();}
 const char* geometryCursor(gfx::Point p)const override{if(endpointDragging_&&endpointStart_)return "move";return PixelDialog::geometryCursor(p);}
 void setCheckerboard(gfx::Color light,gfx::Color dark,int size){preview_->checkerLight=light;preview_->checkerDark=dark;preview_->checkerSize=size;preview_->invalidate();}
 ~AnimationCrossfadeDialog(){finishEndpointDrag(true);endpointFilters(false);if(endpointPublish_)endpointPublish_(options_,false);timer_.stop();}
 void onResize(ui::ResizeEvent& ev)override{
  setBoundsQuietly(ev.bounds());const auto r=bounds();const int w=r.w/uiScale,h=r.h/uiScale;auto place=[&](ui::Widget* c,int x,int y,int cw,int ch=textControlHeight){c->setBounds(uiPhysical({x,y,cw,ch}).offset(r.origin()));};
  layoutHeaderButton(close_);const int rightWidth=w-68,pair=(rightWidth-2)/2;
  place(kind_,62,DialogLayout::row(0),rightWidth);place(loop_,62,DialogLayout::row(1),rightWidth);place(mode_,62,DialogLayout::row(1),rightWidth);place(scope_,62,DialogLayout::row(2),rightWidth);
  place(values_[0],62,DialogLayout::row(3),pair);place(values_[1],64+pair,DialogLayout::row(3),rightWidth-pair-2);place(easing_,62,DialogLayout::row(4),rightWidth);place(curveEdit_,62,DialogLayout::row(5),rightWidth);
  place(values_[2],62,175,pair);place(values_[3],64+pair,175,rightWidth-pair-2);for(int i=0;i<3;++i){const int left=6+(w-10)*i/3,right=6+(w-10)*(i+1)/3-2;place(values_[i+4],left,213,right-left);}
  place(pathMode_,6,239,w-84);place(pathEdit_,w-76,239,70);place(crop_,6,261,w-12);place(preview_,6,287,w-12,h-383);
  place(progress_,6,h-90,w-12);place(play_,6,h-68,58);place(endpoint_,66,h-68,w-72);place(cancel_,w-120,DialogLayout::footer(h),55);place(generate_,w-63,DialogLayout::footer(h),57);
 }
 gfx::Size minimumDialogSize(int)const override{int cell=0;for(int i=7;i<11;++i)cell=std::max(cell,values_[i]->widthForValue(U"-1.00"));return {std::max(240,4*cell+44)*uiScale,443*uiScale};}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());auto text=[&](std::u32string s,int x,int y){font_.draw(g,s,r.x+x,r.y+y,skin_["text"]);};drawDialogTitle(font_,g,r,U"生成补间帧");text(U"范围",6,32);if(options_.between)text(U"模式",6,54);else if(options_.scope==TransformTweenScope::Loop)text(U"循环节",6,54);text(U"图层",6,76);text(U"数量／时长",6,98);text(U"缓动",6,120);text(U"曲线",6,142);if(!options_.between){text(U"位移 X / Y",6,163);text(U"旋转 / 缩放 / 不透明度",6,201);}text(error_.empty()?(options_.between?U"生成结果可自动裁切画布":endpointError_.empty()?(endpointEnabled_?U"选择移动工具可拖动画布终点":U"终点预览只影响显示"):endpointError_):error_,6,r.h-42);}
 bool onProcessMessage(ui::Message* msg)override{if(pathEditorOpen_&&(dynamic_cast<ui::KeyMessage*>(msg)||dynamic_cast<ui::MouseMessage*>(msg)))return false;if(msg->type()==ui::kOpenMessage)endpointFilters(true);if(processEndpoint(msg))return true;if(msg->type()==ui::kCloseMessage)endpointFilters(false);if(msg->type()==ui::kKeyDownMessage){auto key=static_cast<ui::KeyMessage*>(msg)->scancode();if(key==ui::kKeyEsc){stop();closeWindow(nullptr);return true;}if(key==ui::kKeyEnter){generate();return true;}}if(msg->type()==ui::kCloseMessage)timer_.stop();return PixelPopupWindow::onProcessMessage(msg);}
 void smoke(bool commit){values_[0]->setText("1+1");commitNumber(0);values_[1]->setText("37");commitNumber(1);const auto before=options_.curve;const auto easingBefore=options_.easing;openCurve(0);if(options_.curve!=before||options_.easing!=easingBefore)throw std::runtime_error("Curve cancel modified parent");openCurve(2);if(options_.curve!=before||options_.easing!=easingBefore)throw std::runtime_error("Curve Escape modified parent");openCurve(1);scope_->setSelectedIndex(0,true);progress_->value=1;progress_->changed(1);play_->Click();if(!playing_)throw std::runtime_error("Tween play control");started_-=std::chrono::milliseconds(options_.duration);timer_.Tick();if(step_!=2)throw std::runtime_error("Tween duration playback");progress_->changed(0);if(playing_||step_!=0)throw std::runtime_error("Tween seeking must pause");progress_->value=steps();progress_->changed(steps());play_->Click();if(!playing_||step_!=0)throw std::runtime_error("Tween endpoint restart");play_->Click();if(playing_)throw std::runtime_error("Tween pause control");if(options_.frameCount!=2||options_.duration!=37||options_.curve[0]!=.25||options_.layerScope!=TweenLayerScope::Current||!error_.empty())throw std::runtime_error("Tween dialog inputs/preview");if(commit)generate();else{ui::KeyMessage esc(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&esc);}}

 void smokeEndpoint(gfx::Point origin,double scale,bool commit,const std::function<void(int)>& check){
  kind_->setSelectedIndex(0,true);scope_->setSelectedIndex(0,true);values_[0]->setText("2");commitNumber(0);for(int i:{2,3,4}){values_[i]->setText("0");commitNumber(i);}values_[5]->setText("100");commitNumber(5);values_[6]->setText("100");commitNumber(6);
  auto require=[](bool ok,const char* m){if(!ok)throw std::runtime_error(m);};auto point=[&](double x,double y){return origin+gfx::Point(int(std::floor(x*scale+.5)),int(std::floor(y*scale+.5)));};auto send=[&](ui::MessageType type,gfx::Point p,ui::MouseButton button=ui::kButtonLeft){ui::MouseMessage m(type,os::PointerType::Mouse,button,ui::kKeyNoneModifier,p);m.setDisplay(display());m.setFromFilter(true);onProcessMessage(&m);};
  require(!endpointEnabled_&&!endpointBounds_,"Endpoint default off");endpoint_->Click();require(endpointBounds_.has_value(),"Endpoint publish");check(0);auto b=*endpointBounds_;const auto hit=point(b.x+.5,b.y+.5),miss=point(b.x-2,b.y-2);require(!bounds().contains(hit)&&!bounds().contains(miss),"Endpoint smoke obscured by popup");
  send(ui::kMouseDownMessage,miss);require(endpointDragging_&&hasCapture()&&!endpointStart_,"Endpoint miss capture");send(ui::kMouseMoveMessage,hit);send(ui::kMouseUpMessage,hit);require(!hasCapture()&&options_.offsetX==0&&options_.offsetY==0,"Endpoint miss moved source");check(1);
  send(ui::kMouseDownMessage,hit);require(endpointDragging_&&endpointStart_&&hasCapture(),"Endpoint hit");send(ui::kMouseMoveMessage,hit+gfx::Point(int(3*scale),int(-2*scale)));require(options_.offsetX==3&&options_.offsetY==-2,"Endpoint pixel drag");check(2);
  ui::FocusMessage blur(ui::kFocusLeaveMessage,this,nullptr);blur.setFromFilter(true);onProcessMessage(&blur);require(!hasCapture()&&!endpointDragging_&&options_.offsetX==0&&options_.offsetY==0,"Endpoint blur cancel");check(3);
  send(ui::kMouseDownMessage,hit);send(ui::kMouseUpMessage,hit+gfx::Point(int(2*scale),int(scale)));require(!hasCapture()&&options_.offsetX==2&&options_.offsetY==1,"Endpoint mouse-up final");check(4);auto imageBounds=endpointBounds_;progress_->value=0;progress_->changed(0);require(endpointBounds_&&imageBounds&&endpointBounds_->x==imageBounds->x&&endpointBounds_->y==imageBounds->y,"Endpoint scrub independence");check(5);
  const auto curveBefore=options_.curve;openCurve(2);require(options_.curve==curveBefore&&endpointBounds_,"Endpoint nested curve Escape");
  endpoint_->Click();require(!endpointEnabled_&&!endpointBounds_,"Endpoint disable");check(6);endpoint_->Click();require(endpointBounds_.has_value(),"Endpoint reenable");check(7);if(commit)generate();else{ui::KeyMessage esc(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&esc);}
 }

 void smokePath(bool commit){kind_->setSelectedIndex(0,true);scope_->setSelectedIndex(0,true);values_[0]->setText("2");commitNumber(0);pathMode_->setSelectedIndex(1);options_.path=TweenPath{{0,0}};step_=0;changed();const auto unready=options_.path;openPath(0);if(!options_.path||!tweenPathEqual(*options_.path,*unready))throw std::runtime_error("Path cancel changed parent draft");openPath(2);if(!options_.path||!tweenPathEqual(*options_.path,*unready))throw std::runtime_error("Path Escape changed parent draft");openPath(1);if(!options_.path||!tweenPathReady(*options_.path)||!options_.pathAnchor||step_!=steps()||values_[2]->isEnabled()||values_[3]->isEnabled()||!error_.empty())throw std::runtime_error("Path apply must update parent and disable linear offsets");const auto applied=*options_.path;pathMode_->setSelectedIndex(0,true);if(options_.path)throw std::runtime_error("Linear mode retained effective path");pathMode_->setSelectedIndex(1);options_.path=savedPath_;changed();if(!options_.path||!tweenPathEqual(applied,*options_.path))throw std::runtime_error("Drawn mode must remember path");if(commit)generate();else cancel_->Click();}
 void smokeBetweenCrop(bool commit,bool morph){kind_->setSelectedIndex(2,true);mode_->setSelectedIndex(morph?0:1,true);scope_->setSelectedIndex(0,true);values_[0]->setText("2");commitNumber(0);crop_->setChecked(true);options_.autoCropCanvas=true;changed();if(!error_.empty())throw std::runtime_error("Between crop preview");if(commit)generate();else cancel_->Click();}
 void smokeTransform(bool commit,bool loop){kind_->setSelectedIndex(loop?1:0,true);values_[2]->setText("-2");commitNumber(2);values_[3]->setText("1");commitNumber(3);values_[4]->setText("90");commitNumber(4);values_[5]->setText("100");commitNumber(5);values_[6]->setText("50");commitNumber(6);crop_->setChecked(true);options_.autoCropCanvas=true;changed();if(options_.between||options_.scope!=(loop?TransformTweenScope::Loop:TransformTweenScope::Frame)||options_.offsetX!=-2||options_.offsetY!=1||options_.rotation!=90||options_.opacity!=50||!error_.empty())throw std::runtime_error("Transform dialog inputs/preview");smoke(commit);}
};

}