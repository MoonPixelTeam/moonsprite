import { create } from 'zustand'
import type { ClipboardImage } from '@shared/types-files'

export const REFERENCE_PASTE_EVENT = 'moonsprite:paste-reference'

interface ReferenceImage {
  id: string
  canvas: HTMLCanvasElement
  zoom: number | null
  pan: { x: number; y: number }
}

// Reference pictures belong to the application session, not to a sprite or its history.
export const useReferenceImages = create<{
  images: ReferenceImage[]
  activeId: string | null
  relativeLuminance: boolean
  toggleRelativeLuminance: () => void
  add: (canvas: HTMLCanvasElement) => void
  remove: () => void
  step: (direction: number) => void
  setView: (zoom: number | null, pan: ReferenceImage['pan']) => void
}>((set) => ({
  images: [], activeId: null, relativeLuminance: false,
  toggleRelativeLuminance: () => set((state) => ({ relativeLuminance: !state.relativeLuminance })),
  add: (canvas) => set((state) => {
    const image = { id: crypto.randomUUID(), canvas, zoom: null, pan: { x: 0, y: 0 } }
    return { images: [...state.images, image], activeId: image.id }
  }),
  remove: () => set((state) => {
    const index = state.images.findIndex((image) => image.id === state.activeId)
    const images = state.images.filter((image) => image.id !== state.activeId)
    return { images, activeId: images[Math.max(0, index - 1)]?.id ?? null }
  }),
  step: (direction) => set((state) => {
    const index = state.images.findIndex((image) => image.id === state.activeId)
    return { activeId: state.images[(index + direction + state.images.length) % state.images.length]?.id ?? null }
  }),
  setView: (zoom, pan) => set((state) => ({ images: state.images.map((image) => image.id === state.activeId ? { ...image, zoom, pan } : image) }))
}))

export function addClipboardReference(image: ClipboardImage): void {
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
  useReferenceImages.getState().add(canvas)
}
