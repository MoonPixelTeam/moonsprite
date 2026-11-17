# 混合工程抗锯齿和卷积入口（2026-11-17）

依据旧版 `workspace-convolution-preview.ts`、`workspace-commands-selection-anti-alias.ts` 和 `workspace-selection-effects-support.ts`：按选中普通图层／蒙版筛选处理目标，不能因工程中存在自由瓦片就整体禁用菜单。

移除这两个菜单的全工程自由瓦片限制，复用原生既有预览与提交控制器。特殊图层作为唯一目标时仍拒绝处理，不新增对资源缓存直接编辑的行为。替色的特殊图层语义继续保留待迁移，不纳入本轮完成声明。

正式 Release 构建通过，`--free-tile-transform-check` 退出码 0。新增定向检查通过真实菜单打开两种预览，取消后验证像素、资源和历史保持，以及特殊目标拒绝。既有算法验收继续沿用，本轮不重复全量测试、不宣称新增人工图像验收。

后续入口补齐：快捷指令栏抗锯齿移除残留的全工程自由瓦片门禁，统一复用菜单的可用性检查；旧版来源为 `QuickCommandBar.tsx` 的 `quickAntiAlias` 分支。混合普通图层快捷调用及取消纳入同一个定向检查。

快捷入口补齐验证：正式 Release 增量构建成功，`--free-tile-transform-check` 退出 0，来源覆盖 1042 文件及 diff 检查通过；未追加全仓回归或人工图像验收。
