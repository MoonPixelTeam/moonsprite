#include "free_tile_selection_target.h"
#include "relative_luminance.h"
#include "symmetry_content_translation.h"
#include "mask_resize.h"
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
#include "layer_compositor.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace moon {
std::vector<Pixel> Document::canvasPixels()const{
 const auto& s=activeSurface();raster::validate(s);if(raster::fullCanvas(s,width_,height_))return s.pixels;
 std::vector<Pixel> out(std::size_t(width_)*height_);const auto left=std::max<std::int64_t>(0,s.offsetX),top=std::max<std::int64_t>(0,s.offsetY),right=std::min<std::int64_t>(width_,std::int64_t(s.offsetX)+s.width),bottom=std::min<std::int64_t>(height_,std::int64_t(s.offsetY)+s.height);
 for(auto y=top;y<bottom;++y)if(right>left)std::copy_n(s.pixels.begin()+std::size_t(y-s.offsetY)*s.width+std::size_t(left-s.offsetX),std::size_t(right-left),out.begin()+std::size_t(y)*width_+std::size_t(left));return out;
}
std::optional<SelectionMask> Document::selectionContentBounds(const SelectionMask& selection)const{
 const auto& s=activeSurface();raster::validate(s);const auto l=std::max<std::int64_t>(selection.x,s.offsetX),t=std::max<std::int64_t>(selection.y,s.offsetY),r=std::min<std::int64_t>(std::int64_t(selection.x)+selection.width,std::int64_t(s.offsetX)+s.width),b=std::min<std::int64_t>(std::int64_t(selection.y)+selection.height,std::int64_t(s.offsetY)+s.height);
 std::int64_t left=r,top=b,right=l-1,bottom=t-1;for(auto y=t;y<b;++y)for(auto x=l;x<r;++x)if(selectionContains(selection,int(x),int(y))&&(raster::readWorld(s,x,y)>>24)){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x);bottom=std::max(bottom,y);}if(right<left||bottom<top)return {};
 SelectionMask out{raster::coordinate(left),raster::coordinate(top),raster::coordinate(right-left+1),raster::coordinate(bottom-top+1),{}};if(!selection.mask.empty()){out.mask.resize(std::size_t(out.width)*out.height);for(int y=0;y<out.height;++y)for(int x=0;x<out.width;++x)out.mask[std::size_t(y)*out.width+x]=selectionContains(selection,out.x+x,out.y+y)?1:0;}return out;
}
void PixelRegion::include(int px,int py) {
  if(empty()) {x=px;y=py;w=h=1;return;}
  const int right=std::max(x+w,px+1),bottom=std::max(y+h,py+1);
  x=std::min(x,px);y=std::min(y,py);w=right-x;h=bottom-y;
}
Document::Document(int w,int h,std::size_t maxBytes,std::size_t maxEntries)
  : width_(w),height_(h),maxBytes_(maxBytes),maxEntries_(std::clamp<std::size_t>(maxEntries,1,10000)) {
  static std::atomic<std::uint64_t> nextIdentity{0};identity_=++nextIdentity;
  if (w < 1 || h < 1 || w > 1024 || h > 1024)
    throw std::invalid_argument("Prototype canvas must be 1..1024 pixels per side");
  timeline::State initial;
  initial.layers.push_back({"layer-"+std::to_string(identity_),U"图层 1"});
  initial.frames.push_back({"frame-1",100});
  timeline::Surface surface;surface.width=w;surface.height=h;
  surface.pixels.resize(static_cast<std::size_t>(w)*h);
  timeline::Cel first;first.id="cel-"+std::to_string(identity_);
  first.layerId=initial.layers.front().id;first.frameId=initial.frames.front().id;
  first.opacity=1;first.surface=std::move(surface);initial.cels.push_back(std::move(first));
  activeLayerId_=initial.layers.front().id;activeFrameId_=initial.frames.front().id;initial.canvasWidth=width_;initial.canvasHeight=height_;timeline_=timeline::Timeline(std::move(initial));
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
  if(width<1 || height<1 || width>1024 || height>1024)
    throw std::invalid_argument("精灵表新建文档仅支持每边 1..1024 像素；请改用导出 PNG 文件");
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
  std::string projectId,std::u32string name,std::shared_ptr<const std::vector<std::uint8_t>> sourceArchive) {
  // Build and validate a candidate before the caller replaces its active session.
  if(projectId.empty() || !sourceArchive || state.layers.empty() || state.frames.empty() || state.cels.size()!=state.layers.size()*state.frames.size())
    throw std::invalid_argument("Unsupported imported document structure");
  if(palette.columns<1||palette.columns>256)throw std::invalid_argument("Invalid imported palette columns");
  state.canvasWidth=width;state.canvasHeight=height;timeline::Timeline validated(std::move(state));
  if(!validated.diagnoseLinks().empty())throw std::invalid_argument("Invalid imported cel link");

  for(const auto& cel:validated.state().cels){const auto resolved=validated.resolveSurface(cel.id);const auto* surface=resolved.surface;
    if(!surface)throw std::invalid_argument("Missing imported surface");raster::validate(*surface);raster::coordinate(std::int64_t(surface->offsetX)+surface->width);raster::coordinate(std::int64_t(surface->offsetY)+surface->height);}
  Document result(width,height);result.timeline_=std::move(validated);result.activeLayerId_=result.timeline_.state().layers.front().id;result.activeFrameId_=result.timeline_.state().frames.front().id;result.palette_=std::move(palette);
  result.projectId_=std::move(projectId);result.name_=std::move(name);result.sourceArchive_=std::move(sourceArchive);result.projectActiveCelOpacities();
  return result;
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
void Document::selectFrame(const std::string& id) {
 commitFloatingPaste();cancelStroke();cancelGradient();cancelLayerOpacity();if(id==activeFrameId_ || !timeline_.hasFrame(id))return;
 freeInstanceSelected_.clear();freeInstancePrimary_.clear();freeInstanceAnchor_.clear();freeInstanceSelectionFrame_=id;
 activeMaskId_.clear();maskIsolated_=false;activeFrameId_=id;projectActiveCelOpacities();change_={0,0,width_,height_};publishChange();
}
void Document::selectFrameHeader(const std::string& id,int mode,bool preserve){if(!timeline_.hasFrame(id))return;if(freeTileInstanceView())setFreeTileInstanceView(false);const auto maskContext=activeMaskId_;const bool isolated=maskIsolated_;if(!timelineSelection_.maskRows.empty()){selectedGroupIds_.clear();selectedGroupId_.reset();timelineSelection_.layers.clear();timelineSelection_.layerAnchor.clear();}timelineSelection_.cels.clear();timelineSelection_.celAnchor.clear();if(!mode){selectedGroupIds_.clear();selectedGroupId_.reset();timelineSelection_.layers.clear();timelineSelection_.layerAnchor.clear();}const auto& frames=timeline_.state().frames;if(mode==2 && !frameAnchor_.empty()){const int a=timeline_.hasFrame(frameAnchor_)?int(timeline_.frameIndex(frameAnchor_)):-1,b=int(timeline_.frameIndex(id));if(a>=0 && b>=0){selectedFrames_.clear();for(int i=std::min(a,b);i<=std::max(a,b);++i)selectedFrames_.push_back(frames[i].id);}}else if(mode==1){auto it=std::find(selectedFrames_.begin(),selectedFrames_.end(),id);if(it==selectedFrames_.end())selectedFrames_.push_back(id);else selectedFrames_.erase(it);std::sort(selectedFrames_.begin(),selectedFrames_.end(),[&](const auto& a,const auto& b){return timeline_.frameIndex(a)<timeline_.frameIndex(b);});}else selectedFrames_={id};if(mode!=1 || frameAnchor_.empty())frameAnchor_=id;if(!preserve)selectFrame(id);if(!maskContext.empty()){activeMaskId_=maskContext;maskIsolated_=isolated;}}
void Document::moveSelectedFrames(const std::string& target,bool after){cancelStroke();cancelLayerOpacity();timeline::State previous;previous.frames=timeline_.state().frames;previous.loopSections=timeline_.state().loopSections;auto selected=selectedFrames_.empty()?std::vector<std::string>{frame().id}:selectedFrames_;auto has=[&](const auto& id){return std::find(selected.begin(),selected.end(),id)!=selected.end();};std::vector<DocumentFrame> moving,remaining;std::vector<std::string> movingIds;int targetOriginal=-1,movingStart=100000,movingEnd=-1;for(int i=0;i<int(previous.frames.size());++i){const auto& f=previous.frames[i];if(f.id==target)targetOriginal=i;if(has(f.id)){moving.push_back(f);movingIds.push_back(f.id);movingStart=std::min(movingStart,i);movingEnd=i;}else remaining.push_back(f);}if(targetOriginal<0 || moving.empty())return;auto targetIt=std::find_if(remaining.begin(),remaining.end(),[&](const auto& f){return f.id==target;});int insertion=targetIt!=remaining.end()?int(targetIt-remaining.begin())+(after?1:0):int(std::count_if(previous.frames.begin(),previous.frames.begin()+targetOriginal,[&](const auto& f){return !has(f.id);}));int side=has(target)?(after?1:-1):targetOriginal==movingStart-1 && after?-1:targetOriginal==movingEnd+1 && !after?1:0;auto reordered=remaining;reordered.insert(reordered.begin()+insertion,moving.begin(),moving.end());auto loops=timeline::reconcileLoopsReorder(previous,remaining,reordered,movingIds,insertion,side);bool same=previous.frames.size()==reordered.size() && previous.loopSections.size()==loops.size();for(std::size_t i=0;i<previous.frames.size() && same;++i)same=previous.frames[i].id==reordered[i].id;for(std::size_t i=0;i<loops.size() && same;++i)same=previous.loopSections[i].startFrameId==loops[i].startFrameId && previous.loopSections[i].endFrameId==loops[i].endFrameId;if(same)return;Edit e{{},state_,nextState_};captureFrameOrder(e,false);e.beforeLoops=previous.loopSections;e.beforeSelection=selectedFrames_;timeline_.state_.frames=std::move(reordered);timeline_.state_.loopSections=std::move(loops);selectedFrames_=movingIds;timeline_.buildIndex();projectActiveCelOpacities();captureFrameOrder(e,true);e.afterLoops=timeline_.state().loopSections;e.afterSelection=selectedFrames_;change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"移动动画帧");}
void Document::groupEdits(std::size_t start,const std::vector<std::string>& selection){if(start>=position_)return;if(pendingGroupedProjectOperation_&&!groupingHistory_){projectInformation_.operation();pendingGroupedProjectOperation_=false;}Edit group{{},history_[start].beforeState,history_[position_-1].afterState};group.label=history_[position_-1].label;++historyRevision_;group.beforeSelection=selection;group.afterSelection=selectedFrames_;for(std::size_t i=start;i<position_;++i){historyBytes_-=history_[i].bytes();group.children.push_back(std::move(history_[i]));}history_.resize(start);history_.push_back(std::move(group));position_=history_.size();historyBytes_+=history_.back().bytes();while((historyBytes_>maxBytes_ && position_>1) || history_.size()>maxEntries_){historyBytes_-=history_.front().bytes();history_.erase(history_.begin());--position_;}if(!groupingHistory_&&history_.back().documentChanged)notifyRecording();}
// Whole RGBA cel snapshot: legacy snapshotLinkedAnimationCels rebase and block anchor.
bool Document::copySelectedCels(){if(hasFreeTileContent())throw std::runtime_error("Free tile clipboard migration is not available; convert to raster first");if(hasTilemapContent()&&(active()||selection_||!activeMaskId_.empty()))throw std::runtime_error("Only complete inactive tilemap Cel copy is migrated");

 std::vector<CelClipboardItem> items;const auto& state=timeline_.state();
 for(int r=0;r<int(state.layers.size());++r)for(int c=0;c<int(state.frames.size());++c){const auto* cel=timeline_.findCel(state.layers[r].id,state.frames[c].id);if(cel && std::find(timelineSelection_.cels.begin(),timelineSelection_.cels.end(),cel->id)!=timelineSelection_.cels.end())items.push_back({*cel,r,c});}
 if(items.empty()){celClipboard_.clear();frameClipboard_.clear();return false;}
 std::unordered_set<std::string> selected;for(const auto& item:items)selected.insert(item.cel.id);
 std::unordered_map<std::string,std::string> roots;
 const int row=items.front().row,col=items.front().column;
 for(auto& item:items){const auto resolved=timeline_.resolveSurface(item.cel.id);if(resolved.issue!=timeline::LinkIssue::None)throw std::runtime_error("Cannot resolve copied Cel");if(resolved.surface)raster::validate(*resolved.surface);const auto source=resolved.source->id;auto root=roots.find(source);if(root==roots.end())root=roots.emplace(source,selected.count(source)?source:item.cel.id).first;
 item.cel.tilemap=resolved.source->tilemap;item.cel.text=resolved.source->text;const auto* mask=timeline::directMask(state,item.cel.layerId,item.cel.frameId);if(mask){item.mask=*mask;const auto* resolvedMask=timeline::resolvedMask(state,item.cel.layerId,item.cel.frameId);if(!resolvedMask)throw std::invalid_argument("Invalid copied Cel mask");item.mask->mask.surface=resolvedMask->surface;}item.cel.surface=resolved.surface?std::optional<timeline::Surface>{*resolved.surface}:std::nullopt;item.cel.linkedCelId=item.cel.id==root->second?std::nullopt:std::optional<std::string>{root->second};item.cel.runtimeSharedCelId.reset();if(selection_){const auto clipped=rectangleSelection(selection_->x,selection_->y,selection_->width,selection_->height,width_,height_);if(!clipped)throw std::runtime_error("Invalid Cel copy selection");SelectionClipboard pixels;pixels.width=clipped->width;pixels.height=clipped->height;pixels.originX=clipped->x;pixels.originY=clipped->y;pixels.pixels.resize(std::size_t(pixels.width)*pixels.height);pixels.mask.resize(pixels.pixels.size());for(int y=0;y<pixels.height;++y)for(int x=0;x<pixels.width;++x){int px=pixels.originX.value_or(0)+x,py=pixels.originY.value_or(0)+y;if(!selectionContains(selection_,px,py)||!resolved.surface)continue;const auto value=raster::readWorld(*resolved.surface,px,py);const auto index=std::size_t(y)*pixels.width+x;pixels.pixels[index]=value;pixels.mask[index]=(value>>24)!=0;}item.selectionPixels=std::move(pixels);}item.row-=row;item.column-=col;}
 celClipboard_=std::move(items);frameClipboard_.clear();return true;
}
bool Document::cutSelectedCels(){if(hasFreeTileContent())return false;if(hasTilemapContent())return cutTilemapCels();if(!activeMaskId_.empty())return false;
 if(active())throw std::runtime_error("Cannot cut Cels during an active preview");
 for(const auto& id:timelineSelection_.cels){const auto* c=timeline_.findCelById(id);if(!c)continue;auto l=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==c->layerId;});if(l!=timeline_.state().layers.end() && layerEffectivelyLocked(*l))throw std::runtime_error("Cel cut layer is locked");}
 if(!copySelectedCels())return false;
 if(!selection_)return deleteSelectedCels();
 // legacy workspace-cut delegates selection-only Cel cut to deleteSelection.
 // selectedEffectTargets deduplicates shared pixel storage; linked slots survive.
 Edit edit{{},state_,nextState_};std::unordered_set<std::string> sources;
 edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.pixelSelectionEdit=true;edit.beforePixelsSelection=selection_;
 for(const auto& id:timelineSelection_.cels){const auto resolved=timeline_.resolveSurface(id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.source)throw std::runtime_error("Cannot resolve cut Cel");if(!resolved.surface||!sources.insert(timeline_.linkedStorageKey(resolved.source->id)).second)continue;
  const auto& before=*resolved.surface;raster::validate(before);auto after=before;bool changed=false;
  for(int y=0;y<before.height;++y)for(int x=0;x<before.width;++x){const auto wx=std::int64_t(before.offsetX)+x,wy=std::int64_t(before.offsetY)+y;if(wx<std::numeric_limits<int>::min()||wx>std::numeric_limits<int>::max()||wy<std::numeric_limits<int>::min()||wy>std::numeric_limits<int>::max()||!selectionContains(selection_,int(wx),int(wy)))continue;auto& value=after.pixels[std::size_t(y)*before.width+x];if(value){value=0;changed=true;}}
  if(changed)edit.surfaceChanges.push_back({resolved.source->id,before,std::move(after)});
 }
 if(edit.surfaceChanges.empty())return true;
 history_.reserve(position_+1);change_={};applySurfaceEdit(edit,true);selection_.reset();publishChange();pushEdit(std::move(edit),U"删除动画单元格");return true;
}
bool Document::deleteSelectedCels(bool ignorePixelSelection){if(hasTilemapContent()||hasFreeTileContent())return false;if(!activeMaskId_.empty())return false;
 if(active() || (selection_ && !ignorePixelSelection))throw std::runtime_error("Only complete RGBA Cel deletion is migrated");
 const auto& state=timeline_.state();std::unordered_set<std::string> selected(timelineSelection_.cels.begin(),timelineSelection_.cels.end());if(selected.empty())return false;
 auto candidate=state;
 // Hand off a selected canonical source before clearing its slot.
 for(const auto& source:state.cels){if(!selected.count(source.id))continue;auto resolved=timeline_.resolveSurface(source.id);if(resolved.issue!=timeline::LinkIssue::None)throw std::runtime_error("Invalid Cel link");if(resolved.source->id!=source.id)continue;std::string survivor;
  for(auto& c:candidate.cels){if(selected.count(c.id))continue;auto member=timeline_.resolveSurface(c.id);if(member.issue!=timeline::LinkIssue::None)throw std::runtime_error("Invalid Cel link");if(member.source->id!=source.id)continue;if(survivor.empty()){survivor=c.id;c.surface=resolved.surface?std::optional<timeline::Surface>{*resolved.surface}:std::nullopt;c.linkedCelId.reset();}else{c.surface.reset();c.linkedCelId=survivor;}c.runtimeSharedCelId.reset();}}
 for(auto& c:candidate.cels)if(selected.count(c.id)){auto resolved=timeline_.resolveSurface(c.id);if(!c.surface && resolved.surface)c.surface=*resolved.surface;if(c.surface)std::fill(c.surface->pixels.begin(),c.surface->pixels.end(),0);c.linkedCelId.reset();c.runtimeSharedCelId.reset();c.zIndex=0;}
 timeline::Timeline validated(std::move(candidate));if(!validated.diagnoseLinks().empty())throw std::runtime_error("Cel deletion creates invalid links");
 Edit e{{},state_,nextState_};e.beforeTimeline=state;e.beforeActive=e.afterActive=activeLayerId_;e.beforeFrame=e.afterFrame=activeFrameId_;e.beforeSelection=e.afterSelection=selectedFrames_;
 e.afterTimeline=validated.state();history_.reserve(position_+1);capturePixelAddresses(e);timeline_=std::move(validated);timelineSelection_.cels.clear();timelineSelection_.celAnchor.clear();change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"删除动画单元格");return true;
}
// Application clipboard passes value snapshots across Document lifetimes; source IDs
// are only used by pasteCopiedCels to remap links to the destination slots.
bool Document::pasteCelClipboard(const CelClipboardSnapshot& snapshot){if(hasFreeTileContent())return false;if(hasTilemapContent()||snapshot.tilemapContext||!snapshot.tilesets.empty())return pasteTilemapCels(snapshot);if(!activeMaskId_.empty())return false;
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
bool Document::beginCelSelectionPaste(const std::vector<CelClipboardItem>& items){if(hasTilemapContent()||hasFreeTileContent())return false;
 if(items.empty()||!items.front().selectionPixels)return false;commitFloatingPaste();cancelStroke();cancelLayerOpacity();
 const auto* target=timelineSelection_.cels.empty()?&cel():timeline_.findCelById(timelineSelection_.cels.back());if(!target)return false;
 const auto& state=timeline_.state();auto index=[](const auto& entries,const std::string& id){for(int i=0;i<int(entries.size());++i)if(entries[i].id==id)return i;return -1;};const int row=index(state.layers,target->layerId),column=index(state.frames,target->frameId);
 const auto& bounds=*items.front().selectionPixels;if(bounds.width<1||bounds.height<1||std::uint64_t(bounds.width)*bounds.height>16*1024*1024)throw std::runtime_error("Invalid Cel selection clipboard geometry");std::set<std::pair<int,int>> sourceSlots;int last=int(state.frames.size())-1;
 for(const auto& item:items){if(!sourceSlots.emplace(item.row,item.column).second)throw std::runtime_error("Duplicate Cel selection slot");const auto r=std::int64_t(row)+item.row,c=std::int64_t(column)+item.column;if(r<0||r>=int(state.layers.size())||c<0||layerEffectivelyLocked(state.layers[r]))return false;if(!item.selectionPixels||item.selectionPixels->width!=bounds.width||item.selectionPixels->height!=bounds.height||item.selectionPixels->originX!=bounds.originX||item.selectionPixels->originY!=bounds.originY||item.selectionPixels->pixels.size()!=std::size_t(bounds.width)*bounds.height||item.selectionPixels->mask.size()!=item.selectionPixels->pixels.size())throw std::runtime_error("Invalid Cel selection clipboard");if(c>=10000)throw std::runtime_error("Cel selection paste exceeds frame limit");last=std::max(last,int(c));}
 if(last>=10000||std::uint64_t(width_)*height_*state.layers.size()*(last+1)*4>256*1024*1024)throw std::runtime_error("Cel selection paste exceeds pixel budget");
 auto nextFrameId=nextFrameId_;auto candidate=state;while(int(candidate.frames.size())<=last){DocumentFrame f;f.id="frame-native-"+std::to_string(identity_)+"-"+std::to_string(++nextFrameId);candidate.frames.push_back(f);for(const auto& l:candidate.layers){DocumentCel c;c.id="cel-"+l.id+"-"+f.id;c.layerId=l.id;c.frameId=f.id;c.opacity=1;timeline::Surface surface;surface.width=width_;surface.height=height_;surface.pixels.resize(std::size_t(width_)*height_);c.surface=std::move(surface);candidate.cels.push_back(std::move(c));}}
 timeline::Timeline staged(candidate);std::vector<std::string> destinations;for(const auto& item:items)destinations.push_back(staged.findCel(candidate.layers[row+item.row].id,candidate.frames[column+item.column].id)->id);
 const std::unordered_set<std::string> replaced(destinations.begin(),destinations.end());
 for(const auto& source:state.cels){if(!replaced.count(source.id))continue;auto resolved=timeline_.resolveSurface(source.id);if(!resolved.source||resolved.issue!=timeline::LinkIssue::None)throw std::runtime_error("Invalid Cel selection link");if(resolved.source->id!=source.id)continue;std::string survivor;for(auto& c:candidate.cels){if(replaced.count(c.id)||!timeline_.findCelById(c.id))continue;auto member=timeline_.resolveSurface(c.id);if(member.source->id!=source.id)continue;if(survivor.empty()){survivor=c.id;c.surface=resolved.surface?std::optional<timeline::Surface>{*resolved.surface}:std::nullopt;c.linkedCelId.reset();}else{c.surface.reset();c.linkedCelId=survivor;}c.runtimeSharedCelId.reset();}}
 FloatingPaste floating;floating.beforeCelTimeline=state;floating.beforeTimelineSelection=timelineSelection_;floating.beforeSelectedFrames=selectedFrames_;floating.beforeSelection=selection_;floating.layerId=activeLayerId_;floating.frameId=activeFrameId_;
 for(std::size_t i=0;i<items.size();++i){auto& destination=*std::find_if(candidate.cels.begin(),candidate.cels.end(),[&](const auto& c){return c.id==destinations[i];});auto resolved=staged.resolveSurface(destination.id);destination.surface=resolved.surface?std::optional<timeline::Surface>{*resolved.surface}:std::nullopt;if(!destination.surface){timeline::Surface surface;surface.width=width_;surface.height=height_;surface.pixels.resize(std::size_t(width_)*height_);destination.surface=std::move(surface);}destination.linkedCelId.reset();destination.runtimeSharedCelId.reset();floating.targets.push_back({*items[i].selectionPixels,destination.id,{}});}
 auto primary=std::find_if(floating.targets.begin(),floating.targets.end(),[&](const auto& t){const auto* c=staged.findCelById(t.celId);return c->layerId==activeLayerId_&&c->frameId==activeFrameId_;});if(primary!=floating.targets.end())std::rotate(floating.targets.begin(),primary,primary+1);
 floating.source=floating.targets.front().source;floating.x=bounds.originX.value_or(0);floating.y=bounds.originY.value_or(0);floating.transform={double(floating.x),double(floating.y),double(bounds.width),double(bounds.height)};
 timeline::Timeline validated(std::move(candidate));if(!validated.diagnoseLinks().empty())throw std::runtime_error("Cel selection paste creates invalid links");
 auto previousSelection=selection_;const auto previousChange=change_;auto previousTimeline=std::move(timeline_);timeline_=std::move(validated);floating_=std::move(floating);
 try{moveFloatingPaste(bounds.originX.value_or(0),bounds.originY.value_or(0));}catch(...){timeline_=std::move(previousTimeline);floating_.reset();selection_=std::move(previousSelection);change_=previousChange;throw;}
 nextFrameId_=nextFrameId;return true;
}
bool Document::pasteCopiedCels(bool crossDocument){if(hasTilemapContent()||hasFreeTileContent())return false;if(!activeMaskId_.empty())return false;
 if(celClipboard_.empty())return false;if(celClipboard_.front().selectionPixels)return beginCelSelectionPaste(celClipboard_);if(active() || selection_)throw std::runtime_error("Finish or cancel the current selection before Cel paste");
 const auto* target=timelineSelection_.cels.empty()?&cel():timeline_.findCelById(timelineSelection_.cels.back());if(!target)return false;
 const auto& state=timeline_.state();auto index=[](const auto& items,const std::string& id){for(int i=0;i<int(items.size());++i)if(items[i].id==id)return i;return -1;};const int row=index(state.layers,target->layerId),column=index(state.frames,target->frameId);
 std::unordered_set<std::string> sourceIds;std::set<std::pair<int,int>> sourceSlots;
 for(const auto& item:celClipboard_){if(item.selectionPixels||item.cel.id.empty()||!sourceIds.insert(item.cel.id).second||!sourceSlots.emplace(item.row,item.column).second)throw std::runtime_error("Invalid Cel clipboard block");if(item.cel.surface)raster::validate(*item.cel.surface);}
 for(const auto& item:celClipboard_)if(item.cel.linkedCelId&&!sourceIds.count(*item.cel.linkedCelId))throw std::runtime_error("Cel clipboard link leaves copied block");

 int last=int(state.frames.size())-1;for(const auto& item:celClipboard_){const auto r=std::int64_t(row)+item.row,c=std::int64_t(column)+item.column;if(r<0 || r>=int(state.layers.size()) || c<0)throw std::runtime_error("Cel paste block exceeds the layer or frame bounds");if(layerEffectivelyLocked(state.layers[r]))throw std::runtime_error("Cel paste target layer is locked");if(c>=10000)throw std::runtime_error("Cel paste exceeds frame limit");last=std::max(last,int(c));}
 if(last>=10000 || std::uint64_t(width_)*height_*state.layers.size()*(last+1)*4>256*1024*1024)throw std::runtime_error("Cel paste exceeds frame pixel memory limit");
 constexpr std::uint64_t celWorkingLimit=256ull*1024*1024;std::uint64_t beforeBytes=0,clipboardBytes=0;
 auto countBytes=[&](std::uint64_t& total,const timeline::Surface& storage){raster::validate(storage);const auto bytes=std::uint64_t(storage.pixels.size())*sizeof(Pixel);if(bytes>celWorkingLimit-total)throw std::length_error("Cel paste exceeds sparse pixel budget");total+=bytes;};
 for(const auto& c:state.cels)if(c.surface)countBytes(beforeBytes,*c.surface);for(const auto& item:celClipboard_)if(item.cel.surface)countBytes(clipboardBytes,*item.cel.surface);
 const auto appendedBytes=std::uint64_t(last+1-state.frames.size())*state.layers.size()*width_*height_*sizeof(Pixel);
 if(beforeBytes>celWorkingLimit/5||clipboardBytes>celWorkingLimit/4||appendedBytes>celWorkingLimit/4||beforeBytes*5+clipboardBytes*4+appendedBytes*4>celWorkingLimit)throw std::length_error("Cel paste exceeds sparse working budget");
 auto nextFrameId=nextFrameId_;timeline::State candidate=state;
 while(int(candidate.frames.size())<=last){DocumentFrame f;f.id="frame-native-"+std::to_string(identity_)+"-"+std::to_string(++nextFrameId);candidate.frames.push_back(f);for(const auto& l:candidate.layers){DocumentCel c;c.id="cel-"+l.id+"-"+f.id;c.layerId=l.id;c.frameId=f.id;c.opacity=1;timeline::Surface surface;surface.width=width_;surface.height=height_;surface.pixels.resize(std::size_t(width_)*height_);c.surface=std::move(surface);candidate.cels.push_back(std::move(c));}}
 // Only legacy's same-document branch inherits unpasted auto-link layers.
 if(!crossDocument)for(int f=int(state.frames.size());f<int(candidate.frames.size());++f)for(int r=0;r<int(candidate.layers.size());++r){if(!candidate.layers[r].autoLinkAnimationCels || std::any_of(celClipboard_.begin(),celClipboard_.end(),[&](const auto& item){return row+item.row==r && column+item.column==f;}))continue;timeline::Timeline inherited(candidate);const auto* preceding=inherited.findCel(candidate.layers[r].id,candidate.frames[f-1].id);auto resolved=inherited.resolveSurface(preceding->id);if(!resolved.surface || (!preceding->linkedCelId && std::none_of(resolved.surface->pixels.begin(),resolved.surface->pixels.end(),[](auto p){return (p>>24)!=0;})))continue;auto& next=*std::find_if(candidate.cels.begin(),candidate.cels.end(),[&](const auto& c){return c.layerId==candidate.layers[r].id && c.frameId==candidate.frames[f].id;});next.surface.reset();next.linkedCelId=resolved.source->id;next.opacity=resolved.source->opacity;next.zIndex=resolved.source->zIndex;}
 timeline::Timeline staged(candidate);std::vector<std::string> destinations;std::unordered_map<std::string,std::string> remap;
 for(const auto& item:celClipboard_){const auto* slot=staged.findCel(candidate.layers[row+item.row].id,candidate.frames[column+item.column].id);destinations.push_back(slot->id);remap[item.cel.id]=slot->id;}
 // Keep untouched members of an overwritten shared group alive.
 std::unordered_set<std::string> replaced(destinations.begin(),destinations.end());
 for(const auto& source:state.cels){if(!replaced.count(source.id))continue;const auto resolved=timeline_.resolveSurface(source.id);if(resolved.source->id!=source.id)continue;std::string survivor;for(auto& c:candidate.cels){if(replaced.count(c.id))continue;const auto member=staged.resolveSurface(c.id);if(member.issue!=timeline::LinkIssue::None||!member.source)throw std::runtime_error("Invalid inherited Cel link");if(member.source->id!=source.id)continue;if(survivor.empty()){survivor=c.id;c.surface=resolved.surface?std::optional<timeline::Surface>{*resolved.surface}:std::nullopt;c.linkedCelId.reset();}else{c.surface.reset();c.linkedCelId=survivor;}c.runtimeSharedCelId.reset();}}
 for(std::size_t i=0;i<celClipboard_.size();++i){auto& dest=*std::find_if(candidate.cels.begin(),candidate.cels.end(),[&](const auto& c){return c.id==destinations[i];});auto source=celClipboard_[i].cel;source.id=dest.id;source.layerId=dest.layerId;source.frameId=dest.frameId;if(source.linkedCelId)source.linkedCelId=remap.at(*source.linkedCelId);source.runtimeSharedCelId.reset();dest=std::move(source);}
 timeline::Timeline validated(std::move(candidate));if(!validated.diagnoseLinks().empty())throw std::runtime_error("Cel paste creates invalid links");
 TimelineSelection afterSelection=timelineSelection_;afterSelection.layers.clear();afterSelection.cels=destinations;afterSelection.celAnchor=destinations.back();
 Edit e{{},state_,nextState_};e.beforeTimeline=state;e.afterTimeline=validated.state();e.beforeActive=e.afterActive=activeLayerId_;e.beforeFrame=e.afterFrame=activeFrameId_;e.beforeTimelineSelection=timelineSelection_;e.afterTimelineSelection=afterSelection;e.beforeSelection=selectedFrames_;e.afterSelection=std::vector<std::string>{};
 history_.reserve(position_+1);capturePixelAddresses(e);timeline_=std::move(validated);nextFrameId_=nextFrameId;timelineSelection_=std::move(afterSelection);selectedFrames_.clear();change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"粘贴动画单元格");return true;
}
bool Document::copySelectedFrames(){if(hasFreeTileContent())throw std::runtime_error("Free tile clipboard migration is not available; convert to raster first");if(hasTilemapContent()&&active())throw std::runtime_error("Finish the active edit before copying frames"); celClipboard_.clear();frameClipboard_.clear(); const auto ids=selectedFrames_.empty()?std::vector<std::string>{frame().id}:selectedFrames_; for(const auto& id:ids){auto fit=std::find_if(timeline_.state().frames.begin(),timeline_.state().frames.end(),[&](const auto& f){return f.id==id;}); if(fit==timeline_.state().frames.end())continue; FrameClipboardItem item;item.masks.clear();for(const auto& slot:timeline_.state().masks)if(slot.frameId==id){auto copy=slot;copy.mask.surface=timeline::resolvedMask(timeline_.state(),slot.ownerId,slot.frameId)->surface;copy.mask.linkedMaskId.clear();item.masks.push_back(std::move(copy));} item.frame=*fit; for(const auto& c:timeline_.state().cels) if(c.frameId==id) item.cels.push_back(c); std::unordered_set<std::string> localIds; for(const auto& c:item.cels)localIds.insert(c.id); for(auto& c:item.cels){if(c.linkedCelId && !localIds.count(*c.linkedCelId)){auto resolved=timeline_.resolveSurface(c.id);if(resolved.surface)c.surface=*resolved.surface;if(resolved.source){c.tilemap=resolved.source->tilemap;c.text=resolved.source->text;}c.linkedCelId.reset();}c.runtimeSharedCelId.reset();} frameClipboard_.push_back(std::move(item)); } return !frameClipboard_.empty(); }
// legacy workspace-cut.ts copies first; frame deletion leaves at least one frame.
bool Document::cutSelectedFrames(){if(hasFreeTileContent())return false;if(hasTilemapContent())return cutTilemapFrames();
 if(!copySelectedFrames())return false;
 const auto selection=selectedFrames_;
 const auto ids=selection.empty()?std::vector<std::string>{frame().id}:selection;
 const auto start=position_;groupingHistory_=true;
 for(const auto& id:ids){if(timeline_.state().frames.size()<=1)break;selectFrame(id);deleteFrame();}
 selectedFrames_.clear();groupingHistory_=false;groupEdits(start,selection);
 return position_>start;
}
Document::FrameClipboardSnapshot Document::exportFrameClipboard()const{if(hasFreeTileContent())throw std::runtime_error("Free tile clipboard migration is not available; convert to raster first");
 if(hasTilemapContent()&&active())throw std::runtime_error("Finish the active edit before copying frames");
 FrameClipboardSnapshot out{frameClipboard_,timeline_.state().layers,identity_,width_,height_};
 // Global snapshots own pixels, including links whose canonical frame was not copied.
 for(auto& item:out.items)for(auto& cel:item.cels){const auto* original=timeline_.findCelById(cel.id);if(!original)throw std::runtime_error("Missing frame clipboard Cel");cel.linkedCelId=original->linkedCelId;const auto resolved=timeline_.resolveSurface(cel.id);if(resolved.issue!=timeline::LinkIssue::None)throw std::runtime_error("Invalid frame clipboard Cel link");if(resolved.surface)cel.surface=*resolved.surface;if(resolved.source){cel.tilemap=resolved.source->tilemap;cel.text=resolved.source->text;}cel.runtimeSharedCelId.reset();}
 std::unordered_set<std::string> copiedMaskIds;for(const auto& item:out.items)for(const auto& slot:item.masks)copiedMaskIds.insert(slot.mask.id);
 for(auto& item:out.items)for(auto& slot:item.masks){const auto original=std::find_if(timeline_.state().masks.begin(),timeline_.state().masks.end(),[&](const auto& m){return m.mask.id==slot.mask.id;});if(original!=timeline_.state().masks.end()&&!original->mask.linkedMaskId.empty()&&copiedMaskIds.count(original->mask.linkedMaskId))slot.mask.linkedMaskId=original->mask.linkedMaskId;else slot.mask.linkedMaskId.clear();}
 out.groups=timeline_.state().groups;
 std::unordered_set<std::string> referenced;
 for(const auto& l:out.layers)if(l.kind=="tilemap")referenced.insert(l.tilemapTilesetId);
 for(const auto& item:out.items)for(const auto& c:item.cels)if(c.tilemap)for(const auto& cell:c.tilemap->cells)if(cell)referenced.insert(cell->tilesetId);
 std::size_t pixels=0;for(const auto& item:out.items)for(const auto& c:item.cels)if(c.surface){if(c.surface->pixels.size()>64*1024*1024-pixels)throw std::length_error("Frame clipboard memory limit");pixels+=c.surface->pixels.size();}
 for(const auto& set:timeline_.state().tilesets)if(referenced.erase(set.id)){if(set.pixels.size()>64*1024*1024-pixels)throw std::length_error("Frame clipboard memory limit");pixels+=set.pixels.size();out.tilesets.push_back(set);}
 if(!referenced.empty())throw std::invalid_argument("Missing frame clipboard tileset");
 return out;
}
bool Document::pasteFrameClipboard(const FrameClipboardSnapshot& snapshot){if(hasFreeTileContent())return false;if(hasTilemapContent()||!snapshot.tilesets.empty())return pasteTilemapFrames(snapshot);
 if(snapshot.items.empty())return false;
 if(snapshot.sourceIdentity==identity_)return pasteCopiedFrames();
 if(active())throw std::runtime_error("Finish the active edit before pasting frames");
 if(snapshot.width!=width_ || snapshot.height!=height_)throw std::runtime_error("Cross-project frame paste requires matching canvas dimensions");
 const auto& before=timeline_.state();const auto layerCount=std::max(before.layers.size(),snapshot.layers.size());const auto frameCount=before.frames.size()+snapshot.items.size();
 if(layerCount>256 || frameCount>10000 || std::uint64_t(width_)*height_*layerCount*frameCount*4>256*1024*1024)throw std::runtime_error("Frame paste exceeds pixel memory limit");
 std::unordered_map<std::string,std::size_t> sourceLayers;for(std::size_t n=0;n<snapshot.layers.size();++n)if(!sourceLayers.emplace(snapshot.layers[n].id,n).second)throw std::runtime_error("Duplicate clipboard layer");
 for(const auto& item:snapshot.items){if(item.frame.duration<1 || item.frame.duration>60000)throw std::runtime_error("Invalid frame clipboard duration");for(const auto& cel:item.cels){if(!sourceLayers.count(cel.layerId))throw std::runtime_error("Missing frame clipboard layer");if(cel.surface && (cel.surface->width!=width_ || cel.surface->height!=height_ || cel.surface->offsetX || cel.surface->offsetY || cel.surface->pixels.size()!=std::size_t(width_)*height_))throw std::runtime_error("Frame clipboard surface geometry is not migrated");}}
 auto candidate=before;std::uint64_t next=nextFrameId_;auto fresh=[&](const char* prefix){return std::string(prefix)+std::to_string(identity_)+"-"+std::to_string(++next);};
 auto blank=[&](const std::string& layer,const std::string& frame){DocumentCel cel;cel.id=fresh("cel-frame-paste-");cel.layerId=layer;cel.frameId=frame;timeline::Surface surface;surface.width=width_;surface.height=height_;surface.pixels.resize(std::size_t(width_)*height_);cel.surface=std::move(surface);return cel;};
 for(std::size_t n=candidate.layers.size();n<snapshot.layers.size();++n){auto layer=snapshot.layers[n];do{layer.id=fresh("layer-frame-paste-");}while(std::any_of(candidate.layers.begin(),candidate.layers.end(),[&](const auto& item){return item.id==layer.id;}));layer.autoLinkAnimationCels=false;candidate.layers.push_back(layer);for(const auto& frame:before.frames)candidate.cels.push_back(blank(layer.id,frame.id));}
 int insert=int(activeFrameIndex())+1;if(!selectedFrames_.empty()){insert=0;for(int n=0;n<int(before.frames.size());++n)if(std::find(selectedFrames_.begin(),selectedFrames_.end(),before.frames[n].id)!=selectedFrames_.end())insert=n+1;}
 std::vector<std::string> inserted;std::unordered_map<std::string,std::string> celRemap;std::vector<DocumentCel> incoming;
 for(const auto& item:snapshot.items){auto frame=item.frame;do{frame.id=fresh("frame-paste-");}while(std::any_of(candidate.frames.begin(),candidate.frames.end(),[&](const auto& old){return old.id==frame.id;}));candidate.frames.insert(candidate.frames.begin()+insert++,frame);inserted.push_back(frame.id);for(std::size_t n=0;n<candidate.layers.size();++n){const auto source=std::find_if(item.cels.begin(),item.cels.end(),[&](const auto& cel){return sourceLayers.at(cel.layerId)==n;});if(source==item.cels.end()){incoming.push_back(blank(candidate.layers[n].id,frame.id));continue;}auto cel=*source;const auto sourceId=cel.id;cel.id=fresh("cel-frame-paste-");cel.layerId=candidate.layers[n].id;cel.frameId=frame.id;cel.runtimeSharedCelId.reset();if(!celRemap.emplace(sourceId,cel.id).second)throw std::runtime_error("Duplicate frame clipboard Cel");incoming.push_back(std::move(cel));}}
 for(auto& cel:incoming)if(cel.linkedCelId){const auto mapped=celRemap.find(*cel.linkedCelId);if(mapped==celRemap.end())cel.linkedCelId.reset();else{cel.linkedCelId=mapped->second;cel.surface.reset();}}
 candidate.cels.insert(candidate.cels.end(),incoming.begin(),incoming.end());timeline::Timeline validated(std::move(candidate));if(!validated.diagnoseLinks().empty())throw std::runtime_error("Frame paste creates invalid links");
 Edit edit{{},state_,nextState_};edit.beforeTimeline=before;edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=activeFrameId_;edit.beforeSelection=selectedFrames_;edit.beforeTimelineSelection=timelineSelection_;edit.beforeFrameAnchor=frameAnchor_;edit.afterTimeline=validated.state();edit.afterFrame=inserted.front();edit.afterSelection=inserted;edit.afterTimelineSelection=decltype(timelineSelection_){};edit.afterFrameAnchor=inserted.back();history_.reserve(position_+1);
 timeline_=std::move(validated);nextFrameId_=next;activeFrameId_=inserted.front();projectActiveCelOpacities();selectedFrames_=inserted;timelineSelection_={};frameAnchor_=inserted.back();change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"粘贴动画帧");return true;
}
// legacy workspace-commands-animation-frame.ts::importGifAnimationLayer.
bool Document::importGifAnimationLayer(const Document& source,int startFrameIndex){if(hasTilemapContent()||hasFreeTileContent())return false;
 const auto& incoming=source.timeline().state();if(incoming.layers.empty() || incoming.frames.empty())return false;
 if(source.width()!=width_ || source.height()!=height_)throw std::runtime_error("GIF timeline import requires matching canvas dimensions");
 if(active() && !floating())throw std::runtime_error("Finish the active edit before importing GIF");
 const int start=std::clamp(startFrameIndex,0,int(timeline_.state().frames.size()));const auto total=std::max(timeline_.state().frames.size(),std::size_t(start)+incoming.frames.size());
 if(timeline_.state().layers.size()>=256 || total>10000 || std::uint64_t(width_)*height_*(timeline_.state().layers.size()+1)*total*4>256*1024*1024)throw std::runtime_error("GIF timeline import exceeds pixel memory limit");
 std::vector<DocumentCel> sourceCels;for(const auto& frame:incoming.frames){const auto* cel=source.timeline().findCel(incoming.layers.front().id,frame.id);if(!cel)throw std::runtime_error("GIF frame has no layer slot");const auto resolved=source.timeline().resolveSurface(cel->id);if(resolved.issue!=timeline::LinkIssue::None || !resolved.surface)throw std::runtime_error("Invalid GIF frame surface");const auto& surface=*resolved.surface;if(surface.width!=width_ || surface.height!=height_ || surface.offsetX || surface.offsetY || surface.storageOriginX.value_or(0) || surface.storageOriginY.value_or(0) || surface.pixels.size()!=std::size_t(width_)*height_ || cel->zIndex || (cel->opacity && *cel->opacity!=1))throw std::runtime_error("GIF surface geometry or properties are not migrated");if(frame.duration<1 || frame.duration>60000)throw std::runtime_error("Invalid GIF frame duration");auto copy=*cel;copy.surface=surface;copy.linkedCelId.reset();copy.runtimeSharedCelId.reset();sourceCels.push_back(std::move(copy));}
 // Validation precedes pending-paste commit; imported structure is one further edit.
 commitFloatingPaste();const auto before=timeline_.state();auto candidate=before;std::uint64_t next=nextFrameId_;auto fresh=[&](const char* prefix){return std::string(prefix)+std::to_string(identity_)+"-"+std::to_string(++next);};
 auto blank=[&](const std::string& layer,const std::string& frame){DocumentCel cel;cel.id=fresh("cel-gif-");cel.layerId=layer;cel.frameId=frame;cel.opacity=1;timeline::Surface surface;surface.width=width_;surface.height=height_;surface.pixels.resize(std::size_t(width_)*height_);cel.surface=std::move(surface);return cel;};
 while(candidate.frames.size()<total){auto frame=incoming.frames[candidate.frames.size()-start];frame.id=fresh("frame-gif-");candidate.frames.push_back(frame);for(const auto& layer:before.layers)candidate.cels.push_back(blank(layer.id,frame.id));}
 DocumentLayer layer;layer.id=fresh("layer-gif-");layer.name=source.name().empty()?U"GIF":source.name();candidate.layers.push_back(layer);std::vector<std::string> imported;
 for(std::size_t i=0;i<candidate.frames.size();++i){auto cel=blank(layer.id,candidate.frames[i].id);if(i>=std::size_t(start) && i<std::size_t(start)+sourceCels.size()){cel.surface=sourceCels[i-start].surface;cel.opacity=sourceCels[i-start].opacity;cel.zIndex=sourceCels[i-start].zIndex;imported.push_back(cel.id);}candidate.cels.push_back(std::move(cel));}
 timeline::Timeline validated(std::move(candidate));if(!validated.diagnoseLinks().empty())throw std::runtime_error("GIF import creates invalid links");Edit edit{{},state_,nextState_};edit.beforeTimeline=before;edit.afterTimeline=validated.state();edit.beforeActive=activeLayerId_;edit.afterActive=layer.id;edit.beforeFrame=activeFrameId_;edit.afterFrame=validated.state().frames[start].id;edit.beforeSelection=selectedFrames_;edit.afterSelection={};edit.beforeFrameAnchor=frameAnchor_;edit.afterFrameAnchor="";edit.beforeTimelineSelection=timelineSelection_;auto selected=decltype(timelineSelection_){};selected.layers={layer.id};selected.layerAnchor=layer.id;selected.cels=imported;selected.celAnchor=imported.back();edit.afterTimelineSelection=selected;history_.reserve(position_+1);
 timeline_=std::move(validated);nextFrameId_=next;activeLayerId_=layer.id;activeFrameId_=edit.afterFrame;projectActiveCelOpacities();timelineSelection_=std::move(selected);selectedFrames_.clear();frameAnchor_.clear();change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"导入 GIF 动画");return true;
}
bool Document::pasteCopiedFrames(bool duplicateSelection){if(hasTilemapContent()||hasFreeTileContent())return false; cancelStroke(); cancelLayerOpacity(); if(frameClipboard_.empty())return false; Edit e{{},state_,nextState_}; e.beforeTimeline=timeline_.state();e.beforeActive=e.afterActive=activeLayerId_;e.beforeFrame=activeFrameId_;e.beforeSelection=selectedFrames_;e.beforeTimelineSelection=timelineSelection_;e.beforeFrameAnchor=frameAnchor_; std::vector<std::string> pasted; int insert=int(activeFrameIndex())+1;if(!duplicateSelection && !selectedFrames_.empty()){insert=0;for(int i=0;i<int(timeline_.state().frames.size());++i)if(std::find(selectedFrames_.begin(),selectedFrames_.end(),timeline_.state().frames[i].id)!=selectedFrames_.end())insert=i+1;} for(const auto& source:frameClipboard_){DocumentFrame f=source.frame; do{f.id="frame-native-"+std::to_string(identity_)+"-"+std::to_string(++nextFrameId_);}while(std::any_of(timeline_.state().frames.begin(),timeline_.state().frames.end(),[&](const auto& x){return x.id==f.id;})); std::unordered_map<std::string,std::string> remap; for(const auto& c:source.cels) remap[c.id]="cel-"+std::to_string(identity_)+"-"+std::to_string(++nextFrameId_); for(auto c:source.cels){c.id=remap[c.id];c.frameId=f.id;if(c.linkedCelId){auto it=remap.find(*c.linkedCelId);if(it!=remap.end())c.linkedCelId=it->second;else c.linkedCelId.reset();}c.runtimeSharedCelId.reset();if(c.surface)c.surface=*c.surface;e.detachedCels.push_back(std::move(c));} for(auto slot:source.masks){slot.frameId=f.id;slot.mask.id="mask-native-"+std::to_string(identity_)+"-"+std::to_string(++nextLayerId_);slot.mask.linkedMaskId.clear();timeline_.state_.masks.push_back(std::move(slot));} timeline_.state_.frames.insert(timeline_.state_.frames.begin()+insert++,f); pasted.push_back(f.id); } timeline_.state_.cels.insert(timeline_.state_.cels.end(),e.detachedCels.begin(),e.detachedCels.end()); timeline_.buildIndex(); activeFrameId_=pasted.front();projectActiveCelOpacities();timelineSelection_={};selectedFrames_=pasted;frameAnchor_=pasted.back();if(!duplicateSelection && pasted.size()==1){const auto* target=timeline_.findCel(activeLayerId_,pasted.front());if(target){selectedFrames_.clear();frameAnchor_.clear();timelineSelection_.cels={target->id};timelineSelection_.celAnchor=target->id;}} e.afterTimeline=timeline_.state();e.afterFrame=activeFrameId_;e.afterSelection=selectedFrames_;e.afterTimelineSelection=timelineSelection_;e.afterFrameAnchor=frameAnchor_;e.detachedCels.clear(); change_={0,0,width_,height_}; publishChange(); pushEdit(std::move(e),U"粘贴动画帧"); return true; }
void Document::deleteSelectedFrames(bool clearPixelSelection){if(hasTilemapContent()||hasFreeTileContent())return;const auto selection=selectedFrames_;auto ids=selection.empty()?std::vector<std::string>{frame().id}:selection;const auto start=position_;groupingHistory_=true;for(const auto& id:ids){if(timeline_.state().frames.size()<=1)break;selectFrame(id);deleteFrame();}selectedFrames_.clear();groupingHistory_=false;groupEdits(start,selection);if(clearPixelSelection && position_>start)selection_.reset();}
void Document::setAnimationLoop(bool loop){if(animationLoop_==loop)return;Edit e{{},state_,nextState_};e.beforeAnimationLoop=animationLoop_;e.afterAnimationLoop=loop;animationLoop_=loop;pushEdit(std::move(e),U"修改动画循环");}
std::string Document::createLoopSection(std::optional<timeline::LoopSection> draft){auto ids=selectedFrames_.empty()?std::vector<std::string>{frame().id}:selectedFrames_;int left=100000,right=-1;for(int i=0;i<int(timeline_.state().frames.size());++i)if(std::find(ids.begin(),ids.end(),timeline_.state().frames[i].id)!=ids.end()){left=std::min(left,i);right=i;}if(right<0)return {};timeline::LoopSection section;section.id="loop-native-"+std::to_string(identity_)+"-"+std::to_string(nextState_);int n=1;for(;;++n){const auto text="Loop "+std::to_string(n);section.name=U"循环节 "+std::u32string(text.begin()+5,text.end());if(std::none_of(timeline_.state().loopSections.begin(),timeline_.state().loopSections.end(),[&](const auto& s){return s.name==section.name;}))break;}section.startFrameId=timeline_.state().frames[left].id;section.endFrameId=timeline_.state().frames[right].id;if(draft){const auto generatedId=section.id;section=*draft;section.id=generatedId;const auto r=timeline::loopRange(timeline_.state(),section);if(r.start<0 || r.end<0)return {};section.startFrameId=timeline_.state().frames[r.start].id;section.endFrameId=timeline_.state().frames[r.end].id;}Edit e{{},state_,nextState_};e.beforeLoops=timeline_.state().loopSections;timeline_.state_.loopSections.push_back(section);e.afterLoops=timeline_.state().loopSections;pushEdit(std::move(e),U"创建循环节");return section.id;}
void Document::updateLoopSection(timeline::LoopSection section){cancelStroke();const auto r=timeline::loopRange(timeline_.state(),section);if(r.start<0 || r.end<0)return;section.startFrameId=timeline_.state().frames[r.start].id;section.endFrameId=timeline_.state().frames[r.end].id;if(section.name.empty())section.name=U"Loop";if(section.name.size()>64)section.name.resize(64);if(section.repeatCount)section.repeatCount=std::clamp(*section.repeatCount,1,9999);auto it=std::find_if(timeline_.state_.loopSections.begin(),timeline_.state_.loopSections.end(),[&](const auto& s){return s.id==section.id;});if(it==timeline_.state_.loopSections.end())return;Edit e{{},state_,nextState_};e.beforeLoops=timeline_.state().loopSections;*it=std::move(section);e.afterLoops=timeline_.state().loopSections;pushEdit(std::move(e),U"修改循环节");}
void Document::deleteLoopSection(const std::string& id){auto& loops=timeline_.state_.loopSections;if(std::none_of(loops.begin(),loops.end(),[&](const auto& s){return s.id==id;}))return;Edit e{{},state_,nextState_};e.beforeLoops=loops;loops.erase(std::remove_if(loops.begin(),loops.end(),[&](const auto& s){return s.id==id;}),loops.end());e.afterLoops=loops;pushEdit(std::move(e),U"删除循环节");}
bool Document::canReverseSelectedFrames() const {
 return std::count_if(timeline_.state().frames.begin(),timeline_.state().frames.end(),[this](const auto& f){return std::find(selectedFrames_.begin(),selectedFrames_.end(),f.id)!=selectedFrames_.end();})>=2;
}
void Document::reverseSelectedFrames() {
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
 Edit e{{},state_,nextState_};captureFrameOrder(e,false);e.beforeSelection=selectedFrames_;e.beforeLoops=timeline_.state().loopSections;
 timeline_.state_.frames=std::move(after);timeline_.state_.loopSections=std::move(loops);selectedFrames_.clear();
 for(const auto& f:timeline_.state().frames)if(std::find(e.beforeSelection->begin(),e.beforeSelection->end(),f.id)!=e.beforeSelection->end())selectedFrames_.push_back(f.id);
 timeline_.buildIndex();captureFrameOrder(e,true);e.afterSelection=selectedFrames_;e.afterLoops=timeline_.state().loopSections;
 change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"反转帧顺序");
}
void Document::captureFrameOrder(Edit& e,bool after) const {if(after)e.afterMasks=timeline_.state().masks;else e.beforeMasks=timeline_.state().masks;auto& order=after?e.afterFrames:e.beforeFrames;for(const auto& f:timeline_.state().frames)order.push_back(f.id);(after?e.afterFrame:e.beforeFrame)=activeFrameId_;(after?e.afterFrameAnchor:e.beforeFrameAnchor)=frameAnchor_;(after?e.afterTimelineSelection:e.beforeTimelineSelection)=timelineSelection_;(after?e.afterActive:e.beforeActive)=activeLayerId_;}
void Document::addFrame(bool duplicate) {if(hasTilemapContent()||hasFreeTileContent())return;
 commitFloatingPaste();
 cancelStroke();cancelLayerOpacity();if(timeline_.state().frames.size()>=10000 || std::uint64_t(width_)*height_*timeline_.state().layers.size()*(timeline_.state().frames.size()+1)*4>256*1024*1024)throw std::runtime_error("Frame pixel memory limit reached");
 Edit e{{},state_,nextState_};captureFrameOrder(e,false);e.beforeLoops=timeline_.state().loopSections;const auto previousFrames=timeline_.state().frames;DocumentFrame f;do{f.id="frame-native-"+std::to_string(identity_)+"-"+std::to_string(++nextFrameId_);}while(std::any_of(timeline_.state().frames.begin(),timeline_.state().frames.end(),[&](const auto& old){return old.id==f.id;}));f.duration=duplicate?frame().duration:100;
 for(const auto& l:timeline_.state().layers){DocumentCel c;if(duplicate){c=*timeline_.resolveSurface(timeline_.findCel(l.id,frame().id)->id).source;c.linkedCelId.reset();c.runtimeSharedCelId.reset();}else{timeline::Surface surface;surface.width=width_;surface.height=height_;surface.pixels.resize(std::size_t(width_)*height_);c.surface=std::move(surface);c.opacity=1;}if(l.autoLinkAnimationCels){const auto* slot=timeline_.findCel(l.id,frame().id);const auto source=timeline_.resolveSurface(slot->id);
 if(source.source && source.surface && (slot->linkedCelId || std::any_of(source.surface->pixels.begin(),source.surface->pixels.end(),[](Pixel p){return (p>>24)!=0;}))){c.linkedCelId=source.source->id;c.runtimeSharedCelId.reset();c.surface.reset();c.opacity=source.source->opacity;c.zIndex=source.source->zIndex;}}
 c.id="cel-"+l.id+"-"+f.id;c.layerId=l.id;c.frameId=f.id;e.detachedCels.push_back(std::move(c));}
 {const auto masks=timeline_.state().masks;for(const auto& slot:masks)if(slot.frameId==activeFrameId_&&(duplicate||(!slot.group&&slot.mask.autoLinkAnimationCels))){auto copy=slot;copy.frameId=f.id;copy.mask.id="mask-native-"+std::to_string(identity_)+"-"+std::to_string(++nextLayerId_);const auto* root=timeline::resolvedMask(timeline_.state(),slot.ownerId,slot.frameId);copy.mask.surface=root->surface;copy.mask.linkedMaskId=slot.mask.autoLinkAnimationCels?root->id:std::string{};timeline_.state_.masks.push_back(std::move(copy));}}
 e.detachedFrame=f;for(auto& section:timeline_.state_.loopSections){timeline::State old;old.frames=previousFrames;const auto r=timeline::loopRange(old,section);if(r.end>=0 && previousFrames[r.end].id==frame().id){if(section.endFrameId==frame().id)section.endFrameId=f.id;else if(section.startFrameId==frame().id)section.startFrameId=f.id;}}e.afterLoops=timeline_.state().loopSections;const auto index=activeFrameIndex()+1;timeline_.state_.frames.insert(timeline_.state_.frames.begin()+index,f);timeline_.state_.cels.insert(timeline_.state_.cels.end(),e.detachedCels.begin(),e.detachedCels.end());timeline_.buildIndex();activeFrameId_=f.id;projectActiveCelOpacities();selection_.reset();clearFrameSelection();timelineSelection_.cels.clear();timelineSelection_.celAnchor.clear();e.beforeTimelineSelection=timelineSelection_;e.beforeFrameAnchor=frameAnchor_;e.beforeSelection=e.afterSelection=selectedFrames_;captureFrameOrder(e,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"新建动画帧");
}
void Document::deleteFrame() {if(hasTilemapContent()||hasFreeTileContent())return;
 commitFloatingPaste();
 cancelStroke();cancelLayerOpacity();if(timeline_.state().frames.size()==1)return;Edit e{{},state_,nextState_};captureFrameOrder(e,false);e.beforeLoops=timeline_.state().loopSections;e.detachedFrame=frame();timeline::State oldLoops;oldLoops.frames=timeline_.state().frames;for(const auto& c:timeline_.state().cels)if(c.frameId==frame().id)e.detachedCels.push_back(c);
 // Native adapter of legacy shared surface objects surviving normalizeAnimationCelLinks.
 for(const auto& removed:e.detachedCels){if(removed.linkedCelId || removed.runtimeSharedCelId || !removed.surface)continue;
  std::vector<std::string> survivors;for(const auto& c:timeline_.state().cels)if(c.frameId!=e.detachedFrame->id && timeline_.resolveSurface(c.id).source->id==removed.id)survivors.push_back(c.id);
  if(survivors.empty())continue;
  for(const auto& id:survivors){auto& c=*std::find_if(timeline_.state_.cels.begin(),timeline_.state_.cels.end(),[&](const auto& x){return x.id==id;});e.beforeCels.push_back(c);c.linkedCelId.reset();if(id==survivors.front()){c.surface=removed.surface;c.runtimeSharedCelId.reset();}else{c.surface.reset();c.runtimeSharedCelId=survivors.front();}e.afterCels.push_back(c);}
 }
 const auto index=activeFrameIndex();timeline_.state_.frames.erase(timeline_.state_.frames.begin()+index);auto& cels=timeline_.state_.cels;cels.erase(std::remove_if(cels.begin(),cels.end(),[&](const auto& c){return c.frameId==e.detachedFrame->id;}),cels.end());activeFrameId_=timeline_.state_.frames[std::min(index,timeline_.state_.frames.size()-1)].id;
 std::vector<timeline::LoopSection> kept;for(auto section:timeline_.state().loopSections){const auto r=timeline::loopRange(oldLoops,section);if(r.start<0 || r.end<0)continue;if(section.startFrameId==e.detachedFrame->id || section.endFrameId==e.detachedFrame->id){std::vector<std::string> members;for(int i=r.start;i<=r.end;++i)if(oldLoops.frames[i].id!=e.detachedFrame->id)members.push_back(oldLoops.frames[i].id);if(members.empty())continue;section.startFrameId=members.front();section.endFrameId=members.back();}kept.push_back(section);}timeline_.state_.loopSections=std::move(kept);e.afterLoops=timeline_.state().loopSections;
 timeline_.buildIndex();captureFrameOrder(e,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"删除动画帧");
}
void Document::applyCelEdit(const Edit& e,bool redo){const auto& values=redo?e.afterCels:e.beforeCels;if(values.empty())return;for(const auto& value:values){auto it=std::find_if(timeline_.state_.cels.begin(),timeline_.state_.cels.end(),[&](const auto& c){return c.id==value.id;});if(it==timeline_.state_.cels.end())throw std::logic_error("Missing history cel");*it=value;}timeline_.buildIndex();if(e.beforeFrames.empty() && !e.beforeFrame.empty())activeFrameId_=redo?e.afterFrame:e.beforeFrame;change_={0,0,width_,height_};}
void Document::addLinkedFrame(bool allLayers){if(hasTilemapContent()||hasFreeTileContent())return;
 cancelStroke();cancelLayerOpacity();const auto sourceFrame=frame().id;const auto layerId=layer().id;const auto index=activeFrameIndex();const bool inserted=index+1==timeline_.state().frames.size();if(inserted)addFrame();
 Edit e{{},state_,nextState_};e.beforeFrame=sourceFrame;e.afterFrame=timeline_.state().frames[index+1].id;
 for(const auto& l:timeline_.state().layers){if(!allLayers && l.id!=layerId)continue;const auto source=timeline_.resolveSurface(timeline_.findCel(l.id,sourceFrame)->id);if(!source.surface || std::none_of(source.surface->pixels.begin(),source.surface->pixels.end(),[](auto p){return (p>>24)!=0;}))continue;
  auto& target=*std::find_if(timeline_.state_.cels.begin(),timeline_.state_.cels.end(),[&](const auto& c){return c.layerId==l.id && c.frameId==e.afterFrame;});if(target.id==source.source->id)continue;e.beforeCels.push_back(target);target.linkedCelId=source.source->id;target.runtimeSharedCelId.reset();target.surface.reset();target.zIndex=source.source->zIndex;target.opacity=source.source->opacity;e.afterCels.push_back(target);
 }
 timeline_.buildIndex();activeFrameId_=e.afterFrame;change_={0,0,width_,height_};publishChange();
 if(inserted){auto& frameEdit=history_.back();historyBytes_-=frameEdit.bytes();frameEdit.detachedCels.clear();for(const auto& c:timeline_.state().cels)if(c.frameId==e.afterFrame)frameEdit.detachedCels.push_back(c);historyBytes_+=frameEdit.bytes();}else pushEdit(std::move(e),U"新建链接动画帧");
}
// legacy animationReversedSlotTargets: reverse selected time slots independently per row.
bool Document::canReverseSelectedCels()const{
 bool any=false;for(const auto& l:timeline_.state().layers){int n=0;for(const auto& c:timeline_.state().cels)if(c.layerId==l.id && std::find(timelineSelection_.cels.begin(),timelineSelection_.cels.end(),c.id)!=timelineSelection_.cels.end())++n;if(n>1){if(layerEffectivelyLocked(l))return false;any=true;}}return any;
}
bool Document::reverseSelectedCels(){
 if(!canReverseSelectedCels())return false;commitFloatingPaste();cancelStroke();cancelLayerOpacity();Edit e{{},state_,nextState_};e.beforeFrame=e.afterFrame=activeFrameId_;e.beforeTimelineSelection=timelineSelection_;e.afterTimelineSelection=timelineSelection_;
 for(const auto& l:timeline_.state().layers){std::vector<const DocumentCel*> slots;for(const auto& f:timeline_.state().frames){const auto* c=timeline_.findCel(l.id,f.id);if(c && std::find(timelineSelection_.cels.begin(),timelineSelection_.cels.end(),c->id)!=timelineSelection_.cels.end())slots.push_back(c);}if(slots.size()<2)continue;
 std::unordered_map<std::string,std::string> remap;
 for(std::size_t n=0;n<slots.size();++n){const auto opposite=slots.size()-1-n;if(n==opposite)continue;e.beforeCels.push_back(*slots[n]);auto moved=*slots[n];moved.frameId=slots[opposite]->frameId;e.afterCels.push_back(std::move(moved));remap.emplace(slots[n]->id,slots[opposite]->id);}
 // Native selection uses Cel IDs; legacy uses slot keys, so map the highlight to the same slots.
 for(auto& id:e.afterTimelineSelection->cels){const auto found=remap.find(id);if(found!=remap.end())id=found->second;}
 const auto anchor=remap.find(e.afterTimelineSelection->celAnchor);if(anchor!=remap.end())e.afterTimelineSelection->celAnchor=anchor->second;
 }
 if(e.afterCels.empty())return false;applyCelEdit(e,true);timelineSelection_=*e.afterTimelineSelection;publishChange();pushEdit(std::move(e),U"反转单元格顺序");return true;
}
// legacy animationSlotsCanLink + animationLinkSlotKeys / connectAnimationCels.
bool Document::canConnectSelectedCels()const{
 for(const auto& l:timeline_.state().layers){int count=0;bool content=false;for(const auto& c:timeline_.state().cels){if(c.layerId!=l.id || std::find(timelineSelection_.cels.begin(),timelineSelection_.cels.end(),c.id)==timelineSelection_.cels.end())continue;++count;const auto r=timeline_.resolveSurface(c.id);content|=r.surface && std::any_of(r.surface->pixels.begin(),r.surface->pixels.end(),[](Pixel p){return (p>>24)!=0;});}if(count>1 && content)return true;}return false;
}
bool Document::connectSelectedCels(){if(hasTilemapContent()||hasFreeTileContent())return false;
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();Edit e{{},state_,nextState_};e.beforeFrame=e.afterFrame=activeFrameId_;
 for(const auto& l:timeline_.state().layers){std::vector<const DocumentCel*> slots;int first=-1,last=-1;const auto& frames=timeline_.state().frames;
 auto content=[&](const DocumentCel* c){const auto r=timeline_.resolveSurface(c->id);return r.surface && std::any_of(r.surface->pixels.begin(),r.surface->pixels.end(),[](Pixel p){return (p>>24)!=0;});};
 for(int f=0;f<int(frames.size());++f){const auto* c=timeline_.findCel(l.id,frames[f].id);if(c && std::find(timelineSelection_.cels.begin(),timelineSelection_.cels.end(),c->id)!=timelineSelection_.cels.end()){if(first<0)first=f;last=f;}}
 if(first<0 || first==last)continue;
 for(int f=first;f<=last;++f){const auto* c=timeline_.findCel(l.id,frames[f].id);if(std::find(timelineSelection_.cels.begin(),timelineSelection_.cels.end(),c->id)!=timelineSelection_.cels.end() || !content(c))slots.push_back(c);}
 const auto original=std::find_if(slots.begin(),slots.end(),content);if(original==slots.end())continue;const auto resolved=timeline_.resolveSurface((*original)->id);if(resolved.issue!=timeline::LinkIssue::None)throw std::runtime_error("Cannot resolve Cel link source");const auto source=*resolved.source;
 for(const auto* c:slots){if(c->id==source.id)continue;if(c->linkedCelId==source.id && !c->runtimeSharedCelId && c->opacity==source.opacity && c->zIndex==source.zIndex)continue;auto next=*c;next.linkedCelId=source.id;next.runtimeSharedCelId.reset();next.surface.reset();next.opacity=source.opacity;next.zIndex=source.zIndex;e.beforeCels.push_back(*c);e.afterCels.push_back(std::move(next));}
 }
 if(e.afterCels.empty())return false;applyCelEdit(e,true);publishChange();pushEdit(std::move(e),U"连接动画单元格");return true;
}
// legacy animation.ts disconnectAnimationCels: selecting a source unlinks its group.
bool Document::canDisconnectSelectedCels()const{
 const auto selected=timelineSelection_.cels.empty()?std::vector<std::string>{cel().id}:timelineSelection_.cels;
 for(const auto& c:timeline_.state().cels){if(!c.linkedCelId)continue;const auto resolved=timeline_.resolveSurface(c.id);if(std::find(selected.begin(),selected.end(),c.id)!=selected.end() || (resolved.source && std::find(selected.begin(),selected.end(),resolved.source->id)!=selected.end()))return true;}return false;
}
bool Document::disconnectSelectedCels(){if(hasTilemapContent()||hasFreeTileContent())return false;
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();
 const auto selected=timelineSelection_.cels.empty()?std::vector<std::string>{cel().id}:timelineSelection_.cels;
 Edit e{{},state_,nextState_};e.beforeFrame=e.afterFrame=activeFrameId_;
 for(const auto& c:timeline_.state().cels){if(!c.linkedCelId)continue;const auto resolved=timeline_.resolveSurface(c.id);if(!resolved.source || resolved.issue!=timeline::LinkIssue::None)throw std::runtime_error("Cannot resolve Cel unlink source");if(std::find(selected.begin(),selected.end(),c.id)==selected.end() && std::find(selected.begin(),selected.end(),resolved.source->id)==selected.end())continue;
 e.beforeCels.push_back(c);auto next=c;next.surface=resolved.surface?std::optional<timeline::Surface>{*resolved.surface}:std::nullopt;next.opacity=resolved.source->opacity;next.zIndex=resolved.source->zIndex;next.linkedCelId.reset();next.runtimeSharedCelId.reset();e.afterCels.push_back(std::move(next));}
 if(e.afterCels.empty())return false;applyCelEdit(e,true);publishChange();pushEdit(std::move(e),U"断开动画单元格连接");return true;
}
void Document::disconnectCel(){if(hasTilemapContent()||hasFreeTileContent())return;cancelStroke();cancelLayerOpacity();if(!cel().linkedCelId)return;Edit e{{},state_,nextState_};e.beforeFrame=e.afterFrame=frame().id;e.beforeCels.push_back(cel());DocumentCel c=cel();const auto resolved=timeline_.resolveSurface(c.id);c.surface=*resolved.surface;c.linkedCelId.reset();c.runtimeSharedCelId.reset();e.afterCels.push_back(c);applyCelEdit(e,true);publishChange();pushEdit(std::move(e),U"断开动画单元格连接");}
// workspace-animation-commands-helpers updateSelectedAnimationFramesDisabled.
bool Document::selectedFramesDisabled()const{
 for(const auto& f:timeline_.state().frames)if(selectedFrames_.empty()?f.id==activeFrameId_:std::find(selectedFrames_.begin(),selectedFrames_.end(),f.id)!=selectedFrames_.end())if(!f.disabled)return false;return true;
}
bool Document::setSelectedFramesDisabled(bool disabled,bool toggle){
 cancelStroke();cancelLayerOpacity();Edit e{{},state_,nextState_};for(auto& f:timeline_.state_.frames)if((selectedFrames_.empty()?f.id==activeFrameId_:std::find(selectedFrames_.begin(),selectedFrames_.end(),f.id)!=selectedFrames_.end()) && (toggle || f.disabled!=disabled)){e.beforeDisabled.emplace_back(f.id,f.disabled);f.disabled=toggle?!f.disabled:disabled;e.afterDisabled.emplace_back(f.id,f.disabled);}if(e.afterDisabled.empty())return false;pushEdit(std::move(e),U"切换启停用帧状态");return true;
}
void Document::setFrameDuration(int duration) {cancelStroke();cancelLayerOpacity();duration=std::clamp(duration?duration:100,1,60000);if(duration==frame().duration)return;Edit e{{},state_,nextState_};e.targetFrameId=frame().id;e.beforeDuration=frame().duration;e.afterDuration=duration;timeline_.state_.frames[activeFrameIndex()].duration=duration;pushEdit(std::move(e),U"修改帧时长");}
void Document::beginFrameDuration(){cancelStroke();durationBefore_=frame().duration;durationValuesBefore_.clear();const bool includesActive=std::find(selectedFrames_.begin(),selectedFrames_.end(),frame().id)!=selectedFrames_.end();for(const auto& f:timeline_.state().frames)if(includesActive?std::find(selectedFrames_.begin(),selectedFrames_.end(),f.id)!=selectedFrames_.end():f.id==frame().id)durationValuesBefore_.push_back({f.id,f.duration});}
void Document::previewFrameDuration(int duration){if(durationBefore_)for(auto& f:timeline_.state_.frames)if(std::any_of(durationValuesBefore_.begin(),durationValuesBefore_.end(),[&](const auto& item){return item.first==f.id;}))f.duration=std::clamp(duration?duration:100,1,60000);}
void Document::commitFrameDuration(){if(!durationBefore_)return;durationBefore_.reset();const auto start=position_;groupingHistory_=true;for(const auto& value:durationValuesBefore_){const auto f=std::find_if(timeline_.state().frames.begin(),timeline_.state().frames.end(),[&](const auto& x){return x.id==value.first;});if(f->duration==value.second)continue;Edit e{{},state_,nextState_};e.targetFrameId=value.first;e.beforeDuration=value.second;e.afterDuration=f->duration;pushEdit(std::move(e),U"修改帧时长");}groupingHistory_=false;groupEdits(start,selectedFrames_);durationValuesBefore_.clear();}
void Document::applyFrameEdit(const Edit& e,bool redo) {
 for(const auto& [id,disabled]:redo?e.afterDisabled:e.beforeDisabled){auto it=std::find_if(timeline_.state_.frames.begin(),timeline_.state_.frames.end(),[&](const auto& f){return f.id==id;});if(it!=timeline_.state_.frames.end())it->disabled=disabled;}
 const auto& order=redo?e.afterFrames:e.beforeFrames;auto& frames=timeline_.state_.frames;auto& cels=timeline_.state_.cels;
 if(!order.empty()){if(e.detachedFrame){const auto& id=e.detachedFrame->id;const bool want=std::find(order.begin(),order.end(),id)!=order.end();auto it=std::find_if(frames.begin(),frames.end(),[&](const auto& f){return f.id==id;});if(want && it==frames.end()){frames.push_back(*e.detachedFrame);cels.insert(cels.end(),e.detachedCels.begin(),e.detachedCels.end());}else if(!want && it!=frames.end()){frames.erase(it);cels.erase(std::remove_if(cels.begin(),cels.end(),[&](const auto& c){return c.frameId==id;}),cels.end());}}if(!e.detachedFrames.empty()){std::unordered_set<std::string> inserted;for(const auto& f:e.detachedFrames)inserted.insert(f.id);const bool want=std::find(order.begin(),order.end(),e.detachedFrames.front().id)!=order.end();if(want){std::unordered_set<std::string> frameIds,celIds;frameIds.reserve(frames.size()+e.detachedFrames.size());celIds.reserve(cels.size()+e.detachedCels.size());for(const auto& f:frames)frameIds.insert(f.id);for(const auto& c:cels)celIds.insert(c.id);for(const auto& f:e.detachedFrames)if(frameIds.insert(f.id).second)frames.push_back(f);for(const auto& c:e.detachedCels)if(celIds.insert(c.id).second)cels.push_back(c);}else{frames.erase(std::remove_if(frames.begin(),frames.end(),[&](const auto& f){return inserted.count(f.id);}),frames.end());cels.erase(std::remove_if(cels.begin(),cels.end(),[&](const auto& c){return inserted.count(c.frameId);}),cels.end());}std::unordered_map<std::string,std::size_t> orderIndex;for(std::size_t i=0;i<order.size();++i)orderIndex.emplace(order[i],i);std::sort(frames.begin(),frames.end(),[&](const auto& a,const auto& b){return orderIndex.at(a.id)<orderIndex.at(b.id);});}else std::sort(frames.begin(),frames.end(),[&](const auto& a,const auto& b){return std::find(order.begin(),order.end(),a.id)<std::find(order.begin(),order.end(),b.id);});timeline_.buildIndex();activeFrameId_=redo?e.afterFrame:e.beforeFrame;change_={0,0,width_,height_};}
 const auto& loops=redo?e.afterLoops:e.beforeLoops;if(loops)timeline_.state_.loopSections=*loops;const auto& selection=redo?e.afterSelection:e.beforeSelection;if(selection)selectedFrames_=*selection;
 if(!e.targetFrameId.empty()){auto it=std::find_if(frames.begin(),frames.end(),[&](const auto& f){return f.id==e.targetFrameId;});if(it==frames.end())throw std::logic_error("Missing history frame");it->duration=*(redo?e.afterDuration:e.beforeDuration);}
}
void Document::captureLayerOrder(Edit& e,bool after) const {if(after)e.afterMasks=timeline_.state().masks;else e.beforeMasks=timeline_.state().masks;
 auto& order=after?e.afterOrder:e.beforeOrder;for(const auto& l:timeline_.state().layers)order.push_back(l.id);(after?e.afterActive:e.beforeActive)=activeLayerId_;
}
void Document::addLayer() {if(!timeline_.state().groups.empty()){addLayerInGroupContext();return;}
 commitFloatingPaste();
 cancelStroke();cancelLayerOpacity();if(timeline_.state().layers.size()>=256 || std::uint64_t(width_)*height_*(timeline_.state().layers.size()+1)*timeline_.state().frames.size()*4>256*1024*1024)throw std::runtime_error("Layer pixel memory limit reached");Edit e{{},state_,nextState_};captureLayerOrder(e,false);e.beforeFrame=e.afterFrame=activeFrameId_;
 std::size_t index=0;for(std::size_t i=0;i<timeline_.state().layers.size();++i)if(std::find(timelineSelection_.layers.begin(),timelineSelection_.layers.end(),timeline_.state().layers[i].id)!=timelineSelection_.layers.end()){index=i;break;}
 DocumentLayer l;do {l.id="layer-native-"+std::to_string(identity_)+"-"+std::to_string(++nextLayerId_);}while(std::any_of(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& old){return old.id==l.id;}));l.name=U"图层 ";for(char c:std::to_string(timeline_.state().layers.size()+1))l.name+=char32_t(c);
 for(const auto& f:timeline_.state().frames) {DocumentCel c;c.id="cel-"+l.id+"-"+f.id;c.layerId=l.id;c.frameId=f.id;c.opacity=1;
 timeline::Surface surface;surface.width=width_;surface.height=height_;surface.pixels.resize(std::size_t(width_)*height_);c.surface=std::move(surface);e.detachedCels.push_back(std::move(c));}
 e.detachedLayer=l;timeline_.state_.layers.insert(timeline_.state_.layers.begin()+index,std::move(l));timeline_.state_.cels.insert(timeline_.state_.cels.end(),e.detachedCels.begin(),e.detachedCels.end());timeline_.buildIndex();activeLayerId_=e.detachedLayer->id;
 timelineSelection_={};timelineSelection_.layerAnchor=activeLayerId_;selectedFrames_.clear();frameAnchor_.clear();e.afterTimelineSelection=timelineSelection_;e.beforeTimelineSelection=TimelineSelection{};e.beforeSelection=selectedFrames_;e.afterSelection=selectedFrames_;e.beforeFrameAnchor=frameAnchor_;e.afterFrameAnchor=frameAnchor_;
 captureLayerOrder(e,true);e.beforeActive=e.beforeOrder.front();change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"新建图层");
}



bool Document::canMergeLayerDown() const {
 const auto index=activeLayerIndex();const auto& s=timeline_.state();const auto& layers=s.layers;if(index+1>=layers.size())return false;const auto& a=layers[index];const auto& b=layers[index+1];return a.groupId==b.groupId&&a.visible&&b.visible&&!timeline::isLayerEffectivelyLocked(s,a)&&!timeline::isLayerEffectivelyLocked(s,b);
}
bool Document::canMergeSelectedLayers() const {
 const auto& s=timeline_.state();const auto& layers=s.layers;std::size_t count=0,first=layers.size(),last=0;std::optional<std::string> parent;
 for(std::size_t i=0;i<layers.size();++i)if(std::find(timelineSelection_.layers.begin(),timelineSelection_.layers.end(),layers[i].id)!=timelineSelection_.layers.end()){if(timeline::isLayerEffectivelyLocked(s,layers[i])||!layers[i].visible)return false;if(count&&layers[i].groupId!=parent)return false;parent=layers[i].groupId;first=std::min(first,i);last=i;++count;}return count>=2&&last-first+1==count;
}
void Document::mergeSelectedLayers(){if(hasTilemapContent()||hasFreeTileContent())return;
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();if(!canMergeSelectedLayers())throw std::runtime_error("Merge requires consecutive visible unlocked selected layers");
 const auto& layers=timeline_.state().layers;std::vector<std::string> ids;std::size_t first=layers.size();
 for(std::size_t i=0;i<layers.size();++i)if(std::find(timelineSelection_.layers.begin(),timelineSelection_.layers.end(),layers[i].id)!=timelineSelection_.layers.end()){first=std::min(first,i);ids.push_back(layers[i].id);}
 mergeRasterLayers(ids,first);
}
void Document::mergeLayerDown(){if(hasTilemapContent()||hasFreeTileContent())return;
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
 cancelStroke();cancelLayerOpacity();if(layer().locked==locked)return;Edit e{{},state_,nextState_};e.targetLayerId=layer().id;e.beforeLocked=layer().locked;e.afterLocked=locked;timeline_.state_.layers[activeLayerIndex()].locked=locked;pushEdit(std::move(e),U"修改图层属性");
}
void Document::setLayerAutoLinkAnimationCels(const std::string& id,bool enabled) {
 auto it=std::find_if(timeline_.state_.layers.begin(),timeline_.state_.layers.end(),[&](const auto& l){return l.id==id;});
 if(it==timeline_.state_.layers.end() || it->autoLinkAnimationCels==enabled)return;
 Edit e{{},state_,nextState_};e.targetLayerId=id;e.beforeAutoLink=it->autoLinkAnimationCels;e.afterAutoLink=enabled;
 it->autoLinkAnimationCels=enabled;pushEdit(std::move(e),U"修改图层属性");
}
// useLayerRowToggleGesture transactions: preview mutable metadata, record final delta once.
void Document::beginAutoLinkGesture(){commitAutoLinkGesture();autoLinkGestureBefore_.clear();for(const auto& layer:timeline_.state().layers)autoLinkGestureBefore_.emplace_back(layer.id,layer.autoLinkAnimationCels);}
void Document::previewAutoLinkGesture(const std::string& id,bool enabled){auto it=std::find_if(timeline_.state_.layers.begin(),timeline_.state_.layers.end(),[&](const auto& layer){return layer.id==id;});if(it!=timeline_.state_.layers.end())it->autoLinkAnimationCels=enabled;}
bool Document::commitAutoLinkGesture(){
 if(autoLinkGestureBefore_.empty())return false;Edit group{{},state_,nextState_};for(const auto& [id,before]:autoLinkGestureBefore_){const auto it=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& layer){return layer.id==id;});if(it==timeline_.state().layers.end() || it->autoLinkAnimationCels==before)continue;Edit child{{},state_,nextState_};child.targetLayerId=id;child.beforeAutoLink=before;child.afterAutoLink=it->autoLinkAnimationCels;group.children.push_back(std::move(child));}autoLinkGestureBefore_.clear();if(group.children.empty())return false;pushEdit(std::move(group),U"修改图层属性");return true;
}
// useLayerRowToggleGesture transactions: preview mutable metadata, record final delta once.






void Document::applyLayerEdit(const Edit& e,bool redo) {
 const auto& order=redo?e.afterOrder:e.beforeOrder;
 if(!order.empty()) {
  auto& layers=timeline_.state_.layers;auto& cels=timeline_.state_.cels;
  if(e.detachedLayer){const auto& id=e.detachedLayer->id;const bool want=std::find(order.begin(),order.end(),id)!=order.end();const auto it=std::find_if(layers.begin(),layers.end(),[&](const auto& l){return l.id==id;});
   if(want && it==layers.end()){layers.push_back(*e.detachedLayer);cels.insert(cels.end(),e.detachedCels.begin(),e.detachedCels.end());}else if(!want && it!=layers.end()){layers.erase(it);cels.erase(std::remove_if(cels.begin(),cels.end(),[&](const auto& c){return c.layerId==id;}),cels.end());}}
  std::sort(layers.begin(),layers.end(),[&](const auto& a,const auto& b){return std::find(order.begin(),order.end(),a.id)<std::find(order.begin(),order.end(),b.id);});timeline_.buildIndex();activeLayerId_=redo?e.afterActive:e.beforeActive;change_={0,0,width_,height_};
 }
 if(!e.targetLayerId.empty()) {
  auto& layers=timeline_.state_.layers;auto it=std::find_if(layers.begin(),layers.end(),[&](const auto& l){return l.id==e.targetLayerId;});if(it==layers.end())throw std::logic_error("Missing history layer");
  const auto visible=redo?e.afterVisible:e.beforeVisible;const auto opacity=redo?e.afterOpacity:e.beforeOpacity;const auto locked=redo?e.afterLocked:e.beforeLocked;
  const auto autoLink=redo?e.afterAutoLink:e.beforeAutoLink;if(autoLink)it->autoLinkAnimationCels=*autoLink;
  const auto& name=redo?e.afterName:e.beforeName;if(name)it->name=*name;
  const auto& metadata=redo?e.afterLayerMetadata:e.beforeLayerMetadata;if(metadata){it->displayColor=metadata->displayColor;it->description=metadata->description;}
  const auto& blend=redo?e.afterBlendMode:e.beforeBlendMode;if(blend){it->blendMode=*blend;change_={0,0,width_,height_};}
  if(visible)it->visible=*visible;if(opacity){it->opacity=*opacity;syncActiveLayerCelOpacity(it->id);}if(locked)it->locked=*locked;if(visible || opacity || locked || autoLink)change_={0,0,width_,height_};
 }
}
void Document::setLayerVisible(bool visible) {
 commitFloatingPaste();
 cancelStroke();if(layer().visible==visible)return;Edit edit{{},state_,nextState_};edit.targetLayerId=layer().id;edit.beforeVisible=layer().visible;edit.afterVisible=visible;
 timeline_.state_.layers.at(activeLayerIndex()).visible=visible;change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"显示图层");
}
void Document::setLayerOpacity(double opacity) {
 cancelStroke();if(layer().locked || !std::isfinite(opacity))return;opacity=std::clamp(opacity,0.0,1.0);if(layer().opacity==opacity)return;
 Edit edit{{},state_,nextState_};edit.targetLayerId=layer().id;edit.beforeOpacity=layer().opacity;edit.afterOpacity=opacity;
 timeline_.state_.layers.at(activeLayerIndex()).opacity=opacity;syncActiveLayerCelOpacity(edit.targetLayerId);change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"图层不透明度");
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
 for(const auto& [id,before]:opacityValuesBefore_){const auto it=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==id;});if(it==timeline_.state().layers.end() || it->opacity==before)continue;Edit child{{},state_,nextState_};child.targetLayerId=id;child.beforeOpacity=before;child.afterOpacity=it->opacity;edit.children.push_back(std::move(child));}
 const auto whitespace=[](char32_t c){return c==U' ' || (c>=9 && c<=13) || c==0x00a0 || c==0x1680 || (c>=0x2000 && c<=0x200a) || c==0x2028 || c==0x2029 || c==0x202f || c==0x205f || c==0x3000 || c==0xfeff;};
 for(const auto& [id,before]:layerNamesBefore_){if(layerNamesBefore_.size()>1 && !layerNameChanged_)continue;auto it=std::find_if(timeline_.state_.layers.begin(),timeline_.state_.layers.end(),[&](const auto& l){return l.id==id;});if(it==timeline_.state_.layers.end())continue;const auto first=std::find_if_not(it->name.begin(),it->name.end(),whitespace),last=std::find_if_not(it->name.rbegin(),it->name.rend(),whitespace).base();it->name=first>=last?before:std::u32string(first,last);if(it->name==before)continue;Edit child{{},state_,nextState_};child.targetLayerId=id;child.beforeName=before;child.afterName=it->name;edit.children.push_back(std::move(child));}
 for(const auto& [id,before]:layerBlendModesBefore_){const auto& l=timeline_.state().layers[timeline_.layerIndex(id)];if(l.blendMode!=before){Edit child{{},state_,nextState_};child.targetLayerId=id;child.beforeBlendMode=before;child.afterBlendMode=l.blendMode;edit.children.push_back(std::move(child));}}layerBlendModesBefore_.clear();
 for(const auto& before:layerMetadataBefore_){auto& l=timeline_.state_.layers[timeline_.layerIndex(before.layerId)];if(layerMetadataBefore_.size()==1||layerDescriptionChanged_)l.description=trimLayerDescription(l.description);LayerMetadataSnapshot after{l.id,l.displayColor,l.description};if(before.displayColor==after.displayColor&&before.description==after.description)continue;Edit child{{},state_,nextState_};child.targetLayerId=l.id;child.beforeLayerMetadata=before;child.afterLayerMetadata=after;auto name=std::find_if(layerNamesBefore_.begin(),layerNamesBefore_.end(),[&](const auto& n){return n.first==l.id;});child.layerMetadataBytes=layerMetadataHistoryBytes(before,after,name==layerNamesBefore_.end()?l.name:name->second,l.name);edit.children.push_back(std::move(child));}for(const auto& p:linkedDisplayBefore_){const auto& live=timeline_.state().layers[timeline_.layerIndex(p.first)];if(live.displayColor==p.second)continue;Edit child{{},state_,nextState_};child.targetLayerId=live.id;child.beforeLayerMetadata=LayerMetadataSnapshot{live.id,p.second,live.description};child.afterLayerMetadata=LayerMetadataSnapshot{live.id,live.displayColor,live.description};child.layerMetadataBytes=64;edit.children.push_back(std::move(child));}linkedDisplayBefore_.clear();layerMetadataBefore_.clear();
 bool groupChanged=false;for(auto& g:timeline_.state_.groups)for(const auto& b:groupPropertiesBefore_)if(g.id==b.id){if(groupPropertiesBefore_.size()+layerNamesBefore_.size()==1||layerNameChanged_){auto n=trimLayerDescription(g.name);g.name=n.empty()?b.name:n;}if(groupPropertiesBefore_.size()+layerNamesBefore_.size()==1||layerDescriptionChanged_)g.description=trimLayerDescription(g.description);groupChanged=groupChanged||g.name!=b.name||g.opacity!=b.opacity||g.blendMode!=b.blendMode||g.displayColor!=b.displayColor||g.description!=b.description;}
 if(groupChanged){captureGroupEdit(edit,false);captureGroupEdit(edit,true);for(auto& g:edit.beforeLayerStructure->groups)for(const auto& b:groupPropertiesBefore_)if(g.id==b.id)g=b;}
 groupPropertiesBefore_.clear();layerDescriptionChanged_=false;layerNamesBefore_.clear();layerNameChanged_=false;opacityValuesBefore_.clear();if(groupChanged||!edit.children.empty())pushEdit(std::move(edit),U"修改图层属性");
}


namespace {
constexpr std::size_t adjustmentByteLimit=256*1024*1024;
std::size_t adjustmentStorageBudget(const timeline::Timeline& timeline,std::size_t copies){
 std::size_t bytes=0;std::set<std::string> seen;
 for(const auto& cel:timeline.state().cels)if(cel.surface&&seen.insert(timeline.linkedStorageKey(cel.id)).second){
  const auto& s=*cel.surface;raster::validate(s);
  raster::coordinate(std::int64_t(s.offsetX)+s.width);raster::coordinate(std::int64_t(s.offsetY)+s.height);
  if(s.pixels.size()>64*1024*1024 || s.pixels.size()>(adjustmentByteLimit-bytes)/sizeof(Pixel))throw std::length_error("Adjustment exceeds pixel budget");
  bytes+=s.pixels.size()*sizeof(Pixel);
 }
 if(!copies || bytes>adjustmentByteLimit/copies)throw std::length_error("Adjustment snapshots exceed pixel budget");
 return bytes;
}
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
 for(std::size_t i=0;i<x.groups.size();++i){const auto& g=x.groups[i];const auto& h=y.groups[i];if(g.id!=h.id||g.parentGroupId!=h.parentGroupId||g.visible!=h.visible||g.locked!=h.locked||g.opacity!=h.opacity||g.blendMode!=h.blendMode||g.panelOrder!=h.panelOrder)return false;}
 for(std::size_t i=0;i<x.layers.size();++i){const auto& l=x.layers[i];const auto& r=y.layers[i];if(l.id!=r.id||l.groupId!=r.groupId||l.visible!=r.visible||l.locked!=r.locked||l.opacity!=r.opacity||l.blendMode!=r.blendMode)return false;}
 for(const auto& c:x.cels){const auto* d=b.findCelById(c.id);if(!d||c.layerId!=d->layerId||c.frameId!=d->frameId||c.linkedCelId!=d->linkedCelId||c.runtimeSharedCelId!=d->runtimeSharedCelId||c.opacity!=d->opacity||c.zIndex!=d->zIndex)return false;}
 return true;
}

void floatingAddBytes(std::size_t& used,std::uint64_t bytes){if(bytes>adjustmentByteLimit-used)throw std::length_error("Floating selection exceeds pixel budget");used+=std::size_t(bytes);}
std::size_t floatingArea(int width,int height){if(width<1||height<1||std::uint64_t(width)*height>64*1024*1024)throw std::length_error("Floating selection exceeds surface budget");return std::size_t(width)*height;}
bool floatingTranslation(const SelectionTransform& t,const SelectionClipboard& source){return !t.quad&&t.shearX==0&&t.shearY==0&&t.angle==0&&t.width==source.width&&t.height==source.height&&!t.flipHorizontal&&!t.flipVertical&&std::floor(t.x)==t.x&&std::floor(t.y)==t.y;}
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
timeline::Surface immediateTransformCandidate(const timeline::Surface& before,const std::optional<SelectionMask>& capture,const SelectionTransform& transform,bool wholeFlip,bool packedFlip,bool horizontal,int width,int height){
 if(wholeFlip){auto out=before;for(int y=0;y<before.height;++y)for(int x=0;x<before.width;++x){const auto src=std::size_t(horizontal?y:before.height-1-y)*before.width+(horizontal?before.width-1-x:x);out.pixels[std::size_t(y)*before.width+x]=before.pixels[src];}return out;}
 if(!capture)return before;const auto& box=*capture;SelectionClipboard source;source.width=box.width;source.height=box.height;source.pixels.resize(floatingArea(box.width,box.height));source.mask.resize(source.pixels.size());
 for(int y=0;y<box.height;++y)for(int x=0;x<box.width;++x){const int wx=raster::coordinate(std::int64_t(box.x)+x),wy=raster::coordinate(std::int64_t(box.y)+y);const auto index=std::size_t(y)*box.width+x;if(!selectionContains(capture,wx,wy))continue;source.mask[index]=1;source.pixels[index]=raster::readWorld(before,wx,wy);}
 auto expanded=raster::expanded(before,{0,0,width,height});auto out=expanded?std::move(*expanded):before;
 auto write=[&](int x,int y,std::uint32_t value){if(auto index=raster::worldIndex(out,x,y))out.pixels[*index]=value;};
 for(int y=0;y<box.height;++y)for(int x=0;x<box.width;++x){if(source.mask[std::size_t(y)*box.width+x]!=1)continue;const int wx=raster::coordinate(std::int64_t(box.x)+x),wy=raster::coordinate(std::int64_t(box.y)+y);if(!packedFlip||(wx>=0&&wy>=0&&wx<width&&wy<height))write(wx,wy,0);}
 if(packedFlip){for(int y=0;y<box.height;++y)for(int x=0;x<box.width;++x){const auto index=std::size_t(y)*box.width+x;if(source.mask[index]!=1)continue;const int wx=raster::coordinate(std::int64_t(box.x)+(horizontal?box.width-1-x:x)),wy=raster::coordinate(std::int64_t(box.y)+(horizontal?y:box.height-1-y));if(wx>=0&&wy>=0&&wx<width&&wy<height)write(wx,wy,source.pixels[index]);}}
 else for(const auto& cell:fastSelectionTransformCells(source,transform,width,height)){const auto value=selectionContains(capture,cell.x,cell.y)?cell.value:brushComposite(raster::readWorld(out,cell.x,cell.y),cell.value,100);write(cell.x,cell.y,value);}
 return out;
}

}
void Document::applySurfaceEdit(const Edit& e,bool forward){
 for(const auto& value:e.textChanges){auto it=timeline_.cels_.find(value.id);if(it!=timeline_.cels_.end())timeline_.state_.cels[it->second].text=forward?value.after:value.before;}
 for(const auto& c:e.ownerOffsets){const auto r=timeline_.resolveSurface(c.ownerId);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface||r.source->id!=c.ownerId)throw std::logic_error("Invalid offset history owner");}
 for(const auto& c:e.ownerOffsets){auto* live=timeline_.mutableOwnedSurface(c.ownerId);if(!live)throw std::logic_error("Missing offset history owner");live->offsetX=forward?c.afterX:c.beforeX;live->offsetY=forward?c.afterY:c.beforeY;change_={0,0,width_,height_};}
 if(e.surfaceChanges.empty())return;
 std::size_t used=adjustmentStorageBudget(timeline_,1);std::vector<timeline::Surface> replacements;std::vector<timeline::Surface*> owners;replacements.reserve(e.surfaceChanges.size());owners.reserve(e.surfaceChanges.size());
 for(const auto& change:e.surfaceChanges){const auto live=timeline_.resolveSurface(change.ownerId);if(live.issue!=timeline::LinkIssue::None||!live.source||!live.surface||live.source->id!=change.ownerId)throw std::logic_error("Invalid convolution history owner");const auto& desired=forward?change.after:change.before;raster::validate(desired);const auto bytes=convolutionSurfaceBytes(desired);if(bytes>adjustmentByteLimit-used)throw std::length_error("Convolution history restore exceeds pixel budget");used+=bytes;}
 for(const auto& change:e.surfaceChanges)replacements.push_back(forward?change.after:change.before);
 for(const auto& change:e.surfaceChanges){auto* owner=timeline_.mutableOwnedSurface(change.ownerId);if(!owner)throw std::logic_error("Missing convolution history owner");owners.push_back(owner);}
 auto active=forward?e.afterActive:e.beforeActive;auto frameId=forward?e.afterFrame:e.beforeFrame;
 for(std::size_t i=0;i<owners.size();++i)std::swap(*owners[i],replacements[i]);
 if(!active.empty())activeLayerId_=std::move(active);if(!frameId.empty())activeFrameId_=std::move(frameId);change_={0,0,width_,height_};
}
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
bool Document::beginFilterPreview(){if(hasTilemapContent()||hasFreeTileContent())return false;if(!activeMaskId_.empty())return false;
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
 Edit edit{{},state_,nextState_};captureGroupEdit(edit,false);captureGroupEdit(edit,true);edit.afterLayerStructure->layers=next.layers;edit.afterLayerStructure->groups=next.groups;edit.afterActive=task.layerId+"-0";edit.afterTimelineSelection=TimelineSelection{};edit.afterTimelineSelection->layerAnchor=task.groupId;edit.afterGroupUi->selected={task.groupId};edit.afterGroupUi->focus=task.groupId;
 edit.structureCels.reserve(4*old.frames.size());for(auto& c:next.cels)if(added.count(c.layerId)){edit.structureCelBytes+=sizeof(c)+c.id.size()+c.layerId.size()+c.frameId.size()+(c.linkedCelId?c.linkedCelId->size():0)+(c.surface?c.surface->pixels.size()*sizeof(Pixel):0);edit.structureCels.push_back(std::move(c));}if(edit.structureCels.size()!=4*old.frames.size())throw std::logic_error("Incomplete LCD frame slots");
 const bool committed=commitGroupEdit(std::move(edit),U"LCD屏幕滤镜");if(committed){cancelFilterPreview();task.completed=false;}return committed;
 }
 const auto& next=task.result->state();if(next.layers.size()!=timeline_.state().layers.size()+1||next.layers.front().id!=task.layerId||next.frames.size()!=timeline_.state().frames.size()||next.cels.size()!=timeline_.state().cels.size()+next.frames.size()||!task.result->diagnoseLinks().empty())throw std::logic_error("Invalid filter result structure");
 Edit edit{{},state_,nextState_};captureLayerOrder(edit,false);edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTimelineSelection=timelineSelection_;edit.beforeSelection=selectedFrames_;edit.beforeFrameAnchor=frameAnchor_;edit.detachedLayer=next.layers.front();edit.detachedCels.reserve(next.frames.size());for(const auto& c:next.cels)if(c.layerId==task.layerId)edit.detachedCels.push_back(c);if(edit.detachedCels.size()!=next.frames.size())throw std::logic_error("Incomplete filter result frame slots");for(const auto& l:next.layers)edit.afterOrder.push_back(l.id);edit.afterActive=task.layerId;
 auto after=timelineSelection_;after.layers={task.layerId};after.layerAnchor=task.layerId;edit.afterTimelineSelection=after;edit.afterSelection=selectedFrames_;edit.afterFrameAnchor=frameAnchor_;for(const auto& l:timeline_.state().layers)edit.beforeLayerOpacityProjection.push_back({l.id,l.opacity});for(const auto& l:next.layers)edit.afterLayerOpacityProjection.push_back({l.id,l.opacity});
 auto active=task.layerId;history_.reserve(position_+1);timeline_=std::move(*task.result);activeLayerId_=std::move(active);timelineSelection_=std::move(after);cancelFilterPreview();change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),task.lcd?U"LCD屏幕滤镜":std::u32string(filterPresetDefinition(task.preset).name));return true;
}
bool Document::applyFilterPreset(FilterPreset preset,std::optional<double> opacity){if(hasTilemapContent()||hasFreeTileContent())return false;
 if(!beginFilterPreview())return false;try{auto task=captureFilterPreviewTask(preset,opacity);if(!task||!runFilterPreviewTask(*task,{})){cancelFilterPreview();return false;}return commitFilterPreviewTask(std::move(*task));}catch(...){cancelFilterPreview();throw;}
}

bool Document::applyLcdScreenFilter(int width,int height){if(!beginFilterPreview())return false;try{auto task=captureFilterPreviewTask(FilterPreset::CrtSubtle,{},true,width,height);if(!task||!runFilterPreviewTask(*task,{})){cancelFilterPreview();return false;}return commitFilterPreviewTask(std::move(*task));}catch(...){cancelFilterPreview();throw;}}

bool Document::beginColorAdjustment(const std::vector<std::string>& layers){if(hasTilemapContent()||hasFreeTileContent())return false;
 commitFloatingPaste();cancelStroke();auto ids=selection_ || layers.empty()?std::vector<std::string>{layer().id}:layers;std::vector<std::string> targets;
 for(const auto& id:ids){const auto it=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==id;});if(it==timeline_.state().layers.end() || it->kind=="adjustment" || layerEffectivelyLocked(*it))continue;const auto* c=timeline_.findCel(id,frame().id);if(!c)continue;const auto resolved=timeline_.resolveSurface(c->id);if(!resolved.source || !resolved.surface)continue;if(std::find(targets.begin(),targets.end(),resolved.source->id)==targets.end())targets.push_back(resolved.source->id);}
 if(targets.empty())return false;adjustmentStorageBudget(timeline_,3);adjustment_=AdjustmentPreview{timeline_,timeline_,std::move(targets),selection_,layer().id,frame().id,contentRevision_};++gradientRevision_;return true;
}
bool Document::beginColorReplacement(const std::vector<std::string>& celIds,bool clipSelection){if(hasTilemapContent()||hasFreeTileContent())return false;if(!activeMaskId_.empty())return false;
 commitFloatingPaste();cancelStroke();if(clipSelection && !selection_)return false;std::vector<std::string> targets;
 for(const auto& id:celIds){const auto* c=timeline_.findCelById(id);if(!c)continue;const auto l=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==c->layerId;});if(l==timeline_.state().layers.end() || l->kind=="adjustment" || layerEffectivelyLocked(*l))continue;const auto r=timeline_.resolveSurface(id);if(r.source && r.surface && std::find(targets.begin(),targets.end(),r.source->id)==targets.end())targets.push_back(r.source->id);}
 if(targets.empty())return false;adjustmentStorageBudget(timeline_,3);adjustment_=AdjustmentPreview{timeline_,timeline_,std::move(targets),selection_,layer().id,frame().id,contentRevision_,clipSelection};++gradientRevision_;return true;
}
bool Document::updateColorReplacement(Pixel source,Pixel replacement,bool enabled){
 if(!adjustment_)return false;auto& p=*adjustment_;
 if(p.contentRevision!=contentRevision_ || p.frameId!=frame().id || p.layerId!=layer().id || !selectionEqual(p.selection,selection_)){cancelColorAdjustment();return false;}
 adjustmentStorageBudget(p.baseline,4);auto preview=p.baseline;
 if(enabled && source!=replacement)for(const auto& id:p.targets){
  auto* s=preview.mutableOwnedSurface(id);if(!s)throw std::logic_error("Missing replacement owner");
  for(int y=0;y<s->height;++y)for(int x=0;x<s->width;++x){auto& value=s->pixels[std::size_t(y)*s->width+x];
   if(value==source && (!p.clipSelection || selectionContains(p.selection,x+s->offsetX,y+s->offsetY)))value=replacement;
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
  }
 }
 p.preview=std::move(preview);++gradientRevision_;return true;
}
bool Document::beginAntiAliasPreview(){if(hasTilemapContent()||hasFreeTileContent())return false;
 const auto commandLayers=selectedLayerIdsWithGroups();if(hasSelectedGroups()&&commandLayers.empty())return false;
 commitFloatingPaste();cancelStroke();const auto& state=timeline_.state();std::vector<std::string> selected;
 if(!timelineSelection_.cels.empty())selected=timelineSelection_.cels;
 else{std::vector<std::string> layers=commandLayers;if(layers.empty()){if(!selectedFrames_.empty()){for(const auto& l:state.layers)if(layerEffectivelyVisible(l)&&!layerEffectivelyLocked(l))layers.push_back(l.id);}else layers.push_back(layer().id);}const auto frames=selectedFrames_.empty()?std::vector<std::string>{frame().id}:selectedFrames_;for(const auto& f:frames)for(auto it=state.layers.rbegin();it!=state.layers.rend();++it)if(std::find(layers.begin(),layers.end(),it->id)!=layers.end()){const auto* c=timeline_.findCel(it->id,f);if(c)selected.push_back(c->id);}}
 std::vector<std::string> targets,frames;for(const auto& id:selected){const auto* c=timeline_.findCelById(id);if(!c)continue;auto l=std::find_if(state.layers.begin(),state.layers.end(),[&](const auto& l){return l.id==c->layerId;});if(l==state.layers.end())continue;if(layerEffectivelyLocked(*l))return false;const auto r=timeline_.resolveSurface(id);if(!r.source||!r.surface)continue;if(std::find(targets.begin(),targets.end(),r.source->id)==targets.end()){targets.push_back(r.source->id);frames.push_back(c->frameId);}}
 if(targets.empty())return false;adjustmentStorageBudget(timeline_,3);adjustment_=AdjustmentPreview{timeline_,timeline_,std::move(targets),selection_,layer().id,frame().id,contentRevision_,true,std::move(frames)};++gradientRevision_;return true;
}
std::optional<Document::AntiAliasTask> Document::captureAntiAliasTask() const {
 auto captured=captureConvolutionTask();if(!captured)return {};AntiAliasTask task{std::move(*captured),adjustment_->baseline,adjustment_->targetFrames,{}};for(int id:palette_.order()){const auto* entry=paletteEntry(id);if(entry&&entry->id&&(entry->color>>24))task.palette.push_back(entry->color);}return task;
}
std::optional<std::vector<std::vector<Pixel>>> Document::runAntiAliasTask(AntiAliasTask task,const AntiAliasOptions& options,const std::function<bool()>& cancelled){
 std::vector<std::vector<Pixel>> results;const auto& captured=task.captured;
 for(std::size_t i=0;i<captured.targets.size();++i){if(cancelled())return {};const auto& target=captured.targets[i];auto* surface=task.timeline.mutableOwnedSurface(target.first);auto composite=compositeNormalRegion(task.timeline,captured.frameId,{0,0,captured.width,captured.height});auto canvas=options.colorSource==1?composite:std::vector<Pixel>{};auto sample=[&](int x,int y){if(x<0||y<0||x>=captured.width||y>=captured.height)return Pixel(0);return composite[std::size_t(y)*captured.width+x];};auto write=[&](std::size_t index,Pixel value){surface->pixels[index]=value;composite[index]=compositeNormalRegion(task.timeline,captured.frameId,{int(index%captured.width),int(index/captured.width),1,1})[0];};auto out=antiAliasPixels(target.second,captured.width,captured.height,captured.selection,options,task.palette,canvas,sample,write,cancelled);if(!out)return {};results.push_back(std::move(*out));}
 return results;
}
std::optional<Document::AntiAliasSurfaceTask> Document::captureAntiAliasSurfaceTask(const AntiAliasOptions& options)const{
 if(!adjustment_)return {};const auto& p=*adjustment_;
 if(p.contentRevision!=contentRevision_||p.frameId!=frame().id||p.layerId!=layer().id||!selectionEqual(p.selection,selection_))return {};
 AntiAliasSurfaceTask task;task.options=options;task.surfaces.baseBytes=convolutionSnapshotBytes(timeline_,p.baseline,p.preview);task.simulationBytes=adjustmentStorageBudget(p.baseline,1);
 const auto minimum=std::uint64_t(antiAliasCanvasCount(width_,height_))*(options.colorSource==1?80:24);std::size_t used=task.surfaces.baseBytes;
 if(task.simulationBytes>adjustmentByteLimit-used)throw std::length_error("Anti-alias capture exceeds pixel budget");used+=task.simulationBytes;
 if(minimum>adjustmentByteLimit-used)throw std::length_error("Anti-alias capture exceeds pixel budget");used+=std::size_t(minimum);
 for(const auto& id:p.targets){const auto r=p.baseline.resolveSurface(id);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface||r.source->id!=id)throw std::logic_error("Invalid anti-alias owner");const auto bytes=convolutionSurfaceBytes(*r.surface);if(bytes>adjustmentByteLimit-used)throw std::length_error("Anti-alias capture exceeds pixel budget");used+=bytes;}
 auto source=captureGradientMapTask();if(!source)return {};task.surfaces.source=std::move(*source);task.simulation=p.baseline;task.frames=p.targetFrames;
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
 for(std::size_t i=0;i<captured.targets.size();++i){if(stop())return false;const auto& target=captured.targets[i];auto* surface=task.simulation.mutableOwnedSurface(target.ownerId);if(!surface)throw std::logic_error("Missing anti-alias simulation owner");
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
  auto write=[&](std::size_t index,Pixel value){if(index>=input.size())throw std::logic_error("Invalid anti-alias pixel");const int x=int(index%width),y=int(index/width);auto local=raster::worldIndex(*surface,x,y);if(!local)throw std::logic_error("Anti-alias target outside union");changed=changed||input[index]!=value;surface->pixels[*local]=value;composite[index]=compositeNormalRegion(task.simulation,task.frames[i],{x,y,1,1})[0];};
  auto output=antiAliasPixels(input,width,height,captured.selection,task.options,task.palette,canvas,sample,write,stop);if(!output||stop())return false;
  // Legacy recordPixel rejects unchanged packed values: geometry alone is no edit.
  if(changed){s.results[i]=*surface;s.produced[i]=1;}
 }
 if(stop())return false;s.completed=true;return true;
}
bool Document::publishAntiAliasSurfaceTask(AntiAliasSurfaceTask&& task){
 if(!adjustment_||!task.surfaces.completed)return false;auto& p=*adjustment_;
 if(task.frames!=p.targetFrames||!antiAliasCompositeContextEqual(timeline_,task.simulation))return false;
 std::vector<Pixel> palette;for(int id:palette_.order()){const auto* entry=paletteEntry(id);if(entry&&entry->id&&(entry->color>>24))palette.push_back(entry->color);}if(palette!=task.palette)return false;
 for(const auto& c:p.baseline.state().cels)if(c.surface){const auto live=timeline_.resolveSurface(c.id);if(live.issue!=timeline::LinkIssue::None||!live.surface||!adjustmentSameGeometry(*c.surface,*live.surface)||c.surface->pixels!=live.surface->pixels)return false;}
 antiAliasTaskStorage(task);
 task.simulation=timeline::Timeline{};
 return publishConvolutionSurfaceTask(std::move(task.surfaces));
}
bool Document::commitAntiAliasAdjustment(){
 if(!adjustment_)return false;
 // Legacy selected-target command refuses the batch if any selected target locks.
 for(const auto& id:adjustment_->targets){const auto r=timeline_.resolveSurface(id);if(!r.source)throw std::logic_error("Missing anti-alias commit owner");const auto l=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& item){return item.id==r.source->layerId;});if(l==timeline_.state().layers.end())throw std::logic_error("Missing anti-alias commit layer");if(layerEffectivelyLocked(*l))return false;}
 return commitConvolutionAdjustment();
}
std::optional<Document::GradientMapTask> Document::captureGradientMapTask()const{
 if(!adjustment_)return {};const auto& p=*adjustment_;
 if(p.contentRevision!=contentRevision_ || p.frameId!=frame().id || p.layerId!=layer().id || !selectionEqual(p.selection,selection_))return {};
 const auto bytes=adjustmentStorageBudget(p.baseline,4);auto remaining=adjustmentByteLimit-4*bytes;
 // Budget every owner before copying the first target surface.
 for(const auto& id:p.targets){const auto r=p.baseline.resolveSurface(id);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface||r.source->id!=id)throw std::logic_error("Invalid gradient map owner");if(r.surface->pixels.size()>remaining/sizeof(Pixel))throw std::length_error("Gradient map worker exceeds pixel budget");remaining-=r.surface->pixels.size()*sizeof(Pixel);}
 GradientMapTask task{width_,height_,identity_,contentRevision_,gradientRevision_,p.layerId,p.frameId,p.selection,bytes,{}};task.targets.reserve(p.targets.size());
 for(const auto& id:p.targets)task.targets.push_back({id,*p.baseline.resolveSurface(id).surface});return task;
}
bool Document::runGradientMapTask(GradientMapTask& task,const GradientMapSettings& settings,const std::function<bool()>& cancelled){
 task.completed=false;gradientMapTaskStorage(task);auto stop=[&]{return cancelled&&cancelled();};if(stop())return false;
 GradientMapSampler sampler(settings);
 for(auto& target:task.targets){auto& s=target.surface;
  for(int y=0;y<s.height;++y){const int wy=s.offsetY+y;const auto row=std::size_t(y)*s.width;
   for(int x=0;x<s.width;++x){const auto i=row+x;if((i&1023)==0&&stop())return false;const int wx=s.offsetX+x;
    if(!task.selection||selectionContains(task.selection,wx,wy))s.pixels[i]=sampler(s.pixels[i],wx,wy);
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
 for(std::size_t i=0;i<task.source.targets.size();++i){if(stop())return false;auto out=convolveSurface(task.source.targets[i].surface,task.source.width,task.source.height,task.options,task.source.selection,task.plans[i],stop);if(stop())return false;if(out){if(!adjustmentSameGeometry(*out,task.plans[i].geometry))throw std::logic_error("Convolution result geometry mismatch");task.results[i]=std::move(*out);task.produced[i]=1;}}
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
bool Document::commitConvolutionAdjustment(){
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
 Edit e{{},state_,nextState_};e.beforeActive=e.afterActive=layer().id;e.beforeFrame=e.afterFrame=frame().id;e.beforeSelection=e.afterSelection=selectedFrames_;e.surfaceChanges.reserve(targets.size());
 for(const auto& id:targets)e.surfaceChanges.push_back({id,*p.baseline.resolveSurface(id).surface,*p.preview.resolveSurface(id).surface});
 history_.reserve(position_+1);struct Install{timeline::Surface* live;timeline::Surface* preview;};std::vector<Install> install;install.reserve(targets.size());
 for(const auto& id:targets){auto* live=timeline_.mutableOwnedSurface(id);auto* preview=p.preview.mutableOwnedSurface(id);if(!live||!preview)throw std::logic_error("Missing convolution install owner");install.push_back({live,preview});}
 for(const auto& t:install)std::swap(*t.live,*t.preview);
 cancelColorAdjustment();change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"卷积矩阵");return true;
}
std::optional<Document::ConvolutionTask> Document::captureConvolutionTask() const {
 if(!adjustment_)return {};const auto& p=*adjustment_;if(p.contentRevision!=contentRevision_ || p.frameId!=frame().id || p.layerId!=layer().id || !selectionEqual(p.selection,selection_))return {};
 ConvolutionTask task{width_,height_,identity_,contentRevision_,p.layerId,p.frameId,p.selection,{}};for(const auto& id:p.targets){const auto* s=p.baseline.resolveSurface(id).surface;if(!s || s->width!=width_ || s->height!=height_ || s->offsetX || s->offsetY)throw std::runtime_error("Convolution requires native full canvas RGBA surface");task.targets.emplace_back(id,s->pixels);}return task;
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
 if(p.contentRevision!=contentRevision_ || p.frameId!=frame().id || p.layerId!=layer().id || !selectionEqual(p.selection,selection_)){cancelColorAdjustment();return false;}
 const auto storageBytes=adjustmentStorageBudget(p.baseline,3);
 std::size_t available=adjustmentByteLimit-3*storageBytes;
 Edit e{{},state_,nextState_};e.beforeActive=e.afterActive=layer().id;e.beforeFrame=e.afterFrame=frame().id;e.beforeSelection=e.afterSelection=selectedFrames_;
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
  Edit child{{},state_,nextState_};child.targetCelId=id;child.pixelAddress=PixelAddressSpace{b.width,b.height,b.storageOriginX.value_or(0),b.storageOriginY.value_or(0)};child.runs.reserve(count);
  for(std::size_t i=0;i<b.pixels.size();++i)if(b.pixels[i]!=a.pixels[i]){
   if(!child.runs.empty() && child.runs.back().index+child.runs.back().length==i && child.runs.back().before==b.pixels[i] && child.runs.back().after==a.pixels[i])++child.runs.back().length;
   else child.runs.push_back({i,1,b.pixels[i],a.pixels[i]});
  }
  e.children.push_back(std::move(child));
 }
 if(e.children.empty()){cancelColorAdjustment();return false;}
 history_.reserve(position_+1);
 for(const auto& child:e.children){auto* live=timeline_.mutableOwnedSurface(child.targetCelId);auto* preview=p.preview.mutableOwnedSurface(child.targetCelId);if(!live||!preview)throw std::logic_error("Missing adjustment install owner");install.push_back({live,preview});}
 // Preflight is complete; vector swaps preserve current metadata and cannot allocate.
 for(const auto& target:install)target.live->pixels.swap(target.preview->pixels);
 cancelColorAdjustment();change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"亮度/对比度");return true;
}

void Document::beginStroke(Point p,Pixel color,BrushOptions brush,const PatternBrush* image,double angle,const std::unordered_map<std::size_t,Pixel>* baseline,bool stampInitial,bool tileSecondary,bool tileErase){try{
 if(activeMaskId_.empty()&&layer().kind=="free-tile"&&!freeTilePaintMode()){beginFreeTileSourceStroke(p,color,brush,image,angle,baseline,stampInitial,tileSecondary&&tileErase);return;}
 strokeColorReplacement_.reset();projectStrokeStarted_=std::chrono::steady_clock::now();
 commitFloatingPaste();cancelStroke();imagePattern_.reset();if(image&&image->intrinsicSize&&brush.imagePaintMode!=PatternPaintMode::Paint)imagePattern_.emplace(*image,brush.imagePaintMode,p.x,p.y);strokeImageAngle_=angle;change_={};if(!activeMaskId_.empty()){if(!maskBrushAvailable())return;auto* mask=mutableActiveMask();maskStrokeBefore_=timeline_.state().masks;auto& source=mask->surface;if(!raster::fullCanvas(source,width_,height_)){auto expanded=raster::expanded(source,{0,0,width_,height_},256*1024*1024);if(expanded)source=std::move(*expanded);}strokePixels_=&static_cast<std::vector<Pixel>&>(source.pixels);strokeCanvasStorage_=raster::fullCanvas(source,width_,height_);strokeStride_=source.width;strokeOffsetX_=source.offsetX;strokeOffsetY_=source.offsetY;strokeAddress_={width_,height_,raster::coordinate(std::int64_t(source.storageOriginX.value_or(0))-source.offsetX),raster::coordinate(std::int64_t(source.storageOriginY.value_or(0))-source.offsetY)};brush.size=std::clamp(brush.size,1,64);brush.opacity=std::clamp(brush.opacity,0,100);stampSpans_=brushSpans(brush);if(pendingLookup_.size()!=std::size_t(width_)*height_)pendingLookup_.assign(std::size_t(width_)*height_,-1);inheritedStrokeBaseline_.clear();imageStamp_=image?std::optional<ImageBrushStamp>{prepareImageBrushStamp(*image,brush.size,angle)}:std::nullopt;imageEraseCoverage_.clear();inkStampCoverage_.clear();active_=true;projectStrokeStarted_=std::chrono::steady_clock::now();last_=p;color_=timeline::normalizedMaskPixel(color);brush_=brush;hasPreviousStamp_=false;if(brush_.perfectPixels){perfectPath_.push_back({p.x,p.y,brush.size,brush.opacity});perfectPendingStart_=pending_.size();capturingPerfectTail_=true;}if(stampInitial)stamp(p.x,p.y);publishChange();return;}if(layer().kind=="tilemap"){if(layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer())||hasSelectedGroups()||!cel().tilemap)return;startTilemapStroke(p,tileSecondary);if(tileErase)tilePaintValue_.reset();if(tileSelection_.mode==tiles::Mode::Paint){active_=true;last_=p;paintTilemapLine(p);return;}}else if(!rasterToolsAvailable())return;
 const auto resolved=timeline_.resolveSurface(cel().id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.source||!resolved.surface)throw std::logic_error("Invalid brush Cel owner");const auto& source=*resolved.surface;raster::validate(source);
 std::optional<timeline::Surface> expansion;
 const bool covers=source.offsetX<=0&&source.offsetY<=0&&std::int64_t(source.offsetX)+source.width>=width_&&std::int64_t(source.offsetY)+source.height>=height_;
 if(!covers){constexpr std::size_t limit=256*1024*1024;std::size_t used=0;for(const auto& c:timeline_.state().cels)if(c.surface){const auto count=c.surface->pixels.size();if(count>(limit-used)/sizeof(Pixel))throw std::length_error("Brush expansion exceeds document pixel budget");used+=count*sizeof(Pixel);}expansion=raster::expanded(source,{0,0,width_,height_},limit-used);}
 const auto& prepared=expansion?*expansion:source;
 const PixelAddressSpace address{width_,height_,raster::coordinate(std::int64_t(prepared.storageOriginX.value_or(0))-prepared.offsetX),raster::coordinate(std::int64_t(prepared.storageOriginY.value_or(0))-prepared.offsetY)};
 // Allocate preparation before installing geometry; retain old storage for failure rollback.
 auto inherited=baseline?*baseline:std::unordered_map<std::size_t,Pixel>{};
 auto imageStamp=image?std::optional<ImageBrushStamp>{prepareImageBrushStamp(*image,brush.size,angle)}:std::nullopt;
 brush.size=std::clamp(brush.size,1,64);brush.opacity=std::clamp(brush.opacity,0,100);auto spans=brushSpans(brush);
 if(pendingLookup_.size()!=std::size_t(width_)*height_)pendingLookup_.assign(std::size_t(width_)*height_,-1);
 auto* owner=timeline_.mutableOwnedSurface(resolved.source->id);if(!owner)throw std::logic_error("Missing writable brush owner");
 if(expansion)std::swap(*owner,*expansion);
 strokePixels_=&static_cast<std::vector<Pixel>&>(owner->pixels);strokeCanvasStorage_=raster::fullCanvas(*owner,width_,height_);strokeStride_=owner->width;strokeOffsetX_=owner->offsetX;strokeOffsetY_=owner->offsetY;strokeAddress_=address;
 inheritedStrokeBaseline_=std::move(inherited);imageStamp_=std::move(imageStamp);imageEraseCoverage_.clear();inkStampCoverage_.clear();stampSpans_=std::move(spans);perfectPath_.clear();perfectTailPixels_.clear();perfectTailErase_.clear();perfectTailInk_.clear();perfectStable_=0;capturingPerfectTail_=false;active_=true;last_=p;color_=color;brush_=brush;hasPreviousStamp_=false;
 try{if(brush_.perfectPixels){perfectPath_.push_back({p.x,p.y,brush.size,brush.opacity});perfectPendingStart_=pending_.size();capturingPerfectTail_=true;}if(stampInitial)stamp(p.x,p.y);publishChange();}
 catch(...){for(const auto& delta:pending_)strokePixel(delta.index)=delta.before;clearPendingStroke();active_=false;strokePixels_=nullptr;if(expansion)std::swap(*owner,*expansion);change_={};throw;}
}catch(...){if(tileStrokeIncremental_)cancelTilemapStroke();throw;}
}
void Document::capturePerfectPixel(std::size_t i){if(!capturingPerfectTail_||perfectTailPixels_.count(i))return;const int found=pendingLookup_[i];perfectTailPixels_.emplace(i,PerfectTailPixel{strokePixel(i),found,found<0?Pixel{}:pending_[found].after});auto erase=imageEraseCoverage_.find(i);perfectTailErase_[i]=erase==imageEraseCoverage_.end()?std::nullopt:std::optional<int>{erase->second};}
void Document::capturePerfectInkCoverage(std::uint64_t key){if(!capturingPerfectTail_||perfectTailInk_.count(key))return;auto it=inkStampCoverage_.find(key);perfectTailInk_[key]=it==inkStampCoverage_.end()?std::nullopt:std::optional<int>{it->second};}
void Document::rollbackPerfectTail(){capturingPerfectTail_=false;for(const auto& [i,v]:perfectTailPixels_){strokePixel(i)=v.value;pendingLookup_[i]=v.pending;if(v.pending>=0)pending_[v.pending].after=v.after;change_.include(int(i%width_),int(i/width_));}pending_.resize(perfectPendingStart_);for(const auto& [i,v]:perfectTailErase_){if(v)imageEraseCoverage_[i]=*v;else imageEraseCoverage_.erase(i);}for(const auto& [i,v]:perfectTailInk_){if(v)inkStampCoverage_[i]=*v;else inkStampCoverage_.erase(i);}perfectTailPixels_.clear();perfectTailErase_.clear();perfectTailInk_.clear();hasPreviousStamp_=false;}
bool Document::applySmoothBrush(const std::vector<std::size_t>& visited,int strength,std::optional<std::chrono::steady_clock::time_point> started){
 if(active()||!rasterToolsAvailable()||!layer().kind.empty()||!activeMaskId_.empty()||visited.empty())return false;
 const auto resolved=timeline_.resolveSurface(cel().id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.surface)throw std::logic_error("Invalid smooth source");const auto& surface=*resolved.surface;raster::validate(surface);
 for(auto key:visited)if(key>=std::size_t(width_)*height_)throw std::invalid_argument("Invalid smooth coverage");
 auto changed=smoothBrushPixels(width_,height_,visited,selection_,strength,[&](int x,int y){return raster::readWorld(surface,x,y);},[&](int x,int y){return x>=surface.offsetX&&y>=surface.offsetY&&std::int64_t(x)<std::int64_t(surface.offsetX)+surface.width&&std::int64_t(y)<std::int64_t(surface.offsetY)+surface.height;});
 for(auto it=changed.begin();it!=changed.end();){const int x=int(it->first%width_),y=int(it->first/width_);if((selection_&&!selectionContains(selection_,x,y))||raster::readWorld(surface,x,y)==it->second)it=changed.erase(it);else ++it;}
 if(changed.empty())return false;
 beginStroke({0,0},0,{},nullptr,0,nullptr,false);if(!active_)return false;if(started)projectStrokeStarted_=*started;
 try{pending_.reserve(changed.size());for(const auto& entry:changed){const auto index=entry.first;const auto before=strokePixel(index);if(before==entry.second)continue;pending_.push_back({index,before,entry.second});pendingLookup_[index]=int(pending_.size()-1);strokePixel(index)=entry.second;change_.include(int(index%width_),int(index/width_));}HistoryLabelScope label(*this,U"平滑");return commitStroke();}catch(...){cancelStroke();throw;}
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
 if(value==current)return true;
 if(found<0){pending_.push_back({index,current,value});pendingLookup_[index]=int(pending_.size()-1);}else pending_[found].after=value;
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
  auto value=inkBrushComposite(inherited==inheritedStrokeBaseline_.end()?current:inherited->second,color_,brush_.opacity,brush_.ink);if(maskStrokeBefore_)value=timeline::normalizedMaskPixel(value);
  if(current==value) return;
  // legacy core/history.ts recordPixelKnownCurrent: record only touched pixels.
  pending_.push_back({index,current,value});
  pendingLookup_[index]=int(pending_.size()-1);
  strokePixel(index)=value;change_.include(x,y);

}
void Document::stamp(int x,int y) {
  if(imageStamp_){const auto& stamp=imagePattern_?imagePattern_->at(x,y,brush_.size,strokeImageAngle_):*imageStamp_;for(const auto& sample:stamp.samples)for(const auto& p:symmetryPoints({x-stamp.width/2+sample.x,y-stamp.height/2+sample.y},width_,height_,symmetryAxes,symmetryCenter())){
   if(selection_ && !selectionContains(selection_,p.x,p.y))continue;const auto index=std::size_t(p.y)*width_+p.x;if(plotStrokeColorReplacement(index,int(std::floor(sample.coverage*brush_.opacity/100.0+.5))))continue;capturePerfectPixel(index);auto current=strokePixel(index);const int found=pendingLookup_[index];const auto inherited=inheritedStrokeBaseline_.find(index);const auto before=inherited!=inheritedStrokeBaseline_.end()?inherited->second:found<0?current:pending_[found].before;Pixel value;
   if(brush_.ink!=InkMode::Simple){const auto source=sample.color.value_or(color_);const int coverage=brush_.ink==InkMode::CopyAlphaColor?sample.coverage:int(std::floor(sample.coverage*brush_.opacity/100.0+.5));if(!coverage)continue;const auto key=(std::uint64_t(index)<<32)|source;auto seen=inkStampCoverage_.find(key);if(seen!=inkStampCoverage_.end()&&seen->second>=coverage)continue;capturePerfectInkCoverage(key);inkStampCoverage_[key]=coverage;value=applyInkColor(brush_.ink,brush_.ink==InkMode::LockAlpha?before:current,resolveInkStampColor(brush_.ink,source,sample.coverage,brush_.opacity));}
   else if((color_>>24)==0){int coverage=int(std::floor(sample.coverage*brush_.opacity/100.0+.5));if(sample.color)coverage=int(std::floor(coverage*(*sample.color>>24)/255.0+.5));auto seen=imageEraseCoverage_.find(index);if(!coverage || (seen!=imageEraseCoverage_.end() && seen->second>=coverage))continue;imageEraseCoverage_[index]=coverage;value=coverage==255?0:(before&0xffffff)|(Pixel(std::floor((before>>24)*(1-coverage/255.0)+.5))<<24);}
   else if(!stamp.intrinsicSize){const auto source=sample.color.value_or(color_);const int coverage=int(std::floor(sample.coverage*brush_.opacity/100.0+.5));const auto key=(std::uint64_t(index)<<32)|source;auto seen=inkStampCoverage_.find(key);if(!coverage||(seen!=inkStampCoverage_.end()&&seen->second>=coverage))continue;capturePerfectInkCoverage(key);inkStampCoverage_[key]=coverage;value=inkBrushComposite(before,source,brush_.opacity,InkMode::Simple,sample.coverage);}
   else {if(int(std::floor(sample.coverage*brush_.opacity/100.0+.5))==0)continue;value=imageBrushDirectPixel(sample.color.value_or(color_),sample.coverage,brush_.opacity);}
   if(maskStrokeBefore_)value=timeline::normalizedMaskPixel(value);if(current==value)continue;if(found<0){pending_.push_back({index,current,value});pendingLookup_[index]=int(pending_.size()-1);}else pending_[found].after=value;strokePixel(index)=value;change_.include(p.x,p.y);
  }return;}
  const auto anchor=brush_.size/2;
  for(const auto& span:stampSpans_) {
    const auto sourceY=std::int64_t(y)-anchor+span.y;
    if(sourceY<0 || sourceY>=height_) continue;
    const auto py=std::int64_t(y)-anchor+span.y;if(py<0 || py>=height_) continue;
    const auto left=std::max<std::int64_t>(0,std::int64_t(x)-anchor+span.left);
    const auto right=std::min<std::int64_t>(width_-1,std::int64_t(x)-anchor+span.right);
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
    for(auto px=left;px<=std::min(right,previousLeft-1);++px){if(!brushDitherContains(brush_,int(px),int(py)))continue;for(auto q:symmetryPoints({int(px),int(py)},width_,height_,symmetryAxes,symmetryCenter()))plot(q.x,q.y);}
    for(auto px=std::max(left,previousRight+1);px<=right;++px){if(!brushDitherContains(brush_,int(px),int(py)))continue;for(auto q:symmetryPoints({int(px),int(py)},width_,height_,symmetryAxes,symmetryCenter()))plot(q.x,q.y);}
  }
  previousStamp_={x,y};hasPreviousStamp_=true;
}
void Document::line(Point a, Point b) {
  visitBrushLine(a.x,a.y,b.x,b.y,imageStamp_?std::max(imageStamp_->width,imageStamp_->height):brush_.size,bool(imageStamp_),brush_.shape==BrushShape::Line,width_,height_,[&](int x,int y){stamp(x,y);});
}
std::unordered_map<std::size_t,Pixel> Document::brushPreview(Point from,Point to,Pixel color,BrushOptions brush,const PatternBrush* image,double angle,const std::unordered_map<std::size_t,Pixel>* baseline,bool clipSelection) const {
  std::unordered_map<std::size_t,Pixel> result;std::unordered_map<std::size_t,int> eraseCoverage;std::unordered_map<std::uint64_t,int> inkCoverage;
  brush.size=std::clamp(brush.size,1,64);brush.opacity=std::clamp(brush.opacity,0,100);
  const auto spans=brushSpans(brush);const auto imageStamp=image?std::optional<ImageBrushStamp>{prepareImageBrushStamp(*image,brush.size,angle)}:std::nullopt;
  std::optional<ImageBrushPatternSampler> imagePattern;if(image&&image->intrinsicSize&&brush.imagePaintMode!=PatternPaintMode::Paint)imagePattern.emplace(*image,brush.imagePaintMode,from.x,from.y);
  const auto resolved=timeline_.resolveSurface(cel().id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.surface)throw std::logic_error("Invalid brush preview owner");const auto& surface=*resolved.surface;const bool direct=raster::fullCanvas(surface,width_,height_);const auto& sourcePixels=surface.pixels;
  auto plot=[&](int x,int y,int coverage,std::optional<Pixel> sample){
    if(x<0 || y<0 || x>=width_ || y>=height_ || (clipSelection && selection_ && !selectionContains(selection_,x,y)))return;
    const auto i=std::size_t(y)*width_+x;Pixel base=direct?sourcePixels[i]:raster::readWorld(surface,x,y);if(baseline){auto it=baseline->find(i);if(it!=baseline->end())base=it->second;}
    if(!imageStamp){if(!result.count(i))result.emplace(i,inkBrushComposite(base,color,brush.opacity,brush.ink));return;}
    if(brush.ink!=InkMode::Simple){const auto source=sample.value_or(color);const int c=brush.ink==InkMode::CopyAlphaColor?coverage:int(std::floor(coverage*brush.opacity/100.0+.5));if(!c)return;const auto key=(std::uint64_t(i)<<32)|source;if(inkCoverage[key]>=c)return;inkCoverage[key]=c;const auto destination=brush.ink==InkMode::LockAlpha?base:result.count(i)?result.at(i):base;result[i]=applyInkColor(brush.ink,destination,resolveInkStampColor(brush.ink,source,coverage,brush.opacity));return;}
    if(!(color>>24)){int c=int(std::floor(coverage*brush.opacity/100.0+.5));if(sample)c=int(std::floor(c*(*sample>>24)/255.0+.5));if(c<=eraseCoverage[i])return;eraseCoverage[i]=c;result[i]=c==255?0:(base&0xffffff)|(Pixel(std::floor((base>>24)*(1-c/255.0)+.5))<<24);}
    else if(int(std::floor(coverage*brush.opacity/100.0+.5)))result[i]=imageStamp->intrinsicSize&&!imagePattern?imageBrushDirectPixel(sample.value_or(color),coverage,brush.opacity):inkBrushComposite(base,sample.value_or(color),brush.opacity,InkMode::Simple,coverage);
  };
  auto stamp=[&](int x,int y){
    if(imageStamp){const auto& active=imagePattern?imagePattern->at(x,y,brush.size,angle):*imageStamp;for(const auto& sample:active.samples)for(auto p:symmetryPoints({x-active.width/2+sample.x,y-active.height/2+sample.y},width_,height_,symmetryAxes,symmetryCenter()))plot(p.x,p.y,sample.coverage,sample.color);}
    else for(auto row:spans){const int sy=y-brush.size/2+row.y;if(sy<0||sy>=height_)continue;for(int sx=x-brush.size/2+row.left;sx<=x-brush.size/2+row.right;++sx){if(sx<0||sx>=width_||!brushDitherContains(brush,sx,sy))continue;for(auto q:symmetryPoints({sx,sy},width_,height_,symmetryAxes,symmetryCenter()))plot(q.x,q.y,255,{});}}
  };
  visitBrushLine(from.x,from.y,to.x,to.y,imageStamp?std::max(imageStamp->width,imageStamp->height):brush.size,bool(imageStamp),brush.shape==BrushShape::Line,width_,height_,stamp);
  return result;
}
bool Document::updateGeometricBrushPreview(const std::vector<SelectionPoint>& points,Pixel color,BrushOptions brush,const PatternBrush* image,double angle){
 if(!shapeActive())return false;const auto& initial=*gradient_;
 if(initial.contentRevision!=contentRevision_||initial.layerId!=layer().id||initial.frameId!=frame().id||!selectionEqual(initial.selection,selection_)){cancelGradient();return false;}
 // Reuse native isolated timeline previews and the actual brush stamp/authority
 // transaction. Never run a pending stroke against the live document.
 std::size_t bytes=0;for(const auto& cel:timeline_.state().cels)if(cel.surface)bytes+=cel.surface->pixels.size()*sizeof(Pixel);for(const auto& mask:timeline_.state().masks)bytes+=mask.mask.surface.pixels.size()*sizeof(Pixel);for(const auto& set:timeline_.state().tilesets)bytes+=set.pixels.size()*sizeof(Pixel);
 if(bytes>64*1024*1024||std::uint64_t(width_)*height_*24>256*1024*1024-bytes*2)throw std::length_error("Curve preview exceeds document pixel budget");
 auto draft=std::make_unique<Document>(width_,height_);draft->timeline_=timeline_;draft->activeLayerId_=activeLayerId_;draft->activeFrameId_=activeFrameId_;draft->selection_=selection_;draft->activeMaskId_=activeMaskId_;draft->symmetryAxes=symmetryAxes;draft->symmetryCenter_=symmetryCenter_;draft->tileSelection_=tileSelection_;draft->freeInstanceSelected_=freeInstanceSelected_;draft->freeInstancePrimary_=freeInstancePrimary_;draft->freeInstanceSelectionFrame_=freeInstanceSelectionFrame_;
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
 try{for(auto particle:particles)for(auto row:footprint.spans)for(int x=particle.x-footprint.width/2+row.left;x<=particle.x-footprint.width/2+row.right;++x)for(auto q:symmetryPoints({x,particle.y-footprint.height/2+row.y},width_,height_,symmetryAxes,symmetryCenter()))plot(q.x,q.y);brush_=saved;publishChange();}catch(...){brush_=saved;cancelStroke();throw;}
}
void Document::updateStroke(Point point) {
 if(auto edit=freeTileSourceStrokeDocument()){try{edit->updateStroke(freeTileSourceStrokePoint(point));publishFreeTileSourceStroke();}catch(...){cancelFreeTileSourceStroke();throw;}return;}
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
void Document::mergeLastStrokeEdits(){if(position_>=2 && position_==history_.size())groupEdits(position_-2,selectedFrames_);}
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
  if(maskStrokeBefore_){bool changed=false;for(const auto& delta:pending_)changed=changed||delta.before!=delta.after;auto before=std::move(*maskStrokeBefore_);maskStrokeBefore_.reset();active_=false;strokePixels_=nullptr;clearPendingStroke();if(!changed)return false;projectInformation_.drawing(std::max<std::int64_t>(1,std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-projectStrokeStarted_).count()));return commitMasks(std::move(before),U"绘制蒙版");}
  Edit edit{{}, state_, nextState_};
  edit.targetCelId=cel().id;edit.pixelAddress=strokeAddress_;
  edit.pixels.reserve(pending_.size());
  for(const auto& delta:pending_) if(delta.before!=delta.after) edit.pixels.push_back(delta);
  if(edit.pixels.empty()) {active_=false;strokePixels_=nullptr;clearPendingStroke();return false;}
  pushEdit(std::move(edit),U"绘制");
  projectInformation_.drawing(std::max<std::int64_t>(1,std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-projectStrokeStarted_).count()));
  active_ = false;strokePixels_=nullptr; clearPendingStroke();
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
  publishChange();clearPendingStroke();
  active_ = false;strokePixels_=nullptr;if(maskStrokeBefore_){timeline_.state_.masks=std::move(*maskStrokeBefore_);maskStrokeBefore_.reset();}
}
Document Document::fromClipboardRaster(const SelectionClipboard& source) {
  // Legacy pasteAsNewDocument creates RGBA with the default two-color palette.
  if(source.width<1 || source.height<1 || source.width>1024 || source.height>1024)
    throw std::invalid_argument("粘贴为新项目仅支持每边 1..1024 像素；剪贴板图像未被裁剪");
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
Document Document::fromImage(int width,int height,std::vector<Pixel> pixels,std::u32string name){if(width<1||height<1||width>1024||height>1024||pixels.size()!=std::size_t(width)*height)throw std::invalid_argument("Native images must be 1..1024 pixels");Document d(width,height);d.timeline_.mutableOwnedSurface(d.cel().id)->pixels=std::move(pixels);auto colors=extractImportedPalette({d.pixels()},256,262144);d.palette_.entries.clear();d.palette_.slots.clear();int id=1;for(auto c:colors){{auto text=std::to_string(id);d.palette_.entries.push_back({id,U"颜色 "+std::u32string(text.begin(),text.end()),c});}d.palette_.slots.push_back(id++);}d.palette_.slots.resize((d.palette_.slots.size()+7)/8*8);d.palette_.nextId=id;d.name_=std::move(name);d.markSaved();return d;}
bool Document::importSpriteSheet(const SheetImportOptions& options){if(hasTilemapContent()||hasFreeTileContent())return false;commitFloatingPaste();cancelStroke();auto next=buildSpriteSheetImport(*this,options);Edit e{{},state_,nextState_};e.beforeDimensions={{width_,height_}};e.afterDimensions={{options.width,options.height}};e.beforeTimeline=timeline_.state();e.afterTimeline=std::move(next);e.beforeActive=activeLayerId_;e.beforeFrame=activeFrameId_;e.afterActive=e.afterTimeline->layers.front().id;e.afterFrame=e.afterTimeline->frames.front().id;e.pixelSelectionEdit=true;e.beforePixelsSelection=selection_;e.beforeSelection=selectedFrames_;e.afterSelection=std::vector<std::string>{};history_.reserve(position_+1);applyEdit(e,true);publishChange();pushEdit(std::move(e),U"导入精灵表");return true;}
bool Document::resizeImage(int width,int height,ImageInterpolation method){if(hasTilemapContent()||hasFreeTileContent())return false;
 if(width<1||height<1||width>1024||height>1024)throw std::invalid_argument("Native editable images support 1..1024 pixels");
 if(width==width_&&height==height_)return false;
 cancelStroke();cancelLayerOpacity();if(active())throw std::runtime_error("Finish the active edit before resizing the image");
 std::size_t remaining=adjustmentByteLimit;auto reserve=[&](std::uint64_t bytes){if(bytes>remaining)throw std::length_error("Image resize exceeds working pixel budget");remaining-=std::size_t(bytes);};
 for(const auto& c:timeline_.state().cels)if(c.surface){const auto p=planImageResizeSurface(*c.surface,width_,height_,width,height);reserve(3ull*c.surface->pixels.size()*sizeof(Pixel)+2ull*p.bytes);}
 if(selection_)reserve(3ull*(selection_->mask.size()+std::uint64_t(width)*height));
 auto masks=resizedImageMasks(timeline_.state(),width_,height_,width,height,method,remaining);
 Edit e{{},state_,nextState_};e.beforeDimensions={{width_,height_}};e.afterDimensions={{width,height}};e.beforeCels=timeline_.state().cels;e.afterCels=e.beforeCels;
 for(auto& c:e.afterCels)if(c.surface)c.surface=imageResizedSurface(*c.surface,planImageResizeSurface(*c.surface,width_,height_,width,height),method);
 if(!masks.empty()){e.beforeMasks=timeline_.state().masks;e.afterMasks=std::move(masks);}
 e.pixelSelectionEdit=true;e.beforePixelsSelection=selection_;e.afterPixelsSelection=resizeImageSelection(selection_,width_,height_,width,height);
 history_.reserve(position_+1);applyEdit(e,true);publishChange();pushEdit(std::move(e),U"图像大小");return true;
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
bool Document::resizeCanvas(int width,int height,CanvasAnchor anchor,std::optional<int> offsetX,std::optional<int> offsetY,bool trimOutside,std::optional<TransformPoint> pivot){if(hasTilemapContent()||hasFreeTileContent())return false;
 if(width<1||height<1||width>1024||height>1024)throw std::invalid_argument("Native editable canvases support 1..1024 pixels");
 const auto shift=canvasResizeOffset(width_,height_,width,height,anchor,offsetX,offsetY);if(pivot&&(!std::isfinite(pivot->x)||!std::isfinite(pivot->y)))throw std::invalid_argument("Invalid canvas selection pivot");
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();if(active())throw std::runtime_error("Finish the active edit before resizing the canvas");
 if(std::any_of(timeline_.state().layers.begin(),timeline_.state().layers.end(),[](const auto& l){return l.background.has_value();}))return resizeBackgroundCanvas(width,height,shift.x,shift.y,trimOutside,pivot);
 struct Plan{std::string owner;const timeline::Surface* source;CanvasResizeSurfacePlan geometry;};std::vector<Plan> plans;plans.reserve(timeline_.state().cels.size());
 std::size_t used=adjustmentStorageBudget(timeline_,1);auto reserveBytes=[&](std::uint64_t bytes){if(bytes>adjustmentByteLimit-used)throw std::length_error("Canvas resize exceeds working pixel budget");used+=std::size_t(bytes);};
 if(selection_){if(selection_->mask.size()>adjustmentByteLimit/3)throw std::length_error("Canvas selection exceeds working budget");reserveBytes(3ull*(selection_->mask.size()+std::uint64_t(width)*height)+128);}
 std::size_t clipped=0;
 for(const auto& c:timeline_.state().cels){const auto r=timeline_.resolveSurface(c.id);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface)throw std::invalid_argument("Invalid canvas resize owner");if(r.source->id!=c.id)continue;const auto p=planCanvasResizeSurface(*r.surface,width,height,shift.x,shift.y,trimOutside);if(p.clipped){reserveBytes(std::uint64_t(r.surface->pixels.size())*sizeof(Pixel)+2ull*p.bytes);++clipped;}plans.push_back({c.id,r.surface,p});}
 auto maskBudget=adjustmentByteLimit-used;auto masks=resizedCanvasMasks(timeline_.state(),width,height,shift.x,shift.y,trimOutside,maskBudget);
 Edit edit{{},state_,nextState_};edit.beforeDimensions={{width_,height_}};edit.afterDimensions={{width,height}};edit.pixelSelectionEdit=true;edit.beforePixelsSelection=selection_;edit.surfaceChanges.reserve(clipped);edit.ownerOffsets.reserve(plans.size());
 if(!masks.empty()){edit.beforeMasks=timeline_.state().masks;edit.afterMasks=std::move(masks);}
 std::vector<timeline::Surface> install;install.reserve(clipped);std::vector<timeline::Surface*> installOwners,offsetOwners;installOwners.reserve(clipped);offsetOwners.reserve(plans.size());
 for(const auto& p:plans){const auto& s=*p.source;if(p.geometry.clipped){std::size_t available=p.geometry.bytes;auto after=canvasResizeCroppedSurface(s,p.geometry,available);edit.surfaceChanges.push_back({p.owner,s,std::move(after)});install.push_back(edit.surfaceChanges.back().after);}else if(s.offsetX!=p.geometry.offsetX||s.offsetY!=p.geometry.offsetY){edit.ownerOffsets.push_back({p.owner,s.offsetX,s.offsetY,p.geometry.offsetX,p.geometry.offsetY});}}
 if(selection_){SelectionMask shifted{0,0,width,height,{}};shifted.mask.resize(std::size_t(width)*height);for(int y=0;y<height;++y)for(int x=0;x<width;++x){const auto sx=std::int64_t(x)-shift.x,sy=std::int64_t(y)-shift.y;const bool inside=sx>=std::numeric_limits<int>::min()&&sx<=std::numeric_limits<int>::max()&&sy>=std::numeric_limits<int>::min()&&sy<=std::numeric_limits<int>::max();shifted.mask[std::size_t(y)*width+x]=inside&&selectionContains(selection_,int(sx),int(sy))?1:0;}edit.afterPixelsSelection=trimSelection(std::move(shifted));}
 edit.beforeTrimPivot.emplace(pivot);if(!edit.afterPixelsSelection)pivot.reset();else if(pivot){pivot->x+=shift.x;pivot->y+=shift.y;}edit.afterTrimPivot.emplace(pivot);
 auto selectionAfter=edit.afterPixelsSelection;history_.reserve(position_+1);
 for(const auto& c:edit.surfaceChanges){auto* owner=timeline_.mutableOwnedSurface(c.ownerId);if(!owner)throw std::logic_error("Missing canvas resize owner");installOwners.push_back(owner);}for(const auto& c:edit.ownerOffsets){auto* owner=timeline_.mutableOwnedSurface(c.ownerId);if(!owner)throw std::logic_error("Missing canvas offset owner");offsetOwners.push_back(owner);}
 for(std::size_t i=0;i<install.size();++i)std::swap(*installOwners[i],install[i]);for(std::size_t i=0;i<offsetOwners.size();++i){offsetOwners[i]->offsetX=edit.ownerOffsets[i].afterX;offsetOwners[i]->offsetY=edit.ownerOffsets[i].afterY;}
 if(edit.afterMasks)timeline_.state_.masks=*edit.afterMasks;
 width_=width;height_=height;selection_=std::move(selectionAfter);selectionPivotHistory_.pivot=pivot;++selectionPivotHistory_.serial;change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"画布大小");return true;
}
bool Document::cropCanvasRegion(PixelRegion region,std::optional<TransformPoint> pivot){if(hasTilemapContent()||hasFreeTileContent())return false;return resizeCanvas(region.w,region.h,CanvasAnchor::NorthWest,-region.x,-region.y,true,pivot);}
void Document::applyEdit(const Edit& edit,bool forward){if(edit.beforeSourceProperties){applyFreeTileSourceSnapshot(*(forward?edit.afterSourceProperties:edit.beforeSourceProperties));change_={0,0,width_,height_};return;}const bool freePaintBefore=tileSelection_.freePaint;const bool sourceEdit=edit.freeTileSourceAddition||edit.freeTileSourceDeletion||edit.freeTileSourceReorder;const auto sourceEditLayer=sourceEdit?activeLayerId_:std::string{},sourceEditFrame=sourceEdit?activeFrameId_:std::string{};if(edit.tilemapPixels){applyTilemapPixelHistory(edit,forward);return;}if(edit.beforeTilesetSlots){auto t=std::find_if(timeline_.state_.tilesets.begin(),timeline_.state_.tilesets.end(),[&](const auto& v){return v.id==edit.tilesetSlotsId;});if(t==timeline_.state_.tilesets.end())throw std::logic_error("Missing tileset during slot history");t->tileSlots=forward?*edit.afterTilesetSlots:*edit.beforeTilesetSlots;}if(edit.beforeTileSelection&&!edit.beforeLayerStructure)tileSelection_=forward?*edit.afterTileSelection:*edit.beforeTileSelection;if(edit.beforeMasks){timeline_.state_.masks=forward?*edit.afterMasks:*edit.beforeMasks;if(forward&&edit.maskToActivateOnRedo){activeMaskId_=*edit.maskToActivateOnRedo;maskIsolated_=false;}if(!forward&&edit.maskEditingOnUndo){activeMaskId_=edit.maskEditingOnUndo->first;maskIsolated_=edit.maskEditingOnUndo->second;}if(edit.beforeMaskSelection||edit.maskEditingOnUndo){const auto& frame=forward?edit.afterFrame:edit.beforeFrame;const auto& layer=forward?edit.afterActive:edit.beforeActive;if(timeline_.hasFrame(frame))activeFrameId_=frame;if(timeline_.hasLayer(layer))activeLayerId_=layer;}if(edit.beforeMaskSelection){maskSelectionHistory_.slots=forward?edit.afterMaskSelection.value_or(std::vector<std::pair<std::string,std::string>>{}):*edit.beforeMaskSelection;++maskSelectionHistory_.serial;}if(std::none_of(timeline_.state().masks.begin(),timeline_.state().masks.end(),[&](const auto& m){return m.mask.id==activeMaskId_;})){activeMaskId_.clear();maskIsolated_=false;}}if(edit.beforeRollback)applyRollbackPayload(*(forward?edit.afterRollback:edit.beforeRollback));if(edit.beforeSlices)sliceState_=forward?*edit.afterSlices:*edit.beforeSlices;if(edit.beforeLayerStructure)applyLayerStructure(edit,forward);if(edit.beforeTrimPivot){selectionPivotHistory_.pivot=forward?*edit.afterTrimPivot:*edit.beforeTrimPivot;++selectionPivotHistory_.serial;}if(edit.beforeAnimationLoop)animationLoop_=forward?*edit.afterAnimationLoop:*edit.beforeAnimationLoop;if(edit.beforeTimeline){auto restored=forward?*edit.afterTimeline:*edit.beforeTimeline;if(edit.layerTilesets)restored.tilesets=tilesetsForLayerEdit(edit,forward);timeline_=timeline::Timeline(std::move(restored));activeLayerId_=forward?edit.afterActive:edit.beforeActive;activeFrameId_=forward?edit.afterFrame:edit.beforeFrame;}if(edit.beforeDimensions){const auto dims=forward?*edit.afterDimensions:*edit.beforeDimensions;width_=dims.first;height_=dims.second;if(edit.beforeTimeline)change_={0,0,width_,height_};}if(!edit.children.empty()){if(forward)for(const auto& child:edit.children)applyEdit(child,true);else for(auto it=edit.children.rbegin();it!=edit.children.rend();++it)applyEdit(*it,false);}else{if(!edit.pixels.empty() || !edit.runs.empty() || edit.dense){const auto* target=timeline_.findCelById(edit.targetCelId);selectLayer(target->layerId);selectFrame(target->frameId);}applyPixelEdit(edit,forward);applySurfaceEdit(edit,forward);applyCelPropertiesEdit(edit,forward);applyPaletteEdit(edit,forward);applyLayerEdit(edit,forward);applyFrameEdit(edit,forward);applyCelEdit(edit,forward);}if(!edit.children.empty() && !edit.beforeActive.empty()){selectLayer(forward?edit.afterActive:edit.beforeActive);selectFrame(forward?edit.afterFrame:edit.beforeFrame);}if(edit.pixelSelectionEdit)selection_=forward?edit.afterPixelsSelection:edit.beforePixelsSelection;const auto& selection=forward?edit.afterSelection:edit.beforeSelection;if(selection)selectedFrames_=*selection;const auto& timelineSelection=forward?edit.afterTimelineSelection:edit.beforeTimelineSelection;if(timelineSelection)timelineSelection_=*timelineSelection;const auto& anchor=forward?edit.afterFrameAnchor:edit.beforeFrameAnchor;if(anchor)frameAnchor_=*anchor;if(edit.beforeTimelineSelection && !edit.beforeActive.empty()){activeLayerId_=forward?edit.afterActive:edit.beforeActive;activeFrameId_=forward?edit.afterFrame:edit.beforeFrame;}for(const auto& value:forward?edit.afterLayerOpacityProjection:edit.beforeLayerOpacityProjection){auto it=std::find_if(timeline_.state_.layers.begin(),timeline_.state_.layers.end(),[&](const auto& l){return l.id==value.first;});if(it!=timeline_.state_.layers.end())it->opacity=value.second;}if(edit.maskContext){activeMaskId_=forward?edit.maskContext->after:edit.maskContext->before;maskIsolated_=forward?edit.maskContext->afterIsolated:edit.maskContext->beforeIsolated;}applyGroupUi(edit,forward);if(edit.beforeFreeTileSelection){const auto& ui=forward?*edit.afterFreeTileSelection:*edit.beforeFreeTileSelection;freeInstanceSelected_=ui.selected;freeInstancePrimary_=ui.primary;freeInstanceAnchor_=ui.anchor;freeInstanceSelectionFrame_=ui.frame;freeInstanceViewLayer_=ui.viewLayer;}if(sourceEdit){if(timeline_.hasLayer(sourceEditLayer))activeLayerId_=sourceEditLayer;if(timeline_.hasFrame(sourceEditFrame))activeFrameId_=sourceEditFrame;}if(edit.freeTileSourceDeletion||edit.freeTileSourceReorder)tileSelection_.freePaint=freePaintBefore;if(edit.freeTileSourceAddition||(edit.freeTileSourceDeletion&&forward)){freeInstanceSelected_.clear();freeInstancePrimary_.clear();freeInstanceAnchor_.clear();freeInstanceSelectionFrame_=activeFrameId_;}projectActiveCelOpacities();}
HistoryPanelTimeline Document::historyTimeline()const{HistoryPanelTimeline out;out.position=position_;out.revision=historyRevision_;out.entries.reserve(history_.size());for(std::size_t i=0;i<history_.size();++i)out.entries.push_back({i+1,history_[i].label});return out;}
bool Document::setHistoryPosition(std::size_t target){if(active_)return false;target=std::min(target,history_.size());const auto steps=(position_>target?position_-target:target-position_)+16;for(std::size_t i=0;i<steps&&position_!=target;++i){const auto before=position_;if(position_>target)undo();else redo();if(position_==before&&((position_>target&&!canUndo())||(position_<target&&!canRedo())))break;}return position_==target;}
void Document::undo() {
  cancelGradient();
  if(floating_){if(floating_->restoredFromDeselect)floating_.reset();else{cancelFloatingPaste();return;}}cancelStroke();
  if (!canUndo()) return;
  const auto& edit = history_[position_-1];
  std::optional<FloatingPaste> restored;if(edit.restoredClipboard)restored=*edit.restoredClipboard;
  change_={};applyEdit(edit,false);--position_;++historyRevision_;
  if(restored)floating_=std::move(restored);
  publishChange();historyBytes_-=edit.bytes();
  state_ = edit.beforeState;if(edit.documentChanged){modified_=true;projectInformation_.operation();}++revision_;if(edit.documentChanged)notifyRecording(true);
}
void Document::redo() {
  cancelGradient();
  commitFloatingPaste();cancelStroke();
  if (!canRedo()) return;
  const auto& edit = history_[position_];
  change_={};applyEdit(edit,true);++position_;++historyRevision_;
  publishChange();historyBytes_+=edit.bytes();
  state_ = edit.afterState;if(edit.documentChanged){modified_=true;projectInformation_.operation();}++revision_;if(edit.documentChanged)notifyRecording(true);
}
PaletteState Document::capturePaletteEdit(int kind,int id) const {
  if(kind==1) return palette_;
  PaletteState state;state.columns=palette_.columns;state.entries.clear();state.slots.clear();
  state.primary=palette_.primary;state.secondary=palette_.secondary;
  if(kind==2) {state.slots=palette_.slots;state.selected=palette_.selected;state.primaryId=palette_.primaryId;}
  else if(const auto entry=paletteEntry(id)) state.entries.push_back(*entry);
  return state;
}
std::size_t Document::Edit::bytes() const {
 if(beforeSourceProperties){std::size_t bytes=256;for(const auto* value:{beforeSourceProperties.get(),afterSourceProperties.get()})bytes+=value->source.name.size()+value->source.description.size()+value->source.preservedJson.size()+value->tilesetName.size()*sizeof(char32_t);return bytes;}
 if(beforeRollback)return rollbackBytes;if(beforeSlices)return (beforeSlices->items.size()+afterSlices->items.size())*48;
 if(celProperties)return celProperties->historyBytes();if(layerMetadataBytes)return *layerMetadataBytes;
  if(paletteKind==10)return (beforePalette->entries.size()+afterPalette->entries.size())*40+(beforePalette->slots.size()+afterPalette->slots.size())*4;
  if(paletteKind==9)return (beforePalette->slots.size()+afterPalette->slots.size())*sizeof(int);
  std::size_t textBytes=0;for(const auto& t:textChanges)for(const auto* value:{&t.before,&t.after})if(*value)textBytes+=sizeof(TextCelData)+(*value)->text.size()*2+(*value)->styleRuns.size()*sizeof(TextStyleRun)+(*value)->transforms.size()*sizeof(TextTransform);
    std::size_t size=(layerTilesets?layerTilesets->bytes():0)+(tilemapPixels?tilemapPixels->bytes():0)+textBytes+restoredClipboardBytes+(pixelAddress?sizeof(PixelAddressSpace):0)+(beforeName?beforeName->size()*sizeof(char32_t):0)+(afterName?afterName->size()*sizeof(char32_t):0)+pixels.size()*sizeof(Delta)+runs.size()*sizeof(PixelRun)+targetCelId.size()+((beforeVisible||beforeOpacity||beforeBlendMode)?32:0);
  for(const auto* selection:{&beforeMaskSelection,&afterMaskSelection})if(*selection)for(const auto& key:**selection)size+=sizeof(key)+key.first.size()+key.second.size();
  if(maskEditingOnUndo)size+=sizeof(*maskEditingOnUndo)+maskEditingOnUndo->first.size();
  for(const auto* masks:{&beforeMasks,&afterMasks})if(*masks)for(const auto& m:**masks)size+=sizeof(m)+m.mask.surface.pixels.size()*4;
  for(const auto* t:{&beforeTimeline,&afterTimeline})if(*t)for(const auto& m:(*t)->masks)size+=sizeof(m)+m.mask.surface.pixels.size()*4;
  for(const auto* t:{&beforeTimeline,&afterTimeline})if(*t){for(const auto& c:(*t)->cels){size+=128+(c.surface?c.surface->pixels.size()*sizeof(Pixel):0);if(c.tilemap)for(const auto& v:c.tilemap->cells)size+=sizeof(v)+(v?v->tilesetId.size()+v->tileId.size():0);}for(const auto& set:(*t)->tilesets){size+=sizeof(set)+set.pixels.size()*sizeof(Pixel);for(const auto& id:set.tileIds)size+=sizeof(id)+id.size();for(const auto& slot:set.tileSlots)size+=sizeof(slot)+(slot?slot->size():0);}}
  if(dense)size+=(dense->before.size()+dense->after.size())*sizeof(Pixel);
  for(const auto* snapshot:{&beforePalette,&afterPalette}) if(*snapshot) {
    size+=sizeof(PaletteState)+(*snapshot)->slots.size()*sizeof(int)+(*snapshot)->selected.size()*sizeof(int);
    for(const auto& entry:(*snapshot)->entries) size+=sizeof(PaletteEntry)+entry.name.size()*sizeof(char32_t);
  }
  size+=(beforeOrder.size()+afterOrder.size())*64;
  if(detachedCel && detachedCel->surface) size+=detachedCel->surface->pixels.size()*sizeof(Pixel);
  for(const auto& c:detachedCels)if(c.surface)size+=c.surface->pixels.size()*sizeof(Pixel);
  for(const auto* cels:{&beforeCels,&afterCels})for(const auto& c:*cels)size+=128+(c.surface?c.surface->pixels.size()*sizeof(Pixel):0);
  for(const auto* selection:{&beforePixelsSelection,&afterPixelsSelection})if(*selection)size+=48+(*selection)->mask.size();
  for(const auto* selection:{&beforeTimelineSelection,&afterTimelineSelection})if(*selection){for(const auto& id:(*selection)->layers)size+=id.size()+32;for(const auto& id:(*selection)->cels)size+=id.size()+32;}
  for(const auto& c:ownerOffsets)size+=sizeof(OwnerOffsetChange)+c.ownerId.size();
  if(maskContext)size+=sizeof(Edit::MaskContextHistory)+maskContext->before.size()+maskContext->after.size();
  for(const auto& change:surfaceChanges)size+=sizeof(SurfaceChange)+change.ownerId.size()+(change.before.pixels.size()+change.after.pixels.size())*sizeof(Pixel);
  for(const auto& child:children)size+=child.bytes();
  for(const auto* loops:{&beforeLoops,&afterLoops})if(*loops)size+=(*loops)->size()*256;
  size+=(beforeFrames.size()+afterFrames.size()+beforeDisabled.size()+afterDisabled.size()+detachedFrames.size())*64;
  size+=(beforeLayerOpacityProjection.size()+afterLayerOpacityProjection.size())*80;
 for(const auto* snapshot:{&beforeLayerStructure,&afterLayerStructure})if(*snapshot){
  if((*snapshot)->frames)for(const auto& f:*(*snapshot)->frames)size+=sizeof(f)+f.id.size();
  for(const auto& value:(*snapshot)->celOpacities)size+=sizeof(value)+value.first.size();
  for(const auto& mask:(*snapshot)->masks)size+=sizeof(mask)+mask.mask.surface.pixels.size()*sizeof(Pixel);
  for(const auto& l:(*snapshot)->layers)size+=sizeof(l)+l.id.size()+l.name.size()*sizeof(char32_t)+l.blendMode.size()+l.description.size()*sizeof(char32_t)+(l.groupId?l.groupId->size():0)+(l.adjustment?l.adjustment->gradientMap.stops.size()*sizeof(GradientStop):0)+(l.layerStyles?l.layerStyles->preservedJson.size()+l.layerStyles->gradientMap.stops.size()*sizeof(GradientStop):0);
  for(const auto& g:(*snapshot)->groups)size+=sizeof(g)+g.id.size()+g.name.size()*sizeof(char32_t)+g.blendMode.size()+g.description.size()*sizeof(char32_t)+(g.parentGroupId?g.parentGroupId->size():0)+(g.layerStyles?g.layerStyles->preservedJson.size()+g.layerStyles->gradientMap.stops.size()*sizeof(GradientStop):0);
 }
 for(const auto* snapshot:{&beforeGroupUi,&afterGroupUi})if(*snapshot){for(const auto& id:(*snapshot)->selected)size+=id.size()+sizeof(std::string);for(const auto& id:(*snapshot)->collapsed)size+=id.size()+sizeof(std::string);if((*snapshot)->focus)size+=(*snapshot)->focus->size();}
for(const auto* slots:{&beforeTilesetSlots,&afterTilesetSlots})if(*slots)for(const auto& id:**slots)size+=sizeof(id)+(id?id->size():0);size+=tilesetSlotsId.size();size+=structureCelBytes;return size;
}
// Legacy HistoryStack.setMaxEntries: discard oldest undo entries first,
// then farthest redo entries. Never change document pixels, dirty or revision.
void Document::setHistoryEntryLimit(std::size_t limit) {
  const auto previous=history_.size();maxEntries_=std::max<std::size_t>(1,limit);
  while(history_.size()>maxEntries_ && position_>0){historyBytes_-=history_.front().bytes();history_.erase(history_.begin());--position_;}
  while(history_.size()>maxEntries_){historyBytes_-=history_.back().bytes();history_.pop_back();}
  if(previous!=history_.size())++historyRevision_;
}
void Document::pushEdit(Edit edit,std::u32string label) {
 if(edit.beforeMasks){auto& masks=timeline_.state_.masks;std::set<std::string> wanted;for(const auto& m:masks){bool owner=m.group?std::any_of(timeline_.state().groups.begin(),timeline_.state().groups.end(),[&](const auto& g){return g.id==m.ownerId;}):timeline_.hasLayer(m.ownerId);if(owner&&timeline_.hasFrame(m.frameId))wanted.insert(m.mask.id);}for(auto& m:masks)if(wanted.count(m.mask.id)&&!m.mask.linkedMaskId.empty()&&!wanted.count(m.mask.linkedMaskId)){const auto* root=timeline::resolvedMask(timeline_.state(),m.ownerId,m.frameId);m.mask.surface=root->surface;m.mask.linkedMaskId.clear();}masks.erase(std::remove_if(masks.begin(),masks.end(),[&](const auto& m){return !wanted.count(m.mask.id);}),masks.end());edit.afterMasks=masks;}

  edit.label=historyLabelOverride_.empty()?std::move(label):historyLabelOverride_;if(edit.label.empty())edit.label=U"修改图层属性";++historyRevision_;
  capturePixelAddresses(edit);
  history_.reserve(position_+1);history_.resize(position_);
  historyBytes_+=edit.bytes();history_.push_back(std::move(edit));++position_;if(history_.back().documentChanged){if(groupingHistory_)pendingGroupedProjectOperation_=true;else projectInformation_.operation();}if(history_.back().documentChanged){state_=nextState_++;modified_=true;}++revision_;
  while(!groupingHistory_ && ((historyBytes_>maxBytes_ && position_>1) || history_.size()>maxEntries_)) {
    historyBytes_-=history_.front().bytes();history_.erase(history_.begin());--position_;
  }
  if(!groupingHistory_&&history_.back().documentChanged)notifyRecording();
}
const PaletteEntry* Document::paletteEntry(int id) const {
  for(const auto& entry:palette_.entries) if(entry.id==id) return &entry;
  return nullptr;
}
void Document::selectPaletteIds(const std::vector<int>& ids,int primary) {
  palette_.selected.clear();const auto order=palette_.order();
  for(int id:ids) if(std::find(order.begin(),order.end(),id)!=order.end() &&
    std::find(palette_.selected.begin(),palette_.selected.end(),id)==palette_.selected.end()) palette_.selected.push_back(id);
  palette_.primaryId=std::find(palette_.selected.begin(),palette_.selected.end(),primary)!=palette_.selected.end()?primary:
    palette_.selected.empty()?0:palette_.selected.back();
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
 if(columns<1 || target<0)return slots;
 std::vector<int> sources;for(int i=0;i<int(slots.size());++i)if(slots[i] && std::find(ids.begin(),ids.end(),slots[i])!=ids.end())sources.push_back(i);
 if(sources.empty())return slots;int a=sources.front(),minX=columns,maxX=0,minY=int(slots.size());
 for(int i:sources){if(slots[i]==anchor)a=i;minX=std::min(minX,i%columns);maxX=std::max(maxX,i%columns);minY=std::min(minY,i/columns);}
 const int dx=std::clamp(target%columns-a%columns,-minX,columns-1-maxX),dy=std::max(-minY,target/columns-a/columns);
 std::vector<int> destinations;auto next=slots;for(int i:sources)destinations.push_back((i/columns+dy)*columns+i%columns+dx);
 const int required=*std::max_element(destinations.begin(),destinations.end())+1;next.resize(std::max(int(next.size()),((required+columns-1)/columns)*columns),0);
 for(int i:sources)next[i]=0;std::vector<int> displaced;
 for(std::size_t i=0;i<sources.size();++i){const int dest=destinations[i];if(next[dest])displaced.push_back(next[dest]);next[dest]=slots[sources[i]];}
 for(int id:displaced){int dest=-1;for(int i:sources)if(!next[i] && std::find(destinations.begin(),destinations.end(),i)==destinations.end()){dest=i;break;}
  if(dest<0){auto it=std::find(next.begin(),next.end(),0);dest=int(it-next.begin());if(it==next.end())next.resize(next.size()+columns,0);}next[dest]=id;}
 return next;
}
void Document::repositionPaletteColors(const std::vector<int>& slots,const std::vector<int>& ids,int target,int anchor,int columns,bool storeColumns){
 auto next=movedPaletteSlots(slots,ids,target,anchor,columns);if(next==palette_.slots&&(!storeColumns||palette_.columns==columns))return;cancelStroke();Edit edit{{},state_,nextState_};edit.paletteKind=9;edit.beforePalette=PaletteState{};edit.afterPalette=PaletteState{};edit.beforePalette->entries.clear();edit.afterPalette->entries.clear();edit.beforePalette->slots=palette_.slots;edit.beforePalette->columns=palette_.columns;edit.afterPalette->slots=next;edit.afterPalette->columns=storeColumns?columns:palette_.columns;palette_.columns=edit.afterPalette->columns;palette_.slots=std::move(next);pushEdit(std::move(edit),U"调整颜色板顺序");
}
// legacy workspace-palette::pastePaletteColors: overwrite selected slots, otherwise append.
void Document::pastePaletteColors(const std::vector<Pixel>& colors,const std::vector<std::size_t>& targets,bool selectResult,const std::vector<int>* viewSlots,int viewColumns){
 if(colors.empty())return;cancelStroke();Edit edit{{},state_,nextState_};edit.paletteKind=7;edit.beforePalette=palette_;if(viewSlots)palette_.slots=*viewSlots;if(viewColumns>0)palette_.columns=std::clamp(viewColumns,1,256);std::vector<int> ids;
 const auto count=targets.empty()?colors.size():std::min(colors.size(),targets.size());
 for(std::size_t i=0;i<count;++i){auto slot=targets.empty()?std::size_t(std::find(palette_.slots.begin(),palette_.slots.end(),0)-palette_.slots.begin()):targets[i];
  if(slot>=65536)continue;if(slot>=palette_.slots.size())palette_.slots.resize(slot+1,0);int id=palette_.slots[slot];
  if(id){for(auto& entry:palette_.entries)if(entry.id==id)entry.color=colors[i];}
  else{id=palette_.nextId++;const auto number=std::to_string(id);palette_.entries.push_back({id,U"颜色 "+std::u32string(number.begin(),number.end()),colors[i]});palette_.slots[slot]=id;}ids.push_back(id);
 }
 if(selectResult)selectPaletteIds(ids,ids.empty()?0:ids.back());const auto& before=*edit.beforePalette;if(before.columns==palette_.columns && before.slots==palette_.slots && before.entries.size()==palette_.entries.size() && std::equal(before.entries.begin(),before.entries.end(),palette_.entries.begin(),[](const auto& a,const auto& b){return a.id==b.id&&a.name==b.name&&a.color==b.color;}))return;edit.afterPalette=palette_;pushEdit(std::move(edit),U"调整颜色板颜色");
}

int Document::addPaletteColor(Pixel color,bool selectAdded,std::optional<std::size_t> targetSlot,const std::vector<int>* viewSlots,int viewColumns) {
  if(!viewSlots && targetSlot && (*targetSlot>=palette_.slots.size() || palette_.slots[*targetSlot]))
    throw std::invalid_argument("Palette target must be an existing empty slot");
  cancelStroke();Edit edit{{},state_,nextState_};edit.beforePalette=palette_;edit.paletteKind=1;if(viewSlots){palette_.slots=*viewSlots;if(targetSlot&&*targetSlot>=palette_.slots.size())palette_.slots.resize(*targetSlot+1,0);if(viewColumns>0)palette_.columns=std::clamp(viewColumns,1,256);}
  const int id=palette_.nextId++;const auto name=std::to_string(id);
  palette_.entries.push_back({id,U"颜色 "+std::u32string(name.begin(),name.end()),color});
  auto slot=targetSlot?palette_.slots.begin()+*targetSlot:std::find(palette_.slots.begin(),palette_.slots.end(),0);
  if(slot==palette_.slots.end()) {const auto n=palette_.slots.size();palette_.slots.resize(n+8);palette_.slots[n]=id;} else *slot=id;
  palette_.selected=selectAdded?std::vector<int>{id}:std::vector<int>{};palette_.primaryId=selectAdded?id:0;
  edit.afterPalette=capturePaletteEdit(edit.paletteKind,edit.colorId);pushEdit(std::move(edit),U"调整颜色板颜色");return id;
}
void Document::deletePaletteColors(const std::vector<int>& ids) {
  cancelStroke();Edit edit{{},state_,nextState_};edit.beforePalette=capturePaletteEdit(2);edit.paletteKind=2;bool changed=false;
  for(auto& slot:palette_.slots) if(slot && std::find(ids.begin(),ids.end(),slot)!=ids.end()) {slot=0;changed=true;}
  if(!changed) return;
  auto& selected=palette_.selected;selected.erase(std::remove_if(selected.begin(),selected.end(),[&](int id){return std::find(ids.begin(),ids.end(),id)!=ids.end();}),selected.end());
  if(std::find(selected.begin(),selected.end(),palette_.primaryId)==selected.end()) palette_.primaryId=selected.empty()?0:selected.back();
  edit.afterPalette=capturePaletteEdit(edit.paletteKind,edit.colorId);pushEdit(std::move(edit),U"从颜色板移除颜色");
}
void Document::updatePaletteColor(int id,Pixel color) {
  if((hasTilemapContent()||hasFreeTileContent())&&paletteColorSynchronization_)return;
  const auto current=paletteEntry(id);if(!current || current->color==color) return;
  if(paletteColorSynchronization_){
    // legacy workspace-commands-color: document frames x bottom-to-top layers,
    // owner dedup BEFORE lock filtering, hidden layers included, no selection clip.
    const Pixel source=current->color;Edit compound{{},state_,nextState_};compound.beforeActive=compound.afterActive=layer().id;compound.beforeFrame=compound.afterFrame=frame().id;compound.beforeSelection=compound.afterSelection=selectedFrames_;
    Edit paletteEdit{{},state_,nextState_};paletteEdit.paletteKind=3;paletteEdit.colorId=id;paletteEdit.beforePalette=capturePaletteEdit(3,id);paletteEdit.afterPalette=*paletteEdit.beforePalette;for(auto& entry:paletteEdit.afterPalette->entries)if(entry.id==id)entry.color=color;if(paletteEdit.afterPalette->primary==source)paletteEdit.afterPalette->primary=color;if(paletteEdit.afterPalette->secondary==source)paletteEdit.afterPalette->secondary=color;compound.children.push_back(std::move(paletteEdit));
    std::set<std::string> seen;for(const auto& f:timeline_.state().frames)for(auto l=timeline_.state().layers.rbegin();l!=timeline_.state().layers.rend();++l){const auto* c=timeline_.findCel(l->id,f.id);if(!c)continue;const auto resolved=timeline_.resolveSurface(c->id);if(!resolved.source || !resolved.surface || !seen.insert(timeline_.linkedStorageKey(resolved.source->id)).second || layerEffectivelyLocked(*l))continue;Edit child{{},state_,nextState_};child.targetCelId=resolved.source->id;child.pixelAddress=PixelAddressSpace{resolved.surface->width,resolved.surface->height,resolved.surface->storageOriginX.value_or(0),resolved.surface->storageOriginY.value_or(0)};const auto& pixels=resolved.surface->pixels;for(std::size_t i=0;i<pixels.size();++i)if(pixels[i]==source){if(!child.runs.empty() && child.runs.back().index+child.runs.back().length==i)++child.runs.back().length;else child.runs.push_back({i,1,source,color});}if(!child.runs.empty())compound.children.push_back(std::move(child));}
    auto gradientPreview=std::move(gradient_);cancelStroke();gradient_=std::move(gradientPreview);history_.reserve(position_+1);change_={};applyEdit(compound,true);publishChange();pushEdit(std::move(compound),U"调整颜色板颜色");return;
  }
  auto gradientPreview=std::move(gradient_);cancelStroke();gradient_=std::move(gradientPreview);Edit edit{{},state_,nextState_};edit.beforePalette=capturePaletteEdit(3,id);edit.paletteKind=3;edit.colorId=id;
  const auto before=current->color;
  for(auto& entry:palette_.entries) if(entry.id==id) entry.color=color;
  if(palette_.primary==before) palette_.primary=color;if(palette_.secondary==before) palette_.secondary=color;
  edit.afterPalette=capturePaletteEdit(edit.paletteKind,edit.colorId);pushEdit(std::move(edit),U"调整颜色板颜色");
}
// Exact legacy core/palette.ts comparators; stable full paletteOrder slot sorting.
bool Document::sortPaletteColors(PaletteSortMode mode,bool descending){
 struct Values{double hue,brightness,luminance,saturation;bool achromatic;};
 const auto values=[](Pixel c){double r=(c&255)/255.0,g=((c>>8)&255)/255.0,b=((c>>16)&255)/255.0,maximum=std::max({r,g,b}),minimum=std::min({r,g,b}),range=maximum-minimum,h=0;if(range>0){if(maximum==r)h=((g-b)/range+(g<b?6:0))*60;else if(maximum==g)h=((b-r)/range+2)*60;else h=((r-g)/range+4)*60;}auto linear=[](double v){return v<=0.04045?v/12.92:std::pow((v+0.055)/1.055,2.4);};return Values{h,maximum,.2126*linear(r)+.7152*linear(g)+.0722*linear(b),maximum==0?0:range/maximum,range<=8/255.0};};
 const auto hue=[&](Pixel a,Pixel b){const auto x=values(a),y=values(b);if(x.achromatic!=y.achromatic)return x.achromatic?-1.0:1.0;double d=x.achromatic?x.brightness-y.brightness:x.hue-y.hue;if(!d && !x.achromatic)d=x.brightness-y.brightness;if(!d && !x.achromatic)d=y.saturation-x.saturation;if(!d)d=double(b>>24)-double(a>>24);return d?d:double(a)-double(b);};
 std::unordered_map<int,Pixel> colors;for(const auto& e:palette_.entries)colors.emplace(e.id,e.color);auto ids=palette_.order();ids.erase(std::remove_if(ids.begin(),ids.end(),[&](int id){return !colors.count(id);}),ids.end());
 std::stable_sort(ids.begin(),ids.end(),[&](int left,int right){Pixel a=colors.at(left),b=colors.at(right);auto x=values(a),y=values(b);double d=0;
 switch(mode){case PaletteSortMode::Saturation:d=x.saturation-y.saturation;if(!d)d=x.brightness-y.brightness;break;case PaletteSortMode::Brightness:d=x.brightness-y.brightness;if(!d)d=x.saturation-y.saturation;break;case PaletteSortMode::Luminance:d=x.luminance-y.luminance;if(!d)d=x.brightness-y.brightness;break;case PaletteSortMode::Red:case PaletteSortMode::Green:case PaletteSortMode::Blue:{int first=mode==PaletteSortMode::Red?0:mode==PaletteSortMode::Green?8:16;for(int shift:{first,0,8,16,24}){d=double((a>>shift)&255)-double((b>>shift)&255);if(d)break;}break;}case PaletteSortMode::Alpha:d=double(a>>24)-double(b>>24);break;default:break;}
 if(!d)d=hue(a,b);return descending?d>0:d<0;});
 ids.resize(std::max(ids.size(),palette_.slots.size()),0);if(ids==palette_.slots)return false;cancelStroke();Edit e{{},state_,nextState_};e.paletteKind=9;e.beforePalette=PaletteState{};e.afterPalette=PaletteState{};e.beforePalette->entries.clear();e.afterPalette->entries.clear();e.beforePalette->slots=palette_.slots;e.afterPalette->slots=ids;palette_.slots=std::move(ids);pushEdit(std::move(e),U"排序颜色板颜色");return true;
}
// legacy paletteGradient/raster HSV and workspace-palette gradientPaletteSlots.
void Document::gradientPaletteSlots(std::vector<std::size_t> indices,int columns,bool byHue,const std::vector<int>* viewSlots){
 indices.erase(std::remove_if(indices.begin(),indices.end(),[](auto i){return i>=65536;}),indices.end());std::sort(indices.begin(),indices.end());indices.erase(std::unique(indices.begin(),indices.end()),indices.end());if(indices.size()<2)return;columns=std::clamp(columns,1,64);
 auto next=palette_;if(viewSlots){next.slots=*viewSlots;next.columns=columns;}const auto required=indices.back()+1;while(next.slots.size()<required)next.slots.resize(next.slots.size()+columns,0);std::unordered_map<int,std::size_t> positions;for(std::size_t i=0;i<next.entries.size();++i)positions.emplace(next.entries[i].id,i);
 auto endpoint=[&](std::size_t slot,Pixel fallback){auto found=positions.find(next.slots[slot]);return found==positions.end()?fallback:next.entries[found->second].color;};const auto start=endpoint(indices.front(),palette_.primary),end=endpoint(indices.back(),palette_.secondary);
 struct Hsv{double h,s,v;};auto hsv=[](Pixel c){double r=(c&255)/255.0,g=((c>>8)&255)/255.0,b=((c>>16)&255)/255.0,max=std::max({r,g,b}),min=std::min({r,g,b}),d=max-min,h=0;if(d>0){if(max==r)h=60*std::fmod((g-b)/d,6);else if(max==g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4);}if(h<0)h+=360;return Hsv{h,max==0?0:d/max,max};};const auto a=hsv(start),b=hsv(end);double hueDelta=b.h-a.h;if(hueDelta>180)hueDelta-=360;else if(hueDelta< -180)hueDelta+=360;
 auto byte=[](double v){return Pixel(std::clamp(std::floor(v+.5),0.0,255.0));};for(std::size_t i=0;i<indices.size();++i){const double t=double(i)/(indices.size()-1);Pixel color=0;if(byHue){double h=std::fmod(std::fmod(a.h+hueDelta*t,360)+360,360),s=a.s+(b.s-a.s)*t,v=a.v+(b.v-a.v)*t,c=v*s,x=c*(1-std::abs(std::fmod(h/60,2)-1)),m=v-c;double r=0,g=0,bl=0;switch(int(std::floor(h/60))){case 0:r=c;g=x;break;case 1:r=x;g=c;break;case 2:g=c;bl=x;break;case 3:g=x;bl=c;break;case 4:r=x;bl=c;break;default:r=c;bl=x;}color=byte((r+m)*255)|(byte((g+m)*255)<<8)|(byte((bl+m)*255)<<16)|(byte(double(start>>24)+(double(end>>24)-double(start>>24))*t)<<24);}else for(int shift:{0,8,16,24})color|=byte(double((start>>shift)&255)+(double((end>>shift)&255)-double((start>>shift)&255))*t)<<shift;
 const auto slot=indices[i];auto found=positions.find(next.slots[slot]);if(found!=positions.end())next.entries[found->second].color=color;else{const int id=next.nextId++;const auto number=std::to_string(id);positions.emplace(id,next.entries.size());next.entries.push_back({id,U"颜色 "+std::u32string(number.begin(),number.end()),color});next.slots[slot]=id;}}
 cancelStroke();Edit e{{},state_,nextState_};e.paletteKind=10;e.beforePalette=palette_;e.afterPalette=next;history_.reserve(position_+1);palette_=std::move(next);pushEdit(std::move(e),U"生成颜色板渐变");
}
// legacy workspace-palette.ts paletteOperationIds/applyPaletteColors/reversePaletteColors.
bool Document::reversePaletteColors(){
 const auto order=palette_.order();const std::set<int> selected(palette_.selected.begin(),palette_.selected.end());std::unordered_map<int,std::size_t> positions;positions.reserve(palette_.entries.size());for(std::size_t i=0;i<palette_.entries.size();++i)positions.emplace(palette_.entries[i].id,i);std::vector<int> ids;for(int id:order)if(selected.count(id))ids.push_back(id);if(ids.size()<2)ids=order;
 std::vector<Pixel> colors;colors.reserve(ids.size());for(int id:ids)colors.push_back(palette_.entries[positions.at(id)].color);Edit edit{{},state_,nextState_};edit.paletteKind=8;edit.beforePalette=PaletteState{};edit.afterPalette=PaletteState{};edit.beforePalette->entries.clear();edit.beforePalette->slots.clear();edit.afterPalette->entries.clear();edit.afterPalette->slots.clear();
 for(std::size_t i=0;i<ids.size();++i){const auto before=colors[i],after=colors[ids.size()-1-i];if(before!=after){edit.beforePalette->entries.push_back({ids[i],U"",before});edit.afterPalette->entries.push_back({ids[i],U"",after});}}
 if(edit.beforePalette->entries.empty())return false;cancelStroke();history_.reserve(position_+1);for(const auto& source:edit.afterPalette->entries)palette_.entries[positions.at(source.id)].color=source.color;pushEdit(std::move(edit),U"反向颜色板颜色");return true;
}
void Document::setPaletteRole(Pixel color,bool secondary,bool locked) {
  const int id=secondary?palette_.secondaryId:palette_.primaryId;
  const Pixel previous=secondary?palette_.secondary:palette_.primary;
  const auto entry=paletteEntry(id);
  if(!locked && entry && entry->color==previous) updatePaletteColor(id,color);
  (secondary?palette_.secondary:palette_.primary)=color;
  if(!locked) return;
  int matching=entry && entry->color==color?id:0;
  if(!matching) for(int candidate:palette_.order()) if(paletteEntry(candidate)->color==color) {matching=candidate;break;}
  if(secondary) palette_.secondaryId=matching;
  else {palette_.primaryId=matching;if(!matching) palette_.selected.clear();
    else if(std::find(palette_.selected.begin(),palette_.selected.end(),matching)==palette_.selected.end()) palette_.selected={matching};}
}
void Document::renamePaletteColor(int id,const std::u32string& name) {
  const auto entry=paletteEntry(id);if(!entry) return;
  const std::u32string next(javascriptTrim(name));
  if(entry->name==next) return;
  cancelStroke();Edit edit{{},state_,nextState_};edit.beforePalette=capturePaletteEdit(4,id);edit.paletteKind=4;edit.colorId=id;
  for(auto& candidate:palette_.entries) if(candidate.id==id) candidate.name=next;
  edit.afterPalette=capturePaletteEdit(edit.paletteKind,edit.colorId);pushEdit(std::move(edit),U"调整颜色板颜色");
}
// legacy workspace-palette.ts applyPalette: reuse each RGBA entry once; retain hidden IDs.
void Document::applyStoredPalette(const std::vector<Pixel>& colors,int columns,const std::vector<std::optional<std::size_t>>& slots,const std::vector<std::u32string>* names){
 auto next=palette_;std::vector<int> ids;std::unordered_set<int> used;
 for(std::size_t i=0;i<colors.size();++i){int id=0;for(auto& e:next.entries)if(e.color==colors[i]&&!used.count(e.id)){id=e.id;break;}if(!id){id=next.nextId++;const auto number=std::to_string(id);next.entries.push_back({id,U"颜色 "+std::u32string(number.begin(),number.end()),colors[i]});}used.insert(id);ids.push_back(id);if(names&&i<names->size())for(auto& e:next.entries)if(e.id==id)e.name=(*names)[i];}
 next.columns=columns?std::clamp(columns,1,256):palette_.columns;
 if(columns){next.slots.clear();for(auto cell:slots)next.slots.push_back(cell&&*cell<ids.size()?ids[*cell]:0);}else{next.slots=ids;while(next.slots.size()%next.columns)next.slots.push_back(0);}
 bool same=next.columns==palette_.columns&&next.slots==palette_.slots;for(auto& e:palette_.entries){auto it=std::find_if(next.entries.begin(),next.entries.end(),[&](auto& n){return e.id==n.id;});same=same&&it!=next.entries.end()&&it->name==e.name;}if(same)return;
 next.selected.clear();next.primaryId=0;for(int id:next.order()){auto e=std::find_if(next.entries.begin(),next.entries.end(),[&](auto& e){return e.id==id;});if(e->color==next.primary){next.primaryId=id;next.selected={id};break;}}
 cancelStroke();Edit edit{{},state_,nextState_};edit.paletteKind=11;edit.beforePalette=palette_;edit.afterPalette=next;palette_=std::move(next);pushEdit(std::move(edit),U"切换颜色板");
}
void Document::applyExtractedPalette(const std::vector<Pixel>& colors,bool append,int columns){
 if(colors.empty())return;
 cancelStroke();auto wanted=colors;if(append){std::vector<Pixel> current;for(int id:palette_.order())current.push_back(paletteEntry(id)->color);wanted=mergeExtractedPalette(current,colors);}
 auto next=palette_;std::vector<int> ids;std::unordered_set<int> used;
 for(auto color:wanted){int id=0;for(const auto& entry:next.entries)if(entry.color==color && !used.count(entry.id)){id=entry.id;break;}if(!id){id=next.nextId++;const auto number=std::to_string(id);next.entries.push_back({id,U"颜色 "+std::u32string(number.begin(),number.end()),color});}used.insert(id);ids.push_back(id);}
 columns=std::clamp(columns,1,64);next.slots.assign(std::max(columns,int((ids.size()+columns-1)/columns)*columns),0);std::copy(ids.begin(),ids.end(),next.slots.begin());
 if(next.slots==palette_.slots)return;
 next.selected.clear();next.primaryId=0;for(int id:ids)for(const auto& entry:next.entries)if(entry.id==id && entry.color==next.primary){next.primaryId=id;next.selected={id};break;}
 Edit edit{{},state_,nextState_};edit.paletteKind=5;edit.beforePalette=palette_;edit.afterPalette=next;
 palette_=std::move(next);pushEdit(std::move(edit),U"切换颜色板");
}
void Document::annotatePaletteView(PaletteViewSelection before,PaletteViewSelection after){if(!position_)return;auto& edit=history_[position_-1];if(!edit.beforePalette)return;edit.beforePaletteView=std::move(before);edit.afterPaletteView=after;paletteViewRestore_=std::move(after);++paletteViewRestoreSerial_;}
void Document::applyPaletteEdit(const Edit& edit,bool redo) {
  if(!edit.beforePalette) return;
  const auto& state=redo?*edit.afterPalette:*edit.beforePalette;
  const auto& view=redo?edit.afterPaletteView:edit.beforePaletteView;if(view){paletteViewRestore_=view;++paletteViewRestoreSerial_;}
  if(edit.paletteKind==11){palette_.slots=state.slots;palette_.columns=state.columns;palette_.selected=state.selected;palette_.primaryId=state.primaryId;for(auto& e:palette_.entries)for(auto& n:state.entries)if(e.id==n.id)e.name=n.name;return;}
  if(edit.paletteKind==10){palette_.entries=state.entries;palette_.slots=state.slots;palette_.columns=state.columns;palette_.nextId=state.nextId;return;}
  if(edit.paletteKind==9){palette_.slots=state.slots;palette_.columns=state.columns;return;}
  if(edit.paletteKind==8){std::unordered_map<int,Pixel> colors;colors.reserve(state.entries.size());for(const auto& source:state.entries)colors.emplace(source.id,source.color);for(auto& entry:palette_.entries)if(auto found=colors.find(entry.id);found!=colors.end())entry.color=found->second;return;}
  if(edit.paletteKind==7){const auto secondary=palette_.secondary;const int secondaryId=palette_.secondaryId;palette_=state;palette_.secondary=secondary;palette_.secondaryId=secondaryId;return;}
  if(edit.paletteKind==6){palette_.entries=state.entries;palette_.nextId=state.nextId;palette_.primary=state.primary;palette_.secondary=state.secondary;return;}
  if(edit.paletteKind==5){palette_.slots=state.slots;palette_.selected=state.selected;palette_.primaryId=state.primaryId;return;}
  if(edit.paletteKind==4) {
    for(auto& entry:palette_.entries) if(entry.id==edit.colorId)
      for(const auto& source:state.entries) if(source.id==entry.id) entry.name=source.name;
    return;
  }
  if(edit.paletteKind==3) {
    Pixel before=0,after=0;
    for(const auto& entry:edit.beforePalette->entries) if(entry.id==edit.colorId) before=entry.color;
    for(const auto& entry:state.entries) if(entry.id==edit.colorId) after=entry.color;
    for(auto& entry:palette_.entries) if(entry.id==edit.colorId) entry.color=after;
    if(!redo) {palette_.primary=state.primary;palette_.secondary=state.secondary;}
    else {if(palette_.primary==before) palette_.primary=after;if(palette_.secondary==before) palette_.secondary=after;}
    return;
  }
  palette_.slots=state.slots;palette_.columns=state.columns;palette_.selected=state.selected;palette_.primaryId=state.primaryId;
  if(edit.paletteKind==1) {palette_.entries=state.entries;palette_.nextId=state.nextId;palette_.primary=state.primary;}
}
const PaletteEntry* Document::displayPaletteEntry(int id) const {for(const auto& entry:displayPalette().entries)if(entry.id==id)return &entry;return nullptr;}
bool Document::beginPaletteReplacement(std::optional<Pixel> restorePrimary){if(hasTilemapContent()||hasFreeTileContent())return false;if(!activeMaskId_.empty())return false;
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
 if(!changed){palette_=std::move(after);return false;}Edit edit{{},state_,nextState_};edit.paletteKind=6;edit.beforePalette=std::move(before);edit.afterPalette=after;history_.reserve(position_+1);palette_=std::move(after);change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"替换颜色板颜色");return true;
}
void Document::acceptSaved(std::string projectId,std::shared_ptr<const std::vector<std::uint8_t>> sourceArchive) {
  if(active()) throw std::logic_error("Cannot accept a saved uncommitted preview");
  if(projectId.empty() || !sourceArchive || sourceArchive->empty()) throw std::invalid_argument("Missing saved project identity or archive");
  // Caller must verify the exact current generation has been persisted before
  // accepting a worker result; detached snapshots never mark the live document.
  projectId_=std::move(projectId);sourceArchive_=std::move(sourceArchive);markSaved();
}
void Document::markSaved() {
  if (active()) throw std::logic_error("Cannot mark an uncommitted preview saved");
  modified_ = false;
}
void Document::commitSelection(std::optional<SelectionMask> before,std::optional<SelectionMask> after,bool resetFrames){commitFloatingPaste();selection_=after;if(selectionEqual(before,after))return;Edit e{{},state_,state_};e.documentChanged=false;e.pixelSelectionEdit=true;e.beforePixelsSelection=std::move(before);e.afterPixelsSelection=std::move(after);if(resetFrames)clearFrameSelection();pushEdit(std::move(e),U"创建选区");}
void Document::selectAllPixels(){commitFloatingPaste();selection_=SelectionMask{0,0,width_,height_,{}};}
void Document::selectTimelineCelContent(const std::string& id,bool additive){
 commitFloatingPaste();const auto* target=timeline_.findCelById(id);if(!target)return;const auto before=selection_;const auto incoming=timeline_.contentSelection(id,width_,height_,!active_);
 const auto after=combineSelection(before,incoming,additive?1:0);selectTimelineCel(id);selection_=before;commitSelection(before,after);
}
void Document::deselectPixels(){
 if(floating_&&floating_->restoredFromDeselect){if(canRedo()){floating_.reset();redo();}else floating_.reset();return;}
 std::shared_ptr<FloatingPaste> restored;std::size_t restoredBytes=0;
 if(floating_&&floating_->clipboard&&!floating_->beforeCelTimeline){
  bool changed=floating_->deferred;for(const auto& t:floating_->targets)for(const auto& entry:t.preview)if(entry.second.before!=entry.second.after){changed=true;break;}
  if(changed){std::size_t duplicate=std::uint64_t(floating_->source.pixels.size())*5;if(floating_->beforeSelection)floatingAddBytes(duplicate,floating_->beforeSelection->mask.size());for(const auto& target:floating_->targets){floatingAddBytes(duplicate,std::uint64_t(target.source.pixels.size())*5+std::uint64_t(target.preview.size())*128);if(target.baseline)floatingAddBytes(duplicate,convolutionSurfaceBytes(*target.baseline));else if(floating_->deferred){const auto r=timeline_.resolveSurface(target.celId);if(!r.surface)throw std::logic_error("Missing restored floating baseline");floatingAddBytes(duplicate,convolutionSurfaceBytes(*r.surface));}if(target.originalSource)floatingAddBytes(duplicate,std::uint64_t(target.originalSource->pixels.size())*5);}checkFloatingBudget(*floating_,duplicate);restored=std::make_shared<FloatingPaste>(*floating_);restored->restoredFromDeselect=true;if(restored->deferred)for(auto& target:restored->targets)if(!target.baseline){const auto r=timeline_.resolveSurface(target.celId);if(!r.surface)throw std::logic_error("Missing restored floating baseline");target.baseline=*r.surface;}
   restoredBytes=sizeof(FloatingPaste)+restored->source.pixels.size()*5;
   for(const auto& t:restored->targets)restoredBytes+=sizeof(FloatingTarget)+t.source.pixels.size()*5+t.preview.size()*sizeof(Delta)+(t.baseline?t.baseline->pixels.size()*sizeof(Pixel):0)+(t.originalSource?t.originalSource->pixels.size()*5:0);
  }
 }
 history_.reserve(position_+2);const auto originalTransient=floating_?floating_->transientBytes:0;if(floating_&&restored)floatingAddBytes(floating_->transientBytes,restoredBytes);bool committedPixels=false;try{committedPixels=commitFloatingPaste();}catch(...){if(floating_)floating_->transientBytes=originalTransient;throw;}if(!committedPixels){restored.reset();restoredBytes=0;}if(!selection_)return;
 Edit e{{},state_,state_};e.documentChanged=false;e.pixelSelectionEdit=true;e.beforePixelsSelection=selection_;e.restoredClipboard=std::move(restored);e.restoredClipboardBytes=restoredBytes;
 selection_.reset();clearFrameSelection();pushEdit(std::move(e),U"取消选择");
}
void Document::invertPixels(){if(!selection_)return;commitFloatingPaste();commitSelection(selection_,invertSelection(selection_,width_,height_));}
std::optional<SelectionClipboard> Document::copyPixels() {if(!selection_)return {};SelectionClipboard out;if(floating_){const auto bounds=transformBounds(floating_->transform);out.width=bounds.width;out.height=bounds.height;out.originX=bounds.x;out.originY=bounds.y;out.pixels.resize(std::size_t(out.width)*out.height);out.mask.resize(out.pixels.size());auto transform=floating_->transform;transform.x-=bounds.x;transform.y-=bounds.y;if(transform.flipOriginX)*transform.flipOriginX-=bounds.x;if(transform.flipOriginY)*transform.flipOriginY-=bounds.y;SelectionRotSpriteSource sampler(floating_->source);auto cells=floating_->rotSprite?rotSpriteSelectionCells(floating_->source,transform,out.width,out.height,sampler):fastSelectionTransformCells(floating_->source,transform,out.width,out.height);for(auto cell:cells){auto i=std::size_t(cell.y)*out.width+cell.x;out.pixels[i]=cell.value;out.mask[i]=1;}if(cells.empty())return {};celClipboard_.clear();frameClipboard_.clear();return out;}const auto clamped=rectangleSelection(selection_->x,selection_->y,selection_->width,selection_->height,width_,height_);if(!clamped)return {};const auto& source=*timeline_.resolveSurface(cel().id).surface;raster::validate(source);const bool dense=raster::fullCanvas(source,width_,height_);out.width=clamped->width;out.height=clamped->height;out.originX=clamped->x;out.originY=clamped->y;out.pixels.resize(out.width*out.height);out.mask.resize(out.pixels.size());bool any=false;for(int y=0;y<out.height;++y)for(int x=0;x<out.width;++x){const int px=clamped->x+x,py=clamped->y+y;if(!selectionContains(selection_,px,py))continue;const auto value=dense?source.pixels[std::size_t(py)*width_+px]:raster::readWorld(source,px,py);if(value>>24){const auto index=y*out.width+x;out.pixels[index]=value;out.mask[index]=1;any=true;}}if(!any)return {};celClipboard_.clear();frameClipboard_.clear();return out;}
std::optional<SelectionClipboard> Document::copyMergedPixels(){
 // legacy copySelection(true): resolve pending pixels before sampling all visible
 // layers, with selection alpha/mask payload or the entire canvas when absent.
 commitFloatingPaste();const auto bounds=selection_?rectangleSelection(selection_->x,selection_->y,selection_->width,selection_->height,width_,height_):std::optional<SelectionMask>{SelectionMask{0,0,width_,height_,{}}};if(!bounds)return {};
 SelectionClipboard out;out.width=bounds->width;out.height=bounds->height;out.originX=bounds->x;out.originY=bounds->y;out.pixels=compositeNormalRegion(timeline_,activeFrameId_,{bounds->x,bounds->y,bounds->width,bounds->height});out.mask.resize(out.pixels.size());bool any=false;
 for(int y=0;y<out.height;++y)for(int x=0;x<out.width;++x){const auto i=std::size_t(y)*out.width+x;if((!selection_ || selectionContains(selection_,bounds->x+x,bounds->y+y)) && (out.pixels[i]>>24)){out.mask[i]=1;any=true;}else out.pixels[i]=0;}
 if(!any)return {};
 celClipboard_.clear();frameClipboard_.clear();return out;
}
bool Document::commitImmediateTransform(const std::vector<std::string>& ids,const std::optional<SelectionMask>& capture,const SelectionTransform& transform,bool wholeFlip,bool packedFlip,bool horizontal,std::optional<SelectionMask> afterSelection,bool selectionOnly){
 auto noPixels=[&](){if(selectionOnly&&!selectionEqual(selection_,afterSelection)){commitSelection(selection_,std::move(afterSelection));return true;}if(!wholeFlip&&!packedFlip&&(transform.flipHorizontal||transform.flipVertical))selection_=std::move(afterSelection);return false;};
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
 Edit edit{{},state_,nextState_};edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.pixelSelectionEdit=true;edit.beforePixelsSelection=selection_;edit.afterPixelsSelection=afterSelection;edit.surfaceChanges.reserve(plans.size());
 std::vector<timeline::Surface> install;install.reserve(plans.size());std::vector<timeline::Surface*> owners;owners.reserve(plans.size());
 for(const auto& p:plans){auto candidate=immediateTransformCandidate(*p.before,capture,transform,wholeFlip,packedFlip,horizontal,width_,height_);bool changed=false;
  if(candidate.width==p.before->width&&candidate.height==p.before->height&&candidate.offsetX==p.before->offsetX&&candidate.offsetY==p.before->offsetY)changed=candidate.pixels!=p.before->pixels;
  else for(int y=0;y<candidate.height&&!changed;++y)for(int x=0;x<candidate.width;++x)if(candidate.pixels[std::size_t(y)*candidate.width+x]!=raster::readWorld(*p.before,std::int64_t(candidate.offsetX)+x,std::int64_t(candidate.offsetY)+y)){changed=true;break;}
  if(!changed)continue;edit.surfaceChanges.push_back({p.owner,*p.before,candidate});install.push_back(std::move(candidate));
 }
 if(edit.surfaceChanges.empty())return noPixels();
 for(const auto& change:edit.surfaceChanges){auto* live=timeline_.mutableOwnedSurface(change.ownerId);if(!live)throw std::logic_error("Missing immediate transform owner");owners.push_back(live);}
 history_.reserve(position_+1);capturePixelAddresses(edit);for(std::size_t i=0;i<owners.size();++i)std::swap(*owners[i],install[i]);selection_=std::move(afterSelection);change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"变换选区内容");return true;
}
bool Document::flipPaintCellSelection(bool horizontal){
 const auto expanded=expandedPaintCellSelection(true);if(!expanded)return false;const auto resolvedOwner=timeline_.resolveSurface(cel().id);const auto& grid=*resolvedOwner.source->tilemap;
 const auto bytes=std::uint64_t(grid.cells.size())*1024;if(bytes>256*1024*1024-adjustmentStorageBudget(timeline_,1))throw std::length_error("Paint cell flip exceeds document budget");
 std::set<std::size_t> selected;int left=grid.columns,right=-1,top=grid.rows,bottom=-1;for(std::size_t i=0;i<grid.cells.size();++i){const int x=int(i%grid.columns),y=int(i/grid.columns);if(selectionContains(expanded,activeSurface().offsetX+x*grid.tileWidth,activeSurface().offsetY+y*grid.tileHeight)){selected.insert(i);left=std::min(left,x);right=std::max(right,x);top=std::min(top,y);bottom=std::max(bottom,y);}}
 auto mirrored=[&](const std::optional<tiles::Cell>& cell){if(!cell)return cell;
  // Preserve legacy candidate object spread: absent false/zero retains the original fields.
  for(bool fh:{false,true})for(bool fv:{false,true})for(int rotation=0;rotation<(grid.tileWidth==grid.tileHeight?4:1);++rotation){auto candidate=*cell;if(fh)candidate.flipHorizontal=true;if(fv)candidate.flipVertical=true;if(rotation)candidate.rotation=rotation;bool same=true;for(int y=0;same&&y<grid.tileHeight;++y)for(int x=0;x<grid.tileWidth;++x){const auto expected=tiles::sourcePoint(horizontal?grid.tileWidth-1-x:x,horizontal?y:grid.tileHeight-1-y,grid.tileWidth,grid.tileHeight,*cell),actual=tiles::sourcePoint(x,y,grid.tileWidth,grid.tileHeight,candidate);if(expected!=actual){same=false;break;}}if(same)return std::optional<tiles::Cell>{candidate};}return cell;
 };
 TilemapPixelHistory payload;payload.celId=resolvedOwner.source->id;payload.tilesetEdit=false;payload.independentCellOwner=true;payload.cellOffsetLayout=true;payload.linkedCellOwner=true;payload.beforeSet.id=layer().tilemapTilesetId;for(const auto i:selected){const int x=int(i%grid.columns),y=int(i/grid.columns);const auto target=std::size_t(horizontal?y:top+bottom-y)*grid.columns+std::size_t(horizontal?left+right-x:x);if(!selected.count(target))continue;const auto value=mirrored(grid.cells[i]);if(value!=grid.cells[target])payload.cells.push_back({target,grid.cells[target],value});}
 auto after=selection_;if(after&&!after->mask.empty()){auto source=after->mask;for(int y=0;y<after->height;++y)for(int x=0;x<after->width;++x)after->mask[std::size_t(y)*after->width+x]=source[std::size_t(horizontal?y:after->height-1-y)*after->width+(horizontal?after->width-1-x:x)];}
 if(payload.cells.empty()){selection_=std::move(after);return false;}
 Edit edit{{},state_,nextState_};edit.tilemapPixels=std::make_shared<const TilemapPixelHistory>(std::move(payload));edit.beforeTileSelection=edit.afterTileSelection=tileSelection_;edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeFrameAnchor=edit.afterFrameAnchor=frameAnchor_;edit.beforeGroupUi=edit.afterGroupUi=GroupUiSnapshot{selectedGroupIds_,collapsedGroupIds_,selectedGroupId_};
 // legacy Paint flip history contains cell edits only; the flipped mask stays through Undo/Redo.
 const auto label=horizontal?U"水平翻转瓦片选区":U"垂直翻转瓦片选区";history_.reserve(position_+1);edit.label.reserve(32);applyEdit(edit,true);selection_=std::move(after);change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),label);return true;
}
bool Document::flipContent(bool horizontal){if(layer().kind=="free-tile"&&activeMaskId_.empty())return flipFreeTileContent(horizontal);if(layer().kind=="tilemap"&&tileSelection_.mode==tiles::Mode::Paint)return flipPaintCellSelection(horizontal);if(hasTilemapContent()||hasFreeTileContent())return false;if(!activeMaskId_.empty()&&!floating_)return selection_?transformMaskImmediate(true,horizontal,0):false;
 const auto commandLayers=selectedLayerIdsWithGroups();
 if(floating_){
  auto& f=*floating_;std::size_t extra=0;for(const auto& target:f.targets){floatingAddBytes(extra,std::uint64_t(target.source.pixels.size())*5);if(!target.originalSource)floatingAddBytes(extra,std::uint64_t(target.source.pixels.size())*5);}floatingAddBytes(extra,std::uint64_t(f.source.pixels.size())*5);checkFloatingBudget(f,extra);
  struct Flip{SelectionClipboard source;std::optional<SelectionClipboard> original;bool addOriginal=false;std::shared_ptr<SelectionRotSpriteSource> previousSampler;};std::vector<Flip> candidates;candidates.reserve(f.targets.size());
  for(const auto& target:f.targets){Flip candidate;candidate.source=target.source;if(!target.originalSource){candidate.original=target.source;candidate.addOriginal=true;}const auto& before=target.source;
   for(int y=0;y<before.height;++y)for(int x=0;x<before.width;++x){const auto dst=std::size_t(y)*before.width+x,src=std::size_t(horizontal?y:before.height-1-y)*before.width+(horizontal?before.width-1-x:x);candidate.source.pixels[dst]=before.pixels[src];candidate.source.mask[dst]=before.mask[src];}candidates.push_back(std::move(candidate));}
  auto primary=candidates.front().source;
  for(std::size_t i=0;i<candidates.size();++i){auto& target=f.targets[i];auto& candidate=candidates[i];std::swap(target.source,candidate.source);if(candidate.addOriginal)target.originalSource.swap(candidate.original);candidate.previousSampler=std::move(target.rotSprite);}
  std::swap(f.source,primary);const auto oldTransient=f.transientBytes;f.transientBytes=extra;
  try{transformFloatingPaste(f.transform,f.rotSprite);f.transientBytes=oldTransient;}
  catch(...){f.transientBytes=oldTransient;std::swap(f.source,primary);for(std::size_t i=0;i<candidates.size();++i){auto& target=f.targets[i];auto& candidate=candidates[i];std::swap(target.source,candidate.source);if(candidate.addOriginal)target.originalSource.swap(candidate.original);target.rotSprite=std::move(candidate.previousSampler);}throw;}
  return true;
 }
 cancelStroke();const bool whole=!selection_;const bool animationSelection=bool(selection_) && (!timelineSelection_.cels.empty() || !selectedFrames_.empty());const bool explicitTimeline=!timelineSelection_.cels.empty() || !commandLayers.empty() || !selectedFrames_.empty();
 std::vector<const DocumentCel*> targets;
 if(!timelineSelection_.cels.empty()){for(const auto& id:timelineSelection_.cels)if(const auto* c=timeline_.findCelById(id))targets.push_back(c);}
 else{
  auto frames=selectedFrames_;if(frames.empty()){if(whole && !commandLayers.empty())for(const auto& f:timeline_.state().frames)frames.push_back(f.id);else frames.push_back(activeFrameId_);}
  for(const auto& l:timeline_.state().layers){if(!commandLayers.empty()){if(std::find(commandLayers.begin(),commandLayers.end(),l.id)==commandLayers.end())continue;}else if(selectedFrames_.empty() && l.id!=activeLayerId_)continue;else if(!selectedFrames_.empty() && (layerEffectivelyLocked(l) || !layerEffectivelyVisible(l)))continue;for(const auto& id:frames)if(const auto* c=timeline_.findCel(l.id,id))targets.push_back(c);}
 }
 auto owner=[&](const auto* c)->const DocumentLayer&{return *std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==c->layerId;});};
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
 Edit edit{{},state_,nextState_};edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.pixelSelectionEdit=true;edit.beforePixelsSelection=selection_;edit.afterPixelsSelection=afterMask;std::unordered_set<std::string> sources;
 for(const auto* c:targets){const auto& l=owner(c);if(layerEffectivelyLocked(l) || (whole && explicitTimeline && !layerEffectivelyVisible(l)))continue;const auto resolved=timeline_.resolveSurface(c->id);if(!resolved.source || !resolved.surface || !sources.insert(timeline_.linkedStorageKey(resolved.source->id)).second)continue;const auto& before=resolved.surface->pixels;auto after=before;
  for(int y=0;y<height_;++y)for(int x=0;x<width_;++x)if(selectionContains(bounds,x,y))after[std::size_t(y)*width_+x]=0;
  for(int y=0;y<height_;++y)for(int x=0;x<width_;++x){if(!selectionContains(bounds,x,y))continue;const int tx=horizontal?2*bounds.x+bounds.width-1-x:x,ty=horizontal?y:2*bounds.y+bounds.height-1-y;if(tx>=0 && ty>=0 && tx<width_ && ty<height_){const auto value=before[std::size_t(y)*width_+x];auto& destination=after[std::size_t(ty)*width_+tx];if(animationSelection){if(value>>24)destination=selectionContains(bounds,tx,ty)?value:brushComposite(destination,value,100);}else destination=value;}}
  Edit child{{},state_,nextState_};child.targetCelId=c->id;for(std::size_t i=0;i<before.size();++i)if(before[i]!=after[i])child.pixels.push_back({i,before[i],after[i]});if(!child.pixels.empty())edit.children.push_back(std::move(child));
 }
 if(edit.children.empty()){if(!selectionEqual(selection_,afterMask)){commitSelection(selection_,afterMask);return true;}return false;}
 history_.reserve(position_+1);change_={};applyEdit(edit,true);publishChange();pushEdit(std::move(edit),horizontal?U"水平翻转选区":U"垂直翻转选区");return true;
}
bool Document::rotateContent180(){return rotateContent(180);}
bool Document::rotateContent(int angle){if(hasTilemapContent()||hasFreeTileContent())return false;if(!activeMaskId_.empty())return transformMaskImmediate(false,false,angle);
 const auto commandLayers=selectedLayerIdsWithGroups();
 if(angle!=180 && angle!=90 && angle!=-90)return false;
 // legacy rotateWorkspaceContent rotates the selected owning layers at the
 // active frame, using one union source rectangle, rather than Cel pairs.
 commitFloatingPaste();cancelStroke();std::unordered_set<std::string> selected(commandLayers.begin(),commandLayers.end());
 for(const auto& id:timelineSelection_.cels)if(const auto* target=timeline_.findCelById(id))selected.insert(target->layerId);
 const bool implicitFrames=!selectedFrames_.empty() && commandLayers.empty();if(selected.empty() && !implicitFrames)selected.insert(activeLayerId_);
 std::vector<const DocumentCel*> targets;
 for(const auto& l:timeline_.state().layers){if(implicitFrames){if(layerEffectivelyLocked(l) || !layerEffectivelyVisible(l))continue;}else if(!selected.count(l.id))continue;if(layerEffectivelyLocked(l) || !layerEffectivelyVisible(l))return false;if(const auto* target=timeline_.findCel(l.id,activeFrameId_))targets.push_back(target);}
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
 Edit edit{{},state_,nextState_};edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.pixelSelectionEdit=true;edit.beforePixelsSelection=selection_;edit.afterPixelsSelection=afterSelection;
 std::unordered_set<std::string> sources;
 for(const auto* target:targets){const auto resolved=timeline_.resolveSurface(target->id);if(!resolved.source || !resolved.surface || !sources.insert(timeline_.linkedStorageKey(resolved.source->id)).second)continue;const auto& before=resolved.surface->pixels;auto after=before;
  for(int y=0;y<height_;++y)for(int x=0;x<width_;++x)if(selectionContains(bounds,x,y))after[std::size_t(y)*width_+x]=0;
  if(angle==180){
  for(int y=0;y<height_;++y)for(int x=0;x<width_;++x){if(!selectionContains(bounds,x,y))continue;const auto value=before[std::size_t(y)*width_+x];const int tx=2*bounds->x+bounds->width-1-x,ty=2*bounds->y+bounds->height-1-y;if(!(value>>24) || tx<0 || ty<0 || tx>=width_ || ty>=height_)continue;auto& destination=after[std::size_t(ty)*width_+tx];destination=selectionContains(bounds,tx,ty)?value:brushComposite(destination,value,100);}
  }else{
   SelectionClipboard source;source.width=bounds->width;source.height=bounds->height;source.mask.assign(std::size_t(source.width)*source.height,0);source.pixels.resize(source.mask.size());
   for(int y=0;y<source.height;++y)for(int x=0;x<source.width;++x){int sx=bounds->x+x,sy=bounds->y+y;auto i=std::size_t(y)*source.width+x;if(selectionContains(bounds,sx,sy)){source.mask[i]=1;if(sx>=0 && sy>=0 && sx<width_ && sy<height_)source.pixels[i]=before[std::size_t(sy)*width_+sx];}}
   // legacy packed transform clips destination pixels to canvas while the
   // selection geometry deliberately retains transformed bounds outside it.
   for(auto cell:fastSelectionTransformCells(source,rotation,width_,height_)){if(!(cell.value>>24))continue;auto& destination=after[std::size_t(cell.y)*width_+cell.x];destination=brushComposite(destination,cell.value,100);}
  }
  Edit child{{},state_,nextState_};child.targetCelId=target->id;for(std::size_t i=0;i<before.size();++i)if(before[i]!=after[i])child.pixels.push_back({i,before[i],after[i]});if(!child.pixels.empty())edit.children.push_back(std::move(child));
 }
 if(edit.children.empty())return false;history_.reserve(position_+1);change_={};applyEdit(edit,true);publishChange();pushEdit(std::move(edit),U"旋转选区内容");return true;
}
bool Document::centerActiveContent(bool horizontal,bool vertical){if(hasTilemapContent()||hasFreeTileContent())return false;
 if(!horizontal && !vertical)return false;
 auto bounds=selection_;
 const auto& initial=activeSurface();raster::validate(initial);
 if(!bounds){int left=initial.width,top=initial.height,right=-1,bottom=-1;for(int y=0;y<initial.height;++y)for(int x=0;x<initial.width;++x)if(initial.pixels[std::size_t(y)*initial.width+x]>>24){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x);bottom=std::max(bottom,y);}if(right<left)return false;bounds=SelectionMask{raster::coordinate(std::int64_t(initial.offsetX)+left),raster::coordinate(std::int64_t(initial.offsetY)+top),right-left+1,bottom-top+1,{}};}
 // Math.round uses ties towards positive infinity, including negative deltas.
 const std::int64_t dx=horizontal?std::int64_t(std::floor(width_/2.0-(bounds->x+bounds->width/2.0)+.5)):0;
 const std::int64_t dy=vertical?std::int64_t(std::floor(height_/2.0-(bounds->y+bounds->height/2.0)+.5)):0;
 if(!dx && !dy)return false;
 if(floating_){if(layerEffectivelyLocked(layer()))return false;auto transform=floating_->transform;transform.x+=dx;transform.y+=dy;if(transform.flipOriginX)*transform.flipOriginX+=dx;if(transform.flipOriginY)*transform.flipOriginY+=dy;if(transform.quad)for(auto& p:*transform.quad){p.x+=dx;p.y+=dy;}transformFloatingPaste(transform,floating_->rotSprite);return true;}
 if(!raster::fullCanvas(activeSurface(),width_,height_)){
  if(layerEffectivelyLocked(layer()))return false;cancelStroke();const auto resolved=timeline_.resolveSurface(cel().id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.source||!resolved.surface)throw std::logic_error("Invalid center content owner");const auto& before=*resolved.surface;raster::validate(before);
  const auto capture=selection_?selection_:std::optional<SelectionMask>{*bounds};if(!capture)return false;
  const auto l=std::max<std::int64_t>(capture->x,before.offsetX),t=std::max<std::int64_t>(capture->y,before.offsetY),r=std::min<std::int64_t>(std::int64_t(capture->x)+capture->width,std::int64_t(before.offsetX)+before.width),b=std::min<std::int64_t>(std::int64_t(capture->y)+capture->height,std::int64_t(before.offsetY)+before.height);if(r<=l||b<=t)return false;
  Edit edit{{},state_,nextState_};edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.pixelSelectionEdit=true;edit.beforePixelsSelection=selection_;edit.afterPixelsSelection=selection_;if(edit.afterPixelsSelection){edit.afterPixelsSelection->x=raster::coordinate(std::int64_t(edit.afterPixelsSelection->x)+dx);edit.afterPixelsSelection->y=raster::coordinate(std::int64_t(edit.afterPixelsSelection->y)+dy);}
  if(capture->mask.empty()&&l==before.offsetX&&t==before.offsetY&&r==std::int64_t(before.offsetX)+before.width&&b==std::int64_t(before.offsetY)+before.height){
   const int x=raster::coordinate(std::int64_t(before.offsetX)+dx),y=raster::coordinate(std::int64_t(before.offsetY)+dy);raster::coordinate(std::int64_t(x)+before.width);raster::coordinate(std::int64_t(y)+before.height);edit.ownerOffsets.push_back({resolved.source->id,before.offsetX,before.offsetY,x,y});history_.reserve(position_+1);applySurfaceEdit(edit,true);selection_=edit.afterPixelsSelection;change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"移动图层内容");return true;
  }
  raster::Rect64 requested{l+dx,t+dy,r+dx,b+dy};const auto left=std::min<std::int64_t>(before.offsetX,requested.left),top=std::min<std::int64_t>(before.offsetY,requested.top),right=std::max<std::int64_t>(std::int64_t(before.offsetX)+before.width,requested.right),bottom=std::max<std::int64_t>(std::int64_t(before.offsetY)+before.height,requested.bottom);raster::coordinate(left);raster::coordinate(top);raster::coordinate(right);raster::coordinate(bottom);
  std::size_t used=adjustmentStorageBudget(timeline_,1);floatingAddBytes(used,convolutionSurfaceBytes(before)*3);floatingAddBytes(used,std::uint64_t(floatingArea(raster::coordinate(right-left),raster::coordinate(bottom-top)))*sizeof(Pixel)*3);
  auto expanded=raster::expanded(before,requested);auto after=expanded?std::move(*expanded):before;
  for(auto y=t;y<b;++y)for(auto x=l;x<r;++x)if(selectionContains(capture,int(x),int(y)))if(auto index=raster::worldIndex(after,x,y))after.pixels[*index]=0;
  for(auto y=t;y<b;++y)for(auto x=l;x<r;++x){if(!selectionContains(capture,int(x),int(y)))continue;const auto value=raster::readWorld(before,x,y);if(!(value>>24))continue;const auto index=raster::worldIndex(after,x+dx,y+dy);if(index)after.pixels[*index]=brushComposite(after.pixels[*index],value,100);}
  bool changed=false;for(int y=0;y<after.height&&!changed;++y)for(int x=0;x<after.width;++x)if(after.pixels[std::size_t(y)*after.width+x]!=raster::readWorld(before,std::int64_t(after.offsetX)+x,std::int64_t(after.offsetY)+y)){changed=true;break;}if(!changed)return false;
  edit.surfaceChanges.push_back({resolved.source->id,before,std::move(after)});history_.reserve(position_+1);applySurfaceEdit(edit,true);selection_=edit.afterPixelsSelection;change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"移动图层内容");return true;
 }
 if(layerEffectivelyLocked(layer()))return false;cancelStroke();const auto before=pixels();auto after=before;
 // legacy centerActiveContent only operates on activePaintLayer here, even
 // when other timeline targets are selected; hidden raster layers are allowed.
 for(int y=0;y<height_;++y)for(int x=0;x<width_;++x)if(selectionContains(bounds,x,y))after[std::size_t(y)*width_+x]=0;
 for(int y=0;y<height_;++y)for(int x=0;x<width_;++x){if(!selectionContains(bounds,x,y))continue;const auto value=before[std::size_t(y)*width_+x];const auto tx=std::int64_t(x)+dx,ty=std::int64_t(y)+dy;if(!(value>>24) || tx<0 || ty<0 || tx>=width_ || ty>=height_)continue;auto& destination=after[std::size_t(ty)*width_+tx];destination=selectionContains(bounds,tx,ty)?value:brushComposite(destination,value,100);}
 Edit edit{{},state_,nextState_};edit.targetCelId=cel().id;for(std::size_t i=0;i<before.size();++i)if(before[i]!=after[i])edit.pixels.push_back({i,before[i],after[i]});if(edit.pixels.empty())return false;
 edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.pixelSelectionEdit=true;edit.beforePixelsSelection=selection_;edit.afterPixelsSelection=selection_;if(edit.afterPixelsSelection){edit.afterPixelsSelection->x+=dx;edit.afterPixelsSelection->y+=dy;}
 history_.reserve(position_+1);change_={};applyEdit(edit,true);publishChange();pushEdit(std::move(edit),U"移动图层内容");return true;
}
bool Document::fillSelectionOrCanvas(Pixel color){if(hasTilemapContent()||hasFreeTileContent())return false;if(!activeMaskId_.empty())return fillAttachedMaskSelection(color);
 const auto commandLayers=selectedLayerIdsWithGroups();
 commitFloatingPaste();cancelStroke();
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
 for(const auto* target:targets){const auto owner=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==target->layerId;});if(owner==timeline_.state().layers.end() || layerEffectivelyLocked(*owner) || !layerEffectivelyVisible(*owner))return false;}
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
   if(changed){Edit child{{},state_,nextState_};child.surfaceChanges.push_back({resolved.source->id,source,std::move(after)});edit.children.push_back(std::move(child));}continue;
  }
  Edit child{{},state_,nextState_};child.targetCelId=target->id;bool changed=false;
  DensePixels region{bounds->x,bounds->y,bounds->width,bounds->height,{},{}};if(dense){region.before.reserve(area);region.after.reserve(area);}
  for(int y=bounds->y;y<bounds->y+bounds->height;++y)for(int x=bounds->x;x<bounds->x+bounds->width;++x){
   const auto index=std::size_t(y)*width_+x;const auto before=resolved.surface->pixels[index];const auto after=(!selection_ || selectionContains(selection_,x,y))?color:before;
   if(dense){region.before.push_back(before);region.after.push_back(after);}else if(before!=after)child.pixels.push_back({index,before,after});changed|=before!=after;
  }
  if(changed){if(dense)child.dense=std::move(region);edit.children.push_back(std::move(child));}
 }
 if(edit.children.empty())return false;
 history_.reserve(position_+1);change_={};applyEdit(edit,true);publishChange();pushEdit(std::move(edit),selection_?U"填充选区前景色":U"填充画布前景色");return true;
}
bool Document::deleteSelectedPixels(){if(hasFreeTileContent()){
 // Legacy deleteFreeTileSourceSelectionInSession clears the primary shared
 // source in instance world coordinates; never erase a derived Cel cache.
 if(active()||!selection_||!activeMaskId_.empty()||layer().kind!="free-tile"||freeTilePaintMode()||!layer().freeTiles||!cel().freeTiles||!cel().surface||layerEffectivelyLocked(layer()))return false;
 const auto primary=primaryFreeTileInstance();const auto instance=std::find_if(cel().freeTiles->instances.begin(),cel().freeTiles->instances.end(),[&](const auto& i){return i.id==primary;});if(instance==cel().freeTiles->instances.end()||!instance->visible||instance->locked)return false;
 const auto& sourceId=instance->sourceId.empty()?instance->tileId:instance->sourceId;const auto source=std::find_if(layer().freeTiles->sources.begin(),layer().freeTiles->sources.end(),[&](const auto& s){return s.id==sourceId||s.tilesetId==sourceId;});if(source==layer().freeTiles->sources.end()||!source->visible||source->locked)return false;
 const auto resource=std::find_if(timeline_.state().tilesets.begin(),timeline_.state().tilesets.end(),[&](const auto& t){return t.id==source->tilesetId;});if(resource==timeline_.state().tilesets.end())return false;
 const auto pixels=tiles::readTile(*resource,0);const Point anchor{cel().surface->offsetX+instance->x,cel().surface->offsetY+instance->y};PixelRegion content;
 for(int y=0;y<resource->tileHeight;++y)for(int x=0;x<resource->tileWidth;++x)if(pixels[std::size_t(y)*resource->tileWidth+x]>>24){auto q=free_tiles::transform(*instance,x+source->offsetX,y+source->offsetY);content.include(q.first+anchor.x,q.second+anchor.y);}if(content.empty())return false;
 SelectionClipboard clear;clear.width=content.w;clear.height=content.h;clear.pixels.resize(std::size_t(content.w)*content.h);clear.mask.resize(clear.pixels.size());bool changed=false;
 for(int y=0;y<resource->tileHeight;++y)for(int x=0;x<resource->tileWidth;++x){auto q=free_tiles::transform(*instance,x+source->offsetX,y+source->offsetY);const int px=q.first+anchor.x,py=q.second+anchor.y;if(px<content.x||py<content.y||px>=content.x+content.w||py>=content.y+content.h||!selectionContains(selection_,px,py))continue;clear.mask[std::size_t(py-content.y)*content.w+px-content.x]=1;changed=changed||pixels[std::size_t(y)*resource->tileWidth+x]!=0;}if(!changed)return false;
 // Reuse the image-paste source adapter in an isolated candidate; source delete
 // preserves instance/source selection instead of applying paste session changes.
 Document draft(1,1);draft.width_=width_;draft.height_=height_;draft.timeline_=timeline_;draft.activeLayerId_=activeLayerId_;draft.activeFrameId_=activeFrameId_;draft.tileSelection_=tileSelection_;draft.freeInstanceSelected_=freeInstanceSelected_;draft.freeInstancePrimary_=freeInstancePrimary_;draft.freeInstanceAnchor_=freeInstanceAnchor_;draft.freeInstanceSelectionFrame_=freeInstanceSelectionFrame_;draft.freeInstanceViewLayer_=freeInstanceViewLayer_;
 if(!draft.pasteFreeTilePixels(clear,{content.x,content.y})||draft.historyPosition()==0)return false;
 Edit edit{{},state_,nextState_};edit.beforeTimeline=timeline_.state();edit.afterTimeline=std::move(draft.timeline_.state_);edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;history_.reserve(position_+1);applyEdit(edit,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"删除选区");selection_.reset();return true;
 }if(!activeMaskId_.empty())return deleteMaskSelection();
 // legacy deleteSelection resolves selection-origin pending pixels first; clipboard-origin cancels.
 // Frozen Create/Edit/Hybrid modes share legacy copy/cancel/commit routing; Paint compound remains unmigrated.
 if(floating_&&floating_->tilemap&&(tileSelection_.mode!=floating_->tilemapMode||(floating_->tilemapMode!=tiles::Mode::Create&&floating_->tilemapMode!=tiles::Mode::Edit&&floating_->tilemapMode!=tiles::Mode::Hybrid)))return false;
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
 edit.pixelSelectionEdit=true;edit.beforePixelsSelection=selection_;
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
  Edit child{{},state_,nextState_};child.targetCelId=target->id;
  child.pixelAddress=PixelAddressSpace{source.width,source.height,source.storageOriginX.value_or(0),source.storageOriginY.value_or(0)};
  for(auto y=top;y<bottom;++y)for(auto x=left;x<right;++x){
   if(!selectionContains(selection_,int(x),int(y)))continue;
   const auto index=std::size_t(y-source.offsetY)*source.width+std::size_t(x-source.offsetX);
   const auto value=source.pixels[index];if(value!=0)child.pixels.push_back({index,value,0});
  }
  if(!child.pixels.empty())edit.children.push_back(std::move(child));
 }
 if(edit.children.empty())return false;
 history_.reserve(position_+1);change_={};applyEdit(edit,true);publishChange();pushEdit(std::move(edit),U"删除选区");return true;
}
bool Document::cutPixels(std::optional<SelectionClipboard>& clipboard){const bool freeSource=layer().kind=="free-tile"&&activeMaskId_.empty();if(hasFreeTileContent()&&!freeSource)return false;if(hasTilemapContent()&&!freeSource&&!tilemapSelectionCutAvailable())return false;if(!selection_)return false;clipboard=copyPixels();const bool deleteOriginal=!floating_ || (!floating_->clipboard && !floating_->copy);if(floating_)cancelFloatingPaste();if(deleteOriginal)deleteSelectedPixels();selection_.reset();return bool(clipboard);}
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
 if(f.clipboard)return std::uint64_t(f.source.width)*f.source.height>256*256;
 if(!deferredFloatingDisplaySupported_||std::max(std::uint64_t(width_)*height_,std::uint64_t(f.source.width)*f.source.height)<=256*256)return false;
 const auto* target=timeline_.findCelById(f.targets.front().celId);if(!target||target->frameId!=activeFrameId_)return false;
 bool contains=false;
 for(const auto& l:timeline_.state().layers){if(!layerEffectivelyVisible(l)||frameCelOpacity(timeline_,l,activeFrameId_)<=0)continue;const auto* c=timeline_.findCel(l.id,activeFrameId_);if(!c)continue;const auto r=timeline_.resolveSurface(c->id);if(!r.surface)return false;const bool empty=std::none_of(r.surface->pixels.begin(),r.surface->pixels.end(),[](Pixel p){return (p>>24)!=0;});if(empty)continue;if(l.blendMode!="normal")return false;if(l.id==target->layerId)contains=true;}
 return contains;
}
void Document::noteFloatingOverlayChange(const FloatingPaste& f,const SelectionTransform& before,const SelectionTransform& after){
 floatingOverlayChange_={};auto include=[&](const SelectionMask& b){const auto l=std::max<std::int64_t>(0,b.x),t=std::max<std::int64_t>(0,b.y),r=std::min<std::int64_t>(width_,std::int64_t(b.x)+b.width),bottom=std::min<std::int64_t>(height_,std::int64_t(b.y)+b.height);if(r>l&&bottom>t){floatingOverlayChange_.include(int(l),int(t));floatingOverlayChange_.include(int(r-1),int(bottom-1));}};
 if(floatingSymmetryTranslation(f,before)||floatingSymmetryScale(f,before)||floatingSymmetryRotation(f,before)){if(auto mask=floatingSelectionMask(f,before))include(*mask);}else include(checkedFloatingBounds(before));if(floatingSymmetryTranslation(f,after)||floatingSymmetryScale(f,after)||floatingSymmetryRotation(f,after)){if(auto mask=floatingSelectionMask(f,after))include(*mask);}else include(checkedFloatingBounds(after));if(!f.clipboard&&!f.copy)include({f.sourceX,f.sourceY,f.source.width,f.source.height,{}});++floatingOverlayRevision_;
}
std::vector<Pixel> Document::floatingOverlayRegion(PixelRegion region)const{
 if(!floatingDeferred())return {};const auto& f=*floating_;const auto& target=f.targets.front();const auto r=timeline_.resolveSurface(target.celId);if(!r.surface||!r.source||(!target.ownerId.empty()&&r.source->id!=target.ownerId))throw std::logic_error("Floating overlay owner changed");
 const auto& before=target.baseline?*target.baseline:*r.surface;std::vector<Pixel> result(floatingArea(region.w,region.h));const auto& original=target.originalSource?*target.originalSource:target.source;
 for(int y=0;y<region.h;++y)for(int x=0;x<region.w;++x){const auto wx=std::int64_t(region.x)+x,wy=std::int64_t(region.y)+y;auto value=raster::readWorld(before,wx,wy);const auto sx=wx-f.sourceX,sy=wy-f.sourceY;if(!f.clipboard&&!f.copy&&sx>=0&&sy>=0&&sx<original.width&&sy<original.height&&original.mask[std::size_t(sy)*original.width+std::size_t(sx)]==1)value=0;result[std::size_t(y)*region.w+x]=value;}
 const auto& source=target.source;
 if(floatingSymmetryTranslation(f,f.transform)){symmetryContentTranslation(source,*f.beforeSelection,*f.symmetryStart,{int(f.transform.x)-f.sourceX,int(f.transform.y)-f.sourceY},width_,height_,f.symmetryAxes,f.symmetryCenter,[&](int x,int y,Pixel pixel){if(x<region.x||y<region.y||x>=region.x+region.w||y>=region.y+region.h)return;auto& value=result[std::size_t(y-region.y)*region.w+x-region.x];value=!f.copy&&selectionContains(f.beforeSelection,x,y)?pixel:brushComposite(raster::readWorld(before,x,y),pixel,100);});}
 else if(floatingSymmetryRotation(f,f.transform)&&target.symmetryRotation){if(!target.symmetryRotation->matches(f.transform,f.rotSprite))throw std::logic_error("Missing immutable symmetry rotation preview");target.symmetryRotation->region(region.x,region.y,region.w,region.h,[&](int x,int y,Pixel pixel){auto& value=result[std::size_t(y-region.y)*region.w+x-region.x];value=!f.copy&&selectionContains(f.beforeSelection,x,y)?pixel:brushComposite(raster::readWorld(before,x,y),pixel,100);});}
 else if(floatingSymmetryScale(f,f.transform)){const SelectionMask clip{region.x,region.y,region.w,region.h,{}};symmetryContentScale(source,*f.beforeSelection,f.transform,width_,height_,f.symmetryAxes,f.symmetryCenter,[&](int x,int y,Pixel pixel){if(x<region.x||y<region.y||x>=region.x+region.w||y>=region.y+region.h)return;auto& value=result[std::size_t(y-region.y)*region.w+x-region.x];value=!f.copy&&selectionContains(f.beforeSelection,x,y)?pixel:brushComposite(raster::readWorld(before,x,y),pixel,100);},false,&clip);}
 else if(floatingTranslation(f.transform,source)){const auto ox=std::int64_t(f.transform.x),oy=std::int64_t(f.transform.y);for(int y=0;y<region.h;++y)for(int x=0;x<region.w;++x){const auto sx=std::int64_t(region.x)+x-ox,sy=std::int64_t(region.y)+y-oy;if(sx<0||sy<0||sx>=source.width||sy>=source.height)continue;const auto i=std::size_t(sy)*source.width+std::size_t(sx);if(source.mask[i]!=1||!(source.pixels[i]>>24))continue;auto& value=result[std::size_t(y)*region.w+x];value=brushComposite(value,source.pixels[i],100);}}
 else{auto transform=f.transform;transform.x-=region.x;transform.y-=region.y;if(transform.flipOriginX)*transform.flipOriginX-=region.x;if(transform.flipOriginY)*transform.flipOriginY-=region.y;if(transform.quad)for(auto& p:*transform.quad){p.x-=region.x;p.y-=region.y;}std::shared_ptr<SelectionRotSpriteSource> sampler=target.rotSprite;if(f.rotSprite&&!sampler)sampler=std::make_shared<SelectionRotSpriteSource>(source);const auto cells=f.rotSprite?rotSpriteSelectionCells(source,transform,region.w,region.h,*sampler):fastSelectionTransformCells(source,transform,region.w,region.h);for(const auto& c:cells){auto& value=result[std::size_t(c.y)*region.w+c.x];value=brushComposite(value,c.value,100);}}
 return result;
}
void Document::checkFloatingBudget(const FloatingPaste& f,std::size_t extra)const{
 std::size_t used=adjustmentStorageBudget(timeline_,1);
 auto clipboard=[&](const SelectionClipboard& c){const auto count=floatingArea(c.width,c.height);if(c.pixels.size()!=count||c.mask.size()!=count)throw std::invalid_argument("Invalid floating payload");floatingAddBytes(used,std::uint64_t(count)*5);};
 if(f.source.width>0&&f.source.height>0&&!f.source.pixels.empty())clipboard(f.source);
 if(f.beforeSelection)floatingAddBytes(used,f.beforeSelection->mask.size());if(selection_)floatingAddBytes(used,selection_->mask.size());
 for(const auto& target:f.targets){clipboard(target.source);if(target.originalSource)clipboard(*target.originalSource);if(target.baseline){raster::validate(*target.baseline);floatingAddBytes(used,convolutionSurfaceBytes(*target.baseline));}floatingAddBytes(used,std::uint64_t(target.preview.size())*128);if(target.symmetryRotation)floatingAddBytes(used,target.symmetryRotation->bytes());if(target.rotSprite)floatingAddBytes(used,std::uint64_t(target.source.pixels.size())*5+12*1024*1024);}
 if(f.beforeCelTimeline)for(const auto& cel:f.beforeCelTimeline->cels)if(cel.surface){raster::validate(*cel.surface);floatingAddBytes(used,convolutionSurfaceBytes(*cel.surface));}
 if(f.beforeMasks)for(const auto& m:*f.beforeMasks)floatingAddBytes(used,convolutionSurfaceBytes(m.mask.surface));
 floatingAddBytes(used,f.transientBytes);floatingAddBytes(used,extra);
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
  if(std::any_of(stages.begin(),stages.end(),[&](const auto& s){return s.owner==r.source->id;}))continue;
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
  auto write=[&](int x,int y,Pixel value){auto index=raster::worldIndex(storage,x,y);if(!index)return;const auto old=storage.pixels[*index];if(old==value)return;auto inserted=stage.changes.emplace(*index,Delta{*index,old,value});if(!inserted.second)inserted.first->second.after=value;storage.pixels[*index]=value;};
  const auto& source=target.source;const auto& original=target.originalSource?*target.originalSource:source;
  if(!f.clipboard&&!f.copy)for(int y=0;y<original.height;++y)for(int x=0;x<original.width;++x){const auto i=std::size_t(y)*original.width+x;if(original.mask[i]!=1||(translation&&!floatingSymmetryTranslation(f,transform)&&!floatingSymmetryScale(f,transform)&&!(original.pixels[i]>>24)))continue;const auto wx=std::int64_t(f.sourceX)+x,wy=std::int64_t(f.sourceY)+y;if(translation&&(wx<0||wy<0||wx>=width_||wy>=height_))continue;write(raster::coordinate(wx),raster::coordinate(wy),0);}
  if(floatingSymmetryTranslation(f,transform)){symmetryContentTranslation(source,*f.beforeSelection,*f.symmetryStart,{int(transform.x)-f.sourceX,int(transform.y)-f.sourceY},width_,height_,f.symmetryAxes,f.symmetryCenter,[&](int x,int y,Pixel pixel){write(x,y,!f.copy&&selectionContains(f.beforeSelection,x,y)?pixel:brushComposite(raster::readWorld(*stage.before,x,y),pixel,100));});}
  else if(floatingSymmetryRotation(f,transform)){stage.sampler=target.rotSprite;if(rotSprite&&!stage.sampler)stage.sampler=std::make_shared<SelectionRotSpriteSource>(source);const auto rotationRaster=target.symmetryRotation&&target.symmetryRotation->matches(transform,rotSprite)?target.symmetryRotation:symmetryContentRotation(source,*f.beforeSelection,transform,width_,height_,f.symmetryAxes,f.symmetryCenter,rotSprite,stage.sampler.get());rotationRaster->each([&](int x,int y,Pixel pixel){write(x,y,!f.copy&&selectionContains(f.beforeSelection,x,y)?pixel:brushComposite(raster::readWorld(*stage.before,x,y),pixel,100));});}
  else if(floatingSymmetryScale(f,transform)){symmetryContentScale(source,*f.beforeSelection,transform,width_,height_,f.symmetryAxes,f.symmetryCenter,[&](int x,int y,Pixel pixel){write(x,y,!f.copy&&selectionContains(f.beforeSelection,x,y)?pixel:brushComposite(raster::readWorld(*stage.before,x,y),pixel,100));});}
  else if(translation){const int x=int(transform.x),y=int(transform.y);const auto left=std::max<std::int64_t>(0,-std::int64_t(x)),top=std::max<std::int64_t>(0,-std::int64_t(y)),right=std::min<std::int64_t>(source.width,std::int64_t(width_)-x),bottom=std::min<std::int64_t>(source.height,std::int64_t(height_)-y);
   for(auto row=top;row<bottom;++row)for(auto col=left;col<right;++col){const auto i=std::size_t(row)*source.width+std::size_t(col);if(source.mask[i]!=1||!(source.pixels[i]>>24))continue;const int wx=raster::coordinate(std::int64_t(x)+col),wy=raster::coordinate(std::int64_t(y)+row);write(wx,wy,brushComposite(raster::readWorld(storage,wx,wy),source.pixels[i],100));}
  }else{stage.sampler=target.rotSprite;if(rotSprite&&!stage.sampler)stage.sampler=std::make_shared<SelectionRotSpriteSource>(source);const auto cells=rotSprite?rotSpriteSelectionCells(source,transform,width_,height_,*stage.sampler):fastSelectionTransformCells(source,transform,width_,height_);for(auto cell:cells)write(cell.x,cell.y,brushComposite(raster::readWorld(storage,cell.x,cell.y),cell.value,100));}
  for(auto it=stage.changes.begin();it!=stage.changes.end();)if(it->second.before==it->second.after)it=stage.changes.erase(it);else ++it;
 }
 for(auto& stage:stages){stage.live=timeline_.mutableOwnedSurface(stage.owner);if(!stage.live)throw std::logic_error("Missing floating install owner");}
 for(auto& stage:stages){auto& target=f.targets[stage.index];std::swap(*stage.live,stage.candidate);target.ownerId.swap(stage.owner);if(stage.baseline)target.baseline=std::move(stage.baseline);target.preview.swap(stage.changes);if(!translation)target.rotSprite=std::move(stage.sampler);}
 f.restoredFromDeselect=false;f.sparse=true;f.rotSprite=rotSprite;f.transform=transform;f.x=int(std::floor(transform.x));f.y=int(std::floor(transform.y));selection_=std::move(selection);change_={0,0,width_,height_};publishChange();
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
 const bool whole=translation&&!f.clipboard&&!f.copy&&f.beforeSelection&&f.beforeSelection->mask.empty()&&f.sourceX<=baseline.offsetX&&f.sourceY<=baseline.offsetY&&std::int64_t(f.sourceX)+f.source.width>=std::int64_t(baseline.offsetX)+baseline.width&&std::int64_t(f.sourceY)+f.source.height>=std::int64_t(baseline.offsetY)+baseline.height;
 if(whole){next.offsetX=raster::coordinate(std::int64_t(baseline.offsetX)+int(transform.x)-f.sourceX);next.offsetY=raster::coordinate(std::int64_t(baseline.offsetY)+int(transform.y)-f.sourceY);}
 else{
  PixelRegion needed{0,0,width_,height_};if(translation&&!f.clipboard){needed={int(transform.x),int(transform.y),target.source.width,target.source.height};}if(auto expanded=raster::expanded(next,{needed.x,needed.y,std::int64_t(needed.x)+needed.w,std::int64_t(needed.y)+needed.h},256*1024*1024))next=std::move(*expanded);
  auto write=[&](int x,int y,Pixel value){if(auto index=raster::worldIndex(next,x,y))next.pixels[*index]=timeline::normalizedMaskPixel(value);};
  if(!f.clipboard&&!f.copy)for(int y=0;y<original.height;++y)for(int x=0;x<original.width;++x){const auto i=std::size_t(y)*original.width+x;if(original.mask[i]==1)write(raster::coordinate(std::int64_t(f.sourceX)+x),raster::coordinate(std::int64_t(f.sourceY)+y),0);}
  if(translation){for(int y=0;y<target.source.height;++y)for(int x=0;x<target.source.width;++x){const auto i=std::size_t(y)*target.source.width+x;if(target.source.mask[i]!=1||!(target.source.pixels[i]>>24))continue;const int wx=raster::coordinate(std::int64_t(int(transform.x))+x),wy=raster::coordinate(std::int64_t(int(transform.y))+y);if(f.clipboard&&(wx<0||wy<0||wx>=width_||wy>=height_))continue;write(wx,wy,target.source.pixels[i]);}}
  else{if(rotSprite&&!sampler)sampler=std::make_shared<SelectionRotSpriteSource>(target.source);const auto cells=rotSprite?rotSpriteSelectionCells(target.source,transform,width_,height_,*sampler):fastSelectionTransformCells(target.source,transform,width_,height_);for(const auto cell:cells)if(cell.value>>24)write(cell.x,cell.y,cell.value);}
 }
 const bool changed=next.offsetX!=baseline.offsetX||next.offsetY!=baseline.offsetY||next.width!=baseline.width||next.height!=baseline.height||next.pixels!=baseline.pixels;
 std::unordered_map<std::size_t,Delta> deltas;if(changed)deltas.emplace(0,Delta{0,0,1});auto selected=floatingSelectionMask(f,transform);if(!changed)next=baseline;
 mutableActiveMask()->surface=std::move(next);target.preview=std::move(deltas);target.rotSprite=std::move(sampler);f.transform=transform;f.rotSprite=rotSprite;f.x=int(std::floor(transform.x));f.y=int(std::floor(transform.y));f.restoredFromDeselect=false;selection_=std::move(selected);change_={0,0,width_,height_};publishChange();
}
bool Document::commitMaskFloating(){
 auto& f=*floating_;if(f.maskId!=activeMaskId_||!f.beforeMasks)throw std::logic_error("Mask floating target changed before commit");
 const bool changed=!f.targets.front().preview.empty(),selected=!selectionEqual(f.beforeSelection,selection_);Edit edit{{},state_,changed?nextState_:state_};edit.documentChanged=changed;edit.pixelSelectionEdit=true;edit.beforePixelsSelection=f.beforeSelection;edit.afterPixelsSelection=selection_;
 if(changed){edit.beforeMasks=*f.beforeMasks;edit.afterMasks=timeline_.state().masks;}checkFloatingBudget(f,0);history_.reserve(position_+1);floating_.reset();if(changed||selected)pushEdit(std::move(edit),U"变换选区内容");return changed;
}
void Document::cancelMaskFloating(){
 if(!floating_)return;auto& f=*floating_;if(f.beforeMasks)timeline_.state_.masks=std::move(*f.beforeMasks);selection_=std::move(f.beforeSelection);floating_.reset();change_={0,0,width_,height_};publishChange();
}
bool Document::transformMaskImmediate(bool flip,bool horizontal,int angle){
 if(!flip&&angle!=90&&angle!=-90&&angle!=180)return false;commitFloatingPaste();cancelStroke();cancelGradient();if(!maskBrushAvailable())return false;
 auto beforeSelection=selection_;auto bounds=selection_;if(!bounds){const auto& source=mutableActiveMask()->surface;int l=width_,t=height_,r=-1,b=-1;for(int y=0;y<source.height;++y)for(int x=0;x<source.width;++x)if(source.pixels[std::size_t(y)*source.width+x]>>24){const int wx=raster::coordinate(std::int64_t(source.offsetX)+x),wy=raster::coordinate(std::int64_t(source.offsetY)+y);l=std::min(l,wx);t=std::min(t,wy);r=std::max(r,wx);b=std::max(b,wy);}if(r<l)return false;bounds=SelectionMask{l,t,r-l+1,b-t+1,{}};}
 SelectionClipboard source;source.width=bounds->width;source.height=bounds->height;const auto count=floatingArea(source.width,source.height);source.mask.resize(count);source.pixels.resize(count);const auto& surface=mutableActiveMask()->surface;
 for(int y=0;y<source.height;++y)for(int x=0;x<source.width;++x){const int wx=raster::coordinate(std::int64_t(bounds->x)+x),wy=raster::coordinate(std::int64_t(bounds->y)+y);if(!selectionContains(bounds,wx,wy))continue;const auto i=std::size_t(y)*source.width+x;source.mask[i]=1;source.pixels[i]=raster::readWorld(surface,wx,wy);}
 if(!beginMaskFloating(source,bounds->x,bounds->y,false,false))return false;floating_->beforeSelection=beforeSelection;SelectionTransform target{double(bounds->x),double(bounds->y),double(bounds->width),double(bounds->height),double(angle)};target.flipHorizontal=flip&&horizontal;target.flipVertical=flip&&!horizontal;
 try{transformFloatingPaste(target,false);return commitFloatingPaste();}catch(...){cancelFloatingPaste();throw;}
}
bool Document::deleteMaskSelection(){
 if(floating_){if(floating_->clipboard){cancelFloatingPaste();return true;}commitFloatingPaste();}if(!selection_||!maskBrushAvailable())return false;const bool changed=fillAttachedMaskSelection(palette_.secondary);if(changed)selection_.reset();return changed;
}

bool Document::beginFloatingPaste(const SelectionClipboard& clipboard,int x,int y){if(hasFreeTileContent())return false;
 // legacy clipboard permits ordinary raster targets in a mixed document.
 if(hasTilemapContent()&&(!activeMaskId_.empty()||!layer().kind.empty()||hasSelectedGroups()||layerEffectivelyLocked(layer())))return false;
 if(!activeMaskId_.empty())return beginMaskFloating(clipboard,x,y,true,true);
 commitFloatingPaste();cancelStroke();
 if(layer().locked || clipboard.width<1 || clipboard.height<1 || std::uint64_t(clipboard.width)*clipboard.height!=clipboard.pixels.size() || (!clipboard.mask.empty() && clipboard.mask.size()!=clipboard.pixels.size()))return false;
 if(!clipboard.mask.empty() && std::none_of(clipboard.mask.begin(),clipboard.mask.end(),[](auto value){return value!=0;}))return false;
 FloatingPaste f;f.source=clipboard;if(f.source.mask.empty())f.source.mask.assign(f.source.pixels.size(),1);
 f.x=x;f.y=y;f.beforeSelection=selection_;f.layerId=layer().id;f.frameId=frame().id;f.targets.push_back({f.source,cel().id,{}});f.transform={double(x),double(y),double(clipboard.width),double(clipboard.height)};
 f.deferred=supportsDeferredFloating(f);(void)checkedFloatingBounds(f.transform);floating_=std::move(f);
 try{moveFloatingPaste(x,y);}catch(...){cancelFloatingPaste();throw;}
 return true;
}
bool Document::beginLayerTransform(){
 if(hasFreeTileContent()){
  if(layer().kind!="free-tile"||!activeMaskId_.empty()||hasSelectedGroups()||!selectedFrames_.empty())return false;
  for(const auto& id:timelineSelection_.layers)if(id!=activeLayerId_)return false;
  for(const auto& id:timelineSelection_.cels){const auto* c=timeline_.findCelById(id);if(!c||c->layerId!=activeLayerId_||c->frameId!=activeFrameId_)return false;}
  commitFloatingPaste();cancelStroke();cancelGradient();const auto bounds=freeTileSelectionTargetBounds(*this);if(!bounds)return false;
  auto visible=combineSelection(SelectionMask{bounds->x,bounds->y,bounds->w,bounds->h,{}},SelectionMask{0,0,width_,height_,{}},3);if(!visible)return false;
  selection_=std::move(visible);return true;
 }
 if(hasTilemapContent())return false;if(!activeMaskId_.empty()){
 commitFloatingPaste();cancelStroke();cancelGradient();if(!maskBrushAvailable())return false;const auto& surface=mutableActiveMask()->surface;int l=width_,t=height_,r=-1,b=-1;
 for(int y=0;y<height_;++y)for(int x=0;x<width_;++x)if(raster::readWorld(surface,x,y)>>24){l=std::min(l,x);t=std::min(t,y);r=std::max(r,x);b=std::max(b,y);}if(r<l)return false;selection_=SelectionMask{l,t,r-l+1,b-t+1,{}};return true;
 }
 const auto commandLayers=selectedLayerIdsWithGroups();if(hasSelectedGroups()&&commandLayers.empty())return false;
 commitFloatingPaste();cancelStroke();std::unordered_set<std::string> selected(commandLayers.begin(),commandLayers.end());for(const auto& id:timelineSelection_.cels)if(const auto* target=timeline_.findCelById(id))selected.insert(target->layerId);
 const bool implicitFrames=!selectedFrames_.empty() && commandLayers.empty();if(selected.empty() && !implicitFrames)selected.insert(activeLayerId_);
 int left=width_,top=height_,right=-1,bottom=-1;
 for(const auto& l:timeline_.state().layers){if(implicitFrames){if(layerEffectivelyLocked(l) || !layerEffectivelyVisible(l))continue;}else if(!selected.count(l.id))continue;if(layerEffectivelyLocked(l) || !layerEffectivelyVisible(l))return false;const auto* target=timeline_.findCel(l.id,activeFrameId_);if(!target)continue;const auto resolved=timeline_.resolveSurface(target->id);if(!resolved.surface)continue;const auto& s=*resolved.surface;raster::validate(s);for(int y=0;y<s.height;++y)for(int x=0;x<s.width;++x){const auto wx=std::int64_t(s.offsetX)+x,wy=std::int64_t(s.offsetY)+y;if(wx<0||wy<0||wx>=width_||wy>=height_||!(s.pixels[std::size_t(y)*s.width+x]>>24))continue;left=std::min(left,int(wx));top=std::min(top,int(wy));right=std::max(right,int(wx));bottom=std::max(bottom,int(wy));}}
 if(right<left)return false;selection_=SelectionMask{left,top,right-left+1,bottom-top+1,{}};return true;
}
bool Document::linkedCreateFloatingSupported(const FloatingPaste& f)const{
 // Frozen explicit-chain Create owner; preview may have no in-canvas selection.
 if(!f.linkedCreate||!f.tilemap||f.tilemapMode!=tiles::Mode::Create||tileSelection_.mode!=tiles::Mode::Create||f.clipboard||f.layerId!=layer().id||f.frameId!=frame().id||f.targets.size()!=1||f.targets.front().celId!=cel().id||!tilemapCellOwnerSupported(cel().id,false,true)||!raster::fullCanvas(activeSurface(),width_,height_))return false;
 const auto r=timeline_.resolveSurface(cel().id);return !f.targets.front().ownerId.empty()&&r.source&&r.source->id==f.targets.front().ownerId;
}
bool Document::linkedEditFloatingSupported(const FloatingPaste& f)const{
 // The gesture freezes its canonical owner and anchor; all resource references must remain admissible.
 if(!f.linkedEdit||!f.tilemap||f.tilemapMode!=tiles::Mode::Edit||tileSelection_.mode!=tiles::Mode::Edit||f.clipboard||f.layerId!=layer().id||f.frameId!=frame().id||f.targets.size()!=1||f.targets.front().celId!=cel().id||!f.tilemapEditCell||!tilemapCellOwnerSupported(cel().id,false,true)||!raster::fullCanvas(activeSurface(),width_,height_)||!tilemapPixelReferenceOwnersSupported(layer().tilemapTilesetId))return false;
 const auto r=timeline_.resolveSurface(cel().id);return !f.targets.front().ownerId.empty()&&r.source&&r.source->id==f.targets.front().ownerId&&*f.tilemapEditCell<r.source->tilemap->cells.size()&&bool(r.source->tilemap->cells[*f.tilemapEditCell]);
}
bool Document::linkedHybridFloatingSupported(const FloatingPaste& f)const{
 if(!f.linkedHybrid||!f.tilemap||f.tilemapMode!=tiles::Mode::Hybrid||tileSelection_.mode!=tiles::Mode::Hybrid||f.clipboard||f.layerId!=layer().id||f.frameId!=frame().id||f.targets.size()!=1||f.targets.front().celId!=cel().id||!tilemapCellOwnerSupported(cel().id,false,true)||!raster::fullCanvas(activeSurface(),width_,height_)||!tilemapPixelReferenceOwnersSupported(layer().tilemapTilesetId))return false;
 const auto r=timeline_.resolveSurface(cel().id);return !f.targets.front().ownerId.empty()&&r.source&&r.source->id==f.targets.front().ownerId;
}
bool Document::prepareTilemapFloating(FloatingPaste& f,std::optional<Point> seed){
 f.tilemapMode=tileSelection_.mode;if(f.tilemapMode!=tiles::Mode::Edit)return true;
 const auto resolved=timeline_.resolveSurface(cel().id);if(!resolved.source||!resolved.source->tilemap)return false;const auto& grid=*resolved.source->tilemap;
 auto cellAt=[&](Point p)->std::optional<std::size_t>{if(p.x<0||p.y<0||p.x>=width_||p.y>=height_)return {};const auto index=std::size_t(p.y/grid.tileHeight)*grid.columns+p.x/grid.tileWidth;return index<grid.cells.size()&&grid.cells[index]?std::optional<std::size_t>{index}:std::nullopt;};
 if(seed)f.tilemapEditCell=cellAt(*seed);else if(selection_){for(int y=std::max(0,selection_->y);y<std::min(height_,selection_->y+selection_->height)&&!f.tilemapEditCell;++y)for(int x=std::max(0,selection_->x);x<std::min(width_,selection_->x+selection_->width);++x)if(selectionContains(selection_,x,y)){f.tilemapEditCell=cellAt({x,y});if(f.tilemapEditCell)break;}}
 if(!f.tilemapEditCell)return false;
 const auto& state=timeline_.state();const auto set=std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& t){return t.id==layer().tilemapTilesetId;});if(set==state.tilesets.end())return false;
 std::size_t refs=0;for(const auto& c:state.cels)if(c.tilemap)for(const auto& cell:c.tilemap->cells)if(cell&&cell->tilesetId==set->id)++refs;
 // Retained baseline/raw canvas, detached display, reference index and one transactional COW publish.
 const auto retained=adjustmentStorageBudget(timeline_,1)+std::uint64_t(width_)*height_*8+std::uint64_t(refs)*128;
 checkFloatingBudget(f,retained+adjustmentStorageBudget(timeline_,1)+std::uint64_t(width_)*height_*4);f.transientBytes=retained;
 auto g=std::make_shared<GradientPreview>();g->tilemap=true;g->tilemapMode=f.tilemapMode;g->celId=cel().id;g->layerId=layer().id;g->frameId=frame().id;g->contentRevision=contentRevision_;g->tilemapBaseline=canvasPixels();g->preview=g->tilemapBaseline;g->tilemapDisplay=timeline::Timeline(state);
 const auto index=*f.tilemapEditCell;g->region=SelectionMask{int(index%grid.columns)*grid.tileWidth,int(index/grid.columns)*grid.tileHeight,grid.tileWidth,grid.tileHeight,{}};
 for(std::size_t ci=0;ci<state.cels.size();++ci){const auto& c=state.cels[ci];if(c.tilemap&&c.surface)for(std::size_t i=0;i<c.tilemap->cells.size();++i){const auto& cell=c.tilemap->cells[i];if(cell&&cell->tilesetId==set->id)g->tilemapReferences[cell->tileId].push_back({ci,i});}}
 f.tilemapPreview=std::move(g);return true;
}
bool Document::beginSelectionContentMove(bool copy,bool allFrameLayers,int initialDx,int initialDy,std::optional<Point> tilemapSeed,bool symmetryTranslation,bool symmetryScale,bool symmetryRotation,bool symmetryShear){if(hasFreeTileContent()){if(layer().kind=="free-tile"&&activeMaskId_.empty()){const bool started=beginFreeTileSelectionMove(copy,allFrameLayers,initialDx,initialDy);if(started&&symmetryTranslation&&tilemapSeed){floating_->symmetryStart=SymmetryPixel{tilemapSeed->x,tilemapSeed->y};floating_->symmetryAxes=symmetryAxes;floating_->symmetryCenter=symmetryCenter();}return started;}return false;}if(hasTilemapContent()){
 if(floating_){if(floating_->tilemap){if(tileSelection_.mode!=floating_->tilemapMode||layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer()))return false;}else if(!(floating_->clipboard&&floating_->maskId.empty()&&layer().kind.empty()&&!layerEffectivelyLocked(layer())))return false;}
 else if(allFrameLayers||!tilemapSelectionTransformAvailable())return false;
 }if(!activeMaskId_.empty())return beginMaskSelectionMove(copy,allFrameLayers,initialDx,initialDy);
 const auto commandLayers=selectedLayerIdsWithGroups();if(hasSelectedGroups()&&commandLayers.empty())return false;
 if(floating_){if(copy && !floating_->copy){commitFloatingPaste();}else{if(symmetryTranslation&&tilemapSeed)configureSymmetryContentDrag(*floating_,*tilemapSeed);if(symmetryScale&&!floating_->clipboard&&!floating_->tilemap&&floating_->maskId.empty()&&floating_->beforeSelection){floating_->symmetryShear=false;floating_->symmetryRotation=false;floating_->symmetryScale=true;floating_->symmetryAxes=symmetryAxes;floating_->symmetryCenter=symmetryCenter();}if(symmetryRotation)configureSymmetryContentRotation(*floating_);if(symmetryShear)configureSymmetryContentShear(*floating_);return true;}}
 if(!selection_)return false;cancelStroke();
 FloatingPaste f;f.tilemap=layer().kind=="tilemap";f.linkedCreate=f.tilemap&&linkedCreateSelectionAvailable();f.linkedEdit=f.tilemap&&linkedEditSelectionAvailable();f.linkedHybrid=f.tilemap&&linkedHybridSelectionAvailable();if(f.tilemap&&!prepareTilemapFloating(f,tilemapSeed))return false;
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
 if(f.targets.empty())return false;f.source=f.targets.front().source;
 f.transform={double(f.x)+initialDx,double(f.y)+initialDy,double(f.source.width),double(f.source.height)};(void)checkedFloatingBounds(f.transform);
 const int initialX=raster::coordinate(std::int64_t(f.sourceX)+initialDx),initialY=raster::coordinate(std::int64_t(f.sourceY)+initialDy);
 f.deferred=supportsDeferredFloating(f);(void)checkedFloatingBounds(f.transform);floating_=std::move(f);try{moveFloatingPaste(initialX,initialY);if(symmetryTranslation&&tilemapSeed)configureSymmetryContentDrag(*floating_,*tilemapSeed);if(symmetryScale&&!floating_->clipboard&&!floating_->tilemap&&floating_->maskId.empty()&&floating_->beforeSelection){floating_->symmetryShear=false;floating_->symmetryRotation=false;floating_->symmetryScale=true;floating_->symmetryAxes=symmetryAxes;floating_->symmetryCenter=symmetryCenter();}if(symmetryRotation)configureSymmetryContentRotation(*floating_);if(symmetryShear)configureSymmetryContentShear(*floating_);}catch(...){floating_.reset();throw;}return true;
}
std::optional<SelectionMask> Document::expandedPaintCellSelection(bool discreteFlip)const{
 // Resolved full-grid caches keep their world origin while moving complete cells.
 // Movement clips its selection to the document; discrete flips keep complete cells.
 if(!selection_||active()||!activeMaskId_.empty()||layer().kind!="tilemap"||tileSelection_.mode!=tiles::Mode::Paint||hasSelectedGroups()||!tilemapCellOwnerSupported(cel().id,true,true)||(!discreteFlip&&(layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer()))))return {};
 if(std::any_of(timeline_.state().layers.begin(),timeline_.state().layers.end(),[](const auto& l){return l.kind=="free-tile";}))return {};
 const auto layers=selectedLayerIdsWithGroups();if(layers.size()>1||(!layers.empty()&&layers.front()!=activeLayerId_)||!selectedFrames_.empty()||timelineSelection_.cels.size()>1||(!timelineSelection_.cels.empty()&&timelineSelection_.cels.front()!=cel().id))return {};
 const auto& g=*timeline_.resolveSurface(cel().id).source->tilemap;const int originX=activeSurface().offsetX,originY=activeSurface().offsetY,clipLeft=discreteFlip?originX:0,clipTop=discreteFlip?originY:0,clipRight=discreteFlip?originX+g.columns*g.tileWidth:width_,clipBottom=discreteFlip?originY+g.rows*g.tileHeight:height_;std::vector<std::size_t> indexes;int left=clipRight,top=clipBottom,right=clipLeft,bottom=clipTop;
 for(std::size_t i=0;i<g.cells.size();++i){const int x=originX+int(i%g.columns)*g.tileWidth,y=originY+int(i/g.columns)*g.tileHeight;bool hit=false;for(int py=std::max({y,selection_->y,clipTop});!hit&&py<std::min({y+g.tileHeight,selection_->y+selection_->height,clipBottom});++py)for(int px=std::max({x,selection_->x,clipLeft});px<std::min({x+g.tileWidth,selection_->x+selection_->width,clipRight});++px)if(selectionContains(selection_,px,py)){hit=true;break;}if(hit){indexes.push_back(i);left=std::min(left,std::max(clipLeft,x));top=std::min(top,std::max(clipTop,y));right=std::max(right,std::min(clipRight,x+g.tileWidth));bottom=std::max(bottom,std::min(clipBottom,y+g.tileHeight));}}
 if(indexes.empty())return {};SelectionMask result{left,top,right-left,bottom-top,{}};result.mask.resize(std::size_t(result.width)*result.height);std::size_t count=0;for(const auto i:indexes){const int x=originX+int(i%g.columns)*g.tileWidth,y=originY+int(i/g.columns)*g.tileHeight;for(int py=std::max(clipTop,y);py<std::min(clipBottom,y+g.tileHeight);++py)for(int px=std::max(clipLeft,x);px<std::min(clipRight,x+g.tileWidth);++px){result.mask[std::size_t(py-top)*result.width+px-left]=1;++count;}}if(count==result.mask.size())result.mask.clear();return result;
}
bool Document::beginPaintCellMove(bool copy,bool keyboard){
 auto expanded=expandedPaintCellSelection();if(!expanded)return false;const auto target=timeline_.resolveSurface(cel().id);const auto& g=*target.source->tilemap;const auto bytes=std::uint64_t(g.cells.size())*1024+std::uint64_t(width_)*height_*4;if(bytes>256*1024*1024-adjustmentStorageBudget(timeline_,1))throw std::length_error("Paint selection move exceeds document budget");
 PaintCellMove move;move.layerId=layer().id;move.frameId=frame().id;move.celId=target.source->id;move.expanded=*expanded;move.beforeSelection=keyboard?selection_:expanded;move.copy=copy;
 for(std::size_t i=0;i<g.cells.size();++i){const int x=activeSurface().offsetX+int(i%g.columns)*g.tileWidth,y=activeSurface().offsetY+int(i/g.columns)*g.tileHeight;bool hit=false;for(int py=std::max(y,expanded->y);!hit&&py<std::min(y+g.tileHeight,expanded->y+expanded->height);++py)for(int px=std::max(x,expanded->x);px<std::min(x+g.tileWidth,expanded->x+expanded->width);++px)if(selectionContains(expanded,px,py)){hit=true;break;}if(hit)move.sources.push_back({i,g.cells[i],g.cells[i]});}
 paintCellMove_=std::move(move);selection_=std::move(expanded);return true;
}
void Document::updatePaintCellMove(int dx,int dy,bool clamp){
 if(!paintCellMove_)return;auto& move=*paintCellMove_;if(tileSelection_.mode!=tiles::Mode::Paint||layer().id!=move.layerId||frame().id!=move.frameId||layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer())||!tilemapCellOwnerSupported(cel().id,true,true)||timeline_.resolveSurface(cel().id).source->id!=move.celId)throw std::logic_error("Paint cell move target changed");const auto& g=*timeline_.findCelById(move.celId)->tilemap;
 int columns=int(std::floor(double(dx)/g.tileWidth+.5)),rows=int(std::floor(double(dy)/g.tileHeight+.5));if(clamp){columns=std::clamp(columns,int(std::ceil(double(activeSurface().offsetX-move.expanded.x)/g.tileWidth)),int(std::floor(double(activeSurface().offsetX+g.columns*g.tileWidth-move.expanded.x-move.expanded.width)/g.tileWidth)));rows=std::clamp(rows,int(std::ceil(double(activeSurface().offsetY-move.expanded.y)/g.tileHeight)),int(std::floor(double(activeSurface().offsetY+g.rows*g.tileHeight-move.expanded.y-move.expanded.height)/g.tileHeight)));}if(columns==move.columns&&rows==move.rows)return;
 std::map<std::size_t,std::optional<tiles::Cell>> original,updates;if(move.preview&&move.preview->tilemapPixels)for(const auto& c:move.preview->tilemapPixels->cells){original[c.index]=c.before;updates[c.index]=c.before;}
 auto baseline=[&](std::size_t i){const auto found=original.find(i);return found==original.end()?g.cells[i]:found->second;};
 if(!move.copy)for(const auto& c:move.sources)updates[c.index]={};for(const auto& c:move.sources){const auto x=std::int64_t(c.index%g.columns)+columns,y=std::int64_t(c.index/g.columns)+rows;if(x>=0&&y>=0&&x<g.columns&&y<g.rows)updates[std::size_t(y)*g.columns+std::size_t(x)]=c.before;}
 const int ox=columns*g.tileWidth,oy=rows*g.tileHeight;const auto& source=move.expanded;const std::optional<SelectionMask> sourceSelection{source};int left=width_,top=height_,right=0,bottom=0;for(int y=source.y;y<source.y+source.height;++y)for(int x=source.x;x<source.x+source.width;++x)if(selectionContains(sourceSelection,x,y)&&x+ox>=0&&y+oy>=0&&x+ox<width_&&y+oy<height_){left=std::min(left,x+ox);top=std::min(top,y+oy);right=std::max(right,x+ox+1);bottom=std::max(bottom,y+oy+1);}
 std::optional<SelectionMask> after;if(right>left&&bottom>top){SelectionMask shifted{left,top,right-left,bottom-top,{}};shifted.mask.resize(std::size_t(shifted.width)*shifted.height);std::size_t count=0;for(int y=top;y<bottom;++y)for(int x=left;x<right;++x)if(selectionContains(sourceSelection,x-ox,y-oy)){shifted.mask[std::size_t(y-top)*shifted.width+x-left]=1;++count;}if(count==shifted.mask.size())shifted.mask.clear();after=std::move(shifted);}
 TilemapPixelHistory apply,history;apply.celId=history.celId=move.celId;apply.tilesetEdit=history.tilesetEdit=false;apply.independentCellOwner=history.independentCellOwner=true;apply.cellOffsetLayout=history.cellOffsetLayout=true;apply.linkedCellOwner=history.linkedCellOwner=true;apply.beforeSet.id=history.beforeSet.id=layer().tilemapTilesetId;for(const auto& entry:updates){const auto before=baseline(entry.first);apply.cells.push_back({entry.first,g.cells[entry.first],entry.second});if(before!=entry.second)history.cells.push_back({entry.first,before,entry.second});}
 Edit edit{{},state_,nextState_};edit.pixelSelectionEdit=true;edit.beforePixelsSelection=move.beforeSelection;edit.afterPixelsSelection=after;edit.beforeTileSelection=edit.afterTileSelection=tileSelection_;edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeFrameAnchor=edit.afterFrameAnchor=frameAnchor_;edit.beforeGroupUi=edit.afterGroupUi=GroupUiSnapshot{selectedGroupIds_,collapsedGroupIds_,selectedGroupId_};edit.tilemapPixels=std::make_shared<const TilemapPixelHistory>(std::move(apply));
 auto retained=std::make_shared<Edit>(edit);retained->documentChanged=!history.cells.empty();if(retained->documentChanged)retained->tilemapPixels=std::make_shared<const TilemapPixelHistory>(std::move(history));else{retained->tilemapPixels.reset();retained->afterState=state_;}retained->label.reserve(32);history_.reserve(position_+1);applyEdit(edit,true);move.preview=std::move(retained);move.columns=columns;move.rows=rows;change_={0,0,width_,height_};publishChange();
}
bool Document::finishPaintCellMove(bool cancel){
 if(!paintCellMove_)return false;auto& move=*paintCellMove_;if(cancel){if(move.preview&&move.preview->tilemapPixels)applyEdit(*move.preview,false);selection_=move.beforeSelection;paintCellMove_.reset();change_={0,0,width_,height_};publishChange();return false;}
 if(tileSelection_.mode!=tiles::Mode::Paint||layer().id!=move.layerId||frame().id!=move.frameId)throw std::logic_error("Paint cell move target changed");auto edit=move.preview;const bool changed=edit&&edit->documentChanged;const bool selected=edit&&!selectionEqual(edit->beforePixelsSelection,edit->afterPixelsSelection);paintCellMove_.reset();if(edit&&(changed||selected))pushEdit(std::move(*edit),U"移动瓦片选区内容");return changed;
}
bool Document::nudgeSelectionContent(int dx,int dy,bool allFrameLayers){if(hasFreeTileContent())return false;if(layer().kind=="tilemap"&&tileSelection_.mode==tiles::Mode::Paint){if(allFrameLayers||paintCellMove_)return false;const auto expanded=expandedPaintCellSelection();if(!expanded)return false;const auto& g=*timeline_.resolveSurface(cel().id).source->tilemap;const int columns=std::clamp(int(std::floor(double(dx)/g.tileWidth+.5)),int(std::ceil(double(activeSurface().offsetX-expanded->x)/g.tileWidth)),int(std::floor(double(activeSurface().offsetX+g.columns*g.tileWidth-expanded->x-expanded->width)/g.tileWidth))),rows=std::clamp(int(std::floor(double(dy)/g.tileHeight+.5)),int(std::ceil(double(activeSurface().offsetY-expanded->y)/g.tileHeight)),int(std::floor(double(activeSurface().offsetY+g.rows*g.tileHeight-expanded->y-expanded->height)/g.tileHeight)));if(!columns&&!rows)return false;if(!beginPaintCellMove(false,true))return false;try{updatePaintCellMove(columns*g.tileWidth,rows*g.tileHeight,true);finishPaintCellMove();}catch(...){finishPaintCellMove(true);throw;}return true;}if(hasTilemapContent()&&!((floating_&&floating_->tilemap)||(!floating_&&!allFrameLayers&&tilemapSelectionTransformAvailable())||(floating_&&floating_->clipboard&&floating_->maskId.empty()&&layer().kind.empty()&&!layerEffectivelyLocked(layer()))))return false;
 if(!selection_||(!dx&&!dy))return false;
 if(!floating_)return beginSelectionContentMove(false,allFrameLayers,dx,dy);
 auto transform=floating_->transform;transform.x+=dx;transform.y+=dy;transformFloatingPaste(transform,floating_->rotSprite);return true;
}
void Document::prepareSelectionBoxMove(){if(floating_ && !floating_->clipboard)commitFloatingPaste();}
void Document::commitSelectionBox(std::optional<SelectionMask> before){if(selectionEqual(before,selection_))return;Edit e{{},state_,state_};e.documentChanged=false;e.pixelSelectionEdit=true;e.beforePixelsSelection=std::move(before);e.afterPixelsSelection=selection_;pushEdit(std::move(e),U"移动选框");}
void Document::moveFloatingPaste(int x,int y){if(!floating_)return;auto transform=floating_->transform;if(transform.width<1 || transform.height<1){transform.width=floating_->source.width;transform.height=floating_->source.height;}transform.x=x;transform.y=y;transformFloatingPaste(transform,floating_->rotSprite);}
void Document::transformFloatingPaste(const SelectionTransform& transform,bool rotSprite){
 if(!floating_)return;if(floating_->freeTile){const bool previous=floating_->rotSprite;floating_->rotSprite=rotSprite;try{transformFreeTileSelectionMove(transform);}catch(...){floating_->rotSprite=previous;throw;}return;}auto& f=*floating_;const auto bounds=checkedFloatingBounds(transform);if(f.tilemap&&(tileSelection_.mode!=f.tilemapMode||layer().id!=f.layerId||frame().id!=f.frameId||layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer())||(!tilemapDeltaSupported()&&!linkedCreateFloatingSupported(f)&&!linkedEditFloatingSupported(f)&&!linkedHybridFloatingSupported(f))))throw std::logic_error("Tilemap floating target changed");if(!f.maskId.empty()){transformMaskFloating(transform,rotSprite);return;}
 if(f.deferred){
  if(f.restoredFromDeselect){const auto old=f.transform;transformSparseFloatingPaste(transform,rotSprite);f.deferred=false;noteFloatingOverlayChange(f,old,transform);return;}
  const auto& target=f.targets.front();const auto r=timeline_.resolveSurface(target.celId);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface||(!target.ownerId.empty()&&r.source->id!=target.ownerId))throw std::logic_error("Floating overlay owner changed");
  const auto layerIt=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==r.source->layerId;});if(layerIt==timeline_.state().layers.end()||layerEffectivelyLocked(*layerIt))throw std::logic_error("Floating layer is locked");
  std::size_t extra=0;if(floatingSymmetryRotation(f,transform)&&(!target.symmetryRotation||!target.symmetryRotation->matches(transform,rotSprite)))floatingAddBytes(extra,std::uint64_t(std::min(floatingArea(bounds.width,bounds.height),floatingArea(width_,height_)))*(192+symmetryMatrices(f.symmetryAxes).size()*sizeof(SymmetryRotationWrite)*2));if(!floatingTranslation(transform,f.source))floatingAddBytes(extra,std::uint64_t(floatingArea(bounds.width,bounds.height))*192);if(rotSprite&&!target.rotSprite)floatingAddBytes(extra,std::uint64_t(target.source.pixels.size())*5+12*1024*1024);checkFloatingBudget(f,extra);auto selection=floatingSelectionMask(f,transform);auto sampler=target.rotSprite;if(rotSprite&&!sampler)sampler=std::make_shared<SelectionRotSpriteSource>(target.source);auto owner=r.source->id;auto rotation=target.symmetryRotation;if(floatingSymmetryRotation(f,transform)){if(!rotation||!rotation->matches(transform,rotSprite))rotation=symmetryContentRotation(target.source,*f.beforeSelection,transform,width_,height_,f.symmetryAxes,f.symmetryCenter,rotSprite,sampler.get());}else rotation.reset();
  noteFloatingOverlayChange(f,f.transform,transform);f.targets.front().ownerId.swap(owner);f.targets.front().rotSprite=std::move(sampler);f.targets.front().symmetryRotation=std::move(rotation);f.transform=transform;f.rotSprite=rotSprite;f.x=int(std::floor(transform.x));f.y=int(std::floor(transform.y));selection_=std::move(selection);return;
 }

 bool sparse=f.sparse;for(const auto& target:f.targets){const auto r=timeline_.resolveSurface(target.celId);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface)throw std::logic_error("Invalid floating owner");if(!target.ownerId.empty()&&target.ownerId!=r.source->id)throw std::logic_error("Floating owner changed");raster::validate(*r.surface);sparse=sparse||!raster::fullCanvas(*r.surface,width_,height_);}
 if(sparse){transformSparseFloatingPaste(transform,rotSprite);return;}
 const bool translation=floatingTranslation(transform,f.source);const auto destination=(floatingSymmetryTranslation(f,transform)||floatingSymmetryScale(f,transform)||floatingSymmetryRotation(f,transform))?std::size_t(width_)*height_:floatingDestinationArea(bounds,width_,height_);std::size_t extra=0,workspace=0;
 if(!translation){floatingAddBytes(extra,std::uint64_t(floatingArea(bounds.width,bounds.height))*192);floatingAddBytes(extra,std::uint64_t(f.source.pixels.size())*5);workspace=destination*192;}
 for(const auto& target:f.targets){const auto writes=std::min<std::uint64_t>(std::uint64_t(width_)*height_,std::uint64_t(target.source.pixels.size())+destination);floatingAddBytes(extra,writes*128);if(rotSprite&&!target.rotSprite)floatingAddBytes(extra,std::uint64_t(target.source.pixels.size())*5+12*1024*1024);}
 if(floatingSymmetryRotation(f,transform))floatingAddBytes(extra,std::uint64_t(std::min(floatingArea(bounds.width,bounds.height),floatingArea(width_,height_)))*(192+symmetryMatrices(f.symmetryAxes).size()*sizeof(SymmetryRotationWrite)*2));floatingAddBytes(extra,workspace);checkFloatingBudget(f,extra);auto selection=floatingSelectionMask(f,transform);
 struct Stage{std::size_t target;std::string owner;timeline::Surface* live=nullptr;std::unordered_map<std::size_t,Delta> preview;std::shared_ptr<SelectionRotSpriteSource> sampler;};std::vector<Stage> stages;stages.reserve(f.targets.size());
 for(std::size_t n=0;n<f.targets.size();++n){auto& target=f.targets[n];const auto r=timeline_.resolveSurface(target.celId);if(std::any_of(stages.begin(),stages.end(),[&](const auto& s){return s.owner==r.source->id;}))continue;
  const auto l=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& layer){return layer.id==r.source->layerId;});if(l==timeline_.state().layers.end()||layerEffectivelyLocked(*l))throw std::logic_error("Floating layer is locked");
  Stage stage{n,r.source->id};const auto& storage=r.surface->pixels;
  auto baseline=[&](std::size_t index){auto it=target.preview.find(index);return it==target.preview.end()?storage[index]:it->second.before;};
  auto read=[&](std::size_t index){auto it=stage.preview.find(index);return it==stage.preview.end()?baseline(index):it->second.after;};
  auto write=[&](int x,int y,Pixel value){if(translation&&f.tilemapEditCell){const auto& grid=*timeline_.resolveSurface(cel().id).source->tilemap;const auto anchor=*f.tilemapEditCell;const int left=int(anchor%grid.columns)*grid.tileWidth,top=int(anchor/grid.columns)*grid.tileHeight;if(x<left||y<top||x>=left+grid.tileWidth||y>=top+grid.tileHeight)return;}const auto index=std::size_t(y)*width_+x;if(read(index)==value)return;auto inserted=stage.preview.emplace(index,Delta{index,baseline(index),value});if(!inserted.second)inserted.first->second.after=value;};
  const auto& source=target.source;const auto& original=target.originalSource?*target.originalSource:source;
  if(!f.clipboard&&!f.copy)for(int row=0;row<original.height;++row)for(int col=0;col<original.width;++col){const auto i=std::size_t(row)*original.width+col;const auto px=std::int64_t(f.sourceX)+col,py=std::int64_t(f.sourceY)+row;if(original.mask[i]==1&&(!translation||floatingSymmetryTranslation(f,transform)||floatingSymmetryScale(f,transform)||floatingSymmetryRotation(f,transform)||(original.pixels[i]>>24))&&px>=0&&py>=0&&px<width_&&py<height_)write(int(px),int(py),0);}
  if(floatingSymmetryTranslation(f,transform)){symmetryContentTranslation(source,*f.beforeSelection,*f.symmetryStart,{int(transform.x)-f.sourceX,int(transform.y)-f.sourceY},width_,height_,f.symmetryAxes,f.symmetryCenter,[&](int x,int y,Pixel pixel){write(x,y,!f.copy&&selectionContains(f.beforeSelection,x,y)?pixel:brushComposite(baseline(std::size_t(y)*width_+x),pixel,100));});}
  else if(floatingSymmetryRotation(f,transform)){stage.sampler=target.rotSprite;if(rotSprite&&!stage.sampler)stage.sampler=std::make_shared<SelectionRotSpriteSource>(source);const auto rotationRaster=target.symmetryRotation&&target.symmetryRotation->matches(transform,rotSprite)?target.symmetryRotation:symmetryContentRotation(source,*f.beforeSelection,transform,width_,height_,f.symmetryAxes,f.symmetryCenter,rotSprite,stage.sampler.get());rotationRaster->each([&](int x,int y,Pixel pixel){write(x,y,!f.copy&&selectionContains(f.beforeSelection,x,y)?pixel:brushComposite(baseline(std::size_t(y)*width_+x),pixel,100));});}
  else if(floatingSymmetryScale(f,transform)){symmetryContentScale(source,*f.beforeSelection,transform,width_,height_,f.symmetryAxes,f.symmetryCenter,[&](int x,int y,Pixel pixel){write(x,y,!f.copy&&selectionContains(f.beforeSelection,x,y)?pixel:brushComposite(baseline(std::size_t(y)*width_+x),pixel,100));});}
  else if(translation){const int x=int(transform.x),y=int(transform.y);const auto left=std::max<std::int64_t>(0,-std::int64_t(x)),top=std::max<std::int64_t>(0,-std::int64_t(y)),right=std::min<std::int64_t>(source.width,std::int64_t(width_)-x),bottom=std::min<std::int64_t>(source.height,std::int64_t(height_)-y);
   for(auto row=top;row<bottom;++row)for(auto col=left;col<right;++col){const auto i=std::size_t(row)*source.width+std::size_t(col);if(source.mask[i]!=1||!(source.pixels[i]>>24))continue;const int px=int(std::int64_t(x)+col),py=int(std::int64_t(y)+row);write(px,py,brushComposite(read(std::size_t(py)*width_+px),source.pixels[i],100));}
  }else{stage.sampler=target.rotSprite;if(rotSprite&&!stage.sampler)stage.sampler=std::make_shared<SelectionRotSpriteSource>(source);const auto cells=rotSprite?rotSpriteSelectionCells(source,transform,width_,height_,*stage.sampler):fastSelectionTransformCells(source,transform,width_,height_);for(auto cell:cells)write(cell.x,cell.y,brushComposite(read(std::size_t(cell.y)*width_+cell.x),cell.value,100));}
  for(auto it=stage.preview.begin();it!=stage.preview.end();)if(it->second.before==it->second.after)it=stage.preview.erase(it);else ++it;stages.push_back(std::move(stage));
 }
 if(!f.tilemapPreview)for(auto& stage:stages){stage.live=timeline_.mutableOwnedSurface(stage.owner);if(!stage.live)throw std::logic_error("Missing floating install owner");}
 if(f.tilemapPreview){
  auto& g=*f.tilemapPreview;checkFloatingBudget(f,adjustmentStorageBudget(timeline_,1)+std::uint64_t(width_)*height_*4);auto next=g.tilemapBaseline;for(const auto& entry:stages.front().preview)next[entry.first]=entry.second.after;g.preview.swap(next);
  try{publishTilemapPreview(g);}catch(...){g.preview.swap(next);throw;}
 }
 change_={};for(auto& stage:stages){auto& target=f.targets[stage.target];if(!f.tilemapPreview){auto& storage=stage.live->pixels;for(const auto& item:target.preview){const auto& d=item.second;if(storage[d.index]!=d.before){storage[d.index]=d.before;change_.include(int(d.index%width_),int(d.index/width_));}}for(const auto& item:stage.preview){const auto& d=item.second;storage[d.index]=d.after;change_.include(int(d.index%width_),int(d.index/width_));}}target.preview.swap(stage.preview);target.ownerId.swap(stage.owner);if(!translation)target.rotSprite=std::move(stage.sampler);}
 f.restoredFromDeselect=false;f.rotSprite=rotSprite;f.transform=transform;f.x=int(std::floor(transform.x));f.y=int(std::floor(transform.y));selection_=std::move(selection);if(f.tilemapPreview){change_={0,0,width_,height_};++gradientRevision_;}publishChange();
}
bool Document::commitDeferredFloatingPaste(){
 auto& f=*floating_;if(floatingSymmetryTranslation(f,f.transform)||floatingSymmetryScale(f,f.transform)||floatingSymmetryRotation(f,f.transform)||!floatingTranslation(f.transform,f.source)){const auto old=f.transform;transformSparseFloatingPaste(f.transform,f.rotSprite);f.deferred=false;noteFloatingOverlayChange(f,old,f.transform);return commitSparseFloatingPaste();}
 auto& target=f.targets.front();const auto r=timeline_.resolveSurface(target.celId);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface||r.source->id!=target.ownerId)throw std::logic_error("Floating commit owner changed");const auto li=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==r.source->layerId;});if(li==timeline_.state().layers.end()||li->locked)throw std::logic_error("Floating layer is locked");const auto& before=*r.surface;raster::validate(before);
 const auto dx=std::int64_t(f.x)-f.sourceX,dy=std::int64_t(f.y)-f.sourceY;const bool zero=!f.copy&&!dx&&!dy;
 const bool whole=!f.copy&&!f.clipboard&&f.beforeSelection&&f.beforeSelection->mask.empty()&&f.sourceX<=before.offsetX&&f.sourceY<=before.offsetY&&std::int64_t(f.sourceX)+f.source.width>=std::int64_t(before.offsetX)+before.width&&std::int64_t(f.sourceY)+f.source.height>=std::int64_t(before.offsetY)+before.height;
 Edit edit{{},state_,nextState_};edit.beforeActive=edit.afterActive=f.layerId;edit.beforeFrame=edit.afterFrame=f.frameId;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.pixelSelectionEdit=true;edit.beforePixelsSelection=f.beforeSelection;edit.afterPixelsSelection=selection_;
 std::optional<timeline::Surface> candidate;bool changed=false,geometryChanged=false;
 if(!zero&&whole){const auto nx=raster::coordinate(std::int64_t(before.offsetX)+dx),ny=raster::coordinate(std::int64_t(before.offsetY)+dy);raster::coordinate(std::int64_t(nx)+before.width);raster::coordinate(std::int64_t(ny)+before.height);edit.ownerOffsets.push_back({target.ownerId,before.offsetX,before.offsetY,nx,ny});changed=true;}
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
   if(changed)edit.surfaceChanges.push_back({target.ownerId,before,*candidate});
  }
 }
 const bool selectionChanged=!selectionEqual(f.beforeSelection,selection_);edit.documentChanged=changed;if(!changed)edit.afterState=state_;checkFloatingBudget(f,0);capturePixelAddresses(edit);history_.reserve(position_+1);auto* live=timeline_.mutableOwnedSurface(target.ownerId);if(!live)throw std::logic_error("Missing floating commit owner");
 noteFloatingOverlayChange(f,f.transform,f.transform);
 if(changed||geometryChanged){if(!edit.ownerOffsets.empty()){live->offsetX=edit.ownerOffsets.front().afterX;live->offsetY=edit.ownerOffsets.front().afterY;}else std::swap(*live,*candidate);change_={0,0,width_,height_};publishChange();}
 floating_.reset();if(changed||selectionChanged)pushEdit(std::move(edit),U"变换选区内容");return changed;
}
bool Document::commitSparseFloatingPaste(){
 auto& f=*floating_;std::size_t extra=0;std::vector<const FloatingTarget*> changed;changed.reserve(f.targets.size());
 for(const auto& target:f.targets){if(!target.baseline)continue;const auto r=timeline_.resolveSurface(target.celId);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface||r.source->id!=target.ownerId)throw std::logic_error("Floating owner changed before commit");raster::validate(*r.surface);if(target.preview.empty())continue;floatingAddBytes(extra,convolutionSurfaceBytes(*target.baseline));floatingAddBytes(extra,convolutionSurfaceBytes(*r.surface));changed.push_back(&target);}
 if(f.beforeSelection)floatingAddBytes(extra,f.beforeSelection->mask.size());if(selection_)floatingAddBytes(extra,selection_->mask.size());checkFloatingBudget(f,extra);
 Edit e{{},state_,changed.empty()?state_:nextState_};e.documentChanged=!changed.empty();e.pixelSelectionEdit=true;e.beforePixelsSelection=f.beforeSelection;e.afterPixelsSelection=selection_;e.beforeActive=e.afterActive=f.layerId;e.beforeFrame=e.afterFrame=f.frameId;e.beforeSelection=e.afterSelection=selectedFrames_;e.beforeTimelineSelection=e.afterTimelineSelection=timelineSelection_;e.surfaceChanges.reserve(changed.size());
 for(const auto* target:changed)e.surfaceChanges.push_back({target->ownerId,*target->baseline,*timeline_.resolveSurface(target->celId).surface});
 const bool pixelsChanged=!changed.empty(),selectionChanged=!selectionEqual(f.beforeSelection,selection_);history_.reserve(position_+1);capturePixelAddresses(e);floating_.reset();if(pixelsChanged||selectionChanged)pushEdit(std::move(e),U"变换选区内容");return pixelsChanged;
}
std::optional<bool> Document::commitHybridCellFloating(){
 auto& f=*floating_;if(f.tilemapMode!=tiles::Mode::Hybrid||f.clipboard||!f.beforeSelection||!f.beforeSelection->mask.empty()||!floatingTranslation(f.transform,f.source)||f.targets.front().originalSource)return {};
 const auto& selected=*f.beforeSelection;const auto resolvedOwner=timeline_.resolveSurface(cel().id);const auto& grid=*resolvedOwner.source->tilemap;const auto& t=f.transform;
 if(selected.x%grid.tileWidth||selected.y%grid.tileHeight||selected.width%grid.tileWidth||selected.height%grid.tileHeight||int(t.x)%grid.tileWidth||int(t.y)%grid.tileHeight)return {};
 const auto dc=(std::int64_t(t.x)-selected.x)/grid.tileWidth,dr=(std::int64_t(t.y)-selected.y)/grid.tileHeight;
 checkFloatingBudget(f,std::uint64_t(grid.cells.size())*(sizeof(tiles::Cell)+256));
 // Legacy captureTilemapSelectionMove snapshots null cells and transformed refs.
 std::map<std::size_t,std::optional<tiles::Cell>> updates;
 for(std::size_t i=0;i<grid.cells.size();++i){const int x=int(i%grid.columns)*grid.tileWidth,y=int(i/grid.columns)*grid.tileHeight;if(x<selected.x||y<selected.y||std::int64_t(x)>=std::int64_t(selected.x)+selected.width||std::int64_t(y)>=std::int64_t(selected.y)+selected.height)continue;if(!f.copy)updates[i]=std::nullopt;}
 for(std::size_t i=0;i<grid.cells.size();++i){const int x=int(i%grid.columns)*grid.tileWidth,y=int(i/grid.columns)*grid.tileHeight;if(x<selected.x||y<selected.y||std::int64_t(x)>=std::int64_t(selected.x)+selected.width||std::int64_t(y)>=std::int64_t(selected.y)+selected.height)continue;const auto col=std::int64_t(i%grid.columns)+dc,row=std::int64_t(i/grid.columns)+dr;if(col>=0&&row>=0&&col<grid.columns&&row<grid.rows)updates[std::size_t(row)*grid.columns+std::size_t(col)]=grid.cells[i];}
 bool changed=false;TilemapPixelHistory payload;payload.celId=resolvedOwner.source->id;payload.tilesetEdit=false;payload.independentCellOwner=f.linkedHybrid;payload.linkedCellOwner=f.linkedHybrid;payload.beforeSet.id=layer().tilemapTilesetId;
 // Include equal refs in the apply set to replace transient RGBA pixels with exact rendered cells.
 for(const auto& entry:updates){changed=changed||grid.cells[entry.first]!=entry.second;payload.cells.push_back({entry.first,grid.cells[entry.first],entry.second});}
 Edit edit{{},state_,changed?nextState_:state_};edit.documentChanged=changed;edit.pixelSelectionEdit=true;edit.beforePixelsSelection=f.beforeSelection;edit.afterPixelsSelection=selection_;
 if(changed){edit.tilemapPixels=std::make_shared<const TilemapPixelHistory>(std::move(payload));edit.beforeTileSelection=edit.afterTileSelection=tileSelection_;edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeFrameAnchor=edit.afterFrameAnchor=frameAnchor_;edit.beforeGroupUi=edit.afterGroupUi=GroupUiSnapshot{selectedGroupIds_,collapsedGroupIds_,selectedGroupId_};}
 const bool selectionChanged=!selectionEqual(f.beforeSelection,selection_);history_.reserve(position_+1);edit.label.reserve(32);
 // Deferred compositor pixels never touched the cache; dense preview is replaced by exact cell patches.
 if(changed)applyEdit(edit,true);else if(!f.deferred){auto* live=timeline_.mutableOwnedSurface(f.targets.front().ownerId);if(!live)throw std::logic_error("Missing Hybrid floating owner");for(const auto& entry:f.targets.front().preview)live->pixels[entry.first]=entry.second.before;}
 if(f.deferred)noteFloatingOverlayChange(f,f.transform,f.transform);auto pending=std::move(floating_);floating_.reset();change_={0,0,width_,height_};publishChange();if(changed||selectionChanged)pushEdit(std::move(edit),U"变换选区内容");return changed;
}
bool Document::commitTilemapFloating(){
 auto& f=*floating_;if(tileSelection_.mode!=f.tilemapMode||layer().id!=f.layerId||frame().id!=f.frameId||layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer())||(!tilemapDeltaSupported()&&!linkedCreateFloatingSupported(f)&&!linkedEditFloatingSupported(f)&&!linkedHybridFloatingSupported(f))||!raster::fullCanvas(activeSurface(),width_,height_)||f.targets.size()!=1)throw std::logic_error("Tilemap floating target changed");
 if(const auto cellMove=commitHybridCellFloating())return *cellMove;
 if(f.deferred){const auto transform=f.transform;const bool rotSprite=f.rotSprite;f.deferred=false;try{transformFloatingPaste(transform,rotSprite);}catch(...){f.deferred=true;throw;}noteFloatingOverlayChange(f,transform,transform);}
 checkFloatingBudget(f,std::uint64_t(width_)*height_*8+(f.beforeSelection?f.beforeSelection->mask.size():0)+(selection_?selection_->mask.size():0));
 auto after=f.tilemapPreview?f.tilemapPreview->preview:canvasPixels(),before=f.tilemapPreview?f.tilemapPreview->tilemapBaseline:after;for(const auto& entry:f.targets.front().preview)before[entry.first]=entry.second.before;
 const auto beforeSelection=f.beforeSelection,afterSelection=selection_;const auto editCell=f.tilemapEditCell;const bool selectionChanged=!selectionEqual(beforeSelection,afterSelection);
 Edit selectionEdit{{},state_,state_};if(selectionChanged){selectionEdit.documentChanged=false;selectionEdit.pixelSelectionEdit=true;selectionEdit.beforePixelsSelection=beforeSelection;selectionEdit.afterPixelsSelection=afterSelection;selectionEdit.label.reserve(16);}history_.reserve(position_+1);
 const bool sharedPreview=bool(f.tilemapPreview);auto pending=std::move(floating_);floating_.reset();if(sharedPreview)++gradientRevision_;bool changed=false;
 timeline::Surface* hybridRaw=nullptr;if(pending->tilemapMode==tiles::Mode::Hybrid){hybridRaw=timeline_.mutableOwnedSurface(pending->targets.front().ownerId);if(!hybridRaw){floating_=std::move(pending);throw std::logic_error("Missing Hybrid floating owner");}for(const auto& entry:pending->targets.front().preview)hybridRaw->pixels[entry.first]=entry.second.before;}
 try{changed=commitTilemapPixelCanvas(before,after,U"变换选区内容",editCell,false,&beforeSelection,&afterSelection,false,false,false,pending->linkedCreate,pending->linkedEdit,pending->linkedHybrid);if(!changed&&selectionChanged)pushEdit(std::move(selectionEdit),U"变换选区内容");}
 catch(...){if(hybridRaw)for(const auto& entry:pending->targets.front().preview)hybridRaw->pixels[entry.first]=entry.second.after;floating_=std::move(pending);throw;}
 if(hybridRaw){change_={0,0,width_,height_};publishChange();}
 if(sharedPreview){change_={0,0,width_,height_};publishChange();}return changed;
}
bool Document::commitFloatingPaste(){
 if(!floating_)return false;if(floating_->freeTile)return commitFreeTileSelectionMove();if(floating_->tilemap)return commitTilemapFloating();if(floating_->restoredFromDeselect){floating_.reset();return false;}if(!floating_->maskId.empty())return commitMaskFloating();if(floating_->deferred)return commitDeferredFloatingPaste();if(floating_->sparse&&!floating_->beforeCelTimeline)return commitSparseFloatingPaste();auto& f=*floating_;
 for(const auto& target:f.targets)if(!target.ownerId.empty()){const auto r=timeline_.resolveSurface(target.celId);if(r.issue!=timeline::LinkIssue::None||!r.source||r.source->id!=target.ownerId)throw std::logic_error("Floating commit owner changed");}
 std::size_t extra=0;if(f.beforeSelection)floatingAddBytes(extra,f.beforeSelection->mask.size());if(selection_)floatingAddBytes(extra,selection_->mask.size());
 if(f.beforeCelTimeline)floatingAddBytes(extra,adjustmentStorageBudget(timeline_,1));else for(const auto& target:f.targets)floatingAddBytes(extra,std::uint64_t(target.preview.size())*sizeof(Delta));checkFloatingBudget(f,extra);
 Edit e{{},state_,nextState_};e.beforeActive=e.afterActive=f.layerId;e.beforeFrame=e.afterFrame=f.frameId;e.pixelSelectionEdit=true;e.beforePixelsSelection=f.beforeSelection;e.afterPixelsSelection=selection_;
 if(f.beforeCelTimeline){e.afterTimeline=timeline_.state();e.beforeTimelineSelection=e.afterTimelineSelection=f.beforeTimelineSelection;e.beforeSelection=e.afterSelection=f.beforeSelectedFrames;history_.reserve(position_+1);e.beforeTimeline=std::move(f.beforeCelTimeline);floating_.reset();pushEdit(std::move(e),U"变换选区内容");return true;}
 for(const auto& target:f.targets){Edit child{{},state_,nextState_};child.targetCelId=target.celId;for(const auto& item:target.preview){const auto& delta=item.second;if(delta.before!=delta.after)child.pixels.push_back(delta);}if(!child.pixels.empty())e.children.push_back(std::move(child));}
 const bool pixelsChanged=!e.children.empty(),selectionChanged=!selectionEqual(f.beforeSelection,selection_);if(!pixelsChanged){e.documentChanged=false;e.afterState=state_;}
 if(e.children.size()==1){e.targetCelId=e.children.front().targetCelId;e.pixels=std::move(e.children.front().pixels);e.children.clear();}
 capturePixelAddresses(e);history_.reserve(position_+1);floating_.reset();if(pixelsChanged||selectionChanged)pushEdit(std::move(e),U"变换选区内容");return pixelsChanged;
}
void Document::cancelFloatingPaste(){
 if(!floating_)return;if(floating_->restoredFromDeselect){floating_.reset();return;}auto& f=*floating_;if(!f.maskId.empty()){cancelMaskFloating();return;}if(f.deferred){noteFloatingOverlayChange(f,f.transform,f.transform);selection_=std::move(f.beforeSelection);floating_.reset();return;}
 if(f.beforeCelTimeline){std::size_t extra=0;for(const auto& cel:f.beforeCelTimeline->cels)if(cel.surface)floatingAddBytes(extra,convolutionSurfaceBytes(*cel.surface));checkFloatingBudget(f,extra);timeline::Timeline restored(*f.beforeCelTimeline);timeline_=std::move(restored);timelineSelection_=std::move(f.beforeTimelineSelection);selectedFrames_=std::move(f.beforeSelectedFrames);activeLayerId_=std::move(f.layerId);activeFrameId_=std::move(f.frameId);selection_=std::move(f.beforeSelection);floating_.reset();change_={0,0,width_,height_};publishChange();return;}
 if(f.tilemapPreview){for(const auto& target:f.targets){const auto r=timeline_.resolveSurface(target.celId);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface||(!target.ownerId.empty()&&r.source->id!=target.ownerId))throw std::logic_error("Floating cancel owner changed");}selection_=std::move(f.beforeSelection);floating_.reset();++gradientRevision_;change_={0,0,width_,height_};publishChange();return;}
 struct Restore{FloatingTarget* target;timeline::Surface* live;};std::vector<Restore> restore;restore.reserve(f.targets.size());
 for(auto& target:f.targets){if(f.sparse&&!target.baseline)continue;const auto r=timeline_.resolveSurface(target.celId);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface||(!target.ownerId.empty()&&r.source->id!=target.ownerId))throw std::logic_error("Floating cancel owner changed");auto* live=timeline_.mutableOwnedSurface(r.source->id);if(!live)throw std::logic_error("Missing floating cancel owner");restore.push_back({&target,live});}
 change_={};for(auto& item:restore){auto& target=*item.target;if(f.sparse){std::swap(*item.live,*target.baseline);change_={0,0,width_,height_};}else for(const auto& entry:target.preview){const auto& delta=entry.second;if(item.live->pixels[delta.index]!=delta.before){item.live->pixels[delta.index]=delta.before;change_.include(int(delta.index%width_),int(delta.index/width_));}}}
 const bool sharedPreview=bool(f.tilemapPreview);selection_=std::move(f.beforeSelection);floating_.reset();if(sharedPreview){++gradientRevision_;change_={0,0,width_,height_};}publishChange();
}

}



namespace moon {
void Document::setImportedProjectBrushes(std::vector<ProjectBrushResource> brushes){std::set<std::string> ids;for(const auto& resource:brushes){const auto& b=resource.brush;if(resource.metadata.id.empty()||!ids.insert(resource.metadata.id).second||b.width<1||b.height<1||std::uint64_t(b.width)*b.height>16*1024*1024||b.coverage.size()!=std::size_t(b.width)*b.height||(!b.colors.empty()&&b.colors.size()!=b.coverage.size()))throw std::invalid_argument("Invalid imported project brush");}projectBrushes_=std::move(brushes);}
bool Document::deleteProjectBrush(const std::string& id){auto item=std::find_if(projectBrushes_.begin(),projectBrushes_.end(),[&](const auto& brush){return brush.metadata.id==id;});if(item==projectBrushes_.end())return false;projectBrushes_.erase(item);modified_=true;state_=nextState_++;++revision_;++contentRevision_;return true;}
}




namespace moon {
void Document::projectActiveCelOpacities(){for(auto& l:timeline_.state_.layers)l.opacity=frameCelOpacity(timeline_,l,activeFrameId_);}
bool Document::beginCelProperties(const std::string& id,const std::vector<std::string>& frozen){commitCelProperties();commitFloatingPaste();cancelStroke();cancelLayerOpacity();const auto* c=timeline_.findCelById(id);if(!c)return false;auto r=timeline_.resolveSurface(id);if(r.issue!=timeline::LinkIssue::None||!r.source)return false;celPropertyPreview_=CelPropertyPreview{identity_,c->layerId,c->frameId,frozen.empty()?std::vector<std::string>{id}:frozen,{}};return true;}
bool Document::previewCelProperties(double opacity,double z){if(!celPropertyPreview_||celPropertyPreview_->identity!=identity_)return false;auto& p=*celPropertyPreview_;auto plan=planCelProperties(timeline_,p.layerId,p.frameId,opacity,z,p.targets);if(!plan.changed())return false;p.steps.push_back(std::move(plan));try{applyCelPropertiesPlan(timeline_.state_,p.steps.back(),true);timeline_.invalidateCompositeOrder();}catch(...){p.steps.pop_back();throw;}projectActiveCelOpacities();change_={0,0,width_,height_};publishChange();return true;}
void Document::commitCelProperties(){if(!celPropertyPreview_)return;if(celPropertyPreview_->identity!=identity_||celPropertyPreview_->steps.empty()){celPropertyPreview_.reset();return;}Edit e{{},state_,nextState_};e.children.reserve(celPropertyPreview_->steps.size());history_.reserve(position_+1);for(auto& p:celPropertyPreview_->steps){Edit child{{},state_,nextState_};child.celProperties=std::move(p);e.children.push_back(std::move(child));}celPropertyPreview_.reset();if(e.children.size()==1){auto child=std::move(e.children.front());pushEdit(std::move(child),U"修改单元格属性");}else pushEdit(std::move(e),U"修改单元格属性");}
void Document::cancelCelProperties(){if(!celPropertyPreview_)return;auto p=std::move(*celPropertyPreview_);celPropertyPreview_.reset();if(p.identity!=identity_||p.steps.empty())return;for(auto i=p.steps.rbegin();i!=p.steps.rend();++i)applyCelPropertiesPlan(timeline_.state_,*i,false);timeline_.invalidateCompositeOrder();projectActiveCelOpacities();change_={0,0,width_,height_};publishChange();}
void Document::applyCelPropertiesEdit(const Edit& e,bool forward){if(!e.celProperties)return;applyCelPropertiesPlan(timeline_.state_,*e.celProperties,forward);timeline_.invalidateCompositeOrder();projectActiveCelOpacities();change_={0,0,width_,height_};}
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

#include "document_slices.cpp"
