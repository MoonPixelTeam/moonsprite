#include "image_import_limits.h"
#include "image_decode.h"
#include "image_save.h"
#include "image_export.h"
#include "gif_import.h"
#include "aseprite_io.h"
#include "psd_import.h"
#include "project_file.h"
#include "project_import.h"
#include "image_sequence_import.h"
#include <fstream>
#include <iostream>
#include <limits>
#include <windows.h>
#include <winioctl.h>
#include <zlib.h>
using namespace moon;
namespace {
void check(bool value,const char* why){if(!value)throw std::runtime_error(why);}
std::vector<std::uint8_t> read(const std::filesystem::path& p){std::ifstream f(p,std::ios::binary);return {(std::istreambuf_iterator<char>(f)),{}};}
Document decode(const std::filesystem::path& p){const auto f=saveImageFormat(p);if(f==SaveImageFormat::Gif)return openGifAnimation(p);if(f==SaveImageFormat::Ase||f==SaveImageFormat::Aseprite)return openAseprite(p);if(f==SaveImageFormat::Psd)return openPsd(p);return openRasterImage(p);}
std::uint32_t hash(const std::vector<Pixel>& pixels){std::uint32_t h=2166136261u;for(auto p:pixels)for(unsigned n=0;n<4;++n){h^=(p>>(n*8))&255;h*=16777619u;}return h;}
void be32(std::vector<std::uint8_t>& b,std::size_t at,std::uint32_t n){for(unsigned i=0;i<4;++i)b.at(at+i)=std::uint8_t(n>>((3-i)*8));}
}
int main(){try{
 for(auto wh:{std::pair<std::uint64_t,std::uint64_t>{1,1},{1025,1031},{32768,1},{1,32768},{8192,8192},{32768,2048}})check(editableImageDimensions(wh.first,wh.second),"Valid image canvas boundary");
 for(auto wh:{std::pair<std::uint64_t,std::uint64_t>{0,1},{1,0},{32769,1},{1,32769},{8192,8193},{32768,2049},{std::numeric_limits<std::uint64_t>::max(),2}})check(!editableImageDimensions(wh.first,wh.second),"Invalid canvas boundary/overflow accepted");
 gif_import::Metadata many;many.width=2048;many.height=1025;many.frames.resize(40,{0,0,1,1,100,0});bool rejected=false;try{gif_import::validateBudget(many);}catch(const std::length_error&){rejected=true;}check(rejected,"Large GIF aggregate working budget bypassed");
 const auto root=std::filesystem::path("large-image-import-test-owned")/(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(root);
 std::ofstream oracle(root/"oracle.tsv");unsigned cases=0;
 for(auto wh:{std::pair<int,int>{1025,2},{3,1031},{2048,16},{32768,1},{1,32768},{16384,1},{30000,1},{16383,1}}){
  std::vector<Pixel> pixels(std::size_t(wh.first)*wh.second,0xff2040c0);pixels.back()=0xff40c020;auto source=Document::fromImage(wh.first,wh.second,pixels,U"Large input");
  for(const auto* ext:{L".png",L".jpg",L".jpeg",L".webp",L".bmp",L".gif",L".ase",L".aseprite",L".psd"}){
   const auto name=std::to_string(wh.first)+"x"+std::to_string(wh.second);const auto path=root/(std::filesystem::path(name).wstring()+ext);const auto format=saveImageFormat(path);
   if((format==SaveImageFormat::Ase||format==SaveImageFormat::Aseprite)&&(wh.first>16384||wh.second>16384))continue;
   if(format==SaveImageFormat::Psd&&(wh.first>30000||wh.second>30000))continue;
   // The existing still-WebP encoder cannot construct larger fixtures.
   if(format==SaveImageFormat::Webp&&(wh.first>16383||wh.second>16383))continue;
   auto bytes=encodeSaveImage(source,format);writeExportBytesAtomic(path,bytes);auto opened=decode(path);
   check(opened.width()==wh.first&&opened.height()==wh.second&&!opened.dirty()&&!opened.canUndo()&&((format==SaveImageFormat::Ase||format==SaveImageFormat::Aseprite)?opened.sourceFilePath().empty():opened.sourceFilePath()==path),("Large codec open dimensions/source/clean state: "+path.u8string()).c_str());
   if(format!=SaveImageFormat::Jpeg&&format!=SaveImageFormat::Webp)check(opened.pixels()==pixels,"Large lossless codec changed pixels");
   oracle<<path.filename().u8string()<<'\t'<<wh.first<<'\t'<<wh.second<<'\t'<<hash(opened.pixels())<<'\n';
   const auto before=opened.pixels();opened.beginStroke({wh.first-1,wh.second-1},0xff778899);opened.commitStroke();const auto after=opened.pixels();check(after.back()==0xff778899&&opened.canUndo(),"Large imported bottom-right pixel edit");opened.undo();check(opened.pixels()==before,"Large imported edit undo");opened.redo();check(opened.pixels()==after,"Large imported edit redo");
   const auto saved=root/(path.filename().wstring()+L".moonsprite");project::saveDocumentAtomic(opened,saved);auto savedBytes=std::make_shared<const project::Bytes>(read(saved));auto reopened=project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(savedBytes)));check(reopened.width()==wh.first&&reopened.height()==wh.second&&reopened.pixels()==after&&!reopened.dirty(),"Large imported native save/reopen");check(read(path)==bytes,"Native save mutated large source file");++cases;
  }
 }
 // GIF: two large frames, durations/loop and signature-priority static suffix.
 auto animated=Document::fromImage(2048,3,std::vector<Pixel>(6144,0xff2040c0),U"Large animation");animated.setFrameDuration(40);animated.addFrame(true);animated.setFrameDuration(210);animated.beginStroke({2047,2},0xff40c020);animated.commitStroke();animated.setAnimationLoop(true);const auto gif=encodeSaveImage(animated,SaveImageFormat::Gif);const auto chat=root/"chat.png";writeExportBytesAtomic(chat,gif);auto chatDoc=openRasterImage(chat);check(chatDoc.width()==2048&&chatDoc.timeline().state().frames.size()==2&&chatDoc.timeline().state().frames[0].duration==40&&chatDoc.timeline().state().frames[1].duration==210&&chatDoc.animationLoop(),"Large GIF signature/frames/timing/loop");check(chatDoc.pixels().back()==0xff2040c0&&chatDoc.timeline().state().cels.at(1).surface->pixels.back()==0xff40c020,"Large GIF initial frame and second-frame edge pixels");
 // Image-sequence production host now consumes the same large raster decoder.
 std::optional<Document> sequence;image_sequence::Host host;host.ask=[](const auto&,auto& settings){settings.duration=173;return image_sequence::Choice::Animation;};host.read=[](const std::string& p){return openRasterImage(std::filesystem::u8path(p));};host.add=[&](Document d){sequence=std::move(d);};host.error=[](const std::string& error){throw std::runtime_error(error);};host.open=[](const auto&){return false;};
 const auto seq1=root/"sequence01.png",seq2=root/"sequence02.png";auto frame=Document::fromImage(1025,2,std::vector<Pixel>(2050,0xff2040c0),U"Sequence");writeExportBytesAtomic(seq1,encodeSaveImage(frame,SaveImageFormat::Png));frame.beginStroke({1024,1},0xff40c020);frame.commitStroke();writeExportBytesAtomic(seq2,encodeSaveImage(frame,SaveImageFormat::Png));check(image_sequence::open({seq1.u8string(),seq2.u8string()},root/"sequence-preferences.txt",host)&&sequence&&sequence->width()==1025&&sequence->timeline().state().frames.size()==2&&sequence->timeline().state().frames[1].duration==173,"Large real-file image sequence");
 // Reject dimensions from real headers before requesting decoded pixel storage.
 auto tiny=Document::fromImage(1,1,{0xff2040c0},U"Invalid headers");
 for(auto dims:{std::pair<unsigned,unsigned>{32769,1},{8192,8193}}){
  auto png=encodeSaveImage(tiny,SaveImageFormat::Png);be32(png,16,dims.first);be32(png,20,dims.second);be32(png,29,std::uint32_t(crc32(0,png.data()+12,17)));const auto bad=root/(std::to_string(dims.first)+"-rejected.png");writeExportBytesAtomic(bad,png);rejected=false;try{openRasterImage(bad);}catch(const std::length_error&){rejected=true;}check(rejected,"WIC oversized header was not rejected before decode");
  auto ase=encodeAseprite(tiny);ase[8]=dims.first&255;ase[9]=dims.first>>8;ase[10]=dims.second&255;ase[11]=dims.second>>8;rejected=false;try{decodeAseprite(ase);}catch(const std::exception&){rejected=true;}check(rejected,"ASE oversized header accepted");
  auto psd=encodeSaveImage(tiny,SaveImageFormat::Psd);be32(psd,14,dims.second);be32(psd,18,dims.first);rejected=false;try{decodePsd(psd,U"bad");}catch(const std::exception&){rejected=true;}check(rejected,"PSD oversized header accepted");
 }
 auto aseLimit=encodeAseprite(tiny);aseLimit[8]=1;aseLimit[9]=64;rejected=false;try{decodeAseprite(aseLimit);}catch(const std::exception&){rejected=true;}check(rejected,"Legacy ASE16384 canvas limit lost");
 auto psdLimit=encodeSaveImage(tiny,SaveImageFormat::Psd);be32(psdLimit,18,30001);rejected=false;try{decodePsd(psdLimit,U"bad");}catch(const std::exception&){rejected=true;}check(rejected,"Legacy PSDv1 30000 canvas limit lost");
 // The compressed WebP read is bounded before allocation. Sparse owned file
 // carries only a logical length, rather than allocating 257 MiB of disk data.
 const auto tooBig=root/"oversized.webp";HANDLE h=CreateFileW(tooBig.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);check(h!=INVALID_HANDLE_VALUE,"Cannot create oversized WebP fixture");DWORD returned=0;const bool sparse=DeviceIoControl(h,FSCTL_SET_SPARSE,nullptr,0,nullptr,0,&returned,nullptr)!=0;LARGE_INTEGER end;end.QuadPart=gif_import::workingBudget+1;const bool sized=sparse&&SetFilePointerEx(h,end,nullptr,FILE_BEGIN)&&SetEndOfFile(h);CloseHandle(h);check(sized,"Cannot size sparse WebP fixture");rejected=false;try{openRasterImage(tooBig);}catch(const std::length_error&){rejected=true;}check(rejected,"Oversized WebP input was allocated");
 for(const auto* name:{L"empty.webp",L"truncated.webp"}){const auto p=root/name;if(name[0]==L'e'){std::ofstream empty(p,std::ios::binary);}else writeExportBytesAtomic(p,{'R','I','F','F',20,0,0,0,'W','E','B','P'});rejected=false;try{openRasterImage(p);}catch(const std::exception&){rejected=true;}check(rejected,"Empty/truncated WebP accepted");}
 std::ofstream(root/"result.txt")<<cases<<" format/dimension combinations, edit/undo/redo/native reopen/source bytes, large GIF and image sequence, header limits and sparse WebP read-budget rejection passed.\n";std::cout<<root.u8string()<<" : "<<cases<<" combinations passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
