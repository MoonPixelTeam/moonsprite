# 独立皮肤编辑工具规划与运行时主题

皮肤编辑器按用户最新决定独立于 MoonSprite 主程序。内嵌图集预览、切片选择、加载/刷新/应用面板及专属测试入口已移除；本批不实现独立编辑器。

主程序保留 `Skin` 控件绘制与 `theme_atlas` PNG/XML 加载。用 Aseprite 改画源目录的 sheet.png 并保存后，重新启动软件查看；其他主题可通过启动参数 `--theme <theme.xml路径>` 加载。主题原图、切片定义、历史参考素材及署名继续保留，不应在 build 目录编辑。

默认主题位于 `assets/themes/moonsprite-dark`；原始 Aseprite 参考位于 `assets/themes/aseprite-default`，模板位于 `assets/themes/moonsprite-template`。主题解析、像素裁切、引用/边界/重复名称/DTD/截断检查继续由 theme-atlas 测试覆盖。
