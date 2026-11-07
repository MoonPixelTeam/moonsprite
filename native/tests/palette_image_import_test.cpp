#include "palette_image_import.h"
#include "palette_import.h"
#include "image_export.h"
#include "webp_export.h"
#include <zlib.h>
#include <algorithm>
#include <iostream>
#include <stdexcept>
#include "fixtures/palette_image_legacy.h"
namespace {
using Bytes=std::vector<std::uint8_t>;
void require(bool ok,const char* message){if(!ok)throw std::runtime_error(message);}
void be32(Bytes& b,std::uint32_t n){for(int i=24;i>=0;i-=8)b.push_back(std::uint8_t(n>>i));}
void le(Bytes& b,size_t p,std::uint32_t n,unsigned count){for(unsigned i=0;i<count;++i)b[p+i]=std::uint8_t(n>>(8*i));}
void chunk(Bytes& b,const char* type,const Bytes& body){be32(b,std::uint32_t(body.size()));auto start=b.size();b.insert(b.end(),type,type+4);b.insert(b.end(),body.begin(),body.end());be32(b,std::uint32_t(crc32(0,b.data()+start,uInt(body.size()+4))));}
Bytes png(unsigned w,unsigned h,unsigned type,unsigned depth,const Bytes& rows,const Bytes& palette={},const Bytes& alpha={}){Bytes out={137,80,78,71,13,10,26,10},header;be32(header,w);be32(header,h);header.push_back(std::uint8_t(depth));header.push_back(std::uint8_t(type));header.insert(header.end(),{0,0,0});chunk(out,"IHDR",header);if(!palette.empty())chunk(out,"PLTE",palette);if(!alpha.empty())chunk(out,"tRNS",alpha);uLongf size=compressBound(uLong(rows.size()));Bytes data(size);require(compress2(data.data(),&size,rows.data(),uLong(rows.size()),Z_BEST_SPEED)==Z_OK,"Fixture deflate failed");data.resize(size);chunk(out,"IDAT",data);chunk(out,"IEND",{});return out;}
template<class F>void rejects(F f,const char* message){bool failed=false;try{f();}catch(const std::runtime_error&){failed=true;}require(failed,message);}
}
int main(){try{using namespace moon;
 std::size_t oracleIndex=0;for(const auto& fixture:legacyImagePaletteFixtures){bool accepted=true;std::vector<Pixel> colors;try{colors=decodeImagePaletteColors(fixture.bytes,std::string("oracle.")+fixture.extension);}catch(const std::exception&){accepted=false;}if(accepted!=fixture.accepted||(accepted&&colors!=fixture.colors)){std::cerr<<"case "<<oracleIndex<<" accepted "<<accepted<<" expected "<<fixture.accepted<<"\n";for(auto c:colors)std::cerr<<std::hex<<c<<",";std::cerr<<"\nexpected ";for(auto c:fixture.colors)std::cerr<<std::hex<<c<<",";std::cerr<<"\n";throw std::runtime_error("Actual legacy image mismatch case "+std::to_string(oracleIndex));}++oracleIndex;}
 const auto source=png(2,2,6,8,{0,17,34,51,255,68,85,102,255,0,17,34,51,255,119,136,153,128});
 require(decodeImagePaletteColors(source,"missing/snapshot.png")==std::vector<Pixel>{0xff332211u,0xff665544u,0x80998877u},"Legacy PNG order/dedup/alpha");
 const auto imported=decodeImportedPalette(source,"missing/snapshot.png");require(imported.colors.size()==3&&imported.columns==3&&imported.slots.size()==3,"Image pipeline layout");
 require(decodeImagePaletteColors(png(2,1,3,1,{0,0x40},{17,34,51,68,85,102},{0,255}),"snapshot.png")==std::vector<Pixel>{0x00332211u,0xff665544u},"Indexed PNG transparent RGB");
 require(decodeImagePaletteColors(png(1,1,2,8,{0,17,34,51}),"snapshot.png")==std::vector<Pixel>{0xff332211u},"RGB PNG alpha expansion");
 auto gray=png(1,1,0,8,{0,64});rejects([&]{decodeImagePaletteColors(gray,"snapshot.png");},"Grayscale gate widened");require(decodeImagePaletteColors(gray,"snapshot.jpg")==std::vector<Pixel>{0xff404040u},"Generic image format guessing");
 rejects([&]{decodeImagePaletteColors(png(1,1,6,16,{0,17,17,34,34,51,51,255,255}),"snapshot.png");},"16 bit gate widened");auto corrupt=source;corrupt[29]^=1;rejects([&]{decodeImagePaletteColors(corrupt,"snapshot.png");},"Bad CRC accepted");rejects([&]{decodeImagePaletteColors(png(16777217,1,6,8,{0,0,0,0,255}),"snapshot.png");},"Pixel limit");
 Bytes bmp(70,0);bmp[0]='B';bmp[1]='M';le(bmp,2,70,4);le(bmp,10,54,4);le(bmp,14,40,4);le(bmp,18,2,4);le(bmp,22,2,4);le(bmp,26,1,2);le(bmp,28,24,2);le(bmp,34,16,4);Bytes rows={0,0,255,0,255,0,0,0,0,0,255,255,0,0,0,0};std::copy(rows.begin(),rows.end(),bmp.begin()+54);require(decodeImagePaletteColors(bmp,"snapshot.bmp")==std::vector<Pixel>{0xff0000ffu,0xffff0000u,0xff00ff00u},"BMP snapshot order");
 Bytes gif={'G','I','F','8','9','a',2,0,1,0,0x80,0,0,17,34,51,68,85,102,0x21,0xf9,4,1,0,0,0,0,0x2c,1,0,0,0,1,0,1,0,0,2,2,0x44,1,0,0x3b};require(decodeImagePaletteColors(gif,"snapshot.gif")==std::vector<Pixel>{0u,0x00332211u},"GIF canvas/transparent RGB");
 auto ico=encodeImageIco(2,1,{0xff332211,0xff665544});require(decodeImagePaletteColors(ico.bytes,"snapshot.ico")==std::vector<Pixel>{0xff332211,0xff665544},"ICO decode");
 auto jpeg=encodeImageJpeg(2,1,{0xff332211,0xff332211});const auto jpegColors=decodeImagePaletteColors(jpeg.bytes,"snapshot.jpg");require(!jpegColors.empty()&&std::all_of(jpegColors.begin(),jpegColors.end(),[](Pixel p){return p>>24==255;}),"JPEG decode");require(decodeImagePaletteColors(jpeg.bytes,"snapshot.jpeg")==jpegColors,"JPEG extension dispatch");
 Document webpDocument(2,1);webpDocument.beginStroke({0,0},0xff332211);webpDocument.commitStroke();auto webp=encodeAnimationWebp(webpDocument);const auto webpColors=decodeImagePaletteColors(webp.bytes,"snapshot.webp");require(webpColors.size()==2&&(webpColors[0]>>24)==255&&(webpColors[1]>>24)==0,"WebP first frame alpha/order (lossy RGB fixture)");
 // Independent row-major expectations across row boundaries and bit depths.
 for(unsigned depth:{1u,2u,4u,8u}){unsigned count=1u<<depth;Bytes table,alpha,packed;std::vector<Pixel> expected;for(unsigned i=0;i<count;++i){table.insert(table.end(),{std::uint8_t(i),std::uint8_t(255-i),std::uint8_t(i/2)});alpha.push_back(std::uint8_t(i));}const unsigned width=count+3;for(unsigned y=0;y<3;++y){packed.push_back(0);unsigned bits=0,used=0;for(unsigned x=0;x<width;++x){unsigned index=(x+y)%count;bits=(bits<<depth)|index;used+=depth;if(used==8){packed.push_back(std::uint8_t(bits));used=bits=0;}Pixel color=index|((255-index)<<8)|((index/2)<<16)|(index<<24);if(std::find(expected.begin(),expected.end(),color)==expected.end())expected.push_back(color);}if(used)packed.push_back(std::uint8_t(bits<<(8-used)));}require(decodeImagePaletteColors(png(width,3,3,depth,packed,table,alpha),"rows.png")==expected,"indexed multirow packing/alpha/order");}
 Bytes rgba;std::vector<Pixel> expected;for(unsigned y=0;y<257;++y){rgba.push_back(0);for(unsigned x=0;x<257;++x){unsigned index=(y*257+x)%65536;Pixel color=(index&255)|((index>>8)<<8)|(17u<<16)|((index%3?255u:0u)<<24);rgba.insert(rgba.end(),{std::uint8_t(color),std::uint8_t(color>>8),std::uint8_t(color>>16),std::uint8_t(color>>24)});if(expected.size()<65536)expected.push_back(color);}}require(decodeImagePaletteColors(png(257,257,6,8,rgba),"limit.png")==expected,"65536 unique colors with repeated final row preserves RGBA order");rgba[3+(256*257+256)*4+256]=42;rejects([&]{decodeImagePaletteColors(png(257,257,6,8,rgba),"over-limit.png");},"65537th image color accepted");
 // Tall, low-color image exercises many streamed rows without a full RGBA copy.
 Bytes tall;for(unsigned y=0;y<8192;++y){tall.push_back(0);for(unsigned x=0;x<32;++x)tall.insert(tall.end(),{17,34,51,std::uint8_t(y%2?255:0)});}require(decodeImagePaletteColors(png(32,8192,6,8,tall),"tall.png")==std::vector<Pixel>{0x00332211,0xff332211},"streamed tall image alpha/order");
 // Wide channels cross multiple bounded bands; values straddle legacy rounding boundaries.
 Bytes tall16;for(unsigned y=0;y<1025;++y){tall16.push_back(0);for(unsigned x=0;x<17;++x)tall16.insert(tall16.end(),{0,128,1,129,128,0,std::uint8_t(y%2?255:0),std::uint8_t(y%2?255:0)});}require(decodeImagePaletteColors(png(17,1025,6,16,tall16),"tall16.jpg")==std::vector<Pixel>{0x00800100u,0xff800100u},"16bit streamed bands preserve legacy rounding/alpha/order");
 std::cout<<"Image palette fixtures passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
