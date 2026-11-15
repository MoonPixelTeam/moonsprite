# 平滑笔刷索引色与存储语义迁移（2026-11-16）

本阶段依据实际 `legacy/src/renderer/src/core/smooth-brush.ts` 的 `applySmoothBrush`、`smooth-brush.test.ts`，以及 `document-model.ts`、`history.ts`、`canvas-input-stroke.ts`、`workspace-commands-history.ts` 的采样、提交与取消契约。内部复用许可沿用 `legacy/LICENSE` 的 MoonSprite Source-Available License 1.0。仅做功能迁移。

## 迁移行为

旧版索引色平滑直接比较原始 uint32 色号，0 表示空白；隐藏、未知或透明资源的非零 ID 仍参与轮廓和连通区域判定。仅 RGBA 将 alpha 为 0 的隐藏 RGB 作为空白采样。原生原先统一按 RGBA 检查高字节，使普通索引色被误判为空白；现在明确传入表面格式，沿用原有轮廓、短尾、加权多次平滑及小区域算法。

候选写入先使用既有 RasterColorContext 承接 `normalizeLayerPackedValue`，再判断实际变化；隐藏 ID 按当前可见色板映射，保持 ID0、重复 ID 的最先颜色查找与空可见色板规则。没有新增色板或替换为 RGBA 平滑。

旧版只修改已有图层存储。原生原先借用普通 `beginStroke` 会扩张稀疏表面；现在使用已有 owner-local PixelEdit 回放事务，保留宽高、偏移、storage origin、表面格式及链接共享。历史目标保留当前 Cel 槽位，避免从链接帧跳到源帧。按旧版 256 点／包围面积不超过点数 3 倍的阈值复用密集历史辅助函数，允许提交前从未修改的表面准备 before／after。点记录撤销重做按当前色板归一化，密集历史直接恢复原始字。

按下与拖动仍只收集覆盖，释放提交一次“平滑”历史；取消覆盖不写作品。拒绝缺失、锁定、隐藏、特殊图层和活动事务，空覆盖／强度 0／实际无变化不产生历史。绘制统计沿用提交后计数。没有把滤镜取消预览的完整恢复修复扩大到普通笔画 PixelEdit 历史。

## 实际旧版对照

新增 Node oracle 执行真实旧版模块，加载适配仅擦除 bundler 原本擦除的接口导入。共 4,548 组：indexed／RGBA、六种色板状态、八种形状、强度边界、三种覆盖／选区变体，以及完整与稀疏负偏移／画布外存储。涵盖孤点、断线、短尾、细对角线、孔洞、多色、实心与散点；反向覆盖顺序、mask 字节 0／1／2／255、透明 RGB、重复／隐藏／未知 ID、不透明 ID0、空色板和回放前改变可见顺序。

逐组核对提交结果、全部原始像素、完整几何／origin、Undo／Redo 和点／密集历史类型，其中 12 组跨越密集历史阈值。另有 135 组原生关联图层／链接帧变体，检查当前链接帧、共享存储身份和相同旧版预期；对其中有变化的 indexed 变体核对提交、Undo、Redo 的可编辑／恢复／历史三种生产编码及索引色可编辑导入门禁。

首次用修改前程序复现 `indexed-0-0-0-1-0-9: apply result`。随后首次链接帧检查用了尚未重新链接最新核心的测试程序，报 `active alias changed`；重新链接后全部 4,548 组及 135 组链接变体通过，旧程序结果未作为最终通过证据。旧版原测试文件 29 项通过（3.61 秒）。首轮五项定向 CTest 全通过（8.39 秒）：smooth-brush-oracle、smooth-brush、liquify、document-transactions、document-raster-history。

## 范围与交付

生产 indexed 新建／转换／可编辑导入保持关闭。已有收集足迹、动态参数、平铺输入与液化 current-source 路径继续沿用；本阶段没有宣称其所有组合重新完成验收。没有 UI 修改、性能优化或完整人工桌面／图像验收。全仓迁移仍 INCOMPLETE；用户数据、日志、构建缓存与生成对照数据保留且不提交。

唯一正式 Release 构建退出 0；`native/build/Release/moonsprite-native.exe` 于 2026-11-16 05:44:38 更新，30,755,840 bytes。受影响的 indexed-outline 与 indexed-antialias 测试目标一并重建成功。最终 11 项定向 CTest 全通过（20.23 秒）：smooth-brush 及 oracle、indexed-outline 及 oracle、indexed-antialias 及 oracle、liquify、document-transactions、document-raster-history，以及新正式程序的 brush-preview、selection-interactions。

来源覆盖 990 文件及既有证据哈希通过；Editor 597 源码、架构 597 源码／268 targets 和 diff 检查通过。strict 因全仓仍有已知迁移缺口按要求退出 1。阶段保存推送 dev，生成物、生成对照数据与用户日志不提交。
