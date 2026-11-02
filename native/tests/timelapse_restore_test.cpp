#include "fixtures/timelapse_restore_archive.h"
#include "project_restore_report.h"
#include "project_import.h"
#include "legacy_json_number.h"
#include <iostream>
using namespace moon;
#define CHECK(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
void legacyNumberOracle(){
 struct Apartment{HRESULT result=RoInitialize(RO_INIT_MULTITHREADED);~Apartment(){if(result==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(result))RoUninitialize();}} apartment;
 struct Case{const char* json;double expected;};
 const Case cases[]{
  {R"oracle(null)oracle",0.0},
  {R"oracle(true)oracle",1.0},
  {R"oracle(false)oracle",0.0},
  {R"oracle(0)oracle",0.0},
  {R"oracle(-0)oracle",-0.0},
  {R"oracle(4)oracle",4.0},
  {R"oracle("4")oracle",4.0},
  {R"oracle(" 4 ")oracle",4.0},
  {R"oracle("+4")oracle",4.0},
  {R"oracle("4.")oracle",4.0},
  {R"oracle(".4")oracle",0.4},
  {R"oracle("4e1")oracle",40.0},
  {R"oracle("")oracle",0.0},
  {R"oracle("   ")oracle",0.0},
  {R"oracle("0x4")oracle",4.0},
  {R"oracle("0Xff")oracle",255.0},
  {R"oracle("0b100")oracle",4.0},
  {R"oracle("0o10")oracle",8.0},
  {R"oracle("+0x4")oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle("-0x4")oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle("0x1p2")oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle("4px")oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle("1_000")oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle("Infinity")oracle",std::numeric_limits<double>::infinity()},
  {R"oracle("+Infinity")oracle",std::numeric_limits<double>::infinity()},
  {R"oracle("-Infinity")oracle",-std::numeric_limits<double>::infinity()},
  {R"oracle("inf")oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle("NaN")oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle("1e9999")oracle",std::numeric_limits<double>::infinity()},
  {R"oracle("1e-9999")oracle",0.0},
  {R"oracle("-1e-9999")oracle",-0.0},
  {R"oracle("\u00a04\ufeff")oracle",4.0},
  {R"oracle("\u20284\u2029")oracle",4.0},
  {R"oracle("\u00854")oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle("\u180e4")oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle([])oracle",0.0},
  {R"oracle([4])oracle",4.0},
  {R"oracle([-0])oracle",0.0},
  {R"oracle(["4"])oracle",4.0},
  {R"oracle([[4]])oracle",4.0},
  {R"oracle([null])oracle",0.0},
  {R"oracle([true])oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle([[true]])oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle([[]])oracle",0.0},
  {R"oracle([1,2])oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle({})oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle([{}])oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle("0x100000000000003")oracle",72057594037927940.0},
  {R"oracle("0b1000000000000000000000000000000000000000000000000000011")oracle",18014398509481988.0},
  {R"oracle("0o1000000000000000001")oracle",18014398509481984.0},
  {R"oracle("0x")oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle("0b2")oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle("0o8")oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle(".e2")oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle("1e")oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle("1e+")oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle("+")oracle",std::numeric_limits<double>::quiet_NaN()},
  {R"oracle("-")oracle",std::numeric_limits<double>::quiet_NaN()},
 };
 for(const auto& test:cases){const auto actual=project::legacyjson::number(winrt::Windows::Data::Json::JsonValue::Parse(winrt::to_hstring(test.json)));if(!((std::isnan(actual)&&std::isnan(test.expected))||(actual==test.expected&&(actual!=0||std::signbit(actual)==std::signbit(test.expected)))))throw std::runtime_error(std::string("Legacy Number oracle mismatch: ")+test.json);}
}
int main(){try{legacyNumberOracle();
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
 for(int mode=10;mode<=22;++mode){const auto bytes=tests::timelapseRestoreArchive(mode);const auto original=*bytes;project::TimelapseRestoreReport report;auto imported=project::prepareEditableImport(project::readProjectManifest(bytes,{},&report));const auto& settings=imported.timelapse;
  const std::size_t expected=(mode==12||mode==13||mode==20)?0:(mode==15||mode==18||mode==19||mode==22)?2:3;CHECK(settings.snapshots.size()==expected&&report.timelapseFrames==expected&&report.droppedTimelapseFrames==((expected==2)?1:0)&&*bytes==original);
  if(mode==10||mode==17){const auto& f=settings.snapshots[1];CHECK(f.width==4&&f.height==4&&f.capturedAt==19&&f.elapsedMs==(mode==17?1:0)&&f.changeScore==0);}
  if(mode==11)CHECK(!settings.enabled&&!settings.recordUndoSteps&&settings.quality==timelapse::Quality::Medium&&settings.mode==timelapse::Mode::Smart&&settings.fps==12&&settings.speed==8);
  if(mode==13||mode==20)CHECK(!settings.enabled&&settings.fps==12&&settings.speed==8);
  if(mode==14)CHECK(!settings.snapshots[1].local&&!settings.snapshots[1].data.empty());
  if(mode==15)CHECK(report.dropReasons==std::vector<std::string>({"missing-data"}));
  if(mode==16)CHECK(settings.snapshots[1].local&&settings.snapshots[1].data.empty()&&settings.snapshots[1].local->checksum==42);
  if(mode==18||mode==19)CHECK(report.dropReasons==std::vector<std::string>({"invalid-dimensions"}));
  if(mode==21)CHECK(settings.fps==13&&settings.speed==64&&settings.quality==timelapse::Quality::High&&settings.snapshots[1].changeScore==1&&settings.snapshots[1].capturedAt==0&&settings.snapshots[1].elapsedMs==0);
  if(mode==22)CHECK(report.dropReasons==std::vector<std::string>({"invalid-metadata"}));
  auto document=Document::fromImage(imported.width,imported.height,std::vector<Pixel>(16,0xff123456),U"兼容恢复");document.setImportedTimelapse(settings);const auto encoded=project::encodeEditableProject(document);project::TimelapseRestoreReport saved;const auto reread=project::readProjectManifest(encoded.bytes,{},&saved);CHECK(saved.droppedTimelapseFrames==0&&reread.timelapse.snapshots.size()==expected);
 }
 for(int mode:{7,8,9}){bool rejected=false;try{project::readProjectManifest(tests::timelapseRestoreArchive(mode));}catch(const project::Error&){rejected=true;}CHECK(rejected);}
 const auto bytes=tests::timelapseRestoreArchive(1);project::Limits limits;limits.expandedBytes=1;bool limited=false;try{project::readProjectManifest(bytes,limits);}catch(const project::Error& error){limited=error.kind==project::ErrorKind::Limit;}CHECK(limited);
 std::cout<<"Timelapse partial restore, counts/reasons, native guards, pixels/history, unchanged source and clean save/reopen passed\n";return 0;
}catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}}
