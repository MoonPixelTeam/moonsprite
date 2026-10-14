# 动画与时间轴语义需求

中文；返回[需求基线](../README.md)。

本页为规范候选，适用公共规则 [CO-001](core.md#co-001) 和[验收协议](../acceptance.md)。证据状态不代表本轮运行测试通过。所有未列出的参数默认值不得由实现者猜测，须进入[参数与冲突台账](../compatibility.md)。

<a id="an-001"></a>
## AN-001 帧、Cel 与选择范围

- **目的与前置**：有时间轴。
- **输入、参数与范围**：新建空白/复制/关联帧、删除/重排、启禁、时长、cel 不透明度。
- **作用对象**：帧序列、各层 cel 与稳定 ID。
- **成功结果与不变量**：帧与 cel 显式选择互斥；层与帧可共存并确定组合范围；活动帧不等于显式多选。
- **预览、确认、取消与历史**：结构和属性操作可撤销；切帧与播放不 dirty。
- **保存重开**：帧时长、禁用状态和稳定关系保存。
- **失败与边界**：删除不能破坏组蒙版/循环节引用；空白 cel 不冒充缺失资源。
- **验收 AC-AN-001**：重排/删除关联帧后撤销恢复链接；同时选层和帧操作保持范围。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[docs/architecture/state-history.md](../../../../legacy/docs/architecture/state-history.md)；[src/renderer/src/store/workspace-commands-animation-frame.ts](../../../../legacy/src/renderer/src/store/workspace-commands-animation-frame.ts)；[src/renderer/src/store/workspace-animation-loop-sections.test.ts](../../../../legacy/src/renderer/src/store/workspace-animation-loop-sections.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="an-002"></a>
## AN-002 播放、循环节与洋葱皮

- **目的与前置**：至少一帧。
- **输入、参数与范围**：单次/全部/标签循环，正反/往返/反向往返、重复次数、速度 0.25/0.5/1/1.5/2/3、停止返回。
- **作用对象**：当前会话播放与文档循环节。
- **成功结果与不变量**：循环节用稳定端点；标签播放选最内层且持续循环；主动播放循环节遵守次数；播放时不接受绘画，允许导航。
- **预览、确认、取消与历史**：切帧/播放/倍率不进历史；循环节增删改进历史。
- **保存重开**：循环节定义保存；运行中的播放状态不作为编辑。
- **失败与边界**：删除端点收缩范围；删除唯一帧移除对应节。
- **验收 AC-AN-002**：嵌套循环节标签播放与右键播放比较；手动切帧继续；停止返回开关分别验证。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[docs/architecture/state-history.md](../../../../legacy/docs/architecture/state-history.md)；[src/renderer/src/store/workspace-commands-animation-frame.ts](../../../../legacy/src/renderer/src/store/workspace-commands-animation-frame.ts)；[src/renderer/src/store/workspace-animation-loop-sections.test.ts](../../../../legacy/src/renderer/src/store/workspace-animation-loop-sections.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="an-003"></a>
## AN-003 帧、Cel、蒙版复制和跨项目操作

- **目的与前置**：显式时间轴选择。
- **输入、参数与范围**：复制/粘贴/移动/Alt 拖动复制、连接/断开 cel 与蒙版。
- **作用对象**：目标帧层组合及资源。
- **成功结果与不变量**：保持帧顺序、时长、蒙版及资源身份；跨项目避免 ID 冲突；同批共享关系保留。
- **预览、确认、取消与历史**：整批统一撤销，不改变源项目；失败回滚当前事务。
- **保存重开**：保存重开后链接关系继续有效。
- **失败与边界**：过期目标或不兼容颜色/图层种类反馈，不部分静默导入。
- **验收 AC-AN-003**：多帧跨文档粘贴后撤销移除本批资源；源内容和其他共享者不变。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[docs/architecture/state-history.md](../../../../legacy/docs/architecture/state-history.md)；[src/renderer/src/store/workspace-commands-animation-frame.ts](../../../../legacy/src/renderer/src/store/workspace-commands-animation-frame.ts)；[src/renderer/src/store/workspace-animation-loop-sections.test.ts](../../../../legacy/src/renderer/src/store/workspace-animation-loop-sections.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="an-004"></a>
## AN-004 动画反转、补间与变形

- **目的与前置**：选定有效帧/内容范围。
- **输入、参数与范围**：反转、补间、路径预设、变形及其参数。
- **作用对象**：选定帧序列与内容。
- **成功结果与不变量**：这些为需保留能力，不能只迁移基础播放；准确插值范围、默认值和预算从各工具来源登记后冻结。
- **预览、确认、取消与历史**：确认单批历史；取消不保留生成中间帧；算法异常回滚。
- **保存重开**：生成帧及属性按普通动画保存。
- **失败与边界**：参数上限和同色模式限制待逐项核对，不声称已完成行为验证。
- **验收 AC-AN-004**：固定首尾与路径生成补间，核对帧数/端点/撤销；反转两次恢复原序列。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[docs/architecture/state-history.md](../../../../legacy/docs/architecture/state-history.md)；[src/renderer/src/store/workspace-commands-animation-frame.ts](../../../../legacy/src/renderer/src/store/workspace-commands-animation-frame.ts)；[src/renderer/src/store/workspace-animation-loop-sections.test.ts](../../../../legacy/src/renderer/src/store/workspace-animation-loop-sections.test.ts)。领域级定位不等于该测试覆盖本条全部内容。


### AN-004 参数核对补充

[animation-tween.ts](../../../../legacy/src/renderer/src/core/animation-tween.ts) 已定位：scope=frame/loop/between，layerScope=current/selected/all；betweenMode=morph/crossfade。默认8帧、100ms、X偏移16/Y偏移0、旋转0、缩放100%、不透明度100%、线性缓动、不自动裁画布；帧数1–120、时长1–60000ms、位移绝对值≤16384、旋转绝对值≤3600°、缩放1–1000%、不透明度0–100%。路径2–2048点且从(0,0)起；自定义缓动须合法。

[补间命令](../../../../legacy/src/renderer/src/store/workspace-commands-animation-tween.ts)还维护蒙版、循环节、选择和画布扩张，AC-AN-004必须检查扩张后撤销还原尺寸与结构。已定位实现，未运行验收。
