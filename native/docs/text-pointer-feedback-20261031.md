# 文字工具指针反馈

## 旧版依据

`legacy/src/renderer/src/components/useCanvasCursor.ts` 在已选文字框内使用移动指针，边缘使用方向缩放指针；`transform-text-box` 捕获手势持续保持该语义。普通文字工具使用文字指针，不能以是否允许栅格绘图判定。`core/canvas-visuals.ts` 的 `selectionResizeCursorForHandle` 先镜像方向，再应用视图旋转。`components/canvas-input-text.ts` 开始文字框手势时选择相同指针。

## 原生承接

- 使用已有 `text`、`move` 及方向缩放指针，素材仍来自现有legacy转换资源和sheet，没有绘制或替换图标。
- 文字框悬停采用当前已选、可见且未锁文字框；边框通过 `selectionMaterialBounds`／`selectionContains` 判断。命中和输入共用手柄方向优先级，透明中心按框内移动判断。
- 缩放方向随视图镜像和旋转变化。文字变换／创建捕获优先于其他栏目悬停，离开画布时仍保持手势反馈。
- 普通文字工具不再落入栅格画笔的不可用判断。

## 验证与范围

正式Release构建、`--text-tool-check`、515文件来源及快照检查、差异检查通过。实际输入检查覆盖框内移动、边缘／角方向、90度视图旋转、水平镜像、文字默认指针，以及捕获后移到画布外的缩放／移动反馈。既有逐像素选框alpha命中检查同次通过；未新增素材或布局，未进行人工截图验收。其它临时工具与复杂焦点优先级不宣称在本批全面验收。

初始调查还确认 `useCanvasInteractionCancel.ts` 在取消文字变换后主动 `invalidateAll`，因此保留原生取消的完整缓存刷新，没有把局部取消当成旧版要求。
