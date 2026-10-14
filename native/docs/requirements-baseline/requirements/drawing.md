# 绘图、颜色与像素处理语义需求

中文；返回[需求基线](../README.md)。

本页为规范候选，适用公共规则 [CO-001](core.md#co-001) 和[验收协议](../acceptance.md)。证据状态不代表本轮运行测试通过。所有未列出的参数默认值不得由实现者猜测，须进入[参数与冲突台账](../compatibility.md)。

<a id="dr-001"></a>
## DR-001 基础笔画与橡皮擦

- **目的与前置**：活动目标可编辑，可能有选区/蒙版。
- **输入、参数与范围**：铅笔、橡皮擦、基础形状、尺寸、颜色、透明度、完美像素、线连接。
- **作用对象**：当前帧当前目标及允许区域。
- **成功结果与不变量**：预览与提交一致；连续路径补齐；重复输入不意外累积同一笔透明度；透明擦除遵守颜色模式。
- **预览、确认、取消与历史**：一次笔画一次历史；取消恢复笔前像素；参数偏好不进入文档历史。
- **保存重开**：保存重开像素一致。
- **失败与边界**：隐藏/锁定目标禁止写入；失焦结束路径不能留下悬挂事务。
- **验收 AC-DR-001**：1px/2px、半透明、自交、快慢事件采样绘制对照；撤销恢复逐像素基线。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/brush-color.md](../../../../legacy/docs/interactions/brush-color.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/shared/types-brush.ts](../../../../legacy/src/shared/types-brush.ts)；[src/renderer/src/core/gradient.test.ts](../../../../legacy/src/renderer/src/core/gradient.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="dr-002"></a>
## DR-002 图片笔刷与图案模式

- **目的与前置**：已导入图片笔刷或由选区创建。
- **输入、参数与范围**：图片笔刷最大 256×256；来源对齐、目标对齐、油漆笔刷；油漆笔刷为新配置默认。
- **作用对象**：当前目标像素、笔刷资源。
- **成功结果与不变量**：导入图片保留源 RGBA；选区笔刷保留原多色，后续换色按浅/深映射；图案透明处不改底色；目标对齐以首次落点为原点。
- **预览、确认、取消与历史**：创建成功后取消选区并选中铅笔与新笔刷；写入失败保留选区和工具；笔画仍一次撤销。
- **保存重开**：全局笔刷和排序为本地资源；不得随画布 dirty 混存。
- **失败与边界**：资源写入失败显示错误；越界尺寸拒绝或按明确导入契约处理，不能静默裁切。
- **验收 AC-DR-002**：在不同落点用三种模式绘制；两种来源笔刷换前景色，验证重映射差异。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/brush-color.md](../../../../legacy/docs/interactions/brush-color.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/shared/types-brush.ts](../../../../legacy/src/shared/types-brush.ts)；[src/renderer/src/core/gradient.test.ts](../../../../legacy/src/renderer/src/core/gradient.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="dr-003"></a>
## DR-003 笔刷动态与压感

- **目的与前置**：支持笔输入或鼠标速度采样。
- **输入、参数与范围**：按铅笔/橡皮独立的大小、强度、颜色渐变映射；九种抖动。
- **作用对象**：笔画采样及目标像素。
- **成功结果与不变量**：插值保留压力/速度/动态色；尺寸变化不漏印章；固定图片笔刷不强行改变固有尺寸；透明渐变按现有叠加规则。
- **预览、确认、取消与历史**：动态设置不进历史；一次笔画单步撤销；取消整笔恢复。
- **保存重开**：设置迁移与文档像素保存分离；遥测不存工程。
- **失败与边界**：无压感设备仍可绘制；无效映射边界在参数登记中核验后固定。
- **验收 AC-DR-003**：相同路径不同采样密度比较像素；固定图片刷切换动态颜色；撤销无残留。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/brush-color.md](../../../../legacy/docs/interactions/brush-color.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/shared/types-brush.ts](../../../../legacy/src/shared/types-brush.ts)；[src/renderer/src/core/gradient.test.ts](../../../../legacy/src/renderer/src/core/gradient.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="dr-004"></a>
## DR-004 直线、曲线与形状

- **目的与前置**：可编辑目标。
- **输入、参数与范围**：直线、1–8 控制锚点曲线（默认 2）、矩形/椭圆及描边、自由形状、多边形；圆角/固定比例。
- **作用对象**：当前 cel 与选区限制区域。
- **成功结果与不变量**：预览与提交共用几何；中心绘制、比例、旋转、Space 临时移动可组合；均匀阶梯直线可配置，阶梯数 1–16。
- **预览、确认、取消与历史**：路径未完成的撤销优先退顶点；完成一次历史；Esc 放弃，不留下部分形状。
- **保存重开**：工具偏好本地保存；成品像素写工程。
- **失败与边界**：禁止目标不开始事务；切换目标需确定结束临时路径。
- **验收 AC-DR-004**：按 legacy `selection.ts / forEachRasterLinePoint` 分别核对正反方向的 strict Bresenham 落点（tie 点方向相关，不要求集合相同）；绘制中切换中心/比例；多边形撤销顶点后完成再撤销作品。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/brush-color.md](../../../../legacy/docs/interactions/brush-color.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/shared/types-brush.ts](../../../../legacy/src/shared/types-brush.ts)；[src/renderer/src/core/gradient.test.ts](../../../../legacy/src/renderer/src/core/gradient.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="dr-005"></a>
## DR-005 填充、魔棒与智能闭合

- **目的与前置**：种子在可采样目标中。
- **输入、参数与范围**：容差、连续/非连续、参考可见内容、智能闭合、选区、对称种子。
- **作用对象**：当前目标或选区掩码。
- **成功结果与不变量**：连续区域正确；隔着孤立单像素的两段小缺口都可虚拟闭合；不把靠画布边缘背景误作线稿。
- **预览、确认、取消与历史**：填充一次历史；魔棒预览不修改像素；取消无副作用。
- **保存重开**：填充结果保存；选区持久化按 SE 契约。
- **失败与边界**：无效种子或不可编辑目标无写入；精确阈值待参数来源核对。
- **验收 AC-DR-005**：双缺口线稿填充不外泄；关闭智能闭合应与普通填充一致；有蒙版/索引色对照。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/brush-color.md](../../../../legacy/docs/interactions/brush-color.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/shared/types-brush.ts](../../../../legacy/src/shared/types-brush.ts)；[src/renderer/src/core/gradient.test.ts](../../../../legacy/src/renderer/src/core/gradient.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="dr-006"></a>
## DR-006 多色标线性与径向渐变

- **目的与前置**：活动可编辑目标，存在渐变预览。
- **输入、参数与范围**：线性/径向、多色标、角度、容差、连续区域、九种抖动；径向 Ctrl 中心/Shift 等比。
- **作用对象**：当前目标及选区。
- **成功结果与不变量**：当前源码的径向为可独立横纵半径的椭圆；预览和最终结果一致；边界外采用端点色；退化轴不产生非法数值。
- **预览、确认、取消与历史**：预览、确认、取消；确认一次历史，取消恢复；保存中的待确认渐变有明确处理。
- **保存重开**：像素与工具偏好分离。
- **失败与边界**：旧文档圆形描述冲突见 GAP-001；目标切换不得把预览提交给其他工程。
- **验收 AC-DR-006**：起终点 (0,0)/(8,4)，中心 (4,2) 为起色，(8,2)/(4,4) 为终色；零宽轴与旋转验证。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：已核对关键源码分支／现有断言；完整场景运行未验证。
- **证据与复核入口**：[docs/interactions/brush-color.md](../../../../legacy/docs/interactions/brush-color.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/shared/types-brush.ts](../../../../legacy/src/shared/types-brush.ts)；[src/renderer/src/core/gradient.test.ts](../../../../legacy/src/renderer/src/core/gradient.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="dr-007"></a>
## DR-007 喷枪、魔术橡皮、柔化与液化

- **目的与前置**：可编辑目标。
- **输入、参数与范围**：喷枪粒子半径/散布/密度/频率；魔术橡皮、柔化、液化参数按入口逐项登记。
- **作用对象**：当前帧选区内像素。
- **成功结果与不变量**：静止按住喷枪仍持续喷涂；取消/失焦恢复整笔；柔化和液化保持各自工具能力，不用普通画笔代替。
- **预览、确认、取消与历史**：每次手势单步历史；预览取消恢复。
- **保存重开**：像素写工程；工具参数本地。
- **失败与边界**：卡顿后不无限补发粒子；参数未核验者不得冒充最终默认。
- **验收 AC-DR-007**：喷枪固定随机种子检验区域及撤销；静止按住仍出点；柔化/液化各保留独立样本。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/brush-color.md](../../../../legacy/docs/interactions/brush-color.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/shared/types-brush.ts](../../../../legacy/src/shared/types-brush.ts)；[src/renderer/src/core/gradient.test.ts](../../../../legacy/src/renderer/src/core/gradient.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="dr-008"></a>
## DR-008 对称绘制与绘画辅助

- **目的与前置**：工程可编辑。
- **输入、参数与范围**：水平/垂直/两斜轴/旋转对称，可组合；中心半像素调整与锁定；ISO N:1、网格/智能吸附。
- **作用对象**：工具生成像素与几何。
- **成功结果与不变量**：重复目标去重；预览与提交一致；首次启用对应轴的中心按契约设置；旋转/镜像视图下仍落在所见像素。
- **预览、确认、取消与历史**：轴心和辅助线是工具/视图状态，不进文档历史；生成像素随笔画一次撤销。
- **保存重开**：辅助偏好与文档显示设置分开。
- **失败与边界**：矩形画布斜向越界不写；吸附不能把整格 Tilemap 改成像素移动。
- **验收 AC-DR-008**：矩形画布组合对称比较像素集合；锁轴+临时解锁；N:1 约束首尾完整阶梯。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/brush-color.md](../../../../legacy/docs/interactions/brush-color.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/shared/types-brush.ts](../../../../legacy/src/shared/types-brush.ts)；[src/renderer/src/core/gradient.test.ts](../../../../legacy/src/renderer/src/core/gradient.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="dr-009"></a>
## DR-009 颜色、调色板与模式转换

- **目的与前置**：RGBA/索引/灰度工程。
- **输入、参数与范围**：前景背景、RGB/HSV/HSL/LAB/Gray/PLT、HEX、透明度；色板提取/排序/渐变/锁定/同步/保存。
- **作用对象**：全局当前色、工程调色板和模式。
- **成功结果与不变量**：索引 0 透明；调色板重排不改稳定颜色 ID；索引绘制匹配已有色，不自动扩张；色板槽可留空。
- **预览、确认、取消与历史**：当前色不进作品历史；调色板内容和模式转换按内容命令撤销；弹窗草稿按其确认规则。
- **保存重开**：全局颜色跨工程；工程颜色数据保存；palette.json v1/v2 迁移。
- **失败与边界**：非法色板 ID/重复槽和格式拒绝；转换不可悄悄丢透明语义。
- **验收 AC-DR-009**：重排色板后画面不变；半透明 RGBA/索引互转、色板文件往返与一次撤销。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/brush-color.md](../../../../legacy/docs/interactions/brush-color.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/shared/types-brush.ts](../../../../legacy/src/shared/types-brush.ts)；[src/renderer/src/core/gradient.test.ts](../../../../legacy/src/renderer/src/core/gradient.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="dr-010"></a>
## DR-010 调整、滤镜、抗锯齿与替色

- **目的与前置**：存在允许处理的目标和选区。
- **输入、参数与范围**：色相饱和度、亮度对比、色彩平衡、曲线、渐变映射、滤镜预设/卷积、抗锯齿、替色、反相。
- **作用对象**：目标像素及支持的调色板范围。
- **成功结果与不变量**：每次预览从原始基线重算；不在上次预览上累加；多目标保持独立内容；偏移 cel 正确扩边。
- **预览、确认、取消与历史**：应用单次事务；取消/关闭调整恢复原像素；属性实时提交与调整确认区分。
- **保存重开**：最终内容入工程；预览不是保存基线。
- **失败与边界**：切换文档取消旧预览；计算失败无半成品。
- **验收 AC-DR-010**：半透明偏移 cel 多次调参再取消逐像素一致；应用后撤销；各滤镜在参数台账逐项补齐。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/brush-color.md](../../../../legacy/docs/interactions/brush-color.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/shared/types-brush.ts](../../../../legacy/src/shared/types-brush.ts)；[src/renderer/src/core/gradient.test.ts](../../../../legacy/src/renderer/src/core/gradient.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

