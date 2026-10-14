# 选区、变换与剪贴板语义需求

中文；返回[需求基线](../README.md)。

本页为规范候选，适用公共规则 [CO-001](core.md#co-001) 和[验收协议](../acceptance.md)。证据状态不代表本轮运行测试通过。所有未列出的参数默认值不得由实现者猜测，须进入[参数与冲突台账](../compatibility.md)。

<a id="se-001"></a>
## SE-001 创建、组合与反选

- **目的与前置**：无选区或已有非矩形选区。
- **输入、参数与范围**：矩形/椭圆/自由套索/多边形/魔棒；替换/加/减/交；右键减、Shift 临时加。
- **作用对象**：当前工程选区掩码。
- **成功结果与不变量**：新建裁切画布；已有选区在预览期间保持；真实拖动即便只覆盖一像素也建立选区；反选仅画布内。
- **预览、确认、取消与历史**：取消恢复旧掩码；反选一次历史；无选区反选只提示；创建历史粒度按真实入口核对。
- **保存重开**：选区按会话/内容事务分别处理，不擅自增加格式字段。
- **失败与边界**：锁定等限制按入口保持；掩码外接框空隙不能冒充真实边界。
- **验收 AC-SE-001**：非矩形加减交、单像素拖动、从画布外拖入、多边形取消与闭合。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/selection-transform.md](../../../../legacy/docs/interactions/selection-transform.md)；[docs/interactions/pointer-modifiers.md](../../../../legacy/docs/interactions/pointer-modifiers.md)；[src/renderer/src/store/workspace-commands-selection-move.ts](../../../../legacy/src/renderer/src/store/workspace-commands-selection-move.ts)；[src/renderer/src/store/workspace-floating-clipboard.test.ts](../../../../legacy/src/renderer/src/store/workspace-floating-clipboard.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="se-002"></a>
## SE-002 移动选框与移动内容

- **目的与前置**：已有选区，可处于浮动状态。
- **输入、参数与范围**：边界拖动仅移选框，内部拖动移内容；Ctrl 复制、Shift 轴约束；整数位移。
- **作用对象**：掩码、像素、偏移与轴心。
- **成功结果与不变量**：真实边界命中，不用包围盒空边；内容首次移动捕获稳定来源，反复移动恢复经过区域背景；已有变换允许越出画布。
- **预览、确认、取消与历史**：确认内容一次历史；取消恢复像素/掩码/轴心；选框独立操作不误删像素。
- **保存重开**：仅已提交内容进入工程；浮动状态保存前必须处理。
- **失败与边界**：隐藏/锁定目标禁止修改；具体命令 clamp 与手势越界参数不能混为一谈。
- **验收 AC-SE-002**：在带底色非矩形选区上边缘移动再内部移动两次；确认/取消/撤销各比较掩码与底色。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/selection-transform.md](../../../../legacy/docs/interactions/selection-transform.md)；[docs/interactions/pointer-modifiers.md](../../../../legacy/docs/interactions/pointer-modifiers.md)；[src/renderer/src/store/workspace-commands-selection-move.ts](../../../../legacy/src/renderer/src/store/workspace-commands-selection-move.ts)；[src/renderer/src/store/workspace-floating-clipboard.test.ts](../../../../legacy/src/renderer/src/store/workspace-floating-clipboard.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="se-003"></a>
## SE-003 多图层多帧变换

- **目的与前置**：显式图层/组与帧多选。
- **输入、参数与范围**：移动、复制、缩放、旋转、倾斜与镜像；目标为选中图层展开后的图层×帧。
- **作用对象**：每个目标 cel 及共享选区。
- **成功结果与不变量**：独立处理像素，不合并层级；共享源只改一次；保持图层与帧选择；任一不支持目标使整批拒绝。
- **预览、确认、取消与历史**：确认全体一次历史；取消/撤销/重做覆盖所有目标。
- **保存重开**：结构与像素保存重开一致。
- **失败与边界**：文本、Tilemap、自由瓦片、隐藏或锁定等不允许混合时整体拒绝，不部分成功。
- **验收 AC-SE-003**：2 层×3 帧变换；混入锁层后零修改；关联 cel 不重复变换。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/selection-transform.md](../../../../legacy/docs/interactions/selection-transform.md)；[docs/interactions/pointer-modifiers.md](../../../../legacy/docs/interactions/pointer-modifiers.md)；[src/renderer/src/store/workspace-commands-selection-move.ts](../../../../legacy/src/renderer/src/store/workspace-commands-selection-move.ts)；[src/renderer/src/store/workspace-floating-clipboard.test.ts](../../../../legacy/src/renderer/src/store/workspace-floating-clipboard.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="se-004"></a>
## SE-004 缩放、旋转、自由变换与内容镜像

- **目的与前置**：选区或显式时间轴目标。
- **输入、参数与范围**：比例/整数倍缩放、45°旋转吸附、自定义轴心、倾斜、四角自由变换、水平垂直镜像、90/180°旋转/居中。
- **作用对象**：按优先级确定的选区/实例/显式时间轴/当前 cel。
- **成功结果与不变量**：掩码与像素同时变换；无选区时显式帧/层选择决定范围；无显式选择仅当前帧；视觉镜像与内容镜像分开。
- **预览、确认、取消与历史**：一批内容变换一次撤销；取消恢复全部。
- **保存重开**：内容写工程；视图镜像不写内容。
- **失败与边界**：不支持目标跳过还是整体拒绝必须按具体命令区分，不能套一个策略。
- **验收 AC-SE-004**：非矩形镜像后再移动无残影；全帧层选择与单帧隐式选择分别验证。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/selection-transform.md](../../../../legacy/docs/interactions/selection-transform.md)；[docs/interactions/pointer-modifiers.md](../../../../legacy/docs/interactions/pointer-modifiers.md)；[src/renderer/src/store/workspace-commands-selection-move.ts](../../../../legacy/src/renderer/src/store/workspace-commands-selection-move.ts)；[src/renderer/src/store/workspace-floating-clipboard.test.ts](../../../../legacy/src/renderer/src/store/workspace-floating-clipboard.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="se-005"></a>
## SE-005 剪切、复制、浮动粘贴与焦点

- **目的与前置**：画布/图层/调色板等有明确焦点。
- **输入、参数与范围**：复制、合并复制、剪切、粘贴到当前格/新层/新文档，跨文档多层组。
- **作用对象**：源快照与目标独立资源。
- **成功结果与不变量**：保持像素、偏移、层级、属性和复制组展开状态；跨工程重映射共享身份；不修改剪贴板来源。
- **预览、确认、取消与历史**：一批粘贴/删除一次历史；浮动粘贴支持确认/取消；源工程不被撤销目标影响。
- **保存重开**：新资源随目标保存；取消清理本批新增资源。
- **失败与边界**：系统剪贴板失败可用内部副本；文字输入不触发作品剪切删除。
- **验收 AC-SE-005**：复制组到另一工程再编辑与撤销，源不变；遗留选区不能抢占图层焦点删除。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/selection-transform.md](../../../../legacy/docs/interactions/selection-transform.md)；[docs/interactions/pointer-modifiers.md](../../../../legacy/docs/interactions/pointer-modifiers.md)；[src/renderer/src/store/workspace-commands-selection-move.ts](../../../../legacy/src/renderer/src/store/workspace-commands-selection-move.ts)；[src/renderer/src/store/workspace-floating-clipboard.test.ts](../../../../legacy/src/renderer/src/store/workspace-floating-clipboard.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="se-006"></a>
## SE-006 切片与选区衍生资源

- **目的与前置**：工程有内容或选区。
- **输入、参数与范围**：创建/多选/自动切片/属性；选区转图案笔刷或背景预设。
- **作用对象**：切片工程元数据或全局资源。
- **成功结果与不变量**：导出按切片范围；背景预设采可见合成且非矩形外透明；笔刷创建遵守 DR-002。
- **预览、确认、取消与历史**：切片编辑可撤销；背景预设不清选区、不改 dirty；资源写失败无切换副作用。
- **保存重开**：切片随工程；背景预设为外部资源。
- **失败与边界**：空选区禁用转换；无效路径或写入失败反馈。
- **验收 AC-SE-006**：非矩形选区转背景预设后像素与 dirty 不变；自动切片结果用于单片/全片导出。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/selection-transform.md](../../../../legacy/docs/interactions/selection-transform.md)；[docs/interactions/pointer-modifiers.md](../../../../legacy/docs/interactions/pointer-modifiers.md)；[src/renderer/src/store/workspace-commands-selection-move.ts](../../../../legacy/src/renderer/src/store/workspace-commands-selection-move.ts)；[src/renderer/src/store/workspace-floating-clipboard.test.ts](../../../../legacy/src/renderer/src/store/workspace-floating-clipboard.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

