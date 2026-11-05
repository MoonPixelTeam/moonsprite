# 本地历史迁移（2026-11-03）

FS-006 的进行中记录。归档编解码和新旧互读已通过限定验证；尚不能在原生程序中记录或恢复本地历史。

## 旧版依据

- `legacy/src/renderer/src/core/local-history-archive.ts`：`snapshotParts`、`sharedSnapshotData`、`unpackLocalHistorySnapshots`、`encodeHistoryDelta`、`decodeHistoryDelta`、`packLocalHistory`。
- 同目录 `local-history-archive.test.ts`：RGBA／indexed 差量缓冲区和别名、缓存不重复解码、流式与普通 ZIP 记录共享、原始字节保留、哈希碰撞及危险路径拒绝。
- `local-history-delta.ts`：差量结构及文档应用语义；`local-history-committed-delta.ts`：从已提交编辑获取差量，不能以每笔整图快照替代。
- `store/local-history-service.ts`：默认开关与步数、750ms 合并写入、不可变代际、按路径身份、较新作品与异步编辑保护、历史窗口、录像保留及失败后保留磁盘数据。
- `local-history-budget.ts`：共享内存计数、前缀检查点重基与后台压缩，不能通过丢可见历史规避预算。

许可：这些 MoonSprite 模块适用 `legacy/LICENSE` 的 Source-Available License 1.0；第 2 节允许当前修改与内部编译测试。测试使用仓库已有 fflate，原生使用已登记的 zlib，路径身份另使用 Windows 系统 ICU 适配按区域 Unicode 小写，未复制或分发该 DLL；依赖已记入 THIRD_PARTY.md。

## 已实现的归档边界

`local_history_archive` 复用现有 `project::Archive` 和 `project_encode.cpp` 的有预算 ZIP 写入器。原工程默认存储与恢复 level1 行为保持；历史外层存储资源、索引 level6、差量 level6。

- 读取旧版 v2 整快照、v3 共享块和 v4 增量快照索引。
- 准备完成的差量／结构快照写为兼容 v3／v4；保留索引中的未知元数据。
- 用中央目录划分本地头、压缩负载、数据描述符及中央目录；不认识的记录保持不透明原字节。
- 哈希仅缩小候选范围，命中后逐字节确认，不用 CRC／长度相等代替内容比较。
- v3 快照只保存块跨度，按需拼接；并发访问共享同一缓存，不为每一步提前复制完整工程。
- 差量支持旧版九种 typed array，保留原类型及精确二进制、路径／aliases、celTarget、snapshotFrameId、origins 和额外元数据；无效路径、偏移、长度、类型、坐标和索引拒绝。

C++／Windows JSON／共享字节所有权和现有原生归档预算是必要适配。`packPrepared` 明确要求所有转移已准备，不会把尚未迁移的文档差量编译伪装为完成；该归档模块本身不执行磁盘写入；新增的独立二进制存储辅助模块仍未接入后台队列、UI 或新设置入口。

## 验证命令

```powershell
node native/scripts/make-local-history-fixtures.cjs . native/build/local-history-fixtures
native/build/Release/local-history-archive-tests.exe native/build/local-history-fixtures
node native/scripts/make-local-history-fixtures.cjs . native/build/local-history-fixtures --verify
```

生成器直接加载旧版实际函数，适配仓库已有 Node 24 TypeScript loader。6 组归档、3 组差量、25 组畸形输入来自旧版测试及相同契约的扩展，包括普通／流式 ZIP、移位和时间戳变化、共享块去重、伪 CRC 碰撞、opaque 记录、RGBA／indexed 实际差量、九种类型及缺失／无效数据。原生重包后再交旧版读器核对精确快照字节、typed 值／aliases／元数据。

原生测试和反向旧版读取已通过。测试曾在 COM 关闭前仍持有 JSON 对象而退出异常，修复对象生命周期后退出 0。

最终验证：`local-history-archive`、`recovery-codec`、`project-save`、`editor-recovery` 四项 CTest 全部通过；旧版反向读取通过。唯一正式 `native/build/Release/moonsprite-native.exe` 构建成功，`--aseprite-save-check` 返回 0。来源覆盖检查 581 文件通过。

现有 `editor-recovery` 测试原先复用同一目录，第二次运行会因保留的 local-owner sidecar 导致“两条记录”断言失败；改为在调用方测试目录下创建独立 run 子目录，保留所有旧样本。此后连续两次通过；没有修改生产恢复或删除数据。

本次没有新增界面，没有人工界面验收。

## 身份、窗口、二进制存储与恢复保护（后续批次）

新增 `local_history_policy` 承接旧版 `historyId` 的 filePath／sourceFilePath／运行时 ID 优先级、先选择后 trim、按区域小写、UTF16 FNV1a 与 base36；不把路径分隔符、相对段或 Unicode 组合形式自行正规化。Windows 系统 ICU 用于保留字符展开和上下文小写语义，JavaScript Number 复用现有转换器。默认 50 步、1～200 限制与恢复窗口计算均来自旧版实际函数。

`local_history_store` 承接 Rust 平台层 ASCII ID 检查、`.history` 原始二进制和原子替换。抽取复用现有图片导出 Win32 临时文件／flush／replace 实现；通用入口允许空二进制，原图片导出入口仍拒绝空输出。目录由调用方显式提供，有读写预算，不自动定位或修改旧版用户目录。删除命令、后台 IO 调度及实际应用目录接线仍未实现。

`local_history_restore` 生成旧版元数据指纹，记录文档身份及 revision／contentRevision／historyRevision；已保存指纹不符、编辑期间或异步期间文档／历史已变更时返回拒绝，不修改文档。原生图层按 UI 顺序保存，工程序列化反序输出，因此指纹也反序遍历以匹配旧版文档顺序；活动帧几何来自实际解析的 cel，与工程序列化一致，不复制像素。此处只是保护条件，尚未安装恢复后的历史。

验证：`make-local-history-policy-fixtures.cjs` 提取并执行旧版实际私有函数，生成 13 个身份、17 个设置、294 个窗口及 2 个指纹参考；原生测试通过。还覆盖土耳其语／系统默认区域、活动编辑／撤销／仅历史裁剪竞态、中文目录、非法 ID 写前拒绝、读写预算、空二进制、文件锁导致替换失败时保留旧文件并清理自有临时文件。每次测试保留独立子目录。

原生双图层／双帧工程交旧版实际 `decodeProject` 解码，其指纹与原生实时指纹相同；此对照发现并修复了图层顺序错误。此样本不能证明所有特殊图层及完整恢复行为等价。归档反向旧版互读仍通过；local-history-policy／local-history-archive／image-save／project-save／recovery-codec／editor-recovery 六项 CTest 通过，唯一正式 Release 构建及 `--aseprite-save-check`（退出 0）通过。来源覆盖 590 文件与证据快照通过，`--strict` 如预期退出 1，需求静态台账及 `git diff --check` 通过；这些静态检查不代表功能迁移完成。

复现新增检查：

```powershell
node native/scripts/make-local-history-policy-fixtures.cjs native/build/local-history-policy-fixtures.json
native/build/Release/local-history-policy-tests.exe native/build/local-history-policy-fixtures.json native/build/test-tmp/history-store-owned
node native/scripts/make-local-history-fixtures.cjs . native/build/local-history-fixtures --verify
```

没有新增界面或人工界面验收；FS-006 继续部分承接。

## 已提交像素差量适配（后续批次）

`local_history_committed` 按旧版 `local-history-committed-delta.ts` 和 `history.ts`，从现有原生 `Document::Edit` 提取点、连续段及矩形区域补丁。捕获票据在编辑前记录文档、内容状态、历史代际及元数据形状，只接受同一文档恰好一次已提交编辑；结构／属性／组合／选择编辑、活动预览、撤销重做或跨越多个提交均回到结构检查点路径。此模块尚未接入服务事件，返回空值也不会自行生成检查点。原生 commitStroke 当前先 pushEdit 后清除 active_，因此不能直接在现有 pushEdit 内调用本 settled-document 捕获接口；后续必须对齐旧版已提交事件时机并验证组合／取消顺序，不能以每笔检查点绕过差量性能要求。

形状标记只读尺寸、调色板颜色条目字段、图层／帧／cel 身份、几何、链接及共享存储拓扑，不扫描像素。原生调色板 DTO 和时间线布局不同，标记仅在原生会话内部比较，不宣称字符串与旧版逐字一致。差量路径则按现有工程序列化的图层反序／帧顺序定位，以便旧版真实解码后的 cel 索引一致。

必要适配：原生跨行线性连续段切成旧版可接受的逐行范围；`PixelAddressSpace` 映射到实际 owner 存储原点；RGBA 按明确小端序输出。保留区域→连续段→点的补丁顺序、规范 celTarget、snapshotFrameId、别名、存储原点、受影响图层及现有原生内容失效区域。仅复制改变部分的 before／after 字节，既不复制无关 cel，也不用工程编码替代逐笔差量。仅测试产物通过现有工程编码器输出前后工程。

新增 `local-history-committed-tests` 与 `verify-local-history-committed.cjs`：原生真实提交产生点、跨行连续段、矩形、非零原点稀疏面、链接帧、后台帧及普通／原点映射重叠连续段共 8 类样本；旧版实际 `commitPixelEdit`／`captureCommittedHistoryDelta` 独立生成参考补丁，并用旧版实际 `hydrateLocalHistoryDelta` 验证原生差量的 redo／undo／重复 redo。8 类原生捕获、未修改文档／历史／共享存储、补丁预算及结构／几何变化／预览／跨提交／导航保护检查通过；旧版实际提交捕获生成的规范补丁路径、别名、偏移、精确字节、celTarget、受影响图层及 byte count 全部一致。旧版加载原生差量后的 redo／undo／重复 redo 全部通过，编辑目标帧与当前查看帧保持分离。原生同样验证每个样本撤销回精确原像素及重做回结果。稀疏样本验证实际非零原点到 owner-local 字节偏移的映射，未宣称所有特殊图层等价。

此次回归实际发现已有原生 `applyPixelEdit` 的重叠连续段 Undo 按正序写回，会遗留中间颜色，修复前测试在精确原像素断言处失败。按旧版实际 `history.ts` 的 `applyRuns(runBefore, true)`，将直接存储及原点映射路径均改为逆序撤销，Redo 保持正序；两条路径的新回归和旧版差量对照均通过。

原生仅有整个 vector 像素存储，没有独立图层投影缓冲区或 ArrayBuffer 子视图；对应旧版 lazy getter／不同 byteOffset 的检查没有原生表示，不宣称覆盖未来惰性 tiled surface／subview。实际旧版形状检查在同一已准备的 live target 应用差量前后比较；两个独立 ZIP 解码出的 raw view byteOffset 可不同，不能拿该差异误判为一次会话中的结构变化。

本批 `local-history-committed`／`local-history-policy`／`local-history-archive`／`project-save`／`document-raster-history` 五项 CTest 全部通过。唯一正式 `native/build/Release/moonsprite-native.exe` 重新构建通过，`--aseprite-save-check` 返回 0；594 文件来源覆盖、证据快照、需求静态台账及 diff 检查通过，strict 仍因真实迁移缺口失败。没有新增界面或人工界面验收。测试每次输出到独立保留的 run 子目录，成功后才更新自有 latest.txt 指针；失败样本同样保留。

复现：

```powershell
native/build/Release/local-history-committed-tests.exe native/build/local-history-committed-fixtures
node native/scripts/verify-local-history-committed.cjs . native/build/local-history-committed-fixtures
```

## 最新待写队列、计时与已准备归档的后台持久化（后续批次）

`latest_task_queue.h` 直接承接旧版 `LatestTaskQueue`：一代运行、一代可替换待写；替换待写仅更新值，所有待写调用者共享同一个 acknowledgement，完成结果不保留被替换的数据。运行失败仍在 finally 路径启动下一代，最新一代失败可重试；同步启动失败与 onIdle 失败传播也按实际旧版结果验证。

必要原生适配：runner 返回 `std::future`；UI owner 通过 `poll` 执行 promise continuation 对应的状态推进，关闭／保存可显式 `waitIdle`。acknowledgement 的 ready／get 依赖 owner 泵入完成状态，不能在同一 owner 线程停止泵入后直接阻塞等待 ack。归档打包和二进制 IO 由 `std::async(std::launch::async)` 执行，不在 UI 线程运行；同一 writer 不并发执行两个任务。队列 owner 要先 drain 再销毁，PreparedWriter 析构执行该步骤。

`PersistTimer` 保留 750ms 合并写入、初次压力请求立即到期及已排队压力请求不后移的实际规则。尤其已有普通 timer 时，压力请求保留现有 timer，而非自行提前成零延时；该行为来自旧版实际函数。timer 不提前捕获生成物，触发时由服务读取最新会话并创建不可变一代，flush 由调用方取消 timer 后提交当前会话。

`PreparedWriter` 将已有 `packPrepared` 和 `writeHistory` 接入后台，仅接收转移已经准备完成的不可变归档／增量，不用 null 伪装缺失的差量编译结果。保存标记按旧版从运行／待写请求继承，始终写入最新一代的当前指纹，队列空闲后的普通写入不再继承旧标记。身份不符或应写标记却缺少当前指纹，在替换已有待写请求前拒绝；打包／IO 失败通过 ack 传播，旧文件保持，后续待写继续运行。

验证依据：`make-local-history-persistence-fixtures.cjs` 执行旧版实际类与 schedule／flush 函数，包含旧版测试原有的 0～100 替换／共享完成结果／最新失败重试，以及首代失败、同步启动失败、idle 回调失败；另有 23 个真实旧版计时状态。原生测试通过，并验证待写被替换后不再被 ack 保留、已准备 v4 的真实后台写盘、无效请求不覆盖待写、打包失败后下一代成功、文件锁替换失败保护原文件并清理自有临时文件、空闲后重试及关闭 drain。每次运行保留独立子目录，仅成功后更新自有 latest.txt。

实际旧版读取器已接受原生后台写入并关闭刷写的 `.history`，核对原始完整快照字节、typed 增量、标签、历史位置、最新指纹和未知元数据。四项 local-history-persistence／committed／policy／archive CTest 全部通过。唯一正式 Release 构建及 `--aseprite-save-check`（退出 0）通过；599 文件来源覆盖与证据快照、需求静态台账及 diff 检查通过，strict 因已知迁移缺口仍退出 1。没有新增界面或人工界面验收。

复现（归档基础样本沿用前述生成步骤）：

```powershell
node native/scripts/make-local-history-persistence-fixtures.cjs native/build/local-history-persistence-fixtures.json
native/build/Release/local-history-persistence-tests.exe native/build/local-history-persistence-fixtures.json native/build/local-history-fixtures native/build/test-tmp/history-persistence-owned
node native/scripts/make-local-history-fixtures.cjs . native/build/local-history-fixtures --verify --persistence-root native/build/test-tmp/history-persistence-owned
```

仍未接入真实编辑会话；此模块析构仅保证已入队数据刷写，不代表尚未触发的会话 timer 自动捕获。按身份共享的全局 writeQueues、sessionWrites／latestWrites（256 条 weak 去重）、不可变快照图、缓存编译、预算重基和界面失败报告仍需按旧版接入。当前没有本地历史开关或界面激活。

## 差量应用与现有原生撤销栈

`local_history_hydration` 将已解码、已保留窗口、同 RGBA 拓扑的像素差量准备为现有 `Document::Edit` 的不可变字节补丁。沿用旧版 `hydrateLocalHistoryDelta` 的偏移、别名顺序及逆序撤销；按已有工程序列化顺序将路径映射到规范 cel，链接 cel 缺少 surface 时解析实际 owner。`celTarget` 校验索引、id、layerId 与 frameId；无目标的 layer 像素路径按当前检查点活动帧投影解析。不得据此宣称无 celTarget 的多帧视图切换语义全部验证。

原生已有整像素点／填充段无法表达旧版差量编译器产生的部分通道写入，因此增加同栈字节载荷，而非生成整像素快照或另设撤销引擎。Windows 使用与旧版 Uint8Array.set 对应的批量字节复制；非小端平台有显式通道写入后备。保持既有 LinkedPixelStorage 内容代际，走原生 undo／redo 的内容发布和录像通知；应用差量不调用选中目标图层／帧的 API。安装本身仅替换已准备历史和位置，不修改当前检查点像素、运行身份、路径、录像、dirty、内容代际或操作计数。

准备整批转移后重新检查 RestoreTicket；不支持的属性／结构补丁、错误目标／路径／边界／缓冲类型或预算失败均在替换历史前退出。调用方仍须提供正确的当前检查点及窗口，不能将此安装接口当成完整重开服务。保留旧版声明的历史 byte count，复制的像素数据限于补丁 before／after；固定调用方共享字节后续变化，避免安装后历史被改写。

回归包含八类已提交差量的原生安装／重复 UndoRedo，以及旧版实际 compileLocalHistoryDelta 生成的偏移1／2单字节绿／蓝通道转移，从起点／中间／终点恢复后导航和新编辑分支截断。互读脚本用 actual hydrate 独立执行该转移，并输出 before／middle／after 工程；独立 compiled-latest.txt 仅在生成及旧版验证成功后更新，保留此前所有 run 目录。

复现顺序：

```powershell
native/build/Release/local-history-committed-tests.exe native/build/local-history-committed-fixtures
node native/scripts/verify-local-history-committed.cjs . native/build/local-history-committed-fixtures
native/build/Release/local-history-hydration-tests.exe native/build/local-history-committed-fixtures
```

2026-11-04 本批五项本地历史 CTest 及 project-save／document-raster-history 共七项通过，旧版实际捕获／编译／hydrate 对照通过。604文件来源覆盖和静态台账通过；strict 仍为1。上一批像素差量的唯一正式程序重编译已成功，--aseprite-save-check 返回0。后续元数据与计数修正仍需单独构建和运行验证；不能以文档或静态台账代替运行结果。

未迁移：除已列 dirty／时间戳／statistics 之外的属性、改变的存储原点、非 offset typed-array replacement、结构快照及增量检查点物化、旧版无缓存差量编译、完整恢复服务与会话入口。遇到这些记录明确拒绝，不丢弃补丁后声称成功。功能继续关闭；没有 UI 修改或图像验收。

## 元数据差量与计数边界

2026-11-04 实际旧版 `compileLocalHistoryDelta` 另生成混合像素／dirty／时间戳／统计转移，以及纯元数据转移，均通过实际 hydrate 正反应用。样本在成功 run 的 compiled-metadata 目录保留；expectations.json 保存旧版应用结果，不表示原生已支持这些路径。

实际 `workspace-recording.ts` 的 `recordDocumentOperation` 函数经 TypeScript stripping／VM 执行，复用真实 `normalizeProjectStatistics`，仅 publication／usage／录像副作用设为空；8组普通／上限／越界起始值及描画活动参考写入 operation-statistics.json。明确发现现有原生 ProjectInformation 饱和策略与旧版不同：旧版本次从 MAX_SAFE_INTEGER 加一得到 2^53，下一次操作先按 safeCounter 归一化至0，再加一到1；原生目前停在上限。迁移元数据差量时必须修正并验证该差异，不能用原生当前结果充当旧版参考。

当前实现已在同一有序载荷中加入 dirty／createdAt／updatedAt／statistics 三字段及标量别名，预留所有时间戳存储容量后才开始写入。新增原生检查覆盖直接补丁、正常导航、别名重叠和上述8组计数参考，八组实际旧版参考及原生检查均已通过。统计实现已改为旧版先归一化再累加，并使用 double 重现 JS Number 的大整数时间累加舍入；蒙版 drawing 移到成功 commitMasks 后，与普通笔画一致，避免重复归一化。新增 project_information.cpp 承载原有方法定义，605文件来源覆盖通过；本批 local-history-hydration／committed／policy／archive／persistence、project-information、project-save、document-raster-history 共八项 CTest 全部通过。蒙版用例先为所属 cel 准备可见像素，满足现有创建蒙版的前置条件，不改变该应用规则。元数据与计数的正式程序重编译将和下一批结构恢复一起进行；当前正式程序已验证的是此前像素差量批次。此前七项通过结果属于上一批像素差量实现，不能代替这些新增检查。

旧版 UndoRedo 在 hydrate 应用元数据后，由 workspace touch 再设 dirty／当前 updatedAt，并由 recordDocumentOperation 归一化并增加 operationCount。原生应分别验证补丁直接应用的精确旧值，以及正常历史导航的后续操作计数，不能混为一项。原生蒙版描画目前 drawing 在 commitMasks／pushEdit 前调用，普通描画在 pushEdit 后调用；统一计数行为时必须核对这两个调用时机，避免上限处重复归一化。

## 结构恢复的实际旧版参考（原生仍未接入）

互读脚本已执行实际 restoreLocalHistory 主体、私有身份／指纹／replaceDocument helper 和 invalidateSessionContent，复用真实 HistoryStack 与归档／快照编解码，偏好值／window timer／listener／写入／diagnostic 外围钩子由测试控制。用实际 createLayer／syncActiveAnimationLayers 生成结构转移，检查完整恢复、运行身份／路径、内容代际、dirty 和导航，并保存 structural-restore/history.history、before／after 工程及 expectations.json。

实际结果区分两件事：初次加载用刚打开工程的 authoritative timelapse 对象覆盖当前检查点的旧录像；随后结构项 undo／redo 走 replaceDocument，采用该历史快照的 timelapse，运行 id／filePath／sourceFilePath 则继续保留。原生不能把“初次加载保留录像”误套为所有结构导航的规则，也不能直接调用会重置录像的备份回档作为初次安装。该参考只证明旧版行为，尚不代表原生结构恢复完成。

## 尚待实现

1. 将已实现的已提交叶子像素差量捕获及形状判断接入真实历史事件，完成结构检查点及不可变代际，保留像素差量与共享存储方案；未支持的组合／特殊编辑仍需对应检查点路径。
2. 差量编译、旧格式缓存迁移、属性／结构应用及有效历史窗口服务安装（同拓扑像素差量已接入原生撤销栈），保留身份、保存路径、录像和当前视图选择。
3. 将已实现的 750ms timer／最新待写队列／后台已准备归档写入接到真实会话，完成开关／步数、按身份共享队列、不可变快照代际、旧版去重、预算重基及正常保存／关闭时当前会话刷写。
4. 将已实现的路径身份、窗口、存储及指纹／异步代际保护接入实际加载；任何失败都不得覆盖当前作品或已有磁盘历史。
5. 实际原生入口、旧版历史互通、保存重开、并发／长时间使用和界面验收。

在这些接点完成前，FS-006 继续标为部分承接，本地历史功能不启用。

## 缓存归档的结构与增量检查点恢复（2026-11-04）

`PixelHistory::prepareArchive` 在独立候选中准备保留窗口内的结构项和当前检查点，复用原生完整工程导入与 `RollbackPayload`，不新增撤销引擎。全量检查点按索引缓存；增量链迭代回溯到完整基线后按顺序应用 `snapshotFrameId` 与已支持差量，避免长链递归。混合像素项按所在结构段解析路径，使用 manifest 标签覆盖缓存差量标签。缺少编译缓存继续明确拒绝，不把缺失数据当成结构 null。

初次安装复查 RestoreTicket，保留运行身份、工程 id、外部源路径及 authoritative timelapse，替换当前检查点和既有历史栈，发布一次内容失效，不记录新操作或通知录像观察者。只有归档增量快照存在 celTarget 时才保留独立查看帧；结构项导航则恢复历史录像、根名称和 dirty，再走现有 undo/redo 的 touch 与操作处理。普通工程备份回档保留原有名称规则。回档载荷先准备 Timeline、资源和链接图层存储，再替换现场。

工程打开与备份还原原有的完整 PreparedImport 字段装配被提取为 `project::createEditableDocument`，历史检查点沿用同一路径，包含 palette、timeline、info、references、slices、timelapse、brushes、活动图层/帧、loop、两种网格和 symmetry。

实际旧版新增对照已通过：7个完整结构检查点，保留2步时只可达3个检查点；完整→像素增量→结构→像素增量混合归档，由真实 restoreLocalHistory 安装并正反导航。原生对应测试验证每个当前位置、窗口导航、标签、根名称、身份、录像及过期票据/指纹拒绝。最新原生后端构建完成，9项相关CTest（五项本地历史、project-import、project-save、document-raster-history、project-information）全部通过，工程备份回档专项 --project-rollback-check 返回0；随后重新生成实际旧版参考，并再次运行原生结构/混合恢复检查通过。

仍有缺口：结构项成本目前采用原生载荷的栅格/资源估算，尚未等价迁移旧版递归 historyDocumentBytes；其余属性补丁、无缓存编译、会话事件/持久化接线及界面入口仍未完成。FS-006继续部分承接，本地历史功能未启用。

检查点缓冲在全部路径/名称准备完成后，从被消费的临时 Document 移入不可变回档载荷；相邻结构项和当前检查点共享同一索引载荷，避免重复保留整份 raster。准备阶段按当前独立解码候选的栅格/文本数组/蒙版/tileset/录像/参考图/笔刷字节累计限额。像素结构段定位改为单次前向扫描，长历史不逐项反向扫描。

新增 full/incremental 后台帧对照由实际旧版恢复服务证明：仅缓存差量存在 celTarget 不保留独立查看帧，增量快照存在 celTarget 才保留；原生两路径均通过。基线-only 安装、录像字节指针保持、初次安装不触发录像观察者、结构导航六次通知、过小预算和后置错误拒绝亦通过。扩展 project-import 检查发现旧测试仍要求拒绝 locked 图层，HEAD导入器已保留锁定且实际 legacy decode 明确接收 locked；改为验证锁定状态和不可描画/不产生历史，应用规则未变。

605文件来源覆盖、原始来源快照核验、需求静态台账（57需求/756入口候选/671证据/31来源）与diff检查通过；strict因已知缺口仍退出1。本批唯一正式 native/build/Release/moonsprite-native.exe 构建成功，包含此前元数据/计数及本批结构恢复代码；--aseprite-save-check 返回0。真实 std::async 工作线程上的归档准备和主线程安装专项重新编译/运行通过。没有 UI 修改或人工图像验收。

待接线时继续核对：现有 RestoreTicket 同时保护 contentRevision；原生 selectFrame 会通过 publishChange 推进该代际，即使没有提交编辑。当前查看帧用例是在捕获 ticket 前选帧，只证明稳定独立视图恢复；不代表异步读取期间切帧仍可恢复。实际 legacy 的最终 guard 主要检查 session.revision/history 对象及历史revision，需在真实服务接线时区分视图失效与真实作品变更，不能直接删掉content保护或宣称两者已等价。现有载荷应用还复用备份的运行选择清理规则，特殊图层/蒙版/瓦片选择规范化及重复链接同步成本需对照对应旧版服务钩子进一步验证。

本批正式验证日志：local-history-structural-final-tests.log（9项CTest），local-history-structural-rollback-test.log，local-history-structural-worker-build.log / worker-test.log（真实工作线程准备），local-history-structural-release-build.log / release-check.log（唯一正式构建与保存检查0）。日志均在 native/build/；所有构建进程均已完成，没有待轮询会话。

## 异步读取期间切帧的保护票据修正（2026-11-04）

上一批发现的切帧差异继续以实际旧版执行验证。新参考在 readLocalHistory 的 Promise 尚未完成时修改活动帧并投影，然后释放读取：无 documentFingerprint 的归档恢复成功并保留独立查看帧；有保存指纹时，实际 restoreLocalHistory 对仍然存活的 initialDocument 引用重新计算指纹，当前帧变化导致不匹配，拒绝恢复。VM测试直接执行实际 lexical documentFingerprint，不用另外实现的公式代替。两组参考写入 viewed-frame-restore/async-expectations.json。

原生增加仅供保护判定的 contentMutationRevision，原 renderer/录像 contentRevision 继续按所有内容发布推进。publishChange 的所有已有调用默认推进 mutation；selectFrame 在提交/取消浮动粘贴、笔画、渐变和透明度处理完成后，仅把最后一次帧投影视图发布标记为 frameViewOnly。因此真正编辑、未提交操作、预览和取消预览仍能使票据失效，不通过逐像素扫描来检测变化。RestoreTicket 改保护 mutation 代际，保存指纹在安装判定时计算当前文档，与实际旧版引用语义一致。

新增原生检查包括帧切换/返回、保存指纹区别、取消笔画后票据仍过期，以及真实std::async准备时在owner切帧后安装/拒绝两路径。回档及其undo/redo发布复用已经准备的链接存储，避免上批新增事务准备后再次同步链接图层。本批后端构建成功，9项相关CTest与备份回档专项全部通过；随后重新生成实际旧版延迟读取/结构成本参考，并再次运行原生后台准备与切帧安装检查通过。605文件来源覆盖、静态台账与diff检查通过；strict仍因已知迁移缺口退出1。本批未更新正式程序，后续与真实会话接线集中构建以避免反复重编译公共头文件影响的全部编辑器模块。上批正式程序保存检查0不代表本批代码的正式运行结果。

其余视图行为目前仍使用默认mutation保护，未宣称所有视图/特殊图层/选择规范化已等价。精确historyDocumentBytes、其余属性、无缓存编译及真实会话接线仍待继续；FS-006保持部分承接，本地历史未启用。

精确成本的后续证据：实际恢复栈 memoryBytes/latestUndoEntry.bytes 已写入结构参考 expectations.json 的 entryBytes。源码 historyDocumentBytes 通过 transfer view 遍历对象图：UTF16字符串 length×2、原始值8、容器基础32，Map逐键/值累加，seen按对象身份去重，typed view递归到整个 backing ArrayBuffer.byteLength；不等同于像素元素数，也不能用原生sizeof结构直接代替。当前仅新增独立参考，尚未实现/验证等价原生计数。

## 名称、网格与图层/组/帧标量属性（2026-11-04）

沿用实际 hydrateLocalHistoryDelta 的 scalar assignment、aliases顺序和逆序undo，将同栈补丁扩展至工程名称、animation.loop、displaySettings两个网格开关和grid四字段；layers的名称/说明/visible/locked/autoLinkAnimationCels/clippingMask；groups的名称/说明/visible/locked/clippingMask/cumulativeBlend；animation.frames的duration/disabled。图层路径按旧版bottom-to-top映射原生reverse order，group/frame索引保留序列化顺序，准备时绑定稳定ID，应用前逐个验证owner。

不调用会产生新编辑、规范化数值或更新计数的公开setter。先预留所有字符串容量，再按原有顺序写字段和像素；名称/说明使用预解码UTF32，时间戳仍UTF8，共享JS字符串别名可同时覆盖两种原生存储。整数统计与帧时长分别按原生可表达范围验证，网格坐标允许有限double，格尺寸必须正；不对合法旧值自行clamp。原生不能表示或不符合已支持状态的输入明确拒绝。派生Unicode/owner绑定存储纳入准备预算，entry.bytes仍保留旧版声明值。层/组/帧属性应用后清除既有composite order缓存。

实际旧版生成22项属性变化，并通过真实compile/hydrate正反应用，保存before/after工程、逐字段JSON预期、delta与增量.history；另以actual hydrate验证名称/图层说明/updatedAt的Unicode共享别名与后续名称补丁重叠。原生对照覆盖直接应用、普通undo/redo、增量检查点物化和安装后导航。最终包含字符串别名与派生存储预算的后端构建完成，9项相关CTest及备份回档专项通过；最新原生提交样本重新交实际旧版验证，再运行原生hydration专项也通过。605文件来源覆盖、需求静态台账与diff检查通过；strict仍因已知缺口退出1。

仍未覆盖：其余属性（含opacity/blend、cel属性、活动视图/panel state、资源/蒙版/瓦片/录像等）、对象/整typed-array replacement、变化的存储原点、无缓存编译、精确结构成本与真实会话接线。未启用本地历史，本批正式程序未重构建；当前正式exe仍是之前已验证的结构恢复批次。


## 透明度、混合模式、cel 属性及数组顺序（2026-11-04）

同栈标量载荷继续扩展 layer/group 的 opacity、blendMode 和 cel 的 opacity、zIndex。准备阶段检查有限单位透明度、原生支持的混合模式和 int 范围整数；cel 属性绑定实际 cel ID，不套用仅像素补丁使用的 linked owner 回退。实际 hydrateLocalHistoryDelta 仅在 delta 带 celTarget 时调用 projectHistoryAnimationFrame，因此原生也仅在该条件下投影当前帧透明度，不把普通属性补丁中的原始 layer.opacity 覆盖掉。

实际旧版脚本通过 createLayer、addBlankAnimationFrame、linkAnimationFrameCels、compileLocalHistoryDelta 和 hydrateLocalHistoryDelta 生成双图层双帧的普通/关联参考，以及仅含 cel 属性的 celTarget 投影参考。关联源必须有可见内容：原夹具误选空白图层，旧版明确返回 false；改用绘有像素的图层，并断言 linkedCelId 和 resolveAnimationCel 的真实源 ID。

原生初次对照暴露原适配器的索引错误：旧版动画数组可以按追加顺序排列，不保证按图层×帧排列。真实参考中 cel-3 被写入 cel-4 的 opacity/zIndex。修正捕获/形状判断、恢复路径以及工程序列化，全部保留实际 state.cels 数组顺序；图层单独使用 reverse stacking 映射。工程编码仍复用原有栅格生成，在序列化前按稳定 ID 恢复实际 cel 顺序。新增保存重开后再应用同一索引差量的回归，不能只按 ID 比较工程内容来掩盖序列变化。

本批9项相关CTest全部通过；再次用新原生提交样本运行实际旧版互读，并重跑原生hydration与备份回档专项，均通过。605文件来源覆盖、需求静态台账和diff通过，strict因已知缺口仍退出1。唯一正式程序 native/build/Release/moonsprite-native.exe 重编译成功，--aseprite-save-check 返回0；该程序包含此前帧代际保护、基础标量与本批opacity/blend/cel及数组顺序修正。日志local-history-numeric-release-build.log / release-check.log。后续数值边界新增检查/修正不由此结果代替。其余资源属性、对象/完整 typed buffer 替换、变化原点、精确结构 historyDocumentBytes、无缓存编译与真实会话接线仍待完成。FS-006 继续部分承接，本地历史入口未启用。无 UI 修改或图像验收。


下一处原点迁移证据：实际 hydrateLocalHistoryDelta 在无 celTarget 时，补丁应用后按图层序列调用 setLayerStorageOrigin；document-model.ts 的 setter 只对 layerStorageOrigins WeakMap 写入截断整数。它不修改 animation.cels 的 surface storageOrigin/offset。原生目前只有规范 cel surface，不能以修改 surface 字段冒充这一独立图层视图状态；该分离语义仍未实现，继续明确拒绝变化原点。


## 数值边界的保存语义对照（2026-11-04）

实际 compile/hydrate 对 zIndex=1000/-1000/INT_MAX/INT_MIN 保留原始整数；actual encode/decode 在克隆候选上生成的工程则为999/-999/999/-999。夹具同时覆盖 cel opacity 0/1 和 group opacity 0，保留 raw after 与 encodedAfter 两套独立预期，不用原生clamp公式代替旧版结果。新增保存重开与live raw state不变的原生检查已编译，初次运行真实复现 native cel-2 zIndex=1000，旧版encodedAfter=999。project_encode已改为复用normalizeCelZIndex生成保存字段，并在raw值为0时移除旧字段；现场和历史载荷继续保留原始整数。修正后的后端构建与9项相关CTest全部通过；真实旧版参考重新生成后，原生hydration（含边界、增量归档、raw导航与保存重开）和工程备份回档专项均通过。现场raw值在编码前后精确相等。唯一正式 native/build/Release/moonsprite-native.exe 增量重编译成功（23167488字节，2026-11-04 02:37:06 +08:00），--aseprite-save-check返回0。605文件来源覆盖及原始证据快照、需求静态台账（57/756/671/31）与diff通过；strict因既有缺口仍退出1。日志local-history-numeric-boundary-*，包括initial-test中复现的1000/999差异、tests中9项通过、legacy-final/hydration/rollback和release-build/release-check。所有构建和验收进程已完成，无待轮询会话。无UI修改或人工图像验收。FS-006仍为部分承接。


## 独立快照链预算与不可变重基（2026-11-04）

新增local_history_budget.h/.cpp，直接承接legacy/core/local-history-budget.ts的document/archive/{base,delta}联合、256MiB软阈值、每增量的delta.bytes+patchCount×192+originCount×64+512、archive.byteLength和按对象身份去重的迭代前缀计数。超过阈值只物化第一个可见增量检查点，并按可见顺序重接其后可达链；不删除可见步骤，不把阈值当硬内存上限，也不强制压缩首项为完整文档/归档的历史。

替换表保留JS Map的首次插入顺序与平均常数时间查找，更新不重排key。它强持有旧key直到shape/cache转移结束；重基保留原不可变delta对象，全部准备完成后才替换可见向量。在途generation继续持有旧向量，物化/准备失败不发布半条新链。原生以shared_ptr/weak_ptr承接引用身份，用无额外分配的线程局部删除队列避免长base链析构递归；增量入链时冻结JSON/补丁字节，权重按节点缓存，文档成本计算抛错后可重试。只接收已完成的原生检查点，不携带普通UndoRedo或正在进行的操作，不另造撤销引擎。

完整文档historyDocumentBytes仍是明确依赖，未用sizeof或资源估算替代。测试注入实际旧版记录的完整文档成本，只验证图遍历/预算/重基算法；这不证明原生递归文档计数已经迁移。真实快照捕获/预算调用、物化回调、shape/delta缓存转移、压力编码与持久化完成后的重基仍需服务接线。本地历史入口继续关闭。

独立参考直接提取并执行local-history-multiframe.test.ts导出的multiframeFixture，调用真实beginPixelEdit/recordPixel/commitPixelEdit/captureCommittedHistoryDelta，沿用120次编辑/裁掉前117步的原用例。实际enforceLocalHistoryBudget、localHistoryRetainedBytes、historyDocumentBytes和materializeLocalHistorySnapshot生成compiled-budget参考；另覆盖阈值相等、重复身份/共享前缀、非拓扑可见顺序、共享同一archive字节的不同节点、首项完整检查点的压力及空历史。原生比较计数、替换key顺序、base/delta身份，复用既有原生raw历史应用和DocumentSnapshot比对检查点像素0xff000075与末端0xff000078；检查在途代际不变、失败保留原链、旧前缀只有在映射/在途引用释放后才能回收，以及30000层base链的迭代遍历/释放。

后端构建完成，10项相关CTest全部通过（六项本地历史及project-import/project-save/document-raster-history/project-information）；重新生成最新实际旧版参考后，budget和hydration专项再次通过。日志local-history-budget-final-build.log、final-tests.log、legacy-final.log、reference-final.log、hydration-final.log，位于native/build/。608文件来源覆盖/原始快照核验、需求静态台账与diff检查通过，strict因既有缺口仍退出1。本批不涉及运行入口/界面，未重编译正式exe；唯一正式程序仍为前批2026-11-04 02:37:06、保存验收0的版本。无UI/人工图像验收。

整段数组/几何迁移的接点仍保留：实际hydrateLocalHistoryDelta仅对offset像素补丁提供linked-cel无surface的owner回退；无offset整数组替换会通过literal parent赋新数组，并按aliases共用同一新值。图层投影视图与cel surface可以独立变化，不能把整数组替换一律变为规范cel向量的原地覆盖，或把图层origin/geometry直接混同cel字段。需要先承接这一视图/存储分离语义；本轮没有把近似实现登记为已迁移，也未移除这些需求。

## 完整成本的对象图计数核心及实际参考（2026-11-04）

新增local_history_cost.h/.cpp，将实际historyDocumentBytes的size遍历迁移为原生逻辑对象图计数核心：原始值8、UTF16代码单元数×2、对象/数组/Map基础32；只对对象身份去重，Map按键/值插入次序遍历，typed view包含DataView递归到整个底层ArrayBuffer，零长度视图也计完整backing store。数组只遍历实际可枚举值，属性名/非枚举字段/Symbol不计。使用显式frame栈保留递归reduce的子树分组与double加法次序，避免深链调用栈溢出；像素仅记录buffer长度，不复制内容。无效edge、view backing及Map奇数键值对明确拒绝。

verify-local-history-committed.cjs调用真实historyDocumentTransferView导出15个逻辑对象图，保留undefined、UTF16含孤立代理项、对象/视图/缓冲身份、Map键值、环及枚举次序；预期成本直接来自真实historyDocumentBytes，而非手写公式或原生估值。覆盖原生样本经旧版decode后的point/dense/sparse/linked/inactive、实际multiframe活体及checkpoint、共享与独立缓冲、同一surface对象、indexed、Unicode、旧版sparseHistoryDocument相同4000px输入、已展开但仍有旧runtime字段，以及明确标记的Map/环/短视图/稀疏数组/隐藏字段探针。两种稀疏surface计数和导出后均保持未物化，原pixels getter身份不变。实际transfer为每个不同surface分配独立4字节占位buffer，而共享runtime仅计一次，不能简单省略占位buffer。已物化surface的旧runtime字段被transfer删除。

本批实际原生对照结果：dense共享缓冲41774、独立第二缓冲81774、UTF16追加五代码单元41784、同一surface对象41702、4000px共享稀疏runtime34154字节；数字含该输入的实际默认字段，不应作为其他文档的固定常量。原生另覆盖重复primitive/string仍逐次计数、对象/缓冲去重、异常输入、超过2^53时的子树加法分组、30000节点环迭代遍历。

Release后端目标local-history-cost-tests构建成功；首次测试编译因Windows GetObject宏污染WinRT GetObject失败，按既有测试的#undef GetObject适配后通过。重新运行全部实际旧版生成/行为断言后，local-history-cost、budget、hydration三项CTest全部通过。611文件来源覆盖和新增原始证据快照、需求静态台账57/756/671/31及diff检查通过；strict因已知缺口仍退出1。日志native/build/local-history-cost-{build-final,legacy-final,tests,ctest,provenance,strict}.log。未修改UI、未重编译正式exe、无人工/截图验收。

边界：本批只证明计数核心对实际旧版transfer图精确等价，尚未实现native Document到该图的字段/共享关系适配。JournalSnapshot仍要求外部DocumentWeigher，旧budget测试仍注入actual oracle；结构entry.bytes仍用原生估计。本批不把通用遍历冒充完整文档计数，不启用本地历史。后续须映射Document全部可枚举值、字段存在性、容器和共享存储关系，对照相同真实文档图，再接入快照和结构成本；真实会话/写后重基/缓存/持久化等原缺口继续保留。


## 原生 Document 资源字段的精确成本适配（2026-11-04）

新增 local_history_resource_cost.h/.cpp：appendDecodedHistoryResources 直接从当前原生 Document 读取 palette、paletteOrder、paletteSlots、paletteColumns、nextColorId、customBrushes、referenceImages、slices，在既有逻辑图中追加旧版 decodeProject 的资源字段形状。不是读取 sourceArchive 中的旧资源值，也不通过编码整个工程或拷贝 UndoRedo 获取成本。只读取像素容器长度和共享身份；不扫描/复制画笔覆盖、颜色或参考图像素。UTF8/UTF32 字符串转换为 UTF16 计数；参考图共用 shared_ptr<vector> 时保留同一逻辑 view/backing 身份。准备失败收回全部新增节点，不更改先前图边。

明确承接旧版解码形状：每个自定义画笔总有可枚举 colors、sourceX、sourceY，即使其值为 undefined，也分别按原始值8计数；colors 有效时计整个独立Uint32缓冲。source坐标为undefined/0/负整数均不改变原始值成本。色卡只计旧版工程数据，不计原生选中颜色/前景背景角色；切片不计原生切片选中状态；画笔不计原生绘图预览缓存。该接口仅提供解码后资源字段，不能代替新建或任意运行时对象的字段存在性/跨模块共享关系。

实际旧版脚本新增五组 encodeProject/decodeProject 资源样本：空资源、中文/非BMP名称与不同顺序/空槽色卡、灰度/彩色画笔及源坐标、两参考图/两切片、明确共享像素视图、解码后直接重命名及删除、改变后的资源。资源图预期由实际 historyDocumentTransferView 和 historyDocumentBytes 产生；旧版声明 undefined 字段的存在性另行断言。原生用正式 project reader/import 构造 Document，并执行对应实际资源修改，随后从当前 Document 构图；同时比对整个资源 envelope 以及所有字段的独立子图成本，防止不同字段误差抵消。检查共享参考图视图索引、读取前后revision/history不变及画笔coverage底层地址未变。无效UTF8资源名在准备中抛错，已有图大小/根边/成本保持不变。

实际资源 envelope 成本分别568、1207、1191、1175、1113字节；envelope专用根及空layers亦包含在测试内，不是完整文档成本。20组实际旧版逻辑图（原15组加5组资源）及原生资源对照通过；Release后端构建成功，cost/budget/hydration三项CTest通过。613文件来源覆盖及原始快照、需求静态台账57/756/671/31、diff检查通过，strict因原迁移缺口仍退出1。日志 native/build/local-history-resource-cost-{build-final,legacy-final,tests,ctest,provenance,strict}.log。所有进程已完成，无待轮询句柄。

完整适配仍缺根字段存在性、图层/组/动画/蒙版/瓦片、完整录像和栅格共享布局；旧版重开时raw视图有时保留整个ZIP backing，不能按原生独立vector长度冒充同一个对象图。JournalSnapshot完整DocumentWeigher、结构entry.bytes和真实服务接线尚未完成。本批未改UI、未重编译正式exe、无人工/截图验收，本地历史继续关闭。


## 缩时录像对象与 ZIP 缓冲来源的成本适配（2026-11-04）

appendHistoryRecording 直接从原生 Document 的规范化录像设置生成逻辑图，承接 enabled/recordUndoSteps/quality/fps/speed/mode/snapshots 及每帧 id/capturedAt/elapsedMs/width/height/changeScore/data、可选 local。解码后的 changeScore 即使为 undefined 也有可枚举字段，按原始值计数；本地库帧仍带独立的零长度 data typed view。local 按 store/chunk/offset/length/checksum 对象计数。不读取本地库、不解码PNG、不复制录像字节，不计会话/队列/最近导出状态；最近导出状态本来就不属于旧版文档 timelapse 字段。

核对实际 projectZipEntryData/storedTimelapseEntryViews 后确认，存储方法0的PNG是同一ZIP输入的子视图，计数整个输入 backing ArrayBuffer，多个帧只计一次；方法8的PNG解压后各自持有独立缓冲。旧原生 Frame.data 只有单独复制的PNG vector，丢失来源，因此新增只读 HistoryDataBacking：原始归档 shared_ptr 身份和原视图长度。Archive.storedBacking 在现有 read 校验后提供方法0的输入归档，方法8无归档backing；原生PNG读写/像素/安全校验均沿用，不改变工程格式，不把该来源字段序列化。它只补齐历史成本所需的旧版逻辑存储关系，不宣称已把原生PNG存储改为零拷贝。

实际迁入本地库成功确认并释放 data 时清除来源；失败保留 data 和来源，重试成功再释放。Session.portable 和编辑器后台携带录像保存通过 reader 替换为独立字节后清除来源；无reader且保留原嵌入字节时保留来源。尺寸不符/空来源等陈旧元数据在构图阶段明确拒绝，失败回收全部新增节点，不将旧来源错误计入新字节。资源builder现在分别维护view与buffer身份，多张PNG共用ZIP buffer时各自仍为不同view。

实际旧版脚本新增10组录像envelope：空录像、存储/压缩/混合ZIP、本地库/本地加嵌入、显式迁库/独立字节副本/删除帧/运行时设置变化。使用真实 encodeProject/decodeProject、fflate ZIP、historyDocumentTransferView/historyDocumentBytes；PNG仅为独立生成的有效1px样本。期望内含真实各帧 backing 长度及是否共享输入ZIP。原生用正式 reader/import 开文档，执行与显式参考探针对应的数据变化，再从当前Document构图，核对整个envelope、设置字段和每个快照字段的独立成本；不注入旧版成本。真实 DocumentSnapshot 捕获/finish 后复核录像成本不变、来源关系保留，检查点无撤销栈/recording binding。计数不改变revision/history或PNG地址。陈旧来源长度拒绝不破坏已构好的图。

本次实际存储样本两帧共享2616字节ZIP；压缩帧各自70字节，混合样本是2609字节ZIP加70字节独立PNG。含测试专用根/空layers的envelope成本：empty182、stored2954、deflated478、mixed3017、migrate-first3038、portable478、remove-first2872、live-settings2956、local-only506、local-and-embedded2905。它们是该次真实输入的结果，不是完整文档成本或生产常量。迁库/独立字节探针为明确的数据变化对照，不冒充整个旧版迁库/portable服务执行；另外原生真实Session测试覆盖成功/失败/重试/portable来源清理，真实工程恢复/保存重开检查来源绑定对应输入/输出归档。

后端Release构建及6项CTest通过：local-history-cost/budget/hydration、timelapse、timelapse-restore、project-save。实际旧版验证生成30组逻辑图（原15+资源5+录像10）并全部原生对照通过。613文件来源覆盖及原始证据快照、需求静态台账57/756/671/31、diff检查通过；strict仍因原缺口退出1。日志 native/build/local-history-recording-cost-{build,legacy,tests,timelapse,regression-build,ctest,provenance,strict}.log。构建句柄61176和回归构建55503均已退出0，无待轮询进程。

尚未组装完整文档根/图层/组/动画/蒙版/瓦片/栅格字段，也未完成跨这些字段的全局buffer身份映射。完整DocumentWeigher、结构entry.bytes及真实历史会话接线仍待迁移。正式程序未在本批重编译；后台saveTick清除来源是源码适配，本批未运行正式编辑器携带保存入口验收。唯一正式exe仍为前批02:37已验版，不把后端CTest当桌面运行证据；无UI/截图验收，本地历史继续关闭。


## 跨字段身份与初始解码栅格存储布局（2026-11-04）

将原资源/录像内部builder抽为共享 HistoryCostBuilder，完整图构建时各字段必须使用同一个builder；分别维护object/view/backing身份，按旧版seen语义构造共享节点。平均常数时间身份查找，Unicode/缓冲长度规则沿用既有核心。追加事务mark同时记录图节点和新插入的身份项；失败同时撤销两者，避免身份表引用已被截掉的节点。原Graph-only API只用于独立片段，完整图应使用新增共享builder重载。回归包含新backing已插入后发现旧view绑定冲突的失败，再回滚/重试并重新使用原view，以及具名object身份回滚。

新增 local_history_raster_cost.h/.cpp 的 DecodedHistoryRasterStorage，从已验证ReadManifest准备初始RGBA解码存储布局，缓存键直接对应旧版decodePixels的文件/encoding/format/尺寸（原生本适配仅RGBA）。raw视图按同一cache key共享typed view；不同视图可共享同一底层文件buffer，ZIP方法0使用原始sourceArchive身份/完整长度，与录像PNG共享时全图只计一次；方法8使用该文件独立解压缓冲长度。原生图层堆叠顺序不在此重设计；调用者用原始manifest字段索引指定待映射surface。

sparse布局保留共享runtime对象、独立payload副本长度、ceil(width/64)×ceil(height/64)的Int32偏移表缓冲及visibleBounds对象/空值，直接承接实际decodeSparseRasterData；每次不同surface的transfer新建4字节pixels占位buffer，不将共享runtime误等同于共享占位pixels。准备阶段复用既有Archive校验/解压，验证稀疏header/尺寸/串行payload/table/重复slot/裁边/边界，不展开/复制原生dense像素。布局及文件/slot缓存使用平均常数时间unordered容器，稳定节点引用使重哈希不改变身份token。追加阶段不再读解压文件或扫描像素。该计划须在共享builder完成期间存活。

真实旧版新增六个混合storage+timelapse对象图：raw存储/压缩、65×65右下角单像素稀疏存储/压缩、65×65空稀疏存储/压缩。通过真实encodeProject/decodeProject/historyDocumentTransferView取出surface storage，然后真实historyDocumentBytes生成envelope期望；检查raw layer/cel同一typed view及与PNG共享ZIP、sparse共享runtime但占位buffer不同、旧版surface未物化。原生正式reader/import读取同一工程，以共享builder分别按先录像和先栅格两种准备顺序生成相同字段图，对照整个envelope及每surface独立成本。复查重复raw请求复用view，重复sparse请求复用runtime并新建占位，未登记布局拒绝不破坏既有图/身份。测试强制至少36组原始参考和六个storage对照，防止旧夹具未更新而漏跑新分支。

当前六个envelope实际结果：raw-stored3055、raw-deflated590、sparse-stored3339、sparse-deflated760、empty-sparse-stored3254、empty-sparse-deflated700字节；包含测试专用根、空layers、storage包装及录像，并非完整文档成本。原36组逻辑图（15基础+5资源+10录像+6跨字段存储）全部通过；Release后端目标构建、cost/budget/hydration三项CTest通过。首次新测试编译因同一auto声明混入size_t与Mark而失败，拆分声明后构建/检查通过。615文件来源及原始快照、需求静态台账57/756/671/31、diff通过；strict仍因已知缺口退出1。日志native/build/local-history-storage-cost-{legacy,build-final,tests,ctest,provenance,strict}.log。所有构建句柄均已完成，无待轮询进程。

范围仍为初始解码的栅格存储部分：不覆盖后续live像素替换/拓扑变化、附加mask解码归一化、特殊图层重渲染，也没有把native现有dense展开宣称为旧版lazy稀疏性能迁移。完整根/层组/动画/蒙版/瓦片字段、运行时字段存在性与来源生命周期、图构建的整体预算、DocumentWeigher/结构entry.bytes及实际历史服务仍未接完。正式exe本批未重编译，未修改UI/运行入口，无人工/截图验收，本地历史保持关闭。


## 解码时间轴元数据与瓦片集成本（2026-11-04）

在既有资源适配模块增加 appendDecodedHistoryTimelineMetadata，共享 HistoryCostBuilder 事务和身份表，直接读取当前 Document 的帧、循环区间、活动帧、整体循环及瓦片集。依据 animation.ts 的 normalizeFrame/normalizeAnimationTimeline、animation-loop-sections.ts 和 project-format-decode.ts：启用帧只包含 id/duration，禁用帧追加 disabled；循环区间依次包含 id/name/startFrameId/endFrameId/direction/repeatCount，null repeatCount 仍计一个primitive；瓦片集包含id/name/四个尺寸参数/tileIds/tileSlots/pixels，空槽位计primitive，像素使用解码后独立复制buffer的身份与完整长度。数值与布尔成本均为8，字符串按UTF16长度计算。直接读现有容器，不复制像素、不编码ZIP、不拷贝撤销栈。

实际legacy编码/解码新增四组工程及真实historyDocumentBytes envelope：defaults236、frames-loops760、live-metadata774、tileset-layout1144字节。它们包含测试包装和空layers，不是完整Document成本。覆盖非BMP帧ID/循环名称、禁用字段有无、四种direction、null/有限repeatCount、当前活动帧、现场duration/loop/名称修改，以及两个独立瓦片集和含null/尾部空位的槽位表。原生使用正式reader/import读取相同工程，对照整体与各字段独立成本，并检查计量不改变revision/history/像素地址。最后一个tileset预置冲突buffer长度后，验证整个追加事务回滚且清除此前新增身份，撤销冲突后重试成功。

40组真实legacy图与原生对照通过；Release local-history-cost-tests构建及cost/budget/hydration三项CTest通过；615文件来源覆盖与源快照、57/756/671/31静态需求台账、diff检查通过，strict按已知缺口仍退出1。构建/测试/CTest/来源/strict日志位于native/build/local-history-timeline-cost-*.log。首次参考脚本因重复metadataDirectory局部标识符未运行，改为timelineCostDirectory后真实生成通过；无待轮询构建句柄。

本适配仅描述规范化解码字段形状，不代表任意live JS optional字段或对象别名拓扑。根/图层组/cel/蒙版及其他元数据、完整共享图装配和live栅格来源生命周期仍需迁移；尚未接入JournalSnapshot DocumentWeigher、结构entry.bytes、历史缓存/预算/写后重基和真实恢复服务。FS-006继续partial，本地历史UI保持关闭。未构建正式exe，无界面运行或截图验收。


## 图层组字段形状与样式成本（2026-11-04）

增加 DecodedHistoryGroupShape，从已验证 ReadManifest 的manifest元数据一次准备父组字段存在性；append读取当前原生组name/order/displayColor/description/parent/visible/locked/opacity/blend/clipping/cumulative及完整规范化layerStyles。legacy normalizeLayerGroups区分parentGroupId缺省和显式null，原生optional父组ID不足以区分；本计划保留此差别，缺省不添加节点、null计8、有效父ID按UTF16字符串计量。组ID/顺序/父拓扑变化时事务拒绝，不沿用旧计划计数。未扩张Document公共结构，不以源manifest旧样式覆盖当前原生值。

layerStyles直接映射既有ColorOverlayStyle：enabled、gradientMap（stops/position/color/mode/dither/reverse/enabled/scope）、stroke（color/size/position/kernel/eight directions/smartHue/darkness/followOpacity）、shadow、innerGlow、colorOverlay、gradientOverlay。复用既有GradientMapPresetStore的9种dither名称，承接三种position与四种kernel的实际字符串长度；不解析preservedJson来代替当前样式。颜色为独立四primitive对象；无像素读取/复制或撤销栈复制。WinRT准备阶段沿用现有parser的COM初始化配对与仅首次初始化清理factory cache规则。

七组实际legacy encode/decode/historyDocumentBytes对照，含空组、缺省父组、null父组、嵌套/可选字段、默认样式、现场修改探针与九种样式组合。envelope实际成本依次96/184/192/394/1352/1416/38988字节；仅测试包装，不是完整文档成本。缺省与null相差8。样式覆盖9种dither、4种kernel、3种position、continuous/steps、256个stop上限。现场探针在legacy decode后修改name/blend/kernel/position/stops/dither；原生从同一manifest准备shape后，使用修改后的PreparedImport构造Document验证读取当前值（不声称已执行完整live UI编辑路径）。整体及每个group字段独立成本一致，计量不改变revision/history。后期group ID不符或最后一个style非法dither时，检查图/既有边保留、追加回滚且可重试。

47组真实legacy图及Release原生对照、cost/budget/hydration三项CTest通过；615来源覆盖/源快照、57/756/671/31需求静态台账和diff检查通过，strict因已知缺口退出1。日志native/build/local-history-group-cost-{legacy,build-final,tests,ctest,provenance,strict,toolchain}.log。暂停恢复期间vswhere无已登记VS实例，原安装和cl/MSBuild仍在；依据安装state.json记录的17.14.37827.9在原native/build显式配置CMAKE_GENERATOR_INSTANCE的version后恢复构建，未建立新工程/预览产物。中间旧测试程序对新样本未通过不计为验收；最终重新编译的47图全部通过，所有构建句柄已完成。

仍未覆盖任意live JS字段存在性和对象alias生命周期；目前按规范化初始decode形状构图，不能将删除description等变动直接等同于legacy留下空属性的状态。完整根/图层/cel/蒙版等字段、live栅格来源生命周期、整体构图预算、DocumentWeigher/结构成本/服务接线仍未完成。FS-006保持partial，本地历史UI不启用；本批无正式exe重编译、UI运行或截图验收。


## 初始普通RGBA图层/cel完整对象图（2026-11-04）

增加 InitialHistoryRasterObjects，保留经验证的共享ReadManifest和DecodedHistoryRasterStorage，以同一HistoryCostBuilder构造普通RGBA图层/cel对象与共享缓冲。图层按manifest顺序构造独立投影对象，不能复用cel.surface对象；只为活动图层显示存储解析链接源，cel对象本身保持原始array顺序、自己的linkedCelId/zIndex/opacity以及surface有无。逐项承接decodeProject的description、groupId null、显示色、自动链接/linkedContent/clipping、可选样式、四个几何数字、format/pixels/runtime；cel明确text:undefined，独立surface有六个几何/storageOrigin数字。复用已验raw/sparse存储身份：raw同一视图共享完整原ZIP或独立解压buffer，sparse同runtime但各surface有独立4字节占位。

该计划限定初始正式导入结果，绑定不移动的Document地址、revision、活动帧及sourceArchive，不允许作为live DocumentWeigher使用；导航到其他帧、修订改变、其他Document均拒绝。保留manifest/schema证据和存储身份令牌直到构图结束。特殊层/背景/adjustment/text/tilemap/free-tile和蒙版明确拒绝，尚未冒充这些功能已迁移。Document应由对应manifest通过正式prepareEditableImport/createEditableDocument创建；本路径并不检测任意绕过正常修订机制的内部原地变动。

新增八组实际legacy完整layer/cel/recording envelope，沿用六组raw/sparse/空sparse存储/压缩工程，并加入两层两帧（逆转cel数组、非BMP名称/描述、组/显示色/自动链接/clipping/默认样式/opacity0/zIndex）及没有自有surface的链接cel。期望直接来自真实encode/decode/historyDocumentBytes，不手填native估值；真实transfer同时投影layers和animation.cels。原生正式reader/import使用相同工程，分别先构录像/先构对象，对照整个envelope、独立layers/animation/recording子树及每个layer/cel的每个字段成本。验证计量不改revision/history；外部Document/切帧/修订拒绝后图不变，原ZIP预置冲突长度引发后期追加失败后回滚并可重试。

八个envelope成本为3395/930/3679/1100/3594/1040/2690/2588字节，不是完整Document成本。累计55组真实legacy对照及Release目标构建通过，最终cost/budget/hydration三项CTest通过；615来源覆盖与原始快照、57/756/671/31需求静态台账、diff通过，strict仍因已知缺口退出1。日志native/build/local-history-raster-objects-{legacy,build,build-final,tests,ctest,provenance,strict}.log。所有构建句柄已完成。

仍待完整根/其他元数据与特殊层/cel/蒙版对象、任意live字段及独立投影/存储生命周期、全图预算、JournalSnapshot DocumentWeigher/结构entry.bytes、真实缓存/捕获/预算/写后重基/恢复服务接线。本路径只推进初始解码对象构图，不能证明native已承接legacy稀疏性能或任意live恢复行为。FS-006保持partial，本地历史UI继续关闭；未重编译正式exe，无UI运行/截图验收。


## 初始解码图层/组蒙版成本（2026-11-04）

InitialHistoryRasterObjects继续承接decodeMask的真实字段，新增layerMasks/groupMasks两个根。每slot包含owner ID/frame ID/mask，mask包含id/解码语言name/空description/visible/locked/opacity/blendMode/四个几何数字/format/pixels/ownerKind/ownerId/可选linkedMaskId和autoLinkAnimationCels。decodeProject最终重新分配mask对象，moveWithOwner字段缺省；不能按之前normalizeLayerMask临时对象的字段计数。原生timeline将moveWithOwner保留为默认true，但本初始形状不凭native成员存在而添加该字段。

每个decoded mask在decodeMask中始终独立分配width*height*4字节RGBA buffer，灰度1字节输入也扩成4字节，即使链接到其他mask或同一resource文件也不共享buffer，不能沿用普通raw栅格/录像的原ZIP共享规则。直接按现有native mask surface存储长度构图，不扫描/复制像素、不读取ZIP。构造时对照已验证manifest/native slot ID/owner/frame/group顺序，并要求传入HistoryMaskNames（实际decoder语言的层/组名称）；缺失则拒绝，不能将UI标签/文件名当作蒙版真实name。仍绑定同一Document/revision/活动帧。

新增七组真实legacy layer/cel/mask/recording组合envelope：RGBA存储/压缩、标量灰度存储/压缩、共享resource+链接mask、被显式slot覆盖的旧cel内嵌mask、英文解码。中文与英文通过真实setRuntimeAppLocale/decodeProject生成实际name；测试从真实解码记录名称，明确保留为调用方的解码上下文依赖，尚未接成native会话locale生命周期。旧版每mask无moveWithOwner、独立全长buffer且不共享archive逐项断言。原生正式reader/import对照全envelope、所有slot和mask字段，两种录像/对象构建顺序成本一致；检查三个16字节mask backing彼此独立。真实legacy解码首像素同时对照native结果，验证透明非零RGB清零和标量灰度扩为不透明RGBA。

七个测试envelope成本为5916/2030/5880/2030/5700/6079/5962字节，不是完整Document成本。首次共享resource测试改写引用后保留无用旧文件，被native现有unmapped resource准入规则拒绝；生成样本时去除内存中的无引用文件后重新生成真实legacy参考，未放宽产品准入或删除工作区用户数据。累计62图及Release目标构建、cost/budget/hydration三项CTest通过；615来源覆盖/源快照、57/756/671/31需求台账/diff通过，strict仍1。日志native/build/local-history-mask-cost-{legacy,build,build-final,tests,ctest,provenance,strict}.log，所有构建句柄已完成。

本批仅初始解码蒙版形状；不代表live蒙版重命名/空字段保留/像素替换/别名或链接编辑后的生命周期已迁移。完整根/其他元数据/特殊图层与cel、整体图预算、DocumentWeigher/结构成本/真实历史缓存捕获预算重基恢复服务继续待完成；本地历史UI保持禁用，FS-006仍partial。无正式exe重编译或UI运行/截图验收。


## 初始根部元数据形状（2026-11-04）

增加InitialHistoryDocumentMetadata，准备一次经验证manifest中的outlineSettings和持久化layerPanelState形状；追加name/activeLayerId、displaySettings/statistics、native实际createdAt/updatedAt字符串及上述两个字段。显示设置包含两个primitive开关/四primitive网格，只有原解码元数据存在有效symmetryCenter时才包含二primitive对象。统计固定三primitive，原生实际归一化counter值另对照真实legacy结果。outlineSettings遵循normalizeOutlineSettings：无有效对象时缺省，数组对象按默认值归一化；两个颜色对象、厚度、规范化position/kernel字符串、八方向对象及四个开关/百分比primitive。此处构造用于成本的逻辑值形状，不另造绘图算法。

layerPanelState直接迁移normalizeProjectLayerPanelState的有序有效ID过滤/去重、activeLayer回退、selectedGroup归属与anchor回退、空选择补活动图层、collapsed过滤。它是独立的文档内持久化字段，不能用native当前timelineSelection/selectedGroup覆盖；当前native尚未完整恢复这份字段，成本适配从保留的manifest作初始解码归一化，不能视为界面恢复功能已迁移。计划绑定同一Document/sourceArchive/revision/活动帧/活动图层，陈旧或外部调用拒绝；其他任意绕过正常修订机制的修改不在初始计划契约内。

新增九组实际legacy编码/改写manifest/真实decode/historyDocumentBytes envelope，覆盖默认、非BMP名称/时间戳、显示/对称中心、最大安全counter与非法值、双图层/组选中及无效重复ID、组选中专属回退、数组panel/outline、三种position/四种kernel和非法枚举归一化。测试比较整个envelope成本、全部节点kind、字符串内容、字段顺序和子项数量，避免等长ID或总成本巧合掩盖形状错误；检查native实际统计、计量不改revision/history。非法UTF8 updatedAt导致后期追加失败时回滚并可恢复重试；切换活动图层或修订改变后拒绝陈旧计划。

九组envelope成本660/700/664/980/978/982/984/984/980字节，不是完整Document成本。累计71组legacy图及Release后端构建、cost/budget/hydration三项CTest通过；615来源覆盖/源快照、57/756/671/31需求静态台账、diff通过，strict仍1。日志native/build/local-history-root-metadata-{legacy,build,build-final,tests,ctest,provenance,strict}.log。全部构建句柄已完成；正式exe仍2026-11-04 02:37:06、23167488字节，无本批UI运行/截图验收。

完整根装配（身份/字段存在性/所有跨字段关系）、特殊图层与cel、任意live投影/像素/字段生命周期、全图预算、DocumentWeigher/结构成本/历史缓存捕获预算重基恢复服务仍未完成；持久化面板与outline的native运行状态接线也未完成。FS-006保持partial，本地历史UI继续禁用。


## 完整初始文档根图组装（2026-11-04）

增加InitialHistoryDocumentCost，将已验证的初始RGBA raster/mask、group、resource、timeline和root metadata适配器通过同一HistoryCostBuilder组装为完整文档根。根字段顺序直接按decodeProject：schema/id/name/尺寸/mode/pixelFormat/layers/groups/activeLayer、palette及layout、brush/reference/canvasReference/tileset、animation、可选outline、display/statistics/timelapse/slices、filePath null/dirty false、时间戳和layerPanelState。animation按normalizeAnimationTimeline的frames/cels/layerMasks/groupMasks/loopSections/activeFrameId/loop顺序。空canvasReferences仍计对象成本，不漏解码后固定存在的空数组；所有typed view、runtime和backing在全图统一身份去重。append整单事务回滚，bytes使用独立临时逻辑图计数，不复制像素/ZIP/撤销历史。

HistoryDecodeContext必须显式提供实际解码session documentId和mask语言名称。legacy decodeProject重新createId而native当前项目ID沿用归档，因此不能从persisted ID猜测真实解码ID长度；测试使用actual decode输出ID，不篡改oracle ID或注入估计成本，另以特意不同长度的persisted Unicode ID验证。此依赖未来须与原生捕获/解码身份生命周期接好，不是通用live DocumentWeigher已经完成。完整适配保留原生现有准入，拒绝已登记unsupported元数据/特殊层、非空canvas references、需语言fallback的空文档或组名、需额外归一化的loop/tileset名称、非字符串createdAt；不得把未知初始形状作为已正确计量。

真实legacy新增42份完整decodeProject图，覆盖前批资源、raw/sparse/空sparse、层/cel/链接/多帧/样式、蒙版/语言/inline优先级、group/panel/outline/显示统计元数据，以及8种pixelFormat和非法fallback；期望全部直接来自真实historyDocumentBytes(decoded)，不加总片段成本。其中34份通过正式native reader/import并逐根图验证：对象/view/buffer身份的双向一一映射、所有kind/string/完整buffer长度/字段顺序和子项数量一致，再比较全图bytes；测试同时验证重复计量不改revision/history、外部/陈旧Document拒绝、缺少decode ID拒绝、后期非法UTF8失败回滚并重试。8份其他布局（7个非RGBA32和1非法布局）被现有native pixelFormat准入拒绝，单独验证Unsupported，不能计为完整native迁移成功；它们仍作为actual legacy图对照验证通用图计数核心。首次全格式导入检查发现此已存在准入缺口，未通过清除unsupported或修改测试输入伪造导入成功。

累计113份真实legacy成本图（71片段/边界+42完整图），34份完整native根图对照通过；Release后端构建和cost/budget/hydration三项CTest通过，615来源覆盖/原始快照、57/756/671/31需求静态台账、diff通过，strict仍因已知缺口退出1。日志native/build/local-history-full-cost-{legacy,build,build-final,tests,ctest,provenance,strict}.log。所有构建句柄已完成，无UI/截图验收或正式exe重编译。

本批完成的是显式契约下的完整初始根装配，不能外推至任意新建/live Document。其他像素布局准入与实际量化/保存行为、特殊层/cel、缺省语言名称/归一化边界、live图层投影与像素/字段/alias生命周期、整体构图预算、JournalSnapshot DocumentWeigher/结构entry.bytes、实际捕获缓存预算重基写入恢复服务仍未完成；不得直接把本初始计划装为通用callback。FS-006继续partial，本地历史UI保持关闭。


## 初始文本图层与cel成本适配（2026-11-04）

初始完整根计划增加text图层kind和cel.text对象。文本仍沿用归档解码的RGBA raster cache，不重新渲染或复制像素；图层投影与cel.surface保持独立，linked cel的text使用其自身元数据，不替换成owner文本。直接复用原生TextCelData与既有归一化，按legacy text-cel-data.ts的顺序装配text/fontFamily/字号间距/mode/align/color、可选styleRuns/origin/box/transforms/shear。样式段即使没有颜色也包含枚举的color undefined，UTF16孤立代理项通过现有textUtf32保留。

真实legacy新增10份完整decodeProject/historyDocumentBytes图：默认文本、中文/emoji/孤立代理项、box、重叠样式段、变换与shear、全过滤变换、128 UTF16字体截断代理边界、小数样式偏移、linked cel自有文本、带额外属性的变换矩形。前9份正式native导入并逐根图验证全部kind/string/顺序/子项数及object/view/backing身份双向映射和bytes。小数偏移用例首次失败（expected4551/actual4455），定位原生text JSON错误四舍五入start/end导致样式段丢失；现改为legacy Math.trunc后clamp，并断言导入后的0..1范围。linked用例额外断言owner和链接cel各自文本不同且链接保留。既有回滚/外部与陈旧计划拒绝检查同样覆盖新增成功用例。

第10份真实legacy图证明source/target矩形额外字符串与嵌套属性会被spread保留。原生TextRect尚不保留这些数据，成本计划现明确拒绝，不把导入成功当作文本迁移等价。这项仍需后续完整迁移；也未证明全部非法输入、可选值和live文本别名生命周期。累计123份实际legacy图，其中52份完整文档：43份native全根图比较、8份原有pixel布局Unsupported、1份文本矩形成本适配拒绝。FS-006仍partial，本地历史UI保持禁用；通用DocumentWeigher、结构成本及实际历史服务仍待完成。本批未重建正式exe，无界面运行/图像验收。


本批最终验证：同一native/build Release local-history-cost-tests目标构建成功；直接成本测试及cost/budget/hydration三项CTest通过。来源覆盖615文件与快照核验通过；需求静态检查57需求/756候选/671证据/31来源通过；strict退出1符合仍有迁移缺口的状态。日志native/build/local-history-text-cost-{legacy,build-final,tests,ctest,provenance,strict}.log。正式exe仍为2026-11-04 02:37:06、23167488字节，未运行或更新界面。本批所有构建句柄已结束。


## 文本矩形扩展属性保留（2026-11-04，接续批）

继续处理上一批明确登记的text transform矩形扩展属性缺口。TextRect增加不可变JSON值元数据；普通四数字矩形不额外保存，带扩展属性者保留原始属性树，复制/归一化/移动/历史沿用该数据。序列化以保留树为基础覆盖当前x/y/width/height，避免移动后写回旧坐标。依据legacy normalizeTextTransform/cloneTextCelData的spread和translateTextCelData仅更改坐标逻辑，不为扩展属性新增产品语义。

初始成本适配移除上一批extended-rectangle拒绝，迭代追加实际JSON树中的primitive/string/object/array；字符串使用原始UTF16，保留孤立代理项。Object.values遵循canonical数组索引键先按数值排序，其余键按插入顺序；01和4294967295不作为索引键。没有把属性名计入legacy值遍历成本。这里仍是初始JSON树契约，不代表任意live跨对象alias生命周期已经完成。

还修正了两个实际解码边界：缺少/非数字坐标的矩形不再以0/1补成有效变换，剪切缺少有效amount时不再生成shear。真实legacy用例增加数值键与普通键顺序、嵌套数组/object/null/bool/数字/孤立代理项、缺坐标和缺剪切量。三个扩展属性用例分别生成legacy translate→encode→decode后的text参考，native测试覆盖真实layer move、undo/redo和项目保存回读逐字段值比较，防止成本通过但元数据仍丢失。验证结果以下方最终记录为准。


本批调试证据补充：首次扩展矩形用例整体成本通过但逐节点失败，定位WinRT的map iterator顺序与原始解析JSON顺序不同；Stringify仍保留已解析顺序。现从已验证的序列化JSON读取顶层key边界（含引号/反斜线及嵌套值跳过），字段和值仍由WinRT解码，再按JS数字索引规则排序。第二次nested用例发现UTF8中转将孤立代理项改为替换字符，故TextRect保留元数据改用UTF16；项目JSON写出也在转UTF8前将孤立代理项转义为\uXXXX，保持legacy JSON.stringify语义，合法代理对仍正常输出UTF8，普通输入不额外分配转义字符串。新escaped用例同时包含字符串分隔符/转义属性名、合法代理对前后夹孤立高低代理项，并对照平移保存回读结果。原生text-change和rollback自有内存检查补计保留元数据字符串；这不是完整legacy图预算或DocumentWeigher已经接线。


最终验证：累计128份真实legacy成本图、57份完整文档；49份正式native导入后逐根图身份/kind/string/order/children/bytes全部一致，原8份pixel-layout继续验证Unsupported，文本矩形成本拒绝已移除。四份扩展矩形用例的原生move、undo/redo、save/reopen逐字段值均与真实legacy参考一致，并验证before+after text历史成本增量包含两份保留UTF16元数据。Release最终重建cost/budget/hydration/text-document/text-raster五目标，直接成本测试和五项CTest全部通过。来源覆盖615文件/快照、需求静态台账57/756/671/31、diff检查通过，strict继续退出1。日志native/build/local-history-text-rect-{legacy,build-verified,tests,ctest,provenance,strict}.log；早期失败及调试日志保留，不删除。全部构建句柄结束。

本批补齐上述属性保留路径，不代表全部文本归一化边界/字体WTF8编码/任意live字段与alias生命周期已经完成；其他特殊图层、完整DocumentWeigher/结构成本/历史服务和面板接线等仍缺。FS-006保持partial、本地历史UI继续禁用；正式exe未重建，无运行界面/图像验收。


## 字体WTF8与文本归一化边界（2026-11-04）

沿用上一批文本基线，给所有已有text完整文档用例增加实际字段值和保存回读对照（不只比较将数字都视为primitive的成本图）。真实legacy分别提供decodedText和encode/decode后的reopenedText。首次native新检查在font-boundary失败：JS128 UTF16截断产生的孤立高代理项被WinRT普通UTF8转换替换。text JSON现在使用现有textUtf16/textUtf32和codecvt在内部WTF8字体名与WinRT UTF16间保留该单元，沿用既有normalizeTextFontFamily的trim/slice，不另写字体归一化。上一批JSON孤立代理项转义写出继续生效。源字体名本身含孤立高/低代理项和空白fallback另有真实用例，均验证导入字段和保存回读。

按text-cel-data.ts区分finiteOr(Number(value))与Number.isFinite原值。复用既有legacy_json_number.h（未改其转换实现）处理主字号/间距、颜色分量、style start/end、transform angle的null/bool/array/十进制与radix字符串转换；origin、box的自动推断、style可选数值及shear amount仍要求实际finite number。非数组styleRuns/transforms忽略，非对象数组项过滤；style颜色按JS truthy规则决定是否存在，再对颜色属性做fallback/coercion。ReadManifest对数组text元数据使用默认归一化文本，对primitive/null不创建text对象，直接对应legacy manifest归一化入口；不把类型错误近似成另一套有效文本。

新增12份真实完整文档，覆盖源字体孤立代理项/空白fallback、主字段Number转换、严格可选字段、无效容器、混合变换数组、样式过滤及array/zero/false/string/null文本元数据。累计140实际legacy成本图、69完整文档，其中61份native正式导入并全根身份/字段顺序/字符串/bytes一致，原8份pixel布局保持Unsupported门禁。所有包含text对象的用例均额外比较解码后的每个字段值，以及native encode→reader→import后与真实legacy reopen文本字段的一致性；原有四份扩展矩形的move/undo/redo/内存增量回归保持通过。

Release重建cost/budget/hydration/text-document/text-raster/project-import六目标，直接成本测试与六项CTest通过。615来源覆盖/证据快照、57/756/671/31需求静态台账、diff通过；strict仍退出1。日志native/build/local-history-text-normalize-{legacy,before,build-verified,tests,ctest,provenance,strict}.log；before保留字体边界失败证据。全部构建句柄已结束，无正式exe重建或UI/截图验收。

本批完成上述解码/保存数据边界，不代表浏览器glyph像素等价、所有超范围数值及任意live对象/字段/alias生命周期完成。原生text origin仍用int，与legacy任意finite JS数值的超范围语义存在差异，需要后续承接；其他特殊层、整体图预算、通用DocumentWeigher/结构entry.bytes、真实历史捕获缓存预算重基写入恢复服务、持久化panel/outline接线仍缺。FS-006继续partial，本地历史UI保持禁用。


## 背景层与调整层初始成本（2026-11-04）

按project-format-decode.ts的实际路径承接background与gradient-map adjustment初始对象。两者都保留归档解码的raster cache；新增适配不生成背景图案、不重新渲染调整效果，也不复制像素。复用timeline::BackgroundSettings/LayerAdjustment/GradientMapSettings，在样式之后、kind之前追加adjustment和background，保留legacy枚举顺序。GradientMap成本装配与已有layerStyles共享辅助函数，样式仍另加enabled/scope，调整层不错误继承layerStyles。

真实legacy新增40个完整文档：canvas默认/repeat/65536与面积上限/越界/小数/无效模式或pattern、六种preset；调整默认/完整参数、无stops但mode/dither/reverse、beta样式表示与启用默认、数字/字符串布尔/false显式调整、null渐变回退、primitive/array配置、array stop color、全部9种抖动/256色标边界；另验证背景上的无色标渐变样式、background与adjustment共存、两层共享同一原始像素资源。对照完整初始图身份/顺序/字符串/节点/完整buffer长度/bytes，也比较native保存的background/adjustment/full layerStyles实际字段值。导入后再保存、reader/import重开并再次验证同一元数据。

首次native对照在background mode数字类型失败（Invalid project manifest: mode）；现按旧版忽略无效背景配置，不把legacy有效解码报为损坏。调整边界沿用旧版的固定gradient-map kind、enabled!==false、显式adjustment truthy判断、beta样式gradientMap.enabled只认literal true和gradientMap的nullish回退，不因适配另设语义。共享GradientMapPresetStore解码无/非数组stops时仍保留模式/抖动/reverse；JSON array颜色按旧版对象属性fallback生成black。样式读取也不再因没有stops丢掉其他渐变参数。其他schema/资源/尺寸/关系准入仍保留。

累计180份实际legacy成本图、109完整文档，其中101份native全根比较、原8份pixel-layout Unsupported；本批不是tilemap/free-tile或任意live projection/alias适配。原生Release后端与cost/budget/hydration/project-import/document-background/background-preset/color-adjustment七项CTest通过；来源/需求静态检查结果记录在日志。正式exe没有重建，无UI/像素图像验收；FS-006仍partial，本地历史UI保持禁用。通用DocumentWeigher/结构成本/历史服务、其余特殊层、新建/live字段与别名生命周期、其他样式边界及持久化panel/outline接线仍待承接。


最终记录：七相关目标构建/七项CTest通过后，给40例补充正式save→reader→import→再保存的值检查，并重建cost目标、单项CTest复跑通过。615文件来源覆盖与证据快照、57需求/756候选/671证据/31来源台账、diff检查通过；strict继续以1表示已知迁移缺口。日志native/build/local-history-special-cost-{legacy,before,build-verified,tests,ctest,build-reopen,reopen,provenance,strict}.log，全部构建句柄结束。


## 2026-11-04 tilemap 清单解析对齐

对照 `project-format-decode.ts::decodeManifestTilemap` 与 `tilemap.ts::normalizeTilemapCell` 修正原生导入：网格尺寸复用已有 JS Number 转换；稀疏索引仍要求数字整数；翻转只接受字面 true；旋转只保留数字 1/2/3，其余归零。尺寸范围、重复索引、资源引用检查继续保留。

实际 legacy decodeProject 的归档修改用例验证字符串/进制/数组/布尔尺寸、无效尺寸拒绝、非布尔翻转、非法旋转归零、合法旋转和索引边界。原生 tilemap-project 测试加入对应解析回归。它们不计入现有 180 个成本图、109 个完整文档成本用例，也不代表 tilemap 成本图已接入。

旧版 refreshActiveAnimationFrame 仅投影当前帧，不再次归一化链接。tilemap 重渲染生成独立像素缓冲，surface 不含普通导入 surface 的 storageOrigin 字段。后续成本适配必须据实际归档探针确认链接别名与字段顺序；目前仍不接纳 tilemap/free-tile 初始成本图。未更新正式 exe，未做本轮界面运行验收。

验证：实际 legacy 解码对照脚本通过（原有 180 成本图保持通过）；tilemap-project-tests 构建与 tilemap-project CTest 通过；615 文件 provenance 覆盖与证据快照通过，strict 仍因既有缺口返回 1；git diff --check 通过。日志见 native/build/tilemap-normalization-{legacy,build,tests,provenance,strict}.log。


## 2026-11-04 tilemap 初始成本图接入

在上一轮解析归一化修正上，初始 RGBA 文档成本适配器已接纳 tilemap 图层与 cel。依据实际 legacy decodeProject 的 Object.keys 与缓冲别名探针：图层包含 tilemapTilesetId；渲染后的 cel.surface 只有四个几何字段，不包含 storageOrigin；每个带自有缓存的 cel 均生成独立渲染缓冲，即使 ZIP 源缓存完全相同；当前图层只与解析链接后的 owner 共享渲染缓冲。

保留旧版可观察的字段顺序：原始稀疏列表恰好填满网格时，normalizeAnimationTimeline 已创建 tilemap 字段，因此它位于 text 前；未填满时，decodeProject 后补 tilemap，位于 text 后。无自有缓存的链接 cel 只保留首次归一化的列表顺序，不能套用稀疏索引排序。准备阶段线性映射 cel ID，仅存字段存在性和必要索引排列；追加成本图不读取、复制或重渲染像素。原有 Document 地址、revision、frame、archive 绑定与失败回滚继续有效。

新增 20 个实际旧版归档：stored/deflated、空/稀疏/填满/倒序网格、尺寸转换、链接 cel 的缺失/自有 dense/sparse 元数据或自有缓存、倒序链接列表、独立 owner 复用原 ZIP 缓存，以及 8 组含透明 RGB 的非对称像素翻转/旋转。总计 200 个成本图、129 个完整文档；121 个原生完整根图比对，8 个像素布局仍明确 Unsupported。20 个 tilemap 用例还比较实际 owner 网格、活动投影像素与尺寸，以及原生保存重开后的对应值。

验证：真实 legacy 对照脚本通过；local-history-cost-tests、tilemap-project-tests 构建通过；两个对应 CTest 通过。日志 native/build/tilemap-cost-{legacy,build-final,tests-final}.log。615 文件来源覆盖与快照检查、diff 检查另行记录。严格来源检查仍应因既有缺口失败。

范围仍限于已导入且未变化的 RGBA 初始图；free-tile、其他像素布局、live 生命周期、通用 DocumentWeigher、完整本地历史服务及 UI 仍未完成。FS-006 保持 partial，界面继续禁用。未构建正式 moonsprite-native.exe，也未做本轮 UI 运行验收。


## 2026-11-04 modern free-tile 初始成本图

初始 RGBA 成本图接纳带显式 freeTileSetId/freeTileSources 的现代 free-tile 图层。实际 legacy 解码探针确认：freeTileSetId 和 freeTileSources 位于 kind 后；同素材集图层共享来源数组身份；实例归一化后 freeTiles 位于 text 前；每个带自有缓存的 cel 重渲染为独立像素缓冲，surface 只有四个几何字段。成本图直接读取已有原生来源/实例数据并记录旧版身份，无像素读取、复制或重渲染。来源名称为空时仍需 decoder locale，当前明确拒绝；旧 freeTileTilesetId 自动拆分/新建资源的成本图尚未迁移。

修复实际导入差异：现代实例可引用 source ID、tileset ID 或 tile ID，旧版均归一为 source ID；原生须在构建校验 Timeline 前完成归一化，否则合法 tile ID 别名会被提前拒绝。预先建立别名表，按来源顺序保留第一次匹配。旧版来源拥有对应 sheet 的名称，原生导入同步该名称。实例可选布尔、rotation、opacity、blendMode 的显式 null 按 strict normalizeFreeTileCelData 拒绝，不能当作字段缺省。

新增24个实际legacy归档覆盖 stored/deflated、空实例、两类别名、来源sheet名称、来源/实例可选字段、隐藏状态、8组非方形旋转翻转、4种透明叠加混合、共享来源图层及复用源缓存的独立帧。比较完整成本根图的类型/顺序/字符串/别名/缓冲长度，并对照每个owner实例、来源字段、surface尺寸/偏移/像素及原生保存重开后的结果；另有7组实际旧版显式null拒绝及原生回归。

累计224成本图、153完整文档，145个原生完整根图比对、8个原有像素布局Unsupported。实际legacy脚本、local-history-cost-tests/free-tile-project-tests构建及两个CTest通过（分别2.92s、11.69s）。日志 native/build/free-cost-{legacy,build-verified,tests-final}.log。来源覆盖/strict与diff检查另行记录。

仍未完成：旧free-tile资源所有权转换、链接free-tile导入、来源字段全量归一化/locale fallback、其余像素布局、live生命周期、通用DocumentWeigher、本地历史服务/UI；FS-006仍partial并禁用界面。未更新正式exe，未做本轮UI运行验收。


## 2026-11-04 free-tile 来源字段归一化

按实际 normalizeManifestFreeTileSources 修正原生来源解析：visible 仅 false 关闭，locked 仅 true 开启；opacity 只识别实际有限数字并限幅，不转换字符串/布尔/数组；非法 blendMode 回退 normal；非安全整数 offsetX/Y 归零，安全整数继续受现有原生坐标范围限制；非法 description 忽略；displayColor 必须四个通道均为有限数字，再按 JS Math.round 和0..255限幅，不能补齐缺失alpha或接受数字字符串。已有来源扩展JSON保留策略继续存在，保存时规范字段覆盖原始值。

新增16个实际legacy归档覆盖 null/bool/number/string/array/object 在上述字段中的处理、不安全整数、opacity两端限幅、颜色舍入/限幅/不完整/字符串通道及±67108864偏移边界。所有用例继续验证完整成本图双射、来源/实例字段、实际像素，以及原生保存重开后的对应值。累计240成本图、169完整文档：161原生完整根图、8原有像素布局门禁；现代free-tile共40例。

真实legacy对照脚本通过；local-history-cost-tests/free-tile-project-tests构建通过，对应CTest分别3.15s/9.96s通过。日志 native/build/free-source-normalization-{legacy,build,tests}.log。来源覆盖、strict及diff检查另行记录。

未完成项仍包括来源缺省名称的decoder locale、超出原生坐标范围的合法JS偏移、旧free-tile所有权转换、链接free-tile、其他像素布局、live生命周期、通用DocumentWeigher和本地历史服务/UI。FS-006仍partial，正式exe未更新，未做本轮UI运行验收。


## 2026-11-04 modern free-tile 所有权导入校验

依据 project-format-decode 的现代来源规则，准备状态在别名归一化、sheet名称同步前验证：素材集ID非空且JS trim不改变值（复用已有Unicode空白判定）；每层来源ID/sheet ID唯一；同来源ID或sheet ID不可由不同素材集占用；来源sheet恰好一个tile、1列1行，并且不能是tilemap图层的owner。已有共享来源字段一致性检查继续执行。校验只作用于现代显式sources；旧格式自动拆分、链接free-tile和全局运行时状态约束仍未迁移完成。

新增14个经真实legacy decodeProject确认拒绝的归档：空/ASCII/NBSP/BOM素材集ID边界、重复来源和sheet、跨集合来源/sheet占用、共享来源字段冲突、多tile/带空白格sheet、tilemap owner冲突。原生reader/import逐一拒绝。既有240成本图/169完整文档（161原生比较、8像素布局门禁）及40现代free-tile有效案例继续通过。

新增校验暴露旧测试夹具误用grid blankTileset默认8列，以及模式测试多个来源共用同sheet。实际原生来源创建已显式1列；修正两处测试来源构造为1列，隐藏/锁定来源分配像素完全相同但ID独立的sheet，保留所有行为预期。真正多格/重复sheet仍由真实legacy拒绝归档覆盖，未放宽导入。恶意cleanup状态的独立健壮性测试保留，不称其可合法保存读取。

验证：实际legacy脚本通过；local-history-cost/free-tile-project两项构建与CTest通过（3.79s/13.75s）；615文件来源覆盖及快照通过；strict因已知缺口返回1；diff检查通过。日志 native/build/free-ownership-{legacy,build-verified,build-final,tests-verified,provenance,strict}.log。正式exe未更新，未做本轮UI验收。FS-006保持partial。


## 2026-11-04 modern free-tile 实例引用类型

decodeManifestFreeTiles 对现代来源数组要求 sourceId 为非空实际字符串，并拒绝任何实际字符串 tileId（包括空字符串）；非字符串 tileId 被忽略。原生此前把空字符串当作无字段、把部分非字符串当作格式错误，存在双向差异。现有 decodeCel 增加显式 modernSources 模式，readProjectManifest 预先建立现代free图层ID集合并传入，不按每个cel反复扫描图层。独立/旧格式decodeCel默认模式保持原有入口。

新增6个真实legacy有效归档覆盖 tileId=null/false/true/0/[]/{}，继续验证完整根图双射、来源/实例/像素及原生保存重开；新增9个真实legacy拒绝归档覆盖空/非空字符串tileId和缺失/null/空串/bool/number/array/object sourceId。累计246成本图、175完整文档（167原生完整根图、8像素布局门禁），现代free-tile46例，有所有权/引用拒绝归档23例。

本轮仍不代表旧格式所有权转换、链接free-tile、名称locale fallback、live生命周期、通用DocumentWeigher和本地历史服务/UI完成。正式exe未更新，FS-006仍partial；构建与测试结果见本节后续记录。

验证结果：实际legacy脚本通过；local-history-cost-tests/free-tile-project-tests构建通过；对应CTest分别4.56s/14.12s通过。615文件来源覆盖及快照通过，strict因既有缺口返回1，diff检查通过。日志 native/build/free-instance-reference-{legacy,build,tests,provenance,strict}.log。无本轮UI运行验收。


## 2026-11-04 schema21 free-tile 素材集字段校验

旧版parseManifest将当前原始schema21写入sourceSchemaVersion，因此decodeProject的现代来源规则要求显式非空字符串freeTileSetId及非空freeTileSources。原生此前decodeLayer会把缺省素材集ID替换为layer ID，并保留空sources；没有实例时可能绕过后续实例校验。现由readProjectManifest显式传入modernSources模式，先拒绝缺失/错误类型/空来源列表，再执行已有字段解析。独立decodeLayer默认兼容模式保留；这不代表旧schema迁移或旧资源拆分已完成。

新增14个真实legacy拒绝归档，覆盖两个必需字段缺失、null/bool/number/array/object、空来源列表，以及schema21只提供旧freeTileTilesetId的情况。均清空实例，隔离素材集字段校验。已有拒绝归档累计37个；有效246成本图/175完整文档（167原生根图、8像素布局门禁）、46现代free-tile用例保持原有范围。

未更新正式exe，未做UI运行验收；FS-006仍partial。旧schema/旧来源转换、链接free-tile、locale缺省、live生命周期、通用DocumentWeigher和本地历史服务/UI仍未完成。验证结果见本节后续记录。

验证结果：实际legacy归档脚本通过；两个相关目标构建通过；local-history-cost与free-tile-project CTest分别5.50s/15.45s通过。615文件来源覆盖及快照通过，strict因既有缺口返回1，diff检查通过。日志 native/build/free-collection-metadata-{legacy,build,tests,provenance,strict}.log。


## 2026-11-04 多来源free-tile与准备阶段索引复用

所有权校验复用已准备的sheet ID索引，取消每个来源扫描整个sheet数组；实例别名归一化先按layer ID分组free cels，取消每图层扫描全部cels。指针仅在未增删的准备状态向量内使用。来源顺序不变，别名冲突仍按实际旧版sources.find的第一次匹配处理。本轮仅改这两处准备阶段查询，不宣称整体导入已达到旧版性能。

新增5个真实legacy归档：3份来源具有独立像素/opacity/blend/offset，来源和实例倒序，source ID与另一来源tile ID冲突的两种顺序，以及两图层共享3份来源。完整根图比对覆盖来源数组/对象共享身份及有序字段；继续比较来源/实例字段、每个owner的surface与像素、原生保存重开结果。累计251成本图/180完整文档，172原生根图/8像素布局门禁；51现代free-tile有效归档与37拒绝归档。

正式exe未更新、未做UI验收；旧格式所有权转换、链接free-tile、locale缺省、live生命周期、通用DocumentWeigher及完整历史服务/UI仍未完成，FS-006保持partial。验证见后续记录。

验证中修正测试假设：source ID与另一来源tile ID重名时，旧版首次解码与保存重开可能因再次按来源顺序归一化而不同。现在所有free-tile归档分别生成实际legacy首次解码与encode/decode后的runtime预期，原生分别对照，不把重开必须等于首次解码作为自行定义的行为。初始测试因此失败；修正oracle后local-history-cost重新构建/CTest通过（5.48s），此前同批free-tile-project通过（12.15s），生产代码未因该差异另改行为。日志 native/build/free-multiple-sources-{legacy,build,build-reopen,tests,tests-reopen}.log。


## 2026-11-04 导入关系校验的准备状态移交

原生prepareEditableImport为复用Timeline构造/diagnoseLinks校验，曾调用Timeline(state)复制整个准备状态，额外复制tileset像素。实际legacy在已解码document/maps上校验来源与关系，没有对应像素副本。必要原生适配改为移动State进入同一构造校验，通过后用rvalue-only Timeline::takeState移出；被消耗的Timeline以空状态重置，清理索引、链接解析和内容/缩略图缓存。未绕过现有校验。

调用点位于cel像素surface安装前；普通关联图层此时没有surface，不会因Timeline构造中的synchronizeLinkedLayers改变投影内容。既有mask/tilemap/free-tile/引用校验和后续像素安装仍按原顺序。保留既有异常传播，失败只销毁局部准备状态。

新增时间轴回归：建立来源sheet/cel，运行关系诊断并填充内容/缩略图缓存，再移交状态；要求tileset像素与cel backing地址不变，消费后旧Timeline的状态/ID索引/诊断为空；再构造验证内容和来源buffer身份保留。此处仅移除关系校验引起的临时副本，不宣称所有导入分配或一般内存准入已完成。

本轮修改公共timeline_model.h，已启动相关依赖重建；正式exe未更新。验证结果见后续记录，整体迁移和FS-006仍未完成。

验证结果：四目标构建通过；timeline-model（0.04s）、project-import（0.03s）、local-history-cost（5.46s）、free-tile-project（11.33s）四项CTest通过，包含既有251真实成本图/180完整文档与37拒绝归档。615来源覆盖及快照通过，strict继续因已知缺口返回1，diff通过。日志 native/build/import-validation-transfer-{build,timeline-test,tests,provenance,strict}.log，所有构建/测试句柄已结束。


## 2026-11-04 导入cel索引与链接owner复用

对应旧版createAnimationCelLookup/by-ID解析边界，原生在已有Timeline校验后建立cel ID→序列索引与结构化(layer ID, frame ID)→序列索引；迭代解析manifest cel最终owner并缓存路径，保留循环/缺失链接防护。像素准入、安装与关联图层raster比较复用这些结果，替换逐slot查找完整cel数组及重复完整链接遍历。安装按原序列索引，不重排cel、不压平链接。仅处理这些准备阶段查询，整体导入还有其他扫描与分配缺口。

原生新增3图层（其中2关联）×192帧的倒序cel、191层显式链接及带分隔符ID回归，逐cel比对序列身份/链接/owner像素，再确认最终owner解析。新增真实legacy tilemap 192帧倒序长链归档，完整根图双射、活动像素/owner网格及原生保存重开对照通过。累计252成本图/181完整文档，173原生完整根图和8像素布局门禁；free-tile51有效/37拒绝不变。

构建project-import-tests/local-history-cost-tests/free-tile-project-tests通过；三个CTest通过（0.02s/4.61s/10.71s）。日志 native/build/import-cel-index-{legacy,build-final,tests}.log。来源覆盖/strict/diff另记。未更新正式exe，无UI运行验收；FS-006仍partial，旧schema/free-tile转换及链接、locale、live/通用weigher/服务等迁移缺口仍存在。


## 2026-11-04 free-tile 导入与保存 JSON 归一化

依据 legacy project-format-manifest.normalizeManifestFreeTileSources 与 free-tile.normalizeFreeTileCelData，导入重新构造已知字段对象，丢弃 source、instance 和 freeTiles 容器未知字段。原生不再把输入原始 JSON 存入这些对象的 preservedJson；已知描述、颜色、状态、变换和外观字段仍按对应归一化规则保留。manifestFreeTilesFromData 只创建 instances 容器，原生编码同步使用新容器，并省略默认零旋转和 false 翻转字段。运行时 source/instance 的额外字段处理仍按旧版编码的对象展开边界保留；不把旧版导入丢弃字段的行为改成自定义扩展持久化。

新增真实 legacy 归档，覆盖 source/instance 嵌套未知字段、容器额外字段及颜色额外分量。52 个有效 free-tile 归档都新增原生实际保存 manifest 中 sources/freeTiles 的完整 JSON 对照，包括字段存在性和默认值省略；首次导入与保存重开的运行时预期仍独立生成。累计 253 成本图、182 完整文档，174 原生完整根图比对及 8 像素布局 Unsupported 门禁；37 个旧版拒绝归档保留。

三个相关目标构建通过；local-history-cost 6.03s、project-import 0.03s 通过。free-tile-project 首次暴露旧测试要求未知字段持久化，按旧版归一化修正预期后重建并通过（12.50s），仍逐字段检查全部已知 source 属性、集合身份和资源数量。615 文件来源覆盖与证据快照通过，strict 因已有迁移缺口返回 1，diff 检查通过。日志 native/build/free-normalize-{legacy,build,build-final,tests,tests-final,provenance,strict}.log；所有构建/测试句柄均结束。

正式 exe 未更新，无 UI 运行验收。FS-006 仍 partial、入口禁用；旧 schema/free-tile 转换及链接、locale、一般 live DocumentWeigher、服务和 UI 接入等仍未完成。


## 2026-11-04 free-tile 默认 source 名称及专属资源名称

旧版 normalizeManifestFreeTileSources 只保留非空实际字符串名称，否则 translateCurrent(core.document.layer)；localization.ts 与 locales/contracts.ts 的默认语言为 zh-CN，zh-CN.ts 对应“图层”。原生当前 general.language.Select 没有 runtime consumer，因此本次只落实当前默认中文的导入规则，不宣称其他八种语言或语言切换完成。名称为空、缺失或错误类型时使用“图层”，纯空白与 Unicode 名称保持原文，不裁剪。

新增11份实际legacy归档，覆盖名称缺失、null、两种布尔值、整数/小数、数组、对象、空字符串、纯空白、Unicode；原有首次运行时/成本完整根图及实际保存JSON/重开对照继续复用。纯空白用例暴露初始成本适配器对所有tileset强制名称trim的过度门禁：旧版ensureFreeTileTilesetOwnership在普通资源归一化之后将source.name直接赋给专属tileset。原生按源所有权建立名称索引，专属资源要求与source名称完全一致，普通资源仍保留已有空值/首尾空白门禁。

累计264成本图、193完整文档，其中185原生完整根图比对、8像素布局Unsupported门禁；63份有效free-tile与37份legacy拒绝归档。三目标构建通过；project-import 0.03s、free-tile-project 13.62s通过，修正专属名称门禁后local-history-cost重建并通过（11.10s）。来源覆盖615文件与证据快照通过，strict仍因已知迁移缺口返回1，diff检查通过。日志native/build/free-name-default-{legacy,build,build-final,tests,tests-final,provenance,strict}.log，所有构建/测试句柄结束。

正式exe未更新，无UI运行验收。FS-006仍partial且入口禁用；九语言实际接入、其他locale默认名称、旧schema/free-tile转换及链接、live/一般weigher/服务/UI等仍未完成。


## 2026-11-04 本地历史会话事件状态机

新增 local_history_session，直接承接 local-history-service.ts 的 recordLocalHistoryChange 与 trimSnapshots：提交时比较基础快照形状与当前形状，相同且有已提交条目才请求已有 committed delta，否则要求已完成的文档检查点；保留增量基础身份、截断重做分支、标签缺失时使用“编辑”。同步处理 discardedUndoEntries、discardedRedoEntries、偏好上限、undo/redo 位置钳制、clear、预算重基和形状元数据转移。复用现有 JournalSnapshot 和 enforceSnapshotBudget，压力下不擅自删可见历史。

必要原生适配：owner线程按一次事件暂存可见数组与形状更新；捕获/物化失败时不发布部分状态，后续服务负责报告并暂停记录，普通撤销不受该对象影响。形状缓存使用弱所有权，不保留已关闭/丢弃快照；只暂存当次改动，预分配后合并，索引按几何增长，每次最多检查64个弱记录，避免逐提交复制/扫描长增量链。初始化可接收已恢复的快照序列并记录当前形状；未知其他文档节点需要时按既有documentShape读取元数据，不读像素。

verify-local-history-committed.cjs 抽取并执行旧版实际 record/trim 函数体；仅注入设置、诊断与外部捕获边界，像素条目、committed delta、clone、预算计数/重基/物化均使用真实旧版实现。普通256MiB和强制0预算两组共42事件，覆盖连续提交、撤销重做边界、撤销后分支、缺失条目、无像素差量、结构形状变更、undo/redo两侧裁剪、提交伴随裁剪、缩小上限、清空与重启记录。原生逐事件对照根/基础节点身份、增量JSON/缓冲字节、已知检查点像素/成本、标签/位置/压力状态及捕获/检查点/物化调用次数；同时保留旧代际，检查捕获失败、检查点失败、预算物化失败的原状态不变，clear后旧快照弱引用释放。

local-history-budget-tests 构建通过，local-history-budget CTest通过（0.74s），包含既有120编辑/117裁剪与30000节点释放检查。旧版生成器通过，成本参考保持264图/193完整文档；617文件来源覆盖与证据快照通过，strict仍因已知缺口返回1，diff通过。日志 native/build/history-session-{legacy,build,build-final,tests,tests-final,provenance,strict}.log；本轮所有构建/测试句柄结束。

这是服务会话状态机，尚未把原生所有commit/undo/redo/trim/clear事件接到settled时机，未接入服务配置/暂停诊断/异步编码与写入，也没有提供一般live DocumentWeigher。checkpoint/committed/materialize及准确成本依赖显式由调用方提供；不使用初始解码专用成本适配器替代一般会话成本。FS-006继续partial且入口禁用；正式exe未更新，无UI运行验收，全部迁移目标仍未完成。


## 2026-11-04 原生已完成编辑的会话适配

核对原生commitStroke：普通笔画在pushEdit之后才更新drawing统计、清active与pending，因此不能直接把服务捕获塞进pushEdit。保持该现有行为，本批增加明确要求实际settled通知的适配边界，而未启用部分事件通知冒充全覆盖。

CommittedCapture.latest按调用方绑定的historyRevision读取当前实际最后提交条目；活动预览、grouping进行中、代际过期、缺失条目/afterState不匹配，以及已有的非像素/结构/特殊内容排除均拒绝。之前的编辑前票据保留原文档身份、beforeState、单次代际与前后形状检查，通过后共享同一原生字节适配逻辑。latest只用于调用方已确认的Push事件，不凭代际值把undo/redo误认成提交；旧版服务的前后形状门禁继续归JournalSession处理。

JournalSession.recordSettled接受真实Document和绑定代际，先拒绝active/stale通知，再计算实际原生documentShape并把真实committed捕获传给既有record。检查点/物化和准确成本依赖仍显式由调用方提供，不能使用测试注入成本作为生产DocumentWeigher。新增原生实际begin/commit/undo/redo/addLayer/setHistoryEntryLimit/cancel串联检查：预览拒绝、普通笔画无检查点、结构变更检查点、裁剪保留基础身份、过期事件拒绝，并确认捕获不改文档像素/内容代际/历史代际/统计。

原有8类point/run/region/sparse/linked/inactive/overlap样本逐项比较latest与编辑前票据的JSON和全部buffer字节一致；随后仍由实际legacy独立捕获/水合验证。local-history-budget-tests与local-history-committed-tests构建通过；两个CTest通过（0.45s/0.33s），旧版生成/互读验证通过，264成本图/193完整文档/42事件参考保持。617文件来源覆盖和证据快照通过，strict继续因已知缺口返回1，diff通过。日志native/build/history-settled-{build,tests,legacy,provenance,strict}.log；所有构建/测试句柄结束。

尚未安装原生所有编辑入口的统一settled事件分发，未完成服务配置/暂停诊断/后台写入与一般live DocumentWeigher；FS-006仍partial且UI入口禁用。正式exe未更新，无UI运行验收；全部功能迁移目标仍未完成。


## 2026-11-04 原生撤销栈变化通知源

按legacy HistoryStack.setChangeListener/notify与push/undo/redo/setMaxEntries/clear，Document增加运行时只读监听器和HistoryStackChange载荷，报告实际标签、当前historyRevision及discardedUndo/discardedRedo。pushEdit在普通栈插入/内存与条数裁剪之后通知，groupingHistory期间抑制子通知，groupEdits及已有新建链接帧完成路径通知最终条目；undo/redo在状态应用后通知；setHistoryEntryLimit分别报告两侧裁剪。新增clearHistory仅清栈及组合记账、递增历史代际，不改像素、dirty和文档revision。

运行时监听器的复制/赋值边界参照原生录像绑定：Document副本不继承，move保留。同一共享回调对象跨通知保留可变闭包状态；执行时局部持有回调，支持自取消而不提前析构。异常按legacy notify传播；未来本地历史服务仍必须捕获失败、报告并暂停记录，不能让其异常穿过普通编辑。恢复安装按legacy restoreTimeline不发变化通知，安装后真实undo/redo正常通知。

JournalSession增加直接消费HistoryStackChange的settled适配，保留原生标签/裁剪数/代际；实际原生会话回归从监听器采集push/undo/redo/trim载荷，操作返回后再交会话，验证真实笔画增量与标签、结构检查点、裁剪及取消。该测试没有把active期间的原始通知伪装为settled；普通笔画push仍发生在active清理和drawing统计之前。

旧版实际HistoryStack生成2组共40命令/34通知，覆盖正常条数预算、1字节压力、undo/redo、分支、undo/redo两侧trim、空导航、重复clear、组合子步骤与完成；原生逐命令对照通知数量/顺序/载荷及位置/长度。回归还覆盖复制/赋值监听器隔离、自取消生命期、可变闭包连续状态、clear内容不变和异常传播，原有8差量样本新增恢复安装静默与恢复后6个undo/redo通知检查。

三目标构建通过；local-history-budget 0.52s、local-history-committed 0.35s、document-raster-history 0.05s通过。实际legacy生成器通过，原264成本图/193完整文档和42会话事件参考保留。618文件来源覆盖及快照通过，strict继续因已知缺口返回1，diff通过。日志native/build/history-events-{legacy,build,build-final,build-verified,tests-initial,tests-final,provenance,strict}.log；所有构建/测试句柄结束。

仍未完成生产事件到settled时机的统一派发：active预览清理/组合后处理、已单独通知的末两笔合并与多事件批次等须继续核对，不能直接逐原始通知调用recordSettled。服务配置/暂停诊断/后台写入和一般live DocumentWeigher仍未接入。FS-006仍partial、入口禁用；正式exe未更新，无UI运行验收，全部迁移目标仍未完成。


## 2026-11-04 不可变历史代际准备

核对原生一次UI操作的多个栈事件：笔画提交后可能mergeLastStrokeEdits，多个事件不能延后再逐条从同一最终Document捕获；该settled派发问题仍未解决。本批推进独立可复用的后台准备边界，没有启用不完整事件服务。

新增local_history_generation.prepareGeneration，对应legacy writeHistoryGeneration的incrementalDeltas、archives准备和pack缓存边界：只在增量节点的直接base身份就是前一可见节点时，输出increment并跳过完整工程编码；首位裁剪增量和基础不相邻增量必须请求完整编码，archive节点直接复用原字节。输出PreparedRequest与encodedCheckpoints，可交已有packPrepared/PreparedWriter；相邻增量只由packPrepared编码一次。未缓存普通转移显式请求compiler，缓存null是已知结构转移，不能误作未命中重复编译。checkpoint编码/差量/数量预算失败传播，不修改源会话或快照身份。

Encoder/Compiler/Cache仍是显式依赖；这里只接受保留的不可变JournalSession.State，工作线程不访问live Document。尚未实现的一般转移编译、encodedSnapshots缓存、service去重和成功回执rebase没有用固定null或每笔整图编码代替。

生成器抽取旧版writeHistoryGeneration实际incrementalDeltas表达式，六组序列覆盖连续增量、117步裁剪首位、跳过基础、重复archive节点、重复原节点和单baseline。原生逐项核对编码/编译调用顺序、增量掩码/JSON，实际物化并编码检查点，打包重读校验精确checkpoint字节与独立物化像素；cached-null不再调用compiler，编码失败与零archive预算拒绝且输入不变。原有事件/成本/预算参考保持。

local-history-budget-tests构建通过，local-history-budget CTest通过（1.31s），legacy生成器通过；620文件来源覆盖/快照通过，strict继续因已知缺口返回1，diff通过。日志native/build/history-generation-{legacy,build,build-final,tests,provenance,strict}.log；所有构建/测试句柄结束。

统一settled事件派发、完整后台service/缓存/编译/写后重基和一般live DocumentWeigher仍待迁移，FS-006保持partial且入口禁用。正式exe未更新，无UI运行验收，全部功能迁移仍未完成。


## 2026-11-04 快照编码缓存

依据local-history-service.ts的encodedSnapshots/encodeSnapshot，local_history_generation新增SnapshotEncodingCache：同一不可变节点的并发请求共用一个promise/future，成功结果复用，失败删除缓存后允许重试，archive节点直接返回原字节。编码由首个调用的准备工作线程在锁外执行，其他工作线程等待同一结果；不创建额外隐式线程，也不能从UI owner直接阻塞使用。

缓存键使用weak_ptr并检查owner身份，避免缓存保留关闭项目/被裁剪快照的文档与base链；每次最多检查64个弱键，清理过期结果。按已结束owner身份检查防止内存地址复用误命中。失败/null返回都不留下永久失败结果；encoder依赖仍由实际后台编排提供。

生成器抽取执行旧版实际encodeSnapshot函数，验证并发返回同一promise、编码仅一次、成功重用、拒绝后重试及archive bypass。原生测试验证并发共享结果/一次encoder调用、缓存命中不调用encoder、异常和null结果重试、archive原字节身份、快照弱生命周期释放及150次短生命周期对象。local-history-budget-tests构建通过，CTest通过（0.59s）；legacy生成器通过，620文件来源覆盖/证据快照通过，strict仍因已知缺口返回1，diff通过。日志native/build/history-encoding-cache-{legacy,build,tests,provenance,strict}.log，全部句柄结束。

该缓存供generation准备工作线程复用，生产后台编排/成功写后重基、转移差量缓存/一般compiler、settled事件派发及通用live成本仍未接入；FS-006保持partial、入口禁用。正式exe未更新，无UI运行验收，全部功能迁移目标仍未完成。


## 2026-11-04 相邻快照差量结果缓存

local_history_generation新增TransitionDeltaCache，对应legacy local-history-service.ts的deltaCaches/cacheDelta：键为有方向的before/after快照身份，未命中、已缓存null结构转移和已缓存字节明确区分；覆盖同一对不影响同before的其他后继。使用弱owner且每次最多清理64个过期项，不保留文档/base链，不因地址复用误命中。原生返回值拥有字节副本，调用方修改返回缓冲不会修改缓存；生产用途仍为既有串行writer完成结果缓存，不额外设计并发差量编译。

生成器执行实际legacy cacheDelta函数，验证方向/身份、null命中、覆盖和独立后继。原生回归校验源/返回字节隔离、弱生命周期、150对短生命周期对象以及真实prepareGeneration消费缓存后不再调用compiler（同时包含字节与null）。local-history-budget-tests构建及CTest通过；legacy生成器通过。620文件来源覆盖与证据快照通过，strict仍因已知缺口返回1，diff通过。日志native/build/history-transition-cache-{legacy,build,tests,provenance,strict}.log；全部构建/测试句柄结束。

缓存尚未接入生产service成功写入回执及重基后的快照对迁移，一般转移compiler、settled派发和通用live文档成本仍未完成。FS-006保持partial和入口禁用，正式exe未更新，无UI运行验收。


## 2026-11-04 成功写入回执后的实时链重基

JournalSession.acknowledge迁移legacy writeHistoryGeneration在await writeLocalHistory之后的处理。只有首个已写快照仍是当前首个增量，或当前会话已有内存压力时才执行；只把编码了完整checkpoint且仍在当前可见序列的同一快照身份替换为archive节点。按可见顺序重接直接base，复用不可变delta身份，保留标签/位置和其他in-flight代际。同步迁移shape元数据与相邻差量缓存（包括已知null），重映射该已确认record自己的快照数组。压力只在原有压力状态且重基后仍超预算时保留，不为原本未受压会话额外设置压力。

调用方必须在磁盘写入成功之后、owner线程执行；本接口不自行写入、不接收失败回执。准备替换、缓存和分配后才发布可见数组；非法长度/null owner拒绝且不改变会话。旧代际保留期间旧base链继续存活，不以缓存或新链覆盖其他正在写入的代际。成功迁移的shape仍可供下一笔同形状增量使用。

生成器抽取执行旧版实际写后代码块，五组场景覆盖保存期间追加尾笔、分支、首位已前移、内存压力、无需重基。原生对照可见/record/archive/base/delta身份与字节、缓存null/字节、标签/位置/压力；另验非法回执不变、旧代际存活及回执后继续捕获增量。local-history-budget-tests构建和CTest通过（0.86s）；legacy生成器通过，620来源覆盖/证据快照通过，strict仍因已知缺口返回1，diff通过。日志native/build/history-ack-{legacy,build,build-final,tests,tests-final,provenance,strict}.log；全部句柄结束。

生产writer回执派发、完整service去重/错误暂停、一般compiler与live DocumentWeigher、settled事件仍未完成；FS-006仍partial、UI入口禁用，正式exe未更新，无UI运行验收。


## 2026-11-04 不可变代际后台写入器

local_history_persistence新增JournalWriter：owner入队前保留不可变JournalGeneration（快照身份、标签/位置、当前指纹），复用已有LatestTaskQueue的一个运行/一个可替换待写。显式保存指纹在运行/待写期间继承，但使用最新代际标记；idle后恢复普通写入。准备/编码缓存/转移缓存/打包/原子磁盘替换均在std::async工作线程，不访问live Document。

成功结果预先分配后才替换磁盘文件，成功回执由owner poll取回checkpoint向量与缓存供已有acknowledge使用；失败经ack future传递，不触发success。缓存转移答案在磁盘IO前保存，锁文件失败后的重试不重新编译。析构drain队列；service尚须在关闭前显式poll回执及处理失败，不能依赖析构完成实时链重基。

真实文件系统回归覆盖待写替换/被替换代际释放、共享ack、工作线程compiler/owner线程success、重复写仅编译一次结构转移、指纹继承与idle清除、锁文件失败保留原文件且无成功回执、重试及错误身份拒绝。local-history-persistence-tests构建通过，CTest通过（0.10s）。620来源覆盖/证据快照通过，strict因已知缺口返回1，diff通过。日志native/build/history-journal-writer-{build,tests,provenance,strict}.log，构建测试句柄均结束。

尚未装入Editor生产service：会话去重/回执派发、一般compiler、settled事件、live DocumentWeigher仍待接入；增量结果缓存当前还需重复encodeDelta，是已知性能缺口。FS-006继续partial和入口禁用，正式exe未更新，无UI运行验收。


2026-11-04 打包结果复用：核对 legacy core/local-history-archive.ts 的 packLocalHistory 返回 archive+deltas 及 store/local-history-service.ts 写入前 cacheDelta 调用；原生增加 packPreparedResult，旧 packPrepared 保留为包装器。JournalWriter 直接移动打包得到的实际差量到缓存，移除第二次 encodeDelta。归档回归覆盖返回差量与归档 cachedDeltas/增量 payload 字节一致、增量覆盖陈旧缓存、结构 null 和包装器输出一致。local-history-archive（0.17s）与 local-history-persistence（0.21s）通过；620文件来源覆盖和 diff 检查通过，strict 因现存迁移缺口仍返回1。生产 service、通用 compiler/live成本和 settled 事件仍未完成，FS-006保持禁用，正式exe未更新。


2026-11-04 会话写后派发：enqueueSession 在owner捕获不可变state，仅弱引用JournalSession；后台不读取live会话，owner poll在disk success后调用acknowledge，关闭会话不被写入任务保留。回执逐项隔离异常并在其他已完成项派发后抛首个错误。测试覆盖trimmed根checkpoint/缓存迁移（显式合成encoder，仅验证派发）、锁文件失败保留live链、关闭会话释放、空target拒绝及回调异常隔离。最终local-history-persistence单次通过0.65s。两次最多10次的有界重复验证分别在第8/6次暴露非预期Windows5原子替换失败，位置跨PreparedWriter和JournalWriter；未修改通用atomic writer或添加盲重试，存储可靠性缺口待定位。sessionWrites/latestWrites去重及写记录重映射尚未实现；Editor service/通用compiler/live成本/settled事件仍未完成，FS-006禁用，正式exe未更新。


2026-11-04 单identity会话写入去重：按legacy persistLocalHistory/sameHistoryWrite，仅当session record仍为当前identity最新记录且位置/有序label/显式fingerprint/逐快照owner相同时复用回执（运行中或已完成均可）。另一session/raw写入失效旧记录；待写替换清理被替换记录，已完成失败不阻止重试；成功acknowledge后更新record的重基owner。C++记录使用弱session和弱snapshot比较，避免关闭项目被去重元数据保留。直接提取执行旧版persist/helpers+实际LatestTaskQueue，23次操作/10次实际代际写入对应原生回执ID、pending状态与成功写入计数；额外覆盖重基后去重、锁失败后重试、关闭snapshot释放。local-history-persistence通过0.16s，620来源覆盖/diff通过，strict仍返回1。当前仅单writer/identity；全局registry/256条latest弱元数据上限、restore预置记录与Editor接入仍未完成。通用compiler/live成本/settled事件及Windows5偶发原子替换问题保留，FS-006禁用，正式exe未更新。


2026-11-04 Windows原子写入证据与诊断：核对legacy platform_storage.rs，原生与旧版同用MoveFileExW(REPLACE_EXISTING|WRITE_THROUGH)，旧版无替换重试。用rustc直接包含未修改legacy模块，生成独立测试探针native/build/history-legacy-atomic-probe.rs/.exe；在新建保留目录连续写入不同代际，第35次复现拒绝访问/os error5，日志native/build/history-legacy-atomic-probe.log。因此故障可跨旧/原生实现复现，尚未识别外部占用者或根因，不作为已修复。原生共享binary写入错误改为system_error，立即捕获Windows码并附临时及目标UTF8路径，短写使用ERROR_WRITE_FAULT，去除误导PNG文案；无重试/替换算法变更。锁history回归验证类型/码5或32、两路径、旧字节及owned临时清理。本地历史通过0.19s、image-save0.19s、project-save0.60s、project-save-raster-resources0.34s；620来源覆盖/diff通过，strict仍1。未更新正式exe、未进行UI运行验收，整体迁移/FS-006仍未完成。


2026-11-04 恢复后已写记录登记：核对legacy restoreLocalHistory结尾hasCache&&!writeQueues.has(projectKey)分支。rememberRestored接受已验证ReadResult及裁剪前完整snapshot vector，按writer identity核对并预置缓存对、已完成回执及弱session/latest record；有运行/待写或无cache不登记。恢复未变化时enqueueSession返回相同ready回执且不创建写入目录，裁剪后不误用完整record，另一session写入失效旧去重；实际legacy opaque归档回归覆盖cache命中不编译、busy拒绝及非法identity/count/null。local-history-persistence通过0.46s。仅post-install服务接口，未接Editor恢复；全局registry、一般compiler/live成本/settled事件和Windows5占用根因仍缺。FS-006禁用，正式exe未更新。


2026-11-04 录制协调器：新增LocalHistoryRecording复用JournalSession/PersistTimer/JournalWriter，承接legacy configure监听try(record+schedule)/catch(suspend)、suspend取消计时并释放state、pressure/750ms定时及flush先取消再提交。捕获失败保存exception并暂停本地history，不动Document普通undo/disk历史；诊断sink抛错不逃回提交栈。IO/worker失败保留在ack，不暂停捕获。显式resume接收已完成baseline，不绑定raw listener。回归覆盖真实Document commit后settled捕获失败仍可undo/redo、sink失败、IO准备失败继续record、初始pressure立即/后续不推迟deadline、到期捕获live位置、flush取消/disable/resume。本地历史持久化回归通过，622文件来源覆盖与diff通过，strict仍1。基线捕获/偏好maxEntries设置、一般compiler/live成本、全局registry与settled生产派发/Editor接入仍未完成；Windows5根因保留，FS-006禁用，正式exe未更新。


2026-11-04 生产快照物化/编码：PixelHistory.materialize按legacy materializeLocalHistorySnapshot迭代追溯base、archive decode/Document clone、snapshotFrameId后顺序hydrate redo，直接复用prepare/applyLocalHistoryPixels，不安装普通undo、不逐步编码。未知path/layout仍报错，原生maxEntries限链长。encodeJournalSnapshot对archive直接复用Data、Document直接编码、increment仅在需checkpoint时物化；encodeHistoryProject复用工程编码器，无preview/默认level6、timelapse PNG存储，普通save0/recovery1不变；JournalWriter空encoder现在使用真实默认实现。预算测试六组实际legacy generation plan已切换生产codec，补充源像素/revision/history不变、valid缩时PNG字节存储/reopen、unsupported/tiny budget拒绝和默认writer真实写盘。local-history-budget0.61s/hydration0.20s/persistence0.27s、recovery-codec0.05s、project-save0.65s及raster-resources0.38s均通过；622来源覆盖/diff通过，strict仍1。通用compiler/live成本、其他layout/结构hydrate、全局registry/settled生产派发与Editor/UI尚未完成，Windows5根因保留，FS-006禁用、正式exe未更新。


2026-11-04 通用compiler字节视图核心：直接迁移compileLocalHistoryDelta的类型拒绝、不同长度整段替换、对齐32位跳过、最长1024byte补丁/尾部相等裁剪与bytes计数。输入保留typed view offset/length，输出独立copy的before/after，原生bounds/expandedBytes/maxEntries门禁；不伪造全Document编译。复用TS loader执行实际完整legacy compiler，74组空/相同/对齐与非对齐、1024边界、dense/sparse、Uint16/Uint32/DataView、type change/grow/shrink对照，逐patch offset/内容/计数一致并独立重放得到目标bytes；local-history-budget通过0.87s。对象双向别名映射/primitive Object.is与字段顺序、路径/region/affected元数据及完整runtime Document adapter仍未迁移，Writer compiler继续显式依赖。无Editor/UI启用，正式exe未更新。


2026-11-04 通用对象比较core：compareHistoryObjects迁移Object.is/NaN/正负零、String primitive UTF16计费、双向对象映射/循环、仅root忽略identity字段、按before Object.keys顺序、数组长度/键、非Object prototype退回、替换view aliases，复用74组byte core。输出origins/affected顺序/region frame与normalize标记；native显式DFS及node/property/task/patch/bytes预算。执行实际legacy full compiler产生32组runtime图，逐patch path/value/offset/alias、cost、origin/invalidation完全对照，含field reorder、array hole、共享拆分/合并/循环、Float64字节与共享Object.is、layer/runtime门禁。local-history-budget通过0.78s。图输入需真实身份和字段序，不以project JSON代替；原生Document graph adapter、result->Delta bridge及生产compiler串联仍未完成。FS-006禁用，正式exe未更新。


2026-11-04 compiler结果Delta桥接：historyDifferenceDelta/compileHistoryGraphs把比较结果转为既有Delta+buffers，复用encodeDelta归档。匹配legacy encodeHistoryDelta/JSON.stringify：undefined side省略、非有限number为null、signed-zero为JSON0，保留UTF16/string/path/alias、origins/label/bytes/invalidation/affected/normalize；typed view按可见字节和type写外置buffer，保留expanded/manifest门禁。32组runtime图中23个非null结果的原生ZIP资源集、完整JSON结构和每个buffer字节与实际legacy编码一致；原生decode通过，实际legacy decodeHistoryDelta --verify反读全部23原生产物deepEqual通过。local-history-budget通过1.24s。Document真实runtime graph adapter及Writer生产generic compiler串联仍未完成，FS-006禁用，正式exe未更新。


2026-11-04 共享identity写入登记表：JournalWriterRegistry按legacy writeQueues/sessionWrites/latestWrites统一每个应用history store的写入。相同identity的不同会话复用既有JournalWriter单运行/待写替换；owner派发后释放idle queue，弱session records及snapshot/transition缓存跨queue重建保留。latest弱键按实际rememberLatestWrite插入顺序限定256，命中不刷新顺序；淘汰不取消运行/待写，失败清理不覆盖更新记录，restore遇busy不登记。LocalHistoryRecording增加registry+identity接入，不持有可被idle释放的queue引用。原生使用应用持有的单服务实例适配renderer模块全局，Editor实例化及生产调用尚未接入。

直接执行旧版persist、rememberLatestWrite和restore登记代码块及实际LatestTaskQueue，生成527条观测；原生逐项对照ack身份/queue数量/latest键数量及drain后写入次数，覆盖256淘汰运行identity、跨session待写替换、显式save粘滞与idle清除。补充跨idle queue转移缓存复用、ready去重、关闭session/snapshot释放、worker失败/owner回调错误隔离、失败重试和录制协调器跨会话失效。最终local-history-persistence通过0.25s；625文件来源覆盖及证据快照通过，strict因现存缺口仍1，diff检查通过。日志native/build/history-registry-{build,build-final,tests,tests-final,provenance,strict}.log；构建/测试句柄全部结束。Document真实runtime图adapter/通用compiler、live成本、settled生产事件及Editor/UI接入仍未完成；Windows5原子替换根因保留。FS-006继续partial/入口禁用，正式exe未更新，无UI运行验收。


2026-11-04 解码资源真实比较图：appendDecodedHistoryResourceValues直接读取Document画笔/参考图/切片，为既有比较图追加实际字段名、值、数组长度、字段顺序与完整像素字节；画笔colors/sourceX/sourceY保留enumerable undefined，颜色Uint32/参考图Uint8Clamped/coverage Uint8保持typed tag，透明像素RGB不丢失。共享reference pixel owner在单次capture内复用view节点；捕获拥有独立字节，不用可复用native地址伪造跨capture Object.is身份。画笔metadata尺寸/来源默认值与实际brush不一致明确拒绝；节点/字符串/字节预算失败回滚新增节点，不修改已有owner。

实际legacy createDocument/encodeProject/decodeProject新增12组资源工程对，覆盖空/相等、Unicode/坐标/来源undefined变化、coverage/colors/参考图字节变化、colors有无、尺寸增长、增删资源及两个独立解码参考图。原生逐项打开真实工程、直接构图，再对照legacy runtime图的字段序/标量/字节/别名双射；随后compiler结果与实际legacy Delta编码比较。合计74 byte-view及44 object图；31个非null原生Delta由实际legacy decodeHistoryDelta反读deepEqual通过。补充native共享参考图owner、捕获后源更改不影响字节、undefined、三种预算rollback和metadata分歧拒绝。local-history-budget最终通过0.90s；625来源覆盖/证据快照通过，strict因现有缺口仍1，diff通过。日志native/build/history-resource-values-{legacy,build,build-final,tests,tests-final,reverse,provenance,strict}.log，全部构建/测试句柄结束。

本次仅decoded resource fragment，不是完整live Document compiler；palette原始entry/order、layer/cel/mask与root元数据、live字段生命周期及Editor/settled接入仍未完成，不能将resource图测试解释为全文档等价。FS-006保持partial/入口禁用，正式exe未更新，无UI运行验收，Windows5原子替换根因仍保留。


2026-11-05 解码动画元数据比较图：appendDecodedHistoryTimelineValues直接构建frames/loopSections/activeFrameId/loop/tilesets的真实值图。enabled帧省略disabled，disabled保留true；repeatCount无限和图块layout空槽为enumerable null；RGBA图块sheet保留Uint8ClampedArray tag与透明RGB原始字节。复用既有tilejson validate并补充decoder的完整slot覆盖要求，拒绝不规范frame/loop/range/direction/repeat/name；free-tile source覆盖后的set名称按实际source核对。抽出内部CompareAppend复用资源构图，并计入已存在节点的文本与去重backing bytes，修正跨片段拼接预算重复从零计数问题；失败只回滚新增节点。

实际legacy createDocument/encodeProject/decodeProject新增17组工程对，原生逐字段序/标量/typed bytes/别名图对照后编译并比较legacy Delta。覆盖duration、disabled字段结构变化、activeFrame/loop、repeat null到9999、四种direction、Unicode名称/range、增加frame/删除loop、tileset像素/名称/slot移动/尺寸/增加/空数组。补充已捕获值不随native duration变动、跨append累计byte预算、node/string rollback、缺slot/未trim名称/无效direction拒绝。合计74 byte-view与61 object图；44个非null原生Delta由实际legacy decodeHistoryDelta反读deepEqual通过。local-history-budget最终通过0.79s，625来源覆盖及证据快照通过，strict因现存缺口仍1，diff通过。日志native/build/history-timeline-values-{legacy,build,build-final,tests,tests-final,reverse,provenance,strict}.log，全部构建/测试句柄结束。

仅decoded timeline片段；完整Document根对象、palette、layer/cel/mask及live身份/字段生命周期、通用live weigher和Editor/settled生产事件仍未接完。FS-006保持partial/入口禁用，正式exe未更新，无UI运行验收；Windows5替换根因仍保留。


2026-11-05 缩时录制比较图与缺省状态：appendDecodedHistoryRecordingValues直接构造实际normalized timelapse设置/快照键序、原始数字/布尔/字符串、enumerable undefined changeScore、PNG Uint8Array可见字节及local引用。PNG作为opaque bytes，不解码、不读library。核对实际restoreProjectTimelapse发现native此前把缺失/非有限changeScore统一成0；Frame新增historyChangeScoreUndefined保留运行时undefined，同时既有compact排序仍使用0，工程encode省略该JSON值，修正roundtrip语义。local解码直接保留原对象：historyLocalKeys保存实际Stringify键序，比较及重新保存沿用，避免固定顺序替代；未知extension字段仍按已有native门禁拒绝。比较拥有可见字节，完整ZIP backing身份/费用继续由已有cost adapter负责，不把比较图当成transfer-cost图。设置/帧/时间/引用与预算校验失败只回滚新增节点。

实际legacy encode/decode新增16组录制工程对，覆盖三种quality/两种mode、设置变动、空/相等、缺失/NaN/有值score、时间、PNG byte/长度变化、external reference JS-safe大offset、local键序改变及原序patch顺序、embedded转local和增加frame。原生直接打开Document构图，与legacy runtime图逐字段序/值/typed bytes/别名对照后再compile；合计74 byte-view与77 object图，58个非null原生Delta由实际legacy decodeHistoryDelta反读deepEqual通过。实际legacy decodeProject还反读32个native重新保存工程，对照完整timelapse及local Object.keys，证明缺省score及原字段序跨保存保留。native补充捕获后源字节更改隔离、设置/非规范时间/无效local shape拒绝以及预算rollback。

local-history-cost5.80s、local-history-budget1.12s、timelapse0.66s、timelapse-restore0.37s全部通过。625来源覆盖/证据快照通过，strict因现存缺口仍1，diff通过。日志native/build/history-recording-values-{legacy,build,build-final,tests,reverse,provenance,strict}.log；全部构建/测试句柄结束。完整Document图（palette/root/layer/cel/mask）、一般live weigher/字段身份生命周期与Editor/settled生产派发仍未完成；FS-006继续partial/入口禁用，正式exe未更新，无UI运行验收，Windows5原子替换根因保留。


2026-11-05 解码调色板比较图：appendDecodedHistoryPaletteValues以保留的ReadManifest提供实际palette entry/color对象键序、缺失/null/空name以及独立paletteOrder，以Document提供经门禁核对的当前值与规范槽位。复用从prepareEditableImport原逻辑抽出的prepareEditablePalette，不复制或重建完整raster；核对source archive身份、project ID、每个entry及columns/slots/nextId，变化后明确拒绝旧decoded捕获。颜色通道读取原JSON数值；未知entry/color扩展字段拒绝，预算失败回滚新增节点。Windows GetObject宏与WinRT方法冲突已通过局部undef修正。独立paletteOrder与槽位遍历序不一致的既有导入限制仍保留并测试，不能视为该缺口已完成；未实现一般live palette字段生命周期。

实际legacy createDocument/encodeProject/decodeProject及compiler新增13组调色板工程对：相等/空、Unicode与透明RGB、名称缺失/null/空、entry及color键序变化、带转义字段样文本的名称、顺序变更、列数/槽位间隙/nextId、增加/删除颜色。原生打开实际工程并构图，逐字段序、标量、数组长度及别名双射对照，再比完整Delta JSON及外部资源。补充不修改revision、跨append节点/字符串预算回滚、foreign archive身份、已编辑颜色、未知color字段和独立order/slot门禁回归。

local-history-budget通过1.36s，project-import通过0.03s；合计74 byte-view及90 object图，实际legacy decodeHistoryDelta反读66个原生Delta、decodeProject反读32个native重存录制工程均通过。625文件来源覆盖/证据快照通过；strict仍因已登记迁移缺口退出1，diff检查通过。日志native/build/history-palette-values-{build,build-final,tests,reverse,provenance,strict}.log；全部构建/测试句柄结束。仅验证decoded palette片段，完整Document root/layer/cel/mask、一般live比较/成本/身份生命周期及Editor settled生产派发仍未完成；FS-006保持partial/入口禁用，正式exe未更新，无UI运行验收，Windows5原子替换根因保留。


2026-11-05 解码根元数据真实比较图：appendDecodedHistoryMetadataValues追加decoder顺序的schemaVersion、调用方提供的runtime document ID、name/width/height/colorMode/pixelFormat/activeLayerId、已接入空canvasReferences、可选outlineSettings、displaySettings/grid/可选symmetryCenter、statistics、filePath null/dirty false、createdAt/updatedAt和layerPanelState。outline直接迁移legacy normalizeOutlineSettings各字段/颜色/方向默认值及取整钳位；panel直接迁移实际normalizeProjectLayerPanelState的ID过滤、去重、active/group/anchor回退与collapsed数组，独立于native当前UI选择。预算失败回滚新增节点；source身份及native元数据必须一致。缺失时间戳依赖同一decode时钟上下文、空名称依赖实际decoder本地化上下文，当前显式拒绝，未近似推断。完整root字段合成、layer/group/cel/mask和live生命周期仍未接完。

核对实逻辑发现原生工程导入曾误用拖动setter，把对称中心钳位到画布并量化为半像素；legacy normalizeProjectDisplaySettings保留任意有限坐标。新增setImportedSymmetryCenter只校验有限值，createEditableDocument改用该入口；互动setSymmetryCenter维持旧有半像素/画布钳位。比较捕获核对中心（包含源缺省中心）及grid原点的signed-zero语义，变化后拒绝旧捕获。

实际legacy encode/decode/compiler新增19组工程对，覆盖相等/Unicode名称/尺寸、pixelFormat缺省、统计JS安全大整数与非法值归零、dates、grid取整/flags/缺省、任意小数与画布外对称中心/可选字段结构、outline有无/颜色/厚度/方向/所有kernel与position分支（本轮覆盖round/square/horizontal/vertical、inside/outside/both）、非法字段归默认、array对象形态及panel过滤/分组/anchor/collapse。原生逐字段序/标量/数组长度/别名双射对照后再compile和比较完整Delta JSON/resources。补充捕获不改revision、source/metadata/预算rollback、缺失时间戳拒绝、缺省中心变化拒绝、导入坐标保真与工具仍钳位，以及非有限导入中心拒绝。

local-history-budget最终1.19s、project-import0.03s通过；合计74 byte-view及109 object图。实际legacy decodeHistoryDelta反读81个原生Delta；decodeProject反读5个原生重存元数据工程，核对displaySettings/statistics/name/dimensions/format/dates，证明fractional/outside中心跨保存保留；已有32个录制重存工程反读继续通过。625文件来源覆盖/证据快照通过，strict因现有迁移缺口仍退出1，diff检查通过。日志native/build/history-metadata-values-{build,build-final,tests,tests-final,reverse,provenance,strict}.log；全部构建/测试句柄结束。FS-006保持partial/入口禁用，正式exe未更新，无UI运行验收；一般live weigher/身份字段生命周期及Editor settled生产派发、Windows5原子替换根因仍未完成。


2026-11-05 分组/样式及蒙版解码比较片段：appendDecodedHistoryGroupValues逐项构造实际groups键序、可选panelOrder/displayColor/description/parentGroupId/clippingMask/layerStyles/cumulativeBlend及普通标量。共享compareColor/compareGradientMap/compareLayerStyles构建完整规范化样式值（gradient-map、stroke、shadow、innerGlow、colorOverlay、gradientOverlay），为后续layer/cel图合成复用；gradient stop强制opaque RGB、scope为layer、方向按kernel规范，shadow Number转换产生的负零从保留源字段恢复到比较图。源archive身份、组顺序/值/样式signature及父字段presence变化明确拒绝旧decoded捕获；预算失败回滚新增节点。

实际发现并修正两项既有迁移偏差：readColorOverlay原先只接受number且对部分flag严格拒绝，现直接按legacy normalizeLayerStyles的record/Number()/严格true/not-false规则解码，复用legacyjson::number支持数字字符串、null、布尔、数组及NaN fallback，gradient-map颜色仍遵从其独立strict-number规则；JSON array样式解码为默认值，重存不再错误地当成JsonObject解析。父组缺失字段原先被保存为null：ManifestGroup与timeline::Group新增parentGroupIdPresent（原生新建默认存在，解码按HasKey设置），import/snapshot/encode保留该状态，不再从旧archive推断live父字段。显式tree位置写入、复制/粘贴/解组更新presence；moveLayerPanelRows的before回放按旧版applyLayerPanelTree/undo写入null语义处理。直接执行实际legacy moveLayerPanelRows与返回undo/redo产生四组父字段观测，原生逐组核对id/presence/parent；属性可见性撤销保留原缺失字段。其他层级命令的完整字段生命周期/撤销等价性尚未全面审计。

appendDecodedHistoryMaskValues复用validateMasks和normalizedMaskPixel门禁，构造layerMasks/groupMasks数组、slot/owner字段、实际locale名称、正常字段序、可选linkedMaskId/autolink与独立Uint8ClampedArray。每个mask捕获拥有新RGBA字节，即使链接或源资源共享也不伪造JS像素view别名；拒绝未规范化颜色/可见性/moveWithOwner/geometry/name，预算失败回滚。捕获不改document revision，后续源像素变化不改已捕获数据。名字由调用方传入实际decoder locale，不用native UI文本近似。

实际legacy encode/decode/compiler新增17组groups/style与7组mask工程对，合计74 byte-view及133 object图。覆盖空/相等、Unicode/可选元数据、parent缺失/null/重挂/增删组、全部样式设置/Number强制转换/array/null/负零shadow、四种kernel/gradient排序与透明RGB，以及layer/group masks空/相等/尺寸/偏移/flags/灰度bytes/链接和独立链接view。每个工程先对照graph字段序/标量/数组长度/别名双射，再比较完整Delta JSON及资源。首次发现分组测试调用方在追加节点后使用失效vector引用，已改为先完成append、再取得根owner；保留有文件/节点/键序上下文的失败诊断。

最终8项通过：local-history-cost6.37s、local-history-budget2.15s、project-import0.13s、project-save0.92s、project-save-raster-resources0.40s、project-manifest0.32s、document-layer-groups0.06s、document-layer-group-structure0.04s。实际legacy decodeHistoryDelta反读96个原生Delta；decodeProject按legacy canonical encode/decode反读48个native分组/蒙版重存工程（包含array样式与父字段presence）；已有5个metadata和32个录制重存反读继续通过。625文件来源覆盖与证据快照通过，strict因现有迁移缺口仍退出1，diff检查通过。日志native/build/history-group-mask-values-{legacy,build,build-final,build-presence,build-verified,tests-verified,reverse,provenance,strict}.log；全部构建/测试句柄结束。

仍只是decoded片段：空字符串parent在legacy是string而native拓扑折叠为无父，新增实际legacy工程证据并在比较入口显式拒绝；缺省本地化组名仍需真实decoder上下文。完整layer/cel/raster图、一般live身份/字段/成本生命周期及Editor settled生产派发仍未完成，FS-006保持partial/入口禁用，正式exe未更新，无UI运行验收。Windows5原子替换根因仍保留，未用重试掩盖。


2026-11-05 解码栅格存储比较值：扩展既有DecodedHistoryRasterStorage的resource/geometry缓存，新增显式retainComparisonBytes准备模式及appendComparison。默认cost-only模式仍不保留raw像素/payload/offset字节，延续原有成本路径；comparison模式为捕获独立拥有所需数据，不走dense展开。复用既有sparse header/table/entry range/duplicate slot验证，生成实际Int32Array little-endian tileOffsets、Uint8Array payload、tile rectangle visibleBounds或null及runtime字段序。raw按decodePixels(dataFile/encoding/dimensions)键共享Uint8ClampedArray view；sparse按相同键共享runtime对象，而每个surface按historyDocumentTransferView新建独立4byte Uint8Clamped占位view。单次调用组装全部surface保证别名一致，独立调用不伪造跨capture identity；成本图的完整ZIP backing身份仍由既有cost adapter独立处理。节点/字符串/累计bytes失败只回滚新增节点，未知资源/空指针/未准备比较bytes显式拒绝。

实际legacy encodeProject/decodeProject/historyDocumentTransferView/compiler新增12组工程对，合计74 byte-view及145 object图。覆盖raw相等/字节变更/共享cel视图、稀疏空/非空/边缘2x6小块/多tile/变更/空到内容/raw-sparse结构，以及ZIP stored、deflated raw与deflated sparse。原生直接按真实manifest准备storage，对照实际transfer graph键序/标量/typed bytes/array与alias双射后再比较完整Delta JSON及资源。原生安全检查覆盖raw共享视图、sparse独立placeholder但共享runtime、多次捕获新节点、缺少准备/未知resource/null、跨append byte/node/string rollback。当前仅storage片段，不把测试根layers=[]当成实际图层可增量编译证据：真实compiler对未物化runtimeRaster图层仍须返回null，该既有门禁未移除。完整layer/cel字段图、特殊图层rendered storage与实时栅格生命周期尚未接入。

最终local-history-cost通过9.02s，local-history-budget通过2.06s；实际legacy decodeHistoryDelta反读106个原生Delta，48组分组/蒙版、5个metadata与32个录制native重存反读继续通过。625文件来源覆盖及证据快照通过，strict因现存迁移缺口仍退出1，diff检查通过。日志native/build/history-raster-values-{legacy,build,build-final,tests,tests-final,reverse,provenance,strict}.log；全部构建/测试句柄结束。FS-006保持partial/入口禁用，正式exe未更新，无UI运行验收；一般live比较/成本/字段身份生命周期与Editor settled派发仍待完成，Windows5原子替换根因保留。


2026-11-05 图层/Cel 解码比较片段：新增 appendDecodedHistoryRasterValues，以实际 project-format-decode、normalizeCels、applyFrameSurfaces 与 historyDocumentTransferView 为依据，构造 decoder 顺序的 layer/cel 对象。layer 按活动帧解析链接根后投影 geometry/opacity，保持与 cel.surface 不同的 owner；Cel 保留自身 linkedCelId、非零 zIndex、可选 opacity、显式 text:undefined 和独立 surface 字段序/storageOrigin。复用先前 compareLayerStyles/compareGradientMap 和 DecodedHistoryRasterStorage，一次组装全部 layer/own-cel 存储，保留 raw view 共享、sparse runtime 共享及每个 surface 的独立 placeholder。同时提供 compiler 所需 layer 顺序、width/offset、零 storage origin、runtime 标记及 activeFrameId；只在全部节点构造成功后发布这些元数据。

捕获先核对原生反向 layer 顺序、元数据、Cel 顺序/链接/独立参数/解析后像素、source archive 身份及活动帧；拒绝已改变值、已有 layer 比较元数据及未适配的 text/tilemap/free-tile/linked-layer 情况。支持普通 layer 的样式、背景 canvas/preset 和 adjustment gradient-map。当前只承接 schema21 且原生已有完整 slot 的解码状态；空字符串 groupId、缺失 slot、旧版本 compact-storage、特殊图层渲染与一般 live 生命周期尚未适配，不由此宣称完整 layer 能力。预算失败回滚新增节点并保留已有 owner 与比较元数据；捕获拥有独立字节，跨捕获不复用 identity。

实际 legacy encodeProject/decodeProject/historyDocumentTransferView/compiler 新增21组 layer 工程对，累计74 byte-view及166 object图。覆盖相等/Unicode/可选属性、活动Cel opacity（含缺失和零）、像素/geometry/zIndex/group/style、canvas与preset背景、adjustment、非活动Cel、活动帧切换、链接Cel及其活动投影、多个layer及稀疏空/非空/变化。测试先逐项核对 graph 键序/标量/typed bytes/alias 双射、layer invalidation geometry/activeFrameId，再比较完整非null Delta JSON与外部资源。真实 layers 含 runtimeRaster 时仍按旧版返回null，未以 layers=[] 的存储片段替代该验收。

原生安全检查新增 stale source/名称/描述/flags/style/Cel opacity/zIndex/offset/pixel/活动帧拒绝、capture不改revision、layer与surface独立owner但共享raw view、显式undefined、跨capture独立bytes，以及storage完成后owner预算失败的事务回滚。local-history-budget最终通过2.10s；实际legacy反读115个原生Delta，已有48个group/mask、5个metadata、32个recording原生重存工程反读继续通过。625文件来源覆盖/证据快照通过；strict因既有迁移缺口仍退出1；diff检查通过。日志 native/build/history-layer-values-{legacy,build,build-final,tests,tests-final,reverse,provenance,strict}.log；所有构建/测试句柄均结束。本轮只构建测试目标，正式exe未更新，无UI运行验收。

后续仍需完整Document root合成、特殊/rendered layer和linked-layer共享同步、一般实时对象身份/可选字段生命周期/成本及Editor settled生产派发。FS-006维持partial且入口禁用；Windows5原子替换问题根因仍未解决。整体“完成软件所有功能迁移”目标保持进行中。


2026-11-05 初始解码完整根对象比较：新增 decodedHistoryComparison，复用此前 metadata/raster/group/palette/resources/timeline/masks/recording 全部比较片段，沿用 InitialHistoryDocumentCost 的 HistoryDecodeContext（真实运行时document ID与decoder locale蒙版名）。按实际 project-format-decode 的根字段顺序合成：schema/id/name/dimensions/mode/format、layers/groups/active、palette/layout/resources、canvasReferences/tilesets、animation（frames/cels/layerMasks/groupMasks/loopSections/activeFrameId/loop）、可选outline、display/statistics/recording/slices、filePath/dirty/dates，最后追加layerPanelState。返回独立拥有的graph，不改变Document；保留raster提供的layer invalidation metadata及资源view/runtime别名。metadata临时owner不在返回root可达路径内，但累计node/string/byte预算仍包含该分配；没有把比较所需的紧凑bytes当作JS完整backing内存成本。

实际legacy工程新增21组完整文档对，累计74 byte-view和187 object图。覆盖相等、name、pixels、layer/opacity、brush/reference/slices、palette/layout、grid/outline/symmetry、statistics/dates、groups/style/panel、frame duration/active/linked cel、recording、tilesets、layer/group masks/linked mask、adjustment、background，以及sparse gate和多领域同时变更。每份原生graph先对照真实decodeProject/historyDocumentTransferView的全部字段序/标量/typed bytes/对象alias双射及layer geometry/activeFrame；再比较actual compiler完整非null Delta JSON/resources。另从相同真实decoded document读取historyDocumentBytes，42份before/after均与同一decode context下既有InitialHistoryDocumentCost一致，包含栅格和recording共享ZIP backing场景。

新增安全检查：不同runtime ID的独立捕获仍受root-only id exclusion且编译为空Delta；不同capture字节独立拥有；整图累计byte/string及最终root node预算超限拒绝；缺少ID/实际mask名称、source archive不符拒绝；捕获不改revision/history；原生资源之后变化或后续捕获失败不改已返回graph。local-history-budget最终通过1.91s。actual legacy decodeHistoryDelta反读122个原生Delta；既有48个group/mask、5个metadata及32个recording原生重存反读继续通过。625文件来源覆盖/证据快照通过，strict因已登记迁移缺口仍退出1，diff检查通过。日志 native/build/history-document-values-{legacy,build,build-final,tests,tests-final,reverse,provenance,strict}.log；全部构建/测试句柄结束。本轮只构建测试目标，正式exe未更新，无UI运行验收。

本阶段完成的是已有门禁内的初始decoded根对象组装。仍未支持rendered text/tilemap/free-tile和linked-layer同步比较、缺失timeline slot、任意live对象identity/可选字段生命周期、解码本地化/时钟fallback上下文，以及一般live成本与Editor settled生产派发。后续须以此为起点补齐这些能力；不得把初始graph直接绑定生产实时编辑。FS-006保持partial/入口禁用，整体功能迁移目标进行中；Windows5原子替换根因仍未解决。


2026-11-05 文字解码比较片段：compareTextCel接入完整decoded根对象，保留UTF16内容、字体128码元截断、样式区间显式color:undefined、变换矩形扩展字段与JS键序、取整/截断负零，复用既有textjson键序解析。15组实际legacy工程对覆盖文字/字体/代理码元/布局/重叠样式/矩形扩展/链接帧/稀疏及原JSON数值强制转换。完整graph字段序、标量、typed bytes、alias及同上下文historyDocumentBytes逐项对照。发现并修复历史增量编译及归档Stringify的孤立代理码元UTF8替换：javascriptJsonUtf8按JSON.stringify转义孤立代理码元、保留合法配对；实际legacy反读129个原生Delta。另修正无效transforms过滤为空后再次normalize省略字段的成本与比较语义。新增stale text/font/color/origin/transform拒绝、预算回滚及捕获隔离检查。
local-history-cost6.63s、local-history-budget2.09s、local-history-archive0.07s通过。625来源覆盖通过，strict仍因现存迁移缺口退出1。日志history-text-values-{legacy,build-final,build-verified,tests,ctest,reverse,provenance,strict}。只构建测试目标，正式exe未更新，无UI验收。特殊tilemap/free-tile/linked-layer、任意live身份生命周期及Editor settled生产派发仍待完成，FS-006保持partial/入口禁用。


2026-11-05 tilemap解码比较：appendDecodedHistoryRasterValues接入tiles::render，依据source manifest图块集渲染并核对原生resolved surface与grid，拒绝原生图块集值变化。每个实际有surface的Cel独立拥有新RGBA view，活动layer共享所属Cel view；不复用存档raw/sparse缓存替代渲染结果。rendered surface不含storageOrigin/runtimeRaster；layer tilemapTilesetId及Cel tilemap/text顺序、cells空槽/flag/rotation沿用真实decoder。无数据链接Cel保留首次normalize的dense字段序/manifest cell序及sparse省略语义；原生额外渲染surface不改变返回旧版字段形态。复用现有原生tiles::render，无新渲染算法。避免surfaceFor复制普通栅格，按引用读取源/渲染存储。
实际legacy新增15组完整工程对，累计74 byte-view与217 object图，覆盖空/非空/尺寸/4种旋转与翻转/图块像素/链接、链接元数据none/sparse/dense/surface及乱序dense。完整graph逐字段序/标量/typed bytes/alias/geometry与同上下文transfer cost核对后再compile；132个原生Delta由actual legacy decodeHistoryDelta反读通过。新增stale cell/rotation/tileset pixel拒绝、layer-Cel view共享、rendered无storageOrigin及预算失败回滚。4项回归通过：local-history-cost6.07s、local-history-budget1.86s、local-history-archive0.06s、tilemap-project0.56s。625来源覆盖通过；strict因已登记缺口仍退出1。日志history-tilemap-values-{legacy,build-final,tests-final,ctest,reverse,provenance,strict}。仅测试构建，正式exe未更新，无UI运行验收。
仍需free-tile与linked-layer比较、一般live身份/字段生命周期与成本、Editor settled生产事件和完整持久化恢复服务，缺省locale/clock及缺失timeline slot等门禁仍保留。FS-006维持partial/入口禁用，Windows5原子替换根因仍待处理；不代表整体功能迁移完成。


2026-11-05 现代free-tile解码比较：完整decoded根对象接入自由图块来源和实例值图。仅free-tile存在时复用prepareEditableImport完成已迁移的ownership/名称/alias规范化，复用free_tiles::render生成真实像素；普通raster/tilemap不额外prepare。核对原生实例、来源及规范化图块集内容，拒绝过期捕获。来源数组按setId共享，layer/Cel渲染视图沿用所属Cel身份；source描述/颜色可选，instance opacity/blend与非零变换字段按实际decoder顺序构造，rendered surface省略storageOrigin/runtimeRaster。历史legacy source与链接free-tile Cel仍受原导入门禁，未冒充已完成。
实际legacy新增18组完整工程对，累计74 byte-view与235 object图，覆盖空/相等、位置、source metadata/name/hidden、instance metadata、4种变换、来源别名、共享layer、像素、半透明叠加、多source及顺序、未知字段规范化。完整字段序/值/typed bytes/alias/geometry及同上下文historyDocumentBytes对照后再compile；139个原生Delta被actual legacy decodeHistoryDelta反读通过。新增stale实例位置/透明度、source名称/offset、tileset pixels拒绝及字节/节点预算回滚，layer与Cel view共享检查。
4项回归通过：local-history-cost5.53s、local-history-budget2.13s、local-history-archive0.06s、free-tile-project10.75s。625来源覆盖/证据快照通过，strict仍因已登记缺口退出1，diff通过。日志history-free-values-{legacy,build-final,tests-final,ctest,reverse,provenance,strict}；全部构建/测试句柄结束。仅测试目标构建，正式exe未更新，无UI运行验收。
整体所有功能迁移仍未完成。下一步仍需linked-layer比较同步、链接free-tile与历史ownership导入、一般live对象身份/字段生命周期/成本及Editor settled生产事件与恢复服务。缺失timeline slot、locale/clock等门禁和Windows5原子替换根因继续保留；FS-006为partial且入口禁用。


2026-11-05 linked-layer初始比较：允许普通链接栅格layer，linkedContentId位于name之后，复用既有DecodedHistoryRasterStorage保留shared view/runtime及各自owner与偏移。真实decodeProject只校验链接storage identity，refreshActiveAnimationFrame不会调用normalizeLinkedLayerMetadata；因此初始decoded各层displayColor的原值/presence必须保留，后续ensureAnimationDocument才同步。原生现有导入已同步颜色：捕获核对同步后的第一有效颜色，却以源字段构建比较图；InitialHistoryRasterObjects成本同样改用原decoded字段presence。未改变原生导入时序，也不将此差异宣称完全迁移。
实际legacy新增11组完整工程对，累计74 byte-view与246 object图。覆盖相等/metadata/pixels/color/独立offset、singleton/unlink、sparse、原JSON冲突颜色/缺失首层颜色、多帧。逐字段序/值/typed bytes/alias/geometry与同上下文historyDocumentBytes对照后compile；143个原生Delta由actual legacy反读通过。新增stale linked ID/description/color/offset拒绝、共享view/独立owner及节点预算回滚检查；图值错误增加source/node上下文诊断。
local-history-cost6.21s、local-history-budget2.58s、linked-layers0.39s通过。625来源覆盖/证据快照通过，strict仍因已登记迁移缺口退出1，diff通过。日志history-linked-values-{legacy,build-final,tests-final,ctest,reverse,provenance,strict}。全部构建/测试句柄结束；只构建测试目标，正式exe未更新，无UI验收。
尚未迁移任意实时对象identity/字段生命周期及成本、Editor settled生产派发/完整持久化重开服务、linked free-tile/历史ownership、缺失timeline slot/locale/clock等门禁；Windows5原子替换根因保留。FS-006继续partial且入口禁用，整体所有功能迁移目标保持进行中。


2026-11-05 链接颜色导入/保存时序纠正：本轮追查linked free-tile发现门禁贯穿Timeline::validateFreeTileState、实例放置要求own surface、连接/断开/拖拽入口及复制帧扩展，不能只解除prepareEditableImport拒绝；仍明确未迁移。沿上轮真实legacy证据修正已定位偏差：decodeProject保留每层displayColor，后续ensureAnimationDocument才同步。移除原生prepareEditableImport过早linkedColors同步，比较适配改回直接核对源颜色，无需source/live两套值。新增三组直接prepare/Document检查，覆盖第一/第二层缺颜色和冲突颜色。
实际legacy encodeProject会ensureAnimationDocument，因此保存输出按decoder bottom-to-top顺序取链接组第一有效颜色。project_encode只规范化输出、不修改Document；对11组完整linked before/after工程生成22份原生重存，actual legacy decode反读与canonical legacy encode/decode逐层比较颜色/presence；编码前后原生revision及各层颜色保持。此前初始graph/transfer cost仍对照原decoded状态，143个原生Delta反读继续通过。
4项最终回归通过：local-history-budget2.50s、project-import0.03s、project-save0.57s、linked-layers0.04s。625来源覆盖/证据快照通过，strict因现有缺口仍退出1，diff通过。日志linked-color-decode-{build-final,build-verified,tests,reverse,ctest,provenance,strict}。全部构建/测试句柄结束；正式exe未更新，无UI验收。
整体功能迁移未完成。linked free-tile仍需完整数据/交互/撤销生命周期迁移，原生live身份/成本/settled事件及完整恢复服务尚未接入，FS-006继续partial/入口禁用；Windows5原子替换根因仍保留。


2026-11-05 显式空groupId解码形状：核对legacy project-format-decode.ts:376和458，空字符串保留，只有truthy且未知组才归null。原生timeline用optional absence表示无组；初始decoded比较与transfer cost从原始manifest保留空字符串形状，移除该比较门禁，不改变timeline组归属。新增5组真实legacy完整工程对：empty/null/missing、empty equal、empty-to-null；累计74 byte-view及251 object graph。完整graph字段序/值/alias与transfer cost验证通过；actual legacy反读148个原生Delta通过。非字符串及未知groupId仍有原生导入差异，未解除其契约或宣称迁移完成。
Windows原子替换旧版同样复现error5的证据已重新核对，根因仍未知，未改写算法或增加重试。本轮只构建本地历史测试目标，正式exe未更新，无UI验收；FS-006仍partial/入口禁用，整体所有功能迁移目标进行中。


2026-11-05 图层groupId导入规范化：以legacy project-format-decode.ts:376、454-458为依据，非字符串组ID解码为null，truthy未知组ID清除。原生manifest解析按该规则规范化，prepareEditableImport对内存manifest独立核对组归属；不放松其他字段契约。直接测试未知组导入为无组且源manifest未变。实际legacy新增number/boolean/array/object/unknown string五组完整工程对，完整graph字段序/值/alias与transfer cost通过；10份原生重存由actual legacy解码并核对组归属。累计74 byte-view、256 object graph，actual legacy反读153个原生Delta通过。
local-history-budget2.53s、project-import0.03s、project-save0.52s、project-save-raster-resources0.31s、project-manifest0.19s全部通过；625来源覆盖/证据快照通过，strict因其他已登记迁移缺口仍退出1，diff检查通过。日志native/build/group-normalization-{build,ctest,reverse,provenance,strict}.log。未更新正式exe、无UI运行验收。任意live对象身份/成本/settled事件及完整恢复服务、linked free-tile/历史ownership、缺失timeline slot/locale/clock等仍未完成，FS-006维持partial/入口禁用，Windows5原子替换根因保留，整体所有功能迁移目标保持进行中。


2026-11-05 解码时间fallback：核对legacy project-format-decode.ts:630/634，createdAt/updatedAt缺省分别按字段顺序调用new Date；有效非空字符串不调用fallback。原生此前复用ReadManifest默认fresh时间，本轮将缺省时间改为字段解码时按顺序读取，增加readProjectManifestWithClock供真实legacy/native差分共享时钟。历史比较复用manifest和Document已解析时间，禁止捕获时再次读钟；保留truthy非字符串createdAt门禁（旧版保留其类型，原生尚未表达），支持false/0等falsy值fallback。
7组actual legacy完整工程对共享递增Date/clock，覆盖missing/null/empty/false/zero、updated object、created-only；逐字段图/键序/alias及transfer cost通过，原生检查实际fallback调用次数。累计74 byte-view、263 object graph，actual legacy反读160个原生Delta通过。6项回归全部通过：local-history-cost6.02s、local-history-budget2.64s、project-import0.03s、project-save0.56s、project-save-raster-resources0.34s、project-manifest0.20s。625文件来源覆盖/证据快照通过，strict因既有缺口仍1，diff通过。日志native/build/history-decode-clock-{build,ctest,reverse,provenance,strict}.log；无运行中构建句柄。
本轮仅构建测试目标，正式exe未更新，无UI运行验收。一般live身份/可选字段生命周期/成本、Editor settled生产派发与完整恢复服务、linked free-tile/legacy ownership、缺失timeline slot及locale等仍未迁移；FS-006保持partial/入口禁用，Windows5原子替换根因保留，整体功能迁移目标继续进行。


2026-11-05 图块集名称解码：实际legacy decodeManifestTilesets按string或空值读取name，再trim或默认Tileset。原生复用javascriptTrim。8组真实旧版样例覆盖Unicode首尾空白、全空白、空串、缺失、null、数字、对象及内部零宽字符；完整原生graph/cost检查通过。5项CTest通过：local-history-budget2.86s、tilemap-project0.62s、free-tile-project10.61s、project-save0.53s、project-manifest0.17s。625来源覆盖通过，strict仍1。
旧版反读未完成：Node首次因semi-space内存提交失败退出，独立重跑遭系统资源不足及PowerShell运行时异常。停止重试，保留tileset-decode-name-reverse.log和reverse-final.log；不宣称本轮新增Delta或保存工程已通过旧版反读。正式exe未更新，无UI验收。缺失timeline slot仍受Document::cel/activeSurface完整槽假设限制，不能提前补Cel替代旧版稀疏语义。FS-006及整体功能迁移继续未完成。


2026-11-05 图块名称反读闭环与验证器字节边界：定位前轮OOM到Node Buffer传入actual legacy decodeManifestTilesets，bytes.slice().buffer期待浏览器Uint8Array复制语义；Buffer.slice保留池/整块backing，解压图块资源因此扩大。验证器所有文件工程输入复制为普通Uint8Array，实际legacy源码不改。新增可选case前缀、空scope拒绝、阶段/样例和产物计数。限定8组先通过，再全量271 object验证通过：168个原生Delta、16份tileset-name重存、48组/蒙版重存、5 metadata和32 recording重存；既有linked/group normalization断言仍执行。前轮“反读未完成”由此证据更新为已完成，日志tileset-decode-name-reverse-typed.log与reverse-all.log。正式exe未更新，无UI验收；整体迁移/FS-006仍未完成。


2026-11-05 循环段导入规范化：依据legacy animation-loop-sections.ts normalizeAnimationLoopSections与project-format-manifest.ts normalizeManifestAnimation，移植非array为空、无效条目/引用过滤、首个有效ID优先、端点帧排序、名称trim/64 UTF16单位截断/Loop N默认、方向forward默认、repeat Number/trunc/clamp或null。实际readManifest与decodeProject会先后两次规范化，名称第一次截断后须再次trim；初次差分发现该时序并修正，历史严格名称校验未放松。10组actual legacy完整工程对覆盖名称/方向/repeat/无效重复条目/default编号/非array；完整graph/cost及20份原生重存循环段由actual legacy反读对照通过。累计281 object graph，176个原生Delta反读通过。
local-history-budget2.93s、project-save0.53s、project-manifest0.17s通过，625来源覆盖/证据快照通过，strict仍因其他缺口退出1，diff通过。日志loop-decode-normalize-{build-verified,ctest-final,reverse,provenance,strict}.log。UTF16截断形成孤立代理码元的通用名称存储路径仍需专门适配，不以本轮普通/完整代理对样例宣称已解决。正式exe未更新，无UI验收。live历史对象生命周期与成本、生产settled事件/恢复服务、稀疏缺失slot和linked free-tile等仍待迁移，FS-006保持partial/入口禁用，整体目标进行中。


2026-11-05 帧duration/disabled导入规范化：依据legacy animation.ts normalizeFrame，有限number时长trunc并clamp1..60000，非number/缺失使用100；disabled仅literal true。原生manifest解析替代此前严格整数/范围/boolean拒绝。12组actual legacy完整工程对覆盖fraction/negative/zero/large/string/null/missing/object与disabled true/string/number/null，完整graph键序/值/alias和transfer cost通过，24份原生重存由actual legacy核对frames。累计293 object graph、187个原生Delta反读通过。local-history-budget4.19s、project-save0.69s、project-manifest0.22s通过，625来源覆盖/证据快照通过，strict因既有缺口仍1，diff通过。日志frame-decode-normalize-{build,ctest,reverse,provenance,strict}.log。正式exe未更新，无UI验收；帧ID默认/去重、稀疏slot生命周期、live对象/成本/settled生产事件和完整历史恢复等仍未完成，FS-006保持partial/入口禁用，整体迁移目标进行中。


2026-11-05 Cel zIndex/opacity解码及保存默认值：依据legacy animation.ts normalizeAnimationCelZIndex/normalizeCels及project-format-manifest.ts normalizeManifestAnimation，zIndex按JS Number转换后对有限值trunc并clamp到-999..999，否则0；opacity仅接受有限number并clamp0..1，其余保持缺失。实际legacy encodeProject先调用ensureAnimationDocument，保存时为缺失Cel opacity补入图层opacity；原生project_encode仅在输出补齐，不改变Document中的可选字段、颜色或revision。本轮覆盖未链接初始标量，不代表linked值同步及实时生命周期已完成。
14组actual legacy完整工程对覆盖zIndex fraction/越界/string/array/boolean/null/object和opacity越界/string/null/boolean/object；累计74 byte-view、307 object graph。初始graph/cost逐项对照，28份Cel原生重存与canonical legacy encode/decode比较，actual legacy反读191个原生Delta通过。local-history-budget3.37s、project-save0.55s、project-manifest0.18s全部通过；625来源覆盖/证据快照通过，strict因已登记缺口仍退出1，diff检查通过。日志native/build/cel-decode-normalize-{build-verified,ctest-final,reverse-final,provenance,strict}.log。仅测试目标构建，正式exe未更新，无UI运行验收。
整体功能迁移仍进行中；任意live对象身份/可选字段生命周期/成本、Editor settled生产事件及完整历史恢复服务、linked free-tile/legacy ownership、缺失timeline slot、帧ID规范化和通用名称孤立代理码元等仍待完成。FS-006保持partial/入口禁用，Windows原子替换error5根因仍未解决。


2026-11-05 链接帧Cel保存标量：actual legacy ensureAnimationDocument调用normalizeAnimationCelLinks，将同层链接帧的opacity/zIndex同步为最终来源值后编码；此前原生slot优先会把冲突成员值重新存出。新增差分先复现opacity .8/-3与旧版.25/7不符，再修正project_encode按resolved owner输出opacity及zIndex；不改变Document中原始字段、链接或revision。跨图层linkedContentId只共享像素，各层opacity/zIndex保持独立，未增加错误的跨层标量同步。
新增6组同层链接工程对覆盖源/成员缺失opacity、冲突标量及两种活动帧，另3组跨层链接覆盖独立值与缺失字段。完整初始decoded graph/cost保持对照，新增12份及既有2份同层链接原生重存、全部28份跨层链接重存与actual legacy canonical encode/decode标量比较通过。累计74 byte-view、316 object graph；191个原生Delta反读继续通过（本轮新增样例经初始链接规范化后无新Delta，不虚增计数）。编码前后检查opacity/zIndex/linkedCelId及revision不变。
local-history-budget4.56s、project-save0.63s通过；625文件来源覆盖/证据快照通过，strict因其他已登记缺口仍退出1，diff通过。日志native/build/linked-cel-scalars-{fixtures,build-final,tests-final,reverse-final,ctest,provenance,strict}.log；首次差分失败日志保留。仅测试目标构建，正式exe未更新，无UI运行验收。live历史身份/成本/settled事件及完整恢复服务、linked free-tile、稀疏slot等仍未完成；FS-006保持partial/入口禁用，整体功能迁移目标继续进行。


2026-11-05 帧ID及活动帧/loop规范化：依据legacy animation.ts normalizeFrame/normalizeAnimationTimeline，跳过非object，array按空对象候选处理；缺失/非字符串/JS空白ID按原数组下标生成frame-N，非空白ID原样保留，重复只保留首项。活动帧无效回退首帧，loop仅literal false关闭。空/nonarray帧列表的默认时间线及稀疏Cel联动仍未适配，不解除门禁。保存器移除raw frames[0]必须是对象的假设，直接由规范化状态重建输出帧。
16组actual legacy工程对覆盖ID默认、原下标、默认ID冲突、带空白有效ID、重复首项、无效条目、活动帧回退及loop类型；累计74 byte-view、332 object graph，207个原生Delta反读通过。新增32份及既有24份帧规范化重存按actual legacy检查frames/activeFrameId/loop。既有project-manifest测试仍期待拒绝重复帧，与旧版证据冲突，改为核对首帧ID/时长/活动引用；其他拒绝断言保留。
local-history-budget4.95s、project-save0.63s通过；修正旧断言后project-manifest0.18s通过。625来源覆盖/证据快照通过，strict因已登记其他缺口仍1，diff通过。日志native/build/frame-identity-{fixtures-final,build-verified,tests-final,reverse-final,ctest,manifest-ctest-final,provenance-final,strict}.log；首轮编译错误及旧断言失败日志保留。仅测试构建，正式exe未更新，无UI验收。整体迁移仍进行中，FS-006保持partial/入口禁用；live历史/恢复服务、稀疏slot及linked free-tile等缺口继续保留。


2026-11-05 Cel候选过滤：依据legacy animation.ts normalizeCels与project-format-decode.ts，忽略非object、无效/空ID、重复已接受ID、无效帧引用和重复layerId:frameId槽，校验后才登记ID/槽，再丢弃未知图层。原生按顺序适配，保留后续完整槽导入门禁；broken-reference旧测试从解析报错改为确认Cel过滤，未放松编辑导入。原始Cel遍历增加类型/ID检查，保存器不再要求raw cels[0]对象。
10组实际legacy工程对覆盖重复ID/槽、未知帧/层、null/number、缺失/数字ID、空层ID及无效同ID在前。最后一组完整graph差分发现normalizeManifestAnimation从首个raw ID取有限opacity覆盖accepted值；原生建立firstRawCels索引保留此两阶段语义，保留accepted opacity作为无有限覆盖时的值。完整初始graph/cost及20份新重存与旧版canonical标量对照通过；累计74 byte-view、342 object graph、217个原生Delta反读通过。
local-history-budget4.52s、project-save0.56s、project-manifest0.18s通过；625来源覆盖/证据快照通过，strict因其他已登记缺口仍1，diff通过。日志native/build/cel-filter-{fixtures-final,build-verified,tests-verified,reverse-verified,ctest,provenance,strict}.log。首次graph差异及先前日志保留。只构建测试，正式exe未更新，无UI验收。
本轮只完成上述候选及opacity范围：无效同ID前项的raw资源dataFile/text/tilemap等恢复规则、被丢弃项独有资源的存档登记、inline mask过滤仍须专门差分核对，不能宣称完整异常输入兼容。稀疏slot、live历史身份/成本/settled派发及完整恢复服务等仍未完成；FS-006保持partial/入口禁用，整体迁移目标继续进行。


2026-11-05 同ID原始栅格恢复：依据project-format-manifest.ts normalizeManifestAnimation，规范化后的有效Cel资源元数据来自首个raw ID匹配，槽/linkedCelId/zIndex来自有效候选。原生raster改读已有firstRawCels索引。3组actual legacy完整工程对将同ID无效帧项放前，覆盖非活动帧offsetX/offsetY与相同字节数的宽高变化；完整decoded graph/alias/cost通过，6份原生重存由actual legacy与canonical结果核对Cel栅格尺寸/位置/像素及标量通过。
累计74 byte-view、345 object graph，220个原生Delta全量反读通过；追加栅格保存断言后限定3组再次通过。local-history-budget4.38s、project-save0.53s、project-manifest0.17s通过，625来源覆盖/证据快照通过，strict因其他缺口仍1，diff通过。日志native/build/cel-resource-{fixtures-verified,build,tests,reverse,raster-reverse,ctest,provenance,strict}.log。首次错误payload尺寸及缺失shadow文件样例被actual legacy拒绝，保留诊断日志，不计入通过样例。
本轮未完成通用数值元数据规范化、同ID text/tilemap/freeTiles/mask恢复及被丢弃项独有资源登记；不把读取raw元数据等同于完整异常输入兼容。只构建测试目标，正式exe未更新，无UI验收；FS-006仍partial/入口禁用，live历史/恢复服务及稀疏slot等继续未完成，整体功能迁移目标保持进行中。


2026-11-05 同ID原始文字恢复：依据legacy project-format-manifest.ts normalizeManifestAnimation，先保留有效候选规范化文字，仅首个raw同ID的非null object（含array）覆盖，随后decodeProject再次规范化。原生先解码有效候选text，再按raw object/array覆盖；缺失/null/number保留有效文字，空object/array重置默认。沿用decodeTextCel，不创建新文字规范化算法。
6组actual legacy完整工程对覆盖content/font、missing/null/number、empty object和array，逐项decoded graph/transfer cost对照及12份原生重存文字与canonical legacy encode/decode比较通过。累计74 byte-view、351 object graph，226个原生Delta反读通过。local-history-budget4.52s、project-save0.55s、project-manifest0.17s通过，625来源覆盖/证据快照通过，strict因已登记缺口仍1，diff通过。日志native/build/text-raw-{fixtures-final,build-final,tests,reverse,ctest,provenance,strict}.log；仅测试构建，正式exe未更新，无UI验收。
同ID tilemap/freeTiles/mask恢复、丢弃资源登记、稀疏slot及live历史身份/成本/settled派发与完整恢复服务仍未完成；FS-006保持partial/入口禁用，整体功能迁移目标继续进行。


2026-11-05 同ID图块数据恢复：依据legacy normalizeManifestAnimation移除normalized tilemap/freeTiles后从首个raw ID object恢复、decodeProject校验/渲染；原生两类数据改读firstRawCels。初始history比较不再用过滤后Cel下标索引raw数组，改按ID首项；成本tileShapes仅保留首项，防止后续重复项覆盖来源形状。
8组actual legacy完整工程对覆盖tilemap empty/flip/rotation/dense和现代free-tile empty/position/opacity/rotation。完整graph/键序/alias/cost通过，16份原生重存与canonical actual legacy对比tilemap/freeTiles及渲染栅格尺寸/位置/像素通过。累计74 byte-view、359 object graph，227个原生Delta全量反读通过；追加渲染断言后41组Cel规范化限定反读通过。初次试验误用90旋转单位被旧版free-tile拒绝，改用既有0..3语义，失败日志保留。
local-history-budget4.50s、project-save0.66s、project-manifest0.20s通过；625来源覆盖/证据快照通过，strict因其他迁移缺口仍1，diff通过。日志native/build/tile-raw-{fixtures-final,build,tests,reverse,raster-reverse,ctest,provenance,strict}.log。仅测试构建，正式exe未更新，无UI验收。nonobject/null图块字段、inline mask恢复、丢弃资源登记、稀疏slot和linked free-tile/live历史完整生命周期仍未完成；FS-006保持partial/入口禁用，整体迁移目标继续进行。


2026-11-05 inline mask候选恢复：依据legacy normalizeManifestAnimation仅从首个raw同ID truthy mask恢复到通过normalizeCels的候选，decodeProject再按显式layerMasks优先处理inline并校验owner/frame。原生在候选规范化阶段收集inline（早于未知图层过滤），不再直接解码原始全部Cel的mask；补inline引用校验。原始mask资源引用仍独立登记，以兼容被过滤候选留下的存档资源，不创建相应蒙版；保存沿用既有maskDataFiles清理输出资源语义。
5组actual legacy完整工程对覆盖无效同ID前项mask、重复槽mask忽略、无效帧mask忽略、首项null移除有效项mask及显式槽优先于缺失shadow资源。完整graph/alias/cost及10份原生重存layerMasks与canonical legacy对照通过。首次原生误报unmapped被过滤mask资源，经分开资源登记与语义解码修正，失败日志保留。累计74 byte-view、364 object graph，229个原生Delta全量反读通过。
local-history-budget4.89s、project-save0.53s、project-manifest0.19s通过；625来源覆盖/证据快照通过，strict因其他迁移缺口仍1，diff通过。日志native/build/mask-raw-{fixtures,build-final,tests-final,reverse,ctest,provenance,strict}.log。仅测试构建，正式exe未更新，无UI验收。无效scalar mask完整规范化、通用异常字段/孤立代理码元、稀疏slot、linked free-tile和live历史身份/成本/settled派发及完整恢复服务仍未完成；FS-006保持partial/入口禁用，整体功能迁移目标继续进行。


2026-11-05 蒙版Number转换与链接边界：依据legacy project-format-decode.ts decodeMask，尺寸/偏移先Number转换，正整数尺寸、有限偏移后trunc，flags仅literal true；nonnull显式空linkedMaskId应拒绝。原生复用legacyjson::number，保留原生坐标及解码预算上限，增加空链接Corrupt检查。8组actual legacy完整工程对覆盖string/array尺寸、string/null/boolean/array偏移、非boolean flags及null链接；逐项graph/alias/cost及16份原生重存layerMasks与canonical旧版一致。另新增actual legacy拒绝空链接fixture并由原生project-manifest回归确认。
累计74 byte-view、372 object graph，237个原生Delta全量反读通过。local-history-budget5.31s、project-save0.54s、project-manifest0.17s通过；625来源覆盖/证据快照通过，strict因其他已登记缺口仍1，diff通过。日志native/build/mask-numeric-{fixtures,build-final,tests,reverse,ctest,provenance,strict}.log。仅测试构建，正式exe未更新，无UI验收。
尚未完成全部无效mask/scalar规范化、通用资源字段、稀疏slot、linked free-tile及live历史身份/成本/settled派发与完整恢复服务；FS-006保持partial/入口禁用，整体功能迁移目标继续进行。


2026-11-05 显式蒙版槽候选过滤：依据legacy project-format-manifest.ts normalizeManifestAnimation，layerMasks/groupMasks非array为空，忽略非object、空/非string owner、无效frame及falsy mask，之后decodeProject再核对owner存在和重复语义。原生maskArray/maskCandidate按此顺序过滤，保留原始object资源登记、图层重复首项优先及组重复拒绝。16组actual legacy完整工程对覆盖两类槽的null/numeric条目、invalid frame、empty owner、null/false/zero mask及nonarray；完整graph/alias/cost和32份原生重存layerMasks/groupMasks与canonical旧版对照通过。
累计74 byte-view、388 object graph，253个原生Delta全量反读通过。local-history-budget6.28s、project-save0.67s、project-manifest0.20s通过，625来源覆盖/证据快照通过，strict因其他迁移缺口仍1，diff通过。日志native/build/mask-slot-filter-{fixtures-final,build,tests-final,reverse-final,ctest,provenance,strict}.log。
首次nonarray替换整个含资源列表后暴露unmapped payload门禁：本轮nonarray样例明确从该列表无载荷状态构造，仅证明字段规范化；整列表消失但保留未引用文件的兼容仍待实际旧版资源策略迁移，未一并放行未知资源。首次失败日志保留。只构建测试，正式exe未更新，无UI验收；稀疏slot、linked free-tile、live历史身份/成本/settled派发与完整恢复服务仍未完成，FS-006保持partial/入口禁用，整体迁移目标继续进行。


2026-11-05 Cel栅格偏移规范化：依据legacy normalizeManifestAnimation仅保留finite number offset并trunc，decodeProject缺省0。原生复制首个raw ID资源元数据，规范化offsetX/Y后交既有raster解码，不修改原始JSON；非number/missing默认0，超原生坐标保持Limit。8组actual legacy完整工程对覆盖正负fraction、string/null/boolean/array/object/missing非活动Cel偏移；完整graph/alias/cost与16份原生重存栅格geometry/pixels按canonical旧版核对通过。
累计74 byte-view、396 object graph，261个原生Delta全量反读通过。local-history-budget5.95s、project-save0.59s、project-manifest0.19s通过；625来源覆盖/证据快照通过，strict因其他迁移缺口仍1，diff通过。日志native/build/cel-offset-{fixtures,build,tests,reverse,ctest,provenance,strict}.log。负零、超原生坐标及通用其他栅格字段仍有边界，未声称全部元数据等价。仅测试构建，正式exe未更新，无UI验收；稀疏slot、linked free-tile、live历史身份/成本/settled派发及完整恢复服务仍未完成，FS-006保持partial/入口禁用，整体功能迁移目标继续进行。


2026-11-05 缺失槽只读路径：核对legacy animation.ts applyFrameSurfaces/clearLayerSurface，缺失Cel清空显示且不创建Cel。原生核心新增activeSurfaceIfPresent；canvasPixels遇缺失槽返回透明画布快照，selectionContentBounds返回无内容，不改timeline。沿用已有RasterHistoryFixture构造缺失活动槽，重复查询验证Cel数组/存储、revision/contentRevision/history/dirty保持，现有稀疏owner及撤销测试继续执行。document-raster-history0.05s通过；625来源覆盖/证据快照通过，strict因既有缺口仍1，diff通过。日志native/build/absent-slot-read-{build,ctest,provenance,strict}.log。构建句柄已结束，只构建测试目标，正式exe未更新，无UI验收。
本轮是稀疏生命周期的读取适配：fromImported/prepareEditableImport完整槽门禁仍保留，cel()/activeSurface()/绘图/复制粘贴/保存仍有完整槽假设，尚未实现按旧版时序创建Cel及撤销恢复缺失槽，不能宣称稀疏工程导入完成。下一步需在编辑事务中迁移materialization，而非全局补空Cel。FS-006/live历史完整服务和整体功能迁移继续未完成。


2026-11-05 稀疏选择安全与实际提交生命周期：修正timeline_interaction selectTimelineCel对缺失活动槽cel()解引用、空range anchor selected.back及范围中缺失slot解引用；只选择存在Cel，不创建缺失槽。既有RasterHistoryFixture构造三帧中间缺槽，验证跨槽范围、缺失活动槽toggle/range fallback、Cel数/history/dirty保持；document-raster-history通过。测试发现selectFrame的原生contentRevision用于显示失效会递增，与legacy workspace-selection-mode.test会话contentRevision保持不同，已登记，不以移除断言宣称等价。空槽显式key选择仍无原生表达。
追查legacy workspace-commands-history：commitPixelEdit入栈后才syncActiveAnimationLayer；后者只创建缺失活动Cel，pixel undo不删除。生成器新增实际legacy可执行oracle：refresh后/recordPixel后/commitPixelEdit后均0 Cel，同步后1，undo/redo并同步保持该ID。已通过，明确纠正前轮“下一步撤销恢复缺失槽”的未经证实假设；原生笔画materialization尚未接入，不按错误假设实现。fixture重新生成后原生完整graph/cost及261份旧版Delta反读通过，396 object/74 byte-view保持。
625来源覆盖/证据快照通过，strict因其他缺口仍1，diff通过。日志native/build/sparse-selection-{build-final,tests-final,provenance,strict}.log及sparse-commit-{oracle,fixture-refresh,reverse}.log。只构建测试，正式exe未更新，无UI验收；完整槽导入门禁、笔画预览/取消/失败的独立display storage、稀疏结构及live历史服务仍待迁移，FS-006保持partial/入口禁用，整体功能迁移目标进行中。


### 2026-11-05 缺失槽普通栅格笔画生命周期

依据 legacy core/history.ts 的 recordPixelKnownCurrent/commitPixelEdit、workspace-commands-history.ts 先 push 后 sync，以及 animation.ts 的 createActiveLayerCel：普通栅格缺失槽以独立临时 Surface 预览，取消或无变化提交不创建 Cel；有效提交仅创建活动槽，继承 layer.opacity，像素撤销/重做保留 Cel ID。临时存储沿用原生绘图直达像素缓冲，使用全画布缓冲，尚未等同旧版稀疏 runtime raster 性能。缺失槽关联图层明确阻止，特殊图层和整体稀疏导入门槛继续保留。新增核心回归检查预览、连续绘制、取消、透明无变化、提交和撤销重做；构建与测试结果见后续记录，不代表 UI 实际验收或完整稀疏迁移。

验证：正式 build 目录仅构建 document-raster-history-tests，最终构建成功；执行结果 `Document raster history and sparse fill passed`（exit 0，native/build/sparse-stroke-tests.log）。来源覆盖 625 文件通过，--strict exit 1（已知迁移缺口），git diff --check exit 0。未构建或替换 moonsprite-native.exe，未执行 UI 运行验收。


### 2026-11-05 缺失槽笔画画布显示接通

发现 canvas_renderer 仍通过 doc.cel() 解引用空槽，合成器也在缺少 Cel 时直接跳过活动层。现改为可空槽解析；独立显示表面传入既有 preview 通道，合成器以 preview 的尺寸与偏移提供显示几何，不创建时间线 Cel。复用既有图层透明度、样式、组、蒙版和洋葱皮合成管线。来源：legacy animation.ts clearLayerSurface/applyFrameSurfaces、history.ts recordPixelKnownCurrent，及 workspace-commands-history.ts 提交后同步。

验证：canvas-performance-tests 构建并执行通过（exit 0，native/build/sparse-render-tests.log），新增 Skia 离屏像素回归覆盖 1/2 图层、洋葱皮开/关、空槽初始显示、笔画、取消、提交、撤销/重做，确认显示不创建 Cel；原有像素上传、脏矩形、大时间线检查通过。来源覆盖 625 文件通过；git diff --check exit 0。未运行交互式程序验收，未构建或替换正式 moonsprite-native.exe。整体稀疏导入及特殊图层等迁移缺口保留。


### 2026-11-05 真实多帧洋葱皮与空槽效果验证

纠正上一批测试证据：洋葱皮 enabled 但仅一帧会退回普通合成，不能证明真实洋葱皮路径。现回归使用两帧，发现并修复 compositeOnionRegion 的活动缺失槽提前 return；只允许活动非 ghost 层读取显式预览，其他帧继续使用实际存储。依据 legacy onion-skin.ts、animation.ts 的显示层生命周期。

新增离屏全图比较：图层 opacity=.63，组 opacity=.71，图层 mask 覆盖128，颜色 overlay，逐项累计组合，并分别关闭/开启真实多帧洋葱皮；临时预览与提交后全新 CanvasRenderer 输出一致，撤销恢复原图。组空间样式（渐变/描边/阴影等）依赖内容几何，尚未由此验证。canvas-performance-tests 最终构建、执行 exit 0（native/build/sparse-effects-tests.log）；原有像素上传、脏矩形、大时间线测试通过。未更新正式 exe，未进行交互 UI 验收。


### 2026-11-05 空槽组空间样式与缓存失效

新增组渐变、组描边+阴影的多像素笔画回归，普通/真实多帧洋葱皮两条路径。旧代码先复现 preview/commit 像素差异（sparse-spatial-before-tests.log）：groupStyleGeometry 只读 Cel，遗漏独立显示表面。现把既有 preview 像素、尺寸和偏移递归传入组内容 alpha 边界扫描，复用 legacy document-composite-sampling.ts 的可见子内容几何语义。

随后复现撤销残影（sparse-spatial-tests.log）：原始像素脏矩形未覆盖效果 halo 或组渐变几何变化。启用图层空间效果或组空间/渐变效果时保守全画布刷新；普通笔画及逐点颜色效果仍保留脏矩形路径。精确 legacy 效果缓存失效/性能方案仍待迁移，不能将此保守适配视为性能等价。最终 Skia 离屏回归比较临时预览与提交后的全新 renderer，全图一致且撤销恢复；未更新正式 exe，未执行交互式 UI 验收。


### 2026-11-05 图层空间效果局部刷新

直接承接 legacy core/layer-styles.ts:231-240 layerStyleAffectedRect：原始变化与 stroke/innerGlow 扩展、平移 shadow 后 blur 扩展取并集。原生上传区域采用 int64 坐标后裁剪画布，图层效果不再一律全画布刷新。组空间/渐变效果仍保守全量刷新；多个 owner 仍保守合并所有 layer 效果足迹，旧版 owner 队列、64px block 缓存尚未全部迁移。

新增实际 Skia 回归在 32x32 图像检查 shadow 的四个偏移方向、blur=1，精确上传区域面积（单点、offset 3/2 时 5x4=20 像素），对比完整重绘及取消后的全图像素。测试初版预期面积误算为 6x5，已按原始矩形与偏移扩展并集修正。未更新正式 exe，未进行交互 UI 验收。

验证结果：canvas-performance-tests 最终构建及运行 exit 0（native/build/style-dirty-tests-final.log）；原有普通/空槽/组/洋葱皮/脏矩形/大时间线回归通过，来源覆盖 625 文件通过，git diff --check exit 0。


### 2026-11-05 嵌套组效果局部刷新

直接承接 legacy document-composite-cache.ts invalidateStyleSources:132-155 的 owner→parent 传播：每一级 layerStyleAffectedRect 的输出作为父级输入。原生以 int64 计算各 owner 链并合并，组蒙版变化也以组链为起点；由于 Document 尚未提供精确改变 owner ID，仍保守遍历潜在 owner。组 gradient 内容边界变化仍全量刷新。旧版按 owner 的脏区域队列及64px style block 缓存尚未全部迁移。

实际 Skia 回归增加双层阴影组（每层 offset 3/2、blur1）：单点笔画准确上传9x7=63像素；局部结果与全量重绘逐像素一致，取消无残影。canvas-performance-tests 构建执行 exit0（native/build/group-dirty-tests.log），既有空槽、洋葱皮、空间样式、大时间线回归通过。未更新正式 exe 或运行交互式 UI 验收。


### 2026-11-05 浮动预览最终脏区域与空间效果衔接

将效果 ancestor 扩展放在 floatingOverlayChange/tilemap 最终原始区域计算之后，避免浮动预览覆盖已扩展的阴影/描边范围。依据 legacy document-composite-cache.ts invalidateStyleSources 对最终 source dirty 应用效果传播；canvas-composite-cache-selection.ts 对 styled selection 使用 fallback，原生延迟样式路径尚有技术差异，不能视为性能等价。

新增实际延迟剪贴板场景：320x320画布、257x257剪贴板（小剪贴板不会触发 deferred，已明确断言），两角不透明像素。分别图层阴影和双层组阴影，移动、取消、提交、撤销重做均将缓存全图与全新 renderer 逐像素对比。未更新正式 exe，未进行交互 UI 验收。


### 2026-11-05 样式图层的浮动预览准入

对照 legacy canvas-composite-cache-selection.ts：启用的目标图层样式必须退出优化浮动预览；原生 supportsDeferredFloating 在 clipboard 尺寸判断之前检查能力、活动目标槽和目标 layerStyles.enabled/configured，避免样式目标误走 deferred fast path。全局禁用样式保留优化资格。

新增 admission matrix 覆盖 capability 开关、配置样式开关、样式 enabled 开关以及取消历史稳定性；大剪贴板空间效果移动/取消/提交/撤销/重做继续与全量 renderer 逐像素一致。canvas-performance-tests exit0（native/build/preview-admission-tests.log），来源覆盖通过，diff check通过。旧版剪贴板优化还包括顶层图层、opacity/blend、内容为空等条件，后续继续核对。


### 2026-11-05 剪贴板专用与通用预览分支核对

核对 legacy canvas-composite-cache.ts:367/391：先尝试 drawClipboardPreview，失败后仍尝试 drawSelectionPreview。因此 canvas-composite-cache-selection.ts:78-86 的顶层、RGBA、不透明、Normal、空内容条件仅限制专用剪贴板优化，不能照搬为全部 deferred 预览的必要条件。此前“剩余条件待核对”现已澄清为两条路径的区别，未擅自缩小通用预览范围。

新增实际 Skia 差分：320x320已有内容的两层文档，257x257剪贴板以混合alpha角像素覆盖；opacity=.57、Multiply混合、活动图层位于底层三种情况，对照 deferred 与能力关闭 fallback 的不同路径，移动、取消、提交、撤销重做逐像素一致。canvas-performance-tests 构建执行 exit0（native/build/clipboard-stack-tests.log）。此项证明测试场景行为，不代表旧版全部 cache/performance 算法迁移完成。未更新正式exe或执行交互UI验收。


### 2026-11-05 缺失槽普通与纹理填充生命周期

以 legacy tools-fill.ts floodFill/floodFillSymmetric → history recordPixelKnownCurrent → workspace history push后sync 的实际路径为依据：缺失普通栅格槽先以独立画布存储调用已有 fillCanvasAt/fillPatternCanvasAt，保留 symmetry seed 子编辑次序和 selection，只有有效像素编辑才创建活动槽，继承 layer.opacity；撤销重做修改像素并保留 Cel ID。无变化、越界不创建槽，不改history/dirty。关联缺失槽明确阻止，特殊图层/稀疏导入门槛保持。全画布 staging 是原生必要适配，尚未承接旧版稀疏 runtime 性能。

验证：document-raster-history-tests 构建运行exit0（native/build/absent-fill-tests.log），新增实色/Grain纹理、无效seed、透明无变化、commit/undo/redo像素与Cel身份回归；来源覆盖625文件通过，diff check通过。未更新正式exe，未执行交互UI验收。


### 2026-11-05 空槽可见层对称填充顺序修复

新增有选区与两层背景的差分矩阵：实色/Grain × visibleLayers开关 × contiguous开关 × symmetry开关，比较已有空白Cel与缺失Cel路径，检查提交像素、单次历史、撤销重做及Cel身份。复现 Grain+visible+非连续+symmetry 差异（native/build/absent-fill-parity-tests.log）：后续对称seed采样未见先前临时写入。依据 legacy tools-fill.ts floodFillSymmetric 顺序编辑显示layer，现通过既有compositor preview参数传入活动空槽的当前staging像素，保持提交前无Cel。

最终 document-raster-history-tests 构建运行exit0（native/build/absent-fill-parity-tests-final.log），来源覆盖通过，diff check通过。未更新正式exe，未进行交互UI验收；整体稀疏导入与特殊层迁移仍未完成。


### 2026-11-05 空槽魔棒读取与选区历史验证

核对 native editor_input.cpp 魔棒快照使用 canvasPixels()/compositeNormalRegion，普通栅格空槽没有新增Cel解引用。沿用 legacy magic-wand-operation.ts 的选区操作及 workspace-selection-mode.test.ts 空槽不改变作品内容语义，新增精确 source→magicWandSelection→commitSelection 核心链回归：visibleLayers开关、contiguous开关、tolerance0/64，验证透明空槽/背景隔断的选择范围，undo/redo选择，同时Cel缺失/count、contentRevision、dirty不变。

构建执行 document-raster-history-tests exit0（native/build/absent-wand-tests.log）。此项为核心链验证，不代表异步Editor手势或交互UI验收；未更新正式exe。


### 2026-11-05 缺失槽魔术橡皮擦无变化路径

依据 legacy store/workspace-magic-eraser.ts eraseWorkspaceMatchingColor → tools-fill.ts clearSelection：只有实际像素变化才提交。原生提前检测普通栅格活动槽缺失并安全return false，不解引用cel、不创建Cel；蒙版路径独立解析，不再强制依赖栅格Cel。新增选区+已有背景层的 visible/contiguous/preview组合、有效/越界seed，检查Cel缺失/count、revision/contentRevision/history/dirty及背景合成不变。

验证：document-raster-history-tests 构建执行exit0（native/build/absent-eraser-tests.log）；来源覆盖和diff检查通过。补跑 moon-core-tests 构建成功但执行exit -1073741571（0xC00000FD，Windows栈溢出），日志为空；CMake已有测试专用2MiB栈设置，本轮未调整或将该综合测试记为通过，蒙版综合回归未获得运行证据。未更新正式exe或进行交互UI验收。


### 2026-11-05 恢复综合核心测试并纠正过时预期

通过MSVC反汇编定位 moon-core-tests main 栈帧0x1f98f0，原测试PE stack reserve为2MiB。仅提高测试目标reserve至4MiB；生产目标未变。随后测试到达旧断言：复制 Cel 后删除其源帧，旧版 animation.ts mapAnimationCelBlock 源锚点不存在则返回空；据实际legacy契约将测试修正为不粘贴且作品/历史/clipboard不变，而非改生产代码。保留CHECK源码行诊断。

最终 moon-core-tests exit0（native/build/core-legacy-anchor-tests.log），document-raster-history-tests exit0（native/build/absent-eraser-tests-final.log）；来源覆盖通过，diff check通过。综合测试现覆盖蒙版魔术橡皮擦等既有编辑路径。未更新正式exe或做交互UI验收。


### 2026-11-05 空槽渐变预览与提交生命周期

依据 legacy core/gradient.ts 通过recordPixel编辑显示像素、无变化恢复空扩展，及 workspace history push后sync 的Cel生命周期。普通栅格缺失槽新增独立透明baseline，沿用magicWandSelection和GradientSampler；取消/透明无变化不创建Cel，有效提交仅创建活动槽并继承layer.opacity，撤销重做保留Cel身份。关联图层缺失槽继续阻止，整体稀疏导入仍未放开。当前空槽全画布baseline与逐点history尚待承接旧版稀疏/dense性能方案，不标记完整等价。

回归覆盖selection及visibleLayers开关，与已有空白Cel渐变预览逐像素比较，取消时Cel/count/history/contentRevision/dirty稳定，提交/undo/redo像素与Cel ID一致，透明no-op不创建槽。document-raster-history-tests构建执行exit0（native/build/absent-gradient-tests.log），来源覆盖与diff检查通过。此轮未进行离屏renderer或交互UI验收，未更新正式exe。


### 2026-11-05 空槽渐变离屏渲染验收

新增Skia实际全图像素回归，普通栅格缺失活动槽，选区、半透明渐变、多图层、layer/group opacity、layer mask、overlay、组gradient/stroke/shadow，分别关闭/开启真实两帧onion。临时预览不创建Cel，取消恢复原图，提交后新建renderer完整重绘与预览一致，undo恢复初始图，redo恢复预览图。依据legacy gradient-preview.ts/gradient.ts与animation.ts显示/提交生命周期，补齐上一批核心检查之外的renderer证据。

canvas-performance-tests构建运行exit0（native/build/absent-gradient-render-tests.log）；既有画布回归通过。未进行交互式Editor/UI验收，未更新正式exe。全画布staging/逐点history性能、特殊关联层和整体稀疏导入仍待迁移。


### 2026-11-05 空槽大面积渐变密集历史

承接 legacy gradient.ts DENSE_GRADIENT_MIN_PIXELS=512*512/applyDenseGradient 的packed before/after策略，空槽提交复用原生已有DensePixels；先扫描dirty再选择dense/point，避免先分配大批逐点记录。当前原生以dirty矩形选阈值，而legacy以paint范围，并有changed mask/cost差异，完整history等价仍未完成。

新增511/512边界回归，检查payload分支、512历史存储小于9bytes/pixel，commit/undo/redo像素与Cel身份。新增测试先因大函数栈占用溢出，已抽为独立函数避免累加栈占用；最终document-raster-history-tests构建运行exit0（native/build/absent-gradient-dense-tests-final.log），来源覆盖与diff检查通过。未更新正式exe或运行交互UI验收。


### 2026-11-05 空槽渐变dense绘制范围语义

对照legacy gradient.ts:242-266，dense阈值以canvas、selection包围矩形、paintRegion交集面积判断，mask位仅限制写入。空槽提交现按此paint bounds选dense并存储对应packed矩形，实际dirty仍只含变化像素。新增512x512选区仅一位允许写入的回归：仍必须dense，其他像素透明，undo/redo一致；保留511/512阈值测试。document-raster-history-tests构建执行exit0（native/build/gradient-paint-bounds-tests.log），来源覆盖与diff检查通过。旧版changed mask/cost及既有非空槽分支仍待对齐，未更新正式exe或做交互UI验收。


### 2026-11-05 已有普通Cel渐变dense准入

继续对齐legacy gradient.ts applyGradient：已有full-canvas Cel渐变同样以canvas/selection/paintRegion交集选择dense，独立于dirty bounds；shared shape提交保留其既有策略。512x512选区仅一位可写回归现在同时覆盖已有Cel/缺失Cel，两者都必须dense，像素及undo/redo正确。document-raster-history-tests构建运行exit0（native/build/gradient-existing-dense-tests.log），来源覆盖与diff检查通过。sparse surface渐变、changed mask/cost仍待对齐，未更新正式exe或进行交互UI验收。


### 2026-11-05 稀疏表面渐变dense准入

对照legacy/src/renderer/src/core/gradient.ts applyGradient/applyDenseGradient，带偏移的稀疏表面提交改用canvas、selection包围矩形及paintRegion交集面积选择dense，并按该范围存储before/after；实际dirty仍按变化像素发布，保留分配预算及存储坐标映射。新增512x512选区仅一位可写、2x1透明表面带偏移及非零storageOrigin的回归，检查扩展、dense分支、像素、Cel身份与undo/redo。document-raster-history-tests构建运行exit0（native/build/gradient-sparse-dense-tests.log）。changed mask/history cost等价仍未完成；未更新正式exe或进行交互UI验收。


### 2026-11-05 空槽选区复制与dense历史复核

已核对legacy history.ts:649-703：commitPixelEdit将dense转换为完整regionPatch，正式undo/redo均回放完整before/after矩形；changed掩码用于revertPixelEdit提交前回退（734-740），不能将其直接套到正式undo。原生正式dense整矩形回放在此点无需修改，changed mask缺口应限定为临时编辑回退语义，整体history成本等价仍未完成。

继续迁移空槽读取：legacy animation.ts clearLayerSurface/applyFrameSurfaces为空槽提供透明显示，workspace-commands-clipboard.ts copySelection:730-761跳过透明像素，空结果在清除动画剪贴板之前返回。原生copyPixels改用nullable active surface，避免空槽访问cel()；保留floating分支及空结果不改动画剪贴板的行为。新增矩形/掩码选区、有无不透明背景层的组合回归，验证空结果、不生成Cel、保留帧剪贴板、选区、revision/contentRevision/history/dirty及合成像素。document-raster-history-tests构建运行exit0（native/build/absent-copy-tests.log）。系统剪贴板及完整稀疏帧复制生命周期仍未完成；未更新正式exe或进行交互UI验收。


### 2026-11-05 空槽删除、剪切与居中内容

核对legacy tools-fill.ts clearSelection、workspace-commands-selection-effects.ts deleteSelection、workspace-commands-clipboard.ts cutSelection及workspace-commands-selection-move.ts centerActiveContent。空透明内容删除无编辑且保留选区；剪切无论复制是否为空均结束选区；居中仅在pixel entry成功后移动选区。原生deleteSelectedPixels已跳过缺失Cel，cutPixels可复用上轮空槽copyPixels修正；本轮修复centerActiveContent直接解引用缺失activeSurface的问题。

新增独立回归函数，覆盖矩形/掩码选区、其他不透明图层、水平/垂直/双轴居中与无选区，检查删除保留选区、剪切清除选区、帧剪贴板保留、Cel数/history/revision/contentRevision/dirty与合成像素均不变。document-raster-history-tests构建运行exit0（native/build/absent-selection-commands-tests.log）。旧版临时显示存储的扩展、特殊图层及完整稀疏导入/保存生命周期仍未完成；本轮未更新正式exe或进行交互UI验收。


### 2026-11-05 单目标空槽填充选区／画布

核对legacy workspace-commands-selection-effects.ts fillForeground、workspace-selection-effects-support.ts selectionEffectUsesMultipleTargets/selectedEffectTargets、tools-fill.ts fillSelectionOrCanvas及animation.ts animationLayerAtFrame/createActiveLayerCel/syncActiveAnimationLayer。单目标直接编辑activePaintLayer的透明显示栅格，成功后同步创建活动Cel；多目标使用帧代理，缺失Cel返回null并跳过。原生补齐单目标空槽分支，不改变多目标跳过缺失槽位的语义。

空槽提交先检查选区、锁定/可见性和实际非零写入，按512*512及selectedCount*3>=area判断dense；按packed值覆盖，保留半透明及隐藏RGB，预算检查后安装候选Timeline并提交历史。撤销清空像素但保留Cel身份。缺失linked-layer生命周期仍明确拒绝。回归对照已有空白Cel，覆盖画布/矩形/掩码、背景层、不透明度、半透明/隐藏RGB、零色/空mask/越界/锁定/隐藏、dense与稀疏掩码、undo/redo。首次组合测试因多个Document栈对象溢出，改为堆分配后document-raster-history-tests构建运行exit0（native/build/absent-selection-fill-tests.log）。稀疏显示存储/几何、linked及导入保存全生命周期仍未完成；未更新正式exe或进行交互UI验收。


### 2026-11-05 空槽形状预览与提交

承接legacy tools-shapes.ts paintShape/paintShapePixelPoints、直线笔刷及history.ts recordPixel/commitPixelEdit与animation.ts createActiveLayerCel/syncActiveAnimationLayer的绘制/同步边界。原生beginShapePreview在普通栅格缺失Cel时建立独立透明baseline，分配前检查256MiB预览预算，update继续复用既有形状栅格器、选区/对称/ink语义；共用absentRaster提交仅在有变化时创建活动Cel，撤销重做保持身份。形状dense按dirty bounds选择，渐变保持paint bounds，避免共用提交引入阈值偏差。缺失linked-layer形状生命周期仍明确拒绝。

document-raster-history-tests构建运行exit0（native/build/absent-shape-tests.log），新增对照已有空白Cel的直线/矩形/矩形轮廓/椭圆/旋转椭圆轮廓/多边形/自由形状测试，覆盖掩码、对称、半透明/隐藏RGB、重复更新、取消、零变化、提交/undo/redo及Cel身份。稀疏运行时存储/几何、linked和特殊图层缺失槽位仍未完成；未更新正式exe或进行交互UI验收。


### 2026-11-05 空槽透明选区浮动变换

核对legacy tools-selection-transform-source.ts captureSelectionTransform、workspace-commands-selection-move.ts及workspace-commands-selection-floating.ts:403-500。透明选区仍有source/geometry，浮动确认没有pixel entry时仅提交选区历史。原生beginSelectionContentMove允许普通栅格缺失活动Cel且没有其他解析目标时保留透明source，不创建Cel；变换复用floatingSelectionMask，避免空targets访问owner，翻转使用透明source的mask；commit/cancel复用既有选区历史与恢复。

新增对照已有透明Cel的矩形/掩码、越界选区、复制/移动、初始平移、取消、翻转/旋转、确认及undo/redo回归，验证选区一致、contentRevision/dirty不变、始终没有Cel。document-raster-history-tests构建运行exit0（native/build/absent-selection-move-tests.log）。本轮没有扩展多目标缺失代理、linked/特殊图层或运行时稀疏几何；全软件迁移仍未完成，未更新正式exe或进行交互UI验收。


### 2026-11-05 透明选区直接翻转历史边界

对照legacy workspace-commands-selection-flip.ts：单活动图层在操作前检查lock，透明mask翻转有变化时保留selection-only history；animation selection先捕获states，无states直接返回，有states则更新mask但只有pixel entries才增加历史。原生flipContent补齐缺失Cel时的单目标lock检查、空animation targets返回，以及已有透明animation target不生成多余选区历史。workspace-edit-actions.ts rotateWorkspaceContent没有pixel entry则返回，原生透明直接旋转行为验证保留。

新增缺失/已有透明Cel、矩形边界内外mask、水平/垂直、普通/帧选择、锁定、90/-90/180旋转回归。新增函数初次运行触发Release内联后测试栈溢出；verifyEmptyImmediateTransforms及verifySparseMigration明确noinline隔离测试栈帧后整套document-raster-history-tests运行exit0（native/build/empty-immediate-transform-tests.log），未提高正式程序栈或改变程序发布配置。全软件迁移仍未完成；未更新正式exe或进行交互UI验收。


### 2026-11-05 带存储原点的稀疏表面吸管

对照legacy eyedropper-source.ts sampleEyedropperColor及document-model.ts readLayerColorAt，当前图层取色在画布范围内读取图层偏移下的原始颜色，不受history storage origin、可见性或锁定状态影响。原生sampleEyedropper移除storageOrigin存在即拒绝的旧迁移限制，复用raster::validate/readWorld，避免int坐标减法在极端偏移下溢出。

新增正/负偏移、非零storage origins、链接Cel、隐藏/锁定、半透明/隐藏RGB、画布和owner边界、缺失Cel当前层透明与合成背景、INT_MIN偏移回归，并确认取色不改像素和Cel数。eyedropper-tests构建运行exit0（native/build/sparse-eyedropper-tests.log）。本轮不代表完整稀疏导入/编辑器预览/持久化生命周期完成，未更新正式exe或进行交互UI验收。


### 2026-11-05 空槽选区笔刷读取入口

核对legacy brushes.ts createSelectionBrush：先裁剪并校验笔刷尺寸，读取active layer原始颜色，仅有不透明像素才返回笔刷，选中透明RGB保留。原生selection_pattern_brush增加nullable Surface重载，缺失来源通过原采样器返回透明，不分配整画布；editor_tools的临时捕获、铅笔库保存及填充库保存三个入口改用activeSurfaceIfPresent，避免空Cel解引用。保持原空结果提示及尺寸/掩码校验。

回归覆盖空活动槽位加不透明背景、矩形/掩码/越界选区、超尺寸和损坏mask拒绝、Cel/history/revision/content/dirty不变，以及带偏移/非零存储原点的隐藏RGB与alpha。新回归暴露测试Release内联叠加栈帧问题，独立verify函数统一noinline，不修改正式程序配置。编辑器三个入口已源码核对，未更新正式exe或进行交互UI验收；完整稀疏生命周期仍未完成。

补充实际验证：noinline及独立调用仍未消除0xC00000FD，不能归因仅为内联。仅document-raster-history-tests的MSVC测试栈由2MiB增至4MiB后，整套构建运行exit0（native/build/absent-selection-brush-tests.log）；正式程序配置未改。新增选区笔刷回归通过。


### 2026-11-05 编辑器空槽笔刷悬停来源

核心brushPreview已经支持缺失Cel，但editor_canvas的普通笔刷预览合成底图、喷枪轮廓与粒子预览仍直接读取activeSurface。对照legacy canvas-brush-composite-preview.ts原始活动图层读取以及animation.ts透明显示语义，普通预览改用nullable source并保留零初始化region，喷枪两个读取以透明值回退；既有偏移、合成和边界算法不变。

新增核心对照：缺失槽位brushPreview加显式composite preview，比较已有透明Cel实际落笔提交后的合成，覆盖不透明/半透明及有无背景；Cel数/history/contentRevision/dirty不变。document-raster-history-tests构建运行exit0（native/build/absent-hover-tests.log）。编辑器绘制入口仅源码核对，未编译更新正式exe、未做交互预览图像验收；完整软件迁移仍未完成。


### 2026-11-05 正式编辑器集成构建与启动检查

累积编辑器、核心和项目读写改动已构建进入唯一正式产物 native/build/Release/moonsprite-native.exe；构建 exit0，记录 native/build/editor-integration-build.log。补齐此前 editor_canvas/editor_tools 仅源码核对的编译证据，不代表全部行为等价。

实际运行发现 start-native.bat 把主题参数放在用户参数前，而 main.cpp 检查入口判断 argv[1]，导致检查参数被静默忽略、打开普通工作区。正常关闭本轮启动的窗口后，将用户参数置于默认主题/指针参数之前；保留同一入口、工作目录与正式程序。通过该入口运行 --brush-preview-check、--preview-luminance-check，两个进程均 exit0。现有检查覆盖笔刷预览模式/抑制/缓存不变及亮度契约，尚不覆盖缺失Cel的实际编辑器悬停、喷枪和三个选区笔刷入口，也未进行人工交互图像验收。

光栅历史、吸管现有测试均 exit0，日志 editor-integration-raster-tests.log、editor-integration-eyedropper-tests.log；625文件来源覆盖通过，完整迁移仍 INCOMPLETE。空帧粘贴已核对 legacy workspace-commands-clipboard.ts pasteSelection 与 workspace-commands-selection-floating.ts commitFloatingPaste：预览保留完整源，成功像素历史才 syncActiveAnimationLayer；原生 beginFloatingPaste 仍直接 cel().id，后续浮动目标生命周期尚待迁移，未解除稀疏导入门禁。


### 2026-11-05 空槽剪贴板浮动粘贴生命周期

对照 legacy workspace-commands-clipboard.ts pasteSelection、workspace-commands-selection-floating.ts commitFloatingPaste 及 animation.ts syncActiveAnimationLayer，原生 beginFloatingPaste 不再直接读取缺失 cel().id。缺失普通栅格目标保留独立透明基线，复用既有 floatingOverlayRegion、采样/变换/预算和合成管线；预览与取消不创建Cel、不改内容历史。成功像素提交才安装活动Cel并记录像素历史，撤销保留新Cel身份；完全越界/透明源只有必要选区历史。取消选择后的恢复快照在成功提交后绑定新Cel，避免恢复时读取不存在owner。缺失链接图层生命周期继续明确拦截。

按 tools-selection-transform-translation.ts changedCount > area/4 和 tools-selection-transform-commit.ts packed transform 采用密集矩形历史；其他平移保留稀疏点历史。回归包括掩码、隐藏RGB/半透明、有无背景、图层透明度、取消、翻转/缩放/普通旋转/RotSprite、越界、300x300大剪贴板、稀疏mask、取消选择/撤销/重做。document-raster-history-tests exit0（absent-paste-tests.log）。canvas-performance-tests离屏回归比较预览、提交、新renderer、撤销重做，覆盖组/蒙版/图层样式/组渐变/描边阴影/洋葱皮；记录 absent-paste-render-tests.log。上述为核心与Skia离屏证据，非人工交互验收；本批源码尚未重新链接进入正式exe，完整稀疏导入门禁仍保留，全部功能迁移未完成。


### 2026-11-05 粘贴恢复后的继续编辑与组锁定集成

追加空槽/已有透明Cel对照：取消选择→撤销恢复浮动→翻转/移动/旋转/RotSprite→提交或取消，以及再次撤销重做，结果一致。未为此更改既有恢复算法。核对legacy workspace-restored-clipboard.ts restoredClipboardSnapshot、workspace-floating-preview-command.ts恢复编辑入口。

另按legacy workspace-commands-clipboard.ts pasteSelection的isLayerEffectivelyLocked修复普通栅格粘贴入口只检查layer.locked的迁移差异；改为共享layerEffectivelyLocked。新增自身锁定和嵌套祖先组锁定、有无Cel的拒绝回归，选区/history/content/Cel数/dirty保持不变。

document-raster-history-tests构建运行exit0，日志 absent-paste-integration-tests.log。唯一正式exe已重新链接，构建日志 absent-paste-integration-build.log；通过native/start-native.bat运行--deselect-check与--playback-floating-check，两个进程exit0。此处覆盖实际编辑器既有取消选择和播放提交路径，不等同于缺失Cel人工交互验收；本节更新上一批尚未进入正式产物的状态。完整软件迁移仍未完成，稀疏工程导入门禁继续保留。


### 2026-11-05 空槽浮动内容居中顺序

对照legacy workspace-commands-selection-move.ts centerActiveContent先处理pendingPaste+selection，再读取活动图层内容；其移动入口采用allowOutsideCanvas=true并核对effective lock。原生此前在浮动分支之前要求activeSurfaceIfPresent，导致空槽剪贴板及透明选区浮动无法居中。现将既有浮动变换分支前置，沿用Math.round等价取整、flip origins/quad平移和transformFloatingPaste，不改变非浮动空槽无操作语义。

新增对照已有透明Cel的水平/垂直/双轴居中，普通剪贴板、旋转、缩放与透明选区浮动，居中再次调用无操作及取消恢复；验证预览像素/选区一致且不创建Cel、不改history/content/dirty。document-raster-history-tests构建运行exit0，日志native/build/absent-floating-center-tests.log。此次核心修改尚未重新链接正式exe，未做人工交互验收；全部功能迁移与完整稀疏生命周期仍未完成。


### 2026-11-05 空槽平滑笔刷

核对legacy core/smooth-brush.ts applySmoothBrush：readSource将alpha为0的颜色归零，全透明源没有可生成的变化；animation.ts空活动槽位显示透明。原生applySmoothBrush先校验visited范围，再对缺失活动Cel返回false，避免cel().id解引用，不分配整画布，不改变已有表面算法。新增与已有透明Cel对照，覆盖强度0/1/50/100、无选区/矩形/掩码、有无不透明背景，确认Cel/history/revision/content/dirty/合成不变及损坏覆盖拒绝。document-raster-history-tests构建运行exit0（absent-smooth-tests.log）。本批核心源码未重新链接正式exe，无人工UI验收。

资源路径检查另确认beginStroke缺失Cel的透明画布resize发生在现有扩展预算门禁之外；这一分配前预算缺口尚未修复，不将当前空槽绘图称为完整资源边界验收，也不放开稀疏导入门禁。全部功能迁移仍未完成。

### 2026-11-05 空槽笔刷分配前预算与正式集成

beginStroke 的缺失普通栅格 Cel 分支现在先复用 adjustmentStorageBudget(timeline_,1) 和既有 256MiB 像素存储上限，再分配透明预览画布。该上限是必要原生资源适配，不是 legacy 的产品要求；legacy animation.ts 的显示编辑后才物化 Cel 生命周期及笔刷算法保持原有迁移语义，缺失链接图层仍拦截，总笔划与历史工作内存核算仍不完整。

回归以非活动帧 8192×8192 owner 占满预算，确认缺失活动槽落笔在预览分配前拒绝，Cel/history/revision/contentRevision/dirty 以及既有存储身份、数据地址和版本不变；释放一行存储后允许开始并取消，仍不创建 Cel。document-raster-history-tests 构建与运行通过，日志 native/build/absent-stroke-budget-build.log、absent-stroke-budget-tests.log。

唯一正式产物 native/build/Release/moonsprite-native.exe 已构建成功（absent-stroke-budget-app-build.log），同时纳入前两节浮动内容居中和平滑笔刷修复，更新此前尚未重新链接的状态。通过 native/start-native.bat 运行 --brush-preview-check 与 --deselect-check 均 exit0；这些是既有编辑器自动检查，未完成缺失 Cel 人工交互图像验收。完整功能迁移仍 INCOMPLETE，稀疏导入门禁保留。
### 2026-11-05 空槽断开 Cel 连接

核对 legacy core/animation.ts disconnectAnimationCels 只遍历已有 Cel，空目标返回 false，以及 workspace-commands-animation-cel-properties.ts 将选择槽位映射为已有 Cel。原生 canDisconnectSelectedCels、disconnectSelectedCels 的活动目标回退与 disconnectCel 直接入口改用 nullable Cel，空槽无操作；活动槽缺失时仍保留显式源/别名选择的既有断开算法。

document-raster-history-tests 构建运行 exit0（native/build/absent-disconnect-build.log、absent-disconnect-tests.log）。新增回归覆盖空槽无选择不改变 Cel/history/revision/content/dirty，以及空活动帧中选择已有源或别名断开，像素与 Cel 数不变、撤销重做恢复链接。此次源码尚未重新链接正式 exe，未做人工 UI 验收。

帧复制进一步核对：legacy clearLayerSurface 保留显示 layer.width/height/offset，applyFrameSurfaces 在有 Cel 时更新，跨工程 frame clipboard 从显示 layer 取几何。原生目前缺少对应显示几何状态，copySelectedFrames 的缺失活动槽异常仍待迁移；不能以画布尺寸回退假定等价。稀疏导入门禁及完整迁移 INCOMPLETE 状态保留。
### 2026-11-05 空槽帧复制的显示几何承接

依据 legacy core/animation.ts clearLayerSurface/applyFrameSurfaces 与 workspace-commands-animation-frame-clipboard.ts copySelectedAnimationFrames，新增按图层保存的运行时显示几何：从已有解析表面投影宽高和偏移，切入缺失槽位保留；正常变更发布和帧/历史投影更新已有表面。copySelectedFrames 缺失活动 Cel 时读取该状态，不创建 Cel，不以画布尺寸猜测源几何。

回归覆盖 3×2 表面、负偏移、两个不同几何帧先后进入同一空槽，空载荷不改变 Cel/history/revision/content/dirty；跨工程新增图层使用保留几何并可撤销重做。document-raster-history-tests 构建运行 exit0，日志 native/build/absent-frame-geometry-build.log、absent-frame-geometry-tests.log。625 文件来源登记覆盖、diff --check 通过；行为等价仍 INCOMPLETE。

本批尚未重新链接正式 exe、未做人工 UI 验收。工程初始缺失槽位的持久化显示几何尚未迁移，仍保留 full-slot 导入门禁；缺失链接层、文字/瓦片槽位及整体稀疏生命周期仍待继续迁移。
### 2026-11-05 空槽显示几何的工程回档事务

核对 legacy workspace-commands-document-io.ts cloneProjectRollbackSnapshot 使用 structuredClone(document)，restoreProjectRollbackSnapshot 经 sessionFromDocument 替换整份文档，因此图层显示宽高和偏移也属于 before/after 快照。原生 RollbackPayload 现保留 displayedLayerGeometry，capture 复制、take 移动、apply 在候选状态准备后安装，避免空活动槽回档沿用当前或缺失的几何。

新增回归在同一空活动槽中，将 3×2、偏移(-7,9)的备份与经另一帧显示的8×6几何互换，检查回档、撤销、重做后的帧剪贴板几何、一次历史和不创建 Cel。document-raster-history-tests 构建运行 exit0（native/build/absent-geometry-rollback-build.log、absent-geometry-rollback-tests.log）；来源登记覆盖与差异格式检查通过。take 路径已编译，未单独增加运行用例。

此次源码未重新链接正式 exe，无人工 UI 验收。工程初始空槽的持久化几何尚未接通，项目导入/编码的 full-slot 门禁继续保留；完整功能迁移仍 INCOMPLETE。
### 2026-11-05 跨缺失槽位连接 Cel

核对 legacy animation-slot-selection.ts animationLinkSlotKeys 扩展中间空槽 key 后，workspace-commands-animation-cel-properties.ts connectSelectedAnimationCels 只从 timeline.cels 过滤实际存在目标。原生 connectSelectedCels 在扫描首尾之间时跳过不存在 Cel，消除对空指针的 id/content 读取，不创建中间 Cel；已有空白 Cel 的范围扩展算法不变。

新增可见/全透明端点对照，覆盖缺失中间槽、连接/撤销/重做、源像素及 Cel 数量。document-raster-history-tests 构建运行 exit0，日志 native/build/sparse-connect-build.log、sparse-connect-tests.log。工程 manifest 已有 layer.surface 几何，但初始缺失槽位接入仍需承接加载与完整生命周期；full-slot 门禁不变。
正式集成补记：native/build/Release/moonsprite-native.exe 构建 exit0（native/build/sparse-connect-app-build.log），纳入空槽断开连接、显示几何帧复制、几何回档事务及跨空槽连接修复。通过唯一入口 native/start-native.bat 运行 --cel-clipboard-check、--deselect-check，两个进程 exit0；前者覆盖实际编辑器 Cel/帧剪贴板菜单及上下文路径，后者覆盖既有取消选择路径，不作为缺失 Cel 人工交互验收。更新前几节未链接正式程序的状态；全部功能迁移仍 INCOMPLETE。
### 2026-11-05 从缺失活动槽新建动画帧

对照 legacy core/animation.ts blankSurfaceFromLayer（1×1透明、零偏移）、duplicateAnimationFrame 的 nullable source 回退和 inheritAnimationFrameCelLinks 的缺失源跳过，原生 addFrame 的复制分支不再解引用缺失源；普通空槽新建/复制产生1×1透明 Cel，自动关联跳过缺失源。addLinkedFrame 的源扫描同样跳过缺失槽。

新增普通空白/复制/末尾插入关联帧与 autoLink 开关共6种回归，验证一次历史、新帧透明几何、原槽不创建 Cel、Undo/Redo。document-raster-history-tests 构建运行 exit0（native/build/absent-frame-create-build.log、absent-frame-create-tests.log）。特殊图层缺失源仍拦截；非插入关联帧的缺失目标、已有源新建空白帧仍用原生画布几何的差异尚待继续迁移，不宣称整个新建帧生命周期等价。

本批尚未重新链接正式 exe，未做人工交互验收。完整功能迁移仍 INCOMPLETE，稀疏工程导入门禁保留。
### 2026-11-05 普通空白帧统一紧凑透明几何

按 legacy core/animation.ts blankSurfaceFromLayer 的固定1×1透明零偏移，以及 addBlankAnimationFrame 先生成空白再 inheritAnimationFrameCelLinks，原生 addFrame 普通栅格空白表面不再根据源存在与否分配整画布。可见源且开启autoLink时仍继承既有源身份/几何；tilemap/free与复制已有源的分支不变。

回归覆盖3×2负偏移源、可见/透明、autoLink开关、帧Undo/Redo及1×1之外落笔后的像素Undo/Redo。首轮失败定位为测试越界读取旧整画布存储假设，以及新增测试误要求笔划Undo收缩几何；改用canvasPixels检查可观察像素，未修改既有笔划历史算法。document-raster-history-tests与moon-core-tests均exit0，日志native/build/blank-frame-geometry-*.log。

本批尚未重新链接正式exe、无人工UI验收。新建帧的保守整画布容量门禁、非插入关联帧缺失目标以及特殊图层缺失源仍待继续迁移；完整功能迁移INCOMPLETE，稀疏导入门禁保留。
### 2026-11-05 关联帧复用缺失目标槽位

核对 legacy core/animation.ts linkAnimationFrameCels 对 !target 跳过；store/workspace-animation-linked-cel.ts linkCelsInRightFrame 在下一帧存在时复用该帧、保存已有目标Cel快照、切帧并清理选择，即使没有链接改变也记录一次帧/选择历史。原生 addLinkedFrame 目标查找增加 end 检查，不再解引用缺失槽，不创建替代Cel或插入新帧。

回归覆盖可见/空白源与Cel/帧头选择，确认下一空槽保持缺失、帧/Cel数量不变、一次历史、选择清理，Undo恢复原帧及选择、Redo回到空槽。document-raster-history-tests构建运行exit0（native/build/linked-absent-target-build.log、linked-absent-target-tests.log）。本批未重新链接正式exe、未做人工UI验收；特殊图层缺失源、工程初始空槽持久化及完整迁移仍未完成，稀疏导入门禁保留。
### 2026-11-05 紧凑空白帧的原生资源准入

此前 addFrame 以画布面积×图层×全部帧数估算，和 legacy animation.ts 的紧凑1×1空白表面相冲突。普通栅格路径现复用 adjustmentStorageBudget 的已有链接存储去重，累加新表面与detached历史副本，并为蒙版及其快照预留空间，在帧身份和表面分配前拒绝越限；保留10000帧及原生256MiB限制，特殊tile/free路径仍采用原门禁。该限制是原生适配，非legacy产品要求；总历史/元数据/文字工作内存仍未完整核算。

新增1024×1024画布连续70个紧凑空白帧、帧Undo/Redo和原始大表面不变回归；另以非活动8192×8192表面占满存储，确认新建帧拒绝且frame/history/revision/dirty不变。document-raster-history-tests与moon-core-tests构建运行均exit0，日志native/build/compact-frame-budget-*.log。本批未链接正式exe、未做人工UI验收；完整功能迁移仍INCOMPLETE，稀疏导入门禁保留。
### 2026-11-05 整 Cel 粘贴缺失目标的取消语义

对照 legacy core/animation.ts mapAnimationCelBlock 仅返回已有目标，workspace-commands-animation-cel-clipboard.ts 同工程 placements 与跨工程 resolvedDestinations 必须覆盖全部源条目，否则取消。原生 pasteCopiedCels 活动目标改为 nullable 查找，并在预算/候选分配前拒绝既有帧中的任意缺失块目标，避免活动 cel() 异常或后续 slot->id 空指针读取；不自行物化缺失槽。

同/跨工程与缺失首目标/后续目标共4种回归，验证无像素、frame/Cel/history/revision/content/dirty/选择变更，旧剪贴板保留。document-raster-history-tests 构建运行 exit0（native/build/cel-paste-missing-build.log、cel-paste-missing-tests.log）。新增帧目标沿用已有创建行为；selection-only Cel 浮动路径未由本批验收。

本批尚未链接正式exe、无人工UI验收。完整功能迁移仍 INCOMPLETE，稀疏工程导入门禁保留。
### 2026-11-05 Cel选区载荷跳过非活动缺失目标

核对legacy workspace-paste-cel-selection.ts创建目标状态后，selection-transform-targets.ts selectionTransformLayerForState对非活动帧经animationLayerAtFrame解析，缺失槽返回null并跳过预览。原生beginCelSelectionPaste收集目标时改为nullable，不再对缺失目标读取id；浮动目标仅保留实际存在Cel，不创建替代槽，既有预览/提交/取消算法不变。

回归覆盖已有活动目标+下一帧缺失目标，取消、提交、像素Undo/Redo及空槽/Cel数保持，document-raster-history-tests构建运行exit0（native/build/selection-paste-missing-build.log、selection-paste-missing-tests.log）。活动槽缺失的anchor仍未迁移，全部目标跳过时不建立浮动状态；不将此近似边界称为完整旧版浮动生命周期等价。

本批未链接正式exe、无人工UI验收。完整迁移仍INCOMPLETE，稀疏工程导入门禁保留。
### 2026-11-05 整 Cel 活动目标修复更正

复查发现前述 celPasteMissingDestination 的首次字符串替换实际落在 beginCelSelectionPaste，pasteCopiedCels 仍为 &cel()；优化测试返回false不能证明该空指针解引用安全。现明确修复整Cel入口，使用 findCel(activeLayerId_,activeFrameId_)，源码检查不再保留该目标回退表达式。新增直接调用 pasteCopiedCels 与 beginCelSelectionPaste 的缺失anchor回归，确认无浮动/Cel/history/revision/content/dirty变更、剪贴板保留。

另核对legacy workspace-commands-animation-cel-clipboard.ts selectionOnly 分支确实先commitFloatingPaste，再进入pasteCelSelection，因此本批不改变该顺序。document-raster-history-tests构建运行exit0（native/build/cel-anchor-direct-build.log、cel-anchor-direct-tests.log）。活动空槽的选区载荷生命周期仍未迁移，不以返回false宣称等价完成。本批未更新正式exe、无人工UI验收，完整迁移仍INCOMPLETE。
### 2026-11-05 紧凑帧与Cel粘贴正式集成

唯一正式exe重新构建exit0（native/build/compact-frames-integration-build.log），纳入紧凑空白帧、缺失源/目标关联帧、实际存储准入和Cel粘贴目标修复。通过native/start-native.bat运行--cel-clipboard-check、--playback-floating-check均exit0。

--animation-check未通过：进程数分钟未退出，本轮正常关闭测试窗口后exit1，native-animation-error.txt更新为Cross frame dimension refusal atomic。定位editor_smoke.cpp smokeCrossProjectFrameClipboard仍要求2×1目标拒绝1×1源帧；当前pasteFrameClipboard已支持保留源表面的跨尺寸粘贴。此为下一轮须按legacy核对修正的验收差异，不能将总检查记绿；正常关闭行为可能涉及待处理错误提示，未进行强制终止或删除恢复数据。完整迁移仍INCOMPLETE，无人工交互验收。
### 2026-11-05 跨尺寸帧粘贴编辑器验收修正

核对legacy workspace-commands-animation-frame-clipboard.ts pasteCrossDocumentAnimationFrames 与 workspace-animation-cel-target.ts animationCelForTarget：额外图层采用源几何，RGBA表面直接克隆，不以目标画布尺寸拒绝。editor_smoke.cpp旧Cross frame dimension refusal atomic断言已替换为成功跨尺寸粘贴，检查2×1目标画布不变、1×1源表面不缩放、原点像素与其余透明、一次结构变更及Undo/Redo。main.cpp既有--cel-clipboard-check纳入smokeCrossProjectFrameClipboard，便于专项验证；未更改生产粘贴算法。

正式exe构建exit0（native/build/cross-frame-acceptance-build.log）；通过唯一入口运行--cel-clipboard-check exit0，已覆盖本次跨工程用例，来源登记和diff检查通过。上轮动画总检查的此项失败已由专项验收关闭，但未重新运行整个--animation-check，不宣称总检查通过。完整功能迁移仍INCOMPLETE，无人工UI验收。
### 2026-11-05 动画总检查后续失败定位

重跑--animation-check，正常关闭本轮测试窗口后exit1，更新native-animation-error.txt为Selected Cel cut menu transaction。为避免复合断言掩盖原因，将smokeMigratedTimelineActions纳入既有--cel-clipboard-check，拆分命令/像素/选区/剪贴板/修订号断言。正式构建exit0（native/build/cel-cut-acceptance-build.log），专项检查exit1明确为Selected Cel cut clipboard lost selection payload：像素与选择清理已通过，Cel载荷路由未通过。

源码定位editor_canvas.cpp copyEditorClipboard在document.selection()时优先copySelectionPixels，早于celClipboardContext；legacy app-document-shortcuts.ts在selectedAnimationCellKeys且!selectionOverride()时优先Cel，useAppCommandScope.ts通过pointer/focus和COMMAND_SCOPE_EVENT维护selectionCommandOverrideRef，显式preferSelection事件才覆盖。原生尚缺对应作用域状态，不能仅换条件顺序而破坏画布选区剪切。此次只增强验收定位，生产路由未改变；下一步迁移该作用域/选择覆盖契约。完整迁移INCOMPLETE，正式程序当前专项检查如上失败，非通过。
### 2026-11-05 Cel剪贴板选择覆盖路由专项验证

按legacy useAppCommandScope.ts、app-document-shortcuts.ts、app-selection-shortcuts.ts与layer-cell-shortcuts.ts迁移显式选择覆盖状态：编辑器鼠标按下清除覆盖，全选像素及时间轴Alt内容选择设置覆盖；未覆盖时所选Cel先进入Cel剪贴板路径，显式覆盖保留像素选区复制。专项验收同时检查选择载荷Cel剪切与全选像素复制覆盖。

唯一正式exe构建exit0（native/build/cel-selection-scope-build.log），通过native/start-native.bat运行--cel-clipboard-check exit0。此前Selected Cel cut clipboard lost selection payload专项失败已关闭。子窗口焦点与蒙版作用域仍未完整迁移，未重新运行动画总检查、无人工UI验收；完整迁移仍INCOMPLETE。

### 2026-11-05 Enter粘贴撤销与紧凑Cel验收

动画总检查正常关闭测试窗口后exit1，native-animation-error.txt更新为Enter paste undo。smokeSelectionEnter在撤销粘贴恢复1×1空白Cel后仍读pixels()[1]，越过表面存储边界；legacy core/animation.ts blankSurfaceFromLayer明确创建1×1空白表面。该验收三处改读canvasPixels()[1]，验证画布坐标语义。legacy app-completion-shortcuts.ts Enter先commitFloatingPaste再commitSelectionChange，仍要求两步Undo，未修改生产行为。

既有--playback-floating-check纳入smokeSelectionEnter；正式exe构建exit0（native/build/selection-enter-compact-build.log），通过唯一启动入口运行专项exit0，覆盖粘贴提交、选区完成、两步撤销及Enter播放守卫。未重跑修正后的动画总检查，无人工UI验收。另已核对legacy app-document-shortcuts.ts未覆盖时所选蒙版Cel应先于像素选区，原生路由尚待补齐。完整迁移仍INCOMPLETE。

### 2026-11-05 蒙版Cel剪贴板作用域优先级

核对legacy app-document-shortcuts.ts所选蒙版优先于Cel和像素选区（除非selectionOverride），workspace-cut.ts蒙版剪切先复制后删除所选动画项。copyEditorClipboard新增相同未覆盖蒙版路由，保留显式全选像素覆盖。专项增加蒙版/像素选区并存的复制、剪切、Undo与全选像素覆盖检查，验证原图像素和选区不被蒙版剪切替代修改。

正式exe构建exit0（native/build/mask-clipboard-scope-build.log），通过唯一入口运行--cel-clipboard-check exit0。来源覆盖与diff检查通过。子窗口焦点作用域仍部分未迁移；未运行动画总检查和人工UI验收。完整功能迁移仍INCOMPLETE。

### 2026-11-05 动画验收窗口与鼠标捕获环境

动画总检查正常关闭后报告Loop edge captures mouse（drag=1、capture=0）。检查main.cpp发现--animation-check在desktop.addChild/openWindow之前运行，无法取得窗口鼠标捕获；未据此修改生产循环状态机。验收入口补齐桌面挂载和打开；既有播放专项纳入smokeLoopTrack，检查边缘捕获、释放最终指针提交、Undo、Escape/失焦/捕获丢失取消及边缘自动滚动。

正式exe构建exit0（native/build/animation-capture-harness-build.log）；唯一入口--playback-floating-check exit0。重跑--animation-check后正常关闭exit1，更新错误为Delete implicit active Cel，循环拖拽已越过，删除路由为下一项待核对。来源覆盖与diff检查通过，无人工UI验收。完整迁移仍INCOMPLETE。

### 2026-11-05 Delete快捷键作用域迁移

专项复现Delete implicit active Cel：唯一图层、像素未变、history未变，排除切片/蒙版/焦点残留。runShortcutCommand将默认deleteLayer快捷键映射图层菜单并受canDeleteLayers限制，唯一图层时提前返回；legacy app-completion-shortcuts.ts与core/command-context.ts要求无其他选择时删除活动Cel。新增deleteLayer快捷键专用键盘作用域路由，保留所选切片优先级，使用既有deleteWorkspaceContent(true)，不修改图层菜单含义。

正式构建exit0（native/build/keyboard-delete-scope-build.log）；既有--playback-floating-check纳入smokeDeleteRouting并exit0，覆盖隐式/显式Cel、Backspace、帧、图层、像素选区、Undo与Entry守卫。来源与diff检查通过，未重新运行动画总检查，无人工UI验收。完整迁移仍INCOMPLETE。

### 2026-11-05 多边形重做快捷键验收修正

Delete修正后动画总检查继续推进到Polygon step redo失败。核对legacy core/shortcut-contracts.ts：redo默认Ctrl+Shift+Z，Ctrl+Y为relativeLuminance；native shortcut_catalog.h已采用相同默认。smokeSelectionTools旧输入仍发Ctrl+Y，现改发Ctrl+Shift+Z，保留右键局部撤销及重做顶点断言；未修改生产快捷键或多边形状态机。

正式构建exit0（native/build/polygon-redo-binding-build.log）；唯一入口重跑--animation-check，正常关闭测试窗口后exit1，更新错误Brush property shortcuts UI shape=0 size=1 angleVisible=0，已越过多边形重做。笔刷属性快捷键为下一项待核对，总检查未通过。来源与diff检查通过，无人工UI验收，完整迁移仍INCOMPLETE。

### 2026-11-05 笔刷属性可配置快捷键作用域

动画检查Brush property shortcuts UI失败，原生runShortcutCommand的brushShape/brushSize入口限制ordinaryBrushTool，提前拦截editor_input已有选区画笔/形状分支。核对legacy app-tools-shortcuts.ts形状快捷键无普通画笔限制；useAppShortcutRouter.ts尺寸处理特殊工具后setBrushSize，workspace-commands-tool.ts保留固定尺寸图像笔刷限制但shape/smooth例外。原生移除多余普通画笔限制，保留特殊工具及图像尺寸门槛（shape例外）。

正式构建exit0（native/build/brush-property-scope-build.log）；唯一入口--animation-check已越过选区画笔Ctrl+3、]及角度显示断言，后续自行退出1：Quick selection must precede transform hit。总检查仍失败，快速选择/变换优先级待核对。来源与diff检查通过，无人工UI验收，完整迁移仍INCOMPLETE。

### 2026-11-05 快速选择验收捕获状态修正

核对legacy canvas-input-selection-begin.ts快速第二次按下先于选区/变换命中，原生顺序已一致。诊断显示失败时未进入选择创建（无press、preview或drag）。smokeSelectionTools键盘辅助函数直接disableFlags(HAS_CAPTURE)，留下Manager捕获者与Widget标志不一致，canvasOwnsPointer拒绝后续事件。改用releaseMouse同步释放，不修改生产快速选择算法，并保留详细失败诊断。

正式构建exit0（native/build/quick-selection-capture-build.log）；唯一入口--animation-check正常关闭测试窗口后exit1，后续错误为Gradient pending tool lock，已越过Quick selection must precede transform hit与Quick cell commit。来源及diff检查通过，无人工UI验收，动画总检查和完整迁移仍INCOMPLETE。

### 2026-11-05 待确认渐变工具切换守卫

legacy workspace-commands-tool.ts setTool在pendingGradientFor存在时拒绝不同工具，setFillKind拒绝离开gradient。原生可配置工具快捷键直接修改工具标志，绕过已有入口限制。runShortcutCommand在临时工具恢复和工具分发之前消费待确认期间的工具快捷键，保留Enter应用、Escape取消。

正式构建exit0（native/build/pending-gradient-tool-scope-build.log）；唯一启动入口--gradient-shape-check exit0，覆盖待提交工具锁定、取消、反向渐变应用及Undo。--animation-check本轮等待时正常CloseMainWindow后exit0，不能称无人干预完成；native-animation-error.txt仍为旧文件，不能作为本轮错误。来源与diff检查通过，无人工UI验收。动画覆盖仅限已有smoke断言，工程稀疏槽/完整历史持久化等已登记缺口仍在，完整迁移INCOMPLETE。

### 2026-11-05 缺失Cel填充暂存预算

核查稀疏工程准入时确认prepareEditableImport与Document::fromImported仍要求全槽；缺失活动槽的图层显示几何尚无导入交接，部分编辑路径仍有限制，因此本批保留IO门槛，不以删除门槛声称迁移完成。另定位fillSparse缺失槽分支直接分配画布，绕过现有槽sparseFillCanvas的文档+暂存256MiB准入。现复用该已有准入/暂存路径，以1×1透明空源生成画布，不改变填充算法、Cel延迟创建或历史语义。

新增回归用256MiB非活动owner分别触发普通/图案填充，确认分配前拒绝且Cel数、历史、revision/contentRevision、dirty及存储身份不变。document-raster-history-tests构建/运行exit0（native/build/absent-fill-budget-build.log、absent-fill-budget-tests.log）。来源及diff检查通过；本批正式编辑器尚未重链接、无人工UI验收。稀疏导入/保存及整体迁移仍INCOMPLETE。

### 2026-11-05 缺失Cel填充正式集成与共享预算核对

上一批缺失Cel填充暂存预算已重链接唯一正式exe，构建exit0（native/build/absent-fill-integration-build.log）；通过唯一启动入口--gradient-shape-check exit0。

继续核对legacy animation.ts clearLayerSurface保留显示几何且不分配Cel，与原生稀疏导入缺少显示几何交接的缺口一致，IO门槛仍保留。探索共享存储预算去重，回归证明输入可共享，但当前缺失Cel填充构造candidate timeline深复制存储；单独去重会低估事务内存，故撤回本轮去重及探索性测试，保留保守预算，不声称共享事务迁移完成。完整迁移仍INCOMPLETE，无人工UI验收。

### 2026-11-05 导入图层显示几何交接

legacy animation.ts clearLayerSurface清空显示像素时保留图层几何；applyFrameSurfaces只在存在Cel时从其表面更新几何。PreparedImport现保留ManifestLayer表面几何，createEditableDocument选好活动帧后交给Document的已校验几何接口，活动现存Cel仍优先投影。接口先校验全部身份/正尺寸/坐标边界再安装，不创建Cel或历史。

project-import-tests与document-raster-history-tests构建/运行均exit0（native/build/import-display-geometry-*），新增检查prepared几何与缺失槽帧剪贴板几何、无Cel/历史/revision变更、无效身份拒绝后缓存保留。来源及diff检查通过。全槽IO门槛仍保留，缺失槽完整编辑/保存/重开未验收；本批正式编辑器尚未重链接、无人工UI验收，完整迁移INCOMPLETE。

### 2026-11-05：缺失 Cel 的编码与图层显示回退

- 依据 `legacy/src/renderer/src/core/animation.ts` 的 `clearLayerSurface/applyFrameSurfaces`、`project-format-encode.ts` 的 layer/animation.cels 编码及 `project-format-raster.ts::encodeRuntimeRasterData`，编码器遍历帧时跳过缺失槽，不生成空 Cel。
- 活动槽缺失时保留 Document 缓存的图层尺寸和偏移，输出独立 `layers/<id>.rgba.tiles` 透明显示资源（64px tile、24字节空头，小图也使用 runtime sparse 格式）；计入展开像素预算，原资源清理同时保留图层显示资源。预览使用可选活动 Surface，并由现有合成器生成透明空帧。
- 回归覆盖有/无源归档、所有槽/仅活动槽缺失、小/大显示几何、普通/恢复/历史三种编码、旧 Cel 资源清理、精确空头字节、空帧预览和无文档副作用。验证：`cmake --build native/build --config Release --target project-save-tests --parallel 4` 退出0；`native/build/Release/project-save-tests.exe native/build/project-manifest-fixtures` 退出0（完整工程保存回归，含上述新增用例）。日志 `native/build/absent-slot-encode-build.log`、`native/build/absent-slot-encode-test.log`。
- 边界：此批为编码与预览实现。`prepareEditableImport`、`Document::fromImported` 及正式保存重开校验仍保留稀疏槽准入限制；尚不能声称稀疏工程可完整打开、编辑和保存。未改动正式程序产物。

### 2026-11-05：无关关联组不再阻止普通图层空槽绘图

核对 `legacy/src/renderer/src/core/animation.ts::syncActiveAnimationLayer` 与 `synchronizeLinkedLayerGroupContentsForTimeline`：单图层提交只对该图层所属关联组同步。原生六处缺失槽保护此前检查整个时间轴的 `hasLinkedLayers()`，导致文档中其他图层的关联关系也阻止普通空槽编辑。改为检查当前图层的 `linkedContentId`，覆盖画笔、选区填充、浮动粘贴、普通/图案填充、渐变、形状入口。

新增七组自动回归，确认取消不创建槽或历史，提交生成一个 Cel 和一个历史项，撤销/重做恢复像素，其他关联组的像素和共享存储身份持续一致。`document-raster-history-tests` 构建和完整测试退出0；日志 `native/build/unrelated-links-absent-build.log`、`native/build/unrelated-links-absent-test.log`。当前活动图层本身属于关联组时的稀疏生命周期仍明确未迁移；正式程序本轮未重新链接，尚未进行桌面验收。

### 2026-11-05：关联图层缺失活动 Cel 的画笔提交

依据 `animation.ts::syncActiveAnimationLayer/synchronizeLinkedLayerGroupContentsForTimeline` 的活动源优先规则，为 Timeline 构造增加可选 preferredOwner，确保首次共享就采用新提交 Cel，避免先构造再指定源时新数据已被覆盖。画笔缺失槽提交接入该参数，取消或无变化不创建槽；仅创建活动槽，同组缺失同伴不自动补槽。已有同伴按旧版连通分量共享新像素及保持独立放置。

新增四种组合回归（同伴有/无槽 × 有/无跨帧 Cel 链接），检查取消、透明空笔画、新槽数、提交内容、共享身份及撤销/重做。构建 `document-raster-history-tests timeline-model-tests` 退出0；两个完整测试均退出0。日志：`native/build/linked-absent-brush-build.log`、`linked-absent-brush-test.log`、`linked-absent-timeline-test.log`。

范围仍有限：关联空槽的其他工具仍保留未迁移保护，稀疏导入与正式保存重开限制未解除；正式应用未重新链接，无桌面验收结论。

### 2026-11-05：关联空 Cel 的填充、渐变、形状和粘贴

沿用画笔已验证的 Timeline preferredOwner 构造能力，将缺失槽的普通/图案填充、选区填充、渐变/形状、浮动粘贴提交均设为新 Cel 优先源，移除对应未迁移保护。依据 `animation.ts::syncActiveAnimationLayer/synchronizeLinkedLayerGroupContentsForTimeline`、`linked-layers.ts::shareLinkedRasterContent`，以及 `workspace-commands-history.ts` 提交像素历史后同步活动图层的顺序。仅活动槽创建 Cel，同组缺失槽保持缺失；关联共享仍使用现有连通分量算法。

新增24种组合测试（同伴槽有/无 × 跨帧链接有/无 × 六类工具），验证预览取消、单槽/单历史提交、共享存储身份及撤销/重做像素。`document-raster-history-tests` 构建和完整运行均退出0；日志 `native/build/linked-absent-tools-build.log`、`native/build/linked-absent-tools-test.log`。

此结果不等于稀疏工程全功能验收：特殊图层空槽生命周期、导入准入和其他 Cel 消费方仍有缺口。正式程序尚未重新链接，也未做本批桌面运行验收。

### 2026-11-05：空槽渐变预算与画笔安装失效通知

- 空槽渐变入口补齐现有原生稀疏渐变的256MiB像素预算：现有Cel存储、两份画布暂存及可见图层取样缓冲在分配前检查。普通取样直接引用空基线，去掉无用整幅复制。此为原生密集暂存的必要防护，仍不代表已达到legacy稀疏分配性能。
- 新增预算耗尽时两种取样模式均原子拒绝的回归，核对未创建Cel/预览/历史、版本及存储身份不变；释放一行后可预览并取消。`document-raster-history-tests` 构建和完整测试退出0，日志 `native/build/absent-gradient-budget-build.log`、`absent-gradient-budget-test.log`。
- 对照 `workspace-commands-history.ts` 的同步后touch顺序，空槽画笔安装新时间轴后补发内容失效通知，避免最终共享安装仅依赖提交前预览版本。关联空槽画笔回归新增提交内容版本递增断言；再次构建及完整测试退出0，日志 `native/build/absent-install-refresh-build.log`、`absent-install-refresh-test.log`。
- 正式程序未重新链接；全量迁移、稀疏工程准入和桌面验收仍未完成。
