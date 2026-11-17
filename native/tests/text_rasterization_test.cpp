#include "document.h"
#include "project_encode.h"
#include "project_import.h"
#include "layer_compositor.h"
#include <iostream>
using namespace moon;
static void check(bool b,const char* why){if(!b)throw std::runtime_error(why);}
static TextCelData data(){auto d=newTextToolData(0xff123456);d.text=u"Moon😀";d.originX=-1;d.originY=2;d.boxed=true;d.boxWidth=6;d.boxHeight=4;return d;}
static timeline::Surface surface(){return {3,2,-1,2,{},{},{0x00123456,0xff123456,0x80778899,0,0xffaabbcc,0}};}
static void snapshotCheck(const Document& d,const std::string& id,const timeline::Surface& pixels,bool geometry=true){const auto result=d.timeline().resolveSurface(id);check(result.surface,"Raster owner exists");if(geometry)check(result.surface->pixels==pixels.pixels&&result.surface->offsetX==pixels.offsetX&&result.surface->offsetY==pixels.offsetY&&result.surface->width==pixels.width&&result.surface->height==pixels.height,"Conversion preserves raster geometry and hidden RGB");else for(int y=0;y<pixels.height;++y)for(int x=0;x<pixels.width;++x){const int dx=pixels.offsetX+x-result.surface->offsetX,dy=pixels.offsetY+y-result.surface->offsetY;check(dx>=0&&dy>=0&&dx<result.surface->width&&dy<result.surface->height&&result.surface->pixels[std::size_t(dy)*result.surface->width+dx]==pixels.pixels[std::size_t(y)*pixels.width+x],"First stroke undo preserves original raster bytes at world coordinates");}}

static void indexedStyleRasterization(){
 for(bool masked:{false,true}){
  auto d=Document::fromImage(5,1,{0,0xff112233,0xff112233,0,0},U"Indexed style");
  check(d.convertColorMode(color_mode::Mode::Indexed),"indexed style conversion");
  const auto layer=d.layer().id;
  if(masked){check(d.createAttachedMask(layer,d.frame().id),"indexed style mask");d.beginStroke({1,0},0xff000000);check(d.commitStroke(),"indexed style mask pixel");d.exitAttachedMask();}
  timeline::ColorOverlayStyle style;style.overlayEnabled=true;style.color=0xff112233;
  check(d.beginLayerStyle()&&d.commitLayerStyle(style),"indexed style setup");
  d.addLinkedFrame();const auto owner=d.timeline().resolveSurface(d.cel().id).source->id;
  const auto before=*d.timeline().resolveSurface(d.cel().id).surface;const auto history=d.historyPosition();const auto masks=d.timeline().state().masks;std::unordered_map<std::string,bool> covered;for(const auto& f:d.timeline().state().frames)covered[f.id]=timeline::resolvedMask(d.timeline().state(),layer,f.id)!=nullptr;
  check(d.rasterizeLayer(layer),"indexed style rasterize");
  auto verify=[&]{
   for(const auto& c:d.timeline().state().cels)if(c.layerId==layer){check(c.surface&&c.surface->format==timeline::RasterFormat::Indexed&&!c.linkedCelId,"indexed bake creates independent indexed frames");check(c.surface->offsetX==1&&c.surface->width==2,"indexed bake opaque bounds");const RasterColorContext colors(d.palette().entries,d.palette().order(),d.colorMode(),d.pixelFormat());check(colors.rgba(c.surface->format,c.surface->pixels[0])==(covered[c.frameId]?0:0xff112233)&&colors.rgba(c.surface->format,c.surface->pixels[1])==0xff112233,"indexed baked palette pixels and mask");}
   check(!d.layer().layerStyles&&d.timeline().state().masks.empty(),"indexed bake consumes style and masks");
  };
  verify();check(d.historyPosition()==history+1,"indexed bake one history");
  d.undo();check(d.layer().layerStyles&&d.timeline().resolveSurface(d.cel().id).source->id==owner&&d.timeline().resolveSurface(d.cel().id).surface->pixels==before.pixels&&d.timeline().state().masks.size()==masks.size(),"indexed bake undo source links masks");
  d.redo();verify();
 }
}
int main(){try{indexedStyleRasterization();
 Document d(8,8);check(d.beginTextDraft(data(),surface()),"Begin actual pending text layer");const auto layer=d.layer().id,cel=d.cel().id;const auto original=surface();const auto h=d.historySize();check(d.rasterizeLayer(layer),"Convert pending text draft");check(!d.textDraftActive()&&d.layer().kind.empty()&&!d.cel().text&&d.historySize()==h+2,"Draft creation and rasterization are separate history entries");d.cancelTextDraft();snapshotCheck(d,cel,original);check(d.layer().id==layer,"Stale text cancel keeps converted layer");const auto convertedHistory=d.historyPosition();d.beginStroke({0,2},0xffabcdef);d.commitStroke();check(d.historyPosition()==convertedHistory+1,"First raster stroke is separate");d.undo();check(d.layer().kind.empty()&&!d.cel().text,"Undo first stroke keeps raster kind");snapshotCheck(d,cel,original,false);d.undo();check(d.layer().kind=="text"&&d.cel().text&&d.cel().text->text==data().text,"Undo conversion restores editable text");d.undo();check(!d.timeline().hasLayer(layer),"Undo draft creation removes layer");d.redo();d.redo();snapshotCheck(d,cel,original);check(d.layer().kind.empty()&&!d.cel().text,"Redo converted state");
 check(d.beginLayerMove({cel})&&d.previewLayerMove(2,0)&&d.commitLayerMove(),"Converted text supports move");auto moved=original;moved.offsetX+=2;snapshotCheck(d,cel,moved);d.undo();snapshotCheck(d,cel,original);d.redo();snapshotCheck(d,cel,moved);
 Document frames(8,8);frames.beginTextDraft(data(),surface());frames.commitTextDraft();const auto text=frames.layer().id;frames.addLinkedFrame();const auto linked=frames.cel().id;const auto owner=frames.timeline().resolveSurface(linked).source->id;frames.addFrame(true);auto other=data();other.text=u"Second";auto otherSurface=surface();otherSurface.offsetY=5;otherSurface.pixels[1]=0xff998877;frames.beginTextDraft(other,otherSurface,frames.cel().id);frames.commitTextDraft();const auto independent=frames.cel().id;const auto activeFrame=frames.frame().id;const auto before=frames.historySize();check(frames.rasterizeLayer(text)&&frames.historySize()==before+1,"All frame conversion is one transaction");check(frames.frame().id==activeFrame&&frames.timeline().resolveSurface(linked).source->id==owner,"Preserve active frame and same-layer animation links");for(const auto& c:frames.timeline().state().cels)if(c.layerId==text)check(!c.text,"Strip all frame text payloads");snapshotCheck(frames,linked,surface());snapshotCheck(frames,independent,otherSurface);frames.undo();check(frames.timeline().findCelById(owner)->text&&frames.timeline().findCelById(independent)->text->text==u"Second","Undo restores per-frame text");frames.redo();
 auto encoded=project::encodeEditableProject(frames);auto imported=project::prepareEditableImport(project::readProjectManifest(encoded.bytes));for(const auto& l:imported.timeline.layers)if(l.id==text)check(l.kind.empty(),"Project removes text layer kind");for(const auto& c:imported.timeline.cels)if(c.layerId==text)check(!c.text,"Project removes all text metadata");timeline::Timeline reopened(std::move(imported.timeline));check(reopened.resolveSurface(linked).source->id==owner&&reopened.resolveSurface(independent).surface->pixels==otherSurface.pixels,"Project retains links and raster bytes");auto recovery=project::readProjectManifest(project::encodeRecoveryProject(frames).bytes);for(const auto& c:recovery.cels)if(c.layerId==text)check(!c.text,"Recovery removes text metadata");check(!frames.rasterizeLayer(text),"Ordinary raster conversion no-op");
 std::cout<<"Text rasterization draft/cleanup/first-stroke/move/per-frame/link/history/project/recovery checks passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
