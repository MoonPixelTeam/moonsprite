# 索引色填充事务迁移

2026-11-15。保留并完成上一阶段未提交的改动；本阶段仅迁移功能。整体仍 INCOMPLETE，生产索引色新建、转换、可编辑导入及整体编辑准入继续关闭。

## 来源与实现

直接对照 legacy `tools-fill.ts::floodFill/floodFillSymmetric/fillSelectionOrCanvas`、`tools-pixel-edit.ts::paintLayerValue`、`document-model.ts`、`history.ts::commitPixelEdit`、`canvas-input-fill.ts`、`document-composite-sampling.ts::compileCompositePointSampler` 和 `linked-layers.ts::shareLinkedRasterContent`。保留现有 Document 填充事务、区域与闭合引擎、图案采样器、色板上下文、历史及共享存储，不新增另一套编辑模型。

索引色容差为零时比较原始 ID，容差大于零时按工具查色规则解析 RGBA，取四通道最大差。区域引擎使用不透明二值匹配表面，避免把 ID 的高字节当成 alpha。普通与图案绘制先解析目标颜色、应用旧版混合，再映射可见色板 ID 并执行 packed 归一化。保留相同颜色的不同 ID、隐藏／未知 ID、空可见色板及透明源的区别。

可见层参考在一次对称事务开始时固定内容／输出边界和组样式几何，边界内仍读取实时像素。连续填充沿用旧版入栈、出栈、绘制、检查邻点的顺序，使描边和阴影能观察刚写入的像素；闭合及延迟图案先求区域再写。含调整层的组沿用旧版裁剪例外，直通组继续使用已有合成路径。显示合成的默认调用不使用这份事务局部边界。

缺失 Cel 创建保留 indexed format。稀疏扩张不把非零 ID 当透明占位丢弃；选区填充先准备扩张，再记录像素历史，撤销保留扩张后的几何。点／run 回放归一化隐藏和未知 ID，dense 保留原始值。补齐 fullCanvas 带非零 storage origin 的历史地址。关联图层仍共享同一存储，并按旧版保留各自位置锚点。

## 实际旧版对照

Node 生成器实际执行 legacy TypeScript 模块，仅将构建器原本擦除的接口导入标为 type，不修改 legacy 文件或可执行算法。原生夹具通过已有 friend 安装索引文档，不开放生产准入。

- 320 组：四种色板顺序、五种源色、四档容差、连续／非连续、4／8 连通。
- 160 组：木纹、覆盖图案、彩色图案与规则图案，闭合阈值 0／2。
- 80 组：桶／选区填充，矩形／带洞选区。
- 80 组：普通／可见层参考，有／无对称。
- 200 组：裁切、负偏移、零／非零占位及缺失 Cel，桶／选区填充。
- 12 组：512×512 compact／dense 分支。
- 480 组：完整／裁切／负偏移表面，图层／组，无效果／描边／阴影／渐变，可见层参考、对称、连续／非连续、五种图案及闭合。

共 1332 组提交／Undo／Redo 与真实旧版逐像素一致。另有 172 组关联图层与链接帧检查，覆盖完整、裁切、负偏移及占位表面；每次提交及回放检查 format、共享身份、尺寸、存储原点和真实旧版独立位置结果。

对照过程中，`live-cropped-false-stroke-true-colored-2` 曾失败：原生夹具把旧版 bottom-first 参考层错误放在顶层，改为对应 top-first 顺序后原期望全部通过。新增链接检查最初要求所有关联表面位置相同；旧版 `shareLinkedRasterContent` 明确保留独立锚点，空占位扩张重设原点时可能与活动层产生位置差。改为调用真实旧版函数生成每一步位置期望，全部通过；没有据此改变生产共享语义。C++17 测试曾误用 C++20 starts_with，改用既有标准可用的前缀比较后构建通过。

## 验收与边界

旧版三个实际测试文件 `fill-compact-history.test.ts`、`fill-history-regression.test.ts`、`tools.test.ts` 的定向筛选共 36 项通过、77 项跳过，耗时 22.18 秒。

唯一正式 Release 及受影响测试目标构建退出 0，正式程序于 2026-11-15 01:52 更新（30,638,080 bytes）。16 项定向 CTest 全部通过，耗时 23.69 秒，覆盖 indexed-fill／runtime／history／brush 及其 oracle、图层及组合成、图案填充、文档事务／栅格历史／像素格式、蒙版和关联图层。来源覆盖已通过 952 文件及证据快照，Editor 边界 593 源文件、架构 593 源文件／251 targets、diff 检查通过。strict 已实际运行并因其它登记缺口退出 1；未把覆盖通过等同于全部迁移完成。

没有 UI 改动、性能优化、人工图像或完整桌面验收。随机多笔刷的完整图案参数矩阵、其它索引工具、色板重映射、模式转换、新建、可编辑导入及 sourceArchive 保存准入仍须继续迁移；本阶段不代表索引工程整体可用。不声明完整分配失败原子性。oracle、日志、构建产物及用户数据不提交。
