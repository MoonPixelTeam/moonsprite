#include "lua_script_result.h"
#include "raster_geometry.h"
#include <unordered_set>
#include <set>
#include <stdexcept>
#include <cmath>
namespace moon {
struct ScriptDocumentBuilder {
 static script::LayerStructureUi ui(const Document& d){return {d.activeLayerId_,d.activeFrameId_,d.frameAnchor_,d.timelineSelection_,d.selectedFrames_,d.selectedGroupIds_,d.collapsedGroupIds_,d.selectedGroupId_,d.tileSelection_,d.freeInstanceSelected_,d.freeInstancePrimary_,d.freeInstanceAnchor_,d.freeInstanceSelectionFrame_,d.freeInstanceViewLayer_};}
 static void restore(Document& d,const script::LayerStructureUi& u){d.activeLayerId_=u.activeLayer;d.activeFrameId_=u.activeFrame;d.frameAnchor_=u.frameAnchor;d.timelineSelection_=u.selection;d.selectedFrames_=u.frames;d.selectedGroupIds_=u.groups;d.collapsedGroupIds_=u.collapsed;d.selectedGroupId_=u.group;d.tileSelection_=u.tiles;d.freeInstanceSelected_=u.freeSelected;d.freeInstancePrimary_=u.freePrimary;d.freeInstanceAnchor_=u.freeAnchor;d.freeInstanceSelectionFrame_=u.freeFrame;d.freeInstanceViewLayer_=u.freeView;}
 static bool structure(const Document& source,timeline::Timeline& timeline,std::unordered_map<std::string,std::array<int,4>>& geometry,script::LayerStructureUi& context,const std::string& operation,const std::string& id,const std::optional<std::u32string>& name,const std::optional<double>& opacity){
  // A small detached shell runs the established structural algorithms without
  // copying live history, recording callbacks or allocating a canvas bitmap.
  Document draft(1,1);draft.width_=source.width_;draft.height_=source.height_;draft.timeline_=std::move(timeline);draft.displayedLayerGeometry_=geometry;restore(draft,context);draft.layerDisplayColors_=source.layerDisplayColors_;
  bool changed=false;
  if(operation=="freeTiles.createLayer"){
   changed=draft.createFreeTileLayer(name.value_or(U"自由瓦片图层"),id);
  }else if(operation=="freeTiles.createSource"){
   draft.activeLayerId_=id;changed=draft.addFreeTileSource();if(changed)draft.tileSelection_.mode=tiles::Mode::Edit;if(changed&&name){const auto& sources=draft.layer().freeTiles->sources;Document::FreeTileSourceChanges patch;patch.name=*name;draft.setFreeTileSourceProperties(sources.back().id,patch);}
  }else if(operation=="layers.create"){
   const auto count=draft.timeline_.state().layers.size();draft.addLayerInGroupContext();changed=draft.timeline_.state().layers.size()!=count;if(!changed)throw std::logic_error("Lua layer creation failed");
   auto state=std::move(draft.timeline_).takeState();for(auto& l:state.layers)if(l.id==draft.activeLayerId_){if(name&&!name->empty())l.name=*name;if(opacity){l.opacity=*opacity;for(auto& c:state.cels)if(c.layerId==l.id&&c.frameId==draft.activeFrameId_)c.opacity=*opacity;}}draft.timeline_=timeline::Timeline(std::move(state));
  }else if(operation=="layers.duplicate"){
   changed=draft.duplicateLayerRows({id},{},{LayerPanelDropTarget::Kind::Above,LayerPanelKind::Layer,id});if(!changed)throw std::length_error("Lua layer duplication exceeds native limits");
  }else{
   draft.selectTimelineLayer(id);changed=draft.deleteLayerRows({id},{});
  }
  for(auto it=draft.displayedLayerGeometry_.begin();it!=draft.displayedLayerGeometry_.end();)if(!draft.timeline_.hasLayer(it->first))it=draft.displayedLayerGeometry_.erase(it);else ++it;
  for(const auto& l:draft.timeline_.state().layers)if(!draft.displayedLayerGeometry_.count(l.id)){const auto* c=draft.timeline_.findCel(l.id,draft.activeFrameId_);const auto r=c?draft.timeline_.resolveSurface(c->id):timeline::Resolution{};draft.displayedLayerGeometry_[l.id]=r.surface?std::array<int,4>{r.surface->width,r.surface->height,r.surface->offsetX,r.surface->offsetY}:std::array<int,4>{1,1,0,0};}
  context=ui(draft);geometry=std::move(draft.displayedLayerGeometry_);timeline=std::move(draft.timeline_);return changed;
 }
 static std::function<void()> brushRollback(Document& d){
  // COW pixel buffers and shared immutable history payloads keep this scoped
  // checkpoint detached from live observers. Only brush batches need it.
  auto before=std::make_shared<Document>(d);
  return [&d,before]{
   auto recording=std::move(d.recordingBinding_);auto changes=std::move(d.historyChangeBinding_);
   // Legacy non-history resource deletion survives a later operation error;
   // its batch revision/dirty baseline is restored by lua-script-service.
   auto resources=std::move(d.projectBrushes_);d=std::move(*before);d.projectBrushes_=std::move(resources);
   d.recordingBinding_=std::move(recording);d.historyChangeBinding_=std::move(changes);
  };
 }
 static Document build(const script::CreatedDocument& value){
  if(value.colorMode!="rgba")throw std::invalid_argument("Native Lua document color mode is not yet supported");
  if(value.name.empty()||value.width<1||value.height<1||std::uint64_t(value.width)*value.height>script::InvocationCapture::maxImagePixels||value.layers.empty())throw std::invalid_argument("Invalid Lua created document");
  constexpr std::uint64_t limit=256ull*1024*1024;std::uint64_t bytes=std::uint64_t(value.width)*value.height*sizeof(Pixel);std::size_t frames=1;std::unordered_set<std::string> ids;
  for(const auto& l:value.layers){const auto& s=l.surface;if(l.id.empty()||l.name.empty()||!ids.insert(l.id).second||l.opacity<0||l.opacity>255||!std::isfinite(l.frameNumber)||l.frameNumber<1||std::floor(l.frameNumber)!=l.frameNumber||l.frameNumber>double(limit/sizeof(DocumentFrame))||!s.pixels||s.width<1||s.height<1||std::uint64_t(s.width)*s.height!=s.pixels->size()||s.pixels->size()>script::InvocationCapture::maxImagePixels)throw std::invalid_argument("Invalid Lua created document layer");
   raster::coordinate(std::int64_t(s.x)+s.width);raster::coordinate(std::int64_t(s.y)+s.height);frames=std::max(frames,std::size_t(l.frameNumber));const auto n=s.pixels->size()*sizeof(Pixel);if(n>limit-bytes)throw std::length_error("Lua created document exceeds native budget");bytes+=n;
  }
  if(frames>(limit-bytes)/(sizeof(DocumentFrame)+64))throw std::length_error("Lua created document frame metadata exceeds native budget");
  // Native constructor supplies IDs/statistics/role colors; replace its default
  // bitmap with the exact sparse per-frame result, no creation undo entries.
  Document d(value.width,value.height);timeline::State state;state.canvasWidth=value.width;state.canvasHeight=value.height;
  for(std::size_t i=0;i<frames;++i)state.frames.push_back({"frame-"+std::to_string(i+1),100,false});
  for(const auto& l:value.layers){DocumentLayer layer;layer.id=l.id;layer.name=l.name;layer.opacity=l.opacity/255.;layer.visible=l.visible;layer.locked=l.locked;layer.groupId=l.parentGroupId;state.layers.push_back(std::move(layer));
   timeline::Surface s;s.width=l.surface.width;s.height=l.surface.height;s.offsetX=l.surface.x;s.offsetY=l.surface.y;s.storageOriginX=s.storageOriginY=0;s.pixels=*l.surface.pixels;
   DocumentCel c;c.id="script-cel-"+std::to_string(d.identity_)+"-"+std::to_string(state.cels.size()+1);c.layerId=l.id;c.frameId=state.frames[std::size_t(l.frameNumber)-1].id;c.opacity=l.opacity/255.;c.surface=std::move(s);state.cels.push_back(std::move(c));
   d.displayedLayerGeometry_[l.id]={l.surface.width,l.surface.height,l.surface.x,l.surface.y};
  }
  std::reverse(state.layers.begin(),state.layers.end()); // legacy bottom-to-top -> native top-to-bottom.
  timeline::Timeline checked(std::move(state));d.timeline_=std::move(checked);d.activeLayerId_=value.layers.back().id;d.activeFrameId_=d.timeline_.state().frames.front().id;d.name_=value.name;d.projectId_="doc-script-"+std::to_string(d.identity_);d.modified_=true;d.projectActiveCelOpacities();return d;
 }
};
namespace script {
std::function<void()> brushBatchRollback(Document& d){return ScriptDocumentBuilder::brushRollback(d);}
LayerStructureUi captureLayerStructureUi(const Document& d){return ScriptDocumentBuilder::ui(d);}
void restoreLayerStructureUi(Document& d,const LayerStructureUi& u){ScriptDocumentBuilder::restore(d,u);}
bool planLayerStructure(const Document& d,timeline::Timeline& t,std::unordered_map<std::string,std::array<int,4>>& g,LayerStructureUi& u,const std::string& op,const std::string& id,const std::optional<std::u32string>& name,const std::optional<double>& opacity){return ScriptDocumentBuilder::structure(d,t,g,u,op,id,name,opacity);}
Document buildCreatedDocument(const CreatedDocument& value){return ScriptDocumentBuilder::build(value);}}
void Document::commitScriptCreatedLayer(const script::CreatedLayer& value,std::u32string label){
 if(active())throw std::logic_error("Finish active edit before script layer creation");
 const auto& s=value.surface;
 if(value.id.empty()||value.name.empty()||timeline_.hasLayer(value.id)||value.opacity<0||value.opacity>255||(value.stackIndex&&!*value.stackIndex)||!std::isfinite(value.frameNumber)||value.frameNumber<1||std::floor(value.frameNumber)!=value.frameNumber||!s.pixels||s.width<1||s.height<1||std::uint64_t(s.width)*s.height!=s.pixels->size()||s.pixels->size()>script::InvocationCapture::maxImagePixels)throw std::invalid_argument("Invalid Lua created layer");
 raster::coordinate(std::int64_t(s.x)+s.width);raster::coordinate(std::int64_t(s.y)+s.height);
 // Candidate construction uses the existing native structural transaction.
 // Admit live+candidate+history surface before making any full-state copy.
 constexpr std::uint64_t limit=256ull*1024*1024;std::uint64_t used=0;
 auto admit=[&](std::uint64_t bytes){if(bytes>limit-used)throw std::length_error("Lua layer creation exceeds native working budget");used+=bytes;};
 for(const auto& c:timeline_.state().cels)if(c.surface)admit(c.surface->pixels.size()*sizeof(Pixel)*2ull);
 for(const auto& m:timeline_.state().masks)admit(m.mask.surface.pixels.size()*sizeof(Pixel)*2ull);
 for(const auto& set:timeline_.state().tilesets)admit(set.pixels.size()*sizeof(Pixel)*2ull);
 admit(s.pixels->size()*sizeof(Pixel)*3ull);
 const auto& frames=timeline_.state().frames;const auto frameIndex=value.frameNumber<=frames.size()?std::size_t(value.frameNumber)-1:0;
 const auto frameId=frames.at(frameIndex).id;
 const auto size=timeline_.state().layers.size();const auto legacyIndex=value.stackIndex?std::min(*value.stackIndex-1,size):size;const auto index=size-legacyIndex;
 DocumentLayer layer;layer.id=value.id;layer.name=value.name;layer.opacity=value.opacity/255.;layer.visible=value.visible;layer.locked=value.locked;layer.groupId=value.parentGroupId;
 timeline::Surface surface;surface.width=s.width;surface.height=s.height;surface.offsetX=s.x;surface.offsetY=s.y;surface.storageOriginX=surface.storageOriginY=0;surface.pixels=*s.pixels;
 DocumentCel c;c.id="cel-"+value.id+"-"+frameId;for(std::size_t suffix=1;timeline_.findCelById(c.id);++suffix)c.id="cel-"+value.id+"-"+frameId+"-"+std::to_string(suffix);c.layerId=layer.id;c.frameId=frameId;c.opacity=layer.opacity;c.surface=std::move(surface);
 Edit edit{{},state_,nextState_};edit.beforeFrame=activeFrameId_;edit.afterFrame=frameId;edit.beforeActive=activeLayerId_;edit.afterActive=layer.id;for(const auto& l:timeline_.state().layers)edit.beforeOrder.push_back(l.id);edit.afterOrder=edit.beforeOrder;edit.afterOrder.insert(edit.afterOrder.begin()+index,layer.id);edit.detachedLayer=layer;edit.detachedCels.push_back(c);
 edit.beforeGroupUi=GroupUiSnapshot{selectedGroupIds_,collapsedGroupIds_,selectedGroupId_};edit.afterGroupUi=GroupUiSnapshot{{},collapsedGroupIds_,{}};
 edit.beforeTimelineSelection=timelineSelection_;auto selected=timelineSelection_;selected.layers={layer.id};selected.layerAnchor=layer.id;edit.afterTimelineSelection=selected;
 auto next=timeline_.state();next.layers.insert(next.layers.begin()+index,std::move(layer));next.cels.push_back(std::move(c));timeline::Timeline prepared(std::move(next));
 reserveHistoryEntries();auto beforeLayer=activeLayerId_,beforeFrame=activeFrameId_;auto oldSelection=timelineSelection_;auto oldGroups=selectedGroupIds_;auto oldGroup=selectedGroupId_;auto nextLayer=edit.afterActive,nextFrame=edit.afterFrame;std::swap(timeline_,prepared);activeLayerId_=std::move(nextLayer);activeFrameId_=std::move(nextFrame);selectedGroupIds_.clear();selectedGroupId_.reset();timelineSelection_=std::move(selected);
 const auto oldRevision=revision_;
 try{pushEdit(std::move(edit),label.empty()?U"脚本":std::move(label));}
 catch(...){if(revision_==oldRevision){std::swap(timeline_,prepared);activeLayerId_=std::move(beforeLayer);activeFrameId_=std::move(beforeFrame);timelineSelection_=std::move(oldSelection);selectedGroupIds_=std::move(oldGroups);selectedGroupId_=std::move(oldGroup);}change_={0,0,width_,height_};publishChange();throw;}
 change_={0,0,width_,height_};publishChange();
}
bool Document::commitScriptRasterBatch(const script::RasterBatch& batch){
 if(active()||!activeMaskId_.empty()||!layer().kind.empty()||layerEffectivelyLocked(layer()))throw std::logic_error("Lua raster target is not editable");
 const auto& expected=batch.before;
 auto validate=[](const script::SurfaceSnapshot& s){if(s.width<1||s.height<1||!s.pixels||std::uint64_t(s.width)*s.height!=s.pixels->size()||s.pixels->size()>script::InvocationCapture::maxImagePixels)throw std::invalid_argument("Invalid Lua raster snapshot");raster::coordinate(std::int64_t(s.x)+s.width);raster::coordinate(std::int64_t(s.y)+s.height);};
 validate(expected);if(batch.after)validate(*batch.after);
 const auto* slot=timeline_.findCel(layer().id,frame().id);const auto resolved=slot?timeline_.resolveSurface(slot->id):timeline::Resolution{};
 const auto* current=resolved.surface;
 if(slot&&(!current||!resolved.source||resolved.issue!=timeline::LinkIssue::None))throw std::logic_error("Invalid Lua raster owner");
 if(current){raster::validate(*current);if(expected.width!=current->width||expected.height!=current->height||expected.x!=current->offsetX||expected.y!=current->offsetY||current->pixels!=*expected.pixels)throw std::logic_error("Lua raster baseline changed");}
 else{const auto g=displayedLayerGeometry(layer().id);if(g!=std::array<int,4>{expected.width,expected.height,expected.x,expected.y}||std::any_of(expected.pixels->begin(),expected.pixels->end(),[](Pixel p){return p!=0;}))throw std::logic_error("Lua empty raster baseline changed");}
 if(batch.after&&!batch.changes.empty())throw std::invalid_argument("Lua surface replacement also contains pixel changes");
 Edit edit{{},state_,nextState_};edit.beforeActive=edit.afterActive=layer().id;edit.beforeFrame=edit.afterFrame=frame().id;
 if(batch.layerUpdateTimeline){
  // Full layers.update candidate is admitted by the planner before any batch
  // mutation, retaining native Timeline authority for text/tiles/shared Cels.
  timeline::Timeline prepared(*batch.layerUpdateTimeline);
  if(prepared.state().frames.size()!=timeline_.state().frames.size()||!prepared.hasLayer(batch.layerStructureUi?batch.layerStructureUi->activeLayer:layer().id)||!prepared.hasFrame(frame().id)||!prepared.diagnoseLinks().empty()||!batch.layerUpdateGeometry)throw std::invalid_argument("Invalid Lua layer update candidate");
  if(batch.layerStructureUi){const auto& u=*batch.layerStructureUi;edit.beforeFreeTileSelection=FreeTileSelectionSnapshot{freeInstanceSelected_,freeInstancePrimary_,freeInstanceAnchor_,freeInstanceSelectionFrame_,freeInstanceViewLayer_};edit.afterFreeTileSelection=FreeTileSelectionSnapshot{u.freeSelected,u.freePrimary,u.freeAnchor,u.freeFrame,u.freeView};edit.beforeTileSelection=tileSelection_;edit.afterTileSelection=u.tiles;edit.afterActive=u.activeLayer;edit.afterFrame=u.activeFrame;edit.beforeTimelineSelection=timelineSelection_;edit.afterTimelineSelection=u.selection;edit.beforeSelection=selectedFrames_;edit.afterSelection=u.frames;edit.beforeFrameAnchor=frameAnchor_;edit.afterFrameAnchor=u.frameAnchor;edit.beforeGroupUi=GroupUiSnapshot{selectedGroupIds_,collapsedGroupIds_,selectedGroupId_};edit.afterGroupUi=GroupUiSnapshot{u.groups,u.collapsed,u.group};}
  edit.beforeTimeline=timeline_.state();edit.beforeScriptGeometry=displayedLayerGeometry_;edit.afterScriptGeometry=*batch.layerUpdateGeometry;
  auto geometry=*batch.layerUpdateGeometry;auto nextSlices=batch.slices;auto nextPalette=batch.palette;auto nextSelection=batch.selection;
  if(nextSlices){edit.beforeSlices=sliceState_;edit.afterSlices=*nextSlices;}
  if(nextPalette){edit.paletteKind=12;edit.beforePalette=palette_;edit.afterPalette=*nextPalette;}
  if(nextSelection){edit.pixelSelectionEdit=true;edit.beforePixelsSelection=selection_;edit.afterPixelsSelection=*nextSelection;}
  if(batch.durations){if(batch.durations->size()!=prepared.state().frames.size())throw std::invalid_argument("Invalid Lua duration count");for(std::size_t i=0;i<batch.durations->size();++i){const auto& [id,duration]=(*batch.durations)[i];if(id!=prepared.state_.frames[i].id||duration<1||duration>60000)throw std::invalid_argument("Invalid Lua duration");prepared.state_.frames[i].duration=duration;}}
  if(batch.loops)prepared.state_.loopSections=*batch.loops;
  edit.documentChanged=batch.structureDocumentChanged;if(!edit.documentChanged)edit.afterState=state_;
  edit.afterTimeline=prepared.state();reserveHistoryEntries();
  const auto oldUi=ScriptDocumentBuilder::ui(*this);
  std::swap(timeline_,prepared);std::swap(displayedLayerGeometry_,geometry);if(nextSlices)std::swap(sliceState_,*nextSlices);if(nextPalette)std::swap(palette_,*nextPalette);if(nextSelection)std::swap(selection_,*nextSelection);
  if(batch.layerStructureUi)ScriptDocumentBuilder::restore(*this,*batch.layerStructureUi);
  const auto beforeRevision=revision_;try{pushEdit(std::move(edit),batch.label);}catch(...){if(revision_==beforeRevision){ScriptDocumentBuilder::restore(*this,oldUi);std::swap(timeline_,prepared);std::swap(displayedLayerGeometry_,geometry);if(nextSlices)std::swap(sliceState_,*nextSlices);if(nextPalette)std::swap(palette_,*nextPalette);if(nextSelection)std::swap(selection_,*nextSelection);}throw;}
  projectActiveCelOpacities();change_={0,0,width_,height_};publishChange();return true;
 }
 std::vector<timeline::Surface*> synchronizedTargets;std::vector<timeline::Surface> synchronizedReplacements;std::unordered_set<std::string> synchronizedIds;
 std::size_t synchronizedBytes=0;for(const auto& o:batch.synchronizedOwners){const auto bytes=(o.before.pixels.size()+o.after.pixels.size())*sizeof(Pixel)*2ull;if(bytes>256ull*1024*1024-synchronizedBytes)throw std::length_error("Lua synchronized history exceeds native budget");synchronizedBytes+=bytes;auto r=timeline_.resolveSurface(o.ownerId);if(!r.source||!r.surface||r.source->id!=o.ownerId||!synchronizedIds.insert(o.ownerId).second||(resolved.source&&resolved.source->id==o.ownerId)||r.surface->width!=o.before.width||r.surface->height!=o.before.height||r.surface->offsetX!=o.before.offsetX||r.surface->offsetY!=o.before.offsetY||r.surface->pixels!=o.before.pixels)throw std::logic_error("Lua synchronized owner baseline changed");raster::validate(o.after);edit.surfaceChanges.push_back({o.ownerId,o.before,o.after});synchronizedReplacements.push_back(o.after);}
 std::vector<std::optional<timeline::ColorOverlayStyle>*> styleTargets;auto styleValues=batch.styles;std::unordered_set<std::string> styleIds;
 if(!styleValues.empty()){captureGroupEdit(edit,false);captureGroupEdit(edit,true);for(const auto& [id,value]:styleValues){if(!timeline_.hasLayer(id)||!styleIds.insert(id).second)throw std::invalid_argument("Invalid Lua style target");auto& layer=timeline_.state_.layers[timeline_.layerIndex(id)];if(layer.kind=="adjustment")throw std::invalid_argument("Invalid Lua adjustment style target");styleTargets.push_back(&layer.layerStyles);for(auto& l:edit.afterLayerStructure->layers)if(l.id==id)l.layerStyles=value;}}
 auto swapStyles=[&]{for(std::size_t i=0;i<styleTargets.size();++i)std::swap(*styleTargets[i],styleValues[i].second);};
 std::size_t changed=0;
 const bool animationChanged=batch.durations.has_value()||batch.loops.has_value();
 std::vector<int> nextDurations;auto nextLoops=batch.loops; // Allocate replacements before installing any data.
 if(batch.durations){std::vector<std::pair<std::string,int>> before;for(const auto& f:timeline_.state().frames)before.emplace_back(f.id,f.duration);if(before.size()!=batch.durations->size())throw std::invalid_argument("Lua duration frame count changed");for(std::size_t i=0;i<before.size();++i){const auto& f=(*batch.durations)[i];if(f.first!=before[i].first||f.second<1||f.second>60000)throw std::invalid_argument("Invalid Lua duration");nextDurations.push_back(f.second);}edit.beforeScriptDurations=std::move(before);edit.afterScriptDurations=*batch.durations;}
 if(batch.loops){edit.beforeLoops=timeline_.state().loopSections;edit.afterLoops=*batch.loops;for(const auto& loop:*batch.loops)if(!timeline_.hasFrame(loop.startFrameId)||!timeline_.hasFrame(loop.endFrameId))throw std::invalid_argument("Invalid Lua loop frames");}
 auto swapAnimation=[&]{if(batch.durations)for(std::size_t i=0;i<nextDurations.size();++i)std::swap(timeline_.state_.frames[i].duration,nextDurations[i]);if(nextLoops)std::swap(timeline_.state_.loopSections,*nextLoops);};
 const bool slicesChanged=batch.slices.has_value();
 const bool selectionChanged=batch.selection.has_value();const bool paletteChanged=batch.palette.has_value();
 if(paletteChanged){edit.paletteKind=12;edit.beforePalette=palette_;edit.afterPalette=*batch.palette;}
 if(slicesChanged){edit.beforeSlices=sliceState_;edit.afterSlices=*batch.slices;}
 if(selectionChanged){edit.pixelSelectionEdit=true;edit.beforePixelsSelection=selection_;edit.afterPixelsSelection=*batch.selection;}
 if(!batch.after){std::unordered_set<std::size_t> seen;for(const auto& c:batch.changes){if(c.index>=expected.pixels->size()||!seen.insert(c.index).second||(*expected.pixels)[c.index]!=c.before)throw std::invalid_argument("Invalid Lua pixel change");changed+=c.before!=c.after;}if(!changed&&!slicesChanged&&!selectionChanged&&!paletteChanged&&!animationChanged&&batch.styles.empty()&&batch.synchronizedOwners.empty())return false;}
 // Slice-only batches reuse the same history entry without materializing an
 // absent raster Cel or copying the document's pixel storage.
 if(!batch.after&&!changed){for(const auto& o:batch.synchronizedOwners){auto* target=timeline_.mutableOwnedSurface(o.ownerId);if(!target)throw std::logic_error("Missing Lua secondary owner");synchronizedTargets.push_back(target);}edit.documentChanged=!batch.styles.empty()||slicesChanged||paletteChanged||animationChanged||!batch.synchronizedOwners.empty();edit.afterState=edit.documentChanged?nextState_:state_;reserveHistoryEntries();auto replacement=slicesChanged?*batch.slices:SliceState{};auto paletteReplacement=paletteChanged?*batch.palette:PaletteState{};auto selectionReplacement=selectionChanged?*batch.selection:std::optional<SelectionMask>{};if(slicesChanged)std::swap(sliceState_,replacement);if(paletteChanged)std::swap(palette_,paletteReplacement);if(selectionChanged)std::swap(selection_,selectionReplacement);swapAnimation();swapStyles();for(std::size_t i=0;i<synchronizedTargets.size();++i)std::swap(*synchronizedTargets[i],synchronizedReplacements[i]);const auto beforeRevision=revision_;try{pushEdit(std::move(edit),batch.label);}catch(...){if(revision_==beforeRevision){for(std::size_t i=0;i<synchronizedTargets.size();++i)std::swap(*synchronizedTargets[i],synchronizedReplacements[i]);swapAnimation();swapStyles();if(slicesChanged)std::swap(sliceState_,replacement);if(paletteChanged)std::swap(palette_,paletteReplacement);if(selectionChanged)std::swap(selection_,selectionReplacement);}throw;}change_={0,0,width_,height_};publishChange();return true;}
 // Admission before history/owner copies. Match existing surface-edit working
 // budget and deduplicate linked storage; do not copy an entire project.
 constexpr std::size_t limit=256*1024*1024;std::size_t used=synchronizedBytes;std::set<std::string> seen;
 auto admit=[&](std::size_t bytes){if(bytes>limit-used)throw std::length_error("Lua raster transaction exceeds native working budget");used+=bytes;};
 for(const auto& c:timeline_.state().cels)if(c.surface&&seen.insert(timeline_.linkedStorageKey(c.id)).second)admit(c.surface->pixels.size()*sizeof(Pixel));
 for(const auto& m:timeline_.state().masks)admit(m.mask.surface.pixels.size()*sizeof(Pixel));
 admit(changed*sizeof(Delta));
 if(changed){edit.pixels.reserve(changed);for(const auto& c:batch.changes)if(c.before!=c.after)edit.pixels.push_back({c.index,c.before,c.after});}
 auto makeSurface=[](const script::SurfaceSnapshot& s){timeline::Surface out;out.width=s.width;out.height=s.height;out.offsetX=s.x;out.offsetY=s.y;out.storageOriginX=out.storageOriginY=0;out.pixels=*s.pixels;return out;};
 if(batch.after){admit(expected.pixels->size()*sizeof(Pixel));admit(batch.after->pixels->size()*sizeof(Pixel)*2);}
 std::optional<timeline::Timeline> prepared;
 std::string ownerId;
 if(!slot){
  // Same empty-slot materialization rule as commitStroke: undo clears pixels
  // while retaining the committed Cel. No-change pixel batches create nothing.
  admit(used);admit(expected.pixels->size()*sizeof(Pixel));auto candidate=timeline_.state();timeline::Cel created;created.id="cel-"+layer().id+"-"+frame().id;
  for(std::size_t suffix=1;timeline_.findCelById(created.id);++suffix)created.id="cel-"+layer().id+"-"+frame().id+"-"+std::to_string(suffix);
  created.layerId=layer().id;created.frameId=frame().id;created.opacity=layer().opacity;created.surface=makeSurface(expected);ownerId=created.id;candidate.cels.push_back(std::move(created));prepared.emplace(std::move(candidate),ownerId);
 }else ownerId=resolved.source->id;
 auto& targetTimeline=prepared?*prepared:timeline_;const auto owner=targetTimeline.resolveSurface(ownerId);const auto& before=*owner.surface;
 std::optional<timeline::Surface> replacement;
 if(batch.after){edit.surfaceChanges.push_back({ownerId,before,makeSurface(*batch.after)});replacement=edit.surfaceChanges.back().after;}
 else{edit.targetCelId=slot?slot->id:ownerId;edit.pixelAddress=PixelAddressSpace{before.width,before.height,before.storageOriginX.value_or(0),before.storageOriginY.value_or(0)};}
 std::optional<SliceState> previousSlices;if(slicesChanged)previousSlices=*batch.slices;
 auto previousPalette=paletteChanged?*batch.palette:PaletteState{};auto previousSelection=selectionChanged?*batch.selection:std::optional<SelectionMask>{};
 // All history payloads and replacement pixels are prepared before installation.
 reserveHistoryEntries();for(const auto& o:batch.synchronizedOwners){auto* target=targetTimeline.mutableOwnedSurface(o.ownerId);if(!target)throw std::logic_error("Missing synchronized owner");synchronizedTargets.push_back(target);}auto* live=targetTimeline.mutableOwnedSurface(ownerId);if(!live)throw std::logic_error("Missing Lua writable owner");
 // One storage revision per batch; mutable subscripting touches an atomic
 // revision counter on every access and is expensive for dense Lua changes.
 if(batch.after)std::swap(*live,*replacement);else{auto& pixels=static_cast<std::vector<Pixel>&>(live->pixels);for(const auto& p:edit.pixels)pixels[p.index]=p.after;}
 for(std::size_t i=0;i<synchronizedTargets.size();++i)std::swap(*synchronizedTargets[i],synchronizedReplacements[i]);
 if(prepared){std::swap(timeline_,*prepared);styleTargets.clear();for(const auto& [id,value]:styleValues)styleTargets.push_back(&timeline_.state_.layers[timeline_.layerIndex(id)].layerStyles);}
 if(previousSlices)std::swap(sliceState_,*previousSlices);
 if(paletteChanged)std::swap(palette_,previousPalette);if(selectionChanged)std::swap(selection_,previousSelection);swapAnimation();swapStyles();
 const auto beforeRevision=revision_;
 try{pushEdit(std::move(edit),batch.label.empty()?U"脚本":batch.label);}
 catch(...){
  // History allocation is pre-reserved. Still restore pixels if label/history
  // preparation throws, as required by the batch failure contract.
  // Observer exceptions happen after a committed history push. Keep that
  // committed history and its pixels consistent, then propagate the error.
  if(revision_!=beforeRevision){change_={0,0,width_,height_};publishChange();throw;}
  swapAnimation();swapStyles();if(previousSlices)std::swap(sliceState_,*previousSlices);
  if(paletteChanged)std::swap(palette_,previousPalette);if(selectionChanged)std::swap(selection_,previousSelection);
  for(std::size_t i=0;i<synchronizedTargets.size();++i)std::swap(*synchronizedTargets[i],synchronizedReplacements[i]);
  if(prepared)std::swap(timeline_,*prepared);
  else if(batch.after)std::swap(*live,*replacement);
  else{auto& pixels=static_cast<std::vector<Pixel>&>(live->pixels);for(const auto& p:batch.changes)pixels[p.index]=p.before;}
  throw;
 }
 change_={0,0,width_,height_};publishChange();return true;
}
}
