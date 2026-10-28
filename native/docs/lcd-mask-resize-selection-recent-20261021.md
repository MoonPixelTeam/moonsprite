# 附加蒙版缩放、选区和最近文件整合

## 本轮范围

图像缩放、画布锚点/显式偏移缩放、裁切及背景图层路径承接全部附加蒙版slot；保留链接关系，每个直接位图处理一次，不沿解析链接重复移动根。图像缩放复用现有采样并适配稀疏世界坐标，蒙版在插值后规范化。全部变更在安装前暂存，与尺寸/选区进入同一历史。

选区/剪贴板使用独立mask浮贴baseline和现有transform/RotSprite。静态复制仍按旧版采普通活动层，mask粘贴直接标量写入；动画选择移动及无选区whole mask flip限制保留。materialized浮动预览沿用legacy，active/save门禁保留。

最近文件管理来源及缺口见 recent-projects-migration-20261021.md。旧home-recent.txt保留，只管理记录，不删除工程。

## 验证

统一正式串行构建及最终定向修复构建均已完成，最终退出0。首轮唯一编译错误是recent自检声明误放private，挪到既有public自检区后统一重编，无生产行为改变。构建期间源码保持冻结。

独立模型五项全部退出0：mask-resize-tests、attached-masks-tests、recent-projects-tests、image-resize-tests、canvas-resize-tests。新增蒙版缩放检查覆盖layer/group/frame链接slot、锚点/显式偏移/外部位图保留/裁空1×1/稀疏图像缩放/最近邻与平滑规范化/undo-redo/拒绝越界及真实原子保存重开。运行态undo比较全部flag；重开依照实际legacy格式合同并明确断言默认值。最初fixture对未持久字段的期待已纠正，未扩展格式。

正式程序三个入口全部退出0：--mask-resize-check（真实画布弹窗取消/应用、图像缩放、裁切、归档重开、undo-redo），--mask-selection-clipboard-check（真实粘贴路由、Esc/Enter、自由变换入口和撤销；系统图像采集注入，未写用户系统剪贴板），--recent-projects-check（隔离记录兼容、固定/清空/隐私、失败保留与移除、真实菜单打开及首页同步）。最近菜单关闭时framework isVisible要求父链可见，fixture改查行自身HIDDEN标记；不改变产品菜单逻辑。复查的一次启动前超时因测试目录未写owned marker，正常关闭该测试错误窗口并补标记后入口退出0。

结果位于native/build/lcd-resize-selection-recent-models.json和lcd-resize-selection-recent-smokes.json。测试自有工程/失败证据保留，不删除用户工程或恢复数据。来源覆盖440文件退出0，strict因已知全仓缺口退出1。文档/来源核对、模型自动检查和实际入口验收分别如上；本轮没有额外图像验收，不宣称全仓迁移完成。

正式产物native/build/Release/moonsprite-native.exe：17,228,800字节，UTC 2026-10-21T11:44:17.9271855Z，SHA256 2061564CA57FAEC1B0FA7F253F51F9A32EDCDAF66EEE25B60853F1DF80DEFA85。唯一启动入口native/start-native.bat。

旧inline mask不纳入本轮；全仓strict仍须因已知迁移缺口失败。

保存重开按legacy project-format-encode/decode的ManifestMask合同：保留位图、几何、链接、locked和autoLink；visible在旧版导入重置true，moveWithOwner不写入旧版工程格式。本轮不擅自扩展格式；运行态resize/crop和undo仍保留全部flag。
