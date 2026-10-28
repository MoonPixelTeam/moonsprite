#include "recent_project_preview.h"
#include "project_preview.h"
#include "project_manifest.h"
#include "project_import.h"
#include "aseprite_io.h"
#include "document.h"
#include "image_export.h"
#include <windows.h>
#include <wincodec.h>
#include <wrl/client.h>
#include <roapi.h>
#ifdef GetObject
#undef GetObject
#endif
#include <winrt/Windows.Data.Json.h>
#include "include/codec/SkWebpDecoder.h"
#include "include/core/SkData.h"
#include "include/core/SkImageInfo.h"
#include <algorithm>
#include <cctype>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <mutex>
#include <sstream>
namespace moon::recent { namespace {
using project::Bytes;
void need(bool value,const char* message){if(!value)throw std::runtime_error(message);}
void checked(HRESULT status){need(SUCCEEDED(status),"Cannot read project thumbnail");}
struct Apartment {HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);Apartment(){need(SUCCEEDED(status)||status==RPC_E_CHANGED_MODE,"Cannot initialize preview decoder");}~Apartment(){if(SUCCEEDED(status))RoUninitialize();}};
Bytes readBytes(const std::filesystem::path& file,std::size_t limit){std::ifstream in(file,std::ios::binary|std::ios::ate);need(bool(in),"Cannot read preview source");auto size=in.tellg();need(size>0&&std::uint64_t(size)<=limit,"Preview source exceeds read budget");Bytes bytes(std::size_t(size),0);in.seekg(0);need(bool(in.read(reinterpret_cast<char*>(bytes.data()),std::streamsize(bytes.size()))),"Incomplete preview source");return bytes;}
void checkSize(std::uint64_t width,std::uint64_t height){need(width&&height&&width<=16777216&&height<=16777216&&width*height<=16777216,"Preview raster exceeds native decode budget");}
void sample(Preview& out,int width,int height,const std::vector<std::uint32_t>& pixels){checkSize(width,height);need(pixels.size()==std::size_t(width)*height,"Incomplete preview raster");const auto scale=std::min(1.0,512.0/std::max(width,height));out.previewWidth=std::max(1,int(std::lround(width*scale)));out.previewHeight=std::max(1,int(std::lround(height*scale)));out.pixels.resize(std::size_t(out.previewWidth)*out.previewHeight);for(int y=0;y<out.previewHeight;++y)for(int x=0;x<out.previewWidth;++x){int sx=std::min(width-1,int(std::floor((x+.5)*width/out.previewWidth))),sy=std::min(height-1,int(std::floor((y+.5)*height/out.previewHeight)));out.pixels[std::size_t(y)*out.previewWidth+x]=pixels[std::size_t(sy)*width+sx];}}
void decode(Preview& out,const Bytes& bytes,bool webp=false){
 std::vector<std::uint32_t> pixels;int width=0,height=0;
 if(webp){auto data=SkData::MakeWithCopy(bytes.data(),bytes.size());SkCodec::Result status;auto codec=SkWebpDecoder::Decode(std::move(data),&status);need(bool(codec),"Cannot read WebP thumbnail");width=codec->dimensions().width();height=codec->dimensions().height();checkSize(width,height);pixels.resize(std::size_t(width)*height);auto info=SkImageInfo::Make(width,height,kRGBA_8888_SkColorType,kUnpremul_SkAlphaType,nullptr);SkCodec::Options options;options.fFrameIndex=0;options.fZeroInitialized=SkCodec::kYes_ZeroInitialized;need(codec->getPixels(info,pixels.data(),width*4,&options)==SkCodec::kSuccess,"Invalid WebP thumbnail pixels");
 }else{
  Microsoft::WRL::ComPtr<IWICImagingFactory> factory;checked(CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&factory)));Microsoft::WRL::ComPtr<IWICStream> stream;checked(factory->CreateStream(&stream));need(bytes.size()<=0xffffffffull,"Preview source exceeds WIC stream budget");checked(stream->InitializeFromMemory(const_cast<BYTE*>(bytes.data()),DWORD(bytes.size())));Microsoft::WRL::ComPtr<IWICBitmapDecoder> decoder;checked(factory->CreateDecoderFromStream(stream.Get(),nullptr,WICDecodeMetadataCacheOnDemand,&decoder));GUID format{};checked(decoder->GetContainerFormat(&format));const bool gif=IsEqualGUID(format,GUID_ContainerFormatGif);need(gif||IsEqualGUID(format,GUID_ContainerFormatPng)||IsEqualGUID(format,GUID_ContainerFormatJpeg)||IsEqualGUID(format,GUID_ContainerFormatBmp),"Unsupported thumbnail container");Microsoft::WRL::ComPtr<IWICBitmapFrameDecode> frame;checked(decoder->GetFrame(0,&frame));UINT w=0,h=0;checked(frame->GetSize(&w,&h));checkSize(w,h);width=int(w);height=int(h);
  auto number=[](IWICMetadataQueryReader* reader,const wchar_t* key,UINT fallback){PROPVARIANT value{};UINT result=fallback;if(reader&&SUCCEEDED(reader->GetMetadataByName(key,&value))){if(value.vt==VT_UI1)result=value.bVal;else if(value.vt==VT_UI2)result=value.uiVal;else if(value.vt==VT_UI4)result=value.ulVal;}PropVariantClear(&value);return result;};
  UINT left=0,top=0;if(gif){Microsoft::WRL::ComPtr<IWICMetadataQueryReader> logical,patch;decoder->GetMetadataQueryReader(&logical);frame->GetMetadataQueryReader(&patch);width=int(number(logical.Get(),L"/logscrdesc/Width",w));height=int(number(logical.Get(),L"/logscrdesc/Height",h));left=number(patch.Get(),L"/imgdesc/Left",0);top=number(patch.Get(),L"/imgdesc/Top",0);checkSize(width,height);need(left<=UINT(width)&&top<=UINT(height)&&w<=UINT(width)-left&&h<=UINT(height)-top,"Invalid GIF preview patch");}
  Microsoft::WRL::ComPtr<IWICFormatConverter> converter;checked(factory->CreateFormatConverter(&converter));checked(converter->Initialize(frame.Get(),GUID_WICPixelFormat32bppRGBA,WICBitmapDitherTypeNone,nullptr,0,WICBitmapPaletteTypeCustom));std::vector<std::uint32_t> patch(std::size_t(w)*h);checked(converter->CopyPixels(nullptr,w*4,UINT(patch.size()*4),reinterpret_cast<BYTE*>(patch.data())));if(width==int(w)&&height==int(h)&&!left&&!top)pixels=std::move(patch);else{pixels.resize(std::size_t(width)*height);for(UINT y=0;y<h;++y)std::copy_n(patch.begin()+std::size_t(y)*w,w,pixels.begin()+std::size_t(y+top)*width+left);}
 }
 if(!out.width){out.width=width;out.height=height;}sample(out,width,height,pixels);
}
void encode(Preview& out){out.png=encodeRgbaImagePng(out.previewWidth,out.previewHeight,out.pixels).png;}
std::mutex& fallbackMutex(){static std::mutex mutex;return mutex;}
std::mutex& diskMutex(){static std::mutex mutex;return mutex;}
std::string cacheName(const std::string& path){std::uint64_t value=14695981039346656037ull;for(unsigned char c:path){value^=c;value*=1099511628211ull;}std::ostringstream out;out<<std::hex<<value;return out.str();}
}
Preview readPreview(const Project& record,const std::filesystem::path& cacheDirectory,const std::function<bool()>& canceled){
 auto checkCanceled=[&]{if(canceled())throw std::runtime_error("Project preview canceled");};checkCanceled();Apartment apartment;const auto file=std::filesystem::u8path(record.path);const auto sourceSize=std::filesystem::file_size(file);const auto sourceTime=std::filesystem::last_write_time(file).time_since_epoch().count();const auto base=cacheDirectory/cacheName(record.path);auto metadata=base;metadata+=".txt";auto pngFile=base;pngFile+=".png";
 Preview result;
 if(!cacheDirectory.empty())try{std::lock_guard<std::mutex> lock(diskMutex());std::ifstream in(metadata,std::ios::binary);std::string version,path,mode;std::uintmax_t size=0;long long time=0;int width=0,height=0;if(in>>version>>std::quoted(path)>>size>>time>>width>>height>>mode&&version=="moon-preview-v1"&&path==record.path&&size==sourceSize&&time==sourceTime&&width>0&&height>0&&(mode=="rgba"||mode=="indexed"||mode=="grayscale")){result.width=width;result.height=height;result.colorMode=mode;result.png=readBytes(pngFile,32u*1024u*1024u);decode(result,result.png);checkCanceled();return result;}}catch(...){result={};}
 auto extension=file.extension().u8string();std::transform(extension.begin(),extension.end(),extension.begin(),[](unsigned char c){return char(std::tolower(c));});const auto source=readBytes(file,project::Limits{}.archiveBytes);checkCanceled();
 if(extension==".moonsprite"){
  auto bytes=std::make_shared<const Bytes>(source);project::Archive archive(bytes);auto manifest=archive.read("manifest.json",project::Limits{}.manifestBytes);using namespace winrt::Windows::Data::Json;JsonObject root;need(JsonObject::TryParse(winrt::to_hstring(std::string(manifest.begin(),manifest.end())),root),"Cannot read project preview metadata");auto document=root.GetNamedObject(L"document");auto dimension=[&](const wchar_t* name){double value=document.GetNamedNumber(name);need(std::isfinite(value)&&value>=1&&std::floor(value)==value&&value<=2147483647,"Invalid project preview dimensions");return int(value);};result.width=dimension(L"width");result.height=dimension(L"height");result.colorMode=winrt::to_string(document.GetNamedString(L"colorMode"));need(result.colorMode=="rgba"||result.colorMode=="indexed"||result.colorMode=="grayscale","Invalid project preview color mode");
  if(archive.entries().count("preview.png")){result.png=archive.read("preview.png",32u*1024u*1024u);need(!result.png.empty(),"Project preview is empty");decode(result,result.png);}
  else{std::lock_guard<std::mutex> lock(fallbackMutex());checkCanceled();auto imported=project::prepareEditableImport(project::readProjectManifest(bytes));PaletteState palette;palette.entries.clear();palette.slots=imported.palette.slots;palette.columns=imported.palette.columns;palette.nextId=imported.palette.nextId;for(const auto& entry:imported.palette.entries)palette.entries.push_back({entry.id,entry.name,entry.color});auto document=Document::fromImported(imported.width,imported.height,std::move(imported.timeline),std::move(palette),std::move(imported.id),std::move(imported.name),imported.sourceArchive);document.selectLayer(imported.activeLayerId);document.selectFrame(imported.activeFrameId);result.png=project::encodeProjectPreview(document);decode(result,result.png);}
 }else{
  std::lock_guard<std::mutex> lock(fallbackMutex());checkCanceled();
  if(extension==".ase"||extension==".aseprite"){auto document=documentFromAseprite(decodeAseprite(source,file.stem().u32string()));result.width=document.width();result.height=document.height();result.png=project::encodeProjectPreview(document);decode(result,result.png);}
  else{decode(result,source,extension==".webp");encode(result);}
 }
 checkCanceled();need(std::filesystem::file_size(file)==sourceSize&&std::filesystem::last_write_time(file).time_since_epoch().count()==sourceTime,"Preview source changed during read");
 if(!cacheDirectory.empty())try{std::lock_guard<std::mutex> lock(diskMutex());checkCanceled();std::filesystem::create_directories(cacheDirectory);writeExportBytesAtomic(pngFile,result.png);std::ostringstream text;text<<"moon-preview-v1\n"<<std::quoted(record.path)<<' '<<sourceSize<<' '<<sourceTime<<' '<<result.width<<' '<<result.height<<' '<<result.colorMode<<'\n';const auto value=text.str();writeExportBytesAtomic(metadata,{value.begin(),value.end()});}catch(...){}
 return result;
}
}
