# PSD 分层导入（2026-11-03）

## 功能与来源

按 `legacy/src/renderer/src/core/psd.ts::decodePsd/importedMask` 承接 PSD 打开：图层像素、中文名称、偏移、可见、锁定、透明度、混合模式、剪贴、嵌套组、空组与图层／组蒙版；没有可用分层像素时沿旧版回退合并图。导入为单帧100ms、独立工程身份，提取色卡并选择最上层，初始无撤销记录且未修改。

旧版使用 MIT ag-psd 31.0.2。将相关读取算法适配为 C++，复用已有 zlib 与文档核心，不在应用引入 JS 或 WebView。上游版权和许可原文在 `assets/licenses/ag-psd-LICENSE.txt`，正式构建复制到程序旁。没有链接 Aseprite 的 PSD 库。

旧版非穿透组的 `cumulativeBlend` 按 `document-composite-sampling.ts` 在当前背景上计算子层，再应用蒙版、组透明度和混合；剪贴链的基底仍按旧版合成隔离结果。该语义同时接入普通／洋葱皮合成、原生工程读写和历史结构比较。导出 ASE 无法原样表达时沿现有有损保存确认并逐帧合成，避免静默改变画面。

## 用户操作链路

文件选择、拖入和已有启动文件路由共用普通打开逻辑，在后台生成候选文档。重复打开相同来源聚焦已有标签；不同目录同名 PSD 生成独立工程。另存 `.moonsprite` 后可继续编辑并保存重开，PSD 源文件保持原样。损坏／超限输入报错，不替换当前作品或新增半成品标签。

## 明确边界

当前原生画布为1–1024像素，文件及累计展开工作预算256MiB；PSD版本1，不接受PSB。支持RGB、灰度、索引色、1位bitmap及8位CMYK转换；栅格通道支持Raw、PackBits RLE、ZIP和ZIP预测，覆盖8／16／32位。合并图沿当前ag-psd只读Raw／RLE。保留已有原生预算限制，不称为旧版30000像素上限等价。

沿旧版导入为栅格，不提供PSD文字、智能对象或图层效果的原始编辑能力。本批没有接入PSD导出，也不代表文件领域整体完成。

## 验证

样本由旧版实际ag-psd生成；单层位深／压缩样本也先经该依赖读取作参考。`psd-import-tests` 覆盖图层属性、偏移、蒙版、分组、合并回退、通道、原生保存重开、源文件不变、损坏拒绝和背景混合／ASE保护。正式程序 `--timeline-gif-drop-check` 增加实际打开、重复来源、拖入同名工程、原生保存及失败保护检查。

实际执行：`psd-import-tests`、`layer-group-compositor-tests`、`layer-group-io-tests` 均通过；唯一正式Release构建成功，正式程序 `--timeline-gif-drop-check` 返回0；564文件来源覆盖及diff检查通过。没有做人工Photoshop文件矩阵、截图或全部色彩配置验证。
