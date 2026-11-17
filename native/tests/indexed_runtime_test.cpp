#include "layer_compositor.h"
#include "raster_snapshot.h"
#include "document.h"
#include "free_tile_selection_target.h"
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
 static void wandReference(){
  Document d(5,1);auto state=d.timeline_.state();auto& source=*state.cels.front().surface;
  source.width=3;source.height=1;source.offsetX=1;source.format=RasterFormat::Indexed;source.pixels={7,8,0};
  d.timeline_=Timeline(std::move(state));d.palette_.entries={{0,U"zero",0xffabcdef},{7,U"a",0xff112233},{8,U"b",0xff112233}};
  const auto before=d.timeline_.resolveSurface(d.cel().id).surface->pixels;const auto h=d.historyPosition();
  const auto local=d.wandReferencePixels(false);CHECK(local==std::vector<Pixel>({0,0xff112233,0xff112233,0xffabcdef,0}));
  auto selection=magicWandSelection(local,5,1,1,0);CHECK(selectionContains(selection,1,0)&&selectionContains(selection,2,0)&&!selectionContains(selection,0,0)&&!selectionContains(selection,3,0));
  CHECK(d.wandReferencePixels(true)==local);
  const auto preview=freeTilePlacementComposite(d,{0,0,5,1},{0,0xff112233,0xff112233,0,0},{0,0,5,1});
  CHECK(preview==local);
  CHECK(freeTilePlacementComposite(d,{0,0,5,1},{0,0xff112233,0xff112233,0,0},{1,0,2,1})==std::vector<Pixel>({0xff112233,0xff112233}));
  CHECK(d.canvasPixels()==std::vector<Pixel>({0,7,8,0,0})&&d.historyPosition()==h&&d.timeline_.resolveSurface(d.cel().id).surface->pixels==before);
 }
};}
int main(int argc,char** argv){try{RasterHistoryFixture::wandReference();
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
