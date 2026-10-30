# 文字工具移动与居中

## 旧版来源

- `legacy/src/renderer/src/components/useCanvasKeyboardInput.ts:368`：文字工具、活动文字层、没有选中组时，方向键优先于选区和图层列表导航。每次1px，Shift不放大；Ctrl、Meta、Alt、输入／弹窗焦点与拖动阻止此操作。
- `legacy/src/renderer/src/store/workspace-commands-layer-structure.ts:540`：`moveLayerBy`检查有效锁定，修改位置并平移活动帧解析后的文字数据，记录一次可撤销历史。隐藏图层仍可移动。
- `legacy/src/renderer/src/core/animation.ts`：活动图层位置同步到活动帧解析后的surface；非链接的其它帧不随之平移。
- `legacy/src/renderer/src/store/workspace-commands-selection-move.ts:422`：没有选区且未编辑蒙版时，固定文本框按框范围居中；其它文字按不透明字形范围居中。位置、文字元数据和历史一起移动，取整使用JavaScript Math.round。

## 原生承接

方向键入口在选区和时间轴导航之前分派。文档复用现有ownerOffsets、textChanges、translateTextCelData及历史应用机制；只修改位置和文字变换元数据，不复制或重采样字形像素，不移动选区或蒙版。链接Cel修改解析后的共享所有者。每次按键／系统重复产生一条历史，锁定时无历史。

历史同时保留活动帧、图层和时间轴选择；切换帧后撤销会回到操作时的上下文。三个既有居中菜单复用同一事务；原生boxed标志对应旧版是否提供文本框尺寸。新入口不开放自由瓦片移动，也不修改文字鼠标拖动。

## 验证范围

`--shortcuts-input-check`发送实际方向键，检查四方向、链接所有者、文字origin和变换、像素不变、选区不变、没有选区、撤销／重做及帧上下文、Shift步长、时间轴焦点优先级、锁定和隐藏图层。通过实际菜单检查文本框水平／垂直居中、已居中无历史、无框字形居中及撤销／重做。无布局或素材变化；未新增图像验收或长期性能测试。
