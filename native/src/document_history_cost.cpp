#include "document.h"
#include "sheet_import_storage.h"
#include "local_history_edit.h"
#include <algorithm>

namespace moon {
std::size_t Document::Edit::animationSelectionBytes()const{
 if(!beforeAnimationSelection||!afterAnimationSelection)return 0;
 std::size_t slots=beforeAnimationSelection->selection.cels.size()+afterAnimationSelection->selection.cels.size();
 for(const auto* value:{&*beforeAnimationSelection,&*afterAnimationSelection})if(value->sessionSelection)slots+=value->sessionSelection->groups.size()+value->sessionSelection->masks.size();
 return 64+slots*16;
}
std::size_t Document::Edit::bytes() const {
 const auto selectionBytes=animationSelectionBytes();
 if(const auto* pixels=localPixels())return pixels->retainedBytes+selectionBytes;
 if(const auto bytes=tileHistory.exclusiveBytes(sourceProperties()))return *bytes+selectionBytes;
 if(const auto* local=localSnapshot())return local->rollbackBytes+selectionBytes;
 if(const auto bytes=snapshotHistory.exclusiveBytes())return *bytes+selectionBytes;
 if(const auto bytes=contentHistory.exclusiveBytes())return *bytes+selectionBytes;if(layerHistory.layerMetadataBytes)return *layerHistory.layerMetadataBytes+selectionBytes;
  if(const auto bytes=paletteHistory.exclusiveBytes())return *bytes+selectionBytes;
  const auto textBytes=contentHistory.textBytes();
    const auto durationBytes=frameHistory.durationBytes();
    std::size_t metadataBytes=sliceHistory.bytes();metadataBytes+=paletteHistory.metadataBytes();
    std::size_t size=durationBytes+metadataBytes+layerHistory.tilesetBytes()+tileHistory.pixelBytes(tilemapPixels())+textBytes+contentHistory.restoredClipboardBytes+contentHistory.addressBytes()+layerHistory.nameBytes()+contentHistory.pixelBytes(pixels.size())+layerHistory.propertyBytes();
  size+=maskHistory.resourceBytes(maskRaster());
  size+=snapshotHistory.timelineBytes();
  size+=contentHistory.denseBytes();
  size+=paletteHistory.snapshotBytes();
  size+=layerHistory.orderBytes();
  size+=contentHistory.celBytes();
  size+=pixelSelectionHistory.bytes();
  for(const auto* selection:{&beforeTimelineSelection,&afterTimelineSelection})if(*selection){for(const auto& id:(*selection)->layers)size+=id.size()+32;for(const auto& id:(*selection)->cels)size+=id.size()+32;}
  size+=contentHistory.offsetBytes();
  size+=maskHistory.contextBytes();
  size+=contentHistory.surfaceBytes();
  for(const auto& child:children)size+=child.bytes();
  size+=frameHistory.loopBytes();
  size+=frameHistory.frameBytes();
  size+=snapshotHistory.geometryBytes();
  size+=layerHistory.projectionBytes();
 size+=layerHistory.snapshotBytes();
size+=tileHistory.slotBytes();size+=layerHistory.structureCelBytes;return size+selectionBytes;
}
}
