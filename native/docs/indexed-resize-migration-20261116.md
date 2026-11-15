# 索引色图像缩放与倍率检测迁移（2026-11-16）

本阶段按实际 legacy `document-model.ts` 的 `resizeSurfacePixels`、`resizeDocumentImage`、图像尺寸快照，以及 `workspace-commands-document-io.ts` 的 `resizeActiveImage` 迁移普通索引色图像缩放。倍率检测依据 `image-scale-detection.ts` 和实际合成器。legacy/LICENSE 的 MoonSprite Source-Available License 1.0 已核对，保持内部迁移范围。

## 语义与适配

索引色存储保存原始颜色 ID，最近邻与平滑选项都按旧版最近邻采样，不插值 ID、不分配色板资源。目标局部边界按世界坐标 floor/ceil 缩放，采样保留旧版运算顺序，存储 origin 重置为零，保留画布外、透明、缺失及完整 uint32 ID。RGBA 和标量蒙版沿用现有路径；选区按命令实现对采样到的任意非零 mask 归一化为 1。

复用现有图像尺寸事务及 ImageResizeTask。后台捕获模式、精度和不可变色板，工作文档继承这些数据；候选结果不直接改活动文档。提交校验身份、代数、模式、精度、色板和活动上下文。色板 UI 前景色及选择不属于文档颜色数据，提交保留当前角色。复用现有预算与取消，拒绝过程保持作品原状。

缩放历史按真实旧版图像尺寸快照恢复几何、原始存储、蒙版和选区，不采用描边／抗锯齿 PixelEdit 的当前色板归一化。Undo／Redo 保留当前色板；同尺寸不产生历史。

倍率检测使用带当前色板的可见合成结果，沿用既有 64 行分块和原检测算法。检测后台结果不允许提交图像变更或新增历史。

## 对照与验证记录

Node oracle 直接执行旧版图像尺寸命令及其 Undo／Redo：882 组索引色缩放样本（含 18 组 4095／4096／4097 宽边界），24 组独立位置与活动 owner 的链接图层样本，32 组真实索引色合成倍率检测。加载器只适配 TypeScript 类型导入、CommonJS 打包桥接与宿主计时／资源信息，不替换缩放、链接、历史或检测算法。四类色板覆盖普通、非透明 ID0、重复 ID 和空色板；几何覆盖负坐标、稀疏、画布外、空占位及两种插值；选区包含 0／1／2／255 mask 与标量蒙版。

原生同步／后台逐项对照、原始快照历史、当前色板保留、17 组帧别名、独立 owner、取消各阶段、过期结果、预算拒绝及三个生产编码器检查通过。首轮运行发现链接图层按最近写入者同步，与旧版活动 owner 规则不同；新增缩放快照专用同步，保留活动源优先和帧／成员遍历顺序，不改变普通像素编辑的同步规则。修正后重建退出 0，7 项定向 CTest 全部通过（10.41 秒）：indexed-resize-oracle、indexed-resize、image-resize、image-resize-task、image-scale-detection、tile-image-resize、document-raster-history。

旧版 `document.test.ts` 与 `workspace.test.ts` 定向测试 6 项通过、110 项因筛选跳过（11.00 秒）。这不代表执行了两文件全部测试。

正式 Release 构建退出 0；唯一正式产物 `native/build/Release/moonsprite-native.exe` 于 2026-11-16 03:11:40 更新（30,750,720 bytes）。新正式程序 `--image-resize-check` 通过（2.31 秒），验证现有倍率识别草稿、应用、取消、后台任务及普通／瓦片缩放与历史入口；生产索引色入口仍关闭，因此索引色行为通过上面的核心夹具验证。来源覆盖 984 文件和证据摘要通过，Editor 597 源码、架构 597 源码／265 targets 和差异检查通过；strict 因整体已知缺口继续退出 1。

生产 indexed 新建、转换和可编辑导入继续关闭；整体功能迁移仍为 INCOMPLETE。本阶段仅功能迁移，不做性能优化、UI 改造或完整人工桌面／图像验收。保留全部用户数据、日志与构建缓存。
