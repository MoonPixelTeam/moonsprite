# 第一个 Runtime 扩展

中文 | [English](quickstart.en.md)

[hello-runtime 示例](examples/hello-runtime/manifest.json) 只用三个文件：清单、[Runtime HTML](examples/hello-runtime/runtime.html)、[窗口 HTML](examples/hello-runtime/window.html)。它添加“示例”菜单，打开宿主弹窗，读取设置并通过消息更新文字；不修改工程。

## 打包和安装

在仓库根目录用 PowerShell 执行下面命令，得到唯一命名的包：

```powershell
$sampleFiles = Join-Path (Get-Location) 'docs/extensions/examples/hello-runtime/*'
$sampleName = 'hello-runtime-' + [guid]::NewGuid().ToString('N')
$sampleZip = Join-Path ([IO.Path]::GetTempPath()) ($sampleName + '.zip')
$samplePackage = [IO.Path]::ChangeExtension($sampleZip, '.msext')
Compress-Archive -Path $sampleFiles -DestinationPath $sampleZip
Move-Item -LiteralPath $sampleZip -Destination $samplePackage
Write-Output $samplePackage
```

从 MoonSprite 扩展管理界面导入该 `.msext` 并启用。菜单中的“打开示例”应显示问候语；“设置”可修改它。ZIP 中 `manifest.json` 必须直接在根目录。文件直接在普通浏览器打开时没有宿主注入的 `moonsprite`，不能据此验证扩展运行。

## 理解示例

- `runtime.html` 使用对象参数，例如 `storage.get({ key })`；`window.html` 使用位置参数，例如 `window.postMessage(message)`。
- 能力查询判断是否支持 `dialog`；旧宿主降级为应用内通知。只有 Runtime 注入 `getCapabilities`，窗口不能调用它。
- `windows.open` 完成不意味着 iframe 已就绪；窗口主动发 `hello-ready`，Runtime 收到后才发送状态。再次打开已有页面时用 `hello-ping` 请求状态握手。
- 清单默认设置不会自动成为存储值，Runtime 在尚未保存时自行使用默认值。
- 窗口之间共享数据使用宿主 `storage` 与消息，不依赖 iframe 的 localStorage/IndexedDB。DOM 更新使用 `textContent`。

## 排错与扩展

| 现象 | 检查 |
| --- | --- |
| 安装失败 | 对照[清单参考](manifest.md)核对根目录、ID、入口、命令引用和资源大小。 |
| 调用被拒绝 | 核对 `runtime.getCapabilities().methods` 和权限；资源/窗口要声明 `resources` / `windows`。 |
| 窗口空白 | HTML 自包含；检查资源 ID 和页面脚本错误，不能直接 `<script src="./app.js">`。 |
| 刚打开的窗口收不到消息 | 使用页面就绪握手，打开 Promise 不是消息送达保证。 |
| overlay 看不见也点不到 | 必须调用 `window.setHitRegion`，初始区域为空。 |
| 表单一直忙碌 | 回传完整 `nodes` 与匹配的 `result.requestId`，包括错误路径。 |
| Lua 写入后立刻查询还是旧数据 | 查询为快照，写入在脚本结果提交时生效；布尔返回值不是新对象 ID。 |

更多接口见 [Runtime](runtime-api.md)、[宿主表单](ui-form.md)、[API 覆盖索引](api-index.md)、[Lua/MSE](../scripting/README.md)。示例的静态校验不能替代在目标 MoonSprite 构建中导入、启用、操作及停用验收。
