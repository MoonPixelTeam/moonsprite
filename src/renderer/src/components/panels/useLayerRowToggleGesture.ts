import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'

export type LayerRowToggleControl = 'visibility' | 'lock' | 'auto-link' | 'group-expand'

interface LayerRowToggleGesture<TTarget extends { control: LayerRowToggleControl }> {
  control: TTarget['control']
  startKey: string
  value: boolean
  originals: Map<string, { target: TTarget; value: boolean }>
}
interface LayerRowToggleSolo<TTarget extends { control: LayerRowToggleControl }> {
  control: TTarget['control']
  targetKey: string
  originals: Map<string, { target: TTarget; value: boolean }>
}

export function useLayerRowToggleGesture<TTarget extends { control: LayerRowToggleControl }>({
  targetKey,
  readValue,
  applyValue,
  visibleTargets,
  altTargets,
  ctrlTargets,
  soloTargets,
  beginTransaction,
  commitTransaction,
  blocked
}: {
  targetKey: (target: TTarget) => string
  readValue: (target: TTarget) => boolean | null
  applyValue: (target: TTarget, value: boolean) => void
  visibleTargets: (control: TTarget['control']) => readonly TTarget[]
  altTargets?: (target: TTarget) => readonly TTarget[] | null
  ctrlTargets?: (target: TTarget) => readonly TTarget[] | null
  soloTargets?: (target: TTarget) => readonly TTarget[] | null
  beginTransaction: () => void
  commitTransaction: (control: TTarget['control']) => void
  blocked?: (message: string) => void
}) {
  const gestureRef = useRef<LayerRowToggleGesture<TTarget> | null>(null)
  const soloRef = useRef(new Map<TTarget['control'], LayerRowToggleSolo<TTarget>>())
  const callbacksRef = useRef({ targetKey, readValue, applyValue, visibleTargets, altTargets, ctrlTargets, soloTargets, beginTransaction, commitTransaction, blocked })
  callbacksRef.current = { targetKey, readValue, applyValue, visibleTargets, altTargets, ctrlTargets, soloTargets, beginTransaction, commitTransaction, blocked }

  const updateRange = (target: TTarget): void => {
    const gesture = gestureRef.current
    if (!gesture || gesture.control !== target.control) return
    const callbacks = callbacksRef.current
    const targets = callbacks.visibleTargets(gesture.control)
    const startIndex = targets.findIndex((candidate) => callbacks.targetKey(candidate) === gesture.startKey)
    const targetIndex = targets.findIndex((candidate) => callbacks.targetKey(candidate) === callbacks.targetKey(target))
    if (startIndex < 0 || targetIndex < 0) return
    const from = Math.min(startIndex, targetIndex)
    const to = Math.max(startIndex, targetIndex)
    const activeKeys = new Set(targets.slice(from, to + 1).map(callbacks.targetKey))
    for (const candidate of targets.slice(from, to + 1)) {
      const key = callbacks.targetKey(candidate)
      if (gesture.originals.has(key)) continue
      const originalValue = callbacks.readValue(candidate)
      if (originalValue !== null) gesture.originals.set(key, { target: candidate, value: originalValue })
    }
    for (const [key, original] of gesture.originals) callbacks.applyValue(original.target, activeKeys.has(key) ? gesture.value : original.value)
  }

  const finish = useCallback((): void => {
    const gesture = gestureRef.current
    if (!gesture) return
    gestureRef.current = null
    callbacksRef.current.commitTransaction(gesture.control)
  }, [])

  const begin = (event: ReactPointerEvent<HTMLElement>, target: TTarget, currentValue: boolean, blockedMessage?: string): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    if (blockedMessage && target.control !== 'lock') {
      callbacksRef.current.blocked?.(blockedMessage)
      return
    }
    finish()
    const callbacks = callbacksRef.current
    const value = !currentValue
    const targets = event.ctrlKey ? callbacks.ctrlTargets?.(target) : null
    if (event.altKey && callbacks.soloTargets) {
      const soloTargets = callbacks.soloTargets(target)
      if (soloTargets) {
        callbacks.beginTransaction()
        const currentSolo = soloRef.current.get(target.control)
        const targetKey = callbacks.targetKey(target)
        if (currentSolo && currentSolo.control === target.control && currentSolo.targetKey === targetKey) {
          for (const original of currentSolo.originals.values()) callbacks.applyValue(original.target, original.value)
          soloRef.current.delete(target.control)
        } else {
          if (currentSolo && currentSolo.control === target.control) {
            for (const original of currentSolo.originals.values()) callbacks.applyValue(original.target, original.value)
          }
          const originals = new Map<string, { target: TTarget; value: boolean }>()
          for (const candidate of soloTargets) {
            const value = callbacks.readValue(candidate)
            if (value !== null) originals.set(callbacks.targetKey(candidate), { target: candidate, value })
          }
          for (const candidate of soloTargets) callbacks.applyValue(candidate, callbacks.targetKey(candidate) === targetKey)
          soloRef.current.set(target.control, { control: target.control, targetKey, originals })
        }
        callbacks.commitTransaction(target.control)
        return
      }
    }
    if (targets) {
      callbacks.beginTransaction()
      for (const candidate of targets) callbacks.applyValue(candidate, value)
      callbacks.commitTransaction(target.control)
      return
    }
    callbacks.beginTransaction()
    gestureRef.current = { control: target.control, startKey: callbacks.targetKey(target), value, originals: new Map() }
    updateRange(target)
  }

  const enter = (event: ReactPointerEvent<HTMLElement>, target: TTarget): void => {
    const gesture = gestureRef.current
    if (!gesture || gesture.control !== target.control) return
    if ((event.buttons & 1) === 0) {
      finish()
      return
    }
    updateRange(target)
  }

  const end = (event: ReactPointerEvent<HTMLElement>): void => {
    event.stopPropagation()
    finish()
  }

  const click = (event: ReactMouseEvent<HTMLElement>): void => {
    event.stopPropagation()
    finish()
  }

  useEffect(() => {
    const pointerFinish = (): void => finish()
    window.addEventListener('pointerup', pointerFinish)
    window.addEventListener('pointercancel', pointerFinish)
    window.addEventListener('blur', pointerFinish)
    return () => {
      window.removeEventListener('pointerup', pointerFinish)
      window.removeEventListener('pointercancel', pointerFinish)
      window.removeEventListener('blur', pointerFinish)
      finish()
    }
  }, [finish])

  return { begin, enter, end, click, finish }
}
