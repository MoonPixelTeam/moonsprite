# 新建帧与链接帧选择历史迁移

## 旧版依据

直接核对 `legacy/src/renderer/src/store/workspace-commands-animation-frame.ts` 的 addAnimationFrame、duplicateAnimationFrame、addLinkedAnimationFrame，以及 `workspace-animation-selection.ts::clearAnimationItemSelection`、`workspace-animation-linked-cel.ts::linkCelsInRightFrame` 和 `workspace-animation-selection-history.ts`。

空白、复制和新建链接帧首次成功时停止播放，清除像素选区／轴点、帧／Cel／组格／蒙版格／蒙版行及锚点，退出蒙版编辑和隔离；保留图层与组行选择。对应历史仅恢复帧内容与活动帧：撤销不恢复旧选择，重做清除当前时间轴项目，但不恢复旧行选择或像素选区。普通新建帧的历史不应覆盖用户后来选中的存活帧项目。

已有右侧帧时的链接是独立分支：不增加帧，并明确捕获和恢复完整时间轴选择。撤销必须恢复之前的帧／Cel／组格／蒙版格、锚点与蒙版隔离，重做恢复执行后的状态。帧拖动及复制历史原有的完整选择快照保留。

## 原生适配

修复通用 captureFrameOrder 自动附加的完整快照覆盖了 addFrame 原先清理结果的问题。仅新建帧排除完整快照和行选择／帧选择快照，增加 FrameHistory 的重做清理标记；蒙版编辑上下文在两个方向都退出。共用 clearAnimationItemSelection 清理 Document 与通过弱引用绑定的原 session 值，不触碰其它工程或图层／组行选择。

新建链接帧复用同一帧事务；已有右侧帧分支补齐旧版明确要求的完整选择快照。播放和轴点继续由既有 Editor 入口处理。本阶段没有性能优化、布局重设计或替换图标。

## 验证记录

原生 `document-animation-binding` 通过（0.03 秒），新增三种新建方式×五种选择模式、四种已有右侧链接模式；覆盖首次清理、Undo/Redo、当前选择保留、原资源／链接、蒙版隔离与后台 session 归属。`timeline-interaction` 通过（0.02 秒），保留帧／Cel 拖动和复制恢复选择断言。

旧版实际 `workspace-animation-drag-copy.test.ts` 和 `workspace-animation-loop-sections.test.ts` 共20项通过（8.32秒），未修改 legacy 源码或预期。

综合 `document-transactions` 原先第76行的新建帧选择失败已消除；继续运行在第84行的新建图层撤销活动图层／选择断言失败。该断言和代码保留，尚未完成其旧版语义核对，不宣称综合事务套件通过。

唯一正式 Release 构建成功。使用 `MOONSPRITE_TILE_REPEAT_CHECK_PHASE=frame-creation` 运行正式程序 `--tile-repeat-check`，等待实际进程退出码为0，trace包含全部20组。真实快捷键命令入口覆盖空白、复制、新建链接和已有右侧链接×五种选择模式，检查首次清理、图层／组行保留、Undo/Redo、蒙版隔离和 session 值投影；没有绕过生产门禁。来源覆盖934文件及快照、Editor边界589源码、diff检查通过；`--strict`仍因已登记缺口退出1。

无新人工图像或完整桌面验收；其它已登记迁移缺口保留，整体迁移仍未完成。本阶段提交并推送dev，不提交生成物、日志或用户数据。
