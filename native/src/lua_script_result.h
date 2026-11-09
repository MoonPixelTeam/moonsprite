#pragma once
#include "lua_script_invocation.h"
namespace moon::script {
struct RasterBatch {
 struct Change {std::size_t index=0;Pixel before=0,after=0;};
 SurfaceSnapshot before;
 std::optional<SurfaceSnapshot> after;
 std::vector<Change> changes;
 std::u32string label;
};
// Validates every batch and created structure before the caller may apply any
// result. Returns the final raster baseline; does not execute MSE operations.
SurfaceSnapshot validateResult(const Target&,const std::string& resultJson);
struct RasterSummary {std::size_t transactionCount=0,changedPixelCount=0;};
// Raster-only stage of the workspace result executor. Rejects ALL unsupported
// operations/created objects before the first edit; never silently drops them.
RasterSummary applyRasterResult(Document& activeDocument,Target&,const std::string& resultJson);
}
