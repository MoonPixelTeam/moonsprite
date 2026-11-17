# 特殊图层资源替色迁移

旧版依据：`legacy/src/renderer/src/store/workspace-commands-color.ts::applyColorReplacementTarget` 确定图层、选区、文档、帧和 Cel 目标，跳过锁定目标并去重；`core/tools-fill.ts::replaceLayerColor` 精确匹配颜色，选区按画布裁切。旧版只写瓦片缓存；用户已明确批准同步修改实际资源及全部共享引用，包括锁定图层。

实现复用现有替色目标解析、AdjustmentPreview 和 synchronizePaletteResources。新增可选 owner 目标和世界坐标选区谓词，网格按 sourcePoint 映射翻转／旋转单元格，自由实例按既有 transform 及源偏移映射；选区决定资源像素，资源修改刷新全部引用。预览不修改稳定文档，取消及关闭实时预览回到基线；提交复用已有完整 timeline 历史快照，普通像素与特殊资源在同一事务中保存。

正式 Release 构建成功；`--free-tile-transform-check` 退出 0。新增实际菜单四场景覆盖网格／自由瓦片 × 整层／选区，验证精确资源改色范围、稳定资源与预览隔离、取消、锁定共享层缓存更新、单次提交、Undo／Redo 及实际文件保存重开。沿用既有目标作用域与几何算法验证，本批未重跑全仓回归、未新增人工图像验收。来源覆盖检查仅证明登记完整，不代表整体行为等价；生产 indexed 准入及其它迁移缺口继续保留。
