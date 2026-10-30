# 文字框创建手势

## 旧版依据

`legacy/src/renderer/src/components/canvas-input-text.ts` 的 `beginText`、`moveTextCreation`、`endTextCreation` 使用整段手势的moved状态和previewTarget。超过3px后，即使指针返回起点也仍创建固定文本框；普通点击使用按下位置，保留默认尺寸。边界来自 `core/canvas-input-resize.ts::shapeBounds`，包括结束像素，因此宽高为绝对差加1。

`components/useCanvasSelectionOverlay.ts` 使用创建手势的previewTarget绘制文字框。`components/useCanvasInteractionCancel.ts` 的Escape取消当前手势；失焦同样清理交互。

以上相对路径均在 `legacy/src/renderer/src/` 下。

## 原生承接

此前创建过程中没有轮廓，且仅比较按下与松开位置，导致拖出后返回被误当成普通点击。

创建和变换互斥，复用现有文字手势的矩形及moved存储。指针移动更新反向拖动也正确的包含端点矩形，保留曾超过阈值的事实；文字框绘制复用sheet边框，限定画布视口刷新。普通点击使用按下位置及默认文字框尺寸；拖动使用最后矩形。松开后仍通过既有文字编辑器预览、确认和取消，不在画框过程中创建图层或历史。

Escape、失焦、捕获丢失均释放创建状态和轮廓；不再让Escape后松开打开编辑器。

## 验证范围

扩展 `--text-tool-check`：反向拖框与包含端点尺寸、拖出后返回仍保留moved、实际预览与直接绘制sheet边框逐像素一致且可见、Escape／失焦／捕获丢失、松开进入编辑器后取消不残留图层和历史。该图像检查为离屏原生渲染，未做桌面截图验收或长期性能测试。

既有文字编辑、缩放、链接、撤销等检查同次运行；整个文字模块仍有未迁移内容。
