#define NOMINMAX
#include "local_history_cost.h"
#include "local_history_resource_cost.h"
#include "local_history_raster_cost.h"
#include "document.h"
#include "document_snapshot.h"
#include "project_import.h"
#include "project_encode.h"
#include "text_project_json.h"
#include "tilemap_project_json.h"
#include "free_tile_project_json.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <roapi.h>
#ifdef GetObject
#undef GetObject
#endif
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <codecvt>
#include <locale>
#define CHECK(v) do{if(!(v))throw std::runtime_error("History cost check failed: " #v);}while(0)
using namespace moon::local_history;
using namespace winrt::Windows::Data::Json;
using Kind=HistoryCostValue::Kind;
void sameJson(const IJsonValue& actual,const IJsonValue& expected){
 std::vector<std::pair<IJsonValue,IJsonValue>> pending{{actual,expected}};while(!pending.empty()){const auto [a,e]=pending.back();pending.pop_back();CHECK(a.ValueType()==e.ValueType());switch(a.ValueType()){
 case JsonValueType::String:CHECK(a.GetString()==e.GetString());break;case JsonValueType::Number:CHECK(a.GetNumber()==e.GetNumber());break;case JsonValueType::Boolean:CHECK(a.GetBoolean()==e.GetBoolean());break;
 case JsonValueType::Array:{const auto x=a.GetArray(),y=e.GetArray();CHECK(x.Size()==y.Size());for(unsigned i=0;i<x.Size();++i)pending.emplace_back(x.GetAt(i),y.GetAt(i));break;}
 case JsonValueType::Object:{const auto x=a.GetObject(),y=e.GetObject();CHECK(x.Size()==y.Size());for(const auto& field:y){CHECK(x.HasKey(field.Key()));pending.emplace_back(x.GetNamedValue(field.Key()),field.Value());}break;}
 default:break;}}
}
std::shared_ptr<const moon::project::Bytes> read(const std::filesystem::path& path){std::ifstream f(path,std::ios::binary);CHECK(bool(f));return std::make_shared<const moon::project::Bytes>(std::istreambuf_iterator<char>(f),std::istreambuf_iterator<char>());}
JsonArray array(const std::filesystem::path& path){const auto bytes=read(path);return JsonArray::Parse(winrt::to_hstring(std::string(bytes->begin(),bytes->end())));}
struct Apartment {HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);Apartment(){CHECK(SUCCEEDED(status)||status==RPC_E_CHANGED_MODE);}~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}};
template<class F>void reject(F fn){bool failed=false;try{fn();}catch(const std::invalid_argument&){failed=true;}CHECK(failed);}
void actualLegacy(const std::filesystem::path& root){
 std::ifstream latest(root/"compiled-latest.txt");std::string run;latest>>run;CHECK(run.rfind("run-",0)==0&&run.find_first_not_of("0123456789",4)==std::string::npos);
 for(const auto& value:array(root/run/"compiled-full-document-cost"/"free-rejected.json")){const auto spec=value.GetObject();bool refused=false;try{const auto manifest=moon::project::readProjectManifest(read(root/run/"compiled-full-document-cost"/winrt::to_string(spec.GetNamedString(L"file"))));moon::project::prepareEditableImport(manifest);}catch(const std::exception&){refused=true;}if(!refused)throw std::runtime_error("Legacy corrupt free tile archive admitted: "+winrt::to_string(spec.GetNamedString(L"name")));}
 std::ifstream f(root/run/"compiled-cost"/"graphs.json",std::ios::binary);CHECK(bool(f));const std::string json{std::istreambuf_iterator<char>(f),std::istreambuf_iterator<char>()};
 const auto cases=JsonArray::Parse(winrt::to_hstring(json));CHECK(cases.Size()>=113);std::size_t storageCases=0,metadataCases=0,groupCases=0,rasterObjectCases=0,maskObjectCases=0,rootMetadataCases=0,fullDocumentCases=0,fullDocumentGated=0;
 for(const auto& item:cases){
  const auto row=item.GetObject();HistoryCostGraph graph;
  for(const auto& value:row.GetNamedArray(L"nodes")){
   const auto node=value.GetObject();const auto type=node.GetNamedString(L"kind");HistoryCostValue result;
   if(type==L"primitive")result.kind=Kind::Primitive;
   else if(type==L"string"){
    result.kind=Kind::String;for(const auto& unit:node.GetNamedArray(L"utf16")){const auto n=unit.GetNumber();CHECK(n>=0&&n<=65535&&n==std::size_t(n));result.string.push_back(char16_t(n));}
   }
   else if(type==L"buffer"){result.kind=Kind::Buffer;result.byteLength=std::size_t(node.GetNamedNumber(L"byteLength"));}
   else if(type==L"view")result.kind=Kind::View;
   else if(type==L"map")result.kind=Kind::Map;
   else{CHECK(type==L"object");result.kind=Kind::Object;}
   if(node.HasKey(L"children"))for(const auto& child:node.GetNamedArray(L"children"))result.children.push_back(std::size_t(child.GetNumber()));
   graph.push_back(std::move(result));
  }
  const auto actual=historyTransferGraphBytes(graph,std::size_t(row.GetNamedNumber(L"root"))),expected=row.GetNamedNumber(L"bytes");
  const auto name=winrt::to_string(row.GetNamedString(L"name"));if(actual!=expected)throw std::runtime_error(name+" expected "+std::to_string(expected)+" actual "+std::to_string(actual));
  if(name.rfind("resource-",0)==0){
   const auto directory=root/run/"compiled-resource-cost";bool found=false;
   for(const auto& value:array(directory/"cases.json")){const auto spec=value.GetObject();if(spec.GetNamedString(L"graphName")!=row.GetNamedString(L"name"))continue;found=true;
    auto document=moon::project::createEditableDocument(moon::project::prepareEditableImport(moon::project::readProjectManifest(read(directory/winrt::to_string(spec.GetNamedString(L"file"))))));
    if(spec.GetNamedBoolean(L"shareReferences")){auto images=document.referenceImages();CHECK(images.size()==2);images[1].pixels=images[0].pixels;document.setImportedReferenceImages(std::move(images));}
    if(spec.GetNamedBoolean(L"liveRename")){
     document.renamePaletteColor(document.palette().entries[0].id,document.palette().entries[0].name+U" live\U0001f600");
     auto brushes=document.projectBrushes();brushes[0].metadata.name+=u8" live\U0001f600";document.setImportedProjectBrushes(std::move(brushes));
     auto images=document.referenceImages();images.pop_back();document.setImportedReferenceImages(std::move(images));auto slices=document.slices();slices[0].name+=U" live\U0001f600";document.setImportedSlices(std::move(slices));
    }
    const auto revision=document.revision(),history=document.historySize();const auto* firstBrush=document.projectBrushes().empty()?nullptr:document.projectBrushes()[0].brush.coverage.data();
    HistoryCostGraph native(2);native[0].kind=Kind::Object;native[1].kind=Kind::Object;native[0].children={1};
    const auto roots=appendDecodedHistoryResources(native,document);for(auto id:{roots.palette,roots.paletteOrder,roots.paletteSlots,roots.paletteColumns,roots.nextColorId,roots.customBrushes,roots.referenceImages,roots.slices})native[0].children.push_back(id);
    const auto nativeCost=historyTransferGraphBytes(native,0);if(nativeCost!=expected)throw std::runtime_error(name+" native resources expected "+std::to_string(expected)+" actual "+std::to_string(nativeCost));
    CHECK(native[0].children.size()==graph[std::size_t(row.GetNamedNumber(L"root"))].children.size());
    for(std::size_t i=0;i<native[0].children.size();++i)CHECK(historyTransferGraphBytes(native,native[0].children[i])==historyTransferGraphBytes(graph,graph[std::size_t(row.GetNamedNumber(L"root"))].children[i]));
    if(spec.GetNamedBoolean(L"shareReferences")){const auto& images=native[roots.referenceImages].children;CHECK(images.size()==2);CHECK(native[images[0]].children[3]==native[images[1]].children[3]);}
    CHECK(document.revision()==revision&&document.historySize()==history);CHECK((document.projectBrushes().empty()?nullptr:document.projectBrushes()[0].brush.coverage.data())==firstBrush);
    // Invalid UTF8 is admitted by the existing resource setter but must not
    // publish a partial graph or change any previously assembled graph edge.
    auto badBrushes=document.projectBrushes();if(!badBrushes.empty()){badBrushes.back().metadata.name=std::string(1,char(0xff));document.setImportedProjectBrushes(std::move(badBrushes));const auto size=native.size();const auto edges=native[0].children;bool rejected=false;try{appendDecodedHistoryResources(native,document);}catch(const std::range_error&){rejected=true;}CHECK(rejected&&native.size()==size&&native[0].children==edges&&historyTransferGraphBytes(native,0)==nativeCost);}
   }CHECK(found);
  }
  if(name.rfind("recording-",0)==0){
   const auto directory=root/run/"compiled-recording-cost";bool found=false;
   for(const auto& value:array(directory/"cases.json")){const auto spec=value.GetObject();if(spec.GetNamedString(L"graphName")!=row.GetNamedString(L"name"))continue;found=true;
    const auto bytes=read(directory/winrt::to_string(spec.GetNamedString(L"file")));auto document=moon::project::createEditableDocument(moon::project::prepareEditableImport(moon::project::readProjectManifest(bytes)));
    auto& settings=document.mutableTimelapseSettings();const auto action=spec.GetNamedString(L"action");
    if(action==L"migrate-first"){auto& frame=settings.snapshots.at(0);frame.data.clear();frame.historyDataBacking.reset();frame.local=moon::timelapse::Reference{"store-a","chunk-b",8,67,123};}
    if(action==L"portable")for(auto& frame:settings.snapshots){frame.data=moon::timelapse::Bytes(frame.data);frame.historyDataBacking.reset();frame.local.reset();}
    if(action==L"remove-first")settings.snapshots.erase(settings.snapshots.begin());
    if(action==L"live-settings"){settings.quality=moon::timelapse::Quality::High;settings.mode=moon::timelapse::Mode::Full;settings.enabled=true;settings.recordUndoSteps=true;settings.fps=60;settings.speed=64;}
    CHECK(settings.snapshots.size()==spec.GetNamedNumber(L"frames"));const auto shares=spec.GetNamedArray(L"sharesArchive"),lengths=spec.GetNamedArray(L"backingLengths");
    std::vector<const void*> pixels;for(std::size_t i=0;i<settings.snapshots.size();++i){const auto& frame=settings.snapshots[i];pixels.push_back(frame.data.data());CHECK(bool(frame.historyDataBacking)==shares.GetAt(unsigned(i)).GetBoolean());CHECK((frame.historyDataBacking?frame.historyDataBacking->buffer->size():frame.data.size())==lengths.GetAt(unsigned(i)).GetNumber());if(frame.historyDataBacking)CHECK(frame.historyDataBacking->buffer==bytes);}
    const auto revision=document.revision(),history=document.historySize();HistoryCostGraph native(2);native[0].kind=Kind::Object;native[1].kind=Kind::Object;native[0].children={1};const auto recording=appendHistoryRecording(native,document);native[0].children.push_back(recording);
    const auto nativeCost=historyTransferGraphBytes(native,0);if(nativeCost!=expected)throw std::runtime_error(name+" native recording expected "+std::to_string(expected)+" actual "+std::to_string(nativeCost));
    const auto legacyRoot=std::size_t(row.GetNamedNumber(L"root")),legacyRecording=graph[legacyRoot].children.at(1);CHECK(native[recording].children.size()==graph[legacyRecording].children.size());
    for(std::size_t i=0;i<native[recording].children.size();++i)CHECK(historyTransferGraphBytes(native,native[recording].children[i])==historyTransferGraphBytes(graph,graph[legacyRecording].children[i]));
    const auto& nativeFrames=native[native[recording].children.back()].children;const auto& legacyFrames=graph[graph[legacyRecording].children.back()].children;CHECK(nativeFrames.size()==legacyFrames.size());
    for(std::size_t i=0;i<nativeFrames.size();++i){CHECK(native[nativeFrames[i]].children.size()==graph[legacyFrames[i]].children.size());for(std::size_t j=0;j<native[nativeFrames[i]].children.size();++j)CHECK(historyTransferGraphBytes(native,native[nativeFrames[i]].children[j])==historyTransferGraphBytes(graph,graph[legacyFrames[i]].children[j]));}
    CHECK(document.revision()==revision&&document.historySize()==history);for(std::size_t i=0;i<pixels.size();++i)CHECK(settings.snapshots[i].data.data()==pixels[i]);
    // The real history-free checkpoint path must retain backing relationships,
    // even though its native PNG vectors are detached copies of the originals.
    moon::DocumentSnapshot capture(document);while(!capture.advance(document,std::chrono::steady_clock::time_point::max())){}auto checkpoint=capture.finish();CHECK(!checkpoint.historySize()&&!checkpoint.recordingSession());
    HistoryCostGraph copied;const auto copiedRoot=appendHistoryRecording(copied,checkpoint);CHECK(historyTransferGraphBytes(copied,copiedRoot)==historyTransferGraphBytes(native,recording));
    for(std::size_t i=0;i<settings.snapshots.size();++i)if(settings.snapshots[i].historyDataBacking)CHECK(checkpoint.timelapseSettings().snapshots[i].historyDataBacking->buffer==settings.snapshots[i].historyDataBacking->buffer);
    if(!settings.snapshots.empty()&&settings.snapshots[0].historyDataBacking){const auto size=native.size();settings.snapshots[0].data.push_back(0);reject([&]{appendHistoryRecording(native,document);});CHECK(native.size()==size&&historyTransferGraphBytes(native,0)==nativeCost);}
   }CHECK(found);
  }
  if(name.rfind("storage-",0)==0){
   ++storageCases;
   const auto directory=root/run/"compiled-storage-cost";bool found=false;
   for(const auto& value:array(directory/"cases.json")){const auto spec=value.GetObject();if(spec.GetNamedString(L"graphName")!=row.GetNamedString(L"name"))continue;found=true;
    const auto bytes=read(directory/winrt::to_string(spec.GetNamedString(L"file")));const auto manifest=moon::project::readProjectManifest(bytes);DecodedHistoryRasterStorage storagePlan(manifest);auto document=moon::project::createEditableDocument(moon::project::prepareEditableImport(manifest));
    for(bool recordingFirst:{false,true}){
     HistoryCostGraph native;HistoryCostBuilder builder(native);const auto root=builder.object(),layers=builder.object(),storage=builder.object();std::size_t recording=0;
     if(recordingFirst)recording=appendHistoryRecording(builder,document);
     for(const auto& rasterValue:spec.GetNamedArray(L"rasters")){const auto raster=rasterValue.GetObject();const auto index=std::size_t(raster.GetNamedNumber(L"index"));const auto surface=raster.GetNamedString(L"type")==L"layer"?manifest.layers.at(index).surface:manifest.cels.at(index).surface;CHECK(surface);
      const auto item=builder.object();const auto roots=storagePlan.append(builder,*surface);builder.add(item,roots.pixels);CHECK(bool(roots.runtimeRaster)==raster.GetNamedBoolean(L"sparse"));if(roots.runtimeRaster)builder.add(item,*roots.runtimeRaster);builder.add(storage,item);
     }
     if(!recordingFirst)recording=appendHistoryRecording(builder,document);builder.add(root,layers);builder.add(root,recording);builder.add(root,storage);
     const auto cost=historyTransferGraphBytes(native,root);if(cost!=expected)throw std::runtime_error(name+" native cross-field expected "+std::to_string(expected)+" actual "+std::to_string(cost));
     const auto legacyStorage=graph[std::size_t(row.GetNamedNumber(L"root"))].children.at(2);CHECK(native[storage].children.size()==graph[legacyStorage].children.size());
     for(std::size_t i=0;i<native[storage].children.size();++i)CHECK(historyTransferGraphBytes(native,native[storage].children[i])==historyTransferGraphBytes(graph,graph[legacyStorage].children[i]));
     const auto mark=builder.mark();auto invalid=*manifest.layers.front().surface;invalid.width+=1;reject([&]{storagePlan.append(builder,invalid);});CHECK(native.size()==mark.nodes&&historyTransferGraphBytes(native,root)==cost);
     // Repeated sparse transfer requests allocate new placeholders but reuse
     // runtime identity; raw requests reuse their typed view as well as backing.
     const auto again=storagePlan.append(builder,*manifest.layers.front().surface);const auto first=native[native[storage].children.front()].children.front();
     if(again.runtimeRaster){CHECK(again.pixels!=first);CHECK(*again.runtimeRaster==native[native[storage].children.front()].children.at(1));}else CHECK(again.pixels==first);
    }
   }CHECK(found);
  }
  if(name.rfind("timeline-",0)==0){
   ++metadataCases;const auto directory=root/run/"compiled-timeline-cost";bool found=false;
   for(const auto& value:array(directory/"cases.json")){const auto spec=value.GetObject();if(spec.GetNamedString(L"graphName")!=row.GetNamedString(L"name"))continue;found=true;
    auto document=moon::project::createEditableDocument(moon::project::prepareEditableImport(moon::project::readProjectManifest(read(directory/winrt::to_string(spec.GetNamedString(L"file"))))));
    if(spec.GetNamedBoolean(L"live")){document.setImportedLoop(false);const auto active=document.frame().id;document.selectFrame(document.timeline().state().frames.front().id);document.setFrameDuration(37);document.selectFrame(active);auto section=document.timeline().state().loopSections.front();section.name+=U" live\U0001f600";document.updateLoopSection(std::move(section));}
    const auto revision=document.revision(),history=document.historySize();std::vector<const void*> pixels;for(const auto& set:document.timeline().state().tilesets)pixels.push_back(set.pixels.data());
    HistoryCostGraph native;HistoryCostBuilder builder(native);const auto root=builder.object(),layers=builder.object();builder.add(root,layers);
    const auto roots=appendDecodedHistoryTimelineMetadata(builder,document);for(auto id:{roots.frames,roots.loopSections,roots.activeFrameId,roots.loop,roots.tilesets})builder.add(root,id);
    const auto cost=historyTransferGraphBytes(native,root);if(cost!=expected)throw std::runtime_error(name+" native metadata expected "+std::to_string(expected)+" actual "+std::to_string(cost));
    const auto& children=graph[std::size_t(row.GetNamedNumber(L"root"))].children;CHECK(children.size()==native[root].children.size());for(std::size_t i=0;i<children.size();++i)CHECK(historyTransferGraphBytes(native,native[root].children[i])==historyTransferGraphBytes(graph,children[i]));
    CHECK(document.revision()==revision&&document.historySize()==history);for(std::size_t i=0;i<pixels.size();++i)CHECK(document.timeline().state().tilesets[i].pixels.data()==pixels[i]);
    if(!pixels.empty()){
     // A late backing conflict must roll back the whole appended field bundle,
     // including earlier tileset identities; retry must have no stale indices.
     HistoryCostGraph failed;HistoryCostBuilder transaction(failed);const auto initial=transaction.mark();const auto& last=document.timeline().state().tilesets.back();transaction.view(&last.pixels,last.pixels.size()*sizeof(moon::Pixel)+4);const auto conflict=transaction.mark();
     reject([&]{appendDecodedHistoryTimelineMetadata(transaction,document);});CHECK(failed.size()==conflict.nodes);transaction.rollback(initial);
     const auto retry=appendDecodedHistoryTimelineMetadata(transaction,document);CHECK(historyTransferGraphBytes(failed,retry.tilesets)==historyTransferGraphBytes(native,roots.tilesets));
    }
   }CHECK(found);
  }
  if(name.rfind("groups-",0)==0){
   ++groupCases;const auto directory=root/run/"compiled-group-cost";bool found=false;
   for(const auto& value:array(directory/"cases.json")){const auto spec=value.GetObject();if(spec.GetNamedString(L"graphName")!=row.GetNamedString(L"name"))continue;found=true;
    const auto manifest=moon::project::readProjectManifest(read(directory/winrt::to_string(spec.GetNamedString(L"file"))));DecodedHistoryGroupShape shape(manifest);auto imported=moon::project::prepareEditableImport(manifest);
    if(spec.GetNamedBoolean(L"live")){auto& group=imported.timeline.groups[0];group.name+=U" live\U0001f600";group.blendMode="color-dodge";auto& style=*group.layerStyles;style.stroke.kernel=2;style.stroke.position=2;style.gradientMap.stops.pop_back();style.gradientMap.dither=6;style.gradientDither=7;}
    auto document=moon::project::createEditableDocument(std::move(imported));
    const auto revision=document.revision(),history=document.historySize();HistoryCostGraph native;HistoryCostBuilder builder(native);const auto root=builder.object(),layers=builder.object();builder.add(root,layers);const auto groups=shape.append(builder,document);builder.add(root,groups);
    const auto cost=historyTransferGraphBytes(native,root);if(cost!=expected)throw std::runtime_error(name+" native groups expected "+std::to_string(expected)+" actual "+std::to_string(cost));
    const auto legacyGroups=graph[std::size_t(row.GetNamedNumber(L"root"))].children.at(1);CHECK(native[groups].children.size()==graph[legacyGroups].children.size());
    for(std::size_t i=0;i<native[groups].children.size();++i){const auto a=native[groups].children[i],e=graph[legacyGroups].children[i];CHECK(native[a].children.size()==graph[e].children.size());for(std::size_t j=0;j<native[a].children.size();++j)CHECK(historyTransferGraphBytes(native,native[a].children[j])==historyTransferGraphBytes(graph,graph[e].children[j]));}
    CHECK(document.revision()==revision&&document.historySize()==history);
    if(!manifest.groups.empty()){
     auto prepared=moon::project::prepareEditableImport(manifest);prepared.timeline.groups.back().id+="-new";auto changed=moon::project::createEditableDocument(std::move(prepared));const auto mark=builder.mark();reject([&]{shape.append(builder,changed);});CHECK(native.size()==mark.nodes&&historyTransferGraphBytes(native,root)==cost);
     if(manifest.groups.back().layerStyles){auto invalid=moon::project::prepareEditableImport(manifest);invalid.timeline.groups.back().layerStyles->gradientDither=99;auto bad=moon::project::createEditableDocument(std::move(invalid));reject([&]{shape.append(builder,bad);});CHECK(native.size()==mark.nodes&&historyTransferGraphBytes(native,root)==cost);const auto again=shape.append(builder,document);CHECK(historyTransferGraphBytes(native,again)==historyTransferGraphBytes(native,groups));}
    }
   }CHECK(found);
  }
  if(name.rfind("raster-objects-",0)==0){
   ++rasterObjectCases;const auto directory=root/run/"compiled-raster-objects";bool found=false;
   for(const auto& value:array(directory/"cases.json")){const auto spec=value.GetObject();if(spec.GetNamedString(L"graphName")!=row.GetNamedString(L"name"))continue;found=true;
    const auto manifest=std::make_shared<const moon::project::ReadManifest>(moon::project::readProjectManifest(read(directory/winrt::to_string(spec.GetNamedString(L"file")))));auto document=moon::project::createEditableDocument(moon::project::prepareEditableImport(*manifest));
    const bool includeMasks=spec.GetNamedBoolean(L"includeMasks");if(includeMasks)++maskObjectCases;
    if(includeMasks){const auto pixels=spec.GetNamedArray(L"maskFirstPixels");CHECK(pixels.Size()==document.timeline().state().masks.size());for(std::size_t i=0;i<pixels.Size();++i){const auto sample=pixels.GetAt(unsigned(i)).GetArray();moon::Pixel expected=0;for(int channel=0;channel<4;++channel)expected|=moon::Pixel(sample.GetAt(channel).GetNumber())<<(8*channel);CHECK(document.timeline().state().masks[i].mask.surface.pixels[0]==expected);}}
    const auto unicode=[](const winrt::hstring& value){return std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.from_bytes(winrt::to_string(value));};HistoryMaskNames maskNames{unicode(spec.GetNamedString(L"layerMaskName")),unicode(spec.GetNamedString(L"groupMaskName"))};
    if(includeMasks)reject([&]{InitialHistoryRasterObjects missingNames(manifest,document);});
    InitialHistoryRasterObjects plan(manifest,document,std::move(maskNames));
    const auto revision=document.revision(),history=document.historySize();
    for(bool recordingFirst:{false,true}){
     HistoryCostGraph native;HistoryCostBuilder builder(native);const auto root=builder.object();std::size_t recording=0;if(recordingFirst)recording=appendHistoryRecording(builder,document);
     const auto objects=plan.append(builder,document);const auto animation=builder.object();builder.add(animation,objects.cels);if(includeMasks){builder.add(animation,objects.layerMasks);builder.add(animation,objects.groupMasks);}if(!recordingFirst)recording=appendHistoryRecording(builder,document);builder.add(root,objects.layers);builder.add(root,animation);builder.add(root,recording);
     const auto cost=historyTransferGraphBytes(native,root);if(cost!=expected)throw std::runtime_error(name+" native objects expected "+std::to_string(expected)+" actual "+std::to_string(cost));
     const auto legacyRoot=std::size_t(row.GetNamedNumber(L"root"));for(std::size_t i=0;i<3;++i)CHECK(historyTransferGraphBytes(native,native[root].children[i])==historyTransferGraphBytes(graph,graph[legacyRoot].children[i]));
     const auto compare=[&](std::size_t a,std::size_t e){CHECK(native[a].children.size()==graph[e].children.size());for(std::size_t i=0;i<native[a].children.size();++i){const auto an=native[a].children[i],en=graph[e].children[i];CHECK(native[an].children.size()==graph[en].children.size());for(std::size_t j=0;j<native[an].children.size();++j)CHECK(historyTransferGraphBytes(native,native[an].children[j])==historyTransferGraphBytes(graph,graph[en].children[j]));}};
     compare(objects.layers,graph[legacyRoot].children[0]);compare(objects.cels,graph[graph[legacyRoot].children[1]].children[0]);
     if(includeMasks){
      const auto legacyAnimation=graph[legacyRoot].children[1];std::vector<std::size_t> buffers;
      const auto masks=[&](std::size_t actual,std::size_t expected){compare(actual,expected);for(std::size_t i=0;i<native[actual].children.size();++i){const auto a=native[native[actual].children[i]].children.at(2),e=graph[graph[expected].children[i]].children.at(2);CHECK(native[a].children.size()==graph[e].children.size());for(std::size_t j=0;j<native[a].children.size();++j)CHECK(historyTransferGraphBytes(native,native[a].children[j])==historyTransferGraphBytes(graph,graph[e].children[j]));const auto pixels=native[a].children.at(12);CHECK(native[pixels].kind==Kind::View);buffers.push_back(native[pixels].children.at(0));}};
      masks(objects.layerMasks,graph[legacyAnimation].children.at(1));masks(objects.groupMasks,graph[legacyAnimation].children.at(2));CHECK(buffers.size()==3);for(std::size_t i=0;i<buffers.size();++i){CHECK(native[buffers[i]].byteLength==16);for(std::size_t j=0;j<i;++j)CHECK(buffers[i]!=buffers[j]);}
     }
     auto other=moon::project::createEditableDocument(moon::project::prepareEditableImport(*manifest));const auto mark=builder.mark();reject([&]{plan.append(builder,other);});CHECK(native.size()==mark.nodes&&historyTransferGraphBytes(native,root)==cost);
    }
    CHECK(document.revision()==revision&&document.historySize()==history);
    if(name=="raster-objects-raw-stored"){
     HistoryCostGraph failed;HistoryCostBuilder transaction(failed);const auto original=transaction.mark();transaction.view(manifest->sourceArchive.get(),manifest->sourceArchive->size()+1);const auto conflict=transaction.mark();reject([&]{plan.append(transaction,document);});CHECK(failed.size()==conflict.nodes);transaction.rollback(original);
     const auto retry=plan.append(transaction,document);CHECK(historyTransferGraphBytes(failed,retry.layers)>32&&historyTransferGraphBytes(failed,retry.cels)>32);
    }
    HistoryCostGraph stale;HistoryCostBuilder builder(stale);builder.object();const auto mark=builder.mark();
    if(document.timeline().state().frames.size()>1){const auto previous=document.frame().id;for(const auto& frame:document.timeline().state().frames)if(frame.id!=previous){document.selectFrame(frame.id);break;}reject([&]{plan.append(builder,document);});CHECK(stale.size()==mark.nodes);document.selectFrame(previous);}
    document.setPixelGrid(!document.showPixelGrid());reject([&]{plan.append(builder,document);});CHECK(stale.size()==mark.nodes);
   }CHECK(found);
  }
  if(name.rfind("root-metadata-",0)==0){
   ++rootMetadataCases;const auto directory=root/run/"compiled-root-metadata";bool found=false;
   for(const auto& value:array(directory/"cases.json")){const auto spec=value.GetObject();if(spec.GetNamedString(L"graphName")!=row.GetNamedString(L"name"))continue;found=true;
    const auto manifest=std::make_shared<const moon::project::ReadManifest>(moon::project::readProjectManifest(read(directory/winrt::to_string(spec.GetNamedString(L"file")))));auto document=moon::project::createEditableDocument(moon::project::prepareEditableImport(*manifest));InitialHistoryDocumentMetadata plan(manifest,document);const auto revision=document.revision(),history=document.historySize();
    const auto statistics=spec.GetNamedObject(L"statistics");CHECK(document.projectInformation().strokeCount==statistics.GetNamedNumber(L"strokeCount")&&document.projectInformation().operationCount==statistics.GetNamedNumber(L"operationCount")&&document.projectInformation().drawingTimeMs==statistics.GetNamedNumber(L"drawingTimeMs"));
    HistoryCostGraph native;HistoryCostBuilder builder(native);const auto root=builder.object();builder.add(root,builder.object());const auto metadata=plan.append(builder,document);builder.add(root,metadata.name);builder.add(root,metadata.activeLayerId);CHECK(bool(metadata.outlineSettings)==spec.GetNamedBoolean(L"outline"));if(metadata.outlineSettings)builder.add(root,*metadata.outlineSettings);for(auto field:{metadata.displaySettings,metadata.statistics,metadata.createdAt,metadata.updatedAt,metadata.layerPanelState})builder.add(root,field);
    const auto cost=historyTransferGraphBytes(native,root);if(cost!=expected)throw std::runtime_error(name+" native metadata expected "+std::to_string(expected)+" actual "+std::to_string(cost));
    std::vector<std::pair<std::size_t,std::size_t>> pending{{root,std::size_t(row.GetNamedNumber(L"root"))}};while(!pending.empty()){const auto [a,e]=pending.back();pending.pop_back();CHECK(native[a].kind==graph[e].kind&&native[a].string==graph[e].string&&native[a].children.size()==graph[e].children.size());for(std::size_t i=0;i<native[a].children.size();++i)pending.emplace_back(native[a].children[i],graph[e].children[i]);}
    CHECK(document.revision()==revision&&document.historySize()==history);const auto mark=builder.mark();auto other=moon::project::createEditableDocument(moon::project::prepareEditableImport(*manifest));reject([&]{plan.append(builder,other);});CHECK(native.size()==mark.nodes&&historyTransferGraphBytes(native,root)==cost);
    const auto information=document.projectInformation();auto invalid=information;invalid.updatedAt=std::string(1,char(0xff));document.setImportedProjectInformation(std::move(invalid));bool failed=false;try{plan.append(builder,document);}catch(const std::range_error&){failed=true;}CHECK(failed&&native.size()==mark.nodes&&historyTransferGraphBytes(native,root)==cost);document.setImportedProjectInformation(information);const auto retry=plan.append(builder,document);CHECK(historyTransferGraphBytes(native,retry.layerPanelState)==historyTransferGraphBytes(native,metadata.layerPanelState));builder.rollback(mark);
    const auto previous=document.layer().id;for(const auto& layer:document.timeline().state().layers)if(layer.id!=previous){document.selectLayer(layer.id);break;}reject([&]{plan.append(builder,document);});CHECK(native.size()==mark.nodes);document.selectLayer(previous);
    document.setPixelGrid(!document.showPixelGrid());reject([&]{plan.append(builder,document);});CHECK(native.size()==mark.nodes&&historyTransferGraphBytes(native,root)==cost);
   }CHECK(found);
  }
  if(name.rfind("full-document-",0)==0){
   ++fullDocumentCases;const auto directory=root/run/"compiled-full-document-cost";bool found=false;
   for(const auto& value:array(directory/"cases.json")){const auto spec=value.GetObject();if(spec.GetNamedString(L"graphName")!=row.GetNamedString(L"name"))continue;found=true;
    const auto manifest=std::make_shared<const moon::project::ReadManifest>(moon::project::readProjectManifest(read(directory/winrt::to_string(spec.GetNamedString(L"file")))));
    if(!manifest->unsupported.empty()){
     CHECK(name.rfind("full-document-pixel-format-",0)==0&&name!="full-document-pixel-format-rgba32");bool rejected=false;try{moon::project::prepareEditableImport(*manifest);}catch(const moon::project::Error& error){rejected=error.kind==moon::project::ErrorKind::Unsupported;}CHECK(rejected);++fullDocumentGated;std::cout<<name<<": actual legacy graph verified; native import remains unsupported\n";continue;
    }
    auto document=moon::project::createEditableDocument(moon::project::prepareEditableImport(*manifest));
    if(spec.HasKey(L"freeRuntime")){
     const auto verify=[&](const moon::Document& target,const JsonObject& reference){for(const auto& layer:target.timeline().state().layers)if(layer.freeTiles){JsonObject encoded;moon::project::freejson::encodeLayer(encoded,*layer.freeTiles);sameJson(encoded.GetNamedArray(L"freeTileSources"),reference.GetNamedArray(L"sources"));}
      for(const auto& row:reference.GetNamedArray(L"cels")){const auto expected=row.GetObject();const auto* cel=target.timeline().findCelById(winrt::to_string(expected.GetNamedString(L"id")));CHECK(cel&&cel->freeTiles&&cel->surface);const auto& surface=*cel->surface;CHECK(surface.width==expected.GetNamedNumber(L"width")&&surface.height==expected.GetNamedNumber(L"height")&&surface.offsetX==expected.GetNamedNumber(L"offsetX")&&surface.offsetY==expected.GetNamedNumber(L"offsetY"));const auto pixels=expected.GetNamedArray(L"pixels");CHECK(surface.pixels.size()==pixels.Size());for(unsigned i=0;i<pixels.Size();++i)CHECK(surface.pixels[i]==std::uint32_t(pixels.GetAt(i).GetNumber()));
       const auto instances=expected.GetNamedObject(L"freeTiles").GetNamedArray(L"instances");CHECK(cel->freeTiles->instances.size()==instances.Size());for(unsigned i=0;i<instances.Size();++i){const auto e=instances.GetAt(i).GetObject();const auto& a=cel->freeTiles->instances[i];CHECK(a.id==winrt::to_string(e.GetNamedString(L"id"))&&a.sourceId==winrt::to_string(e.GetNamedString(L"sourceId"))&&a.tileId.empty());CHECK(a.x==e.GetNamedNumber(L"x")&&a.y==e.GetNamedNumber(L"y")&&a.visible==e.GetNamedBoolean(L"visible")&&a.locked==e.GetNamedBoolean(L"locked"));CHECK(a.rotation==e.GetNamedNumber(L"rotation",0)&&a.flipHorizontal==e.GetNamedBoolean(L"flipHorizontal",false)&&a.flipVertical==e.GetNamedBoolean(L"flipVertical",false));CHECK(a.opacity.has_value()==e.HasKey(L"opacity")&&a.blendMode.has_value()==e.HasKey(L"blendMode"));if(a.opacity)CHECK(*a.opacity==e.GetNamedNumber(L"opacity"));if(a.blendMode)CHECK(*a.blendMode==winrt::to_string(e.GetNamedString(L"blendMode")));}
      }
     };verify(document,spec.GetNamedObject(L"freeRuntime"));const auto saved=moon::project::readProjectManifest(moon::project::encodeEditableProject(document).bytes);
     const auto savedDocument=JsonObject::Parse(winrt::to_hstring(saved.manifestUtf8)).GetNamedObject(L"document"),expectedSaved=spec.GetNamedObject(L"freeSaved");
     for(const auto& value:expectedSaved.GetNamedArray(L"layers")){const auto expected=value.GetObject();bool found=false;for(const auto& row:savedDocument.GetNamedArray(L"layers")){const auto actual=row.GetObject();if(actual.GetNamedString(L"id")==expected.GetNamedString(L"id")){sameJson(actual.GetNamedArray(L"freeTileSources"),expected.GetNamedArray(L"sources"));found=true;}}CHECK(found);}
     for(const auto& value:expectedSaved.GetNamedArray(L"cels")){const auto expected=value.GetObject();bool found=false;for(const auto& row:savedDocument.GetNamedObject(L"animation").GetNamedArray(L"cels")){const auto actual=row.GetObject();if(actual.GetNamedString(L"id")==expected.GetNamedString(L"id")){sameJson(actual.GetNamedObject(L"freeTiles"),expected.GetNamedObject(L"freeTiles"));found=true;}}CHECK(found);}
     auto reopened=moon::project::createEditableDocument(moon::project::prepareEditableImport(saved));verify(reopened,spec.GetNamedObject(L"freeReopenedRuntime"));
    }
    if(spec.HasKey(L"tilemapRuntime")){
     const auto reference=spec.GetNamedObject(L"tilemapRuntime");const auto verify=[&](const moon::Document& target){CHECK(target.timeline().resolveSurface(target.cel().id).surface->width==reference.GetNamedNumber(L"width")&&target.timeline().resolveSurface(target.cel().id).surface->height==reference.GetNamedNumber(L"height"));const auto pixels=reference.GetNamedArray(L"pixels");CHECK(target.pixels().size()==pixels.Size());for(unsigned i=0;i<pixels.Size();++i)CHECK(target.pixels()[i]==std::uint32_t(pixels.GetAt(i).GetNumber()));for(const auto& owner:reference.GetNamedArray(L"owners")){const auto value=owner.GetObject();const auto* cel=target.timeline().findCelById(winrt::to_string(value.GetNamedString(L"id")));CHECK(cel&&cel->tilemap);sameJson(moon::project::tilejson::encode(*cel->tilemap),value.GetNamedObject(L"tilemap"));}};
     verify(document);const auto saved=moon::project::readProjectManifest(moon::project::encodeEditableProject(document).bytes);auto reopened=moon::project::createEditableDocument(moon::project::prepareEditableImport(saved));verify(reopened);
    }
    if(spec.HasKey(L"decodedText")){sameJson(moon::project::encodeTextCel(*document.timeline().state().cels[0].text),spec.GetNamedObject(L"decodedText"));const auto saved=moon::project::readProjectManifest(moon::project::encodeEditableProject(document).bytes);auto reopened=moon::project::createEditableDocument(moon::project::prepareEditableImport(saved));sameJson(moon::project::encodeTextCel(*reopened.timeline().state().cels[0].text),spec.GetNamedObject(L"reopenedText"));}
    if(spec.HasKey(L"specialLayer")){
     const auto expected=spec.GetNamedObject(L"specialLayer");const auto verify=[&](const moon::Document& target){CHECK(target.layer().layerStyles.has_value()==expected.GetNamedBoolean(L"hasLayerStyles"));const auto saved=moon::project::readProjectManifest(moon::project::encodeEditableProject(target).bytes);const auto layer=JsonObject::Parse(winrt::to_hstring(saved.manifestUtf8)).GetNamedObject(L"document").GetNamedArray(L"layers").GetAt(0).GetObject();for(const auto* field:{L"background",L"adjustment",L"layerStyles"}){const auto reference=expected.GetNamedValue(field);if(reference.ValueType()==JsonValueType::Null)CHECK(!layer.HasKey(field));else{CHECK(layer.HasKey(field));sameJson(layer.GetNamedValue(field),reference);}}return saved;};
     const auto saved=verify(document);auto reopened=moon::project::createEditableDocument(moon::project::prepareEditableImport(saved));verify(reopened);
    }
    if(name=="full-document-text-fractional-style-offsets"){const auto& text=*document.timeline().state().cels[0].text;CHECK(text.styleRuns.size()==1&&text.styleRuns[0].start==0&&text.styleRuns[0].end==1);}
    if(name=="full-document-text-linked"){const auto& cels=document.timeline().state().cels;CHECK(cels.size()==2&&cels[0].text->text==u"owner"&&cels[1].text->text==u"own linked metadata"&&cels[1].linkedCelId.has_value());}
    const auto unicode=[](const winrt::hstring& value){return std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.from_bytes(winrt::to_string(value));};HistoryDecodeContext context{winrt::to_string(spec.GetNamedString(L"documentId")),{unicode(spec.GetNamedString(L"layerMaskName")),unicode(spec.GetNamedString(L"groupMaskName"))}};
    CHECK(context.documentId!=document.projectId());const auto revision=document.revision(),history=document.historySize();InitialHistoryDocumentCost plan(manifest,document,context);
    HistoryCostGraph native;HistoryCostBuilder builder(native);const auto root=plan.append(builder,document);const auto cost=historyTransferGraphBytes(native,root);if(cost!=expected)throw std::runtime_error(name+" native full document expected "+std::to_string(expected)+" actual "+std::to_string(cost));CHECK(plan.bytes(document)==cost);
    // Compare the complete rooted identity graph, not just its aggregate bytes:
    // shared runtime/view/backing edges must map bijectively in both graphs.
    std::unordered_map<std::size_t,std::size_t> forward,reverse;std::vector<std::pair<std::size_t,std::size_t>> pending{{root,std::size_t(row.GetNamedNumber(L"root"))}};
    while(!pending.empty()){const auto [a,e]=pending.back();pending.pop_back();if(!(native[a].kind==graph[e].kind&&native[a].string==graph[e].string&&native[a].byteLength==graph[e].byteLength&&native[a].children.size()==graph[e].children.size()))throw std::runtime_error(name+" graph node "+std::to_string(a)+"/"+std::to_string(e)+" kind "+std::to_string(int(native[a].kind))+"/"+std::to_string(int(graph[e].kind))+" string units "+std::to_string(native[a].string.size())+"/"+std::to_string(graph[e].string.size())+" children "+std::to_string(native[a].children.size())+"/"+std::to_string(graph[e].children.size()));if(native[a].kind!=Kind::Primitive&&native[a].kind!=Kind::String){const auto left=forward.emplace(a,e),right=reverse.emplace(e,a);CHECK(left.first->second==e&&right.first->second==a&&left.second==right.second);if(!left.second)continue;}for(std::size_t i=0;i<native[a].children.size();++i)pending.emplace_back(native[a].children[i],graph[e].children[i]);}
    CHECK(document.revision()==revision&&document.historySize()==history);
    const auto mark=builder.mark();auto other=moon::project::createEditableDocument(moon::project::prepareEditableImport(*manifest));reject([&]{plan.append(builder,other);});CHECK(native.size()==mark.nodes&&historyTransferGraphBytes(native,root)==cost);
    auto information=document.projectInformation();auto invalid=information;invalid.updatedAt=std::string(1,char(0xff));document.setImportedProjectInformation(std::move(invalid));bool failed=false;try{plan.append(builder,document);}catch(const std::range_error&){failed=true;}CHECK(failed&&native.size()==mark.nodes&&historyTransferGraphBytes(native,root)==cost);document.setImportedProjectInformation(std::move(information));const auto retry=plan.append(builder,document);CHECK(historyTransferGraphBytes(native,retry)==cost);builder.rollback(mark);
    auto missing=context;missing.documentId.clear();reject([&]{InitialHistoryDocumentCost noIdentity(manifest,document,missing);});document.setPixelGrid(!document.showPixelGrid());reject([&]{plan.bytes(document);});
    if(spec.HasKey(L"movedText")){
     auto moved=moon::project::createEditableDocument(moon::project::prepareEditableImport(*manifest));const auto id=moved.cel().id;const auto original=*moved.cel().text;
     CHECK(moved.beginLayerMove({id})&&moved.previewLayerMove(7,-2)&&moved.commitLayerMove());const auto movedText=moon::project::encodeTextCel(*moved.cel().text);sameJson(movedText,spec.GetNamedObject(L"movedText"));moved.undo();sameJson(moon::project::encodeTextCel(*moved.cel().text),moon::project::encodeTextCel(original));moved.redo();sameJson(moon::project::encodeTextCel(*moved.cel().text),movedText);
     auto plainImport=moon::project::prepareEditableImport(*manifest);std::size_t retained=0;for(auto& cel:plainImport.timeline.cels)if(cel.text)for(auto& transform:cel.text->transforms){for(auto* rect:{&transform.source,&transform.target}){retained+=rect->projectProperties.size()*sizeof(char16_t);rect->projectProperties.clear();}}
     auto plain=moon::project::createEditableDocument(std::move(plainImport));CHECK(retained&&plain.beginLayerMove({id})&&plain.previewLayerMove(7,-2)&&plain.commitLayerMove());CHECK(moved.historyBytes()==plain.historyBytes()+2*retained);
     const auto encoded=moon::project::encodeEditableProject(moved);const auto saved=moon::project::readProjectManifest(encoded.bytes);auto reopened=moon::project::createEditableDocument(moon::project::prepareEditableImport(saved));sameJson(moon::project::encodeTextCel(*reopened.cel().text),spec.GetNamedObject(L"movedText"));
    }
   }CHECK(found);
  }
  std::cout<<name<<": "<<actual<<" bytes\n";
 }
 CHECK(storageCases==6);
 CHECK(metadataCases==4);
 CHECK(groupCases==7);
 CHECK(rasterObjectCases==15);
 CHECK(maskObjectCases==7);
 CHECK(rootMetadataCases==9);
 CHECK(fullDocumentCases==193);
 CHECK(fullDocumentGated==8);
}
void edgeCases(){
 {
  HistoryCostGraph graph;HistoryCostBuilder builder(graph);int first=0,second=0,view=0,newView=0,object=0;
  const auto original=builder.view(&first,40,&view);const auto mark=builder.mark();
  reject([&]{builder.view(&second,70,&view);});builder.rollback(mark);
  const auto next=builder.view(&second,70,&newView);CHECK(next<graph.size()&&historyTransferGraphBytes(graph,original)==40&&historyTransferGraphBytes(graph,next)==70);
  const auto before=builder.mark();CHECK(builder.object(&object).second);builder.rollback(before);CHECK(builder.object(&object).second);
 }
 HistoryCostGraph graph(2);graph[0].kind=Kind::Object;graph[0].children={1,1,0};
 CHECK(historyTransferGraphBytes(graph,0)==48); // primitives are not identities
 graph[1].kind=Kind::String;graph[1].string=u"\U0001f600";CHECK(historyTransferGraphBytes(graph,0)==40);
 graph[1].kind=Kind::Object;CHECK(historyTransferGraphBytes(graph,0)==64);
 graph[1].kind=Kind::Buffer;graph[1].byteLength=257;CHECK(historyTransferGraphBytes(graph,0)==289);
 reject([&]{historyTransferGraphBytes({},0);});reject([&]{historyTransferGraphBytes(graph,2);});
 graph[0].children={2};reject([&]{historyTransferGraphBytes(graph,0);});
 graph[0].kind=Kind::View;graph[0].children={1};CHECK(historyTransferGraphBytes(graph,0)==257);
 graph[0].children={};reject([&]{historyTransferGraphBytes(graph,0);});
 graph[0].children={0};reject([&]{historyTransferGraphBytes(graph,0);});
 graph[0].kind=Kind::Map;graph[0].children={1};reject([&]{historyTransferGraphBytes(graph,0);});
 graph[0].kind=Kind::Primitive;reject([&]{historyTransferGraphBytes(graph,0);});
 // JS recursively groups child sums before adding to the parent. Preserve
 // that Number behavior rather than accumulating a flat double running sum.
 graph=HistoryCostGraph(5);graph[0].kind=Kind::Object;graph[0].children={1,2};graph[1].kind=Kind::Buffer;graph[1].byteLength=std::size_t(1)<<54;
 graph[2].kind=Kind::Object;graph[2].children={3,4};graph[3].kind=Kind::String;graph[3].string=u"a";graph[4].kind=Kind::String;graph[4].string=u"b";
 CHECK(historyTransferGraphBytes(graph,0)==(32.+double(graph[1].byteLength))+(32.+2.+2.));
 graph=HistoryCostGraph(30000);for(std::size_t i=0;i<graph.size();++i){graph[i].kind=Kind::Object;graph[i].children={i+1==graph.size()?0:i+1};}
 CHECK(historyTransferGraphBytes(graph,0)==30000.*32); // iterative cycle-safe walk
}
int wmain(int argc,wchar_t** argv){try{Apartment apartment;CHECK(argc==2);actualLegacy(argv[1]);edgeCases();std::cout<<"Actual legacy transfer graph costs and native traversal boundaries passed; Document adapter remains pending\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
