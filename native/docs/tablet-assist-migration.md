# 数位板辅助栏目迁移

来源：legacy/components/tablet/TabletAssistBar、TabletPressButton、useTabletWorkspace及对应测试；core/tablet-interaction及对应测试；useCanvasToolSession。完整仓库相对路径与哈希见legacy-provenance.json。

保留隐藏、浮动默认工作区，自动模式仅首次真实Touch原生事件打开，手动关闭不反复打开；开/关模式接偏好实际入口。复用原生像素控件、共享停靠布局、既有工具命令与事务；按住/锁定修饰键与物理状态合并；按住取色、笔刷大小/透明度、选区模式、边框/内容移动、自由变换、1px按下立即移动与380/90ms重复、确认/取消均接原生路径。失焦、隐藏、切文档释放临时状态。

未迁移：画布整体旋转模型/旋转归零（明确禁用）；1600ms反馈呈现尚未完全等价。数位板驱动、压力、倾斜、手势不属于本辅助栏目迁移范围。

源码检查：运行check-legacy-provenance.py仅证明登记覆盖；strict仍须失败。
运行检查：tablet-assist-tests覆盖旧版状态/隔离/自动显示fixtures；正式程序--tablet-assist-check覆盖原生面板实际绑定、工具/事务、物理键不被改写、按下/释放、模拟Touch路由。打开程序与截图结果由构建者另行记录，本文不预先声明通过；模拟消息不能替代真触屏/笔硬件验收。
