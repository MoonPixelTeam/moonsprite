#include "project_reader.h"
#include <filesystem>
#include <fstream>
#include <iostream>
using namespace moon::project;
namespace {
void check(bool ok,const char* message) {if(!ok) throw std::runtime_error(message);}
Bytes load(const std::filesystem::path& path) {std::ifstream in(path,std::ios::binary);if(!in) throw std::runtime_error("Missing fixture");return Bytes(std::istreambuf_iterator<char>(in),{});}
void put16(Bytes& b,std::size_t at,unsigned n) {b.at(at)=n&255;b.at(at+1)=n>>8;}
void put32(Bytes& b,std::size_t at,unsigned n) {for(int i=0;i<4;++i)b.at(at+i)=(n>>(8*i))&255;}
template<class F> void rejects(F work,ErrorKind kind) {try {work();} catch(const Error& e) {check(e.kind==kind,"Wrong diagnostic category");return;}throw std::runtime_error("Corrupt/unsupported input accepted");}
Archive archive(const Bytes& b,Limits limits={}) {return Archive(std::make_shared<const Bytes>(b),limits);}
}
int wmain(int argc,wchar_t** argv) {
  try {
    check(argc==2,"Fixture directory argument required");const auto dir=std::filesystem::path(argv[1]);
    for(const auto name:{"legacy-0.zip","legacy-6.zip"}) {
      const auto bytes=load(dir/name);auto zip=archive(bytes);check(zip.entries().size()==4,"Entry count changed");
      auto rgba=decodeRgba(zip.read("layers/raw.rgba",16),"raw",2,2,16);
      check(rgba==std::vector<std::uint32_t>({0xff1e140a,0x0046505a,0x80030201,0xfcfdfeff}),"Raw RGBA/transparent RGB mismatch");
      auto edge=decodeRgba(zip.read("cels/edge.rgba.tiles",1000),"sparse-tiles-v1",130,66,130*66*4);
      check(edge.size()==130*66 && edge[65*130+129]==0xff050403 && edge[64*130+128]==0x0046505a && edge[0]==0,"Sparse edge tiles changed");
      auto empty=decodeRgba(zip.read("cels/empty.rgba.tiles",100),"sparse-tiles-v1",64,64,64*64*4);
      check(empty==std::vector<std::uint32_t>(64*64),"Empty sparse raster changed");
      rejects([&]{zip.read("absent",1024);},ErrorKind::Corrupt);
      rejects([&]{zip.read("layers/raw.rgba",15);},ErrorKind::Limit);
      Limits limit;limit.archiveBytes=1;rejects([&]{archive(bytes,limit);},ErrorKind::Limit);
      limit=Limits{};limit.expandedBytes=1;rejects([&]{archive(bytes,limit);},ErrorKind::Limit);
      auto truncated=bytes;truncated.resize(21);rejects([&]{archive(truncated);},ErrorKind::Corrupt);
      auto wrongHeader=bytes;wrongHeader[0]=0;auto invalid=archive(wrongHeader);
      rejects([&]{invalid.read("manifest.json",1024);},ErrorKind::Corrupt);
    }
    rejects([&]{decodeRgba({},"raw",0xffffffff,0xffffffff,100000);},ErrorKind::Limit);
    auto sparse=load(dir/"edge.tiles");
    rejects([&]{decodeRgba(sparse,"sparse-tiles-v1",131,66,100000);},ErrorKind::Corrupt);
    rejects([&]{decodeRgba(sparse,"sparse-tiles-v1",130,66,16);},ErrorKind::Limit);
    rejects([&]{decodeRgba(sparse,"unknown",130,66,100000);},ErrorKind::Unsupported);
    auto bad=sparse;put32(bad,36,0);rejects([&]{decodeRgba(bad,"sparse-tiles-v1",130,66,100000);},ErrorKind::Corrupt);
    bad=sparse;put16(bad,32,64);rejects([&]{decodeRgba(bad,"sparse-tiles-v1",130,66,100000);},ErrorKind::Corrupt);
    bad=sparse;bad.push_back(0);rejects([&]{decodeRgba(bad,"sparse-tiles-v1",130,66,100000);},ErrorKind::Corrupt);
    auto stored=load(dir/"legacy-0.zip");auto zip=archive(stored);const auto e=zip.entries().at("layers/raw.rgba");
    // Corrupt stored payload without changing directory metadata; CRC must catch it.
    auto corrupt=stored;const auto nameLength=corrupt[e.offset+26]+256*corrupt[e.offset+27];const auto extra=corrupt[e.offset+28]+256*corrupt[e.offset+29];corrupt[e.offset+30+nameLength+extra]^=1;
    auto invalid=archive(corrupt);rejects([&]{invalid.read("layers/raw.rgba",16);},ErrorKind::Corrupt);
    std::cout<<"Project ZIP/RGBA legacy fixture tests passed\n";return 0;
  } catch(const std::exception& e) {std::cerr<<e.what()<<'\n';return 1;}
}
