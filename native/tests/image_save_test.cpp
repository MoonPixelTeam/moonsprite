#include "image_save.h"
#include "image_export.h"
#include "image_decode.h"
#include "gif_import.h"
#include "aseprite_save_policy.h"
#include <iostream>
#include <windows.h>
using namespace moon;
void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
bool has(const std::vector<std::string>& issues,const char* key){return std::find(issues.begin(),issues.end(),key)!=issues.end();}
int main(){try{
 const auto root=std::filesystem::path("image-save-test-owned")/(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(root);
 for(auto extension:{L".png",L".jpg",L".jpeg",L".webp",L".bmp",L".gif",L".svg",L".ico"}){
  const auto path=root/(std::wstring(L"original")+extension);const auto format=saveImageFormat(path);
  auto d=Document::fromImage(3,2,std::vector<Pixel>(6,0xff2040c0),U"Original");d.markSaved();
  check(imageSaveIssues(d,format).empty(),"Opaque single raster should not need confirmation");
  const auto revision=d.revision(),history=d.historySize();const auto pixels=d.pixels();auto bytes=encodeSaveImage(d,format);writeExportBytesAtomic(path,bytes);
  check(d.revision()==revision&&d.historySize()==history&&!d.dirty()&&d.pixels()==pixels,"Image save encoder mutated live document");
  if(format==SaveImageFormat::Svg)check(std::string(bytes.begin(),bytes.end()).find("<svg")!=std::string::npos,"SVG signature");
  else if(format==SaveImageFormat::Ico)check(bytes.size()>6&&bytes[2]==1&&bytes[4]==1,"ICO signature");
  else {auto opened=format==SaveImageFormat::Gif?openGifAnimation(path):openRasterImage(path);check(opened.width()==3&&opened.height()==2,"Raster saved output must decode");if(format==SaveImageFormat::Png||format==SaveImageFormat::Bmp||format==SaveImageFormat::Gif)check(opened.pixels()==pixels,"Lossless source image pixels changed");}
 }
 check(saveImageFormat("x.PNG")==SaveImageFormat::Png&&saveImageFormat("x.JPEG")==SaveImageFormat::Jpeg&&saveImageFormat("x.png.bak")==SaveImageFormat::Native,"Source extension case/backup");
 check(normalizedImageSavePath("x.JPEG",SaveImageFormat::Jpeg)==std::filesystem::path("x.JPEG"),"Preserve jpeg extension");
 check(normalizedImageSavePath("x.ase",SaveImageFormat::Aseprite)==std::filesystem::path("x.ase")&&normalizedImageSavePath("x.aseprite",SaveImageFormat::Ase)==std::filesystem::path("x.aseprite"),"ASE family extensions stay interchangeable");
 check(normalizedImageSavePath("x.psd",SaveImageFormat::Png)==std::filesystem::path("x.png")&&normalizedImageSavePath("x.custom",SaveImageFormat::Png)==std::filesystem::path("x.custom.png"),"Legacy recognized suffix replacement / unknown append");
 check(preferredSaveImageFormat(1)==SaveImageFormat::Png&&preferredSaveImageFormat(2)==SaveImageFormat::Jpeg&&preferredSaveImageFormat(3)==SaveImageFormat::Webp&&preferredSaveImageFormat(4)==SaveImageFormat::Svg&&preferredSaveImageFormat(5)==SaveImageFormat::Ico,"Legacy default save preferences");
 Document masked=Document::fromImage(2,1,{0xff2040c0,0xff2040c0},U"Mask");check(masked.createAttachedMask(masked.layer().id,masked.frame().id),"Single-layer mask admission");check(masked.fillPixels({0,0},0xff000000),"Mask black fill");const auto maskPath=root/"mask.png";writeExportBytesAtomic(maskPath,encodeSaveImage(masked,SaveImageFormat::Png));check(openRasterImage(maskPath).pixels()==std::vector<Pixel>(2,0),"Single-layer raw optimization bypassed mask");
 Document d(2,2);check(has(imageSaveIssues(d,SaveImageFormat::Jpeg),"transparency"),"JPEG alpha warning");check(!has(imageSaveIssues(d,SaveImageFormat::Gif),"gifColors"),"Fully transparent GIF is supported");
 d.beginStroke({0,0},0x800000ff);d.commitStroke();check(has(imageSaveIssues(d,SaveImageFormat::Gif),"gifColors"),"GIF partial alpha warning");
 d.addFrame();d.setFrameDuration(210);d.beginStroke({1,1},0xff00ff00);d.commitStroke();const auto frames=d.timeline().state().frames.size();auto gif=gif_import::metadata(encodeSaveImage(d,SaveImageFormat::Gif));check(gif.frames.size()==frames&&gif.frames.back().duration==210,"Source GIF save must preserve all animation frames and timing");
 check(has(imageSaveIssues(d,SaveImageFormat::Png),"frames")&&!has(imageSaveIssues(d,SaveImageFormat::Gif),"frames"),"GIF versus still-image frame loss");
 d.addLayer();d.beginStroke({0,0},0xffffffff);d.commitStroke();check(d.createAttachedMask(d.layer().id,d.frame().id),"Mask fixture must have visible pixels");auto issues=imageSaveIssues(d,SaveImageFormat::Png);check(has(issues,"layers")&&has(issues,"effects"),"Layer/mask image loss");check(!asepriteApprovalCovers({"layers"},issues),"New loss must invalidate confirmation");
 d.setSelectedFramesDisabled(true);check(has(imageSaveIssues(d,SaveImageFormat::Gif),"frameFlags"),"Disabled frame warning");check(imageSaveIssues(d,SaveImageFormat::Native).empty(),"Native keeps document features");
 std::vector<Pixel> colors;for(unsigned i=0;i<256;++i)colors.push_back(0xff000000|i);auto many=Document::fromImage(256,1,colors,U"many");check(has(imageSaveIssues(many,SaveImageFormat::Gif),"gifColors"),"GIF color-count warning");
 std::cout<<"Image save formats, original-format policy, loss checks, GIF frames and source protection passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
