# MoonSprite 文档索引

中文 | [English](README.en.md)

这里是项目的中文规范入口，也是 AI 日常开发时唯一读取和维护的文档版本。页面顶部的 English 链接仅供人工阅读；普通任务不得跟随链接读取 `*.en.md`。代码与文档冲突时，先确认当前实现和测试，再更新对应中文契约，禁止让两个互相矛盾的说明长期共存。

现行指南与契约描述当前检出的源码；已打包范围单独见 `changelog/`。归档和性能测量保留原版本与测量背景，ADR 保留决策沿革，明确标注的后续决定优先。更新文档时应同时核对功能摘要、操作细节及其维护中的语言镜像，不能只更新版本号和标题。

## 产品与架构

- [MoonSprite 使用手册](user-guide.md)：面向使用者的中文功能说明与操作指南，优先介绍特色功能。
- [产品行为契约](product/behavior.md)：用户可见能力和稳定规则。
- [UI 设计规范](ui-design-system.md)：颜色、字号、间距、控件密度、像素图标和组件复用规则。
- [架构概览](architecture/overview.md)：模块职责和依赖方向。
- [状态与历史](architecture/state-history.md)：会话、dirty、撤销和视图状态。
- [坐标与渲染](architecture/coordinates-rendering.md)：屏幕、视图、画布和图层坐标。
- [多语言架构](architecture/localization.md)：语言资源、回退、持久化和新增语言门禁。
- [文件格式](file-format.md)：`.moonsprite` v20 容器。

## 交互契约

- [指针与修饰键](interactions/pointer-modifiers.md)
- [选区与变换](interactions/selection-transform.md)
- [笔刷与颜色](interactions/brush-color.md)
- [工作区与停靠](interactions/workspace-docking.md)

## 脚本开发

- [Lua 脚本与 MSE API](scripting/README.md)
- [.msext 扩展开发](extensions/README.md)：包结构、清单字段、贡献点、限制和生命周期。
- `.msext` 扩展包格式与安装行为见 [扩展包 ADR](adr/0020-extension-package-format.md)。
- 常驻扩展的权限、事件和宿主 API 见 [Extension Runtime v1](extensions/runtime-api.md)。

## 质量与发布

- [回归矩阵](testing/regression-matrix.md)
- [性能基线](testing/performance-baseline.md)
- [性能更新记录](testing/performance-history.md)
- [完整更新日志规则](release/changelog-policy.md)
- [开发版本周期](release/development-cycle.md)
- [历史更新日志归档](changelog/README.md)
- [发布检查表](release/release-checklist.md)
- [架构决策记录](adr/README.md)

日常 Agent 规则、风险分级和命令入口见 [AGENTS.md](../AGENTS.md)；发布、性能和上下文恢复流程见 [开发工作流](agent-workflow.md)。其他文档只在任务触及时定向读取，过期内容移入 `archive/`。

扩展作者参考：[快速开始](extensions/quickstart.md)、[完整清单](extensions/manifest.md)、[宿主表单](extensions/ui-form.md)、[完整 API 索引](extensions/api-index.md)、[Lua 兼容层](scripting/compatibility-api.md)。
