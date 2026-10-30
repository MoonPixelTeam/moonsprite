#pragma once
#include "document.h"
#include <algorithm>
#include <stdexcept>

namespace moon {
// Legacy workspace-selection-timeline-flip: explicit Cel picks, otherwise
// selected layer/group rows crossed with selected frames (all frames by default).
inline std::vector<std::string> timelineContentFlipTargets(const Document& doc) {
 if(doc.active()||doc.selection()||!doc.activeMaskId().empty()||!doc.timelineSelection().maskRows.empty()||(doc.layer().kind=="free-tile"&&!doc.selectedFreeTileInstances().empty()))return {};
 const auto layers=doc.selectedLayerIdsWithGroups();const auto& frames=doc.selectedFrames();const auto& selected=doc.timelineSelection();
 if(layers.empty()&&selected.cels.empty()&&frames.empty())return {};
 const auto& timeline=doc.timeline();std::vector<std::string> pairs=selected.cels;
 if(pairs.empty())for(const auto& l:timeline.state().layers){if(!layers.empty()&&std::find(layers.begin(),layers.end(),l.id)==layers.end())continue;for(const auto& f:timeline.state().frames)if(frames.empty()||std::find(frames.begin(),frames.end(),f.id)!=frames.end())if(const auto* c=timeline.findCel(l.id,f.id))pairs.push_back(c->id);}
 std::vector<std::string> result,seen;
 for(const auto& id:pairs){const auto* slot=timeline.findCelById(id);if(!slot)continue;const auto l=std::find_if(timeline.state().layers.begin(),timeline.state().layers.end(),[&](const auto& item){return item.id==slot->layerId;});if(l==timeline.state().layers.end()||l->kind=="text"||!doc.layerEffectivelyVisible(*l)||doc.layerEffectivelyLocked(*l))continue;
  const auto r=timeline.resolveSurface(id);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface)continue;
  if((l->kind=="free-tile"&&(!l->freeTiles||!r.source->freeTiles))||(l->kind=="tilemap"&&!r.source->tilemap))continue;
  const auto key=l->kind.empty()?"raster:"+timeline.linkedStorageKey(id):l->kind+":"+r.source->id;if(std::find(seen.begin(),seen.end(),key)!=seen.end())continue;seen.push_back(key);result.push_back(r.source->id);
 }
 return result;
}
// Exact legacy mirroredTilemapCell candidate order/object-spread semantics.
inline std::optional<tiles::Cell> mirroredTimelineTilemapCell(const std::optional<tiles::Cell>& cell,bool horizontal,int width,int height){
 if(!cell)return cell;
 for(bool fh:{false,true})for(bool fv:{false,true})for(int rotation=0;rotation<(width==height?4:1);++rotation){auto candidate=*cell;if(fh)candidate.flipHorizontal=true;if(fv)candidate.flipVertical=true;if(rotation)candidate.rotation=rotation;bool same=true;for(int y=0;same&&y<height;++y)for(int x=0;x<width;++x){const auto expected=tiles::sourcePoint(horizontal?width-1-x:x,horizontal?y:height-1-y,width,height,*cell),actual=tiles::sourcePoint(x,y,width,height,candidate);if(expected!=actual){same=false;break;}}if(same)return candidate;}return cell;
}
// Legacy useCanvasTileTarget::selectedFreeTileSelectionTarget. The marquee is
// in document coordinates; only the magic-wand seed is clipped to this box.
inline std::optional<PixelRegion> freeTileSelectionTargetBounds(const Document& doc) {
 if(doc.layer().kind!="free-tile"||doc.freeTilePaintMode()||!doc.activeMaskId().empty()||doc.hasSelectedGroups()||!doc.layer().freeTiles||!doc.cel().freeTiles||!doc.layerEffectivelyVisible(doc.layer())||doc.layerEffectivelyLocked(doc.layer()))return {};
 const auto primary=doc.primaryFreeTileInstance();const auto& instances=doc.cel().freeTiles->instances;
 const auto instance=std::find_if(instances.begin(),instances.end(),[&](const auto& i){return i.id==primary;});
 if(instance==instances.end()||!instance->visible||instance->locked)return {};
 const auto& id=instance->sourceId.empty()?instance->tileId:instance->sourceId;const auto& sources=doc.layer().freeTiles->sources;
 const auto source=std::find_if(sources.begin(),sources.end(),[&](const auto& s){return s.id==id||s.tilesetId==id;});
 if(source==sources.end()||!source->visible||source->locked)return {};
 return doc.freeTileInstanceBounds(primary);
}
struct FreeTileSelectionRaster {
 int width=0,height=0,x=0,y=0;PixelRegion bounds;std::vector<Pixel> pixels;
 std::optional<SelectionMask> select(Point point,WandOptions options,int documentWidth,int documentHeight)const {
  if(point.x<bounds.x||point.y<bounds.y||point.x>=bounds.x+bounds.w||point.y>=bounds.y+bounds.h)return {};
  auto selected=magicWandSelection(pixels,width,height,point.x-x,point.y-y,options);
  if(!selected)return {};selected->x+=x;selected->y+=y;
  return combineSelection(selected,SelectionMask{0,0,documentWidth,documentHeight,{}},3);
 }
};
// Legacy prepareMagicWandOperation samples the primary source alone, without
// instance opacity, other instances or layer effects, in a padded edit raster.
inline std::optional<FreeTileSelectionRaster> freeTileSelectionRaster(const Document& doc) {
 const auto bounds=freeTileSelectionTargetBounds(doc);if(!bounds)return {};
 const auto& instances=doc.cel().freeTiles->instances;const auto& instance=*std::find_if(instances.begin(),instances.end(),[&](const auto& i){return i.id==doc.primaryFreeTileInstance();});
 const auto& id=instance.sourceId.empty()?instance.tileId:instance.sourceId;const auto& sources=doc.layer().freeTiles->sources;
 const auto& source=*std::find_if(sources.begin(),sources.end(),[&](const auto& s){return s.id==id||s.tilesetId==id;});
 const auto& sets=doc.timeline().state().tilesets;const auto resource=std::find_if(sets.begin(),sets.end(),[&](const auto& t){return t.id==source.tilesetId;});if(resource==sets.end())return {};
 const int padding=std::max(16,std::min(128,std::max(doc.width(),doc.height())));
 FreeTileSelectionRaster out;out.bounds=*bounds;out.x=std::min(0,bounds->x)-padding;out.y=std::min(0,bounds->y)-padding;
 const auto width=std::int64_t(std::max(doc.width(),bounds->x+bounds->w))+padding-out.x,height=std::int64_t(std::max(doc.height(),bounds->y+bounds->h))+padding-out.y;
 if(width<=0||height<=0||width>16*1024*1024||height>16*1024*1024||width*height>16*1024*1024)throw std::length_error("Free tile selection raster exceeds native 16M pixel limit");
 out.width=int(width);out.height=int(height);out.pixels.resize(std::size_t(width*height));const auto pixels=tiles::readTile(*resource,0);
 for(int y=0;y<resource->tileHeight;++y)for(int x=0;x<resource->tileWidth;++x){const auto q=free_tiles::transform(instance,source.offsetX+x,source.offsetY+y);const int px=doc.cel().surface->offsetX+instance.x+q.first-out.x,py=doc.cel().surface->offsetY+instance.y+q.second-out.y;out.pixels[std::size_t(py)*out.width+px]=pixels[std::size_t(y)*resource->tileWidth+x];}
 return out;
}

}
