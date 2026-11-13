#include "document.h"
#include "document_history_target_validation.h"
#include <algorithm>
#include <stdexcept>

namespace moon {
void Document::captureLayerOrder(Edit& e,bool after) const {if(!after&&!e.beforeAnimationSelection)e.beforeAnimationSelection=captureAnimationSelection();if(after)e.maskHistory.afterMasks=timeline_.state().masks;else e.maskHistory.beforeMasks=timeline_.state().masks;
 auto& order=after?e.layerHistory.afterOrder:e.layerHistory.beforeOrder;for(const auto& l:timeline_.state().layers)order.push_back(l.id);(after?e.afterActive:e.beforeActive)=activeLayerId_;
}

void Document::applyLayerEdit(const Edit& e,bool redo) {
 history_targets::validateLayerReplay(timeline_,e,redo);
 const auto& order=redo?e.layerHistory.afterOrder:e.layerHistory.beforeOrder;
 if(!order.empty()) {
  auto& layers=timeline_.state_.layers;auto& cels=timeline_.state_.cels;
  if(e.layerHistory.detachedLayer){const auto& id=e.layerHistory.detachedLayer->id;const bool want=std::find(order.begin(),order.end(),id)!=order.end();const auto it=std::find_if(layers.begin(),layers.end(),[&](const auto& l){return l.id==id;});
   if(want && it==layers.end()){layers.push_back(*e.layerHistory.detachedLayer);cels.insert(cels.end(),e.contentHistory.detachedCels.begin(),e.contentHistory.detachedCels.end());}else if(!want && it!=layers.end()){layers.erase(it);cels.erase(std::remove_if(cels.begin(),cels.end(),[&](const auto& c){return c.layerId==id;}),cels.end());}}
  std::sort(layers.begin(),layers.end(),[&](const auto& a,const auto& b){return std::find(order.begin(),order.end(),a.id)<std::find(order.begin(),order.end(),b.id);});timeline_.buildIndex();activeLayerId_=redo?e.afterActive:e.beforeActive;change_={0,0,width_,height_};
 }
 if(!e.layerHistory.targetLayerId.empty()) {
  auto& layers=timeline_.state_.layers;auto it=std::find_if(layers.begin(),layers.end(),[&](const auto& l){return l.id==e.layerHistory.targetLayerId;});if(it==layers.end())throw std::logic_error("Missing history layer");
  const auto visible=redo?e.layerHistory.afterVisible:e.layerHistory.beforeVisible;const auto opacity=redo?e.layerHistory.afterOpacity:e.layerHistory.beforeOpacity;const auto locked=redo?e.layerHistory.afterLocked:e.layerHistory.beforeLocked;
  const auto autoLink=redo?e.layerHistory.afterAutoLink:e.layerHistory.beforeAutoLink;if(autoLink)it->autoLinkAnimationCels=*autoLink;
  const auto& name=redo?e.layerHistory.afterName:e.layerHistory.beforeName;if(name)it->name=*name;
  const auto& metadata=redo?e.layerHistory.afterLayerMetadata:e.layerHistory.beforeLayerMetadata;if(metadata){it->displayColor=metadata->displayColor;it->description=metadata->description;}
  const auto& blend=redo?e.layerHistory.afterBlendMode:e.layerHistory.beforeBlendMode;if(blend){it->blendMode=*blend;change_={0,0,width_,height_};}
  if(visible)it->visible=*visible;if(opacity){it->opacity=*opacity;syncActiveLayerCelOpacity(it->id);}if(locked)it->locked=*locked;if(visible || opacity || locked || autoLink)change_={0,0,width_,height_};
 }
}

std::size_t Document::LayerHistory::tilesetBytes()const{return (layerTilesets?layerTilesets->bytes():0);}
std::size_t Document::LayerHistory::nameBytes()const{return (beforeName?beforeName->size()*sizeof(char32_t):0)+(afterName?afterName->size()*sizeof(char32_t):0);}
std::size_t Document::LayerHistory::propertyBytes()const{return ((beforeVisible||beforeOpacity||beforeBlendMode)?32:0);}
std::size_t Document::LayerHistory::orderBytes()const{return (beforeOrder.size()+afterOrder.size())*64;}
std::size_t Document::LayerHistory::projectionBytes()const{return (beforeLayerOpacityProjection.size()+afterLayerOpacityProjection.size())*80;}
std::size_t Document::LayerHistory::snapshotBytes()const{std::size_t size=0;
 for(const auto* snapshot:{&beforeLayerStructure,&afterLayerStructure})if(*snapshot){
  if((*snapshot)->frames)for(const auto& f:*(*snapshot)->frames)size+=sizeof(f)+f.id.size();
  for(const auto& value:(*snapshot)->celOpacities)size+=sizeof(value)+value.first.size();
  for(const auto& mask:(*snapshot)->masks)size+=sizeof(mask)+mask.mask.surface.pixels.size()*sizeof(Pixel);
  for(const auto& l:(*snapshot)->layers)size+=sizeof(l)+l.id.size()+l.name.size()*sizeof(char32_t)+l.blendMode.size()+l.description.size()*sizeof(char32_t)+(l.groupId?l.groupId->size():0)+(l.adjustment?l.adjustment->gradientMap.stops.size()*sizeof(GradientStop):0)+(l.layerStyles?l.layerStyles->preservedJson.size()+l.layerStyles->gradientMap.stops.size()*sizeof(GradientStop):0);
  for(const auto& g:(*snapshot)->groups)size+=sizeof(g)+g.id.size()+g.name.size()*sizeof(char32_t)+g.blendMode.size()+g.description.size()*sizeof(char32_t)+(g.parentGroupId?g.parentGroupId->size():0)+(g.layerStyles?g.layerStyles->preservedJson.size()+g.layerStyles->gradientMap.stops.size()*sizeof(GradientStop):0);
 }
 for(const auto* snapshot:{&beforeGroupUi,&afterGroupUi})if(*snapshot){for(const auto& id:(*snapshot)->selected)size+=id.size()+sizeof(std::string);for(const auto& id:(*snapshot)->collapsed)size+=id.size()+sizeof(std::string);if((*snapshot)->focus)size+=(*snapshot)->focus->size();}
return size;}
}
