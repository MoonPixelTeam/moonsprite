#pragma once
#include <chrono>
#include <exception>
#include <functional>
#include <future>
#include <memory>
#include <optional>
#include <stdexcept>
namespace moon {
// Native adapter of legacy LatestTaskQueue. The UI owner enqueues/polls; the
// runner supplies an asynchronous future. Replacement never retains old data
// in acknowledgement callbacks, and only one runner future exists at a time.
template<class T> class LatestTaskQueue {
public:
 using Value=std::shared_ptr<const T>;
 using Acknowledgement=std::shared_ptr<const std::shared_future<void>>;
 using Runner=std::function<std::future<void>(Value)>;
private:
 struct Slot {Value value;std::shared_ptr<std::promise<void>> promise;Acknowledgement acknowledgement;};
 Runner runner_;std::function<void()> onIdle_;
 std::optional<Slot> active_,pending_;
 std::future<void> future_;
 static Slot slot(Value value){auto promise=std::make_shared<std::promise<void>>();auto acknowledgement=std::make_shared<const std::shared_future<void>>(promise->get_future().share());return {std::move(value),std::move(promise),std::move(acknowledgement)};}
 void finish(std::exception_ptr error){
  auto completed=std::move(*active_);active_.reset();
  if(pending_){active_=std::move(pending_);pending_.reset();start();}
  else {try{onIdle_();}catch(...){error=std::current_exception();}}
  if(error)completed.promise->set_exception(error);else completed.promise->set_value();
 }
 void start(){
  try{future_=runner_(active_->value);if(!future_.valid())throw std::logic_error("Latest task runner returned no future");}
  catch(...){finish(std::current_exception());}
 }
public:
 LatestTaskQueue(Runner runner,std::function<void()> onIdle):runner_(std::move(runner)),onIdle_(std::move(onIdle)){if(!runner_||!onIdle_)throw std::invalid_argument("Missing latest task callback");}
 LatestTaskQueue(const LatestTaskQueue&)=delete;
 LatestTaskQueue& operator=(const LatestTaskQueue&)=delete;
 Value runningValue()const{return active_?active_->value:Value{};}
 Value pendingValue()const{return pending_?pending_->value:Value{};}
 bool busy()const{return active_.has_value();}
 Acknowledgement enqueue(Value value){
  if(!value)throw std::invalid_argument("Empty latest task generation");
  if(!active_){active_=slot(std::move(value));const auto result=active_->acknowledgement;start();return result;}
  if(pending_){pending_->value=std::move(value);return pending_->acknowledgement;}
  pending_=slot(std::move(value));return pending_->acknowledgement;
 }
 // Pump on the owner thread, like JS promise continuations on the event loop.
 void poll(){
  while(active_&&future_.valid()&&future_.wait_for(std::chrono::seconds(0))==std::future_status::ready){
   std::exception_ptr error;try{future_.get();}catch(...){error=std::current_exception();}finish(error);
  }
 }
 // Close/save can wait explicitly; failures are delivered through each shared
 // acknowledgement. A failed generation never prevents pending work running.
 void waitIdle(){while(active_){if(future_.valid())future_.wait();poll();}}
};
}
