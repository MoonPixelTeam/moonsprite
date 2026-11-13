# 性能优化实施记录（2026-11-12）

对应审计：[performance-audit-2026-11-12.md](performance-audit-2026-11-12.md)。
实施开始 HEAD：`b2510a82a521563e47989b7d6e88eae2e1803879`，分支 `dev`。

## 第一批范围与已验证结果

先落实局部模型、边界缓存、重复预览、快照重复校验和缓存总量治理。
这些修改已进入产品路径；不改变操作入口、快捷键、时间轴顺序、撤销语义、作品格式或图标素材。
本轮没有把 F01～F13 全部宣告解决，也没有改动像素存储的全局复制语义。

| 审计项 | 已实施 | 仍需继续处理 |
| --- | --- | --- |
| F04 时间轴 | 一次建立蒙版 owner 集合、行号索引、每行蒙版标志及 owner；三类拖动事件各只建立一次行模型 | 行模型目前仍按调用重建；跨事件的结构版本缓存及其他蒙版查询未全量迁移 |
| F05 蚂蚁线 | 复用旧版合并边界段算法，按独立选区修订、文档身份和可见源范围缓存 | 选区／可见源范围变化仍需冷构建；超限碎片选区使用原路径；重复平铺多视口没有独立缓存 |
| F06 快照 | 恢复推进只做一次完整校验；空／链接 Cel 同样检查截止时间；显式区分源变化、未完成和完成 | 构造、单次元数据校验、完整容器 reserve 仍同步，不能承诺每轮严格不超过 2ms |
| F09 刷新扇出 | 精灵表只在来源或输出参数变化时重建；打开窗口只生成一次；选区枢轴的深比较由选区修订门控 | 首次精灵表合成仍同步；其他面板按域同步尚未完成 |
| F10 缩略图 | 保留每 owner 的 FIFO 和弱引用，增加全部 owner 的总容量与数量上限 | 单个缩略图任务仍不可抢占；显示控件持有的结果、其他缓存尚无统一账本 |

## 实现与正确性约束

### 时间轴

`editor_timeline_rows.h` 将蒙版归属收集一次，重复帧的同一 owner 只产生一条蒙版行。
`mask()` 和行号查找不再扫描全部蒙版／可见行；State 回退查询也不再在逐项比较中重复构造 owner 字符串。
折叠、分组蒙版、紧凑视图、无效行及重复 ID 的首项匹配保持原语义。

`editor_timeline.cpp` 的眼睛、锁、自动链接拖动循环把行模型构造移到循环外，避免每个池化控件重复扫描整个工程。
没有添加跨事务的长生命周期指针缓存。

### 复杂选区

新增 `selection_boundary.h`，把相邻水平／垂直边界合并为线段。
缓存只覆盖当前可见源像素，并保留原路径在可见范围边缘的选中像素语义。
坐标仍在源空间；绘制时转换到显示坐标，4 黑／4 白设备像素的 shader 与发丝线宽不缩放。

不能用 history/content revision 或 vector 地址证明选区不变：实时预览、脚本和同尺寸替换都可能改变选区。
因此 Document 增加独立 `selectionRevision()`，所有已定位的赋值、清除、事务交换、历史恢复、浮动变换和临时 raster 安装统一经过私有写入口。
脚本事务失败的回滚交换也推进选区修订，保持保守失效。
该修订不修改工程 dirty、持久化格式或历史数量。

缓存最多保留 262144 条四整数线段，坐标容量上限为 4MiB。
达到上限立即释放坐标，当前 key 记录为不可缓存，随后直接走原有裁剪路径，不反复尝试构建同一个失败缓存。
无选区、矩形选区仍保留原有快速路径。

后续新增 Document 选区写入必须使用 `setSelectionValue` / `swapSelectionValue`，不能绕过选区修订。

### 保存／恢复快照

`DocumentSnapshot::advanceChecked` 返回 `SourceChanged` / `Pending` / `Complete`。
恢复调度通过一次调用处理正常的源变化取消，不再依次执行三遍匹配校验。
普通 `advance` 仍在源变化时抛异常，保持已有调用约定。
已完成快照也必须校验源；未带修订的 geometry、symmetry 等检查没有移除。

Raster 的已验证推进入口仅对 DocumentSnapshot 开放。
空 Cel 和共享 Cel 的遍历也会让出任务。
若入参预算尚未过期，但元数据校验耗尽了时间，允许最多 256 个无负载 Cel 或一个像素 chunk 推进以防永远无法完成，也避免每轮只跳过一个空 Cel 造成巨大积压；入场已过期时不复制负载。
这是一种有界前进策略，不是完整快照阶段的硬实时保证。

### 精灵表与局部同步

仅复用最近一次成功的预览图，不保留多个大图副本。
key 精确比较全部精灵表选项、文档 identity/revision/content revision、所需选区修订及 selected frame/layer 的实际来源。
窗口重新打开强制重新校验来源；构建失败清除 key、图像并禁用确认，下一次有效刷新可以重试。
导出方式、自动打开等不影响像素的参数不再触发合成。
正式导出／新建文档仍走原有编码和创建逻辑。

枢轴只在选区修订改变且浮动会话结束后做深比较；相同选区值仍保持已有枢轴。

### 缩略图

缓存按实际 vector capacity 计入总量，上限 16MiB；最多 4096 个 owner。
保持原每 owner 的 8 变体、128KiB 软限、FIFO 命中不重排、revision wildcard、storage revision 和弱引用生命周期。
全局淘汰也按插入先后；过大的单个结果正常返回调用者但不缓存，也不会留下相同 key 的旧结果。
已经交给显示控件的 shared result 淘汰后依然有效。
限制只影响可重建的缓存，不删除作品、撤销、恢复、录制或用户资源。

## 检查与测量

首轮 Release 核心测试：`raster-snapshot`、`document-snapshot`、`selection-boundary`、`cel-thumbnail-pipeline`、`layer-panel-tree`，5/5 通过。

| 固定夹具 | 本机本轮结果 | 测量边界 |
| --- | --- | --- |
| 256 图层 × 128 帧蒙版，建立行模型并查询蒙版行 | 原扫描约 497.667ms；索引约 0.7133ms | 单次模型 microbenchmark，含实际检查；不是整个时间轴帧耗时或整体软件提速倍数 |
| 1024² 复杂选区，中央孔洞，合并后 8 段 | 冷建约 10.4709ms；1000 次预热查询合计约 0.008ms | 只测边界构建／查询，不包括 Path、GPU 上传或系统呈现 |

新增选区测试穷举 512 个 3×3 二值蒙版 × 5 种裁剪，逐单位边与原算法比对；另测负坐标、非二值 mask、同尺寸预览替换、Undo/Redo、取消选择及超限回退。
UI 的 `--ants-check` 另增加 60 组与原路径逐像素比较，覆盖孔洞／碎片、5 种缩放、2 种原点和 3 种相位；实际执行结果见下文。
缩略图测试覆盖跨 owner 总量、数量、过大 backing capacity、淘汰后外部结果生存和计账清零。
快照保留并通过未修订 geometry 变化拒绝、像素隔离、共享 owner、负 offset、storage origin 和独立 worker 结果检查。

正式程序已成功构建至 `build/Release/moonsprite-native.exe`（29961728 bytes），SHA-256：`7865102eea75884e3289c39b21c3318fd5d4fd2954a8757a4f82cb34ac1c1af6`。

UI 检查均使用该正式程序：

- `--ants-check`：60 组新旧路径逐像素对照通过；保留的相位反转、8 相位周期、单设备像素线宽、显隐菜单／快捷键和浮动选区检查通过。已查看输出 `build/Release/ants-smoke.bmp`，仅人工检查了这张蚂蚁线截图，没有宣称完成整个应用的人工图像验收。
- `--sheet-new-document-check`：打开只建一次、Canvas／Commands 刷新复用、输出方式不重建、布局改变／恢复重建，以及新文档内容与原文档状态检查通过。
- `--group-timeline-check`：分组时间轴检查通过。
- CTest 的 `selection-interactions`、`deselect-transform`：2/2 通过。
- CTest 的 `brush-preview-performance`、`wheel-performance`、`modifier-brush-performance`、`drawing-pan-performance`、`large-timeline-performance`：5/5 通过。

以下是本轮正式程序的当前测量。full/local、reuse 开关是**同一版本内部参考路径对照**，其中一些机制在本轮之前就已存在，不能把其差值算作本轮提交的提速：

| 夹具／指标 | 本轮观测 |
| --- | --- |
| 滚轮，局部路径，无／有对称轴 | mean 6.478／7.832ms；framebuffer 等价；内容上传次数不增加 |
| 铅笔 Ctrl+滚轮／Ctrl+Alt+移动，局部路径 | mean 2.210／2.599ms；布局与 chrome 重绘次数为 0 |
| 橡皮 Ctrl+滚轮／Ctrl+Alt+移动，局部路径 | mean 3.530／2.512ms；布局与 chrome 重绘次数为 0 |
| 平移，reuse=1 | mean 2.007ms；像素对照通过 |
| 256 图层 × 1000 帧，256000 slots | 仅 4 个池化行／4 行可见容量；scroll mean 5.081ms |
| 大时间轴一次替换／追加 16384 个选择项 | 25.630ms；仍是后续改进目标，不能宣称所有大选择已无卡顿 |

原始计数在 `build/test-tmp/{brush-preview,wheel,modifier-brush,drawing-pan,large-timeline}-performance.txt`。这些是固定夹具的平均时间，不是输入到呈现的 p95/p99，也没有同机 Aseprite 对照。

最终领域回归共 18 项通过：`raster-snapshot`、`document-snapshot`、`selection-boundary`、`image-resize-task`、`sprite-sheet`、`cel-thumbnail-pipeline`、`cel-selection-clipboard`、`animation-crossfade`、`animation-transform`、`document-raster-history`、`editor-recovery`、`layer-panel-tree`、`document-layer-group-structure`、`linked-layers`、`attached-masks`、`tilemap-document`、`outline-document`、`lua-script-invocation`。

首轮为 17/18；修正下述越界夹具的 API 选择后，仅重建／重跑 `cel-selection-clipboard`，单项通过，没有重跑已通过的其他领域检查。连同上面的 10 项 UI／性能检查，最终为 28 项定向检查通过；未运行整个仓库的全部测试。

领域回归首次运行时，`cel-selection-clipboard` 的两处越界夹具使用了默认会限制边界的 `nudgeSelectionContent`，却断言允许越界。实施前 HEAD 的该函数也明确包含相同的 clamp；旧版 `workspace-commands-selection-move.ts` 默认 `allowOutsideCanvas=false`，`workspace-selection-nudge.test.ts` 的越界用例显式传 true。本轮没有改变键盘移动语义：将这两处夹具改为已有 `beginSelectionContentMove` 的自由变换入口，保留原像素、storage identity、历史与 Undo/Redo 断言，并增加键盘移动被 clamp 到 `(318,0)` 的检查。

源码检查：`check-editor-boundaries.py` 通过，`check-legacy-provenance.py` 覆盖 838 个文件并验证来源快照，`git diff --check` 通过。`--strict` 仍返回 1，符合已登记迁移缺口尚未完成的实际状态。

## 后续实施顺序

1. F01／F02：受控 Cel 插入事务、局部 raster 和 lookup、目标蒙版差量历史，先验证链接拓扑及取消／失败回滚。
2. F03／F06／F10：冻结源资源后的分阶段捕获、可让出的元数据构造与缩略图渲染，避免 UI 单任务长循环。
3. F07／F08：复用依赖计划和内容 tile，减少笔刷预览、样式、分组和拖动画布的重复合成。
4. F09／F11／F12／F13：面板域同步、时钟追帧、脚本结果分段接收和共享维护预算。

这些剩余项仍可能造成大工程首次落笔、抬笔、录制开启和复杂样式场景卡顿。
本轮没有取得全链路输入到呈现的 p95/p99 或同机 Aseprite 对照，因此不以源码复杂度和局部测试替代实际手感验收。

## 来源与工作区

直接依据旧版 `selection-boundary.ts`、`canvas-selection-renderer.ts`、`LayersPanel.tsx`、`layer-timeline-thumbnails.tsx`、`project-save-transfer.ts`、`recovery-service.ts` 和 `sprite-sheet.ts`。
已核对旧版 LICENSE 第 2(b)/(c) 的源码修改与内部构建／测试许可。沿用既有 Aseprite/laf shader 调用，没有新增复制 Aseprite app 业务实现。
来源与适配差异已登记在 `legacy-provenance.json`，覆盖通过不表示全部迁移语义已完成。

本任务保留扩展、frame capture、lifecycle、editor support 和边界检查脚本的既有其他任务差异。
不创建分支／外部工作树，不自动提交或打包，不删除运行缓存和用户数据。

## 全量问题状态（后续笔画批次实施中）

用户要求是全部修复 F01～F13。当前没有任何依据可以宣告整个审计已完成；第一批的28项定向检查也不覆盖后续新改动。

| 审计项 | 当前状态 | 尚未通过的完整验收 |
| --- | --- | --- |
| F01 普通笔画 | 新增按触及64×64页分配的首改索引；空Cel提交改为索引插入和链接绑定回滚，待本批回归 | raster仍可能整画布准备；大工程端到端输入／抬笔p95、p99 |
| F02 蒙版 | 笔画和魔术橡皮改为canonical目标蒙版的像素差量与几何历史，待本批回归 | 填充、形状和其他raster事务尚未统一迁移；多蒙版真实工程测量 |
| F03 录制捕获 | 待实施 | 提交栈同步准备改为可让出／冻结来源任务 |
| F04 时间轴 | 第一批部分完成 | 跨事件结构版本缓存、剩余蒙版查询及大选择路径 |
| F05 蚂蚁线 | 第一批部分完成 | 持久文档空间索引、碎片选区可让出冷建、多视口 |
| F06 保存／恢复快照 | 第一批部分完成 | 元数据构造、验证与分配也受完整预算约束 |
| F07 笔刷预览 | 待继续实施 | 轮廓／几何复用、可见tile合成、特殊尺寸入口 |
| F08 样式与合成 | 待实施 | 依赖脏区与效果扩张、有限tile结果缓存、像素oracle |
| F09 刷新和精灵表 | 第一批部分完成 | 面板域同步、首次精灵表可让出准备 |
| F10 缩略图 | 总缓存限额已完成，任务拆分待实施 | 单个任务可让出，外部持有图像计账 |
| F11 动画播放 | 待实施 | 时钟跳帧／追赶与成品帧复用 |
| F12 脚本结果接收 | 待实施 | 解析、typed计划和原子应用的完整预算 |
| F13 资源治理 | 待实施 | 共享UI维护预算、worker准入、全部缓存总账 |

### 后续笔画批次的实现边界

`StrokePixelLookup`只在首次改变某页像素时分配4096个int，读取和负值回滚不分配页面。8192²画布的索引目录为128KiB，触及单页的payload为16KiB；原dense索引的payload为256MiB。这里比较的是索引内存，不是整个文档内存，也不是绘制帧耗时。

空Cel提交复用已有`Timeline::addCel`，保留新Cel优先的链接内容归一逻辑。链接归一过程中仅暂存geometry与显式shared storage binding用于同一同步事务的失败回滚，不全局改变LinkedPixelStorage的深拷贝语义，也不将这些可变引用交给worker。提交前失败移除新索引／slot并恢复绑定；历史已经发布后observer抛异常时保留已经提交的状态，并清理笔画。

蒙版笔画不再捕获beforeMasks/afterMasks集合。历史仅保留canonical mask ID、前后几何、canvas地址宽度及真实变化的before/after像素。确需扩展时移动保存原surface以供取消／无变化提交恢复；成功历史不持有原surface像素副本。几何变化的Undo/Redo先离线准备目标存储和交集，再写入差量并安装；未受影响蒙版的对象、像素绑定及链接保持原状。填充／形状／结构蒙版事务仍保留原路径，不能据此把F02整个问题标记完成。

新增检查涵盖dense索引oracle、lazy分配、copy/move/reset、取消／无变化、linked mask、移动后mask几何、历史字节、独立存储identity，以及历史observer在提交后抛异常。执行结果按下文实际范围记录；本任务尚未验证包含后续批次的正式exe，正式产物也可能由同目录另一任务更新，第一批旧hash不能用来证明当前工作区exe已包含本批修改。


### 后续批次实际检查状态

- `stroke-pixel-lookup-tests` 已完成Release构建并运行通过：150000次dense oracle比较、lazy分配上限、复制隔离、move／reset和负值rollback。
- `check-editor-boundaries.py` 通过；`check-legacy-provenance.py`覆盖842个文件并验证来源快照；`git diff --check`通过。迁移缺口仍存在，覆盖通过不代表严格迁移完成。
- 领域回归构建已启动并推进至moon-core代码生成，但发现另一任务同时在同目录构建`extension-request-host-tests`／`moonsprite-native`。遵循用户此前“本任务等待，另一任务先完成”的要求，仅终止本任务cmake进程41916及其编译子进程，没有关闭或终止另一任务。
- 本批`document-raster-history`、`attached-masks`、`tilemap-document`、`brush-dynamics`等仍待另一任务构建结束后串行构建和运行；不能借用第一批结果把这批新代码标记验证通过。正式程序本批运行验收尚未完成。
