#include "timeline_model.h"
#include <algorithm>
#include <map>
#include <set>
#include <limits>
#include <stdexcept>
namespace moon::timeline {
bool Timeline::hasLinkedLayers()const{return std::any_of(state_.layers.begin(),state_.layers.end(),[](const auto& l){return !l.linkedContentId.empty();});}
void Timeline::synchronizeLinkedLayers(const std::string& preferredOwner){
 if(!hasLinkedLayers()){linkedDirtyOwner_.clear();return;}
 const auto preferred=preferredOwner.empty()?linkedDirtyOwner_:preferredOwner;
 std::map<std::string,std::vector<std::string>> groups;for(const auto& layer:state_.layers){if(layer.linkedContentId.empty())continue;if(!layer.kind.empty()||layer.background)throw std::invalid_argument("Special/background layers cannot share linked raster content");groups[layer.linkedContentId].push_back(layer.id);}
 for(const auto& group:groups){if(group.second.size()<2)continue;std::map<std::string,std::string> parent;std::map<std::string,std::size_t> nodes;auto find=[&](std::string id){while(parent.at(id)!=id)id=parent.at(id);return id;};
  for(const auto& frame:state_.frames){std::string first;for(const auto& layer:group.second){const auto* slot=findCel(layer,frame.id);if(!slot)continue;const auto resolved=resolveSurface(slot->id);if(resolved.issue!=LinkIssue::None||!resolved.source||!resolved.surface)continue;const auto& id=resolved.source->id;parent.emplace(id,id);nodes.emplace(id,cels_.at(id));if(first.empty())first=id;else{const auto a=find(first),b=find(id);if(a!=b)parent[b]=a;}}}
  std::map<std::string,std::vector<std::size_t>> components;for(const auto& node:nodes)components[find(node.first)].push_back(node.second);
  for(const auto& component:components){auto sourceIndex=component.second.front();for(auto index:component.second)if(state_.cels[index].surface->pixels.revision()>state_.cels[sourceIndex].surface->pixels.revision())sourceIndex=index;for(auto index:component.second)if(state_.cels[index].id==preferred){sourceIndex=index;break;}const auto& source=*state_.cels[sourceIndex].surface;
   struct Install{std::size_t index;int x,y;};std::vector<Install> plan;for(auto index:component.second){const auto& target=*state_.cels[index].surface;const auto x=std::int64_t(target.offsetX)-target.storageOriginX.value_or(0)+source.storageOriginX.value_or(0),y=std::int64_t(target.offsetY)-target.storageOriginY.value_or(0)+source.storageOriginY.value_or(0);if(x<std::numeric_limits<int>::min()||x>std::numeric_limits<int>::max()||y<std::numeric_limits<int>::min()||y>std::numeric_limits<int>::max())throw std::overflow_error("Linked raster anchor exceeds coordinates");plan.push_back({index,int(x),int(y)});}
   for(const auto& install:plan){auto& target=*state_.cels[install.index].surface;target.width=source.width;target.height=source.height;target.offsetX=install.x;target.offsetY=install.y;target.storageOriginX=source.storageOriginX;target.storageOriginY=source.storageOriginY;target.pixels.share(source.pixels);selectionContent_.erase(state_.cels[install.index].id);visibleContent_.erase(state_.cels[install.index].id);}
  }
 }
 linkedDirtyOwner_.clear();
}
}

namespace moon::timeline {
std::string Timeline::linkedStorageKey(const std::string& celId)const{const auto resolved=resolveSurface(celId);if(!resolved.source||!resolved.surface)return celId;auto key=resolved.source->id;for(const auto& c:state_.cels)if(c.surface&&c.surface->pixels.identity()==resolved.surface->pixels.identity())key=std::min(key,c.id);return key;}
}
