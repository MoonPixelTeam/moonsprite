# 耦合审计剩余验收清单

本清单承接原审计C01—C10。最新已关闭9/10，**只剩C05**；C02/C07/C09已完成，依据见 coupling-implementation-validation-2026-11-13.md 文末及 history-edit-contract.md 末节。下表及后续章节保留实施历史，不能将其中旧“待编译/未完成”当成当前状态。

| 项目 | 剩余结构工作 | 关闭前必须具备的证据 |
| --- | --- | --- |
| C02 会话（已关闭，以下为原待办） | 消除ProjectSession.tools可选快照与Editor工具配置副本，切换不再逐字段capture/restore；继续核对选择快照/非活动结构投影的完整验收。Document/view/recovery保持稳定唯一owner | A/B往返保持工具、子类型、临时资源像素、视图、选择与历史；结构修改后非活动投影有效；重排后的排队目标正确；非活动恢复不激活；新配置无需手工闭包。沿用已有通过用例并补缺口 |
| C05 保存 | 完成 `save-lifecycle-failure-matrix.md` 尚缺各格式失败分支；查明已有跨进程恢复提交失败的具体原因 | 每个矩阵缺口补故障注入及正式路径证据；失败不清dirty/恢复、不误关；成功但清理失败独立处理；旧失败日志保留，后续通过不能证明旧失败已修复 |
| C07 历史（已关闭，以下为原待办记录） | 整份快照和稳定成员组合目标预检已验收（10.56/10.58）；继续完成父结构、资源、children及分配失败前校验/准备；收口组合builder/validate，不只覆盖叶条目 | 全部实际组合按原域契约apply→undo→redo；undo逆序/redo正序；子条目后段拒绝和准备分配失败不留父/子半应用；像素透明RGB、链接、选择、焦点、资源与预算保持；Document单一事务所有者；不引入整图或工程编解码回滚 |
| C09 服务验收（已关闭，以下为原待办） | 按上述边界完成剩余可独立验证的会话/模态/保存行为；保留正式异步与真实CLI/UI接线 | 服务行为不创建整个工作区；修改预览私有状态不牵动无关保存/面板夹具；窄执行器/时钟/文件选择注入；原CLI兼容、正式异步状态机不被smoke绕过；数据仅在测试自有路径 |

证据以对应源码、契约、正式程序身份和本批输出为准。服务检查、真实GUI自动检查、人工图像验收分别记录。来源覆盖通过不代表迁移行为等价；已知legacy-partial和strict失败继续保留。

当前合并实施补记：预设/LCD原owner的弱引用清理、切换后的运行/排队代次作废及异常结束清理已修改，受控服务场景已补齐，等待最终统一构建运行。此前运行中的selection-settled构建已退出0，但构建开始后源码仍有变化，该产物不能作为当前源码最终验收证据。其余六项保持开放。

合并实施进展（未验收）：C04/C09的AA、卷积及栅格渐变映射已迁至有类型模态会话，结束以原owner及稳定预览事务编号校验；增加受控切换、销毁、替换和Apply服务场景。C07已接入legacy同源的组合失败逆序补偿，并在领域写入前准备整棵嵌套组合的失败记录；增加服务与真实Document失败场景。均未执行新增检查或构建；父结构/资源完整prepare与其他剩余条件仍开放，六项未关闭。

合并实施补记（未验收）：C02的领域动画选择快照已收口到Document值接口，时间轴取消恢复独立组焦点；C07资源阶段加入整棵组合预备与后段失败精确交换恢复。均有新增真实Document场景但未编译/运行。未关闭完整选择历史/非活动结构投影、父结构准备等剩余要求。

## 本次统一验收结果

正式程序与相关服务/公共头构建通过；34/34 GUI、24/24服务/边界、timeline-model及geometry通过。C06按原审计范围关闭，当前为5/10项；其余五项保持开放。模态owner/token、领域选择值快照、组合失败补偿、资源交换恢复、链接同步全量准备及整份Timeline快照恢复的上述新增场景均实际通过；它们不证明C02/C04/C05/C07/C09的剩余条件已完成。初次timeline-model夹具在构造阶段意外触发预期overflow，修正为构造后注入并保留失败日志。

程序SHA-256：`edd92f5b5a6bf64f18a9f945a86e79719cff65361e61ca98c1a122d5f8ad6553`。证据：`build/test-tmp/coupling-consolidated-consistency.json`、`coupling-consolidated-services.log`、`coupling-consolidated-gui/results.json`、`coupling-consolidated-timeline-fixture-test.log`、`coupling-consolidated-geometry/results.json`。已有未知恢复提交失败本轮未复现，不宣称定位或修复。

后续合并实施（未验证）：图层结构保留、slice/pivot/loop/像素选择的交换式prepare及根回放上下文恢复已写入，并补真实Document失败场景；尚未构建运行。已验收数字仍为5/10，正式二进制仍为上一版；当前源码不能以旧程序身份声明通过。

同一合并步骤继续补齐（未验证）：工程rollback的必要目标准备已转为保留原Timeline/资源的交换节点，普通组合后段失败及terminal/local-history底层路径共用；录制回调拒绝会恢复原设置。补充真实Document父/兄弟正反向失败与回调拒绝场景，尚未构建。C07仍因可分配叶阶段及完整builder/validate缺口开放。


当前合并步骤（源码实现，未验证）：C07叶内容已接入私有metadata草稿准备、按实际触及区间保留像素及统一发布/逆向交换，复用现有领域回放逻辑；调色板采用选择性字段准备。新增混合叶后段失败/无效link后处理/同计划重用场景。仍不构建、不运行新增批次，留待完整实现后的统一验收；当前验收数字保持5/10。terminal、直接domain入口、组合builder/validate及metadata准备成本仍须完成核对。


会话合并实施（源码，未验证）：C02现已将view的mask/group slots与锚点纳入完整值快照，通过weak原owner绑定恢复；结构成员变动明确normalize，领域/拖放/剪贴板同步scope保存前后快照，计入历史预算。选择恢复不再发布内容；补服务与现有多文档GUI后台group历史场景。普通refresh不承担清理。尚未构建运行，C02/C09待统一验收；总体仍为已验收5/10。


选择历史收口补记（源码，未编译验收）：scope 使用仅在 pushEdit 成功入栈时递增的代次，区别于裁剪、撤销、重做和分组共用的 historyRevision。仅裁剪旧选区条目不会追加快照、改变会话选择或增加历史成本；新增 trim-only→undo 回归夹具。历史选择费用逐分支核对沿用 legacy 的 64+slots*16，不重复累加。验收仍为5/10，等待剩余实现后的统一构建与运行。


## 终结载荷与组合 builder 收口（源码，待最终统一验证）

局部历史终结载荷现在在任何字段或字节写入前核对双向元数据类型、整数转换范围、像素载荷存在及等长、owner 存储边界；帧几何和透明度投影也先准备。透明度覆盖表按实际回放方向构建一次，保持重复字段的正向最后覆盖、反向逆序恢复；不按每层扫描全部补丁，不复制整文档或像素。沿用 legacy local-history-delta.ts 的字节粒度、共享 owner 与补丁顺序，以及 HistoryStack 对单步失败前不写入的要求。

组合 builder 改为只读旧条目，先完成父载荷、子容器容量和费用/溢出核对，才无分配移动子条目。Document 的 historyRevision 和待计 operation 在分组成功后发布；documentChanged 沿用 legacy 的 children.any 判定，纯选择分组不引入作品修改。已增加服务故障准备拒绝与真实 Document 选择捕获异常场景。

直接蒙版终结回放拒绝无效源面、零 canvasWidth 或无效目标尺寸；瓦片终结回放拒绝缺少必需选择/组上下文的载荷，避免先解引用 optional。自由图块来源属性先用现有 next 值构建并验证 Timeline，再发布；没有增加原有像素复制。动画选择 before 缺少 after 在根形状检查阶段拒绝。

新增夹具覆盖双向、直接领域/根回放/嵌套历史导航、后段错误前原像素/存储身份/历史计量/修订/损伤保持，以及重复透明度投影顺序、builder 拒绝与纯选择分组。均未编译运行，不登记行为通过；保留既有 strict 迁移缺口、C05 未定位旧失败及其他剩余验收条件。总体已验收仍为5/10。


## 当前批次验证准备

本批停止继续扩展审计范围，进入统一编译验收：选择完整快照/哈希归一化、历史terminal与builder准备、保存接纳/清理派发及前驱恢复失败边界。新增测试尚待编译运行；当前仍只有5/10已验收。旧恢复提交未知根因不以本批通过代替。


## 当前源码的服务与领域运行结果

本批已完成C++核心库、相关服务及公共头编译，正式应用仍在构建；尚不更新整体已验收5/10。

- `document-animation-binding`：完整组格/蒙版选择快照、非活动弱owner、结构清理及撤销重做、trim-only范围和顺序保持通过。记录：`build/test-tmp/coupling-final-history-selection.log`（同次历史测试仍失败，该日志不是整批通过）。
- `document-raster-history`：修正夹具前置后，完整栅格/稀疏历史夹具退出0，含本批builder准备、terminal类型/整数/字节边界、父子/兄弟失败补偿、共享像素身份、选择/资源/计量保持。记录：`build/test-tmp/coupling-final-raster-mask-test.log`。先前失败日志全部保留。
- 保存/恢复三项、ASE接纳及预览/阶段/播放/历史存储六项共9/9通过；记录：`coupling-final-save-recovery.log`、`coupling-final-service-subset.log`。没有将未知旧恢复提交失败登记为已修复。
- Editor及架构边界2/2通过；记录：`coupling-final-boundaries.log`。单独的正负夹具本批未重跑，不能写成四项均通过。

运行暴露并修正了一处生产接线冲突：分组命令首次apply时只有待提交before选择，after由pushEdit按实际结果捕获；现在首次apply暂存before，不将未完成命令交给成对历史快照校验。正式入栈后的undo/redo仍严格拒绝缺after的历史。另修正测试对全选不写历史、GridX为double、蒙版须有可见像素的前置误解，没有为通过测试改变这些既有行为。


## 最新状态（本批最终复查）

整体已验收保持5/10（C01/C03/C06/C08/C10）。本批正式Release构建及同版16/16 GUI通过，完整raster-history/animation-binding 2/2通过；来源覆盖912、差异格式检查及578个程序输入一致性通过。证据及修复细节见 `coupling-implementation-validation-2026-11-13.md` 文末。选择归一化已按native隐式目标表示适配，图层移动/图像笔刷遮挡夹具及script/native样式互通均通过。上述通过只替代“本批未编译/待GUI”的状态，不撤销C02/C04/C05/C07/C09各自的剩余条件，不撤销已知迁移缺口和未知旧恢复提交失败。


## 最新关闭状态：6/10

C04在轮询依赖分组、独立失败周期检查、原18回调/谓词/顺序保持、111个实际计时器周期及正式预览/保存接线验收后关闭。14项服务/边界和同版7项GUI（含43真实格式失败/重试）通过；证据见实施报告最后一节。C02仍有手工工具快照搬运，不应仅因之前A/B选择测试通过而关闭。C05旧失败与其余格式故障条件、C07原剩余条件、C09关联剩余行为继续有效。之前各章节5/10是当时状态，最新以本节为准。


最新补记：C07全部原剩余条件已完成源码映射及运行验收，见history-edit-contract.md末节，不再重复作为待办。C02工具直接归属已实现，当前等待正式Release与真实工具/会话GUI；C05/C09仍开放。当前7/10。


## 最终当前剩余：仅 C05

C02直接工具/临时资源归属及C09独立服务/正式接线通过同版13/13 GUI，C07完整契约及相关领域运行完成；整体9/10。唯一剩余：旧child9436跨进程恢复提交失败因原日志缺Windows错误码/阶段/路径无法归因，以及save-lifecycle-failure-matrix.md尚缺的逐编码器/真实系统满盘证据。已实现诊断与保护，不据此宣称旧故障已修复。最终证据：build/test-tmp/coupling-direct-tools-final-consistency.json。


## 最新 C05 保存边界验收（2026-11-13，本节替代本批待验证状态）

整体仍为9/10，C05部分完成，未将历史未知失败算作已修复。保存worker已从Editor提取至`src/captured_save.h`：只消费DocumentSnapshot、冻结的保存请求与录制读取器，返回结果；活动Document接纳、恢复清理及关闭续接仍由协调层负责。沿用既有编码、原子写入及portable录制逻辑，没有增加生产自动重试。

正式Release构建成功，日志`build/test-tmp/coupling-c05-build.log`。唯一正式程序SHA-256：`8f4d194752a00cff08211e64fb704d01e488d60b7172a457f5bdde0e508ddd2b`。919个冻结源码/测试/脚本输入无漂移，GUI期间程序哈希一致，证据`build/test-tmp/coupling-c05-final-consistency.json`。

- 独立captured-save：256个失败/显式重试场景通过，覆盖原生及10个图片格式、前后台与source-only、编码/创建/写入/磁盘满错误码/短写/flush/替换及原生验证/备份拒绝。检查旧目标、实时文档像素/历史/修订/dirty/路径/归档身份、恢复保护及临时文件/句柄所有权，显式成功重试使用真实默认操作。此处文件系统故障属于受控操作注入；原生编码使用真实编码器限制，图片异常注入不能替代真实逐格式编码器验收。日志`coupling-c05-captured-save-detail.log`。
- 正式GUI真实编码器拒绝：10个图片格式各4类上下文，共40场景通过。使用1025×17画布与6400%缩放，触发真实编码尺寸/预算校验；保留旧目标、恢复数据、dirty、身份和关闭意图；改为100%后显式重试成功，后台A不激活且B保持。未使用编码或持久化mock。
- 同版43个真实Windows文件锁提交拒绝/重试、完整native-save及aseprite-save全部退出0。完成trace分别为40和43，日志和trace副本在`build/test-tmp/coupling-c05-gui-20261113-125357`。
- image-save、project-save、editor-recovery、saved-recovery-cleanup、atomic-write、save-task共6/6通过，日志`build/test-tmp/coupling-c05-services.log`。来源覆盖、架构边界与diff检查结果另存`coupling-c05-provenance.log`、`coupling-c05-architecture.log`及`coupling-c05-diff.log`。本批没有新增人工图像或性能验收。

尚未闭环：旧child9436只有22字节`Cannot commit recovery`，当时Windows码、操作阶段、路径及句柄owner未记录，无法从后续成功运行还原根因。未改动legacy的原子写入探针也曾出现os error 5，只证明跨实现出现过拒绝，不证明旧9436根因。现有错误码/阶段/路径/pid诊断与三阶段锁拒绝检查用于未来失败定位；不得将新测试通过登记成旧失败已修复。真实系统满盘未执行，受控ERROR_DISK_FULL与真实满盘明确区分。已登记的legacy-partial及strict迁移缺口继续有效。

## 剩余阻塞核对（2026-11-13）

本次仅复核C05原始六步、完成条件、当前SaveTask/SaveVersion、共享接纳、captured worker、正式程序一致性证据及旧失败文件，未再次构建或重复执行测试。旧child-error-9436.txt仍为22字节Cannot commit recovery，没有可供追加分析的原始错误码/阶段/路径/owner。该同一缺证阻塞在此前9/10交付、C05补充矩阵交付及本次核对中持续存在；现有可实施边界修复和定向验收已完成，历史根因仍不能确认。

真实满盘环境只读检测：当前进程Elevated=false、New-VHD不可用、ImDisk不可用；diskpart.exe存在但未运行。没有填充用户卷、创建或挂载VHD，也没有进行权限提升。受控ERROR_DISK_FULL通过仍不得写成真实系统满盘通过。

继续闭环所需外部条件：带新诊断的实际恢复提交失败记录（Windows码、domain阶段、目标和临时路径、pid，必要时取得句柄持有者），以及可写的隔离小容量测试卷。取得后仅对对应失败补定向修复/验证。保持9/10，不把未来未取得的证据列为已完成，不靠重复绿色运行或盲重试关闭C05。

### 历史遗留文件的额外只读取证

旧cross-process目录的pending描述符指向worker-3-7，长度262144、CRC32=3910472683；实际payload长度262144、CRC32=3243096442，与pending不匹配。已提交metadata为worker-3-6，payload完整匹配该worker按名称循环生成的字节模式。因此遗留状态是“新描述符、上一版完整payload及metadata”，不是由该证据证明的半写payload。证据与四个原文件SHA-256保存在build/test-tmp/coupling-c05-historical-retained-state.json；未修改原文件。

这缩小了最终遗留状态范围，但没有child9436与worker编号的绑定记录，也没有当时Windows码或句柄owner，不能将其直接判成该子进程payload替换失败的根因。原六种descriptor/payload/metadata崩溃场景及三阶段真实锁拒绝已有覆盖，不因此重复执行。用户不需要理解或自行搭建底层取证环境；该缺证问题仍由实现方如实记录，不能冒称修复。
