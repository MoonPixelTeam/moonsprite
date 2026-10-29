#include "document.h"
#include "raster_geometry.h"
#include "layer_compositor.h"
#include <algorithm>
#include <cmath>
#include <set>
#include <map>
#include <unordered_set>
#include <codecvt>
#include <locale>
namespace moon {
namespace {
void rebuildTilemapCaches(timeline::State& s){
 for(auto& c:s.cels)if(c.tilemap){timeline::Surface r;r.width=c.tilemap->columns*c.tilemap->tileWidth;r.height=c.tilemap->rows*c.tilemap->tileHeight;r.pixels=tiles::render(*c.tilemap,s.tilesets);c.surface=std::move(r);c.linkedCelId.reset();c.runtimeSharedCelId.reset();}
}
}
bool Document::hasTilemapContent()const{return std::any_of(timeline_.state().layers.begin(),timeline_.state().layers.end(),[](const auto& l){return l.kind=="tilemap";});}
bool Document::createFreeTileLayer(std::u32string name,const std::string& shared){
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();if(active()||timeline_.state().layers.size()>=256)return false;
 while(!name.empty()&&javascriptWhitespace(name.front()))name.erase(name.begin());while(!name.empty()&&javascriptWhitespace(name.back()))name.pop_back();if(name.empty())name=U"自由瓦片图层";
 auto next=timeline_.state();free_tiles::LayerData data;
 if(!shared.empty())for(const auto& l:next.layers)if(l.kind=="free-tile"&&l.freeTiles&&l.freeTiles->setId==shared&&!l.freeTiles->sources.empty()){data=*l.freeTiles;break;}
 if(data.sources.empty()){
  data.setId=uniqueTileId("free-tile-set");auto set=tiles::blankTileset(uniqueTileId("tileset"),U"自由瓦片1",1,1,uniqueTileId("tile"),1);
  free_tiles::Source source;source.id=uniqueTileId("free-tile-source");source.name="自由瓦片1";source.tilesetId=set.id;source.displayColor=layerDisplayColors_.front();data.sources.push_back(std::move(source));next.tilesets.push_back(std::move(set));
 }
 Document placement(width_,height_);placement.timeline_=timeline_;placement.activeLayerId_=activeLayerId_;placement.activeFrameId_=activeFrameId_;placement.timelineSelection_=timelineSelection_;placement.selectedFrames_=selectedFrames_;placement.selectedGroupIds_=selectedGroupIds_;placement.selectedGroupId_=selectedGroupId_;placement.collapsedGroupIds_=collapsedGroupIds_;placement.nextLayerId_=nextLayerId_;placement.addLayer();nextLayerId_=placement.nextLayerId_;
 const auto id=placement.activeLayerId_;next.layers=placement.timeline_.state().layers;next.groups=placement.timeline_.state().groups;next.cels=placement.timeline_.state().cels;
 for(auto& l:next.layers)if(l.id==id){l.kind="free-tile";l.name=name;l.freeTiles=data;l.autoLinkAnimationCels=false;}
 for(auto& c:next.cels)if(c.layerId==id){c.freeTiles=free_tiles::CelData{};c.tilemap.reset();c.text.reset();c.linkedCelId.reset();c.runtimeSharedCelId.reset();timeline::Surface surface;surface.width=width_;surface.height=height_;surface.pixels=free_tiles::render(data,*c.freeTiles,next.tilesets,width_,height_);c.surface=std::move(surface);}
 TilemapSelection selected;selected.mode=tiles::Mode::Edit;selected.tilesetId=data.sources.front().tilesetId;const auto& set=*std::find_if(next.tilesets.begin(),next.tilesets.end(),[&](const auto& s){return s.id==selected.tilesetId;});selected.primary=selected.secondary=set.tileIds.front();
 Edit e{{},state_,nextState_};e.beforeTimeline=timeline_.state();e.afterTimeline=std::move(next);e.beforeActive=activeLayerId_;e.afterActive=id;e.beforeFrame=e.afterFrame=activeFrameId_;e.beforeSelection=selectedFrames_;e.afterSelection=std::vector<std::string>{};e.beforeTimelineSelection=timelineSelection_;e.afterTimelineSelection=placement.timelineSelection_;e.beforeFrameAnchor=frameAnchor_;e.afterFrameAnchor=placement.frameAnchor_;e.beforePalette=palette_;e.afterPalette=palette_;e.maskContext=std::make_shared<Edit::MaskContextHistory>(Edit::MaskContextHistory{activeMaskId_,{},maskIsolated_,false});e.beforeTileSelection=tileSelection_;e.afterTileSelection=selected;e.beforeGroupUi=GroupUiSnapshot{selectedGroupIds_,collapsedGroupIds_,selectedGroupId_};e.afterGroupUi=GroupUiSnapshot{placement.selectedGroupIds_,placement.collapsedGroupIds_,placement.selectedGroupId_};history_.reserve(position_+1);applyEdit(e,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"新建自由瓦片图层");return true;
}
// Legacy workspace-commands-free-tile add/delete source: collection metadata
// is shared across layers, but each cel owns its ordered instance references.
// Legacy workspace-free-tile-properties: source metadata snapshots, cumulative
// preview from baseline, trim only at commit, one shared-source history entry.
bool Document::beginFreeTileSourceProperties(const std::string& id){
 cancelFreeTileSourceProperties();if(active())return false;
 for(const auto& l:timeline_.state().layers)if(l.kind=="free-tile"&&l.freeTiles)for(const auto& source:l.freeTiles->sources)if(source.id==id){
  const auto& sets=timeline_.state().tilesets;const auto set=std::find_if(sets.begin(),sets.end(),[&](const auto& t){return t.id==source.tilesetId;});if(set==sets.end())return false;
  freeSourceProperties_=std::make_shared<FreeTileSourceSnapshot>(FreeTileSourceSnapshot{source,set->name});return true;
 }return false;
}
Document::FreeTileSourceSnapshot Document::freeTileSourceAfterChanges(const FreeTileSourceChanges& patch,bool commit)const{
 auto out=*freeSourceProperties_;auto& source=out.source;std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t> utf;
 if(patch.name){const auto name=commit?std::u32string(javascriptTrim(*patch.name)):*patch.name;if(!commit||!name.empty())source.name=utf.to_bytes(name);}
 if(patch.description)source.description=*patch.description;if(patch.displayColor)source.displayColor=*patch.displayColor;if(patch.visible)source.visible=*patch.visible;if(patch.locked)source.locked=*patch.locked;
 if(patch.offsetX&&std::isfinite(*patch.offsetX)&&std::abs(std::trunc(*patch.offsetX))<=free_tiles::MaxCoordinate)source.offsetX=int(std::trunc(*patch.offsetX));
 if(patch.offsetY&&std::isfinite(*patch.offsetY)&&std::abs(std::trunc(*patch.offsetY))<=free_tiles::MaxCoordinate)source.offsetY=int(std::trunc(*patch.offsetY));
 out.tilesetName=utf.from_bytes(source.name);return out;
}
bool Document::applyFreeTileSourceSnapshot(const FreeTileSourceSnapshot& value){
 auto next=timeline_.state();std::set<std::string> owners;bool changed=false;
 for(auto& l:next.layers)if(l.kind=="free-tile"&&l.freeTiles)for(auto& source:l.freeTiles->sources)if(source.id==value.source.id){owners.insert(l.id);if(source!=value.source)changed=true;source=value.source;for(auto& t:next.tilesets)if(t.id==source.tilesetId){if(t.name!=value.tilesetName)changed=true;t.name=value.tilesetName;}}
 if(!changed)return false;
 for(auto& c:next.cels)if(owners.count(c.layerId)&&c.freeTiles&&c.surface){const auto l=std::find_if(next.layers.begin(),next.layers.end(),[&](const auto& layer){return layer.id==c.layerId;});const auto& data=*l->freeTiles;const auto& source=value.source;
  const auto set=std::find_if(next.tilesets.begin(),next.tilesets.end(),[&](const auto& t){return t.id==source.tilesetId;});
  const bool referenced=std::any_of(c.freeTiles->instances.begin(),c.freeTiles->instances.end(),[&](const auto& i){const auto& id=i.sourceId.empty()?i.tileId:i.sourceId;return id==source.id||id==source.tilesetId||(set!=next.tilesets.end()&&std::find(set->tileIds.begin(),set->tileIds.end(),i.tileId)!=set->tileIds.end());});
  if(referenced)c.surface->pixels=free_tiles::render(data,*c.freeTiles,next.tilesets,c.surface->width,c.surface->height);
 }
 timeline_.state_=std::move(next);timeline_.buildIndex();return true;
}
bool Document::previewFreeTileSourceProperties(const FreeTileSourceChanges& patch){
 if(!freeSourceProperties_)return false;const auto after=freeTileSourceAfterChanges(patch,false);if(!applyFreeTileSourceSnapshot(after))return false;change_={0,0,width_,height_};publishChange();return true;
}
bool Document::commitFreeTileSourceProperties(const FreeTileSourceChanges& patch){
 if(!freeSourceProperties_)return false;const auto before=freeSourceProperties_;const auto after=std::make_shared<FreeTileSourceSnapshot>(freeTileSourceAfterChanges(patch,true));
 if(before->source==after->source&&before->tilesetName==after->tilesetName){cancelFreeTileSourceProperties();return false;}
 Edit edit{{},state_,nextState_};edit.beforeSourceProperties=before;edit.afterSourceProperties=after;history_.reserve(position_+1);applyFreeTileSourceSnapshot(*after);freeSourceProperties_.reset();change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"图层属性");return true;
}
void Document::cancelFreeTileSourceProperties(){if(!freeSourceProperties_)return;const auto before=freeSourceProperties_;const bool changed=applyFreeTileSourceSnapshot(*before);freeSourceProperties_.reset();if(changed){change_={0,0,width_,height_};publishChange();}}
bool Document::setFreeTileSourceProperties(const std::string& id,const FreeTileSourceChanges& patch){if(!beginFreeTileSourceProperties(id))return false;try{return commitFreeTileSourceProperties(patch);}catch(...){cancelFreeTileSourceProperties();throw;}}
bool Document::reorderFreeTileSource(const std::string& id,const std::string& target){
 if(active()||id==target)return false;
 const auto& layers=timeline_.state().layers;
 const auto owner=std::find_if(layers.begin(),layers.end(),[&](const auto& l){return l.kind=="free-tile"&&l.freeTiles&&std::any_of(l.freeTiles->sources.begin(),l.freeTiles->sources.end(),[&](const auto& s){return s.id==id;});});
 if(owner==layers.end())return false;
 auto sources=owner->freeTiles->sources;const auto destination=std::find_if(sources.begin(),sources.end(),[&](const auto& s){return s.id==target;});if(destination==sources.end())return false;
 // Legacy inserts at the target's original index: forward drops go after it,
 // backward drops before it. This is not instance stacking or pixel editing.
 const auto index=std::size_t(destination-sources.begin());const auto moving=std::find_if(sources.begin(),sources.end(),[&](const auto& s){return s.id==id;});const auto source=*moving;sources.erase(moving);sources.insert(sources.begin()+index,source);
 auto next=timeline_.state();for(auto& l:next.layers)if(l.kind=="free-tile"&&l.freeTiles&&(l.id==owner->id||(!owner->freeTiles->setId.empty()&&l.freeTiles->setId==owner->freeTiles->setId)))l.freeTiles->sources=sources;
 Edit edit{{},state_,nextState_};edit.beforeTimeline=timeline_.state();edit.afterTimeline=std::move(next);edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.freeTileSourceReorder=true;
 history_.reserve(position_+1);applyEdit(edit,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"源瓦片");return true;
}
bool Document::addFreeTileSource(){
 if(active()||layer().kind!="free-tile"||!layer().freeTiles||layer().freeTiles->sources.empty())return false;
 const auto& original=*layer().freeTiles;int index=1;
 while(std::any_of(original.sources.begin(),original.sources.end(),[&](const auto& s){return s.name=="自由瓦片"+std::to_string(index);}))++index;
 const auto digits=std::to_string(index);std::u32string name=U"自由瓦片";for(char digit:digits)name+=char32_t(digit);
 auto set=tiles::blankTileset(uniqueTileId("tileset"),name,1,1,uniqueTileId("tile"),1);
 free_tiles::Source source;source.id=uniqueTileId("free-tile-source");source.name="自由瓦片"+digits;source.tilesetId=set.id;source.displayColor=layerDisplayColors_[original.sources.size()%layerDisplayColors_.size()];
 auto next=timeline_.state();for(auto& l:next.layers)if(l.kind=="free-tile"&&l.freeTiles&&(l.id==activeLayerId_||(!original.setId.empty()&&l.freeTiles->setId==original.setId)))l.freeTiles->sources.push_back(source);
 next.tilesets.push_back(set);timeline::Timeline checked(next);
 auto selection=tileSelection_;selection.tilesetId=set.id;selection.primary=selection.secondary=set.tileIds.front();selection.freePaint=false;
 Edit edit{{},state_,nextState_};edit.beforeTimeline=timeline_.state();edit.afterTimeline=std::move(next);edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTileSelection=tileSelection_;edit.afterTileSelection=selection;edit.freeTileSourceAddition=true;
 history_.reserve(position_+1);applyEdit(edit,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"新增瓦片");return true;
}
bool Document::deleteFreeTileSource(const std::string& id){
 if(active()||layer().kind!="free-tile"||!layer().freeTiles||layer().freeTiles->sources.size()<=1)return false;
 const auto& original=*layer().freeTiles;const auto at=std::find_if(original.sources.begin(),original.sources.end(),[&](const auto& s){return s.id==id;});if(at==original.sources.end())return false;
 const auto source=*at;const auto set=std::find_if(timeline_.state().tilesets.begin(),timeline_.state().tilesets.end(),[&](const auto& s){return s.id==source.tilesetId;});if(set==timeline_.state().tilesets.end())return false;
 const auto tileId=set->tileIds.empty()?std::string{}:set->tileIds.front();auto sources=original.sources;const auto index=std::size_t(at-original.sources.begin());sources.erase(sources.begin()+index);
 auto next=timeline_.state();std::unordered_map<std::string,std::string> sourceForLayer;
 for(auto& l:next.layers)if(l.kind=="free-tile"&&l.freeTiles){const auto ref=std::find_if(l.freeTiles->sources.begin(),l.freeTiles->sources.end(),[&](const auto& s){return s.tilesetId==source.tilesetId;});if(ref!=l.freeTiles->sources.end())sourceForLayer[l.id]=ref->id;if(l.id==activeLayerId_||(!original.setId.empty()&&l.freeTiles->setId==original.setId))l.freeTiles->sources=sources;}
 next.tilesets.erase(std::remove_if(next.tilesets.begin(),next.tilesets.end(),[&](const auto& s){return s.id==source.tilesetId;}),next.tilesets.end());
 for(auto& c:next.cels){const auto owner=sourceForLayer.find(c.layerId);if(owner==sourceForLayer.end()||!c.freeTiles)continue;auto& instances=c.freeTiles->instances;const auto before=instances.size();instances.erase(std::remove_if(instances.begin(),instances.end(),[&](const auto& i){return i.sourceId==owner->second||i.sourceId==source.tilesetId||(!tileId.empty()&&i.tileId==tileId);}),instances.end());if(instances.size()!=before&&c.surface){const auto l=std::find_if(next.layers.begin(),next.layers.end(),[&](const auto& v){return v.id==c.layerId;});c.surface->pixels=free_tiles::render(*l->freeTiles,*c.freeTiles,next.tilesets,c.surface->width,c.surface->height);}}
 auto selection=tileSelection_;if(selection.tilesetId==source.tilesetId){const auto& fallback=sources[std::min(index,sources.size()-1)];const auto resource=std::find_if(next.tilesets.begin(),next.tilesets.end(),[&](const auto& s){return s.id==fallback.tilesetId;});if(resource==next.tilesets.end()||resource->tileIds.empty())return false;selection.tilesetId=resource->id;selection.primary=selection.secondary=resource->tileIds.front();}
 timeline::Timeline checked(next);Edit edit{{},state_,nextState_};edit.beforeTimeline=timeline_.state();edit.afterTimeline=std::move(next);edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTileSelection=tileSelection_;edit.afterTileSelection=selection;edit.freeTileSourceDeletion=true;
 history_.reserve(position_+1);applyEdit(edit,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"删除瓦片");return true;
}
bool Document::beginFreeTilePlacement(Point point,bool erase,bool secondary){
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();
 if(active()||!timeline_.hasLayer(activeLayerId_)||!free_tiles::coordinate(point.x)||!free_tiles::coordinate(point.y))return false;
 const auto& owner=layer();
 if(owner.kind!="free-tile"||!owner.freeTiles||layerEffectivelyLocked(owner)||!layerEffectivelyVisible(owner)||hasSelectedGroups()||!activeMaskId_.empty())return false;
 if(!erase&&selection_&&!selectionContains(selection_,point.x,point.y))return false;
 const auto* slot=timeline_.findCel(activeLayerId_,activeFrameId_);
 if(!slot||!slot->freeTiles||!slot->surface)return false;
 FreeTilePlacement draft{*slot,point,erase};
 if(erase){freeTilePlacement_=std::move(draft);try{updateFreeTilePlacement(point);}catch(...){cancelFreeTilePlacement();throw;}return true;}
 const free_tiles::Source* source=nullptr;const tiles::Tileset* resource=nullptr;std::string tile;
 if(!owner.freeTiles->sources.empty()){
  auto found=std::find_if(owner.freeTiles->sources.begin(),owner.freeTiles->sources.end(),[&](const auto& v){return v.id==tileSelection_.tilesetId||v.tilesetId==tileSelection_.tilesetId;});
  source=found==owner.freeTiles->sources.end()?&owner.freeTiles->sources.front():&*found;
  auto set=std::find_if(timeline_.state().tilesets.begin(),timeline_.state().tilesets.end(),[&](const auto& v){return v.id==source->tilesetId;});
  if(set!=timeline_.state().tilesets.end())resource=&*set;
 }else{
  auto set=std::find_if(timeline_.state().tilesets.begin(),timeline_.state().tilesets.end(),[&](const auto& v){return v.id==owner.freeTiles->legacyTilesetId;});
  if(set!=timeline_.state().tilesets.end())resource=&*set;
 }
 if(!resource||resource->tileIds.empty())return false;
 tile=secondary?tileSelection_.secondary:tileSelection_.primary;
 if(source||!tiles::Index(*resource).find(tile))tile=resource->tileIds.front();
 auto after=*slot;
 for(auto p:symmetryPoints({point.x,point.y},width_,height_,symmetryAxes,symmetryCenter(),false)){
  if(selection_&&!selectionContains(selection_,p.x,p.y))continue;
  free_tiles::Instance instance;instance.id=uniqueTileId("free-tile-instance");
  if(source)instance.sourceId=source->id;else instance.tileId=tile;
  instance.x=p.x-slot->surface->offsetX-resource->tileWidth/2-(source?source->offsetX:0);
  instance.y=p.y-slot->surface->offsetY-resource->tileHeight/2-(source?source->offsetY:0);
  instance.opacity=source?source->opacity:1;instance.blendMode=source?source->blendMode:"normal";
  after.freeTiles->instances.push_back(std::move(instance));
 }
 if(after.freeTiles==slot->freeTiles)return false;
 after.surface->pixels=free_tiles::render(*owner.freeTiles,*after.freeTiles,timeline_.state().tilesets,after.surface->width,after.surface->height);
 freeTilePlacement_=std::move(draft);timeline_.state_.cels[timeline_.cels_.at(after.id)]=std::move(after);
 change_={0,0,width_,height_};publishChange();return true;
}
bool Document::updateFreeTilePlacement(Point point){
 if(!freeTilePlacement_)return false;auto& draft=*freeTilePlacement_;
 // Legacy placement is a click action; only erasing interpolates a drag path.
 if(!draft.erase)return false;
 if(draft.sampled&&point.x==draft.last.x&&point.y==draft.last.y)return false;
 if(activeLayerId_!=draft.before.layerId||activeFrameId_!=draft.before.frameId||!free_tiles::coordinate(point.x)||!free_tiles::coordinate(point.y))return false;
 const auto* slot=timeline_.findCelById(draft.before.id);if(!slot||!slot->freeTiles||!slot->surface)return false;
 auto after=*slot;const auto& data=*layer().freeTiles;bool changed=false;
 auto eraseAt=[&](Point at){
  for(auto p:symmetryPoints({at.x,at.y},width_,height_,symmetryAxes,symmetryCenter(),false)){
   if(selection_&&!selectionContains(selection_,p.x,p.y))continue;
   for(std::size_t n=after.freeTiles->instances.size();n>0;--n){
    const auto& i=after.freeTiles->instances[n-1];if(!i.visible)continue;
    const free_tiles::Source* source=nullptr;std::string setId=data.legacyTilesetId;
    if(!data.sources.empty()){auto found=std::find_if(data.sources.begin(),data.sources.end(),[&](const auto& v){const auto& id=i.sourceId.empty()?i.tileId:i.sourceId;return v.id==id||v.tilesetId==id;});if(found==data.sources.end())continue;source=&*found;setId=source->tilesetId;}
    auto set=std::find_if(timeline_.state().tilesets.begin(),timeline_.state().tilesets.end(),[&](const auto& v){return v.id==setId;});if(set==timeline_.state().tilesets.end())continue;
    int x=p.x-after.surface->offsetX-i.x,y=p.y-after.surface->offsetY-i.y;
    if(i.flipHorizontal)x=-x-1;if(i.flipVertical)y=-y-1;
    const int tx=x,ty=y;switch(i.rotation){case 1:x=ty;y=-tx-1;break;case 2:x=-tx-1;y=-ty-1;break;case 3:x=-ty-1;y=tx;break;}
    x-=source?source->offsetX:0;y-=source?source->offsetY:0;
    if(x<0||y<0||x>=set->tileWidth||y>=set->tileHeight)continue;
    // A locked top instance blocks the hit; do not erase an instance below it.
    if(!i.locked){after.freeTiles->instances.erase(after.freeTiles->instances.begin()+std::ptrdiff_t(n-1));changed=true;}
    break;
   }
  }
 };
 int x=draft.last.x,y=draft.last.y;const int dx=std::abs(point.x-x),dy=std::abs(point.y-y),sx=x<point.x?1:-1,sy=y<point.y?1:-1;int error=dx-dy;
 // Match rasterLinePoints: the initial event samples itself; later events skip
 // the shared path endpoint, preventing repeat deletion on stationary moves.
 bool first=true;for(;;){if(!first||!draft.sampled)eraseAt({x,y});first=false;if(x==point.x&&y==point.y)break;const int twice=2*error;if(twice>-dy){error-=dy;x+=sx;}if(twice<dx){error+=dx;y+=sy;}}
 if(changed){after.surface->pixels=free_tiles::render(data,*after.freeTiles,timeline_.state().tilesets,after.surface->width,after.surface->height);timeline_.state_.cels[timeline_.cels_.at(after.id)]=std::move(after);change_={0,0,width_,height_};publishChange();}
 draft.last=point;draft.sampled=true;return changed;
}
bool Document::commitFreeTilePlacement(){
 if(!freeTilePlacement_)return false;const auto& draft=*freeTilePlacement_;const auto* after=timeline_.findCelById(draft.before.id);
 if(!after||after->freeTiles==draft.before.freeTiles){freeTilePlacement_.reset();return false;}
 Edit e{{},state_,nextState_};e.beforeCels.push_back(draft.before);e.afterCels.push_back(*after);e.beforeActive=e.afterActive=activeLayerId_;e.beforeFrame=e.afterFrame=activeFrameId_;const bool erase=draft.erase,moving=draft.moving;const int flag=draft.flagControl;history_.reserve(position_+1);freeTilePlacement_.reset();pushEdit(std::move(e),flag==0?U"显示图层":flag==1?U"图层属性":flag==2?U"自由瓦片实例属性":moving?U"移动自由瓦片实例":erase?U"擦除自由瓦片":U"放置自由瓦片");return true;
}
void Document::cancelFreeTilePlacement(){
 if(!freeTilePlacement_)return;auto draft=std::move(*freeTilePlacement_);freeTilePlacement_.reset();auto found=timeline_.cels_.find(draft.before.id);if(found==timeline_.cels_.end())return;timeline_.state_.cels[found->second]=std::move(draft.before);change_={0,0,width_,height_};publishChange();
}
std::string Document::uniqueTileId(const std::string& prefix){std::string id;do{id=prefix+"-native-"+std::to_string(identity_)+"-"+std::to_string(++nextTileId_);}while(std::any_of(timeline_.state().tilesets.begin(),timeline_.state().tilesets.end(),[&](const auto& s){return s.id==id||std::find(s.tileIds.begin(),s.tileIds.end(),id)!=s.tileIds.end();}));return id;}
void Document::setSelectedTileset(const std::string& set){if(active())return;const auto& all=timeline_.state().tilesets;auto t=std::find_if(all.begin(),all.end(),[&](const auto& v){return v.id==set;});if(t==all.end())return;tileSelection_.tilesetId=set;tiles::Index index(*t);if(!index.find(tileSelection_.primary))tileSelection_.primary=t->tileIds.front();if(!index.find(tileSelection_.secondary))tileSelection_.secondary=t->tileIds.front();}
void Document::setSelectedTile(const std::string& set,const std::string& tile,bool secondary){if(active())return;const auto& all=timeline_.state().tilesets;auto t=std::find_if(all.begin(),all.end(),[&](const auto& v){return v.id==set;});if(t==all.end()||tile.empty()||!tiles::Index(*t).find(tile))return;setSelectedTileset(set);(secondary?tileSelection_.secondary:tileSelection_.primary)=tile;}
bool Document::commitTilemapState(timeline::State next,const TilemapSelection& selection,std::u32string label,const std::string& active,bool clearPixelSelection){
 rebuildTilemapCaches(next);timeline::Timeline checked(next);
 Edit e{{},state_,nextState_};e.beforeTimeline=timeline_.state();e.afterTimeline=std::move(next);e.beforeActive=activeLayerId_;e.afterActive=active.empty()?activeLayerId_:active;e.beforeFrame=e.afterFrame=activeFrameId_;
 e.beforeSelection=e.afterSelection=selectedFrames_;e.beforeTimelineSelection=e.afterTimelineSelection=timelineSelection_;e.beforeFrameAnchor=e.afterFrameAnchor=frameAnchor_;e.beforeGroupUi=e.afterGroupUi=GroupUiSnapshot{selectedGroupIds_,collapsedGroupIds_,selectedGroupId_};
 if(!active.empty()){e.afterTimelineSelection=TimelineSelection{};e.afterTimelineSelection->layerAnchor=active;e.afterSelection=std::vector<std::string>{};e.afterFrameAnchor=std::string{};}
 e.beforeTileSelection=tileSelection_;e.afterTileSelection=selection;if(clearPixelSelection){e.pixelSelectionEdit=true;e.beforePixelsSelection=selection_;e.afterPixelsSelection.reset();}history_.reserve(position_+1);applyEdit(e,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),std::move(label));return true;
}
bool Document::createTilemapLayer(int tw,int th,std::u32string name,const std::string& shared){
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();
 tiles::Tileset set;auto next=timeline_.state();
 if(shared.empty()){set=tiles::blankTileset(uniqueTileId("tileset"),name,tw,th,uniqueTileId("tile"));next.tilesets.push_back(set);}else{auto i=std::find_if(next.tilesets.begin(),next.tilesets.end(),[&](const auto& t){return t.id==shared;});if(i==next.tilesets.end()||std::none_of(next.layers.begin(),next.layers.end(),[&](const auto& l){return l.kind=="tilemap"&&l.tilemapTilesetId==shared;}))return false;set=*i;tw=set.tileWidth;th=set.tileHeight;}
 // Reuse the existing placement/group command on a detached document.
 Document placement(width_,height_);placement.timeline_=timeline_;placement.activeLayerId_=activeLayerId_;placement.activeFrameId_=activeFrameId_;placement.timelineSelection_=timelineSelection_;placement.selectedFrames_=selectedFrames_;placement.selectedGroupIds_=selectedGroupIds_;placement.selectedGroupId_=selectedGroupId_;placement.collapsedGroupIds_=collapsedGroupIds_;placement.nextLayerId_=nextLayerId_;placement.addLayer();nextLayerId_=placement.nextLayerId_;
 const auto id=placement.activeLayerId_;next.layers=placement.timeline_.state().layers;next.groups=placement.timeline_.state().groups;next.cels=placement.timeline_.state().cels;
 for(auto& l:next.layers)if(l.id==id){l.kind="tilemap";l.tilemapTilesetId=set.id;l.name=name.empty()?U"瓦片图层":name;l.autoLinkAnimationCels=false;}
 for(auto& c:next.cels)if(c.layerId==id){c.tilemap=tiles::blankCel(width_,height_,tw,th);c.text.reset();c.linkedCelId.reset();c.runtimeSharedCelId.reset();}
 TilemapSelection selected;selected.mode=tiles::Mode::Hybrid;selected.tilesetId=set.id;selected.primary=selected.secondary=set.tileIds.front();return commitTilemapState(std::move(next),selected,U"新建瓦片图层",id);
}
bool Document::convertLayerToTilemap(int tw,int th,std::u32string name){
 if(!layer().kind.empty()||layerEffectivelyLocked(layer()))return false;commitFloatingPaste();cancelStroke();cancelLayerOpacity();auto next=timeline_.state();auto set=tiles::blankTileset(uniqueTileId("tileset"),name,tw,th,uniqueTileId("tile"));
 for(auto& c:next.cels)if(c.layerId==activeLayerId_){const auto resolved=timeline_.resolveSurface(c.id);if(!resolved.surface)throw std::logic_error("Missing raster owner");const auto& r=*resolved.surface;c.tilemap=tiles::sliceRaster(width_,height_,set,[&](int x,int y){return raster::readWorld(r,x,y);},[&]{return uniqueTileId("tile");});c.text.reset();c.linkedCelId.reset();c.runtimeSharedCelId.reset();}
 for(auto& l:next.layers)if(l.id==activeLayerId_){l.kind="tilemap";l.tilemapTilesetId=set.id;l.background.reset();l.linkedContentId.clear();l.autoLinkAnimationCels=false;}
 TilemapSelection selected;selected.mode=tiles::Mode::Hybrid;selected.tilesetId=set.id;selected.primary=selected.secondary=set.tileIds.front();next.tilesets.push_back(std::move(set));return commitTilemapState(std::move(next),selected,U"转换为瓦片图层");
}
void Document::startTilemapStroke(Point p,bool secondary){
 tileStrokeCells_.clear();tileStrokeIncremental_=tilemapDeltaSupported();tileStrokeBefore_.reset();if(!tileStrokeIncremental_)tileStrokeBefore_=timeline_.state();tileStrokeCel_=cel().id;tileStrokePoint_=p;const auto& c=cel();tileEditCell_.reset();if(c.tilemap&&p.x>=0&&p.y>=0&&p.x<c.tilemap->columns*c.tilemap->tileWidth&&p.y<c.tilemap->rows*c.tilemap->tileHeight)tileEditCell_=std::size_t(p.y/c.tilemap->tileHeight)*c.tilemap->columns+p.x/c.tilemap->tileWidth;
 tilePaintValue_.reset();const auto& id=secondary?tileSelection_.secondary:tileSelection_.primary;if(!id.empty()){auto t=std::find_if(timeline_.state().tilesets.begin(),timeline_.state().tilesets.end(),[&](const auto& s){return s.id==tileSelection_.tilesetId;});if(t!=timeline_.state().tilesets.end()&&t->tileWidth==c.tilemap->tileWidth&&t->tileHeight==c.tilemap->tileHeight&&tiles::Index(*t).find(id))tilePaintValue_=tiles::Cell{t->id,id};}
}
void Document::paintTilemapLine(Point p){
 auto& state=timeline_.state_;auto c=std::find_if(state.cels.begin(),state.cels.end(),[&](const auto& v){return v.id==tileStrokeCel_;});if(c==state.cels.end()||!c->tilemap)return;auto& grid=*c->tilemap;
 auto floorCell=[](int v,int size){return int(std::floor(double(v)/size));};int x=floorCell(tileStrokePoint_.x,grid.tileWidth),y=floorCell(tileStrokePoint_.y,grid.tileHeight),endX=floorCell(p.x,grid.tileWidth),endY=floorCell(p.y,grid.tileHeight);const int dx=std::abs(endX-x),dy=std::abs(endY-y),sx=x<endX?1:-1,sy=y<endY?1:-1;int err=dx-dy;
 std::vector<std::size_t> indexes;auto paint=[&](int cx,int cy){if(cx<0||cy<0||cx>=grid.columns||cy>=grid.rows)return;bool allowed=!selection_;if(selection_)for(int py=cy*grid.tileHeight;py<std::min(height_,(cy+1)*grid.tileHeight)&&!allowed;++py)for(int px=cx*grid.tileWidth;px<std::min(width_,(cx+1)*grid.tileWidth);++px)if(selectionContains(selection_,px,py)){allowed=true;break;}if(allowed){const auto index=std::size_t(cy)*grid.columns+cx;if(tileStrokeIncremental_)indexes.push_back(index);else grid.cells[index]=tilePaintValue_;}};
 for(;;){const auto center=symmetryCenter();const double px=(x+.5)*grid.tileWidth-center.x,py=(y+.5)*grid.tileHeight-center.y;for(auto m:symmetryMatrices(symmetryAxes)){const double wx=m.xx*px+m.xy*py+center.x,wy=m.yx*px+m.yy*py+center.y;paint(int(std::floor(wx/grid.tileWidth)),int(std::floor(wy/grid.tileHeight)));}if(x==endX&&y==endY)break;const int twice=2*err;if(twice>-dy){err-=dy;x+=sx;}if(twice<dx){err+=dx;y+=sy;}}
 if(tileStrokeIncremental_){
  std::sort(indexes.begin(),indexes.end());indexes.erase(std::unique(indexes.begin(),indexes.end()),indexes.end());
  struct Prepared{std::size_t index;std::optional<tiles::Cell> value;std::vector<Pixel> pixels;};std::vector<Prepared> prepared;prepared.reserve(indexes.size());tiles::Catalog catalog(state.tilesets);
  for(const auto index:indexes){if(grid.cells[index]==tilePaintValue_)continue;
   if(!tileStrokeCells_.count(index))tileStrokeCells_.emplace(index,TilemapStrokeCell{grid.cells[index],tiles::cellPixels(grid.cells[index],grid.tileWidth,grid.tileHeight,catalog)});
   prepared.push_back({index,tilePaintValue_,tiles::cellPixels(tilePaintValue_,grid.tileWidth,grid.tileHeight,catalog)});
  }
  // All allocations (including the stamp) precede authority writes.
  if(!prepared.empty())timeline_.thumbnailStorage(c->id);
  for(auto& patch:prepared){grid.cells[patch.index].swap(patch.value);const auto left=patch.index%grid.columns*grid.tileWidth,top=patch.index/grid.columns*grid.tileHeight;auto& pixels=static_cast<std::vector<Pixel>&>(c->surface->pixels);for(int py=0;py<grid.tileHeight;++py)std::copy_n(patch.pixels.begin()+std::size_t(py)*grid.tileWidth,grid.tileWidth,pixels.begin()+(top+py)*c->surface->width+left);++tilemapCacheCellWrites_;}
  if(!prepared.empty()){timeline_.selectionContent_.erase(c->id);timeline_.visibleContent_.erase(c->id);++timeline_.thumbnailStorage_.at(c->id).revision;}
 }else rebuildTilemapCaches(state);
 tileStrokePoint_=p;change_={0,0,width_,height_};publishChange();
}
bool Document::commitTilemapStroke(){
 if(tileStrokeIncremental_){
  try{
   if(tileSelection_.mode==tiles::Mode::Paint){
    const auto* live=timeline_.findCelById(tileStrokeCel_);if(!live||!live->tilemap)throw std::logic_error("Missing incremental Paint owner");
    TilemapPixelHistory payload;payload.celId=tileStrokeCel_;payload.tilesetEdit=false;payload.beforeSet.id=layer().tilemapTilesetId;
    for(const auto& item:tileStrokeCells_)if(item.second.before!=live->tilemap->cells[item.first])payload.cells.push_back({item.first,item.second.before,live->tilemap->cells[item.first]});
    if(payload.cells.empty()){cancelTilemapStroke();return false;}
    Edit edit{{},state_,nextState_};edit.tilemapPixels=std::make_shared<const TilemapPixelHistory>(std::move(payload));
    edit.beforeTileSelection=edit.afterTileSelection=tileSelection_;edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeFrameAnchor=edit.afterFrameAnchor=frameAnchor_;edit.beforeGroupUi=edit.afterGroupUi=GroupUiSnapshot{selectedGroupIds_,collapsedGroupIds_,selectedGroupId_};
    std::u32string label=U"绘制瓦片";history_.reserve(position_+1);edit.label.reserve(std::max(label.size(),historyLabelOverride_.size()));applyEdit(edit,true);
    tileStrokeIncremental_=false;tileStrokeCells_.clear();active_=false;strokePixels_=nullptr;clearPendingStroke();publishChange();pushEdit(std::move(edit),std::move(label));return true;
   }
   auto canvas=canvasPixels();auto baseline=canvas;for(const auto& delta:pending_)baseline[delta.index]=delta.before;const auto hint=tileEditCell_;
   // Revert only raster preview pixels; source tile authority has not changed.
   for(const auto& delta:pending_)strokePixel(delta.index)=delta.before;
   tileStrokeIncremental_=false;tileStrokeCells_.clear();active_=false;strokePixels_=nullptr;clearPendingStroke();
   const bool committed=commitTilemapPixelCanvas(baseline,canvas,U"绘制瓦片",hint);if(!committed){change_={0,0,width_,height_};publishChange();}return committed;
  }catch(...){if(tileStrokeIncremental_)cancelTilemapStroke();else{change_={0,0,width_,height_};publishChange();}throw;}
 }
 if(!tileStrokeBefore_)return false;auto before=*tileStrokeBefore_;auto next=before;const auto* live=timeline_.findCelById(tileStrokeCel_);auto target=std::find_if(next.cels.begin(),next.cels.end(),[&](const auto& c){return c.id==tileStrokeCel_;});bool changed=false;
 if(live&&target!=next.cels.end()&&target->tilemap){if(tileSelection_.mode==tiles::Mode::Paint){changed=target->tilemap->cells!=live->tilemap->cells;target->tilemap=live->tilemap;}else{auto layer=std::find_if(next.layers.begin(),next.layers.end(),[&](const auto& l){return l.id==target->layerId;});auto set=std::find_if(next.tilesets.begin(),next.tilesets.end(),[&](const auto& t){return layer!=next.layers.end()&&t.id==layer->tilemapTilesetId;});if(set!=next.tilesets.end()){auto old=tiles::render(*target->tilemap,before.tilesets);auto after=old;std::vector<std::size_t> cells;for(const auto& d:pending_)if(d.before!=d.after){int x=int(d.index%width_),y=int(d.index/width_);if(x>=target->tilemap->columns*target->tilemap->tileWidth||y>=target->tilemap->rows*target->tilemap->tileHeight)continue;after[std::size_t(y)*target->surface->width+x]=d.after;cells.push_back(std::size_t(y/target->tilemap->tileHeight)*target->tilemap->columns+x/target->tilemap->tileWidth);}changed=tiles::applyPixelEdit(*target->tilemap,*set,old,after,tileSelection_.mode,cells,[&]{return uniqueTileId("tile");},tileEditCell_);}}}
 tileStrokeBefore_.reset();active_=false;strokePixels_=nullptr;clearPendingStroke();timeline_=timeline::Timeline(std::move(before));if(!changed){change_={0,0,width_,height_};publishChange();return false;}return commitTilemapState(std::move(next),tileSelection_,U"绘制瓦片");
}
void Document::cancelTilemapStroke(){
 if(tileStrokeIncremental_){
  if(tileSelection_.mode==tiles::Mode::Paint){
   auto found=timeline_.cels_.find(tileStrokeCel_);if(found!=timeline_.cels_.end()){auto& c=timeline_.state_.cels[found->second];if(c.tilemap&&c.surface){auto& grid=*c.tilemap;
    for(auto& item:tileStrokeCells_){const auto index=item.first;grid.cells[index].swap(item.second.before);const auto left=index%grid.columns*grid.tileWidth,top=index/grid.columns*grid.tileHeight;auto& pixels=static_cast<std::vector<Pixel>&>(c.surface->pixels);for(int py=0;py<grid.tileHeight;++py)std::copy_n(item.second.beforePixels.begin()+std::size_t(py)*grid.tileWidth,grid.tileWidth,pixels.begin()+(top+py)*c.surface->width+left);++tilemapCacheCellWrites_;}
    if(!tileStrokeCells_.empty()){timeline_.selectionContent_.erase(c.id);timeline_.visibleContent_.erase(c.id);auto stamp=timeline_.thumbnailStorage_.find(c.id);if(stamp!=timeline_.thumbnailStorage_.end())++stamp->second.revision;}
   }}
  }else if(strokePixels_)for(const auto& delta:pending_)strokePixel(delta.index)=delta.before;
  tileStrokeIncremental_=false;tileStrokeCells_.clear();active_=false;strokePixels_=nullptr;clearPendingStroke();change_={0,0,width_,height_};publishChange();return;
 }
if(!tileStrokeBefore_)return;auto before=std::move(*tileStrokeBefore_);tileStrokeBefore_.reset();active_=false;strokePixels_=nullptr;clearPendingStroke();timeline_=timeline::Timeline(std::move(before));change_={0,0,width_,height_};publishChange();}
}

namespace moon {
namespace {
auto findManagedSet(timeline::State& state,const std::string& id){return std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& t){return t.id==id;});}
bool managementSupported(const timeline::State& state){return std::none_of(state.layers.begin(),state.layers.end(),[](const auto& l){return l.kind=="free-tile";});}
}
std::string Document::addTilesetTile(const std::string& id){if(active()||!managementSupported(timeline_.state()))return {};auto next=timeline_.state();auto t=findManagedSet(next,id);if(t==next.tilesets.end())return {};const auto tile=uniqueTileId("tile");tiles::appendTile(*t,tile,std::vector<Pixel>(std::size_t(t->tileWidth)*t->tileHeight));auto selected=tileSelection_;selected.tilesetId=id;selected.primary=tile;commitTilemapState(std::move(next),selected,U"新增瓦片");return tile;}
bool Document::reorderTilesetTiles(const std::string& id,const std::vector<std::string>& ordered){if(active()||!managementSupported(timeline_.state()))return false;auto next=timeline_.state();auto t=findManagedSet(next,id);if(t==next.tilesets.end()||!tiles::reorder(*t,ordered))return false;return commitTilemapState(std::move(next),tileSelection_,U"调整瓦片顺序");}
bool Document::setTilesetTileSlots(const std::string& id,const std::vector<std::optional<std::string>>& slots){if(active()||!managementSupported(timeline_.state()))return false;auto t=findManagedSet(timeline_.state_,id);if(t==timeline_.state_.tilesets.end())return false;tiles::Tileset metadata;metadata.id=t->id;metadata.tileIds=t->tileIds;metadata.tileSlots=t->tileSlots;if(!tiles::setSlots(metadata,slots))return false;Edit e{{},state_,nextState_};e.tilesetSlotsId=id;e.beforeTilesetSlots=tiles::compactSlots(*t);e.afterTilesetSlots=metadata.tileSlots;history_.reserve(position_+1);applyEdit(e,true);publishChange();pushEdit(std::move(e),U"调整瓦片顺序");return true;}
bool Document::deleteTilesetTiles(const std::string& id,const std::vector<std::string>& ids){
 if(active()||!managementSupported(timeline_.state()))return false;auto next=timeline_.state();auto t=findManagedSet(next,id);if(t==next.tilesets.end())return false;const auto original=t->tileIds;if(!tiles::removeTiles(*t,ids))return false;tiles::Index retained(*t);std::set<std::string> deleted;std::size_t first=original.size();for(std::size_t i=0;i<original.size();++i)if(!retained.find(original[i])){deleted.insert(original[i]);first=std::min(first,i);}
 for(auto& c:next.cels)if(c.tilemap)for(auto& cell:c.tilemap->cells)if(cell&&cell->tilesetId==id&&deleted.count(cell->tileId))cell.reset();
 auto selected=tileSelection_;selected.tilesetId=id;const auto fallback=t->tileIds[std::min(first,t->tileIds.size()-1)];if(!retained.find(selected.primary))selected.primary=fallback;if(!retained.find(selected.secondary))selected.secondary=fallback;return commitTilemapState(std::move(next),selected,U"删除瓦片");
}
bool Document::clearUnusedTilesetTiles(const std::string& id){
 // Legacy workspace-unused-tiles.clearUnusedFreeTileSources: the free source
 // panel cleans its displayed collection, not just the selected resource.
 if(layer().kind=="free-tile"&&layer().freeTiles){
  if(active())return false;const auto& state=timeline_.state();const auto& data=*layer().freeTiles;const auto original=data.sources;
  if(original.empty()||std::none_of(original.begin(),original.end(),[&](const auto& source){return source.tilesetId==id;}))return false;
  std::set<std::string> unused,originalIds;
  for(const auto& source:original){originalIds.insert(source.id);const auto resource=std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& t){return t.id==source.tilesetId;});if(resource==state.tilesets.end())continue;
   bool used=false;for(const auto& c:state.cels){
    if(c.tilemap)for(const auto& cell:c.tilemap->cells)if(cell&&cell->tilesetId==resource->id&&std::find(resource->tileIds.begin(),resource->tileIds.end(),cell->tileId)!=resource->tileIds.end()){used=true;break;}
    if(!used&&c.freeTiles){const auto owner=std::find_if(state.layers.begin(),state.layers.end(),[&](const auto& l){return l.id==c.layerId;});if(owner!=state.layers.end()&&owner->kind=="free-tile"&&owner->freeTiles){std::set<std::string> aliases;for(const auto& candidate:owner->freeTiles->sources)if(candidate.tilesetId==resource->id){aliases.insert(candidate.id);aliases.insert(resource->id);}const bool legacyOwner=owner->freeTiles->sources.empty()&&owner->freeTiles->legacyTilesetId==resource->id;for(const auto& instance:c.freeTiles->instances){const auto& reference=instance.sourceId.empty()?instance.tileId:instance.sourceId;if(legacyOwner||(!aliases.empty()&&(aliases.count(reference)||std::find(resource->tileIds.begin(),resource->tileIds.end(),instance.tileId)!=resource->tileIds.end()))){used=true;break;}}}}
    if(used)break;
   }if(!used)unused.insert(source.id);
  }
  if(unused.empty())return false;const bool allUnused=unused.size()==original.size();if(allUnused)unused.erase(original.front().id);
  auto sources=original;sources.erase(std::remove_if(sources.begin(),sources.end(),[&](const auto& source){return unused.count(source.id);}),sources.end());
  std::set<std::string> removedResources;for(const auto& source:original)if(unused.count(source.id))removedResources.insert(source.tilesetId);for(const auto& source:sources)removedResources.erase(source.tilesetId);
  for(const auto& l:state.layers){if(l.kind=="tilemap")removedResources.erase(l.tilemapTilesetId);if(l.freeTiles){removedResources.erase(l.freeTiles->legacyTilesetId);for(const auto& source:l.freeTiles->sources)if(!originalIds.count(source.id))removedResources.erase(source.tilesetId);}}
  const auto blank=allUnused?sources.front().tilesetId:std::string{};const auto blankResource=std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& t){return t.id==blank;});
  const bool pixelsChanged=blankResource!=state.tilesets.end()&&std::any_of(blankResource->pixels.begin(),blankResource->pixels.end(),[](Pixel value){return value!=0;});if(unused.empty()&&!pixelsChanged)return false;
  auto next=state;for(auto& l:next.layers)if(l.kind=="free-tile"&&l.freeTiles&&(l.id==activeLayerId_||(!data.setId.empty()&&l.freeTiles->setId==data.setId)))l.freeTiles->sources=sources;
  next.tilesets.erase(std::remove_if(next.tilesets.begin(),next.tilesets.end(),[&](const auto& t){return removedResources.count(t.id);}),next.tilesets.end());for(auto& t:next.tilesets)if(t.id==blank)std::fill(t.pixels.begin(),t.pixels.end(),0);
  auto selection=tileSelection_;if(removedResources.count(selection.tilesetId)){const auto fallback=std::find_if(next.tilesets.begin(),next.tilesets.end(),[&](const auto& t){return t.id==sources.front().tilesetId;});if(fallback==next.tilesets.end()||fallback->tileIds.empty())return false;selection.tilesetId=fallback->id;selection.primary=selection.secondary=fallback->tileIds.front();}
  Edit edit{{},state_,nextState_};edit.beforeTimeline=state;edit.afterTimeline=std::move(next);edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTileSelection=tileSelection_;edit.afterTileSelection=selection;edit.freeTileSourceReorder=true;
  history_.reserve(position_+1);applyEdit(edit,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"清空未使用瓦片");return true;
 }
 if(active()||!managementSupported(timeline_.state()))return false;auto next=timeline_.state();auto t=findManagedSet(next,id);if(t==next.tilesets.end())return false;std::set<std::string> used;for(const auto& c:next.cels)if(c.tilemap)for(const auto& v:c.tilemap->cells)if(v&&v->tilesetId==id)used.insert(v->tileId);std::vector<std::string> unused;for(const auto& tile:t->tileIds)if(!used.count(tile))unused.push_back(tile);if(unused.empty())return false;const auto original=*t;tiles::removeTiles(*t,unused);if(unused.size()==original.tileIds.size())std::fill(t->pixels.begin(),t->pixels.end(),0);if(t->tileIds==original.tileIds&&t->pixels==original.pixels)return false;auto selected=tileSelection_;if(selected.tilesetId==id){tiles::Index retained(*t);if(!retained.find(selected.primary))selected.primary=t->tileIds.front();if(!retained.find(selected.secondary))selected.secondary=t->tileIds.front();}return commitTilemapState(std::move(next),selected,U"清空未使用瓦片");
}
bool Document::writeTilesetTilePixels(const std::string& id,const std::string& tile,const std::vector<Pixel>& pixels){if(active()||!managementSupported(timeline_.state()))return false;auto next=timeline_.state();auto t=findManagedSet(next,id);if(t==next.tilesets.end())return false;auto index=tiles::Index(*t).find(tile);if(!index||pixels.size()!=std::size_t(t->tileWidth)*t->tileHeight||tiles::readTile(*t,*index)==pixels)return false;if(!tiles::writeTile(*t,tile,pixels))return false;return commitTilemapState(std::move(next),tileSelection_,U"编辑瓦片");}
}

namespace moon {
bool Document::tilemapPreviewValid()const{
 if(!gradient_||!gradient_->tilemap||!activeMaskId_.empty()||layer().kind!="tilemap"||!cel().tilemap||tileSelection_.mode==tiles::Mode::Paint||tileSelection_.mode!=gradient_->tilemapMode||hasSelectedGroups()||layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer()))return false;
 return std::none_of(timeline_.state().layers.begin(),timeline_.state().layers.end(),[](const auto& l){return l.kind=="free-tile";});
}
bool Document::beginTilemapPreview(Point seed,WandOptions options,bool shape){
 if(active()||!activeMaskId_.empty()||layer().kind!="tilemap"||!cel().tilemap||tileSelection_.mode==tiles::Mode::Paint||hasSelectedGroups()||layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer()))return false;
 if(std::any_of(timeline_.state().layers.begin(),timeline_.state().layers.end(),[](const auto& l){return l.kind=="free-tile";}))return false;
 if(!shape&&(seed.x<0||seed.y<0||seed.x>=width_||seed.y>=height_||(selection_&&!selectionContains(selection_,seed.x,seed.y))))return false;
 const auto& state=timeline_.state();const auto set=std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& t){return t.id==layer().tilemapTilesetId;});if(set==state.tilesets.end())return false;
 const auto resolved=timeline_.resolveSurface(cel().id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.surface)return false;
 // sparseFillCanvas already enforces document staging limits. Account the second
 // canvas and one-time detached display before creating any persistent preview.
 constexpr std::size_t limit=256*1024*1024;std::size_t used=0;auto account=[&](std::size_t count){if(count>(limit-used)/sizeof(Pixel))throw std::length_error("Tilemap preview exceeds document pixel budget");used+=count*sizeof(Pixel);};
 for(const auto& c:state.cels)if(c.surface)account(c.surface->pixels.size());for(const auto& t:state.tilesets)account(t.pixels.size());const auto count=std::size_t(width_)*height_;account(count);account(count);
 const bool shared=(tileSelection_.mode==tiles::Mode::Hybrid||tileSelection_.mode==tiles::Mode::Edit)&&!tiles::transparentPlaceholder(*set);
 if(shared){for(const auto& c:state.cels)if(c.surface)account(c.surface->pixels.size());for(const auto& t:state.tilesets)account(t.pixels.size());}
 auto baseline=sparseFillCanvas(*resolved.surface);options.gapClosing=false;std::optional<SelectionMask> region;
 if(!shape){const auto reference=options.visibleLayers?compositeNormalRegion(timeline_,frame().id,{0,0,width_,height_}):std::vector<Pixel>{};region=magicWandSelection(options.visibleLayers?reference:baseline,width_,height_,seed.x,seed.y,options);if(!region)return false;}
 GradientPreview pending{seed,cel().id,layer().id,frame().id,baseline,selection_,std::move(region),options,contentRevision_,shape};pending.tilemap=true;pending.tilemapMode=tileSelection_.mode;pending.tilemapBaseline=std::move(baseline);if(shared){
  // Native gesture-local cache of legacy captureTilesetTileReferences semantics.
  std::size_t references=0;for(const auto& c:state.cels)if(c.tilemap)for(const auto& cell:c.tilemap->cells)if(cell&&cell->tilesetId==set->id)++references;
  account(references*16);
  pending.tilemapDisplay=timeline::Timeline(state);
  for(std::size_t ci=0;ci<state.cels.size();++ci){const auto& c=state.cels[ci];if(c.tilemap&&c.surface)for(std::size_t i=0;i<c.tilemap->cells.size();++i){const auto& cell=c.tilemap->cells[i];if(cell&&cell->tilesetId==set->id)pending.tilemapReferences[cell->tileId].push_back({ci,i});}}
 }gradient_=std::move(pending);++gradientRevision_;return true;
}
void Document::publishTilemapPreview(){if(gradient_)publishTilemapPreview(*gradient_);}
void Document::publishTilemapPreview(GradientPreview& g){
 if(!g.tilemapDisplay)return;auto display=*g.tilemapDisplay;auto previewTileIds=g.previewTileIds;auto tilemapRegions=g.tilemapRegions;auto tilemapRawRegion=g.tilemapRawRegion;auto& state=display.state_;const auto& sourceState=timeline_.state();
 const auto& original=*std::find_if(sourceState.tilesets.begin(),sourceState.tilesets.end(),[&](const auto& t){return t.id==layer().tilemapTilesetId;});auto& target=*std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& t){return t.id==original.id;});
 const auto& grid=*timeline_.resolveSurface(g.celId).source->tilemap;const tiles::Index sourceIndex(original);std::map<std::string,std::vector<Pixel>> originals,modified;
 const PixelRegion current=g.region?PixelRegion{g.region->x,g.region->y,g.region->width,g.region->height}:PixelRegion{};
 auto visitCells=[&](PixelRegion r,const auto& visit){if(r.empty())return;const int left=std::max(0,r.x)/grid.tileWidth,top=std::max(0,r.y)/grid.tileHeight,right=std::min(grid.columns,(std::min(width_,r.x+r.w)+grid.tileWidth-1)/grid.tileWidth),bottom=std::min(grid.rows,(std::min(height_,r.y+r.h)+grid.tileHeight-1)/grid.tileHeight);for(int y=top;y<bottom;++y)for(int x=left;x<right;++x)visit(std::size_t(y)*grid.columns+x);};
 visitCells(current,[&](std::size_t index){const auto& cell=grid.cells[index];if(!cell||cell->tilesetId!=original.id)return;const auto source=sourceIndex.find(cell->tileId);if(!source)return;const int left=int(index%grid.columns)*grid.tileWidth,top=int(index/grid.columns)*grid.tileHeight;
  for(int y=0;y<grid.tileHeight&&top+y<height_;++y)for(int x=0;x<grid.tileWidth&&left+x<width_;++x){const auto at=std::size_t(top+y)*width_+left+x;if(g.preview[at]==g.tilemapBaseline[at])continue;auto it=originals.find(cell->tileId);if(it==originals.end())it=originals.emplace(cell->tileId,tiles::readTile(original,*source)).first;auto mapped=tiles::sourcePoint(x,y,grid.tileWidth,grid.tileHeight,*cell);auto edit=modified.find(cell->tileId);if(edit==modified.end())edit=modified.emplace(cell->tileId,it->second).first;edit->second[std::size_t(mapped.second)*grid.tileWidth+mapped.first]=g.preview[at];}
 });
 std::set<std::string> affected(previewTileIds.begin(),previewTileIds.end());for(const auto& entry:modified)affected.insert(entry.first);
 for(const auto& id:affected){auto edit=modified.find(id);if(edit!=modified.end())tiles::writeTile(target,id,edit->second);else if(auto index=sourceIndex.find(id))tiles::writeTile(target,id,tiles::readTile(original,*index));}
 previewTileIds.clear();tilemapRegions.clear();for(const auto& entry:modified)previewTileIds.push_back(entry.first);
 auto addRegion=[&](PixelRegion r){const int left=std::clamp(r.x,0,width_),top=std::clamp(r.y,0,height_),right=std::clamp(r.x+r.w,0,width_),bottom=std::clamp(r.y+r.h,0,height_);if(right<=left||bottom<=top)return;r={left,top,right-left,bottom-top};for(const auto& old:tilemapRegions)if(old.x==r.x&&old.y==r.y&&old.w==r.w&&old.h==r.h)return;if(tilemapRegions.size()<256)tilemapRegions.push_back(r);else{auto& bounds=tilemapRegions.front();bounds.include(r.x,r.y);bounds.include(r.x+r.w-1,r.y+r.h-1);for(std::size_t i=1;i<tilemapRegions.size();++i){const auto old=tilemapRegions[i];bounds.include(old.x,old.y);bounds.include(old.x+old.w-1,old.y+old.h-1);}tilemapRegions.resize(1);}};
 tiles::Catalog catalog(state.tilesets);std::set<std::size_t> changedCels;
 for(const auto& id:affected){const auto references=g.tilemapReferences.find(id);if(references==g.tilemapReferences.end())continue;for(const auto& ref:references->second){auto& c=state.cels[ref.first];const auto& map=*c.tilemap;const auto index=ref.second;const auto& cell=map.cells[index];const auto pixels=tiles::cellPixels(cell,map.tileWidth,map.tileHeight,catalog);const int left=int(index%map.columns)*map.tileWidth,top=int(index/map.columns)*map.tileHeight;for(int y=0;y<map.tileHeight;++y)std::copy_n(pixels.begin()+std::size_t(y)*map.tileWidth,map.tileWidth,c.surface->pixels.begin()+std::size_t(top+y)*c.surface->width+left);changedCels.insert(ref.first);if(modified.count(id))addRegion({c.surface->offsetX+left,c.surface->offsetY+top,map.tileWidth,map.tileHeight});}}
 if(g.tilemapMode==tiles::Mode::Hybrid){std::set<std::size_t> rawCells;visitCells(current,[&](std::size_t i){rawCells.insert(i);});visitCells(tilemapRawRegion,[&](std::size_t i){rawCells.insert(i);});const auto rawCel=display.cels_.at(g.celId);auto* surface=state.cels[rawCel].surface?&*state.cels[rawCel].surface:nullptr;if(surface)changedCels.insert(rawCel);if(surface)for(const auto index:rawCells){if(grid.cells[index]&&grid.cells[index]->tilesetId==original.id)continue;const int left=int(index%grid.columns)*grid.tileWidth,top=int(index/grid.columns)*grid.tileHeight;bool changed=false;for(int y=0;y<grid.tileHeight&&top+y<height_;++y)for(int x=0;x<grid.tileWidth&&left+x<width_;++x){const auto at=std::size_t(top+y)*width_+left+x;surface->pixels[std::size_t(top+y)*surface->width+left+x]=g.preview[at];changed|=g.preview[at]!=g.tilemapBaseline[at];}if(changed)addRegion({left,top,grid.tileWidth,grid.tileHeight});}tilemapRawRegion=current;}
 for(const auto ci:changedCels){const auto& id=state.cels[ci].id;display.selectionContent_.erase(id);display.visibleContent_.erase(id);++display.thumbnailStorage_[id].revision;}display.invalidateCompositeOrder();g.tilemapDisplay=std::move(display);g.previewTileIds.swap(previewTileIds);g.tilemapRegions.swap(tilemapRegions);g.tilemapRawRegion=tilemapRawRegion;
}
bool Document::commitTilemapPreview(){
 if(!gradient_||!tilemapPreviewValid()){cancelGradient();return false;}const auto& g=*gradient_;if(g.contentRevision!=contentRevision_||g.layerId!=layer().id||g.frameId!=frame().id||!selectionEqual(g.selection,selection_)){cancelGradient();return false;}
 const auto result=commitTilemapPixelCanvas(g.tilemapBaseline,g.preview,g.shape?U"绘制形状":U"渐变");if(!result)cancelGradient();return result;
}
}

namespace moon {
bool Document::tilemapCellOwnerSupported(const std::string& celId,bool allowOffset,bool allowLinkedCels)const{
 const auto* selected=timeline_.findCelById(celId);if(!selected)return false;
 const auto resolved=timeline_.resolveSurface(celId);if(resolved.issue!=timeline::LinkIssue::None||!resolved.source||!resolved.surface)return false;
 const auto* owner=allowLinkedCels?resolved.source:selected;
 if(!owner->tilemap||!owner->surface||owner->linkedCelId||owner->runtimeSharedCelId)return false;
 if(selected->layerId!=owner->layerId||selected->runtimeSharedCelId)return false;
 const auto& l=timeline_.state().layers[timeline_.layerIndex(owner->layerId)];if(l.kind!="tilemap"||!l.linkedContentId.empty())return false;
 const auto& g=*owner->tilemap;const auto& surface=*owner->surface;
 if((!allowOffset&&(surface.offsetX||surface.offsetY))||surface.width!=g.columns*g.tileWidth||surface.height!=g.rows*g.tileHeight||surface.pixels.size()!=std::size_t(surface.width)*surface.height)return false;
 for(const auto& other:timeline_.state().cels)if(other.id!=owner->id){const auto r=timeline_.resolveSurface(other.id);if(r.source&&r.source->id==owner->id){
  // Only explicit same-layer links without private cache/runtime aliases share this owner.
  if(!allowLinkedCels||r.issue!=timeline::LinkIssue::None||other.layerId!=owner->layerId||!other.linkedCelId||other.runtimeSharedCelId||other.surface)return false;
  auto* cursor=&other;std::size_t steps=0;while(cursor->id!=owner->id){if(++steps>timeline_.state().cels.size()||cursor->layerId!=owner->layerId||cursor->runtimeSharedCelId||!cursor->linkedCelId||cursor->surface)return false;cursor=timeline_.findCelById(*cursor->linkedCelId);if(!cursor)return false;}
 }else if(r.surface&&r.surface->pixels.identity()==surface.pixels.identity())return false;}
 return true;
}

bool Document::tilemapDeltaSupported()const{
 // Preserve the old normalization behavior for unusual imported cache/link
 // layouts. Ordinary native create/convert grids use this incremental path.
 if(timeline_.hasLinkedLayers())return false;
 std::set<const void*> owners;
 for(const auto& c:timeline_.state().cels){const auto& l=timeline_.state().layers[timeline_.layerIndex(c.layerId)];if(l.kind!="tilemap")continue;if(!c.tilemap||!c.surface||c.linkedCelId||c.runtimeSharedCelId)return false;const auto& g=*c.tilemap;const auto& r=*c.surface;if(r.offsetX||r.offsetY||r.width!=g.columns*g.tileWidth||r.height!=g.rows*g.tileHeight||r.pixels.size()!=std::size_t(r.width)*r.height||!owners.insert(r.pixels.identity()).second)return false;}
 return true;
}
std::size_t Document::TilemapPixelHistory::bytes()const{
 // Native owned representations of legacy tilemapTilesetEditBytes.
 std::size_t size=sizeof(TilemapPixelHistory)+celId.size();
 for(const auto* set:{&beforeSet,&afterSet}){size+=sizeof(tiles::Tileset)+set->id.size()+set->name.size()*sizeof(char32_t)+set->pixels.size()*sizeof(Pixel);for(const auto& id:set->tileIds)size+=sizeof(std::string)+id.size();for(const auto& slot:set->tileSlots)size+=sizeof(slot)+(slot?slot->size():0);}
 for(const auto& c:cells){size+=sizeof(CellChange);for(const auto* cell:{&c.before,&c.after})if(*cell)size+=(*cell)->tilesetId.size()+(*cell)->tileId.size();}
 for(const auto& id:changedTileIds)size+=sizeof(std::string)+id.size();return size;
}
void Document::applyTilemapPixelHistory(const Edit& edit,bool forward){
 const auto& h=*edit.tilemapPixels;auto& state=timeline_.state_;auto set=std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& value){return value.id==h.beforeSet.id;});const auto owner=timeline_.cels_.find(h.celId);
 if(set==state.tilesets.end()||owner==timeline_.cels_.end()||!state.cels[owner->second].tilemap||!((h.linkedEditSelection||h.linkedHybridSelection)?(h.tilesetEdit&&tilemapCellOwnerSupported(h.celId,false,true)&&raster::fullCanvas(*state.cels[owner->second].surface,width_,height_)&&tilemapPixelReferenceOwnersSupported(h.beforeSet.id)):(h.linkedCreateSelection?(h.tilesetEdit&&tilemapCellOwnerSupported(h.celId,false,true)&&raster::fullCanvas(*state.cels[owner->second].surface,width_,height_)):(h.independentCellOwner&&!h.tilesetEdit?tilemapCellOwnerSupported(h.celId,h.cellOffsetLayout,h.linkedCellOwner):tilemapDeltaSupported()))))throw std::logic_error("Invalid incremental tilemap history target");
 const auto ownerIndex=owner->second;auto& grid=*state.cels[ownerIndex].tilemap;
 // Every allocation and validation precedes the first authority mutation.
 std::optional<tiles::Tileset> stagedSet;if(h.tilesetEdit)stagedSet=forward?h.afterSet:h.beforeSet;
 struct CellValue{std::size_t index;std::optional<tiles::Cell> value;};std::vector<CellValue> cells;cells.reserve(h.cells.size());
 for(const auto& c:h.cells){if(c.index>=grid.cells.size())throw std::logic_error("Invalid incremental tile cell index");cells.push_back({c.index,forward?c.after:c.before});}
 std::sort(cells.begin(),cells.end(),[](const auto& a,const auto& b){return a.index<b.index;});
 auto cellValue=[&](std::size_t ci,std::size_t index)->const std::optional<tiles::Cell>&{if(ci==ownerIndex){const auto found=std::lower_bound(cells.begin(),cells.end(),index,[](const auto& a,std::size_t i){return a.index<i;});if(found!=cells.end()&&found->index==index)return found->value;}return state.cels[ci].tilemap->cells[index];};
 tiles::Catalog catalog(state.tilesets);if(stagedSet){catalog.sets[stagedSet->id]=&*stagedSet;catalog.indexes.insert_or_assign(stagedSet->id,tiles::Index(*stagedSet));}
 const std::set<std::string> changedIds(h.changedTileIds.begin(),h.changedTileIds.end());
 struct CachePatch{std::size_t cel,index;std::vector<Pixel> pixels;};std::vector<CachePatch> patches;std::set<std::size_t> changedCels;
 for(std::size_t ci=0;ci<state.cels.size();++ci){const auto& c=state.cels[ci];if(!c.tilemap||!c.surface)continue;std::set<std::size_t> indexes;if(ci==ownerIndex)for(const auto& value:cells)indexes.insert(value.index);
  if(!changedIds.empty())for(std::size_t index=0;index<c.tilemap->cells.size();++index){const auto& value=cellValue(ci,index);if(value&&value->tilesetId==h.beforeSet.id&&changedIds.count(value->tileId))indexes.insert(index);}
  for(const auto index:indexes){const auto& value=cellValue(ci,index);if(value){const auto entry=catalog.sets.find(value->tilesetId);if(entry==catalog.sets.end()||entry->second->tileWidth!=c.tilemap->tileWidth||entry->second->tileHeight!=c.tilemap->tileHeight||!catalog.indexes.at(value->tilesetId).find(value->tileId))throw std::logic_error("Invalid incremental tile reference");}patches.push_back({ci,index,tiles::cellPixels(value,c.tilemap->tileWidth,c.tilemap->tileHeight,catalog)});changedCels.insert(ci);}
 }
 auto pixelsSelection=edit.pixelSelectionEdit?(forward?edit.afterPixelsSelection:edit.beforePixelsSelection):std::optional<SelectionMask>{};
 auto selected=forward?*edit.afterTileSelection:*edit.beforeTileSelection;auto active=forward?edit.afterActive:edit.beforeActive;auto frame=forward?edit.afterFrame:edit.beforeFrame;auto frames=forward?*edit.afterSelection:*edit.beforeSelection;auto selection=forward?*edit.afterTimelineSelection:*edit.beforeTimelineSelection;auto anchor=forward?*edit.afterFrameAnchor:*edit.beforeFrameAnchor;auto groupUi=forward?*edit.afterGroupUi:*edit.beforeGroupUi;
 if(!timeline_.hasLayer(active)||!timeline_.hasFrame(frame))throw std::logic_error("Missing tilemap history activity");
 std::vector<double> opacities;opacities.reserve(state.layers.size());for(const auto& layer:state.layers)opacities.push_back(frameCelOpacity(timeline_,layer,frame));
 // Prime only affected cache stamps before the nonthrowing apply phase.
 for(const auto ci:changedCels)timeline_.thumbnailStorage(state.cels[ci].id);
 if(stagedSet)*set=std::move(*stagedSet);for(auto& value:cells)grid.cells[value.index].swap(value.value);
 for(const auto& patch:patches){auto& c=state.cels[patch.cel];const auto& map=*c.tilemap;const auto left=patch.index%map.columns*map.tileWidth,top=patch.index/map.columns*map.tileHeight;auto& pixels=static_cast<std::vector<Pixel>&>(c.surface->pixels);for(int y=0;y<map.tileHeight;++y)std::copy_n(patch.pixels.begin()+std::size_t(y)*map.tileWidth,map.tileWidth,pixels.begin()+(top+y)*c.surface->width+left);++tilemapCacheCellWrites_;}
 for(const auto ci:changedCels){const auto& id=state.cels[ci].id;timeline_.selectionContent_.erase(id);timeline_.visibleContent_.erase(id);++timeline_.thumbnailStorage_.at(id).revision;}
 tileSelection_=std::move(selected);activeLayerId_=std::move(active);activeFrameId_=std::move(frame);selectedFrames_=std::move(frames);timelineSelection_=std::move(selection);frameAnchor_=std::move(anchor);selectedGroupIds_=std::move(groupUi.selected);collapsedGroupIds_=std::move(groupUi.collapsed);selectedGroupId_=std::move(groupUi.focus);for(std::size_t i=0;i<state.layers.size();++i)state.layers[i].opacity=opacities[i];
 if(edit.pixelSelectionEdit)selection_=std::move(pixelsSelection);
 // Keep the established history/recording invalidation contract. Cache pixels,
 // storage identities and topology are updated locally, without buildIndex.
 change_={0,0,width_,height_};
}
bool Document::commitTilemapPixelCanvas(const std::vector<Pixel>& baseline,const std::vector<Pixel>& canvas,std::u32string label,std::optional<std::size_t> editCell,bool clearPixelSelection,const std::optional<SelectionMask>* beforePixels,const std::optional<SelectionMask>* afterPixels,bool linkedCreateSelection,bool linkedEditSelection,bool linkedHybridSelection,bool linkedCreateFloating,bool linkedEditFloating,bool linkedHybridFloating){
 struct TileIdGuard{std::uint64_t& value;std::uint64_t before;bool applied=false;~TileIdGuard(){if(!applied)value=before;}} ids{nextTileId_,nextTileId_};
 if((linkedCreateSelection&&!linkedCreateSelectionAvailable())||(linkedEditSelection&&!linkedEditSelectionAvailable())||(linkedHybridSelection&&!linkedHybridSelectionAvailable())||(linkedCreateFloating&&(!beforePixels||!afterPixels||!linkedCreateSelectionAvailable(false)))||(linkedEditFloating&&(!beforePixels||!afterPixels||!editCell||!linkedEditSelectionAvailable(false)))||(linkedHybridFloating&&(!beforePixels||!afterPixels||!linkedHybridSelectionAvailable(false)))||(int(linkedCreateSelection)+int(linkedEditSelection)+int(linkedHybridSelection)+int(linkedCreateFloating)+int(linkedEditFloating)+int(linkedHybridFloating)>1))return false;const bool linkedPixelSelection=linkedCreateSelection||linkedEditSelection||linkedHybridSelection||linkedCreateFloating||linkedEditFloating||linkedHybridFloating;const auto* target=linkedPixelSelection?timeline_.resolveSurface(cel().id).source:&cel();const auto count=std::size_t(width_)*height_;if(baseline.size()!=count||canvas.size()!=count||!target||!target->tilemap)return false;
 const auto& state=timeline_.state();const auto set=std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& t){return t.id==layer().tilemapTilesetId;});if(set==state.tilesets.end())return false;
 const auto& sourceGrid=*target->tilemap;auto nextGrid=sourceGrid;auto nextSet=*set;auto before=tiles::render(sourceGrid,state.tilesets),after=before;const auto stride=std::size_t(sourceGrid.columns)*sourceGrid.tileWidth;std::vector<std::size_t> indexes;
 for(int y=0;y<std::min(height_,sourceGrid.rows*sourceGrid.tileHeight);++y)for(int x=0;x<std::min(width_,sourceGrid.columns*sourceGrid.tileWidth);++x){const auto at=std::size_t(y)*width_+x;if(canvas[at]==baseline[at])continue;after[std::size_t(y)*stride+x]=canvas[at];indexes.push_back(std::size_t(y/sourceGrid.tileHeight)*sourceGrid.columns+x/sourceGrid.tileWidth);}
 if(indexes.empty())return false;std::sort(indexes.begin(),indexes.end());indexes.erase(std::unique(indexes.begin(),indexes.end()),indexes.end());std::vector<std::string> changed;
 if(!tiles::applyPixelEdit(nextGrid,nextSet,before,after,tileSelection_.mode,indexes,[&]{return uniqueTileId("tile");},editCell,&changed))return false;
 auto selected=tileSelection_;if(!changed.empty()){selected.tilesetId=nextSet.id;selected.primary=changed.back();if(!tiles::Index(nextSet).find(selected.secondary))selected.secondary=selected.primary;}
 if(!tilemapDeltaSupported()&&!linkedPixelSelection){auto next=state;next.cels[timeline_.cels_.at(cel().id)].tilemap=std::move(nextGrid);*std::find_if(next.tilesets.begin(),next.tilesets.end(),[&](const auto& t){return t.id==nextSet.id;})=std::move(nextSet);ids.applied=true;cancelGradient();return commitTilemapState(std::move(next),selected,std::move(label),{},clearPixelSelection);}
 Edit edit{{},state_,nextState_};TilemapPixelHistory payload;payload.celId=target->id;payload.linkedCreateSelection=linkedCreateSelection||linkedCreateFloating;payload.linkedEditSelection=linkedEditSelection||linkedEditFloating;payload.linkedHybridSelection=linkedHybridSelection||linkedHybridFloating;payload.beforeSet=*set;payload.afterSet=std::move(nextSet);payload.changedTileIds=std::move(changed);for(const auto i:indexes)if(sourceGrid.cells[i]!=nextGrid.cells[i])payload.cells.push_back({i,sourceGrid.cells[i],std::move(nextGrid.cells[i])});edit.tilemapPixels=std::make_shared<const TilemapPixelHistory>(std::move(payload));
 edit.beforeTileSelection=tileSelection_;edit.afterTileSelection=std::move(selected);edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeFrameAnchor=edit.afterFrameAnchor=frameAnchor_;edit.beforeGroupUi=edit.afterGroupUi=GroupUiSnapshot{selectedGroupIds_,collapsedGroupIds_,selectedGroupId_};
 if(beforePixels&&afterPixels){edit.pixelSelectionEdit=true;edit.beforePixelsSelection=*beforePixels;edit.afterPixelsSelection=*afterPixels;}else if(clearPixelSelection){edit.pixelSelectionEdit=true;edit.beforePixelsSelection=selection_;edit.afterPixelsSelection.reset();}
 history_.reserve(position_+1);edit.label.reserve(std::max(label.size(),historyLabelOverride_.size()));applyEdit(edit,true);ids.applied=true;cancelGradient();publishChange();pushEdit(std::move(edit),std::move(label));return true;
}
bool Document::tilemapPixelReferenceOwnersSupported(const std::string& tilesetId)const{
 // Preflight every reference before publishing an Edit source tile. No cache normalization.
 for(const auto& c:timeline_.state().cels){const auto r=timeline_.resolveSurface(c.id);if(!r.source||!r.source->tilemap)continue;bool affected=false;for(const auto& cell:r.source->tilemap->cells)if(cell&&cell->tilesetId==tilesetId){affected=true;break;}if(affected&&!tilemapCellOwnerSupported(c.id,false,true))return false;}
 return true;
}
bool Document::linkedHybridSelectionAvailable(bool requireSelection)const{
 // Hybrid source edits preflight every reference owner before the gesture and publication.
 if((requireSelection&&!selection_)||active()||!activeMaskId_.empty()||layer().kind!="tilemap"||tileSelection_.mode!=tiles::Mode::Hybrid||hasSelectedGroups()||!tilemapCellOwnerSupported(cel().id,false,true)||!raster::fullCanvas(activeSurface(),width_,height_)||!tilemapPixelReferenceOwnersSupported(layer().tilemapTilesetId))return false;
 if(std::any_of(timeline_.state().layers.begin(),timeline_.state().layers.end(),[](const auto& l){return l.kind=="free-tile";}))return false;
 const auto layers=selectedLayerIdsWithGroups();if(layers.size()>1||(!layers.empty()&&layers.front()!=activeLayerId_)||!selectedFrames_.empty()||timelineSelection_.cels.size()>1||(!timelineSelection_.cels.empty()&&timelineSelection_.cels.front()!=cel().id))return false;
 const auto owner=timeline_.resolveSurface(cel().id).source->id;for(const auto& c:timeline_.state().cels)if(c.id!=owner&&c.linkedCelId){const auto r=timeline_.resolveSurface(c.id);if(r.source&&r.source->id==owner)return true;}return false;
}
bool Document::linkedEditSelectionAvailable(bool requireSelection)const{
 // Static Delete/Cut use all changed cells; the pointer Edit anchor is not involved.
 if((requireSelection&&!selection_)||active()||!activeMaskId_.empty()||layer().kind!="tilemap"||tileSelection_.mode!=tiles::Mode::Edit||hasSelectedGroups()||!tilemapCellOwnerSupported(cel().id,false,true)||!raster::fullCanvas(activeSurface(),width_,height_)||!tilemapPixelReferenceOwnersSupported(layer().tilemapTilesetId))return false;
 if(std::any_of(timeline_.state().layers.begin(),timeline_.state().layers.end(),[](const auto& l){return l.kind=="free-tile";}))return false;
 const auto layers=selectedLayerIdsWithGroups();if(layers.size()>1||(!layers.empty()&&layers.front()!=activeLayerId_)||!selectedFrames_.empty()||timelineSelection_.cels.size()>1||(!timelineSelection_.cels.empty()&&timelineSelection_.cels.front()!=cel().id))return false;
 const auto owner=timeline_.resolveSurface(cel().id).source->id;for(const auto& c:timeline_.state().cels)if(c.id!=owner&&c.linkedCelId){const auto r=timeline_.resolveSurface(c.id);if(r.source&&r.source->id==owner)return true;}return false;
}
bool Document::linkedCreateSelectionAvailable(bool requireSelection)const{
 // Narrow static Create adapter: resolved same-layer explicit chain, zero origin/full canvas.
 if((requireSelection&&!selection_)||active()||!activeMaskId_.empty()||layer().kind!="tilemap"||tileSelection_.mode!=tiles::Mode::Create||hasSelectedGroups()||!tilemapCellOwnerSupported(cel().id,false,true)||!raster::fullCanvas(activeSurface(),width_,height_))return false;
 if(std::any_of(timeline_.state().layers.begin(),timeline_.state().layers.end(),[](const auto& l){return l.kind=="free-tile";}))return false;
 const auto layers=selectedLayerIdsWithGroups();if(layers.size()>1||(!layers.empty()&&layers.front()!=activeLayerId_)||!selectedFrames_.empty()||timelineSelection_.cels.size()>1||(!timelineSelection_.cels.empty()&&timelineSelection_.cels.front()!=cel().id))return false;
 const auto owner=timeline_.resolveSurface(cel().id).source->id;
 for(const auto& c:timeline_.state().cels)if(c.id!=owner&&c.linkedCelId){const auto r=timeline_.resolveSurface(c.id);if(r.source&&r.source->id==owner)return true;}
 return false;
}
bool Document::tilemapSelectionTransformAvailable()const{
 // Create/Edit/Hybrid canonical-layout migration; Paint floating remains pending.
 return ((tilemapDeltaSupported()&&tilemapSelectionCutAvailable())||linkedCreateSelectionAvailable()||linkedEditSelectionAvailable()||linkedHybridSelectionAvailable())&&(tileSelection_.mode==tiles::Mode::Create||tileSelection_.mode==tiles::Mode::Edit||tileSelection_.mode==tiles::Mode::Hybrid)&&!layerEffectivelyLocked(layer())&&layerEffectivelyVisible(layer())&&raster::fullCanvas(activeSurface(),width_,height_);
}
bool Document::tilemapSelectionCutAvailable()const{
 // Already supported mixed-document clipboard paste keeps legacy copy/cancel-only Cut.
 if(selection_&&activeMaskId_.empty()&&floating_&&floating_->clipboard&&!floating_->tilemap&&floating_->maskId.empty()&&layer().kind.empty())return true;
 const bool createPending=floating_&&floating_->tilemap&&tileSelection_.mode==floating_->tilemapMode&&(floating_->tilemapMode==tiles::Mode::Create||floating_->tilemapMode==tiles::Mode::Edit||floating_->tilemapMode==tiles::Mode::Hybrid);
 // Paint Cut only copies the resolved source and completes selection; its
 // pixel deletion is rejected by legacy. Explicit same-layer chains are read-only here.
 const bool paintCopyOnly=tileSelection_.mode==tiles::Mode::Paint&&!active()&&tilemapCellOwnerSupported(cel().id,true,true);
 if(!selection_||(active()&&!createPending)||!activeMaskId_.empty()||layer().kind!="tilemap"||hasSelectedGroups()||!(paintCopyOnly||(floating_&&(linkedCreateFloatingSupported(*floating_)||linkedEditFloatingSupported(*floating_)||linkedHybridFloatingSupported(*floating_)))||linkedCreateSelectionAvailable()||linkedEditSelectionAvailable()||linkedHybridSelectionAvailable()||tilemapDeltaSupported()))return false;
 if(std::any_of(timeline_.state().layers.begin(),timeline_.state().layers.end(),[](const auto& l){return l.kind=="free-tile";}))return false;
 const auto layers=selectedLayerIdsWithGroups();if(layers.size()>1||(!layers.empty()&&layers.front()!=activeLayerId_))return false;
 if(!selectedFrames_.empty())return false;
 if(timelineSelection_.cels.size()>1||(!timelineSelection_.cels.empty()&&timelineSelection_.cels.front()!=cel().id))return false;
 return true;
}
bool Document::tilemapPaintSelectionDeleteBlocked()const{
 // legacy tools-fill.clearSelection first tests lock/content intersection; only
 // an edit reaching commitPixelEdit produces Paint's rasterization message.
 if(tileSelection_.mode!=tiles::Mode::Paint||!tilemapSelectionCutAvailable()||layerEffectivelyLocked(layer()))return false;
 const auto clamped=rectangleSelection(selection_->x,selection_->y,selection_->width,selection_->height,width_,height_);if(!clamped)return false;
 const auto pixels=canvasPixels();int left=width_,top=height_,right=-1,bottom=-1;
 for(int y=0;y<height_;++y)for(int x=0;x<width_;++x)if(pixels[std::size_t(y)*width_+x]>>24){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x);bottom=std::max(bottom,y);}
 if(right<left)return false;left=std::max(left,clamped->x);top=std::max(top,clamped->y);right=std::min(right,clamped->x+clamped->width-1);bottom=std::min(bottom,clamped->y+clamped->height-1);if(right<left||bottom<top)return false;
 if(!selection_->mask.empty())return true;
 for(int y=top;y<=bottom;++y)for(int x=left;x<=right;++x)if(pixels[std::size_t(y)*width_+x]!=0)return true;
 return false;
}
bool Document::deleteTilemapSelectionPixels(){
 if(!selection_||active()||!activeMaskId_.empty()||layer().kind!="tilemap"||tileSelection_.mode==tiles::Mode::Paint||layerEffectivelyLocked(layer()))return false;
 if(std::any_of(timeline_.state().layers.begin(),timeline_.state().layers.end(),[](const auto& l){return l.kind=="free-tile";}))return false;
 const bool linkedCreate=linkedCreateSelectionAvailable(),linkedEdit=linkedEditSelectionAvailable(),linkedHybrid=linkedHybridSelectionAvailable();if(!tilemapDeltaSupported()&&!linkedCreate&&!linkedEdit&&!linkedHybrid)return false;
 const auto clamped=rectangleSelection(selection_->x,selection_->y,selection_->width,selection_->height,width_,height_);if(!clamped)return false;
 const auto baseline=canvasPixels();auto canvas=baseline;int left=width_,top=height_,right=-1,bottom=-1;
 for(int y=0;y<height_;++y)for(int x=0;x<width_;++x)if(baseline[std::size_t(y)*width_+x]>>24){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x);bottom=std::max(bottom,y);}
 if(right<left)return false;left=std::max(left,clamped->x);top=std::max(top,clamped->y);right=std::min(right,clamped->x+clamped->width-1);bottom=std::min(bottom,clamped->y+clamped->height-1);
 for(int y=top;y<=bottom;++y)for(int x=left;x<=right;++x)if(selectionContains(selection_,x,y))canvas[std::size_t(y)*width_+x]=0;
 return commitTilemapPixelCanvas(baseline,canvas,U"删除选区",{},true,nullptr,nullptr,linkedCreate,linkedEdit,linkedHybrid);
}

}


namespace moon {
namespace {
Point freeSourceInverse(const free_tiles::Instance& i,int x,int y){
 if(i.flipHorizontal)x=-x-1;if(i.flipVertical)y=-y-1;
 const int a=x,b=y;switch(i.rotation){case 1:x=b;y=-a-1;break;case 2:x=-a-1;y=-b-1;break;case 3:x=-b-1;y=a;break;}return {x,y};
}
std::vector<Point> freeSourceLinePoints(Point from,Point to,bool balanced){
 if(!balanced){std::vector<Point> points;int x=from.x,y=from.y;const int dx=std::abs(to.x-from.x),dy=std::abs(to.y-from.y),sx=from.x<to.x?1:-1,sy=from.y<to.y?1:-1;int error=dx-dy;for(;;){points.push_back({x,y});if(x==to.x&&y==to.y)break;const int twice=2*error;if(twice>-dy){error-=dy;x+=sx;}if(twice<dx){error+=dx;y+=sy;}}return points;}
 const int deltaX=std::abs(to.x-from.x),deltaY=std::abs(to.y-from.y);const bool xMajor=deltaX>=deltaY,reverse=xMajor?from.x>to.x:from.y>to.y;const Point start=reverse?to:from,end=reverse?from:to;const int majorLength=(xMajor?std::abs(end.x-start.x):std::abs(end.y-start.y))+1,minorSteps=xMajor?std::abs(end.y-start.y):std::abs(end.x-start.x),stairCount=minorSteps+1,minorDirection=xMajor?(end.y>=start.y?1:-1):(end.x>=start.x?1:-1);std::vector<Point> points;points.reserve(std::size_t(majorLength));int majorOffset=0;
 for(int stair=0;stair<stairCount;++stair){const int stairEnd=int(std::floor(double((stair+1)*majorLength)/stairCount));while(majorOffset<stairEnd){points.push_back(xMajor?Point{start.x+majorOffset,start.y+stair*minorDirection}:Point{start.x+stair*minorDirection,start.y+majorOffset});++majorOffset;}}
 if(reverse)std::reverse(points.begin(),points.end());return points;
}
const free_tiles::Source* freeSourceFor(const free_tiles::LayerData& data,const free_tiles::Instance& i){
 const auto& id=i.sourceId.empty()?i.tileId:i.sourceId;auto at=std::find_if(data.sources.begin(),data.sources.end(),[&](const auto& source){return source.id==id||source.tilesetId==id;});return at==data.sources.end()?nullptr:&*at;
}
const tiles::Tileset* freeSourceSet(const timeline::State& state,const std::string& id){auto it=std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& t){return t.id==id;});return it==state.tilesets.end()?nullptr:&*it;}
const free_tiles::Instance* freeSourceHit(const timeline::State& state,const DocumentLayer& layer,const DocumentCel& cel,Point point){
 if(!layer.freeTiles||!cel.freeTiles||!cel.surface)return nullptr;
 for(auto it=cel.freeTiles->instances.rbegin();it!=cel.freeTiles->instances.rend();++it){if(!it->visible)continue;const auto source=freeSourceFor(*layer.freeTiles,*it);if(!source)continue;const auto set=freeSourceSet(state,source->tilesetId);if(!set)continue;const auto p=freeSourceInverse(*it,point.x-cel.surface->offsetX-it->x,point.y-cel.surface->offsetY-it->y);if(p.x>=source->offsetX&&p.y>=source->offsetY&&p.x<source->offsetX+set->tileWidth&&p.y<source->offsetY+set->tileHeight)return &*it;}
 return nullptr;
}
}
// Legacy workspace-free-tile-selection + canvas-input-free-tile. Selection is
// session state; placement history contains the target cel, never source pixels.
void Document::setFreeTilePaintMode(bool paint){
 if(active())return;
 tileSelection_.freePaint=paint;
 const auto clear=[&]{freeInstanceSelected_.clear();freeInstancePrimary_.clear();freeInstanceAnchor_.clear();freeInstanceSelectionFrame_=activeFrameId_;};
 if(paint){clear();return;}
 // workspace-commands-free-tile.setFreeTileMode: retain an editable primary,
 // then prefer the selected source, then the first editable stored instance.
 const auto* slot=timeline_.findCel(activeLayerId_,activeFrameId_);
 if(!activeMaskId_.empty()||layer().kind!="free-tile"||!layer().freeTiles||!slot||!slot->freeTiles){clear();return;}
 const auto& data=*layer().freeTiles;const auto& instances=slot->freeTiles->instances;
 const auto editable=[&](const auto& i){const auto* s=freeSourceFor(data,i);return i.visible&&!i.locked&&s&&s->visible&&!s->locked;};
 auto chosen=std::find_if(instances.begin(),instances.end(),[&](const auto& i){return editable(i)&&freeInstanceSelectionFrame_==activeFrameId_&&i.id==freeInstancePrimary_;});
 if(chosen==instances.end())chosen=std::find_if(instances.begin(),instances.end(),[&](const auto& i){const auto* s=freeSourceFor(data,i);return editable(i)&&(i.sourceId==tileSelection_.tilesetId||s->tilesetId==tileSelection_.tilesetId);});
 if(chosen==instances.end())chosen=std::find_if(instances.begin(),instances.end(),editable);
 if(chosen==instances.end()){clear();return;}
 const auto* source=freeSourceFor(data,*chosen);const auto* set=freeSourceSet(timeline_.state(),source->tilesetId);
 if(!set||set->tileIds.empty()){clear();return;}
 setSelectedTile(set->id,set->tileIds.front());
 freeInstanceSelected_={chosen->id};freeInstancePrimary_=freeInstanceAnchor_=chosen->id;freeInstanceSelectionFrame_=activeFrameId_;
}
bool Document::freeTileInstanceView()const{
 return freeInstanceViewLayer_==activeLayerId_&&activeMaskId_.empty()&&layer().kind=="free-tile"&&layer().freeTiles&&!layer().freeTiles->sources.empty();
}
bool Document::setFreeTileInstanceView(bool open){
 cancelStroke();
 if(open&&(layer().kind!="free-tile"||!layer().freeTiles||layer().freeTiles->sources.empty()||!cel().freeTiles))return false;
 freeInstanceViewLayer_=open?activeLayerId_:std::string{};
 freeInstanceSelected_.clear();freeInstancePrimary_.clear();freeInstanceAnchor_.clear();freeInstanceSelectionFrame_=activeFrameId_;
 if(open){exitAttachedMask();clearTimelineSelection();selectedGroupIds_.clear();selectedGroupId_.reset();}
 return true;
}
std::vector<std::string> Document::selectedFreeTileInstances()const{
 // Source Edit mode also owns a selection without opening the instance list.
 std::vector<std::string> result;if(!activeMaskId_.empty()||layer().kind!="free-tile"||!layer().freeTiles||freeInstanceSelectionFrame_!=activeFrameId_||!cel().freeTiles)return result;
 std::unordered_set<std::string> valid;for(const auto& i:cel().freeTiles->instances)valid.insert(i.id);
 for(const auto& id:freeInstanceSelected_)if(valid.count(id))result.push_back(id);
 return result;
}
std::string Document::primaryFreeTileInstance()const{
 const auto ids=selectedFreeTileInstances();return std::find(ids.begin(),ids.end(),freeInstancePrimary_)!=ids.end()?freeInstancePrimary_:ids.empty()?std::string{}:ids.back();
}
bool Document::selectFreeTileInstance(const std::string& id,int mode){
 if(active()||!freeTileInstanceView()||!cel().freeTiles)return false;
 const auto& instances=cel().freeTiles->instances;auto item=std::find_if(instances.begin(),instances.end(),[&](const auto& i){return i.id==id;});if(item==instances.end())return false;
 auto selected=selectedFreeTileInstances();std::string primary=id,anchor=id;
 if(mode==2){
  anchor=freeInstanceSelectionFrame_==activeFrameId_?freeInstanceAnchor_:std::string{};
  auto from=std::find_if(instances.begin(),instances.end(),[&](const auto& i){return i.id==anchor;});if(from==instances.end()){anchor=selected.empty()?id:selected.front();from=std::find_if(instances.begin(),instances.end(),[&](const auto& i){return i.id==anchor;});}
  selected.clear();const auto a=std::min(from,item),b=std::max(from,item);for(auto it=b;;--it){selected.push_back(it->id);if(it==a)break;}
 }else if(mode==1){auto found=std::find(selected.begin(),selected.end(),id);if(found==selected.end())selected.push_back(id);else selected.erase(found);if(selected.empty())selected.push_back(id);if(std::find(selected.begin(),selected.end(),id)==selected.end())primary=selected.back();}
 else selected={id};
 freeInstanceSelected_=std::move(selected);freeInstancePrimary_=primary;freeInstanceAnchor_=anchor;freeInstanceSelectionFrame_=activeFrameId_;
 const auto chosen=std::find_if(instances.begin(),instances.end(),[&](const auto& i){return i.id==primary;});const auto source=freeSourceFor(*layer().freeTiles,*chosen);if(source)setSelectedTileset(source->tilesetId);tileSelection_.freePaint=false;return true;
}
bool Document::beginFreeTileInstanceFlags(bool locked){
 if(active()||!freeTileInstanceView()||!cel().freeTiles||!cel().surface)return false;
 FreeTilePlacement draft{cel(),{}};draft.flagControl=locked?1:0;freeTilePlacement_=std::move(draft);return true;
}
bool Document::beginFreeTileInstanceProperties(const std::vector<std::string>& ids){
 if(active()||!freeTileInstanceView()||!cel().freeTiles||!cel().surface)return false;
 FreeTilePlacement draft{cel(),{}};draft.flagControl=2;
 for(const auto& id:ids)if(std::find(draft.movingIds.begin(),draft.movingIds.end(),id)==draft.movingIds.end()&&std::any_of(draft.before.freeTiles->instances.begin(),draft.before.freeTiles->instances.end(),[&](const auto& i){return i.id==id;}))draft.movingIds.push_back(id);
 if(draft.movingIds.empty())return false;freeTilePlacement_=std::move(draft);return true;
}
bool Document::previewFreeTileInstanceProperties(const FreeTileInstanceChanges& changes){
 if(!freeTileInstancePropertiesActive())return false;const auto& draft=*freeTilePlacement_;
 if(activeLayerId_!=draft.before.layerId||activeFrameId_!=draft.before.frameId)return false;
 auto after=draft.before;const auto& data=*layer().freeTiles;
 // Legacy instanceAfterChanges always rebuilds the cumulative patch from the
 // transaction baseline. Position fields refer to transformed world bounds,
 // not the stored instance origin; rotation/mirror alone preserve that corner.
 const auto bounds=[&](const free_tiles::Instance& i,const free_tiles::Source& source,const tiles::Tileset& set){PixelRegion r;for(int y:{source.offsetY,source.offsetY+set.tileHeight-1})for(int x:{source.offsetX,source.offsetX+set.tileWidth-1}){const auto p=free_tiles::transform(i,x,y);r.include(after.surface->offsetX+i.x+p.first,after.surface->offsetY+i.y+p.second);}return r;};
 for(auto& i:after.freeTiles->instances){
  if(std::find(draft.movingIds.begin(),draft.movingIds.end(),i.id)==draft.movingIds.end())continue;
  const auto source=freeSourceFor(data,i);if(!source)continue;
  if(!i.locked){const auto set=freeSourceSet(timeline_.state(),source->tilesetId);if(!set)continue;const auto before=bounds(i,*source,*set);
   if(changes.rotation&&*changes.rotation>=0&&*changes.rotation<=3)i.rotation=*changes.rotation;
   if(changes.flipHorizontal)i.flipHorizontal=*changes.flipHorizontal;if(changes.flipVertical)i.flipVertical=*changes.flipVertical;
   const auto transformed=bounds(i,*source,*set);const auto x=std::int64_t(i.x)+changes.x.value_or(before.x)-transformed.x,y=std::int64_t(i.y)+changes.y.value_or(before.y)-transformed.y;
   if(std::abs(x)>free_tiles::MaxCoordinate||std::abs(y)>free_tiles::MaxCoordinate)return false;i.x=int(x);i.y=int(y);
  }
  // Own lock protects geometry only. Source/layer locks do not block these
  // properties; inherited opacity/blend stay absent when set to source values.
  if(changes.opacity&&std::isfinite(*changes.opacity)){const double value=std::clamp(*changes.opacity,0.,1.);if(i.opacity||value!=source->opacity)i.opacity=value;}
  if(changes.blendMode&&parseLayerBlendMode(*changes.blendMode)){if(i.blendMode||*changes.blendMode!=source->blendMode)i.blendMode=*changes.blendMode;}
 }
 const auto live=timeline_.findCelById(after.id);if(!live||live->freeTiles==after.freeTiles)return false;
 after.surface->pixels=free_tiles::render(data,*after.freeTiles,timeline_.state().tilesets,after.surface->width,after.surface->height);
 timeline_.state_.cels[timeline_.cels_.at(after.id)]=std::move(after);change_={0,0,width_,height_};publishChange();return true;
}
bool Document::setFreeTileInstanceProperties(const std::string& id,const FreeTileInstanceChanges& changes){
 if(!beginFreeTileInstanceProperties({id}))return false;
 previewFreeTileInstanceProperties(changes);
 const bool committed=commitFreeTilePlacement();
 if(committed)selectFreeTileInstance(id);
 return committed;
}
// Legacy workspace-commands-free-tile.reorderFreeTileInstance: display order
// is the reverse of the authoritative back-to-front instance array.
bool Document::reorderFreeTileInstance(const std::string& id,const std::string& target,bool beforeTarget){
 if(active()||!freeTileInstanceView()||!cel().freeTiles||!cel().surface||id==target)return false;
 const auto before=cel();auto after=before;auto& instances=after.freeTiles->instances;
 const auto from=std::find_if(instances.begin(),instances.end(),[&](const auto& i){return i.id==id;});
 if(from==instances.end()||from->locked||std::none_of(instances.begin(),instances.end(),[&](const auto& i){return i.id==target;}))return false;
 const auto moved=*from;instances.erase(from);
 auto to=std::find_if(instances.begin(),instances.end(),[&](const auto& i){return i.id==target;});if(beforeTarget)++to;instances.insert(to,moved);
 if(after.freeTiles==before.freeTiles)return false;
 after.surface->pixels=free_tiles::render(*layer().freeTiles,*after.freeTiles,timeline_.state().tilesets,after.surface->width,after.surface->height);
 Edit edit{{},state_,nextState_};edit.beforeCels.push_back(before);edit.afterCels.push_back(std::move(after));edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;
 history_.reserve(position_+1);applyEdit(edit,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"调整自由瓦片实例顺序");
 const auto selected=selectedFreeTileInstances();if(std::find(selected.begin(),selected.end(),id)==selected.end())selectFreeTileInstance(id);else freeInstancePrimary_=id;
 return true;
}
// Legacy workspace-free-tile-instance-clipboard.ts capture/paste semantics.
std::optional<Document::FreeTileInstanceClipboardSnapshot> Document::copyFreeTileInstances()const{
 if(active()||!freeTileInstanceView()||!cel().surface||!cel().freeTiles||!layer().freeTiles)return {};
 const auto selected=selectedFreeTileInstances();if(selected.empty())return {};
 FreeTileInstanceClipboardSnapshot clip;clip.sourceProjectId=projectId_;clip.sourceIdentity=identity_;clip.setId=layer().freeTiles->setId;clip.offsetX=cel().surface->offsetX;clip.offsetY=cel().surface->offsetY;
 std::unordered_set<std::string> sourceIds;
 for(const auto& instance:cel().freeTiles->instances)if(std::find(selected.begin(),selected.end(),instance.id)!=selected.end()){
  const auto* source=freeSourceFor(*layer().freeTiles,instance);if(!source)return {};
  auto copy=instance;copy.sourceId=source->id;clip.instances.push_back(std::move(copy));sourceIds.insert(source->id);
 }
 for(const auto& source:layer().freeTiles->sources)if(sourceIds.count(source.id)){
  clip.sources.push_back(source);const auto& sets=timeline_.state().tilesets;const auto set=std::find_if(sets.begin(),sets.end(),[&](const auto& item){return item.id==source.tilesetId;});
  if(set==sets.end())return {};if(std::none_of(clip.tilesets.begin(),clip.tilesets.end(),[&](const auto& item){return item.id==set->id;}))clip.tilesets.push_back(*set);
 }
 return clip.instances.empty()?std::nullopt:std::optional<FreeTileInstanceClipboardSnapshot>{std::move(clip)};
}
bool Document::pasteFreeTileInstances(const FreeTileInstanceClipboardSnapshot& clip){
 // Legacy activeFreeTileCelTarget accepts an ordinary free-tile layer view too.
 if(active()||layer().kind!="free-tile"||!layer().freeTiles||!cel().freeTiles||!cel().surface||layerEffectivelyLocked(layer())||!activeMaskId_.empty()||clip.instances.empty())return false;
 if(clip.instances.size()>free_tiles::MaxInstances-cel().freeTiles->instances.size())return false;
 auto next=timeline_.state();const auto original=*layer().freeTiles;auto sources=original.sources;std::unordered_map<std::string,std::string> sourceIds;
 const bool shared=clip.sourceIdentity==identity_&&clip.setId==original.setId;
 auto counter=nextTileId_;std::unordered_set<std::string> used;
 for(const auto& set:next.tilesets)used.insert(set.id);
 for(const auto& item:next.layers)if(item.freeTiles)for(const auto& source:item.freeTiles->sources)used.insert(source.id);
 for(const auto& item:next.cels)if(item.freeTiles)for(const auto& instance:item.freeTiles->instances)used.insert(instance.id);
 auto newId=[&](const char* prefix){std::string id;do{id=std::string(prefix)+"-native-"+std::to_string(identity_)+"-"+std::to_string(++counter);}while(!used.insert(id).second);return id;};
 for(const auto& source:clip.sources){
  if(sourceIds.count(source.id))return false;const auto existing=std::find_if(sources.begin(),sources.end(),[&](const auto& item){return item.id==source.id;});
  if(shared&&existing!=sources.end()){sourceIds.emplace(source.id,source.id);continue;}
  const auto sourceSet=std::find_if(clip.tilesets.begin(),clip.tilesets.end(),[&](const auto& set){return set.id==source.tilesetId;});if(sourceSet==clip.tilesets.end())return false;
  auto set=*sourceSet;set.id=newId("tileset");auto imported=source;imported.id=newId("free-tile-source");imported.tilesetId=set.id;
  sourceIds.emplace(source.id,imported.id);sources.push_back(std::move(imported));next.tilesets.push_back(std::move(set));
 }
 auto target=std::find_if(next.cels.begin(),next.cels.end(),[&](const auto& item){return item.id==cel().id;});if(target==next.cels.end())return false;
 std::vector<std::string> added;added.reserve(clip.instances.size());
 for(const auto& instance:clip.instances){
  const auto source=sourceIds.find(instance.sourceId);if(source==sourceIds.end())return false;
  const auto x=std::int64_t(instance.x)+clip.offsetX-target->surface->offsetX,y=std::int64_t(instance.y)+clip.offsetY-target->surface->offsetY;
  if(std::abs(x)>free_tiles::MaxCoordinate||std::abs(y)>free_tiles::MaxCoordinate)return false;
  auto copy=instance;copy.id=newId("free-tile-instance");copy.sourceId=source->second;copy.x=int(x);copy.y=int(y);added.push_back(copy.id);target->freeTiles->instances.push_back(std::move(copy));
 }
 for(auto& item:next.layers)if(item.freeTiles&&(item.id==activeLayerId_||(!original.setId.empty()&&item.freeTiles->setId==original.setId)))item.freeTiles->sources=sources;
 const auto targetLayer=std::find_if(next.layers.begin(),next.layers.end(),[&](const auto& item){return item.id==activeLayerId_;});if(targetLayer==next.layers.end()||!target->surface)return false;
 free_tiles::validate(*targetLayer->freeTiles,*target->freeTiles,next.tilesets);
 target->surface->pixels=free_tiles::render(*targetLayer->freeTiles,*target->freeTiles,next.tilesets,target->surface->width,target->surface->height);
 timeline::Timeline checked(next);
 Edit edit{{},state_,nextState_};edit.beforeTimeline=timeline_.state();edit.afterTimeline=std::move(next);edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;
 edit.beforeFreeTileSelection=FreeTileSelectionSnapshot{freeInstanceSelected_,freeInstancePrimary_,freeInstanceAnchor_,freeInstanceSelectionFrame_,freeInstanceViewLayer_};
 edit.afterFreeTileSelection=FreeTileSelectionSnapshot{added,added.back(),added.back(),activeFrameId_,freeInstanceViewLayer_};
 edit.pixelSelectionEdit=true;edit.beforePixelsSelection=selection_;edit.afterPixelsSelection.reset();edit.beforeTrimPivot.emplace(selectionPivotHistory_.pivot);edit.afterTrimPivot.emplace(std::nullopt);
 history_.reserve(position_+1);applyEdit(edit,true);nextTileId_=counter;change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"粘贴到图层");return true;
}
bool Document::showOnlyFreeTileInstance(const std::string& id){
 if(active()||!freeTileInstanceView()||!cel().freeTiles||!cel().surface)return false;
 const auto& instances=cel().freeTiles->instances;
 if(std::none_of(instances.begin(),instances.end(),[&](const auto& instance){return instance.id==id;}))return false;
 const auto before=cel();auto after=before;
 for(auto& instance:after.freeTiles->instances)instance.visible=instance.id==id;
 if(after.freeTiles==before.freeTiles)return false;
 after.surface->pixels=free_tiles::render(*layer().freeTiles,*after.freeTiles,timeline_.state().tilesets,after.surface->width,after.surface->height);
 Edit edit{{},state_,nextState_};edit.beforeCels.push_back(before);edit.afterCels.push_back(std::move(after));edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;
 history_.reserve(position_+1);applyEdit(edit,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"仅显示自由瓦片实例");
 selectFreeTileInstance(id);return true;
}
bool Document::previewFreeTileInstanceFlags(const std::vector<std::string>& ids,bool value){
 if(!freeTileInstanceFlagsActive())return false;const auto& draft=*freeTilePlacement_;
 if(activeLayerId_!=draft.before.layerId||activeFrameId_!=draft.before.frameId)return false;
 // Legacy useLayerRowToggleGesture restores every row outside the current
 // inclusive range to its original value when the pointer sweeps back.
 const std::unordered_set<std::string> targets(ids.begin(),ids.end());auto after=draft.before;
 for(auto& i:after.freeTiles->instances)if(targets.count(i.id)&&freeSourceFor(*layer().freeTiles,i)){
  (draft.flagControl==1?i.locked:i.visible)=value;
 }
 const auto* live=timeline_.findCelById(after.id);if(!live||live->freeTiles==after.freeTiles)return false;
 if(draft.flagControl==0)after.surface->pixels=free_tiles::render(*layer().freeTiles,*after.freeTiles,timeline_.state().tilesets,after.surface->width,after.surface->height);
 timeline_.state_.cels[timeline_.cels_.at(after.id)]=std::move(after);change_={0,0,width_,height_};publishChange();return true;
}
bool Document::canDeleteFreeTileInstances(const std::vector<std::string>& ids)const{
 if(active()||!freeTileInstanceView()||!cel().freeTiles||!cel().surface)return false;
 const std::unordered_set<std::string> requested(ids.begin(),ids.end());bool found=false;
 for(const auto& i:cel().freeTiles->instances)if(requested.count(i.id)){if(i.locked)return false;found=true;}
 return found;
}
bool Document::deleteFreeTileInstances(const std::vector<std::string>& ids){
 if(!canDeleteFreeTileInstances(ids))return false;
 const auto before=cel();auto after=before;const std::unordered_set<std::string> requested(ids.begin(),ids.end());
 const auto selected=selectedFreeTileInstances();const auto primary=primaryFreeTileInstance();
 const auto firstRemoved=std::find_if(before.freeTiles->instances.begin(),before.freeTiles->instances.end(),[&](const auto& i){return requested.count(i.id);});
 const auto removedPrimary=requested.count(primary)?primary:firstRemoved->id;
 const auto& original=before.freeTiles->instances;const auto index=std::find_if(original.rbegin(),original.rend(),[&](const auto& i){return i.id==removedPrimary;})-original.rbegin();
 auto& remaining=after.freeTiles->instances;remaining.erase(std::remove_if(remaining.begin(),remaining.end(),[&](const auto& i){return requested.count(i.id);}),remaining.end());
 const std::string fallback=remaining.empty()?std::string{}:remaining[remaining.size()-1-std::min(std::size_t(index),remaining.size()-1)].id;
 const auto nextPrimary=!primary.empty()&&!requested.count(primary)?primary:fallback;
 after.surface->pixels=free_tiles::render(*layer().freeTiles,*after.freeTiles,timeline_.state().tilesets,after.surface->width,after.surface->height);
 Edit e{{},state_,nextState_};e.beforeCels.push_back(before);e.afterCels.push_back(std::move(after));e.beforeActive=e.afterActive=activeLayerId_;e.beforeFrame=e.afterFrame=activeFrameId_;
 history_.reserve(position_+1);applyEdit(e,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"擦除自由瓦片");
 freeInstanceSelected_.clear();for(const auto& id:selected)if(!requested.count(id))freeInstanceSelected_.push_back(id);
 if(!nextPrimary.empty()&&std::find(freeInstanceSelected_.begin(),freeInstanceSelected_.end(),nextPrimary)==freeInstanceSelected_.end())freeInstanceSelected_.push_back(nextPrimary);
 freeInstancePrimary_=nextPrimary;freeInstanceAnchor_=nextPrimary;freeInstanceSelectionFrame_=activeFrameId_;
 if(!nextPrimary.empty()){const auto& all=cel().freeTiles->instances;const auto at=std::find_if(all.begin(),all.end(),[&](const auto& i){return i.id==nextPrimary;});if(at!=all.end())if(const auto source=freeSourceFor(*layer().freeTiles,*at))setSelectedTileset(source->tilesetId);}
 else if(cel().freeTiles->instances.empty())tileSelection_.freePaint=true;
 return true;
}
std::optional<PixelRegion> Document::freeTileInstanceBounds(const std::string& id)const{
 if(layer().kind!="free-tile"||!layer().freeTiles||!cel().freeTiles||!cel().surface)return {};
 const auto& instances=cel().freeTiles->instances;const auto it=std::find_if(instances.begin(),instances.end(),[&](const auto& i){return i.id==id;});if(it==instances.end())return {};
 const auto source=freeSourceFor(*layer().freeTiles,*it);const auto set=source?freeSourceSet(timeline_.state(),source->tilesetId):nullptr;if(!set)return {};
 PixelRegion result;for(const int y:{source->offsetY,source->offsetY+set->tileHeight-1})for(const int x:{source->offsetX,source->offsetX+set->tileWidth-1}){const auto p=free_tiles::transform(*it,x,y);result.include(cel().surface->offsetX+it->x+p.first,cel().surface->offsetY+it->y+p.second);}return result;
}
bool Document::beginFreeTileInstanceMove(Point point){
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();
 if(active()||!freeTileInstanceView()||layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer())||hasSelectedGroups()||!free_tiles::coordinate(point.x)||!free_tiles::coordinate(point.y))return false;
 const auto& slot=cel();if(!slot.freeTiles||!slot.surface)return false;const auto& instances=slot.freeTiles->instances;
 const auto primary=primaryFreeTileInstance();const auto* hit=freeSourceHit(timeline_.state(),layer(),slot,point);
 // The selected primary rectangle wins over a later overlapping instance.
 if(const auto bounds=freeTileInstanceBounds(primary);bounds&&point.x>=bounds->x&&point.y>=bounds->y&&point.x<bounds->x+bounds->w&&point.y<bounds->y+bounds->h){const auto selected=std::find_if(instances.begin(),instances.end(),[&](const auto& i){return i.id==primary&&i.visible;});if(selected!=instances.end())hit=&*selected;}
 const auto source=hit?freeSourceFor(*layer().freeTiles,*hit):nullptr;if(!hit||hit->locked||!source||source->locked)return false;
 auto selected=selectedFreeTileInstances();if(std::find(selected.begin(),selected.end(),hit->id)==selected.end()){selectFreeTileInstance(hit->id);selected={hit->id};}
 FreeTilePlacement draft{slot,point};draft.moving=true;draft.initiatingInstance=hit->id;
 // Legacy filters hidden/instance-locked companions, but tests the source lock
 // of the initiating instance only. Do not silently change its multi-move rule.
 for(const auto& i:instances)if(i.visible&&!i.locked&&std::find(selected.begin(),selected.end(),i.id)!=selected.end())draft.movingIds.push_back(i.id);
 if(draft.movingIds.empty())return false;freeTilePlacement_=std::move(draft);return true;
}
bool Document::previewFreeTileInstanceMove(int dx,int dy){
 if(!freeTileInstanceMoving())return false;const auto& draft=*freeTilePlacement_;
 if(activeLayerId_!=draft.before.layerId||activeFrameId_!=draft.before.frameId){cancelFreeTilePlacement();return false;}
 auto after=draft.before;for(auto& i:after.freeTiles->instances)if(std::find(draft.movingIds.begin(),draft.movingIds.end(),i.id)!=draft.movingIds.end()){
  const auto x=std::int64_t(i.x)+dx,y=std::int64_t(i.y)+dy;if(std::abs(x)>free_tiles::MaxCoordinate||std::abs(y)>free_tiles::MaxCoordinate)throw std::out_of_range("Free tile instance move exceeds coordinate limit");i.x=int(x);i.y=int(y);
 }
 const auto* live=timeline_.findCelById(after.id);if(!live||after.freeTiles==live->freeTiles)return false;
 after.surface->pixels=free_tiles::render(*layer().freeTiles,*after.freeTiles,timeline_.state().tilesets,after.surface->width,after.surface->height);
 timeline_.state_.cels[timeline_.cels_.at(after.id)]=std::move(after);change_={0,0,width_,height_};publishChange();return true;
}
struct Document::FreeTileSourceStroke {
 timeline::Timeline before;
 std::unique_ptr<Document> raster;
 std::string sourceId,tilesetId,targetCel;
 free_tiles::Instance instance;
 Point origin,anchor,start;
 int baseSize=1;std::optional<PatternBrush> image;
 Point local(Point);
 PixelRegion scan;
 std::vector<Pixel> beforePixels,lastPixels;
 int beforeWidth=1,beforeHeight=1,beforeX=0,beforeY=0,lastWidth=0,lastHeight=0,lastX=0,lastY=0;
 bool placement=false,published=false,mutated=false;
};
Document* Document::freeTileSourceStrokeDocument()const{return freeSourceStroke_?freeSourceStroke_->raster.get():nullptr;}
Point Document::FreeTileSourceStroke::local(Point point){
 auto& edit=*raster;const Point from=edit.active_?Point{edit.last_.x+origin.x,edit.last_.y+origin.y}:point;
 // Legacy growFreeTileStrokeRaster: diagonal margin and spare quarter-size
 // capacity; remap pixel-history indices and local geometry when stride changes.
 const int margin=int(std::ceil(image&&image->intrinsicSize?std::hypot(image->width,image->height):std::sqrt(2.)*std::max(baseSize,edit.dynamicBase_.size)))+2;
 const int minX=std::min(from.x,point.x)-origin.x-margin,minY=std::min(from.y,point.y)-origin.y-margin;
 const int maxX=std::max(from.x,point.x)-origin.x+margin+1,maxY=std::max(from.y,point.y)-origin.y+margin+1;
 if(minX<0||minY<0||maxX>edit.width_||maxY>edit.height_){
  const int oldWidth=edit.width_,oldHeight=edit.height_,padX=std::max(128,(oldWidth+3)/4),padY=std::max(128,(oldHeight+3)/4);
  const int left=minX<0?minX-padX:0,top=minY<0?minY-padY:0,right=maxX>oldWidth?maxX+padX:oldWidth,bottom=maxY>oldHeight?maxY+padY:oldHeight;
  const int width=right-left,height=bottom-top,dx=-left,dy=-top;const auto count=std::uint64_t(width)*height;if(count>16*1024*1024)throw std::length_error("自由瓦片源临时画布超出原生内存预算，操作已取消");
  std::vector<Pixel> pixels(std::size_t(count),Pixel{});const auto& old=edit.pixels();for(int y=0;y<oldHeight;++y)std::copy_n(old.begin()+std::size_t(y)*oldWidth,oldWidth,pixels.begin()+std::size_t(y+dy)*width+dx);
  auto remap=[&](std::size_t index){return (index/oldWidth+dy)*width+index%oldWidth+dx;};
  auto remapMap=[&](auto& values){auto copy=values;values.clear();for(const auto& entry:copy)values.emplace(remap(entry.first),entry.second);};
  auto remapInk=[&](auto& values){auto copy=values;values.clear();for(const auto& entry:copy)values.emplace((std::uint64_t(remap(std::size_t(entry.first>>32)))<<32)|std::uint32_t(entry.first),entry.second);};
  remapMap(edit.inheritedStrokeBaseline_);remapMap(edit.imageEraseCoverage_);remapMap(edit.perfectTailPixels_);remapMap(edit.perfectTailErase_);remapInk(edit.inkStampCoverage_);remapInk(edit.perfectTailInk_);
  std::vector<int> lookup(std::size_t(count),-1);for(std::size_t i=0;i<edit.pending_.size();++i){auto& delta=edit.pending_[i];delta.index=remap(delta.index);lookup[delta.index]=int(i);}edit.pendingLookup_.swap(lookup);
  auto shift=[&](auto& p){p.x+=dx;p.y+=dy;};shift(edit.last_);shift(edit.dynamicLast_);shift(edit.previousStamp_);for(auto& p:edit.perfectPath_)shift(p);if(edit.selection_)shift(*edit.selection_);if(!edit.change_.empty())shift(edit.change_);shift(scan);
  origin.x-=dx;origin.y-=dy;edit.width_=width;edit.height_=height;auto& surface=*edit.timeline_.state_.cels.front().surface;surface.width=width;surface.height=height;surface.pixels=std::move(pixels);edit.timeline_.state_.canvasWidth=width;edit.timeline_.state_.canvasHeight=height;edit.timeline_.buildIndex();
  if(edit.active_){edit.strokePixels_=&static_cast<std::vector<Pixel>&>(surface.pixels);edit.strokeCanvasStorage_=true;edit.strokeStride_=width;edit.strokeOffsetX_=edit.strokeOffsetY_=0;edit.strokeAddress_={width,height,0,0};}edit.hasPreviousStamp_=false;
  if(image&&image->intrinsicSize&&edit.brush_.imagePaintMode!=PatternPaintMode::Paint)edit.imagePattern_.emplace(*image,edit.brush_.imagePaintMode,start.x-origin.x,start.y-origin.y);
 }
 return {point.x-origin.x,point.y-origin.y};
}
Point Document::freeTileSourceStrokePoint(Point point)const{return freeSourceStroke_->local(point);}
bool Document::beginFreeTileSourceStroke(Point point,Pixel color,BrushOptions brush,const PatternBrush* image,double angle,const std::unordered_map<std::size_t,Pixel>* baseline,bool initial,bool replaceColor){
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();
 if(active()||freeTilePaintMode()||!activeMaskId_.empty()||layer().kind!="free-tile"||!layer().freeTiles||layer().freeTiles->sources.empty()||hasSelectedGroups()||layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer()))return false;
 const auto& state=timeline_.state();const DocumentLayer* target=&layer();const DocumentCel* slot=timeline_.findCel(activeLayerId_,activeFrameId_);
 // Legacy checks other free layers first, without changing the active drawing layer.
 for(const auto& candidate:state.layers)if(candidate.kind=="free-tile"&&candidate.id!=activeLayerId_){const auto* c=timeline_.findCel(candidate.id,activeFrameId_);if(c&&freeSourceHit(state,candidate,*c,point)){target=&candidate;slot=c;break;}}
 if(!slot||!slot->freeTiles||!slot->surface||!target->freeTiles||target->freeTiles->sources.empty()||layerEffectivelyLocked(*target)||!layerEffectivelyVisible(*target))return false;
 const auto* hit=freeSourceHit(state,*target,*slot,point);const auto& data=*target->freeTiles;
 const free_tiles::Source* source=hit?freeSourceFor(data,*hit):nullptr;
 if(!source){auto selected=std::find_if(data.sources.begin(),data.sources.end(),[&](const auto& s){return s.id==tileSelection_.tilesetId||s.tilesetId==tileSelection_.tilesetId;});source=selected==data.sources.end()?&data.sources.front():&*selected;}
 if(!source->visible||source->locked)return false;
 const auto* set=freeSourceSet(state,source->tilesetId);if(!set||set->tileIds.empty())return false;
 // Legacy freeTileSourceEditTargetAtPoint prefers the selected instance of the
 // resolved source even when another copy is under the pointer. Its transform
 // and origin remain the edit anchor; hidden/locked preferences block below.
 const auto preferred=primaryFreeTileInstance();
 if(!preferred.empty()){const auto chosen=std::find_if(slot->freeTiles->instances.begin(),slot->freeTiles->instances.end(),[&](const auto& i){return i.id==preferred;});if(chosen!=slot->freeTiles->instances.end()){const auto* selected=freeSourceFor(data,*chosen);if(selected&&selected->id==source->id)hit=&*chosen;}}
 if(!hit)for(auto it=slot->freeTiles->instances.rbegin();it!=slot->freeTiles->instances.rend();++it){const auto* s=freeSourceFor(data,*it);if(it->visible&&s&&s->id==source->id){hit=&*it;break;}}
 if(hit&&(!hit->visible||hit->locked))return false;
 auto d=std::make_shared<FreeTileSourceStroke>();d->before=timeline_;d->sourceId=source->id;d->tilesetId=set->id;d->targetCel=slot->id;
 d->start=point;d->baseSize=brush.size;if(image)d->image=*image;d->beforeWidth=set->tileWidth;d->beforeHeight=set->tileHeight;d->beforeX=source->offsetX;d->beforeY=source->offsetY;d->beforePixels=tiles::readTile(*set,0);
 if(hit)d->instance=*hit;else {d->placement=true;d->instance.id=uniqueTileId("free-tile-instance");d->instance.sourceId=source->id;d->instance.x=point.x-slot->surface->offsetX-set->tileWidth/2-source->offsetX;d->instance.y=point.y-slot->surface->offsetY-set->tileHeight/2-source->offsetY;d->instance.opacity=source->opacity;d->instance.blendMode=source->blendMode;}
 d->anchor={slot->surface->offsetX+d->instance.x,slot->surface->offsetY+d->instance.y};
 PixelRegion transformed;for(int y:{0,set->tileHeight-1})for(int x:{0,set->tileWidth-1}){const auto p=free_tiles::transform(d->instance,source->offsetX+x,source->offsetY+y);transformed.include(p.first+d->anchor.x,p.second+d->anchor.y);}
 // Legacy compact source-edit raster and document-size padding.
 const int padding=std::clamp(std::max(width_,height_),16,128);const int left=std::min(point.x,transformed.x)-padding,top=std::min(point.y,transformed.y)-padding;
 const int right=std::max(point.x+1,transformed.x+transformed.w)+padding,bottom=std::max(point.y+1,transformed.y+transformed.h)+padding;
 const auto count=std::uint64_t(right-left)*std::uint64_t(bottom-top);if(count>16*1024*1024)throw std::length_error("自由瓦片源临时画布超出原生内存预算");
 d->scan={transformed.x-left,transformed.y-top,transformed.w,transformed.h};d->origin={left,top};d->raster=std::make_unique<Document>(1,1);auto& edit=*d->raster;edit.width_=right-left;edit.height_=bottom-top;
 auto rasterState=edit.timeline_.state();auto& surface=*rasterState.cels.front().surface;surface.width=edit.width_;surface.height=edit.height_;surface.pixels=std::vector<Pixel>(std::size_t(count));rasterState.canvasWidth=edit.width_;rasterState.canvasHeight=edit.height_;
 for(int y=0;y<set->tileHeight;++y)for(int x=0;x<set->tileWidth;++x){const auto p=free_tiles::transform(d->instance,source->offsetX+x,source->offsetY+y);surface.pixels[std::size_t(p.second+d->anchor.y-top)*edit.width_+p.first+d->anchor.x-left]=d->beforePixels[std::size_t(y)*set->tileWidth+x];}
 edit.timeline_=timeline::Timeline(std::move(rasterState));edit.palette_=palette_;edit.selection_=selection_;if(edit.selection_){edit.selection_->x-=left;edit.selection_->y-=top;}
 // Reuse the ordinary brush/dynamics implementation on the temporary raster.
 const auto local=d->local(point);std::unordered_map<std::size_t,Pixel> localBaseline;if(baseline)for(const auto& entry:*baseline){const int x=int(entry.first%width_)-d->origin.x,y=int(entry.first/width_)-d->origin.y;if(x>=0&&y>=0&&x<edit.width_&&y<edit.height_)localBaseline.emplace(std::size_t(y)*edit.width_+x,entry.second);}
 if(replaceColor)brush.ink=InkMode::Simple;
 edit.beginStroke(local,color,brush,image,angle,baseline?&localBaseline:nullptr,false);
 if(!edit.strokeActive())return false;
 if(replaceColor)edit.strokeColorReplacement_=std::make_pair(palette_.primary,palette_.secondary);
 if(initial)edit.stamp(local.x,local.y);projectStrokeStarted_=std::chrono::steady_clock::now();freeSourceStroke_=std::move(d);
 try{publishFreeTileSourceStroke();}catch(...){cancelFreeTileSourceStroke();throw;}return true;
}
// Legacy beginFreeTileEdit(fill): selection ?? transformed sourceRegion,
// fill immediately, then publish and commit the existing shared-source edit.
bool Document::fillFreeTileSourcePixels(Point point,Pixel color,WandOptions options,const PatternFillOptions* pattern){
 if(active()||freeTilePaintMode()||!activeMaskId_.empty()||layer().kind!="free-tile")return false;
 const bool patterned=pattern&&(!pattern->brushes.empty()||pattern->texture!=FillTexture::Solid);
 HistoryLabelScope label(*this,patterned?U"笔刷填充":options.contiguous?U"连续填充":U"不连续填充");
 try{
  if(!beginFreeTileSourceStroke(point,color,{},nullptr,0,nullptr,false))return false;
  auto& d=*freeSourceStroke_;auto& raster=*d.raster;
  const auto local=freeTileSourceStrokePoint(point);raster.cancelStroke();
  if(!raster.selection_)raster.selection_=SelectionMask{d.scan.x,d.scan.y,d.scan.w,d.scan.h,{}};
  // The legacy source fill passes no symmetry axes; the temporary source is
  // also its visible-layer reference. Reuse the existing fill implementation.
  const bool changed=pattern?raster.fillPatternPixels(local,color,*pattern,options):raster.fillPixels(local,color,options);
  if(!changed){cancelFreeTileSourceStroke();return false;}
  publishFreeTileSourceStroke();return commitFreeTileSourceStroke();
 }catch(...){cancelFreeTileSourceStroke();throw;}
}
bool Document::paintFreeTileSourceLine(Point from,Point to,Pixel color,BrushOptions brush,const PatternBrush* image,double angle,std::optional<BrushPathPoint> dynamics,Pixel gradientStart,int gradientDither,bool balanced){
 if(active()||!activeMaskId_.empty()||layer().kind!="free-tile"||freeTilePaintMode())return false;
 // Legacy beginLineConnection prepares the source at the clicked endpoint,
 // starts a fresh source edit (no inherited anchor baseline), then commits once.
 brush.perfectPixels=false;
 try{
  if(!beginFreeTileSourceStroke(to,color,brush,image,angle,nullptr,false))return false;
  auto& d=*freeSourceStroke_;auto& edit=*d.raster;
  if(dynamics)d.baseSize=std::max(d.baseSize,dynamics->size);
  Point start=d.local(from);edit.last_=start;const Point end=d.local(to);start=edit.last_;if(edit.imagePattern_&&image)edit.imagePattern_.emplace(*image,brush.imagePaintMode,start.x,start.y);
  const int size=dynamics?dynamics->size:brush.size;const double rotation=dynamics?dynamics->angle:angle;const bool bridge=brush.shape==BrushShape::Line&&size>1&&std::abs(std::fmod(rotation,180))>=.0001;
   auto points=freeSourceLinePoints(start,end,balanced);if(bridge){const auto continuous=selectionContinuousLine({start.x,start.y},{end.x,end.y},true);points.clear();for(auto p:continuous)points.push_back({p.x,p.y});}
  const auto stamp=image?std::optional<ImageBrushStamp>{prepareImageBrushStamp(*image,size,rotation)}:std::nullopt;const auto footprint=selectionBrushFootprint(brush,dynamics::rounded(rotation));const int reach=stamp?std::max(stamp->width,stamp->height):std::max(footprint.width,footprint.height),spacing=brush.shape==BrushShape::Line?1:std::max(1,reach/16);int since=0;
  if(dynamics){edit.configureStrokeDynamics(brush,image,gradientStart,color,gradientDither);for(std::size_t i=0;i<points.size();++i){if(i)++since;if(i&&i+1<points.size()&&since<spacing)continue;auto sample=*dynamics;sample.x=points[i].x;sample.y=points[i].y;edit.dynamicStamp(sample);since=0;}edit.dynamicLast_=*dynamics;edit.dynamicLast_.x=end.x;edit.dynamicLast_.y=end.y;edit.last_=end;}
  else {for(std::size_t i=0;i<points.size();++i){if(i)++since;if(i&&i+1<points.size()&&since<spacing)continue;edit.stamp(points[i].x,points[i].y);since=0;}edit.last_=end;}
  publishFreeTileSourceStroke();return commitFreeTileSourceStroke();
 }catch(...){cancelFreeTileSourceStroke();throw;}
}
void Document::publishFreeTileSourceStroke(){
 if(!freeSourceStroke_)return;auto& d=*freeSourceStroke_;const auto& edit=*d.raster;const auto& pixels=edit.pixels();
 if(!edit.change_.empty()){d.scan.include(edit.change_.x,edit.change_.y);d.scan.include(edit.change_.x+edit.change_.w-1,edit.change_.y+edit.change_.h-1);}
 int left=edit.width_,top=edit.height_,right=-1,bottom=-1;for(int y=std::max(0,d.scan.y);y<std::min(edit.height_,d.scan.y+d.scan.h);++y)for(int x=std::max(0,d.scan.x);x<std::min(edit.width_,d.scan.x+d.scan.w);++x)if(pixels[std::size_t(y)*edit.width_+x]>>24){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x);bottom=std::max(bottom,y);}
 std::vector<Pixel> source;int width=1,height=1,offsetX=0,offsetY=0;
 if(right>=left){PixelRegion canonical;for(int y:{top,bottom})for(int x:{left,right}){const auto p=freeSourceInverse(d.instance,x+d.origin.x-d.anchor.x,y+d.origin.y-d.anchor.y);canonical.include(p.x,p.y);}width=canonical.w;height=canonical.h;offsetX=canonical.x;offsetY=canonical.y;if(width>256||height>256)throw std::length_error("自由瓦片源宽高超出原生支持的256像素，操作已取消");source.resize(std::size_t(width)*height);
 for(int y=top;y<=bottom;++y)for(int x=left;x<=right;++x){const auto p=freeSourceInverse(d.instance,x+d.origin.x-d.anchor.x,y+d.origin.y-d.anchor.y);source[std::size_t(p.y-offsetY)*width+p.x-offsetX]=pixels[std::size_t(y)*edit.width_+x];}
 }else source={0};
 if(d.published&&width==d.lastWidth&&height==d.lastHeight&&offsetX==d.lastX&&offsetY==d.lastY&&source==d.lastPixels)return;
 const auto* current=freeSourceSet(timeline_.state(),d.tilesetId);
 if(!d.placement&&current->columns==1&&current->rows==1&&width==d.beforeWidth&&height==d.beforeHeight&&offsetX==d.beforeX&&offsetY==d.beforeY&&source==d.beforePixels&&!d.mutated){d.lastPixels=std::move(source);d.lastWidth=width;d.lastHeight=height;d.lastX=offsetX;d.lastY=offsetY;d.published=true;return;}
 auto resource=*current;resource.tileWidth=width;resource.tileHeight=height;resource.columns=resource.rows=1;resource.tileIds={resource.tileIds.front()};resource.tileSlots={resource.tileIds.front()};resource.pixels=source;
 // Stage all affected references before publishing, so failure can restore the
 // gesture baseline without leaving half-updated shared sources or frame caches.
 std::set<std::string> needed;for(const auto& owner:timeline_.state().layers)if(owner.freeTiles){const auto& data=*owner.freeTiles;const bool affected=data.legacyTilesetId==d.tilesetId||std::any_of(data.sources.begin(),data.sources.end(),[&](const auto& s){return s.tilesetId==d.tilesetId;});if(affected){if(!data.legacyTilesetId.empty())needed.insert(data.legacyTilesetId);for(const auto& s:data.sources)needed.insert(s.tilesetId);}}
 std::vector<tiles::Tileset> resources;for(const auto& set:timeline_.state().tilesets)if(needed.count(set.id))resources.push_back(set.id==d.tilesetId?resource:set);
 std::vector<DocumentCel> changed;
 for(const auto& owner:timeline_.state().layers)if(owner.freeTiles){auto data=*owner.freeTiles;bool affected=data.legacyTilesetId==d.tilesetId;for(auto& s:data.sources){if(s.id==d.sourceId){s.offsetX=offsetX;s.offsetY=offsetY;}if(s.tilesetId==d.tilesetId)affected=true;}
 if(!affected)continue;for(const auto& c:timeline_.state().cels)if(c.layerId==owner.id&&c.freeTiles&&c.surface){auto next=c;if(d.placement&&c.id==d.targetCel&&std::none_of(next.freeTiles->instances.begin(),next.freeTiles->instances.end(),[&](const auto& i){return i.id==d.instance.id;}))next.freeTiles->instances.push_back(d.instance);next.surface->pixels=free_tiles::render(data,*next.freeTiles,resources,next.surface->width,next.surface->height);changed.push_back(std::move(next));}}
 // Allocate last-preview state first; mutations below are moves/scalar writes.
 d.lastPixels=std::move(source);d.lastWidth=width;d.lastHeight=height;d.lastX=offsetX;d.lastY=offsetY;
 auto& state=timeline_.state_;*std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& t){return t.id==d.tilesetId;})=std::move(resource);
 for(auto& owner:state.layers)if(owner.freeTiles)for(auto& s:owner.freeTiles->sources)if(s.id==d.sourceId){s.offsetX=offsetX;s.offsetY=offsetY;}
 for(auto& c:changed){const auto id=c.id;state.cels[timeline_.cels_.at(id)]=std::move(c);timeline_.selectionContent_.erase(id);timeline_.visibleContent_.erase(id);++timeline_.thumbnailStorage_[id].revision;}
 timeline_.invalidateCompositeOrder();d.published=true;d.mutated=true;change_={0,0,width_,height_};publishChange();
}
bool Document::commitFreeTileSourceStroke(){
 if(!freeSourceStroke_)return false;auto& d=*freeSourceStroke_;const bool sourceChanged=d.beforeWidth!=d.lastWidth||d.beforeHeight!=d.lastHeight||d.beforeX!=d.lastX||d.beforeY!=d.lastY||d.beforePixels!=d.lastPixels;
 if(!sourceChanged&&!d.placement){cancelFreeTileSourceStroke();return false;}
 Edit e{{},state_,nextState_};e.beforeTimeline=d.before.state();e.afterTimeline=timeline_.state();e.beforeActive=e.afterActive=activeLayerId_;e.beforeFrame=e.afterFrame=activeFrameId_;history_.reserve(position_+1);freeSourceStroke_.reset();pushEdit(std::move(e),U"绘制自由瓦片源");projectInformation_.drawing(std::max<std::int64_t>(1,std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-projectStrokeStarted_).count()));return true;
}
void Document::cancelFreeTileSourceStroke(){if(!freeSourceStroke_)return;auto d=std::move(freeSourceStroke_);if(d->mutated){timeline_=d->before;change_={0,0,width_,height_};publishChange();}}
}
