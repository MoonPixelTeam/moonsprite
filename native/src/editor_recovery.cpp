#include "timelapse_session.h"
#include "editor_recovery.h"
#include "project_encode.h"
#include "recovery_store.h"
#include <windows.h>
#include <codecvt>
#include <locale>
namespace moon::editor {
RecoverySession::Result RecoverySession::tick(Document& document,const recovery::Preferences& preferences,const std::filesystem::path& directory,bool force){
  Result result;
  if(auto recording=document.recordingSession()){recording->poll(document);if(recording->pendingCount()){result.error=recording->error;return result;}}
    if(worker.valid()) {

      if(worker.wait_for(std::chrono::milliseconds(0))!=std::future_status::ready)return result;

      bool success=true;try{worker.get();}catch(const std::exception&e){success=false;result.error=e.what();result.cleanupFailure=cleanup.has_value();}

      if(success && cleanup && ownedIdentity==cleanup->first && ownedId==cleanup->second)ownedId.clear();

      cleanup.reset();

      if(ticket)queue.complete(*ticket,success);ticket.reset();

    }

    const auto now=std::chrono::steady_clock::now();

    if(force || now>=due) {

      due=now+std::chrono::milliseconds(static_cast<long long>(preferences.minutes*60000));

      if(preferences.enabled && document.dirty() && !document.active()) {

        if(ownedIdentity!=document.identity()){ownedId.clear();ownedIdentity=document.identity();}

        if(ownedId.empty())ownedId="native-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64())+"-"+std::to_string(document.identity());

        queue.request({ownedId,"",document.revision(),document.contentRevision(),true,true});

      }

    }

    if(!ticket) {

      ticket=queue.next();if(!ticket)return result;

      identity=document.identity();snapshot.emplace(document,ownedId);

    }

    if(document.active() || !document.dirty() || document.identity()!=identity || document.revision()!=ticket->target.revision || document.contentRevision()!=ticket->target.contentRevision || !snapshot->matches(document)) {

      queue.complete(*ticket,false);ticket.reset();snapshot.reset();return result;

    }

    if(!snapshot->advance(document,std::chrono::steady_clock::now()+std::chrono::milliseconds(2)))return result;

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
