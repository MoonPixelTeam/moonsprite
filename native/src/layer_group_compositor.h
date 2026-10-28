#pragma once
#include "layer_compositor.h"
#include "layer_style_sampler.h"
#include "layer_panel_tree.h"
#include "layer_blend.h"
#include "cel_properties.h"
#include <functional>
#include <algorithm>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <unordered_map>
namespace moon {
// Render sparse leaves onto the live sibling backdrop; isolate a group once
// only when its opacity or blend requires the legacy intermediate surface.
template<class RenderLeaf>
std::vector<timeline::Pixel> compositeGroupedRegion(const timeline::Timeline& timeline,const std::string& frameId,CompositeRegion region,RenderLeaf&& leaf,const timeline::AttachedMask* maskPreview=nullptr){
 using Pixel=timeline::Pixel;if(!timeline.hasFrame(frameId))throw std::invalid_argument("Unknown composite frame");
 if(region.width<0||region.height<0||std::int64_t(region.x)+region.width>std::numeric_limits<int>::max()||std::int64_t(region.y)+region.height>std::numeric_limits<int>::max()||std::uint64_t(region.width)*region.height>64*1024*1024)throw std::invalid_argument("Invalid composite region");
 const auto& state=timeline.state();std::unordered_map<std::string,CompositeRegion> styleBounds;for(const auto& g:state.groups)if(g.layerStyles&&g.layerStyles->enabled&&(g.layerStyles->gradientEnabled||g.layerStyles->stroke.enabled||g.layerStyles->shadow.enabled||g.layerStyles->innerGlow.enabled))styleBounds.emplace(g.id,groupStyleGeometry(timeline,frameId,g.id));auto groupMask=[&](const std::string& id){const auto* mask=timeline::resolvedMask(state,id,frameId);return mask&&maskPreview&&mask->id==maskPreview->id?maskPreview:mask;};struct Node{bool adjustment=false,layer=false;std::size_t index=0;int z=0;std::size_t isolationDepth=0;std::vector<std::size_t> children;};std::vector<Node> nodes(1);std::unordered_map<std::string,std::size_t> layerById,groupById;
 for(std::size_t i=0;i<state.layers.size();++i)layerById.emplace(state.layers[i].id,i);for(std::size_t i=0;i<state.groups.size();++i)groupById.emplace(state.groups[i].id,i);
 std::vector<std::size_t> containers{0};std::size_t maxIsolationDepth=0;
 for(const auto& row:buildLayerPanelTree(state)){const auto depth=std::size_t(row.depth);if(depth>=containers.size())throw std::invalid_argument("Invalid group panel depth");containers.resize(depth+1);const auto parent=containers[depth];Node node;node.layer=row.kind==LayerPanelKind::Layer;node.isolationDepth=nodes[parent].isolationDepth;
  if(node.layer){node.index=layerById.at(row.id);if(const auto* cel=timeline.findCel(row.id,frameId)){const auto resolved=timeline.resolveSurface(cel->id);if(resolved.issue!=timeline::LinkIssue::None)throw std::invalid_argument("Invalid composite cel link");if(resolved.source)node.z=resolved.source->zIndex;}}
  else{node.index=groupById.at(row.id);const auto& group=state.groups[node.index];if(group.opacity!=1||group.blendMode!="normal"||groupMask(group.id)||timeline::styleVisible(group.layerStyles))++node.isolationDepth;maxIsolationDepth=std::max(maxIsolationDepth,node.isolationDepth);}
  const auto id=nodes.size();nodes.push_back(std::move(node));nodes[parent].children.push_back(id);if(!nodes[id].layer)containers.push_back(id);
 }
 for(std::size_t i=nodes.size();i-->0;){auto& n=nodes[i];if(n.layer)n.adjustment=state.layers[n.index].kind=="adjustment";else for(auto child:n.children)n.adjustment=n.adjustment||nodes[child].adjustment;}
 maxIsolationDepth=0;for(std::size_t i=0;i<nodes.size();++i)if(!nodes[i].layer){auto& n=nodes[i];for(auto child:n.children){nodes[child].isolationDepth=n.isolationDepth+std::size_t(child&&!nodes[child].layer&&(nodes[child].adjustment||state.groups[nodes[child].index].opacity!=1||state.groups[nodes[child].index].blendMode!="normal"||groupMask(state.groups[nodes[child].index].id)||timeline::styleVisible(state.groups[nodes[child].index].layerStyles)));maxIsolationDepth=std::max(maxIsolationDepth,nodes[child].isolationDepth);}}
 for(auto& node:nodes){std::reverse(node.children.begin(),node.children.end());std::stable_sort(node.children.begin(),node.children.end(),[&](auto a,auto b){return nodes[a].z<nodes[b].z;});}
 std::vector<Pixel> output(std::size_t(region.width)*region.height,0);if(!region.width||!region.height)return output;
 constexpr std::size_t scratchPixels=64*1024*1024;const auto levels=maxIsolationDepth+1,width=std::size_t(region.width);if(levels>scratchPixels/width)throw std::length_error("Group composite scratch budget exceeded");const auto tileRows=std::min<std::size_t>(128,scratchPixels/width/levels);std::vector<std::vector<Pixel>> buffers(levels);
 struct Event{std::size_t node,target;bool exit;};std::vector<Event> events;
 for(int y=0;y<region.height;){const auto height=std::min<std::size_t>(tileRows,std::size_t(region.height-y));CompositeRegion tile{region.x,region.y+y,region.width,int(height)};const auto count=width*height;buffers[0].assign(count,0);events.clear();events.push_back({0,0,false});
  while(!events.empty()){const auto event=events.back();events.pop_back();const auto& node=nodes[event.node];if(node.layer){leaf(node.index,tile,buffers[event.target]);continue;}auto target=event.target;if(event.node){const auto& group=state.groups[node.index];if(!group.visible||group.opacity<=0)continue;const auto mode=*parseLayerBlendMode(group.blendMode);const bool isolated=node.adjustment||group.opacity!=1||mode!=LayerBlendMode::Normal||groupMask(group.id)||timeline::styleVisible(group.layerStyles);if(event.exit){timeline::applyAttachedMask(groupMask(group.id),buffers[target+1],tile.x,tile.y,tile.width,tile.height);for(std::size_t i=0;i<count;++i){auto& p=buffers[target+1][i];p=timeline::applyColorOverlay(p,group.layerStyles);if(auto it=styleBounds.find(group.id);it!=styleBounds.end()){const auto b=it->second;p=timeline::applyGradientOverlay(p,group.layerStyles,tile.x+int(i%width),tile.y+int(i/width),b.x,b.y,b.width,b.height);}}blendLayerRow(buffers[target].data(),buffers[target+1].data(),count,group.opacity,mode);continue;}if(isolated){events.push_back({event.node,target,true});++target;buffers[target].assign(count,0);}}
   for(auto child=node.children.rbegin();child!=node.children.rend();++child)events.push_back({*child,target,false});
  }std::copy(buffers[0].begin(),buffers[0].end(),output.begin()+std::size_t(y)*width);y+=int(height);
 }return output;
}
// Legacy composite-plan clipping blocks and composite-sampling container loop.
// Ordinary documents continue through compositeGroupedRegion unchanged.
template<class RenderRawLeaf>
std::vector<timeline::Pixel> compositeClippingRegion(const timeline::Timeline& timeline,const std::string& frameId,CompositeRegion region,RenderRawLeaf&& rawLeaf,const timeline::AttachedMask* maskPreview=nullptr){
 using Pixel=timeline::Pixel;const auto& state=timeline.state();std::unordered_map<std::string,CompositeRegion> styleBounds;for(const auto& g:state.groups)if(g.layerStyles&&g.layerStyles->enabled&&(g.layerStyles->gradientEnabled||g.layerStyles->stroke.enabled||g.layerStyles->shadow.enabled||g.layerStyles->innerGlow.enabled))styleBounds.emplace(g.id,groupStyleGeometry(timeline,frameId,g.id));
 struct Node{bool adjustment=false,layer=false,clip=false;std::size_t index=0,depth=0;int z=0;std::vector<std::size_t> children;};
 std::vector<Node> nodes(1);std::unordered_map<std::string,std::size_t> layers,groups;for(std::size_t i=0;i<state.layers.size();++i)layers[state.layers[i].id]=i;for(std::size_t i=0;i<state.groups.size();++i)groups[state.groups[i].id]=i;
 std::vector<std::size_t> parents{0};std::size_t depth=0;
 for(const auto& row:buildLayerPanelTree(state)){parents.resize(std::size_t(row.depth)+1);auto parent=parents.back();Node n;n.layer=row.kind==LayerPanelKind::Layer;n.depth=nodes[parent].depth+1;depth=std::max(depth,n.depth);if(n.layer){n.index=layers.at(row.id);n.clip=state.layers[n.index].clippingMask;if(const auto* c=timeline.findCel(row.id,frameId)){const auto resolved=timeline.resolveSurface(c->id);if(resolved.issue!=timeline::LinkIssue::None)throw std::invalid_argument("Invalid clipping cel link");if(resolved.source)n.z=resolved.source->zIndex;}}else{n.index=groups.at(row.id);n.clip=state.groups[n.index].clippingMask;}auto id=nodes.size();nodes.push_back(std::move(n));nodes[parent].children.push_back(id);if(!nodes[id].layer)parents.push_back(id);}
 for(std::size_t i=nodes.size();i-->0;){auto& n=nodes[i];if(n.layer)n.adjustment=state.layers[n.index].kind=="adjustment";else for(auto child:n.children)n.adjustment=n.adjustment||nodes[child].adjustment;}
 for(auto& n:nodes){std::reverse(n.children.begin(),n.children.end());std::vector<std::vector<std::size_t>> blocks;for(auto id:n.children){if(nodes[id].clip&&!blocks.empty()&&!(nodes[blocks.back()[0]].layer&&nodes[blocks.back()[0]].adjustment))blocks.back().push_back(id);else blocks.push_back({id});}std::stable_sort(blocks.begin(),blocks.end(),[&](const auto& a,const auto& b){return nodes[a[0]].z<nodes[b[0]].z;});n.children.clear();for(const auto& block:blocks)n.children.insert(n.children.end(),block.begin(),block.end());}
 auto mask=[&](const std::string& id){auto m=timeline::resolvedMask(state,id,frameId);return m&&maskPreview&&m->id==maskPreview->id?maskPreview:m;};
 auto visible=[&](std::size_t id){const auto& n=nodes[id];return n.layer?state.layers[n.index].visible:state.groups[n.index].visible;};
 auto opacity=[&](std::size_t id){const auto& n=nodes[id];return n.layer?frameCelOpacity(timeline,state.layers[n.index],frameId):state.groups[n.index].opacity;};
 auto mode=[&](std::size_t id){const auto& n=nodes[id];return *parseLayerBlendMode(n.layer?state.layers[n.index].blendMode:state.groups[n.index].blendMode);};
 std::vector<Pixel> output(std::size_t(region.width)*region.height,0);if(!region.width||!region.height)return output;
 // Each nested container retains at most a chain, alpha snapshot and member.
 constexpr std::size_t budget=64*1024*1024;const auto levels=4*(depth+2),width=std::size_t(region.width);if(levels>budget/width)throw std::length_error("Clipping composite scratch budget exceeded");const auto rows=std::min<std::size_t>(128,budget/width/levels);
 for(int y=0;y<region.height;){const auto h=std::min(rows,std::size_t(region.height-y));CompositeRegion tile{region.x,region.y+y,region.width,int(h)};const auto count=width*h;
  // Region is explicit through the existing clipping traversal. A styled
  // group reads its child stack with a halo before cropping the output tile.
  std::function<void(std::size_t,std::vector<Pixel>&,CompositeRegion)> container;
  auto checkArea=[](CompositeRegion area){if(area.width<0||area.height<0||std::uint64_t(area.width)*area.height>64*1024*1024)throw std::length_error("Style halo scratch budget exceeded");};
  std::function<std::vector<Pixel>(std::size_t,CompositeRegion)> source=[&](std::size_t id,CompositeRegion area){checkArea(area);const auto count=std::size_t(area.width)*area.height;std::vector<Pixel> pixels(count,0);if(!visible(id))return pixels;const auto& n=nodes[id];if(n.layer)rawLeaf(n.index,area,pixels);else{const auto& group=state.groups[n.index];const int halo=layerStyleHalo(group.layerStyles);CompositeRegion input=area;if(halo){if(std::int64_t(area.x)-halo<std::numeric_limits<int>::min()||std::int64_t(area.y)-halo<std::numeric_limits<int>::min()||std::int64_t(area.x)+area.width+halo>std::numeric_limits<int>::max()||std::int64_t(area.y)+area.height+halo>std::numeric_limits<int>::max())throw std::length_error("Style halo coordinate overflow");input={area.x-halo,area.y-halo,area.width+2*halo,area.height+2*halo};}checkArea(input);std::vector<Pixel> raw(std::size_t(input.width)*input.height,0);container(id,raw,input);timeline::applyAttachedMask(mask(group.id),raw,input.x,input.y,input.width,input.height);auto read=[&](int x,int y){const auto sx=std::int64_t(x)-input.x,sy=std::int64_t(y)-input.y;return sx>=0&&sy>=0&&sx<input.width&&sy<input.height?raw[std::size_t(sy)*input.width+std::size_t(sx)]:Pixel(0);};LayerStyleSampler sampler(group.layerStyles);const auto found=styleBounds.find(group.id);const auto geometry=found==styleBounds.end()?CompositeRegion{}:found->second;for(int y=0;y<area.height;++y)for(int x=0;x<area.width;++x){const int wx=area.x+x,wy=area.y+y;pixels[std::size_t(y)*area.width+x]=sampler.sample(read(wx,wy),wx,wy,geometry.x,geometry.y,geometry.width,geometry.height,read);}}return pixels;};
  auto merge=[&](std::size_t id,std::vector<Pixel>& out,const std::vector<Pixel>& pixels){blendLayerRow(out.data(),pixels.data(),out.size(),opacity(id),mode(id));};
  container=[&](std::size_t parent,std::vector<Pixel>& out,CompositeRegion area){const auto count=out.size();const auto& children=nodes[parent].children;for(std::size_t i=0;i<children.size();++i){auto id=children[i];auto end=i;while(!(nodes[id].layer&&nodes[id].adjustment)&&end+1<children.size()&&nodes[children[end+1]].clip)++end;if(end>i){if(visible(id)&&opacity(id)>0){auto chain=source(id,area);std::vector<Pixel> alpha(count);for(std::size_t p=0;p<count;++p){alpha[p]=chain[p]&0xff000000;if(alpha[p])chain[p]|=0xff000000;}for(auto c=i+1;c<=end;++c)if(visible(children[c])&&opacity(children[c])>0){if(nodes[children[c]].layer&&nodes[children[c]].adjustment)rawLeaf(nodes[children[c]].index,area,chain);else{auto member=source(children[c],area);merge(children[c],chain,member);}}for(std::size_t p=0;p<count;++p)chain[p]=(chain[p]&0xffffff)|alpha[p];merge(id,out,chain);}i=end;continue;}if(!visible(id)||opacity(id)<=0)continue;const auto& n=nodes[id];if(n.layer&&n.adjustment){rawLeaf(n.index,area,out);continue;}if(!n.layer&&!n.adjustment&&opacity(id)==1&&mode(id)==LayerBlendMode::Normal&&!mask(state.groups[n.index].id)&&!timeline::styleVisible(state.groups[n.index].layerStyles))container(id,out,area);else{auto pixels=source(id,area);merge(id,out,pixels);}}};
  std::vector<Pixel> pixels(count,0);container(0,pixels,tile);std::copy(pixels.begin(),pixels.end(),output.begin()+std::size_t(y)*width);y+=int(h);
 }return output;
}

}
