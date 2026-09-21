# 官网架构审计与优化记录

审计范围：`src/App.tsx`、`src/router.ts`、`src/pages/`、`src/ui/`、`src/styles.css` 和 `docs/ui-design-system.md`。本次基线检查通过：`pnpm check`。

## 初次审计结论（实施前）

官网已经有清晰的视觉基础：深浅主题 token、统一控件高度、页面级 `Panel` / `PageHeader`、独立的 `/ui` 画廊，以及长文档按需加载。问题集中在“规范已定义，页面仍有旧入口”——目前存在两套组件语言和两套页面壳。

### P0：收敛组件入口

`src/ui/index.tsx` 是目标组件入口，但 `src/ui/legacy.tsx`、`Account.tsx`、`Market.tsx`、`Blog.tsx` 仍直接拼装 `.button`、表单 label、选项卡和页面标题。这样会造成：

- 同一种操作在不同页面出现不同高度、间距和焦点态；
- 设计 token 的变更无法覆盖旧页面；
- `/ui` 画廊无法代表真实页面的全部交互。

迁移顺序：先把高频交互（`Button`、`IconButton`、`FormField`、`Alert`、`PageHeader`）覆盖账户、市场和结算，再处理文档侧栏和营销区块。旧文件只保留无视觉语义的组合逻辑（图片、滚动监听、路由辅助）。

### P1：拆分 App 壳与路由表

`App.tsx` 同时负责主题、语言、菜单、SEO、滚动、导航、路由分发和页脚，新增页面会继续放大耦合。建议拆为：

```text
src/app/
  AppShell.tsx       # chrome、主题、语言、footer
  SiteNavigation.tsx # 主导航、移动菜单、账户/购物车工具组
  routeTable.tsx     # route -> page renderer + title metadata
  useSitePreferences.ts
src/pages/
  ...
```

`routeTable` 只返回页面组件和元信息，页面不再知道菜单或主题实现。这样可以在不改页面的情况下增加登录、卖家和管理区的访问策略。

### P1：把信息层级从“视觉命名”升级为“任务命名”

当前主导航把首页锚点、文档、市场、FAQ、Blog、社区和 GitHub 放在同一层。对首次访问者，核心路径应是：

```text
了解 MoonSprite → 看功能与作品 → 下载/购买 → 获取帮助
```

建议主导航保留「功能」「作品/市场」「文档」「帮助」，把 Blog、社区、GitHub 放入“更多”或页脚；账户、购物车和主题切换继续作为工具区。首页首屏只保留一个主要行动，次要行动降为文本链接。

### P2：形成明确的页面模板层

约定三类模板，避免每个页面重新发明布局：

1. `MarketingPage`：Hero、内容区块、最终行动；用于首页和市场入口。
2. `ContentPage`：`PageHeader` + 可选左右目录 + 正文；用于 Docs、FAQ、Blog、Support。
3. `WorkspacePage`：`PageHeader` + `Panel` 网格；用于 Account、Settings、Studio、Orders。

模板只控制结构，文案和数据留在页面模块；响应式断点、内容宽度和区块间距由 token 统一控制。

## 组件库目标

组件 API 以用户任务命名，页面禁止直接写设计类名：

| 层级 | 组件 | 责任 |
| --- | --- | --- |
| 基础 | Button、IconButton、Chip、Select、Checkbox | 操作与选择 |
| 表单 | FormField、FileField、ChipField | 标签、提示、错误、计数 |
| 反馈 | Alert、EmptyState、LoadingState | 状态和下一步 |
| 布局 | PageHeader、Panel、PageShell | 页面层级和节奏 |
| 内容 | OutlineNav、AppWindow、ProductImage | 文档与产品叙事 |

每个组件在 `#/ui` 展示默认、焦点、禁用、错误和窄屏状态；组件新增 token 时同步更新该画廊和 `docs/ui-design-system.md`。

## 分阶段实施

1. **组件收敛（1 个小迭代）**：清理页面中的直接 `.button` 和手写表单，补齐 `EmptyState` / `LoadingState`。
2. **页面模板（1 个小迭代）**：引入三类模板，迁移内容页和账户页，保持 hash 路由不变。
3. **壳与路由（1 个小迭代）**：拆 `App.tsx`，建立 route table 和页面级 metadata。
4. **信息架构（产品确认后）**：调整主导航顺序和首页 CTA；这一步需要结合真实转化目标，不应仅凭代码推断。

## 验收标准

- 页面不再直接声明 `.button`、手写字段外壳或重复提示色；
- `/ui` 能覆盖每个公共组件的状态；
- 390 / 768 / 1440 宽度无横向溢出；
- `pnpm check` 通过；
- 路由、语言、主题和购物车行为保持现状。


## 2026-09-22 实施结果

本轮以已有未提交修改为基础实施，保留账户、市场与数据模块的现有业务逻辑。

| 问题 | 已实施修复 |
| --- | --- |
| 首页强制深色，主题切换表现不一致 | 移除固定深色作用域，全站继承同一组深浅主题变量 |
| 字体名称和字号同时占用 `--font-body` | 字体族改为 `--font-sans`，修复失效声明 |
| App 同时承担导航与页脚 | 独立 `SiteNavigation` / `SiteFooter`，保留已存在的偏好、SEO 与路由模块 |
| 主导航入口过密 | 主导航聚焦作品、功能、文档、市场与 FAQ，博客和 GitHub 保留在页脚 |
| 大量空白 GIF 占位 | 真实软件截图与紧凑功能说明取代占位卡 |
| 页面头部重复结构 | 公共 `PageIntro` 模板覆盖设置、购买、订单、支持、结算、许可与组件画廊等页面 |
| 组件入口与 legacy 存在循环依赖 | barrel 仅导出，基础组件独立为 primitives |
| 加载无可读反馈、空态分散 | 新增 LoadingState、EmptyState，路由加载和购买空态接入，并加入组件画廊 |
| 全站样式集中在一个超长文件 | 按八类职责拆分，类名检查同步覆盖所有分片 |
| 禁用链接仍能获取焦点、菜单缺少退出操作 | 原生 disabled、Escape 关闭菜单、切换路由关闭菜单 |

本轮验证：网站 `pnpm check`（TypeScript 与样式类检查），以及 CSS 定向解析。未执行全量构建、桌面回归或交易链路测试。未改动 API、订单持久化和权限策略；本记录不将这些既有业务模块声明为已完成全面审计。
