# 索引色替色与反相迁移（2026-11-15）

本阶段按 DR-010 承接普通 indexed 栅格替色及反相。来源为 legacy 的 tools-fill.ts::replaceLayerColor、history.ts::recordPixelKnownCurrent / commitPixelEdit / revertPixelEdit、workspace-commands-color.ts 的目标收集和历史顺序，以及 workspace-edit-actions.ts::invertWorkspaceColors。复用许可为 legacy/LICENSE 的 MoonSprite Source-Available License 1.0。仅功能迁移，不做性能优化或 UI 布局改造。

## 替色语义

源色以完整 RGBA 匹配色板中的所有资源 ID，包括同色多 ID、隐藏项、ID 0、重复 ID 和透明 RGB；没有匹配项时不按缺失 ID 的默认透明色替换。目标色沿 paletteColorIdForCanvas 从可见、非零、有 alpha 的颜色中选取，完全相同优先，否则按 RGB 距离加双倍 alpha 距离、可见顺序打破平局；不增加资源，不修改 nextColorId 或可见顺序。目标 ID 按旧版在首次命中时解析并缓存。

选择范围沿用既有 Editor 的 layer / selection / document / layers / frames / cells / loop-section 入口。Document 复用现有目标解析、锁定跳过和共享 owner 去重；有选区时按画布裁切和世界坐标掩码写入，无选区时遍历完整 owned surface，含画布外像素。偏移、storage origin、format、显式链接和关联图层身份保留。特殊瓦片层语义仍属于后续迁移范围。

预览由现有 AdjustmentPreview 的独立 Timeline 和不可变基线色板驱动，重复参数从原始基线计算。禁用、恢复、取消均不写入正式内容、dirty 或历史；色板内容变化使旧预览失效。用户明确采用取消不改作品的修复：旧版 revertPixelEdit 在隐藏源 ID 上会归一化并改变作品，本阶段保留实际缺陷样本，但原生取消逐字恢复原 ID 和色板，不复刻此缺陷。

提交沿用旧版的 point / dense 区分：至少 256 个改变点且包围矩形面积不超过点数三倍时，保存 raw region patch；否则保存点。稀疏 Undo / Redo 按当前可见色板归一化，密集 patch 直接回放原 uint32。色板与角色颜色复用既有 kind 6 作为同组第一个 leaf，Redo 在像素前恢复，Undo 在像素后恢复；保留当前可见顺序、色板布局和显式选择。没有匹配／同色／最终同 ID 不产生历史。多 owner 原子提交为一次历史。

## 反相和验证范围

反相沿旧版的 0→255、255→0 曲线；增加到现有实际旧版 direct snapshot 对照矩阵，核对 indexed RGBA 解析、隐藏资源和整体像素／色板历史。原生 Invert sampler 与该实际曲线逐值比较，不新增替代语义。

实际 Node oracle 执行未修改的 legacy replaceLayerColor、commitPixelEdit 和 revertPixelEdit，生成 1050 组事务。五种色板（普通、有色 ID 0、重复 ID、首项透明、空表）、五种布局（普通、负偏移、全画布外、密集和散点）、三种可见顺序、两种选区和七组完整 RGBA 输入逐值比较。每组检查预览、重复、禁用、恢复、取消、提交、Undo、Redo；另对不同当前可见顺序再回放一次，并有 20 组关联图层／显式链接帧变体。部分样本调用普通工程、恢复和本地历史三个生产编码器，解码原始 ID；重复 palette ID 按既有契约拒绝，indexed 可编辑导入继续拒绝。边界包括空选区、锁定跳过、过期色板、多个 owner 和色板范围替色。227 组旧版取消会修改隐藏 ID 的样本作为缺陷证据保留，原生按用户决定逐字恢复。

反相使原颜色调整对照从 1836 扩为 1944 组，新增 108 组真实反向曲线比较；原有参数及边界断言保留，并检查 32 组链接变体。旧版 tools.test.ts 定向一项及 workspace-edit-actions.test.ts 九项通过，共 10 项。

首轮六项定向 CTest 全部通过（17.58 秒）：color-replacement、color-adjustment、indexed-adjustment-oracle、indexed-adjustment、indexed-replacement-oracle、indexed-replacement。唯一正式 Release 和相关测试目标构建退出 0，native/build/Release/moonsprite-native.exe 于 21:44:13 更新（30,721,024 bytes）。随后 indexed-replacement-oracle、indexed-replacement、正式 selection-interactions 和 document-raster-history 四项通过（19.34 秒）；该轮历史测试运行时新测试程序尚未生成，故不将其作为最新构建的验证。等待构建结束后，新生成的 document-raster-history 再次通过（4.66 秒）。合计八项不同定向 CTest 通过。

来源覆盖 972 文件和证据快照、Editor595 源码、架构595 源码／260 targets、diff 检查通过。strict 实际退出 1，保持剩余迁移缺口可见。未执行新的人工图像或完整桌面验收。索引色新建、模式转换和可编辑导入仍关闭，滤镜等其余迁移仍未完成，整体保持 INCOMPLETE；本阶段无性能优化和 UI 改造。保留用户数据、构建缓存及既有日志。
