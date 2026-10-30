# 文字框内部拖动的作用范围

## 旧版证据

- `components/canvas-stage-helpers.ts::selectedTextBoxForSession`：单选文字层且为固定文本框时提供交互边界，组及多层选择不作为单个文字框。
- `components/canvas-input-text.ts::beginSelectedTextBoxMove` / `moveTextTransform`：框内部拖动使用文字框事务，跨过已有拖动阈值后更新位置，未移动的点击继续打开文字编辑器。
- `store/workspace-commands-selection-transform.ts::previewTextBoxTransform`：尺寸不变时调用 `setAnimationCelOffsets`，不修改像素选区或附着蒙版。
- `core/animation.ts::setAnimationCelOffsetsForKeys`：解析链接Cel所有者，仅平移文字数据与surface偏移。取消恢复原文字和位置；完成记录一次变换历史。

以上路径均在 `legacy/src/renderer/src/` 下，快照见来源索引。

## 原生适配

此前文字框内部拖动直接调用移动工具的广义事务，会连带移动像素选区和启用“随内容移动”的蒙版。

现在为现有移动事务增加明确的 `LayerMoveScope::TextBox`。文字框入口指定该范围，预览仍复用原来的所有者解析、坐标验证、文字平移和增量区域刷新；只记录位置与文字元数据，不捕获选区、轴心或蒙版，不复制字形像素。取消保留当前选区，确认和撤销／重做也不改动它。其它调用方默认仍是 `ContentAndSelection`，其联动行为保持原状。

文字框绘制、指针入口和文档入口使用一致的单层选择条件。临时抓手、点击打开编辑器、边缘调整大小沿用既有路径。

## 定向验证

- `text-document-tests`：链接所有者及文字变换同步、像素存储地址不变、重复预览不累加、零位移不增历史、取消、一次提交、撤销／重做、保存重开、锁定／隐藏／复制门禁；对照普通移动工具仍联动选区和蒙版。
- `--text-tool-check`：通过文字框内部的实际按下／移动／释放与Escape检查选择范围、蒙版位置、像素存储、历史粒度及撤销／重做。

本批不修改皮肤素材或组件排版；未新增图像检查或长期性能测试，不代表整个文字领域迁移完成。
