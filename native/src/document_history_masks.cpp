#include "document.h"
#include <algorithm>
#include <type_traits>

namespace moon {
void Document::applyMaskHistoryResources(HistoryResourceReplay& prepared){
 if(prepared.masks){
  if(!prepared.initialized){
   const auto& target=prepared.explicitMask?prepared.activeMask:activeMaskId_;
   const bool retained=std::any_of(prepared.masks->begin(),prepared.masks->end(),[&](const auto& mask){return mask.mask.id==target;});
   prepared.maskSwapped=prepared.explicitMask||!retained;
   if(!retained){prepared.activeMask.clear();prepared.isolated=false;}
   prepared.layerSwapped=prepared.focus&&timeline_.hasLayer(prepared.activeLayer);
   prepared.frameSwapped=prepared.focus&&timeline_.hasFrame(prepared.activeFrame);
  }
  timeline_.state_.masks.swap(*prepared.masks);
  if(prepared.maskSwapped){activeMaskId_.swap(prepared.activeMask);std::swap(maskIsolated_,prepared.isolated);}
  if(prepared.layerSwapped)activeLayerId_.swap(prepared.activeLayer);
  if(prepared.frameSwapped)activeFrameId_.swap(prepared.activeFrame);
 }
 static_assert(std::is_nothrow_swappable_v<MaskSelectionHistory>);
 if(prepared.maskSelection){if(!prepared.initialized)prepared.maskSelection->serial=maskSelectionHistory_.serial+1;std::swap(maskSelectionHistory_,*prepared.maskSelection);}
 prepared.initialized=true;
}
void Document::applyMaskHistoryContext(const MaskHistory& mask,bool forward){
if(mask.maskContext){activeMaskId_=forward?mask.maskContext->after:mask.maskContext->before;maskIsolated_=forward?mask.maskContext->afterIsolated:mask.maskContext->beforeIsolated;}
}
std::size_t Document::MaskHistory::resourceBytes(const MaskRasterHistory* maskRaster)const{
 std::size_t size=0;
  for(const auto* selection:{&beforeMaskSelection,&afterMaskSelection})if(*selection)for(const auto& key:**selection)size+=sizeof(key)+key.first.size()+key.second.size();
  for(const auto* anchor:{&beforeMaskSelectionAnchor,&afterMaskSelectionAnchor})if(*anchor&&**anchor)size+=(***anchor).first.size()+(***anchor).second.size();
  if(maskEditingOnUndo)size+=sizeof(*maskEditingOnUndo)+maskEditingOnUndo->first.size();
  if(maskRaster)size+=sizeof(MaskRasterHistory)+maskRaster->maskId.size()+maskRaster->pixels.capacity()*sizeof(Delta);
  for(const auto* masks:{&beforeMasks,&afterMasks})if(*masks)for(const auto& m:**masks)size+=sizeof(m)+m.mask.surface.pixels.size()*4;
 return size;
}
std::size_t Document::MaskHistory::contextBytes()const{
 std::size_t size=0;
  if(maskContext)size+=sizeof(MaskHistory::MaskContextHistory)+maskContext->before.size()+maskContext->after.size();
 return size;
}
}
