#pragma once
#include "raster_geometry.h"
namespace moon {
// legacy history.ts: small points normalize through the current palette;
// dense region patches preserve raw IDs and the expanded storage address.
// Callers preparing an edit before publication may supply the unchanged owner.
// The same legacy point threshold/rectangle then builds the after side from deltas.
template<class Edit,class Read> void pixelEditDenseHistory(Edit& edit,int width,int height,Read read,bool sourceIsBefore=false){
 if(edit.pixels.size()<256)return;int left=width,top=height,right=0,bottom=0;for(const auto& delta:edit.pixels){const int x=int(delta.index%width),y=int(delta.index/width);left=std::min(left,x);top=std::min(top,y);right=std::max(right,x+1);bottom=std::max(bottom,y+1);}
 if(std::size_t(right-left)*(bottom-top)>edit.pixels.size()*3)return;
 // A stroke records canvas addresses while selection/liquify edits record
 // owner-local addresses. Read the patch in the caller's capture space.
 decltype(edit.contentHistory.dense) prepared;auto& dense=prepared.emplace();dense.x=left;dense.y=top;dense.width=right-left;dense.height=bottom-top;
 dense.after.reserve(std::size_t(dense.width)*dense.height);
 for(int y=top;y<bottom;++y)for(int x=left;x<right;++x)dense.after.push_back(read(x,y));dense.before=dense.after;
 for(const auto& delta:edit.pixels)(sourceIsBefore?dense.after:dense.before)[(delta.index/width-top)*dense.width+delta.index%width-left]=sourceIsBefore?delta.after:delta.before;
 edit.contentHistory.dense=std::move(prepared);edit.pixels.clear();
}
template<class Edit> void indexedSelectionDenseHistory(Edit& edit,const timeline::Surface& after,bool sourceIsBefore=false){
 pixelEditDenseHistory(edit,after.width,after.height,[&](int x,int y){return after.pixels[std::size_t(y)*after.width+x];},sourceIsBefore);
}
template<class Edit> void indexedSelectionHistory(Edit& edit,const std::string& celId,const timeline::Surface& before,const timeline::Surface& after){
 edit.contentHistory.targetCelId=celId;edit.contentHistory.pixelAddress={after.width,after.height,after.storageOriginX.value_or(0),after.storageOriginY.value_or(0)};
 for(int y=0;y<after.height;++y)for(int x=0;x<after.width;++x){const auto i=std::size_t(y)*after.width+x;const auto old=raster::readWorld(before,std::int64_t(after.offsetX)+x,std::int64_t(after.offsetY)+y);if(old!=after.pixels[i])edit.pixels.push_back({i,old,after.pixels[i]});}
 indexedSelectionDenseHistory(edit,after);
}
}
