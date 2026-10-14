#include "sprite_sheet_import.h"
#include "image_decode.h"
#include "image_export.h"
#include <iostream>
using namespace moon;
void check(bool x){if(!x)throw std::runtime_error("sprite sheet import regression");}
int main(int argc,char** argv){try{
 SheetImportOptions o;o.x=1;o.y=2;o.width=2;o.height=2;o.paddingX=o.paddingY=1;
 const std::vector<std::vector<Point>> expected={{{1,2},{4,2},{7,2}},{{1,2},{1,5}},{{1,2},{4,2},{7,2},{1,5},{4,5},{7,5}},{{1,2},{1,5},{4,2},{4,5},{7,2},{7,5}}};
 for(int layout=0;layout<4;++layout){o.layout=layout;auto p=planSpriteSheetImport(9,7,o);check(p.tiles.size()==expected[layout].size());for(std::size_t i=0;i<p.tiles.size();++i)check(p.tiles[i].x==expected[layout][i].x&&p.tiles[i].y==expected[layout][i].y);}
 o={};o.width=o.height=3;o.paddingX=2;o.paddingY=1;check(planSpriteSheetImport(7,6,o).tiles.size()==1);o.partialTiles=true;check(planSpriteSheetImport(7,6,o).tiles.size()==4);check(planSpriteSheetImport(5,4,o).tiles.size()==1);
 auto d=Document::fromImage(4,2,{0xff000001,0xff000002,0xff000003,0xff000004,0xff000005,0xff000006,0xff000007,0xff000008},U"sheet");auto original=d.pixels();auto frame=d.frame().id;d.previewSelection(SelectionMask{1,0,2,2,{1,0,1,1}});o={};o.width=o.height=1;o.selection=true;auto result=buildSpriteSheetImport(d,o);check(result.cels.size()==4);std::vector<Pixel> values;for(auto& c:result.cels)values.push_back(c.surface->pixels[0]);check(values==std::vector<Pixel>({0xff000002,0,0xff000006,0xff000007}));check(d.pixels()==original);
 auto selection=d.selection();auto history=d.historySize();d.importSpriteSheet(o);check(d.width()==1&&d.height()==1&&d.timeline().state().frames.size()==4&&!d.selection()&&d.historySize()==history+1);d.undo();check(d.width()==4&&d.height()==2&&d.pixels()==original&&d.frame().id==frame&&selectionEqual(d.selection(),selection));d.redo();check(d.pixels()[0]==0xff000002);d.selectFrame(d.timeline().state().frames[1].id);check(d.pixels()[0]==0);d.undo();
 o={};o.layout=0;o.x=-1;o.width=3;o.height=3;result=buildSpriteSheetImport(d,o);check(result.cels[0].surface->pixels[0]==0&&result.cels[0].surface->pixels[1]==original[0]&&result.cels[0].surface->pixels[6]==0);
 o={};o.width=0;bool rejected=false;try{d.importSpriteSheet(o);}catch(...){rejected=true;}check(rejected&&d.width()==4&&d.pixels()==original);
 if(argc>1){auto dir=std::filesystem::path(argv[1]);std::filesystem::create_directories(dir);auto path=dir/"rgba-import.png";auto image=encodeRgbaImagePng(2,1,{0xff010203,0x00112233});writeStaticImagePngAtomic(path,image);auto opened=openRasterImage(path);check(opened.width()==2&&opened.height()==1&&opened.pixels()==image.pixels&&!opened.dirty()&&opened.historySize()==0);}
 std::cout<<"sprite sheet import checks passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 1;}}
