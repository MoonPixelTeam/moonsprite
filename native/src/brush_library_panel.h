#pragma once
#include "pattern_brush_library.h"
#include "native_widgets.h"
#include "canvas_renderer.h"
#include "os/system.h"
#include "os/surface.h"
#include "ui/message.h"
#include "ui/resize_event.h"
#include <map>
#include <cmath>
#include "ui/tooltips.h"
namespace moon {
class BrushLibraryPanel final:public ui::Widget {
 const PixelFont& font_;const Skin& skin_;const Skin& icons_;
 struct Item {std::string id;std::u32string name;PatternBrush brush;bool folder=false;};
 std::vector<Item> items_;std::vector<std::string> selected_;std::map<std::string,os::SurfaceRef> images_;int scroll_=0,size_=30;bool externalDrop_=false;

 struct Drag{gfx::Point start;std::vector<std::string> base,moving,preview;std::string source,drop,clicked;bool moved=false,ctrl=false,shift=false;};
 std::optional<Drag> drag_;std::vector<std::string> allOrder_;std::map<std::string,std::string> itemFolders_;std::vector<Item> baseItems_;ui::TooltipManager* tips_=nullptr;std::string tip_;std::optional<std::size_t> folderDrop_;
 class Grid final:public ui::Widget {public:BrushLibraryPanel& owner;Grid(BrushLibraryPanel& p):ui::Widget(ui::kGenericWidget),owner(p){setTransparent(true);setFocusStop(true);}void onPaint(ui::PaintEvent& e)override{owner.paintGrid(*e.graphics(),clientBounds());}bool onProcessMessage(ui::Message* msg)override{
 if(owner.handleCommand(msg))return true;
 if(msg->type()==ui::kMouseWheelMessage){owner.cancelDrag();owner.scroll_=std::max(0,owner.scroll_+static_cast<ui::MouseMessage*>(msg)->wheelDelta().y);owner.clampScroll();invalidate();return true;}
 if(msg->type()==ui::kMouseDownMessage){if(!isEnabled())return true;auto m=static_cast<ui::MouseMessage*>(msg);requestFocus();if(m->right()){owner.cancelDrag();if(owner.context)owner.context();return true;}if(m->left()){const auto index=owner.indexAt(m->position());if(index&&*index<owner.items_.size()){const auto item=owner.items_[*index];if(item.folder){if(owner.navigate)owner.navigate(item.id);}else{if(owner.beginDrag(item.id,m->position(),m->ctrlPressed()||m->cmdPressed(),m->shiftPressed()))return true;if(owner.select)owner.select(item.id,m->ctrlPressed()||m->cmdPressed(),m->shiftPressed());}}return true;}}
 if(msg->type()==ui::kMouseMoveMessage){auto m=static_cast<ui::MouseMessage*>(msg);owner.updateTip(m->position());if(owner.drag_){owner.moveDrag(m->position());return true;}}
 if(msg->type()==ui::kMouseUpMessage&&owner.drag_){owner.finishDrag(static_cast<ui::MouseMessage*>(msg)->position());return true;}
 if(msg->type()==ui::kMouseLeaveMessage&&!owner.drag_)owner.updateTip({-1,-1});
 if(msg->type()==ui::kKeyDownMessage){auto k=static_cast<ui::KeyMessage*>(msg);if(k->scancode()==ui::kKeyDel||k->scancode()==ui::kKeyBackspace){owner.cancelDrag();if(owner.remove)owner.remove();return true;}}return ui::Widget::onProcessMessage(msg);}};

 Grid* grid_;PixelDropdown* folders_;std::vector<std::string> folderIds_;bool syncing_=false;std::string folder_;

 bool beginDrag(const std::string& id,gfx::Point point,bool ctrl,bool shift){cancelDrag();auto source=itemFolders_.find(id);if(source==itemFolders_.end())return false;Drag d;d.start=point;d.source=d.drop=source->second;d.base=d.preview=allOrder_;d.clicked=id;d.ctrl=ctrl;d.shift=shift;for(const auto& candidate:selected_){auto entry=itemFolders_.find(candidate);if(entry!=itemFolders_.end()&&entry->second==d.source)d.moving.push_back(candidate);}if(std::find(d.moving.begin(),d.moving.end(),id)==d.moving.end())d.moving={id};baseItems_=items_;drag_=std::move(d);grid_->captureMouse();return true;}
 void restorePreview(){if(!baseItems_.empty())items_=baseItems_;folderDrop_.reset();}
 void cancelDrag(){if(!drag_)return;restorePreview();drag_.reset();baseItems_.clear();if(grid_->hasCapture())grid_->releaseMouse();grid_->invalidate();}
 void applyPreview(const std::vector<std::string>& order){restorePreview();std::vector<Item> local;for(const auto& id:order)for(const auto& item:baseItems_)if(!item.folder&&item.id==id){local.push_back(item);break;}std::size_t next=0;for(auto& item:items_)if(!item.folder&&itemFolders_.count(item.id)&&next<local.size())item=local[next++];grid_->invalidate();}
 void moveDrag(gfx::Point point){if(!drag_)return;if(!grid_->hasCapture()||!grid_->isEnabled()||!grid_->isVisible()){cancelDrag();return;}auto& d=*drag_;const double dx=point.x-d.start.x,dy=point.y-d.start.y;if(!d.moved&&std::hypot(dx,dy)<4*uiScale)return;d.moved=true;const auto at=indexAt(point);if(at&&*at<items_.size()){const auto target=items_[*at];if(target.folder){d.drop=target.id;restorePreview();folderDrop_=at;grid_->invalidate();return;}auto found=itemFolders_.find(target.id);if(found!=itemFolders_.end()){d.drop=found->second;if(d.drop!=d.source){restorePreview();grid_->invalidate();return;}if(std::find(d.moving.begin(),d.moving.end(),target.id)==d.moving.end()){const auto box=grid_->bounds();const int col=int(*at%columns());const bool after=point.x>=box.x+(col*size_+size_/2)*uiScale;d.preview=reorderedPatternBrushIds(d.base,d.moving,target.id,after);applyPreview(d.preview);}return;}}
 d.drop=d.source;d.preview=reorderedPatternBrushIds(d.base,d.moving,"",false);applyPreview(d.preview);}
 void finishDrag(gfx::Point point){(void)point;if(!drag_)return;if(!grid_->hasCapture()){cancelDrag();return;}const auto d=*drag_;cancelDrag();if(!d.moved){if(select)select(d.clicked,d.ctrl,d.shift);return;}if(d.drop!=d.source){if(moveToFolder)moveToFolder(d.moving,d.drop);}else if(reorder)reorder(d.base,d.preview);}
 void updateTip(gfx::Point point){std::string next;const auto at=indexAt(point);if(at&&*at<items_.size()){const auto& item=items_[*at];next=utf8Text(item.name);if(!item.folder){next+=" ("+std::to_string(item.brush.width)+" × "+std::to_string(item.brush.height)+")";auto folder=itemFolders_.find(item.id);if(folder!=itemFolders_.end()&&!folder->second.empty())next+=" · "+std::filesystem::u8path(folder->second).filename().u8string();if(item.id.rfind("project:",0)==0)next+=" · 工程笔刷";}}if(next==tip_)return;tip_=std::move(next);tips_->removeTooltipFor(grid_);if(!tip_.empty())tips_->addTooltipFor(grid_,tip_);}
 int columns()const{return std::max(1,grid_->bounds().w/uiScale/size_);}int pageRows()const{return std::max(1,grid_->bounds().h/uiScale/size_);}
 void clampScroll(){scroll_=std::clamp(scroll_,0,std::max(0,int((items_.size()+columns()-1)/columns())-pageRows()));}
 std::optional<std::size_t> indexAt(gfx::Point p)const{const auto b=grid_->bounds();if(!b.contains(p))return {};const int x=(p.x-b.x)/uiScale,y=(p.y-b.y)/uiScale;if(x/size_>=columns())return {};return std::size_t(scroll_+y/size_)*columns()+x/size_;}
 void paintGrid(ui::Graphics& g,gfx::Rect physical){clampScroll();UiPaintScale scale(g);const auto r=uiLogical(physical);g.fillRect(skin_[externalDrop_?"accent":"panel"],r);g.saveClip();g.clipRect(r);for(int row=0;row<=pageRows();++row)for(int col=0;col<columns();++col){const auto at=std::size_t(row+scroll_)*columns()+col;if(at>=items_.size())continue;const auto& item=items_[at];gfx::Rect cell(r.x+col*size_,r.y+row*size_,size_,size_);const bool selected=std::find(selected_.begin(),selected_.end(),item.id)!=selected_.end();if(selected||(folderDrop_&&*folderDrop_==at))g.fillRect(skin_["accent"],cell);if(item.folder){icons_.draw(g,"folder",{cell.x+(cell.w-11)/2,cell.y+(cell.h-11)/2,11,11},true);continue;}auto& image=images_[item.id];if(!image&&item.brush.width>0&&item.brush.height>0){const auto& b=item.brush;image=os::instance()->makeRgbaSurface(b.width,b.height);if(image&&b.colors.size()==std::size_t(b.width)*b.height)uploadRgbaRegion(*image,b.colors.data(),b.width,b.height,b.width);}if(!image)continue;auto inside=cell;inside.shrink(2);for(int y=inside.y;y<inside.y2();y+=4)for(int x=inside.x;x<inside.x2();x+=4)g.fillRect(skin_[((x-inside.x)/4+(y-inside.y)/4)%2?"checkerA":"checkerB"],{x,y,std::min(4,inside.x2()-x),std::min(4,inside.y2()-y)});const double z=std::min(double(inside.w)/item.brush.width,double(inside.h)/item.brush.height);const int w=std::max(1,int(item.brush.width*z)),h=std::max(1,int(item.brush.height*z));ui::Paint paint;paint.blendMode(os::BlendMode::SrcOver);g.drawSurface(image.get(),{0,0,item.brush.width,item.brush.height},{inside.x+(inside.w-w)/2,inside.y+(inside.h-h)/2,w,h},os::Sampling(os::Sampling::Filter::Nearest),&paint);}if(items_.empty())font_.draw(g,U"暂无图案笔刷",r.x+2,r.y+2,skin_["muted"]);g.restoreClip();}
public:
 struct Resource{std::string id;std::u32string name;PatternBrush brush;};
 std::function<void(const std::vector<std::string>&,const std::string&)> moveToFolder;
 std::function<void(const std::vector<std::string>&,const std::vector<std::string>&)> reorder;
 std::function<void(const std::string&,bool,bool)> select;std::function<void(const std::string&)> navigate;std::function<void()> context,remove;
 BrushLibraryPanel(const PixelFont& f,const Skin& s,const Skin& icons):ui::Widget(ui::kGenericWidget),font_(f),skin_(s),icons_(icons){setTransparent(true);folders_=new PixelDropdown(f,s);addChild(folders_);folders_->changed=[this](int index){if(!syncing_&&index>=0&&std::size_t(index)<folderIds_.size()&&navigate)navigate(folderIds_[index]);};grid_=new Grid(*this);addChild(grid_);tips_=new ui::TooltipManager;addChild(tips_);}
 void setExternalDrop(bool active){if(externalDrop_==active)return;externalDrop_=active;grid_->invalidate();}
 bool externalDrop()const{return externalDrop_;}
 void cancelPending(){cancelDrag();setExternalDrop(false);}
 bool handleCommand(ui::Message* msg){if(!drag_)return false;if(msg->type()==ui::kFocusLeaveMessage){auto focus=dynamic_cast<ui::FocusMessage*>(msg);if(!focus||!owns(focus->newFocus()))cancelDrag();return false;}if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){cancelDrag();return true;}return false;}

 void smokeDrag(){
 auto require=[](bool ok,const char* why){if(!ok)throw std::runtime_error(why);};auto savedSelect=select;auto savedMove=moveToFolder;auto savedReorder=reorder;const auto savedBounds=bounds();const auto savedSize=size_;int clicks=0,moves=0,orders=0;std::vector<std::string> moved,next;std::string target;
 select=[&](const std::string&,bool,bool){++clicks;};moveToFolder=[&](const std::vector<std::string>& ids,const std::string& folder){++moves;moved=ids;target=folder;};reorder=[&](const std::vector<std::string>&,const std::vector<std::string>& ids){++orders;next=ids;};
 PatternBrushListing listing;listing.folders.push_back({"Actors","Actors",""});for(const auto& id:{"a.png","b.png","c.png"}){StoredPatternBrush item;item.id=id;listing.brushes.push_back(item);}PatternBrush brush=createPatternBrushFromRgba(1,1,{255,0,0,255});std::vector<Resource> local{{"a.png",U"A",brush},{"b.png",U"B",brush},{"c.png",U"C",brush}};
 setSize(30);setBounds({23,31,240*uiScale,180*uiScale});setResources(listing,"",local,{});syncSelection({"c.png","a.png"},true);
 auto center=[&](int i){return gfx::Point(grid_->bounds().x+(i*size_+size_/2)*uiScale,grid_->bounds().y+size_/2*uiScale);};
 auto pointer=[&](ui::MessageType type,gfx::Point point){ui::MouseMessage m(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);grid_->onProcessMessage(&m);};
 auto start=center(1);pointer(ui::kMouseDownMessage,start);pointer(ui::kMouseMoveMessage,{start.x+3*uiScale,start.y});require(drag_&&!drag_->moved,"Brush threshold below four logical pixels");pointer(ui::kMouseUpMessage,{start.x+3*uiScale,start.y});require(clicks==1&&orders==0,"Brush plain click commits selection only");
 pointer(ui::kMouseDownMessage,start);pointer(ui::kMouseMoveMessage,center(2));require(drag_&&drag_->moved,"Brush drag threshold");ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);handleCommand(&escape);require(!drag_&&!grid_->hasCapture()&&orders==0&&moves==0&&selected_==std::vector<std::string>({"c.png","a.png"}),"Brush Escape restores preview and selection");
 pointer(ui::kMouseDownMessage,start);pointer(ui::kMouseMoveMessage,center(0));pointer(ui::kMouseUpMessage,center(0));require(moves==1&&target=="Actors"&&moved==std::vector<std::string>({"c.png","a.png"}),"Brush multi selection directory target");
 pointer(ui::kMouseDownMessage,start);auto blank=center(5);pointer(ui::kMouseMoveMessage,blank);pointer(ui::kMouseUpMessage,blank);require(orders==1&&next==std::vector<std::string>({"b.png","a.png","c.png"}),"Brush drag blank appends in base order");
 pointer(ui::kMouseDownMessage,start);grid_->releaseMouse();pointer(ui::kMouseMoveMessage,center(0));require(!drag_&&moves==1,"Brush capture loss cancels");
 pointer(ui::kMouseDownMessage,start);ui::FocusMessage blur(ui::kFocusLeaveMessage,grid_,nullptr);handleCommand(&blur);require(!drag_,"Brush outside blur cancels");
 pointer(ui::kMouseDownMessage,start);setBounds({25,35,220*uiScale,180*uiScale});require(!drag_&&moves==1&&orders==1,"Brush resize cancels");updateTip(center(1));require(!tip_.empty(),"Brush title tooltip");updateTip({-1,-1});
 select=std::move(savedSelect);moveToFolder=std::move(savedMove);reorder=std::move(savedReorder);setSize(savedSize);setBounds(savedBounds);
 }
 bool owns(ui::Widget* w)const{for(;w;w=w->parent())if(w==this)return true;return false;}
 gfx::Rect resourceBounds()const{return grid_->bounds();}
 void setSize(int value){cancelDrag();size_=value==40||value==52?value:30;scroll_=0;clampScroll();grid_->invalidate();}int swatchSize()const{return size_;}
 void setResources(const PatternBrushListing& listing,const std::string& folder,const std::vector<Resource>& local,const std::vector<Resource>& project){cancelDrag();allOrder_.clear();itemFolders_.clear();for(const auto& item:listing.brushes){allOrder_.push_back(item.id);itemFolders_[item.id]=item.folderId;}syncing_=true;std::vector<std::u32string> names{U"根文件夹"};folderIds_={""};int selected=0;for(const auto& item:listing.folders){if(item.id==folder)selected=int(folderIds_.size());folderIds_.push_back(item.id);names.push_back(unicodeText(item.id));}folders_->setOptions(names);folders_->setSelectedIndex(selected);if(folder_!=folder){folder_=folder;scroll_=0;}items_.clear();images_.clear();if(!folder.empty()){const auto slash=folder.find_last_of('/');items_.push_back({slash==std::string::npos?std::string():folder.substr(0,slash),U"返回上一级",{},true});}for(const auto& item:listing.folders){const auto slash=item.id.find_last_of('/');const auto parent=slash==std::string::npos?std::string():item.id.substr(0,slash);if(parent==folder)items_.push_back({item.id,unicodeText(item.name),{},true});}for(const auto& item:local)items_.push_back({item.id,item.name,item.brush,false});if(folder.empty())for(const auto& item:project)items_.push_back({item.id,item.name,item.brush,false});syncing_=false;clampScroll();grid_->invalidate();}
 void syncSelection(const std::vector<std::string>& ids,bool enabled){selected_=ids;grid_->setEnabled(enabled);folders_->setEnabled(enabled);if(!enabled)cancelDrag();grid_->invalidate();}
 void onResize(ui::ResizeEvent& ev)override{if(bounds()!=ev.bounds())cancelDrag();setBoundsQuietly(ev.bounds());const auto r=bounds();folders_->setBounds({r.x,r.y,r.w,textControlHeight*uiScale});const int top=(textControlHeight+UiSpacing::related)*uiScale;grid_->setBounds({r.x,r.y+top,r.w,std::max(1,r.h-top)});clampScroll();}
};
}
