# 文字转普通层、关联图层、项目信息集成验收

完成日期：2026-10-21。唯一正式产物 `native/build/Release/moonsprite-native.exe`，通过 `native/start-native.bat` 启动；未创建分支、外部工程或 preview，未提交或打包。

## 结果

- 正式程序及三个测试目标单节点构建成功，日志：`native/build/lcd-text-linked-info-build3.log`、`native/build/lcd-text-window-fix2-build.log`。
- `text-rasterization-tests`、`linked-layers-tests`、`project-information-tests` 均 exit 0。
- 正式程序实际窗口 `--text-rasterization-check`、`--linked-layers-check`、`--project-information-check` 均 exit 0。文字最终记录见 `native/build/lcd-text-only-smoke.json`；另两项见 `native/build/lcd-text-linked-info-smokes.json`。后者保留修复前文字失败记录，不覆盖历史。
- 正常 provenance 检查 exit 0，覆盖 415 文件，legacy 证据哈希校验通过；`--strict` exit 1，仓库仍有已登记迁移缺口，不能解释为完整行为等价。

## 本轮定点修复和断言

文字转换保留当前缓存像素、透明 RGB、尺寸、位置及动画拥有者链接，去除所有帧文字元数据；草稿创建与转换分别撤销，转换后旧对话框取消不恢复文字。实际窗口发现清空新草稿后“层不存在”被误认为已转换，已修复为仅现存非文字层退休，重新输入可重建草稿。文字首笔 undo fixture 依已有 backing 扩展语义验证世界坐标像素，转换本身仍严格核对原尺寸和字节。

关联图层保留共享像素存储强断言，覆盖预览/取消、绘制、撤销重做、独立位置、同层动画链接、快照隔离、目标分离、存读和跨文档粘贴。重开项目验证共享身份、两层世界坐标像素和相对偏移；运行期 storageOrigin 不序列化，故不把该内部值作为持久字段断言。

项目信息使用实际菜单和 PixelDialog，验证缩小、滚动及只读性；安全统计及原始日期随工程、恢复和快照保留，回档按整文档统计快照例外处理。选择 fixture 使用实际提交选择操作。

## 边界

普通 RGBA 关联图层已迁移；tile/free-tile/style 转普通层仍未迁移并保持禁用。缩时记录统计明确显示“不可用（尚未迁移）”。实际窗口检查通过不代表截图视觉验收，本轮未重试截图。此前完整 project-save-tests 的 Grouped duration 失败未在本轮修复或重跑，不能声称全仓测试通过。

## 正式产物

- 大小：16,748,032 字节
- LastWriteTimeUtc：2026-10-21T08:33:40.1465489Z
- SHA256：`0F58523B4A5645A605C43449143F45529A3B67BB718265A7D653B743F5ECB265`

迁移依据详见 `text-rasterization-migration-20261020.md`、`project-information-linked-migration-20261020.md` 和 `legacy-provenance.json`。