#pragma once
#include "cel_properties.h"
#include <stdexcept>

namespace moon::cel_properties_detail {
// Share the frozen membership contract between live replay and history preflight.
template<class Exists> void validateTargets(const CelPropertiesPlan& plan,Exists exists){
 for(const auto& group:plan.groups)for(const auto& id:group.memberCelIds)
  if(!exists(id))throw std::invalid_argument("Missing frozen Cel target");
}
}
