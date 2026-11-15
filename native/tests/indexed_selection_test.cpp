#define NOMINMAX
#include "document.h"
#include "raster_color_context.h"
#include "project_encode.h"
#include "project_import.h"
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
std::vector<Pixel> words(const JsonArray& a){std::vector<Pixel> out;for(const auto& v:a)out.push_back(Pixel(v.GetNumber()));return out;}
void sameWords(const std::vector<Pixel>& actual,const std::vector<Pixel>& expected,const std::string& why){check(actual.size()==expected.size(),why+" size");for(std::size_t i=0;i<actual.size();++i)if(actual[i]!=expected[i])throw std::runtime_error(context+": "+why+" pixel "+std::to_string(i)+" expected "+std::to_string(expected[i])+" actual "+std::to_string(actual[i]));}
SelectionMask selection(const JsonObject& v){SelectionMask s{int(v.GetNamedNumber(L"x")),int(v.GetNamedNumber(L"y")),int(v.GetNamedNumber(L"width")),int(v.GetNamedNumber(L"height")),{}};if(v.HasKey(L"mask")&&v.GetNamedValue(L"mask").ValueType()==JsonValueType::Array)for(auto p:words(v.GetNamedArray(L"mask")))s.mask.push_back(std::uint8_t(p));return s;}
void clipboard(const std::optional<SelectionClipboard>& actual,const IJsonValue& expected,const std::string& why){const bool present=expected.ValueType()!=JsonValueType::Null;check(bool(actual)==present,why+" presence");if(!present)return;const auto e=expected.GetObject();check(!actual->opaqueIds,"external clipboard retained IDs");check(actual->width==int(e.GetNamedNumber(L"width"))&&actual->height==int(e.GetNamedNumber(L"height"))&&actual->originX==int(e.GetNamedNumber(L"originX"))&&actual->originY==int(e.GetNamedNumber(L"originY")),why+" bounds");sameWords(actual->pixels,words(e.GetNamedArray(L"pixels")),why);const auto mask=words(e.GetNamedArray(L"mask"));check(std::vector<Pixel>(actual->mask.begin(),actual->mask.end())==mask,why+" mask");}
void geometry(const timeline::Surface& s,const JsonObject& g,const std::string& label){check(s.width==int(g.GetNamedNumber(L"width"))&&s.height==int(g.GetNamedNumber(L"height"))&&s.offsetX==int(g.GetNamedNumber(L"x"))&&s.offsetY==int(g.GetNamedNumber(L"y"))&&s.storageOriginX.value_or(0)==int(g.GetNamedNumber(L"originX"))&&s.storageOriginY.value_or(0)==int(g.GetNamedNumber(L"originY")),label+" geometry/origin");}
void canvas(const Document& d,const JsonObject& state,const std::string& label){sameWords(d.canvasPixels(),words(state.GetNamedArray(L"pixels")),label);if(const auto* surface=d.activeSurfaceIfPresent())check(surface->format==timeline::RasterFormat::Indexed,"lost indexed format");}
void encoded(const Document& d){
 const auto history=d.historySize(),revision=d.revision();const auto pixels=d.canvasPixels();std::unordered_set<int> ids;bool duplicate=false;for(const auto& e:d.palette().entries)duplicate|=!ids.insert(e.id).second;
 if(duplicate){for(int kind=0;kind<3;++kind){bool rejected=false;try{if(kind==0)project::encodeEditableProject(d);else if(kind==1)project::encodeRecoveryProject(d);else project::encodeHistoryProject(d);}catch(const project::Error& e){rejected=e.kind==project::ErrorKind::Corrupt;}check(rejected,"duplicate palette accepted by encoder");}return;}
 for(int kind=0;kind<3;++kind){const auto out=kind==0?project::encodeEditableProject(d):kind==1?project::encodeRecoveryProject(d):project::encodeHistoryProject(d);const auto manifest=project::readProjectManifest(out.bytes);project::Archive zip(out.bytes);check(manifest.colorMode=="indexed","encoding format");
  for(const auto& c:manifest.cels){const auto runtime=d.timeline().resolveSurface(c.id).surface;check(runtime&&c.surface&&c.surface->format==project::RasterFormat::Indexed,"encoded Cel format");const auto& s=*c.surface;check(s.width==runtime->width&&s.height==runtime->height&&s.offsetX==runtime->offsetX&&s.offsetY==runtime->offsetY,"encoded geometry");sameWords(project::decodeRaster(zip.read(s.dataFile,project::Limits{}.expandedBytes),s.dataEncoding,s.format,s.width,s.height,project::Limits{}.expandedBytes),runtime->pixels,"encoded raw IDs");}
  bool gated=false;try{project::prepareEditableImport(manifest);}catch(const project::Error& e){gated=e.kind==project::ErrorKind::Unsupported;}check(gated,"indexed production admission opened");
 }
 check(d.historySize()==history&&d.revision()==revision&&d.canvasPixels()==pixels,"encoder modified document");
}
}
namespace moon {struct RasterHistoryFixture {
 static std::unique_ptr<Document> make(const JsonObject& row,bool linked=false){
  auto d=std::make_unique<Document>(int(row.GetNamedNumber(L"w")),int(row.GetNamedNumber(L"h")));auto state=d->timeline_.state();auto& s=*state.cels.front().surface;s.width=int(row.GetNamedNumber(L"sw"));s.height=int(row.GetNamedNumber(L"sh"));s.offsetX=int(row.GetNamedNumber(L"ox"));s.offsetY=int(row.GetNamedNumber(L"oy"));s.storageOriginX=5;s.storageOriginY=-3;s.format=timeline::RasterFormat::Indexed;s.pixels=words(row.GetNamedArray(L"initial"));
  if(linked){state.layers.front().linkedContentId="selection-shared";auto copy=state.layers.front();copy.id="linked-layer";state.layers.push_back(copy);auto alias=state.cels.front();alias.id="linked-cel";alias.layerId=copy.id;state.cels.push_back(alias);state.frames.push_back({"linked-frame",100});timeline::Cel c;c.id="linked-frame-cel";c.layerId=state.layers.front().id;c.frameId="linked-frame";c.linkedCelId=state.cels.front().id;state.cels.push_back(c);}
  d->timeline_=timeline::Timeline(std::move(state));d->colorMode_=color_mode::Mode::Indexed;d->palette_.entries.clear();d->palette_.slots.clear();for(const auto& v:row.GetNamedArray(L"entries")){const auto e=v.GetObject();d->palette_.entries.push_back({int(e.GetNamedNumber(L"id")),U"color",Pixel(e.GetNamedNumber(L"color"))});}std::vector<int> order;for(auto v:words(row.GetNamedArray(L"order")))order.push_back(int(v));d->palette_.setOrder(std::move(order));d->palette_.nextId=100;d->projectActiveCelOpacities();d->previewSelection(selection(row.GetNamedObject(L"selection")));d->markSaved();return d;
 }
 static void run(const JsonObject& row,bool linked=false,bool absent=false){
  auto d=make(row,linked);if(absent){auto state=d->timeline_.state();state.cels.clear();d->timeline_=timeline::Timeline(std::move(state));}canvas(*d,row.GetNamedObject(L"before"),"before");clipboard(d->copyPixels(),row.GetNamedValue(L"copied"),"direct copy");if(!linked)clipboard(d->copyMergedPixels(),row.GetNamedValue(L"merged"),"merged copy");if(!absent)geometry(d->activeSurface(),row.GetNamedObject(L"before").GetNamedObject(L"geometry"),"before");const auto before=d->canvasPixels();const auto rev=d->revision();const auto selected=d->selection();const auto kind=row.GetNamedString(L"kind");const bool floating=kind==L"move"||kind==L"paste";
  auto begin=[&]{
   if(kind==L"paste"){const auto c=row.GetNamedObject(L"clip");SelectionClipboard clip;clip.width=int(c.GetNamedNumber(L"width"));clip.height=int(c.GetNamedNumber(L"height"));clip.pixels=words(c.GetNamedArray(L"pixels"));for(auto p:words(c.GetNamedArray(L"mask")))clip.mask.push_back(std::uint8_t(p));check(d->beginFloatingPaste(clip,0,1),"begin paste");}
   else check(d->beginSelectionContentMove(row.GetNamedBoolean(L"copy")),"begin lift");
   // Exercise the existing deferred branch on the same compact oracle input;
   // large cases also enter it through the production eligibility threshold.
   if(row.GetNamedBoolean(L"deferred")&&!d->floating_->deferred){
    auto pending=*d->floating_;d->cancelFloatingPaste();pending.deferred=true;pending.sparse=false;pending.source.capturedOpaqueIds.reset();pending.source.capturedOpaquePixels=false;
    for(auto& t:pending.targets){t.source.capturedOpaqueIds.reset();t.source.capturedOpaquePixels=false;t.preview.clear();t.baseline.reset();t.ownerId=d->timeline_.resolveSurface(t.celId).source->id;}
    d->floating_=std::move(pending);
   }
   d->setFloatingRepeat(repeat::mode(winrt::to_string(row.GetNamedString(L"repeat"))));const auto v=row.GetNamedObject(L"target");SelectionTransform t{v.GetNamedNumber(L"x"),v.GetNamedNumber(L"y"),v.GetNamedNumber(L"width"),v.GetNamedNumber(L"height"),row.GetNamedNumber(L"angle")};t.flipHorizontal=v.HasKey(L"flipHorizontal")&&v.GetNamedBoolean(L"flipHorizontal");if(row.GetNamedValue(L"updatedEntries").ValueType()==JsonValueType::Array){d->transformFloatingPaste(t,row.GetNamedBoolean(L"opt"));for(const auto& v:row.GetNamedArray(L"updatedEntries")){auto e=v.GetObject();for(auto& item:d->palette_.entries)if(item.id==int(e.GetNamedNumber(L"id")))item.color=Pixel(e.GetNamedNumber(L"color"));}}
   d->transformFloatingPaste(t,row.GetNamedBoolean(L"opt"));
  };
  if(floating){begin();if(d->floatingDeferred())sameWords(d->floatingOverlayRegion({0,0,d->width(),d->height()}),words(row.GetNamedObject(L"live").GetNamedArray(L"display")),"deferred display");else canvas(*d,row.GetNamedObject(L"live"),"live");clipboard(d->copyPixels(),row.GetNamedValue(L"floatingCopy"),"floating copy");check(d->historySize()==0&&d->revision()==rev,"preview published history/revision");d->cancelFloatingPaste();sameWords(d->canvasPixels(),before,"cancel");if(!absent)geometry(d->activeSurface(),row.GetNamedObject(L"before").GetNamedObject(L"geometry"),"cancel");else check(!d->activeSurfaceIfPresent(),"cancel created Cel");check(selectionEqual(d->selection(),selected)&&d->historySize()==0,"cancel selection/history");if(row.GetNamedValue(L"updatedEntries").ValueType()==JsonValueType::Array){d->palette_.entries=make(row)->palette_.entries;}begin();d->commitFloatingPaste();}
  else if(kind==L"cut"){std::optional<SelectionClipboard> cut;d->cutPixels(cut);clipboard(cut,row.GetNamedValue(L"copied"),"cut");check(!d->selection(),"cut selection");}
  else if(kind==L"delete")d->deleteSelectedPixels();
  else if(kind==L"flip")d->flipContent(true);
  else if(kind==L"rotate")d->rotateContent(90);
  canvas(*d,row.GetNamedObject(L"after"),"after");if(!absent)geometry(d->activeSurface(),row.GetNamedObject(L"after").GetNamedObject(L"geometry"),"after");
  const bool changed=row.GetNamedBoolean(L"changed");const bool selectionHistory=(floating||kind==L"flip")&&!selectionEqual(selected,d->selection());check(d->historySize()==unsigned(changed||selectionHistory),"single pixel/selection history entry");const bool codec=linked||absent||d->width()==40;if(codec)encoded(*d);if(changed){d->undo();canvas(*d,row.GetNamedObject(L"undo"),"undo");if(!absent)geometry(d->activeSurface(),row.GetNamedObject(L"undo").GetNamedObject(L"geometry"),"undo");if(codec)encoded(*d);d->redo();canvas(*d,row.GetNamedObject(L"redo"),"redo");if(!absent)geometry(d->activeSurface(),row.GetNamedObject(L"redo").GetNamedObject(L"geometry"),"redo");if(codec)encoded(*d);}
  if(linked){const auto& s=d->activeSurface();for(const auto& c:d->timeline_.state().cels){const auto r=d->timeline_.resolveSurface(c.id);check(r.surface&&r.surface->format==timeline::RasterFormat::Indexed&&r.surface->pixels.identity()==s.pixels.identity(),"linked identity/format");}}
 }
};}
int run(int argc,wchar_t** argv){check(argc==2,"oracle path");std::ifstream in(std::filesystem::path(argv[1]),std::ios::binary);const std::string bytes{std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>()};const auto rows=JsonObject::Parse(winrt::to_hstring(bytes)).GetNamedArray(L"cases");check(rows.Size()==931,"oracle coverage");unsigned linked=0,absent=0;for(unsigned i=0;i<rows.Size();++i){auto row=rows.GetObjectAt(i);context=winrt::to_string(row.GetNamedString(L"name"));RasterHistoryFixture::run(row);if(i%37==0){context="linked-"+context;RasterHistoryFixture::run(row,true);++linked;}if(row.GetNamedBoolean(L"blank")){context="absent-"+context;RasterHistoryFixture::run(row,false,true);++absent;}}std::cout<<rows.Size()<<" actual legacy indexed selection transactions and "<<linked<<" linked and "<<absent<<" absent Cel checks passed\n";return 0;}
int wmain(int argc,wchar_t** argv){const auto hr=RoInitialize(RO_INIT_MULTITHREADED);try{const auto result=run(argc,argv);if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return result;}catch(const std::exception& e){std::cerr<<context<<": "<<e.what()<<'\n';if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return 1;}}
