# 索引色栅格编码与历史存储迁移

2026-11-14。只迁移 legacy 功能。整体 INCOMPLETE，生产索引色编辑、新建、转换与可编辑导入入口仍关闭。

## 来源与实现

直接承接 legacy project-format-raster.ts 的 encodeSparseRasterData／encodeRuntimeRasterData：64×64 分块，按完整非零 uint32 判定内容，保留透明隐藏 RGB 和原始索引 ID；稀疏大小等于或大于 raw 时选 raw。空运行时沿用无 raw 回退的稀疏头。原有原生编码提取到 project_raster_encode，增加显式小端与原生存储／预算检查，不修改 Document 或历史。

project-format-encode.ts 对应普通、恢复、本地历史三种编码入口保留 Cel 格式，使用 .idx32／.idx32.tiles，缺失活动 Cel 的空显示存储按文档模式编码；关联文件键包含格式。图层 manifest 沿用旧版无 format 字段、由文档模式推导的语义。压缩、预览策略、身份和资源规则保留。

project-format-decode.ts 的 decodePixels 按文件、编码、格式和尺寸缓存。历史存储比较保留 indexed 的 Uint32Array、RGBA 的 Uint8ClampedArray，以及 sparse payload／offset／可见边界和别名。历史成本保留 raw backing：未对齐的 stored indexed 复制文件字节；对齐 indexed 和 RGBA stored 保留整个归档；deflated 保留解压文件。比较适配器拒绝原生与 manifest 格式不一致，并事务性回滚。

project-format-manifest.ts 的工程预览在现有 direct 与合成路径传入文档自己的 RasterColorContext，索引先查色板，再编码 RGBA PNG。没有引入第二套色板或新预览实现。

## 自动验证与交付

Node registerHooks／stripTypeScriptTypes 实际执行未修改 legacy 模块。140 组逐字节编码覆盖两种格式、10 种尺寸、7 种图案，包括稀疏与 raw 等大边界、分块边缘、空内容、隐藏 RGB 和 uint32 极值；另逐组核对空 runtime 头。74 组解码／历史存储 oracle 覆盖 RGBA／灰度／indexed、raw／sparse／empty、stored／deflated、四种对齐及混合格式，逐值、类型、别名矩阵与成本一致。

原生测试通过仅测试 friend 构造 indexed 文档，12 次生产编码覆盖 raw／sparse、活动 Cel 存在／缺失与三个保存入口；验证完整 ID、真实链接、压缩／预览策略、源文档不变及准入仍拒绝。六次历史比较校验 format／typed view 及错误格式回滚。PNG 解压检查 direct 与偏移合成预览实际颜色、半透明及空背景。最终实际进程退出 0；先前测试持有 WinRT JSON 时提前 RoUninitialize 引起的退出崩溃已修正，不能以中途断言通过代替进程成功。

七项定向 CTest 已通过：indexed-raster-codec-oracle、indexed-raster-codec、project-save、project-save-raster-resources、local-history-cost、local-history-budget、document-pixel-format。首轮 local-history-cost 最末计数仍预期旧的八种像素格式拒绝，修正为逐项检查八种已开放格式和非法值回退后，原有193组完整成本／身份比较全部执行并通过；未放松期望成本。其余六项在首轮通过；成本套件最终重跑通过11.10秒。

唯一正式 native/build/Release/moonsprite-native.exe Release 构建成功。来源覆盖946文件和证据快照、Editor边界593源文件、架构593源文件／248targets及diff检查通过。strict 实际退出1，继续反映其它迁移缺口。

## 剩余范围

生产索引色工具事务、撤销回放、palette context 全链路、新建／模式转换与可编辑导入、sourceArchive 保存准入仍须迁移；本阶段编码成功不能称端到端索引色编辑已完成。保存恢复文件格式已覆盖，完整恢复服务与桌面交互未因此完成验收。没有UI修改、性能优化、人工图像或完整桌面验收。生成的oracle、构建产物及用户工程、恢复、日志、缓存不提交不清理。
