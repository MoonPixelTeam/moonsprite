#include "document.h"
#include <algorithm>
#include <set>
#include <map>
#include <regex>
#include <codecvt>
#include <locale>
namespace moon {
bool Document::canCreateLinkedLayer(const std::string& id)const{const auto& s=timeline_.state();const auto it=std::find_if(s.layers.begin(),s.layers.end(),[&](const auto& l){return l.id==id;});return s.layers.size()<256&&it!=s.layers.end()&&it->kind.empty()&&!it->background&&!active();}
std::u32string Document::linkedLayerCopyName(const std::string& key,const std::u32string& fallback,const std::vector<DocumentLayer>* namingLayers)const{
 std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t> codec;std::string base;int maximum=0,members=0;auto parse=[&](const std::u32string& value){const auto text=codec.to_bytes(value);std::smatch m;if(std::regex_match(text,m,std::regex("^(.*?)\\s+(?:关联|Linked)\\s*([0-9]+)$",std::regex::icase))&&!m[1].str().empty()){if(base.empty())base=m[1];if(m[1].str()==base)try{maximum=std::max(maximum,std::stoi(m[2]));}catch(...){}return true;}if(std::regex_match(text,m,std::regex("^(.*?)\\s+(?:关联|Linked)$",std::regex::icase))&&!m[1].str().empty()){if(base.empty())base=m[1];return true;}return false;};
 for(const auto& l:namingLayers?*namingLayers:timeline_.state().layers)if(l.linkedContentId==key){++members;parse(l.name);}if(base.empty())parse(fallback);if(base.empty())base=codec.to_bytes(fallback);const int next=maximum?maximum+1:std::max(1,members+1);return codec.from_bytes(base)+U" 关联"+codec.from_bytes(std::to_string(next));
}
std::string Document::createLinkedLayer(const std::string& id){
 if(!canCreateLinkedLayer(id))return {};commitFloatingPaste();cancelStroke();cancelLayerOpacity();if(!canCreateLinkedLayer(id))return {};
 const auto& state=timeline_.state();std::uint64_t bytes=0;for(const auto& c:state.cels)if(c.surface){const auto size=std::uint64_t(c.surface->pixels.size())*sizeof(Pixel);bytes+=size;if(c.layerId==id)bytes+=size;}if(bytes>256ull*1024*1024)throw std::length_error("Linked layer pixel memory limit reached");const auto source=state.layers[timeline_.layerIndex(id)];Edit e{{},state_,nextState_};captureGroupEdit(e,false);captureGroupEdit(e,true);auto next=nextLayerId_;std::string newId;do{newId="layer-native-"+std::to_string(identity_)+"-"+std::to_string(++next);}while(timeline_.hasLayer(newId)||findGroup(newId));const auto key=source.linkedContentId.empty()?"layer-link-"+std::to_string(identity_)+"-"+std::to_string(next):source.linkedContentId;
 auto color=source.linkedContentId.empty()?std::optional<Pixel>{nextAvailableLayerDisplayColor(state,layerDisplayColors_)}:source.displayColor;if(!color)color=nextAvailableLayerDisplayColor(state,layerDisplayColors_);
 auto copy=source;copy.id=newId;copy.linkedContentId=key;copy.name=source.linkedContentId.empty()?source.name+U" 关联1":linkedLayerCopyName(key,source.name);copy.displayColor=color;auto& layers=e.afterLayerStructure->layers;for(auto& l:layers)if(l.id==id||l.linkedContentId==key){l.linkedContentId=key;l.displayColor=color;}const auto at=std::find_if(layers.begin(),layers.end(),[&](const auto& l){return l.id==id;});layers.insert(at,copy);
 std::map<std::string,std::string> celIds;for(const auto& c:state.cels)if(c.layerId==id)celIds[c.id]="cel-"+newId+"-"+c.frameId;
 for(const auto& c:state.cels)if(c.layerId==id){auto cloned=c;cloned.id=celIds.at(c.id);cloned.layerId=newId;if(c.linkedCelId)cloned.linkedCelId=celIds.at(*c.linkedCelId);if(c.runtimeSharedCelId)cloned.runtimeSharedCelId=celIds.at(*c.runtimeSharedCelId);e.structureCelBytes+=sizeof(DocumentCel)+(cloned.surface?cloned.surface->pixels.size()*sizeof(Pixel):0);e.structureCels.push_back(std::move(cloned));}
 e.afterActive=newId;e.afterTimelineSelection=TimelineSelection{};e.afterTimelineSelection->layers={newId};e.afterTimelineSelection->layerAnchor=newId;e.afterGroupUi->selected.clear();e.afterGroupUi->focus.reset();if(!commitGroupEdit(std::move(e),U"创建关联图层"))return {};nextLayerId_=next;return newId;
}
void Document::appendDetachLinkedLayer(Edit& e,const std::string& id){
 if(!e.afterLayerStructure)throw std::logic_error("Detach requires structure transaction");auto& layers=e.afterLayerStructure->layers;auto layer=std::find_if(layers.begin(),layers.end(),[&](const auto& l){return l.id==id;});if(layer==layers.end()||layer->linkedContentId.empty())return;
 for(const auto& c:timeline_.state().cels)if(c.layerId==id){const auto resolved=timeline_.resolveSurface(c.id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.source||!resolved.surface)throw std::invalid_argument("Cannot detach broken linked layer");if(resolved.source->id!=c.id)continue;auto cloned=*resolved.surface;e.surfaceChanges.push_back({c.id,*resolved.surface,std::move(cloned)});}layer->linkedContentId.clear();
}
bool Document::detachLinkedLayer(const std::string& id){if(active())return false;const auto& layers=timeline_.state().layers;auto it=std::find_if(layers.begin(),layers.end(),[&](const auto& l){return l.id==id;});if(it==layers.end()||it->linkedContentId.empty())return false;Edit e{{},state_,nextState_};captureGroupEdit(e,false);captureGroupEdit(e,true);appendDetachLinkedLayer(e,id);return commitGroupEdit(std::move(e),U"转换为普通图层");}
}
