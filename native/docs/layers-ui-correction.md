# 图层时间轴界面修正

## 选中边框素材的语义（用户最新确认）

- 选中素材是套在选中内容外侧的轮廓，不是压进内容内部的装饰框。定位基准为素材的**最内侧黑色描边**，而不是整张素材的外边界。
- 素材最内侧的黑色描边，必须与被选内容原有的外部描边位于同一条像素线上，重叠共用一条边。不能在原边框内侧再画一圈黑边，也不能为了容纳选中素材而缩小内容或移动文字、图标。
- 素材中的白色描边及其外侧部分向选中范围外侧延伸；绘制范围和裁剪范围应允许这部分显示。素材矩形的外边界不能直接等同于内容矩形的外边界，应按素材内侧黑边到外边界的实际距离定位。
- 选择多个相邻项时，描边围绕它们组成的选中范围外轮廓绘制；内部共享的格线仍是内容的分隔线，不能把每个格子分别套一圈白色选择框。互不相连的选中范围分别具有外轮廓。
- 活动状态仅驱动背景；仅明确的选中状态使用上述外轮廓。悬停素材沿用同一个对齐基准，不改变内容尺寸或边框位置。

修正前的问题：时间轴直接将内容矩形传给 `drawSelection`，导致描边挤进内容内部。时间轴已按本文末尾的统一外轮廓实现修正；色卡仍沿用原有实现，本次不更改其交互与绘制。

用户截图要求：11个按钮使用普通图标按钮素材；5/3/3共用边框，左侧两组间隔2逻辑像素；各行图标与表头一致；旧版自动链接图标；新增图层后网格不断线。

- `PixelButton` 每个按钮完整绘制自己的 `icon_button` 九宫格。按钮宽15、步长14、高度16逻辑像素，相邻按钮共用1px外描边；第三组沿用右对齐。
- 12×12格使用从左上边线内侧开始的11×11图标区，表头与每行一致。帧点仅在实际cel包含surface时显示，去掉父级/子级重复画点。
- 分隔线高度依据可见图层数计算；眼睛、锁、自动链接、名称和帧列均有完整竖线，滚动后重新计算。横线到最后一个实际可见帧格右边界为止，右侧空白区没有行分隔线。子控件绘制自己的顶边/左边，父控件绘制空列与末端边界。
- 自动链接来源：`legacy/src/renderer/src/components/PixelAutoLinkIcon.tsx`及`assets/pixel-icons/animation-auto-link-{off,on}.svg`。原SVG直接转换PNG，保留形状及42%透明边；原生自动链接功能仍未迁移，逐行灰显off图标。
- Aseprite参考：`.cache/aseprite/src/app/ui/timeline/timeline.cpp` 的 `drawLayer`、`drawCel`，按实际格边界与裁剪绘制。该app模块受EULA约束，仅阅读思路，不复制源码；底层继续使用已有MIT UI/Graphics。

验证：`layers-render`覆盖1280/1600宽度、1/3/18层及滚动后的实际父子绘制，检查网格交点、自动链接列竖线与组间距；`skin-resize-render`通过。来源覆盖88个文件通过；这不代表整个legacy迁移行为等价。

后续截图修正：表格左边线与外框内侧黑线共用（workX+2）；活动图层整行、活动帧整列及行格悬停仅用 #171A21 背景，不画蓝色选中描边。工具按钮位置保持原有5px偏移。

最新对齐截图覆盖上条共外框描边要求：表格与工具按钮左边线同为workX+5；按钮底部到表格顶边间距2逻辑像素（表头37，首行49）；数字按可见墨迹在格内居中。

Cel内容标记修正：仅当解析后的RGBA surface含alpha非零像素才画点，全透明RGB不计为内容；缓存按文档身份和内容版本失效。圆点用用户提供的7×7透明PNG原样替换，来源保存于assets/utility-icons/timeline-cel-content.png。验证覆盖透明色、微小alpha、撤销、重做和擦空。

用户最新工具按钮顺序：播放五项后为洋葱皮、新建帧、删除帧；右侧为新建图层、新建图层组、图层设置。图层组未迁灰显，洋葱皮右键设置跟随新位置。

用户最新选中效果：图层名称、所选帧头和当前单元格直接复用色卡selection.normal/hover，统一调用Skin::drawSelection。活动行列背景不变；显式帧选择时只显示所选帧头描边。

活动/选择状态纠正：取消活动图层、当前帧、当前cel作为白色描边默认值的回退。对照旧版 workspace-animation-selection.ts::applyLayerRowSelection、workspace-commands-animation-selection.ts::selectAnimationCell 与 animation-timeline-visual-state.ts 的 presentationHidden：活动只驱动背景；普通图层/cel点击分别记录明确的目标ID，帧头按现有显式帧集合；三种普通点击选择互斥。画布绘制/框选隐藏选择辅助线但保留选择目标，时间轴点击重新显示；切换文档不会继承上一文档描边。现有单选图层/cel的交互范围保持，旧版完整多层/多cel选择仍是迁移缺口；整行/整列连续选择轮廓已由本文末尾的修正实现。layers-render新增默认无描边、活动变动不改选择、选择模式切换、帧取消选择、隐藏/恢复辅助线、seek与新文档回归。

选中轮廓实现修正：时间轴内容由父级统一合成，按钮保留原有命中范围并使用透明背景重绘；选择框最后绘制，不再受单个按钮裁剪。素材三层边为外黑/白/内黑，内黑对齐实际网格边界，外扩2逻辑像素；单格包含其右/下共享格线，因此边界矩形为13×13，内容位置和尺寸保持。图层选择覆盖整行标签与实际帧，帧选择覆盖表头与实际图层行，相邻所选帧合并外框，cel单选围绕一格。来源为legacy/styles.css的layer-animation-list.has-layer-selection-outline与animation-frame-selection-column；复用已有selection.normal/hover原始素材，未改色卡行为。layers-render对三类选择检查内侧共享黑边、外侧白边未裁剪、内容像素不变及相邻帧内部格线不被套白框。

本次验证：正式Release构建通过；layers-render（含三类外轮廓与相邻帧合并）、layer-context-menu、skin-resize-render通过。已检查三类离屏渲染图，确认文字/图标未内缩，黑边共用，白边向外；来源覆盖90个文件通过，完整legacy行为迁移仍未完成。

用户最新截图限定图层选择范围：从自动链接列右边的共享边线开始，覆盖图层名称及后方实际帧格；眼睛、锁、自动链接三列不在选择框内。名称起点为网格x+36，选择边界宽度为48+实际可见帧数×12+1。内黑边共用、素材向外延伸的规则保持。layers-render同时校验左边界与宽度。

选中素材命中纠正：原因是调用方使用内容矩形.contains判断悬停（包含透明内部、遗漏外扩边），并读取全局鼠标位置且仅在控件enter/leave时刷新；素材PNG本身的黑/白/黑边、透明中心与九宫格配置正常，无需修改素材。Skin统一提供selectionMaterialBounds（实际内边界推导完整素材范围）、drawSelectionBorder、selectionContains（按九宫格实际alpha判断）。颜色板改用同一命中接口，保留其现有素材范围；时间轴按同一接口判断外轮廓，使用Manager现有display-relative指针过滤路径，跨同一控件的边框/内部以及外扩边界时刷新。透明内部与素材外部均不触发边框hover，可见外扩边及共享内黑边均触发。layers-render逐物理像素比较三种时间轴轮廓素材渲染alpha与命中，并验证时间轴hover；skin-resize-render保留所有色卡尺寸的逐像素一致性检查。该接口负责边框悬停判定，不扩大名称/帧/cel原有普通点击命中范围，也不宣称迁移了旧版未接入的cel拖拽。

本次命中修正验证：Release构建及layers-render、skin-resize-render、palette-mouse-startup三项通过。来源覆盖检查在同时开发新增的src/selection_transform.h尚未登记时失败；该文件不是本次修改，不代替其开发者编造来源。本次修改文件来源已更新。

图层名称左侧间距：边线内侧至首个文字可见像素为2逻辑像素（默认2×为4设备像素），按Fusion实际inkBounds定位；不移动网格、选择框或帧头数字。

活动图层/帧悬停背景：用户指定#2F3136。悬停图层控制/名称区域作用于活动行，悬停帧头作用于活动列，悬停cel作用于其活动格；只改变背景，保留文字、图标、网格与独立选择描边。使用现有显示器相对指针更新路径，移出恢复活动背景#171A21。

最新悬浮范围覆盖上条行/列联动：每个网格区域独立判定。眼睛、锁、自动链接各12×12，图层名称48×12，帧头和cel各12×12；活动区域悬停背景#2F3136只作用于当前命中的一格，不沿活动行或帧列传播。自动链接同样只用本列格子范围；选中轮廓规则保持。

图层栏目配色协调：普通格与空白区从中性#292B30改为工作层蓝灰#202635，活动保留#171A21，独立悬浮保留#2F3136；黑色网格、文字/图标及选中素材不变。活动与悬浮均改为sheet.png的3×3平铺切片timeline.active(0,576)/timeline.hover(4,576)，消除背景硬编码，普通timeline.row/grid原地改色；shape与像素边界不变，sheet扩为512×580。

配色验证：现有正式exe加载更新的sheet后layers-render通过，已检查普通/活动/选择渲染图；新源码链接被仍运行的正式程序占用阻挡，所以状态背景改为sheet读取的源码尚未更新到exe。来源检查仍受并行新增未登记的selection_transform.h阻挡。本次不强制终止未退出程序。

悬浮配色复核：普通#202635保持，timeline.hover从偏中性的#2F3136改为同色系#2C3445，提高格子悬浮辨识度。timeline.active仍#171A21，各格独立；自动链接格无论是否活动都沿用同一悬浮素材。只修改sheet的hover切片，未改选中素材、网格与图标。

悬浮消失根因修复：timeline.active/hover只登记part而漏登记style，loadThemeAtlas只将style引用的part加入运行时Skin.assets.patches，因此draw返回false。补齐theme.xml样式映射，不改PNG；layers-render新增眼睛/锁/自动链接/名称/帧头/cel六区域的实际指针与背景像素检查，确保命中一格只该格变#2C3445，移出恢复原底色。

图层内容区底部内间距纠正：timeline.frame底部3px素材边框与timeline.grid底边之间保留2逻辑像素，grid矩形底端从bottom-4改为bottom-5；不移动实际图层行。鼠标grid范围同步缩短1px。

自动链接普通点击迁移：来源workspace-commands-layer-properties.ts::setLayerAutoLinkAnimationCels、animation.ts::inheritAnimationFrameCelLinks及animation.test.ts，默认false、按层记录元数据、开关可撤销且不改变活动层。新建/复制帧对开启层继承上一帧canonical cel链接，空独立cel不建立链接、已有链接即使透明仍继承；关闭不拆已有链接。工程与恢复沿用autoLinkAnimationCels字段；逐行按钮复用旧版on/off素材，保持独立背景悬浮。旧版拖扫开关、Ctrl/Alt多层操作与遮罩自动链接仍未迁移，不宣称完整控制手势等价。
链接单元格显示按用户截图：去掉通用链条图标，使用原timeline.dot的同一7×7球素材定义timeline.linked-dot横向3/1/3九宫格，相邻同canonical source且有内容的格子中段平铺拉长，连续胶囊形；透明cel不画球。未新增重画图标，素材仍引用sheet原球区域。

本次验证：正式Release构建成功，document-transactions、project-save、layers-render三项通过；检查timeline-auto-link渲染图，连续三个链接cel合成圆头胶囊，独立cel保留单球。测试覆盖开关撤销/重做、新建/复制继承、关闭后不拆旧链、空cel与保存/恢复。来源覆盖92文件通过，完整legacy迁移仍未完成。

链接球接缝修正：原因是逐相邻两格绘制胶囊，中间圆头重叠。改为按连续canonical source整段一次绘制，仅保留首尾圆头，中段复用sheet球中心列；素材本身无需修改。layers-render覆盖球全部7行和所有设备像素的中段一致性，正式Release构建与检查通过，渲染图确认无内部接缝。

选中效果丢失修复：选择状态和外轮廓计算仍正确，paintTimelineGrid的outline循环遗漏drawSelectionBorder实际调用。恢复统一素材绘制入口，保持物理像素坐标、内黑边共网格、白边外扩及自动链接右侧起点。正式Release构建及layers-render三类选择的实际合成像素、逐像素alpha命中检查通过；查看timeline-outline-0图确认图层轮廓恢复。来源覆盖138文件通过，整体迁移仍不完整。

2026-10-15 时间轴滚动范围修正（用户指定）：滚动内容末尾增加一行12基础像素的纵向空白和半个实际帧视口宽度的横向空白。TimelineScrollMetrics 统一提供含留白内容尺寸，供滚动条显示/滑块比例、布局边界、空格/中键平移及播放区边界自动滚动共用。滚轮按完整物理偏移加减并夹取到范围，再分解行列与余数，修复滑块拖动后的不足一行余数导致无法滚回顶部。保留原sheet及半透明效果。新增回归断言：两轴滑块拖至末端的空白尺寸、拖回起点的精确零偏移、部分行余数经向上滚轮归零；沿用旧版 LayersPanel.test.tsx 的scrollTop/scrollLeft边界语义。

本轮验收：正式 Release 构建成功；layers-render、workspace-layout、palette-mouse-startup 三项通过，包含本轮两轴端点和留白断言。来源覆盖172文件及 diff 空白检查通过。主UI编译单元触发MSVC C1128，已仅对main.cpp启用/bigobj完成正式构建。

2026-10-15 完整单元格素材（用户明确替换）：将 codex-clipboard-95f1440c-db7b-472f-a264-028685ab76fe.png 原12×12 RGBA像素复制到 sheet.png (0,644)，新增 timeline.cell 九宫格1/10/1。素材SHA256=139f02eaca0b5c42d6d64d6ce0f1cfc9999f301417c55ee5e33f08887088c41e。保持现有12基础像素步距，每格绘制13×13外框，相邻格子重叠共用1px黑边；名称列按相同九宫格拉伸。保留活动/悬浮背景与选中轮廓，删除背景层另补的格线，避免横向滚动余数使横线比右边框更长。时间轴滚动素材正常及悬浮统一以96/255不透明度 SrcOver 合成（较此前128更柔和）；仍只引用sheet正常/悬浮素材。画布右缘调整1基础像素，共用PixelScrollBar::gridBounds定位及竖条端帽，让右下角与时间轴遵循同一规则。回归覆盖三种物理像素横滚余数的末格描边与空白区、正常/悬浮alpha和不同底色的实际合成颜色，以及画布双滚动条边界。

补充：timeline.cell 同时登记part与style；首次检查发现缺少style映射已补齐。共享右下角现在也复用sheet轨道黑色与timeline.row底色绘制端帽，避免画布继承不同的背景边缘。现有预览栏目新增相对明暗菜单后，其可用性回归断言同步允许已接入的第7项；没有改变菜单功能。

完整边框的右/下共用像素同时计入paintTimelineGrid裁剪剔除范围，修复预览移过单元格右下角时仅4个物理像素的增量/完整重绘差异。图层列宽已由另一任务迁移为动态值，既有选择/交点测试改用实际timelineFrameViewport/timelineLabelWidth坐标，保留原选择数量和像素断言。

最终验收：正式 Release 构建成功；layers-render、workspace-layout、palette-mouse-startup 均通过。检查末格渲染图，右侧空白无延长横线；覆盖增量/完整重绘一致性及滚动条正常/悬浮半透明合成。动态名称列宽还修正了链接球实际绘制的固定横坐标，以及帧头拖选、悬浮采样和选择宽度的旧测试坐标。来源覆盖177文件通过，diff空白检查通过；完整legacy迁移仍有既有缺口。

2026-10-15 首次显示与滚动条透视修正：timelineLabelWidth不再读取按钮isVisible/当前bounds，改按两组播放按钮的布局常量计算最小列宽，避免Aseprite MIT Widget::paintEvent背景绘制临时HIDDEN状态改变布局。滚动条继续使用sheet.png(320..398,620)对应横竖track/normal/hover原素材及96/255整组alpha；可绘制网格范围延续到滚动条下方6基础像素，保留原命中视口、滚动范围与端点留白。新增原生窗口首次帧对照、临时隐藏不变几何、真实DialogBackground合成与重复悬浮重绘检查。

用户后续明确：图层滚动条悬浮不透明度80%，实现为204/255，按住拖动同悬浮；普通仍96/255。两状态均复用sheet原素材，背景恢复后整组只合成一次，防止轨道/滑块重叠和重复重绘叠加不透明度。

本轮最终验收：正式Release构建成功；layer-label-width、layers-render、workspace-layout、palette-mouse-startup共4项通过。首次原生窗口帧已与清洁重绘逐像素比较（排除其它悬浮栏目的遮挡），帧头和cel无需点击即完整显示。真实DialogBackground路径在普通/悬浮两状态及连续两次重绘均与单次sheet合成一致，滑块下方存在真实网格和背景两类像素；已查看timeline-startup-detail与timeline-opacity-compare图。来源覆盖178文件通过，完整legacy迁移仍有既有缺口。
