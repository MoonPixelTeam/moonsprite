#pragma once
#include <cmath>
#include <cstdint>
#include <string>
namespace moon {
// legacy core/color-values.ts displayRgbaHex: opaque RGB, otherwise RGBA.
inline std::u32string displayColorRoleHex(std::uint32_t rgba) {
  constexpr char32_t hex[]=U"0123456789ABCDEF";
  std::u32string text=U"#";
  const int channels=(rgba>>24)==255?3:4;
  for(int i=0;i<channels;++i) {const auto byte=(rgba>>(i*8))&255;text+=hex[byte>>4];text+=hex[byte&15];}
  return text;
}
// Exact legacy core/palette-layout.ts paletteMarkerColor threshold and colors.
inline std::uint32_t colorRoleTextColor(std::uint32_t rgba) {
  if((rgba>>24)<128) return 0xff0d0a09;
  auto linear=[](unsigned channel) {const double value=channel/255.0;return value<=0.04045?value/12.92:std::pow((value+0.055)/1.055,2.4);};
  const double luminance=linear(rgba&255)*0.2126+linear((rgba>>8)&255)*0.7152+linear((rgba>>16)&255)*0.0722;
  return luminance>0.179?0xff0d0a09:0xffffffff;
}
}
