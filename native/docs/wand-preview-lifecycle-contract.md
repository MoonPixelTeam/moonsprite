# 魔棒异步预览生命周期契约

状态：C04／C09 本批控制器已提取并接线，独立受控执行器测试通过；正式应用 `084392e2...` 构建成功；47/47 GUI 与适用平铺 geometry 通过，输入、源码证明和程序身份一致。最初契约在图层历史 10.35 冻结期间整理，后续实施记录见耦合审计 10.36，不能据独立服务测试宣布整体验收完成。

## 已核对的实际来源

Legacy `src/renderer/src/core/magic-wand-gesture.ts` 的 MagicWandGesture 与同名测试定义：request 增加 sequence 并使 ready 失效；只有最新 sequence 的回复可 preview；release 先记录松开，已有结果时 finish，否则等最新回复；finish 先标记 ended 再单次 commit；cancel 后所有旧回复只 discard。三个原测试的输入／预期应原样移植，不用 sleep 模拟时序。选区算法仍复用现有 native magicWandSelection 和 FreeTileSelectionRaster，不因提取控制器改成新洪泛算法。

现有 native 路径：`editor_input.cpp` 建立不可变像素源与 document/contentRevision/layer/frame 上下文，鼠标松开与 Enter 设置 released；`editor_canvas.cpp::requestWand` 去重同一点、合并等待点；wandTick 在 UI 线程核对上下文、非阻塞取结果、捕获下一任务；endSelectionGesture 统一提交或取消选区；`editor_session.cpp::settleProjectGesture` 作废等待请求。既有真实 selection 与 view-rotation 检查已经覆盖最近点、Escape、换文档和重复平铺。

## 迁移时必须保留的边界

| 条件 | 现有行为及控制器约束 |
| --- | --- |
| 松开先于完成 | 立即释放鼠标捕获，等待最后请求；完成后仅一次选区提交，不生成中间内容历史 |
| A 执行期间移动到 B、C | 只允许一个 worker；合并待执行点到 C；A 的成功结果不能覆盖 C 的请求；不能并发执行全部采样 |
| 同一点重复请求 | 不重复捕获资源，不重复启动 worker；与状态机 sequence 配合时保留原去重 |
| Escape 或取消 | 增代次／结束手势、清空待执行请求、恢复 selectionBefore；迟到结果不能恢复选区或持有 UI |
| 文档身份变化 | 旧结果不得发布到新 Document，不恢复旧作品；沿用当前 selectionDragging 与 capture 收尾 |
| 内容、层、帧变化 | 在取结果前核对完整上下文，取消当前手势；不能用单一 revision 替代已有维度 |
| 结果为空 | 空选区是合法结果，与未完成／失败分开；仍按原组合模式执行 |
| worker 失败 | 当前有效手势取消并显示原错误；旧代次失败不污染当前手势；即便存在待执行采样，不能擅自把当前代次失败静默丢弃 |
| 自由瓦片 | 沿用 UI 线程捕获 FreeTileSelectionRaster、worker 只读运行和原 symmetrySelection；普通栅格仍走既有算法 |
| worker 销毁 | 捕获快照、参数与值，不引用 Editor／控件／可变 Document；不在 UI 析构等待长任务 |

## 计划结构及验证

优先直接移植 Legacy 手势状态机；在独立控制器中归集代次、运行 future、合并请求和结果接纳。UI 继续负责指针捕获、工具状态、Document 的现有提交／取消与状态文字。控制器使用受控执行器，以明确完成顺序验证结果和失败；保留现有单 worker 和捕获时机。不要直接套用通用 latest-only 队列吞掉当前代次失败，也不要为复用而改变松开／Enter 的提交意图。

独立测试必须沿用上述三组 Legacy 预期，并增加原生同点去重、单 worker 合并、空结果、运行／捕获失败、取消后新手势以及旧代次异常隔离。生产接线后再运行真实 selection、view-rotation、脚本、会话切换及适用平铺；独立测试与 GUI／图像验收分别报告。新增源／测试须登记精确 Legacy 来源并运行来源及架构门禁。本文不提前承诺完整控制器或 C04／C09 已完成。
