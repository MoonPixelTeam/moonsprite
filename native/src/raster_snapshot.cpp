#include "raster_snapshot.h"
#include <algorithm>
#include <stdexcept>
#include <tuple>
#include <map>
namespace moon {
RasterSnapshot::RasterSnapshot(const timeline::State& source){
  state_.canvasWidth=source.canvasWidth;state_.canvasHeight=source.canvasHeight;state_.layers=source.layers;state_.frames=source.frames;state_.loopSections=source.loopSections;state_.groups=source.groups;
  for(const auto& original:source.masks){timeline::MaskSlot copy;copy.ownerId=original.ownerId;copy.frameId=original.frameId;copy.group=original.group;copy.mask.id=original.mask.id;copy.mask.linkedMaskId=original.mask.linkedMaskId;copy.mask.visible=original.mask.visible;copy.mask.locked=original.mask.locked;copy.mask.autoLinkAnimationCels=original.mask.autoLinkAnimationCels;copy.mask.moveWithOwner=original.mask.moveWithOwner;const auto& r=original.mask.surface;copy.mask.surface.width=r.width;copy.mask.surface.height=r.height;copy.mask.surface.offsetX=r.offsetX;copy.mask.surface.offsetY=r.offsetY;copy.mask.surface.storageOriginX=r.storageOriginX;copy.mask.surface.storageOriginY=r.storageOriginY;state_.masks.push_back(std::move(copy));}
  for(const auto& original:source.tilesets){tiles::Tileset header;header.id=original.id;header.name=original.name;header.tileWidth=original.tileWidth;header.tileHeight=original.tileHeight;header.columns=original.columns;header.rows=original.rows;header.tileIds=original.tileIds;header.tileSlots=original.tileSlots;state_.tilesets.push_back(std::move(header));}
  state_.cels.reserve(source.cels.size());
  sourcePixelCounts_.reserve(source.cels.size());
  std::map<const void*,std::size_t> owners;
  for(const auto& c:source.cels){
    const auto index=state_.cels.size();sourcePixelOwners_.push_back(c.surface?owners.emplace(c.surface->pixels.identity(),index).first->second:index);
    sourcePixelCounts_.push_back(c.surface?c.surface->pixels.size():0);
    timeline::Cel copy;copy.id=c.id;copy.layerId=c.layerId;copy.frameId=c.frameId;
    copy.linkedCelId=c.linkedCelId;copy.runtimeSharedCelId=c.runtimeSharedCelId;copy.opacity=c.opacity;copy.zIndex=c.zIndex;copy.text=c.text;copy.tilemap=c.tilemap;copy.freeTiles=c.freeTiles;
    if(c.surface){timeline::Surface s;s.width=c.surface->width;s.height=c.surface->height;s.offsetX=c.surface->offsetX;s.offsetY=c.surface->offsetY;s.storageOriginX=c.surface->storageOriginX;s.storageOriginY=c.surface->storageOriginY;copy.surface=std::move(s);}
    state_.cels.push_back(std::move(copy));
  }
}
bool RasterSnapshot::matches(const timeline::State& source)const{if(state_.canvasWidth!=source.canvasWidth||state_.canvasHeight!=source.canvasHeight)return false;
  if(source.tilesets.size()!=state_.tilesets.size())return false;for(std::size_t i=0;i<state_.tilesets.size();++i){const auto& a=state_.tilesets[i];const auto& b=source.tilesets[i];if(std::tie(a.id,a.name,a.tileWidth,a.tileHeight,a.columns,a.rows,a.tileIds,a.tileSlots)!=std::tie(b.id,b.name,b.tileWidth,b.tileHeight,b.columns,b.rows,b.tileIds,b.tileSlots)||b.pixels.size()!=std::size_t(b.columns)*b.rows*b.tileWidth*b.tileHeight)return false;}
  if(source.masks.size()!=state_.masks.size())return false;for(std::size_t i=0;i<source.masks.size();++i){const auto& a=source.masks[i];const auto& b=state_.masks[i];const auto& x=a.mask;const auto& y=b.mask;if(std::tie(a.ownerId,a.frameId,a.group,x.id,x.linkedMaskId,x.visible,x.locked,x.autoLinkAnimationCels,x.moveWithOwner,x.surface.width,x.surface.height,x.surface.offsetX,x.surface.offsetY)!=std::tie(b.ownerId,b.frameId,b.group,y.id,y.linkedMaskId,y.visible,y.locked,y.autoLinkAnimationCels,y.moveWithOwner,y.surface.width,y.surface.height,y.surface.offsetX,y.surface.offsetY))return false;}
  if(source.layers.size()!=state_.layers.size() || source.frames.size()!=state_.frames.size() || source.cels.size()!=state_.cels.size() || source.loopSections.size()!=state_.loopSections.size() || source.groups.size()!=state_.groups.size())return false;
  for(std::size_t i=0;i<state_.layers.size();++i){const auto& a=state_.layers[i];const auto& b=source.layers[i];
    if(timeline::styleSignature(a.layerStyles)!=timeline::styleSignature(b.layerStyles))return false;
    if(a.freeTiles!=b.freeTiles)return false;
    if(a.kind!=b.kind||a.tilemapTilesetId!=b.tilemapTilesetId||timeline::adjustmentSignature(a.adjustment)!=timeline::adjustmentSignature(b.adjustment))return false;
    if(std::tie(a.id,a.name,a.visible,a.locked,a.opacity,a.autoLinkAnimationCels,a.blendMode,a.displayColor,a.description,a.groupId,a.linkedContentId,a.clippingMask)!=std::tie(b.id,b.name,b.visible,b.locked,b.opacity,b.autoLinkAnimationCels,b.blendMode,b.displayColor,b.description,b.groupId,b.linkedContentId,b.clippingMask))return false;
  }
  for(std::size_t i=0;i<state_.groups.size();++i){const auto& a=state_.groups[i];const auto& b=source.groups[i];if(timeline::styleSignature(a.layerStyles)!=timeline::styleSignature(b.layerStyles))return false;if(std::tie(a.id,a.name,a.parentGroupId,a.visible,a.locked,a.opacity,a.blendMode,a.panelOrder,a.displayColor,a.description,a.clippingMask)!=std::tie(b.id,b.name,b.parentGroupId,b.visible,b.locked,b.opacity,b.blendMode,b.panelOrder,b.displayColor,b.description,b.clippingMask))return false;}
  for(std::size_t i=0;i<state_.frames.size();++i){const auto& a=state_.frames[i];const auto& b=source.frames[i];
    if(std::tie(a.id,a.duration,a.disabled)!=std::tie(b.id,b.duration,b.disabled))return false;
  }
  for(std::size_t i=0;i<state_.loopSections.size();++i){const auto& a=state_.loopSections[i];const auto& b=source.loopSections[i];
    if(std::tie(a.id,a.name,a.startFrameId,a.endFrameId,a.direction,a.repeatCount)!=std::tie(b.id,b.name,b.startFrameId,b.endFrameId,b.direction,b.repeatCount))return false;
  }
  for(std::size_t i=0;i<state_.cels.size();++i){const auto& a=state_.cels[i];const auto& b=source.cels[i];
    if(std::tie(a.id,a.layerId,a.frameId,a.linkedCelId,a.runtimeSharedCelId,a.opacity,a.zIndex)!=std::tie(b.id,b.layerId,b.frameId,b.linkedCelId,b.runtimeSharedCelId,b.opacity,b.zIndex) || bool(a.surface)!=bool(b.surface))return false;
    if(a.freeTiles!=b.freeTiles)return false;
    if(bool(a.tilemap)!=bool(b.tilemap))return false;if(a.tilemap){const auto& x=*a.tilemap;const auto& y=*b.tilemap;if(std::tie(x.tileWidth,x.tileHeight,x.columns,x.rows,x.cells)!=std::tie(y.tileWidth,y.tileHeight,y.columns,y.rows,y.cells))return false;}
    if(a.surface){const auto& x=*a.surface;const auto& y=*b.surface;
      if(std::tie(x.width,x.height,x.offsetX,x.offsetY,x.storageOriginX,x.storageOriginY)!=std::tie(y.width,y.height,y.offsetX,y.offsetY,y.storageOriginX,y.storageOriginY) || y.pixels.size()!=sourcePixelCounts_[i])return false;
    }
  }
  return true;
}
bool RasterSnapshot::advance(const timeline::State& source,std::chrono::steady_clock::time_point deadline,std::size_t maxPixels){
  if(!matches(source))throw std::logic_error("Snapshot source metadata changed");
  std::size_t copied=0;
  while(cel_<state_.cels.size()){
    auto& target=state_.cels[cel_];const auto& original=source.cels[cel_];
    if(target.id!=original.id || bool(target.surface)!=bool(original.surface))throw std::logic_error("Snapshot source changed");
    if(!target.surface){++cel_;continue;}
    if(sourcePixelOwners_[cel_]!=cel_){target.surface->pixels.share(state_.cels.at(sourcePixelOwners_[cel_]).surface->pixels);++cel_;continue;}
    if(copied>=maxPixels || std::chrono::steady_clock::now()>=deadline)return false;
    const auto& pixels=original.surface->pixels;auto& dest=target.surface->pixels;
    if(offset_>pixels.size())throw std::logic_error("Snapshot source changed");
    if(!offset_)dest.reserve(pixels.size()); // One surface allocation at a time.
    const auto count=std::min({chunkPixels,pixels.size()-offset_,maxPixels-copied});
    dest.insert(dest.end(),pixels.begin()+offset_,pixels.begin()+offset_+count);
    offset_+=count;copied+=count;copiedPixels_+=count;
    if(offset_==pixels.size()){offset_=0;++cel_;}
  }
  while(mask_<state_.masks.size()){if(copied>=maxPixels||std::chrono::steady_clock::now()>=deadline)return false;const auto& src=source.masks[mask_].mask.surface.pixels;auto& dest=state_.masks[mask_].mask.surface.pixels;if(!offset_)dest.reserve(src.size());const auto n=std::min({chunkPixels,src.size()-offset_,maxPixels-copied});dest.insert(dest.end(),src.begin()+offset_,src.begin()+offset_+n);offset_+=n;copied+=n;copiedPixels_+=n;if(offset_==src.size()){offset_=0;++mask_;}}
  while(tileset_<state_.tilesets.size()){if(copied>=maxPixels||std::chrono::steady_clock::now()>=deadline)return false;const auto& src=source.tilesets[tileset_].pixels;auto& dest=state_.tilesets[tileset_].pixels;if(!offset_)dest.reserve(src.size());const auto n=std::min({chunkPixels,src.size()-offset_,maxPixels-copied});dest.insert(dest.end(),src.begin()+offset_,src.begin()+offset_+n);offset_+=n;copied+=n;copiedPixels_+=n;if(offset_==src.size()){offset_=0;++tileset_;}}
  return true;
}
timeline::State RasterSnapshot::take(){if(cel_!=state_.cels.size()||mask_!=state_.masks.size()||tileset_!=state_.tilesets.size())throw std::logic_error("Snapshot is incomplete");return std::move(state_);}
}
