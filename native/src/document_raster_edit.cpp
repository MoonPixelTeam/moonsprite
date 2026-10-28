#include "document.h"
#include "raster_geometry.h"
#include <algorithm>
#include <stdexcept>
namespace moon {
void Document::capturePixelAddresses(Edit& e){
 if((!e.pixels.empty()||!e.runs.empty()||e.dense)&&!e.pixelAddress){
  const auto* c=timeline_.findCelById(e.targetCelId);if(!c)throw std::logic_error("Missing pixel history target");const auto r=timeline_.resolveSurface(c->id);if(r.issue!=timeline::LinkIssue::None||!r.surface)throw std::logic_error("Invalid pixel history owner");const auto& s=*r.surface;
  e.pixelAddress=PixelAddressSpace{s.width,s.height,s.storageOriginX.value_or(0),s.storageOriginY.value_or(0)};
 }
 for(auto& child:e.children)capturePixelAddresses(child);
}
void Document::applyPixelEdit(const Edit& e,bool forward){
 if(e.pixels.empty()&&e.runs.empty()&&!e.dense)return;
 const auto r=timeline_.resolveSurface(e.targetCelId);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface)throw std::logic_error("Missing pixel history owner");const auto& s=*r.surface;raster::validate(s);
 // Existing pre-push operations use canvas indices. Only explicitly migrated
 // owner-local operations may provide a different address space.
 const auto a=e.pixelAddress.value_or(PixelAddressSpace{width_,height_,0,0});
 if(a.width<1||a.height<1)throw std::logic_error("Invalid pixel history address space");
 const std::uint64_t size=std::uint64_t(a.width)*a.height;
 const bool direct=a.width==s.width&&a.originX==s.storageOriginX.value_or(0)&&a.originY==s.storageOriginY.value_or(0);
 if(direct&&a.height<=s.height){
  for(const auto& d:e.pixels)if(d.index>=size)throw std::logic_error("Pixel history point exceeds capture");
  for(const auto& run:e.runs)if(run.index>size||run.length>size-run.index)throw std::logic_error("Pixel history run exceeds capture");
  if(e.dense){const auto& d=*e.dense;if(d.x<0||d.y<0||d.width<1||d.height<1||std::int64_t(d.x)+d.width>a.width||std::int64_t(d.y)+d.height>a.height||std::uint64_t(d.width)*d.height!=d.before.size()||d.before.size()!=d.after.size())throw std::logic_error("Invalid dense pixel history capture");}
  auto* owner=timeline_.mutableOwnedSurface(r.source->id);if(!owner)throw std::logic_error("Missing writable history owner");auto& pixels=owner->pixels;
  auto mark=[&](std::int64_t x,std::int64_t y,std::int64_t w,std::int64_t h){const auto left=std::max<std::int64_t>(0,std::int64_t(owner->offsetX)+x),top=std::max<std::int64_t>(0,std::int64_t(owner->offsetY)+y),right=std::min<std::int64_t>(width_,std::int64_t(owner->offsetX)+x+w),bottom=std::min<std::int64_t>(height_,std::int64_t(owner->offsetY)+y+h);if(right>left&&bottom>top){change_.include(int(left),int(top));change_.include(int(right-1),int(bottom-1));}};
  for(const auto& d:e.pixels){pixels[d.index]=forward?d.after:d.before;mark(d.index%std::size_t(a.width),d.index/std::size_t(a.width),1,1);}
  for(const auto& run:e.runs){std::fill_n(pixels.begin()+run.index,run.length,forward?run.after:run.before);if(!run.length)continue;const auto startRow=run.index/std::size_t(a.width),endRow=(run.index+run.length-1)/std::size_t(a.width);if(startRow==endRow)mark(run.index%std::size_t(a.width),startRow,run.length,1);else mark(0,startRow,a.width,endRow-startRow+1);}
  if(e.dense){const auto& d=*e.dense;const auto& values=forward?d.after:d.before;for(int y=0;y<d.height;++y)std::copy_n(values.begin()+std::size_t(y)*d.width,d.width,pixels.begin()+std::size_t(y+d.y)*a.width+d.x);mark(d.x,d.y,d.width,d.height);}
  return;
 }
 struct Span{std::size_t index=0,count=0,skip=0;};
 auto map=[&](std::int64_t x,std::int64_t y,std::size_t count)->Span{
  const auto lx=x+std::int64_t(a.originX)-s.storageOriginX.value_or(0),ly=y+std::int64_t(a.originY)-s.storageOriginY.value_or(0);
  if(ly<0||ly>=s.height)return {};
  const std::int64_t begin=std::max<std::int64_t>(0,lx),end=std::min<std::int64_t>(s.width,lx+std::int64_t(count));if(end<=begin)return {};
  const auto index=direct?std::size_t(y)*s.width+std::size_t(x):std::size_t(ly)*s.width+std::size_t(begin);
  if(index>s.pixels.size()||std::size_t(end-begin)>s.pixels.size()-index)throw std::logic_error("Pixel history span exceeds owner");
  return {index,std::size_t(end-begin),std::size_t(begin-lx)};
 };
 auto walk=[&](auto&& emit){
  for(const auto& d:e.pixels){if(d.index>=size)throw std::logic_error("Pixel history point exceeds capture");emit(d.index%std::size_t(a.width),d.index/std::size_t(a.width),std::size_t(1),forward?&d.after:&d.before,Pixel(0));}
  for(const auto& run:e.runs){if(run.index>size||run.length>size-run.index)throw std::logic_error("Pixel history run exceeds capture");auto index=run.index,left=run.length;while(left){const auto count=std::min(left,std::size_t(a.width)-index%std::size_t(a.width));emit(index%std::size_t(a.width),index/std::size_t(a.width),count,static_cast<const Pixel*>(nullptr),forward?run.after:run.before);index+=count;left-=count;}}
  if(e.dense){const auto& d=*e.dense;const auto& values=forward?d.after:d.before;if(d.x<0||d.y<0||d.width<1||d.height<1||std::int64_t(d.x)+d.width>a.width||std::int64_t(d.y)+d.height>a.height||std::uint64_t(d.width)*d.height!=values.size())throw std::logic_error("Invalid dense pixel history capture");for(int y=0;y<d.height;++y)emit(d.x,std::int64_t(d.y)+y,std::size_t(d.width),values.data()+std::size_t(y)*d.width,Pixel(0));}
 };
 // Check all spans before invalidating caches or mutating the first pixel.
 walk([&](std::int64_t x,std::int64_t y,std::size_t n,const Pixel*,Pixel){(void)map(x,y,n);});
 auto* owner=timeline_.mutableOwnedSurface(r.source->id);if(!owner)throw std::logic_error("Missing writable history owner");
 walk([&](std::int64_t x,std::int64_t y,std::size_t n,const Pixel* values,Pixel fill){const auto span=map(x,y,n);if(!span.count)return;auto destination=owner->pixels.begin()+span.index;if(values)std::copy_n(values+span.skip,span.count,destination);else std::fill_n(destination,span.count,fill);
  const std::int64_t wy=std::int64_t(owner->offsetY)+std::int64_t(span.index/std::size_t(owner->width));
  const std::int64_t wx=std::int64_t(owner->offsetX)+std::int64_t(span.index%std::size_t(owner->width));
  if(wy>=0&&wy<height_){const auto left=std::max<std::int64_t>(0,wx),right=std::min<std::int64_t>(width_,wx+std::int64_t(span.count));if(right>left){change_.include(int(left),int(wy));change_.include(int(right-1),int(wy));}}
 });
}
}
