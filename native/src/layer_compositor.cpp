#include "layer_compositor.h"
#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>
namespace moon {
namespace {
using Pixel=timeline::Pixel;
Pixel over(Pixel bottom,Pixel top,double opacity) {
 const unsigned sa=top>>24,ba=bottom>>24;if(!sa || opacity<=0)return bottom;
 if(opacity==1 && (!ba || sa==255))return top;
 const double a=sa/255.0*opacity,b=ba/255.0,total=a+b*(1-a);if(total<=0)return bottom;
 Pixel result=Pixel(std::floor(total*255+0.5))<<24;
 for(int shift:{0,8,16})result|=Pixel(std::floor((((top>>shift)&255)*a+((bottom>>shift)&255)*b*(1-a))/total+0.5))<<shift;
 return result;
}
}
void compositeOpaqueRgbaRow(Pixel* output,const Pixel* source,std::size_t count) {
 for(std::size_t p=0;p<count;) {
  const auto alpha=source[p]>>24;
  if(!alpha){++p;continue;}
  if(alpha==255){const auto first=p++;while(p<count && (source[p]>>24)==255)++p;std::copy(source+first,source+p,output+first);continue;}
  // Match legacy's opaque destination fast path (round once per channel).
  if((output[p]>>24)==255){const auto a=alpha/255.0;Pixel result=0xff000000;for(int shift:{0,8,16})result|=Pixel(std::floor(((source[p]>>shift)&255)*a+((output[p]>>shift)&255)*(1-a)+0.5))<<shift;output[p]=result;}
  else output[p]=over(output[p],source[p],1);
  ++p;
 }
}
std::vector<Pixel> compositeNormalRegion(const timeline::Timeline& timeline,const std::string& frameId,CompositeRegion r,const std::string& previewLayer,const std::vector<Pixel>* preview,int previewWidth) {
 const auto& state=timeline.state();
 if(std::none_of(state.frames.begin(),state.frames.end(),[&](const auto& f){return f.id==frameId;}))throw std::invalid_argument("Unknown composite frame");
 if(r.width<0 || r.height<0 || std::int64_t(r.x)+r.width>std::numeric_limits<int>::max() || std::int64_t(r.y)+r.height>std::numeric_limits<int>::max() || std::uint64_t(r.width)*r.height>64*1024*1024)throw std::invalid_argument("Invalid composite region");
 // Validate the whole frame before yielding partial output. No silent flattening.
 for(const auto& cel:state.cels)if(cel.frameId==frameId){
  if(cel.zIndex!=0 || (cel.opacity && *cel.opacity!=1))throw std::invalid_argument("Unsupported cel composition");
  if(cel.surface && (cel.surface->storageOriginX || cel.surface->storageOriginY))throw std::invalid_argument("Unsupported raster storage origin");
 }
 std::vector<Pixel> out(std::size_t(r.width)*r.height,0);
 for(auto it=state.layers.rbegin();it!=state.layers.rend();++it){
  const auto& layer=*it;if(!layer.visible || layer.opacity<=0)continue;
  const auto* cel=timeline.findCel(layer.id,frameId);if(!cel)continue;const auto resolved=timeline.resolveSurface(cel->id);if(resolved.issue!=timeline::LinkIssue::None)throw std::invalid_argument("Invalid composite cel link");if(!resolved.surface)continue;
  const auto& s=*resolved.surface;
  if(preview && layer.id==previewLayer){for(int y=0;y<r.height;++y)for(int x=0;x<r.width;++x){const int px=r.x+x,py=r.y+y;if(px>=0 && py>=0 && px<previewWidth && std::size_t(py)*previewWidth+px<preview->size())out[std::size_t(y)*r.width+x]=over(out[std::size_t(y)*r.width+x],(*preview)[std::size_t(py)*previewWidth+px],layer.opacity);}continue;}
  const auto left=std::max<std::int64_t>(r.x,s.offsetX),top=std::max<std::int64_t>(r.y,s.offsetY);
  const auto right=std::min<std::int64_t>(std::int64_t(r.x)+r.width,std::int64_t(s.offsetX)+s.width),bottom=std::min<std::int64_t>(std::int64_t(r.y)+r.height,std::int64_t(s.offsetY)+s.height);
  for(auto y=top;y<bottom;++y){
   const auto src=std::size_t(y-s.offsetY)*s.width+std::size_t(left-s.offsetX),dst=std::size_t(y-r.y)*r.width+std::size_t(left-r.x);
   if(right<=left)continue;
   if(layer.opacity==1)compositeOpaqueRgbaRow(out.data()+dst,s.pixels.data()+src,std::size_t(right-left));
   else for(auto x=left;x<right;++x)out[dst+std::size_t(x-left)]=over(out[dst+std::size_t(x-left)],s.pixels[src+std::size_t(x-left)],layer.opacity);
  }
 }
 return out;
}
Pixel tintOnionPixel(Pixel source,Pixel tint,int opacity,int distance){if(!(source>>24))return 0;const double brightness=.25+(((source&255)*.2126+((source>>8)&255)*.7152+((source>>16)&255)*.0722)/255)*.75;Pixel result=Pixel(std::floor((source>>24)*(std::clamp(opacity,0,100)/100.0)/std::max(1,distance)*(tint>>24)/255+.5))<<24;for(int shift:{0,8,16})result|=Pixel(std::floor(((tint>>shift)&255)*brightness+.5))<<shift;return result;}
std::vector<Pixel> compositeOnionRegion(const timeline::Timeline& timeline,const std::string& frameId,const std::string& layerId,CompositeRegion region,const OnionSkinSettings& settings,const std::string& previewLayer,const std::vector<Pixel>* preview,int previewWidth){
 if(!settings.enabled || timeline.state().frames.size()<2)return compositeNormalRegion(timeline,frameId,region,previewLayer,preview,previewWidth);
 const auto& frames=timeline.state().frames;const auto active=std::find_if(frames.begin(),frames.end(),[&](const auto& f){return f.id==frameId;});if(active==frames.end())throw std::invalid_argument("Unknown onion frame");const int index=int(active-frames.begin());
 const auto* section=timeline::loopAtFrame(timeline.state(),frameId);const auto range=section?timeline::loopRange(timeline.state(),*section):timeline::LoopRange{0,int(frames.size())-1};const int length=range.end-range.start+1;auto neighbor=[&](int offset){const int target=index+offset;return section?range.start+(target-range.start+length)%length:target;};
 std::vector<Pixel> out(std::size_t(region.width)*region.height,0);
 for(auto it=timeline.state().layers.rbegin();it!=timeline.state().layers.rend();++it){const auto& layer=*it;if(!layer.visible || layer.opacity<=0)continue;
  auto blend=[&](const std::string& id,bool ghost,Pixel tint,int opacity,int distance){const auto* slot=timeline.findCel(layer.id,id);if(!slot)return;const auto resolved=timeline.resolveSurface(slot->id);if(resolved.issue!=timeline::LinkIssue::None)throw std::invalid_argument("Invalid onion link");if(!resolved.surface)return;const auto& s=*resolved.surface;
   for(int y=0;y<region.height;++y)for(int x=0;x<region.width;++x){const int sx=region.x+x-s.offsetX,sy=region.y+y-s.offsetY;if(sx<0||sy<0||sx>=s.width||sy>=s.height)continue;const auto source=preview && !ghost && id==frameId && layer.id==previewLayer?(*preview)[std::size_t(region.y+y)*previewWidth+region.x+x]:s.pixels[std::size_t(sy)*s.width+sx];const auto offset=std::size_t(y)*region.width+x;if(ghost){const auto isolated=over(0,source,layer.opacity);out[offset]=over(out[offset],tintOnionPixel(isolated,tint,opacity,distance),1);}else out[offset]=over(out[offset],source,layer.opacity);}
  };
  if(settings.allLayers || layer.id==layerId){for(int distance=std::min(std::clamp(settings.previousFrames,0,8),section?length-1:8);distance>=1;--distance){const int n=neighbor(-distance);if(n>=0)blend(frames[n].id,true,settings.previousColor,settings.previousOpacity,distance);}for(int distance=1;distance<=std::min(std::clamp(settings.nextFrames,0,8),section?length-1:8);++distance){const int n=neighbor(distance);if(n<int(frames.size()))blend(frames[n].id,true,settings.nextColor,settings.nextOpacity,distance);}}
  blend(frameId,false,0,0,0);
 }
 return out;
}

}
