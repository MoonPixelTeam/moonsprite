#include "fixtures/timelapse_restore_archive.h"
#include "project_restore_report.h"
#include "project_import.h"
#include <iostream>
using namespace moon;
#define CHECK(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
int main(){try{
 for(int mode=0;mode<=6;++mode){const auto bytes=tests::timelapseRestoreArchive(mode);const auto before=*bytes;project::TimelapseRestoreReport report;report.droppedTimelapseFrames=99;
  const auto manifest=project::readProjectManifest(bytes,{},&report);const auto imported=project::prepareEditableImport(manifest);const std::size_t dropped=mode==0?0:mode==4?3:mode==6?2:1;
  CHECK(report.droppedTimelapseFrames==dropped&&report.timelapseFrames==3-dropped&&imported.timelapse.snapshots.size()==3-dropped&&*bytes==before);
  if(mode==0)CHECK(report.dropReasons.empty());else if(mode==6)CHECK(report.dropReasons==std::vector<std::string>({"invalid-dimensions","missing-data"}));else CHECK(report.dropReasons==std::vector<std::string>({mode==2?"invalid-dimensions":mode==3?"invalid-metadata":"missing-data"}));
  if(!imported.timelapse.snapshots.empty()){CHECK(imported.timelapse.snapshots.front().id=="frame-0");CHECK(!imported.timelapse.snapshots.front().data.empty());}
  PaletteState palette;palette.entries.clear();palette.slots=imported.palette.slots;palette.columns=imported.palette.columns;palette.nextId=imported.palette.nextId;for(const auto& e:imported.palette.entries)palette.entries.push_back({e.id,e.name,e.color});
  auto document=Document::fromImported(imported.width,imported.height,imported.timeline,palette,imported.id,imported.name,imported.sourceArchive);document.setImportedTimelapse(imported.timelapse);
  const auto pixels=document.pixels();const auto history=document.historyPosition();const auto output=project::encodeEditableProject(document);project::TimelapseRestoreReport saved;const auto reopened=project::prepareEditableImport(project::readProjectManifest(output.bytes,{},&saved));
  CHECK(saved.droppedTimelapseFrames==0&&reopened.timelapse.snapshots.size()==3-dropped&&document.pixels()==pixels&&document.historyPosition()==history&&!document.dirty()&&*bytes==before);
  project::Archive archive(output.bytes);std::size_t payloads=0;for(const auto& entry:archive.entries())if(entry.first.rfind("timelapse/",0)==0)++payloads;CHECK(payloads==3-dropped);
 }
 for(int mode:{7,8,9}){bool rejected=false;try{project::readProjectManifest(tests::timelapseRestoreArchive(mode));}catch(const project::Error&){rejected=true;}CHECK(rejected);}
 const auto bytes=tests::timelapseRestoreArchive(1);project::Limits limits;limits.expandedBytes=1;bool limited=false;try{project::readProjectManifest(bytes,limits);}catch(const project::Error& error){limited=error.kind==project::ErrorKind::Limit;}CHECK(limited);
 std::cout<<"Timelapse partial restore, counts/reasons, native guards, pixels/history, unchanged source and clean save/reopen passed\n";return 0;
}catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}}
