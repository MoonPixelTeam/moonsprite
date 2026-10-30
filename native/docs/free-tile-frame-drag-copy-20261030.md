# 自由／网格瓦片的时间轴帧拖动复制

接通原有Alt拖动帧头的复制操作，不新增界面、素材或快捷键。

## 旧版来源

- `legacy/src/renderer/src/components/panels/useAnimationGestures.ts`：帧拖动时，Alt复制调用`pasteAnimationFrames(duplicateAt)`，正常移动调用`moveSelectedAnimationFrames`。
- `legacy/src/renderer/src/store/workspace-commands-animation-frame-clipboard.ts`：`pasteAnimationFrames`有目标插入槽时直接捕获当前所选帧，不使用也不修改现有剪贴板；在目标前或后插入，单帧和多帧均选中新帧范围，记录一条结构历史。
- `legacy/src/renderer/src/store/workspace-animation-drag-copy.test.ts`：复制不影响源、剪贴板保持与一次撤销；撤销恢复原帧选择上下文。

## 承接与适配

特殊工程原先仍调用拒绝瓦片的`pasteCopiedFrames`。现通过已有`pasteTilemapFrames`的结构事务直接传入目标插入槽，保留完整帧时长、停用、所有层Cel实例／网格、共享源资源和图层／组蒙版。仅增加插入位置与拖动范围选择参数，不新建复制算法。首帧前和其它位置均直接插入，不用原普通路径的中间移动步骤，从而保持原循环段端点。普通RGBA路径维持原样。

沿用现有帧捕获函数，在调用期间保存并恢复文档内部帧和Cel剪贴板，异常也恢复；应用及系统剪贴板不参与。无需临时改变活动帧、图层或选择来绕过门禁。新帧为新身份，原帧保持不变；复制后活动首帧、锚点末帧；撤销重做恢复原上下文及复制身份。编辑器捕获帧拖动错误并走既有错误提示，避免失败中断手势清理。

继续保持完整非活动Cel／帧的既有前置条件、256MiB像素预算、层帧上限和自由自动链接限制。自由Cel链接、跨工程自由帧资源协议和Cel格子拖动不是本项迁移范围。没有新增持续扫描、缓存或外部产物。

## 检查

核心覆盖单／多帧、目标首帧前、末帧后、中间及源范围内、原顺序、时长／停用、实例和网格、共享资源、蒙版、循环段端点、剪贴板保留、保存重开、一次撤销重做、无效目标及失败后继续操作。正式程序专项检查通过现有帧头鼠标手势模拟Alt拖动多帧，检查实际输入、内容、资源、选择和撤销。执行结果见迁移计划；不宣称新增截图或长期性能验收。
