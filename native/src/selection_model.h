#pragma once
#include <algorithm>
#include <cmath>
#include <optional>
#include <vector>
#include "brush.h"
namespace moon {
struct SelectionMask {int x=0,y=0,width=0,height=0;std::vector<unsigned char> mask;};
inline bool selectionContains(const std::optional<SelectionMask>& selection,int x,int y){if(!selection || x<selection->x || y<selection->y || x>=selection->x+selection->width || y>=selection->y+selection->height)return false;return selection->mask.empty() || selection->mask[(y-selection->y)*selection->width+x-selection->x]==1;}
// Legacy selectionContentHit: true mask edges take priority over its interior.
inline int selectionContentHit(const std::optional<SelectionMask>& s,double px,double py,double radius){
 if(!s)return 0;const double r2=radius*radius;
 auto segment=[&](double x1,double y1,double x2,double y2){const double x=std::clamp(px,x1,x2),y=std::clamp(py,y1,y2);return (px-x)*(px-x)+(py-y)*(py-y)<=r2;};
 for(int y=std::max(s->y,int(std::floor(py-radius))-1);y<std::min(s->y+s->height,int(std::ceil(py+radius))+1);++y)
 for(int x=std::max(s->x,int(std::floor(px-radius))-1);x<std::min(s->x+s->width,int(std::ceil(px+radius))+1);++x)if(selectionContains(s,x,y)){
  if((!selectionContains(s,x,y-1) && segment(x,y,x+1,y)) || (!selectionContains(s,x,y+1) && segment(x,y+1,x+1,y+1)) || (!selectionContains(s,x-1,y) && segment(x,y,x,y+1)) || (!selectionContains(s,x+1,y) && segment(x+1,y,x+1,y+1)))return 1;
 }
 return selectionContains(s,int(std::floor(px)),int(std::floor(py)))?2:0;
}
inline bool selectionEqual(const std::optional<SelectionMask>& a,const std::optional<SelectionMask>& b){if(!a || !b)return bool(a)==bool(b);return a->x==b->x && a->y==b->y && a->width==b->width && a->height==b->height && a->mask==b->mask;}
inline std::optional<SelectionMask> trimSelection(SelectionMask s){int left=s.width,top=s.height,right=-1,bottom=-1;if(s.mask.empty())return s.width>0 && s.height>0?std::optional<SelectionMask>{s}:std::optional<SelectionMask>{};for(int y=0;y<s.height;++y)for(int x=0;x<s.width;++x)if(s.mask[y*s.width+x]){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x);bottom=std::max(bottom,y);}if(right<0)return {};SelectionMask out{s.x+left,s.y+top,right-left+1,bottom-top+1,{}};out.mask.resize(out.width*out.height);bool rectangle=true;for(int y=0;y<out.height;++y)for(int x=0;x<out.width;++x){auto value=s.mask[(y+top)*s.width+x+left];out.mask[y*out.width+x]=value;rectangle&=value==1;}if(rectangle)out.mask.clear();return out;}
inline std::optional<SelectionMask> rectangleSelection(int x,int y,int width,int height,int canvasWidth,int canvasHeight){const int right=std::min(canvasWidth,x+width),bottom=std::min(canvasHeight,y+height);x=std::max(0,x);y=std::max(0,y);if(right<=x || bottom<=y)return {};return SelectionMask{x,y,right-x,bottom-y,{}};}
// 0 replace, 1 add, 2 subtract, 3 intersect; legacy combineSelection.
inline std::optional<SelectionMask> combineSelection(const std::optional<SelectionMask>& a,const std::optional<SelectionMask>& b,int mode){if(mode==0)return b;if(!a)return mode==1?b:std::optional<SelectionMask>{};if(!b)return mode==2?a:std::optional<SelectionMask>{};const int x=std::min(a->x,b->x),y=std::min(a->y,b->y),right=std::max(a->x+a->width,b->x+b->width),bottom=std::max(a->y+a->height,b->y+b->height);SelectionMask s{x,y,right-x,bottom-y,{}};s.mask.resize(s.width*s.height);for(int row=0;row<s.height;++row)for(int col=0;col<s.width;++col){const bool av=selectionContains(a,x+col,y+row),bv=selectionContains(b,x+col,y+row);s.mask[row*s.width+col]=mode==1?(av||bv):mode==2?(av&&!bv):(av&&bv);}return trimSelection(std::move(s));}
inline std::optional<SelectionMask> invertSelection(const std::optional<SelectionMask>& selection,int width,int height){if(!selection)return {};SelectionMask out{0,0,width,height,{}};out.mask.resize(width*height);bool any=false;for(int y=0;y<height;++y)for(int x=0;x<width;++x){out.mask[y*width+x]=!selectionContains(selection,x,y);any|=out.mask[y*width+x]!=0;}return any?std::optional<SelectionMask>{std::move(out)}:std::optional<SelectionMask>{};}
struct SelectionClipboard {int width=0,height=0;std::optional<int> originX,originY;std::vector<std::uint32_t> pixels;std::vector<unsigned char> mask;};
}
