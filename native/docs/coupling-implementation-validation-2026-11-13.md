# 耦合优化实施与验收（2026-11-13）

最新状态：已关闭9/10（C01/C02/C03/C04/C06/C07/C08/C09/C10），剩余C05。最终正式Release、同版13/13 GUI、12/12相关服务、边界和917项来源覆盖通过；最新交付证据见文末。C05旧恢复提交未知根因及逐格式故障矩阵未决项继续保留。

## 交付范围

承接原审计C01—C10，不增加新的产品行为或UI布局。唯一正式产物仍是 `build/Release/moonsprite-native.exe`。本报告区分源码实现、服务/领域运行、正式GUI运行与尚未关闭的问题。

## 本批实现

| 问题 | 已落实的修改 | 保留的行为 |
| --- | --- | --- |
| C02 会话选择 | Document提供完整动画选择值快照；组格/蒙版格和锚点按原弱owner恢复。结构操作显式归一化；历史scope只对真正新增push附加前后值，裁剪历史不误附快照。去重/有效性查询改用结构化哈希 | 首次出现顺序、锚点、内容修订与会话身份不变，普通refresh不承担选择清理 |
| C07 历史事务 | 父结构/资源、叶元数据和触及字节先准备再发布；组合失败逆序补偿。terminal拒绝类型/整数范围/载荷边界错误。builder先准备父载荷、容量和费用，才无异常移动原条目 | undo逆序、redo正序、透明RGB、共享存储身份、选择焦点、资源及历史计量；不引入工程编解码回滚 |
| C05 保存边界 | 接纳前准备路径/名称；保存接纳、恢复清理和最近记录分开。清理派发拒绝保留旧future/快照/身份及关闭门禁；前驱自动恢复失败仍执行已保存文件的恢复清理，错误分别报告 | 正式异步编码、原子写入、格式/source-only/exact策略、显式重试和用户恢复数据 |
| C04/C09 预览服务 | 沿用本轮之前已写入的有类型owner/预览事务会话及受控执行器夹具，本批编译运行验证 | 现有领域capture/publish验证与16ms阶段顺序，GUI/CLI入口 |

统一编译发现MSVC的unordered_map移动可能分配，已将不可变脚本几何历史改用只读快照持有，保留HistoryStore的无异常移动断言。运行测试发现首次分组命令在pushEdit之前尚无after选择，已在首次apply期间暂存before，避免将未完成命令误当损坏历史；正式历史仍强制检查成对载荷。

## 已执行检查

- 11项服务/领域检查通过：history-store、document-raster-history、document-animation-binding、editor-recovery、saved-recovery-cleanup、save-task、aseprite-save-policy、filter-preview-controllers、preview-task、task-stage-profile、playback-session。
- Editor与架构边界2项通过；公共头编译通过。正负边界夹具本批没有重跑，不计入上述数量。
- 来源覆盖912文件及证据快照通过；既有legacy-partial保持，覆盖通过不代表行为等价。差异格式检查通过。
- 本批完整栅格历史测试的先前失败日志保留。夹具修正包括：使用commitSelection创建历史、用实际整数属性验证整数溢出、创建可见像素后再创建蒙版。没有为通过夹具改变这些既有行为。

正式程序已完成构建；本批最终GUI结果见文末。当前不把源码完成或服务通过换算为审计项完成。

## 未完成的验收边界

- C05的旧跨进程 `Cannot commit recovery` 尚无可复现根因；新通过和新错误码诊断不能证明旧失败已修复。各格式编码/临时创建/flush/磁盘满仍未逐一注入。
- C04调度职责的进一步拆分仍须有实际依赖及测量依据；只增加阶段诊断不代表完成。
- C02/C07/C09本批新增实现须结合正式程序回归及原清单逐项核对后才能关闭；未新增人工图像验收或性能提升结论。

## 证据

`build/test-tmp/coupling-final-save-recovery.log`、`coupling-final-service-subset.log`、`coupling-final-history-selection.log`（该次历史尚失败，仅选择通过）、`coupling-final-raster-mask-test.log`（修正后完整历史通过）、`coupling-final-boundaries.log`、`coupling-final-provenance.log`。具体失败与剩余验收保留在 `coupling-remaining-acceptance.md`、`save-lifecycle-failure-matrix.md`。


## 正式GUI发现的帧粘贴边界

第一轮GUI前6项通过，attached-masks拒绝：帧粘贴undo错误复活原蒙版选择。核对legacy `workspace-commands-animation-frame-clipboard.ts` 后确认，跨工程paste及同工程paste/duplicateAt直接推入专用undo/redo条目，没有完整选择历史包装；moveSelectedAnimationFrames才使用该包装。已移除帧粘贴/复制帧外围的通用scope，并阻止结构提交为该命令附加完整选择快照；原专用清理语义继续生效，未修改GUI预期。新增原Document+弱会话owner回归。修复后完整栅格历史及动画选择2/2通过，见 `coupling-final-frame-contract-tests.log`。正式程序增量构建和同版GUI复查待记录。


## 当前正式程序回归记录

`build/test-tmp/coupling-final-gui-20261113-111845/results.json`：同版16项中13项通过。通过cel-clipboard、attached-masks、anti-alias、convolution、gradient-map、filter-presets、group-timeline、mask-selection-clipboard、extension-workspace、multi-document、native-save、aseprite-save、history-panel；layer-move、animation、script-entry失败，不能登记整批通过。

Cel剪切失败经实读legacy `workspace-commands-animation-cel-properties.ts::deleteSelectedAnimationItems`确认：清除Cel选择后保存原像素历史，undo不恢复已清除选择。已移除Editor删除/手势入口及Document帧粘贴/Cel删除外围的通用完整选择scope，仅为legacy明确包装的moveSelectedAnimationFrames保留领域scope。新增Document帧粘贴与Cel剪切契约，完整raster-history/animation-binding 2/2通过，见 `coupling-final-cel-contract-tests.log`；cel-clipboard与attached-masks正式GUI通过，未改原断言。

定向诊断 `coupling-final-gui-20261113-112255/results.json` 及 `canvas-ownership-diagnostic.txt` 证明前两个失败的合成点击被浮动PreviewPanel覆盖，canvasOwnsPointer正确拒绝；测试应明确无遮挡前置。现仅修改fixture的preview可见性并增加图像笔刷点击前归属断言，不放宽生产输入命中；正在编译复查。script-entry保留样式剪贴板失败，新增诊断，尚未确认根因。临时生产诊断已移除。整体已验收仍为5/10。


## 本批最终复查

- 正式Release构建通过；`coupling-implicit-selection-verified-build.log`。前一条命令误用不存在的测试target名，失败记录留在`coupling-implicit-selection-build.log`，之后使用CMake实际target重新构建成功，不以失败日志声称通过。
- 同一版正式程序16/16 GUI退出0，含图层移动、完整animation、script-entry、两类保存、多工程及上述全部场景；证据：`build/test-tmp/coupling-final-gui-20261113-113220/results.json`，运行期间程序SHA保持不变。之前所有失败记录保留。
- 完整document-raster-history、document-animation-binding 2/2通过：`coupling-implicit-selection-domain-tests.log`。其余9项服务本批此前通过，本次选择修改后没有重复运行这些无关服务，不写成新一轮全套通过。
- 新发现并修复的生产问题：legacy用selectedLayerIds与layerSelectionExplicit共同表示隐式/显式选择；native用activeLayerId加空timelineSelection.layers表示隐式目标。通用归一化错误合成显式行，既破坏新建图层原断言，也让脚本切换活动层后的原生样式粘贴沿用旧选择。现在保持空显式行，保留有效性过滤和专用帧删除协议；新增领域回归覆盖活动切换、样式目标、undo/redo和显式选择保留。没有修改旧GUI预期。两个遮挡场景仅修正测试前置，生产输入规则未放宽。
- 来源覆盖912文件和证据快照通过；git diff --check通过。578个程序输入冻结前后无漂移：`coupling-current-program-inputs.json`。正式程序SHA-256：`b536d6f58e0fe0e048539bb017043daae0ddd1083eb081022c37243e95437378`。

本批自动检查通过不等于十项审计全部关闭。正式已关闭仍是C01/C03/C06/C08/C10共5/10；C02/C04/C05/C07/C09保持开放，原剩余验收条件继续有效。没有新增人工图像验收或性能提升证明，未定位旧跨进程恢复提交故障，未完成各格式全部故障注入。后续必须按剩余清单逐项给出完成证据，不再把新增测试数量当作项目完成度。


## 后续大步：轮询编排与提交边界（源码完成，待统一验证）

完成18阶段轮询不可变编排服务与六组领域边界；计时器不再直接拥有业务顺序。完成工程/图片/恢复共享原子文件协议及Windows适配，保留工程验证和备份、恢复目录锁和pending/CRC协议。新增窄后端故障检查及有序轮询/失败后继续检查。没有增加Editor公共测试字段、定时器或生产重试。

当前尚未编译和运行本大步；前文16/16和程序SHA只对应此前版本，不作为当前源码验收。已验收数字暂保持5/10，后续同一批统一构建、相关服务及必要正式入口验收后再更新；C05旧失败不因结构收口而关闭。


## 轮询与提交边界：本大步验收结果

正式程序及公共头、所列相关目标一次集中构建退出0：`build/test-tmp/coupling-boundaries-batch-build.log`。14/14相关服务/边界通过：atomic-write、task-stage-profile、editor-recovery、saved-recovery-cleanup、image-export、image-save、project-save、project-save-raster-resources、save-task、aseprite-save-policy及四项架构/正负夹具，见`coupling-boundaries-batch-tests.log`。

同版7/7正式场景通过：AA、卷积、渐变映射、多文档、原生保存、ASE保存、保存格式失败专项。最后一项实际43/43提交拒绝/解锁后显式重试，包含前台、后台、关闭续接与source-only；完成记录在`build/Release/native-save-ui-owned/37772-130038750/format-failure-stages.txt`。GUI身份与结果在`coupling-boundaries-batch-gui-20261113-115307`。程序SHA-256：`5c9fcda6dd83badbd59881fa9e4c1bff879897101fcc3f32554921387ba37252`。

18个原工作/pending函数体与顺序逐项保持，证明在`coupling-poll-source-proof.json`。7份运行TSV中4份采到111个周期，各周期18阶段计数相同、预算16ms；其余3个同步滤镜场景在主计时器运行前结束，明确为0周期，不能计作运行采样。记录在`coupling-boundaries-batch-stage-proof.json`。没有据此声称性能提升。

C04按原始六步及完成条件收口：有类型控制器/共同任务机制/weak原owner和预览编号/不可丢弃Apply意图/观测后按现有依赖分组的轮询编排/所属会话一次结束。此前受控执行器的切换、乱序、异常、销毁和单步Apply通过证据继续有效；本批核对preview_task、filter_preview_controllers及Document源码与该已验收版本哈希一致。新增服务验证周期异常不改变后续阶段中止语义且下一周期继续；正式保存与预览入口验证实际接线。

来源覆盖917项、来源快照及diff格式检查通过；917个源/测试/脚本输入构建及运行前后无漂移。没有新增人工图像验收。**C04关闭，总体6/10**（C01/C03/C04/C06/C08/C10）；C02/C05/C07/C09继续开放。C05的共享原子故障检查补齐底层错误边界，不等于逐格式编码器/系统满盘全部注入，且不定位旧child9436。

定向复核另确认C02尚有实质结构缺口：ProjectSession.tools仍为可选快照，Editor::saveToolSession/restoreToolSession在切换中逐字段搬运，配置字段仍存Editor。不能把命名快照或通过A/B回归算成直接会话所有权；下一大步须消除此副本和手工搬运，保留命名工具预设的显式值快照能力。


## 工具直接归属与历史收尾（当前批次）

C02：ProjectSession.tools改为直接值；移除Editor工具配置成员及58项capture/restore协议。pencil/eraser配置数组、图像笔刷原像素、临时捕获/返回配置/活动状态均只由所属会话拥有。切换只选择owner，不复制、退出旧会话临时笔刷或按文件路径重载。保留原新建/偏好默认、命名预设格式和正常图像笔刷角色重映射；临时资源跳过此前被临时快照覆盖的重映射。ShapeSpec/GradientSpec保留为手势及任务输入，在算法派发时取当前会话标量，无额外路径/像素复制。

新增正式extension-workspace检查覆盖store前直接地址、不同会话隔离、非活动配置修改不被恢复覆盖、临时笔刷像素切换往返。34个其他调用单元反向替换后与修改前文本完全一致；8个声明/会话/任务派发/共享颜色/集成检查文件逐项核对。31个Editor边界正反例、生产Editor边界、架构边界及917项来源覆盖通过。证据：coupling-direct-tools-source-proof.json、coupling-direct-tools-substitution-proof.json。正式Release仍在编译，尚不登记C02完成。

C07当前全部原剩余条件已对照实际源码及现有完整回归收口，详见history-edit-contract.md末节；98个相关输入没有变化，本次10/10服务测试通过，覆盖完整栅格历史、动画绑定、历史存储/命令、本地历史hydration/committed及预览/保存/播放服务。证据：coupling-direct-tools-service-tests.log。C07关闭，当前已验收7/10；C05/C09仍按剩余清单开放。


### C09 原验收条件映射（等待本批同版 GUI 完成）

| 原条件 | 当前实现/检查 |
| --- | --- |
| 服务行为不创建工作区 | preview-task、filter-preview-controllers、save-task、playback-session、history-commands、history-store等独立tests可执行程序；本批上述相关10项测试退出0 |
| 预览私有状态不牵动无关夹具 | preview_task.h、filter_preview_controllers.h、wand_preview_controller.h内封装generation/owner/token/Apply意图；保存夹具消费SaveTask与保存入口，没有依赖这些预览内部字段 |
| 窄注入及正式异步保持 | 预览controlled executor、保存launcher/chooser、task轮询观测分别位于服务契约；native-save设置asyncSaveForSmoke_=true，明确进入savePath正式异步分支，smoke不绕过该生命周期 |
| CLI/UI能力保留 | main.cpp::EditorCheck以有类型成员函数表分离普通诊断查找与执行；复杂多步检查保留原timer及--*-check；既有真实输入/绘制验收保留 |
| 数据在测试自有路径 | 现有服务使用build/test-tmp自有目录；本批GUI进程设置独立LOCALAPPDATA并保留输出和错误日志；正式产物路径不变 |

本项关闭须等待本批正式预览、会话和保存GUI退出码；不以服务通过替代UI接线。本项针对测试耦合和入口接线，不意味着已找出C05旧日志缺失的Windows错误码，也不把受控提交失败解释为真实磁盘满或逐编码器故障。


## 最终交付：9/10，C05 保留未决（本节替代以上本批“等待”状态）

正式Release最终构建退出0：build/test-tmp/coupling-direct-tools-fixture-build.log。此前第一次构建发现共享颜色仍引用已退役的temporaryBrush槽，已接到会话唯一资源，并保留原临时资源重映射时机；失败日志coupling-direct-tools-build.log保留。修正后的正式构建coupling-direct-tools-build-fixed.log也退出0。

首次GUI中两个画布工具夹具失败：默认悬浮PreviewPanel遮挡合成指针；现在与原集成画布夹具一样明确关闭该面板，刷子悬停另断言canvasOwnsPointer。原像素/历史/dirty/缓存断言及生产命中规则未改。首次误用了未登记的--brush-dynamics-check及--liquify-check，属于普通启动，超时和退出0均不计测试证据；已改用实际--tool-dynamics-only，液化/动态生产算法则使用实际独立服务测试。首次记录保留在coupling-direct-tools-gui-20261113-122313。

最终同一正式程序13/13通过：AA、卷积、渐变映射、extension-workspace、多文档、tool-rail、gradient-shape、完整animation、brush-preview、shortcuts、真实动态参数draft、native-save、aseprite-save。包括会话store前直接所有权、非活动配置写入、临时笔刷原像素往返、预设/参数、输入预览和正式异步保存。结果目录：build/test-tmp/coupling-direct-tools-gui-20261113-123110；程序SHA-256：7f4dcc721e50504ea4f1f5e707f6eab713d32521c01929a61edeb45d40d8584d。

服务10/10（完整栅格历史、动画绑定、HistoryStore/commands、本地历史committed/hydration、preview/filter/save/playback）及液化/动态2/2通过：coupling-direct-tools-service-tests.log、coupling-direct-tools-brush-services.log。Editor边界31个正反例、生产Editor边界、架构边界和917项来源覆盖通过；git diff --check通过。34个工具调用单元仅替换访问表达式，8个特别改动文件已核对，98个历史相关输入保持；917个最终源码/测试/脚本输入运行前后无漂移，见coupling-direct-tools-substitution-proof.json和coupling-direct-tools-final-consistency.json。未新增人工图像验收，不宣称性能提升。

C02按原条件关闭：会话直接拥有工具/临时资源，无Editor工作副本和逐字段capture/restore；既有稳定文档、view、recovery、选择投影/历史与重排/后台行为证据继续有效，新GUI验证直接地址、非活动修改及临时像素。C07关闭依据见history-edit-contract.md末节。C09按上表原条件关闭：服务可独立验证，窄注入、正式异步和CLI/UI入口保留；本批已补齐其会话、模态及保存接线验收。C09关闭不等于C05故障根因已知。

**剩余仅C05。** 共享原子协议、Windows原码/阶段/路径/pid诊断、受控写入失败、真实锁拒绝、显式重试及保存/恢复保护已实现并有既有证据；旧child9436仅记“Cannot commit recovery”，缺少当时Windows码/路径/句柄owner，当前不能还原根因。逐格式编码器故障和真实系统磁盘满也不能由共享写入故障注入推断覆盖。继续保留save-lifecycle-failure-matrix.md中的这些缺口，不盲重试、不删除恢复数据，不以之后通过宣称旧故障修复。已登记legacy-partial及strict失败要求保持。


## 最新 C05 保存边界验收（2026-11-13，本节替代本批待验证状态）

整体仍为9/10，C05部分完成，未将历史未知失败算作已修复。保存worker已从Editor提取至`src/captured_save.h`：只消费DocumentSnapshot、冻结的保存请求与录制读取器，返回结果；活动Document接纳、恢复清理及关闭续接仍由协调层负责。沿用既有编码、原子写入及portable录制逻辑，没有增加生产自动重试。

正式Release构建成功，日志`build/test-tmp/coupling-c05-build.log`。唯一正式程序SHA-256：`8f4d194752a00cff08211e64fb704d01e488d60b7172a457f5bdde0e508ddd2b`。919个冻结源码/测试/脚本输入无漂移，GUI期间程序哈希一致，证据`build/test-tmp/coupling-c05-final-consistency.json`。

- 独立captured-save：256个失败/显式重试场景通过，覆盖原生及10个图片格式、前后台与source-only、编码/创建/写入/磁盘满错误码/短写/flush/替换及原生验证/备份拒绝。检查旧目标、实时文档像素/历史/修订/dirty/路径/归档身份、恢复保护及临时文件/句柄所有权，显式成功重试使用真实默认操作。此处文件系统故障属于受控操作注入；原生编码使用真实编码器限制，图片异常注入不能替代真实逐格式编码器验收。日志`coupling-c05-captured-save-detail.log`。
- 正式GUI真实编码器拒绝：10个图片格式各4类上下文，共40场景通过。使用1025×17画布与6400%缩放，触发真实编码尺寸/预算校验；保留旧目标、恢复数据、dirty、身份和关闭意图；改为100%后显式重试成功，后台A不激活且B保持。未使用编码或持久化mock。
- 同版43个真实Windows文件锁提交拒绝/重试、完整native-save及aseprite-save全部退出0。完成trace分别为40和43，日志和trace副本在`build/test-tmp/coupling-c05-gui-20261113-125357`。
- image-save、project-save、editor-recovery、saved-recovery-cleanup、atomic-write、save-task共6/6通过，日志`build/test-tmp/coupling-c05-services.log`。来源覆盖、架构边界与diff检查结果另存`coupling-c05-provenance.log`、`coupling-c05-architecture.log`及`coupling-c05-diff.log`。本批没有新增人工图像或性能验收。

尚未闭环：旧child9436只有22字节`Cannot commit recovery`，当时Windows码、操作阶段、路径及句柄owner未记录，无法从后续成功运行还原根因。未改动legacy的原子写入探针也曾出现os error 5，只证明跨实现出现过拒绝，不证明旧9436根因。现有错误码/阶段/路径/pid诊断与三阶段锁拒绝检查用于未来失败定位；不得将新测试通过登记成旧失败已修复。真实系统满盘未执行，受控ERROR_DISK_FULL与真实满盘明确区分。已登记的legacy-partial及strict迁移缺口继续有效。
