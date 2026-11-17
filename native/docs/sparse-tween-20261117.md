# 补间空槽迁移

旧版实际依据：`legacy/src/renderer/src/core/animation-tween.ts:281-310` 在非 between 目标或非目标图层没有 resolved Cel 与 surface 时跳过该槽；选中的 between 目标仍生成补间内容。`workspace-commands-animation-tween.ts` 插入生成的稀疏 Cel 集合并记录结构历史。

原生交叉淡化候选不再给不存在的非目标槽额外创建空白 Cel。变换与 between 事务允许缺失槽，活动不透明度投影跳过空槽，保留已有链接验证。

两项定向 Release 构建及 animation-transform／animation-crossfade CTest 通过（0.34 秒）。新增 Current／All 空图层样本，验证生成、撤销、重做及编码后的槽存在性。测试初始化沿用 Aseprite 导入所需的显示几何。原生工程导入会规范化缺失槽，编码检查未据此宣称重新打开仍保留稀疏结构。

本批未重建正式 GUI、未新增人工视觉验收。混合瓦片工程准入继续保留，整体迁移未完成。
