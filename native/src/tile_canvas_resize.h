#pragma once
#include "canvas_resize.h"
#include <map>
namespace moon {
// Legacy tilemap::resizeTilemapCelDataToCanvas uses floor/ceil, including
// negative origins. Keep planning separate so admission precedes allocation.
struct TileCanvasPlan {int column=0,row=0,columns=1,rows=1,x=0,y=0,width=1,height=1;};
inline TileCanvasPlan planTileCanvas(const tiles::CelData& grid,int x,int y,int width,int height,bool trim){
 tiles::sizeCheck(grid.tileWidth,grid.tileHeight,grid.columns,grid.rows);
 if(grid.cells.size()!=std::size_t(grid.columns)*grid.rows)throw std::invalid_argument("Invalid canvas tile grid");
 auto floor=[](std::int64_t n,int d){return n>=0?n/d:-((-n+d-1)/d);};
 auto ceil=[&](std::int64_t n,int d){return -floor(-n,d);};
 const auto l=floor(-std::int64_t(x),grid.tileWidth),t=floor(-std::int64_t(y),grid.tileHeight);
 const auto r=ceil(std::int64_t(width)-x,grid.tileWidth),b=ceil(std::int64_t(height)-y,grid.tileHeight);
 TileCanvasPlan p;p.column=raster::coordinate(trim?l:std::min<std::int64_t>(0,l));p.row=raster::coordinate(trim?t:std::min<std::int64_t>(0,t));
 p.columns=raster::coordinate(std::max<std::int64_t>(1,(trim?r:std::max<std::int64_t>(grid.columns,r))-p.column));p.rows=raster::coordinate(std::max<std::int64_t>(1,(trim?b:std::max<std::int64_t>(grid.rows,b))-p.row));
 tiles::sizeCheck(grid.tileWidth,grid.tileHeight,p.columns,p.rows);
 p.x=raster::coordinate(std::int64_t(x)+std::int64_t(p.column)*grid.tileWidth);p.y=raster::coordinate(std::int64_t(y)+std::int64_t(p.row)*grid.tileHeight);
 p.width=raster::coordinate(std::int64_t(p.columns)*grid.tileWidth);p.height=raster::coordinate(std::int64_t(p.rows)*grid.tileHeight);raster::coordinate(std::int64_t(p.x)+p.width);raster::coordinate(std::int64_t(p.y)+p.height);return p;
}
inline tiles::CelData canvasResizedGrid(const tiles::CelData& source,const TileCanvasPlan& p){
 tiles::CelData out{source.tileWidth,source.tileHeight,p.columns,p.rows,std::vector<std::optional<tiles::Cell>>(std::size_t(p.columns)*p.rows)};
 for(int y=0;y<source.rows;++y){const auto row=std::int64_t(y)-p.row;if(row<0||row>=p.rows)continue;for(int x=0;x<source.columns;++x){const auto col=std::int64_t(x)-p.column;if(col>=0&&col<p.columns)out.cells[std::size_t(row)*p.columns+std::size_t(col)]=source.cells[std::size_t(y)*source.columns+x];}}return out;
}
struct FreeCanvasPlan {int x=0,y=0,width=1,height=1,localX=0,localY=0;};
inline FreeCanvasPlan planFreeCanvas(const timeline::Surface& s,int width,int height,int dx,int dy,bool expanding,bool trim){
 raster::validate(s);const auto x=std::int64_t(s.offsetX)+dx,y=std::int64_t(s.offsetY)+dy;auto l=x,t=y,r=x+s.width,b=y+s.height;
 if(expanding){l=std::min<std::int64_t>(l,0);t=std::min<std::int64_t>(t,0);r=std::max<std::int64_t>(r,width);b=std::max<std::int64_t>(b,height);}
 if(trim){l=std::max<std::int64_t>(0,l);t=std::max<std::int64_t>(0,t);r=std::min<std::int64_t>(width,r);b=std::min<std::int64_t>(height,b);if(r<=l||b<=t){l=t=0;r=width;b=height;}}
 FreeCanvasPlan p{raster::coordinate(l),raster::coordinate(t),raster::coordinate(std::max<std::int64_t>(1,r-l)),raster::coordinate(std::max<std::int64_t>(1,b-t)),raster::coordinate(x-l),raster::coordinate(y-t)};
 if(std::uint64_t(p.width)*p.height>free_tiles::MaxSurfacePixels)throw std::length_error("Free tile canvas is too large");raster::coordinate(r);raster::coordinate(b);return p;
}
// The old trim predicate deliberately uses the unrotated source dimensions,
// without source offsets, visibility or rotation. Preserve that exact rule.
inline free_tiles::CelData canvasResizedInstances(const free_tiles::LayerData& layer,const free_tiles::CelData& source,const std::vector<tiles::Tileset>& sets,const FreeCanvasPlan& p,int width,int height,bool trim){
 std::map<std::string,const tiles::Tileset*> catalog,refs;for(const auto& s:sets)catalog.emplace(s.id,&s);
 for(const auto& s:layer.sources){const auto set=catalog.find(s.tilesetId);if(set==catalog.end())throw std::invalid_argument("Missing canvas free tile resource");refs.emplace(s.id,set->second);refs.emplace(s.tilesetId,set->second);}
 free_tiles::CelData out;out.preservedJson=source.preservedJson;out.instances.reserve(source.instances.size());
 for(auto i:source.instances){i.x=raster::coordinate(std::int64_t(i.x)+p.localX);i.y=raster::coordinate(std::int64_t(i.y)+p.localY);if(!free_tiles::coordinate(i.x)||!free_tiles::coordinate(i.y))throw std::length_error("Free tile canvas instance exceeds native coordinates");
  const tiles::Tileset* set=nullptr;if(layer.sources.empty()){const auto found=catalog.find(layer.legacyTilesetId);if(found!=catalog.end())set=found->second;}else{const auto found=refs.find(i.sourceId.empty()?i.tileId:i.sourceId);if(found!=refs.end())set=found->second;}
  if(trim&&(!set||std::int64_t(p.x)+i.x>=width||std::int64_t(p.y)+i.y>=height||std::int64_t(p.x)+i.x+set->tileWidth<=0||std::int64_t(p.y)+i.y+set->tileHeight<=0))continue;
  out.instances.push_back(std::move(i));
 }return out;
}
}
