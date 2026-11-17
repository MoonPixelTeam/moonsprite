# 混合工程选区变换入口

旧版依据：`workspace-commands-selection-transform.ts` 的 beginLayerTransform／beginFreeTransform 按实际选中目标处理；`workspace-commands-selection-flip.ts` 通过 activePaintLayer 和 selectedTransformLayersForSession 处理选区，不因无关自由瓦片层禁用普通层。

原生将自由瓦片源专用门禁限定到实际自由瓦片源；普通图层及活动蒙版回到原有菜单与核心检查。保留自由源的锁定、Paint、实例和选区规则，不更改算法或历史结构。

定向验证通过：混合工程实际水平／垂直翻转菜单与 Undo／Redo，Transform 及 Free Transform 四角预览取消，原资源和历史保持。整体迁移仍未完成。

正式 Release 增量构建和 `--free-tile-transform-check` 退出 0；本轮未追加全仓回归或人工图像验收。
