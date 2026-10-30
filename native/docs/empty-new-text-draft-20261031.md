# 新建文字删空后的草稿生命周期

## 旧版依据

`legacy/src/renderer/src/components/app/TextToolHost.tsx` 的 `changeTextTool` 优先更新已存在的临时文字层，即使内容为空；只有尚未建立草稿时，空内容不会创建图层。`store/workspace-commands-layer-text.ts` 的 `updateTextLayerDraft` 对空文字仍栅格化并更新同一个所有者，名称回退文字默认名。`components/TextToolDialog.tsx` 禁止提交空内容。

## 原生承接

原生编辑回调原先在任何空内容下都取消草稿，导致新建层删空后被移除，再输入时重建。本批仅对已存在的新建草稿保留生命周期，把空文字交给现有预览事务，清空可见像素并保留图层／Cel身份、位置、选中状态与历史基线。尚未创建草稿的空内容不建层；编辑已有文字时，空预览仍恢复原文字。取消整段编辑仍完整回滚，非空确认仍提交一次历史。

## 验证

正式Release构建、`--text-tool-check`、`--text-rasterization-check`、515文件来源与证据快照检查、差异检查通过。文字弹窗实际键盘输入覆盖全选删空、局部撤销／重做、空内容不可确认；回调检查透明像素、相同图层和Cel、层数不变、历史不变。既有弹窗取消／确认、文档历史及文字转栅格后过期草稿不恢复检查同时通过。没有新增UI素材、布局或人工图像验收。
