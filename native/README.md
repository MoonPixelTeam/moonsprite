# MoonSprite 原生重构版本

已提供 Windows x64 原生绘图原型：C++17 + Aseprite MIT UI + laf + Skia，没有 WebView2。双击 [start-native.bat](start-native.bat) 启动当前深色分层界面。

- [功能需求基线](docs/requirements-baseline/README.md)：从旧版 Demo 提取功能语义、兼容边界和验收场景。
- [现有版本](../legacy/README.md)：功能和工程数据的对照。
- [全代码 legacy 对照审查](docs/legacy-architecture-audit.md)：已修偏差、逐文件来源及尚未完成项。当前不是完整 legacy 迁移，不能通过完全一致性验收。
- [性能框架与全功能承接计划](docs/performance-framework.md)：统一快照/后台任务、渲染/缓存/历史边界及全部需求性能矩阵；[当前性能审计与修复](docs/performance-audit-2026-10-15.md)。

字体按用户最新决定使用 **Fusion Pixel 10px，整体 2×（20px 显示高度）**，取代最初的 9×9。遵守原始拉丁／中文前进宽度，不拉伸、不平滑；字体原文和许可随资源保留。

## 直接改皮肤

用 Aseprite 打开 [sheet.png](assets/themes/moonsprite-dark/sheet.png)，在原位置改画并保存。启动上述入口即可看到变化；当前软件内皮肤编辑器已按用户要求移除；修改素材后重新启动。不需要编辑 XML，也不要修改 build 里的副本。各块素材的对应位置见[皮肤素材说明](assets/themes/moonsprite-dark/README.md)。素材许可及署名保留在同目录。

## 当前可用

- [legacy 指针](assets/cursors/README.md)：复用旧版素材、点击位置和黑白切换逻辑；当前接入界面箭头、画笔／橡皮和抓手，保持旧版默认 32×32 显示尺寸。

- 顶部名称与顺序沿用 legacy：文件／编辑／选择／图像／图层／窗口／帮助。当前展示 legacy 的142个静态叶项目录；已接入新建、打开、保存、另存为、恢复、撤销、重做和部分视图/图层操作，未迁移项置灰。下拉菜单由原生 UI 库处理键盘与关闭交互。
- 默认32×32单层单帧RGBA画布；画笔/橡皮支持1–64px、圆/方/线形及0–100%不透明度，颜色来自文档色卡。
- 一笔一次撤销／重做；Esc 取消当前笔；无变化笔画不产生历史；越界裁切。
- 新建和关闭的未保存提示；当前统一使用用户参考图的深色配色。
- 运行时加载theme.xml和PNG主题图集；当前默认深色主题，Aseprite原始图集单独保留。外部修改后重启，主题只控制外观。软件内编辑器已移除，[早期皮肤记录](docs/skin-editor.md)保留为历史资料。
- 画布区域滚轮向上放大、向下缩小，以鼠标位置为锚点，采用 legacy 的 6.25%–6400% 共23个档位；F 恢复居中视图。底部显示倍率，整体 UI 仍固定 2×。绘制过程中暂不响应缩放，避免当前笔画跳位；缩放不修改作品或撤销历史。
- 画布移动沿用 legacy：中键拖动、空格＋左键拖动，或 H／左侧「手」按钮切换抓手后左键拖动；B、E 返回绘图工具。画布周围的中央空白区也能起拖，拖出中央区域仍跟随，松开起拖鼠标键结束。空格先松开时继续到鼠标松开，避免误画；Esc 取消本次平移，失焦或窗口切出时回到起拖位置并解除捕获。拖动期间忽略缩放和工具切换，绘图中不切入平移。采用旧版 50% 移动边界，F 或「窗口 → 复位视图」恢复居中；平移不改变像素、dirty 或撤销／重做。
- 快捷键 B、E、H、Space、Ctrl+Z、Ctrl+Shift+Z / Ctrl+Y、Ctrl+N、Ctrl+O、Ctrl+S、Ctrl+Shift+S、F。
- 中央画布下方为真实单层单帧时间轴，图层显示和不透明度可操作，未迁移的增删/播放等操作置灰；右侧颜色板/预览，窗口可调整大小和最大化，UI维持2×。
- `.moonsprite`打开、保存、另存、重开仅支持schema21、1–1024边长、单层单帧normal RGBA及其它准入条件；不支持内容明确拒绝，原文件不被扁平化。
- 自动恢复默认5分钟，活动编辑期间跳过；Native独立恢复目录、启动发现与恢复入口已接入，保留期自动清理和完整崩溃验收尚未完成。

当前仍不是旧版替代品：完整多层/多帧、选区、瓦片、文字、其它导入导出、扩展、压感、输入法与长期使用验收仍待迁移。保存同步编码和验证，尚未接入进度取消。最新分批边界见[迁移记录](docs/migration-plan.md)。旧版和用户工程继续保留。

## 构建和验证

需要 PowerShell 7（pwsh）、Windows x64、Visual Studio 2022 的 C++ 桌面组件与 CMake、Git。依赖仅放本目录 `.cache/`，不安装全局包；字体资源已包含，不需在线下载字体。

```powershell
cd native
pwsh -File scripts/bootstrap.ps1
pwsh -File scripts/build.ps1
.\start-native.bat
```

仅构建独立文档核心和测试：`pwsh -File scripts/build.ps1 -CoreOnly`。仅当更换字库或重新生成字体图集时需要 Python 3 执行 `python scripts/prepare-font.py`。

`build/Release/moonsprite-native.exe --smoke` 启动原生窗口，向应用消息处理器注入限定绘图动作，检查历史、取消、菜单、颜色板、窗口布局和关闭取消，输出自身帧缓冲 `smoke.bmp` 后退出。它不是操作系统真实鼠标、IME 或长期运行测试。失败会返回非零状态，启动异常写入工作目录 `native-smoke-error.txt`。

详细边界与验证见[首个原型记录](docs/native-milestone-01.md)，依赖固定版本和许可见 [THIRD_PARTY.md](THIRD_PARTY.md)。编译产物、依赖缓存和截图不提交，未创建安装包。

笔刷预览跟随问题与 Aseprite 对照、修复及验证范围见 [笔刷预览性能](docs/brush-preview-performance.md)。

滚轮缩放卡顿原因、局部重绘修复和实测见 [滚轮缩放性能](docs/wheel-zoom-performance.md)。

大量帧／图层的绘制、可见行复用与时间轴压力验证见 [性能记录](docs/large-timeline-performance.md)。

快速绘制、松笔及拖动画布的 Aseprite 代码对照、修复和像素验证见 [绘制与拖动性能](docs/drawing-pan-performance.md)。

全界面交互卡顿的公共命中检测原因、修复及同程序对照见 [交互性能记录](docs/interaction-performance-2026-10-18.md)。
