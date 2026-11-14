# 索引色非线形状事务迁移

2026-11-15。本阶段仅迁移功能，覆盖填充／描边矩形、填充／描边椭圆、多边形和自由形状。直线／曲线使用旧版独立的笔刷路径，继续下一阶段；生产索引色新建、转换、可编辑导入及整体编辑准入继续关闭，整体 INCOMPLETE。

## 来源与语义

直接对照 `legacy/src/renderer/src/core/tools-shapes.ts` 的 paintShape、paintShapePixelPoints、rotatedShapePixelPoints，`shape-preview.ts` 的 unboundedShapePreview，`canvas-input-path.ts` 的多边形轮廓，以及 tools-pixel-edit、history、document-model、symmetry、linked-layers 和 canvas-render-shape-preview／canvas-render-preview-pixels。

提交使用 paintLayerValue，忽略墨水及会话笔刷不透明度；预览使用 simple 墨水与会话不透明度，保留旧版预览／提交差异。工具按重复 ID 首项读取，底图显示按末项读取。透明／隐藏 RGB、半透明合成、可见色板顺序与未知 ID 的 packed 归一化沿用已迁内核。0° 基础图形先生成画布外的源点再做对称，旋转图形与填充多边形先裁切；轮廓在完整形状外保留两像素域，避免边界裁切制造轮廓。

复用 Document 的 GradientPreview、既有几何和稀疏／缺失 Cel 提交事务；额外 RGBA 候选仅用于 indexed 显示，提交候选仍为 ID。固定基线重算，取消不修改像素、Cel、修订号或历史。扩张不受选区裁切限制，保留 64px padding、storage origin、零／非零占位和共享存储。history 的 regionPatchFromPoints 在变化点 >=256 且 bounding area <=3×变化点时使用 raw dense；其它使用 packed 点历史。首次大矩形对照暴露遗漏该阈值，已补齐。

## 用户决定与旧版缺陷

用户本轮明确选择：0° 矩形／椭圆起点四舍五入到整数像素，预览和提交共用取整位置，旋转图形保留旧规则。真实旧版四组半像素缺陷在 oracle 的 legacyDefects 中保留：提交声称 changed 但实际像素不变，Undo 分别破坏 29／26／25／22 个像素。迁移用例用取整参数调用未修改的旧版函数计算修复预期，并验证原缺陷证据；不把修复称为旧版等价。

旧版 512×512 填充多边形／自由形状在 paintShapePixelPoints 的展开参数 Math.min 调用栈溢出，此问题已记录，未纳入正常等价用例，也未改旧源码。大型矩形／椭圆仍执行真实旧版事务。

## 验证

1,186 组实际旧版事务及每组两次预览、取消、提交、Undo／Redo 逐像素通过；另有 174 组关联图层／链接帧检查。覆盖六种形状、四种色板顺序、三种无效墨水设置、透明／半透明／不透明源、旋转、圆角、描边、稀疏／负偏移／占位／缺失 Cel、重复／隐藏／不透明零 ID、带洞选区、opacity、所有对称轴和偏移对称中心、512² 图形、255／256／257／768 点历史阈值，以及旋转半像素几何。原始四组缺陷证据另存并断言。

旧版 shape-stroke-width、canvas-unbounded-preview、canvas-view-aligned-drawing 三文件 29 项通过（19.05 秒）；tools.test 的 shape／rectangle／ellipse／polygon／freeform 筛选 7 项通过、88 项跳过（7.92 秒）。首次 pnpm 转发正则的管道字符被 Windows shell 解释，改为直接 Node 调用 Vitest 后通过，无旧版源代码变更。

来源覆盖 956 文件及证据快照、Editor 593 源文件与架构 593 源文件／253 targets 检查通过。唯一正式 Release 最终构建成功，正式 exe 于 04:30:32 更新（30,657,536 bytes）。九项定向 CTest 全部通过（123.13 秒）：document-transactions、document-pixel-format、indexed-shape-oracle、indexed-shape、indexed-gradient-oracle、indexed-gradient、document-raster-history、linked-layers、attached-masks。最后补入的几何预算拒绝用例也通过：已有预览、像素、历史和修订号均不变。strict 因其它已登记缺口继续应失败。没有 UI 改动、人工图像／完整桌面验收或性能优化；构建产物、oracle、日志和用户数据不提交。
