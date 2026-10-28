#pragma once
#include "timeline_model.h"
#include <chrono>
namespace moon {
// Native project-save-transfer adapter: detached metadata and bounded copies.
// Caller verifies document identity/revisions before each advance; only the
// completed value may cross threads. No history or live pointers are retained.
class RasterSnapshot {
  std::vector<std::size_t> sourcePixelOwners_;
  timeline::State state_;
  std::vector<std::size_t> sourcePixelCounts_;
  std::size_t cel_=0,offset_=0,copiedPixels_=0,mask_=0,tileset_=0;
public:
  static constexpr std::size_t chunkPixels=16384;
  static constexpr std::size_t tickPixels=262144; // 1 MiB per UI tick.
  explicit RasterSnapshot(const timeline::State& source);
  // Metadata only: detects no-op geometry changes without scanning pixels.
  bool matches(const timeline::State& source) const;
  bool advance(const timeline::State& source,std::chrono::steady_clock::time_point deadline,std::size_t maxPixels=tickPixels);
  timeline::State take();
  std::size_t copiedPixels() const {return copiedPixels_;}
};
}
