# Tilemap 与自由瓦片语义需求

中文；返回[需求基线](../README.md)。

本页为规范候选，适用公共规则 [CO-001](core.md#co-001) 和[验收协议](../acceptance.md)。证据状态不代表本轮运行测试通过。所有未列出的参数默认值不得由实现者猜测，须进入[参数与冲突台账](../compatibility.md)。

<a id="ti-001"></a>
## TI-001 Tilemap 建立、转换与共享

- **目的与前置**：已有栅格/背景层或新建层。
- **输入、参数与范围**：瓦片宽高、已有/新增 Tileset、全帧转换。
- **作用对象**：Tileset、格引用和帧偏移。
- **成功结果与不变量**：已有集合复用不复制；转换全帧以画布原点切格、边缘补透明、相同瓦片去重；文本/样式先栅格化。
- **预览、确认、取消与历史**：转换连同名称/背景身份一次撤销。
- **保存重开**：格子为权威，显示栅格仅派生；共享集合保存。
- **失败与边界**：不能跨集合串用所有权；仍有引用不能删除 Tileset。
- **验收 AC-TI-001**：两层共用 Tileset，修改同步；栅格多帧转格后撤销精确恢复。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[docs/architecture/state-history.md](../../../../legacy/docs/architecture/state-history.md)；[src/renderer/src/store/workspace-commands-tilemap.ts](../../../../legacy/src/renderer/src/store/workspace-commands-tilemap.ts)；[src/renderer/src/store/workspace-tilemap.test.ts](../../../../legacy/src/renderer/src/store/workspace-tilemap.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="ti-002"></a>
## TI-002 四种 Tilemap 编辑模式

- **目的与前置**：有效 Tilemap。
- **输入、参数与范围**：原位编辑/变体创建/混合编辑/绘制瓦片；默认混合；前景背景瓦片。
- **作用对象**：源瓦片或格引用，由模式决定。
- **成功结果与不变量**：原位同步所有引用；变体只改当前结果引用；混合已有格改源、空格生成；绘制模式整格替换含透明；快速拖动补齐格。
- **预览、确认、取消与历史**：一笔含瓦片、引用、选择变化只一条历史；取消整批恢复。
- **保存重开**：按源数据保存，不靠临时合成缓存恢复。
- **失败与边界**：移动图层仅改 cel 偏移；混合整格移动只移引用；局部移动产生变体。
- **验收 AC-TI-002**：同一瓦片两个引用分别运行四模式；整格/局部移动核对 Tileset 数量和像素。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[docs/architecture/state-history.md](../../../../legacy/docs/architecture/state-history.md)；[src/renderer/src/store/workspace-commands-tilemap.ts](../../../../legacy/src/renderer/src/store/workspace-commands-tilemap.ts)；[src/renderer/src/store/workspace-tilemap.test.ts](../../../../legacy/src/renderer/src/store/workspace-tilemap.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="ti-003"></a>
## TI-003 瓦片槽位、删除与跨文档

- **目的与前置**：瓦片集含多个稳定瓦片。
- **输入、参数与范围**：多选、排序、空槽、删除、复制图层/帧与跨项目粘贴。
- **作用对象**：槽位布局与稳定瓦片身份。
- **成功结果与不变量**：排序不改变 ID 或画布像素；全删至少保留一瓦片；跨项目复制源并重映射；画布缩放不影响整格语义。
- **预览、确认、取消与历史**：排序/删除/粘贴各为复合历史；取消恢复资源。
- **保存重开**：槽位和引用存工程，显示编号为视图。
- **失败与边界**：引用完整性失败不能保存损坏工程；删除不能留下野引用。
- **验收 AC-TI-003**：交换槽位画面不变；全删后撤销；跨工程粘贴不借用源工程内存。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[docs/architecture/state-history.md](../../../../legacy/docs/architecture/state-history.md)；[src/renderer/src/store/workspace-commands-tilemap.ts](../../../../legacy/src/renderer/src/store/workspace-commands-tilemap.ts)；[src/renderer/src/store/workspace-tilemap.test.ts](../../../../legacy/src/renderer/src/store/workspace-tilemap.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="ti-004"></a>
## TI-004 自由瓦片源、实例与共享集合

- **目的与前置**：新建自由瓦片层或已有集合。
- **输入、参数与范围**：编辑源/放置实例、任意整数像素位置、90°旋转/镜像、源和实例属性。
- **作用对象**：源像素与实例列表分别持有。
- **成功结果与不变量**：源不预设尺寸，首次实际绘制裁边；同集跨层共享源；实例独立位置、朝向、属性；全选实例移动不误改源，局部选区编辑逆变换回源。
- **预览、确认、取消与历史**：首次源绘制及首次放置一条历史；属性实时关闭单次提交；切目标取消；源修改同步所有引用。
- **保存重开**：源 ID、集合身份、实例变换保存；跨文档重映射。
- **失败与边界**：源/实例锁定分别遵守；不同集合不得误共享源；缺引用拒绝。
- **验收 AC-TI-004**：两个朝向实例局部编辑同步正确；完整选中只移一实例；多层共享源删除撤销与重开。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[docs/architecture/state-history.md](../../../../legacy/docs/architecture/state-history.md)；[src/renderer/src/store/workspace-commands-tilemap.ts](../../../../legacy/src/renderer/src/store/workspace-commands-tilemap.ts)；[src/renderer/src/store/workspace-tilemap.test.ts](../../../../legacy/src/renderer/src/store/workspace-tilemap.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

