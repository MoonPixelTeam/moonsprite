export type Language = 'zh' | 'en'

interface DocBlockP { kind: 'p'; text: string }
interface DocBlockH3 { kind: 'h3'; id: string; text: string }
interface DocBlockUl { kind: 'ul'; items: string[] }
interface DocBlockCode { kind: 'code'; text: string }
type DocBlock = DocBlockP | DocBlockH3 | DocBlockUl | DocBlockCode
interface DocSection { id: string; title: string; blocks: DocBlock[] }
export type DocsOutlineEntry = { kind: 'page'; id: string } | { kind: 'group'; id: string; title: string; children: string[] }
interface DocsContent { title: string; subtitle: string; sections: DocSection[]; outline: DocsOutlineEntry[] }
interface FaqItem { id: string; q: string; a: string }
interface FaqCategory { id: string; title: string; items: FaqItem[] }
interface FaqContent { title: string; subtitle: string; categories: FaqCategory[] }
interface BlogSection { id: string; heading: string; paragraphs: string[] }
interface BlogPost { id: string; date: string; title: string; excerpt: string; sections: BlogSection[] }
interface BlogContent { title: string; subtitle: string; backToList: string; readMore: string; posts: BlogPost[] }
interface FooterColumn { title: string; items: { key: string; label: string }[] }
interface FeatureCard { title: string; body: string; icon: string }
export interface MarketContent {
  title: string
  subtitle: string
  shelfEyebrow: string
  shelfTitle: string
  shelfBody: string
  animations: Record<string, string>
  pets: Record<string, string>
  categories: { all: string; pets: string; assets: string; bundles: string }
  search: string
  searchHint: string
  sort: string
  sortOptions: { featured: string; priceAsc: string; priceDesc: string }
  count: (visible: number, total: number) => string
  empty: { title: string; body: string; action: string }
  card: { details: string; add: string; owned: string; save: string; bundleOf: (count: number) => string; valueOf: (price: string) => string; loops: (count: number) => string }
  detail: {
    back: string
    eyebrow: string
    preview: string
    includes: string
    bundleContents: string
    specs: string
    formats: string
    size: string
    license: string
    licenseBody: string
    buy: string
    related: string
    frames: (count: number) => string
    notFound: string
  }
  cart: { title: string; open: string; close: string; empty: string; subtotal: string; remove: string; increase: string; decrease: string; checkout: string; checkoutSoon: string; note: string; continue: string; clear: string }
  trust: { title: string; license: string; updates: string; refunds: string }
  support: { title: string; body: string; link: string }
}

export interface Copy {
  meta: { title: string; description: string }
  nav: { work: string; features: string; market: string; docs: string; faq: string; blog: string; community: string; menu: string; close: string }
  common: { dev: string; steam: string; steamSoon: string; github: string; themeToLight: string; themeToDark: string }
  chrome: { docLabel: string }
  hero: { title: string; subtitle: string; description: string; platform: string; license: string; windowTitle: string; imageAlt: string; prevSlide: string; nextSlide: string }
  work: { eyebrow: string; title: string; description: string; itemAlt: string[] }
  features: { eyebrow: string; title: string; description: string; items: FeatureCard[] }
  cta: { eyebrow: string; title: string; body: string }
  footer: { tagline: string; columns: { community: FooterColumn; follow: FooterColumn; docs: FooterColumn; more: FooterColumn }; copyright: string; source: string; license: string }
  docsPage: DocsContent
  faqPage: FaqContent
  blogPage: BlogContent
  marketPage: MarketContent
}

const docs: Record<Language, DocsContent> = {
  zh: {
    title: '文档',
    subtitle: '从安装到脚本扩展，了解 MoonSprite 的完整使用方式。',
    outline: [
      { kind: 'page', id: 'intro' },
      { kind: 'page', id: 'download' },
      { kind: 'page', id: 'quickstart' },
      { kind: 'group', id: 'g-drawing', title: '绘制', children: ['tools', 'selection', 'colors', 'tiles'] },
      { kind: 'group', id: 'g-animation', title: '动画', children: ['layers'] },
      { kind: 'group', id: 'g-files', title: '文件与兼容性', children: ['files', 'recovery'] },
      { kind: 'group', id: 'g-workspace', title: '工作区与偏好设置', children: ['workspace'] },
      { kind: 'group', id: 'g-scripting', title: '脚本与扩展', children: ['scripting', 'mse-api'] },
      { kind: 'page', id: 'support' },
    ],
    sections: [
      {
        id: 'intro',
        title: '简介',
        blocks: [
          { kind: 'p', text: 'MoonSprite 是面向 Windows 的原创像素画工作台，把绘制、逐帧动画、瓦片工作流、脚本自动化和成品导出放进同一个工作空间。它使用 Tauri 2、React、TypeScript、Zustand 与 Canvas 构建，原生运行在 Windows 10 / 11 上。' },
          { kind: 'h3', id: 'intro-what', text: '什么是 MoonSprite' },
          { kind: 'p', text: 'MoonSprite 围绕像素创作组织一切工具：从第一笔草图、图层结构管理，到多帧时间轴与最终交付。工程保存为 .moonsprite 容器格式，完整保留图层、动画、瓦片与调色板信息。' },
          { kind: 'p', text: '界面状态与文档数据互相独立：移动栏目、缩放画布、旋转视图都不会进入撤销历史，撤销永远只作用于作品本身。工作区布局可以保存复用，界面提供多套主题并分为明暗两种模式。' },
          { kind: 'h3', id: 'intro-principles', text: '设计原则' },
          { kind: 'ul', items: ['作品永远在中央：工具围绕画布停靠，而不是挤占创作空间', '每一次操作都可回退：撤销历史只记录文档本身的变更', '错误可观测：保存与恢复的失败会明确提示，不会静默吞掉', '能力可探测：脚本与扩展通过能力接口确认可用端点，而不是猜测'] },
          { kind: 'h3', id: 'intro-requirements', text: '系统要求' },
          { kind: 'ul', items: ['Windows 10 或 Windows 11', 'WebView2 Runtime（安装包会自动处理）', '无需联网即可完成全部创作流程'] },
        ],
      },
      {
        id: 'download',
        title: '下载安装',
        blocks: [
          { kind: 'p', text: 'MoonSprite 当前处于 Beta 通道，安装渠道会在正式发布时同步开放，届时本页也会更新具体步骤。' },
          { kind: 'h3', id: 'download-channels', text: '获取渠道' },
          { kind: 'ul', items: ['Steam：商店页面准备就绪后可加入愿望单，官方二进制按用户席位授权', '官方网站：发布后提供 NSIS 安装包与便携版下载', 'GitHub：查看源代码、版本进展与问题追踪'] },
          { kind: 'h3', id: 'download-steps', text: '安装步骤' },
          { kind: 'ul', items: ['下载 NSIS 安装包并运行，按提示完成安装；便携版解压到任意目录即可直接使用', '首次启动时工作区会自动初始化', '通过“文件 > 打开”或直接拖入图片开始创作'] },
          { kind: 'h3', id: 'download-dirs', text: '运行时目录' },
          { kind: 'p', text: '发行版会在可执行文件旁维护一组用户目录，方便备份与迁移：' },
          { kind: 'ul', items: ['gallery/：首页画廊与默认工程保存位置', 'exports/：图片、动画、视频与调色板的默认导出位置', 'brushes/ 与 palettes/：用户图案笔刷和调色板', 'workspaces/：工作区布局', 'scripts/ 与 extensions/：Lua 脚本与已安装扩展', 'Font/：用户字体', 'BackgroundPresets/：背景图层预设'] },
          { kind: 'h3', id: 'download-update', text: '自动更新' },
          { kind: 'p', text: '安装包内置更新通道。发布新版本后，应用内会收到更新提示，变更内容也可以在更新日志中查看。' },
        ],
      },
      {
        id: 'quickstart',
        title: '快速上手',
        blocks: [
          { kind: 'p', text: '从新建工程到第一次导出，只需要几分钟。本章带你走一遍最小工作流。' },
          { kind: 'h3', id: 'quickstart-new', text: '新建工程' },
          { kind: 'p', text: '启动后选择“新建工程”，设定画布尺寸与初始颜色模式（RGBA、灰度或索引颜色）。首页的项目分类与最近文件会帮你快速回到未完成的作品；多个工程可以同时以标签形式打开。' },
          { kind: 'h3', id: 'quickstart-workspace', text: '认识工作区' },
          { kind: 'p', text: '中央是画布，四周是可停靠、可悬浮的栏目：左侧工具栏，右侧颜色与调色板、图层、动画时间线。栏目可以拖动组合，布局会随工作区保存，随时恢复。' },
          { kind: 'h3', id: 'quickstart-first', text: '画下第一笔' },
          { kind: 'ul', items: ['选择铅笔工具直接绘制，按住 Shift 可从上一落点连接直线', '缩放到像素级别检查每个点；抓手、缩放与旋转视图工具只调整视角，不修改像素', '右键吸管与右键油漆桶使用背景色，主副色配合效率更高', '随时撤销重做，放大预览确认细节'] },
          { kind: 'h3', id: 'quickstart-layers', text: '图层与撤销' },
          { kind: 'p', text: '把不同元素放在不同图层上，配合图层组与蒙版保持结构清晰。所有绘制操作都可以撤销，撤销历史只记录文档变更。' },
          { kind: 'h3', id: 'quickstart-save', text: '保存与恢复' },
          { kind: 'p', text: '工程保存为 .moonsprite 文件，包含完整的图层与动画信息。应用异常退出后，恢复草稿会在下次启动时提示找回；保存与恢复的错误会明确提示原因。' },
        ],
      },
      {
        id: 'tools',
        title: '绘图工具',
        blocks: [
          { kind: 'p', text: '工具栏覆盖像素创作的完整路径，所有工具都围绕像素精度设计。每个工具的参数在顶部的工具选项栏中调整。' },
          { kind: 'h3', id: 'tools-drawing', text: '绘制与擦除' },
          { kind: 'ul', items: ['铅笔：按住拖动绘制像素，按住 Shift 从上次落点连接直线', '喷枪：按住持续喷涂粒子，粒子大小、散布范围、密度与产生频率都可调整', '橡皮擦：按住拖动擦除当前图层的像素', '图案笔刷与抖动模板：使用笔刷库或本地笔刷文件夹（brushes/）中的图案作画'] },
          { kind: 'h3', id: 'tools-shapes', text: '形状与线条' },
          { kind: 'ul', items: ['形状：绘制矩形、椭圆、自由形状与多边形', '直线：拖动创建像素直线，按住 Shift 约束方向', '曲线：先拖动确定起点与终点，再依次调整两个控制锚点，实时预览并单击确认'] },
          { kind: 'h3', id: 'tools-fill', text: '填充与取样' },
          { kind: 'ul', items: ['油漆桶：单击填充连续区域，右键使用背景色', '渐变：按住拖动创建前景色到背景色的线性渐变，右键反向', '吸管：单击或拖动读取画布颜色，右键设置背景色'] },
          { kind: 'h3', id: 'tools-text', text: '文本' },
          { kind: 'p', text: '文本工具在画布上创建可编辑文本图层，字体、字号、间距与渲染方式都可以随时回到图层调整，用户字体放在 Font/ 目录。' },
          { kind: 'h3', id: 'tools-view', text: '视图控制' },
          { kind: 'ul', items: ['抓手：按住拖动画布视图，不修改像素内容', '缩放：拖动或单击调整视图缩放，右键执行反向缩放', '旋转视图：围绕旋转指向标拖动，只旋转当前画布视图'] },
          { kind: 'h3', id: 'tools-move', text: '移动与切片' },
          { kind: 'ul', items: ['移动：拖动当前图层、所选图层或选区中的内容', '切片：拖动创建导出切片，选择已有切片后可移动、缩放并在属性栏命名'] },
        ],
      },
      {
        id: 'selection',
        title: '选区与变换',
        blocks: [
          { kind: 'p', text: '选区把修改范围限定在画面的一部分，配合变换命令完成精确的局部编辑。' },
          { kind: 'h3', id: 'selection-kinds', text: '选区种类' },
          { kind: 'p', text: '矩形、椭圆、套索与多边形四种选区工具覆盖规则与不规则范围；魔棒按颜色容差快速选中相似区域。再次单击选区工具可以展开更多选区工具。' },
          { kind: 'h3', id: 'selection-operations', text: '选区操作' },
          { kind: 'ul', items: ['组合多个选区，或从现有选区中减去', '对选区内容执行移动、复制、翻转、缩放与旋转', '跨图层、跨帧应用同一选区，保持多帧编辑的一致性'] },
          { kind: 'h3', id: 'selection-transform', text: '变换' },
          { kind: 'p', text: '变换操作实时显示预览，确认后才写入像素；结合撤销历史，可以放心反复尝试不同的构图。选区信息也会提供给脚本（见 MSE API 的 mse.selection）。' },
        ],
      },
      {
        id: 'layers',
        title: '图层与动画',
        blocks: [
          { kind: 'p', text: '图层系统与逐帧动画共享同一套结构：帧、cel 与图层在时间轴中对齐排列。' },
          { kind: 'h3', id: 'layers-types', text: '图层类型' },
          { kind: 'ul', items: ['普通图层与背景图层', '图层组：把相关图层组织在一起', '文本图层：可随时回到文本编辑状态', '蒙版与图层样式：非破坏地控制可见性与效果', '瓦片图层与自由瓦片图层：见“瓦片工作流”一章'] },
          { kind: 'h3', id: 'layers-timeline', text: '时间轴与帧' },
          { kind: 'p', text: '多帧时间轴支持每帧独立时长，帧与 cel 在图层栏目中对应排列。播放速度、循环与帧复制都在当前位置完成，不需要离开画面。' },
          { kind: 'h3', id: 'layers-cel', text: 'cel 与共享' },
          { kind: 'p', text: 'cel 是帧与图层相交处的图像数据。多个帧可以连接同一个 cel，修改一处即可同步到所有引用它的帧，适合重复出现的元素。' },
          { kind: 'h3', id: 'layers-onion', text: '洋葱皮与循环节' },
          { kind: 'p', text: '洋葱皮把相邻帧以半透明叠加显示，用于参考动作衔接；动画循环节标记循环范围并支持方向与重复次数，便于检查首尾帧的闭合。循环节也可以通过脚本管理（mse.animation）。' },
        ],
      },
      {
        id: 'colors',
        title: '颜色与调色板',
        blocks: [
          { kind: 'p', text: '像素创作离不开受控的颜色管理，MoonSprite 把颜色组织为一等公民。' },
          { kind: 'h3', id: 'colors-models', text: '颜色模式' },
          { kind: 'p', text: '工程支持 RGBA、灰度与索引颜色：RGBA 适合自由创作，索引颜色把整个文档约束在调色板内，适合需要严格控制颜色的精灵图工作流。' },
          { kind: 'h3', id: 'colors-foreground', text: '前景色与背景色' },
          { kind: 'p', text: '左键使用前景色绘制，右键使用背景色；吸管、油漆桶与渐变都遵循同一约定。' },
          { kind: 'h3', id: 'colors-palettes', text: '调色板管理' },
          { kind: 'ul', items: ['自定义调色板保存在 palettes/ 目录，随时取用', '同步颜色帮助保持跨图层的一致用色', '从当前合成图像中提取颜色，替换或追加到调色板', '调色板可以作为调色板文件导出'] },
          { kind: 'h3', id: 'colors-brushes', text: '图案笔刷库' },
          { kind: 'p', text: '工程笔刷与本地笔刷（brushes/）共同构成笔刷库，也可以直接从当前选区创建工程笔刷。脚本可以通过 mse.brushes 查询与导入（见 MSE API 参考）。' },
        ],
      },
      {
        id: 'tiles',
        title: '瓦片工作流',
        blocks: [
          { kind: 'p', text: '瓦片是关卡与场景美术的常用组织方式，MoonSprite 提供两种瓦片图层。' },
          { kind: 'h3', id: 'tiles-shared', text: '瓦片图层' },
          { kind: 'p', text: '瓦片图层使用可共享的瓦片集：同一瓦片在多处引用，修改源瓦片即可同步所有实例，适合制作可复用的地形与图案。瓦片集记录网格尺寸与布局，瓦片有稳定的资源 ID。' },
          { kind: 'h3', id: 'tiles-free', text: '自由瓦片图层' },
          { kind: 'p', text: '自由瓦片图层允许瓦片实例自由重叠摆放，同时保持与源瓦片的同步编辑，兼顾灵活摆放与统一修改。一个图层可以引用多个源瓦片。' },
        ],
      },
      {
        id: 'files',
        title: '导入与导出',
        blocks: [
          { kind: 'p', text: 'MoonSprite 支持从常用格式出发、以多种成品形式交付。' },
          { kind: 'h3', id: 'files-project', text: '工程文件' },
          { kind: 'p', text: '.moonsprite 是 MoonSprite 的工程容器格式，保存图层、动画、瓦片与调色板的完整信息，并在资源管理器中提供缩略图预览。' },
          { kind: 'h3', id: 'files-images', text: '图片与 GIF' },
          { kind: 'ul', items: ['打开：PNG、JPEG、WebP、BMP、GIF 等常用图片格式', '导出：静态图支持常用格式与缩放倍率', '动画导出：GIF、逐帧图像序列与精灵表'] },
          { kind: 'h3', id: 'files-slices', text: '切片、精灵表与视频' },
          { kind: 'ul', items: ['切片工具在画布上划定导出区域，命名后按切片输出，适合 UI 与图集切分', '精灵表导出提供网格、方向与缩放预设', '缩时视频在导出时一并生成，记录完整创作过程', '导出默认落在 exports/ 目录，路径与格式经过平台层校验'] },
        ],
      },
      {
        id: 'workspace',
        title: '工作区与个性化',
        blocks: [
          { kind: 'p', text: '界面为创作服务，MoonSprite 提供细致的布局与外观控制。' },
          { kind: 'h3', id: 'workspace-tabs', text: '多项目标签' },
          { kind: 'p', text: '多个工程以标签形式同时打开，配合首页的项目分类与最近文件快速切换。' },
          { kind: 'h3', id: 'workspace-docking', text: '停靠与布局' },
          { kind: 'p', text: '栏目可停靠、悬浮与重排，布局保存到 workspaces/ 目录；调整布局不会进入文档撤销历史。脚本也可以通过 mse.workspace 查询与调整栏目（见 MSE API 参考）。' },
          { kind: 'h3', id: 'workspace-themes', text: '主题与外观' },
          { kind: 'p', text: '内置多套界面主题，并分为明暗两种模式；本官网的昼夜切换即来源于软件的 Dark 与 Light 主题色板。' },
        ],
      },
      {
        id: 'scripting',
        title: '脚本与扩展',
        blocks: [
          { kind: 'p', text: '重复性工作可以交给脚本，界面能力可以通过扩展增强。两者运行在同一个受限 Lua 5.4 沙箱内。' },
          { kind: 'h3', id: 'scripting-lua', text: 'Lua 脚本' },
          { kind: 'p', text: '把 Lua 脚本放入程序运行目录的 scripts/ 文件夹，会显示在“文件 > 脚本”中。脚本可以读取当前文档状态，并通过事务执行可撤销的画布操作。' },
          { kind: 'h3', id: 'scripting-ns', text: '两套命名空间' },
          { kind: 'ul', items: ['app.* 是兼容命名空间，用于迁移已有脚本，只实现明确列出的兼容子集', 'mse.* 是 MoonSprite 专属 API，不会伪装成其他软件的 API，也不暴露内部实现', '脚本应使用能力探测确认端点是否已实现，规划中的接口不可视为当前可用', '兼容脚本同样运行在图像、内存、指令数和执行时间预算内'] },
          { kind: 'h3', id: 'scripting-ext', text: '.msext 扩展包' },
          { kind: 'p', text: '扩展包是 ZIP 容器，根目录的 manifest.json 声明命令与界面贡献：' },
          { kind: 'code', text: '{\n  "schemaVersion": 1,\n  "id": "com.example.sample",\n  "name": "Sample Extension",\n  "version": "1.0.0",\n  "commands": [\n    { "id": "paint-center", "name": "Paint Center Pixel",\n      "entry": "commands/paint-center.lua" }\n  ],\n  "menuItems": [\n    { "id": "file-paint", "menu": "file", "position": "end",\n      "commands": ["paint-center"] }\n  ],\n  "topMenus": [\n    { "id": "sample-tools", "name": "Sample Tools",\n      "position": "before:help", "commands": ["paint-center"] }\n  ],\n  "panels": [\n    { "id": "smoke-tools", "name": "Smoke Tools",\n      "defaultVisible": true, "commands": ["paint-center"] }\n  ]\n}' },
          { kind: 'ul', items: ['commands[] 声明可运行命令；menuItems[] 把命令插入现有菜单的开头或末尾', 'topMenus[] 声明新的顶层菜单及相对位置；panels[] 声明可从“窗口 > 栏目”切换的浮动栏目', '扩展 UI 是声明式的：不能注入 React、DOM、CSS、JavaScript 或原生控件', '在“首选项 > 扩展”中安装、启用、禁用与卸载，也支持双击或拖入安装', '停用或卸载后，命令与栏目立即消失'] },
          { kind: 'h3', id: 'scripting-transaction', text: '事务与撤销' },
          { kind: 'code', text: 'app.transaction("Extension paint", function()\n  app.activeImage:putPixel(0, 0, app.pixelColor.rgba(41, 121, 255, 255))\nend)' },
          { kind: 'p', text: '命令执行画布写入时应显式使用事务，一次命令形成一次撤销；同一事务中的任何操作校验失败时整批回滚。' },
        ],
      },
      {
        id: 'mse-api',
        title: 'MSE API 参考',
        blocks: [
          { kind: 'p', text: 'MSE（MoonSprite Extension）是 MoonSprite 的专属 Lua API，当前版本 0.2.0，处于 experimental 阶段。本页列出各模块的常用端点与约定；完整类型提示见仓库中的 mse-api.lua，可加入 VS Code 的 LuaLS 工作区库路径。' },
          { kind: 'h3', id: 'mse-model', text: '执行模型' },
          { kind: 'ul', items: ['查询方法立即返回脚本启动时的结构快照，返回的表是副本，修改副本不会影响工程', '写入方法通过参数校验后返回 true，并加入当前脚本事务', '同一事务中的像素修改与 mse 写入只形成一个撤销步骤；任一操作失败时整批回滚', '创建或打开工程、保存、导出、导入本地笔刷、栏目布局属于文档外操作，不进入撤销历史', '颜色使用 { r, g, b, a }，通道范围 0-255；图层不透明度同为 0-255', 'ID 区分大小写；帧参数可用稳定帧 ID 或从 1 开始的帧序号'] },
          { kind: 'h3', id: 'mse-capabilities', text: '能力发现' },
          { kind: 'code', text: 'print(mse.apiVersion)                       -- "0.2.0"\nprint(mse.status.stage)                     -- "experimental"\nprint(mse.capabilities.layers.status)       -- "stable"\nprint(mse.isSupported("tiles.createLayer")) -- true' },
          { kind: 'p', text: 'mse.capabilities 的每个模块包含 status（当前为 stable）、readOnly 与 methods（方法名称、implemented、readOnly）。当前能力表中的所有方法均为真实实现，没有只报错的占位端点。' },
          { kind: 'h3', id: 'mse-document', text: 'mse.document' },
          { kind: 'ul', items: ['info()：返回当前文档与活动图层摘要（id、name、filePath、width、height、colorMode、frame、activeLayer）', 'activeLayer()：返回活动图层的结构信息，包括类型、位置、尺寸、不透明度、混合模式、可见性、锁定与样式', 'create(spec)：新建工程，可设置 name、width、height、colorMode（rgba / grayscale / indexed）', 'open(path?)：传入路径打开文件，省略时打开文件选择器', 'save(spec?)：保存活动工程，{ saveAs = true } 为另存为'] },
          { kind: 'code', text: 'mse.document.create {\n  name = "Sprite",\n  width = 64,\n  height = 64,\n  colorMode = "rgba"\n}' },
          { kind: 'h3', id: 'mse-layers', text: 'mse.layers' },
          { kind: 'ul', items: ['list() / get(id)：返回普通、文本、瓦片与自由瓦片图层的结构信息', 'create(spec?)：创建空白普通图层，可设置 name 与 opacity', 'duplicate(id) / remove(id)：复制或删除图层，沿用 cel、共享资源与锁定检查', 'update(id, patch)：更新 name、opacity、blendMode、visible、locked、x、y、description、displayColor'] },
          { kind: 'code', text: 'local layers = mse.layers.list()\napp.transaction("Rename layer", function()\n  mse.layers.update(layers[1].id, { name = "Outline", opacity = 192 })\nend)' },
          { kind: 'h3', id: 'mse-animation', text: 'mse.animation' },
          { kind: 'ul', items: ['frames()：返回 { id, number, duration, active }[]', 'setFrame(frame)：切换活动帧', 'loops() / createLoop(spec) / updateLoop(id, spec) / removeLoop(id)：管理动画循环节', 'play(id?)：传入循环节 ID 播放该循环节，省略时播放全部动画'] },
          { kind: 'p', text: '循环节参数：name、start（或 startFrameId）、["end"]（或 endFrameId）、direction（forward / reverse）、repeatCount（nil 表示无限重复）。' },
          { kind: 'h3', id: 'mse-palette', text: 'mse.palette' },
          { kind: 'ul', items: ['list() / get(id)：查询调色板颜色', 'create(spec)：{ color = color }，也可以直接传颜色表', 'update(id, patch)：更新 color 或 name', 'remove(id)：删除颜色', 'extract(spec?)：从当前合成图像提取颜色，limit 为 1-4096，mode 为 replace 或 append'] },
          { kind: 'h3', id: 'mse-tiles', text: 'mse.tiles 与 mse.freeTiles' },
          { kind: 'ul', items: ['tiles.listSets() / getSet(id)：返回瓦片集名称、网格尺寸、布局与稳定瓦片 ID；预算内还会返回打包 RGBA pixels', 'tiles.createSet(spec)：创建瓦片集，如 { name = "Terrain", tileWidth = 16, tileHeight = 16 }', 'tiles.createLayer(spec)：创建瓦片图层，tilesetId 可省略以新建', 'tiles.place(spec)：在 Tilemap Cel 的指定单元格放置或清除瓦片，支持 rotation 与翻转', 'tiles.edit(spec)：替换一个瓦片的 RGBA 像素', 'freeTiles.listSources() / createLayer(spec) / createSource(spec) / place(spec) / edit(spec)：管理自由瓦片图层与共享源，编辑源后全部实例同步更新'] },
          { kind: 'h3', id: 'mse-brushes', text: 'mse.brushes' },
          { kind: 'ul', items: ['list() / get(id)：返回工程笔刷与本地笔刷，预算内包含 coverage 与 colors', 'importImage()：打开图片选择器并导入本地图案笔刷', 'createFromSelection()：从当前选区创建工程笔刷', 'remove(id)：删除工程笔刷或已列出的本地笔刷', '脚本不能读取任意笔刷文件路径或原始文件字节'] },
          { kind: 'h3', id: 'mse-selection', text: 'mse.selection' },
          { kind: 'ul', items: ['info()：返回 exists、empty、hasMask、selectedPixels 与 bounds', 'set(spec)：设置矩形选区，可选 width * height 的 0-255 掩码', 'clear() / invert()：清除或反选', 'transform(spec)：支持 dx、dy、flipHorizontal、flipVertical，复用现有选区移动与翻转历史'] },
          { kind: 'code', text: 'mse.selection.set { x = 4, y = 8, width = 16, height = 12 }' },
          { kind: 'h3', id: 'mse-slices-styles', text: 'mse.slices 与 mse.styles' },
          { kind: 'ul', items: ['slices：list() / get(id) / create(spec) / update(id, patch) / remove(id)，管理命名导出切片', 'styles.get(layerId?)：查询指定或活动图层的样式', 'styles.apply(layerId, styles)：应用完整样式模型，非法尺寸、方向、颜色或枚举会被规范化或拒绝', 'styles.copy(layerId) / paste(layerId)：使用软件共享的图层样式剪贴板', 'styles.clear(layerId) / setEnabled { id, enabled }：清除或启停样式'] },
          { kind: 'h3', id: 'mse-workspace-io', text: 'mse.workspace 与 mse.io' },
          { kind: 'ul', items: ['workspace.listPanels() / getPanel(id)：查询栏目 visible 与 dock', 'workspace.showPanel(id) / hidePanel(id) / setPanel { id, visible?, dock? }：dock 为 left、right、bottom 或 floating；栏目布局不写入文档历史', 'io.open(path?) / io.save(spec?)：等同 document 的同名方法', 'io.export(spec)：使用软件现有导出模型，可设置 name、format、directory、target、缩放与 GIF 参数'] },
          { kind: 'h3', id: 'mse-ui', text: 'mse.ui' },
          { kind: 'ul', items: ['notify(text)：在软件状态区显示消息', 'alert(value)：兼容 app.alert，文本进入脚本结果提示', 'dialog(options)：创建组件化对话框，支持现有回调与持久会话'] },
          { kind: 'code', text: 'local dlg = mse.ui.dialog { title = "Options" }\ndlg:number { id = "amount", label = "Amount", value = 4 }\ndlg:button { text = "Apply", onclick = function()\n  mse.ui.notify("Applied: " .. dlg.data.amount)\nend }\ndlg:show { wait = false }' },
          { kind: 'h3', id: 'mse-safety', text: '安全边界' },
          { kind: 'ul', items: ['Lua 不能直接访问文件系统、网络、进程、调试库、DOM、React、原始 Store、历史栈或任意 Tauri 命令', '文件选择、保存、导出与资源导入只能经过本 API 明确开放的受控入口', '像素与结构写入受目标身份、revision、尺寸、内存、指令数、执行时间与撤销校验保护'] },
        ],
      },
      {
        id: 'recovery',
        title: '恢复与故障排除',
        blocks: [
          { kind: 'p', text: '异常总是会发生，MoonSprite 为此准备了多层保护。' },
          { kind: 'h3', id: 'recovery-drafts', text: '恢复草稿' },
          { kind: 'p', text: '应用异常退出后，恢复草稿会在下次启动时提示找回，尽量减少进度损失。恢复过程不会覆盖已有文件。' },
          { kind: 'h3', id: 'recovery-recent', text: '最近项目' },
          { kind: 'p', text: '首页的最近文件列表按项目分类组织，点击即可回到上次的编辑状态。' },
          { kind: 'h3', id: 'recovery-errors', text: '错误可观测' },
          { kind: 'p', text: '保存与恢复过程的错误都会进入可观测通道提示用户，而不是静默失败；遇到提示时按说明处理即可。脚本执行失败时，事务内的改动会整体回滚，工程保持一致。' },
        ],
      },
      {
        id: 'support',
        title: '客户支持',
        blocks: [
          { kind: 'p', text: '开发阶段的问题与建议都会直接进入开发流程。' },
          { kind: 'h3', id: 'support-issues', text: '问题反馈' },
          { kind: 'p', text: '在 GitHub Issues 提交问题时，附上复现步骤与截图可以加快定位；崩溃类问题请尽量说明操作路径。' },
          { kind: 'h3', id: 'support-community', text: '社区与讨论' },
          { kind: 'p', text: '功能讨论与使用交流在 GitHub Discussions 进行；哔哩哔哩、小红书等社区渠道随发布逐步开放。' },
          { kind: 'h3', id: 'support-roadmap', text: '更新与路线图' },
          { kind: 'p', text: '每个开发阶段的变更记录在更新日志中，博客会不定期发布开发进展与设计笔记。' },
        ],
      },
    ],
  },
  en: {
    title: 'Documentation',
    subtitle: 'From installation to scripting — the complete MoonSprite workflow.',
    outline: [
      { kind: 'page', id: 'intro' },
      { kind: 'page', id: 'download' },
      { kind: 'page', id: 'quickstart' },
      { kind: 'group', id: 'g-drawing', title: 'Drawing', children: ['tools', 'selection', 'colors', 'tiles'] },
      { kind: 'group', id: 'g-animation', title: 'Animation', children: ['layers'] },
      { kind: 'group', id: 'g-files', title: 'Files & compatibility', children: ['files', 'recovery'] },
      { kind: 'group', id: 'g-workspace', title: 'Workspace & preferences', children: ['workspace'] },
      { kind: 'group', id: 'g-scripting', title: 'Scripting & extensions', children: ['scripting', 'mse-api'] },
      { kind: 'page', id: 'support' },
    ],
    sections: [
      {
        id: 'intro',
        title: 'Introduction',
        blocks: [
          { kind: 'p', text: 'MoonSprite is an original pixel art workstation for Windows that brings drawing, frame-by-frame animation, tile workflows, script automation, and final export into one workspace. It is built with Tauri 2, React, TypeScript, Zustand, and Canvas, and runs natively on Windows 10 / 11.' },
          { kind: 'h3', id: 'intro-what', text: 'What is MoonSprite' },
          { kind: 'p', text: 'Every tool in MoonSprite is organized around pixel creation: from the first sketch and layer structure to multi-frame timelines and delivery. Projects save as .moonsprite containers that keep layers, animation, tiles, and palettes complete.' },
          { kind: 'p', text: 'Interface state stays independent from document data: moving panels, zooming, and rotating the view never enter undo history — undo always affects the artwork alone. Workspace layouts can be saved and reused, and the UI ships with multiple themes in dark and light modes.' },
          { kind: 'h3', id: 'intro-principles', text: 'Design principles' },
          { kind: 'ul', items: ['The artwork stays central: tools dock around the canvas, not on top of it', 'Every action is reversible: undo history records document changes only', 'Errors are observable: save and recovery failures surface clearly instead of failing silently', 'Capabilities are discoverable: scripts and extensions probe an capability interface instead of guessing'] },
          { kind: 'h3', id: 'intro-requirements', text: 'System requirements' },
          { kind: 'ul', items: ['Windows 10 or Windows 11', 'WebView2 Runtime (handled automatically by the installer)', 'No internet connection required for the full creation workflow'] },
        ],
      },
      {
        id: 'download',
        title: 'Download and install',
        blocks: [
          { kind: 'p', text: 'MoonSprite is currently on the Beta channel. Installation channels will open with the official release, and this page will be updated with concrete steps at that point.' },
          { kind: 'h3', id: 'download-channels', text: 'Where to get it' },
          { kind: 'ul', items: ['Steam: wishlist the store page once it is ready; official binaries are licensed per seat', 'Official website: NSIS installer and portable downloads after release', 'GitHub: source code, version progress, and issue tracking'] },
          { kind: 'h3', id: 'download-steps', text: 'Installation steps' },
          { kind: 'ul', items: ['Download and run the NSIS installer, or unzip the portable build anywhere and launch it', 'The workspace initializes automatically on first launch', 'Start creating via “File > Open” or by dragging an image into the window'] },
          { kind: 'h3', id: 'download-dirs', text: 'Runtime directories' },
          { kind: 'p', text: 'The release maintains a set of user directories next to the executable for easy backup and migration:' },
          { kind: 'ul', items: ['gallery/: home gallery and default project location', 'exports/: default output for images, animation, video, and palettes', 'brushes/ and palettes/: user pattern brushes and palettes', 'workspaces/: workspace layouts', 'scripts/ and extensions/: Lua scripts and installed extensions', 'Font/: user fonts', 'BackgroundPresets/: background layer presets'] },
          { kind: 'h3', id: 'download-update', text: 'Automatic updates' },
          { kind: 'p', text: 'The installer includes an update channel. When a new version ships, the app notifies you in place, and changes are documented in the changelog.' },
        ],
      },
      {
        id: 'quickstart',
        title: 'Quick start',
        blocks: [
          { kind: 'p', text: 'From a new project to your first export takes only a few minutes. This chapter walks the minimal workflow.' },
          { kind: 'h3', id: 'quickstart-new', text: 'Create a project' },
          { kind: 'p', text: 'Choose “New project” after launch and set the canvas size and starting color mode (RGBA, grayscale, or indexed). Home project categories and recent files bring you back to unfinished pieces, and multiple projects stay open as tabs.' },
          { kind: 'h3', id: 'quickstart-workspace', text: 'Meet the workspace' },
          { kind: 'p', text: 'The canvas sits in the center with dockable, floating panels around it: the tool rail on the left, colors and palettes, layers, and the animation timeline on the right. Panels can be rearranged, and layouts are saved with the workspace.' },
          { kind: 'h3', id: 'quickstart-first', text: 'Make your first marks' },
          { kind: 'ul', items: ['Pick the pencil tool and draw; hold Shift to connect a line from the previous point', 'Zoom to pixel level to inspect every dot; hand, zoom, and rotate-view tools change only your vantage', 'Right-click the eyedropper or bucket to use the background color', 'Undo and redo freely, and zoom the preview to confirm details'] },
          { kind: 'h3', id: 'quickstart-layers', text: 'Layers and undo' },
          { kind: 'p', text: 'Keep different elements on different layers, and use groups and masks to stay organized. Every drawing action is undoable, and undo history records document changes only.' },
          { kind: 'h3', id: 'quickstart-save', text: 'Save and recover' },
          { kind: 'p', text: 'Projects save as .moonsprite files containing the complete layer and animation state. After an unexpected exit, recovery drafts appear on the next launch; save and recovery errors surface with clear reasons.' },
        ],
      },
      {
        id: 'tools',
        title: 'Drawing tools',
        blocks: [
          { kind: 'p', text: 'The tool rail covers the complete pixel creation path, and every tool is designed around pixel precision. Tool parameters live in the options bar at the top.' },
          { kind: 'h3', id: 'tools-drawing', text: 'Draw and erase' },
          { kind: 'ul', items: ['Pencil: drag to draw pixels; hold Shift to connect a line from the previous point', 'Airbrush: hold to spray particles with adjustable size, spread, density, and frequency', 'Eraser: drag to erase pixels from the current layer', 'Pattern brushes and dither templates: paint with the brush library or your local brushes folder (brushes/)'] },
          { kind: 'h3', id: 'tools-shapes', text: 'Shapes and lines' },
          { kind: 'ul', items: ['Shape: draw rectangles, ellipses, freeform shapes, and polygons', 'Line: drag to create a pixel line; hold Shift to constrain direction', 'Curve: drag the endpoints, then adjust two control anchors with a live preview and click to confirm'] },
          { kind: 'h3', id: 'tools-fill', text: 'Fill and sampling' },
          { kind: 'ul', items: ['Paint bucket: click to fill a contiguous area; right-click uses the background color', 'Gradient: drag to create a foreground-to-background linear gradient; right-click reverses it', 'Eyedropper: click or drag to sample canvas colors; right-click sets the background color'] },
          { kind: 'h3', id: 'tools-text', text: 'Text' },
          { kind: 'p', text: 'The text tool creates editable text layers on the canvas. Font, size, spacing, and rendering stay adjustable from the layer at any time; user fonts live in the Font/ directory.' },
          { kind: 'h3', id: 'tools-view', text: 'View controls' },
          { kind: 'ul', items: ['Hand: drag the canvas view without changing pixels', 'Zoom: drag or click to zoom; right-click zooms the opposite way', 'Rotate view: rotate only the current view around the indicator — the artwork itself is untouched'] },
          { kind: 'h3', id: 'tools-move', text: 'Move and slice' },
          { kind: 'ul', items: ['Move: drag the current layer, selected layers, or selected content', 'Slice: drag to create export slices; select an existing slice to move, resize, or name it in the options bar'] },
        ],
      },
      {
        id: 'selection',
        title: 'Selection and transform',
        blocks: [
          { kind: 'p', text: 'Selections confine edits to part of the canvas and pair with transform commands for precise local changes.' },
          { kind: 'h3', id: 'selection-kinds', text: 'Selection kinds' },
          { kind: 'p', text: 'Rectangle, ellipse, lasso, and polygon selections cover regular and irregular ranges; the magic wand picks similar areas by color tolerance. Click the selection tool again to expand the selection tools.' },
          { kind: 'h3', id: 'selection-operations', text: 'Selection operations' },
          { kind: 'ul', items: ['Combine selections, or subtract from an existing one', 'Move, copy, flip, scale, and rotate the selected content', 'Apply the same selection across layers and frames for consistent multi-frame edits'] },
          { kind: 'h3', id: 'selection-transform', text: 'Transform' },
          { kind: 'p', text: 'Transforms show a live preview and only write pixels once confirmed; with undo history you can safely try different compositions. Selection state is also exposed to scripts (see mse.selection in the MSE API reference).' },
        ],
      },
      {
        id: 'layers',
        title: 'Layers and animation',
        blocks: [
          { kind: 'p', text: 'The layer system and frame-by-frame animation share one structure: frames, cels, and layers line up in the timeline.' },
          { kind: 'h3', id: 'layers-types', text: 'Layer types' },
          { kind: 'ul', items: ['Regular layers and background layers', 'Layer groups: organize related layers together', 'Text layers: return to text editing at any time', 'Masks and layer styles: control visibility and effects non-destructively', 'Tile layers and free tile layers: see the tile workflow chapter'] },
          { kind: 'h3', id: 'layers-timeline', text: 'Timeline and frames' },
          { kind: 'p', text: 'The multi-frame timeline supports independent per-frame timing, with frames and cels aligned to layers in the same panel. Playback, looping, and frame duplication happen in place.' },
          { kind: 'h3', id: 'layers-cel', text: 'Cels and sharing' },
          { kind: 'p', text: 'A cel is the image data where a frame and a layer intersect. Multiple frames can link to one cel, so editing it once updates every frame that references it — handy for repeating elements.' },
          { kind: 'h3', id: 'layers-onion', text: 'Onion skin and loop sections' },
          { kind: 'p', text: 'Onion skinning overlays neighboring frames as translucent references for motion; animation loop sections mark the loop range with direction and repeat counts. Loops are also scriptable (mse.animation).' },
        ],
      },
      {
        id: 'colors',
        title: 'Colors and palettes',
        blocks: [
          { kind: 'p', text: 'Pixel art depends on controlled color, and MoonSprite treats color as a first-class citizen.' },
          { kind: 'h3', id: 'colors-models', text: 'Color models' },
          { kind: 'p', text: 'Projects support RGBA, grayscale, and indexed color: RGBA for free creation, indexed color constraining the whole document to a palette for strict sprite workflows.' },
          { kind: 'h3', id: 'colors-foreground', text: 'Foreground and background' },
          { kind: 'p', text: 'Left-click draws with the foreground color and right-click with the background color; the eyedropper, bucket, and gradient all follow the same convention.' },
          { kind: 'h3', id: 'colors-palettes', text: 'Palette management' },
          { kind: 'ul', items: ['Custom palettes live in the palettes/ directory, ready at any time', 'Color sync helps keep consistent colors across layers', 'Extract colors from the current composition, replacing or appending to the palette', 'Palettes can be exported as palette files'] },
          { kind: 'h3', id: 'colors-brushes', text: 'Pattern brush library' },
          { kind: 'p', text: 'Project brushes and local brushes (brushes/) form the brush library, and you can create project brushes directly from the current selection. Scripts can query and import brushes through mse.brushes (see the MSE API reference).' },
        ],
      },
      {
        id: 'tiles',
        title: 'Tile workflow',
        blocks: [
          { kind: 'p', text: 'Tiles are a common way to organize level and scene art, and MoonSprite provides two tile layer kinds.' },
          { kind: 'h3', id: 'tiles-shared', text: 'Tile layers' },
          { kind: 'p', text: 'Tile layers use a shareable tile set: the same tile can be referenced in many places, and editing the source tile updates every instance — ideal for reusable terrain and patterns. Tile sets record grid size and layout, and tiles carry stable resource IDs.' },
          { kind: 'h3', id: 'tiles-free', text: 'Free tile layers' },
          { kind: 'p', text: 'Free tile layers let tile instances overlap freely while staying linked to their source tiles, combining flexible placement with unified edits. A layer can reference multiple sources.' },
        ],
      },
      {
        id: 'files',
        title: 'Import and export',
        blocks: [
          { kind: 'p', text: 'MoonSprite starts from common formats and delivers in many finished forms.' },
          { kind: 'h3', id: 'files-project', text: 'Project files' },
          { kind: 'p', text: '.moonsprite is the project container format, keeping layers, animation, tiles, and palettes complete, with Explorer thumbnail previews.' },
          { kind: 'h3', id: 'files-images', text: 'Images and GIF' },
          { kind: 'ul', items: ['Open: PNG, JPEG, WebP, BMP, GIF, and other common image formats', 'Export: stills in common formats with scale factors', 'Animation export: GIF, frame sequences, and sprite sheets'] },
          { kind: 'h3', id: 'files-slices', text: 'Slices, sprite sheets, and video' },
          { kind: 'ul', items: ['The slice tool marks export regions on the canvas; name slices and export them individually for UI and atlas splitting', 'Sprite sheet export provides grid, direction, and scale presets', 'Timelapse video is generated alongside the export, recording the whole process', 'Exports land in exports/ by default, with paths and formats validated by the platform layer'] },
        ],
      },
      {
        id: 'workspace',
        title: 'Workspace and personalization',
        blocks: [
          { kind: 'p', text: 'The interface serves creation, and MoonSprite offers fine-grained layout and appearance control.' },
          { kind: 'h3', id: 'workspace-tabs', text: 'Project tabs' },
          { kind: 'p', text: 'Multiple projects stay open as tabs, with home project categories and recent files for quick switching.' },
          { kind: 'h3', id: 'workspace-docking', text: 'Docking and layouts' },
          { kind: 'p', text: 'Panels dock, float, and rearrange; layouts save into the workspaces/ directory. Changing layout never enters document undo history. Scripts can also query and adjust panels through mse.workspace (see the MSE API reference).' },
          { kind: 'h3', id: 'workspace-themes', text: 'Themes and appearance' },
          { kind: 'p', text: 'Multiple built-in UI themes ship in both dark and light modes — this website’s day/night switch comes from the app’s Dark and Light themes.' },
        ],
      },
      {
        id: 'scripting',
        title: 'Scripting and extensions',
        blocks: [
          { kind: 'p', text: 'Hand repetitive work to scripts, and extend the interface with extensions. Both run in the same restricted Lua 5.4 sandbox.' },
          { kind: 'h3', id: 'scripting-lua', text: 'Lua scripts' },
          { kind: 'p', text: 'Drop Lua scripts into the scripts/ folder next to the executable and they appear under “File > Scripts”. Scripts can read the current document state and perform undoable canvas operations through transactions.' },
          { kind: 'h3', id: 'scripting-ns', text: 'Two namespaces' },
          { kind: 'ul', items: ['app.* is the compatibility namespace for migrating existing scripts; only an explicitly listed subset is implemented', 'mse.* is MoonSprite’s own API — it never impersonates another app’s API nor exposes internal implementation', 'Scripts should probe capabilities instead of assuming planned endpoints exist', 'Compatibility scripts run within the same image, memory, instruction, and time budgets'] },
          { kind: 'h3', id: 'scripting-ext', text: '.msext extension packages' },
          { kind: 'p', text: 'An extension package is a ZIP container whose root manifest.json declares commands and UI contributions:' },
          { kind: 'code', text: '{\n  "schemaVersion": 1,\n  "id": "com.example.sample",\n  "name": "Sample Extension",\n  "version": "1.0.0",\n  "commands": [\n    { "id": "paint-center", "name": "Paint Center Pixel",\n      "entry": "commands/paint-center.lua" }\n  ],\n  "menuItems": [\n    { "id": "file-paint", "menu": "file", "position": "end",\n      "commands": ["paint-center"] }\n  ],\n  "topMenus": [\n    { "id": "sample-tools", "name": "Sample Tools",\n      "position": "before:help", "commands": ["paint-center"] }\n  ],\n  "panels": [\n    { "id": "smoke-tools", "name": "Smoke Tools",\n      "defaultVisible": true, "commands": ["paint-center"] }\n  ]\n}' },
          { kind: 'ul', items: ['commands[] declares runnable commands; menuItems[] inserts them at the start or end of built-in menus', 'topMenus[] declares new top-level menus with relative positions; panels[] declares floating panels toggleable from “Window > Panels”', 'Extension UI is declarative: no React, DOM, CSS, JavaScript, or native code injection', 'Install, enable, disable, and uninstall in “Preferences > Extensions”, or install by double-click or drag-in', 'Disabling or uninstalling removes the commands and panels immediately'] },
          { kind: 'h3', id: 'scripting-transaction', text: 'Transactions and undo' },
          { kind: 'code', text: 'app.transaction("Extension paint", function()\n  app.activeImage:putPixel(0, 0, app.pixelColor.rgba(41, 121, 255, 255))\nend)' },
          { kind: 'p', text: 'Use explicit transactions for canvas writes so one command becomes one undo step; if any operation in the transaction fails, the whole batch rolls back.' },
        ],
      },
      {
        id: 'mse-api',
        title: 'MSE API reference',
        blocks: [
          { kind: 'p', text: 'MSE (MoonSprite Extension) is MoonSprite’s own Lua API, currently version 0.2.0 in the experimental stage. This page lists the common endpoints and conventions per module; full type hints live in mse-api.lua in the repository and can be added to a VS Code LuaLS workspace library.' },
          { kind: 'h3', id: 'mse-model', text: 'Execution model' },
          { kind: 'ul', items: ['Queries return a snapshot taken when the script started; returned tables are copies — mutating them never affects the project', 'Writes validate their arguments, return true, and join the current script transaction', 'Pixel edits and mse writes within one transaction commit as a single undo step; any failure rolls the batch back', 'Creating or opening projects, saving, exporting, importing local brushes, and panel layout are document-external and never enter undo history', 'Colors use { r, g, b, a } with 0-255 channels; layer opacity is 0-255 too', 'IDs are case-sensitive; frame parameters accept stable frame IDs or 1-based numbers'] },
          { kind: 'h3', id: 'mse-capabilities', text: 'Capability discovery' },
          { kind: 'code', text: 'print(mse.apiVersion)                       -- "0.2.0"\nprint(mse.status.stage)                     -- "experimental"\nprint(mse.capabilities.layers.status)       -- "stable"\nprint(mse.isSupported("tiles.createLayer")) -- true' },
          { kind: 'p', text: 'Each module in mse.capabilities exposes status (currently stable), readOnly, and methods (name, implemented, readOnly). Every method in the current capability table is a real implementation — there are no error-only placeholders.' },
          { kind: 'h3', id: 'mse-document', text: 'mse.document' },
          { kind: 'ul', items: ['info(): summary of the current document and active layer (id, name, filePath, width, height, colorMode, frame, activeLayer)', 'activeLayer(): structural info of the active layer, including kind, position, size, opacity, blend mode, visibility, lock, and styles', 'create(spec): new project with name, width, height, and colorMode (rgba / grayscale / indexed)', 'open(path?): open a file by path, or show the file picker when omitted', 'save(spec?): save the active project; { saveAs = true } for Save As'] },
          { kind: 'code', text: 'mse.document.create {\n  name = "Sprite",\n  width = 64,\n  height = 64,\n  colorMode = "rgba"\n}' },
          { kind: 'h3', id: 'mse-layers', text: 'mse.layers' },
          { kind: 'ul', items: ['list() / get(id): structural info for regular, text, tile, and free tile layers', 'create(spec?): create a blank regular layer with optional name and opacity', 'duplicate(id) / remove(id): duplicate or remove a layer, reusing cel, shared-resource, and lock checks', 'update(id, patch): update name, opacity, blendMode, visible, locked, x, y, description, displayColor'] },
          { kind: 'code', text: 'local layers = mse.layers.list()\napp.transaction("Rename layer", function()\n  mse.layers.update(layers[1].id, { name = "Outline", opacity = 192 })\nend)' },
          { kind: 'h3', id: 'mse-animation', text: 'mse.animation' },
          { kind: 'ul', items: ['frames(): returns { id, number, duration, active }[]', 'setFrame(frame): switch the active frame', 'loops() / createLoop(spec) / updateLoop(id, spec) / removeLoop(id): manage loop sections', 'play(id?): play a specific loop by ID, or the whole animation when omitted'] },
          { kind: 'p', text: 'Loop parameters: name, start (or startFrameId), ["end"] (or endFrameId), direction (forward / reverse), repeatCount (nil means infinite).' },
          { kind: 'h3', id: 'mse-palette', text: 'mse.palette' },
          { kind: 'ul', items: ['list() / get(id): query palette colors', 'create(spec): { color = color }, or pass a color table directly', 'update(id, patch): update color or name', 'remove(id): remove a color', 'extract(spec?): extract colors from the current composition; limit is 1-4096 and mode is replace or append'] },
          { kind: 'h3', id: 'mse-tiles', text: 'mse.tiles and mse.freeTiles' },
          { kind: 'ul', items: ['tiles.listSets() / getSet(id): tile set name, grid size, layout, and stable tile IDs; packed RGBA pixels are included within budget', 'tiles.createSet(spec): e.g. { name = "Terrain", tileWidth = 16, tileHeight = 16 }', 'tiles.createLayer(spec): create a tile layer; tilesetId is optional to start fresh', 'tiles.place(spec): place or clear a cell on a Tilemap cel, with rotation and flips', 'tiles.edit(spec): replace a tile’s RGBA pixels', 'freeTiles.listSources() / createLayer(spec) / createSource(spec) / place(spec) / edit(spec): manage free tile layers and shared sources; editing a source updates every instance'] },
          { kind: 'h3', id: 'mse-brushes', text: 'mse.brushes' },
          { kind: 'ul', items: ['list() / get(id): project and local brushes, including coverage and colors within budget', 'importImage(): open an image picker and import a local pattern brush', 'createFromSelection(): create a project brush from the current selection', 'remove(id): remove a project brush or a listed local brush', 'Scripts cannot read arbitrary brush file paths or raw file bytes'] },
          { kind: 'h3', id: 'mse-selection', text: 'mse.selection' },
          { kind: 'ul', items: ['info(): returns exists, empty, hasMask, selectedPixels, and bounds', 'set(spec): set a rectangle selection with an optional width * height mask of 0-255 values', 'clear() / invert(): clear or invert', 'transform(spec): dx, dy, flipHorizontal, flipVertical — reusing the app’s move and flip history'] },
          { kind: 'code', text: 'mse.selection.set { x = 4, y = 8, width = 16, height = 12 }' },
          { kind: 'h3', id: 'mse-slices-styles', text: 'mse.slices and mse.styles' },
          { kind: 'ul', items: ['slices: list() / get(id) / create(spec) / update(id, patch) / remove(id) for named export slices', 'styles.get(layerId?): query styles of a given or the active layer', 'styles.apply(layerId, styles): apply the full style model; invalid sizes, directions, colors, or enums are normalized or rejected', 'styles.copy(layerId) / paste(layerId): use the shared layer-style clipboard', 'styles.clear(layerId) / setEnabled { id, enabled }: clear or toggle styles'] },
          { kind: 'h3', id: 'mse-workspace-io', text: 'mse.workspace and mse.io' },
          { kind: 'ul', items: ['workspace.listPanels() / getPanel(id): panel visible and dock state', 'workspace.showPanel(id) / hidePanel(id) / setPanel { id, visible?, dock? }: dock is left, right, bottom, or floating; panel layout never enters document history', 'io.open(path?) / io.save(spec?): same as the document equivalents', 'io.export(spec): uses the app’s export model with name, format, directory, target, scaling, and GIF options'] },
          { kind: 'h3', id: 'mse-ui', text: 'mse.ui' },
          { kind: 'ul', items: ['notify(text): show a message in the app status area', 'alert(value): compatible with app.alert; text appears in the script result notice', 'dialog(options): create the same component-based dialogs as the global Dialog, with existing callbacks and persistent sessions'] },
          { kind: 'code', text: 'local dlg = mse.ui.dialog { title = "Options" }\ndlg:number { id = "amount", label = "Amount", value = 4 }\ndlg:button { text = "Apply", onclick = function()\n  mse.ui.notify("Applied: " .. dlg.data.amount)\nend }\ndlg:show { wait = false }' },
          { kind: 'h3', id: 'mse-safety', text: 'Safety boundaries' },
          { kind: 'ul', items: ['Lua cannot reach the file system, network, processes, debug libraries, DOM, React, the raw store, the history stack, or arbitrary Tauri commands', 'File picking, saving, exporting, and resource imports only happen through the controlled endpoints this API exposes', 'Pixel and structure writes are protected by target identity, revision, size, memory, instruction count, execution time, and undo validation'] },
        ],
      },
      {
        id: 'recovery',
        title: 'Recovery and troubleshooting',
        blocks: [
          { kind: 'p', text: 'Failures happen, and MoonSprite prepares several layers of protection.' },
          { kind: 'h3', id: 'recovery-drafts', text: 'Recovery drafts' },
          { kind: 'p', text: 'After an unexpected exit, recovery drafts are offered on the next launch to minimize progress loss. Recovery never overwrites existing files.' },
          { kind: 'h3', id: 'recovery-recent', text: 'Recent projects' },
          { kind: 'p', text: 'The home recent-files list is organized by project category; one click returns you to the last editing state.' },
          { kind: 'h3', id: 'recovery-errors', text: 'Observable errors' },
          { kind: 'p', text: 'Save and recovery errors surface through an observable channel instead of failing silently; follow the message instructions when they appear. When a script fails, changes inside its transaction roll back and the project stays consistent.' },
        ],
      },
      {
        id: 'support',
        title: 'Support',
        blocks: [
          { kind: 'p', text: 'Issues and suggestions raised during development feed directly into the process.' },
          { kind: 'h3', id: 'support-issues', text: 'Report issues' },
          { kind: 'p', text: 'When filing on GitHub Issues, reproduction steps and screenshots speed up diagnosis. For crashes, please describe the path that led to them.' },
          { kind: 'h3', id: 'support-community', text: 'Community and discussion' },
          { kind: 'p', text: 'Feature discussion and usage questions live in GitHub Discussions; community channels such as bilibili and REDnote will open gradually with the release.' },
          { kind: 'h3', id: 'support-roadmap', text: 'Updates and roadmap' },
          { kind: 'p', text: 'Every development stage is recorded in the changelog, and the blog publishes progress notes and design write-ups from time to time.' },
        ],
      },
    ],
  },
}

const faqPage: Record<Language, FaqContent> = {
  zh: {
    title: '常见问题',
    subtitle: '按主题分类的常见疑问：左侧切换分类，右侧跳转具体问题。',
    categories: [
      {
        id: 'faq-intro',
        title: 'FAQ 介绍',
        items: [
          { id: 'faq-about', q: '这个页面用来做什么？', a: '这里集中回答关于 MoonSprite 的常见疑问。左侧按主题切换分类，右侧可以跳转到当前分类中的具体问题。' },
          { id: 'faq-update-when', q: '内容什么时候更新？', a: '随开发阶段推进同步更新。当前内容基于 Beta 开发版的实际情况撰写，正式发布后会补充下载、授权与渠道相关的说明。' },
          { id: 'faq-doc-error', q: '发现文档信息有误怎么办？', a: '欢迎在 GitHub Issues 中标记文档类别提交，或通过 Discussions 讨论。源码可见意味着文档与实现可以互相印证。' },
        ],
      },
      {
        id: 'faq-start',
        title: '入门指南',
        items: [
          { id: 'faq-download', q: 'MoonSprite 现在可以下载吗？', a: '当前处于 Beta 通道，尚未公开分发。Steam 商店页面准备就绪后，官网会开放愿望单入口，发布渠道也会同步在文档中更新。' },
          { id: 'faq-system', q: '支持哪些系统？', a: '当前产品专注 Windows 10 与 Windows 11，需要 WebView2 Runtime。其他桌面系统暂不在首发范围内。' },
          { id: 'faq-portable', q: '有便携版吗？', a: '有。发布后将提供 NSIS 安装包与便携版两种形态，便携版解压即可使用，用户目录（画廊、笔刷、调色板、脚本等）都在程序目录旁。' },
          { id: 'faq-price', q: '项目会收费吗？', a: '源码采用 MoonSprite Source-Available License，允许查看、修改与个人编译；Steam 等授权渠道的官方二进制按用户席位授权，允许个人与商业创作。历史版本中已以 MIT 发布的部分保留原有权利。' },
          { id: 'faq-offline', q: '需要联网使用吗？', a: '不需要。从绘制到导出的全部创作流程都在本地完成，不依赖网络。' },
        ],
      },
      {
        id: 'faq-drawing',
        title: '绘图',
        items: [
          { id: 'faq-drawing-tools', q: '提供哪些绘图工具？', a: '铅笔、喷枪、橡皮擦、形状、直线、曲线、油漆桶、渐变、吸管、文本，以及图案笔刷与抖动模板，覆盖从草图到精修的路径。' },
          { id: 'faq-drawing-select', q: '选区可以做什么？', a: '矩形、椭圆、套索、多边形与魔棒选区支持组合、移动、翻转、缩放和旋转，可以把修改范围限定在画面的一部分，并跨图层、跨帧复用。' },
          { id: 'faq-drawing-curve', q: '如何画平滑曲线？', a: '使用曲线工具：先拖动确定起点与终点，再依次移动两个控制锚点实时预览曲线，单击确认后写入像素。' },
          { id: 'faq-drawing-dither', q: '抖动模板是什么？', a: '抖动模板以规则排列的像素图案落笔，是像素画中表现过渡与材质的常用手法。配合图案笔刷可以在笔刷库与本地笔刷文件夹中保存自己的图案。' },
          { id: 'faq-drawing-brushes', q: '能使用自己的笔刷吗？', a: '可以。本地笔刷文件夹（brushes/）中的图案会直接进入笔刷库，也可以从当前选区创建工程笔刷，或通过脚本导入图片笔刷。' },
          { id: 'faq-drawing-undo', q: '撤销会记下界面操作吗？', a: '不会。撤销历史只记录文档本身的变更，移动栏目、缩放视图等界面操作不会进入历史，撤销永远只作用于作品。' },
        ],
      },
      {
        id: 'faq-layers',
        title: '图层与动画',
        items: [
          { id: 'faq-layer-types', q: '支持哪些图层类型？', a: '普通图层、背景图层、图层组、文本图层、蒙版与图层样式，加上瓦片图层与自由瓦片图层，可以组合出清晰的工程结构。' },
          { id: 'faq-layer-text', q: '文本图层之后还能修改吗？', a: '可以。文本图层保持可编辑状态，随时回到文本调整字体、字号、间距与渲染方式，用户字体放在 Font/ 目录。' },
          { id: 'faq-timing', q: '每帧的时长可以单独调整吗？', a: '可以。每一帧都有独立的时长设置，配合播放速度与循环选项，可以在同一条动画里安排快慢不同的节奏。' },
          { id: 'faq-onion', q: '洋葱皮是什么？', a: '洋葱皮会把相邻帧以半透明方式叠加显示在当前帧周围，用于参考动作的衔接，是逐帧动画的常用辅助。' },
          { id: 'faq-cel', q: 'cel 是什么？', a: 'cel 是帧与图层相交处的图像数据。多个帧可以连接同一个 cel，修改一处即可同步到所有引用它的帧，适合重复出现的元素。' },
        ],
      },
      {
        id: 'faq-colors',
        title: '颜色和调色板',
        items: [
          { id: 'faq-colors-manage', q: '如何管理项目颜色？', a: '调色板面板与颜色面板并列停靠，可以把常用颜色保存进项目调色板；自定义调色板保存在 palettes/ 目录，随时取用，也可以导出为调色板文件。' },
          { id: 'faq-colors-extract', q: '如何从图片提取颜色？', a: '可以从当前合成图像中提取颜色并替换或追加到调色板；脚本中对应 mse.palette.extract，limit 范围为 1-4096。' },
          { id: 'faq-colors-indexed', q: '支持索引颜色吗？', a: '支持。工程支持 RGBA、灰度与索引颜色：索引颜色把整个文档约束在调色板内，适合需要严格控制颜色的精灵图工作流。' },
          { id: 'faq-colors-alpha', q: '透明像素如何处理？', a: '画布支持透明像素，导出 PNG、WebP 等支持透明的格式时会原样保留，适合图标与精灵图工作流。' },
        ],
      },
      {
        id: 'faq-tiles',
        title: '瓦片工作流',
        items: [
          { id: 'faq-tiles-what', q: '什么是瓦片图层？', a: '瓦片图层使用可共享的瓦片集：同一瓦片在多处引用，修改源瓦片即可同步所有实例，适合制作可复用的地形与图案。' },
          { id: 'faq-tiles-free', q: '自由瓦片图层有什么不同？', a: '自由瓦片图层允许瓦片实例自由重叠摆放，同时保持与源瓦片的同步编辑，兼顾灵活摆放与统一修改。' },
        ],
      },
      {
        id: 'faq-files',
        title: '文件与导出',
        items: [
          { id: 'faq-file-project', q: '工程保存为什么格式？', a: '.moonsprite 是 MoonSprite 的工程容器格式，保存图层、动画、瓦片与调色板的完整信息，并在资源管理器中提供缩略图预览。' },
          { id: 'faq-files-open', q: '支持打开哪些文件？', a: 'PNG、JPEG、WebP、BMP、GIF 等常用图片格式都可以直接打开，支持范围随开发版持续扩展。' },
          { id: 'faq-files-export', q: '导出有哪些选项？', a: '静态图支持常用格式与缩放倍率；动画支持 GIF、逐帧图像序列与精灵表；缩时视频在导出时一并生成，导出默认落在 exports/ 目录。' },
          { id: 'faq-files-slice', q: '切片是什么？', a: '切片是在画布上划定的命名导出区域。使用切片工具拖动创建，之后可以移动、缩放与命名，导出时按切片分别输出，适合 UI 与图集切分。' },
        ],
      },
      {
        id: 'faq-workspace',
        title: '界面与主题',
        items: [
          { id: 'faq-ui-dock', q: '栏目布局可以调整吗？', a: '可以。栏目支持停靠、悬浮与重排，布局保存到 workspaces/ 目录；调整布局不会进入文档撤销历史。' },
          { id: 'faq-ui-tabs', q: '能同时打开多个工程吗？', a: '可以。多个工程以标签形式同时打开，首页的项目分类与最近文件帮助快速切换。' },
          { id: 'faq-ui-themes', q: '界面有几种外观？', a: '软件内置多套主题，分为明暗两种模式；本官网的昼夜切换就来自软件的 Dark 与 Light 主题色板。' },
          { id: 'faq-ui-script', q: '脚本可以调整界面吗？', a: '可以有限度地调整。mse.workspace 可以查询与设置栏目的显隐和停靠位置（left / right / bottom / floating），栏目布局属于本地界面状态，不写入文档历史。' },
        ],
      },
      {
        id: 'faq-scripting',
        title: '脚本与扩展',
        items: [
          { id: 'faq-script-lua', q: '可以写脚本吗？', a: '可以。把 Lua 脚本放入程序运行目录的 scripts/ 文件夹，就会出现在“文件 > 脚本”中。脚本运行在受限 Lua 5.4 沙箱内，通过事务执行可撤销的画布操作。' },
          { id: 'faq-script-ns', q: 'app.* 和 mse.* 有什么区别？', a: 'app.* 是兼容命名空间，用于迁移已有脚本，只实现明确列出的子集；mse.* 是 MoonSprite 专属 API，覆盖文档、图层、动画、调色板、瓦片、笔刷、选区、切片、样式、栏目与文件操作。两者都应通过能力探测确认端点可用。' },
          { id: 'faq-script-ext', q: '.msext 扩展是什么？', a: '扩展包格式（ZIP 容器 + manifest.json），可声明 Lua 命令、插入现有菜单、新增顶层菜单，并提供由 MoonSprite 渲染的浮动栏目；在“首选项 > 扩展”中管理，支持双击或拖入安装。' },
          { id: 'faq-script-safe', q: '脚本可以访问我的文件吗？', a: '不能。脚本沙箱不能直接访问文件系统、网络、进程、调试库或任意本地模块，扩展也不能注入任意 React、DOM、CSS、JavaScript 或原生代码；文件操作只能经过 API 明确开放的受控入口。' },
          { id: 'faq-script-error', q: '脚本出错了工程会坏吗？', a: '不会。同一事务中的像素修改与 mse 写入是一个撤销步骤，任何操作校验失败时整批回滚；脚本还受图像、内存、指令数与执行时间预算保护，预算耗尽会停止而不是卡死。' },
        ],
      },
      {
        id: 'faq-support',
        title: '支持与反馈',
        items: [
          { id: 'faq-feedback', q: '如何反馈问题？', a: '在 GitHub Issues 提交问题，附上复现步骤与截图最有效；功能讨论可以在 GitHub Discussions 进行。' },
          { id: 'faq-changelog-q', q: '在哪里查看更新内容？', a: '每个开发阶段的变更记录在仓库的更新日志中，博客会不定期发布开发进展与设计笔记。' },
          { id: 'faq-contribute', q: '如何参与贡献？', a: '仓库提供贡献指南（CONTRIBUTING.md）。源码可见意味着实现、文档与测试都可以对照检查，提交前请先阅读对应契约。' },
          { id: 'faq-roadmap', q: '接下来会做什么？', a: '开发按阶段推进，重点随版本公布。可以关注 GitHub 仓库与博客获取最新进展。' },
        ],
      },
    ],
  },
  en: {
    title: 'FAQ',
    subtitle: 'Common questions grouped by topic: switch topics on the left, jump to a question on the right.',
    categories: [
      {
        id: 'faq-intro',
        title: 'About this FAQ',
        items: [
          { id: 'faq-about', q: 'What is this page for?', a: 'It collects common questions about MoonSprite. Switch topics on the left, and jump to a specific question within the current topic from the outline on the right.' },
          { id: 'faq-update-when', q: 'When is this content updated?', a: 'Alongside each development stage. The current text reflects the actual state of the Beta build; download, licensing, and channel details will follow the release.' },
          { id: 'faq-doc-error', q: 'Found an error in the docs?', a: 'Please file it on GitHub Issues with a docs label, or start a discussion. Source-available means docs and implementation can be checked against each other.' },
        ],
      },
      {
        id: 'faq-start',
        title: 'Getting started',
        items: [
          { id: 'faq-download', q: 'Can I download MoonSprite now?', a: 'MoonSprite is on the Beta channel and not publicly distributed yet. The website will open its wishlist link when the Steam store page is ready, and release channels will be documented at the same time.' },
          { id: 'faq-system', q: 'Which platforms are supported?', a: 'The current product focuses on Windows 10 and Windows 11 and requires WebView2 Runtime. Other desktop platforms are not part of the initial release scope.' },
          { id: 'faq-portable', q: 'Is there a portable build?', a: 'Yes. After release there will be both an NSIS installer and a portable build; the portable version runs from any directory with the user folders (gallery, brushes, palettes, scripts, and more) next to the program.' },
          { id: 'faq-price', q: 'Will it be paid software?', a: 'The source uses the MoonSprite Source-Available License, allowing viewing, modification, and personal builds; official Steam and authorized-channel binaries are licensed per seat for personal and commercial creative work. Historical parts released under MIT keep their original rights.' },
          { id: 'faq-offline', q: 'Does it need an internet connection?', a: 'No. The entire creation workflow, from drawing to export, runs locally without depending on the network.' },
        ],
      },
      {
        id: 'faq-drawing',
        title: 'Drawing',
        items: [
          { id: 'faq-drawing-tools', q: 'Which drawing tools are included?', a: 'Pencil, airbrush, eraser, shapes, line, curve, paint bucket, gradient, eyedropper, and text, plus pattern brushes and dither templates — the full path from sketch to polish.' },
          { id: 'faq-drawing-select', q: 'What can selections do?', a: 'Rectangle, ellipse, lasso, polygon, and magic selections support combining, moving, flipping, scaling, and rotating, keep edits confined to part of the canvas, and can be reused across layers and frames.' },
          { id: 'faq-drawing-curve', q: 'How do I draw smooth curves?', a: 'Use the curve tool: drag to set the endpoints, then move the two control anchors in sequence for a live preview, and click to confirm before pixels are written.' },
          { id: 'faq-drawing-dither', q: 'What are dither templates?', a: 'Dither templates lay down regularly arranged pixel patterns — a classic pixel-art technique for transitions and textures. Combined with pattern brushes you can save your own patterns in the library or the local brushes folder.' },
          { id: 'faq-drawing-brushes', q: 'Can I use my own brushes?', a: 'Yes. Patterns in your local brushes folder (brushes/) appear directly in the library, you can create project brushes from the current selection, and scripts can import image brushes.' },
          { id: 'faq-drawing-undo', q: 'Does undo record interface actions?', a: 'No. Undo history records document changes only; moving panels and zooming the view never enter history, so undo always affects the artwork alone.' },
        ],
      },
      {
        id: 'faq-layers',
        title: 'Layers and animation',
        items: [
          { id: 'faq-layer-types', q: 'Which layer types are supported?', a: 'Regular layers, background layers, layer groups, text layers, masks, and layer styles, plus tile layers and free tile layers, combine into clear project structures.' },
          { id: 'faq-layer-text', q: 'Can text layers be edited later?', a: 'Yes. Text layers stay editable — return at any time to adjust font, size, spacing, and rendering. User fonts live in the Font/ directory.' },
          { id: 'faq-timing', q: 'Can each frame have its own duration?', a: 'Yes. Every frame has an independent duration setting, and together with playback rate and looping options you can pace fast and slow beats within one animation.' },
          { id: 'faq-onion', q: 'What is onion skinning?', a: 'Onion skinning overlays neighboring frames around the current one as translucent references for motion — a standard aid for frame-by-frame animation.' },
          { id: 'faq-cel', q: 'What is a cel?', a: 'A cel is the image data where a frame and a layer intersect. Multiple frames can link to one cel, so editing it once updates every frame that references it — handy for repeating elements.' },
        ],
      },
      {
        id: 'faq-colors',
        title: 'Colors and palettes',
        items: [
          { id: 'faq-colors-manage', q: 'How do I manage project colors?', a: 'The palette panel docks beside the color panel; save frequently used colors into the project palette. Custom palettes live in the palettes/ directory and can be exported as palette files.' },
          { id: 'faq-colors-extract', q: 'How do I extract colors from an image?', a: 'Extract colors from the current composition, replacing or appending to the palette; in scripts this is mse.palette.extract with a limit of 1-4096.' },
          { id: 'faq-colors-indexed', q: 'Is indexed color supported?', a: 'Yes. Projects support RGBA, grayscale, and indexed color: indexed color constrains the whole document to a palette, ideal for sprite workflows that demand strict color control.' },
          { id: 'faq-colors-alpha', q: 'How is transparency handled?', a: 'The canvas supports transparent pixels, and formats that carry transparency, such as PNG and WebP, preserve it on export — well suited to icons and sprite work.' },
        ],
      },
      {
        id: 'faq-tiles',
        title: 'Tile workflow',
        items: [
          { id: 'faq-tiles-what', q: 'What is a tile layer?', a: 'Tile layers use a shareable tile set: the same tile can be referenced in many places, and editing the source tile updates every instance — ideal for reusable terrain and patterns.' },
          { id: 'faq-tiles-free', q: 'How do free tile layers differ?', a: 'Free tile layers let tile instances overlap freely while staying linked to their source tiles, combining flexible placement with unified edits.' },
        ],
      },
      {
        id: 'faq-files',
        title: 'Files and export',
        items: [
          { id: 'faq-file-project', q: 'What format are projects saved in?', a: '.moonsprite is the project container format, keeping layers, animation, tiles, and palettes complete, with Explorer thumbnail previews.' },
          { id: 'faq-files-open', q: 'Which files can it open?', a: 'PNG, JPEG, WebP, BMP, GIF, and other common image formats open directly, and supported formats keep expanding with development builds.' },
          { id: 'faq-files-export', q: 'What export options are available?', a: 'Stills support common formats with scale factors; animation exports cover GIF, frame sequences, and sprite sheets; timelapse video is generated alongside the export, landing in exports/ by default.' },
          { id: 'faq-files-slice', q: 'What are slices?', a: 'Slices are named export regions drawn on the canvas. Create them with the slice tool, then move, resize, and name them; exports produce each slice separately — great for UI and atlas splitting.' },
        ],
      },
      {
        id: 'faq-workspace',
        title: 'Interface and themes',
        items: [
          { id: 'faq-ui-dock', q: 'Can panel layouts be adjusted?', a: 'Yes. Panels dock, float, and rearrange; layouts save into the workspaces/ directory, and changing layout never enters document undo history.' },
          { id: 'faq-ui-tabs', q: 'Can I open multiple projects at once?', a: 'Yes. Projects stay open as tabs, and home project categories plus recent files make switching quick.' },
          { id: 'faq-ui-themes', q: 'How many appearances does the UI have?', a: 'The app ships with multiple themes in dark and light modes — this website’s day/night switch comes from the app’s Dark and Light palettes.' },
          { id: 'faq-ui-script', q: 'Can scripts adjust the interface?', a: 'Within limits. mse.workspace queries and sets panel visibility and dock position (left / right / bottom / floating); panel layout is local interface state and never enters document history.' },
        ],
      },
      {
        id: 'faq-scripting',
        title: 'Scripting and extensions',
        items: [
          { id: 'faq-script-lua', q: 'Can I write scripts?', a: 'Yes. Drop Lua scripts into the scripts/ folder next to the executable and they appear under “File > Scripts”. Scripts run in a restricted Lua 5.4 sandbox and perform undoable canvas operations through transactions.' },
          { id: 'faq-script-ns', q: 'How do app.* and mse.* differ?', a: 'app.* is the compatibility namespace for migrating existing scripts, implementing an explicitly listed subset; mse.* is MoonSprite’s own API covering documents, layers, animation, palettes, tiles, brushes, selections, slices, styles, panels, and file operations. Both should be probed for capability before use.' },
          { id: 'faq-script-ext', q: 'What is a .msext extension?', a: 'An extension package format (ZIP container + manifest.json) that declares Lua commands, inserts into existing menus, adds top-level menus, and provides floating panels rendered by MoonSprite. Manage them in “Preferences > Extensions”, or install by double-click or drag-in.' },
          { id: 'faq-script-safe', q: 'Can scripts access my files?', a: 'No. The script sandbox cannot reach the file system, network, processes, debug libraries, or arbitrary local modules, and extensions cannot inject arbitrary React, DOM, CSS, JavaScript, or native code — file operations only happen through controlled endpoints the API exposes.' },
          { id: 'faq-script-error', q: 'Will a broken script corrupt my project?', a: 'No. Pixel edits and mse writes within one transaction are a single undo step, and any validation failure rolls the whole batch back. Scripts also run within image, memory, instruction, and time budgets — hitting a budget stops the script instead of freezing the app.' },
        ],
      },
      {
        id: 'faq-support',
        title: 'Support and feedback',
        items: [
          { id: 'faq-feedback', q: 'How do I report a problem?', a: 'File it on GitHub Issues with reproduction steps and screenshots; feature discussion happens in GitHub Discussions.' },
          { id: 'faq-changelog-q', q: 'Where can I see what changed?', a: 'Every development stage is recorded in the repository changelog, and the blog publishes progress notes from time to time.' },
          { id: 'faq-contribute', q: 'How can I contribute?', a: 'The repository includes a contributing guide (CONTRIBUTING.md). Source-available means implementation, docs, and tests can be checked against each other — please read the relevant contracts before submitting.' },
          { id: 'faq-roadmap', q: 'What comes next?', a: 'Development moves in stages, with priorities announced per release. Follow the GitHub repository and the blog for the latest progress.' },
        ],
      },
    ],
  },
}

const blog: Record<Language, BlogContent> = {
  zh: {
    title: '博客',
    subtitle: '开发进展、设计笔记与项目动态。',
    backToList: '返回博客',
    readMore: '阅读全文',
    posts: [
      {
        id: 'why-moonsprite',
        date: '2026-07-12',
        title: '为什么做 MoonSprite',
        excerpt: '一款新的像素画工作台应该解决什么问题？从工具、流程与透明度三个方面谈起。',
        sections: [
          { id: 'why-start', heading: '起点', paragraphs: ['像素画的工具链并不缺选择，但要在 Windows 上获得一个清晰、快速、界面可定制、并且不把简单操作复杂化的工作台，选择会突然变少。MoonSprite 的起点很简单：把我们自己想要的那个工作台做出来。'] },
          { id: 'why-principles', heading: '三个坚持', paragraphs: ['第一，作品居中：工具围绕画布，而不是相反。第二，流程完整：从第一笔到导出不离开应用。第三，透明：源码可见，开发过程与问题追踪公开可查。'] },
          { id: 'why-next', heading: '接下来', paragraphs: ['项目目前处于 Beta 开发阶段。随着 Steam 页面与发布渠道准备就绪，这里会同步更多进展。'] },
        ],
      },
      {
        id: 'dev6-progress',
        date: '2026-08-24',
        title: 'Beta 开发进展',
        excerpt: '动画时间线、图层面板与导出流程是本阶段的三条主线，也是体感变化最大的部分。',
        sections: [
          { id: 'dev6-animation', heading: '动画时间线', paragraphs: ['帧、cel 与图层在同一栏目中对应排列，调整帧时长、复制帧、连接 cel 都在当前位置完成，配合洋葱皮参考逐帧检查动作衔接。'] },
          { id: 'dev6-layers', heading: '图层面板', paragraphs: ['图层、文件夹、蒙版与混合模式组成可停靠结构。本阶段的重点是把高频操作的距离缩短，让复杂工程依然一目了然。'] },
          { id: 'dev6-export', heading: '导出流程', paragraphs: ['导出对话框覆盖静态图、GIF、逐帧图像与精灵表，预设和缩放倍率让重复交付不需要重复配置。'] },
        ],
      },
      {
        id: 'design-notes',
        date: '2026-09-02',
        title: '界面的三个设计原则',
        excerpt: '为什么 MoonSprite 的界面长成这样：作品居中、状态独立、控制可见。',
        sections: [
          { id: 'dn-canvas', heading: '作品居中', paragraphs: ['画布是唯一的主角。栏目可以停靠、隐藏、重排，但任何布局下，作品都占据视觉与操作的中心。'] },
          { id: 'dn-state', heading: '状态独立', paragraphs: ['视图移动、缩放、旋转与栏目布局不进入文档撤销历史——调整界面不该被“撤销”掉，创作历史只属于作品本身。'] },
          { id: 'dn-control', heading: '控制可见', paragraphs: ['常用操作保持一步可达，低频操作收纳有序。界面上的每一个控件都应该说明自己会做什么。'] },
        ],
      },
    ],
  },
  en: {
    title: 'Blog',
    subtitle: 'Development progress, design notes, and project updates.',
    backToList: 'Back to blog',
    readMore: 'Read more',
    posts: [
      {
        id: 'why-moonsprite',
        date: '2026-07-12',
        title: 'Why we are building MoonSprite',
        excerpt: 'What should a new pixel art workstation solve? Three angles: tools, workflow, and transparency.',
        sections: [
          { id: 'why-start', heading: 'The starting point', paragraphs: ['Pixel art is not short of tooling choices, but on Windows the list narrows quickly once you want a workstation that is clear, fast, adaptable, and does not over-complicate simple operations. MoonSprite started from a simple goal: build the workstation we wanted for ourselves.'] },
          { id: 'why-principles', heading: 'Three commitments', paragraphs: ['First, the artwork stays central: tools wrap around the canvas, not the reverse. Second, a complete workflow: from the first pixel to export without leaving the app. Third, transparency: source-available development with public progress and issue tracking.'] },
          { id: 'why-next', heading: 'What comes next', paragraphs: ['The project is currently in Beta development. As the Steam page and release channels come together, more progress will be published here.'] },
        ],
      },
      {
        id: 'dev6-progress',
        date: '2026-08-24',
        title: 'Beta development progress',
        excerpt: 'The animation timeline, layers panel, and export flow are the three main lines of this stage.',
        sections: [
          { id: 'dev6-animation', heading: 'Animation timeline', paragraphs: ['Frames, cels, and layers line up in one panel. Adjusting frame timing, duplicating frames, and linking cels happen in place, with onion skins for checking motion frame by frame.'] },
          { id: 'dev6-layers', heading: 'Layers panel', paragraphs: ['Layers, folders, masks, and blend modes form a dockable structure. This stage focuses on shortening the distance of high-frequency actions so complex projects stay readable.'] },
          { id: 'dev6-export', heading: 'Export flow', paragraphs: ['The export dialog covers stills, GIFs, frame sequences, and sprite sheets; presets and scale factors keep repeat delivery from becoming repeat configuration.'] },
        ],
      },
      {
        id: 'design-notes',
        date: '2026-09-02',
        title: 'Three interface design principles',
        excerpt: 'Why the MoonSprite interface looks the way it does: artwork central, state independent, controls visible.',
        sections: [
          { id: 'dn-canvas', heading: 'Artwork central', paragraphs: ['The canvas is the only protagonist. Panels can dock, hide, and rearrange, but under any layout the artwork holds the visual and operational center.'] },
          { id: 'dn-state', heading: 'State independent', paragraphs: ['View moves, zoom, rotation, and panel layout stay out of document undo history. Adjusting the interface should never be something you have to undo; creation history belongs to the artwork alone.'] },
          { id: 'dn-control', heading: 'Controls visible', paragraphs: ['Frequent actions stay one step away; rare actions are organized out of the way. Every control on screen should explain what it does.'] },
        ],
      },
    ],
  },
}

const marketPage: Record<Language, MarketContent> = {
  zh: {
    title: '市场',
    subtitle: '为 MoonSprite 准备的资产包与宠物包。买下即用：导入后在软件里直接编辑每一帧。',
    shelfEyebrow: 'MARKET / 热门资产包',
    shelfTitle: '热门资产包',
    shelfBody: '卖得最好的瓦片、界面、角色与图标包。每个包都按像素网格绘制，导入后直接在软件里编辑。',
    animations: { idle: '待机', walk: '行走', run: '奔跑', sit: '坐下', sleep: '睡觉', celebrate: '庆祝', hurt: '受击' },
    pets: { slime: '月史莱姆', cat: '像素猫', mushroom: '蘑菇仔', dragon: '幼龙', wolf: '月狼', wisp: '游魂', phoenix: '小火凤' },
    categories: { all: '全部', pets: '宠物包', assets: '资产包', bundles: '捆绑包' },
    search: '搜索包',
    searchHint: '输入包名或关键词，例如“瓦片”“宠物”。',
    sort: '排序',
    sortOptions: { featured: '推荐顺序', priceAsc: '价格从低到高', priceDesc: '价格从高到低' },
    count: (visible, total) => `显示 ${visible} / ${total} 个包`,
    empty: { title: '没有匹配的包。', body: '换一个关键词，或者把分类切回“全部”。', action: '清空筛选' },
    card: {
      details: '查看详情',
      add: '加入购物车',
      owned: '已在购物车',
      save: '省',
      bundleOf: (count) => `包含 ${count} 个包`,
      valueOf: (price) => `单独购买 ${price}`,
      loops: (count) => `${count} 组动画`,
    },
    detail: {
      back: '返回市场',
      eyebrow: 'MARKET / 包详情',
      preview: '动画预览',
      includes: '包含内容',
      bundleContents: '这个捆绑包含哪些包',
      specs: '规格与授权',
      formats: '文件格式',
      size: '规格',
      license: '授权',
      licenseBody: '个人与商业项目均可使用，不限作品数量；不得转售或再分发原始资源。',
      buy: '把想买的包放进购物车，正式发布后一键结算。',
      related: '其他包',
      frames: (count) => `${count} 帧`,
      notFound: '找不到这个包。',
    },
    cart: {
      title: '购物车',
      open: '打开购物车',
      close: '关闭购物车',
      empty: '购物车是空的。先挑一个包，它就会出现在这里。',
      subtotal: '小计',
      remove: '移除',
      increase: '增加一份',
      decrease: '减少一份',
      checkout: '去结算',
      checkoutSoon: '结算通道随正式发布开放',
      note: 'Beta 期间先把想买的包放进购物车，正式发布后即可一键结算。',
      continue: '继续浏览',
      clear: '清空购物车',
    },
    trust: {
      title: '购买说明',
      license: '一次购买，个人与商业项目都能用；原始资源不得转售。',
      updates: '已购资产包的后续更新免费，会出现在软件的更新通道里。',
      refunds: '发布后提供 14 天无理由退款；结算前会再次展示许可条款。',
    },
    support: { title: '找不到想要的包？', body: '告诉我们你缺什么素材，或者提交你做的包。社区渠道与 GitHub Discussions 都可以。', link: '前往社区' },
  },
  en: {
    title: 'Market',
    subtitle: 'Asset packs and pet packs for MoonSprite. Buy once, then edit every frame inside the app.',
    shelfEyebrow: 'MARKET / POPULAR ASSET PACKS',
    shelfTitle: 'Popular asset packs',
    shelfBody: 'The tiles, interface, character, and icon packs people buy most. Everything is drawn on a pixel grid and stays editable once it is in the app.',
    animations: { idle: 'Idle', walk: 'Walk', run: 'Run', sit: 'Sit', sleep: 'Sleep', celebrate: 'Celebrate', hurt: 'Hurt' },
    pets: { slime: 'Moon slime', cat: 'Pixel cat', mushroom: 'Mushroom kid', dragon: 'Wyrmling', wolf: 'Moon wolf', wisp: 'Wisp', phoenix: 'Ember phoenix' },
    categories: { all: 'All packs', pets: 'Pet packs', assets: 'Asset packs', bundles: 'Bundles' },
    search: 'Search packs',
    searchHint: 'Try a pack name or a keyword such as “tiles” or “pet”.',
    sort: 'Sort',
    sortOptions: { featured: 'Featured order', priceAsc: 'Price: low to high', priceDesc: 'Price: high to low' },
    count: (visible, total) => `Showing ${visible} of ${total} packs`,
    empty: { title: 'No packs match.', body: 'Try another keyword, or switch the category back to all packs.', action: 'Clear filters' },
    card: {
      details: 'View details',
      add: 'Add to cart',
      owned: 'In cart',
      save: 'Save',
      bundleOf: (count) => `${count} packs included`,
      valueOf: (price) => `Bought separately ${price}`,
      loops: (count) => `${count} animation loops`,
    },
    detail: {
      back: 'Back to market',
      eyebrow: 'MARKET / PACK',
      preview: 'Animation preview',
      includes: 'What is inside',
      bundleContents: 'What this bundle contains',
      specs: 'Spec and license',
      formats: 'Formats',
      size: 'Spec',
      license: 'License',
      licenseBody: 'Personal and commercial projects, no title limit. Reselling or redistributing the source assets is not allowed.',
      buy: 'Stage the packs you want in the cart; one-click checkout opens with the official release.',
      related: 'Other packs',
      frames: (count) => `${count} frames`,
      notFound: 'That pack does not exist.',
    },
    cart: {
      title: 'Cart',
      open: 'Open cart',
      close: 'Close cart',
      empty: 'Your cart is empty. Pick a pack and it lands here.',
      subtotal: 'Subtotal',
      remove: 'Remove',
      increase: 'Add one more',
      decrease: 'Remove one',
      checkout: 'Checkout',
      checkoutSoon: 'Checkout opens at release',
      note: 'During the beta you can stage the packs you want here; one-click checkout opens with the official release.',
      continue: 'Keep browsing',
      clear: 'Empty cart',
    },
    trust: {
      title: 'Before you buy',
      license: 'Buy once, use it in personal and commercial projects. Reselling the source assets is not allowed.',
      updates: 'Updates to the packs you own are free and arrive through the app’s update channel.',
      refunds: 'A 14-day no-questions refund applies after release, and the license is shown again before checkout.',
    },
    support: { title: 'Missing a pack?', body: 'Tell us what art you need, or submit a pack of your own through the community channels or GitHub Discussions.', link: 'Go to the community' },
  },
}

export const copy: Record<Language, Copy> = {
  zh: {
    meta: {
      title: 'MoonSprite - Windows 像素画工作台',
      description: 'MoonSprite 是面向 Windows 的原创源码可见像素画工作台。绘制、制作动画并管理完整创作流程。',
    },
    nav: { work: '作品', features: '功能', market: '市场', docs: '文档', faq: 'FAQ', blog: '博客', community: '社区', menu: '打开导航', close: '关闭导航' },
    common: { dev: 'Beta 开发中', steam: '在 Steam 加入愿望单', steamSoon: '即将登陆 Steam', github: '查看 GitHub', themeToLight: '切换到白天模式', themeToDark: '切换到黑夜模式' },
    chrome: { docLabel: '未命名工程' },
    hero: {
      title: 'MoonSprite',
      subtitle: '专注像素创作的 Windows 工作台。',
      description: '从第一笔、第一层，到逐帧动画与最终导出，在一个清晰、快速、可定制的工作空间里完成。',
      platform: 'Windows 10 / 11',
      license: '源码可见许可',
      windowTitle: 'MoonSprite - Beta',
      imageAlt: 'MoonSprite 编辑器完整界面，中央显示像素作品，左右为颜色、图层和动画面板',
      prevSlide: '上一张背景',
      nextSlide: '下一张背景',
    },
    work: { eyebrow: '画廊 gallery/', title: '从微小图标，到完整世界。', description: '以下像素作品来自工程的 gallery/ 目录，用于展示不同尺度、色彩与构图下的像素表现。', itemAlt: ['月面基地：蓝色地球下的月球观测站', '绿崖彗星：划过绿色山崖的彗星', '山丘城堡：绿色山丘上的白色城堡', '月光林道：月光下的森林小径', '云中红塔：云海之间的红色高塔', '草原雷暴：草原上空的闪电风暴'] },
    features: {
      eyebrow: 'FEATURES',
      title: '软件功能',
      description: '从画笔到切片，工具栏覆盖像素创作的每一步。图标取自软件内的像素图标。',
      items: [
        { icon: 'pencil', title: '像素铅笔', body: '逐像素落笔，按住 Shift 从上一落点连接直线。' },
        { icon: 'airbrush', title: '喷枪', body: '粒子喷涂，大小、散布、密度与频率都可调整。' },
        { icon: 'eraser', title: '橡皮擦', body: '按住拖动，擦除当前图层中的像素。' },
        { icon: 'selection', title: '选区与变换', body: '矩形、椭圆、套索、多边形与魔棒，支持移动、翻转、缩放与旋转。' },
        { icon: 'move', title: '移动', body: '拖动当前图层、所选图层或选区中的内容。' },
        { icon: 'shape', title: '形状与线条', body: '矩形、椭圆、自由形状、多边形、直线与曲线。' },
        { icon: 'fill', title: '油漆桶与渐变', body: '填充连续区域，创建前景色到背景色的线性渐变。' },
        { icon: 'eyedropper', title: '吸管', body: '单击或拖动读取画布颜色，右键设置背景色。' },
        { icon: 'text', title: '文本图层', body: '创建可编辑文本，字体、字号、间距与渲染方式可调。' },
        { icon: 'slice', title: '切片', body: '拖动划定导出区域，命名后按切片分别输出。' },
        { icon: 'rotate', title: '旋转视图', body: '围绕指向标旋转当前视角，画布内容保持不变。' },
        { icon: 'zoom', title: '缩放', body: '单击或拖动调整视图缩放，右键执行反向缩放。' },
      ],
    },
    cta: { eyebrow: '下一帧，即将开始', title: '关注 MoonSprite 的开发进度。', body: 'Steam 页面开放后即可加入愿望单。现在可以先在 GitHub 查看源代码、版本进展与已知问题。' },
    footer: {
      tagline: '原创源码可见的 Windows 像素画工作台。',
      columns: {
        community: {
          title: '社区',
          items: [
            { key: 'github', label: 'GitHub 仓库' },
            { key: 'issues', label: '问题反馈' },
            { key: 'discussions', label: '功能讨论' },
            { key: 'steam', label: 'Steam 社区' },
          ],
        },
        follow: {
          title: '关注我们',
          items: [
            { key: 'x', label: 'X (Twitter)' },
            { key: 'xiaohongshu', label: '小红书' },
            { key: 'bilibili', label: '哔哩哔哩' },
            { key: 'heybox', label: '小黑盒' },
          ],
        },
        docs: {
          title: '文档',
          items: [
            { key: 'docs', label: '使用文档' },
            { key: 'faq', label: '常见问题' },
            { key: 'support', label: '支持' },
            { key: 'blog', label: '博客' },
            { key: 'changelog', label: '更新日志' },
          ],
        },
        more: {
          title: '更多',
          items: [
            { key: 'team', label: '开发团队' },
            { key: 'privacy', label: '隐私政策' },
          ],
        },
      },
      copyright: '© 2026 MoonSprite 贡献者',
      source: '源代码',
      license: '源码可见许可',
    },
    docsPage: docs.zh,
    faqPage: faqPage.zh,
    blogPage: blog.zh,
    marketPage: marketPage.zh,
  },
  en: {
    meta: { title: 'MoonSprite - Pixel Art Workstation for Windows', description: 'MoonSprite is an original source-available pixel art workstation for Windows, built for drawing, animation, and a complete creative workflow.' },
    nav: { work: 'Artwork', features: 'Features', market: 'Market', docs: 'Docs', faq: 'FAQ', blog: 'Blog', community: 'Community', menu: 'Open navigation', close: 'Close navigation' },
    common: { dev: 'Beta in development', steam: 'Wishlist on Steam', steamSoon: 'Coming soon to Steam', github: 'View on GitHub', themeToLight: 'Switch to light mode', themeToDark: 'Switch to dark mode' },
    chrome: { docLabel: 'Untitled project' },
    hero: {
      title: 'MoonSprite',
      subtitle: 'A Windows workstation focused on pixel art.',
      description: 'Take an idea from its first pixel and first layer through frame-by-frame animation and final export in one clear, fast, adaptable workspace.',
      platform: 'Windows 10 / 11',
      license: 'Source available',
      windowTitle: 'MoonSprite - Beta',
      imageAlt: 'Full MoonSprite editor interface with pixel artwork in the center and color, layer, and animation panels around it',
      prevSlide: 'Previous artwork',
      nextSlide: 'Next artwork',
    },
    work: { eyebrow: 'Gallery', title: 'From tiny icons to complete worlds.', description: 'These pixel pieces ship in the project gallery/ directory to demonstrate different scales, palettes, and compositions.', itemAlt: ['Lunar base: a moon observatory under a blue Earth', 'Green cliffs: a comet streaking past mossy cliffs', 'Hilltop castle: a white castle on a green hill', 'Moonlit path: a forest trail under the moon', 'Tower in the clouds: a red tower among storm clouds', 'Prairie storm: lightning over a grassland'] },
    features: {
      eyebrow: 'FEATURES',
      title: 'Features',
      description: 'From brushes to slices — the tool rail covers every step of pixel creation. Icons come straight from the in-app pixel icons.',
      items: [
        { icon: 'pencil', title: 'Pixel pencil', body: 'Place pixels one by one; hold Shift to connect a line from the previous point.' },
        { icon: 'airbrush', title: 'Airbrush', body: 'Continuous particle spraying with adjustable size, spread, density, and frequency.' },
        { icon: 'eraser', title: 'Eraser', body: 'Drag to erase pixels from the current layer.' },
        { icon: 'selection', title: 'Selection and transform', body: 'Rectangle, ellipse, lasso, polygon, and magic wand with move, flip, scale, and rotate.' },
        { icon: 'move', title: 'Move', body: 'Drag the current layer, selected layers, or selected content.' },
        { icon: 'shape', title: 'Shapes and lines', body: 'Rectangles, ellipses, freeform shapes, polygons, lines, and curves.' },
        { icon: 'fill', title: 'Fill and gradient', body: 'Flood fill contiguous areas and create foreground-to-background linear gradients.' },
        { icon: 'eyedropper', title: 'Eyedropper', body: 'Click or drag to sample canvas colors; right-click sets the background color.' },
        { icon: 'text', title: 'Text layers', body: 'Editable text with font, size, spacing, and rendering controls.' },
        { icon: 'slice', title: 'Slice', body: 'Drag named export regions and export each slice separately.' },
        { icon: 'rotate', title: 'Rotate view', body: 'Rotate the current view around its indicator — the artwork stays untouched.' },
        { icon: 'zoom', title: 'Zoom', body: 'Click or drag to zoom the view; right-click zooms the opposite way.' },
      ],
    },
    cta: { eyebrow: 'The next frame is coming', title: 'Follow MoonSprite as it develops.', body: 'Wishlist on Steam when the store page goes live. For now, visit GitHub for source code, version progress, and known issues.' },
    footer: {
      tagline: 'An original source-available pixel art workstation for Windows.',
      columns: {
        community: {
          title: 'Community',
          items: [
            { key: 'github', label: 'GitHub repository' },
            { key: 'issues', label: 'Report issues' },
            { key: 'discussions', label: 'Feature discussions' },
            { key: 'steam', label: 'Steam community' },
          ],
        },
        follow: {
          title: 'Follow us',
          items: [
            { key: 'x', label: 'X (Twitter)' },
            { key: 'xiaohongshu', label: 'REDnote' },
            { key: 'bilibili', label: 'bilibili' },
            { key: 'heybox', label: 'Heybox' },
          ],
        },
        docs: {
          title: 'Docs',
          items: [
            { key: 'docs', label: 'Documentation' },
            { key: 'faq', label: 'FAQs' },
            { key: 'support', label: 'Support' },
            { key: 'blog', label: 'Blog' },
            { key: 'changelog', label: 'Changelog' },
          ],
        },
        more: {
          title: 'More',
          items: [
            { key: 'team', label: 'Development team' },
            { key: 'privacy', label: 'Privacy policy' },
          ],
        },
      },
      copyright: '© 2026 MoonSprite contributors',
      source: 'Source code',
      license: 'Source-Available License',
    },
    docsPage: docs.en,
    faqPage: faqPage.en,
    blogPage: blog.en,
    marketPage: marketPage.en,
  },
}
