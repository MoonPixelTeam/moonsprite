#include "local_history_persistence.h"
#include "local_history_store.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <roapi.h>
#include <cmath>
#include <algorithm>
namespace moon::local_history {
struct JournalWriteRecord {
 std::vector<std::weak_ptr<const JournalSnapshot>> snapshots;
 std::vector<std::string> labels;std::size_t position=0;
 std::optional<std::string> fingerprint;
 JournalWriter::Acknowledgement completion;
 bool matches(const JournalGeneration& generation)const{
  if(position!=generation.state.position||labels!=generation.state.labels||snapshots.size()!=generation.state.snapshots.size()||fingerprint!=(generation.includeDocumentFingerprint?std::optional<std::string>(generation.documentFingerprint):std::nullopt))return false;
  for(std::size_t i=0;i<snapshots.size();++i)if(snapshots[i].lock()!=generation.state.snapshots[i])return false;
  return true;
 }
 void capture(const std::vector<JournalSnapshot::Ptr>& nodes){
  std::vector<std::weak_ptr<const JournalSnapshot>> next;next.reserve(nodes.size());for(const auto& node:nodes)next.push_back(node);snapshots.swap(next);
 }
 bool failed()const{
  if(!completion||completion->wait_for(std::chrono::seconds(0))!=std::future_status::ready)return false;
  try{completion->get();return false;}catch(...){return true;}
 }
};
struct JournalWriteContext {
 SnapshotEncodingCache encodings;TransitionDeltaCache transitions;
 std::map<std::weak_ptr<JournalSession>,std::shared_ptr<JournalWriteRecord>,std::owner_less<std::weak_ptr<JournalSession>>> sessionWrites;
 using Latest=std::list<std::pair<std::string,std::weak_ptr<JournalWriteRecord>>>;
 Latest latest;
 std::map<std::string,Latest::iterator> latestById;
 void forget(const std::string& id,const std::shared_ptr<JournalWriteRecord>& record={}){
  const auto found=latestById.find(id);if(found==latestById.end()||(record&&found->second->second.lock()!=record))return;
  latest.erase(found->second);latestById.erase(found);
 }
 std::shared_ptr<JournalWriteRecord> current(const std::string& id)const{
  const auto found=latestById.find(id);return found==latestById.end()?nullptr:found->second->second.lock();
 }
 void remember(const std::string& id,const std::shared_ptr<JournalWriteRecord>& record){
  forget(id);latest.emplace_back(id,record);
  try{latestById.emplace(id,std::prev(latest.end()));}catch(...){latest.pop_back();throw;}
  while(latest.size()>256){latestById.erase(latest.front().first);latest.pop_front();}
 }
 void prune(){
  for(auto it=sessionWrites.begin();it!=sessionWrites.end();)if(it->first.expired())it=sessionWrites.erase(it);else ++it;
  // Unlike JS catch continuations, native queue failures become ready only
  // when the owner pumps. Remove only the failed record, preserving a newer
  // pending generation for the same identity/session.
  for(auto it=latest.begin();it!=latest.end();){
   const auto record=it->second.lock();if(record&&record->failed()){latestById.erase(it->first);it=latest.erase(it);}else ++it;
  }
  for(auto it=sessionWrites.begin();it!=sessionWrites.end();)if(it->second->failed())it=sessionWrites.erase(it);else ++it;
 }
};
namespace {
struct Apartment {
 HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);
 Apartment(){if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize history generation JSON");}
 ~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}
};
}
JournalWriter::JournalWriter(std::filesystem::path directory,std::string id,GenerationPreparation::Encoder encoder,GenerationPreparation::Compiler compiler,project::Limits limits)
 :JournalWriter(std::move(directory),std::move(id),std::move(encoder),std::move(compiler),limits,std::make_shared<JournalWriteContext>()){}
JournalWriter::JournalWriter(std::filesystem::path directory,std::string id,GenerationPreparation::Encoder encoder,GenerationPreparation::Compiler compiler,project::Limits limits,std::shared_ptr<JournalWriteContext> context)
 :directory_(std::move(directory)),id_(std::move(id)),limits_(limits),encoder_(encoder?std::move(encoder):GenerationPreparation::Encoder([limits](const auto& node){return encodeJournalSnapshot(node,limits);})),compiler_(std::move(compiler)),context_(std::move(context)),queue_([this](auto generation){
  return std::async(std::launch::async,[this,generation=std::move(generation)]{
   auto result=prepareGeneration(generation->manifestJson,generation->state,
    [this](const auto& node){return context_->encodings.encode(node,encoder_);},compiler_,
    [this](const auto& before,const auto& after){return context_->transitions.get(before,after);},limits_);
   auto packed=packPreparedResult(result.prepared,limits_);
   // Cache packed answers before IO, matching writeHistoryGeneration. A write
   // failure must not require compiling the same immutable transition again.
   for(std::size_t i=0;i<packed.deltas.size();++i)
    context_->transitions.set(generation->state.snapshots[i],generation->state.snapshots[i+1],std::move(packed.deltas[i]));
   // Allocate the success record before disk IO. No allocation may turn a
   // successful replacement into a falsely reported failed generation.
   std::list<Completed> completed;completed.push_back({generation,std::move(result.encodedCheckpoints)});
   writeHistory(directory_,id_,*packed.archive,limits_.archiveBytes);
   std::lock_guard<std::mutex> guard(completedMutex_);completed_.splice(completed_.end(),completed);
  });
 },[]{}){if(!safeHistoryId(id_))throw std::invalid_argument("Invalid journal writer identity");}
JournalWriter::~JournalWriter(){queue_.waitIdle();}
JournalWriter::Acknowledgement JournalWriter::enqueue(JournalGeneration generation){
 const auto pending=queue_.pendingValue(),running=queue_.runningValue();
 generation.includeDocumentFingerprint=generation.includeDocumentFingerprint||(pending&&pending->includeDocumentFingerprint)||(running&&running->includeDocumentFingerprint);
 if(generation.includeDocumentFingerprint&&generation.documentFingerprint.empty())throw std::invalid_argument("Missing current journal fingerprint");
 if(generation.state.snapshots.size()!=generation.state.labels.size()+1||generation.state.position>generation.state.labels.size())throw std::invalid_argument("Invalid journal writer state");
 {Apartment apartment;using namespace winrt::Windows::Data::Json;
  if(generation.manifestJson.size()>limits_.manifestBytes)throw project::Error(project::ErrorKind::Limit,"Journal metadata exceeds budget");
  auto manifest=JsonObject::Parse(winrt::to_hstring(generation.manifestJson));
  if(winrt::to_string(manifest.GetNamedString(L"projectKey"))!=id_)throw std::invalid_argument("Journal generation identity mismatch");
  JsonArray labels;for(const auto& label:generation.state.labels)labels.Append(JsonValue::CreateStringValue(winrt::to_hstring(label)));manifest.Insert(L"labels",labels);manifest.Insert(L"position",JsonValue::CreateNumberValue(double(generation.state.position)));
  if(generation.includeDocumentFingerprint)manifest.Insert(L"documentFingerprint",JsonValue::CreateStringValue(winrt::to_hstring(generation.documentFingerprint)));else manifest.Remove(L"documentFingerprint");
  generation.manifestJson=winrt::to_string(manifest.Stringify());if(generation.manifestJson.size()>limits_.manifestBytes)throw project::Error(project::ErrorKind::Limit,"Journal metadata exceeds budget");
 }
 // One writer owns one stable history identity. Session keys and snapshot
 // comparisons are weak so dedup metadata cannot retain closed projects.
 context_->prune();auto& sessionWrites=context_->sessionWrites;
 const auto session=generation.session.lock();
 std::shared_ptr<JournalWriteRecord> record;
 if(session){
  const auto known=sessionWrites.find(session);
  if(known!=sessionWrites.end()&&context_->current(id_)==known->second&&known->second->matches(generation))return known->second->completion;
  record=std::make_shared<JournalWriteRecord>();record->capture(generation.state.snapshots);record->labels=generation.state.labels;record->position=generation.state.position;
  if(generation.includeDocumentFingerprint)record->fingerprint=generation.documentFingerprint;
  generation.writeRecord=record;
 }
 auto value=std::make_shared<const JournalGeneration>(std::move(generation));
 const auto acknowledgement=queue_.enqueue(value);
 if(pending&&pending->writeRecord){
  if(const auto replacedSession=pending->session.lock()){const auto found=sessionWrites.find(replacedSession);if(found!=sessionWrites.end()&&found->second==pending->writeRecord)sessionWrites.erase(found);}
 }
 context_->forget(id_);
 if(record){record->completion=acknowledgement;sessionWrites.insert_or_assign(session,record);context_->remember(id_,record);}
 return acknowledgement;
}
JournalWriter::Acknowledgement JournalWriter::enqueueSession(const std::shared_ptr<JournalSession>& session,JournalGeneration metadata){
 if(!session)throw std::invalid_argument("Missing journal session");
 metadata.state=session->state();metadata.session=session;return enqueue(std::move(metadata));
}
bool JournalWriter::rememberRestored(const std::shared_ptr<JournalSession>& session,const ReadResult& archive,const std::vector<JournalSnapshot::Ptr>& snapshots){
 if(!session)throw std::invalid_argument("Missing restored journal session");
 if(archive.projectKey!=id_)throw std::invalid_argument("Restored journal identity mismatch");
 if(!archive.hasCachedDeltas||queue_.busy())return false;
 if(snapshots.size()!=archive.snapshots.size()||snapshots.size()!=archive.labels.size()+1||archive.cachedDeltas.size()!=archive.labels.size()||archive.position>archive.labels.size()||std::any_of(snapshots.begin(),snapshots.end(),[](const auto& node){return !node;}))throw std::invalid_argument("Invalid restored journal record");
 auto record=std::make_shared<JournalWriteRecord>();record->capture(snapshots);record->labels=archive.labels;record->position=archive.position;record->fingerprint=archive.documentFingerprint;
 auto promise=std::make_shared<std::promise<void>>();record->completion=std::make_shared<const std::shared_future<void>>(promise->get_future().share());promise->set_value();
 // The caller has already validated and installed the archive. Populate the
 // same pair answers used by later structural transitions; no disk write.
 for(std::size_t i=0;i<archive.cachedDeltas.size();++i)context_->transitions.set(snapshots[i],snapshots[i+1],archive.cachedDeltas[i]);
 context_->prune();context_->sessionWrites.insert_or_assign(session,record);context_->remember(id_,record);return true;
}
void JournalWriter::poll(const Success& success){
 queue_.poll();std::list<Completed> completed;{std::lock_guard<std::mutex> guard(completedMutex_);completed.swap(completed_);}
 std::exception_ptr firstError;
 for(const auto& item:completed){
  try{
   if(const auto session=item.generation->session.lock()){
    auto recorded=item.generation->state.snapshots;
    session->acknowledge(recorded,item.checkpoints,context_->transitions);
    if(item.generation->writeRecord)item.generation->writeRecord->capture(recorded);
   }
   if(success)success(*item.generation,item.checkpoints,context_->transitions);
  }catch(...){if(!firstError)firstError=std::current_exception();}
 }
 context_->prune();if(firstError)std::rethrow_exception(firstError);
}
void JournalWriter::waitIdle(const Success& success){queue_.waitIdle();poll(success);}
JournalWriterRegistry::JournalWriterRegistry(std::filesystem::path directory,GenerationPreparation::Encoder encoder,GenerationPreparation::Compiler compiler,project::Limits limits)
 :directory_(std::move(directory)),limits_(limits),encoder_(std::move(encoder)),compiler_(std::move(compiler)),context_(std::make_shared<JournalWriteContext>()){}
JournalWriterRegistry::~JournalWriterRegistry(){try{waitIdle();}catch(...){/* Owner errors never escape close/destruction. */}}
JournalWriter& JournalWriterRegistry::writer(const std::string& id){
 const auto found=writers_.find(id);if(found!=writers_.end())return *found->second;
 auto value=std::unique_ptr<JournalWriter>(new JournalWriter(directory_,id,encoder_,compiler_,limits_,context_));
 return *writers_.emplace(id,std::move(value)).first->second;
}
JournalWriter::Acknowledgement JournalWriterRegistry::enqueueSession(const std::string& id,const std::shared_ptr<JournalSession>& session,JournalGeneration metadata){
 auto& target=writer(id);
 try{auto result=target.enqueueSession(session,std::move(metadata));if(!target.busy())writers_.erase(id);return result;}
 catch(...){if(!target.busy())writers_.erase(id);throw;}
}
bool JournalWriterRegistry::rememberRestored(const std::shared_ptr<JournalSession>& session,const ReadResult& archive,const std::vector<JournalSnapshot::Ptr>& snapshots){
 auto& target=writer(archive.projectKey);
 try{const auto result=target.rememberRestored(session,archive,snapshots);if(!target.busy())writers_.erase(archive.projectKey);return result;}
 catch(...){if(!target.busy())writers_.erase(archive.projectKey);throw;}
}
bool JournalWriterRegistry::busy(const std::string& id)const{const auto found=writers_.find(id);return found!=writers_.end()&&found->second->busy();}
std::size_t JournalWriterRegistry::latestRecords()const{return context_->latest.size();}
void JournalWriterRegistry::poll(const JournalWriter::Success& success){
 std::exception_ptr firstError;
 for(auto it=writers_.begin();it!=writers_.end();){
  try{it->second->poll(success);}catch(...){if(!firstError)firstError=std::current_exception();}
  if(!it->second->busy())it=writers_.erase(it);else ++it;
 }
 context_->prune();if(firstError)std::rethrow_exception(firstError);
}
void JournalWriterRegistry::waitIdle(const JournalWriter::Success& success){
 std::exception_ptr firstError;
 for(auto it=writers_.begin();it!=writers_.end();){
  try{it->second->waitIdle(success);}catch(...){if(!firstError)firstError=std::current_exception();}
  if(!it->second->busy())it=writers_.erase(it);else ++it;
 }
 context_->prune();if(firstError)std::rethrow_exception(firstError);
}
void PersistTimer::schedule(double now,bool pressured){
 if(!std::isfinite(now))throw std::invalid_argument("Invalid local history timer clock");
 if(pressured&&deadline_)return;
 deadline_=now+(pressured?0.:750.);
}
bool PersistTimer::takeDue(double now){
 if(!std::isfinite(now))throw std::invalid_argument("Invalid local history timer clock");
 if(!deadline_||now<*deadline_)return false;deadline_.reset();return true;
}
PreparedWriter::PreparedWriter(std::filesystem::path directory,std::string id,project::Limits limits)
 :directory_(std::move(directory)),id_(std::move(id)),limits_(limits),queue_([this](auto generation){
  return std::async(std::launch::async,[directory=directory_,id=id_,limits=limits_,generation=std::move(generation)]{
   const auto archive=packPrepared(generation->prepared,limits);
   writeHistory(directory,id,*archive,limits.archiveBytes);
  });
 },[]{}){if(!safeHistoryId(id_))throw std::invalid_argument("无效的本地历史 ID");}
PreparedWriter::~PreparedWriter(){queue_.waitIdle();}
PreparedWriter::Acknowledgement PreparedWriter::enqueue(PreparedGeneration generation){
 // Legacy ||= carries an explicit save fingerprint through the running and
 // replaced generations, but records the NEW generation's current fingerprint.
 const auto pending=queue_.pendingValue(),running=queue_.runningValue();
 generation.includeDocumentFingerprint=generation.includeDocumentFingerprint||
  (pending&&pending->includeDocumentFingerprint)||(running&&running->includeDocumentFingerprint);
 if(generation.includeDocumentFingerprint&&generation.documentFingerprint.empty())throw std::invalid_argument("Missing current history fingerprint");
 {Apartment apartment;using namespace winrt::Windows::Data::Json;
  if(generation.prepared.manifestJson.size()>limits_.manifestBytes)throw project::Error(project::ErrorKind::Limit,"History generation metadata exceeds budget");
  auto manifest=JsonObject::Parse(winrt::to_hstring(generation.prepared.manifestJson));
  if(winrt::to_string(manifest.GetNamedString(L"projectKey"))!=id_)throw std::invalid_argument("History generation identity mismatch");
  if(generation.includeDocumentFingerprint)manifest.SetNamedValue(L"documentFingerprint",JsonValue::CreateStringValue(winrt::to_hstring(generation.documentFingerprint)));
  else if(manifest.HasKey(L"documentFingerprint"))manifest.Remove(L"documentFingerprint");
  generation.prepared.manifestJson=winrt::to_string(manifest.Stringify());
  if(generation.prepared.manifestJson.size()>limits_.manifestBytes)throw project::Error(project::ErrorKind::Limit,"History generation metadata exceeds budget");
 }
 return queue_.enqueue(std::make_shared<const PreparedGeneration>(std::move(generation)));
}
}
