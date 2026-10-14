# MoonSprite 可改画主题模板

先复制整个文件夹到你自己的主题目录，再用 Aseprite 打开 `sheet.png`。
保持 `sheet.aseprite-data` 和 `theme.xml` 在同一目录，启用切片工具可以查看命名切片。
原位改画后保存 PNG；移动或调整切片后，同时确认 `theme.xml` 已更新。
使用 `--theme <theme.xml路径>` 启动 MoonSprite；修改素材后重新启动加载。

图集包含 56 个命名素材。详见“图集索引.md”：标为预留的素材可以先设计，尚不会影响主界面。
模板是原创占位素材，供改画，不是最终视觉设计；部分预留图标仍共用占位图案。
模板结构参考 Aseprite；并不承诺在 Aseprite 中作为完整主题运行，也不能导入任意 Aseprite 主题。
当前 MoonSprite 直接选择 theme.xml，package.json 仅登记主题身份，尚无扩展包安装器。
不要将绘图软件导出的 JSON 替换 theme.xml；不要更改现有切片名称。
文字统一 Fusion 10px、整体 2×。不要将按钮文字画进背景素材。
