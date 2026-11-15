# 索引色选区与普通剪贴板迁移

2026-11-15。本阶段迁移普通索引色栅格的选区内容、浮动变换和 RGBA 像素剪贴板。生产索引色新建、转换和可编辑导入继续关闭；整项迁移仍为 INCOMPLETE。

## 旧版依据与必要适配

直接依据 legacy 的 tools-selection-transform-source.ts、tools-selection-transform-raster.ts、tools-selection-transform-rotsprite.ts、tools-selection-transform-translation.ts、tools-selection-transform-apply.ts、tools-pixel-edit.ts、document-model.ts 和 history.ts，以及 workspace-floating-clipboard.ts 与 document-composite-region.ts。许可沿用 legacy/LICENSE 的 MoonSprite Source-Available License 1.0，不将其称为开源许可。

内部选区保留原始 uint32 色板 ID，普通和浮动外部剪贴板解析为 RGBA，粘贴时映射当前可见色板。合并复制传入现有 RasterColorContext；稀疏直接复制先确认存储存在，避免将存储外透明像素误读成非透明 ID0。内容边界、开始整层变换和删除边界使用现有色板可见性规则。

旧版的透明度规则并不统一：generic sampler 使用重复 ID 首项，RotSprite 使用当前非零可见 ID 并集，普通平移保留 capture 时的并集缓存；repeat 仅在 capture 确实捕获非透明像素时优先使用缓存，deferred 普通平移提交使用当前并集。原生为现有 SelectionClipboard 增加这些元数据，色板变化时刷新当前采样规则，并在并集改变时使 RotSprite 缓存失效。保留现有 sampler 和延迟分支，不复制整个浮动源来刷新元数据。普通 inverse sampler 保留选中的透明 cell，写入边界再过滤；浮动剪贴板 mask 不因 alpha 为零而丢弃。

复用 Document 普通、稀疏和延迟浮动事务，分别计算显示 RGBA 与提交的原始 ID；即时翻转／旋转与移动按旧版 packed 写入和混合。缺失 Cel 粘贴保留 indexed format，延迟显示不进入权威像素或历史。小历史使用 owner-local 点地址；至少 256 个变化点且包围面积不超过点数三倍时使用 raw dense patch；延迟平移另保留单区域超过四分之一密度时的 dense 契约。必要的存储扩张即使没有像素变化也保留。

## 已执行的对照

新增 Node oracle 执行实际旧版 TypeScript 模块，仅补齐 Node 类型擦除所需的 type import，不修改可执行语句。931 组事务、26 组关联图层／链接帧及 3 组缺失 Cel 检查通过。覆盖 dense、sparse、负坐标、空占位和单像素存储，四种 palette order，矩形／mask，移动／复制／粘贴／删除／剪切／翻转／旋转，缩放、37° fast 与 RotSprite、90° 和 RotSprite 0°／90°回退，repeat 和 deferred，非透明 ID0、重复 ID 首项／末项透明，以及浮动期间色板 alpha 改变。

逐项检查预览、取消、提交、Undo／Redo 的原始 ID、宽高、偏移和 storage origin，预览不产生历史／revision，外部 clipboard 的 RGBA、mask、origin，以及链接存储身份与 format。300×230 输入通过生产门槛进入延迟路径；紧凑输入另由测试夹具进入同一分支，不能据此声称所有大画布组合已经验收。40×32 大选区覆盖 dense 历史。关联、缺失 Cel 和大选区样本另调用普通保存、恢复和本地历史三种生产编码器，读取 manifest 并解码栅格核对原始 ID 与几何；可编辑 indexed 导入仍明确拒绝，不宣称完成可编辑重开。重复 ID 色板按生产编码契约拒绝，测试没有放宽校验。

旧版实际 selection-transform-commit.test.ts、selection-translation-raster.test.ts 和 workspace-floating-clipboard.test.ts 三个文件共 61 项通过（15.59 秒）。初轮严格历史断言漏算空翻转的 selection-only 历史，已按旧版契约补齐；oracle 的 RotSprite 0°改走真实平移路径。测试夹具显式设置 palette.nextId=100。一次回归发现原生历史 before 读取误用了 offsetX 作为 y，已改回 offsetY，保留逐像素 Undo 断言后全部对照通过；临时诊断输出已移除。

## 验收边界

唯一正式 Release 构建成功，于 17:30:32 更新（30,694,912 bytes）。最初批次最后一个 clipboard-document 测试目标链接失败：PixelClipboard 的现有尺寸读取路径引用 readSystemSize，而该测试漏连 moon-system-clipboard。补齐测试目标依赖后构建通过，未改变生产剪贴板行为。最终 13 项定向 CTest 全部通过（7.39 秒）：indexed-selection-oracle、indexed-selection、document-raster-history、attached-masks、cel-selection-clipboard、clipboard-document、symmetry-content、symmetry-scale、symmetry-rotation、symmetry-alpha、selection-pattern-brush、selection-boundary 和正式程序的 selection-interactions。

来源覆盖 962 文件及旧版证据快照通过，Editor 边界 593 源文件、架构边界 593 源文件／256 targets 通过。来源覆盖不代表行为等价，strict 因剩余缺口退出 1。构建及回归日志保留在 native/build/，不提交生成物。

Cel／frame 剪贴板、centerActiveContent 的剩余索引色路径、完整索引色对称组合与生产准入继续迁移。共用对称 helper 的透明度读取已接入，但本阶段 oracle 没有完整 indexed symmetry 矩阵。不新增 UI、性能优化、人工图像或完整桌面交互验收。保留用户数据、构建缓存、夹具与日志；生成物不提交。
