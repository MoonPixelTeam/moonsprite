# 2026-11-16 用户指定移除功能

直接依据用户要求：“删除功能：本地历史记录、视图拖拽灵敏度、自定义工具栏（如果还没迁移则不迁移这几个）”。本次只调整这三项，不进行性能优化。

## 范围与实现

| 功能 | 移除前原生状态 | 处理 |
| --- | --- | --- |
| 本地历史记录 | 独立离线服务与证据测试已迁移；未接入正式 Editor 会话，设置行不可用 | 删除启用／保留数量设置行；解除正式应用对 `moon-local-history` 的依赖；不再迁移重开恢复编辑栈、记录／加载等会话入口 |
| 视图拖拽灵敏度 | 已接入主画布、预览面板、参考图面板与浮窗 | 删除设置行与倍率消费者、面板可调成员；直接使用指针位移，维持默认 1×，保留原有显示缩放与旋转转换 |
| 自定义工具栏 | 仅有不可用的“自定义工具栏…”设置行，内容／分组编辑器未迁移 | 删除设置行；停止迁移内容与分组编辑器 |

普通撤销／重做、历史面板、自动恢复、工程备份、标准工具栏、工具分组弹出、工具栏四方向位置、工作区预设和快捷命令栏继续保留。不扫描、删除或改写已有用户历史文件。已迁移的离线本地历史编解码／回放兼容代码与测试留作历史证据；普通 Document 栈中的终端回放分支保留，本次不将其当成应用功能入口。

旧原生偏好中的四个键 `editing.viewDragSensitivity.Select`、`undo.localHistoryEnabled`、`undo.localHistoryLimit.Number`、`tools.toolRail` 在读取时忽略，写出时过滤，直接访问或设置时报未知／移除设置；其他未知未来记录仍按原行为保留。普通撤销步数设置继续有效。

## 旧版证据与适配依据

- `legacy/src/renderer/src/components/dialogs/PreferencesDialog.tsx`：视图拖拽倍率、本地历史开关与步数、`ToolRailLayoutDialog` 入口。
- `legacy/src/renderer/src/core/file-preferences.ts`：拖拽默认 1、本地历史默认关闭、50 步及持久化。
- 原生现有消费者：`editor_input.cpp`、`editor_refresh.cpp`、`editor_reference.cpp`、`preview_panel.cpp`、`reference_image_panel.h`。
- 本次可观察差异由用户直接指定，覆盖原来的全部迁移要求；原始 legacy、静态入口清单、历史验证记录保持原样。

## 验证

设置目录检查通过：356 行、14 类、95 个保留静态标签；明确检查四个已删除 ID 不得重新出现。旧配置过滤、普通撤销配置保留与无关未来设置保留的偏好回归通过。

唯一正式 Release 构建退出 0，产物为 `native/build/Release/moonsprite-native.exe`，本地时间 2026-11-16 17:26:41，31,001,600 字节，SHA-256 `559750D2B70F4811A17D1BEB503AA69CBCBF5756FEFB32FBFDD10DF262D2A462`。构建记录为 `native/build/feature-removal-build-20261116.log`，未提交构建生成物。

五项定向 CTest 一轮通过：document-transactions、editor-preferences、reference-images、preview-panel、history-commands，合计 0.70 秒。正式设置页 preferences-catalog 通过（2.05 秒）；正式程序 `--preferences-runtime-check`、`--preview-panel-check`、`--reference-panel-check` 均退出 0，覆盖偏好草稿／应用／取消、预览面板及参考图面板／浮窗。这些是自动运行检查，不等同于新增人工图像验收或全部拖动场景验收。

来源覆盖 1025 项和既有证据摘要核对通过；Editor 边界 611 个源码、架构边界 611 个源码／279 个目标通过；需求静态检查 57 条需求、756 个入口候选、671 条原始证据通过。全局迁移仍 INCOMPLETE，来源 strict 检查仍须因已知迁移缺口失败；本次功能移除不表示其余迁移已完成。上一阶段未完成的画布参考图改动保存在独立 Git stash，未混入本次提交；既有用户文件和历史数据保留。
