# 工程导入关系适配（当前编辑子集）

`project_import` 接收已经解析、解码的 Manifest DTO，独立检查关系与当前编辑能力，输出 PreparedImport。不会替换活动 Document、设置 dirty、生成撤销快照或写文件。

来源：legacy `project-format-decode.ts` 的层/cel独立存储、active ID与色卡恢复；`animation.ts` 与 `types-animation.ts` 的稳定 ID、同层关联和时长；`palette-layout.ts` 的完整行和按 order 填充空位。原生 Timeline 的 ID/slot 校验直接复用。

当前仅承接 1..1024 画布、单可见未锁定不透明普通层、单帧、单拥有 RGBA surface 的 cel；surface 必须画布同尺寸且零偏移。层与活动 cel 像素和几何必须一致。保留透明像素 RGB、层/帧/cel ID、帧时长、Unicode 名称、色卡不同 ID 的重复颜色、隐藏条目与空位。导入拥有独立像素副本，保留输入 archive 的只读引用。

多层帧、缺失/sparse surface、局部偏移、非普通混合、链接与额外资源明确拒绝。坏 ID、重复 slot、缺失/cyclic/cross-layer link 等报告 Corrupt；当前不能编辑的合法关系报告 Unsupported。legacy 运行时坏 link 有 fallback，但导入不把损坏关系静默铺平为可编辑内容。

色卡缺少 slots 时复用 legacy 完整行填充规则；无效引用及重复 slot 拒绝，order 与实际 slots 顺序不同也显式拒绝，因为当前 PaletteState 尚不能分别表达两者。此处严格拒绝区别于 legacy 的宽容归一化，避免隐式丢内容。next ID 不能碰撞已有 ID。

loop 与其余已知元数据暂留原 archive，不成为编辑状态；这是导入子集，不是完整往返保存承诺。保存必须基于原元数据保留策略另行验收。

验收：独立 MSVC Release 合同测试涵盖稳定 ID、精确透明 RGB、深拷贝、隐藏色卡、空 slots、重复 ID/slot、断链/环、错误 active ID、尺寸/像素长度、层cel矛盾、多帧、资源、非RGBA和色卡顺序拒绝。实际 UI 替换与dirty/cancel由集成路径验证。
