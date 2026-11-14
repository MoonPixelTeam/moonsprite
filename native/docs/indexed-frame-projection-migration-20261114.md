# 索引色瓦片重建与活动帧显示迁移

2026-11-14。承接上一阶段可见颜色重映射，补齐索引色工程读取后的特殊 Cel 重建及活动帧投影。本阶段只迁移功能，索引色编辑、新建和转换保持关闭，整体迁移仍为 INCOMPLETE。

## 旧版依据与原生适配

依据 `legacy/src/renderer/src/core/project-format-decode.ts::decodeProject`，按旧版顺序从真实瓦片资源重建 Cel，投影活动帧，再重映射隐藏颜色 ID。网格瓦片沿用已迁移的 `tiles::render`，自由瓦片沿用 `free_tiles::render`，对照 `tilemap.ts::renderTilemapSurface`、`free-tile.ts::renderFreeTileSurface`。渲染后的 RGBA 值按可见色板转换为索引 ID；真实瓦片资源保留 RGBA，输入归档不变。

依据 `animation.ts::applyFrameSurfaces` 和 `animation-cel-resolver-cache.ts::resolveAnimationCelCached`：正常链接链显示根 Cel 的存储、尺寸、位移与可用透明度；缺失、跨层、自链接或循环链使用原始候选 Cel 自己的 fallback。活动帧没有 Cel 或没有 surface 时清空显示像素，保留图层几何及透明度，不生成空 Cel，也不在只读解析中修复序列化链接。后续可编辑导入仍沿用用户批准的修复边界。

必要原生适配：Manifest 使用不可变稠密 uint32 DTO，重建和空帧副本在分配前受现有解码字节预算限制；链接解析复用原生导入的反向边思路，保留旧版候选 fallback 语义。RGBA／grayscale 的既有可编辑导入路径不在本阶段变更范围内。

## 验证

夹具生成器实际执行未修改的旧版 encodeProject／decodeProject，新增 78 组：普通／网格瓦片／自由瓦片 × ZIP 0／6 × 十三种场景。样本故意写入过期的独立图层与 Cel 缓存，核对旧版重建结果，而非使用预先重建好的缓存掩盖差异。

覆盖活动根、链接、长链、缺失、自链接、循环、指向循环／缺失的尾链、空槽、无 surface，以及缺省／零透明度。瓦片样本包含透明源像素、半透明、旋转、翻转、局部偏移、隐藏实例与重叠混合；逐项核对每个 Cel、图层几何／format／像素、图层透明度、原始链接、瓦片 RGBA 和归档不变。三个稀疏大尺寸样本另验证网格／自由瓦片重建与空帧清空的分配预算不足拒绝，以及失败后正常读取不受影响。

原有 60 组存储／布局、48 组隐藏 ID、四组混合格式、三组损坏归档及 uint32／字节预算检查继续通过。最终五项 CTest 一轮全部通过（170.79 秒）：project-import、indexed-project-reader-oracle、indexed-project-reader、project-manifest、project-reader。新增 72 组初次直接执行通过，加入六组预算样本后重新构建并直接执行 78 组通过，最终随 CTest 再次通过；没有隐去失败记录或更改旧版源码。

唯一正式 Release 及关联测试构建成功；构建中的 Editor 边界检查（589 源码）、架构边界检查（589 源码／245 targets）通过。来源覆盖 936 项及证据快照通过，strict 因整体已登记缺口继续退出 1；diff 检查通过。本阶段无 UI 变更，未新增实际交互或人工图像验收。

## 剩余范围

本阶段不代表完整 decodeProject 等价：旧 schema 自由瓦片 atlas 所有权迁移、全部 schema 存储压缩／origin 语义、不同 offset 的共享底层存储、链接图层校验等仍需逐项对照。索引色真实可编辑存储、工具、合成、历史、保存和 UI 入口尚未完成，不能提前开放。来源登记保持 legacy-partial、allLegacyAligned=false。

保留用户工程、恢复、日志和缓存；阶段提交并推送 dev，不提交生成物。
