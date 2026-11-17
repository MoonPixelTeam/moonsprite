# 补间目标与 Cel 数据迁移

来源为实际 `legacy/src/renderer/src/core/animation-tween.ts`：animationTweenLayerIds 排除特殊、背景及锁定图层；prepareAnimationTweenFrame 对未参与补间的目标复制完整 resolved Cel。

原生交叉淡化和变换补间来源筛选补上 kind／background 排除；未参与补间的候选 Cel 复制完整数据，保留文字、自由实例和网格数据，清除候选身份及链接。复用既有像素与几何算法。

构建 animation-crossfade-tests、animation-transform-tests 成功，两项定向 CTest 通过（0.37 秒）。新增断言验证特殊文字层不进入补间目标、候选保留文字数据并清除旧身份／链接。未构建或更新正式 GUI 程序，未做人工图像验收。混合特殊工程 Document 生成门禁继续保留；完整蒙版补间及其历史事务尚未迁移，本阶段不宣称补间整体完成。
