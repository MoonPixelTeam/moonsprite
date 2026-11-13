# 主轮询阶段诊断契约

本批实现审计 C04 第5步的观测前提，保留 `editor_lifecycle.cpp` 中16ms计时器的18个阶段、原条件、原调用顺序和异常传播。没有新增主循环、任务跳过、deadline、自动预算调度或性能提升声明。

`TaskStageProfile` 是无UI的有界聚合器；仅保留每阶段及cycle的调用数、失败数、总/最大耗时和积压采样，不保留逐次事件。`MOONSPRITE_TASK_STAGE_PROFILE` 指定退出时写出的TSV文件；未设置或为空时不采样时钟和积压、不写文件。原 `MOONSPRITE_INTERACTION_PROFILE` 输出不变。输出目录须已存在；写失败不影响应用退出。进程被强制终止时不能保证输出。

cycle的预算为现有计时器周期16ms；严格大于预算才计超限。时间为包含阶段执行与观测开销的墙钟耗时，cycle包含阶段间开销；不代表CPU用量、帧率、任务截止时刻或累加可用预算。阶段时间从读取积压前开始。生产使用steady_clock；注入时钟与只读积压函数必须不抛异常。业务异常记录后原样传播，后续阶段仍不执行。

| 阶段 | pending单位/范围 |
| --- | --- |
| home-recovery | catalog与discard的有效future数，含已完成但尚未消费的future |
| brush-preferences | 等待写入标志，0或1 |
| save | 后台任务数，加前台快照/worker有效时的一个活动任务；不是全部待保存请求数 |
| batch-export | FramePngTask busy，0或1；不是帧数量 |
| convolution / anti-alias / gradient-map / wand | 一个有效worker加一个最新等待槽，0至2；有效worker可已完成但尚未消费 |
| gradient / shape | 待处理请求标志，0或1 |
| 其余阶段 | 未采集；pending_samples=0且last/max_pending留空，不能解释为零积压 |

读取积压不能消费future、启动/取消任务或改变合并语义。新增pendingCount仅只读现有槽；预设滤镜与ASE/PSD弹窗独立计时器没有被误纳入此18阶段统计。

验证：`task-stage-profile` 无UI测试覆盖关闭时零观测、顺序、原异常、16ms边界、真实PreviewTask的0/1/2槽、latest替换、取消和迟到完成。源码反向还原证明18个原工作片段和其余lifecycle全文不变；控制器除只读getter、InteractionProfile除独立诊断配置/输出外不变。冻结输入及证明位于 `build/test-tmp/coupling-task-stages-*`。正式应用与公共头构建退出0；重建后8/8项服务/边界及同版5/5项GUI通过。五次TSV共217个周期，18阶段计数、已知/未知积压列及16ms预算验证通过；详见审计10.54。没有新增人工图像或性能基准。

剩余：未采集阶段的队列语义应在其所属边界明确后补充；typed模态所有权与基于依赖的调度仍待完成。不得依据空白积压列关闭C04，或只因诊断完成就改变调度。全部剩余条件见 `coupling-remaining-acceptance.md`。


## 调度职责收口（当前大步，待统一验证）

`TaskPollSchedule` 独立拥有catalog/capture/persistence/interaction/maintenance/preview六组不可变回调，原16ms计时器只负责调用poll。18个阶段与原Stage枚举一一对应、回调和pending表达式原样迁移，构造时检查完整性；没有每tick重建闭包、额外计时器、自动跳帧或并行UI写入。

依赖依据来自现有入口：timelapse capture/flush先于save快照与编码接纳；save接纳exact版本并安排清理先于recovery轮询；playback先于恢复源安全性判断；preview发布仍晚于本轮save安全点判定。这些依赖保持原顺序，不以统计耗时推导新的deadline策略。诊断继续只观察预算与已知积压，不把未知样本补零。

新增独立检查按18阶段记录真实回调次序，验证save→recovery→preview的发布边界、诊断关闭时不访问pending、失败原异常及同周期中止、下一周期恢复。原受控PreviewTask/有类型模态和owner/Apply检查继续作为领域层证据，不把轮询编排冒充任务所有权。


本大步已统一构建并验证，原18回调/谓词/顺序源码证明通过；task-stage-profile服务及14项相关检查通过，同版7项正式入口通过，4个采样进程共111周期，另外3个同步场景为0周期。依赖分组服务不改变18阶段、16ms观测预算或异常规则。typed模态与受控任务证据沿用已验收且源码哈希未变的实现，C04按原审计范围关闭；其他审计项与legacy迁移缺口不随之关闭。详细证据见实施报告“轮询与提交边界：本大步验收结果”。
