import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ControlRow, FormField, Alert, Button, Checkbox, Chip, Field, IconButton, Input, Panel } from '../ui'
import { PixelArrowLeft as ArrowLeft, PixelCart as CartIcon, PixelCheck as Check, PixelChevronRight as ChevronRight, PixelMinus as Minus, PixelPlus as Plus, PixelHot as HotIcon, PixelTrash2 as Trash2, PixelX as X } from '../ui/icons'
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
import { useData, type ReportReason } from '../data/store'
import { Select } from '../ui/Select'
import { useCatalogue, useProduct } from '../market/catalogue'
import { AddButton, CategoryTag, PackGrid, PackImage, PopularPackCard, animationCount, isArtworkPack, isBundleProduct, isPetProduct } from '../market/PackCard'
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
      <strong>{formatPrice(product.price, language)}</strong>
      {full > product.price && <><s>{formatPrice(full, language)}</s>
      <em>{t.marketPage.card.save} {formatPrice(full - product.price, language)}</em></>}
    </div>
  }
  return <div className="pack-price"><strong>{formatPrice(product.price, language)}</strong></div>
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
            {animations.map((animation) => <Chip
              key={animation}
              active={active === animation}
              onClick={() => setPreview({ pet, animation })}>{market.animations[animation]}</Chip>)}
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

  const [paymentError, setPaymentError] = useState(false)
  const pay = async () => {
    if (paying) return
    setPaymentError(false)
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
      setPaymentError(true)
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
              <span>{formatPrice(product.price * quantity, language)}</span>
            </li>)}
          </ul>
          <dl className="cart-review-total">
            <div><dt>{market.checkout.subtotal}</dt><dd>{formatPrice(cart.subtotal, language)}</dd></div>
            <div className="grand"><dt>{market.checkout.total}</dt><dd>{formatPrice(cart.subtotal, language)}</dd></div>
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
          {paymentError && <Alert tone="danger" role="alert">{language === 'zh' ? '订单未完成。请检查登录状态，刷新商品价格与上架状态后重试。' : 'Order failed. Check your session and refresh product prices and availability before retrying.'}</Alert>}
          {agreeError && <Alert tone="danger" role="alert">{market.checkout.mustAgree}</Alert>}
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
                    <IconButton onClick={() => cart.setQuantity(product.id, quantity - 1)} label={market.cart.decrease} icon={<Minus aria-hidden="true" />} />
                    <span>{quantity}</span>
                    <IconButton onClick={() => cart.setQuantity(product.id, quantity + 1)} label={market.cart.increase} icon={<Plus aria-hidden="true" />} />
                    <IconButton className="cart-remove" onClick={() => cart.remove(product.id)} label={`${market.cart.remove} ${productCopy(product.name, language)}`} icon={<Trash2 aria-hidden="true" />} />
                  </div>
                </div>
                <span className="cart-line-price">{formatPrice(product.price * quantity, language)}</span>
              </li>)}
            </ul>}

          <footer className="cart-foot">
            <div className="cart-subtotal"><span>{market.cart.subtotal}</span><strong>{formatPrice(cart.subtotal, language)}</strong></div>
            <p className="cart-note">{market.cart.note}</p>
            {SITE_CONFIG.steamUrl
              ? <Button variant="primary" href={SITE_CONFIG.steamUrl} target="_blank">{market.cart.checkout}</Button>
              : <Button variant="primary" onClick={checkout} disabled={cart.lines.length === 0}>{account ? market.cart.checkout : market.cart.signInToBuy}</Button>}
            <span className="cart-status">
              {SITE_CONFIG.steamUrl || account ? market.cart.checkoutSoon : market.cart.checkoutAccount}
            </span>
            {cart.lines.length > 0 && <Button size="compact" onClick={cart.clear}>{market.cart.clear}</Button>}
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
        <h1><HotIcon aria-hidden="true" />{market.shelfTitle}</h1>
        <p>{market.shelfBody}</p>
      </div>
      <div className="shelf-stage">
        {featured.map((product) => <PopularPackCard product={product} t={t} language={language} key={product.id} />)}
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
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [formatFilter, setFormatFilter] = useState('all')
  const [freeOnly, setFreeOnly] = useState(false)
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
      const min = Number(minPrice)
      const max = Number(maxPrice)
      if (minPrice && Number.isFinite(min) && product.price < min) return false
      if (maxPrice && Number.isFinite(max) && product.price > max) return false
      if (formatFilter !== 'all' && !product.formats.includes(formatFilter)) return false
      if (freeOnly && product.price !== 0) return false
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
  }, [catalogue, category, query, sort, language, minPrice, maxPrice, formatFilter, freeOnly])

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

  const formats = useMemo(() => [...new Set(catalogue.flatMap((product) => product.formats))].sort(), [catalogue])
  const activeFilterCount = [Boolean(minPrice), Boolean(maxPrice), formatFilter !== 'all', freeOnly, sort !== 'featured'].filter(Boolean).length
  const resetFilters = () => { setCategory('all'); setQuery(''); setSort('featured'); setMinPrice(''); setMaxPrice(''); setFormatFilter('all'); setFreeOnly(false) }

  return <main id="main" className="market">
    <MarketHero t={t} language={language} />

    <section className="market-browse">
      <div className="content-wrap">
        <header className="page-head market-head">
          <h2>{market.title}</h2>
        </header>

        <ControlRow className="market-toolbar">
          <div className="market-filters" role="group" aria-label={market.title}>
            {categories.map((item) => <Chip key={item} active={category === item} onClick={() => setCategory(item)}>{item === 'all' ? market.categories.all : market.categories[item]}<span className="filter-count">{countIn(item)}</span></Chip>)}
          </div>
          <div className="market-tools">
            <label className="search-field">
              <Input
                type="search"
                value={query}
                placeholder={market.search}
                aria-label={market.search}
                title={market.searchHint}
                onChange={(event) => setQuery(event.target.value)} />
            </label>
            <div className="market-filter-dropdown">
              <Button className="market-filter-trigger" onClick={() => setFiltersOpen((open) => !open)} ariaLabel={language === 'zh' ? '打开详细筛选' : 'Open detailed filters'}>{language === 'zh' ? '筛选' : 'Filters'}{activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}</Button>
              {filtersOpen && <section className="market-filter-dialog" role="dialog" aria-label={language === 'zh' ? '详细筛选' : 'Detailed filters'}>
                <header><div><h3>{language === 'zh' ? '详细筛选' : 'Detailed filters'}</h3></div></header>
                <div className="filter-dialog-grid">
                  <Field label={language === 'zh' ? '排序' : 'Sort by'}><Select value={sort} label={market.sort} onChange={setSort} options={[{ value: 'featured', label: market.sortOptions.featured }, { value: 'price-asc', label: market.sortOptions.priceAsc }, { value: 'price-desc', label: market.sortOptions.priceDesc }]} /></Field>
                  <Field label={language === 'zh' ? '文件格式' : 'Format'}><Select value={formatFilter} label={language === 'zh' ? '文件格式' : 'Format'} onChange={setFormatFilter} options={[{ value: 'all', label: language === 'zh' ? '全部格式' : 'All formats' }, ...formats.map((format) => ({ value: format, label: format }))]} /></Field>
                  <Field label={language === 'zh' ? '最低价格' : 'Minimum price'}><Input type="number" min="0" step="0.01" inputMode="decimal" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder={language === 'zh' ? '不限' : 'No minimum'} /></Field>
                  <Field label={language === 'zh' ? '最高价格' : 'Maximum price'}><Input type="number" min="0" step="0.01" inputMode="decimal" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder={language === 'zh' ? '不限' : 'No maximum'} /></Field>
                  <Checkbox className="filter-free-option" checked={freeOnly} onChange={setFreeOnly} label={language === 'zh' ? '仅显示免费内容' : 'Show free content only'} />
                </div>
                <footer><Button size="compact" onClick={resetFilters}>{language === 'zh' ? '清除全部' : 'Clear all'}</Button><span>{market.count(products.length, catalogue.length)}</span><Button size="compact" variant="primary" onClick={() => setFiltersOpen(false)}>{language === 'zh' ? '确定' : 'Apply'}</Button></footer>
              </section>}
            </div>
            <span className="cart-slot">
              <Button className={cart.count > 0 ? 'market-cart-button has-items' : 'market-cart-button'} icon={<CartIcon aria-hidden="true" />} onClick={() => setCartOpen(true)} ariaLabel={market.cart.open}>
                {market.cart.title}
              </Button>
              {cart.count > 0 && <span className="cart-badge">{cart.count}</span>}
            </span>
          </div>
        </ControlRow>

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

export function PackDetailPage({ t, language, productId, previewProduct }: { t: Copy; language: Language; productId?: string; previewProduct?: MarketProduct }) {
  const market = t.marketPage
  const [previewSurface, setPreviewSurface] = useState<'plain' | 'grid'>('plain')
  const [previewZoom, setPreviewZoom] = useState(4)
  const [previewImage, setPreviewImage] = useState(0)
  const [cartOpen, setCartOpen] = useState(false)
  const cart = useCart()
  const { owns, account } = useAccount()
  const { fileReport } = useData()
  const [reportReason, setReportReason] = useState<ReportReason | ''>('')
  const [reportDetail, setReportDetail] = useState('')
  const [reportState, setReportState] = useState<'idle' | 'error' | 'sent'>('idle')
  useEffect(() => {
    setReportReason(''); setReportDetail(''); setReportState('idle')
  }, [productId])
  const { registerOpener } = useCartStore()

  useEffect(() => {
    if (previewProduct) return
    registerOpener(() => setCartOpen(true))
    return () => registerOpener(null)
  }, [registerOpener, Boolean(previewProduct)])

  const { product: listedProduct, siblings, loading } = useProduct(productId)
  const product = previewProduct ?? listedProduct
  const related = product && !previewProduct ? siblings.filter((item) => item.id !== product.id && item.category === product.category).slice(0, 4) : []
  useEffect(() => { setPreviewImage(0) }, [product?.id])

  if (!product && loading) return <main id="main" className="market" aria-busy="true">
    <MarketHero t={t} language={language} />
    <section className="market-browse"><div className="content-wrap market-missing"><p>{market.subtitle}</p></div></section>
  </main>

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

  const gallery = product.previews?.length ? product.previews : product.image ? [product.image] : []
  const hasPreview = Boolean(gallery.length || isArtworkPack(product))
  const loops = animationCount(product)
  const submitReport = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!reportReason) { setReportState('error'); return }
    const result = await fileReport({
      productId: product.id,
      productName: productCopy(product.name, language),
      reason: reportReason,
      detail: reportDetail,
    })
    if (!result.ok) { setReportState('error'); return }
    setReportState('sent')
    setReportReason('')
    setReportDetail('')
  }

  const Root = previewProduct ? 'div' : 'main'
  return <Root id={previewProduct ? undefined : 'main'} className="market market-detail-page">
    <div className="content-wrap asset-detail">
      {!previewProduct && <nav className="pack-crumbs" aria-label={market.title}>
        <a href="#/market"><ArrowLeft aria-hidden="true" />{market.detail.back}</a>
        <span aria-current="page">{productCopy(product.name, language)}</span>
      </nav>}
      <header className="asset-heading">
        <CategoryTag product={product} t={t} />
        <h1>{productCopy(product.name, language)}</h1>
        <p>{productCopy(product.tagline, language)}</p>
      </header>
      <div className="asset-layout">
        <div className="asset-content">
          <figure className={hasPreview ? 'asset-preview' : 'asset-preview empty'}>
            {hasPreview ? <>
              <div className={previewSurface === 'grid' ? 'asset-preview-stage grid' : 'asset-preview-stage'}>
                {gallery.length > 0 ? <img className="pack-image" src={gallery[Math.min(previewImage, gallery.length - 1)]} alt={productCopy(product.name, language)} /> : <PackImage product={product} t={t} alt={productCopy(product.name, language)} zoom={previewZoom} />}
              </div>
              <div className="asset-preview-tools">
                {gallery.length > 1 && <div className="asset-preview-options" role="group" aria-label={language === 'zh' ? '预览图片' : 'Preview images'}>
                  {gallery.map((_, index) => <Chip key={index} active={previewImage === index} onClick={() => setPreviewImage(index)}>{index + 1}</Chip>)}
                </div>}
                <span>{language === 'zh' ? '资源预览' : 'Asset preview'}</span>
                <div className="asset-preview-options">
                  <Chip active={previewSurface === 'grid'} onClick={() => setPreviewSurface(previewSurface === 'grid' ? 'plain' : 'grid')}>{language === 'zh' ? '网格' : 'Grid'}</Chip>
                  {isArtworkPack(product) && <Chip active={previewZoom === 6} onClick={() => setPreviewZoom(previewZoom === 4 ? 6 : 4)}>{previewZoom}×</Chip>}
                </div>
              </div>
            </> : <div className="asset-preview-empty">
              
              <div><strong>{market.detail.previewPending}</strong><p>{language === 'zh' ? '先了解资源内容、文件格式与使用授权。' : 'Explore the contents, file formats and license below.'}</p></div>
            </div>}
            <figcaption>
              <span>{product.formats.join(' / ')}</span>
              <span>{productCopy(product.size, language)}{loops > 0 ? ` · ${market.card.loops(loops)}` : ''}</span>
            </figcaption>
          </figure>
          <section className="asset-description">
            <h2>{language === 'zh' ? '关于这个资源包' : 'About this pack'}</h2>
            <p>{productCopy(product.body, language)}</p>
          </section>
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
                    <span className="bundle-item-price">{formatPrice(item.price, language)}</span>
                    <ChevronRight aria-hidden="true" />
                  </a>
                </li>)}
              </ul>
              {product.includes.length > 0 && <IncludesList product={product} t={t} language={language} />}
            </section>
            : <section className="detail-block">
              <h2>{market.detail.includes}</h2>
              {product.includes.length > 0 ? <IncludesList product={product} t={t} language={language} /> : <p className="asset-content-note">{language === 'zh' ? '此资源包提供以下文件格式：' : 'This pack provides these file formats: '}{product.formats.join(' · ')}</p>}
            </section>}

        </div>
        <aside className="asset-purchase" aria-label={language === 'zh' ? '购买与资源信息' : 'Purchase and pack information'}>
          <Panel>
            <div className="asset-purchase-heading"><span>{language === 'zh' ? '数字资源包' : 'Digital asset pack'}</span><span>{owns(product.id) ? market.card.ownedPack : product.formats[0]}</span></div>
            <PriceRow product={product} t={t} language={language} />
            <div className="asset-purchase-actions">
              {previewProduct ? <Button variant="primary" block disabled>{market.card.add}</Button> : owns(product.id)
                ? <Button href="#/purchases" variant="primary" block>{language === 'zh' ? '下载已购资源' : 'Download purchased pack'}</Button>
                : <Button variant="primary" block className="cart-action" onClick={() => { if (cart.has(product.id)) setCartOpen(true); else cart.add(product.id) }}>{cart.has(product.id) ? (language === 'zh' ? '查看购物车' : 'View cart') : market.card.add}</Button>}
            </div>
            <p className="asset-purchase-note">{market.detail.buy}</p>
            <div className="asset-specifications">
              <h2>{market.detail.specs}</h2>
              <SpecList product={product} t={t} language={language} />
            </div>
            <a className="asset-license" href="#/license">{language === 'zh' ? '查看使用授权与许可条款' : 'Read the license and usage terms'}<ChevronRight aria-hidden="true" /></a>
          </Panel>
        </aside>
      </div>
      <section className="asset-support">
        <Panel title={market.trust.title}>
          <ul className="detail-list">
            <li><Check aria-hidden="true" />{market.trust.license}</li>
            <li><Check aria-hidden="true" />{market.trust.updates}</li>
            <li><Check aria-hidden="true" />{market.trust.refunds}</li>
          </ul>
          <div className="asset-support-link"><Button href="#/support" size="compact">{language === 'zh' ? '联系支持' : 'Contact support'}</Button></div>
        </Panel>
        {!previewProduct && <details className="asset-report">
          <summary>{market.report.title}</summary>
          {!account ? <Button href="#/account">{language === 'zh' ? '登录后提交举报' : 'Sign in to report'}</Button>
            : reportState === 'sent' ? <Alert tone="success">{market.report.sent}</Alert>
            : <form className="account-form" onSubmit={submitReport}>
              <FormField label={market.report.reason}>
                <Select value={reportReason} label={market.report.reason} onChange={(value) => { setReportReason(value as ReportReason | ''); setReportState('idle') }} options={[
                  { value: '', label: market.report.open },
                  { value: 'copyright', label: market.report.reasonCopyright },
                  { value: 'broken', label: market.report.reasonBroken },
                  { value: 'misleading', label: market.report.reasonMisleading },
                  { value: 'other', label: market.report.reasonOther },
                ]} />
              </FormField>
              <Field label={market.report.detail}><textarea value={reportDetail} onChange={(event) => setReportDetail(event.target.value)} rows={3} maxLength={1000} /></Field>
              {reportState === 'error' && <Alert tone="danger" role="alert">{market.report.errorReason}</Alert>}
              <Button type="submit" size="compact">{market.report.submit}</Button>
            </form>}
        </details>}
      </section>
    </div>
    {related.length > 0 && <section className="market-browse related">
      <div className="content-wrap">
        <header className="page-head market-head"><h2>{market.detail.related}</h2></header>
        <PackGrid products={related} t={t} language={language} />
      </div>
    </section>}
    {!previewProduct && <CartDrawer open={cartOpen} cart={cart} t={t} language={language} onClose={() => setCartOpen(false)} />}
  </Root>
}
