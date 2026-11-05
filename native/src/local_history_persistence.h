#pragma once
#include "latest_task_queue.h"
#include "local_history_archive.h"
#include "local_history_generation.h"
#include <filesystem>
#include <list>
#include <map>
namespace moon::local_history {
// Ports scheduleLocalHistoryPersist timing only. The session captures its
// current immutable generation when takeDue() fires, not when scheduled.
class PersistTimer {
 std::optional<double> deadline_;
public:
 void schedule(double nowMilliseconds,bool pressured=false);
 bool takeDue(double nowMilliseconds);
 void cancel(){deadline_.reset();}
 std::optional<double> deadline()const{return deadline_;}
};
struct PreparedGeneration {
 PreparedRequest prepared;
 // Supply the current marker even for ordinary writes: a queued explicit-save
 // generation can make this flag sticky until the queue becomes idle.
 std::string documentFingerprint;
 bool includeDocumentFingerprint=false;
};
// A retained immutable journal generation, captured on the owner thread.
// The worker runs checkpoint encoding, transition compilation, packing and IO.
struct JournalWriteRecord;
struct JournalWriteContext;
struct JournalGeneration {
 std::string manifestJson,documentFingerprint;
 bool includeDocumentFingerprint=false;
 JournalSession::State state;
 // Optional owner-thread acknowledgement target; never retains a closed session.
 std::weak_ptr<JournalSession> session;
 std::shared_ptr<JournalWriteRecord> writeRecord;
};
class JournalWriter {
 struct Completed {std::shared_ptr<const JournalGeneration> generation;std::vector<Data> checkpoints;};
 std::filesystem::path directory_;std::string id_;project::Limits limits_;
 GenerationPreparation::Encoder encoder_;GenerationPreparation::Compiler compiler_;
 std::shared_ptr<JournalWriteContext> context_;
 std::mutex completedMutex_;std::list<Completed> completed_;
 LatestTaskQueue<JournalGeneration> queue_;
 friend class JournalWriterRegistry;
 JournalWriter(std::filesystem::path,std::string,GenerationPreparation::Encoder,GenerationPreparation::Compiler,project::Limits,std::shared_ptr<JournalWriteContext>);
public:
 using Acknowledgement=LatestTaskQueue<JournalGeneration>::Acknowledgement;
 using Success=std::function<void(const JournalGeneration&,const std::vector<Data>&,TransitionDeltaCache&)>;
 // Empty encoder uses encodeJournalSnapshot; compiler remains explicit.
 JournalWriter(std::filesystem::path,std::string,GenerationPreparation::Encoder,GenerationPreparation::Compiler,project::Limits limits={});
 ~JournalWriter();
 JournalWriter(const JournalWriter&)=delete;JournalWriter& operator=(const JournalWriter&)=delete;
 Acknowledgement enqueue(JournalGeneration);
 // Capture the session state now; metadata.state is replaced. Disk work never
 // reads the live session. Owner poll applies successful-write rebasing first.
 // Reuse the acknowledgement only for the latest unchanged session write for
 // this identity. Standalone callers must use one writer per identity; the
 // application service uses JournalWriterRegistry to enforce that boundary.
 Acknowledgement enqueueSession(const std::shared_ptr<JournalSession>&,JournalGeneration metadata);
 // Call only after validated archive restoration has been installed. Preserve
 // the full persisted vector (before history-limit trimming), as legacy does.
 // Cache-less archives and an existing running/pending write cannot seed dedup.
 bool rememberRestored(const std::shared_ptr<JournalSession>&,const ReadResult&,
   const std::vector<JournalSnapshot::Ptr>& restoredSnapshots);

 // Success is delivered on the owner thread after disk success, separately
 // from queue acknowledgement. Worker failures remain on the acknowledgement.
 // Owner acknowledgement/callback errors propagate after delivering all other
 // completed records; disk success is not retroactively reported as IO failure.
 void poll(const Success& success={});
 void waitIdle(const Success& success={});
 bool busy()const{return queue_.busy();}
 std::shared_ptr<const JournalGeneration> runningValue()const{return queue_.runningValue();}
 std::shared_ptr<const JournalGeneration> pendingValue()const{return queue_.pendingValue();}
};
// One application service per history store, shared by every editor session.
// Ports writeQueues/sessionWrites/latestWrites: idle queues are released while
// weak session records and encoding/transition caches outlive an individual
// queue. The 256-key latest-record limit never evicts running/pending writes.
// All methods run on the owner thread; workers access only immutable captures.
class JournalWriterRegistry {
 std::filesystem::path directory_;project::Limits limits_;
 GenerationPreparation::Encoder encoder_;GenerationPreparation::Compiler compiler_;
 std::shared_ptr<JournalWriteContext> context_;
 std::map<std::string,std::unique_ptr<JournalWriter>> writers_;
 JournalWriter& writer(const std::string&);
public:
 JournalWriterRegistry(std::filesystem::path,GenerationPreparation::Encoder,GenerationPreparation::Compiler,project::Limits limits={});
 ~JournalWriterRegistry();
 JournalWriterRegistry(const JournalWriterRegistry&)=delete;
 JournalWriterRegistry& operator=(const JournalWriterRegistry&)=delete;
 JournalWriter::Acknowledgement enqueueSession(const std::string& id,const std::shared_ptr<JournalSession>&,JournalGeneration metadata);
 bool rememberRestored(const std::shared_ptr<JournalSession>&,const ReadResult&,const std::vector<JournalSnapshot::Ptr>&);
 void poll(const JournalWriter::Success& success={});
 void waitIdle(const JournalWriter::Success& success={});
 bool busy(const std::string& id)const;
 std::size_t activeQueues()const{return writers_.size();}
 std::size_t latestRecords()const;
};
// One instance per history identity. Only already-prepared immutable archives
// enter here; uncached delta compilation and session dedup/rebase stay with the
// service. UI calls enqueue/poll; packing and binary IO run off the UI thread.
class PreparedWriter {
 std::filesystem::path directory_;
 std::string id_;
 project::Limits limits_;
 LatestTaskQueue<PreparedGeneration> queue_;
public:
 using Acknowledgement=LatestTaskQueue<PreparedGeneration>::Acknowledgement;
 PreparedWriter(std::filesystem::path directory,std::string id,project::Limits limits={});
 ~PreparedWriter();
 PreparedWriter(const PreparedWriter&)=delete;
 PreparedWriter& operator=(const PreparedWriter&)=delete;
 Acknowledgement enqueue(PreparedGeneration generation);
 void poll(){queue_.poll();}
 void waitIdle(){queue_.waitIdle();}
 bool busy()const{return queue_.busy();}
 std::shared_ptr<const PreparedGeneration> runningValue()const{return queue_.runningValue();}
 std::shared_ptr<const PreparedGeneration> pendingValue()const{return queue_.pendingValue();}
};
}
