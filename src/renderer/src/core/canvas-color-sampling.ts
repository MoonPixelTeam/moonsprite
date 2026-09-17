import type { RgbaColor } from '@shared/types-color'

export interface CanvasColorSamplingSurface {
  canvas: HTMLCanvasElement
  sampleAtClientPoint: (clientX: number, clientY: number) => RgbaColor | null
  setSamplingCursor: (active: boolean) => void
}

interface ActiveCanvasColorSampling {
  sourceCanvas: HTMLCanvasElement
  pointerId: number
  onSample: (color: RgbaColor, clientX: number, clientY: number) => void
  currentSurface: CanvasColorSamplingSurface | null
}

interface CanvasColorSamplingIntent {
  sourceCanvas: HTMLCanvasElement
  onSample: (color: RgbaColor, clientX: number, clientY: number, secondary: boolean) => void
}

const surfaces = new Set<CanvasColorSamplingSurface>()
let activeSampling: ActiveCanvasColorSampling | null = null
let samplingIntent: CanvasColorSamplingIntent | null = null

export const registerCanvasColorSamplingSurface = (surface: CanvasColorSamplingSurface): (() => void) => {
  surfaces.add(surface)
  if (samplingIntent) surface.setSamplingCursor(true)
  return () => {
    surfaces.delete(surface)
    if (activeSampling?.currentSurface === surface) {
      surface.setSamplingCursor(false)
      activeSampling.currentSurface = null
    }
    if (activeSampling?.sourceCanvas === surface.canvas) activeSampling = null
  }
}

export const beginCanvasColorSampling = (sampling: Omit<ActiveCanvasColorSampling, 'currentSurface'>): void => {
  if (activeSampling) endCanvasColorSampling()
  activeSampling = { ...sampling, currentSurface: null }
  const source = [...surfaces].find((surface) => surface.canvas === sampling.sourceCanvas)
  source?.setSamplingCursor(true)
}

export const setCanvasColorSamplingIntent = (intent: CanvasColorSamplingIntent | null): void => {
  if (intent) {
    samplingIntent = intent
    for (const surface of surfaces) surface.setSamplingCursor(true)
    return
  }
  samplingIntent = null
  if (!activeSampling) for (const surface of surfaces) surface.setSamplingCursor(false)
}

export const clearCanvasColorSamplingIntentFor = (sourceCanvas: HTMLCanvasElement): void => {
  if (samplingIntent?.sourceCanvas === sourceCanvas) setCanvasColorSamplingIntent(null)
}

export const canvasColorSamplingIntentActive = (): boolean => samplingIntent !== null

export const endCanvasColorSampling = (pointerId?: number): void => {
  if (!activeSampling || (pointerId !== undefined && activeSampling.pointerId !== pointerId)) return
  activeSampling.currentSurface?.setSamplingCursor(false)
  const source = [...surfaces].find((surface) => surface.canvas === activeSampling?.sourceCanvas)
  source?.setSamplingCursor(false)
  activeSampling = null
}

export const canvasColorSamplingActiveFor = (canvas: HTMLCanvasElement | null): boolean =>
  Boolean(canvas && activeSampling?.sourceCanvas === canvas)

const canvasAtClientPoint = (clientX: number, clientY: number): HTMLCanvasElement | null => {
  const elements = document.elementsFromPoint?.(clientX, clientY) ?? []
  for (const element of elements) {
    if (element instanceof HTMLCanvasElement && element.classList.contains('stage-canvas')) return element
  }
  const element = document.elementFromPoint(clientX, clientY)
  return element instanceof HTMLCanvasElement && element.classList.contains('stage-canvas') ? element : null
}

/** Samples a registered editor canvas without changing the active canvas tool. */
export const sampleCanvasColorAtClientPoint = (clientX: number, clientY: number): RgbaColor | null => {
  const canvas = canvasAtClientPoint(clientX, clientY)
  if (!canvas) return null
  const surface = [...surfaces].find((candidate) => candidate.canvas === canvas)
  return surface?.sampleAtClientPoint(clientX, clientY) ?? null
}

export const routeCanvasColorSamplingIntent = (clientX: number, clientY: number, secondary: boolean): boolean => {
  if (!samplingIntent) return false
  const canvas = canvasAtClientPoint(clientX, clientY)
  if (!canvas || canvas === samplingIntent.sourceCanvas) return false
  const surface = [...surfaces].find((candidate) => candidate.canvas === canvas)
  if (!surface) return false
  const color = surface.sampleAtClientPoint(clientX, clientY)
  if (color) samplingIntent.onSample({ ...color }, clientX, clientY, secondary)
  return true
}

/** Routes a captured pointer's sample to the stage currently under the cursor. */
export const routeCanvasColorSampling = (clientX: number, clientY: number): boolean => {
  if (!activeSampling) return false
  const canvas = canvasAtClientPoint(clientX, clientY)
  if (!canvas || canvas === activeSampling.sourceCanvas) return false
  const surface = [...surfaces].find((candidate) => candidate.canvas === canvas)
  if (!surface) return false
  if (activeSampling.currentSurface !== surface) {
    activeSampling.currentSurface?.setSamplingCursor(false)
    activeSampling.currentSurface = surface
    surface.setSamplingCursor(true)
  }
  const color = surface.sampleAtClientPoint(clientX, clientY)
  if (color) activeSampling.onSample({ ...color }, clientX, clientY)
  return true
}
