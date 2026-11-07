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
#include "layer_compositor.h"
#include "recent_project_preview.h"
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
void sparseAnimationChecks(const std::filesystem::path& dir){
 using namespace moon;
 for(const std::string mode:{"absent","null","empty","invalid","hole-active","hole-inactive"}){
  const auto m=readProjectManifest(load(dir/("sparse-animation-"+mode+".moonsprite")));auto d=createEditableDocument(prepareEditableImport(m));const bool hole=mode.rfind("hole",0)==0,blank=mode!="hole-inactive";const auto active=d.frame().id;
  auto verify=[&](const Document& candidate){check(candidate.timeline().state().frames.size()==(hole?2:1)&&candidate.timeline().state().cels.size()==(hole?2:1),"Sparse animation materialized slots");check(candidate.pixels()==std::vector<Pixel>(4,blank?0:0xffffffff),"Sparse active display follows legacy blank projection");check(candidate.timeline().diagnoseLinks().empty(),"Sparse animation links");};
  verify(d);check(d.historyPosition()==0,"Sparse import no history");for(bool recovery:{false,true}){auto saved=recovery?encodeRecoveryProject(d):encodeEditableProject(d);verify(createEditableDocument(prepareEditableImport(readProjectManifest(saved.bytes))));}
  d.beginStroke({0,0},0xffabcdef);check(d.commitStroke(),"Sparse imported frame editable");d.undo();verify(d);d.redo();check(d.pixels()[0]==0xffabcdef&&d.frame().id==active,"Sparse frame redo");
 }
}
void specialSlotChecks(const std::filesystem::path& dir){
 using namespace moon;
 for(const std::string kind:{"text","adjustment","tilemap","free-tile"})for(bool active:{false,true}){
  const auto manifest=readProjectManifest(load(dir/("special-hole-"+kind+"-"+std::to_string(active)+".moonsprite")));auto d=createEditableDocument(prepareEditableImport(manifest));const auto resources=d.timeline().state().tilesets;
  auto verify=[&](const Document& candidate){const auto* c=candidate.timeline().findCel(candidate.layer().id,"missing-special");check(c&&c->surface&&!c->text&&!c->linkedCelId,"Special missing slot independent blank");const auto& s=*c->surface;check(std::all_of(s.pixels.begin(),s.pixels.end(),[](Pixel p){return !p;}),"Special missing slot pixels blank");if(kind=="free-tile")check(c->freeTiles&&c->freeTiles->instances.empty(),"Free missing slot empty instance authority");if(kind=="tilemap")check(c->tilemap&&c->tilemap->columns==2&&c->tilemap->rows==2&&std::none_of(c->tilemap->cells.begin(),c->tilemap->cells.end(),[](const auto& cell){return bool(cell);}),"Tile missing slot uses empty grid template");check(candidate.layer().kind==kind&&candidate.timeline().state().tilesets.size()==resources.size()&&candidate.timeline().diagnoseLinks().empty(),"Special missing slot keeps owner resources");for(const auto& old:manifest.cels){const auto* kept=candidate.timeline().findCelById(old.id);const auto resolved=candidate.timeline().resolveSurface(kept->id);const auto expected=old.tilemap?tiles::render(*old.tilemap,manifest.tilesets):old.freeTiles?free_tiles::render(*manifest.layers.front().freeTiles,*old.freeTiles,manifest.tilesets,old.surface->width,old.surface->height):old.surface->pixels;check(resolved.source->freeTiles==old.freeTiles&&bool(resolved.source->tilemap)==bool(old.tilemap)&&resolved.surface->pixels==expected,(std::string("Special missing slot preserves existing Cel payload and raster ")+kind+" active="+std::to_string(active)+" free="+std::to_string(resolved.source->freeTiles==old.freeTiles)+" pixels="+std::to_string(resolved.surface->pixels==expected)).c_str());}for(std::size_t n=0;n<resources.size();++n)check(candidate.timeline().state().tilesets[n].pixels==resources[n].pixels,"Special missing slot keeps exact resource pixels");};
  verify(d);check(d.historyPosition()==0,"Special slot import no history");for(bool recovery:{false,true}){auto saved=recovery?encodeRecoveryProject(d):encodeEditableProject(d);verify(createEditableDocument(prepareEditableImport(readProjectManifest(saved.bytes))));}
  d.selectFrame("missing-special");d.addFrame(true);check(d.timeline().state().frames.size()==3,"Special blank frame duplicable");d.undo();verify(d);d.redo();check(d.timeline().state().frames.size()==3,"Special blank duplicate redo");
 }
}
void animationArrayChecks(const std::filesystem::path& dir){
 using namespace moon;
 for(int version:{2,13,21})for(const std::string field:{"frames","cels"})for(const std::string malformed:{"absent","null","object","number"}){
  auto m=readProjectManifest(load(dir/("animation-array-"+std::to_string(version)+"-"+field+"-"+malformed+".moonsprite")));auto d=createEditableDocument(prepareEditableImport(m));
  auto verify=[&](const Document& candidate){check(candidate.timeline().state().frames.size()==1&&candidate.frame().duration==100&&candidate.pixels()==std::vector<Pixel>(4),"Malformed animation arrays normalize to blank default");};
  verify(d);check(d.historyPosition()==0,"Array normalization no import history");for(bool recovery:{false,true}){auto saved=recovery?encodeRecoveryProject(d):encodeEditableProject(d);verify(createEditableDocument(prepareEditableImport(readProjectManifest(saved.bytes))));}
 }
}
void noGridTemplateChecks(const std::filesystem::path& dir){
 using namespace moon;
 for(const auto geometry:{std::array<int,4>{4,4,2,2},std::array<int,4>{5,3,2,2},std::array<int,4>{3,5,1,2}})for(bool multiple:{false,true}){
  const int w=geometry[0],h=geometry[1],tw=geometry[2],th=geometry[3];const auto manifest=readProjectManifest(load(dir/("tile-no-template-"+std::to_string(w)+"-"+std::to_string(h)+"-"+std::to_string(multiple)+".moonsprite")));auto d=createEditableDocument(prepareEditableImport(manifest));const auto baseline=d.timeline().state().tilesets.front().pixels;const auto active=d.frame().id;
  auto verify=[&](const Document& candidate){check(candidate.timeline().state().cels.size()==(multiple?2:1)&&candidate.layer().kind=="tilemap"&&candidate.timeline().diagnoseLinks().empty(),"Template-less grid structure");for(const auto& c:candidate.timeline().state().cels){check(c.tilemap&&c.tilemap->tileWidth==tw&&c.tilemap->tileHeight==th&&c.tilemap->columns==(w+tw-1)/tw&&c.tilemap->rows==(h+th-1)/th&&std::none_of(c.tilemap->cells.begin(),c.tilemap->cells.end(),[](const auto& cell){return bool(cell);}),"Template-less grid covers canvas with empty cells");check(c.surface&&std::all_of(c.surface->pixels.begin(),c.surface->pixels.end(),[](Pixel p){return !p;}),"Template-less grid raster blank");}check(candidate.timeline().state().tilesets.front().pixels==baseline,"Template-less grid keeps tile resources");};
  verify(d);check(d.historyPosition()==0&&manifest.cels.empty(),"Template-less import no history or source mutation");for(bool recovery:{false,true}){auto saved=recovery?encodeRecoveryProject(d):encodeEditableProject(d);verify(createEditableDocument(prepareEditableImport(readProjectManifest(saved.bytes))));}
  d.setTilemapMode(tiles::Mode::Paint);d.setSelectedTile("no-template-sheet","no-template-tile");d.beginStroke({0,0},0xffabcdef);check(d.commitStroke(),"Template-less grid editable");check(d.cel().tilemap->cells.front()&&d.timeline().state().tilesets.front().pixels==baseline,"Template-less paint places retained tile without changing texture");d.undo();verify(d);d.redo();check(d.cel().tilemap->cells.front()&&d.frame().id==active,"Template-less paint redo");
  auto saved=encodeEditableProject(d);auto reopened=createEditableDocument(prepareEditableImport(readProjectManifest(saved.bytes)));check(reopened.cel().tilemap->cells.front()&&reopened.timeline().state().tilesets.front().pixels==baseline,"Painted template-less grid reopen");
 }
}
void importedOpacityChecks(const std::filesystem::path& dir){
 using namespace moon;
 for(const std::string alpha:{"absent","null","string"})for(bool linked:{false,true}){
  const auto file=dir/("import-opacity-"+alpha+"-"+std::to_string(linked)+".moonsprite");auto m=readProjectManifest(load(file));auto d=createEditableDocument(prepareEditableImport(m));const auto active=d.frame().id;
  auto verify=[&](const Document& candidate){check(candidate.layer().opacity==.6&&candidate.frame().id==active,"Imported active frame retains original fallback opacity");check(candidate.timeline().diagnoseLinks().empty(),"Opacity import valid links");check(compositeNormalRegion(candidate.timeline(),active,{0,0,2,2})==std::vector<timeline::Pixel>(4,0x99ffffffu),"Imported active frame visible composite alpha");};
  verify(d);check(d.historyPosition()==0,"Opacity restoration no history");for(bool recovery:{false,true}){auto saved=recovery?encodeRecoveryProject(d):encodeEditableProject(d);auto reopened=createEditableDocument(prepareEditableImport(readProjectManifest(saved.bytes)));verify(reopened);reopened.selectFrame(m.frames.front().id);check(reopened.layer().opacity==.2,"First frame opacity preserved");reopened.selectFrame(active);verify(reopened);}
  const auto preview=recent::readPreview({std::filesystem::absolute(file).u8string()},{},[]{return false;});check(preview.previewWidth==2&&preview.previewHeight==2&&preview.pixels==std::vector<std::uint32_t>(4,0x99ffffffu),"Recent project fallback preview retains active alpha");
  d.setLayerOpacity(.4);check(d.layer().opacity==.4,"Imported opacity remains editable");d.undo();verify(d);d.redo();check(d.layer().opacity==.4,"Imported opacity redo");d.undo();verify(d);
 }
}
void droppedRasterChecks(const std::filesystem::path& dir){
 using namespace moon;
 for(const std::string kind:{"raster","text","adjustment","tilemap","free-tile"})for(bool active:{false,true})for(const std::string mode:{"file-absent","file-null","file-empty","file-number","width-absent","width-null","width-string","width-zero","width-negative","width-fraction","width-unsafe","height-zero","height-string"}){
  const auto m=readProjectManifest(load(dir/("dropped-raster-"+kind+"-"+std::to_string(active)+"-"+mode+".moonsprite")));check(m.cels.size()==1&&m.unsupported.empty(),"Legacy drops unusable Cel raster before materialization");auto d=createEditableDocument(prepareEditableImport(m));const auto first=m.cels.front().id;const auto baseline=d.timeline().resolveSurface(first).surface->pixels;const auto sets=d.timeline().state().tilesets;
  const auto verify=[&](const Document& candidate){const auto* blank=candidate.timeline().findCel(candidate.layer().id,"missing-special");check(blank&&blank->id!="dropped-raster"&&!blank->linkedCelId,"Dropped Cel replaced with native blank slot");const auto resolved=candidate.timeline().resolveSurface(blank->id);check(resolved.surface&&std::all_of(resolved.surface->pixels.begin(),resolved.surface->pixels.end(),[](auto p){return p==0;}),"Dropped Cel shows transparent pixels");check(!blank->text&&(!blank->freeTiles||blank->freeTiles->instances.empty())&&(!blank->tilemap||std::none_of(blank->tilemap->cells.begin(),blank->tilemap->cells.end(),[](const auto& cell){return bool(cell);})),"Dropped Cel structured payload cleared");check(candidate.timeline().resolveSurface(first).surface->pixels==baseline&&candidate.timeline().diagnoseLinks().empty(),"Dropped Cel preserves existing frame and valid links");check(candidate.timeline().state().tilesets.size()==sets.size(),"Dropped Cel preserves resource count");for(std::size_t i=0;i<sets.size();++i)check(candidate.timeline().state().tilesets[i].pixels==sets[i].pixels,"Dropped Cel preserves exact resource pixels");};
  const auto verifyMasks=[&](const Document& candidate){check(candidate.timeline().state().masks.size()==m.masks.size(),"Dropped Cel preserves masks anchored to layer/frame slot");for(const auto& mask:m.masks){const auto* restored=timeline::resolvedMask(candidate.timeline().state(),mask.ownerId,mask.frameId);check(restored&&restored->id==mask.id&&restored->surface.pixels==mask.surface->pixels&&restored->locked==mask.locked,"Dropped Cel exact mask payload and flags");}};
  verify(d);verifyMasks(d);check(d.frame().id==m.activeFrameId&&d.historyPosition()==0,"Dropped Cel restores activity without history");for(bool recovery:{false,true}){auto saved=recovery?encodeRecoveryProject(d):encodeEditableProject(d);auto reopened=createEditableDocument(prepareEditableImport(readProjectManifest(saved.bytes)));verify(reopened);verifyMasks(reopened);check(reopened.frame().id==m.activeFrameId,"Dropped Cel persisted activity");}
  d.selectFrame("missing-special");d.addFrame(true);check(d.timeline().state().frames.size()==3,"Dropped Cel blank duplicate");d.undo();verify(d);check(d.timeline().state().frames.size()==2,"Dropped Cel duplicate undo");d.redo();check(d.timeline().state().frames.size()==3,"Dropped Cel duplicate redo");
 }
 for(const std::string mode:{"absent","null","empty","number","object","unknown","valid"}){
  const auto m=readProjectManifest(load(dir/("active-layer-fallback-"+mode+".moonsprite")));auto d=createEditableDocument(prepareEditableImport(m));const auto expected=mode=="valid"?std::string("fallback-second"):m.layers.front().id;check(d.layer().id==expected&&d.historyPosition()==0,"Activity falls back to first legacy layer rather than reversed native stack");for(bool recovery:{false,true}){auto saved=recovery?encodeRecoveryProject(d):encodeEditableProject(d);auto reopened=createEditableDocument(prepareEditableImport(readProjectManifest(saved.bytes)));check(reopened.layer().id==expected,"Active layer fallback persists");}const auto baseline=d.pixels();d.beginStroke({0,0},0xffabcdef);check(d.commitStroke(),"Fallback layer editable");d.undo();check(d.layer().id==expected&&d.pixels()==baseline,"Fallback layer edit undo");d.redo();check(d.pixels()[0]==0xffabcdef,"Fallback layer edit redo");
 }
 {auto d=createEditableDocument(prepareEditableImport(readProjectManifest(load(dir/"cel-encoding-fallback-absent.moonsprite"))));check(d.pixels()==std::vector<std::uint32_t>(4,0xffffffffu),"Missing encoding retains raw default");}
 for(const std::string mode:{"null","number","object","array","unknown"})rejects([&]{readProjectManifest(load(dir/("cel-encoding-reject-"+mode+".moonsprite")));},ErrorKind::Unsupported);
 for(int version:{4,5,21})for(const std::string owner:{"layer","cel","dropped"}){auto bytes=load(dir/("encoding-gate-"+std::to_string(version)+"-"+owner+".moonsprite"));if(version==4)createEditableDocument(prepareEditableImport(readProjectManifest(bytes)));else rejects([&]{readProjectManifest(bytes);},ErrorKind::Unsupported);}
 for(const std::string mode:{"format-absent","format-invalid","missing-resource","truncated-resource"})rejects([&]{readProjectManifest(load(dir/("cel-raster-reject-"+mode+".moonsprite")));},ErrorKind::Corrupt);
 for(const std::string mode:{"tilemap-no-payload","tilemap-text","free-no-payload","raster-tilemap","raster-free"})rejects([&]{readProjectManifest(load(dir/("cel-payload-reject-"+mode+".moonsprite")));},ErrorKind::Corrupt);
}
void corruptLinkResourceChecks(const std::filesystem::path& dir){
 for(const std::string kind:{"tilemap","free-tile"})for(const std::string defect:{"missing","self","cycle2"})for(bool fallback:{false,true})for(const std::string problem:{"missing-resource","bad-item"})rejects([&]{readProjectManifest(load(dir/("malformed-link-resource-"+kind+"-"+defect+"-"+std::to_string(fallback)+"-"+problem+".moonsprite")));},ErrorKind::Corrupt);
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
  historicalVersionChecks(dir);activeCacheChecks(dir);linkedCacheChecks(dir);sparseAnimationChecks(dir);specialSlotChecks(dir);animationArrayChecks(dir);noGridTemplateChecks(dir);importedOpacityChecks(dir);droppedRasterChecks(dir);corruptLinkResourceChecks(dir);inlineMaskChecks(dir);
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
