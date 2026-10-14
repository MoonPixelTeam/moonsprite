import { create } from 'zustand'
import type { ClipboardImage } from '@shared/types-files'
import type { ProjectReferenceImage, SpriteDocument } from '@shared/types-document'
import { useWorkspace } from '@/store/workspace'
import { activeSession } from '@/store/workspace-access'
import { addProjectReferenceImage, removeProjectReferenceImage } from '@/store/workspace-reference-images'

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

const referenceCanvases = new WeakMap<ProjectReferenceImage, HTMLCanvasElement>()

// Pixels belong to the project; windows and view navigation belong to its session.
export const useReferenceImages = create<{
  images: ReferenceImage[]
  activeId: string | null
  windows: ReferenceWindow[]
  openWindow: (imageId?: string | null) => void
  closeWindow: (windowId: string) => void
  relativeLuminance: boolean
  toggleRelativeLuminance: () => void
  add: (canvas: HTMLCanvasElement, windowId?: string, pixels?: Uint8ClampedArray) => void
  remove: (windowId?: string) => void
  step: (direction: number, windowId?: string) => void
  setView: (zoom: number | null, pan: ReferenceImage['pan'], windowId?: string) => void
}>((set, get) => ({
  images: [], activeId: null, windows: [], relativeLuminance: false,
  openWindow: (imageId = null) => set((state) => ({
    windows: [...state.windows, { id: crypto.randomUUID(), activeId: state.images.some((image) => image.id === imageId) ? imageId : null, zoom: null, pan: { x: 0, y: 0 } }]
  })),
  closeWindow: (windowId) => set((state) => ({ windows: state.windows.filter((panel) => panel.id !== windowId) })),
  toggleRelativeLuminance: () => set((state) => ({ relativeLuminance: !state.relativeLuminance })),
  add: (canvas, windowId, pixels) => {
    if (windowId && !get().windows.some((panel) => panel.id === windowId)) return
    const data = pixels ?? canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
    if (!data) throw new Error('Unable to read reference image pixels')
    const image: ProjectReferenceImage = { id: crypto.randomUUID(), width: canvas.width, height: canvas.height, pixels: data }
    referenceCanvases.set(image, canvas)
    if (!addProjectReferenceImage(image)) return
    set(state => ({
      activeId: windowId ? state.activeId : image.id,
      windows: state.windows.map((panel) => panel.id === windowId ? { ...panel, activeId: image.id, zoom: null, pan: { x: 0, y: 0 } } : panel)
    }))
  },
  remove: (windowId) => {
    const state = get()
    const activeId = windowId ? state.windows.find((panel) => panel.id === windowId)?.activeId : state.activeId
    if (activeId) removeProjectReferenceImage(activeId)
  },
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

type ReferenceViewState = Pick<ReturnType<typeof useReferenceImages.getState>, 'images' | 'activeId' | 'windows' | 'relativeLuminance'>
const projectViews = new WeakMap<SpriteDocument, ReferenceViewState>()
let boundDocument: SpriteDocument | null = null
let boundReferences: SpriteDocument['referenceImages']

function synchronizeProjectReferences(): void {
  const project = activeSession(useWorkspace.getState())?.document ?? null
  if (project === boundDocument && project?.referenceImages === boundReferences) return
  const previous = useReferenceImages.getState()
  const switching = project !== boundDocument
  if (switching && boundDocument) projectViews.set(boundDocument, previous)
  const saved = switching && project ? projectViews.get(project) : undefined
  const base = switching ? saved : previous
  const images = (project?.referenceImages ?? []).map(image => {
    const existing = base?.images.find(item => item.id === image.id && item.canvas === referenceCanvases.get(image))
    if (existing) return existing
    let canvas = referenceCanvases.get(image)
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Unable to create reference image canvas')
      context.putImageData(new ImageData(new Uint8ClampedArray(image.pixels), image.width, image.height), 0, 0)
      referenceCanvases.set(image, canvas)
    }
    return { id: image.id, canvas, zoom: null, pan: { x: 0, y: 0 } }
  })
  const valid = (id: string | null): boolean => images.some(image => image.id === id)
  const oldIndex = base?.images.findIndex(image => image.id === base.activeId) ?? 0
  const nextId = images[Math.max(0, oldIndex - 1)]?.id ?? images[0]?.id ?? null
  boundDocument = project
  boundReferences = project?.referenceImages
  useReferenceImages.setState({
    images,
    activeId: base ? base.activeId === null || valid(base.activeId) ? base.activeId : nextId : images[0]?.id ?? null,
    windows: (base?.windows ?? []).map(panel => panel.activeId === null || valid(panel.activeId) ? panel : { ...panel, activeId: nextId, zoom: null, pan: { x: 0, y: 0 } }),
    relativeLuminance: base?.relativeLuminance ?? false
  })
}

useWorkspace.subscribe(synchronizeProjectReferences)
synchronizeProjectReferences()

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
  const pixels = new Uint8ClampedArray(data)
  context.putImageData(new ImageData(pixels, width, height), 0, 0)
  useReferenceImages.getState().add(canvas, windowId, pixels)
}
