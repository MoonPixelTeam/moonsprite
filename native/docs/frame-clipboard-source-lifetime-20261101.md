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
