# 原生诊断日志

基线是legacy/core/runtime-diagnostics、diagnostic-preferences、platform/runtime-diagnostic-writer、platform/runtime-diagnostics及Rust platform_diagnostics/platform_lag_diagnostics与对应测试；完整路径和哈希见legacy-provenance.json。

默认完整记录，关闭不采集并清最近记录，仅采集保留200内存事件，完整/卡顿后台250ms最多100条批写，500待写上限优先error/slow/stall。标量JSON v1保留会话、序号、UTC、单调时钟，48字段/500字符（stack4000）/64KiB事件。写入失败不遮蔽编辑错误，保留100条应急记录及会话内存；既有损坏应急文件不覆盖。正常停止排空pending并join，关闭/切模式按旧版清理待写，不引盲重试。

日志仅新native命名空间diagnostics/native-v1/native-session-数字.jsonl，每文件4MiB/8个只清自身格式普通文件。绝不清理legacy或旧诊断目录、用户笔记/其他jsonl，不递归删除。模式在现有首选项原子保存。菜单真实打开目录；仅内存导出JSON；写失败的前会话应急与当前会话一起去重导出。帮助footer先关闭再调用同一菜单。无诊断内容窗口、无外链假文档、无网络/上传/遥测。

原生适配：500ms UI心跳，超额750ms记stall，实际菜单操作阶段/错误/5秒慢操作，脱敏最近输入类型、错误status；lag每10秒记录scheduler/workspace、后台当前进程CPU/工作集/私有提交及系统可用内存。资源查询失败只记一次，重新开启lag再启用。旧WebView/CDP追踪、浏览器子进程恢复、DOM/RAF/PerformanceObserver归因不适用于原生且不恢复WebView2。原生lag证据不等价浏览器trace，各领域operation-specific埋点覆盖仍非完整迁移。

验收分开：源码/来源检查只覆盖登记；runtime-diagnostics-tests验证隔离目录中模式/ring/pending上限/优先错误/写失败/应急/文件滚动保留与无关文件保留；正式--diagnostics-check验证菜单与帮助footer真实接服务及实际JSONL/JSON文件，Explorer/保存选择器自动测试注入，不把注入称目视系统窗口验收。运行结果与图像结果由唯一写入者实际记录。strict仍因已知迁移缺口失败。
