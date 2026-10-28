#include "document_snapshot.h"
#include <future>
#include <algorithm>
#include <iostream>
namespace moon {struct RasterHistoryFixture {
 static void install(Document& d,timeline::Surface s){auto state=d.timeline_.state();const auto id=d.timeline_.resolveSurface(d.cel().id).source->id;auto it=std::find_if(state.cels.begin(),state.cels.end(),[&](const auto& c){return c.id==id;});it->surface=std::move(s);d.timeline_=timeline::Timeline(std::move(state));}
};}
using namespace moon;
static void require(bool p,const char* m){if(!p)throw std::runtime_error(m);}
int main(){try{
  {
    Document local(8,8);local.addLinkedFrame(true);
    timeline::Surface surface;surface.width=2;surface.height=1;surface.offsetX=-1;surface.offsetY=2;surface.storageOriginX=7;surface.storageOriginY=-9;surface.pixels={0x00030201,0xffabcdef};
    RasterHistoryFixture::install(local,surface);
    DocumentSnapshot snapshot(local);while(!snapshot.advance(local,std::chrono::steady_clock::now()+std::chrono::seconds(1))){}
    auto copy=snapshot.finish();const auto original=local.timeline().resolveSurface(local.cel().id),captured=copy.timeline().resolveSurface(copy.cel().id);
    require(captured.source->id==original.source->id&&copy.cel().linkedCelId==local.cel().linkedCelId,"Local snapshot changed canonical owner/link");
    const auto& after=*captured.surface;require(after.width==2&&after.height==1&&after.offsetX==-1&&after.offsetY==2&&after.storageOriginX==7&&after.storageOriginY==-9&&after.pixels==surface.pixels,"Local snapshot clipped geometry/storage origin/hidden RGB");
    require(copy.historySize()==0&&!copy.sourceArchive()&&copy.projectId().empty(),"Local snapshot copied history or external identity");
    auto admitted=Document::fromImported(8,8,copy.timeline().state(),copy.palette(),"external",U"External",std::make_shared<const std::vector<std::uint8_t>>());admitted.selectFrame(copy.frame().id);const auto& imported=*admitted.timeline().resolveSurface(admitted.cel().id).surface;
    require(imported.offsetX==-1&&imported.offsetY==2&&imported.storageOriginX==7&&imported.storageOriginY==-9&&imported.pixels==surface.pixels&&!admitted.dirty(),"Sparse import changed owner geometry or storage identity");
  }
  {
    Document expanded(8,8);timeline::Surface local;local.width=2;local.height=1;local.offsetX=local.offsetY=2;local.storageOriginX=7;local.storageOriginY=9;local.pixels={0x00030201,0};
    RasterHistoryFixture::install(expanded,std::move(local));expanded.markSaved();
    DocumentSnapshot beforeExpansion(expanded);
    require(beforeExpansion.advance(expanded,std::chrono::steady_clock::now()+std::chrono::seconds(1)),"Small source snapshot did not finish copying");
    const auto rev=expanded.revision(),content=expanded.contentRevision(),history=expanded.historySize();
    expanded.beginStroke({0,0},0,{},nullptr,0,nullptr,false);expanded.cancelStroke();
    require(expanded.revision()==rev&&expanded.contentRevision()==content&&expanded.historySize()==history&&!expanded.dirty()&&!expanded.active(),"No-op expansion fixture unexpectedly changed edit generation");
    const auto& owner=*expanded.timeline().resolveSurface(expanded.cel().id).surface;
    require(owner.width==8&&owner.height==8&&owner.offsetX==0&&owner.offsetY==0,"Production no-op expansion did not change geometry");
    require(!beforeExpansion.matches(expanded),"Same-generation production expansion accepted stale snapshot metadata");
    bool refused=false;try{beforeExpansion.advance(expanded,std::chrono::steady_clock::now()+std::chrono::seconds(1));}catch(const std::logic_error&){refused=true;}
    require(refused,"Completed snapshot bypassed metadata validation");
  }

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
