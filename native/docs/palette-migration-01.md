# 色卡迁移第一批

2026-10-12；必要功能 DR-009 的部分原生实现，不能视为完整颜色领域验收。

## 已接入与证据

- `workspace-palette.ts`：RGBA 色卡稳定 ID、可见顺序和空槽；重复色/透明色独立 ID；删除保留 entry；新增恢复 allocator；重命名 trim；修改色卡颜色。
- `workspace-palette.ts` 与 `workspace-palette-history.test.ts`：与笔画使用同一文档历史，色卡不复制像素；选色不进入历史，新增/删除/重命名/改色可撤销重做。颜色编辑只记录单 entry，删除只记录布局/选择，新色卡记录小型色卡结构。
- `document-model.ts/createDocument`：默认 RGBA 两色，墨黑 24,27,33 和月蓝 41,121,255。
- `PalettePanel.tsx/beginPaletteDrag`：左键单选、Ctrl/Meta 切换、Shift 按二维矩形选范围、右键设置次色；空槽双击添加当前前景，已有色卡双击打开名称弹窗，确认/取消及 Escape。
- `workspace-commands-color.ts`：锁定默认开启，角色改色不改色卡；解锁修改已绑定且颜色匹配的色卡。锁不是禁用新增/删除。解锁新增不选中。
- `ColorValueControl.tsx`、`color-values.ts`：HEX 6/8 位，6位保留alpha；Enter、失焦、关闭提交；非法文本恢复当前颜色。原生使用当前皮肤小弹窗和 Fusion 输入控件，不调用系统颜色对话框。
- 五档尺寸与 Ctrl+滚轮保持前批逻辑；普通滚轮在面板溢出时移动行，空白区域双击也能新增。
- 锁图标直接从 `PixelUtilityIcon.tsx` 提取，使用既有格式转换器，未修改用户 sheet.png。

## 本批原生适配与未迁移

当前只有一个内存 RGBA 文档。角色状态暂与原型 Document 一起保存，但选择及角色改色（锁定）不影响作品历史；未来多会话接入必须承接 shared 角色与偏好。角色 HEX 入口暂在色卡工具条，完整 ColorPanel 仍未迁移；缺 HSV/HSL/CMYK/RGBA 通道滑杆、采样、完整色轮。

未迁移：手动槽位布局、拖选/长按/拖动换位、边界增长、完整轮廓/角色角标、复制粘贴、排序/反向/渐变、色卡库/提取/导入导出、显示名称、索引色 remap、同步RGBA作品颜色、多工程共享颜色、角色偏好持久化。原生普通滚动按行步进，尚不等价浏览器连续滚动。工程保存与恢复尚未实现；关闭仍提示未保存，不声称这些色卡已可保存到工程。

## 验证

`moon-core-tests`：新增稳定 ID、删除保留 entries/槽位、nextId 撤销恢复、重复透明色、二维选择、无操作历史、锁语义、重命名、颜色与笔画交错撤销；原有像素/坐标检查仍通过。

`moonsprite-native --smoke`：五档尺寸、Ctrl+滚轮、预览切换、名称确认取消、HEX合法/非法/保留alpha、解锁修改绑定色、空槽添加、超过视口时隐藏与滚动、不改变作品像素；已有菜单/画布导航/主题弹窗检查继续通过。实际 smoke.png 已目检。程序化事件检查不等于手工完整键盘/IME、拖放和长时间稳定性验收。

来源覆盖脚本通过不代表所有行为等价；strict 必须继续失败。


## 2026-10-14 连续交互补齐

来源：`PalettePanel.tsx/beginPaletteDrag/movePalettePointer/finishPaletteSelection/startPaletteMove`、`palette-layout.ts/repositionPaletteSlots`、`workspace-palette.ts/pastePaletteColors`、`workspace-commands-color.ts/selectSecondaryPaletteColor`、`palette-clipboard.ts`。

- 左键拖动立即进入矩形框选；长按 360ms 同样进入框选。右键跨格连续设置背景色并单选对应色，保留前景色。
- 从选中素材可见边框拖动移动选中色，保留二维相对位置，将被占用的目标颜色移回腾出的槽。预览不写历史，释放提交一次，Escape/失焦取消。
- 颜色板获得焦点后 Ctrl+C/V 及编辑菜单使用颜色剪贴板；按可见槽顺序复制，单目标连续粘贴，多目标对应覆盖，无目标追加；支持空槽、重复色、透明色和一笔撤销恢复。
- 系统剪贴板复用 MIT clip，输出旧版 V1 RGBA JSON；系统不可用时保留进程内副本。

适配限制仍保留：当前沿用已有自适应列数及逐格选中素材；多色联合外轮廓、完整手动布局、虚拟空区、边界增长/缩减、V2 二维剪贴板布局、颜色库及排序/渐变菜单未在本轮迁移。移动预览只在当前可见槽位内定位。不得据此声明颜色板已与旧版全面等价。

检查：document-transactions、palette-mouse-startup 通过，覆盖矩形框选/右键连续采样/取消、二维换位和 displaced 回填、覆盖/空槽粘贴及撤销重做。额外 selection-interactions 在合并预览栏目标签像素检查失败（Preview content erased merged label pixels），与颜色板定向测试分开记录。


## 2026-10-15 框选轮廓修正

用户要求拖动框选仅用一个选中框。参考 `PalettePanel.tsx` 的选择范围与 `PaletteSelectionOutline.tsx` 的独立轮廓层：多色范围使用覆盖整个范围的透明 overlay，色格只保留原黑色格线；单色沿用原素材。正常/悬浮绘制与边框命中统一使用 Skin 三个接口，透明中心仍交给原色格接收点击；浮动栏目移动同步偏移轮廓。选区释放后继续保留共同外框。

定向回归覆盖五档尺寸的逐像素绘制 alpha/命中一致性、内部格线不触发边框悬浮、透明中心不拦截点击、轮廓位于颜色上方。非矩形离散选择暂按整体包围范围显示，尚未迁移旧版任意形状轮廓。

2026-10-14 用户f46b1ccb/a846cd35要求统一颜色板顶部：无论调色盘显示、隐藏或作为非活动合并标签，颜色板均只显示操作和锁定按钮。取消调色盘未显示时额外出现前景色/背景色色块的备用显示分支，保留调色盘自身角色颜色控件与颜色数据。色格列数继续按栏目宽度自动换行，所有皮肤素材仍复用sheet。


## 2026-10-15 拖到空白区域与阶梯外轮廓

按用户红框纠正：`paletteSlotAt` 保留虚拟空白行上的鼠标列，不再将二维终点钳制为最后槽位。选择仍仅包含范围内真实颜色。依据旧版 `paletteSelectionBoundaryEdges`，提取选中色格周边无选中邻居的边，合并同方向连续线段，以现有选中素材裁剪绘制边缘；内部共用线不描白框，末行不满与空槽产生转折，离散选择各自保留外缘。绘制与命中使用同一线段与裁剪，继续复用 Skin 三接口。五档尺寸覆盖矩形/阶梯轮廓 alpha 与命中一致性，以及拖到右下空白区域不漏选列。

2026-10-15 用户要求补齐选择色板按钮并重新排布：左侧锁定/解锁，右侧选择本地色板→颜色板操作，右侧两按钮复用iconGroup并以14px步长布置15px宽按钮，共用1px描边。来源为legacy PalettePanel.tsx 1036–1039，图标为PixelUtilityIcon.tsx paletteLocal，原始SVG栅格由既有转换器无损转换后进入sheet (480,620)、(492,620)。本地色板库的列表、导入和应用尚未迁移，新增入口明确禁用，操作按钮沿用现有功能。


## 2026-10-15 内凹转角修复

内凹端点延伸直边取样范围，避免复用矩形外凸角；交叠处按距离边界最近的线段分配裁剪片，防止外侧黑边覆盖相邻白线。显示与命中共享这些裁剪片，浮动移动同步偏移。来源仍为 PaletteSelectionOutline.tsx 的 inside/outside 轮廓分层语义，保留用户现有选中素材。


## 2026-10-15 内角凸刺二次修正

依据用户 b469a497 错误图与 30c8a40e 正确图，对选中色格联合区域做内部裁剪，禁止延长直边侵入联合区域内部。内部共用格线和内角三个已选象限不绘制选中素材，留下连续折线。五档尺寸增加内角凸刺断言，保留逐像素 alpha/命中检查。palette-mouse-startup 通过；已检查生成的 build/Release/palette-concave-outline.bmp，内角折线连续，无向内部伸出的凸刺。

最终验收：正式Release构建成功，palette-mouse-startup与panel-docking-interactions两项通过。运行时登记paletteLocal正常/禁用图标，真实渲染截图确认左侧锁定、右侧选择本地色板和操作按钮、共用描边；本地色板库尚未迁移，入口保持禁用。

2026-10-15 用户要求先补齐操作菜单选项：按legacy PalettePanel.tsx:1144、PALETTE_SORT_OPTIONS与zh-CN翻译保留分组顺序。布局自适应/自定义；提取颜色、显示颜色名称、同步颜色；排序与渐变子菜单含反向颜色、渐变、色调渐变、八种排序、升序/降序；五档色块尺寸；保存色板。现有自适应、提取和尺寸可用，其余未接入项禁用，子菜单可打开查看。排序/渐变的动态颜色预览尚未迁移，不宣称全部功能完成。moreLines图标直接转换旧版路径进入sheet (448,620)/(460,620)，不新绘图标。

本批正式Release构建成功，palette-mouse-startup通过，来源覆盖143文件和diff空白检查通过；未声明禁用项的行为迁移完成。

2026-10-15 滚动条实装：颜色板内容溢出时显示右侧7px（1×）滚动条，预留独立内容宽度并重新计算列数，未溢出时隐藏且恢复顶部。滚轮与滑块共用物理像素偏移paletteScrollPixels状态，拖动不按色格行量化，滚轮仍按一行步进。PixelScrollBar直接继承Aseprite UI的ScrollBar（native/.cache/aseprite/src/ui/scroll_bar.h/cpp，ui/LICENSE.txt为MIT），复用鼠标捕获、拖动比例和轨道半页点击；仅适配物理像素单位delegate与sheet绘制，部分露出的色格按同一物理viewport裁剪并命中。悬浮效果仅作用于滑块，坐标为显示器相对物理像素；停靠/悬浮栏目的层级和搬运范围均包含它。调色盘当前内容随尺寸适配无溢出，不添加空滚动条。既有palette mouse smoke加入小窗口、奇数物理原点、悬浮栏目、拖动/释放、滚轮、hover素材像素、无文档历史/版本变化及内容适配后隐藏检查。

2026-10-15 全区域滚动条：用户要求扩展至当前所有可滚动内容：颜色板、时间轴横/纵轴、画布横/纵平移、工具属性单行、窄窗口工具栏、首页列表、长错误提示。复用同一 PixelScrollBar/Aseprite UI MIT 状态机与sheet素材，均以物理像素偏移拖动，滚轮保持区域原语义；超出viewport的绘制与命中同步裁剪。时间轴固定帧头高度/名称宽度，列头随横滚、名称随纵滚、cel随两轴；悬浮栏目搬运和焦点排序包含滚动条。PreviewPanel当前fit-only、调色盘自适应不产生滚动内容；UI Theme的默认滚动条绘制也接入相同sheet，后续UI View自动继承素材。

首选项分类与内容分别接入纵向滚动条，固定标题与操作区保持可见；部分露出的按钮、输入框和下拉框以物理 viewport 同步裁剪绘制与输入。时间轴选择轮廓在缩放绘制前应用物理裁剪，保留非整行、非整列滚动偏移。

浮动栏目复测发现同一原生窗口内的后方背景、色格独立重绘会覆盖前方预览边缘。按 Aseprite Widget::getDrawableRegion/Window::moveWindow 的遮挡语义补齐同级栏目的焦点顺序裁剪，背景层与控件独立重绘均遵守同一遮挡关系，保留 clean software move_region 搬运。现有真实窗口检查覆盖连续移动、重叠与调整尺寸，增量帧与完整重绘逐像素一致。

最终验证：正式 Release 构建成功；layers-render、workspace-layout、panel-docking-interactions、palette-mouse-startup、selection-interactions、home-workspace 六项通过；--preferences-check 退出码0。来源覆盖检查通过（144文件），整体 legacy 功能迁移仍为 INCOMPLETE。

2026-10-15 用户要求滚动条与停靠区域共用黑边：所有已接入区域统一通过 PixelScrollBar::setDockBounds 布置，横向向下、纵向向右重叠1基础像素（默认2×为2物理像素）。移动完整控件而非只偏移贴图，轨道、滑块、悬浮判定与捕获共用同一物理原点；保留sheet素材、控件厚度、滚动页大小和范围。

2026-10-15 scrollbar edge correction: sheet track pixels are opaque black; the #171A21 line was exposed parent background after the outward offset. Extend the sheet track one base pixel back to the original content edge, retaining the outward-shifted 7px thumb. Widget bounds include this black strip, so independent redraws and floating movement cover it too.

2026-10-15 final scrollbar geometry correction: retain the original 7px sheet track and thumb, reserve 6px beside content so the outer pixel shares the frame. Remove the previous extra black strip and cross-axis thumb inset. Tool properties no longer create a scrollbar or reserve a row above the canvas; retain horizontal wheel navigation and physical clipping when options overflow.

2026-10-15 frame alignment follow-up: palette/preferences place full 7px sheet track within actual content frame through PixelScrollBar::edgeBounds. Canvas retains shared outer edge geometry. Timeline vertical top shares header black edge (up1px), body bottom reserves the correct frame layers (horizontal up2px); content viewport and scroll range derive from the same shortened body. Timeline materials composite together at 128/255 alpha using a reused offscreen surface, so thumb/track intersections do not become more opaque; the editor redraws only the clipped underlying timeline before blending, retaining an opaque widget invalidation region. Positive native vertical wheel delta now advances layer offset on both timeline content and vertical scrollbar. Regression checks cover exact frame edges, 7px thickness, rendered alpha and wheel direction at odd display origin.

Validation: official Release build and layers-render, workspace-layout, panel-docking-interactions, palette-mouse-startup passed. Preview software-move regression now permits repaint only for newly visible pixels without a drawable source when crossing viewport edges; it still rejects repaint of reusable copied pixels. No preview movement behavior or sheet assets changed in this adjustment.
