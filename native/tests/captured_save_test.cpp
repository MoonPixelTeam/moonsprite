#include "captured_save.h"
#include "save_task.h"
#include "atomic_write.h"
#include "aseprite_io.h"
#include "recovery_store.h"
#include <windows.h>
#include <fstream>
#include <iostream>

using namespace moon;
using namespace moon::workspace;
namespace {
void check(bool value,const char* why){if(!value)throw std::runtime_error(why);}
using Job=SaveTask<project::EncodedProject>;
const project::Bytes sentinel{17,23,42};
struct FaultState {
 std::string fault;
 project::Bytes target=sentinel,temporary;
 bool open=false,created=false,removed=false,replaced=false;
 int encodes=0,writes=0;
};
// These are outcomes of the narrow operations, not a second commit protocol.
// Real encoders feed the production writeAtomicBytes and runCapturedSave.
struct FileOperations {
 using Handle=int;
 FaultState& state;
 Handle create(const std::filesystem::path&){
  if(state.fault=="create")throw std::system_error(std::error_code(5,std::system_category()));
  state.open=state.created=true;return 1;
 }
 std::size_t write(Handle,const std::uint8_t* bytes,std::size_t size){
  ++state.writes;state.temporary.insert(state.temporary.end(),bytes,bytes+size);
  if(state.fault=="write")throw std::system_error(std::error_code(112,std::system_category()));
  return state.fault=="short"?size-1:size;
 }
 void flush(Handle){if(state.fault=="flush")throw std::system_error(std::error_code(1117,std::system_category()));}
 void close(Handle)noexcept{state.open=false;}
 void replace(const std::filesystem::path&,const std::filesystem::path&){
  if(state.fault=="replace")throw std::system_error(std::error_code(32,std::system_category()));
  state.target=state.temporary;state.replaced=true;
 }
 void remove(const std::filesystem::path&)noexcept{state.temporary.clear();state.removed=true;}
};
struct WorkerOperations:CapturedSaveOperations {
 std::shared_ptr<FaultState> state;
 void write(const CapturedSaveRequest& request,const project::Bytes& bytes){
  FileOperations files{*state};io::AtomicWritePolicy policy;
  policy.beforeReplace=[&](const auto&){
   if(state->fault=="verify"||state->fault=="backup")throw std::runtime_error(state->fault);
  };
  auto temporary=request.path;temporary+=".owned.tmp";
  io::writeAtomicBytes(files,request.path,temporary,bytes.data(),bytes.size(),policy);
 }
 project::Bytes image(const Document& document,const CapturedSaveRequest& request){
  ++state->encodes;
  if(state->fault=="encode")throw std::runtime_error("controlled image encoder rejection");
  return CapturedSaveOperations::image(document,request);
 }
 project::EncodedProject native(Document& document,const CapturedSaveRequest& request){
  ++state->encodes;project::Limits limits;
  if(state->fault=="encode")limits.expandedBytes=1; // Real native encoder admission failure.
  auto encoded=project::encodeEditableProject(document,limits);
  write(request,*encoded.bytes);document.acceptSaved(encoded.projectId,encoded.bytes);return encoded;
 }
};
DocumentSnapshot take(Job& job,const Document& document){
 while(!job.snapshot->advance(document,std::chrono::steady_clock::now()+std::chrono::seconds(1))){}
 auto result=std::move(*job.snapshot);job.snapshot.reset();return result;
}
project::Bytes read(const std::filesystem::path& path){std::ifstream in(path,std::ios::binary);check(bool(in),"Missing owned file");return {std::istreambuf_iterator<char>(in),{}};}
void failure(const std::filesystem::path& root,SaveImageFormat format,const char* fault,bool background,bool sourceOnly){
 auto document=Document::fromImage(3,2,std::vector<Pixel>(6,0xff123456),U"Failure owner");
 document.beginStroke({0,0},0xffabcdef);document.commitStroke();
 const auto pixels=document.canvasPixels();const auto history=document.historySize(),revision=document.revision();
 const auto archive=document.sourceArchive();const auto projectId=document.projectId();
 const auto originalPath=root/"original.moonsprite";auto savedPath=originalPath;
 Job foreground;foreground.begin(document,root/(std::wstring(L"destination")+saveImageExtension(format)),format!=SaveImageFormat::Native,sourceOnly,false,100);
 auto snapshot=take(foreground,document);const CapturedSaveRequest request{foreground.path,format,false,100};
 auto state=std::make_shared<FaultState>();state->fault=fault;
 foreground.worker=std::async(std::launch::async,[capture=std::move(snapshot),request,state]()mutable{
  WorkerOperations operations;operations.state=state;
  return runCapturedSave(std::move(capture),request,{},operations);
 });
 Job detached;Job* job=&foreground;if(background){detached=std::move(foreground);job=&detached;}
 bool rejected=false,accepted=false;
 try{
  auto result=job->worker.get();
  acceptSaveResult(document,savedPath,*job,std::move(result),[&](auto&,const auto&,bool,bool){accepted=true;});
 }catch(const std::exception&){rejected=true;}
 check(rejected&&!accepted&&state->encodes==1,"Worker failure was accepted or encoder skipped");
 check(state->target==sentinel&&!state->replaced&&!state->open,"Failed worker replaced target or leaked ownership");
 check(state->removed==(std::string(fault)!="encode"&&std::string(fault)!="create"),"Failed worker cleaned an unowned temporary or leaked its own");
 check(savedPath==originalPath&&document.dirty()&&document.canvasPixels()==pixels&&document.historySize()==history&&document.revision()==revision&&document.sourceArchive()==archive&&document.projectId()==projectId,"Worker failure changed owner baseline/artwork/path/history");
 check(read(root/"recovery"/"owner.moonsprite")==sentinel,"Worker failure removed recovery protection");
 // Explicit retry uses the actual filesystem adapter and the same worker.
 Job retry;retry.begin(document,job->path,format!=SaveImageFormat::Native,sourceOnly,false,100);
 auto result=runCapturedSave(take(retry,document),request);
 check(document.dirty()&&savedPath==originalPath,"Worker cleared live dirty before acknowledgement");
 check(acceptSaveResult(document,savedPath,retry,std::move(result),acceptAsepriteSaved),"Exact retry was rejected");
 check(!document.dirty()&&savedPath==(sourceOnly?originalPath:request.path)&&std::filesystem::exists(request.path),"Explicit retry failed or source-only overwrote project identity");
 check(read(root/"recovery"/"owner.moonsprite")==sentinel,"Worker/acceptance bypassed recovery cleanup coordination");
}
}
int main(){try{
 const auto root=std::filesystem::absolute(std::filesystem::path("test-tmp/captured-save-owned")/(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64())));
 std::filesystem::create_directories(root);project::writeRecoveryFiles(root/"recovery",{"owner","Failure owner","1"},sentinel);
 int completed=0;
 for(auto format:{SaveImageFormat::Native,SaveImageFormat::Png,SaveImageFormat::Jpeg,SaveImageFormat::Webp,SaveImageFormat::Svg,SaveImageFormat::Ico,SaveImageFormat::Bmp,SaveImageFormat::Gif,SaveImageFormat::Psd,SaveImageFormat::Ase,SaveImageFormat::Aseprite})
  for(const auto* fault:{"encode","create","write","short","flush","replace","verify","backup"}){
   if(format!=SaveImageFormat::Native&&(std::string(fault)=="verify"||std::string(fault)=="backup"))continue;
   for(bool background:{false,true})for(bool sourceOnly:{false,true}){
    if(format==SaveImageFormat::Native&&sourceOnly)continue;
    failure(root,format,fault,background,sourceOnly);++completed;
   }
  }
 check(completed==256,"Captured-save matrix incomplete");
 std::cout<<completed<<" captured-worker failures and real explicit retries across11 formats: encode/create/write/disk-full/short/flush/replace, native verification/backup, foreground/background/source-only, recovery and exact acknowledgement passed without UI\n";
 return 0;
}catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}}
