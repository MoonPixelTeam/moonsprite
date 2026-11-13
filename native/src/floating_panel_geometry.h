#pragma once
#include "panel_docking.h"
#include "ui_scale.h"
#include "gfx/rect.h"
#include <algorithm>
namespace moon::editor {
inline int panelResizeEdges(gfx::Rect rect,gfx::Point point) {

  if(!rect.contains(point))return 0;

  const int edge=3*uiScale;

  return (point.x<rect.x+edge?1:0)|(point.x>=rect.x2()-edge?2:0)|

         (point.y<rect.y+edge?4:0)|(point.y>=rect.y2()-edge?8:0);

}

inline const char* panelResizeCursor(int edges) {

  if((edges&1 && edges&4) || (edges&2 && edges&8))return "nwse-resize";

  if((edges&1 && edges&8) || (edges&2 && edges&4))return "nesw-resize";

  return edges&3?"ew-resize":edges&12?"ns-resize":"default";

}

// floating-panel.tsx: anchored E/S/W/N arithmetic and minimum-size gates.

inline gfx::Rect resizedPanel(gfx::Rect start,gfx::Point delta,int edges,gfx::Rect viewport,gfx::Size minimum) {

  auto next=start;const int minWidth=std::min(minimum.w,viewport.w),minHeight=std::min(minimum.h,viewport.h);

  if(edges&2)next.w=std::max(minWidth,std::min(start.w+delta.x,viewport.x2()-start.x));

  if(edges&8)next.h=std::max(minHeight,std::min(start.h+delta.y,viewport.y2()-start.y));

  if(edges&1){next.w=std::max(minWidth,std::min(start.w-delta.x,start.x2()-viewport.x));next.x=start.x2()-next.w;}

  if(edges&4){next.h=std::max(minHeight,std::min(start.h-delta.y,start.y2()-viewport.y));next.y=start.y2()-next.h;}

  return next;

}

}
