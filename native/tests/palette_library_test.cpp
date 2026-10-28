#include "palette_library.h"
#include <fstream>
#include <iostream>
#include <chrono>
using namespace moon;
void require(bool value,const char* message){if(!value)throw std::runtime_error(message);}
int main(){try{
 const auto root=std::filesystem::current_path()/"build"/("moonsprite-palette-library-"+std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));std::filesystem::create_directories(root);
 StoredPalette p;p.id="fixture";p.name="Fixture";p.colors={0x00332211,0xff332211,0xff332211};p.names=std::vector<std::string>{"transparent","first","duplicate"};p.columns=3;p.slots={std::nullopt,2,std::nullopt,0,std::nullopt,1};auto decoded=decodeStoredPalette(encodeStoredPalette(p));require(decoded.colors==p.colors&&decoded.slots==p.slots&&decoded.names==p.names,"schema2 sparse/name/RGBA roundtrip");
 auto bad=p;bad.slots[0]=2;bool rejected=false;try{encodeStoredPalette(bad);}catch(...){rejected=true;}require(rejected,"duplicate slot accepted");
 rejected=false;try{decodeStoredPalette("{\"schemaVersion\":3}");}catch(...){rejected=true;}require(rejected,"unknown schema accepted");
 PaletteLibrary library(root);auto a=library.save(p),b=library.save(p);require(a.id=="fixture"&&b.id=="fixture-2","new palette collision");p.name="Changed";auto updated=library.save(p,a.id);require(updated.id==a.id&&library.list().size()==2,"overwrite current");std::ofstream(root/"broken.palette.json")<<"{";require(library.list().size()==2,"bad file blocks good files");
 const auto legacy=root/"legacy.palette.json";std::ofstream(legacy)<<"{\"schemaVersion\":1,\"id\":\"legacy\",\"name\":\"Legacy\",\"colors\":[\"#112233\"]}";auto v1=decodeStoredPalette("{\"schemaVersion\":1,\"id\":\"legacy\",\"name\":\"Legacy\",\"colors\":[\"#112233\"]}");require(!v1.columns&&v1.colors[0]==0xff332211,"schema1 decode");auto imported=library.importFile(legacy);require(imported.columns==1&&imported.slots[0]==0,"import persists schema2");library.remove(b.id);require(!std::filesystem::exists(b.path),"delete selected user file");
 Document d(1,1);auto before=d.palette();auto revision=d.revision();std::vector<std::u32string> names{U"transparent",U"first",U"duplicate"};d.applyStoredPalette(p.colors,p.columns,p.slots,&names);auto ids=d.palette().order();auto entries=d.palette().entries.size();require(d.revision()==revision+1&&ids.size()==3&&ids[0]!=ids[2],"apply one edit preserves duplicates");auto applied=d.palette();d.applyStoredPalette(p.colors,p.columns,p.slots,&names);require(d.revision()==revision+1&&d.palette().entries.size()==entries,"repeated apply accumulates IDs/history");d.undo();require(d.palette().slots==before.slots&&d.palette().columns==before.columns&&d.palette().entries.size()==entries,"undo loses hidden referenced entries");d.redo();require(d.palette().slots==applied.slots&&d.palette().columns==applied.columns&&d.palette().primary==before.primary,"redo/primary");
 // Fixture intentionally retained: no user or existing library files are removed.
 std::cout<<"palette-library: passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
