import { mouseShortcutKey } from '@/core/shortcuts'

interface MouseChord { keys: string[]; target: EventTarget | null }

function pointerActionLabel(keys: readonly string[], target: EventTarget | null, locale: string, canvasSelectsLayer: () => boolean): string | undefined {
  if (!keys.includes('MouseLeft') || !(keys.includes('Control') || keys.includes('Shift'))) return undefined
  const element = target instanceof Element ? target : null
  if (element?.closest('canvas.stage-canvas') && keys.includes('Control') && canvasSelectsLayer()) {
    return locale === 'zh-CN' ? '选择图层' : 'Select layers'
  }
  if (!element?.closest('.layers-panel')) return undefined
  if (element.closest('.layer-animation-cel')) return locale === 'zh-CN' ? '选择动画单元格' : 'Select animation cel'
  if (element.closest('.free-tile-instance-row')) return locale === 'zh-CN' ? '选择实例' : 'Select instance'
  if (element.closest('.layer-row')) return locale === 'zh-CN' ? '选择图层' : 'Select layers'
  return undefined
}

/** Record modifier + mouse gestures after the pointer action completes. */
export function registerCanvasKeyDisplayPointer(options: {
  enabled: boolean
  locale: string
  activeDocument: boolean
  chords: Map<number, MouseChord>
  emit: (keys: string[], contextualLabel?: string) => void
  clearKeyboardGesture: () => void
  canvasSelectsLayer: () => boolean
}): () => void {
  const pointerDown = (event: PointerEvent): void => {
    if (!options.enabled || !options.activeDocument || event.pointerType !== 'mouse' || document.querySelector('.modal-backdrop')) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('input, textarea, select, [contenteditable="true"], [data-shortcut-recorder="true"]')) return
    const mouseKey = mouseShortcutKey(event.button)
    if (!mouseKey || !(event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)) return
    const keys = [event.ctrlKey ? 'Control' : '', event.metaKey ? 'Meta' : '', event.shiftKey ? 'Shift' : '', event.altKey ? 'Alt' : '', mouseKey].filter(Boolean)
    options.chords.set(event.pointerId, { keys, target: event.target })
  }
  const pointerUp = (event: PointerEvent): void => {
    const chord = options.chords.get(event.pointerId)
    options.chords.delete(event.pointerId)
    if (!chord) return
    options.emit(chord.keys, pointerActionLabel(chord.keys, chord.target, options.locale, options.canvasSelectsLayer))
    options.clearKeyboardGesture()
  }
  const pointerCancel = (event: PointerEvent): void => { options.chords.delete(event.pointerId) }
  window.addEventListener('pointerdown', pointerDown, true)
  window.addEventListener('pointerup', pointerUp, true)
  window.addEventListener('pointercancel', pointerCancel)
  return () => {
    window.removeEventListener('pointerdown', pointerDown, true)
    window.removeEventListener('pointerup', pointerUp, true)
    window.removeEventListener('pointercancel', pointerCancel)
  }
}
