#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include "lua_script_result.h"
#include "raster_geometry.h"
#include "palette_layout.h"
#include "layer_compositor.h"
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
 JsonObject out;if(values.Size()>1&&values.GetAt(1).ValueType()==JsonValueType::Object){out=JsonObject::Parse(values.GetAt(1).GetObject().Stringify());if(operation.GetNamedString(L"path")==L"palette.update"&&out.HasKey(L"r")){JsonObject wrapped;wrapped.Insert(L"id",values.GetAt(0));wrapped.Insert(L"color",out);return wrapped;}if(!out.HasKey(L"id")||out.GetNamedValue(L"id").ValueType()==JsonValueType::Null)out.Insert(L"id",values.GetAt(0));}else out.Insert(L"value",values.Size()?values.GetAt(0):JsonValue::CreateNullValue());return out;
}
double operationInteger(const JsonObject& o,const wchar_t* key,double fallback=0){if(!o.HasKey(key)||o.GetNamedValue(key).ValueType()!=JsonValueType::Number)return fallback;const auto n=o.GetNamedNumber(key);return std::isfinite(n)?std::trunc(n):fallback;}
int sliceCoordinate(double n){return int(std::clamp(n,double(std::numeric_limits<int>::min()),double(std::numeric_limits<int>::max())));}
SliceRect sliceRect(const JsonObject& o){return {sliceCoordinate(operationInteger(o,L"x")),sliceCoordinate(operationInteger(o,L"y")),sliceCoordinate(std::max(1.,operationInteger(o,L"width"))),sliceCoordinate(std::max(1.,operationInteger(o,L"height")))};}
void validateSliceMask(const JsonObject& spec){if(spec.HasKey(L"mask")&&spec.GetNamedValue(L"mask").ValueType()==JsonValueType::Array){const auto r=sliceRect(spec);if(std::uint64_t(r.width)*r.height!=spec.GetNamedArray(L"mask").Size())throw std::invalid_argument("selection mask size does not match its bounds");}}
Pixel operationColor(const IJsonValue& value,std::optional<Pixel> fallback={}){if(value.ValueType()!=JsonValueType::Object){if(fallback)return *fallback;throw std::invalid_argument("color must be an { r, g, b, a } table");}const auto o=value.GetObject();Pixel p=0;int shift=0;for(auto key:{L"r",L"g",L"b",L"a"}){p|=Pixel(std::clamp(operationInteger(o,key,shift==24?255:0),0.,255.))<<shift;shift+=8;}return p;}
struct OperationPlan {std::optional<std::vector<std::pair<std::string,int>>> durations;std::optional<std::vector<timeline::LoopSection>> loops;std::optional<SliceState> slices;std::optional<std::optional<SelectionMask>> selection;std::optional<PaletteState> palette;std::optional<SurfaceSnapshot> synchronizedRaster;std::vector<RasterBatch::OwnerReplacement> synchronizedOwners;std::size_t celChangedPixels=0;};
std::vector<OperationPlan> planOperations(const Document& d,const JsonArray& batches,bool selectCreatedPaletteColor,SurfaceSnapshot raster){
 SliceState state{d.slices(),d.selectedSliceIds()};auto selection=d.selection();auto palette=d.palette();std::vector<OperationPlan> plans;std::size_t serial=0;std::vector<std::pair<std::string,int>> durations;std::unordered_map<std::string,std::size_t> frameIndexes;frameIndexes.reserve(d.timeline().state().frames.size());durations.reserve(d.timeline().state().frames.size());for(const auto& f:d.timeline().state().frames){frameIndexes.emplace(f.id,durations.size());durations.emplace_back(f.id,f.duration);}auto loops=d.timeline().state().loopSections;
 bool celWrites=false;for(const auto& item:batches){auto b=item.GetObject();if(b.HasKey(L"operations"))for(const auto& op:b.GetNamedArray(L"operations"))celWrites|=op.GetObject().GetNamedString(L"path")==L"animation.setCelSurface";}
 bool extracts=false;for(const auto& item:batches){auto b=item.GetObject();if(b.HasKey(L"operations"))for(const auto& op:b.GetNamedArray(L"operations"))extracts|=op.GetObject().GetNamedString(L"path")==L"palette.extract";}
 std::optional<timeline::Timeline> synchronized;std::size_t synchronizedBudget=0;
 {bool updates=celWrites;if(d.paletteColorSynchronization()){for(const auto& item:batches){auto b=item.GetObject();if(b.HasKey(L"operations"))for(const auto& op:b.GetNamedArray(L"operations")){const auto operation=op.GetObject();if(operation.GetNamedString(L"path")==L"palette.update"){auto spec=operationSpec(operation);updates|=spec.HasKey(L"color")&&spec.GetNamedValue(L"color").ValueType()==JsonValueType::Object;}}}}if(updates){for(const auto& c:d.timeline().state().cels)if(c.surface){const auto bytes=c.surface->pixels.size()*sizeof(Pixel)*4ull;if(bytes>256ull*1024*1024-synchronizedBudget)throw std::length_error("Lua palette synchronization exceeds native working budget");synchronizedBudget+=bytes;}for(const auto& m:d.timeline().state().masks){const auto bytes=m.mask.surface.pixels.size()*sizeof(Pixel)*4ull;if(bytes>256ull*1024*1024-synchronizedBudget)throw std::length_error("Lua palette synchronization mask budget exceeded");synchronizedBudget+=bytes;}for(const auto& set:d.timeline().state().tilesets){const auto bytes=set.pixels.size()*sizeof(Pixel)*4ull;if(bytes>256ull*1024*1024-synchronizedBudget)throw std::length_error("Lua palette synchronization resource budget exceeded");synchronizedBudget+=bytes;}synchronized.emplace(d.timeline());}}
 for(const auto& item:batches){bool changed=false,selectionChanged=false,paletteChanged=false,syncChanged=false,durationChanged=false,loopsChanged=false;std::size_t celChangedPixels=0;std::vector<RasterBatch::OwnerReplacement> synchronizedOwners;const auto batch=item.GetObject();
  // Legacy applyResult installs a batch's raster before executing its MSE ops.
  if(extracts||synchronized){if(batch.HasKey(L"surfaceChange")&&batch.GetNamedValue(L"surfaceChange").ValueType()!=JsonValueType::Null)raster=surface(batch.GetNamedObject(L"surfaceChange").GetNamedObject(L"after"),L"rgba");else if(batch.GetNamedArray(L"changes").Size()){auto pixels=std::make_shared<std::vector<Pixel>>(*raster.pixels);for(const auto& value:batch.GetNamedArray(L"changes")){auto c=value.GetObject();(*pixels)[std::size_t(c.GetNamedNumber(L"index"))]=packed(c.GetNamedNumber(L"after"));}raster.pixels=std::move(pixels);}}
  if(synchronized){const auto* slot=synchronized->findCel(d.layer().id,d.frame().id);auto r=slot?synchronized->resolveSurface(slot->id):timeline::Resolution{};if(r.source){const auto id=r.source->id;auto state=std::move(*synchronized).takeState();for(auto& c:state.cels)if(c.id==id){c.surface->width=raster.width;c.surface->height=raster.height;c.surface->offsetX=raster.x;c.surface->offsetY=raster.y;c.surface->pixels=*raster.pixels;}synchronized.emplace(std::move(state),id);}else if(batch.GetNamedArray(L"changes").Size()||(batch.HasKey(L"surfaceChange")&&batch.GetNamedValue(L"surfaceChange").ValueType()!=JsonValueType::Null)){timeline::Cel c;c.id="script-candidate-empty";for(std::size_t n=0;synchronized->findCelById(c.id);++n)c.id="script-candidate-empty-"+std::to_string(n);c.layerId=d.layer().id;c.frameId=d.frame().id;c.opacity=d.layer().opacity;timeline::Surface surface;surface.width=raster.width;surface.height=raster.height;surface.offsetX=raster.x;surface.offsetY=raster.y;surface.storageOriginX=surface.storageOriginY=0;surface.pixels=*raster.pixels;c.surface=std::move(surface);synchronized->addCel(std::move(c));}}
  if(batch.HasKey(L"operations"))for(const auto& entry:batch.GetNamedArray(L"operations")){
  const auto operation=entry.GetObject();const auto path=operation.GetNamedString(L"path");
  if(path!=L"slices.create"&&path!=L"slices.update"&&path!=L"slices.remove"&&path!=L"selection.set"&&path!=L"selection.clear"&&path!=L"selection.invert"&&path!=L"palette.create"&&path!=L"palette.update"&&path!=L"palette.remove"&&path!=L"palette.extract"&&path!=L"animation.setFrameDuration"&&path!=L"animation.createLoop"&&path!=L"animation.updateLoop"&&path!=L"animation.removeLoop"&&path!=L"animation.setCelSurface")throw std::logic_error("Lua MSE operation adapter is incomplete: "+winrt::to_string(path));
  auto spec=operationSpec(operation);
  if(path==L"animation.setCelSurface"){
   const auto layerId=spec.HasKey(L"layerId")&&spec.GetNamedValue(L"layerId").ValueType()==JsonValueType::String?winrt::to_string(spec.GetNamedString(L"layerId")):d.layer().id;
   std::string frameId=durations.front().first;if(spec.HasKey(L"frameId")){const auto v=spec.GetNamedValue(L"frameId");if(v.ValueType()==JsonValueType::String&&frameIndexes.count(winrt::to_string(v.GetString())))frameId=winrt::to_string(v.GetString());else if(v.ValueType()==JsonValueType::Number){const auto n=std::trunc(v.GetNumber());if(n<1||n>durations.size())throw std::invalid_argument("frame does not exist");frameId=durations[std::size_t(n-1)].first;}}
   if(!synchronized->hasLayer(layerId))throw std::invalid_argument("layer does not exist");const auto* slot=synchronized->findCel(layerId,frameId);if(!slot||(spec.HasKey(L"celId")&&spec.GetNamedValue(L"celId").ValueType()==JsonValueType::String&&spec.GetNamedString(L"celId")!=winrt::to_hstring(slot->id)))throw std::invalid_argument("cel does not exist");const auto r=synchronized->resolveSurface(slot->id);if(!r.source||!r.surface||!synchronized->state().layers[synchronized->layerIndex(layerId)].kind.empty())throw std::logic_error("Lua non-raster Cel surface adapter is incomplete");
   const auto before=surface(spec.GetNamedObject(L"before"),L"rgba"),after=surface(spec.GetNamedObject(L"after"),L"rgba");const auto& live=*r.surface;if(before.width!=live.width||before.height!=live.height||before.x!=live.offsetX||before.y!=live.offsetY||*before.pixels!=live.pixels)throw std::logic_error("cel surface changed before the script result was applied");
   if(before.width!=after.width||before.height!=after.height)celChangedPixels+=std::max(before.pixels->size(),after.pixels->size());else for(std::size_t i=0;i<before.pixels->size();++i)celChangedPixels+=(*before.pixels)[i]!=(*after.pixels)[i];
   const auto ownerId=r.source->id;timeline::Surface replacement;replacement.width=after.width;replacement.height=after.height;replacement.offsetX=after.x;replacement.offsetY=after.y;replacement.storageOriginX=replacement.storageOriginY=0;replacement.pixels=*after.pixels;
   auto found=std::find_if(synchronizedOwners.begin(),synchronizedOwners.end(),[&](const auto& o){return o.ownerId==ownerId;});if(found==synchronizedOwners.end())synchronizedOwners.push_back({ownerId,live,replacement});else found->after=replacement;
   auto next=std::move(*synchronized).takeState();for(auto& c:next.cels)if(c.id==ownerId)c.surface=std::move(replacement);synchronized.emplace(std::move(next),ownerId);syncChanged=true;
   const auto* active=synchronized->findCel(d.layer().id,d.frame().id);auto activeResolved=active?synchronized->resolveSurface(active->id):timeline::Resolution{};if(activeResolved.surface){const auto& a=*activeResolved.surface;raster={a.width,a.height,a.offsetX,a.offsetY,std::make_shared<const std::vector<Pixel>>(a.pixels.begin(),a.pixels.end())};}continue;
  }
  if(path==L"animation.setFrameDuration"||path==L"animation.createLoop"||path==L"animation.updateLoop"||path==L"animation.removeLoop"){
   auto first=[&](std::initializer_list<const wchar_t*> keys,double fallback){for(auto key:keys)if(spec.HasKey(key)&&spec.GetNamedValue(key).ValueType()!=JsonValueType::Null)return spec.GetNamedValue(key);return JsonValue::CreateNumberValue(fallback);};
   auto frameIndex=[&](const IJsonValue& value){if(value.ValueType()==JsonValueType::String){const auto id=winrt::to_string(value.GetString());if(const auto found=frameIndexes.find(id);found!=frameIndexes.end())return found->second;}double index=1;if(value.ValueType()==JsonValueType::Number&&std::isfinite(value.GetNumber()))index=std::trunc(value.GetNumber());if(index<1||index>durations.size())throw std::invalid_argument("frame does not exist");return std::size_t(index-1);};
   if(path==L"animation.setFrameDuration"){auto& f=durations[frameIndex(first({L"id",L"frame",L"value"},1))];const auto next=int(std::clamp(operationInteger(spec,L"duration",f.second),1.,60000.));if(next!=f.second){f.second=next;durationChanged=true;}continue;}
   const auto idValue=first(path==L"animation.removeLoop"?std::initializer_list<const wchar_t*>{L"id",L"value"}:std::initializer_list<const wchar_t*>{L"id"},0);auto id=idValue.ValueType()==JsonValueType::String?winrt::to_string(idValue.GetString()):std::string{};
   if(path!=L"animation.createLoop"&&id.empty())throw std::invalid_argument("loop id is required");auto found=std::find_if(loops.begin(),loops.end(),[&](const auto& l){return l.id==id;});
   if(path==L"animation.removeLoop"){if(found!=loops.end()){loops.erase(std::remove_if(loops.begin(),loops.end(),[&](const auto& l){return l.id==id;}),loops.end());loopsChanged=true;}continue;}
   auto start=frameIndex(first({L"startFrameId",L"start"},1)),end=frameIndex(first({L"endFrameId",L"end"},double(durations.size())));if(start>end)std::swap(start,end);
   auto name=spec.HasKey(L"name")&&spec.GetNamedValue(L"name").ValueType()==JsonValueType::String?spec.GetNamedString(L"name"):winrt::hstring(L"Loop");std::size_t left=0,right=name.size();while(left<right&&blank(winrt::hstring(name.c_str()+left,1)))++left;while(right>left&&blank(winrt::hstring(name.c_str()+right-1,1)))--right;auto normalized=winrt::hstring(name.c_str()+left,std::uint32_t(std::min<std::size_t>(64,right-left)));if(normalized.empty())normalized=L"Loop 1";
   timeline::LoopSection loop;loop.id=id;loop.name=unicode(normalized);loop.startFrameId=durations[start].first;loop.endFrameId=durations[end].first;loop.direction=spec.HasKey(L"direction")&&spec.GetNamedValue(L"direction").ValueType()==JsonValueType::String&&spec.GetNamedString(L"direction")==L"reverse"?"reverse":"forward";if(!spec.HasKey(L"repeatCount")||spec.GetNamedValue(L"repeatCount").ValueType()!=JsonValueType::Null)loop.repeatCount=int(std::clamp(operationInteger(spec,L"repeatCount",1),1.,9999.));
   if(path==L"animation.createLoop"){if(id.empty()){do{loop.id="loop-script-"+std::to_string(d.identity())+"-"+std::to_string(++serial);}while(std::any_of(loops.begin(),loops.end(),[&](const auto& l){return l.id==loop.id;}));}loops.push_back(std::move(loop));loopsChanged=true;}
   else if(found!=loops.end()&&(found->name!=loop.name||found->startFrameId!=loop.startFrameId||found->endFrameId!=loop.endFrameId||found->direction!=loop.direction||found->repeatCount!=loop.repeatCount)){*found=std::move(loop);loopsChanged=true;}continue;
  }
  if(path==L"palette.extract"){
   const auto limit=std::size_t(std::clamp(operationInteger(spec,L"limit",256),1.,4096.));std::vector<Pixel> colors;std::unordered_set<Pixel> seen;
   // Bounded strips retain scanline order without allocating a full composite.
   const auto* slot=d.timeline().findCel(d.layer().id,d.frame().id);const auto resolved=slot?d.timeline().resolveSurface(slot->id):timeline::Resolution{};
   const auto owner=resolved.source?resolved.source->id:std::string{};
   for(int y=0;y<d.height()&&colors.size()<limit;){const int rows=std::min(d.height()-y,std::max(1,65536/std::max(1,d.width())));auto pixels=compositeNormalRegion(synchronized?*synchronized:d.timeline(),d.frame().id,{0,y,d.width(),rows},d.layer().id,raster.pixels.get(),raster.width,raster.x,raster.y,false,{},owner);for(auto color:pixels)if((color>>24)&&seen.insert(color).second){colors.push_back(color);if(colors.size()==limit)break;}y+=rows;}
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
       for(const auto& l:d.timeline().state().layers)if((l.kind=="tilemap"||l.kind=="free-tile")&&!d.layerEffectivelyLocked(l))throw std::logic_error("Lua synchronized tile resource replacement adapter is incomplete");
       const auto& state=synchronized->state();struct Visit{std::string cel;std::size_t frame,layer;};std::vector<Visit> visits;std::unordered_map<std::string,std::size_t> frames,layers;for(std::size_t i=0;i<state.frames.size();++i)frames[state.frames[i].id]=i;for(std::size_t i=0;i<state.layers.size();++i)layers[state.layers[i].id]=state.layers.size()-1-i;for(const auto& c:state.cels)visits.push_back({c.id,frames.at(c.frameId),layers.at(c.layerId)});std::sort(visits.begin(),visits.end(),[](const auto& a,const auto& b){return a.frame!=b.frame?a.frame<b.frame:a.layer<b.layer;});std::unordered_set<const void*> seen;
       for(const auto& v:visits){auto r=synchronized->resolveSurface(v.cel);if(!r.surface||!r.source||!seen.insert(r.surface->pixels.identity()).second||timeline::isLayerEffectivelyLocked(state,state.layers[state.layers.size()-1-v.layer]))continue;bool matches=false;for(auto p:r.surface->pixels)matches|=p==before;if(!matches)continue;auto prior=*r.surface;const auto ownerId=r.source->id;auto after=prior;for(std::size_t i=0;i<after.pixels.size();++i)if(after.pixels[i]==before)after.pixels[i]=color;
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
 }OperationPlan plan;plan.celChangedPixels=celChangedPixels;if(durationChanged)plan.durations=durations;if(loopsChanged)plan.loops=loops;if(changed)plan.slices=state;if(selectionChanged)plan.selection.emplace(selection);if(paletteChanged)plan.palette=palette;if(syncChanged){plan.synchronizedRaster=raster;const auto& planned=synchronized?*synchronized:d.timeline();const auto* slot=planned.findCel(d.layer().id,d.frame().id);auto active=slot?planned.resolveSurface(slot->id):timeline::Resolution{};for(auto& o:synchronizedOwners)if(!active.source||o.ownerId!=active.source->id)plan.synchronizedOwners.push_back(std::move(o));}plans.push_back(std::move(plan));}return plans;
}
}
RasterSummary applyRasterResult(Document& d,Target& target,const std::string& json,bool selectCreatedPaletteColor){
 (void)validateResult(target,json);if(d.active()||!target.matches(d))throw std::logic_error("Lua script target changed");
 const auto result=JsonObject::Parse(winrt::to_hstring(json));
 // This stage is deliberately closed to operations requiring workspace state.
 // The full executor will route these explicitly; no data may be dropped.
 if(result.GetNamedArray(L"createdDocuments").Size())throw std::logic_error("Lua created documents require the workspace result executor");
 for(const auto& item:result.GetNamedArray(L"createdLayers")){const auto layer=item.GetObject();(void)layer.GetNamedBoolean(L"visible");(void)layer.GetNamedBoolean(L"locked");if(d.timeline().hasLayer(winrt::to_string(layer.GetNamedString(L"id"))))throw std::invalid_argument("Lua layer id already exists");}
 const auto plans=planOperations(d,result.GetNamedArray(L"batches"),selectCreatedPaletteColor,target.expected);std::size_t batchIndex=0;
 RasterSummary summary;
 for(const auto& item:result.GetNamedArray(L"batches")){
  const auto wire=item.GetObject();RasterBatch batch;batch.before=target.expected;const auto& plan=plans.at(batchIndex++);batch.slices=plan.slices;batch.selection=plan.selection;batch.palette=plan.palette;batch.durations=plan.durations;batch.loops=plan.loops;
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
  if(plan.synchronizedRaster){next=*plan.synchronizedRaster;batch.after=next;batch.changes.clear();}batch.synchronizedOwners=plan.synchronizedOwners;
  if(d.commitScriptRasterBatch(batch)){++summary.transactionCount;summary.changedPixelCount+=count+plan.celChangedPixels;target.expected=std::move(next);target.revision=d.revision();}
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
WorkspaceSummary applyWorkspaceResult(Document& d,Target& target,const std::string& json,const std::function<void(Document&&)>& addSession,bool selectCreatedPaletteColor){
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
 const auto raster=applyRasterResult(d,target,winrt::to_string(result.Stringify()),selectCreatedPaletteColor);WorkspaceSummary summary{raster.transactionCount,raster.changedPixelCount,false};
 // Do not access d after adoption: adding a tab may move/destroy its wrapper.
 for(auto& document:prepared){addSession(std::move(document));++summary.transactionCount;summary.documentBoundary=true;}
 summary.changedPixelCount+=pixels;return summary;
}
RunOutcome receiveWorkspaceResult(Document& d,Target& target,const std::string& json,
 const std::function<void(Document&&)>& addSession,const std::function<void(const std::string&)>& closeSession,const std::string& failureSessionId,bool selectCreatedPaletteColor){
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
  const auto applied=applyWorkspaceResult(d,target,json,addSession,selectCreatedPaletteColor);
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
