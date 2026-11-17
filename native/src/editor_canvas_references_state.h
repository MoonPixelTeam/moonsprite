#pragma once
#include "canvas_reference_dialog.h"
#include "canvas_reference_image.h"
#include "canvas_reference_geometry.h"
#include "ui/property.h"
#include "ui/timer.h"
#include <future>
#include <map>
namespace moon {class Document;}
namespace moon::editor {
class Editor;
struct CanvasReferenceUiState final:ui::Property {
 struct Cached {std::shared_ptr<const std::string> source;CanvasReferenceImage image;os::SurfaceRef surface;bool failed=false;std::uint64_t started=0;};
 struct Import {std::weak_ptr<Document> owner;std::uint64_t identity=0;TransformPoint point;double zoom=1;std::string name,replace;bool paste=false;};
 struct Loaded {std::shared_ptr<const std::string> source;CanvasReferenceImage image;};
 struct PendingImport {Import request;std::future<Loaded> result;};
 std::map<std::pair<std::uint64_t,std::string>,Cached> cache;
 std::map<std::uint64_t,std::string> selected;
 std::unique_ptr<CanvasReferenceDialog> dialog;
 std::shared_ptr<Document> gestureOwner;
 std::string gestureId,handle;
 CanvasReference start;
 TransformPoint pointerStart,last;
 gfx::Point lastDisplay;
 os::SurfaceRef outline;
 std::vector<double> outlineKey;
 const void* outlineMaterial=nullptr;
 std::string dialogId;
 ui::Timer importTimer;
 ui::Timer animationTimer;
 std::vector<PendingImport> imports;
 explicit CanvasReferenceUiState(Editor&);
 ~CanvasReferenceUiState()override;
};
CanvasReferenceUiState& canvasReferenceState(Editor&);
CanvasReferenceUiState::Cached& canvasReferenceCached(Editor&,const CanvasReference&);
std::vector<const CanvasReference*> canvasReferenceDrawOrder(const Editor&);
}
