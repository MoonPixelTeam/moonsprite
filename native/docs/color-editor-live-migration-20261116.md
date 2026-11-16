# 颜色弹窗实时色板与 HEX 粘贴迁移（2026-11-16）

依据实际 `legacy/src/renderer/src/components/ColorValueControl.tsx` 的 `activePaletteEntries`、`samePaletteEntries`、打开期间的 workspace 订阅、`applyHex`、`pasteHexFromClipboard` 与 HEX `onContextMenu`；解析沿用 `core/color-values.ts::parseRgbaHex`。本阶段只迁移功能。

## 行为与必要适配

- 打开和刷新共用颜色弹窗时，读取活动工程的显示色板，按独立顺序显示条目；跳过缺失 ID，保留真实 ID 0 和重复顺序。同 ID 的存储条目取最后一项，承接旧版 Map 语义。
- 名称、顺序及完整 RGBA 参与比较；名称／颜色／增删／排序／撤销重做和替色预览都会更新色块及“名称 · HEX”提示。相同列表不更新；更新不发出颜色回调，不重设当前模式和正在输入的 HEX／通道草稿。
- 按 ID 复用存活色块，更新点击时读取的颜色及原生 Tab 顺序。移除条目时清理焦点和捕获，禁用并延迟销毁，允许从正在执行的 Click 回调安全返回。
- 复用 Aseprite MIT `ui::TooltipManager`。核对其待显示 target 生命周期后，在删除目标前销毁旧 manager，清理其 timer 和待显示引用，再为当前条目注册提示；只移除 tips map 不能清理 pending target。
- 原生事件刷新代替 React workspace 订阅，共用 provider 在 Editor 销毁时按所有者清理；颜色调整预览更新也读取 `displayPalette()`。不增加轮询。
- 右键 HEX 读取剪贴板并应用有效六／八位颜色，接受可选 `#`、大小写和 JS 首尾空白。六位保留当前透明度；八位保留显式 alpha 0 与透明 RGB，显示归一化为现有大写 HEX。
- HEX 专用上下文处理承接旧版 preventDefault，避免打开共用文本编辑菜单；Menu／Shift+F10 走同一原生上下文动作。外部释放、禁用、失焦、关闭和 Escape 清理手势。普通文本输入、失焦及 Enter 提交继续复用既有逻辑。
- 空、无效、缺失或读取失败不改颜色和现有输入草稿。浏览器异步 readClipboardText 由已有同步原生剪贴板服务替代；专项诊断注入 reader，不读写用户剪贴板。

内部复用许可已按 `legacy/LICENSE` 核对；Aseprite 只复用既有 MIT UI 依赖，没有复制 app 层代码或素材。沿用 Fusion Pixel 10px、默认 2×、共用控件和已有皮肤，本阶段没有新增或替换图标。

## 验证

实际旧版函数执行：83 组色板输入、479 项有序相等性检查、60 组粘贴输入及剪贴板失败通过；生成的有序色板、相等性和解析结果逐项用于原生比较。原生 `color-value-ui`、`color-editor-live-oracle`、`color-editor-live-contract` 三项通过（0.21秒）。

正式 Release 构建退出 0，唯一程序 `native/build/Release/moonsprite-native.exe` 于 2026-11-16 13:46:07 更新（30,898,688 bytes）。最终九项定向 CTest 全通过（9.64 秒）：`color-editor-popup`、`multi-document`、`palette-mouse-startup`、`color-value-ui`、`color-editor-live-oracle`、`color-editor-live-contract`、`color-editor-modes-oracle`、`color-editor-modes`、`color-values-legacy`。既有旧版色板重复与取样两文件五项测试通过（7.18 秒）。

正式程序输入诊断覆盖两个打开弹窗的工程色板改名／改色／增删／排序／Undo／Redo、替色预览和取消、关闭期间更新及重开；控件身份复用、按住期间重排后读取最新颜色、删除捕获目标及陈旧 Click、原生 Tab 顺序、HEX／通道草稿和颜色回调隔离。粘贴检查覆盖六位继承 alpha、八位显式透明 RGB、归一化、无效／空／缺失／读取失败、外部释放、禁用、真实同级控件焦点转移及键盘 Menu。

诊断修正：独立输入夹具暂时清除活动工程 provider，避免事件派发时正常刷新覆盖合成色板，并在成功和异常路径恢复；真实工程同步检查仍使用生产 provider。数值框失焦提交单独计入回调，失焦目标使用框架允许聚焦的同级按钮并断言焦点已转移。没有为通过测试修改生产行为。

已查看正式程序生成的 `native/build/Release/color-editor-live-paste-smoke.bmp` 与 `color-editor-live-palette-smoke.bmp`，核对 HEX、透明度通道、实时色板内容及既有弹窗布局。截图只覆盖这些弹窗状态，不代表 1×、多显示器或完整工作区人工验收。

来源覆盖 1,012 文件与既有证据哈希、Editor 603 源码、架构 603 源码／275 targets、360 条偏好目录及 diff 检查通过；strict 因全仓剩余迁移缺口按要求继续退出 1。

## 保留范围

整体迁移仍 INCOMPLETE；桌面全局拖动取色、延迟桌面响应、跨画布与参考图覆盖取色等已有缺口继续保留。生产 indexed 新建／转换／可编辑导入继续关闭，严格来源检查应继续失败。未进行性能优化或完整工作区人工验收。
