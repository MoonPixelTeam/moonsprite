#pragma once
#include "document.h"
#include "tileset_management_panel.h"
#include "native_widgets.h"
#include "canvas_renderer.h"
#include "os/system.h"
#include "os/surface.h"
#include "ui/message.h"
#include "ui/resize_event.h"
#include <map>
#include <array>
namespace moon {
class TilemapLayerDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;bool convert_;std::vector<tiles::Tileset> sets_;PixelEntry *name_,*width_,*height_;PixelDropdown* shared_;PixelButton *close_,*ok_,*cancel_;std::u32string error_;
 int dimension(PixelEntry* entry){if(!entry->commitExpression())throw std::invalid_argument("请输入整数尺寸");std::size_t end=0;const auto n=std::stoi(entry->text(),&end);if(end!=entry->text().size()||n<1||n>256)throw std::invalid_argument("瓦片宽高须为 1..256");return n;}
 void submit(){try{const auto i=shared_->selectedIndex();std::string shared;if(!convert_&&i>0)shared=sets_.at(std::size_t(i-1)).id;if(!accept(unicodeText(name_->text()),dimension(width_),dimension(height_),shared))throw std::runtime_error("无法创建瓦片图层");closeWindow(nullptr);}catch(const std::exception& e){error_=unicodeText(e.what());invalidate();}}
public:
 std::function<bool(std::u32string,int,int,const std::string&)> accept;
 TilemapLayerDialog(const PixelFont& font,const Skin& skin,const Skin& icons,const Document& doc,bool convert):PixelDialog(skin,""),font_(font),skin_(skin),convert_(convert){setAutoRemap(false);setWantFocus(true);name_=new PixelEntry(font,skin);width_=new PixelEntry(font,skin);height_=new PixelEntry(font,skin);for(auto e:{name_,width_,height_}){addChild(e);e->accept=[this]{submit();};}width_->numeric=height_->numeric=true;name_->setText(utf8Text(convert?doc.layer().name:U"瓦片图层"));width_->setText(std::to_string(std::min(16,doc.width())));height_->setText(std::to_string(std::min(16,doc.height())));shared_=new PixelDropdown(font,skin);addChild(shared_);std::vector<std::u32string> options{U"新建瓦片集"};for(const auto& t:doc.timeline().state().tilesets)if(std::any_of(doc.timeline().state().layers.begin(),doc.timeline().state().layers.end(),[&](const auto& l){return l.kind=="tilemap"&&l.tilemapTilesetId==t.id;})){tiles::Tileset header;header.id=t.id;header.name=t.name;header.tileWidth=t.tileWidth;header.tileHeight=t.tileHeight;sets_.push_back(std::move(header));options.push_back(t.name);}shared_->setOptions(options);shared_->setSelectedIndex(0);shared_->changed=[this](int i){const bool use=i>0;width_->setEnabled(!use);height_->setEnabled(!use);if(use){width_->setText(std::to_string(sets_.at(i-1).tileWidth));height_->setText(std::to_string(sets_.at(i-1).tileHeight));}};shared_->setVisible(!convert_);close_=new PixelButton(font,skin,U"",[this]{closeWindow(nullptr);});close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";ok_=new PixelButton(font,skin,convert?U"转换":U"创建",[this]{submit();});cancel_=new PixelButton(font,skin,U"取消",[this]{closeWindow(nullptr);});for(auto b:{close_,ok_,cancel_})addChild(b);}
 gfx::Size minimumDialogSize(int)const override{return {250*uiScale,210*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();const int w=r.w/uiScale;auto place=[&](ui::Widget* c,int x,int y,int width){c->setBounds({r.x+x*uiScale,r.y+y*uiScale,width*uiScale,textControlHeight*uiScale});};layoutHeaderButton(close_);place(name_,6,DialogLayout::field(),w-12);place(width_,6,DialogLayout::field(1),(w-14)/2);place(height_,8+(w-14)/2,DialogLayout::field(1),(w-14)/2);place(shared_,6,DialogLayout::field(2),w-12);place(ok_,w/2-65,r.h/uiScale-textControlHeight-6,62);place(cancel_,w/2+3,r.h/uiScale-textControlHeight-6,62);}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,convert_?U"转换为瓦片图层":U"新建瓦片图层");font_.draw(g,U"图层名称",r.x+6,r.y+DialogLayout::label(),skin_["text"]);font_.draw(g,U"瓦片宽度",r.x+6,r.y+DialogLayout::label(1),skin_["text"]);font_.draw(g,U"瓦片高度",r.x+8+(r.w-14)/2,r.y+DialogLayout::label(1),skin_["text"]);if(!convert_)font_.draw(g,U"瓦片集",r.x+6,r.y+DialogLayout::label(2),skin_["text"]);if(!error_.empty())font_.draw(g,error_,r.x+6,r.y+r.h-textControlHeight-24,skin_["text"]);}
};
// Legacy FreeTileLayerDialog: name plus new/shared collection, no tile-size fields.
class FreeTileLayerDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;PixelEntry* name_;PixelDropdown* sets_;PixelButton *close_,*ok_,*cancel_;std::vector<std::string> ids_;std::u32string error_;
 static int footerY(){return DialogLayout::field(1)+textControlHeight+6+10+6;}
 void submit(){try{auto name=unicodeText(name_->text());if(name.size()>96)throw std::invalid_argument("名称最多96个字符");const auto i=sets_->selectedIndex();if(!accept(name,i>0?ids_.at(std::size_t(i-1)):std::string{}))throw std::runtime_error("无法创建自由瓦片图层");closeWindow(nullptr);}catch(const std::exception& e){error_=unicodeText(e.what());invalidate();}}
public:
 std::function<bool(std::u32string,const std::string&)> accept;
 FreeTileLayerDialog(const PixelFont& font,const Skin& skin,const Skin& icons,const Document& doc):PixelDialog(skin,""),font_(font),skin_(skin){
  setAutoRemap(false);setWantFocus(true);name_=new PixelEntry(font,skin);name_->setText(utf8Text(U"自由瓦片图层"));name_->accept=[this]{submit();};sets_=new PixelDropdown(font,skin);std::vector<std::u32string> names{U"新建自由瓦片集"};
  for(const auto& l:doc.timeline().state().layers)if(l.freeTiles&&!l.freeTiles->sources.empty()&&std::find(ids_.begin(),ids_.end(),l.freeTiles->setId)==ids_.end()){ids_.push_back(l.freeTiles->setId);names.push_back(l.name);}
  sets_->setOptions(names);sets_->setSelectedIndex(0);close_=new PixelButton(font,skin,U"",[this]{closeWindow(nullptr);});close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";ok_=new PixelButton(font,skin,U"创建",[this]{submit();});cancel_=new PixelButton(font,skin,U"取消",[this]{closeWindow(nullptr);});for(ui::Widget* w:std::array<ui::Widget*,5>{name_,sets_,close_,ok_,cancel_})addChild(w);
 }
 gfx::Size minimumDialogSize(int)const override{return {260*uiScale,(footerY()+textControlHeight+6)*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();const int w=r.w/uiScale;layoutHeaderButton(close_);auto place=[&](ui::Widget* c,int x,int y,int width){c->setBounds({r.x+x*uiScale,r.y+y*uiScale,width*uiScale,textControlHeight*uiScale});};place(name_,6,DialogLayout::field(),w-12);place(sets_,6,DialogLayout::field(1),w-12);const int y=r.h/uiScale-textControlHeight-6;place(cancel_,w-132,y,62);place(ok_,w-68,y,62);}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"新建自由瓦片图层");font_.draw(g,U"图层名称",r.x+6,r.y+DialogLayout::label(),skin_["text"]);font_.draw(g,U"自由瓦片集",r.x+6,r.y+DialogLayout::label(1),skin_["text"]);if(!error_.empty())font_.draw(g,error_,r.x+6,r.y+footerY()-16,skin_["text"]);}
 void smoke(int mode){if(mode==1)closeWindow(nullptr);else{if(mode==3&&!ids_.empty())sets_->setSelectedIndex(1);submit();}}
};

}
