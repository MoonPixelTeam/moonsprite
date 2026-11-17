#include "cel_thumbnail.h"
#include "raster_color_context.h"
#include <iostream>
#include <initializer_list>
#include <limits>
#include <stdexcept>
using namespace moon;using Pixel=timeline::Pixel;
void require(bool value,const char* message){if(!value)throw std::runtime_error(message);}
timeline::Surface surface(int w,int h,int x,int y,std::initializer_list<Pixel> pixels){timeline::Surface s;s.width=w;s.height=h;s.offsetX=x;s.offsetY=y;s.pixels=pixels;return s;}
std::uint64_t hash(const std::vector<Pixel>& pixels){std::uint64_t h=14695981039346656037ULL;for(auto p:pixels)for(int shift:{0,8,16,24})h=(h^((p>>shift)&255))*1099511628211ULL;return h;}
struct PaletteColor {int id;Pixel color;};
void indexedThumbnails(){
 const std::vector<PaletteColor> entries{{0,0xffabcdef},{7,0xff0000ff},{19,0x8000ff00},{23,0x00123456}};
 const RasterColorContext colors(entries,{0,7,19,23},color_mode::Mode::Indexed);
 auto indexed=surface(4,2,-1,1,{7,19,23,0x80000001u,0,7,19,23});indexed.format=timeline::RasterFormat::Indexed;
 auto rgba=indexed;rgba.format=timeline::RasterFormat::Rgba;rgba.pixels={0xff0000ff,0x8000ff00,0x00123456,0,0xffabcdef,0xff0000ff,0x8000ff00,0x00123456};
 const auto original=indexed.pixels;
 for(auto framing:{CelThumbnailFraming::Canvas,CelThumbnailFraming::Content})for(auto background:{CelThumbnailBackground::Checkerboard,CelThumbnailBackground::Transparent})for(double opacity:{0.,.5,1.}){
  CelThumbnailOptions options{16,opacity,background,framing};require(renderCelThumbnailPixels(6,4,indexed,options,&colors)==renderCelThumbnailPixels(6,4,rgba,options),"indexed palette rendering and bounds");
 }
 require(indexed.pixels==original&&indexed.format==timeline::RasterFormat::Indexed,"thumbnail preserves raw IDs");
 const RasterColorContext changed(std::vector<PaletteColor>{{7,0xff123456}},{7},color_mode::Mode::Indexed);
 CelThumbnailOptions options{16,1,CelThumbnailBackground::Transparent,CelThumbnailFraming::Canvas};require(renderCelThumbnailPixels(6,4,indexed,options,&colors)!=renderCelThumbnailPixels(6,4,indexed,options,&changed),"palette change updates colors");
 const RasterColorContext duplicate(std::vector<PaletteColor>{{7,0xff0000ff},{7,0xff00ff00}},{7},color_mode::Mode::Indexed);
 auto single=surface(1,1,0,0,{7});single.format=timeline::RasterFormat::Indexed;options.targetSize=1;require(renderCelThumbnailPixels(1,1,single,options,&duplicate)==std::vector<Pixel>{0xff00ff00},"last duplicate palette ID wins");
 require(renderCelThumbnailPixels(1,1,single,options)==std::vector<Pixel>{0},"missing palette renders transparent");
}
int main(){try{indexedThumbnails();CelThumbnailOptions o;o.targetSize=8;o.background=CelThumbnailBackground::Transparent;o.framing=CelThumbnailFraming::Canvas;auto p=renderCelThumbnailPixels(8,4,surface(1,1,1,1,{0xff0000ff}),o);require(p.size()==64&&hash(p)==0xbdd95012c96e3f43ULL&&p[25]==0xff0000ff,"non-square canvas old TS oracle");p=renderCelThumbnailPixels(8,4,surface(3,1,-2,0,{0xff0000ff,0xff0000ff,0xff0000ff}),o);require(hash(p)==0x50f3375175da5523ULL&&p[16]==0xff0000ff,"negative offset old TS oracle");auto alpha=surface(3,1,0,0,{0xff0000ff,0x8000ff00,0});o.targetSize=3;o.opacity=.5;o.framing=CelThumbnailFraming::Content;p=renderCelThumbnailPixels(3,1,alpha,o);require(hash(p)==0x860be36840cd0fabULL&&p[3]==0x800000ff&&p[4]==0x4000ff00,"content alpha old TS oracle");o.background=CelThumbnailBackground::Checkerboard;p=renderCelThumbnailPixels(3,1,alpha,o);require(hash(p)==0x3812552034cbcbcdULL,"checker blend old TS oracle");o.targetSize=1;o.opacity=1;o.background=CelThumbnailBackground::Transparent;p=renderCelThumbnailPixels(1,1,surface(1,1,0,0,{0x00c85018}),o);require(p==std::vector<Pixel>({0x00c85018})&&hash(p)==0x00ddb7493ab5a605ULL,"transparent RGB old TS oracle");o.targetSize=8;p=renderCelThumbnailPixels(8,4,surface(2,1,5,2,{0xff0000ff,0x8000ff00}),o);require(hash(p)==0x420b89c02d6130bdULL,"content offset old TS oracle");o.targetSize=3;o.background=CelThumbnailBackground::Checkerboard;p=renderCelThumbnailPixels(8,4,surface(0,0,0,0,{}),o);require(hash(p)==0x926ccb49a1a00a5cULL,"empty surface old TS oracle");for(int n:{8,16})for(int x:{1,5}){int w=x==1?1:2,y=x==1?1:2,scale=n/8;o.targetSize=n;o.background=CelThumbnailBackground::Transparent;o.framing=CelThumbnailFraming::Canvas;auto s=surface(w,1,x,y,{0xff0000ff});s.pixels.assign(w,0xff0000ff);p=renderCelThumbnailPixels(8,4,s,o);int painted=0;for(auto pixel:p)painted+=bool(pixel>>24);require(painted==w*scale*scale&&p[((y+2)*scale)*n+x*scale]==0xff0000ff,"original canvas scale/offset cases");}o.targetSize=3.9;o.framing=CelThumbnailFraming::Content;o.opacity=std::numeric_limits<double>::quiet_NaN();require(renderCelThumbnailPixels(3,1,alpha,o)==renderCelThumbnailPixels(3,1,alpha,CelThumbnailOptions{3,1,CelThumbnailBackground::Transparent,CelThumbnailFraming::Content}),"finite opacity fallback/size truncation");std::cout<<"cel-thumbnail: passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
