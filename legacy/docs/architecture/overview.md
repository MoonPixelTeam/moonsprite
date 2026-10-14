# 架构概览

中文 | [English](overview.en.md)

MoonSprite 是以主窗口承载多文档工作台的 Tauri 2 应用。项目分屏和项目浮窗位于工作台内；扩展还可创建受主窗口生命周期约束的原生附属窗口、宿主弹窗或覆盖层。React 渲染工作台，Zustand 管理编辑会话，Canvas 负责像素视图，Rust 提供受控的 Windows 系统能力。

## 依赖方向

```text
React components
      |
      v
Zustand store ----> core algorithms
      |
      v
platform/tauri-api ----> Tauri commands ----> Windows/file system
```

- `core/` 不依赖 React、components、store 或 Tauri；纯算法应使用确定性单元测试覆盖。少数浏览器适配模块封装存储、事件或 Canvas 能力，不能因此让领域算法依赖 UI 或原生命令。
- `store/` 编排会话、历史和核心算法，不直接绘制 UI。
- `components/` 读取状态、收集输入并渲染，不重复核心算法。
- `platform/` 封装所有渲染器 IPC，组件不得直接散落调用 Tauri。
- `src-tauri/` 校验所有来自前端的路径和参数，并返回可展示错误。
- `src-tauri/src/platform_paths.rs` 统一管理随应用目录保存的图库、色板、笔刷、工作区和脚本目录；迁移用户数据位置时只从这里切换。
- `src-tauri/src/platform_clipboard.rs`、`platform_files.rs` 和 `platform_resources.rs` 分别负责系统剪贴板、二进制文件和资源信息；`lib.rs` 只注册命令并协调窗口生命周期。
- `src-tauri/src/platform_scripts.rs` 持有程序根目录脚本发现、路径校验和 Lua 会话线程；`platform_scripts/lua_api.rs` 持有受限 Lua 5.4 VM、Aseprite 兼容对象与通用对话框桥接，`platform_scripts/mse_api.rs` 声明 MoonSprite 专属命名空间、能力表、结构快照查询和类型化操作序列化。平台层只接收脚本文件名、活动目标快照和对话框事件，返回类型化像素、Cel 表面、新图层、新文档或 `mse` 操作批次，不持有或直接修改 Renderer 文档状态。持久对话框回调先以 Renderer 提供的当前同目标像素与结构快照重建 VM 基线；阻塞对话框由 Lua coroutine 挂起并在关闭事件后继续执行。
- `src-tauri/src/platform_extensions.rs` 是 `.msext` 清单校验、资源读取、原子安装、启用状态和卸载的平台边界。schema 1 支持受限 Lua 命令；schema 2 还支持常驻 Runtime、设置和附属窗口。`core/extension-contributions.ts` 映射菜单和栏目贡献，`core/extension-runtime.ts` 定义权限与方法，`components/extensions/ExtensionRuntimeHost.tsx` 编排隔离 iframe 与宿主调用；窗口使用 `ExtensionWindow.tsx` 和 `ExtensionOverlay.tsx`。命令可执行 Lua、发送 Runtime 事件或打开设置，文档写入仍经过 Lua 快照与 Store 事务。扩展只使用已授权的不透明 ID 和桥 API，不获得主界面 DOM、Store、Tauri 或安装路径。

## 当前维护风险状态

- 计划状态：已完成
- 未完成高风险拆分项：0

以上字段对应已登记的边界迁移计划与非零架构债务类别，不表示所有维护性优化已经结束。

- 既有九类边界迁移：已完成；集中度与流程所有权治理：进行中。
- 上轮登记的高风险迁移项：0。这不表示画布主交互、图层时间轴或所有大型命令模块已经完全解耦；当前边界与剩余集中区域见 [编辑器解耦契约](../architecture-decoupling.md)。

前一轮已经拆出多个高风险入口，但审计确认“拆文件”没有彻底解决写入所有权、历史快照、持久化主线程准备和根 Store 膨胀。本轮升级以数据流和职责所有权为单位，完成以下收口：

- 文档写入由 Store 领域命令和文档事务拥有，组件只负责输入与展示。
- 撤销历史使用领域差量，不再压缩完整 `.moonsprite` 工程。
- 保存与恢复按变更资源生成计划，归档准备和压缩移出 UI 线程。
- 工程打开一次只解码一次，首帧合成和缓存复用已解码文档。
- 根 Store 按会话、文档命令、历史、工具、视图、动画、Tilemap、工程 IO 和恢复拆分。
- UI 刷新使用领域 revision 与精确 selector，不用字符串序列化大对象。
- 前端运行时依赖保持无环，检查包含 renderer/shared 跨目录路径；Tauri 访问全部收口到 `platform/`。

架构债务由 `scripts/architecture-debt-budget.json` 按类别登记，当前 9 类常驻护栏预算均为 0。该预算不是文件豁免；任何新债务都会立即失败，后续也不得回升或延期。规则分为 `guard`（常驻护栏，`expiresAt` 必须为 `permanent`）与 `migration`（迁移债务，必须给出到期版本）；规则可声明 `anchor`，一旦该正则在生产源码中不再命中，门禁就要求退役或替换——原 `workspace-root-command` 规则即按此退役，理由记录在同文件的 `retiredRules`。`pnpm check:architecture` 是机器可执行的状态来源。

## 目标模块边界

- 会话状态：文档列表、当前文档、dirty 和生命周期。
- 文档编辑：像素、图层、选区和调整。
- 工具状态：工具、笔刷、颜色、修饰键与指针意图。
- 视图状态：平移、缩放、旋转、网格和预览。
- 文件服务：打开、保存、导入、导出、恢复和最近记录。
- 工作区 UI：栏目、停靠、悬浮、尺寸和布局持久化。

新增功能必须归入其中一个边界；无法归类时先写 ADR，再决定位置。

### 动画扩展边界

`SpriteDocument` 以文档级图层和图层组为轨道，并通过独立动画时间轴保存帧、帧持续时间和 cel 像素。cel 使用稳定的 `layerId` 与 `frameId` 关联；它们不能改变图层组关系和图层栏排序语义。`RasterLayer` 仅作为当前帧的编辑表面，切帧由 `core/animation.ts` 统一同步，组件不得自行替换像素数组。

图层栏的树形区域只接收图层与图层组的身份、父子关系、折叠状态和显示顺序；同一栏目右侧的动画区域读取帧与 cel 槽位。两部分共享垂直行布局，但图层拖拽目标和插入线不得依赖帧数据；切帧时图层树保持稳定。
## 本轮架构落地

- `core/shortcuts.ts` 统一管理快捷键默认值、解析、持久化和键盘事件格式化。界面只负责展示与触发，不再复制快捷键规则。
- `core/file-preferences.ts` 统一管理编辑器首选项的默认值、校验、范围限制和持久化。新增设置必须先进入 `EditorPreferences`，再由界面消费。
- `locales/` 按语言拆分资源，简体中文目录定义完整翻译键集合；`core/localization.ts` 统一管理可用语言、目录注册、类型化翻译键、简体中文回退和变量插值，`components/I18nProvider.tsx` 只负责把持久化语言连接到 React。未完整翻译和验收的语言不得注册为可用语言。
- `core/storage.ts` 是渲染器本地存储的统一安全边界；`core/workspace-layout-preferences.ts` 负责窗口与工作区布局的校验、旧配置兼容和尺寸限制，`App.tsx` 不直接解析持久化数据。
- `platform/app-window.ts` 是窗口尺寸、位置、最大化、多显示器可见性和原生窗口事件的唯一渲染器边界；`App.tsx` 只保存布局并调用平台适配器。
- `core/document-files.ts` 统一文件名、扩展名、保存路径和工程编解码规则；`store/document-file-service.ts` 编排系统对话框与文件读写，`store/recovery-service.ts` 串行化恢复写入和删除。
- `workers/document-decode.worker.ts` 在一次完整解码后先返回文档，再从同一解码结果准备初始合成；`workers/project-encode.worker.ts` 负责预览、清单、稀疏像素、增量复用计划和 ZIP 压缩，主线程只捕获轻量 revision 与存储原点元数据。
- `core/history.ts` 保证撤销栈的内存计数与栈内容同步。撤销或重做失败时，原条目必须保留；视图状态不得进入该历史栈。
- `store/clipboard-service.ts` 封装选区与图层剪贴板的快照、系统图片转换和内部回退。剪贴板是应用级临时状态，不属于任一文档的撤销历史；服务边界必须复制像素数组，避免粘贴或调用方意外改写复制来源。
- `core/canvas-input.ts` 统一画布临时输入状态和可复用手势规则，包括当前拖拽、指针状态、修饰键、缩放级别、轴约束、选区缩放和旋转手柄。`CanvasStage.tsx` 仅编排事件与渲染，后续手势拆分必须复用此处规则。
- `core/canvas-visuals.ts` 统一画布指针、透明棋盘、选区边界预览和预览层的对比色规则；`CanvasStage.tsx` 不再自行决定这些视觉语义。
- `core/animation.ts` 统一单帧兼容、帧持续时间、cel 独立表面、切帧同步、图层轨道对账和播放推进；像素历史通过 `frameId` 定位原 cel，工程格式迁移只在 `project-format.ts` 入口发生。
- `core/panel-layout.ts` 是栏目顺序、默认尺寸、最小尺寸、旧布局兼容和移动排序的唯一入口；`WorkspacePanels.tsx` 只负责将布局状态连接到栏目渲染和停靠交互。
- `core/panel-render-keys.ts` 定义颜色、色板、图层和预览栏目的最小刷新边界。图层栏目仅在图层结构、活动帧、帧参数或播放状态变化时刷新；普通像素编辑、视图平移、缩放和旋转不重建整张帧网格。栏目不得重新订阅整份 Zustand store。
- `core/palette-layout.ts` 统一调色板色块尺寸、颜色比较、标记对比色和多选色块排序规则；`PalettePanel` 只负责 DOM 命中、文件操作与 store 编排。
- `core/layer-operations.ts` 统一图层移动、跨组、组排序、建组与解组的结构变更和可撤销历史；`workspace.ts` 只负责调用命令、维护会话和展示被阻止操作的提示。
- `App.tsx` 只在实际进入对应流程时动态加载 `CanvasStage`、`HomeWorkspace` 和 `ComponentLibrary`，避免首页启动路径预先解析编辑器与组件库代码。动态加载模块必须保留明确的加载边界，不得把核心文档状态放进懒加载组件内部。
- `core/project-format.ts` 通过 `PROJECT_SCHEMA_VERSION` 和 `migrateProjectManifest()` 作为工程格式入口。未知版本拒绝打开，不猜测字段；未来版本迁移只增加独立迁移分支。
- `components/app/useBrushLibrary.ts` 负责编排程序笔刷、项目笔刷和本地笔刷的加载、保存、删除与当前会话同步；`EditorToolOptions.tsx` 消费整理后的笔刷集合和命令。
- `components/app/app-render-keys.ts` 定义菜单、标签、工具栏、工具属性栏、状态栏和应用协调器的最小刷新签名。它属于 UI selector 边界，不反向污染 `core/`；签名不得包含像素数组或整份文档。
- `components/app/DocumentTabs.tsx`、`EditorToolRail.tsx`、`EditorToolOptions.tsx` 和 `EditorStatusBar.tsx` 各自订阅领域签名并拥有自身弹层状态；`EditorCanvasHost.tsx` 是高频会话更新入口，`EditorWorkspaceShell.tsx` 只编排停靠布局。
- `components/canvas-selection-renderer.ts` 负责选区屏幕几何、边界路径缓存和抓手绘制；`components/useCanvasViewPreview.ts` 负责平移、缩放预览及提交；`components/canvas-composite-cache.ts` 负责整图/分块合成缓存和局部失效。
- `store/workspace-state.ts` 按领域组合 Workspace 数据与命令契约；`workspace-session.ts` 管理会话构造和工具设置持久化，`workspace-layer-move.ts` 管理图层拖动预览、取消和单次历史提交，`workspace-palette.ts` 管理调色板选择、排序和历史命令。生产历史路径不再使用完整工程快照。
- Rust 平台命令按领域拆分为 `platform_palette.rs`、`platform_workspaces.rs`、`platform_brushes.rs`、`platform_gallery.rs`、`platform_recovery.rs` 和 `platform_dialogs.rs`；新增系统命令必须进入对应领域模块。
- Lua 脚本由 `store/lua-script-service.ts` 生成像素与 `mse` 结构快照、持有 Renderer 侧目标令牌并校验每次会话返回；初始执行严格匹配原 revision 与表面，持久对话框回调则在确认文档、图层和帧身份未变后，把目标令牌和结构快照重建为当前基线，再严格校验本次返回。局部结果通过 `beginPixelEdit`、`recordPixel` 和 Store `commitPixelEdit` 提交，Cel 图像尺寸/位置替换通过最小前后表面历史提交，`store/lua-script-operations.ts` 把 `mse` 类型化操作逐项分派到现有 Store 领域命令。一个 Lua 事务使用复合历史合并像素与结构写入，任一操作失败时中止复合历史并逆序恢复已经应用的文档修改；新 Sprite、打开/保存/导出、资源导入和栏目布局继续作为明确的文档外操作。`components/LuaScriptDialog.tsx` 只渲染平台返回的通用控件模型并派发事件，不接触文档写入。新增脚本端点必须继续增加受限操作类型和对应 Store 领域命令，不得让 Lua 返回整份可变 `SpriteDocument` 或取得 Store、DOM 与任意 Tauri 命令。

后续拆分大模块时，优先把纯规则提取到无环 `core/` 模块并补测试，再让领域 Store 编排状态，最后由 React 组件接入。禁止把新的持久化 key、格式版本判断、坐标算法或文档写入直接散落到 `App.tsx`、`CanvasStage.tsx` 或面板组件中。

画布偏好与吸管放大镜、图层行拖拽与设置编辑器、应用文字/导出/脚本会话已分别持有自身状态和生命周期；父组件通过值与命令接入。全局快捷键由持有输入状态的路由和六个领域处理器负责；时间轴手势独立拥有预览及取消/提交；连续笔触处理通过坐标读取和重绘接口接入画布。三个主组件的规模对比、验证记录及仍集中的工具与时间轴布局见 [编辑器解耦契约](../architecture-decoupling.md)，当前不宣称巨型组件已消除。

React 性能探针通过 `?moonsprite-perf=1` 启用，普通软件启动不执行 Profiler 测量。应用协调器不响应像素、平移和旋转等高频变化；画布主机、作品预览及实际变化的 UI 领域仍独立更新。后续优化应以区域探针确认的新热点为依据，不得以跳过必要状态更新换取指标。
## 工具设置边界

`core/tool-preferences.ts` 统一管理画笔、油漆桶、程序纹理、魔棒和选区工具设置，包括默认值、旧版本兼容、范围限制和 `localStorage` 存取。`workspace.ts` 只负责把这些设置应用到当前会话，不再负责解释持久化数据。

### 三个 UI 入口的整体拆分

CanvasStage 组装几何、输入、预览和渲染所有者，按下/移动/释放由有序路由进入工具模块。每个创建异步任务的所有者负责取消自己的任务，视口生命周期不再代管笔触或选区资源。渲染总调度器负责顺序，各通道只声明自身输入，门禁禁止通道反向依赖总上下文或根 Store。

LayersPanel 组装图层树、时间轴和菜单所有者；图层/时间轴菜单同时拥有状态、命令和弹窗界面。视觉计算接收只读手势快照，行和单元格视图仅声明所需能力。App 组装文档窗格、工作区布局、偏好、窗口和文档 IO 生命周期，信息/文档/设置弹窗跟随对应状态所有者。入口函数仍有显式接线和 JSX，详细规模、验证与尚存的集中区域见 [编辑器解耦契约](../architecture-decoupling.md)。
