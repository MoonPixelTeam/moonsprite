# 功能目录与覆盖表

文件领域进展：FS-002–006、FS-008 的局部语义与自动验证见[文件生命周期专项](file-lifecycle.md)，上层 ID 保持不变；原生状态仍为未实现。

中文；返回[需求基线](README.md)。所有能力默认保留；本表是目录，不是已验证百分比。旧入口与默认键见 [入口台账](entrypoints.md)，完整参数缺口见 [GAP-008](compatibility.md)。跨功能公共契约见 CO-001/CO-002。

| 需求 | 能力 | 迁移处置 | 原生状态 |
| --- | --- | --- | --- |
| [FS-001](requirements/files.md#fs-001) | 新建、多工程与视图 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [FS-002](requirements/files.md#fs-002) | 打开与格式边界 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [FS-003](requirements/files.md#fs-003) | 保存、另存为与串行写入 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [FS-004](requirements/files.md#fs-004) | 原图片格式与有损结构提示 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [FS-005](requirements/files.md#fs-005) | 工程兼容与资源身份 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [FS-006](requirements/files.md#fs-006) | 恢复与本地回溯 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [FS-007](requirements/files.md#fs-007) | 导出与精灵表 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [FS-008](requirements/files.md#fs-008) | 缩时录制、便携与导出 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [DR-001](requirements/drawing.md#dr-001) | 基础笔画与橡皮擦 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 部分接入：[原生工具属性批次](../tool-options-migration-01.md)，其余笔刷语义待迁移 |
| [DR-002](requirements/drawing.md#dr-002) | 图片笔刷与图案模式 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [DR-003](requirements/drawing.md#dr-003) | 笔刷动态与压感 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [DR-004](requirements/drawing.md#dr-004) | 直线、曲线与形状 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [DR-005](requirements/drawing.md#dr-005) | 填充、魔棒与智能闭合 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [DR-006](requirements/drawing.md#dr-006) | 多色标线性与径向渐变 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [DR-007](requirements/drawing.md#dr-007) | 喷枪、魔术橡皮、柔化与液化 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [DR-008](requirements/drawing.md#dr-008) | 对称绘制与绘画辅助 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [DR-009](requirements/drawing.md#dr-009) | 颜色、调色板与模式转换 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 部分接入：[色卡首批](../palette-migration-01.md)，非完整颜色领域验收 |
| [DR-010](requirements/drawing.md#dr-010) | 调整、滤镜、抗锯齿与替色 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [SE-001](requirements/selection.md#se-001) | 创建、组合与反选 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [SE-002](requirements/selection.md#se-002) | 移动选框与移动内容 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [SE-003](requirements/selection.md#se-003) | 多图层多帧变换 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [SE-004](requirements/selection.md#se-004) | 缩放、旋转、自由变换与内容镜像 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [SE-005](requirements/selection.md#se-005) | 剪切、复制、浮动粘贴与焦点 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [SE-006](requirements/selection.md#se-006) | 切片与选区衍生资源 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [LA-001](requirements/layers.md#la-001) | 图层结构、属性与背景 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [LA-002](requirements/layers.md#la-002) | 关联图层与关联 cel | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [LA-003](requirements/layers.md#la-003) | Cel 蒙版、组蒙版与剪贴 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [LA-004](requirements/layers.md#la-004) | 图层样式与实时属性 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [LA-005](requirements/layers.md#la-005) | 可编辑文本与栅格化 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [AN-001](requirements/animation.md#an-001) | 帧、Cel 与选择范围 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [AN-002](requirements/animation.md#an-002) | 播放、循环节与洋葱皮 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [AN-003](requirements/animation.md#an-003) | 帧、Cel、蒙版复制和跨项目操作 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [AN-004](requirements/animation.md#an-004) | 动画反转、补间与变形 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [TI-001](requirements/tiles.md#ti-001) | Tilemap 建立、转换与共享 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [TI-002](requirements/tiles.md#ti-002) | 四种 Tilemap 编辑模式 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [TI-003](requirements/tiles.md#ti-003) | 瓦片槽位、删除与跨文档 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [TI-004](requirements/tiles.md#ti-004) | 自由瓦片源、实例与共享集合 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [UI-001](requirements/workspace.md#ui-001) | 画布导航、网格、平铺与预览 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [UI-002](requirements/workspace.md#ui-002) | 工作区、面板与多视图 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [UI-003](requirements/workspace.md#ui-003) | 快捷键、焦点与临时工具 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [UI-004](requirements/workspace.md#ui-004) | 首页、资源与参考图 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [UI-005](requirements/workspace.md#ui-005) | 设置、多语言、帮助与诊断 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [UI-006](requirements/workspace.md#ui-006) | 桌面平台与外部入口 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [EX-001](requirements/extensions.md#ex-001) | 安装、启停、卸载与贡献 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [EX-002](requirements/extensions.md#ex-002) | Lua 文档事务与 MSE 能力 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [EX-003](requirements/extensions.md#ex-003) | Lua Dialog 与原生扩展界面 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [EX-004](requirements/extensions.md#ex-004) | Runtime 事件、外部服务与原生迁移 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [EX-005](requirements/extensions.md#ex-005) | 兼容子集与占位清理 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [CO-001](requirements/core.md#co-001) | 事务与历史的统一所有权 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [CO-002](requirements/core.md#co-002) | 坐标、呈现与长期运行 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [NX-001](requirements/product.md#nx-001) | 原生产品与独立实现 | 新增产品约束 | 未实现 |
| [NX-002](requirements/product.md#nx-002) | Fusion 10px 统一像素界面 | 新增产品约束 | 未实现 |
| [NX-003](requirements/product.md#nx-003) | 皮肤编辑器与主题 | 新增产品约束 | 未实现 |
| [NX-004](requirements/product.md#nx-004) | 功能覆盖与替换门槛 | 新增产品约束 | 未实现 |
| [LA-006](requirements/layers.md#la-006) | 渐变映射调整图层 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [UI-007](requirements/workspace.md#ui-007) | 工程参考图库 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |
| [EX-006](requirements/extensions.md#ex-006) | 宠物伴侣与宠物包 | 保留能力，允许重设计入口；详尽分支/参数按证据确认 | 未实现 |

## 覆盖边界

- 静态入口取自默认快捷键、主菜单、编辑/图层菜单、快速命令、播放菜单、图层与时间轴上下文以及色板/笔刷/瓦片面板。API 与交互契约原句保存在 inventory.json，仅作为证据。
- 程序性生成的菜单、工具选项细分、面板内条件入口和第三方扩展实例仍需人工可达性验证；所有自动归属标为候选，不得用行数宣称全量需求闭环。
- 功能补齐顺序：文件数据→画笔选区→图层动画→瓦片效果→工作区资源→扩展→皮肤编辑器。任何领域进入原生实现前，关闭该领域参数、兼容和语义冲突。

