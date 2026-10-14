#pragma once
#include <cstdint>
#include <filesystem>
#include <optional>
#include <vector>

namespace moon {
class RecentColors {
  std::vector<std::uint32_t> colors_;
public:
  static constexpr std::size_t capacity=24;
  const std::vector<std::uint32_t>& values() const {return colors_;}
  // Returns whether legacy would persist/publish; the only fast path is one
  // input color already at the head. RGBA equality includes all alpha bits.
  bool remember(const std::vector<std::uint32_t>& colors);
  // Necessary localStorage adaptation: native UTF-8 text, one R G B A row.
  // Missing storage means empty; invalid rows are ignored. I/O errors throw.
  void load(const std::filesystem::path& path);
  void save(const std::filesystem::path& path) const;
};
enum class RecentPaintKind {Draw,Airbrush,Shape,Fill,Gradient,Navigation};
class RecentPaintDrag {
  bool recorded_=false;
public:
  void reset() {recorded_=false;}
  bool observe(RecentColors& recent,RecentPaintKind kind,bool eraser,std::uint32_t color,
               bool hasPixelChanges,std::optional<std::uint32_t> gradientEnd={});
};
}
