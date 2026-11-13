#include "local_history_hydration.h"
#include "local_history_edit.h"
#include "document.h"
#include "project_import.h"
#include "layer_blend.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <roapi.h>
#ifdef GetObject
#undef GetObject
#endif
#include <algorithm>
#include <cmath>
#include <limits>
#include <map>
namespace moon::local_history {
namespace {
using namespace winrt::Windows::Data::Json;
struct Apartment {
 HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);
 Apartment(){if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize history hydration JSON");}
 ~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}
};
[[noreturn]] void unsupported(){throw project::Error(project::ErrorKind::Unsupported,"Local history requires unported property/structural restoration");}
[[noreturn]] void invalid(){throw std::runtime_error("Invalid native local-history pixel delta");}
[[noreturn]] void budget(){throw project::Error(project::ErrorKind::Limit,"Hydrated history exceeds budget");}
IJsonValue get(JsonObject o,const wchar_t* key){return o.GetNamedValue(key,nullptr);}
bool kind(IJsonValue v,JsonValueType t){return v&&v.ValueType()==t;}
std::size_t integer(IJsonValue v){if(!kind(v,JsonValueType::Number))invalid();const auto n=v.GetNumber();if(!std::isfinite(n)||n<0||std::floor(n)!=n||n>9007199254740991.||n>double(std::numeric_limits<std::size_t>::max()))invalid();return std::size_t(n);}
std::string string(IJsonValue v){if(!kind(v,JsonValueType::String))invalid();return winrt::to_string(v.GetString());}
JsonObject object(IJsonValue v){if(!kind(v,JsonValueType::Object))invalid();return v.GetObject();}
JsonArray array(IJsonValue v){if(!kind(v,JsonValueType::Array))invalid();return v.GetArray();}
std::u32string label(IJsonValue value){if(!kind(value,JsonValueType::String))invalid();const auto text=value.GetString();std::u32string out;for(std::size_t i=0;i<text.size();++i){auto c=char32_t(text[i]);if(c>=0xd800&&c<=0xdbff&&i+1<text.size()&&text[i+1]>=0xdc00&&text[i+1]<=0xdfff)c=0x10000+((c-0xd800)<<10)+(char32_t(text[++i])-0xdc00);out.push_back(c);}return out;}
std::vector<const timeline::Cel*> orderedCels(const Document& d){std::vector<const timeline::Cel*> out;for(const auto& cel:d.timeline().state().cels)out.push_back(&cel);return out;}
std::size_t index(const std::string& key){if(key.empty()||(key.size()>1&&key[0]=='0'))invalid();std::size_t out=0;for(char c:key){if(c<'0'||c>'9'||out>(std::numeric_limits<std::size_t>::max()-9)/10)invalid();out=out*10+c-'0';}return out;}
std::vector<std::string> pathKeys(JsonArray path){
 std::vector<std::string> keys;for(const auto& part:path){auto key=string(part);if(key=="__proto__"||key=="constructor"||key=="prototype")invalid();keys.push_back(std::move(key));}if(keys.empty())invalid();return keys;
}
PixelHistoryEdit::MetadataTarget metadataField(const Document& d,JsonArray path){
 using Field=PixelHistoryEdit::MetadataField;const auto keys=pathKeys(path);
 if(keys.size()==1){if(keys[0]=="dirty")return {Field::Dirty,{}};if(keys[0]=="createdAt")return {Field::CreatedAt,{}};if(keys[0]=="updatedAt")return {Field::UpdatedAt,{}};if(keys[0]=="name")return {Field::Name,{}};}
 if(keys.size()==2&&keys[0]=="statistics"){if(keys[1]=="strokeCount")return {Field::StrokeCount,{}};if(keys[1]=="operationCount")return {Field::OperationCount,{}};if(keys[1]=="drawingTimeMs")return {Field::DrawingTimeMs,{}};}
 if(keys.size()==2&&keys[0]=="animation"&&keys[1]=="loop")return {Field::Loop,{}};
 if(keys.size()==2&&keys[0]=="displaySettings"){if(keys[1]=="showPixelGrid")return {Field::PixelGrid,{}};if(keys[1]=="showGrid")return {Field::ShowGrid,{}};}
 if(keys.size()==3&&keys[0]=="displaySettings"&&keys[1]=="grid"){if(keys[2]=="x")return {Field::GridX,{}};if(keys[2]=="y")return {Field::GridY,{}};if(keys[2]=="width")return {Field::GridWidth,{}};if(keys[2]=="height")return {Field::GridHeight,{}};}
 const auto& state=d.timeline().state();
 if(keys.size()==3&&keys[0]=="layers"){
  const auto i=index(keys[1]);if(i>=state.layers.size())invalid();const auto id=state.layers[state.layers.size()-1-i].id;const auto& key=keys[2];
  if(key=="opacity")return {Field::LayerOpacity,id};if(key=="blendMode")return {Field::LayerBlend,id};if(key=="name")return {Field::LayerName,id};if(key=="description")return {Field::LayerDescription,id};if(key=="visible")return {Field::LayerVisible,id};if(key=="locked")return {Field::LayerLocked,id};if(key=="autoLinkAnimationCels")return {Field::LayerAutoLink,id};if(key=="clippingMask")return {Field::LayerClipping,id};
 }
 if(keys.size()==3&&keys[0]=="groups"){
  const auto i=index(keys[1]);if(i>=state.groups.size())invalid();const auto id=state.groups[i].id;const auto& key=keys[2];
  if(key=="opacity")return {Field::GroupOpacity,id};if(key=="blendMode")return {Field::GroupBlend,id};if(key=="name")return {Field::GroupName,id};if(key=="description")return {Field::GroupDescription,id};if(key=="visible")return {Field::GroupVisible,id};if(key=="locked")return {Field::GroupLocked,id};if(key=="clippingMask")return {Field::GroupClipping,id};if(key=="cumulativeBlend")return {Field::GroupCumulativeBlend,id};
 }
 if(keys.size()==4&&keys[0]=="animation"&&keys[1]=="cels"){
  const auto cels=orderedCels(d);const auto i=index(keys[2]);if(i>=cels.size())invalid();const auto id=cels[i]->id;
  if(keys[3]=="opacity")return {Field::CelOpacity,id};if(keys[3]=="zIndex")return {Field::CelZIndex,id};
 }
 if(keys.size()==4&&keys[0]=="animation"&&keys[1]=="frames"){
  const auto i=index(keys[2]);if(i>=state.frames.size())invalid();const auto id=state.frames[i].id;
  if(keys[3]=="duration")return {Field::FrameDuration,id};if(keys[3]=="disabled")return {Field::FrameDisabled,id};
 }
 unsupported();
}
unsigned metadataType(PixelHistoryEdit::MetadataTarget target){
 using Field=PixelHistoryEdit::MetadataField;switch(target.field){
 case Field::Dirty:case Field::Loop:case Field::PixelGrid:case Field::ShowGrid:case Field::LayerVisible:case Field::LayerLocked:case Field::LayerAutoLink:case Field::LayerClipping:case Field::GroupVisible:case Field::GroupLocked:case Field::GroupClipping:case Field::GroupCumulativeBlend:case Field::FrameDisabled:return 0;
 case Field::CreatedAt:case Field::UpdatedAt:case Field::Name:case Field::LayerName:case Field::LayerDescription:case Field::GroupName:case Field::GroupDescription:case Field::LayerBlend:case Field::GroupBlend:return 1;
 default:return 2;
 }
}
PixelHistoryEdit::MetadataPatch::Value metadataValue(IJsonValue value,unsigned type){
 if(type==0){if(!kind(value,JsonValueType::Boolean))unsupported();return value.GetBoolean();}
 if(type==1)return string(value);
 if(!kind(value,JsonValueType::Number)||!std::isfinite(value.GetNumber()))unsupported();return value.GetNumber();
}
void validateMetadata(PixelHistoryEdit::MetadataTarget target,const PixelHistoryEdit::MetadataPatch::Value& value){
 using Field=PixelHistoryEdit::MetadataField;switch(target.field){
 case Field::StrokeCount:case Field::OperationCount:case Field::DrawingTimeMs:{const auto n=std::get<double>(value);if(n<0||std::floor(n)!=n||n>=18446744073709551616.)unsupported();break;}
 case Field::LayerBlend:case Field::GroupBlend:if(!parseLayerBlendMode(std::get<std::string>(value)))unsupported();break;
 case Field::LayerOpacity:case Field::GroupOpacity:case Field::CelOpacity:{const auto n=std::get<double>(value);if(n<0||n>1)unsupported();break;}
 case Field::CelZIndex:{const auto n=std::get<double>(value);if(n<std::numeric_limits<int>::min()||n>std::numeric_limits<int>::max()||std::floor(n)!=n)unsupported();break;}
 case Field::FrameDuration:{const auto n=std::get<double>(value);if(n<1||n>std::numeric_limits<int>::max()||std::floor(n)!=n)unsupported();break;}
 case Field::GridWidth:case Field::GridHeight:if(std::get<double>(value)<=0)unsupported();break;
 default:break;
 }
}
const timeline::Cel* pathCel(const Document& d,JsonArray path,const std::vector<const timeline::Cel*>& cels){
 const auto keys=pathKeys(path);
 if(keys.size()==5&&keys[0]=="animation"&&keys[1]=="cels"&&keys[3]=="surface"&&keys[4]=="pixels"){const auto i=index(keys[2]);if(i>=cels.size())invalid();return cels[i];}
 if(keys.size()==3&&keys[0]=="layers"&&keys[2]=="pixels"){const auto& layers=d.timeline().state().layers;const auto i=index(keys[1]);if(i>=layers.size())invalid();auto* cel=d.timeline().findCel(layers[layers.size()-1-i].id,d.frame().id);if(!cel)invalid();return cel;}
 unsupported();
}
std::shared_ptr<const PixelHistoryEdit> prepare(const Document& d,const Delta& delta,project::Limits limits,std::size_t& retained,std::u32string& name){
 if(delta.json.size()>limits.manifestBytes||delta.json.size()>limits.expandedBytes-retained)budget();retained+=delta.json.size();
 auto signedInteger=[](IJsonValue value){if(!kind(value,JsonValueType::Number))invalid();const auto n=value.GetNumber();if(!std::isfinite(n)||std::floor(n)!=n||n<std::numeric_limits<int>::min()||n>std::numeric_limits<int>::max())invalid();return int(n);};
 const auto root=JsonObject::Parse(winrt::to_hstring(delta.json));const auto patches=array(get(root,L"patches"));if(patches.Size()>limits.maxEntries||delta.buffers.size()>limits.maxEntries*2)budget();
 auto out=std::make_shared<PixelHistoryEdit>();out->retainedBytes=integer(get(root,L"bytes"));if(out->retainedBytes>limits.expandedBytes)budget();name=label(get(root,L"label"));const auto cels=orderedCels(d);
 if(auto value=get(root,L"invalidation")){const auto hint=object(value);const auto type=string(get(hint,L"kind"));if(type=="region"){const auto rect=object(get(hint,L"rect"));out->region=true;out->x=signedInteger(get(rect,L"x"));out->y=signedInteger(get(rect,L"y"));out->width=signedInteger(get(rect,L"width"));out->height=signedInteger(get(rect,L"height"));if(out->width<0||out->height<0)invalid();if(auto frame=get(hint,L"frameId"))out->frameId=string(frame);}else if(type!="full")invalid();}
 if(auto value=get(root,L"celTarget")){out->projectFrame=true;const auto target=object(value);const auto i=integer(get(target,L"index"));if(i>=cels.size())invalid();const auto* cel=cels[i];if(string(get(target,L"id"))!=cel->id||string(get(target,L"layerId"))!=cel->layerId||string(get(target,L"frameId"))!=cel->frameId)invalid();}
 else {
  // Native layers are views of their active canonical surface. Origins that
  // change need the structural/property adapter; never drop those changes.
  const auto origins=object(get(root,L"origins"));const auto& layers=d.timeline().state().layers;
  for(const auto* side:{L"before",L"after"}){const auto values=array(get(origins,side));if(values.Size()!=layers.size())invalid();for(std::size_t i=0;i<layers.size();++i){const auto value=object(values.GetAt(unsigned(i)));const auto* cel=d.timeline().findCel(layers[layers.size()-1-i].id,d.frame().id);const auto resolved=d.timeline().resolveSurface(cel->id);if(!resolved.surface)invalid();if(value.GetNamedNumber(L"x")!=resolved.surface->storageOriginX.value_or(0)||value.GetNamedNumber(L"y")!=resolved.surface->storageOriginY.value_or(0))unsupported();}}
 }
 std::map<std::pair<std::size_t,bool>,const Buffer*> buffers;
 for(const auto& b:delta.buffers){if(b.patch>=patches.Size()||!b.bytes||!buffers.emplace(std::make_pair(b.patch,b.after),&b).second)invalid();}
 std::size_t pixelBuffers=0;
 for(unsigned i=0;i<patches.Size();++i){const auto patch=object(patches.GetAt(i));PixelHistoryEdit::Patch p;
  if(!get(patch,L"offset")){
   const auto primary=metadataField(d,array(get(patch,L"path")));const auto type=metadataType(primary);auto metadata=std::make_shared<PixelHistoryEdit::MetadataPatch>();
   if(auto aliases=get(patch,L"aliases")){for(const auto& path:array(aliases)){const auto field=metadataField(d,array(path));if(metadataType(field)!=type)unsupported();metadata->fields.push_back(field);}}else metadata->fields.push_back(primary);
   metadata->before=metadataValue(get(patch,L"before"),type);metadata->after=metadataValue(get(patch,L"after"),type);if(type==1&&std::any_of(metadata->fields.begin(),metadata->fields.end(),[](const auto& field){using F=PixelHistoryEdit::MetadataField;return field.field==F::Name||field.field==F::LayerName||field.field==F::LayerDescription||field.field==F::GroupName||field.field==F::GroupDescription;})){metadata->beforeUnicode=label(get(patch,L"before"));metadata->afterUnicode=label(get(patch,L"after"));const auto bytes=(metadata->beforeUnicode.size()+metadata->afterUnicode.size())*sizeof(char32_t);if(bytes>limits.expandedBytes-retained)budget();retained+=bytes;}for(const auto& field:metadata->fields){const auto bytes=sizeof(field)+field.id.size();if(bytes>limits.expandedBytes-retained)budget();retained+=bytes;}for(const auto& field:metadata->fields){validateMetadata(field,metadata->before);validateMetadata(field,metadata->after);}p.metadata=std::move(metadata);out->patches.push_back(std::move(p));continue;
  }
  p.offset=integer(get(patch,L"offset"));pixelBuffers+=2;
  // Validate primary path even when aliases replace it, as in the archive codec.
  pathCel(d,array(get(patch,L"path")),cels);
  std::vector<JsonArray> paths;if(auto aliases=get(patch,L"aliases")){for(const auto& path:array(aliases))paths.push_back(array(path));}else paths.push_back(array(get(patch,L"path")));
  for(bool after:{false,true}){auto found=buffers.find({i,after});if(found==buffers.end()||found->second->type!="Uint8Array")invalid();const auto& bytes=found->second->bytes;if(bytes->size()>limits.expandedBytes-retained)budget();retained+=bytes->size();auto frozen=std::make_shared<const Bytes>(*bytes);if(after)p.after=std::move(frozen);else p.before=std::move(frozen);}
  if(p.before->size()!=p.after->size())invalid();
  for(const auto& path:paths){const auto* requested=pathCel(d,path,cels);const auto resolved=d.timeline().resolveSurface(requested->id);if(!resolved.source||!resolved.surface||resolved.source->text||resolved.source->tilemap||resolved.source->freeTiles)unsupported();const auto size=resolved.surface->pixels.size()*4;if(p.offset>size||p.after->size()>size-p.offset)invalid();p.owners.push_back(resolved.source->id);}
  // Keep alias order, including repeated owners: legacy executes every alias.
  out->patches.push_back(std::move(p));
 }
 if(buffers.size()!=pixelBuffers)invalid();return out;
}
}
class PixelHistory::Restoration {
 friend class PixelHistory;
 std::shared_ptr<const Document::RollbackPayload> current;
 std::u32string name;bool dirty=false,preserveViewedFrame=false;
 std::vector<Document::Edit> entries;
 std::size_t position=0,decoded=0;
 std::optional<std::size_t> entryLimit;
 std::optional<std::string> fingerprint;
};
std::size_t PixelHistory::decodedCheckpoints(const Restoration& prepared){return prepared.decoded;}
std::shared_ptr<const PixelHistory::Restoration> PixelHistory::prepareArchive(const ReadResult& archive,std::optional<std::size_t> entryLimit,project::Limits limits){
 Apartment apartment;
 if(archive.snapshots.size()!=archive.labels.size()+1||archive.labels.size()>limits.maxEntries)invalid();
 // A missing compiler cache is different from an explicit structural null.
 if(!archive.hasCachedDeltas)unsupported();
 if(archive.cachedDeltas.size()!=archive.labels.size())invalid();
 const auto window=restoreWindow(archive.labels.size(),archive.position,entryLimit);
 auto result=std::make_shared<Restoration>();result->position=window.position;result->entryLimit=entryLimit;result->fingerprint=archive.documentFingerprint;
 std::map<std::size_t,std::unique_ptr<Document>> documents;
 std::map<std::size_t,std::shared_ptr<const Document::RollbackPayload>> payloads;
 std::size_t retained=0;
 auto charge=[&](std::size_t bytes){if(bytes>limits.expandedBytes-retained)budget();retained+=bytes;};
 // Existing native rollback owns independent storage for these resources. Count
 // its retained raster/recording bytes, rather than charging compressed ZIP size.
 auto storageBytes=[&](const auto& state,const auto& recording,const auto& references,const auto& brushes){
  std::size_t bytes=sizeof(Document::RollbackPayload);if(bytes>limits.expandedBytes)budget();auto add=[&](std::size_t n){if(n>limits.expandedBytes-bytes)budget();bytes+=n;};
  for(const auto& c:state.cels){if(c.surface)add(c.surface->pixels.size()*sizeof(Pixel));if(c.text){add(c.text->text.size()*sizeof(c.text->text[0]));add(c.text->styleRuns.size()*sizeof(c.text->styleRuns[0]));add(c.text->transforms.size()*sizeof(c.text->transforms[0]));for(const auto& transform:c.text->transforms){add(transform.source.projectProperties.size()*sizeof(char16_t));add(transform.target.projectProperties.size()*sizeof(char16_t));}}}
  for(const auto& m:state.masks)add(m.mask.surface.pixels.size()*sizeof(Pixel));
  for(const auto& t:state.tilesets)add(t.pixels.size()*sizeof(Pixel));
  for(const auto& f:recording.snapshots)add(f.data.size());
  for(const auto& r:references)if(r.pixels)add(r.pixels->size()*sizeof(Pixel));
  for(const auto& r:brushes){add(r.brush.coverage.size());add(r.brush.colors.size()*sizeof(Pixel));add(r.brush.paintColors.size()*sizeof(Pixel));}
  return bytes;
 };
 auto payloadBytes=[&](const Document::RollbackPayload& p){return storageBytes(p.timeline,p.timelapse,p.references,p.brushes);};
 auto documentBytes=[&](const Document& d){return storageBytes(d.timeline().state(),d.timelapseSettings_,d.referenceImages_,d.projectBrushes_);};
 auto decode=[&](std::size_t index)->Document&{
  if(index>=archive.snapshots.size())invalid();
  if(auto found=documents.find(index);found!=documents.end())return *found->second;
  // Walk increment chains iteratively: old journals may contain many thousands
  // of increments before the retained window. Do not recurse on their depth.
  auto base=index;while(base&&!documents.count(base)&&archive.snapshots[base].increment())--base;
  if(!documents.count(base)){
   if(archive.snapshots[base].increment())invalid();
   auto value=project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(archive.snapshots[base].encoded(),limits)));
   charge(documentBytes(value));documents.emplace(base,std::make_unique<Document>(std::move(value)));++result->decoded;
  }
  if(base==index)return *documents.at(base);
  charge(documentBytes(*documents.at(base)));auto candidate=std::make_unique<Document>(*documents.at(base));
  for(auto i=base+1;i<=index;++i){
   const auto& increment=archive.snapshots[i].increment();if(!increment)invalid();
   const auto root=JsonObject::Parse(winrt::to_hstring(increment->json));
   if(auto frame=get(root,L"snapshotFrameId")){const auto id=string(frame);if(!id.empty()){if(!candidate->timeline().hasFrame(id))invalid();candidate->selectFrame(id);}}
   std::size_t temporary=0;std::u32string ignored;const auto edit=prepare(*candidate,*increment,limits,temporary,ignored);
   candidate->applyLocalHistoryPixels(*edit,true);
  }
  return *documents.emplace(index,std::move(candidate)).first->second;
 };
 // Only incremental cel-target snapshots authorize keeping the independently
 // viewed frame. A target on a cached transition alone does not authorize it.
 for(const auto& snapshot:archive.snapshots)if(const auto& increment=snapshot.increment()){
  const auto root=JsonObject::Parse(winrt::to_hstring(increment->json));if(get(root,L"celTarget"))result->preserveViewedFrame=true;
 }
 result->entries.reserve(window.end-window.begin);
 std::size_t segmentBegin=window.begin,segmentEnd=window.begin;
 for(auto i=window.begin;i<window.end;++i){
  Document::Edit edit{{},0,0};
  if(const auto& cached=archive.cachedDeltas[i]){
   auto delta=decodeDelta(std::make_shared<const Bytes>(*cached),limits);
   auto root=JsonObject::Parse(winrt::to_hstring(delta.json));root.SetNamedValue(L"label",JsonValue::CreateStringValue(winrt::to_hstring(archive.labels[i])));delta.json=winrt::to_string(root.Stringify());
   // Resolve paths against this structural segment, not against a checkpoint
   // whose layer/frame topology may belong to a different segment.
   if(i>=segmentEnd){segmentBegin=i;segmentEnd=i+1;while(segmentEnd<window.end&&archive.cachedDeltas[segmentEnd])++segmentEnd;}
   const auto context=archive.position>=segmentBegin&&archive.position<=segmentEnd?archive.position:segmentBegin;
   edit.terminalHistory=prepare(decode(context),delta,limits,retained,edit.label);
  }else{
   edit.terminalHistory=Document::LocalSnapshotHistory{};
   const auto& before=decode(i);const auto& after=decode(i+1);
   edit.localSnapshot()->beforeHistoryName=before.name();edit.localSnapshot()->afterHistoryName=after.name();edit.localSnapshot()->beforeHistoryDirty=before.dirty();edit.localSnapshot()->afterHistoryDirty=after.dirty();
   edit.label=label(JsonValue::CreateStringValue(winrt::to_hstring(archive.labels[i])));
  }
  result->entries.push_back(std::move(edit));
 }
 const auto current=std::min(archive.position,archive.labels.size());result->name=decode(current).name();result->dirty=decode(current).dirty();
 // Resolve every path/name before consuming decoded candidates. Move each
 // checkpoint's buffers into one immutable payload shared by adjacent entries.
 auto payload=[&](std::size_t index){
  if(auto found=payloads.find(index);found!=payloads.end())return found->second;
  auto value=std::move(*documents.at(index)).takeRollbackPayload();payloads.emplace(index,value);return value;
 };
 result->current=payload(current);
 for(std::size_t n=0;n<result->entries.size();++n){auto& edit=result->entries[n];if(!edit.localSnapshot())continue;const auto index=window.begin+n;edit.localSnapshot()->beforeRollback=payload(index);edit.localSnapshot()->afterRollback=payload(index+1);edit.localSnapshot()->rollbackBytes=payloadBytes(*edit.localSnapshot()->beforeRollback)+payloadBytes(*edit.localSnapshot()->afterRollback);}

 return result;
}
Document PixelHistory::materialize(JournalSnapshot::Ptr snapshot,project::Limits limits){
 if(!snapshot)throw std::invalid_argument("Missing history materialization snapshot");
 Apartment apartment;std::vector<std::shared_ptr<const Delta>> changes;
 while(snapshot->kind()==JournalSnapshot::Kind::Increment){
  if(changes.size()>=limits.maxEntries)budget();changes.push_back(snapshot->delta());snapshot=snapshot->base();
 }
 auto document=snapshot->kind()==JournalSnapshot::Kind::Archive
  ?project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(snapshot->archive(),limits)))
  :Document(snapshot->document());
 for(auto it=changes.rbegin();it!=changes.rend();++it){
  const auto root=JsonObject::Parse(winrt::to_hstring((*it)->json));
  if(auto frame=get(root,L"snapshotFrameId")){const auto id=string(frame);if(!id.empty()){if(!document.timeline().hasFrame(id))invalid();document.selectFrame(id);}}
  std::size_t retained=0;std::u32string ignored;const auto edit=prepare(document,**it,limits,retained,ignored);
  document.applyLocalHistoryPixels(*edit,true);
 }
 return document;
}
RestoreDecision PixelHistory::install(Document& d,const RestoreTicket& ticket,const Restoration& prepared){
 auto decision=ticket.decision(d,prepared.fingerprint);if(decision!=RestoreDecision::Ready)return decision;
 if(d.nextState_>std::numeric_limits<std::uint64_t>::max()-prepared.entries.size()-1)budget();
 auto entries=prepared.entries;auto name=prepared.name;
 for(std::size_t i=0;i<entries.size();++i){auto& edit=entries[i];edit.beforeState=d.nextState_+i;edit.afterState=edit.beforeState+1;}
 auto stack=[&]{try{return HistoryStore<Document::Edit>::prepareInstallation(std::move(entries),prepared.position,prepared.entryLimit?std::max(std::size_t(1),*prepared.entryLimit):std::numeric_limits<std::size_t>::max());}catch(const std::length_error&){budget();}}();
 // applyRollbackPayload allocates/validates its replacement before mutation.
 const auto viewedFrame=d.activeFrameId_;
 decision=ticket.decision(d,prepared.fingerprint);if(decision!=RestoreDecision::Ready)return decision;
 d.applyRollbackPayload(*prepared.current,true,prepared.preserveViewedFrame?&viewedFrame:nullptr);d.name_=std::move(name);d.modified_=prepared.dirty;
 d.history_.install(std::move(stack));
 d.state_=d.nextState_+prepared.position;d.nextState_+=d.history_.size()+1;++d.historyRevision_;++d.revision_;d.publishChange(true);
 return RestoreDecision::Ready;
}
RestoreDecision PixelHistory::install(Document& d,const RestoreTicket& ticket,const std::vector<Delta>& deltas,std::size_t position,const std::optional<std::string>& fingerprint,project::Limits limits){
 auto decision=ticket.decision(d,fingerprint);if(decision!=RestoreDecision::Ready)return decision;
 if(position>deltas.size())invalid();if(deltas.size()>limits.maxEntries)budget();
 if(d.nextState_>std::numeric_limits<std::uint64_t>::max()-deltas.size()-1)budget();
 Apartment apartment;std::vector<Document::Edit> entries;entries.reserve(deltas.size());std::size_t retained=0;
 for(std::size_t i=0;i<deltas.size();++i){Document::Edit edit{{},d.nextState_+i,d.nextState_+i+1};edit.terminalHistory=prepare(d,deltas[i],limits,retained,edit.label);entries.push_back(std::move(edit));}
 auto stack=[&]{try{return HistoryStore<Document::Edit>::prepareInstallation(std::move(entries),position,d.history_.limit());}catch(const std::length_error&){budget();}}();
 decision=ticket.decision(d,fingerprint);if(decision!=RestoreDecision::Ready)return decision;
 // Current checkpoint/identity/recording/dirty state is authoritative. Install
 // only the prepared stack, without invoking pushEdit, an operation or capture.
 d.history_.install(std::move(stack));d.state_=d.nextState_+position;d.nextState_+=deltas.size()+1;++d.historyRevision_;return RestoreDecision::Ready;
}
}
