# 自由瓦片编辑／绘制模式切换（2026-10-29）

## 本批范围

补齐 TI-004 已有源面板 Edit／Paint 入口的完整选择语义；不新增按钮、不打开额外栏目、不修改布局。

旧版来源：

- `legacy/src/renderer/src/store/workspace-commands-free-tile.ts` 的 `setFreeTileMode`、`syncFreeTileInstanceSourceSelection`。
- `legacy/src/renderer/src/store/workspace-free-tile-selection.ts` 的单选、主实例及锚点状态。
- `legacy/src/renderer/src/components/panels/TilesetPanel.tsx` 的源点击及模式按钮。
- `legacy/src/renderer/src/components/useCanvasTileTarget.ts`、`useCanvasSelectionOverlay.ts`：源编辑实例选择和画布轮廓不依赖实例栏目展开。
- `legacy/src/renderer/src/store/workspace-tilemap.test.ts` 已有 Edit／Paint 工具可用性场景；本批没有借此声明所有工具均已迁移。

沿用本仓库 `legacy/LICENSE` 的许可，不引入第三方素材或实现。

## 行为

进入 Edit 时先保留可编辑主实例，否则选当前源对应的首个可编辑实例，再否则按底层存储顺序取首个可编辑实例。实例自身和对应源的隐藏、锁定都参与筛选。没有可编辑实例时保留 Edit 模式但清空实例选择。

选定后收敛为一个实例，更新主实例和选择锚点，同步源集合与主瓦片，副瓦片失效时回退到该源首瓦片。进入 Paint 清空实例选择，不改变当前源。

源编辑选择与实例栏目是否展开解耦，因此普通自由瓦片视图也能保持编辑锚点和显示已有画布轮廓。实例移动、实例剪贴板等命令继续由原来的实例视图上下文保护，不因此全部开放。

模式切换仅改变会话状态，不写源像素、不修改实例、不增加历史、不丢失重做分支。保留原生已有活动事务保护；这是适配已有原生事务边界，而非在笔画中途取消并切换工具。

## 验证

- 正式 Release 构建成功，更新既有 `native/build/Release/moonsprite-native.exe`。
- `free-tile-project-tests.exe` exit0：覆盖已有自由瓦片工程、绘制、历史、实例操作，以及本批模式选择、主副角色、源／实例锁定隐藏过滤、无可编辑实例、多选收敛、当前图层／帧清理、保存重开、活动事务保护和重做保留。
- 正式程序 `--layer-context-check` exit0：通过既有源面板的真实 Edit／Paint `Click`，验证有／无实例时选择、会话状态和历史不变，并继续通过已有画布与实例菜单操作检查。
- 来源登记覆盖513文件、证据快照和 diff whitespace 检查通过；整体来源等价状态仍为 INCOMPLETE。
- 初次新增测试样本的瓦片槽和共享源登记不一致，已修正样本构造；真实入口夹具因前序布局操作主动进入实例视图而违反新增前置条件，已明确退出实例视图后重跑通过。这些检查不作为未实现行为的豁免。
- 未进行截图人工视觉验收、长期使用或性能测试，不据此声明这些项目通过。

源新增／删除／属性等管理仍属其余自由瓦片迁移缺口，本批不宣称整个模块完成。
