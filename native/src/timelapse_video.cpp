#include "timelapse_video.h"
#include <windows.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <mferror.h>
#include <wrl/client.h>
#include <atomic>
#include <limits>
#include <memory>
#include <thread>
#include "vpx/vpx_encoder.h"
#include "vpx/vp8cx.h"
#include "mkvmuxer/mkvmuxer.h"
#include "mkvmuxer/mkvwriter.h"
namespace moon::timelapse {
namespace {
using Microsoft::WRL::ComPtr;
void requireVideo(HRESULT hr,const char* action){if(FAILED(hr))throw std::runtime_error(std::string(action)+"; HRESULT="+std::to_string(hr));}
struct MediaRuntime {
 HRESULT apartment=CoInitializeEx(nullptr,COINIT_MULTITHREADED);bool started=false;
 MediaRuntime(){if(FAILED(apartment)&&apartment!=RPC_E_CHANGED_MODE)requireVideo(apartment,"Cannot initialize video thread");const auto hr=MFStartup(MF_VERSION,MFSTARTUP_LITE);if(FAILED(hr)){if(SUCCEEDED(apartment))CoUninitialize();requireVideo(hr,"Cannot initialize Windows video encoder");}started=true;}
 ~MediaRuntime(){if(started)MFShutdown();if(SUCCEEDED(apartment))CoUninitialize();}
};
struct VideoTemporary {
 std::filesystem::path path;
 explicit VideoTemporary(const std::filesystem::path& destination,const wchar_t* extension=L".mp4"){
  static std::atomic<unsigned long long> serial{0};
  const auto directory=destination.parent_path().empty()?std::filesystem::path(L"."):destination.parent_path();
  path=directory/(L".moonsprite-video-"+std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64())+L"-"+std::to_wstring(++serial)+extension);
  const auto handle=CreateFileW(path.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);
  if(handle==INVALID_HANDLE_VALUE)throw std::runtime_error("Cannot create temporary video; Win32="+std::to_string(GetLastError()));CloseHandle(handle);
 }
 ~VideoTemporary(){if(!path.empty())DeleteFileW(path.c_str());}
 void publish(const std::filesystem::path& destination){
  const auto handle=CreateFileW(path.c_str(),GENERIC_WRITE,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);
  if(handle==INVALID_HANDLE_VALUE)throw std::runtime_error("Cannot flush exported video");const auto flushed=FlushFileBuffers(handle);CloseHandle(handle);if(!flushed)throw std::runtime_error("Cannot flush exported video");
  if(!MoveFileExW(path.c_str(),destination.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("Cannot publish exported video; Win32="+std::to_string(GetLastError()));path.clear();
 }
};
std::vector<BYTE> nv12(const Image& image){
 const int w=image.width,h=image.height;std::vector<BYTE> bytes(std::size_t(w)*h*3/2);
 auto clamp=[](int v){return BYTE(std::clamp(v,0,255));};
 for(int y=0;y<h;++y)for(int x=0;x<w;++x){const auto p=image.pixels[std::size_t(y)*w+x];const int r=p&255,g=(p>>8)&255,b=(p>>16)&255;bytes[std::size_t(y)*w+x]=clamp(((66*r+129*g+25*b+128)>>8)+16);}
 for(int y=0;y<h;y+=2)for(int x=0;x<w;x+=2){int r=0,g=0,b=0;for(int j=0;j<2;++j)for(int i=0;i<2;++i){const auto p=image.pixels[std::size_t(y+j)*w+x+i];r+=p&255;g+=(p>>8)&255;b+=(p>>16)&255;}r=(r+2)/4;g=(g+2)/4;b=(b+2)/4;const auto at=std::size_t(w)*h+std::size_t(y/2)*w+x;bytes[at]=clamp(((-38*r-74*g+112*b+128)>>8)+128);bytes[at+1]=clamp(((112*r-94*g-18*b+128)>>8)+128);}
 return bytes;
}
void geometryAttributes(IMFMediaType* type,int width,int height,int fps){
 requireVideo(type->SetGUID(MF_MT_MAJOR_TYPE,MFMediaType_Video),"Cannot set video type");requireVideo(type->SetUINT32(MF_MT_INTERLACE_MODE,MFVideoInterlace_Progressive),"Cannot set video scan");requireVideo(MFSetAttributeSize(type,MF_MT_FRAME_SIZE,width,height),"Cannot set video size");requireVideo(MFSetAttributeRatio(type,MF_MT_FRAME_RATE,fps,1),"Cannot set video rate");requireVideo(MFSetAttributeRatio(type,MF_MT_PIXEL_ASPECT_RATIO,1,1),"Cannot set video aspect");requireVideo(type->SetUINT32(MF_MT_YUV_MATRIX,MFVideoTransferMatrix_BT601),"Cannot set video matrix");requireVideo(type->SetUINT32(MF_MT_VIDEO_NOMINAL_RANGE,MFNominalRange_16_235),"Cannot set video range");
}
}
VideoGeometry videoGeometry(const std::vector<Frame>& frames,Quality quality){
 int width=1,height=1;for(const auto& f:frames){if(f.width<1||f.height<1||f.width>2400||f.height>2400)throw std::invalid_argument("Invalid video recording dimensions");if(std::max(f.width,f.height)>std::max(width,height)){width=f.width;height=f.height;}}
 const int scale=std::max(1,maximumDimension(quality)/std::max(width,height));const int drawWidth=width*scale,drawHeight=height*scale;return {drawWidth+(drawWidth&1),drawHeight+(drawHeight&1),drawWidth,drawHeight,scale};
}
VideoGeometry videoGeometry(const Settings& settings){return videoGeometry(settings.snapshots,settings.quality);}
std::size_t videoFrameCount(std::size_t snapshots,int fps,int speed,const VideoOptions& options){
 if(!snapshots)return 0;if(options.durationMode&&!std::isfinite(options.durationSeconds))throw std::invalid_argument("Invalid video duration");fps=std::clamp(fps,1,60);const double seconds=options.durationMode?std::clamp(options.durationSeconds,.1,3600.):snapshots/double(fps)/std::clamp(speed,1,64);return std::max<std::size_t>(1,std::size_t(std::floor(seconds*fps+.5)));
}
std::size_t videoFrameCount(const Settings& settings,const VideoOptions& options){return videoFrameCount(settings.snapshots.size(),settings.fps,settings.speed,options);}
Image renderVideoFrame(const Image& source,const VideoGeometry& geometry){
 if(source.width<1||source.height<1||source.pixels.size()!=std::size_t(source.width)*source.height||geometry.width<2||geometry.height<2||geometry.width>2400||geometry.height>2400||geometry.drawWidth<1||geometry.drawHeight<1||geometry.drawWidth>geometry.width||geometry.drawHeight>geometry.height)throw std::invalid_argument("Invalid video frame geometry");
 Image out{geometry.width,geometry.height,std::vector<Pixel>(std::size_t(geometry.width)*geometry.height,0xff000000)};
 const double scale=std::min(double(geometry.drawWidth)/source.width,double(geometry.drawHeight)/source.height);const int w=std::max(1,int(std::floor(source.width*scale+.5))),h=std::max(1,int(std::floor(source.height*scale+.5))),left=(out.width-w)/2,top=(out.height-h)/2;
 for(int y=0;y<h;++y)for(int x=0;x<w;++x){const auto p=source.pixels[std::size_t(std::uint64_t(2*y+1)*source.height/(2*h))*source.width+std::uint64_t(2*x+1)*source.width/(2*w)];const unsigned a=p>>24;auto channel=[&](unsigned shift){return (((p>>shift)&255)*a+127)/255;};out.pixels[std::size_t(y+top)*out.width+x+left]=0xff000000|channel(0)|(channel(8)<<8)|(channel(16)<<16);}
 return out;
}
bool writeRecordingMp4(const Settings& settings,const Reader& reader,const std::filesystem::path& destination,const VideoOptions& options,const std::function<bool()>& cancelled,const std::function<void(std::size_t,std::size_t)>& progress){
 if(settings.snapshots.empty())throw std::invalid_argument("No recording frames");if(options.durationMode&&!std::isfinite(options.durationSeconds))throw std::invalid_argument("Invalid video duration");if(cancelled&&cancelled())return false;
 const auto geometry=videoGeometry(settings);const auto plan=videoPlan(settings,options.durationMode?std::optional<double>(options.durationSeconds):std::nullopt);const int fps=std::clamp(settings.fps,1,60);
 MediaRuntime runtime;VideoTemporary temporary(destination);ComPtr<IMFSinkWriter> writer;ComPtr<IMFAttributes> attributes;requireVideo(MFCreateAttributes(&attributes,2),"Cannot configure video encoder");requireVideo(attributes->SetGUID(MF_TRANSCODE_CONTAINERTYPE,MFTranscodeContainerType_MPEG4),"Cannot select MP4 container");requireVideo(attributes->SetUINT32(MF_SINK_WRITER_DISABLE_THROTTLING,TRUE),"Cannot configure offline video encoding");requireVideo(MFCreateSinkWriterFromURL(temporary.path.c_str(),nullptr,attributes.Get(),&writer),"Cannot create MP4 encoder");
 ComPtr<IMFMediaType> output;requireVideo(MFCreateMediaType(&output),"Cannot create output type");geometryAttributes(output.Get(),geometry.width,geometry.height,fps);requireVideo(output->SetGUID(MF_MT_SUBTYPE,MFVideoFormat_H264),"Cannot select H.264");requireVideo(output->SetUINT32(MF_MT_AVG_BITRATE,settings.quality==Quality::High?8000000:settings.quality==Quality::Low?1500000:4000000),"Cannot set video quality");DWORD stream=0;requireVideo(writer->AddStream(output.Get(),&stream),"MP4/H.264 is not supported by this Windows installation");
 ComPtr<IMFMediaType> input;requireVideo(MFCreateMediaType(&input),"Cannot create input type");geometryAttributes(input.Get(),geometry.width,geometry.height,fps);requireVideo(input->SetGUID(MF_MT_SUBTYPE,MFVideoFormat_NV12),"Cannot select video input");requireVideo(writer->SetInputMediaType(stream,input.Get(),nullptr),"Cannot configure H.264 input");requireVideo(writer->BeginWriting(),"Cannot begin video encoding");
 std::size_t cached=std::numeric_limits<std::size_t>::max();std::vector<BYTE> pixels;
 for(std::size_t i=0;i<plan.size();++i){
  if(cancelled&&cancelled())return false;
  const auto index=plan[i].snapshotIndex;if(index!=cached){const auto& frame=settings.snapshots[index];auto image=decodeRecordingPng(reader(frame));if(image.width!=frame.width||image.height!=frame.height)throw std::runtime_error("Recording dimensions mismatch");pixels=nv12(renderVideoFrame(image,geometry));cached=index;}
  if(cancelled&&cancelled())return false;
  ComPtr<IMFMediaBuffer> buffer;requireVideo(MFCreateMemoryBuffer(DWORD(pixels.size()),&buffer),"Cannot allocate video sample");BYTE* target=nullptr;requireVideo(buffer->Lock(&target,nullptr,nullptr),"Cannot access video sample");std::copy(pixels.begin(),pixels.end(),target);requireVideo(buffer->Unlock(),"Cannot release video sample");requireVideo(buffer->SetCurrentLength(DWORD(pixels.size())),"Cannot set video sample size");ComPtr<IMFSample> sample;requireVideo(MFCreateSample(&sample),"Cannot create video sample");requireVideo(sample->AddBuffer(buffer.Get()),"Cannot attach video sample");const auto begin=LONGLONG(i)*10000000/fps,end=LONGLONG(i+1)*10000000/fps;requireVideo(sample->SetSampleTime(begin),"Cannot set video timestamp");requireVideo(sample->SetSampleDuration(end-begin),"Cannot set video duration");requireVideo(writer->WriteSample(stream,sample.Get()),"Cannot encode video frame");if(progress)progress(i+1,plan.size());
 }
 if(cancelled&&cancelled())return false;requireVideo(writer->Finalize(),"Cannot finalize MP4");writer.Reset();if(cancelled&&cancelled())return false;temporary.publish(destination);return true;
}
bool writeRecordingWebm(const Settings& settings,const Reader& reader,const std::filesystem::path& destination,const VideoOptions& options,const std::function<bool()>& cancelled,const std::function<void(std::size_t,std::size_t)>& progress){
 if(settings.snapshots.empty())throw std::invalid_argument("No recording frames");if(options.durationMode&&!std::isfinite(options.durationSeconds))throw std::invalid_argument("Invalid video duration");if(cancelled&&cancelled())return false;
 const auto geometry=videoGeometry(settings);const auto plan=videoPlan(settings,options.durationMode?std::optional<double>(options.durationSeconds):std::nullopt);const int fps=std::clamp(settings.fps,1,60);
 struct Codec {vpx_codec_ctx_t context{};bool initialized=false;~Codec(){if(initialized)vpx_codec_destroy(&context);}} codec;
 vpx_codec_enc_cfg_t config{};bool vp9=true;
 auto initialize=[&](vpx_codec_iface_t* iface){
  if(vpx_codec_enc_config_default(iface,&config,0)!=VPX_CODEC_OK)return false;
  config.g_w=geometry.width;config.g_h=geometry.height;config.g_timebase={1,fps};config.g_threads=std::clamp(std::thread::hardware_concurrency(),1u,4u);config.g_lag_in_frames=0;
  config.rc_target_bitrate=settings.quality==Quality::High?8000:settings.quality==Quality::Low?1500:4000;config.rc_end_usage=VPX_VBR;config.rc_dropframe_thresh=0;config.kf_max_dist=fps*5;
  codec.initialized=vpx_codec_enc_init(&codec.context,iface,&config,0)==VPX_CODEC_OK;return codec.initialized;
 };
 // Legacy resolves VP9 before VP8. Failure after encoding starts is an error,
 // not an excuse to replace an already partially written video silently.
 if(!initialize(vpx_codec_vp9_cx())){vp9=false;if(!initialize(vpx_codec_vp8_cx()))throw std::runtime_error("Cannot initialize WebM VP9/VP8 encoder");}
 auto requireVpx=[&](vpx_codec_err_t result,const char* action){if(result!=VPX_CODEC_OK)throw std::runtime_error(std::string(action)+": "+vpx_codec_error(&codec.context));};
 requireVpx(vpx_codec_control(&codec.context,VP8E_SET_CPUUSED,vp9?6:8),"Cannot set WebM encoding speed");
 if(vp9)requireVpx(vpx_codec_control(&codec.context,VP9E_SET_ROW_MT,1),"Cannot set WebM encoding threads");
 struct Picture {vpx_image_t image{};bool allocated=false;~Picture(){if(allocated)vpx_img_free(&image);}} picture;
 if(!vpx_img_alloc(&picture.image,VPX_IMG_FMT_I420,geometry.width,geometry.height,32))throw std::runtime_error("Cannot allocate WebM image");picture.allocated=true;picture.image.cs=VPX_CS_BT_601;picture.image.range=VPX_CR_STUDIO_RANGE;
 VideoTemporary temporary(destination,L".webm");
 {
  FILE* opened=nullptr;if(_wfopen_s(&opened,temporary.path.c_str(),L"w+b")||!opened)throw std::runtime_error("Cannot open temporary WebM stream");std::unique_ptr<FILE,decltype(&fclose)> file(opened,&fclose);
  mkvmuxer::MkvWriter writer(file.get());mkvmuxer::Segment segment;if(!segment.Init(&writer))throw std::runtime_error("Cannot create WebM container");segment.set_mode(mkvmuxer::Segment::kFile);segment.OutputCues(true);
  auto* info=segment.GetSegmentInfo();info->set_timecode_scale(1000000);info->set_writing_app("MoonSprite");segment.set_duration(plan.size()*1000./fps);
  const auto trackId=segment.AddVideoTrack(geometry.width,geometry.height,1);auto* track=static_cast<mkvmuxer::VideoTrack*>(segment.GetTrackByNumber(trackId));if(!track)throw std::runtime_error("Cannot create WebM track");track->set_codec_id(vp9?"V_VP9":"V_VP8");track->set_frame_rate(fps);track->set_default_duration(1000000000ULL/fps);
  auto packets=[&]{std::size_t count=0;vpx_codec_iter_t iterator=nullptr;while(const auto* packet=vpx_codec_get_cx_data(&codec.context,&iterator)){if(packet->kind!=VPX_CODEC_CX_FRAME_PKT)continue;if(!segment.AddFrame(static_cast<const std::uint8_t*>(packet->data.frame.buf),packet->data.frame.sz,trackId,std::uint64_t(packet->data.frame.pts)*1000000000ULL/fps,(packet->data.frame.flags&VPX_FRAME_IS_KEY)!=0))throw std::runtime_error("Cannot write WebM frame");++count;}return count;};
  std::size_t cached=std::numeric_limits<std::size_t>::max();
  for(std::size_t i=0;i<plan.size();++i){
   if(cancelled&&cancelled())return false;
   const auto index=plan[i].snapshotIndex;if(index!=cached){const auto& frame=settings.snapshots[index];auto source=decodeRecordingPng(reader(frame));if(source.width!=frame.width||source.height!=frame.height)throw std::runtime_error("Recording dimensions mismatch");const auto pixels=nv12(renderVideoFrame(source,geometry));
    for(int y=0;y<geometry.height;++y)std::copy_n(pixels.data()+std::size_t(y)*geometry.width,geometry.width,picture.image.planes[0]+y*picture.image.stride[0]);
    for(int y=0;y<geometry.height/2;++y)for(int x=0;x<geometry.width/2;++x){const auto at=std::size_t(geometry.width)*geometry.height+std::size_t(y)*geometry.width+2*x;picture.image.planes[1][y*picture.image.stride[1]+x]=pixels[at];picture.image.planes[2][y*picture.image.stride[2]+x]=pixels[at+1];}cached=index;
   }
   if(cancelled&&cancelled())return false;requireVpx(vpx_codec_encode(&codec.context,&picture.image,vpx_codec_pts_t(i),1,0,VPX_DL_REALTIME),"Cannot encode WebM frame");packets();if(progress)progress(i+1,plan.size());
  }
  if(cancelled&&cancelled())return false;
  // Drain the codec even with zero lookahead; delayed packets belong to the
  // same export and must reach the container before it is finalized.
  do{requireVpx(vpx_codec_encode(&codec.context,nullptr,-1,1,0,VPX_DL_REALTIME),"Cannot finish WebM encoding");if(cancelled&&cancelled())return false;}while(packets());
  if(!segment.Finalize()||fflush(file.get())||ferror(file.get()))throw std::runtime_error("Cannot finalize WebM");
 }
 if(cancelled&&cancelled())return false;temporary.publish(destination);return true;
}
}
