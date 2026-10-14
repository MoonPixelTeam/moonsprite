# 时间轴选择和移动迁移

## 旧版证据

- 图层普通、Ctrl 和 Shift 选择：`legacy/src/renderer/src/store/workspace-commands-layer-selection.ts::selectLayer`，`workspace-animation-selection.ts::applyLayerRowSelection`。
- 帧/cel选择、锚点、隐式活动格和组合选择：`workspace-commands-animation-selection.ts::selectAnimationFrame/selectAnimationCell`。
- 框选、边框移动、右键多选移动、Alt复制、4设备像素启动阈值、末次指针提交、取消及边缘滚动：`components/panels/useAnimationGestures.ts` 和对应测试。
- 图层批量稳定排序、Alt复制：`components/panels/useLayerRowDrag.ts` 和对应测试。
- cel块位移：`core/animation.ts::mapAnimationCelBlock`；内容事务与选择历史：`workspace-commands-animation-cel-clipboard.ts::moveSelectedAnimationCels`。
- 帧复制移动不污染剪贴板并可单次撤销：`workspace-animation-drag-copy.test.ts`。
- cel轮廓使用直接选择目标的包围框，间隙不改变正式选中集合：`components/panels/deriveLayerPanelVisuals.tsx::animationCelSelectionBoxes`。图层、帧连续区间合并外轮廓，独立区间保留独立轮廓。

上述legacy源码使用仓库MIT许可。没有复制缓存Aseprite应用源码。

## 原生适配

选择状态按稳定层ID、cel ID、帧ID保存在Document；活动层/帧与正式选中集合独立。普通点击替换当前选择模式，Ctrl切换，Shift依照旧版锚点选范围。cel的Shift范围为累加矩形，框选拖动替换当前范围。帧Ctrl/Shift可保留显式图层上下文。

图层名称区域拖动移动选中行；未选中行先成为拖动目标。帧头或cel内部拖动选择范围，实际可见选择边框启动移动；右键可移动已有多选，未移动则打开对应旧版上下文菜单。Alt拖动复制，cel的Alt单击选择像素内容，Shift+Alt单击累加像素内容。

原生控件只转发按下事件，Editor捕获后处理完整手势，松开前应用末次指针；Esc、捕获丢失和文档身份改变取消。30ms原生UI计时器用于停在边缘时持续滚动，不创建后台任务。UI队列与窗口显示器坐标替代浏览器PointerEvent、requestAnimationFrame和DOM测量。

cel块保留相对行列位置，整块限制在现有层/帧范围内。移动时先快照受影响槽再清源、写目标，支持重叠移动与空槽。写入目标保留像素、surface位置、opacity和zIndex，产生独立目标；未移动的链接兄弟保留内容。图层批量移动保留原排序；Alt复制与移动合为一笔历史。帧沿用原有循环段重排算法，复制不覆盖系统内的帧剪贴板。

轮廓仍复用sheet的selection.normal/hover，内黑边共用实际格线，白边向外。定位、渲染和命中分别使用Skin::selectionMaterialBounds/drawSelectionBorder/selectionContains；透明中心不触发移动，外扩可见边框能触发移动。连续图层/帧范围不逐格套白框，cel正式选择与包围框分开。

## 仍依赖其他模型的分支

原生当前只承接普通RGBA图层与cel。旧版图层组/折叠组、蒙版行、文字、调整层、tilemap/free-tile对象及其拖动兼容约束尚缺原生对象模型，本批不宣称这些分支完成。相关分支不得用普通RGBA行为替代，也不把整体legacy迁移状态改成完成。

## 验证

旧版定向测试：`workspace-animation-drag-copy.test.ts`、`timeline-selection-contours.test.tsx`、`useAnimationGestures.test.tsx`共33项通过。

原生定向测试：`timeline-interaction`验证Ctrl/Shift、矩形集合、重叠/越界移动、复制、批量图层排序、首帧前插入副本、链接兄弟以及选择/活动上下文撤销恢复。`layers-render`增加真实按下/移动/松开、取消、外扩边框移动、稀疏cel包围框逐像素alpha/命中以及Alt帧复制测试。

最终验证：Release正式产物构建成功；`document-transactions`、`timeline-interaction`、`layers-render`、`layer-context-menu`、`timeline-model`五项CTest全部通过，`--animation-check`退出码为0。核对了多cel包围框和图层选择截图。播放/循环段播放/跳帧入口清空正式图层与cel选择，沿用`workspace-commands-animation-playback.ts::setAnimationPlaying`的清理语义。来源覆盖检查为140文件通过，整体legacy对齐仍为INCOMPLETE。

图层列表空白点击：沿用`useLayerSelectionGuides.tsx::clearPanelBlankSelection/clearSelectionFromBlank`与`workspace-commands-animation-selection.ts::clearAnimationSelection(true)`，清空显式图层/帧/cel选择及锚点，保留活动层/帧。列表右侧与底部空白都生效；其他面板、行控件和工具栏保留选择；选择素材可见边框先处理拖动，空白右键继续新建菜单。native以活动ID独立保存上下文，无需旧版非显式selectedLayerIds镜像。
空白点击回归：layers-render覆盖三类显式选择清除、活动层/帧及历史保持、其他区域和行按钮保持选择、右键清除后保留菜单入口；timeline-interaction、layers-render、layer-context-menu三项全部通过。
