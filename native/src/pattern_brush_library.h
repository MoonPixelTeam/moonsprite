#pragma once
#include "pattern_brush_import.h"
#include <filesystem>
#include <optional>
namespace moon {
struct StoredPatternBrush {std::string id,name,filePath;bool intrinsicSize=true;std::optional<int> sourceX,sourceY;std::string folderId;};
struct StoredPatternBrushFolder {std::string id,name,filePath;};
struct PatternBrushListing {std::filesystem::path directory;std::vector<StoredPatternBrush> brushes;std::vector<StoredPatternBrushFolder> folders;};
class PatternBrushLibrary {
 std::filesystem::path directory_;
 static std::string cleanName(const std::string&);
public: static bool safeId(const std::string&);
private:
 std::vector<std::string> readOrder() const; void writeOrder(const std::vector<std::string>&) const;
public:
 explicit PatternBrushLibrary(std::filesystem::path);
 PatternBrushListing list() const;
 StoredPatternBrush save(std::string,const std::vector<std::uint8_t>&,bool=true,std::optional<int> = {},std::optional<int> = {});
 StoredPatternBrushFolder createFolder(std::string name,const std::string& parent={});
 StoredPatternBrushFolder renameFolder(const std::string& id,std::string name);
 void removeFolder(const std::string& id);
 StoredPatternBrush move(const std::string& id,const std::string& folder={});
 void remove(const std::string&); void reorder(const std::vector<std::string>&);
};
// Legacy BrushLibraryPanel.tsx selection is panel-local; selected IDs are click
// ordered, so pattern brush cycling preserves actual selection order.
struct PatternBrushSelection {
 std::vector<std::string> ids;std::string anchor,active;
 void select(const std::vector<std::string>& ordered,const std::string& id,bool ctrl=false,bool shift=false){
  auto has=[&](const std::string& value){return std::find(ids.begin(),ids.end(),value)!=ids.end();};
  if(!ctrl&&!shift&&ids.size()==1&&ids[0]==id)ids.clear();
  else if(shift&&!anchor.empty()){auto a=std::find(ordered.begin(),ordered.end(),anchor),b=std::find(ordered.begin(),ordered.end(),id);if(!ctrl)ids.clear();if(a==ordered.end()||b==ordered.end()){if(!has(id))ids.push_back(id);}else{if(a>b)std::swap(a,b);for(;a<=b;++a)if(!has(*a))ids.push_back(*a);}}
  else if(ctrl){auto found=std::find(ids.begin(),ids.end(),id);if(found==ids.end())ids.push_back(id);else ids.erase(found);anchor=id;}
  else {ids={id};anchor=id;}
  active=has(id)?id:ids.empty()?std::string{}:ids.back();
 }
 void removed(const std::string& id){ids.erase(std::remove(ids.begin(),ids.end(),id),ids.end());if(active==id)active=ids.empty()?std::string{}:ids.back();if(anchor==id)anchor.clear();}
};}

