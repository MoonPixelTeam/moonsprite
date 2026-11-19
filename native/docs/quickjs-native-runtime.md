# QuickJS 原生扩展执行

2026-11-19 用户明确决定“采用 QuickJS＋原生界面映射”，解除此前执行器路线待决定项。仍遵循禁止 WebView2、功能必须有实际承接证据的规则。

## 本阶段范围

固定 QuickJS-ng 0.11.0，MIT 许可及归档SHA-256见 THIRD_PARTY.md，依赖由 bootstrap-quickjs.ps1 校验。每个扩展独立runtime/context，核心不加载libc/OS模块。直接复用 ExtensionRuntimeHost.tsx runtimeBootstrap，不重写API/Promise协议；保留256请求/300秒超时。原生队列传递请求/响应/事件，storage.set保留执行器JSON.stringify的精确字符串，继续由SessionHost执行身份、权限、存储配额、资源声明和代次检查。异步network响应沿用现有worker与取消。

原生兼容层提供window自身、Event/CustomEvent、事件监听、parent消息、函数定时器和console；Promise/microtask/JSON/Map/Set/TypedArray由真实QuickJS执行。没有伪造DOM、Canvas或媒体实现。提取自包含HTML的内联classic/module脚本，跳过CSP禁止的src脚本和非JS数据脚本；注释、带引号属性及raw-text元素不执行内嵌伪script。模块不能导入外部/本地模块。

正式编辑器使用现有发现快照启动/替换/停用VM，绑定现有菜单/设置会话，实际runtime命令可调用原生工作区/颜色/存储/资源/剪贴板/通知/网络/日志服务。原有30ms脚本pump消费任务；空闲不扫描目录。每次新发现核对入口mtime，禁用/删除清理session；相同签名失败不盲重试。已有project/clock订阅复用。

## 必要适配与限制

浏览器原先运行在独立iframe；原生每VM64MiB堆/512KiB栈，每次入口100ms、事件20ms中断，任务泵使用调用方时间预算，超时停止会话并清理宿主。不是旧版无期限脚本的时序等价保证。队列最大512项/出站20MiB、定时器最多4096，防止UI线程无界积压；消息大JSON解析/序列化仍同步。定时器仅接受函数，不执行字符串代码。

原生 `dialog + component:form` 已接通独立 QuickJS 逻辑页与既有 FormWindow/WindowRouter，见下节。HTML设置页、DOM/Canvas/媒体、覆盖层和非form附属窗口仍未迁移，不能把API方法名可查询当作窗口已能显示。editor-event各类详细订阅、输入事件、色样事件、导出事件、非默认语言变更和文件拖放入口仍需正式接线；核心会话已有对应协议。入口文件读取与初始64MiB内存准入仍在UI启动阶段，不作全链路无阻塞声明。

## 验收

真实QuickJS+旧引导脚本+SessionHost夹具已验证Promise/Unicode/极小双精度/安全整数存储、权限拒绝、隔离、预加载与持续命令回调、locale/files事件、定时器、任务以及死循环中断。最终 Release 构建成功；正式主题/指针下 --script-entry-check 实际退出0，覆盖真实发现/activate、菜单命令落盘、停用/重启。文档与源码覆盖不等于全部迁移完成。

## 原生表单窗口接线

直接复用 ExtensionWindow.tsx 的窗口 bootstrap，仅删除隐藏逻辑页不适用的 DOM 主题/指针钩子；保留 window.id、Promise 请求和 onMessage 参数习惯，不能用 runtime 的单对象参数API替代。每个表单另建隔离VM，native presenter复用已有 FormWindow 控件、FormState 全视图/action/values/requestId往返、忙碌、文件/图片/嵌套弹窗及重试。UI动作排队，不在控件回调内执行JS或销毁窗口。资源声明、扩展身份、存储配额和精确 JSON 字符串仍由既有原生模块处理；窗口桥 storage/resources 与 Runtime 权限入口保持旧版区别。

宿主管理尺寸，根窗口按旧版560×600默认值与统一原生缩放实现，复用ModalGeometryPreferences按扩展和窗口ID持久化，嵌套弹窗复用现有记忆。窗口主动ui-state、原生输入与按钮、JS确认后清草稿/解忙碌、Runtime双向消息、重试模型重置、JS关闭和禁用清理均有定向真实VM夹具。assets API已接入下面的独立持久化事务；非form/overlay明确报未迁移，不显示近似HTML。

## 窗口素材持久化

窗口桥 assets.get/set/remove 复用旧版参数和校验：键非空、无控制字符、UTF-8最多160字节；value必须字符串，UTF-8单素材最多8 MiB、每扩展最多64 MiB，替换排除原记录。Windows系统 winsqlite3 提供事务存储，独立 extension-assets.sqlite 与配置存储分开；BLOB保留UTF-16，包括未配对代理项和NUL，配额采用旧版TextEncoder替换规则计数。BEGIN IMMEDIATE 将元数据配额查询与写入放在同一事务；超额/写入失败回滚，跨窗口/连接共用数据库事务。不把所有素材读入内存后重写配置文件。

异步Promise/FIFO worker承接IndexedDB异步执行，数据库创建/读写/锁等待不在UI线程；关闭或重试丢弃陈旧回复，已交给事务的写入可完成，与旧页关闭后数据库事务独立一致。无libc/文件系统API向扩展开放。为合法8 MiB字符串的JSON转义留空间，窗口VM上限256 MiB、窗口出入站队列128 MiB；Runtime VM仍64 MiB/20 MiB。worker总待处理256 MiB/512项、每页256个素材请求为明确原生准入边界，单个脚本100/20ms及任务预算仍适用，不作无限时序等价声明。
