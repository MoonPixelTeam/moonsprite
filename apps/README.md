# MoonSprite 平台与版本

一份共享编辑器，按平台（Windows/Web/Android/iOS/macOS）和版本（完整/体验）组合构建。`targets.json` 是目标清单；planned 目标尚未实现，不能用于构建。

```text
moonsprite/
  apps/targets.json        平台、版本和实现状态
  src/renderer/           共享编辑器、画布和交互
    src/platform/         浏览器与 Tauri 平台适配
  src/shared/             共享类型
  src-tauri/              Windows 原生宿主与打包配置
  website/                官网，包含在线体验入口
  out/renderer/           Windows 前端构建结果（兼容现有 Tauri 配置）
  out/web-trial/          独立 Web 体验版构建结果
  website/dist/try/       官网发布包中的体验版
```

## Windows 完整版

`pnpm dev:windows` 启动桌面开发。`pnpm build:windows` 执行现有桌面打包流程。旧的 `dev:web` / `build:web` 命令保留为桌面前端内部命令，不能当作官网体验版发布。

## Web 体验版

`pnpm website:dev` 同时提供官网和 `/try/` 体验版，官网顶部“在线体验”会在新标签页打开编辑器，无需额外启动服务。官网开发模式下体验版修改后需手动刷新。也可用 `pnpm dev:web-trial` 单独启动体验版（http://localhost:5174/try/）。

`pnpm build:web-trial` 独立构建，`pnpm preview:web-trial` 本地预览。`pnpm website:build` 构建官网及体验版，部署整个 `website/dist` 到站点根目录即可；必须保留 `/try/` 子目录及其资源，不能把该地址重写到官网首页。当前没有自动上传到托管平台。

体验版共享绘图和动画功能，不设置时长、画布尺寸或帧数限制。文件通过选择器或拖放导入，保存和导出触发浏览器下载；浏览器无法确认下载最终写入磁盘，也不会覆盖原文件。恢复数据和本地历史使用当前站点的 IndexedDB，清除站点数据会删除它们，请主动下载工程备份。资源库（笔刷、工作区等）的浏览器自定义项目目前仅在当前会话有效。原生文件夹、Lua、扩展、系统字体管理等桌面能力尚不支持 Web；对应适配接口保留现有不可用行为。

## 后续平台

Android、iOS、macOS 各预留 full/trial 两个目标，目前均为 planned。实际接入时增加该平台宿主、输入与文件适配、独立打包配置和测试，再修改状态。体验版限制应集中配置，共享核心算法无需复制。移动端适配与签名发布不因增加目标名称而自动完成。
