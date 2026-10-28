#pragma once
#include "timeline_model.h"
namespace moon {
struct CelPropertyValue {double opacity=1;int zIndex=0;};
struct CelPropertyGroup {std::string sourceCelId;std::vector<std::string> memberCelIds;CelPropertyValue before;};
struct CelPropertiesPlan {std::vector<CelPropertyGroup> groups;CelPropertyValue after;bool changed()const{return !groups.empty();}std::size_t historyBytes()const{return groups.size()*32;}};
int normalizeCelZIndex(double value);
CelPropertiesPlan planCelProperties(const timeline::Timeline&,const std::string& layer,const std::string& frame,double opacity,double zIndex,const std::vector<std::string>& targets={});
void applyCelPropertiesPlan(timeline::State&,const CelPropertiesPlan&,bool forward);
std::vector<std::size_t> frameCompositeLayerOrder(const timeline::Timeline&,const std::string& frame);
double frameCelOpacity(const timeline::Timeline&,const timeline::Layer&,const std::string& frame);
}
