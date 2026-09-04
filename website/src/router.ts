import { useEffect, useState } from 'react'

export type Route = { page: 'home' | 'docs' | 'faq' | 'blog'; subId?: string }

export function parseHash(raw: string): Route {
  const hash = raw.replace(/^#/, '')
  if (hash.startsWith('/blog/')) return { page: 'blog', subId: hash.slice('/blog/'.length) }
  if (hash.startsWith('/docs/')) return { page: 'docs', subId: hash.slice('/docs/'.length) }
  if (hash.startsWith('/faq/')) return { page: 'faq', subId: hash.slice('/faq/'.length) }
  if (hash === '/docs') return { page: 'docs' }
  if (hash === '/faq') return { page: 'faq' }
  if (hash === '/blog') return { page: 'blog' }
  return { page: 'home' }
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
