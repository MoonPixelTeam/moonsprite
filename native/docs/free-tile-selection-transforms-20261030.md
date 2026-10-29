# 自由瓦片选区缩放、旋转和斜切

## 承接行为

自由瓦片 Edit 模式下，对主选可编辑实例的像素选区接入现有变换手柄，以及工具属性中的宽、高、角度和旋转算法选择。复用普通选区的轴心、修饰键、捕获与 Escape 路由；跨边缩放使用原有镜像语义，不新增布局或素材。

- 整选区普通平移仍走实例位置事务；非平移变换改为编辑主实例原始共享源，不移动所选实例位置。
- 捕获源不带实例透明度、样式或其它图层合成；先在临时栅格中恢复源基线，移动清除原选区像素，复制保留原像素，再调用既有快速／RotSprite 采样与 source-over 合成。
- 预览结果经既有源写回适配器逆实例旋转／镜像、透明裁边，更新所有引用的层和帧缓存。临时工作区包含原源、原选区及变换后边界，源内容允许超过文档边界；显示选区裁到文档。
- 保留非整数变换原点；每次预览从捕获基线重算，不把上一预览再次旋转。RotSprite 源缓存跟随本次浮动事务。
- 松开手柄后保留浮动，切换工具确认；Escape 恢复源和选区。确认记录一条内容与选区历史，撤销／重做同时恢复。没有像素或选区变化的操作不新增历史。
- 超出预算的预览在发布前拒绝，保留上次有效结果；取消仍能回到手势前基线。

## 来源与必要原生适配

- `legacy/src/renderer/src/components/canvas-input-selection-begin.ts`：整实例移动和像素变换的分派。
- `legacy/src/renderer/src/components/useCanvasSelectionTransform.ts`：原始源捕获、局部目标坐标、预览撤回和重算、旋转算法、选区几何。
- `legacy/src/renderer/src/components/canvas-input-free-tile.ts`：变换松手保持浮动及历史标签。
- `legacy/src/renderer/src/core/tools-selection-transform-apply.ts`：清除原选区、快速路径和变换像素合成。
- `legacy/src/renderer/src/core/free-tile-edit.ts`：源编辑栅格、逆变换与裁边。
- `legacy/src/renderer/src/store/workspace-commands-selection-floating.ts`：确认、取消和历史。

原生复用已迁移的 `fastSelectionTransformCells`、`rotSpriteSelectionCells` 和 `publishFreeTileSourceStroke`；保留现有 256px 单源尺寸、16M 临时像素预算和时间轴快照历史。为承接越界目标扩展临时栅格，未宣称与旧版内存分配及细粒度历史完全一致。整体工程迁移仍未完成。

## 验收范围

`free-tile-project-tests` 已通过：实例四种旋转与水平镜像、移动／复制、两种算法、倍数缩放、90°／37°旋转、横／纵斜切及镜像组合，与现有普通栅格事务逐像素对照；共享缓存、实例位置、取消、单条历史、无效操作、保存重开、撤销／重做及超限拒绝。

正式 Release 构建与 `--free-tile-transform-check` 退出 0：实际鼠标缩放手柄、Escape 恢复、宽／角度输入、共享下拉组件切换旋转算法、工具切换确认和撤销通过。补充半透明图片先缩放再旋转的两算法核心回归通过。来源覆盖 515 个文件通过，整体仍 INCOMPLETE；差异格式检查通过。

完整 `--layer-context-check` 本次未取得完成结果，改为上述定向检查，不报告为通过。首次定向脚本误把算法下拉框当开关，打开菜单后阻塞；已改用既有 `PixelDropdown::setSelectedIndex(...,true)` 的选择回调并通过。本批不调整 UI 素材外观，未额外进行截图外观验收。

## 保留缺口

多帧自由瓦片变换、全局菜单的整层变换／翻转／旋转和四角自由变换入口仍分别禁用；不能由本批手柄及数值属性完成推断它们已接通。Paint 模式及目标隐藏／锁定约束保留。其它领域仍以需求覆盖表为准。
