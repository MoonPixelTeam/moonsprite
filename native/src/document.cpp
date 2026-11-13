#include "document_history_storage.h"
#include "sheet_import_task.h"
#include "sheet_import_storage.h"
#include "free_tile_source_transfer.h"
#include "local_history_edit.h"
#include "free_tile_selection_target.h"
#include "relative_luminance.h"
#include "symmetry_content_translation.h"
#include "mask_resize.h"
#include "image_import_limits.h"
#include <unordered_set>
#include <iterator>
#include "document.h"
#include "raster_geometry.h"
#include "cel_properties.h"
#include <limits>
#include "layer_blend.h"
#include "javascript_text.h"
#include <set>
#include <atomic>
#include "sprite_sheet_import.h"
#include "palette_extraction.h"
#include "palette_layout.h"
#include "palette_resource_sync.h"
#include "layer_compositor.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace moon {
using history_storage::adjustmentByteLimit;
using history_storage::adjustmentStorageBudget;
namespace {
// A failed replay must retain pending invalidation as well as any damage
// already produced by an earlier domain/child. This does not roll back content.
template<class Replay> void replayHistoryWithDamage(PixelRegion& damage,int width,int height,Replay replay){
 const auto pending=damage;damage={};
 try{replay();}catch(...){
  if(damage.empty())damage=pending;
  else if(!pending.empty()){
   const auto left=std::min<std::int64_t>(damage.x,pending.x),top=std::min<std::int64_t>(damage.y,pending.y);
   const auto right=std::max(std::int64_t(damage.x)+damage.w,std::int64_t(pending.x)+pending.w),bottom=std::max(std::int64_t(damage.y)+damage.h,std::int64_t(pending.y)+pending.h);
   if(right-left>std::numeric_limits<int>::max()||bottom-top>std::numeric_limits<int>::max())damage={0,0,width,height};
   else damage={int(left),int(top),int(right-left),int(bottom-top)};
  }
  throw;
 }
}
std::vector<int> currentPaletteSlots(const PaletteState& p){return normalizePaletteSlots(p.entries,p.order(),p.slots,p.columns);}
void normalizePaletteSnapshot(PaletteState& p,bool retainOrder){const auto order=p.order();p.slots=currentPaletteSlots(p);p.independentOrder.reset();if(retainOrder)p.setOrder(order);}
}
std::vector<Pixel> Document::canvasPixels()const{
 const auto* present=activeSurfaceIfPresent();if(!present)return std::vector<Pixel>(std::size_t(width_)*height_);const auto& s=*present;raster::validate(s);if(raster::fullCanvas(s,width_,height_))return s.pixels;
 std::vector<Pixel> out(std::size_t(width_)*height_);const auto left=std::max<std::int64_t>(0,s.offsetX),top=std::max<std::int64_t>(0,s.offsetY),right=std::min<std::int64_t>(width_,std::int64_t(s.offsetX)+s.width),bottom=std::min<std::int64_t>(height_,std::int64_t(s.offsetY)+s.height);
 for(auto y=top;y<bottom;++y)if(right>left)std::copy_n(s.pixels.begin()+std::size_t(y-s.offsetY)*s.width+std::size_t(left-s.offsetX),std::size_t(right-left),out.begin()+std::size_t(y)*width_+std::size_t(left));return out;
}
std::optional<SelectionMask> Document::selectionContentBounds(const SelectionMask& selection)const{
 const auto* present=activeSurfaceIfPresent();if(!present)return {};const auto& s=*present;raster::validate(s);const auto l=std::max<std::int64_t>(selection.x,s.offsetX),t=std::max<std::int64_t>(selection.y,s.offsetY),r=std::min<std::int64_t>(std::int64_t(selection.x)+selection.width,std::int64_t(s.offsetX)+s.width),b=std::min<std::int64_t>(std::int64_t(selection.y)+selection.height,std::int64_t(s.offsetY)+s.height);
 std::int64_t left=r,top=b,right=l-1,bottom=t-1;for(auto y=t;y<b;++y)for(auto x=l;x<r;++x)if(selectionContains(selection,int(x),int(y))&&(raster::readWorld(s,x,y)>>24)){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x);bottom=std::max(bottom,y);}if(right<left||bottom<top)return {};
 SelectionMask out{raster::coordinate(left),raster::coordinate(top),raster::coordinate(right-left+1),raster::coordinate(bottom-top+1),{}};if(!selection.mask.empty()){out.mask.resize(std::size_t(out.width)*out.height);for(int y=0;y<out.height;++y)for(int x=0;x<out.width;++x)out.mask[std::size_t(y)*out.width+x]=selectionContains(selection,out.x+x,out.y+y)?1:0;}return out;
}
void PixelRegion::include(int px,int py) {
  if(empty()) {x=px;y=py;w=h=1;return;}
  const int right=std::max(x+w,px+1),bottom=std::max(y+h,py+1);
  x=std::min(x,px);y=std::min(y,py);w=right-x;h=bottom-y;
}
Document::Document(int w,int h,std::size_t maxBytes,std::size_t maxEntries)
  : width_(w),height_(h),history_(maxBytes,maxEntries) {
  static std::atomic<std::uint64_t> nextIdentity{0};identity_=++nextIdentity;
  if (w < 1 || h < 1 || w > 32768 || h > 32768 || std::uint64_t(w)*h > 64ull*1024*1024)
    throw std::invalid_argument("Canvas exceeds native coordinate or 256 MiB pixel budget");
  timeline::State initial;
  initial.layers.push_back({"layer-"+std::to_string(identity_),U"图层 1"});
  initial.frames.push_back({"frame-1",100});
  timeline::Surface surface;surface.width=w;surface.height=h;
  surface.pixels.resize(static_cast<std::size_t>(w)*h);
  timeline::Cel first;first.id="cel-"+std::to_string(identity_);
  first.layerId=initial.layers.front().id;first.frameId=initial.frames.front().id;
  first.opacity=1;first.surface=std::move(surface);initial.cels.push_back(std::move(first));
  activeLayerId_=initial.layers.front().id;activeFrameId_=initial.frames.front().id;initial.canvasWidth=width_;initial.canvasHeight=height_;timeline_=timeline::Timeline(std::move(initial));projectActiveLayerGeometry();
}
Document Document::withBuiltinPalette(int width,int height,std::u32string name) {
  // Exact colors/order from legacy/palettes/pixel-core-32.palette.json.
  // User requests this preset for new native documents; no history transaction.
  static constexpr Pixel colors[]{0xffffffffu,0xffeae0d9u,0xffb8a79au,0xff75655bu,0xff40342du,0xff1c1511u,0xffb5ebffu,0xff5dc9f4u,0xff2b8ed9u,0xff244fa9u,0xff252a6eu,0xffb8b3ffu,0xff675be9u,0xff4a2db5u,0xff3c1e6eu,0xffffb4d8u,0xffd86195u,0xff9d3556u,0xff6b262eu,0xffffe3b7u,0xffe8b553u,0xffb77328u,0xff7a431eu,0xffc8f1b8u,0xff7ac755u,0xff578b2eu,0xff4b5b1fu,0xfff2f2f2u,0xffccc1b9u,0xff918074u,0xff5a4a3fu,0xff332620u};
  Document result(width,height);result.name_=std::move(name);auto& palette=result.palette_;
  palette.entries.clear();palette.slots.clear();palette.selected.clear();
  int id=1;
  for(const auto color:colors) {
    const auto number=std::to_string(id);
    palette.entries.push_back({id,U"颜色 "+std::u32string(number.begin(),number.end()),color});
    palette.slots.push_back(id++);
  }
  palette.nextId=id;
  return result;
}
Document Document::fromSpriteSheetRaster(int width,int height,std::vector<Pixel> pixels,std::u32string name) {
  // legacy sprite-sheet create/stack -> createDocument(..., 'rgba'), then dirty=true.
  // Validate editable dimensions before creating a session; never clamp sheet data.
  validateImportedImageDimensions(width,height);
  if(pixels.size()!=std::size_t(width)*height)throw std::invalid_argument("Invalid sprite sheet raster length");
  Document result(width,height);auto state=result.timeline_.state();
  state.layers.front().name=U"精灵表";
  state.cels.front().surface->pixels=std::move(pixels);
  result.timeline_=timeline::Timeline(std::move(state));
  result.palette_.entries={{1,U"墨黑",0xff211b18},{2,U"月蓝",0xffff7929}};
  result.name_=std::move(name);result.modified_=true;
  return result;
}
Document Document::fromImported(int width,int height,timeline::State state,PaletteState palette,
  std::string projectId,std::u32string name,std::shared_ptr<const std::vector<std::uint8_t>> sourceArchive,std::string activeFrameId) {
  // Build and validate a candidate before the caller replaces its active session.
  if(projectId.empty() || !sourceArchive || state.layers.empty() || state.frames.empty() || state.cels.size()!=state.layers.size()*state.frames.size())
    throw std::invalid_argument("Unsupported imported document structure");
  if(palette.columns<1||palette.columns>256)throw std::invalid_argument("Invalid imported palette columns");
  normalizeHistoricalFreeSources(state);state.canvasWidth=width;state.canvasHeight=height;timeline::Timeline validated(std::move(state));
  if(!validated.diagnoseLinks().empty())throw std::invalid_argument("Invalid imported cel link");

  for(const auto& cel:validated.state().cels){const auto resolved=validated.resolveSurface(cel.id);const auto* surface=resolved.surface;
    if(!surface)throw std::invalid_argument("Missing imported surface");raster::validate(*surface);raster::coordinate(std::int64_t(surface->offsetX)+surface->width);raster::coordinate(std::int64_t(surface->offsetY)+surface->height);}
  if(!activeFrameId.empty()&&std::none_of(validated.state().frames.begin(),validated.state().frames.end(),[&](const auto& f){return f.id==activeFrameId;}))throw std::invalid_argument("Unknown imported active frame");
  Document result(width,height);result.timeline_=std::move(validated);result.activeLayerId_=result.timeline_.state().layers.front().id;result.activeFrameId_=activeFrameId.empty()?result.timeline_.state().frames.front().id:std::move(activeFrameId);result.palette_=std::move(palette);
  result.projectId_=std::move(projectId);result.name_=std::move(name);result.sourceArchive_=std::move(sourceArchive);result.projectActiveCelOpacities();
  return result;
}
std::array<int,4> Document::displayedLayerGeometry(const std::string& id) const {
 if(!timeline_.hasLayer(id))throw std::invalid_argument("Unknown layer display geometry");
 if(const auto* cel=timeline_.findCel(id,activeFrameId_)){const auto resolved=timeline_.resolveSurface(cel->id);if(resolved.surface){const auto& s=*resolved.surface;return {s.width,s.height,s.offsetX,s.offsetY};}}
 const auto found=displayedLayerGeometry_.find(id);
 if(found==displayedLayerGeometry_.end())throw std::logic_error("Missing layer display geometry");
 return found->second;
}
void Document::setImportedLayerGeometry(std::unordered_map<std::string,std::array<int,4>> geometry){
 for(const auto& [id,g]:geometry){if(!timeline_.hasLayer(id)||g[0]<1||g[1]<1)throw std::invalid_argument("Invalid imported layer display geometry");raster::coordinate(std::int64_t(g[2])+g[0]);raster::coordinate(std::int64_t(g[3])+g[1]);}
 displayedLayerGeometry_=std::move(geometry);projectActiveLayerGeometry();
}
int floorDivide(int value, int scale) {
  if (scale <= 0) throw std::invalid_argument("Scale must be positive");
  return static_cast<int>(std::floor(static_cast<double>(value) / scale));
}
std::size_t Document::activeLayerIndex() const {
 if(!timeline_.hasLayer(activeLayerId_))throw std::logic_error("Missing active layer");return timeline_.layerIndex(activeLayerId_);
}
void Document::selectLayer(const std::string& id) {
 commitFloatingPaste();cancelStroke();cancelGradient();cancelLayerOpacity();activeMaskId_.clear();maskIsolated_=false;if(!timeline_.hasLayer(id))return;activeLayerId_=id;
 if(freeInstanceViewLayer_!=id){freeInstanceViewLayer_.clear();freeInstanceSelected_.clear();freeInstancePrimary_.clear();freeInstanceAnchor_.clear();}
}
std::size_t Document::activeFrameIndex() const {
 if(!timeline_.hasFrame(activeFrameId_))throw std::logic_error("Missing active frame");return timeline_.frameIndex(activeFrameId_);
}
void Document::selectFrame(const std::string& id,AnimationFrameOrigin origin) {
 commitFloatingPaste();cancelStroke();cancelGradient();cancelLayerOpacity();if(id==activeFrameId_ || !timeline_.hasFrame(id))return;
 freeInstanceSelected_.clear();freeInstancePrimary_.clear();freeInstanceAnchor_.clear();freeInstanceSelectionFrame_=id;
 projectActiveLayerGeometry();activeMaskId_.clear();maskIsolated_=false;activeFrameId_=id;projectActiveCelOpacities();change_={0,0,width_,height_};publishChange(false,true);
 animationChangeBinding_.publish(*this,{AnimationChange::Kind::FrameSelected,origin});
}
void Document::selectFrameHeader(const std::string& id,int mode,bool preserve){if(!timeline_.hasFrame(id))return;if(freeTileInstanceView())setFreeTileInstanceView(false);const auto maskContext=activeMaskId_;const bool isolated=maskIsolated_;if(!timelineSelection_.maskRows.empty()){selectedGroupIds_.clear();selectedGroupId_.reset();timelineSelection_.layers.clear();timelineSelection_.layerAnchor.clear();}timelineSelection_.cels.clear();timelineSelection_.celAnchor.clear();if(!mode){selectedGroupIds_.clear();selectedGroupId_.reset();timelineSelection_.layers.clear();timelineSelection_.layerAnchor.clear();}const auto& frames=timeline_.state().frames;if(mode==2 && !frameAnchor_.empty()){const int a=timeline_.hasFrame(frameAnchor_)?int(timeline_.frameIndex(frameAnchor_)):-1,b=int(timeline_.frameIndex(id));if(a>=0 && b>=0){selectedFrames_.clear();for(int i=std::min(a,b);i<=std::max(a,b);++i)selectedFrames_.push_back(frames[i].id);}}else if(mode==1){auto it=std::find(selectedFrames_.begin(),selectedFrames_.end(),id);if(it==selectedFrames_.end())selectedFrames_.push_back(id);else selectedFrames_.erase(it);std::sort(selectedFrames_.begin(),selectedFrames_.end(),[&](const auto& a,const auto& b){return timeline_.frameIndex(a)<timeline_.frameIndex(b);});}else selectedFrames_={id};if(mode!=1 || frameAnchor_.empty())frameAnchor_=id;if(!preserve)selectFrame(id);if(!maskContext.empty()){activeMaskId_=maskContext;maskIsolated_=isolated;}}
void Document::moveSelectedFrames(const std::string& target,bool after){auto selectionHistory=trackAnimationSelectionHistory(false);cancelStroke();cancelLayerOpacity();timeline::State previous;previous.frames=timeline_.state().frames;previous.loopSections=timeline_.state().loopSections;auto selected=selectedFrames_.empty()?std::vector<std::string>{frame().id}:selectedFrames_;auto has=[&](const auto& id){return std::find(selected.begin(),selected.end(),id)!=selected.end();};std::vector<DocumentFrame> moving,remaining;std::vector<std::string> movingIds;int targetOriginal=-1,movingStart=100000,movingEnd=-1;for(int i=0;i<int(previous.frames.size());++i){const auto& f=previous.frames[i];if(f.id==target)targetOriginal=i;if(has(f.id)){moving.push_back(f);movingIds.push_back(f.id);movingStart=std::min(movingStart,i);movingEnd=i;}else remaining.push_back(f);}if(targetOriginal<0 || moving.empty())return;auto targetIt=std::find_if(remaining.begin(),remaining.end(),[&](const auto& f){return f.id==target;});int insertion=targetIt!=remaining.end()?int(targetIt-remaining.begin())+(after?1:0):int(std::count_if(previous.frames.begin(),previous.frames.begin()+targetOriginal,[&](const auto& f){return !has(f.id);}));int side=has(target)?(after?1:-1):targetOriginal==movingStart-1 && after?-1:targetOriginal==movingEnd+1 && !after?1:0;auto reordered=remaining;reordered.insert(reordered.begin()+insertion,moving.begin(),moving.end());auto loops=timeline::reconcileLoopsReorder(previous,remaining,reordered,movingIds,insertion,side);bool same=previous.frames.size()==reordered.size() && previous.loopSections.size()==loops.size();for(std::size_t i=0;i<previous.frames.size() && same;++i)same=previous.frames[i].id==reordered[i].id;for(std::size_t i=0;i<loops.size() && same;++i)same=previous.loopSections[i].startFrameId==loops[i].startFrameId && previous.loopSections[i].endFrameId==loops[i].endFrameId;if(same)return;Edit e{{},state_,nextState_};captureFrameOrder(e,false);e.frameHistory.beforeLoops=previous.loopSections;e.beforeSelection=selectedFrames_;timeline_.state_.frames=std::move(reordered);timeline_.state_.loopSections=std::move(loops);selectedFrames_=movingIds;timeline_.buildIndex();projectActiveCelOpacities();captureFrameOrder(e,true);e.frameHistory.afterLoops=timeline_.state().loopSections;e.afterSelection=selectedFrames_;change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"移动动画帧");}
void Document::groupEdits(std::size_t start,const std::vector<std::string>& selection){
 if(start>=history_.position())return;
 std::optional<ProjectInformation> information;
 if(pendingGroupedProjectOperation_&&!groupingHistory_){information=projectInformation_;information->operation();}
 const auto discardedUndo=history_.group(start,[&](auto& entries,std::size_t from,std::size_t to){
  Edit group{{},entries[from].beforeState,entries[to-1].afterState};group.label=entries[to-1].label;
  group.documentChanged=std::any_of(entries.begin()+from,entries.begin()+to,[](const auto& entry){return entry.documentChanged;});
  group.beforeSelection=selection;group.afterSelection=selectedFrames_;
  if(entries[from].beforeFrameAnchor){group.beforeFrameAnchor=entries[from].beforeFrameAnchor;group.afterFrameAnchor=frameAnchor_;group.beforeTimelineSelection=entries[from].beforeTimelineSelection;group.afterTimelineSelection=timelineSelection_;}
  if(entries[from].beforeAnimationSelection){group.beforeAnimationSelection=entries[from].beforeAnimationSelection;group.afterAnimationSelection=captureAnimationSelection();}
  for(auto i=from;i<to;++i)group.normalizeAnimationSelection|=entries[i].normalizeAnimationSelection;
  return group;
 },[](const Edit& parent,std::size_t childrenBytes){const auto cost=parent.bytes();if(cost>HistoryStore<Edit>::unlimited-childrenBytes)throw std::length_error("History group byte cost exceeded");return cost+childrenBytes;});
 if(information){std::swap(projectInformation_,*information);pendingGroupedProjectOperation_=false;}
 ++historyRevision_;
 if(!groupingHistory_)notifyHistoryChange(HistoryStackChange::Kind::Push,history_.latest().label,discardedUndo);
 if(!groupingHistory_&&history_.latest().documentChanged)notifyRecording();
}
// Whole RGBA cel snapshot: legacy snapshotLinkedAnimationCels rebase and block anchor.
bool Document::copySelectedCels(){if((hasTilemapContent()||hasFreeTileContent())&&(active()||selection_||!activeMaskId_.empty()))throw std::runtime_error("Only complete inactive tilemap Cel copy is migrated");

 // legacy copySelectedAnimationCels filters with a Set before row/frame ordering.
 const std::unordered_set<std::string> selected(timelineSelection_.cels.begin(),timelineSelection_.cels.end());
 std::vector<CelClipboardItem> items;const auto& state=timeline_.state();
 for(const auto& cel:state.cels)if(selected.count(cel.id))items.push_back({cel,int(timeline_.layerIndex(cel.layerId)),int(timeline_.frameIndex(cel.frameId))});
 std::sort(items.begin(),items.end(),[](const auto& a,const auto& b){return a.row<b.row||(a.row==b.row&&a.column<b.column);});
 if(items.empty()){celClipboard_.clear();frameClipboard_.clear();frameClipboardMetadata_.reset();return false;}
 std::unordered_map<std::string,std::string> roots;
 const int row=items.front().row,col=items.front().column;
 for(auto& item:items){const auto resolved=timeline_.resolveSurface(item.cel.id);if(resolved.issue!=timeline::LinkIssue::None)throw std::runtime_error("Cannot resolve copied Cel");if(resolved.surface)raster::validate(*resolved.surface);const auto source=resolved.source->id;auto root=roots.find(source);if(root==roots.end())root=roots.emplace(source,selected.count(source)?source:item.cel.id).first;
 item.cel.tilemap=resolved.source->tilemap;item.cel.freeTiles=resolved.source->freeTiles;item.cel.text=resolved.source->text;const auto* mask=timeline::directMask(state,item.cel.layerId,item.cel.frameId);if(mask){item.mask=*mask;const auto* resolvedMask=timeline::resolvedMask(state,item.cel.layerId,item.cel.frameId);if(!resolvedMask)throw std::invalid_argument("Invalid copied Cel mask");item.mask->mask.surface=resolvedMask->surface;}item.cel.surface=resolved.surface?std::optional<timeline::Surface>{*resolved.surface}:std::nullopt;item.cel.linkedCelId=item.cel.id==root->second?std::nullopt:std::optional<std::string>{root->second};item.cel.runtimeSharedCelId.reset();item.row-=row;item.column-=col;}
 if(selection_){
  if(selection_->width<1||selection_->height<1||(!selection_->mask.empty()&&selection_->mask.size()!=std::uint64_t(selection_->width)*selection_->height))throw std::runtime_error("Invalid Cel copy selection");
  std::int64_t left=std::numeric_limits<int>::max(),top=left,right=std::numeric_limits<int>::min(),bottom=right;std::uint64_t storedBytes=0;
  // legacy clipAnimationCelToSelection crops each resolved source in world space.
  for(auto& item:items){if(!item.cel.surface)throw std::runtime_error("Missing copied Cel surface");const auto& source=*item.cel.surface;
   const auto x=std::max<std::int64_t>(selection_->x,source.offsetX),y=std::max<std::int64_t>(selection_->y,source.offsetY),r=std::min(std::int64_t(selection_->x)+selection_->width,std::int64_t(source.offsetX)+source.width),b=std::min(std::int64_t(selection_->y)+selection_->height,std::int64_t(source.offsetY)+source.height);
   timeline::Surface clipped;clipped.offsetX=raster::coordinate(x);clipped.offsetY=raster::coordinate(y);clipped.width=raster::coordinate(std::max<std::int64_t>(1,r-x));clipped.height=raster::coordinate(std::max<std::int64_t>(1,b-y));raster::coordinate(x+clipped.width);raster::coordinate(y+clipped.height);
   const auto area=std::uint64_t(clipped.width)*clipped.height;storedBytes+=area*sizeof(Pixel);if(area>16*1024*1024||storedBytes>256*1024*1024)throw std::runtime_error("Cel selection copy exceeds pixel budget");clipped.pixels.resize(std::size_t(area));
   for(auto wy=y;wy<b;++wy)for(auto wx=x;wx<r;++wx)if(selectionContains(selection_,int(wx),int(wy)))clipped.pixels[std::size_t(wy-y)*clipped.width+std::size_t(wx-x)]=raster::readWorld(source,wx,wy);
   left=std::min(left,x);top=std::min(top,y);right=std::max(right,x+clipped.width);bottom=std::max(bottom,y+clipped.height);item.cel.surface=std::move(clipped);item.cel.text.reset();item.cel.tilemap.reset();item.cel.freeTiles.reset();
  }
  // pasteCelSelection uses the union of all clipped surfaces as its common frame.
  const int w=raster::coordinate(right-left),h=raster::coordinate(bottom-top);const auto area=std::uint64_t(w)*h;if(area>16*1024*1024||storedBytes+area*5*items.size()>256*1024*1024)throw std::runtime_error("Cel selection copy exceeds pixel budget");
  for(auto& item:items){SelectionClipboard pixels;pixels.width=w;pixels.height=h;pixels.originX=int(left);pixels.originY=int(top);pixels.pixels.resize(std::size_t(area));pixels.mask.resize(std::size_t(area));const auto& source=*item.cel.surface;
   for(int y=0;y<source.height;++y)for(int x=0;x<source.width;++x){const auto index=std::size_t(std::int64_t(source.offsetY)+y-top)*w+std::size_t(std::int64_t(source.offsetX)+x-left);const auto value=source.pixels[std::size_t(y)*source.width+x];pixels.pixels[index]=value;pixels.mask[index]=(value>>24)!=0;}item.selectionPixels=std::move(pixels);
  }
 }
 celClipboard_=std::move(items);frameClipboard_.clear();frameClipboardMetadata_.reset();return true;
}
bool Document::cutSelectedCels(){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);if(hasTilemapContent()||hasFreeTileContent())return cutTilemapCels();if(!activeMaskId_.empty())return false;
 if(active())throw std::runtime_error("Cannot cut Cels during an active preview");
 for(const auto& id:timelineSelection_.cels){const auto* c=timeline_.findCelById(id);if(!c)continue;auto l=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==c->layerId;});if(l!=timeline_.state().layers.end() && layerEffectivelyLocked(*l))throw std::runtime_error("Cel cut layer is locked");}
 if(!copySelectedCels())return false;
 if(!selection_)return deleteSelectedCels();
 // legacy workspace-cut delegates selection-only Cel cut to deleteSelection.
 // selectedEffectTargets deduplicates shared pixel storage; linked slots survive.
 Edit edit{{},state_,nextState_};std::unordered_set<std::string> sources;
 edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.pixelSelectionHistory.pixelSelectionEdit=true;edit.pixelSelectionHistory.beforePixelsSelection=selection_;
 for(const auto& id:timelineSelection_.cels){const auto* slot=timeline_.findCelById(id);if(timelineSelection_.cels.size()>1&&slot&&!timeline_.state().layers[timeline_.layerIndex(slot->layerId)].kind.empty())continue;const auto resolved=timeline_.resolveSurface(id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.source)throw std::runtime_error("Cannot resolve cut Cel");if(!resolved.surface||!sources.insert(timeline_.linkedStorageKey(resolved.source->id)).second)continue;
  const auto& before=*resolved.surface;raster::validate(before);auto after=before;bool changed=false;
  // legacy clearSelection intersects clampSelection(document) with layer content.
  const auto left=std::max<std::int64_t>({0,selection_->x,before.offsetX}),top=std::max<std::int64_t>({0,selection_->y,before.offsetY});
  const auto right=std::min<std::int64_t>({width_,std::int64_t(selection_->x)+selection_->width,std::int64_t(before.offsetX)+before.width}),bottom=std::min<std::int64_t>({height_,std::int64_t(selection_->y)+selection_->height,std::int64_t(before.offsetY)+before.height});
  for(auto y=top;y<bottom;++y)for(auto x=left;x<right;++x){if(!selectionContains(selection_,int(x),int(y)))continue;auto& value=after.pixels[std::size_t(y-before.offsetY)*before.width+std::size_t(x-before.offsetX)];if(value){value=0;changed=true;}}
  if(changed)edit.contentHistory.surfaceChanges.push_back({resolved.source->id,before,std::move(after)});
 }
 if(edit.contentHistory.surfaceChanges.empty())return true;
 reserveHistoryEntries();change_={};applySurfaceEdit(edit,true);setSelectionValue(std::nullopt);publishChange();pushEdit(std::move(edit),U"删除动画单元格");return true;
}

// Application clipboard passes value snapshots across Document lifetimes; source IDs
// are only used by pasteCopiedCels to remap links to the destination slots.
bool Document::pasteCelClipboard(const CelClipboardSnapshot& snapshot){auto selectionHistory=trackAnimationSelectionHistory(false);if(hasFreeTileContent()||hasTilemapContent()||snapshot.tilemapContext||!snapshot.tilesets.empty()||std::any_of(snapshot.items.begin(),snapshot.items.end(),[](const auto& item){return item.cel.freeTiles.has_value();}))return pasteTilemapCels(snapshot);if(!activeMaskId_.empty())return false;
 if(snapshot.items.empty())return false;
 if(snapshot.width<1 || snapshot.height<1)throw std::invalid_argument("Invalid Cel clipboard canvas geometry");
 // legacy animationCelForTarget clones RGBA owners in world coordinates.
 // Target canvas dimensions never rescale, recenter or crop whole Cels.
 for(const auto& item:snapshot.items)if(item.cel.surface)raster::validate(*item.cel.surface);
 if(snapshot.items.front().selectionPixels)return beginCelSelectionPaste(snapshot.items);
 const auto previous=celClipboard_;celClipboard_=snapshot.items;
 try{const bool pasted=pasteCopiedCels(snapshot.sourceIdentity!=identity_);if(!pasted)celClipboard_=previous;return pasted;}catch(...){celClipboard_=previous;throw;}
}
// legacy workspace-paste-cel-selection.ts: coordinate-preserving multi-cel floating paste.
bool Document::beginCelSelectionPaste(const std::vector<CelClipboardItem>& items){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);if(hasTilemapContent()||hasFreeTileContent())return false;
 if(items.empty()||!items.front().selectionPixels)return false;commitFloatingPaste();cancelStroke();cancelLayerOpacity();
 const auto* target=timelineSelection_.cels.empty()?timeline_.findCel(activeLayerId_,activeFrameId_):timeline_.findCelById(timelineSelection_.cels.back());if(!target)return false;
 const auto& state=timeline_.state();auto index=[](const auto& entries,const std::string& id){for(int i=0;i<int(entries.size());++i)if(entries[i].id==id)return i;return -1;};const int row=index(state.layers,target->layerId),column=index(state.frames,target->frameId);
 const auto& bounds=*items.front().selectionPixels;if(bounds.width<1||bounds.height<1||std::uint64_t(bounds.width)*bounds.height>16*1024*1024)throw std::runtime_error("Invalid Cel selection clipboard geometry");std::set<std::pair<int,int>> sourceSlots;int last=int(state.frames.size())-1;
 for(const auto& item:items){if(!sourceSlots.emplace(item.row,item.column).second)throw std::runtime_error("Duplicate Cel selection slot");const auto r=std::int64_t(row)+item.row,c=std::int64_t(column)+item.column;if(r<0||r>=int(state.layers.size())||c<0||!state.layers[r].kind.empty()||layerEffectivelyLocked(state.layers[r]))return false;if(!item.selectionPixels||item.selectionPixels->width!=bounds.width||item.selectionPixels->height!=bounds.height||item.selectionPixels->originX!=bounds.originX||item.selectionPixels->originY!=bounds.originY||item.selectionPixels->pixels.size()!=std::size_t(bounds.width)*bounds.height||item.selectionPixels->mask.size()!=item.selectionPixels->pixels.size())throw std::runtime_error("Invalid Cel selection clipboard");if(c>=10000)throw std::runtime_error("Cel selection paste exceeds frame limit");last=std::max(last,int(c));}
 // Sparse frame slots consume their stored pixels, not a full canvas per frame.
 std::uint64_t storedBytes=std::uint64_t(last+1-state.frames.size())*state.layers.size()*sizeof(Pixel);
 for(const auto& stored:state.cels)if(stored.surface){raster::validate(*stored.surface);storedBytes+=std::uint64_t(stored.surface->pixels.size())*sizeof(Pixel);if(storedBytes>256*1024*1024)throw std::runtime_error("Cel selection paste exceeds pixel budget");}
 if(last>=10000||storedBytes>256*1024*1024)throw std::runtime_error("Cel selection paste exceeds pixel budget");
 auto nextFrameId=nextFrameId_;auto candidate=state;while(int(candidate.frames.size())<=last){DocumentFrame f;f.id="frame-native-"+std::to_string(identity_)+"-"+std::to_string(++nextFrameId);candidate.frames.push_back(f);for(const auto& l:candidate.layers){DocumentCel c;c.id="cel-"+l.id+"-"+f.id;c.layerId=l.id;c.frameId=f.id;c.opacity=l.opacity;timeline::Surface surface;surface.width=surface.height=1;surface.pixels.resize(1);c.surface=std::move(surface);candidate.cels.push_back(std::move(c));}}
 timeline::Timeline staged(candidate);std::vector<std::string> destinations;for(const auto& item:items){const auto* destination=staged.findCel(candidate.layers[row+item.row].id,candidate.frames[column+item.column].id);destinations.push_back(destination?destination->id:std::string{});}
 FloatingPaste floating;floating.beforeCelTimeline=state;floating.beforeTimelineSelection=timelineSelection_;floating.beforeSelectedFrames=selectedFrames_;floating.beforeSelection=selection_;floating.layerId=activeLayerId_;floating.frameId=activeFrameId_;
 // Legacy edits the resolved shared owner without detaching Cel links.
 for(std::size_t i=0;i<items.size();++i)if(!destinations[i].empty())floating.targets.push_back({*items[i].selectionPixels,destinations[i],{}});if(floating.targets.empty())return false;
 floating.source=floating.targets.front().source;floating.x=bounds.originX.value_or(0);floating.y=bounds.originY.value_or(0);floating.transform={double(floating.x),double(floating.y),double(bounds.width),double(bounds.height)};
 timeline::Timeline validated(std::move(candidate));if(!validated.diagnoseLinks().empty())throw std::runtime_error("Cel selection paste creates invalid links");
 auto previousSelection=selection_;const auto previousChange=change_;auto previousTimeline=std::move(timeline_);timeline_=std::move(validated);floating_=std::move(floating);
 try{moveFloatingPaste(bounds.originX.value_or(0),bounds.originY.value_or(0));
 // Legacy establishes its initial preview in clipboard order, then promotes
 // the active target for subsequent previews. Move owner rollback data with it.
 auto& live=*floating_;auto primary=std::find_if(live.targets.begin(),live.targets.end(),[&](const auto& target){const auto* c=timeline_.findCelById(target.celId);return c->layerId==activeLayerId_&&c->frameId==activeFrameId_;});
 if(primary!=live.targets.end())std::rotate(live.targets.begin(),primary,primary+1);
 std::unordered_set<std::string> owners;for(auto& target:live.targets){const auto resolved=timeline_.resolveSurface(target.celId);if(!owners.insert(resolved.source->id).second)continue;auto previous=std::find_if(live.targets.begin(),live.targets.end(),[&](const auto& other){return other.ownerId==resolved.source->id;});if(previous!=live.targets.end() && &*previous!=&target){target.preview.swap(previous->preview);target.baseline.swap(previous->baseline);target.ownerId.swap(previous->ownerId);}target.rotSprite.reset();}
 live.source=live.targets.front().source;
 }catch(...){timeline_=std::move(previousTimeline);floating_.reset();setSelectionValue(std::move(previousSelection));change_=previousChange;throw;}
 nextFrameId_=nextFrameId;return true;
}
bool Document::pasteCopiedCels(bool crossDocument){auto selectionHistory=trackAnimationSelectionHistory(false);if(hasTilemapContent()||hasFreeTileContent())return false;if(!activeMaskId_.empty())return false;
 if(celClipboard_.empty())return false;if(celClipboard_.front().selectionPixels)return beginCelSelectionPaste(celClipboard_);if(active() || selection_)throw std::runtime_error("Finish or cancel the current selection before Cel paste");
 const auto* target=timelineSelection_.cels.empty()?timeline_.findCel(activeLayerId_,activeFrameId_):timeline_.findCelById(timelineSelection_.cels.back());if(!target)return false;
 const auto& state=timeline_.state();auto index=[](const auto& items,const std::string& id){for(int i=0;i<int(items.size());++i)if(items[i].id==id)return i;return -1;};const int row=index(state.layers,target->layerId),column=index(state.frames,target->frameId);
 auto placements=celClipboard_;
 if(!crossDocument){
  // legacy mapAnimationCelBlock resolves copied owner/frame IDs in current order.
  const auto& anchor=placements.front().cel;const int sourceRow=index(state.layers,anchor.layerId),sourceColumn=index(state.frames,anchor.frameId);if(sourceRow<0||sourceColumn<0)return false;
  for(auto& item:placements){const int r=index(state.layers,item.cel.layerId),c=index(state.frames,item.cel.frameId);if(r<0||c<0)return false;item.row=r-sourceRow;item.column=c-sourceColumn;}
 }
 std::unordered_set<std::string> sourceIds;std::set<std::pair<int,int>> sourceSlots;
 for(const auto& item:placements){if(item.selectionPixels||item.cel.id.empty()||!sourceIds.insert(item.cel.id).second||!sourceSlots.emplace(item.row,item.column).second)throw std::runtime_error("Invalid Cel clipboard block");if(item.cel.surface)raster::validate(*item.cel.surface);}
 for(const auto& item:placements)if(item.cel.linkedCelId&&!sourceIds.count(*item.cel.linkedCelId))throw std::runtime_error("Cel clipboard link leaves copied block");

 int last=int(state.frames.size())-1;for(const auto& item:placements){const auto r=std::int64_t(row)+item.row,c=std::int64_t(column)+item.column;if(r<0 || r>=int(state.layers.size()) || c<0)return false;if(layerEffectivelyLocked(state.layers[r]))throw std::runtime_error("Cel paste target layer is locked");if(!crossDocument){const auto sourceKind=item.cel.tilemap?"tilemap":item.cel.freeTiles?"free-tile":item.cel.text?"text":"raster";const auto& targetKind=state.layers[r].kind;if(sourceKind!=(targetKind.empty()?std::string("raster"):targetKind))return false;}if(c>=10000)throw std::runtime_error("Cel paste exceeds frame limit");if(c<std::int64_t(state.frames.size())&&!timeline_.findCel(state.layers[r].id,state.frames[c].id))return false;last=std::max(last,int(c));}
 if(last>=10000)throw std::runtime_error("Cel paste exceeds frame limit");
 constexpr std::uint64_t celWorkingLimit=256ull*1024*1024;std::uint64_t beforeBytes=0,clipboardBytes=0;
 auto countBytes=[&](std::uint64_t& total,const timeline::Surface& storage){raster::validate(storage);const auto bytes=std::uint64_t(storage.pixels.size())*sizeof(Pixel);if(bytes>celWorkingLimit-total)throw std::length_error("Cel paste exceeds sparse pixel budget");total+=bytes;};
 for(const auto& c:state.cels)if(c.surface)countBytes(beforeBytes,*c.surface);for(const auto& m:state.masks)countBytes(beforeBytes,m.mask.surface);for(const auto& item:placements){if(item.cel.surface)countBytes(clipboardBytes,*item.cel.surface);if(crossDocument&&item.mask)countBytes(clipboardBytes,item.mask->mask.surface);}
 const auto appendedBytes=std::uint64_t(last+1-state.frames.size())*state.layers.size()*sizeof(Pixel);
 if(beforeBytes>celWorkingLimit/5||clipboardBytes>celWorkingLimit/4||appendedBytes>celWorkingLimit/4||beforeBytes*5+clipboardBytes*4+appendedBytes*4>celWorkingLimit)throw std::length_error("Cel paste exceeds sparse working budget");
 auto nextFrameId=nextFrameId_;timeline::State candidate=state;
 while(int(candidate.frames.size())<=last){DocumentFrame f;f.id="frame-native-"+std::to_string(identity_)+"-"+std::to_string(++nextFrameId);candidate.frames.push_back(f);for(const auto& l:candidate.layers){DocumentCel c;c.id="cel-"+l.id+"-"+f.id;c.layerId=l.id;c.frameId=f.id;c.opacity=l.opacity;timeline::Surface surface;surface.width=surface.height=1;surface.pixels.resize(1);c.surface=std::move(surface);candidate.cels.push_back(std::move(c));}}
 // Only legacy's same-document branch inherits unpasted auto-link layers.
 if(!crossDocument)for(int f=int(state.frames.size());f<int(candidate.frames.size());++f)for(int r=0;r<int(candidate.layers.size());++r){if(!candidate.layers[r].autoLinkAnimationCels || std::any_of(placements.begin(),placements.end(),[&](const auto& item){return row+item.row==r && column+item.column==f;}))continue;timeline::Timeline inherited(candidate);const auto* preceding=inherited.findCel(candidate.layers[r].id,candidate.frames[f-1].id);auto resolved=inherited.resolveSurface(preceding->id);if(!resolved.surface || (!preceding->linkedCelId && !(timeline_.findCelById(resolved.source->id)?timeline_.hasVisiblePixels(resolved.source->id):std::any_of(resolved.surface->pixels.begin(),resolved.surface->pixels.end(),[](auto p){return (p>>24)!=0;}))))continue;auto& next=*std::find_if(candidate.cels.begin(),candidate.cels.end(),[&](const auto& c){return c.layerId==candidate.layers[r].id && c.frameId==candidate.frames[f].id;});next.surface.reset();next.linkedCelId=resolved.source->id;next.opacity=resolved.source->opacity;next.zIndex=resolved.source->zIndex;next.runtimeSharedCelId.reset();next.text=resolved.source->text;next.tilemap=resolved.source->tilemap;next.freeTiles=resolved.source->freeTiles;}
 timeline::Timeline staged(candidate);std::vector<std::string> destinations;std::unordered_map<std::string,std::string> remap;
 for(const auto& item:placements){const auto* slot=staged.findCel(candidate.layers[row+item.row].id,candidate.frames[column+item.column].id);destinations.push_back(slot->id);remap[item.cel.id]=slot->id;}
 // Keep untouched members of an overwritten shared group alive.
 std::unordered_set<std::string> replaced(destinations.begin(),destinations.end());
 for(const auto& source:state.cels){if(!replaced.count(source.id))continue;const auto resolved=timeline_.resolveSurface(source.id);if(resolved.source->id!=source.id)continue;std::string survivor;for(auto& c:candidate.cels){if(replaced.count(c.id))continue;const auto member=staged.resolveSurface(c.id);if(member.issue!=timeline::LinkIssue::None||!member.source)throw std::runtime_error("Invalid inherited Cel link");if(member.source->id!=source.id)continue;if(survivor.empty()){survivor=c.id;c.surface=resolved.surface?std::optional<timeline::Surface>{*resolved.surface}:std::nullopt;c.linkedCelId.reset();}else{c.surface.reset();c.linkedCelId=survivor;}c.runtimeSharedCelId.reset();c.opacity=resolved.source->opacity;c.zIndex=resolved.source->zIndex;c.text=resolved.source->text;c.tilemap=resolved.source->tilemap;c.freeTiles=resolved.source->freeTiles;}}
 for(std::size_t i=0;i<placements.size();++i){auto& dest=*std::find_if(candidate.cels.begin(),candidate.cels.end(),[&](const auto& c){return c.id==destinations[i];});auto source=placements[i].cel;source.id=dest.id;source.layerId=dest.layerId;source.frameId=dest.frameId;if(source.linkedCelId)source.linkedCelId=remap.at(*source.linkedCelId);source.runtimeSharedCelId.reset();if(crossDocument){const auto& kind=candidate.layers[row+placements[i].row].kind;if(kind!="text")source.text.reset();if(kind!="tilemap")source.tilemap.reset();if(kind!="free-tile")source.freeTiles.reset();}dest=std::move(source);}
 auto freshMask=[&]{std::string id;do{id="mask-cel-paste-"+std::to_string(identity_)+"-"+std::to_string(++nextFrameId);}while(std::any_of(candidate.masks.begin(),candidate.masks.end(),[&](const auto& slot){return slot.mask.id==id;}));return id;};
 if(crossDocument){std::unordered_map<std::string,std::string> maskMap;std::unordered_set<std::string> removedMasks;for(std::size_t i=0;i<placements.size();++i)if(placements[i].mask){const auto& incoming=*placements[i].mask;if(incoming.group||incoming.ownerId!=placements[i].cel.layerId||incoming.frameId!=placements[i].cel.frameId||incoming.mask.id.empty())throw std::invalid_argument("Invalid portable Cel mask owner");if(!maskMap.emplace(incoming.mask.id,freshMask()).second)throw std::invalid_argument("Duplicate portable Cel mask identity");const auto target=std::find_if(candidate.cels.begin(),candidate.cels.end(),[&](const auto& c){return c.id==destinations[i];});const auto* old=timeline::directMask(state,target->layerId,target->frameId);if(old)removedMasks.insert(old->mask.id);}
  std::unordered_map<std::string,std::string> survivorMasks;for(auto& slot:candidate.masks)if(!removedMasks.count(slot.mask.id)){const auto* resolved=timeline::resolvedMask(state,slot.ownerId,slot.frameId);if(!resolved)throw std::invalid_argument("Invalid target mask link");const bool dangling=removedMasks.count(resolved->id)||(!slot.mask.linkedMaskId.empty()&&removedMasks.count(slot.mask.linkedMaskId));if(!dangling)continue;auto root=survivorMasks.find(resolved->id);if(root==survivorMasks.end())root=survivorMasks.emplace(resolved->id,removedMasks.count(resolved->id)?slot.mask.id:resolved->id).first;slot.mask.surface=resolved->surface;slot.mask.linkedMaskId=slot.mask.id==root->second?std::string{}:root->second;}
  candidate.masks.erase(std::remove_if(candidate.masks.begin(),candidate.masks.end(),[&](const auto& slot){return removedMasks.count(slot.mask.id);}),candidate.masks.end());
  for(std::size_t i=0;i<placements.size();++i)if(placements[i].mask){auto slot=*placements[i].mask;const auto target=std::find_if(candidate.cels.begin(),candidate.cels.end(),[&](const auto& c){return c.id==destinations[i];});slot.ownerId=target->layerId;slot.frameId=target->frameId;slot.mask.id=maskMap.at(slot.mask.id);if(!slot.mask.linkedMaskId.empty())slot.mask.linkedMaskId=maskMap.at(slot.mask.linkedMaskId);candidate.masks.push_back(std::move(slot));}
 }
 timeline::Timeline validated(std::move(candidate));if(!validated.diagnoseLinks().empty())throw std::runtime_error("Cel paste creates invalid links");
 TimelineSelection afterSelection=timelineSelection_;afterSelection.cels=destinations;if(crossDocument)afterSelection.celAnchor=destinations.back();
 Edit e{{},state_,nextState_};e.snapshotHistory.beforeTimeline=state;e.snapshotHistory.afterTimeline=validated.state();e.beforeActive=e.afterActive=activeLayerId_;e.beforeFrame=e.afterFrame=activeFrameId_;e.beforeTimelineSelection=timelineSelection_;e.afterTimelineSelection=afterSelection;e.beforeSelection=selectedFrames_;e.afterSelection=crossDocument?std::vector<std::string>{}:selectedFrames_;e.beforeFrameAnchor=frameAnchor_;e.afterFrameAnchor=crossDocument?std::string{}:frameAnchor_;e.maskHistory.maskContext=std::make_shared<MaskHistory::MaskContextHistory>(MaskHistory::MaskContextHistory{{},{},false,false});
 reserveHistoryEntries();capturePixelAddresses(e);timeline_=std::move(validated);nextFrameId_=nextFrameId;timelineSelection_=std::move(afterSelection);selectedFrames_=*e.afterSelection;frameAnchor_=*e.afterFrameAnchor;projectActiveCelOpacities();change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"粘贴动画单元格");return true;
}
bool Document::copySelectedFrames(){if((hasTilemapContent()||hasFreeTileContent())&&active())throw std::runtime_error("Finish the active edit before copying frames"); celClipboard_.clear();frameClipboard_.clear();frameClipboardMetadata_.reset(); const auto selected=selectedFrames_.empty()?std::vector<std::string>{frame().id}:selectedFrames_;const std::unordered_set<std::string> selectedIds(selected.begin(),selected.end());std::vector<std::string> ids;for(const auto& f:timeline_.state().frames)if(selectedIds.count(f.id))ids.push_back(f.id); std::unordered_set<std::string> copiedCels,copiedMasks;for(const auto& c:timeline_.state().cels)if(selectedIds.count(c.frameId))copiedCels.insert(c.id);for(const auto& m:timeline_.state().masks)if(selectedIds.count(m.frameId))copiedMasks.insert(m.mask.id); for(const auto& id:ids){auto fit=std::find_if(timeline_.state().frames.begin(),timeline_.state().frames.end(),[&](const auto& f){return f.id==id;}); if(fit==timeline_.state().frames.end())continue; FrameClipboardItem item;item.masks.clear();for(const auto& slot:timeline_.state().masks)if(slot.frameId==id){auto copy=slot;copy.mask.surface=timeline::resolvedMask(timeline_.state(),slot.ownerId,slot.frameId)->surface;if(!copiedMasks.count(copy.mask.linkedMaskId))copy.mask.linkedMaskId.clear();item.masks.push_back(std::move(copy));} item.frame=*fit; for(const auto& c:timeline_.state().cels) if(c.frameId==id) item.cels.push_back(c); std::unordered_set<std::string> localIds; for(const auto& c:item.cels)localIds.insert(c.id); for(auto& c:item.cels){if((c.linkedCelId && !localIds.count(*c.linkedCelId))||c.runtimeSharedCelId){auto resolved=timeline_.resolveSurface(c.id);if(resolved.surface)c.surface=*resolved.surface;if(resolved.source){c.tilemap=resolved.source->tilemap;c.freeTiles=resolved.source->freeTiles;c.text=resolved.source->text;c.opacity=resolved.source->opacity;c.zIndex=resolved.source->zIndex;}if(c.linkedCelId&&!copiedCels.count(*c.linkedCelId))c.linkedCelId.reset();}c.runtimeSharedCelId.reset();} frameClipboard_.push_back(std::move(item)); } if(!frameClipboard_.empty()){auto metadata=std::make_shared<FrameClipboardSnapshot>();metadata->layers=timeline_.state().layers;metadata->groups=timeline_.state().groups;metadata->sourceIdentity=identity_;metadata->width=width_;metadata->height=height_;for(const auto& layer:metadata->layers){const auto* current=timeline_.findCel(layer.id,activeFrameId_);if(!current){const auto geometry=displayedLayerGeometry_.find(layer.id);if(geometry==displayedLayerGeometry_.end())throw std::logic_error("Missing copied layer display geometry");metadata->layerGeometry.push_back(geometry->second);continue;}const auto resolved=timeline_.resolveSurface(current->id);if(!resolved.surface)throw std::logic_error("Missing copied layer geometry");const auto& surface=*resolved.surface;metadata->layerGeometry.push_back({surface.width,surface.height,surface.offsetX,surface.offsetY});}frameClipboardMetadata_=std::move(metadata);}return !frameClipboard_.empty(); }
// legacy workspace-cut.ts copies first; frame deletion leaves at least one frame.
bool Document::cutSelectedFrames(){if(hasFreeTileContent()||hasTilemapContent())return cutTilemapFrames();
 if(!copySelectedFrames())return false;
 const auto selection=selectedFrames_;
 const auto ids=selection.empty()?std::vector<std::string>{frame().id}:selection;
 const auto start=history_.position();groupingHistory_=true;
 for(const auto& id:ids){if(timeline_.state().frames.size()<=1)break;selectFrame(id);deleteFrame();}
 clearFrameSelection();normalizeFrameDeletionSelection();groupingHistory_=false;groupEdits(start,selection);
 return history_.position()>start;
}
Document::FrameClipboardSnapshot Document::exportFrameClipboard()const{
 if((hasTilemapContent()||hasFreeTileContent())&&active())throw std::runtime_error("Finish the active edit before copying frames");
 FrameClipboardSnapshot out=frameClipboardMetadata_?*frameClipboardMetadata_:FrameClipboardSnapshot{{},timeline_.state().layers,identity_,width_,height_};out.items=frameClipboard_;
 std::unordered_set<std::string> capturedCelIds;for(const auto& item:out.items)for(const auto& c:item.cels)capturedCelIds.insert(c.id);
 // Legacy frame clipboard owns cloned content. Re-export never samples live
 // Cels or masks: editing/deleting/relinking the source cannot change a copy.
 for(auto& item:out.items)for(auto& cel:item.cels){if(cel.linkedCelId&&!capturedCelIds.count(*cel.linkedCelId))cel.linkedCelId.reset();cel.runtimeSharedCelId.reset();if(cel.surface)raster::validate(*cel.surface);}
 std::unordered_set<std::string> copiedMaskIds;for(const auto& item:out.items)for(const auto& slot:item.masks)copiedMaskIds.insert(slot.mask.id);
 for(auto& item:out.items)for(auto& slot:item.masks)if(!copiedMaskIds.count(slot.mask.linkedMaskId))slot.mask.linkedMaskId.clear();
 if(!frameClipboardMetadata_)out.groups=timeline_.state().groups;
 std::unordered_set<std::string> referenced;
 for(const auto& l:out.layers){if(l.kind=="tilemap")referenced.insert(l.tilemapTilesetId);if(l.freeTiles){if(!l.freeTiles->legacyTilesetId.empty())referenced.insert(l.freeTiles->legacyTilesetId);for(const auto& src:l.freeTiles->sources)referenced.insert(src.tilesetId);}}
 for(const auto& item:out.items)for(const auto& c:item.cels)if(c.tilemap)for(const auto& cell:c.tilemap->cells)if(cell)referenced.insert(cell->tilesetId);
 std::size_t pixels=0;for(const auto& item:out.items)for(const auto& c:item.cels)if(c.surface){if(c.surface->pixels.size()>64*1024*1024-pixels)throw std::length_error("Frame clipboard memory limit");pixels+=c.surface->pixels.size();}
 for(const auto& set:timeline_.state().tilesets)if(referenced.erase(set.id)){if(set.pixels.size()>64*1024*1024-pixels)throw std::length_error("Frame clipboard memory limit");pixels+=set.pixels.size();out.tilesets.push_back(set);}
 if(!referenced.empty())throw std::invalid_argument("Missing frame clipboard tileset");
 return out;
}
bool Document::pasteFrameClipboard(const FrameClipboardSnapshot& snapshot){if(hasFreeTileContent()||hasTilemapContent()||!snapshot.tilesets.empty()||std::any_of(snapshot.layers.begin(),snapshot.layers.end(),[](const auto& l){return l.kind=="free-tile";}))return pasteTilemapFrames(snapshot);
 if(snapshot.items.empty())return false;
 if(snapshot.sourceIdentity==identity_)return pasteCopiedFrames();
 if(active())throw std::runtime_error("Finish the active edit before pasting frames");
 if(snapshot.width<1 || snapshot.height<1)throw std::runtime_error("Invalid frame clipboard canvas dimensions");
 const auto& before=timeline_.state();const auto layerCount=std::max(before.layers.size(),snapshot.layers.size());const auto frameCount=before.frames.size()+snapshot.items.size();
 if(layerCount>256 || frameCount>10000)throw std::runtime_error("Frame paste exceeds layer or frame limit");
 std::unordered_map<std::string,std::size_t> sourceLayers;for(std::size_t n=0;n<snapshot.layers.size();++n)if(!sourceLayers.emplace(snapshot.layers[n].id,n).second)throw std::runtime_error("Duplicate clipboard layer");
 // Same sparse-storage working budget as Cel paste; source geometry is
 // independent of either canvas, and blank destination slots use our canvas.
 constexpr std::uint64_t frameWorkingLimit=256ull*1024*1024;std::uint64_t beforeBytes=0,clipboardBytes=0;
 auto countBytes=[&](std::uint64_t& total,const timeline::Surface& storage){raster::validate(storage);const auto bytes=std::uint64_t(storage.pixels.size())*sizeof(Pixel);if(bytes>frameWorkingLimit-total)throw std::length_error("Frame paste exceeds sparse pixel budget");total+=bytes;};
 for(const auto& c:before.cels)if(c.surface)countBytes(beforeBytes,*c.surface);for(const auto& m:before.masks)countBytes(beforeBytes,m.mask.surface);
 std::uint64_t blankSlots=(layerCount-before.layers.size())*before.frames.size();
 for(const auto& item:snapshot.items){if(item.frame.duration<1 || item.frame.duration>60000)throw std::runtime_error("Invalid frame clipboard duration");std::unordered_set<std::string> occupied;
  for(const auto& cel:item.cels){if(!sourceLayers.count(cel.layerId))throw std::runtime_error("Missing frame clipboard layer");if(cel.frameId!=item.frame.id||!occupied.insert(cel.layerId).second)throw std::runtime_error("Invalid frame clipboard Cel slot");if(cel.surface)countBytes(clipboardBytes,*cel.surface);}
  for(const auto& m:item.masks)countBytes(clipboardBytes,m.mask.surface);blankSlots+=layerCount-occupied.size();
 }
 if(!snapshot.layerGeometry.empty()&&snapshot.layerGeometry.size()!=snapshot.layers.size())throw std::invalid_argument("Invalid frame layer geometry count");
 std::uint64_t activeBlankPixels=0;for(std::size_t n=before.layers.size();n<snapshot.layers.size();++n){const auto geometry=snapshot.layerGeometry.empty()?std::array<int,4>{snapshot.width,snapshot.height,0,0}:snapshot.layerGeometry[n];if(geometry[0]<1||geometry[1]<1||std::int64_t(geometry[2])+geometry[0]>std::numeric_limits<int>::max()||std::int64_t(geometry[3])+geometry[1]>std::numeric_limits<int>::max())throw std::invalid_argument("Invalid frame layer geometry");const auto count=std::uint64_t(geometry[0])*geometry[1];if(count>frameWorkingLimit/sizeof(Pixel)-activeBlankPixels)throw std::length_error("Frame layer geometry exceeds pixel budget");activeBlankPixels+=count;}
 const auto activeBlankSlots=layerCount-before.layers.size();const auto appendedBytes=((blankSlots-activeBlankSlots)+activeBlankPixels)*sizeof(Pixel);
 if(beforeBytes>frameWorkingLimit/5||clipboardBytes>frameWorkingLimit/4||appendedBytes>frameWorkingLimit/4||beforeBytes*5+clipboardBytes*4+appendedBytes*4>frameWorkingLimit)throw std::length_error("Frame paste exceeds sparse working budget");
 auto candidate=before;std::uint64_t next=nextFrameId_;auto fresh=[&](const char* prefix){return std::string(prefix)+std::to_string(identity_)+"-"+std::to_string(++next);};
 auto blank=[&](const DocumentLayer& layer,const std::string& frame,std::optional<std::size_t> sourceIndex=std::nullopt){DocumentCel cel;cel.id=fresh("cel-frame-paste-");cel.layerId=layer.id;cel.frameId=frame;cel.opacity=layer.opacity;timeline::Surface surface;surface.width=surface.height=1;if(frame==activeFrameId_&&sourceIndex){const auto geometry=snapshot.layerGeometry.empty()?std::array<int,4>{snapshot.width,snapshot.height,0,0}:snapshot.layerGeometry[*sourceIndex];surface.width=geometry[0];surface.height=geometry[1];surface.offsetX=geometry[2];surface.offsetY=geometry[3];}surface.pixels.resize(std::size_t(surface.width)*surface.height);cel.surface=std::move(surface);return cel;};
 for(std::size_t n=candidate.layers.size();n<snapshot.layers.size();++n){const auto& source=snapshot.layers[n];DocumentLayer layer;layer.name=source.name;layer.kind=source.kind;layer.visible=source.visible;layer.locked=source.locked;layer.opacity=source.opacity;layer.blendMode=source.blendMode;layer.clippingMask=source.clippingMask;do{layer.id=fresh("layer-frame-paste-");}while(std::any_of(candidate.layers.begin(),candidate.layers.end(),[&](const auto& item){return item.id==layer.id;}));layer.autoLinkAnimationCels=false;candidate.layers.push_back(layer);for(const auto& frame:before.frames)candidate.cels.push_back(blank(layer,frame.id,n));}
 int insert=int(activeFrameIndex())+1;if(!selectedFrames_.empty()){insert=0;for(int n=0;n<int(before.frames.size());++n)if(std::find(selectedFrames_.begin(),selectedFrames_.end(),before.frames[n].id)!=selectedFrames_.end())insert=n+1;}
 std::vector<std::string> inserted;std::unordered_map<std::string,std::string> celRemap;std::vector<DocumentCel> incoming;
 for(const auto& item:snapshot.items){auto frame=item.frame;do{frame.id=fresh("frame-paste-");}while(std::any_of(candidate.frames.begin(),candidate.frames.end(),[&](const auto& old){return old.id==frame.id;}));candidate.frames.insert(candidate.frames.begin()+insert++,frame);inserted.push_back(frame.id);for(std::size_t n=0;n<candidate.layers.size();++n){const auto source=std::find_if(item.cels.begin(),item.cels.end(),[&](const auto& cel){return sourceLayers.at(cel.layerId)==n;});if(source==item.cels.end()){incoming.push_back(blank(candidate.layers[n],frame.id));continue;}auto cel=*source;const auto sourceId=cel.id;cel.id=fresh("cel-frame-paste-");cel.layerId=candidate.layers[n].id;cel.frameId=frame.id;cel.runtimeSharedCelId.reset();
 // Legacy animationCelForTarget retains editable metadata only for its target kind.
 if(candidate.layers[n].kind!="text")cel.text.reset();if(candidate.layers[n].kind!="tilemap")cel.tilemap.reset();if(candidate.layers[n].kind!="free-tile")cel.freeTiles.reset();
 if(!celRemap.emplace(sourceId,cel.id).second)throw std::runtime_error("Duplicate frame clipboard Cel");incoming.push_back(std::move(cel));}}
 for(auto& cel:incoming)if(cel.linkedCelId){const auto mapped=celRemap.find(*cel.linkedCelId);if(mapped==celRemap.end())cel.linkedCelId.reset();else{cel.linkedCelId=mapped->second;cel.surface.reset();}}
 // Legacy cross-document frame paste remaps copied layer/group masks by owner index.
 std::unordered_map<std::string,std::string> maskRemap;
 for(const auto& item:snapshot.items)for(const auto& slot:item.masks)if(!maskRemap.emplace(slot.mask.id,fresh("mask-frame-paste-")).second)throw std::runtime_error("Duplicate frame clipboard mask");
 for(std::size_t i=0;i<snapshot.items.size();++i)for(auto slot:snapshot.items[i].masks){
  if(slot.frameId!=snapshot.items[i].frame.id)throw std::runtime_error("Invalid frame clipboard mask frame");
  if(slot.group){auto owner=std::find_if(snapshot.groups.begin(),snapshot.groups.end(),[&](const auto& g){return g.id==slot.ownerId;});if(owner==snapshot.groups.end())throw std::runtime_error("Missing frame clipboard group");const auto index=std::size_t(owner-snapshot.groups.begin());if(index>=before.groups.size())continue;slot.ownerId=before.groups[index].id;}
  else{auto owner=sourceLayers.find(slot.ownerId);if(owner==sourceLayers.end())throw std::runtime_error("Missing frame clipboard mask layer");slot.ownerId=candidate.layers[owner->second].id;}
  slot.frameId=inserted[i];slot.mask.id=maskRemap.at(slot.mask.id);auto linked=maskRemap.find(slot.mask.linkedMaskId);slot.mask.linkedMaskId=linked==maskRemap.end()?std::string{}:linked->second;raster::validate(slot.mask.surface);candidate.masks.push_back(std::move(slot));
 }
 candidate.cels.insert(candidate.cels.end(),incoming.begin(),incoming.end());timeline::Timeline validated(std::move(candidate));if(!validated.diagnoseLinks().empty())throw std::runtime_error("Frame paste creates invalid links");
 Edit edit{{},state_,nextState_};edit.snapshotHistory.beforeTimeline=before;edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=activeFrameId_;edit.beforeSelection=selectedFrames_;edit.beforeTimelineSelection=timelineSelection_;edit.beforeTimelineSelection->cels.clear();edit.beforeTimelineSelection->celAnchor.clear();edit.beforeFrameAnchor=frameAnchor_;edit.snapshotHistory.afterTimeline=validated.state();edit.afterFrame=inserted.front();edit.afterSelection=inserted;edit.afterTimelineSelection=decltype(timelineSelection_){};edit.afterTimelineSelection->layers=timelineSelection_.layers;edit.afterTimelineSelection->layerAnchor=timelineSelection_.layerAnchor;edit.afterFrameAnchor=inserted.back();edit.maskHistory.maskToActivateOnRedo=std::string{};reserveHistoryEntries();
 activeMaskId_.clear();maskIsolated_=false;timeline_=std::move(validated);nextFrameId_=next;activeFrameId_=inserted.front();projectActiveCelOpacities();selectedFrames_=inserted;timelineSelection_=*edit.afterTimelineSelection;frameAnchor_=inserted.back();change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"粘贴动画帧");return true;
}
// legacy workspace-commands-animation-frame.ts::importGifAnimationLayer.
bool Document::importGifAnimationLayer(const Document& source,int startFrameIndex,const std::vector<MaskSlotKey>* maskSelection,const std::optional<MaskSlotKey>* maskAnchor){
 const auto& incoming=source.timeline().state();if(incoming.layers.empty() || incoming.frames.empty())return false;
 if(active() && !floating())throw std::runtime_error("Finish the active edit before importing GIF");
 const int start=std::clamp(startFrameIndex,0,int(timeline_.state().frames.size()));const auto total=std::max(timeline_.state().frames.size(),std::size_t(start)+incoming.frames.size());
 if(timeline_.state().layers.size()>=256 || total>10000)throw std::runtime_error("GIF timeline import exceeds pixel memory limit");
 std::vector<DocumentCel> sourceCels;for(const auto& frame:incoming.frames){const auto* cel=source.timeline().findCel(incoming.layers.front().id,frame.id);if(!cel)throw std::runtime_error("GIF frame has no layer slot");const auto resolved=source.timeline().resolveSurface(cel->id);if(resolved.issue!=timeline::LinkIssue::None || !resolved.surface)throw std::runtime_error("Invalid GIF frame surface");const auto& surface=*resolved.surface;raster::validate(surface);if(frame.duration<1 || frame.duration>60000)throw std::runtime_error("Invalid GIF frame duration");auto copy=*cel;copy.surface=surface;copy.linkedCelId.reset();copy.runtimeSharedCelId.reset();sourceCels.push_back(std::move(copy));}
 // Imported surfaces keep their own geometry, independent of canvas size.
 // Reuse the sparse working budget from Cel/frame paste before settling edits.
 constexpr std::uint64_t gifWorkingLimit=256ull*1024*1024;std::uint64_t beforeBytes=0,sourceBytes=0;
 auto countBytes=[&](std::uint64_t& sum,const timeline::Surface& surface){raster::validate(surface);const auto bytes=std::uint64_t(surface.pixels.size())*sizeof(Pixel);if(bytes>gifWorkingLimit-sum)throw std::length_error("GIF import exceeds sparse pixel budget");sum+=bytes;};
 // Legacy ensureAnimationDocument builds one first-grid template per owner.
 // Keep special empty slots editable, and account for their real raster/grid
 // allocations before committing a pending edit or copying the timeline.
 std::unordered_map<std::string,const tiles::CelData*> gridTemplates;
 auto chargeBytes=[&](std::uint64_t& sum,std::uint64_t bytes){if(bytes>gifWorkingLimit-sum)throw std::length_error("GIF import exceeds sparse storage budget");sum+=bytes;};
 for(const auto& c:timeline_.state().cels){if(c.surface)countBytes(beforeBytes,*c.surface);if(c.tilemap){gridTemplates.emplace(c.layerId,&*c.tilemap);chargeBytes(beforeBytes,std::uint64_t(c.tilemap->cells.size())*sizeof(std::optional<tiles::Cell>));}}
 for(const auto& t:timeline_.state().tilesets)chargeBytes(beforeBytes,std::uint64_t(t.pixels.size())*sizeof(Pixel));
 for(const auto& m:timeline_.state().masks)countBytes(beforeBytes,m.mask.surface);for(const auto& c:sourceCels)countBytes(sourceBytes,*c.surface);
 // Legacy normalization keeps nonactive empty slots at 1x1. The new
 // layer's unimported active slot uses the source layer's displayed geometry.
 const auto& sourceGeometry=*sourceCels[source.activeFrameIndex()].surface;
 const bool activeBlank=activeFrameIndex()<std::size_t(start)||activeFrameIndex()>=std::size_t(start)+sourceCels.size();
 std::uint64_t blankPixels=(total-timeline_.state().frames.size())*timeline_.state().layers.size()+total-sourceCels.size();
 if(activeBlank)blankPixels+=std::uint64_t(sourceGeometry.width)*sourceGeometry.height-1;
 std::uint64_t blankBytes=blankPixels*sizeof(Pixel);
 const auto appended=total-timeline_.state().frames.size();
 for(const auto& owner:timeline_.state().layers){
  if(owner.kind=="tilemap"){const auto found=gridTemplates.find(owner.id);if(found==gridTemplates.end())throw std::invalid_argument("Missing GIF destination grid template");const auto& grid=*found->second;tiles::sizeCheck(grid.tileWidth,grid.tileHeight,grid.columns,grid.rows);if(grid.cells.size()!=std::size_t(grid.columns)*grid.rows)throw std::invalid_argument("Invalid GIF destination grid template");const auto pixels=std::uint64_t(grid.columns)*grid.tileWidth*grid.rows*grid.tileHeight;chargeBytes(blankBytes,appended*((pixels-1)*sizeof(Pixel)+std::uint64_t(grid.cells.size())*sizeof(std::optional<tiles::Cell>)));}
  else if(owner.kind=="free-tile"&&owner.freeTiles&&(!owner.freeTiles->sources.empty()||!owner.freeTiles->legacyTilesetId.empty()))chargeBytes(blankBytes,appended*(std::uint64_t(width_)*height_-1)*sizeof(Pixel));
 }
 if(beforeBytes>gifWorkingLimit/5||sourceBytes>gifWorkingLimit/4||blankBytes>gifWorkingLimit/4||beforeBytes*5+sourceBytes*4+blankBytes*4>gifWorkingLimit)throw std::length_error("GIF import exceeds sparse working budget");
 // Validation precedes pending-paste commit; imported structure is one further edit.
 commitFloatingPaste();const auto before=timeline_.state();gridTemplates.clear();for(const auto& c:before.cels)if(c.tilemap)gridTemplates.emplace(c.layerId,&*c.tilemap);auto candidate=before;std::uint64_t next=nextFrameId_;auto fresh=[&](const char* prefix){return std::string(prefix)+std::to_string(identity_)+"-"+std::to_string(++next);};
 auto blank=[&](const DocumentLayer& layer,const std::string& frame,const timeline::Surface* geometry=nullptr){DocumentCel cel;cel.id=fresh("cel-gif-");cel.layerId=layer.id;cel.frameId=frame;cel.opacity=layer.opacity;timeline::Surface surface;surface.width=surface.height=1;if(geometry){surface.width=geometry->width;surface.height=geometry->height;surface.offsetX=geometry->offsetX;surface.offsetY=geometry->offsetY;}if(layer.kind=="tilemap"){cel.tilemap=*gridTemplates.at(layer.id);std::fill(cel.tilemap->cells.begin(),cel.tilemap->cells.end(),std::nullopt);surface.width=cel.tilemap->columns*cel.tilemap->tileWidth;surface.height=cel.tilemap->rows*cel.tilemap->tileHeight;}else if(layer.kind=="free-tile"){cel.freeTiles=free_tiles::CelData{};if(layer.freeTiles&&(!layer.freeTiles->sources.empty()||!layer.freeTiles->legacyTilesetId.empty())){surface.width=width_;surface.height=height_;}}surface.pixels.resize(std::size_t(surface.width)*surface.height);cel.surface=std::move(surface);return cel;};
 while(candidate.frames.size()<total){auto frame=incoming.frames[candidate.frames.size()-start];frame.id=fresh("frame-gif-");candidate.frames.push_back(frame);for(const auto& layer:before.layers)candidate.cels.push_back(blank(layer,frame.id));}
 DocumentLayer layer;layer.id=fresh("layer-gif-");layer.name=source.name().empty()?U"GIF":source.name();candidate.layers.push_back(layer);std::vector<std::string> imported;
 for(std::size_t i=0;i<candidate.frames.size();++i){const bool importedSlot=i>=std::size_t(start)&&i<std::size_t(start)+sourceCels.size();auto cel=blank(layer,candidate.frames[i].id,!importedSlot&&candidate.frames[i].id==activeFrameId_?&sourceGeometry:nullptr);if(importedSlot){cel.surface=sourceCels[i-start].surface;cel.opacity=sourceCels[i-start].opacity;cel.zIndex=sourceCels[i-start].zIndex;imported.push_back(cel.id);}candidate.cels.push_back(std::move(cel));}
 timeline::Timeline validated(std::move(candidate));if(!validated.diagnoseLinks().empty())throw std::runtime_error("GIF import creates invalid links");Edit edit{{},state_,nextState_};edit.snapshotHistory.beforeTimeline=before;edit.snapshotHistory.afterTimeline=validated.state();edit.beforeActive=activeLayerId_;edit.afterActive=layer.id;edit.beforeFrame=activeFrameId_;edit.afterFrame=validated.state().frames[start].id;edit.beforeSelection=selectedFrames_;edit.afterSelection={};edit.beforeFrameAnchor=frameAnchor_;edit.afterFrameAnchor="";edit.beforeTimelineSelection=timelineSelection_;auto selected=decltype(timelineSelection_){};selected.layers={layer.id};selected.layerAnchor=layer.id;selected.cels=imported;selected.celAnchor=imported.back();edit.afterTimelineSelection=selected;
 // Legacy GIF import captures/restores animation selection history, exits mask
 // editing and selects only the newly imported ordinary layer.
 edit.maskHistory.maskContext=std::make_shared<MaskHistory::MaskContextHistory>(MaskHistory::MaskContextHistory{activeMaskId_,{},maskIsolated_,false});
 edit.layerHistory.beforeGroupUi=GroupUiSnapshot{selectedGroupIds_,collapsedGroupIds_,selectedGroupId_};edit.layerHistory.afterGroupUi=GroupUiSnapshot{{},collapsedGroupIds_,{}};
 if(maskSelection){edit.maskHistory.beforeMaskSelection=*maskSelection;edit.maskHistory.afterMaskSelection=std::vector<MaskSlotKey>{};edit.maskHistory.beforeMaskSelectionAnchor.emplace(maskAnchor?*maskAnchor:(maskSelection->empty()?std::optional<MaskSlotKey>{}:std::optional<MaskSlotKey>{maskSelection->back()}));edit.maskHistory.afterMaskSelectionAnchor.emplace(std::nullopt);}
 reserveHistoryEntries();
 if(maskSelection){maskSelectionHistory_.slots.clear();maskSelectionHistory_.anchor=edit.maskHistory.afterMaskSelectionAnchor;++maskSelectionHistory_.serial;}
 activeMaskId_.clear();maskIsolated_=false;applyGroupUi(edit,true);
 timeline_=std::move(validated);nextFrameId_=next;activeLayerId_=layer.id;activeFrameId_=edit.afterFrame;projectActiveCelOpacities();timelineSelection_=std::move(selected);selectedFrames_.clear();frameAnchor_.clear();change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"导入 GIF 动画");return true;
}
bool Document::pasteCopiedFrames(bool duplicateSelection){
 if(hasTilemapContent()||hasFreeTileContent())return false;cancelStroke();cancelLayerOpacity();if(frameClipboard_.empty())return false;
 // Legacy ensureAnimationDocument filters deleted owners and fills missing
 // slots for current layers before applying preceding-frame auto-links.
 FrameClipboardSnapshot snapshot{frameClipboard_,timeline_.state().layers,identity_,width_,height_};snapshot.groups=timeline_.state().groups;
 std::uint64_t temporaryPixels=0;constexpr std::uint64_t limit=64ull*1024*1024;
 for(auto& item:snapshot.items){
  item.cels.erase(std::remove_if(item.cels.begin(),item.cels.end(),[&](const auto& c){return !timeline_.hasLayer(c.layerId);}),item.cels.end());
  for(auto& c:item.cels){c.linkedCelId.reset();c.runtimeSharedCelId.reset();if(c.surface){if(c.surface->pixels.size()>limit-temporaryPixels)throw std::length_error("Frame clipboard normalization exceeds pixel budget");temporaryPixels+=c.surface->pixels.size();}}
  for(const auto& layer:snapshot.layers)if(std::none_of(item.cels.begin(),item.cels.end(),[&](const auto& c){return c.layerId==layer.id;})){
   // These inserted frame slots are nonactive when legacy normalizes them.
   constexpr std::uint64_t count=1;if(count>limit-temporaryPixels)throw std::length_error("Frame clipboard normalization exceeds pixel budget");temporaryPixels+=count;
   DocumentCel blank;blank.id="clipboard-blank-"+layer.id+"-"+item.frame.id;while(std::any_of(item.cels.begin(),item.cels.end(),[&](const auto& c){return c.id==blank.id;}))blank.id+="-blank";blank.layerId=layer.id;blank.frameId=item.frame.id;blank.opacity=layer.opacity;timeline::Surface surface;surface.width=surface.height=1;surface.pixels.resize(count);blank.surface=std::move(surface);item.cels.push_back(std::move(blank));
  }
  item.masks.erase(std::remove_if(item.masks.begin(),item.masks.end(),[&](const auto& mask){return mask.group?!findGroup(mask.ownerId):!timeline_.hasLayer(mask.ownerId);}),item.masks.end());for(auto& mask:item.masks)mask.mask.linkedMaskId.clear();
 }
 return pasteTilemapFrames(snapshot,duplicateSelection);
}

void Document::setAnimationLoop(bool loop){if(animationLoop_==loop)return;Edit e{{},state_,nextState_};e.frameHistory.beforeAnimationLoop=animationLoop_;e.frameHistory.afterAnimationLoop=loop;animationLoop_=loop;pushEdit(std::move(e),U"修改动画循环");}
std::string Document::createLoopSection(std::optional<timeline::LoopSection> draft){auto ids=selectedFrames_.empty()?std::vector<std::string>{frame().id}:selectedFrames_;int left=100000,right=-1;for(int i=0;i<int(timeline_.state().frames.size());++i)if(std::find(ids.begin(),ids.end(),timeline_.state().frames[i].id)!=ids.end()){left=std::min(left,i);right=i;}if(right<0)return {};timeline::LoopSection section;section.id="loop-native-"+std::to_string(identity_)+"-"+std::to_string(nextState_);int n=1;for(;;++n){const auto text="Loop "+std::to_string(n);section.name=U"循环节 "+std::u32string(text.begin()+5,text.end());if(std::none_of(timeline_.state().loopSections.begin(),timeline_.state().loopSections.end(),[&](const auto& s){return s.name==section.name;}))break;}section.startFrameId=timeline_.state().frames[left].id;section.endFrameId=timeline_.state().frames[right].id;if(draft){const auto generatedId=section.id;section=*draft;section.id=generatedId;const auto r=timeline::loopRange(timeline_.state(),section);if(r.start<0 || r.end<0)return {};section.startFrameId=timeline_.state().frames[r.start].id;section.endFrameId=timeline_.state().frames[r.end].id;}Edit e{{},state_,nextState_};e.frameHistory.beforeLoops=timeline_.state().loopSections;timeline_.state_.loopSections.push_back(section);e.frameHistory.afterLoops=timeline_.state().loopSections;pushEdit(std::move(e),U"创建循环节");return section.id;}
void Document::updateLoopSection(timeline::LoopSection section){cancelStroke();const auto r=timeline::loopRange(timeline_.state(),section);if(r.start<0 || r.end<0)return;section.startFrameId=timeline_.state().frames[r.start].id;section.endFrameId=timeline_.state().frames[r.end].id;if(section.name.empty())section.name=U"Loop";if(section.name.size()>64)section.name.resize(64);if(section.repeatCount)section.repeatCount=std::clamp(*section.repeatCount,1,9999);auto it=std::find_if(timeline_.state_.loopSections.begin(),timeline_.state_.loopSections.end(),[&](const auto& s){return s.id==section.id;});if(it==timeline_.state_.loopSections.end())return;Edit e{{},state_,nextState_};e.frameHistory.beforeLoops=timeline_.state().loopSections;*it=std::move(section);e.frameHistory.afterLoops=timeline_.state().loopSections;pushEdit(std::move(e),U"修改循环节");}
void Document::deleteLoopSection(const std::string& id){auto& loops=timeline_.state_.loopSections;if(std::none_of(loops.begin(),loops.end(),[&](const auto& s){return s.id==id;}))return;Edit e{{},state_,nextState_};e.frameHistory.beforeLoops=loops;loops.erase(std::remove_if(loops.begin(),loops.end(),[&](const auto& s){return s.id==id;}),loops.end());e.frameHistory.afterLoops=loops;pushEdit(std::move(e),U"删除循环节");}
bool Document::canReverseSelectedFrames() const {
 return std::count_if(timeline_.state().frames.begin(),timeline_.state().frames.end(),[this](const auto& f){return std::find(selectedFrames_.begin(),selectedFrames_.end(),f.id)!=selectedFrames_.end();})>=2;
}
void Document::reverseSelectedFrames() {auto selectionHistory=trackAnimationSelectionHistory(false);
 if(!canReverseSelectedFrames())return;
 cancelStroke();cancelLayerOpacity();
 const auto before=timeline_.state().frames;
 auto selected=[this](const auto& f){return std::find(selectedFrames_.begin(),selectedFrames_.end(),f.id)!=selectedFrames_.end();};
 std::vector<DocumentFrame> reversed;for(const auto& f:before)if(selected(f))reversed.push_back(f);
 std::reverse(reversed.begin(),reversed.end());auto after=before;std::size_t index=0;
 for(auto& f:after)if(selected(f))f=reversed[index++];
 auto loops=timeline_.state().loopSections;
 for(std::size_t l=0;l<loops.size();++l){
  const auto& old=timeline_.state().loopSections[l];
  for(std::size_t i=0;i<before.size();++i){if(old.startFrameId==before[i].id)loops[l].startFrameId=after[i].id;if(old.endFrameId==before[i].id)loops[l].endFrameId=after[i].id;}
 }
 Edit e{{},state_,nextState_};captureFrameOrder(e,false);e.beforeSelection=selectedFrames_;e.frameHistory.beforeLoops=timeline_.state().loopSections;
 timeline_.state_.frames=std::move(after);timeline_.state_.loopSections=std::move(loops);selectedFrames_.clear();
 for(const auto& f:timeline_.state().frames)if(std::find(e.beforeSelection->begin(),e.beforeSelection->end(),f.id)!=e.beforeSelection->end())selectedFrames_.push_back(f.id);
 timeline_.buildIndex();captureFrameOrder(e,true);e.afterSelection=selectedFrames_;e.frameHistory.afterLoops=timeline_.state().loopSections;
 change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"反转帧顺序");
}
// Adapter of legacy workspace-animation-selection.ts::normalizeAnimationSelection
// restricted to the identities that frame deletion can invalidate.
void Document::normalizeFrameDeletionSelection(){
 selectedFrames_.erase(std::remove_if(selectedFrames_.begin(),selectedFrames_.end(),[&](const auto& id){return !timeline_.hasFrame(id);}),selectedFrames_.end());
 auto& cells=timelineSelection_.cels;cells.erase(std::remove_if(cells.begin(),cells.end(),[&](const auto& id){return !timeline_.findCelById(id);}),cells.end());
 if(!selectedFrames_.empty())cells.clear();else if(!cells.empty())timelineSelection_.maskRows.clear();
 if(std::find(selectedFrames_.begin(),selectedFrames_.end(),frameAnchor_)==selectedFrames_.end())frameAnchor_=selectedFrames_.empty()?std::string{}:selectedFrames_.back();
 if(std::find(cells.begin(),cells.end(),timelineSelection_.celAnchor)==cells.end())timelineSelection_.celAnchor=cells.empty()?std::string{}:cells.back();
 if(timelineSelection_.layers.empty()&&selectedGroupIds_.empty()&&selectedFrames_.empty()&&cells.empty()&&timelineSelection_.maskRows.empty()){timelineSelection_.layers={activeLayerId_};if(timelineSelection_.layerAnchor.empty())timelineSelection_.layerAnchor=activeLayerId_;}
}
// captureFrameOrder: definition in its history domain unit.
void Document::addFrame(bool duplicate) {auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);
 commitFloatingPaste();
 cancelStroke();cancelLayerOpacity();if(timeline_.state().frames.size()>=10000)throw std::runtime_error("Frame limit reached");
 constexpr std::uint64_t frameByteLimit=256ull*1024*1024;
 if(hasTilemapContent()||hasFreeTileContent()){if(std::uint64_t(width_)*height_*timeline_.state().layers.size()*(timeline_.state().frames.size()+1)*4>frameByteLimit)throw std::runtime_error("Frame pixel memory limit reached");}
 else{
  std::uint64_t used=adjustmentStorageBudget(timeline_,1);auto reserve=[&](std::uint64_t bytes){if(bytes>frameByteLimit-used)throw std::length_error("Frame storage exceeds pixel budget");used+=bytes;};
  // Existing masks and their before/after snapshots are real allocations too.
  for(const auto& mask:timeline_.state().masks){reserve(std::uint64_t(mask.mask.surface.pixels.size())*sizeof(Pixel)*4);}
  for(const auto& l:timeline_.state().layers){const auto* slot=timeline_.findCel(l.id,activeFrameId_);const auto source=slot?timeline_.resolveSurface(slot->id):timeline::Resolution{};const auto count=duplicate&&source.surface?source.surface->pixels.size():std::size_t(1);reserve(std::uint64_t(count)*sizeof(Pixel)*2);}
 }


 for(const auto& l:timeline_.state().layers)if(l.kind=="free-tile"||l.kind=="tilemap"){
  const auto* slot=timeline_.findCel(l.id,frame().id);if(!slot){if(l.kind=="free-tile")continue;throw std::runtime_error("Missing special frame source slot");}const auto source=timeline_.resolveSurface(slot->id);
  if(!source.source||!source.surface||source.issue!=timeline::LinkIssue::None||(l.kind=="tilemap"&&!source.source->tilemap))throw std::runtime_error("Invalid special frame source");
 }
 Edit e{{},state_,nextState_};captureFrameOrder(e,false);e.frameHistory.beforeLoops=timeline_.state().loopSections;const auto previousFrames=timeline_.state().frames;DocumentFrame f;do{f.id="frame-native-"+std::to_string(identity_)+"-"+std::to_string(++nextFrameId_);}while(std::any_of(timeline_.state().frames.begin(),timeline_.state().frames.end(),[&](const auto& old){return old.id==f.id;}));f.duration=duplicate?frame().duration:100;f.disabled=duplicate&&frame().disabled;
 for(const auto& l:timeline_.state().layers){DocumentCel c;const auto* sourceSlot=timeline_.findCel(l.id,frame().id);if(duplicate&&sourceSlot){c=*timeline_.resolveSurface(sourceSlot->id).source;c.linkedCelId.reset();c.runtimeSharedCelId.reset();}else{timeline::Surface surface;surface.width=surface.height=1;c.opacity=l.opacity;
 if(l.kind=="free-tile"||l.kind=="tilemap"){
  const auto* slot=timeline_.findCel(l.id,frame().id);const auto source=slot?timeline_.resolveSurface(slot->id):timeline::Resolution{};
  if(l.kind=="free-tile"&&(!l.freeTiles||l.freeTiles->sources.empty())){ /* Legacy blankSurfaceFromLayer stays 1x1 at origin. */ }
  else if(source.surface){surface.width=source.surface->width;surface.height=source.surface->height;surface.offsetX=source.surface->offsetX;surface.offsetY=source.surface->offsetY;}
  else if(l.kind=="free-tile"){if(!duplicate&&l.freeTiles&&!l.freeTiles->sources.empty()){surface.width=width_;surface.height=height_;}}
  else throw std::runtime_error("Missing special frame source geometry");
  if(l.kind=="free-tile")c.freeTiles=free_tiles::CelData{};
  else{if(!source.source||!source.source->tilemap)throw std::runtime_error("Missing frame tilemap template");c.tilemap=source.source->tilemap;std::fill(c.tilemap->cells.begin(),c.tilemap->cells.end(),std::nullopt);}
 }
 surface.pixels.resize(std::size_t(surface.width)*surface.height);c.surface=std::move(surface);}if(l.autoLinkAnimationCels&&sourceSlot){const auto* slot=sourceSlot;const auto source=timeline_.resolveSurface(slot->id);
 if(source.source && source.surface && (slot->linkedCelId || std::any_of(source.surface->pixels.begin(),source.surface->pixels.end(),[](Pixel p){return (p>>24)!=0;}))){c.linkedCelId=source.source->id;c.runtimeSharedCelId.reset();c.surface.reset();c.opacity=source.source->opacity;c.zIndex=source.source->zIndex;c.tilemap=source.source->tilemap;c.freeTiles=source.source->freeTiles;c.text=source.source->text;}}
 c.id="cel-"+l.id+"-"+f.id;c.layerId=l.id;c.frameId=f.id;e.contentHistory.detachedCels.push_back(std::move(c));}
 {const auto masks=timeline_.state().masks;for(const auto& slot:masks)if(slot.frameId==activeFrameId_&&(duplicate||(!slot.group&&slot.mask.autoLinkAnimationCels))){auto copy=slot;copy.frameId=f.id;copy.mask.id="mask-native-"+std::to_string(identity_)+"-"+std::to_string(++nextLayerId_);const auto* root=timeline::resolvedMask(timeline_.state(),slot.ownerId,slot.frameId);copy.mask.surface=root->surface;copy.mask.linkedMaskId=slot.mask.autoLinkAnimationCels?root->id:std::string{};timeline_.state_.masks.push_back(std::move(copy));}}
 e.frameHistory.detachedFrame=f;for(auto& section:timeline_.state_.loopSections){timeline::State old;old.frames=previousFrames;const auto r=timeline::loopRange(old,section);if(r.end>=0 && previousFrames[r.end].id==frame().id){if(section.endFrameId==frame().id)section.endFrameId=f.id;else if(section.startFrameId==frame().id)section.startFrameId=f.id;}}e.frameHistory.afterLoops=timeline_.state().loopSections;const auto index=activeFrameIndex()+1;timeline_.state_.frames.insert(timeline_.state_.frames.begin()+index,f);timeline_.state_.cels.insert(timeline_.state_.cels.end(),e.contentHistory.detachedCels.begin(),e.contentHistory.detachedCels.end());timeline_.buildIndex();activeFrameId_=f.id;projectActiveCelOpacities();setSelectionValue(std::nullopt);clearFrameSelection();timelineSelection_.cels.clear();timelineSelection_.celAnchor.clear();e.beforeTimelineSelection=timelineSelection_;e.beforeFrameAnchor=frameAnchor_;e.beforeSelection=e.afterSelection=selectedFrames_;captureFrameOrder(e,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"新建动画帧");
}
void Document::deleteFrame() {auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);
 commitFloatingPaste();
 cancelStroke();cancelLayerOpacity();if(timeline_.state().frames.size()==1)return;Edit e{{},state_,nextState_};captureFrameOrder(e,false);e.beforeSelection=selectedFrames_;e.frameHistory.beforeLoops=timeline_.state().loopSections;e.frameHistory.detachedFrame=frame();timeline::State oldLoops;oldLoops.frames=timeline_.state().frames;for(const auto& c:timeline_.state().cels)if(c.frameId==frame().id)e.contentHistory.detachedCels.push_back(c);
 // Legacy normalizes explicit chains to their surviving canonical source.
 // Native also accepts multi-hop imported links, so bypass a removed alias
 // before erasing it; keep explicit links distinct from runtime sharing.
 for(const auto& removed:e.contentHistory.detachedCels){if(!removed.linkedCelId&&!removed.runtimeSharedCelId)continue;
  const auto resolved=timeline_.resolveSurface(removed.id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.source)throw std::invalid_argument("Invalid frame deletion cel link");const auto root=resolved.source->id;
  for(auto& c:timeline_.state_.cels){if(c.frameId==e.frameHistory.detachedFrame->id)continue;const bool explicitLink=c.linkedCelId&&*c.linkedCelId==removed.id;const bool shared=c.runtimeSharedCelId&&*c.runtimeSharedCelId==removed.id;if(!explicitLink&&!shared)continue;e.contentHistory.beforeCels.push_back(c);if(explicitLink)c.linkedCelId=root;if(shared)c.runtimeSharedCelId=root;e.contentHistory.afterCels.push_back(c);}
 }
 // Native adapter of legacy shared surface objects surviving normalizeAnimationCelLinks.
 for(const auto& removed:e.contentHistory.detachedCels){if(removed.linkedCelId || removed.runtimeSharedCelId || !removed.surface)continue;
  std::vector<std::string> survivors;for(const auto& c:timeline_.state().cels)if(c.frameId!=e.frameHistory.detachedFrame->id && timeline_.resolveSurface(c.id).source->id==removed.id)survivors.push_back(c.id);
  if(survivors.empty())continue;
  for(const auto& id:survivors){auto& c=*std::find_if(timeline_.state_.cels.begin(),timeline_.state_.cels.end(),[&](const auto& x){return x.id==id;});e.contentHistory.beforeCels.push_back(c);c.opacity=removed.opacity;c.zIndex=removed.zIndex;c.text=removed.text;c.tilemap=removed.tilemap;c.freeTiles=removed.freeTiles;c.linkedCelId.reset();if(id==survivors.front()){c.surface=removed.surface;c.runtimeSharedCelId.reset();}else{c.surface.reset();c.runtimeSharedCelId=survivors.front();}e.contentHistory.afterCels.push_back(c);}
 }
 // Legacy removes both layer/group mask slots with the deleted frame.
 // Preserve resolved pixels before detaching links to those removed masks,
 // using the same rule as the existing special-frame deletion transaction.
 auto& masks=timeline_.state_.masks;std::unordered_set<std::string> removedMasks;
 for(const auto& slot:masks)if(slot.frameId==e.frameHistory.detachedFrame->id)removedMasks.insert(slot.mask.id);
 for(auto& slot:masks)if(slot.frameId!=e.frameHistory.detachedFrame->id&&!slot.mask.linkedMaskId.empty()&&removedMasks.count(slot.mask.linkedMaskId)){
  const auto* resolved=timeline::resolvedMask(timeline_.state(),slot.ownerId,slot.frameId);if(!resolved)throw std::invalid_argument("Missing surviving frame deletion mask");slot.mask.surface=resolved->surface;slot.mask.linkedMaskId.clear();
 }
 masks.erase(std::remove_if(masks.begin(),masks.end(),[&](const auto& slot){return slot.frameId==e.frameHistory.detachedFrame->id;}),masks.end());
 const auto index=activeFrameIndex();timeline_.state_.frames.erase(timeline_.state_.frames.begin()+index);auto& cels=timeline_.state_.cels;cels.erase(std::remove_if(cels.begin(),cels.end(),[&](const auto& c){return c.frameId==e.frameHistory.detachedFrame->id;}),cels.end());activeFrameId_=timeline_.state_.frames[std::min(index,timeline_.state_.frames.size()-1)].id;
 std::vector<timeline::LoopSection> kept;for(auto section:timeline_.state().loopSections){const auto r=timeline::loopRange(oldLoops,section);if(r.start<0 || r.end<0)continue;if(section.startFrameId==e.frameHistory.detachedFrame->id || section.endFrameId==e.frameHistory.detachedFrame->id){std::vector<std::string> members;for(int i=r.start;i<=r.end;++i)if(oldLoops.frames[i].id!=e.frameHistory.detachedFrame->id)members.push_back(oldLoops.frames[i].id);if(members.empty())continue;section.startFrameId=members.front();section.endFrameId=members.back();}kept.push_back(section);}timeline_.state_.loopSections=std::move(kept);e.frameHistory.afterLoops=timeline_.state().loopSections;
 e.maskHistory.maskContext=std::make_shared<MaskHistory::MaskContextHistory>(MaskHistory::MaskContextHistory{{},{},false,false});activeMaskId_.clear();maskIsolated_=false;
 // Legacy clears the canvas selection on the initial successful command.
 // Frame history does not own pixel selection; Undo/Redo keep the current one.
 setSelectionValue(std::nullopt);
 timeline_.buildIndex();projectActiveCelOpacities();normalizeFrameDeletionSelection();captureFrameOrder(e,true);e.afterSelection=selectedFrames_;change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"删除动画帧");
}
// applyCelEdit: definition in its history domain unit.
void Document::addLinkedFrame(bool allLayers){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);
 cancelStroke();cancelLayerOpacity();
 // Legacy chooses a selected Cel first, then a selected frame anchor, then activity.
 const DocumentCel* selected=nullptr;const auto& cells=timelineSelection_.cels;
 if(!cells.empty()){const auto id=std::find(cells.begin(),cells.end(),timelineSelection_.celAnchor)!=cells.end()?timelineSelection_.celAnchor:cells.back();selected=timeline_.findCelById(id);}
 const auto previousFrame=activeFrameId_;const auto previousLayer=activeLayerId_;
 auto sourceFrame=selected?selected->frameId:activeFrameId_;const auto sourceLayer=selected?selected->layerId:activeLayerId_;
 if(!selected&&!selectedFrames_.empty()){const auto id=std::find(selectedFrames_.begin(),selectedFrames_.end(),frameAnchor_)!=selectedFrames_.end()?frameAnchor_:selectedFrames_.back();if(timeline_.hasFrame(id))sourceFrame=id;}
 const bool linkAll=!selected&&(allLayers||!selectedFrames_.empty());const bool copyGroupMasks=!selected;
 const auto index=timeline_.frameIndex(sourceFrame);const bool inserted=index+1==timeline_.state().frames.size();
 Edit e{{},state_,nextState_};e.beforeFrame=previousFrame;e.beforeActive=e.afterActive=previousLayer;e.beforeSelection=selectedFrames_;e.beforeTimelineSelection=timelineSelection_;e.beforeFrameAnchor=frameAnchor_;
 e.maskHistory.maskContext=std::make_shared<MaskHistory::MaskContextHistory>(MaskHistory::MaskContextHistory{inserted?std::string{}:activeMaskId_,{},inserted?false:maskIsolated_,false});
 const bool wasGrouping=groupingHistory_;
 if(inserted){if(sourceFrame!=activeFrameId_)selectFrame(sourceFrame);groupingHistory_=true;try{addFrame();}catch(...){groupingHistory_=wasGrouping;throw;}groupingHistory_=wasGrouping;}
 e.afterFrame=timeline_.state().frames[index+1].id;
 for(const auto& l:timeline_.state().layers){if(!linkAll&&l.id!=sourceLayer)continue;const auto* sourceSlot=timeline_.findCel(l.id,sourceFrame);if(!sourceSlot)continue;const auto source=timeline_.resolveSurface(sourceSlot->id);if(!source.surface||std::none_of(source.surface->pixels.begin(),source.surface->pixels.end(),[](auto p){return (p>>24)!=0;}))continue;
  auto targetIt=std::find_if(timeline_.state_.cels.begin(),timeline_.state_.cels.end(),[&](const auto& c){return c.layerId==l.id&&c.frameId==e.afterFrame;});if(targetIt==timeline_.state_.cels.end())continue;auto& target=*targetIt;if(target.id==source.source->id)continue;e.contentHistory.beforeCels.push_back(target);target.linkedCelId=source.source->id;target.runtimeSharedCelId.reset();target.surface.reset();target.zIndex=source.source->zIndex;target.opacity=source.source->opacity;target.text=source.source->text;target.tilemap=source.source->tilemap;target.freeTiles=source.source->freeTiles;e.contentHistory.afterCels.push_back(target);
 }
 if(inserted&&copyGroupMasks){const auto masks=timeline_.state().masks;for(const auto& slot:masks)if(slot.group&&slot.frameId==sourceFrame){auto copy=slot;copy.frameId=e.afterFrame;copy.mask.id="mask-native-"+std::to_string(identity_)+"-"+std::to_string(++nextLayerId_);copy.mask.surface=timeline::resolvedMask(timeline_.state(),slot.ownerId,sourceFrame)->surface;copy.mask.linkedMaskId.clear();timeline_.state_.masks.push_back(std::move(copy));}}
 timeline_.buildIndex();activeFrameId_=e.afterFrame;activeMaskId_.clear();maskIsolated_=false;setSelectionValue(std::nullopt);clearFrameSelection();timelineSelection_.cels.clear();timelineSelection_.celAnchor.clear();timelineSelection_.maskRows.clear();normalizeFrameDeletionSelection();projectActiveCelOpacities();
 e.afterSelection=selectedFrames_;e.afterTimelineSelection=timelineSelection_;e.afterFrameAnchor=frameAnchor_;change_={0,0,width_,height_};publishChange();
 if(inserted){history_.updateLatest([&](Edit& frameEdit){frameEdit.beforeFrame=previousFrame;frameEdit.beforeActive=frameEdit.afterActive=previousLayer;frameEdit.beforeSelection=frameEdit.afterSelection=selectedFrames_;frameEdit.beforeTimelineSelection=frameEdit.afterTimelineSelection=timelineSelection_;frameEdit.beforeFrameAnchor=frameEdit.afterFrameAnchor=frameAnchor_;frameEdit.maskHistory.maskContext=e.maskHistory.maskContext;frameEdit.maskHistory.afterMasks=timeline_.state().masks;frameEdit.contentHistory.detachedCels.clear();for(const auto& c:timeline_.state().cels)if(c.frameId==e.afterFrame)frameEdit.contentHistory.detachedCels.push_back(c);frameEdit.label=U"新建链接动画帧";});const auto& frameEdit=history_.latest();if(!wasGrouping){if(pendingGroupedProjectOperation_){projectInformation_.operation();pendingGroupedProjectOperation_=false;}notifyHistoryChange(HistoryStackChange::Kind::Push,frameEdit.label);notifyRecording();}}else pushEdit(std::move(e),U"新建链接动画帧");
}
// legacy animationReversedSlotTargets: reverse selected time slots independently per row.
bool Document::canReverseSelectedCels()const{
 bool any=false;for(const auto& l:timeline_.state().layers){int n=0;for(const auto& c:timeline_.state().cels)if(c.layerId==l.id && std::find(timelineSelection_.cels.begin(),timelineSelection_.cels.end(),c.id)!=timelineSelection_.cels.end())++n;if(n>1){if(layerEffectivelyLocked(l))return false;any=true;}}return any;
}
bool Document::reverseSelectedCels(){auto selectionHistory=trackAnimationSelectionHistory(false);
 if(!canReverseSelectedCels())return false;commitFloatingPaste();cancelStroke();cancelLayerOpacity();Edit e{{},state_,nextState_};e.beforeFrame=e.afterFrame=activeFrameId_;e.beforeTimelineSelection=timelineSelection_;e.afterTimelineSelection=timelineSelection_;
 for(const auto& l:timeline_.state().layers){std::vector<const DocumentCel*> slots;for(const auto& f:timeline_.state().frames){const auto* c=timeline_.findCel(l.id,f.id);if(c && std::find(timelineSelection_.cels.begin(),timelineSelection_.cels.end(),c->id)!=timelineSelection_.cels.end())slots.push_back(c);}if(slots.size()<2)continue;
 std::unordered_map<std::string,std::string> remap;
 for(std::size_t n=0;n<slots.size();++n){const auto opposite=slots.size()-1-n;if(n==opposite)continue;e.contentHistory.beforeCels.push_back(*slots[n]);auto moved=*slots[n];moved.frameId=slots[opposite]->frameId;e.contentHistory.afterCels.push_back(std::move(moved));remap.emplace(slots[n]->id,slots[opposite]->id);}
 // Native selection uses Cel IDs; legacy uses slot keys, so map the highlight to the same slots.
 for(auto& id:e.afterTimelineSelection->cels){const auto found=remap.find(id);if(found!=remap.end())id=found->second;}
 const auto anchor=remap.find(e.afterTimelineSelection->celAnchor);if(anchor!=remap.end())e.afterTimelineSelection->celAnchor=anchor->second;
 }
 if(e.contentHistory.afterCels.empty())return false;applyCelEdit(e,true);timelineSelection_=*e.afterTimelineSelection;publishChange();pushEdit(std::move(e),U"反转单元格顺序");return true;
}
// legacy animationSlotsCanLink + animationLinkSlotKeys / connectAnimationCels.
bool Document::canConnectSelectedCels()const{
 for(const auto& l:timeline_.state().layers){int count=0;bool content=false;for(const auto& c:timeline_.state().cels){if(c.layerId!=l.id || std::find(timelineSelection_.cels.begin(),timelineSelection_.cels.end(),c.id)==timelineSelection_.cels.end())continue;++count;const auto r=timeline_.resolveSurface(c.id);content|=r.surface && std::any_of(r.surface->pixels.begin(),r.surface->pixels.end(),[](Pixel p){return (p>>24)!=0;});}if(count>1 && content)return true;}return false;
}
bool Document::connectSelectedCels(){auto selectionHistory=trackAnimationSelectionHistory(false);
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();Edit e{{},state_,nextState_};e.beforeFrame=e.afterFrame=activeFrameId_;
 for(const auto& l:timeline_.state().layers){std::vector<const DocumentCel*> slots;int first=-1,last=-1;const auto& frames=timeline_.state().frames;
 auto content=[&](const DocumentCel* c){const auto r=timeline_.resolveSurface(c->id);return r.surface && std::any_of(r.surface->pixels.begin(),r.surface->pixels.end(),[](Pixel p){return (p>>24)!=0;});};
 for(int f=0;f<int(frames.size());++f){const auto* c=timeline_.findCel(l.id,frames[f].id);if(c && std::find(timelineSelection_.cels.begin(),timelineSelection_.cels.end(),c->id)!=timelineSelection_.cels.end()){if(first<0)first=f;last=f;}}
 if(first<0 || first==last)continue;
 for(int f=first;f<=last;++f){const auto* c=timeline_.findCel(l.id,frames[f].id);if(!c)continue;if(std::find(timelineSelection_.cels.begin(),timelineSelection_.cels.end(),c->id)!=timelineSelection_.cels.end() || !content(c))slots.push_back(c);}
 const auto original=std::find_if(slots.begin(),slots.end(),content);if(original==slots.end())continue;const auto resolved=timeline_.resolveSurface((*original)->id);if(resolved.issue!=timeline::LinkIssue::None)throw std::runtime_error("Cannot resolve Cel link source");const auto source=*resolved.source;
 for(const auto* c:slots){if(c->id==source.id)continue;if(c->linkedCelId==source.id && !c->runtimeSharedCelId && c->opacity==source.opacity && c->zIndex==source.zIndex)continue;auto next=*c;next.linkedCelId=source.id;next.runtimeSharedCelId.reset();next.surface.reset();next.opacity=source.opacity;next.zIndex=source.zIndex;next.text=source.text;next.tilemap=source.tilemap;next.freeTiles=source.freeTiles;e.contentHistory.beforeCels.push_back(*c);e.contentHistory.afterCels.push_back(std::move(next));}
 }
 if(e.contentHistory.afterCels.empty())return false;applyCelEdit(e,true);projectActiveCelOpacities();publishChange();pushEdit(std::move(e),U"连接动画单元格");return true;
}
// legacy animation.ts disconnectAnimationCels: selecting a source unlinks its group.
bool Document::canDisconnectSelectedCels()const{
 const auto* current=timeline_.findCel(activeLayerId_,activeFrameId_);const auto selected=timelineSelection_.cels.empty()?(current?std::vector<std::string>{current->id}:std::vector<std::string>{}):timelineSelection_.cels;
 for(const auto& c:timeline_.state().cels){if(!c.linkedCelId)continue;const auto resolved=timeline_.resolveSurface(c.id);if(std::find(selected.begin(),selected.end(),c.id)!=selected.end() || (resolved.source && std::find(selected.begin(),selected.end(),resolved.source->id)!=selected.end()))return true;}return false;
}
bool Document::disconnectSelectedCels(){auto selectionHistory=trackAnimationSelectionHistory(false);
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();
 const auto* current=timeline_.findCel(activeLayerId_,activeFrameId_);const auto selected=timelineSelection_.cels.empty()?(current?std::vector<std::string>{current->id}:std::vector<std::string>{}):timelineSelection_.cels;
 Edit e{{},state_,nextState_};e.beforeFrame=e.afterFrame=activeFrameId_;
 for(const auto& c:timeline_.state().cels){if(!c.linkedCelId)continue;const auto resolved=timeline_.resolveSurface(c.id);if(!resolved.source || resolved.issue!=timeline::LinkIssue::None)throw std::runtime_error("Cannot resolve Cel unlink source");if(std::find(selected.begin(),selected.end(),c.id)==selected.end() && std::find(selected.begin(),selected.end(),resolved.source->id)==selected.end())continue;
 e.contentHistory.beforeCels.push_back(c);auto next=c;next.surface=resolved.surface?std::optional<timeline::Surface>{*resolved.surface}:std::nullopt;next.opacity=resolved.source->opacity;next.zIndex=resolved.source->zIndex;next.text=resolved.source->text;next.tilemap=resolved.source->tilemap;next.freeTiles=resolved.source->freeTiles;next.linkedCelId.reset();next.runtimeSharedCelId.reset();e.contentHistory.afterCels.push_back(std::move(next));}
 if(e.contentHistory.afterCels.empty())return false;applyCelEdit(e,true);projectActiveCelOpacities();publishChange();pushEdit(std::move(e),U"断开动画单元格连接");return true;
}
void Document::disconnectCel(){auto selectionHistory=trackAnimationSelectionHistory(false);cancelStroke();cancelLayerOpacity();const auto* current=timeline_.findCel(activeLayerId_,activeFrameId_);if(!current||!current->linkedCelId)return;Edit e{{},state_,nextState_};e.beforeFrame=e.afterFrame=frame().id;e.contentHistory.beforeCels.push_back(cel());DocumentCel c=cel();const auto resolved=timeline_.resolveSurface(c.id);if(!resolved.source||!resolved.surface||resolved.issue!=timeline::LinkIssue::None)throw std::runtime_error("Cannot resolve Cel unlink source");c.surface=*resolved.surface;c.opacity=resolved.source->opacity;c.zIndex=resolved.source->zIndex;c.text=resolved.source->text;c.tilemap=resolved.source->tilemap;c.freeTiles=resolved.source->freeTiles;c.linkedCelId.reset();c.runtimeSharedCelId.reset();e.contentHistory.afterCels.push_back(c);applyCelEdit(e,true);projectActiveCelOpacities();publishChange();pushEdit(std::move(e),U"断开动画单元格连接");}
// workspace-animation-commands-helpers updateSelectedAnimationFramesDisabled.
bool Document::selectedFramesDisabled()const{
 for(const auto& f:timeline_.state().frames)if(selectedFrames_.empty()?f.id==activeFrameId_:std::find(selectedFrames_.begin(),selectedFrames_.end(),f.id)!=selectedFrames_.end())if(!f.disabled)return false;return true;
}
bool Document::setSelectedFramesDisabled(bool disabled,bool toggle){
 cancelStroke();cancelLayerOpacity();Edit e{{},state_,nextState_};for(auto& f:timeline_.state_.frames)if((selectedFrames_.empty()?f.id==activeFrameId_:std::find(selectedFrames_.begin(),selectedFrames_.end(),f.id)!=selectedFrames_.end()) && (toggle || f.disabled!=disabled)){e.frameHistory.beforeDisabled.emplace_back(f.id,f.disabled);f.disabled=toggle?!f.disabled:disabled;e.frameHistory.afterDisabled.emplace_back(f.id,f.disabled);}if(e.frameHistory.afterDisabled.empty())return false;pushEdit(std::move(e),U"切换启停用帧状态");return true;
}
void Document::setFrameDuration(int duration) {cancelStroke();cancelLayerOpacity();duration=std::clamp(duration?duration:100,1,60000);if(duration==frame().duration)return;Edit e{{},state_,nextState_};e.frameHistory.targetFrameId=frame().id;e.frameHistory.beforeDuration=frame().duration;e.frameHistory.afterDuration=duration;timeline_.state_.frames[activeFrameIndex()].duration=duration;pushEdit(std::move(e),U"修改帧时长");}
void Document::beginFrameDuration(){cancelStroke();durationBefore_=frame().duration;durationValuesBefore_.clear();const bool includesActive=std::find(selectedFrames_.begin(),selectedFrames_.end(),frame().id)!=selectedFrames_.end();for(const auto& f:timeline_.state().frames)if(includesActive?std::find(selectedFrames_.begin(),selectedFrames_.end(),f.id)!=selectedFrames_.end():f.id==frame().id)durationValuesBefore_.push_back({f.id,f.duration});}
void Document::previewFrameDuration(int duration){if(durationBefore_)for(auto& f:timeline_.state_.frames)if(std::any_of(durationValuesBefore_.begin(),durationValuesBefore_.end(),[&](const auto& item){return item.first==f.id;}))f.duration=std::clamp(duration?duration:100,1,60000);}
void Document::commitFrameDuration(){if(!durationBefore_)return;durationBefore_.reset();const auto start=history_.position();groupingHistory_=true;for(const auto& value:durationValuesBefore_){const auto f=std::find_if(timeline_.state().frames.begin(),timeline_.state().frames.end(),[&](const auto& x){return x.id==value.first;});if(f->duration==value.second)continue;Edit e{{},state_,nextState_};e.frameHistory.targetFrameId=value.first;e.frameHistory.beforeDuration=value.second;e.frameHistory.afterDuration=f->duration;pushEdit(std::move(e),U"修改帧时长");}groupingHistory_=false;groupEdits(start,selectedFrames_);durationValuesBefore_.clear();}
// captureLayerOrder: definition in its history domain unit.
void Document::addLayer() {if(!timeline_.state().groups.empty()){addLayerInGroupContext();return;}
 commitFloatingPaste();
 cancelStroke();cancelLayerOpacity();if(timeline_.state().layers.size()>=256 || std::uint64_t(width_)*height_*(timeline_.state().layers.size()+1)*timeline_.state().frames.size()*4>256*1024*1024)throw std::runtime_error("Layer pixel memory limit reached");Edit e{{},state_,nextState_};captureLayerOrder(e,false);e.beforeFrame=e.afterFrame=activeFrameId_;
 std::size_t index=0;for(std::size_t i=0;i<timeline_.state().layers.size();++i)if(std::find(timelineSelection_.layers.begin(),timelineSelection_.layers.end(),timeline_.state().layers[i].id)!=timelineSelection_.layers.end()){index=i;break;}
 DocumentLayer l;do {l.id="layer-native-"+std::to_string(identity_)+"-"+std::to_string(++nextLayerId_);}while(std::any_of(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& old){return old.id==l.id;}));l.name=U"图层 ";for(char c:std::to_string(timeline_.state().layers.size()+1))l.name+=char32_t(c);
 for(const auto& f:timeline_.state().frames) {DocumentCel c;c.id="cel-"+l.id+"-"+f.id;c.layerId=l.id;c.frameId=f.id;c.opacity=1;
 timeline::Surface surface;surface.width=width_;surface.height=height_;surface.pixels.resize(std::size_t(width_)*height_);c.surface=std::move(surface);e.contentHistory.detachedCels.push_back(std::move(c));}
 e.layerHistory.detachedLayer=l;timeline_.state_.layers.insert(timeline_.state_.layers.begin()+index,std::move(l));timeline_.state_.cels.insert(timeline_.state_.cels.end(),e.contentHistory.detachedCels.begin(),e.contentHistory.detachedCels.end());timeline_.buildIndex();activeLayerId_=e.layerHistory.detachedLayer->id;
 timelineSelection_={};timelineSelection_.layerAnchor=activeLayerId_;selectedFrames_.clear();frameAnchor_.clear();e.afterTimelineSelection=timelineSelection_;e.beforeTimelineSelection=TimelineSelection{};e.beforeSelection=selectedFrames_;e.afterSelection=selectedFrames_;e.beforeFrameAnchor=frameAnchor_;e.afterFrameAnchor=frameAnchor_;
 captureLayerOrder(e,true);e.beforeActive=e.layerHistory.beforeOrder.front();change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"新建图层");
}



bool Document::canMergeLayerDown() const {
 const auto index=activeLayerIndex();const auto& s=timeline_.state();const auto& layers=s.layers;if(index+1>=layers.size())return false;const auto& a=layers[index];const auto& b=layers[index+1];return a.groupId==b.groupId&&a.visible&&b.visible&&!timeline::isLayerEffectivelyLocked(s,a)&&!timeline::isLayerEffectivelyLocked(s,b);
}
bool Document::canMergeSelectedLayers() const {
 const auto& s=timeline_.state();const auto& layers=s.layers;std::size_t count=0,first=layers.size(),last=0;std::optional<std::string> parent;
 for(std::size_t i=0;i<layers.size();++i)if(std::find(timelineSelection_.layers.begin(),timelineSelection_.layers.end(),layers[i].id)!=timelineSelection_.layers.end()){if(timeline::isLayerEffectivelyLocked(s,layers[i])||!layers[i].visible)return false;if(count&&layers[i].groupId!=parent)return false;parent=layers[i].groupId;first=std::min(first,i);last=i;++count;}return count>=2&&last-first+1==count;
}
void Document::mergeSelectedLayers(){
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();if(!canMergeSelectedLayers())throw std::runtime_error("Merge requires consecutive visible unlocked selected layers");
 const auto& layers=timeline_.state().layers;std::vector<std::string> ids;std::size_t first=layers.size();
 for(std::size_t i=0;i<layers.size();++i)if(std::find(timelineSelection_.layers.begin(),timelineSelection_.layers.end(),layers[i].id)!=timelineSelection_.layers.end()){first=std::min(first,i);ids.push_back(layers[i].id);}
 mergeRasterLayers(ids,first);
}
void Document::mergeLayerDown(){
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();if(!canMergeLayerDown())throw std::runtime_error("Merge requires a visible unlocked layer below");
 const auto index=activeLayerIndex();const auto& layers=timeline_.state().layers;mergeRasterLayers({layers[index].id,layers[index+1].id},index);
}
void Document::moveLayer(std::size_t index) {
 commitFloatingPaste();
 cancelStroke();cancelLayerOpacity();auto& layers=timeline_.state_.layers;if(index>=layers.size() || index==activeLayerIndex() || layer().locked)return;
 Edit e{{},state_,nextState_};captureLayerOrder(e,false);const auto old=activeLayerIndex();auto value=std::move(layers[old]);layers.erase(layers.begin()+old);layers.insert(layers.begin()+index,std::move(value));timeline_.buildIndex();captureLayerOrder(e,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"移动图层");
}
void Document::setLayerLocked(bool locked) {
 commitFloatingPaste();
 cancelStroke();cancelLayerOpacity();if(layer().locked==locked)return;Edit e{{},state_,nextState_};e.layerHistory.targetLayerId=layer().id;e.layerHistory.beforeLocked=layer().locked;e.layerHistory.afterLocked=locked;timeline_.state_.layers[activeLayerIndex()].locked=locked;pushEdit(std::move(e),U"修改图层属性");
}
void Document::setLayerAutoLinkAnimationCels(const std::string& id,bool enabled) {
 auto it=std::find_if(timeline_.state_.layers.begin(),timeline_.state_.layers.end(),[&](const auto& l){return l.id==id;});
 if(it==timeline_.state_.layers.end() || it->autoLinkAnimationCels==enabled)return;
 Edit e{{},state_,nextState_};e.layerHistory.targetLayerId=id;e.layerHistory.beforeAutoLink=it->autoLinkAnimationCels;e.layerHistory.afterAutoLink=enabled;
 it->autoLinkAnimationCels=enabled;pushEdit(std::move(e),U"修改图层属性");
}
// useLayerRowToggleGesture transactions: preview mutable metadata, record final delta once.
void Document::beginAutoLinkGesture(){commitAutoLinkGesture();autoLinkGestureBefore_.clear();for(const auto& layer:timeline_.state().layers)autoLinkGestureBefore_.emplace_back(layer.id,layer.autoLinkAnimationCels);}
void Document::previewAutoLinkGesture(const std::string& id,bool enabled){auto it=std::find_if(timeline_.state_.layers.begin(),timeline_.state_.layers.end(),[&](const auto& layer){return layer.id==id;});if(it!=timeline_.state_.layers.end())it->autoLinkAnimationCels=enabled;}
bool Document::commitAutoLinkGesture(){
 if(autoLinkGestureBefore_.empty())return false;Edit group{{},state_,nextState_};for(const auto& [id,before]:autoLinkGestureBefore_){const auto it=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& layer){return layer.id==id;});if(it==timeline_.state().layers.end() || it->autoLinkAnimationCels==before)continue;Edit child{{},state_,nextState_};child.layerHistory.targetLayerId=id;child.layerHistory.beforeAutoLink=before;child.layerHistory.afterAutoLink=it->autoLinkAnimationCels;group.children.push_back(std::move(child));}autoLinkGestureBefore_.clear();if(group.children.empty())return false;pushEdit(std::move(group),U"修改图层属性");return true;
}
// useLayerRowToggleGesture transactions: preview mutable metadata, record final delta once.






void Document::setLayerVisible(bool visible) {
 commitFloatingPaste();
 cancelStroke();if(layer().visible==visible)return;Edit edit{{},state_,nextState_};edit.layerHistory.targetLayerId=layer().id;edit.layerHistory.beforeVisible=layer().visible;edit.layerHistory.afterVisible=visible;
 timeline_.state_.layers.at(activeLayerIndex()).visible=visible;change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"显示图层");
}
void Document::setLayerOpacity(double opacity) {
 cancelStroke();if(layer().locked || !std::isfinite(opacity))return;opacity=std::clamp(opacity,0.0,1.0);if(layer().opacity==opacity)return;
 Edit edit{{},state_,nextState_};edit.layerHistory.targetLayerId=layer().id;edit.layerHistory.beforeOpacity=layer().opacity;edit.layerHistory.afterOpacity=opacity;
 timeline_.state_.layers.at(activeLayerIndex()).opacity=opacity;syncActiveLayerCelOpacity(edit.layerHistory.targetLayerId);change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"图层不透明度");
}
void Document::beginLayerOpacity() {
 cancelStroke();cancelLayerOpacity();const auto& selected=timelineSelection_.layers;
 const bool includesActive=std::find(selected.begin(),selected.end(),layer().id)!=selected.end();
 for(const auto& l:timeline_.state().layers)if(!l.locked && (includesActive?std::find(selected.begin(),selected.end(),l.id)!=selected.end():l.id==layer().id))opacityValuesBefore_.emplace_back(l.id,l.opacity);
 if(!opacityValuesBefore_.empty())opacityBefore_=layer().opacity;
}
void Document::beginLayerProperties(const std::vector<std::string>& targets){
 if(!targets.empty()){commitFloatingPaste();cancelStroke();cancelLayerOpacity();for(const auto& id:targets){auto it=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==id;});if(it==timeline_.state().layers.end()){if(const auto* g=findGroup(id)){groupPropertiesBefore_.push_back(*g);if(!opacityBefore_)opacityBefore_=g->opacity;}continue;}layerNamesBefore_.emplace_back(it->id,it->name);if(!layerEffectivelyLocked(*it)){opacityValuesBefore_.emplace_back(it->id,it->opacity);layerBlendModesBefore_.emplace_back(it->id,it->blendMode);}if(!opacityBefore_)opacityBefore_=it->opacity;}captureLayerMetadataPreview();return;}
 commitFloatingPaste();beginLayerOpacity();const auto& selected=timelineSelection_.layers;const bool includesActive=std::find(selected.begin(),selected.end(),layer().id)!=selected.end();
 for(const auto& l:timeline_.state().layers)if(includesActive?std::find(selected.begin(),selected.end(),l.id)!=selected.end():l.id==layer().id)layerNamesBefore_.emplace_back(l.id,l.name);
 if(!layerNamesBefore_.empty())opacityBefore_=layer().opacity;
 for(const auto& item:opacityValuesBefore_)layerBlendModesBefore_.emplace_back(item.first,timeline_.state().layers[timeline_.layerIndex(item.first)].blendMode);captureLayerMetadataPreview();
}
void Document::previewLayerName(const std::u32string& name){
 layerNameChanged_=true;for(auto& g:timeline_.state_.groups)for(const auto& b:groupPropertiesBefore_)if(g.id==b.id)g.name=name;
 for(auto& l:timeline_.state_.layers)if(std::any_of(layerNamesBefore_.begin(),layerNamesBefore_.end(),[&](const auto& item){return item.first==l.id;}))l.name=name;
}
void Document::previewLayerOpacity(double opacity) {
 if(!opacityBefore_ || !std::isfinite(opacity))return;opacity=std::clamp(opacity,0.0,1.0);
 bool changed=false;for(auto& g:timeline_.state_.groups)for(const auto& b:groupPropertiesBefore_)if(g.id==b.id&&!timeline::isGroupEffectivelyLocked(timeline_.state(),g)&&g.opacity!=opacity){g.opacity=opacity;changed=true;}for(auto& l:timeline_.state_.layers)if(std::any_of(opacityValuesBefore_.begin(),opacityValuesBefore_.end(),[&](const auto& item){return item.first==l.id;}) && l.opacity!=opacity){l.opacity=opacity;syncActiveLayerCelOpacity(l.id);changed=true;}
 if(changed){change_={0,0,width_,height_};publishChange();}
}
void Document::cancelLayerOpacity() {
 if(!opacityBefore_)return;opacityBefore_.reset();bool changed=false;for(auto& g:timeline_.state_.groups)for(const auto& b:groupPropertiesBefore_)if(g.id==b.id){changed=changed||g.opacity!=b.opacity||g.blendMode!=b.blendMode;g=b;}groupPropertiesBefore_.clear();
 for(auto& l:timeline_.state_.layers)for(const auto& [id,before]:opacityValuesBefore_)if(l.id==id && l.opacity!=before){l.opacity=before;syncActiveLayerCelOpacity(l.id);changed=true;}
 for(auto& l:timeline_.state_.layers)for(const auto& [id,before]:layerNamesBefore_)if(l.id==id)l.name=before;
 applyLayerMetadata(timeline_.state_,layerMetadataBefore_);for(const auto& p:linkedDisplayBefore_)timeline_.state_.layers[timeline_.layerIndex(p.first)].displayColor=p.second;linkedDisplayBefore_.clear();layerMetadataBefore_.clear();layerDescriptionChanged_=false;
 for(auto& l:timeline_.state_.layers)for(const auto& [id,before]:layerBlendModesBefore_)if(l.id==id&&l.blendMode!=before){l.blendMode=before;changed=true;}layerBlendModesBefore_.clear();layerNamesBefore_.clear();layerNameChanged_=false;opacityValuesBefore_.clear();if(changed){change_={0,0,width_,height_};publishChange();}
}
void Document::commitLayerOpacity() {
 if(!opacityBefore_)return;opacityBefore_.reset();Edit edit{{},state_,nextState_};
 for(const auto& [id,before]:opacityValuesBefore_){const auto it=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==id;});if(it==timeline_.state().layers.end() || it->opacity==before)continue;Edit child{{},state_,nextState_};child.layerHistory.targetLayerId=id;child.layerHistory.beforeOpacity=before;child.layerHistory.afterOpacity=it->opacity;edit.children.push_back(std::move(child));}
 const auto whitespace=[](char32_t c){return c==U' ' || (c>=9 && c<=13) || c==0x00a0 || c==0x1680 || (c>=0x2000 && c<=0x200a) || c==0x2028 || c==0x2029 || c==0x202f || c==0x205f || c==0x3000 || c==0xfeff;};
 for(const auto& [id,before]:layerNamesBefore_){if(layerNamesBefore_.size()>1 && !layerNameChanged_)continue;auto it=std::find_if(timeline_.state_.layers.begin(),timeline_.state_.layers.end(),[&](const auto& l){return l.id==id;});if(it==timeline_.state_.layers.end())continue;const auto first=std::find_if_not(it->name.begin(),it->name.end(),whitespace),last=std::find_if_not(it->name.rbegin(),it->name.rend(),whitespace).base();it->name=first>=last?before:std::u32string(first,last);if(it->name==before)continue;Edit child{{},state_,nextState_};child.layerHistory.targetLayerId=id;child.layerHistory.beforeName=before;child.layerHistory.afterName=it->name;edit.children.push_back(std::move(child));}
 for(const auto& [id,before]:layerBlendModesBefore_){const auto& l=timeline_.state().layers[timeline_.layerIndex(id)];if(l.blendMode!=before){Edit child{{},state_,nextState_};child.layerHistory.targetLayerId=id;child.layerHistory.beforeBlendMode=before;child.layerHistory.afterBlendMode=l.blendMode;edit.children.push_back(std::move(child));}}layerBlendModesBefore_.clear();
 for(const auto& before:layerMetadataBefore_){auto& l=timeline_.state_.layers[timeline_.layerIndex(before.layerId)];if(layerMetadataBefore_.size()==1||layerDescriptionChanged_)l.description=trimLayerDescription(l.description);LayerMetadataSnapshot after{l.id,l.displayColor,l.description};if(before.displayColor==after.displayColor&&before.description==after.description)continue;Edit child{{},state_,nextState_};child.layerHistory.targetLayerId=l.id;child.layerHistory.beforeLayerMetadata=before;child.layerHistory.afterLayerMetadata=after;auto name=std::find_if(layerNamesBefore_.begin(),layerNamesBefore_.end(),[&](const auto& n){return n.first==l.id;});child.layerHistory.layerMetadataBytes=layerMetadataHistoryBytes(before,after,name==layerNamesBefore_.end()?l.name:name->second,l.name);edit.children.push_back(std::move(child));}for(const auto& p:linkedDisplayBefore_){const auto& live=timeline_.state().layers[timeline_.layerIndex(p.first)];if(live.displayColor==p.second)continue;Edit child{{},state_,nextState_};child.layerHistory.targetLayerId=live.id;child.layerHistory.beforeLayerMetadata=LayerMetadataSnapshot{live.id,p.second,live.description};child.layerHistory.afterLayerMetadata=LayerMetadataSnapshot{live.id,live.displayColor,live.description};child.layerHistory.layerMetadataBytes=64;edit.children.push_back(std::move(child));}linkedDisplayBefore_.clear();layerMetadataBefore_.clear();
 bool groupChanged=false;for(auto& g:timeline_.state_.groups)for(const auto& b:groupPropertiesBefore_)if(g.id==b.id){if(groupPropertiesBefore_.size()+layerNamesBefore_.size()==1||layerNameChanged_){auto n=trimLayerDescription(g.name);g.name=n.empty()?b.name:n;}if(groupPropertiesBefore_.size()+layerNamesBefore_.size()==1||layerDescriptionChanged_)g.description=trimLayerDescription(g.description);groupChanged=groupChanged||g.name!=b.name||g.opacity!=b.opacity||g.blendMode!=b.blendMode||g.displayColor!=b.displayColor||g.description!=b.description;}
 if(groupChanged){captureGroupEdit(edit,false);captureGroupEdit(edit,true);for(auto& g:edit.layerHistory.beforeLayerStructure->groups)for(const auto& b:groupPropertiesBefore_)if(g.id==b.id)g=b;}
 groupPropertiesBefore_.clear();layerDescriptionChanged_=false;layerNamesBefore_.clear();layerNameChanged_=false;opacityValuesBefore_.clear();if(groupChanged||!edit.children.empty())pushEdit(std::move(edit),U"修改图层属性");
}


namespace {
const timeline::MaskSlot* adjustmentMask(const timeline::Timeline& t,const std::string& id){for(const auto& m:t.state().masks)if(m.mask.id==id)return &m;return nullptr;}
bool adjustmentMaskLocked(const timeline::Timeline& t,const timeline::MaskSlot& m){if(m.mask.locked)return true;if(m.group){for(const auto& g:t.state().groups)if(g.id==m.ownerId)return timeline::isGroupEffectivelyLocked(t.state(),g);return true;}if(!t.hasLayer(m.ownerId))return true;return timeline::isLayerEffectivelyLocked(t.state(),t.state().layers[t.layerIndex(m.ownerId)]);}
bool adjustmentSameGeometry(const timeline::Surface& a,const timeline::Surface& b){return a.width==b.width&&a.height==b.height&&a.offsetX==b.offsetX&&a.offsetY==b.offsetY&&a.storageOriginX==b.storageOriginX&&a.storageOriginY==b.storageOriginY;}
void gradientMapTaskStorage(const Document::GradientMapTask& task){
 if(task.documentBytes>adjustmentByteLimit/4)throw std::length_error("Gradient map snapshots exceed pixel budget");
 auto remaining=adjustmentByteLimit-4*task.documentBytes;
 for(const auto& target:task.targets){const auto& s=target.surface;raster::validate(s);raster::coordinate(std::int64_t(s.offsetX)+s.width);raster::coordinate(std::int64_t(s.offsetY)+s.height);
  if(s.pixels.size()>64*1024*1024 || s.pixels.size()>remaining/sizeof(Pixel))throw std::length_error("Gradient map worker exceeds pixel budget");remaining-=s.pixels.size()*sizeof(Pixel);
 }
}

std::size_t convolutionSnapshotBytes(const timeline::Timeline& live,const timeline::Timeline& baseline,const timeline::Timeline& preview){std::size_t used=0;for(const auto* t:{&live,&baseline,&preview,&baseline}){const auto bytes=adjustmentStorageBudget(*t,1);if(bytes>adjustmentByteLimit-used)throw std::length_error("Convolution snapshots exceed pixel budget");used+=bytes;}return used;}
void convolutionTaskStorage(const Document::ConvolutionSurfaceTask& task){
 if(task.plans.size()!=task.source.targets.size()||task.baseBytes>adjustmentByteLimit)throw std::logic_error("Invalid convolution capture");std::size_t planned=0;
 for(std::size_t i=0;i<task.plans.size();++i){raster::validate(task.source.targets[i].surface);const auto bytes=convolutionSurfaceBytes(task.plans[i].geometry);if(bytes>adjustmentByteLimit-planned)throw std::length_error("Convolution result exceeds pixel budget");planned+=bytes;const auto& p=task.plans[i];if(p.render&&(p.region.left<0||p.region.top<0||p.region.right>task.source.width||p.region.bottom>task.source.height||p.region.right<=p.region.left||p.region.bottom<=p.region.top))throw std::logic_error("Invalid convolution region");}
 if(planned!=task.plannedBytes||planned>(adjustmentByteLimit-task.baseBytes)/2)throw std::length_error("Convolution worker exceeds pixel budget");
}

// Legacy AA ensures the complete canvas is covered before painting intersections.
ConvolutionSurfacePlan antiAliasSurfacePlan(const timeline::Surface& source,int width,int height){
 raster::validate(source);if(width<1||height<1)throw std::invalid_argument("Invalid anti-alias canvas");
 ConvolutionSurfacePlan p;p.render=true;p.region={0,0,width,height};auto& g=p.geometry;
 const bool blank=source.width==1&&source.height==1&&!(source.pixels[0]>>24);
 const auto l=blank?0:std::min<std::int64_t>(0,source.offsetX),t=blank?0:std::min<std::int64_t>(0,source.offsetY);
 const auto r=blank?width:std::max<std::int64_t>(width,std::int64_t(source.offsetX)+source.width),b=blank?height:std::max<std::int64_t>(height,std::int64_t(source.offsetY)+source.height);
 raster::coordinate(l);raster::coordinate(t);raster::coordinate(r);raster::coordinate(b);
 g.width=raster::coordinate(r-l);g.height=raster::coordinate(b-t);g.offsetX=int(l);g.offsetY=int(t);
 g.storageOriginX=source.storageOriginX;g.storageOriginY=source.storageOriginY;
 if(blank){g.storageOriginX=0;g.storageOriginY=0;}
 else if(g.width!=source.width||g.height!=source.height||g.offsetX!=source.offsetX||g.offsetY!=source.offsetY){g.storageOriginX=raster::coordinate(std::int64_t(source.storageOriginX.value_or(0))-(std::int64_t(source.offsetX)-l));g.storageOriginY=raster::coordinate(std::int64_t(source.storageOriginY.value_or(0))-(std::int64_t(source.offsetY)-t));}
 (void)convolutionSurfaceBytes(g);return p;
}
std::size_t antiAliasCanvasCount(int width,int height){
 if(width<1||height<1||std::uint64_t(width)*height>64*1024*1024)throw std::length_error("Anti-alias exceeds canvas budget");return std::size_t(width)*height;
}
// Bound canvas buffers and STL contour/component/maps by the actual candidate domain.
std::size_t antiAliasScratch(const timeline::Surface& source,int width,int height,const std::optional<SelectionMask>& selection,const AntiAliasOptions& options,const std::function<bool()>& stop){
 std::int64_t l=width,t=height,r=0,b=0;
 if(selection){l=selection->x;t=selection->y;r=l+selection->width;b=t+selection->height;}
 else for(int y=0;y<source.height;++y){if(stop())return 0;const auto wy=std::int64_t(source.offsetY)+y;if(wy<0||wy>=height)continue;for(int x=0;x<source.width;++x){const auto wx=std::int64_t(source.offsetX)+x;if(wx<0||wx>=width||!(source.pixels[std::size_t(y)*source.width+x]>>24))continue;l=std::min(l,wx);t=std::min(t,wy);r=std::max(r,wx+1);b=std::max(b,wy+1);}}
 std::uint64_t area=0;if(r>l&&b>t){l=std::max<std::int64_t>(0,l-1);t=std::max<std::int64_t>(0,t-1);r=std::min<std::int64_t>(width,r+1);b=std::min<std::int64_t>(height,b+1);if(r>l&&b>t)area=std::uint64_t(r-l)*(b-t);}
 const std::uint64_t bytes=std::uint64_t(antiAliasCanvasCount(width,height))*(options.colorSource==1?80:24)+area*512;
 if(bytes>adjustmentByteLimit)throw std::length_error("Anti-alias workspace exceeds pixel budget");return std::size_t(bytes);
}
void antiAliasTaskStorage(const Document::AntiAliasSurfaceTask& task){
 const auto& s=task.surfaces;convolutionTaskStorage(s);
 if(task.frames.size()!=s.source.targets.size()||task.simulationBytes>adjustmentByteLimit||s.baseBytes>adjustmentByteLimit-task.simulationBytes)throw std::length_error("Anti-alias snapshots exceed pixel budget");
 const auto remaining=adjustmentByteLimit-s.baseBytes-task.simulationBytes;
 if(task.scratchBytes>remaining||s.plannedBytes>(remaining-task.scratchBytes)/2)throw std::length_error("Anti-alias worker exceeds pixel budget");
}
bool antiAliasCompositeContextEqual(const timeline::Timeline& a,const timeline::Timeline& b){
 const auto& x=a.state();const auto& y=b.state();if(x.layers.size()!=y.layers.size()||x.cels.size()!=y.cels.size()||x.groups.size()!=y.groups.size())return false;
 for(std::size_t i=0;i<x.groups.size();++i){const auto& g=x.groups[i];const auto& h=y.groups[i];if(g.id!=h.id||g.parentGroupId!=h.parentGroupId||g.visible!=h.visible||g.locked!=h.locked||g.opacity!=h.opacity||g.blendMode!=h.blendMode||g.cumulativeBlend!=h.cumulativeBlend||g.panelOrder!=h.panelOrder)return false;}
 for(std::size_t i=0;i<x.layers.size();++i){const auto& l=x.layers[i];const auto& r=y.layers[i];if(l.id!=r.id||l.groupId!=r.groupId||l.visible!=r.visible||l.locked!=r.locked||l.opacity!=r.opacity||l.blendMode!=r.blendMode)return false;}
 for(const auto& c:x.cels){const auto* d=b.findCelById(c.id);if(!d||c.layerId!=d->layerId||c.frameId!=d->frameId||c.linkedCelId!=d->linkedCelId||c.runtimeSharedCelId!=d->runtimeSharedCelId||c.opacity!=d->opacity||c.zIndex!=d->zIndex)return false;}
 return true;
}

void floatingAddBytes(std::size_t& used,std::uint64_t bytes){if(bytes>adjustmentByteLimit-used)throw std::length_error("Floating selection exceeds pixel budget");used+=std::size_t(bytes);}
std::size_t floatingArea(int width,int height){if(width<1||height<1||std::uint64_t(width)*height>64*1024*1024)throw std::length_error("Floating selection exceeds surface budget");return std::size_t(width)*height;}
bool floatingTranslation(const SelectionTransform& t,const SelectionClipboard& source){return !t.quad&&t.shearX==0&&t.shearY==0&&t.angle==0&&t.width==source.width&&t.height==source.height&&!t.flipHorizontal&&!t.flipVertical&&std::floor(t.x)==t.x&&std::floor(t.y)==t.y;}
// legacy tools-selection-transform-translation.ts: repeated targets read the
// immutable destination baseline; overlapping source pixels are cleared first.
template<class Read,class Write> void repeatedFloatingTranslation(const SelectionClipboard& source,const SelectionClipboard& original,int sourceX,int sourceY,const SelectionTransform& t,int width,int height,repeat::Mode mode,bool copy,Read read,Write write,const PixelRegion* clip=nullptr){
 // Visit only contributors to the requested region. The last opaque masked
 // source in row-major order wins; every write blends against the same baseline.
 const bool wrapX=repeat::includesX(mode),wrapY=repeat::includesY(mode);
 const auto left=clip?std::max<std::int64_t>(0,clip->x):0,top=clip?std::max<std::int64_t>(0,clip->y):0,right=clip?std::min<std::int64_t>(width,std::int64_t(clip->x)+clip->w):width,bottom=clip?std::min<std::int64_t>(height,std::int64_t(clip->y)+clip->h):height;
 if(clip&&(right<=left||bottom<=top))return;
 const auto sourceWork=std::uint64_t(source.width)*source.height;
 const auto contributorsX=wrapX?(std::uint64_t(source.width)+width-1)/width:1,contributorsY=wrapY?(std::uint64_t(source.height)+height-1)/height:1;
 const auto regionalWork=std::uint64_t(std::max<std::int64_t>(0,right-left))*std::uint64_t(std::max<std::int64_t>(0,bottom-top))*contributorsX*contributorsY;
 if(clip&&regionalWork<sourceWork){
  for(auto y=top;y<bottom;++y)for(auto x=left;x<right;++x){auto sx=x-std::int64_t(t.x),sy=y-std::int64_t(t.y);if(wrapX)sx=(sx%width+width)%width;if(wrapY)sy=(sy%height+height)%height;if(sx<0||sy<0||sx>=source.width||sy>=source.height)continue;
   if(wrapX)sx+=(source.width-1-sx)/width*width;if(wrapY)sy+=(source.height-1-sy)/height*height;bool found=false;
   for(auto yy=sy;yy>=0&&!found;yy-=wrapY?height:source.height)for(auto xx=sx;xx>=0;xx-=wrapX?width:source.width){const auto i=std::size_t(yy)*source.width+std::size_t(xx);if(source.mask[i]!=1||!(source.pixels[i]>>24))continue;const auto ox=x-sourceX,oy=y-sourceY;const bool cleared=!copy&&ox>=0&&oy>=0&&ox<original.width&&oy<original.height&&original.mask[std::size_t(oy)*original.width+std::size_t(ox)]==1;write(int(x),int(y),brushComposite(cleared?0:read(int(x),int(y)),source.pixels[i],100));found=true;break;}
  }
  return;
 }
 for(int y=0;y<source.height;++y)for(int x=0;x<source.width;++x){const auto i=std::size_t(y)*source.width+x;if(source.mask[i]!=1||!(source.pixels[i]>>24))continue;
  const auto p=repeat::wrap({t.x+x,t.y+y},width,height,mode);if(p.x<0||p.y<0||p.x>=width||p.y>=height)continue;const int wx=int(p.x),wy=int(p.y),sx=wx-sourceX,sy=wy-sourceY;if(clip&&(wx<left||wy<top||wx>=right||wy>=bottom))continue;
  const bool cleared=!copy&&sx>=0&&sy>=0&&sx<original.width&&sy<original.height&&original.mask[std::size_t(sy)*original.width+sx]==1;
  write(wx,wy,brushComposite(cleared?0:read(wx,wy),source.pixels[i],100));
 }
}
SelectionMask checkedFloatingBounds(const SelectionTransform& t){
 for(double v:{t.x,t.y,t.width,t.height,t.angle,t.shearX,t.shearY})if(!std::isfinite(v))throw std::invalid_argument("Invalid floating transform");
 if(t.width<1||t.height<1||t.width>std::numeric_limits<int>::max()||t.height>std::numeric_limits<int>::max())throw std::length_error("Floating transform dimensions exceed native range");
 if((t.flipOriginX&&!std::isfinite(*t.flipOriginX))||(t.flipOriginY&&!std::isfinite(*t.flipOriginY)))throw std::invalid_argument("Invalid floating flip origin");
 double left=std::numeric_limits<double>::infinity(),top=left,right=-left,bottom=-left;
 for(auto uv:std::array<TransformPoint,4>{{{0,0},{1,0},{1,1},{0,1}}}){auto p=transformPoint(t,uv.x,uv.y);if(!std::isfinite(p.x)||!std::isfinite(p.y))throw std::length_error("Floating transform exceeds native range");left=std::min(left,p.x);top=std::min(top,p.y);right=std::max(right,p.x);bottom=std::max(bottom,p.y);}
 const double min=double(std::numeric_limits<int>::min())+2,max=double(std::numeric_limits<int>::max())-2;
 if(std::floor(t.x)<min||std::floor(t.y)<min||std::floor(t.x)>max||std::floor(t.y)>max||std::floor(left)<min||std::floor(top)<min||std::ceil(right)>max||std::ceil(bottom)>max||std::ceil(right)-std::floor(left)>max||std::ceil(bottom)-std::floor(top)>max)throw std::length_error("Floating transform exceeds native range");
 auto bounds=transformBounds(t);(void)floatingArea(bounds.width,bounds.height);return bounds;
}
std::size_t floatingDestinationArea(const SelectionMask& b,int width,int height){const auto l=std::max<std::int64_t>(0,b.x),t=std::max<std::int64_t>(0,b.y),r=std::min<std::int64_t>(width,std::int64_t(b.x)+b.width),bottom=std::min<std::int64_t>(height,std::int64_t(b.y)+b.height);return r>l&&bottom>t?std::size_t(r-l)*std::size_t(bottom-t):0;}

struct ImmediateTransformPlan {std::string owner;const timeline::Surface* before=nullptr;ConvolutionSurfacePlan allocation;};
// legacy tools-selection-transform-apply.ts: owner-local flip or world capture.
timeline::Surface immediateTransformCandidate(const timeline::Surface& before,const std::optional<SelectionMask>& capture,const SelectionTransform& transform,bool wholeFlip,bool packedFlip,bool horizontal,int width,int height,color_mode::PixelFormat format){
 auto normalize=[&](Pixel value){return color_mode::normalizeRgbaPackedValue(format,value);};
 if(wholeFlip){auto out=before;for(int y=0;y<before.height;++y)for(int x=0;x<before.width;++x){const auto dst=std::size_t(y)*before.width+x,src=std::size_t(horizontal?y:before.height-1-y)*before.width+(horizontal?before.width-1-x:x);if(dst!=src)out.pixels[dst]=normalize(before.pixels[src]);}return out;}
 if(!capture)return before;const auto& box=*capture;SelectionClipboard source;source.width=box.width;source.height=box.height;source.pixels.resize(floatingArea(box.width,box.height));source.mask.resize(source.pixels.size());
 for(int y=0;y<box.height;++y)for(int x=0;x<box.width;++x){const int wx=raster::coordinate(std::int64_t(box.x)+x),wy=raster::coordinate(std::int64_t(box.y)+y);const auto index=std::size_t(y)*box.width+x;if(!selectionContains(capture,wx,wy))continue;source.mask[index]=1;source.pixels[index]=raster::readWorld(before,wx,wy);}
 auto expanded=raster::expanded(before,{0,0,width,height});auto out=expanded?std::move(*expanded):before;
 auto write=[&](int x,int y,std::uint32_t value){if(auto index=raster::worldIndex(out,x,y))out.pixels[*index]=normalize(value);};
 for(int y=0;y<box.height;++y)for(int x=0;x<box.width;++x){if(source.mask[std::size_t(y)*box.width+x]!=1)continue;const int wx=raster::coordinate(std::int64_t(box.x)+x),wy=raster::coordinate(std::int64_t(box.y)+y);if(!packedFlip||(wx>=0&&wy>=0&&wx<width&&wy<height))write(wx,wy,0);}
 if(packedFlip){for(int y=0;y<box.height;++y)for(int x=0;x<box.width;++x){const auto index=std::size_t(y)*box.width+x;if(source.mask[index]!=1)continue;const int wx=raster::coordinate(std::int64_t(box.x)+(horizontal?box.width-1-x:x)),wy=raster::coordinate(std::int64_t(box.y)+(horizontal?y:box.height-1-y));if(wx>=0&&wy>=0&&wx<width&&wy<height)write(wx,wy,source.pixels[index]);}}
 else for(const auto& cell:fastSelectionTransformCells(source,transform,width,height)){const auto value=selectionContains(capture,cell.x,cell.y)?cell.value:brushComposite(raster::readWorld(out,cell.x,cell.y),cell.value,100);write(cell.x,cell.y,value);}
 return out;
}

}
// applySurfaceEdit: definition in its history domain unit.
namespace {
constexpr std::uint64_t filterWorkingLimit=256ull*1024*1024;
std::uint64_t filterStoredBytes(const timeline::State& s){std::uint64_t bytes=0;for(const auto& c:s.cels)if(c.surface){raster::validate(*c.surface);const auto n=std::uint64_t(c.surface->pixels.size())*sizeof(Pixel);if(n>filterWorkingLimit-bytes)throw std::length_error("Filter document exceeds pixel budget");bytes+=n;}return bytes;}
bool filterHasAlpha(FilterPreset p,int width,int height){switch(p){case FilterPreset::CrtSubtle:case FilterPreset::CrtStrong:return height>1;case FilterPreset::Vignette:return width>1||height>1;default:return true;}}
void checkFilterBudget(const timeline::State& state,int width,int height,FilterPreset preset){(void)filterPresetDefinition(preset);if(width<1||height<1||width>1024||height>1024||state.frames.empty()||state.layers.size()>=256)throw std::length_error("Filter exceeds native canvas or layer limits");const auto stored=filterStoredBytes(state),one=std::uint64_t(width)*height*sizeof(Pixel),count=filterHasAlpha(preset,width,height)?1ull:std::uint64_t(state.frames.size());if(count>filterWorkingLimit/one)throw std::length_error("Filter overlays exceed pixel budget");const auto added=one*count;if(stored>filterWorkingLimit/4||added>(filterWorkingLimit-4*stored)/4)throw std::length_error("Filter preview/history exceeds working pixel budget");}
bool appendFilterPreset(timeline::State& state,int width,int height,FilterPreset preset,double opacity,const std::string& layerId,const std::function<bool()>& cancelled){
 checkFilterBudget(state,width,height,preset);auto stop=[&]{return cancelled&&cancelled();};std::vector<Pixel> pixels;if(!renderFilterPreset(preset,width,height,pixels,cancelled))return false;const bool linked=std::any_of(pixels.begin(),pixels.end(),[](Pixel p){return (p>>24)!=0;});const auto& def=filterPresetDefinition(preset);
 std::unordered_set<std::string> used;for(const auto& l:state.layers)used.insert(l.id);for(const auto& f:state.frames)used.insert(f.id);for(const auto& c:state.cels)used.insert(c.id);for(const auto& l:state.loopSections)used.insert(l.id);if(!used.insert(layerId).second)throw std::invalid_argument("Duplicate filter layer id");
 timeline::Layer layer;layer.id=layerId;layer.name=U"滤镜 · ";layer.name+=std::u32string(def.name);layer.description=std::u32string(def.description);layer.blendMode=std::string(def.blendMode);layer.opacity=opacity;std::vector<timeline::Cel> cels;cels.reserve(state.frames.size());std::string owner;
 for(std::size_t i=0;i<state.frames.size();++i){if(stop())return false;const auto& f=state.frames[i];timeline::Cel c;c.id="cel-"+layerId+"-"+f.id;while(!used.insert(c.id).second)c.id+="-";c.layerId=layerId;c.frameId=f.id;c.opacity=opacity;
  if(linked&&i){c.linkedCelId=owner;}else{timeline::Surface s;s.width=width;s.height=height;if(i+1==state.frames.size()||linked)s.pixels=std::move(pixels);else s.pixels=pixels;c.surface=std::move(s);if(i==0)owner=c.id;}cels.push_back(std::move(c));
 }
 if(stop())return false;state.layers.insert(state.layers.begin(),std::move(layer));state.cels.insert(state.cels.end(),std::make_move_iterator(cels.begin()),std::make_move_iterator(cels.end()));return true;
}
const timeline::Surface& lcdSourceSurface(const timeline::Timeline& timeline,const std::string& layer,const std::string& frame){const auto* cel=timeline.findCel(layer,frame);if(!cel)throw std::invalid_argument("Missing LCD source cel");const auto r=timeline.resolveSurface(cel->id);if(r.issue!=timeline::LinkIssue::None||!r.surface)throw std::invalid_argument("Invalid LCD source surface");raster::validate(*r.surface);return *r.surface;}
void checkLcdBudget(const timeline::State& state,const timeline::Surface& surface,LcdScreenFilterOptions options){
 raster::validate(surface);if(state.frames.empty()||state.layers.size()>252)throw std::length_error("LCD exceeds native layer limits");const auto stored=filterStoredBytes(state),one=std::uint64_t(surface.pixels.size())*sizeof(Pixel);if(!one||one>filterWorkingLimit/4)throw std::length_error("LCD source exceeds pixel budget");
 std::uint64_t channels=1;for(unsigned channel=0;channel<3;++channel){const auto offset=lcdChannelOffset(channel,options);bool linked=false;for(int y=0;y<surface.height&&!linked;++y)for(int x=0;x<surface.width;++x)if((surface.pixels[std::size_t(y)*surface.width+x]>>24)!=0&&std::int64_t(x)+offset.first>=0&&std::int64_t(x)+offset.first<surface.width&&std::int64_t(y)+offset.second>=0&&std::int64_t(y)+offset.second<surface.height){linked=true;break;}channels+=linked?1:state.frames.size();}
 if(channels>filterWorkingLimit/one)throw std::length_error("LCD overlays exceed pixel budget");const auto added=one*channels;if(stored>filterWorkingLimit/4||added>(filterWorkingLimit-4*stored)/4)throw std::length_error("LCD preview/history exceeds working pixel budget");const auto slots=4ull*state.frames.size();if(slots>filterWorkingLimit/sizeof(DocumentCel))throw std::length_error("LCD cel metadata exceeds memory budget");
}
bool appendLcdScreen(timeline::State& state,const timeline::Surface& surface,const Document::FilterPreviewTask& task,const std::function<bool()>& cancelled){
 checkLcdBudget(state,surface,task.lcdOptions);auto stop=[&]{return cancelled&&cancelled();};std::array<timeline::Surface,4> surfaces;if(!renderLcdScreen(surface,task.lcdOptions,surfaces,cancelled))return false;
 const auto found=std::find_if(state.layers.begin(),state.layers.end(),[&](const auto& l){return l.id==task.sourceLayerId;});if(found==state.layers.end())throw std::invalid_argument("Missing LCD source layer");const auto index=std::size_t(found-state.layers.begin());timeline::Group group;group.id=task.groupId;group.name=U"LCD屏幕滤镜";group.parentGroupId=found->groupId;group.panelOrder=double(state.layers.size()-1-index)+.5;group.displayColor=(nextAvailableLayerDisplayColor(state,task.layerDisplayColors)&0xffffffu)|0x40000000u;
 std::unordered_set<std::string> used;for(const auto& l:state.layers)used.insert(l.id);for(const auto& g:state.groups)used.insert(g.id);for(const auto& c:state.cels)used.insert(c.id);for(const auto& f:state.frames)used.insert(f.id);for(const auto& section:state.loopSections)used.insert(section.id);if(!used.insert(group.id).second)throw std::invalid_argument("Duplicate LCD group id");
 std::array<timeline::Layer,4> layers;std::vector<timeline::Cel> added;added.reserve(state.frames.size()*4);constexpr std::array<Pixel,4> colors{{0x400000ffu,0x4000ff00u,0x40ff0000u,0x40808080u}};const std::array<std::u32string,4> names{{U"红色通道",U"绿色通道",U"蓝色通道",U"扫描线"}};
 for(unsigned channel=0;channel<4;++channel){auto& layer=layers[channel];layer.id=task.layerId+"-"+std::to_string(channel);if(!used.insert(layer.id).second)throw std::invalid_argument("Duplicate LCD layer id");layer.name=names[channel];layer.groupId=group.id;layer.blendMode=channel==3?"soft-light":"screen";layer.displayColor=colors[channel];const bool linked=std::any_of(surfaces[channel].pixels.begin(),surfaces[channel].pixels.end(),[](Pixel p){return (p>>24)!=0;});std::string owner;
 for(std::size_t i=0;i<state.frames.size();++i){if(stop())return false;timeline::Cel c;c.id="cel-"+layer.id+"-"+state.frames[i].id;while(!used.insert(c.id).second)c.id+='-';c.layerId=layer.id;c.frameId=state.frames[i].id;c.opacity=1;if(i&&linked)c.linkedCelId=owner;else{if(i+1==state.frames.size()||linked)c.surface=std::move(surfaces[channel]);else c.surface=surfaces[channel];if(!i)owner=c.id;}added.push_back(std::move(c));}}
 if(stop())return false;state.layers[index].visible=false;state.groups.push_back(std::move(group));for(int channel=0;channel<4;++channel)state.layers.insert(state.layers.begin()+index,std::move(layers[channel]));state.cels.insert(state.cels.end(),std::make_move_iterator(added.begin()),std::make_move_iterator(added.end()));return true;
}

}
bool Document::beginFilterPreview(){
 cancelFilterPreview();commitFloatingPaste();cancelStroke();cancelLayerOpacity();if(active())return false;FilterPreview p;p.revision=revision_;p.contentRevision=contentRevision_;p.generation=++nextFilterGeneration_;filterPreview_=std::move(p);return true;
}
std::optional<Document::FilterPreviewTask> Document::captureFilterPreviewTask(FilterPreset preset,std::optional<double> opacity,bool lcd,int lcdWidth,int lcdHeight){
 const auto& def=filterPresetDefinition(preset);const double value=opacity.value_or(def.opacity);if(!std::isfinite(value))throw std::invalid_argument("Invalid filter opacity");if(!filterPreview_||filterPreview_->revision!=revision_||filterPreview_->contentRevision!=contentRevision_)return {};if(lcd){if(timelineSelection_.layers.size()!=1)return {};checkLcdBudget(timeline_.state(),lcdSourceSurface(timeline_,timelineSelection_.layers.front(),activeFrameId_),normalizeLcdScreenFilterOptions(lcdWidth,lcdHeight));}else checkFilterBudget(timeline_.state(),width_,height_,preset);
 filterPreview_->timeline.reset();filterPreview_->generation=++nextFilterGeneration_;++gradientRevision_;FilterPreviewTask task;task.width=width_;task.height=height_;task.identity=identity_;task.revision=revision_;task.contentRevision=contentRevision_;task.generation=filterPreview_->generation;task.preset=preset;task.opacity=std::clamp(value,0.,1.);task.layerId="layer-filter-native-"+std::to_string(identity_)+"-"+std::to_string(task.generation);
 task.lcd=lcd;task.layerDisplayColors=layerDisplayColors_;task.lcdOptions=normalizeLcdScreenFilterOptions(lcdWidth,lcdHeight);if(lcd){task.sourceLayerId=timelineSelection_.layers.front();task.sourceFrameId=activeFrameId_;task.groupId="group-"+task.layerId;task.opacity=1;}
 auto used=[&](const std::string& id){const auto& state=timeline_.state();return std::any_of(state.groups.begin(),state.groups.end(),[&](const auto& g){return g.id==id;})||std::any_of(state.layers.begin(),state.layers.end(),[&](const auto& l){return l.id==id;})||std::any_of(state.cels.begin(),state.cels.end(),[&](const auto& c){return c.id==id;})||std::any_of(state.frames.begin(),state.frames.end(),[&](const auto& f){return f.id==id;})||std::any_of(state.loopSections.begin(),state.loopSections.end(),[&](const auto& l){return l.id==id;});};auto collision=[&]{if(used(task.layerId))return true;if(!lcd)return false;if(used("group-"+task.layerId))return true;for(int i=0;i<4;++i)if(used(task.layerId+"-"+std::to_string(i)))return true;return false;};while(collision())task.layerId+="-";if(lcd)task.groupId="group-"+task.layerId;task.source=timeline_.state();return task;
}
bool Document::runFilterPreviewTask(FilterPreviewTask& task,const std::function<bool()>& cancelled){task.completed=false;task.result.reset();if(cancelled&&cancelled())return false;if(!std::isfinite(task.opacity)||task.opacity<0||task.opacity>1||task.layerId.empty())throw std::invalid_argument("Invalid filter task");if(task.lcd){timeline::Timeline candidate(std::move(task.source));const auto& source=lcdSourceSurface(candidate,task.sourceLayerId,task.sourceFrameId);if(!appendLcdScreen(candidate.state_,source,task,cancelled))return false;task.result.emplace(std::move(candidate.state_));}else{if(!appendFilterPreset(task.source,task.width,task.height,task.preset,task.opacity,task.layerId,cancelled))return false;task.result.emplace(std::move(task.source));}if(cancelled&&cancelled()){task.result.reset();return false;}if(!task.result->diagnoseLinks().empty())throw std::invalid_argument("Filter creates invalid cel links");task.completed=true;return true;}
bool Document::publishFilterPreviewTask(FilterPreviewTask&& task){
 if(!filterPreview_||!task.completed||!task.result||task.identity!=identity_||task.revision!=revision_||task.revision!=filterPreview_->revision||task.contentRevision!=contentRevision_||task.contentRevision!=filterPreview_->contentRevision||task.generation!=filterPreview_->generation||task.width!=width_||task.height!=height_)return false;
 if(task.lcd&&(task.sourceFrameId!=activeFrameId_||timelineSelection_.layers!=std::vector<std::string>{task.sourceLayerId}))return false;if(task.lcd)checkLcdBudget(timeline_.state(),lcdSourceSurface(timeline_,task.sourceLayerId,task.sourceFrameId),task.lcdOptions);else checkFilterBudget(timeline_.state(),width_,height_,task.preset);filterPreview_->timeline=std::move(task.result);task.completed=false;++gradientRevision_;return true;
}
bool Document::restoreFilterPreview(){if(!filterPreview_)return false;filterPreview_->timeline.reset();filterPreview_->generation=++nextFilterGeneration_;++gradientRevision_;return true;}
void Document::cancelFilterPreview(){if(!filterPreview_)return;filterPreview_.reset();++nextFilterGeneration_;++gradientRevision_;}
bool Document::commitFilterPreviewTask(FilterPreviewTask&& task){
 if(!filterPreview_||!task.completed||!task.result||task.identity!=identity_||task.revision!=revision_||task.revision!=filterPreview_->revision||task.contentRevision!=contentRevision_||task.contentRevision!=filterPreview_->contentRevision||task.generation!=filterPreview_->generation||task.width!=width_||task.height!=height_)return false;if(task.lcd&&(task.sourceFrameId!=activeFrameId_||timelineSelection_.layers!=std::vector<std::string>{task.sourceLayerId}))return false;if(task.lcd)checkLcdBudget(timeline_.state(),lcdSourceSurface(timeline_,task.sourceLayerId,task.sourceFrameId),task.lcdOptions);else checkFilterBudget(timeline_.state(),width_,height_,task.preset);
 if(task.lcd){
 auto& next=task.result->state_;const auto& old=timeline_.state();if(next.layers.size()!=old.layers.size()+4||next.groups.size()!=old.groups.size()+1||next.frames.size()!=old.frames.size()||next.cels.size()!=old.cels.size()+4*old.frames.size()||!task.result->diagnoseLinks().empty())throw std::logic_error("Invalid LCD result structure");
 const auto group=std::find_if(next.groups.begin(),next.groups.end(),[&](const auto& g){return g.id==task.groupId;});if(group==next.groups.end())throw std::logic_error("Missing LCD result group");std::unordered_set<std::string> added;for(unsigned i=0;i<4;++i){const auto id=task.layerId+"-"+std::to_string(i);const auto layer=std::find_if(next.layers.begin(),next.layers.end(),[&](const auto& l){return l.id==id;});if(layer==next.layers.end()||layer->groupId!=std::optional<std::string>(task.groupId))throw std::logic_error("Missing LCD result channel");added.insert(id);}
 Edit edit{{},state_,nextState_};captureGroupEdit(edit,false);captureGroupEdit(edit,true);edit.layerHistory.afterLayerStructure->layers=next.layers;edit.layerHistory.afterLayerStructure->groups=next.groups;edit.afterActive=task.layerId+"-0";edit.afterTimelineSelection=TimelineSelection{};edit.afterTimelineSelection->layerAnchor=task.groupId;edit.layerHistory.afterGroupUi->selected={task.groupId};edit.layerHistory.afterGroupUi->focus=task.groupId;
 edit.layerHistory.structureCels.reserve(4*old.frames.size());for(auto& c:next.cels)if(added.count(c.layerId)){edit.layerHistory.structureCelBytes+=sizeof(c)+c.id.size()+c.layerId.size()+c.frameId.size()+(c.linkedCelId?c.linkedCelId->size():0)+(c.surface?c.surface->pixels.size()*sizeof(Pixel):0);edit.layerHistory.structureCels.push_back(std::move(c));}if(edit.layerHistory.structureCels.size()!=4*old.frames.size())throw std::logic_error("Incomplete LCD frame slots");
 const bool committed=commitGroupEdit(std::move(edit),U"LCD屏幕滤镜");if(committed){cancelFilterPreview();task.completed=false;}return committed;
 }
 const auto& next=task.result->state();if(next.layers.size()!=timeline_.state().layers.size()+1||next.layers.front().id!=task.layerId||next.frames.size()!=timeline_.state().frames.size()||next.cels.size()!=timeline_.state().cels.size()+next.frames.size()||!task.result->diagnoseLinks().empty())throw std::logic_error("Invalid filter result structure");
 Edit edit{{},state_,nextState_};edit.maskHistory.maskContext=std::make_shared<MaskHistory::MaskContextHistory>(MaskHistory::MaskContextHistory{activeMaskId_,activeMaskId_,maskIsolated_,maskIsolated_});captureLayerOrder(edit,false);edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTimelineSelection=timelineSelection_;edit.beforeSelection=selectedFrames_;edit.beforeFrameAnchor=frameAnchor_;edit.layerHistory.detachedLayer=next.layers.front();edit.contentHistory.detachedCels.reserve(next.frames.size());for(const auto& c:next.cels)if(c.layerId==task.layerId)edit.contentHistory.detachedCels.push_back(c);if(edit.contentHistory.detachedCels.size()!=next.frames.size())throw std::logic_error("Incomplete filter result frame slots");for(const auto& l:next.layers)edit.layerHistory.afterOrder.push_back(l.id);edit.afterActive=task.layerId;
 auto after=timelineSelection_;after.layers={task.layerId};after.layerAnchor=task.layerId;edit.afterTimelineSelection=after;edit.afterSelection=selectedFrames_;edit.afterFrameAnchor=frameAnchor_;for(const auto& l:timeline_.state().layers)edit.layerHistory.beforeLayerOpacityProjection.push_back({l.id,l.opacity});for(const auto& l:next.layers)edit.layerHistory.afterLayerOpacityProjection.push_back({l.id,l.opacity});
 auto active=task.layerId;reserveHistoryEntries();timeline_=std::move(*task.result);activeLayerId_=std::move(active);timelineSelection_=std::move(after);cancelFilterPreview();change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),task.lcd?U"LCD屏幕滤镜":std::u32string(filterPresetDefinition(task.preset).name));return true;
}
bool Document::applyFilterPreset(FilterPreset preset,std::optional<double> opacity){
 if(!beginFilterPreview())return false;try{auto task=captureFilterPreviewTask(preset,opacity);if(!task||!runFilterPreviewTask(*task,{})){cancelFilterPreview();return false;}return commitFilterPreviewTask(std::move(*task));}catch(...){cancelFilterPreview();throw;}
}

bool Document::applyLcdScreenFilter(int width,int height){if(!beginFilterPreview())return false;try{auto task=captureFilterPreviewTask(FilterPreset::CrtSubtle,{},true,width,height);if(!task||!runFilterPreviewTask(*task,{})){cancelFilterPreview();return false;}return commitFilterPreviewTask(std::move(*task));}catch(...){cancelFilterPreview();throw;}}

bool Document::beginColorAdjustment(const std::vector<std::string>& layers){
 commitFloatingPaste();cancelStroke();auto ids=selection_ || layers.empty()?std::vector<std::string>{layer().id}:layers;std::vector<std::string> targets;
 for(const auto& id:ids){const auto it=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==id;});if(it==timeline_.state().layers.end() || !it->kind.empty() || layerEffectivelyLocked(*it))continue;const auto* c=timeline_.findCel(id,frame().id);if(!c)continue;const auto resolved=timeline_.resolveSurface(c->id);if(!resolved.source || !resolved.surface)continue;if(std::find(targets.begin(),targets.end(),resolved.source->id)==targets.end())targets.push_back(resolved.source->id);}
 if(targets.empty())return false;adjustmentStorageBudget(timeline_,3);adjustment_=AdjustmentPreview{timeline_,timeline_,std::move(targets),selection_,layer().id,frame().id,contentRevision_};++gradientRevision_;return true;
}
bool Document::beginColorReplacement(const std::vector<std::string>& celIds,bool clipSelection){
 if(!activeMaskId_.empty()&&celIds==std::vector<std::string>{activeMaskId_}){
  commitFloatingPaste();cancelStroke();if(clipSelection&&!selection_)return false;const auto* mask=adjustmentMask(timeline_,activeMaskId_);if(!mask||adjustmentMaskLocked(timeline_,*mask))return false;
  adjustmentStorageBudget(timeline_,3);adjustment_=AdjustmentPreview{timeline_,timeline_,celIds,selection_,layer().id,frame().id,contentRevision_,clipSelection};adjustment_->maskContext=activeMaskId_;++gradientRevision_;return true;
 }
 commitFloatingPaste();cancelStroke();if(clipSelection && !selection_)return false;std::vector<std::string> targets;
 for(const auto& id:celIds){const auto* c=timeline_.findCelById(id);if(!c)continue;const auto l=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==c->layerId;});if(l==timeline_.state().layers.end() || l->kind=="adjustment" || layerEffectivelyLocked(*l))continue;if(!l->kind.empty())return false;const auto r=timeline_.resolveSurface(id);if(r.source && r.surface && std::find(targets.begin(),targets.end(),r.source->id)==targets.end())targets.push_back(r.source->id);}
 if(targets.empty())return false;adjustmentStorageBudget(timeline_,3);adjustment_=AdjustmentPreview{timeline_,timeline_,std::move(targets),selection_,layer().id,frame().id,contentRevision_,clipSelection};adjustment_->maskContext=activeMaskId_;++gradientRevision_;return true;
}
bool Document::updateColorReplacement(Pixel source,Pixel replacement,bool enabled){
 if(!adjustment_)return false;auto& p=*adjustment_;
 if(p.maskContext!=activeMaskId_){cancelColorAdjustment();return false;}
 if(p.contentRevision!=contentRevision_ || p.frameId!=frame().id || p.layerId!=layer().id || !selectionEqual(p.selection,selection_)){cancelColorAdjustment();return false;}
 adjustmentStorageBudget(p.baseline,4);auto preview=p.baseline;
 if(enabled && source!=replacement)for(const auto& id:p.targets){
  timeline::Surface* s=nullptr;const bool mask=adjustmentMask(p.baseline,id)!=nullptr;if(mask){for(auto& slot:preview.state_.masks)if(slot.mask.id==id)s=&slot.mask.surface;}else s=preview.mutableOwnedSurface(id);if(!s)throw std::logic_error("Missing replacement owner");
  for(int y=0;y<s->height;++y)for(int x=0;x<s->width;++x){auto& value=s->pixels[std::size_t(y)*s->width+x];
   const auto wx=std::int64_t(x)+s->offsetX,wy=std::int64_t(y)+s->offsetY;
   if(value==source && (!p.clipSelection || (wx>=0&&wy>=0&&wx<width_&&wy<height_&&selectionContains(p.selection,int(wx),int(wy)))))value=normalizeCanvasPacked(replacement,mask);
  }
 }
 p.preview=std::move(preview);++gradientRevision_;return true;
}
bool Document::updateColorAdjustment(const ColorAdjustment& a,bool enabled){
 if(!adjustment_)return false;auto& p=*adjustment_;
 if(p.contentRevision!=contentRevision_ || p.frameId!=frame().id || p.layerId!=layer().id || !selectionEqual(p.selection,selection_)){cancelColorAdjustment();return false;}
 adjustmentStorageBudget(p.baseline,4);ColorAdjustmentSampler sample(a);auto preview=p.baseline;
 if(enabled)for(const auto& id:p.targets){
  std::unordered_map<Pixel,Pixel> repeated;bool cache=true;auto* s=preview.mutableOwnedSurface(id);if(!s)throw std::logic_error("Missing adjustment owner");
  // Legacy visits owned pixels, including outside the canvas; selection uses world coordinates.
  for(int y=0;y<s->height;++y)for(int x=0;x<s->width;++x){
   const int wx=s->offsetX+x,wy=s->offsetY+y;
   if(p.selection && !selectionContains(p.selection,wx,wy))continue;
   auto& value=s->pixels[std::size_t(y)*s->width+x];
   if(a.kind==ColorAdjustmentKind::HueSaturation && (value>>24)){
    const auto rgb=value&0xffffff;const auto found=repeated.find(rgb);
    if(cache && found!=repeated.end())value=(value&0xff000000)|found->second;
    else{const auto next=sample(value,wx,wy);if(cache){if(repeated.size()<8192)repeated.emplace(rgb,next&0xffffff);else{cache=false;repeated.clear();}}value=next;}
   }else value=sample(value,wx,wy);
   value=normalizeCanvasPacked(value);
  }
 }
 p.preview=std::move(preview);++gradientRevision_;return true;
}
bool Document::beginAntiAliasPreview(const std::vector<MaskSlotKey>& maskSlots){
 if(!maskSlots.empty()||!activeMaskId_.empty()){
  commitFloatingPaste();cancelStroke();const auto& state=timeline_.state();std::vector<std::string> targets,frames;
  auto collect=[&](const timeline::AttachedMask* mask,const std::string& frame){if(!mask)return true;const auto* slot=adjustmentMask(timeline_,mask->id);if(!slot||adjustmentMaskLocked(timeline_,*slot))return false;if(std::find(targets.begin(),targets.end(),mask->id)==targets.end()){targets.push_back(mask->id);frames.push_back(frame);}return true;};
  if(!maskSlots.empty()){for(const auto& key:maskSlots)if(!collect(timeline::resolvedMask(state,key.first,key.second),key.second))return false;}
  else if(!collect(mutableActiveMask(),activeFrameId_))return false;
  if(targets.empty())return false;adjustmentStorageBudget(timeline_,3);adjustment_=AdjustmentPreview{timeline_,timeline_,std::move(targets),selection_,layer().id,frame().id,contentRevision_,true,std::move(frames)};adjustment_->maskContext=activeMaskId_;++gradientRevision_;return true;
 }
 const auto commandLayers=selectedLayerIdsWithGroups();if(hasSelectedGroups()&&commandLayers.empty())return false;
 commitFloatingPaste();cancelStroke();const auto& state=timeline_.state();std::vector<std::string> selected;
 if(!timelineSelection_.cels.empty())selected=timelineSelection_.cels;
 else{std::vector<std::string> layers=commandLayers;if(layers.empty()){if(!selectedFrames_.empty()){for(const auto& l:state.layers)if(layerEffectivelyVisible(l)&&!layerEffectivelyLocked(l))layers.push_back(l.id);}else layers.push_back(layer().id);}const auto frames=selectedFrames_.empty()?std::vector<std::string>{frame().id}:selectedFrames_;for(const auto& f:frames)for(auto it=state.layers.rbegin();it!=state.layers.rend();++it)if(std::find(layers.begin(),layers.end(),it->id)!=layers.end()){const auto* c=timeline_.findCel(it->id,f);if(c)selected.push_back(c->id);}}
 std::vector<std::string> targets,frames;for(const auto& id:selected){const auto* c=timeline_.findCelById(id);if(!c)continue;auto l=std::find_if(state.layers.begin(),state.layers.end(),[&](const auto& l){return l.id==c->layerId;});if(l==state.layers.end()||!l->kind.empty())continue;if(layerEffectivelyLocked(*l))return false;const auto r=timeline_.resolveSurface(id);if(!r.source||!r.surface)continue;if(std::find(targets.begin(),targets.end(),r.source->id)==targets.end()){targets.push_back(r.source->id);frames.push_back(c->frameId);}}
 if(targets.empty())return false;adjustmentStorageBudget(timeline_,3);adjustment_=AdjustmentPreview{timeline_,timeline_,std::move(targets),selection_,layer().id,frame().id,contentRevision_,true,std::move(frames)};++gradientRevision_;return true;
}
std::optional<Document::AntiAliasTask> Document::captureAntiAliasTask() const {
 auto captured=captureConvolutionTask();if(!captured)return {};AntiAliasTask task{std::move(*captured),adjustment_->baseline,adjustment_->targetFrames,{}};for(int id:palette_.order()){const auto* entry=paletteEntry(id);if(entry&&entry->id&&(entry->color>>24))task.palette.push_back(entry->color);}return task;
}
std::optional<std::vector<std::vector<Pixel>>> Document::runAntiAliasTask(AntiAliasTask task,const AntiAliasOptions& options,const std::function<bool()>& cancelled){
 std::vector<std::vector<Pixel>> results;const auto& captured=task.captured;
 for(std::size_t i=0;i<captured.targets.size();++i){if(cancelled())return {};const auto& target=captured.targets[i];auto* surface=task.timeline.mutableOwnedSurface(target.first);auto composite=compositeNormalRegion(task.timeline,captured.frameId,{0,0,captured.width,captured.height});auto canvas=options.colorSource==1?composite:std::vector<Pixel>{};auto sample=[&](int x,int y){if(x<0||y<0||x>=captured.width||y>=captured.height)return Pixel(0);return composite[std::size_t(y)*captured.width+x];};auto write=[&](std::size_t index,Pixel value){if(value>>24)value=color_mode::quantizePixelColor(value,captured.pixelFormat);surface->pixels[index]=value;composite[index]=compositeNormalRegion(task.timeline,captured.frameId,{int(index%captured.width),int(index/captured.width),1,1})[0];};auto out=antiAliasPixels(target.second,captured.width,captured.height,captured.selection,options,task.palette,canvas,sample,write,cancelled);if(!out)return {};results.emplace_back(surface->pixels);}
 return results;
}
std::optional<Document::AntiAliasSurfaceTask> Document::captureAntiAliasSurfaceTask(const AntiAliasOptions& options)const{
 if(!adjustment_)return {};const auto& p=*adjustment_;
 if(p.contentRevision!=contentRevision_||p.frameId!=frame().id||p.layerId!=layer().id||!selectionEqual(p.selection,selection_))return {};
 AntiAliasSurfaceTask task;task.maskContext=p.maskContext;if(task.maskContext!=activeMaskId_)return {};task.options=options;task.surfaces.baseBytes=convolutionSnapshotBytes(timeline_,p.baseline,p.preview);task.simulationBytes=adjustmentStorageBudget(p.baseline,1);
 const auto minimum=std::uint64_t(antiAliasCanvasCount(width_,height_))*(options.colorSource==1?80:24);std::size_t used=task.surfaces.baseBytes;
 if(task.simulationBytes>adjustmentByteLimit-used)throw std::length_error("Anti-alias capture exceeds pixel budget");used+=task.simulationBytes;
 if(minimum>adjustmentByteLimit-used)throw std::length_error("Anti-alias capture exceeds pixel budget");used+=std::size_t(minimum);
 const bool masks=!p.targets.empty()&&adjustmentMask(p.baseline,p.targets.front());
 for(const auto& id:p.targets){const auto r=p.baseline.resolveSurface(id);const auto* m=masks?adjustmentMask(p.baseline,id):nullptr;const auto* surface=m?&m->mask.surface:r.surface;if(!surface||(!m&&(!r.source||r.source->id!=id)))throw std::logic_error("Invalid anti-alias owner");const auto bytes=convolutionSurfaceBytes(*surface);if(bytes>adjustmentByteLimit-used)throw std::length_error("Anti-alias capture exceeds pixel budget");used+=bytes;}
 if(masks){auto& source=task.surfaces.source;source.width=width_;source.height=height_;source.identity=identity_;source.revision=contentRevision_;source.previewRevision=gradientRevision_;source.layerId=p.layerId;source.frameId=p.frameId;source.selection=p.selection;source.documentBytes=adjustmentStorageBudget(p.baseline,4);for(const auto& id:p.targets)source.targets.push_back({id,adjustmentMask(p.baseline,id)->mask.surface});}
 else{auto source=captureGradientMapTask();if(!source)return {};task.surfaces.source=std::move(*source);}
 task.simulation=p.baseline;task.frames=p.targetFrames;
 if(task.frames.size()!=p.targets.size())throw std::logic_error("Missing anti-alias target frames");
 for(int id:palette_.order()){const auto* entry=paletteEntry(id);if(entry&&entry->id&&(entry->color>>24))task.palette.push_back(entry->color);}return task;
}
bool Document::runAntiAliasSurfaceTask(AntiAliasSurfaceTask& task,const std::function<bool()>& cancelled){
 auto& s=task.surfaces;s.completed=false;s.results.clear();s.produced.clear();s.plans.clear();s.plannedBytes=0;task.scratchBytes=0;auto stop=[&]{return cancelled&&cancelled();};if(stop())return false;
 const auto& captured=s.source;const int width=captured.width,height=captured.height;
 if(task.frames.size()!=captured.targets.size()||task.simulationBytes!=adjustmentStorageBudget(task.simulation,1))throw std::logic_error("Invalid anti-alias simulation");
 for(std::size_t i=0;i<captured.targets.size();++i){if(stop())return false;if(!task.simulation.hasFrame(task.frames[i]))throw std::logic_error("Missing anti-alias target frame");const auto& target=captured.targets[i];
  auto plan=antiAliasSurfacePlan(target.surface,width,height);const auto bytes=convolutionSurfaceBytes(plan.geometry);if(bytes>adjustmentByteLimit-s.plannedBytes)throw std::length_error("Anti-alias result exceeds pixel budget");s.plannedBytes+=bytes;s.plans.push_back(std::move(plan));
  const auto scratch=antiAliasScratch(target.surface,width,height,captured.selection,task.options,stop);if(stop())return false;task.scratchBytes=std::max(task.scratchBytes,scratch);
 }
 antiAliasTaskStorage(task);s.results.resize(captured.targets.size());s.produced.assign(captured.targets.size(),0);
 for(std::size_t i=0;i<captured.targets.size();++i){if(stop())return false;const auto& target=captured.targets[i];const bool mask=adjustmentMask(task.simulation,target.ownerId)!=nullptr;timeline::Surface* surface=nullptr;if(mask){for(auto& slot:task.simulation.state_.masks)if(slot.mask.id==target.ownerId)surface=&slot.mask.surface;}else surface=task.simulation.mutableOwnedSurface(target.ownerId);if(!surface)throw std::logic_error("Missing anti-alias simulation owner");
  // Detached union preserves all raw outside bytes, including hidden RGB.
  if(!adjustmentSameGeometry(*surface,s.plans[i].geometry)||(surface->width==1&&surface->height==1&&!(surface->pixels[0]>>24))){
   auto expanded=s.plans[i].geometry;expanded.pixels.assign(std::size_t(expanded.width)*expanded.height,0);
   if(!(surface->width==1&&surface->height==1&&!(surface->pixels[0]>>24)))for(int y=0;y<surface->height;++y){if(stop())return false;const auto at=raster::worldIndex(expanded,surface->offsetX,std::int64_t(surface->offsetY)+y);if(!at)throw std::logic_error("Invalid anti-alias union");std::copy_n(surface->pixels.begin()+std::size_t(y)*surface->width,surface->width,expanded.pixels.begin()+*at);}
   std::swap(*surface,expanded);
  }
  std::vector<Pixel> input(antiAliasCanvasCount(width,height)),composite(input.size());
  for(int y=0;y<height;++y){if(stop())return false;for(int x=0;x<width;++x)input[std::size_t(y)*width+x]=raster::readWorld(*surface,x,y);auto row=compositeNormalRegion(task.simulation,task.frames[i],{0,y,width,1});std::copy(row.begin(),row.end(),composite.begin()+std::size_t(y)*width);}
  auto canvas=task.options.colorSource==1?composite:std::vector<Pixel>{};bool changed=false;
  auto sample=[&](int x,int y){return x<0||y<0||x>=width||y>=height?Pixel(0):composite[std::size_t(y)*width+x];};
  auto write=[&](std::size_t index,Pixel value){if(index>=input.size())throw std::logic_error("Invalid anti-alias pixel");const int x=int(index%width),y=int(index/width);auto local=raster::worldIndex(*surface,x,y);if(!local)throw std::logic_error("Anti-alias target outside union");value=mask?timeline::normalizedMaskPixel(value):!(value>>24)?value:color_mode::quantizePixelColor(value,captured.pixelFormat);changed=changed||input[index]!=value;surface->pixels[*local]=value;composite[index]=compositeNormalRegion(task.simulation,task.frames[i],{x,y,1,1})[0];};
  auto output=antiAliasPixels(input,width,height,captured.selection,task.options,task.palette,canvas,sample,write,stop);if(!output||stop())return false;
  // Legacy recordPixel rejects unchanged packed values: geometry alone is no edit.
  if(changed){s.results[i]=*surface;s.produced[i]=1;}
 }
 if(stop())return false;s.completed=true;return true;
}
bool Document::publishAntiAliasSurfaceTask(AntiAliasSurfaceTask&& task){
 if(!adjustment_||!task.surfaces.completed)return false;auto& p=*adjustment_;if(task.maskContext!=p.maskContext||task.maskContext!=activeMaskId_)return false;
 if(task.frames!=p.targetFrames||!antiAliasCompositeContextEqual(timeline_,task.simulation))return false;
 std::vector<Pixel> palette;for(int id:palette_.order()){const auto* entry=paletteEntry(id);if(entry&&entry->id&&(entry->color>>24))palette.push_back(entry->color);}if(palette!=task.palette)return false;
 for(const auto& c:p.baseline.state().cels)if(c.surface){const auto live=timeline_.resolveSurface(c.id);if(live.issue!=timeline::LinkIssue::None||!live.surface||!adjustmentSameGeometry(*c.surface,*live.surface)||c.surface->pixels!=live.surface->pixels)return false;}
 if(timeline_.state().masks.size()!=p.baseline.state().masks.size())return false;
 for(const auto& old:p.baseline.state().masks){const auto* now=adjustmentMask(timeline_,old.mask.id);if(!now||now->ownerId!=old.ownerId||now->frameId!=old.frameId||now->group!=old.group||now->mask.linkedMaskId!=old.mask.linkedMaskId||now->mask.visible!=old.mask.visible||now->mask.locked!=old.mask.locked||now->mask.autoLinkAnimationCels!=old.mask.autoLinkAnimationCels||now->mask.moveWithOwner!=old.mask.moveWithOwner||!adjustmentSameGeometry(now->mask.surface,old.mask.surface)||now->mask.surface.pixels!=old.mask.surface.pixels)return false;}
 if(!p.targets.empty()&&adjustmentMask(p.baseline,p.targets.front())){
  const auto& source=task.surfaces.source;if(source.identity!=identity_||source.revision!=contentRevision_||source.previewRevision!=gradientRevision_||source.layerId!=layer().id||source.frameId!=frame().id||!selectionEqual(source.selection,selection_)||source.targets.size()!=p.targets.size()||task.surfaces.results.size()!=p.targets.size()||task.surfaces.produced.size()!=p.targets.size())return false;
  antiAliasTaskStorage(task);auto preview=p.baseline;std::vector<std::string> changed;
  for(std::size_t i=0;i<p.targets.size();++i){if(source.targets[i].ownerId!=p.targets[i]||!adjustmentSameGeometry(source.targets[i].surface,adjustmentMask(p.baseline,p.targets[i])->mask.surface)||source.targets[i].surface.pixels!=adjustmentMask(p.baseline,p.targets[i])->mask.surface.pixels)return false;if(task.surfaces.produced[i]){raster::validate(task.surfaces.results[i]);if(!adjustmentSameGeometry(task.surfaces.results[i],task.surfaces.plans[i].geometry))return false;for(auto& slot:preview.state_.masks)if(slot.mask.id==p.targets[i])slot.mask.surface=std::move(task.surfaces.results[i]);changed.push_back(p.targets[i]);}}
  if(changed.empty())return false;timeline::validateMasks(preview.state());p.preview=std::move(preview);p.convolutionTargets=std::move(changed);++gradientRevision_;return true;
 }
 antiAliasTaskStorage(task);
 task.simulation=timeline::Timeline{};
 return publishConvolutionSurfaceTask(std::move(task.surfaces));
}
bool Document::commitAntiAliasAdjustment(){
 if(!adjustment_)return false;
 if(!adjustment_->targets.empty()&&adjustmentMask(adjustment_->baseline,adjustment_->targets.front())){
  auto& p=*adjustment_;if(p.contentRevision!=contentRevision_||p.maskContext!=activeMaskId_||p.layerId!=layer().id||p.frameId!=frame().id||!selectionEqual(p.selection,selection_)){cancelColorAdjustment();return false;}if(p.convolutionTargets.empty()){cancelColorAdjustment();return false;}
  for(const auto& id:p.targets){const auto* slot=adjustmentMask(timeline_,id);if(!slot||adjustmentMaskLocked(timeline_,*slot))return false;}
  Edit edit{{},state_,nextState_};edit.maskHistory.beforeMasks=timeline_.state().masks;edit.maskHistory.afterMasks=p.preview.state().masks;edit.maskHistory.maskContext=std::make_shared<MaskHistory::MaskContextHistory>(MaskHistory::MaskContextHistory{activeMaskId_,activeMaskId_,maskIsolated_,maskIsolated_});reserveHistoryEntries();timeline_.state_.masks=*edit.maskHistory.afterMasks;cancelColorAdjustment();change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"自动抗锯齿");return true;
 }
 // Legacy selected-target command refuses the batch if any selected target locks.
 for(const auto& id:adjustment_->targets){const auto r=timeline_.resolveSurface(id);if(!r.source)throw std::logic_error("Missing anti-alias commit owner");const auto l=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& item){return item.id==r.source->layerId;});if(l==timeline_.state().layers.end())throw std::logic_error("Missing anti-alias commit layer");if(layerEffectivelyLocked(*l))return false;}
 return commitSurfaceAdjustment(U"自动抗锯齿");
}
std::optional<Document::GradientMapTask> Document::captureGradientMapTask()const{
 if(!adjustment_)return {};const auto& p=*adjustment_;
 if(p.contentRevision!=contentRevision_ || p.frameId!=frame().id || p.layerId!=layer().id || !selectionEqual(p.selection,selection_))return {};
 const auto bytes=adjustmentStorageBudget(p.baseline,4);auto remaining=adjustmentByteLimit-4*bytes;
 // Budget every owner before copying the first target surface.
 for(const auto& id:p.targets){const auto r=p.baseline.resolveSurface(id);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface||r.source->id!=id)throw std::logic_error("Invalid gradient map owner");if(r.surface->pixels.size()>remaining/sizeof(Pixel))throw std::length_error("Gradient map worker exceeds pixel budget");remaining-=r.surface->pixels.size()*sizeof(Pixel);}
 GradientMapTask task{width_,height_,identity_,contentRevision_,gradientRevision_,p.layerId,p.frameId,p.selection,bytes,{}};task.pixelFormat=pixelFormat_;task.targets.reserve(p.targets.size());
 for(const auto& id:p.targets)task.targets.push_back({id,*p.baseline.resolveSurface(id).surface});return task;
}
bool Document::runGradientMapTask(GradientMapTask& task,const GradientMapSettings& settings,const std::function<bool()>& cancelled){
 task.completed=false;gradientMapTaskStorage(task);auto stop=[&]{return cancelled&&cancelled();};if(stop())return false;
 GradientMapSampler sampler(settings);
 for(auto& target:task.targets){auto& s=target.surface;
  for(int y=0;y<s.height;++y){const int wy=s.offsetY+y;const auto row=std::size_t(y)*s.width;
   for(int x=0;x<s.width;++x){const auto i=row+x;if((i&1023)==0&&stop())return false;const int wx=s.offsetX+x;
    if(!task.selection||selectionContains(task.selection,wx,wy))s.pixels[i]=color_mode::normalizeRgbaPackedValue(task.pixelFormat,sampler(s.pixels[i],wx,wy));
   }
  }
 }
 if(stop())return false;task.completed=true;return true;
}
bool Document::publishGradientMapTask(GradientMapTask&& task){
 if(!adjustment_||!task.completed||task.identity!=identity_||task.revision!=contentRevision_||task.previewRevision!=gradientRevision_||task.width!=width_||task.height!=height_||task.layerId!=layer().id||task.frameId!=frame().id||!selectionEqual(task.selection,selection_))return false;
 auto& p=*adjustment_;if(p.contentRevision!=contentRevision_||p.layerId!=task.layerId||p.frameId!=task.frameId||!selectionEqual(p.selection,task.selection)||p.targets.size()!=task.targets.size())return false;
 // Metadata-only rewiring may not advance contentRevision; unrelated flags remain valid.
 if(timeline_.state().cels.size()!=p.baseline.state().cels.size())return false;
 for(const auto& c:p.baseline.state().cels){const auto* live=timeline_.findCelById(c.id);if(!live||live->layerId!=c.layerId||live->frameId!=c.frameId)return false;const auto old=p.baseline.resolveSurface(c.id),now=timeline_.resolveSurface(c.id);if(old.issue!=now.issue||bool(old.source)!=bool(now.source)||(old.source&&old.source->id!=now.source->id))return false;}
 const auto bytes=adjustmentStorageBudget(p.baseline,4);if(task.documentBytes!=bytes)return false;gradientMapTaskStorage(task);
 for(std::size_t i=0;i<task.targets.size();++i){const auto& t=task.targets[i];if(p.targets[i]!=t.ownerId)return false;const auto b=p.baseline.resolveSurface(t.ownerId),live=timeline_.resolveSurface(t.ownerId);if(b.issue!=timeline::LinkIssue::None||live.issue!=timeline::LinkIssue::None||!b.source||!live.source||!b.surface||!live.surface||b.source->id!=t.ownerId||live.source->id!=t.ownerId||!adjustmentSameGeometry(*b.surface,t.surface)||!adjustmentSameGeometry(*b.surface,*live.surface))return false;}
 auto preview=p.baseline;std::vector<timeline::Surface*> owners;owners.reserve(task.targets.size());
 for(const auto& t:task.targets){auto* s=preview.mutableOwnedSurface(t.ownerId);if(!s)throw std::logic_error("Missing gradient map preview owner");owners.push_back(s);}
 // All allocations and validation precede noexcept publication.
 for(std::size_t i=0;i<owners.size();++i)owners[i]->pixels.swap(task.targets[i].surface.pixels);
 p.preview=std::move(preview);task.completed=false;++gradientRevision_;return true;
}
std::optional<Document::ConvolutionSurfaceTask> Document::captureConvolutionSurfaceTask(const ConvolutionOptions& options)const{
 if(!adjustment_)return {};const auto& p=*adjustment_;if(p.contentRevision!=contentRevision_||p.frameId!=frame().id||p.layerId!=layer().id||!selectionEqual(p.selection,selection_))return {};
 ConvolutionSurfaceTask task;task.options=options;task.baseBytes=convolutionSnapshotBytes(timeline_,p.baseline,p.preview);
 auto source=captureGradientMapTask();if(!source)return {};task.source=std::move(*source);return task;
}
bool Document::runConvolutionSurfaceTask(ConvolutionSurfaceTask& task,const std::function<bool()>& cancelled){
 task.completed=false;auto stop=[&]{return cancelled&&cancelled();};task.results.clear();task.produced.clear();task.plans.clear();task.plannedBytes=0;if(stop())return false;
 task.plans.reserve(task.source.targets.size());
 // Plan all detached geometry and allocations on the cancellable worker before result allocation.
 for(const auto& target:task.source.targets){if(stop())return false;auto plan=planConvolutionSurface(target.surface,task.source.width,task.source.height,task.options,task.source.selection,stop);if(stop())return false;const auto bytes=convolutionSurfaceBytes(plan.geometry);if(bytes>adjustmentByteLimit-task.plannedBytes)throw std::length_error("Convolution result exceeds pixel budget");task.plannedBytes+=bytes;task.plans.push_back(std::move(plan));}
 convolutionTaskStorage(task);task.results.resize(task.source.targets.size());task.produced.assign(task.source.targets.size(),0);
 for(std::size_t i=0;i<task.source.targets.size();++i){if(stop())return false;auto out=convolveSurface(task.source.targets[i].surface,task.source.width,task.source.height,task.options,task.source.selection,task.plans[i],stop,[&](Pixel value){return color_mode::quantizePixelColor(value,task.source.pixelFormat);});if(stop())return false;if(out){if(!adjustmentSameGeometry(*out,task.plans[i].geometry))throw std::logic_error("Convolution result geometry mismatch");task.results[i]=std::move(*out);task.produced[i]=1;}}
 if(stop())return false;task.completed=true;return true;
}
bool Document::restoreConvolutionBaseline(){if(!adjustment_)return false;auto& p=*adjustment_;(void)convolutionSnapshotBytes(timeline_,p.baseline,p.preview);auto preview=p.baseline;p.preview=std::move(preview);p.convolutionTargets.clear();++gradientRevision_;return true;}
bool Document::publishConvolutionSurfaceTask(ConvolutionSurfaceTask&& task){
 const auto& captured=task.source;
 if(!adjustment_||!task.completed||captured.identity!=identity_||captured.revision!=contentRevision_||captured.previewRevision!=gradientRevision_||captured.width!=width_||captured.height!=height_||captured.layerId!=layer().id||captured.frameId!=frame().id||!selectionEqual(captured.selection,selection_))return false;
 auto& p=*adjustment_;if(p.contentRevision!=contentRevision_||p.layerId!=captured.layerId||p.frameId!=captured.frameId||!selectionEqual(p.selection,captured.selection)||p.targets.size()!=captured.targets.size()||task.results.size()!=p.targets.size()||task.produced.size()!=p.targets.size())return false;
 if(timeline_.state().cels.size()!=p.baseline.state().cels.size())return false;
 for(const auto& c:p.baseline.state().cels){const auto* live=timeline_.findCelById(c.id);if(!live||live->layerId!=c.layerId||live->frameId!=c.frameId)return false;const auto old=p.baseline.resolveSurface(c.id),now=timeline_.resolveSurface(c.id);if(old.issue!=now.issue||bool(old.source)!=bool(now.source)||(old.source&&old.source->id!=now.source->id))return false;}
 if(task.baseBytes!=convolutionSnapshotBytes(timeline_,p.baseline,p.preview))return false;convolutionTaskStorage(task);std::vector<std::string> targets;targets.reserve(p.targets.size());
 for(std::size_t i=0;i<p.targets.size();++i){const auto& s=captured.targets[i];if(s.ownerId!=p.targets[i])return false;const auto b=p.baseline.resolveSurface(s.ownerId),live=timeline_.resolveSurface(s.ownerId);if(b.issue!=timeline::LinkIssue::None||live.issue!=timeline::LinkIssue::None||!b.source||!live.source||!b.surface||!live.surface||b.source->id!=s.ownerId||live.source->id!=s.ownerId||!adjustmentSameGeometry(*b.surface,s.surface)||!adjustmentSameGeometry(*b.surface,*live.surface)||b.surface->pixels!=s.surface.pixels||b.surface->pixels!=live.surface->pixels)return false;
  if(task.produced[i]){raster::validate(task.results[i]);if(!adjustmentSameGeometry(task.results[i],task.plans[i].geometry))return false;targets.push_back(s.ownerId);}}
 if(targets.empty())return false;auto preview=p.baseline;std::vector<timeline::Surface*> owners;owners.reserve(p.targets.size());
 for(std::size_t i=0;i<p.targets.size();++i){auto* s=task.produced[i]?preview.mutableOwnedSurface(p.targets[i]):nullptr;if(task.produced[i]&&!s)throw std::logic_error("Missing convolution preview owner");owners.push_back(s);}
 for(std::size_t i=0;i<owners.size();++i)if(owners[i])std::swap(*owners[i],task.results[i]);
 p.preview=std::move(preview);p.convolutionTargets=std::move(targets);task.completed=false;task.results.clear();task.source.targets.clear();++gradientRevision_;return true;
}
bool Document::commitConvolutionAdjustment(){return commitSurfaceAdjustment(U"卷积矩阵");}
bool Document::commitSurfaceAdjustment(const std::u32string& label){
 if(!adjustment_)return false;auto& p=*adjustment_;
 if(p.contentRevision!=contentRevision_||p.frameId!=frame().id||p.layerId!=layer().id||!selectionEqual(p.selection,selection_)){cancelColorAdjustment();return false;}
 if(p.convolutionTargets.empty()){cancelColorAdjustment();return false;}
 std::size_t used=0;for(const auto* t:{&timeline_,&p.baseline,&p.preview}){const auto bytes=adjustmentStorageBudget(*t,1);if(bytes>adjustmentByteLimit-used)throw std::length_error("Convolution history exceeds pixel budget");used+=bytes;}
 std::vector<std::string> targets;targets.reserve(p.convolutionTargets.size());
 for(const auto& id:p.convolutionTargets){const auto live=timeline_.resolveSurface(id),b=p.baseline.resolveSurface(id),a=p.preview.resolveSurface(id);
  if(live.issue!=timeline::LinkIssue::None||b.issue!=timeline::LinkIssue::None||a.issue!=timeline::LinkIssue::None||!live.source||!b.source||!a.source||!live.surface||!b.surface||!a.surface||live.source->id!=id||b.source->id!=id||a.source->id!=id)throw std::logic_error("Invalid convolution commit owner");
  raster::validate(*live.surface);raster::validate(*b.surface);raster::validate(*a.surface);if(!adjustmentSameGeometry(*live.surface,*b.surface)||live.surface->pixels!=b.surface->pixels)throw std::logic_error("Convolution source changed");
  auto l=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==live.source->layerId;});if(l==timeline_.state().layers.end())throw std::logic_error("Missing convolution layer");if(layerEffectivelyLocked(*l))continue;
  for(const auto* s:{b.surface,a.surface}){const auto bytes=convolutionSurfaceBytes(*s);if(bytes>adjustmentByteLimit-used)throw std::length_error("Convolution history exceeds pixel budget");used+=bytes;}targets.push_back(id);
 }
 if(targets.empty()){cancelColorAdjustment();return false;}
 Edit e{{},state_,nextState_};e.beforeActive=e.afterActive=layer().id;e.beforeFrame=e.afterFrame=frame().id;e.beforeSelection=e.afterSelection=selectedFrames_;e.contentHistory.surfaceChanges.reserve(targets.size());
 for(const auto& id:targets)e.contentHistory.surfaceChanges.push_back({id,*p.baseline.resolveSurface(id).surface,*p.preview.resolveSurface(id).surface});
 reserveHistoryEntries();struct Install{timeline::Surface* live;timeline::Surface* preview;};std::vector<Install> install;install.reserve(targets.size());
 for(const auto& id:targets){auto* live=timeline_.mutableOwnedSurface(id);auto* preview=p.preview.mutableOwnedSurface(id);if(!live||!preview)throw std::logic_error("Missing convolution install owner");install.push_back({live,preview});}
 for(const auto& t:install)std::swap(*t.live,*t.preview);
 cancelColorAdjustment();change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),label);return true;
}
std::optional<Document::ConvolutionTask> Document::captureConvolutionTask() const {
 if(!adjustment_)return {};const auto& p=*adjustment_;if(p.contentRevision!=contentRevision_ || p.frameId!=frame().id || p.layerId!=layer().id || !selectionEqual(p.selection,selection_))return {};
 ConvolutionTask task{width_,height_,identity_,contentRevision_,p.layerId,p.frameId,p.selection,{}};task.pixelFormat=pixelFormat_;for(const auto& id:p.targets){const auto* s=p.baseline.resolveSurface(id).surface;if(!s || s->width!=width_ || s->height!=height_ || s->offsetX || s->offsetY)throw std::runtime_error("Convolution requires native full canvas RGBA surface");task.targets.emplace_back(id,s->pixels);}return task;
}
bool Document::restoreGradientMapBaseline(){if(!adjustment_)return false;adjustmentStorageBudget(adjustment_->baseline,4);auto baseline=adjustment_->baseline;adjustment_->preview=std::move(baseline);++gradientRevision_;return true;}
bool Document::restoreAdjustmentBaseline(){if(!adjustment_)return false;adjustment_->preview=adjustment_->baseline;++gradientRevision_;return true;}
bool Document::publishConvolutionTask(const ConvolutionTask& task,const std::vector<std::vector<Pixel>>& results){
 if(!adjustment_ || task.identity!=identity_ || task.revision!=contentRevision_ || task.layerId!=layer().id || task.frameId!=frame().id || !selectionEqual(task.selection,selection_))return false;auto& p=*adjustment_;if(results.size()!=task.targets.size() || p.targets.size()!=task.targets.size())return false;
 for(std::size_t i=0;i<results.size();++i)if(p.targets[i]!=task.targets[i].first || results[i].size()!=std::size_t(width_)*height_)return false;
 auto preview=p.baseline;for(std::size_t i=0;i<results.size();++i)preview.mutableOwnedSurface(task.targets[i].first)->pixels=results[i];p.preview=std::move(preview);++gradientRevision_;return true;
}
void Document::cancelColorAdjustment(){if(adjustment_){adjustment_.reset();++gradientRevision_;}}
bool Document::commitColorAdjustment(){
 if(!adjustment_)return false;auto& p=*adjustment_;
 if(!p.maskContext.empty()&&p.maskContext!=activeMaskId_){cancelColorAdjustment();return false;}
 if(!p.targets.empty()&&adjustmentMask(p.baseline,p.targets.front())){
  if(p.contentRevision!=contentRevision_||p.maskContext!=activeMaskId_||p.frameId!=frame().id||p.layerId!=layer().id||!selectionEqual(p.selection,selection_)){cancelColorAdjustment();return false;}
  const auto* live=adjustmentMask(timeline_,p.maskContext);const auto* before=adjustmentMask(p.baseline,p.maskContext);const auto* after=adjustmentMask(p.preview,p.maskContext);if(!live||!before||!after||adjustmentMaskLocked(timeline_,*live))return false;
  if(before->mask.surface.pixels==after->mask.surface.pixels){cancelColorAdjustment();return false;}
  if(!adjustmentSameGeometry(live->mask.surface,before->mask.surface)||live->mask.surface.pixels!=before->mask.surface.pixels){cancelColorAdjustment();return false;}
  Edit edit{{},state_,nextState_};edit.maskHistory.beforeMasks=timeline_.state().masks;edit.maskHistory.afterMasks=*edit.maskHistory.beforeMasks;
  for(auto& slot:*edit.maskHistory.afterMasks)if(slot.mask.id==p.maskContext)slot.mask.surface=after->mask.surface;
  edit.maskHistory.maskContext=std::make_shared<MaskHistory::MaskContextHistory>(MaskHistory::MaskContextHistory{activeMaskId_,activeMaskId_,maskIsolated_,maskIsolated_});reserveHistoryEntries();timeline_.state_.masks=*edit.maskHistory.afterMasks;cancelColorAdjustment();change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"替换颜色");return true;
 }
 if(p.contentRevision!=contentRevision_ || p.frameId!=frame().id || p.layerId!=layer().id || !selectionEqual(p.selection,selection_)){cancelColorAdjustment();return false;}
 const auto storageBytes=adjustmentStorageBudget(p.baseline,3);
 std::size_t available=adjustmentByteLimit-3*storageBytes;
 Edit e{{},state_,nextState_};e.beforeActive=e.afterActive=layer().id;e.beforeFrame=e.afterFrame=frame().id;e.beforeSelection=e.afterSelection=selectedFrames_;
 if(!p.maskContext.empty())e.maskHistory.maskContext=std::make_shared<MaskHistory::MaskContextHistory>(MaskHistory::MaskContextHistory{activeMaskId_,activeMaskId_,maskIsolated_,maskIsolated_});
 e.children.reserve(p.targets.size());
 struct Install{timeline::Surface* live;timeline::Surface* preview;};std::vector<Install> install;install.reserve(p.targets.size());
 for(const auto& id:p.targets){
  const auto live=timeline_.resolveSurface(id),base=p.baseline.resolveSurface(id),next=p.preview.resolveSurface(id);
  if(live.issue!=timeline::LinkIssue::None || base.issue!=timeline::LinkIssue::None || next.issue!=timeline::LinkIssue::None || !live.source || !base.source || !next.source || !live.surface || !base.surface || !next.surface || live.source->id!=id || base.source->id!=id || next.source->id!=id)throw std::logic_error("Invalid adjustment owner");
  const auto& b=*base.surface;const auto& a=*next.surface;const auto& current=*live.surface;raster::validate(b);raster::validate(a);raster::validate(current);
  auto sameGeometry=[](const timeline::Surface& l,const timeline::Surface& r){return l.width==r.width&&l.height==r.height&&l.offsetX==r.offsetX&&l.offsetY==r.offsetY&&l.storageOriginX==r.storageOriginX&&l.storageOriginY==r.storageOriginY;};
  if(!sameGeometry(b,a)||!sameGeometry(b,current))throw std::logic_error("Adjustment owner geometry changed");
  const auto layerIt=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==live.source->layerId;});
  if(layerIt==timeline_.state().layers.end())throw std::logic_error("Missing adjustment layer");
  if(layerEffectivelyLocked(*layerIt))continue;
  // Stage the complete multi-owner history before changing any live pixels.
  std::size_t count=0;
  for(std::size_t i=0;i<b.pixels.size();++i)if(b.pixels[i]!=a.pixels[i]){
   if(!i || b.pixels[i-1]==a.pixels[i-1] || b.pixels[i-1]!=b.pixels[i] || a.pixels[i-1]!=a.pixels[i])++count;
  }
  if(!count)continue;
  if(count>available/sizeof(PixelRun))throw std::length_error("Adjustment history staging exceeds pixel budget");available-=count*sizeof(PixelRun);
  Edit child{{},state_,nextState_};child.contentHistory.targetCelId=id;child.contentHistory.pixelAddress=PixelAddressSpace{b.width,b.height,b.storageOriginX.value_or(0),b.storageOriginY.value_or(0)};child.contentHistory.runs.reserve(count);
  for(std::size_t i=0;i<b.pixels.size();++i)if(b.pixels[i]!=a.pixels[i]){
   if(!child.contentHistory.runs.empty() && child.contentHistory.runs.back().index+child.contentHistory.runs.back().length==i && child.contentHistory.runs.back().before==b.pixels[i] && child.contentHistory.runs.back().after==a.pixels[i])++child.contentHistory.runs.back().length;
   else child.contentHistory.runs.push_back({i,1,b.pixels[i],a.pixels[i]});
  }
  e.children.push_back(std::move(child));
 }
 if(e.children.empty()){cancelColorAdjustment();return false;}
 reserveHistoryEntries();
 for(const auto& child:e.children){auto* live=timeline_.mutableOwnedSurface(child.contentHistory.targetCelId);auto* preview=p.preview.mutableOwnedSurface(child.contentHistory.targetCelId);if(!live||!preview)throw std::logic_error("Missing adjustment install owner");install.push_back({live,preview});}
 // Preflight is complete; vector swaps preserve current metadata and cannot allocate.
 for(const auto& target:install)target.live->pixels.swap(target.preview->pixels);
 cancelColorAdjustment();change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"亮度/对比度");return true;
}

void Document::beginStroke(Point p,Pixel color,BrushOptions brush,const PatternBrush* image,double angle,const std::unordered_map<std::size_t,Pixel>* baseline,bool stampInitial,bool tileSecondary,bool tileErase,repeat::Mode repeatMode){try{
 if(activeMaskId_.empty()&&layer().kind=="free-tile"&&!freeTilePaintMode()){beginFreeTileSourceStroke(p,color,brush,image,angle,baseline,stampInitial,tileSecondary&&tileErase,repeatMode);return;}
 strokeColorReplacement_.reset();projectStrokeStarted_=std::chrono::steady_clock::now();
 commitFloatingPaste();cancelStroke();strokeRepeat_=repeatMode;imagePattern_.reset();if(image&&image->intrinsicSize&&brush.imagePaintMode!=PatternPaintMode::Paint)imagePattern_.emplace(*image,brush.imagePaintMode,p.x,p.y);strokeImageAngle_=angle;change_={};if(!activeMaskId_.empty()){if(!maskBrushAvailable())return;auto* mask=mutableActiveMask();prepareMaskStroke(true);auto& source=mask->surface;strokePixels_=&static_cast<std::vector<Pixel>&>(source.pixels);strokeCanvasStorage_=raster::fullCanvas(source,width_,height_);strokeStride_=source.width;strokeOffsetX_=source.offsetX;strokeOffsetY_=source.offsetY;strokeAddress_={width_,height_,raster::coordinate(std::int64_t(source.storageOriginX.value_or(0))-source.offsetX),raster::coordinate(std::int64_t(source.storageOriginY.value_or(0))-source.offsetY)};brush.size=std::clamp(brush.size,1,64);brush.opacity=std::clamp(brush.opacity,0,100);stampSpans_=brushSpans(brush);pendingLookup_.reset(width_,height_);inheritedStrokeBaseline_=baseline?*baseline:std::unordered_map<std::size_t,Pixel>{};imageStamp_=image?std::optional<ImageBrushStamp>{prepareImageBrushStamp(*image,brush.size,angle)}:std::nullopt;imageEraseCoverage_.clear();inkStampCoverage_.clear();active_=true;projectStrokeStarted_=std::chrono::steady_clock::now();last_=p;color_=color;brush_=brush;hasPreviousStamp_=false;if(brush_.perfectPixels){perfectPath_.push_back({p.x,p.y,brush.size,brush.opacity});perfectPendingStart_=pending_.size();capturingPerfectTail_=true;}if(stampInitial)stamp(p.x,p.y);publishChange();return;}if(layer().kind=="tilemap"){if(layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer())||hasSelectedGroups()||!timeline_.resolveSurface(cel().id).source||!timeline_.resolveSurface(cel().id).source->tilemap)return;if(!cel().tilemap&&!((tileSelection_.mode==tiles::Mode::Paint&&tilemapCellOwnerSupported(cel().id,true,true))||linkedCreateSelectionAvailable(false)||linkedEditSelectionAvailable(false)||linkedHybridSelectionAvailable(false)))return;startTilemapStroke(p,tileSecondary);if(tileErase)tilePaintValue_.reset();if(tileSelection_.mode==tiles::Mode::Paint){active_=true;last_=p;paintTilemapLine(p);return;}}else if(!rasterToolsAvailable())return;
 const auto* slot=timeline_.findCel(layer().id,frame().id);
 // Legacy recordPixel edits display storage; syncActiveAnimationLayer creates
 // the missing Cel only after a nonempty pixel history entry is committed.
 std::optional<timeline::Surface> absent;
 if(!slot){
  const auto used=adjustmentStorageBudget(timeline_,1);const auto count=std::uint64_t(width_)*height_;if(count>(adjustmentByteLimit-used)/sizeof(Pixel))throw std::length_error("Brush preview exceeds document pixel budget");
  absent.emplace();absent->width=width_;absent->height=height_;absent->pixels.resize(std::size_t(width_)*height_);}
 const auto resolved=slot?timeline_.resolveSurface(slot->id):decltype(timeline_.resolveSurface(std::string{})){};
 if(slot&&(resolved.issue!=timeline::LinkIssue::None||!resolved.source||!resolved.surface))throw std::logic_error("Invalid brush Cel owner");if(layer().kind=="tilemap"&&tileStrokeLinked_&&!raster::fullCanvas(*resolved.surface,width_,height_)){absent.emplace();absent->width=width_;absent->height=height_;absent->pixels=canvasPixels();}
 const auto& source=absent?*absent:*resolved.surface;raster::validate(source);
 std::optional<timeline::Surface> expansion;
 const bool covers=source.offsetX<=0&&source.offsetY<=0&&std::int64_t(source.offsetX)+source.width>=width_&&std::int64_t(source.offsetY)+source.height>=height_;
 if(!covers){constexpr std::size_t limit=256*1024*1024;std::size_t used=0;for(const auto& c:timeline_.state().cels)if(c.surface){const auto count=c.surface->pixels.size();if(count>(limit-used)/sizeof(Pixel))throw std::length_error("Brush expansion exceeds document pixel budget");used+=count*sizeof(Pixel);}expansion=raster::expanded(source,{0,0,width_,height_},limit-used);}
 const auto& prepared=expansion?*expansion:source;
 const PixelAddressSpace address{width_,height_,raster::coordinate(std::int64_t(prepared.storageOriginX.value_or(0))-prepared.offsetX),raster::coordinate(std::int64_t(prepared.storageOriginY.value_or(0))-prepared.offsetY)};
 // Allocate preparation before installing geometry; retain old storage for failure rollback.
 auto inherited=baseline?*baseline:std::unordered_map<std::size_t,Pixel>{};
 auto imageStamp=image?std::optional<ImageBrushStamp>{prepareImageBrushStamp(*image,brush.size,angle)}:std::nullopt;
 brush.size=std::clamp(brush.size,1,64);brush.opacity=std::clamp(brush.opacity,0,100);auto spans=brushSpans(brush);
 pendingLookup_.reset(width_,height_);
 if(absent)absentStrokeSurface_=std::move(absent);
 auto* owner=absentStrokeSurface_?&*absentStrokeSurface_:timeline_.mutableOwnedSurface(resolved.source->id);if(!owner)throw std::logic_error("Missing writable brush owner");
 if(expansion)std::swap(*owner,*expansion);
 strokePixels_=&static_cast<std::vector<Pixel>&>(owner->pixels);strokeCanvasStorage_=raster::fullCanvas(*owner,width_,height_);strokeStride_=owner->width;strokeOffsetX_=owner->offsetX;strokeOffsetY_=owner->offsetY;strokeAddress_=address;
 inheritedStrokeBaseline_=std::move(inherited);imageStamp_=std::move(imageStamp);imageEraseCoverage_.clear();inkStampCoverage_.clear();stampSpans_=std::move(spans);perfectPath_.clear();perfectTailPixels_.clear();perfectTailErase_.clear();perfectTailInk_.clear();perfectStable_=0;capturingPerfectTail_=false;active_=true;last_=p;color_=color;brush_=brush;hasPreviousStamp_=false;
 try{if(brush_.perfectPixels){perfectPath_.push_back({p.x,p.y,brush.size,brush.opacity});perfectPendingStart_=pending_.size();capturingPerfectTail_=true;}if(stampInitial)stamp(p.x,p.y);publishChange();}
 catch(...){for(const auto& delta:pending_)strokePixel(delta.index)=delta.before;clearPendingStroke();active_=false;strokePixels_=nullptr;if(expansion)std::swap(*owner,*expansion);absentStrokeSurface_.reset();change_={};throw;}
}catch(...){if(maskStroke_){if(active_)cancelStroke();else{rollbackMaskStroke();strokePixels_=nullptr;}}if(tileStrokeIncremental_)cancelTilemapStroke();throw;}
}
void Document::capturePerfectPixel(std::size_t i){if(!capturingPerfectTail_||perfectTailPixels_.count(i))return;const int found=pendingLookup_[i];perfectTailPixels_.emplace(i,PerfectTailPixel{strokePixel(i),found,found<0?Pixel{}:pending_[found].after});auto erase=imageEraseCoverage_.find(i);perfectTailErase_[i]=erase==imageEraseCoverage_.end()?std::nullopt:std::optional<int>{erase->second};}
void Document::capturePerfectInkCoverage(std::uint64_t key){if(!capturingPerfectTail_||perfectTailInk_.count(key))return;auto it=inkStampCoverage_.find(key);perfectTailInk_[key]=it==inkStampCoverage_.end()?std::nullopt:std::optional<int>{it->second};}
void Document::rollbackPerfectTail(){capturingPerfectTail_=false;for(const auto& [i,v]:perfectTailPixels_){strokePixel(i)=v.value;pendingLookup_.set(i,v.pending);if(v.pending>=0)pending_[v.pending].after=v.after;change_.include(int(i%width_),int(i/width_));}pending_.resize(perfectPendingStart_);for(const auto& [i,v]:perfectTailErase_){if(v)imageEraseCoverage_[i]=*v;else imageEraseCoverage_.erase(i);}for(const auto& [i,v]:perfectTailInk_){if(v)inkStampCoverage_[i]=*v;else inkStampCoverage_.erase(i);}perfectTailPixels_.clear();perfectTailErase_.clear();perfectTailInk_.clear();hasPreviousStamp_=false;}
bool Document::applySmoothBrush(const std::vector<std::size_t>& visited,int strength,std::optional<std::chrono::steady_clock::time_point> started){
 if(active()||!rasterToolsAvailable()||!layer().kind.empty()||!activeMaskId_.empty()||visited.empty())return false;
 for(auto key:visited)if(key>=std::size_t(width_)*height_)throw std::invalid_argument("Invalid smooth coverage");
 // Legacy smooth-brush reads a missing active display as transparent; with no
 // opaque neighbors the smoothing kernel cannot produce any changed pixel.
 const auto* slot=timeline_.findCel(layer().id,frame().id);if(!slot)return false;
 const auto resolved=timeline_.resolveSurface(slot->id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.surface)throw std::logic_error("Invalid smooth source");const auto& surface=*resolved.surface;raster::validate(surface);
 auto changed=smoothBrushPixels(width_,height_,visited,selection_,strength,[&](int x,int y){return raster::readWorld(surface,x,y);},[&](int x,int y){return x>=surface.offsetX&&y>=surface.offsetY&&std::int64_t(x)<std::int64_t(surface.offsetX)+surface.width&&std::int64_t(y)<std::int64_t(surface.offsetY)+surface.height;});
 for(auto it=changed.begin();it!=changed.end();){it->second=normalizeCanvasPacked(it->second);const int x=int(it->first%width_),y=int(it->first/width_);if((selection_&&!selectionContains(selection_,x,y))||raster::readWorld(surface,x,y)==it->second)it=changed.erase(it);else ++it;}
 if(changed.empty())return false;
 beginStroke({0,0},0,{},nullptr,0,nullptr,false);if(!active_)return false;if(started)projectStrokeStarted_=*started;
 try{pending_.reserve(changed.size());for(const auto& entry:changed){const auto index=entry.first;const auto before=strokePixel(index);if(before==entry.second)continue;pending_.push_back({index,before,entry.second});pendingLookup_.set(index,int(pending_.size()-1));strokePixel(index)=entry.second;change_.include(int(index%width_),int(index/width_));}HistoryLabelScope label(*this,U"平滑");return commitStroke();}catch(...){cancelStroke();throw;}
}
bool Document::plotStrokeColorReplacement(std::size_t index,int coverage){
 if(!strokeColorReplacement_)return false;
 // Legacy tools-brush paintBrush colorReplacement: compare all RGBA channels
 // with the gesture baseline and retain the greatest coverage, never repaint.
 coverage=std::clamp(coverage,0,255);if(!coverage)return true;
 const int found=pendingLookup_[index];const Pixel current=strokePixel(index);
 const auto inherited=inheritedStrokeBaseline_.find(index);const Pixel before=inherited!=inheritedStrokeBaseline_.end()?inherited->second:found<0?current:pending_[found].before;
 if(before!=strokeColorReplacement_->first)return true;
 const auto seen=imageEraseCoverage_.find(index);if(seen!=imageEraseCoverage_.end()&&seen->second>=coverage)return true;
 capturePerfectPixel(index);imageEraseCoverage_[index]=coverage;const Pixel target=strokeColorReplacement_->second;Pixel value=0;
 for(int shift=0;shift<32;shift+=8){const int a=(before>>shift)&255,b=(target>>shift)&255;value|=Pixel(std::floor(a+(b-a)*coverage/255.0+.5))<<shift;}
 value=normalizeCanvasPacked(value,bool(maskStroke_));if(value==current)return true;
 if(found<0){pending_.push_back({index,current,value});pendingLookup_.set(index,int(pending_.size()-1));}else pending_[found].after=value;
 strokePixel(index)=value;change_.include(int(index%width_),int(index/width_));return true;
}
void Document::plot(int x, int y) {
  if(x<0 || y<0 || x>=width_ || y>=height_ || (selection_ && !selectionContains(selection_,x,y))) return;
  const auto index=static_cast<std::size_t>(y)*width_+x;
  if(plotStrokeColorReplacement(index,int(std::floor(255*brush_.opacity/100.0+.5))))return;
  capturePerfectPixel(index);
  const auto current=strokePixel(index);
  if(pendingLookup_[index]>=0) return;
  const auto inherited=inheritedStrokeBaseline_.find(index);
  auto value=inkBrushComposite(inherited==inheritedStrokeBaseline_.end()?current:inherited->second,color_,brush_.opacity,brush_.ink);value=normalizeCanvasPacked(value,bool(maskStroke_));
  if(current==value) return;
  // legacy core/history.ts recordPixelKnownCurrent: record only touched pixels.
  pending_.push_back({index,current,value});
  pendingLookup_.set(index,int(pending_.size()-1));
  strokePixel(index)=value;change_.include(x,y);

}
std::vector<SymmetryPixel> Document::strokeSymmetryPoints(SymmetryPixel p)const{
 if(strokeRepeat_==repeat::Mode::Off)return symmetryPoints(p,width_,height_,symmetryAxes,symmetryCenter());
 auto points=symmetryPoints(p,width_,height_,symmetryAxes,symmetryCenter(),false);for(auto& point:points){const auto wrapped=repeat::wrap({double(point.x),double(point.y)},width_,height_,strokeRepeat_);point={int(wrapped.x),int(wrapped.y)};}points.erase(std::remove_if(points.begin(),points.end(),[&](auto q){return q.x<0||q.y<0||q.x>=width_||q.y>=height_;}),points.end());return points;
}
void Document::stamp(int x,int y) {
  if(strokeRepeat_!=repeat::Mode::Off){const auto local=repeat::wrap({double(x),double(y)},width_,height_,strokeRepeat_);x=int(local.x);y=int(local.y);hasPreviousStamp_=false;}

  if(imageStamp_){const auto& stamp=imagePattern_?imagePattern_->at(x,y,brush_.size,strokeImageAngle_):*imageStamp_;for(const auto& sample:stamp.samples)for(const auto& p:strokeSymmetryPoints({x-stamp.width/2+sample.x,y-stamp.height/2+sample.y})){
   if(selection_ && !selectionContains(selection_,p.x,p.y))continue;const auto index=std::size_t(p.y)*width_+p.x;if(plotStrokeColorReplacement(index,int(std::floor(sample.coverage*brush_.opacity/100.0+.5))))continue;capturePerfectPixel(index);auto current=strokePixel(index);const int found=pendingLookup_[index];const auto inherited=inheritedStrokeBaseline_.find(index);const auto before=inherited!=inheritedStrokeBaseline_.end()?inherited->second:found<0?current:pending_[found].before;Pixel value;
   if(brush_.ink!=InkMode::Simple){const auto source=sample.color.value_or(color_);const int coverage=brush_.ink==InkMode::CopyAlphaColor?sample.coverage:int(std::floor(sample.coverage*brush_.opacity/100.0+.5));if(!coverage)continue;const auto key=(std::uint64_t(index)<<32)|source;auto seen=inkStampCoverage_.find(key);if(seen!=inkStampCoverage_.end()&&seen->second>=coverage)continue;capturePerfectInkCoverage(key);inkStampCoverage_[key]=coverage;value=applyInkColor(brush_.ink,brush_.ink==InkMode::LockAlpha?before:current,resolveInkStampColor(brush_.ink,source,sample.coverage,brush_.opacity));}
   else if((color_>>24)==0){int coverage=int(std::floor(sample.coverage*brush_.opacity/100.0+.5));if(sample.color)coverage=int(std::floor(coverage*(*sample.color>>24)/255.0+.5));auto seen=imageEraseCoverage_.find(index);if(!coverage || (seen!=imageEraseCoverage_.end() && seen->second>=coverage))continue;imageEraseCoverage_[index]=coverage;value=coverage==255?0:(before&0xffffff)|(Pixel(std::floor((before>>24)*(1-coverage/255.0)+.5))<<24);}
   else if(!stamp.intrinsicSize){const auto source=sample.color.value_or(color_);const int coverage=int(std::floor(sample.coverage*brush_.opacity/100.0+.5));const auto key=(std::uint64_t(index)<<32)|source;auto seen=inkStampCoverage_.find(key);if(!coverage||(seen!=inkStampCoverage_.end()&&seen->second>=coverage))continue;capturePerfectInkCoverage(key);inkStampCoverage_[key]=coverage;value=inkBrushComposite(before,source,brush_.opacity,InkMode::Simple,sample.coverage);}
   else {if(int(std::floor(sample.coverage*brush_.opacity/100.0+.5))==0)continue;value=imageBrushDirectPixel(sample.color.value_or(color_),sample.coverage,brush_.opacity);}
   value=normalizeCanvasPacked(value,bool(maskStroke_));if(current==value)continue;if(found<0){pending_.push_back({index,current,value});pendingLookup_.set(index,int(pending_.size()-1));}else pending_[found].after=value;strokePixel(index)=value;change_.include(p.x,p.y);
  }return;}
  const auto anchor=brush_.size/2;
  for(const auto& span:stampSpans_) {
    const auto sourceY=std::int64_t(y)-anchor+span.y;
    if(!repeat::includesY(strokeRepeat_)&&(sourceY<0 || sourceY>=height_)) continue;
    const auto py=std::int64_t(y)-anchor+span.y;if(!repeat::includesY(strokeRepeat_)&&(py<0 || py>=height_)) continue;
    const auto left=repeat::includesX(strokeRepeat_)?std::int64_t(x)-anchor+span.left:std::max<std::int64_t>(0,std::int64_t(x)-anchor+span.left);
    const auto right=repeat::includesX(strokeRepeat_)?std::int64_t(x)-anchor+span.right:std::min<std::int64_t>(width_-1,std::int64_t(x)-anchor+span.right);
    // legacy solidBrushPreviewRowSpans: subtract the preceding stamp's row.
    // The incremental edit remains the coverage record for all earlier stamps.
    std::int64_t previousLeft=right+1,previousRight=right;
    if(hasPreviousStamp_) {
      const auto row=py-previousStamp_.y+anchor;
      const BrushSpan* previous=nullptr;
      if(brush_.shape==BrushShape::Line) {if(row==anchor) previous=&stampSpans_.front();}
      else if(row>=0 && row<std::int64_t(stampSpans_.size())) previous=&stampSpans_[std::size_t(row)];
      if(previous) {previousLeft=std::int64_t(previousStamp_.x)-anchor+previous->left;previousRight=std::int64_t(previousStamp_.x)-anchor+previous->right;}
    }
    for(auto px=left;px<=std::min(right,previousLeft-1);++px){if(!brushDitherContains(brush_,int(px),int(py)))continue;for(auto q:strokeSymmetryPoints({int(px),int(py)}))plot(q.x,q.y);}
    for(auto px=std::max(left,previousRight+1);px<=right;++px){if(!brushDitherContains(brush_,int(px),int(py)))continue;for(auto q:strokeSymmetryPoints({int(px),int(py)}))plot(q.x,q.y);}
  }
  previousStamp_={x,y};hasPreviousStamp_=true;
}
void Document::line(Point a, Point b) {
  visitBrushLine(a.x,a.y,b.x,b.y,imageStamp_?std::max(imageStamp_->width,imageStamp_->height):brush_.size,bool(imageStamp_),brush_.shape==BrushShape::Line,width_,height_,[&](int x,int y){stamp(x,y);},strokeRepeat_!=repeat::Mode::Off);
}
std::unordered_map<std::size_t,Pixel> Document::brushPreview(Point from,Point to,Pixel color,BrushOptions brush,const PatternBrush* image,double angle,const std::unordered_map<std::size_t,Pixel>* baseline,bool clipSelection,repeat::Mode repeatMode,bool balanced) const {
  std::unordered_map<std::size_t,Pixel> result;std::unordered_map<std::size_t,int> eraseCoverage;std::unordered_map<std::uint64_t,int> inkCoverage;
  brush.size=std::clamp(brush.size,1,64);brush.opacity=std::clamp(brush.opacity,0,100);
  const auto spans=brushSpans(brush);const auto imageStamp=image?std::optional<ImageBrushStamp>{prepareImageBrushStamp(*image,brush.size,angle)}:std::nullopt;
  std::optional<ImageBrushPatternSampler> imagePattern;if(image&&image->intrinsicSize&&brush.imagePaintMode!=PatternPaintMode::Paint)imagePattern.emplace(*image,brush.imagePaintMode,from.x,from.y);
  const auto* mask=activeMask();const auto* previewSurface=mask?&mask->surface:activeSurfaceIfPresent();const bool direct=previewSurface&&raster::fullCanvas(*previewSurface,width_,height_);
  auto plot=[&](int x,int y,int coverage,std::optional<Pixel> sample){
    const auto local=repeat::wrap({double(x),double(y)},width_,height_,repeatMode);x=int(local.x);y=int(local.y);
    if(x<0 || y<0 || x>=width_ || y>=height_ || (clipSelection && selection_ && !selectionContains(selection_,x,y)))return;
    const auto i=std::size_t(y)*width_+x;Pixel base=previewSurface?(direct?previewSurface->pixels[i]:raster::readWorld(*previewSurface,x,y)):Pixel{};if(baseline){auto it=baseline->find(i);if(it!=baseline->end())base=it->second;}
    if(!imageStamp){if(!result.count(i))result.emplace(i,normalizeCanvasPacked(inkBrushComposite(base,color,brush.opacity,brush.ink),bool(mask)));return;}
    if(brush.ink!=InkMode::Simple){const auto source=sample.value_or(color);const int c=brush.ink==InkMode::CopyAlphaColor?coverage:int(std::floor(coverage*brush.opacity/100.0+.5));if(!c)return;const auto key=(std::uint64_t(i)<<32)|source;if(inkCoverage[key]>=c)return;inkCoverage[key]=c;const auto destination=brush.ink==InkMode::LockAlpha?base:result.count(i)?result.at(i):base;const auto value=applyInkColor(brush.ink,destination,resolveInkStampColor(brush.ink,source,coverage,brush.opacity));result[i]=normalizeCanvasPacked(value,bool(mask));return;}
    if(!(color>>24)){int c=int(std::floor(coverage*brush.opacity/100.0+.5));if(sample)c=int(std::floor(c*(*sample>>24)/255.0+.5));if(c<=eraseCoverage[i])return;eraseCoverage[i]=c;result[i]=c==255?0:(base&0xffffff)|(Pixel(std::floor((base>>24)*(1-c/255.0)+.5))<<24);}
    else if(int(std::floor(coverage*brush.opacity/100.0+.5)))result[i]=imageStamp->intrinsicSize&&!imagePattern?imageBrushDirectPixel(sample.value_or(color),coverage,brush.opacity):inkBrushComposite(base,sample.value_or(color),brush.opacity,InkMode::Simple,coverage);
    if(result.count(i))result[i]=normalizeCanvasPacked(result.at(i),bool(mask));
  };
  auto stamp=[&](int x,int y){const auto local=repeat::wrap({double(x),double(y)},width_,height_,repeatMode);x=int(local.x);y=int(local.y);
    if(imageStamp){const auto& active=imagePattern?imagePattern->at(x,y,brush.size,angle):*imageStamp;for(const auto& sample:active.samples)for(auto p:symmetryPoints({x-active.width/2+sample.x,y-active.height/2+sample.y},width_,height_,symmetryAxes,symmetryCenter(),repeatMode==repeat::Mode::Off))plot(p.x,p.y,sample.coverage,sample.color);}
    else for(auto row:spans){const int sy=y-brush.size/2+row.y;if(!repeat::includesY(repeatMode)&&(sy<0||sy>=height_))continue;for(int sx=x-brush.size/2+row.left;sx<=x-brush.size/2+row.right;++sx){if((!repeat::includesX(repeatMode)&&(sx<0||sx>=width_))||!brushDitherContains(brush,int(repeat::wrap({double(sx),double(sy)},width_,height_,repeatMode).x),int(repeat::wrap({double(sx),double(sy)},width_,height_,repeatMode).y)))continue;for(auto q:symmetryPoints({sx,sy},width_,height_,symmetryAxes,symmetryCenter(),repeatMode==repeat::Mode::Off))plot(q.x,q.y,255,{});}}
  };
  if(balanced){const auto points=selectionLine({from.x,from.y},{to.x,to.y},true);const int reach=imageStamp?std::max(imageStamp->width,imageStamp->height):brush.size,spacing=brush.shape==BrushShape::Line?1:std::max(1,reach/16);for(std::size_t i=0;i<points.size();++i)if(!i||i+1==points.size()||i%spacing==0)stamp(points[i].x,points[i].y);}
  else visitBrushLine(from.x,from.y,to.x,to.y,imageStamp?std::max(imageStamp->width,imageStamp->height):brush.size,bool(imageStamp),brush.shape==BrushShape::Line,width_,height_,stamp,repeatMode!=repeat::Mode::Off);
  return result;
}
bool Document::updateGeometricBrushPreview(const std::vector<SelectionPoint>& points,Pixel color,BrushOptions brush,const PatternBrush* image,double angle){
 if(!shapeActive())return false;const auto& initial=*gradient_;
 if(initial.contentRevision!=contentRevision_||initial.layerId!=layer().id||initial.frameId!=frame().id||!selectionEqual(initial.selection,selection_)){cancelGradient();return false;}
 // Reuse native isolated timeline previews and the actual brush stamp/authority
 // transaction. Never run a pending stroke against the live document.
 std::size_t bytes=0;for(const auto& cel:timeline_.state().cels)if(cel.surface)bytes+=cel.surface->pixels.size()*sizeof(Pixel);for(const auto& mask:timeline_.state().masks)bytes+=mask.mask.surface.pixels.size()*sizeof(Pixel);for(const auto& set:timeline_.state().tilesets)bytes+=set.pixels.size()*sizeof(Pixel);
 if(bytes>64*1024*1024||std::uint64_t(width_)*height_*24>256*1024*1024-bytes*2)throw std::length_error("Curve preview exceeds document pixel budget");
 auto draft=std::make_unique<Document>(width_,height_);draft->pixelFormat_=pixelFormat_;draft->timeline_=timeline_;draft->activeLayerId_=activeLayerId_;draft->activeFrameId_=activeFrameId_;draft->setSelectionValue(selection_);draft->activeMaskId_=activeMaskId_;draft->symmetryAxes=symmetryAxes;draft->symmetryCenter_=symmetryCenter_;draft->tileSelection_=tileSelection_;draft->freeInstanceSelected_=freeInstanceSelected_;draft->freeInstancePrimary_=freeInstancePrimary_;draft->freeInstanceSelectionFrame_=freeInstanceSelectionFrame_;
 const bool changed=draft->paintGeometricBrushPath(points,color,brush,image,angle,initial.sourceShapeSeed);
 auto& g=*gradient_;g.preview=draft->canvasPixels();g.region=layer().kind=="free-tile"&&!changed?std::optional<SelectionMask>{}:std::optional<SelectionMask>{SelectionMask{0,0,width_,height_,{}}};
 if(g.mask){const auto* mask=draft->mutableActiveMask();if(!mask)throw std::logic_error("Missing curve mask preview");g.mask->display=*mask;}
 else {g.tilemapDisplay=std::move(draft->timeline_);g.tilemapRegions={{0,0,width_,height_}};}
 ++gradientRevision_;return true;
}
void Document::sprayStroke(const std::vector<SelectionPoint>& particles,BrushOptions brush,int angle){
 if(auto edit=freeTileSourceStrokeDocument()){
  if(particles.empty())return;
  try{
   const auto footprint=selectionBrushFootprint(brush,angle);
   for(const auto& p:particles){freeTileSourceStrokePoint({p.x-footprint.width/2,p.y-footprint.height/2});freeTileSourceStrokePoint({p.x-footprint.width/2+footprint.width-1,p.y-footprint.height/2+footprint.height-1});}
   std::vector<SelectionPoint> local;local.reserve(particles.size());for(const auto& p:particles){const auto q=freeTileSourceStrokePoint({p.x,p.y});local.push_back({q.x,q.y});}
   const auto revision=edit->contentRevision();edit->sprayStroke(local,brush,angle);
   // Legacy useCanvasStrokeClock skips source copying for unchanged batches.
   if(edit->contentRevision()!=revision)publishFreeTileSourceStroke();
  }catch(...){cancelFreeTileSourceStroke();throw;}
  return;
 }
 if(!active_)return;change_={};const auto footprint=selectionBrushFootprint(brush,angle);const auto saved=brush_;brush_=brush;brush_.opacity=100;brush_.ink=InkMode::Simple;brush_.dither=false;brush_.perfectPixels=false;
 try{for(auto particle:particles)for(auto row:footprint.spans)for(int x=particle.x-footprint.width/2+row.left;x<=particle.x-footprint.width/2+row.right;++x)for(auto q:strokeSymmetryPoints({x,particle.y-footprint.height/2+row.y}))plot(q.x,q.y);brush_=saved;publishChange();}catch(...){brush_=saved;cancelStroke();throw;}
}
void Document::updateStroke(Point point) {
 if(auto edit=freeTileSourceStrokeDocument()){try{edit->updateStroke(freeTileSourceStrokePoint(point,true));publishFreeTileSourceStroke();}catch(...){cancelFreeTileSourceStroke();throw;}return;}
  if((tileStrokeIncremental_||tileStrokeBefore_)&&tileSelection_.mode==tiles::Mode::Paint){try{paintTilemapLine(point);last_=point;}catch(...){if(tileStrokeIncremental_)cancelTilemapStroke();throw;}return;}
  if (!active_) return;
  change_={};
  if(point.x==last_.x && point.y==last_.y)return;
  try{
    if(brush_.perfectPixels){
      rollbackPerfectTail();
      if(perfectPath_.empty())perfectPath_.push_back({last_.x,last_.y,brush_.size,brush_.opacity});
      appendPerfectPixelSegment(perfectPath_,{point.x,point.y,brush_.size,brush_.opacity});
      const auto end=perfectPath_.size()>2?perfectPath_.size()-2:0;
      for(auto i=perfectStable_;i<end;++i)stamp(perfectPath_[i].x,perfectPath_[i].y);
      perfectStable_=end;perfectPendingStart_=pending_.size();capturingPerfectTail_=true;hasPreviousStamp_=false;
      for(auto i=end;i<perfectPath_.size();++i)stamp(perfectPath_[i].x,perfectPath_[i].y);
    } else line(last_, point);
  }catch(...){if(tileStrokeIncremental_)cancelTilemapStroke();throw;}
  publishChange();
  last_ = point;
}
void Document::mergeLastStrokeEdits(){if(history_.position()>=2 && history_.position()==history_.size())groupEdits(history_.position()-2,selectedFrames_);}
std::unordered_map<std::size_t,Pixel> Document::strokeBaseline() const {auto result=inheritedStrokeBaseline_;for(const auto& delta:pending_)result.emplace(delta.index,delta.before);return result;}
std::vector<std::pair<std::size_t,Pixel>> Document::strokeBaselinePoints() const {
  std::vector<std::pair<std::size_t,Pixel>> result;result.reserve(inheritedStrokeBaseline_.size()+pending_.size());
  for(const auto& item:inheritedStrokeBaseline_)result.push_back(item);
  for(const auto& delta:pending_)if(!inheritedStrokeBaseline_.count(delta.index))result.emplace_back(delta.index,delta.before);
  return result;
}
bool Document::commitStroke() {
 if(freeSourceStroke_)return commitFreeTileSourceStroke();
 if(liquifyStroke_)return commitLiquify();
  if(tileStrokeIncremental_||tileStrokeBefore_)return commitTilemapStroke();
  if (!active_) return false;
  if(maskStroke_)return commitMaskStroke();
  Edit edit{{}, state_, nextState_};
  edit.contentHistory.pixelAddress=strokeAddress_;
  edit.pixels.reserve(pending_.size());
  for(const auto& delta:pending_) if(delta.before!=delta.after) edit.pixels.push_back(delta);
  if(edit.pixels.empty()) {active_=false;strokePixels_=nullptr;absentStrokeSurface_.reset();clearPendingStroke();return false;}
  // Keep only storage bindings for rollback. Linked-layer synchronization can
  // replace geometry/bindings, but does not mutate their pixel payloads.
  struct Binding {std::size_t index;timeline::Surface surface;};
  std::vector<Binding> bindings;
  std::optional<std::pair<std::string,std::string>> insertedSlot;
  std::string insertedId,oldDirtyOwner;
  bool inserted=false;
  auto borrow=[](const timeline::Surface& source){timeline::Surface out;out.width=source.width;out.height=source.height;out.offsetX=source.offsetX;out.offsetY=source.offsetY;out.storageOriginX=source.storageOriginX;out.storageOriginY=source.storageOriginY;out.pixels.share(source.pixels);return out;};
  auto invalidate=[&]{timeline_.resolved_.clear();timeline_.selectionContent_.clear();timeline_.visibleContent_.clear();timeline_.thumbnailStorage_.clear();timeline_.invalidateCompositeOrder();};
  auto rollback=[&]{
    if(!inserted)return;
    for(auto& binding:bindings)*timeline_.state_.cels[binding.index].surface=std::move(binding.surface);
    timeline_.cels_.erase(insertedId);timeline_.slots_.erase(*insertedSlot);timeline_.state_.cels.pop_back();timeline_.linkedDirtyOwner_=std::move(oldDirtyOwner);invalidate();
  };
  const auto beforeRevision=revision_;
  auto finish=[&]{active_=false;strokePixels_=nullptr;absentStrokeSurface_.reset();clearPendingStroke();};
  try{
    if(absentStrokeSurface_){
      timeline::Cel created;created.id="cel-"+layer().id+"-"+frame().id;
      for(std::size_t suffix=1;timeline_.findCelById(created.id);++suffix)created.id="cel-"+layer().id+"-"+frame().id+"-"+std::to_string(suffix);
      created.layerId=layer().id;created.frameId=frame().id;created.opacity=layer().opacity;created.surface=borrow(*absentStrokeSurface_);
      insertedId=created.id;insertedSlot.emplace(created.layerId,created.frameId);edit.contentHistory.targetCelId=insertedId;oldDirtyOwner=timeline_.linkedDirtyOwner_;
      if(timeline_.hasLinkedLayers()){
        bindings.reserve(timeline_.state().cels.size());
        for(std::size_t i=0;i<timeline_.state().cels.size();++i)if(timeline_.state().cels[i].surface)bindings.push_back({i,borrow(*timeline_.state().cels[i].surface)});
      }
      reserveHistoryEntries();timeline_.addCel(std::move(created));inserted=true;
      // Legacy syncActiveAnimationLayer prefers the newly committed active cel.
      timeline_.synchronizeLinkedLayers(insertedId);invalidate();
    }else edit.contentHistory.targetCelId=cel().id;
    pushEdit(std::move(edit),U"绘制");
  }catch(...){
    if(revision_==beforeRevision)rollback();
    else{finish();if(inserted)publishChange();}
    throw;
  }
  projectInformation_.drawing(std::max<std::int64_t>(1,std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-projectStrokeStarted_).count()));
  finish();
  if(inserted)publishChange();
  return true;
}
void Document::cancelStroke() {
  if(freeSourceProperties_){cancelFreeTileSourceProperties();return;}
  if(freeSourceStroke_){cancelFreeTileSourceStroke();return;}
  if(freeTilePlacement_){cancelFreeTilePlacement();return;}
  if(liquifyStroke_){cancelLiquify();return;}
  if(tileStrokeIncremental_||tileStrokeBefore_){cancelTilemapStroke();return;}
  cancelTextDraft();
  cancelPaletteReplacement();cancelColorAdjustment();cancelGradient();
  if (!active_) return;
  change_={};
  for(const auto& delta:pending_) {
    const auto index=delta.index;
    if(strokePixel(index)!=delta.before) {strokePixel(index)=delta.before;change_.include(int(index%width_),int(index/width_));}
  }
  rollbackMaskStroke();publishChange();clearPendingStroke();
  active_ = false;strokePixels_=nullptr;absentStrokeSurface_.reset();
}
Document Document::fromClipboardRaster(const SelectionClipboard& source) {
  // Legacy pasteAsNewDocument creates RGBA with the default two-color palette.
  validateImportedImageDimensions(source.width,source.height);
  const auto count=std::size_t(source.width)*source.height;
  if(source.pixels.size()!=count || (!source.mask.empty() && source.mask.size()!=count))
    throw std::invalid_argument("剪贴板像素或蒙版长度无效");
  Document result(source.width,source.height);
  auto* surface=result.timeline_.mutableOwnedSurface(result.cel().id);
  for(std::size_t index=0;index<count;++index)
    if(source.mask.empty() || source.mask[index]==1)surface->pixels[index]=source.pixels[index];
  result.name_=U"粘贴的图像";result.modified_=true;
  return result;
}
Document Document::fromImage(int width,int height,std::vector<Pixel> pixels,std::u32string name){if(width<1||height<1||width>32768||height>32768||std::uint64_t(width)*height>64ull*1024*1024||pixels.size()!=std::size_t(width)*height)throw std::invalid_argument("Image exceeds native coordinate or 256 MiB pixel budget");Document d(width,height);d.timeline_.mutableOwnedSurface(d.cel().id)->pixels=std::move(pixels);// legacy imported-palette.ts: sparse rare colors must survive large low-color images.
std::unordered_set<Pixel> exact;for(const auto color:d.pixels())if(color>>24){exact.insert(color);if(exact.size()>4096)break;}
auto colors=extractImportedPalette({d.pixels()},256,exact.size()<=4096?d.pixels().size():262144);d.palette_.entries.clear();d.palette_.slots.clear();int id=1;for(auto c:colors){{auto text=std::to_string(id);d.palette_.entries.push_back({id,std::u32string(text.begin(),text.end()),c});}d.palette_.slots.push_back(id++);}d.palette_.slots.resize((d.palette_.slots.size()+7)/8*8);d.palette_.nextId=id;d.name_=std::move(name);d.markSaved();return d;}
bool Document::importSpriteSheet(const SheetImportOptions& options,std::optional<TransformPoint> pivot){
 if(pivot&&(!std::isfinite(pivot->x)||!std::isfinite(pivot->y)))throw std::invalid_argument("Invalid sprite sheet selection pivot");commitFloatingPaste();cancelStroke();
 validateSpriteSheetImportAllocation(*this,options);auto next=buildSpriteSheetImport(*this,options);
 return SheetImportTask::install(*this,options,timeline_.state(),std::move(next),pivot);
}
bool Document::resizeImage(int width,int height,ImageInterpolation method){
 validateImportedImageDimensions(width,height);
 if(width==width_&&height==height_)return false;
 cancelStroke();cancelLayerOpacity();if(active())throw std::runtime_error("Finish the active edit before resizing the image");
 if(hasTilemapContent()||hasFreeTileContent())return resizeResourceImage(width,height,method);
 std::size_t remaining=adjustmentByteLimit;auto reserve=[&](std::uint64_t bytes){if(bytes>remaining)throw std::length_error("Image resize exceeds working pixel budget");remaining-=std::size_t(bytes);};
 for(const auto& c:timeline_.state().cels)if(c.surface){const auto p=planImageResizeSurface(*c.surface,width_,height_,width,height);reserve(3ull*c.surface->pixels.size()*sizeof(Pixel)+2ull*p.bytes);}
 if(selection_)reserve(3ull*(selection_->mask.size()+std::uint64_t(width)*height));
 auto masks=resizedImageMasks(timeline_.state(),width_,height_,width,height,method,remaining);
 Edit e{{},state_,nextState_};e.snapshotHistory.beforeDimensions={{width_,height_}};e.snapshotHistory.afterDimensions={{width,height}};e.contentHistory.beforeCels=timeline_.state().cels;e.contentHistory.afterCels=e.contentHistory.beforeCels;
 for(auto& c:e.contentHistory.afterCels)if(c.surface)c.surface=imageResizedSurface(*c.surface,planImageResizeSurface(*c.surface,width_,height_,width,height),method);
 if(!masks.empty()){e.maskHistory.beforeMasks=timeline_.state().masks;e.maskHistory.afterMasks=std::move(masks);}
 e.pixelSelectionHistory.pixelSelectionEdit=true;e.pixelSelectionHistory.beforePixelsSelection=selection_;e.pixelSelectionHistory.afterPixelsSelection=resizeImageSelection(selection_,width_,height_,width,height);
 reserveHistoryEntries();applyEdit(e,true);publishChange();pushEdit(std::move(e),U"图像大小");return true;
}
std::optional<PixelRegion> Document::visibleContentBounds(bool allFrames) const {
 // Legacy bounds inspect the final composite, including disabled frames. Tile
 // rows bound temporary storage and reuse the admitted normal compositor.
 PixelRegion bounds;
 for(const auto& f:timeline_.state().frames){
  if(!allFrames && f.id!=activeFrameId_)continue;
  for(int y=0;y<height_;y+=16){const int rows=std::min(16,height_-y);auto pixels=compositeNormalRegion(timeline_,f.id,{0,y,width_,rows});
   for(int row=0;row<rows;++row)for(int x=0;x<width_;++x)if(pixels[std::size_t(row)*width_+x]>>24)bounds.include(x,y+row);
  }
 }
 return bounds.empty()?std::optional<PixelRegion>{}:std::optional<PixelRegion>{bounds};
}
bool Document::trimCanvas(bool allFrames,std::optional<TransformPoint> pivot){
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();
 const auto bounds=visibleContentBounds(allFrames);if(!bounds)throw std::runtime_error("画布中没有可见内容");
 if(bounds->x==0 && bounds->y==0 && bounds->w==width_ && bounds->h==height_)return false;
 return cropCanvasRegion(*bounds,pivot);
}
bool Document::cropCanvas(std::optional<TransformPoint> pivot){
 // Legacy crop uses the selection rectangle (not its nonzero mask bounds),
 // commits floating content first, and records even a full-canvas crop.
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();
 if(!selection_)throw std::runtime_error("请先选择要裁切的区域");
 const auto bounds=rectangleSelection(selection_->x,selection_->y,selection_->width,selection_->height,width_,height_);
 if(!bounds)throw std::runtime_error("请先选择要裁切的区域");
 return cropCanvasRegion({bounds->x,bounds->y,bounds->width,bounds->height},pivot);
}
bool Document::resizeCanvas(int width,int height,CanvasAnchor anchor,std::optional<int> offsetX,std::optional<int> offsetY,bool trimOutside,std::optional<TransformPoint> pivot){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);
 validateImportedImageDimensions(width,height);
 const auto shift=canvasResizeOffset(width_,height_,width,height,anchor,offsetX,offsetY);if(pivot&&(!std::isfinite(pivot->x)||!std::isfinite(pivot->y)))throw std::invalid_argument("Invalid canvas selection pivot");
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();if(active())throw std::runtime_error("Finish the active edit before resizing the canvas");
 if(hasTilemapContent()||hasFreeTileContent()||std::any_of(timeline_.state().layers.begin(),timeline_.state().layers.end(),[](const auto& l){return l.background.has_value();}))return resizeBackgroundCanvas(width,height,shift.x,shift.y,trimOutside,pivot);
 struct Plan{std::string owner;const timeline::Surface* source;CanvasResizeSurfacePlan geometry;};std::vector<Plan> plans;plans.reserve(timeline_.state().cels.size());
 std::size_t used=adjustmentStorageBudget(timeline_,1);auto reserveBytes=[&](std::uint64_t bytes){if(bytes>adjustmentByteLimit-used)throw std::length_error("Canvas resize exceeds working pixel budget");used+=std::size_t(bytes);};
 if(selection_){if(selection_->mask.size()>adjustmentByteLimit/3)throw std::length_error("Canvas selection exceeds working budget");reserveBytes(3ull*(selection_->mask.size()+std::uint64_t(width)*height)+128);}
 std::size_t clipped=0;
 for(const auto& c:timeline_.state().cels){const auto r=timeline_.resolveSurface(c.id);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface)throw std::invalid_argument("Invalid canvas resize owner");if(r.source->id!=c.id)continue;const auto p=planCanvasResizeSurface(*r.surface,width,height,shift.x,shift.y,trimOutside);if(p.clipped){reserveBytes(std::uint64_t(r.surface->pixels.size())*sizeof(Pixel)+2ull*p.bytes);++clipped;}plans.push_back({c.id,r.surface,p});}
 auto maskBudget=adjustmentByteLimit-used;auto masks=resizedCanvasMasks(timeline_.state(),width,height,shift.x,shift.y,trimOutside,maskBudget);
 Edit edit{{},state_,nextState_};edit.snapshotHistory.beforeDimensions={{width_,height_}};edit.snapshotHistory.afterDimensions={{width,height}};edit.pixelSelectionHistory.pixelSelectionEdit=true;edit.pixelSelectionHistory.beforePixelsSelection=selection_;edit.contentHistory.surfaceChanges.reserve(clipped);edit.contentHistory.ownerOffsets.reserve(plans.size());
 if(!masks.empty()){edit.maskHistory.beforeMasks=timeline_.state().masks;edit.maskHistory.afterMasks=std::move(masks);}
 std::vector<timeline::Surface> install;install.reserve(clipped);std::vector<timeline::Surface*> installOwners,offsetOwners;installOwners.reserve(clipped);offsetOwners.reserve(plans.size());
 for(const auto& p:plans){const auto& s=*p.source;if(p.geometry.clipped){std::size_t available=p.geometry.bytes;auto after=canvasResizeCroppedSurface(s,p.geometry,available);edit.contentHistory.surfaceChanges.push_back({p.owner,s,std::move(after)});install.push_back(edit.contentHistory.surfaceChanges.back().after);}else if(s.offsetX!=p.geometry.offsetX||s.offsetY!=p.geometry.offsetY){edit.contentHistory.ownerOffsets.push_back({p.owner,s.offsetX,s.offsetY,p.geometry.offsetX,p.geometry.offsetY});}}
 if(selection_){SelectionMask shifted{0,0,width,height,{}};shifted.mask.resize(std::size_t(width)*height);for(int y=0;y<height;++y)for(int x=0;x<width;++x){const auto sx=std::int64_t(x)-shift.x,sy=std::int64_t(y)-shift.y;const bool inside=sx>=std::numeric_limits<int>::min()&&sx<=std::numeric_limits<int>::max()&&sy>=std::numeric_limits<int>::min()&&sy<=std::numeric_limits<int>::max();shifted.mask[std::size_t(y)*width+x]=inside&&selectionContains(selection_,int(sx),int(sy))?1:0;}edit.pixelSelectionHistory.afterPixelsSelection=trimSelection(std::move(shifted));}
 edit.pixelSelectionHistory.beforeTrimPivot.emplace(pivot);if(!edit.pixelSelectionHistory.afterPixelsSelection)pivot.reset();else if(pivot){pivot->x+=shift.x;pivot->y+=shift.y;}edit.pixelSelectionHistory.afterTrimPivot.emplace(pivot);
 auto selectionAfter=edit.pixelSelectionHistory.afterPixelsSelection;reserveHistoryEntries();
 for(const auto& c:edit.contentHistory.surfaceChanges){auto* owner=timeline_.mutableOwnedSurface(c.ownerId);if(!owner)throw std::logic_error("Missing canvas resize owner");installOwners.push_back(owner);}for(const auto& c:edit.contentHistory.ownerOffsets){auto* owner=timeline_.mutableOwnedSurface(c.ownerId);if(!owner)throw std::logic_error("Missing canvas offset owner");offsetOwners.push_back(owner);}
 for(std::size_t i=0;i<install.size();++i)std::swap(*installOwners[i],install[i]);for(std::size_t i=0;i<offsetOwners.size();++i){offsetOwners[i]->offsetX=edit.contentHistory.ownerOffsets[i].afterX;offsetOwners[i]->offsetY=edit.contentHistory.ownerOffsets[i].afterY;}
 if(edit.maskHistory.afterMasks)timeline_.state_.masks=*edit.maskHistory.afterMasks;
 width_=width;height_=height;setSelectionValue(std::move(selectionAfter));selectionPivotHistory_.pivot=pivot;++selectionPivotHistory_.serial;change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"画布大小");return true;
}
bool Document::cropCanvasRegion(PixelRegion region,std::optional<TransformPoint> pivot){return resizeCanvas(region.w,region.h,CanvasAnchor::NorthWest,-region.x,-region.y,true,pivot);}
HistoryPanelTimeline Document::historyTimeline()const{HistoryPanelTimeline out;out.position=history_.position();out.revision=historyRevision_;out.entries.reserve(history_.size());for(std::size_t i=0;i<history_.size();++i)out.entries.push_back({i+1,history_.at(i).label});return out;}
bool Document::setHistoryPosition(std::size_t target){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);if(active_)return false;target=std::min(target,history_.size());const auto steps=(history_.position()>target?history_.position()-target:target-history_.position())+16;for(std::size_t i=0;i<steps&&history_.position()!=target;++i){const auto before=history_.position();if(history_.position()>target)undo();else redo();if(history_.position()==before&&((history_.position()>target&&!canUndo())||(history_.position()<target&&!canRedo())))break;}return history_.position()==target;}
void Document::undo() {auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);
  cancelGradient();
  if(floating_){if(floating_->restoredFromDeselect)commitFloatingPaste();else{cancelFloatingPaste();return;}}cancelStroke();
  if (!canUndo()) return;
  const auto& edit=history_.at(history_.position()-1);
  std::optional<FloatingPaste> restored;if(edit.contentHistory.restoredClipboard)restored=*edit.contentHistory.restoredClipboard;
  history_.undo([&](const Edit& entry){replayHistoryWithDamage(change_,width_,height_,[&]{applyEdit(entry,false);});},[&](const Edit& entry){
    ++historyRevision_;if(restored)floating_=std::move(restored);publishChange(bool(entry.snapshotHistory.beforeRollback)||entry.localSnapshot()!=nullptr);
  });
  state_ = edit.beforeState;if(edit.documentChanged){modified_=true;projectInformation_.operation();}++revision_;notifyHistoryChange(HistoryStackChange::Kind::Undo,edit.label);if(edit.documentChanged)notifyRecording(true);
}
void Document::redo() {auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);
  cancelGradient();
  commitFloatingPaste();cancelStroke();
  if (!canRedo()) return;
  const auto& edit=history_.at(history_.position());
  history_.redo([&](const Edit& entry){replayHistoryWithDamage(change_,width_,height_,[&]{applyEdit(entry,true);});},[&](const Edit& entry){
    ++historyRevision_;publishChange(bool(entry.snapshotHistory.beforeRollback)||entry.localSnapshot()!=nullptr);
  });
  state_ = edit.afterState;if(edit.documentChanged){modified_=true;projectInformation_.operation();}++revision_;notifyHistoryChange(HistoryStackChange::Kind::Redo,edit.label);if(edit.documentChanged)notifyRecording(true);
}
// capturePaletteEdit: definition in its history domain unit.

// Legacy HistoryStack.setMaxEntries: discard oldest undo entries first,
// then farthest redo entries. Never change document pixels, dirty or revision.
void Document::notifyHistoryChange(HistoryStackChange::Kind kind,const std::u32string& label,std::size_t discardedUndo,std::size_t discardedRedo){
 animationChangeBinding_.publish(*this,{AnimationChange::Kind::HistoryChanged,AnimationFrameOrigin::Manual,kind});
 if(historyChangeBinding_.observer)historyChangeBinding_.publish(*this,{kind,label,discardedUndo,discardedRedo,historyRevision_});
}
void Document::clearHistory(){
 history_.clear();groupingHistory_=false;pendingGroupedProjectOperation_=false;++historyRevision_;
 notifyHistoryChange(HistoryStackChange::Kind::Clear);
}
void Document::setHistoryEntryLimit(std::size_t limit) {
 const auto discarded=history_.setLimit(limit);
 if(discarded.undo||discarded.redo){++historyRevision_;notifyHistoryChange(HistoryStackChange::Kind::Trim,{},discarded.undo,discarded.redo);}
}
void Document::reserveHistoryEntries(std::size_t additional){history_.reserve(additional);}
void Document::pushEdit(Edit edit,std::u32string label) {
 if(edit.maskHistory.beforeMasks){auto& masks=timeline_.state_.masks;std::set<std::string> wanted;for(const auto& m:masks){bool owner=m.group?std::any_of(timeline_.state().groups.begin(),timeline_.state().groups.end(),[&](const auto& g){return g.id==m.ownerId;}):timeline_.hasLayer(m.ownerId);if(owner&&timeline_.hasFrame(m.frameId))wanted.insert(m.mask.id);}for(auto& m:masks)if(wanted.count(m.mask.id)&&!m.mask.linkedMaskId.empty()&&!wanted.count(m.mask.linkedMaskId)){const auto* root=timeline::resolvedMask(timeline_.state(),m.ownerId,m.frameId);m.mask.surface=root->surface;m.mask.linkedMaskId.clear();}masks.erase(std::remove_if(masks.begin(),masks.end(),[&](const auto& m){return !wanted.count(m.mask.id);}),masks.end());edit.maskHistory.afterMasks=masks;}

 if(edit.beforeAnimationSelection){
  auto sameIds=[](const auto& ids,const auto& records){if(ids.size()!=records.size())return false;for(const auto& id:ids)if(std::none_of(records.begin(),records.end(),[&](const auto& record){return record.id==id;}))return false;return true;};
  if(!edit.frameHistory.beforeFrames.empty()&&!sameIds(edit.frameHistory.beforeFrames,timeline_.state().frames))edit.normalizeAnimationSelection=true;
  if(!edit.layerHistory.beforeOrder.empty()&&!sameIds(edit.layerHistory.beforeOrder,timeline_.state().layers))edit.normalizeAnimationSelection=true;
  if(edit.layerHistory.beforeLayerStructure){const auto& old=*edit.layerHistory.beforeLayerStructure;std::vector<std::string> layers,groups;for(const auto& layer:old.layers)layers.push_back(layer.id);for(const auto& group:old.groups)groups.push_back(group.id);if(!sameIds(layers,timeline_.state().layers)||!sameIds(groups,timeline_.state().groups))edit.normalizeAnimationSelection=true;}
  if(edit.normalizeAnimationSelection)normalizeAnimationSelection();
  edit.afterAnimationSelection=captureAnimationSelection();
 }

  edit.label=historyLabelOverride_.empty()?std::move(label):historyLabelOverride_;if(edit.label.empty())edit.label=U"修改图层属性";++historyRevision_;
  capturePixelAddresses(edit);
  history_.push(std::move(edit),false);++historyPushRevision_;if(history_.latest().documentChanged){if(groupingHistory_)pendingGroupedProjectOperation_=true;else projectInformation_.operation();}if(history_.latest().documentChanged){state_=nextState_++;modified_=true;}++revision_;
  const auto discardedUndo=groupingHistory_?0:history_.enforceLimits();
  if(!groupingHistory_)notifyHistoryChange(HistoryStackChange::Kind::Push,history_.latest().label,discardedUndo);
  if(!groupingHistory_&&history_.latest().documentChanged)notifyRecording();
}
const PaletteEntry* Document::paletteEntry(int id) const {
  for(const auto& entry:palette_.entries) if(entry.id==id) return &entry;
  return nullptr;
}
void Document::selectPaletteIds(const std::vector<int>& ids,int primary) {
  palette_.selected.clear();const auto& order=palette_.order();const std::unordered_set<int> available(order.begin(),order.end());std::unordered_set<int> chosen;chosen.reserve(std::min(ids.size(),available.size()));
  for(int id:ids)if(available.count(id)&&chosen.insert(id).second)palette_.selected.push_back(id);
  palette_.primaryId=chosen.count(primary)?primary:palette_.selected.empty()?0:palette_.selected.back();
  if(const auto entry=paletteEntry(palette_.primaryId)) palette_.primary=entry->color;
}
void Document::selectPalette(int id,bool additive) {
  if(!paletteEntry(id)) return;
  auto ids=additive?palette_.selected:std::vector<int>{};
  const auto it=std::find(ids.begin(),ids.end(),id);
  if(it!=ids.end()) ids.erase(it);else ids.push_back(id);
  selectPaletteIds(ids,id);
}
void Document::selectPaletteRange(int id,int columns) {
  const auto& slots=palette_.slots;
  const auto end=std::find(slots.begin(),slots.end(),id);
  if(id && end!=slots.end()) selectPaletteSlotRange(std::size_t(end-slots.begin()),columns);
}
void Document::selectPaletteSlotRange(std::size_t slot,int columns,const std::vector<int>* viewSlots) {
  if(columns<1) return;
  const auto& slots=viewSlots?*viewSlots:palette_.slots;
  if(slot>=slots.size()) return;
  const int id=slots[slot];
  const auto anchor=std::find(slots.begin(),slots.end(),palette_.primaryId);
  if(!palette_.primaryId || anchor==slots.end()) {if(id) selectPalette(id);return;}
  const int start=int(anchor-slots.begin()),end=int(slot);std::vector<int> ids;
  for(int row=std::min(start/columns,end/columns);row<=std::max(start/columns,end/columns);++row)
    for(int col=std::min(start%columns,end%columns);col<=std::max(start%columns,end%columns);++col)
      if(row*columns+col<int(slots.size()) && slots[row*columns+col]) ids.push_back(slots[row*columns+col]);
  selectPaletteIds(ids,id);
}
void Document::selectSecondaryPalette(int id) {
  if(const auto entry=paletteEntry(id)) {palette_.secondaryId=id;palette_.secondary=entry->color;palette_.selected={id};}
}
void Document::clearPaletteSelection() {palette_.selected.clear();palette_.primaryId=0;}
// legacy PalettePanel::movePalettePointer and palette-layout::repositionPaletteSlots.
void Document::selectPaletteBox(std::size_t start,std::size_t end,int columns,const std::vector<int>* viewSlots) {
 if(columns<1)return;std::vector<int> ids;const auto& slots=viewSlots?*viewSlots:palette_.slots;
 for(std::size_t y=std::min(start/columns,end/columns);y<=std::max(start/columns,end/columns);++y)
  for(std::size_t x=std::min(start%columns,end%columns);x<=std::max(start%columns,end%columns);++x){auto i=y*columns+x;if(i<slots.size() && slots[i])ids.push_back(slots[i]);}
 selectPaletteIds(ids,end<slots.size()?slots[end]:0);
}
std::vector<int> Document::movedPaletteSlots(const std::vector<int>& slots,const std::vector<int>& ids,int target,int anchor,int columns){
 columns=std::clamp(columns,1,256);target=std::max(0,target);const std::unordered_set<int> selected(ids.begin(),ids.end());
 std::vector<int> sources;for(int i=0;i<int(slots.size());++i)if(slots[i]&&selected.count(slots[i]))sources.push_back(i);
 if(sources.empty())return slots;int a=sources.front();for(int i:sources)if(slots[i]==anchor){a=i;break;}int minX=columns,maxX=0,minY=int(slots.size());
 for(int i:sources){minX=std::min(minX,i%columns);maxX=std::max(maxX,i%columns);minY=std::min(minY,i/columns);}
 const int dx=std::clamp(target%columns-a%columns,-minX,columns-1-maxX),dy=std::max(-minY,target/columns-a/columns);
 std::vector<int> destinations;auto next=slots;for(int i:sources)destinations.push_back((i/columns+dy)*columns+i%columns+dx);
 const int required=*std::max_element(destinations.begin(),destinations.end())+1;next.resize(std::max(int(next.size()),((required+columns-1)/columns)*columns),0);
 for(int i:sources)next[i]=0;std::vector<int> displaced;
 for(std::size_t i=0;i<sources.size();++i){const int dest=destinations[i];if(next[dest])displaced.push_back(next[dest]);next[dest]=slots[sources[i]];}
 const std::unordered_set<int> destinationSet(destinations.begin(),destinations.end());std::size_t sourceHole=0,hole=0;
 for(int id:displaced){while(sourceHole<sources.size()&&(next[sources[sourceHole]]||destinationSet.count(sources[sourceHole])))++sourceHole;int dest;
  if(sourceHole<sources.size())dest=sources[sourceHole++];else{while(hole<next.size()&&(next[hole]||destinationSet.count(int(hole))))++hole;dest=int(hole);if(hole==next.size())next.resize(next.size()+columns,0);++hole;}next[dest]=id;}

 return next;
}
// Actual workspace-palette::reorderPaletteColors; incoming slots are a
// completed preview, and normalization belongs to the command boundary.
bool Document::reorderPaletteColors(const std::vector<int>& ids,const std::vector<int>& targetSlots,int columns){
 columns=std::clamp(columns,1,256);const auto before=currentPaletteSlots(palette_);auto next=normalizePaletteSlots(palette_.entries,palette_.order(),targetSlots,columns);if(next==before&&palette_.columns==columns)return false;
 const std::unordered_set<int> occupied(before.begin(),before.end());const auto moving=std::count_if(ids.begin(),ids.end(),[&](int id){return occupied.count(id);});cancelStroke();Edit edit{{},state_,nextState_};edit.paletteHistory.paletteKind=9;edit.paletteHistory.beforePalette=PaletteState{};edit.paletteHistory.afterPalette=PaletteState{};edit.paletteHistory.beforePalette->entries.clear();edit.paletteHistory.afterPalette->entries.clear();edit.paletteHistory.beforePalette->slots=before;edit.paletteHistory.beforePalette->columns=palette_.columns;edit.paletteHistory.afterPalette->slots=next;edit.paletteHistory.afterPalette->columns=columns;palette_.columns=columns;palette_.slots=std::move(next);palette_.independentOrder.reset();pushEdit(std::move(edit),moving>1?U"批量调整颜色板顺序":U"调整颜色板顺序");return true;
}
// Actual movePaletteColor swaps only the primary slot with its neighbor,
// including an empty neighbor. It never moves the entire selected group.
bool Document::movePaletteColor(int direction){
 if(direction!=-1&&direction!=1)return false;auto before=currentPaletteSlots(palette_);const auto current=std::find(before.begin(),before.end(),palette_.primaryId?palette_.primaryId:-1);if(current==before.end())return false;const auto target=std::ptrdiff_t(current-before.begin())+direction;if(target<0||std::size_t(target)>=before.size())return false;auto after=before;std::swap(after[std::size_t(current-before.begin())],after[std::size_t(target)]);
 cancelStroke();Edit edit{{},state_,nextState_};edit.paletteHistory.paletteKind=9;edit.paletteHistory.beforePalette=PaletteState{};edit.paletteHistory.afterPalette=PaletteState{};edit.paletteHistory.beforePalette->entries.clear();edit.paletteHistory.afterPalette->entries.clear();edit.paletteHistory.beforePalette->slots=std::move(before);edit.paletteHistory.beforePalette->columns=palette_.columns;edit.paletteHistory.afterPalette->slots=after;edit.paletteHistory.afterPalette->columns=palette_.columns;palette_.slots=std::move(after);palette_.independentOrder.reset();pushEdit(std::move(edit),U"调整颜色板顺序");return true;
}
void Document::repositionPaletteColors(const std::vector<int>& slots,const std::vector<int>& ids,int target,int anchor,int columns,bool storeColumns){
 reorderPaletteColors(ids,movedPaletteSlots(slots,ids,target,anchor,columns),storeColumns?columns:palette_.columns);
}
// legacy workspace-palette::pastePaletteColors: overwrite selected slots, otherwise append.
// recordPaletteEdit restores layout through applyPaletteSlots, so its Undo
// rebuilds order from slots too. It does not restore an imported raw order.
namespace {
void requirePaletteIds(const PaletteState& palette,std::size_t count){
 if(palette.nextId<1||count>std::size_t(std::numeric_limits<int>::max()-palette.nextId))throw std::length_error("Palette color ID exceeds native integer range");
}
int allocatePaletteId(PaletteState& palette){
 // Native entry IDs and their incremented cursor must both fit int. Legacy
 // uses wider JS numbers; reject this representation boundary without UB.
 requirePaletteIds(palette,1);return palette.nextId++;
}
}
void Document::pastePaletteColors(const std::vector<Pixel>& colors,const std::vector<std::size_t>& targets,bool selectResult,const std::vector<int>* viewSlots,int viewColumns){
 if(colors.empty())return;
 // Legacy deduplicates indices before pairing them with colors. Keep first
 // occurrence order: [a,a,b] consumes colors[0] at a and colors[1] at b.
 std::vector<std::size_t> indices;indices.reserve(std::min(targets.size(),colors.size()));std::unordered_set<std::size_t> seen;
 for(auto target:targets)if(seen.insert(target).second){indices.push_back(target);if(indices.size()==colors.size())break;}
 const auto count=targets.empty()?colors.size():indices.size();
 // Count actual new IDs before touching live colors, including
 // overwrite-only paste at exhaustion. Avoid another full
 // PaletteState copy for the ordinary paste path.
 const auto sourceSlots=normalizePaletteSlots(palette_.entries,palette_.order(),viewSlots?*viewSlots:palette_.slots,viewColumns>0?viewColumns:palette_.columns);std::size_t allocations=0;
 if(targets.empty()){const auto end=std::min<std::size_t>(sourceSlots.size(),65536);const auto available=std::count(sourceSlots.begin(),sourceSlots.begin()+end,0)+(65536-end);allocations=std::min<std::size_t>(count,available);}
 else{for(auto slot:indices)if(slot<65536&&(slot>=sourceSlots.size()||!sourceSlots[slot]))++allocations;}
 requirePaletteIds(palette_,allocations);const bool independentOrder=palette_.independentOrder.has_value();cancelStroke();Edit edit{{},state_,nextState_};edit.paletteHistory.paletteKind=7;edit.paletteHistory.beforePalette=palette_;normalizePaletteSnapshot(*edit.paletteHistory.beforePalette,false);palette_.slots=sourceSlots;if(viewColumns>0)palette_.columns=std::clamp(viewColumns,1,256);std::vector<int> ids;
 // Entry indices survive vector reallocation; monotonic hole search preserves
 // legacy earliest-empty append order without scanning the occupied prefix again.
 std::unordered_map<int,std::size_t> positions;positions.reserve(palette_.entries.size()+allocations);for(std::size_t i=0;i<palette_.entries.size();++i)positions.emplace(palette_.entries[i].id,i);std::size_t hole=0;
 for(std::size_t i=0;i<count;++i){if(targets.empty())while(hole<palette_.slots.size()&&palette_.slots[hole])++hole;auto slot=targets.empty()?hole:indices[i];
  if(slot>=65536)continue;if(slot>=palette_.slots.size())palette_.slots.resize(slot+1,0);int id=palette_.slots[slot];
  if(id){if(const auto found=positions.find(id);found!=positions.end())palette_.entries[found->second].color=colors[i];}
  else{id=allocatePaletteId(palette_);const auto number=std::to_string(id);positions.emplace(id,palette_.entries.size());palette_.entries.push_back({id,std::u32string(number.begin(),number.end()),colors[i]});palette_.slots[slot]=id;}ids.push_back(id);
 }

 const auto columns=std::size_t(palette_.columns);palette_.slots.resize(std::max(columns,((palette_.slots.size()+columns-1)/columns)*columns),0);
 palette_.independentOrder.reset();if(selectResult)selectPaletteIds(ids,ids.empty()?0:ids.back());else clearPaletteSelection();const auto& before=*edit.paletteHistory.beforePalette;if(before.columns==palette_.columns && before.slots==palette_.slots && before.entries.size()==palette_.entries.size() && std::equal(before.entries.begin(),before.entries.end(),palette_.entries.begin(),[](const auto& a,const auto& b){return a.id==b.id&&a.name==b.name&&a.color==b.color;})){if(independentOrder){modified_=true;state_=nextState_++;++revision_;projectInformation_.operation();notifyRecording();}return;}edit.paletteHistory.afterPalette=palette_;pushEdit(std::move(edit),U"调整颜色板颜色");
}

int Document::addPaletteColor(Pixel color,bool selectAdded,std::optional<std::size_t> targetSlot,const std::vector<int>* viewSlots,int viewColumns) {
  requirePaletteIds(palette_,1);if(targetSlot&&*targetSlot>=65536)throw std::length_error("Palette target exceeds native slot range");
  cancelStroke();Edit edit{{},state_,nextState_};edit.paletteHistory.beforePalette=palette_;normalizePaletteSnapshot(*edit.paletteHistory.beforePalette,false);edit.paletteHistory.paletteKind=1;const int id=allocatePaletteId(palette_);auto slots=currentPaletteSlots(palette_);
  const auto append=[&](std::vector<int>& into,int columns){const auto hole=std::find(into.begin(),into.end(),0);if(hole!=into.end())*hole=id;else{const auto n=into.size();into.resize(n+columns,0);into[n]=id;}};
  append(slots,palette_.columns);
  if(targetSlot){slots=viewSlots?*viewSlots:edit.paletteHistory.beforePalette->slots;const int columns=viewColumns>0?std::clamp(viewColumns,1,256):palette_.columns;append(slots,columns);slots=movedPaletteSlots(slots,{id},int(*targetSlot),id,columns);palette_.columns=columns;}
  const auto name=std::to_string(id);palette_.entries.push_back({id,std::u32string(name.begin(),name.end()),color});palette_.slots=std::move(slots);
  palette_.independentOrder.reset();palette_.selected=selectAdded?std::vector<int>{id}:std::vector<int>{};palette_.primaryId=selectAdded?id:0;
  edit.paletteHistory.afterPalette=capturePaletteEdit(1);pushEdit(std::move(edit),U"调整颜色板颜色");return id;
}
void Document::deletePaletteColors(const std::vector<int>& ids) {
  // Actual workspace-palette::deletePaletteColors removes visible identities
  // only. Entries remain available for later reuse and earlier color history.
  const auto order=palette_.order();const std::unordered_set<int> visible(order.begin(),order.end());std::unordered_set<int> removed;removed.reserve(std::min(ids.size(),visible.size()));for(int id:ids)if(visible.count(id))removed.insert(id);if(removed.empty())return;
  cancelStroke();Edit edit{{},state_,nextState_};edit.paletteHistory.beforePalette=capturePaletteEdit(2);edit.paletteHistory.beforePalette->slots=currentPaletteSlots(palette_);edit.paletteHistory.beforePalette->setOrder(order);edit.paletteHistory.paletteKind=2;palette_.slots=edit.paletteHistory.beforePalette->slots;
  for(auto& slot:palette_.slots)if(slot&&removed.count(slot))slot=0;
  palette_.independentOrder.reset();auto& selected=palette_.selected;selected.erase(std::remove_if(selected.begin(),selected.end(),[&](int id){return removed.count(id);}),selected.end());
  if(std::find(selected.begin(),selected.end(),palette_.primaryId)==selected.end())palette_.primaryId=selected.empty()?0:selected.back();
  edit.paletteHistory.afterPalette=capturePaletteEdit(2);pushEdit(std::move(edit),removed.size()>1?U"批量移除颜色板颜色":U"从颜色板移除颜色");
}
void Document::updatePaletteColor(int id,Pixel color) {
  const auto current=paletteEntry(id);if(!current || current->color==color) return;
  if(paletteColorSynchronization_){
    // legacy workspace-commands-color: document frames x bottom-to-top layers,
    // owner dedup BEFORE lock filtering, hidden layers included, no selection clip.
    const Pixel source=current->color;Edit compound{{},state_,nextState_};compound.beforeActive=compound.afterActive=layer().id;compound.beforeFrame=compound.afterFrame=frame().id;compound.beforeSelection=compound.afterSelection=selectedFrames_;
    Edit paletteEdit{{},state_,nextState_};paletteEdit.paletteHistory.paletteKind=3;paletteEdit.paletteHistory.colorId=id;paletteEdit.paletteHistory.beforePalette=capturePaletteEdit(3,id);paletteEdit.paletteHistory.afterPalette=*paletteEdit.paletteHistory.beforePalette;for(auto& entry:paletteEdit.paletteHistory.afterPalette->entries)if(entry.id==id)entry.color=color;if(paletteEdit.paletteHistory.afterPalette->primary==source)paletteEdit.paletteHistory.afterPalette->primary=color;if(paletteEdit.paletteHistory.afterPalette->secondary==source)paletteEdit.paletteHistory.afterPalette->secondary=color;compound.children.push_back(std::move(paletteEdit));
    if(!timeline_.state().tilesets.empty()){auto resourceState=timeline_.state();
    if(synchronizePaletteResources(resourceState,source,color)){
      Edit resources{{},state_,nextState_};resources.snapshotHistory.beforeTimeline=timeline_.state();resources.snapshotHistory.afterTimeline=std::move(resourceState);resources.beforeActive=resources.afterActive=activeLayerId_;resources.beforeFrame=resources.afterFrame=activeFrameId_;compound.children.push_back(std::move(resources));
    }}
    // Visit only existing slots, retaining frame-first / bottom-to-top order.
    // Sparse timelines must not scan every empty layer x frame combination.
    const auto& state=timeline_.state();struct Target{const timeline::Cel* cel;std::size_t frame,layer;};std::vector<Target> targets;targets.reserve(state.cels.size());
    if(state.frames.size()*state.layers.size()>state.cels.size()*4){
      std::unordered_map<std::string,std::size_t> frameOrder,layerOrder;frameOrder.reserve(state.frames.size());layerOrder.reserve(state.layers.size());for(std::size_t i=0;i<state.frames.size();++i)frameOrder.emplace(state.frames[i].id,i);for(std::size_t i=0;i<state.layers.size();++i)layerOrder.emplace(state.layers[i].id,state.layers.size()-1-i);
      for(const auto& c:state.cels){const auto f=frameOrder.find(c.frameId),l=layerOrder.find(c.layerId);if(f!=frameOrder.end()&&l!=layerOrder.end())targets.push_back({&c,f->second,l->second});}std::sort(targets.begin(),targets.end(),[](const auto& a,const auto& b){return a.frame!=b.frame?a.frame<b.frame:a.layer<b.layer;});
    }else for(std::size_t f=0;f<state.frames.size();++f)for(std::size_t l=0;l<state.layers.size();++l)if(const auto* c=timeline_.findCel(state.layers[state.layers.size()-1-l].id,state.frames[f].id))targets.push_back({c,f,l});
    std::vector<bool> locked;locked.reserve(state.layers.size());for(auto l=state.layers.rbegin();l!=state.layers.rend();++l)locked.push_back(layerEffectivelyLocked(*l));std::unordered_set<const void*> seen;seen.reserve(targets.size());
    for(const auto& target:targets){const auto resolved=timeline_.resolveSurface(target.cel->id);if(resolved.source&&(resolved.source->tilemap||resolved.source->freeTiles))continue;if(!resolved.source||!resolved.surface||!seen.insert(resolved.surface->pixels.identity()).second||locked[target.layer])continue;Edit child{{},state_,nextState_};child.contentHistory.targetCelId=resolved.source->id;child.contentHistory.pixelAddress=PixelAddressSpace{resolved.surface->width,resolved.surface->height,resolved.surface->storageOriginX.value_or(0),resolved.surface->storageOriginY.value_or(0)};const auto& pixels=resolved.surface->pixels;for(std::size_t i=0;i<pixels.size();++i)if(pixels[i]==source){if(!child.contentHistory.runs.empty()&&child.contentHistory.runs.back().index+child.contentHistory.runs.back().length==i)++child.contentHistory.runs.back().length;else child.contentHistory.runs.push_back({i,1,source,normalizeCanvasPacked(color)});}if(!child.contentHistory.runs.empty())compound.children.push_back(std::move(child));}
    auto gradientPreview=std::move(gradient_);cancelStroke();gradient_=std::move(gradientPreview);reserveHistoryEntries();change_={};applyEdit(compound,true);publishChange();pushEdit(std::move(compound),U"调整颜色板颜色");return;
  }
  auto gradientPreview=std::move(gradient_);cancelStroke();gradient_=std::move(gradientPreview);Edit edit{{},state_,nextState_};edit.paletteHistory.beforePalette=capturePaletteEdit(3,id);edit.paletteHistory.paletteKind=3;edit.paletteHistory.colorId=id;
  const auto before=current->color;
  for(auto& entry:palette_.entries) if(entry.id==id) entry.color=color;
  if(palette_.primary==before) palette_.primary=color;if(palette_.secondary==before) palette_.secondary=color;
  edit.paletteHistory.afterPalette=capturePaletteEdit(edit.paletteHistory.paletteKind,edit.paletteHistory.colorId);pushEdit(std::move(edit),U"调整颜色板颜色");
}
// Exact legacy core/palette.ts comparators; stable full paletteOrder slot sorting.
bool Document::sortPaletteColors(PaletteSortMode mode,bool descending){
 struct Values{double hue,brightness,luminance,saturation;bool achromatic;};
 const auto values=[](Pixel c){double r=(c&255)/255.0,g=((c>>8)&255)/255.0,b=((c>>16)&255)/255.0,maximum=std::max({r,g,b}),minimum=std::min({r,g,b}),range=maximum-minimum,h=0;if(range>0){if(maximum==r)h=((g-b)/range+(g<b?6:0))*60;else if(maximum==g)h=((b-r)/range+2)*60;else h=((r-g)/range+4)*60;}auto linear=[](double v){return v<=0.04045?v/12.92:std::pow((v+0.055)/1.055,2.4);};return Values{h,maximum,.2126*linear(r)+.7152*linear(g)+.0722*linear(b),maximum==0?0:range/maximum,range<=8/255.0};};
 const auto hue=[](Pixel a,Pixel b,const Values& x,const Values& y){if(x.achromatic!=y.achromatic)return x.achromatic?-1.0:1.0;double d=x.achromatic?x.brightness-y.brightness:x.hue-y.hue;if(!d && !x.achromatic)d=x.brightness-y.brightness;if(!d && !x.achromatic)d=y.saturation-x.saturation;if(!d)d=double(b>>24)-double(a>>24);return d?d:double(a)-double(b);};
 // Cache derived sort keys once per entry; comparisons never repeat pow/HSV.
 struct SortKey{Pixel color;Values derived;};std::unordered_map<int,SortKey> keys;keys.reserve(palette_.entries.size());for(const auto& e:palette_.entries)keys.emplace(e.id,SortKey{e.color,values(e.color)});auto ids=palette_.order();ids.erase(std::remove_if(ids.begin(),ids.end(),[&](int id){return !keys.count(id);}),ids.end());
 std::stable_sort(ids.begin(),ids.end(),[&](int left,int right){const auto& l=keys.at(left);const auto& r=keys.at(right);const Pixel a=l.color,b=r.color;const auto& x=l.derived;const auto& y=r.derived;double d=0;
 switch(mode){case PaletteSortMode::Saturation:d=x.saturation-y.saturation;if(!d)d=x.brightness-y.brightness;break;case PaletteSortMode::Brightness:d=x.brightness-y.brightness;if(!d)d=x.saturation-y.saturation;break;case PaletteSortMode::Luminance:d=x.luminance-y.luminance;if(!d)d=x.brightness-y.brightness;break;case PaletteSortMode::Red:case PaletteSortMode::Green:case PaletteSortMode::Blue:{int first=mode==PaletteSortMode::Red?0:mode==PaletteSortMode::Green?8:16;for(int shift:{first,0,8,16,24}){d=double((a>>shift)&255)-double((b>>shift)&255);if(d)break;}break;}case PaletteSortMode::Alpha:d=double(a>>24)-double(b>>24);break;default:break;}
 if(!d)d=hue(a,b,x,y);return descending?d>0:d<0;});
 const auto before=currentPaletteSlots(palette_);ids.resize(std::max(ids.size(),before.size()),0);if(ids==before)return false;cancelStroke();Edit e{{},state_,nextState_};e.paletteHistory.paletteKind=9;e.paletteHistory.beforePalette=PaletteState{};e.paletteHistory.afterPalette=PaletteState{};e.paletteHistory.beforePalette->entries.clear();e.paletteHistory.afterPalette->entries.clear();e.paletteHistory.beforePalette->slots=before;e.paletteHistory.beforePalette->columns=palette_.columns;e.paletteHistory.afterPalette->slots=ids;e.paletteHistory.afterPalette->setOrder(paletteOrderFromSlots(ids));e.paletteHistory.afterPalette->columns=palette_.columns;palette_.slots=std::move(ids);palette_.setOrder(paletteOrderFromSlots(palette_.slots));pushEdit(std::move(e),U"排序颜色板颜色");return true;
}
namespace {
struct PaletteGradientSampler {
 struct Hsv{double h,s,v;};Pixel start,end;bool byHue;Hsv a{},b{};double hueDelta=0;
 static Hsv hsv(Pixel c){double r=(c&255)/255.0,g=((c>>8)&255)/255.0,bl=((c>>16)&255)/255.0,max=std::max({r,g,bl}),min=std::min({r,g,bl}),d=max-min,h=0;if(d>0){if(max==r)h=60*std::fmod((g-bl)/d,6);else if(max==g)h=60*((bl-r)/d+2);else h=60*((r-g)/d+4);}if(h<0)h+=360;return {h,max==0?0:d/max,max};}
 PaletteGradientSampler(Pixel first,Pixel last,bool hue):start(first),end(last),byHue(hue){if(byHue){a=hsv(start);b=hsv(end);hueDelta=b.h-a.h;if(hueDelta>180)hueDelta-=360;else if(hueDelta< -180)hueDelta+=360;}}
 Pixel operator()(std::size_t index,std::size_t count)const{
  if(count==1)return start;const double t=double(index)/(count-1);auto byte=[](double v){return Pixel(std::clamp(std::floor(v+.5),0.0,255.0));};Pixel color=0;
  if(byHue){double h=std::fmod(std::fmod(a.h+hueDelta*t,360)+360,360),s=a.s+(b.s-a.s)*t,v=a.v+(b.v-a.v)*t,c=v*s,x=c*(1-std::abs(std::fmod(h/60,2)-1)),m=v-c;double r=0,g=0,bl=0;switch(int(std::floor(h/60))){case 0:r=c;g=x;break;case 1:r=x;g=c;break;case 2:g=c;bl=x;break;case 3:g=x;bl=c;break;case 4:r=x;bl=c;break;default:r=c;bl=x;}color=byte((r+m)*255)|(byte((g+m)*255)<<8)|(byte((bl+m)*255)<<16)|(byte(double(start>>24)+(double(end>>24)-double(start>>24))*t)<<24);}else for(int shift:{0,8,16,24})color|=byte(double((start>>shift)&255)+(double((end>>shift)&255)-double((start>>shift)&255))*t)<<shift;
  return color;
 }
};
}
// legacy paletteGradient/raster HSV and workspace-palette gradientPaletteSlots.
void Document::gradientPaletteSlots(std::vector<std::size_t> indices,int columns,bool byHue,const std::vector<int>* viewSlots){
 indices.erase(std::remove_if(indices.begin(),indices.end(),[](auto i){return i>=65536;}),indices.end());std::sort(indices.begin(),indices.end());indices.erase(std::unique(indices.begin(),indices.end()),indices.end());if(indices.size()<2)return;columns=std::clamp(columns,1,256);
 auto next=palette_;next.slots=normalizePaletteSlots(next.entries,next.order(),viewSlots?*viewSlots:next.slots,columns);next.columns=columns;const auto required=indices.back()+1;while(next.slots.size()<required)next.slots.resize(next.slots.size()+columns,0);std::unordered_map<int,std::size_t> positions;for(std::size_t i=0;i<next.entries.size();++i)positions.emplace(next.entries[i].id,i);
 auto endpoint=[&](std::size_t slot,Pixel fallback){auto found=positions.find(next.slots[slot]);return found==positions.end()?fallback:next.entries[found->second].color;};const auto start=endpoint(indices.front(),palette_.primary),end=endpoint(indices.back(),palette_.secondary);
 const PaletteGradientSampler sample(start,end,byHue);for(std::size_t i=0;i<indices.size();++i){const Pixel color=sample(i,indices.size());
 const auto slot=indices[i];auto found=positions.find(next.slots[slot]);if(found!=positions.end())next.entries[found->second].color=color;else{const int id=allocatePaletteId(next);const auto number=std::to_string(id);positions.emplace(id,next.entries.size());next.entries.push_back({id,std::u32string(number.begin(),number.end()),color});next.slots[slot]=id;}}
 cancelStroke();Edit e{{},state_,nextState_};e.paletteHistory.paletteKind=10;e.paletteHistory.beforePalette=palette_;normalizePaletteSnapshot(*e.paletteHistory.beforePalette,true);next.independentOrder.reset();e.paletteHistory.afterPalette=next;reserveHistoryEntries();palette_=std::move(next);pushEdit(std::move(e),U"生成颜色板渐变");
}
// legacy workspace-palette::gradientPaletteColors: only selected IDs in
// raw order, no slot creation/reordering and no role/selection changes.
bool Document::gradientPaletteColors(bool byHue){
 const std::unordered_set<int> selected(palette_.selected.begin(),palette_.selected.end());std::vector<int> ids;for(int id:palette_.order())if(selected.count(id))ids.push_back(id);if(ids.size()<2)return false;
 std::unordered_map<int,const PaletteEntry*> entries;for(const auto& e:palette_.entries)entries[e.id]=&e;const auto first=entries.find(ids.front()),last=entries.find(ids.back());if(first==entries.end()||last==entries.end())return false;const auto start=first->second->color,end=last->second->color;
 Edit edit{{},state_,nextState_};edit.paletteHistory.paletteKind=8;edit.paletteHistory.beforePalette=PaletteState{};edit.paletteHistory.afterPalette=PaletteState{};edit.paletteHistory.beforePalette->entries.clear();edit.paletteHistory.beforePalette->slots.clear();edit.paletteHistory.afterPalette->entries.clear();edit.paletteHistory.afterPalette->slots.clear();
 const PaletteGradientSampler sample(start,end,byHue);for(std::size_t i=0;i<ids.size();++i)if(const auto found=entries.find(ids[i]);found!=entries.end()){const Pixel before=found->second->color,after=sample(i,ids.size());if(before!=after){edit.paletteHistory.beforePalette->entries.push_back({ids[i],U"",before});edit.paletteHistory.afterPalette->entries.push_back({ids[i],U"",after});}}
 if(edit.paletteHistory.beforePalette->entries.empty())return false;cancelStroke();reserveHistoryEntries();applyPaletteEdit(edit,true);pushEdit(std::move(edit),byHue?U"生成颜色板色调渐变":U"生成颜色板渐变");return true;
}
// legacy workspace-palette.ts paletteOperationIds/applyPaletteColors/reversePaletteColors.
bool Document::reversePaletteColors(){
 const auto order=palette_.order();const std::set<int> selected(palette_.selected.begin(),palette_.selected.end());std::unordered_map<int,std::size_t> positions;positions.reserve(palette_.entries.size());for(std::size_t i=0;i<palette_.entries.size();++i)positions.emplace(palette_.entries[i].id,i);std::vector<int> ids;for(int id:order)if(selected.count(id))ids.push_back(id);if(ids.size()<2)ids=order;
 std::vector<std::optional<Pixel>> colors;colors.reserve(ids.size());for(int id:ids){auto it=positions.find(id);colors.push_back(it==positions.end()?std::nullopt:std::optional<Pixel>(palette_.entries[it->second].color));}Edit edit{{},state_,nextState_};edit.paletteHistory.paletteKind=8;edit.paletteHistory.beforePalette=PaletteState{};edit.paletteHistory.afterPalette=PaletteState{};edit.paletteHistory.beforePalette->entries.clear();edit.paletteHistory.beforePalette->slots.clear();edit.paletteHistory.afterPalette->entries.clear();edit.paletteHistory.afterPalette->slots.clear();
 for(std::size_t i=0;i<ids.size();++i){const auto before=colors[i],after=colors[ids.size()-1-i];if(before&&after&&before!=after){edit.paletteHistory.beforePalette->entries.push_back({ids[i],U"",*before});edit.paletteHistory.afterPalette->entries.push_back({ids[i],U"",*after});}}
 if(edit.paletteHistory.beforePalette->entries.empty())return false;cancelStroke();reserveHistoryEntries();for(const auto& source:edit.paletteHistory.afterPalette->entries)palette_.entries[positions.at(source.id)].color=source.color;pushEdit(std::move(edit),U"反向颜色板颜色");return true;
}
void Document::setPaletteRole(Pixel color,bool secondary,bool locked) {
  const int id=secondary?palette_.secondaryId:palette_.primaryId;
  const Pixel previous=secondary?palette_.secondary:palette_.primary;
  const auto entry=paletteEntry(id);
  if(!locked && entry && entry->color==previous) updatePaletteColor(id,color);
  (secondary?palette_.secondary:palette_.primary)=color;
  if(!locked) return;
  int matching=entry && entry->color==color?id:0;
  if(!matching) for(int candidate:palette_.order()) if(const auto* found=paletteEntry(candidate);found&&found->color==color) {matching=candidate;break;}
  if(secondary) palette_.secondaryId=matching;
  else {palette_.primaryId=matching;if(!matching) palette_.selected.clear();
    else if(std::find(palette_.selected.begin(),palette_.selected.end(),matching)==palette_.selected.end()) palette_.selected={matching};}
}
void Document::renamePaletteColor(int id,const std::u32string& name) {
  const auto entry=paletteEntry(id);if(!entry) return;
  const std::u32string next(javascriptTrim(name));
  if(entry->name==next) return;
  cancelStroke();Edit edit{{},state_,nextState_};edit.paletteHistory.beforePalette=capturePaletteEdit(4,id);edit.paletteHistory.paletteKind=4;edit.paletteHistory.colorId=id;
  for(auto& candidate:palette_.entries) if(candidate.id==id) candidate.name=next;
  edit.paletteHistory.afterPalette=capturePaletteEdit(edit.paletteHistory.paletteKind,edit.paletteHistory.colorId);pushEdit(std::move(edit),U"调整颜色板颜色");
}
// legacy workspace-palette.ts applyPalette: reuse each RGBA entry once; retain hidden IDs.
void Document::applyStoredPalette(const std::vector<Pixel>& colors,int columns,const std::vector<std::optional<std::size_t>>& slots,const std::vector<std::u32string>* names){
 auto next=palette_;std::vector<int> ids;ids.reserve(colors.size());std::unordered_map<Pixel,std::vector<std::size_t>> reusable;std::unordered_map<Pixel,std::size_t> cursors;std::unordered_map<int,std::size_t> positions;positions.reserve(next.entries.size()+colors.size());for(std::size_t i=0;i<next.entries.size();++i){reusable[next.entries[i].color].push_back(i);positions.emplace(next.entries[i].id,i);}
 // Actual applyPalette reuses matching entries in storage order, once each.
 // Keep indices rather than pointers across new-entry vector reallocations.
 for(std::size_t i=0;i<colors.size();++i){auto& cursor=cursors[colors[i]];const auto found=reusable.find(colors[i]);std::size_t entry;if(found!=reusable.end()&&cursor<found->second.size())entry=found->second[cursor++];else{const int id=allocatePaletteId(next);const auto number=std::to_string(id);entry=next.entries.size();positions.emplace(id,entry);next.entries.push_back({id,std::u32string(number.begin(),number.end()),colors[i]});}ids.push_back(next.entries[entry].id);if(names&&i<names->size())next.entries[entry].name=(*names)[i];}

 next.columns=columns?std::clamp(columns,1,256):palette_.columns;
 if(columns){next.slots.clear();for(auto cell:slots)next.slots.push_back(cell&&*cell<ids.size()?ids[*cell]:0);}else{next.slots=ids;while(next.slots.size()%next.columns)next.slots.push_back(0);}
 next.slots=normalizePaletteSlots(next.entries,ids,columns?next.slots:std::vector<int>{},next.columns);
 bool same=next.columns==palette_.columns&&next.slots==currentPaletteSlots(palette_);for(std::size_t i=0;same&&i<palette_.entries.size();++i)same=next.entries[i].name==palette_.entries[i].name;if(same)return;
 next.independentOrder.reset();next.selected.clear();next.primaryId=0;for(int id:next.order())if(next.entries[positions.at(id)].color==next.primary){next.primaryId=id;next.selected={id};break;}
 cancelStroke();Edit edit{{},state_,nextState_};edit.paletteHistory.paletteKind=11;edit.paletteHistory.beforePalette=palette_;normalizePaletteSnapshot(*edit.paletteHistory.beforePalette,true);edit.paletteHistory.afterPalette=next;palette_=std::move(next);pushEdit(std::move(edit),U"切换颜色板");
}
void Document::applyExtractedPalette(const std::vector<Pixel>& colors,bool append,int columns){
 if(colors.empty())return;
 auto wanted=colors;if(append){std::vector<Pixel> current;for(int id:palette_.order())if(const auto* entry=paletteEntry(id))current.push_back(entry->color);wanted=mergeExtractedPalette(current,colors);}
 // PalettePanel extraction calls applyPalette without an explicit layout.
 (void)columns;applyStoredPalette(wanted);
}
void Document::annotatePaletteView(PaletteViewSelection before,PaletteViewSelection after){
 history_.annotateLatestApplied([&](Edit& edit){if(!edit.paletteHistory.beforePalette)return;edit.paletteHistory.beforePaletteView=std::move(before);edit.paletteHistory.afterPaletteView=after;paletteViewRestore_=std::move(after);++paletteViewRestoreSerial_;});
}
const PaletteEntry* Document::displayPaletteEntry(int id) const {for(const auto& entry:displayPalette().entries)if(entry.id==id)return &entry;return nullptr;}
bool Document::beginPaletteReplacement(std::optional<Pixel> restorePrimary){
 commitFloatingPaste();cancelStroke();if(std::none_of(palette_.entries.begin(),palette_.entries.end(),[](const auto& entry){return entry.id!=0;}))return false;
 paletteReplacement_=PaletteReplacementPreview{palette_,palette_,contentRevision_,restorePrimary};return true;
}
bool Document::updatePaletteReplacement(Pixel source,Pixel replacement,bool enabled){
 if(!paletteReplacement_)return false;auto& p=*paletteReplacement_;if(p.contentRevision!=contentRevision_){cancelPaletteReplacement();return false;}p.preview=p.baseline;
 if(enabled && source!=replacement){for(auto& entry:p.preview.entries)if(entry.id!=0 && entry.color==source)entry.color=replacement;if(p.preview.primary==source)p.preview.primary=replacement;if(p.preview.secondary==source)p.preview.secondary=replacement;
  // ColorReplacementDialog overwrites preview.primaryColor with sourceColor
  // so restoring a live preview keeps the source as the foreground role.

 }return true;
}
void Document::cancelPaletteReplacement(){if(paletteReplacement_){if(paletteReplacement_->restorePrimary)palette_.primary=*paletteReplacement_->restorePrimary;paletteReplacement_.reset();}}
bool Document::commitPaletteReplacement(){
 if(!paletteReplacement_)return false;const auto& p=*paletteReplacement_;if(p.contentRevision!=contentRevision_){cancelPaletteReplacement();return false;}bool changed=false;for(std::size_t i=0;i<p.baseline.entries.size();++i)changed|=p.baseline.entries[i].color!=p.preview.entries[i].color;
 auto before=p.baseline;if(p.restorePrimary)before.primary=*p.restorePrimary;auto after=p.preview;paletteReplacement_.reset();
 if(!changed){palette_=std::move(after);return false;}Edit edit{{},state_,nextState_};edit.paletteHistory.paletteKind=6;edit.paletteHistory.beforePalette=std::move(before);edit.paletteHistory.afterPalette=after;reserveHistoryEntries();palette_=std::move(after);change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"替换颜色板颜色");return true;
}
void Document::acceptSaved(std::string projectId,std::shared_ptr<const std::vector<std::uint8_t>> sourceArchive,bool exact) {
  if(exact&&active()) throw std::logic_error("Cannot accept a saved uncommitted preview");
  if(projectId.empty() || !sourceArchive || sourceArchive->empty()) throw std::invalid_argument("Missing saved project identity or archive");
  // A successful older write still owns the disk baseline and target identity.
  // Only an exact generation may clear dirty; never replace live edits/history.
  projectId_=std::move(projectId);sourceArchive_=std::move(sourceArchive);
  if(exact)markSaved();else modified_=true;
}
void Document::markSaved() {
  if (active()) throw std::logic_error("Cannot mark an uncommitted preview saved");
  modified_ = false;
}
void Document::commitSelection(std::optional<SelectionMask> before,std::optional<SelectionMask> after,bool resetFrames){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);commitFloatingPaste();setSelectionValue(after);if(selectionEqual(before,after)){animationChangeBinding_.publish(*this,{AnimationChange::Kind::SelectionPreviewChanged});return;}Edit e{{},state_,state_};e.documentChanged=false;e.pixelSelectionHistory.pixelSelectionEdit=true;e.pixelSelectionHistory.beforePixelsSelection=std::move(before);e.pixelSelectionHistory.afterPixelsSelection=std::move(after);if(resetFrames)clearFrameSelection();pushEdit(std::move(e),U"创建选区");animationChangeBinding_.publish(*this,{AnimationChange::Kind::SelectionPreviewChanged});}
void Document::selectAllPixels(){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);commitFloatingPaste();setSelectionValue(SelectionMask{0,0,width_,height_,{}});animationChangeBinding_.publish(*this,{AnimationChange::Kind::SelectionPreviewChanged});}
void Document::selectTimelineCelContent(const std::string& id,bool additive){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);
 commitFloatingPaste();const auto* target=timeline_.findCelById(id);if(!target)return;const auto before=selection_;const auto incoming=timeline_.contentSelection(id,width_,height_,!active_);
 const auto after=combineSelection(before,incoming,additive?1:0);selectTimelineCel(id);setSelectionValue(before);commitSelection(before,after);
}
void Document::deselectPixels(){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);
 if(floating_&&floating_->restoredFromDeselect){commitFloatingPaste();if(canRedo())redo();return;}
 std::shared_ptr<FloatingPaste> restored;std::size_t restoredBytes=0;
 if(floating_&&floating_->clipboard&&!floating_->beforeCelTimeline){
  bool changed=floating_->deferred;for(const auto& t:floating_->targets)for(const auto& entry:t.preview)if(entry.second.before!=entry.second.after){changed=true;break;}
  if(changed){std::size_t duplicate=std::uint64_t(floating_->source.pixels.size())*5;if(floating_->beforeSelection)floatingAddBytes(duplicate,floating_->beforeSelection->mask.size());for(const auto& target:floating_->targets){floatingAddBytes(duplicate,std::uint64_t(target.source.pixels.size())*5+std::uint64_t(target.preview.size())*128);if(target.baseline)floatingAddBytes(duplicate,convolutionSurfaceBytes(*target.baseline));else if(floating_->deferred){const auto r=timeline_.resolveSurface(target.celId);if(!r.surface)throw std::logic_error("Missing restored floating baseline");floatingAddBytes(duplicate,convolutionSurfaceBytes(*r.surface));}if(target.originalSource)floatingAddBytes(duplicate,std::uint64_t(target.originalSource->pixels.size())*5);}checkFloatingBudget(*floating_,duplicate);restored=std::make_shared<FloatingPaste>(*floating_);restored->restoredFromDeselect=true;if(restored->deferred)for(auto& target:restored->targets)if(!target.baseline){const auto r=timeline_.resolveSurface(target.celId);if(!r.surface)throw std::logic_error("Missing restored floating baseline");target.baseline=*r.surface;}
   restoredBytes=sizeof(FloatingPaste)+restored->source.pixels.size()*5;
   for(const auto& t:restored->targets)restoredBytes+=sizeof(FloatingTarget)+t.source.pixels.size()*5+t.preview.size()*sizeof(Delta)+(t.baseline?t.baseline->pixels.size()*sizeof(Pixel):0)+(t.originalSource?t.originalSource->pixels.size()*5:0);
  }
 }
 reserveHistoryEntries(2);const auto originalTransient=floating_?floating_->transientBytes:0;if(floating_&&restored)floatingAddBytes(floating_->transientBytes,restoredBytes);bool committedPixels=false;try{committedPixels=commitFloatingPaste();}catch(...){if(floating_)floating_->transientBytes=originalTransient;throw;}if(!committedPixels){restored.reset();restoredBytes=0;}else if(restored&&restored->targets.size()==1&&restored->targets.front().celId.empty()){restored->targets.front().celId=cel().id;restored->targets.front().ownerId=cel().id;}if(!selection_)return;
 Edit e{{},state_,state_};e.documentChanged=false;e.pixelSelectionHistory.pixelSelectionEdit=true;e.pixelSelectionHistory.beforePixelsSelection=selection_;e.contentHistory.restoredClipboard=std::move(restored);e.contentHistory.restoredClipboardBytes=restoredBytes;
 setSelectionValue(std::nullopt);clearFrameSelection();pushEdit(std::move(e),U"取消选择");animationChangeBinding_.publish(*this,{AnimationChange::Kind::SelectionPreviewChanged});
}
void Document::invertPixels(){if(!selection_)return;commitFloatingPaste();commitSelection(selection_,invertSelection(selection_,width_,height_));}
std::optional<SelectionClipboard> Document::copyPixels() {if(!selection_)return {};SelectionClipboard out;if(floating_){const auto bounds=transformBounds(floating_->transform);out.width=bounds.width;out.height=bounds.height;out.originX=bounds.x;out.originY=bounds.y;out.pixels.resize(std::size_t(out.width)*out.height);out.mask.resize(out.pixels.size());auto transform=floating_->transform;transform.x-=bounds.x;transform.y-=bounds.y;if(transform.flipOriginX)*transform.flipOriginX-=bounds.x;if(transform.flipOriginY)*transform.flipOriginY-=bounds.y;if(transform.quad)for(auto& point:*transform.quad){point.x-=bounds.x;point.y-=bounds.y;}SelectionRotSpriteSource sampler(floating_->source);auto cells=floating_->rotSprite?rotSpriteSelectionCells(floating_->source,transform,out.width,out.height,sampler):fastSelectionTransformCells(floating_->source,transform,out.width,out.height);for(auto cell:cells){auto i=std::size_t(cell.y)*out.width+cell.x;out.pixels[i]=cell.value;out.mask[i]=1;}if(cells.empty())return {};celClipboard_.clear();frameClipboard_.clear();frameClipboardMetadata_.reset();return out;}const auto clamped=rectangleSelection(selection_->x,selection_->y,selection_->width,selection_->height,width_,height_);if(!clamped)return {};const auto* present=activeSurfaceIfPresent();if(!present)return {};const auto& source=*present;raster::validate(source);const bool dense=raster::fullCanvas(source,width_,height_);out.width=clamped->width;out.height=clamped->height;out.originX=clamped->x;out.originY=clamped->y;out.pixels.resize(out.width*out.height);out.mask.resize(out.pixels.size());bool any=false;for(int y=0;y<out.height;++y)for(int x=0;x<out.width;++x){const int px=clamped->x+x,py=clamped->y+y;if(!selectionContains(selection_,px,py))continue;const auto value=dense?source.pixels[std::size_t(py)*width_+px]:raster::readWorld(source,px,py);if(value>>24){const auto index=y*out.width+x;out.pixels[index]=value;out.mask[index]=1;any=true;}}if(!any)return {};celClipboard_.clear();frameClipboard_.clear();frameClipboardMetadata_.reset();return out;}
std::optional<SelectionClipboard> Document::copyMergedPixels(){
 // legacy copySelection(true): resolve pending pixels before sampling all visible
 // layers, with selection alpha/mask payload or the entire canvas when absent.
 commitFloatingPaste();const auto bounds=selection_?rectangleSelection(selection_->x,selection_->y,selection_->width,selection_->height,width_,height_):std::optional<SelectionMask>{SelectionMask{0,0,width_,height_,{}}};if(!bounds)return {};
 SelectionClipboard out;out.width=bounds->width;out.height=bounds->height;out.originX=bounds->x;out.originY=bounds->y;out.pixels=compositeNormalRegion(timeline_,activeFrameId_,{bounds->x,bounds->y,bounds->width,bounds->height});out.mask.resize(out.pixels.size());bool any=false;
 for(int y=0;y<out.height;++y)for(int x=0;x<out.width;++x){const auto i=std::size_t(y)*out.width+x;if((!selection_ || selectionContains(selection_,bounds->x+x,bounds->y+y)) && (out.pixels[i]>>24)){out.mask[i]=1;any=true;}else out.pixels[i]=0;}
 if(!any)return {};
 celClipboard_.clear();frameClipboard_.clear();frameClipboardMetadata_.reset();return out;
}
bool Document::commitImmediateTransform(const std::vector<std::string>& ids,const std::optional<SelectionMask>& capture,const SelectionTransform& transform,bool wholeFlip,bool packedFlip,bool horizontal,std::optional<SelectionMask> afterSelection,bool selectionOnly){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);
 auto noPixels=[&](){if(selectionOnly&&!selectionEqual(selection_,afterSelection)){commitSelection(selection_,std::move(afterSelection));return true;}if(!wholeFlip&&!packedFlip&&(transform.flipHorizontal||transform.flipVertical))setSelectionValue(std::move(afterSelection));return false;};
 if(!wholeFlip&&!capture)return noPixels();
 if(capture){const auto count=floatingArea(capture->width,capture->height);raster::coordinate(std::int64_t(capture->x)+capture->width);raster::coordinate(std::int64_t(capture->y)+capture->height);if(!capture->mask.empty()&&capture->mask.size()!=count)throw std::invalid_argument("Invalid transform selection");}
 const auto destination=wholeFlip?SelectionMask{}:checkedFloatingBounds(transform);
 std::vector<ImmediateTransformPlan> plans;plans.reserve(ids.size());std::size_t used=adjustmentStorageBudget(timeline_,1),workspace=0;
 for(const auto& id:ids){const auto r=timeline_.resolveSurface(id);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface)throw std::logic_error("Invalid immediate transform owner");if(std::any_of(plans.begin(),plans.end(),[&](const auto& p){return p.owner==r.source->id;}))continue;raster::validate(*r.surface);
  auto allocation=wholeFlip?ConvolutionSurfacePlan{}:antiAliasSurfacePlan(*r.surface,width_,height_);if(wholeFlip){allocation.geometry.width=r.surface->width;allocation.geometry.height=r.surface->height;}
  floatingAddBytes(used,convolutionSurfaceBytes(*r.surface));floatingAddBytes(used,std::uint64_t(floatingArea(allocation.geometry.width,allocation.geometry.height))*8);
  if(capture){std::size_t scratch=0;floatingAddBytes(scratch,std::uint64_t(floatingArea(capture->width,capture->height))*5);if(!packedFlip)floatingAddBytes(scratch,std::uint64_t(floatingDestinationArea(destination,width_,height_))*192);workspace=std::max(workspace,scratch);}
  plans.push_back({r.source->id,r.surface,std::move(allocation)});
 }
 floatingAddBytes(used,workspace);if(capture)floatingAddBytes(used,capture->mask.size());if(selection_)floatingAddBytes(used,selection_->mask.size());if(afterSelection)floatingAddBytes(used,afterSelection->mask.size());
 Edit edit{{},state_,nextState_};edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.pixelSelectionHistory.pixelSelectionEdit=true;edit.pixelSelectionHistory.beforePixelsSelection=selection_;edit.pixelSelectionHistory.afterPixelsSelection=afterSelection;edit.contentHistory.surfaceChanges.reserve(plans.size());
 std::vector<timeline::Surface> install;install.reserve(plans.size());std::vector<timeline::Surface*> owners;owners.reserve(plans.size());
 for(const auto& p:plans){auto candidate=immediateTransformCandidate(*p.before,capture,transform,wholeFlip,packedFlip,horizontal,width_,height_,pixelFormat_);bool changed=false;
  if(candidate.width==p.before->width&&candidate.height==p.before->height&&candidate.offsetX==p.before->offsetX&&candidate.offsetY==p.before->offsetY)changed=candidate.pixels!=p.before->pixels;
  else for(int y=0;y<candidate.height&&!changed;++y)for(int x=0;x<candidate.width;++x)if(candidate.pixels[std::size_t(y)*candidate.width+x]!=raster::readWorld(*p.before,std::int64_t(candidate.offsetX)+x,std::int64_t(candidate.offsetY)+y)){changed=true;break;}
  if(!changed)continue;edit.contentHistory.surfaceChanges.push_back({p.owner,*p.before,candidate});install.push_back(std::move(candidate));
 }
 if(edit.contentHistory.surfaceChanges.empty())return noPixels();
 for(const auto& change:edit.contentHistory.surfaceChanges){auto* live=timeline_.mutableOwnedSurface(change.ownerId);if(!live)throw std::logic_error("Missing immediate transform owner");owners.push_back(live);}
 reserveHistoryEntries();capturePixelAddresses(edit);for(std::size_t i=0;i<owners.size();++i)std::swap(*owners[i],install[i]);setSelectionValue(std::move(afterSelection));change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"变换选区内容");return true;
}
bool Document::flipPaintCellSelection(bool horizontal){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);
 const auto expanded=expandedPaintCellSelection(true);if(!expanded)return false;const auto resolvedOwner=timeline_.resolveSurface(cel().id);const auto& grid=*resolvedOwner.source->tilemap;
 const auto bytes=std::uint64_t(grid.cells.size())*1024;if(bytes>256*1024*1024-adjustmentStorageBudget(timeline_,1))throw std::length_error("Paint cell flip exceeds document budget");
 std::set<std::size_t> selected;int left=grid.columns,right=-1,top=grid.rows,bottom=-1;for(std::size_t i=0;i<grid.cells.size();++i){const int x=int(i%grid.columns),y=int(i/grid.columns);if(selectionContains(expanded,activeSurface().offsetX+x*grid.tileWidth,activeSurface().offsetY+y*grid.tileHeight)){selected.insert(i);left=std::min(left,x);right=std::max(right,x);top=std::min(top,y);bottom=std::max(bottom,y);}}
 auto mirrored=[&](const std::optional<tiles::Cell>& cell){return mirroredTimelineTilemapCell(cell,horizontal,grid.tileWidth,grid.tileHeight);};
 TilemapPixelHistory payload;payload.celId=resolvedOwner.source->id;payload.tilesetEdit=false;payload.independentCellOwner=true;payload.cellOffsetLayout=true;payload.linkedCellOwner=true;payload.beforeSet.id=layer().tilemapTilesetId;for(const auto i:selected){const int x=int(i%grid.columns),y=int(i/grid.columns);const auto target=std::size_t(horizontal?y:top+bottom-y)*grid.columns+std::size_t(horizontal?left+right-x:x);if(!selected.count(target))continue;const auto value=mirrored(grid.cells[i]);if(value!=grid.cells[target])payload.cells.push_back({target,grid.cells[target],value});}
 auto after=selection_;if(after&&!after->mask.empty()){auto source=after->mask;for(int y=0;y<after->height;++y)for(int x=0;x<after->width;++x)after->mask[std::size_t(y)*after->width+x]=source[std::size_t(horizontal?y:after->height-1-y)*after->width+(horizontal?after->width-1-x:x)];}
 if(payload.cells.empty()){setSelectionValue(std::move(after));return false;}
 Edit edit{{},state_,nextState_};edit.terminalHistory=std::make_shared<const TilemapPixelHistory>(std::move(payload));edit.tileHistory.beforeTileSelection=edit.tileHistory.afterTileSelection=tileSelection_;edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeFrameAnchor=edit.afterFrameAnchor=frameAnchor_;edit.layerHistory.beforeGroupUi=edit.layerHistory.afterGroupUi=GroupUiSnapshot{selectedGroupIds_,collapsedGroupIds_,selectedGroupId_};
 // legacy Paint flip history contains cell edits only; the flipped mask stays through Undo/Redo.
 const auto label=horizontal?U"水平翻转瓦片选区":U"垂直翻转瓦片选区";reserveHistoryEntries();edit.label.reserve(32);applyEdit(edit,true);setSelectionValue(std::move(after));change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),label);return true;
}
bool Document::flipContent(bool horizontal){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);
 // Whole-Cel timeline edits take precedence over the active layer type, but
 // an explicit free-instance pick still owns its existing narrower command.
 if((hasTilemapContent()||hasFreeTileContent())&&!selection_&&!floating_&&activeMaskId_.empty()&&!(layer().kind=="free-tile"&&!selectedFreeTileInstances().empty())){
  const auto targets=timelineContentFlipTargets(*this);if(targets.empty())return false;
  Edit edit{{},state_,nextState_};edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.beforeFrameAnchor=edit.afterFrameAnchor=frameAnchor_;edit.layerHistory.beforeGroupUi=edit.layerHistory.afterGroupUi=GroupUiSnapshot{selectedGroupIds_,collapsedGroupIds_,selectedGroupId_};
  std::size_t used=adjustmentStorageBudget(timeline_,1);
  for(const auto& id:targets){const auto* source=timeline_.findCelById(id);const auto owner=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==source->layerId;});const auto& surface=*source->surface;raster::validate(surface);
   floatingAddBytes(used,std::uint64_t(surface.pixels.size())*sizeof(Pixel)*3);
   Edit child{{},state_,nextState_};
   if(owner->kind=="free-tile"){
    floatingAddBytes(used,std::uint64_t(source->freeTiles->instances.size())*sizeof(free_tiles::Instance)*3);auto after=*source;for(auto& i:after.freeTiles->instances)if(!i.locked){if(horizontal)i.flipHorizontal=!i.flipHorizontal;else i.flipVertical=!i.flipVertical;}if(after.freeTiles==source->freeTiles)continue;
    after.surface->pixels=free_tiles::render(*owner->freeTiles,*after.freeTiles,timeline_.state().tilesets,surface.width,surface.height);child.contentHistory.beforeCels={*source};child.contentHistory.afterCels={std::move(after)};
   }else if(owner->kind=="tilemap"){
    const auto& grid=*source->tilemap;floatingAddBytes(used,std::uint64_t(grid.cells.size())*1024);auto after=*source;for(int y=0;y<grid.rows;++y)for(int x=0;x<grid.columns;++x)after.tilemap->cells[std::size_t(y)*grid.columns+x]=mirroredTimelineTilemapCell(grid.cells[std::size_t(horizontal?y:grid.rows-1-y)*grid.columns+(horizontal?grid.columns-1-x:x)],horizontal,grid.tileWidth,grid.tileHeight);if(after.tilemap->cells==grid.cells)continue;
    const auto rendered=tiles::render(*after.tilemap,timeline_.state().tilesets);std::vector<Pixel> cache(surface.pixels.size());const int width=grid.columns*grid.tileWidth,height=grid.rows*grid.tileHeight;for(int y=0;y<std::min(surface.height,height);++y)std::copy_n(rendered.begin()+std::size_t(y)*width,std::min(surface.width,width),cache.begin()+std::size_t(y)*surface.width);after.surface->pixels=std::move(cache);child.contentHistory.beforeCels={*source};child.contentHistory.afterCels={std::move(after)};
   }else if(owner->kind.empty()){
    child.contentHistory.targetCelId=id;child.contentHistory.pixelAddress=PixelAddressSpace{surface.width,surface.height,surface.storageOriginX.value_or(0),surface.storageOriginY.value_or(0)};
    for(int y=0;y<surface.height;++y)for(int x=0;x<surface.width;++x){const auto at=std::size_t(y)*surface.width+x,from=std::size_t(horizontal?y:surface.height-1-y)*surface.width+(horizontal?surface.width-1-x:x);const auto value=at==from?surface.pixels[from]:normalizeCanvasPacked(surface.pixels[from]);if(surface.pixels[at]!=value){floatingAddBytes(used,sizeof(Delta));child.pixels.push_back({at,surface.pixels[at],value});}}
    if(child.pixels.empty())continue;
   }else continue;
   edit.children.push_back(std::move(child));
  }
  if(edit.children.empty())return false;reserveHistoryEntries();capturePixelAddresses(edit);change_={};try{applyEdit(edit,true);}catch(...){applyEdit(edit,false);throw;}change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),horizontal?U"水平翻转选区":U"垂直翻转选区");return true;
 }
 if(layer().kind=="free-tile"&&activeMaskId_.empty())return flipFreeTileContent(horizontal);if(!activeMaskId_.empty()&&!floating_)return selection_?transformMaskImmediate(true,horizontal,0):false;if(!floating_&&layer().kind=="tilemap"&&activeMaskId_.empty()&&tileSelection_.mode==tiles::Mode::Paint)return flipPaintCellSelection(horizontal);if(activeMaskId_.empty()&&!floating_&&!layer().kind.empty()&&(hasTilemapContent()||hasFreeTileContent()))return false;
 const auto commandLayers=selectedLayerIdsWithGroups();
 if(floating_){
  auto& f=*floating_;std::size_t extra=0;for(const auto& target:f.targets){floatingAddBytes(extra,std::uint64_t(target.source.pixels.size())*5);if(!target.originalSource)floatingAddBytes(extra,std::uint64_t(target.source.pixels.size())*5);}floatingAddBytes(extra,std::uint64_t(f.source.pixels.size())*5);checkFloatingBudget(f,extra);
  struct Flip{SelectionClipboard source;std::optional<SelectionClipboard> original;bool addOriginal=false;std::shared_ptr<SelectionRotSpriteSource> previousSampler;};std::vector<Flip> candidates;candidates.reserve(f.targets.size());
  for(const auto& target:f.targets){Flip candidate;candidate.source=target.source;if(!target.originalSource){candidate.original=target.source;candidate.addOriginal=true;}const auto& before=target.source;
   for(int y=0;y<before.height;++y)for(int x=0;x<before.width;++x){const auto dst=std::size_t(y)*before.width+x,src=std::size_t(horizontal?y:before.height-1-y)*before.width+(horizontal?before.width-1-x:x);candidate.source.pixels[dst]=before.pixels[src];candidate.source.mask[dst]=before.mask[src];}candidates.push_back(std::move(candidate));}
  if(candidates.empty()){
   auto source=f.source;for(int y=0;y<source.height;++y)for(int x=0;x<source.width;++x){const auto dst=std::size_t(y)*source.width+x,src=std::size_t(horizontal?y:source.height-1-y)*source.width+(horizontal?source.width-1-x:x);source.mask[dst]=f.source.mask[src];}std::swap(source,f.source);try{transformFloatingPaste(f.transform,f.rotSprite);}catch(...){std::swap(source,f.source);throw;}return true;
  }
  auto primary=candidates.front().source;
  for(std::size_t i=0;i<candidates.size();++i){auto& target=f.targets[i];auto& candidate=candidates[i];std::swap(target.source,candidate.source);if(candidate.addOriginal)target.originalSource.swap(candidate.original);candidate.previousSampler=std::move(target.rotSprite);}
  std::swap(f.source,primary);const auto oldTransient=f.transientBytes;f.transientBytes=extra;
  try{transformFloatingPaste(f.transform,f.rotSprite);f.transientBytes=oldTransient;}
  catch(...){f.transientBytes=oldTransient;std::swap(f.source,primary);for(std::size_t i=0;i<candidates.size();++i){auto& target=f.targets[i];auto& candidate=candidates[i];std::swap(target.source,candidate.source);if(candidate.addOriginal)target.originalSource.swap(candidate.original);target.rotSprite=std::move(candidate.previousSampler);}throw;}
  return true;
 }
 if(!floating_&&timelineSelection_.cels.empty()&&selectedFrames_.empty()&&commandLayers.size()<=1&&layerEffectivelyLocked(layer()))return false;
 cancelStroke();const bool whole=!selection_;const bool animationSelection=bool(selection_) && (!timelineSelection_.cels.empty() || !selectedFrames_.empty());const bool explicitTimeline=!timelineSelection_.cels.empty() || !commandLayers.empty() || !selectedFrames_.empty();
 std::vector<const DocumentCel*> targets;
 if(!timelineSelection_.cels.empty()){for(const auto& id:timelineSelection_.cels)if(const auto* c=timeline_.findCelById(id))targets.push_back(c);}
 else{
  auto frames=selectedFrames_;if(frames.empty()){if(whole && !commandLayers.empty())for(const auto& f:timeline_.state().frames)frames.push_back(f.id);else frames.push_back(activeFrameId_);}
  for(const auto& l:timeline_.state().layers){if(!commandLayers.empty()){if(std::find(commandLayers.begin(),commandLayers.end(),l.id)==commandLayers.end())continue;}else if(selectedFrames_.empty() && l.id!=activeLayerId_)continue;else if(!selectedFrames_.empty() && (layerEffectivelyLocked(l) || !layerEffectivelyVisible(l)))continue;for(const auto& id:frames)if(const auto* c=timeline_.findCel(l.id,id))targets.push_back(c);}
 }
 auto owner=[&](const auto* c)->const DocumentLayer&{return *std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==c->layerId;});};
 if(!whole)for(const auto* c:targets)if(!owner(c).kind.empty())return false;
 if(animationSelection&&targets.empty())return false;
 if(!whole && explicitTimeline)for(const auto* c:targets)if(layerEffectivelyLocked(owner(c)) || !layerEffectivelyVisible(owner(c)))return false;
 auto bounds=selection_.value_or(SelectionMask{0,0,width_,height_,{}});const auto count=floatingArea(bounds.width,bounds.height);raster::coordinate(std::int64_t(bounds.x)+bounds.width);raster::coordinate(std::int64_t(bounds.y)+bounds.height);if(!bounds.mask.empty()&&bounds.mask.size()!=count)throw std::invalid_argument("Invalid flip selection");auto afterMask=selection_;
 if(afterMask && !afterMask->mask.empty())for(int y=0;y<bounds.height;++y)for(int x=0;x<bounds.width;++x)afterMask->mask[std::size_t(y)*bounds.width+x]=bounds.mask[std::size_t(horizontal?y:bounds.height-1-y)*bounds.width+(horizontal?bounds.width-1-x:x)];
 bool sparse=false;for(const auto* c:targets){const auto r=timeline_.resolveSurface(c->id);if(r.surface&&!raster::fullCanvas(*r.surface,width_,height_))sparse=true;}
 const bool edge=selection_&&(selection_->x<0||selection_->y<0||std::int64_t(selection_->x)+selection_->width>width_||std::int64_t(selection_->y)+selection_->height>height_);
 if(sparse||edge){std::vector<std::string> ids;for(const auto* c:targets){const auto& l=owner(c);if(layerEffectivelyLocked(l)||(whole&&explicitTimeline&&!layerEffectivelyVisible(l)))continue;ids.push_back(c->id);}
  std::optional<SelectionMask> capture;if(selection_){capture=rectangleSelection(selection_->x,selection_->y,selection_->width,selection_->height,width_,height_);if(capture&&!selection_->mask.empty()){capture->mask.resize(std::size_t(capture->width)*capture->height);for(int y=0;y<capture->height;++y)for(int x=0;x<capture->width;++x)capture->mask[std::size_t(y)*capture->width+x]=selectionContains(selection_,capture->x+x,capture->y+y)?1:0;}}
  SelectionTransform target{double(bounds.x),double(bounds.y),double(bounds.width),double(bounds.height)};target.flipHorizontal=horizontal;target.flipVertical=!horizontal;
  return commitImmediateTransform(ids,capture,target,whole,!animationSelection,horizontal,std::move(afterMask),!animationSelection);
 }
 Edit edit{{},state_,nextState_};edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.pixelSelectionHistory.pixelSelectionEdit=true;edit.pixelSelectionHistory.beforePixelsSelection=selection_;edit.pixelSelectionHistory.afterPixelsSelection=afterMask;std::unordered_set<std::string> sources;
 for(const auto* c:targets){const auto& l=owner(c);if(layerEffectivelyLocked(l) || (whole && explicitTimeline && !layerEffectivelyVisible(l)))continue;const auto resolved=timeline_.resolveSurface(c->id);if(!resolved.source || !resolved.surface || !sources.insert(timeline_.linkedStorageKey(resolved.source->id)).second)continue;const auto& before=resolved.surface->pixels;auto after=before;
  for(int y=0;y<height_;++y)for(int x=0;x<width_;++x)if(selectionContains(bounds,x,y))after[std::size_t(y)*width_+x]=0;
  for(int y=0;y<height_;++y)for(int x=0;x<width_;++x){if(!selectionContains(bounds,x,y))continue;const int tx=horizontal?2*bounds.x+bounds.width-1-x:x,ty=horizontal?y:2*bounds.y+bounds.height-1-y;if(tx>=0 && ty>=0 && tx<width_ && ty<height_){const auto value=before[std::size_t(y)*width_+x];auto& destination=after[std::size_t(ty)*width_+tx];if(animationSelection){if(value>>24)destination=normalizeCanvasPacked(selectionContains(bounds,tx,ty)?value:brushComposite(destination,value,100));}else destination=whole&&tx==x&&ty==y?value:normalizeCanvasPacked(value);}}
  Edit child{{},state_,nextState_};child.contentHistory.targetCelId=c->id;for(std::size_t i=0;i<before.size();++i)if(before[i]!=after[i])child.pixels.push_back({i,before[i],after[i]});if(!child.pixels.empty())edit.children.push_back(std::move(child));
 }
 if(edit.children.empty()){if(animationSelection){setSelectionValue(std::move(afterMask));return false;}if(!selectionEqual(selection_,afterMask)){commitSelection(selection_,afterMask);return true;}return false;}
 reserveHistoryEntries();change_={};applyEdit(edit,true);publishChange();pushEdit(std::move(edit),horizontal?U"水平翻转选区":U"垂直翻转选区");return true;
}
bool Document::rotateContent180(){return rotateContent(180);}
bool Document::rotateContent(int angle){if(!activeMaskId_.empty())return transformMaskImmediate(false,false,angle);
 const auto commandLayers=selectedLayerIdsWithGroups();
 if(angle!=180 && angle!=90 && angle!=-90)return false;
 // legacy rotateWorkspaceContent rotates the selected owning layers at the
 // active frame, using one union source rectangle, rather than Cel pairs.
 commitFloatingPaste();cancelStroke();std::unordered_set<std::string> selected(commandLayers.begin(),commandLayers.end());
 for(const auto& id:timelineSelection_.cels)if(const auto* target=timeline_.findCelById(id))selected.insert(target->layerId);
 const bool implicitFrames=!selectedFrames_.empty() && commandLayers.empty();if(selected.empty() && !implicitFrames)selected.insert(activeLayerId_);
 std::vector<const DocumentCel*> targets;
 for(const auto& l:timeline_.state().layers){if(implicitFrames){if(layerEffectivelyLocked(l) || !layerEffectivelyVisible(l))continue;}else if(!selected.count(l.id))continue;if(!l.kind.empty() || layerEffectivelyLocked(l) || !layerEffectivelyVisible(l))return false;if(const auto* target=timeline_.findCel(l.id,activeFrameId_))targets.push_back(target);}
 if(targets.empty())return false;
 auto bounds=selection_;if(!bounds){int left=std::numeric_limits<int>::max(),top=left,right=std::numeric_limits<int>::min(),bottom=right;
  for(const auto* target:targets){const auto r=timeline_.resolveSurface(target->id);if(!r.surface)continue;const auto& source=*r.surface;raster::validate(source);for(int y=0;y<source.height;++y)for(int x=0;x<source.width;++x){if(!(source.pixels[std::size_t(y)*source.width+x]>>24))continue;const int wx=raster::coordinate(std::int64_t(source.offsetX)+x),wy=raster::coordinate(std::int64_t(source.offsetY)+y);left=std::min(left,wx);top=std::min(top,wy);right=std::max(right,wx);bottom=std::max(bottom,wy);}}
  if(right<left)return false;bounds=SelectionMask{left,top,raster::coordinate(std::int64_t(right)-left+1),raster::coordinate(std::int64_t(bottom)-top+1),{}};
 }
 const auto count=floatingArea(bounds->width,bounds->height);raster::coordinate(std::int64_t(bounds->x)+bounds->width);raster::coordinate(std::int64_t(bounds->y)+bounds->height);if(!bounds->mask.empty()&&bounds->mask.size()!=count)throw std::invalid_argument("Invalid rotation selection");
 SelectionTransform checkedRotation{double(bounds->x),double(bounds->y),double(bounds->width),double(bounds->height),double(angle)};const auto checkedBounds=checkedFloatingBounds(checkedRotation);
 if(angle!=180){std::size_t geometryBudget=adjustmentStorageBudget(timeline_,1);floatingAddBytes(geometryBudget,std::uint64_t(count)*10);floatingAddBytes(geometryBudget,std::uint64_t(floatingArea(checkedBounds.width,checkedBounds.height))*192);}
 auto afterSelection=*bounds;if(angle==180 && !bounds->mask.empty())for(int y=0;y<bounds->height;++y)for(int x=0;x<bounds->width;++x)afterSelection.mask[std::size_t(y)*bounds->width+x]=bounds->mask[std::size_t(bounds->height-1-y)*bounds->width+bounds->width-1-x];
 SelectionTransform rotation{double(bounds->x),double(bounds->y),double(bounds->width),double(bounds->height),double(angle)};
 if(angle!=180){SelectionClipboard geometry;geometry.width=bounds->width;geometry.height=bounds->height;geometry.mask=bounds->mask;if(geometry.mask.empty())geometry.mask.assign(std::size_t(geometry.width)*geometry.height,1);geometry.pixels.assign(geometry.mask.size(),0xffffffff);auto transformed=transformedSelectionMask(geometry,rotation);if(!transformed)return false;afterSelection=*transformed;}
 bool sparse=false;std::vector<std::string> ids;ids.reserve(targets.size());for(const auto* target:targets){ids.push_back(target->id);const auto r=timeline_.resolveSurface(target->id);if(r.surface&&!raster::fullCanvas(*r.surface,width_,height_))sparse=true;}
 if(sparse)return commitImmediateTransform(ids,bounds,rotation,false,false,false,std::move(afterSelection),false);
 Edit edit{{},state_,nextState_};edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.pixelSelectionHistory.pixelSelectionEdit=true;edit.pixelSelectionHistory.beforePixelsSelection=selection_;edit.pixelSelectionHistory.afterPixelsSelection=afterSelection;
 std::unordered_set<std::string> sources;
 for(const auto* target:targets){const auto resolved=timeline_.resolveSurface(target->id);if(!resolved.source || !resolved.surface || !sources.insert(timeline_.linkedStorageKey(resolved.source->id)).second)continue;const auto& before=resolved.surface->pixels;auto after=before;
  for(int y=0;y<height_;++y)for(int x=0;x<width_;++x)if(selectionContains(bounds,x,y))after[std::size_t(y)*width_+x]=0;
  if(angle==180){
  for(int y=0;y<height_;++y)for(int x=0;x<width_;++x){if(!selectionContains(bounds,x,y))continue;const auto value=before[std::size_t(y)*width_+x];const int tx=2*bounds->x+bounds->width-1-x,ty=2*bounds->y+bounds->height-1-y;if(!(value>>24) || tx<0 || ty<0 || tx>=width_ || ty>=height_)continue;auto& destination=after[std::size_t(ty)*width_+tx];destination=normalizeCanvasPacked(selectionContains(bounds,tx,ty)?value:brushComposite(destination,value,100));}
  }else{
   SelectionClipboard source;source.width=bounds->width;source.height=bounds->height;source.mask.assign(std::size_t(source.width)*source.height,0);source.pixels.resize(source.mask.size());
   for(int y=0;y<source.height;++y)for(int x=0;x<source.width;++x){int sx=bounds->x+x,sy=bounds->y+y;auto i=std::size_t(y)*source.width+x;if(selectionContains(bounds,sx,sy)){source.mask[i]=1;if(sx>=0 && sy>=0 && sx<width_ && sy<height_)source.pixels[i]=before[std::size_t(sy)*width_+sx];}}
   // legacy packed transform clips destination pixels to canvas while the
   // selection geometry deliberately retains transformed bounds outside it.
   for(auto cell:fastSelectionTransformCells(source,rotation,width_,height_)){if(!(cell.value>>24))continue;auto& destination=after[std::size_t(cell.y)*width_+cell.x];destination=normalizeCanvasPacked(brushComposite(destination,cell.value,100));}
  }
  Edit child{{},state_,nextState_};child.contentHistory.targetCelId=target->id;for(std::size_t i=0;i<before.size();++i)if(before[i]!=after[i])child.pixels.push_back({i,before[i],after[i]});if(!child.pixels.empty())edit.children.push_back(std::move(child));
 }
 if(edit.children.empty())return false;reserveHistoryEntries();change_={};applyEdit(edit,true);publishChange();pushEdit(std::move(edit),U"旋转选区内容");return true;
}
bool Document::centerActiveContent(bool horizontal,bool vertical){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);
 if(!horizontal && !vertical)return false;
 // Legacy centers pending selection geometry before consulting layer pixels.
 if(floating_&&selection_){
  if(layerEffectivelyLocked(layer()))return false;const auto& bounds=*selection_;
  const auto dx=horizontal?std::int64_t(std::floor(width_/2.0-(bounds.x+bounds.width/2.0)+.5)):0;
  const auto dy=vertical?std::int64_t(std::floor(height_/2.0-(bounds.y+bounds.height/2.0)+.5)):0;if(!dx&&!dy)return false;
  auto transform=floating_->transform;transform.x+=dx;transform.y+=dy;if(transform.flipOriginX)*transform.flipOriginX+=dx;if(transform.flipOriginY)*transform.flipOriginY+=dy;if(transform.quad)for(auto& p:*transform.quad){p.x+=dx;p.y+=dy;}transformFloatingPaste(transform,floating_->rotSprite);return true;
 }
 if(activeMaskId_.empty()&&!layer().kind.empty()&&(hasTilemapContent()||hasFreeTileContent()))return false;
 if(!activeMaskId_.empty()){
  if(!maskBrushAvailable())return false;const auto beforeSelection=selection_;auto bounds=selection_;const auto& surface=mutableActiveMask()->surface;
  if(!bounds){int l=surface.width,t=surface.height,r=-1,b=-1;for(int y=0;y<surface.height;++y)for(int x=0;x<surface.width;++x)if(surface.pixels[std::size_t(y)*surface.width+x]>>24){l=std::min(l,x);t=std::min(t,y);r=std::max(r,x);b=std::max(b,y);}if(r<l)return false;bounds=SelectionMask{raster::coordinate(std::int64_t(surface.offsetX)+l),raster::coordinate(std::int64_t(surface.offsetY)+t),r-l+1,b-t+1,{}};}
  const auto dx=horizontal?std::int64_t(std::floor(width_/2.0-(bounds->x+bounds->width/2.0)+.5)):0,dy=vertical?std::int64_t(std::floor(height_/2.0-(bounds->y+bounds->height/2.0)+.5)):0;if(!dx&&!dy)return false;
  SelectionClipboard source;source.width=bounds->width;source.height=bounds->height;const auto count=floatingArea(source.width,source.height);source.mask.resize(count);source.pixels.resize(count);
  for(int y=0;y<source.height;++y)for(int x=0;x<source.width;++x){const auto wx=raster::coordinate(std::int64_t(bounds->x)+x),wy=raster::coordinate(std::int64_t(bounds->y)+y);if(!selectionContains(bounds,wx,wy))continue;const auto i=std::size_t(y)*source.width+x;source.mask[i]=1;source.pixels[i]=raster::readWorld(surface,wx,wy);}
  if(!beginMaskFloating(source,bounds->x,bounds->y,false,false))return false;floating_->beforeSelection=beforeSelection;auto target=floating_->transform;target.x+=dx;target.y+=dy;
  try{transformFloatingPaste(target,false);if(!beforeSelection)setSelectionValue(std::nullopt);return commitFloatingPaste();}catch(...){cancelFloatingPaste();throw;}
 }
 auto bounds=selection_;
 const auto* present=activeSurfaceIfPresent();if(!present)return false;const auto& initial=*present;raster::validate(initial);
 const bool wholeText=!selection_&&layer().kind=="text"&&activeMaskId_.empty();
 if(wholeText){const auto source=timeline_.resolveSurface(cel().id);if(source.source&&source.source->text&&source.source->text->boxed){const auto& text=*source.source->text;bounds=SelectionMask{text.originX.value_or(initial.offsetX),text.originY.value_or(initial.offsetY),text.boxWidth,text.boxHeight,{}};}}
 if(!bounds){int left=initial.width,top=initial.height,right=-1,bottom=-1;for(int y=0;y<initial.height;++y)for(int x=0;x<initial.width;++x)if(initial.pixels[std::size_t(y)*initial.width+x]>>24){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x);bottom=std::max(bottom,y);}if(right<left)return false;bounds=SelectionMask{raster::coordinate(std::int64_t(initial.offsetX)+left),raster::coordinate(std::int64_t(initial.offsetY)+top),right-left+1,bottom-top+1,{}};}
 // Math.round uses ties towards positive infinity, including negative deltas.
 const std::int64_t dx=horizontal?std::int64_t(std::floor(width_/2.0-(bounds->x+bounds->width/2.0)+.5)):0;
 const std::int64_t dy=vertical?std::int64_t(std::floor(height_/2.0-(bounds->y+bounds->height/2.0)+.5)):0;
 if(!dx && !dy)return false;
 if(wholeText)return nudgeTextLayer(raster::coordinate(dx),raster::coordinate(dy));
 if(!raster::fullCanvas(activeSurface(),width_,height_)){
  if(layerEffectivelyLocked(layer()))return false;cancelStroke();const auto resolved=timeline_.resolveSurface(cel().id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.source||!resolved.surface)throw std::logic_error("Invalid center content owner");const auto& before=*resolved.surface;raster::validate(before);
  const auto capture=selection_?selection_:std::optional<SelectionMask>{*bounds};if(!capture)return false;
  const auto l=std::max<std::int64_t>(capture->x,before.offsetX),t=std::max<std::int64_t>(capture->y,before.offsetY),r=std::min<std::int64_t>(std::int64_t(capture->x)+capture->width,std::int64_t(before.offsetX)+before.width),b=std::min<std::int64_t>(std::int64_t(capture->y)+capture->height,std::int64_t(before.offsetY)+before.height);if(r<=l||b<=t)return false;
  Edit edit{{},state_,nextState_};edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.pixelSelectionHistory.pixelSelectionEdit=true;edit.pixelSelectionHistory.beforePixelsSelection=selection_;edit.pixelSelectionHistory.afterPixelsSelection=selection_;if(edit.pixelSelectionHistory.afterPixelsSelection){edit.pixelSelectionHistory.afterPixelsSelection->x=raster::coordinate(std::int64_t(edit.pixelSelectionHistory.afterPixelsSelection->x)+dx);edit.pixelSelectionHistory.afterPixelsSelection->y=raster::coordinate(std::int64_t(edit.pixelSelectionHistory.afterPixelsSelection->y)+dy);}
  if(capture->mask.empty()&&l==before.offsetX&&t==before.offsetY&&r==std::int64_t(before.offsetX)+before.width&&b==std::int64_t(before.offsetY)+before.height){
   const int x=raster::coordinate(std::int64_t(before.offsetX)+dx),y=raster::coordinate(std::int64_t(before.offsetY)+dy);raster::coordinate(std::int64_t(x)+before.width);raster::coordinate(std::int64_t(y)+before.height);edit.contentHistory.ownerOffsets.push_back({resolved.source->id,before.offsetX,before.offsetY,x,y});reserveHistoryEntries();applySurfaceEdit(edit,true);setSelectionValue(edit.pixelSelectionHistory.afterPixelsSelection);change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"移动图层内容");return true;
  }
  raster::Rect64 requested{l+dx,t+dy,r+dx,b+dy};const auto left=std::min<std::int64_t>(before.offsetX,requested.left),top=std::min<std::int64_t>(before.offsetY,requested.top),right=std::max<std::int64_t>(std::int64_t(before.offsetX)+before.width,requested.right),bottom=std::max<std::int64_t>(std::int64_t(before.offsetY)+before.height,requested.bottom);raster::coordinate(left);raster::coordinate(top);raster::coordinate(right);raster::coordinate(bottom);
  std::size_t used=adjustmentStorageBudget(timeline_,1);floatingAddBytes(used,convolutionSurfaceBytes(before)*3);floatingAddBytes(used,std::uint64_t(floatingArea(raster::coordinate(right-left),raster::coordinate(bottom-top)))*sizeof(Pixel)*3);
  auto expanded=raster::expanded(before,requested);auto after=expanded?std::move(*expanded):before;
  for(auto y=t;y<b;++y)for(auto x=l;x<r;++x)if(selectionContains(capture,int(x),int(y)))if(auto index=raster::worldIndex(after,x,y))after.pixels[*index]=0;
  for(auto y=t;y<b;++y)for(auto x=l;x<r;++x){if(!selectionContains(capture,int(x),int(y)))continue;const auto value=raster::readWorld(before,x,y);if(!(value>>24))continue;const auto index=raster::worldIndex(after,x+dx,y+dy);if(index)after.pixels[*index]=brushComposite(after.pixels[*index],value,100);}
  bool changed=false;for(int y=0;y<after.height&&!changed;++y)for(int x=0;x<after.width;++x)if(after.pixels[std::size_t(y)*after.width+x]!=raster::readWorld(before,std::int64_t(after.offsetX)+x,std::int64_t(after.offsetY)+y)){changed=true;break;}if(!changed)return false;
  edit.contentHistory.surfaceChanges.push_back({resolved.source->id,before,std::move(after)});reserveHistoryEntries();applySurfaceEdit(edit,true);setSelectionValue(edit.pixelSelectionHistory.afterPixelsSelection);change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"移动图层内容");return true;
 }
 if(layerEffectivelyLocked(layer()))return false;cancelStroke();const auto before=pixels();auto after=before;
 // legacy centerActiveContent only operates on activePaintLayer here, even
 // when other timeline targets are selected; hidden raster layers are allowed.
 for(int y=0;y<height_;++y)for(int x=0;x<width_;++x)if(selectionContains(bounds,x,y))after[std::size_t(y)*width_+x]=0;
 for(int y=0;y<height_;++y)for(int x=0;x<width_;++x){if(!selectionContains(bounds,x,y))continue;const auto value=before[std::size_t(y)*width_+x];const auto tx=std::int64_t(x)+dx,ty=std::int64_t(y)+dy;if(!(value>>24) || tx<0 || ty<0 || tx>=width_ || ty>=height_)continue;auto& destination=after[std::size_t(ty)*width_+tx];destination=selectionContains(bounds,tx,ty)?value:brushComposite(destination,value,100);}
 Edit edit{{},state_,nextState_};edit.contentHistory.targetCelId=cel().id;for(std::size_t i=0;i<before.size();++i)if(before[i]!=after[i])edit.pixels.push_back({i,before[i],after[i]});if(edit.pixels.empty())return false;
 edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.pixelSelectionHistory.pixelSelectionEdit=true;edit.pixelSelectionHistory.beforePixelsSelection=selection_;edit.pixelSelectionHistory.afterPixelsSelection=selection_;if(edit.pixelSelectionHistory.afterPixelsSelection){edit.pixelSelectionHistory.afterPixelsSelection->x+=dx;edit.pixelSelectionHistory.afterPixelsSelection->y+=dy;}
 reserveHistoryEntries();change_={};applyEdit(edit,true);publishChange();pushEdit(std::move(edit),U"移动图层内容");return true;
}
bool Document::fillSelectionOrCanvas(Pixel color){if(!activeMaskId_.empty()){commitFloatingPaste();return fillAttachedMaskSelection(color);}
 color=normalizeCanvasPacked(color);const auto commandLayers=selectedLayerIdsWithGroups();
 commitFloatingPaste();cancelStroke();
 // Legacy single-target fillForeground edits the active display raster, then
 // syncActiveAnimationLayer creates its missing Cel. Frame proxies skip absences.
 const bool activeOnly=timelineSelection_.cels.size()<=1&&selectedFrames_.size()<=1&&commandLayers.size()<=1;
 if(activeOnly&&!timeline_.findCel(activeLayerId_,activeFrameId_)){
  if(!layer().kind.empty()||layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer()))return false;
  const auto bounds=selection_?rectangleSelection(selection_->x,selection_->y,selection_->width,selection_->height,width_,height_):std::optional<SelectionMask>{SelectionMask{0,0,width_,height_,{}}};if(!bounds||color==0)return false;
  std::size_t changed=0;for(int y=bounds->y;y<bounds->y+bounds->height;++y)for(int x=bounds->x;x<bounds->x+bounds->width;++x)if(!selection_||selectionContains(selection_,x,y))++changed;if(!changed)return false;

  const auto area=std::size_t(bounds->width)*bounds->height;const bool dense=area>=512*512&&(!selection_||selection_->mask.empty()||changed*3>=area);
  std::size_t used=adjustmentStorageBudget(timeline_,1);floatingAddBytes(used,std::uint64_t(width_)*height_*sizeof(Pixel));floatingAddBytes(used,dense?std::uint64_t(area)*sizeof(Pixel)*2:std::uint64_t(changed)*sizeof(Delta));
  Edit edit{{},state_,nextState_};edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.contentHistory.pixelAddress=PixelAddressSpace{width_,height_,0,0};
  timeline::Cel created;created.id="cel-"+activeLayerId_+"-"+activeFrameId_;for(std::size_t suffix=1;timeline_.findCelById(created.id);++suffix)created.id="cel-"+activeLayerId_+"-"+activeFrameId_+"-"+std::to_string(suffix);created.layerId=activeLayerId_;created.frameId=activeFrameId_;created.opacity=layer().opacity;created.surface=timeline::Surface{width_,height_,0,0,{},{},timeline::LinkedPixelStorage(std::vector<Pixel>(std::size_t(width_)*height_))};edit.contentHistory.targetCelId=created.id;
  DensePixels region{bounds->x,bounds->y,bounds->width,bounds->height,{},{}};if(dense){region.before.assign(area,0);region.after.assign(area,0);}else edit.pixels.reserve(changed);
  PixelRegion dirty;for(int y=bounds->y;y<bounds->y+bounds->height;++y)for(int x=bounds->x;x<bounds->x+bounds->width;++x){if(selection_&&!selectionContains(selection_,x,y))continue;const auto index=std::size_t(y)*width_+x;created.surface->pixels[index]=color;if(dense)region.after[std::size_t(y-bounds->y)*bounds->width+x-bounds->x]=color;else edit.pixels.push_back({index,0,color});dirty.include(x,y);}
  if(dense)edit.contentHistory.dense=std::move(region);auto candidate=timeline_.state();const auto preferredOwner=created.id;candidate.cels.push_back(std::move(created));timeline::Timeline prepared(std::move(candidate),preferredOwner);reserveHistoryEntries();auto previous=std::move(timeline_);timeline_=std::move(prepared);try{pushEdit(std::move(edit),selection_?U"填充选区前景色":U"填充画布前景色");}catch(...){timeline_=std::move(previous);throw;}change_=dirty;publishChange();return true;
 }
 std::vector<const DocumentCel*> targets;
 if(!timelineSelection_.cels.empty()){
  for(const auto& id:timelineSelection_.cels)if(const auto* target=timeline_.findCelById(id))targets.push_back(target);
 }else{
  auto frames=selectedFrames_.empty()?std::vector<std::string>{frame().id}:selectedFrames_;
  for(const auto& frameId:frames)for(const auto& l:timeline_.state().layers){
   const bool explicitLayers=!commandLayers.empty();
   if(explicitLayers){if(std::find(commandLayers.begin(),commandLayers.end(),l.id)==commandLayers.end())continue;}
   else if(selectedFrames_.empty()){if(l.id!=layer().id)continue;}
   else if(layerEffectivelyLocked(l) || !layerEffectivelyVisible(l))continue;
   if(const auto* target=timeline_.findCel(l.id,frameId))targets.push_back(target);
  }
 }
 // legacy fillForeground rejects the entire operation for hidden/locked targets.
 for(const auto* target:targets){const auto owner=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==target->layerId;});if(owner==timeline_.state().layers.end() || !owner->kind.empty() || layerEffectivelyLocked(*owner) || !layerEffectivelyVisible(*owner))return false;}
 const auto bounds=selection_?rectangleSelection(selection_->x,selection_->y,selection_->width,selection_->height,width_,height_):std::optional<SelectionMask>{SelectionMask{0,0,width_,height_,{}}};if(!bounds)return false;
 const auto area=std::size_t(bounds->width)*bounds->height;bool dense=area>=512*512;
 if(dense && selection_ && !selection_->mask.empty()){std::size_t count=0;for(int y=bounds->y;y<bounds->y+bounds->height;++y)for(int x=bounds->x;x<bounds->x+bounds->width;++x)count+=selectionContains(selection_,x,y);dense=count*3>=area;}
 Edit edit{{},state_,nextState_};std::unordered_set<std::string> sources;
 edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;
 edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeSelection=edit.afterSelection=selectedFrames_;
 std::optional<std::size_t> sparseStaging;
 for(const auto* target:targets){
  const auto resolved=timeline_.resolveSurface(target->id);if(!resolved.source || !resolved.surface || !sources.insert(timeline_.linkedStorageKey(resolved.source->id)).second)continue;
  if(!raster::fullCanvas(*resolved.surface,width_,height_)){
   const auto& source=*resolved.surface;raster::validate(source);if(!sparseStaging)sparseStaging=adjustmentStorageBudget(timeline_,1);floatingAddBytes(*sparseStaging,convolutionSurfaceBytes(source));
   const bool covered=bounds->x>=source.offsetX&&bounds->y>=source.offsetY&&std::int64_t(bounds->x)+bounds->width<=std::int64_t(source.offsetX)+source.width&&std::int64_t(bounds->y)+bounds->height<=std::int64_t(source.offsetY)+source.height;
   const auto padding=selection_?64:0;const raster::Rect64 requested{std::max(0,bounds->x-padding),std::max(0,bounds->y-padding),std::min<std::int64_t>(width_,std::int64_t(bounds->x)+bounds->width+padding),std::min<std::int64_t>(height_,std::int64_t(bounds->y)+bounds->height+padding)};
   auto expansion=covered?std::optional<timeline::Surface>{}:raster::expanded(source,requested,(adjustmentByteLimit-*sparseStaging)/2);auto after=expansion?std::move(*expansion):source;floatingAddBytes(*sparseStaging,convolutionSurfaceBytes(after)*2);bool changed=false;
   for(int y=bounds->y;y<bounds->y+bounds->height;++y)for(int x=bounds->x;x<bounds->x+bounds->width;++x){if(selection_&&!selectionContains(selection_,x,y))continue;const auto index=raster::worldIndex(after,x,y);if(!index)continue;changed|=after.pixels[*index]!=color;after.pixels[*index]=color;}
   if(changed){Edit child{{},state_,nextState_};child.contentHistory.surfaceChanges.push_back({resolved.source->id,source,std::move(after)});edit.children.push_back(std::move(child));}continue;
  }
  Edit child{{},state_,nextState_};child.contentHistory.targetCelId=target->id;bool changed=false;
  DensePixels region{bounds->x,bounds->y,bounds->width,bounds->height,{},{}};if(dense){region.before.reserve(area);region.after.reserve(area);}
  for(int y=bounds->y;y<bounds->y+bounds->height;++y)for(int x=bounds->x;x<bounds->x+bounds->width;++x){
   const auto index=std::size_t(y)*width_+x;const auto before=resolved.surface->pixels[index];const auto after=(!selection_ || selectionContains(selection_,x,y))?color:before;
   if(dense){region.before.push_back(before);region.after.push_back(after);}else if(before!=after)child.pixels.push_back({index,before,after});changed|=before!=after;
  }
  if(changed){if(dense)child.contentHistory.dense=std::move(region);edit.children.push_back(std::move(child));}
 }
 if(edit.children.empty())return false;
 reserveHistoryEntries();change_={};applyEdit(edit,true);publishChange();pushEdit(std::move(edit),selection_?U"填充选区前景色":U"填充画布前景色");return true;
}
bool Document::deleteSelectedPixels(){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);if(floating_&&floating_->clipboard){cancelFloatingPaste();return true;}if(floating_&&floating_->freeTile)commitFloatingPaste();if(!activeMaskId_.empty())return deleteMaskSelection();if(layer().kind=="free-tile"){
 // Legacy deleteFreeTileSourceSelectionInSession clears the primary shared
 // source in instance world coordinates; never erase a derived Cel cache.
 if(active()||!selection_||!activeMaskId_.empty()||layer().kind!="free-tile"||freeTilePaintMode()||!layer().freeTiles||!freeTileCel().freeTiles||!freeTileCel().surface||layerEffectivelyLocked(layer()))return false;
 const auto primary=primaryFreeTileInstance();const auto instance=std::find_if(freeTileCel().freeTiles->instances.begin(),freeTileCel().freeTiles->instances.end(),[&](const auto& i){return i.id==primary;});if(instance==freeTileCel().freeTiles->instances.end()||!instance->visible||instance->locked)return false;
 const auto& sourceId=instance->sourceId.empty()?instance->tileId:instance->sourceId;const auto source=std::find_if(layer().freeTiles->sources.begin(),layer().freeTiles->sources.end(),[&](const auto& s){return s.id==sourceId||s.tilesetId==sourceId;});if(source==layer().freeTiles->sources.end()||!source->visible||source->locked)return false;
 const auto resource=std::find_if(timeline_.state().tilesets.begin(),timeline_.state().tilesets.end(),[&](const auto& t){return t.id==source->tilesetId;});if(resource==timeline_.state().tilesets.end())return false;
 const auto pixels=tiles::readTile(*resource,0);const Point anchor{freeTileCel().surface->offsetX+instance->x,freeTileCel().surface->offsetY+instance->y};PixelRegion content;
 for(int y=0;y<resource->tileHeight;++y)for(int x=0;x<resource->tileWidth;++x)if(pixels[std::size_t(y)*resource->tileWidth+x]>>24){auto q=free_tiles::transform(*instance,x+source->offsetX,y+source->offsetY);content.include(q.first+anchor.x,q.second+anchor.y);}if(content.empty())return false;
 SelectionClipboard clear;clear.width=content.w;clear.height=content.h;clear.pixels.resize(std::size_t(content.w)*content.h);clear.mask.resize(clear.pixels.size());bool changed=false;
 for(int y=0;y<resource->tileHeight;++y)for(int x=0;x<resource->tileWidth;++x){auto q=free_tiles::transform(*instance,x+source->offsetX,y+source->offsetY);const int px=q.first+anchor.x,py=q.second+anchor.y;if(px<content.x||py<content.y||px>=content.x+content.w||py>=content.y+content.h||!selectionContains(selection_,px,py))continue;clear.mask[std::size_t(py-content.y)*content.w+px-content.x]=1;changed=changed||pixels[std::size_t(y)*resource->tileWidth+x]!=0;}if(!changed)return false;
 // Reuse the image-paste source adapter in an isolated candidate; source delete
 // preserves instance/source selection instead of applying paste session changes.
 Document draft(1,1);draft.width_=width_;draft.height_=height_;draft.timeline_=timeline_;draft.activeLayerId_=activeLayerId_;draft.activeFrameId_=activeFrameId_;draft.tileSelection_=tileSelection_;draft.freeInstanceSelected_=freeInstanceSelected_;draft.freeInstancePrimary_=freeInstancePrimary_;draft.freeInstanceAnchor_=freeInstanceAnchor_;draft.freeInstanceSelectionFrame_=freeInstanceSelectionFrame_;draft.freeInstanceViewLayer_=freeInstanceViewLayer_;
 if(!draft.pasteFreeTilePixels(clear,{content.x,content.y})||draft.historyPosition()==0)return false;
 Edit edit{{},state_,nextState_};edit.snapshotHistory.beforeTimeline=timeline_.state();edit.snapshotHistory.afterTimeline=std::move(draft.timeline_.state_);edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;reserveHistoryEntries();applyEdit(edit,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"删除选区");setSelectionValue(std::nullopt);return true;
 }if(!activeMaskId_.empty())return deleteMaskSelection();
 // legacy deleteSelection resolves selection-origin pending pixels first; clipboard-origin cancels.
 // Frozen tile modes share legacy copy/cancel/commit routing; Paint pixel deletion remains refused.
 if(floating_&&floating_->tilemap&&(tileSelection_.mode!=floating_->tilemapMode||(floating_->tilemapMode!=tiles::Mode::Create&&floating_->tilemapMode!=tiles::Mode::Edit&&floating_->tilemapMode!=tiles::Mode::Hybrid&&floating_->tilemapMode!=tiles::Mode::Paint)))return false;
 const auto commandLayers=selectedLayerIdsWithGroups();
 bool multiple=commandLayers.size()>1||selectedFrames_.size()>1||timelineSelection_.cels.size()>1;
 if(!selectedFrames_.empty()&&commandLayers.empty()){int editable=0;for(const auto& l:timeline_.state().layers)if(l.kind.empty()&&layerEffectivelyVisible(l)&&!layerEffectivelyLocked(l))++editable;multiple=multiple||editable>1;}
 if(floating_){if(floating_->clipboard){cancelFloatingPaste();return true;}commitFloatingPaste();}
 if(layer().kind=="tilemap"&&!multiple)return deleteTilemapSelectionPixels();
 if(!selection_)return false;cancelStroke();
 const auto clamped=rectangleSelection(selection_->x,selection_->y,selection_->width,selection_->height,width_,height_);
 if(!clamped)return false;
 // legacy deleteSelection / selectedEffectTargets: exact Cel keys take
 // precedence, shared pixels once, locked targets skipped, hidden Cels allowed.
 std::vector<const DocumentCel*> targets;
 if(!timelineSelection_.cels.empty()){
  for(const auto& id:timelineSelection_.cels)if(const auto* target=timeline_.findCelById(id))targets.push_back(target);
 }else{
  auto frames=selectedFrames_.empty()?std::vector<std::string>{frame().id}:selectedFrames_;
  for(const auto& frameId:frames)for(const auto& l:timeline_.state().layers){
   const bool explicitLayers=!commandLayers.empty();
   if(explicitLayers){if(std::find(commandLayers.begin(),commandLayers.end(),l.id)==commandLayers.end())continue;}
   else if(selectedFrames_.empty()){if(l.id!=layer().id)continue;}
   else if(layerEffectivelyLocked(l) || !layerEffectivelyVisible(l))continue;
   if(const auto* target=timeline_.findCel(l.id,frameId))targets.push_back(target);
  }
 }
 Edit edit{{},state_,nextState_};std::unordered_set<std::string> sources;
 edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;
 edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;
 edit.beforeSelection=edit.afterSelection=selectedFrames_;
 edit.pixelSelectionHistory.pixelSelectionEdit=true;edit.pixelSelectionHistory.beforePixelsSelection=selection_;
 for(const auto* target:targets){
  const auto owner=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==target->layerId;});
  if(owner==timeline_.state().layers.end() || !owner->kind.empty() || layerEffectivelyLocked(*owner))continue;
  const auto resolved=timeline_.resolveSurface(target->id);if(!resolved.source || !resolved.surface || !sources.insert(timeline_.linkedStorageKey(resolved.source->id)).second)continue;
  const auto& source=*resolved.surface;raster::validate(source);
  // Legacy clearSelection uses the owner's alpha content bounds. Hidden RGB
  // inside that box is cleared; hidden RGB outside it is retained.
  int minX=source.width,minY=source.height,maxX=-1,maxY=-1;
  for(int y=0;y<source.height;++y){
   const auto row=std::size_t(y)*source.width;int left=0;
   while(left<source.width && !(source.pixels[row+left]>>24))++left;
   if(left==source.width)continue;
   minX=std::min(minX,left);minY=std::min(minY,y);maxY=y;
   int right=source.width-1;
   while(right>maxX && right>left && !(source.pixels[row+right]>>24))--right;
   maxX=std::max(maxX,right);
  }
  if(maxX<minX || maxY<minY)continue;
  const auto left=std::max<std::int64_t>(clamped->x,std::int64_t(source.offsetX)+minX);
  const auto top=std::max<std::int64_t>(clamped->y,std::int64_t(source.offsetY)+minY);
  const auto right=std::min<std::int64_t>(std::int64_t(clamped->x)+clamped->width,std::int64_t(source.offsetX)+maxX+1);
  const auto bottom=std::min<std::int64_t>(std::int64_t(clamped->y)+clamped->height,std::int64_t(source.offsetY)+maxY+1);
  if(right<=left || bottom<=top)continue;
  Edit child{{},state_,nextState_};child.contentHistory.targetCelId=target->id;
  child.contentHistory.pixelAddress=PixelAddressSpace{source.width,source.height,source.storageOriginX.value_or(0),source.storageOriginY.value_or(0)};
  for(auto y=top;y<bottom;++y)for(auto x=left;x<right;++x){
   if(!selectionContains(selection_,int(x),int(y)))continue;
   const auto index=std::size_t(y-source.offsetY)*source.width+std::size_t(x-source.offsetX);
   const auto value=source.pixels[index];if(value!=0)child.pixels.push_back({index,value,0});
  }
  if(!child.pixels.empty())edit.children.push_back(std::move(child));
 }
 if(edit.children.empty())return false;
 reserveHistoryEntries();change_={};applyEdit(edit,true);publishChange();pushEdit(std::move(edit),U"删除选区");return true;
}
bool Document::cutPixels(std::optional<SelectionClipboard>& clipboard){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);const bool freeSource=layer().kind=="free-tile"&&activeMaskId_.empty(),clipboardFloating=floating_&&floating_->clipboard;if(activeMaskId_.empty()&&!clipboardFloating&&hasFreeTileContent()&&!freeSource&&!layer().kind.empty()&&layer().kind!="tilemap")return false;if(activeMaskId_.empty()&&!clipboardFloating&&hasTilemapContent()&&!freeSource&&!layer().kind.empty()&&!tilemapSelectionCutAvailable())return false;if(!selection_)return false;clipboard=copyPixels();const bool deleteOriginal=!floating_ || (!floating_->clipboard && !floating_->copy);if(floating_)cancelFloatingPaste();if(deleteOriginal)deleteSelectedPixels();setSelectionValue(std::nullopt);return bool(clipboard);}
bool Document::floatingSymmetryRotation(const FloatingPaste& f,const SelectionTransform& t)const{return (f.symmetryRotation||f.symmetryShear)&&f.beforeSelection&&!f.clipboard&&!f.tilemap&&f.maskId.empty()&&symmetryHas(f.symmetryAxes)&&(f.symmetryShear||(t.shearX==0&&t.shearY==0))&&!t.quad;}
void Document::configureSymmetryContentRotation(FloatingPaste& f){
 f.symmetryShear=false;f.symmetryRotation=false;if(f.clipboard||f.tilemap||!f.maskId.empty()||!f.beforeSelection)return;f.symmetryRotation=symmetryHas(symmetryAxes);f.symmetryScale=false;f.symmetryAxes=symmetryAxes;f.symmetryCenter=symmetryCenter();for(auto& target:f.targets)target.symmetryRotation.reset();
}
void Document::configureSymmetryContentShear(FloatingPaste& f){configureSymmetryContentRotation(f);f.symmetryShear=f.symmetryRotation;f.symmetryRotation=false;}
bool Document::floatingSymmetryScale(const FloatingPaste& f,const SelectionTransform& t)const{return f.symmetryScale&&f.beforeSelection&&!f.clipboard&&!f.tilemap&&f.maskId.empty()&&symmetryHas(f.symmetryAxes)&&t.angle==0&&t.shearX==0&&t.shearY==0&&!t.quad;}
bool Document::floatingSymmetryTranslation(const FloatingPaste& f,const SelectionTransform& t)const{return !f.symmetryShear&&!f.symmetryRotation&&!f.symmetryScale&&f.symmetryStart&&f.beforeSelection&&!f.clipboard&&!f.tilemap&&f.maskId.empty()&&symmetryHas(f.symmetryAxes)&&floatingTranslation(t,f.source);}
void Document::configureSymmetryContentDrag(FloatingPaste& f,Point start){
 f.symmetryScale=false;f.symmetryRotation=false;f.symmetryShear=false;
 if(f.clipboard||f.tilemap||!f.maskId.empty()||!f.beforeSelection||!floatingTranslation(f.transform,f.source)||!symmetryHas(symmetryAxes))return;
 f.symmetryStart=SymmetryPixel{start.x-int(f.transform.x)+f.sourceX,start.y-int(f.transform.y)+f.sourceY};f.symmetryAxes=symmetryAxes;f.symmetryCenter=symmetryCenter();
}
Point Document::symmetryContentDragDelta(Point delta)const{
 if(!floating_)return delta;const auto& f=*floating_;if(f.freeTile&&f.symmetryStart&&f.beforeSelection){const auto out=symmetrySelectionDragDelta(*f.beforeSelection,*f.symmetryStart,{delta.x,delta.y},width_,height_,f.symmetryAxes,f.symmetryCenter);return {out.x,out.y};}if(!floatingSymmetryTranslation(f,f.transform))return delta;const auto out=symmetrySelectionDragDelta(*f.beforeSelection,*f.symmetryStart,{delta.x,delta.y},width_,height_,f.symmetryAxes,f.symmetryCenter);return {out.x,out.y};
}
bool Document::supportsDeferredFloating(const FloatingPaste& f)const{
 if((f.tilemap&&f.tilemapMode==tiles::Mode::Edit)||f.beforeCelTimeline||f.targets.size()!=1)return false;
 if(!deferredFloatingDisplaySupported_)return false;
 const auto* target=timeline_.findCelById(f.targets.front().celId);if(!target||target->frameId!=activeFrameId_)return false;
 const auto targetLayer=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==target->layerId;});if(targetLayer==timeline_.state().layers.end()||timeline::styleVisible(targetLayer->layerStyles))return false;
 // legacy canvas-composite-cache-selection.ts rejects styled target layers
 // before either clipboard or selection-composite optimization is attempted.
 if(f.clipboard)return std::uint64_t(f.source.width)*f.source.height>256*256;
 if(std::max(std::uint64_t(width_)*height_,std::uint64_t(f.source.width)*f.source.height)<=256*256)return false;
 bool contains=false;
 for(const auto& l:timeline_.state().layers){if(!layerEffectivelyVisible(l)||frameCelOpacity(timeline_,l,activeFrameId_)<=0)continue;const auto* c=timeline_.findCel(l.id,activeFrameId_);if(!c)continue;const auto r=timeline_.resolveSurface(c->id);if(!r.surface)return false;const bool empty=std::none_of(r.surface->pixels.begin(),r.surface->pixels.end(),[](Pixel p){return (p>>24)!=0;});if(empty)continue;if(l.blendMode!="normal")return false;if(l.id==target->layerId)contains=true;}
 return contains;
}
void Document::noteFloatingOverlayChange(const FloatingPaste& f,const SelectionTransform& before,const SelectionTransform& after){
 f.hybridPatch.reset();floatingOverlayChange_={};std::vector<SelectionMask> footprints;bool collectFootprints=f.tilemap&&f.tilemapMode==tiles::Mode::Hybrid;auto include=[&](const SelectionMask& b){const auto l=std::max<std::int64_t>(0,b.x),t=std::max<std::int64_t>(0,b.y),r=std::min<std::int64_t>(width_,std::int64_t(b.x)+b.width),bottom=std::min<std::int64_t>(height_,std::int64_t(b.y)+b.height);if(r>l&&bottom>t){if(collectFootprints)footprints.push_back({int(l),int(t),int(r-l),int(bottom-t),{}});floatingOverlayChange_.include(int(l),int(t));floatingOverlayChange_.include(int(r-1),int(bottom-1));}};
 if(floatingSymmetryTranslation(f,before)||floatingSymmetryScale(f,before)||floatingSymmetryRotation(f,before)){if(auto mask=floatingSelectionMask(f,before))include(*mask);}else include(checkedFloatingBounds(before));if(floatingSymmetryTranslation(f,after)||floatingSymmetryScale(f,after)||floatingSymmetryRotation(f,after)){if(auto mask=floatingSelectionMask(f,after))include(*mask);}else include(checkedFloatingBounds(after));if(floatingRepeat_!=repeat::Mode::Off){for(const auto& t:{before,after})if(floatingTranslation(t,f.source))if(auto wrapped=repeat::wrapSelection(checkedFloatingBounds(t),width_,height_,floatingRepeat_))include(*wrapped);}if(!f.clipboard&&!f.copy)include({f.sourceX,f.sourceY,f.source.width,f.source.height,{}});
 if(f.tilemap&&f.tilemapMode==tiles::Mode::Hybrid){const auto resolved=timeline_.resolveSurface(f.targets.front().celId);if(!resolved.surface||!resolved.source||!resolved.source->tilemap)throw std::logic_error("Missing Hybrid dirty owner");const auto& grid=*resolved.source->tilemap;const auto ox=resolved.surface->offsetX,oy=resolved.surface->offsetY;std::set<std::string> affected;
  // Legacy previewTilemapSelectionMove changes cell refs, not shared source pixels.
  auto cellMove=[&](const SelectionTransform& t){if(!f.beforeSelection||!f.beforeSelection->mask.empty()||f.targets.front().originalSource||!floatingTranslation(t,f.source))return false;const auto& sel=*f.beforeSelection;return (std::int64_t(sel.x)-ox)%grid.tileWidth==0&&(std::int64_t(sel.y)-oy)%grid.tileHeight==0&&sel.width%grid.tileWidth==0&&sel.height%grid.tileHeight==0&&(std::int64_t(t.x)-ox)%grid.tileWidth==0&&(std::int64_t(t.y)-oy)%grid.tileHeight==0;};
  const bool refsOnly=cellMove(before)&&cellMove(after);
  collectFootprints=false;const auto originalFootprints=std::move(footprints);for(const auto& bounds:originalFootprints){const auto left=std::max<std::int64_t>(0,std::int64_t(bounds.x)-ox),top=std::max<std::int64_t>(0,std::int64_t(bounds.y)-oy),right=std::min<std::int64_t>(std::int64_t(grid.columns)*grid.tileWidth,std::int64_t(bounds.x)+bounds.width-ox),bottom=std::min<std::int64_t>(std::int64_t(grid.rows)*grid.tileHeight,std::int64_t(bounds.y)+bounds.height-oy);
  if(right>left&&bottom>top)for(auto row=top/grid.tileHeight;row<(bottom+grid.tileHeight-1)/grid.tileHeight;++row)for(auto col=left/grid.tileWidth;col<(right+grid.tileWidth-1)/grid.tileWidth;++col){const auto& cell=grid.cells[std::size_t(row)*grid.columns+std::size_t(col)];include({ox+int(col)*grid.tileWidth,oy+int(row)*grid.tileHeight,grid.tileWidth,grid.tileHeight,{}});if(!refsOnly&&cell&&cell->tilesetId==layer().tilemapTilesetId)affected.insert(cell->tileId);}}
  if(!affected.empty())for(std::size_t i=0;i<grid.cells.size();++i){const auto& cell=grid.cells[i];if(cell&&cell->tilesetId==layer().tilemapTilesetId&&affected.count(cell->tileId))include({ox+int(i%grid.columns)*grid.tileWidth,oy+int(i/grid.columns)*grid.tileHeight,grid.tileWidth,grid.tileHeight,{}});}
 }
 ++floatingOverlayRevision_;
}
namespace {
// Snapshot immutable floating storage once per regional render, outside candidate loops.
template<class Floating> std::size_t floatingStorageBudget(const timeline::Timeline& timeline,const Floating& f,const std::optional<SelectionMask>& selection){
 std::size_t used=adjustmentStorageBudget(timeline,1);if(f.hybridPatch)floatingAddBytes(used,f.hybridPatch->bytes);
 auto clipboard=[&](const SelectionClipboard& c){const auto count=floatingArea(c.width,c.height);if(c.pixels.size()!=count||c.mask.size()!=count)throw std::invalid_argument("Invalid floating payload");floatingAddBytes(used,std::uint64_t(count)*5);};
 if(f.source.width>0&&f.source.height>0&&!f.source.pixels.empty())clipboard(f.source);
 if(f.beforeSelection)floatingAddBytes(used,f.beforeSelection->mask.size());if(selection)floatingAddBytes(used,selection->mask.size());
 for(const auto& target:f.targets){clipboard(target.source);if(target.originalSource)clipboard(*target.originalSource);if(target.baseline){raster::validate(*target.baseline);floatingAddBytes(used,convolutionSurfaceBytes(*target.baseline));}floatingAddBytes(used,std::uint64_t(target.preview.size())*128);if(target.symmetryRotation)floatingAddBytes(used,target.symmetryRotation->bytes());if(target.rotSprite)floatingAddBytes(used,std::uint64_t(target.source.pixels.size())*5+12*1024*1024);}
 if(f.beforeCelTimeline)for(const auto& cel:f.beforeCelTimeline->cels)if(cel.surface){raster::validate(*cel.surface);floatingAddBytes(used,convolutionSurfaceBytes(*cel.surface));}
 if(f.beforeMasks)for(const auto& m:*f.beforeMasks)floatingAddBytes(used,convolutionSurfaceBytes(m.mask.surface));
 floatingAddBytes(used,f.transientBytes);return used;
}
}
std::vector<Pixel> Document::floatingOverlayRegion(PixelRegion region,bool rawHybrid)const{
 if(!floatingDeferred())return {};const auto& f=*floating_;const auto& target=f.targets.front();const auto r=timeline_.resolveSurface(target.celId);if(!target.celId.empty()&&(!r.surface||!r.source||(!target.ownerId.empty()&&r.source->id!=target.ownerId)))throw std::logic_error("Floating overlay owner changed");
 auto raw=[&](PixelRegion region){
 const auto& before=target.baseline?*target.baseline:*r.surface;std::vector<Pixel> result(floatingArea(region.w,region.h));const auto& original=target.originalSource?*target.originalSource:target.source;
 for(int y=0;y<region.h;++y)for(int x=0;x<region.w;++x){const auto wx=std::int64_t(region.x)+x,wy=std::int64_t(region.y)+y;auto value=raster::readWorld(before,wx,wy);const auto sx=wx-f.sourceX,sy=wy-f.sourceY;if(!f.clipboard&&!f.copy&&sx>=0&&sy>=0&&sx<original.width&&sy<original.height&&original.mask[std::size_t(sy)*original.width+std::size_t(sx)]==1&&(floatingRepeat_==repeat::Mode::Off||!floatingTranslation(f.transform,f.source)||(original.pixels[std::size_t(sy)*original.width+std::size_t(sx)]>>24)))value=0;result[std::size_t(y)*region.w+x]=value;}
 const auto& source=target.source;
 if(floatingSymmetryTranslation(f,f.transform)){symmetryContentTranslation(source,*f.beforeSelection,*f.symmetryStart,{int(f.transform.x)-f.sourceX,int(f.transform.y)-f.sourceY},width_,height_,f.symmetryAxes,f.symmetryCenter,[&](int x,int y,Pixel pixel){if(x<region.x||y<region.y||x>=region.x+region.w||y>=region.y+region.h)return;auto& value=result[std::size_t(y-region.y)*region.w+x-region.x];value=normalizeCanvasPacked(!f.copy&&selectionContains(f.beforeSelection,x,y)?pixel:brushComposite(raster::readWorld(before,x,y),pixel,100));});}
 else if(floatingSymmetryRotation(f,f.transform)&&target.symmetryRotation){if(!target.symmetryRotation->matches(f.transform,f.rotSprite))throw std::logic_error("Missing immutable symmetry rotation preview");target.symmetryRotation->region(region.x,region.y,region.w,region.h,[&](int x,int y,Pixel pixel){auto& value=result[std::size_t(y-region.y)*region.w+x-region.x];value=normalizeCanvasPacked(!f.copy&&selectionContains(f.beforeSelection,x,y)?pixel:brushComposite(raster::readWorld(before,x,y),pixel,100));});}
 else if(floatingSymmetryScale(f,f.transform)){const SelectionMask clip{region.x,region.y,region.w,region.h,{}};symmetryContentScale(source,*f.beforeSelection,f.transform,width_,height_,f.symmetryAxes,f.symmetryCenter,[&](int x,int y,Pixel pixel){if(x<region.x||y<region.y||x>=region.x+region.w||y>=region.y+region.h)return;auto& value=result[std::size_t(y-region.y)*region.w+x-region.x];value=normalizeCanvasPacked(!f.copy&&selectionContains(f.beforeSelection,x,y)?pixel:brushComposite(raster::readWorld(before,x,y),pixel,100));},false,&clip);}
 else if(floatingRepeat_!=repeat::Mode::Off&&floatingTranslation(f.transform,source)){repeatedFloatingTranslation(source,original,f.sourceX,f.sourceY,f.transform,width_,height_,floatingRepeat_,f.copy||f.clipboard,[&](int x,int y){return raster::readWorld(before,x,y);},[&](int x,int y,Pixel pixel){if(x>=region.x&&y>=region.y&&x<region.x+region.w&&y<region.y+region.h)result[std::size_t(y-region.y)*region.w+x-region.x]=normalizeCanvasPacked(pixel);},&region);}
 else if(floatingTranslation(f.transform,source)){const auto ox=std::int64_t(f.transform.x),oy=std::int64_t(f.transform.y);for(int y=0;y<region.h;++y)for(int x=0;x<region.w;++x){const auto sx=std::int64_t(region.x)+x-ox,sy=std::int64_t(region.y)+y-oy;if(sx<0||sy<0||sx>=source.width||sy>=source.height)continue;const auto i=std::size_t(sy)*source.width+std::size_t(sx);if(source.mask[i]!=1||!(source.pixels[i]>>24))continue;auto& value=result[std::size_t(y)*region.w+x];value=normalizeCanvasPacked(brushComposite(value,source.pixels[i],100));}}
 else{auto transform=f.transform;transform.x-=region.x;transform.y-=region.y;if(transform.flipOriginX)*transform.flipOriginX-=region.x;if(transform.flipOriginY)*transform.flipOriginY-=region.y;if(transform.quad)for(auto& p:*transform.quad){p.x-=region.x;p.y-=region.y;}std::shared_ptr<SelectionRotSpriteSource> sampler=target.rotSprite;if(f.rotSprite&&!sampler)sampler=std::make_shared<SelectionRotSpriteSource>(source);const auto cells=f.rotSprite?rotSpriteSelectionCells(source,transform,region.w,region.h,*sampler):fastSelectionTransformCells(source,transform,region.w,region.h);for(const auto& c:cells){auto& value=result[std::size_t(c.y)*region.w+c.x];value=normalizeCanvasPacked(brushComposite(value,c.value,100));}}
 // Create conversion retains the fixed grid extent; preview uses the same clipping.
 if(f.tilemap&&(f.tilemapMode==tiles::Mode::Paint||f.tilemapMode==tiles::Mode::Create)&&r.surface){for(int y=0;y<region.h;++y)for(int x=0;x<region.w;++x){const auto wx=std::int64_t(region.x)+x,wy=std::int64_t(region.y)+y;if(wx<r.surface->offsetX||wy<r.surface->offsetY||wx>=std::int64_t(r.surface->offsetX)+r.surface->width||wy>=std::int64_t(r.surface->offsetY)+r.surface->height)result[std::size_t(y)*region.w+x]=0;}}
 return result;
 };
 if(rawHybrid){checkFloatingBudget(f,std::uint64_t(floatingArea(region.w,region.h))*sizeof(Pixel)*2);return raw(region);}
 if(!f.tilemap||f.tilemapMode!=tiles::Mode::Hybrid)return raw(region);
 const auto& grid=*r.source->tilemap;const auto& state=timeline_.state();const auto set=std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& t){return t.id==layer().tilemapTilesetId;});if(set==state.tilesets.end())return raw(region);
 const auto ox=r.surface->offsetX,oy=r.surface->offsetY;const auto& sel=*f.beforeSelection;const auto& tr=f.transform;
 const auto outputBytes=std::uint64_t(floatingArea(region.w,region.h))*sizeof(Pixel);checkFloatingBudget(f,outputBytes);
 // Regional draws must not index unrelated resource sheets. Populate the existing
 // catalog only when a sampled cell actually needs its immutable source pixels.
 tiles::Catalog catalog({});auto admitSource=[&](const std::optional<tiles::Cell>& ref){
  if(!ref||catalog.sets.count(ref->tilesetId))return;
  const auto found=std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& t){return t.id==ref->tilesetId;});
  if(found==state.tilesets.end()||found->tileWidth!=grid.tileWidth||found->tileHeight!=grid.tileHeight)return;
  catalog.sets.emplace(found->id,&*found);catalog.indexes.emplace(found->id,tiles::Index(*found));
 };std::vector<Pixel> result(floatingArea(region.w,region.h));
 const bool cellMove=sel.mask.empty()&&!target.originalSource&&floatingTranslation(tr,target.source)&&(std::int64_t(sel.x)-ox)%grid.tileWidth==0&&(std::int64_t(sel.y)-oy)%grid.tileHeight==0&&sel.width%grid.tileWidth==0&&sel.height%grid.tileHeight==0&&(std::int64_t(tr.x)-ox)%grid.tileWidth==0&&(std::int64_t(tr.y)-oy)%grid.tileHeight==0;
 auto patch=f.hybridPatch;
 if(!cellMove&&(!patch||patch->overlayRevision!=floatingOverlayRevision_||patch->contentRevision!=contentRevision_||patch->repeat!=floatingRepeat_)){
  f.hybridPatch.reset();patch.reset();auto candidate=std::make_shared<HybridFloatingPatch>();candidate->overlayRevision=floatingOverlayRevision_;candidate->contentRevision=contentRevision_;candidate->repeat=floatingRepeat_;auto& modified=candidate->modified;auto& local=candidate->local;const tiles::Index index(*set);const auto bounds=checkedFloatingBounds(tr);std::set<std::size_t> candidates;const auto storageBytes=floatingStorageBudget(timeline_,f,selection_);
  auto admit=[&](std::uint64_t retained,std::uint64_t scratch=0){auto used=storageBytes;floatingAddBytes(used,scratch);floatingAddBytes(used,outputBytes);floatingAddBytes(used,std::uint64_t(candidates.size())*64);floatingAddBytes(used,retained);};
  auto include=[&](PixelRegion area){const auto left=std::max<std::int64_t>(0,std::max<std::int64_t>(0,area.x)-ox),top=std::max<std::int64_t>(0,std::max<std::int64_t>(0,area.y)-oy),right=std::min<std::int64_t>(std::int64_t(grid.columns)*grid.tileWidth,std::min<std::int64_t>(width_,std::int64_t(area.x)+area.w)-ox),bottom=std::min<std::int64_t>(std::int64_t(grid.rows)*grid.tileHeight,std::min<std::int64_t>(height_,std::int64_t(area.y)+area.h)-oy);if(right<=left||bottom<=top)return;for(auto row=top/grid.tileHeight;row<(bottom+grid.tileHeight-1)/grid.tileHeight;++row)for(auto col=left/grid.tileWidth;col<(right+grid.tileWidth-1)/grid.tileWidth;++col){const auto i=std::size_t(row)*grid.columns+std::size_t(col);if(!candidates.count(i)){admit(64);candidates.insert(i);}}};
  include({bounds.x,bounds.y,bounds.width,bounds.height});if(floatingRepeat_!=repeat::Mode::Off&&floatingTranslation(tr,target.source))if(auto wrapped=repeat::wrapSelection(bounds,width_,height_,floatingRepeat_))include({wrapped->x,wrapped->y,wrapped->width,wrapped->height});if(!f.copy)include({f.sourceX,f.sourceY,target.source.width,target.source.height});
  for(const auto i:candidates){const PixelRegion cell{ox+int(i%grid.columns)*grid.tileWidth,oy+int(i/grid.columns)*grid.tileHeight,grid.tileWidth,grid.tileHeight};admit(candidate->bytes+std::uint64_t(cell.w)*cell.h*sizeof(Pixel)*2);auto pixels=raw(cell);admitSource(grid.cells[i]);const auto before=tiles::cellPixels(grid.cells[i],grid.tileWidth,grid.tileHeight,catalog);bool changed=false;for(int y=0;y<cell.h;++y)for(int x=0;x<cell.w;++x){const auto at=std::size_t(y)*cell.w+x;if(cell.x+x<0||cell.y+y<0||cell.x+x>=width_||cell.y+y>=height_)pixels[at]=before[at];changed|=pixels[at]!=before[at];}if(!changed)continue;const auto& ref=grid.cells[i];if(ref&&ref->tilesetId==set->id&&index.find(ref->tileId)){auto it=modified.find(ref->tileId);if(it==modified.end()){std::size_t retained=candidate->bytes;floatingAddBytes(retained,std::uint64_t(grid.tileWidth)*grid.tileHeight*sizeof(Pixel)+ref->tileId.size()+128);admit(retained,std::uint64_t(cell.w)*cell.h*sizeof(Pixel)*2);it=modified.emplace(ref->tileId,tiles::readTile(*set,*index.find(ref->tileId))).first;candidate->bytes=retained;}for(int y=0;y<cell.h;++y)for(int x=0;x<cell.w;++x){const auto at=std::size_t(y)*cell.w+x;if(pixels[at]!=before[at]){const auto p=tiles::sourcePoint(x,y,cell.w,cell.h,*ref);it->second[std::size_t(p.second)*cell.w+p.first]=pixels[at];}}}else{std::size_t retained=candidate->bytes;floatingAddBytes(retained,std::uint64_t(pixels.size())*sizeof(Pixel)+128);admit(retained,std::uint64_t(cell.w)*cell.h*sizeof(Pixel)*2);local.emplace(i,std::move(pixels));candidate->bytes=retained;}}
  admit(candidate->bytes);patch=std::move(candidate);f.hybridPatch=patch;++floatingHybridPatchBuilds_;

 }
 static const std::map<std::string,std::vector<Pixel>> emptyModified;static const std::map<std::size_t,std::vector<Pixel>> emptyLocal;const auto& modified=patch?patch->modified:emptyModified;const auto& local=patch?patch->local:emptyLocal;
 const auto dc=cellMove?(std::int64_t(tr.x)-sel.x)/grid.tileWidth:0,dr=cellMove?(std::int64_t(tr.y)-sel.y)/grid.tileHeight:0;
 auto selectedCell=[&](std::int64_t col,std::int64_t row){const auto x=ox+col*grid.tileWidth,y=oy+row*grid.tileHeight;return col>=0&&row>=0&&col<grid.columns&&row<grid.rows&&x>=sel.x&&y>=sel.y&&x<std::int64_t(sel.x)+sel.width&&y<std::int64_t(sel.y)+sel.height;};
 const auto left=std::max<std::int64_t>(0,std::int64_t(region.x)-ox),top=std::max<std::int64_t>(0,std::int64_t(region.y)-oy),right=std::min<std::int64_t>(std::int64_t(grid.columns)*grid.tileWidth,std::int64_t(region.x)+region.w-ox),bottom=std::min<std::int64_t>(std::int64_t(grid.rows)*grid.tileHeight,std::int64_t(region.y)+region.h-oy);
 // Read only visible texels. A one-pixel viewport must not allocate/rotate a
 // complete 256x256 tile for every cell; sourcePoint preserves reference transforms.
 for(auto row=top/grid.tileHeight;row<(bottom+grid.tileHeight-1)/grid.tileHeight;++row)for(auto col=left/grid.tileWidth;col<(right+grid.tileWidth-1)/grid.tileWidth;++col){
  const auto i=std::size_t(row)*grid.columns+std::size_t(col);auto ref=grid.cells[i];if(cellMove){if(selectedCell(col-dc,row-dr))ref=grid.cells[std::size_t(row-dr)*grid.columns+std::size_t(col-dc)];else if(!f.copy&&selectedCell(col,row))ref.reset();}
  const std::vector<Pixel>* pixels=nullptr;bool transformed=false;
  if(!cellMove){if(auto patch=local.find(i);patch!=local.end())pixels=&patch->second;else if(ref&&ref->tilesetId==set->id)if(auto patch=modified.find(ref->tileId);patch!=modified.end()){pixels=&patch->second;transformed=true;}}
  const tiles::Tileset* source=nullptr;std::optional<std::size_t> tile;
  if(!pixels&&ref){admitSource(ref);auto found=catalog.sets.find(ref->tilesetId);if(found!=catalog.sets.end()&&found->second->tileWidth==grid.tileWidth&&found->second->tileHeight==grid.tileHeight){source=found->second;tile=catalog.indexes.at(source->id).find(ref->tileId);}}
  if(!pixels&&!tile)continue;
  const auto cellX=col*grid.tileWidth,cellY=row*grid.tileHeight;const auto from=std::max(left,cellX),to=std::min(right,cellX+grid.tileWidth);
  for(auto y=std::max(top,cellY);y<std::min(bottom,cellY+grid.tileHeight);++y){auto out=result.begin()+std::size_t(y+oy-region.y)*region.w+std::size_t(from+ox-region.x);
   if(pixels&&!transformed){std::copy_n(pixels->begin()+std::size_t(y-cellY)*grid.tileWidth+std::size_t(from-cellX),std::size_t(to-from),out);continue;}
   for(auto x=from;x<to;++x){const auto p=tiles::sourcePoint(int(x-cellX),int(y-cellY),grid.tileWidth,grid.tileHeight,*ref);*out++=pixels?(*pixels)[std::size_t(p.second)*grid.tileWidth+p.first]:source->pixels[(*tile/source->columns*grid.tileHeight+p.second)*source->columns*grid.tileWidth+*tile%source->columns*grid.tileWidth+p.first];}
  }
 }

 return result;
}
void Document::checkFloatingBudget(const FloatingPaste& f,std::size_t extra)const{
 auto used=floatingStorageBudget(timeline_,f,selection_);floatingAddBytes(used,extra);
}

std::optional<SelectionMask> Document::floatingSelectionMask(const FloatingPaste& f,const SelectionTransform& transform)const{
 if(floatingSymmetryRotation(f,transform))return symmetryRotationSelection(f.source,*f.beforeSelection,transform,width_,height_,f.symmetryAxes,f.symmetryCenter);
 if(floatingSymmetryScale(f,transform))return symmetryScaleSelection(f.source,*f.beforeSelection,transform,width_,height_,f.symmetryAxes,f.symmetryCenter);
 if(floatingSymmetryTranslation(f,transform))return translateSymmetrySelection(*f.beforeSelection,*f.symmetryStart,{int(transform.x)-f.sourceX,int(transform.y)-f.sourceY},width_,height_,f.symmetryAxes,f.symmetryCenter,false);
 const bool rectangular=f.clipboard||bool(f.beforeCelTimeline);
 if(floatingTranslation(transform,f.source)){SelectionMask result{int(transform.x),int(transform.y),f.source.width,f.source.height,{}};if(!rectangular&&!(f.beforeSelection&&f.beforeSelection->mask.empty()))result.mask=f.source.mask;return result;}
 if(!rectangular)return transformedSelectionMask(f.source,transform);
 auto geometry=f.source;geometry.mask.assign(geometry.pixels.size(),1);return transformedSelectionMask(geometry,transform);
}
void Document::transformSparseFloatingPaste(const SelectionTransform& transform,bool rotSprite){
 auto& f=*floating_;const auto bounds=checkedFloatingBounds(transform);const bool translation=floatingTranslation(transform,f.source);
 struct Stage{std::size_t index;std::string owner;const timeline::Surface* before;timeline::Surface* live=nullptr;ConvolutionSurfacePlan plan;std::optional<timeline::Surface> baseline;timeline::Surface candidate;std::unordered_map<std::size_t,Delta> changes;std::shared_ptr<SelectionRotSpriteSource> sampler;};
 std::vector<Stage> stages;stages.reserve(f.targets.size());std::size_t extra=0,workspace=0;
 const auto destination=(floatingSymmetryTranslation(f,transform)||floatingSymmetryScale(f,transform)||floatingSymmetryRotation(f,transform))?std::size_t(width_)*height_:floatingDestinationArea(bounds,width_,height_);
 if(!translation){floatingAddBytes(extra,std::uint64_t(floatingArea(bounds.width,bounds.height))*192);floatingAddBytes(extra,std::uint64_t(f.source.pixels.size())*5);}
 for(std::size_t i=0;i<f.targets.size();++i){auto& target=f.targets[i];const auto r=timeline_.resolveSurface(target.celId);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface)throw std::logic_error("Invalid floating owner");if(!target.ownerId.empty()&&target.ownerId!=r.source->id)throw std::logic_error("Floating owner changed");
  if(std::any_of(stages.begin(),stages.end(),[&](const auto& s){return s.owner==r.source->id;})){if(f.beforeCelTimeline&&rotSprite&&!target.rotSprite)floatingAddBytes(extra,std::uint64_t(target.source.pixels.size())*5+12*1024*1024);continue;}
  const auto l=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& layer){return layer.id==r.source->layerId;});if(l==timeline_.state().layers.end()||layerEffectivelyLocked(*l))throw std::logic_error("Floating layer is locked");
  const auto* before=target.baseline?&*target.baseline:r.surface;raster::validate(*before);auto plan=antiAliasSurfacePlan(*before,width_,height_);const auto area=floatingArea(plan.geometry.width,plan.geometry.height);
  floatingAddBytes(extra,std::uint64_t(area)*4);if(!target.baseline)floatingAddBytes(extra,convolutionSurfaceBytes(*before));
  const auto writes=std::min<std::uint64_t>(area,std::uint64_t(target.source.pixels.size())+destination);floatingAddBytes(extra,writes*128);
  if(!translation)workspace=std::max(workspace,std::size_t(destination)*192);
  if(rotSprite&&!target.rotSprite)floatingAddBytes(extra,std::uint64_t(target.source.pixels.size())*5+12*1024*1024);
  stages.push_back({i,r.source->id,before,nullptr,std::move(plan)});
 }
 if(floatingSymmetryRotation(f,transform))floatingAddBytes(extra,std::uint64_t(std::min(floatingArea(bounds.width,bounds.height),floatingArea(width_,height_)))*(192+symmetryMatrices(f.symmetryAxes).size()*sizeof(SymmetryRotationWrite)*2));floatingAddBytes(extra,workspace);checkFloatingBudget(f,extra);auto selection=floatingSelectionMask(f,transform);
 for(auto& stage:stages){auto& target=f.targets[stage.index];if(!target.baseline)stage.baseline=*stage.before;auto expanded=raster::expanded(*stage.before,{0,0,width_,height_});stage.candidate=expanded?std::move(*expanded):*stage.before;auto& storage=stage.candidate;
  const auto applyTarget=[&](FloatingTarget& target,bool primary){const auto primarySampler=stage.sampler;
  auto write=[&](int x,int y,Pixel value){value=normalizeCanvasPacked(value);auto index=raster::worldIndex(storage,x,y);if(!index)return;const auto old=storage.pixels[*index];if(old==value)return;auto inserted=stage.changes.emplace(*index,Delta{*index,old,value});if(!inserted.second)inserted.first->second.after=value;storage.pixels[*index]=value;};
  const auto& source=target.source;const auto& original=target.originalSource?*target.originalSource:source;
  if(!f.clipboard&&!f.copy)for(int y=0;y<original.height;++y)for(int x=0;x<original.width;++x){const auto i=std::size_t(y)*original.width+x;if(original.mask[i]!=1||(translation&&!floatingSymmetryTranslation(f,transform)&&!floatingSymmetryScale(f,transform)&&!(original.pixels[i]>>24)))continue;const auto wx=std::int64_t(f.sourceX)+x,wy=std::int64_t(f.sourceY)+y;if(translation&&(wx<0||wy<0||wx>=width_||wy>=height_))continue;write(raster::coordinate(wx),raster::coordinate(wy),0);}
  if(floatingSymmetryTranslation(f,transform)){symmetryContentTranslation(source,*f.beforeSelection,*f.symmetryStart,{int(transform.x)-f.sourceX,int(transform.y)-f.sourceY},width_,height_,f.symmetryAxes,f.symmetryCenter,[&](int x,int y,Pixel pixel){write(x,y,!f.copy&&selectionContains(f.beforeSelection,x,y)?pixel:brushComposite(raster::readWorld(*stage.before,x,y),pixel,100));});}
  else if(floatingSymmetryRotation(f,transform)){stage.sampler=target.rotSprite;if(rotSprite&&!stage.sampler)stage.sampler=std::make_shared<SelectionRotSpriteSource>(source);const auto rotationRaster=target.symmetryRotation&&target.symmetryRotation->matches(transform,rotSprite)?target.symmetryRotation:symmetryContentRotation(source,*f.beforeSelection,transform,width_,height_,f.symmetryAxes,f.symmetryCenter,rotSprite,stage.sampler.get());rotationRaster->each([&](int x,int y,Pixel pixel){write(x,y,!f.copy&&selectionContains(f.beforeSelection,x,y)?pixel:brushComposite(raster::readWorld(*stage.before,x,y),pixel,100));});}
  else if(floatingSymmetryScale(f,transform)){symmetryContentScale(source,*f.beforeSelection,transform,width_,height_,f.symmetryAxes,f.symmetryCenter,[&](int x,int y,Pixel pixel){write(x,y,!f.copy&&selectionContains(f.beforeSelection,x,y)?pixel:brushComposite(raster::readWorld(*stage.before,x,y),pixel,100));});}
  else if(translation&&floatingRepeat_!=repeat::Mode::Off){repeatedFloatingTranslation(source,original,f.sourceX,f.sourceY,transform,width_,height_,floatingRepeat_,f.copy||f.clipboard,[&](int x,int y){return raster::readWorld(*stage.before,x,y);},write);}
  else if(translation){const int x=int(transform.x),y=int(transform.y);const auto left=std::max<std::int64_t>(0,-std::int64_t(x)),top=std::max<std::int64_t>(0,-std::int64_t(y)),right=std::min<std::int64_t>(source.width,std::int64_t(width_)-x),bottom=std::min<std::int64_t>(source.height,std::int64_t(height_)-y);
   for(auto row=top;row<bottom;++row)for(auto col=left;col<right;++col){const auto i=std::size_t(row)*source.width+std::size_t(col);if(source.mask[i]!=1||!(source.pixels[i]>>24))continue;const int wx=raster::coordinate(std::int64_t(x)+col),wy=raster::coordinate(std::int64_t(y)+row);write(wx,wy,brushComposite(raster::readWorld(storage,wx,wy),source.pixels[i],100));}
  }else{stage.sampler=target.rotSprite;if(rotSprite&&!stage.sampler)stage.sampler=std::make_shared<SelectionRotSpriteSource>(source);const auto cells=rotSprite?rotSpriteSelectionCells(source,transform,width_,height_,*stage.sampler):fastSelectionTransformCells(source,transform,width_,height_);for(auto cell:cells)write(cell.x,cell.y,brushComposite(raster::readWorld(storage,cell.x,cell.y),cell.value,100));}
  if(!primary)stage.sampler=primarySampler;
  };
  if(f.beforeCelTimeline){for(auto& payload:f.targets){const auto resolved=timeline_.resolveSurface(payload.celId);if(resolved.source->id==stage.owner)applyTarget(payload,&payload==&target);}}
  else applyTarget(target,true);
  for(auto it=stage.changes.begin();it!=stage.changes.end();)if(it->second.before==it->second.after)it=stage.changes.erase(it);else ++it;
 }
 for(auto& stage:stages){stage.live=timeline_.mutableOwnedSurface(stage.owner);if(!stage.live)throw std::logic_error("Missing floating install owner");}
 for(auto& stage:stages){auto& target=f.targets[stage.index];std::swap(*stage.live,stage.candidate);target.ownerId.swap(stage.owner);if(stage.baseline)target.baseline=std::move(stage.baseline);target.preview.swap(stage.changes);if(!translation)target.rotSprite=std::move(stage.sampler);}
 f.restoredFromDeselect=false;f.sparse=true;f.rotSprite=rotSprite;f.transform=transform;f.x=int(std::floor(transform.x));f.y=int(std::floor(transform.y));setSelectionValue(std::move(selection));change_={0,0,width_,height_};publishChange();
}

// Legacy workspace-commands-clipboard.ts / selection-move.ts: mask is an
// independent raster target. No synthetic Cel is used to write mask pixels.
bool Document::beginMaskFloating(const SelectionClipboard& input,int x,int y,bool clipboard,bool copy){
 commitFloatingPaste();cancelStroke();cancelGradient();
 if(!maskBrushAvailable()||input.width<1||input.height<1||std::uint64_t(input.width)*input.height!=input.pixels.size()||(!input.mask.empty()&&input.mask.size()!=input.pixels.size()))return false;
 FloatingPaste f;f.maskId=activeMaskId_;f.beforeMasks=timeline_.state().masks;f.beforeSelection=selection_;f.layerId=activeLayerId_;f.frameId=activeFrameId_;f.clipboard=clipboard;f.copy=copy;
 f.source=input;if(f.source.mask.empty())f.source.mask.assign(f.source.pixels.size(),1);if(std::none_of(f.source.mask.begin(),f.source.mask.end(),[](auto n){return n==1;}))return false;
 if(clipboard)for(auto& pixel:f.source.pixels)pixel=relativeLuminancePixel(pixel);
 f.x=f.sourceX=x;f.y=f.sourceY=y;f.transform={double(x),double(y),double(input.width),double(input.height)};
 FloatingTarget target;target.source=f.source;target.ownerId=f.maskId;target.baseline=mutableActiveMask()->surface;f.targets.push_back(std::move(target));checkFloatingBudget(f,0);
 floating_=std::move(f);try{moveFloatingPaste(x,y);}catch(...){cancelMaskFloating();throw;}return true;
}
bool Document::beginMaskSelectionMove(bool copy,bool allFrameLayers,int dx,int dy){
 if(allFrameLayers||!selectedFrames_.empty()||!timelineSelection_.cels.empty())return false;
 if(floating_){if(copy&&!floating_->copy)commitFloatingPaste();else return true;}
 if(!selection_||!maskBrushAvailable())return false;
 const auto bounds=*selection_;const auto count=floatingArea(bounds.width,bounds.height);if(!bounds.mask.empty()&&bounds.mask.size()!=count)throw std::invalid_argument("Invalid mask selection");
 SelectionClipboard source;source.width=bounds.width;source.height=bounds.height;source.originX=bounds.x;source.originY=bounds.y;source.pixels.resize(count);source.mask.resize(count);
 const auto& surface=mutableActiveMask()->surface;for(int y=0;y<bounds.height;++y)for(int x=0;x<bounds.width;++x){const auto wx=std::int64_t(bounds.x)+x,wy=std::int64_t(bounds.y)+y;const auto i=std::size_t(y)*bounds.width+x;if(!selectionContains(selection_,raster::coordinate(wx),raster::coordinate(wy)))continue;source.mask[i]=1;source.pixels[i]=raster::readWorld(surface,wx,wy);}
 if(!beginMaskFloating(source,bounds.x,bounds.y,false,copy))return false;
 try{moveFloatingPaste(raster::coordinate(std::int64_t(bounds.x)+dx),raster::coordinate(std::int64_t(bounds.y)+dy));}catch(...){cancelMaskFloating();throw;}return true;
}
void Document::transformMaskFloating(const SelectionTransform& transform,bool rotSprite){
 auto& f=*floating_;if(f.maskId!=activeMaskId_||!maskBrushAvailable()||!f.beforeMasks||f.targets.size()!=1)throw std::logic_error("Mask floating target changed");auto& target=f.targets.front();if(!target.baseline)throw std::logic_error("Missing mask floating baseline");
 const auto bounds=checkedFloatingBounds(transform);const bool translation=floatingTranslation(transform,target.source);std::size_t extra=std::uint64_t(width_)*height_*32;
 if(!translation)floatingAddBytes(extra,std::uint64_t(floatingArea(bounds.width,bounds.height))*192);if(rotSprite&&!target.rotSprite)floatingAddBytes(extra,std::uint64_t(target.source.pixels.size())*5+12*1024*1024);checkFloatingBudget(f,extra);
 const auto& baseline=*target.baseline;const auto& original=target.originalSource?*target.originalSource:target.source;auto next=baseline;auto sampler=target.rotSprite;
 const bool whole=floatingRepeat_==repeat::Mode::Off&&translation&&!f.clipboard&&!f.copy&&f.beforeSelection&&f.beforeSelection->mask.empty()&&f.sourceX<=baseline.offsetX&&f.sourceY<=baseline.offsetY&&std::int64_t(f.sourceX)+f.source.width>=std::int64_t(baseline.offsetX)+baseline.width&&std::int64_t(f.sourceY)+f.source.height>=std::int64_t(baseline.offsetY)+baseline.height;
 if(whole){next.offsetX=raster::coordinate(std::int64_t(baseline.offsetX)+int(transform.x)-f.sourceX);next.offsetY=raster::coordinate(std::int64_t(baseline.offsetY)+int(transform.y)-f.sourceY);}
 else{
  PixelRegion needed{0,0,width_,height_};if(translation&&!f.clipboard&&floatingRepeat_==repeat::Mode::Off){needed={int(transform.x),int(transform.y),target.source.width,target.source.height};}if(auto expanded=raster::expanded(next,{needed.x,needed.y,std::int64_t(needed.x)+needed.w,std::int64_t(needed.y)+needed.h},256*1024*1024))next=std::move(*expanded);
  auto write=[&](int x,int y,Pixel value){if(auto index=raster::worldIndex(next,x,y))next.pixels[*index]=timeline::normalizedMaskPixel(value);};
  if(!f.clipboard&&!f.copy)for(int y=0;y<original.height;++y)for(int x=0;x<original.width;++x){const auto i=std::size_t(y)*original.width+x;if(original.mask[i]==1)write(raster::coordinate(std::int64_t(f.sourceX)+x),raster::coordinate(std::int64_t(f.sourceY)+y),0);}
  if(translation){for(int y=0;y<target.source.height;++y)for(int x=0;x<target.source.width;++x){const auto i=std::size_t(y)*target.source.width+x;if(target.source.mask[i]!=1||!(target.source.pixels[i]>>24))continue;const auto local=repeat::wrap({transform.x+x,transform.y+y},width_,height_,floatingRepeat_);const int wx=raster::coordinate(std::int64_t(local.x)),wy=raster::coordinate(std::int64_t(local.y));if((f.clipboard||floatingRepeat_!=repeat::Mode::Off)&&(wx<0||wy<0||wx>=width_||wy>=height_))continue;write(wx,wy,target.source.pixels[i]);}}
  else{if(rotSprite&&!sampler)sampler=std::make_shared<SelectionRotSpriteSource>(target.source);const auto cells=rotSprite?rotSpriteSelectionCells(target.source,transform,width_,height_,*sampler):fastSelectionTransformCells(target.source,transform,width_,height_);for(const auto cell:cells)if(cell.value>>24)write(cell.x,cell.y,cell.value);}
 }
 const bool changed=next.offsetX!=baseline.offsetX||next.offsetY!=baseline.offsetY||next.width!=baseline.width||next.height!=baseline.height||next.pixels!=baseline.pixels;
 std::unordered_map<std::size_t,Delta> deltas;if(changed)deltas.emplace(0,Delta{0,0,1});auto selected=floatingSelectionMask(f,transform);if(!changed)next=baseline;
 mutableActiveMask()->surface=std::move(next);target.preview=std::move(deltas);target.rotSprite=std::move(sampler);f.transform=transform;f.rotSprite=rotSprite;f.x=int(std::floor(transform.x));f.y=int(std::floor(transform.y));f.restoredFromDeselect=false;setSelectionValue(std::move(selected));change_={0,0,width_,height_};publishChange();
}
bool Document::commitMaskFloating(){
 auto& f=*floating_;if(f.maskId!=activeMaskId_||!f.beforeMasks)throw std::logic_error("Mask floating target changed before commit");
 const bool changed=!f.targets.front().preview.empty(),selected=!selectionEqual(f.beforeSelection,selection_);Edit edit{{},state_,changed?nextState_:state_};edit.documentChanged=changed;edit.pixelSelectionHistory.pixelSelectionEdit=true;edit.pixelSelectionHistory.beforePixelsSelection=f.beforeSelection;edit.pixelSelectionHistory.afterPixelsSelection=selection_;
 if(changed){edit.maskHistory.beforeMasks=*f.beforeMasks;edit.maskHistory.afterMasks=timeline_.state().masks;}checkFloatingBudget(f,0);reserveHistoryEntries();floating_.reset();if(changed||selected)pushEdit(std::move(edit),U"变换选区内容");return changed;
}
void Document::cancelMaskFloating(){
 if(!floating_)return;auto& f=*floating_;if(f.beforeMasks)timeline_.state_.masks=std::move(*f.beforeMasks);setSelectionValue(std::move(f.beforeSelection));floating_.reset();change_={0,0,width_,height_};publishChange();
}
bool Document::transformMaskImmediate(bool flip,bool horizontal,int angle){
 if(!flip&&angle!=90&&angle!=-90&&angle!=180)return false;commitFloatingPaste();cancelStroke();cancelGradient();if(!maskBrushAvailable())return false;
 auto beforeSelection=selection_;auto bounds=selection_;if(!bounds){const auto& source=mutableActiveMask()->surface;int l=width_,t=height_,r=-1,b=-1;for(int y=0;y<source.height;++y)for(int x=0;x<source.width;++x)if(source.pixels[std::size_t(y)*source.width+x]>>24){const int wx=raster::coordinate(std::int64_t(source.offsetX)+x),wy=raster::coordinate(std::int64_t(source.offsetY)+y);l=std::min(l,wx);t=std::min(t,wy);r=std::max(r,wx);b=std::max(b,wy);}if(r<l)return false;bounds=SelectionMask{l,t,r-l+1,b-t+1,{}};}
 SelectionClipboard source;source.width=bounds->width;source.height=bounds->height;const auto count=floatingArea(source.width,source.height);source.mask.resize(count);source.pixels.resize(count);const auto& surface=mutableActiveMask()->surface;
 for(int y=0;y<source.height;++y)for(int x=0;x<source.width;++x){const int wx=raster::coordinate(std::int64_t(bounds->x)+x),wy=raster::coordinate(std::int64_t(bounds->y)+y);if(!selectionContains(bounds,wx,wy))continue;const auto i=std::size_t(y)*source.width+x;source.mask[i]=1;source.pixels[i]=raster::readWorld(surface,wx,wy);}
 if(!beginMaskFloating(source,bounds->x,bounds->y,false,false))return false;floating_->beforeSelection=beforeSelection;SelectionTransform target{double(bounds->x),double(bounds->y),double(bounds->width),double(bounds->height),double(angle)};target.flipHorizontal=flip&&horizontal;target.flipVertical=flip&&!horizontal;
 try{transformFloatingPaste(target,false);return commitFloatingPaste();}catch(...){cancelFloatingPaste();throw;}
}
bool Document::deleteMaskSelection(){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);
 if(floating_){if(floating_->clipboard){cancelFloatingPaste();return true;}commitFloatingPaste();}if(!selection_||!maskBrushAvailable())return false;const bool changed=fillAttachedMaskSelection(palette_.secondary);if(changed)setSelectionValue(std::nullopt);return changed;
}

bool Document::beginFloatingPaste(const SelectionClipboard& clipboard,int x,int y){if(!activeMaskId_.empty())return beginMaskFloating(clipboard,x,y,true,true);
 // legacy clipboard permits ordinary raster targets in a mixed document.
 if((hasTilemapContent()||hasFreeTileContent())&&(!layer().kind.empty()||hasSelectedGroups()||layerEffectivelyLocked(layer())))return false;
 commitFloatingPaste();cancelStroke();
 if(layerEffectivelyLocked(layer()) || clipboard.width<1 || clipboard.height<1 || std::uint64_t(clipboard.width)*clipboard.height!=clipboard.pixels.size() || (!clipboard.mask.empty() && clipboard.mask.size()!=clipboard.pixels.size()))return false;
 if(!clipboard.mask.empty() && std::none_of(clipboard.mask.begin(),clipboard.mask.end(),[](auto value){return value!=0;}))return false;
 FloatingPaste f;f.source=clipboard;if(f.source.mask.empty())f.source.mask.assign(f.source.pixels.size(),1);
 f.x=x;f.y=y;f.beforeSelection=selection_;f.layerId=layer().id;f.frameId=frame().id;const auto* slot=timeline_.findCel(f.layerId,f.frameId);
 if(!slot){if(!layer().kind.empty())return false;FloatingTarget target;target.source=f.source;timeline::Surface blank;blank.width=blank.height=1;blank.pixels.resize(1);target.baseline=std::move(blank);f.targets.push_back(std::move(target));}
 else f.targets.push_back({f.source,slot->id,{}});f.transform={double(x),double(y),double(clipboard.width),double(clipboard.height)};
 f.deferred=!slot||supportsDeferredFloating(f);(void)checkedFloatingBounds(f.transform);checkFloatingBudget(f,0);floating_=std::move(f);
 try{moveFloatingPaste(x,y);}catch(...){cancelFloatingPaste();throw;}
 return true;
}
bool Document::beginLayerTransform(){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);
 if(!activeMaskId_.empty()){
 commitFloatingPaste();cancelStroke();cancelGradient();if(!maskBrushAvailable())return false;const auto& surface=mutableActiveMask()->surface;int l=width_,t=height_,r=-1,b=-1;
 for(int y=0;y<height_;++y)for(int x=0;x<width_;++x)if(raster::readWorld(surface,x,y)>>24){l=std::min(l,x);t=std::min(t,y);r=std::max(r,x);b=std::max(b,y);}if(r<l)return false;setSelectionValue(SelectionMask{l,t,r-l+1,b-t+1,{}});return true;
 }
 if(layer().kind=="free-tile"){
  if(layer().kind!="free-tile"||!activeMaskId_.empty()||hasSelectedGroups()||!selectedFrames_.empty())return false;
  for(const auto& id:timelineSelection_.layers)if(id!=activeLayerId_)return false;
  for(const auto& id:timelineSelection_.cels){const auto* c=timeline_.findCelById(id);if(!c||c->layerId!=activeLayerId_||c->frameId!=activeFrameId_)return false;}
  commitFloatingPaste();cancelStroke();cancelGradient();const auto bounds=freeTileSelectionTargetBounds(*this);if(!bounds)return false;
  auto visible=combineSelection(SelectionMask{bounds->x,bounds->y,bounds->w,bounds->h,{}},SelectionMask{0,0,width_,height_,{}},3);if(!visible)return false;
  setSelectionValue(std::move(visible));return true;
 }
 const auto commandLayers=selectedLayerIdsWithGroups();if(hasSelectedGroups()&&commandLayers.empty())return false;
 commitFloatingPaste();cancelStroke();std::unordered_set<std::string> selected(commandLayers.begin(),commandLayers.end());for(const auto& id:timelineSelection_.cels)if(const auto* target=timeline_.findCelById(id))selected.insert(target->layerId);
 const bool implicitFrames=!selectedFrames_.empty() && commandLayers.empty();if(selected.empty() && !implicitFrames)selected.insert(activeLayerId_);
 // Legacy selectedTransformLayersForSession excludes special layers for an
 // implicit frame selection; an explicit single tilemap is a valid entry target.
 if(implicitFrames){for(const auto& target:timeline_.state().layers)if(target.kind.empty()&&!layerEffectivelyLocked(target)&&layerEffectivelyVisible(target))selected.insert(target.id);}
 else if(selected.size()>1){for(const auto& target:timeline_.state().layers)if(selected.count(target.id)&&!target.kind.empty())return false;}
 if(selected.empty())return false;
 if(hasFreeTileContent()||hasTilemapContent())for(const auto& target:timeline_.state().layers)if(selected.count(target.id)&&!target.kind.empty()&&target.kind!="tilemap")return false;
 if(selected.size()==1){const auto* target=timeline_.findCel(*selected.begin(),activeFrameId_);if(target){const auto source=timeline_.resolveSurface(target->id);if(source.source&&source.source->text&&source.source->text->boxed)return false;}}

 int left=width_,top=height_,right=-1,bottom=-1;
 for(const auto& l:timeline_.state().layers){if(!selected.count(l.id))continue;if(layerEffectivelyLocked(l) || !layerEffectivelyVisible(l))return false;const auto* target=timeline_.findCel(l.id,activeFrameId_);if(!target)continue;const auto resolved=timeline_.resolveSurface(target->id);if(!resolved.surface)continue;const auto& s=*resolved.surface;raster::validate(s);for(int y=0;y<s.height;++y)for(int x=0;x<s.width;++x){const auto wx=std::int64_t(s.offsetX)+x,wy=std::int64_t(s.offsetY)+y;if(wx<0||wy<0||wx>=width_||wy>=height_||!(s.pixels[std::size_t(y)*s.width+x]>>24))continue;left=std::min(left,int(wx));top=std::min(top,int(wy));right=std::max(right,int(wx));bottom=std::max(bottom,int(wy));}}
 if(right<left)return false;setSelectionValue(SelectionMask{left,top,right-left+1,bottom-top+1,{}});return true;
}
bool Document::linkedCreateFloatingSupported(const FloatingPaste& f)const{
 // Frozen explicit-chain Create owner; preview may have no in-canvas selection.
 if(!f.linkedCreate||!f.tilemap||(f.tilemapMode!=tiles::Mode::Create&&f.tilemapMode!=tiles::Mode::Paint)||tileSelection_.mode!=f.tilemapMode||f.clipboard||f.layerId!=layer().id||f.frameId!=frame().id||f.targets.size()!=1||f.targets.front().celId!=cel().id||!tilemapCellOwnerSupported(cel().id,true,true))return false;
 const auto r=timeline_.resolveSurface(cel().id);return !f.targets.front().ownerId.empty()&&r.source&&r.source->id==f.targets.front().ownerId;
}
bool Document::linkedEditFloatingSupported(const FloatingPaste& f)const{
 // The gesture freezes its canonical owner and anchor; all resource references must remain admissible.
 if(!f.linkedEdit||!f.tilemap||f.tilemapMode!=tiles::Mode::Edit||tileSelection_.mode!=tiles::Mode::Edit||f.clipboard||f.layerId!=layer().id||f.frameId!=frame().id||f.targets.size()!=1||f.targets.front().celId!=cel().id||!f.tilemapEditCell||!tilemapCellOwnerSupported(cel().id,true,true)||!tilemapPixelReferenceOwnersSupported(layer().tilemapTilesetId))return false;
 const auto r=timeline_.resolveSurface(cel().id);return !f.targets.front().ownerId.empty()&&r.source&&r.source->id==f.targets.front().ownerId&&*f.tilemapEditCell<r.source->tilemap->cells.size()&&bool(r.source->tilemap->cells[*f.tilemapEditCell]);
}
bool Document::linkedHybridFloatingSupported(const FloatingPaste& f)const{
 if(!f.linkedHybrid||!f.tilemap||f.tilemapMode!=tiles::Mode::Hybrid||tileSelection_.mode!=tiles::Mode::Hybrid||f.clipboard||f.layerId!=layer().id||f.frameId!=frame().id||f.targets.size()!=1||f.targets.front().celId!=cel().id||!tilemapCellOwnerSupported(cel().id,true,true)||!tilemapPixelReferenceOwnersSupported(layer().tilemapTilesetId))return false;
 const auto r=timeline_.resolveSurface(cel().id);return !f.targets.front().ownerId.empty()&&r.source&&r.source->id==f.targets.front().ownerId;
}
bool Document::prepareTilemapFloating(FloatingPaste& f,std::optional<Point> seed){
 f.tilemapMode=tileSelection_.mode;const bool hybrid=f.tilemapMode==tiles::Mode::Hybrid;if(f.tilemapMode!=tiles::Mode::Edit&&!hybrid)return true;if(hybrid&&raster::fullCanvas(activeSurface(),width_,height_)){auto deferred=f;deferred.clipboard=false;deferred.targets.push_back({{},cel().id,{}});if(supportsDeferredFloating(deferred))return true;}
 const auto resolved=timeline_.resolveSurface(cel().id);if(!resolved.source||!resolved.source->tilemap)return false;const auto& grid=*resolved.source->tilemap;
 auto cellAt=[&](Point p)->std::optional<std::size_t>{if(p.x<0||p.y<0||p.x>=width_||p.y>=height_)return {};const auto lx=std::int64_t(p.x)-resolved.surface->offsetX,ly=std::int64_t(p.y)-resolved.surface->offsetY;if(lx<0||ly<0||lx>=std::int64_t(grid.columns)*grid.tileWidth||ly>=std::int64_t(grid.rows)*grid.tileHeight)return {};const auto index=std::size_t(ly/grid.tileHeight)*grid.columns+std::size_t(lx/grid.tileWidth);return index<grid.cells.size()&&grid.cells[index]?std::optional<std::size_t>{index}:std::nullopt;};
 if(!hybrid&&seed)f.tilemapEditCell=cellAt(*seed);else if(!hybrid&&selection_){for(int y=std::max(0,selection_->y);y<std::min(height_,selection_->y+selection_->height)&&!f.tilemapEditCell;++y)for(int x=std::max(0,selection_->x);x<std::min(width_,selection_->x+selection_->width);++x)if(selectionContains(selection_,x,y)){f.tilemapEditCell=cellAt({x,y});if(f.tilemapEditCell)break;}}
 if(!hybrid&&!f.tilemapEditCell)return false;
 const auto& state=timeline_.state();const auto set=std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& t){return t.id==layer().tilemapTilesetId;});if(set==state.tilesets.end())return false;
 std::size_t refs=0;for(const auto& c:state.cels)if(c.tilemap)for(const auto& cell:c.tilemap->cells)if(cell&&cell->tilesetId==set->id)++refs;
 // Retained baseline/raw canvas, detached display, reference index and one transactional COW publish.
 const auto retained=adjustmentStorageBudget(timeline_,1)+std::uint64_t(width_)*height_*8+std::uint64_t(refs)*128;
 checkFloatingBudget(f,retained+adjustmentStorageBudget(timeline_,1)+std::uint64_t(width_)*height_*4);f.transientBytes=retained;
 auto g=std::make_shared<GradientPreview>();g->tilemap=true;g->tilemapMode=f.tilemapMode;g->celId=resolved.source->id;g->layerId=layer().id;g->frameId=frame().id;g->contentRevision=contentRevision_;g->tilemapBaseline=canvasPixels();g->preview=g->tilemapBaseline;g->tilemapDisplay=timeline::Timeline(state);
 const auto index=f.tilemapEditCell.value_or(0);g->region=SelectionMask{resolved.surface->offsetX+int(index%grid.columns)*grid.tileWidth,resolved.surface->offsetY+int(index/grid.columns)*grid.tileHeight,grid.tileWidth,grid.tileHeight,{}};
 if(hybrid)g->region=SelectionMask{0,0,width_,height_,{}};
 for(std::size_t ci=0;ci<state.cels.size();++ci){const auto& c=state.cels[ci];if(c.tilemap&&c.surface)for(std::size_t i=0;i<c.tilemap->cells.size();++i){const auto& cell=c.tilemap->cells[i];if(cell&&cell->tilesetId==set->id)g->tilemapReferences[cell->tileId].push_back({ci,i});}}
 f.tilemapPreview=std::move(g);return true;
}
bool Document::beginSelectionContentMove(bool copy,bool allFrameLayers,int initialDx,int initialDy,std::optional<Point> tilemapSeed,bool symmetryTranslation,bool symmetryScale,bool symmetryRotation,bool symmetryShear){if(!activeMaskId_.empty())return beginMaskSelectionMove(copy,allFrameLayers,initialDx,initialDy);if(hasFreeTileContent()){if(layer().kind=="free-tile"&&activeMaskId_.empty()){const bool started=beginFreeTileSelectionMove(copy,allFrameLayers,initialDx,initialDy);if(started&&symmetryTranslation&&tilemapSeed){floating_->symmetryStart=SymmetryPixel{tilemapSeed->x,tilemapSeed->y};floating_->symmetryAxes=symmetryAxes;floating_->symmetryCenter=symmetryCenter();}return started;}if(!layer().kind.empty()&&layer().kind!="tilemap")return false;}if(hasTilemapContent()&&!layer().kind.empty()){
 if(floating_){if(floating_->tilemap){if(tileSelection_.mode!=floating_->tilemapMode||layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer()))return false;}else if(!(floating_->clipboard&&floating_->maskId.empty()&&layer().kind.empty()&&!layerEffectivelyLocked(layer())))return false;}
 else if(allFrameLayers||!tilemapSelectionTransformAvailable())return false;
 }if(!activeMaskId_.empty())return beginMaskSelectionMove(copy,allFrameLayers,initialDx,initialDy);
 const auto commandLayers=selectedLayerIdsWithGroups();if(hasSelectedGroups()&&commandLayers.empty())return false;
 if(floating_){if(copy && !floating_->copy){commitFloatingPaste();}else{if(symmetryTranslation&&tilemapSeed)configureSymmetryContentDrag(*floating_,*tilemapSeed);if(symmetryScale&&!floating_->clipboard&&!floating_->tilemap&&floating_->maskId.empty()&&floating_->beforeSelection){floating_->symmetryShear=false;floating_->symmetryRotation=false;floating_->symmetryScale=true;floating_->symmetryAxes=symmetryAxes;floating_->symmetryCenter=symmetryCenter();}if(symmetryRotation)configureSymmetryContentRotation(*floating_);if(symmetryShear)configureSymmetryContentShear(*floating_);return true;}}
 if(!selection_)return false;cancelStroke();
 FloatingPaste f;f.tilemap=layer().kind=="tilemap";f.linkedCreate=f.tilemap&&(linkedCreateSelectionAvailable()||linkedCreateSelectionAvailable(true,true));f.linkedEdit=f.tilemap&&linkedEditSelectionAvailable();f.linkedHybrid=f.tilemap&&linkedHybridSelectionAvailable();if(f.tilemap&&!prepareTilemapFloating(f,tilemapSeed))return false;
 // legacy captureAnimationFrameSelectionTransformStates: explicit Cel keys
 // capture exact targets; active frame/layer sorts first, shared sources once.
 std::vector<const DocumentCel*> targets;
 if(!timelineSelection_.cels.empty()){
  for(const auto& id:timelineSelection_.cels)if(const auto* target=timeline_.findCelById(id))targets.push_back(target);
  auto layerIndex=[&](const auto& id){const auto& layers=timeline_.state().layers;return std::find_if(layers.begin(),layers.end(),[&](const auto& l){return l.id==id;})-layers.begin();};
  auto frameIndex=[&](const auto& id){const auto& frames=timeline_.state().frames;return std::find_if(frames.begin(),frames.end(),[&](const auto& f){return f.id==id;})-frames.begin();};
  std::stable_sort(targets.begin(),targets.end(),[&](const auto* a,const auto* b){
   const bool af=a->frameId==frame().id,bf=b->frameId==frame().id;if(af!=bf)return af;
   const bool al=a->layerId==layer().id,bl=b->layerId==layer().id;if(al!=bl)return al;
   if(a->frameId!=b->frameId)return frameIndex(a->frameId)<frameIndex(b->frameId);return layerIndex(a->layerId)<layerIndex(b->layerId);
  });
  for(const auto* target:targets){const auto& l=timeline_.state().layers[layerIndex(target->layerId)];if(layerEffectivelyLocked(l) || !layerEffectivelyVisible(l))return false;}
 }else if(!commandLayers.empty()){
  // Legacy selectedTransformLayersForSession captures every explicit layer.
  auto frames=selectedFrames_.empty()?std::vector<std::string>{frame().id}:selectedFrames_;
  for(const auto& l:timeline_.state().layers)if(std::find(commandLayers.begin(),commandLayers.end(),l.id)!=commandLayers.end()){
   if(layerEffectivelyLocked(l) || !layerEffectivelyVisible(l))return false;for(const auto& id:frames)if(const auto* target=timeline_.findCel(l.id,id))targets.push_back(target);
  }
  std::stable_sort(targets.begin(),targets.end(),[&](const auto* a,const auto* b){const bool af=a->frameId==activeFrameId_,bf=b->frameId==activeFrameId_;if(af!=bf)return af;return a->layerId==activeLayerId_ && b->layerId!=activeLayerId_;});
 }else{
  auto frames=selectedFrames_.empty()?std::vector<std::string>{frame().id}:selectedFrames_;
  std::stable_sort(frames.begin(),frames.end(),[&](const auto& a,const auto& b){return a==frame().id && b!=frame().id;});
  for(const auto& frameId:frames)for(std::size_t n=0;n<timeline_.state().layers.size();++n){
   const auto index=(n+activeLayerIndex())%timeline_.state().layers.size();const auto& targetLayer=timeline_.state().layers[index];
   if(!allFrameLayers && targetLayer.id!=layer().id)continue;
   if(layerEffectivelyLocked(targetLayer) || !layerEffectivelyVisible(targetLayer)){if(allFrameLayers)continue;return false;}
   if(const auto* target=timeline_.findCel(targetLayer.id,frameId))targets.push_back(target);
  }
 }
 if((hasFreeTileContent()&&!f.tilemap)||(hasTilemapContent()&&layer().kind.empty()))for(const auto* target:targets){const auto& owner=timeline_.state().layers[timeline_.layerIndex(target->layerId)];if(!owner.kind.empty())return false;}
 const auto count=floatingArea(selection_->width,selection_->height);raster::coordinate(std::int64_t(selection_->x)+selection_->width);raster::coordinate(std::int64_t(selection_->y)+selection_->height);
 if(!selection_->mask.empty()&&selection_->mask.size()!=count)throw std::invalid_argument("Invalid floating selection mask");
 std::vector<std::string> owners;for(const auto* target:targets){const auto r=timeline_.resolveSurface(target->id);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface)return false;raster::validate(*r.surface);if(std::find(owners.begin(),owners.end(),r.source->id)==owners.end())owners.push_back(r.source->id);}
 std::size_t payload=0;floatingAddBytes(payload,std::uint64_t(count)*5*(owners.size()+1));floatingAddBytes(payload,selection_->mask.size());checkFloatingBudget(f,payload);
 f.beforeSelection=selection_;f.x=f.sourceX=selection_->x;f.y=f.sourceY=selection_->y;f.clipboard=false;f.copy=copy;f.layerId=layer().id;f.frameId=frame().id;
 std::vector<std::string> sources;
 for(const auto* target:targets){
  const auto resolved=timeline_.resolveSurface(target->id);if(!resolved.source || !resolved.surface)return false;
  if(std::find(sources.begin(),sources.end(),resolved.source->id)!=sources.end())continue;sources.push_back(resolved.source->id);
  SelectionClipboard source;source.width=selection_->width;source.height=selection_->height;source.originX=selection_->x;source.originY=selection_->y;source.pixels.resize(std::size_t(source.width)*source.height);source.mask.resize(source.pixels.size());
  for(int y=0;y<source.height;++y)for(int x=0;x<source.width;++x){const int px=f.sourceX+x,py=f.sourceY+y;const auto local=std::size_t(y)*source.width+x;if(!selectionContains(selection_,px,py))continue;source.mask[local]=1;source.pixels[local]=raster::fullCanvas(*resolved.surface,width_,height_)?((px>=0&&py>=0&&px<width_&&py<height_)?resolved.surface->pixels[std::size_t(py)*width_+px]:0u):raster::readWorld(*resolved.surface,px,py);}
  f.targets.push_back({std::move(source),target->id,{}});if(f.linkedCreate||f.linkedEdit||f.linkedHybrid)f.targets.back().ownerId=resolved.source->id;
 }
 if(f.targets.empty()){
  if(allFrameLayers||!timelineSelection_.cels.empty()||selectedFrames_.size()>1||commandLayers.size()>1||timeline_.findCel(activeLayerId_,activeFrameId_)||!layer().kind.empty()||layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer()))return false;
  f.source.width=selection_->width;f.source.height=selection_->height;f.source.originX=selection_->x;f.source.originY=selection_->y;f.source.pixels.resize(count);f.source.mask.resize(count);for(int y=0;y<f.source.height;++y)for(int x=0;x<f.source.width;++x)f.source.mask[std::size_t(y)*f.source.width+x]=selectionContains(selection_,f.sourceX+x,f.sourceY+y)?1:0;
 }else f.source=f.targets.front().source;
 f.transform={double(f.x)+initialDx,double(f.y)+initialDy,double(f.source.width),double(f.source.height)};(void)checkedFloatingBounds(f.transform);
 const int initialX=raster::coordinate(std::int64_t(f.sourceX)+initialDx),initialY=raster::coordinate(std::int64_t(f.sourceY)+initialDy);
 f.deferred=!f.tilemapPreview&&(((f.tilemapMode==tiles::Mode::Paint||f.tilemapMode==tiles::Mode::Create)&&f.tilemap&&!raster::fullCanvas(activeSurface(),width_,height_))||supportsDeferredFloating(f));(void)checkedFloatingBounds(f.transform);floating_=std::move(f);try{moveFloatingPaste(initialX,initialY);if(symmetryTranslation&&tilemapSeed)configureSymmetryContentDrag(*floating_,*tilemapSeed);if(symmetryScale&&!floating_->clipboard&&!floating_->tilemap&&floating_->maskId.empty()&&floating_->beforeSelection){floating_->symmetryShear=false;floating_->symmetryRotation=false;floating_->symmetryScale=true;floating_->symmetryAxes=symmetryAxes;floating_->symmetryCenter=symmetryCenter();}if(symmetryRotation)configureSymmetryContentRotation(*floating_);if(symmetryShear)configureSymmetryContentShear(*floating_);}catch(...){floating_.reset();throw;}return true;
}
namespace {
// Legacy tilemapCellIndexesForEdit: intersect world bounds before converting to
// grid coordinates, retaining row-major order and complete offset cells.
template<class Grid,class Visit> void paintSelectionCells(const Grid& grid,int ox,int oy,const SelectionMask& selection,Visit visit){
 const auto left=std::max<std::int64_t>(0,std::int64_t(selection.x)-ox),top=std::max<std::int64_t>(0,std::int64_t(selection.y)-oy);
 const auto right=std::min<std::int64_t>(std::int64_t(grid.columns)*grid.tileWidth,std::int64_t(selection.x)+selection.width-ox),bottom=std::min<std::int64_t>(std::int64_t(grid.rows)*grid.tileHeight,std::int64_t(selection.y)+selection.height-oy);
 if(right<=left||bottom<=top)return;
 for(auto row=top/grid.tileHeight;row<(bottom+grid.tileHeight-1)/grid.tileHeight;++row)for(auto col=left/grid.tileWidth;col<(right+grid.tileWidth-1)/grid.tileWidth;++col)visit(std::size_t(row)*grid.columns+std::size_t(col));
}
}
std::optional<SelectionMask> Document::expandedPaintCellSelection(bool discreteFlip)const{
 // Resolved full-grid caches keep their world origin while moving complete cells.
 // Movement clips its selection to the document; discrete flips keep complete cells.
 if(!selection_||active()||!activeMaskId_.empty()||layer().kind!="tilemap"||tileSelection_.mode!=tiles::Mode::Paint||hasSelectedGroups()||!tilemapCellOwnerSupported(cel().id,true,true)||(!discreteFlip&&(layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer()))))return {};
 const auto layers=selectedLayerIdsWithGroups();if(layers.size()>1||(!layers.empty()&&layers.front()!=activeLayerId_)||!selectedFrames_.empty()||timelineSelection_.cels.size()>1||(!timelineSelection_.cels.empty()&&timelineSelection_.cels.front()!=cel().id))return {};
 const auto& g=*timeline_.resolveSurface(cel().id).source->tilemap;const int originX=activeSurface().offsetX,originY=activeSurface().offsetY,clipLeft=discreteFlip?originX:0,clipTop=discreteFlip?originY:0,clipRight=discreteFlip?originX+g.columns*g.tileWidth:width_,clipBottom=discreteFlip?originY+g.rows*g.tileHeight:height_;std::vector<std::size_t> indexes;int left=clipRight,top=clipBottom,right=clipLeft,bottom=clipTop;
 paintSelectionCells(g,originX,originY,*selection_,[&](std::size_t i){const int x=originX+int(i%g.columns)*g.tileWidth,y=originY+int(i/g.columns)*g.tileHeight;bool hit=false;for(int py=std::max({y,selection_->y,clipTop});!hit&&py<std::min({y+g.tileHeight,selection_->y+selection_->height,clipBottom});++py)for(int px=std::max({x,selection_->x,clipLeft});px<std::min({x+g.tileWidth,selection_->x+selection_->width,clipRight});++px)if(selectionContains(selection_,px,py)){hit=true;break;}if(hit){indexes.push_back(i);left=std::min(left,std::max(clipLeft,x));top=std::min(top,std::max(clipTop,y));right=std::max(right,std::min(clipRight,x+g.tileWidth));bottom=std::max(bottom,std::min(clipBottom,y+g.tileHeight));}});
 if(indexes.empty())return {};SelectionMask result{left,top,right-left,bottom-top,{}};result.mask.resize(std::size_t(result.width)*result.height);std::size_t count=0;for(const auto i:indexes){const int x=originX+int(i%g.columns)*g.tileWidth,y=originY+int(i/g.columns)*g.tileHeight;for(int py=std::max(clipTop,y);py<std::min(clipBottom,y+g.tileHeight);++py)for(int px=std::max(clipLeft,x);px<std::min(clipRight,x+g.tileWidth);++px){result.mask[std::size_t(py-top)*result.width+px-left]=1;++count;}}if(count==result.mask.size())result.mask.clear();return result;
}
bool Document::beginPaintCellMove(bool copy,bool keyboard){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);
 auto expanded=expandedPaintCellSelection();if(!expanded)return false;const auto target=timeline_.resolveSurface(cel().id);const auto& g=*target.source->tilemap;const auto bytes=std::uint64_t(g.cells.size())*1024+std::uint64_t(width_)*height_*4;if(bytes>256*1024*1024-adjustmentStorageBudget(timeline_,1))throw std::length_error("Paint selection move exceeds document budget");
 PaintCellMove move;move.layerId=layer().id;move.frameId=frame().id;move.celId=target.source->id;move.expanded=*expanded;move.beforeSelection=keyboard?selection_:expanded;move.copy=copy;
 paintSelectionCells(g,activeSurface().offsetX,activeSurface().offsetY,*expanded,[&](std::size_t i){const int x=activeSurface().offsetX+int(i%g.columns)*g.tileWidth,y=activeSurface().offsetY+int(i/g.columns)*g.tileHeight;bool hit=false;for(int py=std::max(y,expanded->y);!hit&&py<std::min(y+g.tileHeight,expanded->y+expanded->height);++py)for(int px=std::max(x,expanded->x);px<std::min(x+g.tileWidth,expanded->x+expanded->width);++px)if(selectionContains(expanded,px,py)){hit=true;break;}if(hit)move.sources.push_back({i,g.cells[i],g.cells[i]});});
 paintCellMove_=std::move(move);setSelectionValue(std::move(expanded));return true;
}
void Document::updatePaintCellMove(int dx,int dy,bool clamp){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);
 if(!paintCellMove_)return;auto& move=*paintCellMove_;if(tileSelection_.mode!=tiles::Mode::Paint||layer().id!=move.layerId||frame().id!=move.frameId||layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer())||!tilemapCellOwnerSupported(cel().id,true,true)||timeline_.resolveSurface(cel().id).source->id!=move.celId)throw std::logic_error("Paint cell move target changed");const auto& g=*timeline_.findCelById(move.celId)->tilemap;
 int columns=int(std::floor(double(dx)/g.tileWidth+.5)),rows=int(std::floor(double(dy)/g.tileHeight+.5));if(clamp){columns=std::clamp(columns,int(std::ceil(double(activeSurface().offsetX-move.expanded.x)/g.tileWidth)),int(std::floor(double(activeSurface().offsetX+g.columns*g.tileWidth-move.expanded.x-move.expanded.width)/g.tileWidth)));rows=std::clamp(rows,int(std::ceil(double(activeSurface().offsetY-move.expanded.y)/g.tileHeight)),int(std::floor(double(activeSurface().offsetY+g.rows*g.tileHeight-move.expanded.y-move.expanded.height)/g.tileHeight)));}if(columns==move.columns&&rows==move.rows)return;
 std::map<std::size_t,std::optional<tiles::Cell>> original,updates;if(move.preview&&move.preview->tilemapPixels())for(const auto& c:move.preview->tilemapPixels()->cells){original[c.index]=c.before;updates[c.index]=c.before;}
 auto baseline=[&](std::size_t i){const auto found=original.find(i);return found==original.end()?g.cells[i]:found->second;};
 if(!move.copy)for(const auto& c:move.sources)updates[c.index]={};for(const auto& c:move.sources){const auto x=std::int64_t(c.index%g.columns)+columns,y=std::int64_t(c.index/g.columns)+rows;if(x>=0&&y>=0&&x<g.columns&&y<g.rows)updates[std::size_t(y)*g.columns+std::size_t(x)]=c.before;}
 const int ox=columns*g.tileWidth,oy=rows*g.tileHeight;const auto& source=move.expanded;const std::optional<SelectionMask> sourceSelection{source};int left=width_,top=height_,right=0,bottom=0;for(int y=source.y;y<source.y+source.height;++y)for(int x=source.x;x<source.x+source.width;++x)if(selectionContains(sourceSelection,x,y)&&x+ox>=0&&y+oy>=0&&x+ox<width_&&y+oy<height_){left=std::min(left,x+ox);top=std::min(top,y+oy);right=std::max(right,x+ox+1);bottom=std::max(bottom,y+oy+1);}
 std::optional<SelectionMask> after;if(right>left&&bottom>top){SelectionMask shifted{left,top,right-left,bottom-top,{}};shifted.mask.resize(std::size_t(shifted.width)*shifted.height);std::size_t count=0;for(int y=top;y<bottom;++y)for(int x=left;x<right;++x)if(selectionContains(sourceSelection,x-ox,y-oy)){shifted.mask[std::size_t(y-top)*shifted.width+x-left]=1;++count;}if(count==shifted.mask.size())shifted.mask.clear();after=std::move(shifted);}
 TilemapPixelHistory apply,history;apply.celId=history.celId=move.celId;apply.tilesetEdit=history.tilesetEdit=false;apply.independentCellOwner=history.independentCellOwner=true;apply.cellOffsetLayout=history.cellOffsetLayout=true;apply.linkedCellOwner=history.linkedCellOwner=true;apply.beforeSet.id=history.beforeSet.id=layer().tilemapTilesetId;for(const auto& entry:updates){const auto before=baseline(entry.first);apply.cells.push_back({entry.first,g.cells[entry.first],entry.second});if(before!=entry.second)history.cells.push_back({entry.first,before,entry.second});}
 Edit edit{{},state_,nextState_};edit.pixelSelectionHistory.pixelSelectionEdit=true;edit.pixelSelectionHistory.beforePixelsSelection=move.beforeSelection;edit.pixelSelectionHistory.afterPixelsSelection=after;edit.tileHistory.beforeTileSelection=edit.tileHistory.afterTileSelection=tileSelection_;edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeFrameAnchor=edit.afterFrameAnchor=frameAnchor_;edit.layerHistory.beforeGroupUi=edit.layerHistory.afterGroupUi=GroupUiSnapshot{selectedGroupIds_,collapsedGroupIds_,selectedGroupId_};edit.terminalHistory=std::make_shared<const TilemapPixelHistory>(std::move(apply));
 auto retained=std::make_shared<Edit>(edit);retained->documentChanged=!history.cells.empty();if(retained->documentChanged)retained->terminalHistory=std::make_shared<const TilemapPixelHistory>(std::move(history));else{retained->terminalHistory=std::monostate{};retained->afterState=state_;}retained->label.reserve(32);reserveHistoryEntries();change_={};applyEdit(edit,true);move.preview=std::move(retained);move.columns=columns;move.rows=rows;publishChange();
}
bool Document::finishPaintCellMove(bool cancel){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_,bool(paintCellMove_));
 if(!paintCellMove_)return false;auto& move=*paintCellMove_;if(cancel){change_={};if(move.preview&&move.preview->tilemapPixels())applyEdit(*move.preview,false);setSelectionValue(move.beforeSelection);paintCellMove_.reset();publishChange();return false;}
 if(tileSelection_.mode!=tiles::Mode::Paint||layer().id!=move.layerId||frame().id!=move.frameId)throw std::logic_error("Paint cell move target changed");auto edit=move.preview;const bool changed=edit&&edit->documentChanged;const bool selected=edit&&!selectionEqual(edit->pixelSelectionHistory.beforePixelsSelection,edit->pixelSelectionHistory.afterPixelsSelection);paintCellMove_.reset();if(edit&&(changed||selected))pushEdit(std::move(*edit),U"移动瓦片选区内容");return changed;
}
bool Document::nudgeSelectionContent(int dx,int dy,bool allFrameLayers){const bool freeFloating=floating_&&bool(floating_->freeTile),rasterClipboard=floating_&&floating_->clipboard&&floating_->maskId.empty()&&layer().kind.empty()&&!layerEffectivelyLocked(layer());const bool mixedRaster=(hasFreeTileContent()||hasTilemapContent())&&activeMaskId_.empty()&&layer().kind.empty()&&!layerEffectivelyLocked(layer())&&(!floating_||(!floating_->freeTile&&!floating_->tilemap&&floating_->maskId.empty()));if((!activeMaskId_.empty()||freeFloating||rasterClipboard||mixedRaster||(!hasFreeTileContent()&&!hasTilemapContent()&&layer().kind.empty()))&&selection_){
 // Legacy moveActiveSelectionWithSelectionHistory clamps keyboard movement;
 // explicit centering calls the separate allowOutsideCanvas path.
 const auto& bounds=*selection_;const auto x=std::max<std::int64_t>(0,std::min<std::int64_t>(std::int64_t(width_)-bounds.width,std::int64_t(bounds.x)+dx)),y=std::max<std::int64_t>(0,std::min<std::int64_t>(std::int64_t(height_)-bounds.height,std::int64_t(bounds.y)+dy));dx=raster::coordinate(x-bounds.x);dy=raster::coordinate(y-bounds.y);
 }if(activeMaskId_.empty()&&hasFreeTileContent()&&!freeFloating&&!rasterClipboard&&!mixedRaster&&layer().kind!="tilemap")return false;if(activeMaskId_.empty()&&layer().kind=="tilemap"&&tileSelection_.mode==tiles::Mode::Paint&&!floating_){if(allFrameLayers||paintCellMove_)return false;const auto expanded=expandedPaintCellSelection();if(!expanded)return false;const auto& g=*timeline_.resolveSurface(cel().id).source->tilemap;const int columns=std::clamp(int(std::floor(double(dx)/g.tileWidth+.5)),int(std::ceil(double(activeSurface().offsetX-expanded->x)/g.tileWidth)),int(std::floor(double(activeSurface().offsetX+g.columns*g.tileWidth-expanded->x-expanded->width)/g.tileWidth))),rows=std::clamp(int(std::floor(double(dy)/g.tileHeight+.5)),int(std::ceil(double(activeSurface().offsetY-expanded->y)/g.tileHeight)),int(std::floor(double(activeSurface().offsetY+g.rows*g.tileHeight-expanded->y-expanded->height)/g.tileHeight)));if(!columns&&!rows)return false;if(!beginPaintCellMove(false,true))return false;try{updatePaintCellMove(columns*g.tileWidth,rows*g.tileHeight,true);finishPaintCellMove();}catch(...){finishPaintCellMove(true);throw;}return true;}if(activeMaskId_.empty()&&!freeFloating&&hasTilemapContent()&&!mixedRaster&&!((floating_&&floating_->tilemap)||(!floating_&&!allFrameLayers&&tilemapSelectionTransformAvailable())||(floating_&&floating_->clipboard&&floating_->maskId.empty()&&layer().kind.empty()&&!layerEffectivelyLocked(layer()))))return false;
 if(!selection_||(!dx&&!dy))return false;
 if(!floating_)return beginSelectionContentMove(false,allFrameLayers,dx,dy);
 auto transform=floating_->transform;transform.x+=dx;transform.y+=dy;if(transform.flipOriginX)*transform.flipOriginX+=dx;if(transform.flipOriginY)*transform.flipOriginY+=dy;if(transform.quad)for(auto& point:*transform.quad){point.x+=dx;point.y+=dy;}transformFloatingPaste(transform,floating_->rotSprite);return true;
}
void Document::prepareSelectionBoxMove(){if(floating_ && !floating_->clipboard)commitFloatingPaste();}
void Document::commitSelectionBox(std::optional<SelectionMask> before){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);if(selectionEqual(before,selection_))return;Edit e{{},state_,state_};e.documentChanged=false;e.pixelSelectionHistory.pixelSelectionEdit=true;e.pixelSelectionHistory.beforePixelsSelection=std::move(before);e.pixelSelectionHistory.afterPixelsSelection=selection_;pushEdit(std::move(e),U"移动选框");}
void Document::moveFloatingPaste(int x,int y){if(!floating_)return;auto transform=floating_->transform;if(transform.width<1 || transform.height<1){transform.width=floating_->source.width;transform.height=floating_->source.height;}transform.x=x;transform.y=y;transformFloatingPaste(transform,floating_->rotSprite);}
void Document::transformFloatingPaste(const SelectionTransform& transform,bool rotSprite){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);
 if(!floating_)return;if(floating_->freeTile){const bool previous=floating_->rotSprite;floating_->rotSprite=rotSprite;try{transformFreeTileSelectionMove(transform);}catch(...){floating_->rotSprite=previous;throw;}return;}auto& f=*floating_;const auto bounds=checkedFloatingBounds(transform);if(f.tilemap&&(tileSelection_.mode!=f.tilemapMode||layer().id!=f.layerId||frame().id!=f.frameId||layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer())||(!tilemapDeltaSupported()&&!linkedCreateFloatingSupported(f)&&!linkedEditFloatingSupported(f)&&!linkedHybridFloatingSupported(f))))throw std::logic_error("Tilemap floating target changed");if(!f.maskId.empty()){transformMaskFloating(transform,rotSprite);return;}
 if(f.targets.empty()){
  if(f.clipboard||timeline_.findCel(f.layerId,f.frameId)||layer().id!=f.layerId||frame().id!=f.frameId||layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer()))throw std::logic_error("Empty floating target changed");
  std::size_t extra=0;if(!floatingTranslation(transform,f.source))floatingAddBytes(extra,std::uint64_t(floatingArea(bounds.width,bounds.height))*192);checkFloatingBudget(f,extra);auto selected=floatingSelectionMask(f,transform);f.transform=transform;f.rotSprite=rotSprite;f.x=int(std::floor(transform.x));f.y=int(std::floor(transform.y));setSelectionValue(std::move(selected));return;
 }
 if(f.deferred){
  if(f.restoredFromDeselect){const auto old=f.transform;transformSparseFloatingPaste(transform,rotSprite);f.deferred=false;noteFloatingOverlayChange(f,old,transform);return;}
  if(f.targets.front().celId.empty()){
   if(!f.clipboard||timeline_.findCel(f.layerId,f.frameId)||layer().id!=f.layerId||frame().id!=f.frameId||!layer().kind.empty()||layerEffectivelyLocked(layer()))throw std::logic_error("Absent paste target changed");
   std::size_t extra=0;if(!floatingTranslation(transform,f.source))floatingAddBytes(extra,std::uint64_t(floatingArea(bounds.width,bounds.height))*192);if(rotSprite&&!f.targets.front().rotSprite)floatingAddBytes(extra,std::uint64_t(f.source.pixels.size())*5+12*1024*1024);checkFloatingBudget(f,extra);
   auto selected=floatingSelectionMask(f,transform);auto sampler=f.targets.front().rotSprite;if(rotSprite&&!sampler)sampler=std::make_shared<SelectionRotSpriteSource>(f.source);
   noteFloatingOverlayChange(f,f.transform,transform);f.targets.front().rotSprite=std::move(sampler);f.transform=transform;f.rotSprite=rotSprite;f.x=int(std::floor(transform.x));f.y=int(std::floor(transform.y));setSelectionValue(std::move(selected));return;
  }
  const auto& target=f.targets.front();const auto r=timeline_.resolveSurface(target.celId);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface||(!target.ownerId.empty()&&r.source->id!=target.ownerId))throw std::logic_error("Floating overlay owner changed");
  const auto layerIt=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==r.source->layerId;});if(layerIt==timeline_.state().layers.end()||layerEffectivelyLocked(*layerIt))throw std::logic_error("Floating layer is locked");
  std::size_t extra=0;if(floatingSymmetryRotation(f,transform)&&(!target.symmetryRotation||!target.symmetryRotation->matches(transform,rotSprite)))floatingAddBytes(extra,std::uint64_t(std::min(floatingArea(bounds.width,bounds.height),floatingArea(width_,height_)))*(192+symmetryMatrices(f.symmetryAxes).size()*sizeof(SymmetryRotationWrite)*2));if(!floatingTranslation(transform,f.source))floatingAddBytes(extra,std::uint64_t(floatingArea(bounds.width,bounds.height))*192);if(rotSprite&&!target.rotSprite)floatingAddBytes(extra,std::uint64_t(target.source.pixels.size())*5+12*1024*1024);checkFloatingBudget(f,extra);auto selection=floatingSelectionMask(f,transform);auto sampler=target.rotSprite;if(rotSprite&&!sampler)sampler=std::make_shared<SelectionRotSpriteSource>(target.source);auto owner=r.source->id;auto rotation=target.symmetryRotation;if(floatingSymmetryRotation(f,transform)){if(!rotation||!rotation->matches(transform,rotSprite))rotation=symmetryContentRotation(target.source,*f.beforeSelection,transform,width_,height_,f.symmetryAxes,f.symmetryCenter,rotSprite,sampler.get());}else rotation.reset();
  noteFloatingOverlayChange(f,f.transform,transform);f.targets.front().ownerId.swap(owner);f.targets.front().rotSprite=std::move(sampler);f.targets.front().symmetryRotation=std::move(rotation);f.transform=transform;f.rotSprite=rotSprite;f.x=int(std::floor(transform.x));f.y=int(std::floor(transform.y));setSelectionValue(std::move(selection));return;
 }

 bool sparse=f.sparse;for(const auto& target:f.targets){const auto r=timeline_.resolveSurface(target.celId);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface)throw std::logic_error("Invalid floating owner");if(!target.ownerId.empty()&&target.ownerId!=r.source->id)throw std::logic_error("Floating owner changed");raster::validate(*r.surface);sparse=sparse||!raster::fullCanvas(*r.surface,width_,height_);}
 if(sparse&&!f.tilemapPreview){transformSparseFloatingPaste(transform,rotSprite);return;}
 const bool translation=floatingTranslation(transform,f.source);const auto destination=(floatingSymmetryTranslation(f,transform)||floatingSymmetryScale(f,transform)||floatingSymmetryRotation(f,transform))?std::size_t(width_)*height_:floatingDestinationArea(bounds,width_,height_);std::size_t extra=0,workspace=0;
 if(!translation){floatingAddBytes(extra,std::uint64_t(floatingArea(bounds.width,bounds.height))*192);floatingAddBytes(extra,std::uint64_t(f.source.pixels.size())*5);workspace=destination*192;}
 for(const auto& target:f.targets){const auto writes=std::min<std::uint64_t>(std::uint64_t(width_)*height_,std::uint64_t(target.source.pixels.size())+destination);floatingAddBytes(extra,writes*128);if(rotSprite&&!target.rotSprite)floatingAddBytes(extra,std::uint64_t(target.source.pixels.size())*5+12*1024*1024);}
 if(floatingSymmetryRotation(f,transform))floatingAddBytes(extra,std::uint64_t(std::min(floatingArea(bounds.width,bounds.height),floatingArea(width_,height_)))*(192+symmetryMatrices(f.symmetryAxes).size()*sizeof(SymmetryRotationWrite)*2));floatingAddBytes(extra,workspace);checkFloatingBudget(f,extra);auto selection=floatingSelectionMask(f,transform);
 struct Stage{std::size_t target;std::string owner;timeline::Surface* live=nullptr;std::unordered_map<std::size_t,Delta> preview;std::shared_ptr<SelectionRotSpriteSource> sampler;};std::vector<Stage> stages;stages.reserve(f.targets.size());
 for(std::size_t n=0;n<f.targets.size();++n){auto& target=f.targets[n];const auto r=timeline_.resolveSurface(target.celId);auto existing=std::find_if(stages.begin(),stages.end(),[&](const auto& s){return s.owner==r.source->id;});const bool shared=existing!=stages.end();if(shared&&!f.beforeCelTimeline)continue;
  const auto l=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& layer){return layer.id==r.source->layerId;});if(l==timeline_.state().layers.end()||layerEffectivelyLocked(*l))throw std::logic_error("Floating layer is locked");
  Stage stage=shared?std::move(*existing):Stage{n,r.source->id};const auto primarySampler=stage.sampler;const auto& rollback=f.targets[stage.target];const auto& storage=f.tilemapPreview?f.tilemapPreview->tilemapBaseline:static_cast<const std::vector<Pixel>&>(r.surface->pixels);
  auto baseline=[&](std::size_t index){auto it=rollback.preview.find(index);return it==rollback.preview.end()?storage[index]:it->second.before;};
  auto read=[&](std::size_t index){auto it=stage.preview.find(index);return it==stage.preview.end()?baseline(index):it->second.after;};
  auto write=[&](int x,int y,Pixel value){value=normalizeCanvasPacked(value);if(translation&&f.tilemapEditCell){const auto& grid=*timeline_.resolveSurface(cel().id).source->tilemap;const auto anchor=*f.tilemapEditCell;const auto surface=timeline_.resolveSurface(cel().id).surface;const int left=surface->offsetX+int(anchor%grid.columns)*grid.tileWidth,top=surface->offsetY+int(anchor/grid.columns)*grid.tileHeight;if(x<left||y<top||x>=left+grid.tileWidth||y>=top+grid.tileHeight)return;}const auto index=std::size_t(y)*width_+x;if(read(index)==value)return;auto inserted=stage.preview.emplace(index,Delta{index,baseline(index),value});if(!inserted.second)inserted.first->second.after=value;};
  const auto& source=target.source;const auto& original=target.originalSource?*target.originalSource:source;
  if(!f.clipboard&&!f.copy)for(int row=0;row<original.height;++row)for(int col=0;col<original.width;++col){const auto i=std::size_t(row)*original.width+col;const auto px=std::int64_t(f.sourceX)+col,py=std::int64_t(f.sourceY)+row;if(original.mask[i]==1&&(!translation||floatingSymmetryTranslation(f,transform)||floatingSymmetryScale(f,transform)||floatingSymmetryRotation(f,transform)||(original.pixels[i]>>24))&&px>=0&&py>=0&&px<width_&&py<height_)write(int(px),int(py),0);}
  if(floatingSymmetryTranslation(f,transform)){symmetryContentTranslation(source,*f.beforeSelection,*f.symmetryStart,{int(transform.x)-f.sourceX,int(transform.y)-f.sourceY},width_,height_,f.symmetryAxes,f.symmetryCenter,[&](int x,int y,Pixel pixel){write(x,y,!f.copy&&selectionContains(f.beforeSelection,x,y)?pixel:brushComposite(baseline(std::size_t(y)*width_+x),pixel,100));});}
  else if(floatingSymmetryRotation(f,transform)){stage.sampler=target.rotSprite;if(rotSprite&&!stage.sampler)stage.sampler=std::make_shared<SelectionRotSpriteSource>(source);const auto rotationRaster=target.symmetryRotation&&target.symmetryRotation->matches(transform,rotSprite)?target.symmetryRotation:symmetryContentRotation(source,*f.beforeSelection,transform,width_,height_,f.symmetryAxes,f.symmetryCenter,rotSprite,stage.sampler.get());rotationRaster->each([&](int x,int y,Pixel pixel){write(x,y,!f.copy&&selectionContains(f.beforeSelection,x,y)?pixel:brushComposite(baseline(std::size_t(y)*width_+x),pixel,100));});}
  else if(floatingSymmetryScale(f,transform)){symmetryContentScale(source,*f.beforeSelection,transform,width_,height_,f.symmetryAxes,f.symmetryCenter,[&](int x,int y,Pixel pixel){write(x,y,!f.copy&&selectionContains(f.beforeSelection,x,y)?pixel:brushComposite(baseline(std::size_t(y)*width_+x),pixel,100));});}
  else if(translation&&floatingRepeat_!=repeat::Mode::Off){repeatedFloatingTranslation(source,original,f.sourceX,f.sourceY,transform,width_,height_,floatingRepeat_,f.copy||f.clipboard,[&](int x,int y){return baseline(std::size_t(y)*width_+x);},write);}
  else if(translation){const int x=int(transform.x),y=int(transform.y);const auto left=std::max<std::int64_t>(0,-std::int64_t(x)),top=std::max<std::int64_t>(0,-std::int64_t(y)),right=std::min<std::int64_t>(source.width,std::int64_t(width_)-x),bottom=std::min<std::int64_t>(source.height,std::int64_t(height_)-y);
   for(auto row=top;row<bottom;++row)for(auto col=left;col<right;++col){const auto i=std::size_t(row)*source.width+std::size_t(col);if(source.mask[i]!=1||!(source.pixels[i]>>24))continue;const int px=int(std::int64_t(x)+col),py=int(std::int64_t(y)+row);write(px,py,brushComposite(read(std::size_t(py)*width_+px),source.pixels[i],100));}
  }else{stage.sampler=target.rotSprite;if(rotSprite&&!stage.sampler)stage.sampler=std::make_shared<SelectionRotSpriteSource>(source);const auto cells=rotSprite?rotSpriteSelectionCells(source,transform,width_,height_,*stage.sampler):fastSelectionTransformCells(source,transform,width_,height_);for(auto cell:cells)write(cell.x,cell.y,brushComposite(read(std::size_t(cell.y)*width_+cell.x),cell.value,100));}
  for(auto it=stage.preview.begin();it!=stage.preview.end();)if(it->second.before==it->second.after)it=stage.preview.erase(it);else ++it;if(shared){stage.sampler=primarySampler;*existing=std::move(stage);}else stages.push_back(std::move(stage));
 }
 if(!f.tilemapPreview)for(auto& stage:stages){stage.live=timeline_.mutableOwnedSurface(stage.owner);if(!stage.live)throw std::logic_error("Missing floating install owner");}
 if(f.tilemapPreview){
  auto& g=*f.tilemapPreview;checkFloatingBudget(f,adjustmentStorageBudget(timeline_,1)+std::uint64_t(width_)*height_*4);auto next=g.tilemapBaseline;for(const auto& entry:stages.front().preview)next[entry.first]=entry.second.after;g.preview.swap(next);
  try{publishTilemapPreview(g);
   // Aligned Hybrid translations move cell references rather than editing shared sources.
   if(f.tilemapMode==tiles::Mode::Hybrid&&f.beforeSelection&&f.beforeSelection->mask.empty()&&translation&&!f.targets.front().originalSource){const auto r=timeline_.resolveSurface(g.celId);const auto& map=*r.source->tilemap;const auto& sel=*f.beforeSelection;const auto ox=r.surface->offsetX,oy=r.surface->offsetY;if((std::int64_t(sel.x)-ox)%map.tileWidth==0&&(std::int64_t(sel.y)-oy)%map.tileHeight==0&&sel.width%map.tileWidth==0&&sel.height%map.tileHeight==0&&(std::int64_t(transform.x)-ox)%map.tileWidth==0&&(std::int64_t(transform.y)-oy)%map.tileHeight==0){auto state=timeline_.state();auto& owner=state.cels[timeline_.cels_.at(r.source->id)];auto moved=map;const auto dc=(std::int64_t(transform.x)-sel.x)/map.tileWidth,dr=(std::int64_t(transform.y)-sel.y)/map.tileHeight;auto inside=[&](std::size_t i){const auto x=std::int64_t(ox)+int(i%map.columns)*map.tileWidth,y=std::int64_t(oy)+int(i/map.columns)*map.tileHeight;return x>=sel.x&&y>=sel.y&&x<std::int64_t(sel.x)+sel.width&&y<std::int64_t(sel.y)+sel.height;};if(!f.copy)for(std::size_t i=0;i<map.cells.size();++i)if(inside(i))moved.cells[i].reset();for(std::size_t i=0;i<map.cells.size();++i)if(inside(i)){const auto x=std::int64_t(i%map.columns)+dc,y=std::int64_t(i/map.columns)+dr;if(x>=0&&y>=0&&x<map.columns&&y<map.rows)moved.cells[std::size_t(y)*map.columns+std::size_t(x)]=map.cells[i];}owner.tilemap=std::move(moved);owner.surface->pixels=tiles::render(*owner.tilemap,state.tilesets);g.tilemapDisplay=timeline::Timeline(std::move(state));}}
  }catch(...){g.preview.swap(next);throw;}
 }
 change_={};for(auto& stage:stages){auto& target=f.targets[stage.target];if(!f.tilemapPreview){auto& storage=stage.live->pixels;for(const auto& item:target.preview){const auto& d=item.second;if(storage[d.index]!=d.before){storage[d.index]=d.before;change_.include(int(d.index%width_),int(d.index/width_));}}for(const auto& item:stage.preview){const auto& d=item.second;storage[d.index]=d.after;change_.include(int(d.index%width_),int(d.index/width_));}}target.preview.swap(stage.preview);target.ownerId.swap(stage.owner);if(!translation)target.rotSprite=std::move(stage.sampler);}
 f.restoredFromDeselect=false;f.rotSprite=rotSprite;f.transform=transform;f.x=int(std::floor(transform.x));f.y=int(std::floor(transform.y));setSelectionValue(std::move(selection));if(f.tilemapPreview){change_={0,0,width_,height_};++gradientRevision_;}publishChange();
}
bool Document::commitDeferredFloatingPaste(){
 auto& pending=*floating_;if(pending.targets.size()==1&&pending.targets.front().celId.empty()){
  if(!pending.clipboard||timeline_.findCel(pending.layerId,pending.frameId)||layer().id!=pending.layerId||frame().id!=pending.frameId||!layer().kind.empty()||layerEffectivelyLocked(layer()))throw std::logic_error("Absent paste commit target changed");
  checkFloatingBudget(pending,std::uint64_t(width_)*height_*(sizeof(Pixel)+sizeof(Delta)));
  auto pixels=floatingOverlayRegion({0,0,width_,height_});Edit edit{{},state_,nextState_};edit.beforeActive=edit.afterActive=pending.layerId;edit.beforeFrame=edit.afterFrame=pending.frameId;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.pixelSelectionHistory.pixelSelectionEdit=true;edit.pixelSelectionHistory.beforePixelsSelection=pending.beforeSelection;edit.pixelSelectionHistory.afterPixelsSelection=selection_;
  PixelRegion dirty;std::size_t changedCount=0;for(std::size_t i=0;i<pixels.size();++i)if(pixels[i]){++changedCount;dirty.include(int(i%width_),int(i/width_));}
  const auto bounds=checkedFloatingBounds(pending.transform);const int left=std::max(0,bounds.x),top=std::max(0,bounds.y),right=int(std::min<std::int64_t>(width_,std::int64_t(bounds.x)+bounds.width)),bottom=int(std::min<std::int64_t>(height_,std::int64_t(bounds.y)+bounds.height));const auto area=right>left&&bottom>top?std::size_t(right-left)*(bottom-top):0;
  // Legacy packed transform is dense; translation chooses dense above 1/4 coverage.
  const bool dense=floatingRepeat_==repeat::Mode::Off&&changedCount&&area&&(!floatingTranslation(pending.transform,pending.source)||changedCount>area/4);
  if(dense){DensePixels region{left,top,right-left,bottom-top,std::vector<Pixel>(area),{}};region.after.reserve(area);for(int y=top;y<bottom;++y)for(int x=left;x<right;++x)region.after.push_back(pixels[std::size_t(y)*width_+x]);edit.contentHistory.dense=std::move(region);}
  else{edit.pixels.reserve(changedCount);for(std::size_t i=0;i<pixels.size();++i)if(pixels[i])edit.pixels.push_back({i,0,pixels[i]});}
  const bool changed=changedCount!=0,selected=!selectionEqual(pending.beforeSelection,selection_);edit.documentChanged=changed;if(!changed)edit.afterState=state_;reserveHistoryEntries();
  if(changed){auto candidate=timeline_.state();timeline::Cel created;created.id="cel-"+pending.layerId+"-"+pending.frameId;for(std::size_t suffix=1;timeline_.findCelById(created.id);++suffix)created.id="cel-"+pending.layerId+"-"+pending.frameId+"-"+std::to_string(suffix);created.layerId=pending.layerId;created.frameId=pending.frameId;created.opacity=layer().opacity;created.surface=timeline::Surface{width_,height_,0,0,{},{},timeline::LinkedPixelStorage(std::move(pixels))};edit.contentHistory.targetCelId=created.id;edit.contentHistory.pixelAddress=PixelAddressSpace{width_,height_,0,0};const auto preferredOwner=created.id;candidate.cels.push_back(std::move(created));timeline::Timeline prepared(std::move(candidate),preferredOwner);auto previous=std::move(timeline_);timeline_=std::move(prepared);try{pushEdit(std::move(edit),U"变换选区内容");}catch(...){timeline_=std::move(previous);throw;}}
  else if(selected)pushEdit(std::move(edit),U"变换选区内容");
  noteFloatingOverlayChange(pending,pending.transform,pending.transform);floating_.reset();if(changed){change_=dirty;publishChange();}return changed;
 }
 auto& f=*floating_;if((floatingRepeat_!=repeat::Mode::Off&&floatingTranslation(f.transform,f.source))||floatingSymmetryTranslation(f,f.transform)||floatingSymmetryScale(f,f.transform)||floatingSymmetryRotation(f,f.transform)||!floatingTranslation(f.transform,f.source)){const auto old=f.transform;transformSparseFloatingPaste(f.transform,f.rotSprite);f.deferred=false;if(floatingRepeat_!=repeat::Mode::Off&&floatingTranslation(f.transform,f.source))setSelectionValue(repeat::wrapSelection(selection_,width_,height_,floatingRepeat_));noteFloatingOverlayChange(f,old,f.transform);return commitSparseFloatingPaste();}
 auto& target=f.targets.front();const auto r=timeline_.resolveSurface(target.celId);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface||r.source->id!=target.ownerId)throw std::logic_error("Floating commit owner changed");const auto li=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==r.source->layerId;});if(li==timeline_.state().layers.end()||li->locked)throw std::logic_error("Floating layer is locked");const auto& before=*r.surface;raster::validate(before);
 const auto dx=std::int64_t(f.x)-f.sourceX,dy=std::int64_t(f.y)-f.sourceY;const bool zero=!f.copy&&!dx&&!dy;
 const bool whole=!f.copy&&!f.clipboard&&f.beforeSelection&&f.beforeSelection->mask.empty()&&f.sourceX<=before.offsetX&&f.sourceY<=before.offsetY&&std::int64_t(f.sourceX)+f.source.width>=std::int64_t(before.offsetX)+before.width&&std::int64_t(f.sourceY)+f.source.height>=std::int64_t(before.offsetY)+before.height;
 Edit edit{{},state_,nextState_};edit.beforeActive=edit.afterActive=f.layerId;edit.beforeFrame=edit.afterFrame=f.frameId;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.pixelSelectionHistory.pixelSelectionEdit=true;edit.pixelSelectionHistory.beforePixelsSelection=f.beforeSelection;edit.pixelSelectionHistory.afterPixelsSelection=selection_;
 std::optional<timeline::Surface> candidate;bool changed=false,geometryChanged=false;
 if(!zero&&whole){const auto nx=raster::coordinate(std::int64_t(before.offsetX)+dx),ny=raster::coordinate(std::int64_t(before.offsetY)+dy);raster::coordinate(std::int64_t(nx)+before.width);raster::coordinate(std::int64_t(ny)+before.height);edit.contentHistory.ownerOffsets.push_back({target.ownerId,before.offsetX,before.offsetY,nx,ny});changed=true;}
 else if(!zero){
  raster::Rect64 sourceRect,targetRect;
  if(f.clipboard){targetRect={std::max<std::int64_t>(0,f.x),std::max<std::int64_t>(0,f.y),std::min<std::int64_t>(width_,std::int64_t(f.x)+f.source.width),std::min<std::int64_t>(height_,std::int64_t(f.y)+f.source.height)};sourceRect=targetRect;}
  else{sourceRect={std::max<std::int64_t>(f.sourceX,before.offsetX),std::max<std::int64_t>(f.sourceY,before.offsetY),std::min(std::int64_t(f.sourceX)+f.source.width,std::int64_t(before.offsetX)+before.width),std::min(std::int64_t(f.sourceY)+f.source.height,std::int64_t(before.offsetY)+before.height)};targetRect={sourceRect.left+dx,sourceRect.top+dy,sourceRect.right+dx,sourceRect.bottom+dy};}
  if(sourceRect.right>sourceRect.left&&sourceRect.bottom>sourceRect.top&&targetRect.right>targetRect.left&&targetRect.bottom>targetRect.top){
   const auto left=std::min<std::int64_t>(before.offsetX,targetRect.left),top=std::min<std::int64_t>(before.offsetY,targetRect.top),right=std::max(std::int64_t(before.offsetX)+before.width,targetRect.right),bottom=std::max(std::int64_t(before.offsetY)+before.height,targetRect.bottom);raster::coordinate(left);raster::coordinate(top);raster::coordinate(right);raster::coordinate(bottom);const auto w=right-left,h=bottom-top;if(w>std::numeric_limits<int>::max()||h>std::numeric_limits<int>::max())throw std::length_error("Floating translation geometry exceeds native range");const auto count=floatingArea(int(w),int(h));std::size_t extra=0;floatingAddBytes(extra,std::uint64_t(count)*12+convolutionSurfaceBytes(before));checkFloatingBudget(f,extra);
   candidate=raster::expanded(before,targetRect);geometryChanged=candidate.has_value();if(!candidate)candidate=before;
   const auto& original=target.originalSource?*target.originalSource:target.source;
   auto nextValue=[&](std::int64_t x,std::int64_t y){auto value=raster::readWorld(before,x,y);const auto sx=x-f.sourceX,sy=y-f.sourceY;if(!f.copy&&sx>=0&&sy>=0&&sx<original.width&&sy<original.height&&original.mask[std::size_t(sy)*original.width+std::size_t(sx)]==1)value=0;const auto tx=x-f.x,ty=y-f.y;if(tx>=0&&ty>=0&&tx<target.source.width&&ty<target.source.height){const auto i=std::size_t(ty)*target.source.width+std::size_t(tx);if(target.source.mask[i]==1&&(target.source.pixels[i]>>24))value=brushComposite(value,target.source.pixels[i],100);}return value;};
   auto writeRegion=[&](raster::Rect64 rect){for(auto y=rect.top;y<rect.bottom;++y)for(auto x=rect.left;x<rect.right;++x){const auto value=nextValue(x,y);const auto i=raster::worldIndex(*candidate,x,y);if(!i)continue;if(candidate->pixels[*i]!=value){candidate->pixels[*i]=value;changed=true;}}};
   if(!f.copy)writeRegion(sourceRect);writeRegion(targetRect);
   if(changed)edit.contentHistory.surfaceChanges.push_back({target.ownerId,before,*candidate});
  }
 }
 const bool selectionChanged=!selectionEqual(f.beforeSelection,selection_);edit.documentChanged=changed;if(!changed)edit.afterState=state_;checkFloatingBudget(f,0);capturePixelAddresses(edit);reserveHistoryEntries();auto* live=timeline_.mutableOwnedSurface(target.ownerId);if(!live)throw std::logic_error("Missing floating commit owner");
 noteFloatingOverlayChange(f,f.transform,f.transform);
 if(changed||geometryChanged){if(!edit.contentHistory.ownerOffsets.empty()){live->offsetX=edit.contentHistory.ownerOffsets.front().afterX;live->offsetY=edit.contentHistory.ownerOffsets.front().afterY;}else std::swap(*live,*candidate);change_={0,0,width_,height_};publishChange();}
 floating_.reset();if(changed||selectionChanged)pushEdit(std::move(edit),U"变换选区内容");return changed;
}
bool Document::commitSparseFloatingPaste(){
 auto& f=*floating_;std::size_t extra=0;std::vector<const FloatingTarget*> changed;changed.reserve(f.targets.size());
 for(const auto& target:f.targets){if(!target.baseline)continue;const auto r=timeline_.resolveSurface(target.celId);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface||r.source->id!=target.ownerId)throw std::logic_error("Floating owner changed before commit");raster::validate(*r.surface);if(target.preview.empty())continue;floatingAddBytes(extra,convolutionSurfaceBytes(*target.baseline));floatingAddBytes(extra,convolutionSurfaceBytes(*r.surface));changed.push_back(&target);}
 if(f.beforeSelection)floatingAddBytes(extra,f.beforeSelection->mask.size());if(selection_)floatingAddBytes(extra,selection_->mask.size());checkFloatingBudget(f,extra);
 Edit e{{},state_,changed.empty()?state_:nextState_};e.documentChanged=!changed.empty();e.pixelSelectionHistory.pixelSelectionEdit=true;e.pixelSelectionHistory.beforePixelsSelection=f.beforeSelection;e.pixelSelectionHistory.afterPixelsSelection=selection_;e.beforeActive=e.afterActive=f.layerId;e.beforeFrame=e.afterFrame=f.frameId;e.beforeSelection=e.afterSelection=selectedFrames_;e.beforeTimelineSelection=e.afterTimelineSelection=timelineSelection_;e.contentHistory.surfaceChanges.reserve(changed.size());
 for(const auto* target:changed)e.contentHistory.surfaceChanges.push_back({target->ownerId,*target->baseline,*timeline_.resolveSurface(target->celId).surface});
 const bool pixelsChanged=!changed.empty(),selectionChanged=!selectionEqual(f.beforeSelection,selection_);reserveHistoryEntries();capturePixelAddresses(e);floating_.reset();if(pixelsChanged||selectionChanged)pushEdit(std::move(e),U"变换选区内容");return pixelsChanged;
}
std::optional<bool> Document::commitHybridCellFloating(){
 auto& f=*floating_;if(f.tilemapMode!=tiles::Mode::Hybrid||f.clipboard||!f.beforeSelection||!f.beforeSelection->mask.empty()||!floatingTranslation(f.transform,f.source)||f.targets.front().originalSource)return {};
 const auto& selected=*f.beforeSelection;const auto resolvedOwner=timeline_.resolveSurface(cel().id);const auto& grid=*resolvedOwner.source->tilemap;const auto& t=f.transform;
 const int originX=resolvedOwner.surface->offsetX,originY=resolvedOwner.surface->offsetY;
 if((std::int64_t(selected.x)-originX)%grid.tileWidth||(std::int64_t(selected.y)-originY)%grid.tileHeight||selected.width%grid.tileWidth||selected.height%grid.tileHeight||(std::int64_t(t.x)-originX)%grid.tileWidth||(std::int64_t(t.y)-originY)%grid.tileHeight)return {};
 const auto dc=(std::int64_t(t.x)-selected.x)/grid.tileWidth,dr=(std::int64_t(t.y)-selected.y)/grid.tileHeight;
 // Legacy captureTilemapSelectionMove / previewTilemapSelectionMove: visit selected cells only.
 const auto left=std::max<std::int64_t>(0,(std::int64_t(selected.x)-originX)/grid.tileWidth),top=std::max<std::int64_t>(0,(std::int64_t(selected.y)-originY)/grid.tileHeight);
 const auto right=std::min<std::int64_t>(grid.columns,(std::int64_t(selected.x)+selected.width-originX)/grid.tileWidth),bottom=std::min<std::int64_t>(grid.rows,(std::int64_t(selected.y)+selected.height-originY)/grid.tileHeight);
 const auto selectedCount=right>left&&bottom>top?std::uint64_t(right-left)*std::uint64_t(bottom-top):0;
 checkFloatingBudget(f,selectedCount*2*(sizeof(tiles::Cell)+256));
 // Clear all sources before assigning destinations, including null cells and overlapping moves.
 std::map<std::size_t,std::optional<tiles::Cell>> updates;
 if(!f.copy)for(auto row=top;row<bottom;++row)for(auto col=left;col<right;++col)updates[std::size_t(row)*grid.columns+std::size_t(col)]=std::nullopt;
 for(auto row=top;row<bottom;++row)for(auto col=left;col<right;++col){const auto destCol=col+dc,destRow=row+dr;if(destCol>=0&&destRow>=0&&destCol<grid.columns&&destRow<grid.rows)updates[std::size_t(destRow)*grid.columns+std::size_t(destCol)]=grid.cells[std::size_t(row)*grid.columns+std::size_t(col)];}
 bool changed=false;TilemapPixelHistory payload;payload.celId=resolvedOwner.source->id;payload.tilesetEdit=false;payload.independentCellOwner=f.linkedHybrid;payload.linkedCellOwner=f.linkedHybrid;payload.cellOffsetLayout=true;payload.beforeSet.id=layer().tilemapTilesetId;
 // Include equal refs in the apply set to replace transient RGBA pixels with exact rendered cells.
 for(const auto& entry:updates){changed=changed||grid.cells[entry.first]!=entry.second;payload.cells.push_back({entry.first,grid.cells[entry.first],entry.second});}
 Edit edit{{},state_,changed?nextState_:state_};edit.documentChanged=changed;edit.pixelSelectionHistory.pixelSelectionEdit=true;edit.pixelSelectionHistory.beforePixelsSelection=f.beforeSelection;edit.pixelSelectionHistory.afterPixelsSelection=selection_;
 if(changed){edit.terminalHistory=std::make_shared<const TilemapPixelHistory>(std::move(payload));edit.tileHistory.beforeTileSelection=edit.tileHistory.afterTileSelection=tileSelection_;edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeFrameAnchor=edit.afterFrameAnchor=frameAnchor_;edit.layerHistory.beforeGroupUi=edit.layerHistory.afterGroupUi=GroupUiSnapshot{selectedGroupIds_,collapsedGroupIds_,selectedGroupId_};}
 const bool selectionChanged=!selectionEqual(f.beforeSelection,selection_);reserveHistoryEntries();edit.label.reserve(32);
 // Deferred compositor pixels never touched the cache; dense preview is replaced by exact cell patches.
 if(changed)applyEdit(edit,true);else if(!f.deferred&&!f.tilemapPreview){auto* live=timeline_.mutableOwnedSurface(f.targets.front().ownerId);if(!live)throw std::logic_error("Missing Hybrid floating owner");for(const auto& entry:f.targets.front().preview)live->pixels[entry.first]=entry.second.before;}
 if(f.deferred)noteFloatingOverlayChange(f,f.transform,f.transform);auto pending=std::move(floating_);floating_.reset();change_={0,0,width_,height_};publishChange();if(changed||selectionChanged)pushEdit(std::move(edit),U"变换选区内容");return changed;
}
bool Document::commitTilemapFloating(){
 auto& f=*floating_;if(tileSelection_.mode!=f.tilemapMode||layer().id!=f.layerId||frame().id!=f.frameId||layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer())||(!tilemapDeltaSupported()&&!linkedCreateFloatingSupported(f)&&!linkedEditFloatingSupported(f)&&!linkedHybridFloatingSupported(f))||f.targets.size()!=1)throw std::logic_error("Tilemap floating target changed");
 if(const auto cellMove=commitHybridCellFloating())return *cellMove;
 // Deferred Hybrid commits consume raw cell changes through the same tile
 // transaction algorithm. Avoid materializing a dense floating pixel preview.
 if(f.deferred&&f.tilemapMode==tiles::Mode::Hybrid){
  const auto resolved=timeline_.resolveSurface(f.targets.front().celId);const auto& grid=*resolved.source->tilemap;const auto ox=resolved.surface->offsetX,oy=resolved.surface->offsetY;std::set<std::size_t> indexes;const auto storageBytes=floatingStorageBudget(timeline_,f,selection_);
  auto include=[&](const SelectionMask& area){const auto l=std::max<std::int64_t>(0,std::max(0,area.x)-std::int64_t(ox)),t=std::max<std::int64_t>(0,std::max(0,area.y)-std::int64_t(oy)),r=std::min<std::int64_t>(std::int64_t(grid.columns)*grid.tileWidth,std::min<std::int64_t>(width_,std::int64_t(area.x)+area.width)-ox),b=std::min<std::int64_t>(std::int64_t(grid.rows)*grid.tileHeight,std::min<std::int64_t>(height_,std::int64_t(area.y)+area.height)-oy);if(r<=l||b<=t)return;for(auto y=t/grid.tileHeight;y<(b+grid.tileHeight-1)/grid.tileHeight;++y)for(auto x=l/grid.tileWidth;x<(r+grid.tileWidth-1)/grid.tileWidth;++x){const auto i=std::size_t(y)*grid.columns+std::size_t(x);if(!indexes.count(i)){auto used=storageBytes;floatingAddBytes(used,std::uint64_t(indexes.size()+1)*64);indexes.insert(i);}}};
  const auto bounds=checkedFloatingBounds(f.transform);include(bounds);if(floatingRepeat_!=repeat::Mode::Off&&floatingTranslation(f.transform,f.source))if(auto wrapped=repeat::wrapSelection(bounds,width_,height_,floatingRepeat_))include(*wrapped);if(!f.copy)include({f.sourceX,f.sourceY,f.source.width,f.source.height,{}});
  checkFloatingBudget(f,std::uint64_t(indexes.size())*(std::uint64_t(grid.tileWidth)*grid.tileHeight*8+128));tiles::CellPixelEdits regional;tiles::Catalog catalog(timeline_.state().tilesets);
  for(auto i:indexes){const PixelRegion cell{ox+int(i%grid.columns)*grid.tileWidth,oy+int(i/grid.columns)*grid.tileHeight,grid.tileWidth,grid.tileHeight};auto before=tiles::cellPixels(grid.cells[i],grid.tileWidth,grid.tileHeight,catalog),after=floatingOverlayRegion(cell,true);for(int y=0;y<cell.h;++y)for(int x=0;x<cell.w;++x)if(cell.x+x<0||cell.y+y<0||cell.x+x>=width_||cell.y+y>=height_)after[std::size_t(y)*cell.w+x]=before[std::size_t(y)*cell.w+x];if(before!=after)regional.emplace(i,std::make_pair(std::move(before),std::move(after)));}
  const auto beforeSelection=f.beforeSelection,afterSelection=selection_;const bool selectionChanged=!selectionEqual(beforeSelection,afterSelection);Edit selectionEdit{{},state_,state_};selectionEdit.documentChanged=false;selectionEdit.pixelSelectionHistory.pixelSelectionEdit=true;selectionEdit.pixelSelectionHistory.beforePixelsSelection=beforeSelection;selectionEdit.pixelSelectionHistory.afterPixelsSelection=afterSelection;reserveHistoryEntries();
  auto pending=std::move(floating_);floating_.reset();bool changed=false;try{changed=commitTilemapPixelCanvas({},{},U"变换选区内容",{},false,&beforeSelection,&afterSelection,false,false,false,false,false,pending->linkedHybrid,false,&regional);if(!changed&&selectionChanged)pushEdit(std::move(selectionEdit),U"变换选区内容");}catch(...){floating_=std::move(pending);throw;}++floatingOverlayRevision_;change_={0,0,width_,height_};publishChange();return changed;
 }
 const bool offsetGrid=(f.tilemapMode==tiles::Mode::Paint||f.tilemapMode==tiles::Mode::Create)&&!raster::fullCanvas(activeSurface(),width_,height_);
 std::vector<Pixel> offsetAfter;if(offsetGrid){checkFloatingBudget(f,std::uint64_t(width_)*height_*8);offsetAfter=floatingOverlayRegion({0,0,width_,height_});}
 if(f.deferred&&!offsetGrid){const auto transform=f.transform;const bool rotSprite=f.rotSprite;f.deferred=false;try{transformFloatingPaste(transform,rotSprite);}catch(...){f.deferred=true;throw;}noteFloatingOverlayChange(f,transform,transform);}
 checkFloatingBudget(f,std::uint64_t(width_)*height_*8+(f.beforeSelection?f.beforeSelection->mask.size():0)+(selection_?selection_->mask.size():0));
 auto after=offsetGrid?std::move(offsetAfter):(f.tilemapPreview?f.tilemapPreview->preview:canvasPixels()),before=offsetGrid?canvasPixels():(f.tilemapPreview?f.tilemapPreview->tilemapBaseline:after);for(const auto& entry:f.targets.front().preview)before[entry.first]=entry.second.before;
 const auto beforeSelection=f.beforeSelection,afterSelection=selection_;const auto editCell=f.tilemapEditCell;const bool selectionChanged=!selectionEqual(beforeSelection,afterSelection);
 Edit selectionEdit{{},state_,state_};if(selectionChanged){selectionEdit.documentChanged=false;selectionEdit.pixelSelectionHistory.pixelSelectionEdit=true;selectionEdit.pixelSelectionHistory.beforePixelsSelection=beforeSelection;selectionEdit.pixelSelectionHistory.afterPixelsSelection=afterSelection;selectionEdit.label.reserve(16);}reserveHistoryEntries();
 const bool sharedPreview=bool(f.tilemapPreview);auto pending=std::move(floating_);floating_.reset();if(sharedPreview)++gradientRevision_;bool changed=false;
 timeline::Surface* hybridRaw=nullptr;if(pending->tilemapMode==tiles::Mode::Hybrid&&!pending->tilemapPreview){hybridRaw=timeline_.mutableOwnedSurface(pending->targets.front().ownerId);if(!hybridRaw){floating_=std::move(pending);throw std::logic_error("Missing Hybrid floating owner");}for(const auto& entry:pending->targets.front().preview)hybridRaw->pixels[entry.first]=entry.second.before;}
 try{changed=commitTilemapPixelCanvas(before,after,U"变换选区内容",editCell,false,&beforeSelection,&afterSelection,false,false,false,pending->linkedCreate,pending->linkedEdit,pending->linkedHybrid,pending->tilemapMode==tiles::Mode::Paint);if(!changed&&selectionChanged)pushEdit(std::move(selectionEdit),U"变换选区内容");}
 catch(...){if(hybridRaw)for(const auto& entry:pending->targets.front().preview)hybridRaw->pixels[entry.first]=entry.second.after;floating_=std::move(pending);throw;}
 if(hybridRaw){change_={0,0,width_,height_};publishChange();}
 if(sharedPreview){change_={0,0,width_,height_};publishChange();}return changed;
}
bool Document::commitFloatingPaste(){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_,bool(floating_));
 const bool hadFloating=bool(floating_);const bool changed=commitFloatingPasteImpl();
 if(hadFloating&&!floating_)animationChangeBinding_.publish(*this,{AnimationChange::Kind::FloatingSettled});
 return changed;
}
bool Document::commitFloatingPasteImpl(){
 if(!floating_)return false;if(!floating_->freeTile&&!floating_->tilemap&&floatingRepeat_!=repeat::Mode::Off&&floatingTranslation(floating_->transform,floating_->source))setSelectionValue(repeat::wrapSelection(selection_,width_,height_,floatingRepeat_));if(floating_->freeTile)return commitFreeTileSelectionMove();if(floating_->tilemap)return commitTilemapFloating();if(floating_->restoredFromDeselect){floating_.reset();return false;}if(!floating_->maskId.empty())return commitMaskFloating();if(floating_->deferred)return commitDeferredFloatingPaste();if(floating_->sparse&&!floating_->beforeCelTimeline)return commitSparseFloatingPaste();auto& f=*floating_;
 for(const auto& target:f.targets)if(!target.ownerId.empty()){const auto r=timeline_.resolveSurface(target.celId);if(r.issue!=timeline::LinkIssue::None||!r.source||r.source->id!=target.ownerId)throw std::logic_error("Floating commit owner changed");}
 std::size_t extra=0;if(f.beforeSelection)floatingAddBytes(extra,f.beforeSelection->mask.size());if(selection_)floatingAddBytes(extra,selection_->mask.size());
 if(f.beforeCelTimeline)floatingAddBytes(extra,adjustmentStorageBudget(timeline_,1));else for(const auto& target:f.targets)floatingAddBytes(extra,std::uint64_t(target.preview.size())*sizeof(Delta));checkFloatingBudget(f,extra);
 Edit e{{},state_,nextState_};e.beforeActive=e.afterActive=f.layerId;e.beforeFrame=e.afterFrame=f.frameId;e.pixelSelectionHistory.pixelSelectionEdit=true;e.pixelSelectionHistory.beforePixelsSelection=f.beforeSelection;e.pixelSelectionHistory.afterPixelsSelection=selection_;
 // Legacy historyEntryWithAnimationSelection restores document editing on both sides.
 if(f.beforeCelTimeline)e.maskHistory.maskContext=std::make_shared<MaskHistory::MaskContextHistory>(MaskHistory::MaskContextHistory{{},{},false,false});
 if(f.beforeCelTimeline&&f.beforeCelTimeline->frames.size()==timeline_.state().frames.size()){
  const bool pixelsChanged=std::any_of(f.targets.begin(),f.targets.end(),[](const auto& target){return std::any_of(target.preview.begin(),target.preview.end(),[](const auto& entry){return entry.second.before!=entry.second.after;});});
  if(!pixelsChanged){const bool selectionChanged=!selectionEqual(f.beforeSelection,selection_);e.documentChanged=false;e.afterState=state_;floating_.reset();if(selectionChanged)pushEdit(std::move(e),U"变换选区内容");return false;}
 }
 if(f.beforeCelTimeline){e.snapshotHistory.afterTimeline=timeline_.state();e.beforeTimelineSelection=e.afterTimelineSelection=f.beforeTimelineSelection;e.beforeSelection=e.afterSelection=f.beforeSelectedFrames;reserveHistoryEntries();e.snapshotHistory.beforeTimeline=std::move(f.beforeCelTimeline);floating_.reset();pushEdit(std::move(e),U"变换选区内容");return true;}
 for(const auto& target:f.targets){Edit child{{},state_,nextState_};child.contentHistory.targetCelId=target.celId;for(const auto& item:target.preview){const auto& delta=item.second;if(delta.before!=delta.after)child.pixels.push_back(delta);}if(!child.pixels.empty())e.children.push_back(std::move(child));}
 const bool pixelsChanged=!e.children.empty(),selectionChanged=!selectionEqual(f.beforeSelection,selection_);if(!pixelsChanged){e.documentChanged=false;e.afterState=state_;}
 if(e.children.size()==1){e.contentHistory.targetCelId=e.children.front().contentHistory.targetCelId;e.pixels=std::move(e.children.front().pixels);e.children.clear();}
 capturePixelAddresses(e);reserveHistoryEntries();floating_.reset();if(pixelsChanged||selectionChanged)pushEdit(std::move(e),U"变换选区内容");return pixelsChanged;
}
void Document::cancelFloatingPaste(){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_,bool(floating_));
 const bool hadFloating=bool(floating_);cancelFloatingPasteImpl();
 if(hadFloating&&!floating_)animationChangeBinding_.publish(*this,{AnimationChange::Kind::FloatingSettled});
}
void Document::cancelFloatingPasteImpl(){
 if(!floating_)return;if(floating_->restoredFromDeselect){floating_.reset();return;}auto& f=*floating_;if(!f.maskId.empty()){cancelMaskFloating();return;}if(f.deferred){noteFloatingOverlayChange(f,f.transform,f.transform);setSelectionValue(std::move(f.beforeSelection));floating_.reset();return;}
 if(f.beforeCelTimeline){std::size_t extra=0;for(const auto& cel:f.beforeCelTimeline->cels)if(cel.surface)floatingAddBytes(extra,convolutionSurfaceBytes(*cel.surface));checkFloatingBudget(f,extra);timeline::Timeline restored(*f.beforeCelTimeline);timeline_=std::move(restored);timelineSelection_=std::move(f.beforeTimelineSelection);selectedFrames_=std::move(f.beforeSelectedFrames);activeLayerId_=std::move(f.layerId);activeFrameId_=std::move(f.frameId);setSelectionValue(std::move(f.beforeSelection));floating_.reset();change_={0,0,width_,height_};publishChange();return;}
 if(f.tilemapPreview){for(const auto& target:f.targets){const auto r=timeline_.resolveSurface(target.celId);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface||(!target.ownerId.empty()&&r.source->id!=target.ownerId))throw std::logic_error("Floating cancel owner changed");}setSelectionValue(std::move(f.beforeSelection));floating_.reset();++gradientRevision_;change_={0,0,width_,height_};publishChange();return;}
 struct Restore{FloatingTarget* target;timeline::Surface* live;};std::vector<Restore> restore;restore.reserve(f.targets.size());
 for(auto& target:f.targets){if(f.sparse&&!target.baseline)continue;const auto r=timeline_.resolveSurface(target.celId);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface||(!target.ownerId.empty()&&r.source->id!=target.ownerId))throw std::logic_error("Floating cancel owner changed");auto* live=timeline_.mutableOwnedSurface(r.source->id);if(!live)throw std::logic_error("Missing floating cancel owner");restore.push_back({&target,live});}
 change_={};for(auto& item:restore){auto& target=*item.target;if(f.sparse){std::swap(*item.live,*target.baseline);change_={0,0,width_,height_};}else for(const auto& entry:target.preview){const auto& delta=entry.second;if(item.live->pixels[delta.index]!=delta.before){item.live->pixels[delta.index]=delta.before;change_.include(int(delta.index%width_),int(delta.index/width_));}}}
 const bool sharedPreview=bool(f.tilemapPreview);setSelectionValue(std::move(f.beforeSelection));floating_.reset();if(sharedPreview){++gradientRevision_;change_={0,0,width_,height_};}publishChange();
}

}



namespace moon {
void Document::setImportedProjectBrushes(std::vector<ProjectBrushResource> brushes){std::set<std::string> ids;for(const auto& resource:brushes){const auto& b=resource.brush;if(resource.metadata.id.empty()||!ids.insert(resource.metadata.id).second||b.width<1||b.height<1||std::uint64_t(b.width)*b.height>16*1024*1024||b.coverage.size()!=std::size_t(b.width)*b.height||(!b.colors.empty()&&b.colors.size()!=b.coverage.size()))throw std::invalid_argument("Invalid imported project brush");}projectBrushes_=std::move(brushes);++projectBrushRevision_;}
bool Document::deleteProjectBrush(const std::string& id){auto item=std::find_if(projectBrushes_.begin(),projectBrushes_.end(),[&](const auto& brush){return brush.metadata.id==id;});if(item==projectBrushes_.end())return false;projectBrushes_.erase(item);++projectBrushRevision_;modified_=true;state_=nextState_++;++revision_;++contentRevision_;return true;}
}




namespace moon {
void Document::projectActiveLayerGeometry(){
 for(const auto& l:timeline_.state().layers){const auto* c=timeline_.findCel(l.id,activeFrameId_);if(!c)continue;const auto resolved=timeline_.resolveSurface(c->id);if(const auto* surface=resolved.surface)displayedLayerGeometry_[l.id]={surface->width,surface->height,surface->offsetX,surface->offsetY};}
}
void Document::projectActiveCelOpacities(){projectActiveLayerGeometry();for(auto& l:timeline_.state_.layers)l.opacity=frameCelOpacity(timeline_,l,activeFrameId_);}
bool Document::beginCelProperties(const std::string& id,const std::vector<std::string>& frozen){commitCelProperties();commitFloatingPaste();cancelStroke();cancelLayerOpacity();const auto* c=timeline_.findCelById(id);if(!c)return false;auto r=timeline_.resolveSurface(id);if(r.issue!=timeline::LinkIssue::None||!r.source)return false;celPropertyPreview_=CelPropertyPreview{identity_,c->layerId,c->frameId,frozen.empty()?std::vector<std::string>{id}:frozen,{}};return true;}
bool Document::previewCelProperties(double opacity,double z){if(!celPropertyPreview_||celPropertyPreview_->identity!=identity_)return false;auto& p=*celPropertyPreview_;auto plan=planCelProperties(timeline_,p.layerId,p.frameId,opacity,z,p.targets);if(!plan.changed())return false;p.steps.push_back(std::move(plan));try{applyCelPropertiesPlan(timeline_.state_,p.steps.back(),true);timeline_.invalidateCompositeOrder();}catch(...){p.steps.pop_back();throw;}projectActiveCelOpacities();change_={0,0,width_,height_};publishChange();return true;}
void Document::commitCelProperties(){if(!celPropertyPreview_)return;if(celPropertyPreview_->identity!=identity_||celPropertyPreview_->steps.empty()){celPropertyPreview_.reset();return;}Edit e{{},state_,nextState_};e.children.reserve(celPropertyPreview_->steps.size());reserveHistoryEntries();for(auto& p:celPropertyPreview_->steps){Edit child{{},state_,nextState_};child.contentHistory.celProperties=std::move(p);e.children.push_back(std::move(child));}celPropertyPreview_.reset();if(e.children.size()==1){auto child=std::move(e.children.front());pushEdit(std::move(child),U"修改单元格属性");}else pushEdit(std::move(e),U"修改单元格属性");}
void Document::cancelCelProperties(){if(!celPropertyPreview_)return;auto p=std::move(*celPropertyPreview_);celPropertyPreview_.reset();if(p.identity!=identity_||p.steps.empty())return;for(auto i=p.steps.rbegin();i!=p.steps.rend();++i)applyCelPropertiesPlan(timeline_.state_,*i,false);timeline_.invalidateCompositeOrder();projectActiveCelOpacities();change_={0,0,width_,height_};publishChange();}
// applyCelPropertiesEdit: definition in its history domain unit.
}

namespace moon {
void Document::syncActiveLayerCelOpacity(const std::string& id){auto li=timeline_.layers_.find(id);if(li==timeline_.layers_.end())return;const auto* c=timeline_.findCel(id,activeFrameId_);if(!c)return;auto r=timeline_.resolveSurface(c->id);if(r.issue!=timeline::LinkIssue::None||!r.source)throw std::logic_error("Invalid active Cel opacity link");auto value=timeline_.state_.layers[li->second].opacity;timeline_.state_.cels.at(timeline_.cels_.at(r.source->id)).opacity=value;timeline_.state_.cels.at(timeline_.cels_.at(c->id)).opacity=value;}
}

namespace moon {
void Document::previewLayerBlendMode(const std::string& mode){if(!opacityBefore_||!parseLayerBlendMode(mode))return;bool changed=false;for(auto& g:timeline_.state_.groups)for(const auto& b:groupPropertiesBefore_)if(g.id==b.id&&!timeline::isGroupEffectivelyLocked(timeline_.state(),g)&&g.blendMode!=mode){g.blendMode=mode;changed=true;}for(auto& l:timeline_.state_.layers)if(!layerEffectivelyLocked(l)&&std::any_of(layerBlendModesBefore_.begin(),layerBlendModesBefore_.end(),[&](const auto& b){return b.first==l.id;})&&l.blendMode!=mode){l.blendMode=mode;changed=true;}if(changed){change_={0,0,width_,height_};publishChange();}}
}

void moon::Document::captureLayerMetadataPreview(){std::vector<std::string> ids;for(const auto& v:layerNamesBefore_)ids.push_back(v.first);layerMetadataBefore_=captureLayerMetadata(timeline_.state(),ids);layerDescriptionChanged_=false;linkedDisplayBefore_.clear();std::set<std::string> peers;for(const auto& selected:layerMetadataBefore_){const auto& layer=timeline_.state().layers[timeline_.layerIndex(selected.layerId)];if(layer.linkedContentId.empty())continue;for(const auto& peer:timeline_.state().layers)if(peer.linkedContentId==layer.linkedContentId&&std::none_of(layerMetadataBefore_.begin(),layerMetadataBefore_.end(),[&](const auto& v){return v.layerId==peer.id;})&&peers.insert(peer.id).second)linkedDisplayBefore_.push_back({peer.id,peer.displayColor});}}
void moon::Document::previewLayerDisplayColor(std::optional<Pixel> c){if(!opacityBefore_)return;for(auto& g:timeline_.state_.groups)for(const auto& b:groupPropertiesBefore_)if(g.id==b.id)g.displayColor=c;for(const auto& b:layerMetadataBefore_)timeline_.state_.layers[timeline_.layerIndex(b.layerId)].displayColor=c;for(const auto& p:linkedDisplayBefore_)timeline_.state_.layers[timeline_.layerIndex(p.first)].displayColor=c;}
void moon::Document::previewLayerDescription(const std::u32string& text){if(!opacityBefore_)return;layerDescriptionChanged_=true;for(auto& g:timeline_.state_.groups)for(const auto& b:groupPropertiesBefore_)if(g.id==b.id)g.description=text;for(const auto& b:layerMetadataBefore_)timeline_.state_.layers[timeline_.layerIndex(b.layerId)].description=text;}

void moon::Document::setImportedReferenceImages(ReferenceLibrary images){validateReferenceLibrary(images);referenceImages_=std::move(images);}
bool moon::Document::addReferenceImage(ReferenceImage image){validateReferenceImage(image);if(std::any_of(referenceImages_.begin(),referenceImages_.end(),[&](const auto& i){return i.id==image.id;}))throw std::invalid_argument("Duplicate reference image");referenceImages_.push_back(std::move(image));modified_=true;state_=nextState_++;++revision_;return true;}
bool moon::Document::removeReferenceImage(const std::string& id){const auto it=std::find_if(referenceImages_.begin(),referenceImages_.end(),[&](const auto& i){return i.id==id;});if(it==referenceImages_.end())return false;referenceImages_.erase(it);modified_=true;state_=nextState_++;++revision_;return true;}
