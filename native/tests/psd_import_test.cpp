#include "psd_import.h"
#include "aseprite_io.h"
#include "aseprite_save_policy.h"
#include "project_file.h"
#include "project_import.h"
#include "project_manifest.h"
#include "layer_compositor.h"
#include "layer_blend.h"
#include <cmath>
#include <iostream>
#include <fstream>
#include <chrono>
#define CHECK(x) do{if(!(x))throw std::runtime_error("PSD check failed: " #x);}while(0)
using namespace moon;
std::vector<std::uint8_t> read(const std::filesystem::path& path){std::ifstream file(path,std::ios::binary);return {(std::istreambuf_iterator<char>(file)),{}};}
int wmain(int argc,wchar_t** argv){try{CHECK(argc==2);const auto root=std::filesystem::path(argv[1]);
 for(auto name:{"layered-rle.psd","layered-zip.psd"}){auto d=openPsd(root/name);for(const auto& entry:d.palette().entries){const auto number=std::to_string(entry.id);CHECK(entry.name==std::u32string(number.begin(),number.end()));}const auto& s=d.timeline().state();CHECK(d.width()==3&&d.height()==2&&!d.dirty()&&d.historySize()==0&&s.layers.size()==2&&s.groups.size()==2&&s.frames.size()==1&&s.frames.front().duration==100);CHECK(s.layers[0].name==U"Top"&&s.layers[1].name==U"底层");const auto& top=s.layers[0];CHECK(!top.visible&&top.locked&&top.clippingMask&&top.blendMode=="multiply"&&std::abs(top.opacity-128./255)<.001&&top.groupId);const auto cel=d.timeline().findCel(top.id,"frame-1");CHECK(cel&&cel->surface&&cel->surface->width==2&&cel->surface->height==1&&cel->surface->offsetX==1&&cel->surface->offsetY==1&&cel->surface->pixels[0]==0xff1e140a&&cel->surface->pixels[1]==0x803c3228);CHECK(s.groups[0].name==U"Imported group"&&s.groups[0].cumulativeBlend&&s.groups[0].blendMode=="screen"&&s.groups[0].panelOrder==1.5&&s.groups[1].panelOrder==1.5);CHECK(s.masks.size()==1&&s.masks[0].ownerId==top.id&&s.masks[0].mask.surface.pixels[0]==0xff000000&&s.masks[0].mask.surface.pixels[1]==0xffffffff);
  const auto owned=std::filesystem::current_path()/("psd-import-test-owned-"+std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));std::filesystem::create_directory(owned);const auto projectPath=owned/L"分层导入.moonsprite";const auto before=read(root/name);const auto pixels=compositeNormalRegion(d.timeline(),"frame-1",{0,0,3,2});project::saveDocumentAtomic(d,projectPath);CHECK(read(root/name)==before);auto bytes=std::make_shared<const project::Bytes>(read(projectPath));auto imported=project::prepareEditableImport(project::readProjectManifest(bytes));CHECK(imported.timeline.layers.size()==2&&imported.timeline.groups.size()==2&&imported.timeline.groups[0].cumulativeBlend&&imported.timeline.masks.size()==1);timeline::Timeline timeline(std::move(imported.timeline));CHECK(compositeNormalRegion(timeline,"frame-1",{0,0,3,2})==pixels);
  auto damaged=before;damaged.resize(damaged.size()/2);bool failed=false;try{decodePsd(damaged,U"bad");}catch(const std::exception&){failed=true;}CHECK(failed);
 }
 auto masked=openPsd(root/"group-mask.psd");const auto& masks=masked.timeline().state().masks;CHECK(masks.size()==1&&masks[0].group&&!masks[0].mask.visible&&masks[0].mask.surface.width==3&&masks[0].mask.surface.height==2&&masks[0].mask.surface.offsetX==0&&masks[0].mask.surface.offsetY==0&&masks[0].mask.surface.pixels[0]==0xff000000&&masks[0].mask.surface.pixels[1]==0xff808080&&!masked.timeline().state().groups[0].cumulativeBlend);
 auto merged=openPsd(root/"merged.psd");CHECK(merged.timeline().state().layers.size()==1&&merged.pixels()[0]==0xff38220c&&merged.pixels()[1]==0xff46505a);
 for(auto depth:{8,16,32})for(auto compression:{0,2,3}){auto d=openPsd(root/("plane-"+std::to_string(depth)+"-"+std::to_string(compression)+".psd"));if(d.pixels()[0]!=0x801e140a||d.pixels()[1]!=0xff3c32f0){std::cerr<<"depth="<<depth<<" compression="<<compression<<" pixels="<<std::hex<<d.pixels()[0]<<","<<d.pixels()[1]<<std::dec<<"\n";}CHECK(d.pixels()[0]==0x801e140a&&d.pixels()[1]==0xff3c32f0);}
 // Legacy cumulative group samples its children over the existing backdrop,
 // skips empty isolated coverage, then applies group mask/opacity/blend.
 timeline::State state;state.frames.push_back({"f",100});timeline::Layer top;top.id="top";top.groupId="g";top.blendMode="multiply";timeline::Layer bottom;bottom.id="bottom";state.layers={top,bottom};timeline::Group group;group.id="g";group.cumulativeBlend=true;group.blendMode="screen";group.opacity=.8;state.groups.push_back(group);for(auto l:{top,bottom}){timeline::Cel c;c.id=l.id+"-c";c.layerId=l.id;c.frameId="f";c.surface=timeline::Surface{2,1,0,0,{},{},l.id=="top"?timeline::LinkedPixelStorage{0xff4080c0,0}:timeline::LinkedPixelStorage{0xff806040,0xff806040}};state.cels.push_back(c);}timeline::Timeline t(state);const auto actual=compositeNormalRegion(t,"f",{0,0,2,1});auto inner=blendLayerPixel(0xff806040,0xff4080c0,1,LayerBlendMode::Multiply);CHECK(actual[0]==blendLayerPixel(0xff806040,inner,.8,LayerBlendMode::Screen)&&actual[1]==0xff806040);
 // A clipping chain always merges its isolated base, even when that base is cumulative.
 auto clippedState=state;timeline::Layer clipped;clipped.id="clip";clipped.clippingMask=true;clippedState.layers.insert(clippedState.layers.begin(),clipped);timeline::Cel clippedCel;clippedCel.id="clip-c";clippedCel.layerId="clip";clippedCel.frameId="f";clippedCel.surface=timeline::Surface{2,1,0,0,{},{},timeline::LinkedPixelStorage{0xff102030,0xff102030}};clippedState.cels.push_back(clippedCel);timeline::Timeline clippedTimeline(clippedState);const auto clippedPixels=compositeNormalRegion(clippedTimeline,"f",{0,0,2,1});CHECK(clippedPixels[0]==blendLayerPixel(0xff806040,0xff102030,.8,LayerBlendMode::Screen)&&clippedPixels[1]==0xff806040);
 auto importedDocument=documentFromAseprite(decodeAseprite(encodeAseprite(documentFromAseprite({2,1,state,{},U"test","top","f"}))));CHECK(importedDocument.timeline().state().layers.size()==1&&compositeNormalRegion(importedDocument.timeline(),importedDocument.frame().id,{0,0,2,1})==actual);auto cumulativeDocument=documentFromAseprite({2,1,state,{},U"test","top","f"});const auto issues=asepriteSaveIssues(cumulativeDocument);CHECK(std::find(issues.begin(),issues.end(),"effects")!=issues.end());
 std::cout<<"PSD layered RGB, groups/properties/masks, raw/RLE/ZIP/predicted 8/16/32-bit channels, merged fallback, cumulative blending, project roundtrip and corrupt input checks passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}

