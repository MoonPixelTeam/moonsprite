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
