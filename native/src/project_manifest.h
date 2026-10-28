#pragma once
#include "timelapse.h"
#include "project_information.h"
#include "document_slices.h"
#include "timeline_model.h"
#include "project_reader.h"
#include "custom_grid.h"
#include "project_brush_resources.h"
#include "reference_images.h"
#include "text_cel_data.h"
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
  bool autoLinkAnimationCels=false;std::optional<timeline::BackgroundSettings> background;
  std::shared_ptr<const ManifestRaster> surface;std::optional<std::uint32_t> displayColor;std::string description;
  bool clippingMask=false;
  std::optional<timeline::ColorOverlayStyle> layerStyles;
  std::string tilemapTilesetId;
  std::optional<timeline::LayerAdjustment> adjustment;
  std::optional<free_tiles::LayerData> freeTiles;
};
struct ManifestFrame {std::string id;int duration=100;bool disabled=false;};
// Parsed for inspection/round-trip evidence. Editable group admission remains gated.
struct ManifestGroup {
  std::string id,name,parentGroupId,blendMode="normal",description;
  bool visible=true,locked=false;
  double opacity=1;
  std::optional<double> panelOrder;
  std::optional<std::uint32_t> displayColor;
  bool clippingMask=false;
  std::optional<timeline::ColorOverlayStyle> layerStyles;
};
struct ManifestLoopSection {std::string id,name,startFrameId,endFrameId,direction="forward";std::optional<int> repeatCount;};
struct ManifestCel {
  std::optional<free_tiles::CelData> freeTiles;
  std::optional<tiles::CelData> tilemap;
  std::optional<TextCelData> text;
  std::string id,layerId,frameId,linkedCelId;
  int zIndex=0;
  std::optional<double> opacity;
  std::shared_ptr<const ManifestRaster> surface;
};
struct ManifestMask {std::string ownerId,frameId,id,linkedMaskId;bool group=false,locked=false,autoLink=false;std::shared_ptr<const ManifestRaster> surface;};
struct ManifestPaletteEntry {int id=0;std::string name;std::uint32_t color=0;};
struct ReadManifest {
  int schemaVersion=0,width=0,height=0,paletteColumns=0,nextColorId=0;
  std::string id,name,activeLayerId,activeFrameId,colorMode;
 ProjectInformation information=ProjectInformation::fresh();timelapse::Settings timelapse;
  bool loop=false,showPixelGrid=false,showCustomGrid=false;GridSettings customGrid;
  std::optional<std::pair<double,double>> symmetryCenter;
  std::vector<ProjectBrushResource> customBrushes;
  ReferenceLibrary referenceImages;
  std::vector<DocumentSlice> slices;
  std::vector<tiles::Tileset> tilesets;
  std::vector<ManifestLayer> layers;
  std::vector<ManifestGroup> groups;
  std::vector<ManifestFrame> frames;
  std::vector<ManifestLoopSection> loopSections;
  std::vector<ManifestCel> cels;
  std::vector<ManifestMask> masks;
  std::vector<std::string> maskDataFiles; // Includes legacy-priority shadowed entries.
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
