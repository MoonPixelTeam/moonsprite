# 补间对话框组选择迁移

旧版依据：`legacy/src/renderer/src/components/AnimationTweenDialog.tsx:29-45` 同时传入图层和组选择，`legacy/src/renderer/src/core/animation-tween.ts:180-185` 合并组后代并按图层顺序过滤目标。

正式原生对话框复用 `Document::selectedLayerIdsWithGroups`，将显式图层与组后代统一传入已有补间路径，保留原范围、预览和历史事务。

正式 Release 构建成功；实际对话框 `--moon-crossfade-check` 退出 0，覆盖仅选择组时两个后代均参与补间、组外图层保持起点内容、单步撤销恢复帧与组选择以及重做。此项为程序化窗口检查，未新增人工视觉验收。

组选择传递已完成；混合特殊工程生成准入等迁移缺口仍保留，整体迁移未完成。
