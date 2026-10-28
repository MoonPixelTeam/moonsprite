#include "document.h"
#include "raster_geometry.h"
#include "smooth_brush.h"
namespace moon {
liquify::Context Document::liquifyContext(){
 auto* s=timeline_.mutableOwnedSurface(liquifyOwner_);if(!s)throw std::logic_error("Missing liquify owner");
 liquify::Context c;c.x=s->offsetX;c.y=s->offsetY;c.w=s->width;c.h=s->height;
 c.current=[this,s](int x,int y)->std::optional<Pixel>{if(x<s->offsetX||y<s->offsetY||std::int64_t(x)>=std::int64_t(s->offsetX)+s->width||std::int64_t(y)>=std::int64_t(s->offsetY)+s->height)return {};return static_cast<const timeline::Surface*>(s)->pixels[std::size_t(y-s->offsetY)*s->width+x-s->offsetX];};
 c.baseline=[this,s,current=c.current](int x,int y)->std::optional<Pixel>{auto v=current(x,y);if(!v)return {};const auto i=std::size_t(y-s->offsetY)*s->width+x-s->offsetX;auto found=liquifyLookup_.find(i);return found==liquifyLookup_.end()?v:std::optional<Pixel>{liquifyDeltas_[found->second].before};};
 c.allowed=[this](int x,int y){if(selection_&&!selectionContains(selection_,x,y))return false;const auto* m=timeline::resolvedMask(timeline_.state(),layer().id,frame().id);if(!m||!m->visible)return true;const auto& s=m->surface;const auto ix=std::int64_t(x)-s.offsetX,iy=std::int64_t(y)-s.offsetY;if(ix<0||iy<0||ix>=s.width||iy>=s.height)return true;const auto p=s.pixels[std::size_t(iy)*s.width+std::size_t(ix)];return !(p>>24)||(p&255)>0;};
 c.write=[this,s](int x,int y,Pixel value){if(x<s->offsetX||y<s->offsetY||std::int64_t(x)>=std::int64_t(s->offsetX)+s->width||std::int64_t(y)>=std::int64_t(s->offsetY)+s->height)return false;const auto i=std::size_t(y-s->offsetY)*s->width+x-s->offsetX;const Pixel current=static_cast<const timeline::Surface*>(s)->pixels[i];if(current==value)return false;auto found=liquifyLookup_.find(i);if(found==liquifyLookup_.end()){liquifyDeltas_.push_back({i,current,value});try{liquifyLookup_.emplace(i,liquifyDeltas_.size()-1);}catch(...){liquifyDeltas_.pop_back();throw;}}else liquifyDeltas_[found->second].after=value;s->pixels[i]=value;if(x>=0&&y>=0&&x<width_&&y<height_)change_.include(x,y);return true;};return c;
}
bool Document::beginLiquify(liquify::Point p,liquify::Options options){
 if(active()||!rasterToolsAvailable()||!std::isfinite(p.x)||!std::isfinite(p.y))return false;commitFloatingPaste();cancelStroke();
 // Stage the exact animation disconnect group, including dependents when active is source.
 const std::string selected=cel().id;liquifyBeforeCels_.clear();liquifyAfterCels_.clear();liquifyDeltas_.clear();liquifyLookup_.clear();liquifyGeometry_.reset();
 for(const auto& c:timeline_.state().cels){if(!c.linkedCelId&&!c.runtimeSharedCelId)continue;auto r=timeline_.resolveSurface(c.id);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface)throw std::logic_error("Invalid liquify source");if(c.id!=selected&&r.source->id!=selected)continue;liquifyBeforeCels_.push_back(c);auto next=c;next.surface=*r.surface;next.opacity=r.source->opacity;next.zIndex=r.source->zIndex;next.linkedCelId.reset();next.runtimeSharedCelId.reset();liquifyAfterCels_.push_back(std::move(next));}
 try {
  if(!liquifyAfterCels_.empty()){Edit e{{},state_,nextState_};e.afterCels=liquifyAfterCels_;applyCelEdit(e,true);}
  const auto r=timeline_.resolveSurface(cel().id);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface)throw std::logic_error("Invalid liquify owner");liquifyOwner_=r.source->id;auto* owner=timeline_.mutableOwnedSurface(liquifyOwner_);raster::validate(*owner);
  const bool covers=owner->offsetX<=0&&owner->offsetY<=0&&std::int64_t(owner->offsetX)+owner->width>=width_&&std::int64_t(owner->offsetY)+owner->height>=height_;
  if(!covers){constexpr std::size_t limit=256*1024*1024;std::size_t used=0;for(const auto& c:timeline_.state().cels)if(c.surface){if(c.surface->pixels.size()>(limit-used)/sizeof(Pixel))throw std::length_error("Liquify expansion exceeds document pixel budget");used+=c.surface->pixels.size()*sizeof(Pixel);}auto expanded=raster::expanded(*owner,{0,0,width_,height_},limit-used);if(expanded){liquifyGeometry_=std::move(*owner);*owner=std::move(*expanded);}}
  liquifyOptions_=liquify::normalize(options);liquifyLast_=p;liquifyStroke_.emplace();active_=true;change_={};projectStrokeStarted_=std::chrono::steady_clock::now();return true;
 }catch(...){cancelLiquify();throw;}
}
bool Document::updateLiquify(liquify::Point p){if(!liquifyActive()||!std::isfinite(p.x)||!std::isfinite(p.y))return false;auto c=liquifyContext();const auto& o=liquifyOptions_;const bool changed=o.mode==liquify::Mode::Push?liquifyStroke_->pushPath(c,liquifyLast_,{p},o.radius,o.strength):liquifyStroke_->holdPath(c,liquifyLast_,p,o.mode,o.radius,o.strength);liquifyLast_=p;if(changed)publishChange();return changed;}
bool Document::holdLiquify(){if(!liquifyActive())return false;auto c=liquifyContext();const auto& o=liquifyOptions_;const bool changed=liquifyStroke_->holdStep(c,liquifyLast_,o.mode,o.radius,std::max(.1,o.strength*.1));if(changed)publishChange();return changed;}
void Document::cancelLiquify(){
 const bool had=liquifyStroke_.has_value();auto* owner=timeline_.mutableOwnedSurface(liquifyOwner_);if(owner){for(const auto& d:liquifyDeltas_)owner->pixels[d.index]=d.before;if(liquifyGeometry_)*owner=std::move(*liquifyGeometry_);}
 liquifyStroke_.reset();liquifyGeometry_.reset();liquifyDeltas_.clear();liquifyLookup_.clear();liquifyOwner_.clear();active_=false;strokePixels_=nullptr;
 if(!liquifyBeforeCels_.empty()){Edit e{{},state_,nextState_};e.beforeCels=std::move(liquifyBeforeCels_);applyCelEdit(e,false);}liquifyBeforeCels_.clear();liquifyAfterCels_.clear();if(had){change_={0,0,width_,height_};publishChange();}
}
bool Document::commitLiquify(){
 if(!liquifyActive())return false;auto c=liquifyContext();auto* owner=timeline_.mutableOwnedSurface(liquifyOwner_);
 if(liquifyOptions_.mode==liquify::Mode::Push&&liquifyOptions_.smoothing){std::vector<std::size_t> visited;for(const auto& d:liquifyDeltas_)if(d.before!=owner->pixels[d.index]){const int x=owner->offsetX+int(d.index%owner->width),y=owner->offsetY+int(d.index/owner->width);if(x>=0&&y>=0&&x<width_&&y<height_)visited.push_back(std::size_t(y)*width_+x);}const auto result=smoothBrushPixels(width_,height_,visited,selection_,liquifyOptions_.smoothingStrength,[&](int x,int y){return c.current(x,y).value_or(0);},[&](int x,int y){return c.current(x,y).has_value();});for(const auto& [i,p]:result)c.write(int(i%width_),int(i/width_),p);publishChange();}
 Edit pixels{{},state_,nextState_};pixels.targetCelId=cel().id;pixels.pixelAddress=PixelAddressSpace{owner->width,owner->height,owner->storageOriginX.value_or(0),owner->storageOriginY.value_or(0)};for(const auto& d:liquifyDeltas_)if(d.before!=d.after)pixels.pixels.push_back(d);
 if(pixels.pixels.empty()){cancelLiquify();return false;}
 // Native owner expansion and legacy unlink are one reversible transaction.
 Edit combined{{},state_,nextState_};
 if(!liquifyBeforeCels_.empty()){Edit links{{},state_,nextState_};links.beforeCels=liquifyBeforeCels_;links.afterCels=liquifyAfterCels_;combined.children.push_back(std::move(links));}
 if(liquifyGeometry_){Edit geometry{{},state_,nextState_};auto baseline=*owner;for(const auto& d:liquifyDeltas_)baseline.pixels[d.index]=d.before;geometry.surfaceChanges.push_back({liquifyOwner_,*liquifyGeometry_,std::move(baseline)});combined.children.push_back(std::move(geometry));}
 combined.children.push_back(std::move(pixels));pushEdit(std::move(combined),U"液化");projectInformation_.drawing(std::max<std::int64_t>(1,std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-projectStrokeStarted_).count()));
 liquifyStroke_.reset();liquifyGeometry_.reset();liquifyBeforeCels_.clear();liquifyAfterCels_.clear();liquifyDeltas_.clear();liquifyLookup_.clear();liquifyOwner_.clear();active_=false;strokePixels_=nullptr;return true;
}
}
