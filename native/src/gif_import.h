#pragma once
#include "document.h"
#include <algorithm>
#include <limits>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>
namespace moon::gif_import {
struct Descriptor {int left=0,top=0,width=0,height=0,duration=100,disposal=0;};
struct Metadata {int width=0,height=0;bool loop=false;std::vector<Descriptor> frames;};
constexpr std::uint64_t workingBudget=256ull*1024*1024;
// Necessary WIC adaptation: scan GIF block metadata, while the existing decoder
// still owns LZW, interlacing, palettes and transparency. Legacy parsedGifLoops
// checks exact application IDs, independently of the stored repeat count.
inline Metadata metadata(const std::vector<std::uint8_t>& bytes){
 std::size_t offset=0;auto require=[&](std::size_t count){if(count>bytes.size()-offset)throw std::runtime_error("Incomplete GIF data");};
 auto byte=[&](){require(1);return bytes[offset++];};auto word=[&](){const int low=byte();return low|int(byte())<<8;};
 auto skip=[&](std::size_t count){require(count);offset+=count;};
 auto blocks=[&](){for(;;){const auto count=byte();if(!count)break;skip(count);}};
 require(6);const std::string signature(bytes.begin(),bytes.begin()+6);if(signature!="GIF87a"&&signature!="GIF89a")throw std::runtime_error("Not a GIF image");offset=6;
 Metadata result;result.width=word();result.height=word();if(!result.width||!result.height)throw std::runtime_error("Invalid GIF canvas size");const auto packed=byte();skip(2);if(packed&128)skip(3u*(1u<<((packed&7)+1)));
 Descriptor control;
 for(;;){const auto type=byte();if(type==0x3b)break;
  if(type==0x21){const auto extension=byte();
   if(extension==0xf9){if(byte()!=4)throw std::runtime_error("Invalid GIF graphics control");const auto flags=byte();const int centiseconds=word();skip(1);if(byte())throw std::runtime_error("Invalid GIF control terminator");control.disposal=(flags>>2)&7;control.duration=std::clamp((centiseconds?centiseconds:10)*10,1,60000);}
   else if(extension==0xff){const auto count=byte();require(count);std::string id(bytes.begin()+offset,bytes.begin()+offset+count);for(auto& c:id)if(c>='a'&&c<='z')c-=32;result.loop=result.loop||id=="NETSCAPE2.0"||id=="ANIMEXTS1.0";skip(count);blocks();}
   else blocks();
   continue;
  }
  if(type!=0x2c)throw std::runtime_error("Unsupported or corrupt GIF block");
  Descriptor frame=control;frame.left=word();frame.top=word();frame.width=word();frame.height=word();if(!frame.width||!frame.height)throw std::runtime_error("Invalid GIF patch size");const auto flags=byte();if(flags&128)skip(3u*(1u<<((flags&7)+1)));skip(1);blocks();result.frames.push_back(frame);if(result.frames.size()>10000)throw std::length_error("Invalid GIF frame count");control=Descriptor{};
 }
 if(result.frames.empty())throw std::runtime_error("GIF contains no image frames");return result;
}
inline void validateBudget(const Metadata& source){
 if(source.width<1||source.height<1||source.width>1024||source.height>1024)throw std::length_error("Native editable images support 1..1024 pixels");
 std::uint64_t patchPixels=0;for(const auto& frame:source.frames)patchPixels=std::max(patchPixels,std::uint64_t(frame.width)*frame.height);
 if(std::uint64_t(source.width)*source.height*(source.frames.size()+3)*sizeof(Pixel)+patchPixels*sizeof(Pixel)>workingBudget)throw std::length_error("GIF exceeds the native pixel working budget");
}
// Direct translation of legacy core/gif-import.ts::compositeGifFrames:
// start transparent, skip transparent patch pixels, snapshot before disposal,
// clear only the clipped patch for type 2, restore the previous canvas for 3.
class Composite {
 int width_,height_;std::vector<Pixel> canvas_;
public:
 Composite(int width,int height):width_(width),height_(height){if(width<1||height<1||std::uint64_t(width)*height*sizeof(Pixel)>workingBudget)throw std::invalid_argument("Invalid GIF canvas");canvas_.resize(std::size_t(width)*height);}
 std::vector<Pixel> append(const Descriptor& frame,const std::vector<Pixel>& patch){
  if(frame.width<1||frame.height<1||patch.size()!=std::uint64_t(frame.width)*frame.height)throw std::runtime_error("GIF image data is incomplete");
  const int left=std::max(0,frame.left),top=std::max(0,frame.top);const auto right=std::min<std::int64_t>(width_,std::int64_t(frame.left)+frame.width),bottom=std::min<std::int64_t>(height_,std::int64_t(frame.top)+frame.height);
  auto previous=frame.disposal==3?canvas_:std::vector<Pixel>{};
  for(int y=top;y<bottom;++y)for(int x=left;x<right;++x){const auto pixel=patch[std::size_t(y-frame.top)*frame.width+x-frame.left];if(pixel>>24)canvas_[std::size_t(y)*width_+x]=pixel;}
  auto result=canvas_;if(frame.disposal==2){for(int y=top;y<bottom;++y)for(int x=left;x<right;++x)canvas_[std::size_t(y)*width_+x]=0;}else if(frame.disposal==3)canvas_=std::move(previous);return result;
 }
};
}
