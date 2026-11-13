#pragma once
#include "airbrush.h"
#include "brush_dynamics.h"
#include "eyedropper_model.h"
#include "gradient_model.h"
#include "liquify.h"
#include "pattern_brush_library.h"
#include "shape_model.h"
#include <array>
#include <optional>
#include <string>
#include <vector>

namespace moon::workspace {
// Legacy DocumentSession owns these values directly. Gesture jobs, controls,
// shared colors and persisted defaults remain separate. Tab switching selects
// an owner and never copies individual tool settings.
struct TemporaryBrushCapture {int kind=0,mode=0,radius=4;bool rounded=false;std::uint64_t identity=0;};
struct ToolSessionState {
 bool selectionTool{};
 bool shapeTool{};
 bool eyedropperTool{};
 bool zoomTool{};
 bool gradientTool{};
 bool fillTool{};
 bool handTool{};
 bool eraser{};
 bool moveTool{};
 bool textTool{};
 bool rotateTool{};
 bool smoothTool{};
 bool airbrushTool{};
 bool liquifyTool{};
 bool magicEraserTool{};
 bool sliceMode{};
 int selectionMode{};
 int selectionKind{};
 bool selectionRounded{};
 int selectionCornerRadius=4;
 bool selectionRotSprite{};
 int selectionBrushAngle{};
 WandOptions wandOptions{};
 ShapeKind shapeKind=ShapeKind::Rectangle;
 bool shapeRounded{};
 bool shapeRatio{};
 int shapeRadius=4;
 double shapeRatioWidth=1;
 double shapeRatioHeight=1;
 int curveAnchorCount=2;
 WandOptions fillOptions{};
 PatternFillOptions fillPattern{};
 PatternBrushSelection fillLibrarySelection{};
 std::u32string fillImageName{};
 bool rememberGradientTool{};
 bool gradientRadial{};
 int gradientDither{};
 WandOptions gradientOptions{};
 std::vector<GradientStop> gradientStops{};
 bool gradientConfirm{};
 bool gradientFreeform{};
 std::array<BrushOptions,2> brushProfiles{};
 std::array<InkMode,8> inkProfiles{};
 bool syncInkAcrossTools{};
 std::string pencilImageBrushId{};
 double pencilImageBrushAngle{};
 std::optional<PatternBrush> pencilImageBrush{};
 dynamics::Settings brushDynamics{};
 AirbrushSettings airbrushSettings{};
 liquify::Options liquifyOptions{};
 int smoothStrength=50;
 int smoothAngle{};
 BrushOptions smoothBrush{};
 std::optional<BrushOptions> temporaryBrushReturnProfile{};
 std::optional<TemporaryBrushCapture> temporaryBrushCapture;
 bool temporaryBrushActive=false;
 bool moveAutoSelect=true;
 EyedropperSource eyedropperSource=EyedropperSource::Composite;
 bool magicEraserContiguous{};
};
}
