# 会话状态归属与剩余收敛范围

状态：2026-11-12。本文补充[耦合审计 C02／C06](code-coupling-audit-2026-11-12.md)，记录当前源码的所有权及完成所需证据，不宣称 Legacy 全功能等价。

## 已建立的边界

`projects_` 与 `activeSession_` 选择稳定的 `ProjectSession`。Document、path、RecoverySession 和 ProjectViewState 由会话唯一持有。`currentDocument()`、`currentPath()`、`currentRecovery()`、`currentView()` 访问所属对象。非活动文档的保存／恢复必须按请求身份解析对应会话，不能临时替换活动指针执行。

| 状态 | 当前存储与入口 | 已有证据与限制 |
| --- | --- | --- |
| Document／path／RecoverySession | ProjectSession；按 identity 解析 | 既有多文档、保存／关闭与脚本回归通过；不在切换时移动对象 |
| canvas／zoom／rotation／tileRepeat | ProjectSession.view；currentView、bindTileRepeat | 本批去掉 Editor 工作副本；29 个实际实现单元语法检查通过；同一正式程序构建、会话专项、32 项相关 GUI 与 27 个保存确认场景通过，平铺十三组亦全部通过，结果见审计 10.20 |
| 图层／帧滚动及余量、调色板纵向滚动 | ProjectSession.view | 同上；布局仍按原视口和内容合法范围夹紧，不承诺保存越界滚动值 |
| 显式帧选择／guides、最近颜色、pivot、绘图锚点及可见／启用值 | ProjectSession.view | 同上；Document 保留实际领域选择和历史，UI 值不得替代 Document 的选择协议 |
| 工具配置 | ProjectSession.tools；有类型 ToolSessionState，切换结算后捕获／恢复 | 既有工具快照验收已通过；临时笔刷资源及返回配置独立保留，不把任务、控件或捕获放入快照 |
| 参考图窗口与状态 | 按文档 identity 的 referenceSessions／referenceWindows | 常驻面板重绑、非活动关闭释放已有实际 GUI 证据 |
| Document 领域偏好 | Document，例如显示网格、动画 loop、调色板、图层面板元数据 | 沿用原领域历史／持久化；不能再造一份 UI 所有者 |

## 蒙版选择归属（审计 10.28，正式程序适用验收通过）

`ProjectSession.view` 直接持有 `maskSlots`、`maskAnchor` 和已消费的 `maskIdentity`／`maskSerial`，对应 Legacy DocumentSession 的蒙版格选择、范围锚点及原生历史事件消费游标。切换活动指针不复制／清空这些值；显式绑定新文档身份才清空，保留原历史 serial 的恢复投影。Document 的历史选择载荷不能替代实时会话选择，否则返回标签会复活旧历史选择。10.28 阶段 serial 投影仍在刷新；10.29 已迁到最终历史及选择通知，详见下一节。

`timelineSelectedCels_` 每次布局从 Document 正式选择重建，属于显示缓存；`virtualSlots_`／`virtualAnchor_` 包含正式 Cel 集合无法表达的空组格选择，在 10.28 阶段仍待迁移，10.29 已完成会话归属。21 项 Editor 门禁夹具、887 项来源覆盖已通过；唯一正式程序构建通过，同版 30 项 GUI 全通过，包括新增蒙版会话隔离及原蒙版范围／历史／命中交互，证据见审计 10.28。本批未增加图像或完整平铺十三组验收，未关闭 C02／C06。

## 空组格与蒙版历史通知（审计 10.29，正式程序适用验收通过）

空组格选择和范围锚点已接入 `ProjectSession.view.virtualSlots`／`virtualAnchor`，新身份在 `bindTimelineSelection` 清空，切换已有身份保留。`timelineSelectedCels_` 仍是 Document 正式 Cel 选择的投影缓存，不迁成另一份事实来源。原生 Ctrl／Shift 与分组范围算法保留。

蒙版历史选择游标改由最终历史通知消费，刷新不再读 `maskSelectionHistory` 或修改消费游标。无历史的链接蒙版移动拒绝分支发出单独的 MaskSelectionChanged，播放忽略；weak 会话 owner 与源 Document 地址共同验证归属。实际序列与锚点三态规则沿用审计 10.28，独立绑定用于新身份及 checkpoint 替换。唯一正式程序同版 34 项 GUI 全通过，包含空组格切换、非活动蒙版历史、原蒙版范围／剪贴板／描边交互；六项服务／架构检查通过，来源覆盖 887 项通过。未增加图像或完整平铺十三组验收，仍不关闭 C02／C06 的其他职责。

## 最近颜色身份与精灵表预览（审计 10.30，正式程序适用验收通过）

最近颜色的新身份初始化接入现有文档绑定，refresh 不再清空它；同 identity checkpoint 与返回会话均保留各自 recent 值，原生的共享存储适配不变。精灵表预览由打开、参数动作及仅在窗口开启时运行的专用计时器管理；普通刷新不生成图像，关闭先停计时器，失败输入键不自动重复尝试。成功缓存键、图像算法及 PNG／新文档路径沿用原实现，实际验证范围见审计 10.30。

原数值 blur 在 constraint=None 时写入 fixedHeight 的隐式行为已受有效窗口／约束守卫限制，active Change 仍正常。最终同版 39 项 GUI、四项架构／边界 CTest 和 24 个 Editor 正负夹具通过；884 项输入前后无漂移。没有新增图像或完整平铺十三组验收，C06 仍保留轴心／浮动选择协调，不能据此称全部刷新职责已完成。

Legacy 的无效动画选择清理是带 normalization 标记及完整选择历史快照的显式边界；不能将“每个 history 通知都删除失效键”当作等价迁移。这一剩余契约需与撤销恢复共同处理，当前未声称 C02 完成。

## 继续核对的具体状态

以下同时记录最近完成的显示归属和实际剩余待办；二十类视图状态已直接归属会话，仍不关闭 C02：

| 状态及源码位置 | 当前问题／需核对之处 | 完成条件 |
| --- | --- | --- |
| renderer 明暗：editor_session.cpp bindProjectDocument、editor_tools.cpp setRelativeLuminance | 已改为 ProjectSession.view.relativeLuminance，renderer 仅接收投影；同一会话替换 identity 才初始化 false；本批十四项真实 GUI 通过，详见审计 10.21 | A/B 明暗不同、返回 A、非活动修改、替换身份、首次刷新前实际浮动策略及领域状态保持均通过；本项已验收 |
| 选择轮廓：ProjectSession.view.showSelectionOutline | 已移除 Editor 字段与刷新／绘制中的 identity 重置；绑定替换身份时初始化 true，保留原蚂蚁线计时器门限；新增场景与原 ants 逐像素对照通过 | A/B 轮廓状态、非活动修改、替换默认值与领域状态保持通过，原显示命令／快捷键、浮动选区和六十组逐像素参考对照通过；本项已验收 |
| 轴心显示：ProjectSession.view.selectionPivotVisible、loadSessionToolPreferences | 已接入会话直接持有，原 true 初值及偏好读写保持；来源为 Legacy EditorToolOptions.tsx 1154／1170 的 session.view.showSelectionPivot 与 setView。同一正式程序 21 项 GUI 通过，详见审计 10.22 | A/B 可见性相反、非活动修改、偏好重读、真实轴心命中与领域状态保持均通过；本项功能已验收，drawing-anchor 黑图不计图像通过 |
| 调色板横向滚动：ProjectSession.view.paletteScrollX、editor_panels.cpp | 已与纵向同属会话，原布局夹紧与物理坐标保持。来源为 PalettePanel.tsx 126、useProjectScrollMemory 及两轴原测试。同一正式程序构建及 21 项 GUI 通过 | A/B 真实两轴溢出与 swatch 位移、切换、负值／过量夹紧、自动布局无溢出归零及领域状态保持均通过；本项已验收 |
| 播放：ProjectSession.playback、editor_refresh.cpp syncDocumentViewState、editor_timeline.cpp | 十四个运行字段已直接归属会话；偏好默认值独立，bind 初始化新身份并重排活动时钟；真实 A/B／ping-pong 专项及原六组播放测试、同版 26 项 GUI 均通过，详见审计 10.23。mode／loop 历史与手动观察帧现由显式绑定及领域通知协调，刷新播放决策已移除，同版 28 项 GUI 通过（10.27） | 状态归属定向验收通过；综合 animation 的首个帧标题属性超时已修复并通过原四组专项，图像笔刷夹具装载与角度隔离后综合 animation 及同版 28 项 GUI 均通过（审计 10.24）。显式生命周期已处理 loop 历史和手动选帧，播放步进保留循环栈；785 处测试文档替换已统一，None／Canvas／All 刷新不改暂停播放状态及循环栈已验收；本播放交叉项完成，C02 其余选择投影仍未完成 |

共享停靠布局、工具栏配置、菜单／控件对象、显示缓存、当前手势和输入捕获不自动改为文档状态。必须按 Legacy 与用户已确认的原生工作区规则确定所有者；对窗口和布局的共享不能用“凡是 UI 字段都放会话”替代核对。蒙版及空组格已按 10.29 完成直接会话归属和适用回归；仍须核对非活动结构修改后投影有效性。不能把旧 UI 副本误当作领域选择。

### 播放显式生命周期与剩余范围

`Document::selectFrame` 的 Manual／Playback 来源、导入 loop 标记和最终历史通知由 `AnimationChangeBinding` 发布。嵌套历史重放屏蔽中间 Cel 激活；`PlaybackSession` 服务只处理所属 identity，观察器仅捕获 weak session 并检查 Document 地址，不捕获 Editor。副本／checkpoint 不继承回调，移动保留，关闭后不延长 owner 寿命。播放内部推进保留 current／stack／position／iteration；手动 tag 选帧显式 retarget。两项独立服务测试、原 once／all／tag、disabled-frame、脚本、历史和浮动选区回归均有证据。

审计 10.26 的偏好读取初始化与 10.27 的 785 处夹具显式替换已接入，原稳定 Document 地址及 copy／move 赋值保持。导入初始 loop 在绑定前构造；原有堆分配通过引用参数保留。刷新内身份初始化、loop 协调及 retarget 块已删除，门禁拒绝重新引入。最新唯一正式程序同版 28 项 GUI 通过，包含三种刷新对暂停状态、观察帧和循环栈不变的断言；原失败和修订证据均保留。播放这一交叉范围完成适用验收，但掩码／时间轴选择投影、其他刷新身份协调及预览职责仍须核对，C02／C06 整体继续未完成。

### 浮动变换模式（审计 10.32，正式程序 45 项 GUI 与九项服务／架构检查通过）

`freeTransform` 现由 `ProjectViewState` 直接持有，Editor 工作副本退役。保留原生当前规则，显式绑定及所属会话的最终领域通知负责在浮动结束时清理模式，刷新不再读写该标志。`FloatingSettled` 在原提交／取消正常结束后发布，覆盖无像素／无历史完成；播放明确忽略它，副本不继承现场回调，非活动 owner 不需激活才能完成状态清理。

复制捕获是一个提交旧浮动、建立新浮动的同步过程。输入控制器须在成功捕获后显式恢复原先的自由变换模式，不让中间完成事件改变后续角点拖动方式。源码适配和原体字节证明通过；最终正式程序 `819ea836...` 的实际 Ctrl 指针、非活动 owner、身份替换以及完整 45/45 GUI 通过，五个相关服务及四项边界检查 9/9 通过。普通脚本批次可能抑制中间 Push，生产 scoped adapter 则允许真实操作在浮动临时移走时发通知；仅 FloatingSettled 和最终 Undo／Redo 可以按最终状态清理模式，不能在所有 `!floating()` 回调中清理。脚本失败恢复检查点时，animation 绑定与 recording/history 一起保留；真实 Lua 失败后取消检查证明仍能同步清理所属模式。restoredFromDeselect 的无历史终止同样走已有 commit 包装并发布完成，不重复叠色。普通选区轴心有效性及结构选择快照仍是独立剩余条件，不能据本批关闭整个 C02／C06。

## 本批定向验收

### 轴心历史观察归属（审计 10.31，正式程序 44 项 GUI 通过）

轴心值原已由 `ProjectViewState.pivot` 持有，本批进一步将 `pivotMask`、`pivotIdentity`、`pivotObservedRevision`、`pivotHistoryIdentity`、`pivotHistorySerial` 直接归属于同一会话，退役 Editor 上五个对应字段。`restoreProject` 不再用当前选区和历史 serial 覆盖这些观察状态。历史投影通过现有 weak owner／Document 地址校验的通知绑定执行，非活动文档的最终历史变化也能直接恢复所属轴心和观察选区，不依赖切换或刷新。

新身份在显式绑定时清空旧轴心并按已有历史 payload 初始化；同身份 checkpoint 仅在 serial 变化时消费历史，保留相同 serial 上手动设置的轴心。Legacy 依据为 `workspace-types.ts::DocumentSession.selectionPivot` 和 `workspace-view-selection-helpers.ts::combinedPixelHistoryEntry` 的会话 undo／redo。五个观察字段是原生现有历史适配的归属调整，不宣称 Legacy 存在相同 serial 实现。

普通选区改变后的轴心清空以及浮动变换结束协调仍保留原时序；尤其居中、移动命令在 Document 操作后仍需调整／恢复轴心，不能把无差别同步清空提前到所有选区 setter。新增真实 `--multi-document-check --session-pivot-history-only` 场景在最终正式程序 0.64 秒通过，同版 44/44 项 GUI 全通过，包含图层移动、画布缩放／裁剪、选择、四组属性、动画和原 39 项回归。新夹具的 dirty 预期改用未订阅观察的同源 Document 对照既有行为；旧异步缩放夹具补齐真实任务终态等待。公共入口十个专项经逐字节原体证明后隔离调用，栈占用由 767,960 降为 77,080 字节。完整失败、修订、最终程序身份及运行证据见审计 10.31；本项不替代 C02 的结构选择快照或 C06 普通选区／浮动选择的剩余协调。

`--multi-document-check --session-view-only` 检查真实 Editor 中未 store 前的直接归属、不同会话默认隔离、非活动值修改、重排、返回、刷新、旋转输入映射、关闭后的稳定地址，以及像素／历史保持。原 `--multi-document-check` 与保存、脚本、画布／图层／调色板入口继续回归。源码与运行结果分别记录于审计 10.20，尚未执行的场景不得登记通过。

二十七个非 session／smoke 实现单元只有字段访问表达式替换；反向还原表达式后原字节一致，证据为 `build/test-tmp/coupling-session-view-substitution-proof.json`。结构门禁拒绝重新加入十六个已退役的 Editor 工作副本字段；该门禁和字节证明均不替代实际行为验收。

Legacy 直接依据：`workspace-types.ts::DocumentSession`、`workspace-session.ts::createSession`、`workspace-commands-view.ts::setView`／`setViewForDocument`／`setTileRepeatMode`。本批保留原生 Rect 与 rotation 表示、默认缩放、素材、坐标公式及持久化顺序。


### 公开选区预览的所属会话通知

`Document::previewSelection` 完成原有赋值及selectionRevision递增后发送`SelectionPreviewChanged`。这只描述公开预览入口的完成状态；私有`setSelectionValue`和noexcept交换不发布事件，以免泄露变换中间态或脚本失败恢复过程。现有观察绑定用weak session及Document地址校验，把预览投影到所属会话；播放忽略此事件。原生已有的相同mask保留自定义轴心、浮动期间不重置轴心、身份替换初始化规则保持，不把此入口等同于Legacy全部setSelection命令。

源证据为Legacy `workspace-commands-selection-properties.ts::setSelection`的会话选择／轴心归属和`workspace-selection-pivot-alignment.test.ts`的变换轴心保持。原生适配保留其已存在的preview与正式commit分离以及equal-mask行为。本次不修改居中／图层移动的轴心调整、历史轴心serial或其他操作的刷新回退，C06完整终态通知仍未完成。

验收增加在后台会话直接预览并立即检查轴心的场景，包含活动／非活动owner、相同／不同mask、无refresh、像素／历史／dirty／revision保持。原正式程序在“Inactive preview pivot projection depends on refresh”失败；最终构建及运行结果以审计10.59和coupling-selection-preview-*证据为准，未验收前不能据此称C06已完成。


### 普通选区命令与历史导航的终态投影

在10.59的公开预览通知基础上，`selectAllPixels`在选区赋值后、普通`commitSelection`与`deselectPixels`在各自history push完成后，复用`SelectionPreviewChanged`通知所属会话。名称保留现有接口；本事件表达选区视图投影，不触发绘制、持久化或播放重定位。相同选区提交仍保留原selectionRevision递增及不新增历史的语义，空选区取消仍是无事件的原有no-op。

Undo／Redo先消费显式SelectionPivotHistory，再按原身份、选区revision、mask相等及浮动保护规则协调普通轴心；这样既恢复裁剪／尺寸历史中保存的轴心，也让普通选区历史不再等待refresh。此投影仅修改所属ProjectViewState。公开预览和历史导航共用session实现内的普通投影函数；没有将callback插入私有setter或noexcept交换。

Legacy依据为`workspace-commands-selection-properties.ts::commitSelectionChange`的选择快照、documentChanged=false及undo／redo轴心语义，并核对`workspace-commands-selection-move.ts`的自定义轴心位移。本轮不改centerContent和finishMoveGesture的既有实现／坐标计算，保留原生equal-mask行为。实际服务先以“Select-all projection missing”复现缺口；新增GUI在活动／非活动会话直接执行相同提交、变化提交、undo／redo、全选、取消和空取消，逐步与无订阅Document比较像素、选区、revision、contentRevision、selectionRevision、history位置／字节及dirty，最后检查居中自定义轴心。实际验收以审计10.60与coupling-selection-commit-*为准。

其他选区操作及浮动终态仍需继续收口，刷新回退保留；不据本节关闭C06或整体目标。


### 脚本临时浮动摘下期间的选区通知（2026-11-13，本批验收完成）

`ScriptDocumentBuilder::withFloating` 为沿用现有稳定像素脚本路径，会临时移走 `floating_`，调用脚本写入，再还原预览。这个区间不代表用户确认或取消浮动内容。普通选区提交新增即时通知后，所属会话曾把这个暂时的非浮动状态当作终态，清空自定义轴心；正式程序诊断已复现 `Temporary script detachment cleared custom pivot`。

现使用 `AnimationChangeBinding::SelectionPreviewScope` 仅在确有浮动内容时暂停 `SelectionPreviewChanged`。作用域支持嵌套，异常退出自动恢复；普通 `HistoryChanged`、`FloatingSettled` 不受该作用域抑制，没有浮动内容的脚本仍即时通知。这个内部区间不排队重放通知，因为退出时原浮动预览已经还原。真正终态继续使用既有浮动确认／取消路径，剩余终态轴心协调与刷新回退仍列入 C06。

来源证据：Legacy `workspace-commands-selection-floating.ts` 的确认／取消保持 pending 与 beforeSelectionPivot 的语义，以及 `workspace-selection-pivot-alignment.test.ts` 的自定义轴心保持断言。这里适配原生脚本内部暂时摘下预览的技术需求，不改变像素、脚本历史分组、最终确认／取消算法或布局。

已增加服务断言覆盖嵌套、异常恢复、非浮动禁用、复制隔离及历史／终态通知保持；真实GUI覆盖普通提交和异常预览时的浮动状态／自定义轴心，以及随后取消恢复选区。正式Release构建通过，7/7相关GUI、当前动画绑定服务1/1、源码边界及夹具4/4与同版geometry1/1通过；原失败场景现通过。程序SHA-256 `45a49ae6728993810c9e058270082f1dcae1fa98977bca91e6937c6a2c565adf`，最终证据 `coupling-floating-pivot-final-consistency.json`。这不关闭其余选区终态／刷新回退条件。

## 合并实施：动画选择值快照（待统一验收）

Document新增AnimationSelectionSnapshot，集中正式层/Cel/蒙版行选择、帧/组集合与锚点、独立组焦点、活动层/帧及蒙版上下文。TimelineGesture保存该值和原有会话虚拟格/蒙版格，不再散落复制领域字段。取消保持原动作顺序，最后精确还原独立组焦点；旧实现由组列表推算焦点可能改变原状态。捕获/恢复依据legacy workspace-animation-selection-history.ts；不是另一份可写真值。身份或活动上下文失效时先拒绝，替换到同一slot的不同mask不被误选。

新增真实Document往返、无焦点但有单组选中、mask isolation、身份/帧拒绝、mask替换测试，尚未运行。UI-only格历史快照与非活动结构投影仍未收口，C02保持开放。


本节新增实现已随统一Release验收：对应Document/滤镜/历史服务检查、34项GUI及geometry通过；证据见 `build/test-tmp/coupling-consolidated-*`。此前“待验收/尚未运行”描述为实施时状态。验证仅覆盖所列场景，明确列出的未完成结构和迁移缺口继续保留。


## 完整选择历史与非活动结构投影（源码实现，未统一验收）

沿用 Legacy `workspace-animation-selection-history.ts` 的值快照与历史包裹，并按 `workspace-animation-selection.ts::normalizeAnimationSelection` 的显式结构边界处理失效键。`AnimationSessionSelection` 只承载逻辑值（mask格／锚点、空group格／锚点、frame-selection模式），`TimelineSlot` 是同一核心值类型的UI别名。活动值仍唯一属于原 `ProjectSession.view`；Document只保存快照及弱owner捕获／恢复绑定，不获取Editor或控件依赖，不复制出另一个活动owner。

`captureAnimationSelection` 现在包含这些原先位于view的字段；恢复先准备焦点geometry/opacity，随后恢复逻辑值，不经过会提交浮动、退出mask并发布内容的用户命令。显式normalize不改变dirty、内容修订、历史位置或作品像素。mask历史journal尚未投影时，捕获按现有serial优先级取其目标值；完整快照恢复后消费serial，防止最终通知再次覆盖快照。

Layer/frame/group原有before捕获边界保存完整before，正式push后保存after；只有成员增删等明确结构变化才normalize，不在任意历史通知或refresh中清理。剪贴板、reverse、mask和拖放的同步scope在有匹配的新条目时补全完整before/after，包含调用方在领域操作之后更新的group slots；无操作不修改旧条目。历史按Legacy包裹成本增加64及每个普通/group/mask格16字节，独占成本分支及组合父节点也计入。需要统一核对budget/trim与真实异步接线，不能把源码计入等同验收。

Undo/redo在被包裹领域操作之后恢复完整选择；原会话weak binding仅校验Document地址及identity，非活动回放不激活标签，副本不保留现场绑定，关闭会话不延长寿命。脚本checkpoint沿用现有animation binding移动保留机制。现有时间轴cancel使用完整快照；未绑定服务的旧手势fallback保留。

新增独立Document服务场景覆盖非活动group删除、重排、undo/redo、mask删除恢复、锚点、纯normalize修订不变、无操作scope、copy/destroy；现有 `--multi-document-check --session-timeline-selection-only` 增加真实Editor后台group删除／撤销／重做和活动B不变。均未编译运行；C02/C09保持开放，前一版二进制不包含本节实现。原生普通格仍采用现有cel identity表示，本节不扩展普通空格的产品能力，也不宣称补齐全部Legacy迁移缺口。


选择历史收口补记（源码，未编译验收）：scope 使用仅在 pushEdit 成功入栈时递增的代次，区别于裁剪、撤销、重做和分组共用的 historyRevision。仅裁剪旧选区条目不会追加快照、改变会话选择或增加历史成本；新增 trim-only→undo 回归夹具。历史选择费用逐分支核对沿用 legacy 的 64+slots*16，不重复累加。验收仍为5/10，等待剩余实现后的统一构建与运行。


## 当前批次验证准备

选择normalize改为生命周期受限的string_view结构化哈希集合，组/蒙版有效性一次建索引；保留原先首次出现顺序和锚点策略，避免逐项重复扫描。新增逆序合法slot、重复/无效项及revision保持夹具。当前统一编译中，尚未登记运行通过。


## 工具直接归属最终验收（2026-11-13）

ProjectSession.tools为直接ToolSessionState值，currentTools仅选择activeSession内的唯一配置。原58字段capture/restore及Editor成员已退役，brushProfiles、临时capture/return/active和图像原像素均由会话直接拥有。反馈缓存/运行手势继续Editor持有，形状和渐变的算法输入在派发时取会话标量；正常资源按原切换时机重映射，临时资源保留原像素。共享颜色的非活动临时资源更新直接定位所属会话。新增实际extension-workspace验证store前地址、非活动修改不覆盖和临时资源往返，同版完整13项GUI通过；C02按原范围关闭。原默认、命名预设和文件格式保持。证据见实施报告最终交付节。
