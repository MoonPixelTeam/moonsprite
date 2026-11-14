#define NOMINMAX
#include "document.h"
#include "document_snapshot.h"
#include "local_history_edit.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <roapi.h>
#ifdef GetObject
#undef GetObject
#endif
#include <fstream>
#include <filesystem>
#include <iostream>
#include <stdexcept>
using namespace moon;
using namespace winrt::Windows::Data::Json;
namespace {
std::string context;
void check(bool value,const char* text){if(!value)throw std::runtime_error(context+": "+text);}
std::vector<Pixel> words(const JsonArray& values){std::vector<Pixel> out;for(const auto& value:values)out.push_back(Pixel(value.GetNumber()));return out;}
const timeline::Surface& surface(const Document& d){return *d.timeline().resolveSurface(d.cel().id).surface;}
void pixels(const Document& d,const std::vector<Pixel>& expected){check(surface(d).format==timeline::RasterFormat::Indexed,"history lost indexed format");check(surface(d).pixels==expected,"legacy replay pixel mismatch");}
}
namespace moon {struct RasterHistoryFixture {
 static void install(Document& d,const JsonObject& row){
  auto state=d.timeline_.state();auto& s=*state.cels.front().surface;s.format=timeline::RasterFormat::Indexed;
  s.width=int(row.GetNamedNumber(L"width"));s.height=int(row.GetNamedNumber(L"height"));s.offsetX=int(row.GetNamedNumber(L"offsetX"));s.offsetY=int(row.GetNamedNumber(L"offsetY"));s.storageOriginX=int(row.GetNamedNumber(L"originX"));s.storageOriginY=int(row.GetNamedNumber(L"originY"));s.pixels=words(row.GetNamedArray(L"initial"));
  d.timeline_=timeline::Timeline(std::move(state));d.colorMode_=color_mode::Mode::Indexed;d.palette_.entries.clear();d.palette_.slots.clear();
  for(const auto& value:row.GetNamedArray(L"entries")){const auto entry=value.GetObject();d.palette_.entries.push_back({int(entry.GetNamedNumber(L"id")),U"color",Pixel(entry.GetNamedNumber(L"color"))});}
  std::vector<int> order;for(auto id:words(row.GetNamedArray(L"order")))order.push_back(int(id));d.palette_.setOrder(std::move(order));d.projectActiveCelOpacities();
 }
 static Document::Edit edit(Document& d,const JsonObject& row){
  Document::Edit e{{},d.state_,d.nextState_};e.contentHistory.targetCelId=d.cel().id;e.contentHistory.pixelAddress=Document::PixelAddressSpace{8,6,5,-3};
  for(const auto& value:row.GetNamedArray(L"points")){const auto p=value.GetObject();e.pixels.push_back({std::size_t(p.GetNamedNumber(L"index")),Pixel(p.GetNamedNumber(L"before")),Pixel(p.GetNamedNumber(L"after"))});}
  for(const auto& value:row.GetNamedArray(L"runs")){const auto r=value.GetObject();e.contentHistory.runs.push_back({std::size_t(r.GetNamedNumber(L"index")),std::size_t(r.GetNamedNumber(L"length")),Pixel(r.GetNamedNumber(L"before")),Pixel(r.GetNamedNumber(L"after"))});}
  const auto dense=row.GetNamedValue(L"dense");if(dense.ValueType()!=JsonValueType::Null){const auto r=dense.GetObject();e.contentHistory.dense=Document::DensePixels{int(r.GetNamedNumber(L"x")),int(r.GetNamedNumber(L"y")),int(r.GetNamedNumber(L"width")),int(r.GetNamedNumber(L"height")),words(r.GetNamedArray(L"before")),words(r.GetNamedArray(L"after"))};}
  e.layerHistory.targetLayerId=d.layer().id;e.layerHistory.beforeName=d.layer().name;e.layerHistory.afterName=U"indexed replay";return e;
 }
 static void replay(const JsonObject& row){
  auto document=std::make_unique<Document>(8,6);auto& d=*document;install(d,row);const auto beforeName=d.layer().name;const auto states=row.GetNamedArray(L"states");
  auto e=edit(d,row);d.applyEdit(e,true);d.pushEdit(std::move(e));pixels(d,words(states.GetArrayAt(0)));check(d.layer().name==U"indexed replay","metadata redo");
  d.undo();pixels(d,words(states.GetArrayAt(1)));check(d.layer().name==beforeName,"metadata undo");d.redo();pixels(d,words(states.GetArrayAt(2)));
  // A checkpoint retains raw IDs, origins, document mode and detached storage.
  DocumentSnapshot snapshot(d);while(!snapshot.advance(d,std::chrono::steady_clock::time_point::max())){}auto copied=std::make_unique<Document>(snapshot.finish());pixels(*copied,words(states.GetArrayAt(2)));check(copied->colorMode()==color_mode::Mode::Indexed&&!copied->historySize()&&surface(*copied).storageOriginX==surface(d).storageOriginX&&surface(*copied).pixels.identity()!=surface(d).pixels.identity(),"indexed checkpoint ownership");
  const auto checkpoint=d.captureRollbackPayload();d.applyEdit(edit(d,row),false);d.applyRollbackPayload(*checkpoint);pixels(d,words(states.GetArrayAt(2)));
 }
 static void failure(const JsonObject& row){
  for(bool forward:{false,true}){
   auto document=std::make_unique<Document>(8,6);auto& d=*document;install(d,row);const auto original=surface(d).pixels;const auto identity=surface(d).pixels.identity();const auto name=d.layer().name;const auto revision=d.revision(),position=d.historyPosition();
   Document::Edit root{{},d.state_,d.nextState_},bad{{},d.state_,d.nextState_};root.snapshotHistory.beforeDimensions=root.snapshotHistory.afterDimensions=std::pair<int,int>{8,6};bad.contentHistory.targetCelId=d.cel().id;bad.contentHistory.pixelAddress=Document::PixelAddressSpace{8,6,5,-3};bad.pixels={{48,0,7}};
   if(forward)root.children.push_back(edit(d,row));root.children.push_back(std::move(bad));if(!forward)root.children.push_back(edit(d,row));bool rejected=false;try{d.applyEdit(root,forward);}catch(const std::logic_error&){rejected=true;}
   check(rejected,"invalid sibling admitted");pixels(d,original);check(surface(d).pixels.identity()==identity&&d.layer().name==name&&d.revision()==revision&&d.historyPosition()==position,"failed history published changes");
  }
 }
 static void linked(const JsonObject& row){
  auto document=std::make_unique<Document>(8,6);auto& d=*document;install(d,row);auto state=d.timeline_.state();const auto owner=state.cels.front().id;auto second=state.layers.front();second.id="linked-layer";second.linkedContentId="shared-indexed";state.layers.front().linkedContentId=second.linkedContentId;state.layers.push_back(second);auto cel=state.cels.front();cel.id="shared-cel";cel.layerId=second.id;state.cels.push_back(cel);state.frames.push_back({"second-frame",100});
  for(const auto& layer:state.layers){timeline::Cel c;c.id="alias-"+layer.id;c.layerId=layer.id;c.frameId="second-frame";c.linkedCelId=layer.id==second.id?"shared-cel":owner;state.cels.push_back(std::move(c));}d.timeline_=timeline::Timeline(std::move(state));
  auto e=edit(d,row);d.applyEdit(e,true);d.pushEdit(std::move(e));const auto expected=words(row.GetNamedArray(L"states").GetArrayAt(0));
  const auto verify=[&](const std::vector<Pixel>& values){for(const auto& c:d.timeline_.state().cels){const auto resolved=d.timeline_.resolveSurface(c.id);check(resolved.surface&&resolved.surface->format==timeline::RasterFormat::Indexed&&resolved.surface->pixels==values,"linked history values");check(resolved.surface->pixels.identity()==surface(d).pixels.identity(),"linked history sharing");}};
  verify(expected);d.selectFrame("second-frame");d.undo();verify(words(row.GetNamedArray(L"states").GetArrayAt(1)));d.redo();verify(expected);
 }
};}
int run(int argc,wchar_t** argv){check(argc==2,"oracle path required");std::ifstream in(std::filesystem::path(argv[1]),std::ios::binary);check(bool(in),"missing oracle");const std::string data{std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>()};const auto rows=JsonArray::Parse(winrt::to_hstring(data));check(rows.Size()==48,"oracle coverage");for(const auto& value:rows){const auto row=value.GetObject();context=winrt::to_string(row.GetNamedString(L"name"));RasterHistoryFixture::replay(row);RasterHistoryFixture::failure(row);RasterHistoryFixture::linked(row);}std::cout<<"48 legacy indexed replay/checkpoint/link cases and 96 failure compensations passed\n";return 0;}
int wmain(int argc,wchar_t** argv){const auto hr=RoInitialize(RO_INIT_MULTITHREADED);try{check(SUCCEEDED(hr)||hr==RPC_E_CHANGED_MODE,"JSON apartment");const auto result=run(argc,argv);if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return result;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return 1;}}
