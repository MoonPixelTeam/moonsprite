# MoonSprite

一个仓库，两个版本目录：

| 目录 | 用途 |
| --- | --- |
| [legacy/](legacy/README.md) | 当前 Tauri/React 版本；功能 Demo、行为和文件兼容性对照 |
| [native/](native/README.md) | 全新原生版本；先建立严格需求，再按新目标重构 |

现有版本启动：进入 `legacy/` 运行 `pnpm dev`，或双击其中的 `start-moonsprite-dev.bat`。安装依赖、构建和旧版检查也在 `legacy/` 执行。

原生版已有[首个绘图原型](native/README.md)，从 `native/start-native.bat` 启动；目前作品只在内存里，尚无工程保存。需求与后续验收见[需求基线](native/docs/requirements-baseline/README.md)。Git 历史、远程与分支保留；`.git`、`.github` 和根管理文件不属于业务版本。

迁移未删除旧依赖、构建结果或用户资源。Git 尚未提交时可能显示旧路径删除和新目录未跟踪，这是目录重排的工作区状态。

软件授权见 [legacy/LICENSE](legacy/LICENSE)、[legacy/LICENSE-MIT](legacy/LICENSE-MIT) 与[第三方声明](legacy/THIRD_PARTY_NOTICES.md)。新引入的 MIT UI/laf 仍需固定版本并单独记录许可。
