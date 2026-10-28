#pragma once
#include <cstdint>
#include <map>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>
#include <algorithm>
#include <cctype>
namespace moon::extension {
struct EventEnvelope { std::string sessionId, extensionId, type, payload; std::uint64_t sequence=0; };
class SessionRegistry {
 std::map<std::string,std::string> owners_; std::map<std::string,std::uint64_t> next_;
public:
 void open(const std::string& session,const std::string& extension){if(session.empty()||extension.empty())throw std::invalid_argument("empty session");if(!owners_.emplace(session,extension).second)throw std::runtime_error("session exists");next_[session]=1;}
 void close(const std::string& session){owners_.erase(session);next_.erase(session);}
 EventEnvelope emit(const std::string& session,const std::string& type,std::string payload){auto it=owners_.find(session);if(it==owners_.end())throw std::runtime_error("unknown session");return {session,it->second,type,std::move(payload),next_[session]++};}
 bool owns(const std::string& session,const std::string& extension)const{auto it=owners_.find(session);return it!=owners_.end()&&it->second==extension;}
};
inline std::vector<std::string> localeEvents(const std::string& initial,const std::vector<std::string>& changes){std::vector<std::string> out;std::string last=initial;if(!initial.empty())out.push_back(initial);for(const auto& c:changes)if(!c.empty()&&c!=last){out.push_back(c);last=c;}return out;}
struct FileDropPolicy { bool enabled=true; std::size_t maxBytes=12u*1024u*1024u; std::vector<std::string> extensions; std::uint64_t generation=0; };
inline bool acceptFileDrop(const FileDropPolicy& p,const std::string& name,std::size_t bytes,std::uint64_t generation){if(!p.enabled||generation!=p.generation||bytes>p.maxBytes)return false;auto dot=name.find_last_of('.');if(dot==std::string::npos)return false;std::string ext=name.substr(dot+1);std::transform(ext.begin(),ext.end(),ext.begin(),[](unsigned char c){return char(std::tolower(c));});for(auto allowed:p.extensions){std::transform(allowed.begin(),allowed.end(),allowed.begin(),[](unsigned char c){return char(std::tolower(c));});if(ext==allowed)return true;}return false;}
class HostLifecycle { bool active_=true; FileDropPolicy drop_; std::vector<std::string> windows_,pending_; public: void addWindow(std::string w){windows_.push_back(std::move(w));} void addPendingRead(std::string r){pending_.push_back(std::move(r));} void deactivate(){active_=false;windows_.clear();drop_.enabled=false;++drop_.generation;pending_.clear();} bool active()const{return active_;} std::size_t windowCount()const{return windows_.size();} std::size_t pendingCount()const{return pending_.size();} const FileDropPolicy& dropPolicy()const{return drop_;} };
}
