# MoonSprite

中文 | [English](README.en.md)

MoonSprite 是面向 Windows 的原创源码可见像素画工作台，使用 Tauri 2、React、TypeScript、Zustand 和 Canvas 构建。项目与 Aseprite 无隶属关系，也不使用其源码、品牌或视觉资产。

当前源码版本为 `1.0.0-beta4`（Beta 通道），最近一次已打包版本为 [`1.0.0-beta4`](docs/changelog/1.0.0-beta4.md)。下列能力以当前源码实现为准；已打包版本的变更范围见对应更新记录。

## 当前能力

### 绘制与图像处理

- 绘画工具：铅笔、喷枪、橡皮擦、平滑笔刷、直线与曲线、形状、渐变、油漆桶、魔棒和吸色；支持完美像素、智能闭合、对称绘制与纹理填充。
- 笔刷与颜色：图片笔刷库、从选区创建笔刷、抖动模板、压感与速度动态；RGBA、索引与灰度模式，自定义调色板、同步颜色与颜色替换。
- 选区与变换：矩形、椭圆、套索、多边形选区及组合选区，移动、复制、翻转、缩放和旋转；支持多图层、多帧与多 cel 共同编辑，以及矩形、椭圆选区和形状的中心绘制与可调绘制锚点。
- 轮廓与调色：液化推动、膨胀、收缩与扭转，描边、自动抗锯齿，色彩平衡、亮度/对比度、色相/饱和度与曲线；提供 CRT、VHS、暗角、辉光和 LCD 风格滤镜。
- 尺寸处理：画布边距与锚点调整、图像缩放、像素倍率检测、按选区裁切，以及按当前帧或全部帧修剪透明边缘。

### 图层与动画

- 图层结构：普通像素图层、背景预设、图层组、混合模式、剪贴蒙版，以及逐帧的图层/图层组蒙版；关联图层共享像素，同时保留各自的位置与显示属性。
- 可编辑文本：自动大小文本与固定区域自动换行文本框，支持字符颜色、字号、字间距、行间距及字体导入。
- 图层样式：描边、阴影、内发光、颜色叠加与渐变叠加，支持智能描边、智能阴影、实时预览及样式拆分。
- 时间轴：帧与 cel 的多选、排序、复制和关联，洋葱皮、独立预览播放，以及支持嵌套、播放方向和重复次数的动画循环节。
- 自动补间：以单帧或循环节为来源，生成位移、旋转、缩放与不透明度过渡，支持缓动和终点预览；这是几何补间，不会自动重画角色姿态。

### 瓦片与画布辅助

- Tilemap：瓦片图层与共享瓦片集，支持瓦片编辑、复用和整理。
- 自由瓦片：源瓦片与可重叠实例分离，修改源会同步更新引用；实例可独立移动、旋转、镜像、调整不透明度与混合模式，并支持多选和批量管理。
- 绘制辅助：无缝平铺、像素网格与自定义网格、网格和智能对齐、相对明暗、ISO 参考线与强制线条对齐；支持视图旋转、镜像和可关闭的画布滚动条。

### 工程、导出与缩时录像

- 工程与恢复：`.moonsprite` 完整工程、增量保存、异常恢复草稿，以及开启工程备份后的项目回档；支持多项目标签、最近文件、画廊和自定义文件夹分类。
- 格式交换：导入/导出 `.ase`、`.aseprite`，打开 PNG、JPEG、WebP、BMP 和动画 GIF；导出 PNG、JPEG、WebP、BMP、GIF、SVG、ICO 和 PSD。PSD 仅导出当前帧图层，不包含动画时间轴；MoonSprite 专有结构应保留 `.moonsprite` 原稿。
- 素材输出：切片与自动切片、按区域或图层导出、批量导出所有帧、精灵表和导出预设；GIF 导出支持动画循环节的播放顺序。
- 缩时录像：全程录制、智能采样、可选记录撤销步骤、过程预览，以及 MP4/WebM 视频或 PNG/JPG 序列导出。录像默认存于本地录像库；跨电脑携带时需在“另存为”勾选“携带缩时录像”，视频格式可用性取决于环境编码支持。
- Windows 集成：系统图片剪贴板、文件拖放、文件关联与资源管理器缩略图。

### 工作区、语言与扩展

- 工作区：项目分屏与浮窗、栏目停靠与悬浮、布局保存、跟随画布的预览、自定义快捷键和可配置快捷指令栏。
- 界面：主题编辑、界面缩放与正文字号设置；支持简体中文、英语、日语、韩语、西班牙语、法语、德语、巴西葡萄牙语和俄语，菜单与下拉选项适配长文案。
- 自动化与扩展：受限 Lua 5.4、Aseprite 兼容 API 子集、MoonSprite `mse.*` API，以及 `.msext` 扩展的菜单、设置、常驻运行时和独立附属窗口；内置可停用或卸载的“宠物伴侣”扩展。
- 使用信息：项目信息、使用统计与诊断入口。

操作方法见 [MoonSprite 使用手册](docs/user-guide.md)；详细行为以 [产品行为契约](docs/product/behavior.md) 和 [交互契约](docs/README.md#交互契约) 为准。

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
- `timelapse-v1/`：本地缩时录像库，供普通工程保存引用；需要随工程传递时使用“另存为 > 携带缩时录像”。

这些运行时目录不提交到仓库。源码仓库自身的 `scripts/` 保存开发与检查工具，不是发行版的用户脚本目录。内置资源位于 `src-tauri/resources/`，其中包含默认背景预设和示例工程。

## 许可

- 当前源码使用 [MoonSprite Source-Available License 1.0](LICENSE)：允许查看、修改、个人编译与源码形式再分发，但未经书面授权不得分发编译后的 MoonSprite。
- Steam 及其他授权渠道的官方二进制使用 [MoonSprite Official Binary EULA](EULA.md)，允许个人与商业创作，按用户席位授权。
- 已经以 MIT License 发布的历史版本继续保留原有权利，见 [LICENSE-MIT](LICENSE-MIT)。
- 第三方字体与依赖遵循各自许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 维护入口

- [文档索引](docs/README.md)
- [使用手册](docs/user-guide.md)
- [贡献指南](CONTRIBUTING.md)
- [变更记录](CHANGELOG.md)
- [产品行为契约](docs/product/behavior.md)
- [文件格式](docs/file-format.md)
- [发布检查表](docs/release/release-checklist.md)
