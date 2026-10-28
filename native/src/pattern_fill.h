#pragma once
#include "brush.h"
#include <map>
#include <stdexcept>
#include <optional>
#include <random>
namespace moon {
enum class FillTexture { Solid, Cracks, Wood, Grain };
enum class PatternMode { Default, Random, Regular };
struct PatternSettings {
 int randomDensity=100,randomCount=0,randomSpacing=0;bool randomOverlap=true;
 int regularCount=0,regularSpacingX=0,regularSpacingY=0;bool regularOverlap=false;int regularRowOffset=0;
};
struct PatternBrush {
 int width=0,height=0,sourceX=0,sourceY=0;bool intrinsicSize=true;
 std::vector<std::uint8_t> coverage;
 std::vector<std::uint32_t> colors,paintColors;
};
struct PatternFillOptions {
 FillTexture texture=FillTexture::Solid;int textureScale=1,brushSize=1;
 PatternMode mode=PatternMode::Default;PatternPaintMode paintMode=PatternPaintMode::Paint;
 bool thresholdMode=false,invert=false;int threshold=128,blackPoint=0,whitePoint=255;
 PatternSettings settings;std::vector<PatternBrush> brushes;std::optional<std::uint32_t> randomSeed;
};
inline int patternWrapped(int x,int length){return (x%length+length)%length;}
// The bitmaps are the actual legacy tools-pixel-edit.ts texturePatterns.
inline bool fillTextureContains(FillTexture texture,int x,int y,int scale=1){
 static constexpr const char* patterns[3][8]={
 {"10000000","01000100","00101100","00011000","00100100","01000010","10000001","00000000"},
 {"11101110","11011101","10111011","01110111","11101110","11011101","10111011","01110111"},
 {"10100110","01011001","10001010","00110100","11001001","01100010","10010110","01001001"}};
 if(texture==FillTexture::Solid)return true;scale=std::clamp(scale,1,16);
 return patterns[int(texture)-1][patternWrapped(int(std::floor(double(y)/scale)),8)][patternWrapped(int(std::floor(double(x)/scale)),8)]=='1';
}
struct PatternSample {int coverage=0;std::uint32_t color=0;bool hasColor=false;};
// Direct port of pattern-fill.ts spatial buckets and pattern-fill-sampler.ts.
class PatternFillSampler {
 struct Stamp {double x,y;std::size_t brush;};
 PatternFillOptions options_;std::uint32_t foreground_;int originX_=0,originY_=0;double cell_=1;
 std::vector<Stamp> stamps_;std::map<std::pair<int,int>,std::vector<std::size_t>> bins_;
 PatternSample source(std::size_t i,int x,int y)const{
  const auto& b=options_.brushes[i];const auto& colors=b.paintColors.empty()?b.colors:b.paintColors;
  if(colors.size()==std::size_t(b.width)*b.height){auto c=colors[patternWrapped(y,b.height)*b.width+patternWrapped(x,b.width)];return (c>>24)?PatternSample{255,c,true}:PatternSample{};}
  const int size=options_.paintMode==PatternPaintMode::Paint?std::max(1,options_.brushSize):std::max(b.width,b.height);
  const int sx=b.intrinsicSize?patternWrapped(x,b.width):patternWrapped(x,size)*b.width/size;
  const int sy=b.intrinsicSize?patternWrapped(y,b.height):patternWrapped(y,size)*b.height/size;
  int coverage=b.coverage[sy*b.width+sx];
  if(!b.intrinsicSize){static constexpr int dither[16]={0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5};if(options_.invert)coverage=255-coverage;coverage=std::clamp(int(std::lround((coverage-options_.blackPoint)*255.0/std::max(1,options_.whitePoint-options_.blackPoint))),0,255);coverage=options_.thresholdMode?(coverage>=options_.threshold?255:0):(coverage>dither[(patternWrapped(y,size)&3)*4+(patternWrapped(x,size)&3)]*16?255:0);}
  return {coverage,0,false};
 }
 template<class F> void buckets(const Stamp& s,double gap,F visit)const{
  const auto& b=options_.brushes[s.brush];
  for(int y=int(std::floor((s.y-b.height/2.0-gap)/cell_));y<=int(std::floor((s.y+b.height/2.0+gap)/cell_));++y)
   for(int x=int(std::floor((s.x-b.width/2.0-gap)/cell_));x<=int(std::floor((s.x+b.width/2.0+gap)/cell_));++x)visit(std::make_pair(x,y));
 }
 void add(Stamp s){auto index=stamps_.size();stamps_.push_back(s);buckets(s,0,[&](auto key){bins_[key].push_back(index);});}
public:
 PatternFillSampler(PatternFillOptions options,std::uint32_t foreground,int startX,int startY,int bx,int by,int bw,int bh):options_(std::move(options)),foreground_(foreground){
  if(options_.brushes.empty())return;
  for(const auto& b:options_.brushes)if(b.width<=0||b.height<=0||b.coverage.size()!=std::size_t(b.width)*b.height)throw std::invalid_argument("Invalid image brush dimensions/coverage");
  originX_=options_.paintMode==PatternPaintMode::Source?options_.brushes[0].sourceX:options_.paintMode==PatternPaintMode::Target?startX:0;
  originY_=options_.paintMode==PatternPaintMode::Source?options_.brushes[0].sourceY:options_.paintMode==PatternPaintMode::Target?startY:0;
  auto mode=options_.mode;if(mode==PatternMode::Default&&options_.brushes.size()>1){mode=PatternMode::Regular;options_.settings={};}if(mode==PatternMode::Default)return;
  auto& s=options_.settings;s.randomDensity=std::clamp(s.randomDensity,0,1000);s.randomCount=std::clamp(s.randomCount,0,100000);s.randomSpacing=std::clamp(s.randomSpacing,0,4096);s.regularCount=std::clamp(s.regularCount,0,100000);s.regularSpacingX=std::clamp(s.regularSpacingX,-4096,4096);s.regularSpacingY=std::clamp(s.regularSpacingY,-4096,4096);s.regularRowOffset=std::clamp(s.regularRowOffset,0,100);
  int mw=0,mh=0;double area=0;for(const auto& b:options_.brushes){mw=std::max(mw,b.width);mh=std::max(mh,b.height);area+=double(b.width)*b.height;}cell_=std::max(1.0,std::hypot(mw,mh)+(mode==PatternMode::Random?s.randomSpacing:0));if(bw<=0||bh<=0)return;
  auto next=[&](double x,double y){return Stamp{x,y,stamps_.size()%options_.brushes.size()};};
  if(mode==PatternMode::Regular){double dx=std::max(1,mw+(s.regularOverlap?s.regularSpacingX:std::max(0,s.regularSpacingX))),dy=std::max(1,mh+(s.regularOverlap?s.regularSpacingY:std::max(0,s.regularSpacingY)));int limit=s.regularCount?s.regularCount:100000;
   for(int row=int(std::floor((by-originY_)/dy))-1;row<=int(std::ceil((by+bh-originY_)/dy));++row){double y=originY_+mh/2.0+row*dy;if(y+mh/2.0<=by||y-mh/2.0>=by+bh)continue;double offset=row%2?s.regularRowOffset/100.0*dx:0;
    for(int col=int(std::floor((bx-originX_-offset)/dx))-1;col<=int(std::ceil((bx+bw-originX_-offset)/dx));++col){double x=originX_+mw/2.0+col*dx+offset;if(x+mw/2.0<=bx||x-mw/2.0>=bx+bw)continue;if(int(stamps_.size())>=limit)return;auto stamp=next(x,y);const auto& b=options_.brushes[stamp.brush];if(x+b.width/2.0<=bx||x-b.width/2.0>=bx+bw||y+b.height/2.0<=by||y-b.height/2.0>=by+bh)continue;add(stamp);}}
  }else{std::uint32_t state=options_.randomSeed?*options_.randomSeed:std::random_device{}();auto random=[&](){state+=0x6d2b79f5u;auto v=(state^(state>>15))*(state|1u);v^=v+(v^(v>>7))*(v|61u);return double(v^(v>>14))/4294967296.0;};int target=std::min(100000,s.randomCount?s.randomCount:int(std::floor(double(bw)*bh/(area/options_.brushes.size())*s.randomDensity/100+.5)));int limit=target*(s.randomOverlap&&s.randomSpacing==0?1:12);
   for(int attempts=0;int(stamps_.size())<target&&attempts<limit;++attempts){const double rx=std::floor(bx+random()*bw)+.5,ry=std::floor(by+random()*bh)+.5;auto stamp=next(rx,ry);bool collision=false;if(!s.randomOverlap||s.randomSpacing){buckets(stamp,s.randomSpacing,[&](auto key){auto found=bins_.find(key);if(found==bins_.end())return;for(auto i:found->second){const auto& other=stamps_[i];const auto& b=options_.brushes[stamp.brush];const auto& ob=options_.brushes[other.brush];if(std::abs(stamp.x-other.x)<(b.width+ob.width)/2.0+s.randomSpacing&&std::abs(stamp.y-other.y)<(b.height+ob.height)/2.0+s.randomSpacing)collision=true;}});}if(!collision)add(stamp);}
  }
 }
 PatternSample sample(int x,int y)const{
  if(options_.brushes.empty())return {fillTextureContains(options_.texture,x,y,options_.textureScale)?255:0,0,false};
  if(options_.mode==PatternMode::Default&&options_.brushes.size()==1)return source(0,x-originX_,y-originY_);
  auto found=bins_.find({int(std::floor((x+.5)/cell_)),int(std::floor((y+.5)/cell_))});if(found==bins_.end())return {};
  double alpha=0,channels[3]={};for(auto it=found->second.rbegin();it!=found->second.rend();++it){const auto& stamp=stamps_[*it];const auto& b=options_.brushes[stamp.brush];int sx=int(std::floor(x+.5-stamp.x+b.width/2.0)),sy=int(std::floor(y+.5-stamp.y+b.height/2.0));if(sx<0||sy<0||sx>=b.width||sy>=b.height)continue;auto sampled=source(stamp.brush,sx,sy);if(sampled.coverage<=0)continue;auto color=sampled.hasColor?sampled.color:foreground_;double weight=(1-alpha)*(color>>24)/255.0*sampled.coverage/255.0;for(int c=0;c<3;++c)channels[c]+=((color>>(c*8))&255)*weight;alpha+=weight;if(alpha>=1)break;}
  if(alpha<=0)return {};std::uint32_t color=std::uint32_t(std::lround(alpha*255))<<24;for(int c=0;c<3;++c)color|=std::uint32_t(std::lround(channels[c]/alpha))<<(c*8);return {255,color,true};
 }
};
}
