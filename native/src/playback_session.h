#pragma once
#include "animation_change.h"
#include "document.h"
#include <chrono>
#include <cstdint>
#include <optional>
#include <string>

namespace moon::workspace {
// Legacy DocumentSession owns traversal; preferences only seed new sessions.
struct PlaybackSession {
  bool playing=false,tagMode=false,modeLoop=true,returnToStart=false;
  timeline::LoopPlayback loop;
  std::string mode="all",tagCycle,observedFrame,startFrame;
  std::uint64_t modeIdentity=0,identity=0,revision=0;
  std::chrono::steady_clock::time_point due;
  double rate=1;
};

// Mode initialization is an explicit bind/preferences operation. Do not change
// the clock, play/pause state or return point while applying this projection.
inline void initializePlaybackMode(PlaybackSession& playback,const Document& document,const std::optional<std::string>& savedMode){
  playback.mode=savedMode.value_or(document.animationLoop()?"all":"once");
  playback.tagMode=playback.mode=="tag";
  playback.tagCycle.clear();playback.loop={};
  playback.modeIdentity=document.identity();playback.modeLoop=document.animationLoop();
  playback.observedFrame=document.frame().id;
}

// Observe only a session already bound to this identity. Binding a replacement
// remains an explicit lifecycle action and cannot happen from refresh/paint.
inline void observePlaybackChange(PlaybackSession& playback,const Document& document,const AnimationChange& change){
  if(change.kind==AnimationChange::Kind::MaskSelectionChanged||change.kind==AnimationChange::Kind::FloatingSettled||change.kind==AnimationChange::Kind::SelectionPreviewChanged)return;
  if(playback.modeIdentity!=document.identity())return;
  if(playback.modeLoop!=document.animationLoop()){
    playback.mode=document.animationLoop()?"all":"once";
    playback.tagMode=false;playback.tagCycle.clear();playback.loop={};
    playback.modeLoop=document.animationLoop();
  }
  if(change.kind==AnimationChange::Kind::FrameSelected&&change.origin==AnimationFrameOrigin::Playback){
    playback.observedFrame=document.frame().id;
    return;
  }
  if(!playback.playing||!playback.tagMode||playback.observedFrame==document.frame().id)return;
  playback.loop={};playback.tagCycle.clear();
  const auto* section=timeline::loopAtFrame(document.timeline().state(),document.frame().id);
  if(section&&!timeline::loopPlaybackFrames(document.timeline().state(),*section).empty())
    playback.loop={{section->id,0,{}},{},!section->repeatCount};
  playback.observedFrame=document.frame().id;
}
}
