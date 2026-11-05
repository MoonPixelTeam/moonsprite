#pragma once
#include "local_history_archive.h"
namespace moon {class Document;}
namespace moon::project {struct ReadManifest;}
namespace moon::local_history {
struct HistoryByteView {Data buffer;std::size_t offset=0,length=0;std::string type;};
struct HistoryBytePatch {std::optional<std::size_t> offset;Data before,after;};
struct HistoryByteDifference {bool replacement=false;double bytes=0;std::vector<HistoryBytePatch> patches;};
// compileLocalHistoryDelta's ArrayBuffer-view branch. Distinct same-type views
// are compared by exact bytes; type mismatch is the structural null answer.
// The enclosing object comparator supplies paths/aliases/invalidation metadata.
std::optional<HistoryByteDifference> compareHistoryByteViews(const HistoryByteView&,const HistoryByteView&,project::Limits limits={});
// Ordered runtime graph supplied by the document adapter. Identity tokens must
// be unique across both graphs, except when the exact same JS object is shared.
struct HistoryCompareValue {
 enum class Kind { Undefined,Null,Boolean,Number,String,Object,Array,View,Other };
 Kind kind=Kind::Undefined;bool boolean=false;double number=0;std::u16string text;
 std::size_t identity=0,arrayLength=0;
 std::vector<std::pair<std::string,std::size_t>> properties;
 HistoryByteView view;
};
struct HistoryCompareLayer {std::string id;double width=0,x=0,y=0,originX=0,originY=0;bool runtimeRaster=false;};
struct HistoryCompareDocument {std::vector<HistoryCompareValue> values;std::size_t root=0;std::vector<HistoryCompareLayer> layers;std::optional<std::string> activeFrameId;};
struct HistoryCompareResourceRoots {std::size_t customBrushes,referenceImages,slices;};
// Exact normalized project-decoder resource fragment. Owns all compared bytes
// and keeps reference-image view aliases within the fragment. Enumerable brush
// colors/sourceX/sourceY exist even when undefined. The caller attaches these
// roots in document field order. No paletteOrder inference, root serialization,
// layer pixels or live optional-field lifecycle is supplied by this adapter.
// Appends transactionally; existing graph owners are never changed. Identity
// tokens stay zero: separate immutable captures must not share a fast-path ID
// merely because native vector storage reused an address.
HistoryCompareResourceRoots appendDecodedHistoryResourceValues(HistoryCompareDocument&,const Document&,project::Limits limits={});
struct HistoryCompareTimelineRoots {std::size_t frames,loopSections,activeFrameId,loop,tilesets;};
// Normalized decoded timeline metadata and owned RGBA tileset bytes. Does not
// construct animation/cel/mask owners or infer arbitrary live optional fields.
HistoryCompareTimelineRoots appendDecodedHistoryTimelineValues(HistoryCompareDocument&,const Document&,project::Limits limits={});
// Normalized recording settings and frame metadata. PNG bytes are opaque owned
// Uint8Array views; no library IO/PNG decode is needed. Backing-buffer retention
// for transfer cost remains the responsibility of the cost graph adapter.
std::size_t appendDecodedHistoryRecordingValues(HistoryCompareDocument&,const Document&,project::Limits limits={});
struct HistoryComparePaletteRoots {std::size_t palette,paletteOrder,paletteColumns,paletteSlots,nextColorId;};
// Legacy decode retains palette entries exactly as parsed, including key order
// and absent name. The validated import source supplies that shape; every native
// palette value/layout must still agree with it, otherwise reject as stale.
// This is an initial decoded adapter, not a live palette mutation adapter.
HistoryComparePaletteRoots appendDecodedHistoryPaletteValues(HistoryCompareDocument&,const Document&,const project::ReadManifest&,project::Limits limits={});
// Returns an object containing the decoder's root metadata, in decoder order.
// Resource/layer/group/animation fields are supplied by their own adapters.
// The runtime document ID is caller-owned: decode creates it independently of
// the persisted project ID. Retained outline/panel metadata is decoded-only.
std::size_t appendDecodedHistoryMetadataValues(HistoryCompareDocument&,const Document&,const project::ReadManifest&,const std::string& decodedDocumentId,project::Limits limits={});
// Decoded groups retain source parentGroupId presence independently of value.
std::size_t appendDecodedHistoryGroupValues(HistoryCompareDocument&,const Document&,const project::ReadManifest&,project::Limits limits={});
struct HistoryCompareMaskRoots {std::size_t layerMasks,groupMasks;};
// Caller supplies the actual decoder locale's mask names. Every decoded mask
// owns a fresh normalized RGBA view, including linked/resource-shared masks.
HistoryCompareMaskRoots appendDecodedHistoryMaskValues(HistoryCompareDocument&,const Document&,const std::u32string& layerMaskName,const std::u32string& groupMaskName,project::Limits limits={});
struct HistoryCompareRasterRoots {std::size_t layers,cels;};
// Initial decoded ordinary RGBA layers/cels, including active-frame projection,
// exact transfer storage aliases and layer invalidation geometry. Rejects stale
// native values and special/rendered or linked-layer storage not yet adapted.
// Appends transactionally, including layers/activeFrameId comparison metadata.
HistoryCompareRasterRoots appendDecodedHistoryRasterValues(HistoryCompareDocument&,const Document&,const project::ReadManifest&,project::Limits limits={});
struct HistoryDecodeContext;
// Complete decoder-root assembly for the admitted initial RGBA subset. Uses
// the same runtime ID/locale context as initial transfer cost. Fragment gates
// still apply; this is not a capture of arbitrary edited/live Documents.
// Returns an independently owned graph, or throws without changing Document.
HistoryCompareDocument decodedHistoryComparison(const Document&,const project::ReadManifest&,const HistoryDecodeContext&,project::Limits limits={});
struct HistoryObjectPatch {
 std::vector<std::string> path;
 HistoryCompareValue before,after;
 std::optional<std::size_t> offset;
 std::optional<std::vector<std::vector<std::string>>> aliases;
};
struct HistoryObjectDifference {
 double bytes=0;bool requiresAnimationSelectionNormalization=false;
 std::vector<HistoryObjectPatch> patches;
 std::vector<std::string> affectedLayerIds;
 std::vector<std::pair<double,double>> beforeOrigins,afterOrigins;
 struct Region {double x,y,width,height;std::optional<std::string> frameId;};
 std::optional<Region> region;
};
// Full compileLocalHistoryDelta comparison core. Input must expose actual
// Object.keys order and view identity, not a serialized project approximation.
std::optional<HistoryObjectDifference> compareHistoryObjects(const HistoryCompareDocument&,const HistoryCompareDocument&,project::Limits limits={});

// Convert comparison metadata/owned values into the existing portable delta.
// Undefined primitive sides are omitted, nonfinite numbers become JSON null,
// and typed views use Delta.buffers rather than JSON byte arrays.
Delta historyDifferenceDelta(const HistoryObjectDifference&,const std::string& label,project::Limits limits={});
std::optional<Delta> compileHistoryGraphs(const HistoryCompareDocument&,const HistoryCompareDocument&,const std::string& label,project::Limits limits={});

}
