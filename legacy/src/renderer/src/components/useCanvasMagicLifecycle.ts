import { registerCanvasKeyboard } from './canvas-keyboard-router'
import { useEffect, useRef } from 'react'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { CanvasInputState, type CanvasDragState as DragState } from '@/core/canvas-input'
import { MagicWandWorkerClient } from '@/core/magic-wand-worker'
import { CanvasMagicPreviewFlash } from './canvas-magic-preview-flash'
interface Ports {
  readonly session: DocumentSession
  readonly inputRef: import('react').RefObject<CanvasInputState>
  readonly commitPolygonShape: () => void
  readonly commitCurveShape: () => void
  readonly commitPolygonLasso: () => void
  readonly scheduleDraw: () => void
}

export function useCanvasMagicLifecycle(ports: Ports) {
  const magicGestureRef = useRef<{ cancel: (redraw?: boolean) => void; drag: DragState } | null>(null)

  const magicWandWorkerRef = useRef<MagicWandWorkerClient | null>(null)
  const magicPreviewFlashRef = useRef<CanvasMagicPreviewFlash | null>(null)
  const magicPreviewFlash = magicPreviewFlashRef.current ??= new CanvasMagicPreviewFlash(() => ports.scheduleDraw())

  useEffect(
    () => {
      const unsubscribe = useWorkspace.subscribe(() => magicPreviewFlash.validate())
      return () => {
        unsubscribe()
        magicPreviewFlash.clear(false)
        magicGestureRef.current?.cancel(false)
        magicWandWorkerRef.current?.dispose()
        magicWandWorkerRef.current = null
      }
    },
    []
  )

  useEffect(() => {
    if (ports.session.tool !== 'selection' || ports.session.selectionKind !== 'magic') return
    magicWandWorkerRef.current ??= new MagicWandWorkerClient()
    // Start the thread when choosing the tool, without copying any image data.
    magicWandWorkerRef.current.start()
  }, [ports.session.tool, ports.session.selectionKind])

  useEffect(() => {
    const keyDown = (event: KeyboardEvent): void => {
      const magic = magicGestureRef.current
      if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd')) {
        magic?.cancel()
        magicPreviewFlash.clear()
      }
      if (magic && event.key === 'Enter') {
        if (ports.inputRef.current.drag === magic.drag) ports.inputRef.current.finish()
        magic.drag.magicRelease?.()
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      const drag = ports.inputRef.current.drag
      if (drag?.kind !== 'polygon-lasso' && drag?.kind !== 'polygon-shape' && drag?.kind !== 'curve-shape') return
      if (event.key === 'Enter') {
        if (drag.kind === 'polygon-shape') ports.commitPolygonShape()
        else if (drag.kind === 'curve-shape') ports.commitCurveShape()
        else ports.commitPolygonLasso()
      } else if (event.key === 'Escape') {
        ports.inputRef.current.finish()
        ports.scheduleDraw()
      } else return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    return registerCanvasKeyboard({ isActive: () => useWorkspace.getState().activeId === ports.session.document.id, keyDown })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ports.session.document.id, ports.session.selectionMode])
  return { magicGestureRef, magicWandWorkerRef, magicPreviewFlash }
}
