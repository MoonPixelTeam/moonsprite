# 自由瓦片实例属性（2026-10-28）

本批承接实例属性弹窗，不代表 TI-004 全量迁移完成。

## 来源与行为

- `legacy/src/renderer/src/components/FreeTileInstancePropertiesDialog.tsx`：混合模式、透明度、旋转、水平/垂直镜像、世界坐标 X/Y；只有操作过的字段进入累计补丁。坐标失焦标准化不能把未操作字段加入多选编辑。
- `legacy/src/renderer/src/store/workspace-free-tile-properties.ts::instanceAfterChanges`：从打开时快照预览；先旋转后镜像；改变方向保留原世界包围盒左上角；X/Y 修改变换后的世界位置。自身锁定只跳过几何，仍修改透明度/混合模式；源与图层继承锁不阻止此属性编辑。继承字段与源相同时保留缺省；已有显式覆盖继续显式保存。
- `legacy/src/renderer/src/components/panels/FreeTileInstanceLayers.tsx::openProperties`：行尾属性按钮、右键属性和可配置快捷键；点击已选实例编辑当前选择，否则先单选该实例。快捷键使用当前主实例，空时使用首个有效选择；不新增默认快捷键。
- `legacy/src/renderer/src/components/PixelUtilityIcon.tsx`：复用 properties、selectionFlipHorizontal、selectionFlipVertical；镜像图标保留原路径与 .42 半透明层，通过现有 SVG 光栅器转换，源码 SVG 与 PNG 位于 assets/utility-icons。

## 原生适配

复用现有 Document 的目标 cel 放置事务、撤销历史、工程读写与渲染缓存；弹窗复用 PixelDialog、PixelEntry、PixelSlider、PixelDropdown 与 PixelButton，皮肤继续来自现有 sheet。分段控件重叠一个逻辑像素共用描边。正常关闭、Esc、Enter 与点击外部均提交一次历史；异常退出回滚。无变化不占用历史、不清掉重做。仅修改当前 cel，不追链接、不改变共享源与其他 cel。

保留原生已有整数坐标边界保护：若换算后的存储坐标超过 ±67108864，整次预览拒绝，不做部分应用。现有目标缓存仍按固定尺寸重渲染，未声称实现 legacy 的画布外增长或性能等价。

## 验收记录

- `free-tile-project-tests.exe` 已通过：累计多选补丁、世界包围盒坐标、非正方形旋转、锁定过滤、继承与显式覆盖、取消、无变化保留重做、单次历史、源/其他 cel 隔离及保存重开。
- `check-legacy-provenance.py` 覆盖 513 文件及来源快照通过；整体仍为 INCOMPLETE。
- 正式 Release 程序构建通过，`--layer-context-check` 退出码 0：实际实例属性弹窗的混合模式、透明度、旋转、镜像和 X 接线，以及 Esc 关闭提交一次历史、撤销还原均通过；同时检查未改 Y 的失焦不会进入补丁。本批未做完整界面图像验收。
- 运行检查发现并修复原生焦点适配问题：弹窗获得焦点时，画布失焦原本调用笔画取消并误撤销属性事务；现在保留属性预览，由弹窗正常关闭提交，其他笔画仍按原规则取消。

## 仍未迁移

独立实例栏目设置、实例闪烁及画布外缓存扩展仍需承接；不因本批弹窗完成标记整个自由瓦片模块完成。

## 右键菜单补齐（2026-10-28）

按 `FreeTileInstanceLayers.tsx` 的顺序接入仅显示、属性、顺时针旋转90°、水平镜像、垂直镜像、删除。右键未选实例先单选，右键已选实例保留多选；属性/删除使用选择集合，快捷变换只处理右键目标，成功后单选目标。自身锁定禁用几何菜单；继承锁不阻止属性变换。仅显示覆盖当前cel所有实例的可见性，允许锁定目标；不修改源和其他cel。

快捷变换复用已有属性事务，保留世界包围盒左上角；无变化不产生历史、不清重做、不改变选择。正常变更一次撤销，历史不恢复实例选择。新增旋转图标来自 `PixelUtilityIcon.tsx`，与两个镜像图标一起放入 sheet 的 y=764、x=72至132，每个11×11，常态/禁用态分别登记 XML 和索引。图标仅转换格式，未重新设计。

新增检查覆盖单实例作用域、非方形四次旋转、镜像位置、锁定、无变化、撤销重做、源及其他cel隔离、仅显示保存重开；实际UI检查通过共享菜单构造触发相同Click接线。验证结果：正式 Release 构建通过；更新后 free-tile-project-tests 通过；正式程序 --layer-context-check 退出码0，共享菜单中仅显示、旋转、两个镜像的实际Click及撤销均通过。6块新增sheet区域与来源PNG逐像素一致。来源登记覆盖513文件通过，整体迁移仍为INCOMPLETE。本轮未做完整视觉验收。

## 实例行拖动排序（2026-10-28）

复用 `FreeTileInstanceLayers.tsx` 的4px拖动阈值、锁定行不可拖、按指针Y选择目标行及before/after位置；显示顺序反转的实例数组以符合遮挡顺序。多选状态下只移动拖动源实例。悬停时用 legacy `.layer-drop-indicator` 的主题强调色2px线与两端箭头显示插入位置；Escape、焦点丢失或切换cel取消。松手调用 `reorderFreeTileInstance` 对应语义，单次历史；选择集合保留，拖动实例成为主项；undo/redo不另改选择。

专项测试验证before/after顺序、无效/锁定/no-op不占历史、多选只移动一个实例、缓存、共享资源/其他cel隔离及保存重开。实际UI smoke模拟面板行拖动并验证提交及撤销，正式程序 `--layer-context-check` 退出码0。使用已有accent主题色绘制 CSS 指示器，没有引入新图标素材。

## 实例复制、剪切与粘贴（2026-10-28）

按 `workspace-free-tile-instance-clipboard.ts` 和 `workspace-commands-clipboard.ts` 实现：复制当前选中的实例和引用源；复制只更新应用内图层剪贴板。剪切先复制，再通过可撤销删除命令移除选中项。粘贴同一文档、同一集合时复用已有源；跨文档时为源和 tileset 生成新ID并导入资源。源 cel offset 与目标 cel offset 参与坐标换算以保持实例世界坐标。粘贴实例成为选中项；撤销恢复原内容及粘贴前选择，重做恢复粘贴。其他类型的复制会替换实例剪贴板。

数据专项测试覆盖多选捕获、同文档复用、跨文档导入、世界位置、共享资源、保存重开、锁定目标拒绝以及撤销重做。实际菜单 smoke 通过 copy/paste 命令完成操作并验证撤销恢复选择。来源登记检查覆盖513文件通过；正式 Release 构建通过，`free-tile-project-tests.exe` 通过，实际 `--layer-context-check` 退出码0。未做完整视觉验收。此批覆盖原生实例视图中的应用内实例复制/剪切/粘贴；系统剪贴板外部图像优先级、非实例视图的实例粘贴，以及画布外缓存扩展仍需迁移，不标记整个剪贴板领域完成。

## 实例闪烁反馈（2026-10-29）

依据 `useCanvasLayerFeedback.ts`、`canvas-render-content.ts`、`canvas-input-free-tile.ts` 与 `FreeTileInstanceLayers.tsx` 接入短暂实例反馈。面板新选/修饰键选择在按下时触发，已选行重复点击在未发生拖动的松开时触发；右键或属性入口需要先选择未选行时也触发。行拖动排序完成本身不另闪烁。画布开始移动时以实际抓取实例为目标，包括多选中并非主项的实例。使用现有“移动图层点击闪烁”开关及 80/120/180ms 时长。反馈按源亮度大于145取黑、其余取白，保留源 alpha，不套用实例显隐、混合模式或源/实例透明度；源隐藏时不绘制。按实例旋转与镜像、源偏移和 cel 偏移映射回画布，裁剪文档外部分。未变化时复用 surface，内容/移动修订变化时重建；不更改 cel、历史、源瓦片或实例属性。

本原生适配没有复制旧版 DOM 自定义事件，而由面板和画布入口直接调用 Editor 的瞬态反馈方法。时长在触发时固定，一次性计时器到期释放反馈图片；修改设置不改变已触发反馈的时长，不做每16ms的无变化重绘。

验证结果：正式 Release 构建通过，`free-tile-project-tests.exe` 通过，正式程序 `--layer-context-check` 退出码0。新增检查覆盖实际面板行选择触发、4种旋转×4种镜像组合、源偏移、黑白亮度阈值与半透明alpha、忽略源/实例透明度及实例显隐、图片复用、固定时长、到期释放、关闭开关以及文档和历史不变。来源登记覆盖513文件通过；本轮未做完整视觉验收。面板设置独立化、重复画布反馈及画布外缓存扩展仍未迁移，不标记整个自由瓦片模块完成。
