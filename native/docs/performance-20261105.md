# 全局响应优化（2026-11-05）

用户反馈所有操作卡顿。此次先修复事件入口中可证实的全局重复工作；不能把单项基准称为全部功能无卡顿。

## 已改动

- `editor_input.cpp`：快捷工具同步限定为键盘、鼠标、焦点事件；已有按键、临时工具、笔刷尺寸调整、手型、取色或色板采样状态时保留 timer 清理。输入分发前后同步保留，避免事务完成和上下文切换时漏掉临时工具恢复。删除松键处理里两次完全相同的重复同步。
- `shortcut_model.h`、`editor_shortcut_inputs.cpp`：先判断当前按键是否满足绑定，再进行全目录冲突解析；无按键时快速返回。仅对候选临时工具查询可用性，避免扫描菜单命令表。保留冲突优先级、允许共享、子集匹配和最长组合优先。
- `shortcuts_test.cpp`：与修复前算法对照默认、重映射、冲突配置及八种按键状态；额外检查无按键不查询工具可用性、禁用工具不激活。

## 源码对照

旧版 `legacy/src/renderer/src/components/app/useAppShortcutSettings.ts:22` 用 useMemo 按配置缓存 `deriveShortcutConflicts`；`core/shortcuts.ts:547` 定义目录顺序、冲突及共享规则。本次保留其规则，先移除不匹配输入和无关消息的计算。

本地固定版本 Aseprite `src/app/ui/key.cpp:504` 的 `Key::isPressed` 按键盘/鼠标消息类型检查已有 accelerator，`src/app/ui/keyboard_shortcuts.cpp` 查询已构造 Key。MoonSprite 原生入口原先会对 paint/timer 消息重复调用完整匹配，且先检查冲突再检查实际按键。此次独立修复对应额外开销。Aseprite app 源码仅作方案对照，没有复制；许可范围见 `native/THIRD_PARTY.md`。

Aseprite `src/ui/manager.cpp` 的 flushRedraw 和编辑器局部 canvas invalidation 使用脏区。MoonSprite 已使用同一 MIT UI 调度器，并有画布/时间线缓存与局部重绘，本次保留其像素语义。透明窗重绘、大作品录制提交、全量 refresh 的额外成本仍需各自测量，不能只凭源码扫描宣称已解决。

## 验证

- Release 模型测试通过：快捷键默认/重映射/冲突/禁用/空按键对照，以及完整 document-raster-history-tests。
- 同一进程 2,000 组 quick matcher 输入：修复前算法 395.580ms，优化后 100.276ms（约 3.94 倍）；此项不含实际 Editor 的工具可用性查询，不能等同整应用提速。
- 来源覆盖检查通过（625 个源码/测试/脚本），全功能迁移仍不完整。
- 唯一正式产物 `native/build/Release/moonsprite-native.exe` Release 构建成功。
- 正式程序 `--drawing-pan-performance-check`、`--shortcuts-input-check`、`--wheel-performance-check`、`--modifier-brush-performance-check`、`--hit-testing-performance-check` 全部 exit 0。
- 绘画/平移：画笔四点一批平均 7.248ms，橡皮 8.423ms；平移完整重绘 1.984ms、复用 1.370ms；作品像素、历史、撤销重做一致。
- 滚轮局部重绘：无对称轴 3.552ms、有对称轴 4.602ms，完整 framebuffer 对照一致，内容上传次数不变。
- 尺寸调整：局部路径无全局布局/外框重绘，framebuffer、参数持久化对照通过。
- 命中：三种布局与父可见性组合通过逐控件等价检查，无关 viewport 回调为 0。
- 同一绘画/平移回放的 opt-in profile：修改前 canvas-paint 5,056 次/509.776ms，修改后 5,055 次/225.143ms；修改后 shortcut-sync 364 次/3.513ms。桌面尺寸和运行环境未固定，此数据作为诊断记录，不作严格整机提速比例。早期 `native/build/test-tmp/drawing-pan-performance.txt` 为不同工作目录下的旧报告，未用于正式前后比值；本轮报告在仓库根 `build/test-tmp/`。
- 基准仅测软件消息回放，不代表硬件输入到屏幕延迟。尚不能保证每项功能都无卡顿；大作品录制和全量 refresh 仍需专项测量。


## UI 移动与尺寸调整专项

- `editor_panels.cpp` 对 custom docking 几何作有界单条缓存：比较 Editor、区域、浮动视口、全部可见性、左右宽度、底部尺寸/比例及每个组的 tabs/active/dock/weight/width/floating/floatingArea/fixedExtent。直接写入 docking 字段也会使结果失效，无需人工 revision。
- `layoutPanelTabs(only)` 原来结束时无条件布局参考图/历史/平板/瓦片集/笔刷库/实例栏；现在只布局同一组。完整布局仍更新全部。
- picker 尺寸相同不重复 setBounds，避免 Aseprite MIT Widget::setBounds 无条件发送 resize 的成本；未修改上游框架，也未改变颜色计算。
- 正式 Release 构建成功；`--ui-geometry-performance-check` exit 0。200,000 次同输入几何查询：直接 layout 109.663ms，缓存 30.773ms，约减少72%。缓存逐项变更和窗口尺寸对照通过。
- 200 个浮动移动输入合并一次更新，约2.109ms；200 个尺寸调整输入合并一次更新，约1.944ms；移动复用一次 move_region。两者完整 framebuffer 对照通过。该时间不包含屏幕呈现。
- 连续12次窗口尺寸改变并完整绘制，加最后恢复尺寸总计434.251ms，仍有整体重排/绘制成本；尚未验证真实 Windows 标题栏拖动、DPI变化及硬件呈现延迟。
- 命中、滚轮缩放、绘画/平移回放全部 exit 0。来源覆盖与 diff 空白检查通过。
- 旧 `--workspace-check` 在修改前正式程序就失败：Scrollable region has no sheet scrollbar: home。此次调用旧 smokeDockResizeHover 又在 Palette split corner lost resize hit after window size change 断言失败，不能据此声明整个旧工作区验收通过。新的专项入口独立执行本次的几何、浮动移动/resize和窗口重排检查；原有入口未删。build/ui-geometry-performance-error.txt 可能保留前次失败文本，以本次进程 exit 0 和最终报告为准，未删除旧证据。


## 后续文本测量优化

- `pixel_font.cpp::inkBounds` 过去逐个亮点合并矩形；现在将字形各行按位合并，以首尾非零位及行范围得到相同墨迹边界。每次仍读取实际文本，没有无界字符串缓存，也不改变字距、基线或绘制。
- `smokeRasterEquivalent` 对全部25,314个字形分别加入空格及邻接拉丁字符，与旧像素扫描算法精确对照；额外覆盖空文本、全空格、中文、缺字。全部通过；原有1x/2x不透明/半透明绘制对照保留并通过。
- 同进程20,000次固定文本测量：旧算法90.896ms，新算法9.077ms，约10倍。此为文本测量提速，不是整应用提速。
- 唯一正式Release构建成功，`--skin-resize-check`、`--ui-geometry-performance-check`、`--hit-testing-performance-check`、`--wheel-performance-check` exit0。来源覆盖、diff检查通过。
- 本轮窗口缩放回放437.825ms，与前轮434.251ms没有明确改善；浮动移动约2.243ms、尺寸调整约1.833ms（各200输入合并一次）。因此窗口整体缩放瓶颈仍未解决，不能用字形微基准替代真实响应验收。


## 控件层叠与大选择轮廓

- raiseDockWidgets 先收集目标顺序，按最后一次 raise 去重，并在实际尾部顺序已相同时跳过所有 sibling vector 搬移。保留原modal、floating、flyout顺序。MOONSPRITE_STACK_REFERENCE 在smoke中与旧逐次raise算法对照；UI几何、命中、大时间线均通过。27次排序总计3.180ms；窗口缩放12次回放472.646ms，未证实整体缩放提速。
- timelineOutlines 原先对每个已选Cel构造字符串槽位、线性查找所有视觉行；现在以可见行索引排除屏幕外项目，仅为可见帧/行保留槽位。每次重算，不引入选区失效缓存。素材、偏移、裁剪和selectionContains保持不变。
- MOONSPRITE_OUTLINE_REFERENCE 保留原始全选择扫描，精确比较四个可见边界；正式大时间线、分组timeline（含逐像素alpha/命中）、timeline密度检查exit0。
- 256层x1000帧、16,384选择：轮廓平均9.572ms降至2.789ms（约71%）；同目标拖动4.170ms至2.962ms。滚动35.875ms，与此前36.432ms相近，不宣称滚动瓶颈已解决。测试为软件回放，不等于输入到屏幕延迟。
- 正式Release已更新；来源覆盖及差异检查通过。改动未自动提交推送。


## 2026-11-06：时间轴绘制循环

- 定位到链接标记循环中每个run/cell重复构建TimelineRows（整棵图层树），并在每个run重复查询所在层。改为每次合成构建一次，每行查询一次；不跨绘制缓存，分组折叠和mask拓扑仍立即生效。
- 原控件循环的initializer_list复制九组vector；每个按钮还线性搜索header/cell列表。改为引用原列表并直接使用类别与slot索引，保留原绘制顺序、裁剪、缩略图、禁用帧斜线和轮廓素材坐标。
- legacy依据：LayersPanel.tsx:100的celLookup、deriveTimelineLinks.ts的拓扑/链接块分离与复用。此项仅消除原生绘制内重复计算，不声称补齐全部legacy链接视觉语义。
- Aseprite固定源码src/app/ui/timeline/timeline.cpp:1679-1745先取得可见范围，再按行查询layer，内层仅处理帧。仅作方案对照，没有复制app代码，许可仍按THIRD_PARTY.md。
- 修改前后相同大时间轴诊断回放均979次timeline-paint：累计6794.53ms →2403.40ms（约降低65%）。这是本次绘制scope累计时间，其他scope也有波动，不能当作严格整应用提速比例。完整滚动32.2825ms →37.3186ms，未观察到整体提速；去掉profile后37.2669ms。
- 唯一正式Release构建成功。large-timeline、group-timeline、timeline-density、ui-geometry检查均exit0。现有滚动partial/full framebuffer对照、池化控件动作/命中、history/revision/upload不变检查通过。窗口resize12次372.744ms，浮动移动/调整尺寸framebuffer等价通过；不作真实Windows拖拽/硬件呈现验收声明。
- 修改保存在本地，未自动提交或推送。


## 2026-11-06：每次合成共享视口裁剪

- paintTimelineGrid原先对每个可见按钮调用paletteViewport，再调用timelineMaterialViewport；两者均会经scroll metrics重建TimelineRows。当前同步合成期间视口不变化，现在仅计算row/frame/header三类material clip，所有对应按钮共享；不修改输入回调，不跨合成保存几何，不改选中边框、透明中心与外扩命中规则。
- MOONSPRITE_TIMELINE_CLIP_REFERENCE在smoke中逐个已绘制控件比较共享clip与原回调+material计算完全相等。开启后large-timeline、group-timeline、timeline-density、ui-geometry全部exit0；保留现有局部/完整framebuffer比较、分组mask、缩略图密度、滚动边界与浮动移动/resize验证。另行hit-testing-performance检查exit0。
- 原生适配依据仍为legacy LayersPanel.tsx及layer-timeline-cell-window.ts的窗口化与共享视口；Aseprite固定timeline/timeline.cpp:1692,1726在内层帧循环外设置header/cel裁剪，方案参考而未复制app代码。
- 正式Release构建exit0。无profile/无clip oracle的256层x1000帧滚动20次均值：上轮37.2669ms，本轮10.387ms（约降低72%）。开启profile但关闭oracle时11.7221ms；不等于真实硬件输入至屏幕延迟。合成次数仍20、外框绘制0，无文档/history/upload变化。
- 诊断回放timeline-paint累计2324.84ms/980次，与前轮2403.40ms/979次不能解释滚动全部差值：回放还包含大量直接outline调用且运行环境有波动。因此主要报告完整滚动独立指标。大选择轮廓本轮5.114ms，没有新的轮廓算法改动或提速声明。
- 开启clip oracle的窗口resize12次554.952ms，含逐控件旧计算对照开销，不与上轮无oracle372.744ms比较；尚未取得窗口整体resize改善证据。没有人工UI/硬件呈现验收。
- 正式产物仍为native/build/Release/moonsprite-native.exe。修改本地保存，未自动提交推送。


## 2026-11-06：工具栏空尺寸事件

- editor_tools.cpp：属性控件与工具轨道仅在矩形变化时setBounds；PixelEntry保留每次属性布局resize以更新文字/后缀/光标视口。finishToolScrollLayout在水平偏移为0时跳过相同尺寸重放及子控件resize，仍更新可见性与输入视口，非零偏移逻辑保持。
- 上游MIT Widget::setBounds无条件调用onResize；此次只在业务层跳过空操作，没有修改上游。依据legacy EditorToolOptions.tsx与useToolOptionsScroll.ts保留布局与滚动语义，没有采用隐藏/显示批处理以免影响focus/capture。
- MOONSPRITE_TOOL_LAYOUT_REFERENCE在smoke中恢复本轮三处旧无条件路径；同一正式exe旧/新ui-geometry均exit0，浮动移动/resize framebuffer等价通过。26次tool-options-layout累计旧23.9267ms、新21.2785ms（约11%）；窗口12次旧492.010ms、新457.073ms，另一次新535.226ms，环境波动明显，不能声称窗口整体稳定提速。
- 正式Release两次构建exit0；tool-property-shortcuts、modifier-brush-performance检查exit0。tool-rail-check在写出raster enabled/mask enabled/complete后退出发生访问异常0xC0000005；同一exe恢复旧路径仍同样失败，此项不作为通过。退出异常的根因尚未定位，此结论只排除本轮三处空事件跳过作为必要触发条件，不代表全部历史代码无缺陷。
- 来源覆盖与diff检查结果另见构建日志。修改未自动提交、推送，未做人工UI/硬件延迟验收。


## 2026-11-06：空裁剪绘制检查

- paintTimelineGrid在clipColumn后检查空clip，恢复saveClip后立即返回，避免全遮挡时计算视口/图层树/轮廓。MOONSPRITE_EMPTY_CLIP_REFERENCE在smoke中恢复旧路径。不改变有可绘像素时的绘制或输入。
- 同一正式exe旧/新ui-geometry均exit0，浮动移动/resize framebuffer等价。窗口12次408.331ms/416.215ms；timeline-paint均1913次，累计110.045ms/120.306ms。未观察到收益，此防御性快速返回不是当前窗口瓶颈的解决证据。
- large-timeline、group-timeline检查exit0；大时间轴滚动本轮18.0736ms，环境波动，不作新增提速声明。窗口整体重绘仍待进一步定位；工具轨道退出访问异常也仍未解决。正式Release构建exit0，修改仅本地保存。


## 2026-11-06：时间轴与damage不相交时跳过网格计算

- 空clip快速返回未解决问题，进一步检查发现非空damage可能完全落在时间轴之外。paintTimelineGrid先独立绘制loop track，再以row/frame/header material viewport并集（额外扩大2*uiScale保留选择clip外扩）判断damage；不相交则恢复clip返回，避免链接和outline计算。没有收窄任何现有绘制clip。
- layer/frame拖动插入线不受上述视口clip限制，因此其活动手势显式禁用此优化；保留旧完整路径。GIF插入线仍在frame viewport内裁剪。MOONSPRITE_GRID_DAMAGE_REFERENCE在smoke中恢复旧工作。
- 同一exe旧/新窗口几何检查均exit0，timeline-paint1913次累计152.871ms/63.113ms，窗口12次590.788ms/423.533ms（单轮环境有波动，不作严格整应用加速比例）。加上插入线保守例外后最终Release构建exit0；最终无profile窗口12次428.012ms、大时间轴滚动10.1197ms。
- 最终正式程序ui-geometry、large-timeline、group-timeline、playback-floating全部exit0；含浮动move/resize framebuffer、滚动partial/full framebuffer、分组/选择alpha命中和循环节捕获拖动检查。前一构建timeline-density亦exit0，最终差异只放宽插入线手势绘制范围。旧工具轨道退出异常未在此轮解决。
- 来源覆盖及diff检查通过。修改本地保存，未提交推送；真实Windows拖动和硬件呈现延迟尚未验收。


## 2026-11-06：无显式选区时跳过轮廓构造

- timelineOutlines在创建TimelineRows前检查formal Cel、virtual、mask及手势virtual/mask placements，同时扫描原行/帧控件timelineSelected标记。所有来源均空才返回，不把活动背景当显式选区；不缓存状态。
- MOONSPRITE_EMPTY_SELECTION_REFERENCE对快速返回候选执行旧算法，断言其轮廓确实为空。正式Release构建exit0；开启此oracle的large-timeline、group-timeline、timeline-density、playback-floating全部exit0。无oracle的ui-geometry亦exit0，framebuffer等价通过；窗口12次506.345ms，仍有环境波动，未证明整体提速。
- 本轮减少无选区时树/视口/轮廓临时对象构造，不宣称特定加速比例。来源覆盖和diff检查通过后提交推送dev。原工具轨道退出访问异常、真实窗口缩放响应仍未解决。


## 2026-11-06：无分组图层树直接路径

- State版buildLayerPanelTree在groups为空且layer ID唯一时直接输出native top-first根节点，跳过底序引用转换、map、stable_sort及递归。无效groupId仍按根节点处理；重复ID回退原通用算法，保留其tie语义。分组树逻辑未变。
- layer-panel-tree-tests新增空/单/多/256层、重复ID、孤立groupId、未知collapsed ID与原通用路径逐项对照，exit0；原分组选择与TimelineRows测试也通过。256层2000次构造同进程generic183.892ms、fast26.3628ms，约降低86%，仅表示树构造微基准。
- 正式Release完整重编译成功；large-timeline、group-timeline、timeline-density回归exit0。该公共头文件引发较大依赖范围重编译，不是应用运行耗时。实际窗口和滚动指标另记录，不将树构造微基准当作整应用提速。
- 最终ui-geometry exit0：窗口12次333.071ms，framebuffer等价通过。大时间轴滚动6.087ms、同目标拖动2.492ms；较前轮10.120ms有改善，但非同进程新旧对照，不给出严格整应用比例。工具轨道退出异常和真实硬件呈现仍未验收。本轮验证后推送dev。


## 2026-11-06：缩略图模式跳过无输出链接圆点扫描

- 原链接run循环仅在!timelineThumbnailSize时绘制圆点，隐藏时间轴也不会访问行；现在将判断移到整个pass外，避免无输出情况下构建树/metrics和逐Cel resolveSurface。可见圆点、缩略图、选择与命中均保持。
- 同一正式exe用MOONSPRITE_LINK_PASS_REFERENCE恢复旧扫描，旧/新timeline-density均exit0。394次timeline-paint累计59.439ms/43.852ms（约降低26%，单轮软件诊断而非整应用提速）。正式Release构建exit0；large/group回归结果随本轮命令输出记录。全六种密度的现有geometry、selection alpha/hit、缩略图检查通过。
- 本轮仅移除必然无绘制结果的查询；图层内容缓存仍按需建立。工具轨道退出异常、实际Windows缩放延迟尚未解决。来源覆盖/diff通过后推送dev。


## 2026-11-06：布局与绘制共享滚动指标

- layoutTimelineScrollBars从已计算metrics直接生成row viewport，删除未使用的frame viewport求值。paintTimelineGrid以一次metrics计算生成row/frame/header及material clips，链接圆点复用已有frameMaterial。避免多次构建相同TimelineRows；没有跨调用缓存，也未改变输入回调。
- MOONSPRITE_VIEWPORT_METRICS_REFERENCE逐次对照原实时viewport/material函数，保留hidden timeline的零宽与零高header，以及横纵滚动条外扩规则。开启对照的large-timeline、group-timeline、timeline-density、ui-geometry、playback-floating均exit0；正式Release构建、来源覆盖与diff检查通过。
- 关闭对照的大时间轴滚动20次平均4.180ms，16,384选择轮廓4.164ms、同目标拖动3.453ms。与历史不同进程回放不构成严格比例，不宣称整应用同比提速。现有framebuffer/选择alpha命中/分组/循环节回归保持。
- 本轮提交推送dev。真实窗口输入至呈现延迟及工具轨道退出异常仍未解决。


## 2026-11-06：大选择先排除屏幕外行

- timelineOutlines的selected Cel循环在dr==0时先按可见行ID排除屏幕外项目，再查询layer/frame索引；有纵向位移时保留原layer index平移，并在查询frame前排除目标不可见行。没有缓存、素材或选择语义变更。
- 正式Release构建exit0；MOONSPRITE_OUTLINE_REFERENCE开启的大时间轴、分组、密度检查全部exit0，继续与原全选择扫描精确比较四个边界。来源覆盖及diff检查通过。
- 无oracle回放selection_outline_mean4.293ms、same_target_drag2.724ms、scroll8.839ms。与前轮outline4.164ms接近且环境波动，没有证明加速；只确认无关行索引查询减少，不作整应用性能结论。退出异常和真实窗口缩放仍待解决。本轮验证后提交推送dev。


## 2026-11-06：窗口重排/背景绘制分项与栏目damage排除

- 新增opt-in window-layout(slot14)、panel-backdrops(slot15)，关闭诊断时不读时钟。首次窗口回放中layout18次60.716ms、backdrops1901次157.543ms，提示子控件背景重绘是剩余开销之一。
- paintPanelBackdrops的局部panel helper在目标物理矩形与当前damage不相交时跳过fill/skin draw。Skin::draw的非icon九切片/lattice目标都限制在rc内；没有缩窄clip、修改皮肤素材或浮动chrome。MOONSPRITE_PANEL_DAMAGE_REFERENCE恢复旧工作。
- 正式Release构建exit0。旧/新ui-geometry均exit0并通过浮动移动/resize framebuffer比较。backdrops累计251.429ms/210.641ms，窗口12次684.307ms/511.740ms；新旧其他scope同样波动，只作诊断，不能把全部差值归因本轮。group-timeline检查exit0；其余运行结果见本轮命令输出。
- 保留真实Windows呈现延迟与工具轨道退出异常为未解决项。来源覆盖和diff通过后提交推送dev。


## 2026-11-06：时间轴背景复用滚动指标

- paintTimelineBackground的header clip原先调用两次timelineScrollMetrics，corner又直接调用一次及通过timelineRowViewport调用一次。改为一次同步metrics供header/corner使用；保留clip、素材和顺序，不新增跨调用缓存。
- MOONSPRITE_BACKGROUND_METRICS_REFERENCE在双滚动条时将派生corner row与原实时函数比较。正式Release构建exit0；开启对照的large-timeline、group-timeline、timeline-density、ui-geometry全部exit0，framebuffer等价通过。来源覆盖/diff通过。
- 本轮带oracle窗口12次762.962ms，大时间轴scroll6.719ms、outline4.189ms。环境波动且oracle增加旧计算，不用这些数字支持整体加速结论；仅确认减少重复metrics/树构造。窗口缩放和退出异常仍未解决。验证后提交推送dev。


## 2026-11-06：半透明字体连续像素段合并

- PixelFont::draw半透明路径把每行相邻set bits合成不重叠水平fill，替代每像素一次fillRect；不透明glyph raster、基线、字距与字形不变。不基于Graphics clip推断逻辑缩放，避免坐标转换风险。
- smokeRasterEquivalent保留旧逐像素oracle，扩展alpha1/128/254/255、scale1/2、普通/窄clip、非零Graphics origin，逐像素一致。正式skin-resize（含此oracle）、ui-geometry、wheel-performance均exit0，Release构建/来源覆盖/diff通过。
- 本轮减少连续笔画的绘图调用，未设置独立绘制微基准，不报告整体提速比例。窗口缩放和工具轨道退出异常仍未解决；验证后提交推送dev。


## 2026-11-06：退出异常定位所需的匹配地址映射

- 重新复现tool-rail-check：工具矩阵complete后exit0xC0000005。发现Release目录PDB最后更新2026-10-15，远早于当前exe；此前依据该PDB解析出的UnDecorator符号不可信，撤回其定位意义。
- 为唯一正式MSVC Release链接添加/MAP，生成匹配当前exe的moonsprite-native.map，不修改优化等级/入口/版本，不提交生成物。正式Release重链接exit0。
- 新构建Windows Application1000事件fault RVA0x9eb73c；同次链接map的preferred base0x140000000，widgetColumn起始0x1409eb5e0，下一函数workspaceLayout0x1409ebaf0。因此异常处于Editor::widgetColumn+0x15c（editor_panels.obj）。这是地址归属证据，不是根因或修复证明。
- widgetColumn读取多种panel owns/scrollbar及成员vector；退出销毁时仍有回调访问是待验证假设，不能未经调用链证据就更改销毁行为。异常仍复现，本轮仅完善诊断基础，不宣称性能提升或稳定性修复。来源覆盖/diff通过后提交推送。


## 2026-11-06：跳过失效的排队焦点通知

- 用当前Release的dumpbin反汇编核实RVA0x9eb73c指令为读取目标Widget的parent（偏移0x240），位于内联TilesetPanel::owns循环；不是此前不匹配PDB所指的符号。对照Aseprite MIT ui/manager.cpp：setFocus排队保存raw newFocus，Widget销毁时removeMessagesFor只移除recipient，pumpQueue仍先发送给filters，因此已删除目标仍可能进入原生Manager焦点过滤器。
- 原生Manager只在FocusEnter的newFocus非空且等于Manager当前getFocus时更新overlay/命令scope；不解引用旧目标，也不对过时焦点执行widgetColumn扫描、栏目重排和invalidate。保持正常当前焦点路线，legacy useAppCommandScope.ts的有效surface记忆语义不变。未复制Aseprite app代码。
- --tool-rail-check新增把已删除临时Widget作为FocusEnter payload送入实际Manager过滤器的回归，再跑原工具矩阵和事件循环退出。正式唯一Release构建queued-focus-build.log exit0；工具轨道由此前0xC0000005变为exit0，stage到complete。焦点恢复、ui-geometry-performance、hit-testing-performance均exit0；来源覆盖625文件与diff检查通过，迁移整体仍未完成。
- 本轮确认稳定性修复和过期通知的无效工作减少；未对真实窗口输入至呈现延迟作量测，不宣称整体缩放已流畅。验证后提交推送dev。


## 2026-11-06：栏目遮挡裁剪先排除无关damage

- clipColumn原先为每个可见悬浮栏目构造gfx::Region并求差，即使与当前子控件damage完全不相交。现在先以原damage物理矩形作相交判断，再构造并求差；遮挡顺序、group focus、素材和坐标转换保持。对照Aseprite MIT ui Graphics::clipRegion及LAF gfx Region求差接口，没有复制app代码。
- MOONSPRITE_OCCLUSION_REFERENCE在同次调用执行原全量求差，与优化结果分别作双向差集，要求均为空。开启对照的ui-geometry-performance、group-timeline、playback-floating均exit0；geometry检查包含悬浮移动/resize局部与全量framebuffer比较。唯一正式Release构建occlusion-damage-build.log exit0，来源覆盖625文件与diff检查通过。
- 关闭对照的geometry profile exit0：12次窗口resize累计498.296ms，window-layout18次54.638ms，panel-backdrops1901次198.335ms。无配对稳定基准，不把历史运行差值当本轮提速；减少无关region构造/求差已由代码与区域等价对照确认。真实Windows输入至呈现延迟仍未验证，不宣称整应用流畅。验证后提交推送dev。


## 2026-11-06：调色盘背景共用遮挡裁剪，延后隐藏栏目布局

- paintPanelBackdrops中palette外框/内容原来连续两次saveClip/clipColumn/restoreClip，二者之间没有几何变更。改用一次裁剪包裹原顺序绘制，减少一次栏目geometry/region循环。palette布局、内容边界仅在实际绘制palette时计算，timeline布局仅在绘制timeline时计算；advanced早退不再构建workspace/三栏目布局，移除未使用picker layout与label闭包。对照Aseprite MIT Graphics的saveClip/restoreClip委托和clipRegion偏移语义，素材与绘制层次不变。
- 唯一Release构建backdrop-clip-reuse-build.log exit0。开启MOONSPRITE_OCCLUSION_REFERENCE的ui-geometry-performance、advanced-mode、playback-floating全部exit0，包含悬浮移动/resize局部与全量framebuffer一致检查；来源覆盖625文件、diff检查通过。未进行人工UI验收。
- 关闭对照的profile exit0：panel-backdrops1901次145.469ms，window-layout18次42.929ms，12次窗口resize359.04ms。上一轮相同profile分别198.335/54.638/498.296ms，多个scope同步变化，非配对稳定测量，不将全部差值归因本轮。仍需真实窗口响应延迟证据，不能据此宣称整体卡顿已解决。验证后提交推送dev。


## 2026-11-06：时间轴背景按damage延后滚动指标

- paintTimelineBackground的TimelineRows/滚动指标仅供左侧表头与双滚动条交角使用。现在在frame/grid原绘制后，对这两处的物理damage保守范围先判断；不相交则跳过metrics/表头/交角。保留timelineHidden早退，表头覆盖1px cell外扩，交角范围涵盖6px横纵条所有组合及最小1px钳位。对照既有Aseprite MIT Graphics clip边界语义，不复制app代码。
- MOONSPRITE_BACKGROUND_DAMAGE_REFERENCE恢复原完整背景路径。ui-geometry检查新增22个窄clip，包含窗口外部区域、表头各段、实际交角四周，原/新路径完整surface逐像素比较；保留既有悬浮move/resize局部与全量画面对照。另以独立公式枚举width/height -25..120和横纵条四组合，验证交角位置总在保守边界内。
- 正式唯一Release两次构建exit0；最终geometry含22clip exit0；初次生产算法构建的large-timeline-performance/timeline-density也exit0（后续仅补测试采样）。来源覆盖625文件/diff通过。最终profile：panel-backdrops1901次135.807ms，window-layout18次40.544ms，12次resize354.175ms。非稳定配对基准，不宣称整体缩放解决；真实输入至呈现延迟仍需验证。验证后提交推送dev。


## 2026-11-06：调色盘布局循环共享可视区域

- layoutPalette在每个swatch的clip/visible及共享选择overlay中重复paletteViewportBounds，间接重复columnLayout/columnChrome/geometry。两条滚动条visibility/configure及restorePaletteView之后，在当前布局调用内只计算一次；逐色块输入paletteViewport回调仍实时查询，选择素材/命中/外扩与排序不变。对照Aseprite MIT Widget setBounds/visibility和原生scrollbar configure确认循环没有改变栏目几何。
- MOONSPRITE_PALETTE_VIEWPORT_REFERENCE逐色块将本次共享矩形与原实时函数精确比较。正式唯一Release构建palette-layout-viewport-build.log exit0；开启对照的palette-manual、palette-growth、ui-geometry-performance、wheel-performance全部exit0，包含已有选框拖动/撤销/重做及窗口局部与全量framebuffer检查。来源覆盖625文件/diff通过。
- 本轮profile启动时前一个wheel检查仍在运行，进程观察使用Get-Process同名列表，不具备性能隔离，因此不采用该profile数值作速度证据。确认重复几何查询从每色块多次改为当前布局一次，但真实窗口输入至呈现延迟仍未验证，不宣称整体卡顿解决。验证后提交推送dev。


## 2026-11-06：真实Win32窗口resize诊断

- 新增--native-window-resize-check，唯一正式入口启动，复用prepareFocusResumeCheck设置smoke隔离和内建调色盘，再以smokePrepareDockSplitRepaint配置栏目。16次SetWindowPos实际改变原生客户区，分别记录同步调用与后续generate/dispatch/redraw/flip耗时，并校验Skia surface尺寸与客户区一致。仅测试入口，不改变生产交互。输出build/test-tmp/native-window-resize.tsv；不包含DWM/显示器呈现延迟。
- 对照Aseprite MIT Manager构造中的handleWindowResize和dispatchMessages、LAF SkiaWindowBase::onResize：WM_SIZE先resizeSkiaSurface，再同步enqueue ResizeDisplay+dispatch，后者布局/flushRedraw/flip。因此直接Editor::setBounds的旧回放漏掉原生表面重建及同步回调，不能作为真实Windows窗口流畅的证明。
- 最终正式Release构建native-window-resize-fixture-build.log exit0；独占运行检查exit0，全部surface/client尺寸一致。排除首个未改变尺寸的热身样本，15次total平均39.554ms/max43.636ms，window_call平均38.269ms，后续drain/flip平均1.285ms。profile含初始化/恢复：window-layout20次50.395ms，但canvas-paint与panel-backdrops各2777次，分别109.006/215.258ms，geometry180722次25.376ms。证据将下一步导向子控件背景重放与画布空clip开销；不能将这些累计值解释为单次调用耗时或GPU延迟。
- 本轮是定位进展，无生产性能修复；真实窗口resize仍约40ms/次。来源覆盖625文件/diff通过，验证后提交推送dev。


## 2026-11-06：画布空clip跳过无效准备

- paintCanvas在viewport/column occlusion之后检查实际Graphics空clip；透明子控件父背景重放没有画布像素时，跳过尺寸文字/皮肤/内容缓存/辅助绘制。保留preview checkerboard同步与选区antsTimer启动，下一次实际画布曝光照常ensureContentCache。对照Aseprite MIT Widget::paint透明控件parent重放、Graphics clip语义，无app代码复制。
- MOONSPRITE_CANVAS_EMPTY_REFERENCE恢复旧完整工作。唯一Release构建canvas-empty-replay-build.log exit0；ui-geometry-performance（含悬浮局部/全量framebuffer）、drawing-pan-performance、playback-floating全部exit0。来源覆盖625文件/diff通过。
- 同一二进制独占顺序执行reference/optimized真实Win32 resize检查均exit0、surface/client一致。两者canvas-paint均2921次；content-cache2921→234次，canvas-paint累计121.868→43.805ms，panel-backdrops239.246→220.735ms；排除首热身后resize平均42.939→35.944ms。只有一组先旧后新，环境/顺序影响未排除，不宣称稳定百分比；无效画布准备显著减少有调用计数证据。实际输入至显示延迟和整体卡顿仍未验收。验证后提交推送dev。


## 2026-11-06：状态栏文字按已有裁剪带排除无关重绘

- 核对Skin::draw发现已复用Aseprite九切片快速路径，未在缺少矩阵证据时增加通用皮肤裁剪。paintStatusText现按原状态/缩放两段clip的并集物理矩形排除无关damage，再格式化percent与计算inkBounds；原clip和文字位置/顺序不变。MOONSPRITE_STATUS_DAMAGE_REFERENCE恢复旧工作。对照Aseprite MIT Graphics getClipBounds与UiPaintScale，未复制app代码。
- 唯一Release构建status-damage-build.log exit0；ui-geometry-performance局部/全量framebuffer、drawing-pan-performance、advanced-mode均exit0。真实窗口reference/optimized均exit0及surface/client一致；15个变化样本均值51.033/59.279ms，未证明加速且后者更慢，不能据此宣称窗口改善。仅确认无关文字格式化/字形计算减少，整体卡顿未解决。来源覆盖625文件/diff通过，验证后提交推送dev。


## 2026-11-06：父背景重放先排除无关栏目

- 对照Aseprite MIT Widget::paintEvent/paint确认透明控件会隐藏自身并重放parent背景，原生沿用此机制不变。paintPanelBackdrops在palette/picker/history/instances进入clipColumn/皮肤前，使用实际outer与content联合边界排除无关damage；包含压缩布局下content可能超出outer的情况。无选框、命中或重排语义变化。MOONSPRITE_BACKDROP_COLUMNS_REFERENCE恢复此前栏目全量工作。
- 唯一Release构建backdrop-columns-build.log exit0；ui-geometry-performance含悬浮move/resize局部与全量framebuffer、group-timeline、playback-floating检查均exit0。来源覆盖625文件及diff通过。
- 同二进制独占reference/optimized/optimized/reference四次真实窗口resize检查全部exit0及surface/client一致。每次panel-backdrops约2777次，累计230.007/147.981/175.184/230.440ms，geometry调用175548/165936/169935/182627；窗口变化样本均值37.597/33.701/43.149/38.303ms。背景绘制开销下降有交替采样支持，但整体窗口均值无稳定改善，仍需追查其余重放及原生表面开销，不宣称卡顿解决。验证后提交推送dev。


## 2026-11-06：重绘来源实测纠正——主要是直接碎片绘制

- 新增opt-in MOONSPRITE_REPAINT_TRACE，按PaintEvent::isTransparentBg及clip矩形累计次数，最多4096条key，退出输出TSV；默认不记录/写文件。唯一Release repaint-trace-build.log exit0；真实native-window-resize检查exit0、尺寸一致，关闭trace的ui-geometry-performance检查exit0。来源覆盖625文件/diff通过。
- native-resize-repaint-trace.tsv记录直接绘制3342次（875种clip），透明父背景107次（24种clip）；直接绘制中2298次至少一边<=8px。重复高频例子为左边缘x0,w4的多条窄片，每片约19次。此前仅凭canvas/panel scope调用数把主要成本解释为透明父背景重放，证据不足，现予纠正。
- 对照Aseprite MIT Widget::getDrawableRegion会逐个扣除可见child，再flushRedraw按updateRegion每个rect生成PaintMessage。因此当前扁平控件布局把完整窗口damage切成大量背景碎片，分别进入Editor::onPaint；下一步应减少碎片背景路径中的全量工作/检查合并策略，不能无证据改透明控件。未修改上游依赖或生产绘制语义。本轮定位进展，无性能改善声明，验证后提交推送dev。


## 2026-11-06：项目页签空裁剪跳过全工程准备

- 碎片背景会调用paintDocumentTab；原函数设置project strip裁剪后仍遍历所有projects，计算名称ink并准备皮肤。现检查原clipRect后的实际空clip并配对restore后返回；有像素的路径不变，不推断矩阵坐标。MOONSPRITE_PROJECT_TAB_REFERENCE恢复旧loop。沿用Aseprite MIT Graphics clip语义，无上游修改。
- 正式Release project-tab-empty-build.log exit0；multi-document、ui-geometry-performance（局部/全量framebuffer）、drawing-pan-performance均exit0；来源覆盖625文件/diff通过。真实窗口reference/optimized/optimized/reference均exit0，均值38.745/41.025/34.018/31.112ms，无稳定提速证据。只确认无关全工程字体/皮肤准备被排除；碎片数量和窗口卡顿仍未解决。验证后提交推送dev。


## 2026-11-06：时间轴无关碎片在metrics前排除

- paintTimelineGrid原有精确damage判断位于TimelineRows/滚动指标之后。新增无需行构造的保守material范围，涵盖最小viewport、横纵6px外扩、label宽度与2px选择外扩，在metrics前排除无关碎片。paintLoopTrack保持在此前原位；活动行/帧插入手势绕过跳过。原精确检查保留。与Aseprite MIT Graphics裁剪语义一致，无上游改动。
- MOONSPRITE_GRID_EARLY_REFERENCE执行原metrics并逐次要求保守范围包含精确material union，GRID_DAMAGE_REFERENCE同时绕过新判断。正式最终Release grid-early-final-build.log exit0；开启对照的large-timeline-performance、timeline-density、group-timeline、ui-geometry-performance全部exit0。关闭对照的ui-geometry（悬浮partial/full framebuffer）、playback-floating也exit0；来源覆盖625文件/diff通过。
- 同二进制reference/optimized真实resize均exit0，timeline-paint累计61.421/55.693ms，self49.954/50.272ms；窗口均值42.671/49.618ms，未证明整体改善。对照额外包含边界校验，不能将全部scope差值归因提前排除。仅确认无关碎片不再构造metrics；碎片数量及整体卡顿仍未解决，验证后提交推送dev。


## 2026-11-06：碎片CPU累计耗时证据

- 扩展既有MOONSPRITE_REPAINT_TRACE，为最多4096个clip/background key记录calls、total_ms、max_ms。RAII计时涵盖onPaint所有早退和advanced notice收尾；仅trace启用且key被保留时读取时钟。无生产绘制/输入改动。Aseprite MIT PaintEvent background与Widget flushRedraw逐rect消息语义保持。
- 唯一Release repaint-duration-build.log exit0；启用trace的native-window-resize exit0、surface/client一致，关闭trace的ui-geometry-performance含局部/全量framebuffer exit0；来源覆盖625文件/diff通过。
- native-resize-repaint-duration.tsv：直接3342次累计302.906ms，其中任一边<=8px的窄clip148.493ms；透明父背景107次累计12.663ms（窄clip0.551ms）。此前“碎片是主要来源”的调用计数现在有CPU耗时支持；并非只有大量便宜调用。最高单key约5.025ms/7次。应优先减少窄碎片完整背景计算/考虑绘制合并，不优先改变透明控件机制。trace会增加时钟/容器开销，数值不能代表显示器延迟。本轮诊断进展，尚无生产性能修复；验证后提交推送dev。


## 2026-11-06：未改变的栏目裁剪不再重复提交

- clipColumn记录是否真正扣除了相交浮动栏目；没有扣除时原Graphics::clipRegion只以当前clip bounding rect再次相交，数学上对已有复杂clip仍为恒等。现在省去最后的Graphics/LAF/Skia region clip调用，保留实际surface裁剪。对照Aseprite MIT Graphics::clipRegion及LAF SkiaSurface::clipRegion委托；无upstream修改。MOONSPRITE_NO_OCCLUSION_REFERENCE强制原提交，既有区域双向差集oracle保留。
- 正式Release unchanged-clip-build.log exit0；开启MOONSPRITE_OCCLUSION_REFERENCE的ui-geometry-performance含悬浮partial/full framebuffer、group-timeline、playback-floating均exit0。来源覆盖625文件/diff通过。真实窗口reference/optimized均exit0、尺寸一致，变化样本均值35.021/34.825ms，相近，不能证明整体加速。减少每片重复裁剪操作，未减少碎片数量；整体卡顿仍未解决，验证后提交推送dev。


## 2026-11-06：合并Editor同批背景碎片，保留精确Region

- 对照Aseprite MIT Widget::flushRedraw、PaintMessage::count与Manager::sendMessageToWidget/dispatchMessages：同一widget的rect消息连续排队，count=0收尾，Manager逐条保存/裁剪back-layer，所有绘制结束才flip。Editor输入入口收集同批rect的精确Region，在末条消息临时替换Manager这一层矩形clip，以完整Region调用一次onPaint；随后由Manager照常恢复clip。不是bounding-box重绘，child/top-window孔洞保留；透明父背景Widget::paint重放不走此入口，保持原行为。仅普通不透明非double-buffer Editor生效；surface/bounds/count不匹配或非paint中断会清空并重新invalidate旧damage。没有改上游或复制Aseprite app代码。MOONSPRITE_PAINT_FRAGMENTS_REFERENCE恢复旧入口。
- main原生resize诊断新增opt-in MOONSPRITE_RESIZE_FRAMES逐尺寸截图，输出位于本地build/test-tmp不提交。唯一Release paint-chain-final-build.log exit0；同一二进制reference/optimized各16个尺寸BMP全部逐字节一致。启用trace时背景onPaint总调用3449→126，累计253.945→59.803ms；排除热身的窗口resize均值29.691→18.612ms。trace及截图为证据采集，有额外开销。
- 关闭trace/截图后独占ABBA四轮真实Win32 resize均exit0、surface/client一致：reference32.645ms、optimized23.654ms、optimized23.629ms、reference33.176ms；本夹具均值约下降28%。不包含DWM/输入到显示延迟，不据此宣称全部卡顿消失。
- ui-geometry-performance（含局部/全量framebuffer及悬浮移动/resize）、playback-floating、advanced-mode、drawing-pan-performance、group-timeline、multi-document均exit0。来源覆盖625文件及diff检查通过；迁移完整性仍INCOMPLETE。只提交源码/来源记录/本文，生成物及既有未跟踪文件保留不提交。验证后推送dev。


## 2026-11-06：参数栏相同文本不重复构造字符布局

- 合并背景后最新独占resize profile：tool-options-layout 26次21.775ms，window-layout20次50.976ms，剩余背景38次37.411ms。继续定位参数栏而非假设整体已流畅。
- 核对Aseprite MIT Widget::setText无条件onSetText，Entry::onSetText无条件recalcCharBoxes；旧版EditorToolOptions.tsx受控NumberInput和brush-size测试保留模型值/即时大小显示。layoutToolOptions内22处数值/文本同步使用当前text比较，相同字符串不再提交setText。原focus/profile条件、格式化、改变值刷新、entry尺寸/viewport修正保持，不修改共享Entry API。MOONSPRITE_TOOL_TEXT_REFERENCE恢复旧setter。
- 唯一正式Release tool-text-build.log exit0；reference/optimized真实Win32 resize均exit0、surface/client一致，16尺寸BMP逐字节一致。26次options累计20.917/20.512ms，window-layout51.844/50.064ms，差异小且仅一组，不作整体提速结论。确认省去相同字符串的字体塑形/字符box重建，但参数栏主要开销仍需进一步定位。
- tool-property-shortcuts、modifier-brush-performance、ui-geometry-performance（含局部/全量framebuffer）、tool-rail均exit0。来源覆盖625文件/evidence及diff检查通过，迁移完整性仍INCOMPLETE。验证后提交推送dev；生成物和既有未跟踪文件不提交。


## 2026-11-06：对称按钮不再布局内先隐藏再显示

- 继续沿上轮参数栏热点检查，发现普通笔刷toolControls循环将6个symmetryButtons逐个setVisible(false)，随后layoutSymmetryOptions及finishToolScrollLayout再次显示。对照Aseprite MIT Widget::setVisible，隐藏会freeWidget并Manager::invalidateRect，触发无用兄弟控件区域计算；旧版EditorToolOptions.tsx:1210按supportsSymmetry呈现，未要求中间隐藏。移除这次中间隐藏，原最终可见性/空间判断、其他工具分支及尺寸布局不变；MOONSPRITE_SYMMETRY_VISIBILITY_REFERENCE恢复原路径。无app代码复制。
- 唯一Release symmetry-visibility-build.log exit0；reference/optimized原生resize各16尺寸surface/client一致、BMP逐字节一致。profile参数栏26次21.558→13.252ms，window-layout20次51.993→44.390ms。局部成本下降有实测；无trace/截图ABBA真实resize均exit0，变化样本均值reference23.539、optimized22.948、optimized23.058、reference27.355ms，顺序/系统波动仍存在，不能把局部约38%下降当作整体提速比例。
- ui-geometry-performance含悬浮partial/full framebuffer、symmetry-shortcuts、tool-property-shortcuts、modifier-brush-performance均exit0；来源覆盖625文件/evidence及diff通过。迁移完整性仍INCOMPLETE、整体流畅度仍未全面验收。只提交源码/来源/记录，验证后推送dev。


## 2026-11-06：输入框无滚动偏移时跳过文字测量

- refreshEntryViewport每次输入/绘制/尺寸更新都调用currentContentWidth（UTF转换、Fusion文本/后缀measure、字符box），随后才读取m_scroll，实际只有scroll非零才修正。对照Aseprite MIT Entry::getEntryThemeInfo仅读取状态，现先读scroll，无偏移直接返回；有偏移照旧测量与setCaretPos修正。未更改尺寸、选区、caret或输入模型。MOONSPRITE_ENTRY_VIEWPORT_REFERENCE恢复原测量路径。此前“尺寸不变仍重绘”的候选尚未修改，本轮按已确认的无效测量推进。
- 唯一正式Release entry-viewport-build.log exit0；reference/optimized各16尺寸BMP逐字节一致、surface/client检查通过。profile options26次13.750/11.084ms、window-layout20次45.153/27.853ms，仅一组且后者self下降超过局部节省，存在运行环境影响，不全归因此修复。关闭profile/截图ABBA原生resize均exit0，变化样本均值reference24.107、optimized22.691、optimized22.316、reference23.445ms；夹具中约5–6%差异，不代表DWM/真实输入显示延迟。
- plain-number（多值/后缀、caret/click滚动及文本framebuffer）、ui-geometry-performance（局部/全量framebuffer）、tool-property-shortcuts全部exit0；来源覆盖625文件/evidence与diff通过。迁移完整性仍INCOMPLETE、整体卡顿未全部验收。验证后提交推送dev，生成物及既有未跟踪文件不提交。


## 2026-11-06：弹窗布局去除重复偏好设置预布局

- layoutModal以同一modal先后两次调用layoutPreferences；第二次需保留以覆盖generic modal action按钮位置。审计中间代码无preferenceViewport/scroll/field bounds读取，去掉第一遍，保留最终完整布局。旧版PreferencesDialog.tsx单份控件布局；对照Aseprite MIT Widget::setBoundsQuietly即使尺寸相同也invalidate，重复pass有真实计算/失效成本。MOONSPRITE_DUPLICATE_PREFERENCES_REFERENCE恢复双pass。未修改其他onResize中的preferences调用，未在无modal时省略隐藏清理。
- 唯一Release preferences-layout-build.log exit0；reference/optimized原生resize均exit0、surface/client一致，16尺寸BMP逐字节一致。profile window-layout20次32.251/37.833ms，优化后更慢；无profile/截图ABBA均值31.729/29.714/25.170/23.342ms，顺序波动明显，不能证明整体加速。仅确认每次layoutModal减少一次完整preferences计算，继续需要定位大头。
- preferences-runtime、preferences、dialog-geometry、ui-geometry-performance含局部/全量framebuffer、advanced-mode均exit0。preferences-catalog在wheel-down/container routing失败；打开reference恢复原双pass同样exit1/同一断言，已确认该失败不由本轮引入，尚未修复，不将其报告为通过。失败点位于smokePreferenceCatalog窗口尺寸循环后的滚轮路由检查，后续需定位实际路由/fixture。来源覆盖625文件/evidence及diff通过；迁移完整性仍INCOMPLETE。
- 验证范围如上，仅提交源码/来源/记录并推送dev，生成物及原未跟踪文件不提交。检查生成的native-preferences-catalog-error.txt本地保留。
