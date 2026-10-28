#pragma once
#include "text_cel_data.h"
#include "timeline_model.h"
#include <functional>
namespace moon {
struct TextGlyph {int left=0,top=0,width=0,height=0;double advance=0;std::vector<std::uint8_t> alpha;};
using TextGlyphProvider=std::function<std::optional<TextGlyph>(const std::string&,int,char32_t,int)>;
// Provider returns thresholded alpha for pixel mode (192); smooth mode threshold is 1.
timeline::Surface rasterizeText(const TextCelData&,int x,int y,const TextGlyphProvider&);
}
