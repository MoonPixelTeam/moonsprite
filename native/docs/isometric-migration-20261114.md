# ISO 功能迁移

## 几何核心阶段

直接移植 `legacy/src/renderer/src/core/isometric.ts`，旧版许可已按仓库 Source-Available 1.0 核对，保留原实现作为来源。原生适配仅为 C++ 类型、可选字段和 sample 值复制；保留 JS 取整、方向候选顺序、距离相同时的边 key 字典序选择、左向像素偏移、奇偶网格周期及 16384 边推进上限。

已包含辅助线缩放间距、裁剪、像素图案、网格顶点吸附、直线端点、指针穿越边追踪、普通及网格连续笔画方向锁定，以及保留压力等 sample 字段的路径更新。

验证：旧版 `pnpm exec vitest run src/renderer/src/core/isometric.test.ts` 9/9 通过；生成器执行实际旧版源码得到 2019 项固定对照，原生 Release `isometric-tests` 构建及 `ctest -R '^isometric$'` 通过（0.26 秒）。另以原生 balanced 光栅函数验证旧测试的四方向、1–4 阶梯、5/8/16 间距像素均落在预览网格上。

几何核心提交时仅完成上述范围。后续集成如下，正式界面验收结果单独记录。

## 设置、辅助线与生产输入接入

本批直接核对旧版 `IsoViewSettingsDialog.tsx`、`file-preferences.ts:1111–1175`、`AppMenuBar.tsx`、`app-view-shortcuts.ts`、`workspace-session.ts`，以及 `canvas-render-background.ts`、`canvas-stroke-brush.ts`、`canvas-raster-start.ts`、`canvas-raster-stroke.ts`、`canvas-input-free-tile.ts`、`canvas-input-shape.ts`、`canvas-input-line-connection.ts` 和 `tools-brush.ts:850–940`。

视角菜单选择 ISO，快捷键切换 ISO，开关属于工程视图而非文档内容。设置保持阶数、原点、网格单位、实线粗细、两种样式的独立颜色、强制对齐和吸附网格的旧版默认值与归一化。实时预览关闭、取消、Esc、背景点击、窗口关闭和未提交析构均恢复打开时的值；完成经现有原子偏好写入成功后发布，失败保持窗口。颜色子窗口的点击和 Esc 独立处理；设置窗口与两种颜色窗口分别记忆几何。阶数变化同步更新对齐说明。原生布局复用 PixelDialog/DialogLayout，替代旧版 React/ModalShell；默认位置仍为画布区域左上偏移 12 逻辑像素，默认宽 400，高度由内容测量。

辅助线使用旧版缩放间距、裁剪与每个重复画布的原点；实线由 Skia 路径绘制，像素线条使用 nearest 重复图案，保留 8192 单边及 4Mi 像素预算。图案颜色与透明度独立处理。直线、Shift 连接线与普通铅笔／橡皮擦接入旧版端点约束、左向起点偏移、普通方向锁定重放以及网格穿越边追踪；网格按下不盖章，相同悬停边不重复叠加。连续指针与栅格坐标分别保留，动态尺寸按当前线段距离平滑，压力与固有图像笔刷尺寸不平滑。

Document 在现有笔画事务内重放或追加 balanced 路径，保留选择裁切、蒙版、动态渐变、图像笔刷实际尺寸间距、重复画布、链接 Cel、瓦片资源和自由瓦片源扩展。重放恢复同一手势基线，取消和失败走既有回滚；不另建历史或资源体系。Aseprite UI 的模态、颜色子窗口和 TooltipManager 仅复用现有 MIT 接口，未复制其它许可模块实现。

## 已执行的自动检查

`isometric` 与 `brush-dynamics` 通过；新增 Release `isometric-stroke` 通过（0.31 秒）。事务用例覆盖四方向像素、网格按下／重复边、重新定向清除旧像素、取消、独立边、选区、尺寸／透明度／渐变、固有图像间距、重复画布、链接帧、蒙版、Tilemap Create/Edit/Hybrid 和自由瓦片源增长，检查撤销／重做及保存重开。

最终正式 Release 构建与后续增量构建均成功，保证中途修改的文件已进入唯一正式程序。`isometric-ui` 实际进程检查通过（2.78 秒），覆盖菜单选择／快捷键切换、旧偏好解析、四轮真实设置窗口的预览关闭／取消／完成／保存失败／背景取消、独立颜色及子窗口 Esc，以及实际鼠标按下／移动／松开、同边悬停、Esc 回滚、撤销重做和普通方向重新判定。离屏检查使用生产辅助线渲染函数，在 zoom 1/2/4、Graphics 物理偏移 0/7、非零网格原点、半透明颜色和裁剪边界下逐像素比对旧版图案。

人工查看本轮 `native/build/Release/isometric-dialog-smoke.bmp` 与 `isometric-guides-smoke.bmp`：默认 2× 设置窗口标题、字段、禁用粗细、实时预览和底部按钮无重叠；像素辅助线与实际阶梯笔画显示正常。截图不作为所有尺寸、实线样式或旋转／平铺组合的完整视觉验收。来源覆盖 928 项及快照检查通过，Editor 边界检查 587 源文件通过，diff 检查通过；strict 仍因其它已知迁移缺口退出 1，符合整体未完成状态。

1× 实机、全部显示器组合和硬件合并压力事件尚未验证。此阶段完成 ISO 生产接入及上述限定验收，整体功能迁移仍 INCOMPLETE。保留所有用户数据、旧日志与构建缓存；阶段提交推送 `dev`。
