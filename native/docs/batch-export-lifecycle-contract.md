# 批量导出生命周期解耦契约

当前状态：独立接口已接入帧序列、动画图层、静态图层及切片导出；Lua 已复用进度令牌。正式程序构建、同版20项适用GUI回归及服务与四项边界检查5/5均已通过。C04/C09 和整体耦合修复目标继续未完成。

## 行为依据

实际阅读 Legacy `src/renderer/src/core/document-export-worker-client.ts` 的 Worker 请求身份、结果队列、取消及单次完成保护，以及 `src/renderer/src/store/document-file-service.ts` 的切片／帧路径预检查、逐项编码和原子写入。保留已写文件，失败停止后续输出，成功后才更新最近路径与导出记忆。

原生继续使用现有 DocumentSnapshot 的 2ms 协作捕获，完成快照后才冻结现有格式选项和路径。后台任务仅持有快照、值参数和进度令牌，不持 Editor、窗口或活动 Document。原生使用协作取消替代浏览器 worker.terminate，不能声称与强制终止时延相同。

## 任务边界

`ExportProgress` 是每次导出的共享值令牌，提供 cancel/report/written/total；脚本同步导出可以单独持有令牌，保留 UI 消息泵和执行顺序。

`BatchExportTask` 管理捕获、派发、单 worker、取消与一次性完成。begin 拒绝覆盖未完成任务；捕获完成至派发之间仍保留任务占用。捕获源变化返回错误，取消捕获释放快照。launch 接收快照／格式值闭包，不公开 future；poll 非阻塞接纳结果，区分成功、取消、失败并保留部分写入数量。失败可重试，析构只取消，不等待后台线程。discardCapture 只清理尚未派发的任务，不抛弃运行中结果。

## 已验证范围

受控 executor 不使用 sleeps：捕获取消、过期 deadline、源变化、稳定快照、捕获完成交接保护、禁止替换运行任务及未消费结果、单次完成、部分取消、部分失败、派发异常、未知异常、失败重试、析构时快照寿命、取消令牌寿命、脚本进度共享及捕获失败清理。

独立服务与四项 Editor／架构门禁 CTest 5/5 通过，公共头独立编译通过。日志：`build/test-tmp/coupling-batch-export-service-checks.log`、`coupling-batch-export-service-final-build.log`、`coupling-batch-export-service-checked-build.log`。

## 生产接线与验收边界

Editor 只保留格式、路径、计划及显示状态；原 FramePngJobState、framePngSnapshot_ 和 framePngWorker_ 已退役。任务接管协作捕获、单 worker 派发和 typed Result 接纳。脚本保留原异步编码等待和消息泵，不改变后续 Lua 操作顺序。所有 writer、路径规划、冲突决策和格式默认值保持原实现。

两处原来填入 promise/future 的终态夹具现在通过同一个 launch/poll 边界提交 typed Result；仍先执行真实 writer 并检查部分文件。JPEG 夹具增加共享进度报告以验证真实已写数量。未增加 Editor 公开测试字段。

源码反向证明见 `build/test-tmp/coupling-batch-export-integration-source-proof.json`：脚本、切片和析构的必要替换反向后字节相同；UI 状态、记忆、最近路径、统计、音效、resolve 和打开目录终态表达式反向后相同；产品状态文案与原行为断言保留，移除cancel/error字符串结果协议；两处旧夹具另有修复，详见最终验收。该证明不替代运行验收。

首次正式构建被公共头编译拦截：Editor 位于 moon::editor，新任务位于 moon::workspace，缺少命名空间限定。已补齐所有类型限定；原失败日志保留为 `coupling-batch-export-integration-build.log`。修正构建日志为 `coupling-batch-export-integration-fixed-build.log`。服务及四项边界检查重新通过，见 `coupling-batch-export-integration-service-checks.log`。

## 本批最终验收

唯一正式程序构建退出0，SHA-256 `cb46b72f2b73a06e4e37648ef596490f028089f2f9ff1b31623fdbb77a7e16f7`，UTC `2026-11-12T21:33:10.6041134Z`。最终同版20/20 GUI实际通过，无超时／新错误：帧PNG／自动PNG／BMP／ICO／SVG／JPEG、静态与动画图层批量、切片、音效、打开目录、记忆、默认格式、ASE／PSD写入重开、最近目录、保护、自定义倍率、动画选区、脚本及渐变IO。保留部分失败、取消、源文档历史及后续脚本顺序断言。

服务及四项边界检查最终5/5通过；来源覆盖895项通过，strict退出1保留既有迁移缺口，差异空白检查退出0。893项冻结输入及源码证明哈希无漂移，GUI程序身份一致。最终证据 `build/test-tmp/coupling-batch-export-integration-final-consistency.json`，GUI原始记录 `coupling-batch-export-integration-gui-final`。旧失败和日志均保留。

验收期间修正两处既有夹具：首选项8为已支持的PSD，原夹具误判为未支持；现保留格式0未支持断言，已有真实PSD文件／重开检查走默认格式8入口。动画选区夹具原先靠删两项尾部token伪造旧文件，当前v5/v6新增目录／切片字段后生成了无效结构；现明确编码历史v2记忆与v3预设，保留旧版不推断选区和缺失选区回退断言。两处修正不改变生产导出逻辑，也不删除原行为断言。

首次构建的workspace类型限定错误、首轮脚本双BOM警告及两次旧夹具失败日志均保留；最终脚本编码已修正。最终一致性记录还修正了源码证明中Windows斜杠路径的重复旧哈希键，冻结输入本身无漂移。

本批没有新增人工图像或性能基准，未改变视觉设计。批量导出生命周期已完成本批生产验收；C04其他模态／调度职责、C09其他服务及整体目标仍未完成。
