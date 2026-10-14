#pragma once
#include "project_reader.h"
#include "project_brush_resources.h"
#include <optional>
namespace moon::project {
struct ManifestRaster {
  int width=0,height=0,offsetX=0,offsetY=0;
  std::string dataFile,dataEncoding;
  std::vector<std::uint32_t> pixels;
};
struct ManifestLayer {
  std::string id,name,blendMode="normal",kind,groupId,linkedContentId;
  bool visible=true,locked=false;
  double opacity=1;
  bool autoLinkAnimationCels=false;
  std::shared_ptr<const ManifestRaster> surface;
};
struct ManifestFrame {std::string id;int duration=100;bool disabled=false;};
struct ManifestLoopSection {std::string id,name,startFrameId,endFrameId,direction="forward";std::optional<int> repeatCount;};
struct ManifestCel {
  std::string id,layerId,frameId,linkedCelId;
  int zIndex=0;
  std::optional<double> opacity;
  std::shared_ptr<const ManifestRaster> surface;
};
struct ManifestPaletteEntry {int id=0;std::string name;std::uint32_t color=0;};
struct ReadManifest {
  int schemaVersion=0,width=0,height=0,paletteColumns=0,nextColorId=0;
  std::string id,name,activeLayerId,activeFrameId,colorMode;
  bool loop=false;
  std::optional<std::pair<double,double>> symmetryCenter;
  std::vector<ProjectBrushResource> customBrushes;
  std::vector<ManifestLayer> layers;
  std::vector<ManifestFrame> frames;
  std::vector<ManifestLoopSection> loopSections;
  std::vector<ManifestCel> cels;
  std::vector<ManifestPaletteEntry> palette;
  std::vector<int> paletteOrder,paletteSlots; // Empty slots use zero; real IDs are positive.
  std::vector<std::string> unsupported;
  // Lossless evidence retained, including fields not represented in this DTO.
  // Successful parsing does NOT authorize dropping unsupported data into Document.
  std::string manifestUtf8;
  std::shared_ptr<const Bytes> sourceArchive;
};
ReadManifest readProjectManifest(std::shared_ptr<const Bytes> bytes,Limits limits={});
}
