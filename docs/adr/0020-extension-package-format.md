# ADR 0020：扩展包使用受限 ZIP、原子安装与 Runtime 安全边界

中文 | [English](0020-extension-package-format.en.md)

状态：接受

## 背景

MoonSprite 需要提供类似 Aseprite 的扩展安装入口，同时允许用户通过资源管理器双击或拖放安装。扩展包来自应用外部，不能把压缩包路径、任意解压路径或扩展代码直接交给 Renderer。

## 决定

- 扩展包使用专属 `.msext` 后缀，内容为 ZIP 容器。
- 包根必须有 `manifest.json`。`schemaVersion: 1` 保留给声明式 Lua 扩展；`schemaVersion: 2` 可声明 Extension Runtime v1。两者都必须提供 `id`、`name` 和 `version`。兼容入口 `entry` 若存在必须是包内相对 `.lua` 文件路径。
- `menuItems[]` 将一组命令插入 `file`、`edit`、`select`、`canvas`、`layer`、`window` 或 `help` 内置菜单的 `start` 或 `end`。`topMenus[]` 新增由 MoonSprite 渲染的顶层菜单，可放在菜单栏 `start`、`end`，或通过 `before:<builtInMenu>` / `after:<builtInMenu>` 相对内置菜单定位。MoonSprite 不保留固定的顶层“扩展”菜单。
- `tools[]` 是宿主拥有实现的交互工具贡献。当前支持通用的 `kind: "remote-pixel-brush"`、`placement: "pencil"`，并允许声明名称、模式、预览色和宿主内置图标标识；启用扩展后工具才会出现在铅笔工具组。该能力使用用户配置的 OpenAI 兼容 Chat Completions API；填写中转站根地址时宿主会尝试 `/chat/completions` 和 `/v1/chat/completions`，将涂抹区域作为像素数据提交，并要求模型优先以 JSON 返回稀疏 `edits`，也兼容完整 RGBA 像素补丁。扩展只声明工具，不注入 React、DOM、CSS、JavaScript，也不直接获得网络或文档写入权限；交互、配置、网络请求和事务提交均由宿主按该能力的固定协议执行。
- `runtime` 声明一个包内 UTF-8 HTML 入口、权限列表和 `资源 ID -> 包内路径` 映射。宿主在无同源权限的 sandbox iframe 中执行入口，并注入版本化 `window.moonsprite` 桥。扩展不能访问 React、Store、Tauri 命令、安装目录或文档内部对象；网络、剪贴板、存储、资源、工程、文档、通知和附属窗口调用都由宿主逐项检查权限。
- Runtime HTML 默认 CSP 禁止直接联网和加载包外脚本。资源只能使用清单中的不透明 ID 读取；单项资源不超过 16 MiB。扩展存储按扩展 ID 隔离，单值不超过 256 KiB，总量不超过 1 MiB。
- `commands[]` 的每项必须且只能声明 `entry`、`runtimeEvent` 或 `opensSettings: true`。前者进入现有 Lua 快照事务，第二种把命令事件发送给常驻 Runtime，第三种打开扩展设置。设置优先使用宿主渲染的 `settingsUi`，可声明复选、数值、文本、选择和命令按钮；组件清单无法表达时才回退到 `settingsEntry` sandbox HTML，两者不能同时存在。`menuItems[]` 可带 `name`，从而在内置菜单中形成扩展自有子菜单。
- `windows` 权限提供通用的主窗口 owned 附属窗口：扩展以资源 ID 打开透明或普通无边框窗口，并可请求拖动、查询或调整主窗口相对边界、关闭、消息传递和透明像素命中区域。宿主不理解窗口中的业务类型、动画状态或提醒语义；停用 Runtime 时关闭该扩展的全部附属窗口。
- 单个扩展最多声明 64 个命令、16 个栏目、32 个现有菜单贡献、16 个新增顶层菜单和 16 个工具贡献；每个栏目或菜单贡献最多引用 32 个命令。各贡献 ID 在自己的命名空间内不允许仅靠大小写区分，所有贡献只能引用同一清单中已声明的命令。
- 平台层在解压前拒绝绝对路径、`..`、反斜线路径、重复路径、符号链接、Windows 保留文件名和无效清单，并限制压缩包大小 50 MiB、文件数 256、解压总量 256 MiB、清单 256 KiB。
- 包先解压到扩展目录下的唯一 staging 文件夹，再以目录重命名替换同 ID 的旧版本。启用状态单独保存在 `.state.json`，替换版本时保留状态；任何失败都清理 staging 并尽量恢复旧目录。
- Tauri 的启动参数、单实例参数和拖放只传递文件路径；Renderer 通过平台 API 请求安装，不能直接读写扩展目录。
- 已启用扩展的声明式命令使用 `extension:<id>:<commandId>`；平台层重新解析已安装清单后才把对应 Lua 文件交给现有受限 Lua 5.4 运行时。兼容 `entry` 使用 `extension:<id>` 并继续显示在“文件 > 脚本”；没有任何 UI 贡献引用的具名命令也回退到该脚本列表，避免旧扩展升级后失去入口。扩展入口不获得文件、网络、进程、包加载或调试库权限，也不能绕过脚本的内存、像素、指令数和运行时间限制。
- `panels[]` 仍只描述由 MoonSprite 渲染的浮动栏目和命令按钮，显隐入口统一位于“窗口 > 栏目”。所有文档写入必须走宿主领域命令，或通过 `commands.execute` 调用包内受限 Lua 命令；画布写入继续经过脚本快照、Store 事务、撤销和目标校验。

## 结果

扩展安装具备明确的文件格式和失败边界。旧 Lua 扩展继续工作，新扩展可以在不修改 MoonSprite 本体的前提下实现常驻逻辑、自有设置和自有窗口。启用、停用、替换或卸载会同步销毁 Runtime、菜单和附属窗口；扩展本地状态不会污染工程 dirty 或撤销历史。

## 替代方案

直接把扩展复制到用户目录或解压到包所在目录无法稳定防止目录穿越、覆盖旧版本和失败残留；使用任意压缩格式也无法与 Windows 文件关联和现有 ZIP 工具链保持一致，因此不采用。
