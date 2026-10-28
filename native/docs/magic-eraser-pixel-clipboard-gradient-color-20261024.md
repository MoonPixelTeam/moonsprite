# 2026-10-24 工具迁移闭合

本批唯一写入者 integrator；两位只读 Agent 提供精确补丁，保存于 native/build 后顺序合入。仅使用 native/build/Release/moonsprite-native.exe；无分支、工作树、preview、提交或打包。

魔术橡皮：依据 legacy workspace-magic-eraser.ts / .test.ts、canvas-input-fill.ts、canvas-pointer-up.ts、EditorToolOptions.tsx、tool-preferences.ts。默认不连续，连续开关独立于魔棒；共享魔棒容差与闭合、填充参考与连接。完整来源匹配后再与原选区相交，不把选区当连接障碍；活动普通 RGBA 源与普通层蒙版，祖先锁/隐藏禁止，特殊层/瓦片不放开。蒙版采样自身。按下显示 pending stroke，松开单历史；Escape、右键加入、失焦/捕获丢失取消。稀疏 owner 原尺寸/offset/storageOrigin 保留，清除包含透明 RGB 的完整packed pixel为0，不扩边；复用原魔术橡皮图标、Shift+E与现有属性控件。原生文本偏好适配legacy localStorage。

瓦片像素剪贴板：依据 workspace-commands-clipboard.ts 的 copySelection/pasteSelection 及 selection-floating/translation/apply。仅Copy渲染缓存，原tile引用/tileset/cache不变，mask与半透明保留。混合工程普通RGBA目标可浮动Paste、拖动、箭头、取消、确认与undo/redo；Enter提交像素后取消选区沿用既有独立历史。Cut、瓦片目标Paste、源原位变换、特殊/free-tile/蒙版目标继续门禁。

渐变自由色标：依据 GradientStopsEditor.tsx 的选中色标 ColorValueControl；复用现有 ColorEditorPopup 五模式、alpha/HEX/swatch联动与gradientChanged预览/偏好。子窗归父窗口持有；切色标关闭过期子窗，关闭提交回调不写入新stop。父关闭/返回关闭子窗。该嵌套窗口的画布采样与轨道double-click仍未迁移，不宣称完整ColorValueControl等价。

源码来源/文档覆盖检查与实际运行分列；provenance strict仍应INCOMPLETE。实际构建/运行结果在本文件后续追加，不以产物存在或旧错误文件推断成功。

最终结果：正式串行build60652与增量89139均exit0。moon-core-tests（含蒙版/cancel/undo）、tilemap-document-tests、tilemap-project-tests（含魔术橡皮工程重开）均实际exit0。实际UI首次PID41196 exit1，原因测试点落入顶部resize手柄；改内容中心并断言transformHit为空，未改变生产命中。最终PID8484 `--workspace-check --named-workspace-only --magic-eraser-only` exit0，覆盖三板块真实入口链及现有Delete回归。来源483文件覆盖/快照验证exit0，strict exit1/INCOMPLETE；diff检查exit0，仅CRLF→LF提示。最终SHA256 FC9762386FCE281AB86A83E460292111EA686B526B52F01BC3FB2BA8FD47E54F。

正常关闭旧PID21184，无强制终止；收尾通过native/start-native.bat重开PID36540，路径确认native/build/Release/MOONSPRITE-NATIVE.EXE，Responding=True。没有截图/所有DPI与窗口尺寸人工验收，不用文档覆盖替代行为等价；达到本批最小定向检查后停止。最终证据native/build/magic-eraser-pixel-clipboard-gradient-color-final-20261024.json。
