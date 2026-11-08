#pragma once
#include "native_widgets.h"
#include "sheet_import_preview_model.h"
#include "raster_snapshot.h"
#include "canvas_renderer.h"
#include "layer_compositor.h"
#include "ui/message.h"
#include "ui/resize_event.h"
#include "ui/paint.h"
#include "os/sampling.h"
#include <atomic>
#include <thread>
namespace moon::editor {
class SheetImportPreview final:public ui::Widget {
 const Skin& skin_;const PixelFont& font_;SheetImportOptions options_;SheetImportPlan plan_;std::u32string planError_;sheet_preview::View view_;std::optional<sheet_preview::Drag> drag_;bool space_=false,active_=false;
 std::function<const Document&()> source_;std::unique_ptr<RasterSnapshot> capture_;
 struct Work {std::atomic<bool> cancelled{false},ready{false};std::vector<Pixel> pixels;std::string error;};
 std::shared_ptr<Work> work_;os::SurfaceRef image_,upload_;std::vector<Pixel> pendingPixels_;int uploadRow_=0,width_=1,height_=1;
 std::uint64_t identity_=0,revision_=0;std::string frame_;std::shared_ptr<const SelectionMask> selection_;ui::Timer timer_{16,this};
 std::u32string error_;
 sheet_preview::Point local(gfx::Point p)const{return {double(p.x-bounds().x)/uiScale,double(p.y-bounds().y)/uiScale};}
 sheet_preview::Point documentPoint(gfx::Point p)const{const auto q=local(p),o=origin();const auto z=zoom();return {(q.x-o.x)/z,(q.y-o.y)/z};}
 void replan(){plan_={};planError_.clear();try{plan_=planSpriteSheetImport(width_,height_,options_);}catch(const std::exception& e){planError_=unicodeText(e.what());}}
 void notify(){if(changed)changed(options_);invalidate();}
 void finish(bool cancel){if(!drag_)return;const auto d=*drag_;drag_.reset();if(cancel){if(d.mode==sheet_preview::Mode::Pan)view_.pan=d.pan;else{options_=d.initial;notify();}}if(hasCapture())releaseMouse();invalidate();}
 void resetImage(){if(work_)work_->cancelled=true;capture_.reset();image_.reset();upload_.reset();std::vector<Pixel>{}.swap(pendingPixels_);error_.clear();uploadRow_=0;}
 void request(const Document& d){
  resetImage();identity_=d.identity();revision_=d.contentRevision();frame_=d.frame().id;selection_=options_.selectionSnapshot;
  try{const auto* s=sheetImportSelection(d,options_);width_=s?s->width:d.width();height_=s?s->height:d.height();
   std::uint64_t bytes=std::uint64_t(width_)*height_*sizeof(Pixel)*3;if(s)bytes+=s->mask.size();
   for(const auto& c:d.timeline().state().cels)if(c.surface)bytes+=c.surface->pixels.size()*sizeof(Pixel);
   for(const auto& m:d.timeline().state().masks)bytes+=m.mask.surface.pixels.size()*sizeof(Pixel);
   for(const auto& t:d.timeline().state().tilesets)bytes+=t.pixels.size()*sizeof(Pixel);
   if(width_<1||height_<1||width_>32768||height_>32768||bytes>256ull*1024*1024)throw std::length_error("Preview exceeds native working pixel budget");
   capture_=std::make_unique<RasterSnapshot>(d.timeline().state());
  }catch(const std::exception& e){error_=unicodeText(e.what());}replan();invalidate();
 }
public:
 CheckerboardSettings checkerboard;
 std::function<void(const SheetImportOptions&)> changed;std::function<void()> viewChanged;
 std::uint64_t composites=0,uploads=0;
 SheetImportPreview(const Skin& s,const PixelFont& f):ui::Widget(ui::kGenericWidget),skin_(s),font_(f){setTransparent(false);setFocusStop(true);setVisible(false);}
 ~SheetImportPreview(){if(work_)work_->cancelled=true;}
 double zoom()const{return view_.scale(width_,height_,double(bounds().w)/uiScale,double(bounds().h)/uiScale);}
 sheet_preview::Point origin()const{return view_.origin(width_,height_,double(bounds().w)/uiScale,double(bounds().h)/uiScale);}
 std::size_t frameCount()const{return plan_.tiles.size();}
 bool dragging()const{return bool(drag_);}bool imageReady()const{return bool(image_);}const std::u32string& error()const{return error_;}
 gfx::Color imagePixel(int x,int y)const{return image_?image_->getPixel(x,y):0;}
 const SheetImportOptions& options()const{return options_;}const sheet_preview::View& view()const{return view_;}
 void restoreView(const sheet_preview::View& value){view_=value;invalidate();}
 void finishDraft(){finish(false);}
 void fit(){finish(true);view_.fit();invalidate();if(viewChanged)viewChanged();}
 void open(std::function<const Document&()> source,const SheetImportOptions& options){close();source_=std::move(source);options_=options;view_.fit();active_=true;request(source_());timer_.start();}
 void close(){finish(true);active_=false;timer_.stop();resetImage();source_={};options_.selectionSnapshot.reset();selection_.reset();}
 void update(const SheetImportOptions& options){options_=options;if(active_&&source_){const auto& d=source_();if(identity_!=d.identity()||revision_!=d.contentRevision()||frame_!=d.frame().id||selection_!=options.selectionSnapshot)request(d);}replan();invalidate();}
 void tick(){
  if(!active_||!source_)return;if(drag_&&!hasCapture())finish(true);const auto& d=source_();if(identity_!=d.identity()||revision_!=d.contentRevision()||frame_!=d.frame().id)request(d);
  if(work_){if(!work_->ready.load())return;auto done=std::move(work_);if(!done->cancelled){if(!done->error.empty()){error_=unicodeText(done->error);invalidate();}else{pendingPixels_=std::move(done->pixels);try{upload_=os::instance()->makeRgbaSurface(width_,height_);if(!upload_)throw std::runtime_error("Cannot allocate sheet import preview");}catch(const std::exception& e){std::vector<Pixel>{}.swap(pendingPixels_);error_=unicodeText(e.what());}}}}
  if(capture_){try{if(!capture_->advance(d.timeline().state(),std::chrono::steady_clock::now()+std::chrono::milliseconds(2)))return;auto state=capture_->take();capture_.reset();auto work=std::make_shared<Work>();work_=work;const auto width=width_,height=height_;auto selection=selection_;auto frame=frame_;++composites;
    std::thread([work,state=std::move(state),selection,frame,width,height]()mutable{try{timeline::Timeline timeline(std::move(state));if(work->cancelled){work->ready=true;return;}work->pixels.resize(std::size_t(width)*height);const int ox=selection?selection->x:0,oy=selection?selection->y:0;const int rows=std::max(1,65536/width);for(int y=0;y<height&&!work->cancelled;y+=rows){const int n=std::min(rows,height-y);auto pixels=compositeNormalRegion(timeline,frame,{ox,oy+y,width,n});for(int row=0;row<n;++row)for(int x=0;x<width;++x){const auto at=std::size_t(y+row)*width+x;auto p=pixels[std::size_t(row)*width+x];if(selection&&!selection->mask.empty()&&(at>=selection->mask.size()||selection->mask[at]!=1))p=0;work->pixels[at]=(p>>24)?p:0;}}}catch(const std::exception& e){work->error=e.what();}work->ready=true;}).detach();
   }catch(const std::exception& e){capture_.reset();if(work_){work_->cancelled=true;work_.reset();}error_=unicodeText(e.what());invalidate();}return;}
  if(upload_){const int rows=std::min(height_-uploadRow_,std::max(1,262144/width_));uploadRgbaRegion(*upload_,pendingPixels_.data()+std::size_t(uploadRow_)*width_,width_,rows,width_,0,uploadRow_);uploadRow_+=rows;if(uploadRow_==height_){image_=std::move(upload_);std::vector<Pixel>{}.swap(pendingPixels_);uploadRow_=0;++uploads;invalidate();}}
 }
 void onResize(ui::ResizeEvent& e)override{setBoundsQuietly(e.bounds());invalidate();}
 bool onProcessMessage(ui::Message* msg)override{
  if(msg->type()==ui::kTimerMessage&&static_cast<ui::TimerMessage*>(msg)->timer()==&timer_){tick();return true;}
  if(msg->type()==ui::kFocusLeaveMessage){space_=false;finish(true);}
  if(msg->type()==ui::kKeyDownMessage||msg->type()==ui::kKeyUpMessage){const auto k=static_cast<ui::KeyMessage*>(msg);if(k->scancode()==ui::kKeySpace){space_=msg->type()==ui::kKeyDownMessage;return true;}if(k->scancode()==ui::kKeyEsc&&drag_){finish(true);return true;}}
  if(!active_)return ui::Widget::onProcessMessage(msg);
  if(msg->type()==ui::kMouseWheelMessage){const auto m=static_cast<ui::MouseMessage*>(msg);if(!drag_&&m->wheelDelta().y)view_.wheel(width_,height_,double(bounds().w)/uiScale,double(bounds().h)/uiScale,local(m->position()),m->wheelDelta().y<0);invalidate();if(viewChanged)viewChanged();return true;}
  if(msg->type()==ui::kMouseDownMessage){const auto m=static_cast<ui::MouseMessage*>(msg);if(drag_||(!m->left()&&!m->middle()))return true;requestFocus();view_.zoom=zoom();drag_=sheet_preview::begin(options_,documentPoint(m->position()),zoom(),view_.pan,m->middle()||space_);captureMouse();return true;}
  if(msg->type()==ui::kMouseMoveMessage&&drag_){if(!hasCapture()){finish(true);return true;}const auto p=documentPoint(static_cast<ui::MouseMessage*>(msg)->position());try{if(drag_->mode==sheet_preview::Mode::Pan){const auto z=zoom();view_.pan.x+=(std::floor(p.x)-drag_->x)*z;view_.pan.y+=(std::floor(p.y)-drag_->y)*z;invalidate();}else{options_=sheet_preview::moved(*drag_,p);notify();}}catch(const std::exception& e){error_=unicodeText(e.what());invalidate();}return true;}
  if(msg->type()==ui::kMouseUpMessage&&drag_){finish(false);return true;}
  return ui::Widget::onProcessMessage(msg);
 }
 void onPaint(ui::PaintEvent& ev)override{
  auto& g=*ev.graphics();UiPaintScale paint(g);const auto r=uiLogical(clientBounds());const auto o=origin();const auto z=zoom();g.saveClip();g.clipRect(r);skin_.draw(g,"panel_content",r);auto content=r;content.shrink(1);g.clipRect(content);g.fillRect(checkerboard.light,r);const double cell=checkerboard.size*z;
  if(cell>=2&&std::isfinite(cell)){for(double y=std::floor(-o.y/cell);y<std::ceil((r.h-o.y)/cell);++y)for(double x=std::floor(-o.x/cell);x<std::ceil((r.w-o.x)/cell);++x)if(std::fmod(x+y,2)!=0){const int l=std::max(0,int(std::floor(o.x+x*cell))),t=std::max(0,int(std::floor(o.y+y*cell))),rr=std::min(r.w,int(std::ceil(o.x+(x+1)*cell))),bb=std::min(r.h,int(std::ceil(o.y+(y+1)*cell)));g.fillRect(checkerboard.dark,{l,t,rr-l,bb-t});}}
  auto rect=[&](double x,double y,double w,double h){return gfx::Rect(int(std::round(std::clamp(o.x+x*z,-100000000.,100000000.))),int(std::round(std::clamp(o.y+y*z,-100000000.,100000000.))),std::max(1,int(std::round(std::clamp(w*z,0.,100000000.)))),std::max(1,int(std::round(std::clamp(h*z,0.,100000000.)))));};
  if(image_){ui::Paint over;over.blendMode(os::BlendMode::SrcOver);g.drawSurface(image_.get(),{0,0,width_,height_},rect(0,0,width_,height_),os::Sampling(os::Sampling::Filter::Nearest),&over);}g.drawRect(gfx::rgba(255,255,255),rect(0,0,width_,height_));
  const auto accent=gfx::rgba(41,121,255);try{const auto& plan=plan_;for(std::size_t i=0;i<plan.tiles.size();++i){const auto p=plan.tiles[i];const auto box=rect(p.x,p.y,options_.width,options_.height);if(!box.intersects(r))continue;g.drawRect(i?gfx::rgba(0,0,0):accent,box);if(i){auto inner=box;inner.shrink(1);g.drawRect(gfx::rgba(255,255,255),inner);}if(box.w>28&&box.h>22){const auto n=unicodeText(std::to_string(i+1));g.fillRect(gfx::rgba(0,0,0),{box.x+2,box.y+2,font_.measure(n)+6,14});font_.draw(g,n,box.x+5,box.y+4,gfx::rgba(255,255,255));}}}catch(...){}
  const auto b=rect(options_.x,options_.y,options_.width,options_.height);g.drawRect(accent,b);for(const auto p:{gfx::Point(b.x,b.y+b.h/2),gfx::Point(b.x2(),b.y+b.h/2),gfx::Point(b.x+b.w/2,b.y),gfx::Point(b.x+b.w/2,b.y2())})g.fillRect(accent,{p.x-3,p.y-3,6,6});
  const auto& message=error_.empty()?planError_:error_;if(!message.empty()){g.fillRect(skin_["background"],{0,r.h-30,r.w,30});font_.draw(g,message,4,r.h-26,skin_["text"]);}g.restoreClip();
 }
};
}
