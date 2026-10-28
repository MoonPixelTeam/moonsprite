#include "document.h"
#include "layer_compositor.h"
#include "image_export.h"
#include "project_encode.h"
#include "project_file.h"
#include "project_manifest.h"
#include "project_import.h"
#include <iostream>
#include <stdexcept>
#define CHECK(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
using namespace moon;
int main(){try{
 Document d(2,2);d.beginStroke({0,0},0xff0000ff);d.commitStroke();const auto first=d.cel().id;d.addLinkedFrame();auto linked=d.cel().id;auto owner=d.timeline().resolveSurface(first).surface;const auto before=d.historySize();auto bytes=d.historyBytes();
 CHECK(d.beginCelProperties(linked));CHECK(d.previewCelProperties(.4,12));CHECK(d.previewCelProperties(.7,-2));CHECK(d.historySize()==before);CHECK(d.timeline().findCelById(first)->opacity==.7&&d.timeline().findCelById(linked)->zIndex==-2);CHECK(d.timeline().resolveSurface(first).surface==owner);d.commitCelProperties();CHECK(d.historySize()==before+1&&d.historyBytes()-bytes==64);d.undo();CHECK(d.cel().opacity==1&&d.cel().zIndex==0);d.redo();CHECK(d.cel().opacity==.7&&d.cel().zIndex==-2);
 CHECK(d.beginCelProperties(linked));CHECK(!d.previewCelProperties(.7,-2));d.commitCelProperties();CHECK(d.historySize()==before+1);
 CHECK(d.beginCelProperties(linked));CHECK(d.previewCelProperties(.1,4000));CHECK(d.cel().zIndex==999);d.cancelCelProperties();CHECK(d.cel().opacity==.7&&d.cel().zIndex==-2);
 d.setLayerOpacity(.25);CHECK(d.timeline().resolveSurface(linked).source->opacity==.25);CHECK((compositeNormalRegion(d.timeline(),d.frame().id,{0,0,2,2})[0]>>24)==64);d.undo();CHECK(d.layer().opacity==.7&&d.timeline().resolveSurface(linked).source->opacity==.7);
 auto encoded=project::encodeEditableProject(d);auto manifest=project::readProjectManifest(encoded.bytes);auto imported=project::prepareEditableImport(manifest);PaletteState palette;palette.entries.clear();palette.slots=imported.palette.slots;palette.nextId=imported.palette.nextId;palette.columns=imported.palette.columns;for(const auto& e:imported.palette.entries)palette.entries.push_back({e.id,e.name,e.color});auto reopened=Document::fromImported(imported.width,imported.height,std::move(imported.timeline),std::move(palette),imported.id,std::move(imported.name),encoded.bytes);CHECK(reopened.timeline().resolveSurface(first).source->opacity==.7);CHECK(reopened.timeline().resolveSurface(first).source->zIndex==-2);
 auto image=encodeStaticImagePng(d,{});CHECK((image.pixels[0]>>24)==179);
 timeline::State state;state.layers={{"top",U"top"},{"bottom",U"bottom"}};state.frames={{"a",100},{"b",100}};for(auto& l:state.layers)for(auto& f:state.frames){timeline::Cel c;c.id=l.id+f.id;c.layerId=l.id;c.frameId=f.id;c.opacity=1;c.surface=timeline::Surface{1,1,0,0,{},{},{l.id=="top"?0xff0000ffu:0xffff0000u}};state.cels.push_back(c);}state.cels[0].zIndex=-3;CHECK(compositeNormalRegion(timeline::Timeline(state),"a",{0,0,1,1})[0]==0xffff0000);state.cels[0].zIndex=4;state.cels[0].opacity=0;state.cels[1].opacity=.5;state.cels[2].opacity=0;state.layers[0].opacity=0;OnionSkinSettings onion;onion.enabled=true;onion.allLayers=true;onion.previousFrames=0;onion.nextFrames=1;onion.nextOpacity=100;auto ghost=compositeOnionRegion(timeline::Timeline(state),"a","top",{0,0,1,1},onion);CHECK((ghost[0]>>24)>0);

 // Warm caches before every mutation; rendering a cold timeline hides missing
 // invalidations. Same IDs across independent documents must remain isolated.
 {
  Document cache(1,1);cache.addLayer();cache.beginStroke({0,0},0xff123456);cache.commitStroke();
  const auto base=frameCompositeLayerOrder(cache.timeline(),cache.frame().id);
  const auto target=cache.cel().id;CHECK(cache.beginCelProperties(target));
  CHECK(cache.previewCelProperties(1,-10));const auto changed=frameCompositeLayerOrder(cache.timeline(),cache.frame().id);CHECK(changed!=base);
  auto independent=cache.timeline();CHECK(frameCompositeLayerOrder(independent,cache.frame().id)==changed);
  CHECK(cache.previewCelProperties(1,10));CHECK(frameCompositeLayerOrder(cache.timeline(),cache.frame().id)==base);
  cache.cancelCelProperties();CHECK(frameCompositeLayerOrder(cache.timeline(),cache.frame().id)==base);
  CHECK(frameCompositeLayerOrder(independent,cache.frame().id)==changed);
  CHECK(cache.beginCelProperties(target));CHECK(cache.previewCelProperties(1,-10));cache.commitCelProperties();
  CHECK(frameCompositeLayerOrder(cache.timeline(),cache.frame().id)==changed);
  cache.undo();CHECK(frameCompositeLayerOrder(cache.timeline(),cache.frame().id)==base);
  cache.redo();CHECK(frameCompositeLayerOrder(cache.timeline(),cache.frame().id)==changed);
  cache.addLinkedFrame();CHECK(frameCompositeLayerOrder(cache.timeline(),cache.frame().id)==changed);
  cache.disconnectCel();CHECK(cache.beginCelProperties(cache.cel().id));CHECK(cache.previewCelProperties(1,10));cache.commitCelProperties();
  CHECK(frameCompositeLayerOrder(cache.timeline(),cache.frame().id)==base);
  cache.selectFrame(cache.timeline().state().frames.front().id);CHECK(frameCompositeLayerOrder(cache.timeline(),cache.frame().id)==changed);
  cache.moveLayer(1);CHECK(frameCompositeLayerOrder(cache.timeline(),cache.frame().id).size()==2);
  cache.deleteLayer();CHECK(frameCompositeLayerOrder(cache.timeline(),cache.frame().id).size()==1);
  cache.undo();CHECK(frameCompositeLayerOrder(cache.timeline(),cache.frame().id).size()==2);
 }
 {
  timeline::State bare;bare.layers={{"one",U"one"},{"two",U"two"}};bare.frames={{"f",100}};
  timeline::Timeline indexed(bare);CHECK(frameCompositeLayerOrder(indexed,"f")==std::vector<std::size_t>({1,0}));
  indexed.addLayer({"three",U"three"});CHECK(frameCompositeLayerOrder(indexed,"f")==std::vector<std::size_t>({2,1,0}));
  timeline::Cel c;c.id="c";c.layerId="one";c.frameId="f";c.zIndex=-9;indexed.addCel(c);
  CHECK(frameCompositeLayerOrder(indexed,"f")==std::vector<std::size_t>({0,2,1}));
  auto copy=indexed;auto moved=std::move(copy);CHECK(frameCompositeLayerOrder(moved,"f")==frameCompositeLayerOrder(indexed,"f"));
  bool rejected=false;try{frameCompositeLayerOrder(indexed,"missing");}catch(const std::invalid_argument&){rejected=true;}CHECK(rejected);
  // Exercise eviction without changing the result for an earlier populated frame.
  for(int n=0;n<160;++n){auto id="eviction-"+std::to_string(n);indexed.addFrame({id,100});CHECK(frameCompositeLayerOrder(indexed,id).size()==3);}
  CHECK(frameCompositeLayerOrder(indexed,"f")==std::vector<std::size_t>({0,2,1}));
 }
 CHECK(normalizeCelZIndex(-12.9)==-12&&normalizeCelZIndex(4000)==999);std::cout<<"Cel metadata compound/link/undo/cancel, opacity projection, Z/onion, export and project roundtrip passed\n";return 0;
 }catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
