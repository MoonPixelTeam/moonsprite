import { useEffect, useState } from 'react'
import { decodeDocumentFileAsync } from '@/core/document-files'
import { useWorkspace, type DocumentSession } from '@/store/workspace'

interface Options {
  session: DocumentSession
  timeline: import('@shared/types-animation').AnimationTimeline
}

export function timelineGifDropIndex(target: Element | null, x: number, frameCount: number): number | null {
  const grid = target?.closest<HTMLElement>('.layer-animation-grid')
  if (!grid) return null
  const frameTarget = target?.closest<HTMLElement>('[data-frame-index]')
  let index = frameTarget ? Number(frameTarget.dataset.frameIndex) + 1 : NaN
  if (!Number.isInteger(index)) {
    const firstFrame = grid.querySelector<HTMLElement>('[data-frame-index]')
    const width = firstFrame?.getBoundingClientRect().width ?? grid.getBoundingClientRect().width / Math.max(1, frameCount)
    index = Math.ceil((x - grid.getBoundingClientRect().left) / Math.max(1, width))
  }
  return Math.max(0, Math.min(frameCount, index))
}

export function useTimelineFileDrop({ session, timeline }: Options) {
  useEffect(() => {
    const handleGifDrop = (event: Event): void => {
      const detail = (event as CustomEvent<{ documentId?: string; path?: string; x?: number; y?: number }>).detail
      if (!detail?.documentId || detail.documentId !== session.document.id || !detail.path || !/\.gif$/i.test(detail.path)) return
      if (!Number.isFinite(detail.x) || !Number.isFinite(detail.y)) return
      const target = globalThis.document.elementFromPoint(detail.x!, detail.y!)
      const dropzone = target?.closest<HTMLElement>('.layer-animation-grid')
      if (!dropzone) return
      const liveSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
      const liveTimeline = liveSession?.document.animation
      if (!liveSession || !liveTimeline) return
      const startFrameIndex = timelineGifDropIndex(target, detail.x!, liveTimeline.frames.length)
      if (startFrameIndex === null) return
      void (async () => {
        try {
          const bytes = await window.moonSprite.readBinary(detail.path!)
          const source = await decodeDocumentFileAsync(bytes, detail.path!)
          if (!source.animation?.frames.length) throw new Error('GIF 没有可导入的动画帧。')
          const state = useWorkspace.getState()
          if (state.activeId !== session.document.id) return
          state.importGifAnimationLayer(source, startFrameIndex)
        } catch (error) {
          useWorkspace.getState().setMessage(error instanceof Error ? error.message : '无法导入 GIF。')
        }
      })()
    }
    window.addEventListener('moonsprite:animation-gif-drop', handleGifDrop)
    return () => window.removeEventListener('moonsprite:animation-gif-drop', handleGifDrop)
  }, [session.document.id])

  const [gifDropTargetIndex, setGifDropTargetIndex] = useState<number | null>(null)

  useEffect(() => {
    const isGifFileDrag = (event: DragEvent): boolean => {
      const items = Array.from(event.dataTransfer?.items ?? [])
      const hasFile = items.some((item) => item.kind === 'file') || event.dataTransfer?.types.includes('Files') === true
      if (!hasFile) return false
      const names = Array.from(event.dataTransfer?.files ?? [])
        .map((file) => file.name)
        .filter(Boolean)
      return names.length === 0 || names.every((name) => /\.gif$/i.test(name))
    }
    const isGifPathDrag = (paths: readonly string[]): boolean => paths.length > 0 && paths.every((path) => /\.gif$/i.test(path))
    const clearGifDropPreview = (): void => setGifDropTargetIndex(null)
    const updateGifDropAtPoint = (x: number, y: number, isGif: boolean): void => {
      if (useWorkspace.getState().activeId !== session.document.id || !isGif) {
        clearGifDropPreview()
        return
      }
      const target = globalThis.document.elementFromPoint(x, y)
      const grid = target?.closest<HTMLElement>('.layer-animation-grid')
      if (!grid) {
        clearGifDropPreview()
        return
      }
      setGifDropTargetIndex(timelineGifDropIndex(target, x, timeline.frames.length))
    }
    const updateGifDropPreview = (event: DragEvent): void => {
      if (!isGifFileDrag(event)) {
        clearGifDropPreview()
        return
      }
      updateGifDropAtPoint(event.clientX, event.clientY, true)
      event.preventDefault()
    }
    const updateNativeGifDropPreview = (event: Event): void => {
      const detail = (event as CustomEvent<{ paths?: string[]; x?: number; y?: number; documentId?: string }>).detail
      if (!detail?.paths || detail.documentId !== session.document.id || !Number.isFinite(detail.x) || !Number.isFinite(detail.y)) {
        clearGifDropPreview()
        return
      }
      updateGifDropAtPoint(detail.x!, detail.y!, isGifPathDrag(detail.paths))
    }
    window.addEventListener('dragover', updateGifDropPreview, true)
    window.addEventListener('drop', clearGifDropPreview, true)
    window.addEventListener('dragend', clearGifDropPreview, true)
    window.addEventListener('moonsprite:document-drag-over', updateNativeGifDropPreview)
    window.addEventListener('moonsprite:document-drag-leave', clearGifDropPreview)
    return () => {
      window.removeEventListener('dragover', updateGifDropPreview, true)
      window.removeEventListener('drop', clearGifDropPreview, true)
      window.removeEventListener('dragend', clearGifDropPreview, true)
      window.removeEventListener('moonsprite:document-drag-over', updateNativeGifDropPreview)
      window.removeEventListener('moonsprite:document-drag-leave', clearGifDropPreview)
    }
  }, [session.document.id, timeline.frames.length])
  return { gifDropTargetIndex }
}
