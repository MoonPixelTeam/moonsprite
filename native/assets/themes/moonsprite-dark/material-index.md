# 集中 UI 素材索引

编辑 `sheet.png` 的命名区域；`theme.xml` 定义坐标、九宫格和颜色。完整逐区域坐标、来源及使用点见 `sheet-regions.json`，包含原有皮肤区域、tool/utility 图标、颜色选择标记及 27 张指针图片。原始 128×120 皮肤区域保留。默认主题优先读取 atlas；旧主题缺少新区域时使用原 PNG fallback。

指针热点与 38 个语义 ID 保留在 `../../cursors/cursors.txt`，图片由 `cursor.*` 区域提供；热点以原图像素计，指针不随 2× UI 再放大。自定义指针目录仍独立。图片全部逐像素保留转换后的 RGBA；未迁移工具的图片存在不代表功能完成。

来源：工具 SVG 来自 legacy/src/renderer/src/assets/tool-icons；utility 路径来自 legacy/src/renderer/src/components/PixelUtilityIcon.tsx；指针来自 legacy/src/renderer/src/platform/cursor-theme.ts 的 imports。具体文件见 JSON。颜色选择标记来自用户提供原图，见 ../../color-picker/README.md。皮肤基底、timeline、menu 由已确认用户参考和现有渲染提取，非 legacy 图标新设计。Aseprite 裁图许可见 ATTRIBUTION.md；legacy 素材沿用仓库既有授权，不能据此另行声明第三方开放授权。

明确例外：Fusion Pixel 字库和字体许可保留在字体目录；文字由字体渲染。作品像素、选区/画笔轮廓、棋盘格、用户调色板颜色、实时 SV/色相/透明度渐变属于数据或动态渲染，不固定烘焙进 sheet。颜色角色仍由 theme.xml 控制。尚未接入的隐藏功能不在本次静态 UI 覆盖内；本次不代表全部 legacy UI 已迁移。

修改 atlas 或热点后重新启动 native/start-native.bat。独立 tool/utility/color-picker PNG 是来源与兼容副本，默认主题实际显示优先使用 sheet；仅修改这些副本不会覆盖已存在的 atlas 区域。导入脚本属于一次性操作，不要用于覆盖用户改画的 sheet。

2026-10-14：图标按钮采用用户提供的 `icon-button-reference.png` 三态原图（35×12）；sheet 坐标为 (0,64)、(12,64)、(24,64)，各 11×12。依次用于正常、悬浮、按下/选中；九宫格、按钮尺寸及图标位置不变。

2026-10-14：工程标签按用户 `project-tab-reference.png` 更新颜色与高度（15→16px），两格 7×16 分别为活动和未活动；sheet 位于 (0,580)、(8,580)，九宫格上下为 2/13/1、左右为 1/5/1。新建按钮复用未活动标签；工程标签高度独立于栏目标题高度。

Dropdown: user dropdown-reference.png (134x16). Text-free field edge/center columns 0,1,44,45,46 packed at (0,600), 5x16; exact arrow button at (48,600), 15x16. PixelDropdown paints a full-width entry.normal input first, then overlays the arrow on its right end and uses the existing native menu for options. Loop-section direction is the first consumer.

Atlas copy correction: expanding sheet must copy exact ARGB pixels (SetPixel/GetPixel or source-mode memory copy), never Graphics.DrawImageUnscaled with its default blending/pixel offset. The latter resamples source edges and introduces repeating stripes in nine-slice backgrounds. Restored original regions exactly, retaining the user icon-button, project-tab and dropdown updates. Verified 304492 unchanged original pixels.

Input correction: entry-reference.png supplies the 14px field; text-free columns 0,1,65,67,68 are packed at (0,80). Old entry_focus pixels, part and style removed. Entry and dropdown field reserve the shared selection material exterior within widget bounds, reuse Skin selection APIs, and keep the dropdown arrow outside the selection.

Slider focus: removed slider_focus part/style and cleared its old atlas pixels (28,80,9,18). Focus/press reuse selection.normal/hover with the inner black edge aligned to the normal track border; reserve the two exterior pixels at all times.

Dropdown interaction correction: right overlay reuses icon_button normal/hover/pressed/disabled nine-slices; dropdown.arrow only crops the original 5x3 chevron at (53,606). Field uses entry.normal and shared selection normal/hover. No combined dropdown state material is generated.

Dropdown stacking: shared selection border draws last above both existing input and overlaid button; its visible alpha takes hover priority, button interior retains button states.

Latest dropdown revision: remove selection overlay; existing icon_button states respond only to the right button itself. Chevron is centered in 15x16 button, without vertical offset.

Tool rail material deduplication: tools and horizontal flyouts explicitly reuse shared icon_button normal/hover/pressed/selected/disabled. Removed old 9x9 button_normal/hot/selected/disabled/focused parts and cleared atlas rectangles (0,0),(12,0),(24,0),(36,0),(48,0), each9x9. Compatibility button styles and menu hover reference existing shared parts; tool glyphs remain unchanged.

2026-10-14：未活动栏目标签来源 panel-tab-inactive-reference.png（用户fa373ed7）。从原图无文字边缘提取 #000000 单像素描边、#202635 背景，更新 sheet (108,0,9,9)，保留1/7/1九宫格；文字动态渲染，与活动标签共用位置。

2026-10-15：选择本地色板图标paletteLocal直接转换legacy PixelUtilityIcon.tsx对应路径；正常/禁用状态进入sheet (480,620)、(492,620)，各11×11。SVG与PNG来源副本位于assets/utility-icons；没有重画图标。

2026-10-15：颜色板排序与渐变菜单使用legacy PixelUtilityIcon.tsx moreLines；正常/禁用图标无损栅格转换为sheet (448,620)/(460,620)，各11×11。

2026-10-15 滚动条素材：用户scrollbar-reference.png四组中，第一组仅为组合示意；sheet实际存储轨道、悬浮滑块、正常滑块，并按像素旋转提供纵向版本。horizontal track/hover/normal位于(320,620)/(336,620)/(352,620)，vertical位于(368,620)/(380,620)/(392,620)。轨道总厚度7px（1×）、滑块可见厚度5px，正常#424F67、悬浮#63738F。滑块透明的1px侧沿保留轨道描边；仅沿滚动轴拉伸，中间纯色区域可重复。组合时横向滑块在轨道长度方向内缩1px，厚度方向不内缩；纵向同理。不要把第一组组合图再作为独立滑块使用。本轮仅加入皮肤素材，滚动条控件及交互未在此任务迁移。

本批验证：六块素材490像素与原图裁剪/旋转逐像素一致，正常组合91像素与原图第一组完全一致；theme-atlas通过，来源覆盖检查通过。正式程序构建未完成，当前main.cpp偏好设置相关代码有protected/private访问及菜单caption成员错误；本批不声明控件实装或正式程序已更新。

2026-10-28：自由瓦片实例视图返回按钮复用 legacy/src/renderer/src/components/PixelUtilityIcon.tsx 的 left 原始5×5路径，与 LayersPanel.tsx 的返回按钮一致。正常/禁用状态逐像素转入 sheet (48,764)/(60,764)，各5×5；对应 icon.left/icon.left-disabled，可直接替换素材。原始路径转存 assets/utility-icons/left.svg，未重画图标。

### 自由瓦片实例右键图标

来源：`legacy/src/renderer/src/components/PixelUtilityIcon.tsx`，保留路径及透明度。

- `icon.rotateClockwise90`：sheet `(72,764,11,11)`。
- `icon.rotateClockwise90-disabled`：sheet `(84,764,11,11)`。
- `icon.selectionFlipHorizontal`：sheet `(96,764,11,11)`。
- `icon.selectionFlipHorizontal-disabled`：sheet `(108,764,11,11)`。
- `icon.selectionFlipVertical`：sheet `(120,764,11,11)`。
- `icon.selectionFlipVertical-disabled`：sheet `(132,764,11,11)`。
