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
