#pragma once
#include "extension_file_drop.h"
#include <filesystem>
#include <fstream>
#include <map>
#include <set>
#include <winrt/base.h>
namespace moon::extension {
class ResourceCatalog {
 std::filesystem::path root_;std::map<std::string,std::string> resources_;
 static std::string lower(std::string text){for(auto& c:text)if(c>='A'&&c<='Z')c=char(c-'A'+'a');return text;}
 static bool idValid(const std::string& id){return !id.empty()&&id.size()<=80&&id.front()!='.'&&id.back()!='.'&&id.find("..")==std::string::npos&&std::all_of(id.begin(),id.end(),[](unsigned char c){return (c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='.'||c=='-'||c=='_';});}
 static std::filesystem::path relative(const std::string& text){
  if(text.empty()||text.size()>240||text.front()=='/'||text.front()=='~'||text.find('\\')!=std::string::npos)throw std::invalid_argument("扩展运行时资源路径无效。");
  std::filesystem::path result;std::size_t start=0;
  for(;;){const auto end=text.find('/',start);const auto part=text.substr(start,end==std::string::npos?end:end-start);const auto wide=winrt::to_hstring(part);
   if(part.empty()||part=="."||part==".."||part.back()=='.'||part.back()==' '||std::any_of(wide.begin(),wide.end(),[](wchar_t c){return c<32||(c>=127&&c<=159)||c==':'||c=='*'||c=='?'||c=='"'||c=='<'||c=='>'||c=='|';}))throw std::invalid_argument("扩展运行时资源路径无效。");
   const auto stem=lower(part.substr(0,part.find('.')));if(stem=="con"||stem=="prn"||stem=="aux"||stem=="nul"||(stem.size()==4&&(stem.substr(0,3)=="com"||stem.substr(0,3)=="lpt")&&stem[3]>='1'&&stem[3]<='9'))throw std::invalid_argument("扩展包包含 Windows 保留文件名。");
   result/=std::filesystem::path(std::wstring(wide));if(end==std::string::npos)break;start=end+1;
  }return result;
 }
public:
 static std::filesystem::path packagePath(const std::string& text){return relative(text);}
 static constexpr std::size_t maxBytes=16u*1024u*1024u;
 ResourceCatalog(std::filesystem::path root,std::string entry,std::map<std::string,std::string> resources):root_(std::move(root)),resources_(std::move(resources)){
  if(resources_.size()>64)throw std::invalid_argument("扩展运行时资源不能超过 64 个。");std::set<std::string> ids;
  for(const auto& r:resources_){if(!idValid(r.first)||!ids.insert(lower(r.first)).second)throw std::invalid_argument("扩展运行时资源 ID 无效或重复。");relative(r.second);if(lower(r.second)=="manifest.json"||r.second==entry)throw std::invalid_argument("扩展运行时资源不能指向受保护入口。");}
 }
 FileDropRouter::Bytes read(const std::string& id)const{
  if(!idValid(id))throw std::invalid_argument("无效的扩展资源 ID。");auto it=resources_.find(id);if(it==resources_.end())throw std::invalid_argument("扩展运行时资源不存在。");
  std::ifstream input(root_/relative(it->second),std::ios::binary);if(!input)throw std::runtime_error("无法读取扩展运行时资源。");FileDropRouter::Bytes bytes;char chunk[65536];
  while(input){input.read(chunk,sizeof(chunk));auto count=std::size_t(input.gcount());if(count>maxBytes-bytes.size())throw std::length_error("扩展运行时资源超过大小限制。");bytes.insert(bytes.end(),chunk,chunk+count);}if(input.bad())throw std::runtime_error("无法读取扩展运行时资源。");return bytes;
 }
};
}
