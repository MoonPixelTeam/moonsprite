#pragma once
#include <algorithm>
#include <optional>
#include <string>
#include <unordered_set>
#include <vector>
namespace moon {
// legacy/core/layer-panel-state.ts. Layer IDs here use legacy bottom-to-top order.
struct LayerPanelState {
 std::string activeLayerId;
 std::vector<std::string> selectedLayerIds,selectedGroupIds;
 std::optional<std::string> selectedGroupId,layerSelectionAnchorId;
 std::vector<std::string> collapsedGroupIds;
 bool operator==(const LayerPanelState& v)const{return activeLayerId==v.activeLayerId&&selectedLayerIds==v.selectedLayerIds&&selectedGroupIds==v.selectedGroupIds&&selectedGroupId==v.selectedGroupId&&layerSelectionAnchorId==v.layerSelectionAnchorId&&collapsedGroupIds==v.collapsedGroupIds;}
 bool operator!=(const LayerPanelState& v)const{return !(*this==v);}
};
inline LayerPanelState normalizeLayerPanelState(const std::vector<std::string>& layers,const std::vector<std::string>& groups,const std::string& active,LayerPanelState value){
 const std::unordered_set<std::string> validLayers(layers.begin(),layers.end()),validGroups(groups.begin(),groups.end());
 auto filter=[](auto& ids,const auto& valid){std::unordered_set<std::string> seen;ids.erase(std::remove_if(ids.begin(),ids.end(),[&](const auto& id){return !valid.count(id)||!seen.insert(id).second;}),ids.end());};
 filter(value.selectedLayerIds,validLayers);filter(value.selectedGroupIds,validGroups);filter(value.collapsedGroupIds,validGroups);
 if(!validLayers.count(value.activeLayerId))value.activeLayerId=!value.selectedLayerIds.empty()?value.selectedLayerIds.back():validLayers.count(active)?active:layers.empty()?std::string{}:layers.back();
 if(value.selectedGroupId&&(!validGroups.count(*value.selectedGroupId)||std::find(value.selectedGroupIds.begin(),value.selectedGroupIds.end(),*value.selectedGroupId)==value.selectedGroupIds.end()))value.selectedGroupId.reset();
 if(value.selectedLayerIds.empty()&&value.selectedGroupIds.empty()&&!value.activeLayerId.empty())value.selectedLayerIds.push_back(value.activeLayerId);
 if(!value.layerSelectionAnchorId||value.layerSelectionAnchorId->empty()||(!validLayers.count(*value.layerSelectionAnchorId)&&!validGroups.count(*value.layerSelectionAnchorId))){
  value.layerSelectionAnchorId.reset();if(!value.selectedGroupIds.empty())value.layerSelectionAnchorId=value.selectedGroupIds.back();else if(!value.selectedLayerIds.empty())value.layerSelectionAnchorId=value.selectedLayerIds.back();else if(!value.activeLayerId.empty())value.layerSelectionAnchorId=value.activeLayerId;
 }
 return value;
}
}
