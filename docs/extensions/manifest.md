# 扩展清单参考

中文 | [English](manifest.en.md)

本文以当前 [安装校验器](../../src-tauri/src/platform_extensions.rs) 的原始 JSON 为准。安装后返回的 `StoredExtension` 是宿主加工结果，不能直接复制成清单。入口和入门示例见 [扩展开发](README.md)、[快速开始](quickstart.md)。

## 根对象

根对象拒绝未知字段。下表包含全部根字段；省略的贡献数组默认为 `[]`，可选说明文字默认为空串。

| 字段 | 类型、默认值与约束 |
| --- | --- |
| `schemaVersion` | 必填整数，`1` 或 `2`。 |
| `id` | 必填 ID，发布后保持稳定；也是更新身份和存储命名空间。 |
| `name` | 必填非空文字，最多 160 UTF-8 字节。 |
| `version` | 必填非空文字，最多 80 字节；当前校验器不强制语义化版本格式。 |
| `description` | 可选文字，最多 4096 字节。 |
| `author` | 可选文字，最多 160 字节。 |
| `apiVersion` | 可选非空字符串，最多 80 字节；声明 `runtime` 时必须为 `"1.0.0"`。与扩展自身 `version`、Lua `mse.apiVersion` 无关。 |
| `entry` | 可选 `.lua` 包内路径；旧式单一脚本入口，显示于“文件 > 脚本”，不是自动启动钩子。 |
| `settingsEntry` | 可选 `.html` / `.htm` 包内路径，支持 schema 1/2；与 `settingsUi` 互斥。 |
| `settingsUi` | 可选宿主设置对象，仅 schema 2，见下文。 |
| `runtime` | 可选常驻 Runtime 对象，仅 schema 2，见下文。 |
| `commands` | 命令对象数组，最多 64 个。 |
| `panels` | 命令栏目对象数组，最多 16 个。 |
| `menuItems` | 内置菜单贡献数组，最多 32 个。 |
| `topMenus` | 顶层菜单贡献数组，最多 16 个。 |

ID 必须为 1–80 字节 ASCII 字母、数字、`.`、`-`、`_`；不能以点开头/结尾，也不能包含 `..`。同类贡献、控件、资源的 ID 不允许仅大小写不同；引用时须精确匹配大小写。文字字段禁止控制字符，必填文字不能全为空白。长度未注明“字符”时均为 UTF-8 字节。

## Runtime 对象

| 字段 | 说明 |
| --- | --- |
| `entry` | 必填，自包含 UTF-8 `.html` / `.htm`，最多 1 MiB。 |
| `permissions` | 字符串数组，必须包含 `runtime`；只能使用 [Runtime 权限表](runtime-api.md) 中的名称，不得重复。 |
| `resources` | 可选 `{ "资源ID": "包内相对路径" }`，默认 `{}`；最多 64 项，每项最多 16 MiB。资源不能指向 `manifest.json` 或 Runtime 入口本身。 |

窗口资源本身为 HTML，但映射也可包含 PNG 等二进制文件。HTML 中的相对 URL 不会变成可访问的包路径：内联脚本和样式，使用 `resources.read` 读取声明资源，再生成 `Blob` 或 data URL；不用时释放 Blob URL。读取资源及打开窗口资源应声明 `resources`，打开窗口还需 `windows`。

## 命令与界面贡献

| 对象 | 必填字段 | 可选字段与默认值 |
| --- | --- | --- |
| `commands[]` | `id`, `name`，以及下列一种处理方式 | `description: ""`。 |
| `panels[]` | `id`, `name` | `description: ""`, `defaultVisible: false`, `commands: []`；最多引用 32 个命令。 |
| `menuItems[]` | `id`, `menu`, `commands` | `name`, `description`, `position: "end"`。 |
| `topMenus[]` | `id`, `name`, `commands` | `description: ""`, `position: "end"`。 |

命令的三种处理方式必须且只能选一项：

| 字段 | 约束 |
| --- | --- |
| `entry` | `.lua` 包内文件；在点击/调用时运行。 |
| `runtimeEvent` | ID 格式字符串；必须存在 Runtime 且有 `commands` 权限，作为 `command` 事件的 `event` 字段发送。 |
| `opensSettings: true` | 必须已声明 `settingsUi` 或 `settingsEntry`；`false` 不算处理方式。 |

`name`/`description` 沿用根对象文字长度限制。`commands` 引用本包已声明命令，不得重复；每个 `menuItems` / `topMenus` 必须引用 1–32 个命令，即使准备通过 `menus.setItems` 填充动态项，也不能写空列表。

`menu` 支持 `file`、`edit`、`select`、`canvas`、`layer`、`window`、`help`。内置菜单 `position` 仅为 `start` / `end`；顶层菜单还支持 `before:<menu>` / `after:<menu>`。`menuItems.name` 省略时直接插入命令，提供时显示子菜单。栏目是宿主渲染的命令按钮列表，不是自定义 HTML 停靠视图。没有被栏目或菜单引用的 Lua 命令可从脚本列表访问。

## 宿主组件设置

`settingsUi` 为 `{ storageKey, controls }`。`storageKey` 必填且符合 ID 规则；`controls` 默认为 `[]`、最多 64 项。宿主按控件 ID 读取同一个存储对象，合并默认值、校验类型；修改/重置后写回，并向有 `storage` 权限的 Runtime 发送 `settings-changed`。按钮不产生存储字段。

每个控件必填 `id`、`type`、非空 `label`；可选 `description: ""`、`visibleWhen: { otherCheckboxId: boolean }`。显示条件只能引用其他 checkbox，全部成立时显示；隐藏不会清空值。`label` 最多 160 字节，`description` 最多 4096 字节。

| `type` | 字段与约束 |
| --- | --- |
| `checkbox` | 必填布尔 `defaultValue`。 |
| `number` | 必填数值 `defaultValue`；可选有限数 `min`、`max`、正数 `step`、文字 `suffix`；`min <= max` 且默认值在范围内。 |
| `text` | 必填字符串 `defaultValue`；可选 `placeholder`、`maxLength`（默认 1024，范围 1–4096 个字符）；默认值不得超长。 |
| `select` | 必填字符串 `defaultValue`；`options` 为 1–64 个 `{ value, label, description? }`；value/label 必填非空且最多 160 字节，value 不得仅大小写不同，默认值须精确匹配某个 value。 |
| `button` | 必填 `commandId`，只能引用本包 Runtime 命令；`variant` 为 `primary` / `secondary` / `danger`，默认 `secondary`；`closeOnRun: false`；仅按钮支持 `fullWidth`。无需 `defaultValue`。 |

`suffix` / `placeholder` 最多 160 字节。声明式设置与 [宿主动态表单](ui-form.md) 是不同协议，例如设置文本使用 `text`，动态表单使用 `input`；不能交叉使用字段。

## 文件和打包限制

- ZIP 根直接放 `manifest.json`，不能再包一层目录。包最大 50 MiB，最多 256 项，解压合计最大 256 MiB，清单最大 256 KiB。
- 设置入口最大 512 KiB；Runtime/资源限制见上文。Lua 入口还受脚本运行预算约束。
- 包内相对路径最多 240 字节，以 `/` 分隔；禁止绝对路径、反斜线、`~` 开头、空分段、`.`、`..`、控制字符、Windows 保留名及末尾空格/点。符号链接不接受。
- 不存在的入口、重复命令引用、未知权限、错误版本或越限资源会使安装校验失败；修正清单后重新打包。

## 维护依据

清单行为由 [platform_extensions.rs](../../src-tauri/src/platform_extensions.rs) 验证；设置运行行为由 [ExtensionSettingsDialog.tsx](../../src/renderer/src/components/dialogs/ExtensionSettingsDialog.tsx) 实现。贡献安装结构见 [types-extensions.ts](../../src/shared/types-extensions.ts)，该类型不能替代原始清单规范。

可选 `translations` 为语言代码到“原始展示文本 → 翻译”字典的映射。宿主翻译名称、描述、标签、后缀和占位提示，不修改 ID 或设置值。最多 64 种语言、每种 512 条，仍受清单大小限制。
