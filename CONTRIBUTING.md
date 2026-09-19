# 参与 MoonSprite 开发

中文 | [English](CONTRIBUTING.en.md)

MoonSprite 是原创实现。禁止提交复制自 Aseprite 或其他项目的源码、图标、主题和受保护资源。

## 贡献许可

除非另有书面协议，提交贡献即表示你有权提供该内容，并同意贡献内容按仓库当前的 MoonSprite Source-Available License 1.0 发布。你同时授予 MoonSprite 版权持有人永久、全球、非独占、免版税的权利，用于使用、修改、分发以及在官方商业二进制中销售包含该贡献的版本。你仍保留自己贡献内容的版权。

## 开发流程

1. 从 `main` 创建短期分支，名称使用 `feature/`、`fix/`、`refactor/` 或 `docs/` 前缀。
2. 阅读 `AGENTS.md`、`docs/README.md` 和任务相关契约。
3. 功能先写规格，Bug 先写复现步骤和回归测试。
4. 保持提交主题单一，禁止混入无关格式化或重构。
5. 开发时维护相关行为契约；仅在明确准备发布时，按 `docs/release/changelog-policy.md` 对照本周期完整差异集中更新 `CHANGELOG.md`，不得覆盖已发布记录。
6. 完成必要检查后提交 Pull Request。

## 完成标准

- 行为与对应契约一致。
- Bug 有自动化回归测试，像素算法使用确定性数据断言。
- UI 优先复用组件库，并验证默认、选中、禁用和交互状态。
- 没有把视图状态写入文档历史，也没有重复实现坐标换算。
- 按 `AGENTS.md` 的 D0-D3 分级完成必要检查；D2/D3 使用带本次文件清单的 `pnpm check:dev`，D3 同时提供真实定向测试。全量检查、完整构建和桌面回归只在对应专项或发布流程执行。
- 相关契约已同步；准备发布时再将本周期功能、修复、交互、性能、重构、依赖、构建和平台变化逐项写入 `CHANGELOG.md`。

## 提交格式

使用 Conventional Commits，例如：

```text
fix: keep selection aligned after rotating the view
feat: add project workspace export
docs: define brush alignment behavior
test: cover layer duplicate undo
```

禁止强制推送 `main`。依赖升级应独立提交，并说明升级原因和验证结果。
