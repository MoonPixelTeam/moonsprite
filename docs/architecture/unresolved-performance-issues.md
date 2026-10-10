# 未溯源性能问题清单

中文 | [English](unresolved-performance-issues.en.md)

> 这是“越用越卡、输入延迟、预览落后”问题的长期维护入口。清单只登记已经发生过、但尚未完成根因闭环的问题；已修复的 JS/业务缓存缺陷另见[内存泄漏 / 内存堆积审计报告](memory-leak-audit.md)。
>
> **当前结论**：当前 155 现场已确认 128,699 条待回收统计记录及 298 条已完成却未 flush 的队首帧。停滞位置已明确，最初触发与恢复因果尚待验证；raw 对照失败并已撤回。任何“重载后不卡”仍只能算 reset 对照。

## 维护规则

每次新的现场或实验都要更新对应条目的“最近证据”和末尾的维护记录，不另建同义清单。没有原始数据文件、Runtime 版本、PID 和固定操作序列的主观感受只能作为现象记录，不能改变问题状态。

问题状态只使用以下值：

- `confirmed`：现象和关键指标在真实现场复现，根因仍未闭环。
- `suspected`：有直接证据支持机制，但还缺少因果干预。
- `needs-reproduction`：曾发生，当前没有稳定复现协议。
- `blocked`：下一实验被权限、采样接口或环境条件阻断。
- `fixed`：同工程、同操作序列的前后数据达到验收阈值，并且不依赖页面重载才能恢复。

### 固定采样字段

每个复现 run 至少记录：

```text
runId / 采样时间 / Runtime 完整版本 / Host PID / Renderer PID
工程摘要（画布尺寸、图层数、帧数、空 cel 比例、样式/动画状态）
操作序列与持续时间 / 页面是否重载或重启
removal_trackers_ 初值、末值、容量、增长率、状态抽样
FrameSorter pending/head/tail、begin/ACK 匹配数、last_sorted_frame_id
Compositor CPU 总量和每秒峰值
鼠标/滚轮 Renderer wait P50/P95/max、应用 handler 耗时
原始 trace、分析 JSON、用户主观跟手性
```

### 统一复现状态机

1. 记录 Runtime、PID、工程摘要和页面会话 ID；打开同一个工程后先采 60 秒冷态基线。
2. 固定执行“画布悬停 → 快速移动 → 滚轮缩放 → 时间轴拖动 → 笔刷绘制 → 播放/停止”的顺序，每项 60 秒；每秒采集上述字段。
3. 达到阈值立即保存现场，不重载页面；只做一个干预后重复完全相同的序列。
4. 页面重载/软件重启只作为 reset 对照，必须单独标注，不能作为修复验收。

### 统一验收门槛

修复只能在同工程和同操作序列上同时满足：

- `removal_trackers_` 在 10 分钟内不再单调增长，增长不超过基线的 1%，且不接近容量的 80%。
- FrameSorter pending 不持续增长；队首完成 begin/ACK 后能在两个帧周期内出队。
- Compositor 平均 CPU 相对同场景基线下降至少 50%，不再出现持续 5 秒以上的单核 80% 峰值。
- Renderer 鼠标和滚轮等待 P95 ≤ 50 ms、max ≤ 100 ms；应用 handler 仍保持毫秒级。
- 用户确认指针、像素笔刷预览、滚轮和时间轴连续操作无需等待前一项预览完成。
- 以上结果在页面不重载、软件不重启的连续长时操作中成立。

## 当前证据目录

| 证据类别 | 原始文件 | 用途 |
|---|---|---|
| 现场结论 | [investigation-conclusion.json](../../output/zoom-latency-20261008/investigation-conclusion.json)、[current-findings.md](../../output/zoom-latency-20261008/current-findings.md) | 调查范围、时间线、结论边界 |
| 输入等待 | [desktop-live-latency.json](../../output/zoom-latency-20261008/desktop-live-latency.json)、[trace-input-findings.json](../../output/zoom-latency-20261008/trace-input-findings.json)、[desktop-live-trace-summary.json](../../output/zoom-latency-20261008/desktop-live-trace-summary.json) | Renderer 等待、Compositor CPU、事件分位数 |
| 原生 tracker | [before-protocol-reset-collection.json](../../output/zoom-latency-20261008/before-protocol-reset-collection.json)、[protocol-current-collection.json](../../output/zoom-latency-20261008/protocol-current-collection.json)、[compositor-native-stacks.json](../../output/zoom-latency-20261008/compositor-native-stacks.json) | 数量、容量、状态抽样、原生栈 |
| FrameSorter/ACK | [protocol-current-sorter.json](../../output/zoom-latency-20261008/protocol-current-sorter.json)、[frame-acks-ordered.json](../../output/zoom-latency-20261008/frame-acks-ordered.json)、[raf-acks.json](../../output/zoom-latency-20261008/raf-acks.json) | pending、队首、begin/ACK、排序推进 |
| 干预对照 | [after-visibility-collection.json](../../output/zoom-latency-20261008/after-visibility-collection.json)、[after-devtools-close-collection.json](../../output/zoom-latency-20261008/after-devtools-close-collection.json)、[after-continuous-raf-collection.json](../../output/zoom-latency-20261008/after-continuous-raf-collection.json) | 失败的最小化、DevTools、空 RAF 对照 |
| 复杂工程样本 | [airattack-20261008-timeline](../../output/airattack-20261008-timeline/)、[brush-heavy-20261008](../../output/brush-heavy-20261008/)、[large-pan-trace.json](../../output/large-pan-trace.json)、[large-draw-complex-before.json](../../output/large-draw-complex-before.json)、[timeline-live-before.json](../../output/timeline-live-before.json) | 大画布、多图层、多帧、绘制和时间轴场景 |
| 业务缓存修复 | [memory-leak-audit.md](memory-leak-audit.md)、[memory-audit-fixes-20261008](../../output/memory-audit-fixes-20261008/) | 区分 JS/业务缓存与 WebView 原生状态 |
| 页面级归因（U-09） | [root-cause-20261009.md](../../output/live-lag-20261009/root-cause-20261009.md)、[session-trend.tsv](../../output/live-lag-20261009/session-trend.tsv)、[profile-attribution.json](../../output/live-lag-20261009/profile-attribution.json)、[trace-compositor.json](../../output/live-lag-20261009/trace-compositor.json)、[session-trend.mjs](../../output/live-lag-20261009/session-trend.mjs)、[profile-attribution.mjs](../../output/live-lag-20261009/profile-attribution.mjs)、[trace-compositor.mjs](../../output/live-lag-20261009/trace-compositor.mjs) | 24.577 秒现场的业务/引擎耗时切分、逐分钟负载曲线、每帧固定重路径坐标 |

## 严重度排序

### U-01 · P0 · WebView 原生合成状态持续累积

- **状态**：`confirmed`（原生滞留已在 155 现场复证，未修复）
- **首次发现**：2026-10-08，开发版真实窗口。
- **最近证据**：2026-10-09，runId=`run39108`，Runtime **155.0.4283.45**，Host **39108** / Renderer **33964**，同一页面会话 `d35cd59a-5de7-442e-8636-9d30e2083909`。只读扫描发现 `removal_trackers_` **128,699 条、容量 131,072**；32 条分布抽样全部为 `kScheduledForTermination`。匹配当前 PDB/二进制验证布局，没有使用 154 偏移。[现场报告](../../output/live-lag-20261009/run39108-findings.md)、[对象扫描](../../output/live-lag-20261009/current155-objects-collection.json)、[tracker 字段](../../output/live-lag-20261009/current155-trackers-2.json)。
- **用户可见现象**：使用越久，指针预览和后续滚轮等操作一起落后；重载后暂时恢复。
- **触发场景**：本次 512×512、10 图层、2 组、1 帧、无样式；大画布、复杂内容、多图层、多帧仍须纳入长期验收。
- **历史证据**：154 现场约 177,116 条滞留记录；旧 155 Host 34616 / Renderer 38136 的 Compositor CPU 为 18.764/24.577 秒。页面重新初始化后读数为 0 只是 reset 对照。[旧 tracker](../../output/zoom-latency-20261008/before-protocol-reset-collection.json)、[旧 trace 分析](../../output/live-lag-20261009/performance-analysis.json)。
- **机制证据**：当前 155 `DestroyTrackers` 逐项扫描 vector，并只移除 termination state=2 的记录；状态 1 会继续留在每帧回收/帧结束路径。`ScheduleTerminate` 比较 last-ended 与 last-sorted，`AddSortedFrame` 才推进后者。U-02 同时读到 298 个已完成队首帧未 flush。[当前二进制](../../output/live-lag-20261009/edge155-sorter-disassembly.txt)、[回收反汇编](../../output/live-lag-20261009/edge155-reclamation-disassembly.txt)。这些确定了滞留位置，尚未通过恢复干预量化其对延迟的因果贡献。
- **失败对照**：关闭 raw、系统光标、阻断普通 hover、移除 GPU promotion、最小化恢复、关闭 DevTools、连续空 RAF 均未恢复旧现场。本次 raw 调整后用户仍反馈明显延迟，候选代码已撤回。
- **证据口径修正**：旧 trace 的主线程 RunTask 61.3% 是墙钟占比，CPU 约 35.2%；任务间隔很短不能排除自维持循环。持续提交与低可用内存只是相关因素，尚无因果干预；当前会话可用内存约 3.7 GB，不能套用旧现场的内存压力解释。
- **未知点**：最初未返回/迟到 ACK 的触发者，队列何时首次进入停滞，以及业务/HMR/诊断/Runtime 各自的责任。
- **现场状态变更**：21:21 撤除临时 Vite 模块后整页热重载，旧 session 在 13:21:20.413 UTC 结束，3 秒后出现新 renderer.started；PID 未变。随后 tracker=0/pending=2 是**重载对照**，不是生命周期干预或修复。[重置时间线](../../output/live-lag-20261009/run39108-page-reset.json)。
- **独立接口验收**：Runtime 155 的 [独立对照报告](../../output/live-lag-20261009/isolated-recovery-findings.md) 已确认官方 controller `SetIsVisible(false/true)` 保留页面身份/timeOrigin，正常窗口的帧统计计数重置后继续增长、输入 P95 约 10 ms。单次 12 秒 JS 阻塞未复现长期堆积；CDP frozen/active/bringToFront 在独立窗口仍留下 hidden 状态，撤回其作为通用恢复方法的建议。**没有异常现场恢复或性能改善证据**。
- **唯一下一步**：在发生下一次现场之前准备原窗口的原生 controller 可见性控制通道；真实堆积时先保存 before，再只做一次 false/true，比较同页面的 tracker、排序推进、CPU 和输入等待。当前主程序尚未接入该通道，不得临场改 Rust、新增/删除 Vite 模块。即使成功，也先记为恢复机制，不直接记为长期根治。
- **通道已就绪（2026-10-09）**：主程序现在有 `platform_diagnostics::set_webview_visible(visible)` 命令，直接驱动 `ICoreWebView2Controller::SetIsVisible`（webview2-com 0.38.2，`SetIsVisible(bool)` / `IsVisible(*mut BOOL)`，`src/platform_diagnostics.rs:270`）。这次改动**在无现场时完成**，因此不触碰"不得临场改 Rust、新增/删除 Vite 模块"这条约束：它是准备物，不是现场手术。三点设计约束：① 每次布置会把请求值与 controller **实际读回**的值（`prior`/`settled`）一起写入 `webview.visibility-intervention` 事件，因为被拒绝的隐藏（模态子窗口、已在可见性切换中）必须可辨认，不能被读成"实验失败"；② 单次干预闸门 `claim_visibility_intervention` 每会话只放行一次 false/true，重复请求直接报错而不是静默叠加，两次干预的 before/after 证据无法事后区分；③ 只有 dispatch 本身失败才退回闸门，超时**故意不退回**——controller 可能已经改变状态，重试会叠加上第二次切换。命令注册在 `lib.rs`，闸门与载荷有单元测试。
- **注意**：该通道**尚未生效于正在运行的 PID 1660 实例**，它是本次改动之前启动的二进制；验证需要在**新构建的实例**里发生，或者在下一个现场里用它。按上文约束，下一个现场仍应：先在 lag 模式下保存 before trace，再调用一次 `set_webview_visible(false)`，等 60 秒静止，再调用一次 `set_webview_visible(true)`，最后保存 after trace，比较同一页面的 tracker、排序推进、CPU 和输入等待。
- **验收标准**：统一验收门槛；同页面连续操作不再滞留，输入恢复需与原生状态恢复同时发生。

### U-02 · P0 · FrameSorter 已完成 ACK 的队列停止 flush

- **当前 155 现场复证（run39108）**：两次稳定只读快照相隔 157.729 秒，pending=300、已完成前缀=298、队首 begin=2/ACK=2、head=220、tail=153、total_frames=403245 均未推进。当前二进制 AddNewFrame/结果分支支持超限淘汰后缺少主动 flush 的候选机制；初始 ACK 缺口和恢复因果仍未证明。[快照 1](../../output/live-lag-20261009/current155-sorter.json)、[快照 2](../../output/live-lag-20261009/current155-sorter-2.json)、[155 反汇编](../../output/live-lag-20261009/edge155-sorter-disassembly.txt)。
- **真机逐条分解（2026-10-09，离线重解析上述 155 快照）**：[sorter-stall-155.json](../../output/live-lag-20261009/sorter-stall-155.json) 显示队列中 **0–297 条全部完成**（`Begin==Ack`），只有**末尾两条**（索引 298、299）为 `Begin=1 / Ack=0`——即"已 begin、从未收到 ACK"。也就是说，**卡住的不是队首，而是队尾两个缺 ACK 的帧**，而队首自身早已完成。两份快照相隔 157.729 秒逐字段相同（Pending/Head/Tail/TotalFrames 完全一致），说明队列既未推进也不自愈。这比此前的参考算法模型强：阻塞条目及其精确 begin/ack 计数现在是从**在跑的 155 进程**读出的，不是从 154 偏移推断的。[页重置对照](../../output/live-lag-20261009/current155-sorter-after.json)（pending=2、total_frames 重置为 8619）是**重载对照，不是自愈证据**。
- **状态**：`confirmed`
- **首次发现**：2026-10-08，原生只读内存和匹配 PDB 分析
- **最近证据**：同一现场的 [protocol-current-sorter.json](../../output/zoom-latency-20261008/protocol-current-sorter.json)、[frame-acks-ordered.json](../../output/zoom-latency-20261008/frame-acks-ordered.json)、[raf-acks.json](../../output/zoom-latency-20261008/raf-acks.json)
- **用户可见现象**：帧预览落后指针；当预览没追上时，后续滚轮或其它鼠标操作也像被阻塞。
- **关键证据**：约 300 个 pending frame 中约 298 个 begin/ACK 已匹配；队首自身 begin=2、ACK=2，却仍未出队，`last_sorted_frame_id` 长时间停在早期帧或 0。
- **2026-10-09 离线进展**：两份旧现场重新解析均为 300 个 pending、298 个已完成状态，队首先连续 297 个已完成。保存的 Chromium 参考源码中，`AddNewFrame` 超限淘汰旧队首后没有主动 flush；`AddFrameResult` 只在本次 ACK 恰好属于队首时触发 flush。因此“一个 ACK 未返回 → 队列达上限 → 旧队首被淘汰 → 新队首早已完成，再无 ACK 唤醒”可形成自维持停滞。
- **离线数值与边界**：在参考算法模型中输入 10,001 帧、只缺第一帧 ACK，会留下 300 个已完成 pending、输出帧数为 0；模型加入“淘汰后检查已完成队首”则 pending 为 0、输出 10,000 帧。全部 ACK 正常和上限内的迟到 ACK 对照正常。此结果是**机制假设实验**，没有修改 WebView，也没有证明用户现场最初为何缺 ACK，更没有证明 155 复现或软件已修复。[可重复实验脚本](../../output/zoom-latency-20261008/sorter-overflow-replay.py)、[结果](../../output/zoom-latency-20261008/sorter-overflow-replay.json)。
- **旧二进制核对**：匹配 154 的 PDB 将 `AddNewFrame` 定位到 RVA `0xd30010`；[只读反汇编](../../output/zoom-latency-20261008/edge-add-new-frame-disassembly.txt)包含队列长度与上限比较（`d30366`）、超限删除 state/info（`d3045c`/`d30467`）和队首推进（`d304e6`）。这支持参考算法路径，但完整上游源码与当前 Runtime 的行为仍须分别验证。
- **已排除项**：不能归因于“所有帧都没收到 ACK”；首次内容绘制标志已确认不是始终为 0。
- **当前判断**：完成反馈之后排序或 flush 条件停止推进，可能让 tracker 不能进入回收状态；这是目前距离具体机制最近的线索，但尚未有因果干预。
- **未知点**：最初遗漏/迟到 ACK 的具体条件，以及 RAF/动画、页面生命周期、诊断或 HMR 是否改变触发概率。155 队列停滞本身已复证。
- **独立试验边界**：主线程阻塞区间确实产生约 11,998 ms 等待，但结束后输入 P95 恢复到 9.8 ms，tracker=0；没有复现持续排序停滞。官方 controller 可见性切换可重置正常统计路径，尚未证明可以恢复异常队列。高帧率下树/队列读取失稳的结果已排除，不能将单字段计数器当完整 FIFO 快照。[原始数据与失败记录](../../output/live-lag-20261009/isolated-recovery-findings.md)。
- **唯一下一步实验**：在真正复现的窗口执行已经验证可操作的官方 controller 干预，保留页面身份并同时比较排序、回收和输入；先预置原生通道，禁止临场热更新或按旧版偏移读取新版结构。无需再重复普通鼠标 JS 采样或单次长任务对照。
- **验收标准**：干预前后同场景队首 begin/ACK 后 ≤2 帧出队，pending 不增长；输入等待和 tracker 增长也同步改善，否则只记为相关性。

### U-09 · P0 · 页面级长生命周期状态累积 + 每帧固定重路径

- **状态**：`suspected`（长期退化现象已确认，页面级累积机制未闭环）。
- **用户现象**：任何尺寸画布约 30–60 分钟后可能落后；关闭工程、换工程仍卡，页面重载或重启暂时恢复。
- **定位边界**：跨工程持续性指向页面/进程级状态，也可能是旧文档引用或全局业务缓存没有释放。不能仅凭换工程就排除文档、撤销历史或按文档索引的缓存。
- **旧 Host 34616 / Renderer 38136 的量化结果**（24.577 秒，不能与 run39108 混为同一现场）：

  | 项 | 结果 | 边界 |
  |---|---:|---|
  | 应用源码 profile 自耗时 | 341.8 ms，占录制窗口 1.4% | 不是占主线程 CPU 的 1.4%；采样自耗时不能覆盖所有引擎工作 |
  | 主线程 RunTask | 墙钟 15,074 ms / 61.3%；CPU 约 35.2% | 墙钟与 CPU 必须分别报告 |
  | Commit | 1,471 次 / 墙钟 6,215.9 ms | 离线重解析得跨度 20,414.7 ms ≈ **72 Hz**，间隔中位数 10.86 ms；同窗口 `MouseMove` 17,976 个（占全部输入 98%）⇒ 提交是**输入驱动**，静止区间仅约 3.5 Hz，无自维持空闲提交环。数量本身仍不能确认触发者或全部 CPU 归因 |
  | Compositor | CPU 18,763.8 ms / 76.3% 单核 | 96.4% 任务间隔 <0.1 ms 不能排除自维持任务循环 |
  | 滚轮进入主线程前等待 | P95 1,764.357 ms / max 4,844.909 ms | JS capture 均值 1.3–2.0 ms 不能排除浏览器前排队 |
  | 可用内存 | 0.81 GB | 只证明压力背景，未证明重复栅格化因果；run39108 约 3.7 GB |

- **仍可查的页面路径**：profile 标出 renderFrame、笔刷 overlay、几何布局读取与 React 调度。它们可能放大已有积压，但累计耗时和 LoAF 行号不是根因干预。`canvas.stage.draw` 未记录只能说明没有达到日志条件，不能证明没有绘制成本。
- **尚不能排除**：幂等守卫和 observer disconnect 降低普通重复注册风险，但不能排除 HMR 残留或诊断扰动；堆/DOM 进入平台也不能证明全部引用已正确释放。BrushDynamics 的当前 subscriber 数据只限定这段采样的通知成本。
- **新增原生证据**：run39108 已读到 128,699 条待回收记录以及 298 条已完成但未 flush 的前缀。U-01/U-02 优先执行因果恢复对照；不再要求重启后重新复现，也不重复普通鼠标采样。
- **下一步顺序**：先做当前现场原生状态恢复与输入对照；之后以相同负载比较 dev/production，检验 HMR/诊断是否改变触发概率。仅 dev 复现不能直接证明 HMR，生产版复现也不能排除开发版另有 HMR 放大因素。
- **验收**：需要释放/积压曲线与输入延迟一起改善，并满足统一长时门槛；仅重载后恢复、仅业务 profile 很小或仅 heap 有界都不能关闭此项。

### U-03 · P1 · Renderer 输入队列反压

- **状态**：`confirmed`（后果确认，根因未闭环）
- **首次发现**：2026-09 至 2026-10 多次开发版现场
- **最近证据**：[trace-input-findings.json](../../output/zoom-latency-20261008/trace-input-findings.json)、[desktop-live-latency.json](../../output/zoom-latency-20261008/desktop-live-latency.json)
- **用户可见现象**：鼠标等待 P95 约 886.108 ms，滚轮等待 P95 约 2,143.909 ms；应用事件处理通常为毫秒级。
- **当前判断**：延迟主要发生在浏览器把事件交给 Renderer 主线程之前/期间，业务 handler 不是主要耗时点；它很可能是 U-01/U-02 的下游后果，不能单独当根因。
- **已排除项**：单独改 pointerrawupdate、光标路径、hover 预览和 GPU promotion 没有消除延迟。
- **未知点**：是否所有输入都被同一 compositor 状态阻塞；是否存在独立的 WebView 输入调度问题。
- **唯一下一步实验**：在同一次现场同时记录原始事件时间戳、Renderer 入队时间、handler 开始/结束和下一次 RAF/swap 时间，按事件类型拆分等待来源。
- **验收标准**：鼠标、滚轮和时间轴拖动 P95 ≤50 ms，且预览未完成时下一输入仍能被接收。

### U-04 · P1 · 触发组合无法稳定复现

- **状态**：`needs-reproduction`
- **首次发现**：用户长期使用反馈；曾在大画布、几十图层、数百帧和复杂内容中明显出现
- **最近证据**：[AirAttack/时间轴/笔刷相关现场文件](../../output/)，以及本清单引用的 U-01～U-03 记录
- **用户可见现象**：同样画布尺寸在不同工程表现不同；空 cel、多帧、多图层、图层样式、大笔刷、动画播放和绘制组合可能放大延迟。
- **当前判断**：当前只有真实用户现场，没有可自动回放、可逐阶段归因的最小夹具；因此无法判断是像素合成量、DOM/Canvas 层数、动画统计记录还是操作顺序主导。
- **已排除项**：不能用 512×512、8 图层工程“重载后正常”代表复杂工程已排除。
- **唯一下一步实验**：建立四维最小矩阵：画布 512/4096、图层 8/40、帧 1/297、内容空/复杂；每格只执行悬停、滚轮、时间轴拖动和短笔刷四步，记录统一字段。
- **验收标准**：得到可重复触发的最小组合，并能在同一组合上重复三次得到相近的 tracker 增长和输入 P95；否则保持 `needs-reproduction`。

### U-05 · P2 · 生命周期恢复路径不明确

- **状态**：`blocked`
- **首次发现**：2026-10-08 调查阶段
- **最近证据**：`getCurrentWebview().hide/show()` 因 Tauri 权限 `core:webview:allow-webview-hide` 被拒；Protocol Monitor frozen/active 对照尚未在累积现场执行。
- **用户可见现象**：页面重载可以清零状态并恢复跟手，但代价是丢失当前现场，不能作为可交付修复。
- **当前判断**：可能存在无需重启的生命周期恢复手段，但当前权限和实验时机不足以判断；不能修改权限或写浏览器私有内存来“清理”。
- **唯一下一步实验**：只在 U-01 再次达到阈值后，通过已开放的 CDP Page 生命周期接口执行一次 frozen→active，并保存前后 sorter/tracker/输入数据。
- **验收标准**：如果只恢复输入但 tracker 仍增长，记录为临时缓解；只有状态有界且连续长时稳定才可进入 `fixed`。

### U-06 · P2 · WebView Runtime 版本依赖未定

- **状态**：`needs-reproduction`
- **首次发现**：U-01 的原始现场使用 154.0.4258.62
- **当前环境**：已安装并签名验证 WebView2 **155.0.4283.45**，安装目录为 `C:\Program Files (x86)\Microsoft\EdgeWebView\Application\155.0.4283.45`。
- **最新现场**：runId=`live-lag-20261009` 已确认 155 上仍有延迟；滚轮创建到 renderer main 的 P95 **1,764.357 ms**、最大 **4,844.909 ms**（81 个具备该 component 的样本）。[分析](../../output/live-lag-20261009/performance-analysis.json)仍不足以证明与 154 具有完全相同的私有状态根因。
- **当前判断**：升级可能改变 Chromium 合成行为，但不能把“升级后暂时不卡”解释成业务修复；也不能把 154 的原生布局和数值直接外推到 155。
- **运行时版本必须随现场记录**：此前版本号只出现在 trace manifest 里，没有保存 trace 的会话就没有版本。现在宿主在启动时把实际 Runtime 版本写入诊断日志（`runtime.version`），每份现场自带版本，不再依赖是否成功录到 trace。
- **钉版本通道（已确认可用，尚未启用）**：WebView2 官方支持 `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER` 环境变量覆盖 Runtime 目录（在创建环境时生效，优先于注册表），Tauri 亦在固定版分发路径中设置该变量。这是"绕开某个 Runtime 版本"的真实出口；本条只登记通道存在与用法，**不把钉版本记为已修复**，因为尚未证明 154 不复发。
- **feature flag 结论**：未找到任何可关闭 `FrameSequenceTrackerCollection` / `FrameSorter` 的公开 Chromium feature flag，故不写 `additionalBrowserArgs`。特别地，wry 默认会传 `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`，一旦自行设置该字段即**覆盖**这些默认值，凭空写一个未经证实的 flag 有副作用风险。
- **唯一下一步实验**：在 155 上完成 U-04 固定矩阵，并至少保留一次达到 10 分钟的长测；若能获得可控环境，再用同一工程在 154/155 做配对对照，或经 `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER` 钉住一个已知正常版本做对照。
- **验收标准**：明确标注“155 未复现”“155 仍复现”或“155 指标改善但根因未定”，三者都不能省略 Runtime 版本。

### U-07 · P2 · 原生/页面内存和帧状态观测缺口

- **状态**：`confirmed`（诊断能力缺口）
- **首次发现**：2026-10-08 调查阶段
- **关键证据**：现有页面采集器只记录 pointermove/pointerdown/wheel 到捕获监听器的等待、长任务、可用时的 LoAF/event 条目和最多 128 个 canvas 的 backing 估算；原生采集器此前每 10 秒采样一次、缓存 8 秒，只返回最多 32 个进程的 CPU/内存。两者都没有 tracker、FrameSorter pending/head/tail、GPU 合成计数或输入到 swap 的同一时间线。
- **当前判断**：旧采集器能证明“卡顿发生”，但抓不到这次最可疑的原生机制；它还可能错过短现场。诊断/HMR wrapper 残留本身也可能污染现场。
- **采样调整结论**：本轮曾把原生采样改为 1 秒，随后撤回。提高进程采样频率仍不提供线程栈或帧反馈，且额外进程枚举开销未测；原生采集保留 10 秒间隔、8 秒缓存。`cargo check` 和原生采样测试 2/2 通过只能验证编译及有界生命周期，不能当作卡顿修复验收。
- **测试证据缺口**：`raf-leak-verification.test.ts` 大部分测试只重复理想清理代码，没有导入相应生产组件；`memory-leak-test.test.ts` 的 RAF 计数使用自建 ID，却返回原生 ID，完成 callback 不减计数，缺少 heap API 时把内存当作 0。这些测试不得用于证明“越用越卡已解决”；该结论不影响审计报告中真正导入生产缓存的定向测试。
- **2026-10-09 进展**：原生采集及开销验收通过；公开协议仍不提供私有 tracker/FrameSorter 数量，原始根因仍未关闭。
- **最新确认缺口**：runId=`live-lag-20261009` 的三次自动原生保存额度在 16:35、16:41、16:43 被高 CPU 触发耗尽，16:51 后严重 incident 只能得到 `Browser trace not recording` / `captures:3`。已用独立 DevTools 补录并保存 24.577 秒现场；需要修正额度/触发策略及真实高频输入开销验收，当前未修改原生代码或重启窗口。[现场记录](../../output/live-lag-20261009/findings.md)。
- **唯一下一步实验**：在干净的 155 会话中使用真实工程长期操作，保存首次输入延迟前后的 native trace，比较正常/异常 EventLatency、输入相关 Swap/Presentation 流，定位最初反馈缺口。页面重载不能代替因果验证。
- **验收标准**：诊断开启对冷态和长测的 CPU/输入 P95 增量 ≤5%；关闭后不留 wrapper、listener、RAF 或缓存引用。

### U-08 · P2 · 诊断/HMR 会话污染与真实业务触发混淆

- **状态**：`suspected`
- **首次发现**：多轮现场注入和页面热更新后
- **关键证据**：页面重新初始化后 Host/Renderer PID 不变但 tracker 从约 177,116 清零；此前存在无法从源码保证完全撤销的 RAF wrapper 和监听器。说明“页面 reset 能清理状态”，但不能说明原始状态由业务单独造成。
- **当前判断**：诊断注入可能放大或改变 RAF/动画统计记录，必须与干净会话分离；这不是把用户反馈归咎于工具，而是实验有效性的前置条件。
- **唯一下一步实验**：建立两个独立 profile：干净 `pnpm dev` 会话和一次性诊断会话；两者使用同一工程、同一操作序列，比较 tracker 增长和输入 P95，实验结束销毁整个页面会话。
- **验收标准**：只有干净会话也能重复触发的问题才进入生产修复；仅诊断会话触发的结果标为“诊断污染候选”，不改业务代码。

## 原生采集改造与验收

2026-10-09 已实现：现有“卡顿现场采集”通过宿主保存当前 WebView2 的输入、合成与呈现证据。原始“越用越卡”仍未修复；本节只验收诊断能力。

1. Windows 宿主通过 WebView2 官方 `CallDevToolsProtocolMethod` 访问当前 controller，不依赖用户打开 DevTools、额外远程调试端口或重启。先确认实际 Runtime 支持 `Tracing`/`IO`，失败写入能力状态，禁止静默回退成“采集成功”。
2. 仅在 lag 模式启动 16 MiB 循环缓冲，常驻类别最终收紧为 `input`、`latencyInfo`。真实 trace 含 Compositor、CrRendererMain、EventLatency、InputLatency、Swap、SubmitCompositorFrameToPresentationCompositorFrame、PresentedFrameInformation。它保存与输入相关的帧反馈，不连续记录所有帧的 BeginFrame/Commit；默认不采截图、heap dump 和 CPU 高频采样。
3. `lag.incident`、原生连续两次单进程 CPU ≥75% 单核或可见页面心跳超时触发保存，保留缓冲前段和 5 秒后段。“帮助 → 打开诊断日志”也触发保存。每次宿主运行最多 3 次，间隔至少 120 秒；单文件导出上限 128 MiB、流读取上限 60 秒，部分文件和失败原因保留，不删除旧 trace。
4. 导出配套 manifest：incident/session ID、Runtime、PID、页面/HMR 状态、工程摘要、采集启停与失败原因、trace 是否截断。公开协议**不直接提供私有 tracker/FrameSorter 数量**，不得承诺必然采到这些数值；必要时依据线程和反馈事件继续定向分析。
5. 停用、页面重建和宿主退出必须清理自身回调/定时器；不覆盖 DevTools 或其它窗口已启动的 trace。保存错误进入现有可观测通道，不自动重载、清缓存或修改工程。
6. 独立真实 WebView2 **155.0.4283.45**，复用产品 COM 桥、循环录制和流式导出；同一窗口三组各 60 秒开启/关闭对照。工作负载为 4K 画布、2,000 个色块、持续 RAF 绘制、约 20 Hz 协议输入与滚轮。原始数据和分析见 [最终验收](../../output/native-trace-20261009-input/analysis.json)、[完整检查](../../output/native-trace-20261009/check-final.txt)。这是采集能力测试，不能代替真实工程长期复现或系统鼠标输入验收。

两版高开销配置已弃用并保留证据：[全类别](../../output/native-trace-20261009/analysis.json)的 CPU 中位增量 **35.0%**；[逐帧类别](../../output/native-trace-20261009-lite/analysis.json)为 **17.2%**。最终配置的三组数值、事件覆盖、Runtime 和原始文件路径由 `analysis.json` 保存。关闭后原生 worker 返回 `off` 且 `cleanupError=null`；类型检查、159 项 JS 测试、20 项原生测试及 Rust 风险额度检查通过。完整检查包含工作区既有 D3 差异，没有通过隐瞒文件缩小验证范围。

静态/离线实验仍可继续：当前优先追 U-02 的丢失 ACK/队列超限路径；真实根因闭环还需要当前 Runtime 的浏览器事件或可重复触发，不能用离线模型代替软件性能验收。
最终配置验收通过：宿主及子进程 CPU 中位数为 **42.96% → 43.51% 单核**，相对增量 **1.27%**；输入 P95 中位数为 **10.10 ms → 10.10 ms**，增量 **0%**。这是同一独立窗口三组各 60 秒的结果，不能保证真实工程长测开销或关闭 U-01/U-02。帧间隔数组只保留前 10,000 条，输入样本覆盖完整区间。

## 已修复但不属于本清单的问题

`memory-leak-audit.md` 的 F-01～F-04 已完成业务侧修复并有数据验收：4K 临时合成分配 384 MiB → 64 MiB（减少 83.3%），三次合成中位耗时 534.4 ms → 461.2 ms（减少约 13.7%），直接 dispose 后属性缓存残留 64 MiB → 0，定向测试和 D3 检查通过。这些结果证明 JS/业务缓存治理有效，但**不能证明** WebView 原生 tracker 或 FrameSorter 已解决；两条证据链必须分开维护。

## 维护记录

| 日期 | 变更 | 证据/结论 |
|---|---|---|
| 2026-10-09 | 初建清单，登记 U-01～U-08 | 固化 154 Runtime 现场、reset 对照、失败干预和 155 Runtime 待复测边界 |
| 2026-10-09 | 审计现场采集器与测试证据 | 撤回提高采样频率；需要原生浏览器 trace，理想清理代码片段的测试不能证明本问题已修复 |
| 2026-10-09 | 离线复现 FrameSorter 超限停滞假设 | 两份旧快照均有 297 帧已完成前缀；参考模型只缺一个 ACK 就在 300 帧上限停滞，最初触发和 155 行为仍未证明 |
| 2026-10-09 | 原生采集完成，runId=`native-trace-20261009-input`，WebView2 155.0.4283.45 | 三组各 60 秒开启/关闭，CPU +1.27%、输入 P95 +0%；真实 native trace 和停用清理通过；U-01/U-02 未修复 |
| 2026-10-09 | 保留原窗口补录，runId=`live-lag-20261009`，WebView2 155.0.4283.45，Host 34616 / Renderer 38136 | 155 延迟仍复现；Compositor RunTask CPU 18.764/24.577 秒；滚轮主线程前等待 P95 1.764 秒、最大 4.845 秒；确认三次自动采集额度提前耗尽。鼠标合并反馈延迟与真实入队等待分别记录；私有 tracker/根因仍未闭环 |
| 2026-10-09 | 155 原生栈补充，仍为 `live-lag-20261009` | Compositor 180 次采样中 76 次经过 `FrameSequenceTrackerCollection::DestroyTrackers`、100 次经过 `Scheduler::FinishImplFrame`；根因范围收窄到 Chromium 回收扫描，但尚未确认创建者、155 tracker 数量或可安全的应用侧修复 |
| 2026-10-09 | 对 `live-lag-20261009` 现场做只读离线归因（页面重载前），登记 **U-09** | 业务 JS 仅占主线程 1.4%（341.8 ms / 24,577 ms）；主线程 `Commit` 1,471 次 ≈ 60 Hz 连续提交；Compositor 32,573 任务间隔 <0.1 ms 占 96.4%，无自维持空转环；取得 5 个每帧重路径坐标与 292.7 ms/24.5 s 的布局读取成本。U-01 的高 CPU 位置改为“持续提交 + 内存余量归零”的下游结果，与 tracker 堆积并列而非默认唯一路径  **历史结论，已由 run39108 口径修正替代。** |
| 2026-10-09 | 用户补充复现条件，修正 U-09 范围 | **任何尺寸画布**均 30–60 分钟出现；**关工程后仍卡、换任意工程仍卡**，仅页面重载/重启恢复 ⇒ 病根必须位于页面级或进程级长生命周期状态，**排除文档/撤销历史/按文档持有的缓存**；正常采样现场已丢失，需在干净会话重新复现  **历史结论，已由 run39108 口径修正替代。** |
| 2026-10-09 | 排除与修正记录 | 排除诊断采集器自身泄漏（幂等守卫 + 正确停旧 + observer disconnect）；排除 `BrushDynamicsTelemetryCapture`（唯一订阅者仅在压感弹窗挂载，`notify` 共 9.2 ms）；**修正**本轮早前“DOM 膨胀驱动恶化”的判断——DOM 1,026→3,060 后进入平台，属一次性台阶；**修正** 7.38 GB 写盘的解释——该字段含 IPC 管道字节，非文件写入  **历史结论，已由 run39108 口径修正替代。** |
| 2026-10-09 | 分析产物落盘状态（已更新） | 本轮确认原分析文件实际存在；早先“未落盘”记录已过时，不再要求重新生成。当前 run39108 报告和原始快照另行保存。 |
| 2026-10-09 | run39108 原生对象复证及证据口径修正，Runtime 155.0.4283.45，Host 39108 / Renderer 33964 | 128,699 条 tracker，32 条均 state=1；两份 sorter 快照相隔 157.729 秒仍为 300 pending/298 完成前缀。U-02 改为 confirmed，仍未修复。raw 对照失败、代码撤回；三份早期 trace 与日志已保存 SHA256。修正此前 CPU/墙钟、低内存因果、换工程排除缓存和诊断幂等排除泄漏的过度结论。 |
| 2026-10-09 | Agent 撤除临时模块导致 run39108 页面热重载 | 13:21:20.413 UTC 旧会话结束，13:21:23.148 UTC 新 renderer.started/session；PID 未变，activeDocument=false，随后 tracker=0/pending=2。原现场丢失，不能视为生命周期恢复成功或性能改善；保留前后快照与原日志，禁止现场期间新增/删除模块。 |
| 2026-10-09 | 独立公开接口验收，runId=`isolated-sorter-run2/4/5`，Runtime 155.0.4283.45 | [报告与原始数据](../../output/live-lag-20261009/isolated-recovery-findings.md)：12 秒主线程阻塞未复现长期滞留；CDP 三命令没有可靠恢复可见性；官方 controller false/true 保持页面身份/timeOrigin，正常统计计数 11,270→4→5,171，输入 P95 10.10→10.00 ms。原生失稳快照排除；这是接口和正常路径验收，U-01/U-02 仍未修复，当前主程序未接入原生控制通道。 |
| 2026-10-09 | Aseprite 对照及有界预览缓冲区复用，runId=`aseprite-comparison-20261009/native-run-bounded`，Runtime 155.0.4283.45 | [固定对照清单与数据](../../output/aseprite-comparison-20261009/comparison.md)：512/1024 像素预览同步绘制均值 −16.19%/−12.70%，256 场景未测得稳定收益；每尺寸三组尺寸调整 354→0；12 场景、58,080,000 RGBA 字节差异 0。容量冗余上限 25%，D3 检查通过。本项减少预览资源重建，未证明 U-01/U-02 的初始触发或长期滞留已修复。 |
| 2026-10-09 | Commit 来源拆解（离线重解析 `live-lag-20261009` 现场 trace），新增 [commit-rate-analysis.py](../../output/live-lag-20261009/analyze-commit-rate.py) | 主线程 `Commit` **1,471 次 / 20,414.7 ms 跨度 ≈ 72 Hz**，提交间隔中位数 10.86 ms；同窗口输入 **18,312 个**（`MouseMove` **17,976 个**，占 98%）≈ 每秒 747 个。最大真实输入间隔仅 **628.9 ms**，其间仅 3 次主线程提交。**修正**本轮早前误用合成器线程口径得到的“静止 57 Hz 自持提交”结论：按主线程口径，静止区间 1.99 秒内仅 7 次提交（约 3.5 Hz），**该现场不存在自维持空闲提交环**。代码静态扫描同样未发现跑飞的常驻 rAF 或 CSS 无限动画。结论：帧生产是**输入驱动**的，但“输入多”只解释帧数量，未解释追踪记录为何无法回收。 |
| 2026-10-09 | 宿主启动记录 Runtime 版本，`platform_diagnostics::record_runtime_version` | 每次现场自带 `runtime.version` 事件，不再依赖是否成功录到 trace manifest。`runtime_version_detail` 有定向测试；`cargo check` 与测试目标类型检查通过。未改业务渲染路径。 |
| 2026-10-09 | U-02 真机逐条分解，runId=`run39108`，Runtime 155.0.4283.45 | [sorter-stall-155.json](../../output/live-lag-20261009/sorter-stall-155.json)：队列 0–297 条全部 `Begin==Ack`，仅末尾两条（298、299）为 `Begin=1/Ack=0`。阻塞点是**队尾两个缺 ACK 的帧**，队首自身早已完成；两份快照相隔 157.729 秒逐字段相同，队列不自愈。此结论读自在跑的 155 进程，不再依赖 154 偏移推断。仍未证明缺 ACK 的最初成因与恢复因果。 |
| 2026-10-09 | 接入原生 controller 可见性控制通道（无现场时准备），`platform_diagnostics::set_webview_visible` + `WebviewDiagnosticAction::SetVisible` | 驱动 `ICoreWebView2Controller::SetIsVisible`，回读 `IsVisible` 并把 `requested`/`observed`/`applied`/`prior` 写入 `webview.visibility-intervention` 事件；单次干预闸门每会话只放行一次 false/true，重复请求报错，超时不退回闸门（避免叠加第二次切换）。命令已注册，闸门与载荷有测试，`cargo check --tests` 通过。**PID 1660 实例不含此改动**，通道要新构建才生效。这是 U-01 的**准备物**，不是已证实的恢复手段。 |

下一次更新必须追加：新的 `runId`、Runtime 完整版本、原始数据文件链接，以及问题状态变化的理由。

dev/production 对照必须使用同一 Runtime、工程、操作负载和诊断配置。结果用于比较触发概率，不是 HMR 的二选一定罪/排除规则。
