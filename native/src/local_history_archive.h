#pragma once
#include "project_reader.h"
#include <optional>
namespace moon::local_history {
using Bytes=project::Bytes;
using Data=std::shared_ptr<const Bytes>;
// Metadata stays JSON; typed arrays retain their original type and exact bytes.
// A buffer identifies one before/after value in the JSON patches array.
struct Buffer {std::size_t patch=0;bool after=false;std::string type;Data bytes;};
struct Delta {std::string json;std::vector<Buffer> buffers;};
Delta decodeDelta(Data archive,project::Limits limits={});
Data encodeDelta(const Delta&,project::Limits limits={});
struct ReadResult;
class Snapshot {
  struct Storage;
  std::shared_ptr<Storage> storage_;
  explicit Snapshot(std::shared_ptr<Storage> storage):storage_(std::move(storage)){}
  friend ReadResult readArchive(Data,const std::string&,project::Limits);
public:
  Data encoded()const;
  bool materialized()const;
  std::size_t encodedSize()const;
  const std::optional<Delta>& increment()const;
};
struct ReadResult {
  std::string manifestJson,projectKey;
  std::vector<std::string> labels;
  std::size_t position=0;
  int version=0;
  std::optional<std::string> documentFingerprint;
  std::vector<Snapshot> snapshots;
  bool hasCachedDeltas=false;
  std::vector<std::optional<Bytes>> cachedDeltas;
};
ReadResult readArchive(Data,const std::string& expectedProjectKey,project::Limits limits={});
struct PreparedRequest {
  std::string manifestJson;
  std::vector<Data> snapshots;
  // Every transition is prepared: null means a structural snapshot transition.
  // Compilation of missing transitions belongs to the history worker, not here.
  std::vector<std::optional<Bytes>> deltas;
  std::optional<std::vector<std::optional<Delta>>> increments;
};
struct PackResult {Data archive;std::vector<std::optional<Bytes>> deltas;};
// Returns the actual packed transitions for writeHistoryGeneration cache reuse.
PackResult packPreparedResult(const PreparedRequest&,project::Limits limits={});
// Ports packLocalHistory's prepared/cache path; never decodes project snapshots.
Data packPrepared(const PreparedRequest&,project::Limits limits={});
}
