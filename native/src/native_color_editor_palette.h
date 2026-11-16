#pragma once
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

namespace moon {
struct ColorEditorPaletteEntry {
  int id=0;
  std::u32string name;
  std::uint32_t color=0;
  bool operator==(const ColorEditorPaletteEntry& other)const{return id==other.id&&name==other.name&&color==other.color;}
};
// ColorValueControl.activePaletteEntries: last duplicate ID wins; render only
// the independent palette order, retaining real ID zero and repeated entries.
template<class Entries,class Order>
std::vector<ColorEditorPaletteEntry> colorEditorPalette(const Entries& entries,const Order& order){
  std::unordered_map<int,const typename Entries::value_type*> byId;
  for(const auto& entry:entries)byId[entry.id]=&entry;
  std::vector<ColorEditorPaletteEntry> result;result.reserve(order.size());
  for(int id:order)if(const auto found=byId.find(id);found!=byId.end()){
    const auto& entry=*found->second;result.push_back({entry.id,entry.name,entry.color});
  }
  return result;
}
}
