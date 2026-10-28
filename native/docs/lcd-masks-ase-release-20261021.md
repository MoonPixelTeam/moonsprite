# 蒙版、ASE 与本地发行说明迁移记录（2026-10-21）

本轮只更新 native/build/Release/moonsprite-native.exe，入口仍为 native/start-native.bat。保留已有差异，不提交、不打包、不修改版本号。

## 蒙版实际范围

独立 layer/group + frame 槽、灰度覆盖与透明区不影响原图、显示/锁定/随主体移动/自动链接属性、链接与断开、删除、撤销重做、工程存储、时间轴蒙版行与画笔/橡皮擦/图像画笔编辑已接入。合成保留普通无蒙版快速路径，组蒙版使用隔离组缓存。移动预览发布全画布失效；复制图层/帧及跨文档图层剪贴板携带独立蒙版数据。

明确缺口：含任意蒙版的图像/画布缩放、裁切尚未迁移，明确报错并取消以保留原工程；填充、渐变、形状、蒙版选区内容变换和粘贴尚未迁移；激活蒙版时这些路径拒绝操作，禁止误写普通 cel。旧版 inline cel.mask 工程格式仍被显式拒绝；animation.layerMasks/groupMasks 支持 RGBA 与原始 1byte 灰度资源。未宣称全部蒙版工具行为等价。可见性和随主体移动不写入工程，沿用 legacy 持久化字段语义。

## ASE 实际范围

对照 legacy core/aseprite.ts、imported-palette.ts 与保存 worker 移植32/16/8位读取、raw/compressed/linked cel、图层组、标签与帧时长，原生显式导出支持缩放。使用本地已有 zlib；未复制 Aseprite 应用代码。导出蒙版通过真实合成器逐帧扁平化，并在对话框提示；文本、背景与关联图层身份也有丢失提示。

原 ASE 源路径保存生命周期尚未接入，导入后另存 MoonSprite 或显式导出 ASE。slice chunks 延续 legacy 解码器忽略行为，不能宣称 slice 无损往返。

## 本地发行说明实际范围

完整九版中英文本地目录、最新三条首页模型、独立 seen key、显示前记录和存储失败容错、菜单与首次启动一次显示已迁移。原生滚动弹窗明确显示“原生开发版 / 旧版发行说明”。不联网检查或下载，也不改变应用版本。首页公告 UI 尚未承接，仅保留模型及测试；不增加历史选择器。

## 验证

文档/来源检查与实际运行检查分开记录。构建与测试结果追加于本文件，不能将来源覆盖通过当作行为等价。


### 本轮最终结果

- `/m:1 /nodeReuse:false` 串行正式构建通过。首次发现 Surface optional 赋值和两个 private smoke/history 接口访问错误，集中修复后通过；模型检查发现灰度覆盖 unsigned 回绕，修正为浮点计算后增量构建通过。
- `attached-masks-tests`、`aseprite-io-tests`、`release-notes-tests` 全部通过。蒙版覆盖灰度/透明语义、笔刷隔离、取消、历史、移动、帧复制/链接/删除、组合成、工程往返和快照隔离。
- 唯一正式 exe 的 `--attached-masks-check`、`--aseprite-io-check`、`--release-notes-check` 三个实际窗口检查均 exit 0。蒙版检查实际时间轴行选择→灰度绘制→撤销重做→取消→工程内存编码/读取；ASE 检查实际 openPath/acceptOpen→实际格式选项9→原生 ASE 弹窗提交→注入路径选择→分块快照/后台编码→atomic写文件→重新打开逐帧比对。Windows系统文件选择器的鼠标交互未验收；未增加视觉截图验收结论。
- 普通来源覆盖检查通过430文件，strict exit1，保留真实partial与已知缺口；来源覆盖不等于行为等价。
- 正式产物 `native/build/Release/moonsprite-native.exe`：17038336 bytes；修改UTC `2026-10-21T10:01:44.3875558Z`；SHA256 `808810E009D6A181DE6AA21EE4DEA1CEF1B501702887747BA5D2B4BCD1F68F36`。
- 构建日志 `native/build/lcd-mask-ase-release-build-fix2.log` 与最终灰度修复日志 `native/build/lcd-mask-ase-release-build-fix3.log`；窗口结果 `native/build/lcd-mask-ase-release-smokes.json`；交付元数据 `native/build/lcd-mask-ase-release-delivery.json`。保留所有测试工程及恢复目录。

未追加全库回归、图像验收、打包、发布或提交；此前已知 grouped duration 测试失败不在本轮重跑，旋转/slice截图仍未验收。
