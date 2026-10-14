# MoonSprite 初始实现计划（已归档）

本文件记录 2026-07-26 的初始开发目标，内容已不代表当前功能范围。

- [完成] 建立 Tauri、React、TypeScript 和构建工具。
- [完成] 实现像素、文档、工具、历史和文件格式核心。
- [完成] 建立工作台 UI、多文档和 Canvas 工作流。
- [完成] 接入文件、恢复、PNG I/O 和打包。
- [完成] 运行初始测试、视觉检查和发布验证。

初始架构选择为 Tauri 2、React、TypeScript 与 Zustand；RGBA 使用 `Uint8ClampedArray`，索引模式使用稳定的 `Uint32` 调色板 ID。
