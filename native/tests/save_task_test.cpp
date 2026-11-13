#include "save_task.h"
#include "save_decision.h"
#include "image_save.h"
#include <functional>
#include <iostream>
#include <stdexcept>
#include <vector>
using namespace moon;
namespace {
struct Result {std::shared_ptr<const std::vector<std::uint8_t>> bytes;std::string projectId;};
using Job=workspace::SaveTask<Result>;
void check(bool value,const char* why){if(!value)throw std::runtime_error(why);}
Result artifact(){return {std::make_shared<const std::vector<std::uint8_t>>(4,23),"saved-project"};}
void dot(Document& d,int x,Pixel color){d.beginStroke({x,0},color);d.commitStroke();}
auto noImage=[](Document&,const std::filesystem::path&,bool,bool){throw std::runtime_error("Native save called image acceptance");};
void delayed(bool background,const std::function<void(Document&)>& edit,bool expectedExact){
 Document d(4,2);dot(d,0,0xff123456);std::filesystem::path path="old.moonsprite";
 Job foreground;foreground.begin(d,"saved.moonsprite",false,false,false,100);
 // Freeze a real snapshot first, then defer only acknowledgement with a promise.
 while(!foreground.snapshot->advance(d,std::chrono::steady_clock::now()+std::chrono::seconds(1))){}
 auto copy=foreground.snapshot->finish();foreground.snapshot.reset();
 check(copy.pixels()==d.pixels(),"Snapshot differs before later edit");
 std::promise<Result> writer;foreground.worker=writer.get_future();
 Job detached;Job* job=&foreground;
 if(background){detached=std::move(foreground);job=&detached;check(!foreground.worker.valid(),"Foreground retained background worker");}
 check(!job->ready(),"Unfinished save reported ready");
 edit(d);const auto pixels=d.pixels();const auto history=d.historyPosition();
 writer.set_value(artifact());check(job->ready(),"Completed save did not become ready");
 const bool exact=workspace::acceptSaveResult(d,path,*job,job->worker.get(),noImage);
 check(exact==expectedExact,"Wrong save generation acceptance");
 check(d.dirty()!=expectedExact&&path=="saved.moonsprite"&&d.projectId()=="saved-project"&&d.sourceArchive(),"Save baseline, path or dirty protection");
 check(d.pixels()==pixels&&d.historyPosition()==history,"Save acknowledgement changed live pixels/history");
 if(d.strokeActive())d.cancelStroke();
}
}
int main(){try{
 for(bool sourceOnly:{false,true})for(bool stale:{false,true}){
  Document document(3,1);dot(document,0,0xff123456);document.setSourceFilePath("original.png");
  Job job;job.begin(document,"rejected.png",true,sourceOnly,false,100);job.snapshot.reset();if(stale)dot(document,1,0xffabcdef);
  const auto pixels=document.pixels();const auto revision=document.revision(),position=document.historyPosition();const auto name=document.name();std::filesystem::path path="original.moonsprite";
  bool rejected=false;
  try{workspace::acceptSaveResult(document,path,job,Result{},[](Document&,const auto&,bool,bool){throw std::bad_alloc();});}catch(const std::bad_alloc&){rejected=true;}
  check(rejected&&document.dirty()&&document.name()==name&&document.sourceFilePath()=="original.png"&&path=="original.moonsprite"&&document.pixels()==pixels&&document.revision()==revision&&document.historyPosition()==position,"Rejected image acknowledgement changed owner, paths, content or save point");
 }
 {
  Document document(3,1),replacement(3,1);document.setSourceFilePath("source.png");std::filesystem::path saved="saved.png";
  const auto approval=workspace::SaveDecisionContext::capture(document,saved,SaveImageFormat::Png,{"layers","frames"});
  check(approval.matchesOwnerTarget(document,saved),"Fresh confirmation owner/target rejected");
  check(approval.covers(SaveImageFormat::Png,{"frames","layers"})&&approval.covers(SaveImageFormat::Png,{}),"Same-format approval must cover subsets/order");
  check(!approval.covers(SaveImageFormat::Psd,{"layers"})&&!approval.covers(SaveImageFormat::Png,{"effects"}),"Unapproved format/category accepted");
  dot(document,0,0xffabcdef);check(approval.matchesOwnerTarget(document,saved),"Pixel edit must not invalidate stable-owner approval");
  check(!approval.matchesOwnerTarget(document,"moved.png"),"Saved target change accepted");
  document.setSourceFilePath("moved-source.png");check(!approval.matchesOwnerTarget(document,saved),"Source target change accepted");
  replacement.setSourceFilePath("source.png");check(!approval.matchesOwnerTarget(replacement,saved),"Replacement identity inherited approval");
 }

 for(bool background:{false,true}){
  delayed(background,[](Document&){},true);
  delayed(background,[](Document& d){dot(d,1,0xffabcdef);},false);
  delayed(background,[](Document& d){d.setSymmetryCenter({1.25,-2.75},false);},false);
  delayed(background,[](Document& d){d.beginStroke({1,0},0xffabcdef);},false);
  delayed(background,[](Document& d){d.mutableTimelapseSettings().fps=23;d.markTimelapseModified();},false);
 }
 Document original(2,2),other(2,2);dot(original,0,0xff123456);Job job;
 job.begin(original,"target.moonsprite",false,false,false,100);std::filesystem::path path="other.moonsprite";
 bool rejected=false;try{workspace::acceptSaveResult(other,path,job,artifact(),noImage);}catch(const std::runtime_error&){rejected=true;}
 check(rejected&&path=="other.moonsprite"&&other.projectId().empty()&&!other.sourceArchive(),"Wrong identity accepted bytes or target path");
 rejected=false;try{job.begin(original,"replacement.moonsprite",false,false,false,100);}catch(const std::logic_error&){rejected=true;}
 check(rejected&&job.path=="target.moonsprite","Live capture was overwritten");
 job.snapshot.reset();job.begin(original,"copy.png",true,true,false,200);job.snapshot.reset();
 int called=0;bool exactImage=false;bool sourceImage=false;
 auto image=[&](Document& d,const auto& destination,bool source,bool exact){++called;exactImage=exact;sourceImage=source;check(&d==&original&&destination=="copy.png","Image owner/target changed");if(exact)d.markSaved();};
 path="native.moonsprite";check(workspace::acceptSaveResult(original,path,job,Result{},image),"Exact image result");
 check(called==1&&exactImage&&sourceImage&&path=="native.moonsprite"&&!original.dirty(),"Source-only image changed saved target");
 dot(original,1,0xffabcdef);check(!workspace::acceptSaveResult(original,path,job,Result{},image)&&original.dirty(),"Old image result cleared later edit");
 check(called==2&&!exactImage&&path=="native.moonsprite","Old image result lost source-only semantics");
 Document failure(2,2);dot(failure,0,0xff123456);Job failed;failed.begin(failure,"failed.moonsprite",false,false,false,100);failed.snapshot.reset();
 std::promise<Result> writer;failed.worker=writer.get_future();writer.set_exception(std::make_exception_ptr(std::runtime_error("disk failure")));
 try{workspace::acceptSaveResult(failure,path,failed,failed.worker.get(),noImage);throw std::logic_error("Writer failure was swallowed");}catch(const std::runtime_error& e){check(std::string(e.what())=="disk failure","Wrong writer failure");}
 check(failure.dirty()&&failure.projectId().empty()&&path=="native.moonsprite","Failed write changed baseline/path");
 failed.begin(failure,"retry.moonsprite",false,false,false,100);failed.snapshot.reset();check(workspace::acceptSaveResult(failure,path,failed,artifact(),noImage)&&!failure.dirty(),"Failed job blocked retry");
 std::cout<<"Foreground/background transfer, exact/old writes, identity, preview, recording, image and failure/retry passed without UI/codecs\n";
 return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
