# 自由瓦片新建与放置（2026-10-28）

本批承接 TI-004 中的新建图层、共享源集合和 Paint 模式实例放置／擦除，不代表完整自由瓦片编辑器已迁移。

## 来源

- `legacy/src/renderer/src/store/workspace-commands-layer-creation.ts`：`createFreeTileLayer`、`activateNewLayerContext`；新建/共享集合、透明1×1默认源、颜色预设、逐帧独立实例和默认 Edit 模式。
- `legacy/src/renderer/src/components/FreeTileLayerDialog.tsx`：名称与新建/共享集合两字段。
- `legacy/src/renderer/src/components/canvas-input-free-tile.ts`：Paint 点击一次放置、源居中、对称与选区、橡皮擦路径及顶层锁定阻挡。
- `legacy/src/renderer/src/core/free-tile.ts`：源偏移、实例变换和矩形命中。
- `legacy/src/renderer/src/store/workspace-commands-free-tile.ts`：预览、取消、单目标提交和无变化不计历史。
- `legacy/src/renderer/src/store/workspace-layer-resources.ts`：默认源颜色取预设。

## 承接与必要适配

顶栏和图层右键复用原有命令、图标；弹窗使用现有 PixelDialog 和通用控件。现有瓦片栏目显示自由源缩略图，允许选择不同尺寸的源后进入 Paint。新集合的源为透明1×1；源绘图尚未迁移，因此不能把新建空集合描述为完整可绘制源编辑器。已有带源内容工程可以直接放置。

每次点击创建实例，拖动笔刷不重复盖章。橡皮擦按路径删除最上层矩形命中的未锁定实例，透明像素不穿透；锁定顶层实例阻挡下层删除。静止重复事件不继续删除重叠实例。保留选区、对称、源偏移、实例外观参数；仅修改当前帧实例，不写共享源或其他帧。

原生沿用 Document 的取消入口、目标 Cel 历史及统一工程读写；一次手势一条历史，取消恢复实例和缓存。新增状态属于现有 TileSelection 历史。新建复用原图层插入/分组逻辑，清除时间轴显式选择和蒙版隔离，可撤销恢复。

## 仍未迁移

本批交付时源绘图及 Edit 按钮尚未接通；后续源笔刷/橡皮擦及 Edit 入口承接见 `free-tile-source-brush-20261028.md`，以该文最终实际验证记录为准。源属性、实例选择/移动/属性、多选变换、跨工程剪贴板及尺寸操作仍有缺口，其余不可用功能继续灰显。自由源与规则瓦片混合共享、链接自由 Cel 等仍受上一批原生准入限制。没有新增素材或改动统一UI规格。

原生预览复用既有自由瓦片渲染与缓存发布，尚未承接 Legacy 全部脏区和增量性能策略，不声明性能等价。

## 实际验证

正式 Release 构建成功；`free-tile-project-tests` 通过；正式程序 `--layer-context-check` exit0，覆盖真实新建弹窗取消/创建/共享、源缩略图选择、工具准入、画布按下/移动/松开只放一个实例、橡皮擦、Escape取消及撤销/重做，同时保留原有菜单回归。

运行检查最初未设置编辑器尺寸且未挂载实际窗口，导致模拟画布点击落在不可用视口。已仅对检查入口补齐真实 desktop 挂载及画布布局后重新通过；正常启动路径不变。保存往返断言按编解码后的规范化实例字段和实际像素验证，未知自定义字段保留。

没有本批有效UI图像验收，不把模拟交互通过等同于视觉等价；没有跑全量或性能测试。来源登记是证据检查，不能替代行为等价验收。

最终补充：`tilemap-document-tests` 通过（Tilemap document transactions passed）；来源覆盖511文件及证据快照验证、本批diff whitespace检查通过。稳定程序仍为 `native/build/Release/moonsprite-native.exe`，启动入口仍为 `native/start-native.bat`。
