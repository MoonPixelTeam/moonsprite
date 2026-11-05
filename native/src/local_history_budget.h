#pragma once
#include "local_history_archive.h"
#include <functional>
#include <unordered_map>
#include <mutex>
namespace moon {class Document;}
namespace moon::local_history {
class SnapshotReplacements;
// The same immutable document/archive/{base,delta} union used by the legacy
// journal. Document weighing remains an explicit dependency: do not substitute
// native sizeof/resource estimates for historyDocumentBytes.
class JournalSnapshot final {
public:
 using Ptr=std::shared_ptr<const JournalSnapshot>;
 using DocumentWeigher=std::function<double(const Document&)>;
 enum class Kind { Document, Archive, Increment };
 // Consume a completed checkpoint (e.g. DocumentSnapshot::finish), never a
 // live editor or an object retaining its ordinary undo stack.
 static Ptr document(Document&& snapshot,DocumentWeigher);
 static Ptr archive(Data);
 static Ptr increment(Ptr base,const Delta&);
 Kind kind()const{return kind_;}
 const Ptr& base()const{return base_;}
 const std::shared_ptr<const Delta>& delta()const{return delta_;}
 const Data& archive()const{return archive_;}
 const Document& document()const;
 double weight()const;
private:
 Kind kind_;
 Ptr base_;
 Data archive_;
 std::shared_ptr<const Delta> delta_;
 std::shared_ptr<const Document> document_;
 DocumentWeigher weigher_;
 double directWeight_=0;
 mutable std::once_flag weightOnce_;
 mutable double weight_=0;
 JournalSnapshot* cleanupNext_=nullptr;
 explicit JournalSnapshot(Kind kind):kind_(kind){}
 ~JournalSnapshot()=default;
 static Ptr own(JournalSnapshot*);
 static void destroy(const JournalSnapshot*)noexcept;
 static Ptr rebase(const Ptr&,Ptr);
 friend class JournalSession;
 friend SnapshotReplacements enforceSnapshotBudget(
  std::vector<Ptr>&,const std::function<Ptr(const Ptr&)>&,double);
};
inline constexpr double SnapshotBudget=256.*1024*1024;
// JS Map lookup and insertion order, with strong keys until cache/shape
// transfer completes. Updating a mapping does not move it to the end.
class SnapshotReplacements {
 using Entry=std::pair<JournalSnapshot::Ptr,JournalSnapshot::Ptr>;
 std::vector<Entry> entries_;
 std::unordered_map<const JournalSnapshot*,std::size_t> indices_;
public:
 using const_iterator=std::vector<Entry>::const_iterator;
 const_iterator begin()const{return entries_.begin();}
 const_iterator end()const{return entries_.end();}
 bool empty()const{return entries_.empty();}
 std::size_t size()const{return entries_.size();}
 const_iterator find(const JournalSnapshot::Ptr& key)const{const auto found=indices_.find(key.get());return found==indices_.end()?end():begin()+found->second;}
 void set(const JournalSnapshot::Ptr&,JournalSnapshot::Ptr);
 void clear(){indices_.clear();entries_.clear();}
};
using SnapshotMaterializer=std::function<JournalSnapshot::Ptr(const JournalSnapshot::Ptr&)>;
double retainedSnapshotBytes(const std::vector<JournalSnapshot::Ptr>&);
// Owner-thread transaction: only replace the visible snapshot vector after all
// materialization/remapping succeeds. Labels/position and in-flight vectors are
// not modified. The return map retains old keys until shape/cache transfer ends.
SnapshotReplacements enforceSnapshotBudget(std::vector<JournalSnapshot::Ptr>&,
 const SnapshotMaterializer&,double budget=SnapshotBudget);
}
