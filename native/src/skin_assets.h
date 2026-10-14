#pragma once
#include <cstdint>
#include <filesystem>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace moon {
struct SkinBitmap {
  int width=0, height=0;
  std::vector<std::uint32_t> pixels; // Straight RGBA, R in the low byte.
};
struct SkinPatch {
  std::shared_ptr<const SkinBitmap> bitmap;
  int left=1, top=1, right=1, bottom=1;
};
struct SkinAssets {
  std::map<std::string,SkinPatch> patches;
  std::map<std::string,std::uint32_t> colors;
  struct TextStyle {std::string color;int x=0,y=0;};
  std::map<std::string,TextStyle> text;
  std::filesystem::path themeXml;
};
void validatePatch(const SkinPatch& patch);
SkinPatch importSkinPng(const std::filesystem::path& path,int maximumDimension=256);
}
