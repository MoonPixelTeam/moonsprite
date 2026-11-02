#include "timelapse_video.h"
#include <windows.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <wrl/client.h>
#include <chrono>
#include <fstream>
#include <iostream>
#include <map>
#define CHECK(value) do{if(!(value))throw std::runtime_error("Check failed: " #value);}while(0)
using namespace moon;
using namespace moon::timelapse;
using Microsoft::WRL::ComPtr;
namespace {
void require(HRESULT hr){if(FAILED(hr))throw std::runtime_error("Video decode HRESULT="+std::to_string(hr));}
Bytes read(const std::filesystem::path& path){std::ifstream file(path,std::ios::binary);return Bytes((std::istreambuf_iterator<char>(file)),{});}
struct Decoded {UINT32 width=0,height=0;std::vector<LONGLONG> times;std::vector<std::pair<Pixel,Pixel>> colors;};
Decoded decode(const std::filesystem::path& path){
 ComPtr<IMFAttributes> attributes;require(MFCreateAttributes(&attributes,1));require(attributes->SetUINT32(MF_SOURCE_READER_ENABLE_VIDEO_PROCESSING,TRUE));ComPtr<IMFSourceReader> reader;require(MFCreateSourceReaderFromURL(path.c_str(),attributes.Get(),&reader));ComPtr<IMFMediaType> wanted;require(MFCreateMediaType(&wanted));require(wanted->SetGUID(MF_MT_MAJOR_TYPE,MFMediaType_Video));require(wanted->SetGUID(MF_MT_SUBTYPE,MFVideoFormat_RGB32));require(reader->SetCurrentMediaType(MF_SOURCE_READER_FIRST_VIDEO_STREAM,nullptr,wanted.Get()));ComPtr<IMFMediaType> type;require(reader->GetCurrentMediaType(MF_SOURCE_READER_FIRST_VIDEO_STREAM,&type));Decoded out;require(MFGetAttributeSize(type.Get(),MF_MT_FRAME_SIZE,&out.width,&out.height));
 for(;;){DWORD flags=0;LONGLONG time=0;ComPtr<IMFSample> sample;require(reader->ReadSample(MF_SOURCE_READER_FIRST_VIDEO_STREAM,0,nullptr,&flags,&time,&sample));if(sample){ComPtr<IMFMediaBuffer> buffer;require(sample->ConvertToContiguousBuffer(&buffer));ComPtr<IMF2DBuffer> twoD;BYTE* pixels=nullptr;LONG stride=0;const bool has2D=SUCCEEDED(buffer.As(&twoD));if(has2D)require(twoD->Lock2D(&pixels,&stride));else{require(buffer->Lock(&pixels,nullptr,nullptr));UINT32 raw=0;if(SUCCEEDED(type->GetUINT32(MF_MT_DEFAULT_STRIDE,&raw)))stride=LONG(raw);else require(MFGetStrideForBitmapInfoHeader(MFVideoFormat_RGB32.Data1,out.width,&stride));if(stride<0)pixels+=std::size_t(-stride)*(out.height-1);}
   auto color=[&](int y){const auto p=pixels+std::ptrdiff_t(y)*stride+4*(out.width/2);return Pixel(p[2])|Pixel(p[1])<<8|Pixel(p[0])<<16|0xff000000;};out.colors.push_back({color(out.height/4),color(out.height*3/4)});out.times.push_back(time);if(has2D)require(twoD->Unlock2D());else require(buffer->Unlock());}
  if(flags&MF_SOURCE_READERF_ENDOFSTREAM)break;
 }
 return out;
}
int channel(Pixel p,int shift){return int((p>>shift)&255);}
}
int main(){try{
 require(CoInitializeEx(nullptr,COINIT_MULTITHREADED));require(MFStartup(MF_VERSION));struct Runtime{~Runtime(){MFShutdown();CoUninitialize();}} runtime;
 const auto root=std::filesystem::current_path()/("timelapse-video-test-owned-"+std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));std::filesystem::create_directories(root);
 Settings geometry;Frame wide;wide.width=5;wide.height=1;Frame square;square.width=square.height=4;geometry.snapshots={wide,square};geometry.quality=Quality::Low;auto g=videoGeometry(geometry);CHECK(g.width==640&&g.height==128&&g.scale==128);wide.width=wide.height=501;geometry.snapshots={wide};g=videoGeometry(geometry);CHECK(g.width==502&&g.height==502&&g.drawWidth==501&&g.drawHeight==501);
 auto rendered=renderVideoFrame({1,1,{0x800000ff}},{4,4,3,3,3});CHECK(rendered.pixels[0]==0xff000080&&rendered.pixels[3]==0xff000000&&rendered.pixels[15]==0xff000000);
 // Legacy fit-and-center keeps the first source with the largest long side.
 rendered=renderVideoFrame({1,2,{0xff0000ff,0xff00ff00}},{6,2,6,2,1});CHECK(rendered.pixels[2]==0xff0000ff&&rendered.pixels[8]==0xff00ff00&&rendered.pixels[0]==0xff000000);
 Settings planSettings;planSettings.fps=12;planSettings.speed=1;planSettings.snapshots.resize(100);const auto oneSecond=videoPlan(planSettings,1),twoSeconds=videoPlan(planSettings,2);CHECK(oneSecond.size()==12&&twoSeconds.size()==24&&oneSecond.front().snapshotIndex==0&&oneSecond.back().snapshotIndex==99);CHECK(videoFrameCount(planSettings,{true,1.5})==18&&videoFrameCount(planSettings,{false,1})==100);planSettings.speed=64;CHECK(videoPlan(planSettings).size()==2&&videoPlan(planSettings).back().snapshotIndex==99);
 Settings settings;settings.quality=Quality::Low;settings.fps=6;settings.speed=1;std::map<std::string,Bytes> pngs;
 for(int n=0;n<3;++n){std::vector<Pixel> pixels(64*48);for(int y=0;y<48;++y)for(int x=0;x<64;++x)pixels[y*64+x]=n==0?(y<24?0xff0000ff:0xff00ff00):n==2?(y<24?0xffff0000:0xff00ffff):0xff808080;Frame frame;frame.id="video-"+std::to_string(n);frame.width=64;frame.height=48;settings.snapshots.push_back(frame);pngs[frame.id]=encodeRgbaImagePng(64,48,std::move(pixels)).png;}
 int reads=0;Reader reader=[&](const Frame& frame){++reads;return pngs.at(frame.id);};const auto path=root/L"实际缩时.mp4";std::size_t completed=0,total=0;CHECK(writeRecordingMp4(settings,reader,path,{true,1},{},[&](auto n,auto count){completed=n;total=count;}));CHECK(completed==6&&total==6&&reads==3);const auto bytes=read(path);CHECK(bytes.size()>24&&std::string(bytes.begin()+4,bytes.begin()+8)=="ftyp");
 const auto decoded=decode(path);CHECK(decoded.width==640&&decoded.height==480&&decoded.times.size()==6&&decoded.times.front()==0);CHECK(decoded.times.back()>8000000&&decoded.times.back()<8500000);const auto first=decoded.colors.front(),last=decoded.colors.back();CHECK(channel(first.first,0)>200&&channel(first.first,8)<40&&channel(first.second,8)>200);CHECK(channel(last.first,16)>200&&channel(last.first,0)<40&&channel(last.second,0)>200&&channel(last.second,8)>200);
 // Every output path remains intact until the final atomic publication.
 const auto protectedPath=root/L"保留原文件.mp4";const Bytes sentinel={'o','r','i','g','i','n','a','l'};writeExportBytesAtomic(protectedPath,sentinel);CHECK(!writeRecordingMp4(settings,reader,protectedPath,{true,1},[]{return true;}));CHECK(read(protectedPath)==sentinel);
 bool cancel=false;CHECK(!writeRecordingMp4(settings,reader,protectedPath,{true,1},[&]{return cancel;},[&](auto,auto){cancel=true;}));CHECK(read(protectedPath)==sentinel);
 bool failed=false;try{writeRecordingMp4(settings,[&](const Frame& f){if(f.id=="video-1")throw std::runtime_error("owned missing frame");return pngs.at(f.id);},protectedPath,{true,1});}catch(const std::exception&){failed=true;}CHECK(failed&&read(protectedPath)==sentinel);
 failed=false;try{writeRecordingMp4(settings,reader,root/"missing"/"bad.mp4");}catch(const std::exception&){failed=true;}CHECK(failed&&!std::filesystem::exists(root/"missing"));
 CHECK(writeRecordingMp4(settings,reader,protectedPath,{false,1}));const auto bySpeed=decode(protectedPath);CHECK(bySpeed.times.size()==3&&read(protectedPath)!=sentinel);
 for(const auto& file:std::filesystem::directory_iterator(root))CHECK(file.path().filename().wstring().find(L".moonsprite-video-")!=0);
 std::cout<<"Timelapse MP4 geometry, decoded colors/timestamps, sampling cache, cancellation, failure and atomic replacement passed; fixture retained: "<<root.u8string()<<'\n';return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
