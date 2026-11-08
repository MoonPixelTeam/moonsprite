#pragma once
// home-banner.ts metadata/resolution; path comparison reuses native Unicode casing.
#include "home_sections.h"
#include "recent_projects.h"
#include <map>
#include <functional>
#include <cmath>
namespace moon::home {
struct Banner {std::string id,kind,projectName,asset,name,author,url,path;std::int64_t modified=0;};
inline std::vector<Banner> bannerDefinitions(){const std::string url="https://moonpx.art/user/220430763143860224/feed?tab=latest";return {
 {"filter-test-90y","project",u8"城堡.moonsprite",{}, {},"90y",url},
 {"fire-banner","image",{},"home-banner-fire",u8"火焰之境","90y",url},
 {"crystal-banner","image",{},"home-banner-crystal",u8"月球基底","90y",url},
 {"coast-banner","image",{},"home-banner-coast",u8"沙船","90y",url},
 {"hall-banner","image",{},"home-banner-hall",u8"大厅","90y",url},
 {"stone-lion-banner","image",{},"home-banner-stone-lion",u8"石狮",u8"线框","https://moonpx.art/user/220437406669737984/feed?tab=latest"},
 {"contempt-banner","image",{},"home-banner-contempt",u8"蔑视",u8"月猫","https://moonpx.art/user/219346946735869952/feed?tab=latest"}};}
inline std::string bannerKey(std::string name){auto slash=name.find_last_of("/\\");if(slash!=std::string::npos)name.erase(0,slash+1);auto lower=name;std::transform(lower.begin(),lower.end(),lower.begin(),[](unsigned char c){return char(std::tolower(c));});const std::string extension=".moonsprite";if(lower.size()>=extension.size()&&lower.compare(lower.size()-extension.size(),extension.size(),extension)==0)name.resize(name.size()-extension.size());static const SystemCasing casing;if(!casing.lower)throw std::runtime_error("System Unicode casing is unavailable");auto v=wide(name);if(v.empty())return {};UErrorCode error=U_ZERO_ERROR;int count=casing.lower(nullptr,0,reinterpret_cast<const UChar*>(v.data()),int(v.size()),"",&error);if(error!=U_BUFFER_OVERFLOW_ERROR&&U_FAILURE(error))throw std::runtime_error("Cannot normalize banner identity");std::wstring out(count,L'\0');error=U_ZERO_ERROR;casing.lower(reinterpret_cast<UChar*>(out.data()),count,reinterpret_cast<const UChar*>(v.data()),int(v.size()),"",&error);if(U_FAILURE(error))throw std::runtime_error("Cannot normalize banner identity");return utf8(out);}
struct BannerProject {std::string path,name;std::int64_t modified;};
inline std::vector<Banner> resolveBanners(const std::vector<Banner>& definitions,const std::vector<BannerProject>& projects){std::map<std::string,const BannerProject*> byName;for(const auto& p:projects)byName.emplace(bannerKey(p.name.empty()?p.path:p.name),&p);std::vector<Banner> out;for(auto b:definitions){if(b.kind=="image"){out.push_back(std::move(b));continue;}if(b.projectName.empty())continue;auto match=byName.find(bannerKey(b.projectName));if(match==byName.end())continue;b.path=match->second->path;b.name=match->second->name;b.modified=match->second->modified;out.push_back(std::move(b));}return out;}
inline std::vector<Banner> resolveBannerRecords(const std::vector<Banner>& definitions,const std::vector<recent::Project>& projects){std::vector<BannerProject> inputs;for(const auto& p:projects)inputs.push_back({p.path,std::filesystem::u8path(p.path).stem().u8string(),p.lastOpened});return resolveBanners(definitions,inputs);}

inline std::vector<Banner> shuffleBanners(std::vector<Banner> values,const std::function<double()>& random){for(std::size_t i=values.size();i>1;--i){auto j=std::size_t(std::floor(random()*i));std::swap(values[i-1],values.at(j));}return values;}
}
