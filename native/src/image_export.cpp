#include "image_export.h"
#include "layer_compositor.h"
#include <windows.h>
#include <zlib.h>
#include <fstream>
namespace moon {namespace {
void be(std::vector<std::uint8_t>& out,std::uint32_t n){for(int i=3;i>=0;--i)out.push_back(std::uint8_t(n>>(i*8)));}
void chunk(std::vector<std::uint8_t>& out,const char* type,const std::vector<std::uint8_t>& data){be(out,std::uint32_t(data.size()));auto begin=out.size();out.insert(out.end(),type,type+4);out.insert(out.end(),data.begin(),data.end());be(out,std::uint32_t(crc32(0,out.data()+begin,uInt(data.size()+4))));}
[[noreturn]] void failed(const char* action){throw std::runtime_error(std::string(action)+" (Windows "+std::to_string(GetLastError())+")");}
}
StaticImageExport encodeStaticImagePng(const Document& d,StaticImageExportOptions options){
 if(d.active())throw std::runtime_error("Commit or cancel the active operation before exporting");
 CompositeRegion r{0,0,d.width(),d.height()};if(options.selection){if(!d.selection())throw std::runtime_error("No pixel selection to export");const auto& s=*d.selection();r={s.x,s.y,s.width,s.height};}
 auto pixels=compositeNormalRegion(d.timeline(),d.frame().id,r);
 if(options.trim){int l=r.width,t=r.height,right=-1,bottom=-1;for(int y=0;y<r.height;++y)for(int x=0;x<r.width;++x)if(pixels[std::size_t(y)*r.width+x]>>24){l=std::min(l,x);t=std::min(t,y);right=std::max(right,x);bottom=std::max(bottom,y);}if(right>=0){const int w=right-l+1,h=bottom-t+1;std::vector<Pixel> crop(std::size_t(w)*h);for(int y=0;y<h;++y)std::copy_n(pixels.begin()+std::size_t(y+t)*r.width+l,w,crop.begin()+std::size_t(y)*w);pixels=std::move(crop);r.x+=l;r.y+=t;r.width=w;r.height=h;}}
 if(options.selection)for(int y=0;y<r.height;++y)for(int x=0;x<r.width;++x)if(!selectionContains(d.selection(),r.x+x,r.y+y))pixels[std::size_t(y)*r.width+x]&=0xffffff;
 const int percent=std::clamp(options.scalePercent,1,6400);StaticImageExport out;out.width=std::max(1,int(std::floor(r.width*percent/100.0+.5)));out.height=std::max(1,int(std::floor(r.height*percent/100.0+.5)));
 if(std::uint64_t(out.width)*out.height>64*1024*1024)throw std::runtime_error("PNG exceeds native export memory budget");
 out.pixels.resize(std::size_t(out.width)*out.height);
 for(int y=0;y<out.height;++y){const int sy=int(std::uint64_t(y)*r.height/out.height);for(int x=0;x<out.width;++x){const int sx=int(std::uint64_t(x)*r.width/out.width);const auto value=pixels[std::size_t(sy)*r.width+sx];out.pixels[std::size_t(y)*out.width+x]=value;}}
 return encodeRgbaImagePng(out.width,out.height,std::move(out.pixels));
}
StaticImageExport encodeRgbaImagePng(int width,int height,std::vector<Pixel> pixels){
 if(width<1||height<1||std::uint64_t(width)*height>64*1024*1024||pixels.size()!=std::size_t(width)*height)throw std::invalid_argument("Invalid PNG raster");StaticImageExport out;out.width=width;out.height=height;out.pixels=std::move(pixels);std::vector<std::uint8_t> scan;scan.reserve((std::size_t(width)*4+1)*height);for(int y=0;y<height;++y){scan.push_back(0);for(int x=0;x<width;++x)for(int c=0;c<4;++c)scan.push_back(std::uint8_t(out.pixels[std::size_t(y)*width+x]>>(c*8)));}
 uLongf length=compressBound(uLong(scan.size()));std::vector<std::uint8_t> compressed(length);if(compress2(compressed.data(),&length,scan.data(),uLong(scan.size()),6)!=Z_OK)throw std::runtime_error("Cannot encode PNG");compressed.resize(length);
 out.png={137,80,78,71,13,10,26,10};std::vector<std::uint8_t> header;be(header,out.width);be(header,out.height);header.insert(header.end(),{8,6,0,0,0});chunk(out.png,"IHDR",header);chunk(out.png,"IDAT",compressed);chunk(out.png,"IEND",{});return out;
}
void writeStaticImagePngAtomic(const std::filesystem::path& path,const StaticImageExport& image){writeExportBytesAtomic(path,image.png);}
void writeExportBytesAtomic(const std::filesystem::path& path,const std::vector<std::uint8_t>& bytes){
 if(path.empty()||bytes.empty())throw std::invalid_argument("Empty PNG output");
 static unsigned serial=0;const auto temp=path.parent_path()/(path.filename().wstring()+L"."+std::to_wstring(GetCurrentProcessId())+L"."+std::to_wstring(GetTickCount64())+L"."+std::to_wstring(++serial)+L".tmp");
 HANDLE handle=CreateFileW(temp.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);if(handle==INVALID_HANDLE_VALUE)failed("Cannot create temporary PNG");
 try{std::size_t offset=0;while(offset<bytes.size()){DWORD written=0;const DWORD count=DWORD(std::min<std::size_t>(1024*1024,bytes.size()-offset));if(!WriteFile(handle,bytes.data()+offset,count,&written,nullptr)||written!=count)failed("Cannot write PNG");offset+=written;}if(!FlushFileBuffers(handle))failed("Cannot flush PNG");CloseHandle(handle);handle=INVALID_HANDLE_VALUE;if(!MoveFileExW(temp.c_str(),path.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))failed("Cannot replace PNG");}catch(...){if(handle!=INVALID_HANDLE_VALUE)CloseHandle(handle);DeleteFileW(temp.c_str());throw;}
}
}
