import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ArrowLeft, Check, ChevronRight, Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react'
import { SITE_CONFIG } from '../config'
import type { Copy, Language } from '../content'
import { PetSpriteStrip, PixelPet } from '../market/PixelArt'
import { PET_ANIMATIONS, petPacks, type PetAnimationId, type PetId } from '../market/petSprites'
import {
  MARKET_PRODUCTS,
  bundleItems,
  bundleValue,
  formatPrice,
  petsOf,
  productCopy,
  type BundleProduct,
  type MarketCategory,
  type MarketProduct,
  type PetPackProduct,
  type SortKey,
} from '../market/catalog'
import { marketPackHash } from '../router'

/** The shelf features the packs below, strongest sellers first. */
const SHELF_FEATURED = ['asset-cavern', 'asset-character', 'asset-interface', 'asset-icons', 'pet-moonlit', 'pet-starter']

type CartLine = { id: string; quantity: number }

const CART_KEY = 'moonsprite-market-cart'

function readCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(CART_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((line): line is CartLine => {
      if (typeof line !== 'object' || line === null) return false
      const candidate = line as Partial<CartLine>
      return typeof candidate.id === 'string' && typeof candidate.quantity === 'number' && candidate.quantity > 0
    })
  } catch (error) {
    console.warn('MoonSprite market: could not read the saved cart, starting empty.', error)
    return []
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Cart state is shared by the market grid and every detail page. */
function useCart() {
  const [cart, setCart] = useState<CartLine[]>(readCart)
  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart))
    } catch (error) {
      console.warn('MoonSprite market: cart could not be saved for this session.', error)
    }
  }, [cart])
  const lines = cart
    .map((line) => ({ product: MARKET_PRODUCTS.find((product) => product.id === line.id), quantity: line.quantity }))
    .filter((line): line is { product: MarketProduct; quantity: number } => Boolean(line.product))
  return {
    lines,
    count: lines.reduce((total, line) => total + line.quantity, 0),
    subtotal: lines.reduce((total, line) => total + line.product.price * line.quantity, 0),
    has: (id: string) => cart.some((line) => line.id === id),
    add: (id: string) => setCart((current) => current.some((line) => line.id === id) ? current : [...current, { id, quantity: 1 }]),
    setQuantity: (id: string, quantity: number) => setCart((current) => quantity < 1
      ? current.filter((line) => line.id !== id)
      : current.map((line) => line.id === id ? { ...line, quantity } : line)),
    remove: (id: string) => setCart((current) => current.filter((line) => line.id !== id)),
    clear: () => setCart([]),
  }
}

type Cart = ReturnType<typeof useCart>

/*
 * TypeScript loses the discriminant when narrowing through a union member's own
 * members, so these guards keep the narrowing explicit.
 */
function isPetProduct(product: MarketProduct): product is PetPackProduct {
  return product.category === 'pets'
}

function isBundleProduct(product: MarketProduct): product is BundleProduct {
  return product.category === 'bundles'
}

/** Animation ids for a code-drawn pet pack; real .mspet packs describe their own. */
function petAnimationsOf(product: MarketProduct): PetAnimationId[] {
  return isPetProduct(product) && petsOf(product).length > 0
    ? (Object.keys(PET_ANIMATIONS) as PetAnimationId[])
    : []
}

/** Every code-drawn pet a pack ships, including those inside a bundle. */
function packPets(product: MarketProduct): PetId[] {
  if (isPetProduct(product)) return petsOf(product)
  if (isBundleProduct(product)) return bundleItems(product).flatMap((item) => isPetProduct(item) ? petsOf(item) : [])
  return []
}

/** Animation loops a pack advertises, counted from the pack's own data. */
function animationCount(product: MarketProduct): number {
  if (!isPetProduct(product)) return 0
  if (product.animations) return product.animations.order.length
  return product.pack ? petsOf(product).length * petPacks[product.pack].animations.length : 0
}

function CategoryTag({ product, t }: { product: MarketProduct; t: Copy }) {
  const labels: Record<MarketCategory, string> = {
    pets: t.marketPage.categories.pets,
    assets: t.marketPage.categories.assets,
    bundles: t.marketPage.categories.bundles,
  }
  if (product.category === 'bundles') {
    return <span className="pack-tag bundle">{labels.bundles} · {t.marketPage.card.bundleOf(bundleItems(product).length)}</span>
  }
  return <span className={`pack-tag ${product.category}`}>{labels[product.category]}</span>
}

function PriceRow({ product, t, language }: { product: MarketProduct; t: Copy; language: Language }) {
  if (product.category === 'bundles') {
    const full = bundleValue(product)
    return <div className="pack-price">
      <strong>{formatPrice(product.price, language)}</strong>
      <s>{formatPrice(full, language)}</s>
      <em>{t.marketPage.card.save} {formatPrice(full - product.price, language)}</em>
    </div>
  }
  return <div className="pack-price"><strong>{formatPrice(product.price, language)}</strong></div>
}

/** Real .mspet packs preview with their own artwork, framed as pixel art. */
function isArtworkPack(product: MarketProduct): boolean {
  return isPetProduct(product) && Boolean(product.animations)
}

/**
 * The pack's preview image. A real .mspet pack previews with its own idle loop, so
 * the thumbnail is the pet alive rather than a still; every other pack shows its
 * product shot, which fills the fixed 16:10 frame so the grid stays aligned.
 */
function PackImage({ product, alt, zoom = 2, className }: {
  product: MarketProduct
  alt: string
  zoom?: number
  className?: string
}) {
  if (isPetProduct(product) && product.animations) {
    return <PetSpriteStrip sheet={product.animations.idle} zoom={zoom} className={className} />
  }
  return <img
    className={className ? `pack-image ${className}` : 'pack-image'}
    src={product.image}
    alt={alt}
    loading="lazy"
    decoding="async" />
}
function PetStrip({ pets, animation, px = 5 }: { pets: PetId[]; animation: PetAnimationId; px?: number }) {
  return <div className="pet-strip" style={{ '--strip-cols': pets.length } as CSSProperties}>
    {pets.map((pet, index) => <span className="pet-cell" key={pet}>
      <PixelPet pet={pet} animation={animation} px={px} delay={Math.round(index * -PET_ANIMATIONS[animation].duration / pets.length)} />
    </span>)}
  </div>
}

/**
 * Pet artwork for a pack. A real .mspet pack plays its own frames — the same
 * artwork the app plays — while code-drawn pets fall back to PixelPet.
 */
function PetArtwork({ product, sheetId, className }: {
  product: PetPackProduct
  sheetId?: string
  className?: string
}) {
  if (product.animations) {
    const id = sheetId && product.animations.sheets[sheetId] ? sheetId : 'IDLE'
    return <PetSpriteStrip sheet={product.animations.sheets[id]} className={className} />
  }
  const pets = petsOf(product)
  if (pets.length !== 1) return null
  return <PixelPet pet={pets[0]} animation="idle" px={5} className={className} />
}

/**
 * Animation preview for a real .mspet pack: one card per animation, each playing the
 * animation it names. Frame counts and lengths come from the package itself.
 */
function PackAnimationCards({ product, t, language }: { product: PetPackProduct; t: Copy; language: Language }) {
  const market = t.marketPage
  const animations = product.animations
  if (!animations) return null
  const { order, sheets, labels } = animations

  return <section className="detail-block">
    <h2>{market.detail.preview}</h2>
    <div className="animation-cards">
      {order.map((id) => {
        const sheet = sheets[id]
        return <article className="animation-card" key={id}>
          <span className="animation-stage">
            <PetSpriteStrip sheet={sheet} />
          </span>
          <div className="animation-card-body">
            <h3>{labels[id] ? productCopy(labels[id], language) : id}<span>{market.detail.frames(sheet.frames)}</span></h3>
            <p>{(sheet.duration / 1000).toFixed(2)}s · {sheet.frameWidth}×{sheet.frameHeight}</p>
          </div>
        </article>
      })}
    </div>
  </section>
}

/** Animation preview for a code-drawn pack: one card per pet, one chip per loop. */
function AnimationPreview({ product, t, language }: { product: MarketProduct; t: Copy; language: Language }) {
  const market = t.marketPage
  const [preview, setPreview] = useState<{ pet: PetId; animation: PetAnimationId } | null>(null)
  if (!isPetProduct(product)) return null
  if (product.animations) return <PackAnimationCards product={product} t={t} language={language} />

  const petIds = packPets(product)
  if (petIds.length === 0) return null
  const animations = petAnimationsOf(product)

  return <section className="detail-block">
    <h2>{market.detail.preview}</h2>
    <div className="detail-pets">
      {petIds.map((pet) => {
        const active = preview?.pet === pet ? preview.animation : 'idle'
        return <div className="detail-pet" key={pet}>
          <span className="detail-pet-name">{market.pets[pet]}</span>
          <PixelPet pet={pet} animation={active} px={5} />
          <div className="detail-animations">
            {animations.map((animation) => <button
              key={animation}
              type="button"
              className={active === animation ? 'chip active' : 'chip'}
              onClick={() => setPreview({ pet, animation })}>{market.animations[animation]}</button>)}
          </div>
        </div>
      })}
    </div>
  </section>
}

function SpecList({ product, t, language }: { product: MarketProduct; t: Copy; language: Language }) {
  const market = t.marketPage
  return <dl className="detail-meta">
    <div><dt>{market.detail.size}</dt><dd>{productCopy(product.size, language)}</dd></div>
    <div><dt>{market.detail.formats}</dt><dd>{product.formats.join(' · ')}</dd></div>
    <div><dt>{market.detail.license}</dt><dd>{market.detail.licenseBody}</dd></div>
  </dl>
}

function IncludesList({ product, t, language }: { product: MarketProduct; t: Copy; language: Language }) {
  return <ul className="detail-list">
    {product.includes.map((item) => <li key={item.en}><Check aria-hidden="true" />{productCopy(item, language)}</li>)}
  </ul>
}

function AddButton({ product, t, inCart, onAdd, block = false }: {
  product: MarketProduct
  t: Copy
  inCart: boolean
  onAdd: (id: string) => void
  block?: boolean
}) {
  const market = t.marketPage
  return <button
    type="button"
    className={`button primary compact add-button${block ? ' block' : ''}`}
    onClick={(event) => { event.preventDefault(); event.stopPropagation(); onAdd(product.id) }}>
    {inCart ? <Check aria-hidden="true" /> : <ShoppingCart aria-hidden="true" />}
    {inCart ? market.card.owned : market.card.add}
  </button>
}

function PackCard({ product, t, language, cart, animation }: {
  product: MarketProduct
  t: Copy
  language: Language
  cart: Cart
  animation: PetAnimationId
}) {
  const market = t.marketPage
  const loops = animationCount(product)

  return <article className="pack-card">
    <a className="pack-card-link" href={marketPackHash(product.id)} aria-label={`${productCopy(product.name, language)} - ${market.card.details}`}>
      <div className={isArtworkPack(product) ? 'pack-art-frame artwork' : 'pack-art-frame'}>
        <PackImage product={product} alt={productCopy(product.name, language)} zoom={2} />
        <CategoryTag product={product} t={t} />
      </div>

      <div className="pack-body">
        <header className="pack-head">
          <h3>{productCopy(product.name, language)}</h3>
          <p className="pack-tagline">{productCopy(product.tagline, language)}</p>
        </header>
        <p className="pack-copy">{productCopy(product.body, language)}</p>
        <ul className="pack-chips">
          <li>{productCopy(product.size, language)}</li>
          {loops > 0 && <li>{market.card.loops(loops)}</li>}
          <li>{product.formats[0]}</li>
        </ul>
      </div>
    </a>

    <footer className="pack-foot">
      <PriceRow product={product} t={t} language={language} />
      <div className="pack-actions">
        <a className="pack-more" href={marketPackHash(product.id)}>{market.card.details}<ChevronRight aria-hidden="true" /></a>
        <AddButton product={product} t={t} inCart={cart.has(product.id)} onAdd={cart.add} />
      </div>
    </footer>
  </article>
}

function CartDrawer({ open, cart, t, language, onClose }: {
  open: boolean
  cart: Cart
  t: Copy
  language: Language
  onClose: () => void
}) {
  const market = t.marketPage

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return <div className="cart-layer">
    <div className="cart-backdrop" onClick={onClose} aria-hidden="true" />
    <aside className="cart-drawer" role="dialog" aria-modal="true" aria-label={market.cart.title}>
      <header className="cart-head">
        <h2>{market.cart.title}<span>{cart.count}</span></h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label={market.cart.close}><X aria-hidden="true" /></button>
      </header>

      {cart.lines.length === 0
        ? <div className="cart-empty">
          <p>{market.cart.empty}</p>
          <button type="button" className="button secondary compact" onClick={onClose}>{market.cart.continue}</button>
        </div>
        : <ul className="cart-lines">
          {cart.lines.map(({ product, quantity }) => <li key={product.id}>
            <a className="cart-line-art" href={marketPackHash(product.id)} onClick={onClose}>
              <img src={product.image} alt="" loading="lazy" decoding="async" />
              {product.category === 'bundles' && <span className="cart-line-count">×{bundleItems(product).length}</span>}
            </a>
            <div className="cart-line-body">
              <a href={marketPackHash(product.id)} onClick={onClose}>{productCopy(product.name, language)}</a>
              <span>{productCopy(product.size, language)}</span>
              <div className="cart-line-controls">
                <button type="button" onClick={() => cart.setQuantity(product.id, quantity - 1)} aria-label={market.cart.decrease}><Minus aria-hidden="true" /></button>
                <span>{quantity}</span>
                <button type="button" onClick={() => cart.setQuantity(product.id, quantity + 1)} aria-label={market.cart.increase}><Plus aria-hidden="true" /></button>
                <button type="button" className="cart-remove" onClick={() => cart.remove(product.id)} aria-label={`${market.cart.remove} ${productCopy(product.name, language)}`}><Trash2 aria-hidden="true" /></button>
              </div>
            </div>
            <span className="cart-line-price">{formatPrice(product.price * quantity, language)}</span>
          </li>)}
        </ul>}

      <footer className="cart-foot">
        <div className="cart-subtotal"><span>{market.cart.subtotal}</span><strong>{formatPrice(cart.subtotal, language)}</strong></div>
        <p className="cart-note">{market.cart.note}</p>
        {SITE_CONFIG.steamUrl
          ? <a className="button primary" href={SITE_CONFIG.steamUrl} target="_blank" rel="noopener noreferrer">{market.cart.checkout}</a>
          : <button type="button" className="button primary" disabled>{market.cart.checkout}</button>}
        <span className="cart-status">{market.cart.checkoutSoon}</span>
        {cart.lines.length > 0 && <button type="button" className="cart-clear" onClick={cart.clear}>{market.cart.clear}</button>}
      </footer>
    </aside>
  </div>
}

function MarketHero({ t, language }: { t: Copy; language: Language }) {
  const market = t.marketPage
  const featured = SHELF_FEATURED
    .map((id) => MARKET_PRODUCTS.find((product) => product.id === id))
    .filter((product): product is MarketProduct => Boolean(product))

  return <section className="market-shelf">
    <div className="content-wrap">
      <div className="shelf-head">
        <span>{market.shelfEyebrow}</span>
        <h1>{market.shelfTitle}</h1>
        <p>{market.shelfBody}</p>
      </div>
      <div className="shelf-stage">
        {featured.map((product) => <a className="shelf-item" href={marketPackHash(product.id)} key={product.id}>
          <span className="shelf-cover">
            <img src={product.image} alt={productCopy(product.name, language)} loading="lazy" decoding="async" />
          </span>
          <figcaption>
            {productCopy(product.name, language)}
            <span>{formatPrice(product.price, language)}</span>
          </figcaption>
        </a>)}
      </div>
    </div>
  </section>
}

function MarketNotes({ t }: { t: Copy }) {
  const market = t.marketPage
  return <section className="market-notes">
    <div className="content-wrap notes-grid">
      <div className="notes-block">
        <h3>{market.trust.title}</h3>
        <ul>
          <li><Check aria-hidden="true" />{market.trust.license}</li>
          <li><Check aria-hidden="true" />{market.trust.updates}</li>
          <li><Check aria-hidden="true" />{market.trust.refunds}</li>
        </ul>
      </div>
      <div className="notes-block">
        <h3>{market.support.title}</h3>
        <p>{market.support.body}</p>
        <a className="notes-link" href={SITE_CONFIG.footerLinks.discussions} target="_blank" rel="noopener noreferrer">{market.support.link}</a>
      </div>
    </div>
  </section>
}

export function MarketPage({ t, language }: { t: Copy; language: Language }) {
  const market = t.marketPage
  const [category, setCategory] = useState<MarketCategory | 'all'>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('featured')
  const [cartOpen, setCartOpen] = useState(false)
  const cart = useCart()

  const products = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matched = MARKET_PRODUCTS.filter((product) => {
      if (category !== 'all' && product.category !== category) return false
      if (!needle) return true
      const haystack = [
        productCopy(product.name, language),
        productCopy(product.tagline, language),
        productCopy(product.body, language),
        productCopy(product.size, language),
        ...product.formats,
      ].join(' ').toLowerCase()
      return haystack.includes(needle)
    })
    if (sort === 'price-asc') return [...matched].sort((a, b) => a.price - b.price)
    if (sort === 'price-desc') return [...matched].sort((a, b) => b.price - a.price)
    return matched
  }, [category, query, sort, language])

  const categories: (MarketCategory | 'all')[] = ['all', 'pets', 'assets', 'bundles']
  const resetFilters = () => { setCategory('all'); setQuery(''); setSort('featured') }

  return <main id="main" className="market">
    <MarketHero t={t} language={language} />

    <section className="market-browse">
      <div className="content-wrap">
        <header className="page-head market-head">
          <h2>{market.title}</h2>
          <p>{market.subtitle}</p>
        </header>

        <div className="market-toolbar">
          <div className="market-filters" role="group" aria-label={market.title}>
            {categories.map((item) => <button
              key={item}
              type="button"
              className={category === item ? 'filter-chip active' : 'filter-chip'}
              aria-pressed={category === item}
              onClick={() => setCategory(item)}>{item === 'all' ? market.categories.all : market.categories[item]}</button>)}
          </div>
          <div className="market-tools">
            <label className="search-field">
              <input
                type="search"
                value={query}
                placeholder={market.search}
                aria-label={market.search}
                title={market.searchHint}
                onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label className="sort-field">
              <span>{market.sort}</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
                <option value="featured">{market.sortOptions.featured}</option>
                <option value="price-asc">{market.sortOptions.priceAsc}</option>
                <option value="price-desc">{market.sortOptions.priceDesc}</option>
              </select>
            </label>
            <button type="button" className="button primary compact cart-button" onClick={() => setCartOpen(true)} aria-label={market.cart.open}>
              <ShoppingCart aria-hidden="true" />
              {market.cart.title}
              {cart.count > 0 && <span className="cart-badge">{cart.count}</span>}
            </button>
          </div>
        </div>

        <p className="market-count">{market.count(products.length, MARKET_PRODUCTS.length)}</p>

        {products.length === 0
          ? <div className="market-empty">
            <h3>{market.empty.title}</h3>
            <p>{market.empty.body}</p>
            <button type="button" className="button secondary compact" onClick={resetFilters}>{market.empty.action}</button>
          </div>
          : <div className="pack-grid">
            {products.map((product) => <PackCard
              key={product.id}
              product={product}
              t={t}
              language={language}
              cart={cart}
              animation="idle" />)}
          </div>}
      </div>
    </section>

    <MarketNotes t={t} />

    <CartDrawer open={cartOpen} cart={cart} t={t} language={language} onClose={() => setCartOpen(false)} />
  </main>
}

export function PackDetailPage({ t, language, productId }: { t: Copy; language: Language; productId?: string }) {
  const market = t.marketPage
  const [cartOpen, setCartOpen] = useState(false)
  const cart = useCart()
  const product = productId ? MARKET_PRODUCTS.find((item) => item.id === productId) : undefined
  const related = product ? MARKET_PRODUCTS.filter((item) => item.id !== product.id).slice(0, 3) : []

  if (!product) return <main id="main" className="market">
    <MarketHero t={t} language={language} />
    <section className="market-browse">
      <div className="content-wrap market-missing">
        <h1>{market.detail.notFound}</h1>
        <a className="button secondary" href="#/market"><ArrowLeft aria-hidden="true" />{market.detail.back}</a>
      </div>
    </section>
    <MarketNotes t={t} />
  </main>

  const loops = animationCount(product)

  return <main id="main" className="market market-detail-page">
    <section className="pack-hero">
      <div className="content-wrap">
        <nav className="pack-crumbs" aria-label={market.title}>
          <a href="#/market"><ArrowLeft aria-hidden="true" />{market.detail.back}</a>
          <span>{market.detail.eyebrow}</span>
        </nav>

        <div className="pack-hero-grid">
          <div className="pack-hero-media">
            <figure className={isArtworkPack(product) ? 'pack-hero-figure artwork' : 'pack-hero-figure'}>
              <PackImage product={product} alt={productCopy(product.name, language)} zoom={6} />
              <figcaption><CategoryTag product={product} t={t} /></figcaption>
            </figure>
          </div>

          <div className="pack-hero-copy">
            <h1>{productCopy(product.name, language)}</h1>
            <p className="pack-hero-tagline">{productCopy(product.tagline, language)}</p>
            <p className="pack-hero-body">{productCopy(product.body, language)}</p>

            <ul className="pack-chips">
              <li>{productCopy(product.size, language)}</li>
              {loops > 0 && <li>{market.card.loops(loops)}</li>}
              {product.formats.map((format) => <li key={format}>{format}</li>)}
            </ul>

            <PriceRow product={product} t={t} language={language} />
            <div className="pack-hero-actions">
              <AddButton product={product} t={t} inCart={cart.has(product.id)} onAdd={cart.add} block />
              <button type="button" className="button secondary compact cart-button" onClick={() => setCartOpen(true)}>
                <ShoppingCart aria-hidden="true" />
                {market.cart.title}
                {cart.count > 0 && <span className="cart-badge">{cart.count}</span>}
              </button>
            </div>
            {isPetProduct(product) && product.animations
              ? <a className="pack-download" href={product.animations.download} download>{product.formats[0]} · {productCopy(product.name, language)}</a>
              : null}
            <p className="pack-hero-note">{market.detail.buy}</p>
          </div>
        </div>
      </div>
    </section>

    <section className="detail-main">
      <div className="content-wrap detail-columns">
        <div className="detail-primary">
          <AnimationPreview product={product} t={t} language={language} />

          {product.category === 'bundles'
            ? <section className="detail-block">
              <h2>{market.detail.bundleContents}</h2>
              <ul className="bundle-list">
                {bundleItems(product).map((item) => <li key={item.id}>
                  <a className="bundle-item" href={marketPackHash(item.id)}>
                    <span className="bundle-item-art">
                      <img src={item.image} alt="" loading="lazy" decoding="async" />
                    </span>
                    <span className="bundle-item-copy">
                      <strong>{productCopy(item.name, language)}</strong>
                      <span>{productCopy(item.tagline, language)}</span>
                    </span>
                    <span className="bundle-item-price">{formatPrice(item.price, language)}</span>
                    <ChevronRight aria-hidden="true" />
                  </a>
                </li>)}
              </ul>
            </section>
            : <section className="detail-block">
              <h2>{market.detail.includes}</h2>
              <IncludesList product={product} t={t} language={language} />
            </section>}
        </div>

        <aside className="detail-side">
          <section className="detail-block">
            <h2>{market.detail.specs}</h2>
            <SpecList product={product} t={t} language={language} />
          </section>
          <section className="detail-block">
            <h2>{market.trust.title}</h2>
            <ul className="detail-list">
              <li><Check aria-hidden="true" />{market.trust.license}</li>
              <li><Check aria-hidden="true" />{market.trust.updates}</li>
              <li><Check aria-hidden="true" />{market.trust.refunds}</li>
            </ul>
          </section>
        </aside>
      </div>
    </section>

    <section className="market-browse related">
      <div className="content-wrap">
        <header className="page-head market-head"><h2>{market.detail.related}</h2></header>
        <div className="pack-grid">
          {related.map((item) => <PackCard
            key={item.id}
            product={item}
            t={t}
            language={language}
            cart={cart}
            animation="idle" />)}
        </div>
      </div>
    </section>

    <MarketNotes t={t} />

    <CartDrawer open={cartOpen} cart={cart} t={t} language={language} onClose={() => setCartOpen(false)} />
  </main>
}
