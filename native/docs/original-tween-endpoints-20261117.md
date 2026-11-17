# 补间端点预览迁移

实际旧版依据：`legacy/src/renderer/src/core/animation-tween.ts:364-376` 在 step=0 和 between 的 frameCount+1 直接采用对应原帧，其他步骤使用生成候选。

原生交叉淡化／形变预览接入相同端点分支，保留对应原帧的非目标内容、空槽、蒙版及层级；分支前校验参数、帧和步数。

定向 Release 构建成功，animation-crossfade CTest 通过（0.30 秒）。新增缺失起点非目标槽、锁定终点蒙版的两种模式检查，端点合成与原帧合成相等，并检查越界步数拒绝。本批未重建正式 GUI，未新增人工视觉验收。整体迁移未完成。
