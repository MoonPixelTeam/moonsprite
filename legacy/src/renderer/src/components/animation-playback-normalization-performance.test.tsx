import { performance as timing } from 'node:perf_hooks'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as animation from '@/core/animation'
import { createDocument, createSparseLayer } from '@/core/document-model'
import { compositeRegion } from '@/core/document-composite-region'
import { DocumentCompositeCache } from '@/core/document-composite-cache'
import { createDefaultLayerStyles } from '@/core/layer-styles'
import { useWorkspace } from '@/store/workspace'
import { useAnimationPlaybackClock } from './useAnimationPlaybackClock'
import { useAnimationPlaybackClock as usePrecedingClock } from './__fixtures__/useAnimationPlaybackClock-reference'

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

const CurrentClock = ({ id }: { id: string }) => { useAnimationPlaybackClock(id); return null }
const PrecedingClock = ({ id }: { id: string }) => { usePrecedingClock(id); return null }

it('keeps disabled-frame skipping and once-mode completion after an edit during playback', () => {
  const document = createDocument('playback boundaries', 2, 2, 'rgba', false)
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().duplicateAnimationFrame()
  useWorkspace.getState().duplicateAnimationFrame()
  const timeline = document.animation!
  timeline.frames[1].disabled = true
  useWorkspace.getState().setActiveAnimationFrame(timeline.frames[0].id)
  useWorkspace.getState().setAnimationReturnToStart(false)
  useWorkspace.getState().setAnimationPlaybackMode('once')
  useWorkspace.getState().setAnimationPlaying(true)
  const originalCels = timeline.cels
  useWorkspace.getState().advanceAnimationFrame()
  expect(timeline.activeFrameId).toBe(timeline.frames[2].id)
  expect(timeline.cels).toBe(originalCels)
  // Editing boundaries still normalize and create slots before the next tick.
  useWorkspace.getState().addLayer()
  const added = document.layers.find(layer => layer.id === document.activeLayerId)!
  expect(timeline.cels.some(cel => cel.layerId === added.id && cel.frameId === timeline.activeFrameId)).toBe(true)
  useWorkspace.getState().advanceAnimationFrame()
  expect(useWorkspace.getState().sessions[0].animationPlaying).toBe(false)
  // Completed once-mode playback returns to the first playable frame.
  expect(timeline.activeFrameId).toBe(timeline.frames[0].id)
})

it('reduces repeated normalization in real Store/React playback on 4K / 100 layers / 12 frames', () => {
  const background = new Uint8ClampedArray(4096 * 4096 * 4)
  const backgroundWords = new Uint32Array(background.buffer)
  backgroundWords.fill(0xff302010)
  for (let index = 0; index < backgroundWords.length; index += 97) backgroundWords[index] = (0x80302000 | index % 251) >>> 0
  const sprites = Array.from({ length: 99 }, (_, index) => Array.from({ length: 12 }, (_, frame) => {
    const pixels = new Uint8ClampedArray(64 * 64 * 4), words = new Uint32Array(pixels.buffer)
    for (let offset = 0; offset < words.length; offset += 1) words[offset] = (offset + frame + index) % 11 ?
      ((offset % 5 ? 0x80000000 : 0xff000000) | ((offset * 31247 + frame * 197 + index * 113) & 0xffffff)) >>> 0 : 0
    return pixels
  }))
  const fixture = (tag: boolean) => {
    const document = createDocument('large playback normalization', 1, 1, 'rgba', false)
    document.width = 4096; document.height = 4096
    for (let index = 1; index < 100; index += 1) document.layers.push(createSparseLayer(`Layer ${index}`, 'rgba'))
    document.groups = Array.from({ length: 20 }, (_, index) => ({
      id: `group-${index}`, name: `Group ${index}`, parentGroupId: index % 5 ? `group-${index - 1}` : null,
      visible: true, locked: false, opacity: index % 5 ? 1 : 0.8, blendMode: 'normal' as const
    }))
    for (let index = 1; index < 100; index += 1) {
      const layer = document.layers[index]
      layer.groupId = document.groups[index % 20].id
      if (index % 10 === 0) {
        layer.layerStyles = createDefaultLayerStyles()
        layer.layerStyles.stroke = { ...layer.layerStyles.stroke, enabled: true, size: 1 }
        layer.layerStyles.shadow = { ...layer.layerStyles.shadow, enabled: true, blur: 1 }
      }
    }
    const timeline = document.animation!
    timeline.frames = Array.from({ length: 12 }, (_, index) => ({ id: `playback-frame-${index}`, duration: 40 }))
    timeline.activeFrameId = timeline.frames[0].id
    timeline.cels = document.layers.flatMap((layer, index) => timeline.frames.map((frame, frameIndex) => ({
      id: `${layer.id}:${frame.id}`, layerId: layer.id, frameId: frame.id,
      opacity: index === 0 ? 1 : (index % 3 + 1) / 3,
      zIndex: index === 0 ? -100 : (frameIndex + index) % 7 - 3,
      linkedCelId: index > 0 && index % 4 === 0 && frameIndex > 0 ? `${layer.id}:${timeline.frames[0].id}` : null,
      surface: { format: 'rgba' as const, width: index === 0 ? 4096 : 64, height: index === 0 ? 4096 : 64,
        offsetX: index === 0 ? 0 : 1950 + index % 8 * 3 + frameIndex,
        offsetY: index === 0 ? 0 : 1950 + Math.floor(index / 8) % 8 * 3,
        pixels: index === 0 ? background : sprites[index - 1][frameIndex] }
    })))
    animation.refreshActiveAnimationFrame(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setAnimationReturnToStart(false)
    useWorkspace.getState().setAnimationPlaybackMode(tag ? 'tag' : 'all')
    if (tag) useWorkspace.getState().createAnimationLoopSection({ name: 'all frames tag',
      startFrameId: timeline.frames[0].id, endFrameId: timeline.frames[11].id, direction: 'ping-pong', repeatCount: null })
    useWorkspace.getState().setAnimationPlaying(true)
    return document
  }
  const ticks = 48
  const run = (optimized: boolean, tag: boolean, verify = false, onReady?: () => void) => {
    const document = fixture(tag), timeline = document.animation!
    const session = useWorkspace.getState().sessions[0], historyPosition = session.history.position, dirty = document.dirty
    onReady?.()
    const mounted = render(optimized ? <CurrentClock id={document.id} /> : <PrecedingClock id={document.id} />)
    const frames: string[] = [], snapshots: unknown[] = []
    let ms = 0, arrayReplacements = 0
    try {
      for (let tick = 0; tick < ticks; tick += 1) {
        const priorCels = timeline.cels, started = timing.now()
        act(() => {
          // Restore precisely the removed leading normalization for the
          // preceding all/tag command; remaining domain commands are shared.
          if (!optimized) animation.ensureAnimationDocument(document)
          useWorkspace.getState().advanceAnimationFrame()
        })
        ms += timing.now() - started
        arrayReplacements += Number(priorCels !== timeline.cels)
        frames.push(timeline.activeFrameId)
        if (verify && tick < 12) snapshots.push({ frame: timeline.activeFrameId,
          pixels: Array.from(compositeRegion(document, 1960, 1960, 4, 4, new DocumentCompositeCache(), tick + 1)),
          layers: document.layers.map(layer => [layer.width, layer.height, layer.offsetX, layer.offsetY, layer.opacity]) })
      }
      expect(session.history.position).toBe(historyPosition)
      expect(document.dirty).toBe(dirty)
      expect(timeline.cels.length).toBe(1200)
      if (optimized && !tag) expect(arrayReplacements).toBe(0)
      return { ms, frames, arrayReplacements, snapshots }
    } finally { mounted.unmount(); useWorkspace.setState({ sessions: [], activeId: null }) }
  }
  const measurements = []
  for (const tag of [false, true]) {
    const expected = run(false, tag, true), actual = run(true, tag, true)
    expect(actual.frames).toEqual(expected.frames)
    expect(actual.snapshots).toEqual(expected.snapshots)
    const baseline: ReturnType<typeof run>[] = [], optimized: ReturnType<typeof run>[] = []
    for (let index = 0; index < 3; index += 1) {
      if (index % 2) { optimized.push(run(true, tag)); baseline.push(run(false, tag)) }
      else { baseline.push(run(false, tag)); optimized.push(run(true, tag)) }
    }
    for (const sample of [...baseline, ...optimized]) expect(sample.frames).toEqual(expected.frames)
    const median = (samples: ReturnType<typeof run>[]) => samples.map(sample => sample.ms).sort((a, b) => a - b)[1]
    const baselineMedianMs = median(baseline), optimizedMedianMs = median(optimized)
    expect(optimizedMedianMs).toBeLessThan(baselineMedianMs * 0.9)
    // Instrument separately so normalization spy overhead cannot bias timing.
    const normalize = vi.spyOn(animation, 'ensureAnimationDocument')
    run(false, tag, false, () => normalize.mockClear()); const baselineCalls = normalize.mock.calls.length
    run(true, tag, false, () => normalize.mockClear()); const optimizedCalls = normalize.mock.calls.length
    normalize.mockRestore()
    expect(optimizedCalls).toBeLessThan(baselineCalls)
    if (!tag) expect(optimizedCalls).toBe(0)
    measurements.push({ mode: tag ? 'tag ping-pong' : 'all frames', ticksPerSample: ticks,
      samples: { baseline, optimized }, baselineMedianMs, optimizedMedianMs,
      reductionRatio: 1 - optimizedMedianMs / baselineMedianMs,
      normalizationCallsDuringMountedPlayback: { baseline: baselineCalls, optimized: optimizedCalls } })
  }
  mkdirSync(resolve('output'), { recursive: true })
  writeFileSync(resolve('output/animation-playback-normalization-after-20261006.json'), `${JSON.stringify({
    scenario: { canvas: '4096x4096', layers: 100, frames: 12, cels: 1200, groups: 20,
      content: 'dense nonuniform 4K background; distinct partial-alpha sprite frames; links; frame offsets/opacity/z-index; nested opacity groups; stroke/shadow' },
    method: 'real Store advance and mounted React playback clock; warmup and three alternating samples; counts instrumented separately',
    baseline: 'frozen preceding clock plus removed leading normalization restored before the same domain advance command',
    correctness: 'matching frame sequences, 24 exact 4x4 frame composites and 100-layer geometry/opacity snapshots; history/dirty unchanged; disabled and once-mode boundaries checked',
    measurements, scope: 'synchronous Store/React playback update; timer wait and canvas/GPU drawing excluded; no complete frame-p95 claim'
  }, null, 2)}\n`)
}, 60000)
