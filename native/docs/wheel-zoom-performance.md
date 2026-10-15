# 滚轮缩放卡顿检查与修复

2026-10-15。沿原生滚轮入口检查；保持旧版离散缩放档位、滚轮方向、指针锚点、画布限制、Ctrl 滚轮修改笔刷及绘画中禁止缩放的行为。

确认的额外开销：

1. `setCanvasZoom` 在每次缩放后调用整个 Editor 的 `invalidate()`，不相关的色板、时间轴和控件也进入重绘。现在只使画布内部区域（包含滚动条条带）及底部状态文字失效；为这两个区域增加专门绘制路径，保留工作层背景和浮动面板遮挡。
2. 对称轴按照整个放大后文档的物理宽高逐像素循环。例如 1024px 文档在 64 倍、UI 2 倍下，一条轴可检查 131072 个样本，屏幕外部分也调用绘制。现在限制循环到实际 clip，并为轴粗细保留外扩；采样位置、顺序和透明度保持原样。仅垂直轴不再做无输出的横向循环。

实现依据：legacy `useCanvasDeviceRouter.ts` 的 wheel 入口、`useCanvasViewPreview.ts` 的 `scheduleZoomPreview/requestDrawRef`、`core/canvas-input-navigation.ts` 的档位和锚点，以及 `canvas-render-guides.ts` 的轴绘制。对称轴保留当前原生采样方式，仅作可见性裁剪，避免引入新的栅格差异。

`wheel-performance` 检查实际 Wheel MouseMessage → Editor → Widget 失效 → Manager PaintMessage → 窗口 framebuffer。测试显式 flushRedraw 再 dispatch，确保即时调用没有停在等待输入状态。full 模式保留整编辑器失效及未裁剪对称样本，local 模式使用优化路径；验证 baseline 确实产生 chrome 绘制，优化模式不重绘 chrome。

逐像素对比涵盖连续放大/缩小、滚动条出现/消失、半透明轴、1/8px 轴粗细、分数/普通/最大缩放。检查 Document 内容修订、历史、dirty 和 CanvasRenderer 内容上传次数不变。计时包含 UI 绘制和窗口呈现调用，属于合成输入回放，不是鼠标到显示器的硬件端到端测量。

原始输出位于 `build/test-tmp/wheel-performance.txt`，失败诊断位于 `build/wheel-performance-error.txt`（可能保留较早失败，以进程/CTest 最新退出码为准）。

## 实测结果

正式 Release 上的实际 Manager 绘制回放，256×256 文档，在 24/32 倍之间交替滚轮 20 次（UI 2×），本轮记录：

| 场景 | 原完整重绘/未裁剪轴 | 局部重绘/裁剪轴 |
| --- | ---: | ---: |
| 无对称轴 | 25.468ms/步 | 5.643ms/步 |
| 全部对称轴 | 750.580ms/步 | 5.509ms/步 |

full 模式 20 步累计 3700 次 chrome 绘制，local 为 0。原失效会同时刷新许多透明子控件，其背景又要求父控件绘制；同一视图的对称轴因此多次重画。这是本轮测试场景的结果，不能当作所有工程的固定加速倍数。

最终 `wheel-performance` 通过（21.09s），包含完整窗口像素等价、轴裁剪像素等价和内容上传不变。专用状态区沿 2× 逻辑布局计算物理 bounds，保留奇数窗口高度末行的原行为。

来源登记已更新。本次检查时另有并行新增 `tests/canvas_trim_test.cpp` 尚未登记，仓库来源覆盖检查报告 Unregistered；没有修改、删除或代替该测试登记来源。

配套回归 brush-preview、brush-preview-performance、panel-docking-interactions、window-input-hit-testing 均通过；加本次 wheel-performance 共 5 项通过。本轮未执行全功能套件或硬件输入到屏幕延迟测量。
