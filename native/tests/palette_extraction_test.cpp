#include "composite_palette_extraction.h"
#include "palette_extraction.h"
#include "document.h"
#include "fixtures/imported_palette_legacy.h"
#include <iostream>
#include <stdexcept>
using namespace moon;
void require(bool v){if(!v)throw std::runtime_error("palette extraction regression");}
int main(){
 for(std::size_t index=0;index<importedPaletteFixtures.size();++index){const auto& f=importedPaletteFixtures[index];if(extractImportedPalette(f.surfaces,f.limit,f.samples)!=f.expected){std::cerr<<"Legacy imported palette fixture "<<index<<" differs\n";return 1;}}

 // Regional scan order must match the complete composite even when rows are
 // split horizontally, and stop requesting regions as soon as the limit is met.
 for(const auto dimensions:{std::pair{3,9},std::pair{19,3},std::pair{1,23}}){const auto [w,h]=dimensions;std::vector<Pixel> canvas(std::size_t(w)*h);for(std::size_t i=0;i<canvas.size();++i)canvas[i]=i%5?0xff000000|Pixel(i%11):0x00123456;
  for(std::size_t chunk:{1u,7u,65536u})for(std::size_t limit:{1u,4u,4096u}){std::size_t calls=0,readPixels=0;auto colors=extractCompositePalette(w,h,limit,[&](CompositeRegion r){++calls;require(std::size_t(r.width)*r.height<=chunk);readPixels+=std::size_t(r.width)*r.height;std::vector<Pixel> out;for(int y=r.y;y<r.y+r.height;++y)out.insert(out.end(),canvas.begin()+std::size_t(y)*w+r.x,canvas.begin()+std::size_t(y)*w+r.x+r.width);return out;},chunk);require(colors==extractPaletteScanline(canvas,double(limit)));require(calls>0&&readPixels<=canvas.size());if(limit==1&&chunk==1)require(calls==2);}
 }
 {std::size_t calls=0;auto colors=extractCompositePalette(1000000,1000000,1,[&](CompositeRegion r){++calls;require(r.width==65536&&r.height==1);return std::vector<Pixel>(65536,0xffabcdef);});require(colors==std::vector<Pixel>{0xffabcdef}&&calls==1);}
 {Document image=Document::fromImage(3,2,{0,0xff123456,0x80123456,0xffabcdef,0xff123456,0x00123456},U"Extract");for(auto frame:{image.frame().id})require(extractTimelinePalette(image.timeline(),frame,3,2,4096)==extractPaletteScanline(compositeNormalRegion(image.timeline(),frame,{0,0,3,2}),4096));const std::vector<Pixel> preview{0xff778899};require(extractTimelinePalette(image.timeline(),image.frame().id,3,2,1,image.layer().id,&preview,1,0,0)==std::vector<Pixel>{0xff778899});}
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
