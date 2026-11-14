#include "local_history_resource_cost.h"
#include "document.h"
#include "project_manifest.h"
#include "gradient_map_presets.h"
#include "local_history_raster_cost.h"
#include "text_project_json.h"
#include <codecvt>
#include <locale>
#include <unordered_map>
#include <unordered_set>
namespace moon::local_history {
namespace {
std::size_t scalars(HistoryCostBuilder& b,int count){const auto out=b.object();for(int i=0;i<count;++i)b.add(out,b.node());return out;}
std::size_t textRectangle(HistoryCostBuilder& b,const TextRect& rect){
 if(rect.projectProperties.empty())return scalars(b,4);
 const auto status=RoInitialize(RO_INIT_MULTITHREADED);if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize history text parser");
 struct Apartment {HRESULT status;~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}} apartment{status};
 using namespace winrt::Windows::Data::Json;
 // Project JSON is a tree. Spread keeps its nested extension objects; every
 // decoded rectangle has its own tree, so no cross-rectangle identity aliases.
 std::vector<std::pair<IJsonValue,std::size_t>> pending;
 const auto append=[&](const IJsonValue& value){
  if(value.ValueType()==JsonValueType::String){const auto text=value.GetString();HistoryCostValue node;node.kind=HistoryCostValue::Kind::String;node.string.assign(reinterpret_cast<const char16_t*>(text.data()),text.size());return b.node(std::move(node));}
  if(value.ValueType()==JsonValueType::Object||value.ValueType()==JsonValueType::Array){const auto node=b.object();pending.emplace_back(value,node);return node;}return b.node();
 };
 const auto root=append(JsonValue::Parse(winrt::hstring(reinterpret_cast<const wchar_t*>(rect.projectProperties.data()),std::uint32_t(rect.projectProperties.size()))));
 while(!pending.empty()){
  const auto [value,owner]=std::move(pending.back());pending.pop_back();
  if(value.ValueType()==JsonValueType::Array){for(const auto& child:value.GetArray())b.add(owner,append(child));continue;}
  struct Field {std::uint64_t index;IJsonValue value;};std::vector<Field> fields;
  const auto object=value.GetObject();for(const auto& key:project::textjson::orderedObjectKeys(object)){
   std::uint64_t index=0;bool indexed=!key.empty()&&(key.size()==1||key[0]!=L'0');
   for(const auto c:key){if(c<L'0'||c>L'9'||index>=4294967295ULL){indexed=false;break;}index=index*10+(c-L'0');}if(index>=4294967295ULL)indexed=false;
   fields.push_back({indexed?index:UINT64_MAX,object.GetNamedValue(key)});
  }
  // Object.values visits canonical array-index keys first in numeric order,
  // then all remaining keys in insertion order, including "01"/"4294967295".
  std::stable_sort(fields.begin(),fields.end(),[](const auto& a,const auto& c){return a.index<c.index;});for(const auto& field:fields)b.add(owner,append(field.value));
 }
 return root;
}
std::size_t textCel(HistoryCostBuilder& b,const TextCelData& text){
 const auto root=b.object();b.add(root,b.string(textUtf32(text.text)));b.add(root,b.string(text.fontFamily));for(int i=0;i<3;++i)b.add(root,b.node());
 b.add(root,b.string(std::string(text.actualSpacing?"actual":"font")));b.add(root,b.string(std::string(text.smooth?"smooth":"pixel")));b.add(root,b.string(std::string(text.boxed?"box":"free")));b.add(root,b.string(std::string(text.align==TextCelData::Align::Center?"center":text.align==TextCelData::Align::Right?"right":"left")));b.add(root,scalars(b,4));
 if(!text.styleRuns.empty()){const auto runs=b.object();for(const auto& run:text.styleRuns){const auto item=b.object();b.add(item,b.node());b.add(item,b.node());if(run.fontSize)b.add(item,b.node());if(run.lineSpacing)b.add(item,b.node());if(run.letterSpacing)b.add(item,b.node());
   // normalizeTextStyleRuns always enumerates color, including undefined.
   b.add(item,run.color?scalars(b,4):b.node());b.add(runs,item);}b.add(root,runs);}
 if(text.originX)b.add(root,b.node());if(text.originY)b.add(root,b.node());if(text.boxed){b.add(root,b.node());b.add(root,b.node());}
 if(!text.transforms.empty()){const auto transforms=b.object();for(const auto& transform:text.transforms){const auto item=b.object();b.add(item,textRectangle(b,transform.source));b.add(item,textRectangle(b,transform.target));b.add(item,b.node());if(transform.shear){const auto shear=b.object();b.add(shear,b.string(std::string(1,transform.shear->axis)));b.add(shear,b.string(std::string(1,transform.shear->edge)));b.add(shear,b.node());b.add(item,shear);}b.add(transforms,item);}b.add(root,transforms);}
 return root;
}
std::string ditherName(int value){if(value<0||value>=int(GradientMapPresetStore::ditherNames().size()))throw std::invalid_argument("Invalid history style dither");return GradientMapPresetStore::ditherNames()[value];}
std::size_t gradientMap(HistoryCostBuilder& b,const GradientMapSettings& settings){
 const auto root=b.object(),stops=b.object();b.add(root,stops);for(const auto& stop:settings.stops){const auto item=b.object();b.add(item,b.node());b.add(item,scalars(b,4));b.add(stops,item);}b.add(root,b.string(std::string(settings.steps?"steps":"continuous")));b.add(root,b.string(ditherName(settings.dither)));b.add(root,b.node());return root;
}
std::size_t backgroundSettings(HistoryCostBuilder& b,const timeline::BackgroundSettings& settings){
 const auto root=b.object();b.add(root,b.string(settings.mode));if(settings.mode=="preset")b.add(root,b.string(settings.pattern));else if(settings.mode=="canvas"){if(settings.repeatWidth>0){b.add(root,b.node());b.add(root,b.node());}}else throw std::invalid_argument("Invalid initial history background mode");return root;
}
std::size_t adjustmentSettings(HistoryCostBuilder& b,const timeline::LayerAdjustment& settings){const auto root=b.object();b.add(root,b.string(std::string("gradient-map")));b.add(root,b.node());b.add(root,gradientMap(b,settings.gradientMap));return root;}
std::size_t layerStyles(HistoryCostBuilder& b,const timeline::ColorOverlayStyle& style){
 const auto root=b.object();b.add(root,b.node());
 const auto map=gradientMap(b,style.gradientMap);b.add(map,b.node());b.add(map,b.string(std::string("layer")));b.add(root,map);
 const auto stroke=b.object();b.add(stroke,b.node());b.add(stroke,scalars(b,4));b.add(stroke,b.node());
 if(style.stroke.position<0||style.stroke.position>2||style.stroke.kernel<0||style.stroke.kernel>3)throw std::invalid_argument("Invalid history stroke shape");
 const char* positions[]{"inside","outside","both"};const char* kernels[]{"round","square","horizontal","vertical"};
 b.add(stroke,b.string(std::string(positions[style.stroke.position])));b.add(stroke,b.string(std::string(kernels[style.stroke.kernel])));b.add(stroke,scalars(b,8));for(int i=0;i<3;++i)b.add(stroke,b.node());b.add(root,stroke);
 const auto shadow=b.object();b.add(shadow,b.node());b.add(shadow,scalars(b,4));for(int i=0;i<5;++i)b.add(shadow,b.node());b.add(root,shadow);
 const auto glow=b.object();b.add(glow,b.node());b.add(glow,scalars(b,4));b.add(glow,b.node());b.add(root,glow);
 const auto overlay=b.object();b.add(overlay,b.node());b.add(overlay,scalars(b,4));b.add(root,overlay);
 const auto gradient=b.object();b.add(gradient,b.node());b.add(gradient,scalars(b,4));b.add(gradient,scalars(b,4));b.add(gradient,b.node());b.add(gradient,b.string(ditherName(style.gradientDither)));b.add(root,gradient);
 return root;
}
}
DecodedHistoryGroupShape::DecodedHistoryGroupShape(const project::ReadManifest& manifest){
 const auto status=RoInitialize(RO_INIT_MULTITHREADED);if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize history metadata parser");
 struct Apartment {HRESULT status;~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}} apartment{status};
 const auto document=winrt::Windows::Data::Json::JsonObject::Parse(winrt::to_hstring(manifest.manifestUtf8)).GetNamedObject(L"document");
 if(!document.HasKey(L"groups")){if(!manifest.groups.empty())throw std::invalid_argument("Missing history group source");return;}
 const auto groups=document.GetNamedArray(L"groups");if(groups.Size()!=manifest.groups.size())throw std::invalid_argument("Inconsistent history group source");
 for(std::size_t i=0;i<manifest.groups.size();++i){const auto& group=manifest.groups[i];const auto source=groups.GetAt(unsigned(i)).GetObject();if(winrt::to_string(source.GetNamedString(L"id"))!=group.id)throw std::invalid_argument("Inconsistent history group identity");entries_.push_back({group.id,group.parentGroupId,source.HasKey(L"parentGroupId")});}
}
std::size_t DecodedHistoryGroupShape::append(HistoryCostBuilder& b,const Document& document)const{
 const auto start=b.mark();try{
  const auto& groups=document.timeline().state().groups;if(groups.size()!=entries_.size())throw std::invalid_argument("Changed history group topology");const auto root=b.object();
  for(std::size_t i=0;i<groups.size();++i){const auto& group=groups[i];const auto& shape=entries_[i];if(group.id!=shape.id||group.parentGroupIdPresent!=shape.parentPresent||group.parentGroupId.value_or("")!=shape.parent)throw std::invalid_argument("Changed history group topology");
   const auto item=b.object();b.add(item,b.string(group.id));b.add(item,b.string(group.name));if(group.panelOrder)b.add(item,b.node());if(group.displayColor)b.add(item,scalars(b,4));if(!group.description.empty())b.add(item,b.string(group.description));
   if(shape.parentPresent)b.add(item,group.parentGroupId?b.string(*group.parentGroupId):b.node());for(int j=0;j<3;++j)b.add(item,b.node());b.add(item,b.string(group.blendMode));if(group.clippingMask)b.add(item,b.node());if(group.layerStyles)b.add(item,layerStyles(b,*group.layerStyles));if(group.cumulativeBlend)b.add(item,b.node());b.add(root,item);
  }return root;
 }catch(...){b.rollback(start);throw;}
}
struct InitialHistoryRasterObjects::Impl {
 std::shared_ptr<const project::ReadManifest> manifest;
 DecodedHistoryRasterStorage storage;
 const Document* document;std::uint64_t revision;std::string frame;
 HistoryMaskNames maskNames;
 std::unordered_map<std::string,const timeline::Layer*> layers;
 std::unordered_map<std::string,const project::ManifestCel*> cels;
 struct TileShape {bool beforeText=false;std::vector<std::size_t> sequence;};
 std::unordered_map<std::string,TileShape> tileShapes;
 std::unordered_set<std::string> emptyGroupLayers;
 std::unordered_map<std::string,const free_tiles::LayerData*> freeSets;
 static const project::ReadManifest& checked(const std::shared_ptr<const project::ReadManifest>& value){if(!value)throw std::invalid_argument("Missing history import source");return *value;}
 Impl(std::shared_ptr<const project::ReadManifest> source,const Document& value,HistoryMaskNames names):manifest(std::move(source)),storage(checked(manifest)),document(&value),revision(value.revision()),frame(value.frame().id),maskNames(std::move(names)){
  const auto& m=*manifest;const auto& state=value.timeline().state();
  if(m.colorMode!=color_mode::name(value.colorMode())||m.sourceArchive!=value.sourceArchive()||m.id!=value.projectId()||m.activeFrameId!=frame||m.layers.size()!=state.layers.size()||m.cels.size()!=state.cels.size()||m.masks.size()!=state.masks.size())throw std::invalid_argument("Inconsistent history import source");
  for(std::size_t i=0;i<m.masks.size();++i){const auto& expected=m.masks[i];const auto& slot=state.masks[i];if(expected.id!=slot.mask.id||expected.ownerId!=slot.ownerId||expected.frameId!=slot.frameId||expected.group!=slot.group||(slot.group?maskNames.group:maskNames.layer).empty())throw std::invalid_argument("Missing history mask shape or decoder name");}
  for(const auto& layer:state.layers){if((!layer.kind.empty()&&layer.kind!="text"&&layer.kind!="adjustment"&&layer.kind!="tilemap"&&layer.kind!="free-tile")||(layer.kind=="adjustment"&&!layer.adjustment))throw std::invalid_argument("Special history layer requires storage adapter");layers.emplace(layer.id,&layer);}
  for(std::size_t i=0;i<m.cels.size();++i){const auto& cel=m.cels[i];if(cel.id!=state.cels[i].id)throw std::invalid_argument("Special or reordered history cel");cels.emplace(cel.id,&cel);}
  for(const auto& layer:m.layers)if(!layers.count(layer.id))throw std::invalid_argument("Unknown history layer");
  for(const auto& layer:state.layers)if(layer.kind=="free-tile"){
   if(!layer.freeTiles||layer.freeTiles->setId.empty()||!layer.freeTiles->legacyTilesetId.empty()||layer.freeTiles->sources.empty())throw std::invalid_argument("Legacy free-tile ownership requires migration context");
   const auto& data=*layer.freeTiles;for(const auto& source:data.sources)if(source.name.empty())throw std::invalid_argument("Missing decoded free-tile locale name");const auto [found,created]=freeSets.emplace(data.setId,&data);
   if(!created){const auto& expected=found->second->sources;if(data.sources.size()!=expected.size())throw std::invalid_argument("Inconsistent shared free-tile sources");for(std::size_t i=0;i<data.sources.size();++i){const auto& a=data.sources[i];const auto& e=expected[i];if(std::tie(a.id,a.name,a.tilesetId,a.description,a.displayColor,a.visible,a.locked,a.opacity,a.blendMode,a.offsetX,a.offsetY)!=std::tie(e.id,e.name,e.tilesetId,e.description,e.displayColor,e.visible,e.locked,e.opacity,e.blendMode,e.offsetX,e.offsetY))throw std::invalid_argument("Inconsistent shared free-tile source values");}}
  }


  // normalizeAnimationTimeline sees the sparse manifest list as a dense array
  // only when its length equals the entire grid. Its preexisting tilemap field
  // then precedes decodeProject's explicit text field. No-data linked cels keep
  // that first normalization (list order), rather than decoded sparse indexes.
  const auto status=RoInitialize(RO_INIT_MULTITHREADED);if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize tilemap history parser");
  struct Apartment {HRESULT status;~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}} apartment{status};
  const auto rawDocument=winrt::Windows::Data::Json::JsonObject::Parse(winrt::to_hstring(m.manifestUtf8)).GetNamedObject(L"document");
  // decodeProject preserves an explicit empty string; native group membership
  // uses no owner for that value, so retain its transfer shape from the source.
  for(const auto& value:rawDocument.GetNamedArray(L"layers")){const auto raw=value.GetObject();const auto group=raw.TryLookup(L"groupId");if(group&&group.ValueType()==winrt::Windows::Data::Json::JsonValueType::String&&group.GetString().empty())emptyGroupLayers.insert(winrt::to_string(raw.GetNamedString(L"id")));}
  const auto rawCels=rawDocument.GetNamedObject(L"animation").GetNamedArray(L"cels");
  for(const auto& item:rawCels){if(item.ValueType()!=winrt::Windows::Data::Json::JsonValueType::Object)continue;const auto raw=item.GetObject();const auto found=cels.find(project::textjson::str(raw,L"id"));if(found==cels.end())continue;const auto& cel=*found->second;
   if(!cel.tilemap||tileShapes.count(cel.id))continue;
   if(layers.at(cel.layerId)->kind!="tilemap")throw std::invalid_argument("Tilemap history metadata on raster layer");
   auto& shape=tileShapes[cel.id];const auto entries=raw.GetNamedObject(L"tilemap").GetNamedArray(L"cells");shape.beforeText=entries.Size()==cel.tilemap->cells.size();
   if(shape.beforeText&&!cel.surface)for(const auto& entry:entries)shape.sequence.push_back(std::size_t(entry.GetObject().GetNamedNumber(L"index")));
  }
  for(const auto& cel:m.cels)if(cel.tilemap&&!tileShapes.count(cel.id))throw std::invalid_argument("Missing tilemap history shape");

 }
};
InitialHistoryRasterObjects::InitialHistoryRasterObjects(std::shared_ptr<const project::ReadManifest> source,const Document& document,HistoryMaskNames names):impl_(std::make_unique<Impl>(std::move(source),document,std::move(names))){}
InitialHistoryRasterObjects::~InitialHistoryRasterObjects()=default;
HistoryRasterObjectRoots InitialHistoryRasterObjects::append(HistoryCostBuilder& b,const Document& document)const{
 const auto start=b.mark();try{
  const auto& plan=*impl_;const auto& m=*plan.manifest;
  if(&document!=plan.document||document.revision()!=plan.revision||document.frame().id!=plan.frame||document.sourceArchive()!=m.sourceArchive)throw std::invalid_argument("Stale initial history raster objects");
  HistoryRasterObjectRoots out{b.object(),b.object(),b.object(),b.object()};
  const auto storage=[&](std::size_t owner,const project::ManifestRaster& raster){const auto roots=plan.storage.append(b,raster);b.add(owner,roots.pixels);if(roots.runtimeRaster)b.add(owner,*roots.runtimeRaster);};
  const auto renderedStorage=[&](std::size_t owner,const project::ManifestCel& cel){const auto count=cel.tilemap?std::uint64_t(cel.tilemap->columns)*cel.tilemap->tileWidth*cel.tilemap->rows*cel.tilemap->tileHeight:std::uint64_t(cel.surface->width)*cel.surface->height;if(!count||count>project::Limits{}.expandedBytes/4)throw std::invalid_argument("Invalid rendered history storage");b.add(owner,b.view(&cel,std::size_t(count)*4));};
  const auto tilemap=[&](const project::ManifestCel& cel){const auto& grid=*cel.tilemap;const auto& shape=plan.tileShapes.at(cel.id);const auto item=b.object();for(int i=0;i<4;++i)b.add(item,b.node());const auto cells=b.object();b.add(item,cells);
   const auto appendCell=[&](const std::optional<tiles::Cell>& cell){if(!cell){b.add(cells,b.node());return;}const auto value=b.object();b.add(value,b.string(cell->tilesetId));b.add(value,b.string(cell->tileId));if(cell->flipHorizontal)b.add(value,b.node());if(cell->flipVertical)b.add(value,b.node());if(cell->rotation)b.add(value,b.node());b.add(cells,value);};
   if(!cel.surface&&shape.beforeText){for(auto index:shape.sequence)appendCell(grid.cells.at(index));}else for(const auto& cell:grid.cells)appendCell(cell);return item;
  };
  const auto freeSources=[&](const free_tiles::LayerData& data){const auto& sources=plan.freeSets.at(data.setId)->sources;const auto [root,created]=b.object(&sources);if(created)for(const auto& source:sources){const auto item=b.object();b.add(item,b.string(source.id));b.add(item,b.string(source.name));b.add(item,b.string(source.tilesetId));if(!source.description.empty())b.add(item,b.string(source.description));if(source.displayColor)b.add(item,scalars(b,4));for(int i=0;i<3;++i)b.add(item,b.node());b.add(item,b.string(source.blendMode));for(int i=0;i<2;++i)b.add(item,b.node());b.add(root,item);}return root;};
  const auto freeCel=[&](const free_tiles::CelData& data){const auto root=b.object(),instances=b.object();b.add(root,instances);for(const auto& instance:data.instances){const auto item=b.object();b.add(item,b.string(instance.id));b.add(item,b.string(instance.sourceId));for(int i=0;i<4;++i)b.add(item,b.node());if(instance.opacity)b.add(item,b.node());if(instance.blendMode)b.add(item,b.string(*instance.blendMode));if(instance.rotation)b.add(item,b.node());if(instance.flipHorizontal)b.add(item,b.node());if(instance.flipVertical)b.add(item,b.node());b.add(instances,item);}return root;};
  // Layer objects are projections, never the cel.surface object itself. Resolve
  // only the displayed storage; preserve each original cel object's own shape.
  std::unordered_map<std::string,const project::ManifestCel*> active;
  for(const auto& cel:m.cels)if(cel.frameId==plan.frame)active.emplace(cel.layerId,&cel);
  for(const auto& metadata:m.layers){
   const auto& layer=*plan.layers.at(metadata.id);const auto found=active.find(layer.id);if(found==active.end())throw std::invalid_argument("Missing initial projected cel");const auto* cel=found->second;
   for(std::size_t steps=0;!cel->linkedCelId.empty();++steps){if(steps>=m.cels.size())throw std::invalid_argument("Cyclic history projection");cel=plan.cels.at(cel->linkedCelId);}
   if(!cel->surface)throw std::invalid_argument("Missing initial projected storage");
   const auto item=b.object();b.add(item,b.string(layer.id));b.add(item,b.string(layer.name));if(!layer.linkedContentId.empty())b.add(item,b.string(layer.linkedContentId));if(layer.autoLinkAnimationCels)b.add(item,b.node());b.add(item,b.string(layer.description));for(int i=0;i<3;++i)b.add(item,b.node());b.add(item,b.string(layer.blendMode));if(layer.clippingMask)b.add(item,b.node());if(layer.layerStyles)b.add(item,layerStyles(b,*layer.layerStyles));if(layer.adjustment)b.add(item,adjustmentSettings(b,*layer.adjustment));if(layer.background)b.add(item,backgroundSettings(b,*layer.background));if(!layer.kind.empty())b.add(item,b.string(layer.kind));if(layer.kind=="tilemap")b.add(item,b.string(layer.tilemapTilesetId));if(layer.kind=="free-tile"){b.add(item,b.string(layer.freeTiles->setId));b.add(item,freeSources(*layer.freeTiles));}b.add(item,layer.groupId?b.string(*layer.groupId):plan.emptyGroupLayers.count(layer.id)?b.string(std::string{}):b.node());if(metadata.displayColor)b.add(item,scalars(b,4));for(int i=0;i<4;++i)b.add(item,b.node());b.add(item,b.string(std::string(color_mode::name(document.colorMode()))));if(cel->tilemap||cel->freeTiles)renderedStorage(item,*cel);else storage(item,*cel->surface);b.add(out.layers,item);
  }
  for(const auto& cel:m.cels){
   const auto item=b.object();b.add(item,b.string(cel.id));b.add(item,b.string(cel.layerId));b.add(item,b.string(cel.frameId));if(!cel.linkedCelId.empty())b.add(item,b.string(cel.linkedCelId));if(cel.zIndex)b.add(item,b.node());if(cel.opacity)b.add(item,b.node());
   const bool tileBefore=cel.tilemap&&plan.tileShapes.at(cel.id).beforeText;
   if(tileBefore)b.add(item,tilemap(cel));
   if(cel.freeTiles)b.add(item,freeCel(*document.timeline().findCelById(cel.id)->freeTiles));
   // decodeProject explicitly assigns text: undefined even to ordinary cels.
   b.add(item,cel.text?textCel(b,*cel.text):b.node());
   if(cel.tilemap&&!tileBefore&&cel.surface)b.add(item,tilemap(cel));
   if(cel.surface){const auto surface=b.object();b.add(surface,b.string(std::string(color_mode::name(document.colorMode()))));for(int i=0;i<((cel.tilemap||cel.freeTiles)?4:6);++i)b.add(surface,b.node());if(cel.tilemap||cel.freeTiles)renderedStorage(surface,cel);else storage(surface,*cel.surface);b.add(item,surface);}
   b.add(out.cels,item);
  }
  for(const auto& slot:document.timeline().state().masks){
   const auto entry=b.object();b.add(entry,b.string(slot.ownerId));b.add(entry,b.string(slot.frameId));const auto mask=b.object();b.add(entry,mask);
   b.add(mask,b.string(slot.mask.id));b.add(mask,b.string(slot.group?plan.maskNames.group:plan.maskNames.layer));b.add(mask,b.string(std::string()));for(int i=0;i<3;++i)b.add(mask,b.node());b.add(mask,b.string(std::string("normal")));for(int i=0;i<4;++i)b.add(mask,b.node());b.add(mask,b.string(std::string(color_mode::name(document.colorMode()))));
   // decodeMask always allocates a new full RGBA buffer, including scalar input
   // and linked masks referring to an identical resource. No source ZIP alias.
   const auto& surface=slot.mask.surface;const auto count=std::uint64_t(surface.width)*surface.height;if(surface.width<1||surface.height<1||count!=surface.pixels.size()||count>project::Limits{}.expandedBytes/4)throw std::invalid_argument("Invalid decoded history mask storage");
   b.add(mask,b.view(&surface.pixels,std::size_t(count)*4));b.add(mask,b.string(std::string(slot.group?"group":"cel")));b.add(mask,b.string(slot.ownerId));if(!slot.mask.linkedMaskId.empty())b.add(mask,b.string(slot.mask.linkedMaskId));if(slot.mask.autoLinkAnimationCels)b.add(mask,b.node());b.add(slot.group?out.groupMasks:out.layerMasks,entry);
  }return out;
 }catch(...){b.rollback(start);throw;}
}
struct InitialHistoryDocumentMetadata::Impl {
 std::shared_ptr<const project::ReadManifest> manifest;
 const Document* document;std::uint64_t revision;std::string frame,active;
 std::string panelActive,outlinePosition="outside",outlineKernel="round";
 std::optional<std::string> panelGroup,panelAnchor;
 std::vector<std::string> selectedLayers,selectedGroups,collapsed;
 bool outline=false;
 Impl(std::shared_ptr<const project::ReadManifest> source,const Document& value):manifest(std::move(source)),document(&value),revision(value.revision()),frame(value.frame().id),active(value.layer().id){
  // Native import restores the normalized panel focus. Legacy decode retains
  // that focus separately from the document root's activeLayerId.
  if(!manifest||manifest->sourceArchive!=value.sourceArchive()||manifest->id!=value.projectId()||manifest->layerPanelState.activeLayerId!=active||manifest->activeFrameId!=frame)throw std::invalid_argument("Inconsistent history metadata source");
  const auto status=RoInitialize(RO_INIT_MULTITHREADED);if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize history metadata parser");
  struct Apartment {HRESULT status;~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}} apartment{status};
  using namespace winrt::Windows::Data::Json;
  const auto sourceDocument=JsonObject::Parse(winrt::to_hstring(manifest->manifestUtf8)).GetNamedObject(L"document");
  const auto objectField=[](const JsonObject& owner,const wchar_t* key){if(owner.HasKey(key)&&owner.GetNamedValue(key).ValueType()==JsonValueType::Object)return owner.GetNamedObject(key);return JsonObject{};};
  const auto text=[](const JsonObject& owner,const wchar_t* key)->std::optional<std::string>{if(owner.HasKey(key)&&owner.GetNamedValue(key).ValueType()==JsonValueType::String)return winrt::to_string(owner.GetNamedString(key));return {};};
  if(sourceDocument.HasKey(L"outlineSettings")){const auto type=sourceDocument.GetNamedValue(L"outlineSettings").ValueType();outline=type==JsonValueType::Object||type==JsonValueType::Array;}
  if(outline){const auto settings=objectField(sourceDocument,L"outlineSettings");const auto position=text(settings,L"position"),kernel=text(settings,L"kernel");if(position&&(*position=="inside"||*position=="outside"||*position=="both"))outlinePosition=*position;if(kernel&&(*kernel=="round"||*kernel=="square"||*kernel=="horizontal"||*kernel=="vertical"))outlineKernel=*kernel;}
  const auto panel=objectField(sourceDocument,L"layerPanelState");std::unordered_set<std::string> layerIds,groupIds;
  for(const auto& layer:manifest->layers)layerIds.insert(layer.id);for(const auto& group:manifest->groups)groupIds.insert(group.id);
  const auto ids=[&](const wchar_t* name,const std::unordered_set<std::string>& valid){std::vector<std::string> result;std::unordered_set<std::string> seen;if(panel.HasKey(name)&&panel.GetNamedValue(name).ValueType()==JsonValueType::Array)for(const auto& item:panel.GetNamedArray(name))if(item.ValueType()==JsonValueType::String){const auto id=winrt::to_string(item.GetString());if(valid.count(id)&&seen.insert(id).second)result.push_back(id);}return result;};
  selectedLayers=ids(L"selectedLayerIds",layerIds);selectedGroups=ids(L"selectedGroupIds",groupIds);collapsed=ids(L"collapsedGroupIds",groupIds);
  const auto requestedActive=text(panel,L"activeLayerId");const auto requested=requestedActive.value_or(manifest->activeLayerId);
  panelActive=layerIds.count(requested)?requested:!selectedLayers.empty()?selectedLayers.back():layerIds.count(manifest->activeLayerId)?manifest->activeLayerId:manifest->layers.empty()?std::string{}:manifest->layers.back().id;
  const auto requestedGroup=text(panel,L"selectedGroupId");if(requestedGroup&&groupIds.count(*requestedGroup)&&std::find(selectedGroups.begin(),selectedGroups.end(),*requestedGroup)!=selectedGroups.end())panelGroup=*requestedGroup;
  if(selectedLayers.empty()&&selectedGroups.empty()&&!panelActive.empty())selectedLayers.push_back(panelActive);
  const auto requestedAnchor=text(panel,L"layerSelectionAnchorId");if(requestedAnchor&&!requestedAnchor->empty()&&(layerIds.count(*requestedAnchor)||groupIds.count(*requestedAnchor)))panelAnchor=*requestedAnchor;
  else if(!selectedGroups.empty())panelAnchor=selectedGroups.back();else if(!selectedLayers.empty())panelAnchor=selectedLayers.back();else if(!panelActive.empty())panelAnchor=panelActive;
 }
};
InitialHistoryDocumentMetadata::InitialHistoryDocumentMetadata(std::shared_ptr<const project::ReadManifest> source,const Document& document):impl_(std::make_unique<Impl>(std::move(source),document)){}
InitialHistoryDocumentMetadata::~InitialHistoryDocumentMetadata()=default;
HistoryDocumentMetadataRoots InitialHistoryDocumentMetadata::append(HistoryCostBuilder& b,const Document& document)const{
 const auto start=b.mark();try{
  const auto& plan=*impl_;if(&document!=plan.document||document.revision()!=plan.revision||document.frame().id!=plan.frame||document.layer().id!=plan.active||document.sourceArchive()!=plan.manifest->sourceArchive)throw std::invalid_argument("Stale initial history document metadata");
  HistoryDocumentMetadataRoots out{};out.name=b.string(document.name());out.activeLayerId=b.string(plan.manifest->activeLayerId);
  if(plan.outline){const auto root=b.object();b.add(root,scalars(b,4));b.add(root,scalars(b,4));b.add(root,b.node());b.add(root,b.string(plan.outlinePosition));b.add(root,b.string(plan.outlineKernel));b.add(root,scalars(b,8));for(int i=0;i<4;++i)b.add(root,b.node());out.outlineSettings=root;}
  out.displaySettings=b.object();b.add(out.displaySettings,b.node());b.add(out.displaySettings,b.node());b.add(out.displaySettings,scalars(b,4));if(plan.manifest->symmetryCenter)b.add(out.displaySettings,scalars(b,2));out.statistics=scalars(b,3);
  const auto& information=document.projectInformation();out.createdAt=b.string(information.createdAt);out.updatedAt=b.string(information.updatedAt);
  out.layerPanelState=b.object();b.add(out.layerPanelState,b.string(plan.panelActive));const auto array=[&](const auto& values){const auto root=b.object();for(const auto& id:values)b.add(root,b.string(id));return root;};b.add(out.layerPanelState,array(plan.selectedLayers));b.add(out.layerPanelState,array(plan.selectedGroups));b.add(out.layerPanelState,plan.panelGroup?b.string(*plan.panelGroup):b.node());b.add(out.layerPanelState,plan.panelAnchor?b.string(*plan.panelAnchor):b.node());b.add(out.layerPanelState,array(plan.collapsed));
  return out;
 }catch(...){b.rollback(start);throw;}
}
HistoryResourceRoots appendDecodedHistoryResources(HistoryCostBuilder& b,const Document& document){
 // Roll back append-only preparation on allocation/validation failures. Existing
 // indices and edges are never modified; preparation cannot publish half a graph.
 const auto start=b.mark();
 try{
  HistoryResourceRoots out{};const auto& palette=document.palette();
  out.palette=b.object();
  for(const auto& entry:palette.entries){
   const auto item=b.object();b.add(item,b.node());b.add(item,b.string(entry.name));
   const auto color=b.object();for(int i=0;i<4;++i)b.add(color,b.node());b.add(item,color);b.add(out.palette,item);
  }
  out.paletteOrder=b.object();for(const auto id:palette.order())b.add(out.paletteOrder,b.node());
  out.paletteSlots=b.object();for(const auto id:palette.slots)b.add(out.paletteSlots,b.node());
  out.paletteColumns=b.node();out.nextColorId=b.node();
  out.customBrushes=b.object();
  for(const auto& resource:document.projectBrushes()){
   const auto& brush=resource.brush;
   if(brush.width<1||brush.height<1||std::uint64_t(brush.width)*brush.height!=brush.coverage.size()||(!brush.colors.empty()&&brush.colors.size()!=brush.coverage.size()))throw std::invalid_argument("Invalid history brush resource");
   const auto item=b.object();b.add(item,b.string(resource.metadata.id));b.add(item,b.string(resource.metadata.name));b.add(item,b.node());b.add(item,b.node());
   b.add(item,b.view(&brush.coverage,brush.coverage.size()));
   b.add(item,brush.colors.empty()?b.node():b.view(&brush.colors,brush.colors.size()*sizeof(Pixel)));
   b.add(item,b.node());b.add(item,b.node());b.add(out.customBrushes,item);
  }
  out.referenceImages=b.object();
  for(const auto& image:document.referenceImages()){
   validateReferenceImage(image);const auto item=b.object();b.add(item,b.string(image.id));b.add(item,b.node());b.add(item,b.node());
   b.add(item,b.view(image.pixels.get(),image.pixels->size()*sizeof(Pixel)));b.add(out.referenceImages,item);
  }
  out.slices=b.object();
  for(const auto& slice:document.slices()){
   const auto item=b.object();b.add(item,b.string(slice.id));b.add(item,b.string(slice.name));for(int i=0;i<4;++i)b.add(item,b.node());b.add(out.slices,item);
  }
  return out;
 }catch(...){b.rollback(start);throw;}
}
std::size_t appendHistoryRecording(HistoryCostBuilder& b,const Document& document){
 const auto start=b.mark();try{
  const auto& settings=document.timelapseSettings();const auto root=b.object();
  b.add(root,b.node());b.add(root,b.node());
  switch(settings.quality){case timelapse::Quality::Low:b.add(root,b.string(std::string("low")));break;case timelapse::Quality::Medium:b.add(root,b.string(std::string("medium")));break;case timelapse::Quality::High:b.add(root,b.string(std::string("high")));break;default:throw std::invalid_argument("Invalid history recording quality");}
  b.add(root,b.node());b.add(root,b.node());
  switch(settings.mode){case timelapse::Mode::Full:b.add(root,b.string(std::string("full")));break;case timelapse::Mode::Smart:b.add(root,b.string(std::string("smart")));break;default:throw std::invalid_argument("Invalid history recording mode");}
  const auto snapshots=b.object();b.add(root,snapshots);
  for(const auto& frame:settings.snapshots){
   const auto item=b.object();b.add(item,b.string(frame.id));for(int i=0;i<5;++i)b.add(item,b.node());
   if(frame.historyDataBacking){const auto& backing=*frame.historyDataBacking;if(!backing.buffer||backing.viewLength!=frame.data.size()||backing.viewLength>backing.buffer->size())throw std::invalid_argument("Stale history recording backing");b.add(item,b.view(backing.buffer.get(),backing.buffer->size(),&frame.data));}
   else b.add(item,b.view(&frame.data,frame.data.size()));
   if(frame.local){const auto local=b.object();b.add(local,b.string(frame.local->store));b.add(local,b.string(frame.local->chunk));for(int i=0;i<3;++i)b.add(local,b.node());b.add(item,local);}
   b.add(snapshots,item);
  }
  return root;
 }catch(...){b.rollback(start);throw;}
}
struct InitialHistoryDocumentCost::Impl {
 std::shared_ptr<const project::ReadManifest> manifest;HistoryDecodeContext context;
 InitialHistoryRasterObjects raster;InitialHistoryDocumentMetadata metadata;DecodedHistoryGroupShape groups;
 std::string pixelFormat="rgba32";
 static const project::ReadManifest& checked(const std::shared_ptr<const project::ReadManifest>& value){if(!value||value->schemaVersion!=21||!value->unsupported.empty())throw std::invalid_argument("Unsupported initial history document source");return *value;}
 Impl(std::shared_ptr<const project::ReadManifest> source,const Document& document,HistoryDecodeContext decode):manifest(std::move(source)),context(std::move(decode)),raster(manifest,document,context.maskNames),metadata(manifest,document),groups(checked(manifest)){
  if(context.documentId.empty())throw std::invalid_argument("Missing decoded history document identity");
  const auto status=RoInitialize(RO_INIT_MULTITHREADED);if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize history metadata parser");
  struct Apartment {HRESULT status;~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}} apartment{status};
  using namespace winrt::Windows::Data::Json;const auto sourceDocument=JsonObject::Parse(winrt::to_hstring(manifest->manifestUtf8)).GetNamedObject(L"document");
  if(manifest->name.empty())throw std::invalid_argument("Untitled decode locale requires explicit name adaptation");
  const auto whitespace=[](char32_t c){return c==9||c==10||c==11||c==12||c==13||c==32||c==0xa0||c==0x1680||(c>=0x2000&&c<=0x200a)||c==0x2028||c==0x2029||c==0x202f||c==0x205f||c==0x3000||c==0xfeff;};
  for(const auto& group:manifest->groups)if(group.name.empty())throw std::invalid_argument("Default group decode locale requires name adaptation");
  // ensureFreeTileTilesetOwnership assigns the source name after ordinary tileset
  // normalization. A source name may contain only whitespace and is not trimmed.
  std::unordered_map<std::string,const std::string*> freeSourceNames;
  for(const auto& layer:document.timeline().state().layers)if(layer.freeTiles)for(const auto& source:layer.freeTiles->sources)freeSourceNames.emplace(source.tilesetId,&source.name);
  for(const auto& set:document.timeline().state().tilesets){
   if(const auto owner=freeSourceNames.find(set.id);owner!=freeSourceNames.end()){
    if(std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.to_bytes(set.name)!=*owner->second)throw std::invalid_argument("Stale free-tile owned resource name");
   }else if(set.name.empty()||whitespace(set.name.front())||whitespace(set.name.back()))throw std::invalid_argument("Unnormalized decoded tileset name");
  }
  for(const auto& section:document.timeline().state().loopSections){std::size_t units=0;for(const auto c:section.name)units+=c>0xffff?2:1;if(section.name.empty()||whitespace(section.name.front())||whitespace(section.name.back())||units>64)throw std::invalid_argument("Unnormalized decoded loop name");}
  if(sourceDocument.HasKey(L"createdAt")){const auto type=sourceDocument.GetNamedValue(L"createdAt").ValueType();if(type!=JsonValueType::String&&project::textjson::truthy(sourceDocument,L"createdAt"))throw std::invalid_argument("Nonstring createdAt requires decode adaptation");}
  if(sourceDocument.HasKey(L"pixelFormat")&&sourceDocument.GetNamedValue(L"pixelFormat").ValueType()==JsonValueType::String){const auto candidate=winrt::to_string(sourceDocument.GetNamedString(L"pixelFormat"));const char* formats[]{"rgba32","rgb24","rgb565","rgb555","rgb332","rgba4444","rgba5551","argb1555"};for(const auto* format:formats)if(candidate==format){pixelFormat=candidate;break;}}
  if(manifest->colorMode!=color_mode::name(document.colorMode()))throw std::invalid_argument("History color mode changed");
  if(color_mode::preferencePixelFormat(pixelFormat)!=document.pixelFormat())throw std::invalid_argument("History pixel format changed");
  if(sourceDocument.HasKey(L"canvasReferences")){const auto references=sourceDocument.GetNamedValue(L"canvasReferences");if(references.ValueType()==JsonValueType::Array&&references.GetArray().Size())throw std::invalid_argument("Canvas-reference history cost requires adapter");}
 }
};
InitialHistoryDocumentCost::InitialHistoryDocumentCost(std::shared_ptr<const project::ReadManifest> source,const Document& document,HistoryDecodeContext context):impl_(std::make_unique<Impl>(std::move(source),document,std::move(context))){}
InitialHistoryDocumentCost::~InitialHistoryDocumentCost()=default;
std::size_t InitialHistoryDocumentCost::append(HistoryCostBuilder& b,const Document& document)const{
 const auto start=b.mark();try{
  const auto& plan=*impl_;const auto root=b.object();
  // One builder for every field: the full source ZIP shared by raw cels and
  // recording PNGs must participate in a single identity-deduplicated traversal.
  const auto rasters=plan.raster.append(b,document);const auto meta=plan.metadata.append(b,document);const auto groups=plan.groups.append(b,document);const auto resources=appendDecodedHistoryResources(b,document);const auto timeline=appendDecodedHistoryTimelineMetadata(b,document);const auto recording=appendHistoryRecording(b,document);
  b.add(root,b.node());b.add(root,b.string(plan.context.documentId));b.add(root,meta.name);b.add(root,b.node());b.add(root,b.node());b.add(root,b.string(std::string(color_mode::name(document.colorMode()))));b.add(root,b.string(plan.pixelFormat));b.add(root,rasters.layers);b.add(root,groups);b.add(root,meta.activeLayerId);
  for(auto field:{resources.palette,resources.paletteOrder,resources.paletteColumns,resources.paletteSlots,resources.nextColorId,resources.customBrushes,resources.referenceImages})b.add(root,field);
  b.add(root,b.object());b.add(root,timeline.tilesets);
  const auto animation=b.object();for(auto field:{timeline.frames,rasters.cels,rasters.layerMasks,rasters.groupMasks,timeline.loopSections,timeline.activeFrameId,timeline.loop})b.add(animation,field);b.add(root,animation);
  if(meta.outlineSettings)b.add(root,*meta.outlineSettings);for(auto field:{meta.displaySettings,meta.statistics,recording,resources.slices})b.add(root,field);b.add(root,b.node());b.add(root,b.node());for(auto field:{meta.createdAt,meta.updatedAt,meta.layerPanelState})b.add(root,field);
  return root;
 }catch(...){b.rollback(start);throw;}
}
double InitialHistoryDocumentCost::bytes(const Document& document)const{HistoryCostGraph graph;HistoryCostBuilder builder(graph);return historyTransferGraphBytes(graph,append(builder,document));}
HistoryResourceRoots appendDecodedHistoryResources(HistoryCostGraph& graph,const Document& document){HistoryCostBuilder builder(graph);return appendDecodedHistoryResources(builder,document);}
HistoryTimelineMetadataRoots appendDecodedHistoryTimelineMetadata(HistoryCostBuilder& b,const Document& document){
 const auto start=b.mark();try{
  const auto& state=document.timeline().state();HistoryTimelineMetadataRoots out{};
  out.frames=b.object();
  for(const auto& frame:state.frames){const auto item=b.object();b.add(item,b.string(frame.id));b.add(item,b.node());if(frame.disabled)b.add(item,b.node());b.add(out.frames,item);}
  out.loopSections=b.object();
  for(const auto& section:state.loopSections){const auto item=b.object();b.add(item,b.string(section.id));b.add(item,b.string(section.name));b.add(item,b.string(section.startFrameId));b.add(item,b.string(section.endFrameId));b.add(item,b.string(section.direction));b.add(item,b.node());b.add(out.loopSections,item);}
  out.activeFrameId=b.string(document.frame().id);out.loop=b.node();out.tilesets=b.object();
  for(const auto& set:state.tilesets){
   const auto item=b.object();b.add(item,b.string(set.id));b.add(item,b.string(set.name));for(int i=0;i<4;++i)b.add(item,b.node());
   const auto ids=b.object();for(const auto& id:set.tileIds)b.add(ids,b.string(id));b.add(item,ids);
   const auto slots=b.object();for(const auto& id:set.tileSlots)b.add(slots,id?b.string(*id):b.node());b.add(item,slots);
   b.add(item,b.view(&set.pixels,set.pixels.size()*sizeof(Pixel)));b.add(out.tilesets,item);
  }
  return out;
 }catch(...){b.rollback(start);throw;}
}
std::size_t appendHistoryRecording(HistoryCostGraph& graph,const Document& document){HistoryCostBuilder builder(graph);return appendHistoryRecording(builder,document);}

}
