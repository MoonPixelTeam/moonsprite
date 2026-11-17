# 补间预览样式范围迁移

旧版依据：`legacy/src/renderer/src/core/animation-tween.ts:234-267` 的 animationTweenPreviewBounds 对原始可见内容、变换候选几何及 between 目标范围逐级应用图层和父组样式；路径点单独合并。

原生变换及交叉淡化／形变预览补上相同规则，并与自动画布范围共用 styledTweenBounds，复用现有描边和阴影范围算法及父组循环防护。

定向 Release 构建完成，animation-transform 和 animation-crossfade 两项 CTest 通过（0.46 秒），新增两条预览路径的嵌套描边／阴影范围检查。本批未重建正式 GUI，未新增人工视觉验收。整体迁移仍未完成。
