#include "playback_session.h"
#include <iostream>
#include <memory>
#include <stdexcept>

using namespace moon;
using workspace::PlaybackSession;
static void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
struct Session {Document document{2,1};PlaybackSession playback;};
static void bindSession(const std::shared_ptr<Session>& session){
  auto& playback=session->playback;auto& document=session->document;
  playback.modeIdentity=document.identity();playback.modeLoop=document.animationLoop();playback.observedFrame=document.frame().id;
  document.setAnimationChangeListener([weak=std::weak_ptr<Session>(session)](const Document& source,const AnimationChange& change){
    if(auto owner=weak.lock();owner&&&owner->document==&source)workspace::observePlaybackChange(owner->playback,source,change);
  });
}
int main(){try{
  auto a=std::make_shared<Session>(),b=std::make_shared<Session>();
  auto& document=a->document;auto& playback=a->playback;
  playback.playing=true;playback.rate=1.5;playback.returnToStart=true;
  playback.startFrame="return-point";playback.identity=41;playback.revision=7;
  playback.due=std::chrono::steady_clock::now();const auto due=playback.due;
  playback.tagCycle="stale";playback.loop.current.sectionId="old";
  workspace::initializePlaybackMode(playback,document,std::string("tag"));
  check(playback.modeIdentity==document.identity()&&playback.mode=="tag"&&playback.tagMode&&playback.modeLoop&&playback.observedFrame==document.frame().id&&playback.tagCycle.empty()&&playback.loop.current.sectionId.empty(),"Explicit bind did not initialize mode projection");
  check(playback.playing&&playback.rate==1.5&&playback.returnToStart&&playback.startFrame=="return-point"&&playback.identity==41&&playback.revision==7&&playback.due==due,"Mode bind changed clock, pause state or return point");
  workspace::initializePlaybackMode(playback,document,std::nullopt);
  check(playback.mode=="all"&&!playback.tagMode,"Loop-derived default mode");
  const auto first=document.frame().id;document.addFrame();const auto second=document.frame().id;document.addFrame();const auto third=document.frame().id;
  timeline::LoopSection section;section.name=U"Ping-pong";section.startFrameId=first;section.endFrameId=second;section.direction="ping-pong";section.repeatCount=3;
  const auto sectionId=document.createLoopSection(section);document.selectFrame(first);bindSession(a);bindSession(b);
  const auto history=document.historySize(),revision=document.revision();
  playback.playing=true;playback.tagMode=true;playback.mode="tag";
  playback.loop={{sectionId,2,3},{{"parent",1,2}},true};playback.tagCycle=sectionId;
  const auto observedBefore=playback.observedFrame;playback.observedFrame="selection-only-sentinel";
  workspace::observePlaybackChange(playback,document,{AnimationChange::Kind::MaskSelectionChanged});
  workspace::observePlaybackChange(playback,document,{AnimationChange::Kind::FloatingSettled});
  workspace::observePlaybackChange(playback,document,{AnimationChange::Kind::SelectionPreviewChanged});
  check(playback.observedFrame=="selection-only-sentinel"&&playback.loop.current.iteration==2&&playback.loop.current.position==3&&playback.loop.stack.size()==1&&playback.tagCycle==sectionId,"Mask selection notification retargeted playback");
  playback.observedFrame=observedBefore;
  document.selectFrame(second,AnimationFrameOrigin::Playback);
  check(playback.loop.current.iteration==2&&playback.loop.current.position==3&&playback.loop.stack.size()==1&&playback.tagCycle==sectionId&&playback.observedFrame==second,"Playback step discarded ping-pong direction/stack");
  document.selectFrame(first);
  check(playback.loop.current.sectionId==sectionId&&playback.loop.current.iteration==0&&!playback.loop.current.position&&playback.loop.stack.empty()&&playback.tagCycle.empty(),"Manual frame did not retarget independently of refresh");
  document.selectFrame(third);
  check(playback.loop.current.sectionId.empty()&&playback.observedFrame==third,"Manual frame outside tag retained old loop");
  playback.playing=false;playback.loop={{sectionId,2,3},{},false};document.selectFrame(second);
  check(playback.loop.current.iteration==2&&playback.loop.current.position==3,"Paused manual frame unexpectedly discarded resumable traversal");
  check(document.historySize()==history&&document.revision()==revision,"Observation changed artwork history");

  // A loop metadata operation on an inactive owner updates only that owner.
  b->playback.mode="tag";b->playback.tagMode=true;b->playback.tagCycle="other";
  b->document.setAnimationLoop(false);
  check(b->playback.mode=="once"&&!b->playback.tagMode&&b->playback.tagCycle.empty()&&playback.mode=="tag"&&playback.loop.current.iteration==2,"Inactive metadata event affected the wrong session");
  b->document.undo();check(b->playback.mode=="all"&&b->playback.modeLoop,"Undo loop did not update owner before refresh");
  b->document.redo();check(b->playback.mode=="once"&&!b->playback.modeLoop,"Redo loop did not update owner");
  b->document.setImportedLoop(true);check(b->playback.mode=="all","Imported loop event not observed");

  auto snapshot=document;snapshot.setImportedLoop(false);check(playback.mode=="tag","Checkpoint retained session callback");
  const auto identity=playback.modeIdentity;document=Document(2,1);document.setImportedLoop(false);
  check(playback.modeIdentity==identity&&playback.mode=="tag","Replacement implicitly rebound runtime playback");
  // Move a live subscribed Document out, then release its session. A copied
  // checkpoint would drop the callback and could not detect an ownership cycle.
  auto retained=std::make_shared<Document>(std::move(b->document));std::weak_ptr<Session> weak=b;b.reset();
  check(weak.expired(),"Live document callback retained closed session");
  retained->setImportedLoop(!retained->animationLoop());
  a.reset();
  std::cout<<"Playback-origin preservation, manual retarget, pause, inactive owner, loop Undo/Redo/import and weak ownership passed without Editor/UI\n";
  return 0;
}catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}}
