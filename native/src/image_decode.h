#pragma once
#include "document.h"
#include <filesystem>
namespace moon {Document openRasterImage(const std::filesystem::path& path);Document openGifAnimation(const std::filesystem::path& path);}
