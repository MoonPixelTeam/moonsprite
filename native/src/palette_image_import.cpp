// Native codec adaptation of legacy/src-tauri/src/platform_palette.rs:766-889.
// MoonSprite Source-Available License 1.0; see legacy/LICENSE.
#include "palette_image_import.h"
#include <windows.h>
#include <wincodec.h>
#include <wrl/client.h>
#include "include/codec/SkWebpDecoder.h"
#include "include/core/SkData.h"
#include "include/core/SkImageInfo.h"
#include <zlib.h>
#include <cstring>
#include <stdexcept>
#include <unordered_set>
namespace moon { namespace {
using Bytes=std::vector<std::uint8_t>;
void need(bool ok,const char* message){if(!ok)throw std::runtime_error(message);}
void check(HRESULT hr,const char* message){need(SUCCEEDED(hr),message);}
void dimensions(std::uint64_t w,std::uint64_t h){need(w&&h&&w<=16777216&&h<=16777216&&w*h<=16777216,"图片色板尺寸无效，最多支持 16777216 个像素。");}
bool tag(const Bytes& b,size_t p,const char* value,size_t n){return p<=b.size()&&n<=b.size()-p&&std::memcmp(b.data()+p,value,n)==0;}
unsigned le16(const Bytes& b,size_t p){need(p<=b.size()&&b.size()-p>=2,"图片色板文件已截断。");return unsigned(b[p])|(unsigned(b[p+1])<<8);}
std::uint32_t be32(const Bytes& b,size_t p){need(p<=b.size()&&b.size()-p>=4,"PNG 色板文件已截断。");return (std::uint32_t(b[p])<<24)|(std::uint32_t(b[p+1])<<16)|(std::uint32_t(b[p+2])<<8)|b[p+3];}
void strictPng(const Bytes& b){
 need(tag(b,0,"\x89PNG\r\n\x1a\n",8),"无法读取 PNG 色板。");need(b.size()>=33&&be32(b,8)==13&&tag(b,12,"IHDR",4),"PNG 色板缺少 IHDR。");dimensions(be32(b,16),be32(b,20));
 unsigned depth=b[24],type=b[25];need((depth==8&&(type==2||type==6))||(type==3&&(depth==1||depth==2||depth==4||depth==8)),"PNG 色板必须能转换为 8 位 RGBA 像素。");need(b[26]==0&&b[27]==0&&b[28]<=1,"PNG 色板编码参数无效。");
 bool data=false,ended=false;size_t p=8;while(p<b.size()){need(b.size()-p>=12,"PNG 色板文件已截断。");auto n=be32(b,p);need(std::uint64_t(n)+12<=b.size()-p,"PNG 色板文件已截断。");auto crc=crc32(0L,Z_NULL,0);crc=crc32(crc,b.data()+p+4,uInt(n+4));need(std::uint32_t(crc)==be32(b,p+8+n),"PNG 色板 CRC 无效。");if(tag(b,p+4,"IDAT",4))data=true;if(tag(b,p+4,"IEND",4)){need(n==0,"PNG IEND 无效。");ended=true;break;}p+=size_t(n)+12;}need(data&&ended,"PNG 色板缺少图像数据。");
}
struct ComScope{HRESULT hr=CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);ComScope(){need(SUCCEEDED(hr)||hr==RPC_E_CHANGED_MODE,"无法初始化图片解码器。");}~ComScope(){if(SUCCEEDED(hr))CoUninitialize();}};
struct GifInfo{unsigned width=0,height=0,left=0,top=0,patchWidth=0,patchHeight=0;std::vector<Pixel> palette;int transparent=-1;};
GifInfo gifInfo(const Bytes& b){
 need(b.size()>=13&&(tag(b,0,"GIF87a",6)||tag(b,0,"GIF89a",6)),"GIF 色板头无效。");GifInfo out;out.width=le16(b,6);out.height=le16(b,8);dimensions(out.width,out.height);size_t p=13;
 auto table=[&](unsigned packed){size_t count=size_t(2)<<(packed&7);need(p<=b.size()&&count*3<=b.size()-p,"GIF 色表已截断。");std::vector<Pixel> result;for(size_t i=0;i<count;++i){result.push_back(Pixel(b[p])|(Pixel(b[p+1])<<8)|(Pixel(b[p+2])<<16)|0xff000000u);p+=3;}return result;};if(b[10]&128)out.palette=table(b[10]);
 auto subblocks=[&]{for(;;){need(p<b.size(),"GIF 扩展已截断。");auto n=b[p++];if(!n)break;need(n<=b.size()-p,"GIF 扩展已截断。");p+=n;}};
 while(p<b.size()){auto kind=b[p++];if(kind==0x21){need(p<b.size(),"GIF 扩展已截断。");auto label=b[p++];if(label==0xf9){need(b.size()-p>=6&&b[p]==4&&b[p+5]==0,"GIF 控制扩展无效。");out.transparent=(b[p+1]&1)?int(b[p+4]):-1;p+=6;}else subblocks();}else if(kind==0x2c){need(b.size()-p>=9,"GIF 首帧已截断。");out.left=le16(b,p);out.top=le16(b,p+2);out.patchWidth=le16(b,p+4);out.patchHeight=le16(b,p+6);need(out.patchWidth&&out.patchHeight,"GIF 首帧尺寸无效。");auto packed=b[p+8];p+=9;if(packed&128)out.palette=table(packed);need(!out.palette.empty(),"GIF 缺少色表。");return out;}else throw std::runtime_error("GIF 没有可读取的首帧。");}throw std::runtime_error("GIF 没有可读取的首帧。");
}
unsigned icoFrame(const Bytes& b){need(b.size()>=6&&le16(b,0)==0&&le16(b,2)==1,"ICO 色板头无效。");auto count=le16(b,4);need(count&&size_t(count)*16<=b.size()-6,"ICO 目录无效。");auto score=[&](unsigned i){size_t p=6+size_t(i)*16;unsigned w=b[p]?b[p]:256,h=b[p+1]?b[p+1]:256;return std::pair<unsigned,unsigned>{le16(b,p+6),w*h};};unsigned best=count-1;auto bestScore=score(best);for(unsigned i=0;i+1<count;++i)if(score(i)>bestScore){best=i;bestScore=score(i);}return best;}
std::vector<Pixel> webpPixels(const Bytes& b){auto data=SkData::MakeWithCopy(b.data(),b.size());SkCodec::Result status;auto codec=SkWebpDecoder::Decode(std::move(data),&status);need(bool(codec),"无法解码 WebP 色板。");auto size=codec->dimensions();dimensions(size.width(),size.height());std::vector<Pixel> pixels(size_t(size.width())*size.height(),0);auto info=SkImageInfo::Make(size.width(),size.height(),kRGBA_8888_SkColorType,kUnpremul_SkAlphaType,nullptr);SkCodec::Options options;options.fFrameIndex=0;options.fZeroInitialized=SkCodec::kYes_ZeroInitialized;need(codec->getPixels(info,pixels.data(),size_t(size.width())*4,&options)==SkCodec::kSuccess,"WebP 色板像素无效。");return pixels;}
std::vector<Pixel> wicPixels(const Bytes& bytes){
 ComScope com;Microsoft::WRL::ComPtr<IWICImagingFactory> factory;check(CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&factory)),"无法创建图片解码器。");
 Bytes backing=bytes;Microsoft::WRL::ComPtr<IWICStream> stream;check(factory->CreateStream(&stream),"无法创建图片内存流。");check(stream->InitializeFromMemory(backing.data(),DWORD(backing.size())),"无法读取图片内存流。");Microsoft::WRL::ComPtr<IWICBitmapDecoder> decoder;check(factory->CreateDecoderFromStream(stream.Get(),nullptr,WICDecodeMetadataCacheOnDemand,&decoder),"无法识别图片色板。");GUID container{};check(decoder->GetContainerFormat(&container),"无法识别图片格式。");bool gif=IsEqualGUID(container,GUID_ContainerFormatGif),ico=IsEqualGUID(container,GUID_ContainerFormatIco);need(gif||ico||IsEqualGUID(container,GUID_ContainerFormatPng)||IsEqualGUID(container,GUID_ContainerFormatJpeg)||IsEqualGUID(container,GUID_ContainerFormatBmp),"不支持的图片色板格式。");
 Microsoft::WRL::ComPtr<IWICBitmapFrameDecode> frame;check(decoder->GetFrame(ico?icoFrame(bytes):0,&frame),"无法读取图片色板首图。");UINT width=0,height=0;check(frame->GetSize(&width,&height),"无法读取图片尺寸。");
 if(gif){auto info=gifInfo(bytes);need(width==info.patchWidth&&height==info.patchHeight,"GIF 首帧尺寸不一致。");GUID format{};check(frame->GetPixelFormat(&format),"无法读取 GIF 索引格式。");need(IsEqualGUID(format,GUID_WICPixelFormat8bppIndexed),"GIF 首帧不是索引像素。");std::vector<Pixel> pixels(size_t(info.width)*info.height,0);std::vector<std::uint8_t> indices(width);for(unsigned y=0;y<height&&std::uint64_t(info.top)+y<info.height;++y){WICRect row{0,int(y),int(width),1};check(frame->CopyPixels(&row,width,width,indices.data()),"无法解码 GIF 索引像素。");for(unsigned x=0;x<width&&std::uint64_t(info.left)+x<info.width;++x){auto index=indices[x];need(index<info.palette.size(),"GIF 像素引用了不存在的颜色。");Pixel color=info.palette[index];if(int(index)==info.transparent)color&=0x00ffffffu;pixels[(size_t(info.top)+y)*info.width+info.left+x]=color;}}return pixels;}
 dimensions(width,height);Microsoft::WRL::ComPtr<IWICFormatConverter> converter;check(factory->CreateFormatConverter(&converter),"无法创建色板 RGBA 转换器。");check(converter->Initialize(frame.Get(),GUID_WICPixelFormat32bppRGBA,WICBitmapDitherTypeNone,nullptr,0,WICBitmapPaletteTypeCustom),"无法转换色板 RGBA 像素。");std::vector<Pixel> pixels(size_t(width)*height);check(converter->CopyPixels(nullptr,width*4,UINT(pixels.size()*4),reinterpret_cast<BYTE*>(pixels.data())),"无法解码图片色板像素。");return pixels;
}
}
std::vector<Pixel> decodeImagePaletteColors(const std::vector<std::uint8_t>& bytes,const std::filesystem::path& path){need(!bytes.empty(),"图片色板文件为空。");need(bytes.size()<=64u*1024u*1024u,"色板文件过大，最多支持 64 MiB。");auto extension=path.extension().u8string();for(auto& c:extension)if(c>='A'&&c<='Z')c+=32;if(extension==".png")strictPng(bytes);auto pixels=tag(bytes,0,"RIFF",4)&&tag(bytes,8,"WEBP",4)?webpPixels(bytes):wicPixels(bytes);std::unordered_set<Pixel> seen;std::vector<Pixel> colors;for(auto color:pixels)if(seen.insert(color).second){need(colors.size()<65536,"图片包含超过 65536 种颜色，无法作为色板导入。");colors.push_back(color);}return colors;}
}
