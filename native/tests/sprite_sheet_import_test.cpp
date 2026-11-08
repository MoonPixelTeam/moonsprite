#include "sprite_sheet_import.h"
#include "image_decode.h"
#include "image_export.h"
#include "project_file.h"
#include "project_import.h"
#include "fixtures/large_sheet_import_legacy.h"
#include "fixtures/sheet_import_dialog_legacy.h"
#include <fstream>
#include <iostream>
using namespace moon;
void check(bool x){if(!x)throw std::runtime_error("sprite sheet import regression");}
std::uint32_t pixelHash(const std::vector<Pixel>& pixels){std::uint32_t h=2166136261u;for(auto p:pixels)for(int s=0;s<32;s+=8){h^=(p>>s)&255;h*=16777619u;}return h;}
void selectionImports(const std::filesystem::path& root){
 std::filesystem::create_directories(root);int sample=0;
 for(const auto& f:sheetImportSelectionOracle){
  std::vector<Pixel> pixels(12);for(int i=0;i<12;++i)pixels[i]=Pixel(i+1)|(Pixel(i*3)<<8)|(Pixel(i*7)<<16)|(i==4?0:0xff000000u);
  auto d=Document::fromImage(6,2,pixels,U"Frozen selection");SelectionMask mask{f.maskKind==2?-1:1,0,3,2,{}};if(f.maskKind==0)mask.mask={1,0,1,0,1,1};else if(f.maskKind==1)mask.mask={1,0};d.previewSelection(mask);
  auto options=initialSheetImportOptions({2,1,2,1},{},d.selection());options.width=options.height=1;options.layout=f.layout;const auto frozen=options.selectionSnapshot;check(frozen&&frozen->x==mask.x&&frozen->width==3);
  auto copied=options;check(copied.selectionSnapshot.get()==frozen.get());std::fill(mask.mask.begin(),mask.mask.end(),0);mask.x=4;mask.width=1;
  if(f.mutation==0)d.previewSelection({});else if(f.mutation==1)d.previewSelection(SelectionMask{0,0,1,1,{}});else d.previewSelection(mask);
  const auto beforeSelection=d.selection();const auto identity=d.identity(),history=d.historySize();const auto frame=d.frame().id,layer=d.layer().id;
  const auto pivot=f.mutation==0?std::optional<TransformPoint>{}:std::optional<TransformPoint>{TransformPoint{-2.5,3.75}};
  auto built=buildSpriteSheetImport(d,options);check(built.cels.size()==f.hashes.size());for(std::size_t i=0;i<f.hashes.size();++i)check(pixelHash(built.cels[i].surface->pixels)==f.hashes[i]);
  check(d.importSpriteSheet(options,pivot)&&d.identity()==identity&&d.historySize()==history+1&&!d.selection()&&!d.selectionPivotHistory().pivot&&d.selectionPivotHistory().serial==1);
  d.undo();check(d.width()==6&&d.height()==2&&d.pixels()==pixels&&d.frame().id==frame&&d.layer().id==layer&&selectionEqual(d.selection(),beforeSelection)&&d.selectionPivotHistory().serial==2);
  check(bool(d.selectionPivotHistory().pivot)==bool(pivot));if(pivot)check(d.selectionPivotHistory().pivot->x==pivot->x&&d.selectionPivotHistory().pivot->y==pivot->y);
  d.redo();check(!d.selection()&&!d.selectionPivotHistory().pivot&&d.selectionPivotHistory().serial==3);
  const auto path=root/("selection-"+std::to_string(sample++)+".moonsprite");project::saveDocumentAtomic(d,path);std::ifstream in(path,std::ios::binary);auto bytes=std::make_shared<const project::Bytes>(std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>());auto reopened=project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(bytes)));check(!reopened.selection()&&reopened.historySize()==0&&reopened.width()==1&&reopened.height()==1);
  for(std::size_t i=0;i<f.hashes.size();++i){reopened.selectFrame(reopened.timeline().state().frames[i].id);check(pixelHash(reopened.pixels())==f.hashes[i]);}
 }
 // Ordinary imports also clear/restore the pre-submit selection pivot.
 auto d=Document(4,2);d.previewSelection(SelectionMask{1,0,2,1,{1,0}});SheetImportOptions options;options.width=2;options.height=2;check(d.importSpriteSheet(options,TransformPoint{100.25,-70.5}));d.undo();check(d.selectionPivotHistory().pivot&&d.selectionPivotHistory().pivot->x==100.25);
 const auto beforeSelection=d.selection();const auto pixels=d.pixels();const auto serial=d.selectionPivotHistory().serial,revision=d.revision(),history=d.historySize();
 for(int failure=0;failure<3;++failure){auto invalid=initialSheetImportOptions({0,0,1,1},{},d.selection());std::optional<TransformPoint> pivot=TransformPoint{100.25,-70.5};if(failure==0){invalid.width=4096;invalid.height=4096;invalid.partialTiles=true;}if(failure==1)pivot->x=std::numeric_limits<double>::infinity();if(failure==2){auto mask=std::make_shared<SelectionMask>(*invalid.selectionSnapshot);mask->x=INT32_MAX;invalid.selectionSnapshot=std::move(mask);}bool rejected=false;try{d.importSpriteSheet(invalid,pivot);}catch(...){rejected=true;}check(rejected&&d.width()==4&&d.height()==2&&d.pixels()==pixels&&selectionEqual(d.selection(),beforeSelection)&&d.selectionPivotHistory().serial==serial&&d.selectionPivotHistory().pivot->x==100.25&&d.revision()==revision&&d.historySize()==history);}
}
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
 for(const auto& f:sheetImportDefaultOracle){auto selected=f.selected?std::optional<SelectionMask>{SelectionMask{10,8,f.sw,f.sh,{}}}:std::optional<SelectionMask>{};const auto o=initialSheetImportOptions({double(f.gx),double(f.gy),double(f.gw),double(f.gh)},{},selected);check(o.x==f.x&&o.y==f.y&&o.width==f.width&&o.height==f.height&&o.selection==bool(f.selected)&&o.layout==2&&!o.partialTiles&&o.paddingX==0&&o.paddingY==0);}
 for(const auto& f:sheetImportCountOracle)check(sheetImportFrameSizeFromCount(f.extent,f.origin,f.gap,f.count)==f.size);
 SheetImportOptions remembered;remembered.x=-3;remembered.y=5;remembered.width=8;remembered.height=9;remembered.paddingX=3;remembered.paddingY=2;remembered.partialTiles=true;
 auto recalled=initialSheetImportOptions({1,2,4,4},remembered);check(recalled.x==-3&&recalled.width==8&&recalled.paddingX==3&&recalled.partialTiles&&!recalled.selection);
 auto local=initialSheetImportOptions({1,2,4,4},remembered,SelectionMask{10,8,2,1,{1,0}});check(local.selection&&local.x==0&&local.y==0&&local.width==2&&local.height==1&&local.paddingX==0&&!local.partialTiles);
 check(initialSheetImportOptions({1e30,-1e30,1e30,16}).x==INT32_MAX&&initialSheetImportOptions({1e30,-1e30,1e30,16}).y==INT32_MIN);
 SheetImportOptions o;o.x=1;o.y=2;o.width=2;o.height=2;o.paddingX=o.paddingY=1;
 const std::vector<std::vector<Point>> expected={{{1,2},{4,2},{7,2}},{{1,2},{1,5}},{{1,2},{4,2},{7,2},{1,5},{4,5},{7,5}},{{1,2},{1,5},{4,2},{4,5},{7,2},{7,5}}};
 for(int layout=0;layout<4;++layout){o.layout=layout;auto p=planSpriteSheetImport(9,7,o);check(p.tiles.size()==expected[layout].size());for(std::size_t i=0;i<p.tiles.size();++i)check(p.tiles[i].x==expected[layout][i].x&&p.tiles[i].y==expected[layout][i].y);}
 o={};o.width=o.height=3;o.paddingX=2;o.paddingY=1;check(planSpriteSheetImport(7,6,o).tiles.size()==1);o.partialTiles=true;check(planSpriteSheetImport(7,6,o).tiles.size()==4);check(planSpriteSheetImport(5,4,o).tiles.size()==1);
 auto d=Document::fromImage(4,2,{0xff000001,0xff000002,0xff000003,0xff000004,0xff000005,0xff000006,0xff000007,0xff000008},U"sheet");auto original=d.pixels();const auto originalLayerName=d.layer().name;auto frame=d.frame().id;d.previewSelection(SelectionMask{1,0,2,2,{1,0,1,1}});o={};o.width=o.height=1;o.selection=true;auto result=buildSpriteSheetImport(d,o);check(result.cels.size()==4&&result.layers.front().name==U"导入的精灵表");std::vector<Pixel> values;for(auto& c:result.cels)values.push_back(c.surface->pixels[0]);check(values==std::vector<Pixel>({0xff000002,0,0xff000006,0xff000007}));check(d.pixels()==original);
 auto selection=d.selection();auto history=d.historySize();d.importSpriteSheet(o);check(d.width()==1&&d.height()==1&&d.timeline().state().frames.size()==4&&!d.selection()&&d.historySize()==history+1&&d.layer().name==U"导入的精灵表");d.undo();check(d.width()==4&&d.height()==2&&d.pixels()==original&&d.frame().id==frame&&selectionEqual(d.selection(),selection)&&d.layer().name==originalLayerName);d.redo();check(d.pixels()[0]==0xff000002&&d.layer().name==U"导入的精灵表");d.selectFrame(d.timeline().state().frames[1].id);check(d.pixels()[0]==0);d.undo();
 o={};o.layout=0;o.x=-1;o.width=3;o.height=3;result=buildSpriteSheetImport(d,o);check(result.cels[0].surface->pixels[0]==0&&result.cels[0].surface->pixels[1]==original[0]&&result.cels[0].surface->pixels[6]==0);
 o={};o.width=0;bool rejected=false;try{d.importSpriteSheet(o);}catch(...){rejected=true;}check(rejected&&d.width()==4&&d.pixels()==original);
 if(argc>1){auto dir=std::filesystem::path(argv[1]);std::filesystem::create_directories(dir);auto path=dir/"rgba-import.png";auto image=encodeRgbaImagePng(2,1,{0xff010203,0x00112233});writeStaticImagePngAtomic(path,image);auto opened=openRasterImage(path);check(opened.width()==2&&opened.height()==1&&opened.pixels()==image.pixels&&!opened.dirty()&&opened.historySize()==0);}
 if(argc>1){auto root=std::filesystem::path(argv[1])/"large-sheet-import-owned";std::filesystem::create_directories(root);largeImports(root);selectionImports(root/"selection-snapshots");}
 std::cout<<"sprite sheet import checks passed: 80 actual legacy builds, 40 plans, large undo/redo/save-reopen and budget protection\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 1;}}
