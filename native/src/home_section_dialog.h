#pragma once
#include "recent_projects_pane.h"
#include "home_sections.h"
namespace moon {
class HomeSectionButton final:public PixelButton {
 const Skin& icons_;
public:
 home::Section section;
 HomeSectionButton(const PixelFont& f,const Skin& s,const Skin& icons,std::function<void()> action):PixelButton(f,s,U"",std::move(action)),icons_(icons){}
 void onPaint(ui::PaintEvent& ev)override{PixelButton::onPaint(ev);auto& g=*ev.graphics();UiPaintScale paint(g);auto r=uiLogical(clientBounds());g.saveClip();g.clipRect({r.x+1,r.y+1,std::max(0,r.w-2),std::max(0,r.h-2)});icons_.draw(g,section.kind=="folder"?"folderOpen":section.kind=="recovery"?"refresh":"image",{r.x+4,r.y+7,15,15},true);auto name=section.kind=="recent"?U"最近文件":section.kind=="gallery"?U"画廊":section.kind=="recovery"?U"恢复":unicodeText(section.name);auto detail=section.kind=="folder"?unicodeText(section.directory):U"内置栏目";auto trim=[&](std::u32string s){while(!s.empty()&&font_.measure(s)>r.w-28)s.pop_back();return s;};font_.draw(g,trim(name),r.x+23,r.y+3,skin_["text"]);font_.draw(g,trim(detail),r.x+23,r.y+15,skin_["muted"]);g.restoreClip();}
};
class HomeSectionRows final:public ui::Widget {
 const PixelFont& font_;const Skin& skin_;const Skin& icons_;PixelScrollBar* bar_;int scroll_=0;std::string dragged_;
 std::vector<home::Section> values_;std::string active_;std::vector<PixelButton*> select_,remove_;std::vector<RecentReorderButton*> move_;
 void layout(){const auto r=bounds();const int step=32*uiScale,total=int(values_.size())*step;scroll_=std::clamp(scroll_,0,std::max(0,total-r.h));bar_->setBounds({r.x2()-7*uiScale,r.y,7*uiScale,r.h});bar_->configure(total,r.h,scroll_);bar_->setVisible(total>r.h);for(std::size_t i=0;i<select_.size();++i){const int y=r.y+int(i)*step-scroll_;const bool visible=i<values_.size()&&y>=r.y&&y+30*uiScale<=r.y2();for(auto b:{select_[i],remove_[i],static_cast<PixelButton*>(move_[i])})b->setVisible(visible);if(!visible)continue;move_[i]->setBounds({r.x,y+7*uiScale,15*uiScale,15*uiScale});select_[i]->setBounds({r.x+17*uiScale,y,r.w-43*uiScale,30*uiScale});remove_[i]->setBounds({r.x2()-24*uiScale,y+7*uiScale,15*uiScale,15*uiScale});remove_[i]->setEnabled(values_[i].kind=="folder");}}
public:
 std::function<void(std::string)> select,remove;std::function<void(std::string,std::string,bool)> reorder;
 HomeSectionRows(const PixelFont& f,const Skin& s,const Skin& icons):ui::Widget(ui::kGenericWidget),font_(f),skin_(s),icons_(icons){setTransparent(true);bar_=new PixelScrollBar(s,true);addChild(bar_);bar_->changed=[this](int value){scroll_=value;layout();invalidate();};}
 static std::u32string name(const home::Section& s){return s.kind=="recent"?U"最近文件":s.kind=="gallery"?U"画廊":s.kind=="recovery"?U"恢复":unicodeText(s.name);}
 void setValues(std::vector<home::Section> values,std::string active){values_=std::move(values);active_=std::move(active);while(select_.size()<values_.size()){const auto i=select_.size();auto b=new HomeSectionButton(font_,skin_,icons_,[this,i]{if(i<values_.size()&&select){auto id=values_[i].id;select(id);}});auto d=new PixelButton(font_,skin_,U"",[this,i]{if(i<values_.size()&&values_[i].kind=="folder"&&remove){auto id=values_[i].id;remove(id);}});auto m=new RecentReorderButton(font_,skin_);m->begin=[this,i](gfx::Point){if(i<values_.size())dragged_=values_[i].id;};m->move=[this](gfx::Point p){if(!bounds().contains(p)||dragged_.empty())return;const int index=(p.y-bounds().y+scroll_)/(32*uiScale);if(index<0||index>=int(values_.size()))return;auto id=values_[index].id;if(id!=dragged_&&reorder)reorder(dragged_,id,(p.y-bounds().y+scroll_)%(32*uiScale)>=16*uiScale);};m->end=[this](gfx::Point,bool){dragged_.clear();};for(auto w:{static_cast<PixelButton*>(b),d,static_cast<PixelButton*>(m)}){w->iconSkin=&icons_;addChild(w);}b->iconWithCaption=true;d->skinStyle=m->skinStyle="icon_button";m->icon="move";select_.push_back(b);remove_.push_back(d);move_.push_back(m);}for(std::size_t i=0;i<values_.size();++i){static_cast<HomeSectionButton*>(select_[i])->section=values_[i];select_[i]->active=values_[i].id==active_;remove_[i]->icon=values_[i].kind=="folder"?"delete":"lock";}layout();invalidate();}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());layout();}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kMouseWheelMessage){scroll_+=static_cast<ui::MouseMessage*>(msg)->wheelDelta().y*32*uiScale;layout();invalidate();return true;}return ui::Widget::onProcessMessage(msg);}
 void onPaint(ui::PaintEvent& ev)override{UiPaintScale paint(*ev.graphics());skin_.draw(*ev.graphics(),"panel_content",uiLogical(clientBounds()));}
 void smokeReorder(std::size_t from,std::size_t to,bool after){auto source=move_.at(from);const auto target=select_.at(to)->bounds();source->begin(source->bounds().center());source->move({target.center().x,after?target.y2()-1:target.y});source->end(target.center(),false);}
 void smokeSelect(std::size_t i){select_.at(i)->Click();}void smokeRemove(std::size_t i){remove_.at(i)->Click();}
};
class HomeSectionDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;HomeSectionRows* rows_;PixelButton *close_,*done_,*add_;std::array<PixelCheckbox*,6> formats_{};
public:
 HomeSectionDialog(const PixelFont& font,const Skin& skin,const Skin& icons,std::function<void()> add):PixelDialog(skin,"",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow),font_(font),skin_(skin){setAutoRemap(false);setWantFocus(true);rows_=new HomeSectionRows(font,skin,icons);addChild(rows_);close_=new PixelButton(font,skin,U"",[this]{closeWindow(nullptr);});close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";done_=new PixelButton(font,skin,U"完成",[this]{closeWindow(nullptr);});add_=new PixelButton(font,skin,U"添加文件夹",std::move(add));add_->iconSkin=&icons;add_->icon="newFolder";add_->iconWithCaption=true;for(auto w:{close_,done_,add_})addChild(w);const char32_t* labels[]={U"工程",U"PNG",U"JPG / JPEG",U"WEBP",U"BMP",U"GIF"};for(int i=0;i<6;++i){formats_[i]=new PixelCheckbox(font,skin,labels[i],true,[this,i](bool checked){if(formatChanged)formatChanged(i,checked);});addChild(formats_[i]);}}
 std::function<void(int,bool)> formatChanged;
 HomeSectionRows& rows(){return *rows_;}
 void setValues(const std::vector<home::Section>& values,const std::string& active,unsigned formats){rows_->setValues(values,active);for(int i=0;i<6;++i)formats_[i]->setChecked((formats&(1u<<i))!=0);}
 gfx::Size minimumDialogSize(int)const override{return {360*uiScale,280*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();const int footer=r.y+DialogLayout::footer(r.h/uiScale)*uiScale,formatY=footer-58*uiScale;rows_->setBounds({r.x+6*uiScale,r.y+DialogLayout::bodyTop*uiScale,r.w-12*uiScale,std::max(1,formatY-r.y-(DialogLayout::bodyTop+18)*uiScale)});for(int i=0;i<6;++i)formats_[i]->setBounds({r.x+(6+(i%3)*112)*uiScale,formatY+(i/3)*22*uiScale,110*uiScale,20*uiScale});done_->setBounds({r.x+6*uiScale,footer,54*uiScale,20*uiScale});add_->setBounds({r.x2()-108*uiScale,footer,102*uiScale,20*uiScale});layoutHeaderButton(close_);}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale paint(g);auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"栏目管理");font_.draw(g,U"文件显示格式",r.x+6,DialogLayout::footer(r.h)+r.y-70,skin_["text"]);}
 bool onProcessMessage(ui::Message* msg)override{if(processDialogGeometry(msg))return true;if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){closeWindow(nullptr);return true;}return PixelPopupWindow::onProcessMessage(msg);}
 void smokeFormat(int i){formats_.at(i)->Click();}void smokeClose(){done_->Click();}
};
}
