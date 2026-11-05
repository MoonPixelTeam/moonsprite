#pragma once
#include "local_history_policy.h"
#include <cstdint>
#include <optional>
#include <string>
#include <vector>
namespace moon {class Document;}
namespace moon::local_history {
struct LayerFingerprint {
  std::string id;int width=0,height=0,offsetX=0,offsetY=0;std::string format="rgba";
};
struct Fingerprint {
  std::string updatedAt;int width=0,height=0;std::string colorMode="rgba";
  std::vector<LayerFingerprint> layers;std::optional<std::string> activeFrameId;
};
std::string documentFingerprint(const Fingerprint&);
std::string documentFingerprint(const Document&);
enum class RestoreDecision { Ready, SavedGenerationMismatch, LiveDocumentChanged };
// Captured before asynchronous archive I/O. Evaluating this ticket never edits
// the document; callers must check it immediately before installing history.
class RestoreTicket {
  const Document* document_;
  std::uint64_t identity_,revision_,contentMutationRevision_,historyRevision_;
public:
  explicit RestoreTicket(const Document&);
  RestoreDecision decision(const Document&,const std::optional<std::string>& savedFingerprint)const;
};
}
