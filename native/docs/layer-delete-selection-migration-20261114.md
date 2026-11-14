# 图层删除选择与历史迁移

## 旧版依据

直接核对并执行 `legacy/src/renderer/src/store/workspace-commands-layer-structure.ts` 的 `deleteActiveLayer` 和 `deleteSelectedLayers`。相关边界依据为 `workspace-animation-selection.ts` 的 ensureLayerSelection／normalizeAnimationSelection、`workspace-mutation.ts`、`workspace-commands-history.ts`、`workspace-tile-selection.ts`、`workspace-layer-owned-tilesets.ts` 和 `core/history.ts`；菜单依据为 `components/app/LayerMenuCommands.tsx`。

两条命令首次均选择删除后的相邻层，保留有效帧、Cel、组格、蒙版格及像素选区，仅清理已经不存在的项目。撤销不复活被删除项目的旧选择，也不恢复已经退出的旧蒙版；仍存活的蒙版上下文保留。所有回放均保留用户后来切换的当前帧和有效项目选择。

所选行删除的 Undo 额外恢复原图层／组行及活动图层，Redo 选择落点行。活动层删除只恢复活动图层，回放继续保留当前存活行选择。折叠状态不由这两条删除历史恢复。实例面板编辑期间拒绝图层删除；锁定、至少保留一层及资源仍被引用时不删除资源的守卫沿用旧版。

## 原生适配

在现有图层结构历史中标记两条删除路径，保留当前帧，移除完整动画选择和帧选择快照；按命令边界仅回放必要行选择。复用现有结构 Cel 所有权转移、资源移除与失败补偿，回放完成通过既有 session 绑定归一化失效项目。瓦片集选择复用复制路径中已迁移的 ensureTileSelection 兼容资源回退，删除不强选活动层拥有的资源。

保留原生已有的组删除分派与显式／隐式行表示；未借本阶段改动整个时间轴选择表示。被移除蒙版的隔离上下文沿用原生既有退出规则，不声明复现旧版没有活动蒙版时仍存放的隔离布尔值。本阶段没有性能优化、布局修改或图标替换。

## 验证记录

直接执行真实 legacy 模块的临时 oracle 共21组通过：所选层／活动层／所选组三条路径×七种选择状态，检查首次、Undo/Redo、后续切帧及存活选择、被删除与存活蒙版。夹具模拟 UI 存储与记录服务，不修改 legacy 源码，位于 `native/build/layer-delete-legacy-oracle.cjs`，不提交生成物。

新增原生域检查按上述三条路径×七种状态对照旧版结果，并检查像素选区与另一工程 session 隔离。新增网格／自由瓦片×独占／共享资源四组，检查删除及回放资源数量、所选资源、原 Cel 像素所有权、锁定和实例编辑守卫。修复前测试实际失败于 Undo 恢复旧帧／项目，修复后通过。

五项定向 CTest 全部通过（3.05秒）：document-transactions、timeline-interaction、document-raster-history、document-layer-group-structure、document-animation-binding。保留原综合事务和组结构断言。旧版 workspace-linked-layers.test.ts、workspace-cross-layer-history.test.ts 两文件11项通过（7.27秒）。原生日志为 `native/build/layer-delete-core-tests.log`，旧版为 `native/build/layer-delete-legacy-tests.log`。

唯一正式 Release 构建成功。正式程序 layer-delete 八组实际进程退出0，使用真实 deleteLayer 菜单与 Undo/Redo 命令入口，检查普通行／组行、帧／Cel／蒙版、切帧后回放；日志为 `native/build/layer-delete-ui-trace.txt`。同一正式程序 layer-copy 八组入口回归退出0，日志为 `native/build/layer-delete-copy-regression-trace.txt`。这些检查不包含完整真实鼠标选择／拖动或所有菜单组合。

来源覆盖934文件及证据快照、Editor边界589源码、diff检查通过；strict因其它已登记迁移缺口继续退出1。无布局变更，不新增人工图像验收。整体迁移仍 INCOMPLETE，尚不作为全功能验收完成声明；阶段保存并推送dev，保留所有用户数据、缓存及日志。
