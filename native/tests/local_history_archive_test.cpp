#include "local_history_archive.h"
#include "project_zip_writer.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <roapi.h>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <thread>
#define CHECK(value) do{if(!(value))throw std::runtime_error("History archive check failed: " #value);}while(0)
using namespace moon;
using namespace winrt::Windows::Data::Json;
using local_history::Bytes;
auto read(const std::filesystem::path& file){std::ifstream stream(file,std::ios::binary);if(!stream)throw std::runtime_error("Missing fixture "+file.u8string());return std::make_shared<const Bytes>(std::istreambuf_iterator<char>(stream),std::istreambuf_iterator<char>());}
void write(const std::filesystem::path& file,const Bytes& bytes){std::ofstream stream(file,std::ios::binary|std::ios::trunc);stream.write(reinterpret_cast<const char*>(bytes.data()),bytes.size());CHECK(bool(stream));}
JsonObject parse(const Bytes& bytes){return JsonObject::Parse(winrt::to_hstring(std::string(bytes.begin(),bytes.end())));}
template<class F>void reject(F function){bool rejected=false;try{function();}catch(const std::exception&){rejected=true;}CHECK(rejected);}
void compareDelta(const local_history::Delta& a,const local_history::Delta& b){
 CHECK(a.buffers.size()==b.buffers.size());for(std::size_t i=0;i<a.buffers.size();++i){const auto& x=a.buffers[i];const auto& y=b.buffers[i];CHECK(x.patch==y.patch&&x.after==y.after&&x.type==y.type&&*x.bytes==*y.bytes);}
}
int wmain(int argc,wchar_t** argv){
 const auto apartment=RoInitialize(RO_INIT_MULTITHREADED);
 try{
  {
  CHECK(argc==2);const auto root=std::filesystem::path(argv[1]);const auto cases=parse(*read(root/"cases.json"));
  for(const auto& name:cases.GetNamedArray(L"deltas")){
   const auto label=winrt::to_string(name.GetString());const auto source=read(root/(label+".zip"));const auto delta=local_history::decodeDelta(source);
   CHECK(!delta.buffers.empty());const auto encoded=local_history::encodeDelta(delta);compareDelta(delta,local_history::decodeDelta(encoded));write(root/(label+"-native.zip"),*encoded);
   project::Archive archive(encoded);CHECK(archive.entries().at("delta.json").method==8);
   auto invalid=delta;invalid.buffers.push_back(invalid.buffers.front());reject([&]{local_history::encodeDelta(invalid);});
   invalid=delta;invalid.buffers.front().type="BigInt64Array";reject([&]{local_history::encodeDelta(invalid);});
  }
  for(const auto& name:cases.GetNamedArray(L"valid")){
   const auto label=winrt::to_string(name.GetString());const auto folder=root/label;const auto bytes=read(folder/"legacy.zip");project::Archive archive(bytes);
   const auto manifest=parse(archive.read("manifest.json",8*1024*1024));const auto key=winrt::to_string(manifest.GetNamedString(L"projectKey"));auto decoded=local_history::readArchive(bytes,key);
   CHECK(decoded.snapshots.size()==decoded.labels.size()+1);CHECK(decoded.projectKey==key);
   CHECK(decoded.position==std::size_t(std::clamp(std::trunc(manifest.GetNamedNumber(L"position")),0.,double(decoded.labels.size()))));
   if(decoded.version==4)CHECK(decoded.documentFingerprint==std::optional<std::string>("saved-generation"));
   local_history::PreparedRequest request;request.manifestJson=decoded.manifestJson;
   request.deltas=decoded.hasCachedDeltas?decoded.cachedDeltas:std::vector<std::optional<Bytes>>(decoded.labels.size());
   if(decoded.version==4)request.increments.emplace(decoded.snapshots.size());
   for(std::size_t index=0;index<decoded.snapshots.size();++index){auto& snapshot=decoded.snapshots[index];
    if(decoded.version==3)CHECK(!snapshot.materialized());
    const auto data=snapshot.encoded();CHECK(snapshot.materialized()&&data->size()==snapshot.encodedSize());CHECK(data==snapshot.encoded());
    if(std::filesystem::exists(folder/("input-"+std::to_string(index)+".bin"))&&!snapshot.increment())CHECK(*data==*read(folder/("input-"+std::to_string(index)+".bin")));
    request.snapshots.push_back(data);if(snapshot.increment())(*request.increments)[index]=*snapshot.increment();
   }
   if(label=="shared"||label=="streaming"){
    std::size_t total=0;for(const auto& snapshot:request.snapshots)total+=snapshot->size();CHECK(bytes->size()<total/4);
   }
   // Direct increments override stale cached answers with their packed bytes.
   const auto originalDeltas=request.deltas;
   if(request.increments)for(std::size_t i=1;i<request.snapshots.size();++i)if((*request.increments)[i])request.deltas[i-1]=Bytes{0xff};
   auto result=local_history::packPreparedResult(request);const auto encoded=result.archive;
   CHECK(*encoded==*local_history::packPrepared(request));write(folder/"native.zip",*encoded);auto round=local_history::readArchive(encoded,key);
   CHECK(result.deltas==round.cachedDeltas);
   for(std::size_t i=0;i<result.deltas.size();++i){
    if(request.increments&&(*request.increments)[i+1])CHECK(result.deltas[i]&&*result.deltas[i]==*round.snapshots[i+1].encoded());
    else CHECK(result.deltas[i]==originalDeltas[i]);
   }

   CHECK(round.labels==decoded.labels&&round.position==decoded.position&&round.snapshots.size()==decoded.snapshots.size()&&round.hasCachedDeltas);
   for(std::size_t index=0;index<round.snapshots.size();++index){
    if(decoded.snapshots[index].increment())compareDelta(*round.snapshots[index].increment(),*decoded.snapshots[index].increment());
    else CHECK(*round.snapshots[index].encoded()==*decoded.snapshots[index].encoded());
   }
   project::Archive packed(encoded);CHECK(packed.entries().at("manifest.json").method==8&&packed.entries().at("snapshots.bin").method==0);
   if(decoded.version==3){auto lazy=local_history::readArchive(encoded,key);CHECK(!lazy.snapshots.front().materialized());local_history::Data a,b;std::thread first([&]{a=lazy.snapshots.front().encoded();}),second([&]{b=lazy.snapshots.front().encoded();});first.join();second.join();CHECK(a==b);}
   reject([&]{local_history::readArchive(bytes,key+"-other");});
   auto invalid=request;invalid.snapshots.pop_back();reject([&]{local_history::packPrepared(invalid);});
   invalid=request;invalid.deltas.push_back(std::nullopt);reject([&]{local_history::packPrepared(invalid);});
   project::Limits tiny;tiny.archiveBytes=10;reject([&]{local_history::readArchive(bytes,key,tiny);});reject([&]{local_history::packPrepared(request,tiny);});
  }
  for(const auto& name:cases.GetNamedArray(L"invalid")){
   const auto bytes=read(root/"invalid"/(winrt::to_string(name.GetString())+".zip"));project::Archive archive(bytes);const auto manifest=parse(archive.read("manifest.json",8*1024*1024));
   reject([&]{local_history::readArchive(bytes,winrt::to_string(manifest.GetNamedString(L"projectKey")));});
  }
  for(const auto& name:cases.GetNamedArray(L"badDeltas"))reject([&]{local_history::decodeDelta(read(root/"invalid-deltas"/(winrt::to_string(name.GetString())+".zip")));});
  // Cached-transition failure must be diagnosed before any document installation.
  auto bytes=read(root/"incremental/legacy.zip");project::Archive source(bytes);std::map<std::string,Bytes> files;for(const auto& entry:source.entries())files[entry.first]=source.read(entry.first,256*1024*1024);
  files.erase("deltas/0.zip");reject([&]{local_history::readArchive(std::make_shared<const Bytes>(project::encodeResourceArchive(files)),"project-increment");});
  files.erase("manifest.json");reject([&]{local_history::readArchive(std::make_shared<const Bytes>(project::encodeResourceArchive(files)),"project-increment");});
  std::cout<<"Legacy local-history v2/v3/v4, shared/streaming ZIP records, typed deltas, lazy reconstruction and rejection checks passed\n";
  }
  winrt::clear_factory_cache();if(SUCCEEDED(apartment))RoUninitialize();return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';winrt::clear_factory_cache();if(SUCCEEDED(apartment))RoUninitialize();return 1;}
}
