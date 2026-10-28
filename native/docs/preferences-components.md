# 首选项组件迁移

用户要求：完整承接旧版首选项入口，未接入项禁用标灰，复用现有原生组件。

开关使用完整行的文字开关，或图标加文字开关；标题由组件内部绘制，不再将文字与空白开关分开。内部按钮保留原素材的开/关及正常/悬浮状态，鼠标离开后取消悬浮，焦点不代替鼠标位置。弹窗底部操作行统一从 dialog_frame 底框内缘留出 4px（1×）背景间距。

来源为 legacy/src/renderer/src/components/dialogs/PreferencesDialog.tsx、ThemePreferencesSection.tsx、DiagnosticPreferencesField.tsx、components/tablet/TabletInputSettings.tsx、components/app/quick-command-registry.ts；默认值和动态列表参考 core/file-preferences.ts、core/theme.ts，标签参考 locales/zh-CN.ts 与 tablet.ts。

src/preferences_catalog.h 登记 14 个分类，包括条件显示项、四组快捷指令、文档尺寸/导出比例/图层颜色预设、主题、扩展和脚本管理操作。控件使用已有 PixelSwitch、PixelDropdown、PixelEntry 和 PixelButton（颜色沿用 colorRole），不制作新皮肤。

已有缩放工具模式、吸管来源、取色镜片开关/尺寸、播放速度/结束返回、恢复保存和棋盘格设置接入原有草稿及应用/确定/取消流程。其余项 binding=-1，控件和标签标灰，不能获得输入或改变工程。不将灰色入口登记为功能已迁移。数位板测试区域暂以禁用输入框呈现，无可用测试画布；完整拾色弹窗及列表拖动排序未接入，列表以禁用组件逐项展现。

滚动只显示当前分类，输入和绘制共用物理像素视口。条件项在未迁移时仍显示为禁用状态，避免隐藏需求；未来接入时再依照旧版恢复依赖条件。恢复保留期自动清理尚未接入，因此该项灰显。

滚轮方向统一按 LAF 的正值向下：下滚显示后续内容，上滚返回前面的内容；滚动条和容器共用同一处理。首选项在分类栏、内容区域的标题、空白、禁用控件及输入框上均可滚动，不依赖焦点，也不误改数值。下拉菜单打开后仍由菜单自身接收滚轮。保留连续滚轮事件的步数，到达边界时停止。对应回归通过 Manager 过滤器发送显示器相对物理像素事件，覆盖两个窗口尺寸、上下方向、连续步数、输入框及边界。

验证：scripts/check-preferences-catalog.py 对照 98 项静态标签及全部快捷指令；--preferences-catalog-check 遍历分类、720×600/1280×960、滚动头尾、禁用状态、模态归属、关闭后无控件泄漏。原有首选项和棋盘格回归继续保留。

首选项组间距为 6px，组内选项间距为 2px（1×）；标题与首项间距为 2px。控件高度保持统一，分组标题绘制和滚动内容高度共用同一排版坐标。

分类内容顶部不重复显示分类名称，直接从分组标题开始。内容滚动条独立于内容留白定位，贴 panel_outer 右侧内层黑边并共享该描边，上下对齐内框。

## 2026-10-16 首选项功能接线

这批把原来的禁用清单接到已经存在的原生功能。新增 `editor_preferences.h` 复用旧版 `file-preferences.ts`、`PreferencesDialog.persist` 的默认值、输入边界与草稿语义；正常运行写入 `MoonSprite/Native/editor-preferences.txt`，通过现有原子替换函数保存。旧版浏览器存储与原生配置隔离。选择框以稳定条目 ID 和经过校验的选项序号保存。损坏配置会显示错误并阻止覆盖，未知配置记录原样保留，不激活未知功能。

已接入：笔刷大小滚轮反向、画布滚动条开关、滚轮缩放开关和模式、视图拖动灵敏度、渐变即时/确认应用、Shift 直线预览、套索闭合预览、吸管取色后回铅笔、框选尺寸、选区预览颜色、笔刷预览四模式与边缘粗细、绘制中边缘开关、最近颜色显示、固定保存/导出目录、历史记录上限开关与数量。自动恢复的修改同步所有打开工程的调度器。取消不提交，应用保持窗口，确定提交后关闭。

未迁移部分仍保留禁用：多语言、独立字体/图标倍率、主题切换、快捷指令栏、统计与诊断、扩展/脚本与数位板等尚无原生对应完整模块的项，以及动态预设增删、备份、本地历史恢复等独立领域。本批不是旧版全部首选项已迁移的声明。总体历史条数默认不限，仍保留原生既有内存预算；减少上限按旧版先移除最旧的撤销，再移除最远的重做，设置本身不修改工程像素、dirty 或 revision。

检查入口：`editor-preferences-tests` 校验默认、枚举边界、数字限制、配置往返、损坏记录和未接入设置；`preferences-history-tests` 校验裁剪、重做顺序与取消条数上限；`--preferences-runtime-check` 操作实际开关、下拉框与输入框，检查取消、应用、重开、联动禁用、非法颜色拒绝，以及预览颜色实际渲染值。`--preferences-catalog-check` 继续验证所有分类、视口与滚轮。

固定目录的选择文件夹/恢复默认按钮已接入系统文件夹选择器，均只改首选项草稿。当前目录模式为“最近选择的位置”时，固定目录及相关操作禁用。笔刷“颜色+完整轮廓”采用先绘制颜色再叠加轮廓；绘制中的轮廓开关对铅笔与橡皮都生效，选区的自定义颜色不污染笔刷轮廓的自动对比颜色。

## 首选项保存反馈修正

按用户反馈，保存结果使用独立反馈行，内容框与分类视口在反馈行上方保留6px，反馈与底部按钮保留6px；布局、绘制与滚轮共用内容框几何。长提示在行宽内省略，完整原因保留于状态栏。校验错误带具体设置名称，写入错误带具体文件名，不再只显示笼统“保存失败”。

`--preferences-runtime-check --recovery-test-root <test-owned-root>` 可执行真实落盘检查：进程 LOCALAPPDATA 必须指向隔离测试目录，且该目录下 MoonSprite/Native 与 recovery-test-root 一致，存在 test-owned.marker。检查首次保存、覆盖、读取往返、文件独占导致的失败与解除独占后重试；不写入用户首选项。原有未带测试根目录的检查继续跳过磁盘。反馈布局覆盖720×600、1280×960并生成测试截图。实际用户截图的原始失败原因未记录，不能由通用错误文案确定；已验证默认值的真实落盘路径通过。
环境验收补充：隔离目录位于 native/build 时，首次写入、覆盖、拒绝写入与重试均通过；相同检查目录置于实际 LOCALAPPDATA/MoonSprite/Native 下时，CreateFileW 返回 Windows 5。独立 recovery-preferences-tests 在实际用户 Temp 创建测试目录也失败，而 PowerShell 的 .NET/直接 CreateFileW 探针可以写入。说明真实用户目录的运行环境访问差异仍需正常桌面启动确认，不能把工程目录测试成功当作该问题已解决。原子写入失败现保留完整目标临时路径与 Windows 错误码，不更改目录ACL、不自动更换保存目录或覆盖用户数据。
根因及最终修复：正式exe从工程目录继承了 `Mandatory Label/Low Mandatory Level`。进程令牌实测为 S-1-16-4096（Low），PowerShell为 S-1-16-8192（Medium）；低标签程序即使从资源管理器启动也无法写入正常AppData。不是文件格式、路径拼接或Defender拦截。正式exe改为显式Medium后，同一AppData隔离测试首次保存、覆盖、读取、独占文件失败与解除独占重试全部通过。

CMake构建后运行 scripts/ensure-native-app-integrity.ps1，仅给 native/build 下的 moonsprite-native.exe 设置Medium完整性标签。用户拥有的产物可能只授予Modify，因此脚本临时给当前用户添加该文件的WRITE_OWNER来设置标签，并在finally完整恢复原DACL；不提升进程、不修改工程目录标签、不修改用户数据目录权限、不遗留额外授权。重新启动后生效。该操作属于Windows桌面产物交付适配，与旧版PreferencesDialog.persist的用户设置保存语义一致。