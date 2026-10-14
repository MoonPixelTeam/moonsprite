# MoonSprite 平台与版本

一份共享编辑器，按平台（Windows/Web/Android/iOS/macOS）和版本（完整/体验）组合构建。`targets.json` 是目标清单；planned 目标尚未实现，不能用于构建。

```text
moonsprite/
  apps/targets.json        平台、版本和实现状态
  src/renderer/           共享编辑器、画布和交互
    src/platform/         浏览器与 Tauri 平台适配
  src/shared/             共享类型
  src-tauri/              Windows 原生宿主与打包配置
  out/renderer/           Windows 前端构建结果（兼容现有 Tauri 配置）
  out/web-trial/          独立 Web 体验版构建结果
```

官网已拆分为独立仓库 `../MoonspriteWebsite`（本地路径 `D:\Mine\Study\Work\学习工作\CodexWork\MoonspriteWebsite`），本仓库不再包含 `website/`，也不再提供 `website:dev` / `website:build` / `website:capture` 命令。官网与体验版是两个独立进程，协作方式见下节。

## Windows 完整版

`pnpm dev:windows` 启动桌面开发。`pnpm build:windows` 执行现有桌面打包流程。旧的 `dev:web` / `build:web` 命令保留为桌面前端内部命令，不能当作官网体验版发布。

## Web 体验版

`pnpm dev:web-trial` 单独启动体验版（http://localhost:5174/try/），`pnpm build:web-trial` 独立构建，`pnpm preview:web-trial` 本地预览。

官网在本仓库之外独立开发。编辑器与官网是两个进程：先 `pnpm dev:web-trial`（编辑器跑在 http://127.0.0.1:5174/try/），再在官网仓库用 `VITE_TRIAL_URL=http://127.0.0.1:5174/try/` 启动 `pnpm dev`，官网顶部“在线体验”即指向该地址；不覆盖该变量时链接默认指向站点内的 `/try/`。

发布由官网仓库负责：它把本仓库 `pnpm build:web-trial` 的产物 `out/web-trial` 组装进站点 `/try/` 子目录，因此必须保留该子目录及其资源，不能把该地址重写到官网首页。

体验版共享绘图和动画功能，不设置时长、画布尺寸或帧数限制。文件通过选择器或拖放导入，保存和导出触发浏览器下载；浏览器无法确认下载最终写入磁盘，也不会覆盖原文件。恢复数据和本地历史使用当前站点的 IndexedDB，清除站点数据会删除它们，请主动下载工程备份。资源库（笔刷、工作区等）的浏览器自定义项目目前仅在当前会话有效。原生文件夹、Lua、扩展、系统字体管理等桌面能力尚不支持 Web；对应适配接口保留现有不可用行为。

## 后续平台

Android、iOS、macOS 各预留 full/trial 两个目标，目前均为 planned。实际接入时增加该平台宿主、输入与文件适配、独立打包配置和测试，再修改状态。体验版限制应集中配置，共享核心算法无需复制。移动端适配与签名发布不因增加目标名称而自动完成。
