# 发布检查表

只有明确要求交付安装包时才执行本流程。开发中的普通代码修改不自动打包。

## 发布前

- [ ] 工作区干净，目标提交已推送并通过 CI。
- [ ] `CHANGELOG.md` 已记录用户可见变化。
- [ ] 内部 SemVer 在 `package.json`、Cargo 和 Tauri 配置中一致。
- [ ] 项目文件格式变更包含迁移、兼容测试和 ADR。
- [ ] 没有提交用户工程、恢复文件、工作区、密钥或安装包。

## 自动检查

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm bench:selection
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
pnpm build
pnpm test:tauri
pnpm package
```

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
- [ ] 正式发布创建带注释 Git tag；开发包不创建正式版本 tag。
