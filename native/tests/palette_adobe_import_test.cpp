#include "palette_adobe_import.h"
#include "palette_import.h"
#include <cstring>
#include <iostream>
#include <limits>
#include <stdexcept>
using namespace moon;
using Bytes=std::vector<std::uint8_t>;
void require(bool value,const char* message){if(!value)throw std::runtime_error(message);}
void u16(Bytes& b,std::uint16_t n){b.push_back(n>>8);b.push_back(n);}
void u32(Bytes& b,std::uint32_t n){b.push_back(n>>24);b.push_back(n>>16);b.push_back(n>>8);b.push_back(n);}
void f32(Bytes& b,float value){std::uint32_t bits;std::memcpy(&bits,&value,4);u32(b,bits);}
Bytes block(const char* model,const std::vector<float>& values){Bytes b;u16(b,1);u16(b,0);b.insert(b.end(),model,model+4);for(auto v:values)f32(b,v);u16(b,0);return b;}
Bytes ase(const std::vector<Bytes>& blocks){Bytes b{'A','S','E','F'};u16(b,1);u16(b,0);u32(b,std::uint32_t(blocks.size()));for(auto& item:blocks){u16(b,1);u32(b,std::uint32_t(item.size()));b.insert(b.end(),item.begin(),item.end());}return b;}
void entry(Bytes& b,std::uint16_t space,std::uint16_t a,std::uint16_t c,std::uint16_t d,std::uint16_t e){for(auto v:{space,a,c,d,e})u16(b,v);}
template<class F>void rejects(F f){bool rejected=false;try{f();}catch(const std::runtime_error&){rejected=true;}require(rejected,"invalid Adobe palette accepted");}
int main(){try{auto rgb=block("RGB ",{1,.5f,0});require(decodeAsePaletteColors(ase({rgb}))==std::vector<Pixel>({0xff0080ff}),"old ASE RGB fixture");require(decodeAsePaletteColors(ase({rgb,rgb,block("GRAY",{.5f}),block("CMYK",{0,1,1,0}),block("LAB ",{})}))==std::vector<Pixel>({0xff0080ff,0xff0080ff,0xff808080,0xff0000ff}),"ASE duplicates/models/order");rejects([&]{auto b=ase({rgb});b.pop_back();decodeAsePaletteColors(b);});rejects([&]{decodeAsePaletteColors(ase({block("RGB ",{std::numeric_limits<float>::quiet_NaN(),0,0})}));});rejects([&]{Bytes b{'A','S','E','F'};u16(b,1);u16(b,0);u32(b,1000001);decodeAsePaletteColors(b);});rejects([&]{decodeAsePaletteColors(Bytes{'A','S','E'});});
 Bytes v1;u16(v1,1);u16(v1,4);entry(v1,0,0x1100,0x2200,0x3300,0);entry(v1,1,65535,65535,65535,0);entry(v1,8,0x8000,0,0,0);entry(v1,7,0,0,0,0);require(decodeAcoPaletteColors(v1)==std::vector<Pixel>({0xff332211,0xff0000ff,0xff808080}),"ACO RGB/HSV/gray/unsupported");Bytes v2;u16(v2,2);u16(v2,2);for(int i=0;i<2;++i){entry(v2,0,0x1100,0x2200,0x3300,0);u32(v2,1);u16(v2,0);}require(decodeAcoPaletteColors(v2)==std::vector<Pixel>({0xff332211,0xff332211}),"ACO duplicates/name skipping");require(decodeImportedPalette(v2,"source.ACO").colors==decodeAcoPaletteColors(v2),"ACO import dispatch");require(decodeImportedPalette(ase({rgb}),"source.ASE").colors==std::vector<Pixel>({0xff0080ff}),"ASE import dispatch");auto concat=v1;concat.insert(concat.end(),v2.begin(),v2.end());require(decodeAcoPaletteColors(concat)==decodeAcoPaletteColors(v1),"ACO incorrectly merges second group");rejects([&]{auto b=v2;b.pop_back();decodeAcoPaletteColors(b);});rejects([&]{Bytes b;u16(b,3);u16(b,0);decodeAcoPaletteColors(b);});std::cout<<"palette-adobe-import: passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
