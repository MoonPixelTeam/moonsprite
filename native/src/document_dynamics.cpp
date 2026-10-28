#include "document.h"
#include "brush_dynamics.h"
#include "selection_tools.h"
namespace moon {
void Document::configureStrokeDynamics(BrushOptions base,const PatternBrush* image,Pixel start,Pixel end,int dither){if(auto edit=freeTileSourceStrokeDocument()){edit->configureStrokeDynamics(base,image,start,end,dither);return;}if(!active_)return;dynamicStroke_=true;dynamicBase_=base;dynamicImage_=image?std::optional<PatternBrush>{*image}:std::nullopt;dynamicGradientStart_=start;dynamicGradientEnd_=end;dynamicDither_=dither;perfectPath_.clear();hasPreviousStamp_=false;}
void Document::dynamicStamp(BrushPathPoint sample){
 BrushOptions b=dynamicBase_;b.size=std::clamp(sample.size,1,64);b.opacity=std::clamp(sample.opacity,0,100);const auto footprint=selectionBrushFootprint(b,dynamics::rounded(sample.angle));
 const auto fallback=dynamicImage_&&!imagePattern_?std::optional<ImageBrushStamp>{prepareImageBrushStamp(*dynamicImage_,b.size,sample.angle)}:std::nullopt;const ImageBrushStamp* image=imagePattern_?&imagePattern_->at(sample.x,sample.y,b.size,sample.angle):fallback?&*fallback:nullptr;
 GradientSpec gradient;gradient.first=dynamicGradientStart_;gradient.last=dynamicGradientEnd_;gradient.dither=dynamicDither_;GradientSampler sampler(gradient);
 auto paint=[&](int x,int y,int coverage,std::optional<Pixel> imageColor){if(x<0||y<0||x>=width_||y>=height_||(selection_&&!selectionContains(selection_,x,y))||(!dynamicImage_&&!brushDitherContains(b,x,y)))return;
  Pixel source=sample.gradient?sampler.forAmount(*sample.gradient,x,y):imageColor.value_or(color_);if(sample.gradient&&imageColor)source=(source&0xffffff)|(Pixel(dynamics::rounded((source>>24)*(*imageColor>>24)/255.))<<24);
  const int amount=b.ink==InkMode::CopyAlphaColor?coverage:dynamics::rounded(coverage*b.opacity/100.);if(!amount)return;
  const auto index=std::size_t(y)*width_+x;if(plotStrokeColorReplacement(index,dynamics::rounded(coverage*b.opacity/100.)))return;capturePerfectPixel(index);const auto found=pendingLookup_[index];const Pixel current=strokePixel(index);auto inherited=inheritedStrokeBaseline_.find(index);const Pixel before=inherited!=inheritedStrokeBaseline_.end()?inherited->second:found<0?current:pending_[found].before;
  const bool intrinsic=dynamicImage_&&dynamicImage_->intrinsicSize;const bool transparentGradient=sample.gradient&&(!(dynamicGradientStart_>>24)||!(dynamicGradientEnd_>>24)||!(source>>24));
  const bool direct=intrinsic&&b.imagePaintMode==PatternPaintMode::Paint&&b.ink==InkMode::Simple&&(color_>>24)&&!transparentGradient;
  const std::uint64_t key=(std::uint64_t(index)<<32)|(sample.gradient?0u:source);auto seen=inkStampCoverage_.find(key);if(!direct&&seen!=inkStampCoverage_.end()&&(seen->second>amount||(seen->second==amount&&!sample.gradient&&b.ink!=InkMode::LockAlpha)))return;
  capturePerfectInkCoverage(key);inkStampCoverage_[key]=amount;Pixel value;
  if(!sample.gradient&&!(color_>>24)){int erase=amount;if(imageColor)erase=dynamics::rounded(erase*(*imageColor>>24)/255.);value=erase==255?0:(before&0xffffff)|(Pixel(dynamics::rounded((before>>24)*(1-erase/255.)))<<24);}
  else if(direct)value=imageBrushDirectPixel(source,coverage,b.opacity);
  else if(sample.gradient&&!(source>>24))value=current;
  else {const auto destination=b.ink==InkMode::LockAlpha?before:transparentGradient||b.ink==InkMode::CopyAlphaColor?current:before;value=inkBrushComposite(destination,source,b.opacity,b.ink,coverage);}
  if(maskStrokeBefore_)value=timeline::normalizedMaskPixel(value);if(current==value)return;if(found<0){pending_.push_back({index,current,value});pendingLookup_[index]=int(pending_.size()-1);}else pending_[found].after=value;strokePixel(index)=value;change_.include(x,y);
 };
 if(image){for(const auto& offset:image->samples)for(auto q:symmetryPoints({sample.x-image->width/2+offset.x,sample.y-image->height/2+offset.y},width_,height_,symmetryAxes,symmetryCenter()))paint(q.x,q.y,offset.coverage,offset.color);}
 else for(const auto& row:footprint.spans)for(int x=sample.x-footprint.width/2+row.left;x<=sample.x-footprint.width/2+row.right;++x)for(auto q:symmetryPoints({x,sample.y-footprint.height/2+row.y},width_,height_,symmetryAxes,symmetryCenter()))paint(q.x,q.y,255,{});
}
void Document::updateDynamicStroke(Point point,BrushPathPoint sample,bool initial){
 if(auto edit=freeTileSourceStrokeDocument()){try{edit->updateDynamicStroke(freeTileSourceStrokePoint(point),sample,initial);publishFreeTileSourceStroke();}catch(...){cancelFreeTileSourceStroke();throw;}return;}
 if(!active_||!dynamicStroke_)return;change_={};sample.x=point.x;sample.y=point.y;
 try{
 if(initial){dynamicLast_=sample;perfectPath_.clear();if(dynamicBase_.perfectPixels){perfectPath_.push_back(sample);perfectPendingStart_=pending_.size();capturingPerfectTail_=true;}dynamicStamp(sample);}
 else if(dynamicBase_.perfectPixels){rollbackPerfectTail();if(perfectPath_.empty())perfectPath_.push_back(dynamicLast_);if(point.x==dynamicLast_.x&&point.y==dynamicLast_.y){sample.opacity=std::max(sample.opacity,perfectPath_.back().opacity);perfectPath_.back()=sample;}else appendPerfectPixelSegment(perfectPath_,sample);const auto end=perfectPath_.size()>2?perfectPath_.size()-2:0;for(auto i=perfectStable_;i<end;++i)dynamicStamp(perfectPath_[i]);perfectStable_=end;perfectPendingStart_=pending_.size();capturingPerfectTail_=true;for(auto i=end;i<perfectPath_.size();++i)dynamicStamp(perfectPath_[i]);}
 else {const auto from=dynamicLast_;const bool bridge=dynamicBase_.shape==BrushShape::Line&&std::max(from.size,sample.size)>1&&(std::abs(std::fmod(from.angle,180))>=.0001||std::abs(std::fmod(sample.angle,180))>=.0001);const auto points=selectionContinuousLine({from.x,from.y},{point.x,point.y},bridge);int since=0,previousSize=-1;for(std::size_t i=0;i<points.size();++i){const double t=points.size()<=1?1:double(i)/(points.size()-1);BrushPathPoint value{points[i].x,points[i].y,dynamics::rounded(from.size+(sample.size-from.size)*t),dynamics::rounded(from.opacity+(sample.opacity-from.opacity)*t),dynamics::interpolateAngle(from.angle,sample.angle,t),from.gradient&&sample.gradient?std::optional<double>{*from.gradient+(*sample.gradient-*from.gradient)*t}:sample.gradient};const int spacing=dynamicBase_.shape==BrushShape::Line?1:std::max(1,value.size/16);if(i)++since;if(!i||i+1==points.size()||value.size!=previousSize||since>=spacing){dynamicStamp(value);since=0;previousSize=value.size;}}}
 dynamicLast_=sample;last_=point;publishChange();
 }catch(...){cancelStroke();throw;}
}
}
