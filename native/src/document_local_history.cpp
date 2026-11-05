#include "document.h"
#include "local_history_edit.h"
#include <stdexcept>
#include <cstring>
#include <algorithm>
#include <type_traits>
namespace moon {
void Document::applyLocalHistoryPixels(const local_history::PixelHistoryEdit& edit,bool forward){
 // Resolve and validate all owners before the first write. No selection API:
 // history navigation must preserve the independently viewed frame/layer.
 std::vector<std::vector<timeline::Surface*>> owners;owners.reserve(edit.patches.size());
 using Destination=std::variant<bool*,std::uint64_t*,std::string*,std::u32string*,double*,int*,std::optional<double>*>;
 auto find=[](auto& values,const std::string& id)->auto&{auto it=std::find_if(values.begin(),values.end(),[&](const auto& v){return v.id==id;});if(it==values.end())throw std::logic_error("Local history property owner changed");return *it;};
 auto destination=[&](const local_history::PixelHistoryEdit::MetadataTarget& target)->Destination{
  using Field=local_history::PixelHistoryEdit::MetadataField;
  switch(target.field){
   case Field::Dirty:return &modified_;case Field::CreatedAt:return &projectInformation_.createdAt;case Field::UpdatedAt:return &projectInformation_.updatedAt;case Field::StrokeCount:return &projectInformation_.strokeCount;case Field::OperationCount:return &projectInformation_.operationCount;case Field::DrawingTimeMs:return &projectInformation_.drawingTimeMs;
   case Field::Name:return &name_;case Field::Loop:return &animationLoop_;case Field::PixelGrid:return &showPixelGrid_;case Field::ShowGrid:return &showCustomGrid_;case Field::GridX:return &customGrid_.x;case Field::GridY:return &customGrid_.y;case Field::GridWidth:return &customGrid_.width;case Field::GridHeight:return &customGrid_.height;
   case Field::LayerName:return &find(timeline_.state_.layers,target.id).name;case Field::LayerDescription:return &find(timeline_.state_.layers,target.id).description;case Field::LayerVisible:return &find(timeline_.state_.layers,target.id).visible;case Field::LayerLocked:return &find(timeline_.state_.layers,target.id).locked;case Field::LayerAutoLink:return &find(timeline_.state_.layers,target.id).autoLinkAnimationCels;case Field::LayerClipping:return &find(timeline_.state_.layers,target.id).clippingMask;
   case Field::GroupName:return &find(timeline_.state_.groups,target.id).name;case Field::GroupDescription:return &find(timeline_.state_.groups,target.id).description;case Field::GroupVisible:return &find(timeline_.state_.groups,target.id).visible;case Field::GroupLocked:return &find(timeline_.state_.groups,target.id).locked;case Field::GroupClipping:return &find(timeline_.state_.groups,target.id).clippingMask;case Field::GroupCumulativeBlend:return &find(timeline_.state_.groups,target.id).cumulativeBlend;
   case Field::LayerOpacity:return &find(timeline_.state_.layers,target.id).opacity;case Field::LayerBlend:return &find(timeline_.state_.layers,target.id).blendMode;
   case Field::GroupOpacity:return &find(timeline_.state_.groups,target.id).opacity;case Field::GroupBlend:return &find(timeline_.state_.groups,target.id).blendMode;
   case Field::CelOpacity:return &find(timeline_.state_.cels,target.id).opacity;case Field::CelZIndex:return &find(timeline_.state_.cels,target.id).zIndex;
   case Field::FrameDuration:return &find(timeline_.state_.frames,target.id).duration;case Field::FrameDisabled:return &find(timeline_.state_.frames,target.id).disabled;
  }
  throw std::logic_error("Unknown local history property");
 };
 std::vector<std::vector<Destination>> metadataTargets;metadataTargets.reserve(edit.patches.size());bool propertiesChanged=false;
 for(const auto& patch:edit.patches){
  std::vector<Destination> fields;
  if(patch.metadata)for(const auto& target:patch.metadata->fields){
   auto field=destination(target);propertiesChanged|=!target.id.empty();
   std::visit([&](auto* value){using T=std::remove_reference_t<decltype(*value)>;if constexpr(std::is_same_v<T,std::string>)value->reserve(std::max(std::get<std::string>(patch.metadata->before).size(),std::get<std::string>(patch.metadata->after).size()));else if constexpr(std::is_same_v<T,std::u32string>)value->reserve(std::max(patch.metadata->beforeUnicode.size(),patch.metadata->afterUnicode.size()));},field);
   fields.push_back(field);
  }
  metadataTargets.push_back(std::move(fields));
  std::vector<timeline::Surface*> targets;targets.reserve(patch.owners.size());
  for(const auto& id:patch.owners){auto* surface=timeline_.mutableOwnedSurface(id);
   if(!surface||patch.offset>surface->pixels.size()*4||patch.after->size()>surface->pixels.size()*4-patch.offset)throw std::logic_error("Local history pixel owner changed");
   targets.push_back(surface);
  }owners.push_back(std::move(targets));
 }
 // All owners and string capacities are prepared before the first write.
 for(std::size_t step=0;step<edit.patches.size();++step){
  const auto index=forward?step:edit.patches.size()-1-step;const auto& patch=edit.patches[index];
  if(patch.metadata){const auto& value=forward?patch.metadata->after:patch.metadata->before;
   for(const auto& target:metadataTargets[index])std::visit([&](auto* destination){using T=std::remove_reference_t<decltype(*destination)>;
    if constexpr(std::is_same_v<T,std::u32string>)*destination=forward?patch.metadata->afterUnicode:patch.metadata->beforeUnicode;
    else if constexpr(std::is_same_v<T,std::string>)*destination=std::get<std::string>(value);
    else if constexpr(std::is_same_v<T,bool>)*destination=std::get<bool>(value);
    else if constexpr(std::is_same_v<T,std::optional<double>>)*destination=std::get<double>(value);
    else *destination=static_cast<T>(std::get<double>(value));
   },target);continue;
  }
  const auto& bytes=*(forward?patch.after:patch.before);
  for(auto* surface:owners[index]){
   // LinkedPixelStorage::data touches its shared content revision. Keep native
   // caches coherent even when an alias names a cel without its own surface.
   auto* pixels=surface->pixels.data();
#if defined(_WIN32) || (defined(__BYTE_ORDER__) && __BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__)
   if(!bytes.empty())std::memcpy(reinterpret_cast<std::uint8_t*>(pixels)+patch.offset,bytes.data(),bytes.size());
#else
   for(std::size_t i=0;i<bytes.size();++i){const auto address=patch.offset+i;const auto shift=unsigned(address%4)*8;auto& pixel=pixels[address/4];pixel=(pixel&~(Pixel(255)<<shift))|(Pixel(bytes[i])<<shift);}
#endif
  }
 }
 if(edit.projectFrame)projectActiveCelOpacities();
 if(propertiesChanged)timeline_.invalidateCompositeOrder();
 change_=edit.region&&(edit.frameId.empty()||edit.frameId==activeFrameId_)?PixelRegion{edit.x,edit.y,edit.width,edit.height}:PixelRegion{0,0,width_,height_};
}
}
