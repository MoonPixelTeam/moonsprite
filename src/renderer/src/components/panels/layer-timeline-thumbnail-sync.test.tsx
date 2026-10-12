import {act, cleanup, renderHook} from '@testing-library/react'
import {afterEach, expect, it, vi} from 'vitest'
import {createDocument, createLayer} from '@/core/document-model'
import {activateAnimationFrame, animationCelAt, ensureAnimationDocument, resolveAnimationCel} from '@/core/animation'
import {beginPixelEdit, recordPixel} from '@/core/history'
import {registerAnimationCelThumbnailPreviewListener} from '@/core/canvas-preview-lifecycle'
import {useWorkspace} from '@/store/workspace'
import {useTimelineThumbnailContentSync} from './layer-timeline-thumbnails'

afterEach(() => {cleanup(); vi.restoreAllMocks(); useWorkspace.setState({sessions: [], activeId: null})})

it('notifies the linked source thumbnail without rebuilding all 12474 cel indexes per stroke', () => {
  const document = createDocument('thumbnail sync', 2, 2, 'rgba')
  document.layers.push(...Array.from({length: 41}, () => createLayer('layer', 2, 2, 'rgba')))
  document.animation!.frames = Array.from({length: 297}, (_, i) => ({id: `f${i}`, duration: 100}))
  ensureAnimationDocument(document)
  const layer = document.layers[0], timeline = document.animation!
  const source = animationCelAt(timeline, layer.id, 'f0')!
  animationCelAt(timeline, layer.id, 'f50')!.linkedCelId = source.id
  activateAnimationFrame(document, 'f50', false, false)
  useWorkspace.getState().addSession(document)
  const live = document.animation!
  const liveSource = resolveAnimationCel(live, animationCelAt(live, layer.id, 'f50'))!
  const notify = vi.fn(), unregister = registerAnimationCelThumbnailPreviewListener(document.id, notify)
  const hook = renderHook(() => useTimelineThumbnailContentSync(document.id))
  const map = vi.spyOn(live.cels, 'map')
  try {
    for (let i = 0; i < 20; i++) act(() => {
      const edit = beginPixelEdit(layer.id)
      recordPixel(document, layer, edit, 0, 0xff000040 + i)
      expect(useWorkspace.getState().commitPixelEdit(edit, 'stroke')).toBeTruthy()
    })
    expect(notify).toHaveBeenCalledTimes(20)
    for (const args of notify.mock.calls) expect(args).toEqual([liveSource.id, layer.id])
    expect(map).not.toHaveBeenCalled()
    act(() => useWorkspace.getState().setView({zoom: 3}))
    expect(notify).toHaveBeenCalledTimes(20)
  } finally {hook.unmount(); unregister()}
})
