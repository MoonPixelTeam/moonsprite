import { growFreeTileStrokeRaster } from '@/core/free-tile-stroke-raster'
import { useEffect, useRef } from 'react'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import { animationMaskAt, getLayerContentRevision } from '@/core/document-model'
import { rasterStorageIdentity } from '@/core/runtime-raster'
import { advanceAirbrushClock } from './canvas-airbrush-clock'
import { applyLiquifyHoldStep } from '@/core/liquify'
import { accumulateLiquifyHoldStrength, createLiquifyHoldClock, type LiquifyHoldClock } from '@/components/canvas-liquify-interaction'
import { brushStrokeInvalidationRects, paintBrush } from '@/core/tools-brush'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { LIQUIFY_RESET_COMMAND_EVENT, type LiquifyResetCommandDetail } from '@/core/command-context'
import { activePaintLayer } from '@/store/workspace-session'
import { CanvasInputState, type CanvasDragState as DragState } from '@/core/canvas-input'
import { airbrushParticleSize, generateAirbrushParticles } from '@/core/airbrush'
import { freeTileSourceSnapshotFromEditRaster, type FreeTileSourceEditRaster } from '@/core/free-tile-edit'
interface Ports {
  readonly session: DocumentSession
  readonly paintSelectionForDrag: (drag: DragState) => SelectionMask | null
  readonly symmetryCenter: import('@/core/symmetry').SymmetryCenter
  readonly compositeCacheRef: import('react').RefObject<import('@/components/canvas-composite-cache').CanvasCompositeCache>
  readonly scheduleDraw: () => void
  readonly invalidateCompositeRect: (selection: SelectionRect | null | undefined, layerIds?: readonly string[]) => void
  readonly inputRef: import('react').RefObject<CanvasInputState>
  readonly liveInputSession: () => DocumentSession
  readonly requestDrawRef: import('react').RefObject<() => void>
}

export function useCanvasStrokeClock(ports: Ports) {
  const airbrushFrameRef = useRef<number | null>(null)

  const sprayAirbrushRef = useRef<(drag: DragState) => void>(() => {})

  const liquifyHoldClockRef = useRef<LiquifyHoldClock | null>(null)

  const applyLiquifyHoldRef = useRef<(drag: DragState) => void>(() => {})

  sprayAirbrushRef.current = (drag: DragState): void => {
    if (!drag.edit) return
    const freeTileEdit = Boolean(
      drag.freeTileEditDocument &&
        drag.freeTileEditLayer &&
        drag.freeTileEditOrigin &&
        drag.freeTileSourceId &&
        drag.freeTileSourceBefore &&
        drag.freeTileEditSourceOffset
    )
    if (freeTileEdit) growFreeTileStrokeRaster(drag, drag.last, drag.last, ports.session.airbrushScatterRadius + ports.session.airbrushParticleRadius * 2 + 1)
    const paintDocument = freeTileEdit ? drag.freeTileEditDocument! : ports.session.document
    const paintLayer = freeTileEdit ? drag.freeTileEditLayer! : activePaintLayer(ports.session)
    const storageBefore = rasterStorageIdentity(paintLayer)
    const revisionBefore = getLayerContentRevision(paintLayer)
    const selection = freeTileEdit ? (drag.freeTileEditSelection ?? null) : ports.paintSelectionForDrag(drag)
    const origin = freeTileEdit ? drag.freeTileEditOrigin! : { x: 0, y: 0 }
    const color = drag.color ?? ports.session.primaryColor
    const particleSize = airbrushParticleSize(ports.session.airbrushParticleRadius)
    const particles = generateAirbrushParticles(
      { x: drag.last.x - origin.x, y: drag.last.y - origin.y },
      {
        particleRadius: ports.session.airbrushParticleRadius,
        scatterRadius: ports.session.airbrushScatterRadius,
        density: ports.session.airbrushDensity
      }
    )
    for (const particle of particles) {
      paintBrush(
        paintDocument,
        paintLayer,
        drag.edit,
        particle.x,
        particle.y,
        particleSize,
        color,
        ports.session.airbrushParticleShape,
        selection,
        'solid',
        1,
        null,
        ports.session.brushImageSettings,
        0,
        'paint',
        particle,
        freeTileEdit ? undefined : ports.session.symmetryAxes,
        freeTileEdit ? undefined : ports.symmetryCenter,
        undefined,
        1,
        undefined,
        false,
        undefined,
        freeTileEdit ? 'off' : (ports.session.view.tileRepeatMode ?? 'off'),
        undefined,
        ports.session.airbrushParticleShape === 'round' ? 0 : ports.session.airbrushParticleAngle,
        true,
        'simple'
      )
    }
    // Repeated particles often hit pixels already covered by this stroke.
    // Keep sampling, but avoid recomposition and free-tile copying on no-op batches.
    if (rasterStorageIdentity(paintLayer) === storageBefore && getLayerContentRevision(paintLayer) === revisionBefore) return
    if (freeTileEdit) {
      const sourceEdit: FreeTileSourceEditRaster = {
        document: drag.freeTileEditDocument!,
        layer: drag.freeTileEditLayer!,
        before: drag.freeTileSourceBefore!,
        origin: drag.freeTileEditOrigin!,
        sourceOffset: drag.freeTileEditSourceOffset!,
        instanceTransform: drag.freeTileEditInstanceTransform ?? {},
        transformedSourceBounds: drag.freeTileEditTransformedSourceBounds ?? {
          x: drag.freeTileSourceBefore!.offsetX,
          y: drag.freeTileSourceBefore!.offsetY,
          width: drag.freeTileSourceBefore!.width,
          height: drag.freeTileSourceBefore!.height
        }
      }
      const cropped = freeTileSourceSnapshotFromEditRaster(sourceEdit, drag.edit.dirtyRect)
      if (!useWorkspace.getState().previewFreeTileSource(drag.freeTileSourceId!, cropped.width, cropped.height, cropped.pixels, cropped.offsetX, cropped.offsetY)) return
      ports.scheduleDraw()
      return
    }
    const radius = ports.session.airbrushScatterRadius + ports.session.airbrushParticleRadius
    for (const rect of brushStrokeInvalidationRects(
      drag.last,
      drag.last,
      radius * 2 + 1,
      null,
      ports.session.document.width,
      ports.session.document.height,
      ports.session.symmetryAxes,
      ports.symmetryCenter,
      ports.session.view.tileRepeatMode ?? 'off'
    ))
      ports.invalidateCompositeRect(rect)
    ports.scheduleDraw()
  }

  const stopAirbrushTimer = (): void => {
    if (airbrushFrameRef.current !== null) window.cancelAnimationFrame(airbrushFrameRef.current)
    airbrushFrameRef.current = null
  }

  const scheduleAirbrushTimer = (): void => {
    if (airbrushFrameRef.current !== null) return
    const tick = (now: number): void => {
      airbrushFrameRef.current = null
      const drag = ports.inputRef.current.drag
      if (drag?.kind !== 'airbrush' || !drag.edit) return
      drag.nextAirbrushAt = advanceAirbrushClock(drag.nextAirbrushAt, now, ports.session.airbrushIntervalMs, () => sprayAirbrushRef.current(drag))
      airbrushFrameRef.current = window.requestAnimationFrame(tick)
    }
    airbrushFrameRef.current = window.requestAnimationFrame(tick)
  }

  const stopLiquifyTimer = (): void => {
    liquifyHoldClockRef.current?.stop()
  }

  const scheduleLiquifyTimer = (): void => {
    if (!liquifyHoldClockRef.current)
      liquifyHoldClockRef.current = createLiquifyHoldClock({
        requestFrame: (callback) => window.requestAnimationFrame(callback),
        cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
        now: () => performance.now(),
        shouldRun: () => {
          const drag = ports.inputRef.current.drag
          return drag?.kind === 'liquify' && Boolean(drag.edit)
        },
        onStep: () => {
          const drag = ports.inputRef.current.drag
          if (drag?.kind === 'liquify' && drag.edit) applyLiquifyHoldRef.current(drag)
        }
      })
    liquifyHoldClockRef.current.start()
  }

  applyLiquifyHoldRef.current = (drag) => {
    const current = ports.liveInputSession()
    if ((drag.liquifyMode ?? current.liquifyMode) === 'push') return
    const strength = accumulateLiquifyHoldStrength(0, current.liquifyStrength)
    const timeline = current.document.animation
    const layer = activePaintLayer(current)
    const mask = timeline ? animationMaskAt(timeline, layer.id, timeline.activeFrameId) : null
    const changed = applyLiquifyHoldStep(current.document, layer, drag.edit!, drag.last, {
      mode: drag.liquifyMode ?? current.liquifyMode,
      radius: current.liquifyRadius,
      strength,
      selection: current.selection,
      mask
    })
    if (changed) {
      const radius = Math.max(1, Math.round(current.liquifyRadius))
      const left = Math.max(0, Math.floor(drag.last.x - radius))
      const top = Math.max(0, Math.floor(drag.last.y - radius))
      const right = Math.min(current.document.width - 1, Math.ceil(drag.last.x + radius))
      const bottom = Math.min(current.document.height - 1, Math.ceil(drag.last.y + radius))
      if (right >= left && bottom >= top) ports.invalidateCompositeRect({ x: left, y: top, width: right - left + 1, height: bottom - top + 1 }, [layer.id])
    }
    ports.requestDrawRef.current()
  }

  useEffect(() => {
    const reset = (event: Event): void => {
      const detail = (event as CustomEvent<LiquifyResetCommandDetail>).detail
      if (!detail || detail.documentId !== ports.session.document.id) return
      useWorkspace.getState().resetLiquify()
    }
    window.addEventListener(LIQUIFY_RESET_COMMAND_EVENT, reset)
    return () => window.removeEventListener(LIQUIFY_RESET_COMMAND_EVENT, reset)
  }, [ports.session.document.id])
  useEffect(
    () => () => {
      stopAirbrushTimer()
      stopLiquifyTimer()
    },
    [ports.session.document.id]
  )
  return { sprayAirbrushRef, applyLiquifyHoldRef, stopAirbrushTimer, scheduleAirbrushTimer, stopLiquifyTimer, scheduleLiquifyTimer }
}
