#include "document_snapshot.h"
#include <future>
#include <iostream>
using namespace moon;
static void require(bool p,const char* m){if(!p)throw std::runtime_error(m);}
int main(){try{
  Document d(512,512);d.beginStroke({4,5},0x80123456);d.commitStroke();d.addFrame(true);d.selectFrame("frame-1");
  ProjectBrushResource brush;brush.metadata={"b","Brush","b.gray","b.rgba",512,512};brush.brush.width=brush.brush.height=512;brush.brush.coverage.resize(512*512,127);brush.brush.colors.resize(512*512,0x40123456);brush.brush.paintColors={0xff123456};d.setImportedProjectBrushes({brush});
  DocumentSnapshot snapshot(d);int ticks=0;while(!snapshot.advance(d,std::chrono::steady_clock::now()+std::chrono::seconds(1))){require(++ticks<100,"Unbounded snapshot backlog");}
  require(ticks>=2,"Raster and brush payload copied without byte budget");
  auto job=std::async(std::launch::async,[snapshot=std::move(snapshot)]()mutable{return snapshot.finish();});auto result=job.get();
  require(result.pixels()==d.pixels() && result.frame().id==d.frame().id,"Snapshot pixels or active frame changed");
  require(!result.sourceArchive() && result.projectId().empty(),"New project became imported");require(result.historySize()==0,"Snapshot copied document undo history");
  require(result.projectBrushes()[0].brush.coverage==brush.brush.coverage && result.projectBrushes()[0].brush.colors==brush.brush.colors && result.projectBrushes()[0].brush.paintColors==brush.brush.paintColors,"Brush payload changed");
  {DocumentSnapshot metadata(d);d.setSymmetryCenter({3,4},false);require(!metadata.matches(d),"Unrevisioned symmetry preview changed snapshot metadata");}
  DocumentSnapshot stale(d);d.beginStroke({6,5},0xffabcdef);bool rejected=false;try{stale.advance(d,std::chrono::steady_clock::now()+std::chrono::seconds(1));}catch(const std::logic_error&){rejected=true;}require(rejected,"Live generation entered snapshot");d.cancelStroke();
  const auto& cel=d.cel();require(d.timeline().hasVisiblePixels(cel.id),"Content cache lost visible pixels");auto scans=d.timeline().contentScans();d.selectFrame(d.timeline().state().frames.back().id);d.selectFrame("frame-1");d.timeline().hasVisiblePixels(cel.id);require(d.timeline().contentScans()==scans,"Frame navigation invalidated content cache");
  std::cout<<"Document snapshot generation, bounded resources, worker ownership and history isolation passed\n";
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
