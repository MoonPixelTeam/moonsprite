# 颜色控件拖动取色迁移（2026-11-16）

依据实际 `legacy/src/renderer/src/components/ColorValueControl.tsx` 的 trigger pointer 生命周期、global sampling refs／RAF queue／异步采样与放大镜，以及 `ColorValueControl-sampling.test.tsx`。调色器依据 `components/color-picker-sampling.ts` 和 `components/ColorPicker.tsx` 的外部采样／结束逻辑；画布来源依据 `core/canvas-color-sampling.ts`、`components/useCanvasColorSampling.ts`；屏幕实现依据 `legacy/src-tauri/src/platform_screen_color.rs`。本阶段只迁移功能。

## 行为与必要适配

- 颜色控件按下后捕获指针；未拖出含右／下边界的触发范围时，释放仍打开原颜色编辑器。首次离开后开始全局取色，释放保留最后样本并抑制普通 Click。Escape、失焦、关闭、隐藏、禁用及丢失捕获清理手势；取消保留已经应用的颜色，承接旧版取色语义。
- 每帧保留最新位置，最多运行一个常规桌面捕获；调色器在捕获等待期间仍优先处理。调色器透明角落的“已处理但无颜色”阻止后续回退。之后优先读取实际画布的原始 RGBA，再尝试桌面区域／单点，最后使用原生显示后备表面。
- 同一手势的旧捕获结果可在最新指针位置更新镜头，只有最新序号能应用颜色。释放先隐藏镜头并使旧镜头代数失效，再独立执行最终取样；取消及工程身份变化拒绝迟到结果。相同 RGBA 不重复发回调。
- 调色器复用原 field／hue／alpha 计算，保留外部采样源的精确 HSV 和自己发出颜色的同步回声；不触发源调色器的普通 changed 回调。alpha-only 采样保留源 HSV；外部手势期间抑制滚轮，完成时释放状态。
- 已绑定主／次颜色、主／附加调色器角色、吸管选项、渐变色标、图层显示色、偏好中的图层预设颜色编辑行、文字、描边／背景、等距辅助线、自由瓦片自定义源色、Lua dialog color 和洋葱皮颜色。固定预设色块仍使用原来的选择语义。
- 原生 PixelButton property、16ms 所有者 timer 和捕获替代 DOM／RAF；控件销毁前显式解绑，弱回调避免迟到访问。后台 promise worker 只携带物理屏幕坐标，不访问 UI；销毁控件不等待桌面捕获。Editor 提供当前素材／偏好／画布来源／身份门禁。
- Win32 屏幕服务按旧版 Rust 的 GetPixel／BitBlt／top-down DIB 移植，保留低字节 red 的 RGBA、桌面 alpha 255、半径 0..12、BGRA 转换及 GDI 资源清理。浏览器 CSS emergency fallback 无法直接复用，必要适配为原生显示后备表面。
- 镜头复用已有 shell helper 和原始 legacy mask／pointer 素材，11×11 采样、线条／尺寸／指针亮度保持原语义；全局 distortion 为旧 CSS 的 contrast(1.04)／saturate(1.08)。现有 MIT `ui::UILayer` 替代 viewport-fixed 浮层，保持指针、焦点、捕获透明。镜头留在发起控件的 Display 并按其视口夹紧；屏幕取样仍使用物理坐标。阴影使用现有 Skia。

内部复用许可已核对 `legacy/LICENSE`；Aseprite 只复用既有 MIT UI／laf 依赖，没有复制受限 app 层代码。未新增或替换图标，沿用 Fusion Pixel 10px、默认 2× 与现有皮肤。

## 验证

实际旧版队列与异步函数经 Node stripTypeScriptTypes／VM 执行，生成 37 组异步状态快照，逐项与原生状态机比较通过。曾修正 oracle 对 CSS px 的解析方式（parseFloat），生产逻辑不受影响。

原生服务／调色器 10 项 CTest 全通过（1.90 秒）：`global-color-sampling`、`global-color-sampling-oracle`、`global-color-sampling-contract`、`screen-color`、`color-picker`、`color-picker-scheme`、`color-picker-wheel`、`color-picker-normal-map`、`color-picker-moon-ring`、`color-picker-quantization`。覆盖队列合并、来源优先级、旧响应、释放／取消、失败回退及既有调色器算法。精确 HSV 回声修正未新增独立精度回归，不将既有算法测试描述为该修正的专项证明。

`screen-color` 在真实临时 64×64 topmost／no-activate 窗口读取两段已知 RGB，检查单点、11×11 上下行顺序、半径 0／12 和非法边界；64 次区域捕获后 GDI 对象数不变。

正式 Release 构建退出 0；唯一程序 `native/build/Release/moonsprite-native.exe` 于 2026-11-16 15:01:31 更新（30,973,440 bytes）。正式程序 `color-editor-popup`／`--color-editor-check` 通过（1.85 秒），使用真实 down／move／up、捕获与 UILayer 路径验证：含边界的触发范围、点击与拖动区别、角色隔离、5 种调色器 × 连续／量化模式、alpha／角落、源回调隔离、画布原始 alpha 优先、一个透明镜头层、Escape／禁用／无按键释放清理以及作品像素／历史／次色隔离。初轮诊断误用布局隐藏的旧 primaryRole，改为可见 pickerPrimary 并固定测试工作区／fitCanvas 后通过；此项只修正夹具，没有改变生产布局。

关联八项 CTest 全通过（19.75 秒）：`animation-settings`、`multi-document`、`layer-context-menu`、`palette-mouse-startup`、`color-editor-live-oracle`、`color-editor-live-contract`、`text-document`、`isometric-ui`。合计 19 项不同定向 CTest 通过。旧版 `ColorValueControl-sampling.test.tsx` 与 `ColorPicker.test.tsx` 两文件 10 项测试通过（13.97 秒）。

已查看正式诊断生成的 `native/build/Release/global-color-lens-smoke.bmp` 与 `global-color-drag-smoke.bmp`，核对透明画布取样、原素材轮廓与中心指针。第二张仅合成 Editor 绘制和镜头，未递归绘制全部子控件，侧栏空白不能作为完整工作区验收。没有 1×、多显示器、完整人工桌面验收或性能结论。

来源覆盖 1020 文件及证据快照通过；Editor 边界 608 源码、架构 608 源码／278 targets、偏好目录 360 行／14 类／98 静态标签通过。`--strict` 因全仓已知迁移缺口按要求退出 1；源码覆盖不代表全部行为等价。

## 剩余范围

跨画布来源注册、参考图覆盖采样、尚未接入的通用／运行时颜色触发器和其它已登记功能继续迁移，不把桌面像素回退视为这些来源的数据语义已经迁移完成。生产 indexed 新建／转换／可编辑导入保持关闭，整体 INCOMPLETE。生成物、日志、测试数据和用户数据不纳入提交；本阶段保存并推送 dev。
