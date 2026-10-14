#pragma once
#include "document.h"
#include <cmath>
#include <algorithm>

namespace moon {
// Legacy's 50% overscroll: large canvases may reach the viewport center;
// small canvases may leave the viewport by half their own displayed size.
inline int clampCanvasAxis(int origin,int viewportStart,int viewportSize,int canvasSize) {
  const double center=double(viewportStart)+(viewportSize-canvasSize)/2.0;
  const double limit=std::max(viewportSize,canvasSize)/2.0;
  return std::clamp(origin,int(std::ceil(center-limit)),int(std::floor(center+limit)));
}
struct CanvasPan {
  bool active=false;
  Point pointer{},origin{};
  void begin(Point at,Point from) {active=true;pointer=at;origin=from;}
  Point move(Point at) const {return {origin.x+at.x-pointer.x,origin.y+at.y-pointer.y};}
  void end() {active=false;}
};
// View-only geometry: never changes document pixels or transaction history.
// legacy core/canvas-input-navigation.ts CANVAS_ZOOM_LEVELS/steppedCanvasZoom.
inline constexpr double canvasZoomLevels[]{0.0625,0.083333,0.125,0.166667,0.25,0.333333,0.5,0.666667,1,2,3,4,5,6,8,10,12,16,20,24,32,48,64};
inline Point canvasPixel(Point position,Point origin,double scale) {
  return {int(std::floor((position.x-origin.x)/scale)),int(std::floor((position.y-origin.y)/scale))};
}
inline double nextCanvasScale(double current,int direction) {
  constexpr double epsilon=0.000001;
  if(direction>0) {for(double step:canvasZoomLevels) if(step>current+epsilon) return step;return 64;}
  for(int i=22;i>=0;--i) if(canvasZoomLevels[i]<current-epsilon) return canvasZoomLevels[i];
  return 0.0625;
}
inline Point zoomedCanvasOrigin(Point origin,Point anchor,double oldScale,double newScale) {
  return {anchor.x-int(std::lround(double(anchor.x-origin.x)*newScale/oldScale)),
          anchor.y-int(std::lround(double(anchor.y-origin.y)*newScale/oldScale))};
}
}
