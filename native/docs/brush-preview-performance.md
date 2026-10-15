# 笔刷预览跟随性能：与 Aseprite 的对照

2026-10-15。本次检查 native 的悬停笔刷预览；此前完整性能审计见 [审计记录](performance-audit-2026-10-15.md)。

## 为什么预览会落后于指针

系统指针由 Windows 管理，画布预览则要等待 UI 处理输入、计算像素、绘制并呈现。因此多余的 UI 工作会直接增加两者的可见距离。预览还按文档像素吸附：高倍缩放时在同一个像素内移动，预览保持原位，这是既有绘画语义，需要与时间延迟区分。

本地 Aseprite 源码对照：

| 路径 | Aseprite | 修复前 native |
| --- | --- | --- |
| 输入调度 | `ui/manager.cpp` 在输入批次后生成一次 SetCursor，再绘制最新状态 | 已复用相同 MIT UI 调度，没有发现额外固定 16ms 等待 |
| 笔刷轮廓 | `app/ui/editor/brush_preview.cpp` 缓存 UILayer 表面及 brush generation，移动位置并限制 clip | 橡皮每次创建完整 `std::set`，遍历内部像素，再检查邻接边 |
| 真实颜色预览 | ExtraCel 局部范围，隐藏时通知旧范围失效 | 每次指针移动使整个 canvasViewport 失效 |
| 其他面板 | 由各控件的状态和失效区域决定更新 | 每次移动还刷新选中色板项和色板选择轮廓，并计算时间轴选择轮廓 |
| 像素来源 | 预览工具使用当前 Site/图像 | `brushPreview` 每个像素重新解析活动图层、帧、Cel 与链接表面 |

Aseprite app 源码受其 EULA 约束，仅作为阅读对照，未复制实现。此次实现依据 MoonSprite legacy 已有的行为、局部 damage 和同色矩形合并方案，适配原生 retained framebuffer；不新增 WebView，不更改指针图标或绘画语义。

## 已落实的修复

- 普通笔刷和图片笔刷按显示器相对物理像素计算新旧覆盖范围，各自加入失效区域；快速跳跃不要求重画中间空隙。出界时修复旧位置。
- Shift 连线与对称预览保留整个视口失效，避免遗漏远端副本；分数缩放保留原逐像素绘制顺序。
- 色板选中轮廓与选中颜色项只在其 hover 状态切换时刷新。时间轴原选择素材命中规则继续使用 Skin 公共接口。
- 一次预览只解析一次活动像素来源；区域复制也复用该引用。
- 普通橡皮缓存相对轮廓坐标，size/shape 变化时重建。位置、主题、背景对比色继续实时计算；图片橡皮保留原遮罩路径。
- 整数缩放下，依据 legacy `solidCompositePreviewRects` 合并同色水平矩形；半透明矩形额外按棋盘底色分段，保留 fillRect 的混合与舍入。复杂或较大区域继续原路径。

直接 legacy 证据：`useCanvasBrushOverlay.ts`、`canvas-overlay-damage.ts`、`canvas-pointer-move.ts`、`canvas-render-brush.ts`、`canvas-brush-solid-composite-preview.ts`、`core/tools-brush-spans.ts`；原路径和内容摘要登记在 `legacy-provenance.json`。

## 验证边界

`brush-preview` 检查悬停不修改像素、撤销历史、dirty、contentRevision 或画布内容上传次数，并覆盖导航隐藏、绘画不重复叠加、橡皮出界和 Shift 连线。

`brush-preview-performance` 用原逐像素完整重绘作为图像 oracle，对比局部批量重绘的每个 framebuffer 像素。覆盖连续移动、大跨度跳跃、离开、不同笔刷大小、分数缩放、旋转图片笔刷、图片橡皮、Shift、对称和多层 alpha 0–255。另检查真实 Widget 失效区域没有扩大到整个画布。

原始计时输出：`build/test-tmp/brush-preview-performance.txt`。每组 120 次悬停重绘，256×256 文档、1280×960 UI；full 为原逐像素完整视口，partial 为局部同色批量绘制，二者使用相同像素合成函数。计时不包含硬件输入、桌面合成器、垂直同步或显示器扫描，不能作为鼠标到屏幕的端到端延迟，也不是 Aseprite 与 MoonSprite 的整机跑分。

复杂多层、长 Shift 连线、对称、多图案图片笔刷、后台重任务及高刷新率实际手感仍需分别测量；这些场景的成本不能由普通圆形悬停结果推断。

本次一轮成功测量（ms/次；结果受系统负载影响）：

| 圆形笔刷 | 原完整逐像素绘制 | 局部批量绘制 |
| --- | ---: | ---: |
| 铅笔 1px | 0.866 | 0.050 |
| 铅笔 16px | 0.991 | 0.117 |
| 铅笔 64px | 3.767 | 1.238 |

这组 full/partial 共享“单次解析像素来源”修复，因此不代表所有修复的完整前后差值；橡皮最终检查另外将原遮罩集合路径作为 oracle，与缓存边界逐像素比较。

最终正式产物 2026-10-15 14:42:43，`build/Release/moonsprite-native.exe`，11568640 bytes。最终定向 CTest 5/5 通过：document-transactions、brush-preview、brush-preview-performance、palette-mouse-startup、window-input-hit-testing。橡皮额外覆盖 Round/Square/Line，2/3/64px 的缓存边界与原集合路径逐像素等价。来源覆盖 154 文件通过；严格迁移验收仍按已登记缺口失败。本轮未重新运行完整功能套件；此前已知功能回归失败见完整审计记录。

尺寸快捷键热路径见 [修饰键调整笔刷](modifier-brush-performance.md)。
