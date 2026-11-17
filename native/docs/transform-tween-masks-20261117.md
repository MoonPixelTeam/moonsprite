# 变换补间图层蒙版事务

来源：实际 `legacy/src/renderer/src/core/animation-tween.ts::prepareAnimationTweenFrame` 的 maskOutput。解析链接蒙版，选中且未锁定、启用随层移动的图层蒙版使用同一 tweenSurface；其它蒙版独立复制并清除链接。

原生候选帧携带蒙版，预览合成接入这些蒙版；生成时分配新蒙版 ID 和帧槽，复用已有 beforeMasks／afterMasks 帧历史，画布扩展时同步偏移。既有混合特殊工程生成门禁保留。

构建 animation-transform-tests 成功，定向 CTest animation-transform 通过（0.24 秒）。新增四种锁定／随层移动组合验证生成位置、新身份、单次历史、Undo／Redo 及工程编码重读。未更新正式 GUI 程序，未做人工图像验收。选中组蒙版变换、交叉淡化／形变蒙版插值仍待迁移，不宣称补间整体完成。
