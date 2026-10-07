import { cleanup, renderHook } from '@testing-library/react'
import { afterAll, bench, describe } from 'vitest'
import { cursorSamplingFixture } from './canvas-cursor-sampling-fixture'
import { useCanvasCursor } from './useCanvasCursor'
import { useWorkspace } from '@/store/workspace'

const fixture = cursorSamplingFixture()
const { result } = renderHook(() => useCanvasCursor(fixture.ports))
afterAll(() => { cleanup(); useWorkspace.setState({ sessions: [], activeId: null }) })

// Isolates cursor CPU work with real 500px/10-layer samplers. This benchmark
// does not measure WebView presentation, GPU contention or meeting capture.
describe('1000 mouse positions / 500px / 10 layers', () => {
  bench('previous sampling work: original composite then replacement', () => {
    for (let x = 0; x < 1000; x++) {
      fixture.ports.cursorCompositePointSamplerFor(fixture.session)(x % 500, 100)
      result.current.updateCursorAt(x, 100, false, false)
    }
  }, { time: 500, iterations: 10 })
  bench('replacement only', () => {
    for (let x = 0; x < 1000; x++) result.current.updateCursorAt(x, 100, false, false)
  }, { time: 500, iterations: 10 })
})
