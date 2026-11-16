# 画布参考图迁移（2026-11-16）

本阶段接入原生画布参考图的文档、资源、历史和实际交互链路。完整 SVG 浏览器兼容仍未完成，不能将本阶段视为全部参考图能力已等价。

## 实际旧版来源

- `legacy/src/renderer/src/store/canvas-references.ts`、对应测试：添加、替换、锁定、固定、重置、排序和独立历史。
- `legacy/src/renderer/src/components/CanvasReferences.tsx`、对应测试：指针优先级、属性面板、导入、动画与取消。
- 同目录 `canvas-reference-geometry.ts`、`canvas-reference-input.ts`、`canvas-reference-sampling.ts`：变换、命中与原始颜色采样。
- `legacy/src/renderer/src/core/project-canvas-references.ts`：项目资源编码与迁移；`canvas-input-resize.ts`、`canvas-input-hit-test.ts` 和 `store/workspace-commands-history.ts`：几何及历史路由。

## 本阶段实现

引用数据由 Document 持有，源数据不可变共享。预览不进入保存，提交只产生一条元数据历史；撤销、重做、快照、工程回滚和资源替换／删除均保存真实引用。引用编辑不修改作品像素，不触发动画内容投影或录像内容变化。

接入添加／粘贴替换、移动、缩放、旋转、翻转、透明度、锁定、固定、重置、置前、删除、属性数值与滑块。保留旧版整数／中心缩放及指针优先级、最后移动位置提交、取消语义。普通浮动像素优先取消，引用撤销停止播放。固定转换保留显示位置；取色读取源像素而非叠加后的透明度。

异步解码绑定最初工程，完成时仅修改仍打开的原工程；关闭工程丢弃完成结果，失败替换保留旧资源与历史。WIC／Skia 替换浏览器解码，支持静态图、GIF／WebP 动画与已验证的 SVG 栅格化路径；PixelDialog 替换 HTML 属性层，复用旧版图标和共享选中素材。

## 已执行验证与限制

- 真实旧版两个文件 38 项测试通过。
- 原生事务、持久化、资源清理、快照／回滚、异常历史、静态／动画解码和实际旧版提取的 24,064 组几何对照通过。
- 唯一正式 Release 构建成功；`canvas-references-ui` 通过（1.48 秒），覆盖属性、撤销、取色、跨工程／关闭工程／失败异步完成，以及四个角度逐像素渲染 alpha 与边框命中一致。
- 重新构建后的文档事务、快照和动画绑定三项 CTest 通过（共 0.77 秒）。
- 来源覆盖及快照检查通过；构建中的 Editor／架构边界检查通过。整体迁移仍 INCOMPLETE。
- 截图仅显示恢复后的工作区，不能作为参考图属性窗口的人工视觉验收证据；属性控件已做实际程序断言。
- SVG 的浏览器 CSS、SMIL、foreignObject 和外部资源行为尚未验证等价，继续登记缺口；本阶段不声称完整 SVG 兼容，也没有进行性能优化。
