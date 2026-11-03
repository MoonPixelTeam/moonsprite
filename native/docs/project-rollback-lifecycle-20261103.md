# 工程备份回档生命周期

## 依据与行为

按 `legacy/src/renderer/src/components/ProjectRollbackDialog.tsx` 的 restore 回调，成功回档关闭窗口，失败留在窗口并显示错误。内容事务沿用已迁移的 `Document::rollbackProject`，对应 `workspace-commands-document-io.ts` 的 restoreProjectBackup：保留当前工程身份和保存路径，以一次可撤销操作替换内容，不自动覆盖磁盘工程。

本次修复原生成功回档后仍留在选择窗口的问题，未改变备份排序、保留策略或文件读取预算。

## 实际验证

唯一正式 Release 构建通过；正式程序 `--project-rollback-check` 返回 0。该入口创建自己的工程及真实备份，通过实际列表与恢复回调验证：刷新、损坏备份失败保护、成功后窗口关闭、身份与路径保持、一次历史记录、撤销与重做、磁盘原工程未被自动保存。

来源覆盖检查通过（574 个文件）。未进行人工操作或截图外观验收，不据此宣称整个恢复领域或全软件迁移完成。
