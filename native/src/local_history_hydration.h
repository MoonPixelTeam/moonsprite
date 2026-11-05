#pragma once
#include "local_history_archive.h"
#include "local_history_budget.h"
#include "local_history_restore.h"
namespace moon::local_history {
// The caller supplies the decoded current checkpoint and a retained sequence
// with unchanged RGBA topology, including dirty/timestamps/statistics. Other
// structural/property entries must be prepared
// by the restore service separately; unsupported entries throw, never skip.
class PixelHistory {
public:
 class Restoration;
 // Materialize an immutable checkpoint/increment chain on a worker, using
 // the same validated delta hydration as restoration; no live undo entries.
 static Document materialize(JournalSnapshot::Ptr,project::Limits limits={});

 // ReadResult must come from readArchive's identity/format validation. This
 // preparation is independent of a live document and may run on a worker.
 static std::shared_ptr<const Restoration> prepareArchive(const ReadResult&,
   std::optional<std::size_t> entryLimit={},project::Limits limits={});
 static std::size_t decodedCheckpoints(const Restoration&);
 static RestoreDecision install(Document&,const RestoreTicket&,const Restoration&);
 static RestoreDecision install(Document&,const RestoreTicket&,
   const std::vector<Delta>&,std::size_t position,
   const std::optional<std::string>& savedFingerprint={},project::Limits limits={});
};
}
