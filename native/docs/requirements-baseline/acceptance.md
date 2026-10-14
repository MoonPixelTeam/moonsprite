# 验收协议与样本索引

中文；返回[需求基线](README.md)。逐条验收编号见 [cases.md](cases.md)。本页描述验收协议；已执行的局部自动验证见[文件领域记录](file-lifecycle.md)，不表示旧版或原生版整体已经通过。

## 公共测试协议

每条 AC 编号记录旧版源码提交、实际构建/运行版本、原生版版本（尚无则标未实现）、操作系统、硬件/DPI、样本 ID、输入参数与操作序列、预期、实际、状态及证据路径。不启动用户正在使用的工程做破坏性实验。

对每个适用用例检查：

1. 成功：在有效目标执行，检查像素/结构/事件与范围。
2. 取消：在预览和确认前取消，对比内容、选择、dirty、历史和外部文件。
3. 撤销与重做：确认操作后单步撤销恢复基线、重做恢复结果；共享内容不重复应用。
4. 保存重开：在副本路径保存，比较结构、身份和像素；会话状态按规范而非强行全部持久化。
5. 失败/中断：非法输入、不可写路径、失效目标、切换文档、任务取消；验证原数据不变、错误可见。
6. 范围：无选择/显式选择、隐藏/锁定、空 cel、颜色模式、多帧/多层、偏移和越界各按功能适用性组合。

没有历史或保存意义的 UI 操作用“不适用：仅应用状态”等理由替代，不能伪造撤销用例。具有立即提交语义的属性窗口和显式确认的调整窗口分别验收，不能统一规定 Esc 总是取消。

确定性算法比较像素与结构，PNG 等可无损比较解码结果；JPEG/GIF调色量化等按各格式约束验证，不要求所有导出文件字节相同。随机工具固定种子或比较确定的范围/密度/撤销不变量。性能测量与正确性测试分开。

## 可复用样本和构造配方

下表均引用仓库已有测试构造或给出新样本配方。没有声称已生成新二进制工程；后续运行时只在隔离输出目录创建副本。

| 样本 | 来源或确定构造 | 主要断言 |
| --- | --- | --- |
| S-01 最小保存 | [document-save-queue.test.ts](../../../legacy/src/renderer/src/store/document-save-queue.test.ts)中的2×2 RGBA，阻塞首次写入再提高修订 | 同修订合并、新修订再写、另存为独立、失败可重试 |
| S-02 椭圆渐变 | [gradient.test.ts](../../../legacy/src/renderer/src/core/gradient.test.ts)：(0,0)到(8,4)，红到蓝 | 中心红、两轴端蓝；零轴有限；旋转/多色标/撤销 |
| S-03 浮动粘贴 | [workspace-floating-clipboard.test.ts](../../../legacy/src/renderer/src/store/workspace-floating-clipboard.test.ts)，另补8×8棋盘底色、L形选择 | 移选框不改像素，多次移动不取新底色，取消/历史一致 |
| S-04 共享层 | [workspace-linked-layers.test.ts](../../../legacy/src/renderer/src/store/workspace-linked-layers.test.ts)，至少两层不同偏移 | 同源像素同步，独立属性不绑定，断开与撤销恢复身份 |
| S-05 时间轴 | [workspace-animation-loop-sections.test.ts](../../../legacy/src/renderer/src/store/workspace-animation-loop-sections.test.ts)，补两层三帧与嵌套循环节 | 稳定端点、目标组合、播放与历史分离 |
| S-06 Tilemap | [workspace-tilemap.test.ts](../../../legacy/src/renderer/src/store/workspace-tilemap.test.ts)，两个引用同源格及空格 | 四模式不同写入目标，整格移动只改引用，槽位不改ID |
| S-07 自由瓦片 | [workspace-free-tile-selection-flip.test.ts](../../../legacy/src/renderer/src/store/workspace-free-tile-selection-flip.test.ts)，非方形源与90°实例 | 逆变换回写源、整实例移动不改同源其他实例 |
| S-08 录像 | [timelapse-library-service.test.ts](../../../legacy/src/renderer/src/store/timelapse-library-service.test.ts)与[工程录像测试](../../../legacy/src/renderer/src/core/project-format-timelapse-restore.test.ts) | 本地/内嵌、CRC、缺库、共享库不误删 |
| S-09 Lua 与事务 | [lua-script-service.test.ts](../../../legacy/src/renderer/src/store/lua-script-service.test.ts)与[document-transactions.test.ts](../../../legacy/src/renderer/src/store/document-transactions.test.ts) | 第二步失败回滚、切文档拒绝旧结果、持久回调刷新 |
| S-10 扩展窗口 | [hello-runtime](../../../legacy/docs/extensions/examples/hello-runtime/manifest.json)与[宿主表单协议](../../../legacy/docs/extensions/ui-form.md) | 设置/事件/动作确认与隔离迁移原生，禁用清理 |
| S-11 格式回归 | [高风险矩阵](../../../legacy/docs/testing/regression-matrix.md)指向的各格式构造 | v1至v21迁移、未知版本/截断拒绝、共享身份、颜色模式 |
| S-12 字体与界面 | 九语言混合标签、中文输入、长路径、所有组件状态、Fusion 10px字模的1/2/3倍 | 缺字可见、布局可操作、IME正确、主题不改命令 |
| S-13 长期运行 | 512×512日常、2048×2048多层、4096×4096压力三档；另登记用户真实复杂工程的匿名摘要 | 版本/硬件固定，2小时阶段验收和8小时替换验收；比较冷态及末段延迟/内存 |

## 长期运行与数据保护

固定“悬停、快速移动、缩放、画笔、选区变换、时间轴拖动、播放停止、保存、关闭重开副本”序列。测输入到应用提交画面与真实呈现的不同指标，不混用。记录 CPU、工作集、缓存/历史预算、资源数量和延迟分位数；不以重载/重启后恢复作为通过。

内存允许历史与合法缓存增长，但应受预算约束，关闭重复工程后趋稳。最终数值阈值需在参考设备上冻结；本轮只有防止单调恶化的目标，没有编造已测帧率或内存上限。

异常保存必须在隔离目录注入错误，不删用户文件。打开用户真实作品只读或复制后测试；新旧版本不共用恢复目录，迁移失败保留原数据。没有获准删除就不清理用户录像库和历史会话。

## 本轮验证范围

首次目录拆分仅检查需求文档和静态证据完整性。后续文件领域已执行 104 项旧版自动测试，命令、结果及模拟平台边界见[验证记录](file-lifecycle.md)。其余样本仍是待执行配方；未启动 Demo，未验证真实中文输入/压感/显卡长期稳定性，未创建原生二进制。局部测试不得扩大成整项验收通过。
