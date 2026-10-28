#include "project_import.h"
#include "tilemap_project_json.h"
#include "layer_blend.h"
#include <algorithm>
#include <codecvt>
#include <locale>
#include <set>
#include <map>
#include <limits>
namespace moon::project {
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
PreparedImport prepareEditableImport(const ReadManifest& m) {
 if(!m.unsupported.empty()) throw Error(ErrorKind::Unsupported,"Unsupported project content: "+m.unsupported.front());
 corrupt(m.id.empty()||m.width<1||m.height<1,"Invalid document identity or dimensions");
 unsupported(m.width>1024||m.height>1024,"Editor currently supports dimensions up to 1024");
 unsupported(m.colorMode!="rgba","Only RGBA projects are editable");
 // Validate identities/slots/links before applying this editor's capability gate.
 timeline::State state;state.canvasWidth=m.width;state.canvasHeight=m.height;state.tilesets=m.tilesets;
 for(const auto& section:m.loopSections)state.loopSections.push_back({section.id,unicode(section.name),section.startFrameId,section.endFrameId,section.direction,section.repeatCount});
 for(const auto& l:m.layers) state.layers.push_back({l.id,unicode(l.name),l.visible,l.locked,l.opacity,l.autoLinkAnimationCels,l.blendMode,l.displayColor,unicode(l.description)});
 for(std::size_t i=0;i<m.layers.size();++i){if(!m.layers[i].groupId.empty())state.layers[i].groupId=m.layers[i].groupId;state.layers[i].clippingMask=m.layers[i].clippingMask;state.layers[i].kind=m.layers[i].kind;state.layers[i].adjustment=m.layers[i].adjustment;state.layers[i].layerStyles=m.layers[i].layerStyles;state.layers[i].tilemapTilesetId=m.layers[i].tilemapTilesetId;state.layers[i].freeTiles=m.layers[i].freeTiles;state.layers[i].background=m.layers[i].background;state.layers[i].linkedContentId=m.layers[i].linkedContentId;}
 for(const auto& g:m.groups){timeline::Group out;out.id=g.id;out.name=unicode(g.name);if(!g.parentGroupId.empty())out.parentGroupId=g.parentGroupId;out.visible=g.visible;out.locked=g.locked;out.opacity=g.opacity;out.blendMode=g.blendMode;out.clippingMask=g.clippingMask;out.layerStyles=g.layerStyles;out.panelOrder=g.panelOrder;out.displayColor=g.displayColor;out.description=unicode(g.description);state.groups.push_back(std::move(out));}
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

 try {
  timeline::Timeline relationships(state);
  corrupt(!relationships.diagnoseLinks().empty(),"Broken linked cel relationship");
 } catch(const std::invalid_argument& e) {throw Error(ErrorKind::Corrupt,e.what());}
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
 const auto ci=std::find_if(m.cels.begin(),m.cels.end(),[&](const auto& c){return c.layerId==l.id && c.frameId==f.id;});corrupt(ci==m.cels.end(),"Missing layer/frame cel");const auto& c=*ci;

 unsupported(l.kind=="free-tile"&&!c.linkedCelId.empty(),"Linked free tile cels require independent instance migration");
 const ManifestCel* root=&c;std::set<std::string> visited;while(!root->linkedCelId.empty()){corrupt(!visited.insert(root->id).second,"Cyclic link");root=&*std::find_if(m.cels.begin(),m.cels.end(),[&](const auto& item){return item.id==root->linkedCelId;});}
 unsupported(!root->surface||!l.surface,"Missing owned raster is not editable yet");const auto& s=*root->surface;const auto& ls=*l.surface;
 if(l.kind!="tilemap"&&c.surface && c.linkedCelId.size())unsupported(c.surface->pixels!=s.pixels||c.surface->width!=s.width||c.surface->height!=s.height||c.surface->offsetX!=s.offsetX||c.surface->offsetY!=s.offsetY,"Linked cel fallback differs from source; refusing to discard content");
 if(l.kind!="tilemap"&&l.kind!="free-tile"&&f.id==m.activeFrameId)unsupported(ls.width!=s.width||ls.height!=s.height||ls.offsetX!=s.offsetX||ls.offsetY!=s.offsetY||ls.pixels!=s.pixels,"Layer and active cel raster differ; refusing to discard either");
 auto out=std::find_if(state.cels.begin(),state.cels.end(),[&](const auto& item){return item.id==c.id;});
 if(c.linkedCelId.empty()){timeline::Surface owned;owned.width=s.width;owned.height=s.height;owned.offsetX=s.offsetX;owned.offsetY=s.offsetY;owned.pixels=s.pixels;out->surface=std::move(owned);}

 }
 }

 try{tilejson::validateAndRender(state);for(const auto& l:state.layers)if(l.kind=="free-tile"){if(!l.freeTiles)throw std::invalid_argument("Missing free tile sources");for(auto& c:state.cels)if(c.layerId==l.id){if(!c.freeTiles||!c.surface)throw std::invalid_argument("Missing free tile instance surface");c.surface->pixels=free_tiles::render(*l.freeTiles,*c.freeTiles,state.tilesets,c.surface->width,c.surface->height);}}}catch(const std::exception& e){throw Error(ErrorKind::Corrupt,e.what());}
 std::map<std::pair<std::string,std::string>,const ManifestRaster*> linkedRasters;
 for(const auto& layer:m.layers)if(!layer.linkedContentId.empty())for(const auto& frame:m.frames){const auto slot=std::find_if(m.cels.begin(),m.cels.end(),[&](const auto& c){return c.layerId==layer.id&&c.frameId==frame.id;});corrupt(slot==m.cels.end(),"Missing associated cel slot");const ManifestCel* root=&*slot;std::set<std::string> visited;while(!root->linkedCelId.empty()){corrupt(!visited.insert(root->id).second,"Cyclic linked association");const auto next=std::find_if(m.cels.begin(),m.cels.end(),[&](const auto& c){return c.id==root->linkedCelId;});corrupt(next==m.cels.end(),"Missing associated cel owner");root=&*next;}corrupt(!root->surface,"Missing associated raster");const auto& raster=*root->surface;const auto key=std::make_pair(layer.linkedContentId,frame.id);const auto found=linkedRasters.emplace(key,&raster);if(!found.second){const auto& previous=*found.first->second;corrupt(previous.width!=raster.width||previous.height!=raster.height||previous.pixels!=raster.pixels,"Linked layer raster content mismatch");}}
 std::map<std::string,std::optional<timeline::Pixel>> linkedColors;for(const auto& layer:m.layers)if(!layer.linkedContentId.empty()){auto found=linkedColors.emplace(layer.linkedContentId,std::nullopt);if(!found.first->second&&layer.displayColor)found.first->second=layer.displayColor;}for(auto& layer:state.layers)if(!layer.linkedContentId.empty())layer.displayColor=linkedColors.at(layer.linkedContentId);
 // Legacy document.layers is bottom-to-top; native compositor is top-to-bottom.
 std::reverse(state.layers.begin(),state.layers.end());
 PreparedImport result;result.width=m.width;result.height=m.height;result.activeLayerId=m.activeLayerId;result.activeFrameId=m.activeFrameId;result.loop=m.loop;result.id=m.id;result.name=unicode(m.name);result.timeline=std::move(state);result.sourceArchive=m.sourceArchive;
 auto& p=result.palette;p.columns=m.paletteColumns;p.nextId=m.nextColorId;p.order=m.paletteOrder;p.slots=m.paletteSlots;
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
 result.information=m.information;result.timelapse=m.timelapse;
 result.customBrushes=m.customBrushes;
 result.referenceImages=m.referenceImages;result.slices=m.slices;
 result.symmetryCenter=m.symmetryCenter;result.showPixelGrid=m.showPixelGrid;result.showCustomGrid=m.showCustomGrid;result.customGrid=m.customGrid;
 return result;
}
}
