#include "palette_extraction.h"
#include "document.h"
#include "fixtures/imported_palette_legacy.h"
#include <iostream>
#include <stdexcept>
using namespace moon;
void require(bool v){if(!v)throw std::runtime_error("palette extraction regression");}
int main(){
 for(std::size_t index=0;index<importedPaletteFixtures.size();++index){const auto& f=importedPaletteFixtures[index];if(extractImportedPalette(f.surfaces,f.limit,f.samples)!=f.expected){std::cerr<<"Legacy imported palette fixture "<<index<<" differs\n";return 1;}}

 const std::vector<Pixel> pixels={0xff0000ff,0xff00ff00,0xffff0000,0xff0000ff,0x00ffffff,0xff00ffff};
 require(extractPaletteScanline(pixels,16)==std::vector<Pixel>({0xff0000ff,0xff00ff00,0xffff0000,0xff00ffff}));
 require(extractPaletteScanline(pixels,2)==std::vector<Pixel>({0xff0000ff,0xff00ff00}));
 require(extractPaletteScanline({0x800000ff,0xff0000ff,0x800000ff},32)==std::vector<Pixel>({0x800000ff,0xff0000ff}));
 require(extractPaletteScanline(pixels,0).size()==1);require(extractPaletteScanline({0},32).empty());
 require(mergeExtractedPalette({1,1,2},{2,3,3,4})==std::vector<Pixel>({1,1,2,3,4}));
 // Legacy imported-palette exact-color path: every rare pixel falls between
 // the four-pixel stride used by the bounded high-color path on a 1024 image.
 std::vector<Pixel> large(1024*1024,0xff000000);large[1]=0xff0000ff;large[2]=0x8000ff00;large[3]=0x00ffffff;
 auto imported=Document::fromImage(1024,1024,large,U"稀有色");
 require(imported.palette().entries.size()==3&&imported.palette().columns==8&&imported.palette().slots.size()==8&&imported.palette().nextId==4);
 for(const auto color:{Pixel(0xff000000),Pixel(0xff0000ff),Pixel(0x8000ff00)})require(std::any_of(imported.palette().entries.begin(),imported.palette().entries.end(),[&](const auto& e){return e.color==color;}));
 for(const auto& entry:imported.palette().entries){const auto number=std::to_string(entry.id);require(entry.name==std::u32string(number.begin(),number.end()));}
 require(imported.pixels()==large&&!imported.dirty()&&imported.historySize()==0);
 auto transparent=Document::fromImage(1024,1024,std::vector<Pixel>(1024*1024,0x00ffffff),U"透明");require(transparent.palette().entries.empty()&&transparent.palette().slots.empty()&&transparent.palette().nextId==1);
 Document d(2,2);const auto old=d.palette().order();const auto primary=d.palette().primary,secondary=d.palette().secondary;const auto beforePixels=d.pixels();
 d.applyExtractedPalette({primary,0x80443322},false,8);const auto after=d.palette().order();require(after.size()==2 && d.paletteEntry(after[0])->color==primary && d.palette().primaryId==after[0]);require(d.palette().primary==primary && d.palette().secondary==secondary && d.pixels()==beforePixels && d.historySize()==1);
 const auto entries=d.palette().entries.size();d.undo();require(d.palette().order()==old && d.palette().entries.size()==entries);d.redo();require(d.palette().order()==after);d.applyExtractedPalette({primary,0x80443322},false,8);require(d.historySize()==1);
 d.applyExtractedPalette({primary,0xff112233},true,8);require(d.palette().order().size()==3 && d.historySize()==2);d.undo();require(d.palette().order()==after);
}
