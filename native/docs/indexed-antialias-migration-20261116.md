# 索引色自动抗锯齿迁移（2026-11-16）

本阶段按实际 legacy `antiAliasSelection`、选中目标命令、合成采样和 `commitPixelEdit` 迁移普通 indexed 栅格自动抗锯齿。核对 legacy/LICENSE 的 MoonSprite Source-Available License 1.0，保持内部功能迁移范围。

## 算法和事务

沿用原算法、automatic／canvas／palette 三种颜色来源、自定义颜色、透明度、内部颜色开关与选区判断。源颜色按第一个同 ID 资源读取，合成按原 palette-aware 路径读取，内容范围按全部有 alpha 资源 ID 并集扫描。写入按当前可见色板最近色映射，不分配新资源。普通目标的自动采样排除背景，canvas 候选包含背景；背景自身作为目标时继续包含。顺序模拟多个目标，按共享 pixels 身份去重，保留关联图层和帧。

复用已有 SurfaceTask、稀疏扩张和 RasterColorContext。保留 indexed format、offset、storage origin 和画布外原始 ID，1×1 仅 ID0 作为空占位。索引色文档的蒙版编辑也捕获不可变色板，用于文档合成采样，蒙版本身继续按标量覆盖率写入。发布核对文档身份、代数、模式、色板、目标绑定、锁定和影响合成的元数据；取消、失败和内存预算超限不发布半完成结果。预算计算在减法前拒绝已超限快照。

用户已确认“取消不改作品”：取消完整恢复像素、色板和几何，修复实际旧版取消时重映射隐藏 ID 的缺陷。撤销重做仍沿旧版 PixelEdit：保留提交后的扩张几何，小编辑按当前色板归一化写入；至少256点且区域面积不超过点数3倍时使用原始 ID dense patch。撤销不恢复色板快照。没有 packed 修改时沿已有原生事务保持原几何；旧版即使没有编辑也可能扩张存储，此处不声明逐字节一致。

## 验证与范围

Node oracle执行未改动的旧版算法、PixelEdit 历史和实际预览命令。2268组结果／历史／取消对照覆盖六种色板、三种可见顺序、七种布局、三种来源和六种参数组合，其中381组实证旧版取消缺陷。另有45个背景上下层／背景目标／多目标／蒙版命令场景，以及改变当前色板顺序后的点历史和大区域历史。原生38组关联变体、三种生产编码器、共享去重、锁定批次、worker取消、过期代数／色板／合成上下文、跨文档、多owner和预算检查通过。

七项定向CTest全部通过（85.47秒）：free-tile-project、indexed-antialias-oracle、indexed-antialias、indexed-convolution-oracle、indexed-convolution、document-raster-history、filter-preview-controllers。旧版两个实际测试文件定向8项通过、90项跳过（9.19秒）。新增测试初次编译的夹具访问及字段名错误已修正，最终测试使用重建成功的程序。

正式Release构建退出0；唯一正式产物native/build/Release/moonsprite-native.exe于2026-11-16 00:58:42更新，30737408bytes。新正式程序selection-interactions通过（2.74秒）。来源978文件及证据快照、Editor595、架构595源码／263targets和diff检查通过；strict因整体已知迁移缺口退出1。生产 indexed 新建、转换和可编辑导入继续关闭，其他索引色组合和整体迁移仍 INCOMPLETE。仅功能迁移，无性能优化、UI改造或新增人工图像／完整桌面验收。保留用户数据、日志和缓存。
