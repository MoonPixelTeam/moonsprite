# 发布检查表

中文 | [English](release-checklist.en.md)

只有明确要求发布当前 Beta、后续正式版本或交付安装包时才执行本流程。连续开发中的普通代码修改不自动进入发布门禁或打包；目标版本号以三份项目清单的一致值为准。

## 发布前

- [ ] 工作区干净，目标提交已推送并通过 CI。
- [ ] 已记录本周期基线提交 SHA，并审计该基线后的完整 diff。
- [ ] `CHANGELOG.md` 的“未发布”区已逐项记录本版本全部变化，没有删除或压缩既有有效条目。
- [ ] 发布归档只移动“未发布”条目到 `docs/changelog/<版本>.md`，条目正文保持完整，并重新建立空的“未发布”区。
- [ ] 根目录与 `docs/changelog/README.md` 的版本索引均已链接新归档。
- [ ] “帮助 > 更新日志”的版本号和摘要已更新为本次归档内容，不继续展示上一版本的摘要。
- [ ] 首页“新闻”的版本号、发布日期和摘要已同步为本次归档，并可打开与“帮助 > 更新日志”相同的完整更新内容。
- [ ] 内部 SemVer 在 `package.json`、Cargo 和 Tauri 配置中一致。
- [ ] 当前应用显示版本、最近已打包版本和归档索引符合 `docs/release/development-cycle.md`；`pnpm check:version -- --release` 通过。
- [ ] 项目文件格式变更包含迁移、兼容测试和 ADR。
- [ ] 没有提交用户工程、恢复文件、工作区、密钥或安装包。
- [ ] 已完成本版本性能审计和最多两轮候选优化；已通过 `pnpm check:performance:accept` 生成与当前源码一致的性能发布凭证。

## 自动检查

```powershell
pnpm install --frozen-lockfile
pnpm check:performance:release -- <本周期相关文件...>
pnpm check:performance:verify -- --audit=<审计编号> --correctness-passed
pnpm check:performance:accept -- --audit=<审计编号> --outcome=<adopted|not-adopted|approved-no-change> --reason=<原因>
pnpm check:release
pnpm check:release -- --desktop # 需要真实桌面自动门禁时
pnpm package                     # 用户明确要求安装包时
```

每次 Beta 或正式版本发布都执行一次性能审计；普通连续开发不执行。`check:release` 只验证性能凭证，不重复运行性能基准。

## 安装版检查

- [ ] 在干净用户目录安装，首次启动无黑屏和重复弹窗。
- [ ] 内置示例出现在最近和画廊。
- [ ] 双击 `.moonsprite` 直接打开工程。
- [ ] 文件拖放、打开、保存、另存为和导出工作正常。
- [ ] 文件缩略图、桌面文件图标和“在文件夹中打开”正常。
- [ ] 关闭未保存工程、异常恢复和明确放弃行为正确。
- [ ] 卸载后应用程序文件清理正确，用户工程不被误删。

## 交付

- [ ] 记录安装包绝对路径、字节大小和 SHA-256。
- [ ] 不把 `release/` 内容提交到 Git。
- [ ] 记录本次发布提交 SHA，作为下一个周期基线。
- [ ] 正式发布创建带注释 Git tag；开发包只有用户需要时才创建轻量 tag。
