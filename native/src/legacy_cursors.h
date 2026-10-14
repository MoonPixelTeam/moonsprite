#pragma once
#include "skin_assets.h"
#include "os/os.h"
#include <map>

namespace moon {
class LegacyCursors {
  std::map<std::string,os::CursorRef> cursors_;
public:
  explicit LegacyCursors(const std::filesystem::path& directory,const SkinAssets* atlas=nullptr);
  const os::CursorRef& get(const std::string& id) const {return cursors_.at(id);}
  std::size_t size() const {return cursors_.size();}
};
inline const char* legacyPaintCursor(int r,int g,int b) {
  // legacy/core/canvas-visuals.ts: colorLuminance + canvasToolCursor.
  return r*0.2126+g*0.7152+b*0.0722<145?"pencil-white":"pencil-black";
}
}
