# 2026-10-22 原生瓦片与缩时录像接线

唯一正式程序为 `native/build/Release/moonsprite-native.exe`，入口仍为 `native/start-native.bat`。本轮未提交、打包或发布；既有用户差异、恢复数据、录制库与测试产物均保留。

## 瓦片：已保存的实现范围

共享 tileset/tile 稳定 ID 与逐 cel 网格为权威数据，栅格 surface 仅为合成缓存。新建／转换图层、现有 pencil／eraser 的 create/hybrid/edit/paint 模式、主／副瓦片选择、取消、单次历史事务、schema 21 原始瓦片集资源及 sparse cells、保存重开、快照和原生瓦片集栏目均已接线。新图层位置通过分离的 Document 调用既有 addLayer 获取，模式素材取自 legacy PixelUtilityIcon，经既有无损转换器处理。

未迁移的 resize、clipboard、frame structure、合并、全局栅格滤镜等入口由 Document 门禁拒绝，菜单同步禁用。完整瓦片集管理／重排／拖动、ASE 瓦片导入导出、实时 tile brush 细节、legacy 增量历史与缓存性能仍有缺口。当前完整 Timeline 历史事务与 tile edit 后缓存重建不宣称性能等价。

剪贴洋葱皮的瞬时显示副本仅借用已提交 raster cache，并将副本中的 tilemap 图层头投影为普通 raster 头，避免复制瓦片集像素。源 Timeline 的瓦片权威数据不变；该副本没有编辑、保存或历史入口。

## 缩时录像：已保存的实现范围

Document 提交观察器、dirty revision union、不可变 64×64 tiles、后台 PNG／持久化队列、录制设置与工程 JSON、新建画布默认开关及预设、播放预览、PNG／JPEG 序列导出、普通本机引用与 portable Save As 均已接线。录制库位于正式程序旁的 `timelapse-v1`，仅在新位置缺失时读取旧 `%APPDATA%/art.moonpx.moonsprite/timelapse-v1`。smoke 与专项测试使用自己的目录。

持久化结果在元数据提交成功前保留，错误阻止后续帧越过失败帧；显式 flush 仅进行一次重试。回档 payload 保存录像 Settings，恢复与撤销／重做均推进 Session generation，使旧异步结果无法覆盖恢复后的引用。批量删除附加蒙版在整个操作期间抑制中间录制观察。

MP4／WebM 编码尚未迁移。旧 embedded PNG 首次转本机库仍同步 append／flush，后续 flush 仍逐帧扫描，尚未承接 legacy 异步磁盘迁移和 cursor 性能。当前画布上限 1024²，捕获源至多 4 MiB，与 legacy 小画布同步准备分支一致；更大画布跨 tick 准备不在当前已接纳范围内。稀疏采样与原生 compositor 的性能差异也不宣称等价。

## 验证记录

首次 timelapse 专项与现有 manifest fixtures 已运行 exit 0。随后新增回档 generation 回归并接入瓦片，因此须以最终合并构建和运行记录为准，不能把早先通过当作本轮最终验收。

来源覆盖检查已通过 464 个源码、测试与脚本。strict 必须仍失败，表示已知迁移缺口；来源覆盖不代表运行或行为等价。

最终配置／构建日志：`native/build/integration-configure-20261022.log`、`native/build/integration-build-20261022.log`。最终合并后以下目标均已构建并实际运行 exit 0：

- `tilemap-document-tests`：转换、create/hybrid/edit/paint、共享源更新、取消、撤销重做、快照、拒绝无效引用。
- `tilemap-project-tests`：实际 schema 21 编码、读取、导入、重存，权威数据、画面与稳定 ID 保留。
- `timelapse-tests`：录制 dirty union、多段笔触、undo 设置、分离副本、portable、PNG 序列、库 CRC／范围，以及 pending capture→rollback→undo→flush→redo 的 generation 隔离。
- `moon-core-tests`、`layer-group-compositor-tests`、`project-manifest-tests`（现有 fixtures）。

正式 app 已构建成功并从唯一入口 `native/start-native.bat` 启动检查通过；`--clipping-mask-check` 实际运行 exit 0。最终 exe SHA256 为 `DC77674798E1AFD9A01BDF577BAD1593E01A34BB59283B0525AF38A056702E6C`。


### 2026-10-25 关联瓦片语义边界校正

- 跨图层 `linkedContentId` 瓦片不是 legacy 支持能力，不列为待迁移功能。`legacy/src/renderer/src/core/linked-layers.ts` 的 `isLinkableRasterLayer` 仅接受普通非背景栅格层；`normalizeLinkedLayerMetadata` 会移除特殊层的关联标记。`animation-cel-resolver-cache.ts` 也不解析跨图层 Cel 链。
- 同图层显式 `linkedCelId` 链与跨图层关联不是同一能力。Paint 静态选区 Cut 按 `workspace-commands-clipboard.ts` 的顺序复制解析后源的像素与 mask，再调用删除并完成选区；`workspace-commands-history.ts` 拒绝 Paint 像素删除，因此 owner、格引用、缓存与历史保持不变。锁定时仍复制并清选区；透明选区清图像剪贴板并完成选区。非 Paint 的关联像素 Cut 不随本板块放开。
- 此段记录语义与实现边界；构建、核心回归和实际 UI 验收结果单独报告。
