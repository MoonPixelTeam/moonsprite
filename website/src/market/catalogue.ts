import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../api'
import type { StudioProduct } from '../api'
import { MARKET_PRODUCTS, type MarketProduct } from './catalog'
import { useData } from '../data/store'

/**
 * Map saved listings onto the market shape, retaining detail fields and resolving
 * bundle members against published listings. Older records use empty defaults.
 */
export function studioToProduct(item: StudioProduct, catalogue: StudioProduct[] = []): MarketProduct {
  return {
    id: item.id,
    category: item.category,
    image: item.image,
    previews: item.previews,
    name: item.name,
    tagline: item.tagline,
    body: item.body,
    price: item.price,
    size: { zh: item.size, en: item.size },
    formats: item.formats,
    tags: item.tags,
    includes: item.includes ?? [],
    ...(item.category === 'pets' ? { animations: item.animations } : {}),
    ...(item.category === 'bundles' ? {
      packs: item.packs ?? [],
      members: (item.packs ?? []).flatMap((id) => {
        const member = catalogue.find((candidate) => candidate.id === id && candidate.category !== 'bundles')
        const builtin = MARKET_PRODUCTS.find((candidate) => candidate.id === id && candidate.category !== 'bundles')
        return member ? [studioToProduct(member)] : builtin ? [builtin] : []
      }),
    } : {}),
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
type CatalogueState = { products: MarketProduct[]; loading: boolean }
const CatalogueContext = createContext<CatalogueState | null>(null)

function useCatalogueSource(): CatalogueState {
  const { statusOf } = useData()
  const [published, setPublished] = useState<MarketProduct[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const items = await api.catalogue.all()
        if (!alive) return
        setPublished(items.map((item) => studioToProduct(item, items)))
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

  const products = useMemo(() => [
    ...published.filter((product) => statusOf(product.id) === 'approved'),
    ...MARKET_PRODUCTS,
  ], [published, statusOf])
  return { products, loading }
}

export function CatalogueProvider({ children }: { children: ReactNode }) {
  const value = useCatalogueSource()
  return createElement(CatalogueContext.Provider, { value }, children)
}

export function useCatalogue(): CatalogueState {
  const value = useContext(CatalogueContext)
  if (!value) throw new Error('useCatalogue must be used inside CatalogueProvider')
  return value
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
