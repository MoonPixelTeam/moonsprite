# 自由瓦片实例选择与移动（2026-10-28）

本批范围为 TI-004 的实例列表选择和移动工具拖动：从图层右键“打开实例图层”进入当前层的实例视图，返回按钮恢复普通图层和时间轴。不是 TI-004 整体完成。

## Legacy 依据

- `components/panels/LayersPanel.tsx::openFreeTileInstanceLayers`：拥有者图层、活动帧、有实例才开放入口；集成列表与返回图层。
- `components/panels/FreeTileInstanceLayers.tsx`、`store/workspace-free-tile-selection.ts`、`store/workspace-commands-free-tile.ts`：倒序列表、替换选择、Shift 范围锚点、Ctrl 切换且至少保留一项、主项回退、源和 Edit 模式同步、Paint 清除实例选择。
- `components/canvas-move-selection.ts::shouldUseFreeTileInstanceMove`、`components/canvas-input-free-tile.ts::beginInstanceMove/moveInstance/endInstanceMove`：实例上下文才移动实例；主选实例矩形优先于重叠顶层实例；透明像素仍属于矩形命中；起始项遵守实例锁、源锁和图层移动条件。多选伴随项按旧版仅筛掉隐藏和实例锁定项，不自行扩展成其他规则。
- `components/canvas-pointer-down.ts`、`canvas-pointer-move.ts`、`canvas-pointer-up.ts`：移动工具及临时移动入口、指针捕获、约束轴、一次事务预览与提交。
- `components/useCanvasTileTarget.ts`、`useCanvasSelectionOverlay.ts`：多选实例合并外框、已有像素选区优先、播放隐藏实例框、自由瓦片实例边框颜色偏好。
- `core/free-tile.ts`、`core/free-tile-document.ts`：源偏移、cel 偏移、先旋转后镜像的矩形及坐标语义。

上述路径均相对 `legacy/src/renderer/src/`，实际源码及证据快照登记于 `legacy-provenance.json`。

## 原生实现与适配

复用当前 Document 放置事务、自由瓦片源资源、cel 权威实例数据、既有历史和工程读写，不另造像素移动算法。预览每次从按下时各实例位置加同一位移，不累计误差，不改变实例方向、源像素、其他帧或共享层实例。一笔一条历史；无移动或移回原点不消耗历史和重做；Escape、失焦、捕获丢失及切换目标取消预览。

列表复用现有时间轴行素材、颜色继承、字体、皮肤、返回/状态图标及滚动条。多选描边只包名称区域，连续范围共用一个外框，分离范围各自绘制；描边素材边界和命中复用 Skin 三个公共接口，逐像素 alpha 一致性检查纳入本批运行检查。默认仍为 Fusion Pixel 10px、整体 2×。未设计或重画图标，缺失素材从旧版按原像素补入。

返回按钮使用旧版 `PixelUtilityIcon.tsx::left` 原始 5×5 路径，无损转换后补入现有 sheet 的 `icon.left`、`icon.left-disabled`（48,764／60,764），同步 XML、素材索引和导入脚本；没有重画图标。移动工具在拥有者实例视图中开放，普通自由瓦片层整体移动和未迁移切片工具仍禁用。

必要原生适配：集成视图在原图层栏目内切换；事务保留整个目标 cel 快照并重新渲染该 cel 的派生缓存。坐标范围沿用现有原生限制，非法位移在发布前整批拒绝，不截断部分实例。尚未等价承接所有 Legacy 增量渲染与脏区性能策略。

## 明确未完成

- 独立实例栏目及其位置设置没有在本批迁移，目前开放集成视图。
- 实例属性弹窗、排序及右键变换仍未完成。显隐/锁定拖扫、右键与键盘删除已在后续批次接通，见 [实例状态与删除](free-tile-instance-flags-delete-20261028.md)。
- 源工具的首选实例上下文、完整选区内容移动/变换、实例闪烁、跨工程剪贴板及更大尺寸缓存仍需后续承接。
- 当前缓存仍为既有画布大小，移出画布的实例位置会保留，但没有通过扩大派生 surface 展示画布外像素。不能声明全自由瓦片编辑或性能等价。

## 验证状态

- `free-tile-project-tests` 已通过：列表选择语义、全部旋转/镜像命中、重叠主项优先、隐藏/锁定、源与共享实例不变、预览/取消、一次历史、回原点、无操作重做栈、坐标拒绝、切换目标、保存重开及撤销重做。
- 正式 Release 构建成功，最新 `--layer-context-check` exit0：覆盖实际菜单入口、列表 Shift/Ctrl 消息、连续及分离选择描边 alpha/命中、移动工具栏启用及真实按钮点击、画布拖动/提交/撤销重做、Escape、Shift 释放更新、捕获丢失和真实返回按钮；未迁移切片及普通自由瓦片整层移动保持禁用。
- 本轮运行曾发现测试坐标被默认浮动瓦片栏目覆盖，画布拒绝绘制符合预期；仅将测试夹具栏目固定停靠，保留生产路径的窗口遮挡检查，没有修改用户实际工作区。重新编译后上述检查通过。
- 已查看 `build/Release/free-tile-instances.bmp`，检查复用时间轴素材、字体、颜色、分离选框和返回图标的显示；来源覆盖512文件及证据快照、修改文件 whitespace 检查通过。来源覆盖通过不代表完整行为等价。
- 未进行全量、长期运行或性能基准测试。

唯一正式程序仍为 `native/build/Release/moonsprite-native.exe`，启动入口仍为 `native/start-native.bat`。没有新建外部工程、工作树或预览版本。
