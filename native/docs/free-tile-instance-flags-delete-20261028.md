# 自由瓦片实例状态与删除（2026-10-28）

本批继续 TI-004 的集成实例列表，完成显隐、锁定拖扫和删除入口，不代表整个自由瓦片功能完成。

## Legacy 依据

路径相对 `legacy/src/renderer/src/`：

- `components/panels/FreeTileInstanceLayers.tsx`：倒序行、独立眼睛/锁定操作、继承状态灰显但可修改自身状态、右键选择及删除目标、Delete/Backspace。
- `components/panels/useLayerRowToggleGesture.ts`：按下到当前行的连续范围、扫回时还原范围外原值、只响应同一控制列、松开/失焦结束为一次事务。实例列表没有传入 Ctrl 目标或 solo 目标，不额外设计修饰键规则。
- `store/workspace-commands-free-tile.ts::setFreeTileInstanceProperties/deleteFreeTileInstances`：显隐和锁定不被自身/继承锁阻挡；删除目标中任意实例锁定则整批拒绝；删除自身 cel 而非链接持有者；相邻实例回退；最后一项删除后转 Paint；撤销恢复内容，不恢复旧实例选择。
- `store/workspace-free-tile-selection.ts::setFreeTileInstanceSelectionState`：保留剩余选择，并补入回退主项，不能只修改主项字段。

## 原生适配

复用 Document 的目标 cel 事务、历史与工程存储，控件继续使用既有行素材及 legacy 图标；未新增图标或皮肤。指针捕获由实例栏目持有，Editor 的画布放置路由明确避让；时间轴刷新保留实例栏目自身事务的可用状态，不再因 document.active 将正在拖扫的栏目禁用并释放捕获，模态弹窗期间仍禁用；焦点在实例栏目时优先消耗 Delete/Backspace，空列表也不落到普通图层删除。

预览每次从手势前快照重建范围；显隐重渲染目标 cel，锁定只改实例元数据，其他帧、共享图层和源像素不变。继承隐藏/锁定只影响图标显示；自身眼睛和锁仍可操作。无变化不新增历史或清掉重做。右键菜单坐标使用 MouseMessage 的显示器相对位置，直接交给相同显示器的菜单。

## 尚未完成

实例属性弹窗由后续批次承接，见 [自由瓦片实例属性](free-tile-instance-properties-20261028.md)。独立实例栏目设置、排序、右键变换、剪贴板完整承接和画布外缓存扩展仍需后续迁移；不宣称性能或 TI-004 全量等价。

## 本批检查

- 正式 Release 构建通过，更新同一个 `native/build/Release/moonsprite-native.exe`；无额外启动入口或 preview 版本。
- `free-tile-project-tests.exe` 通过：连续范围/扫回、单次历史、无变化保留重做、保存重开、锁定拒绝整批删除、相邻回退、保留选择补主项、其他 cel 不变与继承锁场景。
- 正式程序 `--layer-context-check` 返回 0：实际实例行显隐拖扫/扫回、锁定拖扫失焦提交、Editor 不抢栏目事务、焦点 Delete 路由及撤销恢复通过；同时运行原有实例移动/取消检查。
- 修复实际面板检查发现的刷新禁用问题：Document 事务期间，外层时间轴不能覆盖实例栏目的自身手势可用状态。此前断言失败后测试宿主异常展开掩盖原始错误，现与其他检查一致记录错误并返回失败。
- 本次新生成 `native/build/Release/free-tile-instances.bmp` 已查看：核对现有行素材、眼睛/锁图标与稀疏选择轮廓的呈现；选中素材逐像素 alpha/命中检查由同一次消息测试执行。截图不是整套界面或所有皮肤状态的验收。
- `check-legacy-provenance.py` 覆盖 512 文件及来源快照通过；整体仍为 INCOMPLETE，不代表全部迁移完成。
