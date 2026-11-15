#pragma once
#include "timeline_model.h"
#include <algorithm>
#include <limits>
#include <map>
#include <stdexcept>

namespace moon {
// animation.ts synchronizeLinkedLayerGroupContentsForTimeline chooses the
// active source, then the first source in frame/member order. General native
// pixel-edit synchronization instead chooses the most recently written buffer;
// prepare resize snapshots with the command's explicit source rule first.
inline void synchronizeImageResizeLinkedCels(const timeline::Timeline& timeline,std::vector<timeline::Cel>& cels,const std::string& activeLayer,const std::string& activeFrame){
 if(!timeline.hasLinkedLayers())return;
 std::map<std::string,std::vector<std::string>> groups;
 for(const auto& layer:timeline.state().layers)if(!layer.linkedContentId.empty())groups[layer.linkedContentId].push_back(layer.id);
 std::map<std::string,std::size_t> indices;for(std::size_t i=0;i<cels.size();++i)indices.emplace(cels[i].id,i);
 const auto* activeSlot=timeline.findCel(activeLayer,activeFrame);const auto active=activeSlot?timeline.resolveSurface(activeSlot->id):timeline::Resolution{};
 struct Install{std::size_t target,source;int x,y;};std::vector<Install> installs;
 for(const auto& group:groups){if(group.second.size()<2)continue;
  std::map<std::string,std::string> parents;std::vector<std::string> nodes;
  auto find=[&](std::string id){while(parents.at(id)!=id)id=parents.at(id);return id;};
  for(const auto& frame:timeline.state().frames){std::string first;
   for(const auto& layer:group.second){const auto* slot=timeline.findCel(layer,frame.id);if(!slot)continue;const auto resolved=timeline.resolveSurface(slot->id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.source||!resolved.surface)continue;
    const auto& id=resolved.source->id;if(parents.emplace(id,id).second)nodes.push_back(id);if(first.empty())first=id;else{const auto a=find(first),b=find(id);if(a!=b)parents[b]=a;}
   }
  }
  std::map<std::string,std::vector<std::string>> components;for(const auto& id:nodes)components[find(id)].push_back(id);
  for(const auto& component:components){auto sourceId=component.second.front();if(active.source&&std::find(component.second.begin(),component.second.end(),active.source->id)!=component.second.end())sourceId=active.source->id;
   const auto sourceIndex=indices.at(sourceId);const auto& source=*cels[sourceIndex].surface;
   for(const auto& id:component.second){const auto index=indices.at(id);const auto& target=*cels[index].surface;if(target.format!=source.format)continue;
    const auto x=std::int64_t(target.offsetX)-target.storageOriginX.value_or(0)+source.storageOriginX.value_or(0),y=std::int64_t(target.offsetY)-target.storageOriginY.value_or(0)+source.storageOriginY.value_or(0);
    if(x<std::numeric_limits<int>::min()||x>std::numeric_limits<int>::max()||y<std::numeric_limits<int>::min()||y>std::numeric_limits<int>::max())throw std::overflow_error("Resized linked raster anchor exceeds coordinates");installs.push_back({index,sourceIndex,int(x),int(y)});
   }
  }
 }
 // All allocation and coordinate validation precede snapshot mutation.
 for(const auto& install:installs){const auto& source=*cels[install.source].surface;auto& target=*cels[install.target].surface;target.format=source.format;target.width=source.width;target.height=source.height;target.offsetX=install.x;target.offsetY=install.y;target.storageOriginX=source.storageOriginX;target.storageOriginY=source.storageOriginY;target.pixels.share(source.pixels);}
}
}
