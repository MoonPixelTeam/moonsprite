/*
 * Data layer for the flows being added.
 *
 * Same prototype boundary as the rest of src/api: everything lives in this browser, and
 * every method is async so a real server can take over without the pages changing.
 *
 * Ownership is derived from order history rather than stored separately — one source of
 * truth means "you own it" can never disagree with "you bought it".
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/** A payout destination stored by the seller. */
export type PayoutMethod = {
  id: string
  kind: string
  account: string
  holder: string
  isDefault: boolean
  addedAt: number
}

export type WithdrawalStatus = 'requested' | 'approved' | 'paid' | 'rejected'

/** A support ticket. Software questions go to Discussions; these are order problems. */
export type Ticket = {
  id: string
  subject: string
  message: string
  orderId?: string
  status: 'open' | 'answered'
  createdAt: number
}

export type ReportReason = 'copyright' | 'broken' | 'misleading' | 'other'

export type Report = {
  id: string
  productId: string
  productName: string
  reason: ReportReason
  detail: string
  reporterId?: string
  status: 'open' | 'resolved'
  createdAt: number
}

/**
 * A listing's review state. A pack is only on sale once approved, so the market cannot be
 * filled by a publish button alone.
 */
export type ListingStatus = 'pending' | 'approved' | 'rejected'

export type SupportStore = {
  tickets: Ticket[]
  openTicket: (input: { subject: string; message: string; orderId?: string }) => Promise<{ ok: true } | { ok: false; error: string }>
}

export type ModerationStore = {
  reports: Report[]
  fileReport: (input: { productId: string; productName: string; reason: ReportReason; detail: string }) => Promise<{ ok: true } | { ok: false; error: string }>
  resolveReport: (id: string) => Promise<void>
  statusOf: (productId: string) => ListingStatus
  setStatus: (productId: string, status: ListingStatus, reason?: string) => Promise<void>
  rejectionReason: (productId: string) => string | undefined
}

//
// Storage keys and shapes
//

const SUPPORT_KEY = 'moonsprite-support'
const MODERATION_KEY = 'moonsprite-moderation'
const PAYOUT_KEY = 'moonsprite-payout-methods'

type SupportDatabase = { tickets: Ticket[] }
type ModerationDatabase = { statuses: Record<string, { status: ListingStatus; reason?: string; at: number }>; reports: Report[] }
type PayoutDatabase = { methods: PayoutMethod[] }

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as T
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch (error) {
    console.warn(`MoonSprite data: could not read ${key}.`, error)
    return fallback
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    window.dispatchEvent(new Event('moonsprite:data'))
    return true
  } catch (error) {
    console.warn(`MoonSprite data: could not write ${key}.`, error)
    return false
  }
}

const id = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Fires whenever any of the added stores change, so the UI can refresh. */
export const DATA_EVENT = 'moonsprite:data'

//
// Support tickets
//

export function readTickets(): Ticket[] {
  return read<SupportDatabase>(SUPPORT_KEY, { tickets: [] }).tickets
}

export async function openTicket(input: { subject: string; message: string; orderId?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.subject.trim().length < 3) return { ok: false, error: 'subject' }
  if (input.message.trim().length < 10) return { ok: false, error: 'message' }
  const database = read<SupportDatabase>(SUPPORT_KEY, { tickets: [] })
  const ticket: Ticket = {
    id: id('tkt'),
    subject: input.subject.trim(),
    message: input.message.trim(),
    orderId: input.orderId,
    status: 'open',
    createdAt: Date.now(),
  }
  if (!write(SUPPORT_KEY, { tickets: [ticket, ...database.tickets] })) return { ok: false, error: 'storage' }
  return { ok: true }
}

//
// Listing review and reports
//

export function readModeration(): ModerationDatabase {
  const raw = read<Partial<ModerationDatabase>>(MODERATION_KEY, { statuses: {}, reports: [] })
  return {
    statuses: raw.statuses && typeof raw.statuses === 'object' ? raw.statuses : {},
    reports: Array.isArray(raw.reports) ? raw.reports : [],
  }
}

/**
 * A listing with no record is pending, not approved: publishing puts a pack in the review
 * queue rather than on sale.
 */
export function listingStatusOf(productId: string): ListingStatus {
  return readModeration().statuses[productId]?.status ?? 'pending'
}

export function listingRejectionReason(productId: string): string | undefined {
  return readModeration().statuses[productId]?.reason
}

export async function setListingStatus(productId: string, status: ListingStatus, reason?: string): Promise<void> {
  const database = readModeration()
  write(MODERATION_KEY, {
    ...database,
    statuses: { ...database.statuses, [productId]: { status, reason, at: Date.now() } },
  })
}

export async function fileReport(input: { productId: string; productName: string; reason: ReportReason; detail: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.reason) return { ok: false, error: 'reason' }
  const database = readModeration()
  const report: Report = {
    id: id('rpt'),
    productId: input.productId,
    productName: input.productName,
    reason: input.reason,
    detail: input.detail.trim(),
    status: 'open',
    createdAt: Date.now(),
  }
  if (!write(MODERATION_KEY, { ...database, reports: [report, ...database.reports] })) return { ok: false, error: 'storage' }
  return { ok: true }
}

export async function resolveReport(reportId: string): Promise<void> {
  const database = readModeration()
  write(MODERATION_KEY, {
    ...database,
    reports: database.reports.map((item) => item.id === reportId ? { ...item, status: 'resolved' } : item),
  })
}

//
// Payout methods
//

export function readPayoutMethods(): PayoutMethod[] {
  const methods = read<PayoutDatabase>(PAYOUT_KEY, { methods: [] }).methods
  return Array.isArray(methods) ? methods : []
}

export async function addPayoutMethod(input: { kind: string; account: string; holder: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.kind.trim()) return { ok: false, error: 'kind' }
  if (input.account.trim().length < 4) return { ok: false, error: 'account' }
  if (input.holder.trim().length < 2) return { ok: false, error: 'holder' }
  const database = read<PayoutDatabase>(PAYOUT_KEY, { methods: [] })
  const method: PayoutMethod = {
    id: id('pm'),
    kind: input.kind.trim(),
    account: input.account.trim(),
    holder: input.holder.trim(),
    // The first method added becomes the default, so a seller can withdraw immediately.
    isDefault: database.methods.length === 0,
    addedAt: Date.now(),
  }
  if (!write(PAYOUT_KEY, { methods: [method, ...database.methods] })) return { ok: false, error: 'storage' }
  return { ok: true }
}

export async function removePayoutMethod(methodId: string): Promise<void> {
  const database = read<PayoutDatabase>(PAYOUT_KEY, { methods: [] })
  const left = database.methods.filter((item) => item.id !== methodId)
  // Removing the default promotes another, so there is never none while others remain.
  if (left.length > 0 && !left.some((item) => item.isDefault)) left[0] = { ...left[0], isDefault: true }
  write(PAYOUT_KEY, { methods: left })
}

export async function setDefaultPayoutMethod(methodId: string): Promise<void> {
  const database = read<PayoutDatabase>(PAYOUT_KEY, { methods: [] })
  write(PAYOUT_KEY, { methods: database.methods.map((item) => ({ ...item, isDefault: item.id === methodId })) })
}

/** Masks all but the last four characters, which is all a UI should ever show. */
export function maskAccount(account: string): string {
  const tail = account.slice(-4)
  return `${'•'.repeat(Math.max(4, account.length - 4))}${tail}`
}

//
// React providers
//

type DataStore = SupportStore & ModerationStore & {
  payoutMethods: PayoutMethod[]
  addPayoutMethod: typeof addPayoutMethod
  removePayoutMethod: typeof removePayoutMethod
  setDefaultPayoutMethod: typeof setDefaultPayoutMethod
  version: number
}

const DataContext = createContext<DataStore | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0)
  const [tickets, setTickets] = useState<Ticket[]>(readTickets)
  const [reports, setReports] = useState<Report[]>(() => readModeration().reports)
  const [payoutMethods, setPayoutMethods] = useState<PayoutMethod[]>(readPayoutMethods)

  const refresh = useCallback(() => {
    setTickets(readTickets())
    setReports(readModeration().reports)
    setPayoutMethods(readPayoutMethods())
    setVersion((value) => value + 1)
  }, [])

  useEffect(() => {
    window.addEventListener(DATA_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(DATA_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [refresh])

  const value = useMemo<DataStore>(() => ({
    tickets,
    openTicket: async (input) => {
      const result = await openTicket(input)
      refresh()
      return result
    },
    reports,
    fileReport: async (input) => {
      const result = await fileReport(input)
      refresh()
      return result
    },
    resolveReport: async (reportId) => {
      await resolveReport(reportId)
      refresh()
    },
    statusOf: listingStatusOf,
    setStatus: async (productId, status, reason) => {
      await setListingStatus(productId, status, reason)
      refresh()
    },
    rejectionReason: listingRejectionReason,
    payoutMethods,
    addPayoutMethod: async (input) => {
      const result = await addPayoutMethod(input)
      refresh()
      return result
    },
    removePayoutMethod: async (methodId) => {
      await removePayoutMethod(methodId)
      refresh()
    },
    setDefaultPayoutMethod: async (methodId) => {
      await setDefaultPayoutMethod(methodId)
      refresh()
    },
    version,
  }), [tickets, reports, payoutMethods, refresh, version])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataStore {
  const store = useContext(DataContext)
  if (!store) throw new Error('useData must be used inside DataProvider')
  return store
}
