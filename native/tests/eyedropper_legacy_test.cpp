#define NOMINMAX
#include "eyedropper_model.h"
#include "indexed_color_adjustment.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <roapi.h>
#ifdef GetObject
#undef GetObject
#endif
#include <filesystem>
#include <fstream>
#include <iostream>
using namespace moon;
using namespace winrt::Windows::Data::Json;
namespace {
std::string context;
void check(bool ok,const std::string& why){if(!ok)throw std::runtime_error(context+": "+why);}
std::vector<Pixel> words(const JsonArray& a){std::vector<Pixel> out;for(auto v:a)out.push_back(Pixel(v.GetNumber()));return out;}
void equal(const std::vector<Pixel>& actual,const JsonArray& expected,const std::string& why){const auto wanted=words(expected);if(actual==wanted)return;for(std::size_t i=0;i<std::min(actual.size(),wanted.size());++i)if(actual[i]!=wanted[i])check(false,why+" pixel "+std::to_string(i)+" got "+std::to_string(actual[i])+" wanted "+std::to_string(wanted[i]));check(false,why+" length");}
int number(const JsonObject& o,const wchar_t* key){return int(o.GetNamedNumber(key));}
CompositeRegion region(const JsonObject& o){const auto r=o.GetNamedObject(L"region");return {number(r,L"x"),number(r,L"y"),number(r,L"width"),number(r,L"height")};}
timeline::Surface surface(const JsonObject& row){timeline::Surface s;s.width=number(row,L"sw");s.height=number(row,L"sh");s.offsetX=number(row,L"ox");s.offsetY=number(row,L"oy");s.storageOriginX=71;s.storageOriginY=-37;s.pixels=words(row.GetNamedArray(L"initial"));return s;}
}
namespace moon {struct RasterHistoryFixture {
 static std::unique_ptr<Document> make(const JsonObject& row,bool linked){
  auto d=std::make_unique<Document>(number(row,L"w"),number(row,L"h"));auto state=d->timeline_.state();auto& l=state.layers.front();auto s=surface(row);const auto format=row.GetNamedString(L"format");s.format=format==L"rgba"?timeline::RasterFormat::Rgba:timeline::RasterFormat::Indexed;state.cels.front().surface=std::move(s);
  const int a=number(row,L"appearance");
  if(a==1){l.visible=false;l.locked=true;}
  if(a==2){l.opacity=.5;state.cels.front().opacity=.5;l.blendMode="multiply";}
  if(a==3||a==4){timeline::ColorOverlayStyle style;if(a==3){style.stroke.enabled=true;style.stroke.color=0xffff0000;}else{style.shadow.enabled=true;style.shadow.color=0xff0000ff;style.shadow.offsetX=1;style.shadow.offsetY=0;}l.layerStyles=style;}
  if(a==5){timeline::MaskSlot slot;slot.ownerId=l.id;slot.frameId=state.frames.front().id;slot.mask.id="sample-mask";auto& m=slot.mask.surface;m.width=3;m.height=3;m.offsetX=1;m.offsetY=1;m.pixels=words(row.GetNamedArray(L"mask"));state.masks.push_back(std::move(slot));}
  if(a==7){timeline::Group g;g.id="sample-group";g.name=U"group";g.opacity=.5;l.groupId=g.id;state.groups.push_back(g);}
  if(a==9)l.background=timeline::BackgroundSettings{};
  if(a>=6){timeline::Layer peer;peer.id="sample-peer";peer.name=U"peer";if(a==8)peer.background=timeline::BackgroundSettings{};state.layers.push_back(peer);timeline::Cel cel;cel.id="sample-peer-cel";cel.layerId=peer.id;cel.frameId=state.frames.front().id;timeline::Surface ps;ps.width=d->width();ps.height=d->height();const auto p=row.GetNamedObject(L"peer");ps.format=p.GetNamedString(L"format")==L"indexed"?timeline::RasterFormat::Indexed:timeline::RasterFormat::Rgba;ps.pixels=words(p.GetNamedArray(L"initial"));cel.surface=std::move(ps);state.cels.push_back(std::move(cel));}
  if(linked){auto alias=state.cels.front();state.frames.push_back({"alias-frame",100});alias.id="sample-alias";alias.frameId="alias-frame";alias.surface.reset();alias.linkedCelId=state.cels.front().id;state.cels.push_back(std::move(alias));d->activeFrameId_="alias-frame";for(std::size_t i=1;i<state.cels.size()-1;++i){auto c=state.cels[i];c.id+="-alias";c.frameId="alias-frame";c.surface.reset();c.linkedCelId=state.cels[i].id;state.cels.push_back(std::move(c));break;}for(const auto& m:std::vector<timeline::MaskSlot>(state.masks)){auto aliasMask=m;aliasMask.frameId="alias-frame";aliasMask.mask.id+="-alias";state.masks.push_back(std::move(aliasMask));}}
  d->timeline_=timeline::Timeline(std::move(state));d->colorMode_=format==L"rgba"?color_mode::Mode::Rgba:color_mode::Mode::Indexed;d->palette_.entries.clear();d->palette_.slots.clear();for(auto v:row.GetNamedArray(L"entries")){const auto e=v.GetObject();d->palette_.entries.push_back({number(e,L"id"),U"sample",Pixel(e.GetNamedNumber(L"color"))});}std::vector<int> order;for(auto v:words(row.GetNamedArray(L"order")))order.push_back(int(v));d->palette_.setOrder(std::move(order));d->projectActiveCelOpacities();d->markSaved();return d;
 }
 static void run(const JsonObject& row,bool linked){
  auto d=make(row,linked);const auto before=d->timeline_.state();const auto pal=d->palette_;const auto revision=d->revision(),content=d->contentRevision(),history=d->historySize();const auto r=region(row);
  std::vector<Pixel> current,visible;for(int y=0;y<r.height;++y)for(int x=0;x<r.width;++x){current.push_back(sampleEyedropper(*d,r.x+x,r.y+y,EyedropperSource::CurrentLayer));visible.push_back(sampleEyedropper(*d,r.x+x,r.y+y));}
  equal(current,row.GetNamedArray(L"current"),"current point");equal(visible,row.GetNamedArray(L"visible"),"composite point");equal(renderEyedropperRegion(*d,r,EyedropperSource::CurrentLayer),row.GetNamedArray(L"currentRegion"),"current region");equal(renderEyedropperRegion(*d,r),row.GetNamedArray(L"compositeRegion"),"composite region");
  if(row.HasKey(L"preview")){
   check(d->beginColorAdjustment(),"begin sample preview");ColorAdjustment a;a.brightness=15;a.contrast=10;check(d->updateColorAdjustment(a),"update sample preview");const auto expected=row.GetNamedObject(L"preview");current.clear();visible.clear();
   for(int y=0;y<r.height;++y)for(int x=0;x<r.width;++x){current.push_back(sampleEyedropper(*d,r.x+x,r.y+y,EyedropperSource::CurrentLayer));visible.push_back(sampleEyedropper(*d,r.x+x,r.y+y));}
   equal(current,expected.GetNamedArray(L"current"),"preview current point");equal(visible,expected.GetNamedArray(L"visible"),"preview composite point");equal(renderEyedropperRegion(*d,r,EyedropperSource::CurrentLayer),expected.GetNamedArray(L"currentRegion"),"preview current region");equal(renderEyedropperRegion(*d,r),expected.GetNamedArray(L"compositeRegion"),"preview composite region");d->cancelColorAdjustment();
  }
  check(d->revision()==revision&&d->contentRevision()==content&&d->historySize()==history&&!d->dirty()&&indexed_adjustment::samePaletteData(pal,d->palette_),"sampling mutated document");check(d->timeline_.state().cels.size()==before.cels.size(),"sampling created cel");for(std::size_t i=0;i<before.cels.size();++i){const auto& a=before.cels[i];const auto& b=d->timeline_.state().cels[i];check(a.id==b.id&&a.linkedCelId==b.linkedCelId&&a.surface.has_value()==b.surface.has_value(),"cel identity");if(a.surface){const auto& x=*a.surface;const auto& y=*b.surface;check(x.pixels==y.pixels&&x.width==y.width&&x.height==y.height&&x.offsetX==y.offsetX&&x.offsetY==y.offsetY&&x.storageOriginX==y.storageOriginX&&x.storageOriginY==y.storageOriginY&&x.format==y.format,"surface changed");}}
 }
 static void mask(const JsonObject& row){
  Document d(number(row,L"w"),number(row,L"h"));auto state=d.timeline_.state();const bool group=row.GetNamedBoolean(L"group");timeline::MaskSlot slot;slot.ownerId=state.layers.front().id;slot.frameId=state.frames.front().id;slot.group=group;slot.mask.id="active-mask";slot.mask.surface=surface(row);if(group){timeline::Group g;g.id="masked-group";g.name=U"group";state.layers.front().groupId=g.id;state.groups.push_back(g);slot.ownerId=g.id;}const auto owner=slot.ownerId;state.masks.push_back(std::move(slot));d.timeline_=timeline::Timeline(std::move(state));check(d.selectAttachedMask(owner,d.frame().id),"select mask");d.markSaved();const auto baseline=d.activeMask()->surface.pixels;const auto pal=d.palette_;const auto history=d.historySize(),revision=d.revision();const auto r=region(row);
  for(auto source:{EyedropperSource::CurrentLayer,EyedropperSource::Composite}){std::vector<Pixel> point;for(int y=0;y<r.height;++y)for(int x=0;x<r.width;++x)point.push_back(sampleEyedropper(d,r.x+x,r.y+y,source));equal(point,row.GetNamedArray(L"point"),"mask point");equal(renderEyedropperRegion(d,r,source),row.GetNamedArray(L"pixels"),"mask region");}
  check(d.activeMask()->surface.pixels==baseline&&indexed_adjustment::samePaletteData(pal,d.palette_)&&d.historySize()==history&&d.revision()==revision&&!d.dirty(),"mask sampling mutation");
 }
};}
int run(int argc,wchar_t** argv){check(argc==2,"oracle path");std::ifstream in(std::filesystem::path(argv[1]),std::ios::binary);check(bool(in),"missing oracle");const std::string bytes{std::istreambuf_iterator<char>(in),{}};const auto data=JsonObject::Parse(winrt::to_hstring(bytes));const auto rows=data.GetNamedArray(L"cases");check(rows.Size()==840,"oracle coverage");unsigned links=0;for(unsigned i=0;i<rows.Size();++i){const auto row=rows.GetObjectAt(i);context=winrt::to_string(row.GetNamedString(L"name"));RasterHistoryFixture::run(row,false);if(i%7==0){RasterHistoryFixture::run(row,true);++links;}}const auto masks=data.GetNamedArray(L"masks");check(masks.Size()==6,"mask coverage");for(auto v:masks){context="mask";RasterHistoryFixture::mask(v.GetObject());}std::cout<<rows.Size()<<" legacy eyedropper cases, "<<links<<" linked variants and 6 masks passed\n";return 0;}
int wmain(int argc,wchar_t** argv){const auto hr=RoInitialize(RO_INIT_MULTITHREADED);try{const auto result=run(argc,argv);if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return result;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return 1;}}
