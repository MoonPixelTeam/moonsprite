import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, readStudioUnlocked, writeStudioUnlocked } from '../api'
import type { Ledger, StudioProduct, Withdrawal } from '../api'
import { MARKET_PRODUCTS, type MarketProduct } from '../market/catalog'

/*
 * The seller side: published packs, the money they earned, and withdrawal requests —
 * all read through the api client, so the prototype's storage and a real server look the
 * same from here.
 *
 * The caveat about money is not repeated in this file: the studio page renders it, and
 * src/api/local.ts carries the detail.
 */
export type { StudioProduct, Withdrawal }

export type StudioStore = {
  /** Needs a signed-in account: a studio belongs to somebody. */
  unlocked: boolean
  setUnlocked: (value: boolean) => void
  products: StudioProduct[]
  publish: (input: Omit<StudioProduct, 'id' | 'publishedAt'>) => Promise<{ ok: true; id: string } | { ok: false; error: string }>
  /** Edits an already published pack; the listing keeps its id. */
  update: (id: string, input: Omit<StudioProduct, 'id' | 'publishedAt'>) => Promise<{ ok: true } | { ok: false; error: string }>
  unpublish: (id: string) => Promise<void>
  /** Every sale of a studio pack, newest first. */
  sales: Ledger['sales']
  gross: number
  platformFee: number
  net: number
  withdrawn: number
  available: number
  withdrawals: Withdrawal[]
  requestWithdrawal: (amount: number, destination: string) => Promise<{ ok: true } | { ok: false; error: string }>
  platformFeePercent: number
  setPlatformFeePercent: (percent: number) => Promise<void>
  loading: boolean
}

const EMPTY_LEDGER: Ledger = { gross: 0, platformFee: 0, net: 0, withdrawn: 0, available: 0, sales: [], withdrawals: [] }

const StudioContext = createContext<StudioStore | null>(null)

/** Studio packs first, then the built-in catalogue: both are buyable. */
export function allProducts(studioProducts: StudioProduct[]): MarketProduct[] {
  const asProducts = studioProducts.map((item) => ({
    id: item.id,
    category: item.category,
    image: item.image,
    name: item.name,
    tagline: item.tagline,
    body: item.body,
    price: item.price,
    size: { zh: item.size, en: item.size },
    formats: item.formats,
    includes: [],
  } as MarketProduct))
  return [...asProducts, ...MARKET_PRODUCTS]
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<StudioProduct[]>([])
  const [ledger, setLedger] = useState<Ledger>(EMPTY_LEDGER)
  const [platformFeePercent, setFeePercent] = useState(8)
  const [loading, setLoading] = useState(true)
  const [unlocked, setUnlockedState] = useState(readStudioUnlocked)

  const reload = useCallback(async () => {
    try {
      const [nextProducts, nextLedger, fee] = await Promise.all([api.studio.products(), api.studio.ledger(), api.studio.platformFee()])
      setProducts(nextProducts)
      setLedger(nextLedger)
      setFeePercent(fee)
    } catch (error) {
      console.warn('MoonSprite studio: could not load studio data.', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Revenue is computed from orders, so a purchase anywhere refreshes this.
  useEffect(() => {
    void reload()
    const refresh = () => { void reload() }
    window.addEventListener('moonsprite:data', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('moonsprite:data', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [reload])

  const setUnlocked = useCallback((value: boolean) => {
    setUnlockedState(value)
    writeStudioUnlocked(value)
  }, [])

  const publish: StudioStore['publish'] = useCallback(async (input) => {
    const result = await api.studio.publish(input)
    if (!result.ok) return { ok: false as const, error: result.error }
    await reload()
    // The id comes back so the caller can attach the pack file to it.
    return { ok: true as const, id: result.data.id }
  }, [reload])

  const update: StudioStore['update'] = useCallback(async (target, input) => {
    const result = await api.studio.update(target, input)
    if (!result.ok) return { ok: false as const, error: result.error }
    await reload()
    return { ok: true as const }
  }, [reload])

  const unpublish = useCallback(async (target: string) => {
    await api.studio.unpublish(target)
    await reload()
  }, [reload])

  const requestWithdrawal: StudioStore['requestWithdrawal'] = useCallback(async (amount, destination) => {
    const result = await api.studio.requestWithdrawal(amount, destination)
    if (!result.ok) return { ok: false as const, error: result.error }
    await reload()
    return { ok: true as const }
  }, [reload])

  const setPlatformFeePercent = useCallback(async (percent: number) => {
    await api.studio.setPlatformFee(percent)
    await reload()
  }, [reload])

  const value = useMemo<StudioStore>(() => ({
    unlocked,
    setUnlocked,
    products,
    publish,
    update,
    unpublish,
    sales: ledger.sales,
    gross: ledger.gross,
    platformFee: ledger.platformFee,
    net: ledger.net,
    withdrawn: ledger.withdrawn,
    available: ledger.available,
    withdrawals: ledger.withdrawals,
    requestWithdrawal,
    platformFeePercent,
    setPlatformFeePercent,
    loading,
  }), [unlocked, setUnlocked, products, publish, update, unpublish, ledger, requestWithdrawal, platformFeePercent, setPlatformFeePercent, loading])

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
}

export function useStudio(): StudioStore {
  const store = useContext(StudioContext)
  if (!store) throw new Error('useStudio must be used inside StudioProvider')
  return store
}
