# 新建图层选择与历史迁移

## 旧版依据

直接核对 `legacy/src/renderer/src/store/workspace-commands-layer-creation.ts` 的 `addLayer`、`activateNewLayerContext`，以及 `workspace-animation-selection.ts` 的插入位置和项目选择清理、`core/layer-operations.ts` 的位置历史、`core/history.ts` 的复合历史回放顺序。

普通和渐变映射图层先在父组顶部创建，再按选中行调整位置。首次成功后活动图层为新层，清理显式图层／组行、帧／Cel／组格／蒙版格／蒙版行、锚点及蒙版隔离，保留像素选区。创建历史移交新层的 Cel 内容及几何，恢复图层与位置，不恢复旧时间轴选择，也不切换用户后来选择的活动帧。

撤销先逆转位置，再移除新层，活动图层采用创建位置的旧相邻层；重做恢复新层和 Cel、使新层活动。旧版数组从底至顶，原生从顶至底，活动层和插入位置按此转换。渐变映射设置取消保留已经创建的调整图层，沿用现有独立创建历史。

## 原生适配

普通根图层复用已有组结构创建事务，统一以 1×1 空稀疏 Cel 创建，并通过结构事务移交已扩展的 Cel，使之后的绘制历史可反复回放。移除原先自动附加的完整选择、帧选择、行选择和组 UI 快照；首次清理通过既有弱引用 SelectionAccess 更新原工程的 session，不影响其它工程。Editor 新建图层入口不再重新附加完整选择历史。

仅创建事务设置 `LayerHistory::preserveCurrentFrame`，结构回放使用当前活动帧，其余结构事务继续验证其记录的活动帧、活动图层和链接。保留现有失败补偿、像素所有权和资源验证。本阶段没有性能优化、图标替换或布局修改。

## 验证记录

唯一正式 Release 构建成功。最终四个 CTest 套件全部通过：`document-transactions` 0.30 秒、`document-raster-history` 2.66 秒、`document-layer-groups` 0.03 秒、`document-animation-binding` 0.03 秒，总计 3.06 秒。原综合事务第84行的新建图层撤销断言原样保留并通过；之前第76行的帧创建断言继续通过。

新增域测试执行普通／组内／渐变映射三条创建路径×六种初始选择状态，检查首次清理、像素选区保留、Undo/Redo、切帧后的当前项目保留和后台工程隔离；两条普通／组内绘制路径反复三轮跳转历史，检查扩展像素及其它图层内容保留。首次蒙版夹具缺少可见内容，补齐内容后继续检查；父组预期按帧／Cel 选择已清行的事实修正。稀疏迁移使旧失败补偿夹具不能再向1×1表面直接塞四个像素，改为显式安装原2×2表面与原四个像素，所有原有失败、身份、像素和元数据断言保留。临时诊断输出已移除，最终重新编译并通过。

旧版实际 `workspace-cross-layer-history.test.ts`、`workspace-gradient-map.test.ts`、`workspace-tilemap.test.ts` 共42项通过（11.53秒），没有修改 legacy 源码或测试。

正式程序使用 `MOONSPRITE_TILE_REPEAT_CHECK_PHASE=layer-creation` 运行 `--tile-repeat-check`，等待实际进程退出码为0，`native/build/layer-creation-ui-trace.txt` 包含全部18组。通过真实 `newLayer`／`newGradientMapLayer` 菜单及 Undo/Redo 命令验证初始选择清理、蒙版隔离、渐变映射设置取消、切帧及当前 Cel 选择保留。

来源覆盖934文件及证据快照、Editor边界589源码、diff检查通过；strict仍因其它已登记迁移缺口退出1。没有新的人工图像或完整桌面验收。整体迁移仍未完成，保留全部用户数据、缓存和日志；本阶段提交推送dev。
