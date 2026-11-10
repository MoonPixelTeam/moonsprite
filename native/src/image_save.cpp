#include "image_save.h"
#include "aseprite_save_policy.h"
#include "aseprite_io.h"
#include "psd_export.h"
#include "image_export.h"
#include "image_export_prepare.h"
#include "gif_export.h"
#include "include/core/SkColorSpace.h"
#include "include/core/SkImageInfo.h"
#include "include/core/SkPixmap.h"
#include "include/core/SkStream.h"
#include "include/encode/SkWebpEncoder.h"
#include <set>
namespace moon {
SaveImageFormat saveImageFormat(const std::filesystem::path& path){
 auto ext=path.extension().wstring();for(auto& c:ext)c=std::towlower(c);
 if(ext==L".png")return SaveImageFormat::Png;
 if(ext==L".jpg"||ext==L".jpeg")return SaveImageFormat::Jpeg;
 if(ext==L".webp")return SaveImageFormat::Webp;
 if(ext==L".svg")return SaveImageFormat::Svg;
 if(ext==L".ico")return SaveImageFormat::Ico;
 if(ext==L".bmp")return SaveImageFormat::Bmp;
 if(ext==L".gif")return SaveImageFormat::Gif;
 if(ext==L".psd")return SaveImageFormat::Psd;
 if(ext==L".ase")return SaveImageFormat::Ase;
 if(ext==L".aseprite")return SaveImageFormat::Aseprite;
 return SaveImageFormat::Native;
}
SaveImageFormat preferredSaveImageFormat(int i){
 static constexpr SaveImageFormat formats[]={SaveImageFormat::Native,SaveImageFormat::Png,SaveImageFormat::Jpeg,SaveImageFormat::Webp,SaveImageFormat::Svg,SaveImageFormat::Ico,SaveImageFormat::Psd,SaveImageFormat::Ase,SaveImageFormat::Aseprite};
 return i>=0&&i<9?formats[i]:SaveImageFormat::Native;
}
const wchar_t* saveImageExtension(SaveImageFormat f){switch(f){
 case SaveImageFormat::Png:return L".png";case SaveImageFormat::Jpeg:return L".jpg";
 case SaveImageFormat::Webp:return L".webp";case SaveImageFormat::Svg:return L".svg";
 case SaveImageFormat::Ico:return L".ico";case SaveImageFormat::Bmp:return L".bmp";
 case SaveImageFormat::Gif:return L".gif";case SaveImageFormat::Psd:return L".psd";
 case SaveImageFormat::Ase:return L".ase";case SaveImageFormat::Aseprite:return L".aseprite";
 default:return L".moonsprite";}}
std::u32string saveImageLabel(SaveImageFormat f){switch(f){case SaveImageFormat::Jpeg:return U"JPEG";case SaveImageFormat::Webp:return U"WEBP";case SaveImageFormat::Aseprite:return U"ASEPRITE";default:{std::wstring ext=saveImageExtension(f);std::u32string label(ext.begin()+1,ext.end());for(auto& c:label)if(c>=U'a'&&c<=U'z')c-=32;return label;}}}
std::filesystem::path normalizedImageSavePath(std::filesystem::path path,SaveImageFormat f){
 if(saveImageFormat(path)==f&&f!=SaveImageFormat::Native)return path;
 if((f==SaveImageFormat::Ase||f==SaveImageFormat::Aseprite)&&isAsepriteSavePath(path))return path;
 auto ext=path.extension().wstring();for(auto& c:ext)c=std::towlower(c);
 if(ext==L".moonsprite"||saveImageFormat(path)!=SaveImageFormat::Native)path.replace_extension(saveImageExtension(f));
 else path+=saveImageExtension(f);return path;
}
std::vector<std::string> imageSaveIssues(const Document& d,SaveImageFormat format){
 if(format==SaveImageFormat::Native)return {};
 if(format==SaveImageFormat::Ase||format==SaveImageFormat::Aseprite)return asepriteSaveIssues(d);
 if(format==SaveImageFormat::Psd)return psdSaveIssues(d);
 const auto& s=d.timeline().state();std::vector<std::string> issues;
 auto add=[&](const char* key){if(std::find(issues.begin(),issues.end(),key)==issues.end())issues.emplace_back(key);};
 if(s.layers.size()>1||!s.groups.empty())add("layers");
 if(format!=SaveImageFormat::Gif&&s.frames.size()>1)add("frames");
 if(!s.loopSections.empty())add("loops");
 if(std::any_of(s.frames.begin(),s.frames.end(),[](const auto& f){return f.disabled;}))add("frameFlags");
 if(std::any_of(s.layers.begin(),s.layers.end(),[](const auto& l){return !l.kind.empty();})||std::any_of(s.cels.begin(),s.cels.end(),[](const auto& c){return c.text.has_value()||c.tilemap.has_value()||c.freeTiles.has_value();}))add("editable");
 if(!s.masks.empty()||std::any_of(s.layers.begin(),s.layers.end(),[](const auto& l){return l.clippingMask||timeline::styleVisible(l.layerStyles);})||std::any_of(s.groups.begin(),s.groups.end(),[](const auto& g){return g.clippingMask||g.cumulativeBlend||timeline::styleVisible(g.layerStyles);}))add("effects");
 if(!d.projectBrushes().empty()||!s.tilesets.empty()||!d.slices().empty())add("resources");
 if(!d.timelapseSettings().snapshots.empty())add("timelapse");
 if(format!=SaveImageFormat::Jpeg&&format!=SaveImageFormat::Gif)return issues;
 std::set<Pixel> colors;
 for(const auto& cel:s.cels){
  if(!cel.surface)continue;const auto& surface=*cel.surface;
  if(format==SaveImageFormat::Jpeg&&(surface.offsetX>0||surface.offsetY>0||std::int64_t(surface.offsetX)+surface.width<d.width()||std::int64_t(surface.offsetY)+surface.height<d.height()))add("transparency");
  for(auto pixel:surface.pixels){const auto alpha=pixel>>24;
   if(format==SaveImageFormat::Jpeg&&alpha<255){add("transparency");return issues;}
   if(format==SaveImageFormat::Gif){if(alpha>0&&alpha<255){add("gifColors");return issues;}if(alpha)colors.insert(pixel&0xffffff);if(colors.size()>255){add("gifColors");return issues;}}
  }
 }
 if(std::any_of(s.layers.begin(),s.layers.end(),[](const auto& l){return l.opacity<1;})||std::any_of(s.cels.begin(),s.cels.end(),[](const auto& c){return c.opacity.value_or(1)<1;}))add(format==SaveImageFormat::Gif?"gifColors":"transparency");
 return issues;
}
std::vector<std::uint8_t> encodeSaveImage(const Document& d,SaveImageFormat format,int scalePercent){
 StaticImageExportOptions options;options.automatic=true;options.scalePercent=scalePercent;
 switch(format){
 case SaveImageFormat::Png:return encodeStaticImagePng(d,options).png;
 case SaveImageFormat::Jpeg:return encodeStaticImageJpeg(d,options).bytes;
 case SaveImageFormat::Svg:return encodeStaticImageSvg(d,options).bytes;
 case SaveImageFormat::Ico:return encodeStaticImageIco(d,options).bytes;
 case SaveImageFormat::Bmp:return encodeStaticImageBmp(d,options).bytes;
 case SaveImageFormat::Gif:{GifExportOptions gif;gif.scalePercent=scalePercent;gif.frameStart=1;gif.frameEnd=int(d.timeline().state().frames.size());return encodeAnimationGif(d,gif).bytes;}
 case SaveImageFormat::Psd:return encodePsd(d,scalePercent);
 case SaveImageFormat::Ase:case SaveImageFormat::Aseprite:return encodeAseprite(d,scalePercent);
 case SaveImageFormat::Webp:{
  // legacy png.ts encodes a single current-frame image at quality .92.
  auto image=prepareStaticImage(d,options);
  if(image.width>16383||image.height>16383)throw std::runtime_error("WebP supports dimensions up to 16383 pixels");
  auto info=SkImageInfo::Make(image.width,image.height,kRGBA_8888_SkColorType,kUnpremul_SkAlphaType,SkColorSpace::MakeSRGB());
  SkPixmap pixels(info,image.pixels.data(),std::size_t(image.width)*4);SkDynamicMemoryWStream stream;SkWebpEncoder::Options codec;codec.fCompression=SkWebpEncoder::Compression::kLossy;codec.fQuality=92;
  if(!SkWebpEncoder::Encode(&stream,pixels,codec))throw std::runtime_error("WebP encoding failed");
  std::vector<std::uint8_t> bytes(stream.bytesWritten());stream.copyTo(bytes.data());return bytes;
 }
 default:throw std::invalid_argument("Not an image save format");
 }
}
}
