# 笔刷对称组合迁移（2026-11-16）

本阶段核对普通 indexed 与 RGBA 笔刷的全部 32 种对称轴组合，依据实际 legacy tools-brush.ts 的 paintBrush／paintLine、symmetry.ts、gradient-color.ts，以及 canvas-raster-stroke 和 PixelEdit 完美像素尾部／历史契约。许可沿用 legacy/LICENSE 的 MoonSprite Source-Available License 1.0。仅做功能迁移。

## 修正与原生适配

普通笔刷和 brushPreview 原来先裁切源印章，导致画布外像素即使经偏移对称轴映回画布内，仍被遗漏。现在保留完整源印章，逐个对称目标再裁切。普通线段与预览的有界遍历同时包含可映回画布的源中心；用既有对称矩阵的逆映射求保守范围，保留原 raster 相位、间距和遍历顺序。无对称路径继续沿用原范围，重复画布继续沿用已有路径。

动态笔刷原来在对称目标坐标检查抖动，与旧版 brushMaskOffsets 在源印章坐标筛选的顺序不同。现先筛选源像素，再生成全部对称副本；渐变仍在目标坐标采样。沿用原生已有覆盖记录、immutable 笔前底色、完美像素尾部回退、共享 owner 和单笔历史，没有引入新事务或产品行为。

## 实际旧版对照

独立 Node oracle 执行真实旧版模块；加载器仅承接 bundler 的类型导入擦除，不改可执行旧版语句。4,032 组为两种格式 × 32 组轴 × 三个中心／存储场景 × 七种笔刷 × 三种墨水。涵盖整数与半像素偏移中心、画布两侧的外部印章、稀疏负偏移、storage origin、方／圆／线形、原尺寸遮罩／彩色及缩放彩色图像笔刷、半透明与擦除、0／35／100 透明度、抖动、mask 字节 0／1／2／255、不透明 ID0、重复／隐藏／未知 ID 和空可见色板。

每组分别运行普通、动态、普通完美像素、动态完美像素四条生产路径，逐步核对 canvas 原始像素、取消、提交、Undo／Redo；另外 109 组关联图层／链接帧变体检查共享存储身份。普通预览与真实旧版 paintLine 对照，并检查预览不改 revision、历史和存储身份。取消与完美尾部仍遵守既有笔刷 PixelEdit 的归一化契约，本阶段未把用户针对滤镜预览批准的完整恢复规则扩大到笔刷历史。

首次对照复现动态抖动顺序差异，随后暴露源印章 Y 裁切和线段预览裁切；均保留旧版预期并修正。RGBA 夹具最初错误使用 uint32 数组作旧版字节缓冲，已改为 Uint8ClampedArray 后重新生成对照。最终新增对照 4,032 组、四条路径和 109 组链接事务通过。

## 范围与剩余缺口

本阶段不代表旋转动态、任意连续参数变化、其他抖动模板、重复画布的全部对称组合或特殊图层全部完成。稀疏存储继续采用已有原生笔画准备时扩张，本阶段比较画布像素及 origin 映射，未宣称与旧版逐印章最小几何一致。没有新增工程编码器实现或全套保存验收。生产 indexed 新建／转换／可编辑导入继续关闭，整体迁移仍 INCOMPLETE。无性能优化、UI 修改或完整人工桌面／图像验收；用户数据、日志和缓存保留。

## 交付验收

唯一正式 Release 和相关测试目标构建退出 0。native/build/Release/moonsprite-native.exe 于 2026-11-16 04:58:49 更新（30,754,304 bytes）。最后 14 项定向 CTest 全部通过（16.99 秒）：新增 brush-symmetry 及 oracle、已有 indexed-brush 及 oracle、brush-dynamics、image-brush、symmetry-model、tile-repeat-stroke、isometric-stroke、document-raster-history、document-transactions，以及新正式程序的 brush-preview、isometric-ui 和 selection-interactions。4,032 组样本各运行四条笔画路径，另有 109 组链接事务。

旧版 brush-translucent-spans、brush-selected-rotation 和 canvas-perfect-pixel-stroke 三文件 28 项测试通过（12.91 秒）。来源覆盖 988 文件及证据快照通过，Editor 597 源码、架构 597 源码／267 targets 通过；strict 因整体已知迁移缺口按要求退出 1。没有完整人工桌面或图像验收，没有性能优化和 UI 改动。阶段保存并推送 dev，日志、生成对照数据和用户数据不提交。
