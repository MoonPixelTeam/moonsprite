#include "project_import.h"
#include "document.h"
#include "palette_layout.h"
#include "tilemap_project_json.h"
#include "layer_blend.h"
#include <algorithm>
#include <codecvt>
#include <locale>
#include <set>
#include <map>
#include <limits>
namespace moon::project {
Document createEditableDocument(PreparedImport imported){
 PaletteState palette;palette.entries.clear();palette.slots=std::move(imported.palette.slots);palette.setOrder(std::move(imported.palette.order));palette.nextId=imported.palette.nextId;palette.columns=imported.palette.columns;
 for(auto& e:imported.palette.entries)palette.entries.push_back({e.id,std::move(e.name),e.color});
 auto candidate=Document::fromImported(imported.width,imported.height,std::move(imported.timeline),std::move(palette),std::move(imported.id),std::move(imported.name),std::move(imported.sourceArchive),imported.activeFrameId);
 candidate.setImportedColorMode(color_mode::editableMode(imported.colorMode));candidate.setImportedPixelFormat(color_mode::preferencePixelFormat(imported.pixelFormat));candidate.setImportedOutlineSettings(std::move(imported.outline));candidate.setImportedProjectInformation(std::move(imported.information));candidate.setImportedReferenceImages(std::move(imported.referenceImages));candidate.setImportedSlices(std::move(imported.slices));candidate.setImportedTimelapse(std::move(imported.timelapse));candidate.setImportedProjectBrushes(std::move(imported.customBrushes));
 candidate.selectLayer(imported.activeLayerId);candidate.selectFrame(imported.activeFrameId);candidate.setImportedLoop(imported.loop);candidate.setPixelGrid(imported.showPixelGrid,false);candidate.setCustomGrid(imported.showCustomGrid,imported.customGrid,false);
 candidate.applyLayerPanelState(std::move(imported.layerPanelState));
 candidate.setImportedLayerGeometry(std::move(imported.layerGeometry));
 if(imported.symmetryCenter)candidate.setImportedSymmetryCenter({imported.symmetryCenter->first,imported.symmetryCenter->second});return candidate;
}
namespace {
void corrupt(bool invalid,const char* why) {if(invalid) throw Error(ErrorKind::Corrupt,why);}
void unsupported(bool invalid,const char* why) {if(invalid) throw Error(ErrorKind::Unsupported,why);}
std::u32string unicode(const std::string& text) {
 try {return std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.from_bytes(text);}
 catch(const std::range_error&) {throw Error(ErrorKind::Corrupt,"Invalid UTF-8 name");}
}
void raster(const ManifestRaster& s) {
 corrupt(s.width<1||s.height<1,"Invalid raster size");
 const auto w=std::size_t(s.width),h=std::size_t(s.height);
 corrupt(w>std::numeric_limits<std::size_t>::max()/h||w*h!=s.pixels.size(),"Raster pixel count mismatch");
 corrupt(std::int64_t(s.offsetX)+s.width>std::numeric_limits<int>::max()||std::int64_t(s.offsetY)+s.height>std::numeric_limits<int>::max(),"Raster world bounds exceed native coordinates");
}
struct BlankImportedPayloads{
 const ReadManifest& manifest;std::map<std::string,const tiles::CelData*> grids;std::map<std::string,const tiles::Tileset*> sheets;
 explicit BlankImportedPayloads(const ReadManifest& m):manifest(m){for(const auto& c:m.cels)if(c.tilemap)grids.emplace(c.layerId,&*c.tilemap);for(const auto& s:m.tilesets)sheets.emplace(s.id,&s);}
 void assign(ManifestCel& c,const ManifestLayer& layer)const{if(layer.kind=="free-tile")c.freeTiles=free_tiles::CelData{};if(layer.kind=="tilemap"){const auto model=grids.find(layer.id);if(model!=grids.end()){const auto& grid=*model->second;c.tilemap=tiles::CelData{grid.tileWidth,grid.tileHeight,grid.columns,grid.rows,std::vector<std::optional<tiles::Cell>>(grid.cells.size())};}else{const auto owner=sheets.find(layer.tilemapTilesetId);corrupt(owner==sheets.end(),"Missing layer tileset for empty grid");c.tilemap=tiles::blankCel(manifest.width,manifest.height,owner->second->tileWidth,owner->second->tileHeight);}}}
};
std::optional<ReadManifest> repairImportedLinks(const ReadManifest& m){
 // User-approved import repair: legacy ensureAnimationDocument followed by
 // syncing the original displayed active surfaces, without edit history.
 // Reverse edges resolve each node once, preserving legacy's input-order
 // cycle breaks without repeatedly walking long invalid chains.
 if(std::none_of(m.cels.begin(),m.cels.end(),[](const auto& c){return !c.linkedCelId.empty();}))return {};
 const auto count=m.cels.size(),none=std::numeric_limits<std::size_t>::max();
 std::map<std::string,std::size_t> ids,owners;for(std::size_t i=0;i<count;++i)ids.emplace(m.cels[i].id,i);for(std::size_t i=0;i<m.layers.size();++i)owners.emplace(m.layers[i].id,i);
 std::vector<std::vector<std::size_t>> incoming(count);std::vector<std::size_t> roots(count,none),queue;std::vector<bool> invalid(count,false);bool changed=false;
 for(std::size_t i=0;i<count;++i){const auto& c=m.cels[i];if(c.linkedCelId.empty()){roots[i]=i;queue.push_back(i);continue;}const auto target=ids.find(c.linkedCelId);if(target==ids.end()||target->second==i||m.cels[target->second].layerId!=c.layerId){invalid[i]=true;changed=true;}else incoming[target->second].push_back(i);}
 const auto spread=[&]{for(std::size_t head=0;head<queue.size();++head){const auto index=queue[head];for(const auto predecessor:incoming[index])if(roots[predecessor]==none){roots[predecessor]=roots[index];queue.push_back(predecessor);}}queue.clear();};
 spread();const auto initialRoots=roots;
 for(std::size_t i=0;i<count;++i)if(invalid[i]){roots[i]=i;queue.push_back(i);}spread();
 for(std::size_t i=0;i<count;++i)if(roots[i]==none){changed=true;roots[i]=i;queue.push_back(i);spread();}
 if(!changed)return {};
 // Repair cannot hide a corrupt fallback supplied through the direct DTO API.
 // Archive callers have already passed decodeProject's per-resource boundary.
 const tiles::Catalog resources(m.tilesets);std::map<std::string,std::map<std::string,std::string>> aliases;
 for(const auto& layer:m.layers)if(layer.freeTiles)for(const auto& source:layer.freeTiles->sources){auto& names=aliases[layer.id];names.emplace(source.id,source.id);names.emplace(source.tilesetId,source.id);if(const auto set=resources.sets.find(source.tilesetId);set!=resources.sets.end())for(const auto& tile:set->second->tileIds)names.emplace(tile,source.id);}
 for(const auto& c:m.cels){if(c.surface)raster(*c.surface);const auto& layer=m.layers[owners.at(c.layerId)];corrupt((c.text&&(layer.kind=="tilemap"||layer.kind=="free-tile"))||(c.tilemap&&layer.kind!="tilemap")||(c.freeTiles&&layer.kind!="free-tile"),"Invalid fallback payload kind");
  if(c.tilemap){const auto& grid=*c.tilemap;try{tiles::sizeCheck(grid.tileWidth,grid.tileHeight,grid.columns,grid.rows);}catch(const std::exception& e){throw Error(ErrorKind::Corrupt,e.what());}corrupt(grid.cells.size()!=std::size_t(grid.columns)*grid.rows,"Invalid fallback grid size");for(const auto& cell:grid.cells)if(cell){const auto set=resources.sets.find(cell->tilesetId);corrupt(set==resources.sets.end()||set->second->tileWidth!=grid.tileWidth||set->second->tileHeight!=grid.tileHeight||!resources.indexes.at(cell->tilesetId).find(cell->tileId),"Invalid fallback grid resource");}}
  if(c.freeTiles){corrupt(!layer.freeTiles,"Missing fallback source owner");auto canonical=*c.freeTiles;if(!layer.freeTiles->sources.empty())for(auto& instance:canonical.instances){const auto& names=aliases.at(layer.id);const auto source=names.find(instance.sourceId);corrupt(source==names.end(),"Missing fallback instance resource");instance.sourceId=source->second;}try{free_tiles::validate(*layer.freeTiles,canonical,m.tilesets);}catch(const std::exception& e){throw Error(ErrorKind::Corrupt,e.what());}}
 }
 ReadManifest fixed=m;
 std::vector<std::size_t> activeSlots(m.layers.size(),none);for(std::size_t i=0;i<count;++i)if(m.cels[i].frameId==m.activeFrameId)activeSlots[owners.at(m.cels[i].layerId)]=i;
 struct Displayed{std::shared_ptr<const ManifestRaster> surface;double opacity=1;const ManifestCel* payload=nullptr;};std::vector<Displayed> displayed(m.layers.size());
 for(std::size_t owner=0;owner<m.layers.size();++owner){const auto& layer=m.layers[owner];corrupt(!layer.surface,"Missing layer raster during linked Cel repair");displayed[owner].opacity=layer.opacity;const auto index=activeSlots[owner];if(index!=none){const auto& source=m.cels[initialRoots[index]==none?index:initialRoots[index]];displayed[owner].payload=&source;if(source.surface){displayed[owner].surface=source.surface;displayed[owner].opacity=source.opacity.value_or(layer.opacity);}}
  if(!displayed[owner].surface){auto blank=std::make_shared<ManifestRaster>();blank->width=layer.surface->width;blank->height=layer.surface->height;blank->offsetX=layer.surface->offsetX;blank->offsetY=layer.surface->offsetY;blank->pixels.assign(layer.surface->pixels.size(),0);displayed[owner].surface=std::move(blank);}fixed.layers[owner].surface=displayed[owner].surface;fixed.layers[owner].opacity=displayed[owner].opacity;
 }
 const BlankImportedPayloads blanks(m);
 for(std::size_t i=0;i<count;++i)if(roots[i]==i){auto& c=fixed.cels[i];const auto owner=owners.at(c.layerId);if(!c.surface){if(c.frameId==m.activeFrameId)c.surface=displayed[owner].surface;else{auto blank=std::make_shared<ManifestRaster>();blank->width=blank->height=1;blank->pixels={0};c.surface=std::move(blank);}}if(!c.opacity)c.opacity=displayed[owner].opacity;const auto& layer=m.layers[owner];if((layer.kind=="tilemap"&&!c.tilemap)||(layer.kind=="free-tile"&&!c.freeTiles))blanks.assign(c,layer);}
 // Root metadata is immutable while aliases are flattened; direct invalid
 // links and input-order cycle roots retain their own fallback payload.
 for(std::size_t i=0;i<count;++i){auto& c=fixed.cels[i];if(roots[i]==i)c.linkedCelId.clear();else{const auto& root=fixed.cels[roots[i]];c.linkedCelId=root.id;c.zIndex=root.zIndex;c.opacity=root.opacity;c.text=root.text;c.tilemap=root.tilemap;c.freeTiles=root.freeTiles;c.surface=root.surface;}}
 // User confirmed: a no-raster free Cel retains all instances; the final
 // import renderer restores their display instead of freezing an empty cache.
 for(std::size_t i=0;i<count;++i)if(fixed.cels[i].frameId==m.activeFrameId){const auto owner=owners.at(fixed.cels[i].layerId);auto& root=fixed.cels[roots[i]];root.surface=displayed[owner].surface;root.opacity=displayed[owner].opacity;if(const auto* payload=displayed[owner].payload){root.zIndex=payload->zIndex;root.text=payload->text;root.tilemap=payload->tilemap;root.freeTiles=payload->freeTiles;}const auto& layer=m.layers[owner];if((layer.kind=="tilemap"&&!root.tilemap)||(layer.kind=="free-tile"&&!root.freeTiles))blanks.assign(root,layer);}
 for(std::size_t i=0;i<count;++i)if(roots[i]!=i){auto& c=fixed.cels[i];const auto& root=fixed.cels[roots[i]];c.surface=root.surface;c.opacity=root.opacity;c.zIndex=root.zIndex;c.text=root.text;c.tilemap=root.tilemap;c.freeTiles=root.freeTiles;}
 return fixed;
}
}
ImportPalette prepareEditablePalette(const ReadManifest& m){
 ImportPalette p;p.columns=m.paletteColumns;p.nextId=m.nextColorId;p.order=m.paletteOrder;p.slots=m.paletteSlots;
 corrupt(p.columns<1||p.columns>256||p.nextId<1,"Invalid palette columns or next ID");
 std::set<int> ids,visible,placed;
 for(const auto& e:m.palette) {
  corrupt(e.id<1||!ids.insert(e.id).second,"Duplicate or invalid palette ID");
  p.entries.push_back({e.id,unicode(e.name),e.color});
 }
 unsupported(!ids.empty()&&p.nextId<=*ids.rbegin(),"Colliding legacy palette allocation cursor is not editable yet");
 for(int id:p.order)if(ids.count(id))visible.insert(id);
 for(int id:p.slots) if(id) corrupt(!visible.count(id)||!placed.insert(id).second,"Invalid palette slot reference");
 p.slots=normalizePaletteSlots(p.entries,p.order,p.slots,p.columns);
 return p;
}
PreparedImport prepareEditableImport(const ReadManifest& m) {
 if(!m.unsupported.empty()) throw Error(ErrorKind::Unsupported,"Unsupported project content: "+m.unsupported.front());
 corrupt(m.id.empty()||m.width<1||m.height<1,"Invalid document identity or dimensions");
 unsupported(m.width>32768||m.height>32768||std::uint64_t(m.width)*m.height>64ull*1024*1024,"Canvas exceeds native coordinate or 256 MiB pixel budget");
 unsupported(!color_mode::rgbaStorageMode(m.colorMode),"Only RGBA and grayscale projects are editable");
 unsupported(!color_mode::pixelFormat(m.pixelFormat),"Unsupported pixel format");
 // Legacy refreshActiveAnimationFrame clears missing ordinary slots while
 // preserving displayed geometry; ensureAnimationDocument later materializes
 // active blank storage and 1x1 inactive storage on editing/saving.
 std::set<std::pair<std::string,std::string>> importedSlots;std::set<std::string> importedIds;
 std::set<std::string> layerIds,frameIds;for(const auto& l:m.layers)corrupt(l.id.empty()||!layerIds.insert(l.id).second,"Duplicate or empty imported layer ID");for(const auto& f:m.frames)corrupt(f.id.empty()||!frameIds.insert(f.id).second,"Duplicate or empty imported frame ID");
 for(const auto& c:m.cels){corrupt(c.id.empty()||!layerIds.count(c.layerId)||!frameIds.count(c.frameId),"Invalid imported Cel identity/owner");corrupt(!importedSlots.emplace(c.layerId,c.frameId).second||!importedIds.insert(c.id).second,"Duplicate imported Cel ID or slot");}
 if(auto repaired=repairImportedLinks(m))return prepareEditableImport(*repaired);
 if(!m.layers.empty()&&!m.frames.empty()&&m.cels.size()<m.layers.size()*m.frames.size()){
  ReadManifest normalized=m;std::size_t serial=0,pixels=0;const BlankImportedPayloads blanks(m);
  for(const auto& l:m.layers)for(const auto& f:m.frames)if(!importedSlots.count({l.id,f.id})){
   unsupported(!l.kind.empty()&&l.kind!="text"&&l.kind!="adjustment"&&l.kind!="tilemap"&&l.kind!="free-tile","Unsupported missing Cel owner kind");
   corrupt(!l.surface,"Missing layer raster for blank slot");ManifestCel c;
   do{c.id="import-blank-cel-"+std::to_string(++serial);}while(!importedIds.insert(c.id).second);
   c.layerId=l.id;c.frameId=f.id;c.opacity=l.opacity;
   blanks.assign(c,l);
   auto surface=std::make_shared<ManifestRaster>();
   if(f.id==m.activeFrameId){surface->width=l.surface->width;surface->height=l.surface->height;surface->offsetX=l.surface->offsetX;surface->offsetY=l.surface->offsetY;}else if(l.kind=="free-tile"){surface->width=m.width;surface->height=m.height;}else surface->width=surface->height=1;
   const auto count=std::size_t(surface->width)*surface->height;corrupt(count>64u*1024*1024-pixels,"Blank slot pixels exceed import budget");pixels+=count;surface->pixels.resize(count);c.surface=surface;normalized.cels.push_back(std::move(c));
  }
  return prepareEditableImport(normalized);
 }
 // Validate identities/slots/links before applying this editor's capability gate.
 timeline::State state;state.canvasWidth=m.width;state.canvasHeight=m.height;state.tilesets=m.tilesets;
 for(const auto& section:m.loopSections)state.loopSections.push_back({section.id,unicode(section.name),section.startFrameId,section.endFrameId,section.direction,section.repeatCount});
 for(const auto& l:m.layers) state.layers.push_back({l.id,unicode(l.name),l.visible,l.locked,l.opacity,l.autoLinkAnimationCels,l.blendMode,l.displayColor,unicode(l.description)});
 // decodeProject clears unknown group owners before timeline normalization.
 std::set<std::string> groupIds;for(const auto& group:m.groups)groupIds.insert(group.id);
 for(std::size_t i=0;i<m.layers.size();++i){if(!m.layers[i].groupId.empty()&&groupIds.count(m.layers[i].groupId))state.layers[i].groupId=m.layers[i].groupId;state.layers[i].clippingMask=m.layers[i].clippingMask;state.layers[i].kind=m.layers[i].kind;state.layers[i].adjustment=m.layers[i].adjustment;state.layers[i].layerStyles=m.layers[i].layerStyles;state.layers[i].tilemapTilesetId=m.layers[i].tilemapTilesetId;state.layers[i].freeTiles=m.layers[i].freeTiles;state.layers[i].background=m.layers[i].background;state.layers[i].linkedContentId=m.layers[i].linkedContentId;}
 for(const auto& g:m.groups){timeline::Group out;out.id=g.id;out.name=unicode(g.name);out.parentGroupIdPresent=g.parentGroupIdPresent;if(!g.parentGroupId.empty())out.parentGroupId=g.parentGroupId;out.visible=g.visible;out.locked=g.locked;out.opacity=g.opacity;out.blendMode=g.blendMode;out.cumulativeBlend=g.cumulativeBlend;out.clippingMask=g.clippingMask;out.layerStyles=g.layerStyles;out.panelOrder=g.panelOrder;out.displayColor=g.displayColor;out.description=unicode(g.description);state.groups.push_back(std::move(out));}
 for(const auto& f:m.frames) state.frames.push_back({f.id,f.duration,f.disabled});
 for(const auto& c:m.cels) {
  timeline::Cel out;out.id=c.id;out.layerId=c.layerId;out.frameId=c.frameId;out.zIndex=c.zIndex;out.opacity=c.opacity;out.text=c.text;out.tilemap=c.tilemap;out.freeTiles=c.freeTiles;
  if(!c.linkedCelId.empty()) out.linkedCelId=c.linkedCelId;
  // Validate storage without copying pixels before rejecting unsupported structures.
  if(c.surface) raster(*c.surface);
  state.cels.push_back(std::move(out));
 }
 for(const auto& l:m.layers) if(l.surface) raster(*l.surface);
 for(const auto& m:m.masks){corrupt(!m.surface,"Missing mask raster");raster(*m.surface);timeline::MaskSlot slot;slot.ownerId=m.ownerId;slot.frameId=m.frameId;slot.group=m.group;slot.mask.id=m.id;slot.mask.linkedMaskId=m.linkedMaskId;slot.mask.locked=m.locked;slot.mask.autoLinkAnimationCels=m.autoLink;const auto& r=*m.surface;slot.mask.surface={r.width,r.height,r.offsetX,r.offsetY,{},{},timeline::LinkedPixelStorage(r.pixels)};state.masks.push_back(std::move(slot));}
 try{timeline::validateMasks(state);}catch(const std::exception& e){throw Error(ErrorKind::Corrupt,e.what());}

 // project-format-decode validates modern free-tile ownership before aliases
 // or source names can modify prepared state. A source sheet owns one tile;
 // source IDs and sheet IDs may be shared only inside the same source set.
 std::set<std::string> gridClaims;for(const auto& layer:state.layers)if(layer.kind=="tilemap")gridClaims.insert(layer.tilemapTilesetId);
 std::map<std::string,std::string> sourceOwners,sheetOwners;
 std::map<std::string,tiles::Tileset*> freeSheets;for(auto& set:state.tilesets)freeSheets.emplace(set.id,&set);
 std::map<std::string,std::vector<timeline::Cel*>> freeCels;for(auto& cel:state.cels)if(cel.freeTiles)freeCels[cel.layerId].push_back(&cel);
 // Legacy schema14 atlases have exclusive ownership, including empty cels.
 std::set<std::string> legacyClaims;
 for(const auto& layer:state.layers)if(layer.kind=="free-tile"&&layer.freeTiles&&layer.freeTiles->sources.empty()){
  const auto& id=layer.freeTiles->legacyTilesetId;
  corrupt(id.empty()||!freeSheets.count(id)||gridClaims.count(id)||!legacyClaims.insert(id).second,"Invalid legacy free tile atlas ownership");
 }
 for(const auto& layer:state.layers)if(layer.kind=="free-tile"&&layer.freeTiles&&!layer.freeTiles->sources.empty()){
  const auto& data=*layer.freeTiles;const auto setName=unicode(data.setId);corrupt(setName.empty()||(setName.front()<=0xffff&&legacyjson::numberSpace(wchar_t(setName.front())))||(setName.back()<=0xffff&&legacyjson::numberSpace(wchar_t(setName.back()))),"Invalid free tile source set ID");
  std::set<std::string> localSources,localSheets;
  for(const auto& source:data.sources){
   corrupt(!localSources.insert(source.id).second||!localSheets.insert(source.tilesetId).second,"Duplicate free tile source ownership");
   auto sourceOwner=sourceOwners.emplace(source.id,data.setId),sheetOwner=sheetOwners.emplace(source.tilesetId,data.setId);
   corrupt(sourceOwner.first->second!=data.setId||sheetOwner.first->second!=data.setId,"Conflicting free tile source ownership");
   const auto sheet=freeSheets.find(source.tilesetId);
   corrupt(sheet==freeSheets.end()||sheet->second->tileIds.size()!=1||sheet->second->columns!=1||sheet->second->rows!=1||gridClaims.count(source.tilesetId),"Invalid free tile source sheet");
  }
 }
 // ensureFreeTileTilesetOwnership names each owned sheet from its source;
 // normalizeFreeTileCelData canonicalizes source/tileset/tile aliases to source ID.

 for(const auto& layer:state.layers)if(layer.kind=="free-tile"&&layer.freeTiles&&!layer.freeTiles->sources.empty()){
  std::map<std::string,const free_tiles::Source*> aliases;
  for(const auto& source:layer.freeTiles->sources){const auto set=freeSheets.find(source.tilesetId);corrupt(set==freeSheets.end(),"Missing free tile source tileset");set->second->name=std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.from_bytes(source.name);aliases.emplace(source.id,&source);aliases.emplace(source.tilesetId,&source);for(const auto& id:set->second->tileIds)aliases.emplace(id,&source);}
  for(const auto cel:freeCels[layer.id])for(auto& instance:cel->freeTiles->instances){
   corrupt(instance.sourceId.empty()||!instance.tileId.empty(),"Modern free tile instance requires source ID");const auto source=aliases.find(instance.sourceId);
   corrupt(source==aliases.end(),"Missing free tile instance source");instance.sourceId=source->second->id;
  }
 }

 try {
  timeline::Timeline relationships(std::move(state));
  corrupt(!relationships.diagnoseLinks().empty(),"Broken linked cel relationship");
  state=std::move(relationships).takeState();
 } catch(const std::invalid_argument& e) {throw Error(ErrorKind::Corrupt,e.what());}
 // Reuse the legacy cel lookup boundary: structured layer/frame slots and
 // stable IDs. Store indices so later native surface installation keeps the
 // serialized cel order and never searches the complete array for each slot.
 std::map<std::string,std::size_t> celIds;
 std::map<std::pair<std::string,std::string>,std::size_t> celSlots;
 for(std::size_t i=0;i<m.cels.size();++i){const auto& cel=m.cels[i];celIds.emplace(cel.id,i);celSlots.emplace(std::make_pair(cel.layerId,cel.frameId),i);}
 const auto slotIndex=[&](const std::string& layer,const std::string& frame){const auto found=celSlots.find({layer,frame});corrupt(found==celSlots.end(),"Missing layer/frame cel");return found->second;};
 std::map<std::string,const ManifestCel*> celRoots;
 const auto rootCel=[&](const ManifestCel& cel){const ManifestCel* root=&cel;std::vector<const ManifestCel*> path;std::set<std::string> visited;
  while(true){if(const auto cached=celRoots.find(root->id);cached!=celRoots.end()){root=cached->second;break;}corrupt(!visited.insert(root->id).second,"Cyclic link");path.push_back(root);if(root->linkedCelId.empty())break;const auto next=celIds.find(root->linkedCelId);corrupt(next==celIds.end(),"Missing associated cel owner");root=&m.cels[next->second];}
  for(const auto* entry:path)celRoots.emplace(entry->id,root);return root;
 };
 // Legacy owns free-tile source resources separately from grid-edit resources.
 for(const auto& l:state.layers)if(l.freeTiles){std::set<std::string> owned;owned.insert(l.freeTiles->legacyTilesetId);for(const auto& source:l.freeTiles->sources)owned.insert(source.tilesetId);for(const auto& grid:state.layers)unsupported(grid.kind=="tilemap"&&owned.count(grid.tilemapTilesetId),"Mixed grid/free source ownership is not migrated");for(const auto& c:state.cels)if(c.tilemap)for(const auto& cell:c.tilemap->cells)unsupported(cell&&owned.count(cell->tilesetId),"Mixed grid/free source references are not migrated");}
 corrupt(m.layers.empty()||m.frames.empty(),"Missing layer or frame");
 corrupt(std::none_of(m.layers.begin(),m.layers.end(),[&](const auto& l){return l.id==m.activeLayerId;}),"Missing active layer");
 corrupt(std::none_of(m.frames.begin(),m.frames.end(),[&](const auto& f){return f.id==m.activeFrameId;}),"Missing active frame");
 unsupported(m.cels.size()!=m.layers.size()*m.frames.size(),"Editor requires one owned cel per layer/frame slot");
 for(const auto& l:m.layers) {
 corrupt(!l.linkedContentId.empty()&&(!l.kind.empty()||l.background),"Special/background linked layer is invalid");
 unsupported((!l.kind.empty()&&l.kind!="text"&&l.kind!="tilemap"&&l.kind!="adjustment"&&l.kind!="free-tile")||!parseLayerBlendMode(l.blendMode),"Unsupported layer kind, group, link or blend mode");
 for(const auto& f:m.frames) {
 const auto index=slotIndex(l.id,f.id);const auto& c=m.cels[index];


 const auto* root=rootCel(c);
 unsupported(!root->surface||!l.surface,"Missing owned raster is not editable yet");const auto& s=*root->surface;
 // Legacy resolveAnimationCel follows valid links to the root. Serialized
 // alias fallbacks may be stale; validate their storage without making it authoritative.
 // Legacy refreshActiveAnimationFrame projects the active Cel over the layer
 // fallback. Both resources were validated above; stale caches are not artwork.
 auto out=state.cels.begin()+index;
 if(c.linkedCelId.empty()){timeline::Surface owned;owned.width=s.width;owned.height=s.height;owned.offsetX=s.offsetX;owned.offsetY=s.offsetY;owned.pixels=s.pixels;out->surface=std::move(owned);}

 }
 }

 try{tilejson::validateAndRender(state,m.colorMode=="grayscale");for(const auto& l:state.layers)if(l.kind=="free-tile"){if(!l.freeTiles)throw std::invalid_argument("Missing free tile sources");for(auto& c:state.cels)if(c.layerId==l.id&&!c.linkedCelId&&!c.runtimeSharedCelId){if(!c.freeTiles||!c.surface)throw std::invalid_argument("Missing free tile instance surface");c.surface->pixels=free_tiles::render(*l.freeTiles,*c.freeTiles,state.tilesets,c.surface->width,c.surface->height,m.colorMode=="grayscale");}}}catch(const std::exception& e){throw Error(ErrorKind::Corrupt,e.what());}
 std::map<std::pair<std::string,std::string>,const ManifestRaster*> linkedRasters;
 for(const auto& layer:m.layers)if(!layer.linkedContentId.empty())for(const auto& frame:m.frames){const auto* root=rootCel(m.cels[slotIndex(layer.id,frame.id)]);corrupt(!root->surface,"Missing associated raster");const auto& raster=*root->surface;const auto key=std::make_pair(layer.linkedContentId,frame.id);const auto found=linkedRasters.emplace(key,&raster);if(!found.second){const auto& previous=*found.first->second;corrupt(previous.width!=raster.width||previous.height!=raster.height||previous.pixels!=raster.pixels,"Linked layer raster content mismatch");}}
 // Legacy document.layers is bottom-to-top; native compositor is top-to-bottom.
 std::reverse(state.layers.begin(),state.layers.end());
 PreparedImport result;result.colorMode=m.colorMode;result.pixelFormat=m.pixelFormat;result.width=m.width;result.height=m.height;result.activeLayerId=m.activeLayerId;result.activeFrameId=m.activeFrameId;result.loop=m.loop;result.id=m.id;result.name=unicode(m.name);result.timeline=std::move(state);result.sourceArchive=m.sourceArchive;
 for(const auto& layer:m.layers)if(layer.surface){const auto& g=*layer.surface;result.layerGeometry.emplace(layer.id,std::array<int,4>{g.width,g.height,g.offsetX,g.offsetY});}
 result.layerPanelState=m.layerPanelState;result.palette=prepareEditablePalette(m);
 result.information=m.information;result.timelapse=m.timelapse;
 result.customBrushes=m.customBrushes;
 result.referenceImages=m.referenceImages;result.slices=m.slices;
 result.outline=m.outline;result.symmetryCenter=m.symmetryCenter;result.showPixelGrid=m.showPixelGrid;result.showCustomGrid=m.showCustomGrid;result.customGrid=m.customGrid;
 return result;
}
}
