#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include "document.h"
#include "project_encode.h"
#include "project_file.h"
#include "recovery_store.h"
#include "raster_geometry.h"
#include "project_manifest.h"
#include "project_import.h"
#include <filesystem>
#include <fstream>
#include <iostream>
using namespace moon::project;
namespace {
void check(bool b,const char* message) {if(!b) throw std::runtime_error(message);}
std::shared_ptr<const Bytes> load(const std::filesystem::path& p) {std::ifstream in(p,std::ios::binary);if(!in)throw std::runtime_error("Missing fixture");return std::make_shared<const Bytes>(std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>());}
template<class F> void rejects(F work,ErrorKind kind) {try{work();}catch(const Error& e){check(e.kind==kind,"Wrong failure classification");return;}throw std::runtime_error("Invalid manifest accepted");}

void historicalVersionChecks(const std::filesystem::path& dir){
 const std::vector<std::uint32_t> pixels{0xff1e140a,0x0046505a,0x80030201,0xfcfdfeff};
 for(int version=1;version<=20;++version){
  auto bytes=load(dir/("historical-"+std::to_string(version)+".moonsprite"));auto manifest=readProjectManifest(bytes);
  check(manifest.schemaVersion==21&&manifest.unsupported.empty(),"Historical manifest not normalized");
  auto document=moon::project::createEditableDocument(prepareEditableImport(manifest));
  auto verify=[&](const moon::Document& d){check(d.timeline().state().frames.size()==1&&d.frame().duration==100&&d.timeline().state().layers.size()==1,"Historical default animation");check(d.pixels()==pixels&&d.layer().kind.empty()&&!d.layer().background&&!d.layer().layerStyles,"Historical raster or version gates changed");};
  verify(document);check(document.historyPosition()==0,"Historical import creates editing history");
  for(bool recovery:{false,true}){const auto saved=recovery?encodeRecoveryProject(document):encodeEditableProject(document);auto parsed=readProjectManifest(saved.bytes);check(parsed.schemaVersion==21&&parsed.unsupported.empty(),"Historical save format");verify(createEditableDocument(prepareEditableImport(parsed)));}
  document.beginStroke({0,0},0xffabcdef);check(document.commitStroke(),"Historical document editable");document.undo();verify(document);document.redo();check(document.pixels()[0]==0xffabcdef,"Historical edit redo");
 }
 for(int version=2;version<=13;++version){
  auto d=createEditableDocument(prepareEditableImport(readProjectManifest(load(dir/("historical-animation-"+std::to_string(version)+".moonsprite")))));
  auto verify=[&](const moon::Document& candidate){const auto& state=candidate.timeline().state();check(state.frames.size()==2&&state.frames[1].duration==240&&state.cels.size()==2&&candidate.timeline().diagnoseLinks().empty(),"Historical animation structure");check(candidate.timeline().resolveSurface(state.cels[0].id).source->id==candidate.timeline().resolveSurface(state.cels[1].id).source->id,"Historical linked animation authority");};
  verify(d);for(bool recovery:{false,true}){auto saved=recovery?encodeRecoveryProject(d):encodeEditableProject(d);verify(createEditableDocument(prepareEditableImport(readProjectManifest(saved.bytes))));}
 }

}
void activeCacheChecks(const std::filesystem::path& dir){
 using namespace moon;
 for(bool multiple:{false,true})for(bool geometry:{false,true}){
  const auto bytes=load(dir/("active-cache-"+std::to_string(multiple)+"-"+std::to_string(geometry)+".moonsprite"));auto manifest=readProjectManifest(bytes);const auto originalCache=manifest.layers.front().surface->pixels;
  auto d=createEditableDocument(prepareEditableImport(manifest));const auto first=d.frame().id;
  const std::vector<Pixel> expected{0xff1e140a,0x0046505a,0x80030201,0xfcfdfeff};
  auto verify=[&](const Document& doc){const auto& surface=*doc.cel().surface;check(doc.pixels()==expected&&surface.width==2&&surface.height==2&&surface.offsetX==0&&surface.offsetY==0,"Active Cel replaces stale layer pixels and geometry");check(doc.timeline().state().frames.size()==(multiple?2:1),"Cache migration frame structure");};
  verify(d);check(d.historyPosition()==0&&manifest.layers.front().surface->pixels==originalCache,"Cache import atomic and without history");
  if(multiple){d.selectFrame("cache-second");check(d.pixels()==std::vector<Pixel>(4),"Cache migration preserves other frame");d.selectFrame(first);verify(d);}
  for(bool recovery:{false,true}){auto saved=recovery?encodeRecoveryProject(d):encodeEditableProject(d);auto parsed=readProjectManifest(saved.bytes);check(parsed.layers.front().surface->pixels==expected,"Stale cache resurrected during save");verify(createEditableDocument(prepareEditableImport(parsed)));}
  d.beginStroke({0,0},0xffabcdef);check(d.commitStroke(),"Migrated cache document editable");d.undo();verify(d);d.redo();check(d.pixels()[0]==0xffabcdef,"Cache migration redo");
 }
}
void linkedCacheChecks(const std::filesystem::path& dir){
 using namespace moon;const std::vector<Pixel> pixels{0xff1e140a,0x0046505a,0x80030201,0xfcfdfeff};
 for(const auto* mode:{"pixels","geometry","absent"})for(bool chain:{false,true}){
  auto manifest=readProjectManifest(load(dir/(std::string("linked-cache-")+mode+"-"+std::to_string(chain)+".moonsprite")));auto d=createEditableDocument(prepareEditableImport(manifest));const auto active=d.frame().id;
  auto verify=[&](const Document& candidate){const auto& state=candidate.timeline().state();check(state.cels.size()==(chain?3:2)&&candidate.timeline().diagnoseLinks().empty(),"Linked fallback structure");const auto root=candidate.timeline().resolveSurface(state.cels.front().id).source->id;for(const auto& c:state.cels){const auto resolved=candidate.timeline().resolveSurface(c.id);check(resolved.source->id==root&&resolved.surface->pixels==pixels&&resolved.surface->width==2&&resolved.surface->offsetX==0&&resolved.surface->offsetY==0,"Linked root overrides stale alias pixels and geometry");}check(candidate.pixels()==pixels,"Linked active frame projection");};
  verify(d);check(d.historyPosition()==0,"Linked cache normalization no history");
  for(bool recovery:{false,true}){auto saved=recovery?encodeRecoveryProject(d):encodeEditableProject(d);auto parsed=readProjectManifest(saved.bytes);for(const auto& c:parsed.cels)check(c.surface&&c.surface->pixels==pixels&&c.surface->width==2&&c.surface->offsetX==0,"Saved alias cache canonical");verify(createEditableDocument(prepareEditableImport(parsed)));}
  d.beginStroke({0,0},0xffabcdef);check(d.commitStroke(),"Edit through imported alias");for(const auto& c:d.timeline().state().cels)check(d.timeline().resolveSurface(c.id).surface->pixels[0]==0xffabcdef,"Alias edit updates shared root");d.undo();verify(d);d.redo();check(d.pixels()[0]==0xffabcdef&&d.frame().id==active,"Linked cache redo frame and pixels");
 }
}
void inlineMaskChecks(const std::filesystem::path& dir){
 using namespace moon;auto bytes=load(dir/"inline-mask-u8.moonsprite");const auto raw=readProjectManifest(bytes);check(raw.unsupported.empty()&&raw.masks.size()==1&&raw.maskDataFiles.size()==1,"Inline mask was rejected or lost");const auto& mask=raw.masks[0];check(mask.id=="inline-mask"&&mask.surface->offsetX==-1&&mask.surface->offsetY==1&&mask.locked&&mask.autoLink,"Inline mask metadata migration");check(mask.surface->pixels==std::vector<std::uint32_t>({0xff000000,0xff808080,0xffffffff,0xff404040}),"Inline scalar resource decode");
 auto rgba=readProjectManifest(load(dir/"inline-mask-rgba.moonsprite"));check(rgba.masks[0].surface->pixels==std::vector<std::uint32_t>({0,0xff808080,0xff000000,0xffffffff}),"Mask RGBA transparent RGB normalization");
 auto priority=readProjectManifest(load(dir/"inline-mask-priority.moonsprite"));check(priority.unsupported.empty()&&priority.masks.size()==2&&priority.masks[0].id=="winner"&&priority.masks[0].linkedMaskId=="group-root"&&priority.maskDataFiles.size()==3,"Explicit slot precedence / registered shadow resources");const auto preparedPriority=prepareEditableImport(priority);check(timeline::resolvedMask(preparedPriority.timeline,priority.activeLayerId,priority.activeFrameId)->id=="group-root","Forward cross-kind linked mask resolution");
 auto shadow=readProjectManifest(load(dir/"inline-mask-missing-shadow.moonsprite"));check(shadow.unsupported.empty()&&shadow.masks.size()==1&&shadow.masks[0].id=="winner","Shadowed missing inline resource must not be decoded");
 for(const auto name:{"inline-mask-bad-rgba","inline-mask-bad-alpha","inline-mask-missing-resource","inline-mask-duplicate-id","inline-mask-broken-link","inline-mask-empty-link","inline-mask-cycle"})rejects([&]{readProjectManifest(load(dir/(std::string(name)+".moonsprite")));},ErrorKind::Corrupt);
 check(readProjectManifest(load(dir/"inline-mask-schema20.moonsprite")).masks.size()==1,"Schema20 inline mask migration");
 auto document=[&](std::shared_ptr<const Bytes> archive){auto ready=prepareEditableImport(readProjectManifest(archive));PaletteState palette;palette.entries.clear();palette.slots=ready.palette.slots;palette.columns=ready.palette.columns;palette.nextId=ready.palette.nextId;for(const auto& item:ready.palette.entries)palette.entries.push_back({item.id,item.name,item.color});auto d=Document::fromImported(ready.width,ready.height,std::move(ready.timeline),std::move(palette),ready.id,ready.name,ready.sourceArchive);d.selectLayer(ready.activeLayerId);d.selectFrame(ready.activeFrameId);d.setImportedLoop(ready.loop);return d;};
 const auto owned=dir/("inline-mask-owned-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(owned);{std::ofstream marker(owned/"owner.txt");marker<<"Only inline mask migration regression artifacts belong here.\n";}
 auto d=document(bytes);const auto cel=d.pixels();const auto owner=d.layer().id,frame=d.frame().id;saveDocumentAtomic(d,owned/"saved.moonsprite");const auto saved=readProjectManifest(load(owned/"saved.moonsprite"));check(saved.unsupported.empty()&&saved.masks.size()==1&&saved.masks[0].surface->pixels==mask.surface->pixels&&saved.masks[0].surface->offsetX==-1,"Inline save/reopen canonical mask");check(!Archive(d.sourceArchive()).entries().count("masks/inline.u8"),"Migrated source resource left unmapped after canonical save");check(d.pixels()==cel&&!d.dirty(),"Mask migration save changed cels or save point");
 auto deleted=document(bytes);check(deleted.deleteAttachedMask(owner,frame),"Delete imported inline mask");auto deletedSaved=encodeEditableProject(deleted);check(readProjectManifest(deletedSaved.bytes).masks.empty(),"Removed inline mask resurrected from old cel metadata");check(!Archive(deletedSaved.bytes).entries().count("masks/inline.u8"),"Removed inline mask resource leaked into saved archive");
 auto priorityDoc=document(load(dir/"inline-mask-priority.moonsprite"));auto prioritySaved=encodeEditableProject(priorityDoc);const auto reopenedPriority=readProjectManifest(prioritySaved.bytes);check(reopenedPriority.unsupported.empty()&&reopenedPriority.masks.size()==2,"Shadowed mask resource cleanup during save");check(!Archive(prioritySaved.bytes).entries().count("masks/inline.u8"),"Shadowed invalid payload retained as unmapped archive resource");
 auto linked=document(load(dir/"inline-mask-linked.moonsprite"));const auto linkedOwner=linked.layer().id,first=linked.timeline().state().frames[0].id,second=linked.timeline().state().frames[1].id;check(linked.timeline().state().masks.size()==2&&timeline::resolvedMask(linked.timeline().state(),linkedOwner,first)->id==timeline::resolvedMask(linked.timeline().state(),linkedOwner,second)->id,"Inline link import");check(linked.setAttachedMaskFlags(linkedOwner,first,true,false,true,true),"Unlock linked root fixture");check(linked.selectAttachedMask(linkedOwner,second),"Select migrated linked mask");linked.clearTimelineSelection();const auto baseline=timeline::resolvedMask(linked.timeline().state(),linkedOwner,first)->surface.pixels;linked.beginStroke({0,0},0xff000000);check(linked.commitStroke(),"Edit migrated linked mask");check(raster::readWorld(timeline::resolvedMask(linked.timeline().state(),linkedOwner,first)->surface,0,0)==0xff000000,"Migrated mask did not share root");linked.undo();check(timeline::resolvedMask(linked.timeline().state(),linkedOwner,second)->surface.pixels==baseline,"Migrated linked mask undo");linked.redo();check(linked.pixels()==cel,"Migrated mask edit changed linked cel pixels");
 const auto recovery=owned/"recovery";const RecoveryRecord record{"inline-mask-owned","inline mask recovery","2026-10-21T00:00:00.000Z"};writeRecoveryFiles(recovery,record,*bytes);auto oldRecovery=document(load(recovery/"inline-mask-owned.moonsprite"));check(oldRecovery.timeline().state().masks.size()==1,"Recovery old inline payload reader");const auto encodedRecovery=encodeRecoveryProject(linked);writeRecoveryFiles(recovery,record,*encodedRecovery.bytes);check(listRecoveryRecords(recovery).size()==1,"Recovery sidecar chain");auto recovered=document(load(recovery/"inline-mask-owned.moonsprite"));check(recovered.timeline().state().masks.size()==2&&timeline::resolvedMask(recovered.timeline().state(),linkedOwner,second)->id=="inline-mask"&&raster::readWorld(timeline::resolvedMask(recovered.timeline().state(),linkedOwner,first)->surface,0,0)==0xff000000,"Canonical recovery reopen lost masks or links");saveDocumentAtomic(recovered,owned/"recovered-saved.moonsprite");check(readProjectManifest(load(owned/"recovered-saved.moonsprite")).masks.size()==2,"Recovered inline masks save/reopen closure");
}
}
int main(int argc,char** argv) {
 try {
  check(argc==2,"Fixture argument required");const auto dir=std::filesystem::u8path(argv[1]);
  historicalVersionChecks(dir);activeCacheChecks(dir);linkedCacheChecks(dir);inlineMaskChecks(dir);
  auto bytes=load(dir/"valid.moonsprite");auto parsed=readProjectManifest(bytes);
  check(parsed.schemaVersion==21 && parsed.colorMode=="rgba" && parsed.width==2 && parsed.height==2,"Header changed");
  check(parsed.name==u8"原生兼容样本","Unicode name changed");
  check(parsed.sourceArchive==bytes && !parsed.manifestUtf8.empty(),"Source evidence discarded");
  check(parsed.unsupported.empty(),"Actual legacy default unexpectedly unsupported");
  const auto admitted=prepareEditableImport(parsed);check(admitted.width==2 && admitted.timeline.cels.size()==1,"Valid legacy fixture admission failed");
  check(parsed.layers.size()==1 && parsed.frames.size()==1 && parsed.cels.size()==1,"Structure changed");
  check(parsed.cels[0].surface==parsed.layers[0].surface,"Shared raster was decoded twice");
  check(parsed.cels[0].layerId==parsed.layers[0].id && parsed.cels[0].frameId==parsed.frames[0].id,"Cel relationships lost");
  check(parsed.frames[0].duration==100 && parsed.palette.size()==2 && parsed.paletteSlots.size()==8,"Metadata lost");
  check(parsed.palette[1].color==0xffff7929 && parsed.paletteSlots[2]==0,"Palette mapping changed");
  parsed=readProjectManifest(load(dir/"rgba.moonsprite"));
  check(parsed.layers[0].surface->pixels==std::vector<std::uint32_t>({0xff1e140a,0x0046505a,0x80030201,0xfcfdfeff}),"RGBA changed");
  auto unknown=readProjectManifest(load(dir/"unknown.moonsprite"));
  check(!unknown.unsupported.empty() && unknown.manifestUtf8.find("preserve me")!=std::string::npos,"Unknown semantic discarded");
  check(!readProjectManifest(load(dir/"unknown-resource.moonsprite")).unsupported.empty(),"Unknown resource silently discarded");
  rejects([&]{readProjectManifest(load(dir/"future.moonsprite"));},ErrorKind::Unsupported);
  for(const auto name:{"syntax.moonsprite"}) rejects([&]{readProjectManifest(load(dir/name));},ErrorKind::Corrupt);
  const auto filtered=readProjectManifest(load(dir/"broken-reference.moonsprite"));check(filtered.cels.empty()&&filtered.frames.size()==1,"Invalid frame Cel reference must be filtered before native admission");
  const auto deduplicated=readProjectManifest(load(dir/"duplicate-frame.moonsprite"));check(deduplicated.frames.size()==1&&deduplicated.frames[0].id==deduplicated.activeFrameId&&deduplicated.frames[0].duration==100,"Duplicate frame must retain first normalized entry");
  check(readProjectManifest(bytes).id==parsed.id,"Valid read after failures changed identity");
  Limits limits;limits.manifestBytes=1;rejects([&]{readProjectManifest(bytes,limits);},ErrorKind::Limit);
  std::cout<<"Legacy manifest fixture checks passed\n";return 0;
 } catch(const std::exception& e) {std::cerr<<e.what()<<'\n';return 1;}
}
