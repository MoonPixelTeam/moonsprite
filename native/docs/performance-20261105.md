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


## 2026-11-06：偏好设置滚轮检查使用公共正文起点

- 定位上一轮preferences-catalog失败，临时Manager命中诊断记录point192,54、picked desktop=true、Editor720x600。该点来自旧fixture的modal.y+25；当前用户规格标题21+正文内边距6，DialogLayout::bodyTop=27，实际位于正文外。生产processPreferencesWheel正确拒绝该点，非滚轮功能回归。移除临时main诊断，fixture改为bodyTop+2的正文空白位置，其他所有滚轮目标、方向、批量delta、数字框不消费、容器外不滚动、上下限和溢出导航断言不变。
- 唯一正式Release preferences-wheel-final-build.log exit0；修正fixture后的preferences-catalog完整检查exit0，打开MOONSPRITE_DUPLICATE_PREFERENCES_REFERENCE恢复上一轮双pass同样exit0。上一轮去重布局的偏好设置全面检查缺口现补齐。旧native-preferences-catalog-error.txt是失败时留下的历史文件，成功检查不清除此文件；本轮以捕获到的进程exit0为证，保留本地不提交。
- 来源覆盖625文件/evidence及diff通过。本轮修复验证依据，没有新增生产性能改动或速度声明。生成的14页偏好设置截图与诊断报告不提交。验证后提交推送dev。


## 2026-11-06：顶部菜单宽度收缩饱和后停止重复测量

- layoutTopMenu原循环即使menuBarInsets两侧均已clamp到uiGap，仍尝试最多32轮required()，每轮重新查询全部PixelMenuItem文字ink/sizeHint。现保留原有逐步收缩，发现相邻两轮总宽相等后结束；各边距整数单调下降，相等意味着均饱和。溢出情形仍将barInsetReduction设为原最终32，不改变实际inset、布局、文字或命中。MOONSPRITE_MENU_FIT_REFERENCE恢复原loop。对照Aseprite MIT Menu sizeHint/wrap和现有PixelMenuItem实现，无app代码复制。
- 唯一Release menu-fit-build.log exit0；reference/optimized原生resize各16尺寸surface/client一致、BMP逐字节一致。menu-pointer、ui-geometry-performance含局部/全量framebuffer均exit0。window-input在首个变体命中断言失败（5,8，expected/actual均type15同bounds但widget指针不同）；恢复reference仍同一错误exit1，非本轮引入，尚待定位，不能报告该检查通过。
- 关闭采集ABBA原生resize全部exit0，变化样本均值reference25.209、optimized28.374、optimized25.606、reference23.193ms，无整体提速证据。只确认最窄/无法fit路径不继续无效32轮测量；当前resize夹具未独立量化该路径收益。来源覆盖625文件/evidence及diff通过。迁移完整性仍INCOMPLETE，整体卡顿仍未全部验收；记录window-input缺口后继续检查。生成物和本地错误报告不提交，验证后推送dev。


## 2026-11-06：窄窗口菜单命中失败确认为真实重叠

- 增强smokeWindowInput失败诊断，包含widget地址/parent/id/text，唯一正式Release window-hit-diagnostic-build.log exit0；实际window-input再现exit1。point5,8期望和实际均type15/bounds4,7,46,34，地址不同、parent相同，证明是同父菜单项重叠，不是Win32屏幕坐标换算或期望层级错误。
- 对照Aseprite MIT Menu::onResize：inBar总宽溢出时cpos.x重置、cpos.y增加；native layoutTopMenu随后对所有顶级项统一r.y居中，抹掉换行y并保留换行x，因而不同菜单重叠。此前menu fit收缩到最小仍无法fit，32轮或饱和提前返回均不能解决该产品空间问题。源码和运行证据一致，不能通过放宽hit断言将其标记通过。
- 受用户迁移规则约束，不自行改变菜单交互/隐藏功能入口；已询问用户横向滚动或更多菜单的窄窗溢出选择。待明确后按旧功能入口/素材约束实现并重新验收。当前仅提交诊断改进及证据，不声称性能或命中修复。来源覆盖/evidence及diff检查通过，生成物/错误报告保留不提交，推送dev。


## 2026-11-06：按用户选择实现窄窗“更多”菜单

- 用户明确选择将放不下的顶级菜单收进“更多”。layoutTopMenu复用原PixelMenuItem对象及其callbacks/submenu/enabled状态，menu-owned Property保留完整顺序；先用原顶级指标计算，最小间距仍溢出时将尾部项目移入共享PixelMenu更多子菜单，变宽后恢复原序。原素材/字体/功能入口保留，没有新绘制图标。新用户行为优先于此前禁止自行改变入口规则。
- 核对Aseprite MIT MenuItem::closeSubmenu通过队列释放MenuBox，不能在popup打开时直接删除owner。布局检测已打开子菜单时先cancelMenuLoop，并排队回调在close消息之后重排。普通关闭态复用现有绘制/命中布局。
- 唯一正式Release menu-overflow-final-build.log exit0；window-input在4个原生位置/最大化恢复变体中全部exit0，包含逐点顶级菜单命中、弹出菜单点击/行命中及capture释放，此前重叠失败消失。menu-pointer、ui-geometry-performance局部/全量framebuffer、advanced-mode均exit0。已人工查看window-input-0.bmp：720x600顶栏单行并显示更多，项目/其他区位置不变；没有对所有菜单嵌套状态逐图验收。来源覆盖625文件/evidence及diff通过。
- 本轮修复窄窗口重叠与错误点击，不作性能提速声明。生成物/截图/历史错误报告保留不提交。整体卡顿尚未全面验收，后续继续测量余下热点。验证后提交推送dev。


## 2026-11-06：更多菜单复用与展开后缩放恢复

- 每次layoutTopMenu原先将全部overflow行恢复顶层、删除More并重建，再搬回尾项。现PixelMenuItem::topMenuSizeHint复用原顶层尺寸公式，脱离当前父菜单查询而不缓存文字/皮肤尺寸；只搬动overflow边界变化的项目，保持顺序、原对象、回调及子菜单。同bounds且popup已打开时保留当前菜单。对照Aseprite MIT Menu::onResize/onSizeHint及Widget消息分派，无app代码复制。
- 新增window-input回归覆盖宽→窄→同宽多次布局的对象身份/顺序、打开More后同宽保持展开、打开后变宽恢复全部原项目和释放capture、再次往返。首次运行发现上一轮CallbackMessage未指定recipient，Manager::pumpQueue不会执行；现绑定Editor，延迟重排生效且沿用控件销毁消息清理。
- 唯一正式Release menu-overflow-reuse-build.log及menu-overflow-callback-build.log均exit0；最终window-input、menu-pointer、ui-geometry-performance局部/全量framebuffer、native-window-resize均exit0。来源覆盖625文件/evidence与diff通过。未额外人工截图验收；缩放单次计时波动明显，无整体性能提升结论，确认避免重复菜单拆建与修复展开后重排。迁移完整性仍INCOMPLETE，整体卡顿尚未全面验收。仅提交源码/来源/记录并推送dev，保留本地生成物及历史报告。


## 2026-11-06：背景重复填充候选测量，未采纳

- 恢复后当前正式版本resize采样：panel-backdrops38次43.823ms、window-layout20次30.384ms，背景仍是可见开销。检查paintPanelBackdrops先全背景再paintWorkLayer覆盖下方，试验限制初始fill到顶部条带；半透明panel保留原完整fill。核对Aseprite MIT Graphics::fillRect直接绘制并更新dirty；不能仅按覆盖面积推断实际CPU收益。
- 同一试验Release参考开关/优化16张resize BMP逐字节一致，ui-geometry-performance局部/全量及advanced-mode均exit0。最初跨构建截图差异仅位于画布160x160范围，同程序reference/optimized无差异；不将跨构建比较用于验收。profile背景45.560/46.067ms，无收益。关闭profile/截图ABBA原生resize均exit0、变化样本平均reference29.531/optimized25.297/optimized25.587/reference24.258ms，时间漂移大，未证明整体加速。
- 候选源码与来源登记已撤回，避免加入无实测收益的分支；本轮只提交调查记录。背景/面板绘制仍待进一步细分定位，未声称卡顿解决。正式程序随后从已恢复源码重新构建；本地截图/报告及既有未跟踪文件保留不提交。


## 2026-11-06：面板背景分阶段诊断

- 现有InteractionProfile的16槽已满。在paintPanelBackdrops增加本地固定8项统计，沿用MOONSPRITE_INTERACTION_PROFILE，退出时写同路径.backdrops.tsv；关闭时不读时钟、不写文件，不改绘制顺序、参数、裁剪或图形状态。panel-skin嵌套于各栏目phase，不可与phase时间再次相加。
- 唯一Release backdrop-phases-build.log exit0。原生resize exit0，38次背景总40.037ms：base-fill10.685、workspace9.760、palette2.654、pickers3.401、history8.405、timeline4.829；panel-skin228次22.848ms。证据将下一步定位收敛到工作区/历史皮肤和复杂damage合成，未作性能提升声明。
- 关闭profile的native-window-resize exit0。ui-geometry-performance首次exit1，报UI geometry cache differs from layout；同一二进制再次运行exit0。此间歇性一致性失败未定位，不能报告稳定通过；绘制参数未变化并不证明与修改无关。来源覆盖625文件/evidence及diff通过。整体卡顿仍未完成验收；仅提交诊断源码/来源/记录并推送dev，生成物与历史错误报告保留。


## 2026-11-06：几何缓存检查遍历实际分组

- 检查上一轮间歇性geometry失败时发现fixture固定索引docking_.groups[0..13]，但Model::place合并栏目会减少groups.size；应用启动还可恢复用户已分组工作区。columnCount14不是分组数，固定索引存在越界。改为遍历实际groups，并在明确合并栏目后再运行全部weight/width/floating/floatingArea/fixedExtent变更及直接layout等价检查，不缩减校验范围。
- 几何失败信息增加step/groups/area及不同panel矩形，局部/全量framebuffer不一致使用独立错误，便于区分真实缓存与绘制问题。未修改生产columnGeometry/cache或用户工作区。初次编译发现旧check辅助函数残留调用，已修复；geometry-group-fixture-final-build.log最终exit0。
- 正式Release ui-geometry-performance exit0：geometry equivalence与floating_move_resize_framebuffer通过，200000查询direct264.793ms/cached27.515ms为既有缓存收益，不归因于本轮fixture修复；native-window-resize exit0。历史build/ui-geometry-performance-error.txt保留，成功运行不清除，以本次进程exit0和新report为证。此越界缺陷已修复，但不能仅凭一次通过断言此前所有间歇性失败均由此导致。来源覆盖/evidence和diff通过后推送dev。整体性能优化未完成，下一步仍需定位面板皮肤合成开销。


## 2026-11-06：平铺皮肤跳过裁剪外九宫格块

- Skin::draw纹理/小尺寸fallback原先无论damage都为九块查询源缓存、创建repeat shader并drawRect。现读取surface device clip，按Graphics内部offset后再surface matrix映射目标块；仅scale/translate时保守拒绝完全不相交块。复杂region内部孔洞继续由Skia裁剪，不改变纹理相位、绘制尺寸/顺序或原始素材；lattice与icon路径不变。Aseprite MIT Graphics::drawRect和laf SkiaSurface::getClipBounds语义已核对。MOONSPRITE_SKIN_TILE_CLIP_REFERENCE恢复完整loop。
- 唯一正式Release skin-tile-clip-build.log exit0。reference/optimized原生resize均exit0，16张BMP逐字节一致。skin-resize（包含选中边框逐像素alpha/hit）、ui-geometry-performance含局部/全量、window-input均exit0；来源覆盖625文件/evidence及diff通过。
- Profile panel-skin reference23.803/optimized25.946ms，未提升；关闭截图/profile的ABBA变化样本mean24.450/23.144/23.006/23.000ms，顺序漂移，不支持整体提速结论。局部绘制密集的geometry-check ABBA完整进程1382/1291/1323/1651ms均exit0，仅辅助观察，含启动/模型计算且末次reference变慢，不能归因。保留可明确跳过裁剪外shader准备的局部优化，不声明解决整体卡顿。后续仍需定位复杂damage及背景绘制主耗时；只提交源码/来源/记录，生成物及历史本地报告保留，推送dev。


## 2026-11-06：恒定中心皮肤用矩形填充配合原九宫格边框

- 实际sheet检查panel_outer/panel_content/timeline.frame/timeline.grid中心均为单色。Skin::draw既有stretchEquivalent逐像素证明重复横纵轴恒定，包含中心恒定；该合格且尺寸充分分支现用中心原始RGBA fillRect，再通过Aseprite MIT drawSurfaceNine(drawCenter=false)绘制原边框。所有边界条件、原素材/透明度、纹理和小尺寸fallback保留；参考开关MOONSPRITE_SKIN_CENTER_REFERENCE恢复完整lattice。核对laf SkiaSurface中心透明RectType语义，无app代码复制。
- 唯一正式Release skin-center-build.log exit0。reference/optimized原生resize均exit0、16张BMP逐字节一致；profile panel-skin228次21.883→14.772ms（约32.5%），workspace9.155→5.911ms、history8.354→5.176ms；base-fill8.164→11.280ms显示环境波动，不能把局部收益直接推广整帧。
- 无截图/profile ABBA变化样本mean reference24.224/optimized23.641/optimized22.381/reference24.530ms，夹具平均约5.6%改善；仅CPU到flip提交，不代表DWM或真实输入显示延迟。skin-resize含逐像素alpha/hit、ui-geometry-performance局部/全量、window-input、advanced-mode均exit0。来源覆盖625文件/evidence及diff通过；保留本轮优化并推送dev。整体性能目标仍未完成，生成物/本地报告不提交。


## 2026-11-06：补齐视图保存的真实UI阻塞测量

- 检查画布zoom/pan路径发现setCanvasZoom同步saveDocumentView；原生view-v1保存经writeExportBytesAtomic/create+WriteFile+FlushFileBuffers+MoveFileEx WRITE_THROUGH。smoke_原先全部跳过，导致既有性能夹具漏测真实磁盘成本。旧版core/document-view-state.ts与store/workspace-commands-view.ts在setView保存storage；原生强制落盘是适配额外成本。核对Aseprite editor setZoom实现，仅概念比较、不复制app代码。
- 增加MOONSPRITE_INTERACTION_PROFILE的固定保存统计，写.view-save.tsv；仅smoke_且显式MOONSPRITE_VIEW_SAVE_TEST_ROOT时允许写指定测试目录。正常生产保存时机/格式/原子替换和正常smoke默认跳过均不变，不改用户偏好文件。构建view-save-profile-build.log exit0。
- 使用仓库build/test-tmp/view-save-storage独立目录运行真实writer：drawing-pan-performance exit0，5次17.535ms/max3.736ms；view-zoom-shortcuts exit0，10次40.866ms/max4.848ms；检查落盘view-v1文本含最终zoom/pan/rotation/mirror字段。未开启存储注入的view-rotation exit0。来源625覆盖/evidence及diff通过。
- 本轮补齐证据，无生产提速声明。实际每轮UI保存约3–5ms，是下一步应处理的热点；需保留同文档顺序、切文档/关闭最终状态与失败提示，不能通过测试默认跳过掩盖。只提交诊断源码/来源/记录推送dev，测试输出与用户数据保留不提交。


## 2026-11-06：视图持久化移出交互UI线程

- 复用LatestTaskQueue（legacy core/latest-task-queue.ts及对应native适配），每个目标路径一个有序writer，immutable path/text交给std::async工作线程，连续同文档更新合并为最新pending；后台不访问Editor。原view-v1内容、目录/哈希规则、writeExportBytesAtomic强制flush/原子替换保留。UI16ms timer poll完成状态并显示失败；读取磁盘视图前waitIdle；Editor-owned Property析构等待全部pending完成且清空回调，避免已析构Editor访问。不同文档独立，不会互相覆盖pending。进程被强制杀死时仍可能丢失尚未完成的最后视图，此为异步提交窗口，不涉及作品内容。
- MOONSPRITE_VIEW_SAVE_SYNC_REFERENCE恢复原同步路径；使用独立smoke存储root实测view-zoom-shortcuts10次：sync29.759ms/max3.359、async0.286ms/max0.137，均exit0。该指标是UI序列化/提交耗时，不是磁盘完成时延。另两个独立root分别运行同步/异步，最终两份view-v1字段完全一致。
- 新增view-rotation注入真实IO检查：两个目标各40次更新最终39、second-39；无效目录写入失败确实通知；失败后保存成功；局部writer析构确实落盘最终值，全部exit0。唯一Release view-save-async-final-build.log exit0；drawing-pan-performance及ui-geometry-performance均exit0，保留作品/history/pan framebuffer检查。来源625覆盖/evidence、diff通过后推送dev。整体性能目标尚未完成；新诊断/测试数据不提交，保留本地。


## 2026-11-06：后台视图写入去除相同在途状态

- ViewWrites此前即使相同文本已有active/pending仍enqueue，造成冗余pending写入或替换。现比较最新排队状态（优先pending，否则active），相同则返回。A/B/A不能仅看active A而丢弃最终A；不增加持久成功缓存，idle或失败后的重复保存仍重试。沿用legacy LatestTaskQueue语义及原native原子写入。
- 受控runner用promise固定第一任务完成时机，验证相同active不创建pending、相同pending保留对象、A/B/A最终执行A/A；释放gate后再断言，避免失败时析构等待死锁。真实IO两文档最终值、失败恢复、析构收尾检查保留。首次测试构造的空writer会被正常idle清理，已调整为先启动受控active再注入，最终正式构建view-save-dedup-final-build.log exit0。
- 独立smoke测试root下view-rotation（含受控顺序和真实IO）、view-zoom-shortcuts、drawing-pan-performance均exit0。来源覆盖/evidence及diff通过；仅确认冗余任务消除，无新增整体提速数字。正式Release更新，提交源码/来源/记录推送dev，保留本地生成物和用户数据。总体性能目标继续。


## 2026-11-07：工作区尺寸保存真实磁盘成本

- saveWorkspaceSizes生产路径在UI线程同步创建目录并写workspace-sizes.txt/workspace-panels.txt，smoke默认跳过。增加固定统计（沿用MOONSPRITE_INTERACTION_PROFILE，.workspace-save.tsv），及仅smoke显式MOONSPRITE_WORKSPACE_SAVE_TEST_ROOT独立目录注入。正常保存时机/格式、原ostream写入及800ms预设保存队列不变。正式workspace-save-profile-build.log exit0。
- 独立root docking-check37次保存累计61.928ms/max5.613ms；workspace-check1次2.439ms。确认两个文件存在，分别389/684bytes；该采样来自随后失败的检查，只证明实际保存路径被执行及耗时，不证明完整功能通过。
- docking-check在Modal surface intercepted the visible dialog button失败；workspace-check在Scrollable region has no sheet scrollbar: home失败。新shell关闭注入/profile后同一二进制均在相同断言exit1，证明不依赖测试存储注入，但未对前一提交构建作基线比较，不能断言历史来源。ui-geometry-performance exit0；来源覆盖625/evidence及diff通过。两项缺口待定位，不将其报告为通过。本轮只提交诊断与证据，不声称新增提速；下一步需处理真实工作区保存阻塞及验收缺口。测试输出、用户数据和错误报告保留不提交。


## 2026-11-07：工作区尺寸两文件后台批次保存

- UI捕获writeWorkspaceSizes及Model::write输出，作为同一immutable批次交给复用LatestTaskQueue的后台writer；保持原ostream格式、文件名和先sizes后panels顺序。同一queue合并最新pending，比较最新批次避免重复；工作线程不访问Editor。16ms UI timer报告失败，Property析构等待最后批次且禁用Editor回调。原两文件保存本就不是跨文件事务，本轮不宣称断电原子性。预设800ms保存机制未改动。
- 正式Release workspace-save-async-final-build.log exit0。独立测试root+QUEUE_CHECK下ui-geometry-performance同步/异步均exit0，3次保存UI耗时sync5.555ms/max1.980→async0.408ms/max0.151；最终workspace-sizes.txt和workspace-panels.txt逐字节一致。此为提交耗时，磁盘完成时间另计。queue-check40次两字段更新最终39/panels-39、文件阻挡目录失败通知、失败后恢复、析构两文件最终值全部通过；包含既有几何等价及局部/全量绘制。
- 上一轮docking-check弹窗命中及workspace-check首页滚动条失败仍未修复，本轮没有据几何检查宣称两项通过。来源625覆盖/evidence及diff通过后提交推送dev，整体性能目标尚未完成。仅源码/登记/记录提交，本地报告及用户数据保留。


## 2026-11-07：补齐工作区性能回归的两个旧失败点

- docking 的按钮命中失败是实际布局重叠：LayerOpacity 固定高度275，但说明字段底为213+52=265，footer起点249。改用既有 DialogLayout::fit(213+52)=297，含6px组间距、20px操作行和6px底内边距。不改变legacy LayerHeaderProperties的说明/关闭语义。保留原模态命中和按下capture检查，并加说明/按钮间距断言。对照Aseprite MIT Widget::pick/moveChildTo后未发现需要改变本轮叠放算法的证据。
- workspace 的home scrollbar失败是fixture仍选择近期项目页，该页已经使用独立RecentProjectsPane并显式隐藏旧列表滚动条。fixture改为普通列表section2，退出恢复原section；不修改产品首页行为。
- 正式Release modal-footer-regression-build.log exit0；ui-geometry-performance-check、dialog-geometry-check、recent-projects-check均exit0。docking已越过原模态命中/capture断言，随后在Palette split corner lost resize hit after window size change失败；workspace已越过home scrollbar，随后在Legacy gradient controls失败。两项完整检查仍非通过，后续缺口留待定位。本轮没有新增性能提速数字。
- 人工查看本轮panel-docking-dialog-focus-smoke.bmp：关闭按钮位于说明区下方，弹窗覆盖悬浮栏目；该离屏render fixture不覆盖全部真实窗口控件绘制，不宣称完整视觉验收。来源625文件/evidence通过，整体迁移仍INCOMPLETE。本地生成物及用户数据保留。


## 2026-11-07：键盘消息去除重复快捷工具同步

- editor_input.cpp键盘down/up分支连续两次syncShortcutTools，中间没有状态改变。删除第二次，保留输入观察、首次同步、post-dispatch同步以及独立release路径。该函数会扫描绑定、匹配held chords并检查冲突；直接重复不提供额外输入语义。对照legacy useAppShortcutRouter.ts的keydown/keyup路由及core/quick-tools.ts held派生；检查Aseprite MIT ui/manager.cpp每个OS key事件构建一个KeyMessage并路由，无app代码复制。
- 正式Release shortcut-sync-dedup-build.log exit0。同一shortcuts-input-check前后均exit0，profile shortcut-sync调用80→64（减少20%），单次采样累计2.9007→2.3500ms、self2.0830→1.6973ms；只证明此fixture调用减少，单次时间不声称稳定整体提速。tool-property-shortcuts、modifier-brush-performance、ui-geometry-performance均exit0。
- modifiers-check改前已失败Captured brush resize survives modifier release，未将其宣称通过。docking新增诊断且仍exit1：handle=0,cursor=ns-resize,palette=1,picker=1,custom=1,capture=0。说明重置Model后refresh已启用custom布局，旧ColorSplit检查的非custom前提失效；本轮不改产品布局或削弱断言。workspace的Legacy gradient controls缺口保留。
- 来源625文件/evidence及diff通过，整体迁移仍INCOMPLETE。仅源码/来源/记录提交推送dev；生成物、报告及用户数据保留。整体卡顿目标继续，不将快捷键局部优化等同全软件流畅验收。


## 2026-11-07：命名工作区预设定时保存移出UI线程

- 800ms timer原先同步WorkspacePresetLibrary::save+remember，两次原子磁盘落盘，并读回保存结果。现只在UI捕获不可变library/id/name/layout，复用LatestTaskQueue后台串行执行同一save/remember，合并最新pending并抑制相同在途状态。工作线程不访问Editor。复用Aseprite MIT ui::Property/Timer承载poll，16ms主线程报告失败；析构停止回调并等待完成。没有修改预设文件格式、initial语义、原子写入或800ms间隔。
- 所有workspacePresetLibrary获取先等待既有写入，flush显式等待后保留原同步语义，确保命名保存/读取/切换/重置/删除/active记录不被旧任务覆盖；管理入口可能为一致性等待在途IO，普通拖动/尺寸变更不等待。UI析构先flush，后台任务绝不持有Editor。参考legacy useAppWorkspaceLayout.ts串行Promise自动保存和platform_workspaces.rs save_workspace；不复制Aseprite app代码。
- Release preset-save-async-build.log exit0。--workspace-check --named-workspace-only --preset-write-queue-only同步参考/异步均exit0：40次timer更新最终layout正确，initial保持，active一致；新建/切换/重置有序；文件阻挡路径失败通知一次，失败后恢复；局部writer析构40次最终39确实落盘；作品/历史/dirty保持。41次timer UI耗时sync402.134ms/max12.3703，async3.1215ms/max0.1929。只测UI提交时间，异步实际磁盘完成另计；同步参考启用MOONSPRITE_PRESET_SAVE_SYNC_REFERENCE，profile输出.preset-save.tsv。
- 完整--workspace-check --named-workspace-only exit0（真实保存/管理弹窗、800ms自动保存、初始状态重置、切换、坏文件/写入失败、删除、重启恢复及时间轴/工具栏保存）。ui-geometry-performance、native-window-resize均exit0。来源625文件/evidence、diff通过，整体迁移INCOMPLETE。不宣称完整workspace-check或docking-check通过，其既有渐变/旧分隔fixture缺口保留。仅源码/来源/记录推送dev，保留本地生成物和用户数据。


## 2026-11-07：使用统计快照后台原子保存

- usage::Tracker原数据和核心/renderer计数方式不变。persistUsageStatistics将Data值快照及路径交给复用LatestTaskQueue，worker进行WinRT JSON编码并调用原writeExportBytesAtomic；快速连发时只保存最新待执行快照。UI enqueue后标记该快照已交队列，后续更改独立标脏。16ms owner Timer轮询失败并沿用原ephemeral状态/错误栏语义；析构等待已接受的最后一项。无Editor跨线程访问。
- 对照legacy platform/usage-statistics.ts：数据序列化、2000ms延迟及串行Promise行为保持，只有原生主线程写盘移到worker。Aseprite MIT ui::Property/Timer用于owner和poll生命周期，不复用app代码。env仅smoke重定向MOONSPRITE_USAGE_SAVE_TEST_ROOT；MOONSPRITE_USAGE_SAVE_SYNC_REFERENCE用于独立同步对照。
- Release usage-save-async-final-build.log exit0。async/sync两个隔离root分别运行usage-statistics-check均exit0，每轮45次提交，最终文件文本与最新Tracker快照完全一致；40次队列覆盖最终值、阻挡目录通知、失败后恢复、析构最终快照均通过。profile主线程总提交181.066ms/max6.3533→0.6319ms/max0.1922；异步文件落盘延迟单独计算，不能据此声称端到端I/O时间缩短。sync基线明确强制JSON+磁盘路径，非首次启动的baseline。
- 无存储注入usage-statistics、ui-geometry-performance、drawing-pan-performance、view-zoom-shortcuts、native-window-resize均exit0。来源625/evidence和diff通过，整体迁移仍INCOMPLETE。本轮源码、provenance及记录推送dev，本地报告/缓存/用户数据保留。


## 2026-11-07：六份笔刷工具偏好后台批次保存

- 渐变色标track changed、颜色/数值Change及其他工具参数调用saveBrushPreferences时，原先每次同步重写六份偏好。现UI用原表达式/default stream precision生成六份文本，作为完整批次复用LatestTaskQueue后台串行写入；最新pending合并，最新在途完全相同则跳过。保留现有六文件名/格式及顺序、笔刷默认值更新、写入计数与已有250ms笔刷大小调节机制。文件原本为普通ofstream非事务，此轮也不声称跨文件原子性。
- 原生适配以legacy core/tool-preferences.ts::saveToolSettings完整设置快照为依据，复用Aseprite MIT Property/Timer承载owner队列；UI16ms poll报告错误、析构等待最终批次。createToolOptions/loadMagicEraserPreferences/loadFillPatternPreferences读取前等待在途写入。测试中的直接pixel/dither读文件同样显式等待，不将异步提交误当落盘完成。Worker仅持有路径/字符串，不引用Editor。
- 正式brush-save-async-build.log exit0。--workspace-check --named-workspace-only --pixel-stroke-only --brush-write-queue-only异步/同步均exit0：40次保存最终size40/opacity39，六文件逐字节一致；阻挡目录失败通知、恢复全六文件、析构40次最终39全六文件、作品/history/revision/dirty保持通过。同步参考MOONSPRITE_BRUSH_SAVE_SYNC_REFERENCE；profile .brush-save.tsv。40次UI序列化/提交总148.775ms/max5.8481→1.4068ms/max0.1657；实际异步磁盘完成时间另计，未声明端到端磁盘提速。
- tool-property-shortcuts、gradient-shape、palette-gradient、drawing-pan-performance、ui-geometry-performance及完整--workspace-check --named-workspace-only均exit0。误将--pixel-stroke-only单独作为主入口会打开普通窗口，已正常关闭；该次不计测试通过，真正pixel/dither覆盖来自完整named workspace。
- --workspace-check --named-workspace-only --offcanvas-pattern-create-only在同步参考和异步均exit -1073741571（0xC00000FD栈溢出），未归因于本轮改动也未宣称通过，组合检查缺口待定位。来源625/evidence和diff通过；整体迁移INCOMPLETE。提交源码/来源/记录推送dev，生成物和用户数据保留。

## 2026-11-07：共享 Fusion 字形墨迹边界预计算

- PixelFont::inkBounds 的上一版仍在每次查询时逐行合并字形位图。字形加载后不可变，现将相同的行/位扫描移至 BDF ENDCHAR，缓存每个字形的墨迹矩形；菜单、按钮、布局查询仅平移并合并该矩形。空白、缺字回退、advance、基线及实际绘制路径不变。不缓存任意文本，额外内存仅每字形一个 Rect。
- 对照 Aseprite MIT ui/graphics.cpp::measureText：其注释同样指出直接文字测量慢，建议缓存 TextBlob。此处保留用户指定 Fusion BDF 实现，只缓存不可变字形几何；不复制 Aseprite app 代码，不改变上游库。现有独立逐像素 oracle 检查全部加载字形、空白、缺字与邻接字符；既有 1×/2×、不透明及三档半透明渲染对照继续保留。增加与紧邻上一版逐行缩减算法的同进程测量。
- 继承并登记 paintCanvas 七阶段 opt-in profile；未开启环境变量时不读时钟、不写报告。初始 Release 构建及 performance-ui、drawing-pan-performance、hit-testing-performance 3 项通过。ui-geometry-performance-check 在 Floating partial/full framebuffer differs 失败；保留此缺口，不把其它检查通过解释为该项通过。
- 最终正式 Release font-ink-cache-build.log exit0。font-ink-cache-tests.log 中 performance-ui、drawing-pan-performance、skin-resize-render、window-input-hit-testing 四项全通过；覆盖25,314字形精确墨迹边界及1×/2×透明度像素对照、真实菜单溢出/恢复/展开和命中。20,000次同进程查询，紧邻上一版行缩减10.4668ms→缓存6.1181ms（约减少42%）；最初逐像素参考90.6198ms。此为文字边界微基准，不声明整机或完整窗口帧时缩短42%。来源625文件/evidence与diff检查通过；未执行新一轮人工图像验收。
- 最终 --native-window-resize-check exit0，完成16次真实 HWND 尺寸变化并核对 surface/client 尺寸；报告 build/test-tmp/native-window-resize.tsv。本轮源码、来源登记与记录提交推送dev，保留工作区原有未跟踪数据及诊断文件。

## 2026-11-07：恢复浮动移动/缩放性能检查的真实帧基准

- 原ui-geometry-performance-check只flush/dispatch便读取nativeWindow surface，未处理窗口初始原生事件；截图显示局部帧大部分为黑色，990216像素差异从(0,0)起。按现有main.cpp真实HWND尺寸检查补齐dontWaitEvents、generateMessages/dispatch、flush/dispatch及flipAllDisplays，移动前明确invalidate建立完整帧。单补invalidate或flip仍失败，补全事件循环后通过。对照Aseprite MIT Manager::flipAllDisplays和Window::moveWindow，不修改产品区域复制/重排语义。
- 最终floating-repaint-events-build.log Release构建exit0。--ui-geometry-performance-check exit0：几何查询等价、200个输入样本只更新一次布局、无完整refresh、软件移动复用一次move_region、浮动移动和缩放局部/全量帧逐像素一致，12次窗口尺寸变化合计147.297ms。200000次几何查询direct88.3307ms/cache21.0316ms仅为既有优化回归，无本轮产品提速声明。新增失败坐标/差异数量及paired BMP诊断，保留完整oracle，不放宽断言。此前该项失败归因修正为fixture显示初始化缺失。
- 本轮仅验证夹具/来源登记/记录；正式程序已重新构建。源码及记录提交推送dev，生成截图、缓存、工程与用户数据保留。

## 2026-11-07：尺寸调整去掉偏好设置第三次布局

- 真实native-window-resize profile显示20次window-layout总25.0556ms、26次tool-options-layout总10.2266ms、panel-backdrops总25.9393ms，继续保留这些热点。核对onResize发现layoutModal已布局偏好设置，applyHomeVisibility又恢复偏好控件，末尾仍第三次调用layoutPreferences。仅删除末尾第三次，保留首页隐藏后的恢复及所有排序。smoke环境MOONSPRITE_RESIZE_PREFERENCES_REFERENCE可恢复原路径。未改变legacy偏好应用/取消、滚动、焦点及弹窗语义；对照Aseprite MIT Widget ResizeEvent派发，不修改依赖。
- preferences-check优化/参考各两次exit0，覆盖720×600/1280×960边界、应用/取消/重开及首页显示。两条路径输出preferences-smoke.bmp SHA256完全相同（D7EBF89E5BBF4308298A3787D2C132001DF3763F296D504D0B17A367DA2E4919）。ui-geometry-performance-check exit0。本轮无整体帧率改善百分比声明；尺寸变化中少执行一次偏好布局为源码可核对的工作量减少。最终构建与来源检查记录见本地preferences-resize-dedup-final-build.log及provenance报告。源码/来源/记录提交推送dev，用户数据保留。

## 2026-11-07：选区变换字段避免相同文本重复整形

- layoutToolOptions已有syncText覆盖普通笔刷等字段，但选区x/y/宽/高/角度仍每次无条件setText。现复用同一syncText，不改焦点保护、格式化、翻转符号、角度或提交逻辑。Aseprite MIT Entry::onSetText明确无条件recalcCharBoxes，因此稳定目标不再触发该重复整形；字段变化仍正常更新。不改legacy选区数据语义。
- 正式selection-field-sync-build.log构建exit0。完整--selection-check优化和MOONSPRITE_TOOL_TEXT_REFERENCE参考均exit0；增加100次稳定布局五字段文字/位置不变、目标坐标尺寸变化立即更新、像素/revision/history保持检查，原输入/像素/历史检查保留。100次布局优化64.3758ms/参考69.5824ms为整栏单次观察，参考开关也恢复其他字段赋值，不能独立归因或当作稳定整机提速。--tool-property-shortcuts-check exit0。来源与diff检查通过后源码/来源/记录提交推送dev。

## 2026-11-07：绘图锚点避免瞬间隐藏再显示

- layoutToolOptions原先无条件隐藏绘图锚点两按钮，再由适用的形状/选区分支重新放置显示。对照Aseprite MIT Widget::setVisible(false)，隐藏会freeWidget释放焦点/capture并invalidate旧范围。现适用工具保留状态，由原有放置、滚动及advanced路径决定最终显示；不适用工具仍隐藏。smoke参考MOONSPRITE_ANCHOR_VISIBILITY_REFERENCE恢复原行为。无素材、命中、锚点数据或工具资格变化。
- anchor-visibility-final-build.log正式Release构建exit0；--selection-check完整通过，新增宽窗口适用选区按钮获得焦点后连续20次布局仍可见且保持焦点，原五字段位置/数据/历史检查保留。绘图锚点原有检查也新增稳定形状按钮焦点断言，但--workspace-check --named-workspace-only --drawing-anchor-edit-floating-only在优化及原显隐参考均exit 0xC00000FD栈溢出，因此该组合未验收，不以旧native-workspace-error.txt判定失败原因。本轮未宣称完整锚点组合通过或整体提速比例。来源检查后源码/来源/记录提交推送dev。
- --tool-property-shortcuts-check与--ui-geometry-performance-check均exit0。

## 2026-11-07：瓦片选区组合验收栈帧缩减

- 对正式Release map定位函数入口并读取PE代码：smokeTilemapSelectionDelete prologue原以__chkstk预留0xF0540（984384）字节，未含调用方及嵌套UI调用，接近Windows默认1MiB。不是据旧错误文本猜测递归。将14个原有独立scope通过noinline回调依序调用，保留全部场景、断言和早退位置；不修改产品栈配置或选择算法。最终入口预留0x62F0（25328）字节，减少约97%。
- selection-smoke-stack-build.log正式Release构建exit0。--workspace-check --named-workspace-only --offcanvas-pattern-create-only由0xC00000FD变为exit0。锚点组合越过smokeDrawingAnchor（含上一轮焦点断言）及栈探测，随后在actual Paint one-pixel keyboard rounds zero on four-pixel tiles断言失败，未宣称完整组合通过。该断言留待后续核对legacy键盘步长/fixture状态，不削弱断言。本轮是验证路径资源优化，不声明产品帧率提升。源码/来源/记录提交推送dev，缓存及用户数据保留。
- 原锚点显隐参考组合到达相同Paint微移断言，确认并非上一轮显隐优化专有失败；完整--selection-check exit0。

## 2026-11-07：Paint组合方向键断言对齐已迁移语义

- 核对legacy useCanvasKeyboardInput.ts:388-389及既有tilemap-paint-arrow-input-20261030.md：键盘方向单位乘以tileWidth/tileHeight，产品已正确迁移。组合fixture仍期望4px瓦片收到1px并取整零，属于旧预期。改为断言一格位移、一次历史、选择x+4、tileset不变、无关链接资源不变，Undo精确恢复后继续复制场景。不修改产品输入或核心代码。
- paint-arrow-fixture-build.log正式Release构建exit0。锚点组合已通过新的方向移动/Undo断言及后续Paint复制，最终在actual tile Ctrl+X packs RGBA and deletes one transaction失败；完整组合仍未通过，剪切问题待后续检查。本轮无产品提速声明，是性能优化回归验收的夹具修正。来源检查后源码/来源/记录推送dev。


## 2026-11-07：顶部菜单压缩布局复用本轮文字测量

- 用户确认窄窗口将放不下的菜单收进“更多”；现有layoutTopMenu已经承接此行为。本轮保留全部压缩、溢出、对象移动和弹窗关闭顺序，仅将每个压缩候选对全部标题的重复topMenuSizeHint改为本轮一次各标题测量，加共享menu_hover边距差。每次调用重测，避免标题、皮肤、缩放变化的跨轮缓存失效问题。smoke模式逐次与原完整求和oracle比较。对照Aseprite MIT src/ui/menu.cpp Menu::onSizeHint的换行及MenuBox尺寸计算，不复制依赖代码。
- top-menu-metrics-build.log正式Release构建exit0。--window-input-check exit0，覆盖窄宽溢出顺序、稳定对象、菜单打开时重复布局及恢复宽度释放capture，且本轮测量oracle通过；--ui-geometry-performance-check exit0。来源625文件覆盖与证据快照检查通过，迁移仍INCOMPLETE。未做人工交互图像验收，不宣称整体帧率提升比例。
- 前轮Ctrl+X诊断确认状态为Finish the active edit before cutting Cels：fixture显式selectTimelineCel，未设selectionCommandOverride_，因此按legacy app-document-shortcuts.ts与useAppCommandScope.ts优先Cel。已移除临时诊断，不擅改产品优先级；锚点组合回归仍未通过，此问题保留。本轮仅提交菜单布局优化、来源和记录，缓存/用户数据/生成物不提交。


## 2026-11-07：顶部叶控件避免相同矩形ResizeEvent

- 对照Aseprite MIT Widget::setBounds与setBoundsQuietly：相同矩形仍派发ResizeEvent并invalidate；MenuBox::onResize继续调用Menu::onResize并重排。对照legacy AppMenuBar.tsx保留全部命令与可用性，本轮仅在原生顶部工作区按钮、五个操作按钮以及菜单行居中步骤比较当前/目标矩形，变化时才setBounds。菜单容器继续无条件布局，以响应同尺寸下的标题、皮肤和overflow子项变化；不在依赖层全局跳过ResizeEvent。
- header-stable-bounds-build.log正式Release构建exit0；--window-input-check和--ui-geometry-performance-check均exit0，覆盖菜单溢出/恢复、真实窗口输入、局部与全量帧一致及尺寸变化几何。来源625文件覆盖/快照检查通过，完整迁移仍INCOMPLETE；未做人工图像验收。此轮是可核对的重复事件减少，不宣称整体帧率提升比例。仅提交源码、来源与记录，生成物和用户数据保留。


## 2026-11-07：调色盘多选轮廓按扫描行筛选候选边

- layoutPaletteButtons的非矩形共享选框逐像素遍历全部轮廓边。保留legacy core/palette-layout.ts paletteSelectionBoundaryEdges及PaletteSelectionOutline.tsx的联合外轮廓语义和原生素材适配，每行先按clip.y范围筛选，保持原边索引顺序，再用原clip、距离、Skin::selectionContains判定归属。缩减无关边访问，不改变凹角、并列距离、alpha、pieces分段或命中坐标。无跨帧缓存。MOONSPRITE_PALETTE_EDGE_REFERENCE在smoke中逐点比较全边遍历oracle。
- 新增自动轮廓验收置于smokePaletteManual原场景之前：五种色块尺寸×全选/阶梯/每第三格不连续选择，逐像素核对绘制alpha与命中。开启oracle的--palette-manual-check通过，随后--palette-growth-check和--ui-geometry-performance-check通过。palette-scanline-fixture-build.log正式Release构建exit0，来源625文件/快照检查通过，迁移仍INCOMPLETE。无人工图像验收，不宣称整体提速百分比。
- --palette-mouse-check exit1，组合在smokeToolPropertyLayout的Legacy gradient controls断言停止，未完成其后全部鼠标检查；不得记为全通过。本轮针对轮廓的完整新场景及原手动场景已独立通过。源码、来源、记录推送dev，用户数据/缓存/生成物保留。


## 2026-11-07：调色盘轮廓跳过无候选扫描区

- 上轮每行筛边后仍遍历整份material宽度并计算interior。现按行候选clip横向min/max限定扫描，空行直接跳过，仍以原material.x为采样网格原点向上对齐uiScale。终点保留哨兵flush，边顺序、凹角距离、Skin::selectionContains与pieces归属不变。开启MOONSPRITE_PALETTE_EDGE_REFERENCE除原逐点winner oracle外，检查全部省略样本的全边遍历确实无owner。legacy palette-layout.ts与用户共享外轮廓规格未变；对照Aseprite MIT Widget::onInvalidateRegion先按区域相交过滤的策略，不复制依赖代码。
- palette-scanline-span-build.log正式Release构建exit0；带oracle的--palette-manual-check通过五尺寸×三种选择形状与alpha/hit逐像素对照及原手动场景；--palette-growth-check、--ui-geometry-performance-check通过，关闭oracle的manual也exit0。新增build/test-tmp/palette-contour-layout.txt记录全refresh耗时/边数，仅作观察；例如size3离散44边3.9442ms，size4全选6边5.2584ms，不构成优化前后或整机提速比例。未增加候选边实际计数。来源覆盖625文件/快照及diff通过，迁移仍INCOMPLETE，未做人工作品验收。
- 源码、来源及记录推送dev；旧组合梯度断言和剪切回归问题仍待定位，用户数据/缓存/生成物保留。


## 2026-11-07：梯度属性组合验收承接横向视口

- palette-mouse组合此前要求gradientMode始终未HIDDEN，与legacy app/useToolOptionsScroll.ts的单行横向溢出契约及现有finishToolScrollLayout的视口相交显隐不符。现在检查线性/径向/应用模式均有scrollViewports且显隐严格等于相交状态；保留图标/文案验证，并滚到clamped末端要求应用模式可见，再恢复原滚动检查。未修改产品控件可用性、显隐、滚动或布局。
- gradient-viewport-fixture-build.log正式Release构建exit0；--palette-mouse-check通过此新断言，继续在Legacy property component types失败，完整组合仍未通过。--tool-property-shortcuts-check和--ui-geometry-performance-check exit0。来源625文件覆盖/证据快照与diff通过，完整迁移仍INCOMPLETE。本轮为恢复性能回归覆盖路径的验证修正，无产品提速声明；后续组件类型断言保持原样待证据核对。仅源码/来源/记录推送dev，用户数据/缓存/生成物保留。
