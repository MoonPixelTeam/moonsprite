#pragma once
#include "selection_model.h"
#include <windows.h>
#include "clip.h"
#include <cstring>
#include <stdexcept>
namespace moon {
// Existing MIT clip backend is the native adaptation of legacy clipboard-service.
class PixelClipboard {
 std::optional<SelectionClipboard> internal_;DWORD sequence_=0;
public:
 bool write(const SelectionClipboard& source){internal_=source;clip::image_spec spec;spec.width=source.width;spec.height=source.height;spec.bits_per_pixel=32;spec.bytes_per_row=source.width*4;spec.red_mask=255;spec.green_mask=255<<8;spec.blue_mask=255<<16;spec.alpha_mask=0xff000000;spec.green_shift=8;spec.blue_shift=16;spec.alpha_shift=24;clip::image image(spec);for(std::size_t i=0;i<source.pixels.size();++i){auto value=source.mask[i]?source.pixels[i]:0u;std::memcpy(image.data()+i*4,&value,4);}const bool ok=clip::set_image(image);sequence_=GetClipboardSequenceNumber();return ok;}
 std::optional<SelectionClipboard> read(){if(internal_ && sequence_==GetClipboardSequenceNumber())return internal_;clip::lock lock;if(!lock.locked())throw std::runtime_error("Clipboard busy");if(!lock.is_convertible(clip::image_format()))return {};clip::image_spec spec;if(!lock.get_image_spec(spec))throw std::runtime_error("Unsupported clipboard image");if(spec.width<1 || spec.height<1 || spec.width>8192 || spec.height>8192 || std::uint64_t(spec.width)*spec.height>16*1024*1024)throw std::runtime_error("Clipboard image exceeds pixel budget");clip::image image;if(!lock.get_image(image))throw std::runtime_error("Cannot read clipboard image");spec=image.spec();if(spec.bits_per_pixel!=24 && spec.bits_per_pixel!=32)throw std::runtime_error("Only 24/32 bit clipboard images supported");SelectionClipboard result;result.width=int(spec.width);result.height=int(spec.height);result.pixels.resize(spec.width*spec.height);result.mask.resize(result.pixels.size());for(unsigned long y=0;y<spec.height;++y)for(unsigned long x=0;x<spec.width;++x){std::uint32_t value=0;std::memcpy(&value,image.data()+y*spec.bytes_per_row+x*(spec.bits_per_pixel/8),spec.bits_per_pixel/8);const auto r=(value&spec.red_mask)>>spec.red_shift,g=(value&spec.green_mask)>>spec.green_shift,b=(value&spec.blue_mask)>>spec.blue_shift,a=spec.alpha_mask?(value&spec.alpha_mask)>>spec.alpha_shift:255;const auto index=y*spec.width+x;result.pixels[index]=std::uint32_t(r|(g<<8)|(b<<16)|(a<<24));result.mask[index]=a!=0;}return result;}
 void clear(){internal_.reset();sequence_=0;}
};
}
