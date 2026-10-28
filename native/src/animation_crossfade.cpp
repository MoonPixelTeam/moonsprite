#include "animation_crossfade.h"
#include "layer_compositor.h"
#include "raster_geometry.h"
#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>
#include <unordered_set>
namespace moon {namespace {
bool validCurve(const std::array<double,4>& c){return std::all_of(c.begin(),c.end(),[](double v){return std::isfinite(v)&&v>=0&&v<=1;});}
const timeline::Cel* slot(const timeline::Timeline& t,const std::string& layer,const std::string& frame){return t.findCel(layer,frame);}
timeline::Resolution resolved(const timeline::Timeline& t,const timeline::Cel* c){if(!c)return {};const auto r=t.resolveSurface(c->id);if(r.issue!=timeline::LinkIssue::None)throw std::invalid_argument("Invalid tween Cel link");return r;}
std::optional<TweenRegion> contentBounds(const timeline::Surface* s){if(!s)return {};raster::validate(*s);raster::coordinate(std::int64_t(s->offsetX)+s->width);raster::coordinate(std::int64_t(s->offsetY)+s->height);int left=s->width,top=s->height,right=-1,bottom=-1;for(int y=0;y<s->height;++y)for(int x=0;x<s->width;++x)if(s->pixels[std::size_t(y)*s->width+x]>>24){left=std::min(left,x);right=std::max(right,x);top=std::min(top,y);bottom=std::max(bottom,y);}if(right<left)return {};return TweenRegion{raster::coordinate(std::int64_t(s->offsetX)+left),raster::coordinate(std::int64_t(s->offsetY)+top),right-left+1,bottom-top+1};}
TweenRegion unite(std::optional<TweenRegion> a,std::optional<TweenRegion> b){if(!a)return b.value_or(TweenRegion{});if(!b)return *a;const int x=std::min(a->x,b->x),y=std::min(a->y,b->y);return {x,y,raster::coordinate(std::max(std::int64_t(a->x)+a->width,std::int64_t(b->x)+b->width)-x),raster::coordinate(std::max(std::int64_t(a->y)+a->height,std::int64_t(b->y)+b->height)-y)};}
timeline::Pixel read(const timeline::Surface* s,int x,int y){if(!s)return 0;const auto sx=std::int64_t(x)-s->offsetX,sy=std::int64_t(y)-s->offsetY;if(sx<0||sy<0||sx>=s->width||sy>=s->height)return 0;return s->pixels[std::size_t(sy)*s->width+std::size_t(sx)];}
unsigned byte(double n){return static_cast<unsigned>(std::clamp(std::floor(n+.5),0.,255.));}
std::size_t canvasPixels(int width,int height){if(width<1||height<1||width>1024||height>1024)throw std::invalid_argument("Unsupported tween canvas");return std::size_t(width)*height;}
}
void validateCrossfadeTweenOptions(const CrossfadeTweenOptions& o){if(o.frameCount<1||o.frameCount>120||o.duration<1||o.duration>60000||static_cast<unsigned>(o.layerScope)>2||static_cast<unsigned>(o.easing)>4||static_cast<unsigned>(o.betweenMode)>1||(o.easing==TweenEasing::Custom&&!validCurve(o.curve)))throw std::invalid_argument("Invalid crossfade tween options");}
double tweenProgress(double progress,TweenEasing easing,const std::array<double,4>& curve){const auto t=std::clamp(progress,0.,1.);if(t==0||t==1)return t;if(easing==TweenEasing::EaseIn)return t*t;if(easing==TweenEasing::EaseOut)return 1-(1-t)*(1-t);if(easing==TweenEasing::EaseInOut)return t*t*(3-2*t);if(easing!=TweenEasing::Custom)return t;const auto c=validCurve(curve)?curve:std::array<double,4>{.42,0,.58,1};auto cubic=[](double u,double a,double b){return 3*((1-u)*(1-u))*u*a+3*(1-u)*u*u*b+u*u*u;};double low=0,high=1;for(int i=0;i<32;++i){const auto mid=(low+high)/2;if(cubic(mid,c[0],c[2])<t)low=mid;else high=mid;}return cubic((low+high)/2,c[1],c[3]);}
CrossfadeSurfaceResult crossfadeTweenSurface(const timeline::Surface* start,const timeline::Surface* end,TweenRegion r,double progress,double startOpacity,double endOpacity,std::size_t maxPixels){if(r.width<1||r.height<1||r.width>16384||r.height>16384||std::uint64_t(r.width)*r.height>std::min<std::size_t>(maxPixels,16*1024*1024))throw std::length_error("Crossfade tween exceeds pixel budget");raster::coordinate(std::int64_t(r.x)+r.width);raster::coordinate(std::int64_t(r.y)+r.height);if(!std::isfinite(progress)||progress<0||progress>1||!std::isfinite(startOpacity)||!std::isfinite(endOpacity)||startOpacity<0||startOpacity>1||endOpacity<0||endOpacity>1)throw std::invalid_argument("Invalid crossfade opacity");CrossfadeSurfaceResult out;auto& s=out.surface;s.width=r.width;s.height=r.height;s.offsetX=r.x;s.offsetY=r.y;s.pixels.resize(std::size_t(r.width)*r.height);out.opacity=startOpacity*(1-progress)+endOpacity*progress;const auto amount=out.opacity>0?endOpacity*progress/out.opacity:progress;for(int y=0;y<r.height;++y)for(int x=0;x<r.width;++x){const auto a=read(start,r.x+x,r.y+y),b=read(end,r.x+x,r.y+y);const double aa=(a>>24)*(1-amount),ab=(b>>24)*amount,alpha=aa+ab;if(alpha<=0)continue;timeline::Pixel value=byte(alpha)<<24;for(int shift:{0,8,16})value|=byte((((a>>shift)&255)*aa+((b>>shift)&255)*ab)/alpha)<<shift;s.pixels[std::size_t(y)*r.width+x]=value;}return out;}
CrossfadeTweenSource prepareCrossfadeTweenSource(const timeline::Timeline& t,const std::string& startFrame,const std::string& activeLayer,TweenLayerScope scope,const std::vector<std::string>& selectedLayers,TweenBetweenMode mode){
 if(!t.hasFrame(startFrame)||!t.hasLayer(activeLayer)||static_cast<unsigned>(scope)>2||static_cast<unsigned>(mode)>1)throw std::invalid_argument("Invalid tween source");
 const auto n=t.frameIndex(startFrame);if(n+1>=t.state().frames.size())throw std::invalid_argument("Tween needs a next frame");CrossfadeTweenSource out;out.startFrameId=startFrame;out.endFrameId=t.state().frames[n+1].id;std::size_t shapeBytes=0;
 const std::unordered_set<std::string> selected(selectedLayers.begin(),selectedLayers.end());
 for(const auto& l:t.state().layers){if(timeline::isLayerEffectivelyLocked(t.state(),l)||(scope==TweenLayerScope::Current&&l.id!=activeLayer)||(scope==TweenLayerScope::Selected&&!selected.count(l.id)))continue;
 const auto a=resolved(t,slot(t,l.id,out.startFrameId)),b=resolved(t,slot(t,l.id,out.endFrameId));const auto opacity=[&](const timeline::Resolution& r){return r.source?r.source->opacity.value_or(l.opacity):l.opacity;};
 const auto ab=contentBounds(a.surface),bb=contentBounds(b.surface);CrossfadeTweenLayerSource part;part.layerId=l.id;part.bounds=unite(ab,bb);part.startOpacity=opacity(a);part.endOpacity=opacity(b);
 if(mode==TweenBetweenMode::Morph){if(a.surface&&b.surface&&ab&&bb){part.morph=prepareMorphTween(*a.surface,*b.surface);shapeBytes+=part.morph->byteLength();if(shapeBytes>64*1024*1024)throw std::length_error("Morph tween exceeds prepared source budget");}else if(scope==TweenLayerScope::Current)throw std::invalid_argument("Morph tween requires content at both endpoints");}
 out.layerIds.push_back(l.id);out.layers.push_back(std::move(part));
 }if(out.layers.empty())throw std::invalid_argument("Tween has no unlocked raster layers");return out;
}
std::size_t crossfadeTweenAllocationBytes(const timeline::Timeline& t,int width,int height,const CrossfadeTweenOptions& o){validateCrossfadeTweenOptions(o);const auto pixels=canvasPixels(width,height);const auto bytes=std::uint64_t(pixels)*4*t.state().layers.size()*o.frameCount;if(bytes>128*1024*1024)throw std::length_error("Crossfade tween exceeds native dense allocation budget");return std::size_t(bytes);}

CrossfadeTweenFrame prepareCrossfadeTweenFrame(const timeline::Timeline& t,int width,int height,const CrossfadeTweenSource& source,const CrossfadeTweenOptions& o,int step,std::size_t* sharedRemaining,std::size_t maxPixels){
 validateCrossfadeTweenOptions(o);const auto pixels=canvasPixels(width,height);if(step<0||step>o.frameCount+1||!t.hasFrame(source.startFrameId)||!t.hasFrame(source.endFrameId))throw std::invalid_argument("Invalid tween preview step");
 std::size_t localRemaining=128*1024*1024;auto& remaining=sharedRemaining?*sharedRemaining:localRemaining;auto consume=[&](std::size_t bytes){if(bytes>remaining)throw std::length_error("Tween exceeds allocation budget");remaining-=bytes;};auto fullCanvas=[&](const timeline::Surface* s){return s&&s->width==width&&s->height==height&&s->offsetX==0&&s->offsetY==0;};
 CrossfadeTweenFrame out;out.cels.reserve(t.state().layers.size());const double progress=tweenProgress(double(step)/(o.frameCount+1),o.easing,o.curve);
 for(const auto& l:t.state().layers){const auto* original=slot(t,l.id,source.startFrameId);const auto a=resolved(t,original),b=resolved(t,slot(t,l.id,source.endFrameId));timeline::Cel c;c.opacity=a.source?a.source->opacity:std::nullopt;c.zIndex=a.source?a.source->zIndex:0;c.layerId=l.id;const auto selected=std::find_if(source.layers.begin(),source.layers.end(),[&](const auto& p){return p.layerId==l.id;});
  if(selected!=source.layers.end()){
   CrossfadeSurfaceResult generated;const auto limit=std::min(maxPixels,remaining/sizeof(timeline::Pixel));
   if(selected->morph){if(!a.surface||!b.surface)throw std::invalid_argument("Invalid prepared morph endpoints");generated.surface=morphTweenSurface(*selected->morph,*a.surface,*b.surface,progress,limit);generated.opacity=selected->startOpacity*(1-progress)+selected->endOpacity*progress;}
   else generated=crossfadeTweenSurface(a.surface,b.surface,selected->bounds,progress,selected->startOpacity,selected->endOpacity,limit);
   const auto generatedBytes=generated.surface.pixels.size()*sizeof(timeline::Pixel);consume(generatedBytes);const auto& s=generated.surface;
   const bool dense=!o.autoCropCanvas&&fullCanvas(a.surface)&&fullCanvas(b.surface)&&s.offsetX>=0&&s.offsetY>=0&&std::int64_t(s.offsetX)+s.width<=width&&std::int64_t(s.offsetY)+s.height<=height;
   if(dense){consume(pixels*sizeof(timeline::Pixel));timeline::Surface result;result.width=width;result.height=height;result.pixels.resize(pixels);for(int y=0;y<s.height;++y)std::copy_n(s.pixels.begin()+std::size_t(y)*s.width,s.width,result.pixels.begin()+std::size_t(y+s.offsetY)*width+s.offsetX);c.surface=std::move(result);remaining+=generatedBytes;}
   else c.surface=std::move(generated.surface);
   c.opacity=generated.opacity;c.zIndex=original?original->zIndex:0;
  }else if(a.surface){raster::validate(*a.surface);consume(a.surface->pixels.size()*sizeof(timeline::Pixel));c.surface=*a.surface;}
  else{consume(pixels*sizeof(timeline::Pixel));timeline::Surface empty;empty.width=width;empty.height=height;empty.pixels.resize(pixels);c.surface=std::move(empty);}
  out.cels.push_back(std::move(c));
 }return out;
}
TweenRegion crossfadeTweenPreviewBounds(const timeline::Timeline& t,const CrossfadeTweenSource& source){
 std::optional<TweenRegion> out;auto include=[&](std::optional<TweenRegion> b){if(b)out=out?std::optional<TweenRegion>{unite(out,b)}:b;};
 for(const auto& layer:t.state().layers)if(timeline::isLayerEffectivelyVisible(t.state(),layer))for(const auto& frame:{source.startFrameId,source.endFrameId})include(contentBounds(resolved(t,slot(t,layer.id,frame)).surface));
 for(const auto& part:source.layers)include(part.bounds);return out.value_or(TweenRegion{});
}
std::vector<timeline::Pixel> compositeCrossfadeTweenPreview(const timeline::Timeline& t,int width,int height,const CrossfadeTweenSource& source,const CrossfadeTweenOptions& o,int step,std::optional<TweenRegion> region){
 const auto r=region.value_or(TweenRegion{0,0,width,height});if(r.width<1||r.height<1||std::uint64_t(r.width)*r.height>1024*1024)throw std::length_error("Tween preview exceeds pixel budget");raster::coordinate(std::int64_t(r.x)+r.width);raster::coordinate(std::int64_t(r.y)+r.height);std::size_t remaining=64*1024*1024;auto frame=prepareCrossfadeTweenFrame(t,width,height,source,o,step,&remaining,1024*1024);timeline::State state;state.layers=t.state().layers;state.groups=t.state().groups;state.frames={{source.startFrameId,o.duration}};for(std::size_t i=0;i<frame.cels.size();++i){auto& c=frame.cels[i];c.id="crossfade-preview-"+std::to_string(i);c.frameId=source.startFrameId;}state.cels=std::move(frame.cels);return compositeNormalRegion(timeline::Timeline(std::move(state)),source.startFrameId,{r.x,r.y,r.width,r.height});
}
}
