#include "local_history_budget.h"
#include "document.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <roapi.h>
#include <cmath>
#include <unordered_set>
namespace moon::local_history {
namespace {
struct Apartment {
 HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);
 Apartment(){if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize journal delta metadata");}
 ~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}
};
double deltaWeight(const Delta& delta){
 Apartment apartment;using namespace winrt::Windows::Data::Json;
 const auto root=JsonObject::Parse(winrt::to_hstring(delta.json));
 const auto declared=root.GetNamedNumber(L"bytes");
 if(!std::isfinite(declared)||declared<0)throw std::invalid_argument("Invalid journal delta cost");
 const auto patches=root.GetNamedArray(L"patches").Size();
 const auto origins=root.GetNamedObject(L"origins").GetNamedArray(L"before").Size();
 return declared+double(patches)*192.+double(origins)*64.+512.;
}
}
JournalSnapshot::Ptr JournalSnapshot::own(JournalSnapshot* value){return Ptr(value,&JournalSnapshot::destroy);}
void JournalSnapshot::destroy(const JournalSnapshot* value)noexcept{
 // JS GC does not recursively destroy a long base chain. Drain zero-owner
 // nodes iteratively; weak_ptr locking still obeys the shared_ptr control block.
 static thread_local JournalSnapshot* pending=nullptr;
 static thread_local bool draining=false;
 auto* next=const_cast<JournalSnapshot*>(value);next->cleanupNext_=pending;pending=next;
 if(draining)return;draining=true;
 while(pending){auto* current=pending;pending=current->cleanupNext_;delete current;}
 draining=false;
}
JournalSnapshot::Ptr JournalSnapshot::document(Document&& snapshot,DocumentWeigher weigher){
 if(!weigher)throw std::invalid_argument("Missing legacy document cost function");
 if(snapshot.active()||snapshot.historySize())throw std::invalid_argument("Journal checkpoint retains editor operations");
 snapshot.setRecordingSession({},{});
 auto result=own(new JournalSnapshot(Kind::Document));auto* value=const_cast<JournalSnapshot*>(result.get());
 value->document_=std::make_shared<const Document>(std::move(snapshot));value->weigher_=std::move(weigher);return result;
}
JournalSnapshot::Ptr JournalSnapshot::archive(Data data){
 if(!data)throw std::invalid_argument("Missing journal archive");
 auto result=own(new JournalSnapshot(Kind::Archive));auto* value=const_cast<JournalSnapshot*>(result.get());
 value->archive_=std::move(data);value->directWeight_=double(value->archive_->size());return result;
}
JournalSnapshot::Ptr JournalSnapshot::increment(Ptr base,const Delta& source){
 if(!base)throw std::invalid_argument("Missing journal base");
 const auto cost=deltaWeight(source);auto frozen=std::make_shared<Delta>();frozen->json=source.json;
 frozen->buffers.reserve(source.buffers.size());for(const auto& buffer:source.buffers){if(!buffer.bytes)throw std::invalid_argument("Missing journal patch buffer");auto copy=buffer;copy.bytes=std::make_shared<const Bytes>(*buffer.bytes);frozen->buffers.push_back(std::move(copy));}
 auto result=own(new JournalSnapshot(Kind::Increment));auto* value=const_cast<JournalSnapshot*>(result.get());
 value->base_=std::move(base);value->delta_=std::move(frozen);value->directWeight_=cost;return result;
}
JournalSnapshot::Ptr JournalSnapshot::rebase(const Ptr& source,Ptr base){
 auto result=own(new JournalSnapshot(Kind::Increment));auto* value=const_cast<JournalSnapshot*>(result.get());
 value->base_=std::move(base);value->delta_=source->delta_;value->directWeight_=source->directWeight_;return result;
}
const Document& JournalSnapshot::document()const{if(!document_)throw std::logic_error("Not a materialized journal document");return *document_;}
double JournalSnapshot::weight()const{
 std::call_once(weightOnce_,[this]{const auto cost=kind_==Kind::Document?weigher_(*document_):directWeight_;if(!std::isfinite(cost)||cost<0)throw std::invalid_argument("Invalid legacy snapshot cost");weight_=cost;});return weight_;
}
double retainedSnapshotBytes(const std::vector<JournalSnapshot::Ptr>& snapshots){
 std::unordered_set<const JournalSnapshot*> seen;double bytes=0;
 for(auto snapshot:snapshots)for(;;){
  if(!snapshot)throw std::invalid_argument("Missing retained journal snapshot");
  if(!seen.insert(snapshot.get()).second)break;bytes+=snapshot->weight();
  if(snapshot->kind()!=JournalSnapshot::Kind::Increment)break;snapshot=snapshot->base();
 }return bytes;
}
void SnapshotReplacements::set(const JournalSnapshot::Ptr& key,JournalSnapshot::Ptr value){
 if(const auto found=indices_.find(key.get());found!=indices_.end()){entries_[found->second].second=std::move(value);return;}
 entries_.emplace_back(key,std::move(value));
 try{indices_.emplace(key.get(),entries_.size()-1);}catch(...){entries_.pop_back();throw;}
}
SnapshotReplacements enforceSnapshotBudget(std::vector<JournalSnapshot::Ptr>& snapshots,const SnapshotMaterializer& materialize,double budget){
 if(std::isnan(budget))throw std::invalid_argument("Invalid history snapshot budget");
 SnapshotReplacements replacements;if(retainedSnapshotBytes(snapshots)<=budget)return replacements;
 if(snapshots.empty()||snapshots.front()->kind()!=JournalSnapshot::Kind::Increment)return replacements;
 if(!materialize)throw std::invalid_argument("Missing journal materializer");
 auto checkpoint=materialize(snapshots.front());if(!checkpoint||checkpoint->kind()!=JournalSnapshot::Kind::Document)throw std::invalid_argument("Journal materialization must return a document");
 replacements.set(snapshots.front(),std::move(checkpoint));
 std::vector<JournalSnapshot::Ptr> rebased;rebased.reserve(snapshots.size());
 for(const auto& snapshot:snapshots){auto next=snapshot;
  if(const auto found=replacements.find(snapshot);found!=replacements.end())next=found->second;
  else if(snapshot->kind()==JournalSnapshot::Kind::Increment){if(const auto base=replacements.find(snapshot->base());base!=replacements.end())next=JournalSnapshot::rebase(snapshot,base->second);}
  replacements.set(snapshot,next);rebased.push_back(std::move(next));
 }
 snapshots.swap(rebased);return replacements;
}
}
