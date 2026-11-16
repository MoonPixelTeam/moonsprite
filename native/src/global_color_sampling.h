#pragma once
#include <cstdint>
#include <chrono>
#include <functional>
#include <future>
#include <optional>
#include <vector>

namespace moon {
// ColorValueControl global sampling refs/RAF queue. All callbacks run on the
// owner thread; only the platform capture future may execute elsewhere.
class GlobalColorSampling {
public:
 using Pixel=std::uint32_t;
 struct Point {int x=0,y=0;};
 struct Picker {std::optional<Pixel> color;}; // handled empty blocks fallback
 struct Capture {std::vector<Pixel> pixels;std::optional<Pixel> color;};
 struct Ports {
  std::function<std::optional<Picker>(Point)> picker;
  std::function<std::optional<Pixel>(Point)> canvas,fallback;
  std::function<std::future<Capture>(Point,bool)> capture;
  std::function<void(Pixel)> apply;
  std::function<void(Point,const std::vector<Pixel>&)> lens;
  std::function<void(Point)> moveLens;
  std::function<void()> hideLens,finishPicker;
  std::function<bool(Point)> hideAt;
 } ports;
private:
 struct Request {Point point;std::uint64_t sequence,epoch;bool requireActive,showLens;};
 struct Job {Request request;std::future<Capture> future;};
 std::optional<Request> pending_;
 std::optional<Job> running_;
 std::vector<Job> finals_;
 std::optional<Point> pointer_;
 Pixel working_=0;
 std::uint64_t sequence_=0,epoch_=0;
 bool active_=false,lensEnabled_=true,finishing_=false;
 void finishPicker(){finishing_=false;if(ports.finishPicker)ports.finishPicker();}
 bool current(const Request& r)const{return r.sequence==sequence_&&(!r.requireActive||active_);}
 void apply(Pixel p){if(p!=working_){working_=p;if(ports.apply)ports.apply(p);}}
 void lens(const Request& r,const std::vector<Pixel>& pixels){
  if(!lensEnabled_||r.epoch!=epoch_||(r.requireActive&&!active_))return;
  if(ports.hideAt&&(ports.hideAt(r.point)||(pointer_&&ports.hideAt(*pointer_)))){ports.hideLens();return;}
  if(ports.lens)ports.lens(pointer_.value_or(r.point),pixels);
 }
 void complete(const Request& r,Capture result){
  if(!result.pixels.empty()){
   if(r.showLens)lens(r,result.pixels);
   if(current(r))apply(result.pixels[result.pixels.size()/2]);
  }else if(current(r)){
   auto p=result.color;
   if(!p&&ports.fallback)p=ports.fallback(r.point);
   if(p){if(!result.color&&r.showLens)lens(r,std::vector<Pixel>(121,*p));apply(*p);}
  }
  if(!r.requireActive&&r.sequence==sequence_)finishPicker();
 }
 // Returns a job only for native capture. Picker/canvas reads stay synchronous.
 std::optional<Job> sample(Request r){
  if(!current(r))return {};
  if(ports.picker)if(auto p=ports.picker(r.point)){ports.hideLens();if(p->color)apply(*p->color);if(!r.requireActive&&r.sequence==sequence_)finishPicker();return {};}
  if(ports.canvas)if(auto p=ports.canvas(r.point)){
   if(r.showLens){std::vector<Pixel> grid;grid.reserve(121);for(int y=-5;y<=5;++y)for(int x=-5;x<=5;++x)grid.push_back(ports.canvas({r.point.x+x,r.point.y+y}).value_or(*p));lens(r,grid);}
   apply(*p);if(!r.requireActive&&r.sequence==sequence_)finishPicker();return {};
  }
  try{auto future=ports.capture(r.point,r.showLens&&lensEnabled_);if(future.valid())return Job{r,std::move(future)};}catch(...){}
  complete(r,{});return {};
 }
 static bool ready(Job& job){return job.future.valid()&&job.future.wait_for(std::chrono::seconds(0))==std::future_status::ready;}
 void finish(Job& job){Capture result;try{result=job.future.get();}catch(...){}complete(job.request,std::move(result));}
public:
 bool active()const{return active_;}
 bool busy()const{return pending_.has_value()||running_.has_value()||!finals_.empty();}
 void begin(Pixel working,bool lensEnabled){cancel();working_=working;lensEnabled_=lensEnabled;active_=true;++sequence_;++epoch_;}
 void queue(Point p){if(!active_)return;pointer_=p;pending_=Request{p,++sequence_,epoch_,true,true};if(ports.hideAt&&ports.hideAt(p))ports.hideLens();}
 void frame(){
  if(!active_||!pending_)return;
  const auto r=*pending_;if(ports.moveLens)ports.moveLens(r.point);
  if(ports.picker)if(auto p=ports.picker(r.point)){pending_.reset();ports.hideLens();if(p->color)apply(*p->color);return;}
  if(running_)return;
  pending_.reset();running_=sample(r);
 }
 void poll(){
  if(running_&&ready(*running_)){auto job=std::move(*running_);running_.reset();finish(job);if(active_&&pending_)frame();}
  for(std::size_t i=0;i<finals_.size();)if(ready(finals_[i])){auto job=std::move(finals_[i]);finals_.erase(finals_.begin()+i);finish(job);}else ++i;
 }
 void release(Point p){
  if(!active_)return;active_=false;pending_.reset();pointer_.reset();++sequence_;++epoch_;ports.hideLens();
  finishing_=true;auto job=sample({p,++sequence_,epoch_,false,false});if(job)finals_.push_back(std::move(*job));
 }
 void cancel(){const bool was=active_||finishing_;active_=finishing_=false;pending_.reset();pointer_.reset();++sequence_;++epoch_;if(ports.hideLens)ports.hideLens();if(was)finishPicker();}
};
}
