#pragma once
#include "timeline_model.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <sstream>
#include <string>
#include <vector>
namespace moon {
inline const std::vector<timeline::Pixel>& defaultLayerDisplayColors(){static const std::vector<timeline::Pixel> colors{0xff5053efu,0xff26a7ffu,0xff35d8fdu,0xff6abb66u,0xffdac626u,0xffff7929u,0xffbc47abu};return colors;}
inline std::vector<timeline::Pixel> normalizeLayerDisplayColors(const std::vector<std::array<double,3>>& input){std::vector<timeline::Pixel> result;for(const auto& channels:input){if(std::any_of(channels.begin(),channels.end(),[](double n){return !std::isfinite(n)||n<0||n>255;}))continue;auto c=timeline::Pixel(0xff000000u);for(int i=0;i<3;++i)c|=timeline::Pixel(std::floor(channels[i]+.5))<<(8*i);if(std::find(result.begin(),result.end(),c)==result.end())result.push_back(c);if(result.size()==12)break;}return result.empty()?defaultLayerDisplayColors():result;}
inline std::vector<timeline::Pixel> normalizeLayerDisplayColors(const std::vector<timeline::Pixel>& input){std::vector<std::array<double,3>> colors;for(auto c:input)colors.push_back({double(c&255),double((c>>8)&255),double((c>>16)&255)});return normalizeLayerDisplayColors(colors);}
inline std::string encodeLayerDisplayColors(const std::vector<timeline::Pixel>& input){std::ostringstream out;for(auto c:normalizeLayerDisplayColors(input))out<<std::hex<<c<<' ';return out.str();}
inline std::vector<timeline::Pixel> decodeLayerDisplayColors(const std::string& text){std::istringstream in(text);std::vector<timeline::Pixel> colors;std::uint64_t c;while(in>>std::hex>>c)if(c<=0xffffffffu)colors.push_back(timeline::Pixel(c));return in.eof()?normalizeLayerDisplayColors(colors):defaultLayerDisplayColors();}
inline timeline::Pixel nextAvailableLayerDisplayColor(const timeline::State& state,const std::vector<timeline::Pixel>& input){const auto colors=normalizeLayerDisplayColors(input);std::vector<std::size_t> usage(colors.size());for(std::size_t i=0;i<colors.size();++i){for(const auto& layer:state.layers)usage[i]+=layer.displayColor&&*layer.displayColor==colors[i];for(const auto& group:state.groups)usage[i]+=group.displayColor&&*group.displayColor==colors[i];}return colors[std::min_element(usage.begin(),usage.end())-usage.begin()];}
}
