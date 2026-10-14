#pragma once
#include "document.h"
#include <filesystem>
namespace moon {
struct StaticImageExportOptions {int scalePercent=100;bool trim=false,selection=false;};
struct StaticImageExport {int width=0,height=0;std::vector<Pixel> pixels;std::vector<std::uint8_t> png;};
StaticImageExport encodeRgbaImagePng(int width,int height,std::vector<Pixel> pixels);
void writeExportBytesAtomic(const std::filesystem::path& path,const std::vector<std::uint8_t>& bytes);
StaticImageExport encodeStaticImagePng(const Document& document,StaticImageExportOptions options={});
void writeStaticImagePngAtomic(const std::filesystem::path& path,const StaticImageExport& image);
}
