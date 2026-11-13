#pragma once
#include "outline_samples.h"
#include "timelapse.h"
#include "project_information.h"
#include "project_manifest.h"
#include "timeline_model.h"
#include <array>
#include <unordered_map>
namespace moon {class Document;}
namespace moon::project {
struct ImportPaletteEntry {int id;std::u32string name;std::uint32_t color;};
struct ImportPalette {std::vector<ImportPaletteEntry> entries;std::vector<int> order,slots;int columns=8,nextId=1;};
struct PreparedImport {
 std::optional<OutlineSettings> outline;
 LayerPanelState layerPanelState;
 int width=0,height=0;std::string id,activeLayerId,activeFrameId;bool loop=true,showPixelGrid=false,showCustomGrid=false;GridSettings customGrid;std::u32string name;
 timeline::State timeline;ImportPalette palette;
 std::string pixelFormat="rgba32";
 std::unordered_map<std::string,std::array<int,4>> layerGeometry;
 ProjectInformation information=ProjectInformation::fresh();timelapse::Settings timelapse;
 std::vector<ProjectBrushResource> customBrushes;
 ReferenceLibrary referenceImages;
 std::vector<DocumentSlice> slices;
 std::optional<std::pair<double,double>> symmetryCenter;
 std::shared_ptr<const Bytes> sourceArchive;
};
// Admission only; never changes a live document, history, or the input manifest.
// Throws project::Error for corrupt relationships or unsupported editable data.
ImportPalette prepareEditablePalette(const ReadManifest& manifest);
PreparedImport prepareEditableImport(const ReadManifest& manifest);
// Shared construction path for project open, backup and history checkpoints.
Document createEditableDocument(PreparedImport);
}
