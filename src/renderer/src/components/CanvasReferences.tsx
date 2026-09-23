import { CANVAS_REFERENCE_DELETE_EVENT, CANVAS_REFERENCE_PASTE_EVENT } from './canvas-reference-input'
import { useCanvasPreferences } from './useCanvasPreferences'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from './I18nProvider'
import { useWorkspace } from '@/store/workspace'
import { FormField } from './FormField'
import { NumberInput } from './NumberInput'
import { RangeField } from './RangeField'
import { MenuItemButton } from './MenuItemButton'
import { Button } from './Button'
import { PixelUtilityIcon } from './PixelUtilityIcon'
import { referenceDocumentPoint, referenceScreenBounds, referenceDocumentBounds, referenceOutlinePath, resizeReferenceBounds, referenceSourcePoint, type ReferenceViewport } from './canvas-reference-geometry'
import { registerViewPreviewListener } from '@/core/view-preview-lifecycle'
import { unrotateViewportPoint } from '@/core/view-geometry'
import { selectionRotationHit, selectionResizeHit, SELECTION_RESIZE_HIT_RADIUS, SELECTION_CORNER_RESIZE_HIT_RADIUS, SELECTION_CORNER_OUTWARD_RESIZE_HIT_RADIUS, ROTATION_HANDLE_HIT_RADIUS } from '@/core/canvas-input-hit-test'
import { selectionRotationAngle, snapSelectionRotation } from '@/core/canvas-input-resize'
import { canvasCursors, rotationCursors, directionalResizeCursors, selectionResizeCursorForHandle } from '@/core/canvas-visuals'
import { PaletteSelectionPath } from './panels/PaletteSelectionOutline'
import { registerReferenceSampler, sampleReferenceColor } from './canvas-reference-sampling'
import { publishCanvasColorSample, publishCanvasColorSamplingCompleted } from './color-sampling-events'
import type { SelectionHandle } from '@/core/canvas-input-contracts'
import type { ViewGeometryState } from '@/core/view-geometry'
import './canvas-references.css'

import { useCanvasReferences, type CanvasReference as Reference } from '@/store/canvas-references'
import { beginCanvasToolGesture, endCanvasToolGesture } from '@/core/canvas-tool-gesture-lock'
export { useCanvasReferences } from '@/store/canvas-references'

export function isOutsideReferenceCanvas(point: { x: number; y: number } | null, width: number, height: number): boolean {
  return !point || point.x < 0 || point.y < 0 || point.x >= width || point.y >= height
}

type ReferenceModifierEvent = Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>
type ReferenceTransformEvent = ReferenceModifierEvent & { nativeEvent: ReferenceModifierEvent }

export function CanvasReferences({ stageRef, isOutside, viewport, documentId, snapRotation, transformModifiers, samplingActive, onNavigatePointerDown, navigationActive }: {
  documentId: string
  viewport: ReferenceViewport
  snapRotation: (event: ReferenceTransformEvent) => boolean
  transformModifiers?: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => { proportional: boolean; integerScale: boolean; fromCenter: boolean; constrainAxis: boolean }
  samplingActive?: () => boolean
  onNavigatePointerDown?: (event: React.PointerEvent<HTMLDivElement>) => boolean
  navigationActive?: () => boolean
  stageRef: RefObject<HTMLDivElement | null>
  isOutside: (x: number, y: number) => boolean
}) {
  const { t } = useI18n()
  const { images: allImages, add, update, replace, remove, reset, bringToFront, begin, finish } = useCanvasReferences()
  const { referenceScaling } = useCanvasPreferences()
  const images = allImages.filter((image) => image.documentId === documentId).sort((a, b) => Number(Boolean(a.floating)) - Number(Boolean(b.floating)))
  const [pasting, setPasting] = useState(false)
  const [clipboardHasImage, setClipboardHasImage] = useState(true)
  const clipboardImage = useRef<Awaited<ReturnType<typeof window.moonSprite.readClipboardImage>> | null>(null)
  const pasteBusy = useRef(false)
  const numericPointer = useRef<number | null>(null)
  useEffect(() => {
    const end = (event?: PointerEvent) => {
      if (numericPointer.current === null || (event && event.pointerId !== numericPointer.current)) return
      numericPointer.current = null
      finish()
    }
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', end, true)
    const blur = () => end()
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('pointerup', end, true)
      window.removeEventListener('pointercancel', end, true)
      window.removeEventListener('blur', blur)
      end()
    }
  }, [finish])
  const [menu, setMenu] = useState<{ x: number; y: number; id?: string } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuDrag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const [editingProperty, setEditingProperty] = useState<'scale' | 'angle' | 'opacity' | null>(null)
  useEffect(() => { setEditingProperty(null) }, [menu?.id, menu === null])
  useEffect(() => {
    if (!editingProperty) return
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.canvas-reference-value-control')) setEditingProperty(null)
    }
    window.addEventListener('pointerdown', dismiss)
    return () => window.removeEventListener('pointerdown', dismiss)
  }, [editingProperty])
  const insertion = useRef({ x: 0, y: 0, zoom: viewport.view.zoom / viewport.interfaceScale })
  const [preview, setPreview] = useState<{ base: ViewGeometryState; view: ViewGeometryState } | null>(null)
  const displayViewport = preview?.base === viewport.view ? { ...viewport, view: preview.view } : viewport
  const viewportRef = useRef(displayViewport)
  viewportRef.current = displayViewport
  const imageElements = useRef(new Map<string, HTMLImageElement>())
  const imagesRef = useRef(images)
  imagesRef.current = images
  const sampleCanvas = useRef<HTMLCanvasElement | null>(null)
  const samplingPointer = useRef<{ pointer: number; secondary: boolean } | null>(null)
  useEffect(() => registerViewPreviewListener(documentId, (view) => {
    viewportRef.current = { ...viewportRef.current, view }
    setPreview({ base: viewport.view, view })
  }), [documentId, viewport.view])
  const pointAt = (x: number, y: number, image?: Reference) => {
    const bounds = stageRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 }
    return image?.floating ? { x: x - bounds.left, y: y - bounds.top } : referenceDocumentPoint(x, y, bounds, viewportRef.current)
  }
  const hitAt = (image: Reference, point: { x: number; y: number }) => {
    const local = unrotateViewportPoint(point, { x: image.x + image.width / 2, y: image.y + image.height / 2 }, image.angle)
    const scale = image.floating ? 1 : viewportRef.current.interfaceScale / viewportRef.current.view.zoom
    return selectionResizeHit(image, local, SELECTION_RESIZE_HIT_RADIUS * scale, SELECTION_CORNER_RESIZE_HIT_RADIUS * scale, SELECTION_CORNER_OUTWARD_RESIZE_HIT_RADIUS * scale)
      ?? selectionRotationHit(image, local, scale)
  }
  const outsideRef = useRef(isOutside)
  outsideRef.current = isOutside
  const drag = useRef<{ id: string; pointer: number; x: number; y: number; image: Reference; display: Reference; handle: SelectionHandle | null; rotate: boolean; last: { x: number; y: number } } | null>(null)
  useEffect(() => registerReferenceSampler(documentId, (x, y) => {
    const bounds = stageRef.current?.getBoundingClientRect()
    if (!bounds || x < bounds.left || y < bounds.top || x >= bounds.right || y >= bounds.bottom) return null
    for (const image of [...imagesRef.current].reverse()) {
      const element = imageElements.current.get(image.id)
      if (!element?.complete || !element.naturalWidth || !element.naturalHeight) continue
      const pixel = referenceSourcePoint(image, pointAt(x, y, image), element.naturalWidth, element.naturalHeight)
      if (!pixel) continue
      sampleCanvas.current ??= document.createElement('canvas')
      const canvas = sampleCanvas.current
      canvas.width = canvas.height = 1
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return null
      context.drawImage(element, pixel.x, pixel.y, 1, 1, 0, 0, 1, 1)
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
      return { r, g, b, a }
    }
    return null
  }), [documentId, stageRef])
  const sampleAt = (x: number, y: number, secondary: boolean) => {
    const color = sampleReferenceColor(documentId, x, y)
    if (!color) return
    const state = useWorkspace.getState()
    if (secondary) state.setSecondaryColor(color)
    else state.setPrimaryColor(color)
    publishCanvasColorSample(color, secondary)
  }
  const applyTransform = (point: { x: number; y: number }, event: ReferenceTransformEvent) => {
    const start = drag.current
    if (!start) return
    start.last = point
    const modifiers = transformModifiers?.(event.nativeEvent) ?? { proportional: event.shiftKey, integerScale: event.ctrlKey, fromCenter: event.altKey, constrainAxis: event.shiftKey }
    if (start.rotate) update(start.id, { angle: snapSelectionRotation(start.image.angle + selectionRotationAngle(start.display, start, point), snapRotation(event)) })
    else if (start.handle) {
      const target = resizeReferenceBounds(start.image, { x: point.x - start.x, y: point.y - start.y }, start.handle, modifiers.integerScale, modifiers.fromCenter)
      update(start.id, { x: target.x, y: target.y, width: target.width, height: target.height, flipX: start.image.flipX !== Boolean(target.flipHorizontal), flipY: start.image.flipY !== Boolean(target.flipVertical) })
    } else {
      let dx = point.x - start.x, dy = point.y - start.y
      if (modifiers.constrainAxis) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0 }
      update(start.id, { x: start.image.x + dx, y: start.image.y + dy })
    }
  }
  const transformRef = useRef(applyTransform)
  transformRef.current = applyTransform
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const start = drag.current
      if (!start) return
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault(); event.stopImmediatePropagation()
        finish(event.key === 'Escape'); endCanvasToolGesture(start.pointer); drag.current = null
      } else if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
        transformRef.current(start.last, { nativeEvent: event, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, altKey: event.altKey, metaKey: event.metaKey })
      }
    }
    window.addEventListener('keydown', key, true); window.addEventListener('keyup', key, true)
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', key, true) }
  }, [finish])
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const outside = (event: MouseEvent) => event.target instanceof HTMLCanvasElement
      && event.target.classList.contains('stage-canvas') && outsideRef.current(event.clientX, event.clientY)
    const lockedReferenceAt = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLCanvasElement) || !event.target.classList.contains('stage-canvas')) return undefined
      const bounds = stage.getBoundingClientRect()
      const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      return [...imagesRef.current].reverse().find((image) => image.locked
        && referenceSourcePoint(referenceScreenBounds(image, viewportRef.current), point, 1, 1))
    }
    const openLockedReference = (event: MouseEvent): boolean => {
      const locked = lockedReferenceAt(event)
      if (!locked) return false
      event.preventDefault(); event.stopPropagation()
      setSelected(locked.id)
      setMenu({ x: event.clientX, y: event.clientY, id: locked.id })
      return true
    }
    const down = (event: PointerEvent) => {
      // Reserve right-click before tools can paint or fill on pointerdown.
      // The later contextmenu event alone is too late to prevent a document edit.
      if (event.button === 2 && openLockedReference(event)) return
      if (event.button === 0 && event.target instanceof HTMLCanvasElement && event.target.classList.contains('stage-canvas')) setSelected(null)
      if (event.button === 2 && outside(event)) { event.preventDefault(); event.stopPropagation() }
    }
    const context = (event: MouseEvent) => {
      if (openLockedReference(event)) return
      if (!outside(event)) return
      event.preventDefault(); event.stopPropagation()
      insertion.current = { ...referenceDocumentPoint(event.clientX, event.clientY, stage.getBoundingClientRect(), viewportRef.current), zoom: viewportRef.current.view.zoom / viewportRef.current.interfaceScale }
      setMenu({ x: event.clientX, y: event.clientY })
      setClipboardHasImage(true)
      if (window.moonSprite?.readClipboardImage) void window.moonSprite.readClipboardImage().then((image) => { clipboardImage.current = image; setClipboardHasImage(Boolean(image && image.width > 0 && image.height > 0)) }).catch(() => setClipboardHasImage(false))
    }
    stage.addEventListener('pointerdown', down, true)
    stage.addEventListener('contextmenu', context, true)
    return () => { stage.removeEventListener('pointerdown', down, true); stage.removeEventListener('contextmenu', context, true) }
  }, [stageRef])
  useEffect(() => {
    if (!menu) return
    const dismiss = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null)
    }
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); setMenu(null) }
      else dismiss(event)
    }
    const blur = () => setMenu(null)
    // Capture runs before canvas and reference handlers stop propagation.
    window.addEventListener('pointerdown', dismiss, true)
    window.addEventListener('wheel', dismiss, { capture: true, passive: true })
    window.addEventListener('focusin', dismiss, true)
    window.addEventListener('keydown', keyboard, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('pointerdown', dismiss, true)
      window.removeEventListener('wheel', dismiss, true)
      window.removeEventListener('focusin', dismiss, true)
      window.removeEventListener('keydown', keyboard, true)
      window.removeEventListener('blur', blur)
    }
  }, [menu])
  useEffect(() => {
    const move = (event: PointerEvent) => { const drag = menuDrag.current; if (!drag) return; setMenu((value) => value ? { ...value, x: drag.left + event.clientX - drag.x, y: drag.top + event.clientY - drag.y } : value) }
    const up = () => { menuDrag.current = null }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [])
  useLayoutEffect(() => {
    const popup = menuRef.current
    if (!menu || !popup) return
    const place = () => {
      const bounds = popup.getBoundingClientRect()
      const slider = popup.querySelector<HTMLElement>('.canvas-reference-value-control .brush-size-popover')
      const sliderWidth = slider?.getBoundingClientRect().width ?? 0
      const gap = 8
      const extraWidth = slider ? sliderWidth + gap : 0
      popup.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - bounds.width - extraWidth - 8))}px`
      popup.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - bounds.height - 8))}px`
      if (slider?.parentElement) {
        const input = slider.parentElement.getBoundingClientRect()
        const height = slider.getBoundingClientRect().height
        slider.style.left = `${input.right + gap}px`
        slider.style.top = `${Math.max(8, Math.min(input.top + (input.height - height) / 2, window.innerHeight - height - 8))}px`
      }
    }
    place()
    window.addEventListener('resize', place)
    popup.addEventListener('scroll', place)
    return () => {
      window.removeEventListener('resize', place)
      popup.removeEventListener('scroll', place)
    }
  }, [menu, editingProperty])
  useEffect(() => () => {
    if (drag.current) { finish(true); endCanvasToolGesture(drag.current.pointer); drag.current = null }
  }, [finish])
  const current = images.find((image) => image.id === menu?.id)
  const selectedImage = images.find((image) => image.id === selected)
  useEffect(() => {
    const receive = (event: Event) => {
      if (!selectedImage || useWorkspace.getState().activeId !== documentId) return
      event.preventDefault()
      if (selectedImage.locked || (event as CustomEvent<boolean>).detail || drag.current) return
      finish()
      remove(selectedImage.id)
      setSelected(null)
      setMenu(null)
    }
    window.addEventListener(CANVAS_REFERENCE_DELETE_EVENT, receive)
    return () => window.removeEventListener(CANVAS_REFERENCE_DELETE_EVENT, receive)
  }, [selectedImage, documentId, finish, remove])
  const importFile = async (file: File) => {
    const { zoom, ...position } = insertion.current
    try {
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error ?? new Error(file.name))
        reader.readAsDataURL(file)
      })
      const image = new Image()
      image.src = src
      await image.decode()
      if (!image.naturalWidth || !image.naturalHeight) throw new Error(file.name)
      const scale = Math.min(1, 240 / Math.max(image.naturalWidth, image.naturalHeight))
      const id = crypto.randomUUID()
      add({ id, documentId, src, name: file.name, ...position, width: image.naturalWidth * scale / zoom, height: image.naturalHeight * scale / zoom, angle: 0, flipX: false, flipY: false, locked: false })
      setSelected(id)
    } catch (error) {
      useWorkspace.getState().setMessage(`${t('reference.importFailed')}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const paste = async (replaceId?: string) => {
    if (pasteBusy.current) return
    pasteBusy.current = true
    setPasting(true)
    const { zoom, ...position } = insertion.current
    try {
      const image = clipboardImage.current ?? await window.moonSprite.readClipboardImage()
      clipboardImage.current = null
      if (!image) { useWorkspace.getState().setMessage(t('workspace.clipboard.emptyPixels')); return }
      const { width, height, data } = image
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || data.length !== width * height * 4) throw new Error(t('reference.pasteFailed'))
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error(t('reference.pasteFailed'))
      context.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0)
      if (replaceId) { replace(replaceId, canvas.toDataURL('image/png'), width, height); return }
      const scale = Math.min(1, 240 / Math.max(width, height)) / zoom
      const id = crypto.randomUUID()
      add({ id, documentId, src: canvas.toDataURL('image/png'), name: t('reference.pasteCanvas'), ...position, width: width * scale, height: height * scale, angle: 0, flipX: false, flipY: false, locked: false })
      setSelected(id); setMenu(null)
    } catch (error) {
      useWorkspace.getState().setMessage(`${t('reference.pasteFailed')}: ${error instanceof Error ? error.message : String(error)}`)
    } finally { pasteBusy.current = false; setPasting(false) }
  }
  useEffect(() => {
    const receive = (event: Event) => {
      if (!selectedImage || useWorkspace.getState().activeId !== documentId) return
      event.preventDefault()
      if (!selectedImage.locked && !(event as CustomEvent<boolean>).detail) void paste(selectedImage.id)
    }
    window.addEventListener(CANVAS_REFERENCE_PASTE_EVENT, receive)
    return () => window.removeEventListener(CANVAS_REFERENCE_PASTE_EVENT, receive)
  })
  return <>
    <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file) void importFile(file)
    }} />
    <div className="canvas-references">
      <div className="canvas-reference-plane">
      {images.map((source) => {
        const image = referenceScreenBounds(source, displayViewport)
        const margin = selected === image.id && !image.locked ? ROTATION_HANDLE_HIT_RADIUS : 0
        return <div key={image.id} className={`canvas-reference ${selected === image.id ? 'selected' : ''} ${image.locked ? 'locked' : ''}`}
        style={{ pointerEvents: image.locked ? 'none' : undefined, left: image.x, top: image.y, width: image.width, height: image.height, opacity: image.opacity ?? 1, transform: `rotate(${image.angle}deg)` }}
        onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (samplingActive?.()) return; setSelected(image.id); setMenu({ x: event.clientX, y: event.clientY, id: image.id }) }}
        onPointerDown={(event) => {
          if (onNavigatePointerDown?.(event)) { event.preventDefault(); event.stopPropagation(); return }
          const centerResize = selected === image.id && !image.locked && hitAt(source, pointAt(event.clientX, event.clientY, source)) && transformModifiers?.(event.nativeEvent).fromCenter
          if (samplingActive?.() && !centerResize && (event.button === 0 || event.button === 2)) {
            event.preventDefault(); event.stopPropagation()
            samplingPointer.current = { pointer: event.pointerId, secondary: event.button === 2 }
            sampleAt(event.clientX, event.clientY, event.button === 2)
            event.currentTarget.setPointerCapture(event.pointerId)
            return
          }
          if (event.button !== 0) return
          event.preventDefault(); event.stopPropagation()
          if (image.locked) { setSelected(null); return }
          const wasSelected = selected === image.id
          setSelected(image.id)
          begin(image.id); beginCanvasToolGesture(event.pointerId)
          const point = pointAt(event.clientX, event.clientY, source)
          const hit = wasSelected ? hitAt(source, point) : null
          drag.current = { id: image.id, pointer: event.pointerId, ...point, image: source, display: source, handle: hit && !hit.startsWith('rotate-') ? hit as SelectionHandle : null, rotate: Boolean(hit?.startsWith('rotate-')), last: point }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (navigationActive?.() && !drag.current) { event.currentTarget.style.cursor = canvasCursors.grab; return }
          if (samplingPointer.current?.pointer === event.pointerId) { sampleAt(event.clientX, event.clientY, samplingPointer.current.secondary); return }
          if (samplingActive?.() && !drag.current) { event.currentTarget.style.cursor = canvasCursors.eyedropper; return }
          const point = pointAt(event.clientX, event.clientY, source)
          const start = drag.current
          if (!start) {
            const hit = !image.locked && selected === image.id && hitAt(source, point)
            event.currentTarget.style.cursor = hit ? hit.startsWith('rotate-') ? rotationCursors[hit as keyof typeof rotationCursors] : directionalResizeCursors[selectionResizeCursorForHandle(hit as SelectionHandle, source.angle, source.floating ? 0 : displayViewport.view.rotation, !source.floating && displayViewport.view.mirrored, !source.floating && displayViewport.view.mirroredVertical)] : image.locked ? canvasCursors.default : canvasCursors.move
            return
          }
          if (start.pointer !== event.pointerId) return
          applyTransform(point, event)
        }}
        onPointerUp={(event) => { if (samplingPointer.current?.pointer === event.pointerId) { samplingPointer.current = null; publishCanvasColorSamplingCompleted(); event.currentTarget.releasePointerCapture(event.pointerId) }; if (drag.current?.pointer === event.pointerId) { finish(); endCanvasToolGesture(event.pointerId); drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId) } }}
        onPointerCancel={() => { samplingPointer.current = null; if (drag.current) { finish(true); endCanvasToolGesture(drag.current.pointer) }; drag.current = null }}
        onLostPointerCapture={() => { samplingPointer.current = null; if (drag.current) { finish(true); endCanvasToolGesture(drag.current.pointer) }; drag.current = null }}>
          <span className="canvas-reference-hit-area" style={{ inset: -margin, pointerEvents: image.locked ? 'none' : undefined }} aria-hidden="true" />
          <img ref={(element) => { if (element) imageElements.current.set(image.id, element); else imageElements.current.delete(image.id) }} src={image.src} alt={image.name} draggable={false} style={{ imageRendering: referenceScaling === 'pixelated' ? 'pixelated' : 'auto', transform: `scale(${image.flipX ? -1 : 1}, ${image.flipY ? -1 : 1})` }} />
        </div>
      })}
      </div>
      {selectedImage && <PaletteSelectionPath path={referenceOutlinePath(referenceScreenBounds(selectedImage, displayViewport))} width={displayViewport.width / displayViewport.interfaceScale} height={displayViewport.height / displayViewport.interfaceScale} />}
    </div>
    {menu && createPortal(<div ref={menuRef} className={`context-menu canvas-reference-menu ${current ? '' : 'canvas-reference-add-menu'}`} role="dialog" aria-label={t('panel.reference')}
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(event) => event.preventDefault()} onKeyDown={(event) => event.stopPropagation()}>
      {current ? <>
        <header className="canvas-reference-heading" onPointerDown={(event) => { if (event.button !== 0) return; menuDrag.current = { x: event.clientX, y: event.clientY, left: menu?.x ?? 0, top: menu?.y ?? 0 }; event.preventDefault() }}><PixelUtilityIcon kind="image" /><strong title={current.name}>{current.name}</strong></header>
        <div className="canvas-reference-properties" onPointerDownCapture={(event) => {
          if (event.button !== 0 || current.locked || !(event.target instanceof Element)
            || !event.target.closest('[data-number-scrubbable="true"], .number-input-stepper')) return
          numericPointer.current = event.pointerId
          begin(current.id)
        }}>
        {(['x', 'y', 'scale', 'angle', 'opacity'] as const).map((key) => {
          const label = key === 'x' ? 'X' : key === 'y' ? 'Y' : t(key === 'scale' ? 'reference.scale' : key === 'opacity' ? 'reference.opacity' : 'reference.angle')
          const hasSlider = key === 'scale' || key === 'angle' || key === 'opacity'
          const value = key === 'scale' ? Math.round(current.width / (current.initial?.width ?? current.width) * 10000) / 100
            : key === 'opacity' ? Math.round((current.opacity ?? 1) * 100) : Math.round((current[key] ?? 0) * 100) / 100
          const change = (next: number) => update(current.id, key === 'scale' ? { width: (current.initial?.width ?? current.width) * next / 100 }
            : key === 'opacity' ? { opacity: next / 100 } : { [key]: next })
          const suffix = key === 'scale' || key === 'opacity' ? '%' : key === 'angle' ? '°' : undefined
          return <FormField key={key} label={label} layout="inline" className={hasSlider ? 'canvas-reference-slider-field' : undefined}>
            {hasSlider ? <div className="brush-size-control canvas-reference-value-control"
              onPointerDown={() => { if (!current.locked) setEditingProperty(key) }}
              onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEditingProperty((active) => active === key ? null : active) }}>
              <NumberInput aria-label={label} min={key === 'scale' ? 0.01 : key === 'opacity' ? 0 : undefined} max={key === 'opacity' ? 100 : undefined}
                step={key === 'angle' ? 0.01 : 1} suffix={suffix} value={value} disabled={current.locked}
                onFocus={() => setEditingProperty(key)} onValueChange={change} />
              {editingProperty === key && !current.locked && <div className="brush-size-popover" role="dialog" aria-label={label}>
                <RangeField interaction={{ begin: () => begin(current.id), commit: () => finish() }} ariaLabel={label} density="compact"
                  min={key === 'scale' ? 0.01 : key === 'angle' ? Math.min(-180, value) : 0}
                  max={key === 'scale' ? Math.max(1000, value) : key === 'angle' ? Math.max(180, value) : 100}
                  step={key === 'scale' ? 0.01 : 1} suffix={suffix} value={value} onChange={change} />
              </div>}
            </div> : <NumberInput aria-label={label} value={value} disabled={current.locked} step={0.01} onValueChange={change} />}
          </FormField>
        })}
        </div>
        <div className="canvas-reference-mirrors">
          <Button aria-pressed={current.flipX} disabled={current.locked} onClick={() => update(current.id, { flipX: !current.flipX })}>{t('reference.flipX')}</Button>
          <Button aria-pressed={current.flipY} disabled={current.locked} onClick={() => update(current.id, { flipY: !current.flipY })}>{t('reference.flipY')}</Button>
        </div>
        <footer className="canvas-reference-footer">
          <div className="canvas-reference-footer-tools">
            <Button className="icon-button" title={t(current.locked ? 'reference.unlockHint' : 'reference.lockHint')} aria-label={t(current.locked ? 'reference.unlock' : 'reference.lock')} aria-pressed={current.locked} onClick={() => { update(current.id, { locked: !current.locked }); setSelected(null) }}><PixelUtilityIcon kind={current.locked ? 'lock' : 'unlock'} /></Button>
            <Button className="icon-button" title={t('reference.fixedSizeHint')} aria-label={t('reference.fixedSize')} aria-pressed={Boolean(current.floating)} disabled={current.locked} onClick={() => {
              const convert = current.floating ? referenceDocumentBounds : referenceScreenBounds
              const target = convert(current, viewportRef.current)
              const initial = current.initial ? convert(current.initial, viewportRef.current) : undefined
              update(current.id, { x: target.x, y: target.y, width: target.width, height: target.height, angle: target.angle, flipX: target.flipX, flipY: target.flipY, floating: !current.floating, ...(initial ? { initial } : {}) })
            }}><PixelUtilityIcon kind="export" /></Button>
            <Button className="icon-button" title={t('reference.resetHint')} aria-label={t('common.reset')} disabled={current.locked} onClick={() => reset(current.id)}><PixelUtilityIcon kind="refresh" /></Button>
            <Button className="icon-button" title={t('reference.bringToFrontHint')} aria-label={t('reference.bringToFront')} onClick={() => bringToFront(current.id)}><PixelUtilityIcon kind="canvasTop" /></Button>
          </div>
          <Button className="icon-button" title={t('common.delete')} aria-label={t('common.delete')} disabled={current.locked} onClick={() => { remove(current.id); setMenu(null); setSelected(null) }}><PixelUtilityIcon kind="delete" /></Button>
        </footer>
      </> : <div className="menu-popover canvas-reference-actions" role="menu"><MenuItemButton role="menuitem" onClick={() => { fileRef.current?.click(); setMenu(null) }}>{t('reference.addCanvas')}</MenuItemButton>{clipboardHasImage && <MenuItemButton role="menuitem" disabled={pasting} onClick={() => { void paste() }}>{t('reference.pasteCanvas')}</MenuItemButton>}</div>}
    </div>, document.body)}
  </>
}
