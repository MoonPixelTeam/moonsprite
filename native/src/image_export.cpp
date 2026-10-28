#include <atomic>
#include "image_export.h"
#include "layer_compositor.h"
#include "cel_properties.h"
#include "include/core/SkColorSpace.h"
#include "include/core/SkPixmap.h"
#include "include/core/SkStream.h"
#include "include/encode/SkJpegEncoder.h"
#include <windows.h>
#include <zlib.h>
#include <fstream>
#include <unordered_map>
namespace moon {namespace {
void be(std::vector<std::uint8_t>& out,std::uint32_t n){for(int i=3;i>=0;--i)out.push_back(std::uint8_t(n>>(i*8)));}
void chunk(std::vector<std::uint8_t>& out,const char* type,const std::vector<std::uint8_t>& data){be(out,std::uint32_t(data.size()));auto begin=out.size();out.insert(out.end(),type,type+4);out.insert(out.end(),data.begin(),data.end());be(out,std::uint32_t(crc32(0,out.data()+begin,uInt(data.size()+4))));}
[[noreturn]] void failed(const char* action){throw std::runtime_error(std::string(action)+" (Windows "+std::to_string(GetLastError())+")");}
}
std::u32string staticLayerExportStem(const Document& d,const std::string& layerId){
 // legacy document-files sanitizeFileStem + document-file-service layer stem.
 auto sanitize=[](std::u32string name,std::u32string fallback){auto dot=name.find_last_of(U'.');if(dot!=std::u32string::npos){auto ext=name.substr(dot+1);for(auto& c:ext)if(c>=U'A'&&c<=U'Z')c+=32;for(auto known:{U"moonsprite",U"aseprite",U"ase",U"png",U"jpg",U"jpeg",U"webp",U"bmp",U"svg",U"gif",U"ico",U"psd"})if(ext==known){name.resize(dot);break;}}for(auto& c:name)if(std::u32string(U"\\/:*?\"<>|").find(c)!=std::u32string::npos)c=U'_';auto space=[](char32_t c){return c==U' '||c>=9&&c<=13||c==0xa0||c==0x1680||c>=0x2000&&c<=0x200a||c==0x2028||c==0x2029||c==0x202f||c==0x205f||c==0x3000||c==0xfeff;};while(!name.empty()&&space(name.front()))name.erase(name.begin());while(!name.empty()&&space(name.back()))name.pop_back();return name.empty()?fallback:name;};
 const auto& layers=d.timeline().state().layers;auto it=std::find_if(layers.begin(),layers.end(),[&](const auto& l){return l.id==layerId;});
 if(it==layers.end())return sanitize(d.name(),U"MoonSprite-export");auto index=std::to_string(it-layers.begin()+1);
 return sanitize(d.name(),U"MoonSprite-export")+U"-"+sanitize(it->name,U"layer-"+std::u32string(index.begin(),index.end()));
}
static StaticImageExport prepareStaticImage(const Document& d,StaticImageExportOptions options,bool bmp=false){
 if(d.active())throw std::runtime_error("Commit or cancel the active operation before exporting");
 CompositeRegion r{0,0,d.width(),d.height()};if(options.selection){if(!d.selection())throw std::runtime_error("No pixel selection to export");const auto& s=*d.selection();r={s.x,s.y,s.width,s.height};}
 if(!options.sliceId.empty()){if(options.selection||!options.layerId.empty())throw std::invalid_argument("Slice and other export targets are exclusive");const auto it=std::find_if(d.slices().begin(),d.slices().end(),[&](const auto& s){return s.id==options.sliceId;});if(it==d.slices().end())throw std::invalid_argument("Slice export target unavailable");const auto s=clampSliceRect(it->rect,d.width(),d.height());r={s.x,s.y,s.width,s.height};}
 if(!options.sliceId.empty()&&options.trim){options.trim=false;options.trimCommon=true;}
 // Invalid/missing layerId follows legacy documentForLayerExport: whole document.
 const bool layerTarget=!options.layerId.empty()&&d.timeline().hasLayer(options.layerId);
 auto pixels=compositeNormalRegion(d.timeline(),d.frame().id,r,{},nullptr,0,0,0,false,layerTarget?options.layerId:std::string{});
 // Same direct RGBA bytes as legacy compositeRegion's single-layer fast path.
 if(d.timeline().state().groups.empty() && d.timeline().state().layers.size()==1){const auto& layer=d.timeline().state().layers.front();if(!timeline::styleVisible(layer.layerStyles)&&layer.visible&&layer.blendMode=="normal"&&frameCelOpacity(d.timeline(),layer,d.frame().id)==1){auto slot=d.timeline().findCel(layer.id,d.frame().id);auto resolved=d.timeline().resolveSurface(slot->id);if(resolved.surface){const auto& source=*resolved.surface;for(int y=0;y<r.height;++y)for(int x=0;x<r.width;++x){const int sx=r.x+x-source.offsetX,sy=r.y+y-source.offsetY;if(sx>=0&&sy>=0&&sx<source.width&&sy<source.height)pixels[std::size_t(y)*r.width+x]=source.pixels[std::size_t(sy)*source.width+sx];}}}}

 // Worker common mode uses original document visible bounds before target isolation.
 if(options.trimCommon){if(auto visible=d.visibleContentBounds(false)){const int l=std::max(r.x,visible->x),t=std::max(r.y,visible->y),right=std::min(r.x+r.width,visible->x+visible->w),bottom=std::min(r.y+r.height,visible->y+visible->h);if(right>l&&bottom>t){const int w=right-l,h=bottom-t;std::vector<Pixel> crop(std::size_t(w)*h);for(int y=0;y<h;++y)std::copy_n(pixels.begin()+std::size_t(y+t-r.y)*r.width+l-r.x,w,crop.begin()+std::size_t(y)*w);pixels=std::move(crop);r={l,t,w,h};}}}
 else{
 if(bmp&&options.trim&&!layerTarget){if(auto visible=d.visibleContentBounds(false)){const int l=std::max(r.x,visible->x),t=std::max(r.y,visible->y),right=std::min(r.x+r.width,visible->x+visible->w),bottom=std::min(r.y+r.height,visible->y+visible->h);if(right>l&&bottom>t){const int w=right-l,h=bottom-t;std::vector<Pixel> crop(std::size_t(w)*h);for(int y=0;y<h;++y)std::copy_n(pixels.begin()+std::size_t(y+t-r.y)*r.width+l-r.x,w,crop.begin()+std::size_t(y)*w);pixels=std::move(crop);r={l,t,w,h};}}}
 if((!bmp||layerTarget)&&options.trim){int l=r.width,t=r.height,right=-1,bottom=-1;for(int y=0;y<r.height;++y)for(int x=0;x<r.width;++x)if(pixels[std::size_t(y)*r.width+x]>>24){l=std::min(l,x);t=std::min(t,y);right=std::max(right,x);bottom=std::max(bottom,y);}if(right>=0){const int w=right-l+1,h=bottom-t+1;std::vector<Pixel> crop(std::size_t(w)*h);for(int y=0;y<h;++y)std::copy_n(pixels.begin()+std::size_t(y+t)*r.width+l,w,crop.begin()+std::size_t(y)*w);pixels=std::move(crop);r.x+=l;r.y+=t;r.width=w;r.height=h;}}
 }
 if(options.selection)for(int y=0;y<r.height;++y)for(int x=0;x<r.width;++x)if(!selectionContains(d.selection(),r.x+x,r.y+y))pixels[std::size_t(y)*r.width+x]=(bmp||options.trimCommon)?0:(pixels[std::size_t(y)*r.width+x]&0xffffff);
 const int percent=std::clamp(options.scalePercent,1,6400);StaticImageExport out;out.width=std::max(1,int(std::floor(r.width*percent/100.0+.5)));out.height=std::max(1,int(std::floor(r.height*percent/100.0+.5)));
 if(std::uint64_t(out.width)*out.height>64*1024*1024)throw std::runtime_error("PNG exceeds native export memory budget");
 out.pixels.resize(std::size_t(out.width)*out.height);
 for(int y=0;y<out.height;++y){const int sy=int(std::uint64_t(y)*r.height/out.height);for(int x=0;x<out.width;++x){const int sx=int(std::uint64_t(x)*r.width/out.width);const auto value=pixels[std::size_t(sy)*r.width+sx];out.pixels[std::size_t(y)*out.width+x]=value;}}
 protectExportPixels(out.pixels,out.width,out.height,percent,options.protection);return out;
}
// Legacy core/png.ts encodeScaledPixels: putImageData replaces its earlier white fill.
// Chromium exports the replaced alpha pixels against black at quality 0.92.
JpegImageExport encodeImageJpeg(int width,int height,const std::vector<Pixel>& pixels){
 if(width<1||height<1||std::uint64_t(width)*height!=pixels.size()||pixels.size()>64*1024*1024)throw std::runtime_error("Invalid JPEG pixels");
 const auto info=SkImageInfo::Make(width,height,kRGBA_8888_SkColorType,kUnpremul_SkAlphaType,SkColorSpace::MakeSRGB());SkPixmap source(info,pixels.data(),std::size_t(width)*4);SkJpegEncoder::Options options;options.fQuality=92;options.fDownsample=SkJpegEncoder::Downsample::k420;options.fAlphaOption=SkJpegEncoder::AlphaOption::kBlendOnBlack;SkDynamicMemoryWStream stream;
 if(!SkJpegEncoder::Encode(&stream,source,options))throw std::runtime_error("JPEG encoding failed");JpegImageExport output;output.width=width;output.height=height;output.bytes.resize(stream.bytesWritten());stream.copyTo(output.bytes.data());return output;
}
JpegImageExport encodeStaticImageJpeg(const Document& document,StaticImageExportOptions options){const auto prepared=prepareStaticImage(document,options);return encodeImageJpeg(prepared.width,prepared.height,prepared.pixels);}
// Actual legacy core/palette.ts encodePalettePng default16px tiles and at most8 columns.
StaticImageExport encodePaletteImagePng(const std::vector<Pixel>& colors){if(colors.empty())throw std::runtime_error("No palette colors to save");const int columns=std::min(8,int(colors.size())),rows=int((colors.size()+columns-1)/columns),width=columns*16,height=rows*16;std::vector<Pixel> pixels(std::size_t(width)*height);for(std::size_t i=0;i<colors.size();++i){const int left=int(i%columns)*16,top=int(i/columns)*16;for(int y=top;y<top+16;++y)std::fill_n(pixels.begin()+std::size_t(y)*width+left,16,colors[i]);}return encodeImagePng(width,height,std::move(pixels),true);}
StaticImageExport encodeStaticImagePng(const Document& d,StaticImageExportOptions options){auto raster=prepareStaticImage(d,options);return encodeImagePng(raster.width,raster.height,std::move(raster.pixels),options.automatic);}
// Exact legacy core/bmp.ts BITMAPV4HEADER and bottom-up BGRA storage.
std::vector<std::uint8_t> encodeImageBmp(int width,int height,const std::vector<Pixel>& pixels){
 if(width<1||height<1||std::uint64_t(width)*height!=pixels.size())throw std::invalid_argument("Invalid BMP image data");
 const auto pixelBytes=std::uint64_t(width)*height*4,fileSize=122+pixelBytes;if(fileSize>0xffffffffull)throw std::invalid_argument("BMP image is too large");
 std::vector<std::uint8_t> bytes(std::size_t(fileSize),0);auto le=[&](std::size_t offset,std::uint32_t value,int count=4){for(int c=0;c<count;++c)bytes[offset+c]=std::uint8_t(value>>(c*8));};
 le(0,0x4d42,2);le(2,std::uint32_t(fileSize));le(10,122);le(14,108);le(18,width);le(22,height);le(26,1,2);le(28,32,2);le(30,3);le(34,std::uint32_t(pixelBytes));le(38,2835);le(42,2835);le(54,0x00ff0000);le(58,0x0000ff00);le(62,0x000000ff);le(66,0xff000000);le(70,0x73524742);
 for(int y=0;y<height;++y)for(int x=0;x<width;++x){const auto pixel=pixels[std::size_t(height-y-1)*width+x];const auto offset=122+(std::size_t(y)*width+x)*4;bytes[offset]=std::uint8_t(pixel>>16);bytes[offset+1]=std::uint8_t(pixel>>8);bytes[offset+2]=std::uint8_t(pixel);bytes[offset+3]=std::uint8_t(pixel>>24);}return bytes;
}
BmpImageExport encodeStaticImageBmp(const Document& d,StaticImageExportOptions options){auto raster=prepareStaticImage(d,options,true);return {raster.width,raster.height,encodeImageBmp(raster.width,raster.height,raster.pixels)};}
// Exact legacy png.ts encodeSvg: horizontal RGBA runs, transparent pixels omitted.
std::vector<std::uint8_t> encodeImageSvg(int width,int height,const std::vector<Pixel>& pixels){
 if(width<1||height<1||std::uint64_t(width)*height!=pixels.size()||pixels.size()>64*1024*1024)throw std::invalid_argument("Invalid SVG image data");
 std::string text="<svg xmlns=\"http://www.w3.org/2000/svg\" width=\""+std::to_string(width)+"\" height=\""+std::to_string(height)+"\" viewBox=\"0 0 "+std::to_string(width)+" "+std::to_string(height)+"\" shape-rendering=\"crispEdges\">";const char hex[]="0123456789abcdef";
 for(int y=0;y<height;++y){int x=0;while(x<width){auto pixel=pixels[std::size_t(y)*width+x];unsigned alpha=pixel>>24;if(!alpha){++x;continue;}int run=1;while(x+run<width&&pixels[std::size_t(y)*width+x+run]==pixel)++run;std::string color="#";for(int c=0;c<3;++c){auto value=(pixel>>(c*8))&255;color+=hex[value>>4];color+=hex[value&15];}std::string opacity;if(alpha<255){auto fraction=std::to_string((alpha*1000000+127)/255);fraction=std::string(6-fraction.size(),'0')+fraction;while(fraction.back()=='0')fraction.pop_back();opacity=" fill-opacity=\"0."+fraction+"\"";}text+="<path d=\"M"+std::to_string(x)+" "+std::to_string(y)+"h"+std::to_string(run)+"v1H"+std::to_string(x)+"z\" fill=\""+color+"\""+opacity+"/>";x+=run;}}
 text+="</svg>";return {text.begin(),text.end()};
}
SvgImageExport encodeStaticImageSvg(const Document& d,StaticImageExportOptions options){auto raster=prepareStaticImage(d,options,true);return {raster.width,raster.height,encodeImageSvg(raster.width,raster.height,raster.pixels)};}
// legacy core/ico.ts: one PNG-backed RGBA image, proportional 256px maximum.
IcoImageExport encodeImageIco(int width,int height,const std::vector<Pixel>& pixels){
 if(width<1||height<1||std::uint64_t(width)*height!=pixels.size()||pixels.size()>64*1024*1024)throw std::invalid_argument("Invalid ICO image data");
 const int largest=std::max(width,height);const double ratio=largest>256?256.0/largest:1.0;IcoImageExport out;out.width=std::max(1,int(std::floor(width*ratio+.5)));out.height=std::max(1,int(std::floor(height*ratio+.5)));std::vector<Pixel> scaled(std::size_t(out.width)*out.height);
 for(int y=0;y<out.height;++y)for(int x=0;x<out.width;++x)scaled[std::size_t(y)*out.width+x]=pixels[std::size_t(std::uint64_t(y)*height/out.height)*width+std::uint64_t(x)*width/out.width];
 auto png=encodeRgbaImagePng(out.width,out.height,std::move(scaled));out.bytes.resize(22+png.png.size(),0);auto le=[&](int offset,std::uint32_t value,int count){for(int c=0;c<count;++c)out.bytes[offset+c]=std::uint8_t(value>>(8*c));};le(2,1,2);le(4,1,2);out.bytes[6]=std::uint8_t(out.width==256?0:out.width);out.bytes[7]=std::uint8_t(out.height==256?0:out.height);le(10,1,2);le(12,32,2);le(14,std::uint32_t(png.png.size()),4);le(18,22,4);std::copy(png.png.begin(),png.png.end(),out.bytes.begin()+22);return out;
}
IcoImageExport encodeStaticImageIco(const Document& d,StaticImageExportOptions options){auto raster=prepareStaticImage(d,options,true);return encodeImageIco(raster.width,raster.height,raster.pixels);}
StaticImageExport encodeRgbaImagePng(int width,int height,std::vector<Pixel> pixels){return encodeImagePng(width,height,std::move(pixels),false);}
StaticImageExport encodeImagePng(int width,int height,std::vector<Pixel> pixels,bool automatic){
 if(width<1||height<1||std::uint64_t(width)*height>64*1024*1024||pixels.size()!=std::size_t(width)*height)throw std::invalid_argument("Invalid PNG raster");StaticImageExport out;out.width=width;out.height=height;out.pixels=std::move(pixels);
 // Exact legacy first-appearance order includes all four RGBA bytes.
 std::vector<Pixel> colors;std::unordered_map<Pixel,unsigned> ids;if(automatic)for(auto pixel:out.pixels)if(!ids.count(pixel)){ids.emplace(pixel,unsigned(colors.size()));colors.push_back(pixel);if(colors.size()>256)break;}
 out.indexed=automatic&&colors.size()<=256;const unsigned depth=colors.size()<=2?1:colors.size()<=4?2:colors.size()<=16?4:8;const std::size_t rowBytes=out.indexed?(std::size_t(width)*depth+7)/8:std::size_t(width)*4;std::vector<std::uint8_t> scan((rowBytes+1)*height,0);
 for(int y=0;y<height;++y)for(int x=0;x<width;++x){const auto pixel=out.pixels[std::size_t(y)*width+x];if(out.indexed){const auto bit=std::size_t(x)*depth;scan[std::size_t(y)*(rowBytes+1)+1+bit/8]|=std::uint8_t(ids.at(pixel)<<(8-depth-bit%8));}else for(int c=0;c<4;++c)scan[std::size_t(y)*(rowBytes+1)+1+x*4+c]=std::uint8_t(pixel>>(c*8));}
 uLongf length=compressBound(uLong(scan.size()));std::vector<std::uint8_t> compressed(length);if(compress2(compressed.data(),&length,scan.data(),uLong(scan.size()),6)!=Z_OK)throw std::runtime_error("Cannot encode PNG");compressed.resize(length);
 out.png={137,80,78,71,13,10,26,10};std::vector<std::uint8_t> header;be(header,out.width);be(header,out.height);header.insert(header.end(),{std::uint8_t(out.indexed?depth:8),std::uint8_t(out.indexed?3:6),0,0,0});chunk(out.png,"IHDR",header);
 if(out.indexed){std::vector<std::uint8_t> palette,alpha;for(auto color:colors){for(int c=0;c<3;++c)palette.push_back(std::uint8_t(color>>(c*8)));alpha.push_back(std::uint8_t(color>>24));}chunk(out.png,"PLTE",palette);chunk(out.png,"tRNS",alpha);}
 chunk(out.png,"IDAT",compressed);chunk(out.png,"IEND",{});return out;
}
void writeStaticImagePngAtomic(const std::filesystem::path& path,const StaticImageExport& image){writeExportBytesAtomic(path,image.png);}
void writeExportBytesAtomic(const std::filesystem::path& path,const std::vector<std::uint8_t>& bytes){
 if(path.empty()||bytes.empty())throw std::invalid_argument("Empty PNG output");
 static std::atomic<unsigned> serial{0};const auto temp=path.parent_path()/(path.filename().wstring()+L"."+std::to_wstring(GetCurrentProcessId())+L"."+std::to_wstring(GetTickCount64())+L"."+std::to_wstring(++serial)+L".tmp");
 HANDLE handle=CreateFileW(temp.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);if(handle==INVALID_HANDLE_VALUE){const auto error=GetLastError();throw std::runtime_error("Cannot create temporary file: "+temp.u8string()+" (Windows "+std::to_string(error)+")");}
 try{std::size_t offset=0;while(offset<bytes.size()){DWORD written=0;const DWORD count=DWORD(std::min<std::size_t>(1024*1024,bytes.size()-offset));if(!WriteFile(handle,bytes.data()+offset,count,&written,nullptr)||written!=count)failed("Cannot write PNG");offset+=written;}if(!FlushFileBuffers(handle))failed("Cannot flush PNG");CloseHandle(handle);handle=INVALID_HANDLE_VALUE;if(!MoveFileExW(temp.c_str(),path.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))failed("Cannot replace PNG");}catch(...){if(handle!=INVALID_HANDLE_VALUE)CloseHandle(handle);DeleteFileW(temp.c_str());throw;}
}
}
