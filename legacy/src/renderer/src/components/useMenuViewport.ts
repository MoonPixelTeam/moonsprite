import { useLayoutEffect, type RefObject } from 'react'

/** Measure only the open menu tree, including submenus revealed by hover/focus. */
export function useMenuViewport(rootRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const menus = Array.from(root.querySelectorAll<HTMLElement>('.menu-popover'))
    const place = (): void => {
      for (const menu of menus) {
        if (!menu.getClientRects().length) continue
        menu.style.left = ''
        menu.style.right = ''
        menu.style.top = ''
        let rect = menu.getBoundingClientRect()
        const parent = menu.parentElement
        if (menu.classList.contains('menu-submenu-popover') && parent && rect.right > window.innerWidth - 8) {
          menu.style.left = 'auto'
          menu.style.right = 'calc(100% - 2px)'
          rect = menu.getBoundingClientRect()
        }
        const shiftX = Math.max(8 - rect.left, Math.min(0, window.innerWidth - 8 - rect.right))
        if (shiftX !== 0 && parent) {
          menu.style.right = 'auto'
          menu.style.left = `${rect.left - parent.getBoundingClientRect().left + shiftX}px`
        }
        const shiftY = Math.max(8 - rect.top, Math.min(0, window.innerHeight - 8 - rect.bottom))
        if (shiftY !== 0 && parent) menu.style.top = `${rect.top - parent.getBoundingClientRect().top + shiftY}px`
      }
    }
    place()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    menus.forEach((menu) => observer?.observe(menu))
    window.addEventListener('resize', place)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', place)
    }
  })
}
