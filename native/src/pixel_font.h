#pragma once
#include <array>
#include <map>
#include <string>
#include <vector>
#include "gfx/color.h"
#include "gfx/rect.h"
#include "os/os.h"
namespace ui { class Graphics; }
namespace moon {
class PixelFont {
public:
  static constexpr int cell = 10;
  explicit PixelFont(const std::string& path);
  void draw(ui::Graphics& g, const std::u32string& text, int x, int y, gfx::Color color) const;
  int measure(const std::u32string& text) const;
  // Visible bitmap pixels relative to draw(text, 0, 0), excluding advance whitespace.
  gfx::Rect inkBounds(const std::u32string& text) const;
  void smokeRasterEquivalent() const;
private:
  struct Glyph { int advance=10, width=0, height=0, x=0, y=0; std::vector<unsigned> rows; };
  std::map<char32_t, Glyph> glyphs_;
  mutable std::map<char32_t,os::SurfaceRef> rasterGlyphs_;
};
}
