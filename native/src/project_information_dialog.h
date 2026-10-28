#pragma once
#include "native_widgets.h"
#include "document.h"
#include "ui/message.h"
#include "ui/resize_event.h"
#include <locale>
namespace moon {
inline std::u32string projectNumber(std::uint64_t value){std::ostringstream out;try{out.imbue(std::locale(""));}catch(...){}out<<value;return unicodeText(out.str());}
inline std::u32string projectDate(const std::string& value){
 int year=0,month=0,day=0,hour=0,minute=0,second=0;
 if(std::sscanf(value.c_str(),"%d-%d-%dT%d:%d:%d",&year,&month,&day,&hour,&minute,&second)!=6||year<1601||month<1||month>12||day<1||day>31||hour>23||minute>59||second>59)return U"-";
 std::tm date{};date.tm_year=year-1900;date.tm_mon=month-1;date.tm_mday=day;date.tm_hour=hour;date.tm_min=minute;date.tm_sec=second;
 const auto utc=_mkgmtime64(&date);std::tm local{};if(_localtime64_s(&local,&utc))return U"-";
 char text[80]{};if(!std::strftime(text,sizeof(text),"%Y-%m-%d %H:%M:%S",&local))return U"-";return unicodeText(text);
}
class ProjectInformationPane final:public ui::Widget {
 const PixelFont& font_;const Skin& skin_;const Skin& icons_;PixelScrollBar* bar_;int offset_=0,total_=0;
 struct Item {std::u32string label,value;std::string icon;};
 struct Row {Item item;std::vector<std::u32string> lines;gfx::Rect box;bool highlight=false;};
 std::vector<Item> highlights_,details_;std::vector<Row> rows_;
 std::vector<std::u32string> wrap(const std::u32string& value,int width)const{std::vector<std::u32string> result;std::u32string line;for(auto ch:value){if(ch==U'\n'){result.push_back(line);line.clear();continue;}if(!line.empty()&&font_.measure(line+ch)>std::max(1,width)){result.push_back(line);line.clear();}line+=ch;}if(!line.empty()||result.empty())result.push_back(line);return result;}
 void scrollTo(int v){offset_=std::clamp(v,0,std::max(0,total_-bounds().h/uiScale));bar_->configure(total_,std::max(1,bounds().h/uiScale),offset_);invalidate();}
 void reflow(){rows_.clear();const int width=std::max(1,bounds().w/uiScale-13),half=std::max(1,(width-6)/2);int y=3;
 for(int i=0;i<4;i+=2){int height=36;std::vector<Row> pair;for(int j=0;j<2;++j){Row row;row.item=highlights_[i+j];row.highlight=true;row.lines=wrap(row.item.value,half-8);height=std::max(height,20+int(row.lines.size())*12+4);row.box={3+j*(half+6),y,half,height};pair.push_back(std::move(row));}for(auto& row:pair){row.box.h=height;rows_.push_back(std::move(row));}y+=height+6;}
 for(const auto& item:details_){Row row;row.item=item;row.lines=wrap(item.value,width-128);row.box={3,y,width,std::max(textControlHeight,int(row.lines.size())*12+6)};y+=row.box.h+2;rows_.push_back(std::move(row));}total_=y+3;const auto r=bounds();bar_->setBounds({r.x2()-7*uiScale,r.y,7*uiScale,r.h});bar_->setVisible(total_>r.h/uiScale);scrollTo(offset_);}
public:
 ProjectInformationPane(const PixelFont& f,const Skin& s,const Skin& icons,const Document& d):ui::Widget(ui::kGenericWidget),font_(f),skin_(s),icons_(icons){setTransparent(true);setFocusStop(true);bar_=new PixelScrollBar(s,true);addChild(bar_);bar_->wheelStep=36;bar_->changed=[this](int v){scrollTo(v);};const auto& info=d.projectInformation();auto duration=unicodeText(projectDuration(info.drawingTimeMs));
 highlights_={{U"绘画笔数",projectNumber(info.strokeCount),"project-pencil"},{U"有效绘画时长",duration,"project-drawing-time"},{U"画布尺寸",unicodeText(std::to_string(d.width())+" x "+std::to_string(d.height())+" px"),"image"},{U"图层数量",projectNumber(d.timeline().state().layers.size()),"project-layer-count"}};
 details_={{U"项目名称",d.name(),{}},{U"颜色模式",U"RGBA",{}},{U"图层组数量",projectNumber(d.timeline().state().groups.size()),{}},{U"编辑操作数",projectNumber(info.operationCount),{}},{U"有效绘画时长",duration,{}},{U"创建时间",projectDate(info.createdAt),{}},{U"最后修改",projectDate(info.updatedAt),{}},{U"缩时记录帧数",U"不可用（尚未迁移）",{}},{U"当前缩时记录数据量",U"不可用（尚未迁移）",{}}};}
 int detailCount()const{return int(details_.size());}int scroll()const{return offset_;}void smokeScroll(){scrollTo(total_);}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());reflow();}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kMouseWheelMessage){scrollTo(offset_+static_cast<ui::MouseMessage*>(msg)->wheelDelta().y*36);return true;}if(msg->type()==ui::kKeyDownMessage){auto key=static_cast<ui::KeyMessage*>(msg)->scancode();if(key==ui::kKeyUp||key==ui::kKeyDown||key==ui::kKeyPageUp||key==ui::kKeyPageDown){scrollTo(offset_+(key==ui::kKeyUp||key==ui::kKeyPageUp?-1:1)*(key==ui::kKeyUp||key==ui::kKeyDown?36:bounds().h/uiScale));return true;}}return ui::Widget::onProcessMessage(msg);}
 void onPaint(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());skin_.draw(g,"panel_content",r);g.saveClip();g.clipRect({r.x+2,r.y+2,std::max(0,r.w-11),std::max(0,r.h-4)});for(const auto& row:rows_){auto box=gfx::Rect(row.box).offset(r.origin()+gfx::Point(0,-offset_));if(box.y2()<r.y||box.y>=r.y2())continue;int y=box.y+3,x=box.x+124;if(row.highlight){icons_.draw(g,row.item.icon,{box.x+3,y,11,11},true);font_.draw(g,row.item.label,box.x+18,y,skin_["muted"]);y+=16;x=box.x+3;}else font_.draw(g,row.item.label,box.x+3,y,skin_["muted"]);for(const auto& line:row.lines){font_.draw(g,line,x,y,skin_["text"]);y+=12;}}g.restoreClip();}
};
class ProjectInformationDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;ProjectInformationPane* content_;PixelButton *done_,*close_;
public:
 ProjectInformationDialog(const PixelFont& f,const Skin& s,const Skin& icons,const Document& d):PixelDialog(s,"",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow),font_(f),skin_(s){setAutoRemap(false);setWantFocus(true);setEnterBehavior(ui::PopupWindow::EnterBehavior::DoNothingOnEnter);content_=new ProjectInformationPane(f,s,icons,d);addChild(content_);done_=new PixelButton(f,s,U"完成",[this]{closeWindow(nullptr);});addChild(done_);close_=new PixelButton(f,s,U"",[this]{closeWindow(nullptr);});close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";addChild(close_);}
 gfx::Size minimumDialogSize(int)const override{return {360*uiScale,220*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();const int w=r.w/uiScale,h=r.h/uiScale;layoutHeaderButton(close_);const int footer=DialogLayout::footer(h);content_->setBounds(uiPhysical({6,DialogLayout::bodyTop,w-12,std::max(1,footer-6-DialogLayout::bodyTop)}).offset(r.origin()));done_->setBounds(uiPhysical({w-62,footer,56,textControlHeight}).offset(r.origin()));}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);drawDialogTitle(font_,g,uiLogical(clientBounds()),U"项目信息");}
 bool onProcessMessage(ui::Message* msg)override{if(processDialogGeometry(msg))return true;if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){closeWindow(nullptr);return true;}return PixelPopupWindow::onProcessMessage(msg);}
 void focusContent(){content_->requestFocus();}int detailCount()const{return content_->detailCount();}void smokeScroll(){content_->smokeScroll();}int scroll()const{return content_->scroll();}void smokeDone(){done_->Click();}
};
}

