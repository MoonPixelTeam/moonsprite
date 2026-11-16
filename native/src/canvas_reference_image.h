#pragma once
#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>
#include <memory>
namespace moon {
class CanvasReferenceAnimation;
struct CanvasReferenceImage {int width=0,height=0;std::vector<std::uint32_t> pixels;std::shared_ptr<CanvasReferenceAnimation> animation;};
// Updates raw RGBA and the displayed frame together. Original encoded bytes remain
// the persisted resource; playback never creates document history.
bool advanceCanvasReferenceImage(CanvasReferenceImage&,std::uint64_t elapsedMilliseconds);
CanvasReferenceImage decodeCanvasReferenceImage(const std::string&);
std::string readCanvasReferenceSource(const std::filesystem::path&);
std::string canvasReferenceDataUrl(const std::vector<std::uint8_t>&,const std::string& mime="image/png");
}
