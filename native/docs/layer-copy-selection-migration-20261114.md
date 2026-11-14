# 图层复制选择与历史迁移

## 旧版依据

直接核对并执行 `legacy/src/renderer/src/store/workspace-commands-layer-structure.ts` 的 `duplicateSelectedLayerRows`、`moveLayerRows`，结合 `workspace-animation-selection.ts`、`workspace-animation-selection-history.ts`、`workspace-mutation.ts`、`workspace-tile-selection.ts`、`workspace-commands-layer-selection.ts`、`core/layer-operations.ts` 与 `core/history.ts`。入口依据为 `components/app/LayerMenuCommands.tsx` 和 `components/panels/useLayerRowDrag.ts`。

菜单复制首次及重做选择副本行，退出蒙版编辑与隔离，清理蒙版行／格及自由瓦片实例编辑；保留普通 Cel、帧、组格和像素选区。撤销恢复原图层／组行、折叠状态及活动图层，不恢复完整旧动画选择，也不复活旧蒙版。菜单复制的 Undo/Redo 保留用户后来切换的当前帧及存活项目。

Alt 拖动由复制创建与行移动组成。移动记录捕获的是复制已经清理蒙版后的完整选择，因此撤销恢复移动记录的帧与项目，再恢复原行及活动图层，不复活复制前蒙版。普通行移动继续采用原完整选择历史。

## 原生适配

在现有结构历史中标记复制行选择，回放仅恢复对应行身份；菜单路径保留当前帧，Alt 路径保留移动的完整选择记录并移除复制前蒙版状态。重做选择副本所拥有的瓦片集，撤销按旧版兼容资源选择规则保留存活资源，否则回退。通过既有 session 绑定归一化已移除项目，保留其它工程状态及现有失败补偿。

旧版通过 selectedLayerIds 表示隐式活动目标，原生通过空显式行和 activeLayer 表示，因此仅在复制命令边界解析隐式活动层；帧／Cel／蒙版专属选择不补隐式目标。沿用已有 Cel、链接、图层组、蒙版和资源复制逻辑。本阶段没有性能优化、布局或图标修改。

## 验证记录

真实 legacy 模块命令 oracle 共12组通过，覆盖菜单／Alt 两条路径和六种选择模式。旧版 `workspace-linked-layers.test.ts`、`workspace-cross-layer-history.test.ts` 两文件11项通过（8.63秒）；没有修改 legacy 源码或测试。临时 oracle 位于 `native/build/layer-copy-legacy-oracle.cjs`，不提交生成物。

原生五项 CTest 全部通过（2.95秒）：document-transactions、timeline-interaction、document-raster-history、document-layer-group-structure、document-animation-binding。新增域检查覆盖两条路径×六种选择状态、Undo/Redo、后来切帧及存活项目、像素选区、另一 session 隔离、隐式活动目标，以及网格／自由瓦片副本资源与选择恢复。日志为 `native/build/layer-copy-core-tests.log`。

唯一正式 Release 构建成功。正式程序 layer-copy 阶段8组检查实际进程退出0，日志为 `native/build/layer-copy-ui-trace.txt`；菜单使用真实 duplicateLayer 命令及 Undo/Redo 命令入口。拖动检查构造 timelineGesture 后调用生产 finishTimelineGesture(false)，并非完整真实鼠标拖动验收。

来源覆盖934文件及快照、Editor边界589源码、diff检查通过。没有新的人工图像或完整桌面验收；strict仍因其它已登记迁移缺口失败，整体迁移继续 INCOMPLETE。保留全部用户数据、缓存及日志，阶段保存并推送 dev。
