#include "recovery_scheduler.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>
namespace moon::recovery {
double Scheduler::normalizeMinutes(double value) {if(!std::isfinite(value)) return 5.0;return std::clamp(value,0.5,60.0);}
Scheduler::Scheduler(double minutes):intervalMinutes_(normalizeMinutes(minutes)) {}
void Scheduler::request(const Target& target) {
 if(target.id.empty()) throw std::invalid_argument("Recovery target ID must not be empty");
 // Legacy deduplication happens on dequeue, not submission: an intervening
 // delete or older in-flight save can change the baseline before this runs.
 for(auto it=pending_.rbegin();it!=pending_.rend();++it) {
  if(it->target.id!=target.id) continue;
  if(it->kind==Kind::Delete) break;
  it->target=target;return;
 }
 pending_.push_back({0,Kind::Save,target});
}
void Scheduler::requestDelete(const std::string& id) {
 if(id.empty()) throw std::invalid_argument("Recovery ID must not be empty");
 pending_.erase(std::remove_if(pending_.begin(),pending_.end(),[&](const auto& t){return t.kind==Kind::Save&&t.target.id==id;}),pending_.end());
 Target target;target.id=id;pending_.push_back({0,Kind::Delete,std::move(target)});
}
std::optional<Ticket> Scheduler::next() {
 if(inFlight_) return std::nullopt;
 while(!pending_.empty()) {
  Ticket t=std::move(pending_.front());pending_.pop_front();
  if(t.kind==Kind::Save&&hasSavedRevision(t.target)) continue;
  t.sequence=++sequence_;inFlight_=t;return t;
 }
 return std::nullopt;
}
bool Scheduler::complete(const Ticket& ticket,bool success) {
 if(!inFlight_||inFlight_->sequence!=ticket.sequence||inFlight_->kind!=ticket.kind||inFlight_->target.id!=ticket.target.id) return false;
 const auto current=*inFlight_;inFlight_.reset();
 if(success&&current.kind==Kind::Save) saved_[current.target.id]={current.target.revision,current.target.contentRevision,current.target.hasRevision,current.target.hasContentRevision};
 if(success&&current.kind==Kind::Delete) saved_.erase(current.target.id);
 return true;
}
bool Scheduler::hasSavedRevision(const Target& target) const {
 if(!target.hasRevision&&!target.hasContentRevision) return false;
 const auto it=saved_.find(target.id);if(it==saved_.end()) return false;
 const auto& s=it->second;return s.hasRevision==target.hasRevision&&s.hasContentRevision==target.hasContentRevision&&(!s.hasRevision||s.revision==target.revision)&&(!s.hasContentRevision||s.contentRevision==target.contentRevision);
}
}
