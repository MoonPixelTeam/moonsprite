import { licenseCopy } from './pages/LicenseCopy'
export type Language = 'zh' | 'en'

interface DocBlockP { kind: 'p'; text: string }
interface DocBlockH3 { kind: 'h3'; id: string; text: string }
interface DocBlockUl { kind: 'ul'; items: string[] }
interface DocBlockCode { kind: 'code'; text: string }
type DocBlock = DocBlockP | DocBlockH3 | DocBlockUl | DocBlockCode
interface DocSection { id: string; title: string; blocks: DocBlock[] }
export type DocsOutlineEntry = { kind: 'page'; id: string } | { kind: 'group'; id: string; title: string; children: string[] }
export interface DocsContent { title: string; subtitle: string; sections: DocSection[]; outline: DocsOutlineEntry[] }
interface FaqItem { id: string; q: string; a: string }
interface FaqCategory { id: string; title: string; items: FaqItem[] }
export interface FaqContent { title: string; subtitle: string; categories: FaqCategory[] }
interface BlogSection { id: string; heading: string; paragraphs: string[] }
interface BlogPost { id: string; date: string; title: string; excerpt: string; sections: BlogSection[] }
export interface BlogContent { title: string; subtitle: string; backToList: string; readMore: string; posts: BlogPost[] }
interface FooterColumn { title: string; items: { key: string; label: string }[] }
interface FeatureCard { title: string; body: string; icon: string; gif?: string }
export interface MarketContent {
  title: string
  subtitle: string
  shelfEyebrow: string
  shelfTitle: string
  shelfBody: string
  animations: Record<string, string>
  pets: Record<string, string>
  categories: { all: string; pets: string; assets: string; bundles: string; extensions: string; scripts: string }
  search: string
  searchHint: string
  sort: string
  sortOptions: { featured: string; priceAsc: string; priceDesc: string }
  count: (visible: number, total: number) => string
  empty: { title: string; body: string; action: string }
  card: { details: string; add: string; owned: string; ownedPack: string; save: string; bundleOf: (count: number) => string; valueOf: (price: string) => string; loops: (count: number) => string }
  detail: {
    back: string
    eyebrow: string
    preview: string
    previewPending: string
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
  cart: { title: string; open: string; close: string; empty: string; subtotal: string; remove: string; increase: string; decrease: string; checkout: string; checkoutSoon: string; signInToBuy: string; checkoutAccount: string; note: string; continue: string; clear: string }
  trust: { title: string; license: string; updates: string; refunds: string }
  license: {
    title: string; subtitle: string; back: string
    grantsTitle: string; grants: string[]
    limitsTitle: string; limits: string[]
    refundsTitle: string; refunds: string[]
    agree: string
  }
  checkout: {
    title: string; review: string; items: string; subtotal: string; total: string
    agreementTitle: string; agreement: string; agreementLink: string
    agreeLabel: string; mustAgree: string; pay: string; paying: string; back: string
    signInFirst: string
  }
  receipt: {
    title: string; subtitle: string; download: string; downloadAll: string
    viewOrder: string; keepShopping: string; emailed: string
  }
  orders: {
    title: string; detailTitle: string; back: string
    number: string; date: string; status: string; statusPaid: string
    items: string; license: string; licenseDownload: string; noRefund: string; noRefundBody: string
    support: string; notFound: string; notFoundBody: string; viewAll: string
  }
  support: { title: string; body: string; link: string }
  /** Payout request states, shown beside each withdrawal in the studio. */
  payoutStatus: { requested: string; approved: string; paid: string; rejected: string }
  /** The report form and its reasons, reached from a pack page. */
  report: {
    open: string; title: string; reason: string; reasonCopyright: string
    reasonBroken: string; reasonMisleading: string; reasonOther: string
    detail: string; submit: string; sent: string; errorReason: string
  }
}

export interface Copy {
  meta: { title: string; description: string }
  nav: { work: string; features: string; market: string; docs: string; faq: string; blog: string; community: string; menu: string; close: string }
  common: { dev: string; steam: string; steamSoon: string; github: string; themeToLight: string; themeToDark: string }
  chrome: { docLabel: string }
  hero: { title: string; subtitle: string; description: string; platform: string; license: string; windowTitle: string; imageAlt: string; prevSlide: string; nextSlide: string }
  work: { eyebrow: string; title: string; description: string; itemAlt: string[] }
  features: { eyebrow: string; title: string; description: string; items: FeatureCard[] }
  marketTeaser: { eyebrow: string; title: string; description: string; cta: string; note: string }
  accountPage: {
    eyebrow: string
    title: string
    subtitle: string
    signIn: string
    createAccount: string
    signOut: string
    signedInAs: string
    nameLabel: string
    emailLabel: string
    passwordLabel: string
    memberSince: string
    orders: string
    recentOrders: string
    viewAll: string
    purchasesTitle: string
    purchasesSubtitle: string
    purchasesSignedOut: string
    backToAccount: string
    download: string
    downloadPending: string
    downloadPendingShort: string
    noOrders: string
    working: string
    errorName: string
    errorEmail: string
    errorPassword: string
    errorExists: string
    errorCredentials: string
    prototypeTitle: string
    prototypeBody: string
    studioHref: string
  }
  studioPage: {
    eyebrow: string
    title: string
    subtitle: string
    back: string
    unlocked: string
    lock: string
    prototypeTitle: string
    prototypeBody: string
    needAccount: string
    needAccountBody: string
    gateTitle: string
    gateBody: string
    gateLabel: string
    gateEnter: string
    gateError: string
    gateHint: string
    gross: string
    grossHint: string
    platformFee: string
    platformFeeHint: (percent: number) => string
    net: string
    netHint: string
    available: string
    availableHint: string
    withdraw: string
    withdrawn: string
    withdrawAmount: string
    withdrawSubmit: string
    withdrawRequested: string
    statusRequested: string
    errorAmount: string
    errorInsufficient: string
    upload: string
    uploadSubtitle: string
    backToStudio: string
    publishCta: string
    fieldName: string
    fieldPrice: string
    fieldPriceHint: string
    fieldCategory: string
    fieldTagline: string
    fieldBody: string
    fieldSize: string
    fieldSizeHint: string
    fieldFormats: string
    fieldFormatsHint: string
    fieldTags: string
    fieldTagsHint: string
    presetTags: string[]
    presetFormats: string[]
    /** Size suggestions per category: a tileset and a pet pack are sized in different terms. */
    presetSizes: Record<string, string[]>
    presetSizesHint: string
    sizeCustomPlaceholder: string
    formatCustomPlaceholder: string
    addValue: string
    editPack: string
    editHint: string
    saveEdit: string
    cancelEdit: string
    edit: string
    updated: string
    editSubtitle: string
    editMissing: string
    editMissingBody: string
    previewTitle: string
    previewHint: string
    publishNote: string
    required: string
    optional: string
    counter: (used: number, max: number) => string
    missing: string
    missingFields: string
    fieldCover: string
    fieldCoverHint: string
    fieldCoverReplace: string
    fieldCoverRemove: string
    fieldCoverDrop: string
    addFormat: string
    reset: string
    groupBasics: string
    groupListing: string
    groupContents: string
    groupCover: string
    groupFile: string
    fieldFile: string
    filePick: string
    fileDrop: string
    fileHint: string
    fileReplace: string
    fileSize: (bytes: number) => string
    errorFile: string
    fieldPriceConverted: (price: string) => string
    previewPlaceholder: string
    publish: string
    published: string
    errorName: string
    errorPrice: string
    errorCover: string
    errorStorage: string
    publishedLabel: string
    noPublished: string
    unpublish: string
    sales: string
    noSales: string
    colDate: string
    colPack: string
    colOrder: string
    colQty: string
    colGross: string
  }
  cta: { eyebrow: string; title: string; body: string }
  footer: { tagline: string; columns: { community: FooterColumn; follow: FooterColumn; docs: FooterColumn; more: FooterColumn }; copyright: string; source: string; license: string }
  marketPage: MarketContent
  accountSettings: {
    title: string; back: string
    profile: string; changeName: string; changeEmail: string; emailVerified: string; emailUnverified: string; verifyEmail: string; verified: string
    password: string; currentPassword: string; newPassword: string; changePassword: string; changed: string
    forgot: string; forgotTitle: string; forgotBody: string; sendReset: string; resetSent: string
    danger: string; deleteAccount: string; deleteWarning: string; deleteConfirm: string; deleted: string
    errorCurrent: string; errorSame: string; errorTaken: string
  }
  supportPage: {
    title: string; subtitle: string; back: string
    software: string; softwareBody: string; softwareAction: string
    order: string; orderBody: string; orderAction: string
    ticket: string; ticketBody: string; ticketSubject: string; ticketMessage: string
    ticketOrder: string; ticketSubmit: string; ticketSent: string; tickets: string; noTickets: string
    ticketStatus: string; statusOpen: string; statusAnswered: string
    errorSubject: string; errorMessage: string
    responseNote: string
  }
  studioSettlement: {
    title: string; subtitle: string
    payoutHistory: string; noPayouts: string; feeNote: (percent: number) => string
  }
  adminPage: {
    title: string; subtitle: string; back: string; gateTitle: string; gateBody: string
    gateLabel: string; gateEnter: string; gateHint: string
    revenue: string; revenueHint: string; fee: string; feeHint: (percent: number) => string
    listings: string; listingsHint: string
    pending: string; approved: string; rejected: string
    approve: string; reject: string; rejectReason: string
    reports: string; reportsHint: string; noReports: string; resolveReport: string; noListings: string
    withdrawals: string; withdrawalsHint: string; noWithdrawals: string; approveWithdrawal: string; rejectWithdrawal: string; markPaid: string
    statusApproved: string; statusPending: string; statusRejected: string
  }
}





const marketPage: Record<Language, MarketContent> = {
  zh: {
    title: '市场',
    subtitle: '为 MoonSprite 准备的资产包、宠物包、扩展与脚本。买下即用：导入后在软件里直接编辑每一帧。',
    shelfEyebrow: 'MARKET / 热门包',
    shelfTitle: '热门包',
    shelfBody: '卖得最好的宠物包、瓦片、界面、角色与图标包。每个包都按像素网格绘制，导入后直接在软件里编辑；扩展与脚本包同样可以在这里获取。',
    animations: { idle: '待机', walk: '行走', run: '奔跑', sit: '坐下', sleep: '睡觉', celebrate: '庆祝', hurt: '受击' },
    pets: { slime: '月史莱姆', cat: '像素猫', mushroom: '蘑菇仔', dragon: '幼龙', wolf: '月狼', wisp: '游魂', phoenix: '小火凤' },
    categories: { all: '全部', pets: '宠物包', assets: '资产包', bundles: '捆绑包', extensions: '扩展', scripts: '脚本' },
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
      ownedPack: '已拥有',
      save: '省',
      bundleOf: (count) => `包含 ${count} 个包`,
      valueOf: (price) => `单独购买 ${price}`,
      loops: (count) => `${count} 组动画`,
    },
    detail: {
      back: '返回市场',
      eyebrow: 'MARKET / 包详情',
      preview: '动画预览',
      previewPending: '预览图待补',
      includes: '包含内容',
      bundleContents: '这个捆绑包含哪些包',
      specs: '规格与授权',
      formats: '文件格式',
      size: '规格',
      license: '授权',
      licenseBody: '素材可用于个人与商业成品；程序类内容仅限授权安装与运行。团队协作、再分发及第三方权利详见完整条款。',
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
      signInToBuy: '登录后结算',
      checkoutAccount: '登录后即可用本机原型账号完成结算，订单会记录到账号里',
      note: 'Beta 期间先把想买的包放进购物车，正式发布后即可一键结算。',
      continue: '继续浏览',
      clear: '清空购物车',
    },
    trust: {
      title: '购买说明',
      license: '素材可嵌入个人与商业成品；程序与第三方内容按相应许可使用，不得独立转售原始资源。',
      updates: '交付、兼容版本与更新范围以购买时明确说明为准；已承诺的免费更新继续有效。',
      refunds: '数字内容取消与退款依适用法律及购买时的有效约定处理；未交付、质量及权利瑕疵不适用笼统的不退款限制。',
    },
    license: {
      title: licenseCopy.zh.title,
      subtitle: licenseCopy.zh.notice,
      back: '返回市场',
      grantsTitle: licenseCopy.zh.sections[2].title,
      grants: [...licenseCopy.zh.sections[2].paragraphs],
      limitsTitle: licenseCopy.zh.sections[4].title,
      limits: [...licenseCopy.zh.sections[4].paragraphs],
      refundsTitle: licenseCopy.zh.sections[6].title,
      refunds: [...licenseCopy.zh.sections[6].paragraphs],
      agree: '我已阅读数字内容许可与交易条款（草案）',
    },
    checkout: {
      title: '确认订单',
      review: '核对商品与金额',
      items: '商品',
      subtotal: '小计',
      total: '应付',
      agreementTitle: '许可协议',
      agreement: '请阅读《数字内容许可与交易条款》。取消、退款及数字交付的确认要求依适用法律处理，法定救济不因数字商品属性而被排除。当前条款为待发布草案，本地结算仅用于演示。',
      agreementLink: '查看完整许可协议',
      agreeLabel: '我已阅读条款草案及售后说明，知悉当前为演示结算',
      mustAgree: '请先勾选同意许可协议。',
      pay: '确认支付',
      paying: '处理中…',
      back: '返回修改',
      signInFirst: '请先登录再结算',
    },
    receipt: {
      title: '购买成功',
      subtitle: '文件已解锁，可以立即下载。这个订单也会一直留在「购买记录」里。',
      download: '立即下载',
      downloadAll: '全部下载',
      viewOrder: '查看订单详情',
      keepShopping: '继续逛逛',
      emailed: '许可与下载入口保存在账号的购买记录中。',
    },
    orders: {
      title: '订单详情',
      detailTitle: '订单',
      back: '返回购买记录',
      number: '订单号',
      date: '下单时间',
      status: '状态',
      statusPaid: '已支付',
      items: '商品明细',
      license: '许可',
      licenseDownload: '许可协议',
      noRefund: '取消、退款与售后',
      noRefundBody: '下载失败、文件损坏、内容与描述实质不符或授权存在问题时，可申请售后救济。取消与退款按适用法律及购买时有效条款处理。',
      support: '联系客服',
      notFound: '找不到这个订单',
      notFoundBody: '它可能属于其他账号，或者链接不完整。',
      viewAll: '查看全部购买记录',
    },
    report: {
      open: '举报这个包',
      title: '举报',
      reason: '举报原因',
      reasonCopyright: '涉嫌侵权',
      reasonBroken: '文件无法使用',
      reasonMisleading: '描述与实际不符',
      reasonOther: '其他',
      detail: '补充说明',
      submit: '提交举报',
      sent: '举报已提交，我们会尽快处理。',
      errorReason: '请选择举报原因。',
    },
    payoutStatus: { requested: '待处理', approved: '已通过', paid: '已打款', rejected: '已拒绝' },
    support: { title: '找不到想要的包？', body: '告诉我们你缺什么素材，或者提交你做的包。社区渠道与 GitHub Discussions 都可以。', link: '前往社区' },
  },
  en: {
    title: 'Market',
    subtitle: 'Asset packs, pet packs, extensions, and scripts for MoonSprite. Buy once, then edit every frame inside the app.',
    shelfEyebrow: 'MARKET / POPULAR PACKS',
    shelfTitle: 'Popular packs',
    shelfBody: 'The pet packs, tiles, interface, character, and icon packs people buy most. Everything is drawn on a pixel grid and stays editable once it is in the app, and extensions and script packs are found here too.',
    animations: { idle: 'Idle', walk: 'Walk', run: 'Run', sit: 'Sit', sleep: 'Sleep', celebrate: 'Celebrate', hurt: 'Hurt' },
    pets: { slime: 'Moon slime', cat: 'Pixel cat', mushroom: 'Mushroom kid', dragon: 'Wyrmling', wolf: 'Moon wolf', wisp: 'Wisp', phoenix: 'Ember phoenix' },
    categories: { all: 'All packs', pets: 'Pet packs', assets: 'Asset packs', bundles: 'Bundles', extensions: 'Extensions', scripts: 'Scripts' },
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
      ownedPack: 'Owned',
      save: 'Save',
      bundleOf: (count) => `${count} packs included`,
      valueOf: (price) => `Bought separately ${price}`,
      loops: (count) => `${count} animation loops`,
    },
    detail: {
      back: 'Back to market',
      eyebrow: 'MARKET / PACK',
      preview: 'Animation preview',
      previewPending: 'Preview coming soon',
      includes: 'What is inside',
      bundleContents: 'What this bundle contains',
      specs: 'Spec and license',
      formats: 'Formats',
      size: 'Spec',
      license: 'License',
      licenseBody: 'Assets may be embedded in personal and commercial works. Programs are licensed for authorised installation and execution. See the full terms for collaboration, redistribution and third-party rights.',
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
      signInToBuy: 'Sign in to check out',
      checkoutAccount: 'Sign in to complete the order with the local prototype account; it is recorded under your account',
      note: 'During the beta you can stage the packs you want here; one-click checkout opens with the official release.',
      continue: 'Keep browsing',
      clear: 'Empty cart',
    },
    trust: {
      title: 'Before you buy',
      license: 'Assets may be embedded in personal and commercial works. Programs and third-party content follow their respective licences; standalone resale of original resources is prohibited.',
      updates: 'Delivery, compatibility and updates follow the terms stated at purchase; existing promises of free updates remain binding.',
      refunds: 'Cancellation and refunds follow applicable law and valid purchase terms. Non-delivery, defects and licensing issues are not subject to a blanket no-refund rule.',
    },
    license: {
      title: licenseCopy.en.title,
      subtitle: licenseCopy.en.notice,
      back: 'Back to the market',
      grantsTitle: licenseCopy.en.sections[2].title,
      grants: [...licenseCopy.en.sections[2].paragraphs],
      limitsTitle: licenseCopy.en.sections[4].title,
      limits: [...licenseCopy.en.sections[4].paragraphs],
      refundsTitle: licenseCopy.en.sections[6].title,
      refunds: [...licenseCopy.en.sections[6].paragraphs],
      agree: 'I have read the draft Digital Content Licence and Transaction Terms',
    },
    checkout: {
      title: 'Confirm order',
      review: 'Check the items and the total',
      items: 'Items',
      subtotal: 'Subtotal',
      total: 'Total',
      agreementTitle: 'Licence',
      agreement: 'Read the Digital Content Licence and Transaction Terms. Applicable cancellation, refund and digital-delivery consent requirements remain protected. These terms are a pre-publication draft; local checkout is a demonstration.',
      agreementLink: 'Read the full licence',
      agreeLabel: 'I have read the draft terms and remedy information and understand this checkout is a demonstration',
      mustAgree: 'Tick the licence box first.',
      pay: 'Pay now',
      paying: 'Working\u2026',
      back: 'Back to cart',
      signInFirst: 'Sign in to check out',
    },
    receipt: {
      title: 'Purchase complete',
      subtitle: 'The files are unlocked and ready to download. The order stays in your purchases.',
      download: 'Download now',
      downloadAll: 'Download all',
      viewOrder: 'View order',
      keepShopping: 'Keep browsing',
      emailed: 'The licence and download links live in your account purchases.',
    },
    orders: {
      title: 'Order',
      detailTitle: 'Order',
      back: 'Back to purchases',
      number: 'Order number',
      date: 'Placed',
      status: 'Status',
      statusPaid: 'Paid',
      items: 'Items',
      license: 'Licence',
      licenseDownload: 'Licence terms',
      noRefund: 'Cancellation, refunds and support',
      noRefundBody: 'Request support for failed delivery, damaged files, material misdescription or licensing issues. Cancellation and refunds follow applicable law and the valid terms at purchase.',
      support: 'Contact support',
      notFound: 'Order not found',
      notFoundBody: 'It may belong to another account, or the link may be incomplete.',
      viewAll: 'See all purchases',
    },
    report: {
      open: 'Report this pack',
      title: 'Report',
      reason: 'Reason',
      reasonCopyright: 'Copyright',
      reasonBroken: 'File does not work',
      reasonMisleading: 'Does not match the description',
      reasonOther: 'Something else',
      detail: 'Anything else',
      submit: 'Submit report',
      sent: 'Report submitted. We will look at it shortly.',
      errorReason: 'Choose a reason.',
    },
    payoutStatus: { requested: 'Requested', approved: 'Approved', paid: 'Paid', rejected: 'Rejected' },
    support: { title: 'Missing a pack?', body: 'Tell us what art you need, or submit a pack of your own through the community channels or GitHub Discussions.', link: 'Go to the community' },
  },
}

export const copy: Record<Language, Copy> = {
  zh: {
    meta: {
      title: 'MoonSprite - Windows 像素画工作台',
      description: 'MoonSprite 是面向 Windows 的原创源码可见像素画工作台。绘制、制作动画并管理完整创作流程。',
    },
    nav: { work: '作品', features: '特色功能', market: '市场', docs: '文档', faq: 'FAQ', blog: '博客', community: '社区', menu: '打开导航', close: '关闭导航' },
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
    work: { eyebrow: 'GALLERY', title: '作品展示', description: '来自比赛作品展的精选画作，探索不同尺度、色彩与构图下的像素世界。', itemAlt: ['月面基地：蓝色地球下的月球观测站', '绿崖彗星：划过绿色山崖的彗星', '山丘城堡：绿色山丘上的白色城堡', '月光林道：月光下的森林小径', '云中红塔：云海之间的红色高塔', '草原雷暴：草原上空的闪电风暴'] },
    features: {
      eyebrow: 'FEATURES',
      title: '功能概览',
      description: '绘制、变换、配色与逐帧动画，在一个工作台里完成。点击预览查看细节，更多操作方式见文档。',
      items: [
        { icon: 'pencil', title: '铅笔与完美像素', body: '逐像素落笔，Shift 连接上一落点；完美像素清理折角处的多余像素，适合单像素线稿。' },
        { icon: 'airbrush', title: '喷枪与笔刷动态', body: '按住持续喷涂；粒子大小、散布、密度与频率可调，铅笔与橡皮擦还支持压力与速度动态。' },
        { icon: 'eraser', title: '橡皮擦与右键擦色', body: '左键擦成透明；默认右键把与前景色完全相同的像素替换为背景色。' },
        { icon: 'selection', title: '选区与变换', body: '矩形、椭圆、套索、多边形与魔棒，支持加选、减选与交集，变换时可按住 Shift 保持比例。' },
        { icon: 'move', title: '移动与关联图层', body: '移动当前图层、所选图层或选区内容；关联图层让多个图层共享画稿，同时各自摆放。' },
        { icon: 'shape', title: '形状与线条', body: '矩形、椭圆的描边与填充、自由形状、多边形，以及 1–8 个控制锚点的曲线。' },
        { icon: 'fill', title: '填充与智能闭合', body: '按容差与连续性填充，线稿有缺口时用智能闭合限制范围，还可选择裂纹、木纹等程序纹理。' },
        { icon: 'eyedropper', title: '吸管与替换颜色', body: '左键取前景色、右键取背景色；替换颜色（Ctrl+Shift+K）可按文档、选区、图层或调色板范围批量换色。' },
        { icon: 'text', title: '可编辑文本', body: '文字、字体与排版都保留下来，随时回到文本层修改；拖出固定框即自动换行。' },
        { icon: 'slice', title: '切片与精灵表', body: '切片划定命名导出区域，配合自动切片与精灵表导出完成素材拆分。' },
        { icon: 'rotate', title: '逐帧动画与循环节', body: '每帧独立时长，洋葱皮参考动作衔接，循环节标记“待机”“行走”并作为导出范围。' },
        { icon: 'zoom', title: '视图与平铺预览', body: '缩放、平移、旋转与镜像视图只改变观察方式；平铺预览用 3×3 副本检查无缝接缝。' },
      ],
    },
    marketTeaser: {
      eyebrow: 'MARKET',
      title: '资源市场',
      description: '从场景瓦片、角色与界面图标，到桌面宠物。浏览资源内容、文件格式与授权信息，为你的创作找到起点。',
      cta: '浏览市场',
      note: '宠物包为可安装的 .mspet 文件，扩展为 .msext 包。',
    },
    accountPage: {
      eyebrow: 'ACCOUNT',
      title: '账号与购买记录',
      subtitle: '登录后即可在这里查看已购买的资产包与宠物包。当前为本机原型账号，尚未接入服务器。',
      signIn: '登录',
      createAccount: '注册',
      signOut: '退出登录',
      signedInAs: '当前账号',
      nameLabel: '昵称',
      emailLabel: '邮箱',
      passwordLabel: '密码',
      memberSince: '注册时间',
      orders: '购买记录',
      recentOrders: '最近购买',
      viewAll: '查看更多',
      purchasesTitle: '购买记录',
      purchasesSubtitle: '账号下的全部订单，每个包都可以在这里下载。',
      purchasesSignedOut: '请先登录，登录后这里会列出你的全部订单与下载。',
      backToAccount: '返回账号',
      download: '下载',
      downloadPending: '该包的文件还没做好，暂时无法下载',
      downloadPendingShort: '待补',
      noOrders: '还没有购买记录。在市场里加入购物车后结算，订单会出现在这里。',
      working: '处理中…',
      errorName: '昵称至少 2 个字符。',
      errorEmail: '请输入有效的邮箱地址。',
      errorPassword: '密码至少 8 个字符。',
      errorExists: '该邮箱已经注册过了，直接登录即可。',
      errorCredentials: '邮箱或密码不正确。',
      prototypeTitle: '这是原型账号，不是正式账号',
      prototypeBody: '本站是静态站点，没有服务器。账号与订单保存在这台设备的浏览器里：换设备或换浏览器就看不到，清除站点数据会全部丢失，懂技术的人也能通过开发者工具查看或修改。真正收款前必须换成服务端账号——密码在服务器校验、会话放在 httpOnly Cookie、订单写进客户端碰不到的数据库。',
      studioHref: '创作者后台',
    },
    studioPage: {
      eyebrow: 'STUDIO',
      title: '创作者后台',
      subtitle: '上传要卖的资产包，查看销售额与可提现金额。这个页面不在网站导航里，只能从账号页或直接访问 #/studio 进入。',
      back: '返回账号',
      unlocked: '已进入后台',
      lock: '退出后台',
      prototypeTitle: '这里的金额与提现都是原型',
      prototypeBody: '销售额来自本机记录的订单，平台抽成是可改的示例值而不是真实费率；「提现」只是写一条申请记录，不会真的打款。真正上线需要：服务端记录每笔订单与归属、支付渠道的结算回调、实名与税务信息、以及真实的对账与打款流程。',
      needAccount: '请先登录',
      needAccountBody: '创作者后台挂在账号下，用来确认这些包是谁的。先登录，再回到这个页面。',
      gateTitle: '进入创作者后台',
      gateBody: '避免访客误入，这里加了一道口令。原型阶段的口令是 studio。',
      gateLabel: '口令',
      gateEnter: '进入',
      gateError: '口令不正确。',
      gateHint: '正式版本应该改成服务端校验的创作者身份，而不是一个所有人都知道的口令。',
      gross: '销售总额',
      grossHint: '来自本机订单的商品原价合计',
      platformFee: '平台抽成',
      platformFeeHint: (percent) => `按 ${percent}% 计算，可在下方调整`,
      net: '净收入',
      netHint: '销售总额扣除平台抽成',
      available: '可提现',
      availableHint: '净收入扣除已申请的提现',
      withdraw: '提现',
      withdrawn: '已申请提现',
      withdrawAmount: '提现金额（美元）',
      withdrawSubmit: '提交提现申请',
      withdrawRequested: '申请已记录。原型阶段不会真的打款。',
      statusRequested: '待处理',
      errorAmount: '请输入大于 0 的金额。',
      errorInsufficient: '超出可提现金额。',
      upload: '上架新资产包',
      uploadSubtitle: '填完下面的信息就能上架。右侧是市场卡片的实时预览，所见即所得。',
      backToStudio: '返回后台',
      publishCta: '上架新资产包',
      fieldName: '包名称',
      fieldPrice: '售价（人民币）',
      fieldPriceHint: '按固定汇率换算成美元记账，与目录里其他包一致',
      fieldCategory: '分类',
      fieldTagline: '一句话卖点',
      fieldBody: '详细说明',
      fieldSize: '规格说明',
      fieldSizeHint: '例如：240 个瓦片 · 8 px 网格',
      fieldFormats: '包含格式',
      fieldFormatsHint: '从下面选，或自己输入后回车',
      fieldTags: '标签',
      fieldTagsHint: '用于市场筛选与搜索',
      presetTags: ['瓦片集', '界面', '角色', '道具', '宠物', '场景', '特效', '字体'],
      presetFormats: ['PNG', 'GIF', 'Sprite sheet', 'PNG sprite sheet', '.moonsprite', '.mspet', '.msext', '.ase', 'PSD', 'SVG'],
      presetSizes: {
        assets: ['16×16 瓦片', '24×24 瓦片', '32×32 瓦片', '48×48 瓦片', '64×64 图块', '图集 · 2048 px'],
        pets: ['1 只宠物', '3 只宠物', '5 只宠物', '含待机动画', '含触发动画', '78 帧'],
        bundles: ['含 3 个包', '含 5 个包', '含全部包'],
        extensions: ['1 个扩展', '含设置页', '含独立窗口'],
        scripts: ['1 个脚本', '含批处理', '含导出脚本'],
      },
      presetSizesHint: '选一个常见的，或自己写',
      sizeCustomPlaceholder: '自定义规格',
      formatCustomPlaceholder: '自定义格式',
      addValue: '添加',
      editPack: '编辑',
      editHint: '正在编辑已上架的包，保存后市场会立刻更新。',
      saveEdit: '保存修改',
      cancelEdit: '取消编辑',
      edit: '编辑',
      updated: '修改已保存，市场里的信息同步更新了。',
      editSubtitle: '改动保存后，市场里的名称、价格、规格与封面会立刻跟着更新。',
      editMissing: '找不到这个包',
      editMissingBody: '它可能已经被下架或删除了。你可以回到后台查看现有列表，或直接上架一个新包。',
      previewTitle: '上架预览',
      previewHint: '市场卡片会按这个样子展示。',
      publishNote: '上架后立刻出现在市场，任何人都可以购买；下架入口在「已上架的包」里。',
      required: '必填',
      optional: '选填',
      counter: (used, max) => `${used} / ${max}`,
      missing: '还差这些必填项',
      missingFields: '请先补齐标红的字段。',
      fieldCover: '封面图',
      fieldCoverHint: '选择一张图片，或先留空',
      fieldCoverReplace: '更换封面',
      fieldCoverRemove: '移除',
      fieldCoverDrop: '也可以把图片拖到这里',
      addFormat: '添加',
      reset: '清空表单',
      groupBasics: '基本信息',
      groupListing: '市场展示',
      groupContents: '包内容',
      groupCover: '封面',
      groupFile: '包文件',
      fieldFile: '包文件',
      filePick: '选择要交付的包文件',
      fileDrop: '也可以把文件拖到这里',
      fileHint: '买家付款后下载的就是这个文件。上传后暂存在本机浏览器，正式上线需改为服务端存储。',
      fileReplace: '更换文件',
      fileSize: (bytes) => bytes < 1048576 ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB',
      errorFile: '文件保存失败，可能是浏览器存储空间不足。',
      fieldPriceConverted: (price) => `约 ${price}`,
      previewPlaceholder: '未命名资产包',
      publish: '上架',
      published: '已上架。它现在已经出现在市场里，任何人都可以购买。',
      errorName: '请填写包名称。',
      errorPrice: '价格不能为负。',
      errorCover: '封面图读取失败。',
      errorStorage: '保存失败，可能是浏览器存储空间不足——换一张小一点的封面图试试。',
      publishedLabel: '已上架的包',
      noPublished: '还没有上架任何包。用上面的表单发布第一个。',
      unpublish: '下架',
      sales: '销售明细',
      noSales: '还没有销售记录。上架之后，别人在市场购买就会出现在这里。',
      colDate: '日期',
      colPack: '包',
      colOrder: '订单号',
      colQty: '数量',
      colGross: '金额',
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
            { key: 'ui', label: '组件库' },
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
    marketPage: marketPage.zh,
    accountSettings: {
      title: '账号设置',
      back: '返回账号',
      profile: '资料',
      changeName: '昵称',
      changeEmail: '邮箱',
      emailVerified: '已验证',
      emailUnverified: '未验证',
      verifyEmail: '发送验证邮件',
      verified: '验证邮件已发送。原型阶段不会真的发信。',
      password: '密码',
      currentPassword: '当前密码',
      newPassword: '新密码',
      changePassword: '修改密码',
      changed: '密码已修改。',
      forgot: '忘记密码？',
      forgotTitle: '重置密码',
      forgotBody: '输入注册邮箱，我们会发送重置链接。原型阶段会直接告诉你账号是否存在，正式版不会这样做。',
      sendReset: '发送重置邮件',
      resetSent: '如果该邮箱已注册，重置邮件已发送。',
      danger: '危险操作',
      deleteAccount: '注销账号',
      deleteWarning: '注销会删除账号、订单记录与已上传的包文件，且无法恢复。',
      deleteConfirm: '输入 DELETE 以确认',
      deleted: '账号已注销。',
      errorCurrent: '当前密码不正确。',
      errorSame: '新密码不能与当前密码相同。',
      errorTaken: '该邮箱已被其他账号使用。',
    },
    supportPage: {
      title: '客服',
      subtitle: '软件问题与订单问题走不同入口，选对了处理更快。',
      back: '返回账号',
      software: '软件使用问题',
      softwareBody: '界面、工具、导出、脚本或性能问题。这类问题在社区里通常更快得到回答，也能帮到其他人。',
      softwareAction: '前往 GitHub Discussions',
      order: '订单与下载问题',
      orderBody: '付款后没拿到文件、下载失败、文件损坏，或内容与描述明显不符。',
      orderAction: '提交工单',
      ticket: '提交工单',
      ticketBody: '写清楚订单号与现象，我们按顺序处理。',
      ticketSubject: '标题',
      ticketMessage: '详细说明',
      ticketOrder: '关联订单（选填）',
      ticketSubmit: '提交工单',
      ticketSent: '工单已提交。原型阶段不会有真的客服回复。',
      tickets: '我的工单',
      noTickets: '还没有提交过工单。',
      ticketStatus: '状态',
      statusOpen: '待处理',
      statusAnswered: '已回复',
      errorSubject: '请填写标题。',
      errorMessage: '请把问题写清楚一些。',
      responseNote: '请提供订单编号和问题说明；下载、质量及授权问题可申请补交、修复或依法享有的退款等救济。也可邮件联系 2310502033@qq.com。',
    },
    studioSettlement: {
      title: '收益与提现',
      subtitle: '查看收入、申请支付宝提现与跟踪处理进度。',
      payoutHistory: '提现记录',
      noPayouts: '还没有提现申请。',
      feeNote: (percent) => `平台按 ${percent}% 抽成，其余为你的净收入。`,
    },
    adminPage: {
      title: '平台管理',
      subtitle: '审核上架内容、处理举报、查看平台收入。这个页面不在导航里，只能直接访问 #/admin。',
      back: '返回市场',
      gateTitle: '进入平台管理',
      gateBody: '管理员入口。原型阶段的口令是 admin。',
      gateLabel: '口令',
      gateEnter: '进入',
      gateHint: '正式版本应该是服务端校验的管理员身份，而不是一个口令。',
      revenue: '平台收入',
      revenueHint: '来自全部已支付订单的抽成',
      fee: '当前抽成',
      feeHint: (percent) => `平台按 ${percent}% 抽成`,
      listings: '上架审核',
      listingsHint: '新上架的包需要审核通过后才会出现在市场。',
      pending: '待审核',
      approved: '已通过',
      rejected: '已驳回',
      approve: '通过',
      reject: '驳回',
      rejectReason: '驳回理由',
      reports: '举报',
      reportsHint: '卖家或买家提交的举报。',
      noReports: '没有待处理的举报。',
      resolveReport: '标记已处理',
      noListings: '还没有上架的包。',
      withdrawals: '提现申请', withdrawalsHint: '审核卖家的提现请求并记录打款状态。', noWithdrawals: '没有提现申请。', approveWithdrawal: '批准', rejectWithdrawal: '拒绝', markPaid: '标记已打款',
      statusApproved: '已上架',
      statusPending: '待审核',
      statusRejected: '已驳回',
    },
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
    work: { eyebrow: 'Gallery', title: 'From tiny icons to complete worlds.', description: 'Selected works from the competition exhibition. Explore pixel worlds through different scales, palettes and compositions.', itemAlt: ['Lunar base: a moon observatory under a blue Earth', 'Green cliffs: a comet streaking past mossy cliffs', 'Hilltop castle: a white castle on a green hill', 'Moonlit path: a forest trail under the moon', 'Tower in the clouds: a red tower among storm clouds', 'Prairie storm: lightning over a grassland'] },
    features: {
      eyebrow: 'FEATURES',
      title: 'Features',
      description: 'Draw, transform, color and animate in one workspace. Open a preview for a closer look, or explore the documentation.',
      items: [
        { icon: 'pencil', title: 'Pencil and pixel-perfect', body: 'Place pixels one by one and use Shift to connect from the previous point; pixel-perfect cleans up the redundant pixels at path corners.' },
        { icon: 'airbrush', title: 'Airbrush and brush dynamics', body: 'Spray while held, with particle size, spread, density, and frequency; the pencil and eraser also take pressure and speed dynamics.' },
        { icon: 'eraser', title: 'Eraser and right-button erase', body: 'The left button erases to transparent; by default the right button replaces pixels identical to the foreground color with the background color.' },
        { icon: 'selection', title: 'Selection and transform', body: 'Rectangle, ellipse, lasso, polygon, and magic wand with add, subtract, and intersect; hold Shift while scaling to keep the ratio.' },
        { icon: 'move', title: 'Move and linked layers', body: 'Move the current layer, selected layers, or selection content; linked layers share one drawing across several layers while placing it separately.' },
        { icon: 'shape', title: 'Shapes and lines', body: 'Rectangle and ellipse with stroke or fill, free shapes, polygons, and curves with 1–8 control anchors.' },
        { icon: 'fill', title: 'Fill and smart close', body: 'Fill by tolerance and contiguity, keep a fill inside a gapped outline with smart close, and pick cracks, wood grain, or other procedural textures.' },
        { icon: 'eyedropper', title: 'Eyedropper and replace color', body: 'The left button takes the foreground color and the right the background; replace color (Ctrl+Shift+K) recolors a scope such as document, selection, layers, or palette.' },
        { icon: 'text', title: 'Editable text', body: 'Characters, font, and layout all stay editable; drag out a fixed box and the text wraps automatically.' },
        { icon: 'slice', title: 'Slices and sprite sheets', body: 'Slices mark named export regions, and auto slice plus sprite sheet export finish the asset split.' },
        { icon: 'rotate', title: 'Frame animation and loops', body: 'A duration per frame, onion skin as motion reference, and named loops such as “idle” or “walk” that also drive export ranges.' },
        { icon: 'zoom', title: 'View controls and tile preview', body: 'Zoom, pan, rotate, and mirror change only your vantage; tiled preview shows 3×3 copies to check a seamless edge.' },
      ],
    },
    marketTeaser: {
      eyebrow: 'MARKET',
      title: 'A market of assets and pets, ready to use.',
      description: 'Tilesets, interface kits, character bases, and pet packs — every piece drawn on a pixel grid and editable frame by frame once it is in the app. Extensions and script packs come from the same place.',
      cta: 'Browse the market',
      note: 'Pet packs install as .mspet files, extensions as .msext packages.',
    },
    accountPage: {
      eyebrow: 'ACCOUNT',
      title: 'Account and purchases',
      subtitle: 'Sign in to see the asset and pet packs you own. This is a local prototype account; there is no server yet.',
      signIn: 'Sign in',
      createAccount: 'Create account',
      signOut: 'Sign out',
      signedInAs: 'Signed in',
      nameLabel: 'Name',
      emailLabel: 'Email',
      passwordLabel: 'Password',
      memberSince: 'Member since',
      orders: 'Purchases',
      recentOrders: 'Recent purchases',
      viewAll: 'View all',
      purchasesTitle: 'Purchases',
      purchasesSubtitle: 'Every order on this account, with a download for each pack.',
      purchasesSignedOut: 'Sign in first — your orders and downloads are listed here once you do.',
      backToAccount: 'Back to account',
      download: 'Download',
      downloadPending: 'This pack has no file yet, so it cannot be downloaded',
      downloadPendingShort: 'Pending',
      noOrders: 'No purchases yet. Add packs to the cart in the market and check out — the order shows up here.',
      working: 'Working…',
      errorName: 'Use at least 2 characters for the name.',
      errorEmail: 'Enter a valid email address.',
      errorPassword: 'Use at least 8 characters for the password.',
      errorExists: 'That email is already registered — just sign in.',
      errorCredentials: 'That email or password is not right.',
      prototypeTitle: 'A prototype account, not a real one',
      prototypeBody: 'This site is static and has no server. Accounts and orders are stored in this browser: another device or browser sees nothing, clearing site data erases everything, and anyone can read or edit it through devtools. Before taking money this must become a server-side account — passwords verified on the server, sessions in httpOnly cookies, and orders written to a database the client cannot reach.',
      studioHref: 'Creator studio',
    },
    studioPage: {
      eyebrow: 'STUDIO',
      title: 'Creator studio',
      subtitle: 'Upload packs to sell, and see sales and what is available to withdraw. This page is not in the site navigation — reach it from the account page or straight at #/studio.',
      back: 'Back to account',
      unlocked: 'Studio open',
      lock: 'Leave studio',
      prototypeTitle: 'These amounts and withdrawals are a prototype',
      prototypeBody: 'Sales come from the orders this browser recorded, and the platform fee is an editable example rather than a real rate; “withdraw” only writes a request row and moves no money. Going live needs server-side orders with ownership, settlement callbacks from a payment provider, identity and tax details, and real reconciliation and payouts.',
      needAccount: 'Sign in first',
      needAccountBody: 'The studio hangs off an account, which is how a pack knows whose it is. Sign in, then come back to this page.',
      gateTitle: 'Enter the creator studio',
      gateBody: 'A passphrase keeps casual visitors out. During the prototype it is studio.',
      gateLabel: 'Passphrase',
      gateEnter: 'Enter',
      gateError: 'That passphrase is not right.',
      gateHint: 'A real version should verify a creator identity on the server instead of using one passphrase everybody knows.',
      gross: 'Gross sales',
      grossHint: 'Sum of pack prices from the orders recorded here',
      platformFee: 'Platform fee',
      platformFeeHint: (percent) => `Calculated at ${percent}%, adjustable below`,
      net: 'Net earnings',
      netHint: 'Gross sales minus the platform fee',
      available: 'Available',
      availableHint: 'Net earnings minus requested withdrawals',
      withdraw: 'Withdraw',
      withdrawn: 'Requested',
      withdrawAmount: 'Amount (USD)',
      withdrawSubmit: 'Request withdrawal',
      withdrawRequested: 'Request recorded. The prototype moves no money.',
      statusRequested: 'Pending',
      errorAmount: 'Enter an amount greater than 0.',
      errorInsufficient: 'That is more than the available balance.',
      upload: 'Publish a new pack',
      uploadSubtitle: 'Fill this in to put a pack on sale. The market card on the right previews exactly what buyers will see.',
      backToStudio: 'Back to studio',
      publishCta: 'Publish a new pack',
      fieldName: 'Pack name',
      fieldPrice: 'Price (CNY)',
      fieldPriceHint: 'Stored in USD at the fixed rate, like the rest of the catalogue',
      fieldCategory: 'Category',
      fieldTagline: 'One-line pitch',
      fieldBody: 'Description',
      fieldSize: 'What is inside',
      fieldSizeHint: 'e.g. 240 tiles · 8 px grid',
      fieldFormats: 'Formats included',
      fieldFormatsHint: 'Pick from the list, or type one and press Enter',
      fieldTags: 'Tags',
      fieldTagsHint: 'Used for filtering and search in the market',
      presetTags: ['Tileset', 'UI', 'Character', 'Props', 'Pets', 'Scene', 'Effects', 'Font'],
      presetFormats: ['PNG', 'GIF', 'Sprite sheet', 'PNG sprite sheet', '.moonsprite', '.mspet', '.msext', '.ase', 'PSD', 'SVG'],
      presetSizes: {
        assets: ['16×16 tiles', '24×24 tiles', '32×32 tiles', '48×48 tiles', '64×64 blocks', 'Atlas · 2048 px'],
        pets: ['1 pet', '3 pets', '5 pets', 'With idle loop', 'With trigger loops', '78 frames'],
        bundles: ['3 packs', '5 packs', 'Every pack'],
        extensions: ['1 extension', 'With settings page', 'With its own window'],
        scripts: ['1 script', 'Batch processing', 'Export script'],
      },
      presetSizesHint: 'Pick a common one, or write your own',
      sizeCustomPlaceholder: 'Custom size',
      formatCustomPlaceholder: 'Custom format',
      addValue: 'Add',
      editPack: 'Edit',
      editHint: 'Editing a published pack. Saving updates the market immediately.',
      saveEdit: 'Save changes',
      cancelEdit: 'Cancel',
      edit: 'Edit',
      updated: 'Saved. The market listing is updated.',
      editSubtitle: 'Saving updates the name, price, contents, and cover in the market right away.',
      editMissing: 'That pack is gone',
      editMissingBody: 'It may have been unpublished or removed. Check the dashboard for the current list, or publish a new pack.',
      previewTitle: 'Listing preview',
      previewHint: 'This is how the market card will look.',
      publishNote: 'Publishing lists it in the market immediately, where anyone can buy it; unpublish from the published list.',
      required: 'required',
      optional: 'optional',
      counter: (used, max) => `${used} / ${max}`,
      missing: 'Still missing',
      missingFields: 'Fill in the highlighted fields first.',
      fieldCover: 'Cover image',
      fieldCoverHint: 'Choose an image, or leave it empty',
      fieldCoverReplace: 'Replace cover',
      fieldCoverRemove: 'Remove',
      fieldCoverDrop: 'Or drop an image here',
      addFormat: 'Add',
      reset: 'Clear form',
      groupBasics: 'Basics',
      groupListing: 'Market listing',
      groupContents: 'What is inside',
      groupCover: 'Cover',
      groupFile: 'Pack file',
      fieldFile: 'Pack file',
      filePick: 'Choose the file buyers receive',
      fileDrop: 'Or drop the file here',
      fileHint: 'This is what a buyer downloads after paying. It is held in this browser for now; going live means server-side storage.',
      fileReplace: 'Replace file',
      fileSize: (bytes) => bytes < 1048576 ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB',
      errorFile: 'Could not store the file — the browser storage quota is the usual cause.',
      fieldPriceConverted: (price) => `about ${price}`,
      previewPlaceholder: 'Untitled pack',
      publish: 'Publish',
      published: 'Published. It is in the market now, and anyone can buy it.',
      errorName: 'Give the pack a name.',
      errorPrice: 'The price cannot be negative.',
      errorCover: 'Could not read that cover image.',
      errorStorage: 'Could not save. The browser storage quota is the usual cause — try a smaller cover image.',
      publishedLabel: 'Published packs',
      noPublished: 'Nothing published yet. Use the form above to add the first one.',
      unpublish: 'Unpublish',
      sales: 'Sales',
      noSales: 'No sales yet. Once a pack is published, purchases in the market show up here.',
      colDate: 'Date',
      colPack: 'Pack',
      colOrder: 'Order',
      colQty: 'Qty',
      colGross: 'Amount',
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
            { key: 'ui', label: 'Component library' },
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
    marketPage: marketPage.en,
    accountSettings: {
      title: 'Account settings',
      back: 'Back to account',
      profile: 'Profile',
      changeName: 'Name',
      changeEmail: 'Email',
      emailVerified: 'Verified',
      emailUnverified: 'Not verified',
      verifyEmail: 'Send verification email',
      verified: 'Verification email sent. The prototype does not really send mail.',
      password: 'Password',
      currentPassword: 'Current password',
      newPassword: 'New password',
      changePassword: 'Change password',
      changed: 'Password changed.',
      forgot: 'Forgot your password?',
      forgotTitle: 'Reset password',
      forgotBody: 'Enter your account email and we will send a reset link. The prototype tells you whether the account exists; a real version would not.',
      sendReset: 'Send reset email',
      resetSent: 'If that email is registered, a reset email is on its way.',
      danger: 'Danger zone',
      deleteAccount: 'Delete account',
      deleteWarning: 'Deleting removes the account, its orders, and any uploaded pack files. It cannot be undone.',
      deleteConfirm: 'Type DELETE to confirm',
      deleted: 'Account deleted.',
      errorCurrent: 'That current password is not right.',
      errorSame: 'The new password must differ from the current one.',
      errorTaken: 'That email is already used by another account.',
    },
    supportPage: {
      title: 'Support',
      subtitle: 'Software problems and order problems take different routes. Picking the right one gets a faster answer.',
      back: 'Back to account',
      software: 'Using the software',
      softwareBody: 'Interface, tools, export, scripting, or performance questions. The community usually answers these faster, and the answer helps everyone.',
      softwareAction: 'Open GitHub Discussions',
      order: 'Orders and downloads',
      orderBody: 'Paid but no file, a failed download, a damaged file, or contents that clearly differ from the description.',
      orderAction: 'Open a ticket',
      ticket: 'Open a ticket',
      ticketBody: 'Include the order number and what happened, and we will work through them in order.',
      ticketSubject: 'Subject',
      ticketMessage: 'Details',
      ticketOrder: 'Related order (optional)',
      ticketSubmit: 'Submit ticket',
      ticketSent: 'Ticket submitted. The prototype has no real support queue.',
      tickets: 'My tickets',
      noTickets: 'No tickets yet.',
      ticketStatus: 'Status',
      statusOpen: 'Open',
      statusAnswered: 'Answered',
      errorSubject: 'Give the ticket a subject.',
      errorMessage: 'Describe the problem in a little more detail.',
      responseNote: 'Provide the order number and issue details. Delivery, quality and licensing issues may qualify for redelivery, repair, refund or other legal remedies. You may also email 2310502033@qq.com.',
    },
    studioSettlement: {
      title: 'Settlement and payouts',
      subtitle: 'Review earnings, request an Alipay withdrawal and track its status.',
      payoutHistory: 'Payouts',
      noPayouts: 'No payouts yet.',
      feeNote: (percent) => `The platform keeps ${percent}%; the rest is your net earnings.`,
    },
    adminPage: {
      title: 'Platform admin',
      subtitle: 'Review listings, handle reports, and see platform revenue. Not in the navigation: reach it at #/admin.',
      back: 'Back to the market',
      gateTitle: 'Enter platform admin',
      gateBody: 'Staff entrance. The prototype passphrase is admin.',
      gateLabel: 'Passphrase',
      gateEnter: 'Enter',
      gateHint: 'A real version verifies an admin identity on the server instead of one shared passphrase.',
      revenue: 'Platform revenue',
      revenueHint: 'The platform fee across every paid order',
      fee: 'Current fee',
      feeHint: (percent) => `The platform keeps ${percent}%`,
      listings: 'Listing review',
      listingsHint: 'A newly published pack appears in the market once it is approved.',
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
      approve: 'Approve',
      reject: 'Reject',
      rejectReason: 'Reason',
      reports: 'Reports',
      reportsHint: 'Reports filed by sellers or buyers.',
      noReports: 'No reports waiting.',
      resolveReport: 'Mark handled',
      noListings: 'No packs published yet.',
      withdrawals: 'Payout requests', withdrawalsHint: 'Review seller payout requests and record when they are paid.', noWithdrawals: 'No payout requests.', approveWithdrawal: 'Approve', rejectWithdrawal: 'Reject', markPaid: 'Mark paid',
      statusApproved: 'Live',
      statusPending: 'Pending',
      statusRejected: 'Rejected',
    },
  },
}
