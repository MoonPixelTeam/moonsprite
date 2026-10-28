# 文字编辑、预览和数位板辅助集成记录

本轮保持 dev、唯一源码写入者及唯一正式产物；未提交、打包或发布。

文字编辑按 TextToolDialog.tsx 的 UTF16 选区语义同步字号、行距、字距和颜色；混合值留空，末尾光标读取最后字符样式，无选区修改基础属性。PixelTextArea 适配原浏览器 textarea 的局部文字撤销/重做、选区恢复和新输入清空重做；样式仍走 legacy reconcileTextStyleRuns，不另设富文本历史。实际原生弹窗的确认、取消和预览均不把局部编辑混入文档历史，确认只提交一条。

预览沿用现有停靠/浮动框架，增加独立缩放平移、跟随、原色取样及独立播放菜单。任意预览帧合成不选择主文档帧，不产生文档历史。follow 素材提取自 legacy 原路径并通过已有转换器转换。

数位板辅助接既有工具、笔刷、选区及事务路径；按住/锁定状态按文档隔离，与物理修饰键合并，隐藏/失焦/切换文档释放。自动模式消费首次原生 Touch 消息；手动关闭保持关闭。详见 tablet-assist-migration.md。

正式串行构建及四个相关测试均 exit 0：text-raster-tests、text-document-tests、preview-panel-tests、tablet-assist-tests。实际启动唯一正式 exe 的 --text-tool-check、--preview-panel-check、--tablet-assist-check 均 exit 0。记录位于 build/lcd-three-block-build.log、lcd-three-block-tests.json、lcd-three-block-smokes.json。文字 smoke 的图片是实际原生控件离屏绘制，不是桌面截图；本轮不据此声称浏览器字形像素等价。模拟 Touch 消息不能替代真触屏/笔硬件验收。

来源覆盖检查通过 381 文件；strict exit 1，已登记缺口仍保留。数位板画布整体旋转/归零未迁移并禁用；1600ms 反馈呈现未证明等价。没有声明完整迁移或整体完成百分比。

正式产物：native/build/Release/moonsprite-native.exe，16012288 字节，UTC 2026-10-20T16:39:19.0829412Z，SHA256 81a8981862d3a586f7ec94baba8cf1d58321783036b188d38ec5a06094e73e28。入口保持 native/start-native.bat。
