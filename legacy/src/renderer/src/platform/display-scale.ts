import { getCurrentWindow } from '@tauri-apps/api/window'

export type DisplayScaleListener = (scaleFactor: number) => void

const SCALE_EPSILON = 0.000001

const listeners = new Set<DisplayScaleListener>()
let currentScaleFactor: number | null = null
let detection: Promise<number> | null = null
let scaleChangeListener: Promise<void> | null = null

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function normalizeDisplayScaleFactor(scaleFactor: number): number {
  return Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1
}

function scaleFactorsMatch(left: number, right: number): boolean {
  return Math.abs(left - right) <= SCALE_EPSILON
}

function ensureScaleChangeListener(): Promise<void> {
  if (scaleChangeListener) return scaleChangeListener
  const registration = getCurrentWindow().onScaleChanged(({ payload }) => {
    const nextScaleFactor = normalizeDisplayScaleFactor(payload.scaleFactor)
    if (currentScaleFactor !== null && scaleFactorsMatch(currentScaleFactor, nextScaleFactor)) return
    currentScaleFactor = nextScaleFactor
    for (const listener of listeners) listener(nextScaleFactor)
  }).then(() => undefined)
  scaleChangeListener = registration
  void registration.catch(() => {
    if (scaleChangeListener === registration) scaleChangeListener = null
  })
  return registration
}

function detectDisplayScaleFactor(): Promise<number> {
  if (currentScaleFactor !== null) return Promise.resolve(currentScaleFactor)
  if (detection) return detection
  const pending = getCurrentWindow().scaleFactor().then((scaleFactor) => {
    if (currentScaleFactor === null) currentScaleFactor = normalizeDisplayScaleFactor(scaleFactor)
    return currentScaleFactor
  })
  detection = pending
  void pending.finally(() => {
    if (detection === pending) detection = null
  }).catch(() => undefined)
  return pending
}

export async function observeDisplayScaleFactor(listener: DisplayScaleListener): Promise<number> {
  if (!isTauriRuntime()) return 1
  listeners.add(listener)
  const listenerReady = ensureScaleChangeListener()
  const scaleFactor = await detectDisplayScaleFactor()
  await listenerReady.catch(() => undefined)
  return scaleFactor
}
