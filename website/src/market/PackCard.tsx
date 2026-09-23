import { Button, IconButton } from '../ui'
import { PixelCart as CartIcon, PixelCheck as Check } from '../ui/icons'
import type { Copy, Language } from '../content'
import { PetSpriteStrip } from './PixelArt'
import { petPacks } from './petSprites'
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
} from './catalog'
import { marketPackHash, navigate } from '../router'
import { useCart, useCartStore, type Cart } from './cart'
import { useAccount } from '../account/store'

/*
 * The market's pack card. Kept in market/ rather than in a page because more than one
 * page shows packs — the homepage features the same cards, and a second hand-rolled card
 * would drift from this one the first time either changed.
 */

/** Real .mspet packs preview with their own artwork, framed as pixel art. */
export function isArtworkPack(product: MarketProduct): boolean {
  return isPetProduct(product) && Boolean(product.animations)
}

/*
 * TypeScript loses the discriminant when narrowing through a union member's own
 * members, so these guards keep the narrowing explicit.
 */
export function isPetProduct(product: MarketProduct): product is PetPackProduct {
  return product.category === 'pets'
}

export function isBundleProduct(product: MarketProduct): product is BundleProduct {
  return product.category === 'bundles'
}

/** Animation loops a pack advertises, counted from the pack's own data. */
export function animationCount(product: MarketProduct): number {
  if (!isPetProduct(product)) return 0
  if (product.animations) return product.animations.order.length
  return product.pack ? petsOf(product).length * petPacks[product.pack].animations.length : 0
}

export function CategoryTag({ product, t }: { product: MarketProduct; t: Copy }) {
  const labels: Record<MarketCategory, string> = {
    pets: t.marketPage.categories.pets,
    assets: t.marketPage.categories.assets,
    bundles: t.marketPage.categories.bundles,
    extensions: t.marketPage.categories.extensions,
    scripts: t.marketPage.categories.scripts,
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
      {full > product.price && <s>{formatPrice(full, language)}</s>}
    </div>
  }
  return <div className="pack-price"><strong>{formatPrice(product.price, language)}</strong></div>
}

/**
 * The pack's preview. A real .mspet pack plays its own idle loop, so the thumbnail is
 * the pet alive rather than a still. Packs whose artwork has not been drawn yet get an
 * empty frame: showing an editor screenshot there would read as if the pack contained
 * that screen. Drop the art in public/assets/market and set `image` to use it.
 */
export function PackImage({ product, t, alt, zoom = 3, className }: {
  product: MarketProduct
  t: Copy
  alt: string
  zoom?: number
  className?: string
}) {
  if (isPetProduct(product) && product.animations) {
    return <PetSpriteStrip sheet={product.animations.idle} zoom={zoom} className={className} />
  }
  if (!product.image) {
    return <span className="pack-placeholder">
      <span className="pack-placeholder-mark" aria-hidden="true" />
      <span className="pack-placeholder-text">{t.marketPage.detail.previewPending}</span>
    </span>
  }
  return <img
    className={className ? `pack-image ${className}` : 'pack-image'}
    src={product.image}
    alt={alt}
    loading="lazy"
    decoding="async" />
}

export function AddButton({ product, t, inCart, owned, ownedOrderId, onAdd, block = false }: {
  product: MarketProduct
  t: Copy
  inCart: boolean
  /** Already bought: offering the cart again would invite a duplicate purchase. */
  owned?: boolean
  ownedOrderId?: string
  onAdd: (id: string) => void
  block?: boolean
}) {
  const market = t.marketPage
  const { openCart, hasOpener } = useCartStore()
  const handleClick = () => {
    if (!inCart) {
      onAdd(product.id)
      return
    }
    if (hasOpener) {
      openCart()
      return
    }
    // Homepage cards do not own a drawer; move to the market and open it there.
    navigate('#/market')
    window.setTimeout(openCart, 120)
  }
  if (owned) {
    return <span className="add-button">
      <IconButton
        className="owned-flag"
        href={ownedOrderId ? `#/orders/${ownedOrderId}` : '#/purchases'}
        icon={<Check aria-hidden="true" />}
        label={market.receipt.viewOrder} />
    </span>
  }
  // The card is one big link, so the button has to stop the click from following it.
  return <span className="add-button" onClick={(event) => event.stopPropagation()}>
    <Button
      size="compact"
      block={block}
      className={inCart ? 'cart-action cart-icon-button has-items' : 'cart-action cart-icon-button'}
      ariaLabel={inCart ? market.card.owned : market.card.add}
      icon={<CartIcon aria-hidden="true" />}
      onClick={handleClick}>
    </Button>
  </span>
}

/** Compact popular-pack tile used by the market shelf and the component library. */
export function PopularPackCard({ product, t, language }: { product: MarketProduct; t: Copy; language: Language }) {
  const name = productCopy(product.name, language)
  return <a className="shelf-item" href={marketPackHash(product.id)}>
    <span className="shelf-cover">
      <PackImage product={product} t={t} alt={name} zoom={2} />
    </span>
    <figcaption>
      <strong title={name}>{name}</strong>
      <span>{formatPrice(product.price, language)}</span>
    </figcaption>
  </a>
}

type PackCardProps = {
  product: MarketProduct
  t: Copy
  language: Language
  cart: Cart
  owned?: boolean
  ownedOrderId?: string
}

/** Full catalogue card used by the market and related-pack lists. */
export function AssetPackCard({ product, t, language, cart, owned, ownedOrderId }: PackCardProps) {
  const market = t.marketPage
  const name = productCopy(product.name, language)
  const summary = productCopy(product.tagline, language) || productCopy(product.body, language)

  return <article className="pack-card asset-pack-card">
    <a className="pack-card-link" href={marketPackHash(product.id)} aria-label={`${productCopy(product.name, language)} - ${market.card.details}`}>
      <div className={isArtworkPack(product) ? 'pack-art-frame artwork' : 'pack-art-frame'}>
        <PackImage product={product} t={t} alt={productCopy(product.name, language)} zoom={4} />
        <CategoryTag product={product} t={t} />
      </div>

      <div className="pack-body">
        <header className="pack-head">
          {/*
           * The pack name is a card title, not a page section. On the studio's preview the
           * card sits directly under the page h1, so an h3 here left a level missing; h2 is
           * correct for a card too, since the card is a section of the grid.
           */}
          <h2 title={name}>{name}</h2>
          <p className="pack-tagline">{summary}</p>
        </header>
        <ul className="pack-chips">
          <li title={productCopy(product.size, language)}>{productCopy(product.size, language)}</li>
          <li title={product.formats[0]}>{product.formats[0]}</li>
        </ul>
      </div>
    </a>

    <footer className="pack-foot">
      <PriceRow product={product} t={t} language={language} />
      <div className="pack-actions">
        <AddButton product={product} t={t} inCart={cart.has(product.id)} owned={owned} ownedOrderId={ownedOrderId} onAdd={cart.add} />
      </div>
    </footer>
  </article>
}

/** Lighter homepage card: artwork leads, with only the scan-friendly pack details below it. */
export function FeaturedPackCard({ product, t, language, cart, owned, ownedOrderId }: PackCardProps) {
  const market = t.marketPage
  const name = productCopy(product.name, language)
  const summary = productCopy(product.tagline, language) || productCopy(product.body, language)

  return <article className="pack-card featured-pack-card">
    <a className="pack-card-link" href={marketPackHash(product.id)} aria-label={`${name} - ${market.card.details}`}>
      <div className={isArtworkPack(product) ? 'pack-art-frame artwork' : 'pack-art-frame'}>
        <PackImage product={product} t={t} alt={name} zoom={4} />
        <CategoryTag product={product} t={t} />
      </div>
      <div className="pack-body">
        <header className="pack-head">
          <h2 title={name}>{name}</h2>
          <p className="pack-tagline">{summary}</p>
        </header>
        <ul className="pack-chips">
          <li title={productCopy(product.size, language)}>{productCopy(product.size, language)}</li>
          <li title={product.formats[0]}>{product.formats[0]}</li>
        </ul>
      </div>
    </a>
    <footer className="pack-foot">
      <PriceRow product={product} t={t} language={language} />
      <div className="pack-actions">
        <AddButton product={product} t={t} inCart={cart.has(product.id)} owned={owned} ownedOrderId={ownedOrderId} onAdd={cart.add} />
      </div>
    </footer>
  </article>
}

/** Backwards-compatible name for callers that need the full market card. */
export const PackCard = AssetPackCard

/** The shared grid chooses the card component for each browsing context. */
export function PackGrid({ products, t, language, className, variant = 'market' }: {
  products: MarketProduct[]
  t: Copy
  language: Language
  className?: string
  variant?: 'market' | 'featured'
}) {
  const cart = useCart()
  const { owns, orders } = useAccount()
  return <div className={className ? `pack-grid ${className}` : 'pack-grid'}>
    {products.map((product) => {
      const Card = variant === 'featured' ? FeaturedPackCard : AssetPackCard
      return <Card
      key={product.id}
      product={product}
      t={t}
      language={language}
      cart={cart}
      owned={owns(product.id)}
       ownedOrderId={orders.find((order) => order.lines.some((line) => line.id === product.id))?.id} />
    })}
  </div>
}
