# 索引色选区对称变换迁移（2026-11-15）

本阶段承接普通 indexed 栅格的对称内容平移、轴向缩放和翻转、Fast／RotSprite 旋转，以及 n／s／w／e 四个斜切手柄。沿用旧版 symmetry.ts、selection.ts 和 tools-selection-transform-{source,raster,rotsprite,apply}.ts 的实际采样、代表点、写入顺序和掩码逻辑；许可沿用 legacy/LICENSE 的 MoonSprite Source-Available License 1.0。不进行性能优化或 UI 改造。

## 迁移结果

继续使用原生已有的 raw ID SelectionClipboard、对称 stream、变换采样器和 Document 预览／取消／提交／历史事务。pressed region 保持 first-write 去重，其他分支保留代表点和重复 orbit 写入顺序；合成读取原始背景，移动到原选区内直接赋值。选区轮廓独立于像素透明度，保留画布外的 geometry。

实际对照发现旋转／斜切的 immutable symmetry raster 缺少旧版 applySelectionTransform 最后的透明度过滤。逆采样可能返回透明 ID，RotSprite 使用重复 ID 的非透明并集进行采样；实际写入还必须按当前首项色板条目判透明。现补齐最终过滤，避免透明 ID 覆盖原有内容。改色板时，首项透明度即使改变而非透明 ID 并集不变，也使对称写入 raster 失效；RotSprite source sampler 仍只在其实际 opacity 依赖变化时重建。

## 实际对照

独立 Node oracle 执行实际旧版 TS，仅复用已有的 type import 擦除适配，不修改可执行旧版语句。540 组涵盖 dense／sparse／负偏移、move／copy、矩形／mask、五组对称轴、整数／半像素／画布外中心、0／缺失／重复 ID、半透明、首项或末项透明、变换中改色板，以及四个斜切方向和旋转后斜切。每组分别执行即时与延迟适配，另有 18 组共享图层及显式 Cel 链接变体。

逐项比较原始 ID、unbounded selection mask、宽高／偏移／storage origin、重复预览、取消、单次提交、Undo／Redo，检查预览不发布历史或 revision，链接保留存储身份和 format。延迟路径比较整张显示结果与 19×17 分块，保持原始画布不变；20 组 300×230 稀疏输入由生产尺寸门槛进入延迟预览，紧凑样本由测试夹具进入同一适配分支。linked 样本在提交／Undo／Redo 调用普通工程、恢复、本地历史三个生产编码器，解码 raw ID 与几何；重复 palette ID 按已有保存契约拒绝，可编辑 indexed 导入仍拒绝。

初次构建发现测试中的混合 auto 声明和 C++17 不支持的 starts_with，已修正。首次实际对照在 symmetry-14 的南向斜切发现透明 ID99 覆盖背景；保留原预期，修复最终过滤后全矩阵通过。随后增加非透明并集不变的首项改色场景，最终回归结果见下。

## 验收记录

旧版 symmetry.test.ts、symmetry-offset-selection.test.ts、selection-transform-commit.test.ts 三文件共 66 项通过（12.16 秒）。最终 9 项定向 CTest 全部通过（22.94 秒）：indexed-symmetry-oracle、indexed-symmetry、indexed-selection-oracle、indexed-selection、selection-interactions、symmetry-content、symmetry-scale、symmetry-rotation、symmetry-alpha。540 组旧版事务各运行即时／延迟变体，另有 18 组 linked，共 1098 组原生对照运行通过。symmetry-shear-tests.exe 独立运行通过；该既有目标没有 CTest 注册，本阶段保留其原有调用方式。

唯一正式 Release 构建退出 0，native/build/Release/moonsprite-native.exe 于 19:21:37 更新（30,702,592 bytes）。正式程序 selection-interactions 入口通过（2.88 秒）。未进行新增人工图像或完整桌面交互验收。

来源覆盖 967 文件及证据快照通过，Editor 594 源码、架构 594 源码／258 targets 通过。coverage 不代表行为等价；strict 因整体已登记缺口退出 1。日志及生成夹具保留在 native/build/，不提交生成物或用户数据。

## 仍有边界

本阶段仅覆盖上述普通栅格对称组合，不代表任意连续操作、quad、attached mask、瓦片对称组合或整个 indexed 模式完成。索引色新建／转换／可编辑导入保持关闭，其余工具组合、模式准入和整体功能迁移继续。没有新增人工图像或完整桌面验收。
