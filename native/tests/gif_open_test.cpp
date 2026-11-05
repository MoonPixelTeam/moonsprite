#include "gif_export.h"
#include "image_decode.h"
#include "image_file_signature.h"
#include "image_export.h"
#include "image_sequence_import.h"
#include "project_encode.h"
#include "project_import.h"
#include "project_manifest.h"
#include "recent_project_preview.h"
#include <fstream>
#include <iostream>
using namespace moon;
void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
int wmain(int argc,wchar_t** argv){try{
 check(argc>=2,"fixture path");const auto path=std::filesystem::path(argv[1]);std::filesystem::create_directories(path.parent_path());
 auto source=Document::fromImage(2,1,{0xff0000ff,0xff0000ff},U"chat animation");source.setFrameDuration(120);source.addFrame();source.fillSelectionOrCanvas(0xffff0000);source.setFrameDuration(240);auto gif=encodeAnimationGif(source);writeExportBytesAtomic(path,gif.bytes);
 auto opened=openGifAnimation(path);check(opened.timeline().state().frames.size()==2&&opened.timeline().state().frames[0].duration==120&&opened.timeline().state().frames[1].duration==240&&opened.palette().entries.size()>=2&&!opened.dirty(),"GIF open mismatch");
 for(const auto& entry:opened.palette().entries){const auto number=std::to_string(entry.id);check(entry.name==std::u32string(number.begin(),number.end()),"GIF import color name");}
 for(auto ext:{L".jpg",L".jpeg",L".webp",L".bmp",L".png",L".gif"}){
  const auto named=path.parent_path()/(std::wstring(L"聊天缓存")+ext);writeExportBytesAtomic(named,gif.bytes);const auto before=std::filesystem::file_size(named);
  check(hasGifFileSignature(named),"Chat GIF signature must beat suffix");auto imported=openRasterImage(named);const auto& state=imported.timeline().state();
  check(state.frames.size()==2&&state.frames[0].duration==120&&state.frames[1].duration==240&&imported.sourceFilePath()==named&&!imported.dirty()&&!imported.sourceArchive(),"Chat cache animation metadata/source identity");
  check(imported.pixels()==std::vector<Pixel>(2,0xff0000ff),"Chat cache initial frame pixels");imported.selectFrame(state.frames[1].id);check(imported.pixels()==std::vector<Pixel>(2,0xffff0000),"Chat cache second frame pixels");
  const auto revision=imported.revision(),history=imported.historySize();auto encoded=project::encodeEditableProject(imported);auto round=project::prepareEditableImport(project::readProjectManifest(encoded.bytes));check(round.timeline.frames.size()==2&&round.timeline.frames[1].duration==240&&round.timeline.cels[1].surface->pixels==std::vector<Pixel>(2,0xffff0000),"Chat GIF native project roundtrip");
  auto preview=recent::readPreview({std::filesystem::absolute(named).u8string(),1,false},path.parent_path()/"preview-cache",[]{return false;});check(preview.width==2&&preview.height==1&&preview.pixels==std::vector<Pixel>(2,0xff0000ff),"Chat cache preview must sniff GIF even with WebP suffix");
  check(imported.revision()==revision&&imported.historySize()==history&&!imported.dirty()&&std::filesystem::file_size(named)==before,"Read/preview/native encode changed source");
 }
 std::uint8_t prefix[]={'G','I','F','8','7','a'};check(hasGifSignature(prefix,6),"GIF87a recognized");prefix[4]='9';check(hasGifSignature(prefix,6)&&!hasGifSignature(prefix,5)&&!hasGifSignature(nullptr,0),"GIF89a and short prefix");prefix[5]='A';check(!hasGifSignature(prefix,6),"Signature must be exact");
 const auto broken=path.parent_path()/L"坏缓存.webp";writeExportBytesAtomic(broken,{'G','I','F','8','9','a',1});bool rejected=false;try{openRasterImage(broken);}catch(...){rejected=true;}check(rejected,"Recognized corrupt GIF must fail without static fallback");
 // Real numbered chat-cache files must not lose animation by being assembled
 // as still frames. Legacy sequence import rejects already animated sources.
 const auto first=path.parent_path()/"cache01.png",second=path.parent_path()/"cache02.png";writeExportBytesAtomic(first,gif.bytes);writeExportBytesAtomic(second,gif.bytes);
 int adds=0,errors=0;image_sequence::Host host;host.ask=[](const auto&,auto&){return image_sequence::Choice::Animation;};host.read=[](const std::string& file){return openRasterImage(std::filesystem::u8path(file));};host.add=[&](Document){++adds;};host.open=[](const std::string&){return false;};host.error=[&](const std::string&){++errors;};
 check(!image_sequence::open({first.u8string(),second.u8string()},path.parent_path()/"not-remembered.txt",host)&&adds==0&&errors==1,"Animated cache sequence must be rejected transactionally");
 auto still=Document::fromImage(2,1,{0xff123456,0xffabcdef},U"still");writeExportBytesAtomic(first,encodeStaticImagePng(still).png);check(!hasGifFileSignature(first)&&openRasterImage(first).pixels()==still.pixels(),"Static PNG dispatch regressed");
 // A single-frame GIF with a static suffix remains a valid sequence source.
 writeExportBytesAtomic(first,encodeAnimationGif(still).bytes);writeExportBytesAtomic(second,encodeAnimationGif(still).bytes);std::optional<Document> assembled;host.add=[&](Document d){++adds;assembled=std::move(d);};
 check(image_sequence::open({first.u8string(),second.u8string()},path.parent_path()/"not-remembered.txt",host)&&adds==1&&errors==1&&assembled->timeline().state().frames.size()==2,"Single-frame cache sequence rejected");
 // Static decoder -> palette -> native archive must retain rare unsampled colors.
 const auto rarePath=path.parent_path()/L"大图稀有色.png";std::vector<Pixel> rare(1024*1024,0xff000000);rare[1]=0xff0000ff;rare[2]=0x8000ff00;
 writeExportBytesAtomic(rarePath,encodeRgbaImagePng(1024,1024,rare).png);auto rareDocument=openRasterImage(rarePath);
 check(rareDocument.palette().entries.size()==3&&rareDocument.pixels()==rare&&!rareDocument.dirty(),"Static raster rare colors missing");
 for(const auto& entry:rareDocument.palette().entries){const auto number=std::to_string(entry.id);check(entry.name==std::u32string(number.begin(),number.end()),"Static import color name");}
 auto rareEncoded=project::encodeEditableProject(rareDocument);auto rareRound=project::prepareEditableImport(project::readProjectManifest(rareEncoded.bytes));
 check(rareRound.palette.entries.size()==3&&rareRound.timeline.cels.front().surface->pixels==rare,"Rare colors project roundtrip");
 std::cout<<"GIF/chat-cache suffixes, frames, timing, source identity, native roundtrip, preview, sequence and corrupt protection passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
