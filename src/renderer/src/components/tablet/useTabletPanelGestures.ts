import { useEffect } from 'react'
import { useWorkspace } from '@/store/workspace'
import { tabletPanelMode, tabletFeedback } from '@/core/tablet-interaction'

const selector = '[data-palette-id], [data-animation-frame-id], [data-animation-cel-key], button[data-layer-id], button[data-group-id]'
/** In browse mode, native scroll owns movement; only stationary release selects. */
export function useTabletPanelGestures(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let touch: { id: number; element: HTMLElement; x: number; y: number; moved: boolean; held: boolean } | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let suppress: { element: HTMLElement; until: number } | null = null
    const ignored = new Set<number>()
    const clear = () => { clearTimeout(timer); touch = null; ignored.clear() }
    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || tabletPanelMode() === 'move') return
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null
      if (!target || !target.closest('.panel')) return
      if (event.target instanceof Element && event.target.closest('input, [role="button"], .layer-visibility, .layer-lock, [data-tablet-drag-handle]')) return
      if (touch) { touch.moved = true; clearTimeout(timer); ignored.add(event.pointerId); event.stopPropagation(); return }
      touch = { id: event.pointerId, element: target, x: event.clientX, y: event.clientY, moved: false, held: false }
      timer = setTimeout(() => {
        if (!touch || touch.moved) return
        touch.held = true
        tabletFeedback('')
        target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: touch.x, clientY: touch.y, button: 2 }))
      }, 450)
      event.stopPropagation()
    }
    const move = (event: PointerEvent) => {
      if (ignored.has(event.pointerId)) { event.stopPropagation(); return }
      if (!touch || touch.id !== event.pointerId) return
      if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 8) { touch.moved = true; clearTimeout(timer) }
      event.stopPropagation()
    }
    const up = (event: PointerEvent) => {
      if (ignored.delete(event.pointerId)) { event.stopPropagation(); event.preventDefault(); return }
      if (!touch || touch.id !== event.pointerId) return
      const { element, held } = touch
      const moved = touch.moved || Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 8
      suppress = { element, until: performance.now() + 500 }
      if (!moved && !held && event.type === 'pointerup') {
        const store = useWorkspace.getState(), multi = tabletPanelMode() === 'select'
        const { paletteId, animationFrameId, animationCelKey, layerId, groupId } = element.dataset
        if (paletteId !== undefined) store.selectPaletteColor(Number(paletteId), multi)
        else if (animationFrameId) store.selectAnimationFrame(animationFrameId, multi ? 'toggle' : 'replace')
        else if (animationCelKey) store.selectAnimationCell(animationCelKey, multi ? 'toggle' : 'replace')
        else if (layerId) store.selectLayer(layerId, multi ? 'toggle' : 'replace')
        else if (groupId) store.selectGroup(groupId, multi ? 'toggle' : 'replace')
      }
      clearTimeout(timer); touch = null; event.stopPropagation()
      if (event.type === 'pointerup' && !moved) event.preventDefault()
    }
    const click = (event: MouseEvent) => {
      if (suppress && performance.now() < suppress.until && event.target instanceof Node && suppress.element.contains(event.target)) { event.stopPropagation(); event.preventDefault(); suppress = null }
    }
    window.addEventListener('pointerdown', down, true); window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true)
    window.addEventListener('click', click, true); window.addEventListener('blur', clear)
    return () => {
      clear(); window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true)
      window.removeEventListener('click', click, true); window.removeEventListener('blur', clear)
    }
  }, [enabled])
}
