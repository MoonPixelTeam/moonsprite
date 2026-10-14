# legacy 指针素材

来源：`legacy/src/renderer/src/platform/cursor-theme.ts` 的 `CURSOR_ICON_LIBRARY` 及其引用的原始素材。PNG 原样复制；两个像素 SVG 按其矩形路径无平滑转换为 32×32 PNG，SVG 源文件也保留。`cursors.txt` 保留旧版的 38 个指针语义和点击位置，多个语义可共用一张图片。

当前接入：普通界面箭头、画笔／橡皮黑白指针、抓手及拖动。其余素材随包保留，等待对应功能迁移，不代表这些工具已实现。

切换逻辑来自 `core/canvas-visuals.ts` 与 `components/useCanvasCursor.ts`：亮度 `0.2126R + 0.7152G + 0.0722B < 145` 使用白色指针，否则使用黑色。当前单层不透明画笔按前景色判断，透明橡皮按擦除后露出的棋盘格判断；未来多层合成、半透明画笔须承接旧版的完整采样逻辑。旧版 grab 与 grabbing 使用同一张手形素材。

沿用旧版默认 `cursorScale=1`：32×32 原始尺寸和热点，不随 UI 的 2× 或画布缩放再次放大。使用 laf 创建原生系统指针，按图像与热点缓存，鼠标移动时不解码图片、不创建新句柄；不迁移 CSS、DOM 或 WebView 的指针覆盖层。

替换本目录中的 PNG 后重新启动 `native/start-native.bat` 即可，不需要编译。PNG 保持 32×32；点击位置可在 `cursors.txt` 中修改。此入口直接读取本目录，直接运行 build 中的 exe 则默认使用 exe 旁的副本。当前未接入旧版指针倍率设置和“使用系统指针”偏好，不能声称整个旧版指针配置系统已迁移。

`native/scripts/import-legacy-cursors.py` 用于重新从旧版导入，会覆盖同名素材和定义；用户自行改画后不要直接重新运行。素材沿用仓库旧版的原有授权，不另行声明第三方许可。

默认主题已集中到 ../themes/moonsprite-dark/sheet.png 的 cursor.* 区域，运行时优先读取该图集。cursors.txt 继续定义语义与热点；本目录 PNG 作为来源和旧主题/自定义目录 fallback。默认主题只修改独立 PNG 不会覆盖图集，请参见 ../themes/moonsprite-dark/material-index.md。
