import { useEffect, useRef } from 'react'
import { COMMAND_SCOPE_EVENT, type EditorCommandScope } from '@/core/command-context'

export function useAppCommandScope() {
  const commandScopeRef = useRef<EditorCommandScope>('canvas')

  const commandSurfaceRef = useRef<HTMLElement | null>(null)

  const pointerPositionRef = useRef<{ x: number; y: number } | null>(null)

  const selectionCommandOverrideRef = useRef(false)

  useEffect(() => {
    const rememberCommandScope = (event: Event): void => {
      if (event.type === 'pointerdown') {
        selectionCommandOverrideRef.current = false
        const pointer = event as PointerEvent
        pointerPositionRef.current = { x: pointer.clientX, y: pointer.clientY }
      }
      const surface = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-command-scope], .stage-surface')
      const scope = surface?.classList.contains('stage-surface') ? 'canvas' : surface?.dataset.commandScope
      if (scope === 'canvas' || scope === 'layers' || scope === 'palette' || scope === 'tileset' || scope === 'brushes') {
        commandScopeRef.current = scope
        commandSurfaceRef.current = surface ?? null
      }
    }
    const applyCommandScope = (event: Event): void => {
      const detail = (event as CustomEvent<{ scope?: EditorCommandScope; preferSelection?: boolean }>).detail
      const scope = detail?.scope
      if (scope === 'canvas' || scope === 'layers' || scope === 'palette' || scope === 'tileset' || scope === 'brushes') {
        commandScopeRef.current = scope
        commandSurfaceRef.current = null
      }
      selectionCommandOverrideRef.current = detail?.preferSelection === true
    }
    const rememberPointerPosition = (event: PointerEvent): void => {
      pointerPositionRef.current = { x: event.clientX, y: event.clientY }
    }
    window.addEventListener('pointerdown', rememberCommandScope, true)
    window.addEventListener('pointermove', rememberPointerPosition, true)
    window.addEventListener('focusin', rememberCommandScope, true)
    window.addEventListener(COMMAND_SCOPE_EVENT, applyCommandScope)
    return () => {
      window.removeEventListener('pointerdown', rememberCommandScope, true)
      window.removeEventListener('pointermove', rememberPointerPosition, true)
      window.removeEventListener('focusin', rememberCommandScope, true)
      window.removeEventListener(COMMAND_SCOPE_EVENT, applyCommandScope)
    }
  }, [])
  return { commandScopeRef, commandSurfaceRef, pointerPositionRef, selectionCommandOverrideRef }
}
