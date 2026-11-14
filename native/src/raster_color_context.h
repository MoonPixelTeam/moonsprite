#pragma once
#include "document_color_mode.h"
#include "raster_geometry.h"
#include <unordered_set>
namespace moon {
// A render/scan input, built from the document's existing authoritative palette.
// No palette is installed in Timeline or converted into a second raster cache.
class RasterColorContext {
 struct Entry {int id;timeline::Pixel color;};
 std::vector<Entry> entries_;
 std::vector<int> order_;
 std::unordered_map<timeline::Pixel,timeline::Pixel> byId_;
 std::unordered_set<timeline::Pixel> opaqueIds_;
 std::string visibilityKey_="indexed:*";
 color_mode::Mode mode_=color_mode::Mode::Rgba;
 color_mode::PixelFormat precision_=color_mode::PixelFormat::Rgba32;
public:
 RasterColorContext()=default;
 bool indexed()const{return mode_==color_mode::Mode::Indexed;}
 bool contentVisible(timeline::RasterFormat format,timeline::Pixel packed)const{return format==timeline::RasterFormat::Rgba?bool(packed>>24):opaqueIds_.count(packed)!=0;}
 template<class Entries> RasterColorContext(const Entries& entries,const std::vector<int>& order,color_mode::Mode mode=color_mode::Mode::Rgba,color_mode::PixelFormat precision=color_mode::PixelFormat::Rgba32):order_(order),mode_(mode),precision_(precision){
  for(const auto& e:entries){entries_.push_back({e.id,e.color});byId_[timeline::Pixel(e.id)]=e.color;if(e.color>>24)opaqueIds_.insert(timeline::Pixel(e.id));}
  if(!entries_.empty()){std::vector<timeline::Pixel> ids(opaqueIds_.begin(),opaqueIds_.end());std::sort(ids.begin(),ids.end());visibilityKey_="indexed:";for(auto id:ids)visibilityKey_+=std::to_string(id)+",";}
 }
 // legacy composite sampling builds a Map: the last duplicate ID wins.
 timeline::Pixel rgba(timeline::RasterFormat format,timeline::Pixel packed)const{if(format==timeline::RasterFormat::Rgba)return packed;const auto found=byId_.find(packed);return found==byId_.end()?0:found->second;}
 // document-model readLayerColor/getPaletteEntry use the first duplicate ID.
 // Compositing's Map lookup above deliberately has a different contract.
 timeline::Pixel toolColor(timeline::RasterFormat format,timeline::Pixel packed)const{return format==timeline::RasterFormat::Rgba?packed:color_mode::paletteColor(entries_,int(packed));}
 timeline::Pixel colorValue(timeline::RasterFormat format,timeline::Pixel color,bool mask=false)const{return mask?timeline::normalizedMaskPixel(color):format==timeline::RasterFormat::Indexed?timeline::Pixel(color_mode::paletteColorIdForCanvas(entries_,order_,color)):color_mode::normalizeDocumentColor(mode_,precision_,color);}
 timeline::Pixel packedValue(timeline::RasterFormat format,timeline::Pixel packed,bool mask=false)const{return color_mode::normalizeLayerPackedValue(mode_,precision_,format==timeline::RasterFormat::Indexed,mask,entries_,order_,packed);}
 timeline::Pixel colorId(timeline::Pixel color)const{return timeline::Pixel(color_mode::paletteColorIdForCanvas(entries_,order_,color));}
 timeline::Pixel readWorld(const timeline::Surface& surface,std::int64_t x,std::int64_t y)const{const auto index=raster::worldIndex(surface,x,y);return index?rgba(surface.format,surface.pixels[*index]):0;}
 // Content scans intentionally use legacy's union of opaque palette IDs,
 // and nonzero IDs when no palette was supplied; this differs from rendering.
 bool visible(timeline::RasterFormat format,timeline::Pixel packed)const{return format==timeline::RasterFormat::Rgba?bool(packed>>24):entries_.empty()?packed!=0:opaqueIds_.count(packed)!=0;}
 const std::string& visibilityKey(timeline::RasterFormat format)const{static const std::string rgbaKey="rgba";return format==timeline::RasterFormat::Rgba?rgbaKey:visibilityKey_;}
 timeline::Pixel styleColor(timeline::Pixel color)const{return color_mode::resolveDocumentCanvasColor(mode_,precision_,entries_,order_,color);}
 std::optional<timeline::ColorOverlayStyle> mappedStyle(std::optional<timeline::ColorOverlayStyle> style)const{if(!style)return style;auto& s=*style;s.stroke.color=styleColor(s.stroke.color);s.shadow.color=styleColor(s.shadow.color);s.innerGlow.color=styleColor(s.innerGlow.color);s.color=styleColor(s.color);s.gradientFrom=styleColor(s.gradientFrom);s.gradientTo=styleColor(s.gradientTo);for(auto& stop:s.gradientMap.stops)stop.color=color_mode::normalizeDocumentColor(mode_,precision_,stop.color);return style;}
};
}
