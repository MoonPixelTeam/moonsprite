# 2026-10-21 三块整合记录

## 实现范围

附加蒙版补接填充、图案填充、前景色选区填充、渐变及现有线/矩形/椭圆形状工具。旧版来源见 provenance 的 maskTools20261021。渐变和形状预览使用独立暂存蒙版，正式 timeline、保存快照和链接根在提交前不变；取消不产生历史。合成后按旧版规则转灰度，保留无蒙版快路、普通填充紧凑路径及内存预算。

ASE 原路径保存、另存为、格式损失选择、异步快照/队列与失败保护由现有保存工作器承接；原生工程保存仍保留可编辑结构。主页接入最近三条公告原生卡片与左侧独立滚动，详见 release-notes-migration-20261021.md。

## 明确缺口

蒙版缩放/裁剪、选区变换/粘贴及旧内联蒙版仍有明确限制；本轮不宣称全部迁移。ASE 导入仍忽略 slices，已经丢弃的信息不能靠原格式保存恢复。全仓 strict provenance 因已知缺口应失败。

## 验证

正式统一串行构建成功：moonsprite-native、attached-masks-tests、aseprite-io-tests、aseprite-save-policy-tests。首轮只有公告裁剪类不可见错误；将现有 PhysicalViewportClip 原样提升到共享 native_widgets.h，相关依赖统一重编成功。没有在失败混合对象上验收。

模型三个独立进程均 exit 0：attached-masks-tests、aseprite-io-tests、aseprite-save-policy-tests。蒙版覆盖填充/图案/前景选区、五类形状和渐变的预览取消/提交/撤销、链接根隔离、锁定阻止及保存预览保护。两处首次 fixture 断言纠正：active 预览按已有 gate 拒绝保存，取消后再验证归档无预览像素；ASE effects fixture 必须先有可见像素才能合法创建附加蒙版。未放宽生产 gate。

正式 exe 三个实际入口均 exit 0：--attached-masks-check、--aseprite-save-check、--home-announcements-check。ASE 使用真实异步 worker/快照/原子文件写入，覆盖原路径 Save、分离 SaveAs、同代合并、新修订队列、取消/继续格式/改工程选择、偏好取消、失败保留 dirty/重试。系统文件选择器注入路径，格式兼容弹窗真实打开并选择。主页检查卡片点击版本映射、短/高布局、历史与右滚动隔离；两张 BMP 已生成，本轮没有单独人工图像验收，不据此宣称视觉通过。

结果：native/build/lcd-mask-save-home-models.json、lcd-mask-save-home-smokes.json；owned 根 native/build/lcd-mask-save-home-20261021-184131。ASE 失败测试及结果保留在 native/build/Release/aseprite-save-ui-owned，本轮不删除用户数据。

来源覆盖 434 文件通过（exit 0），strict 按已知全仓缺口失败（exit 1），日志见 native/build/lcd-mask-save-home-provenance*.log。文档/来源核对、自动模型和实际程序运行范围分别如上，未宣称全仓迁移或视觉验收完成。

正式产物 native/build/Release/moonsprite-native.exe：17,135,104 字节，UTC 2026-10-21T10:38:05.1549412Z，SHA256 FF686E410CB3951A46E66666A53D019C92850C865543AC3D0078CA691A3038D0。唯一启动入口 native/start-native.bat。
