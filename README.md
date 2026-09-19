# MoonSprite

中文 | [English](README.en.md)

MoonSprite 是面向 Windows 的原创源码可见像素画工作台，使用 Tauri 2、React、TypeScript、Zustand 和 Canvas 构建。项目与 Aseprite 无隶属关系，也不使用其源码、品牌或视觉资产。

当前 Beta 通道为 `1.0.0-beta4`，最近一次已打包版本为 `1.0.0-beta4`。

## 当前能力

- 像素绘制：铅笔、橡皮擦、图案笔刷、抖动模板、形状、渐变、油漆桶、魔棒、吸色、智能闭合与对称绘制。
- 选区与变换：矩形、椭圆、套索、多边形选区，以及移动、复制、翻转、缩放、旋转和多图层、多帧编辑。
- 颜色与笔刷：RGBA、索引与灰度颜色、前景色与背景色、自定义调色板、同步颜色、图案笔刷库和本地笔刷文件夹。
- 图层与动画：普通图层、背景图层、图层组、文本、蒙版、图层样式、多帧时间轴、洋葱皮和动画循环节。
- 瓦片工作流：可共享瓦片集的瓦片图层，以及允许重叠实例、同步编辑源瓦片的自由瓦片图层。
- 工作区：多项目标签、栏目停靠与悬浮、工作区保存、首页项目分类、异常恢复和多主题界面。
- 文件与导出：`.moonsprite` 工程、Aseprite 工程导入导出、常用图片与 GIF、PSD 工程导出、切片、精灵表和缩时视频。
- Windows 集成：系统剪贴板、文件关联、资源管理器缩略图和恢复草稿。
- 自动化：受限 Lua 5.4 脚本、Aseprite 兼容 API 子集、MoonSprite `mse.*` API 和可运行 `.msext` 扩展。

详细行为以 [产品行为契约](docs/product/behavior.md) 和 [交互契约](docs/README.md#交互契约) 为准。

## 脚本与扩展

普通 Lua 脚本放入程序运行目录的 `scripts/` 文件夹后，会显示在“文件 > 脚本”中。脚本运行在受限 Lua 5.4 沙箱内，可以读取当前文档状态，并通过事务执行可撤销的画布操作；不能直接访问文件、网络、进程或任意本地模块。

`.msext` 是 MoonSprite 的扩展包格式，支持两套执行模型：`schemaVersion: 1` 使用受限 Lua/MSE 快照事务与宿主渲染的声明式 UI；`schemaVersion: 2` 使用 Extension Runtime v1，可运行常驻的 sandbox HTML/JavaScript，并按清单权限贡献菜单、宿主组件设置或 sandbox 自定义设置页和 owner-bound 附属窗口。Runtime 不能访问 React、Zustand Store、Tauri、安装目录或内部文档对象；复杂文档写入仍通过受限 Lua 命令和 Store 事务完成。扩展可在“首选项 > 扩展”中安装、启用、禁用和卸载，也支持双击或拖入 `.msext` 文件安装。

- [Lua 脚本与扩展入门](docs/scripting/README.md)
- [MSE API 参考](docs/scripting/mse-api.md)
- [LuaLS 类型定义](docs/scripting/mse-api.lua)
- [.msext 扩展开发总览](docs/extensions/README.md)
- [Extension Runtime v1 API](docs/extensions/runtime-api.md)
- [扩展包格式与安全边界](docs/adr/0020-extension-package-format.md)

`app.*` 用于兼容已实现的 Aseprite API 子集，`mse.*` 是 MoonSprite 专属 API。脚本应使用能力探测确认端点是否已实现，不能把文档中列出的规划接口视为当前可用能力。

## 开发环境

- Node.js 22
- pnpm 11
- Rust stable
- Windows 10/11 与 WebView2 Runtime

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

连续开发只检查本次修改的文件：

```powershell
pnpm check:dev -- <本次修改的文件...>
```

受保护架构边界、发布与打包使用独立门禁，具体流程见 [AI 与开发自动工作流](docs/agent-workflow.md)。`pnpm package` 会在 `release/` 生成 NSIS 安装包和便携版；该目录不进入 Git，且只有明确需要交付安装包时才执行打包。

## 运行时目录

发行版会在 MoonSprite 可执行文件旁创建或使用以下目录：

- `gallery/`：首页画廊与默认工程保存位置。
- `exports/`：图片、动画、视频和调色板的默认导出位置。
- `brushes/`：用户图案笔刷与笔刷文件夹。
- `palettes/`：用户调色板。
- `BackgroundPresets/`：背景图层预设。
- `workspaces/`：工作区布局。
- `scripts/`：用户 Lua 脚本。
- `extensions/`：已安装扩展及启用状态。
- `Font/`：用户字体。

这些运行时目录不提交到仓库。源码仓库自身的 `scripts/` 保存开发与检查工具，不是发行版的用户脚本目录。内置资源位于 `src-tauri/resources/`，其中包含默认背景预设和示例工程。

## 许可

- 当前源码使用 [MoonSprite Source-Available License 1.0](LICENSE)：允许查看、修改、个人编译与源码形式再分发，但未经书面授权不得分发编译后的 MoonSprite。
- Steam 及其他授权渠道的官方二进制使用 [MoonSprite Official Binary EULA](EULA.md)，允许个人与商业创作，按用户席位授权。
- 已经以 MIT License 发布的历史版本继续保留原有权利，见 [LICENSE-MIT](LICENSE-MIT)。
- 第三方字体与依赖遵循各自许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 维护入口

- [文档索引](docs/README.md)
- [贡献指南](CONTRIBUTING.md)
- [变更记录](CHANGELOG.md)
- [产品行为契约](docs/product/behavior.md)
- [文件格式](docs/file-format.md)
- [发布检查表](docs/release/release-checklist.md)
