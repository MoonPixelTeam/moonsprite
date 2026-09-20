import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../api'
import type { Account, Order, OrderLine } from '../api'

/*
 * Accounts and purchase history, held in React state and persisted through the api
 * client. Nothing here touches storage directly: swapping the prototype for a server
 * changes src/api and nothing in this file.
 */
export type { Account, Order, OrderLine }

export type AccountStore = {
  account: Account | null
  ready: boolean
  register: (input: { name: string; email: string; password: string }) => Promise<{ ok: true } | { ok: false; error: string }>
  signIn: (input: { email: string; password: string }) => Promise<{ ok: true } | { ok: false; error: string }>
  signOut: () => Promise<void>
  /** Records a purchase against the signed-in account. */
  addOrder: (lines: OrderLine[]) => Promise<{ ok: boolean; error?: string; order?: Order }>
  orders: Order[]
  /** Every pack this account has bought, for the "owned" state in the market. */
  owned: Set<string>
  owns: (productId: string) => boolean
  updateName: (name: string) => Promise<{ ok: true } | { ok: false; error: string }>
  updateEmail: (email: string) => Promise<{ ok: true } | { ok: false; error: string }>
  changePassword: (input: { current: string; next: string }) => Promise<{ ok: true } | { ok: false; error: string }>
  requestPasswordReset: (email: string) => Promise<{ ok: true; exists: boolean }>
  verifyEmail: () => Promise<void>
  deleteAccount: () => Promise<void>
}

const AccountContext = createContext<AccountStore | null>(null)

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [ready, setReady] = useState(false)

  const loadOrders = useCallback(async () => {
    try {
      setOrders(await api.orders.list())
    } catch (error) {
      console.warn('MoonSprite account: could not load orders.', error)
      setOrders([])
    }
  }, [])

  // Restore the session once, then keep the order list in step with it.
  useEffect(() => {
    let alive = true
    const boot = async () => {
      try {
        const current = await api.auth.current()
        if (!alive) return
        setAccount(current)
        if (current) setOrders(await api.orders.list())
      } catch (error) {
        console.warn('MoonSprite account: could not restore the session.', error)
      } finally {
        if (alive) setReady(true)
      }
    }
    void boot()
    const refresh = () => { void loadOrders() }
    window.addEventListener('moonsprite:data', refresh)
    return () => {
      alive = false
      window.removeEventListener('moonsprite:data', refresh)
    }
  }, [loadOrders])

  const register = useCallback(async (input: { name: string; email: string; password: string }) => {
    const result = await api.auth.register(input)
    if (!result.ok) return { ok: false as const, error: result.error }
    setAccount(result.account)
    setOrders([])
    return { ok: true as const }
  }, [])

  const signIn = useCallback(async (input: { email: string; password: string }) => {
    const result = await api.auth.signIn(input)
    if (!result.ok) return { ok: false as const, error: result.error }
    setAccount(result.account)
    await loadOrders()
    return { ok: true as const }
  }, [loadOrders])

  const signOut = useCallback(async () => {
    await api.auth.signOut()
    setAccount(null)
    setOrders([])
  }, [])

  const addOrder = useCallback(async (lines: OrderLine[]) => {
    const result = await api.orders.create(lines)
    if (!result.ok) return { ok: false as const, error: result.error }
    setOrders((current) => [result.data, ...current])
    // The receipt needs the order it just created.
    return { ok: true as const, order: result.data }
  }, [])

  const owned = useMemo(
    () => new Set(orders.flatMap((order) => order.lines.map((line) => line.id))),
    [orders],
  )

  const updateName = useCallback(async (name: string) => {
    const result = await api.auth.updateName(name)
    if (result.ok) setAccount(result.account)
    return result.ok ? { ok: true as const } : { ok: false as const, error: result.error }
  }, [])

  const updateEmail = useCallback(async (email: string) => {
    const result = await api.auth.updateEmail(email)
    if (result.ok) setAccount(result.account)
    return result.ok ? { ok: true as const } : { ok: false as const, error: result.error }
  }, [])

  const changePassword = useCallback(async (input: { current: string; next: string }) => {
    const result = await api.auth.changePassword(input)
    return result.ok ? { ok: true as const } : { ok: false as const, error: result.error }
  }, [])

  const requestPasswordReset = useCallback((email: string) => api.auth.requestPasswordReset(email), [])

  const verifyEmail = useCallback(async () => {
    const result = await api.auth.verifyEmail()
    if (result.ok) setAccount(result.account)
  }, [])

  const deleteAccount = useCallback(async () => {
    await api.auth.deleteAccount()
    setAccount(null)
    setOrders([])
  }, [])

  const value = useMemo<AccountStore>(
    () => ({
      account, ready, register, signIn, signOut, addOrder, orders,
      owned, owns: (productId) => owned.has(productId),
      updateName, updateEmail, changePassword, requestPasswordReset, verifyEmail, deleteAccount,
    }),
    [account, ready, register, signIn, signOut, addOrder, orders, owned, updateName, updateEmail, changePassword, requestPasswordReset, verifyEmail, deleteAccount],
  )

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function useAccount(): AccountStore {
  const store = useContext(AccountContext)
  if (!store) throw new Error('useAccount must be used inside AccountProvider')
  return store
}
