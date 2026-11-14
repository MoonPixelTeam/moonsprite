# 灰度颜色模式生产接入

日期：2026-11-14。范围：功能迁移。整体迁移仍 INCOMPLETE。

## 旧版依据

- `legacy/src/renderer/src/core/document-model.ts` 的 `normalizeDocumentColor`、`normalizeLayerPackedValue`、`documentRasterSurfaces`、`convertDocumentColorMode`：灰度使用四字节 RGBA 存储，按相对亮度转换 RGB，保留 alpha；转换包括透明像素中的 RGB，并按存储身份去重。蒙版和独立瓦片源不参与转换。转回 RGBA 不再次应用像素格式量化。
- `legacy/src/renderer/src/store/workspace-document-history.ts:268–319`：颜色模式转换使用独立模式、色板及图像快照，不回放当前帧和项目选择。`workspace-commands-document-io.ts` 提供转换入口；`workspace-commands-color.ts` 的像素格式偏好只转换 RGBA 工程。
- `legacy/src/renderer/src/core/tilemap.ts`、`core/free-tile.ts` 与 `components/canvas-render-free-tile-brush.ts`：从瓦片资源取得颜色后，先按文档模式归一化，再参与混合，保留源资源。
- `legacy/src/renderer/src/components/NewDocumentDialog.tsx`、`core/new-document-presets.ts`：新建模式按钮、预设模式和提交入口。原生继续采用用户指定的 pixel-core-32 默认色板。
- `legacy/src/renderer/src/store/lua-script-service.ts`：脚本文档上下文、创建文档和结果回写携带颜色模式。工程编码、恢复和本地历史继续保留模式元数据。

复用限于仓库 legacy Source-Available License 1.0 范围；没有复制新的 Aseprite 代码。

## 原生接入

Document 保存 RGBA／灰度模式，写入与现有工具预览共用对应颜色归一化。packed 写入保留 alpha=0 的隐藏 RGB；直接颜色写入转换全部 RGB。转换成为一个可撤销事务，保存模式、色板数据、拥有像素的 Cel 表面和蒙版，保持共享存储及当前帧、当前选择。灰度工程忽略 RGBA 像素格式偏好变更。

普通、恢复和本地历史工程支持灰度保存重开；DocumentSnapshot、工程回滚、本地历史比较与成本图、Lua／MSE 上下文及脚本创建结果传播模式。新建对话框及 workspace document.create 接入灰度与预设；现有转换菜单开放 RGBA／灰度。网格和自由瓦片渲染、实例属性预览及资源重新生成按模式处理显示，独立资源保留颜色。

## 实际验证

- 唯一正式 `native/build/Release/moonsprite-native.exe` Release 构建成功。以 `MOONSPRITE_TILE_REPEAT_CHECK_PHASE=grayscale` 实际运行 `--tile-repeat-check`，进程退出 0，trace 包含八种像素格式及 grayscale-create。覆盖真实转换菜单、Undo／Redo、鼠标绘制、workspace 新建、新建对话框按钮、预设、录制设置及提交入口。
- 最终八项定向 CTest 全部通过，耗时 12.76 秒：relative-luminance、document-color-mode-oracle、document-color-mode、document-snapshot、color-adjustment、document-pixel-format、document-raster-history、lua-script-invocation。
- document-pixel-format 包含八格式灰度工具预览／提交／取消、转换历史、透明 RGB、链接帧及关联图层存储、蒙版与资源边界、快照／回滚、普通／恢复／本地历史重开，以及网格尺寸修改和自由实例叠加／移动／Undo／Redo。最后一个失败是夹具未进入实例视图；补齐既有生产入口后通过，未修改生产守卫。
- Lua 通过真实脚本检查 `ColorMode.GRAY`、MSE 模式、`Sprite(..., ColorMode.GRAY)`、graya 像素及保存重开。旧 moon-phase 示例脚本只支持 RGBA，不能用它代替灰度验收。
- legacy 的 workspace 灰度撤销测试通过（1 项，96 项未选中）；直接执行未修改 legacy 模块的八格式转换／共享存储／隐藏 RGB／快照恢复 oracle 八组通过。共用颜色模式算法 oracle 同时在最终 CTest 中通过。

没有新增人工图像或完整桌面操作验收；自动入口检查不能替代这些验收。

## 仍需迁移及核对

索引色仍禁用，稳定颜色 ID 与原生 slot0 的差异尚未解决。灰度接入不等于全部工具、特殊图层与笔刷组合已逐项验收。

旧版颜色模式历史还捕获自由实例元数据、源偏移及自由瓦片集几何／像素；本阶段原生转换历史未增加这些不被转换修改的资源快照，尚未专门证明相关操作交错时的全部等价性。旧版自由瓦片已合成缓存的整体灰度转换，与重新渲染时逐源灰度可能不同，本阶段保留旧版路径，未宣称消除该差异。

来源覆盖与快照检查只证明登记完整，`--strict` 仍须因其它已登记迁移缺口失败。保留用户数据、构建缓存和日志；不打包或发布生成物。
