import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Button, Checkbox, IconButton } from '../ui'
import { ArrowLeft, Check, ChevronRight, Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react'
import { SITE_CONFIG } from '../config'
import type { Copy, Language } from '../content'
import { PetSpriteStrip, PixelPet } from '../market/PixelArt'
import { PET_ANIMATIONS, petPacks, type PetAnimationId, type PetId } from '../market/petSprites'
import {
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
import { marketPackHash, navigate } from '../router'
import { useAccount } from '../account/store'
import { Select } from '../ui/Select'
import { useCatalogue, useProduct } from '../market/catalogue'
import { AddButton, CategoryTag, PackGrid, PackImage, animationCount, isArtworkPack, isBundleProduct, isPetProduct } from '../market/PackCard'
import { useCart, useCartStore, type Cart } from '../market/cart'

/** The shelf leads with the one pack that has real artwork in it, then the asset packs. */
const SHELF_FEATURED = ['pet-nailong', 'asset-cavern', 'asset-character', 'asset-interface', 'asset-icons']

/*
 * Detail-page pieces. The card and its cart live in market/PackCard.tsx because the
 * homepage shows the same cards; these are only used here.
 */

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

function PriceRow({ product, t, language }: { product: MarketProduct; t: Copy; language: Language }) {
  if (product.category === 'bundles') {
    const full = bundleValue(product)
    return <div className="pack-price">
      <strong>{formatPrice(product.price)}</strong>
      <s>{formatPrice(full)}</s>
      <em>{t.marketPage.card.save} {formatPrice(full - product.price)}</em>
    </div>
  }
  return <div className="pack-price"><strong>{formatPrice(product.price)}</strong></div>
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

function CartDrawer({ open, cart, t, language, onClose }: {
  open: boolean
  cart: Cart
  t: Copy
  language: Language
  onClose: () => void
}) {
  const market = t.marketPage
  const { account, addOrder } = useAccount()
  const [step, setStep] = useState<'cart' | 'review'>('cart')
  const [agreed, setAgreed] = useState(false)
  const [agreeError, setAgreeError] = useState(false)
  const [paying, setPaying] = useState(false)

  /*
   * Two steps, because a purchase needs a confirmation: the cart asks to review, the
   * review states the licence and the no-refund policy, and only then does paying run.
   * Steam takes over entirely once its store URL exists.
   */
  const checkout = () => {
    if (!account) {
      onClose()
      navigate('#/account')
      return
    }
    setStep('review')
  }

  const pay = async () => {
    if (!agreed) {
      setAgreeError(true)
      return
    }
    setPaying(true)
    const lines = cart.lines.map(({ product, quantity }) => ({
      id: product.id,
      name: productCopy(product.name, language),
      price: product.price,
      quantity,
    }))
    const result = await addOrder(lines)
    setPaying(false)
    if (!result.ok) {
      setAgreeError(true)
      return
    }
    cart.clear()
    setStep('cart')
    setAgreed(false)
    onClose()
    // The receipt is the point: it carries the download the buyer just paid for.
    navigate('#/receipt')
  }

  useEffect(() => {
    if (!open) {
      setStep('cart')
      setAgreeError(false)
    }
  }, [open])

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
        <IconButton label={market.cart.close} onClick={onClose} icon={<X aria-hidden="true" />} />
      </header>

      {step === 'review'
        ? <div className="cart-review">
          <h3>{market.checkout.review}</h3>
          <ul className="cart-review-lines">
            {cart.lines.map(({ product, quantity }) => <li key={product.id}>
              <span>{productCopy(product.name, language)}<em>×{quantity}</em></span>
              <span>{formatPrice(product.price * quantity)}</span>
            </li>)}
          </ul>
          <dl className="cart-review-total">
            <div><dt>{market.checkout.subtotal}</dt><dd>{formatPrice(cart.subtotal)}</dd></div>
            <div className="grand"><dt>{market.checkout.total}</dt><dd>{formatPrice(cart.subtotal)}</dd></div>
          </dl>

          {/* The licence is stated and acknowledged here, not assumed. */}
          <div className="cart-agreement">
            <strong>{market.checkout.agreementTitle}</strong>
            <p>{market.checkout.agreement}</p>
            <a href="#/license" onClick={onClose}>{market.checkout.agreementLink}</a>
            <Checkbox checked={agreed} onChange={(next) => { setAgreed(next); setAgreeError(false) }} label={market.checkout.agreeLabel} />
          </div>

          <div className="cart-review-actions">
            <Button variant="primary" disabled={paying} onClick={pay}>
              {paying ? market.checkout.paying : market.checkout.pay}
            </Button>
            <Button onClick={() => setStep('cart')}>{market.checkout.back}</Button>
          </div>
          {agreeError && <p className="account-error" role="alert">{market.checkout.mustAgree}</p>}
        </div>
        : <>
          {cart.lines.length === 0
            ? <div className="cart-empty">
              <p>{market.cart.empty}</p>
              <Button size="compact" onClick={onClose}>{market.cart.continue}</Button>
            </div>
            : <ul className="cart-lines">
              {cart.lines.map(({ product, quantity }) => <li key={product.id}>
                <a className="cart-line-art" href={marketPackHash(product.id)} onClick={onClose}>
                  <PackImage product={product} t={t} alt="" />
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
                <span className="cart-line-price">{formatPrice(product.price * quantity)}</span>
              </li>)}
            </ul>}

          <footer className="cart-foot">
            <div className="cart-subtotal"><span>{market.cart.subtotal}</span><strong>{formatPrice(cart.subtotal)}</strong></div>
            <p className="cart-note">{market.cart.note}</p>
            {SITE_CONFIG.steamUrl
              ? <a className="button primary" href={SITE_CONFIG.steamUrl} target="_blank" rel="noopener noreferrer">{market.cart.checkout}</a>
              : <Button variant="primary" onClick={checkout} disabled={cart.lines.length === 0}>{account ? market.cart.checkout : market.cart.signInToBuy}</Button>}
            <span className="cart-status">
              {SITE_CONFIG.steamUrl || account ? market.cart.checkoutSoon : market.cart.checkoutAccount}
            </span>
            {cart.lines.length > 0 && <button type="button" className="cart-clear" onClick={cart.clear}>{market.cart.clear}</button>}
          </footer>
        </>}
    </aside>
  </div>
}

function MarketHero({ t, language }: { t: Copy; language: Language }) {
  const market = t.marketPage
  const { products: catalogue } = useCatalogue()
  const featured = SHELF_FEATURED
    .map((id) => catalogue.find((product) => product.id === id))
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
            {/* Zoom 2 rather than the card's 3: the tile is a thumbnail, and at 3 the
                sprite is taller than the cover's 16:10 box on narrow screens, which
                cropped the pet. */}
            <PackImage product={product} t={t} alt={productCopy(product.name, language)} zoom={2} />
          </span>
          <figcaption>
            {productCopy(product.name, language)}
            <span>{formatPrice(product.price)}</span>
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
  const { registerOpener } = useCartStore()

  // The header's cart button opens whichever page's drawer is mounted.
  useEffect(() => {
    registerOpener(() => setCartOpen(true))
    return () => registerOpener(null)
  }, [registerOpener])

  const { products: catalogue } = useCatalogue()

  const products = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matched = catalogue.filter((product) => {
      if (category !== 'all' && product.category !== category) return false
      if (!needle) return true
      const haystack = [
        productCopy(product.name, language),
        productCopy(product.tagline, language),
        productCopy(product.body, language),
        productCopy(product.size, language),
        ...product.formats,
        // Tags a seller chose in the studio are searchable here, which is what they are for.
        ...(product.tags ?? []),
      ].join(' ').toLowerCase()
      return haystack.includes(needle)
    })
    if (sort === 'price-asc') return [...matched].sort((a, b) => a.price - b.price)
    if (sort === 'price-desc') return [...matched].sort((a, b) => b.price - a.price)
    return matched
    // `catalogue` belongs here: a pack published in the studio arrives after the first
    // render, and without it the list kept showing the built-in packs only.
  }, [catalogue, category, query, sort, language])

  /*
   * The filter row is derived from what is actually on sale, so a category appears the
   * moment a pack in it is published and disappears when the last one is pulled. The
   * order is fixed so the chips do not jump around as packs come and go.
   */
  const categories = useMemo(() => {
    const order: (MarketCategory | 'all')[] = ['all', 'pets', 'assets', 'bundles', 'extensions', 'scripts']
    const present = new Set(catalogue.map((product) => product.category))
    return order.filter((item) => item === 'all' || present.has(item))
  }, [catalogue])

  const countIn = useCallback((item: MarketCategory | 'all') => item === 'all'
    ? catalogue.length
    : catalogue.filter((product) => product.category === item).length, [catalogue])

  // A filter that no longer has any packs would strand the view on an empty list.
  useEffect(() => {
    if (category !== 'all' && !catalogue.some((product) => product.category === category)) setCategory('all')
  }, [catalogue, category])

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
              onClick={() => setCategory(item)}>
              {item === 'all' ? market.categories.all : market.categories[item]}
              <span className="filter-count">{countIn(item)}</span>
            </button>)}
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
            <div className="sort-field">
              <span>{market.sort}</span>
              <Select
                value={sort}
                label={market.sort}
                align="end"
                onChange={setSort}
                options={[
                  { value: 'featured', label: market.sortOptions.featured },
                  { value: 'price-asc', label: market.sortOptions.priceAsc },
                  { value: 'price-desc', label: market.sortOptions.priceDesc },
                ] satisfies { value: SortKey; label: string }[]} />
            </div>
            <span className="cart-slot">
              <Button variant="primary" size="compact" icon={<ShoppingCart aria-hidden="true" />} onClick={() => setCartOpen(true)} ariaLabel={market.cart.open}>
                {market.cart.title}
              </Button>
              {cart.count > 0 && <span className="cart-badge">{cart.count}</span>}
            </span>
          </div>
        </div>

        <p className="market-count">{market.count(products.length, catalogue.length)}</p>
        {products.length === 0
          ? <div className="market-empty">
            <h3>{market.empty.title}</h3>
            <p>{market.empty.body}</p>
            <Button size="compact" onClick={resetFilters}>{market.empty.action}</Button>
          </div>
          : <PackGrid products={products} t={t} language={language} />}
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
  const { registerOpener } = useCartStore()

  useEffect(() => {
    registerOpener(() => setCartOpen(true))
    return () => registerOpener(null)
  }, [registerOpener])

  const { product, siblings, loading } = useProduct(productId)
  const related = product ? siblings.filter((item) => item.id !== product.id).slice(0, 3) : []

  if (!product) return <main id="main" className="market">
    <MarketHero t={t} language={language} />
    <section className="market-browse">
      <div className="content-wrap market-missing">
        <h1>{market.detail.notFound}</h1>
        <Button href="#/market"><ArrowLeft aria-hidden="true" />{market.detail.back}</Button>
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
              <PackImage product={product} t={t} alt={productCopy(product.name, language)} zoom={6} />
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
              <span className="cart-slot">
                <Button size="compact" icon={<ShoppingCart aria-hidden="true" />} onClick={() => setCartOpen(true)}>
                  {market.cart.title}
                </Button>
                {cart.count > 0 && <span className="cart-badge">{cart.count}</span>}
              </span>
            </div>
            {product.download
              ? <a className="pack-download" href={product.download} download>{product.formats[0]} · {productCopy(product.name, language)}</a>
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
                      <PackImage product={item} t={t} alt="" />
                    </span>
                    <span className="bundle-item-copy">
                      <strong>{productCopy(item.name, language)}</strong>
                      <span>{productCopy(item.tagline, language)}</span>
                    </span>
                    <span className="bundle-item-price">{formatPrice(item.price)}</span>
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
        <PackGrid products={related} t={t} language={language} />
      </div>
    </section>

    <MarketNotes t={t} />

    <CartDrawer open={cartOpen} cart={cart} t={t} language={language} onClose={() => setCartOpen(false)} />
  </main>
}
