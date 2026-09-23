import type { Language } from '../content'
import { USD_TO_CNY } from '../market/catalog'
/** Existing ledger amounts are whole USD, not yuan or cents. */
export function prepareWithdrawal(text: string, accountText: string, nameText: string, available: number, language: Language = 'en') {
  const input = Number(text)
  const cents = Math.round(input * 100)
  const unit = language === 'zh' ? Math.round(USD_TO_CNY * 100) : 100
  if (!/^\d+(?:\.\d{1,2})?$/.test(text.trim()) || !Number.isSafeInteger(cents) || cents <= 0 || cents % unit !== 0) return { ok: false, error: 'amount' } as const
  const amount = cents / unit
  if (amount > available) return { ok: false, error: 'insufficient' } as const
  const account = accountText.trim(), name = nameText.trim()
  if (account.length > 64 || !(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account) || /^\+?\d[\d -]{5,19}\d$/.test(account))) return { ok: false, error: 'account' } as const
  if (!name || name.length > 40 || /[\r\n]/.test(name)) return { ok: false, error: 'holder' } as const
  return { ok: true, amount, destination: `Alipay ${account} (${name})` } as const
}
