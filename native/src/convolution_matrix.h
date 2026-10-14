#pragma once
#include "selection_model.h"
#include <array>
#include <atomic>
#include <cstdint>
#include <functional>
#include <numeric>
#include <stdexcept>
#include <string>
namespace moon {
// Port of legacy/core/convolution-matrix.ts; native surfaces use full-canvas RGBA storage.
struct ConvolutionPreset {std::string id,family;int size;std::vector<int> weights;int divisor,bias;std::array<bool,4> channels;};
struct ConvolutionOptions {std::string presetId="blur-3x3";std::array<bool,4> channels{true,true,true,true};bool tiled=false;};
inline const std::vector<ConvolutionPreset>& convolutionPresets(){
 static const auto presets=[](){std::vector<ConvolutionPreset> out;const std::array<bool,4> rgba{true,true,true,true},rgb{true,true,true,false},alpha{false,false,false,true};
 auto kernel=[&](std::string id,std::string family,int size,auto weight,std::array<bool,4> channels,std::optional<int> divisor={},std::optional<int> bias={}){std::vector<int> weights;int sum=0;for(int y=-size/2;y<=size/2;++y)for(int x=-size/2;x<=size/2;++x){int w=weight(x,y);weights.push_back(w);sum+=w;}out.push_back({id,family,size,std::move(weights),divisor.value_or(std::abs(sum)?std::abs(sum):1),bias.value_or(sum>0?0:sum==0?128:255),channels});};
 kernel("brightness","tone",1,[](int,int){return 1;},rgb,1,8);kernel("darken","tone",1,[](int,int){return 1;},rgb,1,-8);kernel("negative","tone",1,[](int,int){return -1;},rgb);
 kernel("blur-3x3","blur",3,[](int x,int y){return (2-std::abs(x))*(2-std::abs(y));},rgba);
 for(int n:{5,7,9,17})kernel("blur-"+std::to_string(n)+"x"+std::to_string(n),"blur",n,[n](int x,int y){return n-std::abs(x)-std::abs(y);},rgba);
 for(int n:{5,9,17}){kernel("blur-"+std::to_string(n)+"x1","blur",n,[](int,int y){return y==0?1:0;},rgba);kernel("blur-1x"+std::to_string(n),"blur",n,[](int x,int){return x==0?1:0;},rgba);}
 for(int n:{3,5,7})kernel("sharpen-"+std::to_string(n)+"x"+std::to_string(n),"sharpen",n,[n](int x,int y){return x==0&&y==0?2*(n*n-1):-1;},rgba,n*n-1,0);
 kernel("edges-find","edges",3,[](int x,int y){return x==0&&y==0?8:-1;},rgba,1,0);kernel("edges-horizontal","edges",3,[](int,int y){return y==0?2:-1;},rgb,1,0);kernel("edges-vertical","edges",3,[](int x,int){return x==0?2:-1;},rgb,1,0);kernel("contour","edges",3,[](int x,int y){return x==0&&y==0?-8:1;},rgb,1,255);kernel("emboss","emboss",3,[](int x,int y){return x+y;},rgb,1,128);kernel("emboss-reverse","emboss",3,[](int x,int y){return -x-y;},rgb,1,128);
 for(int n:{3,5,7,9,17}){int r=n/2;auto id="drunk-"+std::to_string(n)+"x"+std::to_string(n);kernel(id+"_x","drunk",n,[r](int x,int y){return (std::abs(x)==r&&std::abs(y)==r)||(x==0&&y==0)?1:0;},rgba);kernel(id+"_+","drunk",n,[r](int x,int y){return (std::abs(x)==r&&y==0)||(std::abs(y)==r&&x==0)||(x==0&&y==0)?1:0;},rgba);kernel(id+"_o","drunk",n,[r](int x,int y){return int(std::floor(std::hypot(x,y)+.5))==r?1:0;},rgba);}
 kernel("outline-cross","outline",3,[](int x,int y){return x==0||y==0?255:0;},alpha,1,0);kernel("outline-square","outline",3,[](int,int){return 255;},alpha,1,0);return out;}();return presets;
}
inline std::optional<std::vector<std::uint32_t>> convolvePixels(const std::vector<std::uint32_t>& input,int width,int height,const ConvolutionOptions& options,const std::optional<SelectionMask>& selection={},const std::function<bool()>& cancelled=[](){return false;}){
 const auto& presets=convolutionPresets();auto found=std::find_if(presets.begin(),presets.end(),[&](const auto& p){return p.id==options.presetId;});if(found==presets.end())throw std::invalid_argument("Unknown convolution matrix: "+options.presetId);const auto& p=*found;
 if(width<=0 || height<=0 || input.size()!=std::size_t(width)*height)throw std::invalid_argument("Invalid convolution surface");
 int left=width,top=height,right=0,bottom=0;for(int y=0;y<height;++y){if(cancelled())return {};for(int x=0;x<width;++x)if(input[std::size_t(y)*width+x]>>24){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x+1);bottom=std::max(bottom,y+1);}}
 const int radius=p.size/2;bool content=right>left;bool fillsEmpty=options.channels[3]&&p.bias!=0&&p.divisor!=std::accumulate(p.weights.begin(),p.weights.end(),0);if((!content&&!fillsEmpty)||std::none_of(options.channels.begin(),options.channels.end(),[](bool b){return b;}))return {};
 bool full=fillsEmpty||(options.tiled&&(left<radius||top<radius||right+radius>width||bottom+radius>height));left=std::max(0,full?0:left-radius);top=std::max(0,full?0:top-radius);right=std::min(width,full?width:right+radius);bottom=std::min(height,full?height:bottom+radius);if(selection){left=std::max(left,selection->x);top=std::max(top,selection->y);right=std::min(right,selection->x+selection->width);bottom=std::min(bottom,selection->y+selection->height);}if(right<=left||bottom<=top)return {};
 struct Tap{int x,y,w;};std::vector<Tap> taps;for(int i=0;i<int(p.weights.size());++i)if(p.weights[i])taps.push_back({i%p.size-radius,i/p.size-radius,p.weights[i]});auto output=input;auto coordinate=[&](int v,int n){return options.tiled?(v%n+n)%n:std::clamp(v,0,n-1);};
 for(int y=top;y<bottom;++y)for(int x=left;x<right;++x){if((x-left)%128==0&&cancelled())return {};if(selection&&!selectionContains(selection,x,y))continue;std::array<long long,4> sum{};int divisor=p.divisor;for(auto tap:taps){auto value=input[std::size_t(coordinate(y+tap.y,height))*width+coordinate(x+tap.x,width)];if(!(value>>24)){divisor-=tap.w;continue;}for(int c=0;c<4;++c)sum[c]+=int((value>>(8*c))&255)*tap.w;}if(!divisor)continue;auto& value=output[std::size_t(y)*width+x];for(int c=0;c<4;++c)if(options.channels[c]){int next=int(std::clamp(sum[c]/(c==3?p.divisor:divisor)+p.bias,0LL,255LL));value=(value&~(std::uint32_t(255)<<(8*c)))|(std::uint32_t(next)<<(8*c));}}
 return cancelled()?std::optional<std::vector<std::uint32_t>>{}:std::optional<std::vector<std::uint32_t>>{std::move(output)};
}
}
