#include "document.h"
#include "raster_geometry.h"
#include <algorithm>
#include <stdexcept>
namespace moon {
void Document::capturePixelAddresses(Edit& e){
 if((!e.pixels.empty()||!e.contentHistory.runs.empty()||e.contentHistory.dense)&&!e.contentHistory.pixelAddress){
  const auto* c=timeline_.findCelById(e.contentHistory.targetCelId);if(!c)throw std::logic_error("Missing pixel history target");const auto r=timeline_.resolveSurface(c->id);if(r.issue!=timeline::LinkIssue::None||!r.surface)throw std::logic_error("Invalid pixel history owner");const auto& s=*r.surface;
  e.contentHistory.pixelAddress=PixelAddressSpace{s.width,s.height,s.storageOriginX.value_or(0),s.storageOriginY.value_or(0)};
 }
 for(auto& child:e.children)capturePixelAddresses(child);
}
// applyPixelEdit: definition in its history domain unit.
}
