# 补间生成后的蒙版编辑状态

实际旧版依据：`legacy/src/renderer/src/store/workspace-commands-animation-tween.ts` 在生成事务中清除 activeLayerMaskId、layerMaskIsolatedView 并调用 clearAnimationItemSelection；`workspace-animation-selection.ts` 清除动画项目选择，保留图层／组行及画布选区。

原生变换、交叉淡化与形变生成复用 Document::clearAnimationItemSelection，在安装生成时间轴前退出蒙版编辑及隔离视图。既有动画选择快照负责撤销恢复原蒙版，重做恢复退出状态。

定向 Release 构建成功，animation-transform 与 animation-crossfade 两项 CTest 通过（0.35 秒）。检查覆盖活动隔离蒙版、锁定、随层移动及缺失终点组合的生成／撤销／重做；未新增人工视觉验收，本批未重建正式 GUI。

混合瓦片工程补间准入仍待完成，整体迁移未完成。
