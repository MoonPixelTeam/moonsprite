# 喷枪与密集 PixelEdit 迁移（2026-11-16）

依据实际 legacy `core/airbrush.ts`、`tools-brush.ts`、`history.ts`、`document-model.ts`、`symmetry.ts`，以及 `canvas-input-stroke.ts`、`useCanvasStrokeClock.ts` 和 `canvas-airbrush-clock.ts` 的调用路径。内部复用按 `legacy/LICENSE` 的 MoonSprite Source-Available License 1.0 核对。仅功能迁移。

## 行为与原生适配

粒子保留两个独立随机输入、均匀圆盘散布与 JS 半数向正方向取整。每批独立盖章，无鼠标移动插值；固定本次按钮颜色，Simple 墨水、完整不透明度倍率、实心纹理；圆粒子忽略角度，方形与线形采用原有优化旋转。选区、源印章逐像素对称和重复画布沿用旧版路径。原生现有粒子、计时、盖章实现通过本阶段实测，未重新实现。

修复实际对照发现的提交差异：普通笔画（含喷枪）达到 256 个变化点，且包围面积不超过点数三倍时，旧版保存原始区域字；原生此前始终保存点，indexed Undo 会按当前可见色板重映射隐藏色号。现在复用已有密集历史 helper，并以读取回调适配画布索引与 owner-local 索引；保留原 `strokeAddress_`，支持稀疏、负偏移和画布外存储。区域完整准备后才替换历史载荷；原有选区、液化和柔化调用接口保持可用。RGBA 同样承接旧版区域历史。

取消继续沿用旧版 PixelEdit 逐点恢复与色板归一化，没有扩大此前仅针对滤镜预览确认的精确取消修复。保留既有原生稀疏表面扩张、共享内容、自由瓦片源 scratch、Timer 与捕获适配。生产 indexed 新建／转换／可编辑导入保持关闭。

## 对照范围与验证

实际旧版 oracle 执行原模块，加载适配仅擦除 bundler 原本擦除的接口导入。1,470 组 indexed／RGBA：七种色板状态（含重复／隐藏／未知色号、不透明 ID0、空资源）、三种粒子形状、全部 32 种对称轴组合、半像素中心、四种角度、四种散布和重复画布模式、粒子半径与密度、选区 mask 0／1／2／255、完整／负偏移／稀疏存储、连续三批与重复覆盖、当前色板变化后的 Undo／Redo 和取消。包含 126 组密集历史。原生另检查 197 组关联图层／链接帧、共享存储、活动项、画布外像素及三个生产编码器，重复色号须被编码器拒绝，indexed 可编辑导入继续拒绝。

初轮测试夹具分别错误比较独立文档自动生成的 Cel ID、遗漏 palette nextId；修正夹具后发现真实密集历史差异。修复后全部 1,470 组对照和 197 组变体通过。旧版喷枪计时、喷枪轮廓和 history 三文件共 19 项通过（4.13 秒）。最终 22 项定向 CTest 全部通过（150.12 秒）：喷枪及 oracle、笔刷对称及 oracle、indexed 笔刷／历史及各自 oracle、柔化及 oracle、液化及 oracle、indexed 描边／抗锯齿及各自 oracle、图像笔刷、动态笔刷、文档事务、稀疏历史和重复画布／笔画。正式 Release 与受影响测试目标构建退出 0，唯一正式程序 `native/build/Release/moonsprite-native.exe` 于 2026-11-16 07:02:20 更新，30,760,960 bytes。新程序 `--workspace-check --named-workspace-only --paint-tools-only` 退出 0（1.68 秒），包含喷枪真实控件、鼠标捕获、提交、取消及失焦路径。

来源覆盖 994 文件与既有证据快照通过；Editor 597 源码、架构 597 源码／270 targets 和 diff 检查通过。strict 因整体已知迁移缺口按要求退出 1。阶段保存推送 dev，生成物与用户数据不提交。

本阶段未宣称特殊图层完整组合、任意运行中参数变化或完整人工桌面／图像验收。全仓迁移仍 INCOMPLETE。生成 oracle、构建日志和用户数据不提交。
