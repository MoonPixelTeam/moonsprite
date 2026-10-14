#pragma once
#include "skin_assets.h"
namespace moon {
struct ThemePart {
  std::string id;
  int x=0,y=0,w=0,h=0;
  SkinPatch patch;
  bool nineSlice=false, connected=false;
};
struct ThemeAtlas {
  SkinAssets assets;
  std::shared_ptr<const SkinBitmap> sheet;
  std::vector<ThemePart> parts;
};
// Loads our documented theme.xml subset plus its sibling sheet.png.
// XML metadata is read independently; no Aseprite app code is linked.
ThemeAtlas loadThemeAtlas(const std::filesystem::path& xml);
}
