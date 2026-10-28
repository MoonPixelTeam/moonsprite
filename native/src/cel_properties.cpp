#include "cel_properties.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <unordered_map>
#include <map>
#include <unordered_set>
namespace moon {
namespace {
const timeline::Cel& sourceOf(const timeline::Timeline& t,const timeline::Cel& c){const auto r=t.resolveSurface(c.id);if(r.issue!=timeline::LinkIssue::None||!r.source)throw std::invalid_argument("Invalid Cel properties link");return *r.source;}
}
int normalizeCelZIndex(double v){return std::isfinite(v)?int(std::clamp(std::trunc(v),-999.,999.)):0;}
CelPropertiesPlan planCelProperties(const timeline::Timeline& t,const std::string& layer,const std::string& frame,double opacity,double z,const std::vector<std::string>& ids){
 CelPropertiesPlan p;const auto* clicked=t.findCel(layer,frame);if(!clicked)return p;if(std::isnan(opacity))throw std::invalid_argument("Invalid Cel opacity");p.after={std::clamp(opacity,0.,1.),normalizeCelZIndex(z)};
 const auto requested=ids.empty()?std::unordered_set<std::string>{clicked->id}:std::unordered_set<std::string>(ids.begin(),ids.end());std::unordered_map<std::string,std::size_t> groups;
 for(const auto& c:t.state().cels)if(requested.count(c.id)){const auto& s=sourceOf(t,c);if(groups.emplace(s.id,p.groups.size()).second)p.groups.push_back({s.id,{}, {s.opacity.value_or(1),normalizeCelZIndex(s.zIndex)}});}
 for(const auto& c:t.state().cels){const auto& s=sourceOf(t,c);const auto i=groups.find(s.id);if(i!=groups.end())p.groups[i->second].memberCelIds.push_back(c.id);}
 if(std::all_of(p.groups.begin(),p.groups.end(),[&](const auto& g){return g.before.opacity==p.after.opacity&&g.before.zIndex==p.after.zIndex;}))p.groups.clear();return p;
}
void applyCelPropertiesPlan(timeline::State& state,const CelPropertiesPlan& p,bool forward){std::unordered_map<std::string,timeline::Cel*> byId;for(auto& c:state.cels)byId.emplace(c.id,&c);for(const auto& g:p.groups)for(const auto& id:g.memberCelIds)if(!byId.count(id))throw std::invalid_argument("Missing frozen Cel target");for(const auto& g:p.groups){const auto v=forward?p.after:g.before;for(const auto& id:g.memberCelIds){auto& c=*byId.at(id);c.opacity=v.opacity;c.zIndex=v.zIndex;}}}
double frameCelOpacity(const timeline::Timeline& t,const timeline::Layer& l,const std::string& frame){if(const auto* c=t.findCel(l.id,frame)){const auto& s=sourceOf(t,*c);if(s.opacity&&std::isfinite(*s.opacity))return std::clamp(*s.opacity,0.,1.);}return l.opacity;}
static std::vector<std::size_t> computeFrameLayerOrder(const timeline::Timeline& t,const std::string& frame){if(!t.hasFrame(frame))throw std::invalid_argument("Unknown Cel order frame");struct Item{std::size_t index;int z;};std::vector<Item> items;for(std::size_t n=t.state().layers.size();n>0;--n){auto i=n-1;const auto* c=t.findCel(t.state().layers[i].id,frame);items.push_back({i,c?normalizeCelZIndex(sourceOf(t,*c).zIndex):0});}std::stable_sort(items.begin(),items.end(),[](const auto&a,const auto&b){return a.z<b.z;});std::vector<std::size_t> out;for(const auto&i:items)out.push_back(i.index);return out;}

std::vector<std::size_t> timeline::compositeLayerOrder(const Timeline& t,const std::string& frame){
 if(!t.hasFrame(frame))throw std::invalid_argument("Unknown Cel order frame");
 const auto found=t.compositeOrder_.find(frame);
 if(found!=t.compositeOrder_.end())return found->second;
 auto out=computeFrameLayerOrder(t,frame);
 // Each timeline owns a bounded, disposable metadata cache. Pixel edits keep
 // it warm; structural/link/Z mutations invalidate it at their write barrier.
 constexpr std::size_t budget=256*1024,frames=128;
 const auto bytes=out.size()*sizeof(std::size_t)+frame.size();
 if(bytes<=budget){
   if(t.compositeOrder_.size()>=frames || t.compositeOrderBytes_>budget-bytes){t.compositeOrder_.clear();t.compositeOrderBytes_=0;}
   t.compositeOrder_.emplace(frame,out);t.compositeOrderBytes_+=bytes;
 }
 return out;
}
std::vector<std::size_t> frameCompositeLayerOrder(const timeline::Timeline& t,const std::string& frame){return timeline::compositeLayerOrder(t,frame);}
}
