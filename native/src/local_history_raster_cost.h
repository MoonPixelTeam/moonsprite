#pragma once
#include "local_history_cost.h"
#include "project_reader.h"
#include <memory>
#include <optional>
namespace moon::project {struct ReadManifest;struct ManifestRaster;}
namespace moon::local_history {
struct HistoryCompareDocument;
struct HistoryRasterStorageRoots {std::size_t pixels;std::optional<std::size_t> runtimeRaster;};
// Layout of the actual legacy RGBA decode/transfer storage, prepared from an
// already validated ReadManifest. Does not describe later live raster edits,
// mask normalization or special-layer rendering. No native lazy-raster claim.
// Keep this plan alive while its identity tokens are used by a shared builder.
class DecodedHistoryRasterStorage {
 struct Impl;std::unique_ptr<Impl> impl_;
public:
 // Cost-only preparation retains layout sizes/identities without raw bytes.
 // Comparison preparation additionally owns raw/payload/offset bytes once.
 explicit DecodedHistoryRasterStorage(const project::ReadManifest&,bool retainComparisonBytes=false);
 ~DecodedHistoryRasterStorage();
 DecodedHistoryRasterStorage(const DecodedHistoryRasterStorage&)=delete;
 HistoryRasterStorageRoots append(HistoryCostBuilder&,const project::ManifestRaster&)const;
 // Append exact transfer-view storage values (not dense materialized pixels).
 // One call assembles all requested surfaces, preserving decoded runtime/view
 // aliases by resource key; sparse placeholders stay distinct per surface.
 std::vector<HistoryRasterStorageRoots> appendComparison(HistoryCompareDocument&,const std::vector<const project::ManifestRaster*>&,project::Limits limits={})const;
};
}
