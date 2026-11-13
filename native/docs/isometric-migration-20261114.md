# ISO 功能迁移

## 几何核心阶段

直接移植 `legacy/src/renderer/src/core/isometric.ts`，旧版许可已按仓库 Source-Available 1.0 核对，保留原实现作为来源。原生适配仅为 C++ 类型、可选字段和 sample 值复制；保留 JS 取整、方向候选顺序、距离相同时的边 key 字典序选择、左向像素偏移、奇偶网格周期及 16384 边推进上限。

已包含辅助线缩放间距、裁剪、像素图案、网格顶点吸附、直线端点、指针穿越边追踪、普通及网格连续笔画方向锁定，以及保留压力等 sample 字段的路径更新。

验证：旧版 `pnpm exec vitest run src/renderer/src/core/isometric.test.ts` 9/9 通过；生成器执行实际旧版源码得到 2019 项固定对照，原生 Release `isometric-tests` 构建及 `ctest -R '^isometric$'` 通过（0.26 秒）。另以原生 balanced 光栅函数验证旧测试的四方向、1–4 阶梯、5/8/16 间距像素均落在预览网格上。

当前这一阶段只完成几何核心。视角菜单、会话开关、设置预览／取消／持久化、辅助线绘制和生产笔画输入接线尚未完成；不能把本次核心测试通过当作整个 ISO 可用或桌面图像验收通过。
