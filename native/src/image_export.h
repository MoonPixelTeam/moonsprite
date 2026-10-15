#pragma once
#include "document.h"
#include <filesystem>
namespace moon {
struct StaticImageExportOptions {int scalePercent=100;bool trim=false,selection=false,automatic=false;};
struct StaticImageExport {int width=0,height=0;std::vector<Pixel> pixels;std::vector<std::uint8_t> png;bool indexed=false;};
struct SvgImageExport {int width=0,height=0;std::vector<std::uint8_t> bytes;};
std::vector<std::uint8_t> encodeImageSvg(int width,int height,const std::vector<Pixel>& pixels);
SvgImageExport encodeStaticImageSvg(const Document& document,StaticImageExportOptions options={});
struct IcoImageExport {int width=0,height=0;std::vector<std::uint8_t> bytes;};
IcoImageExport encodeImageIco(int width,int height,const std::vector<Pixel>& pixels);
IcoImageExport encodeStaticImageIco(const Document& document,StaticImageExportOptions options={});
struct BmpImageExport {int width=0,height=0;std::vector<std::uint8_t> bytes;};
std::vector<std::uint8_t> encodeImageBmp(int width,int height,const std::vector<Pixel>& pixels);
BmpImageExport encodeStaticImageBmp(const Document& document,StaticImageExportOptions options={});
StaticImageExport encodeImagePng(int width,int height,std::vector<Pixel> pixels,bool automatic);
StaticImageExport encodeRgbaImagePng(int width,int height,std::vector<Pixel> pixels);
void writeExportBytesAtomic(const std::filesystem::path& path,const std::vector<std::uint8_t>& bytes);
StaticImageExport encodeStaticImagePng(const Document& document,StaticImageExportOptions options={});
void writeStaticImagePngAtomic(const std::filesystem::path& path,const StaticImageExport& image);
}
