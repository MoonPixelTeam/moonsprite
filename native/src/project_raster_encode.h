#pragma once
#include "project_reader.h"
namespace moon::project {
struct EncodedRaster {Bytes data;std::string encoding;};
// legacy encodeSparseRasterData: raw uint32 words, including hidden RGB/IDs.
// The caller retains geometry, identities and document/save transaction state.
EncodedRaster encodeRaster(const std::uint32_t* pixels,std::size_t count,RasterFormat format,
 std::uint32_t width,std::uint32_t height,std::size_t maxBytes=Limits{}.expandedBytes);
// legacy encodeRuntimeRasterData for a missing frame's empty display runtime.
// Unlike dense encoding this always retains the sparse header, even at 1x1.
EncodedRaster encodeEmptyRuntimeRaster(RasterFormat format,std::uint32_t width,std::uint32_t height);
}
