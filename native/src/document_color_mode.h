#pragma once
#include "relative_luminance.h"
#include "timeline_model.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <optional>
#include <stdexcept>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace moon::color_mode {
// Legacy types-raster.ts, pixel-format.ts and document-model.ts. Pixel
// precision changes channel values; RGBA storage remains four bytes per pixel.
using Pixel=timeline::Pixel;
enum class Mode {Rgba,Indexed,Grayscale};
inline std::string_view name(Mode mode){return mode==Mode::Grayscale?"grayscale":mode==Mode::Indexed?"indexed":"rgba";}
inline bool rgbaStorageMode(std::string_view mode){return mode=="rgba"||mode=="grayscale";}
inline Mode editableMode(std::string_view mode){if(!rgbaStorageMode(mode))throw std::invalid_argument("Unsupported document color mode");return mode=="grayscale"?Mode::Grayscale:Mode::Rgba;}
enum class PixelFormat {Rgba32,Rgb24,Rgb565,Rgb555,Rgb332,Rgba4444,Rgba5551,Argb1555};
inline constexpr std::array<std::string_view,8> pixelFormatNames{{"rgba32","rgb24","rgb565","rgb555","rgb332","rgba4444","rgba5551","argb1555"}};
inline std::optional<PixelFormat> pixelFormat(std::string_view name){for(std::size_t i=0;i<pixelFormatNames.size();++i)if(pixelFormatNames[i]==name)return PixelFormat(i);return {};}
inline PixelFormat preferencePixelFormat(std::string_view name){return pixelFormat(name).value_or(PixelFormat::Rgba32);}
inline std::string_view name(PixelFormat format){return pixelFormatNames.at(std::size_t(format));}
inline Pixel quantizePixelColor(Pixel color,PixelFormat format){
 constexpr std::array<std::array<unsigned,4>,8> bits{{{{8,8,8,8}},{{8,8,8,0}},{{5,6,5,0}},{{5,5,5,0}},{{3,3,2,0}},{{4,4,4,4}},{{5,5,5,1}},{{5,5,5,1}}}};
 if(format==PixelFormat::Rgba32)return color;
 Pixel result=0;const auto& channels=bits.at(std::size_t(format));
 for(unsigned channel=0;channel<4;++channel){const unsigned levels=(1u<<channels[channel])-1u;const unsigned source=(color>>(channel*8))&255u;const unsigned value=levels?unsigned(std::floor(std::floor(source*double(levels)/255.+.5)*255./levels+.5)):255u;result|=value<<(channel*8);}
 return result;
}
inline Pixel normalizeDocumentColor(Mode mode,PixelFormat format,Pixel color){return mode==Mode::Grayscale?relativeLuminancePixel(color):mode==Mode::Rgba?quantizePixelColor(color,format):color;}
inline Pixel normalizeRgbaPackedValue(PixelFormat format,Pixel value){return value>>24?quantizePixelColor(value,format):value;}
inline Pixel normalizePackedValue(Mode mode,PixelFormat format,Pixel value){return value>>24?normalizeDocumentColor(mode,format,value):value;}

// Accept existing palette entry containers directly; their stable IDs and
// independent visible order are authoritative, rather than slot positions.
template<class Entries> Pixel paletteColor(const Entries& entries,int id){for(const auto& entry:entries)if(entry.id==id)return entry.color;return 0;}
template<class Entries> int paletteColorIdForCanvas(const Entries& entries,const std::vector<int>& order,Pixel color){
 if(!(color>>24))return 0;
 std::unordered_map<int,Pixel> byId;for(const auto& entry:entries)byId[entry.id]=entry.color;
 std::unordered_set<int> seen;int nearest=0,distance=std::numeric_limits<int>::max();
 for(int id:order){if(!seen.insert(id).second||id==0)continue;const auto found=byId.find(id);if(found==byId.end()||!(found->second>>24))continue;const Pixel candidate=found->second;if(candidate==color)return id;
  int next=0;for(unsigned shift:{0u,8u,16u,24u}){const int delta=int((color>>shift)&255)-int((candidate>>shift)&255);next+=delta*delta*(shift==24?2:1);}if(next<distance){distance=next;nearest=id;}
 }
 return nearest;
}
template<class Entries> Pixel resolveDocumentCanvasColor(Mode mode,PixelFormat format,const Entries& entries,const std::vector<int>& order,Pixel color){return mode==Mode::Indexed?paletteColor(entries,paletteColorIdForCanvas(entries,order,color)):normalizeDocumentColor(mode,format,color);}
template<class Entries> Pixel resolveLayerCanvasColor(Mode mode,PixelFormat format,bool indexed,bool mask,const Entries& entries,const std::vector<int>& order,Pixel color){if(mask)return timeline::normalizedMaskPixel(color);return indexed?resolveDocumentCanvasColor(mode,format,entries,order,color):normalizeDocumentColor(mode,format,color);}
template<class Entries> Pixel normalizeLayerPackedValue(Mode mode,PixelFormat format,bool indexed,bool mask,const Entries& entries,const std::vector<int>& order,Pixel value){
 if(mask)return timeline::normalizedMaskPixel(value);
 if(indexed){if(value==0||std::find(order.begin(),order.end(),value)!=order.end())return value;return Pixel(paletteColorIdForCanvas(entries,order,paletteColor(entries,int(value))));}
 // Packed zero-alpha values also move/clear coverage and restore snapshots.
 // The color-write quantizer deliberately has different alpha semantics.
 if(!(value>>24))return value;
 return normalizeDocumentColor(mode,format,value);
}
}
