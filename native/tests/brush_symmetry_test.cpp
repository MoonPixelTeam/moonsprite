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
using namespace moon;
using namespace winrt::Windows::Data::Json;
namespace {
std::string context;
void check(bool ok,const std::string& why){if(!ok)throw std::runtime_error(context+": "+why);}
std::vector<Pixel> words(const JsonArray& a){std::vector<Pixel> result;for(auto v:a)result.push_back(Pixel(v.GetNumber()));return result;}
void equal(const std::vector<Pixel>& actual,const JsonArray& expected,const std::string& why){const auto wanted=words(expected);if(actual==wanted)return;for(std::size_t i=0;i<std::min(actual.size(),wanted.size());++i)if(actual[i]!=wanted[i])check(false,why+" pixel "+std::to_string(i)+" got "+std::to_string(actual[i])+" wanted "+std::to_string(wanted[i]));check(false,why+" length");}
Point point(const JsonArray& a){return {int(a.GetNumberAt(0)),int(a.GetNumberAt(1))};}
BrushOptions brush(const JsonObject& row,bool perfect){BrushOptions b;const auto v=row.GetNamedObject(L"variant");b.size=int(v.GetNamedNumber(L"size"));b.shape=v.GetNamedString(L"shape")==L"round"?BrushShape::Round:v.GetNamedString(L"shape")==L"line"?BrushShape::Line:BrushShape::Square;b.opacity=int(row.GetNamedNumber(L"opacity"));b.perfectPixels=perfect;b.dither=row.GetNamedBoolean(L"dither");return b;}
std::optional<PatternBrush> image(const JsonObject& row){const auto v=row.GetNamedObject(L"variant");if(!v.HasKey(L"coverage"))return {};PatternBrush b;b.width=int(v.GetNamedNumber(L"width"));b.height=int(v.GetNamedNumber(L"height"));b.intrinsicSize=v.GetNamedBoolean(L"intrinsicSize");for(auto x:words(v.GetNamedArray(L"coverage")))b.coverage.push_back(std::uint8_t(x));if(v.HasKey(L"colors"))b.colors=words(v.GetNamedArray(L"colors"));return b;}
}
namespace moon {struct RasterHistoryFixture {
 static std::unique_ptr<Document> make(const JsonObject& row,bool linked){
  auto d=std::make_unique<Document>(int(row.GetNamedNumber(L"w")),int(row.GetNamedNumber(L"h")));auto state=d->timeline_.state();auto& s=*state.cels.front().surface;
  s.format=row.GetNamedString(L"format")==L"indexed"?timeline::RasterFormat::Indexed:timeline::RasterFormat::Rgba;s.width=int(row.GetNamedNumber(L"sw"));s.height=int(row.GetNamedNumber(L"sh"));s.offsetX=int(row.GetNamedNumber(L"ox"));s.offsetY=int(row.GetNamedNumber(L"oy"));s.storageOriginX=5;s.storageOriginY=-3;s.pixels=words(row.GetNamedArray(L"initial"));
  if(linked){auto layer=state.layers.front();layer.id="peer";layer.linkedContentId="brush-symmetry";state.layers.front().linkedContentId=layer.linkedContentId;state.layers.push_back(layer);auto cel=state.cels.front();cel.id="peer-cel";cel.layerId=layer.id;state.cels.push_back(cel);state.frames.push_back({"alias-frame",100});for(unsigned i=0;i<2;++i){timeline::Cel alias;alias.id="alias-"+std::to_string(i);alias.layerId=state.layers[i].id;alias.frameId="alias-frame";alias.linkedCelId=state.cels[i].id;state.cels.push_back(alias);}}
  d->timeline_=timeline::Timeline(std::move(state));d->colorMode_=row.GetNamedString(L"format")==L"indexed"?color_mode::Mode::Indexed:color_mode::Mode::Rgba;d->palette_.entries.clear();d->palette_.slots.clear();
  for(auto v:row.GetNamedArray(L"entries")){auto e=v.GetObject();d->palette_.entries.push_back({int(e.GetNamedNumber(L"id")),U"color",Pixel(e.GetNamedNumber(L"color"))});}
  std::vector<int> order;for(auto x:words(row.GetNamedArray(L"order")))order.push_back(int(x));d->palette_.setOrder(std::move(order));d->projectActiveCelOpacities();
  if(row.GetNamedValue(L"selection").ValueType()==JsonValueType::Object){auto v=row.GetNamedObject(L"selection");SelectionMask selection{int(v.GetNamedNumber(L"x")),int(v.GetNamedNumber(L"y")),int(v.GetNamedNumber(L"width")),int(v.GetNamedNumber(L"height")),{}};for(auto x:words(v.GetNamedArray(L"mask")))selection.mask.push_back(std::uint8_t(x));d->previewSelection(selection);}
  const int axes=int(row.GetNamedNumber(L"axes"));d->symmetryAxes={bool(axes&1),bool(axes&2),bool(axes&4),bool(axes&8),bool(axes&16)};auto center=row.GetNamedObject(L"center");d->setImportedSymmetryCenter({center.GetNamedNumber(L"x"),center.GetNamedNumber(L"y")});d->markSaved();return d;
 }
 static void verify(const Document& d,const JsonObject& row,const JsonObject& expected,const wchar_t* field,bool linked){
  equal(d.canvasPixels(),expected.GetNamedArray(field),winrt::to_string(field));const auto& s=*d.activeSurfaceIfPresent();const bool indexed=row.GetNamedString(L"format")==L"indexed";check(s.format==(indexed?timeline::RasterFormat::Indexed:timeline::RasterFormat::Rgba),"format lost");
  check(s.storageOriginX.value_or(0)-s.offsetX==5-int(row.GetNamedNumber(L"ox"))&&s.storageOriginY.value_or(0)-s.offsetY==-3-int(row.GetNamedNumber(L"oy")),"storage mapping");
  if(linked)for(const auto& c:d.timeline_.state().cels){const auto r=d.timeline_.resolveSurface(c.id);check(r.surface&&r.surface->pixels.identity()==s.pixels.identity()&&r.surface->format==s.format,"shared owner");}
 }
 static void run(const JsonObject& row,bool dynamic,bool perfect,bool linked=false){
  auto d=make(row,linked);equal(d->canvasPixels(),row.GetNamedArray(L"before"),"fixture");const auto img=image(row);auto b=brush(row,perfect);b.ink=InkMode(int(row.GetNamedNumber(L"ink")));const auto* stamp=img?&*img:nullptr;const auto color=Pixel(row.GetNamedNumber(L"color"));const auto path=row.GetNamedArray(L"path");const auto expected=row.GetNamedObject(perfect?L"perfect":L"ordinary");const auto count=d->timeline_.state().cels.size();
  if(!perfect&&!dynamic&&!linked){const auto rev=d->revision(),history=d->historySize();const auto identity=d->activeSurfaceIfPresent()->pixels.identity();auto preview=d->canvasPixels();for(const auto& [i,p]:d->brushPreview(point(path.GetArrayAt(0)),point(path.GetArrayAt(2)),color,b,stamp))preview.at(i)=p;equal(preview,row.GetNamedArray(L"preview"),"brush preview");check(d->revision()==rev&&d->historySize()==history&&d->activeSurfaceIfPresent()->pixels.identity()==identity,"preview mutated document");}
  auto paint=[&]{for(unsigned i=0;i<path.Size();++i){const auto p=point(path.GetArrayAt(i));if(!i){d->beginStroke(p,color,b,stamp,0,nullptr,!dynamic);if(dynamic)d->configureStrokeDynamics(b,stamp,0,0,0);}if(dynamic)d->updateDynamicStroke(p,{p.x,p.y,b.size,b.opacity,0,{}},!i);else if(i)d->updateStroke(p);equal(d->canvasPixels(),expected.GetNamedArray(L"states").GetArrayAt(i),"live step "+std::to_string(i));check(d->historySize()==0&&d->timeline_.state().cels.size()==count,"live published history/Cel");}};
  paint();d->cancelStroke();verify(*d,row,expected,L"cancel",linked);check(d->historySize()==0&&!d->dirty(),"cancel history/dirty");d=make(row,linked);paint();check(d->commitStroke()==expected.GetNamedBoolean(L"changed"),"commit result");verify(*d,row,expected,L"after",linked);
  if(expected.GetNamedBoolean(L"changed")){check(d->historySize()==1,"single history");d->undo();verify(*d,row,expected,L"undo",linked);d->redo();verify(*d,row,expected,L"redo",linked);}else check(d->historySize()==0,"no-op history");
 }
};}
int run(int argc,wchar_t** argv){check(argc==2,"oracle path");std::ifstream in(std::filesystem::path(argv[1]),std::ios::binary);check(bool(in),"missing oracle");const std::string bytes{std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>()};const auto cases=JsonObject::Parse(winrt::to_hstring(bytes)).GetNamedArray(L"cases");check(cases.Size()==4032,"coverage");unsigned links=0;for(unsigned i=0;i<cases.Size();++i){const auto row=cases.GetObjectAt(i);for(bool dynamic:{false,true})for(bool perfect:{false,true}){context=winrt::to_string(row.GetNamedString(L"name"))+" dynamic="+std::to_string(dynamic)+" perfect="+std::to_string(perfect);RasterHistoryFixture::run(row,dynamic,perfect);}if(i%37==0){context="linked-"+winrt::to_string(row.GetNamedString(L"name"));RasterHistoryFixture::run(row,true,true,true);++links;}}std::cout<<cases.Size()<<" actual legacy symmetry cases in four stroke paths and "<<links<<" linked transactions passed\n";return 0;}
int wmain(int argc,wchar_t** argv){const auto hr=RoInitialize(RO_INIT_MULTITHREADED);try{check(SUCCEEDED(hr)||hr==RPC_E_CHANGED_MODE,"JSON apartment");const int result=run(argc,argv);if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return result;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return 1;}}
