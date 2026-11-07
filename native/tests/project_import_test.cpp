#include "project_import.h"
#include "document.h"
#include <iostream>
#include <functional>
#include <algorithm>
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
static void indexedImportOrder(){
 auto m=sample();const auto raster=m.layers.front().surface;m.layers.clear();m.frames.clear();m.cels.clear();
 constexpr int layers=3,frames=192;
 for(int l=0;l<layers;++l){ManifestLayer layer;layer.id=l==0?"layer:a:b":l==1?"layer:a":"layer|c";layer.name="Indexed";layer.surface=raster;if(l<2)layer.linkedContentId="shared|:";m.layers.push_back(layer);}
 for(int f=0;f<frames;++f)m.frames.push_back({"frame:"+std::to_string(f),100});
 for(int l=0;l<layers;++l)for(int f=0;f<frames;++f){ManifestCel cel;cel.id="cel:"+std::to_string(l)+":"+std::to_string(f);cel.layerId=m.layers[l].id;cel.frameId=m.frames[f].id;if(f)cel.linkedCelId="cel:"+std::to_string(l)+":"+std::to_string(f-1);else cel.surface=raster;m.cels.push_back(cel);}
 std::reverse(m.cels.begin(),m.cels.end());m.activeLayerId=m.layers[0].id;m.activeFrameId=m.frames.back().id;
 const auto imported=prepareEditableImport(m);check(imported.timeline.cels.size()==m.cels.size());
 for(std::size_t i=0;i<m.cels.size();++i){const auto& source=m.cels[i];const auto& target=imported.timeline.cels[i];check(source.id==target.id&&source.frameId==target.frameId&&source.layerId==target.layerId);if(source.linkedCelId.empty())check(target.surface&&target.surface->pixels==raster->pixels);else check(!target.surface&&target.linkedCelId==source.linkedCelId);}
 moon::timeline::Timeline timeline(imported.timeline);check(timeline.diagnoseLinks().empty());for(int l=0;l<layers;++l){const auto resolved=timeline.resolveSurface("cel:"+std::to_string(l)+":"+std::to_string(frames-1));check(resolved.source&&resolved.source->id=="cel:"+std::to_string(l)+":0"&&resolved.surface->pixels==raster->pixels);}
}
static void malformedIndexedImport(){
 // A reverse-serialized invalid chain/cycle must flatten without recursive
 // traversal, preserve the active fallback and leave input DTOs untouched.
 for(bool cycle:{false,true})for(bool reverse:{false,true}){
  auto m=sample();m.frames.clear();m.cels.clear();constexpr int count=192;
  for(int i=0;i<count;++i){const auto frame="broken-frame-"+std::to_string(i);m.frames.push_back({frame,100});ManifestCel c;c.id="broken-cel-"+std::to_string(i);c.layerId=m.activeLayerId;c.frameId=frame;c.surface=m.layers.front().surface;c.opacity=.25;c.zIndex=i%9;c.linkedCelId=i?"broken-cel-"+std::to_string(i-1):cycle?"broken-cel-"+std::to_string(count-1):"missing-root";m.cels.push_back(std::move(c));}
  m.activeFrameId=m.frames.back().id;if(reverse)std::reverse(m.cels.begin(),m.cels.end());const auto original=m.cels;const auto prepared=prepareEditableImport(m);moon::timeline::Timeline timeline(prepared.timeline);check(timeline.diagnoseLinks().empty()&&timeline.state().cels.size()==count);
  const auto expectedRoot=cycle&&reverse?"broken-cel-"+std::to_string(count-1):"broken-cel-0";
  for(std::size_t i=0;i<m.cels.size();++i){check(m.cels[i].linkedCelId==original[i].linkedCelId&&m.cels[i].surface==original[i].surface);const auto r=timeline.resolveSurface(m.cels[i].id);check(r.source&&r.source->id==expectedRoot&&r.source->zIndex==(count-1)%9&&r.source->opacity==.25&&r.surface->pixels==m.layers.front().surface->pixels);}
 }
}
int main(int argc,char** argv) {try {
 indexedImportOrder();malformedIndexedImport();
 {auto source=sample();source.layers[0].groupId="absent-group";auto ready=prepareEditableImport(source);check(!ready.timeline.layers[0].groupId);auto d=createEditableDocument(std::move(ready));check(!d.layer().groupId);check(source.layers[0].groupId=="absent-group");}
 auto m=sample();auto out=prepareEditableImport(m);
 check(out.id==m.id&&out.timeline.layers[0].id==m.activeLayerId&&out.timeline.frames[0].duration==130&&out.timeline.cels[0].id=="cel:|");
 check(out.timeline.cels[0].surface->pixels==m.cels[0].surface->pixels&&out.sourceArchive==m.sourceArchive);
 check(out.layerGeometry.at(m.activeLayerId)==std::array<int,4>{2,1,0,0});
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
 for(bool self:{false,true}){auto m=sample();m.cels[0].linkedCelId=self?m.cels[0].id:"missing";const auto ready=prepareEditableImport(m);check(ready.timeline.cels[0].linkedCelId==std::nullopt);auto d=createEditableDocument(ready);check(d.pixels()==m.cels[0].surface->pixels&&d.historyPosition()==0&&d.timeline().diagnoseLinks().empty());check(!m.cels[0].linkedCelId.empty());}
 rejects([](auto& m){m.activeFrameId="missing";},corrupt);
 {auto m=sample();m.frames.push_back({"other",100});const auto ready=prepareEditableImport(m);check(ready.timeline.cels.size()==2&&ready.timeline.cels.back().surface->width==1&&ready.timeline.cels.back().surface->pixels==std::vector<std::uint32_t>{0});check(m.cels.size()==1);}
 {auto m=sample();auto s=std::make_shared<ManifestRaster>(*m.cels[0].surface);s->offsetX=1;m.cels[0].surface=s;auto d=createEditableDocument(prepareEditableImport(m));check(d.activeSurfaceIfPresent()->offsetX==1&&d.pixels()==s->pixels&&d.historyPosition()==0);}
 rejects([](auto& m){auto s=std::make_shared<ManifestRaster>(*m.cels[0].surface);s->pixels.pop_back();m.cels[0].surface=s;},corrupt);
 {auto m=sample();auto s=std::make_shared<ManifestRaster>(*m.layers[0].surface);s->pixels[0]=5;m.layers[0].surface=s;auto d=createEditableDocument(prepareEditableImport(m));check(d.pixels()==m.cels[0].surface->pixels&&d.historyPosition()==0);}
 rejects([](auto& m){m.cels[0].surface.reset();},unsupported);
 rejects([](auto& m){m.unsupported.push_back("referenceImages");},unsupported);
 rejects([](auto& m){m.colorMode="indexed";},unsupported);
 {auto locked=sample();locked.layers[0].locked=true;auto document=createEditableDocument(prepareEditableImport(locked));check(document.timeline().state().layers[0].locked);const auto original=document.pixels();document.beginStroke({0,0},0xff123456);check(!document.commitStroke()&&document.pixels()==original&&!document.canUndo());}
 rejects([](auto& m){m.paletteSlots={2};},corrupt);
 rejects([](auto& m){m.paletteSlots={1,1};},corrupt);
 {auto m=sample();m.paletteOrder={1,7};m.paletteSlots={7,1};auto d=createEditableDocument(prepareEditableImport(m));check(d.palette().order()==m.paletteOrder&&d.palette().slots==std::vector<int>({7,1,0,0}));check(m.paletteSlots==std::vector<int>({7,1}));}
 rejects([](auto& m){m.nextColorId=7;},corrupt);
 for(int mode=0;mode<3;++mode){auto m=sample();auto layer=m.layers[0];layer.id="linked-color-two";layer.linkedContentId="colors";m.layers[0].linkedContentId="colors";if(mode!=0)m.layers[0].displayColor=0xff302010;if(mode!=1)layer.displayColor=0xff708090;else layer.displayColor.reset();m.layers.push_back(layer);auto c=m.cels[0];c.id="linked-color-cel-two";c.layerId=layer.id;m.cels.push_back(c);auto prepared=prepareEditableImport(m);for(const auto& l:prepared.timeline.layers){const auto& source=l.id==layer.id?m.layers[1]:m.layers[0];check(l.displayColor==source.displayColor);}auto d=createEditableDocument(std::move(prepared));for(const auto& l:d.timeline().state().layers){const auto& source=l.id==layer.id?m.layers[1]:m.layers[0];check(l.displayColor==source.displayColor);}}
 std::cout<<"project import contract passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
