#include "image_decode.h"
#include "image_file_signature.h"
#include "palette_extraction.h"
#include "gif_import.h"
#include <unordered_set>
#include <limits>
#include <windows.h>
#include <wincodec.h>
#include <wrl/client.h>
#include "include/codec/SkWebpDecoder.h"
#include "include/core/SkColorSpace.h"
#include "include/core/SkData.h"
#include <cwctype>
#include <fstream>
namespace moon {namespace {
void require(HRESULT hr){if(FAILED(hr))throw std::runtime_error("Cannot decode image (Windows "+std::to_string(hr)+")");}
struct Com {HRESULT hr=CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);Com(){if(hr!=RPC_E_CHANGED_MODE)require(hr);}~Com(){if(SUCCEEDED(hr))CoUninitialize();}};
}
Document openRasterImage(const std::filesystem::path& path){
 if(hasGifFileSignature(path))return openGifAnimation(path);
 auto ext=path.extension().wstring();std::transform(ext.begin(),ext.end(),ext.begin(),[](wchar_t c){return std::towlower(c);});std::vector<Pixel> pixels;int w=0,h=0;
 if(ext==L".webp"){std::ifstream input(path,std::ios::binary);if(!input)throw std::runtime_error("Cannot read WebP image");std::vector<char> bytes((std::istreambuf_iterator<char>(input)),{});auto data=SkData::MakeWithCopy(bytes.data(),bytes.size());SkCodec::Result status;auto codec=SkWebpDecoder::Decode(std::move(data),&status);if(!codec)throw std::runtime_error("Cannot decode WebP image");w=codec->dimensions().width();h=codec->dimensions().height();if(w<1||h<1||w>1024||h>1024)throw std::runtime_error("Native editable images support 1..1024 pixels");pixels.resize(std::size_t(w)*h);auto info=SkImageInfo::Make(w,h,kRGBA_8888_SkColorType,kUnpremul_SkAlphaType,SkColorSpace::MakeSRGB());SkCodec::Options options;options.fFrameIndex=0;options.fZeroInitialized=SkCodec::kYes_ZeroInitialized;if(codec->getPixels(info,pixels.data(),w*4,&options)!=SkCodec::kSuccess)throw std::runtime_error("Invalid WebP image pixels");for(auto& p:pixels)if(!(p>>24))p=0;
 }else{
  if(ext!=L".png"&&ext!=L".jpg"&&ext!=L".jpeg"&&ext!=L".bmp")throw std::runtime_error("Image document format not migrated; PNG/JPEG/BMP/WebP available");Com com;Microsoft::WRL::ComPtr<IWICImagingFactory> factory;require(CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&factory)));Microsoft::WRL::ComPtr<IWICBitmapDecoder> decoder;require(factory->CreateDecoderFromFilename(path.c_str(),nullptr,GENERIC_READ,WICDecodeMetadataCacheOnDemand,&decoder));GUID format;require(decoder->GetContainerFormat(&format));if(!IsEqualGUID(format,GUID_ContainerFormatPng)&&!IsEqualGUID(format,GUID_ContainerFormatJpeg)&&!IsEqualGUID(format,GUID_ContainerFormatBmp))throw std::runtime_error("Unsupported image document container");UINT count;require(decoder->GetFrameCount(&count));if(count!=1)throw std::runtime_error("Animated document import not migrated");Microsoft::WRL::ComPtr<IWICBitmapFrameDecode> frame;require(decoder->GetFrame(0,&frame));UINT width,height;require(frame->GetSize(&width,&height));if(width<1||height<1||width>1024||height>1024)throw std::runtime_error("Native editable images support 1..1024 pixels");w=width;h=height;Microsoft::WRL::ComPtr<IWICFormatConverter> converter;require(factory->CreateFormatConverter(&converter));require(converter->Initialize(frame.Get(),GUID_WICPixelFormat32bppRGBA,WICBitmapDitherTypeNone,nullptr,0,WICBitmapPaletteTypeCustom));pixels.resize(std::size_t(w)*h);require(converter->CopyPixels(nullptr,w*4,UINT(pixels.size()*4),(BYTE*)pixels.data()));
 }
 auto out=Document::fromImage(w,h,std::move(pixels),path.stem().u32string());out.setSourceFilePath(path);return out;
}
Document openGifAnimation(const std::filesystem::path& path){
 std::ifstream input(path,std::ios::binary|std::ios::ate);if(!input)throw std::runtime_error("Cannot read GIF image");const auto size=input.tellg();if(size<0||std::uint64_t(size)>gif_import::workingBudget)throw std::length_error("GIF exceeds the native read budget");
 std::vector<std::uint8_t> bytes(static_cast<std::size_t>(size));input.seekg(0);if(!input.read(reinterpret_cast<char*>(bytes.data()),std::streamsize(bytes.size())))throw std::runtime_error("Incomplete GIF file");
 const auto metadata=gif_import::metadata(bytes);gif_import::validateBudget(metadata);
 Com com;Microsoft::WRL::ComPtr<IWICImagingFactory> factory;require(CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&factory)));
 Microsoft::WRL::ComPtr<IWICStream> stream;require(factory->CreateStream(&stream));require(stream->InitializeFromMemory(bytes.data(),DWORD(bytes.size())));
 Microsoft::WRL::ComPtr<IWICBitmapDecoder> decoder;require(factory->CreateDecoderFromStream(stream.Get(),nullptr,WICDecodeMetadataCacheOnDemand,&decoder));GUID format;require(decoder->GetContainerFormat(&format));if(!IsEqualGUID(format,GUID_ContainerFormatGif))throw std::runtime_error("Not a GIF image");
 UINT count=0;require(decoder->GetFrameCount(&count));if(count!=metadata.frames.size())throw std::runtime_error("GIF frame metadata mismatch");
 gif_import::Composite composite(metadata.width,metadata.height);std::vector<std::vector<Pixel>> surfaces;surfaces.reserve(count);
 for(UINT i=0;i<count;++i){
  Microsoft::WRL::ComPtr<IWICBitmapFrameDecode> frame;require(decoder->GetFrame(i,&frame));UINT width=0,height=0;require(frame->GetSize(&width,&height));const auto& descriptor=metadata.frames[i];if(width!=descriptor.width||height!=descriptor.height)throw std::runtime_error("GIF patch dimensions mismatch");
  Microsoft::WRL::ComPtr<IWICFormatConverter> converter;require(factory->CreateFormatConverter(&converter));require(converter->Initialize(frame.Get(),GUID_WICPixelFormat32bppRGBA,WICBitmapDitherTypeNone,nullptr,0,WICBitmapPaletteTypeCustom));
  std::vector<Pixel> patch(std::size_t(width)*height);require(converter->CopyPixels(nullptr,width*sizeof(Pixel),UINT(patch.size()*sizeof(Pixel)),reinterpret_cast<BYTE*>(patch.data())));surfaces.push_back(composite.append(descriptor,patch));
 }
 std::unordered_set<Pixel> unique;for(const auto& pixels:surfaces){for(const auto pixel:pixels){if(pixel>>24)unique.insert(pixel);if(unique.size()>4096)break;}if(unique.size()>4096)break;}
 const auto colors=extractImportedPalette(surfaces,256,unique.size()<=4096?std::numeric_limits<std::size_t>::max():262144);Document seed(1,1);auto palette=seed.palette();palette.entries.clear();palette.slots.clear();int colorId=1;for(auto pixel:colors){const auto number=std::to_string(colorId);palette.entries.push_back({colorId,U"颜色 "+std::u32string(number.begin(),number.end()),pixel});palette.slots.push_back(colorId++);}palette.slots.resize((palette.slots.size()+7)/8*8);palette.nextId=colorId;
 timeline::State state;state.layers=seed.timeline().state().layers;for(std::size_t i=0;i<surfaces.size();++i){const auto frameId="frame-"+std::to_string(i+1);state.frames.push_back({frameId,metadata.frames[i].duration});DocumentCel cel;cel.id="gif-cel-"+std::to_string(i+1);cel.layerId=state.layers.front().id;cel.frameId=frameId;cel.surface=timeline::Surface{metadata.width,metadata.height,0,0,{},{},timeline::LinkedPixelStorage(std::move(surfaces[i]))};state.cels.push_back(std::move(cel));}
 GUID guid{};require(CoCreateGuid(&guid));wchar_t text[40]{};if(!StringFromGUID2(guid,text,40))throw std::runtime_error("Cannot create GIF project identity");
 // A source GIF is not a MoonSprite ZIP archive. The new editable document must
 // use the normal new-project encoder when saved to the native project format.
 auto out=Document::fromImported(metadata.width,metadata.height,std::move(state),std::move(palette),"gif-native-"+std::filesystem::path(text).u8string(),path.filename().u32string(),std::make_shared<const std::vector<std::uint8_t>>());out.clearSourceArchiveForNewSnapshot();out.setImportedLoop(metadata.loop);out.setSourceFilePath(path);out.markSaved();return out;
}

}
