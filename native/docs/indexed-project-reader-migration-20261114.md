# 索引色工程读取边界迁移（2026-11-14）

本阶段迁移文件读取边界，不开放索引色编辑、新建或转换。整体迁移仍为 INCOMPLETE。

## 旧版依据与原生适配

- `legacy/src/renderer/src/core/project-format-raster.ts`：raw 四字节小端字及 sparse-tiles-v1 的 RGBA／indexed tag、尺寸、长度和资源预算验证。原生复用既有 ZIP／稀疏解码路径，增加显式 `RasterFormat`，保留全部 uint32 位。
- `legacy/src/renderer/src/core/project-format-decode.ts`：图层格式由文档模式决定，Cel 的 format 独立；共享解码缓存键包含 format。原生保留 inactive／linked fallback 的格式，编辑准入在修复链接前拒绝尚未迁移的 indexed 面。
- `legacy/src/renderer/src/core/palette-layout.ts` 与 `document-model.ts`：颜色 ID 0 为真实透明项，空槽为 null。读取 DTO 改用 optional ID，保留空槽、ID 0、可见顺序与稳定 ID；现有可编辑色板仍使用 0 空槽哨兵，因此明确拒绝真实 ID 0，留待下一阶段迁移。
- 用户已批准的 schema 1 默认帧／Cel 修复保留，新建默认 Cel 使用文档对应格式。本阶段未完成旧版 indexed 打开后的可见 ID 重映射及特殊图层重绘，不将成功读取等同于完整 decode 行为等价。

本阶段没有修改 legacy 源码、引入索引色 RGBA 替代存储或实施性能优化。具体来源及 SHA256 登记在 `legacy-provenance.json`。

## 自动检查

新增 Node 夹具生成器实际加载未修改的 legacy `createDocument`、`encodeProject`、`decodeProject`、`encodeSparseRasterData`、`normalizePaletteSlots`，不另写一个近似旧版编码器。

- 60 组：RGBA／灰度／索引色 × raw／sparse × ZIP 0／6 × 五种含 null、ID 0、重复槽和独立 order 的布局。
- 四组同文件不同 format 的共享缓存，覆盖 inactive Cel 与 linked fallback。
- 三组坏 sparse tag、截断和缺失文件，先确认旧版实际拒绝，再核对原生拒绝。
- 原生 uint32 极值、长度、预算及未知格式拒绝。

九个不同定向 CTest 最终通过：project-import、palette-columns、project-save、project-save-raster-resources、indexed-project-reader-oracle、indexed-project-reader、project-manifest、project-reader、document-raster-history。其中初次八项执行为七项通过、一项保存夹具失败；修复后 project-save 和 document-raster-history 两项通过（3.23 秒）。没有将两轮结果写成一次全绿。

新增测试首次编译遇到 Windows GetObject 宏冲突，取消该宏后完成；首次运行在 JSON 析构前反初始化 WinRT，改为 Apartment RAII 后通过。这些为测试入口问题。

保存综合测试的 visible eight-connected fill 夹具仍假设新层为完整 3×3，实际新层已迁移为 1×1 稀疏面。现显式准备完整 3×3 后保留原断言。直接执行 legacy `tools-fill.ts::floodFill`，确认 1×1 目标保持自身范围，完整 3×3 目标填充相连对角像素，两组通过；未修改生产填充边界。

来源覆盖 936 文件及证据快照、Editor 边界 589 源码、架构覆盖 589 源码／245 targets、diff 检查通过。strict 因已登记的迁移缺口继续退出 1；覆盖通过不代表行为等价。

## 正式构建与未完成范围

唯一正式 Release 构建成功。该程序执行 grayscale 实际入口回归退出 0，trace 覆盖八种像素格式及 grayscale-create。本阶段没有人工图像或完整桌面验收。

索引色后续仍需迁移可编辑色板的 ID 0／空槽表示、真实 ID surface 存储、工具读写、合成、历史、保存及实际 UI。现有入口保持未开放，整体目标继续 active。保留用户数据、恢复、构建缓存及旧日志，不提交生成物。
