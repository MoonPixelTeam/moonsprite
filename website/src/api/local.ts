import type { Account, ApiClient, ApiResult, AuthResult, Ledger, Order, OrderLine, PublishInput, SaleLine, StudioProduct, Withdrawal } from './types'

/*
 * The prototype adapter: keeps everything in this browser's localStorage.
 *
 * This is what makes the flows work today without a server, and it is also the exact
 * behaviour a real backend has to reproduce. It is NOT safe for money — see the notice
 * rendered in the account and studio pages.
 */

const USERS_KEY = 'moonsprite-accounts'
const SESSION_KEY = 'moonsprite-session'
const STUDIO_KEY = 'moonsprite-studio'
const STUDIO_SESSION = 'moonsprite-studio-session'

type StoredAccount = Omit<Account, 'emailVerified'> & { hash: string; verified?: boolean }
type Database = { accounts: StoredAccount[]; orders: Record<string, Order[]> }
type StudioDatabase = { products: StudioProduct[]; withdrawals: Withdrawal[]; platformFeePercent: number }

const EMPTY_DATABASE: Database = { accounts: [], orders: {} }
const DEFAULT_STUDIO: StudioDatabase = { products: [], withdrawals: [], platformFeePercent: 8 }

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as T
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch (error) {
    console.warn(`MoonSprite api: could not read ${key}.`, error)
    return fallback
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    // Orders and studio data feed the revenue numbers, so listeners get told.
    window.dispatchEvent(new Event('moonsprite:data'))
    return true
  } catch (error) {
    console.warn(`MoonSprite api: could not write ${key}.`, error)
    return false
  }
}

function readUsers(): Database {
  const raw = read<Partial<Database>>(USERS_KEY, EMPTY_DATABASE)
  return {
    accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
    orders: raw.orders && typeof raw.orders === 'object' ? raw.orders : {},
  }
}

function readStudio(): StudioDatabase {
  const raw = read<Partial<StudioDatabase>>(STUDIO_KEY, DEFAULT_STUDIO)
  return {
    products: Array.isArray(raw.products) ? raw.products : [],
    withdrawals: Array.isArray(raw.withdrawals) ? raw.withdrawals : [],
    platformFeePercent: typeof raw.platformFeePercent === 'number' ? raw.platformFeePercent : 8,
  }
}

function sessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

function publicAccount(stored: StoredAccount): Account {
  const { hash: _hash, verified, ...rest } = stored
  void _hash
  return { ...rest, emailVerified: verified === true }
}

/** Turns a password into a digest. Runs in the page, so it only hides it from a glance;
 *  a real server must do this. */
async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(`moonsprite:${value}`)
  try {
    const hashed = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(hashed)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
  } catch {
    let mixed = 0
    for (const byte of bytes) mixed = (mixed * 31 + byte) >>> 0
    return `fallback-${mixed.toString(16)}`
  }
}

function id(prefix: string, length = 6): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 2 + length)}`
}

function salesFor(products: StudioProduct[], orders: Order[]): SaleLine[] {
  const owned = new Set(products.map((item) => item.id))
  const lines: SaleLine[] = []
  for (const order of orders) {
    for (const line of order.lines) {
      if (!owned.has(line.id)) continue
      lines.push({
        orderId: order.id,
        createdAt: order.createdAt,
        productId: line.id,
        name: line.name,
        quantity: line.quantity,
        gross: line.price * line.quantity,
      })
    }
  }
  return lines.sort((a, b) => b.createdAt - a.createdAt)
}

/** Latency keeps callers honest about awaiting; zero in tests. */
const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

export const localAdapter: ApiClient = {
  auth: {
    async current() {
      await delay()
      const found = readUsers().accounts.find((entry) => entry.id === sessionId())
      return found ? publicAccount(found) : null
    },
    async signIn({ email, password }) {
      await delay()
      const normalized = email.trim().toLowerCase()
      const database = readUsers()
      const found = database.accounts.find((entry) => entry.email === normalized)
      // One message for both failures: naming the wrong half would confirm whether an
      // address has an account here.
      if (!found || found.hash !== await digest(password)) return { ok: false, error: 'credentials' } satisfies AuthResult
      try {
        localStorage.setItem(SESSION_KEY, found.id)
      } catch (error) {
        console.warn('MoonSprite api: could not start a session.', error)
      }
      return { ok: true, account: publicAccount(found) } satisfies AuthResult
    },
    async register({ name, email, password }) {
      await delay()
      const normalized = email.trim().toLowerCase()
      if (name.trim().length < 2) return { ok: false, error: 'name' } satisfies AuthResult
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return { ok: false, error: 'email' } satisfies AuthResult
      if (password.length < 8) return { ok: false, error: 'password' } satisfies AuthResult
      const database = readUsers()
      if (database.accounts.some((entry) => entry.email === normalized)) return { ok: false, error: 'exists' } satisfies AuthResult
      const created: StoredAccount = {
        id: id('acc'),
        name: name.trim(),
        email: normalized,
        hash: await digest(password),
        createdAt: Date.now(),
        verified: false,
      }
      write(USERS_KEY, { accounts: [...database.accounts, created], orders: database.orders })
      try {
        localStorage.setItem(SESSION_KEY, created.id)
      } catch (error) {
        console.warn('MoonSprite api: could not start a session.', error)
      }
      return { ok: true, account: publicAccount(created) } satisfies AuthResult
    },
    async signOut() {
      await delay()
      try {
        localStorage.removeItem(SESSION_KEY)
      } catch (error) {
        console.warn('MoonSprite api: could not end the session.', error)
      }
    },
    async updateName(name) {
      await delay()
      const me = readUsers().accounts.find((entry) => entry.id === sessionId())
      if (!me) return { ok: false, error: 'unauthenticated' }
      if (name.trim().length < 2) return { ok: false, error: 'name' }
      const database = readUsers()
      const next = { ...me, name: name.trim() }
      write(USERS_KEY, { ...database, accounts: database.accounts.map((entry) => entry.id === me.id ? next : entry) })
      return { ok: true, account: publicAccount(next) }
    },
    async updateEmail(email) {
      await delay()
      const me = readUsers().accounts.find((entry) => entry.id === sessionId())
      if (!me) return { ok: false, error: 'unauthenticated' }
      const normalized = email.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return { ok: false, error: 'email' }
      const database = readUsers()
      if (database.accounts.some((entry) => entry.email === normalized && entry.id !== me.id)) return { ok: false, error: 'taken' }
      // A new address is unverified until it is confirmed again.
      const next = { ...me, email: normalized, verified: false }
      write(USERS_KEY, { ...database, accounts: database.accounts.map((entry) => entry.id === me.id ? next : entry) })
      return { ok: true, account: publicAccount(next) }
    },
    async changePassword({ current, next }) {
      await delay()
      const me = readUsers().accounts.find((entry) => entry.id === sessionId())
      if (!me) return { ok: false, error: 'unauthenticated' }
      if (me.hash !== await digest(current)) return { ok: false, error: 'current' }
      if (current === next) return { ok: false, error: 'same' }
      if (next.length < 8) return { ok: false, error: 'password' }
      const database = readUsers()
      const updated = { ...me, hash: await digest(next) }
      write(USERS_KEY, { ...database, accounts: database.accounts.map((entry) => entry.id === me.id ? updated : entry) })
      return { ok: true }
    },
    async requestPasswordReset(email) {
      await delay()
      const normalized = email.trim().toLowerCase()
      return { ok: true, exists: readUsers().accounts.some((entry) => entry.email === normalized) }
    },
    async verifyEmail() {
      await delay()
      const me = readUsers().accounts.find((entry) => entry.id === sessionId())
      if (!me) return { ok: false, error: 'unauthenticated' }
      const database = readUsers()
      const next = { ...me, verified: true }
      write(USERS_KEY, { ...database, accounts: database.accounts.map((entry) => entry.id === me.id ? next : entry) })
      return { ok: true, account: publicAccount(next) }
    },
    async deleteAccount() {
      await delay()
      const me = sessionId()
      if (!me) return
      const database = readUsers()
      const { [me]: _orders, ...rest } = database.orders
      void _orders
      write(USERS_KEY, { accounts: database.accounts.filter((entry) => entry.id !== me), orders: rest })
      try {
        localStorage.removeItem(SESSION_KEY)
      } catch (error) {
        console.warn('MoonSprite api: could not end the session.', error)
      }
    },
  },

  orders: {
    async list() {
      await delay()
      const me = sessionId()
      if (!me) return []
      return readUsers().orders[me] ?? []
    },
    async create(lines): Promise<ApiResult<Order>> {
      await delay()
      const me = sessionId()
      if (!me) return { ok: false, error: 'unauthenticated' }
      if (lines.length === 0) return { ok: false, error: 'empty' }
      const database = readUsers()
      const order: Order = {
        id: id('ord', 4),
        createdAt: Date.now(),
        total: lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
        lines,
      }
      const next: Database = { accounts: database.accounts, orders: { ...database.orders, [me]: [order, ...(database.orders[me] ?? [])] } }
      if (!write(USERS_KEY, next)) return { ok: false, error: 'storage' }
      return { ok: true, data: order }
    },
    async all() {
      await delay()
      return Object.values(readUsers().orders).flat().sort((a, b) => b.createdAt - a.createdAt)
    },
  },

  catalogue: {
    /** A published pack is buyable, so the market reads from the same studio products. */
    async all() {
      await delay()
      return readStudio().products
    },
  },

  studio: {
    async products() {
      await delay()
      return readStudio().products
    },
    async publish(input: PublishInput): Promise<ApiResult<StudioProduct>> {
      await delay()
      if (input.name.zh.trim().length < 2 && input.name.en.trim().length < 2) return { ok: false, error: 'name' }
      if (!Number.isFinite(input.price) || input.price < 0) return { ok: false, error: 'price' }
      const database = readStudio()
      const product: StudioProduct = { ...input, id: id('pack', 4), publishedAt: Date.now() }
      if (!write(STUDIO_KEY, { ...database, products: [product, ...database.products] })) return { ok: false, error: 'storage' }
      return { ok: true, data: product }
    },
    async update(target, input: PublishInput): Promise<ApiResult<StudioProduct>> {
      await delay()
      if (input.name.zh.trim().length < 2 && input.name.en.trim().length < 2) return { ok: false, error: 'name' }
      if (!Number.isFinite(input.price) || input.price < 0) return { ok: false, error: 'price' }
      const database = readStudio()
      const existing = database.products.find((item) => item.id === target)
      if (!existing) return { ok: false, error: 'missing' }
      // The publish date is the listing's history, so an edit keeps it.
      const next: StudioProduct = { ...input, id: existing.id, publishedAt: existing.publishedAt }
      if (!write(STUDIO_KEY, { ...database, products: database.products.map((item) => item.id === target ? next : item) })) {
        return { ok: false, error: 'storage' }
      }
      return { ok: true, data: next }
    },
    async unpublish(target) {
      await delay()
      const database = readStudio()
      write(STUDIO_KEY, { ...database, products: database.products.filter((item) => item.id !== target) })
    },
    async ledger(): Promise<Ledger> {
      await delay()
      const database = readStudio()
      const orders = Object.values(readUsers().orders).flat()
      const sales = salesFor(database.products, orders)
      const gross = sales.reduce((sum, line) => sum + line.gross, 0)
      const platformFee = Math.round(gross * database.platformFeePercent / 100)
      const net = gross - platformFee
      const withdrawn = database.withdrawals.reduce((sum, item) => sum + item.amount, 0)
      return { gross, platformFee, net, withdrawn, available: net - withdrawn, sales, withdrawals: database.withdrawals }
    },
    async platformFee() {
      await delay()
      return readStudio().platformFeePercent
    },
    async setPlatformFee(percent) {
      await delay()
      const clamped = Math.min(60, Math.max(0, Math.round(percent)))
      const database = readStudio()
      write(STUDIO_KEY, { ...database, platformFeePercent: clamped })
    },
    async requestWithdrawal(amount, destination): Promise<ApiResult<Withdrawal>> {
      await delay()
      const database = readStudio()
      const orders = Object.values(readUsers().orders).flat()
      const sales = salesFor(database.products, orders)
      const gross = sales.reduce((sum, line) => sum + line.gross, 0)
      const net = gross - Math.round(gross * database.platformFeePercent / 100)
      const available = net - database.withdrawals.reduce((sum, item) => sum + item.amount, 0)
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'amount' }
      if (amount > available) return { ok: false, error: 'insufficient' }
      if (destination.trim().length < 4) return { ok: false, error: 'destination' }
      const withdrawal: Withdrawal = {
        id: id('wd', 4),
        amount: Math.round(amount),
        status: 'requested',
        requestedAt: Date.now(),
        destination: destination.trim(),
      }
      if (!write(STUDIO_KEY, { ...database, withdrawals: [withdrawal, ...database.withdrawals] })) return { ok: false, error: 'storage' }
      return { ok: true, data: withdrawal }
    },
    async setWithdrawalStatus(target, status, note) {
      await delay()
      const database = readStudio()
      const next: StudioDatabase = {
        ...database,
        withdrawals: database.withdrawals.map((item) => item.id === target
          ? { ...item, status, note, decidedAt: Date.now() }
          : item),
      }
      write(STUDIO_KEY, next)
    },
    async allWithdrawals() {
      await delay()
      return readStudio().withdrawals
    },
  },
}

/** The studio gate is a prototype passphrase, kept here so it can be swapped for a
 *  server-side creator check in one place. */
export const STUDIO_PASSPHRASE = 'studio'

export function readStudioUnlocked(): boolean {
  try {
    return localStorage.getItem(STUDIO_SESSION) === '1'
  } catch {
    return false
  }
}

export function writeStudioUnlocked(value: boolean): void {
  try {
    if (value) localStorage.setItem(STUDIO_SESSION, '1')
    else localStorage.removeItem(STUDIO_SESSION)
  } catch (error) {
    console.warn('MoonSprite api: could not persist the studio session.', error)
  }
}

/** Orders changed somewhere in this tab. */
export function notifyOrdersChanged(): void {
  window.dispatchEvent(new Event('moonsprite:data'))
}
