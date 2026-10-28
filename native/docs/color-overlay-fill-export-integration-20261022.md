# 颜色叠加、瓦片填充、缩时图片导出集成验收

本批在原 checkout 保留用户差异，唯一写入者串行应用各 owner 完整补丁；没有创建分支、工作树或 preview，没有提交、发布或删除用户数据。

## 颜色叠加图层样式

依据 `legacy/src/shared/types-layer-style.ts`、`core/layer-styles.ts` / `.test.ts`、`components/LayerStyleDialog.tsx`、`store/workspace-commands-layer-properties.ts`、工程 encode/decode 实现颜色叠加子集。默认色 RGBA(41,121,255,255)，默认效果关闭，总开关保留配置。颜色 alpha 插值 RGB，保留源 alpha。组样式先隔离子内容，再应用组蒙版、样式、opacity/blend/clipping；栅格层沿用同一可观察次序。

原生复用 PixelDialog、DialogLayout、NativeColorPicker、PixelCheckbox/Entry，接通原样式菜单、总开关、复制/粘贴/清除；多 owner 预览还原各自基线，取消无历史，应用单次元数据历史，重复应用无操作。已有整层/组复制携带独立值，schema21 保存重开保留开关、颜色及禁用的旧版其他样式 JSON。启用但尚不支持的其他效果仍拒绝可编辑导入。渐变调整图层保持上一批逻辑。

## 瓦片像素模式填充桶

依据 legacy `core/tilemap-document.ts` 的 `convertTilemapPixelEdit`、`store/workspace-commands-history.ts` changedTileId 角色、`workspace-session.ts` 工具门禁，复用现有 fillCanvasAt/fillPatternCanvasAt。Create/Hybrid/Edit 可填充，Paint 仍拒绝；附加蒙版先走原蒙版路径。保持选区、对称、容差、连接性、可见层采样、图案、左右颜色、Escape 取消、单步撤销重做。共享资源更新包含隐藏/锁定层及禁用帧。提交仍采用现有全 State 资源历史和全引用缓存重绘，不能声称性能等价。

## 缩时 PNG/JPEG 图片序列导出

依据 legacy `components/dialogs/TimelapseExportDialog.tsx`、`core/timelapse.ts`、`core/file-preferences.ts`、`store/document-file-service.ts`、`core/export-protection.ts`。使用现有全局缩放默认值及预设，按各帧尺寸最近邻缩放后调用共享导出保护，再送 PNG/JPEG encoder。100% 及以下保留原保护旁路。摘要按首个最大长边帧计算，不统一重设各帧尺寸。保留冲突规划、取消和部分输出；仅全部成功后通过现有 helper 记录最后真实输出路径。

## 自动验证

下列实际程序均 exit 0：`tilemap-document-tests`、`tilemap-project-tests`、`timelapse-tests`、`layer-group-compositor-tests`、`moon-core-tests`。

新增回归包括：颜色叠加 alpha128 数值、mask/clip/blend/组隔离、预览开关/取消/无操作/history/独立复制/保存重开；瓦片与现有 raster 算法对照、变换及共享引用、失败不污染、撤销保存重开；真实 PNG 逐像素、JPEG 编码字节与既有静态导出比较、100% 旁路、源像素/历史/dirty 保持。

来源覆盖 466 文件 exit 0；`--strict` exit 1，已有已登记缺口仍保留。覆盖通过不代表完整行为等价。

首次串行构建的唯一错误为 smokeColorOverlay 的 private 声明；已移至既有 public smoke 区域，五个测试实际通过后仅重编正式 app。构建/各测试日志为 `native/build/integration-overlay-fill-export-*-20261022.log`。

## 范围与剩余缺口

本批不包含其他图层样式、样式拆分；瓦片 shape/gradient/free-tile 等未迁移工具仍保留门禁；视频 MP4/WebM 与大画布协作捕获尚未闭合。未进行完整 1×/2×、窗口最大化/奇数原点、各类弹窗与停靠/悬浮截图人工验收；自动布局/行为通过不能替代这些图像验收。

正式 app 构建、真实 smoke 及唯一入口启动结果在完成后追加。

## 正式程序交付结果

- 正式 app 串行最小重编 exit 0；固定产物 native/build/Release/moonsprite-native.exe。
- 实际进程 --color-overlay-check exit 0：共享对话框控制与提交、总开关、复制、清除、粘贴。
- 实际进程 --tileset-management-check exit 0：原管理检查、上一批渐变调整检查，以及本批真实桶入口左右颜色、松手、Escape、Paint 门禁。
- native/start-native.bat 成功启动正式 Release 路径，窗口 MoonSprite Native - Development，观察 PID 43600；保持打开供用户使用。
- 程序大小 17826304 bytes；SHA256 98801E9786EB3A66F2681C5F619082B7A2095AAE8A4B1D460585333D23177DF3。
- 两个 smoke 本身均返回 0；包裹 shell 最后读取不存在的错误文件返回 1，不是 app 失败。没有生成本批错误报告。
