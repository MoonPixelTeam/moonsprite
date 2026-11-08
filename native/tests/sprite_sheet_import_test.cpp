#include "sprite_sheet_import.h"
#include "image_decode.h"
#include "image_export.h"
#include "project_file.h"
#include "project_import.h"
#include "fixtures/large_sheet_import_legacy.h"
#include <fstream>
#include <iostream>
using namespace moon;
void check(bool x){if(!x)throw std::runtime_error("sprite sheet import regression");}
std::uint32_t pixelHash(const std::vector<Pixel>& pixels){std::uint32_t h=2166136261u;for(auto p:pixels)for(int s=0;s<32;s+=8){h^=(p>>s)&255;h*=16777619u;}return h;}
void largeImports(const std::filesystem::path& root){
 for(const auto& f:sheetImportPlanOracle){SheetImportOptions o;o.layout=f.layout;o.x=f.x;o.y=f.y;o.width=f.width;o.height=f.height;o.paddingX=f.px;o.paddingY=f.py;o.partialTiles=f.partial;bool valid=true;SheetImportPlan p;try{p=planSpriteSheetImport(f.sw,f.sh,o);}catch(...){valid=false;}check(valid==bool(f.valid));if(valid)check(p.columns==f.columns&&p.rows==f.rows&&p.tiles.size()==f.count);}
 int sample=0;for(const auto& f:largeSheetImportOracle){
  std::vector<Pixel> pixels(std::size_t(f.sw)*f.sh);for(int y=0;y<f.sh;++y)for(int x=0;x<f.sw;++x){const unsigned a[]{0,1,127,255};pixels[std::size_t(y)*f.sw+x]=((x*17+y*3)&255)|(((x*5+y*29)&255)<<8)|(((x*11+y*7)&255)<<16)|(a[(x+y)%4]<<24);}
  auto d=Document::fromImage(f.sw,f.sh,pixels,U"Large sheet");d.setFrameDuration(73);d.addLinkedFrame();d.setFrameDuration(137);d.selectFrame(d.timeline().state().frames.front().id);d.clearTimelineSelection();d.setImportedLoop(false);
  SheetImportOptions o;o.layout=f.layout;o.x=f.x;o.y=f.y;o.width=f.width;o.height=f.height;o.paddingX=f.px;o.paddingY=f.py;o.partialTiles=f.partial;o.selection=f.selection;
  if(f.selection){SelectionMask mask{3,1,2044,5,{}};mask.mask.resize(2044*5);for(std::size_t i=0;i<mask.mask.size();++i)mask.mask[i]=i%3==1?0:1;d.previewSelection(std::move(mask));}
  const auto selection=d.selection();const auto identity=d.identity(),history=d.historySize(),revision=d.revision();const auto first=d.frame().id,layer=d.layer().id;
  const auto plan=planSpriteSheetImport(f.selection?2044:f.sw,f.selection?5:f.sh,o);check(plan.columns==f.columns&&plan.rows==f.rows);
  auto result=buildSpriteSheetImport(d,o);check(result.cels.size()==f.hashes.size()&&d.revision()==revision&&d.pixels()==pixels);
  for(std::size_t i=0;i<result.cels.size();++i){if(pixelHash(result.cels[i].surface->pixels)!=f.hashes[i]){std::ofstream raw(root/("native-case-"+std::to_string(sample)+"-"+std::to_string(i)+".rgba"),std::ios::binary);const auto& p=result.cels[i].surface->pixels;raw.write(reinterpret_cast<const char*>(p.data()),std::streamsize(p.size()*4));throw std::runtime_error("Actual legacy large sheet pixel mismatch case="+std::to_string(sample)+" frame="+std::to_string(i));}check(result.frames[i].duration==(i?137:73));}
  check(d.importSpriteSheet(o)&&d.identity()==identity&&d.width()==f.width&&d.height()==f.height&&d.historySize()==history+1&&!d.selection()&&!d.animationLoop()&&d.layer().name==U"导入的精灵表");
  d.undo();check(d.width()==f.sw&&d.height()==f.sh&&d.frame().id==first&&d.layer().id==layer&&d.pixels()==pixels&&selectionEqual(d.selection(),selection));d.redo();check(d.timeline().state().frames.size()==f.hashes.size());
  const auto path=root/("large-sheet-"+std::to_string(sample++)+".moonsprite");project::saveDocumentAtomic(d,path);std::ifstream in(path,std::ios::binary);auto bytes=std::make_shared<const project::Bytes>(std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>());auto reopened=project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(bytes)));check(reopened.width()==f.width&&reopened.height()==f.height&&!reopened.animationLoop()&&reopened.timeline().state().frames.size()==f.hashes.size());
  for(std::size_t i=0;i<f.hashes.size();++i){reopened.selectFrame(reopened.timeline().state().frames[i].id);check(pixelHash(reopened.pixels())==f.hashes[i]&&reopened.frame().duration==(i?137:73));}
 }
 for(const auto size:{std::pair<int,int>{32768,1},{1,32768},{1025,3},{3,1031}}){auto d=Document::fromImage(size.first,size.second,std::vector<Pixel>(std::size_t(size.first)*size.second,0xff123456),U"Boundary sheet");SheetImportOptions o;o.width=size.first;o.height=size.second;check(d.importSpriteSheet(o)&&d.width()==size.first&&d.height()==size.second);d.undo();check(d.width()==size.first&&d.pixels().back()==0xff123456);}
 auto d=Document(2,2);const auto history=d.historySize(),revision=d.revision();const auto pixels=d.pixels();
 for(const auto size:{std::pair<int,int>{32769,1},{1,32769},{8192,8193},{4096,4096}}){SheetImportOptions o;o.width=size.first;o.height=size.second;o.partialTiles=true;bool rejected=false;try{d.importSpriteSheet(o);}catch(...){rejected=true;}check(rejected&&d.width()==2&&d.height()==2&&d.pixels()==pixels&&d.historySize()==history&&d.revision()==revision);}
}
int wmain(int argc,wchar_t** argv){try{
 SheetImportOptions o;o.x=1;o.y=2;o.width=2;o.height=2;o.paddingX=o.paddingY=1;
 const std::vector<std::vector<Point>> expected={{{1,2},{4,2},{7,2}},{{1,2},{1,5}},{{1,2},{4,2},{7,2},{1,5},{4,5},{7,5}},{{1,2},{1,5},{4,2},{4,5},{7,2},{7,5}}};
 for(int layout=0;layout<4;++layout){o.layout=layout;auto p=planSpriteSheetImport(9,7,o);check(p.tiles.size()==expected[layout].size());for(std::size_t i=0;i<p.tiles.size();++i)check(p.tiles[i].x==expected[layout][i].x&&p.tiles[i].y==expected[layout][i].y);}
 o={};o.width=o.height=3;o.paddingX=2;o.paddingY=1;check(planSpriteSheetImport(7,6,o).tiles.size()==1);o.partialTiles=true;check(planSpriteSheetImport(7,6,o).tiles.size()==4);check(planSpriteSheetImport(5,4,o).tiles.size()==1);
 auto d=Document::fromImage(4,2,{0xff000001,0xff000002,0xff000003,0xff000004,0xff000005,0xff000006,0xff000007,0xff000008},U"sheet");auto original=d.pixels();const auto originalLayerName=d.layer().name;auto frame=d.frame().id;d.previewSelection(SelectionMask{1,0,2,2,{1,0,1,1}});o={};o.width=o.height=1;o.selection=true;auto result=buildSpriteSheetImport(d,o);check(result.cels.size()==4&&result.layers.front().name==U"导入的精灵表");std::vector<Pixel> values;for(auto& c:result.cels)values.push_back(c.surface->pixels[0]);check(values==std::vector<Pixel>({0xff000002,0,0xff000006,0xff000007}));check(d.pixels()==original);
 auto selection=d.selection();auto history=d.historySize();d.importSpriteSheet(o);check(d.width()==1&&d.height()==1&&d.timeline().state().frames.size()==4&&!d.selection()&&d.historySize()==history+1&&d.layer().name==U"导入的精灵表");d.undo();check(d.width()==4&&d.height()==2&&d.pixels()==original&&d.frame().id==frame&&selectionEqual(d.selection(),selection)&&d.layer().name==originalLayerName);d.redo();check(d.pixels()[0]==0xff000002&&d.layer().name==U"导入的精灵表");d.selectFrame(d.timeline().state().frames[1].id);check(d.pixels()[0]==0);d.undo();
 o={};o.layout=0;o.x=-1;o.width=3;o.height=3;result=buildSpriteSheetImport(d,o);check(result.cels[0].surface->pixels[0]==0&&result.cels[0].surface->pixels[1]==original[0]&&result.cels[0].surface->pixels[6]==0);
 o={};o.width=0;bool rejected=false;try{d.importSpriteSheet(o);}catch(...){rejected=true;}check(rejected&&d.width()==4&&d.pixels()==original);
 if(argc>1){auto dir=std::filesystem::path(argv[1]);std::filesystem::create_directories(dir);auto path=dir/"rgba-import.png";auto image=encodeRgbaImagePng(2,1,{0xff010203,0x00112233});writeStaticImagePngAtomic(path,image);auto opened=openRasterImage(path);check(opened.width()==2&&opened.height()==1&&opened.pixels()==image.pixels&&!opened.dirty()&&opened.historySize()==0);}
 if(argc>1){auto root=std::filesystem::path(argv[1])/"large-sheet-import-owned";std::filesystem::create_directories(root);largeImports(root);}
 std::cout<<"sprite sheet import checks passed: 80 actual legacy builds, 40 plans, large undo/redo/save-reopen and budget protection\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 1;}}
