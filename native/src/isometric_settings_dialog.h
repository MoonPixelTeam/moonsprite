#pragma once
#include "isometric_settings.h"
#include "native_widgets.h"
#include "color_editor_popup.h"
#include "modal_geometry_preferences.h"
#include "ui/message.h"
#include "ui/resize_event.h"
#include "ui/close_event.h"
#include "ui/tooltips.h"
namespace moon {
class IsometricSettingsDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;const Skin& icons_;iso::Settings baseline_,draft_;
 std::function<void(iso::Settings)> preview_,apply_;bool live_=true,settled_=false,syncing_=false;
 std::array<PixelEntry*,5> fields_{};std::array<PixelButton*,2> styles_{};
 PixelButton *color_,*close_,*cancel_,*done_;PixelCheckbox *alignment_,*snap_;PixelSwitch* liveControl_;
 std::unique_ptr<ColorEditorPopup> colorPopup_;std::filesystem::path colorStorage_;std::vector<std::uint32_t> palette_;std::u32string error_;
 std::unique_ptr<ModalGeometryPreferences> geometry_;ui::Timer geometryTimer_{30,this};bool placing_=false;ui::TooltipManager* tips_;
 void rememberGeometry(){if(geometry_&&display())geometry_->remember(bounds(),display()->bounds());}
 void pumpGeometry(){if(!geometry_)return;if(!manager()->getCapture())rememberGeometry();geometry_->pump();if(!geometry_->error().empty()){error_=unicodeText(geometry_->error());invalidate();}}
 static constexpr int contentBottom=DialogLayout::row(8)+10;
 double& number(int i){return i==0?draft_.stairStep:i==1?draft_.originX:i==2?draft_.originY:i==3?draft_.unitSize:draft_.thickness;}
 void sync(){syncing_=true;for(int i=0;i<5;++i)if(!fields_[i]->hasFocus())fields_[i]->setText(iso::detail::number(number(i)));for(int i=0;i<2;++i){styles_[i]->active=draft_.pixel==(i==1);styles_[i]->invalidate();}fields_[4]->setEnabled(!draft_.pixel);color_->swatch=draft_.color();color_->invalidate();alignment_->setChecked(draft_.forceLineAlignment);snap_->setChecked(draft_.snapToGrid);liveControl_->setChecked(live_);syncing_=false;invalidate();}
 void changed(){draft_=iso::normalize(draft_);error_.clear();tips_->addTooltipFor(alignment_,"直线工具以及铅笔、橡皮擦的拖动画线和直线连接只绘制水平、垂直或 "+iso::detail::number(draft_.stairStep)+":1 阶梯线。");sync();if(live_)preview_(draft_);}
 void read(int i){if(syncing_)return;try{std::size_t used=0;const auto n=std::stod(fields_[i]->text(),&used);if(used!=fields_[i]->text().size()||!std::isfinite(n))return;number(i)=n;changed();}catch(const std::invalid_argument&){}catch(const std::out_of_range&){} }
 void cancel(){if(colorPopup_)colorPopup_->closeWindow(nullptr);if(!settled_){settled_=true;preview_(baseline_);}closeWindow(nullptr);}
 void done(){for(int i=0;i<5;++i)read(i);if(colorPopup_)colorPopup_->closeWindow(nullptr);try{apply_(draft_);settled_=true;closeWindow(nullptr);}catch(const std::exception& e){error_=unicodeText(e.what());invalidate();}}
 PixelButton* button(std::u32string text,std::function<void()> fn){auto b=new PixelButton(font_,skin_,std::move(text),std::move(fn));addChild(b);return b;}
public:
 IsometricSettingsDialog(const PixelFont& f,const Skin& s,const Skin& icons,iso::Settings initial,std::filesystem::path colorStorage,std::vector<std::uint32_t> palette,std::function<void(iso::Settings)> preview,std::function<void(iso::Settings)> apply)
 :PixelDialog(s,"",ClickBehavior::DoNothingOnClick,EnterBehavior::DoNothingOnEnter),font_(f),skin_(s),icons_(icons),baseline_(initial),draft_(initial),preview_(std::move(preview)),apply_(std::move(apply)),colorStorage_(std::move(colorStorage)),palette_(std::move(palette)){
  setAutoRemap(false);setWantFocus(true);tips_=new ui::TooltipManager;addChild(tips_);
  for(int i=0;i<5;++i){auto e=fields_[i]=new PixelEntry(f,s);addChild(e);e->numeric=true;e->numericStep=1;e->suffix=i==0?U":1":U"px";e->Change.connect([this,i]{read(i);});e->blur=[this,i]{read(i);fields_[i]->setText(iso::detail::number(number(i)));};e->accept=[this]{done();};e->cancel=[this]{cancel();};e->wheel=[this,i](int delta){read(i);number(i)+=delta;changed();fields_[i]->setText(iso::detail::number(number(i)));};}
  fields_[0]->numericMinimum=fields_[3]->numericMinimum=fields_[4]->numericMinimum=1;fields_[0]->numericMaximum=16;fields_[3]->numericMaximum=256;fields_[4]->numericMaximum=8;
  styles_[0]=button(U"实线",[this]{if(colorPopup_)colorPopup_->closeWindow(nullptr);draft_.pixel=false;changed();});styles_[1]=button(U"像素线条",[this]{if(colorPopup_)colorPopup_->closeWindow(nullptr);draft_.pixel=true;changed();});
  color_=button(U"",[this]{if(colorPopup_)colorPopup_->closeWindow(nullptr);auto storage=colorStorage_;storage.replace_filename(storage.stem().wstring()+(draft_.pixel?L"-pixel":L"-solid")+storage.extension().wstring());colorPopup_=std::make_unique<ColorEditorPopup>(font_,skin_,icons_,storage);colorPopup_->setDisplay(display(),false);const bool pixel=draft_.pixel;colorPopup_->open(color_->bounds(),display()->bounds(),draft_.color(),U"网格颜色",palette_,[this,pixel](std::uint32_t c){(pixel?draft_.pixelColor:draft_.solidColor)=c;changed();},{});});color_->paletteCell=true;
  alignment_=new PixelCheckbox(f,s,U"强制线条对齐",draft_.forceLineAlignment,[this](bool v){draft_.forceLineAlignment=v;changed();});addChild(alignment_);
  snap_=new PixelCheckbox(f,s,U"吸附网格",draft_.snapToGrid,[this](bool v){draft_.snapToGrid=v;changed();});addChild(snap_);
  liveControl_=new PixelSwitch(f,s,U"实时预览",true,[this](bool v){live_=v;preview_(live_?draft_:baseline_);sync();});liveControl_->iconSkin=&icons_;liveControl_->icon="eye";addChild(liveControl_);
  close_=button(U"",[this]{cancel();});close_->iconSkin=&icons_;close_->icon="close";close_->skinStyle="icon_button";cancel_=button(U"取消",[this]{cancel();});done_=button(U"完成",[this]{done();});sync();
  tips_->addTooltipFor(fields_[0],"控制斜向线每一级阶梯连续绘制的水平像素数。2 表示每移动 1 个纵向像素，连续绘制 2 个横向像素。");
  tips_->addTooltipFor(fields_[1],"网格 X 位置");tips_->addTooltipFor(fields_[2],"网格 Y 位置");
  tips_->addTooltipFor(alignment_,"直线工具以及铅笔、橡皮擦的拖动画线和直线连接只绘制水平、垂直或 "+iso::detail::number(draft_.stairStep)+":1 阶梯线。");
  tips_->addTooltipFor(snap_,"开启后，直线工具以及铅笔、橡皮擦会从最近的网格交点开始，沿当前网格边绘制；到达下一个交点后才会转向。");
 }
 ~IsometricSettingsDialog(){geometryTimer_.stop();if(colorPopup_)colorPopup_->closeWindow(nullptr);if(!settled_)preview_(baseline_);if(!parent())setDisplay(nullptr,false);}
 void configureGeometry(std::filesystem::path path){geometry_=std::make_unique<ModalGeometryPreferences>(std::move(path),"iso-view-settings-v4");placing_=true;setBounds(geometry_->restore(bounds(),display()->bounds(),minimumDialogSize(0),{520*uiScale,520*uiScale}));placing_=false;rememberGeometry();geometryTimer_.Tick.connect([this]{pumpGeometry();});geometryTimer_.start();}
 void onBeforeClose(ui::CloseEvent& ev)override{geometryTimer_.stop();rememberGeometry();if(geometry_)geometry_->flush();if(!settled_){if(colorPopup_)colorPopup_->closeWindow(nullptr);settled_=true;preview_(baseline_);}PixelDialog::onBeforeClose(ev);}
 int preferredHeight()const{return DialogLayout::fit(contentBottom);}
 gfx::Size minimumDialogSize(int)const override{return {minimumWidth()*uiScale,preferredHeight()*uiScale};}
 int minimumWidth()const{return std::max(310,12+font_.measure(U"网格单位尺寸")+6+2*(fields_[1]->widthForValue(U"-999999")+12)+2);}
 void onResize(ui::ResizeEvent& ev)override{if(geometry_&&!placing_&&ev.bounds().size()!=bounds().size())geometry_->resized();setBoundsQuietly(ev.bounds());const auto r=bounds();const int w=r.w/uiScale,h=r.h/uiScale,x=6+font_.measure(U"网格单位尺寸")+6,right=w-6,fieldWidth=right-x;auto place=[&](ui::Widget* c,int px,int y,int width){c->setBounds({r.x+px*uiScale,r.y+y*uiScale,width*uiScale,textControlHeight*uiScale});};
  layoutHeaderButton(close_);place(fields_[0],x,DialogLayout::row(0),fieldWidth);const int first=(fieldWidth+1)/2;place(styles_[0],x,DialogLayout::row(1),first);place(styles_[1],x+first-1,DialogLayout::row(1),fieldWidth-first+1);
  const int half=(fieldWidth-2)/2;place(fields_[1],x+12,DialogLayout::row(2),half-12);place(fields_[2],x+half+2+12,DialogLayout::row(2),fieldWidth-half-14);place(fields_[3],x,DialogLayout::row(3),fieldWidth);place(color_,x,DialogLayout::row(4),fieldWidth);place(fields_[4],x,DialogLayout::row(5),fieldWidth);place(alignment_,6,DialogLayout::row(6),w-12);place(snap_,6,DialogLayout::row(7),w-12);
  place(liveControl_,6,DialogLayout::footer(h),110);place(cancel_,w-6-44-2-44,DialogLayout::footer(h),44);place(done_,w-6-44,DialogLayout::footer(h),44);
 }
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"ISO绘制视角设置");const char32_t* labels[]{U"阶数",U"网格样式",U"网格位置",U"网格单位尺寸",U"网格颜色",U"网格粗细"};for(int i=0;i<6;++i)font_.draw(g,labels[i],r.x+6,DialogLayout::centeredInkY(font_,labels[i],r.y+DialogLayout::row(i),textControlHeight),skin_["text"]);
  const int x=6+font_.measure(U"网格单位尺寸")+6,half=(r.w-6-x-2)/2;for(int i=0;i<2;++i)font_.draw(g,i?U"Y":U"X",r.x+x+i*(half+2),DialogLayout::centeredInkY(font_,U"X",r.y+DialogLayout::row(2),textControlHeight),skin_["text"]);
  if(!error_.empty()){g.saveClip();g.clipRect({r.x+6,r.y+DialogLayout::row(8),r.w-12,10});font_.draw(g,error_,r.x+6,r.y+DialogLayout::row(8),skin_["text"]);g.restoreClip();}
 }
 bool onProcessMessage(ui::Message* msg)override{
  if(msg->type()==ui::kMouseDownMessage&&msg->fromFilter()&&msg->display()){
   auto picked=pickFromScreenPos(static_cast<ui::MouseMessage*>(msg)->screenPosition());
   if((!picked||picked->window()!=this)&&(!colorPopup_||!colorPopup_->parent()||!picked||picked->window()!=colorPopup_.get())){cancel();return true;}
   if(colorPopup_&&colorPopup_->parent()&&picked&&picked->window()==colorPopup_.get())return false;
  }
  if(msg->type()==ui::kKeyDownMessage){if(colorPopup_&&colorPopup_->parent())return false;auto key=static_cast<ui::KeyMessage*>(msg)->scancode();if(key==ui::kKeyEsc){cancel();return true;}if(key==ui::kKeyEnter||key==ui::kKeyEnterPad){done();return true;}}return PixelDialog::onProcessMessage(msg);
 }
 void smokeStep(int step){
  if(step==0){fields_[0]->setText("3");fields_[0]->Change();fields_[1]->setText("-4.9");fields_[1]->Change();fields_[3]->setText("8");fields_[3]->Change();styles_[1]->Click();if(!draft_.snapToGrid)snap_->Click();if(draft_.originX!=-4||draft_.stairStep!=3||!draft_.pixel||!draft_.snapToGrid||fields_[4]->isEnabled()||tips_->getTooltipFor(alignment_).find("3:1")==std::string::npos)throw std::runtime_error("ISO settings controls");}
  else if(step==1)liveControl_->Click();else if(step==2)cancel();else if(step==3)done();
  else if(step==4){const auto solid=draft_.solidColor;color_->Click();colorPopup_->sampled(0x55030201);if(draft_.pixelColor!=0x55030201||draft_.solidColor!=solid)throw std::runtime_error("ISO independent style color");ui::MouseMessage click(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,colorPopup_->bounds().center());click.setDisplay(display());click.setFromFilter(true);if(onProcessMessage(&click)||!parent())throw std::runtime_error("ISO color child click closed parent");ui::KeyMessage key(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);key.setFromFilter(true);if(onProcessMessage(&key)||!parent())throw std::runtime_error("ISO color Escape reached parent");colorPopup_->onProcessMessage(&key);}
  else if(step==5){done();if(error_.empty()||!parent()||settled_)throw std::runtime_error("ISO failed apply closed dialog");cancel();}
  else {ui::MouseMessage click(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,{display()->bounds().x+1,display()->bounds().y+1});click.setDisplay(display());click.setFromFilter(true);onProcessMessage(&click);if(parent())throw std::runtime_error("ISO backdrop cancel");}
 }
};
}
