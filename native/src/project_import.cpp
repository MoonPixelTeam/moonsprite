#include "project_import.h"
#include "document.h"
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
 PaletteState palette;palette.entries.clear();palette.slots=std::move(imported.palette.slots);palette.nextId=imported.palette.nextId;palette.columns=imported.palette.columns;
 for(auto& e:imported.palette.entries)palette.entries.push_back({e.id,std::move(e.name),e.color});
 auto candidate=Document::fromImported(imported.width,imported.height,std::move(imported.timeline),std::move(palette),std::move(imported.id),std::move(imported.name),std::move(imported.sourceArchive));
 candidate.setImportedProjectInformation(std::move(imported.information));candidate.setImportedReferenceImages(std::move(imported.referenceImages));candidate.setImportedSlices(std::move(imported.slices));candidate.setImportedTimelapse(std::move(imported.timelapse));candidate.setImportedProjectBrushes(std::move(imported.customBrushes));
 candidate.selectLayer(imported.activeLayerId);candidate.selectFrame(imported.activeFrameId);candidate.setImportedLoop(imported.loop);candidate.setPixelGrid(imported.showPixelGrid,false);candidate.setCustomGrid(imported.showCustomGrid,imported.customGrid,false);
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
}
ImportPalette prepareEditablePalette(const ReadManifest& m){
 ImportPalette p;p.columns=m.paletteColumns;p.nextId=m.nextColorId;p.order=m.paletteOrder;p.slots=m.paletteSlots;
 corrupt(p.columns<1||p.columns>256||p.nextId<1,"Invalid palette columns or next ID");
 std::set<int> ids,visible,placed;
 for(const auto& e:m.palette) {
  corrupt(e.id<1||!ids.insert(e.id).second,"Duplicate or invalid palette ID");
  p.entries.push_back({e.id,unicode(e.name),e.color});
 }
 corrupt(!ids.empty()&&p.nextId<=*ids.rbegin(),"Palette next ID would overwrite existing entry");
 for(int id:p.order) corrupt(!ids.count(id)||!visible.insert(id).second,"Invalid palette order reference");
 for(int id:p.slots) if(id) corrupt(!visible.count(id)||!placed.insert(id).second,"Invalid palette slot reference");
 // Legacy normalizePaletteSlots: full rows, fill absent visible IDs into holes.
 const auto count=std::max(p.slots.size(),p.order.size()),cols=std::size_t(p.columns);
 p.slots.resize(std::max(cols,((count+cols-1)/cols)*cols),0);
 for(int id:p.order) if(!placed.count(id)) {
  auto hole=std::find(p.slots.begin(),p.slots.end(),0);
  if(hole==p.slots.end()) {const auto n=p.slots.size();p.slots.resize(n+cols,0);p.slots[n]=id;}
  else *hole=id;
 }
 std::vector<int> actual;for(int id:p.slots) if(id) actual.push_back(id);
 unsupported(actual!=p.order,"Separate palette order and slot order are not editable yet");
 return p;
}
PreparedImport prepareEditableImport(const ReadManifest& m) {
 if(!m.unsupported.empty()) throw Error(ErrorKind::Unsupported,"Unsupported project content: "+m.unsupported.front());
 corrupt(m.id.empty()||m.width<1||m.height<1,"Invalid document identity or dimensions");
 unsupported(m.width>1024||m.height>1024,"Editor currently supports dimensions up to 1024");
 unsupported(m.colorMode!="rgba","Only RGBA projects are editable");
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
 if(l.kind!="tilemap"&&c.surface && c.linkedCelId.size())unsupported(c.surface->pixels!=s.pixels||c.surface->width!=s.width||c.surface->height!=s.height||c.surface->offsetX!=s.offsetX||c.surface->offsetY!=s.offsetY,"Linked cel fallback differs from source; refusing to discard content");
 // Legacy refreshActiveAnimationFrame projects the active Cel over the layer
 // fallback. Both resources were validated above; stale caches are not artwork.
 auto out=state.cels.begin()+index;
 if(c.linkedCelId.empty()){timeline::Surface owned;owned.width=s.width;owned.height=s.height;owned.offsetX=s.offsetX;owned.offsetY=s.offsetY;owned.pixels=s.pixels;out->surface=std::move(owned);}

 }
 }

 try{tilejson::validateAndRender(state);for(const auto& l:state.layers)if(l.kind=="free-tile"){if(!l.freeTiles)throw std::invalid_argument("Missing free tile sources");for(auto& c:state.cels)if(c.layerId==l.id&&!c.linkedCelId&&!c.runtimeSharedCelId){if(!c.freeTiles||!c.surface)throw std::invalid_argument("Missing free tile instance surface");c.surface->pixels=free_tiles::render(*l.freeTiles,*c.freeTiles,state.tilesets,c.surface->width,c.surface->height);}}}catch(const std::exception& e){throw Error(ErrorKind::Corrupt,e.what());}
 std::map<std::pair<std::string,std::string>,const ManifestRaster*> linkedRasters;
 for(const auto& layer:m.layers)if(!layer.linkedContentId.empty())for(const auto& frame:m.frames){const auto* root=rootCel(m.cels[slotIndex(layer.id,frame.id)]);corrupt(!root->surface,"Missing associated raster");const auto& raster=*root->surface;const auto key=std::make_pair(layer.linkedContentId,frame.id);const auto found=linkedRasters.emplace(key,&raster);if(!found.second){const auto& previous=*found.first->second;corrupt(previous.width!=raster.width||previous.height!=raster.height||previous.pixels!=raster.pixels,"Linked layer raster content mismatch");}}
 // Legacy document.layers is bottom-to-top; native compositor is top-to-bottom.
 std::reverse(state.layers.begin(),state.layers.end());
 PreparedImport result;result.width=m.width;result.height=m.height;result.activeLayerId=m.activeLayerId;result.activeFrameId=m.activeFrameId;result.loop=m.loop;result.id=m.id;result.name=unicode(m.name);result.timeline=std::move(state);result.sourceArchive=m.sourceArchive;
 for(const auto& layer:m.layers)if(layer.surface){const auto& g=*layer.surface;result.layerGeometry.emplace(layer.id,std::array<int,4>{g.width,g.height,g.offsetX,g.offsetY});}
 result.palette=prepareEditablePalette(m);
 result.information=m.information;result.timelapse=m.timelapse;
 result.customBrushes=m.customBrushes;
 result.referenceImages=m.referenceImages;result.slices=m.slices;
 result.symmetryCenter=m.symmetryCenter;result.showPixelGrid=m.showPixelGrid;result.showCustomGrid=m.showCustomGrid;result.customGrid=m.customGrid;
 return result;
}
}
