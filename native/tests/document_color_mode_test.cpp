#include "document_color_mode.h"
#include <fstream>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <map>
using namespace moon::color_mode;
struct Entry {int id;Pixel color;};
struct Palette {std::vector<Entry> entries;std::vector<int> order;};
int main(int argc,char** argv){try{
 if(argc!=2)throw std::runtime_error("Expected actual legacy oracle file");
 std::ifstream source(argv[1]);if(!source)throw std::runtime_error("Cannot read color-mode oracle");
 std::map<int,Palette> palettes;std::string line;std::size_t checked=0;
 while(std::getline(source,line)){std::istringstream input(line);char kind;input>>kind;
  auto require=[&](bool ok){if(!ok)throw std::runtime_error("Legacy color-mode mismatch at row "+std::to_string(checked+1)+": "+line);};
  if(kind=='Q'){unsigned format;Pixel color,expected;input>>format>>color>>expected;require(quantizePixelColor(color,PixelFormat(format))==expected);}
  else if(kind=='P'){int id,count;input>>id>>count;auto& p=palettes[id];for(int i=0;i<count;++i){Entry entry;input>>entry.id>>entry.color;p.entries.push_back(entry);}input>>count;for(int i=0;i<count;++i){int value;input>>value;p.order.push_back(value);}}
  else if(kind=='I'){int id,expected;Pixel color;input>>id>>color>>expected;const auto& p=palettes.at(id);require(paletteColorIdForCanvas(p.entries,p.order,color)==expected);}
  else if(kind=='L'){int id,mode,format,layer;Pixel color,visible,packed;input>>id>>mode>>format>>layer>>color>>visible>>packed;const auto& p=palettes.at(id);require(resolveLayerCanvasColor(Mode(mode),PixelFormat(format),layer==1,layer==2,p.entries,p.order,color)==visible);require(normalizeLayerPackedValue(Mode(mode),PixelFormat(format),layer==1,layer==2,p.entries,p.order,color)==packed);}
  else if(kind=='F'){std::string value;unsigned expected;input>>value>>expected;require(preferencePixelFormat(value)==PixelFormat(expected));if(auto format=pixelFormat(value))require(name(*format)==value);}
  else throw std::runtime_error("Unknown oracle record");
  if(!input)throw std::runtime_error("Malformed color-mode oracle");++checked;
 }
 if(checked<100000)throw std::runtime_error("Incomplete actual legacy oracle");
 std::cout<<"Document color modes: "<<checked<<" actual legacy records passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
