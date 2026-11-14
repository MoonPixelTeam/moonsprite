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
BrushOptions brush(const JsonObject& row){BrushOptions b;b.shape=BrushShape::Square;b.opacity=int(row.GetNamedNumber(L"opacity"));b.ink=InkMode(int(row.GetNamedNumber(L"ink")));b.size=int(row.GetNamedObject(L"variant").GetNamedNumber(L"size"));return b;}
std::optional<PatternBrush> image(const JsonObject& row){
 const auto v=row.GetNamedObject(L"variant");if(!v.HasKey(L"coverage"))return {};
 PatternBrush b;b.width=int(v.GetNamedNumber(L"width"));b.height=int(v.GetNamedNumber(L"height"));b.intrinsicSize=v.GetNamedBoolean(L"intrinsicSize");for(auto value:words(v.GetNamedArray(L"coverage")))b.coverage.push_back(std::uint8_t(value));if(v.HasKey(L"colors"))b.colors=words(v.GetNamedArray(L"colors"));return b;
}
void ordinary(Document& d,const JsonObject& row){
 const auto b=brush(row);const auto img=image(row);const auto* ptr=img?&*img:nullptr;const auto color=Pixel(row.GetNamedNumber(L"color"));
 const auto revision=d.revision(),position=d.historyPosition();const auto identity=d.activeSurfaceIfPresent()->pixels.identity();
 auto expected=words(row.GetNamedArray(L"initial"));const auto preview=d.brushPreview({1,2},{3,2},color,b,ptr);for(const auto& [index,value]:preview)expected.at(index)=value;
 check(expected==words(row.GetNamedArray(L"previewAfter")),"preview differs from legacy");check(d.revision()==revision&&d.historyPosition()==position&&d.activeSurfaceIfPresent()->pixels.identity()==identity,"preview changed document");
 const auto paint=[&]{bool first=true;for(const auto& item:row.GetNamedArray(L"path")){const auto p=item.GetArray();Point point{int(p.GetNumberAt(0)),int(p.GetNumberAt(1))};if(first){d.beginStroke(point,color,b,ptr);first=false;}else d.updateStroke(point);}};
 paint();equal(d,row,L"after");check(d.historyPosition()==position,"uncommitted history");d.cancelStroke();equal(d,row,L"cancel");check(d.historyPosition()==position,"cancel history");
 // Cancel can normalize hidden IDs; install a fresh fixture for commit checks.
}
}
namespace moon {struct RasterHistoryFixture {
 static void install(Document& d,const JsonObject& row){
  auto state=d.timeline_.state();auto& s=*state.cels.front().surface;s.format=timeline::RasterFormat::Indexed;s.pixels=words(row.GetNamedArray(L"initial"));if(row.HasKey(L"width")){s.width=int(row.GetNamedNumber(L"width"));s.height=int(row.GetNamedNumber(L"height"));s.offsetX=int(row.GetNamedNumber(L"offsetX"));s.offsetY=int(row.GetNamedNumber(L"offsetY"));s.storageOriginX=int(row.GetNamedNumber(L"originX"));s.storageOriginY=int(row.GetNamedNumber(L"originY"));}d.timeline_=timeline::Timeline(std::move(state));d.colorMode_=color_mode::Mode::Indexed;d.palette_.entries.clear();d.palette_.slots.clear();
  for(const auto& item:row.GetNamedArray(L"entries")){const auto e=item.GetObject();d.palette_.entries.push_back({int(e.GetNamedNumber(L"id")),U"color",Pixel(e.GetNamedNumber(L"color"))});}
  std::vector<int> order;for(auto value:words(row.GetNamedArray(L"order")))order.push_back(int(value));d.palette_.setOrder(std::move(order));d.projectActiveCelOpacities();
 }
 static void run(const JsonObject& row){
  auto d=std::make_unique<Document>(8,6);install(*d,row);ordinary(*d,row);d=std::make_unique<Document>(8,6);install(*d,row);
  const auto b=brush(row);const auto img=image(row);bool first=true;for(const auto& item:row.GetNamedArray(L"path")){const auto p=item.GetArray();Point point{int(p.GetNumberAt(0)),int(p.GetNumberAt(1))};if(first){d->beginStroke(point,Pixel(row.GetNamedNumber(L"color")),b,img?&*img:nullptr);first=false;}else d->updateStroke(point);}
  check(d->commitStroke()==row.GetNamedBoolean(L"changed"),"commit presence differs from legacy");equal(*d,row,L"after");if(row.GetNamedBoolean(L"changed")){check(d->historySize()==1,"stroke must have one history entry");d->undo();equal(*d,row,L"undo");d->redo();equal(*d,row,L"redo");}
 }
 static void dynamic(const JsonObject& row){
  auto d=std::make_unique<Document>(8,6);install(*d,row);BrushOptions b;b.shape=BrushShape::Square;b.ink=InkMode(int(row.GetNamedNumber(L"ink")));std::optional<PatternBrush> img;if(row.GetNamedString(L"imageKind")==L"colored"){img.emplace();img->width=img->height=1;img->coverage={255};img->colors={0x800000ff};}
  std::unordered_map<std::size_t,Pixel> baseline;if(row.GetNamedValue(L"baseline").ValueType()!=JsonValueType::Null){const auto values=words(row.GetNamedArray(L"baseline"));for(std::size_t i=0;i<values.size();++i)baseline[i]=values[i];}
  const auto paint=[&]{d->beginStroke({2,2},0xff0000ff,b,img?&*img:nullptr,0,baseline.empty()?nullptr:&baseline,false);d->configureStrokeDynamics(b,img?&*img:nullptr,Pixel(row.GetNamedNumber(L"start")),Pixel(row.GetNamedNumber(L"end")),0);bool first=true;for(const auto& value:row.GetNamedArray(L"samples")){const auto p=value.GetObject();Point point{int(p.GetNamedNumber(L"x")),int(p.GetNamedNumber(L"y"))};d->updateDynamicStroke(point,{point.x,point.y,1,int(p.GetNamedNumber(L"opacity")),0,p.GetNamedNumber(L"t")},first);first=false;}};
  paint();equal(*d,row,L"after");d->cancelStroke();equal(*d,row,L"cancel");d=std::make_unique<Document>(8,6);install(*d,row);paint();check(d->commitStroke()==row.GetNamedBoolean(L"changed"),"dynamic commit presence");if(row.GetNamedBoolean(L"changed")){d->undo();equal(*d,row,L"undo");d->redo();equal(*d,row,L"redo");}
 }
 static void perfect(const JsonObject& row){
  auto d=std::make_unique<Document>(8,6);install(*d,row);BrushOptions b;b.shape=BrushShape::Square;b.perfectPixels=true;b.ink=InkMode(int(row.GetNamedNumber(L"ink")));b.opacity=int(row.GetNamedNumber(L"opacity"));std::optional<PatternBrush> img;if(row.GetNamedBoolean(L"colored")){img.emplace();img->width=img->height=1;img->coverage={255};img->colors={0x800000ff};}
  const auto paint=[&](bool dynamic){bool first=true;unsigned step=0;for(const auto& value:row.GetNamedArray(L"path")){const auto p=value.GetArray();Point point{int(p.GetNumberAt(0)),int(p.GetNumberAt(1))};if(first){d->beginStroke(point,Pixel(row.GetNamedNumber(L"color")),b,img?&*img:nullptr,0,nullptr,!dynamic);if(dynamic)d->configureStrokeDynamics(b,img?&*img:nullptr,0,0,0);}if(dynamic)d->updateDynamicStroke(point,{point.x,point.y,1,b.opacity,0,{}},first);else if(!first)d->updateStroke(point);first=false;const auto expected=words(row.GetNamedArray(L"states").GetArrayAt(step++));check(d->canvasPixels()==expected,"perfect live tail differs from legacy at step "+std::to_string(step));}};
  for(bool dynamic:{false,true}){d=std::make_unique<Document>(8,6);install(*d,row);paint(dynamic);d->cancelStroke();equal(*d,row,L"cancel");d=std::make_unique<Document>(8,6);install(*d,row);paint(dynamic);check(d->commitStroke()==row.GetNamedBoolean(L"changed"),"perfect commit presence");equal(*d,row,L"after");if(row.GetNamedBoolean(L"changed")){d->undo();equal(*d,row,L"undo");d->redo();equal(*d,row,L"redo");}}
 }
 static void aligned(const JsonObject& row){
  auto d=std::make_unique<Document>(8,6);BrushOptions b;b.shape=BrushShape::Square;b.ink=InkMode(int(row.GetNamedNumber(L"ink")));b.opacity=int(row.GetNamedNumber(L"opacity"));
  const auto paint=[&](bool dynamic){d->beginStroke({1,2},Pixel(row.GetNamedNumber(L"color")),b,nullptr,0,nullptr,false);if(dynamic)d->configureStrokeDynamics(b,nullptr,0,0,0);unsigned step=0;for(const auto& value:row.GetNamedArray(L"paths")){std::vector<BrushPathPoint> path;for(const auto& p:value.GetArray()){const auto xy=p.GetArray();path.push_back({int(xy.GetNumberAt(0)),int(xy.GetNumberAt(1)),1,b.opacity});}d->paintAlignedStrokePath(path,true);check(d->canvasPixels()==words(row.GetNamedArray(L"states").GetArrayAt(step++)),"aligned live reset differs from legacy");}};
  for(bool dynamic:{false,true}){d=std::make_unique<Document>(8,6);install(*d,row);paint(dynamic);d->cancelStroke();equal(*d,row,L"cancel");d=std::make_unique<Document>(8,6);install(*d,row);paint(dynamic);check(d->commitStroke()==row.GetNamedBoolean(L"changed"),"aligned commit presence");equal(*d,row,L"after");if(row.GetNamedBoolean(L"changed")){d->undo();equal(*d,row,L"undo");d->redo();equal(*d,row,L"redo");}}
 }
 static void linked(const JsonObject& row){
  auto d=std::make_unique<Document>(8,6);install(*d,row);auto state=d->timeline_.state();const auto owner=state.cels.front().id;auto layer=state.layers.front();layer.id="linked-layer";layer.linkedContentId="indexed-brush-link";state.layers.front().linkedContentId=layer.linkedContentId;state.layers.push_back(layer);auto cel=state.cels.front();cel.id="shared-cel";cel.layerId=layer.id;state.cels.push_back(cel);state.frames.push_back({"linked-frame",100});for(const auto& l:state.layers){timeline::Cel c;c.id="alias-"+l.id;c.layerId=l.id;c.frameId="linked-frame";c.linkedCelId=l.id==layer.id?"shared-cel":owner;state.cels.push_back(std::move(c));}d->timeline_=timeline::Timeline(std::move(state));d->selectFrame("linked-frame");
  const auto b=brush(row);const auto img=image(row);const auto paint=[&]{bool first=true;for(const auto& value:row.GetNamedArray(L"path")){auto p=value.GetArray();Point point{int(p.GetNumberAt(0)),int(p.GetNumberAt(1))};if(first){d->beginStroke(point,Pixel(row.GetNamedNumber(L"color")),b,img?&*img:nullptr);first=false;}else d->updateStroke(point);}};
  const auto verify=[&](const wchar_t* field){const auto expected=words(row.GetNamedArray(field));const auto identity=d->activeSurfaceIfPresent()->pixels.identity();for(const auto& c:d->timeline_.state().cels){const auto r=d->timeline_.resolveSurface(c.id);check(r.surface&&r.surface->format==timeline::RasterFormat::Indexed&&r.surface->pixels==expected,"linked brush pixels");check(r.surface->pixels.identity()==identity,"linked brush storage");}};
  paint();check(d->commitStroke()==row.GetNamedBoolean(L"changed"),"linked commit presence");verify(L"after");if(row.GetNamedBoolean(L"changed")){d->undo();verify(L"undo");d->redo();verify(L"redo");}
 }
 static void geometry(const JsonObject& row){
  auto d=std::make_unique<Document>(8,6);const bool absent=row.GetNamedString(L"kind")==L"absent";const auto b=brush(row);const auto img=image(row);const auto color=Pixel(row.GetNamedNumber(L"color"));
  const auto setup=[&]{d=std::make_unique<Document>(8,6);install(*d,row);auto state=d->timeline_.state();if(absent)state.cels.clear();else{auto& s=*state.cels.front().surface;s.width=int(row.GetNamedNumber(L"width"));s.height=int(row.GetNamedNumber(L"height"));s.offsetX=int(row.GetNamedNumber(L"offsetX"));s.offsetY=int(row.GetNamedNumber(L"offsetY"));s.storageOriginX=int(row.GetNamedNumber(L"originX"));s.storageOriginY=int(row.GetNamedNumber(L"originY"));}d->timeline_=timeline::Timeline(std::move(state));d->markSaved();};
  const auto paint=[&]{bool first=true;for(const auto& value:row.GetNamedArray(L"path")){const auto p=value.GetArray();Point point{int(p.GetNumberAt(0)),int(p.GetNumberAt(1))};if(first){d->beginStroke(point,color,b,img?&*img:nullptr);first=false;}else d->updateStroke(point);}};
  setup();const auto rev=d->revision(),count=d->timeline_.state().cels.size();const auto before=words(row.GetNamedArray(L"before"));auto preview=before;for(const auto& [i,v]:d->brushPreview({1,2},{3,2},color,b,img?&*img:nullptr))preview.at(i)=v;check(d->canvasPixels()==before&&d->revision()==rev&&d->timeline_.state().cels.size()==count,"sparse preview published state");paint();check(d->historySize()==0&&d->timeline_.state().cels.size()==count,"sparse live stroke created cel/history");d->cancelStroke();check(d->canvasPixels()==words(row.GetNamedArray(L"cancel")),"sparse cancel pixels");check(d->timeline_.state().cels.size()==count&&d->historySize()==0&&!d->dirty(),"sparse cancel published cel/history/dirty");
  setup();paint();check(d->commitStroke()==row.GetNamedBoolean(L"changed"),"sparse commit presence");check(d->canvasPixels()==words(row.GetNamedArray(L"after")),"sparse commit pixels");if(!row.GetNamedBoolean(L"changed")){check(d->timeline_.state().cels.size()==count&&d->historySize()==0,"empty sparse commit created cel");return;}
  const auto verify=[&](const wchar_t* field){equal(*d,row,field);const auto& s=*d->activeSurfaceIfPresent();if(!absent)check(s.storageOriginX.value_or(0)-s.offsetX==int(row.GetNamedNumber(L"originX")-row.GetNamedNumber(L"offsetX"))&&s.storageOriginY.value_or(0)-s.offsetY==int(row.GetNamedNumber(L"originY")-row.GetNamedNumber(L"offsetY")),"expanded brush storage origin");};
  check(d->historySize()==1&&d->timeline_.state().cels.size()==count+(absent?1:0),"sparse single commit");verify(L"after");const auto id=d->cel().id;d->undo();verify(L"undo");check(d->cel().id==id,"sparse undo cel identity");d->redo();verify(L"redo");
 }
};}
int run(int argc,wchar_t** argv){check(argc==2,"oracle path required");std::ifstream in(std::filesystem::path(argv[1]),std::ios::binary);check(bool(in),"missing oracle");const std::string bytes{std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>()};const auto data=JsonObject::Parse(winrt::to_hstring(bytes));const auto cases=data.GetNamedArray(L"cases"),dynamic=data.GetNamedArray(L"dynamic"),perfect=data.GetNamedArray(L"perfect"),aligned=data.GetNamedArray(L"aligned"),geometry=data.GetNamedArray(L"geometry");check(cases.Size()==1200&&dynamic.Size()==24&&perfect.Size()==96&&aligned.Size()==48&&geometry.Size()==108,"oracle coverage");for(const auto& value:cases){const auto row=value.GetObject();context=winrt::to_string(row.GetNamedString(L"name"));RasterHistoryFixture::run(row);}for(const auto& value:dynamic){const auto row=value.GetObject();context=winrt::to_string(row.GetNamedString(L"name"));RasterHistoryFixture::dynamic(row);}for(const auto& value:perfect){const auto row=value.GetObject();context=winrt::to_string(row.GetNamedString(L"name"));RasterHistoryFixture::perfect(row);}for(const auto& value:aligned){const auto row=value.GetObject();context=winrt::to_string(row.GetNamedString(L"name"));RasterHistoryFixture::aligned(row);}for(unsigned i=75;i<1200;i+=100){const auto row=cases.GetObjectAt(i);context="linked-"+winrt::to_string(row.GetNamedString(L"name"));RasterHistoryFixture::linked(row);}for(const auto& value:geometry){const auto row=value.GetObject();context=winrt::to_string(row.GetNamedString(L"name"));RasterHistoryFixture::geometry(row);}std::cout<<"1200 actual legacy brush transactions, 24 dynamic/baseline crossings, 96 ordinary/dynamic perfect tails, 48 aligned replays and 12 link transactions and 108 sparse/offset cases passed\n";return 0;}
int wmain(int argc,wchar_t** argv){const auto hr=RoInitialize(RO_INIT_MULTITHREADED);try{check(SUCCEEDED(hr)||hr==RPC_E_CHANGED_MODE,"JSON apartment");const auto result=run(argc,argv);if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return result;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return 1;}}
