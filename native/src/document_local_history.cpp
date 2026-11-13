#include "document.h"
#include "local_history_edit.h"
#include "raster_geometry.h"
#include <stdexcept>
#include <cstring>
#include <algorithm>
#include <type_traits>
#include <cmath>
#include <limits>
#include <unordered_map>
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
   // Reject a malformed later patch before any earlier patch can write.
   // Both directions must be usable by compound-history compensation.
   std::visit([&](auto* value){using T=std::remove_reference_t<decltype(*value)>;
    for(const auto* candidate:{&patch.metadata->before,&patch.metadata->after}){
     if constexpr(std::is_same_v<T,bool>){if(!std::holds_alternative<bool>(*candidate))throw std::logic_error("Invalid local history boolean");}
     else if constexpr(std::is_same_v<T,std::string>||std::is_same_v<T,std::u32string>){if(!std::holds_alternative<std::string>(*candidate))throw std::logic_error("Invalid local history string");}
     else if constexpr(!std::is_same_v<T,std::u32string>){
      if(!std::holds_alternative<double>(*candidate))throw std::logic_error("Invalid local history number");
      if constexpr(std::is_integral_v<T>){const auto number=std::trunc(std::get<double>(*candidate));
       // The upper uint64 bound is exclusive because UINT64_MAX rounds to 2^64 as double.
       const bool invalid=!std::isfinite(number)||(std::is_unsigned_v<T>?(number<0||number>=std::ldexp(1.0,std::numeric_limits<T>::digits)):(number<std::numeric_limits<T>::lowest()||number>std::numeric_limits<T>::max()));
       if(invalid)throw std::logic_error("Local history integer exceeds range");
      }
     }
    }
    if constexpr(std::is_same_v<T,std::string>)value->reserve(std::max(std::get<std::string>(patch.metadata->before).size(),std::get<std::string>(patch.metadata->after).size()));
    else if constexpr(std::is_same_v<T,std::u32string>)value->reserve(std::max(patch.metadata->beforeUnicode.size(),patch.metadata->afterUnicode.size()));
   },field);
   fields.push_back(field);
  }
  metadataTargets.push_back(std::move(fields));
  std::vector<timeline::Surface*> targets;targets.reserve(patch.owners.size());
  if(!patch.metadata&&(!patch.before||!patch.after||patch.before->size()!=patch.after->size()))throw std::logic_error("Incomplete local history pixel patch");
  for(const auto& id:patch.owners){auto* surface=timeline_.mutableOwnedSurface(id);
   if(!surface)throw std::logic_error("Local history pixel owner changed");
   raster::validate(*surface);
   if(patch.offset>surface->pixels.size()*4||(!patch.metadata&&patch.after->size()>surface->pixels.size()*4-patch.offset))throw std::logic_error("Local history pixel owner changed");
   targets.push_back(surface);
  }owners.push_back(std::move(targets));
 }
 // Frame projection may resolve links and grow the geometry map. Prepare it
 // against the final metadata values before publishing any bytes or fields.
 auto geometry=edit.projectFrame?displayedLayerGeometry_:decltype(displayedLayerGeometry_){};
 std::vector<double> opacities;
 if(edit.projectFrame){
  opacities.reserve(timeline_.state_.layers.size());
  std::unordered_map<const void*,double> projectedNumbers;
  for(std::size_t step=0;step<edit.patches.size();++step){const auto index=forward?step:edit.patches.size()-1-step;const auto& patch=edit.patches[index];if(!patch.metadata)continue;
   for(const auto& field:metadataTargets[index]){
    if(const auto* pointer=std::get_if<double*>(&field))projectedNumbers[*pointer]=std::get<double>(forward?patch.metadata->after:patch.metadata->before);
    else if(const auto* pointer=std::get_if<std::optional<double>*>(&field))projectedNumbers[*pointer]=std::get<double>(forward?patch.metadata->after:patch.metadata->before);
   }
  }
  auto projected=[&](auto* target){auto value=*target;const auto found=projectedNumbers.find(target);if(found!=projectedNumbers.end())value=found->second;return value;
  };
  for(auto& layer:timeline_.state_.layers){
   auto opacity=projected(&layer.opacity);
   if(const auto* cel=timeline_.findCel(layer.id,activeFrameId_)){
    const auto resolved=timeline_.resolveSurface(cel->id);
    if(resolved.issue!=timeline::LinkIssue::None||!resolved.source)throw std::invalid_argument("Invalid Cel properties link");
    if(resolved.surface){const auto& surface=*resolved.surface;geometry[layer.id]={surface.width,surface.height,surface.offsetX,surface.offsetY};}
    auto* source=&timeline_.state_.cels[timeline_.cels_.at(resolved.source->id)];const auto celOpacity=projected(&source->opacity);
    if(celOpacity&&std::isfinite(*celOpacity))opacity=std::clamp(*celOpacity,0.,1.);
   }
   opacities.push_back(opacity);
  }
 }
 // All owners, values, string capacities and projection are prepared.
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
 if(edit.projectFrame){displayedLayerGeometry_.swap(geometry);for(std::size_t i=0;i<opacities.size();++i)timeline_.state_.layers[i].opacity=opacities[i];}
 if(propertiesChanged)timeline_.invalidateCompositeOrder();
 change_=edit.region&&(edit.frameId.empty()||edit.frameId==activeFrameId_)?PixelRegion{edit.x,edit.y,edit.width,edit.height}:PixelRegion{0,0,width_,height_};
}
}
