# Your first Runtime extension

[中文](quickstart.md) | English

The [hello-runtime sample](examples/hello-runtime/manifest.json) has three files: the manifest, [Runtime HTML](examples/hello-runtime/runtime.html), and [window HTML](examples/hello-runtime/window.html). It adds an Example menu, opens a host dialog, and reads settings to update text through messages. It does not edit projects.

## Package and install

Run from the repository root in PowerShell to create a uniquely named package:

```powershell
$sampleFiles = Join-Path (Get-Location) 'docs/extensions/examples/hello-runtime/*'
$sampleName = 'hello-runtime-' + [guid]::NewGuid().ToString('N')
$sampleZip = Join-Path ([IO.Path]::GetTempPath()) ($sampleName + '.zip')
$samplePackage = [IO.Path]::ChangeExtension($sampleZip, '.msext')
Compress-Archive -Path $sampleFiles -DestinationPath $sampleZip
Move-Item -LiteralPath $sampleZip -Destination $samplePackage
Write-Output $samplePackage
```

Import and enable the `.msext` in MoonSprite's extension manager. Open example should show a greeting; Settings lets you change it. `manifest.json` must be directly at ZIP root. Opening the files in an ordinary browser does not inject `moonsprite` and cannot validate extension behavior.

## Understand the sample

- `runtime.html` uses object parameters such as `storage.get({ key })`; `window.html` uses positional parameters such as `window.postMessage(message)`.
- Capability discovery checks `dialog` support and falls back to an in-app notification on older hosts. Only Runtime has `getCapabilities`; windows cannot call it.
- Resolving `windows.open` does not mean the iframe is ready. The window sends `hello-ready` before Runtime sends state. Reopening an existing page uses `hello-ping` to request another handshake.
- Manifest defaults are not automatically stored; Runtime supplies defaults until settings have been saved.
- Share data using host `storage` and messages, not iframe localStorage/IndexedDB. DOM text updates use `textContent`.

## Troubleshoot and extend

| Symptom | Check |
| --- | --- |
| Installation fails | Check root layout, IDs, entries, command references and sizes against the [manifest reference](manifest.en.md). |
| Request rejected | Inspect `runtime.getCapabilities().methods` and permissions; resources/windows need `resources` / `windows`. |
| Blank window | Use self-contained HTML, correct resource IDs and inspect script errors. Relative `<script src="./app.js">` does not work. |
| Newly opened window misses a message | Use a page-ready handshake; the open Promise does not guarantee message delivery. |
| Overlay invisible and noninteractive | Submit `window.setHitRegion`; the initial region is empty. |
| Form stays busy | Return complete `nodes` and matching `result.requestId`, including error paths. |
| Lua query immediately after a write returns old data | Queries use snapshots; writes apply when script results are committed. Boolean results are not new object IDs. |

Continue with [Runtime](runtime-api.en.md), [host forms](ui-form.en.md), the [API coverage index](api-index.en.md), and [Lua/MSE](../scripting/README.en.md). Static sample validation does not replace importing, enabling, interacting with and disabling it in the target MoonSprite build.
