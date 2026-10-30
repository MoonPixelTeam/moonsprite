# 文字框缩放修饰键

## 旧版依据与适配

- `legacy/src/renderer/src/components/canvas-input-text.ts` 的 `moveTextTransform` 使用共享变换修饰状态，文字框不启用整数缩放。
- `legacy/src/renderer/src/components/useCanvasToolSession.ts` 从配置读取 `proportionalSelectionTransform`，同时接受平板约束键；从中心缩放使用 Alt 或平板中心键。
- `legacy/src/renderer/src/core/canvas-input-preview.ts` 定义共享状态的组合方式。

原生文字框改用已有 `moveModifierHeld` 与平板辅助状态。保留既有几何、文字重排、链接所有者、取消和历史事务，没有引入新快捷键。

## 范围与剩余差异

此次修复指针移动／释放时的修饰状态。旧版持久选区宽高比锁在原生没有对应会话字段，仍为缺口，不把本批修复称为整个变换系统完成；本批没有新增静止指针时仅按键即重算的行为。

## 验证

正式 Release 构建、`--text-tool-check` 和515文件来源检查通过。实际输入覆盖替换比例快捷键、旧 Shift 单键不再约束、平板比例／中心辅助、取消恢复、一次提交及撤销重做。本批未做人工图像验收。
