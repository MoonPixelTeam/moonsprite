# 液化索引色与 PixelEdit 迁移（2026-11-16）

依据实际 legacy `core/liquify.ts`、`core/smooth-brush.ts`、`core/history.ts`、`core/document-model.ts`、`core/animation.ts` 与 `store/workspace-commands-history.ts`，以及液化输入和计时器调用路径。内部复用许可为 `legacy/LICENSE` 的 MoonSprite Source-Available License 1.0。仅功能迁移。

## 行为与原生适配

五种模式继续使用旧版原始 packed 字采样、类别拐角修正、轴向／对角线位移、弧长采样与临时末端预览恢复。持续作用继续保留稳定局部源、弱强度累积和完成周期后的重新取源。

写入使用既有 RasterColorContext 承接 `normalizeLayerPackedValue`，避免把索引色 ID 当作 RGBA。细线保护的占用判断按实际旧版 Map 采用色板最后一个重复 ID 的 alpha，未知 ID 为透明；写入归一化仍采用最先匹配的色板项，两者不可合并。源范围以外不因不透明 ID0 被认成占用像素。

推移提交后的平滑明确传入 indexed 格式，沿用 current-source 和原始非零 ID 判定，仍并入原来同一笔液化事务。提交复用 256 点／包围面积不超过点数三倍的密集历史阈值；点历史按回放时色板归一化，密集历史保留原始字。色板、选区、存储 origin、当前槽位和单笔统计沿用现有事务。

取消遵循旧版 `revertPixelEdit` 的逐点归一化规则，不扩大用户此前只针对滤镜预览确认的“取消不改作品”修复。已有原生几何适配保留：稀疏存储扩张、链接断开和像素编辑组成同一可撤销事务；取消恢复原有几何与链接快照，撤销扩张亦恢复原表面。缺失当前 Cel 时安全拒绝，避免解引用空槽位。

实际旧版断链历史保存完整 Cel 列表；原生原先仅保存被断开的引用 Cel。当活动项是被其它帧引用的源 Cel 时，逐点恢复会先按当前色板归一化隐藏 ID，而原始源快照未能恢复。现在断链组同时保存活动源 Cel 的前后快照，取消及撤销在像素回放后恢复原始源与链接，其它帧继续保持原有内容。

## 对照与范围

新增 oracle 执行真实旧版模块，加载适配只擦除 bundler 原本擦除的接口导入。3,230 组 indexed／RGBA，覆盖五种模式、七种色板状态、细线／孤点／块面／对角线／多色、强弱参数、轴向与往返／小数移动、定点持续作用、选区 mask 0／1／2／255、附加蒙版、负偏移与稀疏扩张、平滑开关、取消及 Undo／Redo，包含 70 组密集历史。生成数据与构建日志保留在 `native/build/`，不提交。

原生测试另覆盖链接别名与被引用源的事务、其它帧像素、三种生产编码和 indexed 可编辑导入门禁，以及缺失／锁定／隐藏／文本目标、重复活动事务、非有限坐标和无变化提交。全部 3,230 组对照、70 组密集历史及 260 组链接／编码变体通过。

初轮链接取消检查错误地拿两个独立文档自动生成的 Cel ID 比较；改为保存各自初始状态。蒙版夹具最初使用非灰度 RGBA，被真实编码器拒绝；改为覆盖值相同的合法灰度像素。调试期间一次文本替换错误重编码了测试中文标签，改为 Unicode 字面量后恢复。以上失败均未作为通过证据。随后对照确实发现活动源快照缺失，按实际旧版断链事务补齐后完整通过。

旧版两个定向测试文件 88 项通过（5.78 秒）。最终 9 项 CTest 全部通过（39.11 秒）：indexed-liquify 及 oracle、smooth-brush 及 oracle、liquify、document-transactions、document-raster-history、tile-repeat、tile-repeat-stroke。正式 Release 与受影响测试目标构建退出 0；唯一正式程序 `native/build/Release/moonsprite-native.exe` 于 2026-11-16 06:39:24 更新，30,759,936 bytes。新正式程序 `--workspace-check --named-workspace-only --paint-tools-only` 退出 0，包含喷枪、平滑和液化的真实控件／捕获／提交／取消／重置／修饰键输入检查。

来源覆盖 992 文件与既有证据快照通过；Editor 597 源码、架构 597 源码／269 targets 和 diff 检查通过。strict 因其它已知迁移缺口按要求退出 1。阶段保存推送 dev，生成物与用户数据不提交。

生产 indexed 新建／转换／可编辑导入保持关闭。全仓迁移仍 INCOMPLETE；没有性能优化、UI 修改或完整人工桌面／图像验收。
