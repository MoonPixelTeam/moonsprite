# 编辑器耦合拆分与复审（2026-10-18）

本次针对当前原生版，不改用户功能语义。现有工作区包含其他功能迁移差异；本文只归属本轮拆分、恢复会话、刷新边界、时间轴控件及合成顺序缓存。既有 Aseprite 对照和命中性能记录见 `interaction-performance-2026-10-18.md`。

## 原有问题与落地边界

| 原有问题 | 当前实现 | 约束与验证 |
| --- | --- | --- |
| `main.cpp` 20,493 行混合启动、编辑器、后台任务、控件、综合测试 | 启动文件保留 670 行；Editor 的生命周期、会话、面板、调色板、工具、对话框、时间轴、画布、输入、刷新、烟雾检查各自编译 | 拆文件不代表消除共享状态；同时实施下列所有权调整 |
| 自动恢复通过临时交换活动文档及九组状态，调用依赖全局当前文档的方法 | `RecoverySession` 独立拥有队列、ticket、快照、worker、身份与截止时间；`tick(Document&, ...)` 显式接收所属文档 | 无 UI 依赖；非活动文档恢复不再替换活动文档；测试检查两份落盘 RGBA 及过期快照取消 |
| 刷新隐式修改历史上限和调色板同步设置，并且播放时刷新所有面板 | 设置在创建、激活、首选项确认和同步开关处应用；刷新拆成视图状态、命令、布局、损伤范围 | 播放只请求画布/时间轴/工具/命令；完整布局保持原顺序 |
| 通用 `PixelButton` 拥有 Cel、时间轴选择、显示色和父级绘制标志 | `TimelineButton` 拥有专用视图字段和绘制；共享控件只保留通用 pointerPress/hoverRepaint | 调色板增长、停靠页签继续复用通用指针回调，保持原事件优先级 |
| 类中 include 调色板实现和测试片段，控件模板展开整段背景合成 | 方法明确声明，库实现进入 editor_palette，测试进入 editor_smoke，背景合成进入 editor_panels | editor.h 不包含支持控件实现；支持类型前置声明；实现依赖放在 editor_implementation.h |
| 单线程局部合成顺序缓存对不同时间轴互相驱逐，查询需扫描所有 Cel 元数据 | 每个 Timeline 私有缓存；结构/链接/Z 修改处失效，像素编辑保留 | 最多128帧、向量与键有效载荷256KiB；不缓存不存在帧；独立文档、复制/移动、热缓存后新增/删除/链接/预览/历史回归 |
| 画布子控件重绘依赖父级先同步缓存 | paintCanvas 在绘制前自行同步 | 时间轴独立重绘不提前触碰画布内容缓存 |
| 滚动后边缘控件超出时间轴缓存，独立缓冲重绘留下透明像素 | 缓存复制前单独补齐伸出部分的裁剪背景 | 子控件与父级共用同一组合结果；完整/局部帧缓冲逐像素比较通过 |

## 参考与适配

- 实际检查 legacy `store/workspace-session.ts`、`workspace-types.ts`、`recovery-service.ts` 及其测试：会话身份、独立文档、串行恢复与重复版本跳过。
- `core/document-composite-z-index.ts` 的 WeakMap 按时间轴缓存/帧结果语义保留；原生 Timeline 的状态不对外可写，因此把每次全量元数据校验改为写入边界失效。光栅数据不进排序缓存。
- 输入处理按原顺序分派调色板、时间轴、模态处理器；不改鼠标捕获、取消、快捷键或选择素材的 alpha 命中。
- 本次没有复制新的 Aseprite 应用代码；继续使用已有 MIT UI 底座。既有 Aseprite 应用源码仅作行为参考的许可边界见性能记录和来源登记。

## 后续维护门禁

`python scripts/check-editor-boundaries.py` 检查本地 include 有向图、实现 include、核心/恢复层 UI 依赖、共享控件领域字段、刷新副作用及后台恢复的活动文档交换。另约束 editor.h 不导入支持控件/实现集合；editor_lifecycle.cpp 必须先包含 editor.h，使正式编译检查声明的独立完整性。该检查实际发现并修复了渐变映射、缩略图、快速网格选择、编码结果等隐式 include 依赖，layoutGradientMap 与输出回调也已移出类声明。

`python scripts/check-legacy-provenance.py` 检查来源登记覆盖与证据摘要；`--strict` 在已知迁移缺口下仍应失败。两者均不能证明完整行为等价。

## 复审保留项

Editor 仍是工作区协调器，拥有选择/工具/模态等互相排斥的手势状态，多个 adapter 仍访问同一工作区。editor_implementation.h 仍是较宽的实现依赖集合；测试仍通过 Editor 入口执行。此次没有把这些事实改称“零耦合”。新功能应优先进入独立核心/会话/控件模块，不能继续在启动文件或通用按钮累积领域行为。

尚未进行 2 小时/8 小时真实用户工程耐久测试，不能由自动回归推断全部操作已无延迟。文档、自动回归、桌面实际体验验收分别记录。

## 验证结果

- 正式 Release 全量串行构建通过；随后修改的应用目标重新串行编译/链接通过。产物固定 `build/Release/moonsprite-native.exe`，没有另建 preview、分支、工作树或提交生成物。
- 经唯一 `start-native.bat` 启动正式产物，进程40992响应正常；这仅验证启动与响应，不替代真实操作的桌面体验验收。
- 最后一轮 `ctest --test-dir build -C Release --output-on-failure -j1`：**127 项，115 通过，12 失败，74.03 秒**。原始输出 `build/test-tmp/coupling-final-ctest.log`，下面完整保留失败项。
- 笔刷预览、修饰键笔刷、滚轮、快速绘制/画布拖动、命中、大时间轴性能检查均通过；多文档、新建对话框、首页、停靠、窗口输入、Cel 属性、独立恢复等检查通过。额外正式程序 `--playback-floating-check` 退出0，包含播放不增加 full workspace refresh 的断言。
- 256图层/1000帧/256000 Cel：20次滚动仅20次时间轴组合，整块 chrome 绘制入口0次，滚动合成输入和绘制平均3.20ms；边缘伸出区域仍按裁剪绘制面板背景，不能将入口计数解释为完全没有背景绘制。
- 同一程序 A/B 回放：铅笔 Ctrl+滚轮 full/local 5.77/0.32ms，Ctrl+Alt移动5.98/0.72ms；橡皮对应4.04/0.29ms和3.96/0.57ms。局部路径无工具栏布局/即时偏好写入，真实帧缓冲与强制完整重绘一致。数值为合成输入和绘制耗时，不是硬件端到端延迟；此性能方案来自此前优化，本轮验证与拆分保持其效果。
- 恢复测试使用 Windows 宽字符入口，绝对中文目录也通过；逐文档验证实际恢复文件中的尺寸和RGBA、活动文档身份/历史/修订不变、过期快照取消。
- 边界门禁通过193源码；来源覆盖通过311文件，证据摘要一致；`--strict` 按已知迁移缺口退出1；定向 `git diff --check` 通过。来源覆盖不能替代行为验收。
- 新建相关旧烟雾断言按已实现的多标签页/取消对话框契约更新；属性栏角度控件先滚动进入可见视口再断言，未取消其显隐条件检查。

## 复审发现与未关闭回归

以下仍是验收阻塞。本轮没有修改无关产品行为来适配旧断言，也没有把所有失败未经隔离就认定为历史问题。

| 测试 | 当前失败证据 | 归属/下一步 |
| --- | --- | --- |
| theme-atlas | inputNormal 素材尺寸应为5×14的断言失败 | 当前素材/契约与测试核对，本轮未改素材 |
| project-import | Import should reject | 之前窗口/性能审查已有记录；仍需明确哪一导入样本契约不符 |
| palette-import | unmigrated format exposed | 当前格式迁移范围与旧断言核对 |
| project-save | Grouped duration | 2026-10-15性能记录有原Document对照也失败的证据；分组历史仍未修复 |
| layers-render | List blank click retained selection | 图层空白点击选择回归，需对照当前空白命中与选择范围 |
| layer-context-menu | kind1得到23叶项/3 enabled，断言要求4 | 之前性能记录已登记；命令接入与使能契约仍未关闭 |
| workspace-layout | Legacy gradient controls | 单独重跑同样失败；综合入口先经过属性栏断言，不能据此声称后续全部工作区场景通过 |
| palette-mouse-startup | Legacy gradient controls | 单独重跑同样失败；原命中遍历的既有对照也失败，详见 interaction-performance 记录 |
| selection-interactions | Quick selection must precede transform hit | 之前原命中遍历也失败；本轮仍保留失败，未跳过输入优先级断言 |
| menu-catalog | 退出0xc0000409 | 菜单契约测试异常退出；不能等同于已证明应用菜单无崩溃 |
| cel-selection-clipboard | Cel selection clipboard regression check 4255 | 单元格剪贴板与选择契约需定位；本轮未修改对应事务 |
| color-picker-normal-map | moon-ring 应回退 SvSquare 的断言失败 | 当前已存在独立moon-ring迁移检查且通过，须核对旧断言是否过期 |

本次复审未发现新的核心→Editor反向依赖或缓存跨时间轴共享，但 Editor 仍有较多工作区状态；后续依赖图门禁只能阻止已编码的边界回退，不能替代设计审查。上述12项未全部关闭前，整套软件不应被标记为验收完成。
