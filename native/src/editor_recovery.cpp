#include "timelapse_session.h"
#include "editor_recovery.h"
#include "project_encode.h"
#include "recovery_store.h"
#include <windows.h>
#include <codecvt>
#include <locale>
#include <memory>
namespace moon::editor {
RecoverySession::Result RecoverySession::scheduleSavedCleanup(const std::filesystem::path& directory,std::uint64_t documentIdentity,const CleanupExecutor& executor){
 if(ownedIdentity!=documentIdentity||ownedId.empty())return {};
 std::shared_ptr<std::future<void>> previous;
 try{
  const auto id=ownedId;
  auto nextCleanup=std::make_pair(documentIdentity,id);
  auto outcome=std::make_shared<CleanupOutcome>();
  // Keep a recoverable owner until dispatch succeeds. std::async can reject
  // thread creation after the old future has been captured by its callable.
  previous=std::make_shared<std::future<void>>(std::move(worker));
  auto operation=[previous,outcome,directory,id]()mutable{
   // Legacy RecoveryService.enqueue uses then(task, task): a preceding
   // autosave rejection must not prevent cleanup after an exact file save.
   if(previous->valid())try{previous->get();}
   catch(const std::exception& error){outcome->predecessorFailed=true;outcome->predecessorError=error.what();}
   catch(...){outcome->predecessorFailed=true;outcome->predecessorError="Unknown previous recovery failure";}
   project::removeOwnedRecovery(directory,id);
  };
  auto next=executor?executor(std::move(operation)):std::async(std::launch::async,std::move(operation));
  if(!next.valid())throw std::logic_error("Recovery cleanup executor returned no task");
  worker=std::move(next);
  snapshot.reset();cleanup=std::move(nextCleanup);cleanupOutcome=std::move(outcome);cleanupError.reset();
 }catch(const std::exception& error){
  if(previous)worker=std::move(*previous);
  Result result{error.what(),true};cleanupError=std::make_pair(documentIdentity,result.error);return result;
 }catch(...){if(previous)worker=std::move(*previous);throw;}
 return {};
}

RecoverySession::Result RecoverySession::tick(Document& document,const recovery::Preferences& preferences,const std::filesystem::path& directory,bool force){
  Result result;
  if(auto recording=document.recordingSession()){recording->poll(document);if(recording->pendingCount()){result.error=recording->error;return result;}}
    if(worker.valid()) {

      if(worker.wait_for(std::chrono::milliseconds(0))!=std::future_status::ready)return result;

      bool success=true;try{worker.get();}catch(const std::exception&e){success=false;result.error=e.what();result.cleanupFailure=cleanup.has_value();}
      const bool predecessorFailed=cleanupOutcome&&cleanupOutcome->predecessorFailed;
      if(predecessorFailed){if(!result.error.empty())result.error+="; previous recovery: ";result.error+=cleanupOutcome->predecessorError;}

      if(success && cleanup && ownedIdentity==cleanup->first && ownedId==cleanup->second){if(originId==ownedId)originId.clear();ownedId.clear();}

      if(!success&&cleanup)cleanupError=std::make_pair(cleanup->first,result.error);
      cleanup.reset();

      if(ticket)queue.complete(*ticket,success&&!predecessorFailed);ticket.reset();cleanupOutcome.reset();

    }

    if(suppressed){snapshot.reset();if(ticket)queue.complete(*ticket,false);ticket.reset();return result;}
    const auto now=std::chrono::steady_clock::now();

    if(force || now>=due) {

      due=now+std::chrono::milliseconds(static_cast<long long>(preferences.minutes*60000));

      if(preferences.enabled && document.dirty() && !document.active()) {

        if(ownedIdentity!=document.identity()){ownedId.clear();ownedIdentity=document.identity();}

        if(ownedId.empty())ownedId=originId.empty()?"native-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64())+"-"+std::to_string(document.identity()):originId;

        queue.request({ownedId,"",document.revision(),document.contentRevision(),true,true});

      }

    }

    if(!ticket) {

      ticket=queue.next();if(!ticket)return result;

      identity=document.identity();snapshot.emplace(document,ownedId);

    }

    if(document.active() || !document.dirty() || document.identity()!=identity || document.revision()!=ticket->target.revision || document.contentRevision()!=ticket->target.contentRevision) {

      queue.complete(*ticket,false);ticket.reset();snapshot.reset();return result;

    }

    const auto progress=snapshot->advanceChecked(document,std::chrono::steady_clock::now()+std::chrono::milliseconds(2));
    if(progress==DocumentSnapshot::Progress::SourceChanged){queue.complete(*ticket,false);ticket.reset();snapshot.reset();return result;}
    if(progress==DocumentSnapshot::Progress::Pending)return result;

    auto captured=std::move(*snapshot);snapshot.reset();

    const auto id=ownedId;const auto outputDirectory=directory;

    worker=std::async(std::launch::async,[snapshot=std::move(captured),id,outputDirectory]() mutable {

      auto copy=snapshot.finish();const auto encoded=project::encodeRecoveryProject(copy);

      const auto stamp=std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();

      project::writeRecoveryFiles(outputDirectory,{id,std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.to_bytes(copy.name()),std::to_string(stamp)},*encoded.bytes);

    });

  return result;
}
}
