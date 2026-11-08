#pragma once
#include "selection_model.h"
#include <cstdint>
#include <cstring>
#include <functional>
#include <future>
namespace moon::new_document {
struct Size {std::int64_t width=0,height=0;bool operator==(const Size& other)const{return width==other.width&&height==other.height;}bool operator!=(const Size& other)const{return !(*this==other);}};
using SizeReader=std::function<std::optional<Size>()>;
using ImageReader=std::function<std::optional<SelectionClipboard>()>;
inline std::optional<Size> layerSize(const std::vector<SelectionMask>& rectangles){
 if(rectangles.empty())return {};std::int64_t left=INT64_MAX,top=INT64_MAX,right=INT64_MIN,bottom=INT64_MIN;
 for(const auto& r:rectangles){left=std::min(left,std::int64_t(r.x));top=std::min(top,std::int64_t(r.y));right=std::max(right,std::int64_t(r.x)+r.width);bottom=std::max(bottom,std::int64_t(r.y)+r.height);}
 if(right<=left||bottom<=top)return {};return Size{right-left,bottom-top};
}
// platform_clipboard.rs: read twelve DIB header bytes, never decode pixels.
inline std::optional<Size> dibSize(const void* data,std::size_t length){
 if(!data||length<12)return {};std::uint32_t header;std::int32_t w,h;std::memcpy(&header,data,4);std::memcpy(&w,static_cast<const char*>(data)+4,4);std::memcpy(&h,static_cast<const char*>(data)+8,4);
 if(header<40||w==INT32_MIN||h==INT32_MIN)return {};const auto width=w<0?-std::int64_t(w):w,height=h<0?-std::int64_t(h):h;
 if(!width||!height||width>16ll*1024*1024/height)return {};return Size{int(width),int(height)};
}
std::optional<Size> readSystemSize();
inline bool equalImages(const SelectionClipboard& a,const SelectionClipboard& b){
 if(a.width!=b.width||a.height!=b.height||a.originX!=b.originX||a.originY!=b.originY||a.pixels!=b.pixels)return false;
 if(a.mask==b.mask)return true;auto all=[&](const auto& mask){return mask.empty()||(mask.size()==a.pixels.size()&&std::all_of(mask.begin(),mask.end(),[](auto v){return v==1;}));};return all(a.mask)&&all(b.mask);
}
// ClipboardService.latestClipboardSize: metadata first; pixels only disambiguate
// an unchanged-size external image from the baseline captured at layer copy.
inline std::optional<Size> latestSize(const std::optional<Size>& layers,const std::optional<Size>& baselineSize,const SelectionClipboard* baseline,const SizeReader& readSize,const ImageReader& readImage){
 std::optional<Size> system;try{system=readSize();}catch(...){}
 if(!layers)return system;if(!baselineSize)return system?system:layers;
 if(system&&*system==*baselineSize){if(!readImage)return layers;std::optional<SelectionClipboard> current;try{current=readImage();}catch(...){}if(current&&baseline&&equalImages(*current,*baseline))return layers;if(!current&&!baseline)return layers;return system;}
 return system?system:layers;
}
// One coalescing worker owns copied inputs only. Closing a dialog never waits
// for delayed clipboard rendering, and repeated opens cannot accumulate threads.
std::future<std::optional<Size>> probe(std::function<std::optional<Size>()> work);
}
