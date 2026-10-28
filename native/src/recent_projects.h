#pragma once
#include <algorithm>
#include <chrono>
#include <cctype>
#include <cstdint>
#include <iomanip>
#include <set>
#include <sstream>
#include <string>
#include <vector>
namespace moon::recent {
struct Project {std::string path;std::int64_t lastOpened=0;bool pinned=false;};
inline std::string baseName(const std::string& path){const auto at=path.find_last_of("/\\");return at==std::string::npos?path:path.substr(at+1);}
inline bool supported(const std::string& path){const auto dot=path.find_last_of('.');if(dot==std::string::npos)return false;auto extension=path.substr(dot+1);for(auto& c:extension)c=char(std::tolower(static_cast<unsigned char>(c)));for(const auto* allowed:{"moonsprite","ase","aseprite","png","jpg","jpeg","webp","bmp","gif"})if(extension==allowed)return true;return false;}
inline void normalize(std::vector<Project>& values,bool cap=true){std::stable_partition(values.begin(),values.end(),[](const auto& item){return item.pinned;});if(cap&&values.size()>24)values.resize(24);}
inline bool record(std::vector<Project>& values,const std::string& path,std::int64_t now){if(!supported(path))return false;bool pinned=false;for(const auto& value:values)if(value.path==path){pinned=value.pinned;break;}values.erase(std::remove_if(values.begin(),values.end(),[&](const auto& value){return value.path==path;}),values.end());values.insert(values.begin(),{path,now,pinned});normalize(values);return true;}
inline void togglePin(std::vector<Project>& values,const std::string& path){for(auto& value:values)if(value.path==path)value.pinned=!value.pinned;normalize(values);}
inline void remove(std::vector<Project>& values,const std::string& path){values.erase(std::remove_if(values.begin(),values.end(),[&](const auto& value){return value.path==path;}),values.end());normalize(values);}
inline void clear(std::vector<Project>& values){values.erase(std::remove_if(values.begin(),values.end(),[](const auto& value){return !value.pinned;}),values.end());normalize(values);}
inline void reorder(std::vector<Project>& values,const std::vector<std::string>& paths){std::vector<Project> next;std::set<std::string> seen;for(const auto& path:paths)for(const auto& item:values)if(item.path==path&&seen.insert(path).second){next.push_back(item);break;}for(const auto& item:values)if(seen.insert(item.path).second)next.push_back(item);normalize(next);values=std::move(next);}
inline std::string encode(const std::vector<Project>& values){std::ostringstream out;out<<"moonsprite-recent-v2\n";for(const auto& value:values)out<<std::quoted(value.path)<<' '<<value.lastOpened<<' '<<value.pinned<<'\n';return out.str();}
inline std::vector<Project> decode(const std::string& text,bool legacy=false){std::vector<Project> out;std::istringstream in(text);if(!legacy){std::string tag;std::getline(in,tag);if(tag!="moonsprite-recent-v2")return out;}std::string row;while(std::getline(in,row)){std::istringstream line(row);Project value;if(!(line>>std::quoted(value.path))||value.path.empty()||value.path.size()>32768)continue;if(!legacy&&!(line>>value.lastOpened>>value.pinned))continue;out.push_back(std::move(value));}normalize(out,false);return out;}
inline std::int64_t now(){return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();}
}
