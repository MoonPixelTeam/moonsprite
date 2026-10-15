# 画布透明棋盘格迁移

来源：`legacy/src/renderer/src/components/canvas-render-background.ts`、`core/file-preferences.ts`、`core/canvas-visuals.ts`、`core/theme.ts` 和 `components/dialogs/PreferencesDialog.tsx`。

- 默认每格 16 文档像素，浅色 #C0C0C0，深色 #808080，左上浅色。
- 沿用旧版 2×2 固定纹理、最近邻重复采样；纹理跟随文档原点和缩放，裁剪只覆盖画布。格子小于 2 显示像素时填充浅色。
- 外观设置的尺寸范围 1–256，应用/确定写入用户偏好 canvas-checkerboard.txt，取消不应用草稿，不进入工程撤销记录。
- 原生颜色设置暂以已有 HEX 输入组件适配旧版 ColorValueControl，完整设置颜色弹出拾色器尚未迁移。输入框保留原生已有滚轮、表达式等数值交互。
- 预览窗口、笔刷合成预览、选区反馈明暗判断、取色镜片透明背景共享棋盘格参数；不修改导出像素。

验证：canvas-checkerboard 对照旧版逐格回退算法，覆盖三档尺寸、六档缩放、两种平移和裁剪；checkerboard-preferences 覆盖显示、草稿、取消、应用、上限约束及预览同步。
