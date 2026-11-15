# 索引色画布尺寸、裁切与去除透明边缘迁移（2026-11-16）

本阶段依据真实 legacy document-model.ts 的 resizeDocumentAt／cropLayersToCanvas、animation.ts 的 resizeAnimationCelsAt、workspace-commands-document-io.ts 的四个实际命令及 workspace-document-history.ts 的画布快照历史。已核对 legacy/LICENSE 的 MoonSprite Source-Available License 1.0，复用限于仓库内部迁移。

## 语义与适配

画布尺寸承接九宫格锚点、负奇数差向下取半、显式偏移、保留画布外存储或永久裁切。裁切保存 indexed format、原始 uint32 颜色 ID 与存储 origin；完全离开画布的普通表面变成 1×1 raw0，颜色板 ID0 不要求透明，不借裁切重映射资源。

按选区裁切采用与画布相交后的选区矩形，而不是 mask 非零范围。画布移动选区只认可 mask===1，2／255 不参与，Undo 则恢复原字节。全 1 掩码采用原生矩形简写，选中范围不变；撤销严格恢复原始掩码字节。选区存在时 pivot 随偏移移动，选区为空则清除；全画布裁切及同尺寸画布操作仍产生一次历史。

去除透明边缘检查使用当前模式、精度和色板的最终可见合成；所有帧模式包含 disabled 帧，仅当前帧模式保持活动帧。空内容拒绝，全画布内容早退。隐藏／锁定图层、蒙版及共享存储语义依照实际旧版命令。关联图层各自裁切后，使用活动 owner 优先、再按帧／成员顺序选取共享内容，保持各自画布锚点；复用上一阶段 image_resize_links.h 和现有原始 Cel 快照历史，预算在创建蒙版与快照前检查。

历史恢复原始存储、几何、蒙版、选区与 pivot，并保留回放时的当前色板，不采用工具 PixelEdit 的 ID 归一化。生产 indexed 新建／转换／可编辑导入仍关闭，本阶段未改变 UI 或做性能优化。

## 验证范围

Node oracle 调用真实旧版 resizeActiveCanvas、cropActiveCanvas、trimActiveCanvas 和 trimActiveCanvasCurrentFrame，并运行真实历史闭包。954 组样本包含四色板、稀疏正负偏移、全外／空存储、九锚点、显式偏移、不同 mask 字节、图层／组蒙版、关联图层、帧别名、独立 disabled 帧、隐藏和锁定。C++ 精确比较原始 ID／format／origin／offset／选区／pivot，另检查当前色板历史、非法参数、预算拒绝以及三个生产编码器的原始 ID 与 indexed 准入拒绝。

954 组实际旧版对照与原始快照 Undo／Redo、当前色板保留、非法参数／预算拒绝及三个生产编码器检查通过。初轮 9 项定向 CTest 中 8 项通过，canvas-crop 失败：旧测试将稀疏／1×1 空 Cel 的局部存储直接按完整原画布索引。改成画布坐标读取，保留两处裁切像素检查，重建后单项通过（0.23 秒）。最后整理链接事务预算与准备顺序后，正式 Release 和受影响测试构建退出 0；最终 indexed-canvas-oracle、indexed-canvas、canvas-crop 三项通过（1.98 秒）。本阶段共验证 9 项不同 CTest，初轮 11.01 秒的结果不作为九项全通过声明。

旧版定向两文件 8 项通过、108 项因筛选跳过（14.15 秒）。真实命令通过 Node TypeScript 加载器执行，宿主仅提供计时、资源信息和最小 session 状态；没有替换裁切、合成、链接或历史算法。

唯一正式产物 native/build/Release/moonsprite-native.exe 于 2026-11-16 04:01:13 更新（30,752,768 bytes），构建退出 0。新程序 --canvas-resize-check 和 --canvas-trim-check 均退出 0；indexed 生产入口仍关闭，其行为通过上述核心夹具验证。来源覆盖 986 文件及证据快照、Editor 597 源码、架构 597 源码／266 targets 和 diff 检查通过；strict 因整体已知迁移缺口继续退出 1。

生产 indexed 新建／转换／可编辑导入仍关闭，整体迁移仍 INCOMPLETE。无性能优化、UI 修改或完整人工桌面／图像验收。保留全部用户数据、缓存和日志；阶段保存并推送 dev。
