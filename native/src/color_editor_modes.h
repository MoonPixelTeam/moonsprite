#pragma once
#include <algorithm>
#include <sstream>
#include <string>
#include <vector>

namespace moon::color_editor {
// file-preferences.ts: order and enabled state are independent.
struct Mode { std::string id; bool enabled; };
inline const std::vector<Mode>& defaults(){
  static const std::vector<Mode> value{{"hsv",true},{"rgb",true},{"lab",true},{"gray",true},{"palette",true},{"hsl",false},{"cmyk",false}};
  return value;
}
inline bool operator==(const Mode& a,const Mode& b){return a.id==b.id&&a.enabled==b.enabled;}
inline int catalogIndex(const std::string& id){for(int i=0;i<int(defaults().size());++i)if(defaults()[i].id==id)return i;return -1;}
inline int preferenceIndex(const std::string& key){
  const std::string prefix="colorLayers.mode.";
  return key.size()==prefix.size()+1&&key.rfind(prefix,0)==0&&key.back()>='0'&&key.back()<='6'?key.back()-'0':-1;
}
inline std::vector<Mode> normalize(const std::vector<Mode>& input){
  std::vector<Mode> result;
  for(const auto& item:input)if(catalogIndex(item.id)>=0&&std::none_of(result.begin(),result.end(),[&](const auto& v){return v.id==item.id;}))result.push_back(item);
  const std::vector<Mode> old{{"rgb",true},{"hsv",true},{"hsl",true},{"gray",true},{"lab",true},{"cmyk",true}};
  if(result==old)return defaults();
  for(const auto& item:defaults())if(std::none_of(result.begin(),result.end(),[&](const auto& v){return v.id==item.id;}))result.push_back(item);
  if(std::none_of(result.begin(),result.end(),[](const auto& v){return v.enabled;}))result.front().enabled=true;
  return result;
}
inline bool enabled(const std::vector<Mode>& modes,int index){
  for(const auto& item:modes)if(item.id==defaults().at(index).id)return item.enabled;
  return defaults().at(index).enabled;
}
inline bool setEnabled(std::vector<Mode>& modes,int index,bool value){
  for(auto& item:modes)if(item.id==defaults().at(index).id){
    if(!value&&item.enabled&&std::count_if(modes.begin(),modes.end(),[](const auto& v){return v.enabled;})==1)return false;
    item.enabled=value;return true;
  }
  return false;
}
// PreferencesDialog.reorderPreferenceItems: disabled rows participate equally.
inline bool reorder(std::vector<Mode>& items,const std::string& source,const std::string& target,bool after){
  const auto from=std::find_if(items.begin(),items.end(),[&](const auto& v){return v.id==source;});
  if(from==items.end()||source==target)return false;
  auto next=items;auto item=*from;next.erase(next.begin()+(from-items.begin()));
  auto to=std::find_if(next.begin(),next.end(),[&](const auto& v){return v.id==target;});
  if(to==next.end())return false;
  next.insert(to+(after?1:0),item);if(next==items)return false;items=std::move(next);return true;
}
// Native editor-preferences uses a quoted line record instead of localStorage JSON.
inline std::string encode(const std::vector<Mode>& modes){std::ostringstream out;for(const auto& item:normalize(modes))out<<item.id<<' '<<(item.enabled?"true":"false")<<' ';return out.str();}
inline std::vector<Mode> decode(const std::string& text){
  std::istringstream input(text);std::vector<Mode> items;std::string id,value;
  while(input>>id){if(!(input>>value)||(value!="true"&&value!="false"))return defaults();items.push_back({id,value=="true"});}
  return normalize(items);
}
}
