# Legacy 工具图标

29 个原始 SVG 来自 `legacy/src/renderer/src/assets/tool-icons/*-normal.svg`，逐字节复制。
图标与工具的对应关系来自 `legacy/src/renderer/src/components/app/editor-tools.tsx`；分组与顺序来自 `legacy/src/renderer/src/core/tool-rail-preferences.ts`。

`native/scripts/import-legacy-tool-icons.py` 按原 SVG 的 viewBox 像素网格生成原生渲染使用的 PNG，保留路径、颜色和透明度，不重画图形。`-disabled.png` 只将透明度乘以 0.4 表示未接入状态；常态 PNG 保留原透明度。界面统一进行最近邻 2× 显示。

左侧采用 legacy 默认 13 个位置、29 项工具。铅笔、橡皮擦、抓手接入现有原型功能；其他工具为可查看的未接入入口，不修改作品。组按钮可单击或右键展开，未接入子项不能选择。

当前原生工具组使用现有原生菜单展示图标、名称和未接入状态；legacy 的横向弹出工具组、400ms 长按、自定义工具栏和组记忆尚未迁移。此阶段仅补全工具入口，不代表完整功能迁移完成。主界面按钮皮肤仍由主题图集控制，工具图形统一来自本目录的 legacy 素材。
