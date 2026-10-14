#include "skin_assets.h"
#include <windows.h>
#include <wincodec.h>
#include <wrl/client.h>
#include <algorithm>
#include <array>
#include <fstream>
#include <stdexcept>

namespace moon {
namespace {
constexpr std::size_t maxBytes=8*1024*1024;
void require(bool ok,const char* message) { if(!ok) throw std::runtime_error(message); }
void check(HRESULT hr,const char* message) {require(SUCCEEDED(hr),message);}
struct ComScope {
  HRESULT hr=CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);
  ComScope() {require(SUCCEEDED(hr)||hr==RPC_E_CHANGED_MODE,"Cannot initialize image decoder");}
  ~ComScope() {if(SUCCEEDED(hr)) CoUninitialize();}
};
}
void validatePatch(const SkinPatch& p) {
  require(bool(p.bitmap),"Missing skin image"); const auto& b=*p.bitmap;
  require(b.width>0 && b.height>0 && b.width<=256 && b.height<=256,"PNG dimensions must be 1..256 pixels");
  require(b.pixels.size()==std::size_t(b.width)*b.height,"Invalid skin image pixels");
  require(p.left>=0 && p.right>=0 && p.top>=0 && p.bottom>=0 && p.left<=256 && p.right<=256 && p.top<=256 && p.bottom<=256 && p.left+p.right<b.width && p.top+p.bottom<b.height,"Borders must leave at least one center pixel");
}
SkinPatch importSkinPng(const std::filesystem::path& path,int maximumDimension) {
  require(maximumDimension>0 && maximumDimension<=2048,"Invalid PNG dimension limit");
  require(std::filesystem::file_size(path)<=maxBytes,"PNG file exceeds 8 MiB");
  ComScope com;
  Microsoft::WRL::ComPtr<IWICImagingFactory> factory;
  check(CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&factory)),"Cannot create PNG decoder");
  Microsoft::WRL::ComPtr<IWICBitmapDecoder> decoder;
  check(factory->CreateDecoderFromFilename(path.c_str(),nullptr,GENERIC_READ,WICDecodeMetadataCacheOnDemand,&decoder),"Cannot decode PNG");
  GUID format{}; check(decoder->GetContainerFormat(&format),"Cannot inspect image format");
  require(IsEqualGUID(format,GUID_ContainerFormatPng),"Please import a PNG file");
  UINT frames=0; check(decoder->GetFrameCount(&frames),"Cannot inspect PNG frames");
  require(frames==1,"Only single-frame PNG is supported");
  Microsoft::WRL::ComPtr<IWICBitmapFrameDecode> frame;
  check(decoder->GetFrame(0,&frame),"Cannot read PNG frame");
  UINT w=0,h=0; check(frame->GetSize(&w,&h),"Cannot read PNG dimensions");
  require(w>0 && h>0 && w<=UINT(maximumDimension) && h<=UINT(maximumDimension),"PNG exceeds allowed dimensions");
  Microsoft::WRL::ComPtr<IWICFormatConverter> converter;
  check(factory->CreateFormatConverter(&converter),"Cannot create RGBA converter");
  check(converter->Initialize(frame.Get(),GUID_WICPixelFormat32bppRGBA,WICBitmapDitherTypeNone,nullptr,0,WICBitmapPaletteTypeCustom),"Cannot convert PNG to RGBA");
  auto b=std::make_shared<SkinBitmap>(); b->width=int(w); b->height=int(h); b->pixels.resize(w*h);
  check(converter->CopyPixels(nullptr,w*4,w*h*4,reinterpret_cast<BYTE*>(b->pixels.data())),"Cannot read PNG pixels");
  SkinPatch patch{b}; if(w<3) patch.left=patch.right=0; if(h<3) patch.top=patch.bottom=0;
  return patch;
}
}
