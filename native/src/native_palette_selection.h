#pragma once
#include "native_widgets.h"
#include <tuple>

namespace moon {
struct PaletteSelectionEdge {gfx::Rect border,clip;std::vector<gfx::Rect> pieces;int side=0;};
// Extracted from Editor::layoutPalette: original legacy boundary edge merging,
// native shared selection material, concave miter and exact paint/hit ownership.
inline std::vector<PaletteSelectionEdge> paletteSelectionContour(const Skin& skin_,
    const std::vector<bool>& flags,int columns,gfx::Rect first,int step,int cell,bool compareEdges=false){
  std::vector<PaletteSelectionEdge> result;gfx::Rect bounds;
  auto selected=[&](int i){return i>=0&&i<int(flags.size())&&flags[i];};
  for(int i=0;i<int(flags.size());++i)if(selected(i)){
    const auto rect=gfx::Rect(first).offset((i%columns)*step*uiScale,(i/columns)*step*uiScale);
    bounds=bounds.isEmpty()?rect:(bounds|rect);
  }
  if(bounds.isEmpty())return result;
      struct Edge {int side,line,first,last;};std::vector<Edge> edges;
      for(int i=0;i<int(flags.size());++i)if(selected(i)){
        const int x=i%columns,y=i/columns;
        if(!selected(i-columns))edges.push_back({0,y,x,x+1});
        if(x==columns-1 || !selected(i+1))edges.push_back({1,x+1,y,y+1});
        if(!selected(i+columns))edges.push_back({2,y+1,x,x+1});
        if(x==0 || !selected(i-1))edges.push_back({3,x,y,y+1});
      }
      std::sort(edges.begin(),edges.end(),[](auto a,auto b){return std::tie(a.side,a.line,a.first)<std::tie(b.side,b.line,b.first);});
      std::vector<Edge> merged;for(auto e:edges){if(!merged.empty() && merged.back().side==e.side && merged.back().line==e.line && merged.back().last==e.first)merged.back().last=e.last;else merged.push_back(e);}
      const int pitch=step*uiScale;
      for(auto e:merged){
        const bool horizontal=e.side==0 || e.side==2;gfx::Rect b;
        if(horizontal)b={first.x+e.first*pitch,first.y+(e.line-(e.side==2?1:0))*pitch,(e.last-e.first)*pitch+uiScale,cell*uiScale};
        else b={first.x+(e.line-(e.side==1?1:0))*pitch,first.y+e.first*pitch,cell*uiScale,(e.last-e.first)*pitch+uiScale};
        auto clip=skin_.selectionMaterialBounds(b);
        if(e.side==0)clip.h=b.y+uiScale-clip.y;
        if(e.side==2){const int end=clip.y2();clip.y=b.y2()-uiScale;clip.h=end-clip.y;}
        if(e.side==3)clip.w=b.x+uiScale-clip.x;
        if(e.side==1){const int end=clip.x2();clip.x=b.x2()-uiScale;clip.w=end-clip.x;}
        // At a concave endpoint this is a straight strip, not the convex
        // corner of a rectangular nine-slice. Extend its source rectangle;
        // retain the contour's original clip for the miter below.
        const int extension=4*uiScale;
        const int row=horizontal?(e.side==0?e.line:e.line-1):0;
        const int col=!horizontal?(e.side==3?e.line:e.line-1):0;
        auto at=[&](int x,int y){return x>=0 && x<columns && y>=0 && selected(y*columns+x);};
        const bool startConcave=horizontal?at(e.first-1,row):at(col,e.first-1);
        const bool endConcave=horizontal?at(e.last,row):at(col,e.last);
        if(horizontal){if(startConcave){b.x-=extension;b.w+=extension;}if(endConcave)b.w+=extension;}
        else{if(startConcave){b.y-=extension;b.h+=extension;}if(endConcave)b.h+=extension;}
        result.push_back({b,clip,{},e.side});
      }
      // Assign overlapping strips to the closest boundary. This forms a
      // concave miter and prevents one strip's outer black row covering the
      // other strip's white row. The same pieces drive rendering and input.
      const auto material=skin_.selectionMaterialBounds(bounds);
      // Clip strips against the actual union, including shared grid seams.
      // An extended straight strip may cross the selected interior at an
      // inward corner; those pixels belong to the colors, never the outline.
      auto occupied=[&](int px,int py){
        const int dx=px-first.x,dy=py-first.y;if(dx<0 || dy<0)return false;
        const int x=dx/pitch,y=dy/pitch;
        for(int yy=std::max(0,y-1);yy<=y;++yy)for(int xx=std::max(0,x-1);xx<=x;++xx)
          if(xx<columns && selected(yy*columns+xx) && px>=first.x+xx*pitch && px<first.x+xx*pitch+cell*uiScale && py>=first.y+yy*pitch && py<first.y+yy*pitch+cell*uiScale)return true;
        return false;
      };
      auto interior=[&](int x,int y){for(int dy=-uiScale;dy<=uiScale;dy+=uiScale)for(int dx=-uiScale;dx<=uiScale;dx+=uiScale)if(!occupied(x+dx,y+dy))return false;return true;};
      // Preserve edge order for equal-distance ownership, but only inspect
      // strips intersecting this scanline. Material/hit testing remains exact.
      std::vector<int> rowEdges;rowEdges.reserve(result.size());
      // Borders and skin stay fixed during this raster pass. Resolve the
      // shared material helper once per edge, not for every candidate pixel.
      std::vector<gfx::Rect> edgeMaterials;edgeMaterials.reserve(result.size());
      for(const auto& edge:result)edgeMaterials.push_back(skin_.selectionMaterialBounds(edge.border));
      auto pickEdge=[&](int x,int y,const std::vector<int>* candidates){
        int winner=-1,best=100000;
        auto consider=[&](int i){const auto& edge=result[i];if(!edge.clip.contains(gfx::Point(x,y)))return;
          const auto& b=edge.border;const int distance=edge.side==0?b.y-y:edge.side==1?x-(b.x2()-uiScale):edge.side==2?y-(b.y2()-uiScale):b.x-x;
          if(distance>=0 && distance<best && skin_.selectionContains(candidates?edgeMaterials[i]:skin_.selectionMaterialBounds(b),{x,y})){best=distance;winner=i;}};
        if(candidates){for(int i:*candidates)consider(i);}else for(int i=0;i<int(result.size());++i)consider(i);
        return winner;
      };
      for(int y=material.y;y<material.y2();y+=uiScale){int run=-1,begin=material.x;
        rowEdges.clear();int left=material.x2(),right=material.x;
        for(int i=0;i<int(result.size());++i){const auto& clip=result[i].clip;if(y>=clip.y && y<clip.y2()){rowEdges.push_back(i);left=std::min(left,clip.x);right=std::max(right,clip.x2());}}
        // No edge can own samples outside these clips. Align to the original
        // material-origin grid so negative/offscreen coordinates stay exact.
        left=std::max(material.x,left);right=std::min(material.x2(),right);
        const int firstX=material.x+((left-material.x+uiScale-1)/uiScale)*uiScale;
        const int endX=material.x+((std::max(material.x,right)-material.x+uiScale-1)/uiScale)*uiScale;
        if(compareEdges){for(int x=material.x;x<material.x2();x+=uiScale)if((rowEdges.empty() || x<firstX || x>=endX) && pickEdge(x,y,nullptr)!=-1)throw std::runtime_error("Palette skipped scanline sample has an owner");}
        if(rowEdges.empty())continue;
        begin=firstX;
        auto flush=[&](int x){if(run>=0)result[run].pieces.push_back({begin,y,x-begin,uiScale});};
        for(int x=firstX;x<=endX;x+=uiScale){int winner=-1;
          if(x<endX && !interior(x,y)){
            winner=pickEdge(x,y,&rowEdges);
            if(compareEdges && winner!=pickEdge(x,y,nullptr))throw std::runtime_error("Palette scanline edge ownership mismatch");
          }
          if(winner!=run){flush(x);run=winner;begin=x;}
        }
      }
  return result;
}
inline bool paletteContourContains(const Skin& skin,const std::vector<PaletteSelectionEdge>& edges,gfx::Point point){
  for(const auto& edge:edges)if(std::any_of(edge.pieces.begin(),edge.pieces.end(),[&](auto r){return r.contains(point);})&&skin.selectionContains(skin.selectionMaterialBounds(edge.border),point))return true;
  return false;
}
inline void paintPaletteContour(const Skin& skin,const std::vector<PaletteSelectionEdge>& edges,
    ui::Graphics& g,gfx::Point origin,gfx::Rect viewport,bool hover){
  PhysicalViewportClip clip(g,viewport.offset(-origin));
  for(const auto& edge:edges){
    const auto border=gfx::Rect(edge.border).offset(-origin);
    const auto material=skin.selectionMaterialBounds(border);
    for(auto piece:edge.pieces){piece.offset(-origin);g.saveClip();g.clipRect(piece);
      {UiPaintScale scale(g,{material.x%uiScale,material.y%uiScale});skin.drawSelectionBorder(g,border,hover);}g.restoreClip();}
  }
}
}
