#pragma once
#include "native_widgets.h"
#include "extension_runtime_directory.h"
#include "extension_settings_values.h"
namespace moon::editor {
// The caller owns Storage and RuntimeRegistry for the entire modal lifetime.
// HTML settings entries require their separate native migration; no browser host.
void showExtensionSettings(const PixelFont&,const Skin&,const Skin&,ui::Display*,gfx::Rect,const extension::RuntimeCandidate&,extension::Storage&,extension::RuntimeRegistry&);
void checkExtensionSettings(const PixelFont&,const Skin&,const Skin&,ui::Display*,gfx::Rect,const std::filesystem::path&);
}
