#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <unordered_map>
#include <unordered_set>
#include <vector>
namespace moon {
inline std::vector<std::uint32_t> extractPaletteScanline(const std::vector<std::uint32_t>& pixels,double requestedLimit=32){const int limit=std::isfinite(requestedLimit)?int(std::clamp(std::floor(requestedLimit+.5),1.0,4096.0)):requestedLimit>0?4096:1;std::unordered_set<std::uint32_t> seen;std::vector<std::uint32_t> result;for(auto color:pixels){if(!(color>>24)||!seen.insert(color).second)continue;result.push_back(color);if(result.size()==std::size_t(limit))break;}return result;}
inline std::vector<std::uint32_t> mergeExtractedPalette(const std::vector<std::uint32_t>& current,const std::vector<std::uint32_t>& incoming){auto result=current;std::unordered_set<std::uint32_t> seen(current.begin(),current.end());for(auto color:incoming)if(seen.insert(color).second)result.push_back(color);return result;}
namespace detail {
struct WColor { std::uint32_t c; std::uint64_t n; int ch(int i)const{return int((c>>(i*8))&255);} };
inline int range(const std::vector<WColor>& b,int& channel){int best=-1;channel=0;for(int k=0;k<4;k++){int lo=255,hi=0;for(auto& x:b){lo=std::min(lo,x.ch(k));hi=std::max(hi,x.ch(k));}if(hi-lo>best){best=hi-lo;channel=k;}}return best;}
inline double lin(int x){double v=x/255.0;return v<=.04045?v/12.92:std::pow((v+.055)/1.055,2.4);}
inline double lum(std::uint32_t c){return .2126*lin(c&255)+.7152*lin((c>>8)&255)+.0722*lin((c>>16)&255);}
}
inline std::vector<std::uint32_t> extractImportedPalette(const std::vector<std::vector<std::uint32_t>>& surfaces,int requestedLimit=256,std::size_t maximumSamples=262144){
 int limit=std::clamp(requestedLimit,1,4096);std::size_t total=0;for(auto& s:surfaces)total+=s.size();std::size_t stride=std::max<std::size_t>(1,(total+maximumSamples-1)/maximumSamples);std::unordered_map<std::uint32_t,std::uint64_t> counts;std::size_t idx=0;
 for(auto& s:surfaces)for(auto c:s){bool sample=(idx++%stride)==0;if(sample && (c>>24))counts[c]++;}
 std::vector<detail::WColor> unique;unique.reserve(counts.size());for(auto& [c,n]:counts)unique.push_back({c,n});if(unique.size()<=std::size_t(limit)){std::vector<std::uint32_t> out;for(auto& x:unique)out.push_back(x.c);std::sort(out.begin(),out.end(),[](auto a,auto b){return detail::lum(a)<detail::lum(b);});return out;}
 std::vector<std::vector<detail::WColor>> buckets{std::move(unique)};while(buckets.size()<std::size_t(limit)){int bi=-1,bc=0;std::uint64_t bs=0;for(int i=0;i<int(buckets.size());i++){if(buckets[i].size()<2)continue;int r=detail::range(buckets[i],bc);std::uint64_t weight=0;for(auto& x:buckets[i])weight+=x.n;auto score=std::uint64_t(r)*weight;if(score>bs){bs=score;bi=i;}}if(bi<0)break;int channel=0;detail::range(buckets[bi],channel);auto sorted=buckets[bi];std::sort(sorted.begin(),sorted.end(),[&](auto&a,auto&b){return a.ch(channel)!=b.ch(channel)?a.ch(channel)<b.ch(channel):a.c<b.c;});std::uint64_t totalN=0;for(auto&x:sorted)totalN+=x.n;std::uint64_t acc=0;std::size_t cut=1;for(;cut<sorted.size();cut++){acc+=sorted[cut-1].n;if(acc*2>=totalN)break;}buckets[bi]={std::vector<detail::WColor>(sorted.begin(),sorted.begin()+cut)};buckets.insert(buckets.begin()+bi+1,std::vector<detail::WColor>(sorted.begin()+cut,sorted.end()));}
 std::vector<std::uint32_t> out;for(auto& b:buckets){std::uint64_t n=0,s[4]={};for(auto&x:b){n+=x.n;for(int k=0;k<4;k++)s[k]+=x.n*x.ch(k);}std::uint32_t c=0;for(int k=0;k<4;k++)c|=std::uint32_t((s[k]+n/2)/n)<<(k*8);out.push_back(c);}std::sort(out.begin(),out.end(),[](auto a,auto b){return detail::lum(a)<detail::lum(b);});return out;
}
}
