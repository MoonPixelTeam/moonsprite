# 缩时视频导出：MP4 完整操作链路

## 范围与来源

本批处理 FS-008 的 MP4 导出需求，从导出表单、参数到实际可播放文件，包含失败、取消、重试及原作品保护。旧版证据：

- `legacy/src/renderer/src/core/timelapse.ts`：`timelapseOutputGeometry`、`timelapseVideoFramePlan`、`encodeTimelapseVideo`。
- `legacy/src/renderer/src/components/dialogs/TimelapseExportDialog.tsx`：默认 MP4、画质、按时长／倍率、名称／目录、摘要及表单保留。
- `legacy/src/renderer/src/store/document-file-service.ts::exportTimelapseFile`：覆盖确认、读取本地／内嵌帧、取消、成功后记住路径。
- `workspace-commands-history.ts::exportTimelapse`：先等待捕获任务完成；`project-metadata.ts`：帧率／倍率归一化。
- `core/timelapse.test.ts`、`store/timelapse-export-flow.test.ts`：帧计划、首尾帧、格式不可用与文件生命周期断言。

## 已实现链路

导出默认选择 MP4，图片序列仍可选择 PNG／JPG；切换格式更新文件后缀。视频包含轻量／标准／高清及对应整数倍率和输出尺寸，按选择时长／倍率导出，时长支持小数，保留另一模式的草稿。摘要随参数更新，采用既有固定帧率采样；短片单帧选择最后一张，其他情况覆盖首尾。导出参数不写回作品录像设置。

提交先等待尚未完成的捕获，再刷新录像清单、规划实际目标和覆盖确认，然后在后台读取本地／内嵌 PNG、编码、显示进度。已有内嵌 PNG 不因迁移本机库失败而无法导出。选择路径取消、覆盖取消和编码失败保留表单；可修正路径重新提交。

同一来源帧被重复采样时只解码／转换一次。按旧版第一张最大长边的帧确定参考几何，整数倍放大、偶数补边，各帧等比居中、最近邻采样。H.264 无透明通道，透明像素合成至黑色；不把预览棋盘格录入。

视频在目标目录独占创建临时 MP4，编码完成、封装并刷盘后才替换目标。取消或读取／编码／写入失败均保留已有目标，不记录成功路径；只清理本次创建的临时文件。完整成功才沿用已有导出目录／最近导出记录，不新增绘画历史。

## 必要原生适配与剩余缺口

旧版使用浏览器 MediaRecorder／captureStream。新版使用 Windows 系统 Media Foundation H.264 编码器，不增加 WebView 或外部可执行文件。帧时间戳承接原计划，离线编码无需按播放时长休眠。采用 BT.601 有限范围 NV12、YUV420；MP4 为有损格式，不承诺与浏览器编码字节或解码像素完全一致。系统缺少编码器、尺寸／规格不支持时显示失败并保留原文件。

本批 MP4 完成时 WebM 尚未迁移；后续接入结果见 [WebM 完整导出链路](timelapse-webm-export-20261103.md)。不能把 MP4 这批记录称为整个 FS-008 验收完成。实际编码器的不可中断系统调用期间，取消在其返回后生效。未开展人工截图、长时间连续使用、所有 Windows 编码器和第三方播放器矩阵验收。

## 验证

新增 `timelapse-video-tests`：沿用旧版 100 帧、12fps、1／2 秒采样断言；核对整数倍率、奇数补边、异尺寸居中与透明处理；实际生成中文路径 MP4 并由独立 Source Reader 解码，核对尺寸、首尾上下颜色、帧数和时间戳。验证重复帧读取缓存、两种时长模式、开始前／中途取消、缺帧、不可写目录、旧文件保护、成功替换与临时文件回收。

正式 `--timeline-gif-drop-check` 增加实际导出表单：默认格式、WebM 灰置、画质、两种模式草稿、不可写目标失败后修改路径重试，实际输出 MP4，检查作品像素、历史、dirty、录像原画质／倍率保持。原 PNG/JPG、捕获末帧等相关检查继续运行。

本批结果：唯一正式 Release 构建、timelapse-video-tests、timelapse-tests、正式程序 --timeline-gif-drop-check、558 文件来源覆盖和 git diff --check 通过。检查了本次应用窗口的一张失败状态截图以定位焦点问题；未进行人工操作或完整视觉矩阵验收。另修正导出期间禁用输入控件导致的焦点丢失，进度期间焦点交给取消按钮，失败后交回导出按钮。摘要计算不复制录像 PNG 或分配完整视频帧计划，避免长录像刷新造成额外负担。
