# 索引色描边迁移（2026-11-16）

本阶段依据实际 legacy `outlineSelection`、`outlineSelectionBoundary`、`outlinePixelSamples`、描边命令和 `commitPixelEdit` 迁移普通 indexed 栅格描边。已核对 legacy/LICENSE 的 MoonSprite Source-Available License 1.0，保持内部迁移范围。

## 算法与事务

保留内部／外部／两侧、四种 kernel、八方向、厚度取整与上限、背景排除、选区裁切回退和参考颜色距离／排序规则，沿用智能色相和跟随透明度算法。内容范围按有 alpha 资源 ID 并集计算，颜色读取首个同 ID 资源，写回当前可见色板最近色，不分配资源。普通快捷入口沿用当前前景色并关闭智能色相，S 选区边界仍独立，不覆盖保存的位置设置。

复用 OutlineTask、RasterColorContext、稀疏扩张和现有索引色选区历史 helper；将 helper 提取到 indexed_pixel_history.h 共享，保留原阈值及回放语义。indexed 先扩张到覆盖画布，保留 format、offset、storage origin 和画布外原始 ID，1×1 ID0 为空占位。所有目标准备完成后安装候选 Timeline，后台提交使用已验证且包含扩张几何的 draft。蒙版继续写标量覆盖率，不改 owner 的 indexed 数据。

PixelEdit 小点历史按当前色板归一化，至少256点且 region 面积不超过点数3倍时使用 raw ID dense patch。Undo 保留扩张后的几何与缺失 Cel 的身份，不恢复色板快照。预览取消保持原始 ID、色板和几何，沿用用户已确认的“取消不改作品”。无 packed 修改时保留既有原生几何；旧版可能在无编辑时扩张存储，因此不声明无操作几何逐字节相同。

后台任务捕获色板，发布／提交检查 completed、身份、代数、模式、精度、完整色板、活动目标及选区；取消和预算拒绝不发布半完成结果。RGBA／grayscale 保留既有描边事务。

## 验证与范围

Node oracle执行未修改的旧版描边算法和真实 PixelEdit 历史：4732组涵盖六种色板、三种可见顺序、七种布局、四种 kernel、三种位置、不同方向／透明度／智能色相参数，以及选区边界和改变当前色板顺序后的点／dense 历史。原生60组关联图层／链接帧变体检查共享存储，验证预览、取消、重复预览、直接命令、后台提交和 Undo／Redo；三个生产编码器核对 raw ID，生产可编辑 indexed 导入仍拒绝。

补验未执行／取消／过期身份、代数、模式、色板、执行中取消、预算拒绝原子性、共享去重、多 owner 单次历史、锁定批次、缺失 Cel，以及 indexed 文档标量蒙版与既有 RGBA 标量路径的一致性。新增蒙版夹具初次使用公开创建入口被内容准入拒绝；改为与既有索引色测试相同的直接构造蒙版夹具，不扩大本阶段生产准入范围。

12项重建后的定向CTest全部通过（39.58秒）：document-pixel-format、indexed-outline-oracle、indexed-outline、indexed-antialias-oracle、indexed-antialias、indexed-symmetry-oracle、indexed-symmetry、indexed-selection-oracle、indexed-selection、document-raster-history、outline-samples、outline-document。旧版定向测试14项通过、85项跳过（7.43秒）；tools.test.ts通过，outline-color-preferences.test.ts因筛选跳过，不计为执行通过。来源覆盖981文件及证据快照、Editor596、架构596源码／264targets与diff检查通过；strict因整体已知缺口退出1。正式Release构建退出0；唯一正式产物native/build/Release/moonsprite-native.exe于2026-11-16 02:06:15更新（30,740,480bytes）。新正式程序 --outline-check 通过（1.93秒），selection-interactions通过（2.91秒；CTest总计2.95秒）。本阶段合计13项不同定向CTest和一个直接界面诊断入口通过。生产 indexed 新建、转换和可编辑导入继续关闭，整体迁移保持 INCOMPLETE。本阶段仅功能迁移，无性能优化、UI改造或人工完整桌面／图像验收。保留全部用户数据、日志和缓存。
