#pragma once
#include <algorithm>
#include <vector>
namespace moon {
struct PaletteGrowthPreview {std::vector<int> slots,removedIds;std::size_t added=0,handleSlot=0;int columns=1;};
// legacy PalettePanel.tsx buildPaletteGrowthPreview; negative IDs preview black.
inline PaletteGrowthPreview paletteGrowthPreview(const std::vector<int>& base,int columns,std::size_t pointer){
 PaletteGrowthPreview p;p.columns=std::max(1,columns);p.handleSlot=std::max(std::size_t(1),std::min(base.size()+4096,pointer));
 p.slots.assign(base.begin(),base.begin()+std::min(base.size(),p.handleSlot));
 for(std::size_t i=base.size();i<p.handleSlot;++i)p.slots.push_back(-int(++p.added));
 for(std::size_t i=p.handleSlot;i<base.size();++i)if(base[i])p.removedIds.push_back(base[i]);
 return p;
}
}
