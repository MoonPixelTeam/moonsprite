# 索引色历史回放迁移

2026-11-14。只迁移 legacy 功能；整体仍 INCOMPLETE，生产索引色新建、转换、可编辑导入与工具入口保持关闭。

## 来源与实现

直接对照 `legacy/src/renderer/src/core/history.ts::commitPixelEdit`、`document-model.ts::writeLayerPacked/writeLayerPackedRun`。索引色回放沿用 runs → dense region → points；撤销逆序应用 runs。points/runs 按当前可见色板归一化 ID，隐藏但同色的 ID 匹配当前可见项，未知 ID 回退；dense region 直接复制捕获的 uint32，保留原始 ID。两种路径不能混为 RGBA 颜色写入。

捕获坐标保留 storage origin，回放按当前表面原点定位；run 从其有效起点按当前目标行宽截断，扩张后不按旧行宽拆分，裁切掉的起点跳过。失败补偿捕获相同的实际写入范围。原生在写入前准备 point/run 的归一化值，避免分配失败发生在部分写入之后；沿用现有 Document 事务和补偿，不增加另一套历史或整工程编解码。

准备元数据历史的临时 Surface 现在同时保留 format；否则附带图层改名等元数据的回放会把索引表面误改成 RGBA。原有非索引回放顺序及写入规则保留。

## 自动验证

Node TypeScript loader 实际调用未修改的旧版 `createDocument`、`beginPixelEdit`、`commitPixelEdit`、`expandLayerToRect` 和 storage origin 函数。4 种当前色板顺序 × 3 种几何（原状、扩张、裁切）× 4 种载荷（point、run、dense、混合），共 48 组，分别执行 redo/undo/redo；原生逐像素与真实旧版结果一致。覆盖隐藏同色 ID、未知 ID、空可见色板、零 ID 和 2147483647。

每组额外核对附带改名的回放、DocumentSnapshot 的模式/格式/原点/原始 ID/独立存储、rollback payload 恢复、两个关联图层与两个链接帧的存储共享。96 组正反向坏 sibling 在已有像素写入后触发真实补偿，检查原始字节、存储身份、名称、revision 与历史位置恢复，全部通过。

8 项定向 CTest 全部通过，13.09 秒：indexed-history-oracle、indexed-history、document-raster-history、document-transactions、document-snapshot、document-pixel-format、indexed-raster-codec-oracle、indexed-raster-codec。旧版真实 history.test.ts 的 15 项测试通过，8.55 秒。来源覆盖 948 文件与证据快照通过；strict 退出 1，保留全部其它已知迁移缺口。

唯一正式 `native/build/Release/moonsprite-native.exe` Release 构建成功，进程退出 0；构建内 Editor 边界 593 源文件、架构 593 源文件／249 targets 通过。最终 diff 检查通过。

## 剩余范围

本阶段仅覆盖同格式索引色像素历史。模式转换历史的 indexed 载荷仍受准入守卫限制，生产工具事务、完整 palette context、新建/转换/可编辑导入、sourceArchive 保存准入继续迁移。测试通过 friend 构造索引文档，不代表这些生产入口已开放。没有性能优化、UI 修改、人工图像或完整桌面验收；oracle、构建产物和用户数据不提交。
