#pragma once
#include "timelapse.h"
#include "document.h"
#include "layer_compositor.h"
#include "image_export.h"
#include <chrono>
#include <memory>
namespace moon::timelapse {
struct PixelTile {int x=0,y=0,width=0,height=0;std::vector<Pixel> pixels;};
struct FrozenPixels {int width=0,height=0;std::vector<std::shared_ptr<const PixelTile>> tiles;};
struct Prepared {Mode mode=Mode::Smart;double capturedAt=0,changeScore=1;std::uint64_t generation=0,undoGeneration=0;bool undoStep=false;std::shared_ptr<const FrozenPixels> pixels;};
// Caller supplies dirty ONLY when the previous frozen revision, source geometry,
// and active frame match the invalidation's fromRevision. Otherwise pass nullopt.
class PixelPreparation {
 std::uint64_t identity_,revision_,contentRevision_;int sourceWidth_,sourceHeight_;std::string frame_;std::size_t next_=0;
 std::shared_ptr<FrozenPixels> result_;std::shared_ptr<const FrozenPixels> previous_;std::optional<PixelRegion> dirty_;bool committedBoundary_=false;
public:
 PixelPreparation(const Document& d,Quality quality,std::shared_ptr<const FrozenPixels> previous={},std::optional<PixelRegion> dirty={},bool committedBoundary=false):identity_(d.identity()),revision_(d.revision()),contentRevision_(d.contentRevision()),sourceWidth_(d.width()),sourceHeight_(d.height()),frame_(d.frame().id),previous_(std::move(previous)),dirty_(dirty),committedBoundary_(committedBoundary){if(d.active()&&!committedBoundary_)throw std::logic_error("Recording requires a committed edit boundary");const auto size=captureDimensions(sourceWidth_,sourceHeight_,quality);result_=std::make_shared<FrozenPixels>();result_->width=size.width;result_->height=size.height;result_->tiles.reserve(std::size_t((size.width+63)/64)*((size.height+63)/64));if(!previous_||previous_->width!=size.width||previous_->height!=size.height)dirty_.reset();if(dirty_){auto& r=*dirty_;const auto right=int(std::ceil(double(std::clamp(r.x+r.w,0,sourceWidth_))*size.width/sourceWidth_)),bottom=int(std::ceil(double(std::clamp(r.y+r.h,0,sourceHeight_))*size.height/sourceHeight_));const auto x=int(std::ceil(double(std::clamp(r.x,0,sourceWidth_))*size.width/sourceWidth_)),y=int(std::ceil(double(std::clamp(r.y,0,sourceHeight_))*size.height/sourceHeight_));r={x,y,std::max(0,right-x),std::max(0,bottom-y)};}}
 bool matches(const Document& d)const{return (!d.active()||committedBoundary_)&&identity_==d.identity()&&revision_==d.revision()&&contentRevision_==d.contentRevision()&&frame_==d.frame().id&&sourceWidth_==d.width()&&sourceHeight_==d.height();}
 bool advance(const Document& d,std::chrono::steady_clock::time_point deadline){
  if(!matches(d))return false;const int columns=(result_->width+63)/64,rows=(result_->height+63)/64;const auto total=std::size_t(columns)*rows;
  do{if(next_==total)return true;const int x=int(next_%columns)*64,y=int(next_/columns)*64,w=std::min(64,result_->width-x),h=std::min(64,result_->height-y);const auto index=next_++;
   if(dirty_&&(dirty_->empty()||x>=dirty_->x+dirty_->w||y>=dirty_->y+dirty_->h||x+w<=dirty_->x||y+h<=dirty_->y)){if(index>=previous_->tiles.size())throw std::logic_error("Invalid previous recording tiles");result_->tiles.push_back(previous_->tiles[index]);continue;}
   const int sx=int(std::int64_t(x)*sourceWidth_/result_->width),sy=int(std::int64_t(y)*sourceHeight_/result_->height),right=int(std::int64_t(x+w-1)*sourceWidth_/result_->width)+1,bottom=int(std::int64_t(y+h-1)*sourceHeight_/result_->height)+1;
   const auto source=compositeNormalRegion(d.timeline(),frame_,{sx,sy,right-sx,bottom-sy});auto tile=std::make_shared<PixelTile>();tile->x=x;tile->y=y;tile->width=w;tile->height=h;tile->pixels.resize(std::size_t(w)*h);
   for(int ty=0;ty<h;++ty)for(int tx=0;tx<w;++tx){const int sampleX=int(std::int64_t(x+tx)*sourceWidth_/result_->width)-sx,sampleY=int(std::int64_t(y+ty)*sourceHeight_/result_->height)-sy;tile->pixels[std::size_t(ty)*w+tx]=source[std::size_t(sampleY)*(right-sx)+sampleX];}result_->tiles.push_back(std::move(tile));
  }while(std::chrono::steady_clock::now()<deadline);return next_==total;
 }
 bool complete()const{return result_->tiles.size()==std::size_t((result_->width+63)/64)*((result_->height+63)/64);}
 std::shared_ptr<const FrozenPixels> finish(){if(!complete())throw std::logic_error("Recording preparation incomplete");return result_;}
};
inline std::vector<Pixel> materialize(const FrozenPixels& f){if(f.width<1||f.height<1)throw std::invalid_argument("Invalid recording pixels");std::vector<Pixel> pixels(std::size_t(f.width)*f.height);for(const auto& t:f.tiles){if(!t||t->x<0||t->y<0||t->width<1||t->height<1||t->x+t->width>f.width||t->y+t->height>f.height||t->pixels.size()!=std::size_t(t->width)*t->height)throw std::invalid_argument("Invalid recording tile");for(int y=0;y<t->height;++y)std::copy_n(t->pixels.begin()+std::size_t(y)*t->width,t->width,pixels.begin()+std::size_t(t->y+y)*f.width+t->x);}return pixels;}
// Invoke on encoder worker. It never retains document, UI or mutable buffers.
inline Bytes encodePreparedPng(const Prepared& p){if(!p.pixels)throw std::invalid_argument("Missing frozen recording");return encodeRgbaImagePng(p.pixels->width,p.pixels->height,materialize(*p.pixels)).png;}
}
