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
// legacy palette.ts comparePaletteColors(luminance): use its full tie order.
inline bool importedLess(std::uint32_t a,std::uint32_t b){
 auto values=[](std::uint32_t c){struct V{double maximum,saturation,hue;bool achromatic;};const double r=(c&255)/255.,g=((c>>8)&255)/255.,b=((c>>16)&255)/255.;const auto hi=std::max({r,g,b}),lo=std::min({r,g,b}),range=hi-lo;double hue=0;if(range>0){if(hi==r)hue=((g-b)/range+(g<b?6:0))*60;else if(hi==g)hue=((b-r)/range+2)*60;else hue=((r-g)/range+4)*60;}return V{hi,hi==0?0:range/hi,hue,range<=8/255.};};
 double difference=lum(a)-lum(b);if(difference)return difference<0;const auto x=values(a),y=values(b);difference=x.maximum-y.maximum;if(difference)return difference<0;if(x.achromatic!=y.achromatic)return x.achromatic;
 if(!x.achromatic){difference=x.hue-y.hue;if(difference)return difference<0;difference=y.saturation-x.saturation;if(difference)return difference<0;}
 if((a>>24)!=(b>>24))return (a>>24)>(b>>24);return a<b;
}
}
inline std::vector<std::uint32_t> extractImportedPalette(const std::vector<std::vector<std::uint32_t>>& surfaces,int requestedLimit=256,std::size_t maximumSamples=262144){
 int limit=std::clamp(requestedLimit,1,4096);std::size_t total=0;for(auto& s:surfaces)total+=s.size();std::size_t samples=std::max<std::size_t>(1,maximumSamples),stride=std::max<std::size_t>(1,total/samples+(total%samples!=0));std::unordered_map<std::uint32_t,std::size_t> indices;std::vector<detail::WColor> unique;std::size_t idx=0;
 for(auto& s:surfaces)for(auto c:s){bool sample=(idx++%stride)==0;if(sample && (c>>24)){auto [found,inserted]=indices.emplace(c,unique.size());if(inserted)unique.push_back({c,1});else ++unique[found->second].n;}}
 if(unique.size()<=std::size_t(limit)){std::vector<std::uint32_t> out;for(auto& x:unique)out.push_back(x.c);std::sort(out.begin(),out.end(),detail::importedLess);return out;}
 std::vector<std::vector<detail::WColor>> buckets{unique};while(buckets.size()<std::size_t(limit)){int bi=-1,bc=0;std::uint64_t bs=0;for(int i=0;i<int(buckets.size());i++){if(buckets[i].size()<2)continue;int r=detail::range(buckets[i],bc);std::uint64_t weight=0;for(auto& x:buckets[i])weight+=x.n;auto score=std::uint64_t(r)*weight;if(score>bs){bs=score;bi=i;}}if(bi<0)break;int channel=0;detail::range(buckets[bi],channel);auto sorted=buckets[bi];std::sort(sorted.begin(),sorted.end(),[&](auto&a,auto&b){return a.ch(channel)!=b.ch(channel)?a.ch(channel)<b.ch(channel):a.c<b.c;});std::uint64_t totalN=0;for(auto&x:sorted)totalN+=x.n;std::uint64_t acc=0;std::size_t cut=1;for(;cut<sorted.size();cut++){acc+=sorted[cut-1].n;if(acc*2>=totalN)break;}if(cut==sorted.size())break;buckets[bi]={std::vector<detail::WColor>(sorted.begin(),sorted.begin()+cut)};buckets.insert(buckets.begin()+bi+1,std::vector<detail::WColor>(sorted.begin()+cut,sorted.end()));}
 std::vector<std::uint32_t> out;std::unordered_set<std::uint32_t> seen;auto frequency=[](const auto& a,const auto& b){return a.n!=b.n?a.n>b.n:a.c<b.c;};for(auto& b:buckets){std::uint64_t n=0,s[4]={};for(auto&x:b){n+=x.n;for(int k=0;k<4;k++)s[k]+=x.n*x.ch(k);}std::uint32_t c=0;for(int k=0;k<4;k++)c|=std::uint32_t((s[k]+n/2)/n)<<(k*8);if(seen.count(c)){auto candidates=b;std::sort(candidates.begin(),candidates.end(),frequency);auto next=std::find_if(candidates.begin(),candidates.end(),[&](const auto& item){return !seen.count(item.c);});if(next==candidates.end())continue;c=next->c;}seen.insert(c);out.push_back(c);}
 // Preserve requested count when median-cut buckets share a weighted average.
 const auto target=std::min(std::size_t(limit),unique.size());if(out.size()<target){std::sort(unique.begin(),unique.end(),frequency);for(const auto& item:unique){if(!seen.insert(item.c).second)continue;out.push_back(item.c);if(out.size()==target)break;}}
 std::sort(out.begin(),out.end(),detail::importedLess);return out;
}
}
