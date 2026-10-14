# 逐条验收用例索引

文件领域进展：FS-002–006、FS-008 的局部语义与自动验证见[文件生命周期专项](file-lifecycle.md)，上层 ID 保持不变；原生状态仍为未实现。

中文；返回[需求基线](README.md)。按[公共验收协议](acceptance.md)补充取消、失败、撤销、重做、保存重开与目标组合。下表全部为待执行；没有把旧测试文件存在解释为测试通过。

| 用例 | 需求 | 操作与预期 | 状态 |
| --- | --- | --- | --- |
| AC-FS-001 | [FS-001](requirements/files.md#fs-001) | 建立两个不同尺寸工程，切换后内容独立；复制视图编辑只修改同一工程；取消关闭保留会话 | 待运行 |
| AC-FS-002 | [FS-002](requirements/files.md#fs-002) | 用有偏移 cel 的动画工程和 GIF 打开；重复拖入一次；截断副本必须报错 | 待运行 |
| AC-FS-003 | [FS-003](requirements/files.md#fs-003) | 阻塞第一次写入后继续编辑并保存，最终包含新修订；注入失败验证旧文件未损坏 | 待运行 |
| AC-FS-004 | [FS-004](requirements/files.md#fs-004) | 单图绘制保存后新增图层再保存，检查三种选择及来源未被取消流程覆盖 | 待运行 |
| AC-FS-005 | [FS-005](requirements/files.md#fs-005) | 往返包含共享 cel、组蒙版、Tilemap 和画布外内容的工程，核对像素与共享关系 | 待运行 |
| AC-FS-006 | [FS-006](requirements/files.md#fs-006) | 从同一草稿连续两次恢复并模拟退出；保存期间再编辑；删除时有在途写入不得复活 | 待运行 |
| AC-FS-007 | [FS-007](requirements/files.md#fs-007) | 含空帧、重复帧和切片的动画按行列导出，核对布局；取消预览不改变视图与工程 | 待运行 |
| AC-FS-008 | [FS-008](requirements/files.md#fs-008) | 绘制/平移/撤销混合录制；移走副本录像库测试告警；便携工程离机恢复首尾画面 | 待运行 |
| AC-DR-001 | [DR-001](requirements/drawing.md#dr-001) | 1px/2px、半透明、自交、快慢事件采样绘制对照；撤销恢复逐像素基线 | 待运行 |
| AC-DR-002 | [DR-002](requirements/drawing.md#dr-002) | 在不同落点用三种模式绘制；两种来源笔刷换前景色，验证重映射差异 | 待运行 |
| AC-DR-003 | [DR-003](requirements/drawing.md#dr-003) | 相同路径不同采样密度比较像素；固定图片刷切换动态颜色；撤销无残留 | 待运行 |
| AC-DR-004 | [DR-004](requirements/drawing.md#dr-004) | 反向直线像素集合相同；绘制中切换中心/比例；多边形撤销顶点后完成再撤销作品 | 待运行 |
| AC-DR-005 | [DR-005](requirements/drawing.md#dr-005) | 双缺口线稿填充不外泄；关闭智能闭合应与普通填充一致；有蒙版/索引色对照 | 待运行 |
| AC-DR-006 | [DR-006](requirements/drawing.md#dr-006) | 起终点 (0,0)/(8,4)，中心 (4,2) 为起色，(8,2)/(4,4) 为终色；零宽轴与旋转验证 | 待运行 |
| AC-DR-007 | [DR-007](requirements/drawing.md#dr-007) | 喷枪固定随机种子检验区域及撤销；静止按住仍出点；柔化/液化各保留独立样本 | 待运行 |
| AC-DR-008 | [DR-008](requirements/drawing.md#dr-008) | 矩形画布组合对称比较像素集合；锁轴+临时解锁；N:1 约束首尾完整阶梯 | 待运行 |
| AC-DR-009 | [DR-009](requirements/drawing.md#dr-009) | 重排色板后画面不变；半透明 RGBA/索引互转、色板文件往返与一次撤销 | 待运行 |
| AC-DR-010 | [DR-010](requirements/drawing.md#dr-010) | 半透明偏移 cel 多次调参再取消逐像素一致；应用后撤销；各滤镜在参数台账逐项补齐 | 待运行 |
| AC-SE-001 | [SE-001](requirements/selection.md#se-001) | 非矩形加减交、单像素拖动、从画布外拖入、多边形取消与闭合 | 待运行 |
| AC-SE-002 | [SE-002](requirements/selection.md#se-002) | 在带底色非矩形选区上边缘移动再内部移动两次；确认/取消/撤销各比较掩码与底色 | 待运行 |
| AC-SE-003 | [SE-003](requirements/selection.md#se-003) | 2 层×3 帧变换；混入锁层后零修改；关联 cel 不重复变换 | 待运行 |
| AC-SE-004 | [SE-004](requirements/selection.md#se-004) | 非矩形镜像后再移动无残影；全帧层选择与单帧隐式选择分别验证 | 待运行 |
| AC-SE-005 | [SE-005](requirements/selection.md#se-005) | 复制组到另一工程再编辑与撤销，源不变；遗留选区不能抢占图层焦点删除 | 待运行 |
| AC-SE-006 | [SE-006](requirements/selection.md#se-006) | 非矩形选区转背景预设后像素与 dirty 不变；自动切片结果用于单片/全片导出 | 待运行 |
| AC-LA-001 | [LA-001](requirements/layers.md#la-001) | 嵌套组复制拖动再撤销；合并半透明层前后对比；背景转换恢复原身份 | 待运行 |
| AC-LA-002 | [LA-002](requirements/layers.md#la-002) | 两个偏移不同关联层绘制后同步像素但位置不变；断开后独立；保存往返再次绘制 | 待运行 |
| AC-LA-003 | [LA-003](requirements/layers.md#la-003) | 两帧分别设蒙版，撤销只影响一帧；组蒙版与剪贴重开合成一致 | 待运行 |
| AC-LA-004 | [LA-004](requirements/layers.md#la-004) | 带蒙版关联帧栅格化样式只烘焙一次；属性改多次关闭单步撤销 | 待运行 |
| AC-LA-005 | [LA-005](requirements/layers.md#la-005) | 同层两种字号颜色局部编辑并撤销；保存重开；栅格化前后位置和像素对照 | 待运行 |
| AC-AN-001 | [AN-001](requirements/animation.md#an-001) | 重排/删除关联帧后撤销恢复链接；同时选层和帧操作保持范围 | 待运行 |
| AC-AN-002 | [AN-002](requirements/animation.md#an-002) | 嵌套循环节标签播放与右键播放比较；手动切帧继续；停止返回开关分别验证 | 待运行 |
| AC-AN-003 | [AN-003](requirements/animation.md#an-003) | 多帧跨文档粘贴后撤销移除本批资源；源内容和其他共享者不变 | 待运行 |
| AC-AN-004 | [AN-004](requirements/animation.md#an-004) | 固定首尾与路径生成补间，核对帧数/端点/撤销；反转两次恢复原序列 | 待运行 |
| AC-TI-001 | [TI-001](requirements/tiles.md#ti-001) | 两层共用 Tileset，修改同步；栅格多帧转格后撤销精确恢复 | 待运行 |
| AC-TI-002 | [TI-002](requirements/tiles.md#ti-002) | 同一瓦片两个引用分别运行四模式；整格/局部移动核对 Tileset 数量和像素 | 待运行 |
| AC-TI-003 | [TI-003](requirements/tiles.md#ti-003) | 交换槽位画面不变；全删后撤销；跨工程粘贴不借用源工程内存 | 待运行 |
| AC-TI-004 | [TI-004](requirements/tiles.md#ti-004) | 两个朝向实例局部编辑同步正确；完整选中只移一实例；多层共享源删除撤销与重开 | 待运行 |
| AC-UI-001 | [UI-001](requirements/workspace.md#ui-001) | 313%缩放绘制已有像素不跳；旋转镜像吸色落点一致；平铺跨边绘制与撤销 | 待运行 |
| AC-UI-002 | [UI-002](requirements/workspace.md#ui-002) | 缩小再放大、换屏、弹出恢复停靠；作品与撤销位置不变 | 待运行 |
| AC-UI-003 | [UI-003](requirements/workspace.md#ui-003) | Ctrl+D 在画布/时间轴分别执行正确操作；失焦修饰键不粘住；取消快捷键草稿后重启不变 | 待运行 |
| AC-UI-004 | [UI-004](requirements/workspace.md#ui-004) | 移除栏目保留文件；损坏文件仍在最近列表；笔刷拖入资源区不误开工程；参考图开关不污染导出 | 待运行 |
| AC-UI-005 | [UI-005](requirements/workspace.md#ui-005) | 九种语言切换并输入中文文件名；设置重启保持；录制导航不增加笔画数 | 待运行 |
| AC-UI-006 | [UI-006](requirements/workspace.md#ui-006) | 路径含空格/中文，关联启动与拖入对照；剪贴板不可用；窗口恢复无屏幕外不可找回状态 | 待运行 |
| AC-EX-001 | [EX-001](requirements/extensions.md#ex-001) | 恶意路径包拒绝；更新失败旧扩展可用；反复启停无重复菜单/事件 | 待运行 |
| AC-EX-002 | [EX-002](requirements/extensions.md#ex-002) | 事务两步第二步失败恢复第一步；持久回调切文档拒绝；调用只读查询不能偷偷写对象 | 待运行 |
| AC-EX-003 | [EX-003](requirements/extensions.md#ex-003) | 打开对话框、重复修改、取消与关闭；撤销后再次回调取新基线；失效目标不写 | 待运行 |
| AC-EX-004 | [EX-004](requirements/extensions.md#ex-004) | 双扩展隔离读写；撤销事件载荷正确；禁用关闭所属窗口；HTML 例子逐个迁移验收 | 待运行 |
| AC-EX-005 | [EX-005](requirements/extensions.md#ex-005) | 同脚本在旧版/原生版对照结果；支持、有限、拒绝三类有可运行样例 | 待运行 |
| AC-CO-001 | [CO-001](requirements/core.md#co-001) | 同时打开两个文档，开始预览后切换并回调，第二个不变；undo/redo/cancel 精确对照 | 待运行 |
| AC-CO-002 | [CO-002](requirements/core.md#co-002) | 冷态及2小时/8小时固定序列测输入延迟与内存；不重启/重载；记录硬件和工程 | 待运行 |
| AC-NX-001 | [NX-001](requirements/product.md#nx-001) | 独立原生程序无需旧前端运行；中文/压感/DPI 验证先通过 | 待运行 |
| AC-NX-002 | [NX-002](requirements/product.md#nx-002) | 九种语言样张、中文输入/候选定位、长标签、整数倍及系统125/150%DPI | 待运行 |
| AC-NX-003 | [NX-003](requirements/product.md#nx-003) | 编辑按钮五种状态并切换主题；损坏图集/缺字检测；布局和作品保持不变 | 待运行 |
| AC-NX-004 | [NX-004](requirements/product.md#nx-004) | 所有入口有需求或分类；所有正式需求有验收；关键缺口关闭才替换旧版 | 待运行 |
| AC-LA-006 | [LA-006](requirements/layers.md#la-006) | 新建带蒙版调整层，修改参数后复制，独立修改副本；撤销新建同时移除蒙版；普通样式命令不污染目标 | 待运行 |
| AC-UI-007 | [UI-007](requirements/workspace.md#ui-007) | 粘贴2×1半透明参考并保存重开；确认画面和历史不变；切工程等待旧剪贴板结果，两个库均不新增错误引用 | 待运行 |
| AC-EX-006 | [EX-006](requirements/extensions.md#ex-006) | 导入同一包两次生成独立宠物；动画帧时长/循环保留；超限包拒绝；旧HTML界面迁为原生后重测所有条件 | 待运行 |

