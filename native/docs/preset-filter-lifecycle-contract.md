# 预设滤镜与 LCD 的任务生命周期

本批针对 C04／C09，已完成本批正式程序验收；整体目标仍未完成。基于 `legacy/src/renderer/src/store/workspace-filter-preview.ts` 及其三项测试，原生适配沿用 `Document` 的快照算法及现有弹窗协议。

## 所有权与顺序

`PresetFilterPreviewController` 位于既有 `filter_preview_controllers.h`，拥有绑定身份、单个 future、取消 token、最新等待选项、代次、应用意图及发布／完成标记。worker 只持有脱离 Document 的 `FilterPreviewTask`，没有 Editor、控件、Document 引用或 UI 回调。默认仍用 `std::async(std::launch::async, ...)`；测试通过注入 future 启动器控制完成时刻。

预览或应用先取消原 token、递增代次、替换等待选项并恢复基线；空闲时立即捕获并派发，已有任务时仅保留最后一个等待请求。poll 只接纳绑定身份和当前代次；旧结果即使成功也不发布，然后启动最新等待请求。Apply 保留原预设弹窗协议，没有引入其他滤镜控制器的 Apply 屏障。关闭先标记 finished，取消 token、清空等待、取回运行结果，再取消所属身份的预览。默认 future 的析构仍等待运行任务；不新增后台文档访问。

## 保持与适配

- `PresetFilterOptions` 原体从 UI 头移动到既有 `filter_presets.h`，默认值不变。
- `Document::capture/run/publish/commitFilterPreviewTask` 及其尺寸、身份、revision、代次和 LCD 源检查均未修改。
- 弹窗本体只有选项声明迁出；10ms轮询、40ms防抖、控件状态、文案、尺寸、位置、取消／失败／重试入口保留。
- Editor 的 refresh 在请求／poll 返回后执行，替代原生命周期内部的 refresh；脱离文档的 worker 可稍早开始，但只有 UI poll 能发布。refresh 不再充当 controller 的回调依赖。
- 现有原生 LCD 使用 displayTimeline 快照预览，不直接照抄浏览器对可变文档对象的临时层修改。原有 native IO/预览集成维持原状；不能据此声称 Legacy 的 IO suspend/resume 全面验收。

## 验证范围

新增无 UI 的真实 Document 检查：Vignette .3 → CRT 预览不叠层、不写 dirty/历史；CRT .4 单步应用及 undo/redo；快速替换到 Phosphor；预览关闭后的迟到结果；运行预览上排队应用；派发和 future 异常后的重试；其他身份不接纳；销毁后无发布；LCD 2×1预览、切换恢复源可见性、应用与 undo/redo。

源码证明 `build/test-tmp/coupling-preset-source-proof.json` 核对选项原体迁移、弹窗其他部分、既有三个控制器、Editor 其他方法及既有测试主体未变。它不替代运行验收。本批构建和GUI结果见下节；C04、C09及整体目标继续开放。

## 本批正式验收

正式应用、公共头及三个服务目标构建退出0。同版13/13项GUI和7/7项服务／边界检查通过，无超时或新错误；GUI含真实预设及LCD取消／应用／撤销重做、其他三滤镜、图层颜色、多文档、历史面板、脚本、两类保存、快捷键、预览面板及图层上下文。905项冻结输入和源码证明哈希不变；来源907项覆盖通过，strict退出1保留原迁移缺口，差异检查退出0。程序SHA-256 `bd61902189dbd15a3a0f0ba310ac7975994b8aa0177aa05d3001e92024deb799`，最终证据 `build/test-tmp/coupling-preset-final-consistency.json`。没有新增人工图像验收或性能基准。

## 所属文档与结束清理补齐（待最终统一验证）

预设控制器在观察到其他文档时立即取消token、推进代次并丢弃等待请求；返回原标签不会复活运行结果、等待Apply或过期worker异常，之后显式新请求仍可执行。已结束的控制器拒绝新请求。当前请求的异常仍向调用方报告。

弹窗捕获原Document的weak引用，关闭清理解析原owner，不再使用当前活动文档。end即使在收取worker时抛错也先完成原文档预览清理，再传播原错误；owner已销毁则只结束任务，不延长文档生命周期。worker依然只操作脱离文档的快照。依据legacy workspace-filter-preview.ts捕获session、generation、transaction.active和cancel/restore；原滤镜、LCD算法和UI布局不变。

新增受控运行/等待Apply的A→B→A、过期异常后重新Apply、结束时worker异常及结束后拒绝请求检查。尚未编译/运行这些新增检查；不增加已验收项目数，统一最终构建后执行。

## 合并实施：三个内嵌滤镜的有类型模态会话（待最终统一验证）

抗锯齿、卷积和栅格渐变映射由`ColorPreviewSession<Controller>`直接拥有具体控制器载荷、原文档weak引用、文档身份和预览事务编号。Pending仅路由界面；取消、关闭、切换及析构通过同一end清理原事务，重复end不会清理后来开启的事务。Document的AdjustmentPreview为每个新预览分配稳定编号；复制保留所属快照编号，普通参数变化/渲染不更换编号。卷积显式Apply重新建立基线时，由本次所属poll接纳新编号。同一文档的外部预览替换将关闭旧会话并保留新预览。

Editor参数/布局访问仅限定到session.controller；原Document算法、18阶段调度顺序、界面控件与CLI入口保持。AA/卷积取消去掉对当前活动Document的重复cancel；渐变映射仅将栅格路径绑定，图层调整及其他颜色调整保留原流程。服务检查增加三个原owner清理、A→B→A、同文档事务替换、弱生命周期、析构、重复结束与卷积单步Apply后的新基线清理；尚未构建/运行，等待最终统一验收，不关闭C04/C09。


本节新增实现已随统一Release验收：对应Document/滤镜/历史服务检查、34项GUI及geometry通过；证据见 `build/test-tmp/coupling-consolidated-*`。此前“待验收/尚未运行”描述为实施时状态。验证仅覆盖所列场景，明确列出的未完成结构和迁移缺口继续保留。
