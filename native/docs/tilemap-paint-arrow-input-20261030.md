# 网格瓦片Paint方向键移动

## 来源与问题

`legacy/src/renderer/src/components/useCanvasKeyboardInput.ts`在有选区且Paint模式下，将方向键的一单位位移分别乘以活动网格tileWidth／tileHeight后交给`moveActiveSelectionWithSelectionHistory`。`workspace-tile-selection-move.ts`和`workspace-commands-selection-move.ts`提供格子移动及选区历史来源。

原生已有`nudgeSelectionContent`完整格子事务，却从键盘入口接收到1像素。对于大于1px的格子，取整后方向键可能不动；宽高不同或负方向时还可能表现不一致。

## 承接

只在既有键盘分派处完成单位转换，活动目标为网格瓦片Paint且未选蒙版时，从解析后的Cel读取真实网格尺寸。向左右使用tileWidth，向上下使用tileHeight；其它模式继续传入像素位移。既有Ctrl／Alt门禁、自由变换时的Paint保护、选择作用域限制继续保持。

复用现有`nudgeSelectionContent`、`expandedPaintCellSelection`、`beginPaintCellMove`、`updatePaintCellMove`与`finishPaintCellMove`；不添加另一套格子算法、历史或缓存，不改变公开文档接口。移动改变格子引用及选区，原tileset像素保持；越界沿用现有裁限，没有有效移动不增加历史。多帧、蒙版、自由瓦片及其它既有未迁移场景不由本批开放。

## 验证

扩展现有`--shortcuts-input-check`，使用2×3的非正方形瓦片，向编辑器发送实际四方向键事件，断言格子引用及选区步长、Undo／Redo、回到原位、边缘无操作、自由变换门禁与tileset像素不变。没有新布局或素材，不新增截图或长期性能验收。实际运行结果见迁移计划。
