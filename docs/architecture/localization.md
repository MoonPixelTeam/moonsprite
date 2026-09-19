# 多语言架构

中文 | [English](localization.en.md)

MoonSprite 的界面语言由纯 TypeScript 语言目录和 React 语言上下文共同管理。当前提供简体中文 `zh-CN`、英语 `en-US`、日语 `ja-JP`、韩语 `ko-KR`、西班牙语 `es-ES`、法语 `fr-FR`、德语 `de-DE`、巴西葡萄牙语 `pt-BR` 和俄语 `ru-RU`。各目录均以完整键集合注册；翻译键和插值占位符必须与基准目录逐项一致。

## 模块边界

- `locales/<locale>.ts` 分别保存每种语言的独立资源；简体中文目录定义完整翻译键集合。
- `core/localization.ts` 是语言代码、可用语言列表、目录注册、默认回退和变量插值的唯一入口，不依赖 React 或 Tauri。非 React 的核心算法和状态模块通过 `translateCurrent()` 读取当前持久化语言，不得各自读取或解析语言代码。
- `components/I18nProvider.tsx` 读取全局语言偏好，为 React 组件提供 `locale` 与 `t()`，并在首选项应用后同步更新 `document.documentElement.lang`。
- `platform/tauri-api.ts` 在调用打开、保存和导出命令时传递当前语言；`src-tauri/src/platform_dialogs.rs` 通过 `platform_dialogs_localization.rs` 的九语言文案表选择原生文件对话框筛选器文案，不自行读取渲染器存储。
- `core/file-preferences.ts` 只持久化已经注册为可用的语言。未知、损坏或尚未完整发布的语言代码统一回退到 `zh-CN`。
- 用户输入、工程名称、图层名称、文件路径和文档像素数据不得被翻译。

## 资源规则

1. 简体中文目录是翻译键和回退文本的权威来源，键名使用稳定的英文领域路径，例如 `app.menu.file.open`。
2. 新界面不得把后续需要翻译的文案只写在 JSX 中；应先增加翻译键，再通过 `useI18n().t()` 读取。
3. 动态内容使用具名占位符，不拼接依赖语序的半句。插值参数只允许字符串和数字。
4. 日期、时间、数字和百分比应使用当前 `locale` 对应的 `Intl` 格式化；快捷键、文件扩展名、品牌名和 API 标识符保持原样。
5. 新语言目录必须覆盖全部翻译键，并完成 1024 x 640、1080p 和 4K 下的文本溢出检查，才能加入 `AVAILABLE_APP_LOCALES`。
6. `TranslationCatalog` 在编译时要求完整键集合；`locales/catalogs.test.ts` 检查缺失和多余键、空值、插值占位符以及已知占位词回归。这些检查不等于母语审校或桌面排版验收。
7. TypeScript 核心层的用户可见错误和历史名称必须使用 `translateCurrent()`。Rust 错误后续应逐步返回稳定错误代码，由渲染器翻译；不得依赖解析中文错误句子决定程序行为。

## 当前迁移范围

简体中文、英语及新增语言目录覆盖相同的类型化键集合。启动、首页、编辑器菜单、工具栏、工具属性、弹窗、首选项、快捷键、图层、调色板、颜色编辑、组件库、保存导出提示、Windows 原生文件对话框、撤销历史以及 TypeScript 核心错误均已接入语言目录；在首选项应用语言后实时刷新界面并更新 `document.documentElement.lang`。用户输入、已有工程名称、图层名称、文件路径和像素数据保持原样。
