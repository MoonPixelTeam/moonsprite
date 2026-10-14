#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>
namespace moon {
enum class BrushShape { Round, Square, Line };
struct BrushOptions {int size=1,opacity=100;BrushShape shape=BrushShape::Round;};
struct BrushSpan {int y,left,right;};
// legacy tools-brush / selection raster traversal: keep direction-sensitive ties
// and stamp spacing identical for the preview and the committed stroke.
template<class Stamp> inline void visitBrushLine(int ax,int ay,int bx,int by,int reach,bool image,bool lineShape,int width,int height,Stamp stamp) {
  const bool steep=std::abs(std::int64_t(by)-ay)>std::abs(std::int64_t(bx)-ax);
  if(steep){std::swap(ax,ay);std::swap(bx,by);}const bool reversed=ax>bx;
  if(reversed){std::swap(ax,bx);std::swap(ay,by);}
  const std::uint64_t span=std::int64_t(bx)-ax;if(!span){if(steep)stamp(ay,ax);else stamp(ax,ay);return;}
  const auto delta=std::int64_t(by)-ay;const std::uint64_t slope=std::abs(delta);
  const auto first=std::max<std::int64_t>(-reach,ax),last=std::min<std::int64_t>((steep?height:width)+reach-1,bx);
  for(auto cursor=first;cursor<=last;++cursor){const auto major=image && reversed?last-(cursor-first):cursor;const std::uint64_t offset=major-std::int64_t(ax),index=reversed?span-offset:offset;
    const int spacing=lineShape?1:std::max(1,reach/16);if(index && index!=span && index%spacing)continue;
    const auto step=(offset*slope+(reversed?span/2:(span-1)/2))/span;const int minor=int(std::int64_t(ay)+(delta<0?-std::int64_t(step):std::int64_t(step)));
    if(steep)stamp(minor,int(major));else stamp(int(major),minor);
  }
}
// Direct port: legacy core/tools-brush-spans.ts integerEllipseRowSpans.
inline std::vector<BrushSpan> brushSpans(BrushOptions brush) {
  const int size=std::clamp(brush.size,1,64);
  if(brush.shape==BrushShape::Line) return {{size/2,0,size-1}};
  std::vector<BrushSpan> spans;for(int y=0;y<size;++y) spans.push_back({y,brush.shape==BrushShape::Square?0:size,brush.shape==BrushShape::Square?size-1:-1});
  if(brush.shape==BrushShape::Square) return spans;
  int x0=0,y0=0,x1=size-1,y1=size-1,width=std::abs(x1-x0),height=std::abs(y1-y0),oddHeight=height&1;
  long long dx=4LL*(1-width)*height*height,dy=4LL*(oddHeight+1)*width*width,error=dx+dy+1LL*oddHeight*width*width;
  auto record=[&](int x,int y){if(y>=0 && y<size && x>=0 && x<size) {spans[y].left=std::min(spans[y].left,x);spans[y].right=std::max(spans[y].right,x);}};
  y0+=(height+1)/2;y1=y0-oddHeight;width*=8*width;oddHeight=8*height*height;
  do {
    record(x1,y0);record(x0,y0);record(x0,y1);record(x1,y1);
    const auto doubled=2*error;
    if(doubled<=dy) {++y0;--y1;dy+=width;error+=dy;}
    if(doubled>=dx || 2*error>dy) {++x0;--x1;dx+=oddHeight;error+=dx;}
  } while(x0<=x1);
  while(y0-y1<height) {record(x0-1,y0);record(x1+1,y0);++y0;record(x0-1,y1);record(x1+1,y1);--y1;}
  return spans;
}
// legacy tools-brush.ts uniformCoverage + tools-pixel-edit.ts paintLayerValue.
// Always use the before-stroke pixel. Crossing a stroke never accumulates alpha.
inline std::uint32_t brushComposite(std::uint32_t base,std::uint32_t color,int opacity) {
  const auto coverage=int(std::lround(255*std::clamp(opacity,0,100)/100.0));
  if(!coverage) return base;
  if((color>>24)==0) {
    if(coverage==255) return 0;
    return (base&0xffffff)|(std::uint32_t(std::lround((base>>24)*(1-coverage/255.0)))<<24);
  }
  const auto alpha=int(std::lround((color>>24)*coverage/255.0));
  if(alpha==255) return color;
  if(!alpha) return color&0xffffff; // simple ink treats a rounded zero alpha as transparent write.
  const double top=alpha/255.0,bottom=(base>>24)/255.0,out=top+bottom*(1-top);
  std::uint32_t result=std::uint32_t(std::lround(out*255))<<24;
  for(int channel=0;channel<3;++channel) {
    const int shift=channel*8;
    result|=std::uint32_t(std::lround((((color>>shift)&255)*top+((base>>shift)&255)*bottom*(1-top))/out))<<shift;
  }
  return result;
}
}
