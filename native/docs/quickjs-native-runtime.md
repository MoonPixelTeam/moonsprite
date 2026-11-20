# QuickJS 原生扩展执行

2026-11-19 用户明确决定“采用 QuickJS＋原生界面映射”，解除此前执行器路线待决定项。仍遵循禁止 WebView2、功能必须有实际承接证据的规则。

2026-11-20 用户进一步明确：界面以 Aseprite 式宿主 API 复用软件原生组件；旧 HTML 仅作功能与脚本来源，不建设通用 HTML/DOM/Canvas/媒体浏览器环境。设置字段、窗口动作或绘制需求按实际功能映射为原生控件/API，见[范围决定](scope-decisions-20261120.md)。

## 本阶段范围

固定 QuickJS-ng 0.11.0，MIT 许可及归档SHA-256见 THIRD_PARTY.md，依赖由 bootstrap-quickjs.ps1 校验。每个扩展独立runtime/context，核心不加载libc/OS模块。直接复用 ExtensionRuntimeHost.tsx runtimeBootstrap，不重写API/Promise协议；保留256请求/300秒超时。原生队列传递请求/响应/事件，storage.set保留执行器JSON.stringify的精确字符串，继续由SessionHost执行身份、权限、存储配额、资源声明和代次检查。异步network响应沿用现有worker与取消。

原生兼容层提供window自身、Event/CustomEvent、事件监听、parent消息、函数定时器和console；Promise/microtask/JSON/Map/Set/TypedArray由真实QuickJS执行。没有伪造DOM、Canvas或媒体实现。提取自包含HTML的内联classic/module脚本，跳过CSP禁止的src脚本和非JS数据脚本；注释、带引号属性及raw-text元素不执行内嵌伪script。模块不能导入外部/本地模块。

正式编辑器使用现有发现快照启动/替换/停用VM，绑定现有菜单/设置会话，实际runtime命令可调用原生工作区/颜色/存储/资源/剪贴板/通知/网络/日志服务。原有30ms脚本pump消费任务；空闲不扫描目录。每次新发现核对入口mtime，禁用/删除清理session；相同签名失败不盲重试。已有project/clock订阅复用。

## 必要适配与限制

浏览器原先运行在独立iframe；原生每VM64MiB堆/512KiB栈，每次入口100ms、事件20ms中断，任务泵使用调用方时间预算，超时停止会话并清理宿主。不是旧版无期限脚本的时序等价保证。队列最大512项/出站20MiB、定时器最多4096，防止UI线程无界积压；消息大JSON解析/序列化仍同步。定时器仅接受函数，不执行字符串代码。

原生 `dialog + component:form` 已接通独立 QuickJS 逻辑页与既有 FormWindow/WindowRouter，见下节。旧设置页的实际配置功能、覆盖层和非form窗口需按具体原生控件/API需求继续核对；通用HTML/DOM/浏览器环境不是迁移目标，不能把API方法名可查询当作窗口已能显示。状态差分 editor-event、输入捕获、30秒时钟和语言变更已接通。drawing/fill、画布采样结束和导出成功通知已接入实际完成分支；其他面板采样完成通知仍待接线；文件拖入已接通下面的原生入口；核心会话已有对应协议。入口文件读取与初始64MiB内存准入仍在UI启动阶段，不作全链路无阻塞声明。

## 验收

真实QuickJS+旧引导脚本+SessionHost夹具已验证Promise/Unicode/极小双精度/安全整数存储、权限拒绝、隔离、预加载与持续命令回调、locale/files事件、定时器、任务以及死循环中断。最终 Release 构建成功；正式主题/指针下 --script-entry-check 实际退出0，覆盖真实发现/activate、菜单命令落盘、停用/重启。文档与源码覆盖不等于全部迁移完成。

## 原生表单窗口接线

直接复用 ExtensionWindow.tsx 的窗口 bootstrap，仅删除隐藏逻辑页不适用的 DOM 主题/指针钩子；保留 window.id、Promise 请求和 onMessage 参数习惯，不能用 runtime 的单对象参数API替代。每个表单另建隔离VM，native presenter复用已有 FormWindow 控件、FormState 全视图/action/values/requestId往返、忙碌、文件/图片/嵌套弹窗及重试。UI动作排队，不在控件回调内执行JS或销毁窗口。资源声明、扩展身份、存储配额和精确 JSON 字符串仍由既有原生模块处理；窗口桥 storage/resources 与 Runtime 权限入口保持旧版区别。

宿主管理尺寸，根窗口按旧版560×600默认值与统一原生缩放实现，复用ModalGeometryPreferences按扩展和窗口ID持久化，嵌套弹窗复用现有记忆。窗口主动ui-state、原生输入与按钮、JS确认后清草稿/解忙碌、Runtime双向消息、重试模型重置、JS关闭和禁用清理均有定向真实VM夹具。assets API已接入下面的独立持久化事务；现有非form/overlay入口仍明确报未迁移，后续仅按实际功能补宿主原生能力，不显示近似HTML。

## 窗口素材持久化

窗口桥 assets.get/set/remove 复用旧版参数和校验：键非空、无控制字符、UTF-8最多160字节；value必须字符串，UTF-8单素材最多8 MiB、每扩展最多64 MiB，替换排除原记录。Windows系统 winsqlite3 提供事务存储，独立 extension-assets.sqlite 与配置存储分开；BLOB保留UTF-16，包括未配对代理项和NUL，配额采用旧版TextEncoder替换规则计数。BEGIN IMMEDIATE 将元数据配额查询与写入放在同一事务；超额/写入失败回滚，跨窗口/连接共用数据库事务。不把所有素材读入内存后重写配置文件。

异步Promise/FIFO worker承接IndexedDB异步执行，数据库创建/读写/锁等待不在UI线程；关闭或重试丢弃陈旧回复，已交给事务的写入可完成，与旧页关闭后数据库事务独立一致。无libc/文件系统API向扩展开放。为合法8 MiB字符串的JSON转义留空间，窗口VM上限256 MiB、窗口出入站队列128 MiB；Runtime VM仍64 MiB/20 MiB。worker总待处理256 MiB/512项、每页256个素材请求为明确原生准入边界，单个脚本100/20ms及任务预算仍适用，不作无限时序等价声明。

## 正式编辑器状态与输入观察

已有 SessionHost/EditorEventSubscription 直接连接正式Editor。订阅建立时捕获当前小型标量快照，仅有活动events订阅时refresh及脚本泵观察全部活动/非活动会话；无订阅时不构造工程快照。扩展发现发布时单次取基线，沿用workspace-extension-events.ts顺序比较工程、内容版本、工具类别、图层、帧、播放、选择身份、颜色及视图。SelectionMask由Document selectionRevision承接对象替换身份，不复制蒙版；文件路径仅用于opened布尔值，不发送路径。工具子类型归入旧版ToolId类别。视图比较对应原生已有zoom/pan/rotation/mirror/grid/iso/luminance/repeat/selection显示字段，原生尚无字段不伪造事件。

UI message filter承接全窗口pointerdown/move/wheel和keydown捕获，在原生控件处理前只排队事件；指针复用500ms门限，键盘逐次发送，销毁时移除filter。每扩展从订阅建立开始30秒一次clock，迟到仅发一次、不追赶；修正此前每次30ms脚本泵误发clock的问题。语言从现有preferences catalog索引映射zh-CN/en-US/ja-JP/ko-KR/fr-FR/de-DE/es-ES/pt-BR/ru-RU，首次加载与后续变化共用既有locale协议。

## 正式文件拖入

复用 extension-file-drop.ts 与既有 FileDropRouter：只接受声明后缀（io权限）、优先第一个注册者、只向扩展发送 basename 和 bytes。Editor DropMessage 在笔刷库/GIF时间线/普通文档之前认领扩展文件，复用既有路径归一化，统一一次每批去重和1秒重复事件去重；未注册未知路径过滤。未匹配文件保持顺序与原位置回流原生路由，不再次命中扩展或重复去重。匹配文件即使读取失败/超过12 MiB也被认领，不误开为文档。

使用既有 FormFileReadTask 后台队列逐项读取，每64 KiB检查取消与12 MiB上限，读取后用原注册对象身份再次核验。扩展停用/重注册使旧读取不再投递。Editor保存/其他弹窗期间扩展存储、网络和文件读取泵仍运行；正常文档入口继续由原有忙碌守卫管理。UI widget property持有会话回调，停止时失效，陈旧异步回流不访问已销毁Editor。

files-dropped入站保持原始二进制，按每次泵的时间预算直接向QuickJS构造普通number[]，完成前不向JS发布，保留旧 Array.from(Uint8Array) 与 structured clone 可观察数据类型、属性和字节；不经WinRT逐字节JSON数组和大字符串解析。支持真实12 MiB边界；收到文件时此VM堆上限调整至512 MiB以容纳普通JS数组，待构造二进制队列64 MiB。异步读取在之前二进制事件未发布完毕时等待，合法连续投递不会因该队列上限被丢弃。上限与延后构造是禁止浏览器后必要的原生适配，未暴露任意路径读取API。

## 历史与保存操作通知

正式 requestHistoryAction/applyHistoryAction 在真实历史位置变化后发送 history.undo/history.redo，空历史、原位置跳转和局部预览/浮动取消不发送。历史面板跳转继续使用已有setHistoryPosition回放，再按经过条目数发送对应事件，承接旧版setHistoryPosition逐次undo/redo的通知计数；不替换历史或性能实现。

前台/后台保存统一 completeSaveJob 在文件写入结果被接受后发送 document.saved editor-event，projectId使用保存所属工程身份，detail.fullySaved使用既有exact版本校验结果。较旧快照已写入但当前又有修改时发送false，失败/取消/只点击保存而无写入完成不发送。这与既有dirty转clean触发的document-saved事件是旧版两种独立协议。验收使用正式异步磁盘保存及实际写入后接收的旧快照分支。

## 绘制、填充、画布采样和导出通知（2026-11-20）

继续上次中断的接线。复用 workspace-recording.ts 的 stroke 成功分支，普通笔画、Shift 连线、自由瓦片源连线、喷枪、平滑和液化在真实提交后发送 drawing.completed，并保留工具类别 detail.tool。桶填充及前景/背景填充命令沿用旧版独立 fill.completed 分支；未修改和取消不发送。普通形状和渐变不据工具名称额外推断 stroke。

ExtensionRuntimeHost.tsx 监听的是采样 completed，而非每次 sampled。原生画布采样释放发送一次 color.sampled，跨画布 intent 点击直接完成；重复 finish、Escape 和失焦取消不发送，颜色更新继续复用已有逻辑。参考图、颜色/调色板面板的其他采样完成入口尚未覆盖，不将这批画布接线标记为全部采样迁移完成。

export-complete 沿用成功写入分支，覆盖静态图、动画、帧序列、图层/切片批量、精灵表文件、ASE/PSD 与脚本导出；取消和失败不发送。批量在捕获开始时记住源工程身份，脚本及 ASE/PSD 使用原有导出源身份；format 保留 png-auto/png-rgba/png-sprite-sheet 等旧版协议值。验收：正式 Release 构建成功；--script-entry-check --operation-events-only 和完整 --script-entry-check 均实际退出 0，覆盖真实 QuickJS 表单、事件落盘、普通笔画成功/无变化/取消、桶填充及前景填充、画布采样释放/重复结束/Escape、帧序列导出成功与取消、扩展停用及关闭生命周期。Ctest 的 extension-event-lifecycle、extension-runtime、extension-js、batch-export-task 四项通过。来源覆盖与架构边界检查另行通过；未逐一运行所有工具、导出格式或其他面板采样，不将接线覆盖解释为全功能迁移或完整界面图像验收。

关闭生命周期核对：通知定向用例保留吸管意图到真实编辑器关闭，暴露 LegacyCursors 先于 Desktop/Editor 析构、采样注销又刷新光标的失效引用。Editor 析构入口先解除 refreshCursor_，再按旧顺序清理采样与窗口；不改变运行中的采样/命中行为。
