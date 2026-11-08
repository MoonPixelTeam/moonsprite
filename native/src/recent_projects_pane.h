#pragma once
#include "native_widgets.h"
#include "recent_projects.h"
#include "recent_preview_queue.h"
#include "os/surface.h"
#include "ui/paint.h"
#include "ui/message.h"
#include "ui/resize_event.h"
#include <ctime>
namespace moon {
class RecentOpenButton final:public PixelButton {
 recent::PreviewQueue::Value preview_;os::SurfaceRef image_;

public:recent::Project project;bool concealed=false,gallery=false;std::string error;int density=1;std::function<void()> middle;
 RecentOpenButton(const PixelFont& f,const Skin& s,std::function<void()> open):PixelButton(f,s,U"",std::move(open)){}
 void setPreview(recent::PreviewQueue::Value value){if(value==preview_)return;preview_=std::move(value);image_.reset();if(preview_&&preview_->error.empty()&&!preview_->pixels.empty()){image_=os::instance()->makeRgbaSurface(preview_->previewWidth,preview_->previewHeight);if(image_){os::SurfaceLock lock(image_.get());for(int y=0;y<preview_->previewHeight;++y)for(int x=0;x<preview_->previewWidth;++x){auto p=preview_->pixels[std::size_t(y)*preview_->previewWidth+x];image_->putPixel(gfx::rgba(p&255,(p>>8)&255,(p>>16)&255,p>>24),x,y);}}}invalidate();}
 bool hasPreview()const{return bool(image_);}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kMouseUpMessage){auto m=static_cast<ui::MouseMessage*>(msg);if(m->button()==ui::kButtonMiddle&&bounds().contains(m->position())&&(!paletteViewport||paletteViewport().contains(m->position()))){if(middle)middle();return true;}}return PixelButton::onProcessMessage(msg);}
 void onPaint(ui::PaintEvent& ev)override{
 PixelButton::onPaint(ev);auto& g=*ev.graphics();PhysicalViewportClip clip(g,paletteViewport?std::optional<gfx::Rect>(paletteViewport().offset(-bounds().origin())):std::nullopt);UiPaintScale scale(g);auto r=uiLogical(clientBounds());g.saveClip();g.clipRect({r.x+1,r.y+1,std::max(0,r.w-2),std::max(0,r.h-2)});
 auto trim=[&](std::u32string t,int w){while(!t.empty()&&font_.measure(t)>w)t.pop_back();return t;};const auto name=concealed?U"已隐藏工程":unicodeText(gallery?std::filesystem::u8path(project.path).stem().u8string():recent::baseName(project.path));const auto path=concealed?U"********":unicodeText(project.path);
 if(density==0){font_.draw(g,trim(name,(r.w-12)*42/100),r.x+6,r.y+(r.h-10)/2,skin_["text"]);font_.draw(g,trim(path,(r.w-12)*58/100-6),r.x+6+(r.w-12)*42/100,r.y+(r.h-10)/2,skin_["muted"]);g.restoreClip();return;}
 gfx::Rect box=density==2?gfx::Rect(r.x+6,r.y+6,std::max(1,r.w-12),120):gfx::Rect(r.x+6,r.y+(r.h-62)/2,84,62);
 for(int y=box.y;y<box.y2();y+=4)for(int x=box.x;x<box.x2();x+=4)g.fillRect((((x-box.x)/4+(y-box.y)/4)&1)?skin_["checkerA"]:skin_["checkerB"],{x,y,std::min(4,box.x2()-x),std::min(4,box.y2()-y)});
 if(!concealed&&image_){const double zoom=std::max(double(box.w)/image_->width(),double(box.h)/image_->height());const int w=std::max(1,int(std::lround(image_->width()*zoom))),h=std::max(1,int(std::lround(image_->height()*zoom)));g.saveClip();g.clipRect(box);ui::Paint paint;paint.blendMode(os::BlendMode::SrcOver);g.drawSurface(image_.get(),{0,0,image_->width(),image_->height()},{box.x+(box.w-w)/2,box.y+(box.h-h)/2,w,h},os::Sampling(),&paint);g.restoreClip();}else if(iconSkin)iconSkin->draw(g,concealed?"eyeOff":"image",{box.x+(box.w-15)/2,box.y+(box.h-15)/2,15,15},true);
 const auto detail=concealed?U"点击仍可打开工程":!error.empty()?U"打开失败":preview_&&!preview_->error.empty()?U"无法读取预览":preview_?unicodeText(std::to_string(preview_->width)+" x "+std::to_string(preview_->height)+" · "+preview_->colorMode):U"正在读取预览";
 const int x=density==2?r.x+6:box.x2()+6,y=density==2?box.y2()+2:r.y+(r.h-34)/2,w=r.x2()-x-6;font_.draw(g,trim(name,w),x,y,skin_["text"]);font_.draw(g,trim(detail,w),x,y+12,skin_["muted"]);font_.draw(g,trim(path,w),x,y+24,skin_["muted"]);g.restoreClip();
 }

};
class RecentReorderButton final:public PixelButton {
 bool dragging_=false;
public:std::function<void(gfx::Point)> begin,move;std::function<void(gfx::Point,bool)> end;
 RecentReorderButton(const PixelFont& f,const Skin& s):PixelButton(f,s,U"",[]{}){}
 bool onProcessMessage(ui::Message* msg)override{if(auto mouse=dynamic_cast<ui::MouseMessage*>(msg)){if(msg->type()==ui::kMouseDownMessage&&mouse->left()&&bounds().contains(mouse->position())&&(!paletteViewport||paletteViewport().contains(mouse->position()))){dragging_=true;captureMouse();if(begin)begin(mouse->position());return true;}if(msg->type()==ui::kMouseMoveMessage&&dragging_&&hasCapture()){if(move)move(mouse->position());return true;}if(msg->type()==ui::kMouseUpMessage&&dragging_){dragging_=false;if(hasCapture())releaseMouse();if(end)end(mouse->position(),false);return true;}}if(msg->type()==ui::kFocusLeaveMessage&&dragging_){dragging_=false;if(hasCapture())releaseMouse();if(end)end(bounds().center(),true);}return PixelButton::onProcessMessage(msg);}
};
class RecentProjectsPane final:public ui::Widget {
 const PixelFont& font_;const Skin& skin_;const Skin& icons_;PixelScrollBar* bar_;int scroll_=0,density_=1;bool hidden_=false,active_=false,gallery_=false;std::string dragging_;bool removePending_=false;std::vector<recent::Project> values_;std::map<std::string,std::string> errors_;
 recent::PreviewQueue queue_;std::map<std::string,recent::PreviewQueue::Value> previews_;std::filesystem::path cacheDirectory_;ui::Timer previewTimer_{32,this};
 int rowHeight()const{return density_==0?34:density_==1?78:180;}int rowStep()const{return rowHeight()+(density_==2?6:2);}int columns()const{return density_==2?4:1;}
 void requestPreviews(bool force=false){if(!active_)return;std::vector<recent::Project> visible;for(auto i:rowIndices_)if(i<values_.size())visible.push_back(values_[i]);queue_.request(visible,cacheDirectory_,force);}
 void collect(){auto results=queue_.take();if(results.empty())return;for(auto& r:results)previews_[r.key]=std::move(r.value);layout();invalidate();}
 struct Row {RecentOpenButton* open;PixelButton *pin,*remove;RecentReorderButton* move;gfx::Rect card;};std::vector<Row> rows_;std::vector<std::size_t> rowIndices_;
 void layout(){auto r=bounds();const int cols=columns(),gap=(density_==2?6:2)*uiScale,pad=(density_==2?6:0)*uiScale,total=values_.empty()?0:2*pad+((int(values_.size())+cols-1)/cols)*rowStep()*uiScale-gap;scroll_=std::clamp(scroll_,0,std::max(0,total-r.h));const int width=std::max(1,r.w-7*uiScale),cardWidth=std::max(1,(width-2*pad-(cols-1)*gap)/cols),actions=(gallery_?32:49)*uiScale;
 const std::size_t first=std::size_t(std::max(0,(scroll_-pad)/(rowStep()*uiScale)))*cols,limit=std::min(values_.size(),first+std::size_t((std::max(0,r.h)/(rowStep()*uiScale)+3)*cols));
 rowIndices_.clear();for(auto i=first;i<limit;++i)rowIndices_.push_back(i);ensureRows(rowIndices_.size());
 std::set<std::string> keep;for(auto i:rowIndices_)keep.insert(recent::previewKey(values_[i]));for(auto i=previews_.begin();i!=previews_.end();)if(!keep.count(i->first))i=previews_.erase(i);else ++i;
 for(std::size_t slot=0;slot<rows_.size();++slot){auto& row=rows_[slot];row.remove->icon=gallery_?"delete":"close";const bool exists=slot<rowIndices_.size();const auto i=exists?rowIndices_[slot]:values_.size();const bool show=active_&&exists;gfx::Rect b(r.x+pad+int(i%cols)*(cardWidth+gap),r.y+pad+int(i/cols)*rowStep()*uiScale-scroll_,cardWidth,rowHeight()*uiScale);row.card=b;auto put=[&](PixelButton* button,gfx::Rect box){button->paletteViewport=[this]{return bounds();};button->setBounds(box);button->setVisible(show&&r.intersects(box));button->setEnabled(isEnabled());};put(row.open,{b.x,b.y,density_==2?b.w:std::max(1,b.w-actions-2*uiScale),b.h});put(row.pin,{b.x2()-actions,b.y,15*uiScale,15*uiScale});put(row.remove,{b.x2()-(gallery_?15:32)*uiScale,b.y,15*uiScale,15*uiScale});put(row.move,{b.x2()-15*uiScale,b.y,15*uiScale,15*uiScale});row.move->setVisible(show&&!gallery_&&density_!=2&&r.intersects(row.move->bounds()));
 if(exists){row.open->project=values_[i];row.open->gallery=gallery_;row.open->density=density_;row.open->concealed=hidden_;const auto error=errors_.find(values_[i].path);row.open->error=error==errors_.end()?std::string{}:error->second;auto p=previews_.find(recent::previewKey(values_[i]));row.open->setPreview(p==previews_.end()?recent::PreviewQueue::Value{}:p->second);row.pin->active=values_[i].pinned;row.remove->setVisible(show&&(gallery_||density_!=2&&!row.open->error.empty())&&r.intersects(row.remove->bounds()));if(density_==2&&!gallery_)row.pin->setVisible(false);}else row.open->setPreview({});
 }bar_->setBounds({r.x2()-7*uiScale,r.y,7*uiScale,r.h});bar_->configure(total,r.h,scroll_);bar_->wheelStep=rowStep()*uiScale;bar_->setVisible(active_&&total>r.h);requestPreviews();}
 void ensureRows(std::size_t count){while(rows_.size()<count){const auto slot=rows_.size();auto row=Row{};auto index=[this,slot]{return slot<rowIndices_.size()?rowIndices_[slot]:values_.size();};row.open=new RecentOpenButton(font_,skin_,[this,index]{auto i=index();if(i<values_.size()&&open)open(values_[i].path,false);});row.open->middle=[this,index]{auto i=index();if(i<values_.size()&&open)open(values_[i].path,true);};row.open->context=[this,index]{auto i=index();if(i<values_.size()&&folder)folder(values_[i].path);};row.pin=new PixelButton(font_,skin_,U"",[this,index]{auto i=index();if(i<values_.size()&&pin)pin(values_[i].path);});row.remove=new PixelButton(font_,skin_,U"",[this,index]{auto i=index();if(i<values_.size()&&remove)remove(values_[i].path);});row.move=new RecentReorderButton(font_,skin_);row.move->begin=[this,index](gfx::Point){auto i=index();if(!gallery_&&i<values_.size())dragging_=values_[i].path;};row.move->move=[this](gfx::Point p){dragMove(p);};row.move->end=[this](gfx::Point p,bool cancel){const auto path=dragging_;const bool outside=!cancel&&!bounds().contains(p);dragging_.clear();removePending_=false;if(outside){if(remove)remove(path);}else if(reordered){std::vector<std::string> order;for(const auto& v:values_)order.push_back(v.path);reordered(std::move(order));}};row.pin->icon="pin";row.remove->icon="close";row.move->icon="move";for(auto button:{static_cast<PixelButton*>(row.open),row.pin,row.remove,static_cast<PixelButton*>(row.move)}){button->iconSkin=&icons_;if(button!=row.open)button->skinStyle="icon_button";addChild(button);}rows_.push_back(row);}}
 void dragMove(gfx::Point point){removePending_=!bounds().contains(point);if(removePending_){invalidate();return;}auto source=std::find_if(values_.begin(),values_.end(),[&](const auto& v){return v.path==dragging_;});const int target=(point.y-bounds().y+scroll_)/(rowStep()*uiScale);if(source==values_.end()||target<0||target>=int(values_.size())||values_[target].pinned!=source->pinned)return;const auto targetPath=values_[target].path;if(targetPath==dragging_)return;auto item=*source;values_.erase(source);auto at=std::find_if(values_.begin(),values_.end(),[&](const auto& v){return v.path==targetPath;});if(at==values_.end())return;const int rowY=bounds().y+target*rowStep()*uiScale-scroll_;if(point.y>=rowY+rowHeight()*uiScale/2)++at;values_.insert(at,std::move(item));layout();invalidate();}
public:
 std::function<void(const std::string&,bool)> open;std::function<void(const std::string&)> pin,remove,folder;std::function<void(std::vector<std::string>)> reordered;std::function<void(int)> densityChanged;
 RecentProjectsPane(const PixelFont& f,const Skin& s,const Skin& icons):ui::Widget(ui::kGenericWidget),font_(f),skin_(s),icons_(icons){setTransparent(true);setFocusStop(true);bar_=new PixelScrollBar(s,true);addChild(bar_);bar_->changed=[this](int value){scroll_=value;layout();invalidate();};previewTimer_.Tick.connect([this]{collect();});}
 void setGallery(bool value){if(gallery_==value)return;gallery_=value;scroll_=0;layout();}
 void setProjects(const std::vector<recent::Project>& values,const std::map<std::string,std::string>& errors,bool hidden){bool same=values.size()==values_.size()&&errors==errors_&&hidden==hidden_;if(same)for(std::size_t i=0;i<values.size();++i)if(values[i].path!=values_[i].path||values[i].lastOpened!=values_[i].lastOpened||values[i].pinned!=values_[i].pinned){same=false;break;}if(same)return;values_=values;errors_=errors;hidden_=hidden;layout();invalidate();}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());layout();}
 void setDensity(int value){value=std::clamp(value,0,2);if(density_==value)return;density_=value;scroll_=0;layout();invalidate();}
 int density()const{return density_;}
 ~RecentProjectsPane(){previewTimer_.stop();}
 void setCacheDirectory(std::filesystem::path directory){cacheDirectory_=std::move(directory);}
 void setActive(bool active){if(active_==active)return;active_=active;if(active_){requestPreviews();previewTimer_.start();}else{queue_.cancel();previewTimer_.stop();}layout();}
 void reloadPreviews(){requestPreviews(true);}
 bool smokePreview(std::size_t i){collect();return rows_.at(smokeSlot(i)).open->hasPreview();}
 gfx::Rect smokeCard(std::size_t i)const{return rows_.at(smokeSlot(i)).card;}

 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kMouseWheelMessage){auto mouse=static_cast<ui::MouseMessage*>(msg);if(mouse->ctrlPressed()||mouse->cmdPressed()){const int next=std::clamp(density_+(mouse->wheelDelta().y<0?1:-1),0,2);setDensity(next);if(densityChanged)densityChanged(next);return true;}scroll_+=mouse->wheelDelta().y*rowStep()*uiScale;layout();invalidate();return true;}if(msg->type()==ui::kKeyDownMessage){const auto code=static_cast<ui::KeyMessage*>(msg)->scancode();if(code==ui::kKeyUp||code==ui::kKeyDown||code==ui::kKeyPageUp||code==ui::kKeyPageDown){scroll_+=(code==ui::kKeyUp||code==ui::kKeyPageUp?-1:1)*(code==ui::kKeyUp||code==ui::kKeyDown?rowStep()*uiScale:bounds().h);layout();invalidate();return true;}}return ui::Widget::onProcessMessage(msg);}
 void onPaint(ui::PaintEvent& ev)override{if(!removePending_)return;auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());font_.draw(g,U"松开以从最近文件移除",r.x+3,r.y+3,skin_["text"]);}
 std::size_t smokeSlot(std::size_t i)const{auto it=std::find(rowIndices_.begin(),rowIndices_.end(),i);if(it==rowIndices_.end())throw std::out_of_range("Card not in viewport");return std::size_t(it-rowIndices_.begin());}
 void smokeScrollTo(int value){scroll_=value;layout();}std::size_t controlRows()const{return rows_.size();}
 std::size_t count()const{return values_.size();}void smokePin(std::size_t i){rows_.at(smokeSlot(i)).pin->Click();}void smokeRemove(std::size_t i){rows_.at(smokeSlot(i)).remove->Click();}void smokeOpen(std::size_t i){rows_.at(smokeSlot(i)).open->Click();}
};
}
