# 窗口状态与鼠标命中回归

2026-10-15 修复两个独立问题：

- 顶部菜单在最小窗口中被 Aseprite `ui/menu.cpp` 的自动布局换行，第二行超出固定高度的 MenuBar。绘制与命中被父容器裁切。`Editor::layoutTopMenu` 先计算菜单的真实尺寸，按需减少各项横向留白；`PixelMenuItem` 尺寸计算和绘制共用同一 inset。宽窗口保留原始间距。
- 默认预览浮窗的边缘被 `Editor::cursorAt` 中自定义停靠浮窗的内部指针分支提前返回。该分支现在仅处理自定义停靠布局；默认预览继续执行 `PreviewPanel::cursorAt` 的八方向边缘及捕获指针判定。

输入与控件边界保持显示器相对物理像素。桌面绝对坐标仅通过当前 native window 的 `pointFromScreen` / `pointToScreen` 转换，绘制的 2× 缩放不得再应用到输入。

已注册为 CTest `window-input-hit-testing`，串行执行，40 秒超时。现有 `scripts/build.ps1` 的 CTest 验证会包含此项，防止只验证默认窗口位置。

正式程序回归命令：

```powershell
& .\build\Release\moonsprite-native.exe --window-input-check
```

此检查使用独立测试进程，不保存工作区设置。实际移动 Win32 窗口并调整至 720×600 客户区，覆盖正坐标、负坐标、最大化以及还原。对照 Win32 的 ClientToScreen，逐点检查菜单边界与目标；检查默认和自定义预览浮窗的八方向边缘；通过 UI Manager 分发鼠标移动和点击，核对菜单打开、弹出项命中及系统指针句柄。失败输出 `native-window-input-error.txt`，成功退出码为 0。

相关验收还应运行 `--modal-layout-check`（弹窗与浮窗操作）和 `--smoke`（菜单与编辑操作）。仅调整 Editor 的模拟尺寸不能代替上述实际窗口状态回归。

旧版证据：`legacy/src/renderer/src/components/app/AppMenuBar.tsx`、`legacy/src/renderer/src/styles.css` 的单行菜单；`legacy/src/renderer/src/components/floating-panel.tsx` 的方向边缘判定。复用 Aseprite 的 MIT `ui/menu.cpp` 布局与既有 UI 消息分发，仅适配固定高度的原生顶部栏。
