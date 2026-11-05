#include "javascript_text.h"
#include "local_history_archive.h"
#include "project_zip_writer.h"
#include "legacy_json_number.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <roapi.h>
#ifdef GetObject
#undef GetObject
#endif
#include <algorithm>
#include <cmath>
#include <limits>
#include <mutex>
#include <set>
namespace moon::local_history {
namespace {
using namespace winrt::Windows::Data::Json;
struct Apartment {
  HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);
  Apartment(){if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize history JSON parser");}
  ~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}
};
[[noreturn]] void bad(const char* message){throw std::runtime_error(message);}
[[noreturn]] void budget(){throw project::Error(project::ErrorKind::Limit,"Local history exceeds native archive budget");}
std::string json(IJsonValue value){return javascriptJsonUtf8(std::wstring_view(value.Stringify()));}
IJsonValue get(JsonObject object,const wchar_t* name){return object.GetNamedValue(name,nullptr);}
bool kind(IJsonValue value,JsonValueType type){return value&&value.ValueType()==type;}
bool finite(IJsonValue value){return kind(value,JsonValueType::Number)&&std::isfinite(value.GetNumber());}
bool integer(IJsonValue value){return finite(value)&&value.GetNumber()>=0&&value.GetNumber()<=9007199254740991.&&std::floor(value.GetNumber())==value.GetNumber();}
bool truth(IJsonValue value){if(!value)return false;switch(value.ValueType()){
 case JsonValueType::Null:return false;case JsonValueType::Boolean:return value.GetBoolean();
 case JsonValueType::Number:return value.GetNumber()!=0;case JsonValueType::String:return !value.GetString().empty();default:return true;}}
JsonObject object(IJsonValue value,const char* error){if(!kind(value,JsonValueType::Object))bad(error);return value.GetObject();}
JsonArray array(IJsonValue value,const char* error){if(!kind(value,JsonValueType::Array))bad(error);return value.GetArray();}
std::string string(IJsonValue value,const char* error){if(!kind(value,JsonValueType::String))bad(error);return winrt::to_string(value.GetString());}
JsonObject parse(const std::string& text,project::Limits limits){
 if(text.size()>limits.manifestBytes)budget();
 return JsonObject::Parse(winrt::to_hstring(text));
}
void set(JsonObject object,const wchar_t* name,IJsonValue value){object.SetNamedValue(name,value);}
std::size_t elementSize(const std::string& type){
 if(type=="Uint8Array"||type=="Uint8ClampedArray"||type=="Int8Array")return 1;
 if(type=="Uint16Array"||type=="Int16Array")return 2;
 if(type=="Uint32Array"||type=="Int32Array"||type=="Float32Array")return 4;
 if(type=="Float64Array")return 8;return 0;
}
bool validPath(IJsonValue value){
 if(!kind(value,JsonValueType::Array))return false;const auto keys=value.GetArray();if(!keys.Size())return false;
 for(const auto& key:keys){if(!kind(key,JsonValueType::String))return false;const auto name=key.GetString();if(name==L"__proto__"||name==L"constructor"||name==L"prototype")return false;}return true;
}
std::uint16_t u16(const Bytes& bytes,std::size_t offset){return bytes[offset]|std::uint16_t(bytes[offset+1])<<8;}
std::uint32_t u32(const Bytes& bytes,std::size_t offset){return u16(bytes,offset)|std::uint32_t(u16(bytes,offset+2))<<16;}
struct Span {std::size_t offset=0,size=0;};
struct Part {Data data;Span span;std::optional<std::uint32_t> payloadHash;};
// Port of snapshotParts: inspect central-directory boundaries, including ZIP
// data descriptors. Unrecognized layouts remain opaque, byte for byte.
std::vector<Part> snapshotParts(Data data){
 const auto& b=*data;auto opaque=[&]{return b.empty()?std::vector<Part>{}:std::vector<Part>{{data,{0,b.size()},std::nullopt}};};
 if(b.size()<22)return opaque();std::size_t end=b.size()-22,earliest=end>65535?end-65535:0;
 for(;;){if(u32(b,end)==0x06054b50&&end+22+u16(b,end+20)==b.size())break;if(end==earliest)return opaque();--end;}
 const auto count=u16(b,end+10);const std::size_t central=u32(b,end+16);
 if(!count||count==65535||central>end||u16(b,end+4)||u16(b,end+6))return opaque();
 std::set<std::size_t> boundaries{0,central,b.size()};
 std::map<std::size_t,std::pair<std::size_t,std::uint32_t>> payloads;std::size_t cursor=central;
 for(unsigned index=0;index<count;++index){
  if(cursor>end||end-cursor<46||u32(b,cursor)!=0x02014b50)return opaque();
  const std::size_t offset=u32(b,cursor+42);if(offset>central||central-offset<30||u32(b,offset)!=0x04034b50)return opaque();
  const std::uint64_t payload=std::uint64_t(offset)+30+u16(b,offset+26)+u16(b,offset+28),payloadEnd=payload+u32(b,cursor+20);
  if(payload>central||payloadEnd>central)return opaque();
  boundaries.insert(offset);boundaries.insert(std::size_t(payload));boundaries.insert(std::size_t(payloadEnd));
  payloads[std::size_t(payload)]={std::size_t(payloadEnd),u32(b,cursor+16)^std::uint32_t(payloadEnd-payload)};
  cursor+=46u+u16(b,cursor+28)+u16(b,cursor+30)+u16(b,cursor+32);
 }
 if(cursor>end)return opaque();std::vector<Part> result;
 for(auto it=boundaries.begin(),next=std::next(it);next!=boundaries.end();++it,++next){
  Part p{data,{*it,*next-*it},std::nullopt};const auto payload=payloads.find(*it);
  if(payload!=payloads.end()&&payload->second.first==*next)p.payloadHash=payload->second.second;result.push_back(std::move(p));
 }return result;
}
struct Shared {Bytes data;std::vector<std::vector<std::size_t>> indices;std::vector<std::size_t> lengths;};
Shared sharedSnapshotData(const std::vector<Data>& snapshots,project::Limits limits){
 Shared result;std::vector<Part> chunks;std::map<std::uint32_t,std::vector<std::size_t>> buckets;std::size_t total=0;
 for(const auto& snapshot:snapshots){std::vector<std::size_t> ids;
  for(const auto& part:snapshotParts(snapshot)){
   const auto& b=*part.data;const auto start=part.span.offset,size=part.span.size;
   const bool local=size>=30&&u32(b,start)==0x04034b50;
   const auto hashLength=local?std::min(size,std::size_t(30)+u16(b,start+26)+u16(b,start+28)):size;
   std::uint32_t hash=part.payloadHash.value_or(0x811c9dc5u^std::uint32_t(size));
   if(!part.payloadHash)for(std::size_t i=0;i<hashLength;++i)hash=(hash^b[start+i])*0x01000193u;
   auto& candidates=buckets[hash];std::optional<std::size_t> found;
   for(const auto id:candidates){const auto& existing=chunks[id];if(existing.span.size==size&&std::equal(b.begin()+start,b.begin()+start+size,existing.data->begin()+existing.span.offset)){found=id;break;}}
   if(!found){if(size>limits.expandedBytes-total||chunks.size()>=limits.maxEntries)budget();total+=size;found=chunks.size();chunks.push_back(part);candidates.push_back(*found);}
   ids.push_back(*found);if(ids.size()>limits.maxEntries)budget();
  }result.indices.push_back(std::move(ids));
 }
 result.data.reserve(total);for(const auto& part:chunks){result.lengths.push_back(part.span.size);result.data.insert(result.data.end(),part.data->begin()+part.span.offset,part.data->begin()+part.span.offset+part.span.size);}return result;
}
}
Delta decodeDelta(Data bytes,project::Limits limits){
 Apartment apartment;project::Archive archive(std::move(bytes),limits);
 const auto raw=archive.read("delta.json",limits.manifestBytes);auto root=parse(std::string(raw.begin(),raw.end()),limits);Delta result;result.json=json(root);
 const auto frame=get(root,L"snapshotFrameId");if(frame&&!kind(frame,JsonValueType::String))bad("无效的历史帧标识");
 const auto target=get(root,L"celTarget");if(truth(target)){
  const auto cel=object(target,"无效的历史 cel 标识");if(!integer(get(cel,L"index")))bad("无效的历史 cel 标识");
  for(const auto name:{L"id",L"layerId",L"frameId"})if(!kind(get(cel,name),JsonValueType::String))bad("无效的历史 cel 标识");
 }
 const auto patchesValue=get(root,L"patches"),affected=get(root,L"affectedLayerIds"),size=get(root,L"bytes"),invalidation=get(root,L"invalidation");
 if(!kind(patchesValue,JsonValueType::Array)||!kind(affected,JsonValueType::Array)||!finite(size)||size.GetNumber()<0||!kind(invalidation,JsonValueType::Object))bad("无效的历史差分索引");
 const auto invalidKind=get(invalidation.GetObject(),L"kind");if(!kind(invalidKind,JsonValueType::String)||(invalidKind.GetString()!=L"full"&&invalidKind.GetString()!=L"region"))bad("无效的历史差分索引");
 const auto origins=object(get(root,L"origins"),"无效的历史差分坐标");
 for(const auto side:{L"before",L"after"})for(const auto& origin:array(get(origins,side),"无效的历史差分坐标")){
  const auto position=object(origin,"无效的历史差分坐标");if(!finite(get(position,L"x"))||!finite(get(position,L"y")))bad("无效的历史差分坐标");
 }
 const auto patches=patchesValue.GetArray();if(patches.Size()>limits.maxEntries)budget();std::size_t retained=0;
 for(std::uint32_t index=0;index<patches.Size();++index){
  const auto patch=object(patches.GetAt(index),"无效的历史差分路径");const auto aliases=get(patch,L"aliases"),offset=get(patch,L"offset");
  if(!validPath(get(patch,L"path"))||(offset&&!integer(offset)))bad("无效的历史差分路径");
  if(truth(aliases))for(const auto& path:array(aliases,"无效的历史差分路径"))if(!validPath(path))bad("无效的历史差分路径");
  std::optional<std::pair<std::string,std::size_t>> before,after;
  for(const auto side:{L"before",L"after"}){
   const auto value=get(patch,side);if(!value||value.ValueType()==JsonValueType::Null||(value.ValueType()!=JsonValueType::Object&&value.ValueType()!=JsonValueType::Array))continue;
   const auto descriptor=object(value,"无效的历史差分数据");const auto type=string(get(descriptor,L"type"),"无效的历史差分数据"),file=string(get(descriptor,L"bufferFile"),"无效的历史差分数据");const auto element=elementSize(type);
   if(!element||!archive.entries().count(file))bad("无效的历史差分数据");
   const auto entry=archive.entries().at(file);if(entry.size>limits.expandedBytes-retained)budget();retained+=entry.size;auto data=std::make_shared<const Bytes>(archive.read(file,limits.expandedBytes));if(data->size()%element)bad("无效的历史差分数据");
   const bool isAfter=std::wstring_view(side)==L"after";if(isAfter)after={{type,data->size()}};else before={{type,data->size()}};
   result.buffers.push_back({index,isAfter,type,std::move(data)});
  }
  if(offset&&(!before||!after||before->first!="Uint8Array"||after->first!="Uint8Array"||before->second!=after->second))bad("无效的历史差分像素");
 }return result;
}
Data encodeDelta(const Delta& delta,project::Limits limits){
 Apartment apartment;auto root=parse(delta.json,limits);const auto patches=array(get(root,L"patches"),"无效的历史差分索引");
 std::map<std::pair<std::size_t,bool>,const Buffer*> buffers;for(const auto& value:delta.buffers){
  if(value.patch>=patches.Size()||!value.bytes||!elementSize(value.type)||value.bytes->size()%elementSize(value.type)||!buffers.emplace(std::make_pair(value.patch,value.after),&value).second)bad("无效的历史差分数据");
 }
 std::map<std::string,Bytes> files;std::size_t bufferIndex=0;
 for(std::uint32_t index=0;index<patches.Size();++index){auto patch=object(patches.GetAt(index),"无效的历史差分路径");for(const bool after:{false,true}){
  const auto found=buffers.find({index,after});if(found==buffers.end())continue;const auto& buffer=*found->second;const auto file="buffers/"+std::to_string(bufferIndex++);
  files[file]=*buffer.bytes;JsonObject descriptor;set(descriptor,L"bufferFile",JsonValue::CreateStringValue(winrt::to_hstring(file)));set(descriptor,L"type",JsonValue::CreateStringValue(winrt::to_hstring(buffer.type)));set(patch,after?L"after":L"before",descriptor);
 }}const auto text=json(root);files["delta.json"]=Bytes(text.begin(),text.end());return std::make_shared<const Bytes>(project::encodeResourceArchive(files,limits,6));
}
struct Snapshot::Storage {
 Data data;std::vector<Span> spans;std::size_t size=0;std::optional<Delta> delta;
 mutable std::mutex mutex;mutable Data cache;
};
Data Snapshot::encoded()const{
 std::lock_guard<std::mutex> lock(storage_->mutex);if(!storage_->cache){auto bytes=std::make_shared<Bytes>();bytes->reserve(storage_->size);for(const auto span:storage_->spans)bytes->insert(bytes->end(),storage_->data->begin()+span.offset,storage_->data->begin()+span.offset+span.size);storage_->cache=std::move(bytes);}return storage_->cache;
}
bool Snapshot::materialized()const{std::lock_guard<std::mutex> lock(storage_->mutex);return bool(storage_->cache);}
std::size_t Snapshot::encodedSize()const{return storage_->size;}
const std::optional<Delta>& Snapshot::increment()const{return storage_->delta;}
ReadResult readArchive(Data bytes,const std::string& expectedProjectKey,project::Limits limits){
 Apartment apartment;project::Archive archive(std::move(bytes),limits);if(!archive.entries().count("manifest.json"))bad("本地历史数据缺少索引");
 const auto raw=archive.read("manifest.json",limits.manifestBytes);auto root=parse(std::string(raw.begin(),raw.end()),limits);ReadResult result;result.manifestJson=json(root);
 const auto version=get(root,L"version"),labels=get(root,L"labels"),key=get(root,L"projectKey");
 if(!integer(version)||(version.GetNumber()!=2&&version.GetNumber()!=3&&version.GetNumber()!=4)||!kind(key,JsonValueType::String)||winrt::to_string(key.GetString())!=expectedProjectKey||!kind(labels,JsonValueType::Array))bad("本地历史数据版本不兼容");
 result.version=int(version.GetNumber());result.projectKey=expectedProjectKey;const auto names=labels.GetArray();if(names.Size()>=limits.maxEntries)budget();
 for(const auto& name:names)result.labels.push_back(string(name,"本地历史数据版本不兼容"));
 const auto position=project::legacyjson::number(get(root,L"position"));if(!std::isfinite(position))bad("本地历史数据版本不兼容");result.position=std::size_t(std::clamp(std::trunc(position),0.,double(result.labels.size())));
 const auto fingerprint=get(root,L"documentFingerprint");if(truth(fingerprint))result.documentFingerprint=string(fingerprint,"本地历史数据版本不兼容");
 if(result.version==2){
  for(std::size_t index=0;index<=result.labels.size();++index){const auto file="snapshots/"+std::to_string(index)+".moonsprite";if(!archive.entries().count(file))bad("本地历史数据不完整");auto storage=std::make_shared<Snapshot::Storage>();storage->cache=std::make_shared<const Bytes>(archive.read(file,limits.archiveBytes));storage->size=storage->cache->size();result.snapshots.push_back(Snapshot(std::move(storage)));}
 }else{
  const auto lengths=get(root,L"chunkLengths"),indices=get(root,L"snapshotChunks");
  if(!archive.entries().count("snapshots.bin")||!kind(lengths,JsonValueType::Array)||!kind(indices,JsonValueType::Array)||indices.GetArray().Size()!=result.labels.size()+1)bad("本地历史共享数据不完整");
  auto data=std::make_shared<const Bytes>(archive.read("snapshots.bin",limits.expandedBytes));std::vector<Span> chunks;std::size_t offset=0;
  if(lengths.GetArray().Size()>limits.maxEntries)budget();
  for(const auto& length:lengths.GetArray()){if(!integer(length)||length.GetNumber()<=0||length.GetNumber()>double(data->size()-offset))bad("无效的本地历史数据块");const auto size=std::size_t(length.GetNumber());chunks.push_back({offset,size});offset+=size;}
  if(offset!=data->size())bad("无效的本地历史数据块");
  for(const auto& value:indices.GetArray()){
   const auto ids=array(value,"无效的本地历史快照索引");if(!ids.Size())bad("无效的本地历史快照索引");if(ids.Size()>limits.maxEntries)budget();auto storage=std::make_shared<Snapshot::Storage>();storage->data=data;
   for(const auto& id:ids){if(!integer(id)||id.GetNumber()>=double(chunks.size()))bad("无效的本地历史快照索引");const auto span=chunks[std::size_t(id.GetNumber())];if(span.size>0x7fffffffu-storage->size)bad("本地历史快照过大");if(span.size>limits.archiveBytes-storage->size)budget();storage->size+=span.size;storage->spans.push_back(span);}
   result.snapshots.push_back(Snapshot(std::move(storage)));
  }
  if(result.version==4){const auto kinds=get(root,L"snapshotDeltas");if(!kind(kinds,JsonValueType::Array)||kinds.GetArray().Size()!=result.snapshots.size())bad("无效的增量历史索引");const auto flags=kinds.GetArray();
   for(std::uint32_t index=0;index<flags.Size();++index){const auto flag=flags.GetAt(index);if(!kind(flag,JsonValueType::Boolean)||(index==0&&flag.GetBoolean()))bad("无效的增量历史索引");if(flag.GetBoolean())result.snapshots[index].storage_->delta=decodeDelta(result.snapshots[index].encoded(),limits);}
  }
 }
 const auto deltaVersion=get(root,L"deltaVersion"),deltas=get(root,L"deltas");result.hasCachedDeltas=kind(deltaVersion,JsonValueType::Number)&&deltaVersion.GetNumber()==1&&kind(deltas,JsonValueType::Array)&&deltas.GetArray().Size()==result.labels.size();
 if(result.hasCachedDeltas)for(std::uint32_t index=0;index<deltas.GetArray().Size();++index){if(!truth(deltas.GetArray().GetAt(index))){result.cachedDeltas.push_back(std::nullopt);continue;}const auto file="deltas/"+std::to_string(index)+".zip";if(!archive.entries().count(file))bad("本地历史差分数据不完整");result.cachedDeltas.push_back(archive.read(file,limits.archiveBytes));}
 return result;
}
PackResult packPreparedResult(const PreparedRequest& request,project::Limits limits){
 Apartment apartment;auto root=parse(request.manifestJson,limits);const auto labels=array(get(root,L"labels"),"本地历史数据不完整");
 if(request.snapshots.size()!=std::size_t(labels.Size())+1||request.deltas.size()!=labels.Size())bad("本地历史数据不完整");if(request.snapshots.size()>limits.maxEntries)budget();
 if(request.increments&&(request.increments->size()!=request.snapshots.size()||request.increments->front()))bad("无效的增量历史索引");
 std::vector<Data> encoded;auto deltas=request.deltas;JsonArray kinds;
 for(std::size_t index=0;index<request.snapshots.size();++index){
  const bool incremental=request.increments&&(*request.increments)[index].has_value();kinds.Append(JsonValue::CreateBooleanValue(incremental));
  if(incremental){auto bytes=encodeDelta(*(*request.increments)[index],limits);encoded.push_back(bytes);deltas[index-1]=*bytes;}
  else{if(!request.snapshots[index])bad("本地历史数据不完整");if(request.snapshots[index]->size()>limits.archiveBytes)budget();encoded.push_back(request.snapshots[index]);}
 }
 auto shared=sharedSnapshotData(encoded,limits);JsonArray lengths,indices,flags;
 for(const auto size:shared.lengths)lengths.Append(JsonValue::CreateNumberValue(double(size)));
 for(const auto& ids:shared.indices){JsonArray list;for(const auto id:ids)list.Append(JsonValue::CreateNumberValue(double(id)));indices.Append(list);}
 std::map<std::string,Bytes> files;files["snapshots.bin"]=std::move(shared.data);
 for(std::size_t index=0;index<deltas.size();++index){flags.Append(JsonValue::CreateBooleanValue(deltas[index].has_value()));if(deltas[index])files["deltas/"+std::to_string(index)+".zip"]=*deltas[index];}
 set(root,L"version",JsonValue::CreateNumberValue(request.increments?4:3));if(request.increments)set(root,L"snapshotDeltas",kinds);else if(root.HasKey(L"snapshotDeltas"))root.Remove(L"snapshotDeltas");
 set(root,L"deltaVersion",JsonValue::CreateNumberValue(1));set(root,L"deltas",flags);set(root,L"snapshotChunks",indices);set(root,L"chunkLengths",lengths);
 const auto manifest=json(root);files["manifest.json"]=Bytes(manifest.begin(),manifest.end());return {std::make_shared<const Bytes>(project::encodeResourceArchive(files,limits,0,{{"manifest.json",6}})),std::move(deltas)};
}
Data packPrepared(const PreparedRequest& request,project::Limits limits){return packPreparedResult(request,limits).archive;}
}
