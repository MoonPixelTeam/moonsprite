# 索引色颜色调整迁移（2026-11-15）

本阶段承接普通 indexed 栅格的亮度／对比度、色相／饱和度／着色、色彩平衡、曲线和渐变映射，以及曲线直方图。依据实际 legacy adjustments.ts、workspace-history.ts 和 workspace-commands-layer-adjustment.ts，复用既有 ColorAdjustmentSampler、Timeline 预览、GradientMapTask 和 SurfaceChange 历史。许可为 legacy/LICENSE 的 MoonSprite Source-Available License 1.0。仅功能迁移，不做性能优化或布局改造。

## 像素与色板事务

索引色以原始 ID 存储。调整读取同 ID 的最后一条色板记录，按 RGBA 查找时复用第一条完全相同的颜色；不存在则按 nextColorId 新增数字名称的资源。除渐变映射以外的调整保持可见色板顺序，再按旧版 normalizeLayerPackedValue 处理隐藏 ID；新增但未成为可见条目的资源仍保留。渐变映射将结果加入可见顺序，保留源 alpha。抖动结果沿用旧版按原表面局部坐标模 8 缓存的规则，包括实际周期为 6 的模式。

每次预览从基线像素和基线色板重算。Document 持有堆上的不可变基线／结果色板对，displayPalette 提供预览色板；正式像素、色板、dirty、revision 和历史在预览时不变。禁用、恢复和取消同时恢复显示像素与色板。后台任务携带捕获的色板，对取消、预览代次、文档身份、几何、选区、owner、链接关系和色板基线作检查，完成后一起发布。

提交复用既有 SurfaceChange leaf 保存原始 Surface，并在同一历史项中保存色板资源、可见顺序和 ID 分配器。撤销不把隐藏 ID 再按当前色板归一化，避免资源身份丢失。新增 palette history kind 14 只回放资源／顺序／分配器；当前色板布局、选中色块、前景与背景色保留。像旧版 snapshot 命令一样，即使结果相同也形成 snapshot 历史；RGBA 既有提交路径保留。

## 实际旧版对照

Node oracle 直接执行旧版 applyColorAdjustmentDirect、captureAdjustmentSnapshot、prepareAdjustmentSnapshotTargets 和 restoreAdjustmentSnapshot；仅沿用已有 TypeScript 类型擦除加载适配，不改动旧版可执行语句。1836 组覆盖六种色板情形、三种表面位置、三种可见顺序、有／无掩码选区，以及 17 组参数。色板情形包括 ID 0 有色、重复 ID、首项或末项透明、空色板、隐藏与缺失 ID；表面包括完整画布、负偏移、完全画布外，宽度 18 验证跨模 8 缓存行为。参数包含 identity、相对 HSL、着色、两种保亮度模式、分通道曲线和全部九种渐变抖动选择。

原生逐项比较原始像素、色板记录及名称、顺序、nextColorId、曲线四通道直方图；检查重复预览、禁用、恢复、取消、单次提交、Undo／Redo、format、storage origin 和提交几何。另有 31 组共享图层／显式链接帧变体，以及后台取消、过期预览、过期色板、预算拒绝、多 owner 单次提交与撤销检查。链接样本在提交、Undo 和 Redo 后调用普通工程、恢复和本地历史三个生产编码器，解码原始 ID；重复 palette ID 仍按已有保存契约拒绝，indexed 可编辑导入仍拒绝。

测试初轮遇到 Win32 GetObject 宏与 WinRT JSON 同名方法冲突，按仓库既有测试方式 undef。全部对照执行后进程退出异常，定位为局部 WinRT JSON 对象晚于 RoUninitialize 析构；将测试主体置于独立 run 函数，在关闭运行环境之前释放，随后完整运行退出 0。未更改旧版预期。

## 验收与边界

旧版 adjustments.test.ts、gradient-map-composite.test.ts、workspace-gradient-map.test.ts 共 24 项通过（11.80 秒）。首批四项定向 CTest 全部通过（8.16 秒）：color-adjustment、indexed-adjustment-oracle、indexed-adjustment、document-raster-history。之后补充界面确认时的同步渐变映射检查，以及 Undo 后的生产编码检查；最终 indexed-adjustment-oracle、indexed-adjustment、正式程序 selection-interactions 三项全部通过（11.25 秒）。合计五项不同的定向 CTest 通过。

来源覆盖 970 文件及证据快照通过；Editor 595 源码、架构 595 源码／259 targets 通过。coverage 不代表行为等价，strict 因整体已登记迁移缺口实际退出 1。唯一正式 Release 构建退出 0，native/build/Release/moonsprite-native.exe 于 20:31:37 更新（30,715,904 bytes）；正式程序 selection-interactions 入口通过（3.58 秒）。未执行新的人工图像或完整桌面验收。

后台渐变映射沿用原生已有的完整 owned-surface 适配，本阶段对照实际 direct snapshot 的结果；旧版 viewport 裁切、localContentBounds 和分块调度并未宣称等价。整体 indexed 的生产渲染入口及其他工具组合仍需继续迁移，新建／模式转换／可编辑导入保持关闭。本阶段不覆盖全部滤镜、瓦片调整、attached mask 或整体 indexed 准入。无新增人工图像或完整桌面验收，所有用户数据、日志和构建缓存保留。
