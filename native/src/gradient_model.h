#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <optional>
#include <vector>
#include "selection_transform.h"
namespace moon {
struct GradientStop {double position;std::uint32_t color;};
struct GradientGeometry {TransformPoint center;double radiusX=0,radiusY=0;};
struct GradientSpec {TransformPoint start{},end{};std::uint32_t first=0xff000000,last=0xffffffff;int dither=0;bool radial=false,fromCenter=false,proportional=false;double angle=0;std::optional<GradientGeometry> geometry;std::vector<GradientStop> stops;};
inline int gradientRound(double value){return int(std::floor(value+.5));}
inline TransformPoint constrainGradientEndpoint(TransformPoint start,TransformPoint end){const double dx=end.x-start.x,dy=end.y-start.y,d=std::hypot(dx,dy),step=3.141592653589793/8,a=std::floor(std::atan2(dy,dx)/step+.5)*step;auto snap=[](double v){return std::abs(v-std::round(v))<1e-10?std::round(v):v;};return {snap(start.x+std::cos(a)*d),snap(start.y+std::sin(a)*d)};}
inline GradientGeometry resolveGradientGeometry(const GradientSpec& s){if(s.geometry)return *s.geometry;double dx=s.end.x-s.start.x,dy=s.end.y-s.start.y;if(s.proportional){const double d=std::max(std::abs(dx),std::abs(dy));dx=(dx<0?-1:1)*d;dy=(dy<0?-1:1)*d;}return s.fromCenter?GradientGeometry{s.start,std::abs(dx),std::abs(dy)}:GradientGeometry{{s.start.x+dx/2,s.start.y+dy/2},std::abs(dx)/2,std::abs(dy)/2};}
// createCanvasBrushConfig: Alt freezes the ellipse; releasing Alt establishes
// a centered resize anchor without changing the release sample's geometry.
struct GradientDragGeometry {
 std::optional<GradientGeometry> rotation,resize;TransformPoint anchor{};double rotationAngle=0;int directionX=1,directionY=1;
 void update(GradientSpec& s,TransformPoint point,bool shift,bool center,bool alt){s.proportional=shift;s.fromCenter=center;
  if(!s.radial){s.end=shift?constrainGradientEndpoint(s.start,point):point;s.angle=0;s.geometry.reset();rotation.reset();resize.reset();return;}
  if(alt){if(!rotation){auto initial=s;initial.end=point;rotation=s.geometry?*s.geometry:resolveGradientGeometry(initial);anchor=point;rotationAngle=s.angle;}const auto c=rotation->center;s.angle=rotationAngle+(std::atan2(point.y-c.y,point.x-c.x)-std::atan2(anchor.y-c.y,anchor.x-c.x))*180/3.141592653589793;s.geometry=rotation;}
  else if(rotation){s.geometry=rotation;if(center)s.geometry->center={s.start.x+s.geometry->radiusX-std::floor(s.geometry->radiusX),s.start.y+s.geometry->radiusY-std::floor(s.geometry->radiusY)};resize=s.geometry;anchor=point;rotation.reset();return;}
  else if(resize){const double r=s.angle*3.141592653589793/180,dx=point.x-anchor.x,dy=point.y-anchor.y,localX=dx*std::cos(r)+dy*std::sin(r),localY=-dx*std::sin(r)+dy*std::cos(r);const double oldW=resize->radiusX*2,oldH=resize->radiusY*2;auto dimension=[](double old,double delta,int direction){const int parity=gradientRound(old)%2;return std::max(double(parity?1:2),old+gradientRound(delta*direction)*2);};double w=dimension(oldW,localX,directionX),h=dimension(oldH,localY,directionY);if(shift){const bool horizontal=std::abs(localX)>=std::abs(localY);w=h=horizontal?w:h;const int parity=gradientRound(horizontal?oldH:oldW)%2;auto parityMatch=[](double size,double original){const double minimum=std::fmod(original,2)==0?2:1;double matched=std::max(minimum,size);if(std::fmod(std::abs(matched-original),2)!=0)matched+=matched>minimum?-1:1;return matched;};w=parityMatch(w,oldW);h=parityMatch(h,oldH);}s.geometry=GradientGeometry{resize->center,w/2,h/2};}
  else{s.end=point;s.geometry.reset();s.geometry=resolveGradientGeometry(s);directionX=point.x<s.start.x?-1:1;directionY=point.y<s.start.y?-1:1;}
  s.end=point;
 }
};
inline double gradientAmount(const GradientSpec& s,double x,double y){if(s.radial){const auto g=resolveGradientGeometry(s);if(!g.radiusX && !g.radiusY)return 0;const double r=s.angle*3.141592653589793/180,dx=x-g.center.x,dy=y-g.center.y,a=std::abs(std::cos(r)*dx+std::sin(r)*dy),b=std::abs(-std::sin(r)*dx+std::cos(r)*dy);return std::clamp(std::hypot(g.radiusX?a/g.radiusX:a==0?0:INFINITY,g.radiusY?b/g.radiusY:b==0?0:INFINITY),0.0,1.0);}const double dx=s.end.x-s.start.x,dy=s.end.y-s.start.y,length=dx*dx+dy*dy;return length?std::clamp(((x-s.start.x)*dx+(y-s.start.y)*dy)/length,0.0,1.0):0;}
inline int gradientEditHandle(const GradientSpec& s,TransformPoint point,double zoom){const double radius=std::max(3.0,9/std::max(.01,zoom));auto distance=[](TransformPoint a,TransformPoint b){return std::hypot(a.x-b.x,a.y-b.y);};if(s.radial){if(distance(point,resolveGradientGeometry(s).center)<=radius)return 2;return distance(point,s.end)<=radius?1:-1;}if(distance(s.start,s.end)<=radius && distance(point,s.end)<=radius)return 1;if(distance(point,s.start)<=radius)return 0;if(distance(point,s.end)<=radius)return 1;const double dx=s.end.x-s.start.x,dy=s.end.y-s.start.y,length=dx*dx+dy*dy;if(!length)return -1;const double t=std::clamp(((point.x-s.start.x)*dx+(point.y-s.start.y)*dy)/length,0.0,1.0);return distance(point,{s.start.x+t*dx,s.start.y+t*dy})<=radius?2:-1;}
inline int gradientDitherPeriod(int d){return d==3?8:d==2?4:d==1 || d==4?2:6;}
inline int gradientDitherCount(int d){return d==1?4:d==2?16:d==3?64:d==4?2:6;}
inline int gradientDitherStage(int d,int x,int y){auto mod=[](int v,int n){return (v%n+n)%n;};if(d<=3){const int n=d==1?2:d==2?4:8;int value=0;const int q[2][2]{{0,2},{3,1}};x=mod(x,n);y=mod(y,n);for(int bit=0;(1<<bit)<n;++bit)value=value*4+q[(y>>bit)&1][(x>>bit)&1];return value;}if(d==4)return (x+y)&1;return mod(d==5?x+y:d==6?x-y:d==7?y:x,6);}
inline std::uint32_t gradientInterpolate(std::uint32_t a,std::uint32_t b,double t){std::uint32_t out=0;for(int shift:{0,8,16,24})out|=std::uint32_t(gradientRound(((a>>shift)&255)+(double((b>>shift)&255)-((a>>shift)&255))*std::clamp(t,0.0,1.0)))<<shift;return out;}
class GradientSampler {
 GradientSpec spec_;std::vector<GradientStop> stops_;
public:
 explicit GradientSampler(GradientSpec s):spec_(std::move(s)){stops_=spec_.stops;for(auto& stop:stops_)stop.position=std::clamp(stop.position,0.0,1.0);std::stable_sort(stops_.begin(),stops_.end(),[](auto a,auto b){return a.position<b.position;});if(stops_.size()<2){auto a=spec_.first,b=spec_.last;if(!(a>>24) && (b>>24))a=(a&0xff000000)|(b&0xffffff);if((a>>24) && !(b>>24))b=(b&0xff000000)|(a&0xffffff);stops_={{0,a},{1,b}};}}
 std::uint32_t forAmount(double amount,int x,int y)const {if(amount<=stops_.front().position)return stops_.front().color;if(amount>=stops_.back().position)return stops_.back().color;std::size_t i=1;while(stops_[i].position<amount)++i;const auto a=stops_[i-1],b=stops_[i];const double span=b.position-a.position,t=span?(amount-a.position)/span:1;return spec_.dither?t>=(gradientDitherStage(spec_.dither,x,y)+.5)/gradientDitherCount(spec_.dither)?b.color:a.color:gradientInterpolate(a.color,b.color,t);}
 std::uint32_t sample(int x,int y)const{return forAmount(gradientAmount(spec_,x,y),x,y);}
 // gradient-dither-preview.ts monotone residue runs: one crossing per stop
 // interval/phase, then scatter packed pixels; no color allocation per pixel.
 void row(int y,int left,int right,std::uint32_t* target)const {if(spec_.radial || !spec_.dither){for(int x=left;x<right;++x)target[x-left]=sample(x,y);return;}const int period=gradientDitherPeriod(spec_.dither),width=right-left;const double dx=spec_.end.x-spec_.start.x,dy=spec_.end.y-spec_.start.y,length=dx*dx+dy*dy;
  for(int phase=0;phase<std::min(period,width);++phase){const int count=(width-1-phase)/period+1,step=dx<0?-period:period,first=dx<0?phase+(count-1)*period:phase;const double threshold=(gradientDitherStage(spec_.dither,left+phase,y)+.5)/gradientDitherCount(spec_.dither);int cursor=0;
   for(std::size_t i=0;i+1<stops_.size();++i){const double a=stops_[i].position,b=stops_[i+1].position;auto beyond=[&](int p){const double amount=gradientAmount(spec_,left+first+p*step,y);return amount<=stops_.front().position?false:amount>=stops_.back().position?true:amount>a && (amount>=b || (amount-a)/(b-a)>=threshold);};double crossing=spec_.start.x+((a+(b-a)*threshold)*length-(y-spec_.start.y)*dy)/dx;int low=dx==0?(beyond(0)?cursor:count):std::isfinite(crossing)?std::clamp(int(std::ceil((crossing-left-first)/step)),cursor,count):cursor;while(low>cursor && beyond(low-1))--low;while(low<count && !beyond(low))++low;for(int p=cursor;p<low;++p)target[first+p*step]=stops_[i].color;cursor=low;}for(int p=cursor;p<count;++p)target[first+p*step]=stops_.back().color;
  }
 }
};
}
