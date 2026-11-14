# 图层组创建与解组迁移

## 旧版依据

直接核对并运行 legacy/src/renderer/src/core/layer-operations.ts 的 createLayerGroup、ungroupSelected 及 store/workspace-commands-layer-structure.ts 的命令包装。选择和历史边界依据为 workspace-animation-selection.ts、workspace-commands-animation-selection.ts、workspace-mutation.ts、core/history.ts；菜单依据为 components/app/LayerMenuCommands.tsx。沿用 layer-operations.test.ts 和 workspace-cross-layer-history.test.ts 的实际输入与断言。

创建组保留显式混合选择，选层按原顺序合为连续块，放在最高选层位置；共同父组一致则嵌入该父组，否则根组。纯组选择创建相邻空组，沿用旧版树遍历和分数 panelOrder。首次选择新组并设置行锚点；撤销选回共同父组，重做选择新组。两者保留当前帧、有效 Cel／蒙版／组格及后来选择的行，不回放折叠状态。普通创建保留回放时活动图层；纯组相邻放置的复合历史沿用创建时活动图层。

解组只处理 selectedGroupId 指向的单组；否则取所选图层的直接所属组，不把全部 selectedGroupIds 当作解组目标。直接图层和子组提升到最近存活祖先；删除目标组的蒙版并在 Undo 恢复。首次清组行选择并选择原直接所属图层、移除目标折叠记录；回放只恢复结构，不复活旧组格、蒙版选择或折叠状态，也不替换后来切换的活动层／帧。有效锁定的目标组、后代组或层拒绝解组。

## 原生适配

复用现有 Document 图层结构事务、Cel 所有权移交与失败补偿，区分创建／解组的窄历史契约，取消完整动画选择快照。通过原有弱 session 绑定归一化失效项目，不改另一个工程的选择。Editor 创建组入口去掉额外清组格。原生用空显式行加活动层表示旧版隐式目标，创建／解组边界补回该目标；实际普通 Cel 点击保留其编辑层语义，帧／蒙版模式仍创建空组。完整 session 历史测试改用旧版确实拥有完整选择历史的 moveLayerRows，另设解组不复活项目测试。

本阶段不含性能优化、布局或图标替换。保留原生既有的显式／隐式行表示和失去活动蒙版后的退出隔离规则，不声称修复整个时间轴表示或复现旧版空活动蒙版下遗留的隔离布尔值。

## 验证范围

直接执行真实 legacy 模块 oracle 46 组通过：四种创建上下文和两种解组入口各六种选择模式共36组；五种实际选择命令后的创建目标；四种有效锁定／后代提升和一组同时解散父子组。临时脚本 native/build/group-structure-legacy-oracle.cjs 只在加载时标记两个 type-only import 供 Node 擦除，未修改 legacy 文件或算法；不提交构建目录。旧版两测试文件9项通过，10.23秒。

新增原生域检查覆盖36组选择／历史、五种隐式目标及普通 Cel 解组、后续活动层／帧和项目、另一工程隔离；结构检查覆盖嵌套解组、祖先提升、选择层归属、链接像素所有权及锁定拒绝。新增普通／恢复／本地历史三种编码的创建嵌套组、解组蒙版、Undo/Redo 重开检查。

唯一正式 Release 及最终增量构建成功。六项定向 CTest 全部通过，3.01秒：document-transactions、timeline-interaction、document-raster-history、layer-group-io、document-layer-group-structure、document-animation-binding；日志为 native/build/group-structure-final-core-tests.log。旧版两文件9项通过的日志为 native/build/group-structure-legacy-tests.log。

正式程序 group-structure 三条入口×六种模式共18组实际进程退出0，使用真实 createLayerGroup／ungroupLayers 菜单与 Undo/Redo 命令，后来选择通过生产 selectTimelineSlot 入口设置；日志为 native/build/group-structure-ui-trace.txt。同一正式程序 layer-creation 18组、layer-copy 8组、layer-delete 8组回归均退出0。首次新增夹具直接调 Document 选择跳过 Editor 对旧组格的清理，出现 later context 断言失败；改用现有生产时间轴入口后通过，未改变生产选择算法。补充蒙版夹具先填充像素以满足已有蒙版创建前置条件。

来源覆盖检查934文件及快照、Editor边界589源码、diff检查已通过；strict 仍因其它迁移缺口退出1。没有性能优化、新布局、人工图像或完整鼠标／桌面验收。整体仍 INCOMPLETE，不作为全功能验收完成声明。阶段提交推送 dev，保留全部用户数据、缓存及日志。
