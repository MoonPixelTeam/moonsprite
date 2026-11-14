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

void geometry(const timeline::Surface& surface,const JsonObject& expected){
 check(surface.width==int(expected.GetNamedNumber(L"width"))&&surface.height==int(expected.GetNamedNumber(L"height"))&&surface.offsetX==int(expected.GetNamedNumber(L"x"))&&surface.offsetY==int(expected.GetNamedNumber(L"y"))&&surface.storageOriginX.value_or(0)==int(expected.GetNamedNumber(L"originX"))&&surface.storageOriginY.value_or(0)==int(expected.GetNamedNumber(L"originY")),"legacy geometry/origin");
}
}
namespace moon {struct RasterHistoryFixture {
 static void run(const JsonObject& row,bool linked=false){
  auto d=std::make_unique<Document>(int(row.GetNamedNumber(L"w")),int(row.GetNamedNumber(L"h")));auto state=d->timeline_.state();auto& s=*state.cels.front().surface;
  s.width=int(row.GetNamedNumber(L"sw"));s.height=int(row.GetNamedNumber(L"sh"));s.offsetX=int(row.GetNamedNumber(L"ox"));s.offsetY=int(row.GetNamedNumber(L"oy"));s.storageOriginX=5;s.storageOriginY=-3;s.format=timeline::RasterFormat::Indexed;s.pixels=words(row.GetNamedArray(L"initial"));
  if(linked){state.layers.front().linkedContentId="shape-shared";auto copy=state.layers.front();copy.id="linked-layer";state.layers.push_back(copy);auto alias=state.cels.front();alias.id="linked-cel";alias.layerId=copy.id;state.cels.push_back(alias);state.frames.push_back({"linked-frame",100});timeline::Cel c;c.id="linked-frame-cel";c.layerId=state.layers.front().id;c.frameId="linked-frame";c.linkedCelId=state.cels.front().id;state.cels.push_back(c);}
  if(row.GetNamedBoolean(L"absent"))state.cels.erase(state.cels.begin());d->timeline_=timeline::Timeline(std::move(state));d->colorMode_=color_mode::Mode::Indexed;d->palette_.entries.clear();d->palette_.slots.clear();for(const auto& v:row.GetNamedArray(L"entries")){const auto e=v.GetObject();d->palette_.entries.push_back({int(e.GetNamedNumber(L"id")),U"color",Pixel(e.GetNamedNumber(L"color"))});}std::vector<int> order;for(auto v:words(row.GetNamedArray(L"order")))order.push_back(int(v));d->palette_.setOrder(std::move(order));d->projectActiveCelOpacities();
  if(row.GetNamedValue(L"selection").ValueType()!=JsonValueType::Null){const auto selection=row.GetNamedObject(L"selection");SelectionMask mask{int(selection.GetNamedNumber(L"x")),int(selection.GetNamedNumber(L"y")),int(selection.GetNamedNumber(L"width")),int(selection.GetNamedNumber(L"height")),{}};if(selection.HasKey(L"mask"))for(auto v:words(selection.GetNamedArray(L"mask")))mask.mask.push_back(std::uint8_t(v));d->previewSelection(mask);}
  d->markSaved();check(d->canvasPixels()==words(row.GetNamedArray(L"before")),"initial canvas");const auto initialCount=d->timeline_.state().cels.size();const auto rev=d->revision();const auto palette=d->palette_.entries;const auto orderBefore=d->palette_.order();
  ShapeSpec spec;const auto kind=winrt::to_string(row.GetNamedString(L"kind"));
  spec.kind=kind=="rectangle"?ShapeKind::Rectangle:kind=="rectangle-outline"?ShapeKind::RectangleOutline:kind=="ellipse"?ShapeKind::Ellipse:kind=="ellipse-outline"?ShapeKind::EllipseOutline:kind=="polygon"?ShapeKind::Polygon:ShapeKind::Freeform;
  const auto bounds=row.GetNamedObject(L"bounds");spec.bounds={bounds.GetNamedNumber(L"x"),bounds.GetNamedNumber(L"y"),bounds.GetNamedNumber(L"width"),bounds.GetNamedNumber(L"height")};spec.bounds.angle=row.GetNamedNumber(L"angle");spec.cornerRadius=int(row.GetNamedNumber(L"radius"));spec.strokeWidth=int(row.GetNamedNumber(L"stroke"));spec.brush.ink=InkMode(int(row.GetNamedNumber(L"ink")));spec.brush.opacity=int(row.GetNamedNumber(L"opacity"));spec.polygonBalanced=row.GetNamedBoolean(L"balanced");
  for(const auto& v:row.GetNamedArray(L"path")){const auto p=v.GetObject();spec.polygonPath.push_back({int(p.GetNamedNumber(L"x")),int(p.GetNamedNumber(L"y"))});}
  for(const auto& v:row.GetNamedArray(L"contour")){const auto p=v.GetObject();spec.polygonContour.push_back({int(p.GetNamedNumber(L"x")),int(p.GetNamedNumber(L"y"))});}
  const int axes=int(row.GetNamedNumber(L"symmetric"));d->symmetryAxes={bool(axes&1),bool(axes&2),bool(axes&4),bool(axes&8)};
  const auto center=row.GetNamedObject(L"center");d->setSymmetryCenter({center.GetNamedNumber(L"x"),center.GetNamedNumber(L"y")},false);
  auto preview=[&]{
   check(d->beginShapePreview(),"begin shape");
   for(unsigned update=0;update<2;++update){
    spec.polygonFilled=false;check(d->updateShapePreview(spec,update?Pixel(row.GetNamedNumber(L"color")):0x00123456),"update shape");
    const auto expected=words(row.GetNamedArray(L"previews").GetArrayAt(update));const auto* actual=d->gradientPreviewPixels();check(actual&&*actual==expected,"legacy resolved RGBA preview "+std::to_string(update));check(d->displayPixels()==expected,"display preview");
    check(d->canvasPixels()==words(row.GetNamedArray(L"before"))&&d->revision()==rev&&d->historySize()==0&&d->timeline_.state().cels.size()==initialCount,"preview mutated authoritative document");
   }
  };
  if(context=="shape-0"){
   preview();const auto display=d->displayPixels();const auto previewRevision=d->gradientRevision();auto large=spec;large.bounds={0,0,100000,100000};bool rejected=false;try{d->updateShapePreview(large,0xff0000ff);}catch(const std::length_error&){rejected=true;}
   check(rejected&&d->displayPixels()==display&&d->gradientRevision()==previewRevision&&d->canvasPixels()==words(row.GetNamedArray(L"before"))&&d->revision()==rev&&d->historySize()==0,"geometry-budget failure published a candidate");d->cancelShapePreview();
  }
  preview();d->cancelShapePreview();check(!d->gradientPreviewPixels()&&!d->shapeActive()&&d->canvasPixels()==words(row.GetNamedArray(L"before")),"cancel");preview();
  spec.polygonFilled=true;check(d->updateShapePreview(spec,Pixel(row.GetNamedNumber(L"color"))),"prepare filled commit");
  const auto expected=row.GetNamedBoolean(L"changed");check(d->commitShapePreview()==expected,"change presence");check(!d->gradientPreviewPixels(),"commit retained preview");
  check(d->palette_.order()==orderBefore&&d->palette_.entries.size()==palette.size(),"palette changed");for(std::size_t i=0;i<palette.size();++i)check(d->palette_.entries[i].id==palette[i].id&&d->palette_.entries[i].color==palette[i].color,"palette entry changed");
  if(!expected){check(d->canvasPixels()==words(row.GetNamedArray(L"after"))&&d->historySize()==0&&d->timeline_.state().cels.size()==initialCount&&d->revision()==rev,"no-op published pixels/history/cel/revision");if(d->activeSurfaceIfPresent())geometry(*d->activeSurfaceIfPresent(),row.GetNamedObject(L"afterGeometry"));return;}
  const auto verify=[&](const wchar_t* pixels,const wchar_t* geo,const wchar_t* peer){equal(*d,row,pixels);if(!row.GetNamedBoolean(L"absent"))geometry(*d->activeSurfaceIfPresent(),row.GetNamedObject(geo));if(linked){const auto& active=*d->activeSurfaceIfPresent();for(const auto& c:d->timeline_.state().cels){const auto r=d->timeline_.resolveSurface(c.id);check(r.surface&&r.surface->format==timeline::RasterFormat::Indexed&&r.surface->pixels.identity()==active.pixels.identity(),"linked storage/format");if(c.id=="linked-cel")geometry(*r.surface,row.GetNamedObject(peer));}}};
  check(d->historySize()==1,"one shape edit");verify(L"after",L"afterGeometry",L"linkedAfter");d->undo();verify(L"undo",L"undoGeometry",L"linkedUndo");d->redo();verify(L"redo",L"redoGeometry",L"linkedRedo");
 }
};}
int run(int argc,wchar_t** argv){check(argc==2,"oracle path required");std::ifstream in(std::filesystem::path(argv[1]),std::ios::binary);check(bool(in),"missing oracle");const std::string bytes{std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>()};const auto oracle=JsonObject::Parse(winrt::to_hstring(bytes));const auto cases=oracle.GetNamedArray(L"cases");
 const auto defects=oracle.GetNamedArray(L"legacyDefects");check(defects.Size()==4,"fractional legacy defect evidence");for(const auto& value:defects){const auto row=value.GetObject();check(row.GetNamedBoolean(L"changed")&&words(row.GetNamedArray(L"before"))==words(row.GetNamedArray(L"after"))&&words(row.GetNamedArray(L"undo"))!=words(row.GetNamedArray(L"before")),"legacy fractional typed-array defect changed");}
check(cases.Size()==1186,"oracle coverage");unsigned linkedCount=0;for(unsigned i=0;i<cases.Size();++i){const auto row=cases.GetObjectAt(i);context=winrt::to_string(row.GetNamedString(L"name"));RasterHistoryFixture::run(row);if(!row.GetNamedBoolean(L"absent")&&(i%31==0||context.rfind("placeholder",0)==0)){context="linked-"+context;RasterHistoryFixture::run(row,true);++linkedCount;}}std::cout<<cases.Size()<<" actual legacy shape transactions, preview/update/cancel and "<<linkedCount<<" linked checks passed\n";return 0;}
int wmain(int argc,wchar_t** argv){const auto hr=RoInitialize(RO_INIT_MULTITHREADED);try{check(SUCCEEDED(hr)||hr==RPC_E_CHANGED_MODE,"JSON apartment");const auto result=run(argc,argv);if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return result;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return 1;}}

