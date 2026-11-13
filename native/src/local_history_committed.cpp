#include "local_history_committed.h"
#include "document.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <roapi.h>
#include <algorithm>
#include <map>
namespace moon::local_history {
namespace {
using namespace winrt::Windows::Data::Json;
struct Apartment {
 HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);
 Apartment(){if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize committed history JSON");}
 ~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}
};
auto text(const std::string& value){return JsonValue::CreateStringValue(winrt::to_hstring(value));}
auto number(double value){return JsonValue::CreateNumberValue(value);}
std::wstring utf16(const std::u32string& value){std::wstring result;for(auto c:value){if(c<=0xffff)result.push_back(wchar_t(c));else{c-=0x10000;result.push_back(wchar_t(0xd800+(c>>10)));result.push_back(wchar_t(0xdc00+(c&1023)));}}return result;}
// Legacy paths use the actual animation.cels array order. The importer and
// project encoder preserve it; references never copy pixel storage.
std::vector<const timeline::Cel*> orderedCels(const Document& document){
 std::vector<const timeline::Cel*> result;const auto& state=document.timeline().state();
 for(const auto& cel:state.cels)result.push_back(&cel);return result;
}
JsonArray pixelPath(std::size_t index){JsonArray path;for(const auto& part:std::vector<std::string>{"animation","cels",std::to_string(index),"surface","pixels"})path.Append(text(part));return path;}
JsonObject origin(const timeline::Surface& surface){JsonObject result;result.SetNamedValue(L"x",number(surface.storageOriginX.value_or(0)));result.SetNamedValue(L"y",number(surface.storageOriginY.value_or(0)));return result;}
}
std::string documentShape(const Document& document){
 Apartment apartment;JsonArray fields;fields.Append(number(document.width()));fields.Append(number(document.height()));fields.Append(text("rgba"));fields.Append(text("rgba32"));
 // Native palette DTO differs from legacy JSON; this token is compared only
 // within one native session, retaining legacy palette entry fields (layout is separate in legacy).
 JsonArray palette;for(const auto& entry:document.palette().entries){JsonArray row;row.Append(number(entry.id));row.Append(JsonValue::CreateStringValue(utf16(entry.name)));row.Append(number(entry.color));palette.Append(row);}fields.Append(palette);
 JsonArray layers;const auto& state=document.timeline().state();
 for(auto it=state.layers.rbegin();it!=state.layers.rend();++it){JsonArray row;row.Append(text(it->id));row.Append(text(it->kind));row.Append(text("rgba"));row.Append(text(it->linkedContentId));layers.Append(row);}fields.Append(layers);
 JsonArray frames;for(const auto& frame:state.frames)frames.Append(text(frame.id));fields.Append(frames);
 std::map<const void*,std::size_t> aliases;JsonArray cels;
 for(const auto* cel:orderedCels(document)){
  JsonArray row;row.Append(text(cel->id));row.Append(text(cel->layerId));row.Append(text(cel->frameId));row.Append(cel->linkedCelId?text(*cel->linkedCelId):JsonValue::CreateNullValue());
  const auto resolved=document.timeline().resolveSurface(cel->id);if(!resolved.surface)throw std::logic_error("Missing committed history surface");const auto& s=*resolved.surface;
  JsonArray surface;surface.Append(text("rgba"));for(auto n:{s.width,s.height,s.offsetX,s.offsetY,s.storageOriginX.value_or(0),s.storageOriginY.value_or(0)})surface.Append(number(n));
  const auto alias=aliases.emplace(s.pixels.identity(),aliases.size()).first->second;surface.Append(number(double(alias)));surface.Append(number(double(s.pixels.size())*4));row.Append(surface);cels.Append(row);
 }fields.Append(cels);return winrt::to_string(fields.Stringify());
}
CommittedCapture::CommittedCapture(const Document& document):document_(&document),idle_(!document.active()),identity_(document.identity_),state_(document.state_),historyRevision_(document.historyRevision_),shape_(documentShape(document)){}
std::optional<Delta> CommittedCapture::capture(const Document& document,project::Limits limits)const{
 Apartment apartment;
 if(&document!=document_||!idle_||document.identity_!=identity_||document.active()||document.historyRevision_!=historyRevision_+1||!document.history_.position()||documentShape(document)!=shape_)return {};
 if(document.history_.at(document.history_.position()-1).beforeState!=state_)return {};
 return latest(document,document.historyRevision_,limits);
}
std::optional<Delta> CommittedCapture::latest(const Document& document,std::uint64_t expectedHistoryRevision,project::Limits limits){
 Apartment apartment;
 if(!expectedHistoryRevision||document.historyRevision_!=expectedHistoryRevision||document.active()||document.groupingHistory_||!document.history_.position())return {};
 const auto& edit=document.history_.at(document.history_.position()-1);
 if(edit.afterState!=document.state_||!edit.documentChanged||(edit.pixels.empty()&&edit.contentHistory.runs.empty()&&!edit.contentHistory.dense))return {};
 // Native Edit unifies structural/property/pixel history. Only the leaf pixel
 // entry corresponds to legacy getCommittedPixelChanges; other entries retain
 // checkpoints rather than silently losing their nonpixel state.
 if(!std::holds_alternative<std::monostate>(edit.terminalHistory)||!edit.children.empty()||edit.maskHistory.beforeMasks||edit.snapshotHistory.beforeRollback||edit.sliceHistory.beforeSlices||edit.snapshotHistory.beforeDimensions||edit.snapshotHistory.beforeTimeline||edit.tileHistory.beforeTileSelection||edit.layerHistory.layerTilesets||edit.tileHistory.beforeTilesetSlots||edit.layerHistory.beforeLayerMetadata||edit.contentHistory.restoredClipboard||edit.pixelSelectionHistory.beforeTrimPivot||!edit.layerHistory.beforeLayerOpacityProjection.empty()||edit.pixelSelectionHistory.pixelSelectionEdit||edit.paletteHistory.beforePalette||edit.paletteHistory.beforePaletteView||edit.layerHistory.beforeVisible||edit.layerHistory.beforeLocked||edit.layerHistory.beforeAutoLink||!edit.layerHistory.beforeOrder.empty()||edit.layerHistory.detachedLayer||edit.contentHistory.detachedCel||!edit.contentHistory.detachedCels.empty()||!edit.contentHistory.beforeCels.empty()||edit.frameHistory.beforeLoops||edit.frameHistory.beforeAnimationLoop||edit.beforeSelection||edit.contentHistory.celProperties||edit.beforeTimelineSelection||edit.beforeFrameAnchor||edit.frameHistory.detachedFrame||!edit.frameHistory.detachedFrames.empty()||!edit.frameHistory.beforeFrames.empty()||edit.frameHistory.beforeDisabled.size()||edit.frameHistory.beforeDuration||edit.layerHistory.beforeOpacity||edit.layerHistory.beforeBlendMode||edit.layerHistory.beforeName||edit.paletteHistory.paletteKind||edit.maskHistory.maskContext||!edit.contentHistory.surfaceChanges.empty()||!edit.contentHistory.ownerOffsets.empty()||!edit.contentHistory.textChanges.empty()||edit.layerHistory.beforeLayerStructure||edit.layerHistory.beforeGroupUi||edit.tileHistory.beforeFreeTileSelection)return {};
 const auto resolved=document.timeline().resolveSurface(edit.contentHistory.targetCelId);if(!resolved.source||!resolved.surface||resolved.source->text||resolved.source->tilemap||resolved.source->freeTiles)return {};
 const auto& surface=*resolved.surface;const auto& layers=document.timeline().state().layers;
 const auto layer=std::find_if(layers.begin(),layers.end(),[&](const auto& value){return value.id==resolved.source->layerId;});if(layer==layers.end()||!layer->kind.empty())return {};
 const auto cels=orderedCels(document);std::size_t target=cels.size();JsonArray aliases;
 for(std::size_t i=0;i<cels.size();++i){if(cels[i]->id==resolved.source->id)target=i;
  const auto other=document.timeline().resolveSurface(cels[i]->id);if(!other.surface) return {};
  if(other.surface->pixels.identity()==surface.pixels.identity()){
   if(other.surface->pixels.size()!=surface.pixels.size())return {};
   aliases.Append(pixelPath(i));
  }
 }if(target==cels.size())return {};
 const auto address=edit.contentHistory.pixelAddress.value_or(Document::PixelAddressSpace{document.width_,document.height_,0,0});
 if(address.width<1||address.height<1||surface.width<1||surface.height<1)return {};
 Delta result;JsonObject root;JsonArray patches;std::size_t retained=0;
 auto add=[&](std::int64_t x,std::int64_t y,std::size_t count,const Pixel* before,const Pixel* after,Pixel beforeFill,Pixel afterFill)->bool{
  x+=std::int64_t(address.originX)-surface.storageOriginX.value_or(0);y+=std::int64_t(address.originY)-surface.storageOriginY.value_or(0);
  if(x<0||y<0||x>surface.width||y>=surface.height||count>std::size_t(surface.width-x))return false;
  if(count>(limits.expandedBytes-retained)/8||patches.Size()>=limits.maxEntries)throw project::Error(project::ErrorKind::Limit,"Committed history exceeds budget");
  auto left=std::make_shared<Bytes>(count*4),right=std::make_shared<Bytes>(count*4);
  for(std::size_t i=0;i<count;++i)for(unsigned c=0;c<4;++c){(*left)[i*4+c]=std::uint8_t((before?before[i]:beforeFill)>>(c*8));(*right)[i*4+c]=std::uint8_t((after?after[i]:afterFill)>>(c*8));}
  JsonObject patch;patch.SetNamedValue(L"path",pixelPath(target));if(aliases.Size()>1)patch.SetNamedValue(L"aliases",aliases);patch.SetNamedValue(L"offset",number(double(std::uint64_t(y)*surface.width+x)*4));
  patch.SetNamedValue(L"before",JsonValue::CreateNullValue());patch.SetNamedValue(L"after",JsonValue::CreateNullValue());
  const auto index=patches.Size();result.buffers.push_back({index,false,"Uint8Array",left});result.buffers.push_back({index,true,"Uint8Array",right});patches.Append(patch);retained+=count*8;return true;
 };
 if(edit.contentHistory.dense){const auto& d=*edit.contentHistory.dense;if(d.x<0||d.y<0||d.width<1||d.height<1||std::int64_t(d.x)+d.width>address.width||std::int64_t(d.y)+d.height>address.height||std::uint64_t(d.width)*d.height!=d.before.size()||d.before.size()!=d.after.size())return {};
  for(int row=0;row<d.height;++row)if(!add(d.x,std::int64_t(d.y)+row,d.width,d.before.data()+std::size_t(row)*d.width,d.after.data()+std::size_t(row)*d.width,0,0))return {};
 }
 const auto size=std::uint64_t(address.width)*address.height;
 for(const auto& run:edit.contentHistory.runs){if(run.index>size||run.length>size-run.index)return {};auto index=run.index,left=run.length;while(left){const auto count=std::min(left,std::size_t(address.width)-index%std::size_t(address.width));if(!add(index%std::size_t(address.width),index/std::size_t(address.width),count,nullptr,nullptr,run.before,run.after))return {};index+=count;left-=count;}}
 for(const auto& point:edit.pixels){if(point.index>=size||!add(point.index%std::size_t(address.width),point.index/std::size_t(address.width),1,nullptr,nullptr,point.before,point.after))return {};}
 JsonArray origins;for(auto it=layers.rbegin();it!=layers.rend();++it){const auto* cel=document.timeline().findCel(it->id,document.frame().id);const auto r=cel?document.timeline().resolveSurface(cel->id):timeline::Resolution{};if(!r.surface)return {};origins.Append(origin(*r.surface));}
 JsonObject originPair;originPair.SetNamedValue(L"before",origins);originPair.SetNamedValue(L"after",origins);root.SetNamedValue(L"origins",originPair);root.SetNamedValue(L"patches",patches);
 // winrt to_hstring accepts UTF32 only through an explicit UTF16 conversion.
 root.SetNamedValue(L"label",JsonValue::CreateStringValue(utf16(edit.label)));root.SetNamedValue(L"bytes",number(double(retained)));
 JsonArray affected;for(auto it=layers.rbegin();it!=layers.rend();++it)if(it->id==layer->id||(!layer->linkedContentId.empty()&&it->linkedContentId==layer->linkedContentId))affected.Append(text(it->id));
 JsonObject invalidation;const auto dirty=document.lastContentChange();
 const auto* requested=document.timeline().findCelById(edit.contentHistory.targetCelId);
 if(affected.Size()>1||dirty.empty())invalidation.SetNamedValue(L"kind",text("full"));else{invalidation.SetNamedValue(L"kind",text("region"));invalidation.SetNamedValue(L"frameId",text(requested?requested->frameId:resolved.source->frameId));JsonObject rect;rect.SetNamedValue(L"x",number(dirty.x));rect.SetNamedValue(L"y",number(dirty.y));rect.SetNamedValue(L"width",number(dirty.w));rect.SetNamedValue(L"height",number(dirty.h));invalidation.SetNamedValue(L"rect",rect);}root.SetNamedValue(L"invalidation",invalidation);
 root.SetNamedValue(L"affectedLayerIds",affected);root.SetNamedValue(L"requiresAnimationSelectionNormalization",JsonValue::CreateBooleanValue(false));root.SetNamedValue(L"snapshotFrameId",text(document.frame().id));
 JsonObject celTarget;celTarget.SetNamedValue(L"index",number(double(target)));celTarget.SetNamedValue(L"id",text(resolved.source->id));celTarget.SetNamedValue(L"layerId",text(resolved.source->layerId));celTarget.SetNamedValue(L"frameId",text(resolved.source->frameId));root.SetNamedValue(L"celTarget",celTarget);
 result.json=winrt::to_string(root.Stringify());if(result.json.size()>limits.manifestBytes)throw project::Error(project::ErrorKind::Limit,"Committed history metadata exceeds budget");return result;
}
}
