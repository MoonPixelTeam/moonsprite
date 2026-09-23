/*
 * State the page owns rather than the account or the studio: the cart and the chosen
 * language. These are browser preferences, not records, so they stay local by design and
 * live behind this module instead of being read from raw storage keys in components.
 */

const CART_KEY = 'moonsprite-market-cart'
const LANGUAGE_KEY = 'moonsprite-language'

export type CartLine = { id: string; quantity: number }
export type Language2 = 'zh' | 'en'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch (error) {
    console.warn(`MoonSprite bank: could not read ${key}.`, error)
    return fallback
  }
}

export function readCart(): CartLine[] {
  const parsed = readJson<unknown>(CART_KEY, [])
  if (!Array.isArray(parsed)) return []
  return parsed.filter((line): line is CartLine => {
    if (typeof line !== 'object' || line === null) return false
    const candidate = line as Partial<CartLine>
    return typeof candidate.id === 'string' && typeof candidate.quantity === 'number' && candidate.quantity > 0
  })
}

export function writeCart(lines: CartLine[]): void {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(lines))
  } catch (error) {
    console.warn('MoonSprite bank: cart could not be saved for this session.', error)
  }
}

export function readLanguage(): Language2 | null {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY)
    return saved === 'zh' || saved === 'en' ? saved : null
  } catch {
    return null
  }
}

export function writeLanguage(value: Language2): void {
  try {
    localStorage.setItem(LANGUAGE_KEY, value)
  } catch (error) {
    console.warn('MoonSprite bank: language preference could not be saved.', error)
  }
}
