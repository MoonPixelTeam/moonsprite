#define NOMINMAX
#include "document.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <roapi.h>
#ifdef GetObject
#undef GetObject
#endif
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
using namespace moon;
using namespace winrt::Windows::Data::Json;
namespace {
std::string context;
void check(bool value,const std::string& why){if(!value)throw std::runtime_error(context+": "+why);}
std::vector<Pixel> words(const JsonArray& array){std::vector<Pixel> out;for(const auto& value:array)out.push_back(Pixel(value.GetNumber()));return out;}
void equal(const Document& d,const JsonObject& row,const wchar_t* field){
 const auto expected=words(row.GetNamedArray(field)),actual=d.canvasPixels();
 if(actual!=expected){for(std::size_t i=0;i<actual.size();++i)if(actual[i]!=expected[i])throw std::runtime_error(context+": "+winrt::to_string(field)+" pixel "+std::to_string(i)+" expected "+std::to_string(expected[i])+" actual "+std::to_string(actual[i]));}
 const auto* surface=d.activeSurfaceIfPresent();check(surface&&surface->format==timeline::RasterFormat::Indexed,"lost indexed format");
}
std::optional<timeline::ColorOverlayStyle> style(const winrt::hstring& effect){if(effect==L"none")return {};timeline::ColorOverlayStyle s;if(effect==L"stroke"){s.stroke.enabled=true;s.stroke.color=0xff0000ff;}if(effect==L"shadow"){s.shadow.enabled=true;s.shadow.color=0xff0000ff;s.shadow.offsetX=1;s.shadow.offsetY=0;}if(effect==L"gradient"){s.gradientEnabled=true;s.gradientFrom=0xffff0000;s.gradientTo=0xff0000ff;}return s;}


}
namespace moon {struct RasterHistoryFixture {
 static void run(const JsonObject& row,bool linked=false){
  auto d=std::make_unique<Document>(int(row.GetNamedNumber(L"w")),int(row.GetNamedNumber(L"h")));auto state=d->timeline_.state();auto& s=*state.cels.front().surface;
  s.width=int(row.GetNamedNumber(L"sw"));s.height=int(row.GetNamedNumber(L"sh"));s.offsetX=int(row.GetNamedNumber(L"ox"));s.offsetY=int(row.GetNamedNumber(L"oy"));s.storageOriginX=5;s.storageOriginY=-3;s.format=timeline::RasterFormat::Indexed;s.pixels=words(row.GetNamedArray(L"initial"));
  state.layers.front().layerStyles=style(row.GetNamedString(L"effect"));if(row.GetNamedBoolean(L"group")){state.layers.front().groupId="fill-group";timeline::Group g;g.id="fill-group";g.opacity=.65;g.layerStyles=style(row.GetNamedString(L"groupEffect"));state.groups.push_back(std::move(g));}
  if(row.GetNamedBoolean(L"visible")){auto layer=state.layers.front();layer.id="top-visible";layer.groupId.reset();layer.layerStyles.reset();state.layers.push_back(layer);auto top=state.cels.front();top.id="top-visible-cel";top.layerId=layer.id;top.surface=timeline::Surface{};top.surface->width=d->width();top.surface->height=d->height();top.surface->format=timeline::RasterFormat::Indexed;top.surface->pixels.resize(std::size_t(d->width())*d->height());for(std::size_t i=0;i<top.surface->pixels.size();++i)top.surface->pixels[i]=i%d->width()==3?7:0;state.cels.push_back(std::move(top));}
  if(linked){auto l=state.layers.front();state.layers.front().linkedContentId="fill-shared";l.linkedContentId="fill-shared";auto copy=l;copy.id="linked-layer";state.layers.push_back(copy);auto alias=state.cels.front();alias.id="linked-cel";alias.layerId=copy.id;state.cels.push_back(alias);state.frames.push_back({"linked-frame",100});timeline::Cel c;c.id="linked-frame-cel";c.layerId=l.id;c.frameId="linked-frame";c.linkedCelId=state.cels.front().id;state.cels.push_back(c);}
  if(row.GetNamedBoolean(L"absent"))state.cels.clear();d->timeline_=timeline::Timeline(std::move(state));d->colorMode_=color_mode::Mode::Indexed;d->palette_.entries.clear();d->palette_.slots.clear();for(const auto& v:row.GetNamedArray(L"entries")){const auto e=v.GetObject();d->palette_.entries.push_back({int(e.GetNamedNumber(L"id")),U"color",Pixel(e.GetNamedNumber(L"color"))});}std::vector<int> order;for(auto v:words(row.GetNamedArray(L"order")))order.push_back(int(v));d->palette_.setOrder(std::move(order));d->projectActiveCelOpacities();
  if(row.GetNamedValue(L"selection").ValueType()!=JsonValueType::Null){const auto selection=row.GetNamedObject(L"selection");SelectionMask mask{int(selection.GetNamedNumber(L"x")),int(selection.GetNamedNumber(L"y")),int(selection.GetNamedNumber(L"width")),int(selection.GetNamedNumber(L"height")),{}};if(selection.HasKey(L"mask"))for(auto v:words(selection.GetNamedArray(L"mask")))mask.mask.push_back(std::uint8_t(v));d->previewSelection(mask);}
  d->symmetryAxes.horizontal=row.GetNamedBoolean(L"symmetric");d->markSaved();check(d->canvasPixels()==words(row.GetNamedArray(L"before")),"initial canvas");const auto initialCount=d->timeline_.state().cels.size();const auto rev=d->revision();
  const auto p=row.GetNamedArray(L"seed");Point seed{int(p.GetNumberAt(0)),int(p.GetNumberAt(1))};WandOptions options;options.tolerance=int(row.GetNamedNumber(L"tolerance"));options.connectivity=int(row.GetNamedNumber(L"connectivity"));options.contiguous=row.GetNamedBoolean(L"contiguous");options.gapThreshold=int(row.GetNamedNumber(L"gap"));options.gapClosing=options.gapThreshold>0;options.visibleLayers=row.GetNamedBoolean(L"visible");const auto color=Pixel(row.GetNamedNumber(L"color"));
  const auto variant=row.GetNamedObject(L"variant");const auto name=variant.GetNamedString(L"name");PatternFillOptions pattern;
  if(name==L"wood")pattern.texture=FillTexture::Wood;
  if(variant.HasKey(L"coverage")){PatternBrush b;b.width=int(variant.GetNamedNumber(L"width"));b.height=int(variant.GetNamedNumber(L"height"));b.intrinsicSize=variant.GetNamedBoolean(L"intrinsicSize");for(auto v:words(variant.GetNamedArray(L"coverage")))b.coverage.push_back(std::uint8_t(v));if(variant.HasKey(L"colors"))b.colors=words(variant.GetNamedArray(L"colors"));pattern.brushes.push_back(std::move(b));pattern.paintMode=PatternPaintMode::Source;}
  if(name==L"regular")pattern.mode=PatternMode::Regular;
  const bool result=row.GetNamedString(L"operation")==L"selection"?d->fillSelectionOrCanvas(color):name==L"solid"?d->fillPixels(seed,color,options):d->fillPatternPixels(seed,color,pattern,options);const auto expected=row.GetNamedBoolean(L"changed");check(result==expected,"change presence");
  if(expected)equal(*d,row,L"after");else check(d->canvasPixels()==words(row.GetNamedArray(L"after")),"no-op pixels");
  if(!expected){check(d->historySize()==0&&d->timeline_.state().cels.size()==initialCount&&d->revision()==rev,"no-op published history/cel/revision");return;}
  check(d->historySize()==1,"one fill history");equal(*d,row,L"after");const auto id=d->cel().id;const auto identity=d->activeSurfaceIfPresent()->pixels.identity();
  const auto verifyLinks=[&](const wchar_t* field){if(!linked)return;const auto& active=*d->activeSurfaceIfPresent();for(const auto& c:d->timeline_.state().cels){const auto r=d->timeline_.resolveSurface(c.id);check(r.surface&&r.surface->format==timeline::RasterFormat::Indexed&&r.surface->pixels.identity()==active.pixels.identity(),"linked storage/format");check(r.surface->width==active.width&&r.surface->height==active.height&&r.surface->storageOriginX==active.storageOriginX&&r.surface->storageOriginY==active.storageOriginY,"linked dimensions/origin");if(c.id=="linked-cel"){const auto g=row.GetNamedObject(field);check(r.surface->width==int(g.GetNamedNumber(L"width"))&&r.surface->height==int(g.GetNamedNumber(L"height"))&&r.surface->offsetX==int(g.GetNamedNumber(L"x"))&&r.surface->offsetY==int(g.GetNamedNumber(L"y"))&&r.surface->storageOriginX.value_or(0)==int(g.GetNamedNumber(L"originX"))&&r.surface->storageOriginY.value_or(0)==int(g.GetNamedNumber(L"originY")),"legacy linked placement/origin");}}};verifyLinks(L"linkedAfter");
  d->undo();equal(*d,row,L"undo");check(d->cel().id==id,"undo cel identity");verifyLinks(L"linkedUndo");d->redo();equal(*d,row,L"redo");verifyLinks(L"linkedRedo");(void)identity;
 }
};}
int run(int argc,wchar_t** argv){check(argc==2,"oracle path required");std::ifstream in(std::filesystem::path(argv[1]),std::ios::binary);check(bool(in),"missing oracle");const std::string bytes{std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>()};const auto data=JsonObject::Parse(winrt::to_hstring(bytes));const auto cases=data.GetNamedArray(L"cases");check(cases.Size()==1332,"oracle coverage");unsigned linkedCount=0;for(const auto& value:cases){const auto row=value.GetObject();context=winrt::to_string(row.GetNamedString(L"name"));RasterHistoryFixture::run(row);if(context.rfind("cropped-",0)==0||context.rfind("negative-",0)==0||context.rfind("placeholder-",0)==0){context="linked-"+context;RasterHistoryFixture::run(row,true);++linkedCount;}}for(unsigned i=0;i<480;i+=40){const auto row=cases.GetObjectAt(i);context="linked-"+winrt::to_string(row.GetNamedString(L"name"));RasterHistoryFixture::run(row,true);++linkedCount;}std::cout<<"1332 actual legacy fill transactions and "<<linkedCount<<" linked transactions passed\n";return 0;}
int wmain(int argc,wchar_t** argv){const auto hr=RoInitialize(RO_INIT_MULTITHREADED);try{check(SUCCEEDED(hr)||hr==RPC_E_CHANGED_MODE,"JSON apartment");const auto result=run(argc,argv);if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return result;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return 1;}}
