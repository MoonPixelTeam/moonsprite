#include "raster_snapshot.h"
#include <iostream>
#include <stdexcept>
using namespace moon;
static void require(bool p,const char* m){if(!p)throw std::runtime_error(m);}
int main(){try{
  timeline::State source;source.layers={{"l",U"Layer"}};source.frames={{"f",100},{"g",100}};
  timeline::Cel owner;owner.id="c";owner.layerId="l";owner.frameId="f";
  owner.surface=timeline::Surface{512,512,-2,3,4,5,moon::timeline::LinkedPixelStorage(std::vector<timeline::Pixel>(512*512,0x80123456))};
  timeline::Cel linked;linked.id="d";linked.layerId="l";linked.frameId="g";linked.linkedCelId="c";source.cels={owner,linked};
  RasterSnapshot snapshot(source);const auto future=std::chrono::steady_clock::now()+std::chrono::seconds(10);
  require(!snapshot.advance(source,std::chrono::steady_clock::now()),"Expired budget copied pixels");require(snapshot.copiedPixels()==0,"Expired budget allocated pixel payload");
  require(!snapshot.advance(source,future,16384),"Snapshot ignored byte budget");require(snapshot.copiedPixels()==16384,"Chunk size drift");
  require(snapshot.advance(source,future),"Snapshot did not complete");auto state=snapshot.take();
  require(state.cels[0].surface->pixels==source.cels[0].surface->pixels,"Snapshot bytes changed");require(state.cels[0].surface->offsetX==-2 && state.cels[0].surface->storageOriginY==5,"Raster metadata lost");
  require(state.cels[1].linkedCelId=="c" && !state.cels[1].surface,"Link was flattened");source.cels[0].surface->pixels[0]=0;require(state.cels[0].surface->pixels[0]==0x80123456,"Snapshot retained mutable pixels");
  // Reject generation-free metadata changes before copying the next payload chunk.
  auto rejectsMetadata=[&](auto mutate,const char* message){
    auto changed=source;RasterSnapshot captured(changed);
    require(!captured.advance(changed,future,16),"Metadata fixture must remain partial");
    const auto copied=captured.copiedPixels();mutate(changed);
    require(!captured.matches(changed),message);
    bool refused=false;try{captured.advance(changed,future,16);}catch(const std::logic_error&){refused=true;}
    require(refused,message);require(captured.copiedPixels()==copied,"Stale metadata copied another payload chunk");
  };
  rejectsMetadata([](auto& s){s.cels[0].surface->width=256;s.cels[0].surface->height=1024;},"Equal-area stride change entered snapshot");
  rejectsMetadata([](auto& s){++s.cels[0].surface->offsetX;},"Same-size world offset change entered snapshot");
  rejectsMetadata([](auto& s){++*s.cels[0].surface->storageOriginY;},"Stable history origin change entered snapshot");
  rejectsMetadata([](auto& s){s.cels[0].surface->pixels.pop_back();},"Changed payload length entered snapshot");
  rejectsMetadata([](auto& s){s.cels[1].linkedCelId.reset();},"Cel owner relationship change entered snapshot");
  RasterSnapshot stale(source);source.cels[0].id="changed";bool rejected=false;try{stale.advance(source,future);}catch(const std::logic_error&){rejected=true;}require(rejected,"Changed source accepted");
  std::cout<<"Bounded, independent, metadata-preserving raster snapshot passed\n";
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
