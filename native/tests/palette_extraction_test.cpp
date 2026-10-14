#include "palette_extraction.h"
#include "document.h"
#include <stdexcept>
using namespace moon;
void require(bool v){if(!v)throw std::runtime_error("palette extraction regression");}
int main(){
 const std::vector<Pixel> pixels={0xff0000ff,0xff00ff00,0xffff0000,0xff0000ff,0x00ffffff,0xff00ffff};
 require(extractPaletteScanline(pixels,16)==std::vector<Pixel>({0xff0000ff,0xff00ff00,0xffff0000,0xff00ffff}));
 require(extractPaletteScanline(pixels,2)==std::vector<Pixel>({0xff0000ff,0xff00ff00}));
 require(extractPaletteScanline({0x800000ff,0xff0000ff,0x800000ff},32)==std::vector<Pixel>({0x800000ff,0xff0000ff}));
 require(extractPaletteScanline(pixels,0).size()==1);require(extractPaletteScanline({0},32).empty());
 require(mergeExtractedPalette({1,1,2},{2,3,3,4})==std::vector<Pixel>({1,1,2,3,4}));
 Document d(2,2);const auto old=d.palette().order();const auto primary=d.palette().primary,secondary=d.palette().secondary;const auto beforePixels=d.pixels();
 d.applyExtractedPalette({primary,0x80443322},false,8);const auto after=d.palette().order();require(after.size()==2 && d.paletteEntry(after[0])->color==primary && d.palette().primaryId==after[0]);require(d.palette().primary==primary && d.palette().secondary==secondary && d.pixels()==beforePixels && d.historySize()==1);
 const auto entries=d.palette().entries.size();d.undo();require(d.palette().order()==old && d.palette().entries.size()==entries);d.redo();require(d.palette().order()==after);d.applyExtractedPalette({primary,0x80443322},false,8);require(d.historySize()==1);
 d.applyExtractedPalette({primary,0xff112233},true,8);require(d.palette().order().size()==3 && d.historySize()==2);d.undo();require(d.palette().order()==after);
}
