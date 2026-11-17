#include "layer_compositor.h"
#include "raster_snapshot.h"
#include "document.h"
#include "free_tile_selection_target.h"
#include "canvas_feedback_composite.h"
#include <fstream>
#include <iostream>
#include <stdexcept>
using namespace moon;
using namespace moon::timeline;
#define CHECK(...) do{if(!(__VA_ARGS__))throw std::runtime_error(#__VA_ARGS__);}while(false)
struct Entry {int id;Pixel color;};
static std::optional<ColorOverlayStyle> style(const std::string& effect){
 if(effect=="none")return {};ColorOverlayStyle s;
 if(effect=="overlay"){s.overlayEnabled=true;s.color=0xffe09010;}
 if(effect=="gradient"){s.gradientEnabled=true;s.gradientFrom=0xff1010e0;s.gradientTo=0xff10e010;}
 if(effect=="stroke"||effect=="smart"){s.stroke.enabled=true;s.stroke.color=0xffe020d0;s.stroke.smartHue=effect=="smart";s.stroke.followOpacity=effect=="smart";}
 if(effect=="shadow"){s.shadow.enabled=true;s.shadow.offsetX=s.shadow.offsetY=1;}
 if(effect=="glow")s.innerGlow.enabled=true;
 if(effect=="map"){s.gradientMapEnabled=true;s.gradientMap.stops={{0,0xffd02010},{1,0xff10e020}};}
 return s;
}
static AttachedMask mask(std::string id){AttachedMask m;m.id=std::move(id);m.surface={2,2,1,1,{},{},{0xff000000,0xff808080,0xffffffff,0}};return m;}
namespace moon {struct RasterHistoryFixture {
 static void newLayerColorModes(){
  for(auto mode:{color_mode::Mode::Rgba,color_mode::Mode::Grayscale,color_mode::Mode::Indexed})for(bool grouped:{false,true})for(bool adjustment:{false,true}){
   Document d(8,6);d.colorMode_=mode;auto state=d.timeline_.state();state.cels.front().surface->format=mode==color_mode::Mode::Indexed?RasterFormat::Indexed:RasterFormat::Rgba;d.timeline_=Timeline(std::move(state));d.projectActiveCelOpacities();
   const auto original=d.layer().id;d.addLinkedFrame();const auto activeFrame=d.frame().id;
   std::optional<std::string> parent;if(grouped){d.selectTimelineLayer(original);CHECK(d.createLayerGroup());parent=d.selectedGroupId();d.selectLayer(original);d.selectTimelineLayer(original);}
   const auto palette=d.palette_;const auto history=d.historyPosition();d.addLayerInGroupContext(adjustment);const auto created=d.layer().id;
   CHECK(created!=original&&d.layer().groupId==parent&&d.frame().id==activeFrame&&d.historyPosition()==history+1);
   CHECK((d.layer().kind=="adjustment")==adjustment);
   auto verify=[&]{for(const auto& frame:d.timeline_.state().frames){const auto* slot=d.timeline_.findCel(created,frame.id);CHECK(slot&&slot->surface&&!slot->linkedCelId);const auto& s=*slot->surface;CHECK(s.format==(mode==color_mode::Mode::Indexed?RasterFormat::Indexed:RasterFormat::Rgba));CHECK(s.width==1&&s.height==1&&s.offsetX==0&&s.offsetY==0&&s.pixels==std::vector<Pixel>{0});}};verify();
   d.undo();CHECK(!d.timeline_.hasLayer(created)&&d.frame().id==activeFrame);d.redo();CHECK(d.layer().id==created&&d.layer().groupId==parent);verify();
   if(!adjustment){d.beginStroke({5,4},d.palette_.entries.front().color);CHECK(d.commitStroke());const auto raw=d.timeline_.resolveSurface(d.cel().id).surface->pixels;d.undo();d.undo();CHECK(!d.timeline_.hasLayer(created));d.redo();d.redo();CHECK(d.timeline_.resolveSurface(d.cel().id).surface->pixels==raw&&d.timeline_.resolveSurface(d.cel().id).surface->format==(mode==color_mode::Mode::Indexed?RasterFormat::Indexed:RasterFormat::Rgba));}
   CHECK(d.palette_.entries.size()==palette.entries.size()&&d.palette_.order()==palette.order()&&d.palette_.nextId==palette.nextId);
  }
 }

 static void indexedBackgroundCreation(){
  for(bool solid:{false,true}){
   Document d(3,2);d.colorMode_=color_mode::Mode::Indexed;d.palette_.entries={{7,U"Hidden",0x80112233},{8,U"Visible",0xff445566}};d.palette_.slots={8,EmptyPaletteSlot};d.palette_.columns=2;d.palette_.setOrder({8});d.palette_.nextId=9;
   auto state=d.timeline_.state();state.cels.front().surface->format=RasterFormat::Indexed;state.cels.front().surface->pixels.assign(6,8);state.frames.push_back({"second",100});auto alias=state.cels.front();alias.id="second-cel";alias.frameId="second";alias.surface.reset();alias.linkedCelId=state.cels.front().id;state.cels.push_back(alias);d.timeline_=Timeline(state);d.projectActiveCelOpacities();const auto active=d.layer().id,frame=d.frame().id;const auto palette=d.palette_;
   Surface tile;tile.width=solid?1:4;tile.height=1;tile.pixels=solid?std::vector<Pixel>{0xffe4e4e4}:std::vector<Pixel>{0x80112233,0x00123456,0xffabcdef,0xffabcdef};const auto original=tile.pixels;
   CHECK(d.createBackgroundLayer(tile,solid));CHECK(d.historySize()==1&&d.layer().id==active&&d.frame().id==frame);const auto background=d.timeline_.state().layers.back().id;auto first=d.timeline_.findCel(background,frame);CHECK(first);const auto owner=first->id;const auto resolved=d.timeline_.resolveSurface(owner);CHECK(resolved.surface&&resolved.surface->format==RasterFormat::Indexed);CHECK(resolved.surface->width==(solid?3:4));
   const std::vector<Pixel> row=solid?std::vector<Pixel>{9,9,9}:std::vector<Pixel>{7,0,9,9};for(int y=0;y<2;++y)for(std::size_t x=0;x<row.size();++x)CHECK(resolved.surface->pixels[y*row.size()+x]==row[x]);CHECK(d.timeline_.resolveSurface(d.timeline_.findCel(background,"second")->id).source->id==owner);CHECK(d.palette_.nextId==10);CHECK(d.palette_.entries.back().color==(solid?0xffe4e4e4:0xffabcdef));CHECK(d.palette_.order()==(solid?std::vector<int>{8,9}:std::vector<int>{8,7,0,9}));CHECK(tile.pixels==original);const auto after=d.palette_;
   d.undo();CHECK(!d.timeline_.hasLayer(background)&&d.palette_.entries.size()==palette.entries.size()&&d.palette_.order()==palette.order()&&d.palette_.slots==palette.slots&&d.palette_.nextId==palette.nextId);d.redo();CHECK(d.timeline_.hasLayer(background)&&d.palette_.order()==after.order()&&d.palette_.slots==after.slots&&d.palette_.nextId==after.nextId);CHECK(d.timeline_.resolveSurface(owner).surface->format==RasterFormat::Indexed);
  }
  Document exhausted(1,1);exhausted.colorMode_=color_mode::Mode::Indexed;exhausted.palette_.nextId=std::numeric_limits<int>::max();Surface tile;tile.width=tile.height=1;tile.pixels={0xffabcdef};const auto originalPalette=exhausted.palette_;const auto layerCount=exhausted.timeline_.state().layers.size();bool rejected=false;try{exhausted.createBackgroundLayer(tile);}catch(const std::length_error&){rejected=true;}CHECK(rejected&&exhausted.historySize()==0&&exhausted.timeline_.state().layers.size()==layerCount&&exhausted.palette_.nextId==originalPalette.nextId&&exhausted.palette_.entries.size()==originalPalette.entries.size());

 }
 static void indexedBackgroundResize(){
  for(bool preset:{false,true})for(int shift:{-1,1}){
   Document d(3,2);auto state=d.timeline_.state();auto& layer=state.layers.front();layer.background=timeline::BackgroundSettings{preset?"preset":"canvas",preset?"solid":"",preset?0:3,preset?0:2};
   auto& surface=*state.cels.front().surface;surface.format=RasterFormat::Indexed;surface.pixels={7,0,8,8,7,0};surface.storageOriginX=4;surface.storageOriginY=-3;
   const auto owner=state.cels.front().id;const auto frame=state.frames.front().id;state.frames.push_back({"linked-frame",100});auto linked=state.cels.front();linked.id="linked-background";linked.frameId="linked-frame";linked.surface.reset();linked.linkedCelId=owner;state.cels.push_back(linked);
   d.timeline_=Timeline(state);d.colorMode_=color_mode::Mode::Indexed;d.palette_.entries={{0,U"Empty",0},{7,U"Red",0xff1122cc},{8,U"Preset",0xffe4e4e4}};d.palette_.setOrder({0,7,8});d.palette_.nextId=9;d.projectActiveCelOpacities();
   const auto palette=d.palette_;const std::vector<Pixel> before=state.cels.front().surface->pixels;
   CHECK(d.resizeCanvas(6,4,CanvasAnchor::NorthWest,shift,1,true));CHECK(d.historySize()==1);
   auto after=d.timeline_.resolveSurface(owner).surface;CHECK(after&&after->format==RasterFormat::Indexed&&after->storageOriginX==0&&after->storageOriginY==0);
   const auto saved=*after;CHECK(d.timeline_.resolveSurface("linked-background").source->id==owner);
   for(int y=0;y<after->height;++y)for(int x=0;x<after->width;++x){const auto sx=x+after->offsetX-shift,sy=y+after->offsetY-1;const bool inside=sx>=0&&sy>=0&&sx<3&&sy<2;const int lx=inside?sx:((sx%3)+3)%3,ly=inside?sy:((sy%2)+2)%2;const Pixel expected=!inside&&preset?8:before[std::size_t(ly)*3+lx];CHECK(after->pixels[std::size_t(y)*after->width+x]==expected);}
   CHECK(d.palette_.entries.size()==palette.entries.size()&&d.palette_.nextId==palette.nextId&&d.palette_.order()==palette.order());
   d.undo();CHECK(d.width()==3&&d.height()==2);after=d.timeline_.resolveSurface(owner).surface;CHECK(after->format==RasterFormat::Indexed&&after->pixels==before&&after->storageOriginX==4&&after->storageOriginY==-3);
   d.redo();after=d.timeline_.resolveSurface(owner).surface;CHECK(d.width()==6&&d.height()==4&&after->format==saved.format&&after->pixels==saved.pixels&&after->offsetX==saved.offsetX&&after->offsetY==saved.offsetY);CHECK(d.timeline_.resolveSurface("linked-background").source->id==owner);
  }
 }

 static void wholeLayerColorClipboard(){
  Document source(3,1);auto state=source.timeline_.state();state.cels.front().surface->format=RasterFormat::Indexed;state.cels.front().surface->pixels={7,8,0};state.frames.push_back({"linked-copy",100});auto alias=state.cels.front();alias.id="linked-copy-cel";alias.frameId="linked-copy";alias.linkedCelId=state.cels.front().id;alias.surface.reset();state.cels.push_back(alias);source.timeline_=Timeline(state);source.colorMode_=color_mode::Mode::Indexed;source.palette_.entries={{0,U"empty",0},{7,U"first",0xff112233},{8,U"other",0xffaabbcc},{7,U"last",0xff223344}};source.palette_.setOrder({0,7,8});source.projectActiveCelOpacities();
  auto clip=source.copyLayerClipboard();CHECK(clip&&clip->cels.size()==2);const std::vector<Pixel> frozen{0xff223344,0xffaabbcc,0};for(const auto& c:clip->cels)CHECK(c.surface->format==RasterFormat::Rgba&&c.surface->pixels==frozen&&!c.linkedCelId);
  source.palette_.entries[3].color=0xff000000;
  for(auto mode:{color_mode::Mode::Rgba,color_mode::Mode::Grayscale,color_mode::Mode::Indexed}){
   Document target(3,1);target.colorMode_=mode;target.pixelFormat_=color_mode::PixelFormat::Rgb565;target.palette_.entries={{0,U"empty",0},{19,U"a",0xff223344},{23,U"b",0xffaabbcc}};target.palette_.setOrder({0,19,23});const auto original=target.layer().id;
   CHECK(target.pasteLayerClipboard(*clip));const auto pasted=target.layer().id;CHECK(target.historySize()==1);
   for(const auto& f:target.timeline_.state().frames){const auto r=target.timeline_.resolveSurface(target.timeline_.findCel(pasted,f.id)->id);CHECK(r.surface);const auto expected=mode==color_mode::Mode::Indexed?std::vector<Pixel>{19,23,0}:mode==color_mode::Mode::Grayscale?std::vector<Pixel>{relativeLuminancePixel(frozen[0]),relativeLuminancePixel(frozen[1]),0}:frozen;CHECK(r.surface->pixels==expected);CHECK(r.surface->format==(mode==color_mode::Mode::Indexed?RasterFormat::Indexed:RasterFormat::Rgba));}
   target.undo();CHECK(target.layer().id==original&&target.timeline_.state().frames.size()==1);target.redo();CHECK(target.layer().id==pasted&&target.timeline_.state().frames.size()==2);
  }
  CHECK(source.timeline_.state().cels.front().surface->pixels==state.cels.front().surface->pixels);for(const auto& c:clip->cels)CHECK(c.surface->pixels==frozen);
 }
 static void imagePasteColorModes(){
  for(auto mode:{color_mode::Mode::Indexed,color_mode::Mode::Grayscale,color_mode::Mode::Rgba})for(auto precision:{color_mode::PixelFormat::Rgba32,color_mode::PixelFormat::Rgb565}){
   Document d(8,8);d.addLinkedFrame();const auto owner=d.layer().id;d.colorMode_=mode;d.pixelFormat_=precision;d.palette_.entries={{0,U"empty",0},{7,U"red",0xff1122cc},{8,U"blue",0xffcc2211}};d.palette_.setOrder({0,7,8});
   const RasterColorContext colors(d.palette_.entries,d.palette_.order(),mode,precision);SelectionClipboard clip;clip.width=3;clip.height=1;clip.pixels={0xff1122cc,0x00123456,0xffcc2211};clip.mask={1,1,0};const auto input=clip.pixels;const auto h=d.historyPosition();
   CHECK(d.pastePixelsAsNewLayer(clip,{2,3}));const auto pasted=d.layer().id;const auto& surface=d.activeSurface();const auto format=mode==color_mode::Mode::Indexed?RasterFormat::Indexed:RasterFormat::Rgba;
   CHECK(surface.format==format&&surface.width==3&&surface.height==1&&surface.offsetX==2&&surface.offsetY==3);const std::vector<Pixel> expected{colors.colorValue(format,input[0]),colors.colorValue(format,input[1]),0};CHECK(surface.pixels==expected);CHECK(clip.pixels==input&&d.historyPosition()==h+1);
   for(const auto& f:d.timeline_.state().frames)if(f.id!=d.frame().id){const auto resolved=d.timeline_.resolveSurface(d.timeline_.findCel(pasted,f.id)->id);CHECK(resolved.surface&&resolved.surface->format==format&&resolved.surface->pixels==std::vector<Pixel>{0});}
   d.undo();CHECK(d.layer().id==owner&&!d.timeline_.hasLayer(pasted));d.redo();CHECK(d.layer().id==pasted&&d.activeSurface().pixels==expected);
  }
 }
 static void layerPasteFrameInheritance(){
  for(Pixel value:{7u,0u,0xf0000000u})for(bool automatic:{false,true}){
   Document source(1,1);source.addLinkedFrame();source.addLinkedFrame();auto clip=source.copyLayerClipboard();CHECK(clip);
   Document target(1,1);auto state=target.timeline_.state();const auto layer=target.layer().id,owner=target.cel().id;
   state.layers.front().autoLinkAnimationCels=automatic;state.cels.front().surface->format=RasterFormat::Indexed;state.cels.front().surface->pixels={value};
   target.timeline_=Timeline(std::move(state));target.colorMode_=color_mode::Mode::Indexed;target.palette_.entries={{0,U"empty",0},{7,U"visible",0xffabcdef}};target.palette_.setOrder({0,7});target.projectActiveCelOpacities();
   CHECK(target.pasteLayerClipboard(*clip));CHECK(target.historySize()==1&&target.timeline_.state().frames.size()==3);
   for(std::size_t i=1;i<3;++i){const auto* slot=target.timeline_.findCel(layer,target.timeline_.state().frames[i].id);CHECK(slot);const auto resolved=target.timeline_.resolveSurface(slot->id);CHECK(resolved.surface&&resolved.surface->format==RasterFormat::Indexed);if(bool(slot->linkedCelId)!=(automatic&&value==7))throw std::runtime_error("inherit value="+std::to_string(value)+" automatic="+std::to_string(automatic)+" frame="+std::to_string(i));if(slot->linkedCelId)CHECK(resolved.source->id==owner);else CHECK(resolved.surface->pixels==std::vector<Pixel>{0});}
   target.undo();CHECK(target.timeline_.state().frames.size()==1&&target.timeline_.resolveSurface(owner).surface->pixels==std::vector<Pixel>{value});target.redo();CHECK(target.timeline_.state().frames.size()==3);
  }
 }
 static void indexedStyleSplit(){
  for(const std::string kind:{"shadow","stroke","smart","glow","overlay","gradient","map"}){
   Document d(8,8),reference(8,8);d.palette_.entries={{0,U"empty",0},{7,U"source",0xff203080},{8,U"effect",0xffe0c040}};d.palette_.setOrder({0,7,8});reference.palette_=d.palette_;
   const RasterColorContext colors(d.palette_.entries,d.palette_.order(),color_mode::Mode::Indexed);
   auto state=d.timeline_.state();auto& surface=*state.cels.front().surface;surface.width=surface.height=3;surface.offsetX=surface.offsetY=2;surface.format=RasterFormat::Indexed;surface.pixels={0,7,0,7,7,7,0,7,0};
   auto effect=*style(kind);effect.color=effect.stroke.color=effect.innerGlow.color=effect.shadow.color=0xffe0c040;
   if(kind=="gradient"){effect.gradientEnabled=true;effect.gradientFrom=0xff203080;effect.gradientTo=0xffe0c040;}
   state.layers.front().layerStyles=effect;state.frames.push_back({"linked-frame",100});auto alias=state.cels.front();alias.id="style-alias";alias.frameId="linked-frame";alias.linkedCelId=state.cels.front().id;alias.surface.reset();state.cels.push_back(alias);
   const auto owner=state.cels.front().id;auto expected=state;auto& rgba=*expected.cels.front().surface;rgba.format=RasterFormat::Rgba;for(auto& p:rgba.pixels)p=colors.rgba(RasterFormat::Indexed,p);expected.layers.front().layerStyles=colors.mappedStyle(effect);
   d.timeline_=Timeline(state);d.colorMode_=color_mode::Mode::Indexed;d.projectActiveCelOpacities();reference.timeline_=Timeline(std::move(expected));reference.activeLayerId_=d.activeLayerId_;reference.activeFrameId_=d.activeFrameId_;reference.projectActiveCelOpacities();
   CHECK(d.splitLayerStyles()&&reference.splitLayerStyles());CHECK(d.historySize()==1);CHECK(d.timeline_.state().layers.size()==reference.timeline_.state().layers.size());
   bool nonempty=false;
   for(std::size_t i=2;i<d.timeline_.state().cels.size();++i){const auto& actual=*d.timeline_.state().cels[i].surface;const auto& want=*reference.timeline_.state().cels[i].surface;CHECK(actual.format==RasterFormat::Indexed&&actual.width==want.width&&actual.height==want.height&&actual.offsetX==want.offsetX&&actual.offsetY==want.offsetY);for(std::size_t j=0;j<actual.pixels.size();++j){CHECK(actual.pixels[j]==colors.colorId(want.pixels[j]));nonempty|=actual.pixels[j]!=0;}}
   CHECK(nonempty);CHECK(d.timeline_.resolveSurface(owner).surface->pixels==state.cels.front().surface->pixels);CHECK(d.timeline_.findCelById("style-alias")->linkedCelId==std::optional<std::string>{owner});
   const auto after=d.timeline_.state();d.undo();CHECK(d.timeline_.state().layers.size()==1&&d.layer().layerStyles&&d.timeline_.resolveSurface(owner).surface->pixels==state.cels.front().surface->pixels);d.redo();CHECK(d.timeline_.state().cels.size()==after.cels.size());for(std::size_t i=2;i<after.cels.size();++i)CHECK(d.timeline_.state().cels[i].surface->pixels==after.cels[i].surface->pixels);
  }
 }
 static void mixedAntiAlias(){
  for(int mode:{0,1,2}){
   Document d(7,7);auto state=d.timeline_.state();auto& target=*state.cels.front().surface;
   target.pixels.assign(49,0);for(int i=1;i<6;++i)target.pixels[i*7+i]=0xff4040c0;
   auto layer=state.layers.front();layer.id="reference";state.layers.push_back(layer);
   auto cel=state.cels.front();cel.id="reference-cel";cel.layerId=layer.id;cel.surface->format=RasterFormat::Indexed;cel.surface->pixels.assign(49,7);state.cels.push_back(cel);
   d.palette_.entries={{0,U"transparent",0},{7,U"background",0xffc08040}};d.palette_.setOrder({0,7});
   d.timeline_=Timeline(state);d.projectActiveCelOpacities();
   CHECK(d.beginAntiAliasPreview());AntiAliasOptions options;options.colorSource=mode;
   auto mixed=d.captureAntiAliasSurfaceTask(options);CHECK(mixed);
   auto rgba=*mixed;auto reference=rgba.simulation.state();auto& surface=*reference.cels.back().surface;surface.format=RasterFormat::Rgba;surface.pixels.assign(49,0xffc08040);rgba.simulation=Timeline(std::move(reference));
   CHECK(Document::runAntiAliasSurfaceTask(*mixed,{}));CHECK(Document::runAntiAliasSurfaceTask(rgba,{}));CHECK(mixed->surfaces.produced==rgba.surfaces.produced);
   CHECK(mixed->surfaces.results.size()==rgba.surfaces.results.size());
   for(std::size_t i=0;i<mixed->surfaces.results.size();++i)CHECK(mixed->surfaces.results[i].pixels==rgba.surfaces.results[i].pixels);
   CHECK(mixed->surfaces.produced.front());
   d.palette_.entries[1].color=0xff112233;CHECK(!d.publishAntiAliasSurfaceTask(std::move(*mixed)));d.cancelColorAdjustment();
   CHECK(d.historySize()==0&&d.timeline_.state().cels.back().surface->pixels==std::vector<Pixel>(49,7));
   d.palette_.entries[1].color=0xffc08040;CHECK(d.beginAntiAliasPreview());auto commit=d.captureAntiAliasSurfaceTask(options);
   CHECK(commit&&Document::runAntiAliasSurfaceTask(*commit,{})&&d.publishAntiAliasSurfaceTask(std::move(*commit))&&d.commitAntiAliasAdjustment());
   CHECK(d.historySize()==1&&d.activeSurface().pixels==rgba.surfaces.results[0].pixels);
   const std::vector<Pixel> after=d.activeSurface().pixels;d.undo();CHECK(d.activeSurface().pixels==state.cels.front().surface->pixels);d.redo();CHECK(d.activeSurface().pixels==after);
   CHECK(d.timeline_.state().cels.back().surface->pixels==std::vector<Pixel>(49,7));
  }
 }

 static void wandReference(){
  Document d(5,1);auto state=d.timeline_.state();auto& source=*state.cels.front().surface;
  source.width=3;source.height=1;source.offsetX=1;source.format=RasterFormat::Indexed;source.pixels={7,8,0};
  d.timeline_=Timeline(std::move(state));d.palette_.entries={{0,U"zero",0xffabcdef},{7,U"a",0xff112233},{8,U"b",0xff112233}};
  const auto before=d.timeline_.resolveSurface(d.cel().id).surface->pixels;const auto h=d.historyPosition();
  const auto local=d.wandReferencePixels(false);CHECK(local==std::vector<Pixel>({0,0xff112233,0xff112233,0xffabcdef,0}));
  auto selection=magicWandSelection(local,5,1,1,0);CHECK(selectionContains(selection,1,0)&&selectionContains(selection,2,0)&&!selectionContains(selection,0,0)&&!selectionContains(selection,3,0));
  CHECK(d.wandReferencePixels(true)==local);
  CHECK(selectionFeedbackComposite(d,{0,0,5,1})==local);
  CHECK(brushFeedbackComposite(d,{0,0,5,1},{{1,0},{4,7}})==std::vector<Pixel>({0,0xffabcdef,0xff112233,0xffabcdef,0xff112233}));
  CHECK(brushFeedbackComposite(d,{1,0,2,1},{{1,0}})==std::vector<Pixel>({0xffabcdef,0xff112233}));
  d.palette_.entries[1].color=0xff445566;
  CHECK(selectionFeedbackComposite(d,{0,0,5,1})==std::vector<Pixel>({0,0xff445566,0xff112233,0xffabcdef,0}));
  CHECK(brushFeedbackComposite(d,{4,0,1,1},{{4,7}})==std::vector<Pixel>({0xff445566}));
  d.palette_.entries[1].color=0xff112233;
  const auto preview=freeTilePlacementComposite(d,{0,0,5,1},{0,0xff112233,0xff112233,0,0},{0,0,5,1});
  CHECK(preview==local);
  CHECK(freeTilePlacementComposite(d,{0,0,5,1},{0,0xff112233,0xff112233,0,0},{1,0,2,1})==std::vector<Pixel>({0xff112233,0xff112233}));
  CHECK(d.canvasPixels()==std::vector<Pixel>({0,7,8,0,0})&&d.historyPosition()==h&&d.timeline_.resolveSurface(d.cel().id).surface->pixels==before);
  auto denseState=d.timeline_.state();auto& dense=*denseState.cels.front().surface;
  dense.width=5;dense.offsetX=0;dense.pixels={7,7,8,0,7};d.timeline_=Timeline(std::move(denseState));d.colorMode_=color_mode::Mode::Indexed;d.palette_.setOrder({0,7,8});d.projectActiveCelOpacities();
  const std::vector<Pixel> denseBefore=d.timeline_.resolveSurface(d.cel().id).surface->pixels;
  const auto replacements=d.brushPreview({1,0},{1,0},0xffabcdef,{});
  const auto feedback=brushFeedbackComposite(d,{0,0,5,1},replacements);
  d.beginStroke({1,0},0xffabcdef);d.commitStroke();
  CHECK(selectionFeedbackComposite(d,{0,0,5,1})==feedback);
  d.undo();CHECK(d.timeline_.resolveSurface(d.cel().id).surface->pixels==denseBefore);
  CHECK(d.createAttachedMask(d.layer().id,d.frame().id));
  CHECK(d.selectAttachedMask(d.layer().id,d.frame().id,false));
  const auto maskPreview=d.brushPreview({1,0},{1,0},0xff000000,{});
  const auto masked=brushFeedbackComposite(d,{0,0,5,1},maskPreview);
  d.beginStroke({1,0},0xff000000);d.commitStroke();
  CHECK(selectionFeedbackComposite(d,{0,0,5,1})==masked);d.undo();
  CHECK(d.selectAttachedMask(d.layer().id,d.frame().id,true));
  const auto isolated=brushFeedbackComposite(d,{1,0,1,1},{{1,0xff000000}});
  CHECK(isolated==std::vector<Pixel>({0xff000000}));
 }
};}
int main(int argc,char** argv){try{RasterHistoryFixture::newLayerColorModes();RasterHistoryFixture::indexedBackgroundCreation();RasterHistoryFixture::indexedBackgroundResize();RasterHistoryFixture::wandReference();RasterHistoryFixture::mixedAntiAlias();RasterHistoryFixture::indexedStyleSplit();RasterHistoryFixture::layerPasteFrameInheritance();RasterHistoryFixture::imagePasteColorModes();RasterHistoryFixture::wholeLayerColorClipboard();
 CHECK(argc==2);std::ifstream in(argv[1]);CHECK(in.good());int count=0;in>>count;CHECK(count>=53);
 for(int n=0;n<count;++n){std::string name,groupStyle;int layerCount,group,groupMask,onion,link,paletteCount;in>>name>>layerCount>>group>>groupMask>>groupStyle>>onion>>link>>paletteCount;
  std::vector<Entry> palette(paletteCount);for(auto& e:palette)in>>e.id>>e.color;int orderCount;in>>orderCount;std::vector<int> order(orderCount);for(auto& id:order)in>>id;RasterColorContext colors(palette,order,color_mode::Mode::Indexed);
  State s;s.canvasWidth=5;s.canvasHeight=4;s.frames={{"a",100},{"b",100}};if(group){Group g;g.id="g";g.opacity=.65;g.panelOrder=0;g.layerStyles=style(groupStyle);s.groups.push_back(g);}
  for(int i=0;i<layerCount;++i){Layer l;Surface raster;std::string format,effect;int clip,hasMask;in>>l.id>>format>>raster.width>>raster.height>>raster.offsetX>>raster.offsetY>>l.opacity>>l.blendMode>>clip>>hasMask>>effect;l.clippingMask=clip;l.layerStyles=style(effect);if(group)l.groupId="g";raster.format=format=="indexed"?RasterFormat::Indexed:RasterFormat::Rgba;raster.pixels.resize(std::size_t(raster.width)*raster.height);for(auto& p:raster.pixels)in>>p;s.layers.push_back(l);
   for(const std::string f:{"a","b"}){Cel c;c.id=l.id+"-"+f;c.layerId=l.id;c.frameId=f;c.surface=raster;if(f=="b"&&onion)--c.surface->offsetX;if(f=="b"&&link)c.linkedCelId=l.id+"-a";s.cels.push_back(std::move(c));if(hasMask)s.masks.push_back({l.id,f,false,mask(l.id+"-mask-"+f)});}
  }
  if(groupMask)s.masks.push_back({"g","a",true,mask("gm")});CompositeRegion region;in>>region.x>>region.y>>region.width>>region.height;std::vector<Pixel> expected(std::size_t(region.width)*region.height);for(auto& p:expected)in>>p;CHECK(in.good());Timeline timeline(std::move(s));std::vector<Pixel> actual;
  if(onion){OnionSkinSettings settings;settings.enabled=settings.allLayers=true;settings.previousFrames=0;settings.nextFrames=1;actual=compositeOnionRegion(timeline,"a","top",region,settings,{},nullptr,0,nullptr,&colors);}else actual=compositeNormalRegion(timeline,link?"b":"a",region,{},nullptr,0,0,0,true,{},{},nullptr,nullptr,&colors);
  for(std::size_t i=0;i<expected.size();++i)if(actual[i]!=expected[i])throw std::runtime_error(name+" pixel "+std::to_string(i)+" expected "+std::to_string(expected[i])+" actual "+std::to_string(actual[i]));
 }
 int scans;in>>scans;CHECK(scans>=12);
 // Reuse one Timeline for equal-size cases across palette changes.
 std::optional<Timeline> retained;std::vector<Pixel> last;
 for(int n=0;n<scans;++n){int paletteCount;in>>paletteCount;std::vector<Entry> palette(paletteCount);for(auto& e:palette)in>>e.id>>e.color;int size;in>>size;std::vector<Pixel> values(size);for(auto& p:values)in>>p;int visible,selected;in>>visible>>selected;std::optional<SelectionMask> expected;if(selected){SelectionMask m;in>>m.x>>m.y>>m.width>>m.height;m.mask.resize(std::size_t(m.width)*m.height);for(auto& p:m.mask){int bit;in>>bit;p=bit;}expected=std::move(m);}
  if(!retained||values!=last){State s;s.layers={{"l",U"L"}};s.frames={{"f",100}};Cel c;c.id="c";c.layerId="l";c.frameId="f";c.surface=Surface{size,1,0,0,{},{},LinkedPixelStorage(values),RasterFormat::Indexed};s.cels.push_back(c);retained.emplace(std::move(s));last=values;}RasterColorContext colors(palette,{});CHECK(retained->hasVisiblePixels("c",colors)==bool(visible));const auto scansBefore=retained->contentScans();CHECK(retained->hasVisiblePixels("c",colors)==bool(visible)&&retained->contentScans()==scansBefore);CHECK(retained->isKnownEmpty("c",colors)==!visible);auto actual=retained->contentSelection("c",size,1,colors);CHECK(bool(actual)==bool(expected));if(actual){CHECK(actual->x==expected->x&&actual->y==expected->y&&actual->width==expected->width&&actual->height==expected->height);for(std::size_t i=0;i<expected->mask.size();++i)CHECK((actual->mask.empty()?1:actual->mask[i])==expected->mask[i]);}
 }
 // Raw uint32 IDs, explicit sharing and snapshot copies retain the format.
 {State s;s.layers={{"l",U"L"},{"r",U"R"}};s.layers[0].linkedContentId=s.layers[1].linkedContentId="shared";s.frames={{"f",100}};Cel c;c.id="c";c.layerId="l";c.frameId="f";c.surface=Surface{2,1,0,0,{},{},{7,0xffffffff},RasterFormat::Indexed};s.cels.push_back(c);c.id="d";c.layerId="r";s.cels.push_back(c);Timeline t(std::move(s));CHECK(t.resolveSurface("c").surface->pixels.identity()==t.resolveSurface("d").surface->pixels.identity());CHECK(t.resolveSurface("d").surface->format==RasterFormat::Indexed);t.setPixel("d",1,0x80000000);CHECK(t.resolveSurface("c").surface->pixels[1]==0x80000000);Timeline copy(t);CHECK(copy.resolveSurface("c").surface->pixels.identity()!=t.resolveSurface("c").surface->pixels.identity());RasterSnapshot snap(t.state());CHECK(snap.advance(t.state(),std::chrono::steady_clock::now()+std::chrono::seconds(1)));const auto captured=snap.take();CHECK(captured.cels[0].surface->format==RasterFormat::Indexed);CHECK(captured.cels[0].surface->pixels.identity()==captured.cels[1].surface->pixels.identity());}
 {State s;s.layers={{"l",U"L"},{"r",U"R"}};s.layers[0].linkedContentId=s.layers[1].linkedContentId="shared";s.frames={{"f",100}};Cel c;c.id="c";c.layerId="l";c.frameId="f";c.surface=Surface{1,1,0,0,{},{},{7},RasterFormat::Indexed};s.cels.push_back(c);c.id="d";c.layerId="r";c.surface->format=RasterFormat::Rgba;s.cels.push_back(c);Timeline t(std::move(s));CHECK(t.resolveSurface("c").surface->pixels.identity()!=t.resolveSurface("d").surface->pixels.identity());}
 {State s;s.layers={{"l",U"L"}};s.frames={{"f",100}};auto m=mask("m");m.surface.format=RasterFormat::Indexed;s.masks.push_back({"l","f",false,m});bool rejected=false;try{Timeline t(s);}catch(const std::invalid_argument&){rejected=true;}CHECK(rejected);}
 // Palette replacement changes rendered colors without changing stored IDs;
 // preview words already contain RGBA and must never be looked up as IDs.
 {State s;s.layers={{"l",U"L"}};s.frames={{"a",100},{"b",100}};Cel c;c.id="owner";c.layerId="l";c.frameId="a";c.surface=Surface{1,1,0,0,{},{},{7},RasterFormat::Indexed};s.cels.push_back(c);c.id="linked";c.frameId="b";c.surface.reset();c.linkedCelId="owner";s.cels.push_back(c);Timeline t(s);const std::vector<Entry> first{{0,0xff123456},{7,0xff0000ff}},second{{0,0xff123456},{7,0xff00ff00}};RasterColorContext a(first,{7},color_mode::Mode::Indexed),b(second,{7},color_mode::Mode::Indexed);auto render=[&](const RasterColorContext& colors,const std::vector<Pixel>* preview=nullptr){return compositeNormalRegion(t,"b",{0,0,2,1},"l",preview,1,0,0,true,{},{},nullptr,nullptr,&colors);};CHECK(render(a)==std::vector<Pixel>({0xff0000ff,0}));CHECK(render(b)==std::vector<Pixel>({0xff00ff00,0}));const std::vector<Pixel> preview{0xffabcdef};CHECK(render(a,&preview)==std::vector<Pixel>({0xffabcdef,0}));CHECK(t.resolveSurface("linked").surface->pixels[0]==7);}
 // The new low-level format cannot bypass the existing production edit gate.
 {State s;s.layers={{"l",U"L"}};s.frames={{"f",100}};Cel c;c.id="c";c.layerId="l";c.frameId="f";c.surface=Surface{1,1,0,0,{},{},{7},RasterFormat::Indexed};s.cels.push_back(c);bool rejected=false;try{auto d=Document::fromImported(1,1,s,PaletteState{},"id",U"indexed",std::make_shared<const std::vector<std::uint8_t>>(1));}catch(const std::invalid_argument&){rejected=true;}CHECK(rejected);}
 CHECK(in.good());std::cout<<count<<" actual legacy composites, "<<scans<<" content cases, indexed sharing/snapshot/mask boundaries passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
