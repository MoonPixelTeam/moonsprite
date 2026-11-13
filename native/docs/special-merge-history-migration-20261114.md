# 特殊图层合并的历史与选择状态迁移

旧版依据：`legacy/src/renderer/src/store/workspace-commands-layer-structure.ts::commitLayerMergeWithOwnedTilesets`、`workspace-history.ts::captureLayerUi/restoreLayerUi/commitLayerMerge` 和 `workspace-animation-selection.ts::normalizeAnimationSelection`。合并历史只恢复结构及图层／组选中状态；不会恢复已退出的蒙版编辑上下文。命令完成后另行清理失效动画选择。

本次定位前阶段 `free-tile-project` 的失败：撤销确实恢复了原图层、组、瓦片资源及蒙版身份，但通用完整选择快照又进入被合并的蒙版。保留原先断言与改动，在所选、向下、组和可见图层合并三个事务入口排除完整动画选择历史；沿用现有图层 UI 历史。成功后显式调用既有选择归一化，承接旧版命令完成时的清理。未修改其它命令的完整选择历史规则。

定向夹具扩展真实 session selection 绑定，核对移除蒙版格／组格及锚点清理、存活组格和蒙版格保留，以及撤销／重做不恢复已清理的格选择。原有 32 组合（网格／自由瓦片、资源共享／独占、蒙版隔离／合成、四种合并方式）及隐藏特殊层、锁定拒绝、全部帧外观、保存／恢复重开、资源与蒙版身份保持原预期。

验证结果：先前修复版正式构建及 special-merges 已通过；旧版两个真实定向测试文件共 5 项通过（8.15 秒）。新增 session 归一化回归后，唯一正式 Release 及 free-tile-project-tests 构建成功，special-merges 最终检查退出 0；来源覆盖 929 文件及证据快照、Editor 边界 587 源文件、git diff --check 均通过。

本阶段仅功能迁移，无界面布局或性能优化。未重跑完整 free-tile-project，不将定向通过写成整套通过；没有新图像或人工桌面验收。其它已登记迁移缺口与整体迁移仍未完成。前阶段文档中的合并失败记录保留为历史，本文件登记根因及修复结果。
