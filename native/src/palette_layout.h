#pragma once
#include <algorithm>
#include <vector>
namespace moon {
struct PaletteGridLayout {std::vector<int> slots;int columns=1,rows=1;};
// legacy core/palette-layout.ts fitPaletteSlotsToGrid: preserve occupied x/y.
inline PaletteGridLayout fitPaletteSlotsToGrid(const std::vector<int>& source,int sourceColumns,int requestedColumns,int requestedRows=1){
 sourceColumns=std::clamp(sourceColumns,1,256);PaletteGridLayout out;out.columns=std::clamp(requestedColumns,1,256);out.rows=std::max(1,requestedRows);
 for(std::size_t i=0;i<source.size();++i)if(source[i]){out.columns=std::max(out.columns,int(i%sourceColumns)+1);out.rows=std::max(out.rows,int(i/sourceColumns)+1);}
 out.slots.resize(std::size_t(out.columns)*out.rows);for(std::size_t i=0;i<source.size();++i)if(source[i])out.slots[i/sourceColumns*out.columns+i%sourceColumns]=source[i];return out;
}
struct PaletteSlotRange {std::size_t left,top,right,bottom;};
inline PaletteSlotRange paletteSlotRange(int columns,std::size_t start,std::size_t end){columns=std::clamp(columns,1,256);return {std::min(start%columns,end%columns),std::min(start/columns,end/columns),std::max(start%columns,end%columns),std::max(start/columns,end/columns)};}
}
