# 调色盘迁移第一批

调色盘对应 legacy `panels/ColorPanel.tsx`，与 `PalettePanel.tsx` 的颜色板／色卡是独立功能。新增原生控件只拥有拾色交互和呈现状态，不直接写文档、历史或色卡。

## 已实现依据

- `core/panel-preferences.ts:parseColorPickerConfig` 默认 `sv-square`、连续色相和连续色阶。首批严格采用这个默认方案。
- `core/raster.ts:rgbToHsv/hsvToRgb/clampByte` 转换公式、舍入和 RGBA 数据；`ColorPicker.tsx:pickField` 的 S 横轴、V 反向纵轴、越界夹取。
- `ColorPicker.tsx` 左键前景／右键背景、各角色独立 HSV、高精度 HSV 保留、灰色保留色相、alpha 保留。调色不是绘制像素。
- `pickHueStrip/pickStrip` 的色相 0–359、透明度范围、Shift 阶梯；`useSliderWheel.ts` 的条内滚轮方向、边界和 Shift 5 步；面板滚轮连续色相循环。
- `emitPointerColor/flushPendingColor` 的最后值合并、抬起和取消时发送最终值；原生事件循环用一次 16ms Timer 对应浏览器 requestAnimationFrame。高刷新率时不保证派发频率一致，最终颜色一致。
- `ColorPicker.tsx` 按 fieldHue 更新颜色场的思路：原生 SV 缓存只由色相／尺寸变更触发，色相条缓存由尺寸触发，alpha 条由 RGB／尺寸／棋盘颜色触发；缓存替换释放旧 surface。
- 用户最新输入框／滑块图集通过现有 `slider.normal` 和 `slider.focus` 绘制外框，颜色渐变和选择指示独立绘制。

## 集成契约

`NativeColorPicker(font, skin)` 作为独立调色盘内容区；`syncColors(primary, secondary)` 只同步外部颜色，`changed(Pixel,bool secondary)` 必须转到现有 `Document::setPaletteRole(color,secondary,paletteLocked)`。保持锁定语义，不自行合并历史或解除色卡绑定。

切换栏目、打开模态、切换工程和禁用控件前调用 `finishInteraction()`，先发送最后颜色，再切换。常规 refresh 只调用 `syncColors()`，不要结束拖动。首批复用现有前景／背景 HEX 编辑与锁入口。

## 尚未迁移

其他三种样式（色轮、法线贴图、复合色相环及三角区域）、色相分段／色阶偏好、最近颜色、RGB／HSV／HSL 数值切换、调色盘内新增色卡快捷键、外部拖入取样、浮动／恢复正方形、瓦片角色、跨工程共享颜色与偏好持久化。这些保留为功能缺口，不能称完整调色盘已迁移。

原生适配：像素化光标提示与整数倍布局；两条范围共用控件焦点，方向键调整最后操作条。尚未实现 legacy 的各条独立 Tab 焦点和所有无障碍语义。

## 验证

`tests/color_picker_test.cpp` 检查六个色相端点、负色相循环、4096 组 RGB 往返、边界夹取、alpha、独立角色、HSV 回传保持、灰色保留色相和 Shift 步进。纯算法通过不等于桌面运行验收。

集成后需实际验证：默认方块可拾色并影响画笔；右键仅改背景并用于右键绘图；连续拖动后释放／切标签保留最终值；锁定时不改色卡和文档历史，解锁绑定时走现有色卡命令；主题换色后透明条棋盘更新；窗口缩放不溢出面板。

已接入右栏第三个“调色盘”标签与“窗口→调色盘”。共用顶部锁定和双角色 HEX 入口；右栏最小116基础像素容纳完整标签。集成smoke已实际发送左右鼠标事件，验证角色隔离、锁定不改像素/历史、切页释放capture并发送最终值；真实运行截图 `color-picker-smoke.bmp` 已检查。模型4096 RGB往返和其余定向断言通过。长期手工操作、上述完整功能缺口尚未验收。


## 2026-10-17 HS 方块增量

标题区方案菜单提供 SV／HS；HS 横轴 H、纵轴反向 S、保留 V，第一条改为 V，alpha／双角色保持。HS 场缓存按 V／尺寸更新，V 条按 H／S／尺寸更新；复用现有 joined 布局和 legacy marker。默认 SV，全局偏好保存到 AppData color-picker-scheme-v1.txt，不可读偏好不覆盖。其余方案与离散色阶仍未接入。模型定向与桌面运行证据分开记录于本批 build JSON。

## Column action row (2026-10-18)

User-requested shared `PanelChromeLayout` uses logical pixels: 3px frame, 2px inset, full 10px single-title cell, 2px gap, 16px action row, 2px gap, content. Grouped tabs remain outside the frame. Palette and picker share action/content geometry; picker restore/scheme controls sit below the title, aligned right. Floating close remains on the title row. Custom timeline action origin also uses the shared chrome. Existing sheet materials are unchanged.

Validation: Release build and --docking-check passed; rendered merged picker screenshot checked. Provenance coverage check currently reports existing unregistered src/about_dialog.h and src/document_gradient.cpp, unrelated to this layout change. Square restore now measures the intended full 12px hue/alpha strips when a short viewport compresses them.
Final checks: --docking-check=0 and --wheel-blend-square-check=0 on the updated formal Release executable.

## Independent picker columns (2026-10-18)

User-requested independent columns for existing five legacy ColorPanel schemes. Window / Columns / Picker groups visibility commands. Default group: SV, Moon Ring, HS, active SV. Wheel/Normal Map initially hidden. Columns have independent docking, widget, controls, focus and visibility; document foreground/background colors remain shared. Existing v1-v3 workspace layouts upgrade to v4 and receive the default picker group once; subsequent launches restore the user layout. Existing sheet/icon assets and picker sampling algorithms are reused.

Validation: formal Release build passed; --docking-check, --wheel-blend-square-check, --cel-picker-check and panel-docking-tests passed. Inspected picker-default-group-smoke.bmp and independent-picker-columns-smoke.bmp: SV first/active, Moon/HS tabs visible, detached Moon and SV simultaneously visible with shared colors. Provenance coverage: 304 registered files and snapshots verified (known broader migration gaps remain).
