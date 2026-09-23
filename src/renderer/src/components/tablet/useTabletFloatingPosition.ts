import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'

const controls = 'button, input, select, textarea, a, [role="button"], .ui-field, .segmented-control, .moon-tooltip-anchor'

/** Canvas-local placement: resizing the bottom dock can never put this panel over it. */
export function useTabletFloatingPosition(side: 'left' | 'right', active: boolean) {
  const ref = useRef<HTMLElement>(null)
  const position = useRef<{ x: number; y: number } | null>(null)
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; scaleX: number; scaleY: number; width: number; height: number; direction: string; originalWidth: string; originalHeight: string; original: { x: number; y: number } | null } | null>(null)
  const place = (point: { x: number; y: number }) => {
    const panel = ref.current, host = panel?.parentElement
    if (!panel || !host) return
    const margin = parseFloat(getComputedStyle(host).getPropertyValue('--ui-space-4')) || 8
    const next = {
      x: Math.max(margin, Math.min(point.x, host.clientWidth - panel.offsetWidth - margin)),
      y: Math.max(margin, Math.min(point.y, host.clientHeight - panel.offsetHeight - margin))
    }
    position.current = next
    panel.style.left = `${next.x}px`; panel.style.top = `${next.y}px`; panel.style.right = 'auto'
  }
  const end = (cancel = false) => {
    const current = drag.current, panel = ref.current
    drag.current = null
    if (!current || !panel) return
    if (!current.direction) document.documentElement.classList.remove('floating-panel-dragging')
    delete panel.dataset.dragging
    delete panel.dataset.resizing
    if (cancel) {
      panel.style.width = current.originalWidth
      panel.style.setProperty('--tablet-panel-height', current.originalHeight)
      if (!current.originalHeight) delete panel.dataset.sized
      if (current.original) place(current.original)
      else { position.current = null; panel.style.removeProperty('left'); panel.style.removeProperty('top'); panel.style.removeProperty('right') }
    }
    if (panel.hasPointerCapture(current.id)) panel.releasePointerCapture(current.id)
  }
  useLayoutEffect(() => {
    end()
    position.current = null
    const panel = ref.current, host = panel?.parentElement
    if (!panel || !host) return
    panel.style.removeProperty('left'); panel.style.removeProperty('top'); panel.style.removeProperty('right')
    const resize = () => { if (!drag.current && position.current) place(position.current) }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    observer?.observe(host); observer?.observe(panel)
    const cancel = () => end(true)
    window.addEventListener('blur', cancel)
    window.addEventListener('resize', resize)
    return () => { end(); observer?.disconnect(); window.removeEventListener('blur', cancel); window.removeEventListener('resize', resize) }
  }, [side, active])
  return {
    ref,
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || drag.current || !(event.target instanceof Element) || event.target.closest(controls)) return
      const panel = ref.current, host = panel?.parentElement
      if (!panel || !host) return
      const bounds = panel.getBoundingClientRect(), area = host.getBoundingClientRect()
      const scaleX = area.width > 0 ? host.clientWidth / area.width : 1
      const scaleY = area.height > 0 ? host.clientHeight / area.height : 1
      const handle = event.target.closest('.floating-resize-handle')
      const direction = handle ? [...handle.classList].find(name => /^resize-[nsew]{1,2}$/.test(name))?.slice(7) ?? '' : ''
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: (bounds.left - area.left) * scaleX, top: (bounds.top - area.top) * scaleY, scaleX, scaleY, width: panel.offsetWidth, height: panel.offsetHeight, direction, originalWidth: panel.style.width, originalHeight: panel.style.getPropertyValue('--tablet-panel-height'), original: position.current }
      panel.setPointerCapture(event.pointerId)
      if (direction) panel.dataset.resizing = direction
      else { panel.dataset.dragging = 'true'; document.documentElement.classList.add('floating-panel-dragging') }
      event.preventDefault(); event.stopPropagation()
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const current = drag.current
      if (!current || current.id !== event.pointerId) return
      const dx = (event.clientX - current.x) * current.scaleX, dy = (event.clientY - current.y) * current.scaleY
      const panel = ref.current, host = panel?.parentElement
      if (current.direction && panel && host) {
        const margin = parseFloat(getComputedStyle(host).getPropertyValue('--ui-space-4')) || 8
        const minWidth = Math.min(180, Math.max(1, host.clientWidth - margin * 2))
        const minHeight = Math.min(120, Math.max(1, host.clientHeight - margin * 2))
        let left = current.left, top = current.top, right = left + current.width, bottom = top + current.height
        if (current.direction.includes('w')) left = Math.max(margin, Math.min(right - minWidth, left + dx))
        if (current.direction.includes('e')) right = Math.min(host.clientWidth - margin, Math.max(left + minWidth, right + dx))
        if (current.direction.includes('n')) top = Math.max(margin, Math.min(bottom - minHeight, top + dy))
        if (current.direction.includes('s')) bottom = Math.min(host.clientHeight - margin, Math.max(top + minHeight, bottom + dy))
        panel.style.width = `${right - left}px`
        panel.style.setProperty('--tablet-panel-height', `${bottom - top}px`)
        panel.dataset.sized = 'true'
        place({ x: left, y: top })
      } else place({ x: current.left + dx, y: current.top + dy })
      event.preventDefault(); event.stopPropagation()
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => { if (drag.current?.id === event.pointerId) end() },
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => { if (drag.current?.id === event.pointerId) end(true) },
    onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => { if (drag.current?.id === event.pointerId) end(true) }
  }
}
