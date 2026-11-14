#include "document.h"
#include <algorithm>
#include <unordered_map>
#include <stdexcept>

namespace moon {
PaletteState Document::capturePaletteEdit(int kind,int id) const {
  if(kind==1) return palette_;
  PaletteState state;state.columns=palette_.columns;state.entries.clear();state.slots.clear();
  state.primary=palette_.primary;state.secondary=palette_.secondary;
  if(kind==2) {state.independentOrder=palette_.independentOrder;state.slots=palette_.slots;state.selected=palette_.selected;state.primaryId=palette_.primaryId;}
  else if(const auto entry=paletteEntry(id)) state.entries.push_back(*entry);
  return state;
}

std::unique_ptr<Document::PaletteReplay> Document::preparePaletteEdit(const Edit& edit,bool redo)const{
 if(!edit.paletteHistory.beforePalette)return {};
 auto prepared=std::make_unique<PaletteReplay>();auto& target=*prepared;
 const auto& state=redo?*edit.paletteHistory.afterPalette:*edit.paletteHistory.beforePalette;
 const auto& view=redo?edit.paletteHistory.afterPaletteView:edit.paletteHistory.beforePaletteView;
 if(view){target.view.emplace(view);target.viewSerial=paletteViewRestoreSerial_+1;}
 const int kind=edit.paletteHistory.paletteKind;
 if(kind==13){
  // Color-mode history owns palette data, not selected swatches or role colors.
  target.entries=state.entries;target.order.emplace(state.independentOrder);
  target.slots=state.slots;target.columns=state.columns;target.nextId=state.nextId;
  return prepared;
 }
 if(kind==12||kind==7){target.full.emplace(state);if(kind==7){target.full->secondary=palette_.secondary;target.full->secondaryId=palette_.secondaryId;}return prepared;}
 if(kind==4||kind==11){
  std::unordered_map<int,const std::u32string*> names;names.reserve(state.entries.size());for(const auto& entry:state.entries)names[entry.id]=&entry.name;
  for(std::size_t i=0;i<palette_.entries.size();++i){const auto& entry=palette_.entries[i];if(kind==4&&entry.id!=edit.paletteHistory.colorId)continue;if(const auto found=names.find(entry.id);found!=names.end())target.patches.push_back({i,*found->second,{}});}
  if(kind==4)return prepared;
 }
 if(kind==8){
  std::unordered_map<int,Pixel> colors;colors.reserve(state.entries.size());for(const auto& entry:state.entries)colors[entry.id]=entry.color;
  for(std::size_t i=0;i<palette_.entries.size();++i)if(const auto found=colors.find(palette_.entries[i].id);found!=colors.end())target.patches.push_back({i,{},found->second});
  return prepared;
 }
 if(kind==3){
  Pixel before=0,after=0;for(const auto& entry:edit.paletteHistory.beforePalette->entries)if(entry.id==edit.paletteHistory.colorId)before=entry.color;
  for(const auto& entry:state.entries)if(entry.id==edit.paletteHistory.colorId)after=entry.color;
  for(std::size_t i=0;i<palette_.entries.size();++i)if(palette_.entries[i].id==edit.paletteHistory.colorId)target.patches.push_back({i,{},after});
  if(!redo){target.primary=state.primary;target.secondary=state.secondary;}
  else{if(palette_.primary==before)target.primary=after;if(palette_.secondary==before)target.secondary=after;}
  return prepared;
 }
 if(kind==1||kind==6||kind==10){target.entries=state.entries;target.nextId=state.nextId;}
 if(kind==1||kind==6)target.primary=state.primary;
 if(kind==6){target.secondary=state.secondary;return prepared;}
 target.order.emplace(state.independentOrder);target.slots=state.slots;
 if(kind!=5)target.columns=state.columns;
 if(kind!=9&&kind!=10){target.selected=state.selected;target.primaryId=state.primaryId;}
 return prepared;
}
void Document::exchangePaletteEdit(PaletteReplay& target)noexcept{
 if(target.full)std::swap(palette_,*target.full);
 if(target.entries)palette_.entries.swap(*target.entries);
 if(target.order)palette_.independentOrder.swap(*target.order);
 if(target.slots)palette_.slots.swap(*target.slots);
 if(target.selected)palette_.selected.swap(*target.selected);
 if(target.columns)std::swap(palette_.columns,*target.columns);
 if(target.nextId)std::swap(palette_.nextId,*target.nextId);
 if(target.primaryId)std::swap(palette_.primaryId,*target.primaryId);
 if(target.primary)std::swap(palette_.primary,*target.primary);
 if(target.secondary)std::swap(palette_.secondary,*target.secondary);
 for(auto& patch:target.patches){auto& entry=palette_.entries[patch.index];if(patch.name)entry.name.swap(*patch.name);if(patch.color)std::swap(entry.color,*patch.color);}
 if(target.view){paletteViewRestore_.swap(*target.view);std::swap(paletteViewRestoreSerial_,target.viewSerial);}
 target.applied=!target.applied;
}
void Document::applyPaletteEdit(const Edit& edit,bool redo,PaletteReplay* prepared){
 if(prepared){exchangePaletteEdit(*prepared);return;}
 if(auto target=preparePaletteEdit(edit,redo))exchangePaletteEdit(*target);
}
std::optional<std::size_t> Document::PaletteHistory::exclusiveBytes()const{
  if(paletteKind==3)return 32;
  if(paletteKind==1||paletteKind==2||paletteKind==4||paletteKind==7||paletteKind==9||paletteKind==10||paletteKind==11){
   if(!beforePalette||!afterPalette)throw std::logic_error("Incomplete palette history cost");
  }
  if(paletteKind==8&&!beforePalette)throw std::logic_error("Incomplete palette history cost");
  if(paletteKind==4&&(beforePalette->entries.empty()||afterPalette->entries.empty()))throw std::logic_error("Missing palette rename cost entry");
  if(paletteKind==4){const auto units=[](const std::u32string& name){return name.size()+std::count_if(name.begin(),name.end(),[](char32_t c){return c>0xffff;});};return (units(beforePalette->entries.front().name)+units(afterPalette->entries.front().name))*2+16;}
  if(paletteKind==8)return beforePalette->entries.size()*40;
  if(paletteKind==1||paletteKind==7)return (beforePalette->entries.size()+afterPalette->entries.size())*40+(beforePalette->slots.size()+afterPalette->slots.size())*4+64;
  if(paletteKind==2||paletteKind==11)return (beforePalette->order().size()+afterPalette->order().size()+beforePalette->slots.size()+afterPalette->slots.size()+beforePalette->selected.size()+afterPalette->selected.size())*4+32;

  if(paletteKind==10)return (beforePalette->entries.size()+afterPalette->entries.size())*40+(beforePalette->slots.size()+afterPalette->slots.size())*4;
  if(paletteKind==9)return (beforePalette->slots.size()+afterPalette->slots.size())*4;
  return {};
}
std::size_t Document::PaletteHistory::metadataBytes()const{
 if(paletteKind==12&&(!beforePalette||!afterPalette))throw std::logic_error("Incomplete palette metadata cost");
 std::size_t metadataBytes=0;if(paletteKind==12){for(const auto* p:{&*beforePalette,&*afterPalette}){metadataBytes+=p->entries.size()*sizeof(PaletteEntry)+(p->slots.size()+p->selected.size()+p->order().size())*sizeof(int);for(const auto& e:p->entries)metadataBytes+=e.name.size()*sizeof(char32_t);}}return metadataBytes;
}
std::size_t Document::PaletteHistory::snapshotBytes()const{
 std::size_t size=0;
  for(const auto* snapshot:{&beforePalette,&afterPalette}) if(*snapshot) {
    size+=sizeof(PaletteState)+(*snapshot)->slots.size()*sizeof(int)+(*snapshot)->selected.size()*sizeof(int)+((*snapshot)->independentOrder?(*snapshot)->independentOrder->size()*sizeof(int):0);
    for(const auto& entry:(*snapshot)->entries) size+=sizeof(PaletteEntry)+entry.name.size()*sizeof(char32_t);
  }
 return size;
}
}
