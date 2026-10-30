# 文字工具Alt拖动复制

旧版依据：`legacy/src/renderer/src/components/canvas-pointer-down.ts` 在临时移动未生效时，通过Alt与textLayerAt解析textCopyTarget，先于已选文本框拖动／缩放。`canvas-input-layer-move.ts` 用该目标覆盖活动层和自动选层结果，强制复制意图，仍由已有帧／Cel选择解析决定单层、单Cel复制资格。`useCanvasTextPreview.ts`提供堆叠、遮挡及文字留白命中。

原生现在编辑和Alt复制共用textLayerAtPoint；Alt命中文字时交给既有processMoveInput。复制目标优先于活动层，关闭自动选层仍生效，Shift继续沿用旧版选择分支；已有临时移动优先级保持。复用对齐、位置预览、延迟创建副本、原图层与链接数据复制、Escape回滚及一次历史。多Cel场景沿用既有选择和资格限制，不在本项改写动画范围。

正式Release构建、`--text-tool-check`及`--layer-move-check`通过。实际Alt指针检查覆盖活动层为另一普通图层、自动选层关闭、链接动画文字、点击不创建副本、移动才创建、Escape移除预览副本、提交后选择可编辑副本、原所有者不变、一次历史及撤销／重做。既有文字／移动回归同次通过。来源覆盖515文件及快照通过。

无新增素材或布局，未新增图像或长期性能验收；其它特殊内容迁移限制仍保留。
