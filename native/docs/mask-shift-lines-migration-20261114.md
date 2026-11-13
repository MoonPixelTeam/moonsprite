# 蒙版 Shift 连线迁移

对照旧版 `createCanvasBrushConfig.ts` 的 session 端点、`canvas-input-line-connection.ts::beginLineConnection` 的绘制目标及最新历史校验，以及 `tools-brush.ts::inheritBrushPaintBaseline`，补齐蒙版的半透明 Shift 连线。蒙版 beginStroke 继承锚点原始像素，公共端点不再重复叠色；自由瓦片层上的活动蒙版使用蒙版事务，底层 Edit／Paint 模式不阻止蒙版连线。

端点与可继承底色按旧版分别处理。切换图层或进入／退出蒙版仍保留同一工程、同一帧的端点；只有绘制目标 ID 与当前历史版本匹配时复用底色并合并前一笔撤销。记录实际蒙版 ID，防止同一历史版本下误用原图层底色或把图层笔画与蒙版笔画合并。自由瓦片 Paint 模式本身仍不开放源连线入口。

核心蒙版回归先真实复现公共端点二次变暗，保留原预期后修复。八组图层／组、链接／独立、偏移／无偏移组合均验证连线预览、实际像素、撤销与重做。唯一正式程序新增 `--tile-repeat-check` 的 `mask-shift-lines` 阶段：四种平铺 × 普通图层／网格瓦片／自由瓦片 Edit／自由瓦片 Paint／组蒙版 × 绘制／擦除，共 40 组实际鼠标输入。检查渲染灰度、逐像素提交结果、共享端点、合并撤销、重做、后续笔画取消，并断言底层像素、单元格、实例和瓦片资源不变。另有同一历史版本从普通图层进入蒙版的实际 Shift 输入，确认保留连线、拒绝跨目标底色和撤销合并。

最终验证：attached-masks-tests 完整检查退出 0；唯一正式 Release 构建成功；mask-shift-lines 的 40 组及切换目标检查退出 0；mask-brush-preview、shift-lines、free-source-preview 三个相关正式程序阶段退出 0；brush-preview CTest 通过 0.91 秒。旧版 canvas-render-brush-path.test.ts 与 document-mask-composite.test.ts 共 13 项通过（4.44 秒）。来源覆盖 929 文件及证据快照、Editor 边界 587 源文件、diff 检查通过。没有新增视觉布局，未进行人工截图验收；不扩大为全部颜色格式、笔刷动态或完整桌面验收。

新增夹具初次编译因类型声明与网格 Cel 无通用相等运算而失败，改为独立声明和明确字段比较；首次运行的退出蒙版断言错误要求自由瓦片 Paint 提供源连线，已按旧版门禁修正，并补充同版本跨目标实际笔画验证。没有弱化像素或撤销断言。保留全部用户数据与既有日志。本阶段仅功能迁移，整体仍 INCOMPLETE。
