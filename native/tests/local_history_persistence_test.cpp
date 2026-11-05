#include "local_history_persistence.h"
#include "local_history_recording.h"
#include "document.h"
#include "history_change.h"
#include "atomic_file.h"
#include <system_error>
#include <thread>
#include <atomic>
#include "local_history_store.h"
#include <windows.h>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <roapi.h>
#include <fstream>
#include <iostream>
#include <limits>
#define CHECK(v) do{if(!(v))throw std::runtime_error("History persistence check failed: " #v);}while(0)
using namespace moon;
using namespace winrt::Windows::Data::Json;
using Queue=LatestTaskQueue<int>;
std::future<void> ready(std::exception_ptr error={}){std::promise<void> promise;if(error)promise.set_exception(error);else promise.set_value();return promise.get_future();}
std::exception_ptr failure(const char* message){return std::make_exception_ptr(std::runtime_error(message));}
auto value(int i){return std::make_shared<const int>(i);}
std::string error(Queue::Acknowledgement ack){try{ack->get();return {};}catch(const std::exception& e){return e.what();}}
bool done(Queue::Acknowledgement ack){return ack->wait_for(std::chrono::seconds(0))==std::future_status::ready;}
void compare(const std::vector<int>& seen,JsonArray expected){CHECK(seen.size()==expected.Size());for(std::size_t i=0;i<seen.size();++i)CHECK(seen[i]==expected.GetAt(std::uint32_t(i)).GetNumber());}
void optionalValue(Queue::Value actual,IJsonValue expected){if(expected.ValueType()==JsonValueType::Null)CHECK(!actual);else CHECK(actual&&*actual==expected.GetNumber());}
template<class F>void reject(F f){bool failed=false;try{f();}catch(const std::exception&){failed=true;}CHECK(failed);}
local_history::Data read(const std::filesystem::path& path){std::ifstream file(path,std::ios::binary);CHECK(bool(file));return std::make_shared<const local_history::Bytes>(std::istreambuf_iterator<char>(file),std::istreambuf_iterator<char>());}
JsonObject parse(const local_history::Bytes& bytes){return JsonObject::Parse(winrt::to_hstring(std::string(bytes.begin(),bytes.end())));}
void queueChecks(JsonObject reference){
 {
  std::promise<void> first,last;std::vector<int> seen;int idles=0;
  Queue q([&](auto v){seen.push_back(*v);return *v==0?first.get_future():last.get_future();},[&]{++idles;});
  auto activeValue=value(0);std::weak_ptr<const int> activeWeak=activeValue;const auto a=q.enqueue(activeValue);activeValue.reset();
  auto pendingValue=value(1);std::weak_ptr<const int> pendingWeak=pendingValue;const auto b=q.enqueue(pendingValue);pendingValue.reset();
  for(int i=2;i<=100;++i)CHECK(q.enqueue(value(i))==b);CHECK(pendingWeak.expired()&&!activeWeak.expired());
  const auto states=reference.GetNamedObject(L"replacement").GetNamedArray(L"states");
  auto state=[&](int index){const auto expected=states.GetAt(index).GetObject();compare(seen,expected.GetNamedArray(L"seen"));optionalValue(q.runningValue(),expected.GetNamedValue(L"running"));optionalValue(q.pendingValue(),expected.GetNamedValue(L"pending"));CHECK(idles==expected.GetNamedNumber(L"idles")&&done(b)==expected.GetNamedBoolean(L"pendingReady"));};
  state(0);first.set_value();q.poll();CHECK(done(a)&&!done(b)&&activeWeak.expired());state(1);last.set_value();q.poll();state(2);CHECK(error(a).empty()&&error(b).empty());
 }
 {
  std::promise<void> first,last;std::vector<int> seen;int idles=0;
  Queue q([&](auto v){seen.push_back(*v);return *v==0?first.get_future():*v==2?last.get_future():ready();},[&]{++idles;});
  const auto a=q.enqueue(value(0)),b=q.enqueue(value(1)),c=q.enqueue(value(2));CHECK(b==c);first.set_value();q.poll();CHECK(done(a)&&!done(b));last.set_exception(failure("disk full"));q.poll();
  const auto expected=reference.GetNamedObject(L"latestFailure");CHECK(error(b)==winrt::to_string(expected.GetNamedString(L"message"))&&error(c)==error(b));const auto retry=q.enqueue(value(3));q.waitIdle();CHECK(error(retry).empty());compare(seen,expected.GetNamedArray(L"seen"));CHECK(idles==expected.GetNamedNumber(L"idles"));
 }
 {
  std::promise<void> first,last;std::vector<int> seen;int idles=0;
  Queue q([&](auto v){seen.push_back(*v);return *v==0?first.get_future():last.get_future();},[&]{++idles;});
  const auto a=q.enqueue(value(0)),b=q.enqueue(value(1));first.set_exception(failure("first failed"));q.poll();const auto expected=reference.GetNamedObject(L"firstFailure");CHECK(error(a)==winrt::to_string(expected.GetNamedString(L"message"))&&!done(b));last.set_value();q.waitIdle();CHECK(error(b).empty());compare(seen,expected.GetNamedArray(L"seen"));CHECK(idles==expected.GetNamedNumber(L"idles"));
 }
 {
  int idles=0;Queue q([](auto v){if(*v==0)throw std::runtime_error("sync full");return ready();},[&]{++idles;});
  const auto a=q.enqueue(value(0));const auto expected=reference.GetNamedObject(L"synchronousFailure"),immediate=expected.GetNamedObject(L"immediate");optionalValue(q.runningValue(),immediate.GetNamedValue(L"running"));CHECK(idles==immediate.GetNamedNumber(L"idles"));CHECK(error(a)==winrt::to_string(expected.GetNamedString(L"message")));const auto b=q.enqueue(value(3));q.waitIdle();CHECK(error(b).empty()&&idles==expected.GetNamedNumber(L"idles"));
 }
 {
  Queue q([](auto){return ready(failure("worker failed"));},[]{throw std::runtime_error("idle failed");});const auto a=q.enqueue(value(1));q.waitIdle();CHECK(error(a)==winrt::to_string(reference.GetNamedString(L"idleFailure"))&&!q.busy());
 }
}
void timerChecks(JsonArray observations){
 local_history::PersistTimer timer;std::vector<double> writes;
 for(const auto& value:observations){const auto row=value.GetObject();const double now=row.GetNamedNumber(L"now");const auto action=row.GetNamedString(L"action");
  if(action==L"schedule")timer.schedule(now,row.GetNamedBoolean(L"pressured"));else if(action==L"tick"){if(timer.takeDue(now))writes.push_back(now);}else{timer.cancel();writes.push_back(now);}
  const auto deadline=row.GetNamedValue(L"deadline");if(deadline.ValueType()==JsonValueType::Null)CHECK(!timer.deadline());else CHECK(timer.deadline()&&*timer.deadline()==deadline.GetNumber());
  const auto expected=row.GetNamedArray(L"writes");CHECK(writes.size()==expected.Size());for(std::size_t i=0;i<writes.size();++i)CHECK(writes[i]==expected.GetAt(std::uint32_t(i)).GetNumber());
 }
 reject([&]{timer.schedule(std::numeric_limits<double>::infinity());});reject([&]{timer.takeDue(std::numeric_limits<double>::quiet_NaN());});
}
local_history::PreparedGeneration generation(const local_history::ReadResult& input,const std::string& fingerprint,bool include,int position){
 local_history::PreparedGeneration result;result.documentFingerprint=fingerprint;result.includeDocumentFingerprint=include;auto manifest=JsonObject::Parse(winrt::to_hstring(input.manifestJson));manifest.SetNamedValue(L"position",JsonValue::CreateNumberValue(position));result.prepared.manifestJson=winrt::to_string(manifest.Stringify());
 CHECK(input.hasCachedDeltas);result.prepared.deltas=input.cachedDeltas;result.prepared.increments.emplace();
 for(const auto& snapshot:input.snapshots){result.prepared.increments->push_back(snapshot.increment());result.prepared.snapshots.push_back(snapshot.increment()?local_history::Data{}:snapshot.encoded());}return result;
}
void diskChecks(const std::filesystem::path& fixtureRoot,const std::filesystem::path& runRoot){
 const auto bytes=read(fixtureRoot/"incremental"/"legacy.zip");project::Archive archive(bytes);const auto manifest=parse(archive.read("manifest.json",8*1024*1024));const auto id=winrt::to_string(manifest.GetNamedString(L"projectKey"));const auto input=local_history::readArchive(bytes,id);CHECK(!input.labels.empty());
 const auto directory=runRoot/L"中文&history";local_history::PreparedWriter writer(directory,id);
 const auto first=writer.enqueue(generation(input,"first",true,0));const auto replaced=writer.enqueue(generation(input,"middle",false,0));std::weak_ptr<const local_history::PreparedGeneration> weak=writer.pendingValue();const auto latest=writer.enqueue(generation(input,"latest",false,1));CHECK(replaced==latest&&weak.expired());CHECK(writer.runningValue()->includeDocumentFingerprint&&writer.pendingValue()->includeDocumentFingerprint);
 auto invalid=generation(input,"invalid",false,0);auto wrong=JsonObject::Parse(winrt::to_hstring(invalid.prepared.manifestJson));wrong.SetNamedValue(L"projectKey",JsonValue::CreateStringValue(L"wrong-identity"));invalid.prepared.manifestJson=winrt::to_string(wrong.Stringify());reject([&]{writer.enqueue(std::move(invalid));});CHECK(writer.pendingValue()->documentFingerprint=="latest");
 reject([&]{writer.enqueue(generation(input,"",false,0));});CHECK(writer.pendingValue()->documentFingerprint=="latest");
 writer.waitIdle();CHECK(error(first).empty()&&error(latest).empty()&&error(replaced).empty()&&!writer.busy());
 auto saved=local_history::readArchive(std::make_shared<const local_history::Bytes>(local_history::readHistory(directory,id)),id);CHECK(saved.position==1&&saved.documentFingerprint==std::optional<std::string>("latest")&&saved.labels==input.labels);
 CHECK(saved.snapshots.size()==input.snapshots.size());for(std::size_t i=0;i<saved.snapshots.size();++i){const auto& expected=input.snapshots[i];const auto& actual=saved.snapshots[i];CHECK(bool(expected.increment())==bool(actual.increment()));if(!expected.increment())CHECK(*expected.encoded()==*actual.encoded());else{CHECK(expected.increment()->buffers.size()==actual.increment()->buffers.size());for(std::size_t j=0;j<expected.increment()->buffers.size();++j)CHECK(*expected.increment()->buffers[j].bytes==*actual.increment()->buffers[j].bytes);}}
 // A packing failure must still advance the newest queued generation.
 auto malformed=generation(input,"bad",true,0);malformed.prepared.snapshots.clear();const auto failed=writer.enqueue(std::move(malformed));const auto good=writer.enqueue(generation(input,"after-failure",false,0));writer.waitIdle();CHECK(!error(failed).empty()&&error(good).empty());
 const auto oldBytes=local_history::readHistory(directory,id);const auto target=directory/(id+".history");HANDLE locked=CreateFileW(target.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);CHECK(locked!=INVALID_HANDLE_VALUE);
 // Direct binary failure preserves the Windows code and both filesystem
 // paths; callers can distinguish permissions/sharing from archive failures.
 bool typedFailure=false;try{writeBinaryFileAtomic(target,{1,2,3});}catch(const std::system_error& e){
  CHECK(e.code().category()==std::system_category());CHECK(e.code().value()==ERROR_ACCESS_DENIED||e.code().value()==ERROR_SHARING_VIOLATION);
  const std::string message=e.what();CHECK(message.find("Cannot replace binary file")!=std::string::npos&&message.find(target.u8string())!=std::string::npos&&message.find(".tmp -> ")!=std::string::npos);typedFailure=true;
 }CHECK(typedFailure&&local_history::readHistory(directory,id)==oldBytes);
 const auto diskFailure=writer.enqueue(generation(input,"locked",true,1));writer.waitIdle();const auto message=error(diskFailure);CloseHandle(locked);CHECK(!message.empty()&&local_history::readHistory(directory,id)==oldBytes);
 for(const auto& file:std::filesystem::directory_iterator(directory))CHECK(file.path()==target);
 const auto retry=writer.enqueue(generation(input,"retried",false,1));writer.waitIdle();CHECK(error(retry).empty());saved=local_history::readArchive(std::make_shared<const local_history::Bytes>(local_history::readHistory(directory,id)),id);CHECK(saved.position==1&&!saved.documentFingerprint); // explicit fingerprint no longer sticky once idle
 reject([&]{local_history::PreparedWriter unsafe(runRoot/"must-not-exist","../bad");});CHECK(!std::filesystem::exists(runRoot/"must-not-exist"));
 // Destructor drains the owned running and latest pending writes on close.
 local_history::PreparedWriter::Acknowledgement closing;
 {local_history::PreparedWriter close(directory,id);close.enqueue(generation(input,"closing-first",false,1));closing=close.enqueue(generation(input,"closing-last",true,0));}
 CHECK(error(closing).empty());saved=local_history::readArchive(std::make_shared<const local_history::Bytes>(local_history::readHistory(directory,id)),id);CHECK(saved.position==0&&saved.documentFingerprint==std::optional<std::string>("closing-last"));
}

void journalWriterChecks(const std::filesystem::path& fixtureRoot,const std::filesystem::path& runRoot){
 using namespace local_history;using Ptr=JournalSnapshot::Ptr;
 const auto archive=read(fixtureRoot/"incremental"/"legacy.zip");project::Archive zip(archive);const auto manifest=parse(zip.read("manifest.json",8*1024*1024));const auto id=winrt::to_string(manifest.GetNamedString(L"projectKey"));const auto input=readArchive(archive,id);
 // Complete document-free immutable nodes let this check exercise worker IO
 // without substituting a production document cost/transition compiler.
 auto a=JournalSnapshot::archive(input.snapshots.front().encoded()),b=JournalSnapshot::archive(input.snapshots.front().encoded());
 const auto owner=std::this_thread::get_id();unsigned compiled=0,successes=0;const auto directory=runRoot/"journal-writer";
 JournalWriter writer(directory,id,{},[&](const Ptr&,const Ptr&)->std::optional<Bytes>{CHECK(std::this_thread::get_id()!=owner);++compiled;return {};});
 const auto generation=[&](const char* marker,bool include,std::size_t position){JournalGeneration result;result.manifestJson=input.manifestJson;result.documentFingerprint=marker;result.includeDocumentFingerprint=include;result.state={{a,b},{"worker transition"},position};return result;};
 const auto first=writer.enqueue(generation("first",true,0));const auto replaced=writer.enqueue(generation("discarded",false,0));std::weak_ptr<const JournalGeneration> weak=writer.pendingValue();const auto last=writer.enqueue(generation("last",false,1));CHECK(replaced==last&&weak.expired());
 writer.waitIdle([&](const JournalGeneration& value,const std::vector<Data>& checkpoints,TransitionDeltaCache& cache){CHECK(std::this_thread::get_id()==owner&&checkpoints.size()==2);CHECK(cache.get(a,b)&&!*cache.get(a,b));CHECK(value.state.snapshots[0]==a);++successes;});
 CHECK(error(first).empty()&&error(last).empty()&&successes==2&&compiled==1);auto saved=readArchive(std::make_shared<const Bytes>(readHistory(directory,id)),id);CHECK(saved.position==1&&saved.documentFingerprint==std::optional<std::string>("last")&&saved.labels==std::vector<std::string>{"worker transition"});
 const auto old=readHistory(directory,id);const auto target=directory/(id+".history");HANDLE locked=CreateFileW(target.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);CHECK(locked!=INVALID_HANDLE_VALUE);
 const auto failed=writer.enqueue(generation("locked",false,0));writer.waitIdle([&](const auto&,const auto&,auto&){++successes;});CloseHandle(locked);CHECK(!error(failed).empty()&&readHistory(directory,id)==old&&successes==2&&compiled==1);
 const auto retry=writer.enqueue(generation("retry",false,0));writer.waitIdle([&](const auto&,const auto&,auto&){++successes;});const auto retryError=error(retry);if(!retryError.empty())throw std::runtime_error("Journal retry: "+retryError);CHECK(successes==3&&compiled==1);
 saved=readArchive(std::make_shared<const Bytes>(readHistory(directory,id)),id);CHECK(saved.position==0&&!saved.documentFingerprint);
 // Owner dispatch isolates independent completed writes when a callback fails.
 const auto callbackFirst=writer.enqueue(generation("callback-first",false,0));
 const auto callbackLast=writer.enqueue(generation("callback-last",false,1));unsigned callbacks=0;
 reject([&]{writer.waitIdle([&](const auto&,const auto&,auto&){if(++callbacks==1)throw std::runtime_error("owner callback failure");});});
 {const auto firstError=error(callbackFirst),lastError=error(callbackLast);if(callbacks!=2||!firstError.empty()||!lastError.empty())throw std::runtime_error("callback dispatch count="+std::to_string(callbacks)+" first="+firstError+" last="+lastError);}
 writer.poll([&](const auto&,const auto&,auto&){throw std::runtime_error("repeated callback");});
 // A trimmed incremental root is checkpointed on the worker and rebased only
 // after disk success on the owner. This synthetic encoder tests dispatch,
 // not production materialization or document cost equivalence.
 Delta emptyDelta;emptyDelta.json=R"({"bytes":0,"patches":[],"origins":{"before":[]}})";
 auto root=JournalSnapshot::increment(a,emptyDelta),tail=JournalSnapshot::increment(root,emptyDelta);
 auto session=std::make_shared<JournalSession>(JournalSession::State{{root,tail},{"tail"},1},"shape");
 JournalWriter sessionWriter(runRoot/"journal-session",id,[&](const Ptr& node){CHECK(node==root&&std::this_thread::get_id()!=owner);return a->archive();},{});
 auto metadata=generation("session",false,0);const auto sessionAck=sessionWriter.enqueueSession(session,metadata);
 CHECK(sessionWriter.enqueueSession(session,metadata)==sessionAck&&!sessionWriter.pendingValue());
 unsigned sessionCallbacks=0;sessionWriter.waitIdle([&](const auto& captured,const auto&,auto& cache){
  CHECK(captured.state.snapshots[0]==root&&captured.state.position==1);
  const auto& live=session->state();CHECK(live.snapshots[0]->kind()==JournalSnapshot::Kind::Archive&&live.snapshots[1]->base()==live.snapshots[0]&&live.snapshots[1]->delta()==tail->delta());
  CHECK(cache.get(live.snapshots[0],live.snapshots[1]));++sessionCallbacks;
 });CHECK(error(sessionAck).empty()&&sessionCallbacks==1);
 CHECK(sessionWriter.enqueueSession(session,metadata)==sessionAck&&!sessionWriter.busy());
 // A second session writing the same identity invalidates first-session dedup.
 auto otherSession=std::make_shared<JournalSession>(session->state(),"shape");
 const auto otherAck=sessionWriter.enqueueSession(otherSession,metadata);CHECK(otherAck!=sessionAck);sessionWriter.waitIdle();CHECK(error(otherAck).empty());
 const auto firstAgain=sessionWriter.enqueueSession(session,metadata);CHECK(firstAgain!=sessionAck);sessionWriter.waitIdle();CHECK(error(firstAgain).empty());
 // A failed replacement must leave the live incremental chain intact.
 auto failedSession=std::make_shared<JournalSession>(JournalSession::State{{root,tail},{"tail"},1},"shape");
 const auto sessionPath=runRoot/"journal-session"/(id+".history");HANDLE sessionLock=CreateFileW(sessionPath.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);CHECK(sessionLock!=INVALID_HANDLE_VALUE);
 const auto sessionFailure=sessionWriter.enqueueSession(failedSession,metadata);
 sessionWriter.waitIdle([&](const auto&,const auto&,auto&){throw std::runtime_error("Failed disk write acknowledged");});CloseHandle(sessionLock);
 CHECK(!error(sessionFailure).empty()&&failedSession->state().snapshots==std::vector<Ptr>({root,tail}));
 const auto sessionRetry=sessionWriter.enqueueSession(failedSession,metadata);CHECK(sessionRetry!=sessionFailure);sessionWriter.waitIdle();CHECK(error(sessionRetry).empty()&&failedSession->state().snapshots.front()->kind()==JournalSnapshot::Kind::Archive);

 // Closed sessions are not retained and cannot be mutated by late completion.
 auto closingNode=JournalSnapshot::archive(a->archive());std::weak_ptr<const JournalSnapshot> closedNode=closingNode;
 auto closingSession=std::make_shared<JournalSession>(JournalSession::State{{closingNode,b},{"closed"},1},"shape");closingNode.reset();std::weak_ptr<JournalSession> closed=closingSession;
 const auto closedAck=writer.enqueueSession(closingSession,metadata);closingSession.reset();CHECK(closed.expired());writer.waitIdle();CHECK(error(closedAck).empty()&&closedNode.expired());
 reject([&]{writer.enqueueSession({},metadata);});
 auto bad=generation("bad",false,0);bad.manifestJson="{\"projectKey\":\"wrong\"}";reject([&]{writer.enqueue(std::move(bad));});CHECK(!writer.busy());
}
void productionWriterChecks(const std::filesystem::path& runRoot){
 using namespace local_history;
 auto node=JournalSnapshot::document(Document(2,2),[](const Document&){return 1.;});
 auto session=std::make_shared<JournalSession>(JournalSession::State{{node},{},0},"shape");
 JournalWriter writer(runRoot/"default-encoder","default-encoder",{},{});
 JournalGeneration metadata;metadata.manifestJson=R"({"version":4,"projectKey":"default-encoder"})";
 const auto ack=writer.enqueueSession(session,metadata);writer.waitIdle();CHECK(error(ack).empty());
 const auto result=readArchive(std::make_shared<const Bytes>(readHistory(runRoot/"default-encoder","default-encoder")),"default-encoder");project::Archive projectArchive(result.snapshots.front().encoded());CHECK(!projectArchive.entries().count("preview.png")&&projectArchive.entries().at("manifest.json").method==8);
}
void recordingCoordinatorChecks(const std::filesystem::path& runRoot){
 using namespace local_history;using Ptr=JournalSnapshot::Ptr;
 Delta delta;delta.json=R"({"bytes":0,"patches":[],"origins":{"before":[]}})";
 auto root=JournalSnapshot::archive(std::make_shared<const Bytes>(Bytes{7,8,9}));
 auto session=std::make_shared<JournalSession>(JournalSession::State{{root},{},0},"shape");
 const auto manifest=R"({"version":4,"projectKey":"recording"})";
 unsigned compiles=0;JournalWriter writer(runRoot/"recording","recording",{},[&](const Ptr&,const Ptr&)->std::optional<Bytes>{++compiles;return {};});
 unsigned failures=0;LocalHistoryRecording recording(session,writer,[&](std::exception_ptr){++failures;});
 JournalSession::Dependencies dependencies;dependencies.committed=[&]{return std::optional<Delta>(delta);};dependencies.checkpoint=[]()->Ptr{throw std::runtime_error("checkpoint failure");};
 CHECK(recording.record({JournalSession::Change::Kind::Push,std::string("paint")},"shape",dependencies,100));CHECK(recording.deadline()==850.);
 JournalGeneration metadata;metadata.manifestJson=manifest;
 CHECK(!recording.poll(849,metadata)&&!writer.busy());const auto pending=recording.poll(850,metadata);CHECK(pending&&writer.busy());
 CHECK(recording.record({JournalSession::Change::Kind::Undo},"shape",dependencies,900));CHECK(recording.deadline()==1650.);
 writer.waitIdle();recording.poll(1000,metadata);CHECK(error(*pending).empty());
 CHECK(recording.session()->state().position==0&&compiles==0);
 // Capture failures suspend only journal recording and cancel its timer; they
 // leave the separate Document::history stack outside this service untouched.
 CHECK(!recording.record({JournalSession::Change::Kind::Clear},"shape",dependencies,1100));
 CHECK(!recording.active()&&recording.deadline()==std::nullopt&&recording.captureFailure()&&failures==1);
 CHECK(!recording.poll(5000,metadata)&&!recording.flush(metadata));
 auto resumed=std::make_shared<JournalSession>(JournalSession::State{{root},{},0},"shape");recording.resume(resumed);
 const auto flushed=recording.flush(metadata);CHECK(flushed&&recording.deadline()==std::nullopt);writer.waitIdle();recording.poll(1001,metadata);CHECK(error(*flushed).empty());
 recording.disable();CHECK(!recording.active()&&!recording.captureFailure());
 LocalHistoryRecording disableOnEntry(resumed,writer);disableOnEntry.disable();CHECK(!disableOnEntry.record({JournalSession::Change::Kind::Undo},"shape",dependencies,10));
 CHECK(compiles==0);
 // A real document keeps its committed undo/redo even when its settled journal
 // capture fails, including a failing diagnostic sink.
 Document document(2,2);document.beginStroke({0,0},0xff123456);CHECK(document.commitStroke());
 const auto ordinaryPosition=document.historyPosition();
 LocalHistoryRecording failingCapture(resumed,writer,[](std::exception_ptr){throw std::runtime_error("diagnostic unavailable");});
 HistoryStackChange event{HistoryStackChange::Kind::Push,U"paint",0,0,document.historyRevision()};
 CHECK(!failingCapture.recordSettled(event,document,dependencies,1200)&&!failingCapture.active());
 CHECK(document.historyPosition()==ordinaryPosition);document.undo();CHECK(document.historyPosition()+1==ordinaryPosition);document.redo();CHECK(document.historyPosition()==ordinaryPosition);
 // IO/worker preparation errors are independent of capture suspension.
 auto second=JournalSnapshot::archive(std::make_shared<const Bytes>(Bytes{2}));
 auto ioSession=std::make_shared<JournalSession>(JournalSession::State{{root,second},{"structural"},1},"shape");
 JournalWriter ioWriter(runRoot/"recording-worker-error","recording",{},[](const Ptr&,const Ptr&)->std::optional<Bytes>{throw std::runtime_error("worker preparation failure");});
 LocalHistoryRecording ioRecording(ioSession,ioWriter);const auto failed=ioRecording.flush(metadata);CHECK(failed);ioWriter.waitIdle();CHECK(!error(*failed).empty()&&ioRecording.active()&&!ioRecording.captureFailure());
 CHECK(ioRecording.record({JournalSession::Change::Kind::Undo},"shape",dependencies,1300));CHECK(ioRecording.deadline()==2050.);
 // Once pressure is set, preserve an already scheduled deadline under drawing;
 // initial pressured capture schedules immediately (actual legacy timer rule).
 auto pressureSession=std::make_shared<JournalSession>(JournalSession::State{{root},{},0},"shape");LocalHistoryRecording pressure(pressureSession,writer);
 auto pressureDependencies=dependencies;pressureDependencies.budget=0;
 CHECK(pressure.record({JournalSession::Change::Kind::Push,std::string("pressure")},"shape",pressureDependencies,2000));CHECK(pressure.deadline()==2000.);
 CHECK(pressure.record({JournalSession::Change::Kind::Push,std::string("pressure2")},"shape",pressureDependencies,2100));CHECK(pressure.deadline()==2000.);
 pressure.disable();CHECK(!pressure.deadline());
}
void restoredWriteChecks(const std::filesystem::path& fixtureRoot,const std::filesystem::path& runRoot){
 using namespace local_history;using Ptr=JournalSnapshot::Ptr;
 auto archive=readArchive(read(fixtureRoot/"opaque"/"legacy.zip"),"project-opaque");
 std::vector<Ptr> nodes;for(const auto& snapshot:archive.snapshots){
  if(snapshot.increment())nodes.push_back(JournalSnapshot::increment(nodes.back(),*snapshot.increment()));
  else nodes.push_back(JournalSnapshot::archive(snapshot.encoded()));
 }
 auto session=std::make_shared<JournalSession>(JournalSession::State{nodes,archive.labels,archive.position},"restored-shape");
 const auto directory=runRoot/"restored-record";
 JournalWriter writer(directory,archive.projectKey,{},[](const Ptr&,const Ptr&)->std::optional<Bytes>{throw std::runtime_error("Restored cache must suppress compiler");});
 auto withoutCache=archive;withoutCache.hasCachedDeltas=false;CHECK(!writer.rememberRestored(session,withoutCache,nodes));
 CHECK(writer.rememberRestored(session,archive,nodes)&&!std::filesystem::exists(directory));
 JournalGeneration generation;generation.manifestJson=archive.manifestJson;generation.documentFingerprint=archive.documentFingerprint.value_or("current");generation.includeDocumentFingerprint=archive.documentFingerprint.has_value();
 const auto acknowledged=writer.enqueueSession(session,generation);CHECK(done(acknowledged)&&error(acknowledged).empty()&&!writer.busy()&&!std::filesystem::exists(directory));
 CHECK(writer.enqueueSession(session,generation)==acknowledged);
 // Legacy seeds the full archive timeline, not the retained limit suffix.
 auto trimmed=std::make_shared<JournalSession>(JournalSession::State{{nodes.back()},{},0},"trimmed-shape");CHECK(writer.rememberRestored(trimmed,archive,nodes));
 CHECK(writer.enqueueSession(session,generation)!=acknowledged);CHECK(!writer.rememberRestored(trimmed,archive,nodes));writer.waitIdle();
 // After a different session wrote the same identity the restored session's
 // old acknowledged record must not bypass IO; completed writes remain valid.
 auto bad=archive;bad.projectKey="other";reject([&]{writer.rememberRestored(session,bad,nodes);});
 auto missing=nodes;missing.pop_back();reject([&]{writer.rememberRestored(session,archive,missing);});
 reject([&]{writer.rememberRestored({},archive,nodes);});
 CHECK(writer.rememberRestored(trimmed,archive,nodes));const auto trimmedAck=writer.enqueueSession(trimmed,generation);CHECK(!done(trimmedAck));writer.waitIdle();CHECK(error(trimmedAck).empty());
}
void dedupReferenceChecks(JsonArray operations,const std::filesystem::path& runRoot){
 using namespace local_history;using Ptr=JournalSnapshot::Ptr;
 // Byte contents are irrelevant to identity dedup, but remain valid immutable
 // archive slots for the prepared writer. No production compiler substitution.
 std::vector<Ptr> nodes;for(unsigned i=0;i<3;++i)nodes.push_back(JournalSnapshot::archive(std::make_shared<const Bytes>(Bytes{1})));
 std::vector<std::shared_ptr<JournalSession>> sessions;for(unsigned i=0;i<2;++i)sessions.push_back(std::make_shared<JournalSession>(JournalSession::State{{nodes[0]}, {},0},"shape"));
 JournalWriter writer(runRoot/"dedup-reference","project-dedup",{},[](const Ptr&,const Ptr&)->std::optional<Bytes>{return {};});
 std::vector<JournalWriter::Acknowledgement> acknowledgements;unsigned writes=0;
 for(const auto& value:operations){const auto row=value.GetObject();
  if(row.GetNamedString(L"kind")==L"drain"){
   writer.waitIdle([&](const auto&,const auto&,auto&){++writes;});
   for(const auto& ack:acknowledgements)CHECK(error(ack).empty());CHECK(writes==row.GetNamedNumber(L"writes"));continue;
  }
  const auto session=sessions.at(unsigned(row.GetNamedNumber(L"session")));JournalSession::State state;state.position=std::size_t(row.GetNamedNumber(L"position"));
  for(const auto& node:row.GetNamedArray(L"nodes"))state.snapshots.push_back(nodes.at(unsigned(node.GetNumber())));
  for(const auto& label:row.GetNamedArray(L"labels"))state.labels.push_back(winrt::to_string(label.GetString()));
  *session=JournalSession(std::move(state),"shape");JournalGeneration generation;generation.manifestJson=R"({"version":4,"projectKey":"project-dedup"})";generation.documentFingerprint=winrt::to_string(row.GetNamedString(L"marker"));generation.includeDocumentFingerprint=row.GetNamedBoolean(L"include");
  const auto ack=writer.enqueueSession(session,std::move(generation));auto found=std::find(acknowledgements.begin(),acknowledgements.end(),ack);
  if(found==acknowledgements.end()){acknowledgements.push_back(ack);found=std::prev(acknowledgements.end());}
  CHECK(std::size_t(found-acknowledgements.begin()+1)==row.GetNamedNumber(L"ack"));CHECK(bool(writer.pendingValue())==row.GetNamedBoolean(L"pending"));
 }
}
void registryReferenceChecks(JsonArray operations,const std::filesystem::path& runRoot){
 using namespace local_history;using Ptr=JournalSnapshot::Ptr;
 const auto bytes=std::make_shared<const Bytes>(Bytes{1});
 PreparedRequest prepared;prepared.manifestJson=R"({"version":4,"projectKey":"registry-source","labels":[],"position":0})";prepared.snapshots={bytes};
 const auto restored=readArchive(packPrepared(prepared),"registry-source");CHECK(restored.hasCachedDeltas);
 JournalWriterRegistry registry(runRoot/"registry-reference",{},{});
 std::map<unsigned,std::shared_ptr<JournalSession>> sessions;
 std::vector<JournalWriter::Acknowledgement> acknowledgements;unsigned writes=0;
 for(const auto& value:operations){const auto row=value.GetObject();
  if(row.GetNamedString(L"kind")==L"drain"){
   registry.waitIdle([&](const auto&,const auto&,auto&){++writes;});
   for(const auto& ack:acknowledgements)CHECK(error(ack).empty());CHECK(writes==row.GetNamedNumber(L"writes"));
  }else{
   const auto slot=unsigned(row.GetNamedNumber(L"session"));const auto id=winrt::to_string(row.GetNamedString(L"id"));
   auto& session=sessions[slot];if(!session)session=std::make_shared<JournalSession>(JournalSession::State{{JournalSnapshot::archive(bytes)},{},0},"shape");
   const auto manifest=std::string(R"({"version":4,"projectKey":")")+id+R"(","labels":[],"position":0})";
   if(row.GetNamedString(L"kind")==L"seed"){
    auto archive=restored;archive.projectKey=id;archive.manifestJson=manifest;
    const bool wasBusy=registry.busy(id);CHECK(registry.rememberRestored(session,archive,session->state().snapshots)==!wasBusy);
   }else{
    JournalGeneration generation;generation.manifestJson=manifest;generation.documentFingerprint=winrt::to_string(row.GetNamedString(L"marker",L"current"));generation.includeDocumentFingerprint=row.GetNamedBoolean(L"include",false);
    const auto ack=registry.enqueueSession(id,session,generation);auto found=std::find(acknowledgements.begin(),acknowledgements.end(),ack);
    if(found==acknowledgements.end()){acknowledgements.push_back(ack);found=std::prev(acknowledgements.end());}
    CHECK(std::size_t(found-acknowledgements.begin()+1)==row.GetNamedNumber(L"ack"));
   }
  }
  CHECK(registry.activeQueues()==row.GetNamedNumber(L"queues"));CHECK(registry.latestRecords()==row.GetNamedNumber(L"latest"));
 }
 CHECK(registry.activeQueues()==0&&registry.latestRecords()==256);
 // Evicted keys did not cancel either identity's queued writes, and the final
 // idle generation no longer inherits an earlier explicit-save fingerprint.
 const auto saved=readArchive(std::make_shared<const Bytes>(readHistory(runRoot/"registry-reference","project-registry-0")),"project-registry-0");CHECK(!saved.documentFingerprint);
 // Registry metadata cannot keep a closed session, its snapshot or a replaced
 // generation alive. This record is seeded with no write/queue to hold it.
 auto closed=std::make_shared<JournalSession>(JournalSession::State{{JournalSnapshot::archive(bytes)},{},0},"shape");
 std::weak_ptr<JournalSession> weakSession=closed;std::weak_ptr<const JournalSnapshot> weakSnapshot=closed->state().snapshots[0];
 auto archive=restored;archive.projectKey="registry-closed";CHECK(registry.rememberRestored(closed,archive,closed->state().snapshots));closed.reset();CHECK(weakSession.expired()&&weakSnapshot.expired());registry.poll();CHECK(registry.activeQueues()==0);
 reject([&]{registry.enqueueSession("../bad",sessions.begin()->second,{});});CHECK(registry.activeQueues()==0);
 reject([&]{registry.enqueueSession("registry-empty",{},{});});CHECK(registry.activeQueues()==0);
}
void registryCacheChecks(const std::filesystem::path& runRoot){
 using namespace local_history;using Ptr=JournalSnapshot::Ptr;
 auto first=JournalSnapshot::archive(std::make_shared<const Bytes>(Bytes{1})),second=JournalSnapshot::archive(std::make_shared<const Bytes>(Bytes{2}));
 auto session=std::make_shared<JournalSession>(JournalSession::State{{first,second},{"transition"},1},"shape");
 std::atomic<unsigned> compiles=0;
 JournalWriterRegistry registry(runRoot/"registry-cache",{},[&](const Ptr&,const Ptr&)->std::optional<Bytes>{++compiles;return {};});
 JournalGeneration metadata;metadata.manifestJson=R"({"version":4,"projectKey":"registry-cache"})";
 const auto a=registry.enqueueSession("registry-cache",session,metadata);registry.waitIdle();CHECK(error(a).empty()&&registry.activeQueues()==0&&compiles==1);
 CHECK(registry.enqueueSession("registry-cache",session,metadata)==a&&registry.activeQueues()==0);
 // Position change creates a new queue but reuses the transition answer from
 // the preceding idle queue instead of compiling another structural diff.
 *session=JournalSession(JournalSession::State{{first,second},{"transition"},0},"shape");
 const auto b=registry.enqueueSession("registry-cache",session,metadata);CHECK(b!=a);registry.waitIdle();CHECK(error(b).empty()&&compiles==1&&registry.activeQueues()==0);
 // A failed identity cannot prevent owner success dispatch for other queues.
 JournalWriterRegistry failing(runRoot/"registry-errors",{},[](const Ptr&,const Ptr&)->std::optional<Bytes>{throw std::runtime_error("compile failed");});
 metadata.manifestJson=R"({"version":4,"projectKey":"registry-failure"})";
 const auto failed=failing.enqueueSession("registry-failure",session,metadata);
 auto good=std::make_shared<JournalSession>(JournalSession::State{{first},{},0},"shape");metadata.manifestJson=R"({"version":4,"projectKey":"registry-good"})";
 const auto success=failing.enqueueSession("registry-good",good,metadata);unsigned callbacks=0;
 reject([&]{failing.waitIdle([&](const auto&,const auto&,auto&){++callbacks;throw std::runtime_error("owner callback failed");});});
 CHECK(!error(failed).empty()&&error(success).empty()&&callbacks==1&&failing.activeQueues()==0&&failing.latestRecords()==1);
 // Retrying failure after its idle queue is removed obtains a fresh ack.
 metadata.manifestJson=R"({"version":4,"projectKey":"registry-failure"})";
 const auto retry=failing.enqueueSession("registry-failure",session,metadata);CHECK(retry!=failed);failing.waitIdle();CHECK(!error(retry).empty()&&failing.activeQueues()==0);
 // Existing recording coordinator can share the application registry, without
 // holding a reference to a queue that is released when it becomes idle.
 LocalHistoryRecording recording(good,registry,"registry-recording");metadata.manifestJson=R"({"version":4,"projectKey":"registry-recording"})";
 const auto recorded=recording.flush(metadata);CHECK(recorded);registry.waitIdle();CHECK(error(*recorded).empty()&&recording.active()&&registry.activeQueues()==0);
 CHECK(recording.flush(metadata)==recorded&&registry.activeQueues()==0);
 auto other=std::make_shared<JournalSession>(JournalSession::State{{second},{},0},"shape");LocalHistoryRecording another(other,registry,"registry-recording");
 const auto changed=another.flush(metadata);CHECK(changed&&changed!=recorded);registry.waitIdle();CHECK(error(*changed).empty());
 const auto renewed=recording.flush(metadata);CHECK(renewed&&renewed!=recorded);registry.waitIdle();CHECK(error(*renewed).empty());
 recording.disable();CHECK(!recording.flush(metadata));
}
int wmain(int argc,wchar_t** argv){const auto initialized=RoInitialize(RO_INIT_MULTITHREADED);try{{
 CHECK(argc==4);const auto reference=parse(*read(argv[1]));queueChecks(reference);timerChecks(reference.GetNamedArray(L"timer"));
 const auto runName=std::string("run-")+std::to_string(std::chrono::steady_clock::now().time_since_epoch().count());const auto runRoot=std::filesystem::path(argv[3])/runName;diskChecks(argv[2],runRoot);journalWriterChecks(argv[2],runRoot);dedupReferenceChecks(reference.GetNamedArray(L"dedup"),runRoot);restoredWriteChecks(argv[2],runRoot);recordingCoordinatorChecks(runRoot);productionWriterChecks(runRoot);
 registryReferenceChecks(reference.GetNamedArray(L"registry"),runRoot);registryCacheChecks(runRoot);
 {std::ofstream latest(std::filesystem::path(argv[3])/"latest.txt",std::ios::binary);latest<<runName;CHECK(bool(latest));}
 std::cout<<"Actual legacy queue/timer references and asynchronous prepared history replacement/failure/close writes passed\n";
 }winrt::clear_factory_cache();if(SUCCEEDED(initialized))RoUninitialize();return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';winrt::clear_factory_cache();if(SUCCEEDED(initialized))RoUninitialize();return 1;}}
