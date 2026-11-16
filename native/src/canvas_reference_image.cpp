#include "canvas_reference_image.h"
#include "canvas_references.h"
#include "image_import_limits.h"
#include <fstream>
#include <windows.h>
#include <wincodec.h>
#include <wrl/client.h>
#include "include/codec/SkWebpDecoder.h"
#include "include/codec/SkPngDecoder.h"
#include "include/codec/SkJpegDecoder.h"
#include "include/core/SkData.h"
#include "include/codec/SkGifDecoder.h"
#include "include/codec/SkAndroidCodec.h"
#include "include/android/SkAnimatedImage.h"
#include "include/core/SkImage.h"
#include "include/core/SkCanvas.h"
#include "include/core/SkSurface.h"
#include "include/core/SkStream.h"
#include "include/ports/SkTypeface_win.h"
#include "modules/svg/include/SkSVGDOM.h"
#include "modules/svg/include/SkSVGSVG.h"
#include "modules/svg/include/SkSVGRenderContext.h"
#include "modules/skresources/include/SkResources.h"
#include <cwctype>
#include <mutex>
namespace moon {namespace {
void require(HRESULT hr){if(FAILED(hr))throw std::runtime_error("Cannot decode canvas reference (Windows "+std::to_string(hr)+")");}
struct Com {HRESULT hr=CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);Com(){if(hr!=RPC_E_CHANGED_MODE)require(hr);}~Com(){if(SUCCEEDED(hr))CoUninitialize();}};
constexpr char alphabet[]="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
}
class CanvasReferenceAnimation {
public:
 sk_sp<SkAnimatedImage> image;
 std::uint64_t due=0;
 bool finished=false;
};
namespace {
void readFrame(CanvasReferenceImage& out,SkImage& frame){
 const auto info=SkImageInfo::Make(out.width,out.height,kRGBA_8888_SkColorType,kUnpremul_SkAlphaType,nullptr);
 if(!frame.readPixels(nullptr,info,out.pixels.data(),out.width*4,0,0))throw std::runtime_error("Cannot read canvas reference frame");
}
std::uint64_t frameDelay(int n){return n<=10?100:std::uint64_t(n);}
CanvasReferenceImage decodeCodec(std::unique_ptr<SkCodec> codec){
 if(!codec)throw std::runtime_error("Invalid animated canvas reference");CanvasReferenceImage out;
 out.width=codec->dimensions().width();out.height=codec->dimensions().height();validateImportedImageDimensions(out.width,out.height);
 out.pixels.resize(std::size_t(out.width)*out.height);
 const bool animated=codec->getFrameCount()>1;
 auto image=SkAnimatedImage::Make(SkAndroidCodec::MakeFromCodec(std::move(codec)));
 if(!image||!image->getCurrentFrame())throw std::runtime_error("Invalid canvas reference frame");
 readFrame(out,*image->getCurrentFrame());
 if(animated){out.animation=std::make_shared<CanvasReferenceAnimation>();out.animation->due=frameDelay(image->currentFrameDuration());out.animation->image=std::move(image);}
 return out;
}
}
bool advanceCanvasReferenceImage(CanvasReferenceImage& out,std::uint64_t elapsed){
 const auto state=out.animation;if(!state||state->finished||elapsed<state->due)return false;
 bool changed=false;while(elapsed>=state->due){const int delay=state->image->decodeNextFrame();if(delay==SkAnimatedImage::kFinished){state->finished=true;out.animation.reset();break;}state->due+=frameDelay(delay);changed=true;}
 if(changed)readFrame(out,*state->image->getCurrentFrame());return changed;
}
std::string canvasReferenceDataUrl(const std::vector<std::uint8_t>& bytes,const std::string& mime){std::string result="data:"+mime+";base64,";result.reserve(result.size()+(bytes.size()+2)/3*4);for(std::size_t i=0;i<bytes.size();i+=3){const unsigned a=bytes[i],b=i+1<bytes.size()?bytes[i+1]:0,c=i+2<bytes.size()?bytes[i+2]:0;result+=alphabet[a>>2];result+=alphabet[((a&3)<<4)|(b>>4)];result+=i+1<bytes.size()?alphabet[((b&15)<<2)|(c>>6)]:'=';result+=i+2<bytes.size()?alphabet[c&63]:'=';}return result;}
std::string readCanvasReferenceSource(const std::filesystem::path& path){std::ifstream in(path,std::ios::binary|std::ios::ate);if(!in)throw std::runtime_error("Cannot read canvas reference");const auto n=in.tellg();if(n<=0||std::uint64_t(n)>128ull*1024*1024)throw std::length_error("Canvas reference exceeds native image read budget");std::vector<std::uint8_t> data(static_cast<std::size_t>(n));in.seekg(0);if(!in.read(reinterpret_cast<char*>(data.data()),n))throw std::runtime_error("Incomplete canvas reference file");auto ext=path.extension().wstring();for(auto& c:ext)c=std::towlower(c);const auto mime=ext==L".jpg"||ext==L".jpeg"?"image/jpeg":ext==L".gif"?"image/gif":ext==L".webp"?"image/webp":ext==L".bmp"?"image/bmp":ext==L".svg"?"image/svg+xml":"image/png";return canvasReferenceDataUrl(data,mime);}
CanvasReferenceImage decodeCanvasReferenceImage(const std::string& source){
 CanvasReference reference;reference.id="decode";reference.src=std::make_shared<const std::string>(source);validateCanvasReference(reference);const auto first=source.find(',')+1;if(source.size()-first>180ull*1024*1024)throw std::length_error("Canvas reference exceeds native image budget");
 std::vector<std::uint8_t> bytes;bytes.reserve((source.size()-first)*3/4);unsigned bits=0;int count=0;for(std::size_t i=first;i<source.size()&&source[i]!='=';++i){const auto at=std::find(alphabet,alphabet+64,source[i]);bits=(bits<<6)|unsigned(at-alphabet);count+=6;if(count>=8){count-=8;bytes.push_back(std::uint8_t(bits>>count));}}
 CanvasReferenceImage result;
 if(source.compare(0,19,"data:image/svg+xml;")==0){
  static std::once_flag registered;
  std::call_once(registered,[]{SkCodecs::Register(SkPngDecoder::Decoder());SkCodecs::Register(SkJpegDecoder::Decoder());SkCodecs::Register(SkGifDecoder::Decoder());SkCodecs::Register(SkWebpDecoder::Decoder());});
  SkMemoryStream stream(bytes.data(),bytes.size());auto fonts=SkFontMgr_New_DirectWrite();
  auto resources=skresources::DataURIResourceProviderProxy::Make(sk_make_sp<skresources::ResourceProvider>(),skresources::ImageDecodeStrategy::kPreDecode,fonts);
  auto dom=SkSVGDOM::Builder().setFontManager(fonts).setResourceProvider(resources).make(stream);
  if(!dom||!dom->getRoot())throw std::runtime_error("Invalid SVG canvas reference");
  const auto size=dom->getRoot()->intrinsicSize(SkSVGLengthContext(SkSize::Make(300,150),96));
  double width=size.width(),height=size.height();const auto& viewBox=dom->getRoot()->getViewBox();
  if(width<=0&&height<=0){width=300;height=150;if(viewBox.isValid()&&viewBox->height()>0){const double ratio=viewBox->width()/viewBox->height();if(ratio>=2)height=width/ratio;else width=height*ratio;}}
  else if(width<=0)width=viewBox.isValid()&&viewBox->height()>0?height*viewBox->width()/viewBox->height():300;
  else if(height<=0)height=viewBox.isValid()&&viewBox->width()>0?width*viewBox->height()/viewBox->width():150;
  validateImportedImageDimensions(std::uint64_t(std::ceil(width)),std::uint64_t(std::ceil(height)));result.width=int(std::ceil(width));result.height=int(std::ceil(height));dom->setContainerSize(SkSize::Make(float(width),float(height)));
  auto surface=SkSurfaces::Raster(SkImageInfo::MakeN32Premul(result.width,result.height));if(!surface)throw std::bad_alloc();surface->getCanvas()->clear(SK_ColorTRANSPARENT);dom->render(surface->getCanvas());
  result.pixels.resize(std::size_t(result.width)*result.height);readFrame(result,*surface->makeImageSnapshot());return result;
 }
 if(bytes.size()>=6&&std::string(reinterpret_cast<const char*>(bytes.data()),3)=="GIF"){SkCodec::Result status;return decodeCodec(SkGifDecoder::Decode(SkData::MakeWithCopy(bytes.data(),bytes.size()),&status));}
 if(bytes.size()>=12&&std::string(reinterpret_cast<const char*>(bytes.data()),4)=="RIFF"&&std::string(reinterpret_cast<const char*>(bytes.data()+8),4)=="WEBP"){SkCodec::Result status;return decodeCodec(SkWebpDecoder::Decode(SkData::MakeWithCopy(bytes.data(),bytes.size()),&status));}
 Com com;Microsoft::WRL::ComPtr<IWICImagingFactory> factory;require(CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&factory)));Microsoft::WRL::ComPtr<IWICStream> stream;require(factory->CreateStream(&stream));require(stream->InitializeFromMemory(bytes.data(),DWORD(bytes.size())));Microsoft::WRL::ComPtr<IWICBitmapDecoder> decoder;require(factory->CreateDecoderFromStream(stream.Get(),nullptr,WICDecodeMetadataCacheOnDemand,&decoder));Microsoft::WRL::ComPtr<IWICBitmapFrameDecode> frame;require(decoder->GetFrame(0,&frame));UINT w,h;require(frame->GetSize(&w,&h));validateImportedImageDimensions(w,h);result.width=int(w);result.height=int(h);Microsoft::WRL::ComPtr<IWICFormatConverter> converter;require(factory->CreateFormatConverter(&converter));require(converter->Initialize(frame.Get(),GUID_WICPixelFormat32bppRGBA,WICBitmapDitherTypeNone,nullptr,0,WICBitmapPaletteTypeCustom));result.pixels.resize(std::size_t(w)*h);require(converter->CopyPixels(nullptr,w*4,UINT(result.pixels.size()*4),reinterpret_cast<BYTE*>(result.pixels.data())));return result;
}
}
