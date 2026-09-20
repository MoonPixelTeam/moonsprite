import { SITE_CONFIG } from '../config'
import type { Account, ApiClient, ApiResult, AuthResult, Ledger, Order, OrderLine, PublishInput, StudioProduct, Withdrawal, WithdrawalStatus } from './types'

/*
 * The HTTP adapter. It is written and typed, but it cannot run against anything yet
 * because no server exists — SITE_CONFIG.apiBaseUrl is empty, so the client resolves to
 * the local adapter.
 *
 * The routes below are the contract a backend has to implement. They are deliberately
 * boring: JSON in, JSON out, a session cookie rather than a token in localStorage.
 */

const base = () => SITE_CONFIG.apiBaseUrl.replace(/\/$/, '')

type RequestOptions = { method?: string; body?: unknown }

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${base()}${path}`, {
    method: options.method ?? 'GET',
    // The session belongs in an httpOnly cookie, not in a header the page can read.
    credentials: 'include',
    headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`${options.method ?? 'GET'} ${path} failed: ${response.status} ${detail.slice(0, 120)}`)
  }
  if (response.status === 204) return undefined as T
  return await response.json() as T
}

/** Maps a thrown failure onto the same result shape the local adapter returns, so pages
 *  do not care which adapter is behind the client. */
async function attempt<T>(work: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    return { ok: true, data: await work() }
  } catch (error) {
    console.warn('MoonSprite api: request failed.', error)
    return { ok: false, error: 'network' }
  }
}

export const httpAdapter: ApiClient = {
  auth: {
    async current(): Promise<Account | null> {
      return await request<Account | null>('/auth/session')
    },
    async signIn({ email, password }): Promise<AuthResult> {
      const result = await attempt(() => request<Account>('/auth/sign-in', { method: 'POST', body: { email, password } }))
      // The server decides which failures are worth naming; anything it rejects is
      // reported as bad credentials rather than leaking whether the address exists.
      return result.ok ? { ok: true, account: result.data } : { ok: false, error: 'credentials' }
    },
    async register({ name, email, password }): Promise<AuthResult> {
      try {
        const account = await request<Account>('/auth/register', { method: 'POST', body: { name, email, password } })
        return { ok: true, account }
      } catch (error) {
        console.warn('MoonSprite api: register failed.', error)
        return { ok: false, error: 'network' }
      }
    },
    async signOut(): Promise<void> {
      await attempt(() => request<void>('/auth/sign-out', { method: 'POST' }))
    },
    async updateName(name): Promise<AuthResult> {
      const result = await attempt(() => request<Account>('/auth/profile', { method: 'PATCH', body: { name } }))
      return result.ok ? { ok: true, account: result.data } : { ok: false, error: 'credentials' }
    },
    async updateEmail(email): Promise<AuthResult> {
      const result = await attempt(() => request<Account>('/auth/profile', { method: 'PATCH', body: { email } }))
      return result.ok ? { ok: true, account: result.data } : { ok: false, error: 'taken' }
    },
    async changePassword({ current, next }) {
      return await attempt(() => request<void>('/auth/password', { method: 'POST', body: { current, next } }))
    },
    async requestPasswordReset(email) {
      const result = await attempt(() => request<{ exists: boolean }>('/auth/password/reset', { method: 'POST', body: { email } }))
      // The server decides what to disclose; a real one always answers the same way.
      return { ok: true, exists: result.ok ? result.data.exists : false }
    },
    async verifyEmail(): Promise<AuthResult> {
      const result = await attempt(() => request<Account>('/auth/email/verify', { method: 'POST' }))
      return result.ok ? { ok: true, account: result.data } : { ok: false, error: 'network' }
    },
    async deleteAccount(): Promise<void> {
      await attempt(() => request<void>('/auth/account', { method: 'DELETE' }))
    },
  },
  orders: {
    async list(): Promise<Order[]> {
      return await request<Order[]>('/orders')
    },
    async create(lines: OrderLine[]) {
      return await attempt(() => request<Order>('/orders', { method: 'POST', body: { lines } }))
    },
    async all(): Promise<Order[]> {
      return await request<Order[]>('/studio/orders')
    },
  },
  catalogue: {
    /** Public and unauthenticated: this is what every visitor's market shows. */
    async all(): Promise<StudioProduct[]> {
      return await request<StudioProduct[]>('/catalogue')
    },
  },
  studio: {
    async products(): Promise<StudioProduct[]> {
      return await request<StudioProduct[]>('/studio/products')
    },
    async publish(input: PublishInput) {
      return await attempt(() => request<StudioProduct>('/studio/products', { method: 'POST', body: input }))
    },
    async update(id: string, input: PublishInput) {
      return await attempt(() => request<StudioProduct>(`/studio/products/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }))
    },
    async unpublish(id: string): Promise<void> {
      await attempt(() => request<void>(`/studio/products/${encodeURIComponent(id)}`, { method: 'DELETE' }))
    },
    async ledger(): Promise<Ledger> {
      return await request<Ledger>('/studio/ledger')
    },
    async platformFee(): Promise<number> {
      const result = await request<{ percent: number }>('/studio/settings')
      return result.percent
    },
    async setPlatformFee(percent: number): Promise<void> {
      await attempt(() => request<void>('/studio/settings', { method: 'PATCH', body: { platformFeePercent: percent } }))
    },
    async requestWithdrawal(amount: number, destination: string): Promise<ApiResult<Withdrawal>> {
      return await attempt(() => request<Withdrawal>('/studio/withdrawals', { method: 'POST', body: { amount, destination } }))
    },
    async setWithdrawalStatus(id: string, status: WithdrawalStatus, note?: string): Promise<void> {
      await attempt(() => request<void>(`/admin/withdrawals/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status, note } }))
    },
    async allWithdrawals(): Promise<Withdrawal[]> {
      return await request<Withdrawal[]>('/admin/withdrawals')
    },
  },
}
