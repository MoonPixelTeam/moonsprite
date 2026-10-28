#include "recent_export_paths.h"
#include <iostream>
using namespace moon;
void check(bool value){if(!value)throw std::runtime_error("Palette PNG / recent paths regression");}
int main(){try{
 for(int n:{1,8,9}){std::vector<Pixel> colors(n,0xff0000ff);colors[0]=0x00563412;auto image=encodePaletteImagePng(colors);check(image.width==(n==1?16:128)&&image.height==(n==9?32:16));check(image.pixels.front()==0x00563412&&image.pixels[15*image.width+15]==0x00563412);std::uint32_t hash=2166136261u;for(auto pixel:image.pixels)for(int i=0;i<4;++i){hash^=(pixel>>(8*i))&255;hash*=16777619u;}check(hash==(n==1?0xd908f5c5u:n==8?0x4f9c23c5u:0x4da9b5c5u));check(image.png.size()>32);if(n==9)check(image.pixels.back()==0);}
 bool empty=false;try{encodePaletteImagePng({});}catch(...){empty=true;}check(empty);
 using namespace recent_export_paths;check(trim(" \t").empty());check(parent("C:\\out.png")=="C:\\");check(parent("/out.png")=="/");check(parent("C:\\").empty()&&parent("/").empty());check(parent("a.png").empty());
 const auto dir=std::filesystem::path("palette-paths-test-owned")/(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(dir);const auto path=dir/"recent.txt";
 for(int i=1;i<=11;++i)check(record(path,"D:\\out\\"+std::to_string(i)+".png"));auto items=load(path);check(items.size()==10&&items.front().filePath=="D:\\out\\11.png"&&items.back().filePath=="D:\\out\\2.png");check(record(path," d:\\OUT\\5.PNG "));check(load(path).front().filePath=="d:\\OUT\\5.PNG");check(record(path,"d:/OUT/5.PNG"));items=load(path);check(items.size()==10&&items[1].filePath=="d:\\OUT\\5.PNG");
 std::istringstream input("MoonSprite recent-export-paths 1\n\" x.png \" \"bad\"\n\"X.PNG\" \"2020-01-01T00:00:00.000Z\"\n");items=decode(input);check(items.size()==1&&items[0].filePath=="x.png"&&items[0].exportedAt=="1970-01-01T00:00:00.000Z");
 std::ifstream before(path,std::ios::binary);std::string bytes((std::istreambuf_iterator<char>(before)),{});check(!record(path/"blocked.txt","fail.png"));std::ifstream after(path,std::ios::binary);check(std::string((std::istreambuf_iterator<char>(after)),{})==bytes);
 std::cout<<"palette PNG raster oracles and recent paths passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
