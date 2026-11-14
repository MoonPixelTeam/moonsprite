# 索引色可见颜色重映射迁移

2026-11-14。本阶段完成工程读取后的隐藏颜色 ID 重映射；索引色编辑、新建和转换继续保持关闭。只迁移功能，不进行性能优化。

## 旧版依据与适配

直接依据 `legacy/src/renderer/src/core/document-model.ts::remapIndexedDocumentToVisiblePalette`、`paletteColorIdForCanvas` 和 `project-format-decode.ts::decodeProject`，补齐已读取的 indexed 面：ID 0 与可见 order 中的 ID 保留；隐藏或缺失 ID 按旧版透明 fallback、可见顺序及 alpha 距离权重二寻找颜色。RGBA 工程中的 indexed fallback 不做该重映射。

原生使用新的不可变 ManifestRaster DTO，按原 DTO 身份复用结果；字节相同的独立资源不合并，输入归档不修改。副本分配前计入现有解码字节预算，失败后仍可重新读取。uint32 大 ID 不截断成有符号 ID，超出原生色板表示范围的像素 ID 按缺失颜色处理。

这只保持相同 DTO 的共享关系，不宣称已承接不同 offset 的底层共享存储。特殊瓦片重绘、完整活动帧投影和索引色工具／合成／历史／保存尚未完成，不能把本阶段称为整个 decodeProject 等价。

## 验证

扩展既有夹具生成器，实际执行未修改的 legacy encodeProject／decodeProject，新增 48 组：indexed／RGBA × raw／sparse × ZIP 0／6 × 六种色板。覆盖隐藏与缺失颜色、空可见表、顺序平局、alpha 权重、透明隐藏颜色、非透明 ID 0、uint32 极值，以及共享 Cel、字节相等的独立 Cel 和独立 linked fallback。逐项核对每个 Cel、图层像素、format、order／slots 和原始归档。

原有 60 组存储／布局、四组混合格式与三组坏文件保持通过。新增原生副本预算不足拒绝、源数据不变及失败后正常读取检查通过。

五项 CTest 一轮全部通过（145.57 秒）：project-import、indexed-project-reader-oracle、indexed-project-reader、project-manifest、project-reader。唯一正式 Release 及关联测试构建成功；Editor／架构边界在正式构建中通过。本阶段没有 UI 改动，未新增程序交互或人工图像验收。

来源覆盖与快照检查通过，strict 继续因整体已登记缺口退出 1。整体迁移仍为 INCOMPLETE；保留用户数据、恢复、日志和构建缓存，阶段提交推送 dev，不提交生成物。
