# 视图、工作区、资源与设置语义需求

中文；返回[需求基线](../README.md)。

本页为规范候选，适用公共规则 [CO-001](core.md#co-001) 和[验收协议](../acceptance.md)。证据状态不代表本轮运行测试通过。所有未列出的参数默认值不得由实现者猜测，须进入[参数与冲突台账](../compatibility.md)。

<a id="ui-001"></a>
## UI-001 画布导航、网格、平铺与预览

- **目的与前置**：有一个或多个作品视图。
- **输入、参数与范围**：平移/缩放/旋转/镜像、相对明暗、网格/ISO、X/Y/双轴平铺、预览面板。
- **作用对象**：当前视图及工程显示设置。
- **成功结果与不变量**：100% 对应文档像素到设备像素；镜像不改内容；平铺重复复用同作品；非整数缩放不跳像素；辅助线可独立显隐。
- **预览、确认、取消与历史**：导航和面板不进文档撤销；网格显示元数据可 dirty 但不进历史。
- **保存重开**：工程网格随工程保存；导航/布局独立。
- **失败与边界**：旋转、DPI、偏移使用同一命中；平铺跨界预览与写入连续。
- **验收 AC-UI-001**：313%缩放绘制已有像素不跳；旋转镜像吸色落点一致；平铺跨边绘制与撤销。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/workspace-docking.md](../../../../legacy/docs/interactions/workspace-docking.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/renderer/src/core/shortcut-contracts.ts](../../../../legacy/src/renderer/src/core/shortcut-contracts.ts)；[src/renderer/src/core/shortcuts.test.ts](../../../../legacy/src/renderer/src/core/shortcuts.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="ui-002"></a>
## UI-002 工作区、面板与多视图

- **目的与前置**：应用运行。
- **输入、参数与范围**：面板显示、停靠/浮动、尺寸、顺序、工具栏位置、布局预设、弹窗式面板。
- **作用对象**：应用布局及会话。
- **成功结果与不变量**：保留可组织工作区能力；布局可重设计；临时弹出不覆盖持久布局；小窗口仍可访问操作。
- **预览、确认、取消与历史**：布局不 dirty，不进文档历史；重置只改工作区。
- **保存重开**：重启恢复有效可见位置；新旧布局迁移不要求复制旧像素尺寸。
- **失败与边界**：失焦/拖出边界不能丢控件；失效屏幕坐标收回可见范围。
- **验收 AC-UI-002**：缩小再放大、换屏、弹出恢复停靠；作品与撤销位置不变。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/workspace-docking.md](../../../../legacy/docs/interactions/workspace-docking.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/renderer/src/core/shortcut-contracts.ts](../../../../legacy/src/renderer/src/core/shortcut-contracts.ts)；[src/renderer/src/core/shortcuts.test.ts](../../../../legacy/src/renderer/src/core/shortcuts.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="ui-003"></a>
## UI-003 快捷键、焦点与临时工具

- **目的与前置**：工具、弹窗或不同面板获得焦点。
- **输入、参数与范围**：每命令多绑定，鼠标/滚轮/修饰键，循环工具，默认绑定来自入口表。
- **作用对象**：当前交互上下文。
- **成功结果与不变量**：输入框优先；复制删除按焦点；临时工具按完整组合生效且松开/失焦恢复；同上下文冲突可转移。
- **预览、确认、取消与历史**：设置草稿完成才保存，取消丢弃；工具切换不进作品历史。
- **保存重开**：v1 单绑定迁移到 v2 差量；导入导出完整保留用户绑定。
- **失败与边界**：无效导入可见报错；无绑定不劫持默认行为；快捷键名称不代表功能可用。
- **验收 AC-UI-003**：Ctrl+D 在画布/时间轴分别执行正确操作；失焦修饰键不粘住；取消快捷键草稿后重启不变。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/workspace-docking.md](../../../../legacy/docs/interactions/workspace-docking.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/renderer/src/core/shortcut-contracts.ts](../../../../legacy/src/renderer/src/core/shortcut-contracts.ts)；[src/renderer/src/core/shortcuts.test.ts](../../../../legacy/src/renderer/src/core/shortcuts.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="ui-004"></a>
## UI-004 首页、资源与参考图

- **目的与前置**：应用启动或资源面板打开。
- **输入、参数与范围**：最近/画廊/恢复/自定义目录、笔刷文件夹、色板、背景预设、参考图。
- **作用对象**：外部资源与用户配置。
- **成功结果与不变量**：最近不存在路径与损坏路径区别处理；渐进缩略图；自定义目录移除不删磁盘；资源管理能力保留。
- **预览、确认、取消与历史**：删除工程必须明确确认；排序与资源偏好不进作品历史；参考图语义另核对。
- **保存重开**：保留路径和用户资源；不把用户工程或恢复数据提交仓库。
- **失败与边界**：单缩略图失败不阻塞其他；资源删除不能误删工程外文件。
- **验收 AC-UI-004**：移除栏目保留文件；损坏文件仍在最近列表；笔刷拖入资源区不误开工程；参考图开关不污染导出。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/workspace-docking.md](../../../../legacy/docs/interactions/workspace-docking.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/renderer/src/core/shortcut-contracts.ts](../../../../legacy/src/renderer/src/core/shortcut-contracts.ts)；[src/renderer/src/core/shortcuts.test.ts](../../../../legacy/src/renderer/src/core/shortcuts.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="ui-005"></a>
## UI-005 设置、多语言、帮助与诊断

- **目的与前置**：任何工作阶段。
- **输入、参数与范围**：设置搜索、尺寸/倍率/颜色预设、九种语言、统计、项目属性、版本说明、诊断。
- **作用对象**：应用偏好、统计与帮助。
- **成功结果与不变量**：保留用户输入原文；切语言不改作品；项目统计记录内容编辑；诊断不能自称卡顿已修复。
- **预览、确认、取消与历史**：偏好不进文档历史；统计和录制依其内容契约。
- **保存重开**：偏好重启保持；实际发布日志与未发布计划区分。
- **失败与边界**：缺翻译/字体登记缺口；诊断失败可见，不能阻止基本绘画。
- **验收 AC-UI-005**：九种语言切换并输入中文文件名；设置重启保持；录制导航不增加笔画数。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/workspace-docking.md](../../../../legacy/docs/interactions/workspace-docking.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/renderer/src/core/shortcut-contracts.ts](../../../../legacy/src/renderer/src/core/shortcut-contracts.ts)；[src/renderer/src/core/shortcuts.test.ts](../../../../legacy/src/renderer/src/core/shortcuts.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="ui-006"></a>
## UI-006 桌面平台与外部入口

- **目的与前置**：Windows 桌面环境。
- **输入、参数与范围**：文件关联、拖放、剪贴板、窗口恢复、原生文件对话框、Explorer 缩略图、外部链接。
- **作用对象**：系统集成及对应应用命令。
- **成功结果与不变量**：外部打开直接定位工程；路径规范化去重；界面操作遵守用户选择；退出前处理未保存会话。
- **预览、确认、取消与历史**：取消系统选择不写文件；关闭取消保留工程。
- **保存重开**：原生窗口恢复与配置独立；新旧数据初期隔离。
- **失败与边界**：权限失败或系统服务不可用可诊断；不靠重启作为长期卡顿验收。
- **验收 AC-UI-006**：路径含空格/中文，关联启动与拖入对照；剪贴板不可用；窗口恢复无屏幕外不可找回状态。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/interactions/workspace-docking.md](../../../../legacy/docs/interactions/workspace-docking.md)；[docs/product/behavior.md](../../../../legacy/docs/product/behavior.md)；[src/renderer/src/core/shortcut-contracts.ts](../../../../legacy/src/renderer/src/core/shortcut-contracts.ts)；[src/renderer/src/core/shortcuts.test.ts](../../../../legacy/src/renderer/src/core/shortcuts.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="ui-007"></a>
## UI-007 工程参考图库

- **目的与前置**：工程处于活动状态，剪贴板提供合法像素。
- **输入、参数与范围**：添加、删除、切换、多个参考窗口、平移缩放、相对明暗。
- **作用对象**：当前工程嵌入参考资源和独立视图。
- **成功结果与不变量**：参考图不合入作品导出；添加/删除改变 dirty 但不进入文档撤销；视图导航不 dirty；各工程库隔离。
- **预览、确认、取消与历史**：空剪贴板/错误不清旧参考；异步读取后目标改变拒绝写入新工程。
- **保存重开**：参考像素随工程保存重开；窗口与缩放状态不当成作品编辑。
- **失败与边界**：非法尺寸/字节拒绝；在途粘贴不得跨工程应用。
- **验收 AC-UI-007**：粘贴2×1半透明参考并保存重开；确认画面和历史不变；切工程等待旧剪贴板结果，两个库均不新增错误引用。
- **新版承接**：保留现有功能，原生界面重新设计，不照搬旧布局。
- **证据状态**：已核对文档及关键测试/实现定位；未执行运行验收。
- **证据与复核入口**：[legacy/src/renderer/src/components/panels/ReferenceImagePanel.tsx](../../../../legacy/src/renderer/src/components/panels/ReferenceImagePanel.tsx)；[legacy/src/renderer/src/components/panels/ReferenceImagePanel.test.tsx](../../../../legacy/src/renderer/src/components/panels/ReferenceImagePanel.test.tsx)。
