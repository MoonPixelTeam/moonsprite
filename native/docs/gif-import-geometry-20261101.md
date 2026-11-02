# GIF时间轴导入：尺寸、位置与帧属性（2026-11-01）

对应动画帧／跨工程内容承接需求AN-001、AN-003。本批继续迁移已有GIF时间轴导入入口，没有新增导入入口或改变布局。

## 旧版依据与实际缺口

`legacy/src/renderer/src/store/workspace-commands-animation-frame.ts::importGifAnimationLayer`保留源Surface的宽高与offset，承接每个源Cel的透明度和zIndex；源与目标文档不要求同尺寸。`legacy/src/renderer/src/store/workspace-gif-import.test.ts`使用1×1源导入2×2工程，并逐个验证起点0、1、2、3。

native此前仅允许同尺寸、铺满画布、零偏移、默认透明度／zIndex的内容。现在通过已有`raster::validate`校验源Surface，保留其几何、存储原点、像素及每个源槽的透明度／zIndex。导入到较大或较小画布不重采样，不裁掉画布外内容，目标画布尺寸不变。导入结果仍是独立普通像素Cel，不携带文字／瓦片编辑数据或源Cel链接。

## 沿用的时序与事务

起点继续限制到目标时间轴范围内。已有时间槽保留身份、时长与禁用状态，只向新图层写入导入内容；超出已有时间轴的部分才按对应源帧的时长与禁用状态追加。原有图层在新增时间槽中补空白Cel，新图层未覆盖的时间槽保持空白。选中导入Cel，激活首个导入槽。

浮动选区沿用先提交原来的内容变换、再提交导入的一次结构历史；既有失败校验仍在提交浮动选区前。保留帧数／图层数／密集像素限制，并复用Cel粘贴的稀疏工作预算，计入现有Cel与蒙版、导入源Surface和新空槽。

## 实际验证与边界

`free-tile-project-tests`新增较大／较小目标画布和四种起点共8组场景，验证偏移稀疏Surface、透明度／zIndex、独立Cel、已有槽保护、溢出帧属性、空槽、选择、Undo／Redo与保存重开；实际通过。

既有`cel-selection-clipboard-tests`和`moon-core-tests`实际通过，含浮动选区提交、起点越界限制及时间槽承接的原有检查。正式Release主程序构建成功，来源覆盖检查通过。没有新增实际OS拖放或GIF文件选择的人工验收，不把核心检查描述为人工界面验收。

目标编辑文档仍限RGBA；索引／灰度模式转换、特殊瓦片目标及整个GIF模块的全部等价性不在本批完成声明内。

## 后续补齐：导入后的编辑目标和选择历史

旧版`workspace-commands-animation-frame.ts::importGifAnimationLayer`在导入前后捕获动画选择历史，导入时清除活动蒙版和隔离视图，通过`applyLayerRowSelection`选中新图层；Undo／Redo调用`workspace-animation-selection-history.ts::restoreAnimationSelectionHistory`恢复上下文。

native此前只更新活动层、帧和部分时间轴选择，可能留下旧蒙版编辑目标或组选中，导致新图层绘制入口仍不可用。本批复用已有`Edit::MaskContextHistory`及`GroupUiSnapshot`：导入后退出旧蒙版编辑，清除组选中并选中新层，保留组结构和折叠显示；Undo恢复原活动层／帧、蒙版及隔离状态、组选中和原时间轴行，Redo回到新图层。不新增历史类型或独立选择管理器。

新增四组核心场景覆盖图层／组蒙版与隔离开／关，检查导入后一条历史、普通绘图可用、立即绘制不改变旧蒙版、组折叠显示、Undo／Redo。`free-tile-project-tests`、`cel-selection-clipboard-tests`和`moon-core-tests`实际通过，正式Release构建成功，来源覆盖检查通过。此批是状态／事务检查，没有新增实际鼠标拖放或截图验收。

## GIF 空槽几何与稀疏预算（2026-11-02）

旧版导入以源活动图层尺寸／offset创建新图层，调用 `ensureAnimationDocument` 补齐所有帧槽，再写入导入范围。`animation.ts` 中非活动缺失槽为1×1／零偏移、透明度继承图层；原活动槽由图层显示存储创建。因此新图层未被导入覆盖的原活动帧应保留源活动图层几何，其余空槽为1×1，不能统一扩成目标画布。

本批同时修正实际分配与准入预算：按旧存储、源Surface、新增1×1槽及必要活动空槽几何计算既有256MiB working budget，移除画布宽×高×层×帧的密集误拒绝；保持层／帧上限、导入范围的原像素／透明度／zIndex及时间槽语义。六组1024×1024／80帧／两层稀疏工程覆盖起点0／79／80、0%／35%旧层透明度、文字旁层、活动空槽的源几何、追加时间与disabled、保存重开和Undo／Redo；另检查空槽远点绘制及邻帧保持。未扩大RGBA之外的目标转换范围，未做实际OS拖放或耗时基准验收。

本批实际结果：六组新增稀疏场景与既有 `free-tile-project-tests` 通过；唯一正式 Release 程序构建、542 文件来源覆盖及 diff 检查通过。新回归核对撤销后的结构、活动帧、历史位置和内容，不要求现有撤销策略自动清除修改标记。未执行实际 OS 拖放或耗时基准验收。
