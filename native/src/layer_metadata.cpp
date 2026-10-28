#include "layer_metadata.h"
#include <algorithm>
#include <cmath>
#include <unordered_set>
namespace moon {namespace {
bool trimSpace(char32_t c){return(c>=9&&c<=13)||c==32||c==0xa0||c==0x1680||(c>=0x2000&&c<=0x200a)||c==0x2028||c==0x2029||c==0x202f||c==0x205f||c==0x3000||c==0xfeff;}
std::size_t utf16Length(const std::u32string& s){std::size_t n=0;for(auto c:s)n+=c>0xffff?2:1;return n;}
}
std::u32string trimLayerDescription(const std::u32string& s){auto first=std::find_if_not(s.begin(),s.end(),trimSpace),last=std::find_if_not(s.rbegin(),s.rend(),trimSpace).base();return first>=last?std::u32string{}:std::u32string(first,last);}
std::optional<std::uint32_t> normalizeLayerDisplayColor(double r,double g,double b,double a){if(!std::isfinite(r)||!std::isfinite(g)||!std::isfinite(b)||!std::isfinite(a))return {};auto byte=[](double v){return std::uint32_t(std::clamp(std::floor(v+.5),0.,255.));};return byte(r)|(byte(g)<<8)|(byte(b)<<16)|(byte(a)<<24);}
std::vector<LayerMetadataSnapshot> captureLayerMetadata(const timeline::State& s,const std::vector<std::string>& ids){std::vector<LayerMetadataSnapshot> out;std::unordered_set<std::string> seen;for(const auto& id:ids)if(seen.insert(id).second){auto it=std::find_if(s.layers.begin(),s.layers.end(),[&](const auto& l){return l.id==id;});if(it!=s.layers.end())out.push_back({id,it->displayColor,it->description});}return out;}
void applyLayerMetadata(timeline::State& s,const std::vector<LayerMetadataSnapshot>& values){for(const auto& v:values){auto it=std::find_if(s.layers.begin(),s.layers.end(),[&](const auto& l){return l.id==v.layerId;});if(it!=s.layers.end()){it->displayColor=v.displayColor;it->description=v.description;}}}
std::size_t layerMetadataHistoryBytes(const LayerMetadataSnapshot& b,const LayerMetadataSnapshot& a,const std::u32string& bn,const std::u32string& an){return 64+utf16Length(bn)+utf16Length(an)+utf16Length(b.description)+utf16Length(a.description);}
}
