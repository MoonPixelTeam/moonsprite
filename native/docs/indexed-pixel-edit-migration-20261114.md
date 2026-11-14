# 索引色工具像素内核迁移

2026-11-14。只迁移旧版功能；生产索引色编辑、新建、转换和导入仍未开放，整体 INCOMPLETE。

## 迁移范围与来源

直接翻译 legacy document-model.ts 的 readLayerPacked／Color／PackedAt、writeLayerColor／Packed／PackedRun，以及 tools-pixel-edit.ts 的 paintLayerValue、compositeSelectionPixelOver／ForEdit。工具读色沿用 getPaletteEntry 的重复 ID 首项；合成器的 Map 末项语义保持独立。透明普通笔刷、透明动态渐变、当前底色／原始底色、选区 source-over 与蒙版直接值分别保留，颜色与 packed 写入的量化规则不合并。

raster_pixel_edit.h 操作 detached candidate 或已取得的 owner borrow；Document 继续拥有历史、dirty 和缓存失效。合法本地索引和行截断对照旧版；原生越界写入抛错是存储边界适配。世界坐标读取返回 optional，避免缺失位置被当成不透明 ID 0。工具笔刷调用方仍须解析原始底色状态，内核不另造 WeakMap／tail 状态机。

Document 中 24 处既有 RGBA 选区混合调用改用公共 source-over，涵盖即时变换、浮动平移／缩放／旋转、对称、重复、普通／稀疏和延迟预览／提交。沿用现有底色、source clear、蒙版分流和归一化。相关 legacy 来源为 tools-selection-transform-apply／translation／commit；普通笔刷擦除路径仍由其原有 coverage 处理。

## 自动验证

Node registerHooks／stripTypeScriptTypes 实际执行未修改 legacy 模块，覆盖三种文档模式 × 八种像素精度 × RGBA／indexed／mask × 四组色板，共 288 组上下文。色板包含空、重复、隐藏、缺失、透明及不透明 ID 0，uint32 极值与透明隐藏 RGB；5760 组读写／行写入，73728 组笔刷底色，31104 组选区 Over／ForEdit。笔刷期望直接调用真实 beginPixelEdit、beginBrushTailEdit 和 brushPaintBaselineByEdit，覆盖 parent／tail 优先级、零值底色及 current destination。

沿用旧版 tools-pixel-edit.test.ts 的全部 65536 对 source／destination alpha 和同一随机数序列，原生逐值一致。该旧版真实测试文件三项全部通过（5.74 秒）。九项 CTest 全通过（7.99 秒）：indexed-pixel-edit-oracle、indexed-pixel-edit、document-transactions、document-raster-history、cel-selection-clipboard、symmetry-content、symmetry-scale、symmetry-rotation、symmetry-alpha；包含普通／稀疏／大画布延迟选区与取消、Undo／Redo 回归。

## 剩余范围

唯一正式 Release `native/build/Release/moonsprite-native.exe` 构建成功。来源覆盖及证据快照检查通过（942 文件），Editor 边界通过（591 源文件），架构检查通过（591 源文件／247 targets），`git diff --check` 通过。`--strict` 实际退出 1，继续反映已登记迁移缺口。

本阶段只完成可验证像素算法及 RGBA 选区生产接入。索引色 Document 工具事务、palette context 贯穿调用、原始 ID 与格式的历史／保存／恢复、预览与导入仍须继续迁移。内核通过不等于索引色作品已能端到端编辑；来源继续 legacy-partial，strict 必须因既有缺口失败。

没有 UI 改动、性能优化、人工图像或完整桌面交互验收。保留用户工程、恢复、日志和缓存，生成的 oracle／构建产物不提交。
