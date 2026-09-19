import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { loadFloatingPosition, resizeFloatingPosition, saveFloatingPosition, type FloatingPosition } from '@/core/panel-preferences'

import { createPanelDockIntent, panelDockZoneAt, PANEL_DRAG_THRESHOLD, type PanelDockPlacement } from './panel-docking'
export { panelDockZoneAt } from './panel-docking'

let floatingZIndex = 220
const floatingWindowStackBaseZIndex = 600

interface FloatingWindowStackEntry {
  element: HTMLElement
  setZIndex: (value: number) => void
}

let floatingWindowStack: FloatingWindowStackEntry[] = []
const managedFloatingWindowRoots = new Map<HTMLElement, string>()

const floatingWindowLayerRoot = (element: HTMLElement): HTMLElement | null =>
  element.closest<HTMLElement>('.modal-backdrop, .lua-script-dialog-layer')

const refreshFloatingWindowStack = (): void => {
  floatingWindowStack = floatingWindowStack.filter((entry) => entry.element.isConnected)
  const activeRoots = new Map<HTMLElement, number>()
  floatingWindowStack.forEach((entry, index) => {
    const zIndex = floatingWindowStackBaseZIndex + index * 2 + 1
    entry.setZIndex(zIndex)
    const root = floatingWindowLayerRoot(entry.element)
    if (root && root !== entry.element) activeRoots.set(root, Math.max(activeRoots.get(root) ?? 0, zIndex - 1))
  })
  for (const [root, originalZIndex] of managedFloatingWindowRoots) {
    if (activeRoots.has(root)) continue
    root.style.zIndex = originalZIndex
    managedFloatingWindowRoots.delete(root)
  }
  for (const [root, zIndex] of activeRoots) {
    if (!managedFloatingWindowRoots.has(root)) managedFloatingWindowRoots.set(root, root.style.zIndex)
    root.style.zIndex = String(zIndex)
  }
}

export function useFloatingWindowStack(ref: RefObject<HTMLElement | null>, active = true) {
  const [zIndex, setZIndex] = useState(floatingWindowStackBaseZIndex + 1)
  const entryRef = useRef<FloatingWindowStackEntry | null>(null)
  useLayoutEffect(() => {
    const element = active ? ref.current : null
    if (!element) return
    const entry = { element, setZIndex }
    entryRef.current = entry
    floatingWindowStack.push(entry)
    refreshFloatingWindowStack()
    return () => {
      floatingWindowStack = floatingWindowStack.filter((candidate) => candidate !== entry)
      if (entryRef.current === entry) entryRef.current = null
      refreshFloatingWindowStack()
    }
  }, [active, ref])
  const bringToFront = useCallback((): void => {
    const entry = entryRef.current
    if (!entry) return
    floatingWindowStack = floatingWindowStack.filter((candidate) => candidate !== entry)
    floatingWindowStack.push(entry)
    refreshFloatingWindowStack()
  }, [])
  return { zIndex, bringToFront }
}

export type PanelDock = 'right' | 'left' | 'bottom' | 'floating'
export type FixedPanelDock = Exclude<PanelDock, 'floating'>
export type ResizeDirection = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export interface FloatingSizeConstraints { minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number; restoreSizeOnly?: boolean }

const notifyWorkspaceLayoutChanged = (): void => { window.dispatchEvent(new Event('moonsprite-workspace-layout-change')) }

export function useFloatingPanel(initialPosition: FloatingPosition | null = null, followViewportRight = false, canDock = true, storageKey?: string, responsiveToViewport = false, onDock?: (dock: FixedPanelDock, placement?: PanelDockPlacement) => void, forceDocked = false, constraints: FloatingSizeConstraints = {}) {
  const minimumWidth = constraints.minWidth ?? 180
  const minimumHeight = constraints.minHeight ?? 120
  const minimumWidthForViewport = (): number => Math.min(minimumWidth, Math.max(1, window.innerWidth - 6))
  const minimumHeightForViewport = (): number => Math.min(minimumHeight, Math.max(1, window.innerHeight - 6))
  const maximumWidth = (): number => Math.max(minimumWidthForViewport(), Math.min(constraints.maxWidth ?? window.innerWidth, window.innerWidth - 6))
  const maximumHeight = (): number => Math.max(minimumHeightForViewport(), Math.min(constraints.maxHeight ?? window.innerHeight, window.innerHeight - 6))
  const ref = useRef<HTMLElement>(null)
  const [position, setPosition] = useState<FloatingPosition | null>(() => {
    const loaded = loadFloatingPosition(storageKey, initialPosition, { width: window.innerWidth, height: window.innerHeight }, responsiveToViewport, forceDocked)
    if (!loaded) return null
    const constrained = {
      ...loaded,
      width: loaded.width === undefined ? undefined : Math.max(minimumWidthForViewport(), Math.min(maximumWidth(), loaded.width)),
      height: loaded.height === undefined ? undefined : Math.max(minimumHeightForViewport(), Math.min(maximumHeight(), loaded.height))
    }
    if (!constraints.restoreSizeOnly || !initialPosition) return constrained
    const initialWidth = initialPosition.width ?? constrained.width ?? minimumWidthForViewport()
    const initialHeight = initialPosition.height ?? constrained.height ?? minimumHeightForViewport()
    const width = constrained.width ?? initialWidth
    const height = constrained.height ?? initialHeight
    const centerX = initialPosition.x + initialWidth / 2
    const centerY = initialPosition.y + initialHeight / 2
    return {
      x: Math.max(0, Math.min(window.innerWidth - width, centerX - width / 2)),
      y: Math.max(0, Math.min(window.innerHeight - height, centerY - height / 2)),
      width,
      height
    }
  })
  const [zIndex, setZIndex] = useState(() => ++floatingZIndex)
  const [dockPreview, setDockPreview] = useState<CSSProperties | null>(null)
  const dockIntentRef = useRef<ReturnType<typeof createPanelDockIntent> | null>(null)
  const drag = useRef<{ offsetX: number; offsetY: number; width: number; height: number; startX: number; startY: number; moved: boolean; original: FloatingPosition | null; wasUserPositioned: boolean } | null>(null)
  const panelResize = useRef<{ direction: ResizeDirection; startX: number; startY: number; x: number; y: number; width: number; height: number } | null>(null)
  const pointerCaptureRef = useRef<{ element: HTMLElement; pointerId: number } | null>(null)
  const dragCursorActive = useRef(false)
  const positionRef = useRef(position)
  const viewportRef = useRef({ width: window.innerWidth, height: window.innerHeight })
  const userPositioned = useRef(false)
  const initialRightOffset = useRef(initialPosition ? window.innerWidth - initialPosition.x : 0)

  const persistPosition = (value: FloatingPosition | null): void => {
    if (!storageKey) return
    saveFloatingPosition(storageKey, value, { width: window.innerWidth, height: window.innerHeight })
    notifyWorkspaceLayoutChanged()
  }
  const updatePosition = (updater: (current: FloatingPosition | null) => FloatingPosition | null): void => {
    setPosition((current) => {
      const next = updater(current)
      positionRef.current = next
      return next
    })
  }
  const setDragCursor = (active: boolean): void => {
    if (dragCursorActive.current === active) return
    dragCursorActive.current = active
    document.documentElement.classList.toggle('floating-panel-dragging', active)
  }

  useEffect(() => {
    let lastPoint: { x: number; y: number } | null = null
    const intent = createPanelDockIntent(zone => setDockPreview(zone?.preview ?? null))
    dockIntentRef.current = intent
    const move = (event: globalThis.PointerEvent): void => {
      if (panelResize.current) {
        const start = panelResize.current
        const deltaX = event.clientX - start.startX
        const deltaY = event.clientY - start.startY
        let x = start.x
        let y = start.y
        let width = start.width
        let height = start.height
        if (start.direction.includes('e')) width = Math.max(minimumWidthForViewport(), Math.min(maximumWidth(), window.innerWidth - start.x, start.width + deltaX))
        if (start.direction.includes('s')) height = Math.max(minimumHeightForViewport(), Math.min(maximumHeight(), window.innerHeight - start.y, start.height + deltaY))
        if (start.direction.includes('w')) { width = Math.max(minimumWidthForViewport(), Math.min(maximumWidth(), start.x + start.width, start.width - deltaX)); x = start.x + start.width - width }
        if (start.direction.includes('n')) { height = Math.max(minimumHeightForViewport(), Math.min(maximumHeight(), start.y + start.height, start.height - deltaY)); y = start.y + start.height - height }
        updatePosition(() => ({ x, y, width, height }))
        return
      }
      if (!drag.current || !ref.current) return
      lastPoint = { x: event.clientX, y: event.clientY }
      const firstMove = !drag.current.moved
      if (!drag.current.moved) {
        if (Math.hypot(event.clientX - drag.current.startX, event.clientY - drag.current.startY) < PANEL_DRAG_THRESHOLD) return
        drag.current.moved = true
        userPositioned.current = true
        setDragCursor(true)
      }
      const x = Math.max(-drag.current.width + 160, Math.min(window.innerWidth - 120, event.clientX - drag.current.offsetX))
      const headerHeight = Math.max(32, Math.min(64, ref.current.querySelector('header')?.getBoundingClientRect().height || 32))
      const y = Math.max(0, Math.min(window.innerHeight - headerHeight, event.clientY - drag.current.offsetY))
      const current = positionRef.current
      positionRef.current = { x, y, width: current?.width ?? drag.current.width, height: current?.height ?? drag.current.height }
      ref.current.style.left = `${x}px`
      ref.current.style.top = `${y}px`
      if (firstMove && !drag.current.original) setPosition(positionRef.current)
      if (canDock) {
        intent.update(event.altKey ? null : panelDockZoneAt(event.clientX, event.clientY, undefined, intent.active))
      }
    }
    const up = (event: globalThis.PointerEvent): void => {
      if (!drag.current && !panelResize.current) return
      const cancelled = event.type !== 'pointerup'
      if (drag.current && (cancelled || !drag.current.moved)) {
        positionRef.current = drag.current.original
        userPositioned.current = drag.current.wasUserPositioned
        if (ref.current) {
          ref.current.style.left = drag.current.original ? String(drag.current.original.x) + 'px' : ''
          ref.current.style.top = drag.current.original ? String(drag.current.original.y) + 'px' : ''
        }
      }
      if (drag.current?.moved && !cancelled && canDock && ref.current?.classList.contains('floating-panel')) {
        const target = event.altKey ? null : intent.active
        if (target) {
          userPositioned.current = false
          positionRef.current = null
          updatePosition(() => null)
          persistPosition(null)
          onDock?.(target.dock, target)
        }
      }
      setPosition(positionRef.current)
      persistPosition(positionRef.current)
      drag.current = null
      panelResize.current = null
      const capture = pointerCaptureRef.current
      if (capture) {
        try { if (capture.element.hasPointerCapture?.(capture.pointerId)) capture.element.releasePointerCapture(capture.pointerId) } catch { /* WebView may release capture when leaving the native window. */ }
      }
      pointerCaptureRef.current = null
      setDragCursor(false)
      intent.clear()
    }
    const resize = (): void => {
      const previousViewport = viewportRef.current
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      viewportRef.current = viewport
      updatePosition((current) => {
        if (!current) return current
        const next = resizeFloatingPosition(current, previousViewport, viewport, {
          responsiveToViewport,
          followViewportRight,
          userPositioned: userPositioned.current,
          initialRightOffset: initialRightOffset.current,
          minWidth: minimumWidthForViewport(),
          minHeight: minimumHeightForViewport()
        }, ref.current?.getBoundingClientRect())
        window.requestAnimationFrame(() => persistPosition(next))
        return next
      })
    }
    const keydown = (event: KeyboardEvent): void => {
      if (!drag.current) return
      if (event.key === 'Alt') intent.clear()
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); up(new PointerEvent('pointercancel')) }
    }
    const blur = (): void => { if (drag.current) up(new PointerEvent('pointercancel')) }
    const keyup = (event: KeyboardEvent): void => {
      if (event.key === 'Alt' && drag.current?.moved && lastPoint) move(new PointerEvent('pointermove', { clientX: lastPoint.x, clientY: lastPoint.y }))
    }
    window.addEventListener('keyup', keyup, true)
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('blur', blur)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    let resizeFrame: number | null = null
    const scheduleResize = (): void => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame)
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = window.requestAnimationFrame(() => {
          resizeFrame = null
          resize()
        })
      })
    }
    window.addEventListener('resize', scheduleResize)
    return () => {
      intent.clear()
      dockIntentRef.current = null
      window.removeEventListener('keyup', keyup, true)
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('blur', blur)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('resize', scheduleResize)
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame)
      setDragCursor(false)
    }
  }, [])

  useEffect(() => {
    const panel = ref.current
    if (!panel || !position || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (drag.current || panelResize.current) return
      const bounds = panel.getBoundingClientRect()
      updatePosition((current) => {
        if (!current) return current
        const width = current.width === undefined ? undefined : bounds.width
        const height = current.height === undefined ? undefined : bounds.height
        if ((width === undefined || Math.abs(width - current.width!) < 1) && (height === undefined || Math.abs(height - current.height!) < 1)) return current
        return { ...current, width, height }
      })
    })
    observer.observe(panel)
    return () => observer.disconnect()
  }, [position !== null])

  const startDrag = (event: ReactPointerEvent<HTMLElement>, allowMiddle = false): void => {
    if ((event.button !== 0 && (!allowMiddle || event.button !== 1)) || (event.target as HTMLElement).closest('button, input, select')) return
    const panel = ref.current
    if (!panel) return
    const bounds = panel.getBoundingClientRect()
    dockIntentRef.current?.clear()
    setZIndex(++floatingZIndex)
    drag.current = { offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top, width: bounds.width, height: bounds.height, startX: event.clientX, startY: event.clientY, moved: false, original: positionRef.current, wasUserPositioned: userPositioned.current }
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
      pointerCaptureRef.current = { element: event.currentTarget, pointerId: event.pointerId }
    } catch { /* Pointer capture is unavailable after the native window loses focus. */ }
    event.preventDefault()
  }
  const startResize = (event: ReactPointerEvent<HTMLElement>, direction: ResizeDirection): void => {
    if (event.button !== 0 || !ref.current) return
    const bounds = ref.current.getBoundingClientRect()
    userPositioned.current = true
    setZIndex(++floatingZIndex)
    updatePosition(() => ({ x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height }))
    panelResize.current = { direction, startX: event.clientX, startY: event.clientY, x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height }
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
      pointerCaptureRef.current = { element: event.currentTarget, pointerId: event.pointerId }
    } catch { /* Pointer capture is unavailable after the native window loses focus. */ }
    event.preventDefault()
    event.stopPropagation()
  }
  const startDetachedDrag = (clientX: number, clientY: number, continueDrag = true): void => {
    const panel = ref.current
    if (!panel) return
    const bounds = panel.getBoundingClientRect()
    userPositioned.current = true
    setZIndex(++floatingZIndex)
    const offsetX = Math.min(80, Math.max(24, bounds.width / 2))
    const offsetY = 16
    const original = positionRef.current
    const next = { x: Math.max(-bounds.width + 160, Math.min(window.innerWidth - 120, clientX - offsetX)), y: Math.max(0, Math.min(window.innerHeight - 32, clientY - offsetY)), width: bounds.width, height: bounds.height }
    updatePosition(() => next)
    persistPosition(next)
    drag.current = continueDrag ? { offsetX, offsetY, width: bounds.width, height: bounds.height, startX: clientX, startY: clientY, moved: true, original, wasUserPositioned: true } : null
    setDragCursor(continueDrag)
  }
  const resizeTo = (width: number, height: number): void => {
    let nextPosition: FloatingPosition | null = null
    updatePosition((current) => {
      if (!current) return current
      nextPosition = { ...current, width: Math.max(minimumWidthForViewport(), Math.min(maximumWidth(), window.innerWidth - current.x, width)), height: Math.max(minimumHeightForViewport(), Math.min(maximumHeight(), window.innerHeight - current.y, height)) }
      return nextPosition
    })
    if (nextPosition) persistPosition(nextPosition)
  }
  const clearHeight = (): void => {
    updatePosition((current) => current ? { ...current, height: undefined } : current)
  }
  const style: CSSProperties | undefined = position ? { position: 'fixed', left: position.x, top: position.y, width: position.width, height: position.height, zIndex } : undefined
  return { ref, style, dockPreview, startDrag, startDetachedDrag, startResize, resizeTo, clearHeight, bringToFront: () => setZIndex(++floatingZIndex) }
}

export function PanelResizeHandles({ onResize }: { onResize: (event: ReactPointerEvent<HTMLElement>, direction: ResizeDirection) => void }) {
  return <>{(['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeDirection[]).map((direction) => <span key={direction} className={`floating-resize-handle resize-${direction}`} aria-hidden="true" onPointerDown={(event) => onResize(event, direction)} />)}</>
}

interface PortalResizeHandlesProps {
  onResize: (event: ReactPointerEvent<HTMLElement>, direction: ResizeDirection) => void
  position: CSSProperties | undefined
  targetRef: RefObject<HTMLElement | null>
  className?: string
}

export function PortalResizeHandles({ onResize, position, targetRef, className = '' }: PortalResizeHandlesProps) {
  const [bounds, setBounds] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  useEffect(() => {
    const target = targetRef.current
    if (!target) return
    const sync = (): void => {
      const next = target.getBoundingClientRect()
      setBounds((current) => current && current.left === next.left && current.top === next.top && current.width === next.width && current.height === next.height
        ? current
        : { left: next.left, top: next.top, width: next.width, height: next.height })
    }
    sync()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(sync)
    observer.observe(target)
    return () => observer.disconnect()
  }, [position?.left, position?.top, position?.width, position?.height, targetRef])

  if (!bounds) return null
  const zIndex = typeof position?.zIndex === 'number' ? position.zIndex + 1 : 220
  return createPortal(
    <div className={`floating-resize-portal ${className}`.trim()} style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, zIndex }} aria-hidden="true">
      <PanelResizeHandles onResize={onResize} />
    </div>,
    document.body
  )
}

export function FloatingDockPreview({ style }: { style: CSSProperties | null }) {
  return style ? createPortal(<div className="inspector-dock-preview" style={style} aria-hidden="true" />, document.body) : null
}
