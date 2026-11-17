# 多文档分栏与浮动文档迁移

状态：本阶段功能迁移完成；唯一正式 Release 构建及最终多文档专项退出 0。整体迁移仍未完成。

来源：`legacy/src/renderer/src/core/document-pane-layout.ts`、`components/app/useAppDocumentPanes.ts`、`EditorCanvasHost.tsx`、`DocumentTabs.tsx`、`document-tab-close-range.ts`、`document-pane-resize.ts`、`document-pane-hit-test.ts`、`FloatingDocumentWindow.tsx`、`store/workspace-commands-document-io.ts`。

已接入独立文档视图及绘制、标签拖入分栏、副窗格标题停靠及返回标签栏、分隔条预览及取消、点击激活、中键平移、跨窗格原始 alpha 取色、参考图缓存隔离、每窗格快捷栏和滚动条、浮动文档移动及缩放、置顶、返回标签栏、标题按钮松手确认、标签关闭范围、按源文件重新打开的重复视图、打开所在文件夹。

既有验证结果：布局核心 394 组实际 legacy 对照及 legacy 7 项测试通过；正式 Release 构建和 `--multi-document-check --document-panes-only` 退出 0，覆盖绘制隔离、取色、中键平移、滚动条归属、分隔条提交及取消、浮窗归属及原生绘制表面、置顶、移动、缩放、返回标签栏预览及取消、重复视图独立身份与保存重开。浮窗截图已核对完整外框及标题按钮。后续正式构建及同一专项也已通过独立拖动浮层的显示、顶层顺序与释放清理、非活动快捷栏激活及展开、重复视图保存回原路径并保留源会话未保存画面。

已补入副窗格及标签拖动影像、独立拖动浮层、非活动窗格快捷栏点击集成检查。快捷栏回调在激活文档前复制请求配置，避免同步刷新丢失展开状态。浮窗返回标签栏预览在进入首页、模态操作或高级模式时清理，缩放不显示返回标签预览。

剩余验收／迁移：浮窗视口变化位置裁切、尺寸保留及遮挡输入已通过正式专项。已补齐非活动窗格滚动条按下／滚轮激活，并把首事件转交到活动滚动条以保留捕获；最终正式专项通过实际按下、释放及中键不激活检查。批量关闭实际菜单检查已通过：可见标签顺序、取消后停止、重新执行并依次丢弃。批量关闭的等待判断已绑定目标文档的保存、排队保存及延迟关闭任务，不依赖当前活动文档。不得将源码接入视作整阶段完成。

播放依据：`EditorWorkspaceShell.tsx` 仅为活动 session 挂载 `useAnimationPlaybackClock`，原生保留活动文档推进。参考图 SVG 浏览器完整兼容是另一阶段的未完成项。

正式入口：`native/start-native.bat`。检查：`native/build/Release/moonsprite-native.exe --multi-document-check --document-panes-only`。产物使用唯一正式构建，不创建 preview。

本次收尾只重建唯一正式程序并运行同一多文档专项；沿用已通过的布局 oracle 与旧版测试，不追加全仓回归。补齐中键滚动条不激活文档，以及浮动文档遮挡下禁止底层栏目启动手势。

最终验收：2026-11-17，正式 Release 构建退出 0，`--multi-document-check --document-panes-only` 退出 0；来源覆盖 1042 文件及证据快照通过。输入修正后未新增截图验收；沿用此前浮窗外框截图核对。没有执行全仓回归或性能优化。
