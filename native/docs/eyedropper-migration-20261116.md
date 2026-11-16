# 吸管取样与放大镜数据迁移（2026-11-16）

直接依据实际 legacy eyedropper-source、document-model、document-composite-normal-sampling、document-composite-region、document-composite-style-render、canvas-input-sampling、canvas-sampling-start、useCanvasEyedropperMagnifier、useCanvasRenderEngine 和 workspace-commands-layer-adjustment。内部复用按 legacy/LICENSE 核对。本阶段仅功能迁移。

## 行为与必要适配

当前层取样承接 raw RGBA／indexed 颜色，不应用隐藏、锁定、不透明度、混合、样式和蒙版。索引色按第一个同 ID 资源取色；合成器 Map 按最后一个同 ID 资源取色。隐藏 RGB 保留、未知色号透明；存储外透明，与 ID0 是否不透明无关。点取样先检查画布范围，越界透明。沿用既有世界坐标／storage origin 与 Cel 链接解析。

合成点取样承接 cursorCompositePointSamplerFor 的背景规则：活动层不是背景时排除背景，活动背景时包含背景。放大镜仍使用完整 compositeRegion，不能把点取样排除规则套到区域。必要适配复用既有合成器和采样边界输入，通过元数据跳过背景，不复制文档像素。普通单层区域保留旧版 raw 快路径，包含透明 RGB 与存储在画布外的像素；效果区域仅以画布内像素计算样式，画布外读取原始像素，不把描边／阴影延伸到画布外，也不一律清空画布外存储。

活动层／组蒙版优先于两种来源选择，显示白底标量灰度；蒙版存储外区域为白色，但点取样画布外仍透明。放大镜绘制使用区域实际结果，取消旧的额外画布裁切。沿用 Document 的蒙版预览，未另建蒙版转换。

旧版颜色调整预览直接修改显示文档；原生使用现有 displayTimeline／displayPalette，保持吸取所见结果。镜头来源缓存补充活动蒙版 ID 与 preview revision，其余 document／frame／layer／source／起点键和延迟绘制合并沿用。输入目标、Alt 暂时取样、前景／背景、透明颜色、退出释放与原有图标均复用。

## 对照范围与验收

新增 oracle 直接加载实际 TypeScript 实现；加载适配仅去除原 bundler 擦除的接口导入。840 组案例覆盖 RGBA／indexed／混合格式、七种色板（含重复 ID、隐藏资源、未知色号、不透明 ID0、空色板）、四种完整／稀疏／负偏移／单像素存储、十种外观（隐藏锁定、不透明度／混合、描边、阴影、附加蒙版、普通多层、组、背景排除与活动背景）。每组检查两种点取样和两种区域；84 组另执行真实颜色调整预览，120 组原生链接帧变体，6 组活动层／组蒙版。验证像素、几何、storage origin、格式、身份、色板、历史、revision 和 dirty 不因取样改变。

初轮夹具遗漏 Cel opacity，与图层投影不符，已修正。真实边缘对照发现原生 RGBA 样式未按画布裁切；一律清空画布外区域又会丢失 raw 存储，最终改为 opt-in 样式读取边界并保留原始区域。

840 组实际旧版案例、84 组颜色调整预览、120 组原生链接帧变体和 6 组层／组蒙版全部通过。旧版吸管来源和按下取样两文件 23 项测试通过（6.25 秒）。最终 6 项定向 CTest 通过（1.86 秒）：eyedropper、eyedropper-legacy-oracle、eyedropper-legacy、layer-compositor、layer-group-compositor、attached-masks。正式 Release 与受影响测试目标构建退出 0；唯一正式 exe 于 2026-11-16 08:20:41 更新，30,767,104 bytes。新正式程序 --sampling-zoom-check 退出 0，包含两种来源的实际蒙版取样、镜头稳定缓存、进入／退出蒙版刷新、越界透明及内容／历史隔离。来源覆盖 998 文件与既有哈希、Editor 597 源码、架构 597 源码／272 targets 和 diff 检查通过；strict 因整体已知缺口按要求退出 1。

本阶段没有迁移整个放大镜的任意旋转／畸变组合或所有特殊图层与参考图跨画布组合，不声称完整人工桌面／图像验收。生产 indexed 新建／转换／可编辑导入继续关闭。全仓迁移仍 INCOMPLETE；生成 oracle、构建产物、日志和用户数据不提交。
