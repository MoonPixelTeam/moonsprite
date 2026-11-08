#pragma once
#include "local_history_cost.h"
#include <memory>
#include <optional>
namespace moon {class Document;}
namespace moon::project {struct ReadManifest;}
namespace moon::local_history {
struct HistoryResourceRoots {
 std::size_t palette,paletteOrder,paletteSlots,paletteColumns,nextColorId;
 std::size_t customBrushes,referenceImages,slices;
};
// Append the resource portion of the actual decoded project transfer shape.
// Native values are read directly; no encode/decode, raster read or undo copy.
// All indices belong to graph. The caller attaches these fields to its root in
// the legacy field order. This does not weigh the rest of a Document.
// Brush decode always creates enumerable colors/sourceX/sourceY, including
// undefined; this decoded shape must not stand in for arbitrary live JS shapes.
// Graph-only overloads are standalone fragments. Complete assembly must share
// one builder across ALL fields to preserve cross-field buffer identities.
HistoryResourceRoots appendDecodedHistoryResources(HistoryCostGraph&,const Document&);
HistoryResourceRoots appendDecodedHistoryResources(HistoryCostBuilder&,const Document&);
// Actual normalized recording settings/snapshot shape, including enumerable
// undefined changeScore, local library references and original ZIP backing.
// No PNG decode, library I/O or recording-session/last-export state is counted.
std::size_t appendHistoryRecording(HistoryCostGraph&,const Document&);
std::size_t appendHistoryRecording(HistoryCostBuilder&,const Document&);
struct HistoryTimelineMetadataRoots {std::size_t frames,loopSections,activeFrameId,loop,tilesets;};
// Normalized decoded frame/loop/tileset shape; excludes cels, masks and the
// animation owner object. Enabled frames omit disabled. Null repeat counts and
// null layout slots are enumerable values. Tileset pixels own copied storage.
// Arbitrary live JS aliases/optional field-presence are not represented here.
HistoryTimelineMetadataRoots appendDecodedHistoryTimelineMetadata(HistoryCostBuilder&,const Document&);
// Initial decoded group field-presence plan. Native optional parent IDs alone
// cannot distinguish an absent property from enumerable null. Preparation reads
// validated manifest metadata once; append reads current native scalar/styles.
// Changed group order/IDs/parent topology is rejected, not priced as the old shape.
// Does not represent arbitrary live JS aliases or optional-field lifecycle.
class DecodedHistoryGroupShape {
 struct Entry {std::string id,parent;bool parentPresent=false;};
 std::vector<Entry> entries_;
public:
 explicit DecodedHistoryGroupShape(const project::ReadManifest&);
 std::size_t append(HistoryCostBuilder&,const Document&)const;
};
struct HistoryRasterObjectRoots {std::size_t layers,cels,layerMasks,groupMasks;};
// decodeProject stores localized mask names as actual strings. Supply the
// decoder locale's names; do not price native UI labels or manifest filenames.
struct HistoryMaskNames {std::u32string layer,group;};
// Initial imported ordinary/text/adjustment/background/tilemap/modern-free-tile RGBA layers/cels. Retains the validated source
// and its storage identities. Bound to one unmoved Document/revision/viewed
// frame; edits/navigation must invalidate this plan before another append.
// Tilemap/free-tile rendering uses fresh per-cel buffer identities and source
// field order. Modern free-tile source arrays share identity by set ID. Legacy
// ownership migration and linked free-tile runtime admission remain unsupported.
// Other special layers, live storage replacement and projection divergence
// require their own lifecycle adaptation; never install this as a live weigher.
class InitialHistoryRasterObjects {
 struct Impl;std::unique_ptr<Impl> impl_;
public:
 InitialHistoryRasterObjects(std::shared_ptr<const project::ReadManifest>,const Document&,HistoryMaskNames={});
 ~InitialHistoryRasterObjects();
 HistoryRasterObjectRoots append(HistoryCostBuilder&,const Document&)const;
};
struct HistoryDocumentMetadataRoots {
 std::size_t name,activeLayerId,displaySettings,statistics,createdAt,updatedAt,layerPanelState;
 std::optional<std::size_t> outlineSettings;
};
// Initial decode metadata, including persisted layerPanelState (independent of
// native current selection) and the imported outline settings.
// Those shapes are normalized from retained validated metadata, not UI state.
// Bound to one Document/revision/frame/active layer; not a live weigher.
class InitialHistoryDocumentMetadata {
 struct Impl;std::unique_ptr<Impl> impl_;
public:
 InitialHistoryDocumentMetadata(std::shared_ptr<const project::ReadManifest>,const Document&);
 ~InitialHistoryDocumentMetadata();
 HistoryDocumentMetadataRoots append(HistoryCostBuilder&,const Document&)const;
};
// decodeProject creates a new runtime ID instead of reusing manifest.document.id.
// Supply the actual decoded session identity (and locale mask names). Do not
// infer its string length from a persisted ID or a synthetic fixture estimate.
struct HistoryDecodeContext {std::string documentId;HistoryMaskNames maskNames;};
// Complete initial native-admitted schema21 ordinary/text/adjustment/background/tilemap/modern-free-tile RGBA decode graph with
// already normalized nonempty names. Still not a general
// live DocumentWeigher: special layers/storage lifecycles are deliberately gated.
class InitialHistoryDocumentCost {
 struct Impl;std::unique_ptr<Impl> impl_;
public:
 InitialHistoryDocumentCost(std::shared_ptr<const project::ReadManifest>,const Document&,HistoryDecodeContext);
 ~InitialHistoryDocumentCost();
 std::size_t append(HistoryCostBuilder&,const Document&)const;
 double bytes(const Document&)const;
};
}
