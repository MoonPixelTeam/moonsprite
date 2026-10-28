# 工具栏四方向迁移 H1

来源：AppMenuBar 四方向命令、useAppWorkspaceLayout updateToolRailSide/capture/apply、workspace-layout-preferences验证、EditorToolRail既有工具组与记忆、styles.css四边flyout。
原生共享Layout::rail、物理像素clipping与两轴scrollbar，偏好先原子写入再更新，named v3保存方向，v1/v2保留当前方向。复用全部按钮与素材。
明确未迁移：grip拖动换边状态机。不能声明完整工具栏迁移。
验收沿用 --workspace-check --named-workspace-only，实际结果由本批集成记录填写。

运行发现原浮动preview覆盖top rail。按legacy rail180/flyout240与floating220+，原生补齐打开组时提升rail，Close恢复浮窗顺序；保持浮窗全窗口geometry与真实命中断言。
