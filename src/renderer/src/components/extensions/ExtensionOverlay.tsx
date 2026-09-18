import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { extensionHostBounds, extensionPointerPosition } from '@/platform/extension-window'
import { ExtensionWindow } from './ExtensionWindow'
import { overlayBounds, overlayClipPath, overlayRegion, type OverlayBounds, type OverlayRegion } from './extension-overlay-geometry'

export interface OverlayDefinition { windowId: string; resourceId: string; bounds: OverlayBounds; visible: boolean }

/** Generic sandboxed surface; all business state stays in the extension. */
export function ExtensionOverlay({ extensionId, definition, onClose }: { extensionId: string; definition: OverlayDefinition; onClose: () => void }) {
  const element = useRef<HTMLDivElement>(null)
  const bounds = useRef(definition.bounds)
  const region = useRef<OverlayRegion | null>(null)
  const send = useRef<(event: unknown) => void>(() => {})
  const applyBounds = (next: OverlayBounds, updateRegion = false) => {
    const resized = next.width !== bounds.current.width || next.height !== bounds.current.height
    bounds.current = next
    if (element.current) Object.assign(element.current.style, {
      left: `${next.x}px`, top: `${next.y}px`, width: `${next.width}px`, height: `${next.height}px`,
      ...(resized || updateRegion ? { clipPath: overlayClipPath(region.current, next) } : {})
    })
  }
  const surface = useMemo(() => ({
    subscribe: (listener: (event: unknown) => void) => { send.current = listener; return () => { send.current = () => {} } },
    request: async (method: string, raw: unknown) => {
      const params = (raw ?? {}) as Record<string, unknown>
      if (method === 'window.getBounds') return { ...bounds.current }
      if (method === 'window.getHostBounds') return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }
      if (method === 'window.getPointerPosition') {
        const [point, host] = await Promise.all([extensionPointerPosition(), extensionHostBounds()])
        return point ? { x: point.x - host.x, y: point.y - host.y } : null
      }
      if (method === 'window.setBounds') { applyBounds(overlayBounds(params.bounds)); send.current({ kind: 'moved', position: { x: bounds.current.x, y: bounds.current.y } }); return null }
      if (method === 'window.setHitRegion') { region.current = overlayRegion(params); applyBounds(bounds.current, true); return null }
      throw new Error('覆盖层拖动请使用指针捕获配合 window.setBounds。')
    }
  }), [])
  useEffect(() => { applyBounds(definition.bounds) }, [definition.bounds])
  useEffect(() => {
    const resize = () => send.current({ kind: 'host-geometry' })
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  return createPortal(<div data-extension-overlay-root style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 810, display: definition.visible ? undefined : 'none' }}>
    <style>{`body:has(.modal-backdrop, .menu-popover, .workspace-panel-context-menu, .document-tab-context-menu, .workspace-popover) [data-extension-overlay-root]{z-index:190!important}`}</style>
    <div ref={element} data-extension-overlay={definition.windowId} style={{ position: 'absolute', pointerEvents: 'auto', clipPath: 'inset(50%)' }}>
      <ExtensionWindow identity={{ extensionId, windowId: definition.windowId, resourceId: definition.resourceId }} surface={surface} onClose={onClose} />
    </div>
  </div>, document.body)
}
