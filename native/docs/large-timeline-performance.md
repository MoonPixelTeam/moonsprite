# 大量帧、图层的绘制与时间轴性能

2026-10-15；Windows / Release；范围为当前已接入的普通 RGBA 图层和 Cel。

## 对照依据

- Aseprite `.cache/aseprite/src/app/ui/timeline/timeline.cpp` 的 `getDrawableLayers` / `getDrawableFrames` 和可见 Cel 绘制循环：按视口取行列。应用代码受 EULA 约束，本次仅研究，未复制实现。
- legacy `components/panels/layer-timeline-cell-window.ts`、`use-layer-timeline-cell-window.ts`：双向窗口、远距离滚动立即补足可见格。
- legacy `core/animation.ts` 和 `animation-timeline-index-performance.test.ts`：缓存稳定 ID 与槽位索引，避免热路径查找整个数组。
- legacy `components/panels/layer-timeline-cell-cache.ts`、`timeline-cell-element-cache.ts`：相同视觉状态复用结果。原生适配为视口 RGBA 缓存，复用现有皮肤绘制和命中控件。
- legacy `core/document-composite-plan.ts::emptyCompositeRaster`：仅跳过已证明为空的像素存储，未知的实时编辑内容保守绘制。
- legacy `store/workspace-commands-animation-selection.ts`：Set 去重，保留选择顺序、追加范围和锚点语义。

## 修复

1. 当前帧／图层、帧范围端点及排序复用 Timeline 的哈希索引。索引仍在结构改变时重建，复制／移动保存值语义，无缓存裸指针。
2. 图层名称、眼睛、锁和自动链接按视口复用行控件。点击、双击属性、右键与扫过式手势都在事件发生时转换为实际行。帧头和帧格保留原有可见窗口。
3. 普通多图层合成复用空内容摘要，链接 Cel 共享源摘要。空存储不再逐像素参与每次合成；可变像素借用或 setPixel 使对应源失效。实时笔画不会写入可复用的空摘要，替换预览优先于空判断。默认通用合成调用不主动建立摘要，空闲 CanvasRenderer 显式允许建立缓存。
4. 时间轴滚动共享一次完整视口合成。此前透明命中控件及半透明滚动条各自要求父级重画，放大了布局与绘制开销。停靠时间轴格直接读取缓存；浮动面板和模态仍沿用遮挡路径。尺寸、布局、内容刷新及 hover／选择变化使缓存失效，缓存只保留一个视口。
5. 未变的工具栏／滚动条／格子位置不重复 setBounds；滚动条参数未变化不重复 configure。
6. 大范围选择用哈希去重替代逐项 vector 查重；可见格与选框用哈希成员判断。拖动范围边界在按下时计算，同一目标内的移动不重复建立选择与布局。
7. 画布中的鼠标移动不查询时间轴选框；同一格内移动仅在皮肤边框 hover 改变时使时间轴失效。选框仍统一使用 selectionMaterialBounds / drawSelectionBorder / selectionContains。

## 可复现检查

`canvas-performance-tests`：128×128、256 图层、1000 帧（256000 槽位），各层后续帧链接到首帧，多数层为空。逐像素比较有／无空摘要的合成；远端帧绘制、链接源共享、脏区上传、撤销／重做和复制后的索引一致。计时为 CPU 离屏合成，不包含硬件输入到显示器延迟。

`moonsprite-native --large-timeline-performance-check` / CTest `large-timeline-performance`：8×8、256 图层、1000 帧，真实窗口、滚动条回调、Manager flushRedraw / dispatchMessages。双轴远跳、非整格滚动与末端钳制后，局部更新与完整窗口逐像素比较；核对可见格命中、复用控件数量、眼睛／锁／自动链接及扫过手势、文档历史／画布上传保持不变。另测 16384 格选择、重复拖动目标及 hover。

测量输出：`build/test-tmp/large-timeline-performance.txt`；合成输出由 `build/Release/canvas-performance-tests.exe` 打印。时间值受机器负载影响，回归以画面、行为、工作数量断言为准。

当前记录：空层缓存的整帧 CPU 合成为 2.73 → 0.13 ms（约 21 倍）；时间轴同一组 20 次双轴滚动从首轮局部绘制的约 188 ms／次降至约 4–5.3 ms／次，20 次只合成 20 次时间轴，整界面绘制为 0。256 图层仅保留约 5 行控件，数量随窗口可见行数变化。16384 格替换＋追加＋刷新约 13–18 ms，选框约 0.008 ms，同目标重复拖动约 0.00017 ms。

## 边界与后续框架

这些结果不代表 256 个满画布半透明图层也能保持相同时间。完整可见内容仍需要按图层与像素合成；首次建立内容摘要、导入、增删帧／图层、复杂结构拖放、保存和撤销结构事务仍可能处理整个图。没有提高现有产品限制，也未将尚未迁移的组、蒙版、样式、瓦片等宣称为已优化。

后续按 performance-framework.md 承接 legacy 的行范围／块摘要、增量失效、缓存预算与后台任务。时间轴行／格复用与稳定 ID 接口作为这些功能接入的边界；增加新的渲染状态时必须同时补充缓存失效和局部／完整画面对照。

本轮相关 CTest 12／12 通过：timeline-interaction、canvas-performance、brush-preview、brush-preview-performance、wheel-performance、large-timeline-performance、layers-render、panel-docking-interactions、selection-interactions、window-input-hit-testing、timeline-model、layer-compositor。来源覆盖检查通过（164 文件）；--strict 仍按迁移缺口返回失败，不代表已完成全部 legacy 功能迁移。未执行全套测试，不覆盖既有导入／保存等其他领域失败。

后续列宽迁移后的回归：部分可见帧格中心可能位于列宽拖动条的合法覆盖范围。压力测试现按 separator 与帧格分别核对命中，应用命中逻辑未变；256层／1000帧的完整画面对照和交互检查再次通过。绘制／拖动优化及额外检查边界见 [记录](drawing-pan-performance.md)。
