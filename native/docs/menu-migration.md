# 顶部菜单迁移交付

2026-10-13窗口化右键菜单定位：原生get_mouse_position返回屏幕坐标，而Menu::showPopup/fit_bounds的锚点要求parentDisplay内坐标。栏目、图层与洋葱皮菜单统一通过父窗口pointFromScreen转换，恢复legacy clientX/clientY的可观察定位语义。控件锚定菜单本来就是窗口内坐标，不重复转换；边缘避让继续由MIT fit_bounds完成。workspace-layout增加实际弹出菜单检查：移动测试窗口至两个非零位置（含负X），验证中央菜单贴着指针锚点、右下角菜单留在工作区内；测试恢复原位置、不移动系统鼠标、不保存用户偏好。

2026-10-13栏目拖拽指针：核对legacy styles.css的`.panel > header`、`.floating-panel-dragging`及`.modal > header`均使用`--cursor-move`。预览标题悬浮与拖动、弹窗标题移动现复用原`14-Slice-11.png`四向移动指针与(3,3)热点，素材与legacy字节相同；关闭按钮使用默认指针，边缘/四角缩放优先使用对应resize指针。画布平移的grab/grabbing语义保持。定向工作区验证增加标题悬浮和捕获拖动的move指针断言；模拟拖动完成后立即释放捕获，避免实际鼠标移动干扰跨帧回归检查。

2026-10-13继续优化栏目拖动：上一轮固定16ms等待与每帧重新画预览仍会增加延迟。现直接复用MIT Aseprite `ui::move_region`的软件后备层`scrollTo`路径，平移已绘制浮窗像素，仅重画露出背景；尺寸变化、GPU或源区域尚待重绘时回退正常绘制。通过Aseprite Manager每批OS事件末尾仅生成一次的SetCursor消息同步应用最新几何，再由同一次dispatch完成绘制与显示，16ms计时器仅作无批末消息时的后备。浮窗位置支持单设备像素，皮肤尺寸保持2×。workspace-layout通过：200个输入合并成一次同步更新，四次平移实际调用move_region且预览内容重绘次数为零，单像素继续移动正确，六次移动/缩放与全量重绘逐像素一致。本机批末更新耗时约0.14–0.31ms，仅几何/像素搬移/失效标记和光标处理，不含屏幕呈现；结果保存在build/drag-performance.txt，不作为实际用户帧率声明。

2026-10-13拖动与缩放性能：对照MIT Aseprite `ui/window.cpp::Window::moveWindow`，预览平移使用现有`offsetWidgets`，仅尺寸变化才重新排关闭按钮；父工作区只重绘旧区域减去新区域的露出部分。与Aseprite GPU路径一致，不读取屏幕像素搬运浮窗。依据legacy `useAppWorkspaceLayout.ts::createResizeFrame` 的push/flush方式，用原生16ms计时器合并最新指针位置，松手立即应用最终位置，再保存尺寸。栏目拖动仅更新受影响的颜色区/图层栏，弹窗仅更新自身控件与旧、新矩形，取消拖动路径的重复全界面布局、菜单校验和颜色状态同步。未变化或达到边界时跳过布局。定向验收包含200次移动事件合并检查、实际计时器应用最新位置，以及六次移动/放大/缩小的局部重绘与完整帧缓冲逐像素一致检查；不将减少重复工作描述为实测用户机器帧率保证。

2026-10-13预览拖影修复：原生Widget移动只标记新位置重绘，旧位置留在帧缓冲中。预览浮窗在位置或尺寸变化时同时标记父工作区的旧、新占用区域，覆盖标题拖动、缩小及窗口边界约束。Release构建与workspace-layout通过：六次跨帧移动/放大/缩小后，局部重绘结果与随后完整重绘的实际窗口帧缓冲逐像素一致；验证不保存用户布局偏好。

当前是菜单目录与接线基础，不能将目录注册或灰项算成底层功能完成。独立 Release 合同测试通过；未跑完整 UI，main 片段需主集成验证。

## 范围

7 个 legacy 顶类，142 个静态叶子候选，32 个含顶层的目录节点。条件出现的组/图层蒙版项分别计数；最近文件、脚本、扩展菜单/面板是动态槽位，不计为固定数量。每类叶子数量：{"file": 15, "edit": 40, "select": 7, "canvas": 11, "layer": 29, "window": 33, "help": 7}

来源：legacy/src/renderer/src/components/app/AppMenuBar.tsx（284–330）、EditMenuCommands.tsx、LayerMenuCommands.tsx；shortcuts默认由 core/shortcut-contracts.ts直接提取；菜单中文修正在locales/zh-CN.ts核对。条件标签（隐藏/显示选区、启用/禁用样式等）catalog 为中性名称；真正接线时需绑定实时文案，当前不视为完成迁移。菜单扩展贡献点由core/extension-contributions及AppMenuBar.test.tsx约束，native没有运行时，未冒充兼容。

## 能立即接线的范围

new/open/save/saveAs + undo/redo 共6项有实际命令。首选项仅恢复参数；图层属性仅已有不透明度/可见基础，不是完整properties。复位视图需新增原生坐标适配：AppMenuBar.ts308明确zoom16/pan0/rotation0/双镜像false；view-geometry.ts displayedCanvasCenter是viewport中心+pan。native无旋转镜像状态，所以当前重置zoom16和viewport居中即对应已有能力；未来旋转镜像必须一并清除。F适应视图保留既有操作，但不可冒用resetView（legacy默认无快捷）。redo默认Ctrl+Shift+Z，现Ctrl+Y不是默认。

文件→恢复工程是已确认原生适配入口，catalog只包含legacy目录，所以集成应保留。恢复设置搬到编辑→首选项；对话框应说明当前只迁移恢复设置。删除窗口→皮肤和SkinStudio；外部皮肤运行加载保持。调色盘popup不等价legacy栏目显隐，不自动冒用toggleColorPanel。色卡/前背景角色修改只属于旧组件入口，不新造顶栏选项。

## 未迁核心与依赖

|领域|底层依赖与当前缺口|
|---|---|
|文件|最近记录/启动路径、工程备份回档、精灵表导入导出、动画导出、缩时、项目信息、Lua脚本运行与脚本目录|
|编辑|按selection→masks→cels→frames→layers优先级的剪切复制粘贴、系统剪贴板/浮动粘贴、填充/描边、选区与内容变换、居中、反色替换/调整/卷积及滤镜、完整快捷键和首选项|
|选择|选区状态与历史、待提交粘贴、全选/反选/自由变换/边界显示、笔刷和背景资产生成|
|图像|rgba/indexed/grayscale转换、画布/图像尺寸与重采样、等距变换与设置、裁剪/跨帧trim|
|图层|多图层/组/链接/瓦片/背景/调整层、合并组/选中/可见、剪贴蒙版与图层组蒙版/移动绑定、效果样式及完整属性|
|窗口|全屏平台调用、网格/切片/相对明暗渲染、对齐与辅助线、平铺、旋转双镜像、各栏目持久显隐、工具栏四边、高级模式|
|帮助|原帮助/技巧内容、组件库、发行日志、统计、诊断、关于（不能假命令只报状态完成）|

Enabled不可只检查存在工程：undo/redo看历史；exportAllFrames>=2帧；openFolder需路径；selection项需选区；layer读取selectedRowsForProperties/unsupported/owner kind/mask/styles/lock/clipboard，多选merge与mask规则均在LayerMenuCommands；脚本需session且不running；部分全局帮助/首选项无session可用。Commands模块只执行实际绑定且enabled的run，不把缺binding当成功；具体业务守卫必须复用旧语义。

## 集成

添加src/menu_catalog.h/cpp、tests/menu_catalog_test.cpp并登记provenance（三源AppMenuBar/EditMenuCommands/LayerMenuCommands及shortcut-contracts、菜单test）。main-menu-integration.cpp.txt是局部接线片段，不覆盖主main；片段未通过全UI编译，集成人需统一自己的函数/菜单smokeID。源码文件无需legacy第三方许可改变。

集成结果：13项绑定=新建/打开/保存/另存为/撤销/重做/复位视图/颜色显隐/颜色板显隐/图层显隐/预览显隐，加首选项(仅恢复参数)、图层属性(仅opacity)2项部分能力。另文件恢复工程为原生已授权适配。142中11完整接线、2部分、129未迁；动态最近/脚本/扩展另计。未接部分按最新用户要求全部灰显显示，不能把catalog当作全迁移。

最新验收：7类菜单及142静态条件分支并集全部可见、无handler灰显不可执行，目录可展开；最近/脚本空态复用旧文案。业务仍11接线/2部分/129未迁，不能称142业务完成。

2026-10-13菜单横线：对照上述三份legacy菜单组件，恢复27处静态功能分组（含脚本空态、滤镜、绘制视角、新建图层、图层样式子菜单）。横线为主题border颜色、1基础像素厚，左右uiGap内缩；使用MIT MenuSeparator跳过鼠标与键盘触发。现有7顶类和142叶子、入口顺序不变，动态扩展分隔仍待扩展运行时迁移。

2026-10-13工作区布局：颜色板与调色盘移到左工具栏右侧；预览改应用内独立浮窗，保留原生已实现的当前作品适应窗口预览。标题拖动、边缘/角缩放及关闭重开承接legacy浮动面板参数，本会话保留位置；“窗口→栏目→预览”与色板独立显隐。完整预览导航及重新停靠仍未迁移（跨会话尺寸与位置持久化见下方增量），不将本次布局当作完整PreviewPanel迁移。定向验收workspace-layout检查720×600/1280×960/1600×1000与作品/撤销/画布缩放不变。

2026-10-13尺寸调整：现有原生弹窗支持四边/四角缩放、标题移动；按钮保持底部对齐，输入与滑块宽度随框体调整。左侧颜色区与画布之间可拖动宽度，颜色板/调色盘分界可调整高度比例，底部图层栏上边界可调整高度。复用legacy resize光标；鼠标松开、Escape或失焦结束捕获。尺寸保存到%LOCALAPPDATA%/MoonSprite/Native/workspace-sizes.txt，包括预览浮窗和各类现有弹窗，测试不写用户偏好。依据ModalShell.tsx、floating-panel.tsx、WorkspacePanels.tsx、EditorWorkspaceShell.tsx、useAppWorkspaceLayout.ts及workspace-layout/panel偏好契约。固定2×原生控件需保留可操作最小区域：颜色区116、颜色板70、调色盘100、图层栏65、画布宽160/高100、弹窗宽240（均逻辑像素）；与旧版可铺满侧栏和更小物理最小尺寸存在已记录适配差异。完整停靠、拖拽排序及浮窗跨分辨率比例位置映射仍未迁移。

### 2026-10-14 弹窗按内容自适应

- 对照 Aseprite MIT `ui/window.cpp` 的内容尺寸提示、`ui/box.cpp` 的有效子项布局、`ui/textbox.cpp` 的可用宽度换行；直接复用 `ui/fit_bounds.cpp::limit_with_workarea`，将弹窗限制到当前应用窗口内。
- 默认宽度按 Fusion 10px 文字和控件需要计算，不再统一固定 320 逻辑像素。手动尺寸保留，缩小主窗口时限制位置及尺寸。按钮根据当前业务的 1/2/3 个动作居中。
- 错误信息按可用宽度完整换行，默认高度根据内容增长，最多占当前窗口高度的 3/4；超长信息支持滚轮及可见滚动位置提示，不再截掉末尾。普通滚轮步长沿用 Aseprite View 的三行文字。
- 必要适配：继续使用现有嵌入式弹窗、BDF 中文字体和像素皮肤；未替换为 Aseprite 独立 Window/TextBox，滚动提示目前不提供拖动滑块。
- 实际运行验收：Release 构建及 `--modal-layout-check` 单独验收，覆盖 720×600 / 1600×1000、完整错误换行、滚动至最后一行、单按钮居中、过大持久化尺寸约束；拖动/八方向缩放与文档无变更断言通过；完整 `workspace-layout` 的后续预览增量像素检查在 phase 4 失败，不能报告整个测试通过。

### 2026-10-14 Aseprite 蚂蚁线

- 直接复用 Aseprite MIT `ui/paint.cpp::set_checkered_paint_mode`：8×8 对角黑白图案，黑/白各 4 屏幕像素，0–7 相位循环。线宽为 1 设备像素，图案不跟随画布缩放。
- 100ms 推进一格；选区不存在、文档未显示或编辑器不可见时停止。重绘范围限制到可见选区包围区域。选区轮廓支持矩形、非规则掩码和内部孔洞。
- 原生适配：保留现有 SelectionMask 和业务操作，通过屏幕坐标 gfx::Path 绘制。Aseprite 编辑器 EULA 源码只用于核对可观察节奏/缩放效果，没有复制其源码；直接复用的 shader 和路径接口为 MIT。
- 验证：Release 程序 `--ants-check` 通过，覆盖 0.5/1/2/8 倍屏幕缩放、相位反转及完整循环、1px 线宽、孔洞轮廓、绘制不改变文档历史。正式产物已包含新绘制代码。

### 2026-10-14 选区指针对照旧版

- 对照 `useCanvasCursor.ts`、`canvas-selection-handle-cursor.ts` 和 `core/canvas-visuals.ts`：选区边界移动、内容移动、复制拖动保持各自的指针；复制状态以手势开始为准。
- 旋转悬浮按显示后的角点判断，旋转拖动按指针相对中心判断，支持旧版上/下/四角六个旋转素材。缩放方向随旋转角变化，翻转角点沿对角控件方向判断。
- 选区画笔使用对应画笔指针，锁定/隐藏目标显示不可用指针。全部沿用 `assets/cursors/cursors.txt` 已登记的旧版素材和热点。
- Release 构建及 `--selection-cursors-check` 通过。本次覆盖现有选区操作；未迁移的剪切、自由四边形等功能没有作为完整对应实现登记。

### 2026-10-14 隐藏指针误报修复

- 根因：laf `os/win/window.cpp` 的 Hidden 分支正确设置空 HCURSOR，但返回值按句柄是否为空计算，因此返回 false。原生刷新代码将其当作失败并弹出 `Cannot apply legacy cursor`。
- 显式隐藏状态单独调用，不用该布尔值判断成功；可见指针仍保留句柄加载与应用失败检查。
- `--cursor-apply-check` 验证真实 Windows 指针句柄在显示、隐藏、重复隐藏、恢复和六个旋转方向之间的切换。
