# 交叉淡化与形变补间图层蒙版

实际来源：`legacy/src/renderer/src/core/animation-tween.ts::maskOutput`、`core/animation-tween-masks.ts::betweenTweenMask`。缺失或隐藏蒙版作为中性覆盖率，在所属内容空间采样并插值；锁定端点沿用独立复制。

原生接入图层蒙版候选、预览合成、新帧身份、画布偏移及现有 beforeMasks／afterMasks 撤销事务。未选中组蒙版独立复制，选中组蒙版插值仍待完成；混合特殊工程生成门禁保留。

定向构建成功，animation-crossfade CTest 通过（0.17 秒）。覆盖交叉淡化／形变 × 锁定／未锁定 × 缺失／存在结束蒙版，检查覆盖率、预览与提交一致、Undo／Redo 和工程编码重读。当前形变夹具端点内容边界相同，移动边界的独立验收仍待补齐。未构建正式 GUI 程序或进行人工图像验收，不宣称补间整体迁移完成。
