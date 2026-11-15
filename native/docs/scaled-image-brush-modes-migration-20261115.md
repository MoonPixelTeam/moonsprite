# 缩放图像笔刷三种绘制模式迁移

2026-11-15。本阶段迁移缩放图像笔刷的 Paint、Source 和 Target 模式，补齐普通笔画、动态笔画、预览及共享采样路径。仅做旧版功能迁移；生产索引色新建、转换、可编辑导入和整体编辑准入仍关闭，整体 INCOMPLETE。

## 旧版依据与原生适配

实际依据为 `legacy/src/renderer/src/core/tools-brush.ts` 的 brushMaskOffsets、imageBrushCacheKey、claimBrushCoverage、paintBrush 和 paintLine，以及 tools-pixel-edit.ts 的 paintLayerValue、ink.ts 的 resolveInkStampColor、history.ts 的像素事务。createCanvasBrushConfig.ts 的 brushPatternOrigin 与 canvas-raster-start.ts 在动态采样前以初始工具尺寸确定 Target 原点。

Source 减去图像来源坐标，Target 减去首点的未旋转工具锚点；缩放遮罩按采样坐标执行 Bayer 覆盖。旋转逆采样、JS 取整和四相位 FIFO 沿用旧版。原生扩展现有 ImageBrushPatternSampler，普通、动态与 indexed 几何路径复用同一个 sampler；自由瓦片临时栅格扩张后保留初始尺寸锚点，悬停轮廓也采用缩放尺寸锚点。不新增布局、图标或架构。

旧版先按原始墨水覆盖去重，再乘图像像素 alpha。透明前景在三种墨水下使用统一 erase 覆盖键，但只有 Simple 实际擦除；Lock Alpha 与 Copy 仍按各自墨水处理。原生普通、动态和预览按同一顺序处理，并保留完美像素尾部覆盖记录的回滚。半透明图像先将 coverage × opacity 取整为覆盖字节，再计算源 alpha，最后混合；避免先折回整数百分比造成额外舍入。

## 验证范围

新增 oracle 通过 Node 的 TypeScript loader 执行实际 legacy 模块，只擦除类型导入，不修改旧版可执行语句。450 组 RGBA／indexed 事务覆盖缩放遮罩、彩色图像、paintColors 映射、原尺寸遮罩，三种绘制模式、三种墨水、透明前景、0／50／100 透明度、固定及变化尺寸／角度、选区、对称、隐藏 ID 和空可见色板。逐步比较实时像素、取消、提交、Undo／Redo；固定尺寸另比静态预览，变化尺寸检查预览不修改权威状态。27 组追加关联图层／链接帧共享存储检查。

144 组采样序列覆盖 0／37／90／-30.5° 和 1／5／6px，每组比较六个位置的无缓存与 FIFO 缓存结果。以上新增对照全部通过。旧版 tools.test.ts 的墨水、图像笔刷及 pattern 定向筛选 9 项通过、86 项跳过。

综合回归发现帧删除的显式蒙版上下文被通用选择快照覆盖：旧版 workspace-commands-animation-frame.ts 的 Undo／Redo 清空 activeLayerMaskId，workspace-mutation.ts 仅请求选择归一化。原生在恢复选择后重新应用该命令的显式蒙版上下文，并为组合历史保留首个 before／末个 after。原有单帧／批量／剪切、两种起始帧的六组测试及保存、链接蒙版、Undo／Redo 全部通过。随后发现 portableFrameLayerMapping 夹具向 1×1 稀疏 Surface 写入两个像素，已明确设置为预期 2×1；未放宽生产校验或断言，临时诊断输出已移除。

唯一正式 Release 最终构建退出 0，于 15:14:29 更新（30,674,944 bytes）。最后两批共 12 项不同 CTest 全部通过：free-tile-project、scaled-brush-oracle、scaled-brush 三项 46.02 秒；indexed-path／indexed-brush 及各自 oracle、image-brush、brush-dynamics、tile-repeat-stroke、attached-masks、document-raster-history 九项 9.15 秒。先前失败及修复均如上记录，不把首轮称为通过。来源覆盖检查通过 960 文件，Editor 边界 593 源码、架构 593 源码／255 targets 通过。来源覆盖不代表整体行为等价，strict 继续因其他已登记缺口失败。未进行人工图像或完整桌面验收；悬停轮廓和自由瓦片临时栅格的接入不据此宣称完成全工具组合验收。构建产物、oracle、日志和用户数据不提交。
