#pragma once
#include <cstdint>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>
#include <deque>
namespace moon::recovery {
struct Target {std::string id,name;std::uint64_t revision=0,contentRevision=0;bool hasRevision=false,hasContentRevision=false;};
enum class Kind {Save,Delete};
struct Ticket {std::uint64_t sequence=0;Kind kind=Kind::Save;Target target;};
// Pure lifecycle queue: platform/codec owns bytes and I/O. At most one ticket is
// in flight; newer save targets replace queued targets for the same recovery id.
class Scheduler {
public:
 explicit Scheduler(double minutes=5.0);
 static double normalizeMinutes(double value);
 double intervalMinutes() const {return intervalMinutes_;}
 void setIntervalMinutes(double value) {intervalMinutes_=normalizeMinutes(value);}
 void request(const Target& target);
 void requestDelete(const std::string& id);
 std::optional<Ticket> next();
 // Completion must match current in-flight sequence. Failed saves remain eligible.
 bool complete(const Ticket& ticket,bool success);
 bool busy() const {return inFlight_.has_value();}
 std::size_t pendingCount() const {return pending_.size();}
 bool hasSavedRevision(const Target& target) const;
private:
 struct Saved {std::uint64_t revision,contentRevision;bool hasRevision,hasContentRevision;};
 std::deque<Ticket> pending_;
 std::optional<Ticket> inFlight_;
 std::unordered_map<std::string,Saved> saved_;
 std::uint64_t sequence_=0;double intervalMinutes_;
};
}
