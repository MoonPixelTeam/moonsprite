#include "local_history_cost.h"
#include <stdexcept>
#include <codecvt>
#include <locale>
namespace moon::local_history {
void HistoryCostBuilder::remember(int kind,const void* key,std::size_t node){identities_.push_back({kind,key});auto& table=kind==0?buffers_:kind==1?views_:objects_;table.emplace(key,node);}
void HistoryCostBuilder::rollback(Mark mark)noexcept{while(identities_.size()>mark.identities){const auto value=identities_.back();identities_.pop_back();auto& table=value.kind==0?buffers_:value.kind==1?views_:objects_;table.erase(value.key);}graph_.resize(mark.nodes);}
std::size_t HistoryCostBuilder::node(HistoryCostValue value){const auto id=graph_.size();graph_.push_back(std::move(value));return id;}
std::size_t HistoryCostBuilder::object(){HistoryCostValue value;value.kind=HistoryCostValue::Kind::Object;return node(std::move(value));}
std::pair<std::size_t,bool> HistoryCostBuilder::object(const void* identity){if(!identity)throw std::invalid_argument("Missing history object identity");if(const auto found=objects_.find(identity);found!=objects_.end())return {found->second,false};const auto id=object();remember(2,identity,id);return {id,true};}
void HistoryCostBuilder::add(std::size_t owner,std::size_t child){graph_.at(owner).children.push_back(child);}
std::size_t HistoryCostBuilder::string(const std::u32string& source){HistoryCostValue value;value.kind=HistoryCostValue::Kind::String;for(const auto c:source){if(c>0x10ffff)throw std::invalid_argument("Invalid history Unicode scalar");if(c<=0xffff)value.string.push_back(char16_t(c));else{value.string.push_back(char16_t(0xd800+((c-0x10000)>>10)));value.string.push_back(char16_t(0xdc00+((c-0x10000)&1023)));}}return node(std::move(value));}
std::size_t HistoryCostBuilder::string(const std::string& source){return string(std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.from_bytes(source));}
std::size_t HistoryCostBuilder::view(const void* identity,std::size_t bytes,const void* viewIdentity){
 if(!identity)throw std::invalid_argument("Missing history backing identity");if(!viewIdentity)viewIdentity=identity;
 std::size_t buffer;if(const auto found=buffers_.find(identity);found!=buffers_.end()){buffer=found->second;if(graph_[buffer].byteLength!=bytes)throw std::invalid_argument("Inconsistent history backing alias");}
 else{HistoryCostValue value;value.kind=HistoryCostValue::Kind::Buffer;value.byteLength=bytes;buffer=node(std::move(value));remember(0,identity,buffer);}
 if(const auto found=views_.find(viewIdentity);found!=views_.end()){if(graph_[found->second].children[0]!=buffer)throw std::invalid_argument("Inconsistent history view alias");return found->second;}
 HistoryCostValue value;value.kind=HistoryCostValue::Kind::View;value.children={buffer};const auto result=node(std::move(value));remember(1,viewIdentity,result);return result;
}
std::size_t HistoryCostBuilder::ownedView(std::size_t bytes){HistoryCostValue buffer;buffer.kind=HistoryCostValue::Kind::Buffer;buffer.byteLength=bytes;const auto id=node(std::move(buffer));HistoryCostValue view;view.kind=HistoryCostValue::Kind::View;view.children={id};return node(std::move(view));}
double historyTransferGraphBytes(const HistoryCostGraph& graph,std::size_t root){
 // Validate without touching any raster storage. Unreachable nodes are also
 // validated so malformed adapter output is never silently accepted.
 if(root>=graph.size())throw std::invalid_argument("Missing history transfer graph root");
 for(const auto& value:graph){
  using Kind=HistoryCostValue::Kind;
  switch(value.kind){
   case Kind::Primitive:case Kind::String:case Kind::Buffer:
    if(!value.children.empty())throw std::invalid_argument("History scalar has graph edges");break;
   case Kind::View:
    if(value.children.size()!=1||value.children[0]>=graph.size()||graph[value.children[0]].kind!=Kind::Buffer)
     throw std::invalid_argument("History view has no backing buffer");break;
   case Kind::Map:
    if(value.children.size()%2)throw std::invalid_argument("History Map has an unmatched key");break;
   case Kind::Object:break;
   default:throw std::invalid_argument("Unknown history transfer value");
  }
  for(const auto child:value.children)if(child>=graph.size())throw std::invalid_argument("Missing history transfer value");
 }
 struct Frame {std::size_t node,next;double bytes;};
 std::vector<Frame> stack;std::vector<bool> seen(graph.size(),false);
 double result=0;
 const auto enter=[&](std::size_t id){
  const auto& value=graph[id];using Kind=HistoryCostValue::Kind;
  if(value.kind==Kind::Primitive){result=8;return;}
  if(value.kind==Kind::String){result=double(value.string.size())*2.;return;}
  if(seen[id]){result=0;return;}seen[id]=true;
  if(value.kind==Kind::Buffer){result=double(value.byteLength);return;}
  stack.push_back({id,0,value.kind==Kind::View?0.:32.});result=0;
 };
 enter(root);
 // Preserve JS recursive reduce grouping/Number addition, without using the
 // native call stack. Repeated primitives/strings are counted per occurrence;
 // only objects (including buffers and views) participate in the seen set.
 while(!stack.empty()){
  auto& frame=stack.back();frame.bytes+=result;
  const auto& children=graph[frame.node].children;
  if(frame.next<children.size()){const auto child=children[frame.next++];enter(child);}
  else{result=frame.bytes;stack.pop_back();}
 }
 return result;
}
}
