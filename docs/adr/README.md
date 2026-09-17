# 架构决策记录

中文 | [English](README.en.md)

ADR 用于记录会长期影响实现的决定，避免后续只看到代码而不知道原因。

## 使用方式

文件名格式：`NNNN-short-title.md`。状态使用“提议”“接受”“废弃”或“替代”。

每个 ADR 包含：背景、决定、结果和替代方案。只记录需要长期遵守的架构决定，不记录普通 Bug 修复。

## 当前决策

- [0001：文档历史与视图状态分离](0001-separate-document-and-view-history.md)
- [0002：动画时间轴与静态图层数据分离](0002-animation-timeline-schema.md)
- [0003：当前图层表面与动画 Cel 像素同步](0003-animation-cel-surfaces.md)
- [0004：动画导出与洋葱皮的隔离](0004-animation-export-and-onion-skin.md)
- [0005：项目元数据与缩时快照持久化](0005-project-metadata-and-timelapse.md)
- [0006：自适应调色板槽位](0006-fixed-palette-slots.md)
- [0007：逐单元格可编辑图层蒙版](0007-attached-layer-masks.md)
- [0008：工程文件稀疏栅格存储](0008-sparse-raster-project-storage.md)
- [0009：可编辑文本局部样式区间](0009-editable-text-style-runs.md)
- [0010：可编辑区域文本](0010-editable-text-boxes.md)
- [0011：文档颜色模式与栅格格式分离](0011-document-color-modes.md)
- [0012：非破坏性图层样式](0012-non-destructive-layer-styles.md)
- [0013：可编辑背景图层](0013-background-layers.md)
- [0014：进行中路径使用独立手势历史](0014-pending-canvas-gesture-history.md)
- [0015：Tilemap 源数据与平铺视图分离](0015-tilemap-source-and-tiled-view.md)
- [0016：自由瓦片源库与任意位置实例分离](0016-free-tile-source-and-instances.md)
- [0017：Tilemap 图层共享项目瓦片集](0017-shared-tilemap-tilesets.md)
- [0018：动画循环节使用稳定帧端点](0018-animation-loop-sections.md)
- [0019：Lua 脚本使用快照与类型化事务边界](0019-lua-script-snapshot-transactions.md)
- [0020：扩展包使用受限 ZIP、原子安装与 Runtime 安全边界](0020-extension-package-format.md)
- [0021：关联图层使用稳定身份与共享栅格存储](0021-linked-layers.md)
- [0022：自由瓦片图层共享稳定源集合](0022-shared-free-tile-sets.md)
- [0023：缩时录像使用本地不可变分块库](0023-local-timelapse-library.md)

新增 ADR 时按编号递增；废弃旧决定时保留原文件并指向替代 ADR。
