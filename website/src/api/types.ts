import { SITE_CONFIG } from '../config'

/*
 * The API surface the app talks to. Nothing in the pages or stores should touch
 * localStorage or fetch directly: they call a client, and the client talks to an
 * adapter. Swapping the prototype for a real server is a config change plus one new
 * adapter, not a rewrite.
 */

export type Account = { id: string; name: string; email: string; createdAt: number; emailVerified: boolean }
export type OrderLine = { id: string; name: string; price: number; quantity: number }
export type Order = { id: string; createdAt: number; total: number; lines: OrderLine[] }
export type AuthResult = { ok: true; account: Account } | { ok: false; error: string }

export type StudioProduct = {
  id: string
  name: { zh: string; en: string }
  tagline: { zh: string; en: string }
  body: { zh: string; en: string }
  price: number
  category: string
  size: string
  formats: string[]
  /** Market filter tags, chosen from presets in the studio. */
  tags: string[]
  image?: string
  publishedAt: number
}

/** requested -> approved -> paid, or rejected. A request is never silently dropped. */
export type WithdrawalStatus = 'requested' | 'approved' | 'paid' | 'rejected'

export type Withdrawal = {
  id: string
  amount: number
  status: WithdrawalStatus
  requestedAt: number
  destination: string
  /** Set when a reviewer moves the request, so the seller can see why. */
  decidedAt?: number
  note?: string
}

export type SaleLine = {
  orderId: string
  createdAt: number
  productId: string
  name: string
  quantity: number
  gross: number
}

export type Ledger = {
  gross: number
  platformFee: number
  net: number
  withdrawn: number
  available: number
  sales: SaleLine[]
  withdrawals: Withdrawal[]
}

export type PublishInput = Omit<StudioProduct, 'id' | 'publishedAt'>

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Every method returns a Promise, even the local one, so callers are already written
 * against the shape a network call has — no synchronous shortcut to unpick later.
 */
export type ApiClient = {
  auth: {
    current(): Promise<Account | null>
    signIn(input: { email: string; password: string }): Promise<AuthResult>
    register(input: { name: string; email: string; password: string }): Promise<AuthResult>
    signOut(): Promise<void>
    updateName(name: string): Promise<AuthResult>
    updateEmail(email: string): Promise<AuthResult>
    changePassword(input: { current: string; next: string }): Promise<{ ok: true } | { ok: false; error: string }>
    /** Always resolves; a real server must not reveal whether an address exists. */
    requestPasswordReset(email: string): Promise<{ ok: true; exists: boolean }>
    verifyEmail(): Promise<AuthResult>
    deleteAccount(): Promise<void>
  }
  orders: {
    /** Orders for the signed-in account. */
    list(): Promise<Order[]>
    /** Records a purchase and returns the stored order. */
    create(lines: OrderLine[]): Promise<ApiResult<Order>>
    /** Every order in the ledger; the studio needs the whole book. */
    all(): Promise<Order[]>
  }
  catalogue: {
    /** Packs published from the studio, newest first. They are buyable when listed. */
    all(): Promise<StudioProduct[]>
  }
  studio: {
    products(): Promise<StudioProduct[]>
    publish(input: PublishInput): Promise<ApiResult<StudioProduct>>
    /** Edits a published pack in place; the id and publish date stay. */
    update(id: string, input: PublishInput): Promise<ApiResult<StudioProduct>>
    unpublish(id: string): Promise<void>
    ledger(): Promise<Ledger>
    platformFee(): Promise<number>
    setPlatformFee(percent: number): Promise<void>
    requestWithdrawal(amount: number, destination: string): Promise<ApiResult<Withdrawal>>
    /** Moves a payout request along; the seller sees the new state on their side. */
    setWithdrawalStatus(id: string, status: WithdrawalStatus, note?: string): Promise<void>
    /** Every payout request across sellers, for the console. */
    allWithdrawals(): Promise<Withdrawal[]>
  }
}

/** Which adapter to use, and where the server lives. */
export const API_MODE: 'local' | 'http' = SITE_CONFIG.apiBaseUrl ? 'http' : 'local'
