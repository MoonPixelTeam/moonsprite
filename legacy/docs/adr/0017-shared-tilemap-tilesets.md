# 0017：Tilemap 图层共享项目瓦片集

中文 | [English](0017-shared-tilemap-tilesets.en.md)

## 状态

接受

## 背景

新建 Tilemap 图层时，用户需要在不复制瓦片资源的情况下复用工程内已有的瓦片集。原有实现虽然使用稳定 `tilesetId` 引用，但界面始终创建新资源，且命名同步逻辑把 Tileset 当作单一图层所有物。

## 决定

- 新建 Tilemap 图层弹窗默认选择新增 Tileset，也可选择当前工程已有的 Tilemap Tileset。
- 选择已有 Tileset 后，图层网格尺寸采用该 Tileset 的 `tileWidth` 与 `tileHeight`，创建只增加空白 Tilemap cel，不复制 Tileset。
- 多个 Tilemap 图层可以共享同一个 Tileset；共享 Tileset 的像素、槽位和瓦片引用修改由现有 Tileset 领域命令统一重绘全部引用。
- 自由瓦片源的单瓦片 Tileset 不允许通过 Tilemap 创建器选择；自由瓦片图层之间的集合级共享由 [ADR 0022](0022-shared-free-tile-sets.md) 定义。
- 共享 Tileset 不跟随任意单独图层改名；只有唯一 Tilemap 引用者才保持旧的名称同步行为。删除引用图层时，只在无其他所有者或格子引用时清理 Tileset。
- 该关系使用现有 `tilemapTilesetId` 字段，不提升工程 schema 版本；旧工程格式仍按原验证规则读取。

## 结果

Tilemap 图层可以共享一份可编辑瓦片资源，减少重复数据，并保留现有撤销、工程保存、瓦片预览和引用重绘路径。自由瓦片源的所有权边界不受影响。
