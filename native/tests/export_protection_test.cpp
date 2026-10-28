#include "export_protection.h"
#include "image_export.h"
#include "frame_png_export.h"
#include "gif_export.h"
#include <iostream>
#include <stdexcept>
using namespace moon;
void check(bool value,const char* text){if(!value)throw std::runtime_error(text);}
std::uint64_t hash(const std::vector<Pixel>& pixels){std::uint64_t value=14695981039346656037ull;for(auto pixel:pixels)for(int c=0;c<4;++c){value^=(pixel>>(c*8))&255;value*=1099511628211ull;}return value;}
int main(){try{
 struct Case{int width,height,scale;ExportProtection mode;std::uint64_t expected;};
 // Actual original legacy protectExportPixels execution, native/build/export-protection-legacy-oracle.json.
 const Case cases[]{
  {9,3,200,ExportProtection::Blur,0xcbf9dd391d6729bcull},
  {9,3,399,ExportProtection::Blur,0xcbf9dd391d6729bcull},
  {9,3,400,ExportProtection::Blur,0xc066e3b395025cdcull},
  {9,3,6400,ExportProtection::Blur,0xc066e3b395025cdcull},
  {9,3,400,ExportProtection::BlurNoise,0x7f43f710c9a3c816ull},
  {9,3,101,ExportProtection::BlurNoise,0x68d9f777c7334b44ull},
  {9,3,100,ExportProtection::BlurNoise,0xff1b7d2f22bc759cull},
  {9,3,50,ExportProtection::Blur,0xff1b7d2f22bc759cull},
  {9,3,400,ExportProtection::Off,0xff1b7d2f22bc759cull},
  {1,7,400,ExportProtection::BlurNoise,0x53cd1f6c4b7cf32aull},
  {8,4,400,ExportProtection::Blur,0x30c2ea458d34e7c5ull},
  {8,4,400,ExportProtection::BlurNoise,0x872c199dcc31d688ull},
 };
 for(const auto& item:cases){std::vector<Pixel> pixels(std::size_t(item.width)*item.height);const unsigned alpha[]{0,1,127,128,254,255};for(std::size_t i=0;i<pixels.size();++i)pixels[i]=(i*73%256)|((i*29%256)<<8)|((i*151%256)<<16)|(alpha[i%6]<<24);if(item.width==8&&item.height==4)for(std::size_t i=0;i<pixels.size();++i)pixels[i]=i%8<4?0xff0000ffu:0x80ff0000u;auto before=pixels.data();protectExportPixels(pixels,item.width,item.height,item.scale,item.mode);check(hash(pixels)==item.expected,"Original JS protection pixel oracle mismatch");if(item.mode==ExportProtection::Off||item.scale<=100)check(pixels.data()==before,"Bypass allocated output");}
 auto document=Document::fromImage(2,1,{0xff0000ff,0x80ff0000},U"protection");document.markSaved();const auto original=document.pixels();const auto history=document.historySize(),revision=document.revision();StaticImageExportOptions options;options.scalePercent=400;options.protection=ExportProtection::BlurNoise;const auto protectedPng=encodeStaticImagePng(document,options);check(hash(protectedPng.pixels)==0x872c199dcc31d688ull,"Static protection after scaling");check(encodeStaticImageBmp(document,options).bytes==encodeImageBmp(8,4,protectedPng.pixels),"BMP protected before encoder");check(encodeStaticImageSvg(document,options).bytes==encodeImageSvg(8,4,protectedPng.pixels),"SVG protected before existing encoder");check(encodeStaticImageIco(document,options).bytes==encodeImageIco(8,4,protectedPng.pixels).bytes,"ICO protected before encoder");options.automatic=true;check(encodeStaticImagePng(document,options).png==encodeImagePng(8,4,protectedPng.pixels,true).png,"PNG auto protects before indexing");
 FramePngExportOptions frames;frames.frames.scalePercent=400;frames.frames.protection=ExportProtection::BlurNoise;const auto frame=document.frame().id;check(encodeFramePng(document,frame,frames).pixels==protectedPng.pixels,"Frame protection after scaling");check(encodeFrameBmp(document,frame,frames).bytes==encodeImageBmp(8,4,protectedPng.pixels),"Frame BMP protection");check(encodeFrameSvg(document,frame,frames).bytes==encodeImageSvg(8,4,protectedPng.pixels),"Frame SVG protection");check(encodeFrameIco(document,frame,frames).bytes==encodeImageIco(8,4,protectedPng.pixels).bytes,"Frame ICO protection");
 GifExportOptions gif;gif.scalePercent=400;gif.protection=ExportProtection::BlurNoise;auto prepared=Document::fromImage(8,4,protectedPng.pixels,U"prepared");check(encodeAnimationGif(document,gif).bytes==encodeAnimationGif(prepared).bytes,"GIF protection before quantization");check(encodeAnimationGif(document,gif).bytes==encodeAnimationGif(document,gif).bytes,"GIF deterministic identical frame noise");
 auto wide=Document::fromImage(5,1,{0xff0000ff,0xff00ff00,0x80ff0000,0,0xff123456},U"wide");StaticImageExportOptions large;large.scalePercent=6400;auto raster=encodeStaticImagePng(wide,large);protectExportPixels(raster.pixels,raster.width,raster.height,6400,ExportProtection::Blur);large.protection=ExportProtection::Blur;const auto ico=encodeStaticImageIco(wide,large);check(ico.width==256&&ico.height==51&&ico.bytes==encodeImageIco(raster.width,raster.height,raster.pixels).bytes,"ICO protection precedes 256px fit");
 StaticImageExportOptions plain;plain.scalePercent=100;const auto plainBytes=encodeStaticImagePng(document,plain).png;plain.protection=ExportProtection::BlurNoise;check(encodeStaticImagePng(document,plain).png==plainBytes,"Original-size output changed");check(document.pixels()==original&&document.historySize()==history&&document.revision()==revision&&!document.dirty(),"Protection changed source/history");
 std::cout<<"Original JS protection oracle and admitted export pipeline checks passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
