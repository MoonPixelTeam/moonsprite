# 保存与关闭续接的失败矩阵

状态：2026-11-12，C05 定向核对记录。本文列出已有测试与未决项，不表示 C05 整体验收完成。包含 C07 和 Editor 直接依赖的当前正式应用已构建，native-save、aseprite-save 等 26 项适用 GUI 通过；失败矩阵整体仍有未决项。

## 依据与验收版本

实现入口：`src/save_task.h`、`src/editor_session.cpp` 的保存协调与接纳、`src/editor_recovery.cpp` 的保存后清理、`src/recovery_store.cpp` 的原子提交。夹具入口：`tests/save_task_test.cpp`、`tests/editor_recovery_test.cpp`、`src/editor_native_save.cpp::smokeNativeSaveLifecycle`、`src/editor_aseprite_save.cpp::smokeAsepriteSaveLifecycle`。

Legacy 依据沿用来源登记中的 `document-file-service.ts`、`document-save-queue.test.ts`、`document-save-format.test.ts`、`document-save-policy.ts`、`platform_files.rs`；本轮不改变格式、路径、备份和恢复协议。

- SaveTask 服务及恢复清理定向测试已有生产代码执行证据，见审计 10.7—10.9。
- 正式应用 05:41 的二十项、06:15 的二十六项 GUI 矩阵均含 native-save、aseprite-save；06:32 的 C08 程序也实际通过 native-save。详见审计 10.11—10.13 的程序哈希和日志。
- 当前 C07 接入后的 native-save、aseprite-save 已实际退出 0，正式程序和 26 项矩阵见审计 10.16；源码核对与实际执行分开记录。
- 会话直接持有视图状态后的正式程序 SHA-256 `8b148c9caf1fb090fd2dbe208d82e5b8ef0038deaed1826d1d51cad38911662f`，32 项相关 GUI（含 native-save、aseprite-save 与脚本入口）通过；同一程序另行运行保存确认专项，27 个真实交互场景在 3.51 秒内通过，无超时或新错误，见审计 10.20 和 `build/test-tmp/coupling-session-view-save-decision-gui`。这不关闭下文未复现的恢复提交失败。

- 明暗与轮廓会话归属后的正式程序 `96adb92747e6afc24512f9d0063e5987b6ffb018f4842789414e1439d6fb9948`，native-save、aseprite-save、save-decision 与相关十四项 GUI 全部通过；save-decision 阶段完整至 completed=27，见审计 10.21。这是新程序的回归证据，不新增下文未知恢复提交失败的根因证据。

## 已有覆盖

| 情形 | 应保持的结果 | 现有证据入口 |
| --- | --- | --- |
| 快照后继续编辑 | 可接纳文件，不能将新编辑标记为已保存或删除其恢复保护 | SaveTask；native-save 的 older save、exact queued save |
| 非活动 A 保存完成，当前为 B | 仅修改 A 的路径、保存点与恢复状态，B 像素和历史保持 | native-save 的 inactive acknowledgement、older inactive save |
| 两个后台保存逆序完成 | 各任务仍绑定原身份；关闭其他标签不丢失 worker | native-save 的 different documents、second background save、surviving save owner |
| 普通 Save 与 Save As 排队 | 仅合并原协议允许的普通请求；Save As 在前一任务结束后选择目标、捕获新版本 | native-save 的 queued Save As、inactive queued ordinary/Save As |
| 显式选项与普通 Save 排队 | 显式选项请求保留，不能被 exact 普通保存去重吞掉 | native-save 的 explicit option save，实际 PNG 100%→200% |
| 身份不符或代次已变化 | 拒绝错误 owner 的结果；保留新版本 dirty、像素、历史 | SaveTask wrong identity / generation；native-save |
| 不增加 revision 的对称或面板变更 | 不误判 exact；后续保存保留实际面板与对称状态 | native-save 的 symmetry preview、panel metadata、Save As local panel state |
| 编码或提交失败 | 不提前更新目标、保存点或清理恢复；保留可重试上下文 | SaveTask failed job；native-save 的 failed native commit / queued retry |
| 后台提交失败 | 当前 B 不受影响，A 的恢复和重试保留 | native-save 的 background failure / inactive retry |
| 已保存，但恢复删除被锁定 | 明确保存成功而清理失败，保留标签和恢复文件；消费错误不等于确认成功 | saved-recovery-cleanup；native-save 的 consumed cleanup failure |
| 解除恢复文件锁后重试 | 清理成功后才能续接原身份的关闭 | saved-recovery-cleanup；native-save cleanup retry |
| 保存进度被关闭 | 完整任务继续后台执行，不丢捕获、worker 或所属会话 | SaveTask 转移；native-save capture close / dismissed capture |
| 关闭期间出现新编辑 | 不关闭未保存的新版本，按原流程追加保存或重新确认 | native-save 的 deferred close discarded edits / newer native generation |
| 保存后关闭非活动标签 | 关闭身份对应标签并释放其独立参考视图；不等待无关文档保存 | native-save 的 deferred inactive tab close / unrelated background save |
| 应用退出等待后台保存 | 等待实际完成与必要清理后才续接应用关闭 | native-save application close |
| 同一路径的并发所有权 | 既有目标预留与路径语义保持，不新建重复 owner | native-save 的 concurrent Save As / opening pending target |
| 原格式及原生另存 | 沿用原格式损失决策与原生保存分支，失败／取消保留来源 | aseprite-save；native-save 的 preferred format / backup / source 检查 |
| 格式确认期间改变 saved/source 路径或替换 Document | 拒绝旧确认，不捕获／编码／覆盖文件，不恢复旧身份 | save-decision：PNG／ASE／PSD 各三类真实兼容弹窗；原生 chooser 路径／替换 |
| 格式确认期间新增损失类别 | 拒绝未授权损失，保留原文件和当前编辑 | save-decision：PNG／ASE／PSD 新帧及 disabled-frame 损失 |
| 格式确认取消或关闭 owner | 取消不改变作品／历史／文件；关闭后不复活会话，请求返回后释放原 Document | save-decision：三格式取消／关闭；原生 chooser 关闭 |
| 格式确认期间切到 B 或继续画 A | 保存仍属于 A；已批准类别内的最新像素允许保存，B 保持 | save-decision：三格式切标签／继续像素编辑 |
| 恢复进程退出于提交中间 | 只接受完整且校验匹配的载荷；保留旧文件、描述符及不相关临时证据 | editor-recovery 的 descriptor / payload / metadata / temporary crash 场景 |

最新保存回归使用审计 10.22 的正式程序（SHA-256 `5f4d3cad54c8f9114b278ed2456fc94e47b13e3657b89a31c7248815716fb094`）：native-save、aseprite-save、save-decision、多文档和 script-entry 均退出 0，保存确认阶段完整至 `completed=27`。记录位于 `build/test-tmp/coupling-session-pivot-palette-gui`。本批没有新增恢复提交失败的根因证据，以下未决项保持。

播放会话迁移后的正式程序（审计 10.23，SHA-256 `9bfe6b7f11465667bd666c51e060b03cdc7bce8d1968179b60978830fe3de81b`）再次通过 native-save、aseprite-save、save-decision、多文档、script-entry／script-playback／script-window-host，保存确认完整至 `completed=27`，证据在 `build/test-tmp/coupling-session-playback-diagnostic-gui`。本轮无恢复提交失败根因的新证据。

## 未决失败与下一步

`build/test-tmp/coupling-services-only-tests.log` 的 editor-recovery 曾失败：子进程 9436 退出 1，原始错误为 `Cannot commit recovery`。证据保留于 `build/coupling-services-only/test-tmp/editor-recovery-owned/run-39970311652700/cross-process/child-error-9436.txt`。该轮没有 Windows 错误码，不能据此判定为共享冲突、锁失效或编码错误。

随后仅增加失败错误码诊断，完整 editor-recovery 单次执行通过，记录为 `coupling-services-only-recovery-diagnostic-tests.log`；因为没有对应行为修复，这次通过不关闭原失败。后续在正式应用编译期间，对带 Windows 错误码诊断的同一无 UI 服务目标做一次定向复查，editor-recovery 4.12 秒退出 0，见 `coupling-recovery-error-code-followup.log`；仍未复现原失败，不据此判定根因或关闭未决项。已确认并修复的 WinRT apartment 生命周期竞态是另一项问题，不可作为此次原子 rename 失败的根因。

后续需要在保留原文件、已有提交顺序与目录锁的条件下取得实际失败的 Windows 错误码及目标／阶段，确认失败来自哪个操作和读写所有者，再增加相应的受控失败回归并修复。禁止用盲重试、延长超时或删除恢复文件使测试表面通过。格式确认上下文现已提取并接入，纯服务断言实际通过；27 个新增真实弹窗／chooser 场景已在正式应用通过，aseprite-save、native-save、多文档及两个脚本入口也通过（审计 10.19）。各格式的完整失败矩阵也仍需逐条核对，不能仅从 SaveTask 服务测试推断所有 UI 分支均已覆盖。

## 2026-11-13 三阶段恢复提交拒绝回归（审计10.55）

新增真实Windows目标文件锁分别阻止descriptor（.recovery-pending）、payload（.moonsprite）、metadata（.json）原子替换，未注入sleep或生产重试。错误包含原始Windows代码、明确阶段、UTF-8目标/私有临时路径和pid；代码在路径格式化与清理前捕获，中文测试路径通过。临时创建错误现也带系统码；成功但短写显式报告ERROR_WRITE_FAULT，不读取可能过期的LastError。这两种额外错误分支本轮没有专门故障注入，不能从rename检查推断覆盖。

三阶段检查证明锁定文件字节不变、metadata尚未提交时旧metadata保留、payload失败时旧payload保留；metadata失败时新payload已成功，恢复发现仍通过匹配descriptor/CRC显示新描述，保持原协议。私有失败临时文件按原逻辑清理，解除测试锁后显式重试完成并清理descriptor；没有修改用户数据或采用盲重试。

正式程序SHA-256 `375b37fd5e3ad4cb0259563300000bd1b98c5179c17b8563b2912cfcc4406b9f`；完整editor-recovery、saved-recovery-cleanup及四项边界6/6通过，保留原跨进程/崩溃/临时文件测试。原生保存、ASE保存、27场景确认、多文档及脚本入口同版5/5通过，见coupling-recovery-stages-*。本轮不证明旧9436失败由共享冲突造成，也不关闭该未知根因；完整格式失败矩阵剩余条件不变。

## 2026-11-13 全保存格式的真实提交拒绝矩阵（审计10.57）

唯一正式入口 `build/Release/moonsprite-native.exe --native-save-check --save-format-failure-only`，复用原生保存测试自有目录；没有新增主程序分派、公共测试字段或生产状态机。测试实际运行DocumentSnapshot、编码器、原子写入、saveTick及前后台结果接纳，不使用持久化/编码mock。只在已有fixture边界等待结果，目标文件由测试自己持有Windows禁止删除共享锁，解除锁后明确调用重试；不在生产逻辑增加自动重试。

| 格式 | 前台写入失败及重试 | 后台A失败/重试、B保持活动 | 关闭续接失败保留A | source-only失败/重试保持工程路径 |
| --- | --- | --- | --- | --- |
| moonsprite | 通过 | 通过 | 通过 | 不适用 |
| PNG / JPEG / WebP / SVG / ICO / BMP / GIF / PSD / ASE / ASEPRITE | 每格式通过 | 每格式通过 | 每格式通过 | 每格式通过 |

合计43个场景。每个场景先用生产流程成功写出旧文件，再编辑A、生成恢复保护并锁定旧目标。失败后检查旧目标及恢复文件字节不变、dirty保持、项目/来源路径与archive/projectId基线不变、像素/历史/revision保持、所属会话仍在且没有关闭续接。后台场景还检查B的活动身份/路径/像素不受影响。解锁后的显式重试检查新目标已写、A exact清dirty、source-only保留工程路径、恢复清理接纳成功；后台重试不激活A。

正式程序SHA-256 `f040e6e4fb629283afe4732b42b1f095d5633673542dd1c106bdaf10011c8e39`，43场景专项及原native-save、aseprite-save、27场景格式确认、多文档和脚本入口共6/6 GUI通过，四项边界通过；同版程序身份与43条完成记录已核对，证据coupling-save-format-failure-*。旧suite及生产代码在新增诊断分支以外精确还原。

限度：这是各格式的原子提交拒绝覆盖，没有分别注入编码器故障、磁盘满、临时创建或flush失败；不能据此把全部文件系统错误视为穷尽。确认/chooser取消与上下文变化仍使用原27场景证据。本轮未修改产品行为，也未定位旧恢复child9436的偶发提交失败，C05和整体目标继续未完成。没有新增人工图像或性能验收。


## 当前批次验证准备

本批源码将文件保存接纳、恢复清理、recent/usage记账分开。路径与名称在接纳前准备；清理派发拒绝保留原future、快照与恢复身份，关闭门禁继续识别失败。依照legacy recovery-service.ts的queue.then(task, task)，前驱自动恢复失败仍执行清理，前驱失败不计为已成功自动保存。新增受控派发拒绝、invalid future、前驱失败且清理成功、真实文件锁造成双重失败及显式解锁重试夹具。当前正在统一编译，尚无本批运行通过结论；未知旧提交失败和格式矩阵缺口保持开放。


## 原子提交边界收口（当前大步，待统一验证）

工程、图片/二进制及恢复文件委托同一`writeAtomicBytes`协议和`moon-atomic-file` Windows适配。该边界只拥有一个唯一临时文件及原生句柄；不读取Editor、Document、当前标签或dirty。沿用1MiB写块、flush、close、调用方验证/备份、原子替换及失败时仅清理本次成功创建临时文件。工程的完整归档准入/65536字节验证/备份顺序、恢复目录锁/descriptor/CRC/三个提交阶段与crash checkpoints均保留，编码算法和保存接纳不变。

独立操作接口可确定性拒绝CREATE_NEW、WriteFile/磁盘满、短写、FlushFileBuffers、验证/备份、替换；错误保留原代码及UTF-8目标/临时路径、具体domain阶段和pid。所有格式的写入失败已共用该边界，但独立后端注入不等同于在每个GUI格式上注满磁盘；真实43场景提交拒绝、恢复文件锁和跨进程测试继续作为实际文件系统证据。既有错误码缺失的child9436不据此宣布修复，也不采用生产盲重试。

三个写入模块此前各有临时名serial，现在共用一个进程内序列，避免同进程同目标同tick且独立序列相同的CREATE_NEW冲突。这是明确的内部冲突收口，不证明旧跨进程失败由该原因造成。工程短写现在使用明确ERROR_WRITE_FAULT，避免读取未失败WriteFile留下的过期LastError。


本大步共享协议/平台适配现已编译，atomic-write等14项相关服务/边界及同版7项GUI通过；43项真实文件锁提交拒绝/显式重试完成。纯后端注入覆盖创建、写入/磁盘满、短写、flush、验证、备份和替换的错误传播/临时文件所有权。具体证据与程序身份见实施报告最新节。没有把注入等同于真实系统满盘或逐格式编码器故障；未知旧child9436仍开放。


## 最新 C05 保存边界验收（2026-11-13，本节替代本批待验证状态）

整体仍为9/10，C05部分完成，未将历史未知失败算作已修复。保存worker已从Editor提取至`src/captured_save.h`：只消费DocumentSnapshot、冻结的保存请求与录制读取器，返回结果；活动Document接纳、恢复清理及关闭续接仍由协调层负责。沿用既有编码、原子写入及portable录制逻辑，没有增加生产自动重试。

正式Release构建成功，日志`build/test-tmp/coupling-c05-build.log`。唯一正式程序SHA-256：`8f4d194752a00cff08211e64fb704d01e488d60b7172a457f5bdde0e508ddd2b`。919个冻结源码/测试/脚本输入无漂移，GUI期间程序哈希一致，证据`build/test-tmp/coupling-c05-final-consistency.json`。

- 独立captured-save：256个失败/显式重试场景通过，覆盖原生及10个图片格式、前后台与source-only、编码/创建/写入/磁盘满错误码/短写/flush/替换及原生验证/备份拒绝。检查旧目标、实时文档像素/历史/修订/dirty/路径/归档身份、恢复保护及临时文件/句柄所有权，显式成功重试使用真实默认操作。此处文件系统故障属于受控操作注入；原生编码使用真实编码器限制，图片异常注入不能替代真实逐格式编码器验收。日志`coupling-c05-captured-save-detail.log`。
- 正式GUI真实编码器拒绝：10个图片格式各4类上下文，共40场景通过。使用1025×17画布与6400%缩放，触发真实编码尺寸/预算校验；保留旧目标、恢复数据、dirty、身份和关闭意图；改为100%后显式重试成功，后台A不激活且B保持。未使用编码或持久化mock。
- 同版43个真实Windows文件锁提交拒绝/重试、完整native-save及aseprite-save全部退出0。完成trace分别为40和43，日志和trace副本在`build/test-tmp/coupling-c05-gui-20261113-125357`。
- image-save、project-save、editor-recovery、saved-recovery-cleanup、atomic-write、save-task共6/6通过，日志`build/test-tmp/coupling-c05-services.log`。来源覆盖、架构边界与diff检查结果另存`coupling-c05-provenance.log`、`coupling-c05-architecture.log`及`coupling-c05-diff.log`。本批没有新增人工图像或性能验收。

尚未闭环：旧child9436只有22字节`Cannot commit recovery`，当时Windows码、操作阶段、路径及句柄owner未记录，无法从后续成功运行还原根因。未改动legacy的原子写入探针也曾出现os error 5，只证明跨实现出现过拒绝，不证明旧9436根因。现有错误码/阶段/路径/pid诊断与三阶段锁拒绝检查用于未来失败定位；不得将新测试通过登记成旧失败已修复。真实系统满盘未执行，受控ERROR_DISK_FULL与真实满盘明确区分。已登记的legacy-partial及strict迁移缺口继续有效。
