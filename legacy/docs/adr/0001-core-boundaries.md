# ADR 0001：把可验证规则集中到 core

中文 | [English](0001-core-boundaries.en.md)

## 状态

已接受。

## 背景

`App.tsx`、工作区 store 和画布组件长期累积了快捷键、首选项、工程格式和历史规则。继续在这些大文件中追加逻辑，会让用户可见功能与内部状态互相耦合，也会让回归测试必须启动整套界面。

## 决策

- 快捷键规则放在 `core/shortcuts.ts`。
- 编辑器首选项的默认值、解析、范围限制和持久化放在 `core/file-preferences.ts`。
- 撤销栈只维护文档编辑历史，并由 `HistoryStack` 保证内存计数不变量。
- `.moonsprite` 清单统一经过 `PROJECT_SCHEMA_VERSION` 和 `migrateProjectManifest()`。
- React 组件只负责显示和派发意图，不能复制这些规则。

## 结果

新增快捷键、设置或工程字段时，可以先写纯函数测试，再接入界面。未来格式升级可以增加迁移分支，而不需要重写整个解码器。视图和窗口布局仍然可以独立持久化，不会污染文档撤销历史。
