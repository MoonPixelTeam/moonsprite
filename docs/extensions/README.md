# MoonSprite 扩展开发

中文 | [English](README.en.md)

MoonSprite 扩展使用 `.msext` 后缀，文件内容是 ZIP 容器。包根必须包含 `manifest.json`，所有入口与资源都必须位于包内。扩展不能依赖安装目录的绝对路径，也不能直接导入 MoonSprite 的 React、Store 或 Tauri 模块。

## 选择扩展模型

- `schemaVersion: 1`：声明式 Lua 扩展。适合可撤销的文档命令、菜单和命令栏目；Lua API 见 [Lua 脚本与 MSE API](../scripting/README.md)。
- `schemaVersion: 2`：在兼容 Lua 命令的基础上，可增加 Extension Runtime v1、宿主组件设置和自有附属窗口。声明 `runtime` 时必须同时声明 `apiVersion: "1.0.0"`。

`commands[]`、`panels[]`、`menuItems[]` 和 `topMenus[]` 两个版本均可使用；`settingsUi` 和 `runtime` 仅支持 schema 2。`settingsEntry` 是两者都可使用的受限 HTML 设置页。

## 包结构

```text
example.msext
├─ manifest.json
├─ runtime/index.html
├─ settings/index.html
├─ commands/apply.lua
├─ ui/overlay.html
└─ assets/overlay.png
```

入口 HTML 必须自包含。默认 CSP 不允许直接加载包内相对脚本、外部脚本或外部图片；二进制资源应在 `runtime.resources` 中声明，再通过不透明资源 ID 读取。资源路径使用 `/`，不能包含绝对路径、`..`、反斜线、符号链接或 Windows 保留文件名。

## 清单字段

### 基本字段

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `schemaVersion` | 是 | 当前支持 `1` 或 `2`。 |
| `id` | 是 | 最多 80 字节；只允许字母、数字、点、短横线和下划线。发布后应保持稳定。 |
| `name` | 是 | 用户可见名称。 |
| `version` | 是 | 扩展版本字符串。 |
| `description`、`author` | 否 | 安装与管理界面显示的信息。 |
| `apiVersion` | Runtime 必需 | 当前只能是 `"1.0.0"`。 |
| `entry` | 否 | 兼容的单一 Lua 入口。 |
| `settingsEntry` | 否 | 自包含 sandbox HTML 设置页；不能与 `settingsUi` 同时声明。 |
| `settingsUi` | 否 | schema 2 的宿主组件设置。 |
| `runtime` | 否 | schema 2 的常驻 Runtime、权限和资源映射。 |

### 贡献点

- `commands[]`：每项必须且只能选择 `entry`、`runtimeEvent` 或 `opensSettings: true` 之一。
- `panels[]`：宿主渲染的命令栏目，通过“窗口 > 栏目”切换；`defaultVisible` 默认为 `false`。
- `menuItems[]`：插入 `file`、`edit`、`select`、`canvas`、`layer`、`window` 或 `help`；`position` 为 `start` 或 `end`。提供 `name` 时创建子菜单，否则直接插入命令。
- `topMenus[]`：新增宿主渲染的顶层菜单；`position` 可为 `start`、`end`、`before:<内置菜单>` 或 `after:<内置菜单>`。

贡献 ID 在各自命名空间内不允许仅靠大小写区分。`commands` 引用必须使用清单中命令 ID 的准确大小写。

## 宿主界面与自定义 HTML

菜单、栏目和 `settingsUi` 由 MoonSprite 组件库渲染，自动跟随主题和交互规范。扩展只能声明支持的组件，不能取得 React 组件实例。需要自定义画布、媒体或透明动画时，使用 Runtime 打开的扩展窗口 HTML；只有组件清单无法表达设置界面时才使用 `settingsEntry`。

## 限制与兼容性

- 压缩包不超过 50 MiB、文件数不超过 256、解压总量不超过 256 MiB、`manifest.json` 不超过 256 KiB。
- Runtime 入口不超过 1 MiB，设置入口不超过 512 KiB；最多 64 个 Runtime 资源，单项不超过 16 MiB。
- 最多 64 个命令、16 个栏目、32 个内置菜单贡献、16 个顶层菜单和 64 个设置控件；单个栏目或菜单最多引用 32 个命令。
- schema 2 Runtime 不能在尚未实现 Runtime v1 的旧版 MoonSprite 中运行。扩展应在启动后调用 `runtime.getCapabilities()`，不要仅根据清单假定方法存在。
- 任意文档像素或结构写入仍应通过包内 Lua 命令完成，以获得事务、撤销、目标校验和失败回滚。

## 安装与生命周期

MoonSprite 会先校验并解压到 staging 目录，再原子替换同 ID 版本。更新扩展时保留启用状态。只有已启用扩展会贡献 Runtime、菜单与栏目；停用、替换或卸载会销毁 Runtime，并关闭该扩展创建的附属窗口。扩展存储按扩展 ID 隔离，不写入工程文件、dirty 状态或撤销历史。

## 继续阅读

- [Extension Runtime v1](runtime-api.md)：权限、调用、事件、设置页与窗口桥。
- [Lua 脚本与 MSE API](../scripting/README.md)：Lua 命令、事务和脚本能力。
- [扩展包格式 ADR](../adr/0020-extension-package-format.md)：安装、安全和架构决策。
