# 大型领域模块定位索引

[返回解耦契约](../architecture-decoupling.md)

本文记录已经落地的职责拆分；源码规模快照更新于 2026-09-19，验证记录保留当次执行范围。原公开入口保留，内部模块直接依赖实际所有者，不得回导自己的聚合入口。路径均相对 `src/renderer/src/`。

## 文件规模

“拆分前”为当次重构基线，“当前入口”和“最大子模块”为 2026-09-19 源码统计（不含测试与基准）。行数变化不等于运行成本变化。

| 原文件 | 拆分前 | 当前入口 | 最大子模块 |
| --- | ---: | ---: | ---: |
| store/workspace-commands-animation.ts | 2746 | 38 | 483 |
| store/workspace-commands-view-selection.ts | 2620 | 40 | 587 |
| core/canvas-input.ts | 1918 | 147 | 478 |
| core/project-format.ts | 2441 | 24 | 685 |
| components/canvas-composite-cache.ts | 1972 | 840 | 341 |
| core/document-composite.ts | 1988 | 20 | 691 |
| core/tools-selection-transform.ts | 1632 | 27 | 481 |

## Store 命令

每个子工厂通过 `WorkspaceCommandContext` 声明用到的跨命令能力，返回本领域命令的 `Pick`。组装入口不再拥有事务主体；同一命令内的修改、历史记录、失效和通知顺序完整保留。子工厂不获取根 Store，也不复制会话状态。

| 任务 | 实现模块 |
| --- | --- |
| 帧、Cel、蒙版选择与焦点 | store/workspace-commands-animation-selection.ts |
| Cel 透明度、属性、连接、删除 | store/workspace-commands-animation-cel-properties.ts |
| Cel 跨文档复制、粘贴与移动 | store/workspace-commands-animation-cel-clipboard.ts |
| 帧跨文档复制、粘贴与移动 | store/workspace-commands-animation-frame-clipboard.ts |
| 蒙版复制、粘贴、移动与连接 | store/workspace-commands-animation-mask.ts |
| 播放状态、步进、循环区段 | store/workspace-commands-animation-playback.ts |
| 帧增删、GIF 导入、时长与禁用 | store/workspace-commands-animation-frame.ts |
| 视口、网格与平铺显示 | store/workspace-commands-view.ts |
| 选区属性、工具设置、选框历史 | store/workspace-commands-selection-properties.ts |
| 图层/文字变换开始、预览、提交、取消 | store/workspace-commands-selection-transform.ts |
| 删除、填充、描边、抗锯齿预览 | store/workspace-commands-selection-effects.ts |
| 浮动选区与粘贴的预览、提交、取消 | store/workspace-commands-selection-floating.ts |
| 选区移动、居中与关联撤销 | store/workspace-commands-selection-move.ts |
| 选区翻转与关联撤销 | store/workspace-commands-selection-flip.ts |

此前已有的动画与选区辅助模块继续持有对应领域规则。跨文档粘贴辅助函数随剪贴板流程归属，抗锯齿回滚与描边偏好随效果流程归属。

治理复核进一步将 Cel 跨文档颜色/类型转换迁入 `store/workspace-animation-cel-conversion.ts`，将四边形与剪切计算迁入 `store/workspace-selection-transform-geometry.ts`。调用方直接依赖这两个所有者；原动画和选区辅助模块分别降为 224、150 行，保持原有 300、250 行预算。17 个组件输入模块直接导入核心输入契约、控制器和具体规则模块，不再经过 `core/canvas-input.ts` 聚合入口。

## Core 输入与选区变换

| 模块前缀 | 后缀与职责 |
| --- | --- |
| core/canvas-input- | contracts：拖拽与点类型；pointer：压感、合并采样、速度；controller：输入状态与设备切换 |
| core/canvas-input- | navigation：平移/缩放；hit-test：手柄与内容命中；path：路径、套索与临时历史 |
| core/canvas-input- | preview：预览归属与掩码；resize：尺寸、旋转、比例约束；state：已有的临时移动与选框缓存 |
| core/tools-selection-transform- | types：变换契约；source：源捕获、源翻转；translation：平移预览、提交与像素历史 |
| core/tools-selection-transform- | rotsprite：优化旋转采样及其 WeakMap；raster：目标栅格与打包预览；apply：对称、提交、移动与翻转 |

共享几何和像素编辑内核仍是唯一算法入口。RotSprite 缓存归采样模块，路径的临时撤销控制器归路径模块；输入状态不再把压感适配与所有选区几何定义放在同一文件。

## 工程格式

| 实现模块 | 职责 |
| --- | --- |
| core/project-format-manifest-types.ts | Manifest、版本常量与保存/Worker 消息契约 |
| core/project-format-raster.ts | 稀疏栅格编码、解码、存储紧凑化 |
| core/project-format-manifest.ts | Manifest 迁移、校验、规范化与预览图 |
| core/project-format-encode.ts | 资源归档构建与同步 ZIP 编码 |
| core/project-format-save.ts | 增量保存基线、Worker 请求生命周期及异步保存 |
| core/project-format-metadata.ts | 图库元数据与展开像素内存估算 |
| core/project-format-decode.ts | 图层/动画/瓦片资源还原与完整工程解码 |
| core/project-format-zip.ts | 已有 ZIP 目录读取与受限资源解压 |

保存基线和待处理 Worker 请求仍只有一个模块实例拥有。Worker URL 相对目录、消息结构和一次打开的解码流程保持原样。当前完整解码函数仍约 500 行，是明确保留的协调流程。

## 文档合成与画布缓存

| 模块前缀 | 后缀与职责 |
| --- | --- |
| core/document-composite- | plan：蒙版、图层/分组排序与合成栈；style-geometry：样式距离场与边界；style-types：样式块契约 |
| core/document-composite- | cache：行、瓦片、样式块与计划缓存；raster：像素混合；region：区域/整图合成；sampling：点采样 |
| components/canvas-composite-cache- | blitter：设备像素对齐；gpu：浏览器混合预览；move：移动预览及 GPU 回退 |
| components/canvas-composite-cache- | selection：选区/剪贴板/变换栅格预览；surfaces：表面契约、共享动画表面与键；geometry：已有矩形与裁剪规则 |

画布缓存主类保留失效协调、位图调度、完整表面与区域表面的生命周期。移动和选区渲染器各自拥有预览资源，主类通过清理方法释放资源；GPU 预览由移动渲染器拥有。选区渲染器只接收背景表面/区域绘制回调，不引用整个主缓存对象。设备对齐由同一个 blitter 实例提供，保持各绘制路径的一致性。

文档缓存与像素混合模块之间通过类型引用及明确方法合作；像素混合模块不实例化缓存，也不回导公开聚合入口。渲染像素算法和缓存失效时序沿用原实现。

## 防回退与验证边界

新增文件均登记规模预算；拆出的输入、缓存、文件和命令路径继续进入 D3，性能分级与定向范围也同步覆盖新文件名。模型/像素内核对合成器的依赖禁令覆盖所有合成子模块，边界检查禁止子模块回导自身聚合入口。

以下为拆分时的历史验证记录，未在本次文档审校中重新运行。

验证采用与 `pnpm check:dev -- --risk=high` 相同的入口，用参数数组避开 Windows 命令行长度限制；清单包含工作区已有的高风险改动。最终通过 Node/Web 类型检查、70 项规则测试（包括真实生产依赖图无运行时循环）、定向模块边界检查，以及 19 个行为测试文件的 408 项测试。

行为验证先通过 18 个文件和缓存文件的 48 项测试；剩余一项引用了迁移前的私有预览字段。将该断言改为检查真正传给 `drawImage` 的表面像素后，仅补跑受影响的缓存文件，49 项全部通过。此调整保留画布外预览移回中心后清除残留像素的原断言。日志为本地 `output/domain-split-validation.log` 和 `output/domain-split-cache-validation.log`；后者的 D3 验证通过，`git diff --check` 也通过。

定向测试覆盖编解码、合成像素、输入、选区变换、动画剪贴板与播放、浮动提交和历史。缓存使用模拟画布检查像素与绘制调用，不等同于真实浏览器的视觉验收。

未执行全量测试、性能矩阵、构建或桌面回归，不据此宣称性能提升。后续应优先收窄完整解码、浮动提交和样式缓存的协调职责，不把长事务任意切成依赖整份上下文的辅助函数。
