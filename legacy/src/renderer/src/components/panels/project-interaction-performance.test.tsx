import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { Session } from 'node:inspector'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { decodeProject } from '@/core/project-format'
import { useWorkspace } from '@/store/workspace'
import { layersPanelRenderKey } from '@/core/panel-render-keys'
import { compositeRegion } from '@/core/document'
import * as animation from '@/core/animation'
import { runtimeRasterResidentBytes } from '@/core/runtime-raster'
import { LayersPanel } from './LayersPanel'

it.skipIf(!process.env.MOONSPRITE_PERFORMANCE_PROJECT)('measures supplied project interactions without modifying its file', { timeout: 90000 }, () => {
  const document = decodeProject(new Uint8Array(readFileSync(process.env.MOONSPRITE_PERFORMANCE_PROJECT!)))
  const timeline = document.animation!, lookup = animation.createAnimationCelLookup(timeline)
  const populated = timeline.cels.filter(cel => animation.animationCelHasContent(lookup.resolve(cel), document.palette)).length
  useWorkspace.getState().addSession(document)
  const session = useWorkspace.getState().sessions[0]
  function Panel() {
    useWorkspace(state => layersPanelRenderKey(state.sessions[0]))
    return <LayersPanel session={useWorkspace.getState().sessions[0]} docked />
  }
  const sample = (fn: (index: number) => void, count: number) => {
    const times: number[] = []
    for (let index = 0; index < count; index++) { const start = performance.now(); fn(index); times.push(performance.now() - start) }
    times.sort((a, b) => a - b)
    return { median: times[Math.floor(times.length / 2)], p95: times[Math.min(times.length - 1, Math.floor(times.length * .95))] }
  }
  const renderKey = sample(() => { layersPanelRenderKey(session) }, 100)
  const composite = sample(index => { animation.activateAnimationFrame(document, timeline.frames[index].id, false, false); compositeRegion(document, 0, 0, document.width, document.height) }, 30)
  vi.useFakeTimers()
  const start = performance.now(), view = render(<Panel />), mountMs = performance.now() - start
  const profiler = process.env.MOONSPRITE_PERFORMANCE_PROFILE ? new Session() : null
  profiler?.connect(); profiler?.post('Profiler.enable'); profiler?.post('Profiler.start')
  const normalize = vi.spyOn(animation, 'ensureAnimationDocument')
  const clicks = sample(index => act(() => useWorkspace.getState().selectAnimationCell(animation.animationCelKey(document.layers[0].id, timeline.frames[index + 40].id))), 12)
  const clickNormalizationCalls = normalize.mock.calls.length
  normalize.mockClear()
  const list = view.container.querySelector<HTMLElement>('.layer-animation-list')!
  const scroll = sample(index => act(() => { list.scrollLeft = index * 34 * 10; fireEvent.scroll(list); vi.advanceTimersByTime(17) }), 12)
  act(() => useWorkspace.getState().setAnimationPlaying(true))
  const playback = sample(() => act(() => useWorkspace.getState().advanceAnimationFrame()), 12)
  profiler?.post('Profiler.stop', (_error, result) => writeFileSync('output/airattack-20261007/interactions.cpuprofile', JSON.stringify(result.profile)))
  profiler?.disconnect()
  const data = { dimensions: [document.width, document.height], layers: document.layers.length, frames: timeline.frames.length,
    cels: timeline.cels.length, populated, empty: timeline.cels.length - populated, residentBytes: runtimeRasterResidentBytes(document),
    mountMs, mountedCells: view.container.querySelectorAll('.layer-animation-cel').length, renderKey, composite, clicks, scroll, playback, clickNormalizationCalls }
  mkdirSync('output/airattack-20261007', { recursive: true })
  writeFileSync(`output/airattack-20261007/${process.env.MOONSPRITE_PERFORMANCE_PHASE ?? 'measurement'}.json`, JSON.stringify(data, null, 2))
  process.stdout.write(JSON.stringify(data) + '\n')
  expect(populated + data.empty).toBe(timeline.cels.length)
  cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); useWorkspace.setState({ sessions: [], activeId: null })
})
