#include "project_import.h"
#include <iostream>
#include <functional>
using namespace moon::project;
void check(bool v) {if(!v) throw std::runtime_error("Import assertion failed");}
ReadManifest sample() {
 ReadManifest m;m.schemaVersion=21;m.id="doc:|";m.name="name";m.width=2;m.height=1;m.colorMode="rgba";
 m.activeLayerId="layer:|";m.activeFrameId="frame:|";m.paletteColumns=4;m.nextColorId=8;
 auto s=std::make_shared<ManifestRaster>();s->width=2;s->height=1;s->pixels={0x00112233u,0xff998877u};
 ManifestLayer l;l.id=m.activeLayerId;l.name="layer";l.surface=s;m.layers.push_back(l);
 m.frames.push_back({m.activeFrameId,130});ManifestCel c;c.id="cel:|";c.layerId=l.id;c.frameId=m.activeFrameId;c.surface=s;m.cels.push_back(c);
 m.palette={{1,"visible",0x00112233u},{7,"hidden",0x00112233u}};m.paletteOrder={1};m.paletteSlots={0,1,0,0};
 m.sourceArchive=std::make_shared<const Bytes>(Bytes{1,2,3});return m;
}
void rejects(std::function<void(ReadManifest&)> edit,ErrorKind kind) {
 auto m=sample();edit(m);try {auto out=prepareEditableImport(m);(void)out;}catch(const Error& e){check(e.kind==kind);return;}throw std::runtime_error("Import should reject");
}
int main(int argc,char** argv) {try {
 auto m=sample();auto out=prepareEditableImport(m);
 check(out.id==m.id&&out.timeline.layers[0].id==m.activeLayerId&&out.timeline.frames[0].duration==130&&out.timeline.cels[0].id=="cel:|");
 check(out.timeline.cels[0].surface->pixels==m.cels[0].surface->pixels&&out.sourceArchive==m.sourceArchive);
 check(out.palette.entries.size()==2&&out.palette.slots==m.paletteSlots&&out.palette.nextId==8);
 out.timeline.cels[0].surface->pixels[0]=99;check(m.cels[0].surface->pixels[0]==0x00112233u);
 m.paletteSlots.clear();out=prepareEditableImport(m);check(out.palette.slots==std::vector<int>({1,0,0,0}));
 {
  auto local=sample();auto storage=std::make_shared<ManifestRaster>();storage->width=3;storage->height=2;storage->offsetX=-2;storage->offsetY=3;storage->pixels={0x00030201,0xff123456,0,0,0,0xffaabbcc};local.cels[0].surface=storage;local.layers[0].surface=storage;
  local.frames.push_back({"linked-frame",90});auto alias=local.cels[0];alias.id="linked-cel";alias.frameId="linked-frame";alias.linkedCelId=local.cels[0].id;local.cels.push_back(alias);local.activeFrameId="linked-frame";
  const auto prepared=prepareEditableImport(local);moon::timeline::Timeline timeline(prepared.timeline);const auto owner=timeline.resolveSurface(alias.id);
  check(owner.source->id==local.cels[0].id&&owner.surface->width==3&&owner.surface->height==2&&owner.surface->offsetX==-2&&owner.surface->offsetY==3&&owner.surface->pixels==storage->pixels);
  check(!owner.surface->storageOriginX&&!owner.surface->storageOriginY&&prepared.activeFrameId=="linked-frame");
 }
 if(argc==2&&std::string(argv[1])=="--sparse-import-check")return 0;
 const auto corrupt=ErrorKind::Corrupt,unsupported=ErrorKind::Unsupported;
 rejects([](auto& m){m.layers.push_back(m.layers[0]);},corrupt);
 rejects([](auto& m){m.frames.push_back(m.frames[0]);},corrupt);
 rejects([](auto& m){auto c=m.cels[0];c.id="other";m.cels.push_back(c);},corrupt);
 rejects([](auto& m){m.cels[0].layerId="missing";},corrupt);
 rejects([](auto& m){m.cels[0].linkedCelId="missing";},corrupt);
 rejects([](auto& m){m.cels[0].linkedCelId=m.cels[0].id;},corrupt);
 rejects([](auto& m){m.activeFrameId="missing";},corrupt);
 rejects([](auto& m){m.frames.push_back({"other",100});},unsupported);
 rejects([](auto& m){auto s=std::make_shared<ManifestRaster>(*m.cels[0].surface);s->offsetX=1;m.cels[0].surface=s;},unsupported);
 rejects([](auto& m){auto s=std::make_shared<ManifestRaster>(*m.cels[0].surface);s->pixels.pop_back();m.cels[0].surface=s;},corrupt);
 rejects([](auto& m){auto s=std::make_shared<ManifestRaster>(*m.layers[0].surface);s->pixels[0]=5;m.layers[0].surface=s;},unsupported);
 rejects([](auto& m){m.cels[0].surface.reset();},unsupported);
 rejects([](auto& m){m.unsupported.push_back("referenceImages");},unsupported);
 rejects([](auto& m){m.colorMode="indexed";},unsupported);
 rejects([](auto& m){m.layers[0].locked=true;},unsupported);
 rejects([](auto& m){m.paletteSlots={2};},corrupt);
 rejects([](auto& m){m.paletteSlots={1,1};},corrupt);
 rejects([](auto& m){m.paletteOrder={1,7};m.paletteSlots={7,1};},unsupported);
 rejects([](auto& m){m.nextColorId=7;},corrupt);
 std::cout<<"project import contract passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
