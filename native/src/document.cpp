#include "document.h"
#include <set>
#include "sprite_sheet_import.h"
#include "palette_extraction.h"
#include "layer_compositor.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace moon {
void PixelRegion::include(int px,int py) {
  if(empty()) {x=px;y=py;w=h=1;return;}
  const int right=std::max(x+w,px+1),bottom=std::max(y+h,py+1);
  x=std::min(x,px);y=std::min(y,py);w=right-x;h=bottom-y;
}
Document::Document(int w,int h,std::size_t maxBytes,std::size_t maxEntries)
  : width_(w),height_(h),maxBytes_(maxBytes),maxEntries_(std::clamp<std::size_t>(maxEntries,1,10000)) {
  static std::uint64_t nextIdentity=0;identity_=++nextIdentity;
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
  activeLayerId_=initial.layers.front().id;activeFrameId_=initial.frames.front().id;timeline_=timeline::Timeline(std::move(initial));
}
Document Document::withBuiltinPalette() {
  // Exact colors/order from legacy/palettes/pixel-core-32.palette.json.
  // User requests this preset for new native documents; no history transaction.
  static constexpr Pixel colors[]{0xffffffffu,0xffeae0d9u,0xffb8a79au,0xff75655bu,0xff40342du,0xff1c1511u,0xffb5ebffu,0xff5dc9f4u,0xff2b8ed9u,0xff244fa9u,0xff252a6eu,0xffb8b3ffu,0xff675be9u,0xff4a2db5u,0xff3c1e6eu,0xffffb4d8u,0xffd86195u,0xff9d3556u,0xff6b262eu,0xffffe3b7u,0xffe8b553u,0xffb77328u,0xff7a431eu,0xffc8f1b8u,0xff7ac755u,0xff578b2eu,0xff4b5b1fu,0xfff2f2f2u,0xffccc1b9u,0xff918074u,0xff5a4a3fu,0xff332620u};
  Document result;auto& palette=result.palette_;
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
Document Document::fromImported(int width,int height,timeline::State state,PaletteState palette,
  std::string projectId,std::u32string name,std::shared_ptr<const std::vector<std::uint8_t>> sourceArchive) {
  // Build and validate a candidate before the caller replaces its active session.
  if(projectId.empty() || !sourceArchive || state.layers.empty() || state.frames.empty() || state.cels.size()!=state.layers.size()*state.frames.size())
    throw std::invalid_argument("Unsupported imported document structure");
  timeline::Timeline validated(std::move(state));
  if(!validated.diagnoseLinks().empty())throw std::invalid_argument("Invalid imported cel link");
  for(const auto& f:validated.state().frames)if(f.disabled)throw std::invalid_argument("Disabled frame not editable");
  for(const auto& cel:validated.state().cels){const auto resolved=validated.resolveSurface(cel.id);const auto* surface=resolved.surface;
    if(cel.zIndex!=0 || (cel.opacity && *cel.opacity!=1) || !surface || surface->width!=width || surface->height!=height || surface->offsetX || surface->offsetY || surface->storageOriginX.value_or(0) || surface->storageOriginY.value_or(0))throw std::invalid_argument("Imported surface needs unsupported editing semantics");}
  Document result(width,height);result.timeline_=std::move(validated);result.activeLayerId_=result.timeline_.state().layers.front().id;result.activeFrameId_=result.timeline_.state().frames.front().id;result.palette_=std::move(palette);
  result.projectId_=std::move(projectId);result.name_=std::move(name);result.sourceArchive_=std::move(sourceArchive);
  return result;
}
int floorDivide(int value, int scale) {
  if (scale <= 0) throw std::invalid_argument("Scale must be positive");
  return static_cast<int>(std::floor(static_cast<double>(value) / scale));
}
std::size_t Document::activeLayerIndex() const {
 const auto& layers=timeline_.state().layers;const auto it=std::find_if(layers.begin(),layers.end(),[&](const auto& l){return l.id==activeLayerId_;});
 if(it==layers.end())throw std::logic_error("Missing active layer");return std::size_t(it-layers.begin());
}
void Document::selectLayer(const std::string& id) {
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();if(std::none_of(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==id;}))return;activeLayerId_=id;
}
std::size_t Document::activeFrameIndex() const {
 const auto& frames=timeline_.state().frames;const auto it=std::find_if(frames.begin(),frames.end(),[&](const auto& f){return f.id==activeFrameId_;});if(it==frames.end())throw std::logic_error("Missing active frame");return std::size_t(it-frames.begin());
}
void Document::selectFrame(const std::string& id) {
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();if(id==activeFrameId_ || std::none_of(timeline_.state().frames.begin(),timeline_.state().frames.end(),[&](const auto& f){return f.id==id;}))return;
 activeFrameId_=id;change_={0,0,width_,height_};publishChange();
}
void Document::selectFrameHeader(const std::string& id,int mode,bool preserve){if(std::none_of(timeline_.state().frames.begin(),timeline_.state().frames.end(),[&](const auto& f){return f.id==id;}))return;const auto& frames=timeline_.state().frames;if(mode==2 && !frameAnchor_.empty()){int a=-1,b=-1;for(int i=0;i<int(frames.size());++i){if(frames[i].id==frameAnchor_)a=i;if(frames[i].id==id)b=i;}if(a>=0 && b>=0){selectedFrames_.clear();for(int i=std::min(a,b);i<=std::max(a,b);++i)selectedFrames_.push_back(frames[i].id);}}else if(mode==1){auto it=std::find(selectedFrames_.begin(),selectedFrames_.end(),id);if(it==selectedFrames_.end())selectedFrames_.push_back(id);else selectedFrames_.erase(it);std::sort(selectedFrames_.begin(),selectedFrames_.end(),[&](const auto& a,const auto& b){return std::find_if(frames.begin(),frames.end(),[&](const auto& f){return f.id==a;})<std::find_if(frames.begin(),frames.end(),[&](const auto& f){return f.id==b;});});}else selectedFrames_={id};if(mode!=1 || frameAnchor_.empty())frameAnchor_=id;if(!preserve)selectFrame(id);}
void Document::moveSelectedFrames(const std::string& target,bool after){cancelStroke();cancelLayerOpacity();timeline::State previous;previous.frames=timeline_.state().frames;previous.loopSections=timeline_.state().loopSections;auto selected=selectedFrames_.empty()?std::vector<std::string>{frame().id}:selectedFrames_;auto has=[&](const auto& id){return std::find(selected.begin(),selected.end(),id)!=selected.end();};std::vector<DocumentFrame> moving,remaining;std::vector<std::string> movingIds;int targetOriginal=-1,movingStart=100000,movingEnd=-1;for(int i=0;i<int(previous.frames.size());++i){const auto& f=previous.frames[i];if(f.id==target)targetOriginal=i;if(has(f.id)){moving.push_back(f);movingIds.push_back(f.id);movingStart=std::min(movingStart,i);movingEnd=i;}else remaining.push_back(f);}if(targetOriginal<0 || moving.empty())return;auto targetIt=std::find_if(remaining.begin(),remaining.end(),[&](const auto& f){return f.id==target;});int insertion=targetIt!=remaining.end()?int(targetIt-remaining.begin())+(after?1:0):int(std::count_if(previous.frames.begin(),previous.frames.begin()+targetOriginal,[&](const auto& f){return !has(f.id);}));int side=has(target)?(after?1:-1):targetOriginal==movingStart-1 && after?-1:targetOriginal==movingEnd+1 && !after?1:0;auto reordered=remaining;reordered.insert(reordered.begin()+insertion,moving.begin(),moving.end());auto loops=timeline::reconcileLoopsReorder(previous,remaining,reordered,movingIds,insertion,side);bool same=previous.frames.size()==reordered.size() && previous.loopSections.size()==loops.size();for(std::size_t i=0;i<previous.frames.size() && same;++i)same=previous.frames[i].id==reordered[i].id;for(std::size_t i=0;i<loops.size() && same;++i)same=previous.loopSections[i].startFrameId==loops[i].startFrameId && previous.loopSections[i].endFrameId==loops[i].endFrameId;if(same)return;Edit e{{},state_,nextState_};captureFrameOrder(e,false);e.beforeLoops=previous.loopSections;e.beforeSelection=selectedFrames_;timeline_.state_.frames=std::move(reordered);timeline_.state_.loopSections=std::move(loops);selectedFrames_=movingIds;timeline_.buildIndex();captureFrameOrder(e,true);e.afterLoops=timeline_.state().loopSections;e.afterSelection=selectedFrames_;change_={0,0,width_,height_};publishChange();pushEdit(std::move(e));}
void Document::groupEdits(std::size_t start,const std::vector<std::string>& selection){if(start>=position_)return;Edit group{{},history_[start].beforeState,history_[position_-1].afterState};group.beforeSelection=selection;group.afterSelection=selectedFrames_;for(std::size_t i=start;i<position_;++i){historyBytes_-=history_[i].bytes();group.children.push_back(std::move(history_[i]));}history_.resize(start);history_.push_back(std::move(group));position_=history_.size();historyBytes_+=history_.back().bytes();while((historyBytes_>maxBytes_ && position_>1) || history_.size()>maxEntries_){historyBytes_-=history_.front().bytes();history_.erase(history_.begin());--position_;}}
bool Document::copySelectedFrames(){ frameClipboard_.clear(); const auto ids=selectedFrames_.empty()?std::vector<std::string>{frame().id}:selectedFrames_; for(const auto& id:ids){auto fit=std::find_if(timeline_.state().frames.begin(),timeline_.state().frames.end(),[&](const auto& f){return f.id==id;}); if(fit==timeline_.state().frames.end())continue; FrameClipboardItem item; item.frame=*fit; for(const auto& c:timeline_.state().cels) if(c.frameId==id) item.cels.push_back(c); std::unordered_set<std::string> localIds; for(const auto& c:item.cels)localIds.insert(c.id); for(auto& c:item.cels){if(c.linkedCelId && !localIds.count(*c.linkedCelId)){auto resolved=timeline_.resolveSurface(c.id);if(resolved.surface)c.surface=*resolved.surface;c.linkedCelId.reset();}c.runtimeSharedCelId.reset();} frameClipboard_.push_back(std::move(item)); } return !frameClipboard_.empty(); }
bool Document::pasteCopiedFrames(){ cancelStroke(); cancelLayerOpacity(); if(frameClipboard_.empty())return false; Edit e{{},state_,nextState_}; captureFrameOrder(e,false); e.beforeLoops=timeline_.state().loopSections; std::vector<std::string> pasted; int insert=int(activeFrameIndex())+1; for(const auto& source:frameClipboard_){DocumentFrame f=source.frame; do{f.id="frame-native-"+std::to_string(identity_)+"-"+std::to_string(++nextFrameId_);}while(std::any_of(timeline_.state().frames.begin(),timeline_.state().frames.end(),[&](const auto& x){return x.id==f.id;})); std::unordered_map<std::string,std::string> remap; for(const auto& c:source.cels) remap[c.id]="cel-"+std::to_string(identity_)+"-"+std::to_string(++nextFrameId_); for(auto c:source.cels){c.id=remap[c.id];c.frameId=f.id;if(c.linkedCelId){auto it=remap.find(*c.linkedCelId);if(it!=remap.end())c.linkedCelId=it->second;else c.linkedCelId.reset();}c.runtimeSharedCelId.reset();if(c.surface)c.surface=*c.surface;e.detachedCels.push_back(std::move(c));} timeline_.state_.frames.insert(timeline_.state_.frames.begin()+insert++,f); pasted.push_back(f.id); } timeline_.state_.cels.insert(timeline_.state_.cels.end(),e.detachedCels.begin(),e.detachedCels.end()); timeline_.buildIndex(); activeFrameId_=pasted.back(); selectedFrames_=pasted; frameAnchor_=pasted.front(); captureFrameOrder(e,true); e.afterLoops=timeline_.state().loopSections; change_={0,0,width_,height_}; publishChange(); pushEdit(std::move(e)); return true; }
void Document::deleteSelectedFrames(){const auto selection=selectedFrames_;auto ids=selection.empty()?std::vector<std::string>{frame().id}:selection;if(ids.size()>=timeline_.state().frames.size())return;const auto start=position_;groupingHistory_=true;for(const auto& id:ids){selectFrame(id);deleteFrame();}selectedFrames_.clear();groupingHistory_=false;groupEdits(start,selection);}
std::string Document::createLoopSection(std::optional<timeline::LoopSection> draft){auto ids=selectedFrames_.empty()?std::vector<std::string>{frame().id}:selectedFrames_;int left=100000,right=-1;for(int i=0;i<int(timeline_.state().frames.size());++i)if(std::find(ids.begin(),ids.end(),timeline_.state().frames[i].id)!=ids.end()){left=std::min(left,i);right=i;}if(right<0)return {};timeline::LoopSection section;section.id="loop-native-"+std::to_string(identity_)+"-"+std::to_string(nextState_);int n=1;for(;;++n){const auto text="Loop "+std::to_string(n);section.name=U"循环节 "+std::u32string(text.begin()+5,text.end());if(std::none_of(timeline_.state().loopSections.begin(),timeline_.state().loopSections.end(),[&](const auto& s){return s.name==section.name;}))break;}section.startFrameId=timeline_.state().frames[left].id;section.endFrameId=timeline_.state().frames[right].id;if(draft){const auto generatedId=section.id;section=*draft;section.id=generatedId;const auto r=timeline::loopRange(timeline_.state(),section);if(r.start<0 || r.end<0)return {};section.startFrameId=timeline_.state().frames[r.start].id;section.endFrameId=timeline_.state().frames[r.end].id;}Edit e{{},state_,nextState_};e.beforeLoops=timeline_.state().loopSections;timeline_.state_.loopSections.push_back(section);e.afterLoops=timeline_.state().loopSections;pushEdit(std::move(e));return section.id;}
void Document::updateLoopSection(timeline::LoopSection section){cancelStroke();const auto r=timeline::loopRange(timeline_.state(),section);if(r.start<0 || r.end<0)return;section.startFrameId=timeline_.state().frames[r.start].id;section.endFrameId=timeline_.state().frames[r.end].id;if(section.name.empty())section.name=U"Loop";if(section.name.size()>64)section.name.resize(64);if(section.repeatCount)section.repeatCount=std::clamp(*section.repeatCount,1,9999);auto it=std::find_if(timeline_.state_.loopSections.begin(),timeline_.state_.loopSections.end(),[&](const auto& s){return s.id==section.id;});if(it==timeline_.state_.loopSections.end())return;Edit e{{},state_,nextState_};e.beforeLoops=timeline_.state().loopSections;*it=std::move(section);e.afterLoops=timeline_.state().loopSections;pushEdit(std::move(e));}
void Document::deleteLoopSection(const std::string& id){auto& loops=timeline_.state_.loopSections;if(std::none_of(loops.begin(),loops.end(),[&](const auto& s){return s.id==id;}))return;Edit e{{},state_,nextState_};e.beforeLoops=loops;loops.erase(std::remove_if(loops.begin(),loops.end(),[&](const auto& s){return s.id==id;}),loops.end());e.afterLoops=loops;pushEdit(std::move(e));}
void Document::captureFrameOrder(Edit& e,bool after) const {auto& order=after?e.afterFrames:e.beforeFrames;for(const auto& f:timeline_.state().frames)order.push_back(f.id);(after?e.afterFrame:e.beforeFrame)=activeFrameId_;}
void Document::addFrame(bool duplicate) {
 commitFloatingPaste();
 cancelStroke();cancelLayerOpacity();if(timeline_.state().frames.size()>=10000 || std::uint64_t(width_)*height_*timeline_.state().layers.size()*(timeline_.state().frames.size()+1)*4>256*1024*1024)throw std::runtime_error("Frame pixel memory limit reached");
 Edit e{{},state_,nextState_};captureFrameOrder(e,false);e.beforeLoops=timeline_.state().loopSections;const auto previousFrames=timeline_.state().frames;DocumentFrame f;do{f.id="frame-native-"+std::to_string(identity_)+"-"+std::to_string(++nextFrameId_);}while(std::any_of(timeline_.state().frames.begin(),timeline_.state().frames.end(),[&](const auto& old){return old.id==f.id;}));f.duration=duplicate?frame().duration:100;
 for(const auto& l:timeline_.state().layers){DocumentCel c;if(duplicate){c=*timeline_.resolveSurface(timeline_.findCel(l.id,frame().id)->id).source;c.linkedCelId.reset();c.runtimeSharedCelId.reset();}else{timeline::Surface surface;surface.width=width_;surface.height=height_;surface.pixels.resize(std::size_t(width_)*height_);c.surface=std::move(surface);c.opacity=1;}if(l.autoLinkAnimationCels){const auto* slot=timeline_.findCel(l.id,frame().id);const auto source=timeline_.resolveSurface(slot->id);
 if(source.source && source.surface && (slot->linkedCelId || std::any_of(source.surface->pixels.begin(),source.surface->pixels.end(),[](Pixel p){return (p>>24)!=0;}))){c.linkedCelId=source.source->id;c.runtimeSharedCelId.reset();c.surface.reset();c.opacity=source.source->opacity;c.zIndex=source.source->zIndex;}}
 c.id="cel-"+l.id+"-"+f.id;c.layerId=l.id;c.frameId=f.id;e.detachedCels.push_back(std::move(c));}
 e.detachedFrame=f;for(auto& section:timeline_.state_.loopSections){timeline::State old;old.frames=previousFrames;const auto r=timeline::loopRange(old,section);if(r.end>=0 && previousFrames[r.end].id==frame().id){if(section.endFrameId==frame().id)section.endFrameId=f.id;else if(section.startFrameId==frame().id)section.startFrameId=f.id;}}e.afterLoops=timeline_.state().loopSections;const auto index=activeFrameIndex()+1;timeline_.state_.frames.insert(timeline_.state_.frames.begin()+index,f);timeline_.state_.cels.insert(timeline_.state_.cels.end(),e.detachedCels.begin(),e.detachedCels.end());timeline_.buildIndex();activeFrameId_=f.id;captureFrameOrder(e,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(e));
}
void Document::deleteFrame() {
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
 timeline_.buildIndex();captureFrameOrder(e,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(e));
}
void Document::applyCelEdit(const Edit& e,bool redo){const auto& values=redo?e.afterCels:e.beforeCels;if(values.empty())return;for(const auto& value:values){auto it=std::find_if(timeline_.state_.cels.begin(),timeline_.state_.cels.end(),[&](const auto& c){return c.id==value.id;});if(it==timeline_.state_.cels.end())throw std::logic_error("Missing history cel");*it=value;}timeline_.buildIndex();if(e.beforeFrames.empty() && !e.beforeFrame.empty())activeFrameId_=redo?e.afterFrame:e.beforeFrame;change_={0,0,width_,height_};}
void Document::addLinkedFrame(bool allLayers){
 cancelStroke();cancelLayerOpacity();const auto sourceFrame=frame().id;const auto layerId=layer().id;const auto index=activeFrameIndex();const bool inserted=index+1==timeline_.state().frames.size();if(inserted)addFrame();
 Edit e{{},state_,nextState_};e.beforeFrame=sourceFrame;e.afterFrame=timeline_.state().frames[index+1].id;
 for(const auto& l:timeline_.state().layers){if(!allLayers && l.id!=layerId)continue;const auto source=timeline_.resolveSurface(timeline_.findCel(l.id,sourceFrame)->id);if(!source.surface || std::none_of(source.surface->pixels.begin(),source.surface->pixels.end(),[](auto p){return (p>>24)!=0;}))continue;
  auto& target=*std::find_if(timeline_.state_.cels.begin(),timeline_.state_.cels.end(),[&](const auto& c){return c.layerId==l.id && c.frameId==e.afterFrame;});if(target.id==source.source->id)continue;e.beforeCels.push_back(target);target.linkedCelId=source.source->id;target.runtimeSharedCelId.reset();target.surface.reset();target.zIndex=source.source->zIndex;target.opacity=source.source->opacity;e.afterCels.push_back(target);
 }
 timeline_.buildIndex();activeFrameId_=e.afterFrame;change_={0,0,width_,height_};publishChange();
 if(inserted){auto& frameEdit=history_.back();historyBytes_-=frameEdit.bytes();frameEdit.detachedCels.clear();for(const auto& c:timeline_.state().cels)if(c.frameId==e.afterFrame)frameEdit.detachedCels.push_back(c);historyBytes_+=frameEdit.bytes();}else pushEdit(std::move(e));
}
void Document::disconnectCel(){cancelStroke();cancelLayerOpacity();if(!cel().linkedCelId)return;Edit e{{},state_,nextState_};e.beforeFrame=e.afterFrame=frame().id;e.beforeCels.push_back(cel());DocumentCel c=cel();const auto resolved=timeline_.resolveSurface(c.id);c.surface=*resolved.surface;c.linkedCelId.reset();c.runtimeSharedCelId.reset();e.afterCels.push_back(c);applyCelEdit(e,true);publishChange();pushEdit(std::move(e));}
void Document::setFrameDuration(int duration) {cancelStroke();cancelLayerOpacity();duration=std::clamp(duration?duration:100,1,60000);if(duration==frame().duration)return;Edit e{{},state_,nextState_};e.targetFrameId=frame().id;e.beforeDuration=frame().duration;e.afterDuration=duration;timeline_.state_.frames[activeFrameIndex()].duration=duration;pushEdit(std::move(e));}
void Document::beginFrameDuration(){cancelStroke();durationBefore_=frame().duration;durationValuesBefore_.clear();for(const auto& f:timeline_.state().frames)if(selectedFrames_.empty()?f.id==frame().id:std::find(selectedFrames_.begin(),selectedFrames_.end(),f.id)!=selectedFrames_.end())durationValuesBefore_.push_back({f.id,f.duration});}
void Document::previewFrameDuration(int duration){if(durationBefore_)for(auto& f:timeline_.state_.frames)if(std::any_of(durationValuesBefore_.begin(),durationValuesBefore_.end(),[&](const auto& item){return item.first==f.id;}))f.duration=std::clamp(duration?duration:100,1,60000);}
void Document::commitFrameDuration(){if(!durationBefore_)return;durationBefore_.reset();const auto start=position_;groupingHistory_=true;for(const auto& value:durationValuesBefore_){const auto f=std::find_if(timeline_.state().frames.begin(),timeline_.state().frames.end(),[&](const auto& x){return x.id==value.first;});if(f->duration==value.second)continue;Edit e{{},state_,nextState_};e.targetFrameId=value.first;e.beforeDuration=value.second;e.afterDuration=f->duration;pushEdit(std::move(e));}groupingHistory_=false;groupEdits(start,selectedFrames_);durationValuesBefore_.clear();}
void Document::applyFrameEdit(const Edit& e,bool redo) {
 const auto& order=redo?e.afterFrames:e.beforeFrames;auto& frames=timeline_.state_.frames;auto& cels=timeline_.state_.cels;
 if(!order.empty()){if(e.detachedFrame){const auto& id=e.detachedFrame->id;const bool want=std::find(order.begin(),order.end(),id)!=order.end();auto it=std::find_if(frames.begin(),frames.end(),[&](const auto& f){return f.id==id;});if(want && it==frames.end()){frames.push_back(*e.detachedFrame);cels.insert(cels.end(),e.detachedCels.begin(),e.detachedCels.end());}else if(!want && it!=frames.end()){frames.erase(it);cels.erase(std::remove_if(cels.begin(),cels.end(),[&](const auto& c){return c.frameId==id;}),cels.end());}}std::sort(frames.begin(),frames.end(),[&](const auto& a,const auto& b){return std::find(order.begin(),order.end(),a.id)<std::find(order.begin(),order.end(),b.id);});timeline_.buildIndex();activeFrameId_=redo?e.afterFrame:e.beforeFrame;change_={0,0,width_,height_};}
 const auto& loops=redo?e.afterLoops:e.beforeLoops;if(loops)timeline_.state_.loopSections=*loops;const auto& selection=redo?e.afterSelection:e.beforeSelection;if(selection)selectedFrames_=*selection;
 if(!e.targetFrameId.empty()){auto it=std::find_if(frames.begin(),frames.end(),[&](const auto& f){return f.id==e.targetFrameId;});if(it==frames.end())throw std::logic_error("Missing history frame");it->duration=*(redo?e.afterDuration:e.beforeDuration);}
}
void Document::captureLayerOrder(Edit& e,bool after) const {
 auto& order=after?e.afterOrder:e.beforeOrder;for(const auto& l:timeline_.state().layers)order.push_back(l.id);(after?e.afterActive:e.beforeActive)=activeLayerId_;
}
void Document::addLayer() {
 commitFloatingPaste();
 cancelStroke();cancelLayerOpacity();if(timeline_.state().layers.size()>=256 || std::uint64_t(width_)*height_*(timeline_.state().layers.size()+1)*timeline_.state().frames.size()*4>256*1024*1024)throw std::runtime_error("Layer pixel memory limit reached");Edit e{{},state_,nextState_};captureLayerOrder(e,false);
 DocumentLayer l;do {l.id="layer-native-"+std::to_string(identity_)+"-"+std::to_string(++nextLayerId_);}while(std::any_of(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& old){return old.id==l.id;}));l.name=U"图层 ";for(char c:std::to_string(timeline_.state().layers.size()+1))l.name+=char32_t(c);
 for(const auto& f:timeline_.state().frames) {DocumentCel c;c.id="cel-"+l.id+"-"+f.id;c.layerId=l.id;c.frameId=f.id;c.opacity=1;
 timeline::Surface surface;surface.width=width_;surface.height=height_;surface.pixels.resize(std::size_t(width_)*height_);c.surface=std::move(surface);e.detachedCels.push_back(std::move(c));}
 e.detachedLayer=l;auto index=activeLayerIndex();timeline_.state_.layers.insert(timeline_.state_.layers.begin()+index,std::move(l));timeline_.state_.cels.insert(timeline_.state_.cels.end(),e.detachedCels.begin(),e.detachedCels.end());timeline_.buildIndex();activeLayerId_=e.detachedLayer->id;
 captureLayerOrder(e,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(e));
}
void Document::duplicateLayer(){commitFloatingPaste();cancelStroke();if(timeline_.state().layers.size()>=256)throw std::runtime_error("Layer limit reached");Edit e{{},state_,nextState_};captureLayerOrder(e,false);const auto source=layer();DocumentLayer copy=source;copy.id="layer-native-"+std::to_string(identity_)+"-"+std::to_string(++nextLayerId_);copy.name=source.name+U" 副本";e.detachedLayer=copy;for(const auto& c:timeline_.state().cels)if(c.layerId==source.id){auto n=c;n.id="cel-"+copy.id+"-"+n.frameId;n.layerId=copy.id;if(n.surface)n.surface=timeline_.resolveSurface(c.id).surface?*timeline_.resolveSurface(c.id).surface:timeline::Surface{};e.detachedCels.push_back(std::move(n));}auto index=activeLayerIndex();timeline_.state_.layers.insert(timeline_.state_.layers.begin()+index,std::move(copy));timeline_.state_.cels.insert(timeline_.state_.cels.end(),e.detachedCels.begin(),e.detachedCels.end());timeline_.buildIndex();activeLayerId_=e.detachedLayer->id;captureLayerOrder(e,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(e));}
void Document::mergeLayerDown(){commitFloatingPaste();cancelStroke();const auto topIndex=activeLayerIndex();if(topIndex+1>=timeline_.state().layers.size()||layer().locked)throw std::runtime_error("No merge target");auto& layers=timeline_.state_.layers;auto bottom=layers[topIndex+1];auto top=layers[topIndex];if(bottom.locked||!bottom.visible||!top.visible)throw std::runtime_error("Layer cannot merge");Edit e{{},state_,nextState_};e.beforeTimeline=timeline_.state();e.beforeActive=activeLayerId_;DocumentLayer merged=bottom;merged.id="layer-native-"+std::to_string(identity_)+"-"+std::to_string(++nextLayerId_);merged.name=bottom.name+U" + "+top.name;merged.locked=false;merged.opacity=1;std::vector<DocumentCel> nc;for(const auto& f:timeline_.state().frames){auto a=timeline_.findCel(bottom.id,f.id),b=timeline_.findCel(top.id,f.id);auto sa=a&&a->surface?a->surface:std::optional<timeline::Surface>{};auto sb=b&&b->surface?b->surface:std::optional<timeline::Surface>{};timeline::Surface out;out.width=width_;out.height=height_;out.pixels.resize(std::size_t(width_)*height_);for(std::size_t i=0;i<out.pixels.size();++i){auto low=sa&&i<sa->pixels.size()?sa->pixels[i]:0,hi=sb&&i<sb->pixels.size()?sb->pixels[i]:0;double alpha=(hi>>24)/255.0*top.opacity;double la=(low>>24)/255.0*bottom.opacity;double oa=alpha+la*(1-alpha);if(oa>0){auto ch=[&](int sh){return std::uint32_t(std::lround((((hi>>sh)&255)*alpha+((low>>sh)&255)*la*(1-alpha))/oa));};out.pixels[i]=(std::uint32_t(std::lround(oa*255))<<24)|ch(0)|(ch(8)<<8)|(ch(16)<<16);}}nc.push_back({"cel-"+merged.id+"-"+f.id,merged.id,f.id,{},{},{},0,std::move(out)});}layers.erase(layers.begin()+topIndex,layers.begin()+topIndex+2);layers.insert(layers.begin()+topIndex,merged);timeline_.state_.cels.erase(std::remove_if(timeline_.state_.cels.begin(),timeline_.state_.cels.end(),[&](const auto& c){return c.layerId==bottom.id||c.layerId==top.id;}),timeline_.state_.cels.end());timeline_.state_.cels.insert(timeline_.state_.cels.end(),nc.begin(),nc.end());timeline_.buildIndex();activeLayerId_=merged.id;e.afterTimeline=timeline_.state();e.afterActive=activeLayerId_;e.beforeDimensions={{width_,height_}};e.afterDimensions={{width_,height_}};change_={0,0,width_,height_};publishChange();pushEdit(std::move(e));}
void Document::deleteLayer() {
 commitFloatingPaste();
 cancelStroke();cancelLayerOpacity();if(timeline_.state().layers.size()==1 || layer().locked)return;
 Edit e{{},state_,nextState_};captureLayerOrder(e,false);e.detachedLayer=layer();for(const auto& c:timeline_.state().cels)if(c.layerId==layer().id)e.detachedCels.push_back(c);const auto index=activeLayerIndex();
 timeline_.state_.layers.erase(timeline_.state_.layers.begin()+index);auto& cels=timeline_.state_.cels;cels.erase(std::remove_if(cels.begin(),cels.end(),[&](const auto& c){return c.layerId==e.detachedLayer->id;}),cels.end());
 activeLayerId_=timeline_.state_.layers[std::min(index,timeline_.state_.layers.size()-1)].id;timeline_.buildIndex();captureLayerOrder(e,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(e));
}
void Document::moveLayer(std::size_t index) {
 commitFloatingPaste();
 cancelStroke();cancelLayerOpacity();auto& layers=timeline_.state_.layers;if(index>=layers.size() || index==activeLayerIndex() || layer().locked)return;
 Edit e{{},state_,nextState_};captureLayerOrder(e,false);const auto old=activeLayerIndex();auto value=std::move(layers[old]);layers.erase(layers.begin()+old);layers.insert(layers.begin()+index,std::move(value));timeline_.buildIndex();captureLayerOrder(e,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(e));
}
void Document::setLayerLocked(bool locked) {
 commitFloatingPaste();
 cancelStroke();cancelLayerOpacity();if(layer().locked==locked)return;Edit e{{},state_,nextState_};e.targetLayerId=layer().id;e.beforeLocked=layer().locked;e.afterLocked=locked;timeline_.state_.layers[activeLayerIndex()].locked=locked;pushEdit(std::move(e));
}
void Document::setLayerAutoLinkAnimationCels(const std::string& id,bool enabled) {
 auto it=std::find_if(timeline_.state_.layers.begin(),timeline_.state_.layers.end(),[&](const auto& l){return l.id==id;});
 if(it==timeline_.state_.layers.end() || it->autoLinkAnimationCels==enabled)return;
 Edit e{{},state_,nextState_};e.targetLayerId=id;e.beforeAutoLink=it->autoLinkAnimationCels;e.afterAutoLink=enabled;
 it->autoLinkAnimationCels=enabled;pushEdit(std::move(e));
}
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
  if(visible)it->visible=*visible;if(opacity)it->opacity=*opacity;if(locked)it->locked=*locked;change_={0,0,width_,height_};
 }
}
void Document::setLayerVisible(bool visible) {
 commitFloatingPaste();
 cancelStroke();if(layer().visible==visible)return;Edit edit{{},state_,nextState_};edit.targetLayerId=layer().id;edit.beforeVisible=layer().visible;edit.afterVisible=visible;
 timeline_.state_.layers.at(activeLayerIndex()).visible=visible;change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit));
}
void Document::setLayerOpacity(double opacity) {
 cancelStroke();if(layer().locked || !std::isfinite(opacity))return;opacity=std::clamp(opacity,0.0,1.0);if(layer().opacity==opacity)return;
 Edit edit{{},state_,nextState_};edit.targetLayerId=layer().id;edit.beforeOpacity=layer().opacity;edit.afterOpacity=opacity;
 timeline_.state_.layers.at(activeLayerIndex()).opacity=opacity;change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit));
}
void Document::beginLayerOpacity() {cancelStroke();cancelLayerOpacity();if(!layer().locked)opacityBefore_=layer().opacity;}
void Document::previewLayerOpacity(double opacity) {
 if(!opacityBefore_ || !std::isfinite(opacity))return;opacity=std::clamp(opacity,0.0,1.0);
 if(layer().opacity==opacity)return;timeline_.state_.layers.at(activeLayerIndex()).opacity=opacity;
 change_={0,0,width_,height_};publishChange();
}
void Document::cancelLayerOpacity() {
 if(!opacityBefore_)return;const auto before=*opacityBefore_;opacityBefore_.reset();
 if(layer().opacity!=before){timeline_.state_.layers.at(activeLayerIndex()).opacity=before;change_={0,0,width_,height_};publishChange();}
}
void Document::commitLayerOpacity() {
 if(!opacityBefore_)return;const auto before=*opacityBefore_,after=layer().opacity;opacityBefore_.reset();
 if(before==after)return;Edit edit{{},state_,nextState_};edit.targetLayerId=layer().id;edit.beforeOpacity=before;edit.afterOpacity=after;pushEdit(std::move(edit));
}


bool Document::beginShapePreview(){commitFloatingPaste();cancelStroke();if(layer().locked || !layer().visible)return false;gradient_=GradientPreview{{},cel().id,layer().id,frame().id,pixels(),selection_,{},{},contentRevision_,true};++gradientRevision_;return true;}
bool Document::updateShapePreview(const ShapeSpec& spec,Pixel color){if(!shapeActive())return false;auto& g=*gradient_;if(g.contentRevision!=contentRevision_ || !selectionEqual(g.selection,selection_) || g.layerId!=layer().id || g.frameId!=frame().id || layer().locked || !layer().visible){cancelGradient();return false;}if(g.region){const auto& r=*g.region;for(int y=r.y;y<r.y+r.height;++y)std::copy_n(pixels().begin()+std::size_t(y)*width_+r.x,r.width,g.preview.begin()+std::size_t(y)*width_+r.x);}PixelRegion touched;auto write=[&](int x,int y){for(auto p:symmetryPoints({x,y},width_,height_,symmetryAxes,symmetryCenter())){if(g.selection && !selectionContains(g.selection,p.x,p.y))continue;const auto i=std::size_t(p.y)*width_+p.x;g.preview[i]=(color>>24)?brushComposite(pixels()[i],color,100):color;touched.include(p.x,p.y);}};if(spec.kind==ShapeKind::Line){const auto spans=brushSpans(spec.brush);const int anchor=spec.brush.size/2;shapeLineCenters(spec.start,spec.end,width_,height_,spec.brush.size,[&](int x,int y){for(const auto& span:spans)for(int px=std::max(0,x-anchor+span.left);px<=std::min(width_-1,x-anchor+span.right);++px)write(px,y-anchor+span.y);},spec.brush.shape==BrushShape::Line);}else if(auto mask=shapeMask(spec,width_,height_)){for(int y=mask->y;y<mask->y+mask->height;++y)for(int x=mask->x;x<mask->x+mask->width;++x)if(selectionContains(mask,x,y))write(x,y);}g.region=touched.empty()?std::optional<SelectionMask>{}:std::optional<SelectionMask>{SelectionMask{touched.x,touched.y,touched.w,touched.h,{}}};++gradientRevision_;return true;}
bool Document::beginColorAdjustment(const std::vector<std::string>& layers){
 commitFloatingPaste();cancelStroke();auto ids=selection_ || layers.empty()?std::vector<std::string>{layer().id}:layers;std::vector<std::string> targets;
 for(const auto& id:ids){const auto it=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==id;});if(it==timeline_.state().layers.end() || it->locked)continue;const auto* c=timeline_.findCel(id,frame().id);if(!c)continue;const auto resolved=timeline_.resolveSurface(c->id);if(!resolved.source || !resolved.surface)continue;if(std::find(targets.begin(),targets.end(),resolved.source->id)==targets.end())targets.push_back(resolved.source->id);}
 if(targets.empty())return false;adjustment_=AdjustmentPreview{timeline_,timeline_,std::move(targets),selection_,layer().id,frame().id,contentRevision_};++gradientRevision_;return true;
}
bool Document::beginColorReplacement(const std::vector<std::string>& celIds,bool clipSelection){
 commitFloatingPaste();cancelStroke();if(clipSelection && !selection_)return false;std::vector<std::string> targets;
 for(const auto& id:celIds){const auto* c=timeline_.findCelById(id);if(!c)continue;const auto l=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==c->layerId;});if(l==timeline_.state().layers.end() || l->locked)continue;const auto r=timeline_.resolveSurface(id);if(r.source && r.surface && std::find(targets.begin(),targets.end(),r.source->id)==targets.end())targets.push_back(r.source->id);}
 if(targets.empty())return false;adjustment_=AdjustmentPreview{timeline_,timeline_,std::move(targets),selection_,layer().id,frame().id,contentRevision_,clipSelection};++gradientRevision_;return true;
}
bool Document::updateColorReplacement(Pixel source,Pixel replacement,bool enabled){
 if(!adjustment_)return false;auto& p=*adjustment_;if(p.contentRevision!=contentRevision_ || p.frameId!=frame().id || p.layerId!=layer().id || !selectionEqual(p.selection,selection_)){cancelColorAdjustment();return false;}p.preview=p.baseline;
 if(enabled && source!=replacement)for(const auto& id:p.targets){auto* surface=p.preview.mutableOwnedSurface(id);for(int y=0;y<surface->height;++y)for(int x=0;x<surface->width;++x){auto& value=surface->pixels[std::size_t(y)*surface->width+x];if(value==source && (!p.clipSelection || selectionContains(p.selection,x+surface->offsetX,y+surface->offsetY)))value=replacement;}}
 ++gradientRevision_;return true;
}
bool Document::updateColorAdjustment(const ColorAdjustment& a,bool enabled){
 if(!adjustment_)return false;auto& p=*adjustment_;if(p.contentRevision!=contentRevision_ || p.frameId!=frame().id || p.layerId!=layer().id || !selectionEqual(p.selection,selection_)){cancelColorAdjustment();return false;}p.preview=p.baseline;ColorAdjustmentSampler sample(a);
 for(const auto& id:p.targets){std::unordered_map<Pixel,Pixel> repeated;bool cache=true;auto* surface=p.preview.mutableOwnedSurface(id);for(int y=0;y<height_;++y)for(int x=0;x<width_;++x)if(enabled && (!p.selection || selectionContains(p.selection,x,y))){auto& value=surface->pixels[std::size_t(y)*width_+x];if(a.kind==ColorAdjustmentKind::HueSaturation && (value>>24)){const auto rgb=value&0xffffff;const auto found=repeated.find(rgb);if(cache && found!=repeated.end())value=(value&0xff000000)|found->second;else{const auto next=sample(value);if(cache){if(repeated.size()<8192)repeated.emplace(rgb,next&0xffffff);else{cache=false;repeated.clear();}}value=next;}}else value=sample(value);}}++gradientRevision_;return true;
}
void Document::cancelColorAdjustment(){if(adjustment_){adjustment_.reset();++gradientRevision_;}}
bool Document::commitColorAdjustment(){
 if(!adjustment_)return false;const auto& p=*adjustment_;if(p.contentRevision!=contentRevision_ || p.frameId!=frame().id || p.layerId!=layer().id || !selectionEqual(p.selection,selection_)){cancelColorAdjustment();return false;}
 Edit e{{},state_,nextState_};e.beforeActive=e.afterActive=layer().id;e.beforeFrame=e.afterFrame=frame().id;e.beforeSelection=e.afterSelection=selectedFrames_;
 for(const auto& id:p.targets){const auto* c=timeline_.findCelById(id);const auto l=std::find_if(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.id==c->layerId;});if(l->locked)continue;Edit child{{},state_,nextState_};child.targetCelId=id;const auto& before=p.baseline.resolveSurface(id).surface->pixels;const auto& after=p.preview.resolveSurface(id).surface->pixels;for(std::size_t i=0;i<before.size();++i)if(before[i]!=after[i]){if(!child.runs.empty() && child.runs.back().index+child.runs.back().length==i && child.runs.back().before==before[i] && child.runs.back().after==after[i])++child.runs.back().length;else child.runs.push_back({i,1,before[i],after[i]});}if(!child.runs.empty())e.children.push_back(std::move(child));}
 if(e.children.empty()){cancelColorAdjustment();return false;}history_.reserve(position_+1);cancelColorAdjustment();change_={};applyEdit(e,true);publishChange();pushEdit(std::move(e));return true;
}
bool Document::beginGradient(Point seed,WandOptions options){commitFloatingPaste();cancelStroke();if(layer().locked || !layer().visible || seed.x<0 || seed.y<0 || seed.x>=width_ || seed.y>=height_ || (selection_ && !selectionContains(selection_,seed.x,seed.y)))return false;options.gapClosing=false;const auto source=options.visibleLayers?compositeNormalRegion(timeline_,frame().id,{0,0,width_,height_}):std::vector<Pixel>{};auto region=magicWandSelection(options.visibleLayers?source:pixels(),width_,height_,seed.x,seed.y,options);if(!region)return false;gradient_=GradientPreview{seed,cel().id,layer().id,frame().id,pixels(),selection_,std::move(region),options,contentRevision_};++gradientRevision_;return true;}
bool Document::updateGradient(const GradientSpec& spec,WandOptions options){if(!gradient_)return false;auto& g=*gradient_;if(g.contentRevision!=contentRevision_ || !selectionEqual(g.selection,selection_) || g.layerId!=layer().id || g.frameId!=frame().id || layer().locked || !layer().visible){cancelGradient();return false;}options.gapClosing=false;const auto previousRegion=g.region;if(options.tolerance!=g.options.tolerance || options.contiguous!=g.options.contiguous || options.connectivity!=g.options.connectivity || options.visibleLayers!=g.options.visibleLayers){const auto source=options.visibleLayers?compositeNormalRegion(timeline_,frame().id,{0,0,width_,height_}):std::vector<Pixel>{};g.region=magicWandSelection(options.visibleLayers?source:pixels(),width_,height_,g.seed.x,g.seed.y,options);g.options=options;}
 if(previousRegion){const auto& r=*previousRegion;for(int y=r.y;y<r.y+r.height;++y)std::copy_n(pixels().begin()+std::size_t(y)*width_+r.x,r.width,g.preview.begin()+std::size_t(y)*width_+r.x);}if(g.region){const auto& r=*g.region;GradientSampler sample(spec);std::vector<Pixel> row(r.width);for(int y=r.y;y<r.y+r.height;++y){sample.row(y,r.x,r.x+r.width,row.data());for(int x=r.x;x<r.x+r.width;++x){const auto i=std::size_t(y)*width_+x;const auto current=pixels()[i];const auto source=row[x-r.x];g.preview[i]=selectionContains(g.region,x,y) && (!g.selection || selectionContains(g.selection,x,y)) && (source>>24)?brushComposite(current,source,100):current;}}}++gradientRevision_;return true;}
void Document::cancelGradient(){if(gradient_){gradient_.reset();++gradientRevision_;}}
bool Document::commitGradient(){if(!gradient_)return false;const auto& g=*gradient_;if(g.contentRevision!=contentRevision_ || !selectionEqual(g.selection,selection_) || g.layerId!=layer().id || g.frameId!=frame().id || layer().locked || !layer().visible){cancelGradient();return false;}Edit edit{{},state_,nextState_};edit.targetCelId=g.celId;edit.beforeSelection=edit.afterSelection=selectedFrames_;int left=width_,top=height_,right=0,bottom=0;for(int y=0;y<height_;++y)for(int x=0;x<width_;++x){const auto i=std::size_t(y)*width_+x;if(pixels()[i]!=g.preview[i]){left=std::min(left,x);right=std::max(right,x+1);top=std::min(top,y);bottom=std::max(bottom,y+1);}}if(right<=left){cancelGradient();return false;}history_.reserve(position_+1);if(std::size_t(right-left)*(bottom-top)>=512*512){DensePixels dense{left,top,right-left,bottom-top,{},{}};dense.before.reserve(std::size_t(dense.width)*dense.height);dense.after.reserve(std::size_t(dense.width)*dense.height);for(int y=top;y<bottom;++y){dense.before.insert(dense.before.end(),pixels().begin()+std::size_t(y)*width_+left,pixels().begin()+std::size_t(y)*width_+right);dense.after.insert(dense.after.end(),g.preview.begin()+std::size_t(y)*width_+left,g.preview.begin()+std::size_t(y)*width_+right);}edit.dense=std::move(dense);}else{for(int y=top;y<bottom;++y)for(int x=left;x<right;++x){const auto i=std::size_t(y)*width_+x;if(pixels()[i]!=g.preview[i])edit.pixels.push_back({i,pixels()[i],g.preview[i]});}}
 auto result=std::move(gradient_->preview);gradient_.reset();++gradientRevision_;auto& storage=pixelStorage();for(int y=top;y<bottom;++y)std::copy_n(result.begin()+std::size_t(y)*width_+left,right-left,storage.begin()+std::size_t(y)*width_+left);change_={left,top,right-left,bottom-top};publishChange();pushEdit(std::move(edit));return true;
}

// tools-fill.ts: active owned Cel only; frame selection is history context,
// not extra paint targets. Runs retain the legacy large exact-color fast path.
bool Document::fillPixels(Point point,Pixel color,WandOptions options){
 if(symmetryHas(symmetryAxes) && !fillSymmetryDispatch_){const auto start=position_;const auto selected=selectedFrames_;const auto axes=symmetryAxes;symmetryAxes={};fillSymmetryDispatch_=true;const auto oldGrouping=groupingHistory_;groupingHistory_=true;try{for(auto p:symmetryPoints({point.x,point.y},width_,height_,axes,symmetryCenter()))fillPixels({p.x,p.y},color,options);}catch(...){groupingHistory_=oldGrouping;fillSymmetryDispatch_=false;symmetryAxes=axes;while(position_>start)undo();throw;}groupingHistory_=oldGrouping;fillSymmetryDispatch_=false;symmetryAxes=axes;groupEdits(start,selected);return position_>start;}
 commitFloatingPaste();cancelStroke();
 if(layer().locked || !layer().visible || point.x<0 || point.y<0 || point.x>=width_ || point.y>=height_ || (selection_ && !selectionContains(selection_,point.x,point.y)))return false;
 auto& storage=pixelStorage();const auto seed=std::size_t(point.y)*width_+point.x;const auto target=storage[seed];
 auto paint=[&](Pixel current){return (color>>24)==0?color:brushComposite(current,color,100);};const auto next=paint(target);
 if(!options.visibleLayers && target==next)return false;
 Edit edit{{},state_,nextState_};edit.targetCelId=cel().id;edit.beforeSelection=edit.afterSelection=selectedFrames_;
 change_={};history_.reserve(position_+1);
 auto run=[&](std::size_t index,std::size_t count,Pixel before,Pixel after){if(before==after)return;edit.runs.push_back({index,count,before,after});std::fill_n(storage.begin()+index,count,after);change_.include(int(index%width_),int(index/width_));change_.include(int((index+count-1)%width_),int((index+count-1)/width_));};
 try{
  const bool compact=storage.size()>=512*512 && !options.visibleLayers && options.connectivity==4 && options.tolerance==0 && !(options.contiguous && options.gapClosing);
  if(compact){
   auto matches=[&](std::size_t i){return storage[i]==target && (!selection_ || selectionContains(selection_,int(i%width_),int(i/width_)));};
   if(!options.contiguous){for(int y=0;y<height_;++y){std::size_t i=std::size_t(y)*width_,end=i+width_;while(i<end){while(i<end && !matches(i))++i;if(i==end)break;const auto left=i++;while(i<end && matches(i))++i;run(left,i-left,target,next);}}}
   else
   if(!selection_ && std::all_of(storage.begin(),storage.end(),[&](Pixel p){return p==target;})){for(int y=0;y<height_;++y)run(std::size_t(y)*width_,width_,target,next);}
   else {std::vector<std::size_t> stack{seed};auto neighbor=[&](std::ptrdiff_t l,std::ptrdiff_t r){if(l<0 || r>std::ptrdiff_t(storage.size()))return;while(l<r){while(l<r && !matches(l))++l;if(l==r)break;stack.push_back(l++);while(l<r && matches(l))++l;}};
    while(!stack.empty()){auto i=stack.back();stack.pop_back();if(!matches(i))continue;const auto row=i-i%width_;auto l=i,r=i+1;while(l>row && matches(l-1))--l;while(r<row+width_ && matches(r))++r;run(l,r-l,target,next);neighbor(std::ptrdiff_t(l)-width_,std::ptrdiff_t(r)-width_);neighbor(l+width_,r+width_);}}
  }else{
   const auto composite=options.visibleLayers?compositeNormalRegion(timeline_,frame().id,{0,0,width_,height_}):std::vector<Pixel>{};
   auto region=magicWandSelection(options.visibleLayers?composite:storage,width_,height_,point.x,point.y,options,selection_);
   if(!region)return false;
   for(int y=region->y;y<region->y+region->height;++y){int x=region->x;while(x<region->x+region->width){if(!selectionContains(region,x,y)){++x;continue;}const auto index=std::size_t(y)*width_+x;const auto current=storage[index],value=paint(current);const int left=x++;while(x<region->x+region->width && selectionContains(region,x,y) && storage[std::size_t(y)*width_+x]==current)++x;run(index,x-left,current,value);}}
  }
 }catch(...){for(auto it=edit.runs.rbegin();it!=edit.runs.rend();++it)std::fill_n(storage.begin()+it->index,it->length,it->before);change_={};throw;}
 if(edit.runs.empty())return false;publishChange();pushEdit(std::move(edit));return true;
}

bool Document::fillPatternPixels(Point point,Pixel color,const PatternFillOptions& pattern,WandOptions options){
 if(pattern.brushes.empty() && pattern.texture==FillTexture::Solid)return fillPixels(point,color,options);
 commitFloatingPaste();cancelStroke();cancelGradient();
 if(layer().locked || !layer().visible || point.x<0 || point.y<0 || point.x>=width_ || point.y>=height_ || (selection_ && !selectionContains(selection_,point.x,point.y)))return false;
 auto& storage=pixelStorage();const auto composite=options.visibleLayers?compositeNormalRegion(timeline_,frame().id,{0,0,width_,height_}):std::vector<Pixel>{};
 auto region=magicWandSelection(options.visibleLayers?composite:storage,width_,height_,point.x,point.y,options,selection_);if(!region)return false;
 // Legacy defers non-default/multiple-stamp layouts until contiguous bounds are known.
 const bool deferred=options.contiguous && !pattern.brushes.empty() && (pattern.mode!=PatternMode::Default || pattern.brushes.size()>1);
 auto bounds=deferred?*region:selection_.value_or(SelectionMask{0,0,width_,height_,{}});
 PatternFillSampler sampler(pattern,color,point.x,point.y,bounds.x,bounds.y,bounds.width,bounds.height);
 Edit edit{{},state_,nextState_};edit.targetCelId=cel().id;edit.beforeSelection=edit.afterSelection=selectedFrames_;history_.reserve(position_+1);change_={};
 // Keep compact runs for textures and repeated source pixels; transparent holes do not alter the flood region.
 for(int y=region->y;y<region->y+region->height;++y)for(int x=region->x;x<region->x+region->width;++x){
  if(!selectionContains(region,x,y))continue;auto sample=sampler.sample(x,y);if(sample.coverage<=0)continue;auto source=sample.hasColor?sample.color:color;
  if(sample.coverage!=255)source=(source&0xffffff)|(std::uint32_t(std::lround((source>>24)*sample.coverage/255.0))<<24);
  const auto i=std::size_t(y)*width_+x;const auto before=storage[i];const auto after=(source>>24)==0?source:brushComposite(before,source,100);if(before==after)continue;
  if(!edit.runs.empty() && edit.runs.back().index+edit.runs.back().length==i && edit.runs.back().index/width_==i/width_ && edit.runs.back().before==before && edit.runs.back().after==after)++edit.runs.back().length;else edit.runs.push_back({i,1,before,after});
  change_.include(x,y);
 }
 if(edit.runs.empty()){change_={};return false;}
 // All allocation/sampling completed before mutation, preserving failure atomicity.
 for(const auto& run:edit.runs)std::fill_n(storage.begin()+run.index,run.length,run.after);
 publishChange();pushEdit(std::move(edit));return true;
}

void Document::beginStroke(Point p, Pixel color,BrushOptions brush,const PatternBrush* image,double angle) {
  commitFloatingPaste();
  cancelStroke();
  change_={};
  if(layer().locked || !layer().visible) return;
  imageStamp_=image?std::optional<ImageBrushStamp>{prepareImageBrushStamp(*image,brush.size,angle)}:std::nullopt;imageEraseCoverage_.clear();
  strokePixels_=&timeline_.mutableOwnedSurface(timeline_.resolveSurface(cel().id).source->id)->pixels;
  active_ = true;
  last_ = p;
  color_ = color;brush_=brush;brush_.size=std::clamp(brush_.size,1,64);brush_.opacity=std::clamp(brush_.opacity,0,100);stampSpans_=brushSpans(brush_);hasPreviousStamp_=false;
  stamp(p.x, p.y);
  publishChange();
}
void Document::plot(int x, int y) {
  if(x<0 || y<0 || x>=width_ || y>=height_ || (selection_ && !selectionContains(selection_,x,y))) return;
  const auto index=static_cast<std::size_t>(y)*width_+x;
  const auto current=pixelStorage()[index];
  if(pending_.find(index)!=pending_.end()) return;
  const auto value=brushComposite(current,color_,brush_.opacity);
  if(current==value) return;
  // legacy core/history.ts recordPixelKnownCurrent: record only touched pixels.
  auto inserted=pending_.emplace(index,Delta{index,current,value});
  inserted.first->second.after=value;
  pixelStorage()[index]=value;change_.include(x,y);

}
void Document::stamp(int x,int y) {
  if(imageStamp_){const auto& stamp=*imageStamp_;for(const auto& sample:stamp.samples)for(const auto& p:symmetryPoints({x-stamp.width/2+sample.x,y-stamp.height/2+sample.y},width_,height_,symmetryAxes,symmetryCenter())){
   if(selection_ && !selectionContains(selection_,p.x,p.y))continue;const auto index=std::size_t(p.y)*width_+p.x;auto current=pixelStorage()[index];auto found=pending_.find(index);const auto before=found==pending_.end()?current:found->second.before;Pixel value;
   if((color_>>24)==0){int coverage=int(std::floor(sample.coverage*brush_.opacity/100.0+.5));if(sample.color)coverage=int(std::floor(coverage*(*sample.color>>24)/255.0+.5));auto seen=imageEraseCoverage_.find(index);if(!coverage || (seen!=imageEraseCoverage_.end() && seen->second>=coverage))continue;imageEraseCoverage_[index]=coverage;value=coverage==255?0:(before&0xffffff)|(Pixel(std::floor((before>>24)*(1-coverage/255.0)+.5))<<24);}
   else {if(int(std::floor(sample.coverage*brush_.opacity/100.0+.5))==0)continue;value=imageBrushDirectPixel(sample.color.value_or(color_),sample.coverage,brush_.opacity);}
   if(current==value)continue;if(found==pending_.end())found=pending_.emplace(index,Delta{index,before,value}).first;else found->second.after=value;pixelStorage()[index]=value;change_.include(p.x,p.y);
  }return;}
  const auto anchor=brush_.size/2;
  if(symmetryHas(symmetryAxes)){auto paint=[&](int y,int l,int r){if(y<0 || y>=height_)return;for(int px=std::max(0,l);px<=std::min(width_-1,r);++px)plot(px,y);};for(auto span:stampSpans_)symmetryPaintSpan(y-anchor+span.y,x-anchor+span.left,x-anchor+span.right,width_,height_,symmetryAxes,symmetryCenter(),paint);return;}
  for(const auto& span:stampSpans_) {
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
    for(auto px=left;px<=std::min(right,previousLeft-1);++px) plot(int(px),int(py));
    for(auto px=std::max(left,previousRight+1);px<=right;++px) plot(int(px),int(py));
  }
  previousStamp_={x,y};hasPreviousStamp_=true;
}
void Document::line(Point a, Point b) {
  // Bounded equivalent of legacy selection.ts forEachRasterLinePoint.
  // Strict Bresenham ties depend on traversal direction; preserve them.
  // Restrict iteration, not endpoints: clipping must not change the slope.
  const bool steep=std::abs(std::int64_t(b.y)-a.y)>std::abs(std::int64_t(b.x)-a.x);
  if(steep) {std::swap(a.x,a.y);std::swap(b.x,b.y);}
  const bool reversed=a.x>b.x;
  if(reversed) std::swap(a,b);
  const std::uint64_t span=std::int64_t(b.x)-a.x;
  if(span==0) {if(steep) stamp(a.y,a.x);else stamp(a.x,a.y);return;}
  const auto delta=std::int64_t(b.y)-a.y;
  const std::uint64_t slope=std::abs(delta);
  const int reach=imageStamp_?std::max(imageStamp_->width,imageStamp_->height):brush_.size;
  const auto first=std::max<std::int64_t>(-reach,a.x);
  const auto last=std::min<std::int64_t>((steep?height_:width_)+reach-1,b.x);
  for(auto cursor=first;cursor<=last;++cursor) {
    const auto major=imageStamp_ && reversed?last-(cursor-first):cursor;
    const std::uint64_t offset=major-std::int64_t(a.x);
    const auto index=reversed?span-offset:offset;
    const int spacing=brush_.shape==BrushShape::Line?1:std::max(1,reach/16);
    if(index!=0 && index!=span && index%spacing!=0) continue;
    const auto step=(offset*slope+(reversed?span/2:(span-1)/2))/span;
    const int minor=int(std::int64_t(a.y)+(delta<0?-std::int64_t(step):std::int64_t(step)));
    if(steep) stamp(minor,int(major));else stamp(int(major),minor);
  }
}
void Document::updateStroke(Point point) {
  if (!active_) return;
  change_={};
  line(last_, point);
  publishChange();
  last_ = point;
}
bool Document::commitStroke() {
  if (!active_) return false;
  Edit edit{{}, state_, nextState_};
  edit.targetCelId=cel().id;
  edit.pixels.reserve(pending_.size());
  for(const auto& [index,delta]:pending_) if(delta.before!=delta.after) edit.pixels.push_back(delta);
  if(edit.pixels.empty()) {active_=false;strokePixels_=nullptr;pending_.clear();return false;}
  pushEdit(std::move(edit));
  active_ = false;strokePixels_=nullptr; pending_.clear();
  return true;
}
void Document::cancelStroke() {
  cancelPaletteReplacement();cancelColorAdjustment();cancelGradient();
  if (!active_) return;
  change_={};
  for(const auto& [index,delta]:pending_) {
    if(pixelStorage()[index]!=delta.before) {pixelStorage()[index]=delta.before;change_.include(int(index%width_),int(index/width_));}
  }
  publishChange();pending_.clear();
  active_ = false;strokePixels_=nullptr;
}
Document Document::fromImage(int width,int height,std::vector<Pixel> pixels,std::u32string name){if(width<1||height<1||width>1024||height>1024||pixels.size()!=std::size_t(width)*height)throw std::invalid_argument("Native images must be 1..1024 pixels");Document d(width,height);d.timeline_.mutableOwnedSurface(d.cel().id)->pixels=std::move(pixels);auto colors=extractImportedPalette({d.pixels()},256,262144);d.palette_.entries.clear();d.palette_.slots.clear();int id=1;for(auto c:colors){{auto text=std::to_string(id);d.palette_.entries.push_back({id,U"颜色 "+std::u32string(text.begin(),text.end()),c});}d.palette_.slots.push_back(id++);}d.palette_.slots.resize((d.palette_.slots.size()+7)/8*8);d.palette_.nextId=id;d.name_=std::move(name);d.markSaved();return d;}
bool Document::importSpriteSheet(const SheetImportOptions& options){commitFloatingPaste();cancelStroke();auto next=buildSpriteSheetImport(*this,options);Edit e{{},state_,nextState_};e.beforeDimensions={{width_,height_}};e.afterDimensions={{options.width,options.height}};e.beforeTimeline=timeline_.state();e.afterTimeline=std::move(next);e.beforeActive=activeLayerId_;e.beforeFrame=activeFrameId_;e.afterActive=e.afterTimeline->layers.front().id;e.afterFrame=e.afterTimeline->frames.front().id;e.pixelSelectionEdit=true;e.beforePixelsSelection=selection_;e.beforeSelection=selectedFrames_;e.afterSelection=std::vector<std::string>{};history_.reserve(position_+1);applyEdit(e,true);publishChange();pushEdit(std::move(e));return true;}
bool Document::resizeImage(int width,int height,ImageInterpolation method){
 if(width<1||height<1||width>1024||height>1024)throw std::invalid_argument("Native editable images support 1..1024 pixels");
 if(width==width_&&height==height_)return false;
 cancelStroke();cancelLayerOpacity();Edit e{{},state_,nextState_};e.beforeDimensions={{width_,height_}};e.afterDimensions={{width,height}};e.beforeCels=timeline_.state().cels;e.afterCels=e.beforeCels;
 for(auto& c:e.afterCels)if(c.surface){auto& surface=*c.surface;if(surface.width!=width_||surface.height!=height_||surface.offsetX||surface.offsetY)throw std::logic_error("Image resize requires admitted full-canvas surfaces");surface.pixels=resizeImagePixels(surface.pixels,width_,height_,width,height,method);surface.width=width;surface.height=height;surface.storageOriginX=0;surface.storageOriginY=0;}
 e.pixelSelectionEdit=true;e.beforePixelsSelection=selection_;e.afterPixelsSelection=resizeImageSelection(selection_,width_,height_,width,height);
 history_.reserve(position_+1);applyEdit(e,true);publishChange();pushEdit(std::move(e));return true;
}
void Document::applyEdit(const Edit& edit,bool forward){if(edit.beforeTimeline){timeline_=timeline::Timeline(forward?*edit.afterTimeline:*edit.beforeTimeline);activeLayerId_=forward?edit.afterActive:edit.beforeActive;activeFrameId_=forward?edit.afterFrame:edit.beforeFrame;}if(edit.beforeDimensions){const auto dims=forward?*edit.afterDimensions:*edit.beforeDimensions;width_=dims.first;height_=dims.second;if(edit.beforeTimeline)change_={0,0,width_,height_};}if(!edit.children.empty()){if(forward)for(const auto& child:edit.children)applyEdit(child,true);else for(auto it=edit.children.rbegin();it!=edit.children.rend();++it)applyEdit(*it,false);}else{if(!edit.pixels.empty() || !edit.runs.empty() || edit.dense){const auto* target=timeline_.findCelById(edit.targetCelId);selectLayer(target->layerId);selectFrame(target->frameId);}for(const auto& delta:edit.pixels){pixelStorage()[delta.index]=forward?delta.after:delta.before;change_.include(int(delta.index%width_),int(delta.index/width_));}for(const auto& run:edit.runs){std::fill_n(pixelStorage().begin()+run.index,run.length,forward?run.after:run.before);change_.include(int(run.index%width_),int(run.index/width_));change_.include(int((run.index+run.length-1)%width_),int((run.index+run.length-1)/width_));}if(edit.dense){const auto& d=*edit.dense;const auto& values=forward?d.after:d.before;for(int y=0;y<d.height;++y)std::copy_n(values.begin()+std::size_t(y)*d.width,d.width,pixelStorage().begin()+std::size_t(y+d.y)*width_+d.x);change_.include(d.x,d.y);change_.include(d.x+d.width-1,d.y+d.height-1);}applyPaletteEdit(edit,forward);applyLayerEdit(edit,forward);applyFrameEdit(edit,forward);applyCelEdit(edit,forward);}if(!edit.children.empty() && !edit.beforeActive.empty()){selectLayer(forward?edit.afterActive:edit.beforeActive);selectFrame(forward?edit.afterFrame:edit.beforeFrame);}if(edit.pixelSelectionEdit)selection_=forward?edit.afterPixelsSelection:edit.beforePixelsSelection;const auto& selection=forward?edit.afterSelection:edit.beforeSelection;if(selection)selectedFrames_=*selection;}
void Document::undo() {
  if(floating_){cancelFloatingPaste();return;}cancelStroke();
  if (!canUndo()) return;
  const auto& edit = history_[position_-1];
  change_={};applyEdit(edit,false);--position_;
  publishChange();historyBytes_-=edit.bytes();
  state_ = edit.beforeState;if(edit.documentChanged)modified_=true;++revision_;
}
void Document::redo() {
  commitFloatingPaste();cancelStroke();
  if (!canRedo()) return;
  const auto& edit = history_[position_];
  change_={};applyEdit(edit,true);++position_;
  publishChange();historyBytes_+=edit.bytes();
  state_ = edit.afterState;if(edit.documentChanged)modified_=true;++revision_;
}
PaletteState Document::capturePaletteEdit(int kind,int id) const {
  if(kind==1) return palette_;
  PaletteState state;state.entries.clear();state.slots.clear();
  state.primary=palette_.primary;state.secondary=palette_.secondary;
  if(kind==2) {state.slots=palette_.slots;state.selected=palette_.selected;state.primaryId=palette_.primaryId;}
  else if(const auto entry=paletteEntry(id)) state.entries.push_back(*entry);
  return state;
}
std::size_t Document::Edit::bytes() const {
  std::size_t size=pixels.size()*sizeof(Delta)+runs.size()*sizeof(PixelRun)+targetCelId.size()+((beforeVisible||beforeOpacity)?32:0);
  for(const auto* t:{&beforeTimeline,&afterTimeline})if(*t)for(const auto& c:(*t)->cels)size+=128+(c.surface?c.surface->pixels.size()*sizeof(Pixel):0);
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
  for(const auto& child:children)size+=child.bytes();
  for(const auto* loops:{&beforeLoops,&afterLoops})if(*loops)size+=(*loops)->size()*256;
  size+=(beforeFrames.size()+afterFrames.size())*64;
  return size;
}
void Document::pushEdit(Edit edit) {
  history_.reserve(position_+1);history_.resize(position_);
  historyBytes_+=edit.bytes();history_.push_back(std::move(edit));++position_;if(history_.back().documentChanged){state_=nextState_++;modified_=true;}++revision_;
  while(!groupingHistory_ && ((historyBytes_>maxBytes_ && position_>1) || history_.size()>maxEntries_)) {
    historyBytes_-=history_.front().bytes();history_.erase(history_.begin());--position_;
  }
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
void Document::selectPaletteSlotRange(std::size_t slot,int columns) {
  if(columns<1) return;
  const auto& slots=palette_.slots;
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
  if(const auto entry=paletteEntry(id)) {palette_.secondaryId=id;palette_.secondary=entry->color;}
}
void Document::clearPaletteSelection() {palette_.selected.clear();palette_.primaryId=0;}
int Document::addPaletteColor(Pixel color,bool selectAdded,std::optional<std::size_t> targetSlot) {
  if(targetSlot && (*targetSlot>=palette_.slots.size() || palette_.slots[*targetSlot]))
    throw std::invalid_argument("Palette target must be an existing empty slot");
  cancelStroke();Edit edit{{},state_,nextState_};edit.beforePalette=palette_;edit.paletteKind=1;
  const int id=palette_.nextId++;const auto name=std::to_string(id);
  palette_.entries.push_back({id,U"颜色 "+std::u32string(name.begin(),name.end()),color});
  auto slot=targetSlot?palette_.slots.begin()+*targetSlot:std::find(palette_.slots.begin(),palette_.slots.end(),0);
  if(slot==palette_.slots.end()) {const auto n=palette_.slots.size();palette_.slots.resize(n+8);palette_.slots[n]=id;} else *slot=id;
  palette_.selected=selectAdded?std::vector<int>{id}:std::vector<int>{};palette_.primaryId=selectAdded?id:0;
  edit.afterPalette=capturePaletteEdit(edit.paletteKind,edit.colorId);pushEdit(std::move(edit));return id;
}
void Document::deletePaletteColors(const std::vector<int>& ids) {
  cancelStroke();Edit edit{{},state_,nextState_};edit.beforePalette=capturePaletteEdit(2);edit.paletteKind=2;bool changed=false;
  for(auto& slot:palette_.slots) if(slot && std::find(ids.begin(),ids.end(),slot)!=ids.end()) {slot=0;changed=true;}
  if(!changed) return;
  auto& selected=palette_.selected;selected.erase(std::remove_if(selected.begin(),selected.end(),[&](int id){return std::find(ids.begin(),ids.end(),id)!=ids.end();}),selected.end());
  if(std::find(selected.begin(),selected.end(),palette_.primaryId)==selected.end()) palette_.primaryId=selected.empty()?0:selected.back();
  edit.afterPalette=capturePaletteEdit(edit.paletteKind,edit.colorId);pushEdit(std::move(edit));
}
void Document::updatePaletteColor(int id,Pixel color) {
  const auto current=paletteEntry(id);if(!current || current->color==color) return;
  auto gradientPreview=std::move(gradient_);cancelStroke();gradient_=std::move(gradientPreview);Edit edit{{},state_,nextState_};edit.beforePalette=capturePaletteEdit(3,id);edit.paletteKind=3;edit.colorId=id;
  const auto before=current->color;
  for(auto& entry:palette_.entries) if(entry.id==id) entry.color=color;
  if(palette_.primary==before) palette_.primary=color;if(palette_.secondary==before) palette_.secondary=color;
  edit.afterPalette=capturePaletteEdit(edit.paletteKind,edit.colorId);pushEdit(std::move(edit));
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
  const auto first=name.find_first_not_of(U" \t\r\n"),last=name.find_last_not_of(U" \t\r\n");
  const auto next=first==std::u32string::npos?U"":name.substr(first,last-first+1);
  if(entry->name==next) return;
  cancelStroke();Edit edit{{},state_,nextState_};edit.beforePalette=capturePaletteEdit(4,id);edit.paletteKind=4;edit.colorId=id;
  for(auto& candidate:palette_.entries) if(candidate.id==id) candidate.name=next;
  edit.afterPalette=capturePaletteEdit(edit.paletteKind,edit.colorId);pushEdit(std::move(edit));
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
 palette_=std::move(next);pushEdit(std::move(edit));
}
void Document::applyPaletteEdit(const Edit& edit,bool redo) {
  if(!edit.beforePalette) return;
  const auto& state=redo?*edit.afterPalette:*edit.beforePalette;
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
  palette_.slots=state.slots;palette_.selected=state.selected;palette_.primaryId=state.primaryId;
  if(edit.paletteKind==1) {palette_.entries=state.entries;palette_.nextId=state.nextId;palette_.primary=state.primary;}
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
 if(!changed){palette_=std::move(after);return false;}Edit edit{{},state_,nextState_};edit.paletteKind=6;edit.beforePalette=std::move(before);edit.afterPalette=after;history_.reserve(position_+1);palette_=std::move(after);change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit));return true;
}
void Document::acceptSaved(std::string projectId,std::shared_ptr<const std::vector<std::uint8_t>> sourceArchive) {
  if(active()) throw std::logic_error("Cannot accept a saved uncommitted preview");
  if(projectId.empty() || !sourceArchive || sourceArchive->empty()) throw std::invalid_argument("Missing saved project identity or archive");
  // Caller uses a synchronous encoder/write without pumping input; only invoke
  // after the exact current generation has been persisted successfully.
  projectId_=std::move(projectId);sourceArchive_=std::move(sourceArchive);markSaved();
}
void Document::markSaved() {
  if (active()) throw std::logic_error("Cannot mark an uncommitted preview saved");
  modified_ = false;
}
void Document::commitSelection(std::optional<SelectionMask> before,std::optional<SelectionMask> after,bool resetFrames){commitFloatingPaste();selection_=after;if(selectionEqual(before,after))return;Edit e{{},state_,state_};e.documentChanged=false;e.pixelSelectionEdit=true;e.beforePixelsSelection=std::move(before);e.afterPixelsSelection=std::move(after);if(resetFrames)clearFrameSelection();pushEdit(std::move(e));}
void Document::selectAllPixels(){commitFloatingPaste();commitSelection(selection_,SelectionMask{0,0,width_,height_,{}});}
void Document::deselectPixels(){commitFloatingPaste();commitSelection(selection_,{});}
void Document::invertPixels(){if(!selection_)return;commitFloatingPaste();commitSelection(selection_,invertSelection(selection_,width_,height_));}
std::optional<SelectionClipboard> Document::copyPixels() const {if(!selection_)return {};SelectionClipboard out;if(floating_){const auto bounds=transformBounds(floating_->transform);out.width=bounds.width;out.height=bounds.height;out.originX=bounds.x;out.originY=bounds.y;out.pixels.resize(std::size_t(out.width)*out.height);out.mask.resize(out.pixels.size());auto transform=floating_->transform;transform.x-=bounds.x;transform.y-=bounds.y;if(transform.flipOriginX)*transform.flipOriginX-=bounds.x;if(transform.flipOriginY)*transform.flipOriginY-=bounds.y;SelectionRotSpriteSource sampler(floating_->source);auto cells=floating_->rotSprite?rotSpriteSelectionCells(floating_->source,transform,out.width,out.height,sampler):fastSelectionTransformCells(floating_->source,transform,out.width,out.height);for(auto cell:cells){auto i=std::size_t(cell.y)*out.width+cell.x;out.pixels[i]=cell.value;out.mask[i]=1;}return !cells.empty()?std::optional<SelectionClipboard>{std::move(out)}:std::optional<SelectionClipboard>{};}const auto clamped=rectangleSelection(selection_->x,selection_->y,selection_->width,selection_->height,width_,height_);if(!clamped)return {};out.width=clamped->width;out.height=clamped->height;out.originX=clamped->x;out.originY=clamped->y;out.pixels.resize(out.width*out.height);out.mask.resize(out.pixels.size());bool any=false;for(int y=0;y<out.height;++y)for(int x=0;x<out.width;++x){const int px=clamped->x+x,py=clamped->y+y;const auto value=pixels()[py*width_+px];if(selectionContains(selection_,px,py) && value>>24){const auto index=y*out.width+x;out.pixels[index]=value;out.mask[index]=1;any=true;}}return any?std::optional<SelectionClipboard>{std::move(out)}:std::optional<SelectionClipboard>{};}
bool Document::deleteSelectedPixels(){if(floating_){if(floating_->clipboard){cancelFloatingPaste();return true;}commitFloatingPaste();}if(!selection_ || layer().locked || !layer().visible)return false;cancelStroke();Edit e{{},state_,nextState_};e.targetCelId=cel().id;auto& storage=pixelStorage();change_={};for(int y=0;y<height_;++y)for(int x=0;x<width_;++x)if(selectionContains(selection_,x,y)){const auto index=std::size_t(y)*width_+x;if(storage[index]!=0){e.pixels.push_back({index,storage[index],0});storage[index]=0;change_.include(x,y);}}if(e.pixels.empty())return false;selection_.reset();publishChange();pushEdit(std::move(e));return true;}
bool Document::cutPixels(std::optional<SelectionClipboard>& clipboard){if(!selection_)return false;clipboard=copyPixels();const bool deleteOriginal=!floating_ || (!floating_->clipboard && !floating_->copy);if(floating_)cancelFloatingPaste();if(deleteOriginal)deleteSelectedPixels();selection_.reset();return bool(clipboard);}
bool Document::beginFloatingPaste(const SelectionClipboard& clipboard,int x,int y){
 commitFloatingPaste();cancelStroke();if(layer().locked || !layer().visible || clipboard.width<1 || clipboard.height<1 || clipboard.pixels.size()!=std::size_t(clipboard.width)*clipboard.height || clipboard.mask.size()!=clipboard.pixels.size())return false;
 FloatingPaste f;f.source=clipboard;f.x=x;f.y=y;f.beforeSelection=selection_;f.layerId=layer().id;f.frameId=frame().id;f.targets.push_back({clipboard,cel().id,{}});f.transform={double(x),double(y),double(clipboard.width),double(clipboard.height)};floating_=std::move(f);moveFloatingPaste(x,y);return true;
}
bool Document::beginSelectionContentMove(bool copy,bool allFrameLayers){
 if(floating_){if(copy && !floating_->copy){commitFloatingPaste();}else return true;}
 if(!selection_)return false;cancelStroke();
 FloatingPaste f;f.beforeSelection=selection_;f.x=f.sourceX=selection_->x;f.y=f.sourceY=selection_->y;f.clipboard=false;f.copy=copy;f.layerId=layer().id;f.frameId=frame().id;
 auto frames=selectedFrames_.empty()?std::vector<std::string>{frame().id}:selectedFrames_;
 std::stable_sort(frames.begin(),frames.end(),[&](const auto& a,const auto& b){return a==frame().id && b!=frame().id;});
 std::vector<std::string> sources;
 for(const auto& frameId:frames)for(std::size_t n=0;n<timeline_.state().layers.size();++n){
  const auto index=(n+activeLayerIndex())%timeline_.state().layers.size();const auto& targetLayer=timeline_.state().layers[index];
  if(!allFrameLayers && targetLayer.id!=layer().id)continue;
  if(targetLayer.locked || !targetLayer.visible){if(allFrameLayers)continue;return false;}
  const auto* target=timeline_.findCel(targetLayer.id,frameId);if(!target)continue;const auto resolved=timeline_.resolveSurface(target->id);if(!resolved.source || !resolved.surface)return false;
  if(std::find(sources.begin(),sources.end(),resolved.source->id)!=sources.end())continue;sources.push_back(resolved.source->id);
  SelectionClipboard source;source.width=selection_->width;source.height=selection_->height;source.originX=selection_->x;source.originY=selection_->y;source.pixels.resize(std::size_t(source.width)*source.height);source.mask.resize(source.pixels.size());
  for(int y=0;y<source.height;++y)for(int x=0;x<source.width;++x){const int px=f.sourceX+x,py=f.sourceY+y;const auto local=std::size_t(y)*source.width+x;if(!selectionContains(selection_,px,py))continue;source.mask[local]=1;if(px>=0 && py>=0 && px<width_ && py<height_)source.pixels[local]=resolved.surface->pixels[std::size_t(py)*width_+px];}
  f.targets.push_back({std::move(source),target->id,{}});
 }
 if(f.targets.empty())return false;f.source=f.targets.front().source;f.transform={double(f.x),double(f.y),double(f.source.width),double(f.source.height)};floating_=std::move(f);moveFloatingPaste(selection_->x,selection_->y);return true;
}
bool Document::nudgeSelectionContent(int dx,int dy,bool allFrameLayers){if(!selection_ || !beginSelectionContentMove(false,allFrameLayers))return false;auto transform=floating_->transform;transform.x+=dx;transform.y+=dy;transformFloatingPaste(transform,floating_->rotSprite);return true;}
void Document::prepareSelectionBoxMove(){if(floating_ && !floating_->clipboard)commitFloatingPaste();}
void Document::commitSelectionBox(std::optional<SelectionMask> before){if(selectionEqual(before,selection_))return;Edit e{{},state_,state_};e.documentChanged=false;e.pixelSelectionEdit=true;e.beforePixelsSelection=std::move(before);e.afterPixelsSelection=selection_;pushEdit(std::move(e));}
void Document::moveFloatingPaste(int x,int y){if(!floating_)return;auto transform=floating_->transform;if(transform.width<1 || transform.height<1){transform.width=floating_->source.width;transform.height=floating_->source.height;}transform.x=x;transform.y=y;transformFloatingPaste(transform,floating_->rotSprite);}
void Document::transformFloatingPaste(const SelectionTransform& transform,bool rotSprite){
 if(!floating_)return;auto& f=*floating_;change_={};
 for(auto& target:f.targets){auto& storage=timeline_.mutableOwnedSurface(timeline_.resolveSurface(target.celId).source->id)->pixels;
  for(const auto& [index,delta]:target.preview)if(storage[index]!=delta.before){storage[index]=delta.before;change_.include(int(index%width_),int(index/width_));}target.preview.clear();
  auto write=[&](int px,int py,Pixel value){const auto index=std::size_t(py)*width_+px;const auto before=storage[index];if(before==value)return;auto inserted=target.preview.emplace(index,Delta{index,before,value});if(!inserted.second)inserted.first->second.after=value;storage[index]=value;change_.include(px,py);};
  const auto& source=target.source;
  if(!f.clipboard && !f.copy)for(int row=0;row<source.height;++row)for(int col=0;col<source.width;++col){const auto local=std::size_t(row)*source.width+col;const int px=f.sourceX+col,py=f.sourceY+row;if(source.mask[local] && source.pixels[local]>>24 && px>=0 && py>=0 && px<width_ && py<height_)write(px,py,0);}
  const bool translation=!transform.quad && transform.shearX==0 && transform.shearY==0 && transform.angle==0 && transform.width==source.width && transform.height==source.height && !transform.flipHorizontal && !transform.flipVertical && std::floor(transform.x)==transform.x && std::floor(transform.y)==transform.y;
  if(translation){const int x=int(transform.x),y=int(transform.y);for(int row=std::max(0,-y);row<std::min(source.height,height_-y);++row)for(int col=std::max(0,-x);col<std::min(source.width,width_-x);++col){const auto local=std::size_t(row)*source.width+col;if(!source.mask[local] || !(source.pixels[local]>>24))continue;const int px=x+col,py=y+row;write(px,py,brushComposite(storage[std::size_t(py)*width_+px],source.pixels[local],100));}}
  else{if(rotSprite && !target.rotSprite)target.rotSprite=std::make_shared<SelectionRotSpriteSource>(target.source);const auto cells=rotSprite?rotSpriteSelectionCells(source,transform,width_,height_,*target.rotSprite):fastSelectionTransformCells(source,transform,width_,height_);for(auto cell:cells)write(cell.x,cell.y,brushComposite(storage[std::size_t(cell.y)*width_+cell.x],cell.value,100));}
 }
 f.rotSprite=rotSprite;f.transform=transform;f.x=int(std::floor(transform.x));f.y=int(std::floor(transform.y));if(!transform.quad && transform.shearX==0 && transform.shearY==0 && transform.angle==0 && transform.width==f.source.width && transform.height==f.source.height && !transform.flipHorizontal && !transform.flipVertical && std::floor(transform.x)==transform.x && std::floor(transform.y)==transform.y){selection_=SelectionMask{f.x,f.y,f.source.width,f.source.height,f.source.mask};if(!f.clipboard && f.beforeSelection->mask.empty())selection_->mask.clear();}else selection_=transformedSelectionMask(f.source,transform);publishChange();
}
bool Document::commitFloatingPaste(){
 if(!floating_)return false;auto f=std::move(*floating_);floating_.reset();Edit e{{},state_,nextState_};
 for(const auto& target:f.targets){Edit child{{},state_,nextState_};child.targetCelId=target.celId;for(const auto& [index,delta]:target.preview)if(delta.before!=delta.after)child.pixels.push_back(delta);if(!child.pixels.empty())e.children.push_back(std::move(child));}
 e.pixelSelectionEdit=true;e.beforePixelsSelection=f.beforeSelection;e.afterPixelsSelection=selection_;e.beforeActive=e.afterActive=f.layerId;e.beforeFrame=e.afterFrame=f.frameId;
 if(e.children.empty()){commitSelectionBox(f.beforeSelection);return false;}
 if(e.children.size()==1){e.targetCelId=e.children.front().targetCelId;e.pixels=std::move(e.children.front().pixels);e.children.clear();}pushEdit(std::move(e));return true;
}
void Document::cancelFloatingPaste(){
 if(!floating_)return;auto f=std::move(*floating_);floating_.reset();change_={};for(const auto& target:f.targets){auto& storage=timeline_.mutableOwnedSurface(timeline_.resolveSurface(target.celId).source->id)->pixels;for(const auto& [index,delta]:target.preview)if(storage[index]!=delta.before){storage[index]=delta.before;change_.include(int(index%width_),int(index/width_));}}
 selection_=std::move(f.beforeSelection);publishChange();
}

}



namespace moon {
void Document::setImportedProjectBrushes(std::vector<ProjectBrushResource> brushes){std::set<std::string> ids;for(const auto& resource:brushes){const auto& b=resource.brush;if(resource.metadata.id.empty()||!ids.insert(resource.metadata.id).second||b.width<1||b.height<1||std::uint64_t(b.width)*b.height>16*1024*1024||b.coverage.size()!=std::size_t(b.width)*b.height||(!b.colors.empty()&&b.colors.size()!=b.coverage.size()))throw std::invalid_argument("Invalid imported project brush");}projectBrushes_=std::move(brushes);}
bool Document::deleteProjectBrush(const std::string& id){auto item=std::find_if(projectBrushes_.begin(),projectBrushes_.end(),[&](const auto& brush){return brush.metadata.id==id;});if(item==projectBrushes_.end())return false;projectBrushes_.erase(item);modified_=true;state_=nextState_++;++revision_;++contentRevision_;return true;}
}



