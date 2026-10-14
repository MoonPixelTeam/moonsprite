# 吸管与缩放工具迁移（2026-10-15）

旧版依据：`legacy/src/renderer/src/components/canvas-input-navigation.ts` 的
`beginZoom`、`moveZoom`、`endZoom`，以及 `core/canvas-input-navigation.ts`、
`core/shortcut-contracts.ts`、`components/canvas-sampling-start.ts`、
`components/useCanvasEyedropperMagnifier.tsx`、`core/eyedropper-source.ts`。
复用遵守 `legacy/LICENSE` 的 MoonSprite Source-Available License 1.0。

- 吸管 I，Alt 临时取色；左键前景／右键背景，连续采样保留 alpha。
  合成图像／当前图层沿用已迁移的来源选择及持久化；工具栏单项现在启用。
- 镜片采用旧版默认 pixel、size=1、无畸变；保留原色／取样色环、像素指针、
  25×25 取样区域、204px 内容视野、1.5 倍相对放大和透明棋盘。
  原生 2× UI 将 256px 外壳映射为 128 逻辑像素。
- 缩放 Z；左键松开放大一级、右键松开缩小一级；任一轴超过 3px 不算单击。
  横向拖动每 24 逻辑像素一级；平滑算法 `start*2^(distance/96)`，Shift 强制阶梯。
  默认阶梯，`zoom-tool-drag-mode.txt` 可保存 `smooth` 或 `stepped`。
  缩放锚点保持按下位置；沿用已有画布滚动边界，结束／Esc／失焦只结束视图手势。

`assets/eyedropper/eyedropper-magnifier-*.svg` 原样来自旧版 assets 同名文件。
对应 PNG 通过已有 `scripts/import-legacy-tool-icons.py --source
../legacy/src/renderer/src/assets --target assets/eyedropper --pattern
'eyedropper-magnifier-*.svg'` 做无平滑正交路径转换；颜色采用现有转换器的
currentColor 默认值。`viewport.png` 来自旧版 `styles.css`
`.eyedropper-magnifier-viewport` 的 clip-path polygon：坐标除以4，按64×64
网格像素中心奇偶填充。指针复用 `assets/cursors/02-Slice-2.png`、`03-Slice-3.png`。

检查：正式程序 `--sampling-zoom-check` 覆盖工具栏启用、I／Alt／Z、前后景及
透明采色、点击／拖动阈值、平滑／Shift、捕获／取消、镜片释放，以及像素／历史／
dirty 不变；输出 `build/Release/sampling-zoom-smoke.bmp`。

迁移范围仍限于当前可编辑的普通 RGBA 工程。跨画布／桌面全局采色、图层蒙版／
瓦片采样、镜片样式／尺寸／畸变的偏好设置界面尚未迁移，不能据此宣称旧版全量等价。
