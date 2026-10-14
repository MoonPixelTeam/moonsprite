# 工程、文件与恢复语义需求

中文；返回[需求基线](../README.md)。

本页为规范候选，适用公共规则 [CO-001](core.md#co-001) 和[验收协议](../acceptance.md)。证据状态不代表本轮运行测试通过。所有未列出的参数默认值不得由实现者猜测，须进入[参数与冲突台账](../compatibility.md)。

<a id="fs-001"></a>
## FS-001 新建、多工程与视图

- **目的与前置**：无工程或已有工程；新建不会关闭其他工程。
- **输入、参数与范围**：名称、尺寸、颜色模式；剪贴板图片存在时提供尺寸建议。
- **作用对象**：新工程、当前会话。
- **成功结果与不变量**：建立合法文档并聚焦新画布；多个项目可切换、复制视图；视图共享作品而不复制工程内容。
- **预览、确认、取消与历史**：取消新建不增加工程；关闭有未保存内容的工程须处理保存/放弃/取消。
- **保存重开**：作品存入工程；视图选择不写入文档历史。
- **失败与边界**：非法尺寸拒绝；剪贴板读取失败不阻止手工新建。
- **验收 AC-FS-001**：建立两个不同尺寸工程，切换后内容独立；复制视图编辑只修改同一工程；取消关闭保留会话。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[docs/file-format.md](../../../../legacy/docs/file-format.md)；[src/renderer/src/store/document-file-service.ts](../../../../legacy/src/renderer/src/store/document-file-service.ts)；[src/renderer/src/store/document-save-queue.test.ts](../../../../legacy/src/renderer/src/store/document-save-queue.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="fs-002"></a>
## FS-002 打开与格式边界

- **目的与前置**：选择文件、文件关联启动或拖入。
- **输入、参数与范围**：moonsprite、ase、aseprite、PNG、JPEG、WebP、BMP、GIF；未知未来工程版本拒绝。
- **作用对象**：目标文档及其资源。
- **成功结果与不变量**：正确恢复尺寸、颜色、图层、帧与位置；GIF 保留顺序、时长与合成；同次重复拖放只打开一次并进入编辑器。
- **预览、确认、取消与历史**：取消不替换现有工程；导入建立新会话，不伪造一长串历史。
- **保存重开**：原文件保持原样；缺失与损坏文件区分反馈。
- **失败与边界**：作品关键资源损坏、非法引用、字节长度和越界拒绝；录像缺帧可保留画作并报告丢帧，详见 FS-008；不静默跳过丢失内容。
- **验收 AC-FS-002**：用有偏移 cel 的动画工程和 GIF 打开；重复拖入一次；截断副本必须报错。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：部分源码与自动测试已核对；具体 FS-002 子项、模拟边界、待执行项见[文件生命周期专项](../file-lifecycle.md)。不是整条需求验收通过。
- **证据与复核入口**：[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[docs/file-format.md](../../../../legacy/docs/file-format.md)；[src/renderer/src/store/document-file-service.ts](../../../../legacy/src/renderer/src/store/document-file-service.ts)；[src/renderer/src/store/document-save-queue.test.ts](../../../../legacy/src/renderer/src/store/document-save-queue.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="fs-003"></a>
## FS-003 保存、另存为与串行写入

- **目的与前置**：已打开可保存工程。
- **输入、参数与范围**：普通保存、另存为、显式路径和格式；保存期间可继续编辑。
- **作用对象**：目标工程的特定修订。
- **成功结果与不变量**：普通保存写回来源；另存为独立处理；同修订请求可合并，新修订必须另存；成功才更新保存点。
- **预览、确认、取消与历史**：取消路径选择不写文件；保存不产生编辑历史；是否回到保存点恢复未修改状态须另核对，不能由保存并发测试推断。
- **保存重开**：原子替换；保存中的新编辑不得被旧任务误标已保存或删恢复记录。
- **失败与边界**：写入失败保留原文件、dirty 和恢复数据，错误可见，可再次保存。
- **验收 AC-FS-003**：阻塞第一次写入后继续编辑并保存，最终包含新修订；注入失败验证旧文件未损坏。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：部分源码与自动测试已核对；具体 FS-003 子项、模拟边界、待执行项见[文件生命周期专项](../file-lifecycle.md)。不是整条需求验收通过。
- **证据与复核入口**：[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[docs/file-format.md](../../../../legacy/docs/file-format.md)；[src/renderer/src/store/document-file-service.ts](../../../../legacy/src/renderer/src/store/document-file-service.ts)；[src/renderer/src/store/document-save-queue.test.ts](../../../../legacy/src/renderer/src/store/document-save-queue.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="fs-004"></a>
## FS-004 原图片格式与有损结构提示

- **目的与前置**：从普通图片打开；来源路径存在。
- **输入、参数与范围**：沿用原格式保存默认开启；新增图层或动画后触发结构损失提示。
- **作用对象**：来源图片及当前作品。
- **成功结果与不变量**：原始单帧单层可按来源格式保存；无法表达新结构时让用户选择完整工程或明确继续；关闭偏好时先询问另存工程。
- **预览、确认、取消与历史**：取消不写来源；另存为遵守明确格式。
- **保存重开**：扩展名、选择格式和编码一致；保存位置偏好可覆盖默认目录。
- **失败与边界**：不能把扁平图片成功写出解释为完整工程保留。
- **验收 AC-FS-004**：单图绘制保存后新增图层再保存，检查三种选择及来源未被取消流程覆盖。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：部分源码与自动测试已核对；具体 FS-004 子项、模拟边界、待执行项见[文件生命周期专项](../file-lifecycle.md)。不是整条需求验收通过。
- **证据与复核入口**：[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[docs/file-format.md](../../../../legacy/docs/file-format.md)；[src/renderer/src/store/document-file-service.ts](../../../../legacy/src/renderer/src/store/document-file-service.ts)；[src/renderer/src/store/document-save-queue.test.ts](../../../../legacy/src/renderer/src/store/document-save-queue.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="fs-005"></a>
## FS-005 工程兼容与资源身份

- **目的与前置**：现行 v21 及旧格式工程副本。
- **输入、参数与范围**：旧版本迁移、RGBA/索引/灰度、稀疏资源、关联内容、蒙版、瓦片、录像引用。
- **作用对象**：完整文档结构。
- **成功结果与不变量**：按现有格式规则解码；保留稳定身份、共享关系、偏移和未知未来版本拒绝策略；一次完整解码。
- **预览、确认、取消与历史**：打开不制造编辑历史；不以工程编码充当撤销快照。
- **保存重开**：保存重开结构与像素一致；未修改资源允许复用；保持格式语义。
- **失败与边界**：引用循环、缺资源和损坏内容拒绝；未支持结构不得静默删减再保存。
- **验收 AC-FS-005**：往返包含共享 cel、组蒙版、Tilemap 和画布外内容的工程，核对像素与共享关系。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：部分源码与自动测试已核对；具体 FS-005 子项、模拟边界、待执行项见[文件生命周期专项](../file-lifecycle.md)。不是整条需求验收通过。
- **证据与复核入口**：[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[docs/file-format.md](../../../../legacy/docs/file-format.md)；[src/renderer/src/store/document-file-service.ts](../../../../legacy/src/renderer/src/store/document-file-service.ts)；[src/renderer/src/store/document-save-queue.test.ts](../../../../legacy/src/renderer/src/store/document-save-queue.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="fs-006"></a>
## FS-006 恢复与本地回溯

- **目的与前置**：异常退出、恢复草稿或已有本地版本。
- **输入、参数与范围**：自动恢复默认开启，每 5 分钟，范围 0.5–60 分钟；恢复保留默认 7 天，范围 1–365 天；本地历史默认关闭，默认 50 步。
- **作用对象**：恢复记录及其对应工程。
- **成功结果与不变量**：打开草稿不删除记录；放弃会话不删除原草稿；显式删除、完整保存成功或超出配置保留期限可清理；并发写入不能复活已删除项；删除错误不得假装成功。
- **预览、确认、取消与历史**：恢复失败保留原数据；备份回溯为一次可撤销编辑并保留保存路径，Undo/Redo 恢复对应作品；本地历史加载不得覆盖较新磁盘作品或加载期间的新编辑。
- **保存重开**：描述与工程数据须成对可发现；旧版分别写入、无跨文件原子提交，孤儿恢复策略列 GAP-015；录像引用保持有效。
- **失败与边界**：目录不可写可降级但需报告；不以恢复失败阻止新建正常工程。
- **验收 AC-FS-006**：从同一草稿连续两次恢复并模拟退出；保存期间再编辑；删除时有在途写入不得复活。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：部分源码与自动测试已核对；具体 FS-006 子项、模拟边界、待执行项见[文件生命周期专项](../file-lifecycle.md)。不是整条需求验收通过。
- **证据与复核入口**：[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[docs/file-format.md](../../../../legacy/docs/file-format.md)；[src/renderer/src/store/document-file-service.ts](../../../../legacy/src/renderer/src/store/document-file-service.ts)；[src/renderer/src/store/document-save-queue.test.ts](../../../../legacy/src/renderer/src/store/document-save-queue.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="fs-007"></a>
## FS-007 导出与精灵表

- **目的与前置**：有作品或选中导出范围。
- **输入、参数与范围**：当前图、全部帧、画布/帧/切片；精灵表行列/条幅、裁切、去重、拆图层和循环节。
- **作用对象**：导出副本。
- **成功结果与不变量**：精灵表位置与元数据一致；PNG 透明正确；PSD 只导出当前帧可表达结构，不宣称支持 PSD 导入或动画；逐帧排除 PSD/GIF。
- **预览、确认、取消与历史**：预览为临时结果，取消保留原作品；导出不增加文档历史。
- **保存重开**：输出按明确路径编码；自动打开精灵表默认关闭。
- **失败与边界**：失败反馈且不改原工程；格式损失需要明确表达。
- **验收 AC-FS-007**：含空帧、重复帧和切片的动画按行列导出，核对布局；取消预览不改变视图与工程。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[docs/file-format.md](../../../../legacy/docs/file-format.md)；[src/renderer/src/store/document-file-service.ts](../../../../legacy/src/renderer/src/store/document-file-service.ts)；[src/renderer/src/store/document-save-queue.test.ts](../../../../legacy/src/renderer/src/store/document-save-queue.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="fs-008"></a>
## FS-008 缩时录制、便携与导出

- **目的与前置**：录制初始默认关闭；开启后有已提交操作。
- **输入、参数与范围**：全程/智能采样、是否记录撤销、画质、倍率/帧率；视频和图片序列导出。
- **作用对象**：工程录像清单与本地库。
- **成功结果与不变量**：记录内容操作而非墙钟停顿；导航不录制；智能采样保留近期并精简早期；缺库仍可打开画作。
- **预览、确认、取消与历史**：切换模式本身不删帧；清空不可撤销，仅清清单，不删除共享库。
- **保存重开**：普通保存携带已落盘引用；便携保存内嵌；旧内嵌记录迁移；核验 CRC。
- **失败与边界**：编码或库缺失可见；内嵌帧缺失或尺寸非法可丢弃并报告数量及原因，受限展开超限拒绝；不可把未落盘帧保存成有效引用。
- **验收 AC-FS-008**：绘制/平移/撤销混合录制；移走副本录像库测试告警；便携工程离机恢复首尾画面。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：部分源码与自动测试已核对；具体 FS-008 子项、模拟边界、待执行项见[文件生命周期专项](../file-lifecycle.md)。不是整条需求验收通过。
- **证据与复核入口**：[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[docs/file-format.md](../../../../legacy/docs/file-format.md)；[src/renderer/src/store/document-file-service.ts](../../../../legacy/src/renderer/src/store/document-file-service.ts)；[src/renderer/src/store/document-save-queue.test.ts](../../../../legacy/src/renderer/src/store/document-save-queue.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

