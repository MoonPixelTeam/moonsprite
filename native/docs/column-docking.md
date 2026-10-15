# 栏目停靠、移动与标签组

## 操作

- 拖动栏目标题或单个标签时，复用sheet标签素材的标题跟随鼠标；在目标区域停留100ms后出现半透明accent纯色区域预览，松开提交。左右侧栏目以上/下半区表示分块；底部沿用旧版左右分块；目标标签左/右半部表示插入位置，可在同组内重新排序。8设备像素启动阈值沿用legacy。
- 左右停靠区上下排序，底部停靠区左右排序；已有栏目显示插入位置，空区使用24px边缘带。
- 拖到另一栏目标题合并成标签组，点击标签切换同一空间中的栏目。拖动单个标签可拆分；拖动标题空白区域移动整组。
- 拖到无停靠目标处松开，停靠栏目恢复原布局，不自动转为悬浮；仅右键标题的悬浮项创建悬浮栏目。已有悬浮栏目拖动仅移动整组，不检测停靠/合并目标、不显示磁吸预览，停靠仅通过右键菜单；可八向边框调整尺寸。Esc或捕获丢失取消本次布局修改。
- 右键标题可隐藏，或直接停靠到左侧、右侧、底部和悬浮区。窗口菜单可重新显示并激活隐藏的栏目标签。
- 拖动停靠区外边界调整宽/高，内部相邻分隔线调整比例或偏好宽度。

## 来源及适配

`legacy/src/renderer/src/components/panel-docking.ts`：8px启动阈值，100ms延迟，8px滞回，已有边缘40%/160上限的插入命中区，空区24px，角落按归一化距离选最近目标。

`legacy/src/renderer/src/core/panel-layout.ts`：稳定顺序、纵向权重、底部绝对偏好宽度和图层主栏目吸收剩余空间。`floating-panel.tsx`及工作区停靠契约：捕获、取消、可见范围限制、尺寸及位置恢复。legacy逻辑按仓库MoonSprite Source-Available License 1.0复用，允许本工程内部开发及验证；底层laf/UI库按各自MIT许可。

原生以稳定栏目ID和C++布局模型替代DOM、React和localStorage。单一UI线程的16ms timer检查100ms停靠意图，无后台轮询任务。复用原生已有的`resizedPanel`锚定缩放算法、sheet栏目框/按钮/标签素材及legacy光标，不引入新图标。拖动标签复用sheet的panel_tab_active，纯色预览使用皮肤accent色与88/255透明度，单独置于栏目内容上方；预览只是反馈，不使用语义选择素材或改变文档选择。

多个栏目合并标签及按用户动图要求的跟随标签、半透明分块预览、标签左右插入排序是用户明确的新设计，legacy没有对应实现。工具属性栏与画布共用中央栏目宽度，侧栏从属性栏顶部开始；多标签左侧贴合栏目外框，活动标签底边与下方栏目的顶边重叠共用。保持各栏目的内容实例，不复制文档、颜色盘或时间轴状态，非活动标签的内容隐藏。默认未自定义时保留原布局。

## 保存与边界

当前四个已接入栏目为颜色板、调色盘、图层、预览。停靠区、顺序、分组、活动标签、显隐、左右偏好宽度、底部高度比例、纵向权重、底部偏好宽度与悬浮几何写入LOCALAPPDATA/MoonSprite/Native/workspace-panels.txt；原workspace-sizes.txt及对话框几何兼容保留。新格式panels-v2可读初始panels-v1，校验所有四个唯一ID与尺寸后整体应用，损坏数据不部分写入模型。

右键设为悬浮时保留原栏目的实际尺寸，不强制增大到180×120。悬浮区域使用整个原生窗口客户区，可覆盖菜单、属性栏、工具栏和状态栏；不是只限在画布或停靠区。浮动背景使用laf不透明Widget参与遮挡，边框与内容一起置于停靠栏目与普通控件之上，点击悬浮栏目带到前面；悬浮栏目与弹窗按最近焦点排序（用户后续确认取代固定弹窗优先）。所有裁剪Region一律使用显示器相对物理像素，避免2×绘制矩阵下逻辑坐标被错误扣除产生残留。移动前的旧范围主动失效，重画露出区域。悬浮尺寸不随软件窗口拉伸，位置按保存时各轴可移动范围的比例恢复，临时约束不覆盖偏好。布局操作不改变作品revision/dirty/undo。历史、笔刷等尚未接入的栏目内容不在本次范围；弹窗式栏目快捷键和多工作区预设也不宣称已迁移。

## 验证

旧版panel-docking.test.ts与floating-panel.test.tsx共17项通过。原生panel-docking覆盖分组/拆分/整组移动、活动标签/隐藏回退、停靠排序、底部尺寸、缩窗/放大浮动位置与持久化损坏回滚。panel-docking-interactions通过原生鼠标捕获驱动标题拖动、100ms意图、标签切换、取消、拆分和悬浮缩放，并核对控件实际位置及作品历史不变。


2026-10-14最终验证：Release正式程序构建成功；panel-docking、panel-docking-interactions及layers-render通过。实际渲染图panel-docking-drag-smoke.bmp确认半透明分块区域与跟随标签，交互检查同时核对源标签隐藏、100ms确认、取消恢复及作品历史不变。所有标签/栏目边框继续引用sheet，纯色预览属于皮肤accent颜色反馈。

额外回归未全部通过：workspace-layout在旧独立预览的合成鼠标批次中未取得捕获（Mouse batch deferred geometry until timer step=0 updates=0 captured=0 managed=0）；layer-context-menu的帧菜单实际启用6项而旧断言要求5项（2:10:6）。未修改这些断言或通过跳过断言宣称通过。全仓库迁移仍为INCOMPLETE。


后续八项修正验收（2026-10-14）：panel-docking通过（含表头优先于分块滞回、整个客户区浮动、尺寸不增长）；panel-docking-interactions通过（包含无目标拖动不新建悬浮、右键入口尺寸保留、可移到属性栏/菜单区域、浮动不透明frame位于普通控件之上、多标签共框几何、属性栏右端与画布列一致）。浮动颜色板外边框像素与实际sheet素材逐像素采样一致；浮动移动后的旧/新并集局部重绘与整幅重绘逐像素一致，确认无残留。panel-docking-floating-smoke.bmp与panel-docking-smoke.bmp已人工核对。layers-render和layer-context-menu通过，之前帧菜单启用数量问题已由当前源码更新解决；workspace-layout旧独立预览合成捕获检查仍失败，未以强制捕获或跳过断言掩盖。


## 标签、背景与内容的层次（2026-10-14 用户确认）

栏目分为标签层、背景层和内容层。单栏标题位于背景框内；多标签位于背景框顶部外侧，活动标签与背景框顶边共用描边。背景使用 sheet 的 panel_outer，内容使用 panel_content，标签使用 panel_tab_active/inactive 及 join 素材。不把内容框顶边当成栏目背景顶边。

背景素材三像素边框内沿与按钮/内容外沿之间留 2px（1×）；单栏另保留九像素标题墨迹及标题下方 2px。颜色板按钮占独立的一行，与下方内容框间隔 2px。调色盘无顶部操作行，内容框直接从同一正文起点开始；预览使用相同规则，图层的按钮行与下方格区保持 2px。合并与单栏采用同一背景内沿语义，切换标签不改变层次。此次问题来自布局坐标，不是素材：保留现有 sheet 形状和像素，不重画素材。

悬浮标签和标题空白处的拖动都只移动整组；经过其他栏目的标题、边缘或内容区也不吸附。右键停靠仍可把栏目放回左侧、右侧或底部。交互回归检查拖至真实标签目标、等待意图确认并松开后仍为悬浮，另检查合并调色盘的内容框距背景内沿 2px。

本轮最终验证：正式 Release 构建成功；panel-docking、panel-docking-interactions、layers-render、layer-context-menu 四项通过。panel-docking-picker-smoke.bmp 检查合并调色盘内容顶部与背景层间距，颜色板及悬浮图片检查框层次；来源覆盖检查通过143文件，整体 legacy 迁移仍不完整。

悬浮移动标签修正：paintDockFeedback 在绘制入口按手势开始时的 dock 状态排除 Floating，防止延迟或独立重绘画出脱离栏目标题。悬浮背景切换到 Editor 绘制坐标时继承传入的物理裁剪，防止部分重绘扩散到整个窗口。回归检查移动中的预览标题锚定、隐藏反馈、反馈逐像素透明以及小范围浮动背景重绘不写入裁剪外像素。

悬浮移动标签修正验收：正式 Release 构建成功，panel-docking、panel-docking-interactions、layers-render、layer-context-menu 四项通过；移动中预览标题位置与栏目框一致，浮动手势反馈逐像素为空，小范围浮动框重绘不越界。


2026-10-14 标签合并后拆分与接框修正：侧栏中拖动合并组的一个标签，可将它放到本组上方/下方；表头仍用于标签重排，正文靠近上下边缘用于分块，保留100ms确认。自身组仅在有其他标签时作为单标签拆分目标，不把独立栏目拆向自己。此行为为用户明确补充，模型 targetAt 和 place 同时承接。

标签底部与背景层的完整三像素边框重叠。活动标签内侧填充覆盖背景顶边，使标签与背景连续；转角使用现有 sheet 的 panel_tab_join_left/right，从标签底部外侧延伸两像素，与标签侧边共用一像素。首标签左边与背景外框共边，不另加内转角。Widget bounds 包含外侧转角区域，避免素材被裁切；活动标签在非活动标签之后绘制。拖动标签直接使用 panel_tab_active，不附加背景接框转角，文字位置与停靠标签一致。素材形状未修改。

本轮标签接框验收：正式 Release 构建成功，四项定向检查通过。模型及捕获交互均验证合并标签拆至本组上/下方；活动首标签与非首标签的转角渲染逐像素匹配 sheet，三像素接框几何检查通过。

2026-10-14 76b6d161 用户纠正取代上轮外延转角解释：右转角向左2px、左转角向右2px，即转角完全位于标签侧边底部的3×3范围。取消控件额外扩大的2px空区，消除交界黑块。未选中标签置于背景层下，不覆盖背景层顶部三像素描边；活动标签继续与背景共边。素材本身不变，来源仍为sheet的两个转角素材。

76b6d161修正验收：Release构建及四项定向检查通过；转角像素与sheet一致。未选中标签控件范围止于背景框上沿，文字上移2px保留完整字形，悬浮组中先于背景与活动内容绘制；取消外延控件空区后交界黑块消失。来源覆盖143文件通过。

悬浮/停靠关闭按钮语义（用户2026-10-14）：四个栏目悬浮时右上角显示与现有预览相同的close图标和icon_button素材，位置为右侧16px、顶部4px、11×12px（均1×）。停靠时一律隐藏关闭按钮，包括预览。关闭复用既有窗口菜单隐藏命令，不改变停靠配置或作品数据；可从窗口菜单重开。按钮命中优先于标题拖动和边框缩放，随悬浮层一起置顶。默认旧独立预览继续显示其关闭按钮。来源为legacy floating-panel.tsx关闭/显隐语义与原生PreviewPanel既有实现，其他悬浮栏目显示同一按钮属于用户明确一致性要求。

关闭按钮验收：正式Release构建成功，四项定向检查通过；四栏目逐个检查悬浮按钮显隐及位置、关闭不启动拖动、隐藏后菜单重开、转停靠隐藏按钮，以及文档revision/history不变。来源覆盖143文件通过。


2026-10-14 四项交互与坐标修正：预览停靠标题由 Manager 的统一物理命中入口直接开始手势，避免依赖不透明预览控件遮挡后的普通事件路由。栏目置顶保留未选中色卡在前、选中色卡在后的绘制顺序；选中范围由 Skin::selectionMaterialBounds 获取，命中仍用 selectionContains，不通过修改素材解决遮挡。

栏目/调色盘/弹窗布局坐标为客户区相对逻辑像素；uiDisplayRect 在最后一步加上精确物理原点，uiLocalPoint 在除以缩放前减去物理原点，禁止先把原点除以缩放再拼接。测试使用奇数原点(17,23)和640×480、800×600、1000×700窗口，检查实际标题捕获、拖动、选择渲染alpha与命中、外框像素未被相邻色卡覆盖。布局模型在空间不足时把侧栏最小宽度视为偏好，按剩余空间压缩两侧，底部也保留实际可用空间，禁止强制画布宽/高导致列重叠。更小于完整控件所需空间的窗口仍可能无法展示全部内容，不用越界坐标伪装可见内容。

弹窗层级修正（用户2026-10-14要求改为Aseprite规则）：模态弹窗固定在悬浮栏目上方，背景栏目不能靠鼠标/键盘焦点越过模态屏障；非模态工具弹出窗由原生 ui::Manager 的窗口列表、handleWindowZOrder/isWidgetClickable/Window::onBroadcastMouseMessage 管理。编辑器内部栏目仍是必要原生适配：保留现有从后向前绘制顺序，但 Desktop 的鼠标广播和 Manager::pickFromScreenPos 使用同一最前可见控件，避免透明背景或栏目底板先于按钮截获点击。全局栏目拖动/时间轴边框过滤器只接收桌面窗口的点击，不能捕获真实PopupWindow内容。来源为MIT UI模块 widget.cpp::pick、manager.cpp::handleWindowZOrder/isWidgetClickable、window.cpp::onBroadcastMouseMessage；未复制非MIT模块。



栏目性能优化（2026-10-14）：对照 native/.cache/aseprite/src/ui/window.cpp 的 Window::moveWindow、Widget::offsetWidgets 与 ui/move_region.cpp。UI模块的 MIT 许可及版权原文保留在 src/ui/LICENSE.txt（Igara Studio 2018–2025、David Capello 2001–2018），不把整套 Aseprite 其他模块的许可推断为MIT。纯移动复用 laf offsetWidgets 和软件 move_region，以旧新可绘制区域的交集决定可搬运像素；上层弹窗遮挡、脏区域和 GPU 路径分别保留裁剪或区域重绘。MouseMove只记录最新指针，在Aseprite鼠标批次末尾SetCursor或16ms后备计时器统一应用；松开时立即提交最终位置，Esc恢复。尺寸调整走布局入口，跳过作品同步、菜单校验和完整refresh；拖标签反馈仅重绘旧新标签及分块预览。

性能回归使用连续200个物理指针样本，分别检查悬浮移动、悬浮八向缩放与停靠宽度调整：提交批次前零布局，提交后一次几何更新、零完整refresh。column-drag-performance.txt记录处理耗时，这不是端到端帧率。默认预览原有增量重绘仍保留。


本轮交付验收：正式 Release 构建成功；panel-docking、panel-docking-interactions、skin-resize-render、layers-render、layer-context-menu、workspace-layout 六项全部通过。真实窗口的200样本悬浮移动与缩放均提交一次几何、零完整refresh；软件纯移动实际调用一次move_region，增量移动和缩放帧与随后完整重绘逐像素相同。保存尺寸时旧modalSizeKey数组随新增Pending类型越界的崩溃已改为按类型命名的稳定键；读取覆盖全部当前弹窗类型。测试弹出菜单采用停止/恢复测试计时器防止嵌套循环提前进入下一阶段，临时停靠检查恢复原预览尺寸。来源覆盖143文件通过；全工程legacy迁移状态仍保留INCOMPLETE。

2026-10-14 栏目缩小时标签残影修正（faf6fcec）：默认颜色分隔线原先仅更新内容控件，遗漏调色盘标题；时间轴高度调整也遗漏图层标题。尺寸批次现在同步布局受影响的标签，旧新区域沿用局部失效，不引入完整 refresh。失效矩形通过 toDisplay 转换，保留精确物理原点。素材没有修改。

2026-10-14 预览标题与合并标签重绘修正（18b76f48）：托管预览原先将整个控件矩形填为背景，覆盖了先绘制的非活动标签；绘制过程中预览独立失效还会擦掉作为同级控件的活动标题。预览只填充背景框区域，保留上方非活动标签区；内容局部重绘末尾在原物理裁剪内同步绘制同组可见标签，活动标签最后绘制。保持非活动标签止于背景框顶沿、活动标签与背景共用描边的语义，sheet 素材不变。

回归合并预览与图层，核对两标签全部像素与独立素材/文字渲染一致；笔画按下未提交时只重绘预览，再核对标题像素不变，取消笔画恢复作品。截图 panel-preview-held-stroke-tabs.bmp 确认标签完整。正式 Release 构建成功，panel-docking、panel-docking-interactions、workspace-layout 三项通过；来源覆盖检查143文件通过，全工程 legacy 迁移仍为 INCOMPLETE。

2026-10-14 拖动标签残留修正（623ee971）：单栏目静止标题只有文字尺寸，拖出时实际使用完整 panel_tab_active 素材（文字宽度另加10px，14px高，均1×）。原反馈失效区域错误沿用静止标题范围，遗漏旧标签边框，连续移动时累积残影。新增 dockGhostRect 统一拖动素材绘制与失效矩形，最后通过 toDisplay 保留物理原点；继续只刷新旧新反馈区域，不引入全窗口刷新或改变 sheet。

真实窗口回归在颜色板上连续移动单栏目标签，覆盖前后移动、奇数物理坐标与文字标题转完整标签的尺寸变化；检查失效矩形覆盖完整素材，并分别将两次增量 framebuffer 与完整重绘逐像素比较。dock-label-incremental.bmp 确认颜色板上旧处无残留。正式 Release 构建和 panel-docking、panel-docking-interactions、workspace-layout 三项通过。

2026-10-14 用户 aa91fbc2 要求：拖动标签始终在指针下方，按当前物理指针定位并在水平方向居中，与指针留2px（1×）间距，保留像素网格对齐。取消静止标题中按下位置对拖动标签位置的影响。参考图为39×18px，标签高度统一调整为18px（1×），保留当前 sheet、文字位置和与栏目背景的3px描边重叠；此前14/15px的标签高度说明由此替代。

自定义停靠分隔区新增统一 panelResizeAt：悬浮指针、左键开始缩放使用同一物理范围与同一边界类型，包括侧栏宽度、底部高度、上下相邻栏目和左右相邻栏目。关闭按钮及顶层悬浮栏目阻挡下方分隔区；出现对应缩放指针的区域才能进入尺寸手势，分隔区优先于相邻标题拖动。默认布局仍使用既有统一 sizeHandleAt；独立预览保留自己的同源边缘检测。

回归检查拖动标签在奇数物理坐标下仍完整位于指针下方；检查上下栏目间ns-resize、左右栏目间ew-resize，按下捕获的栏目/边界/邻居必须等于悬浮判定，分隔区外点不进入缩放。测试临时隐藏可能遮挡分隔线的悬浮预览，结束后恢复。正式 Release 构建成功，panel-docking、panel-docking-interactions、workspace-layout、layers-render 四项通过；拖动增量帧仍与完整重绘逐像素一致，来源覆盖143文件通过。

2026-10-14 用户4c0386b3指出合并标签条空白处仍有残留：预览是覆盖整个栏目矩形的不透明控件，laf不会替它清理标签条；此前只填充frame留下了空白标签条旧像素。这取代18b76f48的“预览只填充背景框区域”实现：现在先填充完整控件区域，再绘制框/内容，并在同一裁剪内恢复所有可见标签。标签层级和现有sheet保持不变。

回归先向合并预览整条标签区填入明显的测试色，再在笔画未松开时仅重绘预览，检查标签右侧每个像素恢复panel色、每个可见标签像素与独立素材/文字一致。真实窗口将颜色板标签沿合并图层/预览的空白标签条左右移动，两次增量framebuffer均与完整重绘逐像素一致。merged-tab-strip-incremental.bmp确认空白条无反馈残留。正式Release构建成功；panel-docking、panel-docking-interactions、workspace-layout三项通过。

2026-10-14 ccc3179f 悬浮栏目残影及大小窗口坐标修正：再次逐行核对 Aseprite MIT UI 模块 Window::moveWindow、Widget::getDrawableRegion/offsetWidgets、move_region。Aseprite的窗口可绘制范围会扣除上方窗口，但原生栏目是同一窗口中的兄弟控件，原有并集范围没有该遮挡语义。现在按实际栏目焦点/绘制顺序扣除上层悬浮栏目的完整范围及弹窗屏障；原有软件move_region只搬运旧新位置均可见的干净像素。检查待处理的编辑器、控件、预览关闭按钮与display失效区，脏源回退局部重绘，保持GPU不读回和鼠标批次合并。

窗口变化后保存的floating坐标可能基于旧viewport，layout会投影为当前实际位置。移动过去将新位置减去保存位置，导致实际控件被偏移错误距离；改为先取当前layout实际位置，再存入本次指针位置、应用当前viewport的边界限制，以最终实际位置计算offsetWidgets位移。尺寸调整也清理当前实际旧范围，避免用旧viewport保存值。坐标仍为显示器相对物理像素；逻辑布局只在减去精确物理原点后换算。

回归四个悬浮栏目分别在640×480、1280×960、800×600、1280×960之间切换，以奇数物理原点(17,23)及奇数指针移动检查模型、标题和栏目框坐标完全一致。真实窗口覆盖上层预览和被其遮挡的颜色板，八次连续方向变化，每次包含绘制前连续三次移动；每次增量framebuffer与完整重绘逐像素一致。保留独立预览原有六次移动/缩放检查、标题条与拖动标签检查、200指针样本性能检查。floating-preview-continuous-incremental.bmp确认重叠栏目及画布无残留。正式Release构建成功，panel-docking、panel-docking-interactions、workspace-layout、skin-resize-render、layers-render五项通过，来源覆盖143文件通过。

新增真实窗口回归：连续200次向上移动，将分隔线上移100物理像素，验证标签同步移动、不进入内容区域、仅一次布局且零完整 refresh；缩小后的增量 framebuffer 与随后完整重绘逐像素一致。workspace-layout、panel-docking、layers-render 已通过，截图确认调色盘标题旧处无残影。栏目交互回归的属性弹窗清理改为 resolve(false)，确保正常结束属性事务，再测试拖动。最终正式 Release 构建成功；workspace-layout、panel-docking、layers-render、panel-docking-interactions 四项均通过。

工具属性弹窗补充：ToolPropertyPopup::onResize先更新自身bounds再布置子控件；显式setDisplay继承主显示器，复用Aseprite ComboBox式同显示器弹出路径，避免独立native window的坐标重定位混用。

2026-10-14 eb84d5af 图层按钮上间距修正：自定义图层栏目统一从 columnBodyTop 定位按钮，替代标签高度调整前的固定偏移。合并栏目背景框内沿至按钮外沿保留2px（1×）间距，按钮及下方时间轴同步下移3px；单栏目原几何和按钮下方间距保持不变。复用现有 sheet。正式 Release 构建成功，layers-render、panel-docking-interactions 两项通过。

2026-10-14 用户02d4b368/fa373ed7/7c46e89e：未活动标签与活动标签共用18px高的几何及底部位置，文字均为顶部+4px。未活动素材顶部内缩2px，最下方3px置于背景框下方裁剪，活动标签与相邻标签共边处最后绘制。此要求替代此前未活动标签缩短3px、文字上移2px的规则。sheet 的 panel_tab_inactive 使用用户图2的黑色描边和 #202635 背景；九宫格与坐标不变。正式Release构建成功，panel-docking、panel-docking-interactions通过，真实合并栏目截图确认文字对齐。

2026-10-14 用户f280817c纠正层级：未活动标签必须先于栏目背景、内容及活动标签绘制。合并停靠栏目复用既有surface绘制背景框的3px重叠顶边，放在未活动标签之后；其余背景保持父窗口绘制，避免额外不透明内容控件干扰悬浮搬运。取消PixelButton内部裁短素材的替代实现。悬浮与预览局部重绘仅恢复背景框上方实际露出的未活动标签，保留底边完整素材与统一文字位置。既有回归增加兄弟控件顺序与背景顶边逐像素验证。sheet不变。

2026-10-14 用户a3044300悬浮修正：保留真实的未活动标签→栏目背景→内容→活动标签顺序，同时在未活动标签独立重绘时裁剪被背景顶边遮挡的3px。此前取消标签内部裁剪的说明由此替代：层级与局部重绘遮挡必须同时满足。鼠标进入/离开只重绘该标签，不会重新绘制上层兄弟背景，故仅调整兄弟顺序不足以保证悬浮效果。标签完整bounds、底部与文字位置保持不变；素材仍在sheet。正式Release构建与panel-docking-interactions通过，新增enter/leave独立重绘逐像素验证背景顶边不变。

本轮最终验证：正式Release构建、panel-docking-interactions、来源覆盖检查通过。完整workspace-layout未通过，报告 Dock split shrink left pixels differing from full repaint；不声明本轮已修复全部工作区增量重绘。此前同项运行还报告phase50悬浮栏目连续移动差异，保留该未通过证据，不将专项标签验收解释为全部工作区通过。


2026-10-15 工具属性栏实时跟随修正：默认 DockWidth 的 flushSizeGeometry 原来只重排栏目/时间轴，遗漏 layoutToolOptions。现在在同一合并帧内重排工具属性控件、对称按钮及撤销重做，无需窗口 resize 或完整 refresh。自定义停靠的 layoutGestureColumns(all=true) 已具备这一步，保持原有路径。workspace-layout 增加按住拖动三个连续帧、释放前属性坐标同步、撤销重做右对齐及合并刷新次数检查。用户明确要求的原生布局修复，legacy 对照仍见既有栏目迁移来源。

本轮运行结果：workspace-layout 已执行通过 held resize 属性跟随断言，后续扩展阶段在 Floating preview continuous move retained background pixels at phase 50 失败，未宣称完整工作区测试通过。palette-mouse-startup 与 home-workspace 均通过。正式 Release 产物已更新。


2026-10-15 悬浮栏目大小窗口位置迁移：直接按 legacy/core/panel-preferences.ts 的 remapFloatingCoordinate / resizeFloatingPosition、components/floating-panel.tsx 的 resize 回调迁移，栏目调用实际 responsiveToViewport=true。按 (窗口尺寸−栏目尺寸) 的可移动空间比例调整坐标，先限制旧比例到 0..1；无可移动空间时归零，旧空间为零而新空间可移动时限制原坐标。每次窗口尺寸变化提交新坐标和参考视口，避免永久引用最初视口；不改变显式栏目宽高。独立预览栏目也复用同一函数，使用完整客户区；统一原生像素取整是必要适配。窗口尺寸变化后合并延迟写入已有工作区偏好。停靠和栏目拖动/取消行为沿用现有路径。

本批回归覆盖大小窗口往返、窗口小于栏目后放大、负数/超界坐标、无旧移动空间、独立宽高保持。正式 Release 构建、panel-docking、panel-docking-interactions 均通过；来源覆盖155文件通过，不代表全量 legacy 行为等价。

2026-10-15 颜色板/调色盘分隔条修正：默认布局的尺寸拖动也在 Manager 已转换为显示器相对物理坐标的入口处理，先于子控件点击，避免标签或色格截获分隔条按下。上下分隔与侧边分隔交点优先上下调整，光标与点击沿用同一命中函数。按 Aseprite ui/widget.cpp 的 getDrawableRegion 机制，父背景会扣除可见子控件的整个 bounds，与子控件绘制 clip 无关；因此色格仅裁剪绘制仍会留下黑洞。现在色格 bounds 与物理视口相交，完整素材作为相对矩形保留，使用 UiPaintScale 的物理偏移绘制，保持非整基础像素滚动及选中素材位置；命中、背景遮挡和绘制范围一致。legacy 对照为 components/app/useAppWorkspaceLayout.ts 的捕获起点加指针增量和合帧调整；此处保留用户指定的原生栏目结构。回归增加 (17,23) 原点下小窗口→大窗口→小窗口、分隔角命中与捕获、按住移动17基础像素及色格不能越过视口的检查。

本轮正式 Release 构建成功；workspace-layout、panel-docking-interactions、palette-mouse-startup 三项通过，包含增量/完整绘制逐像素一致检查。来源覆盖164文件及 diff 空白检查通过；全量 legacy 对齐仍为 INCOMPLETE。


2026-10-15 栏目内容抓手滚动：直接迁移 legacy/components/useSpaceDragScroll.ts 及其 position/navigation 测试。公共 SpaceDragScroll 维护开始位置、起始滚动量、缓存边界、移动与结束，Editor::registerScrollDrag 提供区域命中、当前位置、最大范围、写入回调；目前颜色板色格区与图层行/帧格区注册，后续视口无需复制手势状态机。中键或空格+左键仅在内容溢出时启动，像素坐标反向跟手，按下捕获优先于子控件选择，不改变颜色/图层选择与历史；空格释放不终止拖动，失焦/丢捕获结束并保留偏移。输入框不抢空格，抓手/抓取指针复用旧版资源。最大范围开始时缓存，视口 resize 更新，不在持续移动包中读取几何。原生无 DOM pointerId，使用既有 OS 鼠标捕获适配。

验证：唯一正式 Release 构建成功，--panel-scroll-check 实际退出0（图层37/29px二维偏移、颜色板31px偏移、空格中途释放保持、选择/历史不变）；panel-docking、panel-docking-interactions、palette-mouse-startup、selection-interactions 均通过。公共方法还沿用旧版精确输入验证156/63、边界0/80以及1000个移动包不重读几何和 resize 刷新边界。
