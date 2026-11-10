#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include "lua_script_result.h"
#include "raster_geometry.h"
#include "palette_layout.h"
#include "project_manifest.h"
#include "layer_compositor.h"
#include "layer_blend.h"
#include "javascript_text.h"
#include <cmath>
#include <charconv>
#include <unordered_set>
namespace moon::script {
namespace {
using namespace winrt::Windows::Data::Json;
[[noreturn]]void invalid(){throw std::invalid_argument("Invalid Lua script result");}
double integer(double v){if(!std::isfinite(v)||std::floor(v)!=v||std::abs(v)>9007199254740991.)invalid();return v;}
Pixel packed(double v){v=std::fmod(integer(v),4294967296.);if(v<0)v+=4294967296.;return Pixel(v);}
int coordinate(double v){v=integer(v);if(v<INT_MIN||v>INT_MAX)throw std::length_error("Lua result coordinate exceeds native integer range");return int(v);}
bool blank(const winrt::hstring& s){return std::all_of(s.begin(),s.end(),[](wchar_t c){return c==0x9||c==0xa||c==0xb||c==0xc||c==0xd||c==0x20||c==0xa0||c==0x1680||(c>=0x2000&&c<=0x200a)||c==0x2028||c==0x2029||c==0x202f||c==0x205f||c==0x3000||c==0xfeff;});}
SurfaceSnapshot surface(const JsonObject& obj,const winrt::hstring& format){
 const auto w=integer(obj.GetNamedNumber(L"width")),h=integer(obj.GetNamedNumber(L"height"));
 if(obj.GetNamedString(L"format")!=format||w<1||h<1||w*h>InvocationCapture::maxImagePixels)invalid();
 const auto pixels=obj.GetNamedArray(L"pixels");if(double(pixels.Size())!=w*h)invalid();
 auto values=std::make_shared<std::vector<Pixel>>();values->reserve(pixels.Size());
 SurfaceSnapshot result{int(w),int(h),coordinate(obj.GetNamedNumber(L"offsetX")),coordinate(obj.GetNamedNumber(L"offsetY")),values};
 for(const auto& value:pixels)values->push_back(packed(value.GetNumber()));return result;
}
bool equal(const SurfaceSnapshot& a,const SurfaceSnapshot& b){return a.width==b.width&&a.height==b.height&&a.x==b.x&&a.y==b.y&&*a.pixels==*b.pixels;}
void layers(const JsonArray& list,const winrt::hstring& format){
 std::unordered_set<std::wstring> ids;
 for(const auto& item:list){const auto l=item.GetObject();auto id=l.GetNamedString(L"id");if(blank(id)||!ids.emplace(id.c_str(),id.size()).second||blank(l.GetNamedString(L"name")))invalid();
  const auto opacity=integer(l.GetNamedNumber(L"opacity")),frame=l.GetNamedNumber(L"frameNumber");if(opacity<0||opacity>255||!std::isfinite(frame)||std::floor(frame)!=frame||frame<1)invalid();
  if(l.HasKey(L"stackIndex")&&integer(l.GetNamedNumber(L"stackIndex"))<1)invalid();
  (void)surface(l.GetNamedObject(L"surface"),format);
 }
}
const std::unordered_set<std::wstring> paths={
 L"document.create",L"document.open",L"document.save",L"layers.create",L"layers.duplicate",L"layers.remove",L"layers.update",
 L"animation.setFrame",L"animation.setFrameDuration",L"animation.setCelSurface",L"animation.createLoop",L"animation.updateLoop",L"animation.removeLoop",L"animation.play",
 L"palette.create",L"palette.update",L"palette.remove",L"palette.extract",L"tiles.createSet",L"tiles.createLayer",L"tiles.place",L"tiles.edit",
 L"freeTiles.createSource",L"freeTiles.createLayer",L"freeTiles.place",L"freeTiles.edit",L"brushes.importImage",L"brushes.createFromSelection",L"brushes.remove",
 L"selection.set",L"selection.clear",L"selection.invert",L"selection.transform",L"slices.create",L"slices.update",L"slices.remove",
 L"styles.apply",L"styles.copy",L"styles.paste",L"styles.clear",L"styles.setEnabled",L"workspace.setPanel",L"workspace.showPanel",L"workspace.hidePanel",L"io.export",L"io.save",L"io.open",L"ui.notify"};
// Same native ECMAScript number-length adaptation as local_history_diff.cpp
// scalarLength, from legacy local-history JSON/string primitive accounting.
std::size_t numberUnits(double n){
 if(!std::isfinite(n))return 4;if(n==0)return 1;
 char buffer[64];const auto encoded=std::to_chars(buffer,buffer+64,std::abs(n),std::chars_format::general);if(encoded.ec!=std::errc())invalid();
 std::string raw(buffer,encoded.ptr);const auto e=raw.find('e');const int exponent=e==std::string::npos?0:std::stoi(raw.substr(e+1));const auto mantissa=raw.substr(0,e);const auto dot=mantissa.find('.');std::string digits=mantissa;if(dot!=std::string::npos)digits.erase(dot,1);
 int decimal=int(dot==std::string::npos?mantissa.size():dot)+exponent;while(digits.size()>1&&digits.front()=='0'){digits.erase(digits.begin());--decimal;}while(digits.size()>1&&digits.back()=='0')digits.pop_back();
 const std::size_t sign=n<0?1:0;if(std::abs(n)>=1e-6&&std::abs(n)<1e21){if(decimal<=0)return sign+2+std::size_t(-decimal)+digits.size();if(decimal>=int(digits.size()))return sign+std::size_t(decimal);return sign+digits.size()+1;}
 return sign+digits.size()+(digits.size()>1?1:0)+2+std::to_string(std::abs(decimal-1)).size();
}
// JSON.stringify counts UTF16 units, not UTF8 bytes. Encode JSON strings with
// ECMAScript escapes (WinRT Stringify may escape additional characters).
std::size_t jsonUnits(const IJsonValue& value){
 switch(value.ValueType()){
 case JsonValueType::Null:return 4;
 case JsonValueType::Boolean:return value.GetBoolean()?4:5;
 case JsonValueType::Number:return numberUnits(value.GetNumber());
 case JsonValueType::String:{std::size_t n=2;const auto s=value.GetString();for(std::size_t i=0;i<s.size();++i){const auto c=s[i];if(c=='"'||c=='\\'||c=='\b'||c=='\f'||c=='\n'||c=='\r'||c=='\t')n+=2;else if(c<0x20)n+=6;else if(c>=0xd800&&c<=0xdbff&&i+1<s.size()&&s[i+1]>=0xdc00&&s[i+1]<=0xdfff){n+=2;++i;}else if(c>=0xd800&&c<=0xdfff)n+=6;else ++n;}return n;}
 case JsonValueType::Array:{std::size_t n=2;bool comma=false;for(const auto& item:value.GetArray()){n+=comma?1:0;comma=true;n+=jsonUnits(item);}return n;}
 case JsonValueType::Object:{std::size_t n=2;bool comma=false;for(const auto& pair:value.GetObject()){n+=comma?1:0;comma=true;n+=jsonUnits(JsonValue::CreateStringValue(pair.Key()))+1+jsonUnits(pair.Value());}return n;}
 default:invalid();
 }
}
}
SurfaceSnapshot validateResult(const Target& target,const std::string& json){
 if(!target.expected.pixels||target.expected.width<1||target.expected.height<1||std::uint64_t(target.expected.width)*target.expected.height!=target.expected.pixels->size()||target.expected.pixels->size()>InvocationCapture::maxImagePixels)invalid();
 const auto result=JsonObject::Parse(winrt::to_hstring(json));auto expected=target.expected;std::shared_ptr<std::vector<Pixel>> working;
 for(const auto& item:result.GetNamedArray(L"batches")){const auto batch=item.GetObject();std::size_t bytes=0;
  if(batch.HasKey(L"operations"))for(const auto& entry:batch.GetNamedArray(L"operations")){const auto op=entry.GetObject();const auto path=op.GetNamedString(L"path");if(!paths.count(std::wstring(path)))invalid();bytes+=jsonUnits(op.GetNamedValue(L"arguments"));if(bytes>16*1024*1024)invalid();}
  const auto changes=batch.GetNamedArray(L"changes");
  if(batch.HasKey(L"surfaceChange")&&batch.GetNamedValue(L"surfaceChange").ValueType()!=JsonValueType::Null){
   if(changes.Size())invalid();const auto change=batch.GetNamedObject(L"surfaceChange");const auto before=surface(change.GetNamedObject(L"before"),L"rgba");if(!equal(before,expected))invalid();expected=surface(change.GetNamedObject(L"after"),L"rgba");working.reset();continue;
  }
  std::unordered_set<std::size_t> indices;
  for(const auto& entry:changes){const auto change=entry.GetObject();const auto index=integer(change.GetNamedNumber(L"index"));if(index<0||index>=expected.pixels->size()||!indices.insert(std::size_t(index)).second)invalid();const auto before=packed(change.GetNamedNumber(L"before")),after=packed(change.GetNamedNumber(L"after"));if((*expected.pixels)[std::size_t(index)]!=before)invalid();
   if(!working){working=std::make_shared<std::vector<Pixel>>(*expected.pixels);expected.pixels=working;}(*working)[std::size_t(index)]=after;
  }
 }
 layers(result.GetNamedArray(L"createdLayers"),L"rgba");
 for(const auto& item:result.GetNamedArray(L"createdDocuments")){const auto doc=item.GetObject();const auto w=integer(doc.GetNamedNumber(L"width")),h=integer(doc.GetNamedNumber(L"height"));const auto mode=doc.GetNamedString(L"colorMode");const auto list=doc.GetNamedArray(L"layers");if(blank(doc.GetNamedString(L"name"))||w<1||h<1||w*h>InvocationCapture::maxImagePixels||(mode!=L"rgba"&&mode!=L"indexed"&&mode!=L"grayscale")||!list.Size())invalid();layers(list,mode==L"indexed"?L"indexed":L"rgba");}
 return expected;
}
namespace {
std::u32string unicode(const winrt::hstring& s){std::u32string out;for(std::size_t i=0;i<s.size();++i){char32_t c=s[i];if(c>=0xd800&&c<=0xdbff&&i+1<s.size()&&s[i+1]>=0xdc00&&s[i+1]<=0xdfff)c=0x10000+((c-0xd800)<<10)+(s[++i]-0xdc00);out.push_back(c);}return out;}
CreatedLayer createdLayer(const JsonObject& wire,const winrt::hstring& format=L"rgba"){
 CreatedLayer layer;layer.id=winrt::to_string(wire.GetNamedString(L"id"));layer.name=unicode(wire.GetNamedString(L"name"));layer.opacity=int(wire.GetNamedNumber(L"opacity"));layer.visible=wire.GetNamedBoolean(L"visible");layer.locked=wire.GetNamedBoolean(L"locked");layer.frameNumber=wire.GetNamedNumber(L"frameNumber");
 if(wire.HasKey(L"stackIndex"))layer.stackIndex=std::size_t(wire.GetNamedNumber(L"stackIndex"));if(wire.HasKey(L"parentGroupId")&&wire.GetNamedValue(L"parentGroupId").ValueType()==JsonValueType::String)layer.parentGroupId=winrt::to_string(wire.GetNamedString(L"parentGroupId"));layer.surface=surface(wire.GetNamedObject(L"surface"),format);return layer;
}
// lua-script-operations specFor: direct tables or positional (id, patch).
JsonObject operationSpec(const JsonObject& operation){
 const auto args=operation.GetNamedValue(L"arguments");if(args.ValueType()==JsonValueType::Object)return args.GetObject();JsonArray values;if(args.ValueType()==JsonValueType::Array)values=args.GetArray();else values.Append(args);
 JsonObject out;if(values.Size()>1&&values.GetAt(1).ValueType()==JsonValueType::Object){out=JsonObject::Parse(values.GetAt(1).GetObject().Stringify());if(operation.GetNamedString(L"path")==L"styles.apply"){JsonObject wrapped;wrapped.Insert(L"id",values.GetAt(0));wrapped.Insert(L"styles",out);return wrapped;}if(operation.GetNamedString(L"path")==L"palette.update"&&out.HasKey(L"r")){JsonObject wrapped;wrapped.Insert(L"id",values.GetAt(0));wrapped.Insert(L"color",out);return wrapped;}if(!out.HasKey(L"id")||out.GetNamedValue(L"id").ValueType()==JsonValueType::Null)out.Insert(L"id",values.GetAt(0));}else out.Insert(L"value",values.Size()?values.GetAt(0):JsonValue::CreateNullValue());return out;
}
double operationInteger(const JsonObject& o,const wchar_t* key,double fallback=0){if(!o.HasKey(key)||o.GetNamedValue(key).ValueType()!=JsonValueType::Number)return fallback;const auto n=o.GetNamedNumber(key);return std::isfinite(n)?std::trunc(n):fallback;}
int sliceCoordinate(double n){return int(std::clamp(n,double(std::numeric_limits<int>::min()),double(std::numeric_limits<int>::max())));}
SliceRect sliceRect(const JsonObject& o){return {sliceCoordinate(operationInteger(o,L"x")),sliceCoordinate(operationInteger(o,L"y")),sliceCoordinate(std::max(1.,operationInteger(o,L"width"))),sliceCoordinate(std::max(1.,operationInteger(o,L"height")))};}
void validateSliceMask(const JsonObject& spec){if(spec.HasKey(L"mask")&&spec.GetNamedValue(L"mask").ValueType()==JsonValueType::Array){const auto r=sliceRect(spec);if(std::uint64_t(r.width)*r.height!=spec.GetNamedArray(L"mask").Size())throw std::invalid_argument("selection mask size does not match its bounds");}}
Pixel operationColor(const IJsonValue& value,std::optional<Pixel> fallback={}){if(value.ValueType()!=JsonValueType::Object){if(fallback)return *fallback;throw std::invalid_argument("color must be an { r, g, b, a } table");}const auto o=value.GetObject();Pixel p=0;int shift=0;for(auto key:{L"r",L"g",L"b",L"a"}){p|=Pixel(std::clamp(operationInteger(o,key,shift==24?255:0),0.,255.))<<shift;shift+=8;}return p;}
// Legacy rgbaPixels: numeric RGBA byte arrays use Uint8ClampedArray ties-to-even;
// packed numbers use ECMAScript ToUint32, color tables use integer channels.
std::vector<Pixel> operationPixels(const JsonObject& spec,std::size_t count){
 if(!spec.HasKey(L"pixels")||spec.GetNamedValue(L"pixels").ValueType()!=JsonValueType::Array)throw std::invalid_argument("pixels must be an array");
 const auto values=spec.GetNamedArray(L"pixels");std::vector<Pixel> result(count);
 if(values.Size()==count*4&&std::all_of(values.begin(),values.end(),[](const auto& v){return v.ValueType()==JsonValueType::Number;})){
  auto byte=[](double n){if(std::isnan(n)||n<=0)return 0u;if(n>=255)return 255u;auto v=std::floor(n);const auto f=n-v;return unsigned(v+(f>.5||(f==.5&&unsigned(v)%2)));};
  for(std::size_t i=0;i<count;++i)for(unsigned c=0;c<4;++c)result[i]|=byte(values.GetNumberAt(std::uint32_t(i*4+c)))<<(c*8);
 }else{if(values.Size()!=count)throw std::invalid_argument("pixels length does not match tile");for(std::size_t i=0;i<count;++i){auto v=values.GetAt(std::uint32_t(i));if(v.ValueType()==JsonValueType::Number){auto n=v.GetNumber();n=std::isfinite(n)?std::fmod(std::trunc(n),4294967296.):0;if(n<0)n+=4294967296.;result[i]=Pixel(n);}else result[i]=operationColor(v);}}
 return result;
}
// Preserve sparse owner geometry and links. Only changed references are sampled,
// retaining the existing transforms and foreign-resource cell semantics.
void renderScriptTileCells(timeline::State& state,const std::string& setId,const std::string& tileId,const std::string& owner={},std::optional<std::size_t> cellIndex={}){
 const tiles::Catalog catalog(state.tilesets);
 for(auto& c:state.cels){if(c.linkedCelId||c.runtimeSharedCelId||!c.surface)continue;
  if(c.tilemap&&(owner.empty()||owner==c.id)){const auto& grid=*c.tilemap;std::vector<std::size_t> cells;if(cellIndex)cells.push_back(*cellIndex);else for(std::size_t i=0;i<grid.cells.size();++i)if(grid.cells[i]&&grid.cells[i]->tilesetId==setId&&grid.cells[i]->tileId==tileId)cells.push_back(i);if(cells.empty())continue;
   auto& surface=*c.surface;auto& pixels=static_cast<std::vector<Pixel>&>(surface.pixels);for(auto i:cells){const auto tile=tiles::cellPixels(grid.cells[i],grid.tileWidth,grid.tileHeight,catalog);const int x=int(i%grid.columns)*grid.tileWidth,y=int(i/grid.columns)*grid.tileHeight;for(int dy=0;dy<grid.tileHeight&&y+dy<surface.height;++dy)if(x<surface.width)std::copy_n(tile.begin()+std::size_t(dy)*grid.tileWidth,std::min(grid.tileWidth,surface.width-x),pixels.begin()+std::size_t(y+dy)*surface.width+x);}
  }
  if(owner.empty()&&c.freeTiles){auto layer=std::find_if(state.layers.begin(),state.layers.end(),[&](const auto& l){return l.id==c.layerId;});if(layer==state.layers.end()||!layer->freeTiles)continue;const auto& data=*layer->freeTiles;bool affected=data.legacyTilesetId==setId||std::any_of(data.sources.begin(),data.sources.end(),[&](const auto& source){return source.tilesetId==setId;});if(affected)c.surface->pixels=free_tiles::render(data,*c.freeTiles,state.tilesets,c.surface->width,c.surface->height);}
 }
}
struct OperationPlan {bool structureDocumentChanged=true;std::vector<std::u32string> notifications;std::optional<LayerStructureUi> layerStructureUi;std::optional<timeline::State> layerUpdateTimeline;std::optional<std::unordered_map<std::string,std::array<int,4>>> layerUpdateGeometry;std::vector<std::pair<std::string,std::optional<timeline::ColorOverlayStyle>>> styles;std::optional<timeline::ColorOverlayStyle> clipboard;std::vector<std::pair<bool,std::size_t>> hostOrder;std::vector<PanelRequest> panels;std::vector<PlaybackRequest> playback;std::optional<std::string> activeFrame;std::optional<std::vector<std::pair<std::string,int>>> durations;std::optional<std::vector<timeline::LoopSection>> loops;std::optional<SliceState> slices;std::optional<std::optional<SelectionMask>> selection;std::optional<PaletteState> palette;std::optional<SurfaceSnapshot> synchronizedRaster;std::vector<RasterBatch::OwnerReplacement> synchronizedOwners;std::size_t celChangedPixels=0;};
std::vector<OperationPlan> planOperations(const Document& d,const JsonArray& batches,bool selectCreatedPaletteColor,SurfaceSnapshot raster,bool playbackConnected,bool panelsConnected,const StyleClipboardHost& styleHost,bool notificationConnected){
 bool structures=false;for(const auto& item:batches){auto b=item.GetObject();if(b.HasKey(L"operations"))for(const auto& op:b.GetNamedArray(L"operations")){auto path=op.GetObject().GetNamedString(L"path");structures|=path==L"tiles.createSet"||path==L"tiles.createLayer"||path==L"tiles.place"||path==L"tiles.edit"||path==L"layers.create"||path==L"layers.duplicate"||path==L"layers.remove";}}
 auto structureUi=captureLayerStructureUi(d);
 bool layerUpdates=structures;for(const auto& item:batches){auto b=item.GetObject();if(b.HasKey(L"operations"))for(const auto& op:b.GetNamedArray(L"operations"))layerUpdates|=op.GetObject().GetNamedString(L"path")==L"layers.update";}
 std::unordered_map<std::string,std::array<int,4>> geometry;if(layerUpdates)for(const auto& l:d.timeline().state().layers)geometry.emplace(l.id,d.displayedLayerGeometry(l.id));
 bool usesStyles=false;for(const auto& item:batches){auto batch=item.GetObject();if(batch.HasKey(L"operations"))for(const auto& entry:batch.GetNamedArray(L"operations"))usesStyles|=std::wstring_view(entry.GetObject().GetNamedString(L"path")).find(L"styles.")==0;}
 std::unordered_map<std::string,std::optional<timeline::ColorOverlayStyle>> layerStyles;if(usesStyles)for(const auto& l:d.timeline().state().layers)layerStyles.emplace(l.id,l.layerStyles);auto clipboard=usesStyles&&styleHost?styleHost.read():std::optional<timeline::ColorOverlayStyle>{};
 SliceState state{d.slices(),d.selectedSliceIds()};auto selection=d.selection();auto palette=d.palette();std::vector<OperationPlan> plans;std::size_t serial=0;std::vector<std::pair<std::string,int>> durations;std::unordered_map<std::string,std::size_t> frameIndexes;frameIndexes.reserve(d.timeline().state().frames.size());durations.reserve(d.timeline().state().frames.size());for(const auto& f:d.timeline().state().frames){frameIndexes.emplace(f.id,durations.size());durations.emplace_back(f.id,f.duration);}auto loops=d.timeline().state().loopSections;
 bool celWrites=false;for(const auto& item:batches){auto b=item.GetObject();if(b.HasKey(L"operations"))for(const auto& op:b.GetNamedArray(L"operations"))celWrites|=op.GetObject().GetNamedString(L"path")==L"animation.setCelSurface";}
 bool extracts=false;for(const auto& item:batches){auto b=item.GetObject();if(b.HasKey(L"operations"))for(const auto& op:b.GetNamedArray(L"operations"))extracts|=op.GetObject().GetNamedString(L"path")==L"palette.extract";}
 std::optional<timeline::Timeline> synchronized;std::size_t synchronizedBudget=0;
 {bool updates=layerUpdates||celWrites||(usesStyles&&extracts);if(d.paletteColorSynchronization()){for(const auto& item:batches){auto b=item.GetObject();if(b.HasKey(L"operations"))for(const auto& op:b.GetNamedArray(L"operations")){const auto operation=op.GetObject();if(operation.GetNamedString(L"path")==L"palette.update"){auto spec=operationSpec(operation);updates|=spec.HasKey(L"color")&&spec.GetNamedValue(L"color").ValueType()==JsonValueType::Object;}}}}if(updates){for(const auto& c:d.timeline().state().cels)if(c.surface){const auto bytes=c.surface->pixels.size()*sizeof(Pixel)*4ull;if(bytes>256ull*1024*1024-synchronizedBudget)throw std::length_error("Lua palette synchronization exceeds native working budget");synchronizedBudget+=bytes;}for(const auto& m:d.timeline().state().masks){const auto bytes=m.mask.surface.pixels.size()*sizeof(Pixel)*4ull;if(bytes>256ull*1024*1024-synchronizedBudget)throw std::length_error("Lua palette synchronization mask budget exceeded");synchronizedBudget+=bytes;}for(const auto& set:d.timeline().state().tilesets){const auto bytes=set.pixels.size()*sizeof(Pixel)*4ull;if(bytes>256ull*1024*1024-synchronizedBudget)throw std::length_error("Lua palette synchronization resource budget exceeded");synchronizedBudget+=bytes;}synchronized.emplace(d.timeline());}}
 for(const auto& item:batches){std::vector<std::u32string> notifications;bool layerChanged=false;if(layerUpdates&&(!synchronized->hasLayer(d.layer().id)||timeline::isLayerEffectivelyLocked(synchronized->state(),synchronized->state().layers[synchronized->layerIndex(d.layer().id)])))throw std::logic_error("Lua script target changed");std::unordered_set<std::string> changedStyles;bool clipboardChanged=false;std::vector<std::pair<bool,std::size_t>> hostOrder;std::vector<PanelRequest> panels;std::vector<PlaybackRequest> playback;auto enqueuePlayback=[&](PlaybackRequest request){hostOrder.emplace_back(false,playback.size());playback.push_back(std::move(request));};std::optional<std::string> selectedFrame;auto operationFrame=d.frame().id;auto operationLayer=d.layer().id;if(structures&&structureUi.activeLayer!=operationLayer){structureUi.selection={};structureUi.selection.layers={operationLayer};structureUi.selection.layerAnchor=operationLayer;structureUi.groups.clear();structureUi.group.reset();structureUi.frames.clear();structureUi.frameAnchor.clear();}structureUi.activeLayer=operationLayer;structureUi.activeFrame=operationFrame;bool changed=false,selectionChanged=false,paletteChanged=false,syncChanged=false,durationChanged=false,loopsChanged=false;std::size_t celChangedPixels=0;std::vector<RasterBatch::OwnerReplacement> synchronizedOwners;bool onlyResourceCreation=true;const auto batch=item.GetObject();
  // Legacy applyResult installs a batch's raster before executing its MSE ops.
  if(extracts||synchronized){if(batch.HasKey(L"surfaceChange")&&batch.GetNamedValue(L"surfaceChange").ValueType()!=JsonValueType::Null)raster=surface(batch.GetNamedObject(L"surfaceChange").GetNamedObject(L"after"),L"rgba");else if(batch.GetNamedArray(L"changes").Size()){auto pixels=std::make_shared<std::vector<Pixel>>(*raster.pixels);for(const auto& value:batch.GetNamedArray(L"changes")){auto c=value.GetObject();(*pixels)[std::size_t(c.GetNamedNumber(L"index"))]=packed(c.GetNamedNumber(L"after"));}raster.pixels=std::move(pixels);}}
  if(synchronized){const auto* slot=synchronized->findCel(d.layer().id,d.frame().id);auto r=slot?synchronized->resolveSurface(slot->id):timeline::Resolution{};if(r.source){const auto id=r.source->id;auto state=std::move(*synchronized).takeState();for(auto& c:state.cels)if(c.id==id){c.surface->width=raster.width;c.surface->height=raster.height;c.surface->offsetX=raster.x;c.surface->offsetY=raster.y;c.surface->pixels=*raster.pixels;}synchronized.emplace(std::move(state),id);if(layerUpdates)geometry[d.layer().id]={raster.width,raster.height,raster.x,raster.y};}else if(batch.GetNamedArray(L"changes").Size()||(batch.HasKey(L"surfaceChange")&&batch.GetNamedValue(L"surfaceChange").ValueType()!=JsonValueType::Null)){timeline::Cel c;c.id="script-candidate-empty";for(std::size_t n=0;synchronized->findCelById(c.id);++n)c.id="script-candidate-empty-"+std::to_string(n);c.layerId=d.layer().id;c.frameId=d.frame().id;c.opacity=d.layer().opacity;timeline::Surface surface;surface.width=raster.width;surface.height=raster.height;surface.offsetX=raster.x;surface.offsetY=raster.y;surface.storageOriginX=surface.storageOriginY=0;surface.pixels=*raster.pixels;c.surface=std::move(surface);synchronized->addCel(std::move(c));}}
  if(batch.HasKey(L"operations"))for(const auto& entry:batch.GetNamedArray(L"operations")){
  const auto operation=entry.GetObject();const auto path=operation.GetNamedString(L"path");
  if(path!=L"tiles.createSet"&&path!=L"tiles.createLayer"&&path!=L"tiles.place"&&path!=L"tiles.edit"&&path!=L"ui.notify"&&path!=L"layers.create"&&path!=L"layers.duplicate"&&path!=L"layers.remove"&&path!=L"layers.update"&&path!=L"slices.create"&&path!=L"slices.update"&&path!=L"slices.remove"&&path!=L"selection.set"&&path!=L"selection.clear"&&path!=L"selection.invert"&&path!=L"palette.create"&&path!=L"palette.update"&&path!=L"palette.remove"&&path!=L"palette.extract"&&path!=L"animation.setFrameDuration"&&path!=L"animation.createLoop"&&path!=L"animation.updateLoop"&&path!=L"animation.removeLoop"&&path!=L"animation.setCelSurface"&&path!=L"animation.setFrame"&&path!=L"animation.play"&&path!=L"workspace.setPanel"&&path!=L"workspace.showPanel"&&path!=L"workspace.hidePanel"&&path!=L"styles.apply"&&path!=L"styles.copy"&&path!=L"styles.paste"&&path!=L"styles.clear"&&path!=L"styles.setEnabled")throw std::logic_error("Lua MSE operation adapter is incomplete: "+winrt::to_string(path));
  auto spec=operationSpec(operation);if(path!=L"tiles.createSet"&&path!=L"ui.notify"&&path!=L"selection.set"&&path!=L"selection.clear"&&path!=L"selection.invert"&&path!=L"workspace.showPanel"&&path!=L"workspace.hidePanel"&&path!=L"workspace.setPanel"&&path!=L"animation.play"&&path!=L"animation.setFrame"&&path!=L"styles.copy")onlyResourceCreation=false;
  if(path==L"tiles.createSet"||path==L"tiles.createLayer"||path==L"tiles.place"||path==L"tiles.edit"){
   auto string=[&](const wchar_t* key,const std::string& fallback=std::string{}){auto value=spec.GetNamedValue(key,JsonValue::CreateNullValue());return value.ValueType()==JsonValueType::String?winrt::to_string(value.GetString()):fallback;};
   auto boolean=[&](const wchar_t* key){auto value=spec.GetNamedValue(key,JsonValue::CreateNullValue());return value.ValueType()==JsonValueType::Boolean&&value.GetBoolean();};
   auto alias=[&](const wchar_t* first,const wchar_t* second,double fallback){auto copy=spec;if(!copy.HasKey(first)||copy.GetNamedValue(first).ValueType()==JsonValueType::Null)copy.Insert(first,copy.GetNamedValue(second,JsonValue::CreateNumberValue(fallback)));return operationInteger(copy,first,fallback);};
   auto unique=[&](const char* prefix){std::string id;do{id=std::string(prefix)+"-script-"+std::to_string(d.identity())+"-"+std::to_string(++serial);}while(std::any_of(synchronized->state().tilesets.begin(),synchronized->state().tilesets.end(),[&](const auto& t){return t.id==id||std::find(t.tileIds.begin(),t.tileIds.end(),id)!=t.tileIds.end();}));return id;};
   auto admit=[&](std::uint64_t pixels){const auto bytes=pixels*sizeof(Pixel)*4ull;if(bytes>256ull*1024*1024-synchronizedBudget)throw std::length_error("Lua tile transaction exceeds native working budget");synchronizedBudget+=bytes;};
   for(const auto& c:synchronized->state().cels)if(c.surface)admit(c.surface->pixels.size());for(const auto& t:synchronized->state().tilesets)admit(t.pixels.size());
   if(path==L"tiles.createSet"){
    const int tw=int(std::clamp(alias(L"tileWidth",L"width",16),1.,256.)),th=int(std::clamp(alias(L"tileHeight",L"height",16),1.,256.));admit(std::uint64_t(tw)*th);auto id=unique("tileset"),tile=unique("tile");auto name=unicode(winrt::to_hstring(string(L"name","Tileset")));while(!name.empty()&&javascriptWhitespace(name.front()))name.erase(name.begin());while(!name.empty()&&javascriptWhitespace(name.back()))name.pop_back();if(name.empty())name=U"Tileset";auto next=std::move(*synchronized).takeState();auto set=tiles::blankTileset(id,name,tw,th,tile,1);next.tilesets.push_back(std::move(set));synchronized.emplace(std::move(next));layerChanged=true;continue;
   }
   if(path==L"tiles.createLayer"){
    auto shared=string(L"tilesetId");auto found=std::find_if(synchronized->state().tilesets.begin(),synchronized->state().tilesets.end(),[&](const auto& t){return t.id==shared;});if(found==synchronized->state().tilesets.end())shared.clear();
    // The legacy creation command catches unavailable sharing/dimension errors
    // and leaves the document untouched; later script operations still execute.
    if(!shared.empty()&&std::none_of(synchronized->state().layers.begin(),synchronized->state().layers.end(),[&](const auto& l){return l.kind=="tilemap"&&l.tilemapTilesetId==shared;})){if(notificationConnected)notifications.push_back(U"所选瓦片集不可用，或与当前瓦片尺寸不匹配。");continue;}
    auto tw=shared.empty()?std::max(1.,operationInteger(spec,L"tileWidth",16)):found->tileWidth,th=shared.empty()?std::max(1.,operationInteger(spec,L"tileHeight",16)):found->tileHeight;
    if(tw>256||th>256||synchronized->state().layers.size()>=256){if(notificationConnected)notifications.push_back(U"瓦片图层超出资源限制");continue;}
    auto name=unicode(winrt::to_hstring(string(L"name","瓦片图层")));while(!name.empty()&&javascriptWhitespace(name.front()))name.erase(name.begin());while(!name.empty()&&javascriptWhitespace(name.back()))name.pop_back();if(name.empty())name=U"瓦片图层";
    auto grid=tiles::blankCel(d.width(),d.height(),int(tw),int(th));admit(std::uint64_t(grid.columns)*grid.rows*int(tw)*int(th)*durations.size());
    std::string setId=shared,tileId;if(shared.empty()){setId=unique("tileset");tileId=unique("tile");}else tileId=found->tileIds.front();
    structureUi.activeLayer=operationLayer;structureUi.activeFrame=operationFrame;planLayerStructure(d,*synchronized,geometry,structureUi,"layers.create",{},name,{});operationLayer=structureUi.activeLayer;
    auto next=std::move(*synchronized).takeState();if(shared.empty())next.tilesets.push_back(tiles::blankTileset(setId,name,int(tw),int(th),tileId));
    for(auto& l:next.layers)if(l.id==operationLayer){l.kind="tilemap";l.tilemapTilesetId=setId;l.autoLinkAnimationCels=false;}
    for(auto& c:next.cels)if(c.layerId==operationLayer){c.tilemap=grid;c.linkedCelId.reset();c.runtimeSharedCelId.reset();c.text.reset();timeline::Surface surface;surface.width=grid.columns*grid.tileWidth;surface.height=grid.rows*grid.tileHeight;surface.pixels.resize(std::size_t(surface.width)*surface.height);c.surface=std::move(surface);}
    geometry[operationLayer]={grid.columns*grid.tileWidth,grid.rows*grid.tileHeight,0,0};synchronized.emplace(std::move(next));structureUi.tiles={tiles::Mode::Hybrid,setId,tileId,tileId,false};selection.reset();selectionChanged=true;layerChanged=true;if(usesStyles)layerStyles[operationLayer]={};if(panelsConnected){hostOrder.emplace_back(true,panels.size());panels.push_back({"tileset",true,{}});}continue;
   }
   if(path==L"tiles.edit"){
    const auto setId=string(L"tilesetId"),tileId=string(L"tileId");auto found=std::find_if(synchronized->state().tilesets.begin(),synchronized->state().tilesets.end(),[&](const auto& t){return t.id==setId;});if(found==synchronized->state().tilesets.end())throw std::invalid_argument("tile does not exist");auto index=tiles::Index(*found).find(tileId);if(!index)throw std::invalid_argument("tile does not exist");auto pixels=operationPixels(spec,std::size_t(found->tileWidth)*found->tileHeight);if(pixels==tiles::readTile(*found,*index))continue;celChangedPixels+=pixels.size();auto next=std::move(*synchronized).takeState();for(auto& set:next.tilesets)if(set.id==setId)tiles::writeTile(set,tileId,pixels);renderScriptTileCells(next,setId,tileId);synchronized.emplace(std::move(next));layerChanged=true;continue;
   }
   auto layerId=string(L"layerId",operationLayer);if(!synchronized->hasLayer(layerId))throw std::invalid_argument("layer does not exist");auto frameValue=spec.GetNamedValue(L"frameId",JsonValue::CreateNullValue());if(frameValue.ValueType()==JsonValueType::Null)frameValue=spec.GetNamedValue(L"frame",JsonValue::CreateStringValue(winrt::to_hstring(operationFrame)));std::string frameId;if(frameValue.ValueType()==JsonValueType::String&&frameIndexes.count(winrt::to_string(frameValue.GetString())))frameId=winrt::to_string(frameValue.GetString());else{auto n=frameValue.ValueType()==JsonValueType::Number?std::trunc(frameValue.GetNumber()):1.;if(n<1||n>durations.size())throw std::invalid_argument("frame does not exist");frameId=durations[std::size_t(n-1)].first;}
   operationLayer=layerId;operationFrame=frameId;structureUi.selection={};structureUi.selection.layers={layerId};structureUi.selection.layerAnchor=layerId;structureUi.frames.clear();structureUi.groups.clear();structureUi.group.reset();structureUi.frameAnchor.clear();
   const auto& layer=synchronized->state().layers[synchronized->layerIndex(layerId)];const auto* slot=synchronized->findCel(layerId,frameId);const auto r=slot?synchronized->resolveSurface(slot->id):timeline::Resolution{};if(layer.kind!="tilemap"||!r.source||!r.surface||!r.source->tilemap||r.surface->width!=r.source->tilemap->columns*r.source->tilemap->tileWidth||r.surface->height!=r.source->tilemap->rows*r.source->tilemap->tileHeight)throw std::invalid_argument("target is not a tilemap cel");
   const auto& grid=*r.source->tilemap;const auto column=alias(L"column",L"x",0),row=alias(L"row",L"y",0);if(column<0||row<0||column>=grid.columns||row>=grid.rows)throw std::invalid_argument("tile cell is outside the tilemap");auto setId=string(L"tilesetId",layer.tilemapTilesetId);auto set=std::find_if(synchronized->state().tilesets.begin(),synchronized->state().tilesets.end(),[&](const auto& t){return t.id==setId;});if(set==synchronized->state().tilesets.end())throw std::invalid_argument("tile does not exist");auto tileId=string(L"tileId",set->tileIds.front());if(!tiles::Index(*set).find(tileId))throw std::invalid_argument("tile does not exist");const auto index=std::size_t(row)*grid.columns+std::size_t(column);std::optional<tiles::Cell> cell;if(!boolean(L"clear"))cell=tiles::Cell{setId,tileId,boolean(L"flipHorizontal"),boolean(L"flipVertical"),int(std::clamp(operationInteger(spec,L"rotation"),0.,3.))};if(grid.cells[index]==cell)continue;
   auto owner=r.source->id;celChangedPixels+=std::size_t(grid.tileWidth)*grid.tileHeight;auto next=std::move(*synchronized).takeState();for(auto& c:next.cels)if(c.id==owner)c.tilemap->cells[index]=cell;renderScriptTileCells(next,setId,tileId,owner,index);synchronized.emplace(std::move(next));layerChanged=true;continue;
  }
  if(path==L"ui.notify"){
   if(!notificationConnected)throw std::logic_error("Lua notification host is not connected");
   auto value=JsonValue::CreateNullValue().as<IJsonValue>();for(auto key:{L"message",L"text",L"value"})if(spec.HasKey(key)&&spec.GetNamedValue(key).ValueType()!=JsonValueType::Null){value=spec.GetNamedValue(key);break;}
   notifications.push_back(value.ValueType()==JsonValueType::String?unicode(value.GetString()):std::u32string{});continue;
  }
  if(path==L"layers.create"||path==L"layers.duplicate"||path==L"layers.remove"){
   auto id=operationLayer;auto raw=spec.GetNamedValue(L"id",JsonValue::CreateNullValue());if(raw.ValueType()==JsonValueType::Null)raw=spec.GetNamedValue(L"value",JsonValue::CreateNullValue());if(raw.ValueType()==JsonValueType::String)id=winrt::to_string(raw.GetString());
   if(path!=L"layers.create"&&!synchronized->hasLayer(id))throw std::invalid_argument("layer does not exist");
   std::optional<std::u32string> name;std::optional<double> opacity;
   if(path==L"layers.create"){
    if(spec.HasKey(L"name")&&spec.GetNamedValue(L"name").ValueType()==JsonValueType::String){auto n=spec.GetNamedString(L"name");std::size_t left=0,right=n.size();while(left<right&&blank(winrt::hstring(n.c_str()+left,1)))++left;while(right>left&&blank(winrt::hstring(n.c_str()+right-1,1)))--right;name=unicode(winrt::hstring(n.c_str()+left,std::uint32_t(right-left)));}
    if(spec.HasKey(L"opacity")){auto v=spec.GetNamedValue(L"opacity");opacity=std::clamp(v.ValueType()==JsonValueType::Number&&std::isfinite(v.GetNumber())?v.GetNumber()/255.:1.,0.,1.);}
   }
   // Charge transient native structural history before running its allocator.
   auto admit=[&](std::size_t count){const auto bytes=count*sizeof(Pixel)*4ull;if(bytes>256ull*1024*1024-synchronizedBudget)throw std::length_error("Lua layer structure exceeds native working budget");synchronizedBudget+=bytes;};
   for(const auto& c:synchronized->state().cels)if(c.surface)admit(c.surface->pixels.size());for(const auto& m:synchronized->state().masks)admit(m.mask.surface.pixels.size());for(const auto& set:synchronized->state().tilesets)admit(set.pixels.size());
   const bool removedTile=path==L"layers.remove"&&(synchronized->state().layers[synchronized->layerIndex(id)].kind=="tilemap"||synchronized->state().layers[synchronized->layerIndex(id)].kind=="free-tile");
   structureUi.activeLayer=operationLayer;structureUi.activeFrame=operationFrame;layerChanged|=planLayerStructure(d,*synchronized,geometry,structureUi,winrt::to_string(path),id,name,opacity);operationLayer=structureUi.activeLayer;
   if(usesStyles){layerStyles.clear();for(const auto& l:synchronized->state().layers)layerStyles.emplace(l.id,l.layerStyles);for(auto it=changedStyles.begin();it!=changedStyles.end();)if(!synchronized->hasLayer(*it))it=changedStyles.erase(it);else ++it;}
   if(removedTile&&!synchronized->hasLayer(id)&&panelsConnected&&std::none_of(synchronized->state().layers.begin(),synchronized->state().layers.end(),[](const auto& l){return l.kind=="tilemap"||l.kind=="free-tile";})){hostOrder.emplace_back(true,panels.size());panels.push_back({"tileset",false,{}});}
   continue;
  }
  if(path==L"layers.update"){
   auto id=operationLayer;auto value=spec.GetNamedValue(L"id",JsonValue::CreateNullValue());if(value.ValueType()==JsonValueType::String)id=winrt::to_string(value.GetString());if(!synchronized->hasLayer(id))throw std::invalid_argument("layer does not exist");
   const auto* slot=synchronized->findCel(id,operationFrame);const auto resolved=slot?synchronized->resolveSurface(slot->id):timeline::Resolution{};const auto owner=resolved.source?resolved.source->id:std::string{};
   auto next=std::move(*synchronized).takeState();auto& l=next.layers[std::size_t(std::find_if(next.layers.begin(),next.layers.end(),[&](const auto& l){return l.id==id;})-next.layers.begin())];
   auto g=geometry.at(id);if(resolved.surface)g={resolved.surface->width,resolved.surface->height,resolved.surface->offsetX,resolved.surface->offsetY};
   bool groupLocked=false;auto parent=l.groupId;while(parent){auto found=std::find_if(next.groups.begin(),next.groups.end(),[&](const auto& v){return v.id==*parent;});if(found==next.groups.end())break;groupLocked|=found->locked;parent=found->parentGroupId;}
   const auto originalName=textUtf16(l.name);auto name=spec.HasKey(L"name")&&spec.GetNamedValue(L"name").ValueType()==JsonValueType::String?spec.GetNamedString(L"name"):winrt::hstring(std::wstring(originalName.begin(),originalName.end()));std::size_t left=0,right=name.size();while(left<right&&blank(winrt::hstring(name.c_str()+left,1)))++left;while(right>left&&blank(winrt::hstring(name.c_str()+right-1,1)))--right;
   const bool locked=spec.HasKey(L"locked")?(spec.GetNamedValue(L"locked").ValueType()==JsonValueType::Boolean&&spec.GetNamedBoolean(L"locked")):l.locked;
   auto display=l.displayColor;if(spec.HasKey(L"displayColor")){auto color=spec.GetNamedValue(L"displayColor");display=color.ValueType()==JsonValueType::Null?std::optional<Pixel>{}:operationColor(color);}
   if(left<right&&!(groupLocked&&!locked)){
    auto old=l;
    const auto description=spec.HasKey(L"description")?(spec.GetNamedValue(L"description").ValueType()==JsonValueType::String?unicode(spec.GetNamedString(L"description")):std::u32string{}):l.description;
    double opacity=l.opacity;if(resolved.source&&resolved.source->opacity)opacity=*resolved.source->opacity;double updated=opacity;if(spec.HasKey(L"opacity")){auto v=spec.GetNamedValue(L"opacity");updated=std::clamp(v.ValueType()==JsonValueType::Number&&std::isfinite(v.GetNumber())?v.GetNumber()/255.:1.,0.,1.);}
    auto blend=l.blendMode;if(spec.HasKey(L"blendMode")&&spec.GetNamedValue(L"blendMode").ValueType()==JsonValueType::String){auto v=winrt::to_string(spec.GetNamedString(L"blendMode"));if(parseLayerBlendMode(v))blend=std::move(v);}
    if(l.locked||groupLocked){updated=opacity;blend=l.blendMode;}
    l.name=unicode(winrt::hstring(name.c_str()+left,std::uint32_t(right-left)));l.opacity=updated;l.blendMode=blend;l.locked=groupLocked?l.locked:locked;l.displayColor=display;l.description=description;
    const bool propertiesChanged=old.name!=l.name||opacity!=updated||old.blendMode!=l.blendMode||old.locked!=l.locked||old.displayColor!=l.displayColor||old.description!=l.description;
    if(propertiesChanged){layerChanged=true;if(!l.linkedContentId.empty())for(auto& member:next.layers)if(member.linkedContentId==l.linkedContentId)member.displayColor=display;
     if(l.kind=="tilemap"&&std::count_if(next.layers.begin(),next.layers.end(),[&](const auto& v){return v.kind=="tilemap"&&v.tilemapTilesetId==l.tilemapTilesetId;})==1)for(auto& set:next.tilesets)if(set.id==l.tilemapTilesetId)set.name=l.name;
     if(opacity!=updated||old.blendMode!=l.blendMode){if(owner.empty()){timeline::Cel c;c.id="script-properties-"+id+"-"+operationFrame;for(std::size_t suffix=0;std::any_of(next.cels.begin(),next.cels.end(),[&](const auto& v){return v.id==c.id;});++suffix)c.id="script-properties-"+id+"-"+operationFrame+"-"+std::to_string(suffix);c.layerId=id;c.frameId=operationFrame;c.opacity=updated;if(l.kind=="tilemap"){auto set=std::find_if(next.tilesets.begin(),next.tilesets.end(),[&](const auto& t){return t.id==l.tilemapTilesetId;});if(set==next.tilesets.end())throw std::logic_error("Missing layer tileset");c.tilemap=tiles::blankCel(d.width(),d.height(),set->tileWidth,set->tileHeight);}else if(l.kind=="free-tile")c.freeTiles=free_tiles::CelData{};timeline::Surface surface;surface.width=g[0];surface.height=g[1];surface.offsetX=g[2];surface.offsetY=g[3];const auto bytes=std::uint64_t(g[0])*g[1]*sizeof(Pixel)*4ull;if(bytes>256ull*1024*1024-synchronizedBudget)throw std::length_error("Lua layer property surface exceeds native working budget");synchronizedBudget+=bytes;surface.pixels.resize(std::size_t(g[0])*g[1]);c.surface=std::move(surface);next.cels.push_back(std::move(c));}else for(auto& c:next.cels)if(c.id==owner||(c.layerId==id&&c.frameId==operationFrame))c.opacity=updated;}
    }
   }
   if(spec.HasKey(L"visible")&&spec.GetNamedValue(L"visible").ValueType()==JsonValueType::Boolean&&l.visible!=spec.GetNamedBoolean(L"visible")){l.visible=spec.GetNamedBoolean(L"visible");layerChanged=true;}
   if(!timeline::isLayerEffectivelyLocked(next,l)){
    const int x=spec.HasKey(L"x")?coordinate(operationInteger(spec,L"x")):g[2],y=spec.HasKey(L"y")?coordinate(operationInteger(spec,L"y")):g[3];raster::coordinate(std::int64_t(x)+g[0]);raster::coordinate(std::int64_t(y)+g[1]);
    if(x!=g[2]||y!=g[3]){for(auto& c:next.cels)if(c.id==owner&&c.surface){if(c.text)translateTextCelData(*c.text,raster::coordinate(std::int64_t(x)-g[2]),raster::coordinate(std::int64_t(y)-g[3]));c.surface->offsetX=x;c.surface->offsetY=y;}g[2]=x;g[3]=y;geometry[id]=g;layerChanged=true;}
   }
   synchronized.emplace(std::move(next),owner);
   {const auto* c=synchronized->findCel(d.layer().id,d.frame().id);auto r=c?synchronized->resolveSurface(c->id):timeline::Resolution{};if(r.surface)raster={r.surface->width,r.surface->height,r.surface->offsetX,r.surface->offsetY,std::make_shared<const std::vector<Pixel>>(r.surface->pixels.begin(),r.surface->pixels.end())};else if(id==d.layer().id){raster.x=g[2];raster.y=g[3];}}
   continue;
  }
  if(path==L"styles.apply"||path==L"styles.copy"||path==L"styles.paste"||path==L"styles.clear"||path==L"styles.setEnabled"){
   auto id=operationLayer;auto raw=spec.GetNamedValue(L"id",JsonValue::CreateNullValue());if((path==L"styles.copy"||path==L"styles.paste"||path==L"styles.clear")&&raw.ValueType()==JsonValueType::Null)raw=spec.GetNamedValue(L"value",JsonValue::CreateNullValue());if(raw.ValueType()==JsonValueType::String)id=winrt::to_string(raw.GetString());
   const auto& currentTimeline=synchronized?*synchronized:d.timeline();if(!currentTimeline.hasLayer(id))throw std::invalid_argument("layer does not exist");
   const bool adjustment=currentTimeline.state().layers[currentTimeline.layerIndex(id)].kind=="adjustment";
   auto& current=layerStyles.at(id);auto next=current;
   if(path==L"styles.copy"||path==L"styles.paste"){
    if(!styleHost)throw std::logic_error("Lua style clipboard host is not connected");
    if(path==L"styles.copy"){if(!adjustment&&current){clipboard=current;clipboardChanged=true;}continue;}
    if(!clipboard||adjustment)continue;next=clipboard;
   }else if(path==L"styles.apply"){
    auto value=spec.GetNamedValue(L"styles",JsonValue::CreateNullValue());if(value.ValueType()==JsonValueType::Null)value=spec.GetNamedValue(L"value",JsonValue::CreateNullValue());next=project::normalizeLayerStylesJson(winrt::to_string(value.Stringify()));if(!next)throw std::invalid_argument("invalid layer styles");
   }else if(path==L"styles.clear")next.reset();
   else{if(!timeline::styleConfigured(current))continue;next->enabled=!spec.HasKey(L"enabled")||spec.GetNamedValue(L"enabled").ValueType()!=JsonValueType::Boolean||spec.GetNamedBoolean(L"enabled");}
   if(adjustment)continue;
   auto signature=[](auto value){if(value)value->preservedJson.clear();return timeline::styleSignature(value);};
   if(signature(current)!=signature(next)){current=std::move(next);changedStyles.insert(id);if(synchronized){auto state=std::move(*synchronized).takeState();for(auto& layer:state.layers)if(layer.id==id)layer.layerStyles=current;synchronized.emplace(std::move(state));}}continue;
  }
  if(path==L"workspace.setPanel"||path==L"workspace.showPanel"||path==L"workspace.hidePanel"){
   if(!panelsConnected)throw std::logic_error("Lua workspace panel host is not connected");
   const auto value=spec.HasKey(L"id")&&spec.GetNamedValue(L"id").ValueType()!=JsonValueType::Null?spec.GetNamedValue(L"id"):spec.GetNamedValue(L"value",JsonValue::CreateNullValue());
   PanelRequest request;if(value.ValueType()==JsonValueType::String)request.id=winrt::to_string(value.GetString());
   static const std::unordered_set<std::string> ids={"color","palette","layers","freeTileInstances","history","preview","reference","tileset","brushes","tabletAssist"};
   if(!ids.count(request.id))throw std::invalid_argument("unknown workspace panel");
   if(path==L"workspace.showPanel")request.visible=true;else if(path==L"workspace.hidePanel")request.visible=false;else if(spec.HasKey(L"visible")&&spec.GetNamedValue(L"visible").ValueType()==JsonValueType::Boolean)request.visible=spec.GetNamedBoolean(L"visible");
   if(spec.HasKey(L"dock")&&spec.GetNamedValue(L"dock").ValueType()==JsonValueType::String){auto dock=winrt::to_string(spec.GetNamedString(L"dock"));if(dock=="left"||dock=="right"||dock=="bottom"||dock=="floating")request.dock=std::move(dock);}
   hostOrder.emplace_back(true,panels.size());panels.push_back(std::move(request));continue;
  }
  if(path==L"animation.play"){
   if(!playbackConnected)throw std::logic_error("Lua animation playback host is not connected");
   PlaybackRequest request;auto value=spec.HasKey(L"id")&&spec.GetNamedValue(L"id").ValueType()!=JsonValueType::Null?spec.GetNamedValue(L"id"):spec.GetNamedValue(L"value",JsonValue::CreateNullValue());
   if(value.ValueType()==JsonValueType::String)request.loopId=winrt::to_string(value.GetString());
   if(!request.loopId.empty()){request.kind=PlaybackRequest::Kind::PlayLoop;auto section=std::find_if(loops.begin(),loops.end(),[&](const auto& l){return l.id==request.loopId;});if(section!=loops.end()){request.section=*section;auto state=timeline::State{};state.frames=d.timeline().state().frames;auto frames=timeline::loopPlaybackFrames(state,*section);if(!frames.empty()){request.firstFrameId=frames.front();operationFrame=frames.front();}}}
   else request.playing=!spec.HasKey(L"playing")||(spec.GetNamedValue(L"playing").ValueType()==JsonValueType::Boolean&&spec.GetNamedBoolean(L"playing"));
   enqueuePlayback(std::move(request));continue;
  }

  if(path==L"animation.setCelSurface"){
   const auto layerId=spec.HasKey(L"layerId")&&spec.GetNamedValue(L"layerId").ValueType()==JsonValueType::String?winrt::to_string(spec.GetNamedString(L"layerId")):operationLayer;
   std::string frameId=durations.front().first;if(spec.HasKey(L"frameId")){const auto v=spec.GetNamedValue(L"frameId");if(v.ValueType()==JsonValueType::String&&frameIndexes.count(winrt::to_string(v.GetString())))frameId=winrt::to_string(v.GetString());else if(v.ValueType()==JsonValueType::Number){const auto n=std::trunc(v.GetNumber());if(n<1||n>durations.size())throw std::invalid_argument("frame does not exist");frameId=durations[std::size_t(n-1)].first;}}
   if(!synchronized->hasLayer(layerId))throw std::invalid_argument("layer does not exist");const auto* slot=synchronized->findCel(layerId,frameId);if(!slot||(spec.HasKey(L"celId")&&spec.GetNamedValue(L"celId").ValueType()==JsonValueType::String&&spec.GetNamedString(L"celId")!=winrt::to_hstring(slot->id)))throw std::invalid_argument("cel does not exist");const auto r=synchronized->resolveSurface(slot->id);if(!r.source||!r.surface||!synchronized->state().layers[synchronized->layerIndex(layerId)].kind.empty())throw std::logic_error("Lua non-raster Cel surface adapter is incomplete");
   const auto before=surface(spec.GetNamedObject(L"before"),L"rgba"),after=surface(spec.GetNamedObject(L"after"),L"rgba");const auto& live=*r.surface;if(before.width!=live.width||before.height!=live.height||before.x!=live.offsetX||before.y!=live.offsetY||*before.pixels!=live.pixels)throw std::logic_error("cel surface changed before the script result was applied");
   if(before.width!=after.width||before.height!=after.height)celChangedPixels+=std::max(before.pixels->size(),after.pixels->size());else for(std::size_t i=0;i<before.pixels->size();++i)celChangedPixels+=(*before.pixels)[i]!=(*after.pixels)[i];
   const auto ownerId=r.source->id;timeline::Surface replacement;replacement.width=after.width;replacement.height=after.height;replacement.offsetX=after.x;replacement.offsetY=after.y;replacement.storageOriginX=replacement.storageOriginY=0;replacement.pixels=*after.pixels;
   auto found=std::find_if(synchronizedOwners.begin(),synchronizedOwners.end(),[&](const auto& o){return o.ownerId==ownerId;});if(found==synchronizedOwners.end())synchronizedOwners.push_back({ownerId,live,replacement});else found->after=replacement;
   auto next=std::move(*synchronized).takeState();for(auto& c:next.cels)if(c.id==ownerId)c.surface=std::move(replacement);synchronized.emplace(std::move(next),ownerId);syncChanged=true;
   const auto* active=synchronized->findCel(d.layer().id,d.frame().id);auto activeResolved=active?synchronized->resolveSurface(active->id):timeline::Resolution{};if(activeResolved.surface){const auto& a=*activeResolved.surface;raster={a.width,a.height,a.offsetX,a.offsetY,std::make_shared<const std::vector<Pixel>>(a.pixels.begin(),a.pixels.end())};}continue;
  }
  if(path==L"animation.setFrame"||path==L"animation.setFrameDuration"||path==L"animation.createLoop"||path==L"animation.updateLoop"||path==L"animation.removeLoop"){
   auto first=[&](std::initializer_list<const wchar_t*> keys,double fallback){for(auto key:keys)if(spec.HasKey(key)&&spec.GetNamedValue(key).ValueType()!=JsonValueType::Null)return spec.GetNamedValue(key);return JsonValue::CreateNumberValue(fallback);};
   auto frameIndex=[&](const IJsonValue& value){if(value.ValueType()==JsonValueType::String){const auto id=winrt::to_string(value.GetString());if(const auto found=frameIndexes.find(id);found!=frameIndexes.end())return found->second;}double index=1;if(value.ValueType()==JsonValueType::Number&&std::isfinite(value.GetNumber()))index=std::trunc(value.GetNumber());if(index<1||index>durations.size())throw std::invalid_argument("frame does not exist");return std::size_t(index-1);};
   if(path==L"animation.setFrame"){operationFrame=durations[frameIndex(first({L"id",L"frame",L"value"},1))].first;if(playbackConnected){PlaybackRequest request;request.kind=PlaybackRequest::Kind::SetFrame;request.firstFrameId=operationFrame;enqueuePlayback(std::move(request));}else selectedFrame=operationFrame;continue;}
   if(path==L"animation.setFrameDuration"){auto& f=durations[frameIndex(first({L"id",L"frame",L"value"},1))];const auto next=int(std::clamp(operationInteger(spec,L"duration",f.second),1.,60000.));if(next!=f.second){f.second=next;durationChanged=true;}continue;}
   const auto idValue=first(path==L"animation.removeLoop"?std::initializer_list<const wchar_t*>{L"id",L"value"}:std::initializer_list<const wchar_t*>{L"id"},0);auto id=idValue.ValueType()==JsonValueType::String?winrt::to_string(idValue.GetString()):std::string{};
   if(path!=L"animation.createLoop"&&id.empty())throw std::invalid_argument("loop id is required");auto found=std::find_if(loops.begin(),loops.end(),[&](const auto& l){return l.id==id;});
   if(path==L"animation.removeLoop"){if(found!=loops.end()){if(playbackConnected)enqueuePlayback({PlaybackRequest::Kind::LoopChanged,false,id});loops.erase(std::remove_if(loops.begin(),loops.end(),[&](const auto& l){return l.id==id;}),loops.end());loopsChanged=true;}continue;}
   auto start=frameIndex(first({L"startFrameId",L"start"},1)),end=frameIndex(first({L"endFrameId",L"end"},double(durations.size())));if(start>end)std::swap(start,end);
   auto name=spec.HasKey(L"name")&&spec.GetNamedValue(L"name").ValueType()==JsonValueType::String?spec.GetNamedString(L"name"):winrt::hstring(L"Loop");std::size_t left=0,right=name.size();while(left<right&&blank(winrt::hstring(name.c_str()+left,1)))++left;while(right>left&&blank(winrt::hstring(name.c_str()+right-1,1)))--right;auto normalized=winrt::hstring(name.c_str()+left,std::uint32_t(std::min<std::size_t>(64,right-left)));if(normalized.empty())normalized=L"Loop 1";
   timeline::LoopSection loop;loop.id=id;loop.name=unicode(normalized);loop.startFrameId=durations[start].first;loop.endFrameId=durations[end].first;loop.direction=spec.HasKey(L"direction")&&spec.GetNamedValue(L"direction").ValueType()==JsonValueType::String&&spec.GetNamedString(L"direction")==L"reverse"?"reverse":"forward";if(!spec.HasKey(L"repeatCount")||spec.GetNamedValue(L"repeatCount").ValueType()!=JsonValueType::Null)loop.repeatCount=int(std::clamp(operationInteger(spec,L"repeatCount",1),1.,9999.));
   if(path==L"animation.createLoop"){if(id.empty()){do{loop.id="loop-script-"+std::to_string(d.identity())+"-"+std::to_string(++serial);}while(std::any_of(loops.begin(),loops.end(),[&](const auto& l){return l.id==loop.id;}));}loops.push_back(std::move(loop));loopsChanged=true;}
   else if(found!=loops.end()&&(found->name!=loop.name||found->startFrameId!=loop.startFrameId||found->endFrameId!=loop.endFrameId||found->direction!=loop.direction||found->repeatCount!=loop.repeatCount)){if(playbackConnected)enqueuePlayback({PlaybackRequest::Kind::LoopChanged,false,id});for(auto& existing:loops)if(existing.id==id)existing=loop;loopsChanged=true;}continue;
  }
  if(path==L"palette.extract"){
   const auto limit=std::size_t(std::clamp(operationInteger(spec,L"limit",256),1.,4096.));std::vector<Pixel> colors;std::unordered_set<Pixel> seen;
   // Bounded strips retain scanline order without allocating a full composite.
   const auto* slot=d.timeline().findCel(d.layer().id,d.frame().id);const auto resolved=slot?d.timeline().resolveSurface(slot->id):timeline::Resolution{};
   const auto owner=resolved.source?resolved.source->id:std::string{};
   for(int y=0;y<d.height()&&colors.size()<limit;){const int rows=std::min(d.height()-y,std::max(1,65536/std::max(1,d.width())));auto pixels=compositeNormalRegion(synchronized?*synchronized:d.timeline(),operationFrame,{0,y,d.width(),rows},operationFrame==d.frame().id&&(!synchronized||synchronized->hasLayer(d.layer().id))?d.layer().id:std::string{},raster.pixels.get(),raster.width,raster.x,raster.y,false,{},owner);for(auto color:pixels)if((color>>24)&&seen.insert(color).second){colors.push_back(color);if(colors.size()==limit)break;}y+=rows;}
   if(spec.HasKey(L"mode")&&spec.GetNamedValue(L"mode").ValueType()==JsonValueType::String&&spec.GetNamedString(L"mode")==L"append"){std::vector<Pixel> combined;for(const auto& e:palette.entries)combined.push_back(e.color);combined.insert(combined.end(),colors.begin(),colors.end());colors=std::move(combined);}
   std::unordered_set<int> used;std::vector<int> ids;
   for(auto color:colors){auto e=std::find_if(palette.entries.begin(),palette.entries.end(),[&](const auto& e){return e.color==color&&!used.count(e.id);});int id;if(e!=palette.entries.end())id=e->id;else{if(palette.nextId<1||palette.nextId==std::numeric_limits<int>::max())throw std::length_error("Palette color ID exceeds native integer range");id=palette.nextId++;auto n=std::to_string(id);palette.entries.push_back({id,U"颜色 "+std::u32string(n.begin(),n.end()),color});}ids.push_back(id);used.insert(id);}
   auto slots=normalizePaletteSlots(palette.entries,ids,{},palette.columns);if(slots!=normalizePaletteSlots(palette.entries,palette.order(),palette.slots,palette.columns)){palette.slots=std::move(slots);palette.independentOrder.reset();palette.selected.clear();palette.primaryId=0;for(int id:palette.order()){auto e=std::find_if(palette.entries.begin(),palette.entries.end(),[&](const auto& e){return e.id==id;});if(e->color==palette.primary){palette.selected={id};palette.primaryId=id;break;}}paletteChanged=true;}continue;
  }
  if(path==L"palette.create"||path==L"palette.update"||path==L"palette.remove"){
   if(path==L"palette.create"){
    const auto color=spec.HasKey(L"r")?operationColor(spec):spec.HasKey(L"color")?operationColor(spec.GetNamedValue(L"color")):palette.primary;
    if(palette.nextId<1||palette.nextId==std::numeric_limits<int>::max())throw std::length_error("Palette color ID exceeds native integer range");const auto id=palette.nextId++;const auto name=std::to_string(id);auto slots=normalizePaletteSlots(palette.entries,palette.order(),palette.slots,palette.columns);palette.entries.push_back({id,U"颜色 "+std::u32string(name.begin(),name.end()),color});auto hole=std::find(slots.begin(),slots.end(),0);if(hole!=slots.end())*hole=id;else{const auto at=slots.size();slots.resize(at+std::clamp(palette.columns,1,256));slots[at]=id;}palette.slots=std::move(slots);palette.independentOrder.reset();palette.selected=selectCreatedPaletteColor?std::vector<int>{id}:std::vector<int>{};palette.primaryId=selectCreatedPaletteColor?id:0;paletteChanged=true;
   }else{
    auto raw=spec;if(path==L"palette.remove"&&(!raw.HasKey(L"id")||raw.GetNamedValue(L"id").ValueType()==JsonValueType::Null)&&raw.HasKey(L"value"))raw.Insert(L"id",raw.GetNamedValue(L"value"));const auto id=sliceCoordinate(operationInteger(raw,L"id"));auto found=std::find_if(palette.entries.begin(),palette.entries.end(),[&](const auto& e){return e.id==id;});
    if(path==L"palette.update"){
     if(found==palette.entries.end())throw std::invalid_argument("palette color does not exist");if(spec.HasKey(L"color")){const auto color=operationColor(spec.GetNamedValue(L"color"),found->color);if(color!=found->color){const auto before=found->color;
      if(synchronized&&d.paletteColorSynchronization()){
       for(const auto& l:synchronized->state().layers)if((l.kind=="tilemap"||l.kind=="free-tile")&&!timeline::isLayerEffectivelyLocked(synchronized->state(),l))throw std::logic_error("Lua synchronized tile resource replacement adapter is incomplete");
       const auto& state=synchronized->state();struct Visit{std::string cel;std::size_t frame,layer;};std::vector<Visit> visits;std::unordered_map<std::string,std::size_t> frames,layers;for(std::size_t i=0;i<state.frames.size();++i)frames[state.frames[i].id]=i;for(std::size_t i=0;i<state.layers.size();++i)layers[state.layers[i].id]=state.layers.size()-1-i;for(const auto& c:state.cels)visits.push_back({c.id,frames.at(c.frameId),layers.at(c.layerId)});std::sort(visits.begin(),visits.end(),[](const auto& a,const auto& b){return a.frame!=b.frame?a.frame<b.frame:a.layer<b.layer;});std::unordered_set<const void*> seen;
       for(const auto& v:visits){auto r=synchronized->resolveSurface(v.cel);if(!r.surface||!r.source||!seen.insert(r.surface->pixels.identity()).second||timeline::isLayerEffectivelyLocked(state,state.layers[state.layers.size()-1-v.layer]))continue;bool matches=false;for(auto p:r.surface->pixels)matches|=p==before;if(!matches)continue;auto prior=*r.surface;const auto ownerId=r.source->id;auto after=prior;auto& pixels=static_cast<std::vector<Pixel>&>(after.pixels);for(auto& pixel:pixels)if(pixel==before)pixel=color;
        auto existing=std::find_if(synchronizedOwners.begin(),synchronizedOwners.end(),[&](const auto& o){return o.ownerId==ownerId;});if(existing==synchronizedOwners.end())synchronizedOwners.push_back({ownerId,std::move(prior),std::move(after)});else existing->after=std::move(after);syncChanged=true;
       }
       // Install completed owner buffers together. Calling setPixel for each
       // match repeatedly resolves links and invalidates whole-layer caches.
       if(!synchronizedOwners.empty()){auto next=std::move(*synchronized).takeState();std::unordered_map<std::string,const timeline::Surface*> replacements;for(const auto& o:synchronizedOwners)replacements.emplace(o.ownerId,&o.after);for(auto& c:next.cels)if(auto it=replacements.find(c.id);it!=replacements.end())c.surface=*it->second;synchronized.emplace(std::move(next));}
       const auto* active=synchronized->findCel(d.layer().id,d.frame().id);auto ar=active?synchronized->resolveSurface(active->id):timeline::Resolution{};if(ar.surface)raster.pixels=std::make_shared<std::vector<Pixel>>(ar.surface->pixels.begin(),ar.surface->pixels.end());
      }found->color=color;if(palette.primary==before)palette.primary=color;if(palette.secondary==before)palette.secondary=color;paletteChanged=true;}}if(spec.HasKey(L"name")&&spec.GetNamedValue(L"name").ValueType()==JsonValueType::String){auto name=unicode(spec.GetNamedString(L"name"));if(name!=found->name){found->name=std::move(name);paletteChanged=true;}}
    }else{const auto order=palette.order();if(std::find(order.begin(),order.end(),id)!=order.end()){palette.slots=normalizePaletteSlots(palette.entries,order,palette.slots,palette.columns);for(auto& slot:palette.slots)if(slot==id)slot=0;palette.independentOrder.reset();palette.selected.erase(std::remove(palette.selected.begin(),palette.selected.end(),id),palette.selected.end());if(std::find(palette.selected.begin(),palette.selected.end(),palette.primaryId)==palette.selected.end())palette.primaryId=palette.selected.empty()?0:palette.selected.back();paletteChanged=true;}}
   }continue;
  }
  if(path==L"selection.set"||path==L"selection.clear"||path==L"selection.invert"){
   auto next=selection;
   if(path==L"selection.clear")next.reset();
   else if(path==L"selection.invert")next=invertSelection(selection,d.width(),d.height());
   else{validateSliceMask(spec);const auto r=sliceRect(spec);raster::coordinate(std::int64_t(r.x)+r.width);raster::coordinate(std::int64_t(r.y)+r.height);SelectionMask s{r.x,r.y,r.width,r.height,{}};
    if(spec.HasKey(L"mask")&&spec.GetNamedValue(L"mask").ValueType()==JsonValueType::Array){const auto values=spec.GetNamedArray(L"mask");if(values.Size()>InvocationCapture::maxImagePixels)throw std::length_error("Lua selection mask exceeds native budget");s.mask.reserve(values.Size());for(const auto& value:values){const auto n=value.ValueType()==JsonValueType::Number?value.GetNumber():0;s.mask.push_back(std::uint8_t(std::clamp(std::isfinite(n)?std::trunc(n):0.,0.,255.)));}}next=std::move(s);
   }
   if(!selectionEqual(selection,next)){selection=std::move(next);selectionChanged=true;}continue;
  }
  if(path==L"slices.create"){
   validateSliceMask(spec);std::string id;do{id="slice-script-"+std::to_string(d.identity())+"-"+std::to_string(++serial);}while(std::any_of(state.items.begin(),state.items.end(),[&](const auto& s){return s.id==id;}));const auto n=std::to_string(state.items.size()+1);state.items.push_back({id,U"切片 "+std::u32string(n.begin(),n.end()),clampSliceRect(sliceRect(spec),d.width(),d.height())});state.selected={id};changed=true;
  }else{
   const auto idValue=spec.HasKey(L"id")&&spec.GetNamedValue(L"id").ValueType()!=JsonValueType::Null?spec.GetNamedValue(L"id"):path==L"slices.remove"&&spec.HasKey(L"value")?spec.GetNamedValue(L"value"):JsonValue::CreateNullValue();const auto id=idValue.ValueType()==JsonValueType::String?winrt::to_string(idValue.GetString()):std::string{};
   if(path==L"slices.update"&&id.empty())throw std::invalid_argument("slice id is required");auto found=std::find_if(state.items.begin(),state.items.end(),[&](const auto& s){return s.id==id;});if(found==state.items.end())continue;
   if(path==L"slices.remove"){state.items.erase(found);state.selected.erase(std::remove(state.selected.begin(),state.selected.end(),id),state.selected.end());changed=true;}
   else{auto next=*found;for(auto [key,target]:{std::pair{L"x",&next.rect.x},{L"y",&next.rect.y},{L"width",&next.rect.width},{L"height",&next.rect.height}})if(spec.HasKey(key))*target=sliceCoordinate(operationInteger(spec,key));next.rect.width=std::max(1,next.rect.width);next.rect.height=std::max(1,next.rect.height);next.rect=clampSliceRect(next.rect,d.width(),d.height());if(spec.HasKey(L"name")&&spec.GetNamedValue(L"name").ValueType()==JsonValueType::String)next.name=sanitizeSliceName(unicode(spec.GetNamedString(L"name")),next.name);if(!(next==*found)){*found=std::move(next);changed=true;}}
  }
 }OperationPlan plan;plan.structureDocumentChanged=!(onlyResourceCreation&&!batch.GetNamedArray(L"changes").Size()&&(!batch.HasKey(L"surfaceChange")||batch.GetNamedValue(L"surfaceChange").ValueType()==JsonValueType::Null));plan.notifications=std::move(notifications);if(structures){structureUi.activeLayer=operationLayer;structureUi.activeFrame=operationFrame;plan.layerStructureUi=structureUi;}for(const auto& id:changedStyles)plan.styles.emplace_back(id,layerStyles.at(id));if(clipboardChanged)plan.clipboard=clipboard;plan.hostOrder=std::move(hostOrder);plan.panels=std::move(panels);plan.playback=std::move(playback);plan.activeFrame=std::move(selectedFrame);plan.celChangedPixels=celChangedPixels;if(durationChanged)plan.durations=durations;if(loopsChanged)plan.loops=loops;if(changed)plan.slices=state;if(selectionChanged)plan.selection.emplace(selection);if(paletteChanged)plan.palette=palette;if(syncChanged){const auto& planned=synchronized?*synchronized:d.timeline();const auto* slot=planned.findCel(d.layer().id,d.frame().id);auto active=slot?planned.resolveSurface(slot->id):timeline::Resolution{};for(auto& o:synchronizedOwners)if(active.source&&o.ownerId==active.source->id)plan.synchronizedRaster=raster;else plan.synchronizedOwners.push_back(std::move(o));}if(layerUpdates){const bool pixels=batch.GetNamedArray(L"changes").Size()||(batch.HasKey(L"surfaceChange")&&batch.GetNamedValue(L"surfaceChange").ValueType()!=JsonValueType::Null);if(layerChanged||pixels||syncChanged||!changedStyles.empty()){auto admitPlan=[&](std::size_t count){const auto bytes=count*sizeof(Pixel)*4ull;if(bytes>256ull*1024*1024-synchronizedBudget)throw std::length_error("Lua layer update history exceeds native working budget");synchronizedBudget+=bytes;};for(const auto& c:synchronized->state().cels)if(c.surface)admitPlan(c.surface->pixels.size());for(const auto& m:synchronized->state().masks)admitPlan(m.mask.surface.pixels.size());for(const auto& t:synchronized->state().tilesets)admitPlan(t.pixels.size());plan.layerUpdateTimeline=synchronized->state();for(std::size_t i=0;i<durations.size();++i)plan.layerUpdateTimeline->frames[i].duration=durations[i].second;plan.layerUpdateTimeline->loopSections=loops;plan.layerUpdateGeometry=geometry;plan.synchronizedRaster=raster;}}plans.push_back(std::move(plan));}return plans;
}
}
RasterSummary applyRasterResult(Document& d,Target& target,const std::string& json,bool selectCreatedPaletteColor,const PlaybackHost& playback,const PanelHost& panels,const StyleClipboardHost& styles,const NotificationHost& notify){
 (void)validateResult(target,json);if(d.active()||!target.matches(d))throw std::logic_error("Lua script target changed");
 const auto result=JsonObject::Parse(winrt::to_hstring(json));
 // This stage is deliberately closed to operations requiring workspace state.
 // The full executor will route these explicitly; no data may be dropped.
 if(result.GetNamedArray(L"createdDocuments").Size())throw std::logic_error("Lua created documents require the workspace result executor");
 for(const auto& item:result.GetNamedArray(L"createdLayers")){const auto layer=item.GetObject();(void)layer.GetNamedBoolean(L"visible");(void)layer.GetNamedBoolean(L"locked");if(d.timeline().hasLayer(winrt::to_string(layer.GetNamedString(L"id"))))throw std::invalid_argument("Lua layer id already exists");}
 auto plans=planOperations(d,result.GetNamedArray(L"batches"),selectCreatedPaletteColor,target.expected,bool(playback),bool(panels),styles,bool(notify));std::size_t batchIndex=0;
 if(!plans.empty()&&plans.back().layerUpdateTimeline&&result.GetNamedArray(L"createdLayers").Size()!=0){const auto& layers=plans.back().layerUpdateTimeline->layers;if(std::none_of(layers.begin(),layers.end(),[&](const auto& l){return l.id==target.layerId;}))throw std::logic_error("Lua script target changed");}
 RasterSummary summary;
 for(const auto& item:result.GetNamedArray(L"batches")){
  // Legacy focusScriptTarget resets the destination before each batch.
  d.selectLayer(target.layerId);d.selectFrame(target.frameId);
  const auto wire=item.GetObject();RasterBatch batch;batch.before=target.expected;auto& plan=plans.at(batchIndex++);batch.slices=std::move(plan.slices);batch.selection=std::move(plan.selection);batch.palette=std::move(plan.palette);batch.durations=std::move(plan.durations);batch.loops=std::move(plan.loops);batch.styles=std::move(plan.styles);batch.structureDocumentChanged=plan.structureDocumentChanged;batch.layerStructureUi=plan.layerStructureUi;batch.layerUpdateTimeline=std::move(plan.layerUpdateTimeline);batch.layerUpdateGeometry=std::move(plan.layerUpdateGeometry);
  auto label=wire.GetNamedString(L"label",L"");if(label.empty())label=result.GetNamedString(L"fileName",L"");batch.label=label.empty()?U"脚本":unicode(label);
  auto next=target.expected;std::size_t count=0;
  if(wire.HasKey(L"surfaceChange")&&wire.GetNamedValue(L"surfaceChange").ValueType()!=JsonValueType::Null){
   batch.after=surface(wire.GetNamedObject(L"surfaceChange").GetNamedObject(L"after"),L"rgba");next=*batch.after;
   if(next.width!=batch.before.width||next.height!=batch.before.height)count=std::max(next.pixels->size(),batch.before.pixels->size());
   else for(std::size_t i=0;i<next.pixels->size();++i)count+=(*next.pixels)[i]!=(*batch.before.pixels)[i];
  }else{
   const auto changes=wire.GetNamedArray(L"changes");batch.changes.reserve(changes.Size());std::shared_ptr<std::vector<Pixel>> values;
   for(const auto& entry:changes){const auto c=entry.GetObject();const auto i=std::size_t(c.GetNamedNumber(L"index"));const auto before=packed(c.GetNamedNumber(L"before")),after=packed(c.GetNamedNumber(L"after"));batch.changes.push_back({i,before,after});if(before!=after){if(!values)values=std::make_shared<std::vector<Pixel>>(*next.pixels);(*values)[i]=after;++count;}}
   if(values)next.pixels=values;
  }
  if(plan.synchronizedRaster){next=*plan.synchronizedRaster;batch.after=next;batch.changes.clear();}batch.synchronizedOwners=std::move(plan.synchronizedOwners);
  if(d.commitScriptRasterBatch(batch)){++summary.transactionCount;summary.changedPixelCount+=count+plan.celChangedPixels;target.expected=std::move(next);target.revision=d.revision();}
  if(plan.layerStructureUi)restoreLayerStructureUi(d,*plan.layerStructureUi);
  for(const auto& message:plan.notifications)notify(message);
  if(plan.clipboard)styles.write(*plan.clipboard);
  for(const auto& [panel,index]:plan.hostOrder){if(panel)panels(d,plan.panels[index]);else{const auto& request=plan.playback[index];if(request.kind==PlaybackRequest::Kind::SetFrame)d.selectFrame(request.firstFrameId);else playback(d,request);}}if(!plan.playback.empty())target.revision=d.revision();
  if(plan.activeFrame){d.selectFrame(*plan.activeFrame);target.revision=d.revision();}
 }
 for(const auto& item:result.GetNamedArray(L"createdLayers")){
  // Legacy refocuses the original target before each layer, so undo of each
  // creation returns there rather than the previously created layer.
  d.selectLayer(target.layerId);d.selectFrame(target.frameId);const auto wire=item.GetObject();CreatedLayer layer;
  layer.id=winrt::to_string(wire.GetNamedString(L"id"));layer.name=unicode(wire.GetNamedString(L"name"));layer.opacity=int(wire.GetNamedNumber(L"opacity"));layer.visible=wire.GetNamedBoolean(L"visible");layer.locked=wire.GetNamedBoolean(L"locked");layer.frameNumber=wire.GetNamedNumber(L"frameNumber");
  if(wire.HasKey(L"stackIndex"))layer.stackIndex=std::size_t(wire.GetNamedNumber(L"stackIndex"));
  if(wire.HasKey(L"parentGroupId")&&wire.GetNamedValue(L"parentGroupId").ValueType()==JsonValueType::String)layer.parentGroupId=winrt::to_string(wire.GetNamedString(L"parentGroupId"));
  layer.surface=surface(wire.GetNamedObject(L"surface"),L"rgba");const auto count=std::count_if(layer.surface.pixels->begin(),layer.surface.pixels->end(),[](Pixel p){return (p>>24)!=0;});
  auto label=result.GetNamedString(L"fileName",L"");d.commitScriptCreatedLayer(layer,label.empty()?U"脚本":unicode(label));++summary.transactionCount;summary.changedPixelCount+=count;target.revision=d.revision();
 }
 // Legacy applies a final requested layer/frame after all batches. It does not
 // retarget the dialog: a later callback on a different slot must be rejected.
 if(result.HasKey(L"activeLayerId")&&result.GetNamedValue(L"activeLayerId").ValueType()==JsonValueType::String){const auto id=winrt::to_string(result.GetNamedString(L"activeLayerId"));if(d.timeline().hasLayer(id))d.selectLayer(id);}
 if(result.HasKey(L"activeFrameNumber")&&result.GetNamedValue(L"activeFrameNumber").ValueType()==JsonValueType::Number){const auto n=result.GetNamedNumber(L"activeFrameNumber");const auto& frames=d.timeline().state().frames;if(n>=1&&n<=frames.size()&&std::floor(n)==n)d.selectFrame(frames[std::size_t(n)-1].id);}
 return summary;
}
WorkspaceSummary applyWorkspaceResult(Document& d,Target& target,const std::string& json,const std::function<void(Document&&)>& addSession,bool selectCreatedPaletteColor,const PlaybackHost& playback,const PanelHost& panels,const StyleClipboardHost& styles,const NotificationHost& notify){
 (void)validateResult(target,json);if(d.active()||!target.matches(d))throw std::logic_error("Lua script target changed");
 auto result=JsonObject::Parse(winrt::to_hstring(json));const auto documents=result.GetNamedArray(L"createdDocuments");
 if(documents.Size()&&!addSession)throw std::logic_error("Lua created document session adopter is not connected");
 // Build candidates before changing the source document; unsupported modes and
 // invalid native structures cannot leave earlier raster batches half-applied.
 std::vector<Document> prepared;prepared.reserve(documents.Size());std::size_t pixels=0;
 for(const auto& item:documents){const auto wire=item.GetObject();CreatedDocument value;value.name=unicode(wire.GetNamedString(L"name"));value.width=int(wire.GetNamedNumber(L"width"));value.height=int(wire.GetNamedNumber(L"height"));value.colorMode=winrt::to_string(wire.GetNamedString(L"colorMode"));
  if(value.colorMode!="rgba")throw std::logic_error("Native Lua created document color mode adapter is incomplete");
  for(const auto& layer:wire.GetNamedArray(L"layers")){value.layers.push_back(createdLayer(layer.GetObject()));for(auto p:*value.layers.back().surface.pixels)pixels+=(p>>24)!=0;}
  prepared.push_back(buildCreatedDocument(value));
 }
 result.Insert(L"createdDocuments",JsonArray{});
 // Legacy skips final source layer/frame selection across a document boundary.
 if(!prepared.empty()){if(result.HasKey(L"activeLayerId"))result.Remove(L"activeLayerId");if(result.HasKey(L"activeFrameNumber"))result.Remove(L"activeFrameNumber");}
 const auto raster=applyRasterResult(d,target,winrt::to_string(result.Stringify()),selectCreatedPaletteColor,playback,panels,styles,notify);WorkspaceSummary summary{raster.transactionCount,raster.changedPixelCount,false};
 // Do not access d after adoption: adding a tab may move/destroy its wrapper.
 for(auto& document:prepared){addSession(std::move(document));++summary.transactionCount;summary.documentBoundary=true;}
 summary.changedPixelCount+=pixels;return summary;
}
RunOutcome receiveWorkspaceResult(Document& d,Target& target,const std::string& json,
 const std::function<void(Document&&)>& addSession,const std::function<void(const std::string&)>& closeSession,const std::string& failureSessionId,bool selectCreatedPaletteColor,const PlaybackHost& playback,const PanelHost& panels,const StyleClipboardHost& styles,const NotificationHost& notify){
 std::string cleanup=failureSessionId;
 try{
  const auto result=JsonObject::Parse(winrt::to_hstring(json));
  if(cleanup.empty()&&result.HasKey(L"sessionId")&&result.GetNamedValue(L"sessionId").ValueType()==JsonValueType::String)cleanup=winrt::to_string(result.GetNamedString(L"sessionId"));
  // Decode the outcome before any application, so a malformed response cannot
  // leave edits committed merely because its summary could not be displayed.
  RunOutcome outcome;auto& summary=outcome.summary;
  summary.fileName=winrt::to_string(result.GetNamedString(L"fileName"));summary.filePath=winrt::to_string(result.GetNamedString(L"filePath"));summary.elapsedMs=result.GetNamedNumber(L"elapsedMs");
  for(const auto& line:result.GetNamedArray(L"output"))summary.output.push_back(winrt::to_string(line.GetString()));
  const bool finished=result.GetNamedBoolean(L"finished");
  if(!finished&&result.HasKey(L"sessionId")&&result.GetNamedValue(L"sessionId").ValueType()==JsonValueType::String){
   const auto id=winrt::to_string(result.GetNamedString(L"sessionId"));
   if(!id.empty())outcome.session=ClientSession{id,summary.fileName,summary.filePath,winrt::to_string(result.GetNamedArray(L"dialogs").Stringify()),target};
  }
  const auto applied=applyWorkspaceResult(d,target,json,addSession,selectCreatedPaletteColor,playback,panels,styles,notify);
  if(applied.documentBoundary&&!finished)throw std::logic_error("Lua script target changed");
  summary.transactionCount=applied.transactionCount;summary.changedPixelCount=applied.changedPixelCount;
  if(outcome.session)outcome.session->target=target;
  return outcome;
 }catch(...){
  // Cleanup failures must not replace the original application error.
  if(!cleanup.empty()&&closeSession)try{closeSession(cleanup);}catch(...){}
  throw;
 }
}
}
