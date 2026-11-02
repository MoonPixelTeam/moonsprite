# 动画帧剪贴板与源帧生命周期（2026-11-01）

## 本批完成范围

复制动画帧后删除源帧，或者直接剪切源帧，再导出剪贴板内容时，原实现强制查找已经不存在的源Cel并报错。即使复制时已经持有内容，也无法通过该导出入口继续使用。

现在源Cel不存在时使用已捕获的Cel内容，清除失效链接与临时共享标记，沿用现有Surface校验。源仍存在时保留原有刷新逻辑。复制时将跨帧链接物化为独立内容的分支，同时补上freeTiles权威实例数据，和tilemap／text一致，避免只留下栅格缓存。

本批没有扩大跨工程准入，没有改变共享资源的生命周期或复制新资源。已有同工程粘贴事务、保存格式与撤销重做继续复用。

## 旧版来源

- `legacy/src/renderer/src/store/workspace-commands-animation-frame-clipboard.ts`：`copySelectedAnimationFrames`通过`cloneAnimationCel`和`animationCelClipboardSnapshot`捕获帧内容；不是持有必须重新找到源Cel的弱引用。
- `legacy/src/renderer/src/store/workspace-cut.ts`：剪切先捕获，再删除帧。
- `legacy/src/renderer/src/store/workspace-animation-cel-conversion.ts`：快照保留特殊内容，索引色转换为可携带RGBA。
- 新版对应 `native/src/document.cpp` 中 `copySelectedFrames`／`exportFrameClipboard`，沿用现有帧剪贴板与资源导出，不创建另一套载荷。

## 跨工程自由瓦片的实际限制

本批先检查了该候选项。旧版跨工程帧载荷的layers只保存基本层属性，未提供freeTileSources集合和tilesets资源传递；直接放开会遗留无效引用。新版原先明确禁用继续保留，不把其它整层复制的资源规则自行套用并声称等价。这项仍需明确承接语义后单独实现。

## 验证

正式 Release 主程序与free-tile-project-tests构建成功；free-tile-project-tests实际通过，唯一正式程序 `--free-tile-transform-check` 实际退出码0。来源登记覆盖542个文件通过，`git diff --check` 通过；来源覆盖不代表全部迁移完成。

新增核心检查覆盖复制后删除与剪切后再次导出，比较捕获帧身份、自由实例、像素和资源，确认导出不增加revision或历史；再检查粘贴、保存重开和撤销重做身份。既有自由瓦片帧剪贴板检查继续运行。

仅凭核心对照不能声称系统剪贴板、所有普通RGBA／网格／文字源销毁组合、跨工程资源迁移或长期性能已验收。本批没有改变布局或素材，不做新增截图验收。

## 后续补齐：内部关联与普通像素帧蒙版

进一步按旧版跨工程粘贴的全载荷ID映射核对：复制多帧时保留复制集合内部的Cel及蒙版关联，同时持有解析后的内容。删除源帧后再次导出，不再无条件丢弃内部关联；只复制关联副本而未复制根时，使用捕获内容并断开范围外关联。同工程现有逐帧独立复制路径保持原样。

普通RGBA跨工程帧粘贴原来遗漏全部附带蒙版。本次按同一个旧版文件的`destinationLayerMaskIdBySourceId`／`destinationGroupMaskIdBySourceId`逻辑补齐：图层按源索引映射，组按目标组索引映射，没有对应目标组时跳过；复制范围内部重建蒙版ID关联，范围外断开。沿用普通帧粘贴的尺寸限制、验证和一次历史事务，没有绕到尺寸规则不同的特殊帧路径。

核心回归实际覆盖：仅复制关联副本、同时复制根和副本，删除源帧后导出，跨工程粘贴后的Cel像素、图层蒙版内容／owner／frame及内部关联，Undo删除新增帧和蒙版，Redo恢复原粘贴身份。`moon-core-tests`和`free-tile-project-tests`通过；正式Release构建成功，唯一正式程序`--free-tile-transform-check`退出码0。此次未新增组蒙版端到端场景、系统剪贴板交互或普通RGBA蒙版保存重开检查，不能将这些列为已验收；跨工程自由瓦片限制继续保留。

## 后续补齐：同工程普通帧粘贴的自动关联

旧版`pasteAnimationFrames`在插入全部帧后，按插入顺序调用`inheritAnimationFrameCelLinks`。该函数只处理开启自动关联的层：前槽为独立空白内容时不建立关联，前槽可见或已经关联时，目标指向规范根Cel，并继承其透明度、zIndex及内容元数据。此前普通RGBA的`pasteCopiedFrames`漏掉了这一步。

本次让开启自动关联的普通图层复用已有`pasteTilemapFrames`帧结构事务与继承逻辑，不新增第二套继承算法。同工程复制载荷先按旧版规则断开Cel和蒙版关联，随后按实际前槽重建Cel关联；蒙版不因图层自动关联开关而额外继承。没有开启自动关联的普通路径保持原样；跨工程仍按其原有规则处理。复用事务时保留普通同工程静态像素选区的原有准入。

拖动复制在存在自动关联层时，也直接复用该事务并传入最终插入位置。原先普通路径先粘贴后移动，无法为首帧之前的落点正确计算前槽；现在从最终落点计算，一次历史记录完成，并恢复原剪贴板。

验证：核心检查覆盖自动关联开关、独立前帧可见／空白、多帧连续继承同一规范根、拖到首帧之前／之后、保留静态像素选区及Undo／Redo。`moon-core-tests`、`free-tile-project-tests`通过，正式Release构建成功，唯一正式程序`--free-tile-transform-check`退出码0。来源登记覆盖检查通过。没有新增实际鼠标拖放截图、普通自动关联帧保存重开或完整动画模块验收，不将这些列为已完成。

## 后续补齐：不同画布尺寸与偏移像素帧（AN-003）

普通RGBA帧跨工程粘贴原来要求源／目标画布同尺寸，并拒绝未铺满目标画布或带偏移的Surface。旧版`workspace-commands-animation-frame-clipboard.ts::pasteCrossDocumentAnimationFrames`通过`workspace-animation-cel-target.ts::animationCelForTarget`复制内容，保留Surface几何，没有按文档画布裁切、缩放或要求同尺寸。

本批取消这两项未迁移限制：保留原始Surface尺寸、offset、存储原点及画布外像素，目标画布尺寸不变；目标额外图层和新增层在原有帧中的空槽继续使用目标画布尺寸。Cel内部关联、图层／组蒙版映射、帧时长和禁用状态沿用已有一次历史事务，跨工程不套用同工程前帧自动关联。

沿用`pasteCopiedCels`的稀疏存储校验与256MiB工作预算计算，计入原文档Cel／蒙版、复制载荷及新增空槽，保留已有帧／图层数量和密集画布预算上限。在修改文档前拒绝损坏Surface、重复图层槽或错帧Cel。不是只放开尺寸判断而忽略更大载荷。

验收场景包括：较小和较大目标画布、负offset与稀疏Surface、两帧关联、原有目标图层的空槽、透明度／zIndex、时长／禁用标记、图层及组蒙版关联、无效Surface原子拒绝、Undo／Redo及工程保存重开。旧版来源和源码范围已登记在来源表。

范围仅普通RGBA跨工程帧几何，不表示索引色／灰度目标转换、跨工程自由瓦片资源协议、全部文字元数据适配或完整系统剪贴板交互已完成。实际运行：`free-tile-project-tests`（含本批保存重开）、`cel-selection-clipboard-tests`和`moon-core-tests`均通过；正式Release构建成功，唯一正式程序`--free-tile-transform-check`退出码0。来源登记覆盖检查通过。未新增鼠标／系统剪贴板人工操作验收，布局和素材没有变化。

## 后续补齐：跨工程目标图层承接（AN-003）

旧版`workspace-commands-animation-frame-clipboard.ts::pasteCrossDocumentAnimationFrames`用`createLayer`创建目标缺少的图层，再承接帧载荷中明确列出的基础属性。此前native直接复制源DocumentLayer，连同源groupId等引用一并带入；源组不在目标工程时，保存／后续结构操作可能遇到悬空引用。

现在按旧版白名单承接名称、类型、显隐、锁定、透明度、混合模式及剪贴蒙版。新增层使用新的身份及默认属性，不携带源组、关联内容身份、层样式、显示色、描述或旧载荷未提供的背景等字段；现有目标层的属性保持原值。源组没有对应目标组时仍按旧版跳过其组蒙版，不自动创建源组。

同时依照`workspace-animation-cel-target.ts::animationCelForTarget`，按实际目标层类型处理Cel编辑元数据：普通像素层不接收text，非tilemap／free-tile层不接收相应元数据；栅格像素保持。新增文字层接收并保留文字编辑内容。既有映射、一次历史事务及跨工程资源限制继续使用。

回归样本包含组内源图层、源样式／共享内容引用、新增普通层和文字层、文字像素粘贴到现有普通层、基础属性、无对应目标组的蒙版、源工程不变、Undo／Redo和保存重开。本批不扩展索引色／灰度转换或特殊瓦片资源协议，也没有变更布局或素材。

本批实际验证：`free-tile-project-tests`（含新增图层／文字适配和保存重开场景）、`cel-selection-clipboard-tests`、`moon-core-tests`均通过；正式Release构建成功，唯一正式程序`--free-tile-transform-check`退出码0。来源登记覆盖检查通过；没有新增系统剪贴板人工交互或整板块等价性声明。

## 后续补齐：普通帧Alt拖动复制（AN-003）

旧版`workspace-commands-animation-frame-clipboard.ts::pasteAnimationFrames(duplicateAt)`从所选帧构造局部复制载荷，直接插入最终落点；不会覆盖session的帧／Cel剪贴板，也不会调用移动帧的循环段重排算法。

此前普通、未启用自动关联的native路径先粘贴再移动，只恢复帧剪贴板，导致原Cel剪贴板被清空，并额外经过循环段重排。现在所有帧拖动复制统一复用现有`pasteTilemapFrames`直接插入事务，保留最终落点参数、一次结构历史、帧选择及原活动上下文。普通Cel和蒙版按同工程独立复制规则断开关联，自动关联继续由已有前槽继承处理；特殊资源准入规则不变。成功后退出旧蒙版编辑，异常路径恢复两类剪贴板。

新增六组检查覆盖无剪贴板／帧剪贴板／Cel剪贴板及首帧前／后落点，核对复制像素、独立Cel、循环段原端点、帧选择、一条历史、Undo／Redo活动帧恢复及剪贴板保持。新增场景放在独立测试函数，避免继续增大已有大型核心测试main的栈帧，未调整软件或测试的栈容量配置。

`moon-core-tests`、`free-tile-project-tests`和`cel-selection-clipboard-tests`实际通过；正式Release构建成功，来源覆盖检查通过。没有新增物理Alt拖放、异常取消或本批普通复制结果的保存重开专项验收，不把这些列为本批实际运行结果。

## 后续补齐：普通帧删除与剪切的附带蒙版

旧版 `core/animation.ts::deleteAnimationFrame` 会删除该帧的图层和组蒙版；`workspace-commands-animation-frame.ts::deleteAnimationFrame` 在成功、撤销和重做时均退出蒙版编辑。普通RGBA原生删除路径遗漏了蒙版槽清理，批删和剪切复用该路径也受影响。

本次在删除槽前保留其他帧引用的解析像素，并断开指向被删除蒙版的关联，复用现有特殊帧删除规则。已有帧顺序历史负责恢复蒙版和原始关联，MaskContextHistory负责在成功及历史回放后退出蒙版编辑，不恢复已失效的绘制目标。

六组独立回归覆盖单帧删除、批量删除、剪切及两个起点，包含图层／组蒙版三级关联、存活像素、一条历史、剪切载荷、保存重开、Undo恢复原关联和Redo，以及操作前后切换蒙版编辑。`free-tile-project-tests`、`moon-core-tests`、`cel-selection-clipboard-tests`实际通过，唯一正式Release程序构建成功。未新增实际鼠标交互或整个动画模块等价验收。

## 后续补齐：删除多级关联的中间帧

旧版 `deleteAnimationFrame` 先经 `ensureAnimationDocument`，其中 `normalizeAnimationCelLinks` 把多级关联规范为根Cel。原生Timeline允许保留多跳关联，原删除逻辑只处理删除根帧，遗漏删除中间别名，后续帧可能留下无效目标。

本次删除普通帧时，将直接引用被删除别名的存活Cel改为引用其仍存活的根，保留显式关联和运行期共享的区别，复用现有 beforeCels／afterCels 历史。没有复制全画布或新增另一套事务，根身份、像素及偏移保持不变。

六组独立回归覆盖单删、批删、剪切和两种关联表示，使用四帧多级链验证无悬空引用、规范根、像素／偏移、一条历史、保存重开、Undo恢复原链及Redo。三套相关检查 `free-tile-project-tests`、`moon-core-tests`、`cel-selection-clipboard-tests` 通过，唯一正式Release程序构建通过。未新增物理鼠标交互或整板块等价验收。

## 后续补齐：删除关联源帧的内容属性

旧版 `ensureAnimationDocument` 的 `normalizeAnimationCelLinks` 会同步关联Cel的Surface、透明度、zIndex、文字及特殊编辑数据，`deleteAnimationFrame` 删除源后经 `applyFrameSurfaces` 显示剩余内容。原生删除根Cel后的共享内容重建只复制Surface，剩余帧可能显示不同透明度／顺序，并丢失可编辑文字。

本批在现有根内容移交过程中保留透明度、zIndex、文字和既有编辑元数据，复用 beforeCels／afterCels 历史；完成删除后调用现有 `projectActiveCelOpacities`，同步活动层显示属性。不改变既有显式关联转运行期共享的处理，不增加另一套结构事务。当前导入要求可解析的根Surface存在，该限制保持；空白场景使用全透明像素。

18组独立回归覆盖单删／批删／剪切、普通像素／文字／全透明内容及显式／运行期关联，验证剩余像素、偏移、透明度、zIndex、文字编辑数据、一条历史、保存重开、Undo恢复原属性和关联、Redo。`free-tile-project-tests`、`moon-core-tests`、`cel-selection-clipboard-tests` 均通过，唯一正式Release程序构建成功。没有新增物理鼠标交互或完整动画模块验收。

## 后续补齐：普通帧删除后的画布选区

旧版 `workspace-commands-animation-frame.ts::deleteAnimationFrame` 在成功分支清空画布选区和旋转中心，最后一帧不能删除时提前返回。其Undo／Redo闭包不接管当前像素选区；用户后来建立的选区保持。剪切由 `workspace-cut.ts` 先复制再进入相同逐帧删除路径。

原生普通 `deleteFrame` 现于成功删除后清空 `selection_`，批删和剪切直接复用。没有把临时选区写入帧结构历史，也没有新增一条撤销记录；沿用Editor刷新中由选区变化清理旋转中心和自由变换的既有逻辑。特殊图层的现有准入保持，未扩展该部分行为。

九组独立回归覆盖单删／批删／剪切、矩形／稀疏选区、剪切全帧而非选区像素、一条历史、Undo／Redo不恢复旧选区及保持后来选区、最后一帧无操作保留选区和剪切载荷。`free-tile-project-tests`、`moon-core-tests`、`cel-selection-clipboard-tests` 均通过，唯一正式Release程序构建通过。未新增实际鼠标交互和旋转中心截图验收，不声明整个动画模块完成。

## 后续补齐：帧删除的时间轴选择与范围起点

旧版 `workspace-animation-selection.ts::normalizeAnimationSelection` 在删除边界过滤失效帧／Cel，保留有效项；帧选择优先于Cel，范围起点失效时回退最后有效项。没有任何选择时回到活动图层，帧选择可保留显式蒙版行。批删／剪切由 `workspace-commands-animation-cel-properties.ts::deleteSelectedAnimationItems` 在复合删除后清空帧范围并统一规范选择。

本批将上述规则适配到普通原生帧删除，只清理帧删除可能失效的身份，保留未删除的图层／组／蒙版行。直接删除保存前后帧范围；批删和剪切复用同一清理逻辑并清范围起点。既有复合历史在子编辑已经具有帧起点快照时记录最终起点和时间轴选择，避免Redo重新带回中间状态；不携带该快照的历史保持原路径。

新增八组回归覆盖单删／批删／剪切、部分／全部帧范围、活动层回退、Cel保留／清除和Undo／Redo的范围及起点。特殊图层的现有准入和事务规则保持，没有扩大跨工程资源兼容范围。

实际运行：八组新增回归通过，`free-tile-project-tests`、`moon-core-tests`、`cel-selection-clipboard-tests`三套相关检查通过；唯一正式Release程序构建成功，542文件来源覆盖检查通过。未新增实际鼠标／Shift范围选择截图验收，不声明完整动画模块完成。

## 后续补齐：新建链接帧的来源与操作上下文

旧版 `workspace-commands-animation-frame.ts::addLinkedAnimationFrame` 按选中Cel范围起点、帧范围起点、活动位置的顺序取源，Cel只作用对应行，帧选择作用全部行。`workspace-animation-linked-cel.ts::linkCelsInRightFrame` 优先复用右列；没有右列时复用空白帧创建，非Cel范围独立复制源组蒙版。

原生继续复用addFrame和既有Cel／蒙版历史，补齐上述来源选择、文字编辑数据及内容属性、成功清除帧／Cel／蒙版选择和画布选区。已有右列路径Undo恢复原活动帧、选择范围及蒙版隔离，Redo回到清理后的状态；新增列Undo按旧版退出蒙版编辑，恢复原活动帧。新增列组蒙版使用新身份和独立内容，Cel范围不复制组蒙版。

六组回归覆盖活动／Cel／帧范围及复用右列／尾部追加，包含来源不同于活动位置、未选行不变、文字与偏移／透明度／zIndex、独立组蒙版、一次历史、保存重开和Undo／Redo。三套相关检查通过，正式Release构建通过。特殊图层链接准入未扩展；未新增实际Alt+M鼠标／键盘交互验收。追加路径仍使用addFrame的既有录制通知时机，缩时最终捕获一致性尚未在本批验证，不声明整个关联帧模块完成。

## 后续补齐：链接帧完成后的缩时记录

旧版 `workspace-mutation.ts::mutateDocumentSession` 在命令结束后经 `workspace-document-change.ts::completeDocumentChange` 记录操作。原生尾部链接帧复用 `addFrame`，其历史提交会立即通知录制，此时链接和组蒙版尚未完成。

本次复用现有复合操作开关，在追加空白帧期间暂缓录制和操作计数，异常时恢复原开关；链接、蒙版和历史快照完成后再通知一次，外层已有复合操作时继续由外层发布。复用原录制队列和历史，不增加通知接口或改变缩时采样算法。

六组现有链接帧场景增加observer断言，覆盖最终像素／组蒙版／选择、一次通知和一次操作计数、Undo／Redo通知策略以及下一次普通操作计数。另两组实际Session检查追加／复用右列、异步PNG与最终画布完全一致、关闭撤销记录时不新增帧、开启后Redo记录最终画面。`free-tile-project-tests`、`moon-core-tests`、`timelapse-tests`实际通过，正式Release构建通过。关闭上一节所列的追加链接帧录制时机缺口；未扩大特殊图层链接支持或声明全部缩时行为等价。

## 后续补齐：连接／断开单元格的可编辑内容

旧版 `core/animation.ts::connectAnimationCels` 及 `normalizeAnimationCelLinks` 同步规范源的编辑数据；`disconnectAnimationCels` 独立复制像素和文字等元数据，最后 `applyFrameSurfaces` 同步显示。原生批量连接／断开入口缺少文字等编辑元数据，断开文字副本可能留下原目标的旧文字，与画面不一致。

本批连接及批量断开补齐text／tilemap／freeTiles字段的规范源承接，沿用既有结构准入（特殊瓦片链接仍禁用），调用现有活动Cel透明度投影。继续复用原关联规则、空白间隙选择与beforeCels／afterCels历史，没有新设历史或改变范围。无UI调用的旧 `disconnectCel` 辅助入口不在本批等价声明内。

八组回归覆盖连接／断开、选中源／副本、普通／文字图层，验证规范文字及文字原点、像素和偏移、透明度和zIndex、未选关联不变、一次历史、选择保持、保存重开和Undo原数据／Redo。`free-tile-project-tests`、`moon-core-tests`、`cel-selection-clipboard-tests`均通过，正式Release构建及来源覆盖检查通过。没有新增实际菜单点击验收，不表示整个时间轴模块完成。

## 后续补齐：删除／剪切单元格的文字清理与内容移交

旧版 `workspace-commands-animation-cel-properties.ts::deleteSelectedAnimationItems` 在规范关联后，将被删除源的内容交给剩余成员，再清空选中槽的像素、文字等编辑元数据、链接和zIndex；保持规范源透明度及像素几何。`workspace-cut.ts` 先复制再复用此删除命令。

原生普通删除路径现补齐剩余成员的规范源文字、透明度、zIndex等属性；被删槽从规范源取得几何和透明度后清空像素并删除编辑元数据，避免旧文字仍可编辑或别名陈旧存储被误用。活动层透明度通过既有投影更新，继续复用candidate事务及完整时间轴历史。特殊图层路径和像素选区准入不变。

十二组回归覆盖删除／剪切、源／副本／同时删除及普通／文字图层。样本故意保留别名的旧像素几何、文字和属性，验证剩余内容正确移交、被删槽清空、剪切载荷保留文字和像素、一次历史、保存重开、Undo精确恢复原数据和Redo。三套相关测试及正式Release构建通过，来源覆盖检查通过；未新增实际菜单交互验收，不声明整个动画模块完成。

## 后续补齐：整格粘贴覆盖源Cel时的内容保护

旧版 `workspace-animation-cel-links.ts::detachAnimationPasteTargets` 在覆盖规范源前，把surface、opacity、zIndex、text、tilemap及freeTiles交给仍存活的成员；整格粘贴完成后刷新活动画面。原生整格粘贴此前仅移交Surface，覆盖文字源后可能丢失剩余帧的可编辑文字或显示属性。

本批在 `pasteCopiedCels` 既有剩余成员提升过程中补齐规范源编辑数据和属性，粘贴完成后复用活动Cel透明度投影。candidate事务、ID映射、目标选择和完整时间轴历史继续沿用，不改变资源准入或重设架构。浮动像素选区粘贴路径未在本批修改或声明等价。

八组回归覆盖同工程／跨工程snapshot分支、覆盖根／副本、普通／文字图层，验证替换目标与剩余成员的像素、偏移、透明度、zIndex、文字及原点，一次历史、目标选择、保存重开、Undo恢复原关联和编辑属性、Redo。`free-tile-project-tests`、`moon-core-tests`、`cel-selection-clipboard-tests`均通过，正式Release构建通过。未新增系统剪贴板或实际菜单操作验收，不声明完整粘贴模块完成。

## 后续补齐：跨工程单元格粘贴的目标类型

旧版 `workspace-commands-animation-cel-clipboard.ts::pasteCrossDocumentAnimationCels` 为每个目标调用 `workspace-animation-cel-target.ts::animationCelForTarget`，按目标层kind清除不适用的编辑数据。原生普通跨工程粘贴此前直接复制源Cel，文字元数据可能进入普通像素层。

本批在既有Cel ID和关联映射后，按实际目标类型保留或清除文字及特殊编辑数据。文字目标承接源文字，普通目标保留栅格像素并清文字；源无文字时覆盖文字目标也不保留目标旧文字。同工程分支、源快照、像素尺寸／偏移、一次时间轴事务和资源准入保持原逻辑。

八组回归覆盖普通／文字源及普通／文字目标、复制后删除源内容及保留源内容，检查较小目标中的越界像素、透明度／zIndex、内部关联、追加帧、目标选择、一条历史、保存重开、Undo原文字和Redo同一帧身份。三套相关测试与正式Release构建通过，来源覆盖检查通过。特殊资源跨工程协议、索引／灰度目标转换和实际系统剪贴板交互不在本批完成范围。


## 后续补齐：跨工程单元格粘贴附带蒙版

旧版 `workspace-commands-animation-cel-clipboard.ts::pasteCrossDocumentAnimationCels` 克隆源蒙版，映射新身份及复制范围内的关联，并通过 `setAnimationMaskSlot` 替换目标槽；覆盖前的解除关联保护剩余成员。原生普通RGBA整格粘贴此前遗漏蒙版，本批直接复用 `document_layer_groups.cpp::pasteTilemapCels` 已有的跨工程蒙版处理，适配到普通candidate事务。

复制范围外的蒙版关联由既有export物化并清除；范围内关联重映射为新身份。覆盖旧蒙版时提升仍存活的关联根并保留像素。预算包含目标及传入蒙版，非法owner、重复身份、无效Surface或关联在提交前拒绝。继续复用一条完整时间轴历史，不改同工程及浮动像素选区粘贴。

四组回归覆盖单个外链副本／内部关联双格、覆盖／追加，检查新身份、像素／原点、会话标志、旧关联保护、一次历史、保存重开、Undo原身份／Redo新身份；另十二组损坏载荷拒绝检查通过。按旧版 `project-format-encode.ts::encodeMask` 和 `project-format-decode.ts`，visible及moveWithOwner不持久化，重开恢复显示及绑定移动；locked及autoLink持久化。本批没有擅自扩展工程格式。

`free-tile-project-tests`、`moon-core-tests`、`cel-selection-clipboard-tests`通过，唯一正式Release程序构建通过，542文件来源覆盖通过。未进行系统剪贴板或实际鼠标菜单验收；特殊跨工程资源协议仍维持原准入，不声明整个粘贴板块完成。


## 后续补齐：同工程整格粘贴的类型与追加帧继承

旧版 `workspace-commands-animation-cel-clipboard.ts::pasteAnimationCels` 的同工程分支按 `workspace-animation-commands-helpers.ts::animationCelContentKind/layerContentKind` 对比实际载荷与目标层，类型不兼容即返回，不转换内容。跨工程分支才使用目标类型转换。原生普通整格同工程粘贴现补齐此准入，在candidate追加帧前拒绝，保留目标、历史和剪贴板；无文字编辑数据的文字层Cel按旧版判为raster。

同流程的 `core/animation.ts::inheritAnimationFrameCelLinks` 在追加帧时将未被粘贴覆盖、开启自动关联的图层链接到前帧规范源，同时承接text/tilemap/freeTiles。原生原路径只关联像素和显示属性，本批补齐编辑元数据及清除runtimeSharedCelId，沿用原内容准入、链接来源、candidate和完整时间轴历史。

八组类型组合检查包含普通／文字来源及目标、文字源缺少text、拒绝后像素／选择／history／revision／clipboard保持，以及成功保存和Undo／Redo。四组追加回归覆盖独立／已关联前帧、追加一／两帧，检查自动关联文字内容与原点、规范像素及几何／透明度／zIndex、一条历史、保存重开、Undo恢复原帧与选择、Redo稳定身份。三套相关检查及正式Release构建通过，542文件来源覆盖通过。

本批未改浮动选区、同工程蒙版槽粘贴及特殊跨工程资源协议；未执行实际鼠标／菜单操作验收，不据此声明整个粘贴模块完成。


## 后续补齐：带像素选区的Cel粘贴目标限制

旧版 `workspace-paste-cel-selection.ts::pasteCelSelection` 在追加帧及建立pendingPaste前，检查每个目标层存在、无kind、未锁定且帧索引有效。原生此前只检查位置和锁定，允许带选区的栅格像素进入文字层，可能使像素与可编辑文字不一致。

本批在 `beginCelSelectionPaste` 的既有目标预检中补齐非空kind拒绝，仍复用原浮动粘贴、追加帧、取消与完整时间轴历史。没有改变整格跨工程粘贴的目标类型转换，也没有扩大特殊图层支持。

八组回归覆盖同工程／跨工程、普通／文字目标和锁定／解锁：拒绝时检查所有Cel的像素、文字及原点、帧数、选择、history、contentRevision、dirty保持；成功路径检查追加帧预览不入历史、取消恢复、一次提交、保存重开及Undo／Redo。`free-tile-project-tests`、`moon-core-tests`、`cel-selection-clipboard-tests`通过，唯一正式Release构建及542文件来源覆盖通过。

未执行实际鼠标／菜单验收。此检查只关闭目标类型准入缺口；原浮动流程中关联Cel拆分与旧版规范源编辑的行为差异仍需单独核对，不声明整个浮动粘贴流程已等价。


## 后续补齐：带选区Cel粘贴保留共同源关联

本节关闭上一批登记的普通同层显式关联Cel拆分差异。旧版 `workspace-paste-cel-selection.ts::pasteCelSelection` 通过 `selection-transform-targets.ts::applySelectionTransformLayerState` 编辑帧代理，再由 `animation.ts::animationLayerAtFrame/syncAnimationLayerAtFrame` 写回规范源，不拆除目标关联。原生先前套用了整格覆盖时的解除关联和存活成员提升，选区粘贴进入副本时会错误地只修改该帧。

本批移除该路径的拆链和根提升，继续使用原candidate、浮动变换及完整时间轴历史。普通与稀疏预览按规范owner暂存结果，同一owner收到多个载荷时按顺序逐次source-over，不能直接跳过后续项；每个owner只保留一份回滚数据，反复预览从原基线计算。沿用旧版初次载荷顺序及随后提升活动目标的规则，转移owner回滚记录；不同载荷的采样缓存分别使用，稀疏路径预算计入额外共享目标的高质量采样缓存。初始化失败恢复原timeline与选择。

八组回归覆盖根／链副本目标、单／双半透明载荷、完整／稀疏Surface及画布外原点。检查所有关联帧同步显示、原身份与链结构保持、规范透明度／zIndex、活动目标提升后的叠加顺序、重复移动与缩放、快速／高质量采样切换，以及取消精确恢复几何、一条提交历史、保存重开和Undo／Redo。原 `cel-selection-clipboard-tests` 中断言副本拆链的用例按旧版修正。

本节仅针对普通RGBA同层显式关联；不扩大特殊图层、跨图层共享或图层组关联支持。实际鼠标／菜单验收未在本批执行。

本批实际结果：上述八组新增场景及 `free-tile-project-tests`、`moon-core-tests`、`cel-selection-clipboard-tests` 通过，唯一正式Release程序构建通过，542文件来源覆盖与diff检查通过。


## 后续补齐：复制帧内容不随源编辑漂移

旧版 `workspace-commands-animation-frame-clipboard.ts::copySelectedAnimationFrames` 使用 `cloneAnimationCel`、`cloneAnimationLayerMask` 和 `cloneAnimationGroupMask` 捕获帧内容，跨工程载荷也在复制命令内经 `workspace-animation-cel-conversion.ts::animationCelClipboardSnapshot` 建立。原生 `exportFrameClipboard` 先前在源Cel仍存在时重新读取Surface、文字等编辑数据与关联，并重新读取蒙版链接；结果取决于源是否被删除，同一次复制重新导出可能得到不同内容。

本批统一使用已捕获的Cel及蒙版内容，只清除载荷范围外的关联并复用Surface校验，不回读活源。`copySelectedFrames` 物化关联副本时补齐规范源opacity／zIndex，与已有文字／瓦片编辑数据一起捕获。保持原同工程独立帧粘贴、跨工程身份映射和完整时间轴事务。

本批范围是Cel／蒙版内容及其关联。帧导出目前仍读取当前图层、组及tileset元数据，复制后删除或重排图层／组等结构变化的完整冻结尚未在本批承接；特殊共享资源沿用当前重渲染策略。本节不表示完整工程结构快照或全部帧剪贴板已等价。


八组回归覆盖普通／文字图层、只复制关联副本／复制根与副本、修改后保留／删除源根。复制后改像素或文字与原点、透明度、断开Cel关联、删除蒙版根，再导出时验证旧像素／文字／属性／蒙版／关联与帧时长保持。验证同工程及跨工程粘贴、一次历史、保存重开和Undo／Redo。三套相关测试（`free-tile-project-tests`、`moon-core-tests`、`cel-selection-clipboard-tests`）、唯一正式Release构建、542文件来源覆盖和diff检查通过；未执行实际鼠标／系统剪贴板验收。


## 后续补齐：帧剪贴板图层／组结构索引快照

旧版 `workspace-commands-animation-frame-clipboard.ts::copySelectedAnimationFrames` 在复制时创建layers及layerIndexById／groupIndexById，跨工程载荷以此确定源行和蒙版owner索引。原生导出此前使用当前timeline的layers／groups；复制后重排或删除图层、移除组，会改变行映射或使已捕获Cel／蒙版找不到owner。

本批复制帧时保存只读结构元数据：layers、groups、sourceIdentity及画布规格；Cel／蒙版仍由原frameClipboard_持有，不重复保存整份像素。导出使用原索引和属性，清空载荷时同步释放元数据。`timeline_interaction.cpp::copyTimelineFrames` 的临时复制在成功及异常路径恢复原结构快照，避免拖拽复制覆盖用户原剪贴板。

范围仅图层／组元数据及画布规格的跨工程映射；tileset仍按当前共享资源查询和重渲染规则处理，特殊跨工程自由瓦片仍拒绝。同工程原粘贴路径在owner被删除后的行为不在本批承接，不能将本节解释为全部结构变化均已支持。


四组新增场景覆盖复制后重排／删除图层、保留／移除组、新增图层，并执行临时Alt拖拽复制及Undo后重新导出，验证原元数据未被污染。跨工程粘贴验证原始行顺序、新建层名称及显示属性、图层／组蒙版索引、一次历史、保存重开和Undo／Redo。`free-tile-project-tests`、`moon-core-tests`、`cel-selection-clipboard-tests`实际通过；源码来源覆盖542文件通过。实际鼠标／菜单验收未执行。

唯一正式Release程序最终构建成功，产物仍为 `native/build/Release/moonsprite-native.exe`，未创建其他编译版本。


## 后续补齐：同工程帧粘贴承接当前图层集合

旧版 `workspace-commands-animation-frame-clipboard.ts::pasteAnimationFrames` 插入内容后经 `animation.ts::ensureAnimationDocument` 过滤已删除图层／组的Cel及蒙版，按当前图层集合补齐空槽，再执行 `inheritAnimationFrameCelLinks`。因此同工程不应恢复删除的owner，新增图层在粘贴帧中应为空白，启用自动关联时再继承前帧。

原生普通路径此前直接追加捕获的Cel／蒙版：已删owner会残留、新增层缺槽；自动关联分支则因源层缺失而拒绝。本批在 `pasteCopiedFrames` 的临时载荷中按当前owner过滤，为新层补当前几何／原点／透明度的透明槽，并清除同工程复制关联；统一复用已有 `pasteTilemapFrames` 的候选结构事务、预算、自动关联、蒙版映射与一次历史，不直接修改活timeline。此规范化只用于本次同工程粘贴，不改写复制时的跨工程快照。

八组新增场景覆盖源层删除／保留、组移除／保留和新层自动关联开／关，验证当前层顺序及完整slot、按身份接收旧内容、透明槽或前帧继承、仅存活蒙版恢复、帧时长／禁用、选择、一条历史、Undo／Redo和保存重开。修正结构测试的删除夹具：解组后明确单选目标层，断言实际已删除，避免多选最后两层导致删除被拒绝而误判覆盖。

三套相关检查（`free-tile-project-tests`、`moon-core-tests`、`cel-selection-clipboard-tests`）通过，唯一正式Release构建通过，542文件来源覆盖通过。仅普通RGBA同工程；特殊资源帧粘贴未扩大准入，未执行实际鼠标／菜单验收。


## 后续补齐：帧粘贴退出蒙版编辑

旧版 `workspace-commands-animation-frame-clipboard.ts::pasteAnimationFrames` 及其 `restoreInserted/reapplyInserted` 在粘贴成功、Undo和Redo时均清空 `activeLayerMaskId`；跨工程 `pasteCrossDocumentAnimationFrames::applyInserted` 成功后同样退出蒙版。原生普通帧粘贴此前可能仍指向旧帧蒙版，切换到新帧后继续绘制会修改旧蒙版。

本批同工程复用既有 `Edit::MaskContextHistory` 和结构事务，成功及Undo／Redo均退出蒙版编辑和隔离；普通跨工程在候选校验完成后清理当前蒙版上下文，不新增旧版未明确要求的跨工程Undo上下文行为。保留原像素选区，不扩大特殊资源帧粘贴准入。

八组回归覆盖同／跨工程、图层／组蒙版及隔离开／关，检查一次历史、原蒙版身份与像素保持、粘贴后的真实笔画进入新Cel、Undo／Redo及保存重开。`free-tile-project-tests`、`moon-core-tests`、`cel-selection-clipboard-tests`和唯一正式Release程序构建通过。未执行实际鼠标／菜单验收；不声明界面层所有蒙版选择状态或整个帧剪贴板模块已完成迁移。


## 后续补齐：同工程帧粘贴清理蒙版格选择

旧版 `workspace-commands-animation-frame-clipboard.ts::pasteAnimationFrames::selectInsertedItems` 明确清空蒙版格、蒙版行和蒙版格锚点。原生 `Editor::pasteTimelineFrames` 成功后调用 `markFrameSelection`，但该函数承接的是普通帧标题点击，会将已有蒙版格提升为owner行；当粘贴结果选择Cel时，另一个分支也没有清旧蒙版格和锚点。

本批仅在同工程帧粘贴成功后、套用原帧／Cel选择显示前清理 `selectedMaskSlots_` 与 `maskSelectionAnchor_`。文档事务已负责清理蒙版行；不重写标题点击的提升行为，不改变跨工程语义，空载荷或失败不清理选择。

`smokeAttachedMasks` 新增八组图层／组、隔离开／关、帧／Cel上下文，经过真实Editor粘贴及refresh检查无旧蒙版格／锚点／整行残留、退出蒙版编辑、一次历史、帧或Cel选择显示，以及Undo／Redo；另检查空剪贴板拒绝保持原蒙版上下文。唯一正式Release构建通过，正式程序 `--attached-masks-check` 退出码0，包含新增检查及既有蒙版交互回归。本批未做截图视觉验收或系统鼠标手动操作，不声明整个帧剪贴板模块迁移完成。

## 后续补齐：跨工程帧粘贴空白格透明度

旧版 `workspace-commands-animation-frame-clipboard.ts::pasteCrossDocumentAnimationFrames` 在新增图层和插入帧后经 `animation.ts::ensureAnimationDocument` 补齐缺失槽位，空槽使用 `opacity: layer.opacity`。原生普通跨工程路径此前使用默认100%透明度，造成新增图层在旧帧中的空格，以及目标多余图层在新帧中的空格，后续绘制显示与旧版不一致。

本批沿用既有候选结构、空格构造器、像素预算和完整时间轴历史；空格构造改为接收目标图层并继承其透明度，不从已复制Cel推断，不改变已有Cel或链接。像素存储规格仍沿用原生当前实现；旧版RGBA非活动空格采用1×1稀疏Surface，此存储差异未在本批关闭。

新增八组场景覆盖新增／现有目标图层、普通／文字类型及0%／35%透明度，检查透明独立槽、原链接和像素保持、帧激活的图层透明度投影、一次历史、Undo／Redo及保存重开。普通像素层额外验证实际画笔提交保持透明度；文字层不调用画笔。构建与测试结果见迁移计划本批记录；未新增实际界面操作验收，也未扩大特殊资源准入。


## 后续补齐：跨工程非活动帧空格稀疏存储（2026-11-02）

旧版 `animation.ts::blankSurfaceFromLayer` 为RGBA非活动缺失槽创建1×1、原点0的透明Surface；`ensureAnimationDocument` 为活动帧使用当前图层Surface。本批普通跨工程帧粘贴将非活动缺失槽改为旧版1×1存储，保留透明度继承；活动帧新增图层暂沿用当前原生密集路径，其源图层尺寸／偏移承接不在本批关闭。

预算按实际空格存储计费，移除画布面积乘总层帧数的密集估算拒绝，保留实际原内容、剪贴板与新增槽工作集预算及层帧上限。绘制仍复用既有稀疏Surface扩展，不新增像素存储架构。八组空格场景增加宽高／原点／像素数检查；普通层检查在原1×1范围外绘制、Undo恢复空白像素，沿用保存重开与帧粘贴历史回归。现有画笔Undo不收缩已扩展的Surface，因此笔画撤销后不要求回到1×1；此存储回收差异仍保留。实际结果记录于迁移计划；未新增实际UI操作验收，特殊资源准入保持。


## 后续补齐：跨工程新增层的原活动帧几何（2026-11-02）

旧版 `workspace-commands-animation-frame-clipboard.ts::copySelectedAnimationFrames` 的跨工程layers快照包含每个图层的width／height／offsetX／offsetY，取复制时当前图层显示规格，即使复制的帧范围不含活动帧也一样。`pasteCrossDocumentAnimationFrames` 新建图层时承接这些字段；`animation.ts::ensureAnimationDocument` 为原活动帧以该图层Surface补透明格，其余非活动帧补1×1空格。

原生此前没有保存这份图层几何，新层原活动帧的空白格使用目标画布尺寸和原点0。本批 `FrameClipboardSnapshot` 增加仅含四个整数的按层索引元数据，复制时从活动帧规范Surface捕获，不重复保存像素，切帧后重新导出保持冻结。普通跨工程粘贴的新层原活动格使用该几何和透明像素；预算使用实际尺寸，沿用原结构事务。无新几何字段的旧内部载荷按源工程画布尺寸／原点0回退，不声称可恢复载荷未包含的偏移。

四组场景覆盖源活动帧是否属于复制范围、偏移开／关和源目标不同尺寸，检查活动几何与所复制Cel自身几何分别保持、复制后切帧不改变元数据、原活动帧新层为空、保存重开及一次历史Undo／Redo；另核对无效几何载荷拒绝。特殊资源路径未扩展。构建与检查实际结果见迁移计划，未新增实际UI操作验收。

本批四组新增几何场景、每组3个无效载荷拒绝及既有 `free-tile-project-tests` 实际通过，唯一正式Release程序重编译成功，542文件来源覆盖与diff检查通过。未执行实际界面操作验收，不能据此将整个模块标为完成。


## 后续补齐：撤销帧粘贴清空单元格选择（2026-11-02）

旧版 `workspace-commands-animation-frame-clipboard.ts::pasteAnimationFrames::restoreInserted` 与 `pasteCrossDocumentAnimationFrames` 的Undo在移除插入内容、恢复原播放位置及帧选择后，明确清空单元格选择和锚点。原生普通路径直接恢复整个 `beforeTimelineSelection`，会重新选中粘贴前的单元格范围。

本批普通同工程结构事务及普通跨工程完整时间轴事务只在Undo侧快照清理 `cels/celAnchor`，复用既有Edit、插入位置、原播放位置及帧选择恢复，不修改通用Undo。Redo继续恢复粘贴后的帧／单元格选择；特殊资源路径保持原范围。

八组新增场景覆盖同／跨工程、复制一／两帧及原单／多单元格选择，核对一次历史、Undo原播放位置／原像素及空单元格选择、Redo插入选择、重复Undo和保存重开。构建与实际结果见迁移计划；未新增实际UI操作验收，不能据此将整个动画模块标为完成。

本批实际结果：八组新增回归及既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖与diff检查通过。


## 后续补齐：批量帧粘贴自动关联的内容缓存（2026-11-02）

旧版 `animation.ts::inheritAnimationFrameCelLinks` 只在前驱尚未关联时判断可见内容，并经 `animation-cel-content-cache.ts::animationCelSurfaceHasContent` 复用存储／修订缓存。原生帧结构粘贴循环此前无论前驱是否已关联，都对解析后的规范源执行逐像素扫描，批量插入会重复读取同一份像素。

本批沿用既有继承算法，已关联前驱直接沿用规范源；独立原有单元格复用现有 `Timeline::hasVisiblePixels` 缓存，候选事务内新单元格直接判断私有Surface，避免将尚未提交内容写入活timeline缓存。独立空白不启动关联，已关联的透明根继续继承，规则保持旧版行为。

八组场景覆盖已关联／独立前驱、透明／可见及冷／热缓存，每组批量粘贴24帧；检查冷／热缓存下结果一致、规范源身份和透明像素继承、一次历史、保存重开与Undo／Redo。此处只做行为回归，不做耗时基准；结构提交会重建Timeline并重置统计，因此未以提交后计数作为本次扫描次数；不声明整个帧剪贴板或绘制性能已完成迁移。构建和测试实际结果见迁移计划，未新增实际UI操作验收。

本批实际结果：上述八组批量场景及既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖和diff检查通过。


## 后续补齐：同工程新增层的缺失帧槽稀疏化（2026-11-02）

旧版 `workspace-commands-animation-frame-clipboard.ts::pasteAnimationFrames` 插入已复制内容，再由 `activateAnimationFrame` 内的 `animation.ts::ensureAnimationDocument` 按当前图层集合补槽。规范化时仍处于原活动帧，因此新插入帧缺失的普通图层槽使用 `blankSurfaceFromLayer` 的1×1、零偏移透明Surface及当前图层透明度。

原生此前为复制后新增图层的缺失槽沿用当前活动Cel整张Surface尺寸／偏移，分配整块透明像素。本批改为旧版1×1存储，临时预算按一个像素计算，继续复用原结构粘贴、前帧自动关联和一次历史；不改写复制时的跨工程快照，特殊资源准入保持。

原八组当前owner变化／自动关联场景增加1×1／零偏移／像素数断言，移除原来要求密集尺寸的不等价预期；四组非自动关联场景补充范围外真实绘制、另一新帧独立保持、Undo空白像素和Redo／保存重开。画笔Undo不收缩扩展Surface的既有存储回收差异仍保留。实际构建与检查结果见迁移计划，未新增实际UI操作验收。

本批实际结果：上述场景及既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖与diff检查通过。


## 后续补齐：跨工程帧粘贴Redo退出重新进入的蒙版（2026-11-02）

旧版 `workspace-commands-animation-frame-clipboard.ts::pasteCrossDocumentAnimationFrames` 的Redo重新执行 `applyInserted`，因此每次重做都清空 `activeLayerMaskId`。原生初次粘贴已退出蒙版，但完整时间轴历史没有记录Redo侧的编辑目标；用户Undo后再进入旧帧蒙版编辑，Redo会保留旧蒙版目标。

本批复用已有 `Edit::maskToActivateOnRedo`，空字符串表示回到文档编辑；普通跨工程帧历史设置此目标，完整时间轴前向恢复时清理蒙版及隔离。Undo侧保持原逻辑，创建蒙版的既有 `beforeMasks` 历史路径保持。没有增加历史类型、修改特殊资源准入或重新定义蒙版选择UI。

八组新增场景覆盖图层／组蒙版、隔离开／关和粘贴一／两帧，检查Undo后重新进入蒙版、Redo退出且保留像素选区、真实笔画写入新Cel且原蒙版保持、重复Undo／Redo及保存重开。构建和测试结果见迁移计划；未新增实际UI操作验收。

本批实际结果：八组新增回归及既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖与diff检查通过。


## 后续补齐：原关联源删除后复制运行时共享帧（2026-11-02）

旧版 `workspace-commands-animation-frame-clipboard.ts::copySelectedAnimationFrames` 经 `animation.ts::cloneAnimationCel/cloneAnimationCelSurface` 复制每个帧实际持有的Surface；删除原规范源后，仍共享像素的存活帧可正常复制。原生删除源帧后，为存活副本建立 `runtimeSharedCelId`。帧复制此前只为显式 `linkedCelId` 物化内容，再无条件清运行时引用，运行时共享叶副本可能失去Surface。

本批让运行时共享副本复用原规范源解析与内容物化分支，捕获Surface、编辑数据、透明度和zIndex后清运行时引用，保持剪贴板自持内容。没有新建共享或剪贴板架构，不扩大特殊资源协议。

四组新增场景覆盖普通／文字图层、仅复制共享叶／连同新规范源复制两帧，经实际删除原源帧构造运行时共享；检查复制的像素、稀疏几何、属性及可编辑文字，同工程与不同尺寸工程粘贴、一次历史、保存重开与Undo／Redo。实际结果见迁移计划，未新增实际UI操作验收。

本批实际结果：四组新增场景及既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖与diff检查通过。


## 后续补齐：带选区多单元格剪切跳过特殊删除目标（2026-11-02）

旧版 `workspace-cut.ts::cutWorkspaceItems` 先复制选中单元格，有像素选区时委托 `deleteSelection`。`workspace-commands-selection-effects.ts` 的多目标分支使用 `workspace-selection-effects-support.ts::selectedEffectTargets`，其collect跳过非空kind，因此文字等特殊图层仍被复制，但不会作为普通像素删除目标。

原生 `cutSelectedCels` 此前对多选中的文字层也清除渲染像素，文字编辑数据却仍保留。本批在多单元格删除循环按所属图层kind过滤，复用既有复制、规范源去重、选区删除及历史。只有普通目标实际发生变化时才新增历史并清选区；单Cel分支及整格剪切不改。

四组新增场景覆盖活动普通／文字目标、普通层选区有／无像素，检查普通层按选区删除、文字像素与编辑数据不变、剪贴板仍包含文字选区像素、原单元格选择、历史／dirty／像素选区、保存重开和Undo／Redo。特殊瓦片路径未扩大，未新增实际UI操作验收；实际检查结果见迁移计划。

本批实际结果：四组新增场景及既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖与diff检查通过；未执行实际UI操作验收。

## 后续补齐：选区剪切保留画布外像素（2026-11-02）

旧版 `workspace-cut.ts::cutWorkspaceItems` 的选区剪切委托 `deleteSelection`，最终由 `tools-fill.ts::clearSelection` 先通过 `tools-pixel-edit.ts::clampSelection` 将删除范围裁到画布，再与图层内容范围求交集。原生此前扫描完整Surface，仅判断原始选区，跨出画布的选区会删除画布外保留像素；复制分支却已裁到画布，导致未进入剪贴板的像素被删除。

本批按旧版取画布、选区与Surface的交集，仅遍历相交区域，继续使用原始选区的蒙版判断。复制协议、Surface几何、特殊目标过滤、关联源去重和既有一次历史保持。完整Surface快照仍沿用现有事务；本批不声明消除了快照复制成本。

四组场景覆盖单／多Cel、矩形／带孔蒙版，验证画布四侧像素与蒙版孔保留、画布内内容删除、剪贴板维持画布裁切、稀疏几何、一次历史、保存重开与Undo／Redo。未扩展画布外复制协议或特殊瓦片路径，未执行实际UI操作验收。

本批实际结果：四组新增场景及既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖与diff检查通过；未执行实际UI操作验收。

## 后续补齐：选区粘贴追加帧的空白单元格（2026-11-02）

旧版 `workspace-paste-cel-selection.ts::pasteCelSelection` 追加帧后调用 `animation.ts::ensureAnimationDocument`。当前活动帧仍是旧帧，因此新增帧的缺失槽通过 `blankSurfaceFromLayer` 使用1×1、零偏移透明存储，并继承所属图层的opacity。此路径没有调用整格同工程粘贴的 `inheritAnimationFrameCelLinks`，即使旁层开启自动关联，也保留独立空槽。

原生此前为每个新增槽分配整张画布，并固定opacity为1。本批在 `beginCelSelectionPaste` 按旧版补槽规则初始化，继续复用既有预览、取消、Surface扩展及完整时间轴历史。未改动密集预算准入，未扩展特殊资源路径。

八组场景覆盖同／跨工程、普通／文字旁层和0%／35%目标透明度，检查新目标实际粘贴像素与透明度，旁层1×1独立空白、不继承文字元数据，既有内容保持，预览取消恢复结构／选区／dirty，以及一次历史、保存重开和Undo／Redo。未执行实际UI操作验收。

本批实际结果：八组新增场景及既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖及diff检查通过；未执行实际UI操作验收。

## 后续补齐：稀疏多帧工程的选区粘贴预算（2026-11-02）

旧版 `workspace-paste-cel-selection.ts::pasteCelSelection` 按载荷建立预览，追加帧交由 `animation.ts::ensureAnimationDocument` 补稀疏空槽，没有以画布面积乘全部层帧计算的密集准入限制。原生已有实际存储预算和浮动预览保护，但 `beginCelSelectionPaste` 更早的密集估算会拒绝实际仅存储少量像素的多帧工程，即使无需追加帧也会拒绝。

本批前置预算按已有Surface的实际像素字节和新增1×1槽计算，保留256MiB技术保护与10000帧限制。后续 `checkFloatingBudget` 继续覆盖实际预览、回滚及历史快照成本，不取消内存保护，不声称降低所有操作的内存成本。

八组场景覆盖同／跨工程、追加／不追加及512×512的300帧、1024×1024的70帧稀疏工程；这些工程按原密集估算均超过256MiB，实际各槽仅1×1。检查复制像素、未修改槽的稀疏存储、预览取消、一次历史、保存重开及Undo／Redo。未执行实际UI操作或耗时基准验收。

本批实际结果：八组新增场景及既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖和diff检查通过；未执行实际UI操作或耗时基准验收。

## 后续补齐：无内容变化的选区粘贴历史（2026-11-02）

旧版 `workspace-commands-selection-floating.ts::commitFloatingPaste` 的多目标分支逐目标提交 `commitPixelEdit`。没有像素编辑时，仅在选区变化后新增 `documentChanged:false` 的选区历史；像素与选区完全相同时不push，保留旧redo分支和保存状态。

原生对所有带 `beforeCelTimeline` 的选区Cel粘贴均提交完整时间轴历史，即使粘回相同不透明像素也标为作品修改。本批在没有追加帧的路径，依据既有preview Delta的净变化判断实际像素修改；没有净变化时复用普通选区历史规则，不记录完整时间轴快照。预览可能产生的既有稀疏存储扩展策略保持，本批不声明调整其存储回收行为。

八组场景覆盖同／跨工程、密集／稀疏Surface及选区变／不变，检查像素、浮动状态、dirty、历史位置、原redo可用、保存重开和选区Undo／Redo。追加帧但没有像素修改的旧版结构历史行为仍待独立核对，本批不变更；未执行实际UI操作验收。

本批实际结果：八组新增场景及既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖和diff检查通过；未执行实际UI操作验收。

## 后续补齐：选区复制的实际内容边界与共同坐标（2026-11-02）

旧版 `workspace-animation-cel-links.ts::snapshotLinkedAnimationCels` 调用 `workspace-animation-cel-conversion.ts::clipAnimationCelToSelection`：每个规范源按世界坐标将选区与Surface求交，不裁到画布；无交集维度保留1像素透明fallback。裁切快照清除文字、瓦片和自由瓦片编辑数据。随后 `workspace-paste-cel-selection.ts::pasteCelSelection` 用所有裁切Surface的并集建立共同变换坐标。

原生此前统一裁到画布，导致画布外内容无法复制、稀疏源的选区边界偏大；同时Cel快照保留完整Surface和文字数据，未表达选区复制的实际内容。本批直接承接逐源裁切规则，在Cel快照保存各自裁切Surface，再将像素填入共同并集大小的SelectionClipboard，以适配现有多目标浮动接口。保留关联重定根、alpha蒙版和原有技术预算保护；不增加新的剪贴板协议。

四组普通／文字层与矩形／带孔蒙版场景覆盖两种不同偏移的稀疏源，检查画布外像素、各自截取范围、共同坐标、文字编辑数据清除而源内容保持；移动到画布内后验证实际粘贴、保存重开及Undo／Redo，另覆盖无交集的1×1透明fallback。原画布外剪切回归更新为剪贴板保留完整选中内容，删除仍按旧版clearSelection裁到画布。此前各批“复制保持画布裁切”的描述仅代表当时范围，本批已纠正。

原地向画布外写入的浮动变换限制未在本批承接，不声明画布外粘贴全部等价；未执行实际UI操作验收。

本批实际结果：四组新增场景、更新后的画布外剪切回归及既有 `free-tile-project-tests`、`cel-selection-clipboard-tests` 均通过；唯一正式Release构建、542文件来源覆盖和diff检查通过。未执行实际UI操作验收。

## 后续补齐：大范围单元格复制的选择筛选（2026-11-02）

旧版 `workspace-commands-animation-cel-clipboard.ts::copySelectedAnimationCels` 先将选中键放入Set，遍历Cel时使用成员判断，再按图层／帧排序。原生此前对每个图层帧槽线性查找整个选中ID列表，选择越多，重复比较越多。

本批复用旧版集合筛选方案，创建一次 `unordered_set`，同时供既有关联重定根判断使用；仍按原图层／帧遍历，复制顺序、锚点、像素和关联语义保持。只是成员筛选从逐格线性查找改为集合查找，不声明耗时基准或整个剪贴板性能已经完成迁移。

四组整格／选区和独立／关联场景使用24层、20帧，共480格，逆序选择其中320格；检查准确输出集合、图层／帧顺序、相对锚点、规范源内容、关联根自包含、历史与dirty保持。

另经 `selection-transform-targets.ts::applySelectionTransformLayerState`、`tools-selection-transform-apply.ts` 核对，旧版浮动变换实际也对画布内写入做边界判断。此前“原地画布外粘贴限制未承接”表示未核对范围，并非已确认的新旧差异；本批没有扩大原生写入范围。未执行实际UI操作验收。

本批实际结果：四组新增场景及既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖及diff检查通过；未执行实际UI操作或耗时基准验收。

## 后续补齐：单元格复制按实际存储遍历（2026-11-02）

旧版 `workspace-commands-animation-cel-clipboard.ts::copySelectedAnimationCels` 直接遍历 `timeline.cels`，通过选择Set筛选，再经图层和帧索引排序。上一批原生已承接Set，但仍对图层×帧网格逐槽调用findCel。本批继续承接旧版实际Cel遍历，复用Timeline已有图层／帧ID索引取得坐标，再只对选中结果排序。关联重定根和截取逻辑保持。

原大范围复制回归扩展为八组：整格／选区、独立／关联、有序／乱序实际Cel存储。乱序场景将480个实际单元格逆序并旋转，仍逆序选择其中320格，检查结果集合、图层／帧顺序、相对锚点、规范源像素和自包含关联根。未执行实际UI操作或耗时基准验收，不声明整体复制性能迁移完成。

本批实际结果：扩展后的八组范围复制场景及既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖和diff检查通过；未执行实际UI或耗时基准验收。

## 后续补齐：整格粘贴的稀疏追加槽与图层默认值（2026-11-02）

旧版 `workspace-commands-animation-cel-clipboard.ts` 的整格同／跨工程粘贴，追加帧后调用 `animation.ts::ensureAnimationDocument`，缺失的非活动普通／文字槽经 `blankSurfaceFromLayer` 使用1×1、零偏移透明Surface，并继承图层opacity。同工程对未覆盖层继续调用 `inheritAnimationFrameCelLinks`，跨工程保留独立空槽。

原生此前为所有追加槽分配整张画布并设置opacity为1，且前置密集估算会误拒绝稀疏多帧工程。本批统一承接旧版补槽规则，既有working budget的新增槽成本按一个像素计费，移除画布面积乘全部层帧的重复密集估算；原有真实Surface／蒙版／剪贴板预算、快照倍率、256MiB保护和10000帧上限继续保留。自动关联与被覆盖槽的完整像素／属性事务保持，特殊资源路径不扩展。

八组同／跨工程、普通／文字旁层和autoLink开／关场景使用1024×1024、70帧的稀疏工程，验证整格粘贴准入、新帧像素／透明度、旁层独立1×1空槽或同工程继承、文字数据规则、旧内容保持、一次历史、保存重开和Undo／Redo。未执行实际UI操作或耗时基准验收。

本批实际结果：八组新增场景及既有 `free-tile-project-tests` 通过；`cel-selection-clipboard-tests` 中原要求2×2密集空槽的跨工程断言按旧版改为1×1后整套通过。唯一正式Release构建、542文件来源覆盖及diff检查通过；未执行实际UI操作或耗时基准验收。
