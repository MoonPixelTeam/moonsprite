#pragma once
#include "layer_quick_actions.h"
#include "animation_settings_dialog.h"
#include "native_widgets.h"
#include "ui_scale.h"
#include "ui/popup_window.h"
#include "ui/resize_event.h"
#include "ui/message.h"
#include "ui/display.h"
#include "ui/tooltips.h"
#include <stdexcept>
namespace moon {
// Legacy LayerSettingsEditor.tsx quick-actions subdialog only. Unsupported
// actions remain in the model and order; native migration gaps are read-only.
class LayerQuickActionList final:public ui::Widget {
 const PixelFont& font_;const Skin& skin_;const Skin& icons_;
 layerquick::Actions& actions_;std::function<bool(const std::string&)> connected_;
 ui::Timer timer_{16,this};std::string dragged_;gfx::Point pointer_;int scroll_=0;
 PixelScrollBar* bar_;std::function<void()> changed_;
 int checkboxHover_=-1,checkboxPress_=-1;
 public: std::function<void(std::u32string)> hint;
 private:
 int page()const{return std::max(0,bounds().h/uiScale);}
 int maximum()const{return std::max(0,int(actions_.size())*20-page());}
 int rowAt(gfx::Point p)const {if(!bounds().contains(p)||p.x>=bounds().x2()-8*uiScale)return -1;const int i=((p.y-bounds().y)/uiScale+scroll_)/20;return i<int(actions_.size())?i:-1;}
 void setScroll(int value){scroll_=std::clamp(value,0,maximum());bar_->configure(int(actions_.size())*20,page(),scroll_);invalidate();}
 void reorderAt(gfx::Point p){const int target=rowAt(p);if(target<0||dragged_.empty())return;const bool after=(p.y-bounds().y)/uiScale+scroll_>=target*20+10;const auto id=actions_[target].id;if(layerquick::reorder(actions_,dragged_,id,after)){changed_();invalidate();}}
public:
 LayerQuickActionList(const PixelFont& font,const Skin& skin,const Skin& icons,layerquick::Actions& actions,std::function<bool(const std::string&)> connected,std::function<void()> changed):ui::Widget(ui::kGenericWidget),font_(font),skin_(skin),icons_(icons),actions_(actions),connected_(std::move(connected)),changed_(std::move(changed)){
  bar_=new PixelScrollBar(skin,true);addChild(bar_);bar_->wheelStep=20;bar_->changed=[this](int value){setScroll(value);};timer_.Tick.connect([this]{edgeTick();});
 }
 ~LayerQuickActionList(){endDrag();}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());bar_->setBounds({bounds().x2()-8*uiScale,bounds().y,8*uiScale,bounds().h});setScroll(scroll_);}
 void endDrag(){timer_.stop();dragged_.clear();checkboxPress_=-1;checkboxHover_=-1;if(hasCapture())releaseMouse();invalidate();}
 void edgeTick(){if(dragged_.empty()||!hasCapture()){endDrag();return;}const auto p=uiLocalPoint(pointer_,bounds().origin());const int direction=layerquick::edgeDirection(p.x,p.y,0,0,bounds().w/uiScale-8,page());if(direction){setScroll(scroll_+direction*12);reorderAt(pointer_);}}
 void onPaint(ui::PaintEvent& ev)override{
  auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());g.fillRect(skin_["background"],r);g.saveClip();g.clipRect({r.x,r.y,std::max(0,r.w-8),r.h});
  for(int i=0;i<int(actions_.size());++i){int y=r.y+i*20-scroll_;if(y+20<=r.y||y>=r.y2())continue;const auto& a=actions_[i];const auto m=layerquick::find(a.id);const bool connected=connected_(a.id),available=a.enabled||(connected&&layerquick::count(actions_)<layerquick::limit);if(a.id==dragged_)g.fillRect(skin_["panel"],{r.x,y,r.w-8,20});icons_.draw(g,"move",{r.x+3,y+4,11,11},true);icons_.draw(g,m->icon,{r.x+19,y+4,11,11},true,connected?255:96);g.saveClip();g.clipRect({r.x+34,y,r.w-65,20});font_.draw(g,m->label,r.x+34,y+5,skin_[connected?"text":"muted"]);g.restoreClip();skin_.drawCheckbox(g,{r.x+r.w-28,y+2,20,16},a.enabled,checkboxHover_==i,checkboxPress_==i && checkboxHover_==i,available);}
  g.restoreClip();
 }
 bool onProcessMessage(ui::Message* msg)override{
  if(msg->type()==ui::kMouseLeaveMessage || msg->type()==ui::kFocusLeaveMessage){checkboxHover_=-1;if(msg->type()==ui::kFocusLeaveMessage){checkboxPress_=-1;if(dragged_.empty()&&hasCapture())releaseMouse();}invalidate();}
  if(checkboxPress_>=0&&!hasCapture()){checkboxPress_=-1;invalidate();}
  if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc&&hasCapture()){endDrag();return true;}
  if(msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseEnterMessage){const auto point=static_cast<ui::MouseMessage*>(msg)->position();const int row=rowAt(point);const int next=point.x>=bounds().x2()-28*uiScale?row:-1;if(next!=checkboxHover_){checkboxHover_=next;invalidate();}}
  if(msg->type()==ui::kMouseUpMessage && checkboxPress_>=0){const int row=checkboxPress_;checkboxPress_=-1;if(hasCapture())releaseMouse();const auto point=static_cast<ui::MouseMessage*>(msg)->position();if(rowAt(point)==row && point.x>=bounds().x2()-28*uiScale){const auto id=actions_[row].id;if(layerquick::toggle(actions_,id,!actions_[row].enabled,connected_))changed_();}invalidate();return true;}
  if(!dragged_.empty()&&msg->type()==ui::kFocusLeaveMessage){endDrag();return false;}
  if(msg->type()==ui::kMouseWheelMessage){auto m=static_cast<ui::MouseMessage*>(msg);setScroll(scroll_+m->wheelDelta().y*20);return true;}
  if(msg->type()==ui::kMouseDownMessage){auto m=static_cast<ui::MouseMessage*>(msg);if(!m->left())return false;const int i=rowAt(m->position());if(i<0)return false;const auto p=uiLocalPoint(m->position(),bounds().origin());if(p.x<17){endDrag();dragged_=actions_[i].id;pointer_=m->position();requestFocus();captureMouse();timer_.start();invalidate();return true;}if(p.x>=bounds().w/uiScale-28){checkboxHover_=checkboxPress_=i;captureMouse();invalidate();return true;}return true;}
  if(msg->type()==ui::kMouseMoveMessage&&!dragged_.empty()){if(!hasCapture()){endDrag();return false;}pointer_=static_cast<ui::MouseMessage*>(msg)->position();reorderAt(pointer_);return true;}
  if(msg->type()==ui::kMouseMoveMessage&&dragged_.empty()){const int i=rowAt(static_cast<ui::MouseMessage*>(msg)->position());if(hint)hint(i>=0&&!connected_(actions_[i].id)?U"未迁移；已启用项可关闭":U"");}
  if(msg->type()==ui::kMouseUpMessage&&!dragged_.empty()){endDrag();return true;}
  return ui::Widget::onProcessMessage(msg);
 }
 void smoke(){
  const auto original=actions_;const auto first=actions_.front().id;auto point=bounds().origin()+gfx::Point(5*uiScale,5*uiScale);ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);down.setDisplay(display());onProcessMessage(&down);if(!hasCapture()||dragged_!=first)throw std::runtime_error("Quick actions drag capture");
  point.y=bounds().y+35*uiScale;ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);onProcessMessage(&move);if(actions_[1].id!=first||!hasCapture())throw std::runtime_error("Quick actions live reorder loses capture");pointer_={bounds().x+5*uiScale,bounds().y2()-1};edgeTick();if(scroll_!=12)throw std::runtime_error("Quick actions edge scroll");ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);onProcessMessage(&up);if(hasCapture()||!dragged_.empty()||timer_.isRunning())throw std::runtime_error("Quick actions capture release");actions_=original;setScroll(0);changed_();
  const auto checkboxPoint=gfx::Point(bounds().x2()-18*uiScale,bounds().y+5*uiScale);ui::MouseMessage checkDown(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,checkboxPoint);checkDown.setDisplay(display());onProcessMessage(&checkDown);if(checkboxPress_!=0||!hasCapture())throw std::runtime_error("Quick checkbox press capture");endDrag();if(checkboxPress_!=-1||hasCapture())throw std::runtime_error("Quick checkbox page cancellation");ui::MouseMessage cancelledUp(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,checkboxPoint);onProcessMessage(&cancelledUp);if(actions_!=original)throw std::runtime_error("Cancelled quick checkbox toggled after returning");
  onProcessMessage(&checkDown);ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);if(checkboxPress_!=-1||hasCapture()||actions_!=original)throw std::runtime_error("Quick checkbox Escape cancellation");
  onProcessMessage(&checkDown);onProcessMessage(&cancelledUp);if(actions_[0].enabled==original[0].enabled)throw std::runtime_error("Quick checkbox live toggle");actions_=original;changed_();
 }
};
// Clipped native body adapts Legacy modal-body scrolling; chrome stays fixed.
class LayerSettingsBody final:public ui::Widget {
public:
 std::function<void(ui::PaintEvent&)> paint;
 std::function<void(int)> scroll;
 LayerSettingsBody():ui::Widget(ui::kGenericWidget){setTransparent(true);}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());}
 void onPaint(ui::PaintEvent& ev)override{if(paint)paint(ev);}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kMouseWheelMessage&&scroll){scroll(static_cast<ui::MouseMessage*>(msg)->wheelDelta().y*20);return true;}return ui::Widget::onProcessMessage(msg);}
};
// Both icons are existing Legacy assets; the button material stays reusable.
class LayerQuickEntry final:public PixelButton {
 const Skin& icons_;
public:
 LayerQuickEntry(const PixelFont& font,const Skin& skin,const Skin& icons,std::function<void()> action):PixelButton(font,skin,U"",std::move(action)),icons_(icons){iconSkin=&icons;icon="properties";iconWithCaption=true;}
 void onPaint(ui::PaintEvent& ev)override{PixelButton::onPaint(ev);auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());icons_.draw(g,"right",{r.x2()-16,r.y+(r.h-11)/2,11,11},true,isSelected()||hasMouse()?255:128);}
};
class LayerQuickActionsDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;layerquick::Actions& actions_;
 LayerQuickActionList* list_;PixelButton *close_,*headerClose_,*reset_;std::function<void()> changed_;
 PixelSlider* density_=nullptr;int densityValue_=0;
 PixelButton *mode_=nullptr,*ordinary_=nullptr,*side_=nullptr,*quick_=nullptr;
 ui::TooltipManager* tips_=nullptr;
 LayerSettingsBody *viewport_=nullptr,*body_=nullptr;PixelScrollBar* bodyScroll_=nullptr;AnimationSettingsControls* animation_=nullptr;int bodyOffset_=0;bool hidden_=false,autoHide_=true,quickPage_=false;gfx::Rect mainGeometry_,quickGeometry_;
 std::function<void(bool)> modeChanged_,sideChanged_;std::function<void()> panelReset_;

 std::u32string error_,hint_;int drag_=0;gfx::Point start_;gfx::Rect original_;
public:
 LayerQuickActionsDialog(const PixelFont& font,const Skin& skin,const Skin& icons,layerquick::Actions& actions,std::function<bool(const std::string&)> connected,std::function<void()> changed):PixelDialog(skin,"",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow),font_(font),skin_(skin),actions_(actions),changed_(std::move(changed)){
  setAutoRemap(false);setWantFocus(true);list_=new LayerQuickActionList(font,skin,icons,actions,std::move(connected),[this]{changed_();updateQuickEntry();invalidate();});addChild(list_);list_->hint=[this](std::u32string text){if(hint_!=text){hint_=std::move(text);invalidate();}};close_=new PixelButton(font,skin,U"关闭",[this]{list_->endDrag();if(quickPage_){showQuickPage(false);return;}closeWindow(nullptr);});addChild(close_);headerClose_=new PixelButton(font,skin,U"",[this]{list_->endDrag();if(quickPage_){showQuickPage(false);return;}closeWindow(nullptr);});headerClose_->iconSkin=&icons;headerClose_->icon="close";headerClose_->skinStyle="icon_button";addChild(headerClose_);reset_=new PixelButton(font,skin,U"重置",[this]{list_->endDrag();if(panelReset_)try{panelReset_();}catch(...){return;}actions_=layerquick::normalize({});changed_();updateQuickEntry();list_->invalidate();invalidate();});reset_->iconSkin=&icons;reset_->icon="restore";reset_->iconWithCaption=true;addChild(reset_);
 }
 ~LayerQuickActionsDialog(){list_->endDrag();}
 static std::u32string densityLabel(int value){static const char32_t* labels[]{U"紧凑",U"标准",U"详细",U"扩展",U"大",U"特大"};return labels[std::clamp(value,0,5)];}
 static std::u32string densityDescription(int value){static const char32_t* descriptions[]{U"隐藏次要信息，以最小行高显示更多图层与帧。",U"在缩略图大小、信息量和可读性之间保持平衡。",U"放大缩略图与帧单元，便于辨认像素内容。",U"进一步扩大预览区域，突出图层与帧内容。",U"使用大尺寸预览，适合空间充足的图层栏目。",U"使用最大尺寸预览，优先展示图层与帧细节。"};return descriptions[std::clamp(value,0,5)];}
 void updateDensityTip(){if(tips_&&density_){tips_->removeTooltipFor(density_);tips_->addTooltipFor(density_,utf8Text(densityLabel(densityValue_)+U"\n"+densityDescription(densityValue_)));}}
 void setDensity(int value,std::function<void(int)> changed){densityValue_=value;density_=new PixelSlider(font_,skin_);density_->minimum=0;density_->maximum=5;density_->percentage=false;density_->numberSuffix=U"";density_->value=value;density_->valueLabel=[](int value){return densityLabel(value);};density_->changed=[this,changed](int next){densityValue_=next;density_->value=next;density_->invalidate();changed(next);updateDensityTip();invalidate();};addChild(density_);}
 void setMode(bool hidden){if(hidden==hidden_)return;try{if(animation_)animation_->dismissTransient();modeChanged_(hidden);hidden_=hidden;syncPanel();}catch(...){}}
 void syncPanel(){if(!mode_)return;mode_->active=!hidden_;ordinary_->active=hidden_;mode_->invalidate();ordinary_->invalidate();side_->active=autoHide_;side_->invalidate();if(animation_)animation_->setVisible(!hidden_);if(density_)density_->setVisible(!hidden_);layoutMain();invalidate();}
 void setPanelSettings(const Skin& icons,bool hidden,bool autoHide,std::function<void(bool)> modeChanged,std::function<void(bool)> sideChanged,animationprefs::Settings& animationSettings,const std::filesystem::path& markers,std::function<void()> animationChanged,std::function<void()> reset){hidden_=hidden;autoHide_=autoHide;modeChanged_=std::move(modeChanged);sideChanged_=std::move(sideChanged);
 mode_=new PixelButton(font_,skin_,U"动画模式",[this]{setMode(false);});addChild(mode_);
 ordinary_=new PixelButton(font_,skin_,U"普通模式",[this]{setMode(true);});addChild(ordinary_);
 side_=new PixelSwitch(font_,skin_,U"左右吸附时自动隐藏按钮",autoHide_,[this](bool next){try{sideChanged_(next);autoHide_=next;}catch(...){}syncPanel();});addChild(side_);
 tips_=new ui::TooltipManager;addChild(tips_);updateDensityTip();
 tips_->addTooltipFor(mode_,utf8Text(U"显示帧、循环节和动画编辑工具。"));tips_->addTooltipFor(ordinary_,utf8Text(U"仅显示图层与缩略图，适合绘图。"));
 viewport_=new LayerSettingsBody;addChild(viewport_);body_=new LayerSettingsBody;viewport_->addChild(body_);
 bodyScroll_=new PixelScrollBar(skin_,true);addChild(bodyScroll_);bodyScroll_->wheelStep=20;bodyScroll_->changed=[this](int value){bodyOffset_=value;layoutMain();};
 viewport_->scroll=body_->scroll=[this](int delta){bodyOffset_+=delta;layoutMain();};
 animation_=new AnimationSettingsControls(font_,skin_,icons,markers,animationSettings,[this,animationChanged]{animationChanged();layoutMain();});body_->addChild(animation_);
 animation_->popupOpen=[this](bool open){setClickBehavior(open?ui::PopupWindow::ClickBehavior::DoNothingOnClick:ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow);};
 body_->paint=[this](ui::PaintEvent& ev){auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(body_->clientBounds());font_.draw(g,U"栏目模式",r.x+6,r.y,skin_["text"]);if(!hidden_)font_.draw(g,U"缩略图与帧信息大小",r.x+6,r.y+38,skin_["text"]);};
 quick_=new LayerQuickEntry(font_,skin_,icons,[this]{showQuickPage(true);});addChild(quick_);updateQuickEntry();
 for(auto control:{static_cast<ui::Widget*>(mode_),static_cast<ui::Widget*>(ordinary_),static_cast<ui::Widget*>(side_),static_cast<ui::Widget*>(quick_),static_cast<ui::Widget*>(density_)})if(control){removeChild(control);body_->addChild(control);}
 panelReset_=[this,reset]{animation_->dismissTransient();reset();animation_->sync();hidden_=false;autoHide_=true;densityValue_=0;if(density_){density_->value=0;density_->invalidate();}updateDensityTip();syncPanel();};syncPanel();
 }
 void updateQuickEntry(){if(!quick_)return;quick_->caption=U"图层快捷操作  "+unicodeText(std::to_string(layerquick::count(actions_))+" / 5");quick_->invalidate();}
 std::vector<std::u32string> summaryLines()const{const std::u32string description=U"选择最多 5 项并调整顺序，它们会显示在图层面板右上角。";const int width=std::max(100,bounds().w/uiScale-12);std::vector<std::u32string> lines;std::u32string line;for(auto ch:description){if(!line.empty()&&font_.measure(line+ch)>width){lines.push_back(line);line.clear();}line+=ch;}if(!line.empty())lines.push_back(line);return lines;}
 void setQuickGeometry(gfx::Rect geometry){quickGeometry_=geometry;}
 gfx::Rect quickGeometry()const{return quickPage_?bounds():quickGeometry_;}
 gfx::Rect mainGeometry()const{return quickPage_?mainGeometry_:bounds();}
 bool quickPage()const{return quickPage_;}
 void showQuickPage(bool next){if(!mode_||quickPage_==next)return;if(animation_)animation_->dismissTransient();list_->endDrag();if(next)mainGeometry_=bounds();else quickGeometry_=bounds();quickPage_=next;updateQuickEntry();auto target=next?quickGeometry_:mainGeometry_;if(target.isEmpty()){const auto center=bounds().center();target={center.x-140*uiScale,center.y-150*uiScale,280*uiScale,300*uiScale};}setBounds(target);requestFocus();invalidate();}
 void setError(std::u32string text){error_=std::move(text);invalidate();}
 int listTop()const{return DialogLayout::bodyTop+int(summaryLines().size())*12+12+(!mode_&&density_?42:0);}
 int mainContentHeight()const{return hidden_?86:108+animation_->contentHeight()+textControlHeight;}
 void layoutMain(){
  if(!viewport_||bounds().isEmpty())return;
  const auto r=bounds();const bool main=!quickPage_;for(auto b:{mode_,ordinary_,side_,quick_})b->setVisible(main);viewport_->setVisible(main);bodyScroll_->setVisible(main);
  const int page=std::max(20,r.h/uiScale-DialogLayout::bodyTop-48),height=mainContentHeight();
  bodyOffset_=std::clamp(bodyOffset_,0,std::max(0,height-page));bodyScroll_->configure(height,page,bodyOffset_);
  viewport_->setBounds({r.x,r.y+DialogLayout::bodyTop*uiScale,r.w-10*uiScale,page*uiScale});
  bodyScroll_->setBounds({r.x2()-10*uiScale,r.y+DialogLayout::bodyTop*uiScale,8*uiScale,page*uiScale});
  body_->setBounds({r.x,r.y+(DialogLayout::bodyTop-bodyOffset_)*uiScale,r.w-10*uiScale,height*uiScale});viewport_->invalidate();
  const auto b=body_->bounds();auto place=[&](ui::Widget* c,int y,int h=textControlHeight){c->setBounds({b.x+6*uiScale,b.y+y*uiScale,b.w-12*uiScale,h*uiScale});};
  const int available=b.w/uiScale-12,left=(available+UiSpacing::sharedBorder)/2;
  mode_->setBounds({b.x+6*uiScale,b.y+12*uiScale,left*uiScale,textControlHeight*uiScale});ordinary_->setBounds({b.x+(6+left-UiSpacing::sharedBorder)*uiScale,b.y+12*uiScale,(available-left+UiSpacing::sharedBorder)*uiScale,textControlHeight*uiScale});
  if(density_){density_->setVisible(main&&!hidden_);place(density_,50);}
  place(side_,hidden_?38:76);animation_->setVisible(main&&!hidden_);animation_->setBounds({b.x,b.y+102*uiScale,b.w,animation_->contentHeight()*uiScale});
  place(quick_,hidden_?64:108+animation_->contentHeight());
 }
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();const bool main=mode_&&!quickPage_;list_->setVisible(!main);reset_->setVisible(!mode_||main);layoutMain();list_->setBounds({r.x+6*uiScale,r.y+listTop()*uiScale,r.w-12*uiScale,std::max(20*uiScale,r.h-(listTop()+48)*uiScale)});close_->setBounds({r.x2()-61*uiScale,r.y2()-26*uiScale,55*uiScale,textControlHeight*uiScale});reset_->setBounds({r.x+6*uiScale,r.y2()-26*uiScale,55*uiScale,textControlHeight*uiScale});if(!mode_&&density_)density_->setBounds({r.x+6*uiScale,r.y+(DialogLayout::bodyTop+26)*uiScale,r.w-12*uiScale,textControlHeight*uiScale});layoutHeaderButton(headerClose_);}
 gfx::Size minimumDialogSize(int)const override{return {280*uiScale,(mode_&&!quickPage_?227:listTop()+68)*uiScale};}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,mode_&&!quickPage_?U"图层设置":U"图层快捷操作");if(!mode_||quickPage_){int y=r.y+DialogLayout::bodyTop;for(const auto& line:summaryLines()){font_.draw(g,line,r.x+6,y,skin_["text"]);y+=12;}font_.draw(g,unicodeText(std::to_string(layerquick::count(actions_))+" / 5"),r.x+6,r.y+listTop()-12,skin_["text"]);}font_.draw(g,error_.empty()?(hint_.empty()?U"更改即时生效":hint_):error_,r.x+6,r.y2()-42,skin_["text"]);}
 void smokeAnimation(){animation_->smoke();}
 bool onProcessMessage(ui::Message* msg)override{
  if(msg->type()==ui::kCloseMessage){if(animation_)animation_->dismissTransient();list_->endDrag();drag_=0;if(hasCapture())releaseMouse();}
  if(msg->type()==ui::kMouseLeaveMessage)return true;
  if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){if(animation_)animation_->dismissTransient();list_->endDrag();if(quickPage_){showQuickPage(false);return true;}closeWindow(nullptr);return true;}
  if(msg->type()==ui::kFocusLeaveMessage){list_->endDrag();drag_=0;if(hasCapture())releaseMouse();}
  return PixelPopupWindow::onProcessMessage(msg);
 }
 void smoke(){if(mode_)showQuickPage(true);list_->smoke();if(mode_){showQuickPage(false);}if(mode_){const auto hidden=hidden_,autoHide=autoHide_;setMode(!hidden);if(hidden_==hidden||animation_->isVisible()==hidden_)throw std::runtime_error("Panel mode live settings");setMode(hidden);side_->Click();if(autoHide_==autoHide)throw std::runtime_error("Panel side auto-hide live settings");side_->Click();if(hidden_!=hidden||autoHide_!=autoHide)throw std::runtime_error("Panel settings restoration");}if(density_){const auto original=densityValue_;density_->changed(5);if(densityValue_!=5)throw std::runtime_error("Density slider upper value");density_->changed(0);if(densityValue_!=0)throw std::runtime_error("Density slider lower value");density_->changed(original);}}
};
}
