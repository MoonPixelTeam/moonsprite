# 自由瓦片水平／垂直翻转

沿用旧版菜单和 Shift+H／Shift+V，不新增入口、图标或布局。

## 行为与来源

- 有像素选区：翻转当前可编辑主实例的共享源。保持完整选区矩形，包括超出源的透明补边；反射不规则选区的 mask，清除原选中像素后直接写入反射像素，透明值也参与覆盖。实例旋转、镜像与源偏移经既有逆变换承接；所有引用该源的层／帧缓存一起更新。
- 无像素选区：选中的实例优先于残留的 Cel 选择，仅切换实例水平／垂直镜像字段；不调整 x／y，不修改共享源，跳过自身锁定的实例。一条历史支持撤销／重做。
- 已有浮动：反射捕获的源像素和 mask，保留位置、大小、角度、斜切和旋转算法；清除原 RotSprite 采样缓存后重新预览，保持浮动直到原确认操作，Escape 恢复捕获前的内容和选区。
- 层锁定／隐藏、源不可编辑和不支持的目标保留禁用，不回退修改合成缓存。

依据 `legacy/src/renderer/src/store/workspace-commands-selection-flip.ts`、`workspace-free-tile-selection-flip.ts` 及其测试；直接写透明像素来自 `core/tools-selection-transform-apply.ts::flipSelection`，浮动源反射来自 `core/tools-selection-transform-source.ts::flipSelectionTransformSource`。

## 原生适配与保留缺口

复用现有自由瓦片源捕获、原子发布、缓存刷新和历史事务；直接翻转保留完整 marquee，不用普通变换的 source-over 合成代替。继续使用现有单源尺寸和临时栅格预算。

尚未承接：四角自由变形中的浮动翻转、无实例选择的整层翻转、多图层／多帧时间轴批量翻转、固定角度旋转菜单。本批不宣称整个变换板块迁移完成。

## 验证

`free-tile-project-tests` 通过：实例四种方向、镜像、两条翻转轴、透明补边及不规则 mask 的世界坐标逐像素断言；共享缓存、实例位置不变、保存重开、撤销／重做，以及浮动角度保持和取消恢复。正式 Release 构建及 `--free-tile-transform-check` 通过：实际菜单点击、Shift+V、实例分派、浮动翻转与 Escape 恢复、Paint／锁定状态禁用；既有 Ctrl+T、四角拖动、属性与算法回归也通过。来源覆盖 515 文件和快照检查通过；整体仍为 INCOMPLETE。差异格式检查通过。没有素材或布局变更，不作截图外观验收。
