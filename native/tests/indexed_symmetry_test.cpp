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

 static void run(const JsonObject& row,bool deferred=false,bool linked=false){
  auto d=make(row,linked);const auto a=row.GetNamedObject(L"axes");d->symmetryAxes={a.GetNamedBoolean(L"horizontal"),a.GetNamedBoolean(L"vertical"),a.GetNamedBoolean(L"diagonalUp"),a.GetNamedBoolean(L"diagonalDown"),a.GetNamedBoolean(L"rotational")};const auto c=row.GetNamedObject(L"center");d->setImportedSymmetryCenter({c.GetNamedNumber(L"x"),c.GetNamedNumber(L"y")});
  d->setDeferredFloatingDisplaySupported(deferred);canvas(*d,row.GetNamedObject(L"before"),"before");geometry(d->activeSurface(),row.GetNamedObject(L"before").GetNamedObject(L"geometry"),"before");const auto before=d->canvasPixels();const auto rev=d->revision();const auto selected=d->selection();const auto kind=winrt::to_string(row.GetNamedString(L"kind"));const bool translation=kind=="translation",scale=kind=="scale"||kind=="flip",shear=kind.rfind("shear",0)==0,opt=row.GetNamedBoolean(L"opt");
  const auto p=row.GetNamedObject(L"start");const Point start{int(p.GetNamedNumber(L"x")),int(p.GetNamedNumber(L"y"))};
  auto equalSelection=[&](const std::optional<SelectionMask>& actual,const IJsonValue& expected,const std::string& label){if(expected.ValueType()==JsonValueType::Null){check(!actual,label+" absent");return;}auto e=selection(expected.GetObject());check(bool(actual),label+" present");check(actual->x==e.x&&actual->y==e.y&&actual->width==e.width&&actual->height==e.height,label+" bounds");for(int y=e.y;y<e.y+e.height;++y)for(int x=e.x;x<e.x+e.width;++x)check(selectionContains(actual,x,y)==selectionContains(e,x,y),label+" mask");};
  auto restorePalette=[&]{d->palette_.entries=make(row)->palette_.entries;};
  auto begin=[&]{
   check(d->beginSelectionContentMove(row.GetNamedBoolean(L"copy"),false,0,0,start,translation,scale,!translation&&!scale&&!shear,shear),"begin symmetry lift");
   if(deferred&&row.GetNamedBoolean(L"large"))check(d->floatingDeferred(),"production large deferred eligibility");
   // Compact inputs exercise the same deferred adapter; large inputs above use
   // the actual production size threshold, with no synthetic branch forcing.
   if(deferred&&!d->floating_->deferred){auto pending=*d->floating_;d->cancelFloatingPaste();pending.deferred=true;pending.sparse=false;pending.source.capturedOpaqueIds.reset();pending.source.capturedOpaquePixels=false;for(auto& t:pending.targets){t.source.capturedOpaqueIds.reset();t.source.capturedOpaquePixels=false;t.preview.clear();t.baseline.reset();t.ownerId=d->timeline_.resolveSurface(t.celId).source->id;}d->floating_=std::move(pending);}
   const auto v=row.GetNamedObject(L"target");SelectionTransform t{v.GetNamedNumber(L"x"),v.GetNamedNumber(L"y"),v.GetNamedNumber(L"width"),v.GetNamedNumber(L"height"),row.GetNamedNumber(L"angle")};t.flipHorizontal=v.HasKey(L"flipHorizontal")&&v.GetNamedBoolean(L"flipHorizontal");t.flipVertical=v.HasKey(L"flipVertical")&&v.GetNamedBoolean(L"flipVertical");
   if(translation){const auto delta=row.GetNamedObject(L"delta"),expected=row.GetNamedObject(L"mapped");const auto mapped=d->symmetryContentDragDelta({int(delta.GetNamedNumber(L"x")),int(delta.GetNamedNumber(L"y"))});check(mapped.x==int(expected.GetNamedNumber(L"x"))&&mapped.y==int(expected.GetNamedNumber(L"y")),"pressed drag delta");}
   if(shear){const auto s=row.GetNamedObject(L"shearStart"),p=row.GetNamedObject(L"pointer"),pivot=row.GetNamedObject(L"pivot");SelectionTransform initial{s.GetNamedNumber(L"x"),s.GetNamedNumber(L"y"),s.GetNamedNumber(L"width"),s.GetNamedNumber(L"height"),s.GetNamedNumber(L"angle")};t=shearSelectionTransform(initial,{p.GetNamedNumber(L"x"),p.GetNamedNumber(L"y")},kind.back(),{pivot.GetNamedNumber(L"x"),pivot.GetNamedNumber(L"y")},true);check(bool(t.legacyShear),"canonical shear metadata");const auto& g=*t.legacyShear;check(std::abs(g[0]-v.GetNamedNumber(L"x"))<1e-9&&std::abs(g[1]-v.GetNamedNumber(L"y"))<1e-9&&std::abs(g[4]-row.GetNamedNumber(L"angle"))<1e-9,"legacy shear geometry");}
   if(row.GetNamedValue(L"updatedEntries").ValueType()==JsonValueType::Array){d->transformFloatingPaste(t,opt);const auto updated=row.GetNamedArray(L"updatedEntries");check(updated.Size()==d->palette_.entries.size(),"palette entries");for(unsigned i=0;i<updated.Size();++i)d->palette_.entries[i].color=Pixel(updated.GetObjectAt(i).GetNamedNumber(L"color"));}
   d->transformFloatingPaste(t,opt);d->transformFloatingPaste(t,opt);
   equalSelection(d->selection(),row.GetNamedValue(L"transformed"),"preview selection");
   if(d->floatingDeferred()){
    const auto expected=words(row.GetNamedObject(L"after").GetNamedArray(L"display"));sameWords(d->floatingOverlayRegion({0,0,d->width(),d->height()}),expected,"deferred display");sameWords(d->canvasPixels(),before,"deferred immutable canvas");
    for(int y=0;y<d->height();y+=17)for(int x=0;x<d->width();x+=19){const int w=std::min(19,d->width()-x),h=std::min(17,d->height()-y);const auto tile=d->floatingOverlayRegion({x,y,w,h});for(int yy=0;yy<h;++yy)for(int xx=0;xx<w;++xx)check(tile[yy*w+xx]==expected[(y+yy)*d->width()+x+xx],"regional overlay");}
   }else canvas(*d,row.GetNamedObject(L"after"),"preview");
   check(d->historySize()==0&&d->revision()==rev,"preview history/revision");
  };
  begin();d->cancelFloatingPaste();sameWords(d->canvasPixels(),before,"cancel");geometry(d->activeSurface(),row.GetNamedObject(L"before").GetNamedObject(L"geometry"),"cancel");check(selectionEqual(d->selection(),selected)&&d->historySize()==0,"cancel selection/history");restorePalette();begin();d->commitFloatingPaste();
  canvas(*d,row.GetNamedObject(L"after"),"commit");geometry(d->activeSurface(),row.GetNamedObject(L"after").GetNamedObject(L"geometry"),"commit");equalSelection(d->selection(),row.GetNamedValue(L"transformed"),"commit selection");
  const bool changed=row.GetNamedBoolean(L"changed"),selectionChanged=!selectionEqual(selected,d->selection());check(d->historySize()==unsigned(changed||selectionChanged),"single transaction");if(linked)encoded(*d);
  if(changed||selectionChanged){d->undo();canvas(*d,row.GetNamedObject(L"undo"),"undo");geometry(d->activeSurface(),row.GetNamedObject(L"undo").GetNamedObject(L"geometry"),"undo");check(selectionEqual(d->selection(),selected),"undo selection");if(linked)encoded(*d);d->redo();canvas(*d,row.GetNamedObject(L"redo"),"redo");geometry(d->activeSurface(),row.GetNamedObject(L"redo").GetNamedObject(L"geometry"),"redo");equalSelection(d->selection(),row.GetNamedValue(L"transformed"),"redo selection");if(linked)encoded(*d);}
  if(linked){const auto& s=d->activeSurface();for(const auto& c:d->timeline_.state().cels){const auto r=d->timeline_.resolveSurface(c.id);check(r.surface&&r.surface->format==timeline::RasterFormat::Indexed&&r.surface->pixels.identity()==s.pixels.identity(),"linked identity/format");}}
 }
};}
int run(int argc,wchar_t** argv){check(argc==2,"oracle path");std::ifstream in(std::filesystem::path(argv[1]),std::ios::binary);const std::string bytes{std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>()};const auto rows=JsonObject::Parse(winrt::to_hstring(bytes)).GetNamedArray(L"cases");check(rows.Size()==540,"oracle coverage");unsigned linked=0;for(unsigned i=0;i<rows.Size();++i){const auto row=rows.GetObjectAt(i);for(bool deferred:{false,true}){context=winrt::to_string(row.GetNamedString(L"name"))+(deferred?"-deferred":"-immediate");RasterHistoryFixture::run(row,deferred);}if(i%29==0&&!row.GetNamedBoolean(L"large")){context="linked-"+winrt::to_string(row.GetNamedString(L"name"));RasterHistoryFixture::run(row,false,true);++linked;}}std::cout<<rows.Size()<<" actual legacy indexed symmetry transactions, immediate/deferred and "<<linked<<" linked variants passed\n";return 0;}
int wmain(int argc,wchar_t** argv){const auto hr=RoInitialize(RO_INIT_MULTITHREADED);try{const auto result=run(argc,argv);if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return result;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return 1;}}
