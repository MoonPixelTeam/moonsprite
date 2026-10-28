#pragma once
// Port of legacy/src/renderer/src/core/liquify.ts; callbacks adapt native transactions.
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <functional>
#include <map>
#include <optional>
#include <vector>
namespace moon::liquify {
using Pixel=std::uint32_t;
struct Point {double x=0,y=0;};
enum class Mode {Push,Inflate,Deflate,TwistClockwise,TwistCounterClockwise};
inline Mode temporaryMode(Mode m,bool shift){if(!shift)return m;switch(m){case Mode::Inflate:return Mode::Deflate;case Mode::Deflate:return Mode::Inflate;case Mode::TwistClockwise:return Mode::TwistCounterClockwise;case Mode::TwistCounterClockwise:return Mode::TwistClockwise;default:return m;}}
struct Options {Mode mode=Mode::Push;int radius=16,strength=50;bool smoothing=false;int smoothingStrength=50;};
inline Options normalize(Options o){o.radius=std::clamp(o.radius,1,64);o.strength=std::clamp(o.strength,1,100);o.smoothingStrength=std::clamp(o.smoothingStrength,0,100);if(int(o.mode)<0||int(o.mode)>4)o.mode=Mode::Push;return o;}
inline int jsRound(double n){return int(std::floor(n+.5));}
inline double falloff(double d,double r){const double n=std::min(1.,d/r);return 1-n*n*(3-2*n);}
struct Rect {int x=0,y=0,w=0,h=0;};
struct Context {
 int x=0,y=0,w=0,h=0;
 std::function<std::optional<Pixel>(int,int)> current,baseline;
 std::function<bool(int,int)> allowed;
 std::function<bool(int,int,Pixel)> write;
 bool contains(int px,int py)const{return px>=x&&py>=y&&px<x+w&&py<y+h;}
};
template<class Read> std::optional<Pixel> sample(Read read,double x,double y){
 const int ix=jsRound(x),iy=jsRound(y);auto center=read(ix,iy);const double dx=x-ix,dy=y-iy;
 if(!center||std::abs(dx)<.25||std::abs(dy)<.25)return center;
 auto n=read(ix,iy-1),s=read(ix,iy+1),w=read(ix-1,iy),e=read(ix+1,iy);
 if(!n||!s||!w||!e||n==s||w==e)return center;
 auto horizontal=dx<0?w:e,vertical=dy<0?n:s;return horizontal==vertical?horizontal:center;
}
class Stroke {
 enum class Axis {None,Horizontal,Vertical,Diagonal};
 struct Snapshot {Rect rect;std::vector<Pixel> pixels;};
 struct Preview {Snapshot source;std::map<int,double> horizontal,vertical;Axis axis;double maxDisplacement;};
 struct Path {Point sample;double remaining=0,spacing=0;};
 struct Hold {Point center;Mode mode;int radius;double strength;bool changed;Snapshot source;};
 Axis axis_=Axis::None;std::map<int,double> horizontal_,vertical_;std::optional<Path> path_;
 std::optional<Preview> provisional_;std::optional<Hold> hold_;Mode holdPathMode_=Mode::Push;int holdPathRadius_=0;double holdRemaining_=0;
 static double distance(Point a,Point b){return std::hypot(a.x-b.x,a.y-b.y);}
 static Snapshot capture(Context& c,Point p,double extent,bool push=false){
  const int x=std::max(c.x,push?int(std::ceil(p.x-extent)):int(std::floor(p.x-extent))),y=std::max(c.y,push?int(std::ceil(p.y-extent)):int(std::floor(p.y-extent)));
  const int right=std::min(c.x+c.w-1,push?int(std::floor(p.x+extent)):int(std::ceil(p.x+extent))),bottom=std::min(c.y+c.h-1,push?int(std::floor(p.y+extent)):int(std::ceil(p.y+extent)));
  Snapshot s{{x,y,std::max(0,right-x+1),std::max(0,bottom-y+1)},{}};s.pixels.reserve(std::size_t(s.rect.w)*s.rect.h);
  for(int py=y;py<=bottom;++py)for(int px=x;px<=right;++px)s.pixels.push_back(c.current(px,py).value_or(0));return s;
 }
 static std::optional<Pixel> readSnapshot(const Snapshot& s,int x,int y){if(x<s.rect.x||y<s.rect.y||x>=s.rect.x+s.rect.w||y>=s.rect.y+s.rect.h)return {};return s.pixels[std::size_t(y-s.rect.y)*s.rect.w+x-s.rect.x];}
 bool restorePreview(Context& c){if(!provisional_)return false;bool changed=false;auto p=std::move(*provisional_);provisional_.reset();const auto& r=p.source.rect;for(int y=0;y<r.h;++y)for(int x=0;x<r.w;++x)changed=c.write(r.x+x,r.y+y,p.source.pixels[std::size_t(y)*r.w+x])||changed;horizontal_=std::move(p.horizontal);vertical_=std::move(p.vertical);axis_=p.axis;maxDisplacement=p.maxDisplacement;return changed;}
 bool pushDab(Context& c,Point center,Point delta,int radius,double strength){
  const int left=std::max(c.x,int(std::ceil(center.x-radius))),right=std::min(c.x+c.w-1,int(std::floor(center.x+radius))),top=std::max(c.y,int(std::ceil(center.y-radius))),bottom=std::min(c.y+c.h-1,int(std::floor(center.y+radius)));
  if(left>right||top>bottom)return false;
  const bool hasX=std::abs(delta.x)>1e-9,hasY=std::abs(delta.y)>1e-9;
  if(hasX||hasY){const auto next=hasX&&hasY?Axis::Diagonal:hasX?Axis::Horizontal:Axis::Vertical;if(axis_==Axis::None)axis_=next;else if(axis_!=next)axis_=Axis::Diagonal;}
  bool changed=false;
  if(axis_==Axis::Horizontal||axis_==Axis::Vertical){const bool horizontal=axis_==Axis::Horizontal;auto& shifts=horizontal?horizontal_:vertical_;
   const int start=horizontal?top:left,end=horizontal?bottom:right;
   for(int line=start;line<=end;++line){const double perpendicular=std::abs(line-(horizontal?center.y:center.x));const double influence=(.62+falloff(perpendicular,radius)*.38)*strength;if(influence<=.0001)continue;
    const double shift=shifts[line]+(horizontal?delta.x:delta.y)*influence;shifts[line]=shift;maxDisplacement=std::max(maxDisplacement,std::abs(shift));
    const double half=std::sqrt(std::max(0.,radius*double(radius)-perpendicular*perpendicular));
    const int a=std::max(horizontal?c.x:c.y,int(std::ceil((horizontal?center.x:center.y)-half))),b=std::min(horizontal?c.x+c.w-1:c.y+c.h-1,int(std::floor((horizontal?center.x:center.y)+half)));
    for(int along=a;along<=b;++along){const int x=horizontal?along:line,y=horizontal?line:along;if(!c.allowed(x,y))continue;const int source=jsRound(along-shift);auto value=c.baseline(horizontal?source:line,horizontal?line:source);if(value)changed=c.write(x,y,*value)||changed;}
   }return changed;
  }
  if(axis_!=Axis::Diagonal)return false;
  for(int y=top;y<=bottom;++y){const double v=horizontal_[y]+delta.x*(.62+falloff(std::abs(y-center.y),radius)*.38)*strength;horizontal_[y]=v;maxDisplacement=std::max(maxDisplacement,std::abs(v));}
  for(int x=left;x<=right;++x){const double v=vertical_[x]+delta.y*(.62+falloff(std::abs(x-center.x),radius)*.38)*strength;vertical_[x]=v;maxDisplacement=std::max(maxDisplacement,std::abs(v));}
  for(int y=top;y<=bottom;++y)for(int x=left;x<=right;++x){if(std::hypot(x-center.x,y-center.y)>radius||!c.allowed(x,y))continue;auto value=sample(c.baseline,x-horizontal_[y],y-vertical_[x]);if(value)changed=c.write(x,y,*value)||changed;}return changed;
 }
 template<class Read> bool preserveThin(Context& c,Read read,Point center,int radius,double strength,Mode mode){
  auto occupied=[&](int x,int y){return (read(x,y).value_or(0)>>24)>0;};
  auto thin=[&](int x,int y){if(!occupied(x,y))return false;for(int dy:{-1,1})for(int dx:{-1,1})if(occupied(x+dx,y)&&occupied(x,y+dy)&&occupied(x+dx,y+dy))return false;return true;};
  std::map<std::pair<int,int>,Point> transformed;
  auto forward=[&](int x,int y){const auto key=std::make_pair(x,y);auto it=transformed.find(key);if(it!=transformed.end())return it->second;const double dx=x-center.x,dy=y-center.y,d=std::hypot(dx,dy);Point result{double(x),double(y)};
   if(d>0&&d<radius){if(mode==Mode::Inflate||mode==Mode::Deflate){double low=0,high=radius;for(int i=0;i<20;++i){double mid=(low+high)/2,influence=falloff(mid,radius)*strength,mapped=mid*(mode==Mode::Inflate?1-influence*.75:1+influence);if(mapped<d)low=mid;else high=mid;}double scale=(low+high)/(2*d);result={center.x+dx*scale,center.y+dy*scale};}else{double angle=falloff(d,radius)*strength*(mode==Mode::TwistClockwise?1:-1)*1.5707963267948966;result={center.x+dx*std::cos(angle)-dy*std::sin(angle),center.y+dx*std::sin(angle)+dy*std::cos(angle)};}}
   transformed.emplace(key,result);return result;};
  bool changed=false;auto paint=[&](int x,int y,Pixel value){if(!c.contains(x,y)||std::hypot(x-center.x,y-center.y)>radius||!c.allowed(x,y))return;if((c.current(x,y).value_or(0)>>24)==0)changed=c.write(x,y,value)||changed;};
  const int left=std::max(c.x,int(std::floor(center.x-radius))),right=std::min(c.x+c.w-1,int(std::ceil(center.x+radius))),top=std::max(c.y,int(std::floor(center.y-radius))),bottom=std::min(c.y+c.h-1,int(std::ceil(center.y+radius)));
  const int edges[4][2]={{1,0},{-1,1},{0,1},{1,1}};
  for(int y=top;y<=bottom;++y)for(int x=left;x<=right;++x){if(std::hypot(x-center.x,y-center.y)>radius||!thin(x,y))continue;const Pixel color=*read(x,y);const Point from=forward(x,y);paint(jsRound(from.x),jsRound(from.y),color);
   for(auto& edge:edges){const int nx=x+edge[0],ny=y+edge[1];if(!thin(nx,ny))continue;Point to=forward(nx,ny);int px=jsRound(from.x),py=jsRound(from.y),tx=jsRound(to.x),ty=jsRound(to.y),sx=px<tx?1:-1,sy=py<ty?1:-1,ax=std::abs(tx-px),ay=-std::abs(ty-py),error=ax+ay,step=0,total=std::max(ax,-ay);
    for(;;){paint(px,py,step*2<=total?color:*read(nx,ny));if(px==tx&&py==ty)break;int twice=error*2;if(twice>=ay){error+=ay;px+=sx;}if(twice<=ax){error+=ax;py+=sy;}++step;}
   }
  }return changed;
 }
public:
 std::size_t dabCount=0;double maxDisplacement=0;
 bool pushPath(Context& c,Point from,const std::vector<Point>& points,int radius,double configuredStrength){
  radius=std::max(1,radius);const double strength=std::clamp(configuredStrength/100.,0.,1.);if(strength==0||points.empty())return false;
  if(std::all_of(points.begin(),points.end(),[&](Point p){return distance(p,from)<=1e-9;}))return false;
  const double spacing=std::max(1.,radius*.125);bool changed=restorePreview(c);
  if(!path_)path_=Path{from,spacing,spacing};auto& path=*path_;if(path.spacing!=spacing){path.remaining=spacing;path.spacing=spacing;}
  auto apply=[&](Point p){changed=pushDab(c,p,{p.x-path.sample.x,p.y-path.sample.y},radius,strength)||changed;++dabCount;};
  Point previous=from;
  for(Point end:points){double dx=end.x-previous.x,dy=end.y-previous.y,length=distance(end,previous),consumed=0;
   while(length>1e-9&&consumed+path.remaining<=length+1e-9){consumed=std::min(length,consumed+path.remaining);double ratio=consumed/length;Point point{std::floor((previous.x+dx*ratio)*1e9+.5)/1e9,std::floor((previous.y+dy*ratio)*1e9+.5)/1e9};apply(point);path.sample=point;path.remaining=spacing;}
   path.remaining-=std::max(0.,length-consumed);previous=end;
  }
  const Point end=points.back();if(distance(end,path.sample)>1e-9){provisional_=Preview{capture(c,end,radius,true),horizontal_,vertical_,axis_,maxDisplacement};apply(end);}return changed;
 }
 bool step(Context& c,Point from,Point to,Mode mode,int radius,double configuredStrength,const Snapshot* heldSource=nullptr){
  if(mode==Mode::Push)return pushPath(c,from,{to},radius,configuredStrength);
  radius=std::max(1,radius);const double strength=std::clamp(configuredStrength/100.,0.,1.);if(strength==0)return false;
  Snapshot baseline;
  if(!heldSource){baseline=capture(c,to,(mode==Mode::Deflate?radius*2:radius)+1);const auto r=baseline.rect;for(int y=0;y<r.h;++y)for(int x=0;x<r.w;++x)baseline.pixels[std::size_t(y)*r.w+x]=c.baseline(r.x+x,r.y+y).value_or(0);heldSource=&baseline;}
  auto read=[&](int x,int y){return readSnapshot(*heldSource,x,y);};
  const int left=std::max(c.x,int(std::floor(to.x-radius))),right=std::min(c.x+c.w-1,int(std::ceil(to.x+radius))),top=std::max(c.y,int(std::floor(to.y-radius))),bottom=std::min(c.y+c.h-1,int(std::ceil(to.y+radius)));bool changed=false;
  for(int y=top;y<=bottom;++y)for(int x=left;x<=right;++x){if(!c.allowed(x,y))continue;double dx=x-to.x,dy=y-to.y,d=std::hypot(dx,dy);if(d>radius)continue;double influence=falloff(d,radius)*strength,sx=x,sy=y;
   if(mode==Mode::Inflate||mode==Mode::Deflate){double scale=mode==Mode::Inflate?1-influence*.75:1+influence;sx=to.x+dx*scale;sy=to.y+dy*scale;}else{double a=influence*(mode==Mode::TwistClockwise?-1:1)*1.5707963267948966;sx=to.x+dx*std::cos(a)-dy*std::sin(a);sy=to.y+dx*std::sin(a)+dy*std::cos(a);}
   auto next=sample(read,sx,sy);if(next)changed=c.write(x,y,*next)||changed;
  }return preserveThin(c,read,to,radius,strength,mode)||changed;
 }
 bool holdStep(Context& c,Point to,Mode mode,int radius,double strength){
  if(mode==Mode::Push||strength<=0)return false;radius=std::max(1,radius);
  if(!hold_||hold_->mode!=mode||hold_->radius!=radius||hold_->strength>=100||distance(to,hold_->center)>=.5){
   const double pending=hold_&&!hold_->changed&&hold_->strength<100&&hold_->mode==mode&&hold_->radius==radius?hold_->strength:0;
   hold_=Hold{to,mode,radius,pending,false,capture(c,to,(mode==Mode::Deflate?radius*2:radius)+1)};
  }
  auto& hold=*hold_;const double next=std::min(100.,hold.strength+std::max(0.,strength));if(next==hold.strength)return false;hold.strength=next;bool changed=step(c,hold.center,hold.center,mode,radius,hold.strength,&hold.source);hold.changed=hold.changed||changed;return changed;
 }
 bool holdPath(Context& c,Point from,Point to,Mode mode,int radius,double strength){
  radius=std::max(1,radius);const double spacing=std::max(1.,radius*.125);if(holdPathMode_!=mode||holdPathRadius_!=radius){holdPathMode_=mode;holdPathRadius_=radius;holdRemaining_=spacing;}
  const double dx=to.x-from.x,dy=to.y-from.y,length=distance(to,from);double consumed=0;bool changed=false;
  while(length>1e-9&&consumed+holdRemaining_<=length+1e-9){consumed=std::min(length,consumed+holdRemaining_);double ratio=consumed/length;Point point{std::floor((from.x+dx*ratio)*1e9+.5)/1e9,std::floor((from.y+dy*ratio)*1e9+.5)/1e9};changed=holdStep(c,point,mode,radius,strength*spacing*2/radius)||changed;++dabCount;holdRemaining_=spacing;}
  holdRemaining_-=std::max(0.,length-consumed);return changed;
 }
};
} // namespace moon::liquify
