#include "gif_import.h"
#include "image_decode.h"
#include "image_export.h"
#include "project_encode.h"
#include "project_import.h"
#include <iostream>
#include <fstream>
#include <chrono>
using namespace moon;
using namespace moon::gif_import;
static void check(bool value,const char* text){if(!value)throw std::runtime_error(text);}
static void word(std::vector<std::uint8_t>& out,int value){out.push_back(value&255);out.push_back((value>>8)&255);}
struct Patch{Descriptor descriptor;std::vector<std::uint8_t> pixels;bool control=true,interlace=false,local=false;};
static std::vector<std::uint8_t> fixture(int width,int height,const std::vector<Patch>& patches,const std::string& application={}){
 std::vector<std::uint8_t> out{'G','I','F','8','9','a'};word(out,width);word(out,height);out.insert(out.end(),{0xf7,3,0});
 auto palette=[&](bool local){for(int i=0;i<256;++i){out.push_back(i==1&&!local?255:0);out.push_back(i==2||(i==1&&local)?255:0);out.push_back(i==3?255:0);}};palette(false);
 for(const auto& patch:patches){const auto& frame=patch.descriptor;if(patch.control){out.insert(out.end(),{0x21,0xf9,4,std::uint8_t((frame.disposal<<2)|1)});word(out,frame.duration/10);out.insert(out.end(),{0,0});}
  out.push_back(0x2c);word(out,frame.left);word(out,frame.top);word(out,frame.width);word(out,frame.height);out.push_back((patch.interlace?64:0)|(patch.local?0x87:0));if(patch.local)palette(true);out.push_back(8);
  std::vector<std::uint8_t> indices;if(patch.interlace){for(auto pass:std::vector<std::pair<int,int>>{{0,8},{4,8},{2,4},{1,2}})for(int y=pass.first;y<frame.height;y+=pass.second)for(int x=0;x<frame.width;++x)indices.push_back(patch.pixels[y*frame.width+x]);}else indices=patch.pixels;
  std::vector<std::uint8_t> compressed;unsigned buffer=0;int bits=0;auto emit=[&](unsigned code){buffer|=code<<bits;bits+=9;while(bits>=8){compressed.push_back(buffer&255);buffer>>=8;bits-=8;}};for(auto index:indices){emit(256);emit(index);}emit(257);if(bits)compressed.push_back(buffer&255);
  for(std::size_t offset=0;offset<compressed.size();){const auto count=std::min<std::size_t>(255,compressed.size()-offset);out.push_back(std::uint8_t(count));out.insert(out.end(),compressed.begin()+offset,compressed.begin()+offset+count);offset+=count;}out.push_back(0);
 }
 // Put the application after image frames; legacy scans every application.
 if(!application.empty()){out.insert(out.end(),{0x21,0xff,std::uint8_t(application.size())});out.insert(out.end(),application.begin(),application.end());out.insert(out.end(),{3,1,2,0,0});}out.push_back(0x3b);return out;
}
static std::vector<Pixel> pixels(const Document& doc,std::size_t frame){return doc.timeline().state().cels.at(frame).surface->pixels;}
int wmain(int argc,wchar_t** argv){try{
 constexpr Pixel red=0xff0000ff,green=0xff00ff00,blue=0xffff0000;
 Composite background(3,1);check(background.append({0,0,3,1,40,1},{red,red,red})==std::vector<Pixel>{red,red,red},"Initial transparent canvas");check(background.append({1,0,1,1,80,2},{green})==std::vector<Pixel>{red,green,red},"Background disposal frame snapshot");check(background.append({1,0,2,1,120,1},{0,blue})==std::vector<Pixel>{red,0,blue},"Transparent patch and background disposal");
 Composite previous(3,1);previous.append({0,0,3,1,100,1},{red,red,red});previous.append({1,0,1,1,100,3},{green});check(previous.append({2,0,1,1,100,1},{blue})==std::vector<Pixel>{red,red,blue},"Restore previous disposal");
 Composite clipped(2,1);check(clipped.append({-1,0,3,1,100,2},{red,green,0x80443322})==std::vector<Pixel>{green,0x80443322},"Clipped negative patch preserves RGBA");check(clipped.append({9,0,1,1,100,1},{red})==std::vector<Pixel>{0,0},"Fully off-canvas patch and clear");
 bool failed=false;try{Composite invalid(1,1);invalid.append({0,0,2,1,100,1},{red});}catch(const std::exception&){failed=true;}check(failed,"Incomplete patch rejected");
 const auto root=std::filesystem::path(argc>1?argv[1]:L"gif-import-test-owned")/std::to_string(std::chrono::steady_clock::now().time_since_epoch().count());std::filesystem::create_directories(root);
 const auto source=root/std::filesystem::u8path(u8"步行.gif");const auto bytes=fixture(3,1,{{{0,0,3,1,40,1},{1,1,1}},{{1,0,1,1,80,2},{2}},{{1,0,2,1,120,1},{0,3}}},"NETSCAPE2.0");writeExportBytesAtomic(source,bytes);const auto doc=openGifAnimation(source);
 check(doc.name()==U"步行.gif"&&doc.width()==3&&doc.height()==1&&doc.animationLoop()&&!doc.dirty()&&doc.sourceFilePath()==source&&!doc.sourceArchive(),"GIF name/source/loop/new native document");check(pixels(doc,0)==std::vector<Pixel>{red,red,red}&&pixels(doc,1)==std::vector<Pixel>{red,green,red}&&pixels(doc,2)==std::vector<Pixel>{red,0,blue},"Real GIF transparent patch/background disposal");check(doc.timeline().state().frames[0].duration==40&&doc.timeline().state().frames[1].duration==80&&doc.timeline().state().frames[2].duration==120,"Real GIF frame durations");
 const auto encoded=project::encodeEditableProject(doc);const auto reopened=project::prepareEditableImport(project::readProjectManifest(encoded.bytes));check(reopened.id==doc.projectId()&&reopened.loop&&reopened.timeline.frames.size()==3&&reopened.timeline.frames[2].duration==120&&reopened.timeline.cels[2].surface->pixels==pixels(doc,2)&&reopened.palette.entries.size()==3,"GIF to native project round-trip");
 const auto other=root/"other"/source.filename();std::filesystem::create_directories(other.parent_path());writeExportBytesAtomic(other,bytes);check(openGifAnimation(other).projectId()!=doc.projectId(),"Same basename must get separate project identities");
 const auto verify=[&](const std::string& name,const std::vector<Patch>& patches,const std::string& application,bool loop,const std::vector<std::vector<Pixel>>& expected){const auto path=root/(name+".gif");writeExportBytesAtomic(path,fixture(3,1,patches,application));const auto imported=openGifAnimation(path);check(imported.animationLoop()==loop,"Loop application ID");for(std::size_t i=0;i<expected.size();++i)check(pixels(imported,i)==expected[i],"Real GIF patch fixture pixels");return imported;};
 verify("previous",{{{0,0,3,1,100,1},{1,1,1}},{{1,0,1,1,100,3},{2}},{{2,0,1,1,100,1},{3}}},"ANIMEXTS1.0",true,{{red,red,red},{red,green,red},{red,red,blue}});
 verify("edge",{{{2,0,2,1,100,2},{1,2}},{{4,0,1,1,100,1},{3}}},{},false,{{0,0,red},{0,0,0}});
 const auto delays=verify("delays",{{{0,0,1,1,0,0},{1}},{{1,0,1,1,100,0},{2},false},{{2,0,1,1,655350,0},{3}}},"netscape2.0",true,{{red,0,0},{red,green,0},{red,green,blue}});check(delays.timeline().state().frames[0].duration==100&&delays.timeline().state().frames[1].duration==100&&delays.timeline().state().frames[2].duration==60000,"Zero/absent/excessive frame duration");
 verify("unknown",{{{0,0,1,1,100,0},{1}}},"NOTSCAPE2.0",false,{{red,0,0}});
 const auto local=verify("local",{{{0,0,1,1,100,0},{1},true,false,true}},{},false,{{green,0,0}});
 const auto interlaced=root/"interlaced.gif";writeExportBytesAtomic(interlaced,fixture(1,4,{{{0,0,1,4,100,0},{1,2,3,1},true,true}}));check(pixels(openGifAnimation(interlaced),0)==std::vector<Pixel>{red,green,blue,red},"WIC interlaced patch");
 auto truncated=bytes;truncated.resize(truncated.size()-3);failed=false;try{metadata(truncated);}catch(const std::exception&){failed=true;}check(failed,"Truncated block rejected before decode");Metadata oversized;oversized.width=oversized.height=1024;oversized.frames.resize(64,Descriptor{0,0,1024,1024,100,0});failed=false;try{validateBudget(oversized);}catch(const std::exception&){failed=true;}check(failed,"Expanded GIF budget protection");
 std::ifstream original(source,std::ios::binary);check(std::vector<std::uint8_t>((std::istreambuf_iterator<char>(original)),{})==bytes,"Source GIF bytes unchanged");
 std::cout<<"gif-import: passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
