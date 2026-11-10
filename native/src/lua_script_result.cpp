#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include "lua_script_result.h"
#include "raster_geometry.h"
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
 JsonObject out;if(values.Size()>1&&values.GetAt(1).ValueType()==JsonValueType::Object){out=JsonObject::Parse(values.GetAt(1).GetObject().Stringify());if(!out.HasKey(L"id")||out.GetNamedValue(L"id").ValueType()==JsonValueType::Null)out.Insert(L"id",values.GetAt(0));}else out.Insert(L"value",values.Size()?values.GetAt(0):JsonValue::CreateNullValue());return out;
}
double operationInteger(const JsonObject& o,const wchar_t* key,double fallback=0){if(!o.HasKey(key)||o.GetNamedValue(key).ValueType()!=JsonValueType::Number)return fallback;const auto n=o.GetNamedNumber(key);return std::isfinite(n)?std::trunc(n):fallback;}
int sliceCoordinate(double n){return int(std::clamp(n,double(std::numeric_limits<int>::min()),double(std::numeric_limits<int>::max())));}
SliceRect sliceRect(const JsonObject& o){return {sliceCoordinate(operationInteger(o,L"x")),sliceCoordinate(operationInteger(o,L"y")),sliceCoordinate(std::max(1.,operationInteger(o,L"width"))),sliceCoordinate(std::max(1.,operationInteger(o,L"height")))};}
void validateSliceMask(const JsonObject& spec){if(spec.HasKey(L"mask")&&spec.GetNamedValue(L"mask").ValueType()==JsonValueType::Array){const auto r=sliceRect(spec);if(std::uint64_t(r.width)*r.height!=spec.GetNamedArray(L"mask").Size())throw std::invalid_argument("selection mask size does not match its bounds");}}
struct OperationPlan {std::optional<SliceState> slices;std::optional<std::optional<SelectionMask>> selection;};
std::vector<OperationPlan> planOperations(const Document& d,const JsonArray& batches){
 SliceState state{d.slices(),d.selectedSliceIds()};auto selection=d.selection();std::vector<OperationPlan> plans;std::size_t serial=0;
 for(const auto& item:batches){bool changed=false,selectionChanged=false;const auto batch=item.GetObject();if(batch.HasKey(L"operations"))for(const auto& entry:batch.GetNamedArray(L"operations")){
  const auto operation=entry.GetObject();const auto path=operation.GetNamedString(L"path");
  if(path!=L"slices.create"&&path!=L"slices.update"&&path!=L"slices.remove"&&path!=L"selection.set"&&path!=L"selection.clear"&&path!=L"selection.invert")throw std::logic_error("Lua MSE operation adapter is incomplete: "+winrt::to_string(path));
  auto spec=operationSpec(operation);
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
 }OperationPlan plan;if(changed)plan.slices=state;if(selectionChanged)plan.selection.emplace(selection);plans.push_back(std::move(plan));}return plans;
}
}
RasterSummary applyRasterResult(Document& d,Target& target,const std::string& json){
 (void)validateResult(target,json);if(d.active()||!target.matches(d))throw std::logic_error("Lua script target changed");
 const auto result=JsonObject::Parse(winrt::to_hstring(json));
 // This stage is deliberately closed to operations requiring workspace state.
 // The full executor will route these explicitly; no data may be dropped.
 if(result.GetNamedArray(L"createdDocuments").Size())throw std::logic_error("Lua created documents require the workspace result executor");
 for(const auto& item:result.GetNamedArray(L"createdLayers")){const auto layer=item.GetObject();(void)layer.GetNamedBoolean(L"visible");(void)layer.GetNamedBoolean(L"locked");if(d.timeline().hasLayer(winrt::to_string(layer.GetNamedString(L"id"))))throw std::invalid_argument("Lua layer id already exists");}
 const auto plans=planOperations(d,result.GetNamedArray(L"batches"));std::size_t batchIndex=0;
 RasterSummary summary;
 for(const auto& item:result.GetNamedArray(L"batches")){
  const auto wire=item.GetObject();RasterBatch batch;batch.before=target.expected;const auto& plan=plans.at(batchIndex++);batch.slices=plan.slices;batch.selection=plan.selection;
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
  if(d.commitScriptRasterBatch(batch)){++summary.transactionCount;summary.changedPixelCount+=count;target.expected=std::move(next);target.revision=d.revision();}
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
WorkspaceSummary applyWorkspaceResult(Document& d,Target& target,const std::string& json,const std::function<void(Document&&)>& addSession){
 (void)validateResult(target,json);if(d.active()||!target.matches(d))throw std::logic_error("Lua script target changed");
 auto result=JsonObject::Parse(winrt::to_hstring(json));const auto documents=result.GetNamedArray(L"createdDocuments");
 if(documents.Size()&&!addSession)throw std::logic_error("Lua created document session adopter is not connected");
 (void)planOperations(d,result.GetNamedArray(L"batches"));
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
 const auto raster=applyRasterResult(d,target,winrt::to_string(result.Stringify()));WorkspaceSummary summary{raster.transactionCount,raster.changedPixelCount,false};
 // Do not access d after adoption: adding a tab may move/destroy its wrapper.
 for(auto& document:prepared){addSession(std::move(document));++summary.transactionCount;summary.documentBoundary=true;}
 summary.changedPixelCount+=pixels;return summary;
}
RunOutcome receiveWorkspaceResult(Document& d,Target& target,const std::string& json,
 const std::function<void(Document&&)>& addSession,const std::function<void(const std::string&)>& closeSession,const std::string& failureSessionId){
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
  const auto applied=applyWorkspaceResult(d,target,json,addSession);
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
