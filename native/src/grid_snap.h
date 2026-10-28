#pragma once
#include "custom_grid.h"
#include <optional>
namespace moon {
struct GridPoint {double x=0,y=0;};
struct GridRect {double x=0,y=0,width=0,height=0;};
inline bool validGrid(GridSettings g){return std::isfinite(g.x)&&std::isfinite(g.y)&&std::isfinite(g.width)&&std::isfinite(g.height)&&g.width>0&&g.height>0;}
inline GridPoint snapPointToGrid(GridPoint p,GridSettings g){
 if(!validGrid(g)||!std::isfinite(p.x)||!std::isfinite(p.y))return p;
 auto nearest=[](double v,double origin,double size){const double remainder=origin-std::trunc(origin/size)*size,normalized=v-remainder,q=std::trunc(normalized/size),r=normalized-q*size;return remainder+q*size+(r>size/2?size:0);};
 return {nearest(p.x,g.x,g.width),nearest(p.y,g.y,g.height)};
}
inline GridRect snapSelectionBoundsToGrid(GridRect b,GridSettings g){
 if(!validGrid(g)||!std::isfinite(b.x)||!std::isfinite(b.y)||!std::isfinite(b.width)||!std::isfinite(b.height)||b.width<=0||b.height<=0)return b;
 const double l=g.x+std::floor((b.x-g.x)/g.width)*g.width,t=g.y+std::floor((b.y-g.y)/g.height)*g.height,r=g.x+std::ceil((b.x+b.width-g.x)/g.width)*g.width,d=g.y+std::ceil((b.y+b.height-g.y)/g.height)*g.height;
 return {l,t,std::max(g.width,r-l),std::max(g.height,d-t)};
}
inline GridPoint snapSelectionTranslationToGrid(GridRect b,GridPoint delta,GridSettings g){
 if(!validGrid(g)||!std::isfinite(b.x)||!std::isfinite(b.y)||!std::isfinite(b.width)||!std::isfinite(b.height)||b.width<=0||b.height<=0||!std::isfinite(delta.x)||!std::isfinite(delta.y))return delta;
 const double x=b.x+delta.x,y=b.y+delta.y;
 return {delta.x+g.x+std::floor((x-g.x)/g.width+.5)*g.width-x,delta.y+g.y+std::floor((y-g.y)/g.height+.5)*g.height-y};
}
}
