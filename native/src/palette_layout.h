#pragma once
#include <algorithm>
#include <vector>
#include <unordered_set>
#include <limits>
namespace moon {
// Native representation of legacy null. Zero is a real palette identity.
// Keep four-byte slot/history storage; preview IDs -1..-4096 remain distinct.
inline constexpr int EmptyPaletteSlot=std::numeric_limits<int>::min();
// Legacy order preserves duplicate real IDs; missing IDs are display-only gaps.
template<class Entries> std::vector<int> visiblePaletteOrder(const Entries& entries,const std::vector<int>& order){
 std::unordered_set<int> available;for(const auto& e:entries)available.insert(e.id);std::vector<int> out;out.reserve(order.size());for(int id:order)if(available.count(id))out.push_back(id);return out;
}
inline std::vector<int> paletteOrderFromSlots(const std::vector<int>& slots){std::unordered_set<int> seen;std::vector<int> out;for(int id:slots)if(id!=EmptyPaletteSlot&&seen.insert(id).second)out.push_back(id);return out;}
// legacy normalizePaletteSlots: retain valid first placements, fill holes in
// distinct visible-order sequence, retain trailing rows. A monotonic hole cursor
// avoids repeated prefix scans without changing the placement result.
template<class Entries> std::vector<int> normalizePaletteSlots(const Entries& entries,const std::vector<int>& order,const std::vector<int>& source,int columns){
 columns=std::clamp(columns,1,256);const auto visible=paletteOrderFromSlots(visiblePaletteOrder(entries,order));std::unordered_set<int> allowed(visible.begin(),visible.end()),placed;
 const auto cols=std::size_t(columns),count=std::max(source.size(),visible.size());std::vector<int> slots(std::max(cols,((count+cols-1)/cols)*cols),EmptyPaletteSlot);
 for(std::size_t i=0;i<source.size();++i)if(source[i]!=EmptyPaletteSlot&&allowed.count(source[i])&&placed.insert(source[i]).second)slots[i]=source[i];
 std::size_t hole=0;for(int id:visible)if(placed.insert(id).second){while(hole<slots.size()&&slots[hole]!=EmptyPaletteSlot)++hole;if(hole==slots.size())slots.resize(slots.size()+cols,EmptyPaletteSlot);slots[hole++]=id;}return slots;
}
struct PaletteGridLayout {std::vector<int> slots;int columns=1,rows=1;};
// legacy core/palette-layout.ts fitPaletteSlotsToGrid: preserve occupied x/y.
inline PaletteGridLayout fitPaletteSlotsToGrid(const std::vector<int>& source,int sourceColumns,int requestedColumns,int requestedRows=1){
 sourceColumns=std::clamp(sourceColumns,1,256);PaletteGridLayout out;out.columns=std::clamp(requestedColumns,1,256);out.rows=std::max(1,requestedRows);
 for(std::size_t i=0;i<source.size();++i)if(source[i]!=EmptyPaletteSlot){out.columns=std::max(out.columns,int(i%sourceColumns)+1);out.rows=std::max(out.rows,int(i/sourceColumns)+1);}
 out.slots.resize(std::size_t(out.columns)*out.rows,EmptyPaletteSlot);for(std::size_t i=0;i<source.size();++i)if(source[i]!=EmptyPaletteSlot)out.slots[i/sourceColumns*out.columns+i%sourceColumns]=source[i];return out;
}
struct PaletteSlotRange {std::size_t left,top,right,bottom;};
inline PaletteSlotRange paletteSlotRange(int columns,std::size_t start,std::size_t end){columns=std::clamp(columns,1,256);return {std::min(start%columns,end%columns),std::min(start/columns,end/columns),std::max(start%columns,end%columns),std::max(start/columns,end/columns)};}
}
