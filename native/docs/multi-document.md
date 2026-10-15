# 多工程与工程标签

来源：legacy/src/renderer/src/store/workspace-commands-session.ts 的 addSession、setActive、reorderSessions；workspace-commands-document-io.ts 的 openPath、closeDocument；workspace-close.test.ts 的取消关闭、等待保存契约；components/app/DocumentTabs.tsx 的标签切换、拖动排序与关闭。

新建、打开、恢复各自增加工程标签，不覆盖当前未保存作品。相同文件路径或工程身份返回已有标签。每个工程独立保留文档像素、图层、帧、选区、撤销重做、保存路径、画布缩放位置、时间轴滚动位置、颜色板滚动位置和自动恢复任务。切换通过移动 C++ 文档所有权完成，不编码、解码或复制整份工程。工具选择和栏目停靠属于共享工作区。

点击切换；Ctrl+Tab / Ctrl+Shift+Tab 循环切换；拖动标签排序；中键或关闭图标关闭；标签过多可在标签栏滚轮滚动，激活时自动滚入可见范围。文件选择器支持多选。关闭未保存作品提供保存、丢弃和取消；异步保存成功后才继续关闭，失败保留作品。退出逐一检查所有工程，取消即停止退出。后台工程同样参与分片快照和自动恢复。

原生适配：复用现有 sheet 的 project_tab.active / inactive 与 legacy 图标。文档身份、历史直接随 Document 保留；恢复快照、调度队列和工作线程随会话保留，避免切换时任务落到另一个工程。写入其它已打开工程所占路径会报错，避免覆盖其内容。

边界：本轮接入同窗口的多工程标签。旧版工程分屏、工程浮动窗口和浏览器本地历史服务尚未迁移，不将其视为本轮已完成能力。

验收：multi-document 定向运行检查真实绘图、独立撤销与选区、视图恢复、工程保存与打开去重、鼠标及快捷键切换、关闭与退出取消、后台工程恢复。最终执行结果见本轮交付说明。

2026-10-15 验证：正式 Release 构建通过；multi-document、new-document-dialog 通过。工程保存大套件在既有 Grouped duration 断言失败；本轮新增的像素存储资源回归位于该断言前，另设 project-save-raster-resources 独立运行，避免将大套件失败写成通过。

最终定向结果：project-save-raster-resources、multi-document、new-document-dialog 三项全部通过；provenance 覆盖检查通过（184 文件）。完整 project-save 套件仍在 Grouped duration 原有断言处失败，本轮未更改时长事务实现或该断言。
