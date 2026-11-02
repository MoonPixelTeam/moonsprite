# 普通文件后台读取与解码

来源：legacy `workspace-commands-document-io.ts` 的 openPath、`document-file-service.ts` 的 openDocumentFile，以及 `open-progress.ts`、`OpenProgressOverlay.tsx`。旧版先异步读取和解码，完成后才加入会话；失败不发布半成品。

本次将原生 openPath 既有 ASE、GIF、静态图片、工程与备份读取／构造移入后台。复用现有图片序列等待组件，仍由界面线程检测已打开路径、发布候选、切换工程、记录最近文件和显示错误；工作线程只持有路径／格式和新候选，不访问 Editor 或当前作品。不改解码算法、默认值、预算或工程格式。

后台等待复用 PixelDialog 和 sheet，事件循环继续处理重绘、窗口操作与定时器。阻止 Escape 提前结束等待后在 future.get 上阻塞；系统关闭请求在读取完成、成功或错误处理后重投给原有保存关闭流程，不强退，不删除恢复数据。

必要原生适配：调用入口仍保持串行批次与前景等待合同。旧版进度关闭按钮允许隐藏遮罩而读取继续；该能力尚未迁移。本次没有增加取消读取、并行打开编辑或百分比进度，不宣称完整进度交互等价。

验收：正式程序 --timeline-gif-drop-check 增加由界面定时器释放真实 GIF 解码任务的检查，验证工作线程与界面线程不同、两个界面 tick 持续运行、Escape 不提前退出、原工程身份／像素／历史／dirty 不变。沿用现有普通文件、备份、PSD／缺失文件失败、图片序列、多文件部分成功、重复路径和另存工程场景。唯一正式 Release 构建与 --timeline-gif-drop-check 均返回0；550文件来源覆盖检查与 git diff --check 通过。未做人工操作、截图外观验收和耗时基准。
