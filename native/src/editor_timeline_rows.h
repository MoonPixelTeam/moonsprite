#pragma once
#include "layer_panel_tree.h"
#include "timeline_model.h"
#include "animation_change.h"
#include <algorithm>
#include <cstdlib>
#include <limits>
#include <optional>
#include <unordered_map>
#include <unordered_set>
#include <utility>
namespace moon::editor {
using TimelineSlot=AnimationCellSlot;
class TimelineRows {
 const timeline::State& state_;const timeline::Timeline* timeline_=nullptr;std::vector<LayerPanelNode> rows_;
 std::unordered_map<std::string,int> rowIndices_;
 std::vector<bool> maskRows_;
 std::vector<std::string> owners_;
public:
 TimelineRows(const timeline::State& state,const std::vector<std::string>& collapsed,bool includeMaskRows=true):state_(state){
  // Legacy LayersPanel keeps mask owners in a Set, independent of frame count.
  std::unordered_set<std::string> maskOwners,maskIds;
  for(const auto& mask:state.masks)if(maskOwners.insert(mask.ownerId).second)maskIds.insert(maskRowId(mask.ownerId));
  auto original=buildLayerPanelTree(state,collapsed);rows_.reserve(original.size()+std::min(original.size(),maskOwners.size()));
  for(auto& row:original){
   const bool include=includeMaskRows&&maskOwners.count(row.id);
   rows_.push_back(std::move(row));
   if(include){auto mask=rows_.back();mask.id=maskRowId(mask.id);++mask.depth;rows_.push_back(std::move(mask));}
  }
  rowIndices_.reserve(rows_.size());maskRows_.reserve(rows_.size());owners_.reserve(rows_.size());
  for(int i=0;i<int(rows_.size());++i){const auto& id=rows_[i].id;const bool mask=maskIds.count(id)!=0;rowIndices_.emplace(id,i);maskRows_.push_back(mask);owners_.push_back(mask?id.substr(10):id);}
 }
 TimelineRows(const timeline::Timeline& timeline,const std::vector<std::string>& collapsed,bool includeMaskRows=true):TimelineRows(timeline.state(),collapsed,includeMaskRows){timeline_=&timeline;}
 static std::string maskRowId(const std::string& owner){return "@mask-row:"+owner;}
 bool mask(int row)const{return row>=0&&row<size()&&maskRows_[row];}
 std::string owner(int row)const{return at(row)?owners_[row]:std::string{};}
 int size()const{return int(rows_.size());}
 const LayerPanelNode* at(int row)const{return row>=0&&row<size()?&rows_[row]:nullptr;}
 int index(const std::string& id)const{auto i=rowIndices_.find(id);return i==rowIndices_.end()?-1:i->second;}
 std::optional<std::size_t> layerIndex(int row)const{auto n=at(row);if(!n||n->kind!=LayerPanelKind::Layer)return {};const auto& id=owners_[row];if(timeline_)return timeline_->layerIndex(id);auto i=std::find_if(state_.layers.begin(),state_.layers.end(),[&](const auto& l){return l.id==id;});return i==state_.layers.end()?std::optional<std::size_t>{}:std::size_t(i-state_.layers.begin());}
 const timeline::Layer* layer(int row)const{auto i=layerIndex(row);return i?&state_.layers[*i]:nullptr;}
 const timeline::Group* group(int row)const{auto n=at(row);if(!n||n->kind!=LayerPanelKind::Group)return nullptr;const auto& id=owners_[row];auto i=std::find_if(state_.groups.begin(),state_.groups.end(),[&](const auto& g){return g.id==id;});return i==state_.groups.end()?nullptr:&*i;}
 // Outer-to-inner strips retain every ancestor, including uncolored levels.
 std::vector<std::optional<timeline::Pixel>> ancestorColors(int row)const{
  std::vector<std::optional<timeline::Pixel>> colors;auto l=layer(row);auto g=group(row);auto id=l?l->groupId:g?g->parentGroupId:std::optional<std::string>{};std::set<std::string> seen;
  while(id&&seen.insert(*id).second){auto it=std::find_if(state_.groups.begin(),state_.groups.end(),[&](const auto& parent){return parent.id==*id;});if(it==state_.groups.end())break;colors.push_back(it->displayColor);id=it->parentGroupId;}
  std::reverse(colors.begin(),colors.end());return colors;
 }
 int frameIndex(const std::string& id)const{if(timeline_)return timeline_->hasFrame(id)?int(timeline_->frameIndex(id)):-1;auto i=std::find_if(state_.frames.begin(),state_.frames.end(),[&](const auto& f){return f.id==id;});return i==state_.frames.end()?-1:int(i-state_.frames.begin());}
 const timeline::Cel* cel(int row,int column)const{if(mask(row))return nullptr;auto n=at(row);if(!n||n->kind!=LayerPanelKind::Layer||column<0||column>=int(state_.frames.size()))return nullptr;if(timeline_)return timeline_->findCel(n->id,state_.frames[column].id);auto i=std::find_if(state_.cels.begin(),state_.cels.end(),[&](const auto& c){return c.layerId==n->id&&c.frameId==state_.frames[column].id;});return i==state_.cels.end()?nullptr:&*i;}
 std::optional<TimelineSlot> slot(int row,int column)const{auto n=at(row);if(!n||column<0||column>=int(state_.frames.size()))return {};return TimelineSlot{n->id,state_.frames[column].id};}
 std::vector<TimelineSlot> rectangle(int row,int column,int targetRow,int targetColumn)const{std::vector<TimelineSlot> out;for(int r=std::max(0,std::min(row,targetRow));r<=std::max(row,targetRow)&&r<size();++r)for(int c=std::max(0,std::min(column,targetColumn));c<=std::max(column,targetColumn)&&c<int(state_.frames.size());++c)out.push_back(*slot(r,c));return out;}
 std::vector<std::string> ids(bool layersOnly=false)const{std::vector<std::string> out;for(const auto& n:rows_)if(n.id.rfind("@mask-row:",0)!=0&&(!layersOnly||n.kind==LayerPanelKind::Layer))out.push_back(n.id);return out;}
 // Legacy animation-mixed-cel-drag: same-frame nearest real selected cell.
 const timeline::Cel* mixedAnchor(const TimelineSlot& pointer,const std::vector<std::string>& selected)const{const int pointerRow=index(pointer.rowId);if(pointerRow<0)return nullptr;const timeline::Cel* best=nullptr;int distance=std::numeric_limits<int>::max();for(const auto& id:selected){const timeline::Cel* c=nullptr;if(timeline_)c=timeline_->findCelById(id);else{auto found=std::find_if(state_.cels.begin(),state_.cels.end(),[&](const auto& candidate){return candidate.id==id;});if(found!=state_.cels.end())c=&*found;}if(!c||c->frameId!=pointer.frameId)continue;int row=index(c->layerId);if(row>=0&&std::abs(row-pointerRow)<distance){best=c;distance=std::abs(row-pointerRow);}}return best;}
 const timeline::Cel* mixedTarget(const timeline::Cel& anchor,const TimelineSlot& pointerAnchor,int pointerRow,int column)const{int source=index(anchor.layerId),pointer=index(pointerAnchor.rowId);if(source<0||pointer<0)return nullptr;int desired=source+pointerRow-pointer,nearest=-1,distance=std::numeric_limits<int>::max();for(int i=0;i<size();++i)if(!mask(i)&&layer(i)&&std::abs(i-desired)<distance){nearest=i;distance=std::abs(i-desired);}return cel(nearest,column);}
 std::vector<TimelineSlot> movedGroups(const std::vector<TimelineSlot>& groups,const timeline::Cel& source,const timeline::Cel& target)const{std::vector<TimelineSlot> out;int dr=index(target.layerId)-index(source.layerId),dc=frameIndex(target.frameId)-frameIndex(source.frameId);for(const auto& s:groups){int row=index(s.rowId),column=frameIndex(s.frameId);if(row<0||column<0)continue;auto n=at(row+dr);auto translated=slot(row+dr,column+dc);if(n&&n->kind==LayerPanelKind::Group&&translated)out.push_back(*translated);}return out;}
};
}
