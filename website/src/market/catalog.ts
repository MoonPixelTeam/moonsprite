/*
 * The packs sold in the market.
 *
 * Catalog data (ids, prices, art bindings) lives here in one place; display copy
 * is bilingual and read through `L`. List prices are authored in USD and shown in
 * the reader's currency: USD for English, CNY for Chinese at the fixed rate below.
 *
 * `image` points at the pack's preview image (2x pixel art is best, any size —
 * the card frame crops to 16:10 and the detail hero shows it whole). Swap these
 * paths for the real pack shots; nothing else needs to change.
 */

import { petPacks, type PetAnimationId, type PetId, type PetPackId } from './petSprites'
import { frameSrc, type SpriteSheet } from './PixelArt'

export type Language = 'zh' | 'en'
export type MarketCategory = 'pets' | 'assets' | 'bundles' | 'extensions' | 'scripts'

type Bilingual = { zh: string; en: string }

function L(value: Bilingual, language: Language): string {
  return value[language]
}

/**
 * The animations inside a real .mspet pack. Frame counts and durations are read
 * out of the package itself, never guessed, so what the market shows is what the
 * app plays. `idle` drives the preview row.
 */
export type PackAnimations = {
  order: string[]
  sheets: Record<string, SpriteSheet>
  /** Pack animation id to display name, per language. */
  labels: Record<string, Bilingual>
  idle: SpriteSheet
}

export type PetPackProduct = {
  id: string
  category: 'pets'
  /** Set for code-drawn pets; real .mspet packs use `animations`. */
  pack?: PetPackId
  animations?: PackAnimations
  /** Still fallback; a real pack animates from its frames instead. */
  image?: string
  /**
   * The file a buyer downloads for this pack. Unset until the real artifact exists —
   * the purchase list shows a disabled button with a reason rather than a dead link.
   */
  download?: string
  /** Market filter tags; authored by the seller in the studio. */
  tags?: string[]
  name: Bilingual
  tagline: Bilingual
  body: Bilingual
  price: number
  size: Bilingual
  formats: string[]
  includes: Bilingual[]
}

/*
 * `image` is the pack's own preview artwork. Leave it unset until the real art exists:
 * the market shows an empty frame rather than a stand-in screenshot of the editor,
 * which would read as if the pack contained that screen. Drop the file in
 * public/assets/market/ and point this at it.
 */
export type AssetPackProduct = {
  id: string
  category: 'assets'
  image?: string
  /**
   * The file a buyer downloads for this pack. Unset until the real artifact exists —
   * the purchase list shows a disabled button with a reason rather than a dead link.
   */
  download?: string
  /** Market filter tags; authored by the seller in the studio. */
  tags?: string[]
  name: Bilingual
  tagline: Bilingual
  body: Bilingual
  price: number
  size: Bilingual
  formats: string[]
  includes: Bilingual[]
}

export type BundleProduct = {
  id: string
  category: 'bundles'
  packs: string[]
  members?: MarketProduct[]
  image?: string
  /**
   * The file a buyer downloads for this pack. Unset until the real artifact exists —
   * the purchase list shows a disabled button with a reason rather than a dead link.
   */
  download?: string
  /** Market filter tags; authored by the seller in the studio. */
  tags?: string[]
  name: Bilingual
  tagline: Bilingual
  body: Bilingual
  price: number
  size: Bilingual
  formats: string[]
  includes: Bilingual[]
}

/*
 * Extensions ship a packaged .msext feature (a panel, a tool, an import hook) and a
 * script pack ships Lua automation. Both are sold and listed like any other pack:
 * same card, same cart, same license. Their files land in the app's extension and
 * script folders instead of the document.
 */
export type ExtensionProduct = {
  id: string
  category: 'extensions'
  image?: string
  download?: string
  /** Market filter tags; authored by the seller in the studio. */
  tags?: string[]
  name: Bilingual
  tagline: Bilingual
  body: Bilingual
  price: number
  size: Bilingual
  formats: string[]
  includes: Bilingual[]
}

export type ScriptProduct = {
  id: string
  category: 'scripts'
  image?: string
  download?: string
  /** Market filter tags; authored by the seller in the studio. */
  tags?: string[]
  name: Bilingual
  tagline: Bilingual
  body: Bilingual
  price: number
  size: Bilingual
  formats: string[]
  includes: Bilingual[]
}

export type MarketProduct = { previews?: string[] } & (
  | PetPackProduct
  | AssetPackProduct
  | BundleProduct
  | ExtensionProduct
  | ScriptProduct
)

export const productCopy = L

/*
 * 奶龙 — decoded from 奶龙.mspet (format moonsprite-pet, version 1). 78 frames of
 * 41x31 at scale 4, cut into per-frame images under public/assets/market; durations
 * come from the pack's own per-frame table.
 */
const nailongSheets: Record<string, SpriteSheet> = {
  SHOW: { dir: '/assets/market/show/frames', frames: 41, frameWidth: 41, frameHeight: 31, duration: 4240 },
  IDLE: { dir: '/assets/market/idle/frames', frames: 7, frameWidth: 41, frameHeight: 31, duration: 900 },
  TRIGGER_TOUCH: { dir: '/assets/market/trigger_touch/frames', frames: 11, frameWidth: 41, frameHeight: 31, duration: 1100 },
  TRIGGER_UNDO: { dir: '/assets/market/trigger_undo/frames', frames: 19, frameWidth: 41, frameHeight: 31, duration: 1900 },
}

export const MARKET_PRODUCTS: MarketProduct[] = [
  {
    id: 'pet-nailong',
    category: 'pets',
    animations: {
      order: ['SHOW', 'IDLE', 'TRIGGER_TOUCH', 'TRIGGER_UNDO'],
      sheets: nailongSheets,
      labels: {
        SHOW: { zh: '出场', en: 'Entrance' },
        IDLE: { zh: '待机', en: 'Idle' },
        TRIGGER_TOUCH: { zh: '戳一下', en: 'Poke' },
        TRIGGER_UNDO: { zh: '撤销', en: 'Undo' },
      },
      idle: nailongSheets.IDLE,
    },
    // A real pack previews with its idle frames; this stays as the still fallback.
    image: frameSrc(nailongSheets.IDLE, 0),
    name: { zh: '奶龙', en: 'Nailong' },
    tagline: { zh: '78 帧手绘，不高兴会自己脸红', en: '78 hand-drawn frames — and it sulks in red when annoyed' },
    body: {
      zh: '奶龙是一只 78 帧手绘的黄色小宠，从出场到待机全部逐帧画好，没有补间。待机时它会小口呼吸，你一点它就会脸红瞪眼；你按一次撤销，它比你还激动。装进软件后按触发位在对应时机自己播放。',
      en: 'Nailong is a hand-drawn 78-frame yellow companion — entrance, idle, and reactions are all drawn frame by frame, with no tweening. It breathes while idle, flushes red and glares when you poke it, and gets more upset about an undo than you do. Install it and the trigger slots fire on their own.',
    },
    price: 4,
    size: { zh: '1 只宠物 · 4 组动画 · 78 帧', en: '1 pet · 4 animations · 78 frames' },
    formats: ['.mspet', 'PNG sprite sheet'],
    download: '/assets/market/nailong.mspet',
    includes: [
      { zh: '出场动画 41 帧，预览图就是它', en: 'Entrance animation, 41 frames — the preview above is it' },
      { zh: '待机循环 7 帧，小口呼吸', en: 'Idle loop, 7 frames of quiet breathing' },
      { zh: '戳一下 11 帧：脸红瞪眼', en: 'Poke reaction, 11 frames: blush and glare' },
      { zh: '撤销 19 帧：比你还激动', en: 'Undo reaction, 19 frames: more upset than you are' },
      { zh: '可直接安装的 .mspet 宠物包', en: 'The installable .mspet package itself' },
    ],
  },
  {
    id: 'pet-starter',
    category: 'pets',
    pack: 'starter',
    name: { zh: '初伴宠物包', en: 'Starter Companions' },
    tagline: { zh: '第一只陪你画画的像素宠物', en: 'The first pets that sit with you while you draw' },
    body: {
      zh: '三只出手绘级的像素宠物：月史莱姆、像素猫和蘑菇仔。每只都包含完整的 7 组循环动画，导入后在软件里即时播放，也可以直接在图层上编辑每一帧。',
      en: 'Three hand-drawn pixel pets — the moon slime, the pixel cat, and the mushroom kid. Each ships with all seven animation loops, plays the moment you import it, and stays fully editable frame by frame.',
    },
    price: 6,
    size: { zh: '3 只宠物 · 21 组动画', en: '3 pets · 21 animation loops' },
    formats: ['PNG', 'GIF', 'Sprite sheet', '.moonsprite'],
    includes: [
      { zh: '月史莱姆：待机 / 行走 / 奔跑 / 坐下 / 睡觉 / 庆祝 / 受击', en: 'Moon slime: idle, walk, run, sit, sleep, celebrate, hurt' },
      { zh: '像素猫：待机 / 行走 / 奔跑 / 坐下 / 睡觉 / 庆祝 / 受击', en: 'Pixel cat: idle, walk, run, sit, sleep, celebrate, hurt' },
      { zh: '蘑菇仔：待机 / 行走 / 奔跑 / 坐下 / 睡觉 / 庆祝 / 受击', en: 'Mushroom kid: idle, walk, run, sit, sleep, celebrate, hurt' },
      { zh: '单色剪影版本，方便做 UI 图标', en: 'One-color silhouettes for interface icons' },
    ],
  },
  {
    id: 'pet-moonlit',
    category: 'pets',
    pack: 'moonlit',
    name: { zh: '月影兽群宠物包', en: 'Moonlit Beasts' },
    tagline: { zh: '会飞、会嚎、会发光的三只大型伙伴', en: 'Three larger companions that glide, howl, and glow' },
    body: {
      zh: '幼龙、月狼与游魂，面向需要更强存在感的场景。动画在完整 7 组循环之外附带受击与庆祝差分，翅膀、尾巴与光晕分开绘制，方便你重上色。',
      en: 'A wyrmling, a moon wolf, and a wisp for scenes that need more presence. Beyond the seven shared loops these come with hurt and celebrate variants, and the wings, tail, and glow are drawn on separate layers for easy recoloring.',
    },
    price: 9,
    size: { zh: '3 只宠物 · 21 组动画', en: '3 pets · 21 animation loops' },
    formats: ['PNG', 'GIF', 'Sprite sheet', '.moonsprite'],
    includes: [
      { zh: '幼龙：待机 / 行走 / 奔跑 / 坐下 / 睡觉 / 庆祝 / 受击', en: 'Wyrmling: idle, walk, run, sit, sleep, celebrate, hurt' },
      { zh: '月狼：待机 / 行走 / 奔跑 / 坐下 / 睡觉 / 庆祝 / 受击', en: 'Moon wolf: idle, walk, run, sit, sleep, celebrate, hurt' },
      { zh: '游魂：待机 / 行走 / 奔跑 / 坐下 / 睡觉 / 庆祝 / 受击', en: 'Wisp: idle, walk, run, sit, sleep, celebrate, hurt' },
      { zh: '分层源文件：身体、翅膀、光晕可分别上色', en: 'Layered sources: body, wings, and glow recolor separately' },
    ],
  },
  {
    id: 'asset-cavern',
    category: 'assets',
    name: { zh: '地下洞穴瓦片集', en: 'Cavern Tileset' },
    tagline: { zh: '8px 网格对齐的地形与水体瓦片', en: 'Terrain and water tiles locked to an 8px grid' },
    body: {
      zh: '按 8 像素网格绘制的洞穴地形：石壁、地面、水位与坑洞共用同一套自动拼合规则，导入后直接铺进瓦片图层，边缘与转角都能自动接上。',
      en: 'Cave terrain drawn on an 8px grid: walls, floors, water levels, and pits share one auto-tiling rule set, so they snap into a tile layer with edges and corners already resolved.',
    },
    price: 12,
    size: { zh: '248 个瓦片 · 8 px 网格', en: '248 tiles · 8px grid' },
    formats: ['PNG', 'Sprite sheet', '.moonsprite'],
    includes: [
      { zh: '石壁、岩架与暗角共 96 个自动拼合瓦片', en: '96 auto-tiling wall, ledge, and shadow tiles' },
      { zh: '地面与苔藓变体 64 个', en: '64 floor and moss variants' },
      { zh: '水位与瀑布 48 个，含 4 帧循环', en: '48 water and waterfall tiles with a 4-frame loop' },
      { zh: '装饰瓦片 40 个：晶簇、火把、碎石', en: '40 decoration tiles: crystals, torches, rubble' },
    ],
  },
  {
    id: 'asset-interface',
    category: 'assets',
    name: { zh: '像素界面套件', en: 'Pixel Interface Kit' },
    tagline: { zh: '面板、按钮与光标，直角九宫格', en: 'Panels, buttons, and cursors on a square-cornered 9-slice' },
    body: {
      zh: '一套直角像素界面元件，用九宫格切图描述面板与按钮，缩放时边框保持整像素。全部元件按 8 像素网格绘制，颜色与 MoonSprite 的界面主题同源。',
      en: 'A square-cornered pixel interface set where panels and buttons are described by 9-slice regions, so borders stay pixel-exact at any size. Everything sits on an 8px grid and uses colors drawn from MoonSprite’s own interface themes.',
    },
    price: 8,
    size: { zh: '126 个元件 · 8 px 网格', en: '126 pieces · 8px grid' },
    formats: ['PNG', 'Sprite sheet', '.moonsprite'],
    includes: [
      { zh: '窗口与侧栏面板 18 个，含标题栏与分隔线', en: '18 window and sidebar panels with title bars and dividers' },
      { zh: '按钮、开关与滑块共 46 个，含悬停与按下状态', en: '46 buttons, toggles, and sliders with hover and pressed states' },
      { zh: '像素光标 12 个，覆盖绘制、缩放与移动', en: '12 pixel cursors for drawing, zooming, and moving' },
      { zh: '进度条、滚动条与标签页 50 个', en: '50 progress bars, scrollbars, and tabs' },
    ],
  },
  {
    id: 'asset-character',
    category: 'assets',
    // The source/ PNGs are screen-grabs of dark panels and read as blank at card
    // size, so the packs use the light-background artwork instead.
    name: { zh: '角色基础套件', en: 'Character Base' },
    tagline: { zh: '可换色、可拼接的 16px 角色基础形', en: 'A 16px base body you can recolor and recombine' },
    body: {
      zh: '一个 16 像素高的角色基础形，头部、躯干与四肢分图层绘制，附带 6 套配色。换色只需替换调色板，不需要重画像素。',
      en: 'One 16px-tall base body with separated head, torso, and limb layers plus six palettes. Recoloring means swapping a palette, not redrawing pixels.',
    },
    price: 10,
    size: { zh: '6 套配色 · 16 px 角色', en: '6 palettes · 16px character' },
    formats: ['PNG', 'Sprite sheet', '.moonsprite'],
    includes: [
      { zh: '基础形 1 个，含头、躯干、手臂、腿四个图层', en: '1 base body split into head, torso, arm, and leg layers' },
      { zh: '6 套调色板：肉色、金黄、薄荷、天蓝、暗紫、灰', en: '6 palettes: flesh, gold, mint, sky, dusk, ash' },
      { zh: '朝向 4 向 × 待机 2 帧、行走 4 帧', en: '4 facing directions with a 2-frame idle and 4-frame walk' },
      { zh: '发型与配件各 8 个，可直接叠加', en: '8 hairstyles and 8 accessories that stack on top' },
    ],
  },
  {
    id: 'asset-icons',
    category: 'assets',
    name: { zh: '道具图标集', en: 'Item Icon Set' },
    tagline: { zh: '背包与商店会用到的 24px 道具图标', en: '24px item icons for inventories and shops' },
    body: {
      zh: '320 个 24 像素道具图标，覆盖武器、护甲、消耗品与素材四类。每个图标只有一个主色和一个暗部，缩到 16 像素仍然认得出。',
      en: '320 icons at 24px across weapons, armor, consumables, and materials. Each uses a single key color plus one shade so it stays readable when scaled down to 16px.',
    },
    price: 7,
    size: { zh: '320 个图标 · 24 px', en: '320 icons · 24px' },
    formats: ['PNG', 'Sprite sheet'],
    includes: [
      { zh: '武器 96 个：剑、斧、弓、法杖', en: '96 weapons: swords, axes, bows, staves' },
      { zh: '护甲 72 个：头盔、胸甲、盾牌', en: '72 armor pieces: helmets, chestplates, shields' },
      { zh: '消耗品 88 个：药水、食物、卷轴', en: '88 consumables: potions, food, scrolls' },
      { zh: '素材 64 个：矿石、木材、皮革、宝石', en: '64 materials: ore, timber, leather, gems' },
    ],
  },
  {
    id: 'bundle-everything',
    category: 'bundles',
    packs: ['pet-nailong', 'pet-starter', 'pet-moonlit', 'asset-cavern', 'asset-interface', 'asset-character', 'asset-icons'],
    name: { zh: '全套创作包', en: 'Complete Studio Bundle' },
    tagline: { zh: '市场上所有包，一次拿全', en: 'Every pack on the market in one purchase' },
    body: {
      zh: '把市场上现有的七个包一次带走：7 只宠物、46 组宠物动画、以及 700 多个资产图元。后续为这些包追加的更新都包含在内。',
      en: 'Everything on the market right now: seven pets, 46 pet animation loops, and more than 700 asset pieces. Every later update to these packs is included.',
    },
    price: 39,
    size: { zh: '7 个包 · 7 只宠物 · 700+ 图元', en: '7 packs · 7 pets · 700+ pieces' },
    formats: ['PNG', 'GIF', 'Sprite sheet', '.moonsprite', '.mspet'],
    includes: [
      { zh: '奶龙：78 帧手绘宠物包，含可安装的 .mspet', en: 'Nailong: the 78-frame hand-drawn pack with its .mspet' },
      { zh: '四个资产包的全部内容与后续瓦片追加', en: 'All four asset packs, including future tiles' },
      { zh: '工作室授权：可用于商业项目，不限作品数量', en: 'Studio license: commercial projects, no title limit' },
    ],
  },
]

/** Pets shipped by a pet pack. Real .mspet packs describe themselves instead. */
export function petsOf(product: PetPackProduct): PetId[] {
  return product.pack ? petPacks[product.pack].pets : []
}

/** Animation ids to offer as preview chips, real packs first. */
export function animationsOf(product: PetPackProduct): PetAnimationId[] | string[] {
  if (product.animations) return product.animations.order
  return product.pack ? petPacks[product.pack].animations : []
}

export function bundleItems(bundle: BundleProduct): MarketProduct[] {
  if (bundle.members) return bundle.members
  return (bundle.packs ?? [])
    .map((id) => MARKET_PRODUCTS.find((product) => product.id === id))
    .filter((product): product is MarketProduct => Boolean(product))
}

export function bundleValue(bundle: BundleProduct): number {
  return bundleItems(bundle).reduce((total, product) => total + product.price, 0)
}

export type SortKey = 'featured' | 'price-asc' | 'price-desc'

/**
 * List prices are authored in USD. Chinese prices are shown in CNY at this fixed
 * rate so the page stays consistent; re-check it before the store opens, and note
 * that Steam and regional pricing will be the real source of truth at checkout.
 */
export const USD_TO_CNY = 7.2

/** Rounded to whole yuan: a pixel pack price does not need sub-yuan precision. */
/**
 * The studio prices in CNY, the catalogue stores USD. This is the same fixed rate
 * formatPrice uses, so a price typed in the studio shows the same number in the market.
 */
export function cnyToUsd(cny: number): number {
  return Math.max(0, Math.round(cny / USD_TO_CNY))
}

/** The other direction, for opening a listing whose stored price is USD. */
export function usdToCny(usd: number): number {
  return Math.max(0, Math.round(usd * USD_TO_CNY))
}

/** Stored amounts remain USD; language selects display currency without changing records. */
export function priceIn(amount: number, language: Language = 'zh'): number {
  return Math.round(amount * (language === 'zh' ? USD_TO_CNY : 1) * 100) / 100
}

export function formatPrice(amount: number, language: Language): string {
  const value = priceIn(amount, language)
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2)
  return `${language === 'zh' ? '¥' : '$'}${text}`
}

