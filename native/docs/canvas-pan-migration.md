# 画布平移：legacy 来源与原生适配

后续修正：内容与棋盘格已分层，缓存由文档修订/脏区管理，缩放采用 legacy 完整23档；下面保留首次平移修正记录，当前状态以[全代码审查](legacy-architecture-audit.md)为准。

本次修正原生原型的平移精度和重绘路径，不代表整个 legacy 画布已完成迁移。

## 来源

- `legacy/src/renderer/src/core/canvas-input-navigation.ts`：按起始指针与起始视图计算位移，不累加每次事件的舍入误差。
- `legacy/src/renderer/src/components/canvas-input-navigation.ts`：中键、空格临时抓手、抓手工具，以及拖动的捕获与结束。
- `legacy/src/renderer/src/core/canvas-interface-scale.ts`：界面缩放与画布 backing 像素分开。
- `legacy/src/renderer/src/components/useCanvasViewPreview.ts`：最新视图使用内容绘制的同一调度入口，不额外启动平移渲染循环。
- `legacy/src/renderer/src/core/view-geometry.ts`、`legacy/docs/architecture/coordinates-rendering.md`：50% 越界范围，视图变化不进入文档历史。

## 修正与适配

旧原型使用 laf 的窗口 2× 缩放，输入与 framebuffer 都只有半分辨率，导致拖动只能以两个屏幕像素跳动。现改为窗口 scale=1，输入、画布原点、命中与输出统一使用设备像素。布局、Fusion 10px 字模和可替换皮肤通过 `ui_scale.h` 保持 2×，没有改变素材。

TypeScript/React/RAF 不能直接在 C++/laf 中运行。原生沿用相同职责分离：`CanvasPan` 保留起始状态，移动即时更新视图，`invalidateRect` 向已有 UI 绘制调度提交画布区域。松手结束、取消还原起点；视图从不写入文档事务。

当前单层内容与棋盘格合成为一张最近邻缓存，画布和预览共用；拖动不扫描文档像素、不重建缓存、不绘制栏目。绘画更新、取消、撤销重做、新建、皮肤应用会使缓存失效。原有九宫格缓存继续复用。

本次保留原型已有缩放档位与显示尺寸，未迁移 legacy 的旋转、镜像、自定义拖动灵敏度以及完整多层/动画缓存体系；不能据此声称已经直接复用了完整旧渲染器。

## 定向验证

- `moon-core-tests` / CTest `document-transactions`：坐标、越界限制、缩放锚点及文档事务。
- `--smoke` 的 `smokeNavigation`：1 个设备像素的拖动与实际栅格逐像素平移对照；平移前后内容缓存构建次数、栏目绘制次数不增加。
- 同一 smoke 检查中键、空格、H 抓手、错误按钮释放、Esc、失焦/失捕获、空白区拖动、边界、缩放后绘画，以及像素/dirty/历史不被平移改变。
- `--smoke`：菜单、预览、撤销重做、关闭取消；读取程序自身 framebuffer 检查字体/皮肤 2× 显示。

这些检查验证精度和重绘工作量，不是长时间手动拖动或帧时间基准；不报告未经测量的 FPS 提升。
