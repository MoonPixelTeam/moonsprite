# 索引色运行时栅格迁移

2026-11-14。本阶段只做功能迁移；整体仍为 INCOMPLETE，生产索引色编辑、新建及模式转换继续关闭。

## 来源与适配

直接对照 legacy `types-raster.ts`、`runtime-raster.ts`、`document-composite-region.ts`、`document-composite-sampling.ts`、`layer-styles.ts`、`outline-settings.ts`、`onion-skin.ts`、`animation-cel-content-cache.ts`、`linked-layers.ts` 和 `project-save-transfer.ts`。

在现有 Surface 末尾增加 RGBA／indexed 标记，保留 uint32 原始 ID。不可变 RasterColorContext 从现有色板、可见顺序及模式传入合成和内容扫描；Timeline 不新增色板权威。缺失 ID 透明，复合 Map 的重复 ID 使用末项；内容扫描使用不透明 ID 并集，无色板时沿用非零 fallback。内容几何扫描的无色板语义单独保留。颜色变化不改变原始 ID；预览仍为已解析 RGBA。

图层、组、剪贴、蒙版、透明度、混合、七种样式和洋葱皮复用既有合成路径；索引样式的静态色、动态色和最终结果按旧版色板映射，裁剪到内容输出和画布边界。RGBA 继续保留既有越界样式行为。索引洋葱皮使用旧版 display shell，ghost 为 RGBA，源存储保持 format。

扩张识别索引 0 占位和非零低值 ID；不同 format 不共享关联图层存储。快照复制、匹配与恢复保留 format／origin 和共享身份，蒙版继续只接收 RGBA。Document 导入在原有模式守卫之外拒绝低层 indexed Surface，避免仅完成运行时就进入尚未迁移的编辑事务。

## 验证与已修正失败

Node 通过 registerHooks／stripTypeScriptTypes 实际运行未修改的 legacy 模块，生成 53 组合成与 12 组内容扫描，原生逐像素比对。覆盖混合格式、ID 0 不透明、透明／缺失／重复 ID、偏移、链接、组／蒙版／剪贴、样式、越界描边、洋葱皮和空色板；同一 Timeline 跨色板变化验证可见性与内容选区缓存。另检查 uint32 极值、共享／复制／快照、跨格式拒绝共享、蒙版格式拒绝、RGBA 预览和生产准入守卫。几何和快照原有测试追加 format 回归。

初次 oracle 蒙版夹具的字段布局错误导致 legacy WeakMap 拒绝，改为真实 layerMasks／扁平 mask。首轮组渐变差异通过补齐最终色板映射与输出范围修复；洋葱皮画布外 ghost 差异通过 display shell 及边界修复。最终组样式回归曾失败于负坐标 RGBA：新增画布边界被误用于 RGBA；现将该适配限定索引色，保留原断言。修复后的四项 CTest 全部通过（1.10 秒），其中包含 53＋12 条旧版真实对照。

最终唯一正式 Release 与相关测试构建成功；十项定向 CTest 全部通过（2.04 秒）：document-transactions、raster-snapshot、document-snapshot、timeline-model、layer-compositor、indexed-runtime-oracle、indexed-runtime、raster-geometry、layer-group-compositor、attached-masks。来源覆盖 939 文件及证据快照、Editor 边界 590 源码、架构 590 源码／246 targets 和 diff 检查通过；strict 因已登记缺口退出 1。无 UI 改动，未新增人工图像或桌面交互验收。

## 剩余范围

索引色工程的可编辑导入、工具读写、生产合成调用、历史事务、保存／恢复及 UI 尚需迁移；本阶段低层支持不能作为开放入口依据。来源登记保持 legacy-partial、allLegacyAligned=false，strict 必须继续报告已登记缺口。保留用户工程、恢复、日志和构建缓存，不提交生成物。
