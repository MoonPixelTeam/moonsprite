#pragma once
#include "tween_path_draft.h"
#include "tween_path_presets.h"
#include "native_widgets.h"
#include "ui/manager.h"
#include "ui/message.h"
#include "ui/paint.h"
#include "ui/resize_event.h"
#include "os/os.h"
#include "os/surface.h"
#include "os/sampling.h"
namespace moon {
inline void drawTweenPathPixels(ui::Graphics& g,const TweenPath& path,TweenPathPoint anchor,double ox,double oy,double zoom,gfx::Rect clip,bool showAnchor=true){
 if(path.empty()||zoom<=0)return;const double minX=std::floor((clip.x-ox)/zoom),maxX=std::ceil((clip.x2()-ox)/zoom),minY=std::floor((clip.y-oy)/zoom),maxY=std::ceil((clip.y2()-oy)/zoom);
 auto pixel=[&](TweenPathPoint p,gfx::Color color){int x=int(std::floor(ox+p.x*zoom+.5)),y=int(std::floor(oy+p.y*zoom+.5)),r=int(std::floor(ox+(p.x+1)*zoom+.5)),b=int(std::floor(oy+(p.y+1)*zoom+.5));g.fillRect(color,{x,y,std::max(1,r-x),std::max(1,b-y)});};
 for(std::size_t i=1;i<path.size();++i){TweenPathPoint a{anchor.x+path[i-1].x,anchor.y+path[i-1].y},b{anchor.x+path[i].x,anchor.y+path[i].y};double dx=b.x-a.x,dy=b.y-a.y,enter=0,leave=1;bool visible=true;for(auto pair:std::array<std::pair<double,double>,4>{{{-dx,a.x-minX},{dx,maxX-a.x},{-dy,a.y-minY},{dy,maxY-a.y}}}){auto p=pair.first,q=pair.second;if(p==0){if(q<0)visible=false;continue;}double ratio=q/p;if(p<0)enter=std::max(enter,ratio);else leave=std::min(leave,ratio);}if(!visible||enter>leave)continue;TweenPath run;appendTweenPerfectPixel(run,{std::floor(a.x+dx*enter+.5),std::floor(a.y+dy*enter+.5)});appendTweenPerfectPixel(run,{std::floor(a.x+dx*leave+.5),std::floor(a.y+dy*leave+.5)});for(auto p:run)pixel(p,gfx::rgba(41,121,255));}
 auto mark=[&](TweenPathPoint p,gfx::Color c){p.x+=anchor.x;p.y+=anchor.y;if(p.x>=minX&&p.x<=maxX&&p.y>=minY&&p.y<=maxY)pixel(p,c);};mark(path.back(),gfx::rgba(255,255,255));if(showAnchor)mark(path.front(),gfx::rgba(255,179,0));
}
class TweenPathSurface final:public ui::Widget {
 const Skin& skin_;const Skin& icons_;TweenRegion pivot_;int documentWidth_,documentHeight_;os::SurfaceRef artwork_;int artworkX_=0,artworkY_=0;
 struct Gesture {int mode;TweenPathDraft initial,points;gfx::Point start;double ox,oy,zoom;std::optional<TweenPathDraft> lineBase;};std::optional<Gesture> gesture_;std::optional<TweenPathDraft> draft_;std::optional<TweenPath> line_;std::optional<gfx::Point> pointer_;
 bool viewSet_=false;double ox_=0,oy_=0,zoom_=1;
 void notify(){if(changed)changed();invalidate();}
 void ensureView(){if(!viewSet_)fit();}
 TweenPathPoint documentPoint(gfx::Point p,double ox,double oy,double z)const{return {tweenPathClamp((p.x-bounds().x-ox)/z),tweenPathClamp((p.y-bounds().y-oy)/z)};}
public:
 TweenPathHistory history;int mode=0;bool spaceHeld=false;gfx::Color checkerLight,checkerDark;int checkerSize=8;std::function<void()> changed;
 TweenPathSurface(const Skin& skin,const Skin& icons,TweenPath initial,std::optional<TweenPathPoint> anchor,TweenRegion pivot,int dw,int dh,const std::optional<timeline::Surface>& artwork):ui::Widget(ui::kGenericWidget),skin_(skin),icons_(icons),pivot_(pivot),documentWidth_(dw),documentHeight_(dh),checkerLight(skin["checkerA"]),checkerDark(skin["checkerB"]){setFocusStop(true);history.present.path=tweenPathReady(initial)?std::move(initial):TweenPath{{0,0}};for(auto& p:history.present.path){p.x=std::floor(p.x+.5);p.y=std::floor(p.y+.5);}history.present.anchor=anchor.value_or(TweenPathPoint{std::floor(pivot.x+pivot.width/2.),std::floor(pivot.y+pivot.height/2.)});if(artwork){artworkX_=artwork->offsetX;artworkY_=artwork->offsetY;artwork_=os::instance()->makeRgbaSurface(artwork->width,artwork->height);if(!artwork_)throw std::runtime_error("Cannot create path artwork");os::SurfaceLock lock(artwork_.get());for(int y=0;y<artwork->height;++y)for(int x=0;x<artwork->width;++x){auto p=artwork->pixels[std::size_t(y)*artwork->width+x];artwork_->putPixel(gfx::rgba(p&255,(p>>8)&255,(p>>16)&255,p>>24),x,y);}}}
 bool busy()const{return gesture_.has_value();}bool ready()const{return !busy()&&tweenPathReady(history.present.path);}const TweenPathDraft& current()const{return draft_?*draft_:history.present;}
 double zoom()const{return zoom_;}gfx::Point worldPosition(double x,double y){ensureView();return bounds().origin()+gfx::Point(int(std::floor(ox_+x*zoom_+.5)),int(std::floor(oy_+y*zoom_+.5)));}
 void fit(){double l=pivot_.x,t=pivot_.y,r=pivot_.x+pivot_.width,b=pivot_.y+pivot_.height;auto route=history.present;for(auto p:route.path){l=std::min({l,pivot_.x+p.x,route.anchor.x+p.x});t=std::min({t,pivot_.y+p.y,route.anchor.y+p.y});r=std::max({r,pivot_.x+pivot_.width+p.x,route.anchor.x+p.x+1});b=std::max({b,pivot_.y+pivot_.height+p.y,route.anchor.y+p.y+1});}double fit=std::min(std::max(1,bounds().w-100)/std::max(1.,r-l),std::max(1,bounds().h-100)/std::max(1.,b-t));zoom_=fit>1?std::max(1.,std::floor(fit+.000001)):std::max(.01,fit);ox_=bounds().w/2.-(l+r)/2*zoom_;oy_=bounds().h/2.-(t+b)/2*zoom_;viewSet_=true;line_.reset();invalidate();}
 void zoomAt(double factor,gfx::Point p){if(busy())return;ensureView();const double z=std::clamp(zoom_*factor,.01*uiScale,256.*uiScale),x=p.x-bounds().x,y=p.y-bounds().y;ox_=x-(x-ox_)*z/zoom_;oy_=y-(y-oy_)*z/zoom_;zoom_=z;line_.reset();notify();}
 void zoomCenter(double factor){zoomAt(factor,bounds().center());}
 void cancelGesture(){if(gesture_&&gesture_->mode==1){ox_=gesture_->ox;oy_=gesture_->oy;zoom_=gesture_->zoom;}gesture_.reset();draft_.reset();line_.reset();if(hasCapture())releaseMouse();notify();}
 void undo(){if(busy()){cancelGesture();return;}history.undo();line_.reset();notify();}void redo(){if(busy()){cancelGesture();return;}history.redo();line_.reset();notify();}
 void clear(){if(busy()||!ready())return;auto next=history.present;next.path={{0,0}};history.commit(std::move(next));line_.reset();notify();}
 void load(TweenPath path){if(busy())return;history.commit({std::move(path),history.present.anchor});fit();notify();}
 void setMode(int value){if(busy())cancelGesture();mode=value;line_.reset();notify();}

 void refreshPointer(bool shift,bool constrain){if(!shift||mode!=0||busy()||!pointer_){line_.reset();invalidate();return;}ensureView();auto p=documentPoint(*pointer_,ox_,oy_,zoom_);p.x=tweenPathClamp(p.x-history.present.anchor.x);p.y=tweenPathClamp(p.y-history.present.anchor.y);line_=extendTweenPath(history.present.path,p,constrain);invalidate();}
 void move(gfx::Point p,bool shift,bool constrain){pointer_=p;if(!gesture_){refreshPointer(shift,constrain);return;}auto& a=*gesture_;if(a.mode==1){ox_=a.ox+p.x-a.start.x;oy_=a.oy+p.y-a.start.y;invalidate();return;}auto doc=documentPoint(p,a.ox,a.oy,a.zoom);if(a.mode==2){auto start=documentPoint(a.start,a.ox,a.oy,a.zoom);a.points.anchor={tweenPathClamp(a.initial.anchor.x+doc.x-start.x),tweenPathClamp(a.initial.anchor.y+doc.y-start.y)};a.points.path=a.initial.path;}else{TweenPathPoint relative{tweenPathClamp(doc.x-a.points.anchor.x),tweenPathClamp(doc.y-a.points.anchor.y)};if(shift&&!a.lineBase)a.lineBase=a.points;const auto base=a.lineBase.value_or(a.points);a.points={extendTweenPath(base.path,relative,shift&&constrain),base.anchor};if(!shift)a.lineBase.reset();}draft_=a.points;notify();}
 bool onProcessMessage(ui::Message* msg)override{
  if(busy()&&!hasCapture())cancelGesture();if(msg->type()==ui::kFocusLeaveMessage){auto f=static_cast<ui::FocusMessage*>(msg);if(!f->newFocus()||f->newFocus()->window()!=window()){spaceHeld=false;cancelGesture();}}
  auto m=dynamic_cast<ui::MouseMessage*>(msg);if(!m)return ui::Widget::onProcessMessage(msg);
  if(msg->type()==ui::kMouseDownMessage&&(m->left()||m->middle())){if(busy())return true;requestFocus();ensureView();line_.reset();int active=m->middle()||spaceHeld?1:mode;gesture_=Gesture{active,history.present,history.present,m->position(),ox_,oy_,zoom_,m->shiftPressed()?std::optional<TweenPathDraft>{history.present}:std::optional<TweenPathDraft>{}};captureMouse();if(active==0)move(m->position(),m->shiftPressed(),m->ctrlPressed()||m->cmdPressed());notify();return true;}
  if(msg->type()==ui::kMouseMoveMessage){move(m->position(),m->shiftPressed(),m->ctrlPressed()||m->cmdPressed());return true;}
  if(msg->type()==ui::kMouseUpMessage&&busy()){move(m->position(),m->shiftPressed(),m->ctrlPressed()||m->cmdPressed());const auto finished=*gesture_;gesture_.reset();draft_.reset();line_.reset();if(hasCapture())releaseMouse();if(finished.mode!=1)history.commit(finished.points);notify();return true;}
  if(msg->type()==ui::kMouseLeaveMessage){pointer_.reset();line_.reset();invalidate();return true;}
  if(msg->type()==ui::kMouseWheelMessage){if(m->wheelDelta().y)zoomAt(m->wheelDelta().y<0?1.15:1/1.15,m->position());return true;}
  return ui::Widget::onProcessMessage(msg);
 }
 void onPaint(ui::PaintEvent& ev)override{
  ensureView();auto& g=*ev.graphics();auto r=clientBounds();g.saveClip();g.clipRect(r);g.fillRect(checkerLight,r);const double cell=checkerSize*zoom_;if(cell>=2){for(int y=int(std::floor(-oy_/cell));y<int(std::ceil((r.h-oy_)/cell));++y)for(int x=int(std::floor(-ox_/cell));x<int(std::ceil((r.w-ox_)/cell));++x)if((x+y)%2){int l=std::max(0,int(std::floor(ox_+x*cell))),t=std::max(0,int(std::floor(oy_+y*cell))),rr=std::min(r.w,int(std::ceil(ox_+(x+1)*cell))),bb=std::min(r.h,int(std::ceil(oy_+(y+1)*cell)));g.fillRect(checkerDark,{l,t,rr-l,bb-t});}}
  auto rect=[&](double x,double y,double w,double h){int l=int(std::floor(ox_+x*zoom_+.5)),t=int(std::floor(oy_+y*zoom_+.5)),rr=int(std::floor(ox_+(x+w)*zoom_+.5)),bb=int(std::floor(oy_+(y+h)*zoom_+.5));return gfx::Rect(l,t,std::max(1,rr-l),std::max(1,bb-t));};
  if(artwork_){ui::Paint over;over.blendMode(os::BlendMode::SrcOver);g.drawSurface(artwork_.get(),{0,0,artwork_->width(),artwork_->height()},rect(artworkX_,artworkY_,artwork_->width(),artwork_->height()),os::Sampling(),&over);}
  auto edge=rect(0,0,documentWidth_,documentHeight_);for(int i=-1;i<=1;++i)g.drawRect(gfx::rgba(0,0,0),gfx::Rect(edge.x+i,edge.y+i,edge.w-2*i,edge.h-2*i));g.drawRect(gfx::rgba(255,255,255),edge);
  drawTweenPathPixels(g,line_.value_or(current().path),current().anchor,ox_,oy_,zoom_,r,false);
  auto a=current().anchor;const int x=int(std::floor(ox_+(a.x+.5)*zoom_+.5)),y=int(std::floor(oy_+(a.y+.5)*zoom_+.5));{UiPaintScale scale(g,gfx::Point(x-9*uiScale/2,y-9*uiScale/2));icons_.draw(g,"selection-pivot",{0,0,9,9},true);}g.restoreClip();
 }
};

class TweenPathEditorDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;TweenPathSurface* surface_;PixelButton *draw_,*pan_,*anchor_,*undo_,*redo_,*clear_,*minus_,*plus_,*fit_,*save_,*load_,*apply_,*cancel_,*close_;PixelEntry* name_;PixelDropdown* library_;
 std::vector<TweenPathPreset> presets_;std::string selectedId_;std::u32string message_,error_;std::optional<TweenPathDraft> result_;
 std::function<std::vector<TweenPathPreset>()> loadFn_;std::function<std::vector<TweenPathPreset>(std::u32string,const TweenPath&)> saveFn_;
 void libraryOptions(){std::vector<std::u32string> labels{U"选择路径"};int selected=0;for(std::size_t i=0;i<presets_.size();++i){labels.push_back(presets_[i].name);if(presets_[i].id==selectedId_)selected=int(i+1);}library_->setOptions(labels);library_->setSelectedIndex(selected);}
 void sync(){bool busy=surface_->busy();draw_->active=surface_->mode==0;pan_->active=surface_->mode==1;anchor_->active=surface_->mode==2;for(auto b:{draw_,pan_,anchor_})b->invalidate();undo_->setEnabled(!busy&&!surface_->history.past.empty());redo_->setEnabled(!busy&&!surface_->history.future.empty());clear_->setEnabled(surface_->ready());apply_->setEnabled(surface_->ready());name_->setEnabled(!busy);save_->setEnabled(!busy&&surface_->ready()&&TweenPathPresetStore::validName(unicodeText(name_->text()))&&bool(saveFn_));library_->setEnabled(!busy&&!presets_.empty());load_->setEnabled(!busy&&!selectedId_.empty());invalidate();}
 void savePreset(){try{presets_=saveFn_(unicodeText(name_->text()),surface_->history.present.path);selectedId_=presets_.back().id;name_->setText("");error_.clear();message_=U"路径已保存";libraryOptions();}catch(const std::exception& e){message_.clear();error_=unicodeText(e.what());}sync();}
 void loadPreset(){try{auto fresh=loadFn_();auto found=std::find_if(fresh.begin(),fresh.end(),[&](const auto& p){return p.id==selectedId_;});if(found==fresh.end()){selectedId_.clear();presets_=std::move(fresh);libraryOptions();throw std::runtime_error("Saved path no longer exists");}surface_->load(found->path);presets_=std::move(fresh);libraryOptions();error_.clear();message_=U"路径已载入";}catch(const std::exception& e){message_.clear();error_=unicodeText(e.what());}sync();}
 void accept(){if(!surface_->ready())return;result_=surface_->history.present;closeWindow(nullptr);}
public:
 TweenPathEditorDialog(const PixelFont& font,const Skin& skin,const Skin& icons,TweenPath initial,std::optional<TweenPathPoint> initialAnchor,TweenRegion pivot,int documentWidth,int documentHeight,const std::optional<timeline::Surface>& artwork,std::function<std::vector<TweenPathPreset>()> load,std::function<std::vector<TweenPathPreset>(std::u32string,const TweenPath&)> save):PixelDialog(skin,"",ui::PopupWindow::ClickBehavior::DoNothingOnClick),font_(font),skin_(skin),loadFn_(std::move(load)),saveFn_(std::move(save)){
 setAutoRemap(false);setWantFocus(true);setEnterBehavior(ui::PopupWindow::EnterBehavior::DoNothingOnEnter);auto button=[&](const char32_t* label,std::function<void()> fn,const char* icon=nullptr){auto b=new PixelButton(font,skin,label,std::move(fn));if(icon){b->iconSkin=&icons;b->icon=icon;b->skinStyle="icon_button";}addChild(b);return b;};
 surface_=new TweenPathSurface(skin,icons,std::move(initial),initialAnchor,pivot,documentWidth,documentHeight,artwork);addChild(surface_);
 draw_=button(U"绘制",[this]{surface_->setMode(0);});pan_=button(U"平移",[this]{surface_->setMode(1);});anchor_=button(U"锚点",[this]{surface_->setMode(2);});anchor_->iconSkin=&icons;anchor_->icon="selection-pivot";undo_=button(U"",[this]{surface_->undo();},"undo");redo_=button(U"",[this]{surface_->redo();},"redo");clear_=button(U"清空",[this]{surface_->clear();});minus_=button(U"",[this]{surface_->zoomCenter(1/1.25);},"minus");plus_=button(U"",[this]{surface_->zoomCenter(1.25);},"plus");fit_=button(U"",[this]{if(!surface_->busy())surface_->fit();sync();},"paletteCenter");
 name_=new PixelEntry(font,skin);name_->setMaxTextLength(80);addChild(name_);name_->Change.connect([this]{sync();});library_=new PixelDropdown(font,skin);addChild(library_);library_->changed=[this](int i){selectedId_=i>0&&i<=int(presets_.size())?presets_[i-1].id:std::string{};message_.clear();sync();};
 save_=button(U"保存路径",[this]{savePreset();});load_=button(U"载入",[this]{loadPreset();});cancel_=button(U"取消",[this]{surface_->cancelGesture();closeWindow(nullptr);});apply_=button(U"应用",[this]{accept();});close_=button(U"",[this]{surface_->cancelGesture();closeWindow(nullptr);},"close");
 surface_->changed=[this]{sync();};try{if(loadFn_)presets_=loadFn_();}catch(const std::exception& e){error_=unicodeText(e.what());}libraryOptions();sync();
 }
 ~TweenPathEditorDialog(){surface_->cancelGesture();}
 const std::optional<TweenPathDraft>& result()const{return result_;}
 void setCheckerboard(gfx::Color a,gfx::Color b,int size){surface_->checkerLight=a;surface_->checkerDark=b;surface_->checkerSize=size;surface_->invalidate();}
 const char* geometryCursor(gfx::Point p)const override{if(surface_->hasCapture()||surface_->bounds().contains(p))return surface_->mode==1||surface_->spaceHeld?(surface_->hasCapture()?"grabbing":"grab"):surface_->mode==2?"move":"crosshair";return PixelDialog::geometryCursor(p);}
 gfx::Size minimumDialogSize(int)const override{return {520*uiScale,420*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());auto r=bounds();const int w=r.w/uiScale,h=r.h/uiScale;auto place=[&](ui::Widget* c,int x,int y,int cw,int ch=textControlHeight){c->setBounds(uiPhysical({x,y,cw,ch}).offset(r.origin()));};layoutHeaderButton(close_);
  place(draw_,6,DialogLayout::bodyTop,48);place(pan_,56,DialogLayout::bodyTop,48);place(anchor_,106,DialogLayout::bodyTop,48);place(undo_,160,DialogLayout::bodyTop,20);place(redo_,182,DialogLayout::bodyTop,20);place(clear_,204,DialogLayout::bodyTop,48);
  place(minus_,w-120,DialogLayout::bodyTop,20);place(plus_,w-43,DialogLayout::bodyTop,20);place(fit_,w-21,DialogLayout::bodyTop+2,15,15);
  place(name_,6,53,140);place(save_,148,53,72);place(library_,222,53,w-278);place(load_,w-54,53,48);place(surface_,6,97,w-12,h-145);place(cancel_,w-118,DialogLayout::footer(h),54);place(apply_,w-62,DialogLayout::footer(h),56);
 }
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"编辑补间路径");font_.draw(g,unicodeText(std::to_string(int(std::floor(surface_->zoom()*100/uiScale+.5))))+U"%",r.w-98,31,skin_["text"]);font_.draw(g,U"B绘制 H平移 A锚点 · Shift直线 Ctrl+Shift约束 · 滚轮缩放",6,79,skin_["muted"]);font_.draw(g,error_.empty()?message_:error_,6,r.h-42,skin_["text"]);}
 bool onProcessMessage(ui::Message* msg)override{
 if(msg->type()==ui::kOpenMessage)surface_->requestFocus();if(msg->type()==ui::kCloseMessage||msg->type()==ui::kCloseDisplayMessage){surface_->spaceHeld=false;surface_->cancelGesture();}
 if(msg->type()==ui::kKeyDownMessage||msg->type()==ui::kKeyUpMessage){auto k=static_cast<ui::KeyMessage*>(msg);const auto key=k->scancode();const bool command=k->ctrlPressed()||k->cmdPressed();if(msg->type()==ui::kKeyUpMessage){if(key==ui::kKeySpace)surface_->spaceHeld=false;surface_->refreshPointer(k->shiftPressed(),command);return true;}
 auto focus=ui::Manager::getDefault()->getFocus();if(dynamic_cast<ui::Entry*>(focus)){if(key==ui::kKeyEsc){surface_->requestFocus();return true;}if(command&&(key==ui::kKeyS||key==ui::kKeyO||key==ui::kKeyP))return true;return false;}
 if((key==ui::kKeyEnter||key==ui::kKeySpace)&&dynamic_cast<PixelButton*>(focus)&&!command)return false;
 if(key==ui::kKeyEsc){if(surface_->busy())surface_->cancelGesture();else closeWindow(nullptr);return true;}
 if(command&&(key==ui::kKeyZ||key==ui::kKeyY)){if(surface_->busy())surface_->cancelGesture();else if(key==ui::kKeyY||k->shiftPressed())surface_->redo();else surface_->undo();return true;}
 if(key==ui::kKeyTab)return PixelPopupWindow::onProcessMessage(msg);
 if(!command&&!k->altPressed()){if(key==ui::kKeySpace)surface_->spaceHeld=true;else if(key==ui::kKeyB)surface_->setMode(0);else if(key==ui::kKeyH)surface_->setMode(1);else if(key==ui::kKeyA)surface_->setMode(2);}surface_->refreshPointer(k->shiftPressed(),command);return true;
 }return PixelPopupWindow::onProcessMessage(msg);
 }

 void smoke(int action){
 auto require=[](bool ok,const char* m){if(!ok)throw std::runtime_error(m);};surface_->requestFocus();surface_->fit();auto initial=surface_->history.present;
 auto point=[&](double x,double y){return surface_->worldPosition(x+.25,y+.25);};auto send=[&](ui::MessageType type,gfx::Point p,ui::KeyModifiers modifiers=ui::kKeyNoneModifier,ui::MouseButton button=ui::kButtonLeft){ui::MouseMessage m(type,os::PointerType::Mouse,button,modifiers,p);surface_->onProcessMessage(&m);};auto key=[&](ui::KeyScancode scan,ui::KeyModifiers modifiers=ui::kKeyNoneModifier){ui::KeyMessage k(ui::kKeyDownMessage,scan,modifiers,0,0);onProcessMessage(&k);};
 auto start=point(initial.anchor.x,initial.anchor.y),end=point(initial.anchor.x+3,initial.anchor.y+1);send(ui::kMouseDownMessage,start);send(ui::kMouseMoveMessage,end);send(ui::kMouseUpMessage,end);require(surface_->history.past.size()==1&&surface_->ready()&&!surface_->hasCapture(),"Path stroke must commit once locally");const auto first=surface_->history.present;
 surface_->requestFocus();key(ui::kKeyZ,ui::kKeyCtrlModifier);require(!surface_->ready()&&!surface_->history.future.empty(),"Path local keyboard undo");key(ui::kKeyZ,static_cast<ui::KeyModifiers>(ui::kKeyCtrlModifier|ui::kKeyShiftModifier));require(tweenPathDraftEqual(first,surface_->history.present),"Path local keyboard redo");
 send(ui::kMouseDownMessage,start);send(ui::kMouseMoveMessage,end+gfx::Point(30,30));key(ui::kKeyEsc);require(!surface_->busy()&&!surface_->hasCapture()&&tweenPathDraftEqual(first,surface_->history.present)&&!result_,"Path Escape must discard active stroke only");
 const auto last=first.path.back();auto constrained=static_cast<ui::KeyModifiers>(ui::kKeyShiftModifier|ui::kKeyCtrlModifier);auto target=point(initial.anchor.x+last.x+8,initial.anchor.y+last.y+2);send(ui::kMouseDownMessage,target,constrained);send(ui::kMouseMoveMessage,target+gfx::Point(0,30),constrained);send(ui::kMouseUpMessage,target,constrained);require(surface_->history.present.path.back().y==last.y,"Path Ctrl Shift direction constraint");surface_->undo();require(tweenPathDraftEqual(first,surface_->history.present),"Path Shift line must undo once");
 anchor_->Click();const auto beforeAnchor=surface_->history.present;start=point(beforeAnchor.anchor.x,beforeAnchor.anchor.y);end=point(beforeAnchor.anchor.x+2,beforeAnchor.anchor.y+1);send(ui::kMouseDownMessage,start);send(ui::kMouseUpMessage,end);require(tweenPathEqual(beforeAnchor.path,surface_->history.present.path)&&surface_->history.present.anchor.x==beforeAnchor.anchor.x+2&&surface_->history.present.anchor.y==beforeAnchor.anchor.y+1,"Path anchor must translate entire preview without rewriting displacements");surface_->undo();require(tweenPathDraftEqual(beforeAnchor,surface_->history.present),"Path anchor local undo");surface_->redo();
 const auto h=surface_->history.past.size();plus_->Click();auto center=surface_->bounds().center();send(ui::kMouseDownMessage,center,ui::kKeyNoneModifier,ui::kButtonMiddle);send(ui::kMouseUpMessage,center+gfx::Point(40,20),ui::kKeyNoneModifier,ui::kButtonMiddle);require(surface_->history.past.size()==h,"Path view changes must not create path history");
 const auto valid=surface_->history.present;clear_->Click();require(!surface_->ready(),"Path clear must disable Apply");undo_->Click();require(tweenPathDraftEqual(valid,surface_->history.present),"Path clear must undo locally");
 if(action==1&&saveFn_&&loadFn_){name_->setText("Jump");save_->Click();require(error_.empty()&&!selectedId_.empty(),"Path preset save");clear_->Click();load_->Click();require(error_.empty()&&tweenPathDraftEqual(valid,surface_->history.present),"Path preset load preserves anchor");undo_->Click();require(!surface_->ready(),"Path preset load local undo");redo_->Click();require(tweenPathDraftEqual(valid,surface_->history.present),"Path preset load redo");}
 auto image=os::instance()->makeRgbaSurface(surface_->bounds().w,surface_->bounds().h);{ui::Graphics g(image);ui::PaintEvent event(surface_,&g);surface_->onPaint(event);}
 if(action==1)apply_->Click();else if(action==2){surface_->requestFocus();key(ui::kKeyEsc);}else cancel_->Click();require(!surface_->hasCapture(),"Path editor close leaked capture");
 }
};
}
