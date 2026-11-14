# 索引色直线／曲线笔刷路径迁移

2026-11-15。本阶段仅迁移功能；普通索引色栅格 Line／Curve 的笔刷路径及预览、提交、取消和历史。生产索引色新建、转换、可编辑导入及整体编辑准入继续关闭，整体 INCOMPLETE。

## 实际旧版依据

canvas-input-shape 的 endLine／endCurve，经 useCanvasShapeCommit 的 commitBrushPath 调用 tools-brush 的 paintBrushPath。先按 brushPathStampPoints 选择中心，确保整条路径的 footprint，再依次确保每个 stamp footprint 并执行 paintBrush。复用既有 line／Bezier／perfect 几何、indexedBrushValue、图像笔刷采样与 pattern 原点语义；保留所有墨水、色板顺序、未知／重复 ID、隐藏 RGB、半透明、选区与对称。

canvas-render-brush-path 将每个可见目标只绘制一次；原尺寸图像的 paint 模式倒序遍历中心。canvas-render-preview-pixels 中 Line 预览使用所选墨水，Curve 预览固定 simple；两者预览使用会话透明度，提交传 opacity=1。透明主色的预览仍走 erase=false。预览与提交的差异是旧版实际语义，分别验证。

保留整路径与逐 stamp 的对称矩形裁切、64px 扩张 padding、raw-zero 占位、storage origin、链接图层／帧，以及 >=256 且 bounding area <=3×变化点的 raw dense 历史。取消及候选失败不改变权威像素、Cel、历史和修订号。Editor 仅连接 indexed Line 与曲线上下文，不调整布局或素材。

## 验证状态

1,074 组旧版实际函数调用与 C++ 逐像素对照通过，覆盖两次显示预览、取消、提交和 Undo／Redo；另有 102 组关联图层／链接帧检查通过。包含普通／原尺寸／缩放的彩色和遮罩笔刷、三种图案模式、所有墨水、选区／对称／重复、稀疏／负偏移／零与非零占位／缺失 Cel、间距与 dense 历史阈值。候选坐标超预算拒绝后保留已有预览与历史。七项定向 CTest 全部通过（16.84 秒），旧版 tools.test.ts 定向两项通过、93 项跳过（12.07 秒）。唯一正式 Release 构建成功，于 05:43:48 更新（30,679,552 bytes）。无人工图像或完整桌面验收。构建产物、oracle、日志及用户数据不提交。

缩放图像笔刷补充三种绘制模式的彩色及遮罩采样，保留旧版旋转逆采样、Bayer 抖动和四相位 FIFO；适配仅接入本阶段 indexed 几何路径，普通笔刷的独立缺口继续登记。

来源覆盖 958 个文件及证据快照通过，diff 检查通过；strict 因已登记的其它迁移缺口继续退出 1。Editor 边界 593 源码、架构 593 源码／254 targets 检查通过。覆盖检查不证明整体行为等价，生产索引色准入继续关闭。
