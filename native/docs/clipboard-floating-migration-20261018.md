# 普通粘贴与已物化浮动变换（2026-10-18）

本批将普通粘贴接入现有浮动预览、提交、取消链路，沿用 legacy clipboard-service.ts 的系统源优先、透明/失败回退与内容相等保留内部来源语义，并迁移 clipboard-placement.ts 的双轴来源与视口回退。隐藏图层允许粘贴；锁定图层拒绝。完整源载荷保留，缺省 mask 视为全选，仅 mask===1 采样。

已物化浮动变换按 legacy selection-transform-targets.ts 的顺序与 canonical 去重读取 world 坐标源，保留画布外 Surface 内容；混合稀疏目标使用预先暂存的完整 Surface 预览及历史，稠密目标保留增量快路径。目标、预算及历史预检在发布前完成。

来源登记见 legacy-provenance.json，具体源包括 store/workspace-commands-clipboard.ts、store/clipboard-service.ts、core/clipboard-placement.ts、core/tools-selection-transform-{source,apply,translation,raster,rotsprite}.ts、core/selection-transform-targets.ts、store/workspace-floating-preview.ts、store/workspace-commands-selection-floating.ts 及对应测试，均位于 legacy/src/renderer/src/。

## 验证与限制

正式构建通过；document-raster-history-tests、clipboard-document-tests 通过；正式程序 --playback-floating-check PID43900 退出0。provenance 311文件覆盖通过，strict仍失败并标记INCOMPLETE。

cel-selection-clipboard-tests 未通过：检查4255，当前5143行既有 deselectPending 断言要求浮动提交后保留选择且仅增一笔历史。实际 legacy components/app/app-selection-shortcuts.ts107–113 调用 commitFloatingPaste(label)，store/workspace-commands-selection-floating.ts415 清除选择、506另加取消选择历史。保留原断言与生产实现，登记该冲突，不宣称完整 deselect/恢复生命周期等价。测试仅增加失败行号诊断。

project-save-tests 使用 native/build/project-manifest-fixtures 后未通过既有189行 Grouped duration 断言：它要求 historySize 不变；document.cpp365–367 的既有 commitFrameDuration 实现 pushEdit/groupEdits。本批未修改这些函数或该断言，未扩展修复。

尚未迁移 legacy 大画布 deferred overlay、画布外目的地延迟提交及 owner 仅偏移优化；非浮动 flip/rotate/nudge、pasteCels 与外部稀疏IO接纳未扩展。本批不得视为全部变换或性能等价迁移完成。

详细构建、测试和哈希证据：native/build/floating-paste-final-20261018.json。

## 后续闭合：稀疏 Cel、非浮动变换与取消选择恢复

本批按实际 legacy 修正上文 deselect 冲突：浮动提交后取消选择，像素提交与取消选择分别入历史；撤销一次恢复选区，普通 clipboard 像素提交还恢复原始浮动载荷（含画布外部分）。未改动恢复态的再确认、取消或继续撤销不重新叠加像素；首次真正变换继续使用原始预览基线。内容移动不是 clipboard 时只恢复选区。无像素变化仍记录实际发生的取消选择。

稀疏 Cel copy/cut/paste 复用完整 Surface 值、world 采样及共享源身份，选区剪切使用独立 Surface 历史。只接纳同文档或匹配画布尺寸的普通 RGBA portable whole clipboard；未粘贴别名保留原内容，覆盖 canonical 时转交存活源。候选、历史与 frame ID 先准备，选区 Cel 浮动预览失败恢复原 timeline。新测试覆盖 offset/storage origin、链接、选区掩码、撤销重做与预算失败。

非浮动 whole flip 使用 owner 本地存储；选区 flip 复用旧版 clamp 与不同动画路径；rotate 捕获包括画布外的实际 owner alpha 范围，目的像素仍裁至画布。稀疏目标采用 detached Surface 历史，正常稠密路径保留。首次 nudge 直接准备目标预览，预算拒绝不先发布零位预览。

本批未开放跨尺寸 Cel 粘贴、外部稀疏 IO、deferred overlay/画布外目的地提交或 owner 仅偏移优化，不宣称所有变换完全等价。来源与适配登记于 legacy-provenance.json。本批最终正式构建、两个定向测试、既有 opened runtime 与 provenance 的实际结果在最终 evidence 中分别记录；上文 project-save Grouped duration 既有失败未扩展处理。

Final result: official single-node build4805 exit0; document-raster-history-tests and cel-selection-clipboard-tests each exit0. Existing opened --playback-floating-check PID34632 exit0. Official executable SHA256 E8C44A02FB31A5EB151FBF2144E8198F61D101920D129A67594079A33F8CBD14 unchanged across runtime. Provenance311 coverage0 / strict1 INCOMPLETE, evidence snapshots verified. Evidence native/build/sparse-cel-deselect-final-20261018.json. No screenshot/extended UI acceptance; prior unrelated project-save duration failure remains outside this batch. Stopped after scoped checks.

## 2026-10-19：跨尺寸 Cel、deferred overlay 与内部快照编码

普通 RGBA portable whole Cel 跨尺寸粘贴按 legacy `animationCelForTarget` 保留完整 Surface 世界坐标、尺寸与字节，不缩放/居中/裁剪；共享源重映射、canonical 存活者转交及历史仍用既有暂存事务。跨文档追加帧按实际 legacy cross-document 分支，不让未粘贴 auto-link 图层继承前帧；同文档保留原继承路径。selection-only 跨尺寸浮动仍沿原路径，未接入 selection-Cel deferred/画布外目的地提交。

大于 256×256 面积阈值的普通 clipboard 源，以及满足 legacy 普通可见合成准入、关闭相对亮度的单目标大画布内容移动，采用独立 overlay revision 与区域替换像素。预览期间不写 owner 像素/文档内容 revision/history/dirty；提交整数内容平移保留画布外目的地，完整 owner 移动仅改 offset 并保留像素 allocation/storage origin。其他变换提交复用既有 sampler 与 sparse history。renderer、onion 分支、选区反色采样、取消、取消选择撤销后的 dormant clipboard 及副本峰值预算一并接入。该范围不代表未建模的 indexed/text/tile/freeTile 或任意效果层能力已迁移。

内部 `DocumentSnapshot::finish` 直接验证已捕获的 Timeline links 与 Surface storage，保留局部尺寸、世界 offset、storage origin、hidden RGB 与共享源；不再误用外部编辑接纳门阻止可信快照。定向测试通过生产 snapshot -> 编码及 RecoverySession worker -> 恢复副本的 manifest 验证。外部 `fromImported` / `prepareEditableImport` 仍关闭稀疏接纳，恢复重开仍未完成，不能把编码成功称为完整 IO 闭合。

正式 `saveDocumentAtomic` 在写临时文件前用相同重开接纳门校验，无法重开的稀疏工程会拒绝保存；工程副本回归核对已有文件不被覆盖。`Editor::saveTick` worker 错误经 `showSaveError` 显示“无法保存工程”，只有成功才 `acceptSaved`、改路径与清理恢复记录。内部稀疏恢复字节可保全，但本版本仍不能恢复编辑打开，尚非可交付的恢复重开能力。

剩余直接 canvas 索引 consumer（下一批须依据对应 legacy 迁移后才能开放外部 gate）：`Document::centerActiveContent`；`Editor::shrinkSelectionToContent`、`paintBrushPreview` 的基础像素区域读取；`Editor::onProcessMessage` magic wand 的 active-owner source；两处 selection pattern brush 创建入口。`openColorAdjustment` 的曲线 histogram 仍直接读 owner storage，需要明确与 canvas histogram 语义；`displayPixels` / `pixels` API 的 canvas/storage 约定不能整体偷换。project preview 的 direct 分支已有 fullCanvas 条件，不属剩余越界入口。

本批构建/测试/运行/provenance 结果在最终 evidence 单独登记；原 project-save Grouped duration 断言失败仍不扩展处理。没有扩展全性能审计或完整视觉验收。

Final scoped evidence (2026-10-19): official serial initial/final build exit0; document-raster-history-tests, cel-selection-clipboard-tests, document-snapshot-tests, project-save-tests --sparse-format-check, editor-recovery-tests all exit0. The new Cel undo fixture's clean-state expectation was corrected only after isolated assertions proved owner/link/content/selection restoration and actual legacy workspace-commands-history.ts525/541–542 plus workspace-session.ts596–598 established undo calls touch(session,true). Final formal --playback-floating-check PID31128 exit0, including new 320² actual renderer deferred-versus-committed pixel comparison. SHA256 before/after runtime D0BE71D9F0EEC798BD4E743E6CE27040D165F1D8948AE67E27DCD77F5C432083. Provenance311 normal0 / strict1 INCOMPLETE, snapshots verified. Evidence native/build/sparse-deferred-final-20261019.json. No broad visual acceptance; external sparse recovery reopen remains gated and incomplete. Stopped at scoped result.


## 2026-10-19：普通 RGBA 稀疏外部 IO 闭合

本节更新上一批的保守限制记录：完成剩余 canvas/storage consumer 适配后，`prepareEditableImport` 与 `Document::fromImported` 接纳普通 RGBA 局部尺寸和 world offset，保留原始隐藏 RGB、画布外内容及 canonical links。canvas 上限仍为 1024，原有图层种类、颜色模式及不一致 fallback 拒绝条件保留。正式保存的重开预检因此可接纳同范围的稀疏工程；损坏 Surface 仍在写临时文件之前失败，已有文件保持可用。

`pixels()` 继续表示 owner 本地存储；新增 `canvasPixels()` 显式提供 canvas 快照供 wand 使用。画笔预览和选区笔刷使用 world 采样，收缩选区扫描选择与 owner 的交集并保留不规则 mask，center 对 sparse owner 保留外部目的地、历史和链接身份；完整 owner 仅平移 offset。曲线 histogram 按实际 legacy AdjustmentDialog.tsx 343–357 继续读取完整 owner storage，不裁成 canvas histogram。

schema21 没有私有 storageOrigin 序列化字段。native 完整解码原始存储时 runtime storage origin 为 0，world offset 和每一个原始字节保持；直接 fromImported 内存 API 保留调用者提供的 runtime origins。重开不恢复历史。恢复 fixture 经实际 prepare/fromImported 重开、恢复编辑、alias owner stroke、undo/redo、原子再次保存与重开，核对隐藏 RGB、外部内容、canonical link、脏状态及历史坐标。

selection-Cel 浮动不是待补 deferred 缺口：实际 legacy workspace-paste-cel-selection.ts 即使单 Cel 也走 layers[]，workspace-commands-selection-floating.ts 对 layers 禁用 deferred，并按 frameId 分支裁目的地。上一节“未接入 selection-Cel deferred/画布外目的地”作为历史边界保留，但不得解释成 legacy 同等功能缺失。

构建、定向测试及真实 Editor open/async-save/restoreRecovery 结果见本批最终 evidence。provenance 覆盖与运行验收分别记录；strict 继续以 INCOMPLETE 失败，不宣称所有 legacy 功能已等价迁移。


Final sparse external IO evidence (2026-10-19): initial/final official serial builds exit0. document-raster-history-tests, cel-selection-clipboard-tests, document-snapshot-tests, project-save-tests --sparse-format-check, project-import-tests --sparse-import-check, editor-recovery-tests (fresh build/recovery-io-final-20261019-owned), and full moon-core-tests each exit0. Actual official --sparse-project-io-check PID23188 exit0: real open -> background snapshot/worker save -> actual restoreRecovery, with exact offset/raw hidden RGB/canonical link/history/dirty/path assertions and renderer content-cache calls. Official executable SHA256 before/after E09358AA92454E93ECB1DC446140DF7221F45C8B2FDAD0943A1238A3B46733B7. Provenance311 normal0 / strict1 INCOMPLETE. Evidence native/build/sparse-io-final-20261019.json. Scoped checks are complete; no extended visual acceptance or new broad migration claim.


## 2026-10-19：frame / loop 变换补间可用子流程

在普通 RGBA 稀疏外部 IO 闭合后，将已有 animation_transform 纯算法接入 Document 差量事务及原生统一补间参数弹窗。逐帧和循环源沿实际 legacy animation-tween.ts：过滤 disabled 后按 reverse 排列并循环源姿态，所有参与图层共享 pivot，alpha 范围裁图后最近邻变换，保留范围内 hidden RGB，opacity 使用 resolved Cel 值或 layer fallback；未参与与锁定图层完整独立克隆。原始帧不覆盖，Frame 扩原 loop 尾点、Loop 保原 loop 范围，并创建只涵盖生成帧的新 loop。

参数表单复用现有 PixelEntry / PixelDialog 和 legacy 图标，无上下箭头；提供 frame/loop/相邻帧选择、loop 源、图层范围、数量/时长、位移/旋转/缩放/opacity、缓动曲线数值、autoCrop、弹窗预览播放与 seek。预览仅暂存，缓存源计划与所有步的固定 bounds，不写 Document。取消不生成；确认是一笔历史，autoCrop 将原 canvas 与所有原始/生成 alpha 范围求并集，现有 owner 只改 offset；尺寸、原始选择与 pivot 一起 undo/redo。null Cel opacity 的 layer fallback 投影按历史元数据恢复。

原生适配：value-owned Timeline/Surface 候选及差量历史在发布前预检，保留 legacy 128MiB 输出上限，同时按存量/输出副本与裁图暂存施加 256MiB 峰值上限；预览 64MiB；整数世界 bounds 和 1024 原生 canvas 上限拒绝时不发布候选。保存重开按既定 schema21 保留 world offset/raw bytes/links，不写私有 storageOrigin 字段。

本批是可用子流程，不能称 frame/loop 全等价迁移：legacy 主画布终点 overlay/拖动尚未迁移（现模态阻断主 canvas，不能借 Document floating 更改 dirty/history 近似替代），弹窗已明确提示；path tween、独立曲线 draft 弹窗也未迁移。相邻帧原有 morph/crossfade 行为保留，其 autoCrop 选项明确禁用并说明未接入，不在本批扩展。

实际构建、定向测试、正式 opened 参数/预览播放/取消/生成/undo-redo/异步保存重开及 provenance 结果在最终 evidence 单独记录；此前完整 project-save Grouped duration 既有失败仍不扩展。


Final frame/loop scoped evidence (2026-10-19): official compilation completed, initial link was blocked by running PID6128; normal close preserved the official product path, relink exit0. Final fixture-only build exit0. animation-transform-tests (including both-scope actual atomic save/manifest/prepare/fromImported reopens), animation-crossfade-tests, animation-morph-tests and document-raster-history-tests each exit0. Opened official --quantization-morph-check PID37748 exit0, covering existing morph and new frame/loop dialog parameters, playback/pause/seek/restart, instantaneous preview immutability, cancel, single-history generation/undo-redo, autoCrop selection/pivot, asynchronous save and actual restoreRecovery reopens. The first runtime fixture had not initialized Editor pivot identity/mask/serial; corrected setup retains every state assertion. Final SHA256 before/after runtime 4005C596DB16C2085C72985FACBCBAE0B847AA003A3A6B147BDEB8DE5938A47C. Provenance312 normal0 / strict1 INCOMPLETE. Evidence native/build/frame-transform-final-20261019.json. The missing endpoint canvas overlay/drag and other boundaries above remain explicit; stopped after scoped acceptance.


## 2026-10-19 本批补间缺口交付

独立缓动曲线窗已接入：局部草稿、legacy预设控制点、数值表达式/滚轮、真实手柄拖动与取消、重置、应用/取消/Escape及焦点返回。父参数只在应用后改变，打开子窗暂停播放并结束终点捕获。

当前帧/循环节终点以Editor临时Surface显示（0.4透明度），不进入Document。保留形状缓存与独立位移/预览进度；选择移动工具可在弹窗外拖动，未命中仍消费捕获，失焦/关闭清理，鼠标释放采用最终位移，生成时一次写入历史。相邻形变与交叉淡化已支持稀疏候选和自动裁切：原画布与内容并集、canonical owner偏移、选区/轴心、图层透明度投影均随同一次结构历史恢复；保持未处理图层原始像素、hidden RGB和链接。此前记载的这三项“未迁移/禁用”状态至此被本条替代，路径补间仍未迁移。

正式构建与四个相关测试通过；新增crossfade fixture首次失败源于把schema21未保存的optional runtime origin错误比较为整数0，仅修正fixture为空断言后通过，像素/偏移/链接和合成断言保留。正式exe SHA256 `A81998E96669FF127A6357D17DAD2318E320773F3F9FF0D0206DA586A69E8975` 的实际 `--quantization-morph-check` PID28844 exit0，覆盖曲线子窗、endpoint绘制透明度/捕获/取消/缓存/生成历史与两种between自动裁切。纯事务fixture另覆盖schema21保存重开；既有frame/loop实际异步保存重开继续通过。旧error文本mtime16:23未更新，未删除用户数据。

文档检查单独记录：provenance coverage314通过；strict exit1，整体仍INCOMPLETE。本批开始无普通运行实例，验证结束未新开应用。证据：`build/tween-closure-final-20261019.json`，构建和focused测试日志同前缀。


## 2026-10-19 路径补间交付

普通RGBA当前帧/循环节的绘制路径已接入原有transform管线：按弧长在折线取样，先应用缓动，仅位移取Math.round，旋转/缩放/透明度沿原语义，不沿切线自动朝向。复用既有图层选择、循环pose、稀疏原始像素/hidden RGB、链接解析、预算、自动裁切、选区/轴心与单结构历史；预览包括所有折点和anchor，anchor仅定位可视路径，不改变生成位移。

独立路径窗承接旧版像素绘制、Shift直线/Ctrl约束、私有撤销重做/清空、锚点、平移/缩放/适应及命名路径库。取消/Escape不改父草稿或Document，应用才返回父参数；直线/绘制切换在本次弹窗记忆路径。绘制模式关闭线性位移输入和终点拖动，终点仍按路径末点显示；子窗期间清理终点显示并隔离父捕获，关闭后重新发布。图标复用legacy素材，新增minus为PixelUtilityIcon.tsx原路径无损转换。

持久化依据已单独核对：legacy当前路径/anchor只存在对话框useState/useRef，不进工程；仅命名预设通过localStorage键 `moonsprite.animation-tween.paths.v1` 保存version1库。原生承接现GradientMapPresetStore的设置目录原子JSON模式，文件 `animation-tween-paths.v1.json` 保持 `{version:1,paths:[{id,name,path}]}`，不保存anchor。严格拒绝损坏/未来格式并保留原文件，读最新库再合并，同名/满库/非法点与写失败均拒绝，不引入新的project字段。

构建前正常关闭原PID38788，未强制终止。首次编译修复新Windows JSON头的min/max、small宏泄漏，以及Widget误用Window专属setWantFocus；最终正式构建exit0。四相关测试均通过，包含core弧长/重复点/小数/约束、路径事务和失败原子性、预设读写拒绝、frame/loop生成磁盘重开。正式exe SHA256 `F905A35474E4C9BE11548FD326F0992444536477990F74AB00BFAEDE5330FD24` 实际 `--quantization-morph-check` PID36956 exit0：真实路径子窗手势/局部history/预设文件save-load、父draft取消/应用/模式切换、单历史生成undo/redo及实际异步保存/恢复重开通过；既有补间回归继续通过。旧error文件mtime16:23未更新，未删除。

文档覆盖单独报告：provenance317通过，strict exit1，整体legacy迁移仍INCOMPLETE。此前“路径补间仍未迁移”状态被本条替代，范围不扩大到特殊图层/颜色模式。最终证据 `build/path-tween-final-20261019.json`；按唯一启动入口恢复普通窗口一次。


## 2026-10-19 Canvas Resize 与 Ctrl+B 临时捕获闭合

本批承接此前稀疏 IO 阻塞的普通 RGBA CanvasResize。来源为 legacy CanvasResizeDialog.tsx、canvas-input-bounds.ts、canvas-render-guides.ts、core/document-model.ts、animation.ts、canvas-resize-resources.ts 与 workspace-commands-document-io.ts。真实菜单和 C 入口已接原生 PixelDialog：初始 center、锁比例、不同步四边、trimOutside=true；公开 Document API 默认 trimOutside=false。九点锚点、宽高、四边、同步、表达式、局部撤销重做、实时蓝线/checker/遮罩、外部边缘与内部移动手势、取消/确认保留旧语义。复用原始 PixelUtilityIcon 九点素材，无重绘。预览按 legacy 保持已提交合成不变，新扩区域只显示棋盘。

Document::resizeCanvas 复用既有 ownerOffsets/surfaceChanges/dimensions 历史管线，canonical owner 每个只处理一次，retain 不复制像素，trim 才裁局部 storage 并累加 storageOrigin；未裁 hiddenRGB、links/shared、帧/loop IDs、disabled 和图层元数据保留。selection/pivot 与尺寸同一次 undo/redo。cropCanvasRegion 改为真实 resize(trim=true) 薄包装，承接 sparse crop，满画布裁切仍记历史；trim 满画布 noop 保留。沿用 1..1024 和 256MiB admission，不扩特殊层/色彩模式。先提交 floating 是独立动作，其后 resize 失败不回滚已提交 floating，不能宣称整个调用全回滚。

Ctrl+B 无 selection 现在沿 legacy begin/finishTemporaryBrushCapture 和 canvas-input-selection 的 marquee 结束分支捕获内存笔刷，复用实际矩形选择手势，无新增捕获算法，不保存本地库，不写 selection/document history。成功返回 pencil，Esc 恢复既有 pencil profile/selection options；空白和超限失败保留草稿与文档；切工具取消恢复选项。会话切换保留所属项目临时状态。已有 selection 的菜单保存库行为保留。

验证：canvas-resize-tests 与 document-raster-history-tests exit0；前者包含 retain/trim 的真实磁盘保存重开、hiddenRGB、canonical/shared、边界/预算、稀疏 crop、selection/pivot 和撤销重做。正式单序列 Release build exit0；实际 opened --canvas-resize-check PID41524 exit0，覆盖 Ctrl+B 真实键鼠捕获与失败/Esc/切工具、CanvasResize 实际弹窗字段/默认/9anchors/local undo/Cancel/Apply 和文档 undo/redo。查看 canvas-resize-smoke.bmp 默认弹窗未见重叠；本次未新增外部边缘拖动全部物理场景验收。provenance320覆盖通过，strict仍exit1/INCOMPLETE。最终 EXE SHA256 D43CFE3E37648A49B7A4F3021778763D2FED2EF84843B2346B08FCD6BDE2AAD8。完整日志与失败修复记录见 build/canvas-resize-final-20261019.json。本批未关闭普通运行程序，不额外启动新实例。


## 2026-10-19 六种普通 RGBA 滤镜闭合

承接 legacy filter-presets.ts、workspace-commands-layer-adjustment.ts、workspace-filter-preview.ts 和 FilterDialog.tsx 的六项：三种 CRT、VHS 色彩偏移、暗角、荧光绿辉光。真实 filter: 菜单接共用 PixelDialog，默认实时预览、40ms 防抖、每项独立 opacity、说明与取消/应用。六纹理像素、名称、blend、默认 opacity 沿用旧版；全部帧新增同一普通顶层覆盖，原图层锁/像素选区不约束新覆盖。可见覆盖按旧 connectAnimationCels 链接首帧；透明 tiny 覆盖各帧独立完整空 surface，不强连。无 LCD、indexed 或特殊层扩项。

原生必要适配：displayTimeline 独立预览，单可取消 worker 串行处理最新参数，identity/revision/contentRevision/generation 共同校验；取消/关闭丢弃预览，确认才复用 detachedLayer/detachedCels 单 delta 历史。原始稀疏负偏移、hiddenRGB、storageOrigin、冗余 alias、帧/loop 元数据、选区/当前帧保留。快照/恢复拒绝 active 预览，取消后采 committed timeline。保持既有 1..1024/256 layer/256MiB admission，未增加 project 字段。许可复核 legacy/LICENSE Source-Available1.0 §2b/c，仅本地修改构建测试。

自动检查：filter-presets-tests、document-raster-history-tests、editor-recovery-tests exit0；包含六纹理独立像素预期、切换/取消/失效任务、单历史 undo/redo、锁定源/选区保留、真实工程保存重开、透明空覆盖重开及真实 RecoverySession 预览跳过/取消后保存。边界203 sources通过；provenance323覆盖通过，strict exit1，整体迁移仍INCOMPLETE。

正式 Release build exit0，实际 opened --filter-presets-check PID39184 exit0。查看 build/Release/filter-presets-smoke.bmp，默认两列选项、说明、opacity、live/取消/应用未见重叠，画布显示预览而提交时间轴仍原层；取消/确认/undo/redo实际运行通过。未验收所有尺寸/DPI组合。首次 PID40116 exit1 抓到 menu漏 filter: 前缀，已修复后重建通过；原错误文件保留，其mtime早于最终通过。本批未关闭普通程序、不额外启动普通实例。最终 SHA256 F28D620F7DADF5B2BB4418533D1B0C5C07B50014312B1FC0A89AC42A511ACB7F；证据 build/filter-presets-final-20261019.json。


## 2026-10-19 LCD 依赖的普通图层组内部基础（未开放 LCD/组编辑）

核对真实 legacy LCD 后确认它会隐藏单个源层，建立真实组及 Scanlines/Blue/Green/Red 四个子层并选择组；不能用四个平铺层声称迁移完成。该入口实际来自共享 FilterDialog 的 lcd 选择，历史 LcdScreenDialog 不是当前唯一入口。本批调整为内部组基础阶段：LCD 入口继续禁用，完整普通组编辑同样未开放。无新用户界面、无图标重画。

内部 State 追加 Group 与 Layer.groupId，保留 parent/name/visible/locked/opacity/blend/panelOrder/displayColor/description；校验空/重复/层组冲突ID、坏引用、自父/循环和非有限/非法元数据。祖先visible/locked提供纯helper，尚未宣称所有编辑写入路径已支持组锁。合成依据 legacy document-composite-plan/sampling：normal1组传递真实backdrop，其他opacity/blend先隔离整组后仅应用一次，cel Z只在真兄弟内排序；既有稀疏/link/预览/onion叶渲染复用。原生128行tile限制临时隔离buffer；新增tile边界回归属于技术适配，不替代全legacy等价验收。五个单层直出fastpath对非空groups绕回正确合成。

纯 layer_panel_tree 模型承接 legacy 嵌套/空组/持久anchor/折叠及显式layer/group多选/范围选择；State适配反转native top-first输入，group.panelOrder保留legacy坐标。未接Editor面板和创建/删除/移动/属性/history操作，mask rows仍缺，不称为可用组UI。

编解码能够读取并保留普通组DTO，以及验证内部普通工程/恢复编码真实落盘读回；RasterSnapshot保留并比对groups/groupId。外部 prepareEditableImport 对组仍显式拒绝；正式save沿同一preflight门控原子拒绝，测试确认不覆盖旧目标、不改变dirty/history/revision。内部编码验证不等于组工程可编辑，未向RecoverySession加入无可达状态的用户提示/静默删数据。effects/masks/adjustment/cumulativeBlend保持Unsupported，不被静默接受。

验证：layer-panel-tree-tests、layer-group-compositor-tests、layer-group-io-tests及无组layer-compositor/raster-snapshot/document-snapshot/filter-presets四回归均实际exit0；来源覆盖328文件通过，strict exit1仍INCOMPLETE；依赖边界205 sources通过。正式单序列Release build exit0，既有 --filter-presets-check 实际opened PID38384 exit0，并断言lcdScreen仍未绑定。没有新增组/LCD视觉验收或可用性声明。首次两项fixture错误已定点修正：tree花括号重载歧义显式vector；IO构造遵守fromImported非空archive契约，未放宽生产入口。

legacy/LICENSE Source-Available1.0 §2b/c 许可复核仅本地修改构建测试。本批未关闭普通程序、不另开普通实例。最终程序SHA256 9E7E56E75F154024E7C0D66966AC4039575F60251A44B480A6692F90E18B7656，完整证据 build/group-foundation-final-20261019.json。后续须补完整组编辑/历史/面板及LCD事务再开放入口，本条不能视为LCD迁移完成。

## 2026-10-19 普通组内部编辑基础（外部入口仍关闭）

本批补齐 Document 内部组选中、惰性子层解析、折叠状态、创建/取消组、显式组可见/锁定状态及其撤销重做。组选中独立于显式层选择；纯组行不伪装成后代层多选。metadata history 不保存完整像素副本，原 Cel/链接/共享像素存储保持原位；无组 selectTimelineLayer 原范围选择路径保留。空组 peer 插入沿 legacy tree traversal 与 sibling panelOrder 分配。

画笔、填充工具、形状和渐变入口/预览复核及部分既有像素命令接入祖先 visible/locked；任何组选中时光栅工具拒绝误用兼容活动层。动画目标采用继承锁定，临时预览 State 保留 groups；异步抗锯齿上下文比对补齐 group/groupId。此处只说明本批保护，不代表所有普通层命令和组命令已支持组。

组面板、virtual group cel/拖动、普通层复制/删除/移动/属性与其他命令的完整组目标语义仍未闭合。本批不接新 UI/菜单，不移除外部 prepareEditableImport、正式保存 preflight 的组门禁，不声明组工程可编辑。恢复仅继续验证内部编码/快照；未改 RecoverySession 或删除用户数据。LCD 保持禁用，effects/masks/adjustment/cumulativeBlend 继续 Unsupported。

最少相关运行：document-layer-groups-tests、layer-group-io-tests、animation-crossfade-tests、animation-transform-tests 均实际 exit0。组事务测试覆盖嵌套/空 peer、选择与折叠 history、锁定取消组拒绝以及像素指针/owner ID 不变；IO 测试补充祖先隐藏/锁定拒绝绘画/填充/渐变/形状，允许后可撤销，动画继承锁与组预览，并继续确认正式保存门禁原子拒绝。来源覆盖330文件通过；strict exit1仍 INCOMPLETE；依赖边界206 sources通过。正式构建/运行结果见本批最终 evidence，不以文档检查代替运行。

正式单序列 Release build exit0；唯一正式程序实际 opened --filter-presets-check PID20240 exit0，既有 smoke 断言 LCD 未绑定。本批没有关闭或重启普通程序。最终 SHA256 469B10A8B792FE8AEB2A1D0CAAC815E37370F0E7A74B3890528339377B0946D6；完整记录 native/build/group-internal-edit-final-20261019.json。未进行组 UI 或外部组工程可编辑验收。

## 2026-10-19 普通组结构与行身份内部补充（入口仍关闭）

内部 Document 补齐组选中子树删除、每帧独立副本、混合组/层树移动、新建层的组上下文，以及可见/锁定拖扫的一次历史。结构事务先构建并校验轻量 Cel header/组拓扑/链接候选，再转移原 Surface 所有权；原件不深拷贝像素，删除的原 owner/link/runtime ID 随历史保存，撤销恢复同一存储。副本按 legacy animation.ts 的 cloneAnimationCelsForLayer 每帧独立复制 resolved pose，采用 source slot opacity、z0、断开 link/runtime，无源时为 1×1 透明 Surface。拖动与上下箭头并非相同语义，未把原箭头 API 改成树重新归组。

flip/rotate/fill/delete/抗锯齿及变换入口的多目标读取接惰性后代解析；centerActiveContent 按 legacy 保留 activePaintLayer 语义，调整命令不擅自套用统一组选中策略。修正多目标填充对稀疏 Surface 错用画布 stride 的越界问题：沿现 raster expansion/world addressing，在选择扩展时复用 legacy64 padding，预算内暂存后一次提交。测试覆盖偏移、出画布存储、组选中只改后代、undo/redo和祖先锁拒绝。无组显式选择及原事务/时间轴块移动回归通过。

新增 editor_timeline_rows.h 仅是纯模型：显示行 ID/kind、折叠、virtual group slot 与真 Cel 分离、mixed nearest-real anchor/目标及虚拟装饰平移。Editor 仍未接该模型；TROW-02~13 交互提案未落源、未编译、未验收，不属于已迁移 UI。重要修正及下一批路线保存在 build/group-ui-deferred-handoff-20261019.md。未引入 folder 新图标使用，未生成/替换任何图标。

六项实际运行 exit0：document-layer-groups-tests、document-layer-group-structure-tests、layer-group-io-tests、layer-panel-tree-tests、moon-core-tests、timeline-interaction-tests。结构回归验证原 owner 像素指针/链接不变、副本帧独立与真实稀疏坐标、删除/折叠恢复、锁拒绝、混合移动、非法后代目标原子拒绝、新建层上下文和祖先状态拖扫。来源覆盖332文件通过；strict exit1保持INCOMPLETE；依赖边界207 sources通过。没有扩大为全矩阵或无意义镜像测试。

外部组工程可编辑导入、正式保存 preflight 与用户创建/组 UI 入口全部保留门禁，LCD仍禁用。merge在组内父关系和祖先opacity隔离语义、group layer clipboard、group properties、完整Editor视觉行/virtual slot交互和真实opened验收仍未闭合；不能把只读行模型或内部结构接口称为可用普通组。复杂effects/masks/clipping/cumulative继续Unsupported，未新增近似支持。恢复仅延续内部编码测试，未解除真实group工程恢复门禁或删除数据。

本批收尾仅核验既有正式产物，未重跑六项测试、未重建或修改实现。原 integrator 的 build session92521 在接手工具域返回 Unknown process id，构建退出码暂记 null，不以产物存在推断 exit0。正式 EXE 更新时间 UTC2026-10-19T13:22:27.2816370Z，SHA256 980245E1DC805708571111C983CD3D98C0F35C4DE33797153F5EDEC2B8882CC1。按 start-native.bat 同一 theme/cursors 参数仅运行一次真实窗口 --filter-presets-check，PID3088 exit0；新截图 UTC13:56:02，历史错误文件 UTC11:01 未改变。该运行仅回归既有六滤镜并断言 LCD 未绑定，不是组 UI 验收；未新增图像审查结论。六项 exit0 来自原 integrator 的实际运行报告，未冒用10月18日旧 LastTest.log。来源覆盖332/exit0、strict exit1/INCOMPLETE 和207 sources/exit0来自本批已有检查，不重跑。完整证据见 build/group-structure-final-20261019.json；组 UI/外部组可编辑 IO/LCD 门禁继续保留。本次未启动普通应用窗口、提交或删除用户数据。
