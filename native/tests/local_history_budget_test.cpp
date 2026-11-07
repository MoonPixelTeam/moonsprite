#define NOMINMAX
#include "local_history_budget.h"
#include "local_history_session.h"
#include "local_history_generation.h"
#include "local_history_diff.h"
#include "local_history_raster_cost.h"
#include "local_history_resource_cost.h"
#include "local_history_committed.h"
#include "local_history_hydration.h"
#include "document_snapshot.h"
#include "project_import.h"
#include "project_encode.h"
#include "image_export.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <roapi.h>
#ifdef GetObject
#undef GetObject
#endif
#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <map>
#include <unordered_set>
#include <codecvt>
#include <locale>
#define CHECK(v) do{if(!(v))throw std::runtime_error("Journal budget check failed: " #v);}while(0)
namespace moon {struct RasterHistoryFixture {
 static void apply(Document& d){d.applyEdit(d.history_.front(),true);}
 static void compound(Document& d){const auto start=d.position_;d.groupingHistory_=true;{Document::HistoryLabelScope label(d,U"compound");d.beginStroke({2,3},0xff771122);d.commitStroke();d.beginStroke({3,3},0xff772233);d.commitStroke();}d.groupingHistory_=false;d.groupEdits(start,d.selectedFrames_);}
};}
using namespace moon;
using namespace moon::local_history;
using namespace winrt::Windows::Data::Json;
using Node=JournalSnapshot;using Ptr=Node::Ptr;
struct Apartment {HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);Apartment(){CHECK(SUCCEEDED(status)||status==RPC_E_CHANGED_MODE);}~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}};
Data read(const std::filesystem::path& path){std::ifstream f(path,std::ios::binary);CHECK(bool(f));return std::make_shared<const Bytes>(std::istreambuf_iterator<char>(f),std::istreambuf_iterator<char>());}
Document load(const std::filesystem::path& path){return project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(read(path))));}
JsonObject parse(Data data){return JsonObject::Parse(winrt::to_hstring(std::string(data->begin(),data->end())));}
std::string text(JsonObject object,const wchar_t* key){return winrt::to_string(object.GetNamedString(key));}
Document materialize(Ptr snapshot){return PixelHistory::materialize(std::move(snapshot));}
Document checkpoint(const Document& document){DocumentSnapshot capture(document);while(!capture.advance(document,std::chrono::steady_clock::time_point::max())){}return capture.finish();}
template<class F>void reject(F fn){bool failed=false;try{fn();}catch(...){failed=true;}CHECK(failed);}
void referenceChecks(const std::filesystem::path& directory){
 const auto reference=parse(read(directory/"expectations.json"));std::vector<Ptr> nodes;
 for(const auto& v:reference.GetNamedArray(L"nodes")){const auto row=v.GetObject();const auto kind=text(row,L"kind");const auto file=directory/text(row,L"file");
  if(kind=="document"){const auto weight=row.GetNamedNumber(L"weight");nodes.push_back(Node::document(load(file),[weight](const Document&){return weight;}));}
  else if(kind=="archive")nodes.push_back(Node::archive(read(file)));
  else{CHECK(kind=="increment");nodes.push_back(Node::increment(nodes.at(std::size_t(row.GetNamedNumber(L"base"))),decodeDelta(read(file))));}
 }

 const auto planBytes=read(directory/"generation-plan.json");const auto plans=JsonArray::Parse(winrt::to_hstring(std::string(planBytes->begin(),planBytes->end())));
 for(const auto& item:plans){const auto plan=item.GetObject();JournalSession::State state;std::vector<unsigned> encodedIds;std::vector<std::pair<unsigned,unsigned>> compiledIds;
  const auto roots=plan.GetNamedArray(L"roots");for(const auto& id:roots)state.snapshots.push_back(nodes.at(unsigned(id.GetNumber())));state.labels.resize(state.snapshots.size()-1,"edit");state.position=state.labels.size();
  JsonObject manifest;manifest.Insert(L"version",JsonValue::CreateNumberValue(4));manifest.Insert(L"projectKey",JsonValue::CreateStringValue(L"generation-test"));manifest.Insert(L"position",JsonValue::CreateNumberValue(double(state.position)));JsonArray labels;for(const auto& label:state.labels)labels.Append(JsonValue::CreateStringValue(winrt::to_hstring(label)));manifest.Insert(L"labels",labels);
  const auto idOf=[&](const Ptr& node){const auto found=std::find(nodes.begin(),nodes.end(),node);CHECK(found!=nodes.end());return unsigned(found-nodes.begin());};
  const auto result=prepareGeneration(winrt::to_string(manifest.Stringify()),state,[&](const Ptr& node){const auto id=idOf(node);encodedIds.push_back(id);return encodeJournalSnapshot(node);},[&](const Ptr& before,const Ptr& after)->std::optional<Bytes>{compiledIds.emplace_back(idOf(before),idOf(after));return {};});
  const auto expectedEncode=plan.GetNamedArray(L"encode"),expectedCompile=plan.GetNamedArray(L"compile"),increments=plan.GetNamedArray(L"incremental");CHECK(encodedIds.size()==expectedEncode.Size()&&compiledIds.size()==expectedCompile.Size());
  for(unsigned i=0;i<expectedEncode.Size();++i)CHECK(encodedIds[i]==expectedEncode.GetAt(i).GetNumber());for(unsigned i=0;i<expectedCompile.Size();++i){const auto pair=expectedCompile.GetAt(i).GetArray();CHECK(compiledIds[i].first==pair.GetAt(0).GetNumber()&&compiledIds[i].second==pair.GetAt(1).GetNumber());}
  for(unsigned i=0;i<increments.Size();++i){const bool incremental=increments.GetAt(i).GetBoolean();CHECK(bool((*result.prepared.increments)[i])==incremental&&bool(result.encodedCheckpoints[i])==!incremental);if(incremental)CHECK((*result.prepared.increments)[i]->json==state.snapshots[i]->delta()->json);}
  const auto packed=packPrepared(result.prepared);const auto reopened=readArchive(packed,"generation-test");CHECK(reopened.snapshots.size()==state.snapshots.size()&&reopened.labels==state.labels&&reopened.position==state.position);
  for(std::size_t i=0;i<state.snapshots.size();++i){CHECK(bool(reopened.snapshots[i].increment())==increments.GetAt(unsigned(i)).GetBoolean());if(!reopened.snapshots[i].increment()){CHECK(*reopened.snapshots[i].encoded()==*result.encodedCheckpoints[i]);const auto decoded=project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(reopened.snapshots[i].encoded())));CHECK(decoded.canvasPixels()==materialize(state.snapshots[i]).canvasPixels());}}
  // A cached null transition is a hit, not permission to compile again.
  unsigned cached=0;auto cachedResult=prepareGeneration(winrt::to_string(manifest.Stringify()),state,[&](const Ptr&){return read(directory/"baseline.moonsprite");},[](const Ptr&,const Ptr&)->std::optional<Bytes>{throw std::runtime_error("unexpected compilation");},[&](const Ptr&,const Ptr&)->GenerationPreparation::CachedDelta{++cached;return std::optional<Bytes>{};});CHECK(cached==expectedCompile.Size());
  CHECK(state.position==state.labels.size()&&state.snapshots.size()==roots.Size());
  reject([&]{prepareGeneration("{}",state,[](const Ptr&)->Data{throw std::runtime_error("encoding failed");},{ });});
  const auto before=state.snapshots;auto tiny=project::Limits{};tiny.archiveBytes=0;reject([&]{prepareGeneration("{}",state,[&](const Ptr&){return read(directory/"baseline.moonsprite");},[](const Ptr&,const Ptr&)->std::optional<Bytes>{return {};},{},tiny);});CHECK(state.snapshots==before);

 }

 const auto ackBytes=read(directory/"acknowledgements.json");const auto ackCases=JsonArray::Parse(winrt::to_hstring(std::string(ackBytes->begin(),ackBytes->end())));
 for(const auto& item:ackCases){const auto spec=item.GetObject();JournalSession::State initial;std::vector<Ptr> recorded;std::vector<Data> archives;
  for(const auto& id:spec.GetNamedArray(L"roots"))initial.snapshots.push_back(nodes.at(unsigned(id.GetNumber())));for(const auto& label:spec.GetNamedArray(L"labels"))initial.labels.push_back(winrt::to_string(label.GetString()));initial.position=1;
  JournalSession session(initial,"shape");
  if(spec.GetNamedBoolean(L"pressured",false)){JournalSession::Dependencies deps;deps.budget=0;session.record({JournalSession::Change::Kind::Trim},"shape",deps);CHECK(session.pressured());}
  for(const auto& id:spec.GetNamedArray(L"record"))recorded.push_back(nodes.at(unsigned(id.GetNumber())));for(unsigned i=0;i<recorded.size();++i){bool encoded=false;for(const auto& index:spec.GetNamedArray(L"encoded"))encoded|=index.GetNumber()==i;archives.push_back(encoded?std::make_shared<const Bytes>(Bytes{std::uint8_t(i+1),7}):Data{});}
  TransitionDeltaCache cache;const auto prior=session.state();for(std::size_t i=0;i+1<prior.snapshots.size();++i)cache.set(prior.snapshots[i],prior.snapshots[i+1],i%2?std::optional<Bytes>{}:std::optional<Bytes>(Bytes{std::uint8_t(10+i)}));
  const auto inFlight=recorded;session.acknowledge(recorded,archives,cache);const auto& actual=session.state();const auto expected=spec.GetNamedArray(L"after");CHECK(actual.snapshots.size()==expected.Size());std::map<unsigned,Ptr> fresh;
  std::function<void(const Ptr&,JsonObject)> verify=[&](const Ptr& node,JsonObject row){if(row.HasKey(L"old")){CHECK(node==nodes.at(unsigned(row.GetNamedNumber(L"old"))));return;}const auto id=unsigned(row.GetNamedNumber(L"fresh"));if(const auto found=fresh.find(id);found!=fresh.end()){CHECK(node==found->second);return;}fresh[id]=node;CHECK(row.HasKey(L"kind"));if(text(row,L"kind")=="archive"){CHECK(node->kind()==Node::Kind::Archive);const auto bytes=row.GetNamedArray(L"bytes");CHECK(node->archive()->size()==bytes.Size());for(unsigned i=0;i<bytes.Size();++i)CHECK(node->archive()->at(i)==bytes.GetAt(i).GetNumber());}else{CHECK(node->kind()==Node::Kind::Increment);verify(node->base(),row.GetNamedObject(L"base"));CHECK(node->delta()==nodes.at(unsigned(row.GetNamedNumber(L"delta")))->delta());}};
  for(unsigned i=0;i<expected.Size();++i)verify(actual.snapshots[i],expected.GetAt(i).GetObject());const auto recordAfter=spec.GetNamedArray(L"recordAfter");for(unsigned i=0;i<recordAfter.Size();++i)verify(recorded[i],recordAfter.GetAt(i).GetObject());CHECK(actual.labels==prior.labels&&actual.position==prior.position&&session.pressured()==spec.GetNamedBoolean(L"pressureAfter"));
  for(unsigned i=0;i+1<actual.snapshots.size();++i){const auto value=cache.get(actual.snapshots[i],actual.snapshots[i+1]);CHECK(value);if(i%2)CHECK(!*value);else CHECK(*value==std::optional<Bytes>(Bytes{std::uint8_t(10+i)}));}CHECK(inFlight.size()==recorded.size());
 }
 for(const auto& v:reference.GetNamedArray(L"cases")){const auto row=v.GetObject();std::vector<Ptr> visible;for(const auto& id:row.GetNamedArray(L"roots"))visible.push_back(nodes.at(std::size_t(id.GetNumber())));
  const auto inFlight=visible;CHECK(retainedSnapshotBytes(visible)==row.GetNamedNumber(L"before"));int materializations=0,weighs=0;
  const auto replacements=enforceSnapshotBudget(visible,[&](const Ptr& first){
   ++materializations;const auto expected=row.GetNamedObject(L"checkpoint");auto d=materialize(first);CHECK(d.pixels().at(101)==expected.GetNamedNumber(L"pixel"));
   // The exact recursive JS graph counter is still a separate migration gap.
   // Inject its independently recorded actual result, not a native estimate.
   const auto weight=expected.GetNamedNumber(L"weight");return Node::document(checkpoint(d),[&,weight](const Document&){++weighs;return weight;});
  },row.GetNamedNumber(L"budget"));
  CHECK(retainedSnapshotBytes(visible)==row.GetNamedNumber(L"after"));CHECK(retainedSnapshotBytes(inFlight)==row.GetNamedNumber(L"before"));
  const auto expected=row.GetNamedArray(L"rootsAfter");CHECK(expected.Size()==visible.size());std::map<unsigned,Ptr> fresh;
  auto resolve=[&](JsonObject ref){return ref.HasKey(L"old")?nodes.at(std::size_t(ref.GetNamedNumber(L"old"))):fresh.at(unsigned(ref.GetNamedNumber(L"fresh")));};
  for(unsigned i=0;i<expected.Size();++i){const auto desc=expected.GetAt(i).GetObject();const auto& actual=visible[i];
   if(desc.HasKey(L"old")){CHECK(actual==resolve(desc));continue;}
   const auto id=unsigned(desc.GetNamedNumber(L"fresh"));const auto inserted=fresh.emplace(id,actual);CHECK(inserted.first->second==actual);
   if(text(desc,L"kind")=="document")CHECK(actual->kind()==Node::Kind::Document);
   else{CHECK(actual->kind()==Node::Kind::Increment&&actual->base()==resolve(desc.GetNamedObject(L"base")));CHECK(actual->delta()==nodes.at(std::size_t(desc.GetNamedNumber(L"deltaNode")))->delta());}
  }
  std::vector<std::size_t> keys,expectedKeys;for(const auto& [before,after]:replacements){const auto found=std::find(nodes.begin(),nodes.end(),before);CHECK(found!=nodes.end());keys.push_back(found-nodes.begin());CHECK(after);}
  for(const auto& key:row.GetNamedArray(L"replacementKeys"))expectedKeys.push_back(std::size_t(key.GetNumber()));CHECK(keys==expectedKeys);
  CHECK(materializations==(replacements.empty()?0:1));if(materializations){CHECK(weighs==1);CHECK(materialize(visible.back()).pixels().at(101)==row.GetNamedNumber(L"finalPixel"));}
 }
 // A materialization failure cannot publish a partial replacement vector.
 std::vector<Ptr> visible{nodes[117],nodes[118],nodes[119],nodes[120]};const auto prior=visible;
 reject([&]{enforceSnapshotBudget(visible,[](const Ptr&)->Ptr{throw std::runtime_error("materializer failed");},0);});CHECK(visible==prior);
 reject([&]{enforceSnapshotBudget(visible,[](const Ptr&)->Ptr{return {};},0);});CHECK(visible==prior);
}

void sessionChecks(const std::filesystem::path& directory){
 const auto data=read(directory/"expectations.json");const auto cases=JsonArray::Parse(winrt::to_hstring(std::string(data->begin(),data->end())));CHECK(cases.Size()==2);
 for(const auto& value:cases){const auto spec=value.GetObject();const auto root=directory/text(spec,L"name");const auto specs=spec.GetNamedArray(L"nodes");
  std::map<unsigned,Ptr> observed;
  const auto checkpointNode=[&](unsigned id){const auto row=specs.GetAt(id).GetObject();CHECK(text(row,L"kind")=="document");const auto weight=row.GetNamedNumber(L"weight");return Node::document(load(root/text(row,L"file")),[weight](const Document&){return weight;});};
  const auto initial=unsigned(spec.GetNamedNumber(L"initial"));auto baseline=checkpointNode(initial);observed[initial]=baseline;
  JournalSession session({{baseline},{},0},text(spec,L"initialShape"));std::vector<JournalSession::State> generations;
  std::function<void(const Ptr&,unsigned)> verifyNode=[&](const Ptr& actual,unsigned id){
   if(const auto found=observed.find(id);found!=observed.end()){CHECK(found->second==actual);return;}
   for(const auto& [other,node]:observed)CHECK(node!=actual);observed[id]=actual;
   const auto row=specs.GetAt(id).GetObject();if(text(row,L"kind")=="increment"){
    CHECK(actual->kind()==Node::Kind::Increment);verifyNode(actual->base(),unsigned(row.GetNamedNumber(L"base")));const auto delta=decodeDelta(read(root/text(row,L"file")));CHECK(actual->delta()->json==delta.json&&actual->delta()->buffers.size()==delta.buffers.size());
    for(std::size_t i=0;i<delta.buffers.size();++i)CHECK(*actual->delta()->buffers[i].bytes==*delta.buffers[i].bytes);
   }else {CHECK(actual->kind()==Node::Kind::Document);CHECK(actual->document().canvasPixels()==load(root/text(row,L"file")).canvasPixels());CHECK(actual->weight()==row.GetNamedNumber(L"weight"));}
  };
  for(const auto& item:spec.GetNamedArray(L"steps")){const auto row=item.GetObject();const auto name=text(row,L"kind");JournalSession::Change change{JournalSession::Change::Kind::Push};
   if(name=="trim")change.kind=JournalSession::Change::Kind::Trim;else if(name=="undo")change.kind=JournalSession::Change::Kind::Undo;else if(name=="redo")change.kind=JournalSession::Change::Kind::Redo;else if(name=="clear")change.kind=JournalSession::Change::Kind::Clear;else CHECK(name=="push");
   if(row.GetNamedValue(L"label").ValueType()!=JsonValueType::Null)change.label=text(row,L"label");change.discardedUndo=std::size_t(row.GetNamedNumber(L"discardedUndo"));change.discardedRedo=std::size_t(row.GetNamedNumber(L"discardedRedo"));
   unsigned captures=0,checkpoints=0,materializations=0;JournalSession::Dependencies dependencies;dependencies.limit=std::size_t(row.GetNamedNumber(L"limit"));dependencies.budget=row.GetNamedNumber(L"budget");
   dependencies.committed=[&]()->std::optional<Delta>{++captures;if(row.HasKey(L"delta"))return decodeDelta(read(root/text(row,L"delta")));return {};};
   dependencies.checkpoint=[&]{++checkpoints;CHECK(row.GetNamedValue(L"checkpoint").ValueType()==JsonValueType::Number);return checkpointNode(unsigned(row.GetNamedNumber(L"checkpoint")));};
   dependencies.materialize=[&](const Ptr& before){++materializations;CHECK(row.GetNamedValue(L"materialized").ValueType()==JsonValueType::Number);auto node=checkpointNode(unsigned(row.GetNamedNumber(L"materialized")));CHECK(materialize(before).canvasPixels()==node->document().canvasPixels());return node;};
   generations.push_back(session.state());session.record(change,text(row,L"shape"),dependencies);CHECK(captures==row.GetNamedNumber(L"captureCalls"));CHECK(checkpoints==(row.GetNamedValue(L"checkpoint").ValueType()==JsonValueType::Number?1:0));CHECK(materializations==(row.GetNamedValue(L"materialized").ValueType()==JsonValueType::Number?1:0));
   const auto& state=session.state();CHECK(state.position==row.GetNamedNumber(L"position")&&session.pressured()==row.GetNamedBoolean(L"pressured"));const auto roots=row.GetNamedArray(L"roots"),labels=row.GetNamedArray(L"labels");CHECK(state.snapshots.size()==roots.Size()&&state.labels.size()==labels.Size());
   for(unsigned i=0;i<roots.Size();++i)verifyNode(state.snapshots[i],unsigned(roots.GetAt(i).GetNumber()));for(unsigned i=0;i<labels.Size();++i)CHECK(state.labels[i]==winrt::to_string(labels.GetAt(i).GetString()));
  }
  // In-flight generations remain immutable while a later event truncates,
  // clears or rebases the visible session. All observed identities stay alive.
  CHECK(generations.front().snapshots.front()==baseline&&generations.front().labels.empty());
 }
 // Failure at either capture or budget materialization must not publish a
 // partially truncated journal; ordinary editing is independent of this state.
 auto baseline=Node::document(Document(1,1),[](const Document&){return 1.;});JournalSession session({{baseline},{},0},"shape");JournalSession::Dependencies dependencies;
 dependencies.checkpoint=[]()->Ptr{throw std::runtime_error("checkpoint failed");};
 reject([&]{session.record({JournalSession::Change::Kind::Push},"different",dependencies);});CHECK(session.state().snapshots==std::vector<Ptr>{baseline}&&session.state().labels.empty());
 dependencies.checkpoint=[&]{return Node::document(Document(1,1),[](const Document&){return 1.;});};
 Delta delta;delta.json=R"({"bytes":0,"patches":[],"origins":{"before":[]}})";dependencies.committed=[&]()->std::optional<Delta>{return delta;};
 session.record({JournalSession::Change::Kind::Push,std::string("first")},"shape",dependencies);const auto previous=session.state();dependencies.limit=1;dependencies.budget=0;dependencies.materialize=[](const Ptr&)->Ptr{throw std::runtime_error("materialize failed");};
 reject([&]{session.record({JournalSession::Change::Kind::Push,std::string("second")},"shape",dependencies);});CHECK(session.state().snapshots==previous.snapshots&&session.state().labels==previous.labels&&session.state().position==previous.position);
 dependencies.committed=[]()->std::optional<Delta>{throw std::runtime_error("capture failed");};reject([&]{session.record({JournalSession::Change::Kind::Push,std::string("third")},"shape",dependencies);});CHECK(session.state().snapshots==previous.snapshots);
 auto lifetimeBase=Node::document(Document(1,1),[](const Document&){return 1.;});std::weak_ptr<const Node> released=lifetimeBase;JournalSession lifetime({{lifetimeBase},{},0},"shape");lifetimeBase.reset();JournalSession::Dependencies clear;clear.checkpoint=[] {return Node::document(Document(1,1),[](const Document&){return 1.;});};lifetime.record({JournalSession::Change::Kind::Clear},"new",clear);CHECK(released.expired());

}

void nativeSessionChecks(){
 // This deliberately injected test cost is not a production DocumentWeigher.
 const auto capture=[](const Document& document){return Node::document(checkpoint(document),[](const Document&){return 1.;});};
 Document document(4,4);auto baseline=capture(document);JournalSession session({{baseline},{},0},documentShape(document));unsigned checkpoints=0;std::vector<HistoryStackChange> nativeEvents;document.setHistoryChangeListener([&](const Document&,const HistoryStackChange& change){nativeEvents.push_back(change);});
 JournalSession::Dependencies dependencies;dependencies.checkpoint=[&]{++checkpoints;return capture(document);};
 const auto beforeHistory=document.historyRevision();CommittedCapture before(document);document.beginStroke({1,1},0xff123456);
 reject([&]{session.recordSettled({JournalSession::Change::Kind::Push,std::string("paint")},document,beforeHistory,dependencies);});CHECK(session.state().snapshots==std::vector<Ptr>{baseline}&&checkpoints==0);
 CHECK(document.commitStroke());const auto generation=document.historyRevision();const auto expected=before.capture(document);CHECK(expected);
 const auto pixels=document.canvasPixels();const auto content=document.contentRevision(),ordinaryHistory=document.historyRevision(),operations=document.projectInformation().operationCount;
 CHECK(nativeEvents.size()==1);session.recordSettled(nativeEvents.back(),document,dependencies);CHECK(checkpoints==0&&session.state().position==1&&session.state().snapshots.back()->kind()==Node::Kind::Increment);
 const auto painted=session.state().snapshots.back();CHECK(painted->delta()->json==expected->json);CHECK(session.state().labels.back()==text(JsonObject::Parse(winrt::to_hstring(painted->delta()->json)),L"label"));CHECK(document.canvasPixels()==pixels&&document.contentRevision()==content&&document.historyRevision()==ordinaryHistory&&document.projectInformation().operationCount==operations);
 reject([&]{session.recordSettled({JournalSession::Change::Kind::Undo},document,generation-1,dependencies);});CHECK(session.state().snapshots.back()==painted&&session.state().position==1);
 document.undo();session.recordSettled(nativeEvents.back(),document,dependencies);CHECK(session.state().position==0&&document.canvasPixels()!=pixels);
 document.redo();session.recordSettled(nativeEvents.back(),document,dependencies);CHECK(session.state().position==1&&session.state().snapshots.back()==painted&&document.canvasPixels()==pixels);
 document.addLayer();session.recordSettled(nativeEvents.back(),document,dependencies);CHECK(checkpoints==1&&session.state().labels.size()==2&&session.state().snapshots.back()->kind()==Node::Kind::Document);
 document.setHistoryEntryLimit(1);session.recordSettled(nativeEvents.back(),document,dependencies);CHECK(session.state().labels.size()==1&&session.state().position==1&&session.state().snapshots.front()==painted);
 document.beginStroke({2,2},0xffabcdef);document.cancelStroke();CHECK(session.state().labels.size()==1&&checkpoints==1&&nativeEvents.size()==5);CHECK(!CommittedCapture::latest(document,document.historyRevision()));document.setHistoryChangeListener({});
}

void historyEventChecks(const std::filesystem::path& directory){
 const auto bytes=read(directory/"history-events.json");const auto cases=JsonArray::Parse(winrt::to_hstring(std::string(bytes->begin(),bytes->end())));CHECK(cases.Size()==2);
 const auto kind=[](HistoryStackChange::Kind value){switch(value){case HistoryStackChange::Kind::Push:return "push";case HistoryStackChange::Kind::Trim:return "trim";case HistoryStackChange::Kind::Undo:return "undo";case HistoryStackChange::Kind::Redo:return "redo";case HistoryStackChange::Kind::Clear:return "clear";}throw std::runtime_error("Unknown event kind");};
 for(const auto& item:cases){const auto spec=item.GetObject();const auto expected=spec.GetNamedArray(L"events");Document document(4,4,std::size_t(spec.GetNamedNumber(L"maxBytes")),3);unsigned events=0,paint=0;bool sawPreview=false;
  document.setHistoryChangeListener([&](const Document& source,const HistoryStackChange& change){CHECK(&source==&document&&change.revision==source.historyRevision());CHECK(events<expected.Size());const auto row=expected.GetAt(events++).GetObject();CHECK(kind(change.kind)==text(row,L"kind"));const auto expectedLabel=row.GetNamedString(L"label");CHECK(change.label==std::u32string(expectedLabel.begin(),expectedLabel.end()));CHECK(change.discardedUndo==row.GetNamedNumber(L"discardedUndo")&&change.discardedRedo==row.GetNamedNumber(L"discardedRedo"));CHECK(source.historyPosition()==row.GetNamedNumber(L"position")&&source.historySize()==row.GetNamedNumber(L"length"));sawPreview|=source.active();});
  for(const auto& value:spec.GetNamedArray(L"commands")){const auto command=value.GetObject();const auto op=text(command,L"op");
   if(op=="push"){const auto label=command.GetNamedString(L"label");Document::HistoryLabelScope scope(document,std::u32string(label.begin(),label.end()));const int x=int(paint%4),y=int(paint/4);++paint;document.beginStroke({x,y},0xff123400+paint);CHECK(document.commitStroke());}
   else if(op=="undo")document.undo();else if(op=="redo")document.redo();else if(op=="clear")document.clearHistory();else if(op=="limit")document.setHistoryEntryLimit(std::size_t(command.GetNamedNumber(L"value")));else if(op=="compound")RasterHistoryFixture::compound(document);else CHECK(false);
   CHECK(events==command.GetNamedNumber(L"eventCount")&&document.historyPosition()==command.GetNamedNumber(L"position")&&document.historySize()==command.GetNamedNumber(L"length"));
  }CHECK(events==expected.Size()&&sawPreview);
 }
 Document document(4,4);unsigned notified=0;document.setHistoryChangeListener([&](const Document&,const HistoryStackChange&){++notified;});auto copied=document;copied.beginStroke({0,0},0xff123456);CHECK(copied.commitStroke()&&notified==0);auto assigned=Document(4,4);assigned=document;assigned.beginStroke({0,0},0xff123456);CHECK(assigned.commitStroke()&&notified==0);
 auto owner=std::make_shared<int>(1);std::weak_ptr<int> lifetime=owner;document.setHistoryChangeListener([&,owner](const Document&,const HistoryStackChange&){document.setHistoryChangeListener({});CHECK(!lifetime.expired());});owner.reset();document.clearHistory();CHECK(lifetime.expired());
 const auto pixels=document.canvasPixels();const auto dirty=document.dirty();const auto revision=document.revision();document.clearHistory();CHECK(document.canvasPixels()==pixels&&document.dirty()==dirty&&document.revision()==revision);
 std::vector<int> listenerState;document.setHistoryChangeListener([&,count=0](const Document&,const HistoryStackChange&)mutable{listenerState.push_back(++count);});document.clearHistory();document.clearHistory();CHECK(listenerState==std::vector<int>({1,2}));
 document.setHistoryChangeListener([](const Document&,const HistoryStackChange&){throw std::runtime_error("listener failed");});reject([&]{document.clearHistory();});CHECK(document.historySize()==0&&document.canvasPixels()==pixels);document.setHistoryChangeListener({});
}


void transitionCacheChecks(){
 TransitionDeltaCache cache;auto before=Node::archive(std::make_shared<const Bytes>(Bytes{1})),after=Node::archive(std::make_shared<const Bytes>(Bytes{2})),other=Node::archive(std::make_shared<const Bytes>(Bytes{2}));
 CHECK(!cache.get(before,after));cache.set(before,after,{});auto nullHit=cache.get(before,after);CHECK(nullHit&&!(*nullHit));CHECK(!cache.get(after,before)&&!cache.get(before,other));
 Bytes source{4,5,6};cache.set(before,after,source);source[0]=99;auto hit=cache.get(before,after);CHECK(hit&&*hit&&**hit==Bytes({4,5,6}));(**hit)[0]=77;CHECK(**cache.get(before,after)==Bytes({4,5,6}));
 cache.set(before,other,{});CHECK(**cache.get(before,after)==Bytes({4,5,6})&&cache.get(before,other)&&!*cache.get(before,other));
 // Generation preparation consumes the real cache, including structural-null
 // hits, and does not invoke an uncached compiler on a second preparation.
 JournalSession::State state{{before,after,other},{"first","second"},2};cache.set(after,other,{});unsigned compilations=0;
 auto compiler=[&](const Ptr&,const Ptr&)->std::optional<Bytes>{++compilations;throw std::runtime_error("unexpected compilation");};
 const auto generation=prepareGeneration("{}",state,{},compiler,[&](const Ptr& a,const Ptr& b){return cache.get(a,b);});CHECK(compilations==0&&generation.prepared.deltas[0]==std::optional<Bytes>(Bytes{4,5,6})&&!generation.prepared.deltas[1]);
 std::weak_ptr<const Node> weakBefore=before,weakAfter=after;state.snapshots.clear();before.reset();after.reset();CHECK(weakBefore.expired()&&weakAfter.expired());
 for(unsigned i=0;i<150;++i){auto a=Node::archive(std::make_shared<const Bytes>(Bytes{1})),b=Node::archive(std::make_shared<const Bytes>(Bytes{2}));CHECK(!cache.get(a,b));cache.set(a,b,Bytes{std::uint8_t(i)});CHECK(**cache.get(a,b)==Bytes({std::uint8_t(i)}));}
 reject([&]{cache.get({},other);});reject([&]{cache.set(other,{},{});});
}

void acknowledgementLifetimeChecks(){
 Delta delta;delta.json=R"({"bytes":0,"patches":[],"origins":{"before":[]}})";
 auto base=Node::archive(std::make_shared<const Bytes>(Bytes{1}));std::weak_ptr<const Node> oldBase=base;auto first=Node::increment(base,delta),second=Node::increment(first,delta);base.reset();
 JournalSession session({{first,second},{"paint"},1},"shape");std::vector<Ptr> record{first,second},inFlight=record;first.reset();second.reset();TransitionDeltaCache cache;cache.set(record[0],record[1],{});
 const auto previous=session.state();reject([&]{session.acknowledge(record,{},cache);});CHECK(session.state().snapshots==previous.snapshots&&record==inFlight);
 session.acknowledge(record,{std::make_shared<const Bytes>(Bytes{7,8}),{}},cache);CHECK(session.state().snapshots[0]->kind()==Node::Kind::Archive&&record==session.state().snapshots);CHECK(!oldBase.expired());
 CHECK(cache.get(record[0],record[1])&&!*cache.get(record[0],record[1]));
 JournalSession::Dependencies dependencies;dependencies.committed=[&]()->std::optional<Delta>{return delta;};dependencies.checkpoint=[]()->Ptr{throw std::runtime_error("lost acknowledged shape");};session.record({JournalSession::Change::Kind::Push,std::string("after write")},"shape",dependencies);CHECK(session.state().snapshots.back()->kind()==Node::Kind::Increment);
 // Keep the separately retained old generation until the lifetime scope ends.
 inFlight.clear();CHECK(!oldBase.expired()); // previous is still an in-flight generation.
}
void encodingCacheChecks(){
 SnapshotEncodingCache cache;auto node=Node::document(Document(1,1),[](const Document&){return 1.;});const auto bytes=std::make_shared<const Bytes>(Bytes{1,2,3});
 std::promise<void> entered,release;auto released=release.get_future().share();unsigned calls=0;
 auto first=std::async(std::launch::async,[&]{return cache.encode(node,[&](const Ptr& actual){CHECK(actual==node);++calls;entered.set_value();released.wait();return bytes;});});entered.get_future().get();
 auto second=std::async(std::launch::async,[&]{return cache.encode(node,[](const Ptr&)->Data{throw std::runtime_error("duplicate encoding");});});release.set_value();CHECK(first.get()==bytes&&second.get()==bytes&&calls==1);
 CHECK(cache.encode(node,[](const Ptr&)->Data{throw std::runtime_error("cache miss");})==bytes);
 auto retry=Node::document(Document(1,1),[](const Document&){return 1.;});unsigned attempts=0;reject([&]{cache.encode(retry,[&](const Ptr&)->Data{++attempts;throw std::runtime_error("encoding failed");});});CHECK(cache.encode(retry,[&](const Ptr&){++attempts;return bytes;})==bytes&&attempts==2);
 auto absent=Node::document(Document(1,1),[](const Document&){return 1.;});reject([&]{cache.encode(absent,[](const Ptr&)->Data{return {};});});CHECK(cache.encode(absent,[&](const Ptr&){return bytes;})==bytes);
 auto archive=Node::archive(bytes);CHECK(cache.encode(archive,{})==bytes);std::weak_ptr<const Node> weak=node;node.reset();CHECK(weak.expired());
 // Allocation reuse must not retrieve a dead weak key's prior bytes.
 for(unsigned i=0;i<150;++i){auto next=Node::document(Document(1,1),[](const Document&){return 1.;});auto expected=std::make_shared<const Bytes>(Bytes{std::uint8_t(i)});CHECK(cache.encode(next,[&](const Ptr&){return expected;})==expected);}
 reject([&]{cache.encode({},{});});
}
void lifetimeChecks(Delta source){
 CHECK(!source.buffers.empty()&&!source.buffers.front().bytes->empty());const auto json=source.json;
 auto mutableBytes=std::make_shared<Bytes>(*source.buffers.front().bytes);const auto originalByte=mutableBytes->front();source.buffers.front().bytes=mutableBytes;
 auto first=Node::archive(std::make_shared<const Bytes>(Bytes{9}));auto node=Node::increment(first,source);const auto originalWeight=node->weight();(*mutableBytes)[0]^=255;source.json="changed";CHECK(node->delta()->buffers[0].bytes->at(0)==originalByte&&node->delta()->json==json&&node->weight()==originalWeight);
 int weighs=0;auto document=Node::document(Document(1,1),[&](const Document&){++weighs;if(weighs==1)throw std::runtime_error("cost failed");return 7.;});CHECK(weighs==0);reject([&]{document->weight();});CHECK(document->weight()==7&&document->weight()==7&&weighs==2);
 auto live=Document(1,1);live.beginStroke({0,0},0xff123456);CHECK(live.commitStroke());reject([&]{Node::document(std::move(live),[](const Document&){return 1.;});});
 Delta minimal;minimal.json=R"({"bytes":0,"patches":[],"origins":{"before":[]}})";
 auto base=Node::archive(std::make_shared<const Bytes>(Bytes{1}));std::weak_ptr<const Node> oldBase=base;node=base;base.reset();std::vector<Ptr> visible;
 for(int i=1;i<=120;++i){node=Node::increment(node,minimal);if(i>=117)visible.push_back(node);}node.reset();auto inFlight=visible;
 auto replacements=enforceSnapshotBudget(visible,[](const Ptr&){return Node::document(Document(1,1),[](const Document&){return 8.;});},0);
 CHECK(!oldBase.expired());replacements.clear();CHECK(!oldBase.expired());inFlight.clear();CHECK(oldBase.expired());CHECK(retainedSnapshotBytes(visible)==8+3*512);
 // Native adaptation of GC must release very long base chains without stack
 // recursion, including after the visible vector has only one tail node.
 node=Node::archive(std::make_shared<const Bytes>(Bytes{1}));oldBase=node;
 for(int i=0;i<30000;++i)node=Node::increment(node,minimal);CHECK(retainedSnapshotBytes({node})==1+30000.*512);node.reset();CHECK(oldBase.expired());
}
HistoryCompareValue comparisonValue(JsonObject row){
 HistoryCompareValue result;const auto kind=text(row,L"kind");using K=HistoryCompareValue::Kind;
 if(kind=="undefined")result.kind=K::Undefined;else if(kind=="null")result.kind=K::Null;else if(kind=="boolean"){result.kind=K::Boolean;result.boolean=row.GetNamedBoolean(L"value");}else if(kind=="number"){result.kind=K::Number;result.number=std::stod(text(row,L"value"));}else if(kind=="string"){result.kind=K::String;const auto value=row.GetNamedString(L"value");for(auto c:value)result.text.push_back(char16_t(c));}
 else if(kind=="view"){result.kind=K::View;Bytes bytes;for(const auto& b:row.GetNamedArray(L"bytes"))bytes.push_back(std::uint8_t(b.GetNumber()));result.view={std::make_shared<const Bytes>(std::move(bytes)),std::size_t(row.GetNamedNumber(L"offset")),std::size_t(row.GetNamedNumber(L"length")),text(row,L"type")};}
 else if(kind=="object")result.kind=K::Object;else if(kind=="array"){result.kind=K::Array;result.arrayLength=std::size_t(row.GetNamedNumber(L"length"));}else {CHECK(kind=="other");result.kind=K::Other;}
 if(row.HasKey(L"identity"))result.identity=std::size_t(row.GetNamedNumber(L"identity"));
 if(row.HasKey(L"properties"))for(const auto& entry:row.GetNamedArray(L"properties")){const auto pair=entry.GetArray();result.properties.emplace_back(winrt::to_string(pair.GetAt(0).GetString()),std::size_t(pair.GetAt(1).GetNumber()));}
 return result;
}
void objectDifferenceChecks(const std::filesystem::path& file){
 const auto data=read(file);const auto rows=JsonArray::Parse(winrt::to_hstring(std::string(data->begin(),data->end())));
 const auto graph=[](JsonObject row){HistoryCompareDocument result;result.root=std::size_t(row.GetNamedNumber(L"root"));for(const auto& value:row.GetNamedArray(L"values"))result.values.push_back(comparisonValue(value.GetObject()));for(const auto& value:row.GetNamedArray(L"layers")){const auto layer=value.GetObject(),origin=layer.GetNamedObject(L"origin");result.layers.push_back({text(layer,L"id"),layer.GetNamedNumber(L"width"),layer.GetNamedNumber(L"x"),layer.GetNamedNumber(L"y"),origin.GetNamedNumber(L"x"),origin.GetNamedNumber(L"y"),layer.GetNamedBoolean(L"runtimeRaster")});}if(row.GetNamedValue(L"activeFrameId").ValueType()!=JsonValueType::Null)result.activeFrameId=text(row,L"activeFrameId");return result;};
 const auto path=[](JsonArray values){std::vector<std::string> result;for(const auto& value:values)result.push_back(winrt::to_string(value.GetString()));return result;};
 const auto equalValue=[](const HistoryCompareValue& actual,const HistoryCompareValue& expected){
  CHECK(actual.kind==expected.kind);using K=HistoryCompareValue::Kind;
  switch(actual.kind){case K::Boolean:CHECK(actual.boolean==expected.boolean);break;case K::Number:CHECK((std::isnan(actual.number)&&std::isnan(expected.number))||(actual.number==expected.number&&(actual.number!=0||std::signbit(actual.number)==std::signbit(expected.number))));break;case K::String:CHECK(actual.text==expected.text);break;case K::View:CHECK(actual.view.type==expected.view.type&&actual.view.length==expected.view.length);CHECK(std::equal(actual.view.buffer->begin()+actual.view.offset,actual.view.buffer->begin()+actual.view.offset+actual.view.length,expected.view.buffer->begin()+expected.view.offset));break;default:break;}
 };
 const auto resources=[&](const std::filesystem::path& source,const HistoryCompareDocument& expected,bool timeline=false,bool recording=false,bool palette=false,bool metadata=false,bool groups=false,std::optional<std::pair<std::u32string,std::u32string>> masks={},bool raster=false,bool layerValues=false,bool complete=false,std::optional<double> expectedCost={}){
  int decodeTicks=0;const auto manifest=source.filename().string().find("document-timestamp-")==0?project::readProjectManifestWithClock(read(source),{},[&]{return "2026-05-06T07:08:09."+std::to_string(100+decodeTicks++)+"Z";}):project::readProjectManifest(read(source));auto document=project::createEditableDocument(project::prepareEditableImport(manifest));
  if(source.filename().string().find("document-timestamp-")==0){const auto raw=JsonObject::Parse(winrt::to_hstring(manifest.manifestUtf8)).GetNamedObject(L"document");int expectedTicks=0;for(const auto* key:{L"createdAt",L"updatedAt"}){const auto value=raw.TryLookup(key);if(!value||value.ValueType()!=JsonValueType::String||value.GetString().empty())++expectedTicks;}CHECK(decodeTicks==expectedTicks);}
  HistoryCompareDocument actual;HistoryCompareValue root;root.kind=HistoryCompareValue::Kind::Object;actual.values.push_back(root);HistoryCompareValue layers;layers.kind=HistoryCompareValue::Kind::Array;actual.values.push_back(layers);actual.values[0].properties.emplace_back("layers",1);
  if(complete){HistoryDecodeContext context{"decoded-runtime-id",{}};if(masks)context.maskNames={masks->first,masks->second};actual=decodedHistoryComparison(document,manifest,context);CHECK(expectedCost);InitialHistoryDocumentCost cost(std::make_shared<const project::ReadManifest>(manifest),document,context);if(cost.bytes(document)!=*expectedCost)throw std::runtime_error("Complete document cost mismatch: "+source.string());}
  else if(layerValues){const auto roots=appendDecodedHistoryRasterValues(actual,document,manifest);actual.values[0].properties[0].second=roots.layers;HistoryCompareValue animation;animation.kind=HistoryCompareValue::Kind::Object;HistoryCompareValue frame;frame.kind=HistoryCompareValue::Kind::String;for(const auto c:winrt::to_hstring(manifest.activeFrameId))frame.text.push_back(char16_t(c));const auto frameIndex=actual.values.size();actual.values.push_back(frame);animation.properties={{"cels",roots.cels},{"activeFrameId",frameIndex}};const auto index=actual.values.size();actual.values.push_back(animation);actual.values[0].properties.emplace_back("animation",index);}
  else if(raster){DecodedHistoryRasterStorage storage(manifest,true);std::vector<const project::ManifestRaster*> rasters;for(const auto& layer:manifest.layers)rasters.push_back(layer.surface.get());for(const auto& cel:manifest.cels)if(cel.surface)rasters.push_back(cel.surface.get());const auto roots=storage.appendComparison(actual,rasters);HistoryCompareValue array;array.kind=HistoryCompareValue::Kind::Array;array.arrayLength=roots.size();const auto owner=actual.values.size();actual.values.push_back(array);for(std::size_t i=0;i<roots.size();++i){HistoryCompareValue value;value.kind=HistoryCompareValue::Kind::Object;value.properties={{"pixels",roots[i].pixels}};if(roots[i].runtimeRaster)value.properties.emplace_back("runtimeRaster",*roots[i].runtimeRaster);const auto index=actual.values.size();actual.values.push_back(value);actual.values[owner].properties.emplace_back(std::to_string(i),index);}actual.values[0].properties.emplace_back("surfaces",owner);}
  else if(groups){const auto root=appendDecodedHistoryGroupValues(actual,document,manifest);actual.values[0].properties.emplace_back("groups",root);}
  else if(masks){const auto roots=appendDecodedHistoryMaskValues(actual,document,masks->first,masks->second);HistoryCompareValue animation;animation.kind=HistoryCompareValue::Kind::Object;animation.properties={{"layerMasks",roots.layerMasks},{"groupMasks",roots.groupMasks}};const auto index=actual.values.size();actual.values.push_back(animation);actual.values[0].properties.emplace_back("animation",index);}
  else if(metadata){const auto root=appendDecodedHistoryMetadataValues(actual,document,manifest,"decoded-runtime-id");const auto fields=actual.values[root].properties;actual.values[0].properties.insert(actual.values[0].properties.end(),fields.begin(),fields.end());}
  else if(palette){const auto roots=appendDecodedHistoryPaletteValues(actual,document,manifest);actual.values[0].properties.insert(actual.values[0].properties.end(),{{"palette",roots.palette},{"paletteOrder",roots.paletteOrder},{"paletteColumns",roots.paletteColumns},{"paletteSlots",roots.paletteSlots},{"nextColorId",roots.nextColorId}});}
  else if(recording){const auto root=appendDecodedHistoryRecordingValues(actual,document);actual.values[0].properties.emplace_back("timelapse",root);}
  else if(timeline){
   const auto roots=appendDecodedHistoryTimelineValues(actual,document);actual.values[0].properties.emplace_back("tilesets",roots.tilesets);
   HistoryCompareValue animation;animation.kind=HistoryCompareValue::Kind::Object;animation.properties={{"frames",roots.frames},{"loopSections",roots.loopSections},{"activeFrameId",roots.activeFrameId},{"loop",roots.loop}};const auto index=actual.values.size();actual.values.push_back(animation);actual.values[0].properties.emplace_back("animation",index);actual.activeFrameId=document.frame().id;
  }else{const auto roots=appendDecodedHistoryResourceValues(actual,document);actual.values[0].properties.emplace_back("customBrushes",roots.customBrushes);actual.values[0].properties.emplace_back("referenceImages",roots.referenceImages);actual.values[0].properties.emplace_back("slices",roots.slices);}
  // Validate values, exact Object.keys order, array lengths and aliases against
  // the actual legacy decoder graph before using the native graph to compile.
  std::vector<std::pair<std::size_t,std::size_t>> tasks{{actual.root,expected.root}};std::map<std::size_t,std::size_t> forward,backward;
  while(!tasks.empty()){const auto [a,b]=tasks.back();tasks.pop_back();const auto& x=actual.values.at(a);const auto& y=expected.values.at(b);CHECK(x.kind==y.kind);
   const bool object=x.kind==HistoryCompareValue::Kind::Object||x.kind==HistoryCompareValue::Kind::Array||x.kind==HistoryCompareValue::Kind::View;
   if(object){if(forward.count(a)||backward.count(b)){CHECK(forward.at(a)==b&&backward.at(b)==a);continue;}forward[a]=b;backward[b]=a;}
   try{equalValue(x,y);}catch(const std::exception& e){throw std::runtime_error("Graph value mismatch "+source.string()+" node "+std::to_string(a)+"/"+std::to_string(b)+": "+e.what());}if(x.arrayLength!=y.arrayLength||x.properties.size()!=y.properties.size()){std::cerr<<"Graph shape mismatch "<<source<<" node "<<a<<"/"<<b<<" length "<<x.arrayLength<<"/"<<y.arrayLength<<" keys ";for(const auto& p:x.properties)std::cerr<<p.first<<",";std::cerr<<" expected ";for(const auto& p:y.properties)std::cerr<<p.first<<",";std::cerr<<"\n";}CHECK(x.arrayLength==y.arrayLength&&x.properties.size()==y.properties.size());
   for(std::size_t i=0;i<x.properties.size();++i){CHECK(x.properties[i].first==y.properties[i].first);tasks.emplace_back(x.properties[i].second,y.properties[i].second);}
  }
  if(layerValues||complete){CHECK(actual.layers.size()==expected.layers.size()&&actual.activeFrameId==expected.activeFrameId);for(std::size_t i=0;i<actual.layers.size();++i){const auto& a=actual.layers[i];const auto& e=expected.layers[i];CHECK(std::tie(a.id,a.width,a.x,a.y,a.originX,a.originY,a.runtimeRaster)==std::tie(e.id,e.width,e.x,e.y,e.originX,e.originY,e.runtimeRaster));}}
  if((complete&&(source.filename().string().find("document-linked-layers-")==0||source.filename().string().find("document-group-normalization-")==0||source.filename().string().find("document-tileset-name-")==0||source.filename().string().find("document-loop-normalize-")==0||source.filename().string().find("document-frame-normalize-")==0||source.filename().string().find("document-cel-normalize-")==0||source.filename().string().find("document-linked-cel")==0))||(!complete&&(recording||groups||masks||(metadata&&manifest.symmetryCenter)))){const auto originalCels=document.timeline().state().cels;const auto originalLayers=document.timeline().state().layers;const auto originalRevision=document.revision();const auto saved=project::encodeHistoryProject(document).bytes;CHECK(document.revision()==originalRevision);for(std::size_t i=0;i<originalCels.size();++i){CHECK(document.timeline().state().cels[i].opacity==originalCels[i].opacity);CHECK(document.timeline().state().cels[i].zIndex==originalCels[i].zIndex);CHECK(document.timeline().state().cels[i].linkedCelId==originalCels[i].linkedCelId);}for(std::size_t i=0;i<originalLayers.size();++i)CHECK(document.timeline().state().layers[i].displayColor==originalLayers[i].displayColor);const auto outputPath=source.parent_path()/(source.stem().string()+"-native-saved.moonsprite");std::ofstream output(outputPath,std::ios::binary);output.write(reinterpret_cast<const char*>(saved->data()),saved->size());CHECK(bool(output));}
  return actual;
 };
 for(const auto& value:rows){const auto row=value.GetObject();auto before=graph(row.GetNamedObject(L"before")),after=graph(row.GetNamedObject(L"after"));
  if(row.HasKey(L"resourceBefore")){const auto directory=file.parent_path()/"local-history-diff-fixtures-archives";before=resources(directory/text(row,L"resourceBefore"),before);after=resources(directory/text(row,L"resourceAfter"),after);}
  if(row.HasKey(L"timelineBefore")){const auto directory=file.parent_path()/"local-history-diff-fixtures-archives";before=resources(directory/text(row,L"timelineBefore"),before,true);after=resources(directory/text(row,L"timelineAfter"),after,true);}
  if(row.HasKey(L"recordingBefore")){const auto directory=file.parent_path()/"local-history-diff-fixtures-archives";before=resources(directory/text(row,L"recordingBefore"),before,false,true);after=resources(directory/text(row,L"recordingAfter"),after,false,true);}
  if(row.HasKey(L"paletteBefore")){const auto directory=file.parent_path()/"local-history-diff-fixtures-archives";before=resources(directory/text(row,L"paletteBefore"),before,false,false,true);after=resources(directory/text(row,L"paletteAfter"),after,false,false,true);}
  if(row.HasKey(L"metadataBefore")){const auto directory=file.parent_path()/"local-history-diff-fixtures-archives";before=resources(directory/text(row,L"metadataBefore"),before,false,false,false,true);after=resources(directory/text(row,L"metadataAfter"),after,false,false,false,true);}
  if(row.HasKey(L"groupBefore")){const auto directory=file.parent_path()/"local-history-diff-fixtures-archives";before=resources(directory/text(row,L"groupBefore"),before,false,false,false,false,true);after=resources(directory/text(row,L"groupAfter"),after,false,false,false,false,true);}
  if(row.HasKey(L"maskBefore")){const auto directory=file.parent_path()/"local-history-diff-fixtures-archives";const auto utf32=[](const std::string& value){return std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.from_bytes(value);};const std::pair<std::u32string,std::u32string> names{utf32(text(row,L"layerMaskName")),utf32(text(row,L"groupMaskName"))};before=resources(directory/text(row,L"maskBefore"),before,false,false,false,false,false,names);after=resources(directory/text(row,L"maskAfter"),after,false,false,false,false,false,names);}
  if(row.HasKey(L"rasterBefore")){const auto directory=file.parent_path()/"local-history-diff-fixtures-archives";before=resources(directory/text(row,L"rasterBefore"),before,false,false,false,false,false,{},true);after=resources(directory/text(row,L"rasterAfter"),after,false,false,false,false,false,{},true);}
  if(row.HasKey(L"layerBefore")){const auto directory=file.parent_path()/"local-history-diff-fixtures-archives";before=resources(directory/text(row,L"layerBefore"),before,false,false,false,false,false,{},false,true);after=resources(directory/text(row,L"layerAfter"),after,false,false,false,false,false,{},false,true);}
  if(row.HasKey(L"documentBefore")){const auto directory=file.parent_path()/"local-history-diff-fixtures-archives";const auto utf32=[](const std::string& value){return std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.from_bytes(value);};const std::pair<std::u32string,std::u32string> names{utf32(text(row,L"layerMaskName")),utf32(text(row,L"groupMaskName"))};before=resources(directory/text(row,L"documentBefore"),before,false,false,false,false,false,names,false,false,true,row.GetNamedNumber(L"beforeTransferBytes"));after=resources(directory/text(row,L"documentAfter"),after,false,false,false,false,false,names,false,false,true,row.GetNamedNumber(L"afterTransferBytes"));}
  const auto result=compareHistoryObjects(before,after);const auto expected=row.GetNamedValue(L"result");
  const auto compiled=compileHistoryGraphs(before,after,text(row,L"name"));
  if(expected.ValueType()==JsonValueType::Null){CHECK(!result&&!compiled);continue;}CHECK(result&&compiled);
  const auto archiveDirectory=file.parent_path()/"local-history-diff-fixtures-archives";const auto name=text(row,L"name");const auto native=encodeDelta(*compiled);const auto legacy=read(archiveDirectory/(name+"-legacy.zip"));project::Archive nativeArchive(native),legacyArchive(legacy);
  CHECK(nativeArchive.entries().size()==legacyArchive.entries().size());
  // Compare JSON structurally (property insertion order is not archive semantics)
  // and every external buffer exactly, then let actual legacy read native ZIPs.
  std::function<bool(IJsonValue,IJsonValue)> jsonEqual=[&](IJsonValue a,IJsonValue b){if(a.ValueType()!=b.ValueType())return false;switch(a.ValueType()){case JsonValueType::Null:return true;case JsonValueType::Boolean:return a.GetBoolean()==b.GetBoolean();case JsonValueType::Number:return a.GetNumber()==b.GetNumber();case JsonValueType::String:return a.GetString()==b.GetString();case JsonValueType::Array:{const auto x=a.GetArray(),y=b.GetArray();if(x.Size()!=y.Size())return false;for(unsigned i=0;i<x.Size();++i)if(!jsonEqual(x.GetAt(i),y.GetAt(i)))return false;return true;}case JsonValueType::Object:{const auto x=a.GetObject(),y=b.GetObject();if(x.Size()!=y.Size())return false;for(const auto& entry:x)if(!y.HasKey(entry.Key())||!jsonEqual(entry.Value(),y.GetNamedValue(entry.Key())))return false;return true;}default:return false;}};
  const auto nativeJson=nativeArchive.read("delta.json",8*1024*1024),legacyJson=legacyArchive.read("delta.json",8*1024*1024);if(!jsonEqual(JsonObject::Parse(winrt::to_hstring(std::string(nativeJson.begin(),nativeJson.end()))),JsonObject::Parse(winrt::to_hstring(std::string(legacyJson.begin(),legacyJson.end())))))throw std::runtime_error("Compiled delta mismatch: "+name+" native="+std::string(nativeJson.begin(),nativeJson.end())+" legacy="+std::string(legacyJson.begin(),legacyJson.end()));
  for(const auto& [key,entry]:legacyArchive.entries())if(key!="delta.json")CHECK(nativeArchive.read(key,1024*1024)==legacyArchive.read(key,1024*1024));
  {std::ofstream output(archiveDirectory/(name+"-native.zip"),std::ios::binary);output.write(reinterpret_cast<const char*>(native->data()),native->size());CHECK(bool(output));}
  const auto portable=decodeDelta(native);CHECK(portable.buffers.size()==compiled->buffers.size());
const auto e=expected.GetObject();if(result->bytes!=e.GetNamedNumber(L"bytes"))throw std::runtime_error("Object comparison byte mismatch: "+text(row,L"name"));CHECK(result->requiresAnimationSelectionNormalization==e.GetNamedBoolean(L"normalize")&&result->affectedLayerIds==path(e.GetNamedArray(L"affected")));
  const auto invalidation=e.GetNamedObject(L"invalidation");CHECK(bool(result->region)==(text(invalidation,L"kind")=="region"));if(result->region){const auto rect=invalidation.GetNamedObject(L"rect");CHECK(result->region->x==rect.GetNamedNumber(L"x")&&result->region->y==rect.GetNamedNumber(L"y")&&result->region->width==rect.GetNamedNumber(L"width")&&result->region->height==rect.GetNamedNumber(L"height"));if(invalidation.HasKey(L"frameId"))CHECK(result->region->frameId==text(invalidation,L"frameId"));else CHECK(!result->region->frameId);}
  const auto origins=e.GetNamedObject(L"origins");for(bool forward:{false,true}){const auto values=origins.GetNamedArray(forward?L"after":L"before");const auto& actual=forward?result->afterOrigins:result->beforeOrigins;CHECK(actual.size()==values.Size());for(unsigned i=0;i<values.Size();++i){const auto point=values.GetAt(i).GetObject();CHECK(actual[i].first==point.GetNamedNumber(L"x")&&actual[i].second==point.GetNamedNumber(L"y"));}}
  const auto patches=e.GetNamedArray(L"patches");CHECK(result->patches.size()==patches.Size());for(unsigned i=0;i<patches.Size();++i){const auto patch=patches.GetAt(i).GetObject();const auto& actual=result->patches[i];CHECK(actual.path==path(patch.GetNamedArray(L"path")));const auto offset=patch.GetNamedValue(L"offset");if(offset.ValueType()==JsonValueType::Null)CHECK(!actual.offset);else CHECK(actual.offset==std::size_t(offset.GetNumber()));const auto aliases=patch.GetNamedValue(L"aliases");if(aliases.ValueType()==JsonValueType::Null)CHECK(!actual.aliases);else{CHECK(actual.aliases&&actual.aliases->size()==aliases.GetArray().Size());for(unsigned j=0;j<aliases.GetArray().Size();++j)CHECK(actual.aliases->at(j)==path(aliases.GetArray().GetAt(j).GetArray()));}equalValue(actual.before,comparisonValue(patch.GetNamedObject(L"before")));equalValue(actual.after,comparisonValue(patch.GetNamedObject(L"after")));}
 }
 HistoryCompareDocument malformed;malformed.root=1;reject([&]{compareHistoryObjects(malformed,malformed);});
 HistoryCompareDocument shallow;HistoryCompareValue root;root.kind=HistoryCompareValue::Kind::Object;root.properties={{"field",1}};shallow.values={root,HistoryCompareValue{}};auto limits=project::Limits{};limits.maxEntries=1;reject([&]{compareHistoryObjects(shallow,shallow,limits);});

}
void resourceValueSafetyChecks(){
 using K=HistoryCompareValue::Kind;
 Document document(4,4);ProjectBrushResource brush;brush.metadata.id="brush";brush.metadata.name="brush";brush.metadata.width=2;brush.metadata.height=1;brush.brush.width=2;brush.brush.height=1;brush.brush.coverage={1,2};brush.brush.colors={0x00123456,0xffabcdef};
 document.setImportedProjectBrushes({brush});auto pixels=std::make_shared<std::vector<Pixel>>(std::initializer_list<Pixel>{0x00123456,0xffabcdef});document.setImportedReferenceImages({{"first",2,1,pixels},{"second",2,1,pixels}});
 HistoryCompareDocument graph;HistoryCompareValue root;root.kind=K::Object;root.properties={{"existing",0}};graph.values.push_back(root);
 const auto roots=appendDecodedHistoryResourceValues(graph,document);
 const auto field=[&](std::size_t owner,const char* key){for(const auto& property:graph.values.at(owner).properties)if(property.first==key)return property.second;throw std::runtime_error("Missing resource field");};
 const auto first=field(roots.referenceImages,"0"),second=field(roots.referenceImages,"1");CHECK(field(first,"pixels")==field(second,"pixels"));
 const auto view=graph.values[field(first,"pixels")].view;CHECK(view.type=="Uint8ClampedArray"&&view.length==8&&view.buffer->at(0)==0x56&&view.buffer->at(3)==0);
 const auto item=field(roots.customBrushes,"0");CHECK(graph.values[field(item,"sourceX")].kind==K::Undefined&&graph.values[field(item,"sourceY")].kind==K::Undefined);CHECK(graph.values[field(item,"colors")].view.type=="Uint32Array");
 const auto revision=document.revision();(*pixels)[0]=0xff000000;document.setImportedProjectBrushes({});CHECK(view.buffer->at(0)==0x56&&view.buffer->at(3)==0&&document.revision()==revision);CHECK(graph.values[field(item,"coverage")].view.buffer->at(0)==1);
 // No pointer-based cross-capture identity: the same native pixel allocation
 // can contain new bytes on a later immutable capture.
 HistoryCompareDocument next;next.values.push_back(root);const auto nextRoots=appendDecodedHistoryResourceValues(next,document);CHECK(graph.values[field(first,"pixels")].identity==0);CHECK(next.values[next.values[nextRoots.referenceImages].properties[0].second].identity==0);
 const auto count=graph.values.size();const auto original=graph.values.front().properties;
 auto tiny=project::Limits{};tiny.maxEntries=count+4;reject([&]{appendDecodedHistoryResourceValues(graph,document,tiny);});CHECK(graph.values.size()==count&&graph.values.front().properties==original);
 tiny=project::Limits{};tiny.expandedBytes=1;reject([&]{appendDecodedHistoryResourceValues(graph,document,tiny);});CHECK(graph.values.size()==count&&graph.values.front().properties==original);
 tiny=project::Limits{};tiny.manifestBytes=1;reject([&]{appendDecodedHistoryResourceValues(graph,document,tiny);});CHECK(graph.values.size()==count&&graph.values.front().properties==original);
 brush.metadata.sourceX=1;document.setImportedProjectBrushes({brush});reject([&]{appendDecodedHistoryResourceValues(graph,document);});CHECK(graph.values.size()==count);
}
void timelineValueSafetyChecks(const std::filesystem::path& directory){
 const auto bytes=read(directory/"timeline-equal-before.moonsprite");
 auto document=project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(bytes)));
 HistoryCompareDocument graph;HistoryCompareValue root;root.kind=HistoryCompareValue::Kind::Object;root.properties={{"existing",0}};graph.values.push_back(root);
 const auto revision=document.revision();const auto roots=appendDecodedHistoryTimelineValues(graph,document);const auto count=graph.values.size();CHECK(document.revision()==revision);
 const auto field=[&](std::size_t owner,const char* key){for(const auto& pair:graph.values.at(owner).properties)if(pair.first==key)return pair.second;throw std::runtime_error("Missing timeline field");};
 const auto set=field(roots.tilesets,"0"),pixels=field(set,"pixels");CHECK(graph.values[pixels].view.type=="Uint8ClampedArray"&&graph.values[pixels].view.buffer->at(3)==0);
 document.setFrameDuration(500);CHECK(graph.values[field(field(roots.frames,"0"),"duration")].number==100);CHECK(graph.values[field(field(roots.loopSections,"0"),"repeatCount")].kind==HistoryCompareValue::Kind::Null);
 auto tiny=project::Limits{};tiny.expandedBytes=graph.values[pixels].view.buffer->size();reject([&]{appendDecodedHistoryTimelineValues(graph,document,tiny);});CHECK(graph.values.size()==count&&graph.values[0].properties==root.properties);
 tiny=project::Limits{};tiny.manifestBytes=1;reject([&]{appendDecodedHistoryTimelineValues(graph,document,tiny);});CHECK(graph.values.size()==count);
 tiny=project::Limits{};tiny.maxEntries=count+3;reject([&]{appendDecodedHistoryTimelineValues(graph,document,tiny);});CHECK(graph.values.size()==count);
 const auto invalid=[&](auto mutate){auto imported=project::prepareEditableImport(project::readProjectManifest(bytes));mutate(imported.timeline);auto changed=project::createEditableDocument(std::move(imported));reject([&]{appendDecodedHistoryTimelineValues(graph,changed);});CHECK(graph.values.size()==count&&graph.values[0].properties==root.properties);};
 invalid([](auto& state){state.tilesets[0].tileSlots={state.tilesets[0].tileIds[0]};});
 invalid([](auto& state){state.tilesets[0].name=U" unnormalized ";});
 invalid([](auto& state){state.loopSections[0].name=U" unnormalized ";});
 invalid([](auto& state){state.loopSections[0].name=std::u32string(65,U'x');});
 invalid([](auto& state){state.loopSections[0].direction="unknown";});
}
void recordingValueSafetyChecks(const std::filesystem::path& directory){
 auto document=project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(read(directory/"recording-score-undefined-after.moonsprite"))));
 CHECK(document.timelapseSettings().snapshots[0].historyChangeScoreUndefined);
 HistoryCompareDocument graph;HistoryCompareValue root;root.kind=HistoryCompareValue::Kind::Object;root.properties={{"existing",0}};graph.values.push_back(root);const auto revision=document.revision();const auto recording=appendDecodedHistoryRecordingValues(graph,document);CHECK(document.revision()==revision);
 const auto field=[&](std::size_t owner,const char* key){for(const auto& pair:graph.values.at(owner).properties)if(pair.first==key)return pair.second;throw std::runtime_error("Missing recording field");};
 const auto frame=field(field(recording,"snapshots"),"0");const auto data=graph.values[field(frame,"data")].view;CHECK(graph.values[field(frame,"changeScore")].kind==HistoryCompareValue::Kind::Undefined&&data.type=="Uint8Array"&&!data.buffer->empty());
 const auto count=graph.values.size();document.mutableTimelapseSettings().snapshots[0].data[0]^=1;CHECK(data.buffer->at(0)==137);
 auto tiny=project::Limits{};tiny.expandedBytes=data.length;reject([&]{appendDecodedHistoryRecordingValues(graph,document,tiny);});CHECK(graph.values.size()==count&&graph.values[0].properties==root.properties);
 tiny=project::Limits{};tiny.maxEntries=count+3;reject([&]{appendDecodedHistoryRecordingValues(graph,document,tiny);});CHECK(graph.values.size()==count);
 tiny=project::Limits{};tiny.manifestBytes=1;reject([&]{appendDecodedHistoryRecordingValues(graph,document,tiny);});CHECK(graph.values.size()==count);
 auto settings=document.timelapseSettings();settings.snapshots[0].elapsedMs=.5;document.setImportedTimelapse(settings);reject([&]{appendDecodedHistoryRecordingValues(graph,document);});CHECK(graph.values.size()==count);
 settings.snapshots[0].elapsedMs=0;settings.quality=timelapse::Quality(999);document.setImportedTimelapse(settings);reject([&]{appendDecodedHistoryRecordingValues(graph,document);});CHECK(graph.values.size()==count);
 auto external=project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(read(directory/"recording-local-key-order-before.moonsprite"))));CHECK(external.timelapseSettings().snapshots[0].historyLocalKeys.front()=="checksum");
 external.mutableTimelapseSettings().snapshots[0].historyLocalKeys={"store"};reject([&]{appendDecodedHistoryRecordingValues(graph,external);});CHECK(graph.values.size()==count);
}
void rasterStorageValueSafetyChecks(const std::filesystem::path& directory){
 const auto manifest=project::readProjectManifest(read(directory/"raster-storage-sparse-two-tiles-after.moonsprite"));DecodedHistoryRasterStorage storage(manifest,true);HistoryCompareDocument graph;std::vector<const project::ManifestRaster*> rasters{manifest.layers[0].surface.get(),manifest.layers[0].surface.get()};const auto roots=storage.appendComparison(graph,rasters);CHECK(roots[0].pixels!=roots[1].pixels&&roots[0].runtimeRaster==roots[1].runtimeRaster);const auto count=graph.values.size();
 auto tiny=project::Limits{};tiny.maxEntries=count+2;reject([&]{storage.appendComparison(graph,rasters,tiny);});CHECK(graph.values.size()==count);
 tiny=project::Limits{};tiny.expandedBytes=1;reject([&]{storage.appendComparison(graph,rasters,tiny);});CHECK(graph.values.size()==count);
 tiny=project::Limits{};tiny.manifestBytes=1;reject([&]{storage.appendComparison(graph,rasters,tiny);});CHECK(graph.values.size()==count);
 reject([&]{storage.appendComparison(graph,{nullptr});});CHECK(graph.values.size()==count);
 DecodedHistoryRasterStorage costOnly(manifest);reject([&]{costOnly.appendComparison(graph,rasters);});CHECK(graph.values.size()==count);
 auto unknown=*manifest.layers[0].surface;unknown.dataFile="missing.rgba";reject([&]{storage.appendComparison(graph,{&unknown});});CHECK(graph.values.size()==count);
 const auto field=[&](std::size_t owner,const char* key){for(const auto& pair:graph.values.at(owner).properties)if(pair.first==key)return pair.second;throw std::runtime_error("Missing sparse field");};
 const auto payload=graph.values[field(*roots[0].runtimeRaster,"data")].view;const auto captured=*payload.buffer;
 auto fresh=storage.appendComparison(graph,rasters);CHECK(*graph.values[field(*fresh[0].runtimeRaster,"data")].view.buffer==captured&&fresh[0].runtimeRaster!=roots[0].runtimeRaster);
 const auto raw=project::readProjectManifest(read(directory/"raster-storage-equal-before.moonsprite"));DecodedHistoryRasterStorage rawStorage(raw,true);const auto rawRoots=rawStorage.appendComparison(graph,{raw.layers[0].surface.get(),raw.layers[0].surface.get()});CHECK(rawRoots[0].pixels==rawRoots[1].pixels&&!rawRoots[0].runtimeRaster);
}
void rasterValueSafetyChecks(const std::filesystem::path& directory){
 const auto manifest=project::readProjectManifest(read(directory/"layers-equal-before.moonsprite"));auto document=project::createEditableDocument(project::prepareEditableImport(manifest));
 HistoryCompareDocument graph;HistoryCompareValue existing;existing.kind=HistoryCompareValue::Kind::Object;existing.properties={{"retained",0}};graph.values.push_back(existing);
 const auto unchanged=[&]{CHECK(graph.values.size()==1&&graph.values[0].properties==existing.properties&&graph.layers.empty()&&!graph.activeFrameId);};
 auto tiny=project::Limits{};tiny.maxEntries=5;reject([&]{appendDecodedHistoryRasterValues(graph,document,manifest,tiny);});unchanged();
 tiny=project::Limits{};tiny.maxEntries=5; // Byte storage succeeds; layer owner construction then fails.
 HistoryCompareDocument probe;DecodedHistoryRasterStorage storage(manifest,true);storage.appendComparison(probe,{manifest.layers[0].surface.get(),manifest.cels[0].surface.get()});tiny.maxEntries=1+probe.values.size()+3;reject([&]{appendDecodedHistoryRasterValues(graph,document,manifest,tiny);});unchanged();
 tiny=project::Limits{};tiny.manifestBytes=1;reject([&]{appendDecodedHistoryRasterValues(graph,document,manifest,tiny);});unchanged();
 tiny=project::Limits{};tiny.expandedBytes=1;reject([&]{appendDecodedHistoryRasterValues(graph,document,manifest,tiny);});unchanged();
 auto changedSource=manifest;changedSource.sourceArchive=std::make_shared<const Bytes>(*manifest.sourceArchive);reject([&]{appendDecodedHistoryRasterValues(graph,document,changedSource);});unchanged();
 const auto stale=[&](auto mutate){auto imported=project::prepareEditableImport(manifest);mutate(imported.timeline);auto changed=project::createEditableDocument(std::move(imported));reject([&]{appendDecodedHistoryRasterValues(graph,changed,manifest);});unchanged();};
 stale([](auto& s){s.layers[0].name=U"Changed";});stale([](auto& s){s.layers[0].description=U"Changed";});stale([](auto& s){s.layers[0].visible=false;});stale([](auto& s){s.layers[0].clippingMask=true;});stale([](auto& s){s.layers[0].layerStyles=timeline::ColorOverlayStyle{};});
 stale([](auto& s){s.cels[0].opacity=.5;});stale([](auto& s){s.cels[0].zIndex=5;});stale([](auto& s){s.cels[0].surface->offsetX++;});stale([](auto& s){s.cels[0].surface->pixels[0]^=1;});
 const auto revision=document.revision();const auto roots=appendDecodedHistoryRasterValues(graph,document,manifest);CHECK(document.revision()==revision&&graph.layers.size()==1&&graph.activeFrameId==manifest.activeFrameId);const auto count=graph.values.size();
 const auto field=[&](std::size_t owner,const char* key){for(const auto& pair:graph.values.at(owner).properties)if(pair.first==key)return pair.second;throw std::runtime_error("Missing raster owner field");};
 const auto layer=field(roots.layers,"0"),cel=field(roots.cels,"0"),surface=field(cel,"surface");CHECK(layer!=surface&&field(layer,"pixels")==field(surface,"pixels")&&graph.values[field(cel,"text")].kind==HistoryCompareValue::Kind::Undefined);const auto pixels=graph.values[field(layer,"pixels")].view;
 reject([&]{appendDecodedHistoryRasterValues(graph,document,manifest);});CHECK(graph.values.size()==count&&graph.layers.size()==1&&graph.activeFrameId==manifest.activeFrameId);
 HistoryCompareDocument fresh;const auto freshRoots=appendDecodedHistoryRasterValues(fresh,document,manifest);const auto freshLayer=fresh.values[freshRoots.layers].properties[0].second;std::size_t freshPixels=0;for(const auto& p:fresh.values[freshLayer].properties)if(p.first=="pixels")freshPixels=p.second;CHECK(fresh.values[freshPixels].view.buffer!=pixels.buffer&&*fresh.values[freshPixels].view.buffer==*pixels.buffer);
 const auto linked=project::readProjectManifest(read(directory/"layers-linked-active-after.moonsprite"));auto linkedDocument=project::createEditableDocument(project::prepareEditableImport(linked));HistoryCompareDocument linkGraph;appendDecodedHistoryRasterValues(linkGraph,linkedDocument,linked);linkedDocument.selectFrame(linked.frames[0].id);HistoryCompareDocument rejected;reject([&]{appendDecodedHistoryRasterValues(rejected,linkedDocument,linked);});CHECK(rejected.values.empty()&&rejected.layers.empty()&&!rejected.activeFrameId);
 auto sparseManifest=project::readProjectManifest(read(directory/"layers-sparse-equal-after.moonsprite"));auto sparseDocument=project::createEditableDocument(project::prepareEditableImport(sparseManifest));HistoryCompareDocument sparseGraph;const auto sparseRoots=appendDecodedHistoryRasterValues(sparseGraph,sparseDocument,sparseManifest);CHECK(sparseGraph.layers[0].runtimeRaster);CHECK(!compileHistoryGraphs(sparseGraph,sparseGraph,"sparse structural gate"));
}
void linkedLayerValueSafetyChecks(const std::filesystem::path& directory){
 const auto manifest=project::readProjectManifest(read(directory/"document-linked-layers-equal-after.moonsprite"));auto document=project::createEditableDocument(project::prepareEditableImport(manifest));
 const auto stale=[&](auto mutate){auto imported=project::prepareEditableImport(manifest);mutate(imported.timeline);auto changed=project::createEditableDocument(std::move(imported));HistoryCompareDocument graph;reject([&]{appendDecodedHistoryRasterValues(graph,changed,manifest);});CHECK(graph.values.empty()&&graph.layers.empty()&&!graph.activeFrameId);};
 stale([](auto& s){s.layers[0].linkedContentId="changed";});stale([](auto& s){s.layers[0].description=U"Changed";});stale([](auto& s){s.layers[0].displayColor=0xff123456;});stale([](auto& s){s.cels[0].surface->offsetX++;});
 HistoryCompareDocument graph;const auto revision=document.revision();const auto roots=appendDecodedHistoryRasterValues(graph,document,manifest);CHECK(document.revision()==revision);
 const auto field=[&](std::size_t owner,const char* key){for(const auto& p:graph.values.at(owner).properties)if(p.first==key)return p.second;throw std::runtime_error("Missing linked comparison field");};
 const auto first=field(roots.layers,"0"),second=field(roots.layers,"1");CHECK(first!=second&&field(first,"pixels")==field(second,"pixels"));CHECK(graph.values[field(first,"linkedContentId")].text==u"linked-content");
 auto tiny=project::Limits{};tiny.maxEntries=5;HistoryCompareDocument failed;reject([&]{appendDecodedHistoryRasterValues(failed,document,manifest,tiny);});CHECK(failed.values.empty()&&failed.layers.empty()&&!failed.activeFrameId);
}
void freeTileValueSafetyChecks(const std::filesystem::path& directory){
 const auto manifest=project::readProjectManifest(read(directory/"document-free-source-after.moonsprite"));auto document=project::createEditableDocument(project::prepareEditableImport(manifest));
 const auto stale=[&](auto mutate){auto imported=project::prepareEditableImport(manifest);mutate(imported.timeline);auto changed=project::createEditableDocument(std::move(imported));HistoryCompareDocument graph;reject([&]{appendDecodedHistoryRasterValues(graph,changed,manifest);});CHECK(graph.values.empty()&&graph.layers.empty()&&!graph.activeFrameId);};
 stale([](auto& s){s.cels[0].freeTiles->instances[0].x++;});stale([](auto& s){s.cels[0].freeTiles->instances[0].opacity=.2;});stale([](auto& s){s.layers[0].freeTiles->sources[0].name="Changed";});stale([](auto& s){s.layers[0].freeTiles->sources[0].offsetX++;});stale([](auto& s){s.tilesets[0].pixels[0]^=1;});
 HistoryCompareDocument graph;const auto revision=document.revision();const auto roots=appendDecodedHistoryRasterValues(graph,document,manifest);CHECK(document.revision()==revision);
 const auto field=[&](std::size_t owner,const char* key){for(const auto& p:graph.values.at(owner).properties)if(p.first==key)return p.second;throw std::runtime_error("Missing free tile comparison field");};
 const auto layer=field(roots.layers,"0"),surface=field(field(roots.cels,"0"),"surface");CHECK(field(layer,"pixels")==field(surface,"pixels"));for(const auto& p:graph.values[surface].properties)CHECK(p.first!="storageOriginX"&&p.first!="runtimeRaster");
 auto tiny=project::Limits{};tiny.expandedBytes=1;HistoryCompareDocument failed;reject([&]{appendDecodedHistoryRasterValues(failed,document,manifest,tiny);});CHECK(failed.values.empty()&&failed.layers.empty()&&!failed.activeFrameId);
 tiny=project::Limits{};tiny.maxEntries=5;reject([&]{appendDecodedHistoryRasterValues(failed,document,manifest,tiny);});CHECK(failed.values.empty());
}
void tilemapValueSafetyChecks(const std::filesystem::path& directory){
 const auto manifest=project::readProjectManifest(read(directory/"document-tilemap-cell-after.moonsprite"));auto document=project::createEditableDocument(project::prepareEditableImport(manifest));
 const auto stale=[&](const char* name,auto mutate){auto imported=project::prepareEditableImport(manifest);mutate(imported.timeline);auto changed=project::createEditableDocument(std::move(imported));HistoryCompareDocument graph;bool rejected=false;try{appendDecodedHistoryRasterValues(graph,changed,manifest);}catch(const std::exception&){rejected=true;}if(!rejected)throw std::runtime_error(std::string("Tilemap stale accepted: ")+name);CHECK(graph.values.empty()&&graph.layers.empty()&&!graph.activeFrameId);};
 stale("cell",[](auto& s){s.cels[0].tilemap->cells[0].reset();});stale("rotation",[](auto& s){s.cels[0].tilemap->cells[0]->rotation=2;});stale("pixels",[](auto& s){s.tilesets[0].pixels[0]^=1;});
 HistoryCompareDocument graph;const auto revision=document.revision();const auto roots=appendDecodedHistoryRasterValues(graph,document,manifest);CHECK(document.revision()==revision);
 const auto field=[&](std::size_t owner,const char* key){for(const auto& p:graph.values.at(owner).properties)if(p.first==key)return p.second;throw std::runtime_error("Missing tilemap comparison field");};
 const auto layer=field(roots.layers,"0"),surface=field(field(roots.cels,"0"),"surface");CHECK(field(layer,"pixels")==field(surface,"pixels"));for(const auto& p:graph.values[surface].properties)CHECK(p.first!="storageOriginX"&&p.first!="runtimeRaster");
 auto tiny=project::Limits{};tiny.expandedBytes=1;HistoryCompareDocument failed;reject([&]{appendDecodedHistoryRasterValues(failed,document,manifest,tiny);});CHECK(failed.values.empty()&&failed.layers.empty()&&!failed.activeFrameId);
}
void textValueSafetyChecks(const std::filesystem::path& directory){
 const auto manifest=project::readProjectManifest(read(directory/"document-text-transform-extension-after.moonsprite"));
 auto document=project::createEditableDocument(project::prepareEditableImport(manifest));
 HistoryCompareDocument graph;HistoryCompareValue retained;retained.kind=HistoryCompareValue::Kind::Object;retained.properties={{"retained",0}};graph.values.push_back(retained);
 const auto unchanged=[&]{CHECK(graph.values.size()==1&&graph.values[0].properties==retained.properties&&graph.layers.empty()&&!graph.activeFrameId);};
 const auto stale=[&](auto mutate){auto imported=project::prepareEditableImport(manifest);mutate(*imported.timeline.cels[0].text);auto changed=project::createEditableDocument(std::move(imported));reject([&]{appendDecodedHistoryRasterValues(graph,changed,manifest);});unchanged();};
 stale([](auto& t){t.text+=u"changed";});stale([](auto& t){t.fontFamily="Other font";});stale([](auto& t){t.fontSize++;});stale([](auto& t){t.color^=1;});stale([](auto& t){t.originX=7;});stale([](auto& t){t.transforms[0].source.projectProperties=u"{}";});stale([](auto& t){t.transforms[0].target.x++;});stale([](auto& t){t.transforms[0].angle++;});stale([](auto& t){t.transforms[0].shear->amount++;});
 auto tiny=project::Limits{};tiny.maxEntries=5;reject([&]{appendDecodedHistoryRasterValues(graph,document,manifest,tiny);});unchanged();
 tiny=project::Limits{};tiny.manifestBytes=10;reject([&]{appendDecodedHistoryRasterValues(graph,document,manifest,tiny);});unchanged();
 const auto revision=document.revision();appendDecodedHistoryRasterValues(graph,document,manifest);CHECK(document.revision()==revision);
 const auto captured=graph.values;auto imported=project::prepareEditableImport(manifest);imported.timeline.cels[0].text->text=u"Later edit";auto edited=project::createEditableDocument(std::move(imported));HistoryCompareDocument rejected;reject([&]{appendDecodedHistoryRasterValues(rejected,edited,manifest);});CHECK(rejected.values.empty()&&graph.values.size()==captured.size());
 for(std::size_t i=0;i<captured.size();++i)CHECK(graph.values[i].text==captured[i].text&&graph.values[i].properties==captured[i].properties);
}
void documentGraphSafetyChecks(const std::filesystem::path& directory){
 const auto manifest=project::readProjectManifest(read(directory/"document-combined-after.moonsprite"));auto document=project::createEditableDocument(project::prepareEditableImport(manifest));
 const HistoryDecodeContext context{"runtime-comparison-document",{U"Mask",U"Group mask"}};const auto revision=document.revision(),history=document.historySize();const auto graph=decodedHistoryComparison(document,manifest,context);
 CHECK(document.revision()==revision&&document.historySize()==history&&graph.values[graph.root].kind==HistoryCompareValue::Kind::Object);
 const auto field=[](const HistoryCompareDocument& g,std::size_t owner,const char* key){for(const auto& p:g.values.at(owner).properties)if(p.first==key)return p.second;throw std::runtime_error("Missing complete document field");};
 CHECK(graph.values[graph.root].properties.front().first=="schemaVersion"&&graph.values[graph.root].properties.back().first=="layerPanelState");
 auto otherContext=context;otherContext.documentId="different-runtime-id";const auto other=decodedHistoryComparison(document,manifest,otherContext);const auto equal=compareHistoryObjects(graph,other);CHECK(equal&&equal->patches.empty()&&equal->bytes==0);CHECK(compileHistoryGraphs(graph,other,"separate captures"));
 const auto pixels=field(graph,field(graph,field(graph,graph.root,"layers"),"0"),"pixels");const auto otherPixels=field(other,field(other,field(other,other.root,"layers"),"0"),"pixels");CHECK(graph.values[pixels].view.buffer!=other.values[otherPixels].view.buffer);
 std::size_t bytes=0,units=0;std::unordered_set<const Bytes*> buffers;for(const auto& value:graph.values){if(value.kind==HistoryCompareValue::Kind::String)units+=value.text.size();if(value.kind==HistoryCompareValue::Kind::View&&buffers.insert(value.view.buffer.get()).second)bytes+=value.view.buffer->size();}
 const auto rejects=[&](const project::ReadManifest& source,const HistoryDecodeContext& decode,project::Limits limits){reject([&]{decodedHistoryComparison(document,source,decode,limits);});CHECK(document.revision()==revision&&document.historySize()==history);};
 auto tiny=project::Limits{};tiny.maxEntries=graph.values.size()-1;rejects(manifest,context,tiny);
 tiny=project::Limits{};tiny.expandedBytes=bytes-1;rejects(manifest,context,tiny);
 tiny=project::Limits{};tiny.manifestBytes=2*(units-1);rejects(manifest,context,tiny);
 auto missing=context;missing.documentId.clear();rejects(manifest,missing,{});missing=context;missing.maskNames.layer.clear();rejects(manifest,missing,{});missing=context;missing.maskNames.group.clear();rejects(manifest,missing,{});
 auto changed=manifest;changed.sourceArchive=std::make_shared<const Bytes>(*manifest.sourceArchive);rejects(changed,context,{});
 const auto image=field(graph,field(graph,field(graph,graph.root,"referenceImages"),"0"),"pixels");const auto imageBytes=*graph.values[image].view.buffer;auto edited=document.referenceImages();auto changedPixels=std::make_shared<std::vector<Pixel>>(*edited[0].pixels);(*changedPixels)[0]^=1;edited[0].pixels=changedPixels;document.setImportedReferenceImages(std::move(edited));CHECK(*graph.values[image].view.buffer==imageBytes);
 // A failed later capture must not invalidate an already returned immutable graph.
 document.setPixelGrid(!document.showPixelGrid(),false);reject([&]{decodedHistoryComparison(document,manifest,context);});CHECK(*graph.values[image].view.buffer==imageBytes&&graph.values[graph.root].properties.back().first=="layerPanelState");
}
void groupMaskValueSafetyChecks(const std::filesystem::path& directory){
 const auto manifest=project::readProjectManifest(read(directory/"groups-style-full-after.moonsprite"));auto document=project::createEditableDocument(project::prepareEditableImport(manifest));HistoryCompareDocument graph;const auto revision=document.revision();appendDecodedHistoryGroupValues(graph,document,manifest);CHECK(document.revision()==revision);const auto count=graph.values.size();
 auto tiny=project::Limits{};tiny.maxEntries=count+5;reject([&]{appendDecodedHistoryGroupValues(graph,document,manifest,tiny);});CHECK(graph.values.size()==count);
 tiny=project::Limits{};tiny.manifestBytes=1;reject([&]{appendDecodedHistoryGroupValues(graph,document,manifest,tiny);});CHECK(graph.values.size()==count);
 CHECK(!document.timeline().state().groups[0].parentGroupIdPresent&&document.timeline().state().groups[1].parentGroupIdPresent);
 document.setGroupVisible("group-one",false);reject([&]{appendDecodedHistoryGroupValues(graph,document,manifest);});CHECK(graph.values.size()==count);
 document.undo();CHECK(!document.timeline().state().groups[0].parentGroupIdPresent);document.redo();CHECK(!document.timeline().state().groups[0].parentGroupIdPresent);
 auto moving=project::createEditableDocument(project::prepareEditableImport(manifest));
 const auto lifecycleBytes=read(directory.parent_path()/"local-history-diff-fixtures-group-lifecycle.json");const auto lifecycle=JsonArray::Parse(winrt::to_hstring(std::string(lifecycleBytes->begin(),lifecycleBytes->end())));CHECK(lifecycle.Size()==4);
 const auto observe=[&](unsigned step){const auto expected=lifecycle.GetAt(step).GetArray();const auto& groups=moving.timeline().state().groups;CHECK(groups.size()==expected.Size());for(std::size_t i=0;i<groups.size();++i){const auto row=expected.GetAt(unsigned(i)).GetObject();CHECK(groups[i].id==text(row,L"id")&&groups[i].parentGroupIdPresent==row.GetNamedBoolean(L"parentPresent"));const auto parent=row.GetNamedValue(L"parent");CHECK(groups[i].parentGroupId.value_or("")==(parent.ValueType()==JsonValueType::Null?std::string{}:winrt::to_string(parent.GetString())));}};
 observe(0);moving.restoreTimelineRowSelection({}, {"group-two"});CHECK(moving.moveLayerPanelRows({LayerPanelDropTarget::Kind::Top,LayerPanelKind::Group,{}}));observe(1);moving.undo();observe(2);moving.redo();observe(3);
 const auto emptyParentManifest=project::readProjectManifest(read(directory/"groups-empty-parent-gated.moonsprite"));const auto emptyParentDocument=project::createEditableDocument(project::prepareEditableImport(emptyParentManifest));reject([&]{appendDecodedHistoryGroupValues(graph,emptyParentDocument,emptyParentManifest);});CHECK(graph.values.size()==count);

 {const auto bytes=project::encodeHistoryProject(moving).bytes;project::Archive archive(bytes);const auto raw=archive.read("manifest.json",project::Limits{}.manifestBytes);const auto saved=JsonObject::Parse(winrt::to_hstring(std::string(raw.begin(),raw.end()))).GetNamedObject(L"document").GetNamedArray(L"groups");for(const auto& value:saved)CHECK(value.GetObject().HasKey(L"parentGroupId"));}
 const auto maskManifest=project::readProjectManifest(read(directory/"masks-two-independent-after.moonsprite"));auto masked=project::createEditableDocument(project::prepareEditableImport(maskManifest));const auto roots=appendDecodedHistoryMaskValues(graph,masked,U"Mask locale",U"Group locale");const auto maskCount=graph.values.size();
 const auto field=[&](std::size_t owner,const char* key){for(const auto& pair:graph.values.at(owner).properties)if(pair.first==key)return pair.second;throw std::runtime_error("Missing mask field");};
 const auto first=field(field(roots.layerMasks,"0"),"mask"),second=field(field(roots.layerMasks,"1"),"mask");const auto firstPixels=graph.values[field(first,"pixels")].view,secondPixels=graph.values[field(second,"pixels")].view;CHECK(firstPixels.buffer!=secondPixels.buffer&&*firstPixels.buffer==*secondPixels.buffer);
 reject([&]{appendDecodedHistoryMaskValues(graph,masked,U"",U"Group");});CHECK(graph.values.size()==maskCount);
 tiny=project::Limits{};tiny.expandedBytes=firstPixels.length;reject([&]{appendDecodedHistoryMaskValues(graph,masked,U"Mask",U"Group",tiny);});CHECK(graph.values.size()==maskCount);
 tiny=project::Limits{};tiny.maxEntries=maskCount+5;reject([&]{appendDecodedHistoryMaskValues(graph,masked,U"Mask",U"Group",tiny);});CHECK(graph.values.size()==maskCount);
 tiny=project::Limits{};tiny.manifestBytes=1;reject([&]{appendDecodedHistoryMaskValues(graph,masked,U"Mask",U"Group",tiny);});CHECK(graph.values.size()==maskCount);
 const auto invalid=[&](auto mutate){auto imported=project::prepareEditableImport(maskManifest);mutate(imported.timeline.masks[0].mask);auto changed=project::createEditableDocument(std::move(imported));reject([&]{appendDecodedHistoryMaskValues(graph,changed,U"Mask",U"Group");});CHECK(graph.values.size()==maskCount);};
 invalid([](auto& mask){mask.visible=false;});invalid([](auto& mask){mask.moveWithOwner=false;});invalid([](auto& mask){mask.surface.pixels[0]=0x80123456;});
 auto imported=project::prepareEditableImport(maskManifest);imported.timeline.masks[0].mask.surface.pixels[0]=0xff777777;auto changed=project::createEditableDocument(std::move(imported));appendDecodedHistoryMaskValues(graph,changed,U"Mask",U"Group");CHECK(firstPixels.buffer->at(0)==0&&secondPixels.buffer->at(0)==0);
}
void metadataValueSafetyChecks(const std::filesystem::path& directory){
 const auto manifest=project::readProjectManifest(read(directory/"metadata-center-outside-after.moonsprite"));auto document=project::createEditableDocument(project::prepareEditableImport(manifest));
 CHECK(document.symmetryCenter().x==-12.75&&document.symmetryCenter().y==99.1);const auto revision=document.revision();HistoryCompareDocument graph;const auto root=appendDecodedHistoryMetadataValues(graph,document,manifest,"runtime-id");const auto count=graph.values.size();CHECK(document.revision()==revision);
 auto tiny=project::Limits{};tiny.maxEntries=count+3;reject([&]{appendDecodedHistoryMetadataValues(graph,document,manifest,"runtime-id",tiny);});CHECK(graph.values.size()==count);
 tiny=project::Limits{};tiny.manifestBytes=1;reject([&]{appendDecodedHistoryMetadataValues(graph,document,manifest,"runtime-id",tiny);});CHECK(graph.values.size()==count);
 auto changed=manifest;changed.sourceArchive=std::make_shared<const Bytes>(*manifest.sourceArchive);reject([&]{appendDecodedHistoryMetadataValues(graph,document,changed,"runtime-id");});CHECK(graph.values.size()==count);
 reject([&]{appendDecodedHistoryMetadataValues(graph,document,manifest,"");});CHECK(graph.values.size()==count);
 const auto originalInformation=document.projectInformation();auto information=originalInformation;information.operationCount++;document.setImportedProjectInformation(information);reject([&]{appendDecodedHistoryMetadataValues(graph,document,manifest,"runtime-id");});CHECK(graph.values.size()==count);document.setImportedProjectInformation(originalInformation);
 document.setPixelGrid(!manifest.showPixelGrid,false);reject([&]{appendDecodedHistoryMetadataValues(graph,document,manifest,"runtime-id");});CHECK(graph.values.size()==count);document.setPixelGrid(manifest.showPixelGrid,false);
 document.setImportedSymmetryCenter({1,2});reject([&]{appendDecodedHistoryMetadataValues(graph,document,manifest,"runtime-id");});CHECK(graph.values.size()==count);
 // Tool interaction still quantizes/clamps; only project decoding bypasses it.
 document.setSymmetryCenter({-12.75,99.1},false);CHECK(document.symmetryCenter().x==0&&document.symmetryCenter().y==8);
 reject([&]{document.setImportedSymmetryCenter({std::numeric_limits<double>::infinity(),0});});
 document.setImportedSymmetryCenter({manifest.symmetryCenter->first,manifest.symmetryCenter->second});
 for(const auto key:{L"createdAt",L"updatedAt"}){auto changed=manifest;auto json=JsonObject::Parse(winrt::to_hstring(changed.manifestUtf8));json.GetNamedObject(L"document").Remove(key);changed.manifestUtf8=winrt::to_string(json.Stringify());changed.information.createdAt.clear();reject([&]{appendDecodedHistoryMetadataValues(graph,document,changed,"runtime-id");});CHECK(graph.values.size()==count);}
 auto noCenterManifest=project::readProjectManifest(read(directory/"metadata-equal-before.moonsprite"));auto noCenter=project::createEditableDocument(project::prepareEditableImport(noCenterManifest));noCenter.setImportedSymmetryCenter({1,2});reject([&]{appendDecodedHistoryMetadataValues(graph,noCenter,noCenterManifest,"runtime-id");});CHECK(graph.values.size()==count);
 CHECK(!graph.values[root].properties.empty());
}
void paletteValueSafetyChecks(const std::filesystem::path& directory){
 const auto manifest=project::readProjectManifest(read(directory/"palette-equal-before.moonsprite"));auto document=project::createEditableDocument(project::prepareEditableImport(manifest));
 HistoryCompareDocument graph;const auto revision=document.revision();appendDecodedHistoryPaletteValues(graph,document,manifest);CHECK(document.revision()==revision);const auto count=graph.values.size();
 auto tiny=project::Limits{};tiny.maxEntries=count+2;reject([&]{appendDecodedHistoryPaletteValues(graph,document,manifest,tiny);});CHECK(graph.values.size()==count);
 tiny=project::Limits{};tiny.manifestBytes=1;reject([&]{appendDecodedHistoryPaletteValues(graph,document,manifest,tiny);});CHECK(graph.values.size()==count);
 auto changed=manifest;changed.paletteOrder={2,1};CHECK(project::prepareEditablePalette(changed).order==changed.paletteOrder);reject([&]{appendDecodedHistoryPaletteValues(graph,document,changed);});CHECK(graph.values.size()==count);
 changed=manifest;changed.sourceArchive=std::make_shared<const Bytes>(*manifest.sourceArchive);reject([&]{appendDecodedHistoryPaletteValues(graph,document,changed);});CHECK(graph.values.size()==count);
 changed=manifest;const auto token=changed.manifestUtf8.find("\"color\":{");CHECK(token!=std::string::npos);changed.manifestUtf8.insert(token+9,"\"extra\":1,");reject([&]{appendDecodedHistoryPaletteValues(graph,document,changed);});CHECK(graph.values.size()==count);
 document.renamePaletteColor(1,U"changed");reject([&]{appendDecodedHistoryPaletteValues(graph,document,manifest);});CHECK(graph.values.size()==count);
}
void byteDifferenceChecks(const std::filesystem::path& file){
 const auto bytes=read(file);const auto rows=JsonArray::Parse(winrt::to_hstring(std::string(bytes->begin(),bytes->end())));
 const auto view=[](JsonObject row,const std::string& type,std::size_t length){Bytes buffer;for(const auto& byte:row.GetNamedArray(L"bytes"))buffer.push_back(std::uint8_t(byte.GetNumber()));return HistoryByteView{std::make_shared<const Bytes>(std::move(buffer)),std::size_t(row.GetNamedNumber(L"offset")),length,type};};
 for(const auto& value:rows){const auto row=value.GetObject();const auto a=view(row.GetNamedObject(L"a"),text(row,L"type"),std::size_t(row.GetNamedNumber(L"length"))),b=view(row.GetNamedObject(L"b"),text(row,L"otherType"),std::size_t(row.GetNamedNumber(L"afterLength")));
  const auto result=compareHistoryByteViews(a,b);const auto expected=row.GetNamedValue(L"result");if(expected.ValueType()==JsonValueType::Null){CHECK(!result);continue;}
  const auto object=expected.GetObject();const auto patches=object.GetNamedArray(L"patches");CHECK(result&&result->bytes==object.GetNamedNumber(L"bytes")&&result->patches.size()==patches.Size());
  CHECK(result->replacement==(a.length!=b.length));Bytes applied(a.buffer->begin()+a.offset,a.buffer->begin()+a.offset+a.length);
  for(unsigned i=0;i<patches.Size();++i){const auto patch=patches.GetAt(i).GetObject();const auto offset=patch.GetNamedValue(L"offset");const auto& actual=result->patches[i];if(offset.ValueType()==JsonValueType::Null)CHECK(!actual.offset);else CHECK(actual.offset==std::size_t(offset.GetNumber()));
   for(bool after:{false,true}){const auto wanted=patch.GetNamedArray(after?L"after":L"before");const auto& data=*(after?actual.after:actual.before);CHECK(data.size()==wanted.Size());for(unsigned n=0;n<wanted.Size();++n)CHECK(data[n]==wanted.GetAt(n).GetNumber());}
   if(actual.offset)std::copy(actual.after->begin(),actual.after->end(),applied.begin()+*actual.offset);else applied=*actual.after;
  }CHECK(applied==Bytes(b.buffer->begin()+b.offset,b.buffer->begin()+b.offset+b.length));
 }
 HistoryByteView a{std::make_shared<const Bytes>(Bytes{1,2}),0,2,"Uint8Array"},b{std::make_shared<const Bytes>(Bytes{1,3}),0,2,"Uint8Array"};auto tiny=project::Limits{};tiny.expandedBytes=1;reject([&]{compareHistoryByteViews(a,b,tiny);});auto invalid=a;invalid.offset=3;reject([&]{compareHistoryByteViews(invalid,b);});
}
void productionEncodingChecks(){
 auto node=Node::document(Document(3,2),[](const Document&){return 1.;});const auto revision=node->document().revision();const auto content=node->document().canvasPixels();
 const auto bytes=encodeJournalSnapshot(node);project::Archive archive(bytes);CHECK(!archive.entries().count("preview.png")&&archive.entries().at("manifest.json").method==8);
 const auto decoded=project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(bytes)));CHECK(decoded.canvasPixels()==content&&node->document().canvasPixels()==content&&node->document().revision()==revision&&node->document().historySize()==0);
 Document recorded(1,1);timelapse::Settings recording;recording.enabled=true;timelapse::Frame frame;frame.id="history-recording-frame";frame.width=1;frame.height=1;frame.data=encodeRgbaImagePng(1,1,{0xff112233}).png;recording.snapshots.push_back(frame);recorded.setImportedTimelapse(recording);
 const auto recordedNode=Node::document(std::move(recorded),[](const Document&){return 1.;});const auto recordedBytes=encodeJournalSnapshot(recordedNode);project::Archive recordingArchive(recordedBytes);
 CHECK(recordingArchive.entries().at("timelapse/history-recording-frame.png").method==0&&recordingArchive.read("timelapse/history-recording-frame.png",1024)==frame.data&&!recordingArchive.entries().count("preview.png"));
 auto restoredRecording=project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(recordedBytes)));CHECK(restoredRecording.timelapseSettings().snapshots.size()==1&&restoredRecording.timelapseSettings().snapshots.front().data==frame.data);
 auto packed=Node::archive(bytes);CHECK(encodeJournalSnapshot(packed)==bytes);reject([&]{encodeJournalSnapshot({});});auto tiny=project::Limits{};tiny.archiveBytes=1;reject([&]{encodeJournalSnapshot(node,tiny);});
 Delta malformed;malformed.json=R"({"bytes":0,"patches":[{"path":["unported"],"before":0,"after":1}],"origins":{"before":[],"after":[]}})";reject([&]{PixelHistory::materialize(Node::increment(node,malformed));});CHECK(node->document().canvasPixels()==content);
}
int wmain(int argc,wchar_t** argv){try{
 Apartment apartment;CHECK(argc==2);const std::filesystem::path root=argv[1];std::ifstream file(root/"compiled-latest.txt");std::string run;file>>run;CHECK(run.rfind("run-",0)==0&&run.find_first_not_of("0123456789",4)==std::string::npos);
 objectDifferenceChecks(root.parent_path()/"local-history-diff-fixtures-objects.json");resourceValueSafetyChecks();timelineValueSafetyChecks(root.parent_path()/"local-history-diff-fixtures-archives");recordingValueSafetyChecks(root.parent_path()/"local-history-diff-fixtures-archives");rasterStorageValueSafetyChecks(root.parent_path()/"local-history-diff-fixtures-archives");rasterValueSafetyChecks(root.parent_path()/"local-history-diff-fixtures-archives");linkedLayerValueSafetyChecks(root.parent_path()/"local-history-diff-fixtures-archives");freeTileValueSafetyChecks(root.parent_path()/"local-history-diff-fixtures-archives");tilemapValueSafetyChecks(root.parent_path()/"local-history-diff-fixtures-archives");textValueSafetyChecks(root.parent_path()/"local-history-diff-fixtures-archives");documentGraphSafetyChecks(root.parent_path()/"local-history-diff-fixtures-archives");groupMaskValueSafetyChecks(root.parent_path()/"local-history-diff-fixtures-archives");metadataValueSafetyChecks(root.parent_path()/"local-history-diff-fixtures-archives");paletteValueSafetyChecks(root.parent_path()/"local-history-diff-fixtures-archives");byteDifferenceChecks(root.parent_path()/"local-history-diff-fixtures.json");productionEncodingChecks();referenceChecks(root/run/"compiled-budget");sessionChecks(root/run/"compiled-session");nativeSessionChecks();historyEventChecks(root/run/"compiled-session");encodingCacheChecks();transitionCacheChecks();acknowledgementLifetimeChecks();lifetimeChecks(decodeDelta(read(root/run/"compiled-budget"/"delta-1.zip")));std::cout<<"Actual legacy snapshot graph accounting/rebase, 120-edit trim, immutable generations, failure and long-chain lifetime checks passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
