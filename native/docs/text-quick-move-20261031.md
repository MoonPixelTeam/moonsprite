# 文字工具临时移动

旧版依据：`legacy/src/renderer/src/components/canvas-pointer-down.ts`先解析临时移动；`canvas-input-text.ts`的创建、编辑、文字框交互排除temporaryMove；`canvas-input-layer-move.ts`使用活动可移动文字层作为关闭自动选层时的目标。

原生此前文字事件先于移动事件处理，文字框、文字编辑和空白创建会吃掉临时移动点击；关闭自动选层时又只允许普通绘图层作为目标。

现让文字处理器将已配置tool.move.quick手势及正在进行的移动交回既有processMoveInput，活动文字目标保持可见、未锁定门禁。复用已有预览、对齐、约束、蒙版和选区联动、取消、历史和反馈。文字框直接拖动仍用较窄的TextBox范围，临时移动仍用普通移动工具范围；保留文字工具，不建立第二个文字事务。

唯一正式Release构建、`--text-tool-check`、`--layer-move-check`通过。新增实际Ctrl+指针从onProcessMessage进入，检查关闭自动选层、移动文字及选区／蒙版、Escape恢复、一次提交、撤销／重做和工具保留。既有移动回归通过。来源覆盖515文件及快照通过。无素材、布局变化或新增长期性能／图像验收。

Alt文字复制目标等其它未承接交互仍保留，不宣称整个文字模块完成。
