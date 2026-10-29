#pragma once
#include "selection_model.h"
#include <windows.h>
#include "clip.h"
#include <cstring>
#include <functional>
#include <stdexcept>
namespace moon {
// Existing MIT clip backend is the native adaptation of legacy clipboard-service.
class PixelClipboard {
public:
 using ImageReader=std::function<std::optional<SelectionClipboard>()>;
 class ImageNotAdmitted:public std::runtime_error {public:using std::runtime_error::runtime_error;};
 static std::optional<SelectionClipboard> readNewDocumentSource(const std::optional<SelectionClipboard>& internal,const ImageReader& readSystemImage){
  std::optional<SelectionClipboard> system;
  try{system=readSystemImage();}catch(const ImageNotAdmitted&){throw;}catch(...){return internal;}
  if(system)for(const auto pixel:system->pixels)if(pixel>>24)return system;
  return internal;
 }
 static std::optional<SelectionClipboard> readSelectionSource(const std::optional<SelectionClipboard>& internal,const ImageReader& readSystemImage){
  std::optional<SelectionClipboard> system;
  try{system=readSystemImage();}catch(...){return internal;}
  if(system && std::none_of(system->pixels.begin(),system->pixels.end(),[](auto pixel){return (pixel>>24)!=0;}))system.reset();
  if(!system)return internal;
  if(internal && system->width==internal->width && system->height==internal->height && system->pixels==internal->pixels){
   const auto size=system->pixels.size();
   auto allSelected=[&](const auto& mask){return mask.empty() || (mask.size()==size && std::all_of(mask.begin(),mask.end(),[](auto value){return value==1;}));};
   const bool equalMasks=system->mask==internal->mask || (system->mask.empty() && allSelected(internal->mask)) || (internal->mask.empty() && allSelected(system->mask));
   if(equalMasks)return internal;
  }
  return system;
 }
 static Point resolvePlacement(const SelectionClipboard& source,int documentWidth,int documentHeight,int left,int top,int right,int bottom){
  using Wide=std::int64_t;
  auto clamp=[](Wide value,Wide minimum,Wide maximum){return (std::min)(maximum,(std::max)(minimum,value));};
  auto half=[](Wide value){return value>=0?value/2:(value-1)/2;};
  auto centered=[&](Wide start,Wide end,Wide size){return start+half(end-start)-size/2;};
  auto copiedAxis=[&](Wide origin,Wide size,Wide start,Wide end){const auto center=origin+size/2;return center>=start && center<end?clamp(origin,start-size,end-1):centered(start,end,size);};
  Wide x=0,y=0;
  if(source.originX && source.originY){x=copiedAxis(*source.originX,source.width,left,right);y=copiedAxis(*source.originY,source.height,top,bottom);}
  else{
   const Wide canvasLeft=(std::max)(0,left),canvasTop=(std::max)(0,top),canvasRight=(std::min)(documentWidth,right),canvasBottom=(std::min)(documentHeight,bottom);
   x=canvasRight>canvasLeft?centered(canvasLeft,canvasRight,source.width):centered(left,right,source.width);
   y=canvasBottom>canvasTop?centered(canvasTop,canvasBottom,source.height):centered(top,bottom,source.height);
  }
  if(documentWidth<=source.width || documentHeight<=source.height){x=clamp(x,0,(std::max)(0,documentWidth-source.width));y=clamp(y,0,(std::max)(0,documentHeight-source.height));}
  else{x=clamp(x,-Wide(source.width)+1,Wide(documentWidth)-1);y=clamp(y,-Wide(source.height)+1,Wide(documentHeight)-1);}
  return {int(x),int(y)};
 }
private:
 std::optional<SelectionClipboard> internal_;
 ImageReader systemImageReaderForSmoke_;
 std::optional<SelectionClipboard> structuredCopyBaseline_;
 std::optional<SelectionClipboard> readSystemImage(bool forNewDocument){
  clip::lock lock;if(!lock.locked())throw std::runtime_error("Clipboard busy");
  if(!lock.is_convertible(clip::image_format()))return {};
  clip::image_spec spec;if(!lock.get_image_spec(spec))throw std::runtime_error("Unsupported clipboard image");
  auto validate=[&]{
   if(forNewDocument){
    if(spec.width<1||spec.height<1||spec.width>1024||spec.height>1024)throw ImageNotAdmitted("粘贴为新项目仅支持每边 1..1024 像素；剪贴板图像未被裁剪");
   }else if(spec.width<1||spec.height<1||spec.width>8192||spec.height>8192||std::uint64_t(spec.width)*spec.height>16*1024*1024)throw std::runtime_error("Clipboard image exceeds pixel budget");
  };
  validate();clip::image image;if(!lock.get_image(image))throw std::runtime_error("Cannot read clipboard image");spec=image.spec();validate();
  if(spec.bits_per_pixel!=24&&spec.bits_per_pixel!=32){if(forNewDocument)throw ImageNotAdmitted("剪贴板图像格式尚未支持；仅支持 24/32 位 RGBA 图像");throw std::runtime_error("Only 24/32 bit clipboard images supported");}
  SelectionClipboard result;result.width=int(spec.width);result.height=int(spec.height);result.pixels.resize(std::size_t(spec.width)*spec.height);result.mask.resize(result.pixels.size());
  for(unsigned long y=0;y<spec.height;++y)for(unsigned long x=0;x<spec.width;++x){
   std::uint32_t value=0;std::memcpy(&value,image.data()+y*spec.bytes_per_row+x*(spec.bits_per_pixel/8),spec.bits_per_pixel/8);
   const auto r=(value&spec.red_mask)>>spec.red_shift,g=(value&spec.green_mask)>>spec.green_shift,b=(value&spec.blue_mask)>>spec.blue_shift,a=spec.alpha_mask?(value&spec.alpha_mask)>>spec.alpha_shift:255;
   const auto index=std::size_t(y)*spec.width+x;result.pixels[index]=std::uint32_t(r|(g<<8)|(b<<16)|(a<<24));result.mask[index]=a!=0;
  }
  return result;
 }
public:
 // Legacy ClipboardService: compare image content, not clipboard sequence/size.
 std::optional<SelectionClipboard> readSystemSelection(){try{return readSelectionSource({},[this]{return systemImageReaderForSmoke_?systemImageReaderForSmoke_():readSystemImage(false);});}catch(...){return {};}}
 void captureStructuredCopyBaseline(){structuredCopyBaseline_=readSystemSelection();}
 bool preferStructuredCopy(const std::optional<SelectionClipboard>& current)const{
  if(!current)return true;if(!structuredCopyBaseline_)return false;
  const auto& before=*structuredCopyBaseline_;const auto& after=*current;
  if(before.width!=after.width||before.height!=after.height||before.originX!=after.originX||before.originY!=after.originY||before.pixels!=after.pixels)return false;
  for(std::size_t i=0;i<after.pixels.size();++i)if((before.mask.empty()?1:before.mask.at(i))!=(after.mask.empty()?1:after.mask.at(i)))return false;
  return true;
 }
 bool write(const SelectionClipboard& source){
  if(source.width<1 || source.height<1 || std::uint64_t(source.width)*source.height!=source.pixels.size() || (!source.mask.empty() && source.mask.size()!=source.pixels.size()))throw std::invalid_argument("Invalid selection clipboard image");
  internal_=source;clip::image_spec spec;spec.width=source.width;spec.height=source.height;spec.bits_per_pixel=32;spec.bytes_per_row=source.width*4;spec.red_mask=255;spec.green_mask=255<<8;spec.blue_mask=255<<16;spec.alpha_mask=0xff000000;spec.green_shift=8;spec.blue_shift=16;spec.alpha_shift=24;clip::image image(spec);
  for(std::size_t i=0;i<source.pixels.size();++i){auto value=(source.mask.empty() || source.mask[i]==1)?source.pixels[i]:0u;std::memcpy(image.data()+i*4,&value,4);}
  return clip::set_image(image);
 }
 std::optional<SelectionClipboard> readReferenceImage(){return readSystemImage(false);}
 std::optional<SelectionClipboard> read(){return readSelectionSource(internal_,[this]{return systemImageReaderForSmoke_?systemImageReaderForSmoke_():readSystemImage(false);});}
 ImageReader exchangeSystemImageReaderForSmoke(ImageReader next){auto previous=std::move(systemImageReaderForSmoke_);systemImageReaderForSmoke_=std::move(next);return previous;}
 std::optional<SelectionClipboard> readForNewDocument(){return readNewDocumentSource(internal_,[this]{return readSystemImage(true);});}
 void clear(){internal_.reset();}
};
}
