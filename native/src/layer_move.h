#pragma once
#include "timeline_model.h"
#include <algorithm>
namespace moon {
// legacy canvas-move-selection.ts: distinguish implicit current cel and explicit layer/frame/cel targets.
inline std::vector<std::string> layerMoveCelIds(const timeline::Timeline& timeline,const std::vector<std::string>& layers,const std::vector<std::string>& cells,const std::vector<std::string>& frames,const std::string& frame,const std::string& target,bool moveAll,bool frameSelection){
 std::vector<std::string> out;auto add=[&](const std::string& layer,const std::string& f){if(auto c=timeline.findCel(layer,f))out.push_back(c->id);};
 if(frameSelection&&!frames.empty()&&!layers.empty()){for(auto l:layers)for(const auto& f:timeline.state().frames)if(std::find(frames.begin(),frames.end(),f.id)!=frames.end())add(l,f.id);return out;}
 bool implicit=cells.size()==layers.size();for(auto id:cells){const auto* c=timeline.findCelById(id);if(!c||c->frameId!=frame||std::find(layers.begin(),layers.end(),c->layerId)==layers.end())implicit=false;}
 if(moveAll&&!layers.empty()&&(cells.empty()||implicit)){for(auto l:layers)for(const auto& f:timeline.state().frames)add(l,f.id);return out;}
 const auto* current=timeline.findCel(target,frame);if(current&&std::find(cells.begin(),cells.end(),current->id)!=cells.end())return cells;
 if(frames.size()>1){for(auto f:frames)add(target,f);return out;}if(moveAll){for(auto l:layers)add(l,frame);}else add(target,frame);return out;
}
}
