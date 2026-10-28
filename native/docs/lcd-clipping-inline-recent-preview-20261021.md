# 2026-10-21：剪贴蒙版、内嵌蒙版兼容与最近工程预览

本轮正式程序：`native/build/Release/moonsprite-native.exe`，唯一入口仍为 `native/start-native.bat`。未提交、打包或发布。

## 实现与来源

- 独立的 Layer/Group `clippingMask`，对应 legacy document-composite-plan.ts / document-composite-sampling.ts / document-composite-clipping.ts。同级链先按基底组成 block 再按基底 Z 排序；保留基底原始 alpha、恢复后仅应用一次基底 opacity/blend。隐藏基底整链不可见，剪贴组独立合成；附加蒙版仍是独立数据。
- 有效锁检查、活动组优先的菜单/快捷命令、历史与项目保存重开。复用原 clippingMask 图标。
- Schema21 内嵌 cel.mask 按实际 legacy decoder 合并到独立 slot。显式 layerMasks 优先、重复组 slot拒绝；raw scalar/严格RGBA、链接/环检查；canonical保存清除旧元数据和已登记旧资源，避免删除后复活。Fixture调用实际legacy encoder/decoder，并覆盖reader/import/save/recovery。
- 最近工程面板实际接入3worker PreviewQueue、24项/32MiB PNG缓存与指纹磁盘缓存，UI线程上传RGBA surface。small34高、medium78高带84×62预览、large180高四列带120高预览；Ctrl/Meta滚轮及独立density设置。无可用预览时保持记录与打开入口。
- 构建修复：Windows RPC `small`宏导致selection_tools编译错误，改名localBarrier并展开等价多行分支。LinkedPixelStorage维持explicit构造；九个Surface测试显式包装。displayPixels明确if返回避免临时对象引用。

## 验证（实际范围）

- 必要目标串行构建通过：moonsprite-native、project-manifest-tests、layer-group-compositor-tests、display-pixels-lifetime-tests；Surface相关测试已改显式适配，未扩大为全量测试运行。
- project-manifest-tests（真实legacy fixtures）exit0。
- layer-group-compositor-tests（含剪贴隐藏基底/alpha/opacity/blend/Z/group isolation）exit0。
- 独立display-pixels-lifetime-tests：blank32×32、重复引用、copy、编辑隔离exit0。
- 正式exe `--clipping-mask-check` exit0；`--recent-projects-check` exit0，后者等待真实预览surface上传，断言三密度卡片实际尺寸与large同排位置，生成medium BMP。未声称完整视觉验收。
- `recent-preview-tests`当前只是DTO占位，不能作为后端/队列验收证据；真实pane入口提供本轮证据。
- provenance覆盖445通过；strict仍失败（已知迁移缺口）。

## 明确保留限制

- Onion renderer尚未迁移legacy剪贴链ghost插入语义；普通/导出合成已接剪贴，但不能将剪贴迁移称为完整。
- Schema!=21仍Unsupported，未执行旧版本完整normalize升级链。
- 最近工程缺嵌入预览时仅使用native可编辑子集fallback，不能等同legacy完整解码覆盖；未做多格式矩阵或完整视觉验收。
- moon-core-tests退出-1073741571（stack overflow），原因未定位，未列通过；不把它归因于大型main fixture。独立display lifetime测试与正式启动已通过。

最终产物：SHA256 E71A9C4666C3089EB2E29AADFD3B923E20A238E602586B791F8D7901A1B2AC2B；17,312,256 bytes；UTC 2026-10-21T16:25:44.7223474Z。
