# MoonSprite 开发规则

中文 | [English](AGENTS.en.md)

日常规则唯一入口。详细发布、性能和恢复流程见 [docs/agent-workflow.md](docs/agent-workflow.md)，项目文档索引见 [docs/README.md](docs/README.md)。普通任务只读取中文规则和直接相关契约，不扫描英文镜像、历史归档或无关模块。

## 工作边界

- 每个新需求首次检查一次 `git status`，保留用户已有差异；默认由当前 Agent 负责写入，同一工作区只允许一个写入任务。可并行只读检索、测试或分析，或使用独立工作树；任何任务都不得覆盖其他任务的改动。
- 普通需求不自动创建、派生或保留子 Agent，也不在同一 checkout 并发写入；只有用户明确要求整项目架构审计或大型跨模块重构时，才允许一个只读架构 Agent，且不得继续派生。用户说“继续”只续当前任务，不重新扫描或重新派生。
- 普通任务启动沿用全局 `gpt-5.6-terra` + `low`；不得为普通 UI、Debug 或审查升到 `gpt-5.6-sol`/`ultra`，只有用户明确要求或复杂架构任务才升级。任务级设置可能覆盖全局，切换后应新建/重启任务。
- 不设置定时“继续”、后台轮询或盲目重试；遇到 403/429 只记录一次，随后等待服务恢复或切换到新的轻量任务。发现 Codex 磁盘不足或旧 rollout 过多时只报告并请求用户归档，不自动删除。
- 普通需求默认一个实现回合加一次定向检查，达到可验收状态立即结束；默认上限为 20 次工具调用或 30 分钟。超出上限先汇报，不因子任务未结束持续轮询；复杂任务须由用户明确放宽。
- 当前处于 Beta 迭代；实际版本号以 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 的一致值为准。只有用户明确要求发布、准备发布或生成安装包时才进入发布流程、更新日志或打包。
- 上下文压缩、换模型或暂停后继续仍是同一需求；使用已有摘要，只有缺少下一步事实时定向补读，不因压缩重跑检查。

## 风险与检查

- D0：文档、文案、CSS；直接交付用户验收。
- D1：普通 UI、菜单、弹窗和低频交互；默认直接交付。
- D2：一般 Core、Store、Shared 和快捷键；稳定后运行一次 `pnpm check:dev -- <文件...>`。
- D3：坐标、选区、撤销、文件格式、持久化、平台安全、共享核心算法，以及画布、工程 IO、恢复和解码路径；运行 `pnpm check:dev -- --risk=high <源文件...> <定向测试...>`。
- 验证脚本会自动识别 D3 路径；JavaScript/TypeScript D3 必须带一个真实定向测试（`.test`、`.spec` 或 `.bench`），Rust D3 默认运行对应 `cargo check`，显式传入 `src-tauri/**/tests/*.rs` 时改跑对应 `cargo test --test`，不得附带无关 JS 测试。
- 性能审计是昂贵入口：`check:performance` 和 `check:performance:release` 必须显式传文件；只有明确全仓库审计时才传 `--all`，不得把省略文件当作全量。
- 普通开发不运行维护门禁、全量测试、性能矩阵、完整构建、浏览器自动验收或桌面回归。出现确定错误时只重跑受影响的检查。
- 超大源码文件先用 `rg` 定位符号，再按行段读取；不要一次性加载整个 `CanvasStage.tsx`、`workspace.ts` 或完整历史日志。
- 没有新 diff、测试结果或根因证据时停止工具循环；连续两轮仍无进展就报告现象、判断和唯一下一步。

## 不可破坏的契约

- 坐标转换复用统一几何函数；视图移动、缩放、旋转和栏目布局不得进入文档撤销历史。
- 组件只能通过 Store 领域命令或事务写文档，不得直接改 `SpriteDocument`、dirty、revision、invalidation 或 `HistoryStack`。
- `encodeProject`/`decodeProject` 只属于文件和恢复边界，不用于撤销快照；一次打开只完整解码一次，异步工程任务不得先在 UI 线程复制整份文档。
- 保存和恢复错误必须进入可观测通道；禁止空 `catch` 静默吞错。
- `core/` 不依赖 React、components、platform 或 store；`store/` 不反向依赖 components；Tauri API 只从 `platform/` 访问；渲染键不得序列化像素或整份文档。
- UI 优先复用组件库和像素图标，容器保持直角，主操作色为 `#2979FF`。
- 不强制推送，不提交生成物、安装包、用户工程、恢复文件或密钥。

## 命令

```powershell
pnpm check:dev -- <本次文件...>
pnpm check:dev -- --risk=high <源文件...> <定向测试...>
pnpm check:performance:release -- <本周期文件...>
pnpm check:release
```
