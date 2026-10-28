#pragma once
#include "gif_export.h"
#include "image_export.h"
#include <functional>
namespace moon {
struct FramePngExportOptions {GifExportOptions frames;bool automatic=false,bmp=false,ico=false,svg=false,jpeg=false;};
enum class FrameSequenceFormat {Png,Bmp,Ico,Svg,Jpeg};
enum class ExportConflictChoice {Cancel,Overwrite,Rename,OverwriteAll,RenameAll};
using ExportConflictResolver=std::function<ExportConflictChoice(const std::filesystem::path&,const std::filesystem::path&)>;
std::vector<std::string> framePngExportFrameIds(const timeline::State&,const FramePngExportOptions&);
std::u32string framePngExportStem(std::u32string name,std::u32string fallback=U"MoonSprite-export");
std::optional<std::vector<std::filesystem::path>> resolveExportDestinations(std::vector<std::filesystem::path>,const ExportConflictResolver&);
std::optional<std::vector<std::filesystem::path>> planFramePngPaths(const std::filesystem::path&,std::u32string,std::size_t,const ExportConflictResolver&,bool bmp=false);
std::optional<std::vector<std::filesystem::path>> planFrameSequencePaths(const std::filesystem::path&,std::u32string,std::size_t,const ExportConflictResolver&,FrameSequenceFormat);
JpegImageExport encodeFrameJpeg(const Document&,const std::string&,const FramePngExportOptions&);
SvgImageExport encodeFrameSvg(const Document&,const std::string&,const FramePngExportOptions&);
IcoImageExport encodeFrameIco(const Document&,const std::string&,const FramePngExportOptions&);
BmpImageExport encodeFrameBmp(const Document&,const std::string&,const FramePngExportOptions&);
StaticImageExport encodeFramePng(const Document&,const std::string&,const FramePngExportOptions&);
std::size_t writeFramePngSequence(const Document&,const FramePngExportOptions&,const std::vector<std::filesystem::path>&,const std::function<bool()>& cancelled={},const std::function<void(std::size_t,std::size_t)>& progress={});
}
