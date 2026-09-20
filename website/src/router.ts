import { useEffect, useState } from 'react'

export type Route = { page: 'home' | 'market' | 'docs' | 'faq' | 'blog' | 'account' | 'purchases' | 'studio' | 'studio-publish' | 'ui' | 'license' | 'receipt' | 'orders' | 'settings' | 'support' | 'settlement' | 'admin'; subId?: string }

export function parseHash(raw: string): Route {
  const hash = raw.replace(/^#/, '')
  if (hash.startsWith('/blog/')) return { page: 'blog', subId: hash.slice('/blog/'.length) }
  if (hash.startsWith('/docs/')) return { page: 'docs', subId: hash.slice('/docs/'.length) }
  if (hash.startsWith('/faq/')) return { page: 'faq', subId: hash.slice('/faq/'.length) }
  if (hash.startsWith('/market/')) return { page: 'market', subId: hash.slice('/market/'.length) }
  if (hash === '/docs') return { page: 'docs' }
  if (hash === '/faq') return { page: 'faq' }
  if (hash === '/blog') return { page: 'blog' }
  if (hash === '/market') return { page: 'market' }
  if (hash === '/license') return { page: 'license' }
  if (hash === '/receipt') return { page: 'receipt' }
  if (hash.startsWith('/orders/')) return { page: 'orders', subId: hash.slice('/orders/'.length) }
  if (hash === '/settings') return { page: 'settings' }
  if (hash === '/support') return { page: 'support' }
  if (hash === '/studio/settlement') return { page: 'settlement' }
  /* Staff console. Like the studio, it is not in the navigation. */
  if (hash === '/admin') return { page: 'admin' }
  if (hash === '/account') return { page: 'account' }
  if (hash === '/purchases') return { page: 'purchases' }
  /* The seller side. Deliberately absent from the navigation: only these hashes and the
     link on the account page lead here. The publish pages are checked first because they
     live under the same prefix; the trailing id opens that pack for editing. */
  if (hash.startsWith('/studio/publish/')) return { page: 'studio-publish', subId: hash.slice('/studio/publish/'.length) }
  if (hash === '/studio/publish') return { page: 'studio-publish' }
  if (hash === '/studio') return { page: 'studio' }
  /* The component library, rendered. Not in the navigation: it is a build-time reference. */
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
