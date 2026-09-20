# MoonSprite 官网 UI 设计规范

本文定义 moonsprite 官网（`website/`）的界面基础与组件规格。官网是桌面版《UI 设计规范》的姊妹文档：**凡是两者都覆盖的内容，组件名称、状态规则与 token 语义以桌面版为准**；官网特有的部分（营销版式、货币、组件库画廊）在本文件补充。

## 与桌面版的关系

| | 桌面版 | 官网 |
| --- | --- | --- |
| 场景 | 长时间、高频像素编辑 | 浏览、了解、购买 |
| 密度 | 紧凑（控件 26–38px） | 宽松一档（控件 40px） |
| 字号 | 两档（11 / 13px） | 两档正文 + 展示级标题 |
| 图标 | 只能使用组件库像素图标，**禁止 lucide 等矢量图标库** | 使用 lucide 矢量图标 |

官网在图标上**有意与桌面版不同**：桌面版处于像素画布旁，矢量图标会与作品争夺注意力；官网是网页，图标只承担导航与操作提示，且需要任意缩放与视网膜清晰度。这是明确的分歧，不是遗漏。

## 设计原则

1. **一切内容都是组件。** 页面只负责取数、排版与文案；任何按钮、输入、提示、面板都必须来自 `src/ui/`，不得在页面里拼装近似结构。
2. **token 而非数值。** 颜色、间距、字号、控件高度只使用语义 token（`src/styles.css` 顶部的 `:root`）。禁止在局部写近似的 px 值。
3. **直角与 1px。** 所有容器保持直角，层级靠表面明度与 1px 边框表达，不使用圆角与阴影堆叠。
4. **`#2979FF` 是唯一强调色。** 用于选中、焦点、主要操作。琥珀 `--warn` 专用于价格与眉标，绿色 `--success` 只用于完成态，红色 `--danger` 只用于真实错误。
5. **面板内不嵌套面板。** 页面级容器是 `Panel`，面板内的分组用分隔线与小标题，不再套一层带边框的盒子。
6. **空态与错误是引导，不是心情。** 说清发生了什么、下一步点哪里。

## Token

### 颜色

深色为默认主题，浅色通过 `:root[data-theme='light']` 覆盖。首页固定深色（`.theme-dark`）。

| Token | 深色 | 用途 |
| --- | --- | --- |
| `--bg` | `#090a0d` | 页面底色 |
| `--panel` | `#10141b` | 面板、卡片 |
| `--surface` | `#171a21` | 抬升面 |
| `--raised` | `#20242d` | 标签、徽章底 |
| `--control` | `#0b0e13` | 输入框、下拉底 |
| `--border` / `--border-strong` | `#303641` / `#596271` | 常规边框 / 强调边框 |
| `--divider` | `#252b36` | 内部分隔线 |
| `--text` … `--text-4` | `#f1f4f8` … `#7f8998` | 四级文字 |
| `--accent` / `--accent-soft` | `#2979ff` / `#182a46` | 强调与强调底 |
| `--warn` / `--warn-soft` | `#ffab26` / `#45361d` | 价格、眉标、提示 |
| `--danger` / `--success` | `#ef5350` / `#66bb6a` | 错误 / 完成 |

表面纹理：`--page-dot` 点阵铺在站壳上（32px 网格），`--wash-strong` / `--wash-soft` / `--glow` 是区块与卡片的极淡光晕。

### 字体

| Token | 值 | 用途 |
| --- | --- | --- |
| `--font-pixel` | Silkscreen | 眉标、价格、订单号、计数 |
| `--font-body` | Segoe UI Variable / PingFang SC | 正文、按钮、字段、标题 |

| Token | 值 | 用途 |
| --- | --- | --- |
| `--font-pixel-tag` | 12px | 徽章、极小标签 |
| `--font-pixel-label` | 14px | 眉标、分组标题 |
| `--font-small` | 14px | 次要文字、元信息、紧凑控件 |
| `--font-body` | 16px | 正文、字段、按钮、导航 |
| `--font-lead` | 18px | 卡片标题 |
| `--font-h3` / `--font-h3-lg` | 20 / 24px | 区块内标题 |
| `--font-h2` / `--font-h2-lg` | 30 / 38px | 页面标题 |
| `--font-price` / `--font-price-lg` | 18 / 34px | 卡片价格 / 购买区价格 |
| `--font-display` / `--font-display-lg` | 44 / 56px | 首屏标题上限 |

### 间距

`--space-1` 2px 起，按 4px 步进递进，正文区常用档位如下。禁止新增相邻近似档位。

| Token | 值 | 典型用途 |
| --- | --- | --- |
| `--space-3` / `--space-4` | 6 / 8px | 图标与文字之间 |
| `--space-5` / `--space-6` | 12 / 14px | 控件内部、紧凑 gap |
| `--space-7` / `--space-8` | 16 / 18px | 字段之间、卡片内边距 |
| `--space-9` / `--space-10` | 20 / 24px | 面板内边距 |
| `--space-13` / `--space-16` | 32 / 40px | 大分组之间 |
| `--space-24` / `--space-26` | 80 / 96px | 页面区块上下留白 |

### 控件高度

| Token | 值 | 用途 |
| --- | --- | --- |
| `--control-height` | 40px | 输入框、下拉、标准按钮 |
| `.compact` 变体 | 32px | 行内次要操作、头部图标按钮 |

同一行的控件必须等高：输入框、下拉、按钮全部落在 `--control-height`。**历史坑**：下拉曾是固定 36px 而输入框被 padding 撑到 45px，且 `inline-flex` 带来基线空隙，导致同一行两个控件错位 29px。

## 组件

所有组件位于 `src/ui/`，页面从该目录导入。组件库画廊在 `#/ui`，**直接渲染真实组件**，不维护仿制样式。

### Button

```
<Button variant="primary|secondary" size="regular|compact" icon={...} href? disabled?>
```

- `primary`：实心强调色，一屏最多一个。
- `secondary`：描边，用于其余操作。
- 高度：`regular` 走 `--control-height`；`compact` 32px，用于行内与头部。
- 传 `href` 渲染 `<a>`，否则 `<button>`。禁用态保留可读性，不用 `pointer-events` 隐藏原因。
- 图标不改变按钮高度与内边距。

### IconButton

```
<IconButton label icon onClick? href? active?>
```

32×32，图标 16px，`label` 必填（写入 `aria-label`）。`active` 用于头部当前态（如已登录的账号图标、当前栏目）。

### Chip

```
<Chip active? onClick? remove?>{label}</Chip>
```

筛选标签、预设选项、已选标签共用这一个组件 —— 它们曾有三套不同内边距与选中样式，看起来像三个不同组件。`remove` 存在时渲染为可移除（带 ×）。

### Select

```
<Select value options label onChange />
```

自建下拉（`button` + `role=listbox`），**不使用原生 `select`**：原生弹层由操作系统绘制，无法套用主题。键盘行为与原生一致（↑↓ 移动、Enter 选择、Esc 关闭）。

### FormField

```
<FormField label badge? hint? invalid? counter?>{control}</FormField>
```

字段的统一外壳：标签行（标签 + `必填`/`选填` 徽章 + 计数）、控件、说明。**不要**在页面里手写 label + span + small 的组合。

### ChipField

`FormField` 的多选变体：预设 chips + 自定义输入。用于规格、格式、标签。自定义值显示在最前且可单独移除。

### FileField

拖放或点选文件，显示文件名与大小。原生 `input[type=file]` 用 `.visually-hidden` 隐藏 —— 且必须是 `position: fixed`，因为绝对定位的隐藏框仍会计入文档滚动宽度。

### Alert

```
<Alert tone="info|success|warning|danger" title? icon?>{body}</Alert>
```

统一提示块。成功态与错误态不得各写一套颜色。

### Panel

```
<Panel title? icon? actions?>{children}</Panel>
```

页面级区块容器：`--panel` 底、1px 边框、`--space-10` 内边距、顶部 3% 光晕。**面板内不再嵌套带边框的面板**，内部分组用分隔线和小标题。

### PageHeader

```
<PageHeader eyebrow title subtitle back? actions?>
```

页面开场：返回链接、眉标（像素字体 + 琥珀方点 + 延伸至栏宽的发丝线）、标题、副标题。

### OrderList

购买记录列表，含每个包的文件大小与下载/待补按钮。下载入口统一走 `src/api/files.ts`。

## 页面组装规则

1. 页面 = `PageHeader` + 若干 `Panel`，区块之间用 `--space-9` 至 `--space-13`，区块自身上下留白用 `--space-24` / `--space-26`。
2. 表单 = 若干 `FormField`，字段之间 `--space-7`，字段内 label 与控件之间 `--space-3`。
3. 一个操作在不同页面必须同名（`上架` → 成功提示写 `已上架`），按钮文案与结果提示共用同一词表。
4. 列表行 = 图标 + 主信息 + 次要信息 + 操作，列间距 `--space-6`，窄屏折行而不是横向滚动。

## 检查清单

1. 页面里是否出现 `className="button …"`、手写 label 组合、或自带一套提示色？→ 改为从 `src/ui/` 取组件。
2. 是否出现 token 之外的 px 值？→ 换成最近的 token。
3. 同一行的控件高度是否一致（输入 40 / 下拉 40 / 按钮 40）？
4. 页面在 390 / 768 / 1440 下是否都没有横向溢出？
5. `#/ui` 画廊是否仍能渲染每个组件的默认、选中、禁用与错误态？
