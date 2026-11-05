#pragma once
#include <cstddef>
#include <string>
#include <vector>
#include <unordered_map>
namespace moon::local_history {
// Logical JS transfer graph, not the C++ object layout. Adapters must retain
// distinct object/view/backing-buffer identities and enumerable field order.
// Pixel data is never copied: a backing store needs only its full byte length.
struct HistoryCostValue {
 enum class Kind { Primitive, String, Object, Map, Buffer, View };
 Kind kind=Kind::Primitive;
 std::u16string string;
 std::size_t byteLength=0;
 // Object/array: Object.values order. Map: alternating key/value order.
 // View: exactly one Buffer node, even for a short/empty subarray or DataView.
 std::vector<std::size_t> children;
};
using HistoryCostGraph=std::vector<HistoryCostValue>;
// One builder per complete transfer graph. All field adapters share its object,
// view and buffer identity tables; separate tables would double-count archives.
class HistoryCostBuilder {
 HistoryCostGraph& graph_;
 std::unordered_map<const void*,std::size_t> buffers_,views_,objects_;
 struct Identity {int kind;const void* key;};
 std::vector<Identity> identities_;
 void remember(int,const void*,std::size_t);
public:
 struct Mark {std::size_t nodes,identities;};
 explicit HistoryCostBuilder(HistoryCostGraph& graph):graph_(graph){}
 HistoryCostBuilder(const HistoryCostBuilder&)=delete;
 Mark mark()const{return {graph_.size(),identities_.size()};}
 // Append transactions may only change owners created after their mark.
 void rollback(Mark)noexcept;
 std::size_t node(HistoryCostValue value={});
 std::size_t object();
 std::pair<std::size_t,bool> object(const void* identity);
 void add(std::size_t owner,std::size_t child);
 std::size_t string(const std::u32string&);
 std::size_t string(const std::string&);
 std::size_t view(const void* buffer,std::size_t bytes,const void* view=nullptr);
 std::size_t ownedView(std::size_t bytes);
};
// Equivalent to historyDocumentBytes' size(historyDocumentTransferView(...))
// AFTER an adapter has supplied that exact graph. This alone is not a native
// Document adapter and must not be installed as a DocumentWeigher yet.
double historyTransferGraphBytes(const HistoryCostGraph&,std::size_t root);
}
