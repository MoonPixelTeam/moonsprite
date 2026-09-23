/*
 * The market cart. It lives in a context rather than on a page because the header shows
 * a cart button on every route, and any page can ask for the drawer to open.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { type MarketProduct } from './catalog'
import { readCart, writeCart } from '../api/bank'

export type Cart = {
  lines: { product: MarketProduct; quantity: number }[]
  count: number
  subtotal: number
  has: (id: string) => boolean
  add: (id: string) => void
  setQuantity: (id: string, quantity: number) => void
  remove: (id: string) => void
  clear: () => void
}

type CartStore = {
  cart: Cart
  /** Lets the header open the drawer on whatever page is showing one. */
  openCart: () => void
  /** Pages with a drawer register their opener here while they are mounted. */
  registerOpener: (open: (() => void) | null) => void
  hasOpener: boolean
}

const CartContext = createContext<CartStore | null>(null)

export function CartProvider({ children, products }: { children: ReactNode; products: MarketProduct[] }) {
  const [lines, setLines] = useState(readCart)
  const opener = useRef<(() => void) | null>(null)
  const [hasOpener, setHasOpener] = useState(false)

  useEffect(() => { writeCart(lines) }, [lines])

  const cart = useMemo<Cart>(() => {
    // Resolution runs against the live catalogue, so a studio pack someone bought stays
    // in the cart instead of vanishing because it is not in the built-in list.
    const resolved = lines
      .map((line) => ({ product: products.find((product) => product.id === line.id), quantity: line.quantity }))
      .filter((line): line is { product: MarketProduct; quantity: number } => Boolean(line.product))
    return {
      lines: resolved,
      count: resolved.reduce((total, line) => total + line.quantity, 0),
      subtotal: resolved.reduce((total, line) => total + line.product.price * line.quantity, 0),
      has: (id) => lines.some((line) => line.id === id),
      add: (id) => setLines((current) => current.some((line) => line.id === id) ? current : [...current, { id, quantity: 1 }]),
      setQuantity: (id, quantity) => setLines((current) => quantity < 1
        ? current.filter((line) => line.id !== id)
        : current.map((line) => line.id === id ? { ...line, quantity } : line)),
      remove: (id) => setLines((current) => current.filter((line) => line.id !== id)),
      clear: () => setLines([]),
    }
  }, [lines, products])

  const registerOpener = useCallback((open: (() => void) | null) => {
    opener.current = open
    setHasOpener(Boolean(open))
  }, [])

  const openCart = useCallback(() => {
    opener.current?.()
  }, [])

  const value = useMemo<CartStore>(
    () => ({ cart, openCart, registerOpener, hasOpener }),
    [cart, openCart, registerOpener, hasOpener],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCartStore(): CartStore {
  const store = useContext(CartContext)
  if (!store) throw new Error('useCartStore must be used inside CartProvider')
  return store
}

export function useCart(): Cart {
  return useCartStore().cart
}
