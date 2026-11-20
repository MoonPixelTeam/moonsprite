# 运行时主题（皮肤编辑器已取消）

2026-11-20 用户明确取消独立皮肤编辑器，详见[范围决定](scope-decisions-20261120.md)。此前内嵌图集预览、切片选择、加载/刷新/应用面板及专属测试入口已移除，独立工具也不再规划或实现，不计入待办。

主程序保留 `Skin` 控件绘制与 `theme_atlas` PNG/XML 加载。用 Aseprite 改画源目录的 sheet.png 并保存后，重新启动软件查看；其他主题可通过启动参数 `--theme <theme.xml路径>` 加载。主题原图、切片定义、历史参考素材及署名继续保留，不应在 build 目录编辑。

默认主题位于 `assets/themes/moonsprite-dark`；原始 Aseprite 参考位于 `assets/themes/aseprite-default`，模板位于 `assets/themes/moonsprite-template`。主题解析、像素裁切、引用/边界/重复名称/DTD/截断检查继续由 theme-atlas 测试覆盖。
