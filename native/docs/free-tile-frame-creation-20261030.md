# 自由／网格瓦片新增帧和空白帧

接通时间轴已有“新增帧”（Alt+N）与“新建空白帧”（Alt+B），不添加界面、图标或素材。

## 来源

- `legacy/src/renderer/src/core/animation.ts`：`addBlankAnimationFrame`、`duplicateAnimationFrame`、`inheritAnimationFrameCelLinks`、`inheritAnimationFrameMaskLinks`。新帧插入当前帧之后；复制保留时长和disabled，空白使用100ms；空自由Cel保留原表面尺寸及偏移，空网格Cel保留网格规格；实例和网格资源仍引用原源。
- `legacy/src/renderer/src/core/animation.test.ts`：帧创建、复制和自动链接的核心用例依据。
- `legacy/src/renderer/src/store/workspace-commands-animation-frame.ts`：帧／蒙版／循环段撤销重做，清理像素和时间轴选择、停止播放。

## 实现与适配

直接扩展原生已有`Document::addFrame`，复用帧插入顺序、帧和Cel增量结构历史、图层／组蒙版复制、普通层与网格自动链接、循环段末端延伸。解除特殊工程总拦截；空自由Cel显式创建空实例集，空网格Cel清空格子。保留源表面的尺寸与偏移、层透明度；复制保留全部实例、原缓存与共享源资源，不导入新资源集合。同时补齐原生复制帧遗漏的disabled。

自由Cel链接尚未被原生模型表示。遇到自由层autoLinkAnimationCels时，在提交预览或修改文档之前明确拒绝本次帧创建，避免生成近似链接。独立链接帧命令仍保留原限制。本批不修改Cel／帧跨工程协议、资源导入或其它整体迁移缺口。

继续使用既有256MiB帧像素预算、10000帧上限和增量结构历史；不是全量时间轴快照，不新增持续扫描或系统剪贴板访问。预算仍基于原生画布尺寸公式，不宣称完整瞬时内存上限。

## 检查

核心覆盖两类帧、时长和disabled、插入顺序、实例／格子、表面偏移、共享资源、图层与组蒙版、普通层蒙版自动链接、循环段末端、保存重开、撤销重做与自由自动链接原子拒绝。正式程序定向调用Alt+N、Alt+B的键盘事件，验证实际入口、新Cel内容、资源与历史；沿用已有整层／Cel／帧剪贴板和删除检查。

本批不新增布局，未做截图外观或长期性能验收；实际执行结果见迁移计划。
