# 补间自动画布的样式边界

实际旧版依据：`legacy/src/renderer/src/core/animation-tween.ts:395-419` 在内容边界上应用图层样式，再沿父组逐级应用组样式，最后与原画布合并。

原生共享补间画布边界函数复用 layerStyleOutputBounds，补上图层及嵌套组描边、阴影外扩，并保留循环父组防护。变换与 between 生成共同使用此函数。

定向 Release 构建及 animation-transform／animation-crossfade 两项 CTest 通过（0.49 秒）。新增嵌套描边、偏移阴影及禁用样式检查。本批未更新正式 GUI，未新增人工视觉验收；整体迁移未完成。
