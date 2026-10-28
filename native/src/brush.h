#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>
#include <optional>
#include "brush_dynamics.h"
namespace moon {
enum class PatternPaintMode { Paint, Source, Target };
enum class BrushShape { Round, Square, Line };
enum class InkMode { Simple, CopyAlphaColor, LockAlpha };
enum class BrushDitherTemplate { Checker, Diagonal, DiagonalReverse, Horizontal, Vertical, Bayer2, Bayer4, Bayer8 };
inline int brushDitherStageCount(BrushDitherTemplate t){switch(t){case BrushDitherTemplate::Checker:return 2;case BrushDitherTemplate::Diagonal:case BrushDitherTemplate::DiagonalReverse:case BrushDitherTemplate::Horizontal:case BrushDitherTemplate::Vertical:return 6;case BrushDitherTemplate::Bayer2:return 4;case BrushDitherTemplate::Bayer4:return 16;case BrushDitherTemplate::Bayer8:return 64;}return 1;}
inline int brushDitherStageAt(BrushDitherTemplate t,int x,int y){auto mod=[](int v,int n){v%=n;return v<0?v+n:v;};if(t==BrushDitherTemplate::Checker)return ((x+y)&1)==0?0:1;if(t==BrushDitherTemplate::Diagonal)return mod(x+y,6);if(t==BrushDitherTemplate::DiagonalReverse)return mod(x-y,6);if(t==BrushDitherTemplate::Horizontal)return mod(y,6);if(t==BrushDitherTemplate::Vertical)return mod(x,6);const int n=t==BrushDitherTemplate::Bayer2?2:t==BrushDitherTemplate::Bayer4?4:8;static constexpr int q[2][2]={{0,2},{3,1}};int value=0;for(int stride=1;stride<n;stride*=2)value=value*4+q[(mod(y,n)/stride)&1][(mod(x,n)/stride)&1];return value;}
struct BrushOptions {int size=1,opacity=100;BrushShape shape=BrushShape::Round;bool perfectPixels=false;int lineDirectionStep=1;bool dither=false;BrushDitherTemplate ditherTemplate=BrushDitherTemplate::Bayer4;int ditherStage=8;InkMode ink=InkMode::Simple;PatternPaintMode imagePaintMode=PatternPaintMode::Paint;};
inline bool brushDitherContains(const BrushOptions& b,int x,int y){if(!b.dither)return true;return brushDitherStageAt(b.ditherTemplate,x,y)<std::clamp(b.ditherStage,1,brushDitherStageCount(b.ditherTemplate));}
struct BrushPathPoint { int x=0,y=0; int size=1; int opacity=100; double angle=0; std::optional<double> gradient; };
// Legacy appendPerfectPixelSegment: interpolate a raster segment while
// removing the middle pixel of a 2-pixel diagonal corner.
inline bool appendPerfectPixelSegment(std::vector<BrushPathPoint>& path, BrushPathPoint target) {
  if(path.empty()){path.push_back(target);return false;}
  const auto start=path.back(); int x=start.x,y=start.y;
  const int dx=std::abs(target.x-x), sx=x<target.x?1:-1;
  const int dy=-std::abs(target.y-y), sy=y<target.y?1:-1;
  int error=dx+dy; const int total=std::max(dx,-dy); bool removed=false; int step=0;
  while(x!=target.x || y!=target.y){ const int twice=2*error;
    if(twice>=dy){error+=dy;x+=sx;} if(twice<=dx){error+=dx;y+=sy;} ++step;
    const double t=total?double(step)/total:1.0;
    BrushPathPoint p{x,y,int(std::lround(start.size+(target.size-start.size)*t)),int(std::lround(start.opacity+(target.opacity-start.opacity)*t)),dynamics::interpolateAngle(start.angle,target.angle,t),start.gradient&&target.gradient?std::optional<double>{*start.gradient+(*target.gradient-*start.gradient)*t}:target.gradient};
    if(path.size()>=2){const auto prev=path.back(), before=path[path.size()-2];
      const bool diagonal=std::abs(p.x-before.x)==1&&std::abs(p.y-before.y)==1;
      const bool corner=(prev.x==before.x&&prev.y==p.y)||(prev.y==before.y&&prev.x==p.x);
      if(diagonal&&corner){path.pop_back();removed=true;}
    }
    if(path.empty()||path.back().x!=p.x||path.back().y!=p.y)path.push_back(p);
  } return removed;
}
template<class PointLike> inline std::vector<BrushPathPoint> perfectPixelPathPoints(const std::vector<PointLike>& points){std::vector<BrushPathPoint> out;for(const auto& p:points)appendPerfectPixelSegment(out,{int(p.x),int(p.y),1,100});return out;}
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
inline std::vector<BrushSpan> brushSpans(BrushOptions brush,int maximumSize=64) {
  const int size=std::clamp(brush.size,1,maximumSize);
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
// Direct legacy core/ink.ts: copy retains mask coverage but ignores opacity.
inline std::uint32_t resolveInkStampColor(InkMode mode,std::uint32_t source,int coverage=255,int opacity=100){coverage=std::clamp(coverage,0,255);const int effective=mode==InkMode::CopyAlphaColor?coverage:int(std::floor(coverage*std::clamp(opacity,0,100)/100.0+.5));return (source&0xffffff)|(std::uint32_t(std::floor((source>>24)*effective/255.0+.5))<<24);}
inline std::uint32_t applyInkColor(InkMode mode,std::uint32_t destination,std::uint32_t source){if(mode==InkMode::CopyAlphaColor)return source;if(mode==InkMode::LockAlpha&&(!(source>>24)||!(destination>>24)))return destination;auto value=brushComposite(destination,source,100);return mode==InkMode::LockAlpha?(value&0xffffff)|(destination&0xff000000):value;}
inline std::uint32_t inkBrushComposite(std::uint32_t base,std::uint32_t color,int opacity,InkMode mode,int coverage=255){if(mode==InkMode::Simple)return brushComposite(base,color,int(std::floor(std::clamp(opacity,0,100)*std::clamp(coverage,0,255)/255.0+.5)));if(mode!=InkMode::CopyAlphaColor&&int(std::floor(coverage*std::clamp(opacity,0,100)/100.0+.5))==0)return base;return applyInkColor(mode,base,resolveInkStampColor(mode,color,coverage,opacity));}

}
