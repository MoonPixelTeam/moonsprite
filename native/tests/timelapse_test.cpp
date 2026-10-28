#include "timelapse_session.h"
#include "project_encode.h"
#include "project_import.h"
#include "document_snapshot.h"
#include <fstream>
#include <iostream>
using namespace moon;
#define CHECK(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
int main(){try{
 using namespace timelapse;Settings s;CHECK(!s.enabled&&!s.recordUndoSteps&&s.fps==12&&s.speed==8&&s.mode==Mode::Smart);CHECK(captureDimensions(1024,512,Quality::Low).width==640);
 s.enabled=true;SmartState smart;for(int i=0;i<181;++i){Frame f;f.id="frame-"+std::to_string(i);f.capturedAt=i;f.width=f.height=1;f.changeScore=i%3==0?.9:.1;append(s,smart,std::move(f),Mode::Smart);}CHECK(s.snapshots.size()==121);CHECK(s.snapshots[60].capturedAt==120&&s.snapshots.back().capturedAt==180);
 auto p=videoPlan(s,.1);CHECK(p.size()==1&&p[0].snapshotIndex==120);
 s.mode=Mode::Full;s.snapshots.clear();s.snapshots.resize(fullFrameLimit);Frame last;bool capacity=false;try{append(s,smart,std::move(last),Mode::Full);}catch(const CapacityError&){capacity=true;}CHECK(capacity&&!s.enabled&&s.snapshots.size()==fullFrameLimit);
 Document d(128,128);d.beginStroke({1,1},0xff123456);d.commitStroke();PixelPreparation first(d,Quality::Medium);CHECK(first.advance(d,std::chrono::steady_clock::now()+std::chrono::seconds(10)));auto frozen=first.finish();auto pixels=materialize(*frozen);CHECK(pixels[129]==0xff123456);d.beginStroke({2,2},0xffabcdef);d.commitStroke();CHECK(!first.matches(d));PixelPreparation next(d,Quality::Medium,frozen,PixelRegion{2,2,1,1});CHECK(next.advance(d,std::chrono::steady_clock::now()+std::chrono::seconds(10)));auto second=next.finish();CHECK(frozen->tiles[1]==second->tiles[1]&&frozen->tiles[0]!=second->tiles[0]);CHECK(materialize(*frozen)[258]==0&&materialize(*second)[258]==0xffabcdef);
 Prepared prepared;prepared.pixels=frozen;auto png=encodePreparedPng(prepared);auto image=decodeRecordingPng(png);CHECK(image.width==128&&image.height==128&&image.pixels==pixels);
 const auto stamp=std::to_string(std::chrono::steady_clock::now().time_since_epoch().count());const auto root=std::filesystem::current_path()/("timelapse-test-owned-"+stamp);auto a=appendLibraryFrame(root,"own-store",png),b=appendLibraryFrame(root,"own-store",png);CHECK(a.chunk==b.chunk&&b.offset==a.offset+a.length&&readLibraryFrame(root,a)==png);{std::ofstream tail(root/a.store/(a.chunk+".bin"),std::ios::binary|std::ios::app);tail<<"torn-tail";}CHECK(readLibraryFrame(root,a)==png);{std::fstream corrupt(root/a.store/(a.chunk+".bin"),std::ios::binary|std::ios::in|std::ios::out);corrupt.seekp(a.offset+12);corrupt.put(99);}bool rejected=false;try{readLibraryFrame(root,a);}catch(...){rejected=true;}CHECK(rejected&&readLibraryFrame(root,b)==png);auto malicious=a;malicious.store="../escape";rejected=false;try{readLibraryFrame(root,malicious);}catch(...){rejected=true;}CHECK(rejected);
 // Actual committed observer, multiple dirty publications, undo policy,
 // copy-detached binding and project/snapshot reference preservation.
 Document recording(192,192);recording.mutableTimelapseSettings().enabled=true;auto session=ensureRecordingSession(recording,root/"session");
 recording.beginStroke({1,1},0xff0000ff);recording.commitStroke();session->flush(recording);CHECK(recording.timelapseSettings().snapshots.size()==1);
 recording.beginStroke({2,2},0xff00ff00);recording.updateStroke({120,120});recording.updateStroke({121,121});recording.commitStroke();session->flush(recording);CHECK(recording.timelapseSettings().snapshots.size()==2);
 auto decoded=decodeRecordingPng(session->read(recording.timelapseSettings().snapshots.back()));CHECK(decoded.pixels[2*192+2]==0xff00ff00&&decoded.pixels[120*192+120]==0xff00ff00);
 recording.undo();session->flush(recording);CHECK(recording.timelapseSettings().snapshots.size()==2);recording.mutableTimelapseSettings().recordUndoSteps=true;session->settingsChanged(recording);recording.redo();session->flush(recording);CHECK(recording.timelapseSettings().snapshots.size()==3);
 Document detached=recording;CHECK(!detached.recordingSession());auto encoded=project::encodeEditableProject(recording);auto imported=project::prepareEditableImport(project::readProjectManifest(encoded.bytes));CHECK(imported.timelapse.snapshots.size()==3&&imported.timelapse.snapshots[0].local&&imported.timelapse.snapshots[0].data.empty());
 DocumentSnapshot snapshot(recording);while(!snapshot.advance(recording,std::chrono::steady_clock::now()+std::chrono::seconds(10))){}auto copy=snapshot.finish();CHECK(!copy.recordingSession()&&copy.timelapseSettings().snapshots.size()==3);
 copy.setImportedTimelapse(session->portable(recording));auto portable=project::prepareEditableImport(project::readProjectManifest(project::encodeEditableProject(copy).bytes));CHECK(!portable.timelapse.snapshots[0].local&&!portable.timelapse.snapshots[0].data.empty());CHECK(decodeRecordingPng(portable.timelapse.snapshots.back().data).pixels==decoded.pixels);
 auto sequenceSettings=recording.timelapseSettings();std::vector<std::filesystem::path> paths;for(std::size_t i=0;i<sequenceSettings.snapshots.size();++i)paths.push_back(root/("sequence-"+std::to_string(i)+".png"));CHECK(writeRecordingSequence(sequenceSettings,session->reader(),paths,false)==3);CHECK(std::filesystem::exists(paths.back()));
 session->clear(recording);session->flush(recording);CHECK(recording.timelapseSettings().snapshots.empty()&&std::filesystem::exists(root/a.store/(a.chunk+".bin")));
 {
 Document live(8,8),backup(8,8);
 Frame before;before.id="before-rollback";before.width=before.height=128;before.local=b;
 Settings original;original.enabled=true;original.recordUndoSteps=false;original.mode=Mode::Full;original.snapshots={before};live.setImportedTimelapse(original);
 auto rs=ensureRecordingSession(live,root);
 live.beginStroke({1,1},0xff123456);live.commitStroke();CHECK(rs->pendingCount()==1);
 Settings restored=original;restored.enabled=false;restored.quality=Quality::Low;restored.speed=3;restored.snapshots[0].id="backup-rollback";backup.setImportedTimelapse(restored);
 CHECK(live.rollbackProject(backup));CHECK(live.timelapseSettings().snapshots.size()==1&&live.timelapseSettings().snapshots[0].id=="backup-rollback"&&!live.timelapseSettings().enabled);
 live.undo();CHECK(live.timelapseSettings().enabled&&live.timelapseSettings().quality==Quality::Medium&&live.timelapseSettings().snapshots[0].id=="before-rollback");
 rs->flush(live);CHECK(rs->pendingCount()==0&&live.timelapseSettings().snapshots.size()==1&&live.timelapseSettings().snapshots[0].id=="before-rollback");CHECK(rs->read(live.timelapseSettings().snapshots[0])==png);
 live.redo();rs->flush(live);CHECK(!live.timelapseSettings().enabled&&live.timelapseSettings().quality==Quality::Low&&live.timelapseSettings().speed==3&&live.timelapseSettings().snapshots.size()==1&&live.timelapseSettings().snapshots[0].id=="backup-rollback");
 }

 
{
 auto importedFrame=[&](std::string id){Frame f;f.id=std::move(id);f.width=f.height=128;f.data=png;return f;};
 Document embedded(8,8);Settings imported;imported.snapshots={importedFrame("embedded-one"),importedFrame("embedded-two")};embedded.setImportedTimelapse(imported);
 auto es=ensureRecordingSession(embedded,root/"embedded");es->poll(embedded);CHECK(es->pendingCount()>0&&embedded.timelapseSettings().snapshots[0].data==png&&!embedded.timelapseSettings().snapshots[0].local);
 es->flush(embedded);CHECK(es->pendingCount()==0);for(const auto& f:embedded.timelapseSettings().snapshots)CHECK(f.data.empty()&&f.local&&es->read(f)==png);
 const auto firstRef=*embedded.timelapseSettings().snapshots[0].local;const auto secondRef=*embedded.timelapseSettings().snapshots[1].local;
 auto totalBytes=[](const std::filesystem::path& path){std::uintmax_t total=0;for(const auto& entry:std::filesystem::recursive_directory_iterator(path))if(entry.is_regular_file())total+=entry.file_size();return total;};
 const auto durableBytes=totalBytes(root/"embedded");for(int i=0;i<3;++i){es->poll(embedded);es->flush(embedded);}CHECK(totalBytes(root/"embedded")==durableBytes&&embedded.timelapseSettings().snapshots[0].local->offset==firstRef.offset&&embedded.timelapseSettings().snapshots[1].local->offset==secondRef.offset);
 const auto blockedRoot=root/"blocked-embedded";{std::ofstream blocked(blockedRoot,std::ios::binary);blocked<<"owned-path-obstacle";}
 Document failed(8,8);Settings failureSettings;failureSettings.snapshots={importedFrame("failure-retained")};failed.setImportedTimelapse(failureSettings);auto fs=ensureRecordingSession(failed,blockedRoot);bool didFail=false;try{fs->flush(failed);}catch(const std::exception&){didFail=true;}CHECK(didFail&&failed.timelapseSettings().snapshots[0].data==png&&!failed.timelapseSettings().snapshots[0].local);
 std::filesystem::rename(blockedRoot,root/"blocked-embedded-obstacle-retained");fs->flush(failed);CHECK(failed.timelapseSettings().snapshots[0].data.empty()&&failed.timelapseSettings().snapshots[0].local&&fs->read(failed.timelapseSettings().snapshots[0])==png);
 Document stale(8,8),backup(8,8);Settings staleSettings;staleSettings.snapshots={importedFrame("same-id")};stale.setImportedTimelapse(staleSettings);auto ss=ensureRecordingSession(stale,root/"stale-embedded");ss->poll(stale);ss->clear(stale);ss->flush(stale);CHECK(stale.timelapseSettings().snapshots.empty());
 stale.setImportedTimelapse(staleSettings);ss->restoreSettings(stale.timelapseSettings());ss->poll(stale);Settings replacement;Frame local=staleSettings.snapshots[0];local.data.clear();local.local=b;replacement.snapshots={local};backup.setImportedTimelapse(replacement);CHECK(stale.rollbackProject(backup));ss->flush(stale);CHECK(stale.timelapseSettings().snapshots.size()==1&&stale.timelapseSettings().snapshots[0].data.empty()&&stale.timelapseSettings().snapshots[0].local->store==b.store&&stale.timelapseSettings().snapshots[0].local->chunk==b.chunk&&stale.timelapseSettings().snapshots[0].local->offset==b.offset);
}

{
 Document source=Document::fromImage(2,1,{0xff0000ff,0x80ff0000},U"recording-protection");source.markSaved();const auto before=source.pixels();const auto revision=source.revision(),history=source.historySize();
 Settings images;Frame frame;frame.id="protection-frame";frame.width=2;frame.height=1;frame.data=encodeRgbaImagePng(2,1,before).png;images.snapshots={frame};const auto retained=images.snapshots[0].data;Reader read=[](const Frame& f){return f.data;};
 auto bytes=[](const std::filesystem::path& path){std::ifstream in(path,std::ios::binary);CHECK(bool(in));return Bytes(std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>());};
 for(const auto mode:{ExportProtection::Blur,ExportProtection::BlurNoise}){
  StaticImageExportOptions options;options.scalePercent=400;options.protection=mode;const auto expected=encodeStaticImagePng(source,options);CHECK(expected.width==8&&expected.height==4);
  const auto stem=mode==ExportProtection::Blur?"sequence-blur":"sequence-noise";const auto pngPath=root/(std::string(stem)+".png"),jpegPath=root/(std::string(stem)+".jpg");
  CHECK(writeRecordingSequence(images,read,{pngPath},false,400,{},{},mode)==1);const auto actual=decodeRecordingPng(bytes(pngPath));CHECK(actual.width==8&&actual.height==4&&actual.pixels==expected.pixels);
  CHECK(writeRecordingSequence(images,read,{jpegPath},true,400,{},{},mode)==1);CHECK(bytes(jpegPath)==encodeImageJpeg(8,4,expected.pixels).bytes);
 }
 const auto originalPath=root/"sequence-original.png";CHECK(writeRecordingSequence(images,read,{originalPath},false,100,{},{},ExportProtection::BlurNoise)==1);CHECK(decodeRecordingPng(bytes(originalPath)).pixels==before);
 CHECK(images.snapshots[0].data==retained&&!images.snapshots[0].local&&source.pixels()==before&&source.revision()==revision&&source.historySize()==history&&!source.dirty());
 Frame wide;wide.width=5;wide.height=1;Frame square;square.width=square.height=4;const auto summary=imageOutputDimensions({wide,square},200);CHECK(summary.width==10&&summary.height==2);CHECK(imageOutputDimensions({},200).width==0);
}
std::cout<<"Timelapse model, dirty capture, undo, detached copies, project/portable, PNG sequence and durable ranges passed; owned fixture retained at "<<root.u8string()<<'\n';return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
