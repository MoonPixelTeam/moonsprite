# 全局响应优化（2026-11-05）

用户反馈所有操作卡顿。此次先修复事件入口中可证实的全局重复工作；不能把单项基准称为全部功能无卡顿。

## 已改动

- `editor_input.cpp`：快捷工具同步限定为键盘、鼠标、焦点事件；已有按键、临时工具、笔刷尺寸调整、手型、取色或色板采样状态时保留 timer 清理。输入分发前后同步保留，避免事务完成和上下文切换时漏掉临时工具恢复。删除松键处理里两次完全相同的重复同步。
- `shortcut_model.h`、`editor_shortcut_inputs.cpp`：先判断当前按键是否满足绑定，再进行全目录冲突解析；无按键时快速返回。仅对候选临时工具查询可用性，避免扫描菜单命令表。保留冲突优先级、允许共享、子集匹配和最长组合优先。
- `shortcuts_test.cpp`：与修复前算法对照默认、重映射、冲突配置及八种按键状态；额外检查无按键不查询工具可用性、禁用工具不激活。

## 源码对照

旧版 `legacy/src/renderer/src/components/app/useAppShortcutSettings.ts:22` 用 useMemo 按配置缓存 `deriveShortcutConflicts`；`core/shortcuts.ts:547` 定义目录顺序、冲突及共享规则。本次保留其规则，先移除不匹配输入和无关消息的计算。

本地固定版本 Aseprite `src/app/ui/key.cpp:504` 的 `Key::isPressed` 按键盘/鼠标消息类型检查已有 accelerator，`src/app/ui/keyboard_shortcuts.cpp` 查询已构造 Key。MoonSprite 原生入口原先会对 paint/timer 消息重复调用完整匹配，且先检查冲突再检查实际按键。此次独立修复对应额外开销。Aseprite app 源码仅作方案对照，没有复制；许可范围见 `native/THIRD_PARTY.md`。

Aseprite `src/ui/manager.cpp` 的 flushRedraw 和编辑器局部 canvas invalidation 使用脏区。MoonSprite 已使用同一 MIT UI 调度器，并有画布/时间线缓存与局部重绘，本次保留其像素语义。透明窗重绘、大作品录制提交、全量 refresh 的额外成本仍需各自测量，不能只凭源码扫描宣称已解决。

## 验证

- Release 模型测试通过：快捷键默认/重映射/冲突/禁用/空按键对照，以及完整 document-raster-history-tests。
- 同一进程 2,000 组 quick matcher 输入：修复前算法 395.580ms，优化后 100.276ms（约 3.94 倍）；此项不含实际 Editor 的工具可用性查询，不能等同整应用提速。
- 来源覆盖检查通过（625 个源码/测试/脚本），全功能迁移仍不完整。
- 唯一正式产物 `native/build/Release/moonsprite-native.exe` Release 构建成功。
- 正式程序 `--drawing-pan-performance-check`、`--shortcuts-input-check`、`--wheel-performance-check`、`--modifier-brush-performance-check`、`--hit-testing-performance-check` 全部 exit 0。
- 绘画/平移：画笔四点一批平均 7.248ms，橡皮 8.423ms；平移完整重绘 1.984ms、复用 1.370ms；作品像素、历史、撤销重做一致。
- 滚轮局部重绘：无对称轴 3.552ms、有对称轴 4.602ms，完整 framebuffer 对照一致，内容上传次数不变。
- 尺寸调整：局部路径无全局布局/外框重绘，framebuffer、参数持久化对照通过。
- 命中：三种布局与父可见性组合通过逐控件等价检查，无关 viewport 回调为 0。
- 同一绘画/平移回放的 opt-in profile：修改前 canvas-paint 5,056 次/509.776ms，修改后 5,055 次/225.143ms；修改后 shortcut-sync 364 次/3.513ms。桌面尺寸和运行环境未固定，此数据作为诊断记录，不作严格整机提速比例。早期 `native/build/test-tmp/drawing-pan-performance.txt` 为不同工作目录下的旧报告，未用于正式前后比值；本轮报告在仓库根 `build/test-tmp/`。
- 基准仅测软件消息回放，不代表硬件输入到屏幕延迟。尚不能保证每项功能都无卡顿；大作品录制和全量 refresh 仍需专项测量。


## UI 移动与尺寸调整专项

- `editor_panels.cpp` 对 custom docking 几何作有界单条缓存：比较 Editor、区域、浮动视口、全部可见性、左右宽度、底部尺寸/比例及每个组的 tabs/active/dock/weight/width/floating/floatingArea/fixedExtent。直接写入 docking 字段也会使结果失效，无需人工 revision。
- `layoutPanelTabs(only)` 原来结束时无条件布局参考图/历史/平板/瓦片集/笔刷库/实例栏；现在只布局同一组。完整布局仍更新全部。
- picker 尺寸相同不重复 setBounds，避免 Aseprite MIT Widget::setBounds 无条件发送 resize 的成本；未修改上游框架，也未改变颜色计算。
- 正式 Release 构建成功；`--ui-geometry-performance-check` exit 0。200,000 次同输入几何查询：直接 layout 109.663ms，缓存 30.773ms，约减少72%。缓存逐项变更和窗口尺寸对照通过。
- 200 个浮动移动输入合并一次更新，约2.109ms；200 个尺寸调整输入合并一次更新，约1.944ms；移动复用一次 move_region。两者完整 framebuffer 对照通过。该时间不包含屏幕呈现。
- 连续12次窗口尺寸改变并完整绘制，加最后恢复尺寸总计434.251ms，仍有整体重排/绘制成本；尚未验证真实 Windows 标题栏拖动、DPI变化及硬件呈现延迟。
- 命中、滚轮缩放、绘画/平移回放全部 exit 0。来源覆盖与 diff 空白检查通过。
- 旧 `--workspace-check` 在修改前正式程序就失败：Scrollable region has no sheet scrollbar: home。此次调用旧 smokeDockResizeHover 又在 Palette split corner lost resize hit after window size change 断言失败，不能据此声明整个旧工作区验收通过。新的专项入口独立执行本次的几何、浮动移动/resize和窗口重排检查；原有入口未删。build/ui-geometry-performance-error.txt 可能保留前次失败文本，以本次进程 exit 0 和最终报告为准，未删除旧证据。
