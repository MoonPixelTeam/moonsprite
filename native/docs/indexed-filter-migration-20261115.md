# 索引色滤镜迁移（2026-11-15）

按 DR-010 承接普通 indexed 文档的六种预设和 LCD 屏幕滤镜。实际来源为 legacy filter-presets、workspace-commands-layer-adjustment、connectAnimationCels、animation-cel-content-cache 和 workspace-document-history。内部迁移复用已核对 legacy/LICENSE 的 MoonSprite Source-Available License 1.0。本阶段只做功能迁移。

## 像素和帧语义

六种预设复用已有 RGBA 算法，再按 paletteColorIdForCanvas 转换到可见、非零且有 alpha 的色板 ID；准确相同优先，否则沿旧版带双倍 alpha 权重的距离和可见顺序选择。没有候选时写 ID0，不分配新色、不改变色板。图层保留旧名称、说明、混合模式、默认或裁切后的透明度，并归入当前有效选中组；提交后仅选中新层，清除组选择。

LCD 从活动帧的 canonical surface 取色，indexed 源按第一个同 ID 色板项读取；越界直接取透明，不能读取 ID0 的颜色。红、绿、蓝分别保留原 alpha 和单个通道，红负位移、蓝正位移，扫描线按局部固定格栅，宽高参数不另行重设计效果。四层的目标色均映射回当前可见色板；新层视觉顺序扫描线、蓝、绿、红，保留原局部尺寸、偏移和原生 storage origin。源层隐藏但不更改像素或链接；原隐藏状态支持撤销。新组保留源父组，选中新组并以红色层为活动层。

所有新层在每帧复制同一转换结果；按旧版可见内容判定链接到第一个有内容的帧。indexed 内容判定使用全部有 alpha 资源 ID 的并集，空色板则检查非零 ID。特别是 ID0 有色时，数值0也可能包含内容，必须链接；没有有色资源时，非空 ID 本身也不能替代内容判定。

## 事务与验证范围

继续复用 detached 后台任务、取消与代数检查、现有 Timeline 和结构历史。索引色任务捕获不可变色板和文档模式，发布或提交前校验；源文档变更、色板变化、跨文档和过期任务拒绝提交。预览、重复、禁用、取消不写正式作品、dirty或历史。原生内存准入增加色板复制及查询预算，转换完按实际链接／独立 owner 数复核后才创建所有帧。索引色结构历史复用 kind13，承接旧版快照的资源、顺序、布局和分配器恢复，保留当前角色色和显式选中色块。

实际 Node oracle 直接运行未改动的旧版两个滤镜命令及其结构 Undo／Redo，生成756组：七种色板（普通、有色0、重复ID、首项透明、空表、全透明、隐藏）、三种可见顺序、四种布局和六种预设／三种LCD参数。原生比较像素、format、逐帧链接、元数据、组、活动层、源可见性和色板；扩展检查关联源身份、preview restore/repeat/cancel、单次历史、当前色板改变后的结构回放、三个生产编码器的原始 ID 和索引色导入门禁。

756组真实旧版命令对照、19组关联源变体及边界检查通过。九项不同定向CTest通过：indexed-filter-oracle／indexed-filter（5.41秒）、indexed-replacement-oracle／indexed-replacement／filter-presets（10.11秒）、indexed-adjustment-oracle／indexed-adjustment／filter-preview-controllers（9.83秒），新正式程序的selection-interactions（3.91秒）。旧版两个实际测试文件定向9项通过、93项跳过（15.58秒）。来源974文件和证据快照、Editor595源码、架构595源码／261targets及diff检查通过；strict因其它迁移缺口退出1。首轮修正了新增变量重名，第二轮修正了测试字符串转换；最终唯一正式Release及上述测试目标构建退出0，native/build/Release/moonsprite-native.exe于22:57:46更新（30,725,120bytes）。新程序生成后selection-interactions通过。生产 indexed 新建、转换及可编辑导入仍关闭，整体迁移 INCOMPLETE。没有人工图像或完整桌面验收。
