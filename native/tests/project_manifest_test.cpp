#include "project_manifest.h"
#include "project_import.h"
#include <filesystem>
#include <fstream>
#include <iostream>
using namespace moon::project;
namespace {
void check(bool b,const char* message) {if(!b) throw std::runtime_error(message);}
std::shared_ptr<const Bytes> load(const std::filesystem::path& p) {std::ifstream in(p,std::ios::binary);if(!in)throw std::runtime_error("Missing fixture");return std::make_shared<const Bytes>(std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>());}
template<class F> void rejects(F work,ErrorKind kind) {try{work();}catch(const Error& e){check(e.kind==kind,"Wrong failure classification");return;}throw std::runtime_error("Invalid manifest accepted");}
}
int main(int argc,char** argv) {
 try {
  check(argc==2,"Fixture argument required");const auto dir=std::filesystem::u8path(argv[1]);
  auto bytes=load(dir/"valid.moonsprite");auto parsed=readProjectManifest(bytes);
  check(parsed.schemaVersion==21 && parsed.colorMode=="rgba" && parsed.width==2 && parsed.height==2,"Header changed");
  check(parsed.name==u8"原生兼容样本","Unicode name changed");
  check(parsed.sourceArchive==bytes && !parsed.manifestUtf8.empty(),"Source evidence discarded");
  check(parsed.unsupported.empty(),"Actual legacy default unexpectedly unsupported");
  const auto admitted=prepareEditableImport(parsed);check(admitted.width==2 && admitted.timeline.cels.size()==1,"Valid legacy fixture admission failed");
  check(parsed.layers.size()==1 && parsed.frames.size()==1 && parsed.cels.size()==1,"Structure changed");
  check(parsed.cels[0].surface==parsed.layers[0].surface,"Shared raster was decoded twice");
  check(parsed.cels[0].layerId==parsed.layers[0].id && parsed.cels[0].frameId==parsed.frames[0].id,"Cel relationships lost");
  check(parsed.frames[0].duration==100 && parsed.palette.size()==2 && parsed.paletteSlots.size()==8,"Metadata lost");
  check(parsed.palette[1].color==0xffff7929 && parsed.paletteSlots[2]==0,"Palette mapping changed");
  parsed=readProjectManifest(load(dir/"rgba.moonsprite"));
  check(parsed.layers[0].surface->pixels==std::vector<std::uint32_t>({0xff1e140a,0x0046505a,0x80030201,0xfcfdfeff}),"RGBA changed");
  auto unknown=readProjectManifest(load(dir/"unknown.moonsprite"));
  check(!unknown.unsupported.empty() && unknown.manifestUtf8.find("preserve me")!=std::string::npos,"Unknown semantic discarded");
  check(!readProjectManifest(load(dir/"unknown-resource.moonsprite")).unsupported.empty(),"Unknown resource silently discarded");
  rejects([&]{readProjectManifest(load(dir/"future.moonsprite"));},ErrorKind::Unsupported);
  for(const auto name:{"broken-reference.moonsprite","duplicate-frame.moonsprite","syntax.moonsprite"}) rejects([&]{readProjectManifest(load(dir/name));},ErrorKind::Corrupt);
  check(readProjectManifest(bytes).id==parsed.id,"Valid read after failures changed identity");
  Limits limits;limits.manifestBytes=1;rejects([&]{readProjectManifest(bytes,limits);},ErrorKind::Limit);
  std::cout<<"Legacy manifest fixture checks passed\n";return 0;
 } catch(const std::exception& e) {std::cerr<<e.what()<<'\n';return 1;}
}
