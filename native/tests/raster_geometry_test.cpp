#include "raster_geometry.h"
#include <iostream>
#include <stdexcept>
#define CHECK(...) do{if(!(__VA_ARGS__))throw std::runtime_error(#__VA_ARGS__);}while(false)
using namespace moon;
int main(){try{
 timeline::Surface s;s.width=s.height=64;s.pixels.resize(4096);const timeline::Pixel blue=0xfff07929;for(int y=12;y<36;++y)for(int x=10;x<42;++x)s.pixels[y*64+x]=blue;
 auto candidate=raster::expanded(s,{-8,-6,64,64});CHECK(candidate);const auto& e=*candidate;CHECK(e.width==72&&e.height==70&&e.offsetX==-8&&e.offsetY==-6&&e.storageOriginX==-8&&e.storageOriginY==-6);CHECK(raster::readWorld(e,10,12)==blue&&raster::readWorld(e,41,35)==blue&&raster::readWorld(e,-8,-6)==0);auto stable=raster::storagePoint(s,12*64+10);CHECK(raster::storageIndex(e,stable.x,stable.y)==raster::worldIndex(e,10,12));auto replay=e;for(int y=12;y<36;++y)for(int x=10;x<42;++x)replay.pixels[*raster::storageIndex(replay,x,y)]=0;CHECK(raster::readWorld(replay,10,12)==0);for(int y=12;y<36;++y)for(int x=10;x<42;++x)replay.pixels[*raster::storageIndex(replay,x,y)]=blue;CHECK(replay.pixels==e.pixels&&s.width==64);CHECK(!raster::expanded(e,{0,0,64,64}));CHECK(!raster::worldIndex(e,std::numeric_limits<std::int64_t>::min(),0));
 timeline::Surface p;p.width=p.height=1;p.offsetX=-100;p.offsetY=100;p.pixels={0x00030201};auto blank=raster::expanded(p,{1,2,3,4});CHECK(blank&&blank->offsetX==1&&blank->width==2&&blank->pixels==std::vector<timeline::Pixel>(4)&&blank->storageOriginX==0);p.pixels[0]=blue;auto retained=raster::expanded(p,{1,2,3,4});CHECK(retained&&raster::readWorld(*retained,-100,100)==blue);
 bool rejected=false;try{raster::expanded(s,{-8,-6,64,64},1);}catch(const std::length_error&){rejected=true;}CHECK(rejected);rejected=false;try{raster::expanded(s,{std::numeric_limits<std::int64_t>::min(),0,64,64});}catch(const std::length_error&){rejected=true;}CHECK(rejected&&raster::fullCanvas(s,64,64)&&!raster::fullCanvas(e,64,64));std::cout<<"Raster stable storage expansion legacy fixture passed; Document admission unchanged\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
