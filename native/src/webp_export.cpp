#include "webp_export.h"
#include "include/core/SkColorSpace.h"
#include "include/core/SkImageInfo.h"
#include "include/core/SkPixmap.h"
#include "include/core/SkStream.h"
#include "include/encode/SkWebpEncoder.h"
#include <limits>
#include <stdexcept>
namespace moon {namespace {
using Bytes=std::vector<std::uint8_t>;
void u24(Bytes& b,std::size_t at,unsigned n){for(int c=0;c<3;++c)b[at+c]=std::uint8_t(n>>(8*c));}
void u32(Bytes& b,unsigned n){for(int c=0;c<4;++c)b.push_back(std::uint8_t(n>>(8*c)));}
unsigned read32(const Bytes& b,std::size_t at){return unsigned(b[at])|(unsigned(b[at+1])<<8)|(unsigned(b[at+2])<<16)|(unsigned(b[at+3])<<24);}
bool tag(const Bytes& b,std::size_t at,const char* s){return at+4<=b.size()&&std::equal(b.begin()+at,b.begin()+at+4,s);}
Bytes chunk(const char* name,const Bytes& payload){if(payload.size()>std::numeric_limits<unsigned>::max())throw std::runtime_error("WebP animation is too large");Bytes out(name,name+4);u32(out,unsigned(payload.size()));out.insert(out.end(),payload.begin(),payload.end());if(payload.size()&1)out.push_back(0);return out;}
void add(Bytes& out,const Bytes& next){if(out.size()+next.size()>std::numeric_limits<unsigned>::max())throw std::runtime_error("WebP animation is too large");out.insert(out.end(),next.begin(),next.end());}
Bytes frameChunks(const Bytes& bytes){if(bytes.size()<12||!tag(bytes,0,"RIFF")||!tag(bytes,8,"WEBP")||std::uint64_t(read32(bytes,4))+8!=bytes.size())throw std::runtime_error("Invalid WebP encoder frame");Bytes out;std::size_t at=12;int images=0;while(at+8<=bytes.size()){const auto size=read32(bytes,at+4);const auto end=at+8+std::uint64_t(size)+(size&1);if(end>bytes.size())throw std::runtime_error("Truncated WebP frame");const bool image=tag(bytes,at,"VP8 ")||tag(bytes,at,"VP8L");if(image)++images;if(image||tag(bytes,at,"ALPH"))out.insert(out.end(),bytes.begin()+at,bytes.begin()+end);at=std::size_t(end);}if(images!=1||at!=bytes.size())throw std::runtime_error("Invalid WebP frame chunks");return out;}
}
GifExport encodeAnimationWebp(const Document& d,GifExportOptions options){auto prepared=prepareAnimationExport(d,options);if(prepared.width>16383||prepared.height>16383)throw std::runtime_error("WebP supports dimensions up to 16383 pixels");GifExport out;out.width=prepared.width;out.height=prepared.height;out.frameIds=std::move(prepared.frameIds);Bytes header(10);header[0]=0x12;u24(header,4,out.width-1);u24(header,7,out.height-1);Bytes body{'W','E','B','P'};add(body,chunk("VP8X",header));Bytes animation(6);animation[4]=prepared.loop?0:1;add(body,chunk("ANIM",animation));
 const auto info=SkImageInfo::Make(out.width,out.height,kRGBA_8888_SkColorType,kUnpremul_SkAlphaType,SkColorSpace::MakeSRGB());SkWebpEncoder::Options codec;codec.fCompression=SkWebpEncoder::Compression::kLossy;codec.fQuality=92;
 for(std::size_t i=0;i<prepared.frames.size();++i){const int duration=prepared.durations[i];if(duration<1||duration>0xffffff)throw std::runtime_error("WebP frame duration is out of range");SkPixmap pixels(info,prepared.frames[i].data(),std::size_t(out.width)*4);SkDynamicMemoryWStream stream;if(!SkWebpEncoder::Encode(&stream,pixels,codec))throw std::runtime_error("WebP encoding failed");Bytes encoded(stream.bytesWritten());stream.copyTo(encoded.data());Bytes frame(16);u24(frame,6,out.width-1);u24(frame,9,out.height-1);u24(frame,12,duration);frame[15]=2;add(frame,frameChunks(encoded));add(body,chunk("ANMF",frame));}out.bytes=chunk("RIFF",body);return out;}
}
