#pragma once
#include <vector>
#include <string>

namespace moon {
struct LegacyTool {const char* id;const char32_t* label;const char* icon;int command=-1;};
// Order/group membership: legacy core/tool-rail-preferences.ts DEFAULT_TOOL_RAIL.
// Names/icons: legacy locales/editor-tools.ts and components/app/editor-tools.tsx.
inline const std::vector<std::vector<LegacyTool>>& legacyToolGroups() {
  static const std::vector<std::vector<LegacyTool>> groups{
    {{"pencil",U"铅笔工具","tool-pencil",1},{"airbrush",U"喷枪工具","tool-airbrush"},{"smooth",U"平滑笔刷","tool-smooth"}},
    {{"eraser",U"橡皮擦工具","tool-eraser",2},{"magic-eraser",U"魔术橡皮擦","tool-magic-eraser"}},
    {{"liquify",U"液化工具","tool-liquify"}},
    {{"selection.rectangle",U"矩形框选工具","selection-rectangle"},{"selection.ellipse",U"椭圆框选工具","selection-ellipse"},{"selection.lasso",U"套索工具","selection-lasso"},{"selection.polygon-lasso",U"多边形套索工具","selection-polygon-lasso"},{"selection.magic",U"魔棒工具","selection-magic"},{"selection.brush",U"选区笔刷","selection-brush"}},
    {{"shape.rectangle-outline",U"矩形工具","shape-rectangle"},{"shape.rectangle",U"矩形填充工具","shape-rectangle-fill"},{"shape.ellipse-outline",U"椭圆工具","shape-ellipse"},{"shape.ellipse",U"椭圆填充工具","shape-ellipse-fill"},{"shape.freeform",U"自由形状工具","shape-freeform"},{"shape.polygon",U"多边形工具","shape-polygon"}},
    {{"line.line",U"直线工具","shape-line"},{"line.curve",U"曲线工具","shape-curve"}},
    {{"fill.bucket",U"油漆桶工具","tool-fill"},{"fill.gradient",U"渐变工具","tool-gradient"}},
    {{"text",U"文本工具","tool-text"}},
    {{"move.move",U"移动工具","tool-move"},{"move.slice",U"切片工具","tool-slice"}},
    {{"eyedropper",U"吸管工具","tool-eyedropper"}},
    {{"hand",U"抓手工具","tool-hand",5}},
    {{"zoom",U"缩放工具","tool-zoom"}},
    {{"rotate",U"旋转视图工具","tool-rotate"}}
  };
  return groups;
}
}
