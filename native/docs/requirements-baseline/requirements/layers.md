# 图层、文字与效果语义需求

中文；返回[需求基线](../README.md)。

本页为规范候选，适用公共规则 [CO-001](core.md#co-001) 和[验收协议](../acceptance.md)。证据状态不代表本轮运行测试通过。所有未列出的参数默认值不得由实现者猜测，须进入[参数与冲突台账](../compatibility.md)。

<a id="la-001"></a>
## LA-001 图层结构、属性与背景

- **目的与前置**：工程存在至少一个有效编辑目标。
- **输入、参数与范围**：新建/复制/删除/分组/解组/排序/合并；名称、显隐、锁定、不透明度、混合、显示色、描述；普通/背景转换。
- **作用对象**：全部关联帧的图层结构。
- **成功结果与不变量**：保留层级顺序及属性；创建/删除同步帧轨道；合并外观与选择范围一致；背景约束独立于普通透明层。
- **预览、确认、取消与历史**：一次复合操作一次历史；选择/折叠不混入内容历史。
- **保存重开**：保存结构、属性及可选界面上下文。
- **失败与边界**：锁定/隐藏处理按命令语义；不可留下悬空 cel。
- **验收 AC-LA-001**：嵌套组复制拖动再撤销；合并半透明层前后对比；背景转换恢复原身份。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/architecture/state-history.md](../../../../legacy/docs/architecture/state-history.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/renderer/src/store/workspace-commands-layer-properties.ts](../../../../legacy/src/renderer/src/store/workspace-commands-layer-properties.ts)；[src/renderer/src/store/workspace-linked-layers.test.ts](../../../../legacy/src/renderer/src/store/workspace-linked-layers.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="la-002"></a>
## LA-002 关联图层与关联 cel

- **目的与前置**：多个图层或帧引用同一内容。
- **输入、参数与范围**：建立关联、断开关联、复制、跨工程粘贴、栅格化/类型转换。
- **作用对象**：共享像素存储与各成员独立属性。
- **成功结果与不变量**：同源修改同步；偏移、名称、不透明度不因共享而绑定；历史只记录一次像素差量。
- **预览、确认、取消与历史**：建立/断开关系可撤销，恢复真实共享身份；转换前需要独立化的内容先克隆。
- **保存重开**：共享身份保存重开，跨项目按批重映射。
- **失败与边界**：不能用定期复制像素假装共享；失效不得漏成员。
- **验收 AC-LA-002**：两个偏移不同关联层绘制后同步像素但位置不变；断开后独立；保存往返再次绘制。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/architecture/state-history.md](../../../../legacy/docs/architecture/state-history.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/renderer/src/store/workspace-commands-layer-properties.ts](../../../../legacy/src/renderer/src/store/workspace-commands-layer-properties.ts)；[src/renderer/src/store/workspace-linked-layers.test.ts](../../../../legacy/src/renderer/src/store/workspace-linked-layers.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="la-003"></a>
## LA-003 Cel 蒙版、组蒙版与剪贴

- **目的与前置**：有效图层/组与帧。
- **输入、参数与范围**：建立/删除/切换/链接蒙版、灰度编辑、剪贴。
- **作用对象**：所属 frameId 的蒙版或剪贴关系。
- **成功结果与不变量**：蒙版透明处不改变所有者；灰度控制显示；组蒙版作用于组结果；活动蒙版仅会话选择。
- **预览、确认、取消与历史**：蒙版编辑与结构操作可撤销且只影响目标帧；切帧退出旧蒙版目标。
- **保存重开**：保留链接和所属身份；自引用/循环非法。
- **失败与边界**：不把蒙版修改写成普通图层像素；缺失引用报错。
- **验收 AC-LA-003**：两帧分别设蒙版，撤销只影响一帧；组蒙版与剪贴重开合成一致。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/architecture/state-history.md](../../../../legacy/docs/architecture/state-history.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/renderer/src/store/workspace-commands-layer-properties.ts](../../../../legacy/src/renderer/src/store/workspace-commands-layer-properties.ts)；[src/renderer/src/store/workspace-linked-layers.test.ts](../../../../legacy/src/renderer/src/store/workspace-linked-layers.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="la-004"></a>
## LA-004 图层样式与实时属性

- **目的与前置**：普通图层/组或支持样式的目标。
- **输入、参数与范围**：描边、阴影、内发光、颜色叠加、渐变叠加、渐变映射；复制/粘贴/清除；具体范围见格式契约。
- **作用对象**：跨帧共享样式参数与派生外观。
- **成功结果与不变量**：修改样式不重写原像素；失效覆盖样式扩展边界；智能色相/阴影保持当前行为。
- **预览、确认、取消与历史**：显式应用式弹窗取消恢复；实时属性关闭提交一次；目标切换取消，二者不可混淆。
- **保存重开**：样式参数随工程；栅格化后保留烘焙外观并移除对应样式。
- **失败与边界**：计算失败不提交半份结果；关联 cel 不重复烘焙。
- **验收 AC-LA-004**：带蒙版关联帧栅格化样式只烘焙一次；属性改多次关闭单步撤销。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/architecture/state-history.md](../../../../legacy/docs/architecture/state-history.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/renderer/src/store/workspace-commands-layer-properties.ts](../../../../legacy/src/renderer/src/store/workspace-commands-layer-properties.ts)；[src/renderer/src/store/workspace-linked-layers.test.ts](../../../../legacy/src/renderer/src/store/workspace-linked-layers.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="la-005"></a>
## LA-005 可编辑文本与栅格化

- **目的与前置**：文本图层或创建文本。
- **输入、参数与范围**：字符选区、字体、字号、颜色、行距、字距；混合值显示。
- **作用对象**：作品文字内容及排版。
- **成功结果与不变量**：字符局部属性可独立编辑；零间距按字面边界相接；编辑/栅格化保留位置和外观。
- **预览、确认、取消与历史**：文本编辑与栅格化可撤销；取消编辑恢复基线。
- **保存重开**：文本元数据与像素保留；栅格化仅移除已烘焙元数据。
- **失败与边界**：字体缺失要提示；UI Fusion 10px 规则不能限制用户作品字体/字号。
- **验收 AC-LA-005**：同层两种字号颜色局部编辑并撤销；保存重开；栅格化前后位置和像素对照。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/architecture/state-history.md](../../../../legacy/docs/architecture/state-history.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/renderer/src/store/workspace-commands-layer-properties.ts](../../../../legacy/src/renderer/src/store/workspace-commands-layer-properties.ts)；[src/renderer/src/store/workspace-linked-layers.test.ts](../../../../legacy/src/renderer/src/store/workspace-linked-layers.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="la-006"></a>
## LA-006 渐变映射调整图层

- **目的与前置**：存在工程图层与可合成下层内容。
- **输入、参数与范围**：独立调整图层、映射参数、蒙版、显隐与复制。
- **作用对象**：调整层作用范围内的合成内容。
- **成功结果与不变量**：区分像素调整、普通层样式和调整图层三种能力；调整层不以直接改下层像素实现。
- **预览、确认、取消与历史**：新建及其蒙版统一撤销；参数编辑可撤销；复制参数独立。
- **保存重开**：调整层类型、映射参数与蒙版随工程保存。
- **失败与边界**：调整层拒绝不适用的普通图层样式命令。
- **验收 AC-LA-006**：新建带蒙版调整层，修改参数后复制，独立修改副本；撤销新建同时移除蒙版；普通样式命令不污染目标。
- **新版承接**：保留现有功能，原生界面重新设计，不照搬旧布局。
- **证据状态**：已核对文档及关键测试/实现定位；未执行运行验收。
- **证据与复核入口**：[legacy/src/renderer/src/store/workspace-commands-adjustment-layer.ts](../../../../legacy/src/renderer/src/store/workspace-commands-adjustment-layer.ts)；[legacy/src/renderer/src/store/workspace-gradient-map.test.ts](../../../../legacy/src/renderer/src/store/workspace-gradient-map.test.ts)。
