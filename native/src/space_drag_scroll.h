#pragma once
#include <algorithm>
#include <functional>
#include <optional>
#include <utility>
namespace moon {
// Port of legacy components/useSpaceDragScroll.ts. Coordinates and scroll
// offsets use the same physical-pixel space; adapters own hit testing/capture.
class SpaceDragScroll {
public:
 struct Position {int x=0,y=0;};
 struct Target {
  std::function<Position()> position;
  std::function<Position()> maximum;
  std::function<void(Position)> scroll;
 };
private:
 struct Gesture {Position pointer,start,maximum;Target target;};
 std::optional<Gesture> gesture_;
public:
 bool active() const{return gesture_.has_value();}
 static Position position(Position startPointer,Position pointer,Position startScroll,Position maximum){
  return {std::clamp(startScroll.x-(pointer.x-startPointer.x),0,std::max(0,maximum.x)),std::clamp(startScroll.y-(pointer.y-startPointer.y),0,std::max(0,maximum.y))};
 }
 bool begin(Position pointer,bool middle,bool left,bool space,Target target){
  if(active() || (!middle && !(left && space)))return false;
  const auto maximum=target.maximum();if(maximum.x<=0 && maximum.y<=0)return false;
  const auto start=target.position();gesture_=Gesture{pointer,start,maximum,std::move(target)};return true;
 }
 void resized(){if(gesture_)gesture_->maximum=gesture_->target.maximum();}
 bool move(Position pointer){if(!gesture_)return false;auto next=position(gesture_->pointer,pointer,gesture_->start,gesture_->maximum);gesture_->target.scroll(next);return true;}
 // Legacy cancel and pointerup both retain the latest scroll position.
 bool finish(){const bool wasActive=active();gesture_.reset();return wasActive;}
};
}
