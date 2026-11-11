#pragma once
#include <filesystem>
#include <functional>
#include "gfx/rect.h"
namespace ui { class Display; }
namespace moon { class PixelFont; struct Skin; }
namespace moon::editor {
// Legacy useAppExtensions installer, hosted by the native shared dialog shell.
bool installExtensionPackage(const PixelFont&,const Skin&,const Skin&,ui::Display*,const gfx::Rect&,const std::filesystem::path&,const std::filesystem::path&,std::function<void()> installed={});
void checkExtensionInstallDialog(const PixelFont&,const Skin&,const Skin&,ui::Display*,const gfx::Rect&,const std::filesystem::path&);
}
