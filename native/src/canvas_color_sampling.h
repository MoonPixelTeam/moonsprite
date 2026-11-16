#pragma once
#include <algorithm>
#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <vector>

namespace moon {
// legacy core/canvas-color-sampling.ts. The host supplies native hit testing.
class CanvasColorSampling {
public:
 using Key=const void*;using Pixel=std::uint32_t;using Token=std::uint64_t;
 struct Point{int x=0,y=0;};
 using Sample=std::function<std::optional<Pixel>(Point)>;
 using Applied=std::function<void(Pixel,Point)>;
 using IntentApplied=std::function<void(Pixel,Point,bool)>;
 struct Surface{Key canvas;Sample sample;std::function<void(bool)> cursor;};
 std::function<Key(Point)> canvasAtPoint;
private:
 struct Entry{Token id;Surface surface;};
 struct Active{Key source;std::int64_t pointer;Applied apply;std::shared_ptr<Entry> current;};
 struct Intent{Key source;IntentApplied apply;};
 std::vector<std::shared_ptr<Entry>> surfaces_;std::optional<Active> active_;std::optional<Intent> intent_;Token serial_=0;
 std::shared_ptr<Entry> find(Key key)const{for(const auto& entry:surfaces_)if(entry->surface.canvas==key)return entry;return {};}
 std::shared_ptr<Entry> at(Point p)const{return canvasAtPoint?find(canvasAtPoint(p)):nullptr;}
public:
 Token add(Surface surface){auto entry=std::make_shared<Entry>(Entry{++serial_,std::move(surface)});surfaces_.push_back(entry);if(intent_)entry->surface.cursor(true);return entry->id;}
 void remove(Token id){
  auto it=std::find_if(surfaces_.begin(),surfaces_.end(),[id](const auto& entry){return entry->id==id;});if(it==surfaces_.end())return;
  auto entry=*it;surfaces_.erase(it);
  if(active_&&active_->current==entry){entry->surface.cursor(false);if(active_&&active_->current==entry)active_->current.reset();}
  if(active_&&active_->source==entry->surface.canvas)active_.reset();
 }
 void begin(Key source,std::int64_t pointer,Applied apply){if(active_)end();active_=Active{source,pointer,std::move(apply),{}};if(auto entry=find(source))entry->surface.cursor(true);}
 void end(std::optional<std::int64_t> pointer={}){
  if(!active_||(pointer&&active_->pointer!=*pointer))return;
  auto active=*active_;if(active.current)active.current->surface.cursor(false);if(auto entry=find(active.source))entry->surface.cursor(false);active_.reset();
 }
 void intent(Key source,IntentApplied apply){intent_=Intent{source,std::move(apply)};const auto entries=surfaces_;for(const auto& entry:entries)entry->surface.cursor(true);}
 void clearIntent(){intent_.reset();if(!active_){const auto entries=surfaces_;for(const auto& entry:entries)entry->surface.cursor(false);}}
 void clearIntentFor(Key source){if(intent_&&intent_->source==source)clearIntent();}
 bool intentActive()const{return intent_.has_value();}
 bool activeFor(Key source)const{return source&&active_&&active_->source==source;}
 std::optional<Pixel> sample(Point p)const{auto entry=at(p);return entry?entry->surface.sample(p):std::optional<Pixel>{};}
 bool routeIntent(Point p,bool secondary){
  if(!intent_)return false;auto entry=at(p);if(!entry||entry->surface.canvas==intent_->source)return false;
  auto apply=intent_->apply;if(auto color=entry->surface.sample(p))apply(*color,p,secondary);return true;
 }
 bool route(Point p){
  if(!active_)return false;auto entry=at(p);if(!entry||entry->surface.canvas==active_->source)return false;
  if(active_->current!=entry){if(active_->current)active_->current->surface.cursor(false);if(!active_)return true;active_->current=entry;entry->surface.cursor(true);}
  if(!active_)return true;auto apply=active_->apply;if(auto color=entry->surface.sample(p))apply(*color,p);return true;
 }
};
}
