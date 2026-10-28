# 改画界面素材

> 当前统一排版以 [UI 设计规范](../../../docs/ui-design-spec.md) 为准。下文历史尺寸与其冲突时以规范为准；现有界面整改状态见规范第9节。

用 Aseprite 打开本目录的 **sheet.png**，在原位置改画并保存；重新启动 MoonSprite 查看。不需要重新编译。双击 `native/start-native.bat` 也会加载这里的素材，不要改 build 目录中的副本。

素材按基础像素绘制，软件统一放大 **2 倍**，不做平滑。边框的角保持原样，边和中心按像素平铺。

| 界面位置 | 素材名称 | 左上角 x,y | 尺寸 |
| --- | --- | --- | --- |
| 通用／工具按钮 | 复用 icon_button_normal / hot / selected | 0,64 / 12,64 / 24,64 | 各 11×12 九宫格 |
| 中央工作区外框 | frame | 60,0 | 9×9 |
| 工程标签 | tab | 72,0 | 9×9 |
| 字段底图（当前主界面未使用） | field | 84,0 | 9×9 |
| 右侧选中标签、调色盘标题 | panel_tab_active | 96,0 | 9×9 |
| 右侧未选中标签 | panel_tab_inactive | 108,0 | 9×9 |
| 实际绘图画布边框 | document_frame | 40,16 | 9×9 |
| 前景色显示框 | color_well | 52,16 | 9×9 |
| 通用弹出菜单边框 | dock_frame | 64,16 | 9×9 |
| 栏目外层：底板与边框 | panel_outer | 76,16 | 9×9 |
| 栏目内层：功能内容框 | panel_content | 88,16 | 9×9 |
| 活动标签左侧内拐角 | panel_tab_join_left | 100,16 | 3×3 |
| 活动标签右侧内拐角 | panel_tab_join_right | 104,16 | 3×3 |

这些边框使用独立素材位置，可以分别修改。前景色、调色盘色块和作品像素是实时内容，覆盖在皮肤上；改皮肤不会改变作品。

保持素材位置、尺寸和固定边框厚度时，只改 PNG 即可。若要重新排布图集、扩大图标或调整边框厚度，需同步修改同目录 `theme.xml` 中对应的切片。背景、文字和棋盘格颜色也在该文件的 colors 中；软件布局不由皮肤更改。

例如当前工程标签 tab 是 9×9：左、右、上各 3 像素为固定边框，底部开放；中间只重复纯底色。对应 `w1=3,w2=3,w3=3,h1=3,h2=6,h3=0`。如果仍按旧的 1 像素边框切分，新增的边线会进入中间区域，被重复铺成小方格。软件不会从图片颜色自动判断边框厚度。

也可复制整个目录制作新皮肤，启动时通过 `--theme <theme.xml路径>` 选择其 `theme.xml`。目前重新启动默认仍加载本目录；尚未持久化另选主题的路径。原始 Aseprite 素材保存在相邻 `aseprite-default` 目录，来源及许可见 [ATTRIBUTION.md](ATTRIBUTION.md)。

顶部菜单同样支持皮肤：`menu_popup` 默认复用 dock_frame，`menu_hover` 默认复用 icon_button_hot；可在 theme.xml 中将它们绑定到另画的切片。`menu_item` 和 `menu_bar` 可另设底图，未设置时分别使用 panel 和 background 颜色。

栏目使用两层独立素材：panel_outer 的左／右／上／下固定边框均为 3 像素，中心为 #202635；panel_content 固定边框均为 1 像素，中心为 #171A21。选中标签的底部开放并覆盖栏目顶部边框，未选中标签保持闭合；切换只改变栏目当前内容。

标签与栏目相接的内拐角独立绘制，不平铺；第一个标签左边与栏目外边共用边线，因此只使用右接角。改变标签边框颜色或厚度时，也要同步改画这两个接角及其切片尺寸。


## 通用图标按钮（2026-10-12 更新）

用户原图保存在 `icon-button-reference.png`。新增底图位于 `sheet.png`：常态 `(0,64,11,12)`，悬停 `(12,64,11,12)`；其他活跃切片位置保持不变。

在 `theme.xml` 中修改 `icon_button_normal / icon_button_hot`，九宫格左右上均2px、下3px（包含底部阴影）；原图内容区7×7。默认11px图标使用15×16底图，扣除边框与阴影后为11×11；关闭按钮使用11×12底图、7×7内容区、居中的legacy5px关闭图标。所有图标以原始整数像素显示，不拉伸、不与按钮底图合并。按下/选中/焦点使用悬停底图，禁用使用常态底图+独立禁用图标。

修改底图不会改变关闭图标；该图标来源 `legacy/src/renderer/src/components/PixelUtilityIcon.tsx`，转换结果在 `native/assets/utility-icons/close.svg / close.png`。文字按钮仍使用此前 `text_button_*` 素材。左侧工具栏仍共享1px外黑边，只因阴影而将按钮高调整为16px。旧带 X 的 `dialog_close_normal/hot` 和旧占位 `tool_pencil/tool_eraser` 已按用户要求从 sheet 清空，同时移除本主题 parts/styles。清空区域分别为 `(32,36,11,12)`、`(48,36,11,12)`、`(0,16,16,16)`、`(20,16,16,16)`，不与活跃切片重叠。历史参考 PNG 保留；独立 legacy 工具/关闭图标继续使用。


## 输入框与滑块（2026-10-12 更新）

输入框来源保留 `input-slider-reference.png`；滑块已单独更新为最新 `slider-reference.png`。上方常态、下方聚焦/按下，悬停不切换到下方状态。`sheet.png` y=80 区域仅包含无文字素材：

| 用途 | 坐标与尺寸 | 运行映射 |
| --- | --- | --- |
| 输入常态 / 聚焦 | (0,80,5,18) / (8,80,5,18) | entry.normal / entry.focus |
| 滑块轨道常态 / 聚焦按下 | (16,80,9,18)，聚焦复用 selection.normal/hover | slider.normal |
| 滑块已填充区域 | (40,80,3,12) | slider.fill |

常态素材外侧补透明像素，使聚焦黑边不改变控件大小。输入框示例“输入文字”和滑块“72%”没有烘焙进素材；实际字段内容、光标、选区、数值、填充比例始终动态绘制，Fusion10px/整体2×。修改PNG后重新启动软件加载。

点击工具属性的尺寸/不透明度输入框会显示对应滑块。滑块使用legacy `RangeField.tsx`、`useSliderWheel.ts`、`range-step.ts`：实时更新参数；指针松开（包括区域外）和失焦结束一次交互；滚轮每步1，Shift时尺寸5/百分比10；支持方向/Home/End/Page键。它们修改工具偏好，不修改作品撤销历史。未接全应用的其他滑块领域，不将此视为所有legacy RangeField迁移完成。浏览器原生滑块的触控/可访问性细节尚需后续完整平台验收。


输入框原图以 `codex-clipboard-b0d2647b-4b1e-47f5-8c7d-1b2a860df61c.png` 为准（201×35），SHA256 `5A595AAF9B8631D48A1D6412FB526318E1F0F163BE25F631FA2C1B96E07CACB8`。旧ad9图已替换。新版未填充轨道为#202635，常态黑边与底部#181B23阴影，聚焦外层#63738F边框；填充保留顶部/底部高光，动态文字与比例不变。

### 统一布局间距

普通控件间距和布局留白由 `src/ui_scale.h` 的 `uiGap=2` 控制，即 1× 为 2px、默认 2× 为 4px。覆盖菜单、属性行、工作区、栏目内容、色卡、弹窗和皮肤编辑器。栏目内间距从边框内缘计算（外框 3px、内框 1px 不计入留白）。工具栏 −1px 共边、标签拼接、图标和素材切片尺寸保持原样；展示区宽高、居中对齐产生的剩余空间不作为固定间距。

滑块最新参考是 `codex-clipboard-46774854-d0c1-45fd-97a7-cf1fb67b7f69.png`（119×35），原样保存为 `slider-reference.png`，SHA256 `9C64D70F7006690B6EB98E79C5C74EFDBFA5532B9B17F8F807EDD9868E6743F9`。轨道切片固定左/右各4px、中间1px，保留未填充区两侧 #424F67 内边；上4px/中10px/下4px 包含常态阴影和聚焦外框。常态使用源图 y=0..15 并向上补2px透明，聚焦使用 y=17..34；填充使用无字采样列3/4/82、行20..31。文字色由 slider.normal/focus 的 text 配置控制（默认 #919BA9）；数值和填充比例动态绘制。不会绘制滑块外围背景。

按 bd53ceb4 布局参考，#202635 工作层从顶部属性工具栏开始连续覆盖左工具栏，菜单栏和画布内容保留 #171A21。属性行最下缘至工程/栏目标签及左工具栏为2基础像素；左工具栏至工程区、工程区至右栏目均2基础像素。图标按钮的独立阴影及共边方式保留。

选中素材使用契约：selection.normal/hover是外黑、白、内黑三层边框，透明中心不属于边框命中区。素材正常，不得通过扩大PNG不透明范围解决命中错误。内容边框定位、完整素材外扩与命中分别使用Skin::selectionMaterialBounds/drawSelectionBorder/selectionContains；输入为显示器相对物理像素，绘制由接口转换到逻辑像素。禁止将整个内容矩形contains或控件hasMouse当成素材边框hover。未来复用需要验证实际渲染alpha与判定逐像素一致（含内侧黑边、外扩白/黑边、透明内部、角、外部及整体2×）。

图层配色协调：普通timeline.row及timeline.grid空白区域为#202635，与工作层统一；timeline.active为#171A21，timeline.hover为#2F3136，两者均是sheet底部y576的3×3素材（x0、x4）。原网格、图标与选中素材形状不变；切片登记在sheet-regions.json并由theme.xml引用。源码改为读取这些状态素材。

悬浮配色复核：普通#202635保持，timeline.hover从偏中性的#2F3136改为同色系#2C3445，提高格子悬浮辨识度。timeline.active仍#171A21，各格独立；自动链接格无论是否活动都沿用同一悬浮素材。只修改sheet的hover切片，未改选中素材、网格与图标。

新sheet切片必须同时在theme.xml登记part和引用它的style：运行时只加载style引用的素材，只有part会导致draw静默返回false。timeline.active/hover已补齐style；新增状态必须通过实际状态渲染像素检查。

文字与图标配色（2026-10-15）：主内容统一 #D8DEEA，次要说明/禁用统一 #7E8AA1；文字按钮、时间轴使用同一主色。普通按钮的图标/文字为 128/255 透明度，悬浮、按下或活动时恢复全不透明。图标在绘制时复用 legacy 原始像素形状和 alpha，只统一 UI 墨色；渐变色标、画布轴心、前背景角标、颜色块及指针保持自身配色。按钮背景、边框和选中素材保持现有素材。

输入框切片修正（2026-10-15）：sheet 的 entry_normal 像素与用户 78a8c3c5 参考一致；顶部两行（外框及内阴影）必须固定，h1=2、h2=11、h3=1。原 h1=1 会重复顶部阴影，增高时底部出现额外黑线。文本与可见外框之间留3px；PixelEntry 绘制、光标点击和滚动共用 onGetEntryTextBounds，避免仅绘制偏移。

共享控件更新（2026-10-15）：文字按钮、图标按钮、组合按钮共用用户 bf450a85 提供的四个11×11素材，固定边2px，中心7px重复。正常、正常悬浮、按住未松开、选中分别映射normal/hover/pressed/selected，禁止把pressed当作选中。旧text_button切片和旧icon_button像素已从sheet清除；样式名继续兼容现有调用。开关行与文字按钮共用20px逻辑高度，开关本体仍用原9px素材居中。下拉框只有entry正常底图和右侧dropdown.arrow图标，没有独立箭头按钮背景、描边或状态；左右文字留白与输入框一致。

复选框（2026-10-16）：主体按图标原像素绘制，文字按可见ink居中而非10px字格居中。hover来自物理坐标鼠标消息并主动invalidate，避免依赖HAS_MOUSE更新时间；按住状态仍使用Button捕获／释放／移出取消逻辑，与勾选值分离。16/19/20px高度及奇数窗口原点均进行事件驱动背景像素回归。

输入宽度／复选框高度（2026-10-16）：属性输入按当前文字、原生编辑宽度、单位及6px左右留白自适应；相邻控件推进与实际宽度一致。全文可见时清除旧尺寸遗留scroll，保留caret。复选框悬浮／按住背景上下各内缩2px，与输入框可见底图同高，勾选和文字位置不变。

滑块素材（2026-10-16）：按7c620c7a用户参考替换sheet中的slider_normal/slider_fill。底图取原图无字区域的边缘与空轨道列，填充取左侧无字3×13区域，忽略参考图文字。外黑边、内灰边、填充亮边均固定，中心重复；动态文本与既有拖动／滚轮／键盘逻辑保留。

2026-10-16 补充：属性输入框按允许的最长显示值（含负号、小数、单位、左右6px和caret空间）预留固定宽度，不随当前值变化；无限范围字段保留既有固定槽宽。滚轮优先交给数值输入，不转移焦点，直接同步draft。所有滑块布局使用 textControlHeight=20，与输入框同高；共用上下2px外侧选中素材留白，sheet轨道素材不变。

2026-10-16 用户素材更新：color-role-states-reference.png 左为悬浮、右为按住；dropdown-states-reference.png 左为正常、右为悬浮；switch-background-hover-reference.png 为开关整行背景悬浮。按无文字、无箭头列提取九宫格，保留透明度，文字/箭头仍独立绘制。开关背景和内部按钮分别命中，内部悬浮同时触发背景。

2026-10-16 下拉框用户参考115529dd与当前dropdown-states-reference.png逐像素一致，保留该正常/悬浮素材；共享组件高度统一textControlHeight=20，与输入框同高，外侧上下2px留白一致。

2026-10-16 最新输入框参考4b9d6f1c：input-states-reference.png左正常、右悬浮，entry.normal/entry.hover共享给PixelEntry与PixelDropdown，由同一drawInputFrame绘制。下拉框仅附加独立箭头，距内部右边框留4px；保留选中覆盖素材与输入交互。

2026-10-16 高度与重复阴影修正：输入框、下拉框、复选框按正常素材占满20px，与文字按钮同高，布局不预留上下选中像素。输入框顶端三行（黑框、亮边、内阴影）固定，h1=3/h2=11/h3=2，避免拉高时重复内阴影产生内部黑线。

2026-10-16 后续要求：输入框取消焦点选中外框及其命中，保留正常/悬浮底图、文字选择、caret与编辑行为。

2026-10-16 对齐修正：输入框/下拉框取消左右2px底图内缩，正常素材边框与控件布局边界一致，与弹窗标题、按钮左侧对齐。

2026-10-16 颜色角色按住素材更新：color-role-states-reference.png 右侧替换为用户 c6146008 原图；sheet 的 role_button_pressed 保留黑色外框、白色 alpha=210 描边和黑色 alpha=65 内阴影。九宫格左右固定3px、上3px、下4px，透明中心及文字独立绘制；仅按住未松开时使用。

2026-10-19: dialog_frame source is now 5x25 at (0,36), nine-slice top=20, middle=1, bottom=4. Four copies of the original final header row extend its existing title color; no new colors or replacement assets. Dialogs and floating column chrome share this material; header contains the full title and close controls.

### Ordinary group UI, 2026-10-20

Group name cells and virtual frame cells use the user-requested Aseprite visual reference colors: normal #41444A/#636D79, hover #D9D9D9/#636D79, active #C0C0C0/#41444A and pressed #536069/#C0C0C0. These are independently authored theme tokens; no Aseprite code or art was copied. The surrounding MoonSprite #171A21/#202635 workspace and Fusion Pixel 10px at default 2x remain.

The group's optional display color covers the whole name cell, after the state background; it does not tint visibility/lock/auto-link columns or frame cells. The existing white external selection material draws last. Folder/folderOpen are exact conversions of the opaque and .42 translucent paths in legacy/src/renderer/src/components/PixelUtilityIcon.tsx, using the existing SVG rasterizer. Normal/disabled variants occupy new sheet regions without repacking existing pixels. See sheet-regions.json for replaceable coordinates and provenance.
