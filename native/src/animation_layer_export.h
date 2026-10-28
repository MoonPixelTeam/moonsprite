#pragma once
#include "frame_png_export.h"
namespace moon {
struct AnimationLayerExportOptions {GifExportOptions animation;bool webp=false;bool staticImage=false;StaticImageExportOptions image;int format=0;};
struct AnimationLayerExportPlan {std::vector<std::string> layerIds;std::vector<std::filesystem::path> paths;};
// Legacy document.layers is bottom-to-top; native timeline is top-to-bottom.
std::vector<std::string> animationExportLayerIds(const timeline::State&,const std::string& requested={});
std::optional<AnimationLayerExportPlan> planAnimationLayerExport(const Document&,const std::string&,const std::filesystem::path&,std::u32string,bool,const ExportConflictResolver&);
std::optional<AnimationLayerExportPlan> planStaticLayerExport(const Document&,const std::string&,const std::filesystem::path&,std::u32string,int,const ExportConflictResolver&);
std::optional<AnimationLayerExportPlan> planSliceExport(const Document&,const std::string&,const std::filesystem::path&,std::u32string,const ExportConflictResolver&);
std::size_t writeAnimationLayerExport(const Document&,const AnimationLayerExportOptions&,const AnimationLayerExportPlan&,const std::function<bool()>& cancelled={},const std::function<void(std::size_t,std::size_t)>& progress={});
}
