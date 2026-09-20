import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { StudioProduct } from '../api'
import { MARKET_PRODUCTS, type MarketProduct } from './catalog'

/**
 * A studio pack is stored leaner than a catalogue entry — no `includes` list, and its
 * size is one string rather than a pair — so publishing maps it onto the shapes the
 * market already renders.
 */
export function studioToProduct(item: StudioProduct): MarketProduct {
  return {
    id: item.id,
    category: item.category,
    image: item.image,
    name: item.name,
    tagline: item.tagline,
    body: item.body,
    price: item.price,
    size: { zh: item.size, en: item.size },
    formats: item.formats,
    tags: item.tags,
    includes: [],
  } as MarketProduct
}

/*
 * The catalogue a page actually renders: the built-in packs plus whatever the studio has
 * published. A published pack has to be buyable — a seller who uploads one and never
 * sees it in the market reads that as "upload is broken".
 *
 * This is a hook, and it listens for data changes, because a pack published in another
 * tab or on another page must appear here without a reload.
 */
export function useCatalogue(): { products: MarketProduct[]; loading: boolean } {
  const [published, setPublished] = useState<MarketProduct[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const items = await api.catalogue.all()
        if (!alive) return
        setPublished(items.map(studioToProduct))
      } catch (error) {
        console.warn('MoonSprite market: could not load published packs.', error)
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    const refresh = () => { void load() }
    window.addEventListener('moonsprite:data', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      alive = false
      window.removeEventListener('moonsprite:data', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const products = useMemo(() => [...published, ...MARKET_PRODUCTS], [published])
  return { products, loading }
}

/** The product a page is showing, whichever side of the catalogue it came from. */
export function useProduct(id: string | undefined): { product: MarketProduct | undefined; siblings: MarketProduct[]; loading: boolean } {
  const { products, loading } = useCatalogue()
  return useMemo(() => ({
    product: id ? products.find((item) => item.id === id) : undefined,
    siblings: products,
    loading,
  }), [id, products, loading])
}
