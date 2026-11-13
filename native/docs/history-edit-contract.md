# Document 历史条目的组合与回放契约

状态：2026-11-13，C07 分阶段实施契约。HistoryStore 已接入生产，九项相关服务测试通过；HistoryStore 接入批次的正式应用构建和 26 项适用 GUI 通过；平铺检查经诊断和夹具修正后，geometry 与十二个文字组已实际通过（审计 10.17，结果绑定该批程序）。分域载荷／回放的已验收范围见第7—12节；终结条目封闭表示已完成第15节验收，普通组合条目的构造／校验边界仍未完成，后续会话视图改造的运行验收另行记录。

本文补充 [耦合审计 C07](code-coupling-audit-2026-11-12.md)。Document 继续拥有内容事务、领域校验、回放及通知；历史存储组件只能管理记录、位置、计量、合并和裁剪。

## 1. 依据与已有语义

原生回放入口现为 `src/document_history_apply.cpp::applyEdit`，成本为 `src/document_history_cost.cpp::Edit::bytes`；`src/document.cpp` 保留 `pushEdit`、`groupEdits`、`undo`、`redo`、`setHistoryEntryLimit` 和 `reserveHistoryEntries`。载荷定义在 `src/document.h` 的可组合领域结构及 `Edit`，已验收范围见第7—12节；有类型终结分派已完成第15节验收，普通组合条目的构造／校验边界仍需落实，不能仅凭分域结构宣布C07完成。

Legacy 依据为 `legacy/src/renderer/src/core/history.ts::HistoryStack`、`compoundHistoryEntry` 及 `history.test.ts`。重点沿用以下已存在的输入和预期：

- 默认保留超过 1000 步，并能从有限步数恢复为不限步数。
- 全部撤销后降低步数上限，保留最近的下一次 redo，先裁掉最远的 redo。
- 计量只包括已应用的 undo 条目；undo 减少计量，redo 恢复计量。
- 内存超限仍保留至少一条 undo；条目数量上限另行生效。
- undo 或 redo 的领域回放抛错时，栈位置和计量保持原值。
- 复合条目 redo 正序、undo 逆序；只有实际提交后通知观察者。

原生采用单个按时间排序的 vector 加位置，Legacy 使用 undo/redo 两个数组。这是存储适配，不能改变对外时间顺序、下一步回放、预算和通知语义。

## 2. 独立终结分支

下表保留拆分前的提前返回顺序，供迁移对照。当前 `TerminalHistory` 只保存一种终结类型，由 `applyTerminalHistory` 封闭分派；`monostate` 才进入普通组合回放。有效旧条目原本只构造其中一类，类型化后无需竞争字段优先级，也不执行多类访问者遍历。

| 顺序 | 载荷 | 回放与目标 | 成本与构造证据 |
| --- | --- | --- | --- |
| 1 | `MaskRasterReplay` | `applyMaskRasterHistory`，蒙版 ID 和像素差异 | `document_attached_masks.cpp` 提交此条目；计量沿用现有蒙版载荷公式 |
| 2 | `LocalSnapshotHistory` | 完整 rollback 后恢复历史中的工程名及 dirty | `local_history_hydration.cpp` 预备结构条目；成本为 `rollbackBytes` |
| 3 | `LocalPixelsReplay` | 已有有类型 `PixelHistoryEdit`，先解析、校验全部像素与属性目标再写入 | `document_local_history.cpp`；成本为 `retainedBytes` |
| 4 | `SourcePropertiesHistory` | 恢复对应 before/after 自由瓦片来源快照，并标记全画布变化 | `document_tilemap.cpp::commitFreeTileSourceProperties`；成本沿用两个来源快照的文字与保留 JSON 公式 |
| 5 | `TilemapPixelsReplay` | `applyTilemapPixelHistory`，保留 tilemap、tileset、链接及选择策略 | `document.cpp` 的瓦片绘制、移动与浮动内容提交路径；成本仍走 `TilemapPixelHistory::bytes` |

不能以“有共享指针就互斥”概括全部 Edit。其余条目可合法组合多个可选域；`children` 也不排除父级的选择、资源或焦点元数据。

## 3. 非终结分支的固定执行阶段

| 阶段 | 保留的执行顺序 | 原因与适配边界 |
| --- | --- | --- |
| 资源前置 | tileset slots → 不由结构快照接管的 tile selection → masks 与编辑上下文 → mask selection | 后续内容、图层及选择可能依赖这些资源或目标；蒙版选择 serial 仍在原位置增加 |
| 结构前置 | rollback → slices → layer structure → trim pivot → animation loop → timeline → dimensions | timeline 替换须使用原 `tilesetsForLayerEdit`；dimensions 与 timeline 同时变化时保留全画布损伤 |
| 内容 | 有 children 时 redo 正序、undo 逆序；无 children 时依次 pixel → surface → cel properties → palette → layer → frame → cel | 子条目之间不交换顺序；叶子条目的 pixel 目标仍先按 `targetCelId` 选择相应层和帧 |
| 选择与焦点 | 复合条目显式焦点 → pixel selection → selected frames → timeline selection → frame anchor → mask activate → timeline 显式焦点 | 父级选择与焦点是复合变化的一部分，不能仅回放 children 后立即返回 |
| 投影与 UI 领域状态 | layer opacity projection → mask context → group UI → free tile selection | 这些值在当前领域历史中有明确语义；移出 UI 外壳不等于从历史记录中删除 |
| 来源操作收尾 | 来源增删重排的层/帧焦点 → 原 freePaint 策略 → 来源选择清理 → script geometry → `projectActiveCelOpacities` | 保留原来源操作与当前用户视图的相容规则，最后执行派生透明度投影 |

同一条目中明确存在的组合包括：

- `captureGroupEdit` 同时记录 layer structure、group UI、timeline selection、frame selection、anchor 和层/帧焦点。
- 图层复制/粘贴可同时记录结构、帧和 tileset 资源，不能分为多次独立提交。
- 浮动选区提交可同时记录像素或 surface 变化、选区、原始剪贴板和恢复预算。
- 脚本组合条目含 children，父级另恢复标签和选择；取消／异常不能留下中途新历史。
- 本地历史快照和普通工程 rollback 的工程根字段语义不同，必须保留显式标志和恢复顺序。

## 4. 成本计量的兼容约束

当前成本是 Legacy 兼容预算，不是 C++ 堆占用精确测量。提取成本函数时，不以 `sizeof(Edit)`、vector capacity 或某种“更精确”总和替代现有公式。

`Edit::bytes` 的提前返回优先级为：local history pixels → source properties → local snapshot（成本为0也返回）→ 普通 rollback → cel properties → layer metadata → 专用 palette kinds。其余通用成本依次累加文字、时长、slice/调色板元数据、瓦片、恢复剪贴板、像素、蒙版、timeline、选择、surface、children、loop/frame、script geometry、layer/group UI 结构及 tileset slots。

保留下列细节：

- palette rename 使用 UTF-16 单元数，非 BMP 字符算两个单元。
- mask raster 当前用差异数组 capacity，普通像素/资源有各自既定计量规则。
- `layerMetadataBytes` 和 `rollbackBytes` 是已经预备的专用成本，不再叠加通用结构成本。
- redo 不计入 `historyBytes`；调低条目上限时，先裁最旧 undo，再裁最远 redo。
- 复合提交先移除被合并记录的成本，再计算复合记录；不能把 children 计两次。

## 5. 存储与领域的接口边界

已接入的 `HistoryStore<Entry>` 只接受原生条目和领域回放函数：

- 只读查询：size、position、bytes、limit、entries、latest。
- 容量：沿用现有摊销增长、长度溢出校验和最少增长 8 条的策略。
- 写入：截断 redo 分支，附加条目，按内存／数量策略裁剪。
- 回放：领域函数成功后才移动位置与计量；领域失败继续向上传播。
- 合并：接收由 Document 构造的复合载荷；存储层不理解 Timeline 或选区。
- 修订末条成本：供现有链接帧、调色板视图和脚本标签适配。
- hydration：仅安装已经预备、位置合法、成本已检查的时间线；不调用 push、不回放、不产生内容操作或录制。

原生 undo/redo 的发布阶段是可观察协议：先完成领域应用，再移动 position、增加 historyRevision、按原位置恢复 floating 并 publishChange，最后增减 undo bytes、更新 state／dirty／工程计数／revision 并通知历史与录制。存储层分别接受 apply 与 publication hook，保留这一顺序；不能将 position 和 bytes 一起提前到发布之前。apply 抛错不移动位置，publication hook 的异常不承诺原代码没有的强回滚。

push 也先存储再做 Document 的原有状态更新，之后才 enforceLimits；palette view 字段不计入条目成本，使用不重新计量的 annotateLatestApplied，且有 redo 时仍指向 position−1。普通 setLimit 保留有限值 1—10000 规范化；预备 hydration 限额保持原值，不借存储安装改变恢复策略。

`historyRevision`、dirty、state/nextState、selection serial、`publishChange`、`projectInformation` 和录制通知继续由 Document 管理。不能将存储层的成功当作整个文档事务的成功，也不能给外部任意修改 `Timeline::state_` 的接口。

## 6. 当前证据与后续验收

已完成 Legacy 栈及原生 apply/cost 的上述源码对照；验证目录中的存储候选通过独立 C++17 编译和契约测试，覆盖预算、下一步 redo、分支截断、组合顺序、回放异常、成本变更和默认超过 1000 步。这是接入前的候选证明；随后生产接入和相关服务测试的证据见本节后文，不能倒推候选当时已完成集成。

后续 v2 候选补齐受控 hydration：先检查位置和已应用成本溢出、预备完整安装载荷，再通过无分配交换安装，不调用 push／回放／通知；原有预备上限不会被静默裁到 10000，redo 也不进入已应用成本。另增加“有 redo 时修订最近已应用条目”的接口，区别于修订 vector 最后一条。新增合法安装、拒绝越界／溢出前保持旧栈、下一 redo、保留预备上限及两种末条位置的测试，连同原候选契约均以 MSVC C++17 编译运行退出 0，证据为 `build/test-tmp/coupling-history-store-v2-candidate-test.log`。这仍属于生产接入前证明。

生产接入已完成：原有 vector／position／bytes／limits 改由 HistoryStore 管理，Document 仍为领域回放与事务唯一所有者。九项相关服务测试通过：`history-store`、`document-transactions`、`document-raster-history`、`preferences-history`、`local-history-hydration`、`local-history-budget`、`local-history-committed`、`image-resize-task`、`outline-document`。新已提交历史输出经真实 legacy 反向解码／回放通过；证据见审计 10.14 及 `build/test-tmp/coupling-history-store-*.log`、`coupling-history-store-local-results.json`。

存储接入批次的唯一正式应用使用修订后的 `coupling-history-editor-app-fixed-inputs.json` 的 877 项冻结输入构建成功；该批程序实际通过 `history-panel`、原生／ASE 保存、多文档、脚本、绘制／描边／缩放／蒙版等 26 项 GUI，记录为 `coupling-history-editor-final-gui/results.json`。历史与预览两张正常图像已实际查看。新增平铺综合测试在 90 秒预算内未结束，超时收尾采集到文字创建位置／历史断言；原失败保留，不能混入通过分母。详细版本、原始失败和证据见审计 10.16。

后续阶段追踪证明原综合在 90 秒关闭时仍运行真实文字弹窗；分组后受控保存字号确认冷启动创建 10px、暖启动创建 18px 的产品缺陷，已按 legacy 初始化顺序修复。字号修复版 `a06e15b7d49a858a366d3ec3d49c391ed501f5d8af7d2095b20b218669a8fd96` 的 878 项输入无漂移，独立 text-1 在全新配置下 40.16 秒退出 0，保留原主／副本像素、放置、历史及 Undo/Redo 断言。另一全新配置中的 geometry 曾在浮动选区指针入口失败、无超时，脚本按规则停止。原始证据分别在 `coupling-cold-text-confirm-gui`、`coupling-cold-text-remaining-gui` 保留。

新增运行诊断随后确认 fixture 点击同时命中内容与默认可见轴心，产品按原优先级进入轴心拖动。仅将内容拖动 fixture 的轴心显示明确关闭，不改产品命中、轴心行为或原断言。修订正式程序 `07380c44688dd731d1d29e9ab334fb7d1143e026096ed437f9489e921ad54ab1` 的 878 项输入无漂移，geometry 及 text-0…11 共十三组全部退出 0、无超时或新错误，共 24 次真实弹窗。证据为 `coupling-tile-gesture-fixture-gui`、`coupling-tile-gesture-text-gui` 及 `coupling-tile-gesture-matrix-summary.json`。这关闭新增平铺检查的诊断待办，不能据此声称 Edit 分域已完成；详细失败、修正与版本见审计 10.17。

Edit 分域载荷、应用与成本的后续拆分仍待实施。像素（包括透明 RGB）、链接、资源、选择、焦点和计量的服务验证与界面运行、图像、长期运行分别记录，不把有限回归解释为所有条目或整个原生迁移已经完成。

## 7. 生产回放阶段拆分（审计 10.33，正式 45 项 GUI 与 14 项服务／架构检查通过）

`document_history_apply.cpp` 现在拥有入口与六个私有阶段，严格按第 2／3 节顺序回放。入口仍持有贯穿整次递归回放的 animation replay guard，原四类终结分支、来源视图捕获及 tilemap 终结分支的位置不变。资源、结构、内容、选择与焦点、派生投影、来源收尾分别有明确方法；仍只由 Document 写领域状态。没有拆成多条历史事务，也没有在 children 后提前返回而丢失父级元数据。

`document_history_cost.cpp` 拥有未改公式的 `Edit::bytes`；Document 的构造、命令、存储位置／计量应用和提交通知仍保留原职责。架构门禁约束八项定义仅出现于专属单元；这不验证公式或行为。完整语句／成本反向字节证明及 15 个架构夹具通过；正式程序 `87f1dac7...` 的 45/45 GUI 与同版重新构建的 14/14 服务／架构检查实际通过，运行前后 887 项输入无漂移。同一正式程序的完整平铺 geometry 与十二个文字组 13/13 全通过，最终输入与原体证明哈希仍无漂移；详细证据见审计 10.33。分域 payload 尚未完成，未据此关闭 C07。

## 8. 帧历史载荷（审计 10.34，本批正式验收完成）

Edit.frameHistory 是可组合的私有值载荷，承接十五项帧顺序／时长／disabled／loop 数据；共享单元格、焦点、选择与 children 继续由父 Edit 表达。帧回放仍与原顺序相同地读取父级上下文，不能把混合事务改成单域互斥记录。

帧域现在接管原 durationBytes、循环保留量和帧条目保留量，Edit::bytes 仅在原位置委托，早返回优先级和价格公式不变。88 处实现访问反向逐字节证明及成本展开证明通过；十三个相关服务目标已重建，17/17 项服务与架构检查通过，888 项输入与原体证明哈希无漂移。正式应用 `aedaa66c...` 已构建成功，45/45 GUI 通过且运行前后输入无漂移；同一正式程序的完整平铺十三组全通过，最终输入、原体证明与程序身份一致，见 `coupling-frame-history-final-consistency.json`。来源覆盖 890 项通过，strict 保留既有迁移缺口；没有新增人工图像验收或性能基准。其他分域 payload 仍待继续处理。

## 9. 图层历史载荷（审计 10.35，本批正式验收完成）

Edit.layerHistory 归集 28 项图层属性／结构／分组 UI／资源／投影字段，允许同时组合 frameHistory 和共享 Cel、焦点、选择、children。applyLayerEdit 原体迁至图层历史单元；结构回放仍在 document_layer_groups.cpp，原先检查完整链接和活动上下文之后才交换 surface 的顺序不变。

六项成本在父级原位置委托；metadata override 和 structureCelBytes 保持原优先级与原位置。296 处访问反向字节证明、字符串常量核对及成本展开证明已通过。首批 11 项服务与架构检查已实际通过，889 项输入及原体证明哈希无漂移；随后剩余十四项服务也实际通过，两组共 25/25，输入与原体证明仍无漂移，见 coupling-layer-history-service-consistency.json。正式应用 `71b4589c...` 构建成功并通过 47/47 GUI（含图层显示／菜单新增专项），程序身份与冻结输入／原体证明一致，见 coupling-layer-history-after-gui-consistency.json。同一正式程序的完整平铺十三组全通过，最终输入、原体证明和程序身份一致，见 coupling-layer-history-final-consistency.json。来源覆盖 891 项通过，strict 保留既有迁移缺口；未新增人工图像验收或性能基准。其他载荷域未完成，不提前关闭 C07；详细证据见审计 10.35。

## 10. 调色板历史载荷（审计 10.39，本批正式验收完成）

PaletteHistory收拢before/afterPalette、before/afterPaletteView、paletteKind和colorId六字段，136处访问改为具名域。原applyPaletteEdit十二类回放分支移至document_history_palette.cpp。exclusiveBytes返回可选成本，保留原调色板早返回分支及其在celProperties／layerMetadata之后的优先级；metadataBytes保留kind12成本；snapshotBytes保留通用完整快照成本。早返回成本为0时也必须返回0，不得将可选值误判为非零值。

父Edit仍持children、像素、焦点、状态、文字和其他领域载荷；颜色替换的父子组合、文字自动补色、瓦片及脚本带调色板的事务不能变成互斥variant。palette view注记仍通过原annotateLatestApplied修改最近已应用记录，不重新计量，也不误改redo末条。

实际核对Legacy workspace-palette.ts的颜色编辑、命名UTF-16计量、角色恢复、布局／删除／替换及workspace-palette-history.test.ts。字段路径及移动函数反向恢复、三个成本调用展开后均与原字节一致，证据coupling-palette-history-source-proof.json。四个新定义加入唯一归属门禁，共25项；门禁补充std::optional<std::size_t>精确返回类型及缺失／错位／重复负例，16项架构夹具通过，四项实际边界CTest通过。源码证明之外，唯一正式程序已构建成功，12项服务及4项架构／边界CTest共16/16通过，16项架构与27项Editor正负夹具通过。同一正式程序18/18适用GUI全部通过，包含调色板编辑／导入／剪贴板／排序、历史、脚本、文字及跨会话轴心。894项冻结输入与源码证明哈希无漂移，来源覆盖896项通过，strict继续退出1保留既有迁移缺口，差异检查通过；最终证据coupling-palette-history-final-consistency.json。


文字工具场景首次及三次诊断运行均在90秒预算被关闭，后续锁定图层断言受Close状态影响。定点trace实际记录1517次正常菜单打开／验证／Escape／关闭，0次未找到菜单，证明截图只是执行中的菜单，不能支持死锁结论。临时就绪等待和trace全部逐字节撤回；原TextToolDialog和editor_text源码与本批前备份相同，保留全部原断言。仅将运行器text-tool预算调整为360秒后，正式场景112.23秒退出0，其余17项仍使用90秒预算。失败证据和被否定的就绪竞态假设均保留。只做诊断截图检查，没有新增整体视觉或性能验收。其他载荷域仍未完成，不据此关闭C07或整体目标。正式程序SHA-256 `96131767f28260f63e29778075fd093e67209187359e32d7ffddfb024489a5a4`。

## 11. 蒙版与像素选区历史载荷（审计 10.40，本批正式验收完成）

MaskHistory归集十项蒙版资源／差异／活动上下文／选择及锚点字段，PixelSelectionHistory归集五项像素选择／裁剪轴心字段；两者与frameHistory、layerHistory、paletteHistory及children可同时存在。父Edit继续拥有共享timeline／尺寸／焦点／事务状态，不拆分为互斥记录。273处字段访问调整，十五个实现单元可逆恢复为本批前原字节。

蒙版资源与其选择仍在资源前置阶段恢复，maskContext仍在透明度投影之后、group UI之前恢复；maskRaster终结分支继续位于applyEdit首位。裁剪轴心仍在结构前置、timeline替换之前恢复，像素选区仍在children之后、帧选择之前恢复。三个成本函数在原Edit::bytes位置委托，保留capacity、双层optional锚点和48+mask大小公式。完整timeline内的蒙版计量继续属于父结构快照，不把共享成本重复计入MaskHistory。

来源已实际核对Legacy蒙版命令、蒙版独立性测试、动画选择历史包装、选区属性及轴心像素对齐测试。该批不新增蒙版／选区语义，也不声称补齐C02的完整选择快照缺口。反向字段替换、父回放与成本展开、头声明精确重建和迁出函数原体已通过字节检查，证据coupling-mask-selection-history-source-proof.json。七项定义新增唯一归属门禁，共32项；16项架构夹具、真实架构与Editor检查通过，来源覆盖898项。896项构建输入冻结；唯一正式程序与22个相关服务目标修订构建退出0，同版48/48项GUI、26/26项服务／边界检查及平铺geometry 1/1全部通过，运行前后输入与源码证明哈希无漂移。首次构建退出1，发现FloatingPaste::beforeMasks的8处同名访问被迁移脚本误替换；已全部恢复原样，核对剩余访问对象均为Edit，并重新冻结输入。原失败日志coupling-mask-selection-history-build.log保留，修订构建与运行证据另记。


最终正式程序SHA-256 `9d5ddcbe020393fac9da24925641e0a3e17db0bca14a8683be853c618fe6eeb2`，UTC `2026-11-12T22:41:33.1877465Z`。文字工具保留原始断言与360秒运行预算，实际119.15秒退出0；平铺geometry 48.24秒通过。蒙版独立性、选择／锚点、结构回放、成本／预算、本地历史、文字、脚本、画布调整及通知等22项服务与4项边界CTest全部通过；四项边界含27个Editor与16个架构正负夹具。来源覆盖898项通过，strict退出1保留既有迁移缺口，差异检查通过，证据coupling-mask-selection-history-final-consistency.json、checks.log、gui及tile-geometry。GUI与部分服务目标编译并行，耗时不作为性能基准；本批没有新增人工图像验收。C07的其他载荷域及C02完整选择快照缺口保持未完成。

## 12. 快照、瓦片资源、切片与内容历史载荷（审计 10.41，本批正式验收完成）

SnapshotHistory、TileResourceHistory、SliceHistory、ContentHistory 归集剩余四域的43字段，29个实现／夹具单元共529处访问改为显式域路径。共享Cel只在父级内容载荷存储一份；Edit的前三个聚合字段、children、焦点和跨域状态继续保留。独立PixelHistoryEdit及FloatingPaste的同名字段不属于本次迁移。

六项回放委托与十五项成本方法保留原执行阶段和成本优先级；可选专用成本即使为0也提前返回。五项原函数迁入对应领域单元，Document仍为唯一事务提交者。编辑与回放共用document_history_storage.h中的唯一工作内存预算实现，预算原体不变，未复制公式。58个历史定义的唯一归属已受架构门禁约束。

原调用方反向字段替换、委托展开、迁出函数原体与头部重建证明见coupling-remaining-history-source-proof.json；另逐个核对21个实际新方法及5个迁移函数，见coupling-remaining-history-helper-proof.json。901项输入已冻结，来源覆盖903项通过。核心库、唯一正式程序和修订后的27个相关服务目标构建退出0；本批同版51/51 GUI、31/31服务／边界及完整平铺13/13组全部通过，没有借用10.40的正式程序验收。

本批只落实剩余载荷、回放与成本边界。C07的终结条目封闭类型分派、builder／validate边界和组合失败前校验仍需按原审计逐项核对，不因字段分组或构建成功关闭C07。

后续校验边界的具体入口已定位：document_text.cpp::commitTextDraft在同一条目中生成textChanges与surfaceChanges；document.cpp的画布调整会组合ownerOffsets与surfaceChanges。当前applySurfaceEdit仍先写textChanges／ownerOffsets，再检查全部surface目标及恢复预算，并准备替换内存。该顺序保持拆分前行为，不能据此宣称失败前校验已完成；后续须先准备完整域内回放计划，再进入写入阶段，并验证预算／目标拒绝时文字、偏移、像素及历史位置均不变。父级资源／结构与children之间的失败边界仍需另外核对，单域修复不能替代复合条目验收。

首次服务构建发现local_history_committed_test.cpp的RasterHistoryFixture漏迁13处原生Edit访问；已仅修改该夹具的字段路径，独立PixelHistoryEdit及全部断言不变，反向还原逐字节通过。原失败服务构建日志与冻结输入保留，修订输入仍为901项；本次修订只涉及测试与来源登记，正式程序输入与SHA不变。修订构建另记services-fixed-build.log，不覆盖首次失败。

最终正式程序SHA-256 `b840802f78d23b701d1f884c94b978d1bd50d6120004d422af1a38c153d3bb7c`，程序UTC见coupling-remaining-history-gui/app.json。文字工具保留360秒预算与原断言，实际118.05秒退出0；平铺geometry 56.23秒，十二个文字组全部通过。27项服务与4项边界CTest全通过，含27个Editor与16个架构正负夹具。来源覆盖903项通过，strict退出1保留既有迁移缺口，差异空白检查退出0；901项修订输入、所有原体证明哈希及GUI／平铺程序身份一致，见coupling-remaining-history-final-consistency.json、checks.log与tile-repeat。首次服务构建失败日志保留，修订日志为services-fixed-build.log。本批GUI／部分平铺与服务编译重叠，不作性能结论；没有新增人工图像验收。C07及整体目标仍未完成。

## 13. 内容载荷回放的准备与写入边界（审计10.42，本批正式验收完成）

第12节记录的失败顺序已由旧产品回放复现：无效surface之前的textChanges被写入，撤销抛错后文字不再等于原值，见coupling-surface-replay-red-test.log。此次采用原生必要适配，在applySurfaceEdit内先准备文字副本、偏移目标、surface副本及焦点字符串，校验全部目标与预算，然后保留原顺序失效缓存，最后以不抛错的交换／赋值写入领域值。文字及surface交换的noexcept由编译期断言约束。Document仍为唯一回放者，不增加独立历史提交或工程编解码快照。

预算函数增加拟恢复偏移的只读投影入口，默认调用仍返回原实时偏移；字节公式、资源去重、蒙版成本、copies限制与异常文字不变。对重复偏移目标取最终值，查找保持线性总工作量；重复文字／surface写入保留原顺序及最终值，surface仍覆盖此前同目标offset。缺失文字目标继续跳过，纯文字及纯偏移仍不额外执行surface预算。预算默认路径反向重建与其他内容回放函数逐字节一致证明见coupling-surface-replay-source-proof.json。

原RasterHistoryFixture新增十项真实undo／redo拒绝场景，包含缺失偏移owner、无效surface、缺失surface owner、恢复总预算及拟恢复坐标溢出；拒绝后检查文字、几何、像素与存储身份、焦点、历史位置／成本、状态版本、dirty和缩略图stamp不变。成功检查包含链接owner、透明RGB、重复目标、临时溢出被最终偏移覆盖、文字缺失目标兼容及纯文字／偏移往返。已有栅格测试主体反向还原逐字节一致。首次夹具编译误用Timeline私有state，另两次夹具失败分别是把副本存储身份当实时身份、替换尺寸与像素数不匹配，均已修正，失败日志保留。最终完整栅格历史测试退出0。

Legacy依据为workspace.test.ts的可编辑文字创建／修改／栅格化／撤销／重做，以及history.ts的领域回放成功后才移动历史位置。901项输入已冻结，来源覆盖903项通过。正式程序与八个相关服务目标构建退出0；同版16/16定向GUI、13/13服务／边界及geometry 1/1通过。本批不承诺缓存失效分配异常的强回滚，也不覆盖applyEdit父级资源／结构、pixels或children跨域事务；这些仍是C07后续条件，不能用本域拒绝测试关闭C07。

最终正式程序SHA-256 `4fed53a9edd995cc67ecc7bfa305f4e613d95125fcc62eb5e0c16bf22b0e5872`，程序时间见coupling-surface-replay-gui/app.json。文字工具保留原断言和360秒预算，实际114.29秒通过；geometry 43.54秒通过。901项输入与源码证明哈希无漂移，GUI／geometry程序身份一致，来源覆盖903项通过、strict退出1保留既有迁移缺口、差异空白检查退出0，证据coupling-surface-replay-final-consistency.json、checks.log、gui和tile-geometry。没有新增人工图像或性能验收。拒绝场景的状态断言未涵盖外层undo／redo在applyEdit前清空的change_损伤累积器，也未涵盖活动手势取消；后续外层失败边界仍需逐项处理，不能把本域准备阶段当作完整事务回滚。C07与整体目标保持未完成。

## 14. 回放失败的损伤边界（审计10.43，本批正式验收完成）

十项拒绝场景扩展到已有待刷新区域，旧undo／redo实际丢失pending damage，见coupling-history-damage-red-test.log。两个入口共用replayHistoryWithDamage，成功回放保留原先从空区域累积的规则；抛错时保留原pending并合并本次已生成损伤，再传播同一异常。合并为常量工作量，64位计算边界，超出PixelRegion可表示范围才回退画布区域。历史位置、预算、发布及通知顺序不变；Document之外不获得Timeline写权限。

除十项原内容拒绝场景外，测试覆盖undo逆序／redo正序复合失败时的损伤，以及成功回放保持1×1局部损伤而不混入旧pending。复合测试允许后续preflight在零写入时提前拒绝，不把暂存的部分回放缺陷固化为产品契约。document.cpp的其余部分反向还原逐字节一致，来源登记903项、冻结输入901项。正式程序和通知目标构建成功；5/5定向GUI与最终7/7服务／边界全部通过，修订复合测试已重新编译并纳入最终CTest；程序身份与冻结输入一致。

本批只保留损伤，不能支持跨域／children原子性已经修复的结论。此前已发生的部分内容写入、手势取消和缓存分配异常仍各自需要处理；第13节的未覆盖项按批次历史保留，损伤部分以本节后续正式结果为准。

最终正式程序SHA-256 `44b370c4f5610cdf59f1ae09a32707776c3cecc38d257349549bb5aa84e2a0b6`，程序时间见coupling-history-damage-gui/app.json。901项输入与源证明哈希无漂移，来源覆盖903项通过，strict退出1保留既有迁移缺口，差异空白检查退出0；正式5项GUI包括选择、蒙版、刷新生命周期、多文档和历史面板，7项CTest包括完整栅格历史、动画与录制通知及四项边界门禁。最终证据coupling-history-damage-final-consistency.json和final-checks.log。没有新增人工图像、平铺或性能验收，不借用前版运行结果。C07及整体目标保持未完成。

## 15. 终结历史载荷的封闭存储与类型分派（审计10.44，本批正式验收完成）

原五类提前返回协议现由TerminalHistory表达：monostate表示普通组合条目，另外五个互斥分支为MaskRasterReplay、LocalSnapshotHistory、LocalPixelsReplay、SourcePropertiesHistory、TilemapPixelsReplay。旧maskRaster、localHistoryPixels、localHistorySnapshot、来源before/after属性及tilemapPixels字段退役。普通SnapshotHistory、其他领域资源、选择、焦点、状态、label和children仍保留在父Edit；前三个聚合字段不变，瓦片回放仍读取原父级选择／焦点元数据。没有把整个Edit所有字段改成巨型variant，也没有每像素多态对象或独立提交栈。

applyTerminalHistory只访问当前类型，缺失指针或不完整的本地快照／来源属性对在领域写入前拒绝；source专用成本也会拒绝缺失快照，避免空指针解引用。普通条目保持六阶段顺序、children的undo逆序／redo正序及原父选择收尾。有效终结条目原来一次只构造一种类别，因此不再需要竞争字段优先级。LocalSnapshotHistory保留原工程名／dirty及共享rollback值，hydration的预备阶段完成全部before/after后才安装；发布时仍携带原rollback标志。CommittedCapture明确拒绝终结条目，原版本匹配、共享捕获和持久化格式不变。

专用成本、mask容量公式、tilemap成本及零成本早返回仍按原位置委托，没有用sizeof(Edit)替代兼容预算。新增夹具覆盖五类切换、普通条目恢复、不可同时保留两种终结载荷、immutable来源快照复制共享、蒙版capacity、来源Unicode成本、瓦片成本、本地快照0成本及name／dirty往返；十项空指针／缺失pair的双向拒绝检查随完整栅格历史测试退出0。已有栅格测试主体逐字节保留。十五个修改文件的显式替换与补充修改均有精确前向证明，见coupling-terminal-history-source-proof.json。

新增bool类型分派定义纳入唯一归属门禁，共59项。首次架构检查因扫描器不识别bool返回类型失败；只补充精确bool返回匹配，17个架构正负夹具及实际门禁通过，未豁免定义。首次提取脚本遇到普通rollback与本地快照的同名语句，触发exact-count断言，在继续前保留部分尝试并逐字节恢复脚本改动，再用完整本地分支定位；失败证据和原字节保留。901项输入冻结，来源覆盖903项通过，strict保留既有迁移缺口，差异检查退出0。核心及完整栅格测试构建／运行已通过；紧凑修订后的正式程序、27个相关服务目标已构建成功，同版51项GUI、31项服务／边界及完整平铺十三组全部通过。

首轮正式程序的layer-context场景退出-1073741571（0xC00000FD，栈溢出），未将服务测试通过当作GUI通过。第一版LocalSnapshotHistory嵌入完整SnapshotHistory，使Edit由6136增至6640字节、Document由25064增至26072字节；现改为仅含共享rollback、成本、工程名及dirty的实际载荷，编译测量分别为6104与25000字节，低于批前。程序1MiB栈保留值不变，未修改夹具布局或跳过原场景。紧凑修订后的同一正式程序已通过原layer-context专项和完整51项GUI；未加大栈、移动夹具或跳过场景。首轮失败、布局测量及修订输入均保留。

最终正式程序SHA-256 `abbf2e70c24f12987ea44c00cbf9762bd011a1cc6588f58309b2a2a0c7b6f625`，程序UTC见coupling-terminal-history-compact-gui/app.json。修订版完整栅格历史测试退出0，原layer-context专项及完整51/51项GUI、31/31项服务／边界和13/13组平铺全部通过。901项冻结输入、十五个源码证明哈希与GUI／平铺程序身份一致；来源覆盖903项通过，strict退出1保留已有迁移缺口，差异检查退出0，见coupling-terminal-history-final-consistency.json。临时GUI运行器成功结束时未显式设置退出码，串联包装因此未启动平铺；核对51项成功记录后，已补充成功退出码并独立运行完整平铺，未重跑掩盖GUI结果。GUI／平铺与部分服务构建重叠，不作性能结论；没有新增人工图像验收。

此阶段落实终结类别的封闭表示，尚不证明普通组合条目的builder／validate及跨域／children原子性完成。第13—14节记录的已修复边界和剩余限制继续有效，不提前关闭C07或整体目标。

## 16. 像素回放的校验与焦点边界（审计10.45，本批正式验收完成）

原applyHistoryContent在applyPixelEdit校验前切换目标图层与帧，缺失目标时还会直接解引用空Cel。新增真实undo／redo回归已复现无效像素索引被拒绝后焦点／蒙版状态变化，见coupling-pixel-replay-red-fixed-test.log。首次夹具因新建空帧没有栅格内容而无法附加蒙版，只修正为先创建实际内容后附加蒙版；该次失败保留在red-test.log，不作为产品缺陷证据。

applyPixelEdit增加显式activateTarget参数，默认false保留后台直接回放语义；普通前台历史内容阶段传true。现有连续地址与映射地址校验、逆序undo runs、稀疏裁剪、成本及写入逻辑保留；仅在完整只读校验后、获取可写owner前切换前台焦点，没有额外遍历整份像素载荷。图层／帧ID在调用选择入口前复制，防止选择入口使用目标内部字符串引用。像素、run、dense、地址和缺失目标共五类拒绝、两种地址路径、undo／redo两方向共20项检查，覆盖焦点、活动蒙版、像素及存储身份、历史位置／成本、版本、dirty、损伤、缩略图stamp与通知。已有栅格测试主体逐字节还原，三个生产修改有精确前向证明，见coupling-pixel-replay-source-proof.json。

Legacy依据为core/history.ts的HistoryStack成功回放后移动位置／发布通知，以及committed pixel的point／run／region回放和逆序undo规则；history.test.ts保留失败条目测试。新增拒绝边界为必要原生适配，不改变有效旧条目的回放结果。来源覆盖903项通过、strict保留已有迁移缺口，901项输入已冻结；修订后的核心／完整栅格历史测试退出0，新增20项拒绝及全部旧用例通过；同版正式应用及八个相关服务目标已构建成功，16项GUI、12项服务／边界及geometry验收通过。首次修复后夹具误将像素深拷贝的地址用作存储身份，现改为获取实时存储身份；原失败green-test.log保留，修订结果为green-fixed-test.log。本批不声称缓存分配、活动手势取消、父资源／结构、其他内容域或children跨域失败原子性完成，C07和整体目标仍未完成。

最终正式程序SHA-256 `a1f27e9165632b12e8cd472c42a2654c097f71ac0225608e2d90193bc538f206`，UTC见coupling-pixel-replay-gui/app.json。修订版完整栅格历史测试及20项拒绝场景通过；同版16/16项GUI、12/12项服务／边界及平铺geometry 1/1全部通过，包含后台直接回放的local-history-committed及hydration、历史／动画／录制通知与四项边界门禁。901项输入、四个源码哈希、精确生产前向证明、旧栅格测试主体字节及GUI／geometry程序身份一致；来源覆盖903项通过，strict退出1保留既有迁移缺口、差异检查退出0，见coupling-pixel-replay-final-consistency.json。没有新增人工图像或性能验收；本批结果不能替代父资源／结构、其他内容域或children跨域事务原子性验证。

## 17. 帧、图层与调色板历史捕获的领域归属（审计10.46，本批正式验收完成）

captureFrameOrder、captureLayerOrder、capturePaletteEdit从document.cpp移入document_history_frames.cpp、document_history_layers.cpp及document_history_palette.cpp。函数签名、函数体字节与全部调用点不变，Document仍是唯一捕获与提交者。帧／图层顺序捕获附带的蒙版、活动层／帧、选择、anchor等父级上下文，以及调色板kind分支的完整／局部快照与角色颜色均原样保留；不为实现文件划分而拆分事务或删除跨域上下文。头声明、结构布局、默认值、成本与持久化格式不变。

三个原函数体及Document剩余部分、三个领域单元均可精确还原为批前字节，证明见coupling-history-builders-source-proof.json。Legacy实际依据为workspace-animation-selection-history.ts的before／after选择包装、workspace-commands-layer-structure.ts的结构与UI捕获，以及workspace-palette.ts的capturePaletteEdit和workspace-palette-history.test.ts的快照往返。本批直接复用已有原生适配，不重新设计旧版快照语义。

新增三项唯一归属使历史定义门禁达到62项；扫描器只增加PaletteState返回类型识别，新增夹具覆盖该返回类型的缺失、错位、合法及重复定义。18项架构夹具和实际570源单元／235目标门禁均通过，已有架构夹具字节原样保留。来源覆盖903项通过、strict退出1保留迁移缺口、差异检查通过，901项输入冻结。正式应用及九个相关服务目标已构建成功，同版17项定向GUI、13项服务／边界及平铺geometry全部通过。

本批关闭三个既有公共捕获方法仍集中在主文件的归属问题，不等于普通组合条目的完整builder／validate、跨域／children失败前校验已完成；C07及整体目标保持未完成。没有新增人工图像或性能验收。

最终正式程序SHA-256 `df70902de70942b8558d022e402c717d84d0d3d18ed6053a1571fc62a6e537fb`，UTC见coupling-history-builders-gui/app.json。同版17/17项GUI、13/13项服务／边界及平铺geometry 1/1全部通过；18项架构正负夹具及62项唯一历史定义归属通过。901项输入、七个源码／配置哈希、三个原捕获函数与各单元的精确还原证明、GUI／geometry程序身份一致，来源覆盖903项通过，strict退出1保留迁移缺口、差异检查退出0，见coupling-history-builders-final-consistency.json。没有新增人工图像或性能验收；普通组合条目的完整构造／校验与跨域／children失败原子性继续处理。

## 18. 像素与surface组合叶条目的只读预检（审计10.47，本批正式验收完成）

原有10项surface拒绝场景加入一笔有效前置像素后，真实undo／redo在surface校验拒绝后已留下像素变化，见coupling-leaf-replay-red-test.log。validateSurfaceReplay提取原offset owner、最终偏移投影、surface owner／几何及预算校验；混合像素＋offset／surface的叶条目在applyPixelEdit前先调用只读预检，防止这些已知拒绝发生在像素写入之后。applyHistoryContent移入内容领域单元并更新唯一归属，普通六阶段及children方向不变，Document仍是唯一回放者。

预检不持有跨越焦点激活的写入指针，也不复制像素或surface；实际applySurfaceEdit在焦点结算后再次调用同一校验，再沿用原有文字／偏移／surface预备、缓存失效与交换顺序。这样不会把预检前的live指针或预算当作结算后状态。额外只读元数据／预算遍历仅用于同时含像素及offset／surface的条目；普通像素条目不增加此遍历，普通surface条目仍只校验一次。两次检查沿用同一公式和最终offset规则，不引入工程快照或整图复制；没有进行性能基准，不能据此声称无耗时差异。

完整栅格历史测试已退出0：10项拒绝检查保留像素值／存储身份、文字、几何、焦点、历史位置与预算、版本／dirty、损伤及缩略图stamp；有效链接owner的混合条目仍由surface替换覆盖前置像素，往返结果不变。此前20项像素拒绝、其余栅格用例及原断言均保留。三个既有测试改动（成功条目一笔像素、拒绝条目一笔像素及注释）可逆还原；生产明确替换有前向精确证明，原预算块和整个applyPixelEdit函数体字节不变，见coupling-leaf-replay-source-proof.json。

Legacy依据为core/history.ts回放成功后才移动栈并通知，以及history.test.ts的失败条目保留；现有surface目标、偏移、预算与像素顺序直接复用原生适配。来源覆盖903项通过，strict退出1保留既有迁移缺口，901项输入冻结。正式程序和十二个相关服务目标构建成功，同版16项定向GUI、16项服务／边界及geometry全部通过。

本批只前置这些叶条目的只读拒绝，不提供所有跨域／children原子性。文字／surface预备或缓存分配失败发生于像素提交之后的强回滚、活动手势结算、父级资源／结构及其他内容域的组合仍需继续处理；C07及整体目标保持未完成。

最终正式程序SHA-256 `d2508c4085e889a1d5bc095cf32fd230339315f66d19ba8ce32e096a9daf2600`，UTC见coupling-leaf-replay-gui/app.json。修订版完整栅格历史测试通过，包含10项混合拒绝、有效链接owner的混合往返与此前20项像素拒绝；同版16/16项GUI、16/16项服务／边界及geometry 1/1全部通过。901项冻结输入、四个源码／配置哈希、预算块／像素函数体字节证明、旧断言还原及GUI／geometry程序身份一致；来源覆盖903项通过，strict退出1保留既有迁移缺口、差异检查退出0，证据coupling-leaf-replay-final-consistency.json。没有新增人工图像或性能基准；其余事务原子性与活动手势边界继续处理。


## 19. 普通组合条目的字段形状预检（本批正式验收完成，整体未完成）

`applyEdit`在动画回放守卫和任何领域写入前只读遍历一次整棵实际回放树，随后由私有`applyValidatedEdit`按原六阶段执行，children仅进入已校验路径。预检不保存运行态指针、不复制像素，也不提前查找可能由结构阶段创建的目标。

检查before控制的Rollback、Timeline、Dimensions、ScriptGeometry、TilesetSlots、TileSelection、FreeTileSelection、Masks、Slices、LayerStructure、TrimPivot及AnimationLoop的after载荷。仅叶节点检查Palette、ScriptDurations，以及具名目标帧需要的before/afterDuration。终结类型仅检查自身必需载荷并结束遍历，保持普通字段及children被忽略的原协议。图层属性、GroupUi、Loop、选择等各侧可选字段不强制对称；TrimPivot双层optional的内层空值和缺失afterMaskSelection的清空语义继续有效。

Palette成本在读取必需快照、rename的首项或metadata前拒绝不完整载荷；kind8只需要其实际读取的before。Slice成本同样保护before存在而after缺失的读取。合法成本表达式与早返回顺序保留。

证据：coupling-history-shape-red.log记录旧实现接受缺少afterDimensions的undo；修订完整栅格历史测试通过。新增15类错误乘undo/redo共30项真实历史导航拒绝，坏条目在兄弟写入之后才会轮到，父级同时带有会改变尺寸的合法载荷，验证全树检查在任何阶段写入之前完成。检查像素及存储身份、尺寸、焦点、dirty、state、各revision、栈位置／成本、损伤和历史通知。单边及clear兼容检查、17项缺失成本快照检查、空rename及不完整Slice成本检查均通过，旧测试主体可逐字节恢复。

来源沿用Legacy HistoryStack失败不移动／不发布、workspace-palette-history真实往返契约；typed快照存在性检查是C++原生适配，不改变旧版可观察的成功操作。正式程序和27个相关服务目标构建成功，同版51/51项GUI、31/31项服务／边界以及13/13组平铺全部通过。此次仅封闭payload存在性缺口，不能据此宣布运行态owner、分配异常、手势结算、父结构和children完整事务原子性或C07完成。

最终程序SHA-256 `96dd4cdf66bff523b3e61db9999a656ea2e754f8777463804b18cd24bd7c6cb9`。901项冻结输入、七份源码／配置哈希与源码精确还原证明无漂移，GUI与平铺程序身份一致；来源覆盖903项通过，strict退出1保留既有迁移缺口，差异检查退出0。完整证据coupling-history-shape-final-consistency.json。GUI与服务构建有重叠，不作性能结论；未新增人工图像验收。


## 20. 帧运行态载荷在写入前预检（本批正式验收完成，整体未完成）

旧`applyFrameEdit`逐项检查ScriptDurations帧ID并立刻赋值，第二项错误会留下第一项的新时长。目标帧缺失和批量排序的`orderIndex.at`错误也可能发生在像素、disabled、帧插入／删除或选择已经修改之后。安全undo红回归已实际复现第一项时长残留，证据coupling-frame-preflight-red.log。

内部`document_history_frame_validation.h`统一只读检查完整时长帧数及顺序、目标时长配对，以及单帧／批量操作后的帧ID集合。在叶内容入口先检查，再在实际帧领域入口重验；不跨像素激活持有live目标指针。普通属性时长／脚本时长只遍历实际需要的帧元数据，结构投影仅借用ID构造局部集合，不复制帧、cel或surface。非空批量order可能按首个detached帧决定整组插入或删除，预检严格沿用此决策，并按single后batch的顺序计算目标是否存在。

保留旧成功语义：同条目新建的目标帧可用；重复／额外order项及重复detached帧不额外拒绝；single排序对未列出的保留帧仍按原find规则处理；batch排序在仅一个保留帧时不调用比较器，原无索引查询的退化情形仍允许；缺失disabled目标继续跳过。时长赋值、disabled、single／batch、sort、index、loops、selection及最终单帧时长覆盖顺序不变。旧写入体和旧栅格测试主体有精确反向还原证明。

回归覆盖8类错误×undo/redo×纯帧／混合像素共32项真实历史拒绝，另16项直接领域拒绝；检查帧ID／数量／时长／disabled、像素内容与存储身份、缩略图stamp、焦点／选择、dirty／state、revision、历史位置／成本、损伤及历史／动画通知。7类成功投影与混合像素＋全帧时长＋单帧覆盖的真实undo/redo通过。新头按document_*.h归核心域，历史定义唯一归属仍63项，571个源码／235个目标的架构门禁通过。

实际核对Legacy lua-script-operations的setFrameDuration、lua-script-service的MSE跨域往返和失败回滚，以及HistoryStack失败时保留位置／成本的测试。ID投影是原生typed历史的必要适配；未改变合法操作默认值、限值、入口和持久化格式。902项输入冻结、来源覆盖904项通过，strict继续保留原迁移缺口；正式程序和16个服务目标构建成功，同版20/20项GUI、20/20项服务／边界及平铺geometry 1/1全部通过。本批不解决父资源／结构先写、children之间或分配／手势结算失败的完整原子性，C07和整体目标未完成。

最终正式程序SHA-256 `bea754ae1a7b93f14512e9f28cda7e6c3692064011d99652169a82bd5115d727`，UTC见coupling-frame-preflight-gui/app.json。902项输入、四份源码哈希、原回放写入体／旧测试主体还原及GUI／geometry程序身份一致；来源覆盖904项通过，strict退出1保留既有迁移缺口，差异检查退出0。完整证据coupling-frame-preflight-final-consistency.json。GUI与服务检查有重叠，不作性能结论；没有新增人工图像验收，也未以旧十三组平铺替代本批geometry。


## 21. 图层、cel及冻结属性目标的分阶段预检（本批正式验收完成，整体未完成）

旧`applyCelEdit`逐项寻找并替换cel，后续目标缺失时会保留此前cel的透明度、像素等替换；coupling-content-targets-red.log已复现透明度残留。图层目标缺失也可能在detachedLayer增删后才被发现，冻结cel属性虽在自身入口先检查全部成员，但在混合叶条目中仍位于像素／surface写入之后。

新增内部目标预检：叶入口在任何内容写入前检查冻结属性成员、图层属性的最终目标，以及最终cel替换阶段的目标集合。实际图层与cel入口分别重新读取当前目标，保持像素激活和手势结算之后的有效性检查。冻结属性的原成员校验提取为`cel_properties_targets.h`，实际属性apply与历史入口共用同一函数；该公共算法内部头无Document依赖。`document_history_target_validation.h`归核心历史域，未改Document公共头。

cel目标投影只在存在结构增删时临时引用cel元数据，严格按layer、single frame、batch frames顺序追加／删除目标；batch插入继续按ID去重。frame插入／删除决策与上一节frame预检共用membershipChanges，避免两个预测器自行决定。函数不返回live指针，ID视图及cel引用均在检查结束时销毁，不复制cel、像素或surface。无结构变化时直接用当前Timeline索引检查替换ID。冻结属性按其实际较早阶段要求成员已经存在，不能由稍后的frame插入补齐；最终cel替换则允许同条目在之前结构阶段创建或删除后重建相同ID。

保持原可观察成功语义：空order忽略detached结构；同条目新建图层的属性及cel可回放；single／batch新建帧的cel可回放；删除旧图层后在frame阶段恢复同一cel ID可回放；重复detached cel按原batch去重，重复替换最后一项覆盖；冻结属性继续按memberCelIds执行，不额外要求未被原算法读取的sourceCelId存在。原pixel、celProperties、palette、layer、frame、cel阶段顺序及各写入体保持，末尾cel替换继续覆盖较早像素和属性值。

新增13类错误×undo/redo×纯内容／混合像素共52项真实导航拒绝，另10项直接领域拒绝；检查全部cel数量／ID／归属／透明度／Z／像素、layer数量／ID／名称／visible／opacity、frame数量／ID／duration／disabled、活动焦点与选择、palette primary、存储身份／缩略图stamp、dirty／state／revision、历史成本／位置、损伤及历史／动画通知。7项成功结构／重复／冻结成员场景及完整混合undo／redo往返通过，既有栅格测试主体逐字节保留。初次夹具将不同类型写入同一auto声明导致编译失败，已仅拆开声明，失败日志green-build.log保留，修订green-fixed-build.log成功。临时GUI运行器生成时替换计数断言发现列表与过滤表达式都匹配，原脚本保留，独立修订生成器不改源码／断言。

来源实际核对Legacy workspace-commands-animation-cel-properties冻结linked members、workspace-commands-layer-structure恢复cel逻辑，以及HistoryStack异常保留位置／成本。904项输入冻结，来源覆盖906项通过，strict继续保留已知迁移缺口。正式程序与20个服务目标构建成功，同版23/23项GUI、24/24项服务／边界及geometry 1/1全部通过。此次只解决这些目标存在性的拒绝边界；新layer／frame／cel元数据、slot和link的完整Timeline校验、buildIndex／复制分配异常、父资源／结构、children与手势失败原子性仍未完成，不关闭C07或整体目标。

最终正式程序SHA-256 `d45f78bb3617ddd51deefa486c38409ea6929fb7831905c1a7d75fc1503f5093`，UTC见coupling-content-targets-gui/app.json。904项输入、八份源码／配置哈希、原写入体／旧测试主体还原和GUI／geometry程序身份一致；来源覆盖906项通过，strict退出1保留既有迁移缺口，差异检查退出0。完整证据coupling-content-targets-final-consistency.json。新增冻结成员、层／帧结构组合及重复替换的成功场景通过；文字工具和图像缩放GUI均通过，相关cel-properties／liquify服务通过。GUI与服务检查重叠，不作性能结论；无新增人工图像验收。


## 22. 通用元数据校验与准备后的索引发布（本批正式验收完成，整体未完成）

源码确认旧Timeline::buildIndex在检查layer／group／frame／cel之前清空索引及选择、缩略图等缓存；旧cel回放还会先覆盖无效快照，随后在索引检查时抛错。coupling-cel-metadata-red.log已用无效opacity真实复现cel字段残留。索引clear-before-check的旧顺序由源码核对，未把该路径另称已运行旧版红回归。

`timeline_index_validation.h`承接原requireId、checkLayer、checkFrame、checkCel及layer／group／frame索引循环。cel谓词和两项唯一性检查通过通用回调同时服务真实索引和只读替换视图。原判断表达式、错误文本、ID／structured slot语义及检查顺序保留；Timeline的addLayer／addFrame／addCel仍使用同一规则。没有新增offset、link有效性、mask／tile／free-tile或空surface规则，构造函数的其他校验顺序保留。

buildIndex现先在局部准备四个完整索引，验证及分配成功后才清缓存并swap发布，最后沿用原synchronizeLinkedLayers。拒绝准备时不修改旧索引／缓存。成功重建会同时短暂持有旧／新元数据索引；临时索引、引用视图和ID／slot集合都是O(metadata)工作内存，不复制任何surface／像素。linked-layer同步在发布后仍可能因坐标溢出或分配失败，不能把该阶段也称为强回滚；调用方若先修改state，准备器也不会自动撤回该state修改。

cel实际入口及叶预检的最终替换视图现在复用同一cel谓词、重复ID和slot检查。临时视图按原顺序应用全部替换后才检查，保留后项覆盖及修复前项的行为；按原layer／single frame／batch frame决策使用投影中的可用层／帧ID。引用只在只读检查内存活，不跨激活返回live目标。既有字段／目标／frame拒绝检查与正常迁移行为继续保留。

新增10类无效opacity／surface尺寸或长度／归属／slot冲突×undo/redo×纯／混合内容共40项真实导航拒绝，另20项直接cel拒绝，检查原cel、像素和存储身份、layer／frame／palette、焦点／选择、dirty／state／revision、历史位置／成本、损伤及通知。6类索引准备失败通过受控私有输入损坏触发；恢复仅该损坏字段后，无需再重建即可继续使用原cel索引、选择缓存及缩略图stamp。该检查不宣称调用方原state修改自动回滚。5项兼容场景确认后项修复无效opacity、后项修复暂时slot冲突、null opacity／透明RGB／负offset、空surface和悬空link仍按原逻辑支持或报告。

完整栅格与Timeline模型初验通过，原测试主体、各原校验谓词／循环及迁移范围之外的Timeline源码有精确证明。初次夹具两处不同类型共用auto声明导致编译失败，已拆分声明；green-build.log与修订green-fixed-build.log分别保留，未降低产品断言。Document和Timeline公共头均未修改。905项输入冻结，来源覆盖907项通过；strict保留既有迁移缺口。正式程序及32个相关服务目标构建退出0；同版51/51项GUI、36/36项服务／边界及13/13组平铺全部通过。父资源／结构与中间metadata、复制／索引同步的异常、children及手势结算的完整事务原子性仍未完成，不关闭C07或整体目标。


本批最终程序SHA-256 `c4e183792e78ae5a18d3708b9dc1336cf986cae6215f74ddb052d1e6dd4499d1`。GUI总用时227.98秒，文字工具119.47秒；平铺十三组总用时488.92秒，均无超时或新错误。905项冻结输入及源码证明哈希不变，GUI与平铺均核对同一正式程序身份；来源覆盖907项通过，strict退出1保留已知迁移缺口，差异空白检查退出0。最终证据 `build/test-tmp/coupling-cel-metadata-final-consistency.json`，原始记录为同前缀的 `-gui`、`-tile` 与 `-checks.log`。未新增人工图像或性能基准，GUI与服务构建部分重叠，不作性能结论。C07及整体目标仍未完成。

## 23. 整份结构快照在父资源及子条目写入前校验（审计10.56）

实际原代码复现：普通Edit先applyHistoryResources改写蒙版像素与选择游标，随后才在applySnapshotStructure的Timeline构造中拒绝无效图层。真实undo在mask字节保留断言失败，证据coupling-snapshot-preflight-repro-confirmed.log。首个夹具缺少蒙版所需可见像素，后续另修正复制像素容器的身份基线；这些夹具失败单独保留。恢复对照源码时文件时间戳让一次增量构建继续沿用旧实现；已刷新时间并确认corrected-build.log实际重新编译document_history_apply.cpp，不用旧程序作修复证据。

applyEdit在既有全树字段完整性检查后、任何applyValidatedEdit之前，遍历每个普通条目所选方向的before/afterTimeline，用同一timeline::index_detail::buildIndices规则检查layer/group/frame/cel元数据和唯一性。终结条目仍忽略普通字段与children；只有beforeTimeline存在才会使用快照，单侧afterTimeline保持原来的忽略语义。没有复制像素、构造临时Document、序列化或新增事务所有者。临时元数据索引为O(metadata)空间，slot使用结构化pair；成功路径仍由原实现执行资源、结构、内容、选择、投影与来源阶段，children仍undo逆序、redo正序。

32项真实undo/redo拒绝覆盖parent和后续child中的8类损坏：重复layer、非法layer opacity、重复frame、零duration、重复cel、未知cel layer、无效surface尺寸、未知group。检查原蒙版字节/存储身份/选择游标、像素/存储身份、尺寸、活动层/帧/蒙版、dirty/state/revision、历史位置/字节、损伤及两类通知不变。完整栅格、Timeline、DocumentSnapshot、蒙版、图层树、已提交本地历史、HistoryStore、命令、动画绑定和四门禁共13/13通过，旧测试主体未改。

正式程序SHA-256 `f39b9a18d046e5d8712c70a63365ec85dade9e52f093078351b1ea910eea4f87`，同版17/17项定向GUI通过；平铺geometry与最终一致性见审计10.56。源码恢复证明、失败与构建/验收日志均为coupling-snapshot-preflight-*。仅来源验收说明/来源登记在构建后更新，909项当前输入与源码证明核对。

边界：本检查只前移整份Timeline快照的既有索引合法性；其他结构payload、live目标、资源分配/复制/linked-layer同步、手势结算仍可能失败，不得据此宣称完整父/子事务原子性。未增加既有Timeline不检查的link/mask/tile规则，也没有新增人工图像或性能基准。C07及整体目标仍未完成；C02仍需要完整选择快照后才能实现明确的结构变更归一化，不能通过此检查替代。


## 24. 稳定成员组合的目标预检

组合历史在任一子条目写入之前，先判断整棵普通条目树是否保持目标成员与链接拓扑不变。仅对此类组合，按redo正序／undo逆序递归检查叶条目的帧、图层、冻结cel属性成员、像素owner以及offset／surface的canonical owner。像素允许链接别名；offset与surface必须直接指向原始owner，谓词与实际领域写入共享。检查只借用当前模型，不保存跨激活的写入指针，不复制像素。

任何终结载荷、rollback、整份Timeline、尺寸／图层结构、tileset及自由图块来源结构，或叶级图层／帧顺序、detached／替换cel及auto-link载荷都会使整棵组合跳过这项初始模型预检，沿用既有领域投影与实际阶段检查。这样不会把前一个子条目刚创建、后一个才使用的目标误判为不存在。父级叶专属内容及缺失text目标仍按原语义忽略。此检查不把依赖中间状态的几何或预算当作初始状态不变量。

真实undo／redo覆盖6类后段无效目标×两个方向×直接／嵌套组合，共24项；失败保持像素及存储身份、历史位置／字节／revision、Document状态／dirty／内容revision、活动上下文、损伤和历史／动画通知。另验证创建cel后再绘制的组合、重复像素写入的嵌套组合及忽略字段的apply→undo→redo。原代码红测在像素保持断言失败；扩展夹具首次因入栈阶段的正常地址捕获拒绝缺失目标，已改为正常捕获后再注入无效ID，保留失败日志。

本节只收口稳定成员目标拒绝边界。结构依赖、几何／预算、内存分配、linked同步和活动手势的完整跨域事务原子性仍未完成，不据此关闭C07。正式构建、服务与GUI验收见审计10.58及coupling-compound-targets-*证据；不新增人工图像或性能结论。

## 合并实施：组合回放的失败恢复（待最终统一验证）

直接迁移legacy `core/history.ts::replayHistoryEntries`：redo正序、undo逆序；后续子条目失败时，以相反方向逆序恢复已完成子条目。恢复全部成功则原异常类型/内容继续传播；恢复也失败时，HistoryReplayError按顺序保留原异常及全部恢复异常，不因第一个恢复错误放弃其他步骤。领域应用仍仅由Document执行；HistoryStore继续只在成功后移动位置/计量。

新增`history_replay.h`不持Document、Timeline、像素或UI。Document在任何领域写入前，递归准备所有非终结组合的失败记录容量，回放只记录已完成数；嵌套恢复沿用同一预备树。终结条目的普通字段/children仍按原协议忽略，不为其构造回放子树。没有工程编解码或整文档回滚副本。

新增无UI服务场景覆盖每个失败位置、双向顺序、恢复失败聚合、恢复继续执行及成功路径；真实Document场景覆盖嵌套/非嵌套、Undo/Redo中后段像素检查拒绝后已完成兄弟像素恢复、透明RGB/存储身份/历史位置与计量保持。均尚未编译运行，不能登记通过。独立公共头检查已接入现有目标。

边界：与legacy相同，补偿要求单个子条目完成或在写入前拒绝。本改动不证明尚未完成的父资源/父结构阶段、部分写入叶条目和全部分配失败路径具备强原子性；C07仍开放，继续需要分域prepare/validate，不能以组合补偿代替。

## 合并实施：资源prepare及精确恢复（待统一验收）

HistoryReplayPlan在写入前为整棵组合准备目标tile slots、tile selection、masks、mask selection及激活/焦点字符串；仅准备条目实际使用的资源。应用先解析可能拒绝的tileset，再交换已准备值，资源阶段不再逐个copy赋值导致前项已写后项分配失败。被替换值保留在plan，后续阶段错误通过交换恢复；子条目补偿复用相同plan。蒙版像素沿用已有领域载荷的必要拷贝，不复制整Document；失败恢复还原原像素所有权与mask serial。

新增父/子资源叠加后段像素拒绝的双向检查，未构建/运行。父结构以及部分写入叶条目的完整prepare仍未完成，不能从资源回滚推出整体原子性。

链接结构准备补齐（未验收）：synchronizeLinkedLayers先为所有group/component准备source、坐标和安装记录，再一次性共享存储；不再因后组overflow留下前组已共享。来源选择、保留世界anchor公式及缓存失效不变，无像素复制。applyLayerStructure在链接准备失败时把暂借的live/detached surfaces归还，再抛原异常；structureCels池只在成功后更新。新增后组失败身份保持和双向结构失败surface归还场景，留待统一运行。父结构成功后再失败的完整事务恢复仍待收口。

整份Timeline快照回放补齐（待统一验收）：目标Timeline仍采用原有快照构造路径；交换时保留被替换Timeline、尺寸、活动层/帧和损伤。后段失败先无分配交换还原，再恢复资源；组合逆向补偿复用该保留值。目标准备仍发生在原结构阶段，不代表所有结构均已在写入前准备。新增双向后段拒绝及已完成兄弟补偿检查，涵盖原像素存储身份、尺寸、焦点、历史计量和损伤。图层结构、rollback、slice、pivot、loop以及部分写入叶条目的完整失败恢复仍未关闭。


本节新增实现已随统一Release验收：对应Document/滤镜/历史服务检查、34项GUI及geometry通过；证据见 `build/test-tmp/coupling-consolidated-*`。此前“待验收/尚未运行”描述为实施时状态。验证仅覆盖所列场景，明确列出的未完成结构和迁移缺口继续保留。


## 合并实施：图层结构保留与回放上下文（未构建验收）

图层结构不再暂借并挪走原surface：目标与detached列表先准备全部header，共享原有像素buffer；链接同步全部成功后才交换正式Timeline、结构池、活动上下文、tile selection和损伤。plan保留被替换结构，父结构成功后后段子项失败或外层组合补偿时直接交换还原。共享期间沿用legacy可编辑共享存储，避免整图复制；这不是写时复制或新增工程备份。

切片、显式pivot、动画循环和像素选择的目标值在整棵plan构造时准备，原值以交换保留，后段拒绝可恢复。仅slice/选择目标本来所需的值复制，不为每个子项复制整文档。历史入口另保存一次正式动画选择、自由图块选择、geometry/opacity投影、损伤与修订/recording脏区上下文；失败直接恢复这些元数据，不用selectFrame或UI回调复现中间状态。

新增真实Document场景覆盖结构已成功删层/改名后子项失败的正反向与嵌套恢复、slice/pivot/loop的后段恢复、成功兄弟切到另一帧后后项拒绝的上下文恢复。为避免稳定目标预检提前拒绝，夹具显式走结构/尺寸阶段。该实现尚未构建运行，不使用上一版成功结果背书；rollback、可分配叶阶段和post-content的完整原子性仍未完成，C07保持开放。


父后处理失败也纳入组合补偿（未验收）：所有children已成功后，selection/projection/finish中的错误会使用同一预分配失败记录逆序恢复这些children；原错误及恢复错误全部保留。父像素选择先交换还原，再恢复children；随后逆序恢复父snapshot/loop/pivot/layer/slice/resources。每个phase比较“本次进入前”的applied值，不假设仅正向回放；mask资源的激活/焦点/serial只初始化一次，复用节点的逆向恢复不重新计算。新增服务顺序/聚合检查及真实Document已完成结构兄弟的补偿场景，尚未构建运行。叶级内容在后处理失败时的完整恢复仍待处理，不能据此关闭C07。


RollbackPayload准备及保留（未验收）：原本必要的一份目标payload复制、Timeline校验/linked同步与viewedFrame校验保持；以RollbackReplay保留被替换Timeline及资源/选择。成功仍更新brush/selection/pivot serial、清正式选择并投影当前cel；preserveRecording保持跳过录制设置替换及回调。录制恢复回调仍在内容替换前执行，目标回调失败会还原原设置并调用原设置恢复；投影失败也交换回原领域状态。普通组合rollback把该节点留在plan，后段失败和逆向补偿复用；terminal local snapshot及local-history hydration沿用相同底层实现。未新增整文档/像素备份，未改工程身份、名称、路径或历史所有者。

新增真实Document四组双向父/兄弟后段失败，以及录制恢复回调明确拒绝场景，检查原Timeline像素身份、尺寸/焦点/名称、palette、brush revision、像素选择及serial、录制设置和回调顺序。尚未编译/运行，不能用前一版的green证明。剩余主要是可分配叶内容和后处理叶事务的准备与恢复，以及完整builder/validate收口。


## 叶内容统一准备与保留发布（源码实现，未验收）

普通叶回放先完成现有目标预检及像素激活，再准备目标元数据，最后执行像素写入与不分配的发布交换。Document 在内部无回调作用域中暂用私有草稿调用原有 surface → celProperties → layer → frame → cel 方法，保持原有索引重建与 linked 同步屏障；调色板目标独立准备，不影响这些领域的输入。作用域退出（包括异常）必定还原正式 Timeline/焦点/帧选择/geometry/damage，之后才允许像素写入。草稿复制内容元数据并共享现有 raster 存储，不复制整个 Document，不复制 mask/tileset；正式资源保持原所有权。最终发布和内部逆向补偿保留这些被替换值。

像素恢复记录按实际 storage 坐标裁剪、排序并合并触及区间，只保存触及的原字节，不依赖历史载荷的 before/after 猜测失败入口值。父后处理或后续兄弟失败时交换还原原字节和原 metadata/像素身份；同一个计划的逆向与再次正向也使用保留记录。纯像素条目不建立 metadata 草稿，不清 composite-order 缓存。调色板仅准备该 kind 实际修改的字段，保留 kind7 的 secondary、kind3 的匹配更新和 kind11 的重复名称 last-wins 行为；完整 palette 仅用于原本整份替换的分支。

新增真实 Document 场景包括：重叠 point/run/dense 与透明RGB的原值恢复、混合 surface/属性/调色板/排序/帧/最终 cel 替换后的兄弟失败、最终无效 link 在后处理抛错的恢复、同计划反复交换、mask资源身份、调色板局部所有权。均尚未构建或运行。该实现不能由前一版验收结果背书；C07仍须统一核对实际组合、准备失败、terminal和直接domain入口，以及元数据草稿成本，不能以新增场景存在代替验收。


同计划补偿的阶段顺序同步调整：先恢复叶内容或children，再交换其所属structure，避免提前换回原structure后又被叶内容的保留metadata覆盖。新增同一个叶同时携带删层structure与混合内容的双向后段失败，以及两次索引重建之间插入cel替换时pixel owner优先级场景。链接准备先推进即将写入owner的内部storage stamp，以保持原先“先写像素、再链接”的来源选择；不提前写像素。此处及新增场景均未编译运行。


## 终结载荷与组合 builder 收口（源码，待最终统一验证）

局部历史终结载荷现在在任何字段或字节写入前核对双向元数据类型、整数转换范围、像素载荷存在及等长、owner 存储边界；帧几何和透明度投影也先准备。透明度覆盖表按实际回放方向构建一次，保持重复字段的正向最后覆盖、反向逆序恢复；不按每层扫描全部补丁，不复制整文档或像素。沿用 legacy local-history-delta.ts 的字节粒度、共享 owner 与补丁顺序，以及 HistoryStack 对单步失败前不写入的要求。

组合 builder 改为只读旧条目，先完成父载荷、子容器容量和费用/溢出核对，才无分配移动子条目。Document 的 historyRevision 和待计 operation 在分组成功后发布；documentChanged 沿用 legacy 的 children.any 判定，纯选择分组不引入作品修改。已增加服务故障准备拒绝与真实 Document 选择捕获异常场景。

直接蒙版终结回放拒绝无效源面、零 canvasWidth 或无效目标尺寸；瓦片终结回放拒绝缺少必需选择/组上下文的载荷，避免先解引用 optional。自由图块来源属性先用现有 next 值构建并验证 Timeline，再发布；没有增加原有像素复制。动画选择 before 缺少 after 在根形状检查阶段拒绝。

新增夹具覆盖双向、直接领域/根回放/嵌套历史导航、后段错误前原像素/存储身份/历史计量/修订/损伤保持，以及重复透明度投影顺序、builder 拒绝与纯选择分组。均未编译运行，不登记行为通过；保留既有 strict 迁移缺口、C05 未定位旧失败及其他剩余验收条件。总体已验收仍为5/10。


## MSVC历史载荷移动保证

统一编译发现MSVC的unordered_map移动构造可能分配，原ScriptGeometry可选值使Edit不能满足无异常移动静态断言。现将仅历史持有的前后几何快照改为shared_ptr<const ScriptGeometry>，脚本发布前仍准备相同内容，回放及费用遍历不变，不复制额外历史或像素。保留HistoryStore无异常移动检查；当前单文件编译已通过，完整构建与运行结果待记录。


## 2026-11-13 最终契约核对与关闭 C07

此前章节的“普通组合构造/校验未完成”和“未编译”是实施时状态，本节替代这些待办状态。当前源码已完成原 C07 六步：领域载荷/捕获/apply/cost 分离、封闭 terminal 分派、HistoryStore 位置/预算/分组、Document 唯一回放与通知所有者，以及既有 CommittedCapture/JournalSession 持久化。

| 原剩余条件 | 当前实现及证据 |
| --- | --- |
| before/after 与稳定目标、整份快照预检 | document_history_apply.cpp::validateHistoryShape/validateHistorySnapshots、document_history_target_validation.h；双向和嵌套拒绝由完整 document-raster-history 覆盖 |
| 父结构/资源/children 后段失败 | HistoryReplayPlan 递归准备，resources/layers/snapshots 保存被替换值；history_replay.h 逆序补偿，根入口恢复选择/焦点/投影/修订；父/兄弟/嵌套双向失败测试通过 |
| 叶内容及后处理分配失败 | document_history_content.cpp 准备元数据和实际触及像素区间，后段失败交换恢复；不复制整幅像素或工程编解码回滚；混合叶、透明RGB、共享存储身份和重复计划测试通过 |
| terminal 与直接领域入口 | LocalPixelsReplay 先验证全部类型/字节边界并准备投影，蒙版/瓦片/来源属性保留直接入口校验；根/直接/嵌套失败覆盖通过 |
| builder、计量与无内容分组 | HistoryStore::group 只读准备父载荷/容量/费用再无异常移动；Document::groupEdits 成功后发布代次；bad_alloc、builder/cost拒绝与纯选择组测试通过 |
| 顺序、资源、选择及本地历史 | 正序redo/逆序undo、预算/分支裁剪保持；document-animation-binding、history-store/history-commands、local-history-committed/hydration 均通过 |

本轮核对98个历史相关源码/测试输入与上一已构建验收版本相同，见 build/test-tmp/coupling-direct-tools-substitution-proof.json；本轮10/10服务测试再次通过，含完整document-raster-history，见 coupling-direct-tools-service-tests.log。GUI的既有同版完整animation/script/选择/图层/保存证据见实施报告“本批最终复查”。本次没有修改历史生产源码，不重复构建历史库。C07按原审计范围关闭；这不撤销已登记的legacy迁移缺口，不关闭C05的旧恢复提交未知根因。
