# 背景图层、工程备份回档与诊断日志验收（2026-10-20）

唯一写入者集成；保留既有用户差异。未创建分支、外部工程或preview，未打包、提交或发布。

## 已实现

- 背景创建使用既有PNG预设库实际像素，默认纯色228；创建保持编辑目标/帧/选择，根底部、所有帧链接同一owner。普通图层转背景仅加背景元数据并移至根底部，保持像素透明度/锁定/链接；转回普通移除背景属性。支持工程往返、撤销重做及微裁剪后扩展保留重复单元。
- 工程保存前备份旧已提交文件；首次/关闭备份不创建版本。真实备份列表、刷新、异步预算解码回档；一条undo/redo保留当前身份、工程ID/名称与保存路径，回档dirty且不静默保存。只清理native-v1自有格式普通备份，旧legacy备份只读枚举；提交后清理失败不反转保存结果。
- 诊断默认完整记录，关闭/内存/完整/卡顿模式、后台有界队列及JSONL轮转、应急记录、真实目录/JSON导出服务及帮助入口。无网络上传。

## 实际运行

正式串行构建成功（/m:1 /nodeReuse:false），最终增量成功。日志：native/build/lcd-background-rollback-diagnostics-build.log、lcd-round-opened-incremental-build.log。

- document-background-tests：0，创建/转换/历史/链接owner/微裁剪重复/工程元数据往返。
- project-save-tests --project-rollback-check：0，真实磁盘旧字节备份→解码回档→撤销重做，身份/dirty/不静默保存、活动操作拒绝、备份失败保护、关闭/首次无备份。系统TEMP首跑创建被拒；仅将该进程TEMP/TMP指到native/build/test-tmp后通过，保留owned fixture，无用户数据删除。
- runtime-diagnostics-tests：0，模式/ring/队列优先错误/实际写入轮转保留/应急/旧与无关文件保留。
- 正式程序 --background-layer-check、--project-rollback-check、--diagnostics-check、--help-check：全部0。回档检查通过实际菜单打开真实列表，点击刷新，损坏owned备份触发读失败并保持文档，点击关闭。诊断系统目录/保存选择器采用注入，不能称实际Explorer/系统保存窗目视通过。结果见native/build/lcd-background-rollback-diagnostics-smokes.json。
- 来源覆盖406文件通过；strict返回1，已知迁移缺口仍存在。

既有project-save-tests全量在到达新回档fixture之前失败“Grouped duration”。本轮未改该旧行为或断言，不称全量保存回归通过；新回档段提取独立模式完成本需求最小验证。

## 明确限制

背景PNG使用现有原生图片解码器，当前1024尺寸准入，legacy库允许4096；tile/free-tile/text/style的通用普通化未迁移，入口明确禁用，不能称通用栅格化完成。背景resize使用原生完整Timeline历史快照，尚非legacy共享表面delta优化等价。新背景窗口采用PixelDialog下拉和预览，未做本轮视觉布局目视验收。

备份/回档只接受当前原生已支持的工程编辑子集，不可准入的备份显示错误。诊断operation-specific覆盖和浏览器/CDP/DOM/RAF归因不等价；原生不引入WebView2。此前切片/旋转截图失败的视觉未验收状态不变。本轮未追加截图或扩测。

正式产物：native/build/Release/moonsprite-native.exe

- 长度：16643072
- UTC：2026-10-20T18:56:01.1250515Z
- SHA256：7744B632EC399F14C9DA6E11C94FD9371E1E7A65DDE49A710BDDE138820BFFEF

唯一启动入口仍为native/start-native.bat。最小检查已完成，停止写入。
