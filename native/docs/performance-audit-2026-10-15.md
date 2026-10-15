# 当前性能审计与修复记录

2026-10-15；分支 `dev`。审计覆盖当前原生渲染、时间轴内容标记、保存、恢复与精灵表预览，以及 legacy 性能架构对应机制。保留用户原有未跟踪工程/GIF、日志与资料，没有创建外部工程/工作树、preview 程序或修改版本。全功能后续承接见 [性能框架](performance-framework.md)。

## 本轮确认和修复

| 热点 | 原因与触发 | 修复与可验证边界 |
| --- | --- | --- |
| 大画布完整同步阻塞 | CanvasRenderer 对每个像素解析 `displayPixels()`、创建 Paint、调用 1×1 drawRect；每次切帧会完整上传 | 一次解析源，Skia `writePixels` 批量 straight RGBA 转原生 premul；保留非兼容表面 fallback；沿用脏区累积 |
| 时间轴反复扫描透明 Cel | UI cache 使用全局 contentRevision；切帧会清除全部内容标记 | 缓存移到 Timeline resolved owner，像素写入只失效对应 owner，结构重建清除；实时借用像素期间不缓存 |
| 局部合成随总帧数增长 | 合成每次扫描所有帧的 cels 做当前帧校验 | 已有 layer/frame 索引查询当前帧 slots；仍校验不可见层的 cel，保留拒绝不支持语义 |
| 手动保存冻结 UI | 压缩、归档 admission、flush、磁盘验证和恢复 worker.get 均在 UI 线程 | `DocumentSnapshot` 分块脱离像素/笔刷，后台校验写盘；UI 匹配身份/版本后接受保存点；原动作 continuation 和失败保留内容有测试 |
| 自动恢复吞吐过低 | 每 16ms 固定复制 64KiB，理论上约 4MiB/s；开始时 reserve 全部表面，末尾在 UI 构造/校验文档及复制项目笔刷 | 复用快照模块，每 tick ≤1MiB 且检查 2ms 截止，逐表面分配；笔刷载荷纳入预算；worker 构造/校验；仍保留失效/失败资格 |
| 保存重复解码与临时内存 | 完整解码生成归档，写后重新读取完整归档并再次解码相同字节 | admission 一次；写后以 64KiB 块逐字节比较已校验的归档，再原子替换。精确验证保留，去掉第二份完整读取和解码 |
| 精灵表预览每次重画所有像素 | paint 遍历全部 sheet 像素，即使大部分被视口裁剪 | setImage 上传一次，paint 单次 nearest/source-over blit；清除预览释放表面。生成 sheet 本身的同步重建仍属于后续任务接入 |

恢复清理失败保留 owned id 和用户恢复数据，显示明确错误；没有加入盲目重试。新的 document identity 和临时文件序号使用原子计数，支持脱离快照的后台构造和写盘。

文件锁失败回归还发现 native 恢复删除顺序偏离 legacy：先删除 sidecar 再删除 payload，payload 被锁住时会留下无法被目录识别的恢复数据。已按 `platform_recovery.rs::delete_recovery` 恢复 payload-before-sidecar 顺序，并保留 native 的可观察错误；锁住的 payload 与发现 metadata 一起保留。每次性能 UI 检查使用 build/test-tmp 下独立 PID/时钟目录，保留较早失败的验收资料。

## 同机离屏基准

真实 `CanvasRenderer::sync`，Release；每个场景预热一次，随后六次冷表面同步，包含表面分配。RGBA/alpha 具有变化，不用单色掩盖成本。以下是首轮改动前后均值，原始输出在 `build/test-tmp/performance-before.txt` / `performance-after.txt`。这些数字仅代表 CPU 离屏缓存同步，不含硬件输入、Windows 队列、最终显示或长时退化，六个样本不能构成发布级 P95 基线。

| 画布/图层/帧 | 修复前均值 ms | 首轮修复后均值 ms |
| --- | ---: | ---: |
| 32×32 / 1 / 1 | 0.516 | 0.0014 |
| 256×256 / 1 / 1 | 32.370 | 0.0196 |
| 512×512 / 1 / 1 | 127.250 | 0.282 |
| 1024×1024 / 1 / 1 | 609.472 | 1.149 |
| 256×256 / 1 / 100 | 36.973 | 0.0195 |
| 512×512 / 4 / 2 | 114.520 | 11.950 |

正式程序最终复核后重新运行同一基准，1024×1024 单层完整同步均值 1.509ms、256×256/100 帧 0.0168ms、512×512/4 层 11.703ms；原始输出为 `build/test-tmp/performance-final.txt`。最终 `performance-ui`、`canvas-performance`、`document-snapshot`、`timeline-model` 四项全部通过，包含本轮新增的文件锁、metadata 失效和关联 owner 检查。较早八项定向检查也通过；完整 51 项回归结果单独保留如下。

多层合成仍有实际 CPU 成本：上传加速不能把 4 层合成变成单层直接读取。帧/区域缓存、不可变共享源及样式依赖是 [下一阶段](performance-framework.md#剩余接入顺序与验收) 的明确内容。

## 行为与运行检查

- `canvas-performance`：旧逐像素 Src 上传与新路径在三种背景的 raw bitmap 精确对照，覆盖 alpha 0–255；多修订局部上传两像素、取消与静态缓存重复同步检查。
- `raster-snapshot` / `document-snapshot`：字节/时间预算、独立像素、完整偏移/链接元数据、项目笔刷 coverage/colors/paintColors、历史隔离、活动/过期目标拒绝及 worker 构造。
- `performance-ui`：真实 Editor 保存入口后台运行，RGBA 保存重开、写入失败保留路径/dirty、控件恢复、保存后 New、恢复写入和 owned 清理。合成消息检查，不等于硬件鼠标端到端测试。
- 正式程序更新在唯一 `build/Release/moonsprite-native.exe`；构建与运行检查顺序执行。首次过早启动旧 UI 检查导致产物被占用、链接失败；旧检查结束后正式链接成功，并重新验证新入口。

完整 CTest 扩展回归首次结果：51 项，47 通过，4 失败。`project-import` 的 “Import should reject” 已在此前 [窗口优化记录](resize-rendering-optimization.md) 登记；`project-save` 的 “Grouped duration” 以 Git HEAD 原 Document 实现编译成测试基准后同样复现，性能修改未触及该时长选择逻辑。`layer-context-menu` 在 kind1 得到 23 叶项/3 enabled，断言要求 4；kind1 路径不调用本轮 cel 内容缓存。`menu-catalog` 未改源码/测试，断言失败以 0xC0000409 退出。后两项不能仅因本轮无相应逻辑修改就宣布已完成独立基线运行验收；保留为功能回归阻塞，不将整套报告为通过。

来源覆盖检查通过，`--strict` 在已知 legacy 迁移缺口下仍应失败。Windows 实际交互、2h/8h 内存与输入延迟未执行。本轮交付是已验证的热点修复和全功能性能承接规划，不是所有功能迁移、所有规模、长期流畅性或整套功能回归已通过的声明。
