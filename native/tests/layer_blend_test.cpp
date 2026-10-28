#include "layer_blend.h"
#include "document.h"
#include "layer_compositor.h"
#include "project_encode.h"
#include "project_manifest.h"
#include "project_import.h"
#include "image_export.h"
#include <iostream>
#include <stdexcept>
#include <array>
#define CHECK(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
using namespace moon;
int main(int argc,char**){try{
 struct Fixture{uint32_t b,t;double o;};std::vector<Fixture> cases={{0xffbf7040,0xff2090d0,1},{0x8040a0f0,0x99e03070,.37},{0x00112233,0x80778899,.5},{0,0,1},{0x00abcdef,0x00112233,1},{0x80010203,0x00010203,0},{0xffffffff,0xff000000,1},{0xff000000,0xffffffff,1}};
 uint32_t seed=0x7283a911;auto next=[&]{seed=seed*1664525u+1013904223u;return seed;};for(int i=0;i<512;++i){auto b=next(),t=next(),o=next();cases.push_back({b,t,(o%101)/100.});}
 const uint32_t opaque[]={0xff2090d0,0xff207040,0xff183f34,0xff000215,0xff000111,0xffbf90d0,0xffc7c1dc,0xffdaffff,0xffdfffff,0xff8f7e68,0xff9b7768,0xff3083b9,0xff0080ac,0xff0091e1,0xff4070a0,0xff00ffff,0xff9f2090,0xffaf82a8,0xff9f0000,0xffffc64e,0xff156594,0xffe07230,0xff00649d,0xffec9d6d};
 for(int m=0;m<24;++m){auto mode=LayerBlendMode(m);CHECK(parseLayerBlendMode(layerBlendModeName(mode))==mode);for(size_t i=0;i<cases.size();++i){auto c=cases[i];auto pixel=blendLayerPixel(c.b,c.t,c.o,mode);if(argc>1)std::cout<<pixel<<'\n';else {auto row=c.b;blendLayerRow(&row,&c.t,1,c.o,mode);CHECK(row==pixel);if(i==0)CHECK(pixel==opaque[m]);if(i==2)CHECK(pixel==0x40778899);}}
 if(argc>1)continue;
 Document d(1,1);d.beginStroke({0,0},0xff2090d0);d.commitStroke();const auto history=d.historySize();d.beginLayerProperties();d.previewLayerBlendMode(std::string(layerBlendModeName(mode)));d.commitLayerOpacity();CHECK(d.layer().blendMode==layerBlendModeName(mode));CHECK(compositeNormalRegion(d.timeline(),d.frame().id,{0,0,1,1})[0]==0xff2090d0);if(m){CHECK(d.historySize()==history+1);d.undo();CHECK(d.layer().blendMode=="normal");d.redo();}
 auto encoded=project::encodeEditableProject(d);auto imported=project::prepareEditableImport(project::readProjectManifest(encoded.bytes));CHECK(imported.timeline.layers[0].blendMode==layerBlendModeName(mode));
 Document pair(1,1);pair.beginStroke({0,0},0xffbf7040);pair.commitStroke();pair.addLayer();pair.beginStroke({0,0},0xff2090d0);pair.commitStroke();pair.beginLayerProperties();pair.previewLayerBlendMode(std::string(layerBlendModeName(mode)));pair.commitLayerOpacity();CHECK(compositeNormalRegion(pair.timeline(),pair.frame().id,{0,0,1,1})[0]==opaque[m]);CHECK(encodeStaticImagePng(pair,{}).pixels[0]==opaque[m]);pair.mergeLayerDown();CHECK(pair.pixels()[0]==opaque[m]);pair.undo();CHECK(pair.layer().blendMode==layerBlendModeName(mode));
 d.beginLayerProperties();d.previewLayerBlendMode("multiply");d.cancelLayerOpacity();CHECK(d.layer().blendMode==layerBlendModeName(mode));const auto noOp=d.historySize();d.beginLayerProperties();d.previewLayerBlendMode("screen");d.previewLayerBlendMode(std::string(layerBlendModeName(mode)));d.commitLayerOpacity();CHECK(d.historySize()==noOp);
 }
 if(argc==1){Document multi(1,1);const auto locked=multi.layer().id;multi.setLayerLocked(true);multi.addLayer();const auto unlocked=multi.layer().id;multi.beginLayerProperties({locked,unlocked});multi.previewLayerBlendMode("screen");multi.commitLayerOpacity();CHECK(multi.timeline().state().layers[0].blendMode=="screen"&&multi.timeline().state().layers[1].blendMode=="normal");multi.undo();CHECK(multi.layer().blendMode=="normal");CHECK(!parseLayerBlendMode("unknown"));std::cout<<"24 modes, rows, transparent backdrop, properties undo/cancel/no-op and project roundtrip passed\n";}return 0;
 }catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
