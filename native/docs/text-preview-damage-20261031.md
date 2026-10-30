# 文字草稿局部合成更新

## 依据与适配

`legacy/src/renderer/src/components/canvas-input-text.ts` 的 `moveTextTransform` 在文字重排后使原位置和新位置失效；`canvas-composite-cache.ts` 的 `invalidateDocumentRect` 累积待修复范围并交给缓存；`core/document-composite-plan.ts` 的 `expandLayerStyleInvalidationRect` 扩展样式与祖先影响。

原生 `Document::previewTextDraft` 对普通无组、无可见样式、无调整层的堆叠，发布上次文字表面与本次表面的并集，使用64位边界并裁剪到画布。现有 `CanvasRenderer` 按脏区重合成及上传，无需新建渲染通道。元数据、链接所有者、历史和像素内容不变。

## 保守回退与未完成范围

- 带可见图层样式、任意图层组或调整层时，保留原有整幅失效，直到完整承接派生影响范围。
- 独立链接图层同步维持 `publishChange` 的完整失效策略；普通链接Cel使用现有共享所有者与局部范围。
- 新旧表面均在画布外、并集为空时仍发布完整失效，以保留现有内容修订推进和缓存身份语义。
- 取消、提交、撤销与重做保留既有完整同步。本批只缩小有效草稿预览范围，不宣称全部文字性能等价。

## 验证

正式Release构建、`text-document-tests`、正式程序 `--text-tool-check`、515文件来源及快照检查通过。新增核心测试将新脏区重新合成并补入旧缓存，与整幅结果逐像素比较，覆盖长大、缩小、负坐标、部分／全部越界、链接所有者、取消、一次历史、撤销重做及样式完整回退。既有文字输入检查通过。未新增人工图像、GPU上传计数或长期性能验收。
