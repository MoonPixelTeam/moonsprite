#include "recent_project_preview.h"
#include "image_file_signature.h"
#include "project_preview.h"
#include "project_manifest.h"
#include "project_import.h"
#include "aseprite_io.h"
#include "psd_import.h"
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
#include "include/codec/SkPngDecoder.h"
#include "include/codec/SkGifDecoder.h"
#include "include/codec/SkJpegDecoder.h"
#include "include/codec/SkBmpDecoder.h"
#include "include/core/SkCanvas.h"
#include "include/core/SkImage.h"
#include "include/core/SkSurface.h"
#include "include/core/SkData.h"
#include "include/core/SkImageInfo.h"
#include <algorithm>
#include <cctype>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <mutex>
#include <sstream>
#include <zlib.h>
namespace moon::recent { namespace {
using project::Bytes;
void need(bool value,const char* message){if(!value)throw std::runtime_error(message);}
void checked(HRESULT status){need(SUCCEEDED(status),"Cannot read project thumbnail");}
struct Apartment {HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);Apartment(){need(SUCCEEDED(status)||status==RPC_E_CHANGED_MODE,"Cannot initialize preview decoder");}~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}};
Bytes readBytes(const std::filesystem::path& file,std::size_t limit){std::ifstream in(file,std::ios::binary|std::ios::ate);need(bool(in),"Cannot read preview source");auto size=in.tellg();need(size>0&&std::uint64_t(size)<=limit,"Preview source exceeds read budget");Bytes bytes(std::size_t(size),0);in.seekg(0);need(bool(in.read(reinterpret_cast<char*>(bytes.data()),std::streamsize(bytes.size()))),"Incomplete preview source");return bytes;}
void checkSize(std::uint64_t width,std::uint64_t height){need(width&&height&&width<=16777216&&height<=16777216&&width*height<=16777216,"Preview raster exceeds native decode budget");}
Bytes browserPng(const Bytes& input){
 // Chromium consumes complete IDAT CRCs and at least the next 8-byte header;
 // it does not require the terminal IEND CRC/body to decode the first image.
 auto be=[&](std::size_t at){need(at<=input.size()&&input.size()-at>=4,"Truncated PNG header");return (std::uint32_t(input[at])<<24)|(std::uint32_t(input[at+1])<<16)|(std::uint32_t(input[at+2])<<8)|input[at+3];};
 Bytes out(input.begin(),input.begin()+8);bool data=false;std::size_t pos=8;
 while(pos<input.size()){
  need(input.size()-pos>=8,"Truncated PNG chunk header");const auto count=be(pos);
  const std::string type(input.begin()+pos+4,input.begin()+pos+8);
  if(data&&type!="IDAT")break;
  need(std::uint64_t(count)+12<=input.size()-pos,"Truncated PNG chunk");
  const auto crc=std::uint32_t(crc32(0,input.data()+pos+4,count+4));need(crc==be(pos+8+count),"Invalid PNG chunk CRC");
  out.insert(out.end(),input.begin()+pos,input.begin()+pos+count+12);if(type=="IDAT")data=true;pos+=count+12;
 }
 need(data&&input.size()-pos>=8,"Incomplete PNG image");const std::uint8_t end[]{0,0,0,0,73,69,78,68,174,66,96,130};out.insert(out.end(),std::begin(end),std::end(end));return out;
}
void decode(Preview& out,const Bytes& source,bool=false){
 const bool png=SkPngDecoder::IsPng(source.data(),source.size());const Bytes normalized=png?browserPng(source):Bytes{};const Bytes& bytes=png?normalized:source;
 auto data=SkData::MakeWithoutCopy(bytes.data(),bytes.size());SkCodec::Result status;
 std::unique_ptr<SkCodec> codec;
 if(SkPngDecoder::IsPng(bytes.data(),bytes.size()))codec=SkPngDecoder::Decode(data,&status);
 else if(SkGifDecoder::IsGif(bytes.data(),bytes.size()))codec=SkGifDecoder::Decode(data,&status);
 else if(SkJpegDecoder::IsJpeg(bytes.data(),bytes.size()))codec=SkJpegDecoder::Decode(data,&status);
 else if(SkBmpDecoder::IsBmp(bytes.data(),bytes.size()))codec=SkBmpDecoder::Decode(data,&status);
 else if(SkWebpDecoder::IsWebp(bytes.data(),bytes.size()))codec=SkWebpDecoder::Decode(data,&status);
 need(bool(codec),"Cannot decode thumbnail image");const int width=codec->dimensions().width(),height=codec->dimensions().height();checkSize(width,height);
 // Browser canvas draws into an 8-bit premultiplied sRGB surface, then PNG
 // serialization unpremultiplies. Preserve that observable quantization.
 std::vector<std::uint32_t> pixels(std::size_t(width)*height);
 auto info=SkImageInfo::Make(width,height,kRGBA_8888_SkColorType,kUnpremul_SkAlphaType,nullptr);
 SkCodec::Options options;options.fFrameIndex=0;options.fZeroInitialized=SkCodec::kYes_ZeroInitialized;
 status=codec->getPixels(info,pixels.data(),width*4,&options);
 need(status==SkCodec::kSuccess||status==SkCodec::kIncompleteInput,"Invalid thumbnail pixels");
 if(png&&bytes.size()>25&&bytes[24]!=16){
  Microsoft::WRL::ComPtr<IWICImagingFactory> factory;checked(CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&factory)));Microsoft::WRL::ComPtr<IWICStream> stream;checked(factory->CreateStream(&stream));checked(stream->InitializeFromMemory(const_cast<BYTE*>(bytes.data()),DWORD(bytes.size())));Microsoft::WRL::ComPtr<IWICBitmapDecoder> decoder;checked(factory->CreateDecoderFromStream(stream.Get(),nullptr,WICDecodeMetadataCacheOnDemand,&decoder));Microsoft::WRL::ComPtr<IWICBitmapFrameDecode> frame;checked(decoder->GetFrame(0,&frame));Microsoft::WRL::ComPtr<IWICFormatConverter> converter;checked(factory->CreateFormatConverter(&converter));checked(converter->Initialize(frame.Get(),GUID_WICPixelFormat32bppRGBA,WICBitmapDitherTypeNone,nullptr,0,WICBitmapPaletteTypeCustom));checked(converter->CopyPixels(nullptr,width*4,UINT(pixels.size()*4),reinterpret_cast<BYTE*>(pixels.data())));
 }
 // Canvas premultiplies once; use integer nearest rounding for browser parity.
 for(auto& p:pixels){const unsigned alpha=p>>24;unsigned value=alpha<<24;for(int c=0;c<3;++c)value|=((((p>>(c*8))&255)*alpha+127)/255)<<(c*8);p=value;}
 const auto scale=std::min(1.0,512.0/std::max(width,height));out.previewWidth=std::max(1,int(std::lround(width*scale)));out.previewHeight=std::max(1,int(std::lround(height*scale)));
 auto image=SkImages::RasterFromPixmapCopy(SkPixmap(SkImageInfo::Make(width,height,kRGBA_8888_SkColorType,kPremul_SkAlphaType,nullptr),pixels.data(),width*4));
 auto canvas=SkSurfaces::Raster(SkImageInfo::Make(out.previewWidth,out.previewHeight,kRGBA_8888_SkColorType,kPremul_SkAlphaType,nullptr));need(bool(image)&&bool(canvas),"Cannot allocate preview canvas");
 // Resolve exact nearest-neighbor ties toward the preceding source pixel,
 // matching software DOMCanvas at 1072x160 ->512x76 (oracle case120).
 canvas->getCanvas()->scale(std::nextafter(float(double(out.previewWidth)/width),1.0f),std::nextafter(float(double(out.previewHeight)/height),1.0f));canvas->getCanvas()->drawImage(image,0,0,SkSamplingOptions(),nullptr);
 out.pixels.resize(std::size_t(out.previewWidth)*out.previewHeight);need(canvas->readPixels(SkImageInfo::Make(out.previewWidth,out.previewHeight,kRGBA_8888_SkColorType,kUnpremul_SkAlphaType,nullptr),out.pixels.data(),out.previewWidth*4,0,0),"Cannot sample preview");
 if(!out.width){out.width=width;out.height=height;}
}
void encode(Preview& out){out.png=encodeRgbaImagePng(out.previewWidth,out.previewHeight,out.pixels).png;}
std::mutex& fallbackMutex(){static std::mutex mutex;return mutex;}
std::mutex& diskMutex(){static std::mutex mutex;return mutex;}
std::string cacheName(const std::string& path){std::uint64_t value=14695981039346656037ull;for(unsigned char c:path){value^=c;value*=1099511628211ull;}std::ostringstream out;out<<std::hex<<value;return out.str();}
}
Preview readPreview(const Project& record,const std::filesystem::path& cacheDirectory,const std::function<bool()>& canceled){
 auto checkCanceled=[&]{if(canceled())throw std::runtime_error("Project preview canceled");};checkCanceled();Apartment apartment;const auto file=std::filesystem::u8path(record.path);const auto sourceSize=std::filesystem::file_size(file);const auto sourceTime=std::filesystem::last_write_time(file).time_since_epoch().count();const auto base=cacheDirectory/cacheName(record.path);auto metadata=base;metadata+=".txt";auto pngFile=base;pngFile+=".png";
 Preview result;
 if(!cacheDirectory.empty())try{std::lock_guard<std::mutex> lock(diskMutex());std::ifstream in(metadata,std::ios::binary);std::string version,path,mode;std::uintmax_t size=0;long long time=0;int width=0,height=0;if(in>>version>>std::quoted(path)>>size>>time>>width>>height>>mode&&version=="moon-preview-v2"&&path==record.path&&size==sourceSize&&time==sourceTime&&width>0&&height>0&&(mode=="rgba"||mode=="indexed"||mode=="grayscale")){result.width=width;result.height=height;result.colorMode=mode;result.png=readBytes(pngFile,32u*1024u*1024u);decode(result,result.png);checkCanceled();return result;}}catch(...){result={};}
 auto extension=file.extension().u8string();std::transform(extension.begin(),extension.end(),extension.begin(),[](unsigned char c){return char(std::tolower(c));});const auto source=readBytes(file,project::Limits{}.archiveBytes);checkCanceled();
 if(hasGifSignature(source.data(),source.size())){decode(result,source);encode(result);}
 else if(extension==".moonsprite"){
  auto bytes=std::make_shared<const Bytes>(source);project::Archive archive(bytes);auto manifest=archive.read("manifest.json",project::Limits{}.manifestBytes);using namespace winrt::Windows::Data::Json;JsonObject root;need(JsonObject::TryParse(winrt::to_hstring(std::string(manifest.begin(),manifest.end())),root),"Cannot read project preview metadata");auto document=root.GetNamedObject(L"document");auto dimension=[&](const wchar_t* name){double value=document.GetNamedNumber(name);need(std::isfinite(value)&&value>=1&&std::floor(value)==value&&value<=2147483647,"Invalid project preview dimensions");return int(value);};result.width=dimension(L"width");result.height=dimension(L"height");result.colorMode=winrt::to_string(document.GetNamedString(L"colorMode"));need(result.colorMode=="rgba"||result.colorMode=="indexed"||result.colorMode=="grayscale","Invalid project preview color mode");
  if(archive.entries().count("preview.png")){result.png=archive.read("preview.png",32u*1024u*1024u);need(!result.png.empty(),"Project preview is empty");decode(result,result.png);}
  else{std::lock_guard<std::mutex> lock(fallbackMutex());checkCanceled();auto imported=project::prepareEditableImport(project::readProjectManifest(bytes));auto document=project::createEditableDocument(std::move(imported));result.png=project::encodeProjectPreview(document);decode(result,result.png);}
 }else{
  std::lock_guard<std::mutex> lock(fallbackMutex());checkCanceled();
  if(extension==".ase"||extension==".aseprite"||extension==".psd"){auto document=extension==".psd"?decodePsd(source,file.stem().u32string()):documentFromAseprite(decodeAseprite(source,file.stem().u32string()));result.width=document.width();result.height=document.height();result.png=project::encodeProjectPreview(document);decode(result,result.png);}
  else{decode(result,source,extension==".webp"&&!hasGifSignature(source.data(),source.size()));encode(result);}
 }
 checkCanceled();need(std::filesystem::file_size(file)==sourceSize&&std::filesystem::last_write_time(file).time_since_epoch().count()==sourceTime,"Preview source changed during read");
 if(!cacheDirectory.empty())try{std::lock_guard<std::mutex> lock(diskMutex());checkCanceled();std::filesystem::create_directories(cacheDirectory);writeExportBytesAtomic(pngFile,result.png);std::ostringstream text;text<<"moon-preview-v2\n"<<std::quoted(record.path)<<' '<<sourceSize<<' '<<sourceTime<<' '<<result.width<<' '<<result.height<<' '<<result.colorMode<<'\n';const auto value=text.str();writeExportBytesAtomic(metadata,{value.begin(),value.end()});}catch(...){}
 return result;
}
}
