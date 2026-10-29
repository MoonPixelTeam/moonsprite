# 自由瓦片选区内容平移

本批承接 legacy 的选区拖动分派，不改变 UI 布局、素材或工具入口。

## 行为

- 选区完整覆盖主选实例及所选可编辑实例的联合边界，而且未按复制修饰键时，拖动实例位置；不会改动共享源。松开鼠标提交一条历史。
- 部分选区或复制拖动读取主选实例的原始源像素；移动先清除遮罩内的源像素，再把捕获像素叠加到目标，复制保留原像素。遮罩空洞不改动。
- 使用实例旋转、镜像及源／Cel 偏移转换坐标；不以画布合成结果或实例透明度代替源像素。
- 复用既有 `publishFreeTileSourceStroke` 的逆变换、透明裁边、原子发布和所有共享引用缓存更新。
- 部分像素拖动松手后保留浮动状态，后续操作确认；画笔／橡皮／抓手按钮和缩放、喷枪、取色器入口补上旧版 `setTool` 的确认规则；Escape 取消并恢复源和选区。提交记录一条内容及选区历史，撤销／重做恢复双方。
- 选区移动结果按 legacy `shiftSelection` 裁到文档；源和实例可移出文档，内容仍保存。零位移不制造内容历史。
- 图层、实例及源的可见／锁定状态遵循上一批建立的编辑资格；无目标或选区完全不交于实例时不开始。

## 来源与适配

`canvas-input-selection-begin.ts` 的 `onlySelectedFreeTileInstance` 分派；`canvas-input-free-tile.ts` 的实例平移与松手提交；`useCanvasSelectionTransform.ts` 的源范围与捕获；`tools-selection-transform-translation.ts` 的清除后叠加；`workspace-commands-selection-floating.ts` 及 `workspace-free-tile-transaction.ts` 的确认／取消与历史。

原生仍采用现有 256px 源尺寸、16M 临时像素预算和历史实现，超限拒绝发布，不伪称完全复用旧版性能。缩放、旋转、斜切及多帧自由瓦片变换继续明确标记未迁移。

## 验证

核心测试 `free-tile-project-tests` 通过：16 种旋转／镜像组合、移动／复制的逐像素清除与叠加、共享缓存、取消、零位移、越界选区、撤销／重做。正式 Release 构建和 `--layer-context-check` 通过，覆盖整实例鼠标松手提交、部分源浮动、工具切换确认、Ctrl 复制及 Escape 取消。来源覆盖 515 个文件，差异格式检查通过。本批不涉及素材外观调整，未另做图像外观验收。
