# 工程打开、保存与恢复：第一批语义核对

中文；返回[需求基线](README.md)与[文件领域需求](requirements/files.md)。核对日期：2026-10-12（北京时间）。

本页细化 FS-002、FS-003、FS-004、FS-005、FS-006、FS-008，不新增或重编号上层需求。表内编号是稳定子项，验收分别归入对应 AC-FS 编号。旧版源码基线仍为 `a5b174a3c0ac8bffaeee035f8af21dfd8c94dd4d`，版本声明为 1.0.0-beta9；使用搬迁后的 legacy 源码执行自动测试，没有启动桌面应用，没有原生版二进制。

## 已核对的参数与对象

| 参数／对象 | 当前语义 | 证据与边界 |
| --- | --- | --- |
| 工程格式 | 当前写出 v21；读取迁移入口接受 v1–v21；外层与文档内版本必须一致，app 必须为 MoonSprite | [migrateProjectManifest](../../../legacy/src/renderer/src/core/project-format-manifest.ts)、[版本常量](../../../legacy/src/renderer/src/core/project-format-manifest-types.ts)。这不是每个历史版本都已经实测 |
| 颜色模式 | rgba、indexed、grayscale；宽高为正的安全整数 | [decodeProject](../../../legacy/src/renderer/src/core/project-format-decode.ts)。这是读取器检查；不据此宣称任意大画布都可用，产品尺寸上限另需核对 |
| 保存目标 | 已保存路径优先于最初导入路径；`.bak` 不作为直接写回目标；无可用路径则选择位置 | [documentSaveTarget](../../../legacy/src/renderer/src/core/document-save-policy.ts) |
| 沿用原格式 | 默认开启；关闭后，普通保存非原生来源需要先确认保存为工程；已有 moonsprite 正常写回 | [默认设置](../../../legacy/src/renderer/src/core/file-preferences.ts)、document-save-format 测试 |
| 自动恢复 | 默认开启，每 5 分钟；周期允许 0.5–60 分钟；非法或空值回默认，有限数值夹到范围 | [设置解析](../../../legacy/src/renderer/src/core/file-preferences.ts)、[定时入口](../../../legacy/src/renderer/src/components/app/useAppDocumentIO.ts)。前台切换不等于一次自动恢复触发 |
| 恢复保留 | 默认 7 天；1–365 天，设置端取整并夹到范围，非法值回默认 | 同上；[平台保留清理](../../../legacy/src-tauri/src/platform_recovery.rs)在列举时删除超龄记录，恰好等于期限仍保留 |
| 本地历史 | 默认关闭，默认步数 50；属于可选的跨重开历史能力 | [设置](../../../legacy/src/renderer/src/core/file-preferences.ts)、[历史服务](../../../legacy/src/renderer/src/store/local-history-service.ts)。步数范围、额度与 UI 操作另核对 |
| 缩时展开限制 | 对 deflate 内嵌录像条目的累计展开量检查 512 MiB 限制，超限抛错 | [storedTimelapseEntryViews](../../../legacy/src/renderer/src/core/project-format-zip.ts)。不是整个工程的统一文件大小上限 |

## 保存事务与失败边界

| 子项 | 前置／输入与结果 | 验收与证据 |
| --- | --- | --- |
| FS-003/S01 | 对同一文档排队保存；普通工程保存可以复用刚完成的同代结果。只有内容修订、文档对象、录像快照与参与保存的元数据均匹配才合并；另存为和显式选项独立处理 | AC-FS-003：阻塞第一写入，再发两次相同请求只写一次；分别改变内容、录像、名称则写两次。已运行 document-save-queue 的对应用例 |
| FS-003/S02 | 前一次写入失败，原调用者收到失败，后续排队请求仍可重试；失败不得接受新的磁盘基线或假称保存成功 | AC-FS-003：第一次拒绝、第二次成功；队列测试已通过。真实磁盘原子性不由模拟 API 证明 |
| FS-003/S03 | 保存完成只对实际写入的内容代生效；期间继续编辑，当前文档仍为待保存，不删除其恢复记录，并安排后续恢复保护 | AC-FS-003：写入挂起时绘制，再释放写入，检查 dirty、提示和恢复调用。已运行 workspace 的 save concurrency 用例 |
| FS-003/S04 | 路径弹窗取消或目标文档已失效，终止写入；格式损失确认等待期间如果新增未批准的损失，拒绝沿用旧确认 | AC-FS-003/004：取消不调用写入；确认层损失时新加动画，必须失败而不写。后一个分支已运行 format 测试；弹窗完整交互待桌面验收 |
| FS-003/S05 | 保存命令先处理未完成渐变、提交浮动粘贴、等待在途录制。提交编辑产生的历史归编辑事务；文件写入本身不增加绘画历史 | AC-FS-003：有浮动像素时保存后能重开且一次撤销对应粘贴；渐变取消阻断写入；录像失败阻断普通保存。本批只核对调用顺序，相关交互尚未执行 |
| FS-003/S06 | 增量复用只是优化，结果必须等价于完整工程。增量写入失败可退回完整写入，只有成功后更新基线；完整写入再失败必须报错 | AC-FS-003/005：模拟源归档丢失后完整写出并重开，再模拟两种写入均失败。实现已定位，此异常组合本批未执行 |
| FS-003/S07 | 新版写入须在替换旧目标之前完成内容写出与校验，失败保留旧工程；不可把返回成功当成断电持久性已验证 | AC-FS-003：在隔离目录注入写入、校验、替换失败并核对旧字节。Rust 侧原子替换源码已核对，本批未运行 Rust／断电测试 |

保存的实现证据：[saveDocumentFile](../../../legacy/src/renderer/src/store/document-file-service.ts)、[saveActive](../../../legacy/src/renderer/src/store/workspace-commands-document-io.ts)、[平台原子写入](../../../legacy/src-tauri/src/platform_storage.rs)。新版可改变队列实现与编码器，不改变上述用户可见结果。

## 非原生格式的能力损失

FS-004/F01：提示必须描述当前编码器实际不能保留的内容，提供“保存完整工程／继续所选格式／取消”。默认缺少确认结果时取消。选择继续有损格式只授权当前已列出的损失；不授权保存等待期间新增的损失。来源：[保存策略](../../../legacy/src/renderer/src/core/document-save-policy.ts)。

| 当前提示类别 | 检测语义 | AC-FS-004 验收 |
| --- | --- | --- |
| 图层 | 非 ASE/PSD 的格式遇多层或图层组 | 两层 PNG 提示；取消不写，选工程改目标，继续写来源 |
| 帧与循环节 | ASE 与 GIF 可保留帧；其他格式的多帧触发帧损失；非 ASE 的循环节触发损失 | 动画 GIF 保存后仍有两帧；PSD 多帧需提示 |
| 可编辑内容、帧禁用标记 | 非普通图层类型或文字/瓦片 cel；任意被禁用帧 | 单独构造文字和禁用帧样本，逐项核对编码结果；本批未覆盖所有类别 |
| 效果、资源、录像 | 非 PSD 的蒙版／已启用图层样式／剪贴或累积混合；自定义笔刷／Tileset／切片；已录快照 | 不因格式有同名字段就声称支持；需对照实际输出，不能只断言提示字符串 |
| JPEG 透明与 GIF 色彩 | JPEG 透明像素、部分画布覆盖、层或 cel 透明度；GIF 半透明、超过 255 种不透明 RGB 或透明度 | 有损语义检查；本批 JPEG/WebP 编码被测试桩替代，未证明真实编解码质量 |

以上是旧提示的已核对检测范围，不是所有内容都已检查完。v21 参考图等新增资源未出现在该损失分类中，登记 GAP-017；新版不得据旧提示为空就认定能完整承接。保存测试人为构造 PSD 来源也不证明旧版具有 PSD 导入入口。

## 打开与资源身份

| 子项 | 语义与不可变状态 | 验收与状态 |
| --- | --- | --- |
| FS-002/O01 | 多文件选择按顺序读取并分别建立会话，打开不回写源文件；失败不得破坏已有会话 | AC-FS-002：阻塞首个文件，只能见首个读取；释放后再读第二个。顺序用例已通过，部分失败时剩余文件处理待核对 |
| FS-005/P01 | 不猜测未来版本；错误 app、版本不一致、缺失或不合法的作品资源拒绝。旧版本按当时语义迁移，不能采纳当时尚未支持的同名字段 | AC-FS-005：未知版本失败；已执行 v14 自由瓦片、v16 关联层之前、v17/v18 集合身份等样本。未宣称 v1–v21 全覆盖 |
| FS-005/P02 | 保存重开保留原始 RGBA 字节（包括透明像素 RGB）、稀疏存储结果、独立偏移、共享资源关系、文字属性与动画结构；不能仅比较合成预览 | AC-FS-005：关联图层、共享 Tileset/自由瓦片集合、文字与稀疏像素的旧测试已通过。参考图、全部蒙版和全部颜色模式仍需专门矩阵 |
| FS-005/P03 | 无效共享关系、丢失瓦片引用、重复／遗漏稳定瓦片 ID、错误资源尺寸及损坏稀疏目录必须拒绝，不用别帧内容补洞 | AC-FS-005：project-format 测试中的对应反例已通过 |
| FS-008/T01 | 内嵌录像缺帧或帧尺寸非法可丢弃对应帧，并报告数量和原因；正常录像不产生丢帧报告；缺本地录像库不等于作品本身损坏 | AC-FS-008：三帧丢中间帧后保留首尾并报告 1 帧；本批验证内嵌帧报告，未验证桌面告警和缺本地库体验 |
| FS-008/T02 | 达到已检查的 deflate 展开限制时拒绝，而非为了继续打开静默截短完整录像 | AC-FS-008：超限制目录在展开前抛错；已通过。不能将这个测试扩大为所有恶意归档防护已通过 |

实现及样本：[工程格式测试](../../../legacy/src/renderer/src/core/project-format.test.ts)、[录像恢复测试](../../../legacy/src/renderer/src/core/project-format-timelapse-restore.test.ts)、[读取器](../../../legacy/src/renderer/src/core/project-format-decode.ts)。

## 恢复、回溯与删除

| 子项 | 语义 | AC-FS-006 验收与状态 |
| --- | --- | --- |
| FS-006/R01 | 从恢复记录读取后建立待保存文档，清除普通保存／来源路径，不自动覆盖旧来源；保留原草稿记录 | restore 的 dirty 与无路径结果已通过；连续恢复、关闭放弃的完整入口仍待验收 |
| FS-006/R02 | 对待保存且未抑制恢复的会话写恢复；相同内容／会话修订可跳过；成功后才记住已写修订；某文档失败后仍处理其他文档，最终报告失败 | 服务串行、去重、失败重试、等待整批完成的测试已通过。恢复写出不改变文档撤销历史 |
| FS-006/R03 | 明确删除与在途自动恢复串行，删除之后不允许旧队列复活该记录；删除失败不能从 UI 假装移除 | 队列与错误传播测试通过，但平台实际吞删除错误，见 GAP-014。此条新版要求不能标成旧版完整实现 |
| FS-006/R04 | 完整保存当前代后可清理对应恢复；新编辑未落盘则继续保留；仅打开／恢复不删除。保留期限到期清理是另一独立删除条件 | 内容并发保存测试已通过；期限边界源码已核对，Rust 清理测试未运行。不再使用“仅显式删除或保存才清理”的绝对表述 |
| FS-006/R05 | 恢复工程与描述成对可发现；任一阶段中断不得使仅存的有效作品不可访问，删除必须反馈非“文件已不存在”的错误 | 旧版两文件分别原子写出，没有跨文件原子提交；需定义孤儿扫描／提交恢复策略，见 GAP-015。本批未注入真实进程中断 |
| FS-006/H01 | 开启本地历史后，可在重开时恢复历史位置和 Undo/Redo；磁盘工程较新或历史加载期间已有新编辑时，不用旧历史覆盖它 | local-history-service 的并发、过代、加载期间修改及重开历史测试通过；格式和步数额度需独立冻结 |
| FS-006/H02 | 选择工程备份回溯为一次可撤销编辑，保留当前工程保存身份；Undo 回原作品，Redo 回备份作品；选择备份不是立即写磁盘 | 1×1 红／蓝样本、保存路径与 Undo/Redo 已通过。备份列表、清理政策和真实磁盘副本待平台验收 |

证据：[恢复服务](../../../legacy/src/renderer/src/store/recovery-service.ts)、[恢复命令](../../../legacy/src/renderer/src/store/workspace-commands-recovery.ts)、[恢复平台](../../../legacy/src-tauri/src/platform_recovery.rs)、[本地历史](../../../legacy/src/renderer/src/store/local-history-service.ts)、[备份回溯测试](../../../legacy/src/renderer/src/store/workspace-project-rollback.test.ts)。默认历史关闭不表示可以删除该用户能力。

## 本批自动验证记录

环境：Windows x64、Node v24.19.0、Vitest v4.1.11。运行旧版生产模块及其原有测试，平台写入多使用内存桩；所有文件路径为测试构造，没有用用户真实工程验证，没有写旧应用源码或新增实现测试。

在 `legacy/` 执行：

```powershell
pnpm exec vitest run src/renderer/src/core/project-format.test.ts src/renderer/src/core/project-format-timelapse-restore.test.ts src/renderer/src/store/document-save-queue.test.ts src/renderer/src/store/document-save-format.test.ts src/renderer/src/store/recovery-service.test.ts src/renderer/src/store/workspace-project-rollback.test.ts src/renderer/src/store/local-history-service.test.ts --reporter=dot
pnpm exec vitest run src/renderer/src/store/workspace.test.ts -t 'save concurrency|file open concurrency' --reporter=dot
```

结果：第一条 7 文件、102 项通过；第二条 2 项通过、95 项因筛选跳过。合计 **104 项通过**，不把跳过项计入通过。第二条出现测试桩缺少 readUsageStatistics/writeUsageStatistics 的 stderr 警告，相关统计模块错误被记录，目标用例仍通过；这不是统计功能验收。

本批证明的是表中指定分支；没有完成桌面、Rust 文件系统、异常断电、全部旧格式、恢复目录迁移和新原生版验收。剩余工作按 GAP-014–017 与表内待核对项推进，不把本页改写为“文件领域全部已确认”。
