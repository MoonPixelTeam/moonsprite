# 创建画布弹窗及弹窗间距

> 当前统一排版以 [UI 设计规范](ui-design-spec.md) 为准。下文历史尺寸与其冲突时以规范为准；现有界面整改状态见规范第9节。

2026-10-15 用户布局：标题左侧6px，标题关闭按钮原位；内容左右各6px。新建弹窗标签行10px，标签至组件2px；名称、宽高（含尺寸预设）、颜色模式（含记录开关）、新建预设各部分间6px。整体默认2×，所有数值是1×逻辑像素。

NewDocumentDialog使用原生PopupWindow和现有Entry、Switch、Dropdown。名称默认“未命名作品”，宽高64×64；六个尺寸预设16×16、32×32、64×64、128×128、256×256、320×180。颜色按钮RGBA/索引/灰度与预设按钮相邻重叠一个逻辑像素，共用黑色描边。RGBA初始选中，记录绘画过程初始关闭。四个彩色图标从legacy/assets/pixel-icons对应SVG按原网格无损转换后加入sheet，索引与校验值在sheet-regions.json。

行为证据：legacy/src/renderer/src/components/NewDocumentDialog.tsx（文案、名称验证、尺寸预设、创建/取消、预设覆盖和删除），core/new-document-presets.ts（列表与同名替换），core/file-preferences.ts（默认尺寸列表），locales/zh-CN.ts（简体文案）。未保存作品仍先经过原保存/放弃/取消流程；进入新弹窗后取消不创建或替换作品。创建先构造完整Document，再替换当前作品；尺寸与名称写入实际Document并继承内置色板。

原生适配与缺口：当前Document只支持RGBA和1–1024px，所以索引色、灰度、缩时记录入口明确置灰，尺寸验证使用实际后端上限；没有将近似RGBA保存伪装为其他模式。RGBA默认与关闭记录为用户明确要求。旧版剪贴板尺寸建议尚未接入。预设由浏览器storage改为原生配置目录new-document-presets-v1.txt，带版本、quoted UTF-8名称、RGBA/record字段；通过原子写入保存，文件损坏时保留源文件并禁用保存。该格式与旧浏览器存储不自动互导。

new-document-dialog检查真实窗口、左右padding、共享边框、默认值、尺寸预设、预设保存/重读/删除、非法名称和创建回调，测试存储隔离在new-document-test-owned目录，不写用户配置。截图new-document-dialog.bmp。源码登记于legacy-provenance.json；覆盖检查不表示全部旧版功能已等价迁移。

验收：正式Release构建完成；new-document-dialog、theme-atlas、checkbox-component、switch-component、window-input-hit-testing共5项通过。已查看真实窗口截图核对布局。来源覆盖183文件通过，diff空白检查通过。

## 后续修正：移除输入框上下按钮、收缩临界值及拖动重绘

用户明确撤回所有输入框上下按钮。PixelEntry彻底移除按钮绘制、预留宽度、命中、捕获和长按定时器，动画设置／循环节／帧时长／图像尺寸／新建画布的绑定同步移除；对应旧按钮专属代码与测试移除。保留输入、表达式、键盘方向键、滚轮及原有侧边拖动。

根因：自定义PopupWindow直接Widget::setBounds改变位置，仅布局新区域，没有复用Aseprite Window::moveWindow的旧区域损伤处理；这与之前在编辑器内部绘制的悬浮栏目是不同的窗口路径。新增PixelPopupWindow公共入口，移动前保存drawable region、布局后重绘新窗口，并通知manager重绘旧区域减新区域。来源native/.cache/aseprite/src/ui/window.cpp Window::moveWindow（MIT）；该方法为private，原生自定义布局采用必要小适配，不改缓存依赖。新建、动画设置（含颜色弹窗）、图层快捷操作均使用此入口。后续可移动弹窗必须继承PixelPopupWindow，禁止绕过其几何入口使用Widget::setBounds。

自适应依据旧ModalShell的preferred尺寸和layout minimum分离：新建窗口宽度最小值来自文案、彩色图标、三模式按钮、底部按钮及左右padding；尺寸预设宽度不足自动换行；高度最小值来自当前换行数和错误提示。八边缩放保持相对边锚点；简单编辑弹窗不再统一限制240逻辑像素。底部按钮顺序创建画布、取消；所有尺寸下底部留6px，已有主弹窗和独立设置弹窗的footer也统一6px。

回归：plain-number-entry核对数字／普通输入同素材、原按钮区域点击不改值且方向键仍生效；new-document-dialog通过真实鼠标消息执行连续移动、极限收缩和放大，逐阶段将局部损伤重绘与下一帧完整manager重绘逐像素比较，检查所有子控件、底部padding和临界值。

本轮验收：正式Release构建完成；plain-number-entry、new-document-dialog、skin-resize-render共3项通过。连续6次移动／极限收缩／放大后，逐帧局部与完整重绘像素一致；实际截图已核对无拖影、无输入框上下按钮、创建在左取消在右、footer距底6px。来源覆盖检查通过。

## 文本控件高度调整（2026-10-15）

按用户要求增加文本按钮与输入框的上下留白。新增共享 textControlHeight=20（1×逻辑像素），用于常规弹窗输入、操作按钮、工具属性控件、新建画布的尺寸／颜色模式／预设。输入控件继续保留原来的选中素材外圈空间，未修改命中语义或字体。独立动画设置、图层快捷操作的底部文本按钮同步采用20px，底部仍6px。新建画布根据增加的高度重算标签、各区块、错误提示和最低窗口高度，图标按钮保持原尺寸。

正式Release构建通过；plain-number-entry、new-document-dialog通过。检查截图确认文字居中、共享描边及控件未裁切；新建弹窗连续缩放／移动的局部与完整重绘回归仍通过。

用户后续要求：记录绘画过程开关行同步20px，预设区向下顺延3px，保持区块间6px。输入底图顶部两行固定避免阴影重复，文字与可见框之间3px；预设下拉框使用单个输入框底图及右侧箭头。四种通用按钮素材区分悬浮、按住与选中。

## 全部弹窗的缩放契约（2026-10-16）

以后新增的设置/编辑弹窗统一继承 PixelPopupWindow，使用默认的四边、四角缩放和标题拖动；按内容提供 minimumDialogSize(width)，不得设置固定最大尺寸。宽度改变后重新计算内容最低高度并重排控件。现有 Editor 内嵌弹窗使用相同语义的 sizeHandleAt/modalMinimumWidth/modalMinimumHeight。菜单、工具列表不是设置弹窗。

尺寸与鼠标坐标均使用显示器相对物理像素；绘制使用逻辑像素，移动/缩放保留旧区域减新区域的失效重绘，禁止直接用 setBoundsQuietly 代替运行时窗口移动。标题及内容左右、底部 padding 为 6px，标签与控件为 2px，表单区块为 6px（1×）。导出文件名与位置选择为真实共享组件，选择目录后直接导出到该目录，已有文件仍确认覆盖；未选择位置时保留系统保存选择器。

## 2026-10-18 弹窗背景与缩放统一

用户指定“新建画布”的背景为全局弹窗背景。统一通过 Skin::drawDialogBackground 调用 sheet 中的 dialog_frame；动画设置、洋葱皮颜色、补间帧、单元格属性、自定义网格、图层快捷设置、工具属性弹窗、颜色编辑、新建画布及编辑器托管弹窗都使用同一入口。栏目内部的 panel_outer 继续只作内容框，不作弹窗外壳。素材缺失明确报错，不用栏目皮肤静默替代。

原生适配沿用 Aseprite ui/window.cpp 的边缘命中→捕获→拖动顺序。Manager 在边缘子控件处理按下之前，先以与 geometryCursor 相同的 geometryEdges 判定交给 PixelPopupWindow，坐标通过 positionForDisplay 转换；内部按钮与输入框不被拦截。窗口内部焦点变化不取消拖动，焦点离开窗口/关闭/释放鼠标才结束。新建画布不再维护第二套拖动状态机。

--dialog-geometry-check 通过真正的 Manager 过滤路由覆盖大小两种弹窗、全部8个边/角、边缘被子按钮覆盖、内部焦点变化、固定对边、捕获释放与内部按钮不拦截，并逐像素核对统一背景与新建画布素材。--new-document-check、--export-dialog-check、--preferences-catalog-check 继续检查既有布局与功能。

## 2026-10-18 公共弹窗组件与内容尺寸下限

- 新的独立弹窗必须继承 `PixelDialog`，不要直接继承 `PixelPopupWindow`。组件的 `onPaint` 是 final，先绘制 sheet 中的 `dialog_frame`，子类只实现 `paintDialogContents`，不能再自行选择外壳背景。背景与内容各自在独立的 `UiPaintScale` 作用域内绘制，避免重复缩放。
- 子类必须实现 `minimumDialogSize(physicalWidth)`，返回显示器相对物理像素的内容下限。宽度压缩导致换行时，重新计算高度；底部按钮与内容必须保留间距。尺寸存档小于新下限时只修正窗口尺寸，不删除用户设置。
- 新建画布按预设按钮的实际列数计算高度；颜色编辑按当前颜色模式计算高度；动画设置展开洋葱皮时扩展到所需高度。列表与首选项沿用各自滚动区域。
- 指针只有实际捕获鼠标的缩放操作才能沿用按下边缘；没有捕获时按当前位置重新命中。弹窗的边缘判定优先于背后的栏目分隔线。
- 行为来源：`legacy/src/renderer/src/components/ModalShell.tsx` 的内容适配、紧凑默认尺寸和布局下限；原生坐标/鼠标捕获适配参照 `.cache/aseprite/src/ui/window.cpp` 与 `manager.cpp`。最新用户要求以内容下限取代之前的 1px 下限。


本轮验证（正式 `build/Release/moonsprite-native.exe`）：构建通过；`--modal-components-check`、`--dialog-geometry-check`、`--new-document-check`、`--color-editor-check`、`--export-dialog-check`、`--preferences-catalog-check` 均退出 0。前者覆盖 18 类编辑器通用弹窗的八个边缘、移开指针、缩放捕获释放、保存尺寸下限及选区/镜像图标按钮对齐；几何检查包含背景逐像素对照、捕获丢失与宽度影响高度下限；新建画布检查包含实际窗口增量重绘与全量重绘一致性和最小尺寸控件包含关系。来源登记覆盖 285 文件通过，这不表示全部 legacy 迁移已完成。

另行运行的旧 `--workspace-check` 在进入弹窗缩放部分之前失败于 `New tab action failed`：该历史检查仍要求点击新标签立即创建工程，而当前行为是先打开新建画布弹窗。未把该综合检查记为通过，未为迁就旧断言改变当前产品行为。

## Floating column shell — 2026-10-19

User reference 0d93ada6 / 6d2c8a37: all floating column shells reuse dialog_frame via FloatingColumnChrome. The sheet title band is 20 logical px (previously 16); the 12px close button at y=4 stays entirely inside; content/actions begin at y=22. Palette, five picker columns, layers and preview share this rule. Single floating labels preserve the header pixels (transparent label backing). Docked frame material is unchanged. Header pixel/close-containment regression is part of dialog-geometry check.

Validation: formal Release build passed; --dialog-geometry-check, --docking-check (including floating move stale-pixel comparison), --new-document-check, --modal-components-check, --color-editor-check passed. Floating screenshot inspected. Provenance coverage 312 files verified. moon-theme-tests on template failed existing inputNormal bitmap height=14 assertion; input assets were not changed here. Docking border check now samples exposed right edge: the old left-edge coordinate is covered by the foreground preview in the fixture.

2026-10-19 follow-up: user removes floating close buttons. Shared layoutFloatingColumnActions places existing actions at title right in 15x15 skin pixels, 2px apart. PixelButton columnHeaderAction renders the existing icon_button sheet directly, removing the #202635 fill and extra bottom row. Picker content starts below title without a redundant toolbar. Existing legacy ColorPanel header/PanelActions ordering retained.

Floating-header follow-up validation: Release executable built and floating screenshot inspected: no close, palette/picker header actions 15x15, no extra lower fill; dialog-geometry and wheel-blend-square checks passed. Docking test source updated for the new no-close requirement. Final rebuild blocked by concurrent crossfade API mismatch (animation_crossfade.h vs cpp, document_crossfade.cpp vs document.h); stopped build, did not change those API definitions. animation_crossfade_dialog setDisplay call adapted to existing two-argument Window API. Provenance check additionally reports new tween_easing_dialog.h/model.h unregistered. Final full docking rerun remains pending.
