#pragma once
#include "selection_model.h"
#include <algorithm>
#include <cmath>
#include <optional>
#include <string>
#include <vector>
namespace moon::repeat {
// legacy core/tilemap.ts: fixed adjacent copies, positive modulo and fit zoom.
enum class Mode { Off, X, Y, Both };
inline Mode mode(const std::string& value){return value=="x"?Mode::X:value=="y"?Mode::Y:value=="both"?Mode::Both:Mode::Off;}
inline bool includesX(Mode m){return m==Mode::X||m==Mode::Both;}
inline bool includesY(Mode m){return m==Mode::Y||m==Mode::Both;}
struct Point{double x=0,y=0;};
struct Offset{int x=0,y=0;};
struct Mapped{Point local;Offset offset;};
inline double modulo(double n,double size){return std::fmod(std::fmod(n,size)+size,size);}
inline Point wrap(Point p,int w,int h,Mode m){if(includesX(m)&&w>0)p.x=modulo(p.x,w);if(includesY(m)&&h>0)p.y=modulo(p.y,h);return p;}
inline std::vector<Offset> offsets(Mode m){std::vector<Offset> result;for(int y=includesY(m)?-1:0;y<=(includesY(m)?1:0);++y)for(int x=includesX(m)?-1:0;x<=(includesX(m)?1:0);++x)result.push_back({x,y});return result;}
inline std::optional<Mapped> map(Point p,int w,int h,Mode m,bool outside=false){
 if(m==Mode::Off)return Mapped{p,{0,0}};if(w<=0||h<=0)return {};
 if((!includesX(m)&&(p.x<0||p.x>=w))||(!includesY(m)&&(p.y<0||p.y>=h)))return {};
 const Offset o{includesX(m)?int(std::floor(p.x/w)):0,includesY(m)?int(std::floor(p.y/h)):0};
 if(!outside&&(o.x< -1||o.x>1||o.y< -1||o.y>1))return {};return Mapped{wrap(p,w,h,m),o};
}
inline double fit(double vw,double vh,int w,int h,Mode m,double rotation=0){
 const double rw=double(w)*(includesX(m)?3:1),rh=double(h)*(includesY(m)?3:1),a=rotation*3.14159265358979323846/180,c=std::abs(std::cos(a)),s=std::abs(std::sin(a)),dw=rw*c+rh*s,dh=rw*s+rh*c;
 if(vw<=0||vh<=0||dw<=0||dh<=0)return 1;return std::clamp(std::min(vw/dw,vh/dh),.0625,64.);
}
struct Segment{int start,length;};
inline std::vector<Segment> axis(int start,int length,int size,bool repeated){
 if(length<=0||size<=0)return {};if(!repeated){const int first=std::max(0,start),last=std::min(size,start+length);return last>first?std::vector<Segment>{{first,last-first}}:std::vector<Segment>{};}
 if(length>=size)return {{0,size}};const int first=int(modulo(start,size)),count=std::min(length,size-first);if(count==length)return {{first,count}};return {{first,count},{0,length-count}};
}
inline std::optional<SelectionMask> wrapSelection(const std::optional<SelectionMask>& value,int w,int h,Mode m){
 if(!value||w<=0||h<=0)return {};const auto& s=*value;const bool rx=includesX(m),ry=includesY(m);const int ex=s.x+s.width-1,ey=s.y+s.height-1,xp=rx?int(std::floor(double(s.x)/w)):0,yp=ry?int(std::floor(double(s.y)/h)):0;
 if((!rx||int(std::floor(double(ex)/w))==xp)&&(!ry||int(std::floor(double(ey)/h))==yp)&&(rx||(s.x>=0&&ex<w))&&(ry||(s.y>=0&&ey<h))){auto result=s;result.x-=xp*w;result.y-=yp*h;return result;}
 int left=w,top=h,right=-1,bottom=-1;std::size_t selected=0;
 if(s.mask.empty()){
  const auto xs=axis(s.x,s.width,w,rx),ys=axis(s.y,s.height,h,ry);if(xs.empty()||ys.empty())return {};int nx=0,ny=0;for(auto x:xs){left=std::min(left,x.start);right=std::max(right,x.start+x.length-1);nx+=x.length;}for(auto y:ys){top=std::min(top,y.start);bottom=std::max(bottom,y.start+y.length-1);ny+=y.length;}selected=std::size_t(nx)*ny;
  SelectionMask result{left,top,right-left+1,bottom-top+1,{}};if(selected==std::size_t(result.width)*result.height)return result;result.mask.resize(std::size_t(result.width)*result.height);for(auto y:ys)for(auto x:xs)for(int row=y.start;row<y.start+y.length;++row)std::fill_n(result.mask.begin()+std::size_t(row-top)*result.width+x.start-left,x.length,1);return result;
 }
 std::vector<unsigned char> canvas(std::size_t(w)*h);for(int y=0;y<s.height;++y)for(int x=0;x<s.width;++x){if(s.mask[std::size_t(y)*s.width+x]!=1)continue;int tx=s.x+x,ty=s.y+y;if(rx)tx=int(modulo(tx,w));else if(tx<0||tx>=w)continue;if(ry)ty=int(modulo(ty,h));else if(ty<0||ty>=h)continue;auto& v=canvas[std::size_t(ty)*w+tx];if(v)continue;v=1;++selected;left=std::min(left,tx);right=std::max(right,tx);top=std::min(top,ty);bottom=std::max(bottom,ty);}
 if(!selected)return {};SelectionMask result{left,top,right-left+1,bottom-top+1,{}};if(selected==std::size_t(result.width)*result.height)return result;result.mask.resize(std::size_t(result.width)*result.height);for(int y=top;y<=bottom;++y)std::copy_n(canvas.begin()+std::size_t(y)*w+left,result.width,result.mask.begin()+std::size_t(y-top)*result.width);return result;
}
}
