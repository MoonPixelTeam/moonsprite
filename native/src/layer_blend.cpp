#include "layer_blend.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <memory>
#include <mutex>
#include <stdexcept>
namespace moon {namespace {
using M=LayerBlendMode;using V=std::array<double,3>;
constexpr std::array<std::string_view,24> names={"normal","darken","multiply","color-burn","linear-burn","lighten","screen","color-dodge","linear-dodge","overlay","soft-light","hard-light","vivid-light","linear-light","pin-light","hard-mix","difference","exclusion","subtract","divide","hue","saturation","color","luminosity"};
std::size_t index(M m){auto i=static_cast<std::size_t>(m);if(i>=names.size())throw std::invalid_argument("Unknown layer blend mode");return i;}
unsigned byte(double v){if(std::isnan(v))return 0;return static_cast<unsigned>(std::clamp(std::floor(v+.5),0.,255.));}
double channel(double b,double t,M m){switch(m){
case M::Darken:return std::min(b,t);case M::Multiply:return b*t/255;
case M::ColorBurn:return t<=0?0:255-std::min(255.,((255-b)*255)/t);
case M::LinearBurn:return std::max(0.,b+t-255);case M::Lighten:return std::max(b,t);
case M::Screen:return 255-((255-b)*(255-t))/255;
case M::ColorDodge:return t>=255?255:std::min(255.,b*255/(255-t));case M::LinearDodge:return std::min(255.,b+t);
case M::Overlay:return b<128?2*b*t/255:255-2*(255-b)*(255-t)/255;
case M::HardLight:return t<128?2*b*t/255:255-2*(255-b)*(255-t)/255;
case M::SoftLight:{auto bn=b/255,tn=t/255;auto curve=bn<=.25?((16*bn-12)*bn+4)*bn:std::sqrt(bn);return 255*(tn<=.5?bn-(1-2*tn)*bn*(1-bn):bn+(2*tn-1)*(curve-bn));}
case M::VividLight:return t<128?channel(b,t*2,M::ColorBurn):channel(b,(t-128)*2,M::ColorDodge);
case M::LinearLight:return std::clamp(b+2*t-255,0.,255.);case M::PinLight:return t<128?std::min(b,t*2):std::max(b,(t-128)*2);
case M::HardMix:return channel(b,t,M::VividLight)<128?0:255;case M::Difference:return std::abs(b-t);
case M::Exclusion:return b+t-2*b*t/255;case M::Subtract:return std::max(0.,b-t);case M::Divide:return t<=0?255:std::min(255.,b*255/t);default:return t;}}
bool nonseparable(M m){return m==M::Hue||m==M::Saturation||m==M::Color||m==M::Luminosity;}
const double* tableFor(M m){auto i=index(m);if(m==M::Normal||nonseparable(m))return nullptr;static std::array<std::once_flag,24> once;static std::array<std::unique_ptr<double[]>,24> tables;std::call_once(once[i],[i,m]{auto data=std::make_unique<double[]>(256*256);for(int b=0;b<256;++b)for(int t=0;t<256;++t)data[b*256+t]=channel(b,t,m);tables[i]=std::move(data);});return tables[i].get();}
double lum(const V& v){return .3*v[0]+.59*v[1]+.11*v[2];}
double sat(const V& v){return *std::max_element(v.begin(),v.end())-*std::min_element(v.begin(),v.end());}
V clip(V v){auto l=lum(v),lo=*std::min_element(v.begin(),v.end()),hi=*std::max_element(v.begin(),v.end());if(lo<0)for(auto&c:v)c=l+(c-l)*l/(l-lo);if(hi>1)for(auto&c:v)c=l+(c-l)*(1-l)/(hi-l);return v;}
V setLum(V v,double l){const auto before=lum(v);for(auto&c:v)c=c+l-before;return clip(v);}
V setSat(const V& v,double s){V out{};std::array<int,3> order={0,1,2};std::stable_sort(order.begin(),order.end(),[&](int a,int b){return v[a]<v[b];});int lo=order[0],mid=order[1],hi=order[2];if(v[hi]>v[lo]){out[mid]=(v[mid]-v[lo])*s/(v[hi]-v[lo]);out[hi]=s;}out[lo]=0;return out;}
V nonsep(const V&b,const V&t,M m){switch(m){case M::Hue:return setLum(setSat(t,sat(b)),lum(b));case M::Saturation:return setLum(setSat(b,sat(t)),lum(b));case M::Color:return setLum(t,lum(b));default:return setLum(b,lum(t));}}
std::uint32_t blend(std::uint32_t bottom,std::uint32_t top,double opacity,M mode,const double* table){unsigned ba=bottom>>24,ta=top>>24;double a=ta/255.*opacity,b=ba/255.,total=a+b*(1-a);if(total<=0)return 0;V bv={double(bottom&255),double((bottom>>8)&255),double((bottom>>16)&255)},tv={double(top&255),double((top>>8)&255),double((top>>16)&255)},mixed=tv;if(mode!=M::Normal&&ba){if(nonseparable(mode)){V bn=bv,tn=tv;for(int i=0;i<3;++i){bn[i]/=255;tn[i]/=255;}mixed=nonsep(bn,tn,mode);for(auto&c:mixed)c*=255;}else for(int i=0;i<3;++i)mixed[i]=table[unsigned(bv[i])*256+unsigned(tv[i])];}std::uint32_t result=byte(total*255)<<24;for(int i=0;i<3;++i)result|=byte((mixed[i]*a+bv[i]*b*(1-a))/total)<<(i*8);return result;}
}
std::optional<LayerBlendMode> parseLayerBlendMode(std::string_view name){auto it=std::find(names.begin(),names.end(),name);if(it==names.end())return {};return static_cast<M>(it-names.begin());}
std::string_view layerBlendModeName(M m){return names[index(m)];}
std::uint32_t blendLayerPixel(std::uint32_t b,std::uint32_t t,double o,M m){if(!std::isfinite(o)||o<0||o>1)throw std::invalid_argument("Invalid layer blend opacity");index(m);return blend(b,t,o,m,(b>>24)&&m!=M::Normal&&!nonseparable(m)?tableFor(m):nullptr);}
void blendLayerRow(std::uint32_t* out,const std::uint32_t* src,std::size_t count,double o,M m){if(!std::isfinite(o)||o<0||o>1)throw std::invalid_argument("Invalid layer blend opacity");index(m);const double* table=nullptr;for(std::size_t i=0;i<count;++i){if(!table&&(out[i]>>24)&&m!=M::Normal&&!nonseparable(m))table=tableFor(m);out[i]=blend(out[i],src[i],o,m,table);}}
}
