# 瓦片管理、渐变映射调整图层与缩时持久化

本批沿用 `dev` 和唯一正式产物 `native/build/Release/moonsprite-native.exe`，没有新分支、外部工程或 preview。以下实现范围与实际运行结果分开记录。

## 实现与来源

- 瓦片管理：复用 legacy `core/tilemap.ts`、`store/workspace-commands-tilemap.ts` 与 `components/panels/TilesetPanel.tsx`。稳定 ID 的增删、像素写入、槽位布局、未使用瓦片清理支持撤销重做；删除扫描全部 cel 权威引用，包括隐藏、锁定、禁用帧与共享资源。槽位历史仅保存元数据，资源变更仍沿用现有完整 State 事务，不能称为已完成旧版增量性能迁移。
- 面板：复用原生 shared column chrome、legacy 图标与 Skin 选择素材。支持主/副角色、Shift 矩形、Ctrl 显式选择、360ms 长按矩形、选框/右键选中内容拖动、Escape 与失去捕获取消、删除及右键清理未使用。绘制与边框命中统一使用显示器相对物理像素；逐像素 smoke 含奇数窗口原点。Ctrl-wheel 尺寸偏好、free-tile 权威数据与原已登记瓦片功能缺口仍保留。
- 渐变映射调整图层：legacy `workspace-commands-layer-creation.ts`、`workspace-commands-adjustment-layer.ts`、`GradientMapLayerDialog.tsx` 和 `document-composite-sampling.ts` 为行为依据。先创建新图层再打开既有渐变控件；取消恢复编辑前设置，新建图层保留。映射非破坏地作用于实时 backdrop，保留 alpha，图层透明度与蒙版作为映射强度，支持混合模式。含调整图层的组必须隔离；剪贴调整映射链内颜色，调整图层作为基底时不收集其后剪贴层。独立复制、历史与原生工程保存重开均保留设置，导入兼容旧 `layerStyles.gradientMap` fallback。其他调整层与图层样式仍未迁移。
- 原生必要适配：Timeline 不含文档尺寸，新增仅运行时 canvas 尺寸上下文，由 Document 的 timeline/display 访问及 publish 同步，快照与 display shell 传递；工程 schema 不增加重复字段。现有渐变采样器、预设 codec 和控件直接复用。ASE 保存继续通过既有可编辑信息丢失检查。
- 缩时：legacy library service 的 Promise barrier 迁移为逐帧 worker IO 与 UI Timer 等待。内嵌 PNG 在 durable acknowledgement 前保留原字节；每 tick 最多扫描 256 个记录，不复制整段历史，失败只在显式保存/关闭 flush 时重试。clear/rollback generation 拒绝旧结果。vector ownership 需要单帧 payload 副本，受现有 32MiB 限制。等待弹窗复用 PixelDialog，不增加取消产品行为；文件选择与 portable 既有取消不变。

## 验证

本批统一串行构建日志：`native/build/integration-management-gradient-build-20261022.log`。
实际结果（2026-10-22）：

- 串行构建 `integration-management-gradient-build-fix-20261022.log` exit 0；最后仅修改检查夹具并增量构建 `integration-management-gradient-final-20261022.log` exit 0。首轮 ordinary Widget 的焦点 API 错误已改为公开 `setFocusStop`；没有更换或复制正式产物路径。
- `tilemap-document-tests` exit 0：稳定 ID 增删、槽位元数据历史、共享／隐藏／锁定／禁用帧引用、角色恢复、clear-unused/no-op/保留首瓦片。
- `tilemap-project-tests` exit 0：稀疏槽位保存、删除后重开、undo 恢复、渐变 alpha128 预览／取消／提交／历史／独立复制、组隔离、剪贴、黑蒙版、disabled、画布外不映射，以及已有 tilemap → 新渐变层 → undo/redo → 重开仍保留原 cell、tile IDs 和权威 pixels。
- `timelapse-tests` exit 0：后台旧 PNG durable ack、重复 flush 不增加文件字节、失败保留和显式重试、clear 与 rollback 拒绝 stale 结果；测试夹具保留于仓库下 `timelapse-test-owned-16065638317500`。
- `moon-core-tests`、`layer-group-compositor-tests` exit 0。已通过目标没有无理由重复运行。
- 正式 exe `--tileset-management-check` 实际进程 exit 0：真实 Grid 消息、360ms 长按、Shift/Ctrl、轮廓与右键拖动、Escape／失捕／外部焦点、共享删除与右键清理；不同尺寸及奇数物理原点逐像素 alpha/hit 一致。同一检查调用真实新建渐变菜单及已有渐变控件，确认取消保留创建、应用提交元数据。
- `native/start-native.bat` 经 cmd 显式调用实际启动成功，窗口 `MoonSprite Native - Development`，路径为唯一 Release exe，检查后保持打开。
- provenance 覆盖 465 文件，exit 0；`--strict` exit 1，保持已知迁移缺口，不能视为全部行为等价。

正式产物 SHA256：`6971739A7A24A900776E8E6B9579CC767F1D744F21767D065550616A5972C807`。

源码／来源检查和上述实际运行均已完成。界面检查覆盖本批瓦片与渐变操作及边框渲染，不等于全部工作区的人工截图验收；缩时等待弹窗已编译，后台持久化有实际回归，本批没有人工操作长录像保存等待弹窗的图像验收。仍保留文中列明的旧版功能与性能迁移缺口。
