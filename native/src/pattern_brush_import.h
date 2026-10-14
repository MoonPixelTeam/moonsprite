#pragma once
#include "pattern_fill.h"
#include <filesystem>
#include <string>
namespace moon {
struct ImportedPatternBrush {std::string id;std::u32string name;PatternBrush brush;};
// Port of brushes.ts createImageBrushFromRgba; source alpha is coverage and colors retain RGBA.
inline PatternBrush createPatternBrushFromRgba(int width,int height,const std::vector<std::uint8_t>& rgba){
 if(width<1||height<1||width>64||height>64)throw std::invalid_argument("Image brushes must be 1..64 pixels");
 if(rgba.size()!=std::size_t(width)*height*4)throw std::invalid_argument("Invalid image brush pixels");
 PatternBrush brush;brush.width=width;brush.height=height;brush.coverage.resize(std::size_t(width)*height);brush.colors.resize(brush.coverage.size());
 for(std::size_t i=0;i<brush.coverage.size();++i){brush.coverage[i]=rgba[i*4+3];brush.colors[i]=std::uint32_t(rgba[i*4])|(std::uint32_t(rgba[i*4+1])<<8)|(std::uint32_t(rgba[i*4+2])<<16)|(std::uint32_t(rgba[i*4+3])<<24);}return brush;
}
// Static PNG/JPEG/BMP adapter. GIF composition and WebP decoding remain migration gaps.
ImportedPatternBrush importPatternBrush(const std::filesystem::path& path);
std::vector<std::uint8_t> encodePatternBrushPng(const PatternBrush& brush);
}
