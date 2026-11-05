#pragma once
#include "local_history_archive.h"
#include <cstdint>
namespace moon {class Document;}
namespace moon::local_history {
// Metadata/topology only. Never reads or copies raster values.
std::string documentShape(const Document&);
// Capture before one edit; consume after that edit has committed. Null requests
// the legacy structural checkpoint path. No document/history mutation occurs.
class CommittedCapture {
  const Document* document_;
  bool idle_;
  std::uint64_t identity_,state_,historyRevision_;
  std::string shape_;
public:
  explicit CommittedCapture(const Document&);
  std::optional<Delta> capture(const Document&,project::Limits limits={})const;
  // For an actual settled Push notification only. The session owns the prior
  // shape gate; expectedHistoryRevision binds this read to that exact event.
  // Unlike a pre-edit ticket, this does not reject a stroke just because its
  // before state was an active native preview.
  static std::optional<Delta> latest(const Document&,std::uint64_t expectedHistoryRevision,project::Limits limits={});
};
}
