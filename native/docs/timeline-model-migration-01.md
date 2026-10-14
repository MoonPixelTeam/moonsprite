# 文档基础 D1.1：图层／帧／Cel 结构模型

本批是 `moon::timeline::Timeline` 的可执行 RGBA 结构与像素操作，不是图层面板、动画时间轴或工程读写完成。当前 `Document` 的 UI 和历史接入由集成批次负责；两套类型尚需适配，不能据此宣称原生编辑器已支持多层多帧。

## 来源与数据契约

- `shared/types-layer.ts`：图层稳定 ID、名称、可见性、锁定与不透明度。
- `shared/types-animation.ts`：帧稳定 ID、毫秒时长、禁用播放状态；Cel 独立 ID、layerId、frameId、linkedCelId、可选不透明度、叠放偏移；Surface 的局部尺寸、画布偏移、可选存储原点。无 Surface 的 Cel 与不存在的单元格分别保留。
- `core/animation.ts:createAnimationCelLookup`：以 slot 与 ID 索引查找、按同层链接解析内容根、缓存有效解析结果；缺失、跨层或循环链接返回最初请求的 Cel。原生返回相同 fallback，同时附带 `LinkIssue` 和 offendingId，使异常数据可观察；不擅自清除链接或丢弃 fallback 像素。
- `core/animation-timeline-identity.ts`：ID 可包含冒号／竖线，内部不能直接拼接 owner:frame。原生以结构化 string pair 作哈希键，完整保留输入身份；本批仅普通 Cel，不假装迁移 mask／group 类型身份。
- `core/history.ts` 的 layerId/frameId 像素归属要求：`setPixel` 返回真正 sourceCelId、局部 index、before/after 和链接诊断，供 Document 事务构建准确历史，不用当时活动图层／帧推断历史目标。

## 所有权和性能

每个源 Cel 的可选 Surface 独占 `vector<Pixel>`。正常 linked Cel 解析到同一个源 Surface；修改别名会修改真实源，因此所有别名看见同样内容。别名输入携带的旧 Surface 保留作异常链 fallback，不通过复制像素假装联动。

`Timeline` 按值复制时每个 Surface 深拷贝，副本内部仍通过原 ID 解析自身的源；两个 Timeline 之间不隐式共享可写像素。复制原生模型不等同于用户“复制帧”命令，后者尚未迁移。

Slot 与 ID 索引只在构造／添加结构时更新。正常重复解析使用 source index 缓存，不每笔重建全时间轴索引；缓存不保存易失裸指针。返回的借用 Cel/Surface 指针仅在下一次结构修改之前有效，调用方不得跨 `addCel` 保留地址。添加新 Cel 会清空解析缓存，使之前悬空的链接能够正确解析。像素更改不重建结构索引。

Document 是唯一 friend，私有 `mutableOwnedSurface(ownerCelId)` 为事务提供已解析源的可写 Surface。Document 在笔画开始解析一次真实 owner，缓存该指针进行增量 recordPixel，避免每像素重新解析和构造 ID 字符串；UI／扩展不可访问该入口。指针持有期间不得变更 Timeline 结构，提交／取消后必须清除。

## 操作边界

`addLayer/addFrame/addCel` 是领域结构装配原语，验证空 ID、重复 ID／slot、未知 owner、时长、有限不透明度和 Surface 像素数；不是 legacy 用户“新建帧”命令，不自动创建空白 Cels、改活动选择或生成 ID。

`setPixel` 不承担选择工具、图层锁定、预览、dirty、revision、失效通知、资源同步或撤销提交；这些仍由 Document／领域事务执行。未知 Cel、未实体化 Surface 和越界 index 会抛可展示的标准异常；非法链接则按 legacy 操作自身 fallback，并在结果中带诊断。

本批不提供用户新建／删除／排序／链接切换命令，不展开索引色、mask/group、普通 linkedContentId、文字、瓦片、复杂共享资源。这些缺口必须保留在计划表和来源台账中。

## 验收证据

`tests/timeline_model_test.cpp` 对照 `animation-single-cel-sync.test.ts` 的链接写入、缺失／循环／跨层 fallback，以及 `animation-timeline-identity.test.ts` 的任意分隔符 ID：

- 2 层 × 2 帧独立像素；按真实 owner 回写 before/after，不污染当前其它格。
- linked Cel 与 source 指向同一 Surface，回滚通过别名可见；100 次重复解析稳定。
- 深复制后副本内部仍链接，跨副本修改隔离。
- 三类无效链接均保留原 Cel 内容并返回诊断；循环缓存不让一个起点拿到另一起点的 fallback。
- 添加缺失源后负缓存失效；空 slot 不被查找实体化；稀疏 Cel 保持无 Surface。
- 结构和像素输入错误显式拒绝，失败后不增加结构数。

这只是模型定向验证，不代替 Document 真实撤销、原生 UI 或性能长测。
