#include "wand_preview_controller.h"
#include <deque>
#include <iostream>
using namespace moon;
using namespace moon::workspace;
static void check(bool value,const char* why){if(!value)throw std::runtime_error(why);}
struct ManualExecutor {
 std::deque<std::function<void()>> jobs;
 PreviewExecutor executor(){return [this](auto work){jobs.push_back(std::move(work));};}
 void step(){check(!jobs.empty(),"Missing worker");auto work=std::move(jobs.front());jobs.pop_front();work();}
};
using Controller=WandPreviewController;
static auto source(){return std::make_shared<const std::vector<std::uint32_t>>(1,0);}
static Controller::Work sample(SelectionPoint point){return [point]{return std::optional<SelectionMask>{{point.x,point.y,1,1,{}}};};}
static void begin(Controller& controller){controller.begin({1,2,"layer","frame"},source());}
int main(){try{
 // The three Legacy MagicWandGesture tests, with UI-owned values.
 {WandGesture gesture;gesture.begin();const auto reply=gesture.request();
  check(!gesture.release(),"Release committed before reply");
  check(gesture.accept(reply)==WandGesture::Action::Commit,"Release before reply did not commit");
  check(!gesture.release()&&gesture.accept(reply)==WandGesture::Action::Discard,"Committed twice");}
 {WandGesture gesture;gesture.begin();check(gesture.accept(gesture.request())==WandGesture::Action::Preview,"First preview missing");
  const auto stale=gesture.request(),latest=gesture.request();check(!gesture.release(),"Old ready value committed");
  check(gesture.accept(stale)==WandGesture::Action::Discard,"Stale reply accepted");
  check(gesture.accept(latest)==WandGesture::Action::Commit,"Latest reply did not commit");}
 {WandGesture gesture;gesture.begin();const auto reply=gesture.request();gesture.cancel();
  check(!gesture.release()&&gesture.accept(reply)==WandGesture::Action::Discard,"Cancelled gesture resurrected");}
 {ManualExecutor executor;Controller controller(executor.executor());begin(controller);
  check(controller.matches({1,2,"layer","frame"})&&!controller.matches({2,2,"layer","frame"})&&!controller.matches({1,3,"layer","frame"})&&!controller.matches({1,2,"other","frame"})&&!controller.matches({1,2,"layer","other"}),"Context dimensions lost");
  check(controller.request({1,0})&&!controller.request({1,0}),"Same sample not deduplicated");
  check(controller.poll(true,sample).kind==Controller::Update::None&&executor.jobs.size()==1,"Worker not started");
  controller.request({2,0});controller.request({3,0});check(!controller.release(),"Release skipped pending sample");
  controller.poll(true,sample);check(executor.jobs.size()==1,"Concurrent worker started");executor.step();
  check(controller.poll(true,sample).kind==Controller::Update::None&&executor.jobs.size()==1,"Stale result published or latest not scheduled");
  executor.step();const auto result=controller.poll(true,sample);check(result.kind==Controller::Update::Commit&&result.selection&&result.selection->x==3,"Latest sample not committed");
  check(!controller.release()&&controller.poll(true,sample).kind==Controller::Update::None,"Commit repeated");}
 {ManualExecutor executor;Controller controller(executor.executor());begin(controller);controller.request({7,0});controller.poll(true,sample);executor.step();
  auto result=controller.poll(true,sample);check(result.kind==Controller::Update::Preview&&result.selection->x==7,"Ready preview missing");check(controller.release()&&!controller.release(),"Ready release was not exactly once");}
 {ManualExecutor executor;Controller controller(executor.executor());begin(controller);controller.request({0,0});
  controller.poll(true,[](auto){return []{return std::optional<SelectionMask>{};};});executor.step();controller.release();
  const auto result=controller.poll(true,sample);check(result.kind==Controller::Update::Commit&&!result.selection,"Empty selection confused with missing completion");}
 {ManualExecutor executor;Controller controller(executor.executor());begin(controller);controller.request({1,0});controller.poll(true,sample);controller.cancel();executor.step();
  check(controller.poll(false,sample).kind==Controller::Update::None&&!controller.hasSource(),"Cancelled result published");}
 {ManualExecutor executor;Controller controller(executor.executor());begin(controller);controller.request({1,0});
  controller.poll(true,[](auto)->Controller::Work{return []()->std::optional<SelectionMask>{throw std::runtime_error("old");};});
  controller.cancel();begin(controller);controller.request({9,0});executor.step();
  check(controller.poll(true,sample).kind==Controller::Update::None&&executor.jobs.empty(),"Old failure changed new gesture");
  controller.poll(true,sample);executor.step();check(controller.poll(true,sample).selection->x==9,"New gesture could not continue");}
 {ManualExecutor executor;Controller controller(executor.executor());begin(controller);controller.request({1,0});
  controller.poll(true,[](auto)->Controller::Work{return []()->std::optional<SelectionMask>{throw std::runtime_error("worker failed");};});controller.request({2,0});executor.step();
  const auto result=controller.poll(true,sample);check(result.kind==Controller::Update::Failed&&result.error=="worker failed"&&executor.jobs.empty(),"Pending point swallowed current failure");
  begin(controller);controller.request({4,0});controller.poll(true,sample);executor.step();check(controller.poll(true,sample).selection->x==4,"Failure prevented next gesture");}
 {Controller controller;begin(controller);controller.request({1,0});
  const auto result=controller.poll(true,[](auto)->Controller::Work{throw std::runtime_error("capture failed");});check(result.kind==Controller::Update::Failed&&result.error=="capture failed","Capture failure not observed");}
 {Controller controller([](auto){throw std::runtime_error("dispatch failed");});begin(controller);controller.request({1,0});
  const auto result=controller.poll(true,sample);check(result.kind==Controller::Update::Failed&&result.error=="dispatch failed","Dispatch failure not observed");}
 {ManualExecutor executor;std::weak_ptr<const std::vector<std::uint32_t>> retained;
  {Controller controller(executor.executor());auto pixels=source();retained=pixels;controller.begin({1,2,"layer","frame"},pixels);pixels.reset();controller.request({1,0});
   controller.poll(true,[&](auto){const auto snapshot=controller.source();return [snapshot]{check(snapshot->size()==1,"Lost worker snapshot");return std::optional<SelectionMask>{};};});}
  check(!retained.expired(),"Destroyed controller invalidated worker snapshot");executor.step();check(retained.expired(),"Completed worker retained snapshot");}
 std::cout<<"Legacy gesture and deterministic wand worker lifecycle checks passed\n";return 0;
}catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}}
