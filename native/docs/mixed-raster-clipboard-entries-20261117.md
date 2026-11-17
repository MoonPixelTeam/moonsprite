# 混合工程普通图层剪贴板入口

依据实际 legacy `src/renderer/src/store/workspace-commands-clipboard.ts::copySelection`：选区复制读取活动图层，与无关自由瓦片层无关。原生普通图层绕过自由瓦片专用菜单门禁，复用原有剪贴板作用域、锁定校验和事务。

正式 Release 增量构建及 `--free-tile-transform-check` 退出 0：实际 Copy／Cut／Paste 菜单、精确 RGBA、剪切撤销、浮动粘贴取消、资源及历史保持通过。未追加全仓回归或人工图像验收。

用户本轮确认特殊图层替色采用资源同步修复：选区决定修改哪些资源像素，全部共享引用（含锁定层）同步，支持预览取消、撤销和保存重开。此项已获授权，尚待实现；整体迁移未完成。
