# MoonSprite 原生版性能只读审计与修复方案

日期：2026-11-12  
开始审阅时的基线：`dev`，`88f8c0244c27f95cdc38416579b8c4eb9819927a`；结合审阅时的工作区文件。  
本次交付：性能分析与实施方案。**没有修改产品源码、运行构建、启动／关闭应用或执行性能测试。**

## 1. 结论与证据边界

当前代码仍有多个足以造成输入排队、落笔／抬笔停顿、时间轴滚动卡顿的结构性成本。优先处理的不是再缩短一个定时器，而是：

1. 普通绘制在空 Cel／局部存储上仍可能准备整画布，空 Cel 的首次笔画提交会复制整个时间轴；像素容器的普通复制是深拷贝。
2. 蒙版笔画保存整份蒙版列表；开启录制后，提交还同步完成录制画面准备。
3. 时间轴蒙版行查询、复杂选区边界重建与缩略图冷启动仍可能按大量不可见数据工作。
4. 局部刷新未完全隔离面板同步；复杂样式和预览还有大区域重复合成。
5. “分块／异步”并不覆盖全部阶段：快照元数据校验、脚本结果接收等仍可能长时间占用 UI 线程。

这是**源码已确认的工作量与风险**，不是对本机当前每次卡顿的实测归因。没有本轮 p95／p99、输入到屏幕延迟、内存曲线或 Aseprite 同机对照，不能宣称某项占当前耗时百分之多少，更不能承诺完成某一项便“全部不卡”。

证据分为：

- **A：可确认路径**——调用关系、循环、复制、分配和失效范围可直接从代码验证；实际毫秒数待测。
- **B：组合风险**——单个组件有防护，但并行任务、缓存总量或极端规模下的影响需实测。
- **C：待核实候选**——没有充分运行链证据，不列为已确认的当前瓶颈。

工作区同时有其他任务活动：开始时已有 `editor_support.h` 状态差异和大量未跟踪运行产物；审阅期间还观察到扩展相关源码／测试／迁移文档变化，交付核对时 HEAD 已推进至 `276b6f0520b60a38950357b7eeaf730b25fcb21f`。本任务未改动这些文件，也未提交代码。文末列出的 18 个主要证据文件在两次指纹核对之间均未变化；后续实施前应按符号重新定位，不能把行号当成永久接口。

审查覆盖了输入、画布、预览、时间轴、蒙版、快照、录制、播放、面板同步、缩略图和脚本接收的关键路径，定向对照旧版和固定版本 Aseprite。**不是对全部源码逐行证明无性能问题**。导入格式、所有滤镜、扩展表单全部组合及硬件呈现仍需按第 8 节补充测量。

## 2. 为什么会感觉“所有操作都卡”

这些操作共用 UI 消息线程：

`设备事件 → 消息等待 → 输入处理／领域事务 → 状态同步／布局 → 合成／上传 → UI 绘制 → 系统呈现`

其中任一同步阶段长时间运行，后面的鼠标移动、滚轮、键盘和绘制都会排队。指针已经移动而笔刷预览尚未更新，既可能是预览本身昂贵，也可能是前一次抬笔、恢复快照或缩略图任务挡住了消息处理。

| 感受到的问题 | 首先检查 | 必须区分的场景 |
| --- | --- | --- |
| 第一次落笔卡、空帧第一次画更卡 | F01、F02 | 已有 Cel／空 Cel、普通层／蒙版、局部存储／整图 |
| 抬笔或撤销时停一下 | F01、F03、F09 | 录制开关、历史面板状态、目标 Cel 是否刚创建 |
| 预览不跟手、修饰键调笔刷迟滞 | F07、F05、F08、F13 | 实心／边缘／图片笔刷、Shift 直线、重复平铺、特殊笔刷 |
| 滚轮缩放或平移卡 | F05、F07、F08、F13 | 空白／复杂选区、冷／热内容缓存、是否同时有后台结果接收 |
| 多层多帧时间轴卡 | F04、F10、F09 | 有／无蒙版、缩略图冷／热、大选区、分组折叠 |
| 播放不稳、卡后追赶又卡 | F11、F08 | 变时长帧、循环节、洋葱皮、同时开预览面板 |
| 隔一段时间全局停顿 | F06、F03、F12、F13 | 自动恢复、录制队列、脚本结果到达、多文档 |

“每 16ms 调一次”只说明检查频率，不说明每次工作能在 16ms 内结束；降低计时器间隔不能消除同步循环和整图复制。

## 3. 已有优化必须保留

当前版本并非没有性能设计。下列机制在代码中已经存在，不应作为“从零补做”反复重写：

- 普通笔刷移动分别失效旧、新预览区域；普通笔刷尺寸修改立即更新预览，偏好保存延后 250ms。见 [指针反馈][n-pointer]、[笔刷尺寸更新][n-modifier]。
- 画布有保留内容表面、修订判断、脏区累计、Skia 批量 RGBA 上传；重复画布共享内容缓存。见 [CanvasRenderer][n-renderer]。
- 普通笔画移动调用增量更新与 `invalidateStrokePixels`；普通抬笔有定向 UI 更新，没有一律调用全量 `refresh()`。见 [输入提交路径][n-input-end]。
- 时间轴已经池化可见控件；已合并绘制中的视口计算，存在空裁剪／无选区快速返回。见 [时间轴布局][n-timeline-layout]。
- Timeline 的 Cel／frame／layer 查询已建索引，链接解析有缓存，合成顺序和内容标记也已有缓存。**不能说所有 Cel 查询都是线性搜索。**
- 保存和恢复已有像素分块、后台编码／写盘及身份校验；不是同步压缩整份工程。见 [保存推进][n-save]、[恢复推进][n-recovery]。
- 缩略图有取消、generation、owner 缓存和每轮任务预算；已有机制仍有单任务与总缓存边界问题，见 F10。
- 视图／工作区／部分偏好写入已经后台化。历史记录面板有 identity／historyRevision 检查，不是每次刷新都重建。
- 旧性能文档记录过快捷键、布局、字体、片段绘制等改进。[历史记录][d-history]中的通过结果与计时属于当时版本，**本次没有重跑，也不将历史失败直接判为当前失败**。

## 4. 优先级总表

P1 表示优先修复交互关键路径；P2 表示随后处理的扩展性或特定功能问题。所有时间目标都是后续验收目标，不是已有成绩。

| ID | 优先级／证据 | 问题 | 工作量随什么增长 |
| --- | --- | --- | --- |
| F01 | P1／A | 笔画启动整图准备、空 Cel 提交整状态深拷贝 | 画布面积、工程全部像素与元数据 |
| F02 | P1／A | 蒙版绘制复制整份蒙版集合 | 所有蒙版像素总量 |
| F03 | P1／A | 录制准备在提交栈内循环到完成 | 脏区、合成图层／效果、录制尺寸 |
| F04 | P1／A | 时间轴蒙版行与选择查询仍扫描全量集合 | 行数 × 蒙版数、选择数 |
| F05 | P1／A | 蚂蚁线按像素重建路径 | 可见选区源像素面积 |
| F06 | P1／A | 快照构造与每片校验不受完整时间预算约束 | 全工程元数据 × 推进次数 |
| F07 | P1／A | 预览包围矩形重合成、部分轮廓逐点建树 | 包围矩形面积 × 图层、笔刷覆盖点 |
| F08 | P1／A | 样式／分组合成和过宽失效 | 脏区面积 × 效果半径平方 × 层次 |
| F09 | P2；精灵表子项 P1／A | 刷新扇出，精灵表预览同步重建 | 面板模型、历史长度、全部输出帧 |
| F10 | P2／A+B | 缩略图单任务可超预算、缓存只有每 owner 上限 | 源图扫描、累计访问的 owner 数 |
| F11 | P2／A | 播放同步逐帧追赶、缺少成品帧复用 | 欠账帧数、整帧合成面积 |
| F12 | P2／A | 脚本的 3ms 预算未覆盖完整结果接收 | 结果 JSON、操作数、结构／像素修改量 |
| F13 | P2／B | 多类维护任务缺少共享 UI 时间／资源准入 | 同轮到期任务、多文档、多个缓存 |

### F01：普通绘制的整图准备和空 Cel 首次提交

**证据。** [Document::beginStroke][n-stroke] 的空槽分支分配 `width × height` RGBA；局部 owner 不覆盖画布时调用 `raster::expanded(...整个画布...)`。同函数为 `pendingLookup_` 分配整画布 `int` 数组。该数组尺寸不变时复用，清理只重置触及项，不能误称每一笔都清空整图。

[Document::commitStroke][n-stroke-end] 的 `absentStrokeSurface_` 分支执行 `auto candidate=timeline_.state()`，再复制新 surface、构造并校验 Timeline。[LinkedPixelStorage][n-storage] 的复制构造／赋值会复制底层 vector；显式 `share()` 才共享，而且共享的是**可变存储**。因此复制 State 不是廉价的 COW 元数据操作。

**触发。** 大画布首笔、裁剪后的局部 Cel、空帧／空槽首笔、工程有大量既有像素但当前仅画一个点。已有整图 owner 的普通连续笔画不一定触发全量复制。

**数量级。** 4096² 的 RGBA 和 32 位 lookup 各约 64MiB；8192² 各约 256MiB。这里只是成本计算，不表示所有组合都通过现有准入限制。新 Cel 提交还可能额外复制整个工程的已分配像素。

**完整修复。**

1. 将笔画“已触及索引”换成按 tile 分配的局部索引／代数标记；空白空间不分配整图 lookup。保留重复覆盖、透明度累积、perfect-pixel 回退顺序和 baseline 点语义。
2. 空 Cel 使用临时局部 raster；按笔画覆盖范围分块扩展。禁止每移动一点复制不断变大的矩形，采用固定块或有界扩容。
3. 为 Timeline 增加受控的“插入 Cel + 链接关系更新”事务接口（拟议接口，当前不存在），预校验 ID、slot、frame、layer、链接环与资源预算；预留所需索引容量后原子发布，只保存新 Cel 和受影响链接分量的差量。
4. 若链接组会因新 Cel 重新选择 owner，事务必须包含所有受影响成员的 owner／geometry／opacity 投影变化，不能只插入一个 Cel 就结束。
5. 保留“只有非空提交才物化 Cel”的旧行为；取消、零变化、分配失败不创建 Cel，不改变 dirty、历史与原存储。
6. 先改这条受控入口和对应差量历史，再逐个迁移其他整状态复制入口；不要直接把全局复制构造替换成 `share()`。

**验收。** 固定一笔和目标面积，增加无关 Cel 的像素量，启动／提交复制字节不应同比增长；取消和 Undo／Redo 后逐像素及链接拓扑相等。覆盖缺失 Cel、负 offset、storageOrigin、跨帧链接、重复平铺、压感、perfect-pixel。以 `document-raster-history`、`raster-geometry`、`linked-layers` 为基础追加目标场景。

### F02：蒙版笔画复制所有蒙版

**证据。** [beginStroke][n-stroke] 的蒙版分支执行 `maskStrokeBefore_=timeline_.state().masks`，随后可能将目标蒙版扩成整画布；[commitStroke][n-stroke-end] 交给 `commitMasks`。由于 Surface 的普通复制深拷贝，这一成本随全部蒙版像素增长，而不仅是活动蒙版。

**完整修复。**

1. 在蒙版事务开始时解析实际 owner 和链接分量，记录目标身份、geometry、标志、原 storage revision。
2. 普通绘制使用与 raster 笔画相同的 tile／run 像素差量；结构改变才记录链接与 geometry 差量。
3. 针对蒙版“必须一起变化”的链接成员统一发布修改，其他蒙版既不复制也不失效。
4. 取消恢复修改块及扩容前 geometry；提交一条历史；保留归一化灰度／alpha、可见／锁定、绑定移动与隔离显示行为。

**验收。** 1、64、256 个蒙版，每次只画同一个点；增加未修改蒙版时复制像素量保持稳定。覆盖 linked mask、group mask、蒙版 owner 删除后恢复，以及保存重开。不得以禁用蒙版联动换取速度。

### F03：录制编码在后台，但画面准备同步阻塞提交

**证据。** [pushEdit][n-push] 调用 `notifyRecording()`；[Session::capture][n-recording] 构造 PixelPreparation 后：

`while (!prepare.advance(document, now + 4ms)) ...`

循环没有返回消息循环。[PixelPreparation][n-recording-pixels] 会分块合成／采样，复用未变化 tile，但外层仍在同一提交调用中完成所有块。首次录制、全画面变化或复杂效果时可能明显。录制默认关闭，**不能把未启用录制的卡顿归因于它**。

旧版 [freezeTimelapsePixelsAsync][l-recording] 的 `await yieldTimelapseTask()` 会实际交还调度；仅保留“4ms”数字不等价。

**完整修复。**

1. 在提交边界冻结确切的合成输入版本：frame、owner、mask、style、group、palette／资源与输出尺寸。不能后台借用当前 mutable Document。
2. 低风险第一阶段：以状态机每次推进一片后真正返回 UI；在冻结完成前保持该操作必要的事务保护，并提供可见进度／取消语义，避免嵌套 `pumpMessages` 造成重入。
3. 最终交互目标：F01 的不可变 tile 版本就绪后，只冻结受影响块及元数据引用，把准备／合成移到后台；UI 提交只发布捕获票据。
4. 保留 Smart／Full／Undo 记录模式的顺序、时间、changeScore 和现有队列满时的可观察行为。不能把每次提交都当成“只保留最新预览”而丢录制帧。
5. 队列按实际唯一 tile 字节与编码暂存计费；失败保留可重试数据，关闭／清空录制用 generation 拒收旧结果。切换文档不改变捕获目标。
6. 嵌入 PNG 迁移的 `payload=frame.data` 也应计入 UI 准备成本，改成冻结只读字节所有权或可让出的复制。

**验收。** 同一录制关／开回放分别测 `stroke.commit`、`capture.freeze`、`capture.compose`、`encode`、`write`；检查实际能处理下一条输入，不以每片循环内部计时合格替代。1px 编辑、首次捕获、大修改、连续 Undo／Redo、队列压力与慢盘全部保持录制顺序和作品内容。

### F04：时间轴窗口化之后，蒙版索引和选择路径仍不够局部

**证据。** [TimelineRows][n-rows] 构造时对每个视觉行 `any_of(state.masks)`；`mask(row)` 再扫描蒙版并构造 maskRowId，`owner／layer／cel` 等继续依赖它。设 R 为行数、M 为蒙版槽数，构造最坏约 O(R×M)，后续查询还有重复成本。蒙版槽随帧增长时尤其明显。

[layoutLayers][n-timeline-layout]、[timelineOutlines][n-outline] 与多处手势仍分别构造 TimelineRows。轮廓已经过滤屏幕外行，但仍遍历正式选择；蒙版可见格的选中判断还线性查询 maskVisualSlots。指针在时间轴区域时，[updatePaletteMouse][n-pointer] 会调用轮廓逻辑。

**完整修复。**

1. 先在一次 TimelineRows 构造中建立 `maskOwners` 集合，行记录直接保存 `kind / ownerId / layerIndex / groupIndex`，`mask(row)` 变为 O(1)。
2. 为可见行模型建立依赖版本：文档身份、图层／分组结构、collapsed、蒙版 owner 拓扑、是否展示蒙版行。像素颜色变化不重建行树。
3. 一次布局／绘制／命中共享同一不可变行快照；事件处理开始时获取当前快照，不把长期悬空指针存进控件回调。
4. 选择模型保留现有语义，在其版本变化时构建 `row → frame intervals` 或 slot hash；绘制只求与可见范围交集。平移中的选择应用行／列偏移，覆盖 group virtual slots 与 mask placements。
5. 轮廓 geometry 与 hover 分开：选择／滚动／布局改变才生成轮廓，指针移动只做公共素材 alpha 命中。

**验收。** 256／1024 层 × 1000／5000 帧分别使用无蒙版、每 owner 单蒙版和多帧蒙版；只物化预算允许的必要像素。warm hover 的全蒙版扫描次数为 0；行快照构建对 R+M 近线性；像素一笔不重建结构。对照现有 `--large-timeline-performance-check`、`--group-timeline-check`、`--timeline-density-check`。

所有边框继续由 `Skin::selectionMaterialBounds / drawSelectionBorder / selectionContains` 管理，物理坐标和透明中心／外扩命中不变；逐像素 alpha／命中等价必须通过。

### F05：复杂选区每次蚂蚁线绘制重新扫描像素

**证据。** [paintSelectionAnts][n-ants] 对非矩形 mask 遍历可见源像素，每个选中像素查询四邻域，重新生成 gfx::Path。[antsTimer][n-ant-timer] 每 100ms 更新相位并失效整个选区包围盒，重复模式失效画布。矩形选区只有四条边，不属于这个最坏情况。

缩小大图使大量源像素落入视口；即使鼠标不动也会周期性承担边界构造。滚轮／平移则在频繁重绘中重复扫描。

**完整修复。**

1. 以 selection identity／mask revision／width／height 缓存文档坐标边界。增加独立选区版本，不能用“每次选区像素相等比较”充当廉价版本。
2. 参照旧版 [SelectionBoundaryCache][l-selection] 的边段与 64px 空间桶，以及 Aseprite [已缓存边界绘制][a-mask]；只查询可见桶。
3. 选区平移只变换偏移，蚂蚁线 tick 只变相位；缩放改变投影，不重新求边界。新 mask／组合／反选才重建或更新脏 tile。
4. 初次巨大／碎裂选区使用可让出的构建；结果绑定 mask 版本，完成前显示仍有效的旧结果或明确的待更新状态，不显示属于另一选区的轮廓。
5. 用可见边段的 damage，保留细线、抗锯齿和屏幕 4 黑／4 白像素相位；不能将 shader 随画布缩放。

**验收。** 4096² 不规则、棋盘碎片、洞、边缘触碰、离画布、旋转视图、重复画布；完成首次构建后，仅相位或 pan／zoom 时边界重建计数为 0。使用 framebuffer 精确对照，另测复杂 mask 首次构建的可中断性。

### F06：快照的 2ms 仅覆盖部分工作

**证据。**

- [RasterSnapshot 构造][n-rsnapshot] 同步复制所有 headers，并复制 Cel 的 text／tilemap／freeTiles 数据；tilemap cells 和实例等并非固定大小 header。
- [DocumentSnapshot 构造／matches][n-dsnapshot] 同步复制 timelapse settings 等；其 Frame 含嵌入 `Bytes data`，可能复制已嵌入录制载荷。reference 的像素使用共享指针，不能笼统说所有附件都深拷贝。
- `DocumentSnapshot::advance` 先完整 `matches`，再调用 `RasterSnapshot::advance`，后者又完整 `matches`。
- [RecoverySession::tick][n-recovery] 在 advance 前还调用一次 `snapshot->matches`；因此一次恢复推进可能走三次 metadata 校验。比较涉及 cels、masks、tilesets、cells、style signatures 等。
- 像素块的复制已有截止时间与数量限制；单 surface 的 reserve、大附件构造、共享／无 surface Cel 的跳过遍历仍不等于严格的时间上限。

设 B 为复制推进次数、N 为元数据规模，重复校验可能达到 O(B×N)，而不是一次 O(N) 加一次像素复制。

**完整修复。**

1. 先拆计时：构造、元数据捕获、版本验证、分配、像素／附件复制、完成校验。将“快照耗时”计入调用方，而不只计 advance 的循环。
2. 增加可组合的 snapshot token：身份、内容、结构、资源、蒙版／tileset、面板状态、录制、选区或需要保存的显示参数版本。修复所有写入口后才用 token 替代深比较。
3. 当前 `revision` 不能直接取代全部匹配：对称中心等预览可能不增加它。先保留完整比较作为调试 oracle，逐个覆盖 setter、导入、Undo、脚本和恢复。
4. 将 header／tilemap cells／free instances／嵌入载荷捕获纳入同一个可续传 cursor 和截止时间。对无像素项每若干项也检查 deadline。
5. 去掉同一稳定版本重复深比较；一轮只做一次版本检查，完成时做一次完整一致性验证。UI 与 worker 的版本接受仍分别检查。
6. 使用冻结资源块或分块存储，避免一次 reserve／释放巨大连续 vector；worker 只读已冻结版本，严禁借用活动文档可变数组。
7. 自动恢复遇到新编辑时保留原 scheduler 的失败／重试资格；不能重置恢复到期时间后永远捕获不到高频编辑文档。

**验收。** 256k Cel metadata、小像素大 tilemap、很多嵌入录制帧、超大单 surface、多个文档；统计每 tick 元数据访问项数和最长不可中断段。每 tick 固定预算，整体处理项数近线性；保存／恢复 round-trip、并发修改拒收、失败不清 dirty 必须保留。

### F07：预览仍会合成大片没有笔刷像素的区域

**证据。** [paintBrushPreview][n-brush-preview] 先生成 replacements，取全部点的单一包围矩形，分配该区域像素并 `compositeNormalRegion`，之后才逐点／逐 span 检查绘制 clip。Shift 长对角线、跨重复边缘的点集可使矩形远大于实际覆盖。

边缘快路只覆盖部分普通笔刷；图片笔刷、重复模式等分支会每次建立 `std::set<pair<int,int>>`，对每个覆盖点查四邻域。已有普通橡皮轮廓缓存不能覆盖这些情况。[特殊笔刷尺寸分支][n-modifier] 仍进行工具布局和画布级失效；其偏好写入细节须独立量测，不能直接断言同步写盘。

**完整修复。**

1. 将 brush shape／image 变换后的覆盖与边界缓存为紧凑 spans／segments；key 包含源资源版本、尺寸、角度、shape、模式。平铺图案的世界相位影响颜色时单独入 key。
2. 参照 [Aseprite brush generation 边界复用][a-brush]，位置移动只平移几何。普通变尺寸仍需重建新尺寸边界，但不重复重排整个属性栏。
3. replacements 按可见源区域和 tile 分桶；同一 tile 合成一次，不把远离的点合成一个巨大矩形。重复平铺须先处理所有可见副本映射，不能只裁原始画布。
4. 借鉴旧版 [brushStackPreview][l-brush-stack] 的上下层区域复用；只在支持且等价的普通混合栈使用。clip、group、调整层、蒙版、关联 owner 情况必须使用依赖感知的正确合成，不能强行套上下两张图。
5. 保留 fractional zoom 的逐像素覆盖／alpha 舍入顺序；当前整数倍率批量 fillRect 的范围不要无验证扩大。
6. 指针反馈与笔画输入区分调度：显示可合并到最新位置；真实笔画点、pressure 和时间戳按顺序全部处理。最终 MouseUp 的末点必须落下。
7. 特殊笔刷尺寸修改改成只更新对应值与旧／新预览 damage；仅字段显隐或布局结构改变时重排。

**验收。** 1000Hz 鼠标轨迹、Ctrl+滚轮、Ctrl+Alt+移动；1／64px、图片固有尺寸、Shift 长线、repeat、对称、fractional zoom、复杂混合。绘制结果与原实现像素相等。合成像素量应跟随实际可见受影响 tile，不能随两个远点的整块包围面积暴涨。

### F08：复杂样式／分组仍容易扩大为大区域重复 CPU 合成

**证据。** [CanvasRenderer::sync][n-renderer] 中，只要存在启用渐变叠加的 group 就将 region 扩为全画布；其他效果从原始 dirty 出发遍历所有 layer／group 的祖先进行扩张，未按本次实际变化 owner 精确选择依赖链。

[LayerStyleSampler][n-style] 的阴影 blur、描边、内发光含邻域采样；最坏每输出像素需要 O(radius²) 读取。[分组合成][n-group-compose] 每次建立树／排序／style bounds，并分配隔离缓冲；已有 scratch 限制和分块，不是无限分配，但没有等价于跨帧复用的样式成品缓存。kernel 缓存只省 kernel 构造，不省每像素采样。

带分组的 [onion 合成][n-onion] 还构造临时 timeline shell。此处借用像素存储，不应误报为全部像素深拷贝；但全部 Cel header 和拓扑校验仍有成本。

**完整修复。**

1. 领域变更发布具体 owner／frame／mask／resource 集合与几何前后范围，而不只有一个全局矩形。
2. 建立反向依赖：owner → linked instances → mask／style → group／clip／adjustment → affected frames。无关层效果不应扩大本次脏区。
3. 编译稳定合成拓扑，像素更新保留树；Z-order、clip、group、linked topology 改变才更新对应计划。
4. 缓存效果 tile，key 包含 source tile revisions、mask、style 参数、group geometry、frame 和颜色语义；halo 从依赖范围扩展，输出仍裁 tile。
5. 渐变 group：几何边界未变化时只重算受影响输出；边界变了，所有依赖归一化位置的渐变输出仍必须失效。不能直接删除当前全图退路导致错误。
6. 邻域算法先实现保语义的分块缓存，再考虑精确距离／最大值算法。旧 shadow 是 Chebyshev 衰减与最大 alpha，不能用常见高斯模糊替换。
7. 复杂 onion 使用已编译视图和邻帧依赖，避免每个小 dirty 都重建整个工程 shell；保持 ghost 插入位置、clip、group mask 和透明 RGB。
8. 所有缓存显式字节预算，按旧版 [style budget][l-style-budget] 与 [global cache][l-global-cache] 的契约接入。

**验收。** 多组嵌套、描边／阴影／渐变、mask、clipping、adjustment、linked layers 和 onion 的局部更新对全量合成逐像素一致。分别测冷缓存、热缓存、边界改变；无关层修改不得导致目标样式缓存全失效。不能以关闭洋葱皮／效果作为最终修复。

### F09：局部刷新仍牵动无关模型，精灵表预览同步重建

**证据。** [refresh][n-refresh] 的 scope 控制部分布局／失效，但 `syncFreeTileInstancePanel / syncReferencePanels / syncHistoryPanel / syncTabletPanel / syncTilesetPanel / syncBrushLibraryPanel / syncDocumentViewState` 不受对应 scope 限制。

并非这些函数都很重：历史面板已有版本快速返回；但 [TilesetPanel::sync][n-tileset-sync] 每次仍枚举图层／资源、重建选项、校验选择并 invalidate；按 document.revision 清图片会将不相关修改也算作资源变化。

[syncDocumentViewState][n-view-sync] 在精灵表对话框中每次调用 `buildSpriteSheetImage`，后者遍历输出项并组装完整图像。相同参数的无关 refresh 也会重复这项工作。同处 `selectionEqual` 会比较 mask vector，随后可能复制选区。

**完整修复。**

1. 使用“变更来源 + 受影响域”驱动现有 RefreshScope；补充资源／历史／selection 等子域。保留 Editor 协调，不把所有业务耦合搬到一个更大的全局事件总线。
2. 各 panel 的 sync 先比对应 model token；隐藏 panel 可延期重建，在再次显示前补齐，命令 enabled／焦点与 capture 的必要更新仍即时处理。
3. tileset 图片 key 改为 tileset／tile source storage revision；列表 key 用资源拓扑版本，选择 key 用 selection version，避免普通 raster 修改清整个图集预览。
4. 精灵表预览使用“文档快照版本 + 完整导出参数”键；相同参数不重算。新参数替换待处理预览任务，旧结果验证 generation 后丢弃。
5. 重型预览后台生成并限制预览分辨率，但导出仍使用完整规格；只有预览允许降采样，不能改变输出帧、间距、trim 或层／循环节拆分语义。
6. 选区同步用独立版本和共享只读 mask；视图更新不对数百万 mask 元素反复比较。
7. 视图旋转等当前每 move 全 refresh 的调用先迁移为视图 scope；缩放／pan 路径保留已有局部优化。
8. `saveLayerPanelState` 已后台写盘，但变化时的 JSON Stringify、首次读取仍在 UI；作为该域独立指标测量，确认昂贵后再把不可变 DTO 的序列化移出 UI。

**验收。** Canvas-only 更新不构建 tileset 列表、历史列表或精灵表；菜单状态仍及时正确。精灵表连续拖参数旧结果不覆盖新参数；取消不启动导出；final export 与原像素／布局一致。隐藏／显示面板、工具切换、播放时 active 状态与焦点必须回归。

### F10：缩略图队列有预算，但单项无法被抢占，总缓存缺少全局上限

**证据。** [CelThumbnailQueue::flush][n-thumb-queue] 在一项 `render()` 返回后才判断 64 项／8ms。调度在 UI timer 上执行，[回调][n-thumb-binding] 同步 render、创建 surface、upload。[contentBounds][n-thumb-render] 对 Content framing 扫描源像素；大型稀疏图的一个缩略图就可能超出整轮预算。

[CelThumbnailCache][n-thumb-cache] 只有每 owner 的 8 个 variant／128KiB 限制；WeakOwner 不保活源，但文档中源仍存活时，遍历很多不同 owner 的缓存会累积。单 variant 大于预算时也保留至少一项。每 owner 上限不是整个文档／进程的上限。

**完整修复。**

1. 复用按 source revision 缓存的内容 bounds；写入边缘透明度导致 bounds 缩小时允许惰性重建，不能使用过时边界裁掉内容。
2. bounds 首次扫描按行／tile 分片，或在冻结源上 worker 执行；UI 只接受小缩略图像素并上传。
3. 可见格优先，离开视口取消，拖滚动过程中只保留仍需要的请求；保留 owner、generation 与 identity 校验。
4. 增加所有 owner 合计的 LRU 字节上限，并计入缓存像素、可见 surface、在途结果；保持现有每 owner variant 上限作为第二层限制。
5. 多个链接 Cel 的相同 source／相同 options 共享结果；opacity、framing、canvas size、offset、DPI 改变仍需正确区分。

**验收。** 冷滚过大量不同 Cel，然后再返回；统计单 callback 最大时间、全缓存高水位、命中／淘汰量。慢源不能挡住鼠标；取消旧绑定不污染复用控件；链接 owner 一次内容扫描尽可能供多个相同缩略图使用。

### F11：播放追赶可能连续处理一万次帧切换

**证据。** [playbackTick][n-playback] 同步 while 追赶最多 10000 步，每一步调用 `document.selectFrame`。后者投影 geometry／opacity 并发布全画布内容变化；虽只在循环后 refresh，不是每一步都真正渲染，但每步领域投影仍有成本。

[CanvasRenderer][n-renderer-header] 只保留当前 content surface；`syncFrame` 更换 preview frame 时全图合成／上传，没有这里可见的多帧成品 LRU。Timeline 的“合成顺序缓存”不等于“整帧像素缓存”。

**完整修复。**

1. 将播放时钟／循环状态推进与 Document 的最终显示帧投影拆开。无副作用的中间帧只推进时钟，最后一次投影。
2. 简单循环以 duration 前缀和定位当前时刻；有限 repeat、往返、tag／loop section 依旧状态机推进必要边界，不能盲目 `elapsed % total` 改变结束和次数语义。
3. 给补偿计算实际时间预算；暂停／后台恢复后仍保持旧逻辑的时间和完成行为，不能只减小 10000 上限后丢状态。
4. 增加有界 frame tile／成品缓存，与 source owner 的内容版本绑定。当前 contentRevision 会因导航变化，不能直接作为唯一缓存键，否则回到上一帧也永远 miss。
5. 共享多个预览消费者的冻结合成结果；分别保留它们的相对明暗、缩放和 onion 设置。邻帧预取优先级低于输入与当前显示。

**验收。** 不同时长、disabled frame、有限／无限循环、ping-pong、嵌套／tag 转接和单次停止；人为注入 0.2／2 秒 UI 停顿，对照原状态机最终帧与 repeat 计数。warm 小循环不重复合成不变 source；采集帧间隔 p99，不能只报告平均 FPS。

### F12：脚本预算未覆盖同步解析和应用结果

**证据。** [pumpScripts][n-script-pump] 向 host 传 3ms deadline；[Pending run tick][n-script-receive] 用它推进 invocation capture，但 response ready 后同步调用 `receiveWorkspaceResult`。接收／[applyRasterResultImpl][n-script-apply] 的 JSON 校验、操作规划、事务应用没有由这个 deadline 自动中断。

已有 Rust 执行预算、捕获预算、目标校验仍应保留；这里不是“脚本没有预算”，而是预算没有覆盖完整 UI 返回路径。

**完整修复。**

1. 记录 `snapshot DTO / JSON decode / validate / plan / candidate / commit / reconcile` 各阶段，输入端同步 `snapshot_(*active)` 也纳入。
2. 将纯 JSON 解析和不依赖 UI 的计划校验移到 worker；结果输出 typed plan，不重复 stringify／parse 子对象。
3. 重型像素／结构运算在不可变 baseline 上构建 candidate，UI 最终核对 document／target／revision 后一次交换或提交差量。
4. 不能向 worker 传 UI callback 或活动 Document；save／export／panel／notification 等效果保留原顺序，通过明确 continuation 在 UI 执行。
5. 如果批次具有逐项可观察的 legacy 语义，只在合法事务边界让出，不能把整个脚本随意合成一个事务。最终提交阶段不允许一半修改可见。
6. 每个阶段有资源上限、取消和过期结果处理；切文档、关窗口、Escape、扩展禁用／卸载的现有 target／session 生命周期验证保留。

**验收。** 大像素结果、大量结构操作、混合 UI 请求、嵌套事务失败、result ready 时切文档／Undo、连续拖动表单值。验证失败回滚、历史条数、通知／文件操作顺序和最终像素；后台执行成功不等于 UI 接收不卡。

### F13：维护任务需要共享预算，不能只各自写一个毫秒数

**证据。** [16ms 主维护 timer][n-maintenance] 一次串行调用 gallery／home／timelapse／liquify／save／framePng／playback／recovery／usage／filter／wand／gradient／shape 等 tick。各 tick 可能快速返回，所以不能仅凭数量断定空闲 CPU 高；但它们没有共同剩余时间预算。恢复可以处理活动与另一非活动文档，另有 thumbnail timer 和 script timer。

新缓存若分别设置 64MiB，也可能叠加成较大工作集。当前已确认的是部分组件局部限额，**没有在本轮证明全进程必然泄漏或必然交换到磁盘**。

**完整修复。**

1. 给现有主协调器加入共享 `UiWorkBudget(deadline, bytes, operations)`，优先输入反馈／当前显示，其次当前预览，再到缩略图、恢复与库扫描。
2. 维护任务返回 Done／Pending／Cancelled／Failed，保存 cursor；轮转保证低优先级任务不会饿死。不是给每个 tick 重新发一个完整 2ms。
3. 输入路径只标记工作，短小反馈即时完成；重型后台任务完成后投递轻量结果事件。不要为每个小预览无限创建线程。
4. 后台同时在途的快照、合成、编码统一准入；请求取消不能在 UI 析构上等待慢 worker。任务由服务对象接管直至结束，结果持弱 UI 标识。
5. 缓存计账与文档／历史／保存／录制数据分开。只有可重建缓存允许淘汰；不得删除作品、撤销历史、恢复或录制来满足缓存限额。
6. 空闲 tick 只进行状态检查；无任务的独立 timer 停止，结果或状态变更唤醒。先采集 wake 次数和实际工作，避免盲目减少 timer 破坏播放／喷枪时序。

**验收。** 1／8 个文档，绘画 + 自动恢复 + 缩略图冷滚动 + 脚本结果并发；统计整个 UI 批次总耗时和最大单任务，而不只统计各函数均值。高优先级响应稳定，恢复仍最终完成，关闭后缓存／在途所有权可解释，慢盘失败可观察。

## 5. 修复所需的共同边界

这些是对现有 Document、Timeline、Renderer、Snapshot 和队列的增量扩展，不要求重新建一套应用框架。

### 5.1 版本与变更集

拟议的 ChangeSet 至少包含：

| 字段 | 用途 |
| --- | --- |
| document identity、transaction sequence | 防止跨工程和过期事务结果写回 |
| structure／frame metadata／resource revision | 区分拓扑、帧时长、资源变化 |
| owner ID + storage revision + dirty tile／region | 只失效真正变化的像素依赖 |
| geometry before／after、style／mask revision | 正确扩大效果范围和渐变边界 |
| selection／timeline selection revision | 缓存轮廓、避免重复 mask／slot 比较 |
| view／layout／skin／DPI revision | 视图变化不清内容，素材变化不沿用旧命中 |

先梳理现有版本并补缺口，避免同一语义维护两套互不一致的 revision。框架引入前，为每个写入口登记它必须发布哪些域；由 debug oracle 检查“值已变而版本未变”。

### 5.2 可变链接与不可变快照必须分开

当前 `share()` 用于多个链接成员共同观察修改。冻结历史／worker 需要旧版本不变，两者所有权不同。

拟议边界：

- **编辑 owner**：Document 唯一写入；链接成员通过 owner 解析，不各自复制像素。
- **冻结版本**：只读 tile／metadata，供渲染任务、保存、录制使用；本次冻结后发生编辑不得修改它。
- **事务差量**：仅保存触及 tile／run 及必要结构关系；取消或失败恢复这些差量。
- **显示缓存**：可随时丢弃并重算，绝不能成为唯一作品数据。

迁移期间保留旧 LinkedPixelStorage 的复制语义，通过显式 freeze／edit API 接入新路径。先证实无活动 mutable vector／pointer 外借，再进行零拷贝优化。禁止以 `const_cast` 或把共享 mutable vector 交给 worker 代替冻结。

### 5.3 失效规则必须可检查

| 操作 | 应失效 | 不应失效 |
| --- | --- | --- |
| 移动指针／普通调笔刷尺寸 | 旧／新反馈区域、对应参数字段 | 作品内容、历史、时间轴拓扑 |
| pan／zoom／旋转视图 | 投影、可见区域、feedback | source 像素、效果成品的文档坐标内容 |
| 一个 owner 画像素 | 该 owner 依赖的帧／效果 tile／缩略图 | 无关 tileset、图层树、菜单目录 |
| 新 Cel／改链接／改变 group | 相关拓扑与依赖计划 | 无关 owner 的像素存储 |
| selection 相位变化 | 边界绘制相位 | mask 内容与边界几何 |
| 切活动帧 | 显示目标与 active UI | 未修改帧的 source 内容缓存 |
| style 参数或 geometry 改变 | 对应依赖输出，必要时整个受影响组 | 无关组的效果缓存 |
| 关闭文档 | 该文档缓存注册与待接收结果 | 其他工程、用户恢复和录制文件 |

### 5.4 不允许用产品退化“优化”

保留旧版快捷键、修饰键优先级、所有笔画样本、stroke 的最后一点、取消／失败／恢复、撤销重做、链接 owner、蒙版、瓦片四模式、透明 RGB、效果与导出内容。

不能擅自关闭录制／洋葱皮／预览，不能缩减帧数、撤销条数或工程大小上限。现有预算超限行为应保持；若新的硬限制会拒绝过去可用的操作，必须作为明确产品取舍另行说明。

UI 保持 Fusion Pixel 10px、默认 2×、既有布局与 legacy 图标；相关修改遵循 [统一 UI 规范][d-ui]。

## 6. Aseprite 与旧版提供了什么依据

| 本次采用的机制依据 | 实际读到的实现 | 对原生版的适配 |
| --- | --- | --- |
| 笔刷轮廓随 brush generation 复用 | Aseprite BrushPreview::createBoundaries，检查 brush gen／tilemap mode／layer | 扩大现有轮廓缓存的覆盖；不改预览产品语义 |
| 蚂蚁线复用已有边界路径 | Aseprite drawMaskBoundaries 调 createPathIfNeeeded，再投影 | 选区 mask 与显示相位分离 |
| 可见帧／行驱动绘制 | Aseprite Timeline::onPaint 先 getDrawableLayers／Frames | Native 已有窗口化，补齐蒙版索引和模型复用 |
| 选区边界空间分桶 | legacy canvas-selection-renderer 的 mask 身份、边段和 64px 桶 | 用 gfx path／tile index 适配，不逐 tick 扫像素 |
| 笔刷上下栈复用 | legacy canvas-brush-stack-cache 按 document／revision／active layer 缓存区域 | 仅对语义等价的栈应用，复杂依赖另走正确路径 |
| 录制真正让出任务 | legacy freezeTimelapsePixelsAsync 每约 4ms await yield | 原生状态机返回消息循环，或冻结后后台计算 |
| save 共享身份与可转移数据 | legacy project-save-transfer 的 buffer／pixel／runtime map | 保留唯一源身份，不重复复制相同资源 |
| 内容／样式／全局缓存预算 | legacy runtime-raster、layer-style-cache-budget、global-cache-manager | 缓存按字节和 source 修订管理，非作品大小限制 |
| 时间轴 lookup | legacy LayersPanel useMemo(createAnimationCelLookup) 和 mask owner 集合 | 有界模型缓存与一次索引构建，保持选择／折叠规则 |

Aseprite 固定参考提交为 `14fe117e853bd642672e72018166239506060cd4`。本次只读对照，没有复制实现。现项目许可说明明确：**可复用的 MIT UI／laf 与 Aseprite app 业务源码不能视为同一许可范围**；业务实现应独立适配，实际复用前逐模块核查。[许可依据][d-license]。

旧版不是所有场景都快的证明；这里只承接明确存在的机制与行为测试。不能将某个 WebView／React 问题直接套到原生上，也不能以 Aseprite 手感印象代替同机回放证据。

## 7. 可执行的实施顺序

每个阶段保持主 Agent 单一写入、串行构建；只使用现有 `native/build/Release/moonsprite-native.exe`，不创建 preview 工程／外部工作树。以下是后续执行方案，本次没有执行。

| 阶段 | 具体修改 | 前置与交付 | 必须通过的出口 |
| --- | --- | --- | --- |
| 0：建立基线 | 增加分阶段计时和计数、准备固定输入／工程夹具 | 记录源码、exe hash、设备／窗口／DPI／录制状态 | 无算法改动时，插桩开关的像素／行为一致；获得 p95／p99 |
| 1：局部模型 | F04 蒙版行索引、F05 边界缓存、F09 按域同步与精灵表去重、F07 轮廓缓存 | 先做一次调用内复用，再补安全版本缓存 | 原行为 oracle、边框 alpha／命中、无关域工作计数为 0 |
| 2：交易与存储 | F01 空 Cel／lookup／局部扩展，F02 蒙版差量，明确冻结 API | 逐入口迁移；不全局改 copy 语义 | Undo／Redo／取消／失败／linked topology 精确等价 |
| 3：异步边界 | F06 可让出的完整快照，F03 捕获冻结与后台准备，F10 缩略图工作拆分，F12 typed result plan | 使用阶段 2 冻结资源；脚本效果仍按合法边界执行 | UI 不阻塞；切文档／关闭／取消／失败和输出顺序一致 |
| 4：合成与播放 | F08 依赖计划／tile style 缓存、F07 内容预览缓存、F11 时钟及帧复用 | 全量 compositor 为 oracle，正确性优先 | 复杂混合／蒙版／group／onion 像素等价及 warm cache 命中 |
| 5：资源治理 | F13 共享预算、全缓存账本与压力退化 | 不改用户文档／历史留存政策 | 多文档并发、慢盘、长时间使用的时延／内存有界 |
| 6：总复查 | 检查写入口 revision、缓存 key、worker 所有权、退出等待、遗漏全量 refresh | 更新来源台账及迁移缺口 | 下节矩阵通过后才宣告相应问题已修复 |

每阶段交付应包含：问题复现、源码改动、来源、前后同机样本、正确性对照、剩余限制。阶段 1 可先减轻症状；阶段 2～4 才能系统处理大工程绘制和多功能叠加。不要把拆文件数量或类数量当作性能验收。

## 8. 测量与验收设计

### 8.1 现有插桩的扩展

保留 `MOONSPRITE_INTERACTION_PROFILE`、InteractionScope、canvas 分项、upload counters。新增采样环形缓冲，结束后批量输出，不能每个 MouseMove 同步写日志。

至少记录：

- 输入接收时间、处理开始／结束、paint 开始／结束、flip／present 提交时间、input sequence。
- stroke begin／move／commit，lookup 初始化字节、State／Surface 深复制字节、mask baseline 字节。
- refresh 的来源／scope；各 panel sync 次数、模型重建次数、layout／完整窗口失效次数。
- 合成源／输出像素数、dirty 与 viewport 面积、style sampling 次数、cache hit／miss／原因。
- TimelineRows 构建、mask 扫描、selection 扫描项数、可见格数与 thumbnail 冷扫描。
- snapshot 构造／匹配／复制／分配／完成；record freeze／compose／encode／write；script decode／plan／commit。
- 每轮维护总用时、worker 数、队列待处理字节、取消／过期结果数、各缓存存活字节。
- UI 与 worker 线程标识；否则容易把后台耗时误算为界面阻塞。

嵌套 scope 的 inclusive 时间不能简单相加当成总墙钟。报告分阶段 exclusive 时间与端到端时间。软件 event→paint 只能量软件路径；硬件 event→photon 需呈现追踪／高速摄像等单独验证。

### 8.2 固定负载矩阵

| 场景 | 固定输入与变量 | 关键检查 |
| --- | --- | --- |
| 小图基线 | 256²、1／16层、1／24帧 | 优化不能让常见小图明显退化 |
| 大画布稀疏绘制 | 4096²，支持时再试8192²；已有／局部／缺失 Cel | 起笔／抬笔、触及字节、取消 |
| 多层多帧 | 256层×1000帧；1024层×5000帧以 metadata／链接为主 | 控件数随视口；无关内容不被扫描 |
| 大选择 | 16k／64k slot、mask／virtual／group 混合 | hover／滚动／拖移、轮廓与命中 |
| 复杂 mask | 大面积实心不规则、洞、棋盘碎片、离画布 | ants tick、pan／zoom、首次边界构建 |
| 笔刷反馈 | 1／64px、图片、Shift 长线、repeat、对称 | Ctrl+滚轮／Ctrl+Alt+移动、旧新 damage |
| 连续绘制 | 同一 1000Hz 有时间戳轨迹与 pressure | 不丢样本、末点和 perfect-pixel 结果 |
| 样式／onion | 10／100层、嵌套 group、blur／stroke／gradient、前后8帧 | 冷／热合成、局部对全量像素 |
| 缩略图冷滚动 | 大稀疏 owner、同源链接与不同源混合 | 单项时长、累计缓存上限、取消 |
| 播放 | 12／24／60fps目标、变时长、disabled、loop／tag／ping-pong | p99帧间隔、补偿后正确状态 |
| 持久化 | 录制关／Smart／Full、多嵌入帧、恢复到期、慢盘模拟 | UI准备与worker分离，失败保持dirty |
| 脚本／扩展 | 大结果、多操作、表单连续值、切文档／取消 | 结果接收停顿、事务顺序与回滚 |
| 并发／长期 | 1／8文档，各场景组合；2h／8h固定循环 | 输入尾延迟、内存高水位、缓存释放 |

不能构造 1024×5000 个全部整图 surface 然后把预算拒绝认定为性能回归。分别测试 metadata 规模、实际唯一 owner 字节、共享比例与活跃 viewport，明确每项工程是否在既有支持范围内。

### 8.3 建议的初始预算

固定 Release、同一机器／电源模式／窗口大小／DPI／显示刷新率，去掉 smoke oracle 与 profiler 后另做一轮。至少 5 次固定回放，分别报告 warm-up、冷缓存和热缓存；保留中位数、p95、p99、max 和原始样本。

| 指标 | 初始目标 |
| --- | --- |
| 60Hz 普通交互软件一帧总工作 | p95 ≤ 16.7ms；p99 超预算须分项解释 |
| 120Hz 同类负载 | 参考 ≤ 8.3ms，按硬件测量确认能力 |
| warm 指针／笔刷参数反馈处理 | p95 ≤ 2ms，p99 ≤ 4ms；不包含硬件呈现 |
| UI维护单批总预算 | 约2ms起步，输入活跃时更低；任务完成后检查超时不算满足 |
| 固定小笔画提交 | 复制／工作量跟随修改区域与必要链接分量；不能随无关工程像素线性增长 |
| warm 时间轴滚动／hover | 不重建无关拓扑、不扫全蒙版；在上述帧预算内 |
| 自动恢复／录制 | 接续推进期间输入仍能处理；无未解释的 >50ms 不可中断 UI 段 |
| 缓存 | 明确总预算、高水位和淘汰；关闭文档后保留量可解释 |

这些数值用于确定工程目标，不保证所有 8192²／复杂效果组合都能单帧完成。超大任务必须显式后台／可取消，不能为了数字达标漏像素或降低用户输出质量。

### 8.4 正确性门禁和已有入口

按改动域选择现有检查，未修改领域不要求每次重跑全库；最后再运行覆盖实际改动面的组合。

- 绘画／存储：`document-raster-history`、`raster-geometry`、`linked-layers`、`attached-masks`、`mask-resize`。
- 快照／文件：`raster-snapshot`、`document-snapshot`、`project-save-raster-resources`；追加录制附件、变更拒收、失败重试。
- 缩略图：`cel-thumbnail`、`cel-thumbnail-pipeline`。
- 合成／分组：`layer-group-compositor`、`document-layer-groups`、`document-layer-group-structure`，保留现有样式／onion 对照。
- 录制：`timelapse`、`timelapse-restore`、`timelapse-video`。
- 脚本：`lua-script-invocation`、`lua-script-runtime`，以及受影响的接收／扩展测试。
- 正式程序专项：`--drawing-pan-performance-check`、`--brush-preview-performance-check`、`--wheel-performance-check`、`--modifier-brush-performance-check`、`--large-timeline-performance-check`、`--group-timeline-check`、`--timeline-density-check`、`--ui-geometry-performance-check`、`--hit-testing-performance-check`。
- 新增源码／测试／脚本登记 `docs/legacy-provenance.json`，从仓库根运行 `python native/scripts/check-legacy-provenance.py`。覆盖通过不代表行为等价；还有已知迁移缺口时 `--strict` 应继续失败，不能删缺口求绿。

特别检查：分配失败、worker 异常、磁盘满、关闭／切文档、Undo 后新分支、取消正在运行的预览、链接 owner 删除／重绑、负坐标／storageOrigin、透明 RGB、瓦片资源共享、选框 alpha 命中。

**报告分三层：** 源码／文档核对、自动检查、人工图像／真实输入验收。三者不能互相代替。本次仅完成第一层。

## 9. 暂不作为当前已证实根因的事项

- 大源码文件、Editor 聚合状态很多，确实增加修改时遗漏失效域的风险；文件大本身不能证明运行慢。拆分应围绕 F01～F13 的所有权和调用边界。
- 本地历史已经有 delta／checkpoint／budget 基础；本轮在 src 中未找到 `setHistoryChangeListener` 的产品注册调用，仅找到声明，不能把 `documentShape` 的全量 JSON 构建直接归为每笔必经路径。后续接入该服务前应避免每提交全量 shape 构造。
- 可能存在 GPU／驱动、DWM、DPI、输入队列和真实窗口 resize 问题；当前源码读取不足以判定。ETW／WPR／PresentMon 或等价工具应另做运行诊断。
- 本轮没有测空闲 CPU、内存泄漏或硬盘健康，不能将“所有操作卡”归为机器问题。
- 调整／滤镜、text raster、free-tile 空间索引、图片／PSD／ASE／GIF导入导出、扩展布局和库扫描未逐分支审完；已有 worker／预算不代表所有准备／接收都已达标。按矩阵采样后再形成新的 A 级条目。
- 历史性能文档部分规划（例如源存储、保存交互）已落后于当前实现；实施以当前调用链和已确认 legacy 契约为准。

## 10. 审计文件指纹与交付核对

下面的 SHA-256 前 16 位用于辨识本轮主要证据文件，不替代 Git 版本与完整性校验。工作区持续变化时，按函数和完整 diff 复核。

| 文件 | SHA-256 前16位 |
| --- | --- |
| `src/document.cpp` | `ED67774F880D7B45` |
| `src/linked_pixel_storage.h` | `F5ABD8DC17EAAFF0` |
| `src/timelapse_session.h` | `4E7B015000F7FEFC` |
| `src/editor_canvas.cpp` | `569BC4210E0DF212` |
| `src/editor_timeline_rows.h` | `D5B6DB411CDA4723` |
| `src/editor_timeline.cpp` | `828DE2BCE70CDE01` |
| `src/raster_snapshot.cpp` | `D3BF4765A51264AD` |
| `src/document_snapshot.cpp` | `149A6FD8E1A8721E` |
| `src/editor_refresh.cpp` | `EDA83557300492E2` |
| `src/canvas_renderer.cpp` | `5296C74C2FE8144D` |
| `src/layer_compositor.cpp` | `26A360255CF76B3A` |
| `src/layer_group_compositor.h` | `BA34CAF89AE51DA1` |
| `src/layer_style_sampler.h` | `84D08A15C8187AE4` |
| `src/cel_thumbnail.cpp` | `19AE48472EAD63BC` |
| `src/cel_thumbnail_pipeline.cpp` | `39DC878A992B89E5` |
| `src/editor_lifecycle.cpp` | `BE4FB2D7345FEDC7` |
| `src/lua_script_runtime.h` | `A3A0BA481C17D2F2` |
| `src/tileset_management_panel.h` | `B39DDFDD39EAEB6E` |

本次仅新增此报告。没有发布性能修复，也没有新增源码／测试／脚本，因此未改来源台账。交付核对：46 个引用目标均存在、行号有效，18 个主要证据文件两次 SHA-256 相同。构建、自动回归、人工 UI、硬件延迟及真实内存验收全部留待实施阶段，不能标记为已通过。

## 引用位置

行号按本轮读取版本；源文件改变后以函数名定位。下列链接指向唯一原生工作区和同仓库 legacy／固定依赖。

[n-stroke]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/document.cpp:1246>
[n-stroke-end]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/document.cpp:1446>
[n-storage]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/linked_pixel_storage.h:18>
[n-push]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/document.cpp:1688>
[n-recording]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/timelapse_session.h:82>
[n-recording-pixels]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/timelapse_pixels.h:20>
[n-rows]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/editor_timeline_rows.h:13>
[n-timeline-layout]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/editor_timeline.cpp:916>
[n-outline]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/editor_timeline.cpp:1167>
[n-pointer]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/editor_canvas.cpp:619>
[n-modifier]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/editor_canvas.cpp:365>
[n-input-end]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/editor_input.cpp:934>
[n-ants]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/editor_canvas.cpp:991>
[n-ant-timer]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/editor_lifecycle.cpp:65>
[n-rsnapshot]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/raster_snapshot.cpp:7>
[n-dsnapshot]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/document_snapshot.cpp:6>
[n-save]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/editor_session.cpp:471>
[n-recovery]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/editor_recovery.cpp:9>
[n-brush-preview]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/editor_canvas.cpp:1103>
[n-renderer]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/canvas_renderer.cpp:44>
[n-renderer-header]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/canvas_renderer.h:20>
[n-style]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/layer_style_sampler.h:20>
[n-group-compose]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/layer_group_compositor.h:20>
[n-onion]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/layer_compositor.cpp:108>
[n-refresh]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/editor_refresh.cpp:100>
[n-view-sync]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/editor_refresh.cpp:42>
[n-tileset-sync]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/tileset_management_panel.h:189>
[n-thumb-queue]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/cel_thumbnail_pipeline.cpp:27>
[n-thumb-cache]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/cel_thumbnail_pipeline.h:15>
[n-thumb-render]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/cel_thumbnail.cpp:13>
[n-thumb-binding]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/editor_timeline.cpp:873>
[n-playback]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/editor_timeline.cpp:392>
[n-script-pump]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/editor_lifecycle.cpp:769>
[n-script-receive]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/lua_script_runtime.h:114>
[n-script-apply]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/lua_script_result.cpp:418>
[n-maintenance]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/src/editor_lifecycle.cpp:134>
[l-recording]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/legacy/src/renderer/src/core/timelapse-pixels.ts:50>
[l-selection]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/legacy/src/renderer/src/components/canvas-selection-renderer.ts:198>
[l-brush-stack]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/legacy/src/renderer/src/components/canvas-brush-stack-cache.ts:6>
[l-style-budget]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/legacy/src/renderer/src/core/layer-style-cache-budget.ts:4>
[l-global-cache]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/legacy/src/renderer/src/core/global-cache-manager.ts:30>
[a-brush]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/.cache/aseprite/src/app/ui/editor/brush_preview.cpp:639>
[a-mask]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/.cache/aseprite/src/app/ui/editor/editor.cpp:1113>
[d-history]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/docs/performance-20261105.md>
[d-ui]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/docs/ui-design-spec.md>
[d-license]: <D:/Mine/Study&Work/学习工作/CodexWork/moonsprite/native/THIRD_PARTY.md>

