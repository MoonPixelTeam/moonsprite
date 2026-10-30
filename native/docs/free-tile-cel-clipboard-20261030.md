# 自由瓦片整 Cel 剪贴板（同工程）

接通已有整Cel复制、剪切和粘贴入口，不新增界面或素材。Cel是时间轴中的图层与帧交叉单元格。

## 旧版来源

- `legacy/src/renderer/src/store/workspace-commands-animation-cel-clipboard.ts`：`copySelectedAnimationCels`、`pasteAnimationCels`，按所选块的相对行列定位，以最后选中目标为锚点，保留源实例引用、Cel属性、选中状态和历史。
- `legacy/src/renderer/src/core/animation.ts`：`snapshotLinkedAnimationCels`、空自由Cel、帧补齐和活动帧刷新。
- `legacy/src/renderer/src/store/workspace-cut.ts` 与 `workspace-commands-animation-cel-properties.ts`：先复制，再清除所选Cel，保留其它引用者，撤销恢复内容但不重新激活已清除的显式选择。
- `legacy/src/renderer/src/store/workspace-animation-cel-conversion.ts` 与 `workspace-animation-cel-target.ts`：整Cel存储坐标、类型适配和跨工程载荷边界。
- `legacy/src/renderer/src/store/clipboard-service.ts`：复制记录系统图片基线，新外部图像优先。

## 承接行为

同工程的自由瓦片整Cel复制保留每个实例的ID、源引用、位置、旋转、镜像、可见性、锁定、透明度、混合及保留元数据；不复制新的源资源。粘贴到具备对应源引用的自由层，可跨同源集合的其它层，沿用当前源内容。若复制后源内容变化，按当前权威源重新生成表面缓存，不把旧缓存当作源像素。

连续块粘贴可补充缺少的100ms帧，其它自由层在新增帧上获得空实例Cel。复用已有整Cel预验证、分离目标、链接栅格幸存者处理、结构历史和选中状态；整次操作一条历史，失败不发布部分修改。

剪切清空选中Cel的实例和缓存，不删除源资源，不影响其它帧／层实例，剪切载荷可继续粘贴。原生模型要求自由Cel始终持有实例数据，因此用显式空CelData适配旧版删除freeTiles后重新规范化的状态。

Copy／Cut只读取系统图像基线，不写用户系统剪贴板；相同／缺失图片使用内部Cel载荷，新图片走已有图片粘贴。现有像素选区、实例、图层和帧的入口仍遵循各自作用域。

## 明确边界

本批是同工程、整Cel、源引用可解析的迁移。旧版跨工程动画Cel载荷没有携带自由源集合／资源导入协议；不把悬空sourceId复制或自行新增导入逻辑称为迁移完成。原生菜单对自由Cel跨工程粘贴保持禁用，核心接口明确报错；可用已迁移的整层／组剪贴板传递资源。

目标缺少源引用、图层类型不匹配、活动预览、像素选区、蒙版目标、锁定写目标以及需要自由Cel自动链接的帧扩展仍拒绝。自由链接Cel、整帧剪贴板和独立Delete入口等未在本批迁移。沿用原生256MiB像素预算和现有时间轴快照历史，不宣称与旧版全部性能等价。

## 验证

核心覆盖单Cel、同源跨层、连续多帧及其它行空帧、实例与缓存坐标、源修改后刷新、剪切和重复使用载荷、保存重开、撤销重做、缺少目标源／跨工程／部分选区拒绝。正式程序菜单检查验证可用性、Copy／Cut／Paste、锁定和外部图片优先，系统图像读取使用注入；不写用户系统剪贴板。实际执行结果见迁移计划。本批未新增图像或长期性能验收。

原有Cel选区回归在2MiB测试栈下以0xC00000FD退出；仅将该测试可执行文件的MSVC栈预留调至8MiB后通过，功能断言及正式软件栈配置未改。
