#pragma once
#include "timeline_model.h"
#include "reference_images.h"
#include <algorithm>
#include <cmath>
#include <optional>
namespace moon::preview {
struct Point{double x=0,y=0;};
struct View{
 std::optional<double> zoom;Point pan;bool follow=false;double initialWidth=0,initialHeight=0;
 void capture(double w,double h){if(initialWidth<=0&&w>0&&h>0){initialWidth=w;initialHeight=h;}}
 double scale(int w,int h,double viewportW,double viewportH,double dpr=1){capture(viewportW,viewportH);return zoom.value_or(referenceFit(std::min(initialWidth/std::max(1,w),initialHeight/std::max(1,h)),dpr));}
 Point origin(int w,int h,double scale,Point effectivePan,double dpr=1)const{return {std::round(((initialWidth-w*scale)/2+effectivePan.x)*dpr)/dpr,std::round(((initialHeight-h*scale)/2+effectivePan.y)*dpr)/dpr};}
 void setZoom(int w,int h,double viewportW,double viewportH,double next,Point pointer,double dpr=1){const double current=scale(w,h,viewportW,viewportH,dpr);if(!std::isfinite(next)||next<=0)return;if(!follow){const auto o=origin(w,h,current,pan,dpr);pan={pointer.x-(initialWidth-w*next)/2-(pointer.x-o.x)/current*next,pointer.y-(initialHeight-h*next)/2-(pointer.y-o.y)/current*next};}zoom=next;}
 Point followPan(int w,int h,double z,Point sourceCenter)const{auto clamp=[](double value,double viewport,double content){const double center=(viewport-content)/2;return std::clamp(value,std::min(0.,viewport-content)-center,std::max(0.,viewport-content)-center);};return {clamp((w/2.-sourceCenter.x)*z,initialWidth,w*z),clamp((h/2.-sourceCenter.y)*z,initialHeight,h*z)};}
};
struct Playback{
 std::string frame,start,mode="all",cycle;bool playing=false,returnToStart=false;double rate=1;timeline::LoopPlayback loop;
 const timeline::LoopSection* section(const timeline::State& state,const std::string& id)const{for(const auto& value:state.loopSections)if(value.id==id)return &value;return nullptr;}
 bool contains(const timeline::State& state,const timeline::LoopSection& value,const std::string& id)const{const auto r=timeline::loopRange(state,value);for(int i=r.start;i>=0&&i<=r.end;++i)if(state.frames[i].id==id)return true;return false;}
 std::string first(const timeline::State& state)const{for(const auto& value:state.frames)if(!value.disabled)return value.id;return {};}
 std::string next(const timeline::State& state,const std::string& id,bool wrap)const{bool found=false;for(const auto& value:state.frames){if(found&&!value.disabled)return value.id;if(value.id==id)found=true;}return wrap||!found?first(state):id;}
 bool install(const timeline::State& state,const timeline::LoopSection& value){const auto frames=timeline::loopPlaybackFrames(state,value);if(frames.empty())return false;loop={{value.id,0,{}},{},!value.repeatCount};frame=frames.front();return true;}
 void stop(){playing=false;if(returnToStart&&!start.empty())frame=start;start.clear();loop={};cycle.clear();}
 void setPlaying(const timeline::State& state,bool value){if(!value){stop();return;}if(first(state).empty()){playing=false;return;}start=frame;loop={};cycle.clear();if(mode=="tag"){const auto* tag=timeline::loopAtFrame(state,frame);if(tag){if(!install(state,*tag)){playing=false;return;}if(tag->repeatCount)cycle=tag->id;}}else if(mode=="once")frame=first(state);else{const auto at=std::find_if(state.frames.begin(),state.frames.end(),[&](const auto& f){return f.id==frame;});if(at==state.frames.end()||at->disabled)frame=next(state,frame,true);}playing=!frame.empty();}
 void setMode(const timeline::State& state,std::string value){mode=std::move(value);loop={};cycle.clear();if(playing&&mode=="tag"){const auto* tag=timeline::loopAtFrame(state,frame);if(!tag||!install(state,*tag)){stop();return;}if(tag->repeatCount)cycle=tag->id;}}
 void step(const timeline::State& state){if(!playing)return;if(!loop.current.sectionId.empty()){const auto* tag=section(state,loop.current.sectionId);if(!tag){stop();return;}const auto id=tag->id,end=tag->endFrameId;const bool finite=bool(tag->repeatCount);const auto result=timeline::advanceLoopPlayback(state,loop,frame);if(!result.completed){if(!result.frameId.empty())frame=result.frameId;return;}if(mode!="tag"||!finite){stop();return;}const auto continuation=next(state,end,true);const auto* cycleTag=section(state,cycle);if(cycleTag&&contains(state,*cycleTag,continuation)){install(state,*cycleTag);return;}if(!cycle.empty()){const auto* tagNext=timeline::loopAtFrame(state,continuation);if(tagNext&&tagNext->repeatCount){install(state,*tagNext);return;}loop={};frame=continuation;return;}const auto* tagNext=timeline::loopAtFrame(state,continuation);loop={};if(tagNext)install(state,*tagNext);else frame=continuation;return;}
 const auto target=next(state,frame,mode!="once");if(target.empty()||(mode=="once"&&target==frame)){stop();return;}if(mode=="tag"){if(const auto* cycleTag=section(state,cycle);cycleTag&&contains(state,*cycleTag,target)){install(state,*cycleTag);return;}if(const auto* tag=timeline::loopAtFrame(state,target);tag&&(cycle.empty()||tag->repeatCount)){install(state,*tag);return;}}frame=target;}
};
}
