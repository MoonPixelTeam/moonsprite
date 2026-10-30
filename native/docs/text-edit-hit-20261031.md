# 文字编辑命中范围

旧版来源：`legacy/src/renderer/src/components/useCanvasTextPreview.ts::textLayerAt`、`canvas-pointer-down.ts`、`canvas-input-text.ts`；蒙版后的可见alpha见`legacy/src/renderer/src/core/document-model.ts::readLayerVisibleColorAt`。

原生此前跳过全部非文字层，导致点击穿透；无框文字也缺少点击留白。现在按旧版视觉堆叠顺序查找，非文字层的可见像素阻挡下方文字，透明处继续；隐藏及锁定层跳过。阻挡alpha使用既有蒙版解析和覆盖函数，不计算一张新合成图。无框文字使用surface范围加max(2,ceil(fontSize/2))留白，固定框使用surface位置和框尺寸。已选文本框的内部拖动与边缘缩放先于一般堆叠命中，继续使用统一sheet边框命中。

正式Release构建与`--text-tool-check`通过。实际指针检查覆盖上层不透明像素阻挡、透明处命中文字留白、隐藏／锁定上层跳过、编辑弹窗取消；直接边界检查覆盖半字号、最小2px及右下端不包含。蒙版遮挡与已选框优先级完成源码核对，本批未新增这两项实际指针用例。既有文字检查同次通过。来源覆盖515文件及快照通过，无新素材／布局或长期性能验收。

本批未开放Alt复制文字拖动等其它未迁移交互，不代表整个文字模块完成。
