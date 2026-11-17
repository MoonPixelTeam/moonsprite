# 瓦片图像／画布几何菜单迁移补齐

状态：本阶段迁移完成。唯一正式 Release 构建、`--image-resize-check` 和 `--canvas-resize-check` 均退出 0；整体迁移仍未完成。

实际旧版依据 workspace-commands-document-io.ts 的 resizeActiveImage、resizeActiveCanvas、cropActiveCanvas、trimActiveCanvas、trimActiveCanvasCurrentFrame。沿用旧版选区矩形裁切、可见合成内容边界、全帧／当前帧区分、同尺寸无操作和事务规则；网格图像缩放采用用户已批准的资源与网格尺寸同步修复。

现有 Document::resizeResourceImage、resizeBackgroundCanvas 和 cropCanvasRegion 已迁移自由／网格资源几何及历史，尺寸弹窗也已具备支持。菜单残留条件仍禁用自由瓦片图像大小／画布大小，以及自由／网格层的裁切／两种修剪。原先部分专项调用 menuCommands，绕过 PixelMenuItem::available，不能证明真实菜单可用。

本阶段移除这些过时条件，复用现有弹窗、事务、资源和素材。既有专项增加真实菜单可用性检查；资源图像大小、裁切和两种修剪通过菜单 Click 执行。保留尺寸取消／应用、关联 Cel 原始 owner、资源身份与像素、Undo／Redo 检查，不重复已通过的底层旧版 oracle。

范围仅已迁移几何功能的入口与整条操作链，不解禁剩余滤镜、旋转或其它不在本阶段的自由瓦片操作。没有新布局、素材、性能优化或整体迁移完成声明。

验收：2026-11-17，两个正式专项连续执行均退出 0。自由／网格图像大小通过真实菜单打开、取消并再次应用；画布大小检查真实菜单可用性并执行已有弹窗取消／应用；裁切、当前帧修剪、全帧修剪通过真实菜单 Click 执行。检查尺寸、关联 owner、原资源像素／身份及 Undo／Redo。来源覆盖 1042 文件和旧版证据快照、diff 通过。没有重跑已有底层 oracle、执行全仓回归或新增图像人工验收。
