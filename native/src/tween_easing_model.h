#pragma once
#include "animation_crossfade.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>
namespace moon {
struct TweenEasingDraft {
 TweenEasing easing=TweenEasing::Linear;std::array<double,4> custom{.42,0,.58,1};
 std::optional<std::array<double,4>> dragOriginal;int dragged=-1;
 std::array<double,4> displayed()const{switch(easing){case TweenEasing::Linear:return {1./3,1./3,2./3,2./3};case TweenEasing::EaseIn:return {1./3,0,2./3,1./3};case TweenEasing::EaseOut:return {1./3,2./3,2./3,1};case TweenEasing::EaseInOut:return {1./3,0,2./3,1};default:return custom;}}
 void set(int index,double value){if(index<0||index>3||!std::isfinite(value))throw std::invalid_argument("Invalid easing coordinate");auto next=displayed();next[index]=std::clamp(value,0.,1.);custom=next;easing=TweenEasing::Custom;}
 void reset(){custom={.42,0,.58,1};easing=TweenEasing::Custom;}
 void begin(int index){if(index!=0&&index!=2)throw std::invalid_argument("Invalid easing handle");dragged=index;dragOriginal=displayed();}
 void move(double x,double y){if(dragged<0)return;auto next=displayed();next[dragged]=std::clamp(x,0.,1.);next[dragged+1]=std::clamp(y,0.,1.);custom=next;easing=TweenEasing::Custom;}
 void finish(){dragged=-1;dragOriginal.reset();}
 void cancel(){if(dragOriginal){custom=*dragOriginal;easing=TweenEasing::Custom;}finish();}
};
inline std::pair<double,double> tweenCurvePlotPoint(double x,double y,double left,double top,double width,double height){return {std::clamp(((x-left)/std::max(1.,width)*124-12)/100,0.,1.),std::clamp(1-((y-top)/std::max(1.,height)*124-10)/100,0.,1.)};}
}
