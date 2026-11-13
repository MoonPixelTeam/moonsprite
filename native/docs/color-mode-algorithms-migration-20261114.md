# 颜色模式共用算法迁移

按 legacy `types-raster.ts`、`pixel-format.ts`、`document-model.ts` 和 `file-preferences.ts` 提取颜色写入语义，新增 `document_color_mode.h`。迁移八种像素格式的通道量化、严格格式识别与设置默认值、灰度颜色归一化、可见色板内最近颜色匹配，以及图层颜色和 packed 写入的归一化。复用已有 `relativeLuminancePixel` 与 `timeline::normalizedMaskPixel`，不重新定义灰度或蒙版公式。源码复用遵守仓库 `legacy/LICENSE` 的 Source-Available 条款，未将现行源码标成 MIT，也未复制 Aseprite 代码。

保留旧版细节：索引 0 表示透明，匹配不扩张色板；alpha 距离权重为二，相同距离由可见顺序决定；重复顺序项和不存在的 ID 不进入候选。候选查找按 Map 的最后同 ID 条目，颜色读取按 getPaletteEntry 的第一个条目处理，畸形重复 ID 的对照也保留这一区别。直接颜色写入和 packed 写入保留各自的透明语义，RGB 格式的 packed 清空不会变为不透明黑色。蒙版优先采用其自身归一化，不受工程颜色模式和像素格式影响。

`make-color-mode-oracle.cjs` 使用 Node 的 TypeScript 擦除和 VM 直接执行未修改的旧版函数片段。仅将透明项的翻译名称适配为空字符串，不改变颜色或 ID。测试数据包含八种格式、256 档通道值、4096 个 RGB 网格采样、三种工程模式、普通／索引／蒙版图层和四种色板边界组合，共 524,104 条记录。期望结果来自旧版函数，不由原生实现生成。生成文件留在 `native/build`，CTest 使用 fixture 先重新生成再进行原生逐条比较。

最终检查：Release 的 document-color-mode-tests 构建成功；document-color-mode-oracle 与 document-color-mode 两项 CTest 通过（3.85 秒），524,104 条记录全部一致。旧版 pixel-format.test.ts 与 tools-pixel-edit.test.ts 共 26 项通过（3.70 秒）。来源覆盖 932 文件及证据快照、Editor 边界 588 源文件、diff 检查通过。最初测试数据把空字符串写为空字段，导致格式解析记录读取失败；现将空值用明确占位符编码，保留未知设置回退 RGBA32 的预期。

本阶段完成共用算法迁移，尚未接入 Document 的生产编辑路径。原生仍仅允许 RGBA32 工程编辑；工程模式字段、索引 ID 像素存储、读写、转换事务及撤销、全工具写入、合成与界面入口仍需迁移，不能凭算法通过放开文件准入。不涉及 UI 布局、性能优化、正式程序新增能力或图像验收。全部功能迁移仍 INCOMPLETE；保留用户数据、缓存和日志。
