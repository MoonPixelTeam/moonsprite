#pragma once
#include <algorithm>
#include <cstdint>
#include <functional>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace moon::extension {
// Adapter for extension-file-drop.ts. Registration identity survives a read;
// replacing even an equivalent registration invalidates its pending delivery.
class FileDropRouter {
 struct Registration { std::string id; std::vector<std::string> suffixes; };
 std::vector<std::shared_ptr<const Registration>> handlers_;
 static std::string lower(std::string text) {
  for(auto& c:text)if(c>='A'&&c<='Z')c=char(c-'A'+'a');return text;
 }
 static std::string suffix(const std::string& path) {
  const auto dot=path.find_last_of('.');if(dot==std::string::npos||dot+1==path.size())return {};
  if(path.find_first_of("/\\",dot)!=std::string::npos)return {};
  return lower(path.substr(dot));
 }
 auto find(const std::string& id) const {
  return std::find_if(handlers_.begin(),handlers_.end(),[&](const auto& p){return p->id==id;});
 }
 auto find(const std::string& id) {
  return std::find_if(handlers_.begin(),handlers_.end(),[&](const auto& p){return p->id==id;});
 }
public:
 using Bytes=std::vector<std::uint8_t>;
 static constexpr std::size_t maxBytes=12u*1024u*1024u;
 struct Pending {
  std::string name;
 private:
  std::shared_ptr<const Registration> registration;
  friend class FileDropRouter;
 };
 void setTypes(const std::string& id,std::vector<std::string> suffixes) {
  if(suffixes.size()>16)throw std::invalid_argument("Invalid extension file-drop suffixes");
  for(auto& s:suffixes){
   if(s.size()<2||s.size()>17||s[0]!='.'||!std::all_of(s.begin()+1,s.end(),[](unsigned char c){return (c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9');}))throw std::invalid_argument("Invalid extension file-drop suffixes");
   s=lower(std::move(s));
  }
  auto registration=std::make_shared<const Registration>(Registration{id,std::move(suffixes)});
  auto it=find(id);if(it==handlers_.end())handlers_.push_back(std::move(registration));else *it=std::move(registration);
 }
 void clear(const std::string& id) {auto it=find(id);if(it!=handlers_.end())handlers_.erase(it);}
 bool accepts(const std::string& path)const {return bool(begin(path).registration);}
 Pending begin(const std::string& path)const {
  Pending pending;const auto slash=path.find_last_of("/\\");pending.name=path.substr(slash==std::string::npos?0:slash+1);
  const auto ext=suffix(pending.name);if(ext.empty())return pending;
  for(const auto& h:handlers_)if(std::find(h->suffixes.begin(),h->suffixes.end(),ext)!=h->suffixes.end()){pending.registration=h;break;}
  return pending;
 }
 using Dispatch=std::function<bool(const std::string&,const std::string&,const Bytes&)>;
 void complete(const Pending& pending,const Bytes& bytes,const Dispatch& dispatch)const {
  if(!pending.registration)throw std::logic_error("Unmatched extension drop");
  if(bytes.size()>maxBytes)throw std::runtime_error("Extension import file exceeds 12 MiB");
  const auto it=find(pending.registration->id);
  if(it==handlers_.end()||*it!=pending.registration||!dispatch(pending.registration->id,pending.name,bytes))throw std::runtime_error("Extension file-drop handler is no longer available");
 }
 // The platform may instead call begin/complete around asynchronous reads on
 // its event thread. Callbacks receive basename and owned bytes, never a path.
 std::vector<std::string> route(const std::vector<std::string>& paths,
  const std::function<Bytes(const std::string&)>& read,const Dispatch& dispatch,
  const std::function<void(const std::string&)>& report)const {
  std::vector<std::string> remaining;
  for(const auto& path:paths){const auto pending=begin(path);if(!pending.registration){remaining.push_back(path);continue;}
   try{const auto bytes=read(path);complete(pending,bytes,dispatch);}catch(const std::exception& e){report(e.what());}
  }
  return remaining;
 }
};
}
