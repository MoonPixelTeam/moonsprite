#pragma once
#include "pattern_brush_import.h"
#include <filesystem>
#include <optional>
#include <algorithm>
#include <map>
#include <cctype>
#include <cstdint>
namespace moon {
// Legacy BrushLibraryPanel.tsx moveBrushIds retains base order.
inline std::vector<std::string> reorderedPatternBrushIds(const std::vector<std::string>& base,const std::vector<std::string>& moving,const std::string& target,bool after){auto contains=[&](const std::string& id){return std::find(moving.begin(),moving.end(),id)!=moving.end();};std::vector<std::string> remaining,ordered;for(const auto& id:base)(contains(id)?ordered:remaining).push_back(id);if(target.empty()){remaining.insert(remaining.end(),ordered.begin(),ordered.end());return remaining;}auto at=std::find(remaining.begin(),remaining.end(),target);if(at==remaining.end())return base;if(after)++at;remaining.insert(at,ordered.begin(),ordered.end());return remaining;}

struct StoredPatternBrush {std::string id,name,filePath;bool intrinsicSize=true;std::optional<int> sourceX,sourceY;std::string folderId;};
struct StoredPatternBrushFolder {std::string id,name,filePath;};
struct PatternBrushListing {std::filesystem::path directory;std::vector<StoredPatternBrush> brushes;std::vector<StoredPatternBrushFolder> folders;};

// Legacy document-drop.ts/service path filtering and one-second deduplication.
class PatternBrushDropPaths {
 std::map<std::string,std::int64_t> recent_;
 static std::string lower(std::string value);
public:
 static std::string normalize(std::string value){
 const auto first=value.find_first_not_of(std::string{' ',char(9),char(10),char(13)}),last=value.find_last_not_of(std::string{' ',char(9),char(10),char(13)});if(first==std::string::npos)return {};value=value.substr(first,last-first+1);if(!value.empty()&&value.front()=='"')value.erase(value.begin());if(!value.empty()&&value.back()=='"')value.pop_back();if(lower(value.substr(0,5))!="file:")return value;
 const auto original=value;std::string path=value.substr(5),host;if(path.rfind("//",0)==0){const auto slash=path.find('/',2);if(slash==std::string::npos){host=path.substr(2);path="/";}else{host=path.substr(2,slash-2);path=path.substr(slash);}}
 std::string decoded;auto hex=[](char c){if(c>='0'&&c<='9')return c-'0';if(c>='a'&&c<='f')return c-'a'+10;if(c>='A'&&c<='F')return c-'A'+10;return -1;};for(std::size_t i=0;i<path.size();++i){if(path[i]!='%'){decoded+=path[i];continue;}if(i+2>=path.size())return original;const int a=hex(path[i+1]),b=hex(path[i+2]);if(a<0||b<0)return original;decoded+=char(a*16+b);i+=2;}
 if(!host.empty()&&lower(host)!="localhost")decoded=std::string(2,char(92))+host+decoded;else if(decoded.size()>2&&decoded[0]=='/'&&std::isalpha(static_cast<unsigned char>(decoded[1]))&&decoded[2]==':')decoded.erase(decoded.begin());std::replace(decoded.begin(),decoded.end(),'/',char(92));return decoded;
 }
 static bool supported(const std::string& value){const auto path=lower(value);for(const auto* suffix:{".moonsprite",".moonsprite.bak",".msext",".png",".jpg",".jpeg",".webp",".bmp",".gif",".psd",".ase",".aseprite"}){const std::string ending=suffix;if(path.size()>=ending.size()&&path.compare(path.size()-ending.size(),ending.size(),ending)==0)return true;}return false;}
 std::vector<std::string> fresh(const std::vector<std::string>& paths,std::int64_t now){for(auto it=recent_.begin();it!=recent_.end();)if(now-it->second>=1000)it=recent_.erase(it);else ++it;std::vector<std::string> result;for(const auto& raw:paths){auto path=normalize(raw);if(path.empty()||!supported(path))continue;auto key=lower(path);if(recent_.count(key))continue;recent_[key]=now;result.push_back(std::move(path));}return result;}
};
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
 void moveGroup(const std::vector<std::string>& ids,const std::string& folder);
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

