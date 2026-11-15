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
void pixelsEqual(const std::vector<Pixel>& actual,const std::vector<Pixel>& expected,const std::string& why){
 check(actual.size()==expected.size(),why+" size");for(std::size_t i=0;i<actual.size();++i)check(actual[i]==expected[i],why+" pixel "+std::to_string(i)+" expected "+std::to_string(expected[i])+" actual "+std::to_string(actual[i]));
}
PatternPaintMode mode(const JsonObject& row){const auto v=row.GetNamedString(L"mode");return v==L"pattern-source"?PatternPaintMode::Source:v==L"pattern-target"?PatternPaintMode::Target:PatternPaintMode::Paint;}
PatternBrush image(const JsonObject& row){
 const auto v=row.GetNamedObject(L"variant");PatternBrush b;b.width=int(v.GetNamedNumber(L"width"));b.height=int(v.GetNamedNumber(L"height"));b.intrinsicSize=v.GetNamedBoolean(L"intrinsicSize");b.sourceX=2;b.sourceY=-1;
 for(auto value:words(v.GetNamedArray(L"coverage")))b.coverage.push_back(std::uint8_t(value));if(v.HasKey(L"colors"))b.colors=words(v.GetNamedArray(L"colors"));if(v.HasKey(L"paintColors"))b.paintColors=words(v.GetNamedArray(L"paintColors"));return b;
}
BrushPathPoint sample(const JsonObject& v){return {int(v.GetNamedNumber(L"x")),int(v.GetNamedNumber(L"y")),int(v.GetNamedNumber(L"size")),int(v.GetNamedNumber(L"opacity")),v.GetNamedNumber(L"angle"),{}};}
void stampEqual(const ImageBrushStamp& actual,const JsonObject& expected,const wchar_t* points){
 check(actual.width==int(expected.GetNamedNumber(L"width"))&&actual.height==int(expected.GetNamedNumber(L"height")),"stamp dimensions");const auto values=expected.GetNamedArray(points);check(actual.samples.size()==values.Size(),"stamp sample count");
 for(unsigned i=0;i<values.Size();++i){const auto v=values.GetObjectAt(i);const auto& q=actual.samples[i];check(q.x==int(v.GetNamedNumber(L"x"))&&q.y==int(v.GetNamedNumber(L"y"))&&q.coverage==int(v.GetNamedNumber(L"coverage")),"stamp position/coverage");const auto c=v.GetNamedValue(L"color");check(c.ValueType()==JsonValueType::Null?!q.color:q.color&&*q.color==Pixel(c.GetNumber()),"stamp color");}
}
void stamps(const JsonObject& row){
 const auto b=image(row);const int size=int(row.GetNamedNumber(L"size"));const auto angle=row.GetNamedNumber(L"angle");const auto paintMode=mode(row);
 ImageBrushPatternSampler sampler(b,paintMode,1+(b.intrinsicSize?b.width:size)/2,2+(b.intrinsicSize?b.height:size)/2,size);
 for(const auto& value:row.GetNamedArray(L"samples")){const auto v=value.GetObject();const int x=int(v.GetNamedNumber(L"x")),y=int(v.GetNamedNumber(L"y"));stampEqual(prepareImageBrushStamp(b,size,angle,paintMode,x,y,1,2),v,L"direct");stampEqual(sampler.at(x,y,size,angle),v,L"points");}
}
}
namespace moon {struct RasterHistoryFixture {
 static void install(Document& d,const JsonObject& row,bool linked){
  auto state=d.timeline_.state();auto& s=*state.cels.front().surface;s.format=row.GetNamedString(L"format")==L"indexed"?timeline::RasterFormat::Indexed:timeline::RasterFormat::Rgba;s.pixels=words(row.GetNamedArray(L"initial"));
  if(linked){state.layers.front().linkedContentId="scaled-shared";auto layer=state.layers.front();layer.id="linked-layer";state.layers.push_back(layer);auto cel=state.cels.front();cel.id="linked-cel";cel.layerId=layer.id;state.cels.push_back(cel);state.frames.push_back({"linked-frame",100});timeline::Cel alias;alias.id="linked-frame-cel";alias.layerId=state.layers.front().id;alias.frameId="linked-frame";alias.linkedCelId=state.cels.front().id;state.cels.push_back(alias);}
  d.timeline_=timeline::Timeline(std::move(state));d.colorMode_=row.GetNamedString(L"format")==L"indexed"?color_mode::Mode::Indexed:color_mode::Mode::Rgba;d.palette_.entries.clear();d.palette_.slots.clear();for(const auto& value:row.GetNamedArray(L"entries")){const auto e=value.GetObject();d.palette_.entries.push_back({int(e.GetNamedNumber(L"id")),U"color",Pixel(e.GetNamedNumber(L"color"))});}std::vector<int> order;for(auto v:words(row.GetNamedArray(L"order")))order.push_back(int(v));d.palette_.setOrder(std::move(order));d.projectActiveCelOpacities();
  if(row.GetNamedValue(L"selection").ValueType()!=JsonValueType::Null){const auto v=row.GetNamedObject(L"selection");SelectionMask mask{int(v.GetNamedNumber(L"x")),int(v.GetNamedNumber(L"y")),int(v.GetNamedNumber(L"width")),int(v.GetNamedNumber(L"height")),{}};for(auto v:words(v.GetNamedArray(L"mask")))mask.mask.push_back(std::uint8_t(v));d.previewSelection(std::move(mask));}
  const int axes=int(row.GetNamedNumber(L"symmetric"));d.symmetryAxes={bool(axes&1),bool(axes&2),false,false,bool(axes&16)};d.markSaved();
 }
 static void run(const JsonObject& row,bool linked=false){
  auto make=[&]{auto d=std::make_unique<Document>(int(row.GetNamedNumber(L"w")),int(row.GetNamedNumber(L"h")));install(*d,row,linked);return d;};auto d=make();const auto b=image(row);const auto samples=row.GetNamedArray(L"samples");const auto first=sample(samples.GetObjectAt(0));const Pixel color=Pixel(row.GetNamedNumber(L"color"));const bool dynamic=row.GetNamedBoolean(L"dynamic");
  BrushOptions brush;brush.shape=BrushShape::Square;brush.size=int(row.GetNamedNumber(L"firstSize"));brush.opacity=int(row.GetNamedNumber(L"opacity"));brush.ink=InkMode(int(row.GetNamedNumber(L"ink")));brush.imagePaintMode=mode(row);
  auto verify=[&](const wchar_t* field){pixelsEqual(d->canvasPixels(),words(row.GetNamedArray(field)),winrt::to_string(field));const auto* source=d->activeSurfaceIfPresent();check(source!=nullptr,"missing surface");check(source->format==(row.GetNamedString(L"format")==L"indexed"?timeline::RasterFormat::Indexed:timeline::RasterFormat::Rgba),"format changed");if(linked)for(const auto& c:d->timeline_.state().cels){const auto r=d->timeline_.resolveSurface(c.id);check(r.surface&&r.surface->pixels.identity()==source->pixels.identity(),"linked storage");pixelsEqual(r.surface->pixels,source->pixels,"linked pixels");}};
  const auto revision=d->revision(),history=d->historySize();const auto storage=d->activeSurfaceIfPresent()->pixels.identity();auto preview=words(row.GetNamedArray(L"initial"));auto previewBrush=brush;previewBrush.size=first.size;for(const auto& [index,value]:d->brushPreview({first.x,first.y},{7,4},color,previewBrush,&b,first.angle))preview.at(index)=value;
  // Variable-size strokes keep the initial tool-size pattern anchor; the public
  // static preview naturally uses its own size and is checked on fixed strokes.
  if(!row.GetNamedBoolean(L"vary"))pixelsEqual(preview,words(row.GetNamedArray(L"preview")),"preview");check(d->revision()==revision&&d->historySize()==history&&d->activeSurfaceIfPresent()->pixels.identity()==storage&&!d->active(),"preview mutated document");
  auto paint=[&]{d->beginStroke({first.x,first.y},color,brush,&b,first.angle,nullptr,!dynamic);if(dynamic)d->configureStrokeDynamics(brush,&b,0,0,0);unsigned step=0;for(const auto& v:samples){const auto p=sample(v.GetObject());if(dynamic)d->updateDynamicStroke({p.x,p.y},p,step==0);else if(step)d->updateStroke({p.x,p.y});pixelsEqual(d->canvasPixels(),words(row.GetNamedArray(L"states").GetArrayAt(step)),"live step "+std::to_string(step));++step;}check(d->historySize()==0,"live history");};
  paint();d->cancelStroke();verify(L"cancel");check(d->historySize()==0&&!d->active()&&!d->dirty(),"cancel state");d=make();paint();check(d->commitStroke()==row.GetNamedBoolean(L"changed"),"commit presence");verify(L"after");if(row.GetNamedBoolean(L"changed")){check(d->historySize()==1,"single history");d->undo();verify(L"undo");d->redo();verify(L"redo");}else check(d->historySize()==0,"empty commit history");
 }
};}
int run(int argc,wchar_t** argv){check(argc==2,"oracle path required");std::ifstream in(std::filesystem::path(argv[1]),std::ios::binary);check(bool(in),"missing oracle");const std::string bytes{std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>()};const auto data=JsonObject::Parse(winrt::to_hstring(bytes));const auto cases=data.GetNamedArray(L"cases"),sequences=data.GetNamedArray(L"stamps");check(cases.Size()==450&&sequences.Size()==144,"oracle coverage");unsigned linked=0;for(unsigned i=0;i<sequences.Size();++i){context="stamp-"+std::to_string(i);stamps(sequences.GetObjectAt(i));}for(unsigned i=0;i<cases.Size();++i){const auto row=cases.GetObjectAt(i);context=winrt::to_string(row.GetNamedString(L"name"));RasterHistoryFixture::run(row);if(i%17==0){context="linked-"+context;RasterHistoryFixture::run(row,true);++linked;}}std::cout<<cases.Size()<<" actual legacy scaled-mode transactions, preview/cancel/commit/Undo/Redo, "<<sequences.Size()<<" stamp sequences and "<<linked<<" linked checks passed\n";return 0;}
int wmain(int argc,wchar_t** argv){const auto hr=RoInitialize(RO_INIT_MULTITHREADED);try{check(SUCCEEDED(hr)||hr==RPC_E_CHANGED_MODE,"JSON apartment");const auto result=run(argc,argv);if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return result;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return 1;}}
