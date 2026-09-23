import { useState } from 'react'
import { Button } from '../ui'
import { PixelCheck as Check } from '../ui/icons'
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
import { marketPackHash } from '../router'
import { useCart, type Cart } from './cart'
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
      <strong>{formatPrice(product.price)}</strong>
      <s>{formatPrice(full)}</s>
      <em>{t.marketPage.card.save} {formatPrice(full - product.price)}</em>
    </div>
  }
  return <div className="pack-price"><strong>{formatPrice(product.price)}</strong></div>
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

export function AddButton({ product, t, inCart, owned, onAdd, block = false }: {
  product: MarketProduct
  t: Copy
  inCart: boolean
  /** Already bought: offering the cart again would invite a duplicate purchase. */
  owned?: boolean
  onAdd: (id: string) => void
  block?: boolean
}) {
  const market = t.marketPage
  if (owned) {
    return <span className="add-button">
      <span className="owned-flag"><Check aria-hidden="true" />{market.card.ownedPack}</span>
    </span>
  }
  // The card is one big link, so the button has to stop the click from following it.
  return <span className="add-button" onClick={(event) => event.stopPropagation()}>
    <Button
      size="compact"
      block={block}
      icon={inCart ? <Check aria-hidden="true" /> : undefined}
      onClick={() => onAdd(product.id)}>
      {inCart ? market.card.owned : market.card.add}
    </Button>
  </span>
}

/** One pack, exactly as the market lists it. Used by the market grid and the homepage. */
export function PackCard({ product, t, language, cart, owned, compact = false }: {
  product: MarketProduct
  t: Copy
  language: Language
  cart: Cart
  owned?: boolean
  compact?: boolean
}) {
  const market = t.marketPage
  const loops = animationCount(product)

  if (compact) return <article className="pack-tile">
    <a href={marketPackHash(product.id)} aria-label={`${productCopy(product.name, language)} - ${market.card.details}`}>
      <div className={isArtworkPack(product) ? 'pack-art-frame artwork' : 'pack-art-frame'}>
        <PackImage product={product} t={t} alt={productCopy(product.name, language)} zoom={4} />
      </div>
      <div className="pack-tile-caption">
        <h3>{productCopy(product.name, language)}</h3>
        <span>{formatPrice(product.price)}</span>
      </div>
    </a>
  </article>

  return <article className="pack-card">
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
          <h2>{productCopy(product.name, language)}</h2>
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
        <AddButton product={product} t={t} inCart={cart.has(product.id)} owned={owned} onAdd={cart.add} />
      </div>
    </footer>
  </article>
}

/** The grid the cards sit in, so both pages space and wrap them the same way. */
export function PackGrid({ products, t, language, className, compact = false }: {
  products: MarketProduct[]
  t: Copy
  language: Language
  className?: string
  compact?: boolean
}) {
  const cart = useCart()
  const { owns } = useAccount()
  return <div className={className ? `pack-grid ${className}` : 'pack-grid'}>
    {products.map((product) => <PackCard
      key={product.id}
      product={product}
      t={t}
      language={language}
      cart={cart}
      owned={owns(product.id)}
      compact={compact} />)}
  </div>
}
