# 索引色渐变事务迁移

2026-11-15。本阶段仅按旧版迁移功能。整体仍 INCOMPLETE，生产索引色新建、转换、可编辑导入及整体编辑准入继续关闭。

## 来源与实现

直接复用 legacy `gradient.ts::gradientRegionSelection/applyGradient`、`gradient-color.ts`、`document-model.ts`、`history.ts` 与 `canvas-render-gradient.ts::writeSample` 的语义。预览依据 `gradientReplacementColor` 和 `resolveLayerCanvasColor`，关联资源依据 `shareLinkedRasterContent`。没有修改 legacy 可执行代码。

渐变区域在容差零时也比较解析后的颜色，与桶填充的原始 ID 匹配有别；工具读取取重复 ID 的首项，显示合成取末项。绘制选区仅裁切写入，不阻断区域连通。稀疏外部按真透明读取，不能把外部视作不透明的色板 ID 0。

提交沿用现有 Document 渐变事务、采样器、点／dense 历史及稀疏扩张。透明源返回当前 raw ID，仍经过 packed 归一化；半透明源解析底色并按旧版 blendOver 混合，再映射可见色板 ID。dense 按绘制矩形达到 512×512 的阈值录入，包含未选／未改变的原始值；点历史回放保留既有归一化。缺失 Cel 创建 indexed format，完整画布的历史地址携带 storage origin。零与非零的 1×1 占位分别处理，保留已有稀疏位置、扩张及撤销语义。

旧版预览和提交值存在可观察差异：预览将当前颜色与源混合后解析为可见色板颜色；透明源提交则保留 raw ID 并归一化。因此 GradientPreview 只为普通 indexed 栅格渐变持有额外 RGBA 显示候选，原来的 preview 继续保存提交 ID。两个候选都从固定基线重算，取消不写文档；分配前检查已有像素预算。没有开放其它索引工具或整体渲染准入。

## 实际旧版对照

Node oracle 执行真实旧版 TypeScript，仅标记原构建器会擦除的接口导入。测试夹具通过已有 friend 安装 indexed 文档，不绕过生产准入开关。

620 组真实旧版事务及每组两次预览已逐像素通过，检查区域、显示 RGBA、提交／Undo／Redo、取消、历史数量、修订号、色板不变及几何原点。覆盖四种可见色板顺序、隐藏／未知／重复 ID、透明／半透明／不透明源、容差 0／1／128／255、4／8 连通、连续／非连续、可见层参考、裁切／负偏移／零与非零占位／缺失 Cel、矩形与带洞选区、九种抖动、径向渐变、自定义及重复位置色标、512×512 dense。

另有 48 组关联图层与链接帧事务通过，检查共享存储身份、indexed format、真实旧版的独立位置和原点。首次对照在 absent-385 的预览失败，原因是原生夹具清空了全部 Cel，误删可见参考层；改为仅移除活动 Cel 后全部通过，未改变生产参考层语义。

旧版三个真实文件 `gradient.test.ts`、`gradient-preview.test.ts`、`gradient-preview-sampling.test.ts` 共 34 项通过，耗时 13.65 秒。

## 验收边界

唯一正式 Release 构建成功，正式 exe 于 2026-11-15 02:49:15 更新（30,647,296 bytes）。受影响的七项 CTest 全部通过，耗时 60.45 秒：document-transactions、document-pixel-format、indexed-gradient-oracle、indexed-gradient、document-raster-history、linked-layers、attached-masks。最初构建命令将 attached-masks-tests 误写为 attached-mask-tests，正式程序及前面目标已成功；纠正测试目标后两项构建退出 0，未重复构建正式程序。来源覆盖通过 954 文件及证据快照，Editor 边界 593 源文件、架构 593 源文件／252 targets 通过。strict 因其它已登记迁移缺口仍应退出 1。

没有 UI 修改、性能优化、人工图像或完整桌面验收。不声称完整分配失败原子性、完整预览显示合成矩阵、其它索引工具或索引工程整体编辑可用。构建产物、oracle、日志与用户数据不提交。
