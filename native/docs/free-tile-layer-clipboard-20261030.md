# 自由瓦片图层及图层组剪贴板

接通既有复制、剪切、粘贴入口中的自由瓦片整层及组。实例列表和像素选区仍优先进入既有剪贴板；本批不增加布局、图标或菜单。

## 旧版证据

- `legacy/src/renderer/src/store/workspace-commands-clipboard.ts`：`layerClipboardFromDocument`、`copySelectedLayersToClipboard`、`pasteLayersFromClipboard`、`applyLayerClipboardAnimationCel`。包含各帧实例、源集合及所有引用资源；粘贴按集合重映射源，保留被复制多层之间的共享。
- `legacy/src/renderer/src/store/workspace-layer-owned-tilesets.ts`：`removableOwnedTilesets`。剪切和删除只移除没有其它owner或格子引用的资源。
- `legacy/src/renderer/src/store/clipboard-service.ts`：图层复制记录系统图片基线，新外部图片优先；原内部载荷可重复粘贴。
- `legacy/src/renderer/src/core/animation.ts`：空自由Cel及帧补齐规则。
- `legacy/src/renderer/src/store/workspace-layer-clipboard-performance.test.ts`：整块像素拷贝、重复粘贴隔离的旧版测试证据；自由瓦片专项断言由上述实际源码契约转写，不声称旧版已有同名专项测试。

## 行为与适配

复制捕获独立快照，不改变作品历史。粘贴保留图层属性、组、蒙版、每帧实例、Cel不透明度和zIndex、表面像素及存储坐标；新建资源ID、源集合和源ID，实例ID与位置属性保持。单次多层粘贴保留其源共享关系；与原工程及后续粘贴分别独立。资源名使用源名称。

源工程帧多于目标时补齐缺少的帧；目标帧更多时为空自由Cel。复用原生结构历史，一次粘贴一条记录，撤销仅移除本次新增层／组／帧／资源，重做恢复同一身份。剪切沿用删除规则，仍被其它层使用的资源保留；最后一个owner删除时资源随历史移除并可恢复。

图层复制只读系统图片，不写用户剪贴板；粘贴比较图片内容。图片未变、缺失或不可读时沿用内部图层载荷，新图片沿既有图片粘贴路径处理。像素选区与实例载荷的既有优先级不变。

保留原生现有整块像素复制、256MiB像素预算及槽位上限。自由链接Cel仍不被原生模型接受；需要自由层自动链接的帧扩展在发布前明确拒绝，本批不以独立实例近似其链接语义。整Cel／整帧自由瓦片剪贴板等缺口仍保留。

## 检查

核心检查覆盖单层、共享源组、同工程／跨工程、帧数两种方向、实例元数据及引用、反复粘贴、保存重开、撤销重做、共享／独立资源删除与恢复，以及缺失资源和自动链接帧扩展的原子拒绝。正式菜单检查使用图片读取注入，不改写用户系统剪贴板；执行结果见迁移计划。本批没有新增图像或长期性能验收。
