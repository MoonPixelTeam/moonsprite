#pragma once
#include "native_widgets.h"
#include "ui/message.h"
#include "ui/resize_event.h"
#include "outline_samples.h"
#include "color_editor_popup.h"
#include <chrono>
#include <array>
namespace moon {
class OutlineDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;const Skin& icons_;OutlineSettings draft_;Pixel foreground_=0;bool remember_=false,queued_=true,busy_=false,closed_=false;
 std::unique_ptr<ColorEditorPopup> colorPopup_;std::filesystem::path colorStorage_;std::vector<Pixel> palette_;PixelButton *colorButton_,*backgroundButton_;
 PixelButton *close_,*cancel_,*apply_;PixelCheckbox *smart_,*follow_,*rememberControl_;PixelSwitch* live_;PixelEntry *color_,*background_,*width_,*darkness_;PixelDropdown *position_;std::array<PixelButton*,4> kernels_{};std::array<PixelButton*,8> directions_{};
 ui::Timer timer_{16,this};std::chrono::steady_clock::time_point due_=std::chrono::steady_clock::now();std::u32string error_;
 std::function<void(std::optional<OutlineSettings>)> preview_;std::function<void(OutlineSettings)> applyFn_;std::function<std::optional<bool>()> poll_;std::function<void(bool,Pixel)> colorPreference_;
 std::function<std::string(Pixel)> hex_;std::function<bool(const std::string&,Pixel&)> parse_;
 static constexpr int smartY=DialogLayout::bodyTop,followY=smartY+22,colorY=followY+22,backgroundY=colorY+26,darknessY=backgroundY+26,widthY=darknessY+26,positionY=widthY+26,patternY=positionY+26,errorY=patternY+72,height=errorY+10+6+20+6;
 PixelButton* button(std::u32string title,std::function<void()> fn){auto b=new PixelButton(font_,skin_,std::move(title),std::move(fn));addChild(b);return b;}
 void sync(){smart_->setChecked(draft_.smartHue);follow_->setChecked(draft_.followOpacity);rememberControl_->setChecked(remember_);live_->setChecked(draft_.previewEnabled);color_->setEnabled(!busy_&&!draft_.smartHue);rememberControl_->setEnabled(!busy_&&!draft_.smartHue);darkness_->setEnabled(!busy_&&draft_.smartHue);colorButton_->setEnabled(!busy_&&!draft_.smartHue);backgroundButton_->setEnabled(!busy_);colorButton_->swatch=draft_.color;backgroundButton_->swatch=draft_.sampling.background;colorButton_->invalidate();backgroundButton_->invalidate();
 for(int i=0;i<4;++i){const unsigned preset=i==0?90:i==1?255:i==2?24:66;kernels_[i]->active=draft_.sampling.kernel==i&&draft_.sampling.directions==preset;kernels_[i]->setEnabled(!busy_);kernels_[i]->invalidate();}
 for(int i=0;i<8;++i){directions_[i]->icon=(draft_.sampling.directions&(1u<<i))?"outline-direction-on":"outline-direction-off";directions_[i]->setEnabled(!busy_);directions_[i]->invalidate();}
 for(ui::Widget* c:std::array<ui::Widget*,6>{smart_,follow_,background_,width_,position_,live_})c->setEnabled(!busy_);apply_->setEnabled(!busy_);invalidate();}
 void changed(){if(busy_)return;queued_=true;due_=std::chrono::steady_clock::now()+std::chrono::milliseconds(40);error_.clear();sync();}
 void number(PixelEntry* entry,double& value,int low,int high){try{std::size_t n=0;auto v=std::stod(entry->text(),&n);if(n!=entry->text().size()||!std::isfinite(v))return;value=std::clamp(std::floor(v+.5),double(low),double(high));changed();}catch(...){}}
 void cancel(){if(colorPopup_)colorPopup_->closeWindow(nullptr);closed_=true;queued_=false;timer_.stop();preview_(std::nullopt);closeWindow(nullptr);}
 void apply(){if(busy_)return;if(colorPopup_)colorPopup_->closeWindow(nullptr);Pixel c,b;if(!parse_(color_->text(),c)||!parse_(background_->text(),b)){error_=U"请输入有效的颜色";invalidate();return;}draft_.color=c;draft_.sampling.background=b;number(width_,draft_.sampling.thickness,1,64);number(darkness_,draft_.darkness,0,100);queued_=false;busy_=true;sync();try{applyFn_(draft_);}catch(const std::exception& e){busy_=false;error_=unicodeText(e.what());sync();}}
 void tick(){if(closed_)return;try{auto result=poll_();if(result){if(*result){closed_=true;timer_.stop();closeWindow(nullptr);return;}busy_=false;error_=U"当前选区或图层内没有可描边的内容。";sync();}if(queued_&&!busy_&&std::chrono::steady_clock::now()>=due_){queued_=false;preview_(draft_.previewEnabled?std::optional<OutlineSettings>(draft_):std::nullopt);}}catch(const std::exception& e){busy_=false;error_=unicodeText(e.what());sync();}}
public:
 OutlineDialog(const PixelFont& f,const Skin& skin,const Skin& icons,OutlineSettings initial,bool remember,Pixel foreground,std::filesystem::path colorStorage,std::vector<Pixel> palette,std::function<std::string(Pixel)> hex,std::function<bool(const std::string&,Pixel&)> parse,std::function<void(bool,Pixel)> colorPreference,std::function<void(std::optional<OutlineSettings>)> preview,std::function<void(OutlineSettings)> apply,std::function<std::optional<bool>()> poll)
 :PixelDialog(skin,"",ClickBehavior::DoNothingOnClick,EnterBehavior::DoNothingOnEnter),font_(f),skin_(skin),icons_(icons),draft_(initial),colorStorage_(std::move(colorStorage)),palette_(std::move(palette)),foreground_(foreground),remember_(remember),preview_(std::move(preview)),applyFn_(std::move(apply)),poll_(std::move(poll)),colorPreference_(std::move(colorPreference)),hex_(std::move(hex)),parse_(std::move(parse)){
 setAutoRemap(false);setWantFocus(true);
 smart_=new PixelCheckbox(f,skin,U"智能色相",draft_.smartHue,[this](bool b){draft_.smartHue=b;changed();});addChild(smart_);
 follow_=new PixelCheckbox(f,skin,U"跟随不透明度",draft_.followOpacity,[this](bool b){draft_.followOpacity=b;changed();});addChild(follow_);
 rememberControl_=new PixelCheckbox(f,skin,U"记住颜色",remember_,[this](bool b){remember_=b;if(!b){draft_.color=foreground_;color_->setText(hex_(draft_.color));}colorPreference_(b,draft_.color);changed();});addChild(rememberControl_);
 auto entry=[&](std::string text){auto e=new PixelEntry(f,skin);addChild(e);e->setText(text);e->accept=[this]{this->apply();};e->cancel=[this]{cancel();};return e;};
 auto editColor=[this](bool background){if(busy_)return;if(!colorPopup_)colorPopup_=std::make_unique<ColorEditorPopup>(font_,skin_,icons_,colorStorage_);auto b=background?backgroundButton_:colorButton_;colorPopup_->setDisplay(display(),false);colorPopup_->open(b->bounds(),display()->bounds(),background?draft_.sampling.background:draft_.color,background?U"背景色":U"描边颜色",palette_,[this,background](Pixel c){auto e=background?background_:color_;e->setText(hex_(c));e->Change();},{});};
 colorButton_=button(U"",[editColor]{editColor(false);});backgroundButton_=button(U"",[editColor]{editColor(true);});colorButton_->paletteCell=backgroundButton_->paletteCell=true;
 color_=entry(hex_(draft_.color));background_=entry(hex_(draft_.sampling.background));width_=entry(std::to_string(int(draft_.sampling.thickness)));darkness_=entry(std::to_string(int(draft_.darkness)));width_->numeric=darkness_->numeric=true;width_->suffix=U"px";darkness_->suffix=U"%";
 color_->Change.connect([this]{Pixel c;if(parse_(color_->text(),c)){draft_.color=c;try{colorPreference_(remember_,c);}catch(const std::exception& e){error_=unicodeText(e.what());}changed();}});background_->Change.connect([this]{Pixel c;if(parse_(background_->text(),c)){draft_.sampling.background=c;changed();}});
 width_->Change.connect([this]{number(width_,draft_.sampling.thickness,1,64);});darkness_->Change.connect([this]{number(darkness_,draft_.darkness,0,100);});
 position_=new PixelDropdown(f,skin);addChild(position_);position_->setOptions({U"内部",U"外部",U"两侧"});position_->setSelectedIndex(draft_.sampling.position);position_->changed=[this](int i){draft_.sampling.position=i;changed();};
 const char* names[]={"outline-kernel-round","outline-kernel-square","outline-kernel-horizontal","outline-kernel-vertical"};for(int i=0;i<4;++i){kernels_[i]=button(U"",[this,i]{draft_.sampling.kernel=i;draft_.sampling.directions=i==0?90:i==1?255:i==2?24:66;changed();});kernels_[i]->iconSkin=&icons_;kernels_[i]->icon=names[i];}
 for(int i=0;i<8;++i){directions_[i]=button(U"",[this,i]{draft_.sampling.kernel=1;draft_.sampling.directions^=1u<<i;changed();});directions_[i]->iconSkin=&icons_;}
 live_=new PixelSwitch(f,skin,U"实时预览",draft_.previewEnabled,[this](bool b){draft_.previewEnabled=b;changed();});addChild(live_);live_->iconSkin=&icons_;live_->icon="eye";
 close_=button(U"",[this]{cancel();});close_->iconSkin=&icons_;close_->icon="close";close_->skinStyle="icon_button";cancel_=button(U"取消",[this]{cancel();});apply_=button(U"应用描边",[this]{this->apply();});timer_.Tick.connect([this]{tick();});sync();}
 ~OutlineDialog(){timer_.stop();}
 int preferredWidth()const{return 310;}int preferredHeight()const{return height;}
 gfx::Size minimumDialogSize(int)const override{return {310*uiScale,height*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());auto r=bounds();int w=r.w/uiScale,h=r.h/uiScale;auto place=[&](ui::Widget* c,int x,int y,int cw,int ch=20){c->setBounds({r.x+x*uiScale,r.y+y*uiScale,cw*uiScale,ch*uiScale});};layoutHeaderButton(close_);place(smart_,6,smartY,w-12);place(follow_,6,followY,w-12);place(colorButton_,90,colorY,20);place(color_,112,colorY,88);place(rememberControl_,206,colorY,w-212);place(backgroundButton_,90,backgroundY,20);place(background_,112,backgroundY,w-118);place(darkness_,90,darknessY,w-96);place(width_,90,widthY,w-96);place(position_,90,positionY,w-96);for(int i=0;i<4;++i)place(kernels_[i],6+i*25,patternY+12,26,26);for(int i=0;i<8;++i){int cell=i<4?i:i+1;place(directions_[i],w-6-58+(cell%3)*19,patternY+12+(cell/3)*19,20,20);}const int y=DialogLayout::footer(h);place(live_,6,y,110);place(apply_,w-6-72,y,72);place(cancel_,w-6-72-2-44,y,44);}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"描边");auto label=[&](std::u32string text,int x,int y){font_.draw(g,text,r.x+x,r.y+y,skin_["text"]);};label(U"描边颜色",6,colorY+5);label(U"背景色",6,backgroundY+5);label(U"深色系数",6,darknessY+5);label(U"宽度",6,widthY+5);label(U"位置",6,positionY+5);label(U"快捷形状",6,patternY);label(U"像素方向",r.w-64,patternY);if(!error_.empty()){g.saveClip();g.clipRect({r.x+6,r.y+errorY,r.w-12,10});label(error_,6,errorY);g.restoreClip();}}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kOpenMessage)timer_.start();if(msg->type()==ui::kCloseMessage)timer_.stop();if(msg->type()==ui::kKeyDownMessage){auto key=static_cast<ui::KeyMessage*>(msg);if(key->scancode()==ui::kKeyEsc){cancel();return true;}if(key->scancode()==ui::kKeyEnter||key->scancode()==ui::kKeyEnterPad){apply();return true;}}return PixelDialog::onProcessMessage(msg);}
 void smokeStep(int step){if(step==0){width_->setText("2");width_->Change();kernels_[1]->Click();directions_[0]->Click();}else if(step==1)live_->Click();else if(step==2)cancel();else apply();}
};
}
