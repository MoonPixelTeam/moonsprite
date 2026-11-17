#include "animation_transform.h"
#include "layer_compositor.h"
#include "raster_geometry.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <unordered_set>
namespace moon {namespace {
using timeline::Surface;
double jsRound(double v){return std::floor(v+.5);}
double snap(double v){const double r=jsRound(v);return std::abs(v-r)<1e-9?r:v;}
void consume(std::size_t& remaining,std::size_t bytes){if(bytes>remaining)throw std::length_error("Tween exceeds allocation budget");remaining-=bytes;}
const timeline::Cel* slot(const timeline::Timeline& t,const std::string& l,const std::string& f){return t.findCel(l,f);}
timeline::Resolution resolve(const timeline::Timeline& t,const timeline::Cel* c){if(!c)return {};auto r=t.resolveSurface(c->id);if(r.issue!=timeline::LinkIssue::None)throw std::invalid_argument("Invalid tween Cel link");return r;}
std::optional<TweenRegion> bounds(const Surface* s){if(!s)return {};raster::validate(*s);raster::coordinate(std::int64_t(s->offsetX)+s->width);raster::coordinate(std::int64_t(s->offsetY)+s->height);int left=s->width,top=s->height,right=-1,bottom=-1;for(int y=0;y<s->height;++y)for(int x=0;x<s->width;++x)if(s->pixels[std::size_t(y)*s->width+x]>>24){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x);bottom=std::max(bottom,y);}if(right<left)return {};return TweenRegion{raster::coordinate(std::int64_t(s->offsetX)+left),raster::coordinate(std::int64_t(s->offsetY)+top),right-left+1,bottom-top+1};}
void include(std::optional<TweenRegion>& into,TweenRegion b){if(!into){into=b;return;}auto a=*into;const auto x=std::min(a.x,b.x),y=std::min(a.y,b.y);into=TweenRegion{x,y,raster::coordinate(std::max(std::int64_t(a.x)+a.width,std::int64_t(b.x)+b.width)-x),raster::coordinate(std::max(std::int64_t(a.y)+a.height,std::int64_t(b.y)+b.height)-y)};}
int geometryCoordinate(double value){if(!std::isfinite(value)||value<std::numeric_limits<int>::min()||value>std::numeric_limits<int>::max())throw std::length_error("Tween geometry exceeds native coordinate range");return int(value);}
Surface crop(const Surface& s,TweenRegion b){if(std::uint64_t(b.width)*b.height>16*1024*1024)throw std::length_error("Tween source exceeds pixel budget");Surface out;out.width=b.width;out.height=b.height;out.offsetX=b.x;out.offsetY=b.y;out.pixels.resize(std::size_t(b.width)*b.height);for(int y=0;y<b.height;++y)std::copy_n(s.pixels.begin()+std::size_t(b.y-s.offsetY+y)*s.width+b.x-s.offsetX,b.width,out.pixels.begin()+std::size_t(y)*b.width);return out;}
struct Geometry{int left,top,width,height;double x,y,w,h,scale,cosine,sine;};
Geometry geometry(const Surface& s,TweenRegion p,const TransformTweenOptions& o,double progress){
 const double t=tweenProgress(progress,o.easing,o.curve),scale=1+(o.scale/100-1)*t;const auto translation=tweenTranslation(o,t);
 double tx=p.x+p.width*(1-scale)/2+jsRound(translation.x),ty=p.y+p.height*(1-scale)/2+jsRound(translation.y),tw=p.width*scale,th=p.height*scale;
 const double rad=o.rotation*t*3.14159265358979323846/180,cs=snap(std::cos(rad)),sn=snap(std::sin(rad)),cx=tx+tw/2,cy=ty+th/2;
 double left=0,top=0,right=0,bottom=0;bool first=true;
 for(int dy:{0,s.height})for(int dx:{0,s.width}){const double px=snap(double(s.offsetX)+dx),py=snap(double(s.offsetY)+dy),xx=tx+(px-p.x)/p.width*tw,yy=ty+(py-p.y)/p.height*th,x=snap(cx+(xx-cx)*cs-(yy-cy)*sn),y=snap(cy+(xx-cx)*sn+(yy-cy)*cs);if(first){left=right=x;top=bottom=y;first=false;}else{left=std::min(left,x);right=std::max(right,x);top=std::min(top,y);bottom=std::max(bottom,y);}}
 const int ix=geometryCoordinate(std::floor(left)),iy=geometryCoordinate(std::floor(top)),ir=geometryCoordinate(std::ceil(right)),ib=geometryCoordinate(std::ceil(bottom));return {ix,iy,std::max(1,raster::coordinate(std::int64_t(ir)-ix)),std::max(1,raster::coordinate(std::int64_t(ib)-iy)),tx,ty,tw,th,scale,cs,sn};
}
}
TweenPathPoint tweenTranslation(const TransformTweenOptions& o,double progress){const double t=std::clamp(progress,0.,1.);if(!o.path||o.path->size()<2)return {o.offsetX*t,o.offsetY*t};const auto& path=*o.path;std::vector<double> lengths;lengths.reserve(path.size()-1);double length=0;for(std::size_t i=1;i<path.size();++i){const auto distance=std::hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y);length+=distance;lengths.push_back(distance);}double remaining=length*t;for(std::size_t i=0;i<lengths.size();++i){const auto distance=lengths[i];if(distance>0&&remaining<=distance){const auto ratio=remaining/distance;return {path[i].x+(path[i+1].x-path[i].x)*ratio,path[i].y+(path[i+1].y-path[i].y)*ratio};}remaining-=distance;}return path.back();}
void validateTransformTweenOptions(const TransformTweenOptions& o){
 validateCrossfadeTweenOptions(o);
 if(o.pathAnchor&&(!std::isfinite(o.pathAnchor->x)||!std::isfinite(o.pathAnchor->y)||std::floor(o.pathAnchor->x)!=o.pathAnchor->x||std::floor(o.pathAnchor->y)!=o.pathAnchor->y||std::abs(o.pathAnchor->x)>16384||std::abs(o.pathAnchor->y)>16384))throw std::invalid_argument("Invalid tween path anchor");
 if(o.path){const auto& p=*o.path;if(p.size()<2||p.size()>2048||p.front().x!=0||p.front().y!=0||std::any_of(p.begin(),p.end(),[](const auto& point){return !std::isfinite(point.x)||!std::isfinite(point.y)||std::abs(point.x)>16384||std::abs(point.y)>16384;})||std::none_of(p.begin(),p.end(),[](const auto& point){return point.x!=0||point.y!=0;}))throw std::invalid_argument("Invalid tween path");}
 if(static_cast<unsigned>(o.scope)>1||!std::isfinite(o.offsetX)||!std::isfinite(o.offsetY)||!std::isfinite(o.rotation)||!std::isfinite(o.scale)||!std::isfinite(o.opacity)||std::abs(o.offsetX)>16384||std::abs(o.offsetY)>16384||std::abs(o.rotation)>3600||o.scale<1||o.scale>1000||o.opacity<0||o.opacity>100)throw std::invalid_argument("Invalid transform tween options");
}
TransformTweenSource prepareTransformTweenSource(const timeline::Timeline& t,const std::string& frame,const std::string& active,const TransformTweenOptions& o,const std::vector<std::string>& selected){
 validateTransformTweenOptions(o);if(!t.hasFrame(frame)||!t.hasLayer(active))throw std::invalid_argument("Invalid tween source");TransformTweenSource out;out.frameIds={frame};out.insertionFrameId=frame;
 if(o.scope==TransformTweenScope::Loop){auto it=std::find_if(t.state().loopSections.begin(),t.state().loopSections.end(),[&](const auto& s){return s.id==o.loopSectionId;});if(it==t.state().loopSections.end())throw std::invalid_argument("Tween requires a valid loop");const auto r=timeline::loopRange(t.state(),*it);if(r.start<0||r.end<r.start)throw std::invalid_argument("Tween requires a valid loop");out.frameIds.clear();for(int n=r.start;n<=r.end;++n)if(!t.state().frames[n].disabled)out.frameIds.push_back(t.state().frames[n].id);if(it->direction=="reverse")std::reverse(out.frameIds.begin(),out.frameIds.end());out.insertionFrameId=t.state().frames[r.end].id;if(out.frameIds.empty())throw std::invalid_argument("Tween loop has no playable poses");}
 std::unordered_set<std::string> ids(selected.begin(),selected.end());std::optional<TweenRegion> pivot;
 for(const auto& l:t.state().layers){if(!l.kind.empty()||l.background||timeline::isLayerEffectivelyLocked(t.state(),l)||(o.layerScope==TweenLayerScope::Current&&l.id!=active)||(o.layerScope==TweenLayerScope::Selected&&!ids.count(l.id)))continue;out.layerIds.push_back(l.id);for(const auto& f:out.frameIds){auto r=resolve(t,slot(t,l.id,f));auto b=bounds(r.surface);if(b)include(pivot,*b);}}
 if(out.layerIds.empty())throw std::invalid_argument("Tween has no unlocked raster layers");out.pivot=pivot.value_or(TweenRegion{});return out;
}
std::string transformTweenSourceFrameId(const TransformTweenSource& s,const TransformTweenOptions& o,int step){if(s.frameIds.empty()||step<0)throw std::invalid_argument("Invalid tween pose");return s.frameIds[(o.scope==TransformTweenScope::Loop?std::max(0,step-1):0)%s.frameIds.size()];}
Surface transformTweenSurface(const Surface& s,TweenRegion pivot,const TransformTweenOptions& o,double progress,std::size_t& remaining,std::size_t maxPixels){
 validateTransformTweenOptions(o);bounds(&s);if(pivot.width<1||pivot.height<1||!std::isfinite(progress))throw std::invalid_argument("Invalid tween geometry");const auto g=geometry(s,pivot,o,progress);if(g.width>16384||g.height>16384||std::uint64_t(g.width)*g.height>maxPixels)throw std::length_error("Tween exceeds raster pixel budget");consume(remaining,std::size_t(g.width)*g.height*4);Surface out;out.width=g.width;out.height=g.height;out.offsetX=g.left;out.offsetY=g.top;out.pixels.resize(std::size_t(g.width)*g.height);const double cx=g.x+g.w/2,cy=g.y+g.h/2;
 for(int y=0;y<g.height;++y)for(int x=0;x<g.width;++x){const double dx=g.left+x+.5-cx,dy=g.top+y+.5-cy,px=snap(cx+dx*g.cosine+dy*g.sine),py=snap(cy-dx*g.sine+dy*g.cosine);const auto sx=std::floor(pivot.x+(px-g.x)/g.scale-s.offsetX),sy=std::floor(pivot.y+(py-g.y)/g.scale-s.offsetY);if(sx>=0&&sy>=0&&sx<s.width&&sy<s.height)out.pixels[std::size_t(y)*g.width+x]=s.pixels[std::size_t(sy)*s.width+std::size_t(sx)];}return out;
}
CrossfadeTweenFrame prepareTransformTweenFrame(const timeline::Timeline& t,const TransformTweenSource& source,const TransformTweenOptions& o,int step,std::size_t& remaining,std::size_t maxPixels){
 validateTransformTweenOptions(o);if(step<0||step>o.frameCount)throw std::invalid_argument("Invalid tween step");const auto frame=transformTweenSourceFrameId(source,o,step);CrossfadeTweenFrame out;const double progress=double(step)/o.frameCount,amount=tweenProgress(progress,o.easing,o.curve);
 for(const auto& layer:t.state().layers){const auto r=resolve(t,slot(t,layer.id,frame));if(!r.source&&!r.surface)continue;timeline::Cel c;if(r.source){c=*r.source;c.id.clear();c.frameId.clear();c.linkedCelId.reset();c.runtimeSharedCelId.reset();}c.layerId=layer.id;const bool selected=std::find(source.layerIds.begin(),source.layerIds.end(),layer.id)!=source.layerIds.end();const auto b=bounds(r.surface);
  if(selected&&r.surface&&b){const auto sourceBytes=std::size_t(b->width)*b->height*4;if(sourceBytes>remaining)throw std::length_error("Tween source exceeds allocation budget");auto temporaryRemaining=remaining-sourceBytes;auto cropped=crop(*r.surface,*b);c.surface=transformTweenSurface(cropped,source.pivot,o,progress,temporaryRemaining,maxPixels);remaining=temporaryRemaining+sourceBytes;c.opacity=(r.source?r.source->opacity.value_or(layer.opacity):layer.opacity)*(1+(o.opacity/100-1)*amount);}else if(r.surface){consume(remaining,std::size_t(r.surface->width)*r.surface->height*4);c.surface=*r.surface;}out.cels.push_back(std::move(c));}
 // Legacy prepareAnimationTweenFrame resolves and independently clones masks.
 for(const auto& slot:t.state().masks)if(slot.frameId==frame){const auto* original=timeline::resolvedMask(t.state(),slot.ownerId,frame);if(!original)continue;auto copy=slot;copy.mask=*original;copy.mask.id.clear();copy.mask.linkedMaskId.clear();copy.frameId.clear();
  bool selected=std::find(source.layerIds.begin(),source.layerIds.end(),slot.ownerId)!=source.layerIds.end();
  if(slot.group){bool any=false;selected=true;for(const auto& layer:t.state().layers){auto parent=layer.groupId;std::unordered_set<std::string> seen;bool child=false;while(parent&&seen.insert(*parent).second){if(*parent==slot.ownerId){child=true;break;}const auto group=std::find_if(t.state().groups.begin(),t.state().groups.end(),[&](const auto& g){return g.id==*parent;});parent=group==t.state().groups.end()?std::nullopt:group->parentGroupId;}if(child){any=true;selected&=std::find(source.layerIds.begin(),source.layerIds.end(),layer.id)!=source.layerIds.end();}}selected&=any;}

  if(selected&&!original->locked&&original->moveWithOwner)copy.mask.surface=transformTweenSurface(original->surface,source.pivot,o,progress,remaining,maxPixels);
  else consume(remaining,original->surface.pixels.size()*sizeof(timeline::Pixel));
  out.masks.push_back(std::move(copy));
 }
 return out;
}
TweenRegion transformTweenPreviewBounds(const timeline::Timeline& t,const TransformTweenSource& source,const TransformTweenOptions& o){
 validateTransformTweenOptions(o);std::optional<TweenRegion> out;
 for(const auto& l:t.state().layers)if(timeline::isLayerEffectivelyVisible(t.state(),l))for(const auto& f:source.frameIds){auto r=resolve(t,slot(t,l.id,f));auto b=bounds(r.surface);if(b)include(out,styledTweenBounds(t,l.id,*b));}
 for(const auto& id:source.layerIds)for(int step=0;step<=o.frameCount;++step){auto r=resolve(t,slot(t,id,transformTweenSourceFrameId(source,o,step)));auto b=bounds(r.surface);if(!b)continue;Surface s;s.width=b->width;s.height=b->height;s.offsetX=b->x;s.offsetY=b->y;const auto g=geometry(s,source.pivot,o,double(step)/o.frameCount);include(out,styledTweenBounds(t,id,{g.left,g.top,g.width,g.height}));}
 if(o.path){const double anchorX=o.pathAnchor?o.pathAnchor->x:source.pivot.x+source.pivot.width/2.,anchorY=o.pathAnchor?o.pathAnchor->y:source.pivot.y+source.pivot.height/2.;for(const auto& point:*o.path){const double x=anchorX+point.x,y=anchorY+point.y;const int left=geometryCoordinate(std::floor(x)),top=geometryCoordinate(std::floor(y)),right=geometryCoordinate(std::ceil(x+1)),bottom=geometryCoordinate(std::ceil(y+1));include(out,{left,top,raster::coordinate(std::int64_t(right)-left),raster::coordinate(std::int64_t(bottom)-top)});}}
 return out.value_or(TweenRegion{});
}
TweenRegion transformTweenCanvasBounds(const timeline::Timeline& t,const std::vector<timeline::Cel>& generated,int width,int height){
 if(width<1||height<1)throw std::invalid_argument("Invalid tween canvas");std::optional<TweenRegion> out=TweenRegion{0,0,width,height};
 auto add=[&](const timeline::Cel& cel,const Surface* surface){auto content=bounds(surface);if(content)include(out,styledTweenBounds(t,cel.layerId,*content));};
 for(const auto& cel:t.state().cels){const auto resolved=resolve(t,&cel);if(!resolved.source)throw std::invalid_argument("Invalid tween source surface");if(resolved.source->id==cel.id)add(cel,resolved.surface);}
 for(const auto& cel:generated)add(cel,cel.surface?&*cel.surface:nullptr);return *out;
}
std::vector<timeline::Pixel> compositeTransformTweenPreview(const timeline::Timeline& t,const TransformTweenSource& source,const TransformTweenOptions& o,int step,TweenRegion region){validateTransformTweenOptions(o);if(step<0||step>o.frameCount||region.width<1||region.height<1||std::uint64_t(region.width)*region.height>1024*1024)throw std::length_error("Tween preview exceeds pixel budget");if(step==0)return compositeNormalRegion(t,source.frameIds.front(),{region.x,region.y,region.width,region.height});std::size_t remaining=64*1024*1024;auto frame=prepareTransformTweenFrame(t,source,o,step,remaining,1024*1024);timeline::State state;state.layers=t.state().layers;state.groups=t.state().groups;state.tilesets=t.state().tilesets;state.canvasWidth=t.state().canvasWidth;state.canvasHeight=t.state().canvasHeight;state.frames={{"transform-preview",o.duration}};for(std::size_t i=0;i<frame.cels.size();++i){auto& c=frame.cels[i];c.id="transform-preview-"+std::to_string(i);c.frameId="transform-preview";}for(std::size_t i=0;i<frame.masks.size();++i){auto& m=frame.masks[i];m.frameId="transform-preview";m.mask.id="transform-preview-mask-"+std::to_string(i);}state.masks=std::move(frame.masks);state.cels=std::move(frame.cels);return compositeNormalRegion(timeline::Timeline(std::move(state)),"transform-preview",{region.x,region.y,region.width,region.height});}
std::optional<timeline::Surface> transformTweenEndpointPreview(const timeline::Timeline& t,const TransformTweenSource& source,const TransformTweenOptions& options){
 validateTransformTweenOptions(options);if(source.layerIds.empty())return {};constexpr std::size_t maxPixels=1024*1024;std::size_t remaining=64*1024*1024;const auto endpoint=transformTweenSourceFrameId(source,options,options.frameCount);
 if(source.layerIds.size()==1){const auto r=resolve(t,slot(t,source.layerIds.front(),endpoint));auto b=bounds(r.surface);if(!b)return {};const auto bytes=std::size_t(b->width)*b->height*4;consume(remaining,bytes);auto cropped=crop(*r.surface,*b);TransformTweenOptions fixed;fixed.rotation=options.rotation;fixed.scale=options.scale;fixed.offsetX=fixed.offsetY=0;return transformTweenSurface(cropped,source.pivot,fixed,1,remaining,maxPixels);}
 TransformTweenOptions fixed=options;fixed.offsetX=fixed.offsetY=0;fixed.path.reset();fixed.pathAnchor.reset();
 auto state=t.state();
 for(auto& layer:state.layers)layer.visible=layer.visible&&std::find(source.layerIds.begin(),source.layerIds.end(),layer.id)!=source.layerIds.end();
 const timeline::Timeline selected(std::move(state));
 const auto region=transformTweenPreviewBounds(selected,source,fixed);
 timeline::Surface result;result.width=region.width;result.height=region.height;result.offsetX=region.x;result.offsetY=region.y;
 result.pixels=compositeTransformTweenPreview(selected,source,fixed,fixed.frameCount,region);return result;
}

}
