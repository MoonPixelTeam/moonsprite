#include "local_history_raster_cost.h"
#include "project_manifest.h"
#include "local_history_diff.h"
#include <unordered_map>
#include <unordered_set>
#include <tuple>
#include <algorithm>
namespace moon::local_history {
namespace {
using Key=std::tuple<std::string,std::string,int,int>;
struct KeyHash {std::size_t operator()(const Key& k)const{std::size_t h=0;auto mix=[&](std::size_t value){h^=value+0x9e3779b9u+(h<<6)+(h>>2);};mix(std::hash<std::string>{}(std::get<0>(k)));mix(std::hash<std::string>{}(std::get<1>(k)));mix(std::hash<int>{}(std::get<2>(k)));mix(std::hash<int>{}(std::get<3>(k)));return h;}};
Key key(const project::ManifestRaster& r){return {r.dataFile,r.dataEncoding,r.width,r.height};}
[[noreturn]]void invalid(){throw std::invalid_argument("Invalid decoded history raster layout");}
std::uint32_t read(const project::Bytes& bytes,std::size_t at,int count){if(at>bytes.size()||std::size_t(count)>bytes.size()-at)invalid();std::uint32_t n=0;for(int i=0;i<count;++i)n|=std::uint32_t(bytes[at+i])<<(8*i);return n;}
}
struct DecodedHistoryRasterStorage::Impl {
 struct Layout {project::Bytes data,offsets;int width=0,height=0,left=0,top=0,right=-1,bottom=-1;bool sparse=false,visible=false;std::size_t backingBytes=0,payloadBytes=0,offsetBytes=0;const void* backing=nullptr;};
 std::shared_ptr<const project::Bytes> archive;bool comparison=false;
 std::unordered_map<Key,Layout,KeyHash> layouts;
 std::unordered_map<std::string,std::size_t> files;
 explicit Impl(const project::ReadManifest& source,bool retain):archive(source.sourceArchive),comparison(retain){
  if(!archive||source.colorMode!="rgba")invalid();project::Archive zip(archive);
  auto prepare=[&](const std::shared_ptr<const project::ManifestRaster>& raster){
   if(!raster)return;const auto& r=*raster;if(layouts.count(key(r)))return;
   if(r.width<1||r.height<1||std::uint64_t(r.width)*r.height>project::Limits{}.expandedBytes/4)invalid();
   const auto found=zip.entries().find(r.dataFile);if(found==zip.entries().end())invalid();auto& out=layouts[key(r)];out.width=r.width;out.height=r.height;out.left=r.width;out.top=r.height;
   if(r.dataEncoding=="raw"){
    if(found->second.size!=std::uint64_t(r.width)*r.height*4)invalid();
    const auto file=files.emplace(r.dataFile,found->second.size).first;
    out.backing=found->second.method==0?static_cast<const void*>(archive.get()):static_cast<const void*>(&file->second);
    out.backingBytes=found->second.method==0?archive->size():found->second.size;if(comparison)out.data=zip.read(r.dataFile,project::Limits{}.expandedBytes);return;
   }
   if(r.dataEncoding!="sparse-tiles-v1")invalid();out.sparse=true;const auto data=zip.read(r.dataFile,project::Limits{}.expandedBytes);
   if(read(data,0,4)!=0x3154534d||read(data,4,2)!=64||read(data,6,1)!=1||read(data,8,4)!=std::uint32_t(r.width)||read(data,12,4)!=std::uint32_t(r.height))invalid();
   const std::uint64_t count=read(data,16,4),end=24+count*16,columns=(std::uint64_t(r.width)+63)/64,rows=(std::uint64_t(r.height)+63)/64;
   if(end>data.size()||count>columns*rows||read(data,20,4)!=data.size()-end)invalid();
   if(comparison)out.offsets.resize(std::size_t(columns*rows)*4);std::size_t offset=std::size_t(end);std::unordered_set<std::uint64_t> slots;
   for(std::size_t i=0;i<count;++i){const auto at=24+i*16;const auto x=read(data,at,4),y=read(data,at+4,4),w=read(data,at+8,2),h=read(data,at+10,2);
    if(x>=std::uint32_t(r.width)||y>=std::uint32_t(r.height)||x%64||y%64||w!=std::min(64u,std::uint32_t(r.width)-x)||h!=std::min(64u,std::uint32_t(r.height)-y)||read(data,at+12,4)!=offset||!slots.emplace((std::uint64_t(y)<<32)|x).second)invalid();
    const auto size=std::size_t(w)*h*4;if(size>data.size()-offset)invalid();const auto slot=(std::size_t(y)/64*std::size_t(columns)+x/64)*4;const auto encoded=std::uint32_t(offset-std::size_t(end)+1);if(comparison)for(int b=0;b<4;++b)out.offsets[slot+b]=std::uint8_t(encoded>>(8*b));out.left=std::min(out.left,int(x));out.top=std::min(out.top,int(y));out.right=std::max(out.right,int(x+w-1));out.bottom=std::max(out.bottom,int(y+h-1));offset+=size;
   }
   if(offset!=data.size())invalid();out.visible=count!=0;out.payloadBytes=data.size()-std::size_t(end);out.offsetBytes=std::size_t(columns*rows)*4;if(comparison)out.data.assign(data.begin()+std::size_t(end),data.end());
  };
  for(const auto& layer:source.layers)prepare(layer.surface);for(const auto& cel:source.cels)prepare(cel.surface);
 }
};
DecodedHistoryRasterStorage::DecodedHistoryRasterStorage(const project::ReadManifest& source,bool retainComparisonBytes):impl_(std::make_unique<Impl>(source,retainComparisonBytes)){}
DecodedHistoryRasterStorage::~DecodedHistoryRasterStorage()=default;
std::vector<HistoryRasterStorageRoots> DecodedHistoryRasterStorage::appendComparison(HistoryCompareDocument& graph,const std::vector<const project::ManifestRaster*>& rasters,project::Limits limits)const{
 const auto start=graph.values.size();try{if(!impl_->comparison)throw std::invalid_argument("Raster comparison bytes were not prepared");
  using V=HistoryCompareValue;using K=V::Kind;std::size_t byteCount=0;std::unordered_set<const project::Bytes*> buffers;for(const auto& value:graph.values)if(value.kind==K::View&&value.view.buffer&&buffers.insert(value.view.buffer.get()).second){if(value.view.buffer->size()>limits.expandedBytes-byteCount)throw project::Error(project::ErrorKind::Limit,"Raster comparison byte budget exceeded");byteCount+=value.view.buffer->size();}
  std::size_t stringUnits=0;for(const auto& value:graph.values)if(value.kind==K::String){if(value.text.size()>limits.manifestBytes/2-stringUnits)throw project::Error(project::ErrorKind::Limit,"Raster comparison string budget exceeded");stringUnits+=value.text.size();}
  const auto node=[&](V value){if(graph.values.size()>=limits.maxEntries)throw project::Error(project::ErrorKind::Limit,"Raster comparison node budget exceeded");graph.values.push_back(std::move(value));return graph.values.size()-1;};
  const auto object=[&]{V v;v.kind=K::Object;return node(std::move(v));};const auto number=[&](double n){V v;v.kind=K::Number;v.number=n;return node(std::move(v));};const auto text=[&](std::u16string text){if(text.size()>limits.manifestBytes/2-stringUnits)throw project::Error(project::ErrorKind::Limit,"Raster comparison string budget exceeded");stringUnits+=text.size();V v;v.kind=K::String;v.text=std::move(text);return node(std::move(v));};
  const auto view=[&](const project::Bytes& bytes,const char* type){if(bytes.size()>limits.expandedBytes-byteCount)throw project::Error(project::ErrorKind::Limit,"Raster comparison byte budget exceeded");byteCount+=bytes.size();V v;v.kind=K::View;v.view={std::make_shared<const project::Bytes>(bytes),0,bytes.size(),type};return node(std::move(v));};const auto add=[&](std::size_t owner,const char* key,std::size_t child){graph.values[owner].properties.emplace_back(key,child);};
  std::unordered_map<const Impl::Layout*,HistoryRasterStorageRoots> shared;std::vector<HistoryRasterStorageRoots> result;
  for(const auto* raster:rasters){if(!raster)invalid();const auto found=impl_->layouts.find(key(*raster));if(found==impl_->layouts.end())invalid();const auto& layout=found->second;const auto previous=shared.find(&layout);
   if(!layout.sparse){if(previous!=shared.end()){result.push_back(previous->second);continue;}const HistoryRasterStorageRoots roots{view(layout.data,"Uint8ClampedArray"),{}};shared.emplace(&layout,roots);result.push_back(roots);continue;}
   // historyDocumentTransferView allocates one tiny pixels view per surface,
   // while decodePixels caches the sparse runtime object for each resource key.
   const auto pixels=view(project::Bytes(4),"Uint8ClampedArray");if(previous!=shared.end()){result.push_back({pixels,previous->second.runtimeRaster});continue;}
   const auto runtime=object();add(runtime,"kind",text(u"sparse-tiles-v1"));add(runtime,"format",text(u"rgba"));add(runtime,"width",number(layout.width));add(runtime,"height",number(layout.height));add(runtime,"tileSize",number(64));add(runtime,"data",view(layout.data,"Uint8Array"));add(runtime,"tileOffsets",view(layout.offsets,"Int32Array"));
   if(layout.visible){const auto bounds=object();add(bounds,"x",number(layout.left));add(bounds,"y",number(layout.top));add(bounds,"width",number(layout.right-layout.left+1));add(bounds,"height",number(layout.bottom-layout.top+1));add(runtime,"visibleBounds",bounds);}else{V v;v.kind=K::Null;add(runtime,"visibleBounds",node(std::move(v)));}
   const HistoryRasterStorageRoots roots{pixels,runtime};shared.emplace(&layout,roots);result.push_back(roots);
  }return result;
 }catch(...){graph.values.resize(start);throw;}
}
HistoryRasterStorageRoots DecodedHistoryRasterStorage::append(HistoryCostBuilder& b,const project::ManifestRaster& raster)const{
 const auto start=b.mark();try{
  const auto found=impl_->layouts.find(key(raster));if(found==impl_->layouts.end())invalid();const auto& layout=found->second;
  if(!layout.sparse)return {b.view(layout.backing,layout.backingBytes,&layout),{}};
  // Transfer allocates one tiny pixels buffer per surface even when its compact
  // runtime object is shared with another projected layer/cel surface.
  const auto pixels=b.ownedView(4);const auto [runtime,created]=b.object(&layout);
  if(created){b.add(runtime,b.string(std::string("sparse-tiles-v1")));b.add(runtime,b.string(std::string("rgba")));for(int i=0;i<3;++i)b.add(runtime,b.node());
   b.add(runtime,b.view(&layout.payloadBytes,layout.payloadBytes));b.add(runtime,b.view(&layout.offsetBytes,layout.offsetBytes));
   if(layout.visible){const auto bounds=b.object();for(int i=0;i<4;++i)b.add(bounds,b.node());b.add(runtime,bounds);}else b.add(runtime,b.node());
  }
  return {pixels,runtime};
 }catch(...){b.rollback(start);throw;}
}
}
