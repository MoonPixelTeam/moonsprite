import { useEffect, useState } from 'react'

export type Route = { page: 'competitions' | 'login' | 'register' | 'home' | 'market' | 'docs' | 'faq' | 'blog' | 'account' | 'purchases' | 'studio' | 'studio-publish' | 'studio-sales-order' | 'ui' | 'license' | 'privacy' | 'receipt' | 'orders' | 'settings' | 'support' | 'settlement' | 'admin'; subId?: string; returnTo?: string }

export function isWorkspaceRoute(route: Route): boolean {
  return ['account', 'purchases', 'studio', 'studio-publish', 'studio-sales-order', 'receipt', 'orders', 'settings', 'support', 'settlement', 'admin'].includes(route.page)
}

export function parseHash(raw: string): Route {
  const hash = raw.replace(/^#/, '')
  const [authPath, query = ''] = hash.split('?')
  if (authPath === '/login' || authPath === '/register') return { page: authPath.slice(1) as 'login' | 'register', returnTo: safeReturnTo(new URLSearchParams(query).get('returnTo')) }
  if (hash.startsWith('/blog/')) return { page: 'blog', subId: hash.slice('/blog/'.length) }
  if (hash.startsWith('/docs/')) return { page: 'docs', subId: hash.slice('/docs/'.length) }
  if (hash.startsWith('/faq/')) return { page: 'faq', subId: hash.slice('/faq/'.length) }
  if (hash.startsWith('/market/')) return { page: 'market', subId: hash.slice('/market/'.length) }
  if (hash === '/competitions') return { page: 'competitions' }
  if (hash === '/docs') return { page: 'docs' }
  if (hash === '/faq') return { page: 'faq' }
  if (hash === '/blog') return { page: 'blog' }
  if (hash === '/market') return { page: 'market' }
  if (hash === '/privacy') return { page: 'privacy' }
  if (hash === '/license') return { page: 'license' }
  if (hash === '/receipt') return { page: 'receipt' }
  if (hash.startsWith('/orders/')) return { page: 'orders', subId: hash.slice('/orders/'.length) }
  if (hash === '/settings') return { page: 'settings' }
  if (hash === '/support') return { page: 'support' }
  if (hash === '/studio/settlement') return { page: 'settlement' }
  if (hash.startsWith('/studio/sales/')) return { page: 'studio-sales-order', subId: hash.slice('/studio/sales/'.length) }
  /* Staff console. Like the studio, it is not in the navigation. */
  if (['/admin/listings', '/admin/tickets', '/admin/reports', '/admin/payouts', '/admin/settings'].includes(hash)) return { page: 'admin', subId: hash.slice('/admin/'.length) }
  if (hash === '/admin') return { page: 'admin' }
  if (hash === '/account') return { page: 'account' }
  if (hash === '/purchases') return { page: 'purchases' }
  /* The seller side. Deliberately absent from the navigation: only these hashes and the
     link on the account page lead here. The publish pages are checked first because they
     live under the same prefix; the trailing id opens that pack for editing. */
  if (hash.startsWith('/studio/publish/')) return { page: 'studio-publish', subId: hash.slice('/studio/publish/'.length) }
  if (hash === '/studio/publish') return { page: 'studio-publish' }
  if (hash === '/studio/products') return { page: 'studio', subId: 'products' }
  if (hash === '/studio/sales') return { page: 'studio', subId: 'sales' }
  if (hash === '/studio') return { page: 'studio' }
  /* Live component gallery, linked from the footer documentation group. */
  if (hash === '/ui') return { page: 'ui' }
  return { page: 'home' }
}

/** Hash for one pack's detail page, used by cards, the shelf, and the cart. */
export function marketPackHash(id: string): string {
  return `#/market/${id}`
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return route
}

export function navigate(hash: string) {
  if (window.location.hash === hash) return
  window.location.hash = hash
}

/** Only internal task routes can be authentication return destinations. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !/^#\/(account|purchases|settings|support|studio|admin|orders|receipt|market|license)(?:\/[^?#]*)?$/.test(value)) return '#/account'
  return value
}
export function authHash(mode: 'login' | 'register', returnTo?: string): string {
  return `#/${mode}?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`
}
export function routeHash(route: Route): string {
  const base = route.page === 'studio-publish' ? 'studio/publish' : route.page === 'studio-sales-order' ? 'studio/sales' : route.page === 'settlement' ? 'studio/settlement' : route.page
  return `#/${base}${route.subId ? `/${route.subId}` : ''}`
}
