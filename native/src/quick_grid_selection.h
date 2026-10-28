#pragma once
#include "custom_grid.h"
#include "selection_model.h"
#include <cmath>
#include <optional>
namespace moon {
inline std::optional<SelectionMask> gridCellBoundsAt(double px,double py,GridSettings grid,int canvasWidth,int canvasHeight){
 for(double v:{px,py,grid.x,grid.y,grid.width,grid.height,double(canvasWidth),double(canvasHeight)})if(!std::isfinite(v))return {};
 if(grid.width<=0||grid.height<=0||canvasWidth<=0||canvasHeight<=0||px<0||py<0||px>=canvasWidth||py>=canvasHeight)return {};
 const double cellX=grid.x+std::floor((px-grid.x)/grid.width)*grid.width,cellY=grid.y+std::floor((py-grid.y)/grid.height)*grid.height,left=std::max(0.,cellX),top=std::max(0.,cellY),right=std::min(double(canvasWidth),cellX+grid.width),bottom=std::min(double(canvasHeight),cellY+grid.height);
 if(!std::isfinite(cellX)||!std::isfinite(cellY)||!std::isfinite(right)||!std::isfinite(bottom)||right<=left||bottom<=top)return {};
 return SelectionMask{int(left),int(top),int(right-left),int(bottom-top),{}};
}
inline SelectionMask quickSelectCellDragBounds(const SelectionMask& a,const SelectionMask& b){const int x=std::min(a.x,b.x),y=std::min(a.y,b.y);return {x,y,std::max(a.x+a.width,b.x+b.width)-x,std::max(a.y+a.height,b.y+b.height)-y,{}};}
struct QuickSelectionPress{double clientX=0,clientY=0;int pointerId=0;double timeStamp=0;};
inline bool isQuickSelectionSecondPress(const std::optional<QuickSelectionPress>& previous,const QuickSelectionPress& current,int detail=1){if(detail>=2)return true;if(!previous||previous->pointerId!=current.pointerId)return false;const double elapsed=current.timeStamp-previous->timeStamp;if(elapsed<0||elapsed>500)return false;const double dx=current.clientX-previous->clientX,dy=current.clientY-previous->clientY;return dx*dx+dy*dy<=36;}
}
