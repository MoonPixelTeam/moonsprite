# 自由瓦片编辑笔刷预览迁移

来源：legacy `canvas-render-frame.ts` 的 canRenderToolPreview、`canvas-render-brush.ts` 的 free-tile edit 门禁和 idle selection、`canvas-render-shape-preview.ts` 的连接线以及 `canvas-render-brush-path.ts` 的局部替换和 repeat placements。`useCanvasTileTarget.ts` 明确仅限制 grid Tilemap Edit，free-tile 不套该限制。`canvas-render-free-tile-brush.ts` 是独立 Paint 放置预览，不属于本阶段。

原生此前 `rasterToolsAvailable()` 排除了所有自由瓦片，导致编辑模式无普通笔刷和 Shift 连接线预览。现在沿用旧版门禁接入已有 brushPreview 与局部替换合成，不改 rasterToolsAvailable 或实际事务；空闲轮廓不裁选区、连接线裁当前像素选区。各平铺副本显示同一局部预览。共享源的其它实例仍维持原像素，正式提交才依原资源事务更新。没有新入口、素材、布局或性能优化。

旧版定向测试：canvas-render-brush-path 与 canvas-render-brush-outline，2 文件共 14 项通过，8.80 秒。原生实际检查新增八组 Off/X/Y/Both × pencil/eraser、四种显示模式、链接帧、同源 sibling、选区、平移/采样/图层锁/指针移出及只读状态检查；原平铺 Shift 12 组加上 free-source 预览 alpha 验证。最终唯一正式 Release 构建成功。`free-source-preview` 实际进程退出 0，八组全部通过；`shift-lines` 实际进程退出 0，包含本轮新增的自由源预览 alpha 检查；既有 `brush-preview` CTest 通过（1.33 秒）。在显式锁定／解锁操作之前，检查像素、源资源、实例、链接、history、revision、dirty 和 renderer upload 均保持原值。来源覆盖 928 文件及快照、Editor 边界 587 源文件、diff 检查通过。未新增人工截图、全显示器或全部笔刷组合验收。

本阶段不宣称 Paint 放置预览、全部动态或图像/纹理组合、整套笔刷/瓦片或全部迁移完成。旧完整 free-tile-project 的特殊合并撤销断言仍登记在平铺连线阶段，未处理或降级断言。
