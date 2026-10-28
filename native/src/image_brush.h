// Copyright (c) 2026 MoonSprite contributors; legacy/LICENSE.
// Native adaptation of tools-brush.ts brushMaskOffsets / paintBrush.
#pragma once
#include "pattern_fill.h"
namespace moon {
struct ImageBrushSample {int x,y,coverage;std::optional<std::uint32_t> color;};
struct ImageBrushStamp {int width,height;std::vector<ImageBrushSample> samples;bool intrinsicSize=true;};
inline ImageBrushStamp prepareImageBrushStamp(const PatternBrush& image,int size,double angle,PatternPaintMode mode=PatternPaintMode::Paint,int centerX=0,int centerY=0,int patternOriginX=0,int patternOriginY=0){
 if(!image.intrinsicSize)mode=PatternPaintMode::Paint;
 const auto count=std::uint64_t(image.width)*image.height;if(image.width<1 || image.height<1 || count>16*1024*1024 || image.coverage.size()!=count || (!image.colors.empty() && image.colors.size()!=count) || (!image.paintColors.empty() && image.paintColors.size()!=count))throw std::invalid_argument("Invalid image brush pixels");if(!std::isfinite(angle))throw std::invalid_argument("Invalid image brush angle");
 const int sourceWidth=image.intrinsicSize?image.width:std::max(1,size),sourceHeight=image.intrinsicSize?image.height:std::max(1,size);
 const double radians=std::fmod(angle,360)*3.14159265358979323846/180,c=std::cos(radians),s=std::sin(radians);ImageBrushStamp out{std::max(1,int(std::ceil(sourceWidth*std::abs(c)+sourceHeight*std::abs(s)-1e-9))),std::max(1,int(std::ceil(sourceWidth*std::abs(s)+sourceHeight*std::abs(c)-1e-9))),{}};
 if(std::abs(std::fmod(angle,360))<.0001){out.width=sourceWidth;out.height=sourceHeight;} out.intrinsicSize=image.intrinsicSize&&mode==PatternPaintMode::Paint;static constexpr int bayer[16]={0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5};
 const auto& colors=image.paintColors.empty()?image.colors:image.paintColors;
 for(int y=0;y<out.height;++y)for(int x=0;x<out.width;++x){const double ox=x-(out.width-1)/2.0,oy=y-(out.height-1)/2.0;const int sx=int(std::floor(c*ox+s*oy+(sourceWidth-1)/2.0+.5)),sy=int(std::floor(-s*ox+c*oy+(sourceHeight-1)/2.0+.5));if(sx<0 || sy<0 || sx>=sourceWidth || sy>=sourceHeight)continue;const int originX=centerX-out.width/2,originY=centerY-out.height/2;const int sampleX=mode==PatternPaintMode::Source?originX+sx-image.sourceX:mode==PatternPaintMode::Target?originX+sx-patternOriginX:sx,sampleY=mode==PatternPaintMode::Source?originY+sy-image.sourceY:mode==PatternPaintMode::Target?originY+sy-patternOriginY:sy;const int imageX=mode!=PatternPaintMode::Paint?patternWrapped(sampleX,image.width):image.intrinsicSize?sx:std::min(image.width-1,sx*image.width/sourceWidth),imageY=mode!=PatternPaintMode::Paint?patternWrapped(sampleY,image.height):image.intrinsicSize?sy:std::min(image.height-1,sy*image.height/sourceHeight);const auto i=std::size_t(imageY)*image.width+imageX;const int coverage=colors.empty()?(image.intrinsicSize?image.coverage[i]:(image.coverage[i]>bayer[(sy&3)*4+(sx&3)]*16?255:0)):(colors[i]>>24)?255:0;if(coverage)out.samples.push_back({x,y,coverage,colors.empty()?std::optional<std::uint32_t>{}:std::optional<std::uint32_t>{colors[i]}});}return out;
}

// Legacy imageBrushMaskCache keeps at most four coordinate phases, FIFO.
// Target origin is the first center minus the UNROTATED brush anchor.
class ImageBrushPatternSampler {
 PatternBrush image_;PatternPaintMode mode_;int targetX_,targetY_;
 struct Cached{int phaseX,phaseY,size;double angle;ImageBrushStamp stamp;};
 std::vector<Cached> cached_;
public:
 ImageBrushPatternSampler(const PatternBrush& image,PatternPaintMode mode,int firstX,int firstY):image_(image),mode_(mode),targetX_(firstX-image.width/2),targetY_(firstY-image.height/2){}
 const ImageBrushStamp& at(int centerX,int centerY,int size,double angle){const int x=patternWrapped(centerX,image_.width),y=patternWrapped(centerY,image_.height);for(const auto& p:cached_)if(p.phaseX==x&&p.phaseY==y&&p.size==size&&p.angle==angle)return p.stamp;if(cached_.size()>=4)cached_.erase(cached_.begin());cached_.push_back({x,y,size,angle,prepareImageBrushStamp(image_,size,angle,mode_,centerX,centerY,targetX_,targetY_)});return cached_.back().stamp;}
};
inline std::uint32_t imageBrushDirectPixel(std::uint32_t source,int coverage,int opacity){const int scaled=int(std::floor(coverage*std::clamp(opacity,0,100)/100.0+.5));return (source&0xffffff)|(std::uint32_t(std::floor((source>>24)*scaled/255.0+.5))<<24);}
}
