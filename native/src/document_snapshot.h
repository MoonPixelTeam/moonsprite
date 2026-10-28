#pragma once
#include "document.h"
#include "raster_snapshot.h"
namespace moon {
// Captures one stable document generation without copying undo history. The
// UI advances bounded payload copies; finish() validates on the worker thread.
class DocumentSnapshot {
  RasterSnapshot raster_;
  std::uint64_t identity_,revision_,contentRevision_;
  int width_,height_;bool loop_,complete_=false,showPixelGrid_=false;
  bool showCustomGrid_=false;GridSettings customGrid_;
  std::string projectId_,layer_,frame_;
  std::u32string name_;PaletteState palette_;SymmetryCenter symmetry_;
  ProjectInformation information_;timelapse::Settings timelapse_;
  std::shared_ptr<const std::vector<std::uint8_t>> archive_;
  std::vector<ProjectBrushResource> brushes_;
  ReferenceLibrary references_;
  std::vector<DocumentSlice> slices_;
  std::size_t brush_=0,part_=0,offset_=0;
public:
  explicit DocumentSnapshot(const Document& document,std::string newProjectId={});
  bool matches(const Document& document) const;
  bool advance(const Document& document,std::chrono::steady_clock::time_point deadline);
  Document finish();
};
}
