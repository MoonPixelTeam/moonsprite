# 事务、坐标与长期稳定性语义需求

中文；返回[需求基线](../README.md)。

本页为规范候选，适用公共规则 [CO-001](core.md#co-001) 和[验收协议](../acceptance.md)。证据状态不代表本轮运行测试通过。所有未列出的参数默认值不得由实现者猜测，须进入[参数与冲突台账](../compatibility.md)。

<a id="co-001"></a>
## CO-001 事务与历史的统一所有权

- **目的与前置**：任何界面/快捷键/扩展编辑入口。
- **输入、参数与范围**：开始、更新、确认、取消；稳定文档目标身份。
- **作用对象**：文档像素、结构、dirty、revision 和失效。
- **成功结果与不变量**：由一个核心统一写入；预览来自稳定基线；不能让旧事务写进新活动文档；纳入文档历史的编辑手势单步。
- **预览、确认、取消与历史**：撤销/重做恢复内容及相关选择；无可撤销/重做条目时调用 Undo/Redo 无副作用；新编辑清未来分支。
- **保存重开**：文件编码与撤销数据独立；保存点判断内容状态。
- **失败与边界**：异常取消绑定文档全部未完成事务；错误可观察。
- **验收 AC-CO-001**：同时打开两个文档，开始预览后切换并回调，第二个不变；undo/redo/cancel 精确对照。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：已核对关键源码分支／现有断言；完整场景运行未验证。
- **证据与复核入口**：[docs/architecture/state-history.md](../../../../legacy/docs/architecture/state-history.md)；[docs/architecture/coordinates-rendering.md](../../../../legacy/docs/architecture/coordinates-rendering.md)；[src/renderer/src/store/document-transactions.ts](../../../../legacy/src/renderer/src/store/document-transactions.ts)；[src/renderer/src/store/document-transactions.test.ts](../../../../legacy/src/renderer/src/store/document-transactions.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="co-002"></a>
## CO-002 坐标、呈现与长期运行

- **目的与前置**：任意视图、DPI 与文档偏移。
- **输入、参数与范围**：屏幕/视口/文档/图层转换；缩放旋转镜像、指针、压力。
- **作用对象**：输入落点与最终画面。
- **成功结果与不变量**：同一几何用于预览/命中/写入；文档100%=设备像素；缓存有界，关闭资源释放；持续使用延迟不得单调恶化。
- **预览、确认、取消与历史**：视图变化不改文档历史；取消不留定时任务/资源。
- **保存重开**：GPU/缓存不写工程；恢复内容不恢复异常运行时状态。
- **失败与边界**：WebView滞留证据与因果边界分开；换原生不自动宣称所有性能问题解决。
- **验收 AC-CO-002**：冷态及2小时/8小时固定序列测输入延迟与内存；不重启/重载；记录硬件和工程。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/architecture/state-history.md](../../../../legacy/docs/architecture/state-history.md)；[docs/architecture/coordinates-rendering.md](../../../../legacy/docs/architecture/coordinates-rendering.md)；[src/renderer/src/store/document-transactions.ts](../../../../legacy/src/renderer/src/store/document-transactions.ts)；[src/renderer/src/store/document-transactions.test.ts](../../../../legacy/src/renderer/src/store/document-transactions.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

