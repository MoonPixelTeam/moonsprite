#include "project_raster_encode.h"
#include <algorithm>
#include <limits>
namespace moon::project {
namespace {
void put16(Bytes& b,std::uint32_t n){b.push_back(n&255);b.push_back((n>>8)&255);}
void put32(Bytes& b,std::uint32_t n){put16(b,n);put16(b,n>>16);}
void validate(RasterFormat format,std::uint32_t w,std::uint32_t h){
 if(format!=RasterFormat::Rgba&&format!=RasterFormat::Indexed)throw Error(ErrorKind::Unsupported,"Unsupported raster format");
 if(!w||!h)throw Error(ErrorKind::Corrupt,"Invalid raster dimensions");
}
void header(Bytes& b,RasterFormat format,std::uint32_t w,std::uint32_t h,std::uint32_t tiles,std::uint32_t payload){
 put32(b,0x3154534d);put16(b,64);b.push_back(std::uint8_t(format));b.push_back(0);put32(b,w);put32(b,h);put32(b,tiles);put32(b,payload);
}
}
EncodedRaster encodeRaster(const std::uint32_t* pixels,std::size_t count,RasterFormat format,std::uint32_t w,std::uint32_t h,std::size_t maxBytes){
 validate(format,w,h);
 const auto size=std::uint64_t(w)*h;
 if(size>maxBytes/4||size>std::numeric_limits<std::uint32_t>::max()/4)throw Error(ErrorKind::Limit,"Raster exceeds encode budget");
 if(size!=count||!pixels)throw Error(ErrorKind::Corrupt,"Raster pixel count mismatch");
 struct Tile{std::uint32_t x,y,w,h;};std::vector<Tile> tiles;std::size_t payload=0;
 for(std::uint64_t y=0;y<h;y+=64)for(std::uint64_t x=0;x<w;x+=64){const auto tw=std::min(64u,w-std::uint32_t(x)),th=std::min(64u,h-std::uint32_t(y));bool content=false;
  for(unsigned row=0;row<th&&!content;++row)for(unsigned col=0;col<tw;++col)if(pixels[std::size_t(y+row)*w+std::size_t(x)+col]!=0){content=true;break;}
  if(content){tiles.push_back({std::uint32_t(x),std::uint32_t(y),tw,th});payload+=std::size_t(tw)*th*4;}
 }
 const auto sparseSize=24+tiles.size()*16+payload;
 if(sparseSize>=count*4){EncodedRaster out{{},"raw"};out.data.reserve(count*4);for(std::size_t i=0;i<count;++i)put32(out.data,pixels[i]);return out;}
 EncodedRaster out{{},"sparse-tiles-v1"};auto& b=out.data;b.reserve(sparseSize);header(b,format,w,h,std::uint32_t(tiles.size()),std::uint32_t(payload));
 std::size_t offset=24+tiles.size()*16;
 for(const auto& t:tiles){put32(b,t.x);put32(b,t.y);put16(b,t.w);put16(b,t.h);put32(b,std::uint32_t(offset));offset+=std::size_t(t.w)*t.h*4;}
 for(const auto& t:tiles)for(unsigned row=0;row<t.h;++row)for(unsigned col=0;col<t.w;++col)put32(b,pixels[std::size_t(t.y+row)*w+t.x+col]);
 return out;
}
EncodedRaster encodeEmptyRuntimeRaster(RasterFormat format,std::uint32_t w,std::uint32_t h){validate(format,w,h);EncodedRaster out{{},"sparse-tiles-v1"};header(out.data,format,w,h,0,0);return out;}
}
