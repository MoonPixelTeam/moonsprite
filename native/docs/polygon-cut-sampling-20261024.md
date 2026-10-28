# 2026-10-24 填充多边形、瓦片剪切、渐变采色

本批唯一写入者 integrator；两位只读 Agent 提供 Cut 与采色精确脚本，均保存在 native/build 后顺序合入。开发与正式产物仍仅在 native，未创建分支、工作树、preview、提交或发布。

填充多边形依据 legacy tools-shapes.ts、selection.ts、canvas-input-path.ts、canvas-input-shape.ts、canvas-polygon-interaction.test.ts、useCanvasShapeCommit.ts 与 canvas-render-shape-preview.ts。复用原 polygonSelection/lasso 栅格化及已有 shape 事务。点击添加顶点，连续重复点不追加；右键撤回最后顶点（包括初始点），配置的 Undo/Redo 只作用于当前顶点序列，追加后清 redo。鼠标松开保留待确认状态；Enter 或至少三点时左键双击提交，单击首点不会结束。最终填充只使用已点击顶点，不包含浮动指针。左/右启动分别捕获前景/背景色，悬停只预览闭合轮廓，缓存已确认边；Esc/失焦/上下文失效取消。笔刷大小、透明度、墨水、圆角和比例不影响旧版 polygon 填充。复用选择裁剪、对称去重、蒙版规范化、稀疏表面与瓦片权威事务，原有 Paint 门禁保留。原始 shape-polygon 图标和空默认快捷键沿用。未扩展曲线、自由形状或其他未迁移能力。

瓦片像素 Cut 依据 workspace-commands-clipboard.ts、workspace-commands-selection-effects.ts、workspace-commands-history.ts、tools-fill.ts 与 workspace-floating-clipboard.test.ts，先 Copy 后复用已迁移 Delete。单活动 canonical Create/Edit/Hybrid 可用，保留半透明及不规则 mask。锁定时仍复制并清选区，不改像素、不加历史；全透明时清剪贴板与选区，不加历史。有效删除一次历史同时恢复权威 tile/source/ref 与选区。Paint、非 canonical offset、显式整帧、多目标、组、free tile、蒙版继续明确标记未迁移，不解释为旧版限制。普通 RGBA 粘贴承接剪切内容。

渐变色标的颜色编辑器画布采样复用 ColorValueControl/useCanvasColorSampling 对应语义和现有原生采样算法。共享目标指针与文档 identity 将 RGBA 写到选中色标；保留角色颜色和未确认渐变。仅嵌套采样期间安装鼠标/键盘/焦点过滤器，排除父子弹窗范围并使用原生捕获接收松开。松开、Esc、父关闭及析构移除过滤器、捕获、采样目标并恢复工具。Esc 结束采样但保留颜色编辑器。原生窗口路由是 DOM 事件适配。

构建和实际运行结果另记，来源覆盖通过不代表行为完全等价，strict 仍必须报告 INCOMPLETE。本批定向 diff 通过；全库另有本批未触及的 project_import.cpp、selection_tools.h、timeline_model.h 空白差异，未越界修改。

核心首次构建 session37215 exit0。moon-core、tilemap-document、tilemap-project 各自输出 PASS，attached-masks 输出 PASS。document-raster-history 实际首次退出 0xC00000FD：既有 main 复用 shape loop，Polygon 仅增加循环模式，没有新增 Document 局部对象；ShapeSpec 扩展后越过默认 1MiB 栈。仅该测试目标按已有 moon-core-tests 设置 2MiB，应用栈未修改；后续结果须实际复验，不能由 PowerShell 最后一条命令成功推断。

核心定点修复：legacy paintLayerValue alpha=0返回原packed色，Simple形状预览保留透明RGB；没有修改笔刷合成。核心增量12796 exit0，之后五个exe单独记录均exit0（含2MiB后的raster-history），记录见build/polygon-cut-sampling-core-results.json。

正式初编64857与增量56928均exit0。首轮UI34776因fixture错误使用Ctrl+Y失败，改为配置默认Ctrl+Shift+Z；UI42284 exit0。随后发现pendingBefore取值过晚，追加打开前对比断言后UI37456实际exit1，证实前台父子弹窗焦点转移会提前取消待确认渐变。CS3仅保护所拥有渐变父子窗口及Editor之间的焦点转移；其他失焦仍取消，并在打开前、子窗打开后、采样后、父子全部关闭后对比pending/gradientActive。最终结果待本轮实际运行追加，不能引用之前漏验的exit0作为保留事务证据。

最终正式构建83483 exit0，唯一产物SHA256 `67e765ab8d8d4df5454829db7d53878ac41e130fa66fd66eff54303bf52a4cec`。UI37744 `--workspace-check --named-workspace-only --polygon-cut-sampling-only` 实际exit0；包含多边形真实输入、Cut真实菜单/Ctrl+X/Paste取消、普通与待确认渐变采色。待确认状态在打开前、子窗打开后、采样松开/Esc、父子关闭、dispatch排队焦点消息之后均保留，并验证gradientActive；之前失败error文件保留为历史证据，不以旧文件存在判断最终失败。

最终来源483文件覆盖exit0，strict exit1/INCOMPLETE，本批定向diff exit0。五个核心程序逐一实际exit0，结果JSON留存。原BAT重开PID30340，路径确认native/build/Release/MOONSPRITE-NATIVE.EXE，Responding=True。没有截图/DPI全矩阵或未迁移功能等价声明；本批最小相关验收完成后停止。最终证据：native/build/polygon-cut-sampling-final-20261024.json。
