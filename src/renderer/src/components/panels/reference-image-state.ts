import { create } from 'zustand'
import type { ClipboardImage } from '@shared/types-files'

export const REFERENCE_PASTE_EVENT = 'moonsprite:paste-reference'

interface ReferenceImage {
  id: string
  canvas: HTMLCanvasElement
  zoom: number | null
  pan: { x: number; y: number }
}

interface ReferenceWindow {
  id: string
  activeId: string | null
  zoom: number | null
  pan: ReferenceImage['pan']
}

// Reference pictures belong to the application session, not to a sprite or its history.
export const useReferenceImages = create<{
  images: ReferenceImage[]
  activeId: string | null
  windows: ReferenceWindow[]
  openWindow: (imageId?: string | null) => void
  closeWindow: (windowId: string) => void
  relativeLuminance: boolean
  toggleRelativeLuminance: () => void
  add: (canvas: HTMLCanvasElement, windowId?: string) => void
  remove: (windowId?: string) => void
  step: (direction: number, windowId?: string) => void
  setView: (zoom: number | null, pan: ReferenceImage['pan'], windowId?: string) => void
}>((set) => ({
  images: [], activeId: null, windows: [], relativeLuminance: false,
  openWindow: (imageId = null) => set((state) => ({
    windows: [...state.windows, { id: crypto.randomUUID(), activeId: state.images.some((image) => image.id === imageId) ? imageId : null, zoom: null, pan: { x: 0, y: 0 } }]
  })),
  closeWindow: (windowId) => set((state) => ({ windows: state.windows.filter((panel) => panel.id !== windowId) })),
  toggleRelativeLuminance: () => set((state) => ({ relativeLuminance: !state.relativeLuminance })),
  add: (canvas, windowId) => set((state) => {
    if (windowId && !state.windows.some((panel) => panel.id === windowId)) return state
    const image = { id: crypto.randomUUID(), canvas, zoom: null, pan: { x: 0, y: 0 } }
    return {
      images: [...state.images, image],
      activeId: windowId ? state.activeId : image.id,
      windows: state.windows.map((panel) => panel.id === windowId ? { ...panel, activeId: image.id, zoom: null, pan: { x: 0, y: 0 } } : panel)
    }
  }),
  remove: (windowId) => set((state) => {
    const activeId = windowId ? state.windows.find((panel) => panel.id === windowId)?.activeId : state.activeId
    if (!activeId) return state
    const index = state.images.findIndex((image) => image.id === activeId)
    const images = state.images.filter((image) => image.id !== activeId)
    const nextId = images[Math.max(0, index - 1)]?.id ?? null
    return {
      images, activeId: state.activeId === activeId ? nextId : state.activeId,
      windows: state.windows.map((panel) => panel.activeId === activeId ? { ...panel, activeId: nextId, zoom: null, pan: { x: 0, y: 0 } } : panel)
    }
  }),
  step: (direction, windowId) => set((state) => {
    const activeId = windowId ? state.windows.find((panel) => panel.id === windowId)?.activeId : state.activeId
    const index = state.images.findIndex((image) => image.id === activeId)
    const nextId = state.images[index < 0 ? 0 : (index + direction + state.images.length) % state.images.length]?.id ?? null
    return windowId
      ? { windows: state.windows.map((panel) => panel.id === windowId ? { ...panel, activeId: nextId, zoom: null, pan: { x: 0, y: 0 } } : panel) }
      : { activeId: nextId }
  }),
  setView: (zoom, pan, windowId) => set((state) => windowId
    ? { windows: state.windows.map((panel) => panel.id === windowId ? { ...panel, zoom, pan } : panel) }
    : { images: state.images.map((image) => image.id === state.activeId ? { ...image, zoom, pan } : image) })
}))

export function addClipboardReference(image: ClipboardImage, windowId?: string): void {
  const { width, height, data } = image
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || data.length !== width * height * 4) {
    throw new Error('Invalid clipboard image dimensions or pixel data')
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to create reference image canvas')
  context.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0)
  useReferenceImages.getState().add(canvas, windowId)
}
