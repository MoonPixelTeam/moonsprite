# 自由瓦片时间轴删除

按legacy的deleteSelectedAnimationItems接通既有删除入口，不新增界面或素材。

## 来源与行为

- `legacy/src/renderer/src/store/workspace-commands-animation-cel-properties.ts`：所选Cel清空内容、移交被删链接源、清除显式Cel选择；所选帧逐帧删除且至少保留一帧。
- `legacy/src/renderer/src/store/workspace-commands-animation-frame.ts`：删除帧连同其Cel及图层／组蒙版，修整循环段，历史恢复原结构。
- `legacy/src/renderer/src/store/workspace-animation-cel-delete.test.ts`：删除局部链接成员、删除源时保护幸存者。
- `legacy/src/renderer/src/store/workspace-cut.ts`、`workspace-cut.test.ts`：Cut先复制再调用删除；Delete本身不写剪贴板。

`deleteSelectedCels`和`deleteSelectedFrames`复用前两批Cut中的特殊图层事务，Cut改为复制／验证载荷后调用公共删除。普通RGBA分支只迁移实现位置，算法保持原样。删除实例不删源集合或共享资源；网格Cel清空格子，自由Cel保留原生要求的空CelData，作为旧版删除元数据后规范化的适配。锁定层拒绝Cel清空。时间轴专用删除可按原参数忽略像素选区，删除帧完成后可清除像素选区。

现有编辑菜单、时间轴上下文菜单与Delete快捷键均经过原有路由调用上述公共接口。最后一帧不产生历史；有效删除整次一条历史。Cel撤销恢复内容但不重新激活已清除的显式Cel选择。

## 验证与边界

核心用例覆盖局部清空、不影响其他层／帧、资源保留、剪贴板保留、锁定拒绝、单／多帧删除、最后一帧、蒙版、循环段、保存重开、撤销重做、时间轴忽略像素选区与网格回归。正式程序专项检查实际点击editDelete，覆盖自由Cel与整帧、历史与资源保留。

应用剪贴板使用删除前已导出的快照；内部exportFrameClipboard仍要求原Cel可解析，不将删除后的重新导出当作应用剪贴板读取。这是既有导出限制，本批不重设计剪贴板协议。

自由Cel链接、自动链接插帧、自由Cel／帧跨工程资源传递等既有缺口继续保留。沿用快照事务，不宣称长期性能或完整迁移验收。运行结果见迁移计划。
